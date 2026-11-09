# Avvia il server su HTTP locale, solo su loopback.
# Per l'uso da Claude/OpenCode si usa il trasporto stdio (python server.py).
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$fastmcp = Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\Scripts\fastmcp.exe"
if (-not (Test-Path -LiteralPath $fastmcp)) {
    throw "fastmcp non trovato. Esegui: python -m pip install fastmcp httpx"
}

& $fastmcp run server.py --transport streamable-http --host 127.0.0.1 --port 8765
