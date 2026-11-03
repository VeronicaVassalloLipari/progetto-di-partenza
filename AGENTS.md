# Regole di routing delle review — LipariBank

Le review di codice si fanno passando da **uno solo** di tre subagent specializzati.
Questa sezione e' la regola; il CLI la applica in modo deterministico.

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
4. **Nessuno** — se il target non ricade in 1-3 (build, `pom.xml`, configurazione,
   security, customer, test non collegati ai movimenti). In quel caso risponde
   l'agente principale, senza invocare un reviewer.

## Caso difficile: `MovementController.java`

Sta nel package `movement`, maneggia un importo ed espone il contratto.
Vince il punto **1**: e' cio' che vede il cliente, quindi la review e'
`api-contract-reviewer`. Gli altri due non partono su quel file, anche se il
dominio o l'importo li riguardano.

## Come si invoca

Un subagent per richiesta, scelto dalla regola qui sopra. Non si invocano due
reviewer sulla stessa richiesta e non si allarga la `description` di uno per
coprire il perimetro di un altro. Se un file non ricade in nessuno dei tre,
non si attiva alcun reviewer.

## Formato dei rilievi

Tutti e tre caricano la skill `review-findings-format` prima di scrivere
l'output. Il formato e' definito una volta sola li'.
