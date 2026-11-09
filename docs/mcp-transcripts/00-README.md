# Transcript MCP — FASE 3

Prove raccolte il 2026-11-08 con il LipariBank su `http://localhost:8080` e il
seed `alice` / `alice123`.

| File | Cosa prova |
|---|---|
| `01-tools-list.json` | il server espone esattamente 3 tool, con schema tipizzato e annotazioni read-only |
| `02-resources-list.json` | il server espone le 2 resource `finbank://policies/aml` e `finbank://policies/transfers` |
| `03-prompts-list.json` | il server espone il prompt `review_movements_with_real_data` |
| `04-get-account-balance.json` | il saldo reale del conto 1 e `1000.00` EUR, non un valore dedotto |
| `05-list-movements-cap.json` | `limit=1000` viene ridotto dal server a `limit_applied=20`; il seed non ha movimenti e il risultato lo dichiara |
| `06-simulate-transfer.json` | simulazione 1 -> 2 di 100.00 EUR: 900.00 / 600.00, `side_effects=none`, nessun bonifico |
| `07-error-not-found.json` | conto 999: errore esplicito `[not_found]` HTTP 404, nessun saldo vuoto |
| `08-resource-aml.json` | la resource AML restituisce il testo della policy letto dal file |
| `09-resource-transfers.json` | la resource delle regole di trasferimento restituisce il testo letto dal file |
| `15-prompt-review.json` | il prompt `review_movements_with_real_data` restituisce il testo con file e importo |
| `10-opencode-mcp-list.txt` | OpenCode vede `finbank` con stato `connected` |
| `11-opencode-resource-read.md` | OpenCode elenca i 3 tool e legge `finbank://policies/aml` con `read_mcp_resource` |
| `12-movements-reviewer.md` | il `movements-reviewer` chiama davvero i 3 tool e cita i valori reali |
| `13-amount-compliance-reviewer.md` | l'`amount-compliance-reviewer` cita la policy letta dalla resource, non a memoria |
| `14-balances-unchanged.txt` | dopo la simulazione i saldi sono ancora 1000.00 / 500.00 |
| `16-list-movements-truncated.txt` | con 30 movimenti finti nel client, il tool restituisce 20 e `truncated=true` (nessun dato scritto nel DB) |

## Comandi usati

```powershell
python finbank-mcp/server.py
opencode mcp list
npx -y @modelcontextprotocol/inspector@latest --cli -q --format json `
  "C:/Users/Veronica Vassallo/AppData/Local/Programs/Python/Python313/python.exe" `
  "C:/Book progetti/Progetto AI Agentic con Claude Code/progetto-di-partenza/progetto-di-partenza/finbank-mcp/server.py" `
  --method tools/list
```

Il server non e' stato avviato come processo HTTP separato: l'Inspector e
OpenCode lo hanno avviato in stdio, che e' il trasporto usato dai client. Il
server non stampa nulla su stdout e non muove denaro: l'unica POST e quella del
login.

## Nota sui dati

Il seed del backend ha due conti e nessun movimento. La prova del tetto sui
movimenti mostra `limit_requested=1000`, `limit_applied=20` e `truncated=false`
perche' il conto non ha righe; il taglio e' comunque applicato prima di
restituire la lista. Non sono stati inseriti movimenti finti nel database: la
prova non doveva cambiare lo stato del sistema.
