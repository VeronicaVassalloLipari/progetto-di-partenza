# Prompt 1 — Banco di prova di `simulate_transfer_what_if`

Data: 2026-11-09

Banco di prova generato con il Prompt 1 dell'esercizio («Il banco di prova del
tuo server»). Non e' codice e non e' la docstring dello strumento: sono venti
richieste plausibili di uno sviluppatore, in italiano, per collaudare il tool
`simulate_transfer_what_if` del server `finbank`.

## Descrizione in due righe (input del prompt)

Simula un trasferimento tra due conti LipariBank e restituisce saldi prima/dopo,
`would_succeed` e `reason`, senza muovere denaro. Richiede conti diversi ed
esistenti, importo > 0 con max 2 decimali e tetto 1.000.000 EUR, stessa valuta,
conti ACTIVE e fondi sufficienti.

## Gruppo 1 — Lo strumento e' chiaramente quello giusto (8)

1. Simula un bonifico di 250 euro dal conto 1 al conto 2: mi interessano i saldi prima e dopo, senza eseguirlo.
2. Cosa succederebbe se spostassi 1.500,00 EUR dal conto 2 al conto 1?
3. Fammi un what-if di un trasferimento da 100 euro tra il conto 1 e il conto 2.
4. Se trasferisco 50,50 EUR dal conto 2 al conto 1, i fondi bastano?
5. Simulazione: 300 euro dal conto 1 al 2. Non voglio che il denaro si muova davvero.
6. Prima di fare il bonifico, mostrami i saldi previsti di un trasferimento di 75 EUR dal conto 1 al conto 2.
7. What-if di 2.000 euro dal conto 2 verso il conto 1: quale sarebbe il saldo risultante?
8. Simula lo spostamento di 999,99 EUR dal conto 1 al conto 2 e dimmi se andrebbe a buon fine.

## Gruppo 2 — Serve, ma con parametri limite (6)

9. Simula un trasferimento di 0,01 EUR dal conto 1 al conto 2. *(minimo positivo)*
10. What-if di 1.000.000,00 EUR dal conto 1 al conto 2. *(esattamente il tetto)*
11. Simula 1.000.000,01 EUR dal conto 1 al conto 2. *(oltre il tetto)*
12. Trasferimento di 0 EUR dal conto 1 al conto 2: cosa succede? *(minimo non valido)*
13. Simula 100,005 EUR dal conto 1 al conto 2. *(3 decimali, oltre la scala)*
14. What-if di 100 EUR dal conto 1 al conto 1. *(stesso conto)*

## Gruppo 3 — Non dovrebbe essere invocato (6, di cui 3 ambigue)

15. Qual e' il saldo attuale del conto 1? — e' una lettura: `get_account_balance`, nessun trasferimento da simulare.
16. Mostrami gli ultimi 10 movimenti del conto 2. — e' una lista: `list_account_movements`, non una simulazione.
17. Esegui davvero il bonifico di 200 EUR dal conto 1 al conto 2. — il server e' read-only: non esiste un tool che muova denaro.
18. Quanto mi resta sul conto 1 dopo aver speso 100 euro? — *ambigua:* «speso» non dice verso quale conto ne' se e' un trasferimento; puo' essere solo una lettura di saldo.
19. Se prelevo 500 euro, il conto va in rosso? — *ambigua:* e' un prelievo, non un trasferimento tra due conti; il tool non modella i prelievi.
20. Conviene spostare 10.000 euro dal conto 1 al conto 2? — *ambigua:* chiede un consiglio, non una simulazione; il tool non valuta convenienza.

## Come si legge il risultato

- Le 8 del primo gruppo verificano se la docstring funziona: se il modello non
  sceglie il tool su queste, la description e' troppo stretta.
- Le 6 di mezzo mettono alla prova i tetti lato server: 0,01 / 1.000.000 / oltre
  il tetto / 0 / 3 decimali / stesso conto. Il tool deve rispondere con un esito
  esplicito (`would_succeed=false` e `reason`), non con un errore generico.
- Le 6 finali, in particolare le tre ambigue, dicono se il «Do NOT use this for»
  va riscritto: se il tool parte su una di queste, la description va corretta.
