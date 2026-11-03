# Run trace — richiesta fuori perimetro

Prompt nella sessione:

```text
Fai la review di pom.xml
```

Routing: **nessuno dei tre reviewer**. Il target e la build, quindi secondo `AGENTS.md` risponde l'agente principale, senza invocare subagent.

Risposta diretta (estratto):

```text
REVIEW: build (primary, nessun subagent)
TARGET: pom.xml
VERDICT: CHANGES_REQUIRED

- pom.xml:78-108 — Il test di integrazione si chiama TransferIT, ma non c'e il maven-failsafe-plugin:
  `./mvnw test` non lo esegue (Surefire include *Test, non *IT), quindi la suite verde non prova il bonifico.
  proposed_fix: aggiungere maven-failsafe-plugin con goal integration-test/verify, oppure rinominare il test. Non applicato.

- pom.xml:84-99 — Sono presenti sia Testcontainers MySQL sia H2 nello scope test, senza profili o configurazione
  che scelgano l'uno o l'altro: la strategia dei test dipende dall'ambiente. proposed_fix: scegliere Testcontainers
  come default e usare H2 solo in un profilo esplicito. Non applicato.
```
