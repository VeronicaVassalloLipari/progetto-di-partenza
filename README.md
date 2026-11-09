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
├── .mcp.json                  server MCP per Claude Code
├── .opencode/                 agenti, skill, config OpenCode
├── finbank-mcp/               server MCP read-only (FASE 3)
│   ├── server.py
│   ├── policies/transfer-rules.md
│   └── README.md
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
| Reviewer sicurezza | `.opencode/agents/security-reviewer.md` | Parte solo sulla sicurezza: autenticazione, autorizzazione, JWT, segreti, password, injection, esposizione dati, header/CORS/CSRF. | `Fai la review di src/main/java/com/lipari/bank/security/SecurityConfig.java` |
| Formato condiviso | `.opencode/skills/review-findings-format/SKILL.md` | Fissa file/riga, gravità, correzione non applicata, tono pari e blocco machine-readable. | Caricata dai quattro reviewer prima dell'output; `skill review-findings-format` |
| Policy AML | `.opencode/skills/lipari-aml-policy/SKILL.md` | Soglie, PEP, watchlist, audit, pattern sospetti; e' anche la fonte della resource `finbank://policies/aml` (FASE 3). | Caricata dal solo `amount-compliance-reviewer`; la resource viene letta e citata dallo stesso reviewer |
| Routing | `AGENTS.md` | Ordine di priorità, caso `MovementController.java` e nota sulla suite. | Vale per ogni richiesta di review interattiva |
| Suite quattro reviewer | `.opencode/code-review-suite.ts` | Lancia i quattro reviewer in parallelo, applica budget, deduplica e scrive report MD/JSON. | `npm run review -- "src/main/java/com/lipari/bank" --out docs/review-runs/run-001` |

### Regola di separazione dei perimetri

I confini si separano per **tipo di cambiamento**, in ordine di priorità: prima il contratto verso l'esterno (Controller, DTO), poi il denaro (importi, valuta, AML), poi la logica interna dei movimenti, poi la sicurezza richiesta esplicitamente (autenticazione, autorizzazione, JWT, segreti, injection, header/CORS/CSRF). Vince il primo che corrisponde; gli altri non partono. Se il target non ricade in nessuno dei quattro, risponde l'agente principale.

Caso difficile: `MovementController.java` sta nel package `movement`, maneggia un importo ed espone il contratto. Vince il **contratto**: è ciò che legge il cliente, quindi la review è `api-contract-reviewer`; `amount-compliance-reviewer`, `movements-reviewer` e `security-reviewer` non partono su quel file nella review interattiva.

Fuori perimetro: build, `pom.xml`, configurazione non di sicurezza, customer e test non collegati ai movimenti non attivano nessun reviewer (traccia: `docs/review-traces/review-pom-out-of-perimeter.md`). La sicurezza ha un reviewer dedicato: è il quarto perimetro, non più fuori.

La regola qui sopra vale per la **review interattiva**. La suite da riga di comando è l'eccezione: `code-review-suite` lancia tutti e quattro i reviewer sullo stesso target, perché il report unificato li riconcilia (vedi [Code Review Suite](#code-review-suite)).

### Le tre decisioni

1. **Dove passano i confini.** Per tipo di cambiamento, con priorità contratto > denaro > movimenti interni > sicurezza, perché il costo di sbagliare è diverso: un breaking change sul contratto lo paga il cliente, un importo sbagliato lo paga la compliance, un bug interno lo paga la banca, una falla lo paga chiunque. Sul caso `MovementController.java` vince il contratto; gli altri tre sono esclusi per description, non per buona volontà.
2. **Policy AML: skill o MCP?** La fonte resta la skill, ma ora è anche una resource MCP. La policy è un manuale operativo statico, versionato nel repository, leggibile da chiunque debba applicarlo (oggi i reviewer, domani un quinto reviewer o un controllo di compliance). Il server MCP `finbank` la espone come `finbank://policies/aml`: il reviewer la legge e la cita dalla resource, non a memoria. Il server serve per lo stato dinamico (saldi, movimenti, simulazione), non per inventare una valutazione AML a runtime: watchlist e PEP restano servizi esterni.
3. **Dove vive il formato.** In una skill caricata dai quattro (`review-findings-format`), non ripetuta nei system prompt e non imposta dallo slash command: un quinto reviewer scritto da qualcun altro deve solo caricare la stessa skill per uscire nello stesso formato, senza che nessuno glielo spieghi.

### Cosa ho cambiato dell'ereditato di Gino, e perché

