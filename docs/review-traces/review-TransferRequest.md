# Run trace — review del contratto API

Prompt nella sessione:

```text
Fai la review del contratto di src/main/java/com/lipari/bank/movement/dto/TransferRequest.java
```

Routing: `api-contract-reviewer` (unico reviewer attivato).

```text
REVIEW: api-contract
TARGET: src/main/java/com/lipari/bank/movement/dto/TransferRequest.java
VERDICT: CHANGES_REQUIRED

FINDINGS:
- id: AC-001
  file: src/main/java/com/lipari/bank/common/GlobalExceptionHandler.java
  line: 19-23
  severity: HIGH
  category: contract
  rule: AC-03
  issue: Un body JSON malformato o un tipo errato su TransferRequest produce 500, non 400.
  evidence: HttpMessageNotReadableException estende NestedRuntimeException, quindi ricade nel catch-all `@ExceptionHandler(RuntimeException.class)` che risponde `INTERNAL_SERVER_ERROR` con "internal error"; il client che invia `{"amount":"abc"}` a POST /api/movements/transfer riceve un 500 invece di un 400 di validazione.
  proposed_fix: Aggiungere un handler dedicato per HttpMessageNotReadableException e MethodArgumentNotValidException che restituisca 400 con lo stesso errorBody, e restringere il catch-all a Exception non gestite. Non applicato.

- id: AC-002
  file: src/main/java/com/lipari/bank/movement/dto/TransferRequest.java
  line: 20
  severity: HIGH
  category: contract
  rule: AC-02
  issue: `description` non ha limite di lunghezza allineato alla colonna `movement.description VARCHAR(255)`.
  evidence: Il DTO accetta qualsiasi stringa, mentre lo schema Liquibase dichiara `VARCHAR(255)`; una descrizione oltre 255 caratteri arriva al DB, fallisce e diventa 500 invece di un 400 di validazione.
  proposed_fix: Aggiungere `@Size(max = 255)` su `description` con messaggio coerente. Non applicato.

- id: AC-003
  file: src/main/java/com/lipari/bank/common/GlobalExceptionHandler.java
  line: 11-33
  severity: HIGH
  category: contract
  rule: AC-03
  issue: Le violazioni di validazione di TransferRequest non passano dall'errorBody applicativo e hanno una forma diversa dagli altri errori.
  evidence: MethodArgumentNotValidException non e gestita dall'advice e viene risolta dal resolver di default di Spring (`timestamp`, `status`, `error`, `path`), priva di `correlationId` e senza elenco dei campi violati; lo stesso endpoint risponde quindi con due strutture di errore diverse a seconda che il 400 arrivi dalla validazione o dal servizio.
  proposed_fix: Gestire MethodArgumentNotValidException restituendo lo stesso `errorBody` con un campo stabile per le violazioni (campo + messaggio). Non applicato.

- id: AC-004
  file: src/main/java/com/lipari/bank/movement/MovementController.java
  line: 26
  severity: MEDIUM
  category: contract
  rule: AC-04
  issue: L'entity JPA `Movement` e esposta direttamente nella risposta di GET /api/movements (e analogamente `Account` in AccountController).
  evidence: `public List<Movement> listByAccount(...)` serializza i campi dell'entity, cosi ogni rinomina o modifica della persistenza diventa un breaking change per il client e i campi non destinati al cliente finiscono nel contratto.
  proposed_fix: Introdurre un `MovementDto`/`AccountDto` nel package `dto` con i soli campi pubblici e mappare esplicitamente l'entity. Non applicato.

- id: AC-005
  file: src/main/java/com/lipari/bank/movement/MovementController.java
  line: 19-22
  severity: MEDIUM
  category: contract
  rule: AC-01
  issue: POST /api/movements/transfer crea movimenti e risponde 200 invece di 201.
  evidence: `ResponseEntity.ok(movementService.transfer(req))` restituisce 200 su una chiamata con effetti persistenti e con `transferId` in risposta; il client non puo distinguere una creazione da una lettura e non riceve alcun header `Location`.
  proposed_fix: Restituire 201 con `Location` verso la risorsa creata, oppure documentare esplicitamente nel contratto il 200 se la scelta e voluta. Non applicato.

- id: AC-006
  file: src/main/java/com/lipari/bank/common/GlobalExceptionHandler.java
  line: 14-17
  severity: MEDIUM
  category: contract
  rule: AC-01
  issue: Un `fromAccountId`/`toAccountId` inesistente produce 400, non 404.
  evidence: Il percorso di errore converge su `IllegalArgumentException` -> BAD_REQUEST, quindi "source account not found" e un input sintatticamente invalido sono indistinguibili per il client, che non puo reagire in modo diverso ai due casi.
  proposed_fix: Introdurre un'eccezione dedicata per la risorsa assente mappata a 404 con la stessa errorBody. Non applicato.

- id: AC-007
  file: src/main/java/com/lipari/bank/movement/dto/TransferRequest.java
  line: 16-18
  severity: LOW
  category: contract
  rule: AC-02
  issue: Il messaggio di validazione dell'importo non corrisponde al vincolo e le convenzioni dei messaggi sono incoerenti.
  evidence: `@DecimalMin(value = "0.01", message = "amount must be > 0")` rifiuta valori sotto 0,01 inclusi, mentre il messaggio dichiara un vincolo diverso (0,009 viene respinto pur essendo > 0); inoltre `fromAccountId`/`toAccountId` usano i messaggi di default in inglese, quindi il client riceve testi non omogenei.
  proposed_fix: Allineare il messaggio al vincolo effettivo e definire messaggi coerenti e documentati per tutte le annotazioni. Non applicato.
```
