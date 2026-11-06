# Code Review Suite — LipariBank

- Run: `2026-11-06T15-48-26-052Z`
- Target: `src/main/java/com/lipari/bank`
- Modello: `(default OpenCode)`
- Avvio: 2026-11-06T15:48:26.055Z
- Durata totale: 97.5 s
- Esito: **GATE_FAILED**
- Findings: **28** totali, **27** unici, 1 duplicati riconciliati
- Conflitti di gravita: **1**

## Parallelismo

- Reviewer avviati: 4/4
- Scarto massimo fra gli avvii: 2 ms
- Coppie sovrapposte: 6/6
- Sovrapposizione reale: **si**

| Reviewer | Stato | Inizio | Fine | Durata | Token | Costo provider |
|---|---|---|---|---:|---:|---:|
| movements-reviewer | ok | 2026-11-06T15:48:26.838Z | 2026-11-06T15:49:33.514Z | 66.7 s | 61,103 | 0.0000 USD |
| amount-compliance-reviewer | ok | 2026-11-06T15:48:26.839Z | 2026-11-06T15:50:03.530Z | 96.7 s | 110,393 | 0.0000 USD |
| api-contract-reviewer | ok | 2026-11-06T15:48:26.840Z | 2026-11-06T15:49:29.054Z | 62.2 s | 126,850 | 0.0000 USD |
| security-reviewer | ok | 2026-11-06T15:48:26.840Z | 2026-11-06T15:49:32.832Z | 66.0 s | 104,394 | 0.0000 USD |

## Budget

- Tempo: 97.5 s / 600 s
- Token: 402,740 / 500,000
- Costo provider: 0.0000 USD
- Costo stimato: 0.0000 USD
- Costo effettivo (max): 0.0000 USD / nessun tetto
- Stato: **ok**

## Riepilogo per gravita (unici)

| Gravita | Conteggio |
|---|---:|
| CRITICAL | 5 |
| HIGH | 11 |
| MEDIUM | 9 |
| LOW | 2 |

## Reviewer falliti o non interpretabili

Nessuno: tutti i reviewer hanno risposto e l'output e' stato interpretato.

## Findings consolidati

### [CRITICAL] FND-001 — Il saldo viene letto e riscritto senza lock ne versione ottimistica, e il controllo fondi e un TOCTOU.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 29-41
- Gravita gate: **CRITICAL**
- Reviewer: movements-reviewer
- Categoria: concurrency
- Regola: MOV-03
- Evidenza: `findById` restituisce l'entita senza lock/@Version; poi `from.setBalance(from.getBalance().subtract(...))` e `to.setBalance(to.getBalance().add(...))` seguono una lettura non protetta. Due trasferimenti concorrenti sullo stesso conto leggono lo stesso saldo e l'ultimo commit sovrascrive l'altro, perdendo un addebito o un accredito; il controllo `compareTo` alla riga 34 puo passare su un saldo gia consumato da un'altra transazione.
- Correzione proposta (non applicata): Acquisire i due conti con lock pessimistico in scrittura (SELECT ... FOR UPDATE) in ordine deterministico (es. id crescente) oppure usare @Version con gestione di OptimisticLockException e retry, mantenendo il controllo fondi sotto lo stesso lock. Non applicato.

### [HIGH] FND-002 — `transfer` non ha una chiave di idempotenza persistita con vincolo di unicita.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 24-59
- Gravita gate: **HIGH**
- Reviewer: movements-reviewer
- Categoria: correctness
- Regola: MOV-02
- Evidenza: Un retry o un doppio invio della stessa richiesta riesegue `subtract`/`add` e inserisce due nuove righe `Movement` (righe 38-39 e 43-59), duplicando sia i saldi sia i movimenti. Nessun campo della richiesta o del movimento identifica la singola operazione.
- Correzione proposta (non applicata): Aggiungere una idempotency key fornita dal client, persistita nella stessa transazione con vincolo di unicita, e su chiave gia presente restituire il risultato originale senza riapplicare gli effetti. Non applicato.

