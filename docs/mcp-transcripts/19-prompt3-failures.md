# Prompt 3 — I casi in cui il backend non collabora

Data: 2026-11-09

Semantica dei guasti per i tre tool di `finbank-mcp`, che chiamano il backend
LipariBank via HTTP. Nessun codice di gestione: qui si decide **cosa restituire
al modello** e **cosa non restituire mai**.

Principio unico: *unknown non e' empty*. Un guasto deve produrre un errore
visibile e azionabile; un vuoto legittimo (collezione senza righe) deve essere
dichiarato come tale. In mezzo non c'e' nulla: niente zeri, niente default,
niente valori stantii, niente oggetti parziali.

## Tabella

| Guasto | Cosa restituire (e cosa NON restituire) | Cosa il modello concluderebbe se restituissi un vuoto |
|---|---|---|
| Servizio irraggiungibile (DNS, connessione rifiutata, host spento) | `[unreachable]` con URL base e path. NON restituire saldo 0, lista vuota, `would_succeed=true` o valori di seed. | «Il conto ha 0 EUR», «non ci sono movimenti» o «il trasferimento riuscirebbe»: tre conclusioni false su uno stato ignoto. |
| Risposta lenta oltre il limite (timeout) | `[timeout]` con secondi e path. NON restituire l'ultimo valore noto, 0 o lista vuota. | «Saldo 0» o «nessun movimento» mentre il backend sta ancora elaborando: lo stato e' ignoto, non vuoto. |
| Codice di errore HTTP (4xx/5xx, escluso 404) | `[http]` con status, path e dettaglio sicuro (`message`/`error`). NON restituire un successo vuoto. | Un 500 diventa «il conto non ha movimenti», un 403 diventa «il conto non esiste»: l'errore sparisce. |
| Conto inesistente (404) | `[not_found]` con path e ID. NON restituire saldo 0, stato `ACTIVE` o un conto creato al volo. | «Il conto esiste ed e' a zero» invece di «l'ID e' sbagliato»: si valida un conto che non c'e'. |
| Campi mancanti in una risposta 200 | `[invalid_response]` con l'elenco dei campi mancanti. NON restituire `null`, 0, `ACTIVE` o `EUR` di default. | «Saldo 0, conto attivo in EUR»: la review conclude su dati inventati. |
| Risposta 200 valida ma vuota | Collezione vuota (`[]`): successo con `returned=0` e `note`. Risorsa singola vuota (`{}`, `null`, body vuoto): `[invalid_response]`. NON restituire `balance=0` ne' righe inventate. | Per il conto «saldo 0» (falso); per i movimenti «nessun movimento» (corretto solo se la lista e' davvero vuota). |
| Credenziali rifiutate (401 al login o dopo il rinnovo) | `[auth]` con hint su `FINBANK_USERNAME`/`FINBANK_PASSWORD`. NON restituire fallback anonimo, 0 o lista vuota. | «I conti sono vuoti o inattivi» invece di «il server e' mal configurato»: si maschera un problema di identita'. |
| Token scaduto (401 transitorio) | Rinnovo trasparente; se fallisce, `[auth]`. NON restituire dati della chiamata precedente ne' un vuoto. | «Non ci sono dati» quando era solo un token scaduto. |
| Risposta non JSON (pagina HTML, corpo troncato) | `[invalid_response]` con path. NON restituire un parse best-effort o 0. | «Saldo 0» estratto da una pagina di errore HTML. |
| Tipo sbagliato (movimenti non-lista, conto non-oggetto, importo non numerico) | `[invalid_response]` con campo e tipo atteso. NON restituire lista vuota o 0. | «Nessun movimento» da un errore di formato. |
| Risposta parziale o troncata | Successo con `truncated=true`, `limit_applied`, `returned`. NON restituire la lista come se fosse completa. | «Ho visto tutti i movimenti» quando ne mancano: una review incompleta passa per completa. |
| Rate limit (429) | `[http]` con 429 e, se c'e', `Retry-After`. NON restituire vuoto. | «Nessun movimento» durante un throttling. |
| Errore di trasporto (protocollo, connessione interrotta) | `[transport]` con il tipo di errore. NON restituire vuoto. | Conclusione su uno stato ignoto. |
| Importo non valido in input (non e' un guasto del backend) | `[invalid_amount]` con la regola violata. NON restituire `would_succeed=false` ne' un arrotondamento silenzioso. | «Il trasferimento fallirebbe» invece di «l'input e' invalido»: si confonde un errore d'uso con un esito di dominio. |

## Perche' queste scelte

- **Unknown non e' empty.** Un errore dice «non lo so»; un vuoto dice «lo so, ed
  e' zero». Sono due informazioni diverse e il modello agisce diversamente.
- **Vuoto legittimo solo per le collezioni.** `movements=[]` e' uno stato reale
  del conto; un conto senza `balance` non e' un conto a zero.
- **Nessun default.** `balance=0`, `status="ACTIVE"`, `currency="EUR"` sono
  invenzioni: spostano la review dal codice al dato finto.
- **Nessun dato stantio.** Un saldo letto prima del guasto non e' il saldo di
  adesso; restituirlo rende invisibile l'interruzione.
- **Errore visibile e azionabile.** `kind`, path e status bastano al modello per
  fermarsi e dirlo; il dettaglio del body va filtrato per non esporre segreti.
- **Parziale etichettato.** `truncated=true` e `limit_applied` impediscono di
  scambiare una pagina di risultati per l'insieme completo.
- **Retry solo per il 401 transitorio.** Il rinnovo del token e' sicuro perche'
  il server e' read-only; un retry su 5xx o timeout va deciso, non improvvisato.

## Cosa il server fa gia' (riferimenti)

I `kind` usati in `finbank-mcp/server.py` coprono la tabella:

- `timeout` (215-219), `unreachable` (220-224), `transport` (225-229).
- `auth` (148-160 e 240-245), con un solo rinnovo su 401 (231-233).
- `not_found` (234-239), `http` (246-252).
- `invalid_response` (254-260, 288-313, 460-480): corpo non JSON, campi mancanti,
  tipo sbagliato, importo non numerico.
- `invalid_amount` (561-565): input a 3+ decimali rifiutato, non arrotondato.
- `_tool_error` (323-327) aggiunge «Nessun dato inventato» a ogni errore.
- `_safe_detail` (102-111) espone solo `message`/`error`, non il body intero.
- `truncated` (497) distingue la lista parziale da quella completa.

Punti da verificare, non da riscrivere qui:

- Il 404 non distingue «conto inesistente» da «rotta inesistente»: il path nel
  messaggio aiuta, ma la semantica resta ambigua.
- Il 429 finisce sotto `[http]`; `Retry-After` non viene propagato.
- Una risorsa singola vuota produce `[invalid_response]` con l'elenco dei campi
  mancanti: corretto, ma il messaggio deve restare leggibile per il modello.
