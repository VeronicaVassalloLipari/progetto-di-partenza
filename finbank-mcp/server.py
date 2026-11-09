"""finbank-mcp - server MCP read-only sul LipariBank.

Tre tool:
  * get_account_balance       - legge il saldo reale di un conto;
  * list_account_movements    - legge i movimenti con un tetto lato server;
  * simulate_transfer_what_if - simula un trasferimento con i saldi prima/dopo.

Due resource:
  * finbank://policies/aml       - la policy antiriciclaggio, letta da file;
  * finbank://policies/transfers - le regole applicate dalla simulazione.

Un prompt:
  * review_movements_with_real_data - come usare i dati reali durante una review.

Il server non espone alcun tool che muova denaro. Tutte le chiamate al backend
sono GET, tranne il login iniziale. Se il backend non collabora, il server
restituisce un errore esplicito: non inventa un saldo, non restituisce un vuoto
e non usa un valore predefinito.
"""

from __future__ import annotations

import base64
import json
import os
import threading
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Annotated, Any

import httpx
from fastmcp import FastMCP
from fastmcp.exceptions import ResourceError, ToolError
from pydantic import Field

# ---------------------------------------------------------------------------
# Configurazione
# ---------------------------------------------------------------------------

def _env_or(name: str, default: str) -> str:
    """Legge una variabile d'ambiente, ma non tratta un placeholder come valore.

    Claude Code passa ``${FINBANK_USERNAME}`` e OpenCode passa
    ``{env:FINBANK_USERNAME}``. Se il client non espande la variabile, il
    server non deve provare a fare login con la stringa letterale: in locale
    usa il default demo, altrove fallisce con un 401 esplicito.
    """
    value = (os.getenv(name) or "").strip()
    if not value or value.startswith("${") or value.startswith("{env:"):
        return default
    return value


BASE_URL = _env_or("FINBANK_BASE_URL", "http://localhost:8080").rstrip("/")
HTTP_TIMEOUT = float(os.getenv("FINBANK_HTTP_TIMEOUT") or "5.0")

# Credenziali del client verso il LipariBank. In locale il seed del backend ha
# alice/alice123; in ogni altro ambiente vanno passate da variabili d'ambiente.
USERNAME = _env_or("FINBANK_USERNAME", "alice")
PASSWORD = _env_or("FINBANK_PASSWORD", "alice123")

MAX_MOVEMENTS = int(os.getenv("FINBANK_MAX_MOVEMENTS") or "20")
DEFAULT_MOVEMENTS = int(os.getenv("FINBANK_DEFAULT_MOVEMENTS") or "10")
MAX_TRANSFER_AMOUNT = Decimal(os.getenv("FINBANK_MAX_TRANSFER_AMOUNT") or "1000000.00")

SERVER_DIR = Path(__file__).resolve().parent
REPO_ROOT = SERVER_DIR.parent
AML_POLICY_PATH = Path(
    os.getenv("FINBANK_AML_POLICY_PATH")
    or str(REPO_ROOT / ".opencode" / "skills" / "lipari-aml-policy" / "SKILL.md")
)
TRANSFER_POLICY_PATH = SERVER_DIR / "policies" / "transfer-rules.md"

mcp = FastMCP(
    "finbank-mcp",
    instructions=(
        "Server read-only sul LipariBank. Usa i tool per leggere saldi e "
        "movimenti reali e per simulare un trasferimento. Le resource "
        "finbank://policies/aml e finbank://policies/transfers sono le fonti "
        "da citare. Non esiste alcun tool che muova denaro."
    ),
)


# ---------------------------------------------------------------------------
# Errori e client HTTP
# ---------------------------------------------------------------------------


class BackendFailure(Exception):
    """Errore esplicito del backend, senza risultati inventati."""

    def __init__(self, message: str, *, kind: str = "backend", status: int | None = None):
        super().__init__(message)
        self.message = message
        self.kind = kind
        self.status = status


def _safe_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return ""
    if isinstance(payload, dict):
        message = payload.get("message") or payload.get("error")
        if isinstance(message, str) and message.strip():
            return f": {message.strip()}"
    return ""


