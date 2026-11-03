# LipariBank — il progetto su cui lavori

Backend REST Spring Boot 3.3 su Java 21, con i tre concetti minimi di una banca: `Customer`, `Account`, `Movement`. Gira, ha un database vero e un'autenticazione vera, ed è la codebase che i tuoi agent leggeranno, recensiranno e interrogheranno per tre giorni.

Il bootcamp **non insegna Spring e non ti chiede di scrivere Java**. Questo progetto è il bersaglio: quello che scrivi tu sta in `.claude/`, in `.opencode/` e negli script che orchestrano gli agent. Il LipariBank è ciò su cui li fai lavorare.

Se arrivi dal Bootcamp Microservizi del catalogo Lipari e hai il tuo LipariBank Multi-Service, usa quello: è più ricco e va benissimo. Questo serve a chi arriva senza un progetto banking in mano, e nessuna giornata dà per scontato che tu abbia l'uno o l'altro.

---

## Farlo partire

Serve Docker. Maven no: il progetto porta il **wrapper**, che al primo uso scarica da sé la versione giusta.

```bash
docker compose up -d          # MySQL 8 sulla 3306, con volume persistente
./mvnw spring-boot:run           # l'applicazione sulla 8080
```

Liquibase crea lo schema e i dati di esempio al primo avvio: due clienti, due conti con saldo, due utenti.

Verifica che risponda:

```bash
curl -s localhost:8080/actuator/health
# → {"status":"UP"}
```

### Autenticarsi e fare un bonifico

Tutto ciò che non è `/api/auth/**` o `/actuator/**` vuole un token.

```bash
TOKEN=$(curl -s -X POST localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"alice123"}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl -s -X POST localhost:8080/api/movements/transfer \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"fromAccountId":1,"toAccountId":2,"amount":100.00,"description":"prova"}'
```

Il secondo utente è `bob` / `bob123`, e i due conti di partenza hanno 1000,00 e 500,00 euro.

### Gli endpoint, tutti quelli che ci sono

| Metodo e percorso | Cosa fa | Token |
|---|---|:-:|
| `POST /api/auth/login` | restituisce un JWT dato username e password | no |
| `POST /api/movements/transfer` | trasferisce fra due conti e registra i movimenti | sì |
| `GET /api/movements?accountId=1` | i movimenti di un conto, dal più recente | sì |
| `GET /api/accounts/{id}` | un conto | sì |
| `GET /api/accounts/with-movements` | tutti i conti, ciascuno con i suoi movimenti | sì |
| `GET /actuator/health` | stato dell'applicazione | no |

---

## Com'è fatto

```
progetto-di-partenza/
├── pom.xml
├── Dockerfile
├── docker-compose.yml
├── .gitignore
└── src/
    ├── main/
    │   ├── java/com/lipari/bank/
    │   │   ├── LipariBankApplication.java
    │   │   ├── common/
    │   │   │   ├── CorrelationIdFilter.java      un id di correlazione nell'MDC dei log
    │   │   │   └── GlobalExceptionHandler.java   @RestControllerAdvice
    │   │   ├── customer/       Customer, CustomerRepository
    │   │   ├── account/        Account (saldo in BigDecimal), Repository, Controller
    │   │   ├── movement/       Movement, Repository, Service, Controller, dto/
    │   │   ├── security/       SecurityConfig, JwtFilter, JwtService
    │   │   └── web/            AuthController
    │   └── resources/
    │       ├── application.yml
    │       └── db/changelog/   lo schema e i dati di esempio, in Liquibase
    └── test/
        └── java/com/lipari/bank/TransferIT.java  il caso felice del bonifico
```

Diciannove classi Java, due changeset Liquibase. Il cuore è `MovementService.transfer()`: è il metodo transazionale che sposta il denaro, ed è il posto da cui conviene partire a leggere.

---

## Il repository git

Il progetto arriva come cartella, non come repository, e il `.gitignore` c'è già. Inizializzalo prima di cominciare, perché ogni giornata ti chiede di lavorare per commit:

```bash
git init
git add -A
git commit -m "LipariBank: punto di partenza del bootcamp"
```

---

## Cosa non è

Non è un sistema production-grade, e non pretende di esserlo: non ha circuit breaker, né retry, né audit trail completo, né multi-valuta. Non è multi-servizio: c'è un solo Spring service, che non parla con nessun altro. E non è pronto per un cluster: niente profili per ambiente, niente telemetria, niente probe pensate per la produzione.

Soprattutto: **non è un'architettura modello.** È un backend scritto come lo scrive una squadra sotto scadenza, con le scorciatoie che una squadra sotto scadenza prende. È esattamente per questo che serve: i tuoi reviewer avranno qualcosa di vero da trovare, e quello che troveranno non te l'ha suggerito nessuno.

Per la stessa ragione, se lo riusi fuori dal bootcamp trattalo come codice da recensire, non come codice da mostrare.

---

## Claude Code Assets (OpenCode)

Il controllo delle review vive nel repository e parte da solo. Gli asset sono scritti per OpenCode: i subagent stanno in `.opencode/agents/`, le skill in `.opencode/skills/`, e il routing è in `AGENTS.md`.