- **`.claude/agents/code-reviewer.md` → quattro subagent in `.opencode/agents/`**: OpenCode non legge `.claude/agents/`, e un unico reviewer generico non può reggere quattro perimetri disgiunti.
- **Rimossa `model: sonnet`**: OpenCode non conosce quel nome e rifiuta il file con un errore generico.
- **`tools: ["*"]` → `permission: edit: deny` e bash in allowlist (`git status`, `git diff`, `git log`)**: con `*` il reviewer poteva riscrivere il codice (a Gino è successo), e il divieto deve essere applicato dal CLI, non sperato dal prompt.
- **Hook in `.claude/settings.json` → blocco `permission` di ogni reviewer**: su OpenCode quell'hook non ha effetto; il presidio equivalente, applicato da codice, è il permesso per agente.
- **`compliance-aml-check` → `lipari-aml-policy`**: una skill non fa routing e il nome "check" suggeriva un controllo autonomo che si sovrapponeva ai reviewer; ora è il manuale delle soglie, caricato dal solo `amount-compliance-reviewer`.
- **`description: Reviewer di codice` → description con "Usalo SOLO quando…" ed esclusioni esplicite**: la description decide il routing; se è larga, il reviewer parte anche sui perimetri degli altri e il fatto che sia partito non distingue più niente.
- **Hook di log (`log-tool.py`) non portato**: registrava ogni strumento senza limite (il "log enorme" delle note di Gino) e non è il presidio richiesto dal criterio 5, che è coperto dai permessi.
- **Rimosso `hello-banking.md`**: era un subagent di test, non un reviewer; l'esercizio chiede quattro subagent con perimetri disgiunti.

### Prova che gira

- `docs/review-traces/review-MovementService.md` — prompt sul dominio movimenti, parte `movements-reviewer`.
- `docs/review-traces/review-TransferRequest.md` — prompt sul contratto, parte `api-contract-reviewer`.
- `docs/review-traces/review-pom-out-of-perimeter.md` — prompt sulla build, non parte nessun reviewer.

Le due review sono state eseguite nella stessa sessione, una dopo l'altra, e i file `.md` contengono prompt e output. Lo screenshot della sessione è l'altra metà della prova richiesta.

---

## Code Review Suite

La suite da riga di comando è l'eccezione alla regola interattiva: prende un target (cartella o diff), lancia i **quattro** reviewer in parallelo e produce un report unificato. Non sostituisce il routing di `AGENTS.md`: lo usa come default quando non specifichi `--reviewers`.

### Cosa fa

- Avvia quattro sessioni OpenCode distinte, una per reviewer, con il proprio agent file e le proprie permission.
- Aspetta tutte con `Promise.all`: un reviewer che fallisce non ferma gli altri.
- Applica un budget di tempo, token e costo; al superamento interrompe davvero le sessioni, non si limita ad avvisare.
- Deduplica i rilievi fra reviewer diversi (stesso file, righe sovrapposte ±3, regola/categoria/similarità), senza fondere due rilievi dello stesso reviewer.
- Riconcilia le gravità: conserva tutte le gravità, `gateSeverity` è la massima, `severityConflict` dice che non c'è accordo.
- Scrive `report.md` (leggibile), `report.json` (pipeline), `run.log` e `raw/<reviewer>.txt` (output grezzo, per non perdere nulla).
- Esce con un codice che una pipeline può usare: `0` pulito, `1` gate fallito, `2` budget superato, `3` reviewer fallito o non interpretabile, `4` errore di setup.

### Come si lancia

```bash
node --experimental-strip-types .opencode/code-review-suite.ts \
  "src/main/java/com/lipari/bank" \
  --max-seconds 360 --max-tokens 400000 --max-cost 0 \
  --out docs/review-runs/run-001
```

Con bash o `cmd.exe` si può usare anche lo script npm:

```bash
npm run review -- "src/main/java/com/lipari/bank" \
  --max-seconds 360 --max-tokens 400000 --max-cost 0 \
  --out docs/review-runs/run-001
```

Su PowerShell `npm run` consuma il separatore `--` e interpreta le opzioni come proprie: il comando npm qui sopra funziona in bash/`cmd.exe`, non in PowerShell. In PowerShell usa il comando `node` diretto, che è quello con cui ho eseguito il run reale.

Opzioni principali: `--diff <ref>` per rivedere un diff git, `--target <path>` come alternativa al primo argomento, `--reviewers a,b,c` per un sottoinsieme, `--fail-on <severity>` (default `CRITICAL`), `--model <provider/model>` (default quello di OpenCode), `--input-usd-per-mtok` e `--output-usd-per-mtok` per la stima monetaria, `--help` per il testo completo.

