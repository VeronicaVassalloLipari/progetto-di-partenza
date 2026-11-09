# Prova: il `movements-reviewer` usa i tool MCP

Data: 2026-11-08

Comando:

```powershell
opencode run --agent movements-reviewer --auto "Review src/main/java/com/lipari/bank/movement/MovementService.java. Usa il server MCP finbank: leggi il saldo reale dei conti 1 e 2 con finbank_get_account_balance, leggi al massimo 10 movimenti del conto 1 con finbank_list_account_movements, e simula un trasferimento di 100.00 EUR dal conto 1 al conto 2 con finbank_simulate_transfer_what_if. Cita i valori reali e i read_at nelle NOTES. Non modificare file."
```

Output:

~~~text
! agent "movements-reviewer" is a subagent, not a primary agent. Falling back to default agent

> build · big-pickle

• Review MovementService Movements-Reviewer Agent
✓ Review MovementService Movements-Reviewer Agent
```
REVIEW: movements
TARGET: src/main/java/com/lipari/bank/movement/MovementService.java
VERDICT: CHANGES_REQUIRED

FINDINGS:
- id: MOV-001 (CRITICAL, concurrency) line 29-41
  Saldo letto e riscritto senza lock ne' versione ottimistica: il controllo fondi (r.34) e il setBalance (r.38) sono un TOCTOU. Con conto 1 = 1000.00 due trasferimenti concorrenti da 900.00 passano entrambi. Manca inoltre un ordine di acquisizione dei conti.
  Fix: UPDATE condizionale `balance = balance - :amount where balance >= :amount` (o @Version + OptimisticLockException), acquisendo i conti per id crescente. Non applicato.

- id: MOV-002 (CRITICAL, correctness) line 24-61
  Nessuna chiave di idempotenza: un retry dopo timeout duplica entrambe le gambe (1000/500 -> 800/700 invece di 900/600) e il duplicato non e' distinguibile.
  Fix: idempotencyKey persistita con vincolo di unicita', riuso della risposta salvata. Non applicato.

- id: MOV-003 (HIGH, traceability) line 43-61
  TRANSFER_OUT e TRANSFER_IN non hanno un identificativo comune; `transferId` e' solo `out.getId()` e non esiste sulla gamba IN.
  Fix: campo `operationId` (UUID) su entrambe le righe, con indice, restituito come transferId. Non applicato.

- id: MOV-004 (MEDIUM, correctness) line 49, 58
  `Instant.now()` chiamato due volte: le gambe hanno istanti diversi; l'ordinamento `executed_at DESC` non ha tie-breaker, quindi l'accredito puo' precedere l'addebito.
  Fix: un unico Instant per entrambe le gambe e ordinamento secondario `id DESC`. Non applicato.

- id: MOV-005 (MEDIUM, correctness) line 25-36
  `IllegalArgumentException` generica per casi distinti e nessuna validazione difensiva: amount null produce NPE se il servizio e' chiamato fuori dal controller.
  Fix: eccezioni di dominio dedicate e validazione in testa al metodo. Non applicato.

- id: MOV-006 (MEDIUM, correctness) line 29-36
  Lo stato dei conti non e' verificato: si trasferisce anche da/verso conti non ACTIVE, mentre la policy transfers sez.3 impone ACTIVE su entrambi. Il percorso reale diverge dalla simulazione.
  Fix: controllo esplicito su `status` di entrambi i conti. Non applicato.

- id: MOV-007 (MEDIUM, correctness) src/test/java/com/lipari/bank/TransferIT.java line 14-33
  Il test dipende dai saldi di seed, non e' transazionale e usa il MySQL di sviluppo (`ddl-auto: validate`, nessun application-test.yml); al secondo avvio fallisce. Mancano casi di errore, rollback e concorrenza.
  Fix: datasource di test dedicata (Testcontainers/H2), rollback e casi di errore/concorrenza. Non applicato.

NOTES: MCP finbank, read_at 2026-11-08T11:44:47+00:00 per tutte e quattro le chiamate. Conto 1 = 1000.00 EUR ACTIVE; conto 2 = 500.00 EUR ACTIVE; movimenti conto 1 = 0 (limit_applied 10, truncated false); simulate 1->2 di 100.00 = would_succeed true, saldi 900.00/600.00, max_amount 1000000.00. Policy citata: finbank://policies/transfers sez.3 (ACTIVE) e sez.4 (fondi).
```

Nessun file modificato.
~~~

La prova che i tool sono stati chiamati sta nelle quattro chiamate registrate
dalla sessione e nei valori delle `NOTES`: saldo conto 1 `1000.00`, saldo conto 2
`500.00`, lista movimenti vuota, simulazione `900.00` / `600.00` con
`would_succeed=true`. Nessun saldo e' stato dedotto dal codice.
