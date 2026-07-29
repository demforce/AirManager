---
baseline_commit: 8219ce1
---

# Story 14.4: Guard-rail alla registrazione volo — visita medica e saldo negativo

Status: ready-for-dev (branch `dev`, epic 14)

## Story

As a admin che registra un volo,
I want essere fermato se il pilota (o l'istruttore) non ha una visita medica valida alla data del volo, e vedere SUBITO se quel volo manda il conto in negativo,
so that non registro voli non conformi e nessuno scopre lo sconfinamento giorni dopo.

**Riferimenti vincolanti**: piano epic 14 (item 17 + 3), **ratifica R4**: check medico = **BLOCCO + override admin** (422 di default se la visita è assente/scaduta ALLA DATA DEL VOLO, per pilota E istruttore; l'admin può forzare con conferma esplicita e **motivazione registrata**); **decisione D1**: l'alert saldo negativo riusa il meccanismo a bande della story 3.3.

**Ricognizione preliminare (2026-07-29) — la premessa del piano va CORRETTA su entrambi i fronti** (il dev verifichi e mi corregga se sbaglio, come in 14.3/14.6/14.8):
- **Alert saldo**: `sendNegativeBalanceAlert` è GIÀ chiamata dal percorso volo (`flights.service.ts:779` e `:1114`, oltre che da `accounts.service.ts:675`) — quindi D1 "estendere l'alert al volo" è già fatto. Ciò che manca è ciò che l'utente ha davvero segnalato: **nessun segnale a chi registra** (l'alert è una email al pilota, e se la persona non ha email finisce in `console.warn` — visto nei log della suite). Serve il feedback IN-APP all'operatore al momento della registrazione.
- **Check scadenze**: `flights.service.ts` non ha ALCUN controllo su scadenze/visita medica (grep: zero occorrenze). Il pattern esiste per le PRENOTAZIONI (story 7.4: `ExpiryType.blocksBooking`, `blockingDocuments`/`warnings` in `bookings.service.ts:255-277`, con force+motivazione già implementati) — **va riusato, non reinventato**.

## Acceptance Criteria

1. **(Blocco medico sul volo — R4)** `registerFlight`/`correctFlight` rifiutano (422, codice dedicato, es. `FLIGHT_BLOCKED_BY_EXPIRY`) se il PILOTA o l'ISTRUTTORE hanno un documento bloccante scaduto **alla data del volo** (non "oggi"): la validità si valuta su `flightDate`. Riuso del core condiviso delle prenotazioni (`blocksBooking` + il calcolo di `blockingDocuments`) — se il flag va rinominato/generalizzato (es. `blocksOperation`), farlo con migrazione additiva e senza cambiare la semantica esistente delle prenotazioni.
2. **(Override admin motivato — R4)** Un attore ADMIN può forzare la registrazione con conferma esplicita e **motivazione obbligatoria**, persistita e visibile (stesso pattern di `forcedAt`/motivo delle prenotazioni 7.4). Chi non è admin non può forzare mai (403/422 anche via API diretta). L'override è un'azione deliberata: mai il default, mai silenzioso.
3. **(Segnale saldo all'operatore — item 3)** Al momento della registrazione, se il volo porta il conto del pilota in negativo (o peggiora la banda 3.3), chi registra vede un avviso IN-APP chiaro e non bloccante (il volo si registra: è un avviso, non un veto) con il saldo risultante. L'email esistente al pilota resta INVARIATA. Valutare e motivare se l'avviso va anche in correzione volo.
4. **(UI coerente)** Blocco e avviso vivono nel form volo con lo stesso linguaggio degli altri guard-rail dell'app (pattern "Forza prenotazione" di 7.4, validazione per-campo 14.2): messaggio che NOMINA il documento scaduto e la sua data; mai un vicolo cieco (lezione 14.6 F2); i18n IT/EN.
5. **(Invarianti)** Nessun cambiamento ai calcoli di addebito/compenso, alle regole 14.3 (allievo→SCHOOL, correzione a tipo invariato) né al blocco prenotazioni 7.4. I voli storici non vengono rivalutati.
6. **(Test)** Unit: documento bloccante scaduto alla data del volo → 422; valido alla data del volo ma scaduto oggi → OK (la data conta); istruttore bloccato → 422; override admin → OK con motivazione persistita; override non-admin → negato; avviso saldo → presente quando il saldo va sotto zero, assente altrimenti. e2e: il form mostra il blocco col nome del documento, l'admin forza con motivazione, l'avviso saldo compare. Full suite CI=1 verde; unit in shell PULITA (`env -u DATABASE_URL -u AUTH_SECRET`).

## Contesto (puntatori — ricognizione 2026-07-29)

- Voli: `src/server/services/flights.service.ts` — `resolveFlightInput` (dove vivono i check di dominio; ora accetta `originalFlightType`, story 14.3), `sendNegativeBalanceAlert` già invocata a `:779`/`:1114`.
- Pattern da riusare: `src/server/services/bookings.service.ts:255-277` (`blocksBooking`, `blockingDocuments`, `warnings`) + il force motivato di story 7.4 (`forcedAt`, motivo) e i suoi e2e (`bookings.spec.ts`, "Booking expiry block").
- Bande saldo: `accounts.service.ts` — `balanceBand` (`:463`), `bandWorsened` (`:475`), `sendNegativeBalanceAlert` (`:510`, email; `console.warn` se la persona non ha email).
- UI: `logbook/flight-editor.tsx` (form volo, con `Field.error`/`Field.hint` dalla 14.2/14.3), `logbook-console.tsx`.
- **Ambiente**: ciclo e regole macchina come `docs/handoffs/HANDOFF.md`; reset DB via docker compose (`scripts/reset-db.sh` NON funziona qui). e2e: MAI `Escape` per chiudere popup dentro SlideOver; run mirati ripetuti fanno scattare il lock TD-6 (interrogare `LoginAttempt`); `t.raw` per i testi i18n con segnaposto riempiti lato client; gate vero = full suite CI=1 prod. Commit su `dev`: `feat(14.4): guard-rail volo — blocco medico con override admin, avviso saldo` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Rimozione ruolo STAFF (story 14.9) — ma la regola dell'override va scritta sul PERMESSO, non sul ruolo, così la 14.9 non deve ritoccarla.
- Indagine performance (TD-8).
- Modifiche al meccanismo email esistente.

## Dev Agent Record

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
