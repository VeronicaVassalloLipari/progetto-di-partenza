# Code Review Suite — LipariBank

- Run: `2026-11-06T14-59-25-053Z`
- Target: `src/main/java/com/lipari/bank`
- Modello: `(default OpenCode)`
- Avvio: 2026-11-06T14:59:25.055Z
- Durata totale: 99.3 s
- Esito: **GATE_FAILED**
- Findings: **30** totali, **29** unici, 1 duplicati riconciliati
- Conflitti di gravita: **1**

## Parallelismo

- Reviewer avviati: 4/4
- Scarto massimo fra gli avvii: 1 ms
- Coppie sovrapposte: 6/6
- Sovrapposizione reale: **si**

| Reviewer | Stato | Inizio | Fine | Durata | Token | Costo provider |
|---|---|---|---|---:|---:|---:|
| movements-reviewer | ok | 2026-11-06T14:59:25.884Z | 2026-11-06T15:01:04.303Z | 98.4 s | 116,690 | 0.0000 USD |
| amount-compliance-reviewer | ok | 2026-11-06T14:59:25.885Z | 2026-11-06T15:00:38.434Z | 72.5 s | 99,197 | 0.0000 USD |
| api-contract-reviewer | ok | 2026-11-06T14:59:25.885Z | 2026-11-06T15:00:30.476Z | 64.6 s | 88,875 | 0.0000 USD |
| security-reviewer | ok | 2026-11-06T14:59:25.885Z | 2026-11-06T15:00:35.329Z | 69.4 s | 80,072 | 0.0000 USD |

## Budget

- Tempo: 99.3 s / 360 s
- Token: 384,834 / 400,000
- Costo provider: 0.0000 USD
- Costo stimato: 0.0000 USD
- Costo effettivo (max): 0.0000 USD / nessun tetto
- Stato: **ok**

## Riepilogo per gravita (unici)

| Gravita | Conteggio |
|---|---:|
| CRITICAL | 5 |
| HIGH | 11 |
| MEDIUM | 11 |
| LOW | 2 |

## Reviewer falliti o non interpretabili

Nessuno: tutti i reviewer hanno risposto e l'output e' stato interpretato.

## Findings consolidati

### [CRITICAL] FND-001 — Il saldo dei due conti viene letto, controllato e riscritto senza lock pessimistico ne versione ottimistica.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 29-41
- Gravita gate: **CRITICAL**
- Reviewer: movements-reviewer
- Categoria: concurrency
- Regola: MOV-03
- Evidenza: from/to sono caricati con findById e poi modificati con setBalance; Account non ha alcun campo @Version. Due trasferimenti concorrenti sullo stesso conto leggono lo stesso saldo e l'ultimo commit sovrascrive l'altro (lost update); il controllo fondi alla riga 34 e un TOCTOU rispetto alla scrittura alla riga 38. L'ordine di caricamento segue gli id della request, quindi un futuro lock non deterministico esporrebbe anche a deadlock incrociati.
- Correzione proposta (non applicata): Acquisire i due conti in un ordine deterministico (es. id crescente) con lock pessimistico (SELECT ... FOR UPDATE) oppure introdurre @Version su Account e gestire OptimisticLockException, mantenendo controllo fondi e addebito dentro lo stesso confine transazionale. Non applicato.

### [HIGH] FND-002 — Il trasferimento non ha alcuna chiave di idempotenza persistita con vincolo di unicita.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 23-61
- Gravita gate: **HIGH**
- Reviewer: movements-reviewer
- Categoria: correctness
- Regola: MOV-02
- Evidenza: Ogni invocazione crea due Movement e riscrive i saldi senza verificare se la stessa richiesta e gia stata eseguita; un retry del client dopo un timeout duplica movimenti e spostamento di denaro. La tabella movement (001-base-schema.yaml) non ha colonne ne indici per una idempotency key.
- Correzione proposta (non applicata): Aggiungere una chiave di idempotenza fornita dal client (es. requestId/Idempotency-Key), persistita su una colonna con vincolo UNIQUE e verificata all'inizio del metodo, restituendo l'esito della prima esecuzione in caso di replay. Non applicato.

