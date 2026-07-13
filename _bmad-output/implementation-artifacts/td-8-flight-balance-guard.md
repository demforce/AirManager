---
baseline_commit: TBD-at-dispatch (dopo TD-7 done+review — verificare `git log`)
---

# TD-8: Blocco addebito volo a saldo insufficiente + override admin (change request utente 2026-07-13)

Status: ready-for-dev

## Story

As a gestore dell'aviosuperficie,
I want che un volo NON si possa registrare quando il suo importo supera il saldo disponibile del titolare, salvo forzatura motivata di un admin,
so that i conti prepagati non vadano mai in negativo per un addebito volo senza una decisione esplicita e tracciata (change request utente 2026-07-13; ratifiche: override SOLO admin; blocco se il saldo andrebbe sotto zero).

## Acceptance Criteria

1. **Blocco pre-addebito** — **Given** la registrazione di un volo (`registerFlight`) il cui **importo finale addebitato** (componente velivolo DOPO la copertura pacchetti + componente istruttore) è **maggiore del saldo disponibile** del titolare addebitato (pilota o allievo), **Then** la registrazione fallisce con **422 AD-8 `INSUFFICIENT_BALANCE`** e `details: { balanceCents, amountCents }`; NESSUNA scrittura (niente volo, niente movimento, niente consumo pacchetti, contaore invariato). Il confronto avviene DENTRO la transazione, dopo il calcolo dell'importo effettivo e sotto il lock `FOR UPDATE` già esistente sull'Account (race-safe con ricariche/rettifiche concorrenti). `amountCents == balanceCents` PASSA (saldo a zero esatto è lecito); un volo interamente coperto da pacchetti (`amountCents == 0`) passa SEMPRE, anche a saldo già negativo.
2. **Override admin-only** — **Given** `force: true` + `forceReason` (non vuota) nell'input, **Then**: un actor SENZA la nuova permission `flights.force.balance` (solo ADMIN via `ALL_PERMISSIONS`; STAFF esplicitamente NO) riceve **403** PRIMA di ogni side-effect (stesso ordine del force di 7.4); un admin registra il volo anche a saldo insufficiente e il volo viene stampato con `balanceForcedAt` / `balanceForcedByUserId` / `balanceForceReason` (settati INSIEME, mai parziali — stesso pattern `Booking.forcedAt`). `force: true` quando NON c'è nulla da forzare (saldo capiente) = no-op dichiarato: il volo si registra normale SENZA stamping (coerente con 7.4). Lo schema Zod rifiuta `force` senza `forceReason` (refine, come `createBookingSchema`).
3. **Stessa regola sulla correzione** — **Given** `correctFlight` (storno + ri-registrazione), **Then** il NUOVO addebito è soggetto allo stesso check: il confronto usa il saldo COME RISULTA DOPO lo storno del movimento originale (lo storno rimette i soldi sul conto prima del nuovo addebito — dichiarare l'ordine nel codice); stesso 422 / stesso override admin con stessi campi.
4. **Alert email invariato** — l'email di saldo negativo (banda peggiorata) resta e continua a scattare sui voli FORZATI che portano il conto sotto soglia; per i voli bloccati non parte nulla (nessuna scrittura).
5. **Migrazione** — i 3 campi su `Flight` sono l'UNICA modifica di schema (migrazione nuova, nullable, nessun backfill: i voli storici non erano forzati). `OpenAPI`/schemi Zod aggiornati (input `force`/`forceReason`; il DTO lista/dettaglio espone i campi forced SOLO a chi ha `flights.manage`, stessa regola di `actorEmail`).
6. **UI dialog registrazione/correzione** — **Given** il 422 `INSUFFICIENT_BALANCE`, **Then** il dialog mostra un errore che NOMINA saldo e importo (nuova chiave in `FlightsPage.form.errors`, it/en, formattazione monetaria esistente); **solo se l'actor è admin** (prop derivata server-side da `hasPermission(actor,'flights.force.balance')`, pattern `readOnly` 2.3) compare l'affordance "Forza registrazione" con campo motivazione obbligatorio che ri-sottomette con `force`+`forceReason` — STESSO pattern UI del "Forza prenotazione" di 7.4 (inclusa la scelta visiva corrente, decisione 121-N1 ancora pendente non toccata). Per staff: solo l'errore, nessuna forzatura. Lo sheet dettaglio volo mostra la deroga (motivazione) sui voli forzati, visibile solo a `flights.manage`.
7. **Test** — unit (`flights.service.test.ts`): blocco esatto al centesimo, pass a saldo esatto, copertura pacchetti che azzera l'importo, force senza permission → 403, force admin → stamping, correzione con saldo post-storno, no-op force a saldo capiente. e2e (file più pertinente, es. `package-consumption.spec.ts` o nuovo spec piccolo): staff bloccato con 422 e messaggio nel dialog; admin forza con motivazione e il volo appare nel registro; API diretta 403 per staff con force.
8. **Given** la suite, **Then** `npm run gates` passa e gli e2e mirati (flights, flight-log, flight-reversal, package-consumption, bookings se toccato, nuovo spec) sono verdi su DB fresco.

## Contesto e decisioni di design (vincolanti)

- **Ratifiche utente 2026-07-13 (sera)**: (1) override SOLO admin — lo staff è bloccato e basta; (2) soglia del blocco = saldo sotto ZERO (non la soglia di alert configurabile, che resta solo per l'email).
- **Stato attuale (recon su `registerFlight`, flights.service.ts:839-923)**: NESSUN check — l'addebito passa sempre; a banda peggiorata parte solo `sendNegativeBalanceAlert` (fire-and-forget, post-commit). Il saldo è leggibile dentro la transazione (l'Account è già lockato `FOR UPDATE` a :873); l'importo finale (post-pacchetti FIFO + istruttore) è calcolato in `registerFlightCore` — il check va DOPO quel calcolo, PRIMA delle scritture dei movimenti.
- **Pattern di riferimento (story 7.4, bookings)**: input `force`/`forceReason` con refine Zod; 403 per force senza permission PRIMA di ogni verifica (bookings.service.ts:301-306); 422 con code + details; stamping `forcedAt`/`forcedByUserId`/`forceReason` set-together (schema.prisma:970, doc :942-943). Massima simmetria di naming: `balanceForcedAt`/`balanceForcedByUserId`/`balanceForceReason` (prefisso balance: su Flight potranno esistere altre forzature in futuro).
- **Permission nuova `flights.force.balance`** nel catalogo `rbac.ts`: ADMIN la eredita da `ALL_PERMISSIONS`, STAFF NON la riceve (ratifica). Niente check di ruolo hardcoded nei service — sempre `authorize`/`hasPermission`.
- **Titolare addebitato** = la persona del volo (pilota o allievo nei voli scuola): il check vale per chiunque venga addebitato, nessuna distinzione.
- **Fuori scope (dichiarato)**: blocco a livello PRENOTAZIONE (esiste già il blocco scadenze 7.4 — il saldo si valuta solo alla registrazione, dove l'importo è noto); soglia configurabile per il blocco; sblocco/deroga per staff; UI di riepilogo deroghe; 121-N1 (decisione visiva bottone force pendente — NON cambiarne lo stile qui).

## Tasks / Subtasks

- [ ] **T1 (AC 5)** — Migrazione: 3 campi nullable su `Flight`; schemi Zod input (`force`/`forceReason` + refine) e DTO (campi forced gated `flights.manage`); OpenAPI.
- [ ] **T2 (AC 1, 2, 3)** — `rbac.ts` permission nuova; check in `registerFlightCore`/`correctFlight` (dopo calcolo importo, saldo post-storno per la correzione), 422 `INSUFFICIENT_BALANCE` con details; 403 force non-admin; stamping set-together; no-op force dichiarato.
- [ ] **T3 (AC 4)** — Verifica che l'alert email resti invariato (nessun cambio atteso — dichiarare).
- [ ] **T4 (AC 6)** — Dialog registrazione/correzione: errore con saldo/importo; affordance force admin-only (prop server-side); sheet dettaglio con la deroga; i18n it/en.
- [ ] **T5 (AC 7, 8)** — Unit + e2e; `npm run gates`; run e2e mirati su DB fresco.
- [ ] **T6** — Dev Agent Record + File List; sprint-status `td-8` → `review`.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; per la parte UI: `impeccable`, `design-taste-frontend`, `ui-ux-pro-max`; contratto `DESIGN.md` + Addendum Palette v2 (Ember SOLO error/distruttivo — il messaggio 422 è un errore, l'affordance force segue il pattern 7.4 esistente).
- Il rischio n.1 è l'ordine dentro la transazione della CORREZIONE (storno prima, check sul saldo risultante, poi nuovo addebito) — coprirlo con un unit test dedicato al centesimo. Il rischio n.2 è esporre i campi forced nel DTO own-access: gated `flights.manage` come `actorEmail`, con test.
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`); gates SOLO `npm run gates`; MAI `playwright install`; MAI stash; MAI `git add -A`; niente screenshot committati; password seed SOLO da env.
- Baseline: DOPO TD-7 (fusione Piloti+Utenti) — contare migrazioni/test correnti a inizio dev e riportarli nel Record.

### Project Structure Notes

- Modifiche attese: `prisma/schema.prisma` + migrazione nuova, `src/server/auth/rbac.ts`, `src/server/services/flights.service.ts` (+ test), `src/lib/schemas/flights.ts`, route flights se serve il code mapping, dialog voli (`flights-manager.tsx` + `flight-detail-sheet.tsx`), `messages/{it,en}.json`, e2e. NESSUNA env var o dipendenza nuova.

### References

- [Source: change request utente 2026-07-13 («check sul balance del pilota prima di creare ed addebitare un volo … override dell'admin») + 2 ratifiche AskUserQuestion (solo admin; blocco sotto zero)]
- [Source: recon in sessione — flights.service.ts:839-923 (nessun check, lock Account :873, alert :909-917), bookings.service.ts:301-306 + schema.prisma:942-970 (pattern force 7.4), rbac.ts (catalogo permission)]
- [Source: story 7.4 (force prenotazioni), 5.2 (consumo pacchetti FIFO), 3.3 (soglia alert e bande)]

## Dev Agent Record

### Agent Model Used

_(dev subagent)_

### Debug Log References

### Completion Notes List

### File List

## Change Log
