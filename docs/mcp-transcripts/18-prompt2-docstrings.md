# Prompt 2 — Attacco alle docstring dei tool

Data: 2026-11-09

Docstring lette da `finbank-mcp/server.py` e valutate come le leggerebbe un
modello che deve decidere se invocare il tool. Nessun complimento: solo cio' che
non torna. Riferimenti al codice con `file:riga`.

---

## `get_account_balance`

Docstring: `finbank-mcp/server.py:358-384`.

### Tre situazioni in cui la invocherei

1. Una review su `MovementService` che deve verificare un controllo fondi e il
   saldo reale non e' nel codice.
2. Prima di una simulazione, per sapere lo stato di partenza di un conto.
3. Un controllo puntuale «il conto 2 e' ACTIVE e con quanti soldi?» senza
   leggere i movimenti.

### Quando NON la invocherei

- Per i movimenti: il testo lo dice (`Do NOT use this for`, riga 382).
- Per simulare un trasferimento: il testo lo dice (riga 364 e 383).
- Per il saldo di piu' conti in un colpo: il testo lo dice (riga 381).
- Per eseguire un bonifico: il testo lo dice (riga 383).
- Per un saldo storico o un andamento: **dedotto**, non c'e' alcun parametro
  temporale.
- Per un saldo convertito in un'altra valuta: **dedotto**, il tool restituisce
  la `currency` del conto, non converte.
- Per il saldo di un conto di cui non conosco l'ID: **dedotto**, non esiste un
  tool che elenchi i conti e il testo nomina solo il seed «1 o 2».

### Parametri ambigui e cosa passerei in caso di dubbio

- `account_id`: il testo dice cosa non passare (IBAN, nome, chiave inventata) e
  suggerisce 1 o 2, ma non dice come ottenere l'ID fuori dal seed. In dubbio
  passerei `1`, ma e' una convenzione del bootcamp, non una regola del tool.
  `ge=1` esclude 0 e i negativi, quindi un ID sbagliato produce `not_found`, non
  un saldo vuoto.

### Cosa mi aspetto che ritorni, campo per campo

Il testo lo dice quasi tutto (righe 370-373):

- `account_id` — intero.
- `balance` — stringa decimale con 2 cifre.
- `currency` — stringa.
- `status` — stringa.
- `read_at` — presente, ma **il formato non e' dichiarato**; dal codice e' ISO
  8601 UTC con secondi (`server.py:278-279`).

### Con quale altra docstring si confonde

Con `simulate_transfer_what_if`: entrambe restituiscono saldi e la seconda
espone `balance_before`, che e' esattamente cio' che restituisce questa. Il
confine e' il verbo: «leggi lo stato» contro «verifica un'ipotesi».

### Due cose che cambierei

1. Dire esplicitamente che non esiste un tool per elencare i conti e che
   l'`account_id` va recuperato altrove; altrimenti il modello lo inventa.
2. Dichiarare il formato di `read_at` (ISO 8601 UTC, secondi) e che `balance` e'
   una stringa, non un numero: chi somma i saldi deve saperlo.

---

## `list_account_movements`

Docstring: `finbank-mcp/server.py:423-453`.

### Tre situazioni in cui la invocherei

1. Una review sulla coppia `TRANSFER_OUT`/`TRANSFER_IN` che deve vedere se le
   due gambe esistono davvero sul conto.
2. Verificare se dopo un trasferimento il conto ha righe nuove e in che ordine.
3. Controllare `type` e `amount` degli ultimi movimenti per capire lo stato di
   un conto senza leggere il saldo.

### Quando NON la invocherei

- Per il saldo corrente: il testo lo dice (riga 449).
- Per una lista completa: il testo lo dice, il tetto e' del server (righe 450-451).
- Per eseguire o annullare un movimento: il testo lo dice (riga 452).
- Per movimenti filtrati per data, tipo o controparte: **dedotto**, non esistono
  parametri di filtro.
- Per i movimenti di piu' conti: **dedotto**, c'e' un solo `account_id`.
- Per un totale o un aggregato dei movimenti: **dedotto**, restituisce righe,
  non somme.

### Parametri ambigui e cosa passerei in caso di dubbio

- `limit`: default 10, tetto 20, un valore piu' alto viene ridotto. In dubbio lo
  ometto e prendo il default, oppure passo `20` se voglio il massimo. Il testo
  non dice che `limit_applied` e' `min(limit, 20)` ne' che `limit` e' un limite
  superiore, non una garanzia di quante righe torneranno.
- `account_id`: stesso problema di scoperta dell'ID di `get_account_balance`.

### Cosa mi aspetto che ritorni, campo per campo

Il testo elenca (righe 436-441): `account_id`, `returned`, `limit_requested`,
`limit_applied`, `truncated`, `movements`. Ogni movimento: `id`, `type`,
`amount`, `counterparty_account_id`, `executed_at`. Corretto, ma:

- `read_at` c'e' nel codice (`server.py:499`) e **non e' nella docstring**.
- Il campo `note` c'e' nel codice (`server.py:501-502`) e la docstring dice solo
  «una note», **senza nominarlo**.
- L'ordine «dal piu' recente» e' dichiarato, ma il codice non ordina: si fida del
  backend (`server.py:456-468`). A parita' di `executed_at` non c'e' tie-breaker.