### [HIGH] FND-003 — Le due gambe TRANSFER_OUT/TRANSFER_IN non hanno un identificativo comune dell'operazione.

- File: `src/main/java/com/lipari/bank/movement/Movement.java`
- Riga: 11-31
- Gravita gate: **HIGH**
- Reviewer: movements-reviewer
- Categoria: traceability
- Regola: MOV-04
- Evidenza: `Movement` espone solo `amount`, `counterpartyAccountId` e `description`; le righe 43-59 di MovementService collegano le due gambe solo per importo e controparte. Due trasferimenti uguali fra gli stessi conti restano indistinguibili e non riconciliabili alla stessa operazione.
- Correzione proposta (non applicata): Introdurre un `operationId`/`transferId` comune alle due gambe (valorizzato dal servizio e persistito con vincolo per coppia/operazione) e usarlo come chiave di riconciliazione. Non applicato.

### [MEDIUM] FND-004 — Le due gambe ricevono `executedAt` da due chiamate distinte a `Instant.now()`.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 49-58
- Gravita gate: **MEDIUM**
- Reviewer: movements-reviewer
- Categoria: correctness
- Regola: MOV-05
- Evidenza: `out.setExecutedAt(Instant.now())` alla riga 49 e `in.setExecutedAt(Instant.now())` alla riga 58 possono produrre istanti diversi, quindi le due gambe della stessa operazione non condividono lo stesso istante di esecuzione.
- Correzione proposta (non applicata): Calcolare un singolo `Instant executedAt = Instant.now()` prima di creare le due gambe e assegnarlo a entrambe. Non applicato.

### [MEDIUM] FND-005 — `listAllWithMovements` esegue N+1 query sui movimenti.

- File: `src/main/java/com/lipari/bank/account/AccountController.java`
- Riga: 28-30
- Gravita gate: **MEDIUM**
- Reviewer: movements-reviewer
- Categoria: correctness
- Regola: MOV-07
- Evidenza: `accountRepo.findAll().stream().map(a -> ... movementRepo.findByAccountIdOrderByExecutedAtDesc(a.getId()))` lancia una query per ogni conto, con costo proporzionale al numero di conti.
- Correzione proposta (non applicata): Recuperare i movimenti in un'unica query per l'insieme degli account id (o con join/fetch mirato) e raggrupparli in memoria. Non applicato.

### [MEDIUM] FND-006 — Il test copre solo il percorso felice e dipende dai saldi di seed.

- File: `src/test/java/com/lipari/bank/TransferIT.java`
- Riga: 20-33
- Gravita gate: **MEDIUM**
- Reviewer: movements-reviewer
- Categoria: correctness
- Regola: MOV-08
- Evidenza: `happyPathTransfer` asserisce `900.00` e `600.00` assunti dai dati di seed; non esistono casi di conto inesistente, fondi insufficienti, verifica del rollback ne trasferimenti concorrenti, e l'isolamento dei dati non e garantito.
- Correzione proposta (non applicata): Aggiungere test con dati creati nel test (non saldi di seed) per errori di dominio con verifica che saldi e movimenti restino invariati, per concorrenza sullo stesso conto e per il rollback. Non applicato.

### [MEDIUM] FND-007 — L'ordinamento usa solo `executedAt` e non e deterministico in caso di parita.