class LipariBankClient:
    """Client con login pigro, token in memoria e rinnovo su scadenza/401."""

    def __init__(self) -> None:
        self._client = httpx.Client(base_url=BASE_URL, timeout=HTTP_TIMEOUT)
        self._token: str | None = None
        self._token_expires_at: float = 0.0
        self._lock = threading.Lock()

    def close(self) -> None:
        self._client.close()

    def _login(self) -> str:
        try:
            response = self._client.post(
                "/api/auth/login",
                json={"username": USERNAME, "password": PASSWORD},
            )
        except httpx.TimeoutException as exc:
            raise BackendFailure(
                f"Login al backend scaduto dopo {HTTP_TIMEOUT}s",
                kind="timeout",
            ) from exc
        except httpx.ConnectError as exc:
            raise BackendFailure(
                f"Backend LipariBank irraggiungibile su {BASE_URL}",
                kind="unreachable",
            ) from exc
        except httpx.HTTPError as exc:
            raise BackendFailure(
                f"Errore di trasporto durante il login: {type(exc).__name__}",
                kind="transport",
            ) from exc

        if response.status_code == 401:
            raise BackendFailure(
                "Credenziali del server rifiutate dal LipariBank (HTTP 401). "
                "Controlla FINBANK_USERNAME e FINBANK_PASSWORD.",
                kind="auth",
                status=401,
            )
        if response.status_code >= 400:
            raise BackendFailure(
                f"Login rifiutato dal backend (HTTP {response.status_code}){_safe_detail(response)}",
                kind="auth",
                status=response.status_code,
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise BackendFailure(
                "Il login ha restituito un corpo non JSON",
                kind="invalid_response",
            ) from exc

        token = payload.get("token") if isinstance(payload, dict) else None
        if not isinstance(token, str) or not token:
            raise BackendFailure(
                "Il login non ha restituito il campo token",
                kind="invalid_response",
            )
        return token

    @staticmethod
    def _jwt_expiry(token: str) -> float:
        """Legge exp dal payload JWT senza verificare la firma (gia' verificata dal backend)."""
        try:
            payload_b64 = token.split(".")[1]
            padding = "=" * (-len(payload_b64) % 4)
            payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding))
            exp = payload.get("exp")
            if isinstance(exp, (int, float)):
                return float(exp)
        except Exception:
            pass
        return time.time() + 3000.0

    def _ensure_token(self) -> str:
        with self._lock:
            now = time.time()
            if self._token is None or now >= self._token_expires_at - 60:
                self._token = self._login()
                self._token_expires_at = self._jwt_expiry(self._token)
            return self._token

    def _invalidate_token(self) -> None:
        with self._lock:
            self._token = None
            self._token_expires_at = 0.0

    def get_json(self, path: str, *, params: dict[str, Any] | None = None) -> Any:
        """Esegue una GET autenticata. Rinnova il token una volta su 401."""
        for attempt in (1, 2):
            token = self._ensure_token()
            try:
                response = self._client.get(
                    path,
                    params=params,
                    headers={"Authorization": f"Bearer {token}"},
                )
            except httpx.TimeoutException as exc:
                raise BackendFailure(
                    f"Il backend non ha risposto entro {HTTP_TIMEOUT}s (timeout) per {path}",
                    kind="timeout",
                ) from exc
            except httpx.ConnectError as exc:
                raise BackendFailure(
                    f"Backend LipariBank irraggiungibile su {BASE_URL} per {path}",
                    kind="unreachable",
                ) from exc
            except httpx.HTTPError as exc:
                raise BackendFailure(
                    f"Errore di trasporto verso il backend per {path}: {type(exc).__name__}",
                    kind="transport",
                ) from exc

            if response.status_code == 401 and attempt == 1:
                self._invalidate_token()
                continue
            if response.status_code == 404:
                raise BackendFailure(
                    f"Risorsa non trovata nel backend (HTTP 404) per {path}",
                    kind="not_found",
                    status=404,
                )
            if response.status_code == 401:
                raise BackendFailure(
                    "Autenticazione rifiutata dal backend anche dopo il rinnovo del token (HTTP 401)",
                    kind="auth",
                    status=401,
                )
            if response.status_code >= 400:
                raise BackendFailure(
                    f"Il backend ha risposto HTTP {response.status_code} per {path}"
                    f"{_safe_detail(response)}",
                    kind="http",
                    status=response.status_code,
                )

            try:
                return json.loads(response.text, parse_float=Decimal)
            except ValueError as exc:
                raise BackendFailure(
                    f"Il backend ha risposto con un corpo non JSON per {path}",
                    kind="invalid_response",
                ) from exc

        raise BackendFailure(
            "Autenticazione non riuscita dopo il rinnovo del token",
            kind="auth",
        )


