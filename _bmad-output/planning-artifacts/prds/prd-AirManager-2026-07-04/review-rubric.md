# PRD Quality Review — AirManager

## Overall verdict
Il PRD è azionabile: le decisioni di dominio (conto prepagato, pro-rata al minuto, pacchetti ore, PPR con approvazione staff) sono dichiarate come decisioni e tracciate nel memlog; le assunzioni sono taggate e indicizzate; gli FR hanno in maggioranza conseguenze testabili. Il rischio principale è nelle domande aperte 1–3 (auto-registrazione voli, tassa PPR, chiusura mese): sono assunte con default ragionevoli ma vanno confermate dall'utente prima delle stories degli epic Voli/Finanze.

## Decision-readiness — adequate
Le scelte sono esplicite e le Open Questions sono realmente aperte (1–6). Le assunzioni con impatto contabile (FR-13 pacchetto solo-velivolo, FR-16 mese contabile) sono le più delicate.

### Findings
- **high** Conferma assunzioni contabili (§4.4, §4.5) — Le assunzioni su pacchetti e chiusura mese cambiano il modello dati dei movimenti. *Fix:* confermare con l'utente prima dell'epic Finanze/Voli (non blocca Foundation/Anagrafiche).

## Substance over theater — strong
NFR con soglie specifiche (p95 500 ms su ~50k voli, importi in centesimi, alert one-shot per soglia). Nessuna persona-furniture: i sei JTBD guidano le UJ.

## Strategic coherence — strong
Tesi chiara: un solo sistema al posto di carta/fogli, API-first per il mobile futuro. SM-1/2/3 validano la tesi; SM-C1 è una counter-metric reale.

## Done-ness clarity — adequate
### Findings
- **low** FR senza conseguenze testabili esplicite (FR-6, FR-17, FR-19, FR-25, FR-29, FR-30, FR-32, FR-41) — sono CRUD/viste a bassa ambiguità. *Fix:* le acceptance criteria di dettaglio verranno scritte a livello story.

## Mechanical notes
Numerazione FR-1…FR-42 contigua; Glossario coerente (Conto, Movimento, Movimento di cassa, Pacchetto ore usati verbatim); Assumptions Index allineato ai tag inline; UJ-1…UJ-6 referenziate dalle feature.