- File: `src/main/java/com/lipari/bank/movement/MovementRepository.java`
- Riga: 7
- Gravita gate: **MEDIUM**
- Reviewer: movements-reviewer
- Categoria: correctness
- Regola: MOV-05
- Evidenza: `findByAccountIdOrderByExecutedAtDesc` non prevede un criterio secondario; movimenti con lo stesso istante (in particolare le due gambe dopo l'allineamento temporale) possono cambiare ordine tra chiamate.
- Correzione proposta (non applicata): Aggiungere un criterio di spareggio stabile, es. `OrderByExecutedAtDescIdDesc`, da usare anche per eventuali paginazioni. Non applicato.

### [LOW] FND-008 — Gli errori di dominio sono lanciati come `IllegalArgumentException` generica.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 25-36
- Gravita gate: **LOW**
- Reviewer: movements-reviewer
- Categoria: correctness
- Regola: MOV-06
- Evidenza: Conti uguali, conto inesistente e fondi insufficienti usano tutti lo stesso tipo generico, quindi il chiamante non puo distinguere la causa ne il servizio puo differenziare il trattamento.
- Correzione proposta (non applicata): Introdurre eccezioni di dominio dedicate (es. conto non trovato, fondi insufficienti, trasferimento non valido) e mapparle nel gestore esistente, lasciando il fallback generico. Non applicato.

### [CRITICAL] FND-009 — Il trasferimento non applica alcuna soglia AML: nessuna segnalazione oltre 10.000 EUR, nessuna registrazione audit oltre 5.000 EUR, nessun alert PEP oltre 1.000 EUR.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 24-61
- Gravita gate: **CRITICAL**
- Reviewer: amount-compliance-reviewer
- Categoria: compliance
- Regola: AMT-07
- Evidenza: transfer() addebita/accredita e salva i movimenti senza confrontare l'importo con le soglie; nel codice non compare alcun riferimento a 10.000, 5.000 o 1.000, quindi un movimento fuori soglia non viene ne segnalato ne tracciato.
- Correzione proposta (non applicata): Introdurre un componente di policy AML con le soglie 10.000 (segnalazione), 5.000 (audit) e 1.000 (PEP) EUR come costanti uniche, invocato prima del salvataggio del movimento. Non applicato.

### [HIGH] FND-010 — Il movimento monetario non memorizza correlationId, userId, ipAddress ne valuta, quindi l'audit non e riconducibile a chi e da dove ha eseguito l'operazione.

- File: `src/main/java/com/lipari/bank/movement/Movement.java`
- Riga: 21-30
- Gravita gate: **HIGH**
- Reviewer: amount-compliance-reviewer
- Categoria: traceability
- Regola: AMT-08
- Evidenza: Movement espone solo accountId, type, amount, counterpartyAccountId, description ed executedAt; il correlationId vive solo in MDC (CorrelationIdFilter) e non viene persistito, mentre il service non valorizza utente o IP.
- Correzione proposta (non applicata): Aggiungere a Movement, e al relativo changeSet, correlationId, userId, ipAddress e currency, valorizzandoli nel service dal contesto di sicurezza e dall'MDC. Non applicato.

### [HIGH] FND-011 — Il trasferimento somma gli importi senza verificare che i due conti abbiano la stessa valuta e il movimento non registra la valuta.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 34-39
- Gravita gate: **HIGH**
- Reviewer: amount-compliance-reviewer
- Categoria: compliance
- Regola: AMT-04
- Evidenza: from.getBalance() e to.getBalance() vengono aggiornati con lo stesso req.getAmount() ignorando Account.currency; con conti in valute diverse il saldo di destinazione viene incrementato come se fosse nella valuta di origine.
- Correzione proposta (non applicata): Verificare che from.getCurrency() e to.getCurrency() coincidano e rifiutare il trasferimento in caso contrario, propagando la valuta sul Movement. Non applicato.

### [HIGH] FND-012 — L'importo non viene normalizzato ne validato su scale 2 prima dell'aritmetica e lo schema DECIMAL(19,2) arrotonda implicitamente in scrittura senza un RoundingMode esplicito.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 38-39
- Gravita gate: **HIGH**
- Reviewer: amount-compliance-reviewer
- Categoria: correctness
- Regola: AMT-02
- Evidenza: subtract/add usano il BigDecimal grezzo della richiesta; un valore con piu di due decimali (es. 10.005) supera i controlli, ma al salvataggio su balance/amount DECIMAL(19,2) viene arrotondato, rompendo la quadratura tra saldo e movimento registrato.
- Correzione proposta (non applicata): Validare l'importo con @Digits(integer=17, fraction=2) e applicare setScale(2, RoundingMode.HALF_EVEN) una sola volta nel service prima di ogni confronto e aggiornamento, con la stessa modalita per addebito e accredito. Non applicato.

### [MEDIUM] FND-013 — La positivita dell'importo e affidata solo alla validazione del DTO e non esiste alcun massimale di operazione.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 24-39
- Gravita gate: **MEDIUM**
- Reviewer: amount-compliance-reviewer
- Categoria: compliance
- Regola: AMT-05
- Evidenza: transfer() accetta qualunque BigDecimal; una chiamata diretta al service con importo negativo supera il controllo fondi (compareTo < 0 risulta falso) e decrementa il saldo di destinazione, portandolo potenzialmente sotto zero.
- Correzione proposta (non applicata): Validare nel service amount != null e amount.signum() > 0 e definire un massimale di operazione, rifiutando i valori oltre la soglia. Non applicato.

### [HIGH] FND-014 — La creazione di un trasferimento risponde 200 invece di 201.

- File: `src/main/java/com/lipari/bank/movement/MovementController.java`
- Riga: 19-22
- Gravita gate: **HIGH**
- Reviewer: api-contract-reviewer
- Categoria: contract
- Regola: AC-01
- Evidenza: `POST /api/movements/transfer` ha effetti persistenti (due movimenti e due saldi aggiornati) ma restituisce `ResponseEntity.ok(...)`: un client non distingue una creazione da una lettura e non riceve semantica di risorsa creata.
- Correzione proposta (non applicata): Restituire `ResponseEntity.status(HttpStatus.CREATED)` con il `TransferResponse` come body. Non applicato.

### [HIGH] FND-015 — Le risposte espongono direttamente l'entity JPA `Movement` (e `Account` in AccountController).

- File: `src/main/java/com/lipari/bank/movement/MovementController.java`
- Riga: 25-27
- Gravita gate: **HIGH**
- Reviewer: api-contract-reviewer
- Categoria: contract
- Regola: AC-04
- Evidenza: `listByAccount` restituisce `List<Movement>`; lo stesso difetto compare in `AccountController` linee 18-23 (`ResponseEntity<Account>`) e 26-33 (`AccountWithMovements(Account, List<Movement>)`). Una rinomina di colonne o campi di persistenza diventa un breaking change per il client e campi interni finiscono nel JSON.
- Correzione proposta (non applicata): Introdurre DTO di risposta espliciti (`MovementDto`, `AccountDto`, `AccountWithMovementsDto`) con soli campi di contratto e mappare le entity al confine del controller. Non applicato.

### [HIGH] FND-016 — Le violazioni di validazione non usano la forma di errore comune e non hanno un handler dedicato.

- File: `src/main/java/com/lipari/bank/common/GlobalExceptionHandler.java`
- Riga: 11-33
- Gravita gate: **HIGH**
- Reviewer: api-contract-reviewer
- Categoria: contract
- Regola: AC-03
- Evidenza: Esiste solo un body `{timestamp,status,error,message,correlationId}` per `IllegalArgumentException`/`RuntimeException`; `MethodArgumentNotValidException` e `HttpMessageNotReadableException` ricadono nella gestione di default di Spring con struttura diversa. Lo stesso endpoint può quindi restituire due forme di errore diverse.
- Correzione proposta (non applicata): Aggiungere handler per `MethodArgumentNotValidException` e `HttpMessageNotReadableException` che producano lo stesso `errorBody`, includendo l'elenco dei campi violati in un campo stabile. Non applicato.

### [HIGH] FND-017 — Login senza validazione di input e con codici/forma di errore non coerenti.

- File: `src/main/java/com/lipari/bank/web/AuthController.java`
- Riga: 20-32
- Gravita gate: **HIGH** — **CONFLITTO**: HIGH / MEDIUM
- Reviewer: api-contract-reviewer, security-reviewer
- Categoria: contract
- Regola: AC-01
- Evidenza: Il body è un `Map<String,String>` senza `@Valid`: username o password assenti non danno 400. Un username inesistente fa scattare `EmptyResultDataAccessException`, intercettata dal catch-all come 500 invece di 401; il 401 usa `{"error":"invalid credentials"}`, diverso dal body degli altri errori.
- Correzione proposta (non applicata): Introdurre `LoginRequest` con `@NotBlank`, gestire esplicitamente l'utente assente come 401 e restituire il body di errore comune anche per il 401. Non applicato.
- Sorgenti:
  - api-contract-reviewer (HIGH, API-004): Login senza validazione di input e con codici/forma di errore non coerenti.
  - security-reviewer (MEDIUM, SEC-007): La login espone l'esistenza dell'username tramite comportamento diverso in caso di errore.

### [MEDIUM] FND-018 — La risorsa assente viene mappata su 400 invece di 404.

- File: `src/main/java/com/lipari/bank/common/GlobalExceptionHandler.java`
- Riga: 14-17
- Gravita gate: **MEDIUM**
- Reviewer: api-contract-reviewer
- Categoria: contract
- Regola: AC-01
- Evidenza: `IllegalArgumentException` è sempre tradotto in `BAD_REQUEST`, quindi i messaggi "source account not found"/"target account not found" del trasferimento rispondono 400, pur essendo un riferimento a risorsa inesistente.
- Correzione proposta (non applicata): Distinguere l'eccezione di risorsa non trovata (es. dedicata) e mapparla su 404 con lo stesso `errorBody`. Non applicato.

### [MEDIUM] FND-019 — I vincoli di validazione non coprono lo schema del database.

- File: `src/main/java/com/lipari/bank/movement/dto/TransferRequest.java`
- Riga: 10-20
- Gravita gate: **MEDIUM**
- Reviewer: api-contract-reviewer
- Categoria: contract
- Regola: AC-02
- Evidenza: `description` non ha `@Size(max = 255)` mentre `movement.description` è `VARCHAR(255)`; `amount` non ha `@Digits(integer = 17, fraction = 2)` mentre la colonna è `DECIMAL(19,2)`. Input oltre soglia arriva al DB e produce un 500 generico invece di un 400 di validazione; inoltre il messaggio "amount must be > 0" non corrisponde alla soglia `0.01`.
- Correzione proposta (non applicata): Aggiungere `@Size(max = 255)` su `description`, `@Digits(integer = 17, fraction = 2)` su `amount` e allineare il messaggio alla soglia reale. Non applicato.

### [MEDIUM] FND-020 — Le liste non hanno paginazione ne limite dichiarato.

- File: `src/main/java/com/lipari/bank/movement/MovementController.java`
- Riga: 25-27
- Gravita gate: **MEDIUM**
- Reviewer: api-contract-reviewer
- Categoria: contract
- Regola: AC-08
- Evidenza: `GET /api/movements` restituisce tutti i movimenti del conto e `GET /api/accounts/with-movements` (AccountController linee 26-33) tutti i conti con tutti i movimenti: il payload cresce senza limite e il contratto non espone `page`/`size` ne un default.
- Correzione proposta (non applicata): Accettare parametri di paginazione con limiti espliciti e restituire una struttura con contenuto e metadati di pagina, dichiarandoli nel contratto. Non applicato.

### [LOW] FND-021 — Mancano schema OpenAPI e test HTTP di contratto.

- File: `pom.xml`
- Riga: 27-100
- Gravita gate: **LOW**
- Reviewer: api-contract-reviewer
- Categoria: contract
- Regola: AC-05
- Evidenza: Non c'è dipendenza springdoc ne file OpenAPI; l'unico test (`TransferIT`) invoca `MovementService` direttamente, senza MockMvc su percorsi, verbi, codici e forma degli errori.
- Correzione proposta (non applicata): Aggiungere la generazione OpenAPI degli endpoint e test MockMvc su 201/400/401/404 e sulla struttura JSON degli errori. Non applicato.

### [CRITICAL] FND-022 — Gli endpoint dei conti non verificano che la risorsa appartenga al chiamante autenticato.

- File: `src/main/java/com/lipari/bank/account/AccountController.java`
- Riga: 18-31
- Gravita gate: **CRITICAL**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-01
- Evidenza: `getAccount(@PathVariable Long id)` restituisce qualsiasi conto dato l'id e `listAllWithMovements()` restituisce tutti i conti con i movimenti; l'id arriva dal client e non c'e' alcun confronto tra `Account.customerId` e il principal. E' un IDOR che espone IBAN, saldo e movimenti di terzi a qualunque utente autenticato.
- Correzione proposta (non applicata): Derivare il customer dall'utente autenticato e verificare la proprieta' lato server prima di restituire il conto; per la lista limitare ai conti del chiamante o richiedere un ruolo esplicito. Non applicato.

### [CRITICAL] FND-023 — Trasferimenti e lista movimenti non verificano la proprieta' del conto rispetto al chiamante.

- File: `src/main/java/com/lipari/bank/movement/MovementController.java`
- Riga: 19-28
- Gravita gate: **CRITICAL**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-01
- Evidenza: `transfer` accetta `fromAccountId` dal body e addebita quel conto senza controllare che appartenga all'utente autenticato, permettendo di muovere denaro da conti altrui; `listByAccount(@RequestParam Long accountId)` espone i movimenti di qualunque conto. L'id e' usato come prova di autorizzazione.
- Correzione proposta (non applicata): Verificare lato server che `fromAccountId` (e i conti letti) siano riconducibili al principal prima di eseguire l'operazione, e restituire 403/404 in caso contrario. Non applicato.

### [CRITICAL] FND-024 — La chiave di firma JWT e' una costante hardcoded nel codice versionato.

- File: `src/main/java/com/lipari/bank/security/JwtService.java`
- Riga: 13
- Gravita gate: **CRITICAL**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-02
- Evidenza: `SECRET = "demo-jwt-secret-for-bootcamp-banking-system-must-be-long-enough"` e' nel sorgente; chiunque abbia accesso al repository puo' forgiare token validi per qualsiasi `username`, ottenendo impersonazione e bypass dell'autenticazione.
- Correzione proposta (non applicata): Caricare la chiave da variabile d'ambiente o secret manager, con valore lungo e casuale per ambiente, e prevedere rotazione. Non applicato.

### [HIGH] FND-025 — Credenziali del database in chiaro nella configurazione versionata.

- File: `src/main/resources/application.yml`
- Riga: 5-7
- Gravita gate: **HIGH**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-02
- Evidenza: `username: lipariuser` e `password: liparipassword` sono committati; chi legge il repository ottiene accesso diretto al DB. Inoltre `useSSL=false` nella JDBC URL lascia il traffico DB non cifrato.
- Correzione proposta (non applicata): Spostare le credenziali su variabili d'ambiente/secret manager, abilitare TLS verso il DB e usare un utente applicativo con privilegi minimi. Non applicato.

### [HIGH] FND-026 — Credenziali di default e relativi hash sono versionati nel changelog.

- File: `src/main/resources/db/changelog/001-base-schema.yaml`
- Riga: 75-78
- Gravita gate: **HIGH**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-08
- Evidenza: Il commento dichiara le password in chiaro (`alice123`, `bob123`) e inserisce gli hash BCrypt corrispondenti: sono credenziali note e fisse, utilizzabili per accedere agli ambienti che eseguono questo seed.
- Correzione proposta (non applicata): Rimuovere il seed delle credenziali dal changelog di produzione e fornire gli utenti demo solo in profili di test, con password generate e non documentate nel repository. Non applicato.

### [MEDIUM] FND-027 — I token non vincolano issuer/audience e non esiste revoca o rotazione.

- File: `src/main/java/com/lipari/bank/security/JwtService.java`
- Riga: 21-37
- Gravita gate: **MEDIUM**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-03
- Evidenza: `generate`/`parseUsername` non impostano ne' verificano `iss`/`aud` e non c'e' meccanismo di revoca: un token resta valido fino a `exp` (1 ora) anche dopo un cambio password o la disattivazione dell'utente.
- Correzione proposta (non applicata): Impostare e validare issuer e audience attesi e introdurre una strategia di revoca/rotazione (es. token version o blacklist) coerente con i requisiti. Non applicato.


## Dati machine-readable

Il file `report.json` contiene gli stessi dati in forma consumabile da una pipeline: `summary`, `budget`, `reviewers`, `findings` con `gateSeverity`, `severities`, `severityConflict`, `sources`.
