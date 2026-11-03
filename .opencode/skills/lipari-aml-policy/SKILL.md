---
name: lipari-aml-policy
description: "Policy antiriciclaggio del LipariBank: soglie operative, screening PEP e watchlist, audit trail dei movimenti monetari e pattern di operazioni sospette. Usala quando devi valutare un cambiamento che tocca importi, saldi, clienti o movimenti di denaro, e in particolare prima di emettere i rilievi del amount-compliance-reviewer."
---

# Policy AML — LipariBank

Questa e la fonte unica delle soglie e dei controlli antiriciclaggio. E una skill, non un MCP server: e un manuale operativo statico, versionato nel repository e leggibile da chiunque debba applicarlo (oggi i reviewer, domani un quarto reviewer o un controllo di compliance). Un MCP server servirebbe solo per una valutazione a runtime che qui non esiste; watchlist e PEP restano servizi esterni, non policy.

## 1. Soglie operative

- Movimento sopra **10.000 EUR**: segnalazione obbligatoria.
- Movimento sopra **5.000 EUR**: registrazione nell'audit.
- Le soglie sono le stesse in tutti i punti del codice: se compaiono due valori diversi, e un rilievo.

## 2. PEP screening

- Il cliente espone il flag `isPep`.
- Un movimento sopra **1.000 EUR** di un cliente PEP genera un alert.
- Il flag non deve essere dedotto dal nome o da euristiche.

## 3. Watchlist screening

- `watchlistService.screen(fiscalCode)` va invocato alla creazione del cliente.
- Un esito positivo blocca l'operazione e produce un audit, non un semplice log.

## 4. Audit trail

Per ogni movimento monetario devono essere tracciabili:

- `correlationId`
- `userId`
- `ipAddress`
- `executedAt`
- importo e valuta

Nessun dato sensibile (fiscal code, credenziali, token) nei log.

## 5. Pattern di operazioni sospette

- **Smurfing**: molti movimenti sotto soglia verso lo stesso beneficiario.
- **Giri circolari**: A -> B -> C -> A con importi coerenti.
- **Conti dormienti**: movimenti improvvisi su conti inattivi.
- **Incoerenza geografica**: operazioni da luoghi incompatibili con il profilo.

Questi pattern si segnalano, non si correggono automaticamente: la decisione resta umana e tracciata.