### [HIGH] FND-003 — Le due gambe TRANSFER_OUT/TRANSFER_IN non condividono alcun identificativo di operazione.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 43-59
- Gravita gate: **HIGH**
- Reviewer: movements-reviewer
- Categoria: traceability
- Regola: MOV-04
- Evidenza: out e in sono due entita indipendenti legate solo da amount, counterparty e description; Movement non ha un campo transferId/operationId e la risposta espone solo out.getId(). Due trasferimenti con stesso importo e stessa controparte non sono distinguibili ne ricostruibili in modo affidabile.
- Correzione proposta (non applicata): Introdurre un identificativo comune dell'operazione (es. colonna transfer_id/operation_id su movement, valorizzata con lo stesso valore su entrambe le gambe, con indice) e usarlo anche come transferId restituito. Non applicato.

### [MEDIUM] FND-004 — Le due gambe ricevono due Instant.now() distinti invece dello stesso istante di esecuzione.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 49
- Gravita gate: **MEDIUM**
- Reviewer: movements-reviewer
- Categoria: correctness
- Regola: MOV-05
- Evidenza: out.setExecutedAt(Instant.now()) alla riga 49 e in.setExecutedAt(Instant.now()) alla riga 58 producono timestamp diversi per la stessa operazione, rendendo incoerente la ricostruzione temporale della coppia.
- Correzione proposta (non applicata): Calcolare un unico Instant all'inizio del trasferimento e assegnarlo a entrambe le gambe. Non applicato.

### [MEDIUM] FND-005 — L'ordinamento per soli executedAt non e deterministico in caso di timestamp uguali.

- File: `src/main/java/com/lipari/bank/movement/MovementRepository.java`
- Riga: 7
- Gravita gate: **MEDIUM**
- Reviewer: movements-reviewer
- Categoria: correctness
- Regola: MOV-05
- Evidenza: findByAccountIdOrderByExecutedAtDesc non ha un criterio di spareggio; gambe della stessa operazione o movimenti nello stesso millisecondo possono cambiare ordine tra due letture. L'indice idx_movement_account_executed_at non include id.
- Correzione proposta (non applicata): Aggiungere un tie-break stabile (es. OrderByExecutedAtDescIdDesc) e valutare l'estensione dell'indice con id. Non applicato.

### [MEDIUM] FND-006 — La lista conti con movimenti esegue una query per ogni conto (N+1).

- File: `src/main/java/com/lipari/bank/account/AccountController.java`
- Riga: 27-31
- Gravita gate: **MEDIUM**
- Reviewer: movements-reviewer
- Categoria: correctness
- Regola: MOV-07
- Evidenza: accountRepo.findAll() seguito da movementRepo.findByAccountIdOrderByExecutedAtDesc(a.getId()) dentro la map genera N+1 select e carica l'intera storia dei movimenti per ogni conto, senza limite.
- Correzione proposta (non applicata): Recuperare i movimenti con una sola query (es. findByAccountIdInOrderBy... o join fetch) e raggrupparli in memoria, applicando un limite/paginazione ai movimenti recenti. Non applicato.

### [MEDIUM] FND-007 — L'unico test copre il solo happy path, dipende dai saldi di seed e non isola i dati.

- File: `src/test/java/com/lipari/bank/TransferIT.java`
- Riga: 20-33
- Gravita gate: **MEDIUM**
- Reviewer: movements-reviewer
- Categoria: correctness
- Regola: MOV-08
- Evidenza: il test usa gli account 1 e 2 e asserisce 900.00/600.00, valori derivati dal seed Liquibase (1000.00/500.00); non c'e rollback ne reset, quindi una seconda esecuzione parte da saldi gia modificati. Mancano casi di errore (fondi insufficienti, conto inesistente, stesso conto), verifica del rollback, concorrenza e isolamento; @ActiveProfiles("test") non ha un application-test.yml, quindi punta al database di sviluppo.
- Correzione proposta (non applicata): Rendere il test @Transactional o creare i dati nel test, aggiungere casi di errore con verifica di saldi e movimenti invariati, un test concorrente e una configurazione test dedicata (DB isolato). Non applicato.

### [LOW] FND-008 — Gli errori di dominio sono espressi con IllegalArgumentException generica anziche eccezioni tipizzate.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 25-35
- Gravita gate: **LOW**
- Reviewer: movements-reviewer
- Categoria: correctness
- Regola: MOV-06
- Evidenza: stesso conto, conto inesistente e fondi insufficienti lanciano IllegalArgumentException con messaggi testuali; il mapping 4xx oggi funziona, ma service e handler sono accoppiati solo per tipo generico e chiamate interne senza @Valid possono degradare a NPE/500.
- Correzione proposta (non applicata): Introdurre eccezioni di dominio dedicate (es. AccountNotFoundException, InsufficientFundsException, SameAccountException) mappate su 4xx e validare gli input anche nel service. Non applicato.