### Il run reale

Comando usato: target `src/main/java/com/lipari/bank`, quattro reviewer, tetto 360 s / 400.000 token. Report: `docs/review-runs/run-001/report.md`.

| Reviewer | Stato | Durata | Token |
|---|---|---:|---:|
| `movements-reviewer` | ok | 98,4 s | 116.690 |
| `amount-compliance-reviewer` | ok | 72,5 s | 99.197 |
| `api-contract-reviewer` | ok | 64,6 s | 88.875 |
| `security-reviewer` | ok | 69,4 s | 80.072 |
| **Totale** | **4/4** | **99,3 s** | **384.834** |

- Parallelismo: scarto massimo fra gli avvii **1 ms**, coppie sovrapposte **6/6**, sovrapposizione reale **sì**. La durata è quella del reviewer più lento, non la somma delle quattro.
- Esito: **GATE_FAILED** (exit `1`), perché il target contiene CRITICAL.
- Findings: **30** totali, **29** unici, **1** duplicato riconciliato, **1** conflitto di gravità. Per gravità: 5 CRITICAL, 11 HIGH, 11 MEDIUM, 2 LOW.
- Il duplicato/conflitto è il login (`FND-019`): `api-contract-reviewer` lo vede HIGH (500 invece di 401, forma di errore diversa), `security-reviewer` lo vede MEDIUM (utente inesistente distinguibile, nessun rate limit). Il report conserva entrambe le letture in `sources` e mette `gateSeverity: HIGH`; non sceglie in silenzio.
- Costo: il provider `opencode/big-pickle` dichiara **0,0000 USD**. La suite dichiara comunque token e durata; `estimatedCostUsd` diventa non zero solo passando le tariffe del modello. Per un modello a pagamento si aggiungono `--input-usd-per-mtok` e `--output-usd-per-mtok`, e `--max-cost` usa il massimo fra costo dichiarato e stima.

### Le tre decisioni della suite

**In tre righe.**
- Scelta: conservare entrambe le gravità.
- Perché: una persona deve vedere entrambe le letture; una pipeline ha bisogno di un verdetto unico.
- Come: `severities` + `sources` conservano le opinioni, `severityConflict` dichiara il disaccordo, `gateSeverity = max` decide il gate.

1. **Riconciliazione: conservare entrambe le gravità, `gateSeverity = max`.** Il report lo legge una persona e lo consuma una pipeline: la persona ha bisogno di entrambe le letture, la pipeline di un solo verdetto deterministico. Quindi `severities` tiene tutte le opinioni, `sources` tiene i reviewer e le regole, `severityConflict` rende esplicito il disaccordo, `gateSeverity` è la massima e decide il gate. Le alternative erano peggiori: scegliere la più alta e buttare la più bassa perde informazione, fare la media non significa niente per una gravità. `FND-019` è l'esempio: HIGH e MEDIUM restano entrambe visibili, il gate usa HIGH.
2. **Quattro reviewer, non sei.** I materiali suggeriscono sei lenti (dominio, sicurezza, prestazioni, contratto e altre). Ho scelto quattro perché il valore marginale di una quinta e sesta lente è più basso del costo che aggiungono: ogni reviewer è una sessione intera, e il costo in tempo, token, duplicati e coordinamento cresce in modo lineare. Le prestazioni non sono una lente separata: `MOV-07` copre l'N+1 e il contratto copre la paginazione; un reviewer "performance" duplicherebbe questi rilievi. Le quattro lenti sono ortogonali: logica interna, denaro, contratto esterno, sicurezza. Se servisse una quinta, la suite è estensibile: basta un agent file e `--reviewers`.
3. **Dove si rompe.** I punti di rottura sono espliciti, non silenziosi:
   - **Reviewer mancante** (agent file assente o nome sbagliato): il reviewer finisce in "falliti o non interpretabili", gli altri continuano, exit `3`. Provato in `docs/review-runs/test-missing`.
   - **Output non interpretabile** (nessun blocco `FINDINGS` riconoscibile): stesso trattamento, con l'output grezzo nel report, exit `3`. Provato in `docs/review-runs/test-unparseable`.
   - **Budget superato** (tempo, token o costo): `abortAll` chiama `session.abort` sulle sessioni attive, lo stato diventa `exceeded_*`, exit `2`. Provato in `docs/review-runs/test-budget`: tetto 5.000 token, abort a 7.912 token in 4,5 s.
   - **Target sbagliato o agent scrivibile**: errore di setup prima di partire, exit `4`. Il preflight controlla che il target esista e che ogni reviewer abbia `edit: deny`.
   - **Stesso reviewer con due rilievi simili**: il dedup non li fonde di proposito; fonde solo reviewer diversi. Un reviewer che si ripete resta visibile.

