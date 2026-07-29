---
baseline_commit: 47d0d33
---

# Story 14.3: Regole voli scuola — l'allievo vola SOLO scuola, e il PIC è esplicito

Status: ready-for-dev (branch `dev`, epic 14)

## Story

As a gestore della scuola volo,
I want che un allievo possa registrare SOLO voli scuola (sempre con un istruttore) e che il registro dica chiaramente CHI era il pilota responsabile,
so that il libretto rispecchia la realtà addestrativa e nessuno registra per errore un turismo a nome di un allievo.

**Riferimenti vincolanti**: piano epic 14 (item 2), **ratifica R1**: (1) un ALLIEVO vola SOLO `SCHOOL`; (2) OGNI volo scuola richiede un istruttore, anche il SOLISTA; (3) fatturazione solista INVARIATA (story 9.4: addebita e compensa l'istruttore come il doppio comando). **PIC** (domanda utente in ratifica): derivato da `isSolo` — doppio comando ⇒ PIC istruttore, solista ⇒ PIC allievo — da rendere ESPLICITO in UI/registro, senza campi nuovi.

**Ricognizione preliminare (2026-07-29) — la premessa del piano è PARZIALMENTE GIÀ SODDISFATTA**: il vincolo R1(2) esiste già (`flights.service.ts:419-420`, `SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR`, applicato anche al solista perché il check non guarda `isSolo`), e R1(3) è la semantica 9.4 in vigore. Manca R1(1) e manca il PIC esplicito. Il dev VERIFICHI questa ricognizione prima di implementare e la corregga se sbagliata (precedente: le premesse di 14.6/14.8 erano inesatte, i dev l'hanno provato e documentato).

## Acceptance Criteria

1. **(Allievo ⇒ solo SCHOOL)** Registrare un volo `TOURISM` o `AERIAL_WORK` per una persona con profilo ALLIEVO attivo e SENZA profilo pilota attivo è rifiutato con un errore di dominio dedicato (es. 422 `STUDENT_FLIGHT_MUST_BE_SCHOOL`), lato servizio (`resolveFlightInput`) — non solo in UI. Chi ha ENTRAMBI i profili attivi (allievo che ha preso la licenza) NON è vincolato: decide il tipo volo come un pilota. Regola espressa sul PROFILO ATTIVO, mai sul ruolo (lezione 14.6).
2. **(UI coerente)** Nel form volo (`logbook/flight-editor.tsx`), selezionato un allievo, il campo Tipo volo offre/forza SCHOOL con messaggio chiaro (nessun vicolo cieco: mai lasciar scegliere un'opzione che il server rifiuterà — lezione 14.6 F2), e l'istruttore resta obbligatorio (vincolo già esistente).
3. **(PIC esplicito)** Il registro voli e il dettaglio del volo mostrano CHI è il PIC: doppio comando ⇒ l'istruttore, solista ⇒ l'allievo. Presentazione (badge/colonna/label i18n IT-EN) coerente AirOps; nessun campo nuovo nel modello — è derivato da `isSolo`. Enumerare TUTTE le superfici che mostrano un volo scuola (registro, dettaglio, export xlsx/PDF, scheda persona se applicabile) e decidere per ognuna se il PIC ci va, motivando.
4. **(Invarianti)** Fatturazione e compensi INVARIATI (9.4: il solista addebita e compensa l'istruttore come il doppio — Billing-1 AC4 crea il gemello di cassa del payout). Nessun cambio a `isSolo`, `SOLO_REQUIRES_SCHOOL`, `SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR`. I voli storici restano leggibili e non vengono riclassificati.
5. **(Test)** Unit: allievo+TOURISM → 422 col codice nuovo; allievo+SCHOOL+istruttore → OK; doppio profilo → TOURISM ammesso; solista senza istruttore → resta 422 col codice esistente. e2e: il form non lascia scegliere un tipo che verrà rifiutato; un volo scuola doppio mostra il PIC istruttore e un solista il PIC allievo nel registro. Full suite CI=1 verde; unit test in shell PULITA (`env -u DATABASE_URL -u AUTH_SECRET`, lezione 14.7 F1).

## Contesto (puntatori — ricognizione 2026-07-29)

- Servizio: `src/server/services/flights.service.ts` — `resolveFlightInput` (`:419` requisito istruttore, `:426` `SOLO_REQUIRES_SCHOOL`, `:433` istruttore ≠ pilota), eleggibilità persona (`:354-371`: pilotProfile/studentProfile attivi), `PERSON_ARCHIVED`/`AIRCRAFT_ARCHIVED`.
- Schemi: `src/lib/schemas/flights.ts` (`flightTypeSchema` `:9`, `isSolo` `:92`/`:136`).
- UI: `src/app/[locale]/dashboard/logbook/flight-editor.tsx` (picker pilota/istruttore via `SearchCombobox` con `profile: 'pilot-or-student' | 'instructor'`), registro `logbook-console.tsx`.
- Export: `exports.service.ts` (xlsx/PDF logbook) — superficie da valutare per il PIC (AC3).
- **Ambiente**: ciclo e regole macchina come `docs/handoffs/HANDOFF.md`; reset DB in questa sandbox via docker compose (`scripts/reset-db.sh` NON funziona). Story con UI → `design-taste-frontend` + `ui-ux-pro-max`. e2e: spec singoli a `--workers=1`, helper di lookup riga (mai pagina 1 su DB sporco), gate vero = full suite CI=1 prod. Commit su `dev`: `feat(14.3): regole voli scuola — allievo solo SCHOOL, PIC esplicito` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Guard-rail su visita medica/scadenze e alert saldo negativo (story 14.4).
- Qualsiasi cambiamento ai calcoli di addebito/compenso.
- Riclassificazione dei voli storici.

## Dev Agent Record

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