### [CRITICAL] FND-009 — Il movimento registra l'importo senza la valuta; lo schema `movement` non ha la colonna `currency`.

- File: `src/main/java/com/lipari/bank/movement/Movement.java`
- Riga: 21-22
- Gravita gate: **CRITICAL**
- Reviewer: amount-compliance-reviewer
- Categoria: compliance
- Regola: AMT-04
- Evidenza: `amount DECIMAL(19,2)` e nessun campo valuta: non e ricostruibile in quale valuta sia avvenuto l'addebito o l'accredito, quindi l'audit monetario previsto dalla policy resta incompleto.
- Correzione proposta (non applicata): Aggiungere `currency` (VARCHAR(3), non null) a `Movement` e al changelog `003-movement`, valorizzandola dalla valuta del conto alla creazione del movimento. Non applicato.

### [HIGH] FND-010 — Il trasferimento somma e sottrae gli importi senza verificare che i due conti abbiano la stessa valuta.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 34-41
- Gravita gate: **HIGH**
- Reviewer: amount-compliance-reviewer
- Categoria: correctness
- Regola: AMT-04
- Evidenza: `from.getBalance().subtract(req.getAmount())` e `to.getBalance().add(req.getAmount())` avvengono 1:1; con conti in valute diverse (il campo `Account.currency` esiste) si accredita lo stesso numero senza conversione.
- Correzione proposta (non applicata): Confrontare `from.getCurrency()` e `to.getCurrency()` e rifiutare il trasferimento se diverse, oppure applicare un cambio esplicito e tracciato. Non applicato.

