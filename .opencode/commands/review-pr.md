---
description: Review del diff di una PR con i quattro reviewer LipariBank tramite code-review-suite.
agent: build
---

Esegui la review del diff della PR corrente con la suite dei quattro reviewer
LipariBank. Non modificare file.

Argomenti: `$ARGUMENTS` e' il ref git di base (esempi: `main`, `origin/main`,
`HEAD~1`). Se e' vuoto, usa `HEAD~1`.

Passi:

1. Verifica che il ref esista: `git rev-parse --verify <ref>`.
2. Lancia la suite sul diff, con un output dedicato:
   `npm run review -- --diff <ref> --out docs/review-runs/pr-<ref>`
   dove `<ref>` va reso sicuro per un nome di cartella (sostituisci `/` e `~`).
3. Leggi `report.md` e `report.json` prodotti e riporta i finding con file:riga,
   gravita' e correzione proposta, riconciliando i quattro reviewer.
4. Interpreta l'exit code: `0` nessun finding alla soglia, `1` finding alla
   soglia `--fail-on`, `2` tetto superato, `3` reviewer fallito o non
   interpretabile, `4` errore di setup.
5. Se un reviewer e' fallito o il report e' incompleto, dichiaralo e riporta
   l'errore; non inventare finding e non dedurre un saldo o un movimento.

La suite e' l'eccezione documentata in `AGENTS.md`: lancia tutti e quattro i
reviewer sullo stesso target, perche' il report unificato li riconcilia.