### Cosa ho cambiato dell'orchestratore di Gino, e perché

- **`code_review_suite.py` → `.opencode/code-review-suite.ts`**: Node 22 e `@opencode-ai/sdk` sono già nell'ambiente; Python e `uv` no. Il linguaggio cambia, il contratto del CLI resta riconoscibile.
- **Ciclo sequenziale → `Promise.all`**: i quattro reviewer partono entro 1 ms e si sovrappongono 6/6. Il run reale dura 99,3 s, non la somma dei quattro (~305 s). È la modifica che rende la suite utile come controllo pre-commit.
- **`claude_agent_sdk` → `@opencode-ai/sdk`**: stesso runtime degli agent interattivi, stessi agent file, stesse permission. Non c'è un secondo provider da configurare.
- **`REVIEWERS = ["code-reviewer"]` → quattro agent reali**: la suite non reinventa i reviewer; carica `movements-reviewer`, `amount-compliance-reviewer`, `api-contract-reviewer`, `security-reviewer` da `.opencode/agents/`.
- **`Edit` tra gli allowed tools → `edit: deny` in ogni agent + preflight**: a Gino era successo che il reviewer riscrivesse il codice. Qui il divieto è applicato dal CLI e l'orchestratore si rifiuta di partire se un agent è scrivibile.
- **Nessun budget → tempo, token e costo con hard stop**: il budget non è un avviso. Gli eventi `message.updated` alimentano il conteggio, `AbortController` e `session.abort` fermano le sessioni. Il test con tetto 5.000 token si è fermato a 7.912 token, non ha finito il lavoro.
- **Nessuna deduplica → deduplica cross-reviewer + riconciliazione**: stesso file, righe sovrapposte ±3, stessa regola/categoria o similarità testuale; due rilievi dello stesso reviewer non si fondono. La gravità non viene scelta in silenzio: `severities`, `sources`, `severityConflict`, `gateSeverity`.
- **Un solo `review-report.md` → cartella di run**: `report.md`, `report.json`, `run.log`, `raw/<reviewer>.txt`. Il JSON è il contratto per la pipeline; il Markdown è per la persona; il raw è la rete di sicurezza se il parser sbaglia.
- **`sys.exit(1)` → exit code distinti**: `0` pulito, `1` gate, `2` budget, `3` reviewer, `4` setup. Un reviewer rotto non nasconde gli altri e non fa passare il gate per sbaglio.
- **`cwd="."` → root risolta dallo script**: il comando funziona da qualunque directory; il target viene validato prima di avviare le sessioni.
- **Encoding Windows**: Node scrive UTF-8; non serve il workaround cp1252 che serviva a Gino. Il report mantiene accenti e caratteri italiani.

### Formato: cosa ha retto

Il formato condiviso ha retto senza campi nuovi. Per il quarto reviewer ho cambiato solo l'enum `REVIEW` (aggiunto `security`) e la description ("quattro reviewer"); il `security-reviewer` produce lo stesso blocco `FINDINGS`, con gli stessi campi (`id`, `file`, `line`, `severity`, `category`, `rule`, `issue`, `evidence`, `proposed_fix`), la stessa semantica di `NESSUNA VIOLAZIONE` e lo stesso tono. Le regole `SEC-01`…`SEC-08` sono un namespace del reviewer, non un'eccezione al formato.

L'unico bug vero era nell'orchestratore, non nella skill: il parser cercava `proposed_fix` mentre il formato scrive `proposedFix`. Corretto, insieme alla gestione dei code fence. La prova che il formato tiene è che il report unificato legge i quattro output senza traduzioni per-reviewer: cambia solo il contenuto, non la struttura.

### Prova che gira (suite)

- `docs/review-runs/run-001/report.md` — run reale, 4/4 reviewer, 30 findings (29 unici), 1 conflitto, exit `1`.
- `docs/review-runs/run-001/report.json` — stessi dati in forma machine-readable (`summary`, `budget`, `reviewers`, `findings` con `gateSeverity`, `severities`, `severityConflict`, `sources`).
- `docs/review-runs/test-budget/report.md` — hard stop sul tetto token, exit `2`.
- `docs/review-runs/test-missing/report.md` — un reviewer valido e uno mancante: il valido consegna, il mancante finisce nei falliti, exit `3`.
- `docs/review-runs/test-unparseable/report.md` — output in prosa: sezione fallita con output grezzo, exit `3`.