### [HIGH] FND-011 — Nessun controllo delle soglie AML: i movimenti oltre 10.000 EUR non sono segnalati e quelli oltre 5.000 EUR non sono registrati nell'audit.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 34-59
- Gravita gate: **HIGH**
- Reviewer: amount-compliance-reviewer
- Categoria: compliance
- Regola: AMT-07
- Evidenza: Il service esegue il trasferimento senza confrontare `req.getAmount()` con le soglie 10.000 e 5.000 della policy; tali valori non compaiono in nessun punto del codice.
- Correzione proposta (non applicata): Introdurre le soglie come costanti uniche (10.000 per la segnalazione, 5.000 per l'audit) e applicarle durante la registrazione del movimento. Non applicato.

### [HIGH] FND-012 — Il movimento non persiste `correlationId`, `userId` e `ipAddress`; l'audit monetario richiesto non e completo.

- File: `src/main/java/com/lipari/bank/movement/Movement.java`
- Riga: 29-30
- Gravita gate: **HIGH**
- Reviewer: amount-compliance-reviewer
- Categoria: traceability
- Regola: AMT-08
- Evidenza: `Movement` conserva solo `executedAt` e l'importo; il `correlationId` presente nell'MDC non viene salvato e utente/IP non sono raccolti, quindi non e possibile ricostruire chi ha eseguito il movimento e da dove.
- Correzione proposta (non applicata): Aggiungere `correlationId`, `userId` e `ipAddress` a `Movement` (e al changelog) e valorizzarli in `MovementService` da MDC, sicurezza e richiesta. Non applicato.

### [MEDIUM] FND-013 — L'importo non viene normalizzato a scale 2 con un `RoundingMode` esplicito prima del calcolo e della persistenza.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 38-39
- Gravita gate: **MEDIUM**
- Reviewer: amount-compliance-reviewer
- Categoria: correctness
- Regola: AMT-03
- Evidenza: `req.getAmount()` puo avere piu di 2 decimali; viene sottratto o aggiunto al saldo e poi salvato su `DECIMAL(19,2)`, dove l'arrotondamento implicito del DB puo differire dall'importo usato nel calcolo (es. 10,004 movimenta 10,00).
- Correzione proposta (non applicata): Validare o normalizzare l'importo con `setScale(2, RoundingMode.HALF_UP)` (in alternativa rifiutare scale maggiori di 2) in un unico punto, con lo stesso `RoundingMode` per addebito e accredito. Non applicato.

### [MEDIUM] FND-014 — Il service non impone un massimale di operazione ne rivalida che l'importo sia strettamente positivo.

- File: `src/main/java/com/lipari/bank/movement/MovementService.java`
- Riga: 24-38
- Gravita gate: **MEDIUM**
- Reviewer: amount-compliance-reviewer
- Categoria: compliance
- Regola: AMT-05
- Evidenza: La sola validazione `@DecimalMin("0.01")` sta nel DTO e si applica solo via controller; una chiamata diretta a `transfer(...)` con importo zero, negativo o arbitrariamente grande non viene fermata.
- Correzione proposta (non applicata): Aggiungere in `MovementService` un controllo `amount > 0` e un massimale di operazione come costante esplicita, lanciando un errore di dominio. Non applicato.

### [HIGH] FND-015 — Le risposte espongono direttamente entity JPA (`Movement`, `Account`) invece di DTO espliciti.

- File: `src/main/java/com/lipari/bank/movement/MovementController.java`
- Riga: 26-28
- Gravita gate: **HIGH**
- Reviewer: api-contract-reviewer
- Categoria: contract
- Regola: AC-04
- Evidenza: `GET /api/movements` restituisce `List<Movement>`; `AccountController.getAccount` restituisce `Account` (righe 19-22) e `AccountWithMovements` (riga 33) incapsula `Account` e `List<Movement>`. Una rinomina o un cambio di tipo sul lato persistenza diventa un breaking change non dichiarato per il client, e campi interni (`accountId`, `counterpartyAccountId`, `customerId`) finiscono nel payload.
- Correzione proposta (non applicata): Introdurre DTO di risposta dedicati (es. `MovementResponse`, `AccountResponse`, `AccountWithMovementsResponse`) e mappare le entity nei controller o in un mapper. Non applicato.

### [HIGH] FND-016 — `POST /api/movements/transfer` risponde 200 invece di 201 per una creazione con effetti.

- File: `src/main/java/com/lipari/bank/movement/MovementController.java`
- Riga: 21
- Gravita gate: **HIGH**
- Reviewer: api-contract-reviewer
- Categoria: contract
- Regola: AC-01
- Evidenza: `ResponseEntity.ok(movementService.transfer(req))` restituisce 200 OK su un'operazione che crea due movimenti e modifica i saldi; il contratto richiede 201 per una creazione.
- Correzione proposta (non applicata): Restituire `ResponseEntity.status(HttpStatus.CREATED).body(...)` (eventualmente con header `Location` sul movimento creato). Non applicato.

### [HIGH] FND-017 — Il conto inesistente restituisce 400 invece di 404.

- File: `src/main/java/com/lipari/bank/common/GlobalExceptionHandler.java`
- Riga: 14-17
- Gravita gate: **HIGH**
- Reviewer: api-contract-reviewer
- Categoria: contract
- Regola: AC-01
- Evidenza: `MovementService.transfer` lancia `IllegalArgumentException("source account not found")` / `"target account not found"`, mappate indistintamente a `HttpStatus.BAD_REQUEST`. Il client non distingue un payload malformato da una risorsa assente.
- Correzione proposta (non applicata): Introdurre un'eccezione dedicata (es. `NotFoundException`) mappata a 404 con lo stesso error body, lasciando `IllegalArgumentException` per gli input non validi. Non applicato.

### [HIGH] FND-018 — Le violazioni di validazione e gli errori di tipo non producono la forma di errore comune.

- File: `src/main/java/com/lipari/bank/common/GlobalExceptionHandler.java`
- Riga: 14-33
- Gravita gate: **HIGH**
- Reviewer: api-contract-reviewer
- Categoria: contract
- Regola: AC-03
- Evidenza: `@Valid` su `TransferRequest` genera `MethodArgumentNotValidException` e `/api/movements?accountId=abc` genera `MethodArgumentTypeMismatchException`: nessuno dei due e gestito, quindi rispondono con il body di default di Spring, diverso da `errorBody(...)`. Inoltre `AccountController` restituisce 404 con body vuoto (`ResponseEntity.notFound().build()`). Lo stesso endpoint espone quindi forme di errore diverse.
- Correzione proposta (non applicata): Aggiungere handler per `MethodArgumentNotValidException` (con elenco campi/messaggi), `MethodArgumentTypeMismatchException` e `MissingServletRequestParameterException`, tutti convogliati su `errorBody(...)`; far restituire il body di errore anche al 404 di `AccountController`. Non applicato.

### [HIGH] FND-019 — Il login usa una `Map` senza validazione e risponde 500 su utente inesistente invece di 401.

- File: `src/main/java/com/lipari/bank/web/AuthController.java`
- Riga: 21-33
- Gravita gate: **HIGH** — **CONFLITTO**: HIGH / MEDIUM
- Reviewer: api-contract-reviewer, security-reviewer
- Categoria: contract
- Regola: AC-01
- Evidenza: Con username non presente, `jdbc.queryForObject(...)` lancia `EmptyResultDataAccessException`, catturata da `handleGeneric` come 500; con `username`/`password` assenti dal body si ottiene lo stesso 500. Il 401 usa inoltre `Map.of("error", ...)`, forma diversa da `errorBody(...)` sullo stesso endpoint.
- Correzione proposta (non applicata): Introdurre un `LoginRequest` con `@NotBlank`, gestire l'utente assente come 401 (o `Optional`/query tollerante) e restituire sempre la forma di errore comune. Non applicato.
- Sorgenti:
  - api-contract-reviewer (HIGH, API-005): Il login usa una `Map` senza validazione e risponde 500 su utente inesistente invece di 401.
  - security-reviewer (MEDIUM, SEC-006): Il login distingue utente inesistente da password errata e non prevede protezione contro tentativi ripetuti.

### [MEDIUM] FND-020 — Le annotazioni non sono allineate allo schema del database per `description` e `amount`.

- File: `src/main/java/com/lipari/bank/movement/dto/TransferRequest.java`
- Riga: 17-20
- Gravita gate: **MEDIUM**
- Reviewer: api-contract-reviewer
- Categoria: contract
- Regola: AC-02
- Evidenza: `description` mappa su `VARCHAR(255)` ma non ha `@Size(max = 255)`: un valore piu lungo arriva al database e produce un 500 invece di un 400. `amount` mappa su `DECIMAL(19,2)` ma non ha `@Digits(integer = 17, fraction = 2)`: valori con piu di due decimali vengono accettati e arrotondati in persistenza, con risposta incoerente rispetto a quanto salvato.
- Correzione proposta (non applicata): Aggiungere `@Size(max = 255)` su `description` e `@Digits(integer = 17, fraction = 2)` su `amount`, con messaggi coerenti ai vincoli. Non applicato.

### [MEDIUM] FND-021 — Le liste non dichiarano paginazione ne limite, e `GET /api/accounts/with-movements` restituisce tutti i conti.

- File: `src/main/java/com/lipari/bank/movement/MovementController.java`
- Riga: 26-28
- Gravita gate: **MEDIUM**
- Reviewer: api-contract-reviewer
- Categoria: contract
- Regola: AC-08
- Evidenza: `GET /api/movements` e `GET /api/accounts/with-movements` (`AccountController` righe 27-31) restituiscono l'intero insieme senza parametri `page`/`size` ne tetto massimo; il payload cresce senza controllo e il contratto non dichiara ordinamento se non nel nome del metodo del repository.
- Correzione proposta (non applicata): Introdurre parametri di paginazione con default e massimo espliciti, restituire una struttura con metadati (contenuto, pagina, totale) e dichiarare l'ordinamento nel contratto. Non applicato.

### [LOW] FND-022 — Mancano schema OpenAPI e test HTTP di contratto su percorsi, codici e forma degli errori.

- File: `src/test/java/com/lipari/bank/TransferIT.java`
- Riga: 14-33
- Gravita gate: **LOW**
- Reviewer: api-contract-reviewer
- Categoria: traceability
- Regola: AC-05
- Evidenza: Non esiste alcun file OpenAPI nel repository e l'unico test (`TransferIT`) invoca `MovementService` direttamente: nessuna copertura MockMvc per i codici 201/400/401/404 ne per la forma dell'error body.
- Correzione proposta (non applicata): Aggiungere lo schema OpenAPI degli endpoint esposti e test MockMvc che verifichino percorso, verbo, codice di stato e struttura JSON degli errori. Non applicato.

### [CRITICAL] FND-023 — La chiave di firma JWT e' una costante in chiaro nel codice versionato.

- File: `src/main/java/com/lipari/bank/security/JwtService.java`
- Riga: 12-18
- Gravita gate: **CRITICAL**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-02
- Evidenza: Chiunque legga il repository puo' firmare token validi per qualsiasi `sub` (es. "alice") e superare `anyRequest().authenticated()`, ottenendo accesso completo.
- Correzione proposta (non applicata): Caricare il segreto da variabile d'ambiente/secret manager, generarlo casualmente con almeno 256 bit, prevedere rotazione e un `kid` per la selezione della chiave. Non applicato.

### [CRITICAL] FND-024 — Gli endpoint restituiscono conti e movimenti di qualsiasi cliente senza verificare la proprieta' rispetto all'utente autenticato (IDOR).

- File: `src/main/java/com/lipari/bank/account/AccountController.java`
- Riga: 18-31
- Gravita gate: **CRITICAL**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-01
- Evidenza: `getAccount(@PathVariable Long id)` e `listAllWithMovements()` non confrontano `account.customerId` con il principal: un utente autenticato legge saldi e movimenti di tutti i conti, e `with-movements` li espone tutti in blocco.
- Correzione proposta (non applicata): Risolvere username -> customer, verificare che il conto appartenga al cliente e rispondere 403/404 in caso contrario; limitare `with-movements` a un ruolo amministrativo esplicito. Non applicato.

### [CRITICAL] FND-025 — Trasferimenti e lettura movimenti accettano ID conto dal client senza controllo di proprieta'.

- File: `src/main/java/com/lipari/bank/movement/MovementController.java`
- Riga: 19-28
- Gravita gate: **CRITICAL**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-01
- Evidenza: `POST /api/movements/transfer` usa `req.getFromAccountId()` come prova di autorizzazione: un utente puo' addebitare il conto di un altro cliente; `GET /api/movements?accountId=` espone i movimenti di qualsiasi conto.
- Correzione proposta (non applicata): Derivare il conto di addebito dal principal o verificare la proprieta' di `fromAccountId` prima del trasferimento, e verificare che `accountId` in lettura appartenga al chiamante. Non applicato.

### [HIGH] FND-026 — Credenziali del database in chiaro nella configurazione versionata e connessione senza TLS.

- File: `src/main/resources/application.yml`
- Riga: 5-7
- Gravita gate: **HIGH**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-02
- Evidenza: `username: lipariuser` / `password: liparipassword` e `useSSL=false` espongono le credenziali a chiunque acceda al repository e le trasmettono in chiaro sulla rete.
- Correzione proposta (non applicata): Spostare le credenziali su variabili d'ambiente/secret manager, abilitare TLS (`useSSL=true` con verifica del certificato) e usare un utente DB con privilegi minimi. Non applicato.

### [MEDIUM] FND-027 — I token non vincolano esplicitamente l'algoritmo e non contengono/verificano issuer e audience; non e' prevista revoca.

- File: `src/main/java/com/lipari/bank/security/JwtService.java`
- Riga: 21-37
- Gravita gate: **MEDIUM**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-03
- Evidenza: `signWith(signingKey())` sceglie l'algoritmo dalla lunghezza della chiave e `parseUsername` accetta qualunque algoritmo HMAC compatibile; senza `iss`/`aud` un token emesso per un altro contesto resta valido, e non esiste meccanismo di revoca entro l'ora di scadenza.
- Correzione proposta (non applicata): Fissare esplicitamente l'algoritmo atteso, aggiungere e verificare `iss` e `aud` nel parser, e prevedere rotazione/revoca (es. `jti` con denylist o scadenza piu' breve con refresh). Non applicato.