| Artefatto | Percorso | Description (in sintesi) | Esempio di invocazione |
|---|---|---|---|
| Reviewer movimenti | `.opencode/agents/movements-reviewer.md` | Parte solo sulla logica interna dei movimenti; non su Controller/DTO, denaro/AML, build. | `Fai la review di src/main/java/com/lipari/bank/movement/MovementService.java` |
| Reviewer compliance importi | `.opencode/agents/amount-compliance-reviewer.md` | Parte solo sul denaro: BigDecimal, valuta, arrotondamenti, fondi insufficienti, soglie AML, audit. | `Fai la review di src/main/java/com/lipari/bank/account/Account.java` |
| Reviewer contratto API | `.opencode/agents/api-contract-reviewer.md` | Parte solo su ciò che la banca espone: `*Controller.java`, `dto/`, verbi, codici, validazione, error body. | `Fai la review del contratto di src/main/java/com/lipari/bank/movement/dto/TransferRequest.java` |
| Formato condiviso | `.opencode/skills/review-findings-format/SKILL.md` | Fissa file/riga, gravità, correzione non applicata, tono pari e blocco machine-readable. | Caricata dai tre reviewer prima dell'output; `skill review-findings-format` |
| Policy AML | `.opencode/skills/lipari-aml-policy/SKILL.md` | Soglie, PEP, watchlist, audit, pattern sospetti. | Caricata dal solo `amount-compliance-reviewer` |
| Routing | `AGENTS.md` | Ordine di priorità e caso `MovementController.java`. | Vale per ogni richiesta di review |

### Regola di separazione dei perimetri

I confini si separano per **tipo di cambiamento**, in ordine di priorità: prima il contratto verso l'esterno (Controller, DTO), poi il denaro (importi, valuta, AML), poi la logica interna dei movimenti. Vince il primo che corrisponde; gli altri non partono.

Caso difficile: `MovementController.java` sta nel package `movement`, maneggia un importo ed espone il contratto. Vince il **contratto**: è ciò che legge il cliente, quindi la review è `api-contract-reviewer`; `amount-compliance-reviewer` e `movements-reviewer` non partono su quel file.

Fuori perimetro: build, `pom.xml`, configurazione, security, customer e test non collegati ai movimenti non attivano nessun reviewer; risponde l'agente principale (traccia: `docs/review-traces/review-pom-out-of-perimeter.md`).

### Le tre decisioni

1. **Dove passano i confini.** Per tipo di cambiamento, con priorità contratto > denaro > movimenti interni, perché il costo di sbagliare è diverso: un breaking change sul contratto lo paga il cliente, un importo sbagliato lo paga la compliance, un bug interno lo paga la banca. Sul caso `MovementController.java` vince il contratto; gli altri due sono esclusi per description, non per buona volontà.
2. **Policy AML: skill o MCP?** Skill. La policy è un manuale operativo statico, versionato nel repository, leggibile da chiunque debba applicarlo (oggi i reviewer, domani un quarto reviewer o un controllo di compliance). Un MCP server servirebbe per una valutazione a runtime: ha senso per watchlist e PEP, non per le soglie.
3. **Dove vive il formato.** In una skill caricata dai tre (`review-findings-format`), non ripetuta nei system prompt e non imposta dallo slash command: un quarto reviewer scritto da qualcun altro deve solo caricare la stessa skill per uscire nello stesso formato, senza che nessuno glielo spieghi.

### Cosa ho cambiato dell'ereditato di Gino, e perché

- **`.claude/agents/code-reviewer.md` → tre subagent in `.opencode/agents/`**: OpenCode non legge `.claude/agents/`, e un unico reviewer generico non può reggere tre perimetri disgiunti.
- **Rimossa `model: sonnet`**: OpenCode non conosce quel nome e rifiuta il file con un errore generico.
- **`tools: ["*"]` → `permission: edit: deny` e bash in allowlist (`git status`, `git diff`, `git log`)**: con `*` il reviewer poteva riscrivere il codice (a Gino è successo), e il divieto deve essere applicato dal CLI, non sperato dal prompt.
- **Hook in `.claude/settings.json` → blocco `permission` di ogni reviewer**: su OpenCode quell'hook non ha effetto; il presidio equivalente, applicato da codice, è il permesso per agente.
- **`compliance-aml-check` → `lipari-aml-policy`**: una skill non fa routing e il nome "check" suggeriva un controllo autonomo che si sovrapponeva ai reviewer; ora è il manuale delle soglie, caricato dal solo `amount-compliance-reviewer`.
- **`description: Reviewer di codice` → description con "Usalo SOLO quando…" ed esclusioni esplicite**: la description decide il routing; se è larga, il reviewer parte anche sui perimetri degli altri e il fatto che sia partito non distingue più niente.
- **Hook di log (`log-tool.py`) non portato**: registrava ogni strumento senza limite (il "log enorme" delle note di Gino) e non è il presidio richiesto dal criterio 5, che è coperto dai permessi.
- **Rimosso `hello-banking.md`**: era un subagent di test, non un reviewer; l'esercizio chiede tre subagent con perimetri disgiunti.

### Prova che gira

- `docs/review-traces/review-MovementService.md` — prompt sul dominio movimenti, parte `movements-reviewer`.
- `docs/review-traces/review-TransferRequest.md` — prompt sul contratto, parte `api-contract-reviewer`.
- `docs/review-traces/review-pom-out-of-perimeter.md` — prompt sulla build, non parte nessun reviewer.

Le due review sono state eseguite nella stessa sessione, una dopo l'altra, e i file `.md` contengono prompt e output. Lo screenshot della sessione è l'altra metà della prova richiesta.

