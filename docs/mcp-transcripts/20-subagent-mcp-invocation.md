# Prova: il subagent `movements-reviewer` invoca i tool MCP

Data: 2026-11-09

Perché questa prova. Il transcript `12-movements-reviewer.md` è stato raccolto con
`opencode run --agent movements-reviewer`, che per un subagent stampa
`agent "..." is a subagent, not a primary agent. Falling back to default agent`:
le chiamate ai tool avvenivano, ma non era dimostrato che le facesse il subagent.
Questa prova crea la sessione impostando esplicitamente `agent` (la stessa
modalità di `code-review-suite`: `session.create` + `session.prompt` con
`agent: "movements-reviewer"`), quindi a rispondere è davvero il reviewer.

Prompt inviato al subagent:

~~~text
Review src/main/java/com/lipari/bank/movement/MovementService.java.

Usa il server MCP finbank per i dati reali:
- leggi il saldo reale dei conti 1 e 2 con finbank_get_account_balance;
- leggi al massimo 10 movimenti del conto 1 con finbank_list_account_movements;
- simula un trasferimento di 100.00 EUR dal conto 1 al conto 2 con finbank_simulate_transfer_what_if.

Cita nelle NOTES i valori reali e i read_at restituiti dai tool. Carica la skill
review-findings-format e restituisci SOLO il blocco FINDINGS nel formato richiesto.
Non modificare file.
~~~

Output del subagent:

~~~text
REVIEW: movements
TARGET: src/main/java/com/lipari/bank/movement/MovementService.java
VERDICT: CHANGES_REQUIRED

FINDINGS:
- id: MOV-001
  file: src/main/java/com/lipari/bank/movement/MovementService.java
  line: 23-62
  severity: CRITICAL
  category: correctness
  rule: MOV-02
  issue: Il trasferimento non ha alcuna chiave di idempotenza: un retry o un doppio invio esegue due volte addebito, accredito e movimenti.
  evidence: `TransferRequest` non espone una chiave di richiesta e `Movement`/`MovementService` non salvano ne verificano nulla del genere; ogni invocazione di `transfer` esegue `from.setBalance(...subtract...)` e `to.setBalance(...add...)` riga per riga senza controllo di duplicati. Lo stato reale conferma che il conto 1 ha saldo capiente (1000.00 EUR) e la simulazione di 100.00 EUR andrebbe a buon fine: un retry della stessa richiesta produrrebbe quindi un secondo trasferimento valido, con denaro spostato due volte.
  proposed_fix: Aggiungere una chiave di idempotenza obbligatoria nella richiesta, persistita su una tabella dedicata (o colonna con vincolo unique sulla coppia chiave/operazione) e verificata all'inizio di `transfer`; su chiave gia vista restituire l'esito precedente senza rieseguire gli aggiornamenti. Non applicato.

- id: MOV-002
  file: src/main/java/com/lipari/bank/movement/MovementService.java
  line: 34-41
  severity: HIGH
  category: concurrency
  rule: MOV-03
  issue: Lettura, controllo fondi e riscrittura del saldo avvengono senza lock ne versione ottimistica, e l'ordine di acquisizione dei due conti non e deterministico.
  evidence: `from` e `to` sono caricati con `findById`, il controllo fondi e un TOCTOU su `from.getBalance().compareTo(req.getAmount())` e il saldo viene poi sovrascritto con `from.setBalance(...)`/`to.setBalance(...)`. `Account` (righe 10-31) non ha `@Version`, ne viene usato `@Lock(PESSIMISTIC_WRITE)` o un `UPDATE ... WHERE id = ? AND balance >= ?`; due trasferimenti concorrenti possono perdere un aggiornamento. Inoltre i due conti sono letti sempre nell'ordine from→to, quindi due trasferimenti incrociati A→B e B→A non hanno un ordine di lock stabile.
  proposed_fix: Introdurre `@Version` su `Account` con gestione di `OptimisticLockException`, oppure lock pessimistico acquisito in ordine deterministico (id crescente) e aggiornamento del saldo condizionato al saldo disponibile. Non applicato.

- id: MOV-003
  file: src/main/java/com/lipari/bank/movement/MovementService.java
  line: 43-59
  severity: HIGH
  category: traceability
  rule: MOV-04
  issue: Le due righe TRANSFER_OUT/TRANSFER_IN non hanno un identificativo comune dell'operazione: sono ricondotte solo da importo e controparte.
  evidence: `Movement` non possiede alcun campo tipo `transferId`/`operationId`; `out` e `in` condividono solo `amount` e `counterpartyAccountId`. Due trasferimenti dello stesso importo tra gli stessi conti sono indistinguibili nella ricostruzione dell'operazione.
  proposed_fix: Generare un identificativo di operazione (es. UUID) e salvarlo su entrambe le gambe (nuova colonna su `movement`), restituendolo nella risposta; usarlo come criterio univoco di riconciliazione. Non applicato.