### Con quale altra docstring si confonde

Con `get_account_balance`: stesso `account_id`, stesso oggetto «stato del conto».
La differenza e' il dato restituito (righe contro saldo), non l'argomento.

### Due cose che cambierei

1. Documentare `read_at` e il nome esatto del campo `note`.
2. Dire che l'ordine dipende dal backend e che a parita' di `executed_at` non
   c'e' un criterio secondario (oppure aggiungerlo nel codice).

---

## `simulate_transfer_what_if`

Docstring: `finbank-mcp/server.py:527-560`.

### Tre situazioni in cui la invocherei

1. «Cosa succederebbe se spostassi 250 EUR dal conto 1 al conto 2?».
2. Verificare se un trasferimento fallirebbe per fondi, tetto o stato prima di
   scrivere un test.
3. Confrontare i saldi prima/dopo di un'ipotesi senza toccare i dati.

### Quando NON la invocherei

- Per eseguire davvero un trasferimento: il testo lo dice (righe 556-558).
- Per leggere il saldo da solo: il testo lo dice (riga 559).
- Per un prelievo o un versamento su un solo conto: **dedotto**, servono due
  conti distinti.
- Per un bonifico verso un IBAN esterno: **dedotto**, accetta solo `account_id`
  interni.
- Per un consiglio («conviene spostare?»): **dedotto**, il tool non valuta
  convenienza.
- Per un trasferimento ricorrente o programmato: **dedotto**, non c'e' alcun
  parametro temporale.

### Parametri ambigui e cosa passerei in caso di dubbio

- `from_account_id` / `to_account_id`: la direzione cambia i fondi. Il testo da'
  solo il seed (1 partenza, 2 arrivo, righe 510 e 514) ma non dice cosa fare se
  l'utente dice «tra 1 e 2» senza verso. In dubbio userei `1 -> 2`, ma e'
  arbitrario e va dichiarato.
- `amount`: il testo dice «in EUR» (righe 521 e 543) ma il codice usa la valuta
  dei conti e rifiuta `currency_mismatch` (`server.py:585-587, 606`). Per conti
  non-EUR la parola «EUR» e' fuorviante.
- `amount` con virgola decimale: il testo non dice se `100,50` e' accettato; in
  JSON serve `100.50`. **Dedotto**, non scritto.
- `amount` con 3+ decimali: il testo lo elenca tra le regole che danno
  `would_succeed=false` (righe 534-538), ma il codice **solleva**
  `[invalid_amount]` e non arrotonda (`server.py:561-565`). In dubbio passerei un
  valore a 2 decimali, ma la docstring mente sul comportamento.

### Cosa mi aspetto che ritorni, campo per campo

Il testo elenca (righe 545-548): `simulated`, `side_effects`, `amount`,
`currency`, `from_account` e `to_account` (con `balance_before` e
`balance_after`), `would_succeed`, `reason`, `limits.max_amount`,
`policy_resource`, `read_at`. Corrisponde al codice (`server.py:602-622`), con
due difetti:

- Nel corpo la docstring scrive `wouldSucceed` (camelCase, riga 537) mentre il
  campo e' `would_succeed` (snake_case, riga 617): chi legge puo' aspettarsi il
  nome sbagliato.
- `reason` e' una stringa ma i valori possibili non sono elencati: la docstring
  nomina solo `insufficient_funds` (riga 554). L'insieme reale (`ok`,
  `same_account`, `source_not_active`, `target_not_active`, `currency_mismatch`,
  `amount_over_limit`, `insufficient_funds`) va dedotto dal codice
  (`server.py:573-593`).

### Con quale altra docstring si confonde

Con `get_account_balance`: entrambe restituiscono saldi. Se l'utente chiede
«quanto resta dopo X», la scelta tra i due e' il punto critico, perche' il
`balance_before` di questa e' il saldo che restituirebbe l'altra.

### Due cose che cambierei

1. Correggere `wouldSucceed` in `would_succeed` e documentare l'insieme completo
   dei valori di `reason`.
2. Sostituire «in EUR» con «nella valuta del conto sorgente», dire che valute
   diverse danno `currency_mismatch` e che 3+ decimali sono **rifiutati**, non
   arrotondati.

---

## Verifica finale — due tool devono diventare uno?

La coppia piu' vicina e' `get_account_balance` / `simulate_transfer_what_if`.
La seconda restituisce `from_account.balance_before`, cioe' lo stesso dato della
prima, e la prima e' quasi un caso particolare della seconda con `amount=0`.

**Verdetto: non vanno fusi.** Sono due intenzioni diverse — «leggi lo stato» e
«verifica un'ipotesi con due conti e delle regole» — e fonderle vorrebbe dire
aggiungere un `amount` fittizio a una lettura, che invita proprio all'uso
sbagliato. Il confine e' gia' scritto in entrambe le docstring (righe 361-364 e
559). Il problema, se emerge dal banco di prova, non e' la docstring del secondo:
e' che `get_account_balance` diventa ridondante se il modello usa sempre la
simulazione. In quel caso si rimuove `get_account_balance`, non si allunga la
docstring di `simulate_transfer_what_if`.

`list_account_movements` resta separato: restituisce righe, non saldi, e non ha
sovrapposizione di intenti con gli altri due.
