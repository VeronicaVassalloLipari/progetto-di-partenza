# Run trace — review del dominio movimenti

Prompt nella sessione:

```text
Fai la review di src/main/java/com/lipari/bank/movement/MovementService.java
```

Routing: `movements-reviewer` (unico reviewer attivato).

```text
REVIEW: movements
TARGET: src/main/java/com/lipari/bank/movement/MovementService.java
VERDICT: CHANGES_REQUIRED

FINDINGS:
- id: MOV-001
  file: src/main/java/com/lipari/bank/movement/MovementService.java
  line: 29-41
  severity: CRITICAL
  category: concurrency
  rule: MOV-03
  issue: Il saldo viene letto e riscritto senza lock ne versione ottimistica, e il controllo dei fondi e separato dalla scrittura.
  evidence: findById restituisce entita gestite senza SELECT ... FOR UPDATE; setBalance/save producono UPDATE ... WHERE id=? senza @Version. Due trasferimenti concorrenti sullo stesso conto leggono lo stesso saldo e l'ultimo commit sovrascrive il primo, perdendo un addebito; con lo stesso schema due operazioni che superano entrambe il controllo di riga 34 possono portare il saldo sotto zero. Su trasferimenti incrociati A->B e B->A l'ordine di lock non deterministico espone anche a deadlock.
  proposed_fix: Bloccare i conti con pessimistic write lock in ordine deterministico di id, oppure usare un UPDATE atomico condizionato (balance = balance - :amount WHERE id = :id AND balance >= :amount), aggiungere @Version su Account e gestire OptimisticLockException come conflitto/retry. Non applicato.

- id: MOV-002
  file: src/main/java/com/lipari/bank/movement/MovementService.java
  line: 23-59
  severity: HIGH
  category: correctness
  rule: MOV-02
  issue: Il trasferimento non ha una chiave di idempotenza: un retry o un doppio invio riesegue addebito, accredito e le due righe di movimento.
  evidence: Non esiste alcun campo idempotencyKey in TransferRequest, ne un vincolo univoco su movement, ne una ricerca preventiva. Se la prima richiesta va a buon fine ma la risposta si perde, il client che ritenta produce un secondo trasferimento completo.
  proposed_fix: Introdurre una chiave di idempotenza fornita dal chiamante, persisterla con vincolo univoco insieme all'esito dell'operazione e restituire il risultato gia registrato quando la stessa chiave arriva di nuovo, trattando la violazione del vincolo come duplicato. Non applicato.

- id: MOV-003
  file: src/main/java/com/lipari/bank/movement/MovementService.java
  line: 43-59
  severity: HIGH
  category: traceability
  rule: MOV-04
  issue: I due movimenti TRANSFER_OUT/TRANSFER_IN non hanno un identificativo comune che li riconduca alla stessa operazione.
  evidence: Le righe 43-59 valorizzano solo accountId, type, amount, counterpartyAccountId e description; due trasferimenti con stessa coppia di conti e stesso importo nello stesso intervallo producono quattro righe indistinguibili e la ricostruzione della coppia dipende da euristiche.
  proposed_fix: Aggiungere a movement una colonna transfer_id/operation_id valorizzata con lo stesso identificativo su entrambe le righe, con indice, generata prima delle due insert. Non applicato.

- id: MOV-004
  file: src/main/java/com/lipari/bank/movement/MovementService.java
  line: 49-58
  severity: MEDIUM
  category: correctness
  rule: MOV-05
  issue: I timestamp delle due righe sono presi con due chiamate distinte e l'ordinamento per executed_at non e deterministico.
  evidence: Le righe 49 e 58 chiamano Instant.now() separatamente; executed_at e TIMESTAMP senza precisione frazionaria (001-base-schema.yaml:43), quindi in MySQL viene troncato al secondo e i due movimenti possono avere lo stesso valore; MovementRepository.java:7 ordina solo per executed_at DESC, senza tie-breaker, per cui l'ordine restituito e arbitrario.
  proposed_fix: Catturare un unico Instant prima delle scritture e assegnarlo a entrambi i movimenti, migrare executed_at a TIMESTAMP(6) e ordinare per executed_at DESC, id DESC. Non applicato.

- id: MOV-005
  file: src/test/java/com/lipari/bank/TransferIT.java
  line: 20-33
  severity: MEDIUM
  category: correctness
  rule: MOV-08
  issue: I test coprono solo il caso felice e non verificano casi limite, doppio invio ne concorrenza.
  evidence: happyPathTransfer esegue un solo trasferimento e verifica gli importi; non ci sono test per fondi insufficienti, conto inesistente, stesso conto, retry/doppio invio, trasferimenti concorrenti, fallimento a meta con rollback, ne per importo e controparte della coppia OUT/IN.
  proposed_fix: Aggiungere test di integrazione per ciascun caso, inclusi due thread concorrenti sullo stesso conto e un errore forzato tra le due insert per verificare il rollback completo. Non applicato.

- id: MOV-006
  file: src/test/java/com/lipari/bank/TransferIT.java
  line: 14-32
  severity: LOW
  category: correctness
  rule: MOV-08
  issue: Il test di integrazione non isola lo stato e asserisce saldi assoluti, quindi non e ripetibile.
  evidence: @ActiveProfiles("test") non ha un src/test/resources/application-test.yml, quindi vale application.yml con MySQL locale; il test parte dai saldi seed 1000/500, li modifica e verifica 900/600. Una seconda esecuzione parte da 900/600 e fallisce, oltre a lasciare dati modificati.
  proposed_fix: Configurare un profilo test con datasource dedicato e ripulito per ogni test, oppure transazione di rollback/@Sql, verificando variazioni rispetto ai saldi iniziali invece di valori assoluti. Non applicato.
```
