# OpenCode: tool e resource del server `finbank`

Data: 2026-11-08

Comando:

```powershell
opencode run --auto "Elenca i nomi dei tool MCP del server finbank che vedi. Poi leggi la resource finbank://policies/aml con read_mcp_resource e riporta le prime 3 righe del testo. Non modificare file."
```

Output:

~~~text
> build · big-pickle

⚙ list_mcp_resources MCP resources: finbank
⚙ read_mcp_resource MCP resource: finbank://policies/aml
**Tool MCP finbank:** `finbank_get_account_balance`, `finbank_list_account_movements`, `finbank_simulate_transfer_what_if`.

**Prime 3 righe di `finbank://policies/aml`:**
```
# Policy AML — LipariBank

Questa e la fonte unica delle soglie e dei controlli antiriciclaggio. E una skill, non un MCP server: e un manuale operativo statico, versionato nel repository e leggibile da chiunque debba applicarlo
```
~~~

Il client ha elencato le resource del server e ha letto il testo con il tool
built-in `read_mcp_resource`. I tre tool sono esposti direttamente (server
configurato con `codemode: false`), quindi i nomi sono quelli dichiarati dal
server.
