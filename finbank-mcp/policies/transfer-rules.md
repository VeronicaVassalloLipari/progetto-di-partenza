# Regole di trasferimento — LipariBank

Questa e' la fonte citabile applicata da `simulate_transfer_what_if`. Il tool
legge soltanto lo stato del backend (`GET /api/accounts/{id}`): non chiama
`POST /api/movements/transfer` e non modifica saldi o movimenti. La simulazione
dice cosa succederebbe, non esegue l'operazione.

## 1. Conti diversi

`from_account_id` e `to_account_id` devono essere diversi. Lo stesso conto
produce `would_succeed=false` e `reason="same_account"`.

## 2. Importo

- L'importo deve essere strettamente maggiore di zero.
- L'importo deve avere al massimo 2 decimali (centesimi). Non si arrotonda in
  silenzio.
- Il tetto del server e' **1.000.000,00 EUR**. Un importo oltre il tetto
  produce `would_succeed=false` e `reason="amount_over_limit"`. Il tetto e' una
  scelta del server, non un limite del backend.

## 3. Conti

- Entrambi i conti devono esistere. Un ID inesistente produce un errore
  esplicito (HTTP 404), non un saldo zero.
- Entrambi i conti devono essere `ACTIVE`. Un conto non attivo produce
  `would_succeed=false` e `reason="source_not_active"` o
  `reason="target_not_active"`.
- I due conti devono avere la stessa valuta. Una valuta diversa produce
  `would_succeed=false` e `reason="currency_mismatch"`.

## 4. Fondi

Il saldo del conto di partenza deve essere almeno pari all'importo. Se non lo
e', `would_succeed=false` e `reason="insufficient_funds"`; i saldi `after`
restano uguali ai saldi `before` e non viene mostrato un saldo negativo.

## 5. Nessun side effect

La simulazione restituisce sempre `simulated=true` e `side_effects="none"`.
Non esiste alcun tool, in questo server, che esegua davvero un trasferimento.

## 6. Campi restituiti

`amount`, `currency`, `from_account.account_id`, `from_account.balance_before`,
`from_account.balance_after`, `to_account.account_id`,
`to_account.balance_before`, `to_account.balance_after`, `would_succeed`,
`reason`, `limits.max_amount`, `policy_resource` e `read_at`.

Gli importi sono stringhe decimali con 2 cifre, non numeri in virgola mobile.
