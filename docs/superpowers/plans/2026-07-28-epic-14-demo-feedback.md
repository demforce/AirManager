# Epic 14 — Feedback demo tour (punch-list utente 2026-07-28)

**Fonte**: giro demo dell'utente sull'app (dati demo, macchina locale) — 17 item. **Metodo**: BMAD come Epic 13 (piano → ratifiche → story → ciclo dev/review per story). Branch: `dev` (modello main+dev, 2026-07-27).

## Ratifiche PO (AskUserQuestion 2026-07-28)

- **R1 — Voli scuola (pacchetto completo)**: (1) un ALLIEVO può volare SOLO voli `SCHOOL`; (2) OGNI volo scuola richiede un istruttore assegnato, anche il SOLISTA; (3) fatturazione solista invariata (9.4: addebita e compensa l'istruttore come il doppio). **PIC** (domanda utente): derivato da `isSolo` — doppio comando → PIC istruttore; solista → PIC allievo — da rendere ESPLICITO in UI/registro (badge/colonna), nessun campo nuovo.
- **R2 — Rimozione STAFF**: siamo in dev (DB ripulito di continuo, mai deployato) → nessuna migrazione difensiva: si elimina il ruolo (enum/permessi/UI) e si rifà il seed senza `staff@airmanager.local`. Resta ADMIN come unica figura amministrativa.
- **R3 — Privacy prenotazioni**: admin E istruttori vedono i nomi; piloti e allievi vedono solo "Occupato" (velivolo+orario, nessun nome) su bookings e pianificazione.
- **R4 — Check medico alla registrazione volo**: BLOCCO + override admin — 422 di default se visita medica assente/scaduta ALLA DATA DEL VOLO (pilota e istruttore); l'admin può forzare con conferma esplicita e motivazione registrata.

## Decisioni di sessione (pattern esistenti, non richiedono PO)

- **D1**: l'alert saldo negativo sui voli riusa il meccanismo a bande/soglia della story 3.3 (`negativeBalanceAlertThresholdCents`) — oggi scatta su rettifiche/ricariche, va esteso al percorso di addebito volo.
- **D2**: "profili visibili solo se attivati" = le sezioni profilo (pilota/allievo/istruttore) nelle viste self-service mostrano SOLO i profili attivi della persona.
- **D3**: la lentezza "application code" va MISURATA su build di produzione prima di ogni diagnosi (in `next dev` i tempi includono compile on-demand — non è un dato).

## Story (item → story)

| Story | Item | Contenuto |
|---|---|---|
| **14.1 — Controlli form: typeahead e date** | 1, 6, 7 | Il dropdown suggerimenti pilota/velivolo (form volo, `logbook-console.tsx`) copre l'input (si apre SOPRA) → posizionamento sotto il campo salvo flip necessario; icona doppia sugli input data/ora → resta SOLO il picker custom (enumerare OGNI input data/ora/datetime, `airops.css:1566` nasconde l'indicator solo per `.date-input`); tasto "Oggi" rimosso dai picker data di dashboard e bookings (restano frecce+data+calendario). |
| **14.2 — Validazione form per-campo** | 5 | Campo obbligatorio mancante → bordo rosso sul CAMPO + messaggio vicino, in TUTTI i form (pattern a livello di primitiva `Field`/form) — basta la sola stringa generica in fondo. |
| **14.3 — Regole voli scuola (R1)** | 2 | Vincoli: allievo→solo SCHOOL, istruttore obbligatorio su ogni SCHOOL (incl. solista); PIC esplicito in UI/registro derivato da `isSolo`. Billing invariato. |
| **14.4 — Guard-rail registrazione volo (R4+D1)** | 17, 3 | Check visita medica (pilota+istruttore) alla data volo con blocco+override admin motivato; alert saldo negativo (banda 3.3) anche sull'addebito volo, visibile ad admin alla registrazione. |
| **14.5 — Privacy prenotazioni (R3)** | 9, 14 | Masking nomi per piloti/allievi su tabella bookings + pianificazione ("Occupato"); admin+istruttori invariati. |
| **14.6 — Area personale: transazioni e profili (D2)** | 10, 15, 16 | Pagina sidebar "Le mie transazioni" per pilota e allievo (SOLO le proprie); sezioni profilo self-service limitate ai profili attivi. |
| **14.7 — Istruttore: prenotazione e compensi** | 11, 12 | Toggle on/off "per me / per un allievo" nella nuova prenotazione; pagina compensi istruttore con tabella dei pagamenti ricevuti (quando/quanto). |
| **14.8 — Form velivolo unificato** | 8 | Il form di creazione espone TUTTI i campi del form di modifica (es. costo orario) — un solo inserimento, niente modifica post-creazione. |
| **14.9 — Rimozione ruolo STAFF (R2)** | 13 | Enum/RBAC/UI/seed/test senza STAFF; solo ADMIN come amministratore. Da fare ULTIMA (tocca trasversalmente ciò che le altre story modificano). |
| **TD-8 — Indagine lentezza salvataggi** | 4 | Misura su build prod (D3): se confermata, profiling (query N+1, recheck sessione, middleware) e fix. |

**Ordine**: 14.1 → 14.2 → 14.8 → 14.5 → 14.6 → 14.7 → 14.3 → 14.4 → TD-8 → 14.9 (STAFF per ultima; i quick-win visivi prima).

## Processo

Ciclo per story INVARIATO (HANDOFF §"Ciclo per story"): story file (main, Fable) → DB fresco → dev (UN subagent Sonnet 5 xhigh, karpathy + per le story UI design-taste/ui-ux-pro-max) → DB fresco → review adversarial (Opus 5 xhigh) → fix → chiusura con sprint-status+HANDOFF. Commit su `dev`.
