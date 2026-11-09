# Prova: l'`amount-compliance-reviewer` cita la resource AML

Data: 2026-11-08

Comando:

```powershell
opencode run --agent amount-compliance-reviewer --auto "Review src/main/java/com/lipari/bank/movement/Movement.java per la compliance sugli importi. Prima di citare le soglie AML leggi la resource MCP finbank://policies/aml con read_mcp_resource (server finbank) e cita l'URI e il valore letto. Se il target ha un conto identificabile, leggi il saldo reale con finbank_get_account_balance. Non modificare file."
```

Output:

~~~text
! agent "amount-compliance-reviewer" is a subagent, not a primary agent. Falling back to default agent

> build · big-pickle

• Amount compliance review Movement.java Amount-Compliance-Reviewer Agent
✓ Amount compliance review Movement.java Amount-Compliance-Reviewer Agent
## Fonte policy AML
Letta `finbank://policies/aml` (server `finbank`) con `read_mcp_resource`:
- «Movimento sopra **10.000 EUR**: segnalazione obbligatoria.»
- «Movimento sopra **5.000 EUR**: registrazione nell'audit.»
- «Un movimento sopra **1.000 EUR** di un cliente PEP genera un alert.»
- §4 Audit trail: `correlationId`, `userId`, `ipAddress`, `executedAt`, importo e valuta.

## Saldi reali
Nessun saldo letto: `Movement.java` espone solo `accountId` (riga 16) senza alcun valore concreto, quindi il file non identifica un conto. Non ho inventato un ID.

## Rilievi

**AMT-001 — CRITICAL — tracciabilità** (`Movement.java:11-31`)
Il movimento non persiste `correlationId`, `userId`, `ipAddress`: restano solo `amount` e `executedAt`. La §4 della policy non è soddisfatta; il `correlationId` vive solo in MDC (`CorrelationIdFilter:30`) e non viene salvato. → Aggiungere colonne `correlation_id`, `user_id`, `ip_address` valorizzate alla creazione, o tabella audit dedicata.

**AMT-002 — HIGH — compliance** (`Movement.java:21-22`)
`amount` è senza valuta. La valuta esiste solo su `Account.currency` (mutabile, senza storico). Il requisito «importo e valuta» non è soddisfatto, il confronto con soglie in EUR non è esprimibile e si rischia di sommare valute diverse. → Aggiungere `currency` non-null sul movimento, valorizzata dal conto.

**AMT-003 — HIGH — correttezza** (`Movement.java:21-22`)
`precision=19, scale=2` agisce solo sul DDL, non sul `BigDecimal` in memoria; nessun `RoundingMode` esplicito. Un importo con 3+ decimali arriva all'entità e il DB arrotonda implicitamente, mentre il saldo (`MovementService:38-39`) usa la scala piena: la somma dei movimenti può non coincidere con la variazione di saldo. → Normalizzare con `setScale(2, RoundingMode.HALF_UP)` in un unico punto o rifiutare scala > 2.

**AMT-004 — HIGH — compliance** (`Movement.java:11-31`)
Nessuna traccia dell'esito delle soglie AML: un movimento sopra 10.000 EUR (segnalazione) o sopra 5.000 EUR (audit) non lascia evidenza, e senza valuta il confronto non è nemmeno esprimibile. → Valutare le soglie in un unico punto (costanti 10.000/5.000 EUR) e persistere l'esito.

**AMT-005 — MEDIUM — correttezza** (`Movement.java:18-22`)
Nessun invariante su segno/massimale; `type` è `VARCHAR(16)` libero. Zero/negativi sono esclusi solo dal DTO (`TransferRequest:17`), non dal modello. → Enum per `type`, `CHECK amount > 0`, massimale validato prima del persist.

**AMT-006 — MEDIUM — tracciabilità** (`Movement.java:29-30`)
`executed_at` è nullable e non valorizzato dall'entità; il default `CURRENT_TIMESTAMP` non si applica a un INSERT con NULL esplicito. → `nullable=false` e valorizzazione in `@PrePersist`/factory.

Nota di perimetro: il controllo fondi insufficienti sta in `MovementService.java:34`, fuori target. L'uso di `BigDecimal` per `amount` è corretto.

```
REVIEW: amount-compliance
TARGET: src/main/java/com/lipari/bank/movement/Movement.java
VERDICT: CHANGES_REQUIRED
FINDINGS: AMT-001 CRITICAL, AMT-002 HIGH, AMT-003 HIGH, AMT-004 HIGH, AMT-005 MEDIUM, AMT-006 MEDIUM
POLICY: finbank://policies/aml (10.000 / 5.000 EUR; PEP 1.000 EUR)
BALANCES: nessuno (accountId non concreto)
```
~~~

Il reviewer ha letto la resource `finbank://policies/aml` e ha citato URI e
soglie. Non ha inventato un saldo per un file che non identifica un conto.