- id: MOV-004
  file: src/main/java/com/lipari/bank/movement/MovementService.java
  line: 49,58
  severity: MEDIUM
  category: correctness
  rule: MOV-05
  issue: Le due gambe della stessa operazione ricevono istanti di esecuzione diversi, perche `Instant.now()` viene invocato due volte.
  evidence: `out.setExecutedAt(Instant.now())` alla riga 49 e `in.setExecutedAt(Instant.now())` alla riga 58; le due gambe possono avere timestamp differenti e non condividono l'istante dell'operazione.
  proposed_fix: Calcolare un unico `Instant executedAt = Instant.now()` prima di creare i due `Movement` e assegnarlo a entrambi. Non applicato.

- id: MOV-005
  file: src/main/java/com/lipari/bank/movement/MovementRepository.java
  line: 7
  severity: MEDIUM
  category: correctness
  rule: MOV-05
  issue: L'ordinamento dei movimenti e basato solo su `executedAt`, senza criterio di spareggio, quindi non e deterministico a parita di istante.
  evidence: `findByAccountIdOrderByExecutedAtDesc(Long accountId)` restituisce ordine indefinito quando piu movimenti condividono `executedAt`; il caso e frequente proprio perche la coppia di gambe dovrebbe avere lo stesso istante (e oggi spesso non lo ha).
  proposed_fix: Aggiungere un secondo criterio stabile (es. `OrderByExecutedAtDescIdDesc`) o una query esplicita con `ORDER BY executedAt DESC, id DESC`. Non applicato.

- id: MOV-006
  file: src/main/java/com/lipari/bank/movement/MovementService.java
  line: 25-36
  severity: MEDIUM
  category: correctness
  rule: MOV-06
  issue: Gli errori di dominio sono lanciati come `IllegalArgumentException` generica, non distinguibile per tipo.
  evidence: `throw new IllegalArgumentException("source account not found")`, `"target account not found"` e `"insufficient funds"` condividono la stessa classe; il chiamante non puo distinguere conto inesistente da fondi insufficienti senza interpretare il testo del messaggio, e i tre casi restano indistinguibili per qualsiasi mapping a valle.
  proposed_fix: Introdurre eccezioni di dominio dedicate (es. `AccountNotFoundException`, `InsufficientFundsException`) da mappare in modo deterministico nello strato superiore. Non applicato.

- id: MOV-007
  file: src/main/java/com/lipari/bank/movement/MovementService.java
  line: 24-36
  severity: MEDIUM
  category: correctness
  rule: MOV-06
  issue: Il service non valida l'importo in ingresso: un valore assente o negativo arriva fino alla logica di saldo.
  evidence: la validazione `@DecimalMin`/`@NotNull` vive solo su `TransferRequest` e si applica alla boundary HTTP; `transfer` usa direttamente `req.getAmount()` in `compareTo` e `subtract`. Se il service viene chiamato senza quella boundary (come in `TransferIT`) un importo null produce `NullPointerException` (non un errore di dominio) e un importo negativo inverte il verso dello spostamento, aumentando il saldo del conto di partenza.
  proposed_fix: Validare esplicitamente in `transfer` che l'importo sia non nullo e strettamente positivo, lanciando un'eccezione di dominio dedicata prima di toccare i saldi. Non applicato.

- id: MOV-008
  file: src/test/java/com/lipari/bank/TransferIT.java
  line: 20-33
  severity: MEDIUM
  category: correctness
  rule: MOV-08
  issue: Il test di integrazione copre solo il caso felice, dipende dai saldi di seed e non isola i dati tra esecuzioni.
  evidence: `happyPathTransfer` asserisce `900.00`/`600.00`, cioe i saldi di seed (conto 1 = 1000.00 EUR, conto 2 = 500.00 EUR) meno/piu 100; manca `@Transactional` sul test o un rollback esplicito, quindi ogni esecuzione lascia i saldi modificati e il test non e ripetibile. Non ci sono casi per conto inesistente, fondi insufficienti, rollback verificato, ne un test di concorrenza.
  proposed_fix: Rendere il test transazionale con rollback (o creare i dati nel test), asserire sui saldi letti prima dell'operazione invece che su valori fissi, e aggiungere casi di errore, verifica di rollback e un test concorrente sui due conti. Non applicato.

NOTES: finbank: balance c1=1000.00 EUR e c2=500.00 EUR (read_at 2026-11-09T10:46:33+00:00); movimenti c1: 0 restituiti, truncated=false (read_at 2026-11-09T10:46:34+00:00); sim 100.00 EUR c1→c2 would_succeed=true (1000.00→900.00, 500.00→600.00), read_at 2026-11-09T10:46:34+00:00, nessun side effect.
~~~

Le `NOTES` contengono i `read_at` restituiti dai tool e i saldi reali letti dal
backend (`1000.00` / `500.00` EUR); nessun valore è dedotto dal codice. La
simulazione non ha mosso denaro (`would_succeed=true`, saldi previsti, nessun
side effect).
