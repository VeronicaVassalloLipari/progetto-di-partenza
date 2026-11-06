# Regole di routing delle review — LipariBank

Le review interattive di codice si fanno passando da **uno solo** di quattro subagent
specializzati. Questa sezione e' la regola; il CLI la applica in modo deterministico.
La suite da riga di comando (`code-review-suite`) e' l'eccezione: li' i quattro
reviewer partono insieme sullo stesso target, perche' il report unificato li
riconcilia. Il routing qui sotto vale per la review interattiva, non per la suite.

## Ordine di priorita' (vince il primo che corrisponde)

1. **`api-contract-reviewer`** — se il target e' un contratto verso l'esterno:
   qualsiasi `*Controller.java`, qualunque file sotto `dto/`, percorsi e verbi HTTP,
   nomi o tipi dei campi request/response, codici di stato, validazione di input,
   serializzazione ed error body.
2. **`amount-compliance-reviewer`** — se il target riguarda il denaro: `BigDecimal`
   amount/balance, valuta, precision e scale, arrotondamenti, addebiti e accrediti,
   fondi insufficienti, soglie AML, audit dei movimenti monetari.
3. **`movements-reviewer`** — se il target e' la logica interna dei movimenti:
   `MovementService`, `MovementRepository`, campi non monetari di `Movement`,
   atomicita' e transazioni, idempotenza, coppia `TRANSFER_OUT`/`TRANSFER_IN`,
   concorrenza sugli aggiornamenti, ordine e coerenza dei movimenti.
4. **`security-reviewer`** — se la richiesta riguarda esplicitamente la sicurezza:
   autenticazione, autorizzazione, JWT, gestione dei segreti, password, validazione
   come difesa, injection, esposizione di dati sensibili, header/CORS/CSRF,
   configurazione di sicurezza. Non parte per una review generica di dominio o di
   importi: in quel caso vale il punto 3. Per la sicurezza di un Controller o di un
   DTO vince il punto 1 nella review interattiva; la suite li copre entrambi.
5. **`Nessuno`** — se il target non ricade in 1-4 (build, `pom.xml`, configurazione
   non di sicurezza, customer, test non collegati ai movimenti). In quel caso risponde
   l'agente principale, senza invocare un reviewer.

## Caso difficile: `MovementController.java`

Sta nel package `movement`, maneggia un importo ed espone il contratto.
Vince il punto **1**: e' cio' che vede il cliente, quindi la review e'
`api-contract-reviewer`. Gli altri tre non partono su quel file nella review
interattiva, anche se il dominio, l'importo o la sicurezza li riguardano. La
suite `code-review-suite` li fa partire tutti e quattro sullo stesso target.

## Come si invoca

Un subagent per richiesta, scelto dalla regola qui sopra. Non si invocano due
reviewer sulla stessa richiesta e non si allarga la `description` di uno per
coprire il perimetro di un altro. Se un file non ricade in nessuno dei quattro,
non si attiva alcun reviewer.

## Formato dei rilievi

Tutti e quattro caricano la skill `review-findings-format` prima di scrivere
l'output. Il formato e' definito una volta sola li'.
