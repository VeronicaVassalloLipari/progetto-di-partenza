# finbank-mcp — server MCP read-only sul LipariBank

Server MCP che espone lo stato reale del LipariBank a un reviewer, senza
muovere denaro. Nasce dal server di Gino (`starter-collega`) ed e' stato
riscritto per reggere i criteri di sicurezza della FASE 3.

## Primitive

| Primitive | Nome | Cosa fa |
|---|---|---|
| Tool | `get_account_balance` | legge il saldo reale di un conto (solo campi utili alla decisione) |
| Tool | `list_account_movements` | legge i movimenti dal piu' recente, con tetto **lato server** |
| Tool | `simulate_transfer_what_if` | calcola i saldi prima/dopo di un trasferimento, senza eseguirlo |
| Resource | `finbank://policies/aml` | policy antiriciclaggio letta dal file `.opencode/skills/lipari-aml-policy/SKILL.md` |
| Resource | `finbank://policies/transfers` | regole applicate dalla simulazione, lette da `policies/transfer-rules.md` |
| Prompt | `review_movements_with_real_data` | guida alla review che usa saldi veri, simulazione e citazione della policy |

### Perche' tool e resource sono divisi cosi'

- **Tool** per le operazioni che il modello deve poter invocare a decision time
  e che richiedono validazione, tetti e semantica d'errore per singola chiamata:
  saldo, movimenti, simulazione. Sono tutte read-only; la simulazione e' un
  calcolo, non un'azione.
- **Resource** per i testi statici, versionati e citabili: le policy sono dati
  read-only indirizzati da URI, non valori che il modello deve ricordare. La
  citation compliance e' verificabile perche' il testo e' letto dal file a ogni
  `read`.

La regola pratica: **un tool cambia o calcola qualcosa a partire dallo stato;
una resource e' una fonte che si legge e si cita.** Il saldo e i movimenti sono
tool perche' vanno letti a ogni decisione e devono fallire in modo esplicito; la
policy e' una resource perche' e' la stessa per tutte le chiamate e va citata.

## Nessun tool che muove denaro

Non esiste `execute_transfer`, non esiste un endpoint di scrittura e nessun
percorso del server chiama `POST /api/movements/transfer`. Le uniche POST sono
quelle del login. Se il committente insistesse per un tool che esegue un
bonifico, la proposta sarebbe: un tool che crea una **proposta** di
trasferimento (non esegue), con idempotency key, audit con utente e
`correlation_id`, approvazione umana fuori banda e un servizio di esecuzione
separato e autorizzato. Il server di review non deve avere quella capability.

## Avvio

```bash
python -m pip install fastmcp httpx
python finbank-mcp/server.py
```

`python finbank-mcp/server.py` parte in **stdio**, non stampa nulla su stdout e
resta in ascolto: e' il comportamento giusto per Claude/OpenCode. In OpenCode il
prompt diventa il comando `/finbank:review_movements_with_real_data`; i tool
diretti si chiamano `finbank_get_account_balance`,
`finbank_list_account_movements` e `finbank_simulate_transfer_what_if`.

Per l'Inspector:

```bash
npx @modelcontextprotocol/inspector python finbank-mcp/server.py
```

Per il trasporto HTTP locale (solo loopback):

```powershell
finbank-mcp\run.ps1
# oppure, su bash:
finbank-mcp/run.sh
```

## Autenticazione e identita'

Le API del LipariBank sono protette: tutto tranne `/api/auth/**` e
`/actuator/**` richiede un JWT. Il server e' un client come un altro:

- fa login con `POST /api/auth/login` usando `FINBANK_USERNAME` e
  `FINBANK_PASSWORD` (in locale il seed usa `alice` / `alice123`);
- tiene il token in memoria, non lo scrive su disco e non lo logga;
- rinnova il token quando scade (legge `exp` dal JWT) e una volta su `401`;
- non disattiva la protezione del backend.