### [MEDIUM] FND-028 — L'intero namespace `/actuator/**` e' pubblico.

- File: `src/main/java/com/lipari/bank/security/SecurityConfig.java`
- Riga: 29-31
- Gravita gate: **MEDIUM**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-08
- Evidenza: `requestMatchers("/api/auth/**", "/actuator/**").permitAll()` apre qualsiasi endpoint di management futuro; oggi e' esposto solo `health,info`, ma l'allowlist e' piu' ampia del necessario e non tiene conto di dettagli o env.
- Correzione proposta (non applicata): Consentire in chiaro solo `/actuator/health` e `/actuator/info`, proteggere gli altri endpoint o esporli su una porta di management separata. Non applicato.

### [MEDIUM] FND-029 — Il changelog versionato crea utenti con credenziali note e relativi hash BCrypt.

- File: `src/main/resources/db/changelog/001-base-schema.yaml`
- Riga: 63-78
- Gravita gate: **MEDIUM**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-08
- Evidenza: Il changeSet `005-seed-demo-data` inserisce `alice`/`bob` con hash delle password "alice123" e "bob123" documentate nel commento: in ogni ambiente che applica il changelog esistono credenziali di default valide.
- Correzione proposta (non applicata): Eseguire il seed solo in profilo di sviluppo con password generate, oppure rimuoverlo dal changelog di produzione e forzare il cambio password al primo accesso. Non applicato.


## Dati machine-readable

Il file `report.json` contiene gli stessi dati in forma consumabile da una pipeline: `summary`, `budget`, `reviewers`, `findings` con `gateSeverity`, `severities`, `severityConflict`, `sources`.