_bank = LipariBankClient()


# ---------------------------------------------------------------------------
# Helper di dominio
# ---------------------------------------------------------------------------

_ACCOUNT_FIELDS = ("id", "balance", "currency", "status")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _money(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01")))


def _fetch_account(account_id: int) -> dict[str, Any]:
    data = _bank.get_json(f"/api/accounts/{account_id}")
    if not isinstance(data, dict):
        raise BackendFailure(
            f"Risposta inattesa per il conto {account_id}: atteso un oggetto JSON",
            kind="invalid_response",
        )

    missing = [field for field in _ACCOUNT_FIELDS if field not in data or data[field] is None]
    if missing:
        raise BackendFailure(
            f"Risposta incompleta per il conto {account_id}: mancano {', '.join(missing)}",
            kind="invalid_response",
        )

    if not isinstance(data["id"], int):
        raise BackendFailure(
            f"Risposta incompleta per il conto {account_id}: id non numerico",
            kind="invalid_response",
        )

    try:
        balance = Decimal(str(data["balance"]))
    except (InvalidOperation, ValueError) as exc:
        raise BackendFailure(
            f"Saldo non numerico per il conto {account_id}",
            kind="invalid_response",
        ) from exc

    return {
        "id": int(data["id"]),
        "balance": balance,
        "currency": str(data["currency"]),
        "status": str(data["status"]),
    }


def _tool_error(exc: BackendFailure) -> ToolError:
    return ToolError(
        f"[{exc.kind}] {exc.message} "
        "Nessun dato inventato: il tool non restituisce un saldo vuoto o un valore predefinito."
    )


def _movement_field(item: dict[str, Any], field: str) -> Any:
    value = item.get(field)
    if value is None:
        raise ToolError(
            f"[invalid_response] Il backend ha restituito un movimento senza il campo {field}. "
            "Nessun dato inventato."
        )
    return value


# ---------------------------------------------------------------------------
# Tool
# ---------------------------------------------------------------------------


@mcp.tool(annotations={"readOnlyHint": True, "idempotentHint": True})
def get_account_balance(
    account_id: Annotated[
        int,
        Field(
            ge=1,
            description=(
                "ID numerico del conto LipariBank (per il seed locale: 1 o 2). "
                "Non passare un IBAN, un nome o una chiave inventata."
            ),
        ),
    ],
) -> dict[str, Any]:
    """Legge il saldo reale di un conto LipariBank dal backend.

    Usa questo tool quando una decisione dipende dallo stato reale di un conto:
    durante una review di codice che tocca i movimenti, prima di una
    simulazione, o quando devi verificare un saldo invece di dedurlo dal codice.
    Non usarlo per elencare i movimenti (usa list_account_movements) ne per
    simulare un trasferimento (usa simulate_transfer_what_if).

    Args:
        account_id: ID numerico del conto. Un ID inesistente produce un errore
            esplicito (HTTP 404), non un saldo zero.

    Returns:
        Un oggetto con account_id, balance (stringa decimale con 2 cifre),
        currency, status e read_at. Non restituisce IBAN, customerId, createdAt
        o altri campi che non servono alla decisione.

    Errors:
        Errore esplicito se il backend non risponde, rifiuta le credenziali,
        risponde con un errore o restituisce un corpo incompleto. In nessun caso
        restituisce un saldo vuoto o predefinito.

    Do NOT use this for:
        - il saldo di piu' conti in un colpo solo (chiamalo una volta per conto);
        - i movimenti (usa list_account_movements);
        - eseguire un bonifico: non esiste alcun tool che muova denaro.
    """
    try:
        account = _fetch_account(account_id)
    except BackendFailure as exc:
        raise _tool_error(exc) from exc

    return {
        "account_id": account["id"],
        "balance": _money(account["balance"]),
        "currency": account["currency"],
        "status": account["status"],
        "read_at": _now_iso(),
    }


@mcp.tool(annotations={"readOnlyHint": True, "idempotentHint": True})
def list_account_movements(
    account_id: Annotated[
        int,
        Field(
            ge=1,
            description=(
                "ID numerico del conto LipariBank (per il seed locale: 1 o 2). "
                "Non passare un IBAN o un nome."
            ),
        ),
    ],
    limit: Annotated[
        int,
        Field(
            ge=1,
            description=(
                f"Numero massimo di movimenti da restituire. Default {DEFAULT_MOVEMENTS}. "
                f"Il server applica comunque un tetto di {MAX_MOVEMENTS}: "
                "un valore piu' alto viene ridotto e il risultato lo dichiara."
            ),
        ),
    ] = DEFAULT_MOVEMENTS,
) -> dict[str, Any]:
    """Legge i movimenti di un conto, dal piu' recente, con un tetto lato server.

    Usa questo tool solo quando servono davvero i movimenti recenti per capire
    lo stato di un conto durante una review. Il chiamante non decide quanti
    movimenti vedere: il server taglia a MAX_MOVEMENTS e dichiara quanti ne ha
    restituiti e se il risultato e' troncato. Non usarlo per il saldo (usa
    get_account_balance) ne per simulare un trasferimento.

    Args:
        account_id: ID numerico del conto.
        limit: Quanti movimenti vorresti. Il server non restituisce mai piu' di
            MAX_MOVEMENTS; se chiedi di piu', il valore viene ridotto.

    Returns:
        Un oggetto con account_id, returned, limit_requested, limit_applied,
        truncated e movements. Ogni movimento contiene solo id, type, amount,
        counterparty_account_id ed executed_at; la description libera non viene
        esposta. Se il backend risponde con zero movimenti, lo dice con
        returned=0 e una note, non con un errore.

    Errors:
        Errore esplicito se il conto non esiste, se il backend non risponde o
        se la risposta e' incompleta. Non restituisce una lista vuota al posto
        di un errore.

    Do NOT use this for:
        - il saldo corrente (usa get_account_balance);
        - una lista completa dei movimenti: il tetto e' del server, non del
          chiamante;
        - eseguire o annullare un movimento.
    """
    try:
        account = _fetch_account(account_id)
        raw = _bank.get_json("/api/movements", params={"accountId": account_id})
    except BackendFailure as exc:
        raise _tool_error(exc) from exc

    if not isinstance(raw, list):
        raise ToolError(
            "[invalid_response] Il backend ha restituito un valore non-lista per i movimenti. "
            "Nessun dato inventato."
        )

    applied = min(limit, MAX_MOVEMENTS)
    movements: list[dict[str, Any]] = []
    for item in raw[:applied]:
        if not isinstance(item, dict):
            raise ToolError(
                "[invalid_response] Il backend ha restituito un movimento non valido. "
                "Nessun dato inventato."
            )
        try:
            amount = Decimal(str(_movement_field(item, "amount")))
        except (InvalidOperation, ValueError) as exc:
            raise ToolError(
                "[invalid_response] Il backend ha restituito un importo non numerico "
                "in un movimento. Nessun dato inventato."
            ) from exc

        movements.append(
            {
                "id": _movement_field(item, "id"),
                "type": _movement_field(item, "type"),
                "amount": _money(amount),
                "counterparty_account_id": item.get("counterpartyAccountId"),
                "executed_at": _movement_field(item, "executedAt"),
            }
        )

    result: dict[str, Any] = {
        "account_id": account["id"],
        "returned": len(movements),
        "limit_requested": limit,
        "limit_applied": applied,
        "truncated": len(raw) > applied,
        "movements": movements,
        "read_at": _now_iso(),
    }
    if not raw:
        result["note"] = "Il backend ha risposto con 0 movimenti per questo conto."
    return result


@mcp.tool(annotations={"readOnlyHint": True, "idempotentHint": True})
def simulate_transfer_what_if(
    from_account_id: Annotated[
        int,
        Field(ge=1, description="ID numerico del conto di partenza (per il seed locale: 1)."),
    ],
    to_account_id: Annotated[
        int,
        Field(ge=1, description="ID numerico del conto di arrivo (per il seed locale: 2)."),
    ],
    amount: Annotated[
        Decimal,
        Field(
            gt=0,
            description=(
                "Importo in EUR, maggiore di zero e con al massimo 2 decimali. "
                f"Il server applica un tetto di {MAX_TRANSFER_AMOUNT} EUR."
            ),
        ),
    ],
) -> dict[str, Any]:
    """Simula un trasferimento e restituisce i saldi prima e dopo, senza muovere denaro.

    Usa questo tool quando devi rispondere a "cosa succederebbe se spostassi X
    dal conto A al conto B". Il tool legge soltanto lo stato del backend
    (GET /api/accounts/{id}): non chiama /api/movements/transfer e non modifica
    saldi o movimenti. E' una simulazione, non un bonifico.

    Applica le regole pubblicate in finbank://policies/transfers: conti diversi,
    importo positivo e con al massimo 2 decimali, tetto del server, conti
    esistenti e ACTIVE, stessa valuta, fondi sufficienti. Se una regola non e'
    soddisfatta, wouldSucceed e' false e reason dice quale; i saldi after
    restano uguali ai saldi before.

    Args:
        from_account_id: ID del conto di partenza.
        to_account_id: ID del conto di arrivo.
        amount: Importo in EUR, maggiore di zero, massimo 2 decimali.

    Returns:
        Un oggetto con simulated=true, side_effects="none", amount, currency,
        from_account e to_account (balance_before e balance_after),
        would_succeed, reason, limits.max_amount, policy_resource e read_at.

    Errors:
        Errore esplicito se un conto non esiste, se il backend non risponde o
        se la risposta e' incompleta. Un'operazione che fallirebbe per fondi
        insufficienti non e' un errore del tool: e' una simulazione con
        would_succeed=false e reason="insufficient_funds".

    Do NOT use this for:
        - eseguire davvero un trasferimento: non esiste alcun tool che muova
          denaro, per nessun percorso;
        - leggere il saldo da solo (usa get_account_balance).
    """
    if amount.as_tuple().exponent < -2:
        raise ToolError(
            "[invalid_amount] L'importo deve avere al massimo 2 decimali (centesimi). "
            "Nessun arrotondamento implicito."
        )

    try:
        source = _fetch_account(from_account_id)
        target = _fetch_account(to_account_id)
    except BackendFailure as exc:
        raise _tool_error(exc) from exc

    would_succeed = True
    reason = "ok"

    if from_account_id == to_account_id:
        would_succeed = False
        reason = "same_account"
    elif source["status"] != "ACTIVE":
        would_succeed = False
        reason = "source_not_active"
    elif target["status"] != "ACTIVE":
        would_succeed = False
        reason = "target_not_active"
    elif source["currency"] != target["currency"]:
        would_succeed = False
        reason = "currency_mismatch"
    elif amount > MAX_TRANSFER_AMOUNT:
        would_succeed = False
        reason = "amount_over_limit"
    elif source["balance"] < amount:
        would_succeed = False
        reason = "insufficient_funds"

    if would_succeed:
        source_after = source["balance"] - amount
        target_after = target["balance"] + amount
    else:
        source_after = source["balance"]
        target_after = target["balance"]

    return {
        "simulated": True,
        "side_effects": "none",
        "amount": _money(amount),
        "currency": source["currency"],
        "from_account": {
            "account_id": source["id"],
            "balance_before": _money(source["balance"]),
            "balance_after": _money(source_after),
        },
        "to_account": {
            "account_id": target["id"],
            "balance_before": _money(target["balance"]),
            "balance_after": _money(target_after),
        },
        "would_succeed": would_succeed,
        "reason": reason,
        "limits": {"max_amount": _money(MAX_TRANSFER_AMOUNT)},
        "policy_resource": "finbank://policies/transfers",
        "read_at": _now_iso(),
    }


# ---------------------------------------------------------------------------
# Resource
# ---------------------------------------------------------------------------


def _read_policy(path: Path, label: str) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ResourceError(
            f"Policy {label} non trovata in {path}. Il server non inventa il regolamento."
        ) from exc
    except OSError as exc:
        raise ResourceError(
            f"Policy {label} non leggibile in {path}: {exc.strerror}. "
            "Il server non inventa il regolamento."
        ) from exc

    if not text.strip():
        raise ResourceError(
            f"Policy {label} vuota in {path}. Il server non inventa il regolamento."
        )
    return text


def _strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) == 3:
            return parts[2].lstrip("\r\n")
    return text