**Identita' usata: un'utenza di servizio (`alice`).** Tutte le letture sono
quindi indistinguibili in audit: il backend vede sempre lo stesso utente. Nei
flussi standard in locale l'identita' dell'utente finale non arriva al server.
Per rispondere a «chi ha chiesto quel saldo» servirebbe propagare il token
dell'utente finale (token passthrough/OAuth) e registrare almeno utente,
`correlation_id`, tool, conto e timestamp; l'utenza di servizio non basta. Il
server non finge di avere quell'identita'.

## Tetti e semantica d'errore

- `list_account_movements`: default 10, tetto **20**. Se il chiamante chiede
  `limit=1000`, il server restituisce al massimo 20, `limit_applied=20` e
  `truncated=true`. Il chiamante non decide il tetto.
- `simulate_transfer_what_if`: importo > 0, massimo 2 decimali, tetto
  **1.000.000,00 EUR**. Un'operazione che fallirebbe per fondi insufficienti
  non e' un errore del tool: e' una simulazione con `wouldSucceed=false`.
- `get_account_balance` e `list_account_movements`: un conto inesistente
  produce un errore esplicito (HTTP 404), non un saldo zero o una lista vuota.
- Backend irraggiungibile, timeout, `401`, `5xx`, corpo non JSON o campi
  mancanti: errore esplicito con la causa. Il server non restituisce un vuoto
  o un valore predefinito al posto di un errore.
- Campi esposti: per il saldo solo `account_id`, `balance`, `currency`,
  `status`, `read_at`; per i movimenti solo `id`, `type`, `amount`,
  `counterparty_account_id`, `executed_at`. `iban`, `customerId`, `createdAt` e
  la `description` libera non escono.

## Cosa ho cambiato dell'ereditato di Gino, e perche' non reggeva

| Ereditato | Problema | Modifica |
|---|---|---|
| `execute_transfer` | muoveva denaro davvero, senza autorizzazione (caso 3) | rimosso: il server e' read-only e non esiste alcun percorso di scrittura |
| `get_balance(id)` / `execute_transfer(...)` con docstring di una riga | il modello non sapeva quando usarli e inventava argomenti (casi 1 e 2) | argomenti tipizzati con `Annotated[..., Field(...)]` e docstring con Use/Do NOT use/Returns/Errors |
| `httpx.get` senza timeout, senza `raise_for_status`, senza auth | 401 letto come risultato, errori silenziosi | client con timeout, login, token in memoria, refresh, errori espliciti |
| `return response.json()` con tutti i campi | esponeva `iban`, `customerId`, `createdAt` e la `description` dei movimenti | proiezione dei soli campi che servono alla decisione |
| nessun tetto sui movimenti | `/api/movements` restituisce tutta la lista | tetto server-side 20, default 10, `truncated` dichiarato |
| nessun tool di simulazione | per sapere "cosa succederebbe" bisognava eseguire il bonifico | `simulate_transfer_what_if` con sole GET e `side_effects="none"` |
| policy solo nel repository | il reviewer citava a memoria | due resource lette da file, con errore esplicito se il file manca |
| `--host 0.0.0.0` nel `run.sh` | esponeva il server a tutta la rete (caso 4) | loopback `127.0.0.1` |
| nessuna distinzione tra backend lento, 404 e 401 | il modello costruiva conclusioni su un vuoto | `BackendFailure` con `kind` e messaggio esplicito |

## Verifica

Con il LipariBank su `localhost:8080` e i dati di seed (conti 1 e 2):

```text
get_account_balance(1)                  -> balance 1000.00, currency EUR
get_account_balance(999)                -> errore esplicito [not_found] HTTP 404
list_account_movements(1, limit=1000)   -> limit_applied=20; truncated=false col seed (0 movimenti), true con 30 movimenti finti
simulate_transfer_what_if(1, 2, 100)    -> 900.00 / 600.00, wouldSucceed=true
simulate_transfer_what_if(1, 2, 5000)   -> wouldSucceed=false, reason=insufficient_funds
read finbank://policies/aml             -> testo della policy AML
read finbank://policies/transfers       -> regole della simulazione
```

Il transcript completo delle invocazioni e' in
`../docs/mcp-transcripts/`. Il reviewer dei movimenti usa questi tool durante la
review: vedi la sezione FASE 3 del README principale.
