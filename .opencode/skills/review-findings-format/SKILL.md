---
name: review-findings-format
description: Formato condiviso e obbligatorio dei rilievi per i tre reviewer LipariBank (movimenti, importi, contratto API). Usala quando produci o leggi una review, prima di scrivere l'output. Fissa file e riga, gravita, correzione proposta e non applicata, tono pari e un blocco machine-readable identico per tutti e tre.
---

# Skill: review-findings-format

## A cosa serve

Tre reviewer che scrivono in tre modi diversi non si possono leggere ne aggregare. Questa skill fissa una sola forma del rilievo, uguale per tutti e tre. Ogni reviewer la carica prima di produrre l'output. Un quarto reviewer scritto domani deve solo caricare questa skill per uscire nello stesso formato, senza che nessuno glielo spieghi.

## Quando usarla

Sempre, quando stai per produrre una review del LipariBank. Non serve per scrivere codice, per spiegare un file o per rispondere a domande generiche.

## Regole non negoziabili

1. **File e riga** per ogni rilievo. Se la riga non e determinabile, indica l'intervallo e spiega perche.
2. **Una gravita** per rilievo: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`.
3. **Correzione proposta e non applicata**: descrivi cosa cambiare, mai applicarla. Nessun edit, nessun file scritto.
4. **Tono pari**: descrivi il fatto e la conseguenza, senza giudizio sulla persona e senza allarmismo.
5. **Nessun rumore**: massimo 8 rilievi ordinati per gravita. Se lo stesso difetto compare piu volte, raggruppalo.
6. **Nessuna invenzione**: se il codice e corretto, restituisci `NESSUNA VIOLAZIONE`. Non aggiungere problemi per riempire la review.
7. **Nessun complimento e nessun riepilogo iniziale**: solo il blocco qui sotto.

## Formato di output (obbligatorio)

```
REVIEW: <movements|amount-compliance|api-contract>
TARGET: <file o diff revisionato>
VERDICT: PASS | CHANGES_REQUIRED

FINDINGS:
- id: <PREFISSO>-001
  file: <percorso/relativo/AlFile.java>
  line: <numero o intervallo>
  severity: CRITICAL | HIGH | MEDIUM | LOW
  category: correctness | concurrency | security | compliance | contract | traceability
  rule: <identificatore breve della regola, es. MOV-02>
  issue: <una frase, cosa non va>
  evidence: <perche e un problema, con il frammento rilevante>
  proposed_fix: <correzione proposta, NON applicata>

- id: ...
  ...

NOTES: <opzionale, massimo 2 righe; ometti se non serve>
```

Se non ci sono rilievi:

```
REVIEW: <movements|amount-compliance|api-contract>
TARGET: <file o diff revisionato>
VERDICT: PASS

FINDINGS:
NESSUNA VIOLAZIONE
```

## Rubrica di gravita

- `CRITICAL`: perdita o corruzione di denaro, bypass di autorizzazione, dato non ricostruibile per la compliance.
- `HIGH`: comportamento errato in uno scenario reale, rottura del contratto per i client, race condition probabile.
- `MEDIUM`: difetto che si manifesta in condizioni non comuni o che peggiora la manutenibilita in modo concreto.
- `LOW`: forma, coerenza o documentazione, senza impatto immediato sul comportamento.

## Esempio

```
REVIEW: movements
TARGET: src/main/java/com/lipari/bank/movement/MovementService.java
VERDICT: CHANGES_REQUIRED

FINDINGS:
- id: MOV-001
  file: src/main/java/com/lipari/bank/movement/MovementService.java
  line: 38-41
  severity: HIGH
  category: concurrency
  rule: MOV-03
  issue: Il saldo viene letto e riscritto senza lock ne versione ottimistica.
  evidence: Due trasferimenti concorrenti sullo stesso conto possono sovrascriversi e perdere un addebito.
  proposed_fix: Usare un aggiornamento atomico o @Version sull'entita Account e gestire OptimisticLockException. Non applicato.
```

## Nota per chi eredita

La forma vive qui una volta sola. Se cambia, cambia per tutti e tre. Non duplicarla nei system prompt dei reviewer.