@mcp.resource(
    "finbank://policies/aml",
    name="aml-policy",
    title="Policy AML LipariBank",
    mime_type="text/markdown",
    description=(
        "Policy antiriciclaggio del LipariBank: soglie, PEP, watchlist, audit e "
        "pattern sospetti. E' un documento statico letto da file, non un valore "
        "ricordato dal modello. Cita sezione e soglia."
    ),
)
def aml_policy() -> str:
    """Restituisce la policy AML letta dalla fonte versionata del repository."""
    return _strip_frontmatter(_read_policy(AML_POLICY_PATH, "AML"))


@mcp.resource(
    "finbank://policies/transfers",
    name="transfer-policy",
    title="Regole di trasferimento LipariBank",
    mime_type="text/markdown",
    description=(
        "Regole applicate da simulate_transfer_what_if: conti diversi, importo "
        "positivo, tetto del server, conti attivi, stessa valuta, fondi "
        "sufficienti e nessun side effect. E' un documento statico letto da file."
    ),
)
def transfer_policy() -> str:
    """Restituisce le regole di trasferimento lette dal file della risorsa."""
    return _read_policy(TRANSFER_POLICY_PATH, "transfer")


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------


@mcp.prompt(
    name="review_movements_with_real_data",
    title="Review movimenti con dati reali",
    description=(
        "Prepara una review dei movimenti che legge i saldi veri, simula il "
        "trasferimento e cita la policy esposta come resource."
    ),
)
def review_movements_with_real_data(
    changed_file: Annotated[
        str,
        Field(description="Percorso del file o del diff da rivedere."),
    ],
    amount: Annotated[
        str,
        Field(
            description=(
                "Importo coinvolto, ad esempio '100.00'. Se non lo conosci, "
                "ricavalo dal codice o dal test prima di simulare."
            )
        ),
    ] = "",
) -> str:
    """Prompt per una review che verifica lo stato reale invece di dedurlo."""
    amount_line = (
        f"L'importo indicato e' {amount}."
        if amount
        else "Se il cambiamento riguarda un importo, ricavalo dal codice o dal test."
    )
    return f"""Sei il movements-reviewer del LipariBank. Devi rivedere: {changed_file}

{amount_line}

Prima di scrivere i rilievi:

1. Identifica i conti e l'importo coinvolti dal cambiamento. Gli ID del seed
   locale sono 1 e 2; verifica che esistano invece di fidarti dell'esempio.
2. Per ogni conto coinvolto chiama `get_account_balance` e usa il saldo reale
   come evidenza. In OpenCode i tool hanno il prefisso `finbank_`, quindi
   `finbank_get_account_balance`. Non dedurre un saldo dal codice.
3. Se il cambiamento riguarda un trasferimento, chiama
   `simulate_transfer_what_if` con gli stessi conti e lo stesso importo. Riporta
   `would_succeed`, `reason` e i saldi prima/dopo. Se la simulazione dice che
   l'operazione fallirebbe (fondi insufficienti, conto non attivo, stesso conto,
   valuta diversa, importo oltre il tetto), trattalo come un rilievo con la
   prova numerica.
4. Se servono i movimenti recenti per capire lo stato, chiama
   `list_account_movements` senza chiedere liste intere: il tetto e' del server.
5. Prima di citare una soglia o una regola, leggi la resource
   `finbank://policies/aml` con `read_mcp_resource` e cita documento e sezione.
   Per la simulazione leggi anche `finbank://policies/transfers`.
6. Se un tool restituisce un errore esplicito (backend irraggiungibile,
   timeout, 401, 404, risposta incompleta), scrivi "verifica bloccata" e
   riporta l'errore. Non concludere che il saldo e' zero o che non ci sono
   movimenti.
7. Non esiste alcun tool che muova denaro. Non chiedere di eseguire un
   bonifico e non proporre di farlo.

Scrivi i rilievi nel formato della skill `review-findings-format`, massimo 8,
ordinati per gravita. Se il codice e' corretto scrivi `NESSUNA VIOLAZIONE`, ma
solo dopo aver verificato i dati reali."""


if __name__ == "__main__":
    mcp.run()