I test `test-*` sono prove di robustezza, non run di prodotto: servono a dimostrare che i punti di rottura dichiarati sopra sono veri e che il report non perde informazione quando qualcosa va storto.

---

## FASE 3 — Server MCP `finbank`

### 1. Descrizione

La FASE 3 introduce un server MCP chiamato `finbank`, collegato al backend REST LipariBank tramite HTTP.

Il server consente a un modello linguistico di consultare informazioni bancarie reali e simulare operazioni senza modificare i dati.

Il server è **read-only**: non esegue bonifici e non permette di modificare i saldi.

### 2. Primitive esposte

Il server espone tre Tool, due Resources e un Prompt.

**Tool**

| Tool                        | Funzionalità                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `get_account_balance`       | Recupera saldo, valuta e stato di un conto.                                         |
| `list_account_movements`    | Recupera i movimenti recenti di un conto, con un limite massimo di 20 risultati.    |
| `simulate_transfer_what_if` | Simula un trasferimento e restituisce i saldi previsti, senza eseguire il bonifico. |

**Resources**

| Resource URI                   | Contenuto                                            |
| ------------------------------ | ---------------------------------------------------- |
| `finbank://policies/aml`       | Policy antiriciclaggio (AML).                        |
| `finbank://policies/transfers` | Regole applicate alla simulazione dei trasferimenti. |

**Prompt**

`review_movements_with_real_data`: guida il reviewer nell'analisi dei movimenti utilizzando i dati reali esposti dal server.

**Motivazione della suddivisione**

I Tool vengono utilizzati per recuperare dati dinamici e simulare operazioni. Le Resources espongono documentazione e regole statiche, versionate nel repository. Il Prompt definisce il flusso di lavoro da seguire durante la review.

### 3. Avvio e verifica

Il server utilizza il trasporto STDIO e comunica con i client MCP.

Installazione delle dipendenze:

```bash
python -m pip install fastmcp httpx
```

Avvio:

```bash
python finbank-mcp/server.py
```

Per verificare il server tramite MCP Inspector:

```bash
npx -y @modelcontextprotocol/inspector
```

Configurazione:

- Transport Type: STDIO
- Command: percorso dell'interprete Python.
- Arguments: percorso del file `finbank-mcp/server.py`.

Dopo la connessione, dalla sezione Tools è possibile visualizzare ed eseguire i tre strumenti esposti dal server.

### 4. Autenticazione e identità utilizzata

Il server MCP si autentica verso il backend LipariBank tramite l'endpoint REST:

`POST /api/auth/login`

Il login restituisce un token JWT, utilizzato nelle successive richieste HTTP attraverso l'header:

`Authorization: Bearer <token>`

In ambiente locale viene utilizzata l'utenza demo `alice`. Le credenziali vengono lette dalle variabili d'ambiente `FINBANK_USERNAME` e `FINBANK_PASSWORD`, con fallback demo previsto per il bootcamp.

Il server utilizza quindi un'identità di servizio condivisa: non riceve automaticamente l'identità dell'utente finale che interagisce con il modello.

In un ambiente di produzione sarebbe necessario introdurre un meccanismo di autenticazione e autorizzazione per utente, con tracciamento dell'identità e delle richieste.

### 5. Esempio di esecuzione

È stato verificato il funzionamento del Tool `get_account_balance` tramite MCP Inspector.

Richiesta:

```json
{
  "account_id": 1
}
```

Risposta:

```json
{
  "account_id": 1,
  "balance": "1000.00",
  "currency": "EUR",
  "status": "ACTIVE"
}
```

Il risultato conferma che il server MCP riesce a interrogare il backend REST e a restituire il saldo del conto richiesto.

### 6. Sicurezza e gestione degli errori

Il server è progettato per operare in sola lettura:

- Non espone strumenti che eseguono bonifici.
- La simulazione del trasferimento non modifica i saldi.
- Le richieste verso il backend utilizzano un token JWT.
- Sono previsti timeout e limiti sul numero di movimenti restituiti.
- Gli errori del backend vengono restituiti esplicitamente, senza inventare saldi o liste vuote.

### 7. Limiti dichiarati

Il server è progettato per un ambiente locale di bootcamp e non è production-grade.

Non dispone di autenticazione per utente finale, multi-tenancy, rate limiting o audit completo per singolo utente.

La sua responsabilità è consultare dati bancari e simulare operazioni, non eseguire transazioni finanziarie.

