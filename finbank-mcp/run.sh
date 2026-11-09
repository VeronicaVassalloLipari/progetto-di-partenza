#!/usr/bin/env bash
# Avvia il server su HTTP locale, solo su loopback.
# Per l'uso da Claude/OpenCode si usa il trasporto stdio (python server.py).
set -euo pipefail
cd "$(dirname "$0")"

fastmcp run server.py \
  --transport streamable-http \
  --host 127.0.0.1 \
  --port 8765
