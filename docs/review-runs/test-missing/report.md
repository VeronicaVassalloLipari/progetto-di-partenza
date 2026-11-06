# Code Review Suite — LipariBank

- Run: `2026-11-06T15-16-45-771Z`
- Target: `src/main/java/com/lipari/bank/security/SecurityConfig.java`
- Modello: `(default OpenCode)`
- Avvio: 2026-11-06T15:16:45.877Z
- Durata totale: 46.7 s
- Esito: **REVIEWER_FAILED**
- Findings: **3** totali, **3** unici, 0 duplicati riconciliati
- Conflitti di gravita: **0**

## Parallelismo

- Reviewer avviati: 1/2
- Scarto massimo fra gli avvii: 0 ms
- Coppie sovrapposte: 0/0
- Sovrapposizione reale: **no**

| Reviewer | Stato | Inizio | Fine | Durata | Token | Costo provider |
|---|---|---|---|---:|---:|---:|
| security-reviewer | ok | 2026-11-06T15:16:46.775Z | 2026-11-06T15:17:32.554Z | 45.8 s | 69,082 | 0.0000 USD |
| missing-reviewer | failed | 2026-11-06T15:16:46.776Z | 2026-11-06T15:16:46.777Z | 0.0 s | 0 | 0.0000 USD |

## Budget

- Tempo: 46.7 s / 180 s
- Token: 69,082 / 120,000
- Costo provider: 0.0000 USD
- Costo stimato: 0.0000 USD
- Costo effettivo (max): 0.0000 USD / nessun tetto
- Stato: **ok**

## Riepilogo per gravita (unici)

| Gravita | Conteggio |
|---|---:|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 2 |
| LOW | 1 |

## Reviewer falliti o non interpretabili

### missing-reviewer — failed

- Motivo: agent non trovato: .opencode\agents\missing-reviewer.md


## Findings consolidati

### [MEDIUM] FND-001 — L'intera area /actuator e' resa pubblica con un matcher wildcard `permitAll`.

- File: `src/main/java/com/lipari/bank/security/SecurityConfig.java`
- Riga: 30
- Gravita gate: **MEDIUM**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-06
- Evidenza: Oggi `management.endpoints.web.exposure.include` limita a `health,info`, ma la regola non e' vincolata a quei due path: qualunque endpoint di management reso disponibile in futuro (metrics, env, heapdump) sarebbe automaticamente raggiungibile senza autenticazione, e /actuator/info puo' esporre versione e build.
- Correzione proposta (non applicata): Restringere a `requestMatchers("/actuator/health").permitAll()` e richiedere autenticazione (o un ruolo dedicato) per tutto il resto di /actuator/**, mantenendolo coerente con `management.endpoints.web.exposure.include`. Non applicato.

### [MEDIUM] FND-002 — La catena di sicurezza non impone HTTPS e non emette HSTS su richieste in chiaro.

- File: `src/main/java/com/lipari/bank/security/SecurityConfig.java`
- Riga: 25-34
- Gravita gate: **MEDIUM**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-07
- Evidenza: `application.yml` espone `server.port: 8080` senza TLS e qui non c'e' alcun `requiresChannel(...).requiresSecure()`; credenziali di login e token Bearer possono viaggiare in chiaro se non c'e' un proxy che termina TLS, e HSTS non viene applicato sulle richieste HTTP.
- Correzione proposta (non applicata): Se il TLS e' terminato a monte, documentarlo esplicitamente e configurare `server.forward-headers-strategy`; altrimenti aggiungere `.requiresChannel(c -> c.anyRequest().requiresSecure())` e abilitare HSTS con `includeSubDomains`. Non applicato.

### [LOW] FND-003 — Il prefisso `/api/auth/**` e' pubblico per intero invece dei soli endpoint di autenticazione.

- File: `src/main/java/com/lipari/bank/security/SecurityConfig.java`
- Riga: 30
- Gravita gate: **LOW**
- Reviewer: security-reviewer
- Categoria: security
- Regola: SEC-01
- Evidenza: Attualmente sotto /api/auth esiste solo `POST /api/auth/login`, ma ogni nuovo endpoint aggiunto nello stesso package (es. reset password, profilo, gestione utenti) diventerebbe pubblico per default senza revisione della configurazione.
- Correzione proposta (non applicata): Elencare esplicitamente i soli path pubblici (es. `"/api/auth/login"`) al posto del wildcard `/api/auth/**`. Non applicato.


## Dati machine-readable

Il file `report.json` contiene gli stessi dati in forma consumabile da una pipeline: `summary`, `budget`, `reviewers`, `findings` con `gateSeverity`, `severities`, `severityConflict`, `sources`.
