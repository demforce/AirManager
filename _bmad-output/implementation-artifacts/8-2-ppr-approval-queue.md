---
baseline_commit: e57e258
---

# Story 8.2: Coda di approvazione PPR con email di esito

Status: ready-for-dev

## Story

As a staff,
I want approvare o rifiutare le richieste PPR,
so that il traffico in arrivo sia sotto controllo (FR-23).

## Acceptance Criteria

1. **Given** richieste `in attesa`, **When** ne approvo una, **Then** il sistema assegna un numero PPR univoco progressivo (es. PPR-2026-0042), lo stato diventa `approvato` e il richiedente riceve email con numero, data/ora e istruzioni operative configurabili dall'admin.
2. **Given** una richiesta da rifiutare, **When** la rifiuto con motivo obbligatorio, **Then** stato `rifiutato` ed email con il motivo; la coda PPR in attesa è in evidenza nella dashboard staff.

## Contesto e decisioni di design (vincolanti)

- **Permesso NUOVO `ppr.manage`** (pre-annunciato dal TODO in `nav-items.ts:27-33`): aggiungerlo a `Permission`, `ALL_PERMISSIONS` e alla lista **STAFF** in `ROLE_PERMISSIONS` (`rbac.ts` — ADMIN lo eredita da ALL; istruttore/pilota/allievo NO) + assert in `rbac.test.ts`. Voce nav `ppr`: `permissions: ['ppr.manage']` e **href `/dashboard/ppr`** (il vecchio `/ppr-queue` era un segnaposto mai costruito); aggiornare `nav-items.test.ts` (admin la vede, pilota/allievo no, + assert esplicita che STAFF la vede). Rimuovere il TODO ormai saldato.
- **Estensione modello `PprRequest`** (migrazione `add_ppr_decision`): `pprNumber String? @unique`, `rejectionReason String?`, `decidedAt DateTime?`, `decidedByUserId String?` + FK `User? @relation("PprRequestDecidedBy")` (back-relation `User.pprRequestsDecided` — pattern 7.4 `BookingForcedBy`). **NUOVO modello contatore `PprCounter { year Int @id, lastSeq Int }`**: la numerazione progressiva è per anno e NON può avere buchi da race (vedi sotto). NIENTE modifiche a CashMovement (8.3).
- **Assegnazione numero airtight (AC 1)** — precedente di atomicità 7.1/7.3 (lock in tx, guard fusi nella write):
  1. In `prisma.$transaction`: `SELECT "status" FROM "PprRequest" WHERE "id" = ${id} FOR UPDATE` → assente → 404; `status !== 'PENDING'` → **409 `PPR_ALREADY_DECIDED`**.
  2. `year` = anno **Europe/Rome** dell'istante di approvazione: `dateOnlyInZone(now, APP_TIMEZONE).slice(0, 4)` (`zoned-time.ts` — MAI `getUTCFullYear`, diverge a cavallo di Capodanno).
  3. Contatore atomico in un solo statement: `INSERT INTO "PprCounter" ("year","lastSeq") VALUES (${year},1) ON CONFLICT ("year") DO UPDATE SET "lastSeq" = "PprCounter"."lastSeq" + 1 RETURNING "lastSeq"` (l'upsert prende il row lock: due approvazioni parallele NON possono duplicare; il lock FOR UPDATE al punto 1 garantisce che un 409 non bruci un numero).
  4. `pprNumber = 'PPR-' + year + '-' + String(seq).padStart(4, '0')`; update della riga con status/pprNumber/decidedAt/decidedByUserId.
- **Chiusura del deferred #3 del handoff (7.3 D1)**: `ConflictError` in `errors.ts` guadagna il **`code` opzionale** col default `'CONFLICT'` (STESSA firma di `ValidationError`: `constructor(message, details?, code = 'CONFLICT')`) — nessun consumer esistente cambia; `PPR_ALREADY_DECIDED` è il primo uso. Mapping 409 in `handler.ts` INVARIATO.
- **Rifiuto (AC 2)**: `rejectPprRequest(actor, id, reason)` con `reason` obbligatorio `z.string().trim().min(1).max(500)` (precedente `reverseCashMovementSchema`); stessa tx col FOR UPDATE + guard PENDING (404/409 identici), update a `REJECTED` + `rejectionReason`/`decidedAt`/`decidedByUserId`; NIENTE numero (il contatore non si tocca).
- **Service** (`ppr.service.ts` — le nuove funzioni, a differenza di `createPprRequest` pubblico, RICEVONO `Actor` e chiamano `authorize(actor, 'ppr.manage')` PRIMA di ogni query — AD-5, il precedente RBAC è `expiry-types.service.ts`): `listPprRequests(actor, query)` (paginata `createdAt asc` FIFO, filtro `status` opzionale default `PENDING`), `approvePprRequest(actor, id)`, `rejectPprRequest(actor, id, reason)`. DTO item con TUTTI i campi del dettaglio (PRD: "vede le richieste in attesa, il dettaglio") ma **MAI `submitterIp`** (dato tecnico anti-abuso, non esposto).
- **Email di esito (AC 1/2)**: `buildPprApprovalEmail(locale, { firstName, pprNumber, aircraftRegistration, eta, operatingInstructions? })` e `buildPprRejectionEmail(locale, { firstName, aircraftRegistration, eta, reason })` in `templates.ts`, pattern `createTranslator` + namespace `Emails.pprApproval`/`Emails.pprRejection`; `locale` = `pprRequest.locale` (persistita in 8.1 apposta); ETA via `formatDateTime` (Europe/Rome); subject approvazione col `pprNumber`. Invio **best-effort DOPO la tx** (pattern 8.1: try/catch, log, la decisione resta valida — NIENTE coda retry, deferral NFR-7 invariato).
- **Istruzioni operative configurabili dall'admin (AC 1)** — primo uso REALE del modello `AppSetting` (K/V esistente da story 1.1, zero plumbing finora): nuovo `app-settings.service.ts` minimale con `getPprOperatingInstructions()` → `{ it: string, en: string }` (chiavi `ppr.operatingInstructions.it`/`ppr.operatingInstructions.en`, assente = `''`) e `setPprOperatingInstructions(actor, { it, en })` gated **`settings.manage`** (admin-only, pattern write di expiry-types); API `GET`/`PUT /api/v1/settings/ppr-operating-instructions` (GET gated `ppr.manage` — lo staff le vede in coda, l'admin le edita; PUT `settings.manage`; bound `max(2000)` per lingua). **SCOPO CONTROLLATO**: NIENTE pagina `/settings` generale (resta deferred di progetto) — l'editor è una sezione della pagina coda `/dashboard/ppr` visibile solo a chi ha `settings.manage` (textarea IT + EN, salva, feedback inline). L'email di approvazione include le istruzioni nella lingua del richiedente SOLO se non vuote (sezione omessa se stringa vuota).
- **API**: `GET /api/v1/ppr-requests` — ATTENZIONE: il path è in `PUBLIC_API_PATHS` (bypass middleware, aggiunto in 8.1 per la POST): la GET si appoggia ad `apiRoute` default (`auth: 'required'` → 401 senza sessione) + `authorize` nel service — AD-5 "il middleware non è mai l'unico guardiano" vale alla lettera qui; doc-comment nella route che lo dichiara. `POST /api/v1/ppr-requests/[id]/approve` (senza body) e `POST /api/v1/ppr-requests/[id]/reject` (body `{ reason }`) — ENTRAMBE con **`idempotency: { endpoint: 'ppr-approve' | 'ppr-reject' }`** (TD-2, pattern `cash-movements`: transizioni di stato con effetti esterni-email; chiude ANCHE il deferred #2 del handoff per la parte mutazioni PPR autenticate). Questi path NON vanno in `PUBLIC_API_PATHS`. Registry OpenAPI: item/list/reject schemas + 3 path autenticati (`security` cookieAuth, `errorResponses(401,403,404,409,422)` per le POST; la GET senza 409/422 … usare l'insieme corretto) + `registry.test.ts`.
- **Pagina coda `/dashboard/ppr`** (nuova, server + client): modello UI = `proposals-queue.tsx` (coda PENDING con azioni per riga, two-step confirm) + il reject con textarea motivo inline (precedente form-in-riga: `bookings-list.tsx`). Riga: richiedente, marche/tipo, provenienza→destinazione, ETA (data+ora Europe/Rome), persone; **dettaglio espandibile** per riga con TUTTI i campi (email, telefono, ETD, note, lingua). Approva → conferma → riga esce dalla coda + feedback col numero assegnato; Rifiuta → textarea motivo obbligatorio + conferma. Vuoto-coda con empty state. Namespace i18n NUOVO `PprQueuePage.*` simmetrico IT/EN. Stile `minimalist-ui` coerente (è una vista dashboard: NIENTE hero, tabella e azioni sobrie come bookings/expiries).
- **Widget dashboard staff (AC 2)**: in `dashboard/page.tsx` (pattern widget 6.4, gate INVERSO): se `hasPermission(actor, 'ppr.manage')` → sezione `data-testid="ppr-pending-widget"` con conteggio e prime 5 richieste in attesa (`listPprRequests` server-side, `status: PENDING, pageSize: 5`) + link alla coda; nessuna richiesta in attesa → widget con stato "nessuna richiesta" (il conteggio zero è informazione per lo staff, NON nascondere — decisione: FR-41 "PPR in attesa" è un pannello fisso del ruolo).
- **Seed**: aggiungere l'utente **`staff@airmanager.local`** (ruolo STAFF, password `SEED_ADMIN_PASSWORD`, pattern upsert idempotente degli utenti esistenti — serve agli e2e per provare `ppr.manage` REALE e non via ADMIN-che-ha-tutto; utile a tutto l'epic).

## Tasks / Subtasks

- [ ] Task 1: RBAC + nav (AC 1/2)
  - [ ] `rbac.ts`: `ppr.manage` in union/ALL/STAFF + `rbac.test.ts`; `nav-items.ts`: entry ppr → `['ppr.manage']`, href `/dashboard/ppr`, TODO rimosso; `nav-items.test.ts` aggiornato (admin+staff vedono, pilota/allievo no).
- [ ] Task 2: Modello + migrazione (AC 1/2)
  - [ ] `PprRequest` + campi decisione/FK/back-relation; `PprCounter`; migrazione `add_ppr_decision`; `migrate deploy` + `generate`; seed: utente staff.
- [ ] Task 3: Errori + service (AC 1/2)
  - [ ] `errors.ts`: `ConflictError` con `code` opzionale (default `'CONFLICT'` — zero consumer toccati).
  - [ ] `ppr.service.ts`: `listPprRequests` (authorize, FIFO, filtro status default PENDING, DTO senza submitterIp), `approvePprRequest` (tx: FOR UPDATE → 404/409 `PPR_ALREADY_DECIDED` → anno Europe/Rome → upsert contatore RETURNING → update; email best-effort post-tx con istruzioni per-locale), `rejectPprRequest` (tx identica senza contatore; email col motivo).
  - [ ] `app-settings.service.ts`: get/set istruzioni operative (chiavi `ppr.operatingInstructions.{it,en}`, set gated `settings.manage`, get gated `ppr.manage`).
- [ ] Task 4: Schemi + API + OpenAPI (AC 1/2)
  - [ ] `schemas/ppr.ts`: `listPprRequestsQuerySchema` (pagination + status enum opz.), `pprRequestItemSchema` (tutti i campi dettaglio, no submitterIp), `rejectPprRequestSchema` (`reason` 1..500), `pprOperatingInstructionsSchema` (`{ it, en }` max 2000); route `GET /api/v1/ppr-requests` (stesso file della POST pubblica, doc-comment sul bypass middleware), `POST .../[id]/approve` e `.../[id]/reject` (idempotency TD-2), `GET/PUT /api/v1/settings/ppr-operating-instructions`; registry + `registry.test.ts`.
- [ ] Task 5: Email (AC 1/2)
  - [ ] `templates.ts`: `buildPprApprovalEmail` (numero nel subject, ETA formatDateTime, istruzioni solo se non vuote) + `buildPprRejectionEmail` (motivo); `Emails.pprApproval`/`Emails.pprRejection` simmetrici IT/EN.
- [ ] Task 6: UI (AC 1/2) — stile `minimalist-ui`, skill obbligatorie (vedi Dev Notes)
  - [ ] `/dashboard/ppr` `page.tsx` + `ppr-queue.tsx`: coda PENDING FIFO con dettaglio espandibile, approva two-step (feedback col numero), rifiuta con motivo obbligatorio inline, empty state, sezione istruzioni operative (edit solo `settings.manage`); i18n `PprQueuePage.*`.
  - [ ] Widget `ppr-pending-widget` in `dashboard/page.tsx` (conteggio + prime 5 + link; visibile a `ppr.manage`, anche a coda vuota).
  - [ ] Verifica interattiva Playwright MCP (coda, approva con numero visibile, rifiuta con motivo, editor istruzioni, widget, mobile 375×812) PRIMA degli e2e.
- [ ] Task 7: Test (AC 1/2)
  - [ ] Unit `ppr.service.test.ts` (mock Prisma + mail): authorize-first su tutte e 3; 404 assente; APPROVED/REJECTED → 409 `PPR_ALREADY_DECIDED` con code sul body; formato numero `PPR-<year>-0001`/padding; anno da Europe/Rome (istante 31/12 23:30Z → anno NUOVO a Roma); reject non tocca il contatore; email approvazione con/senza istruzioni (sezione omessa); email fallita → decisione resta; DTO senza submitterIp; list default PENDING/FIFO. Unit `app-settings.service.test.ts` (get default '', set gated). Unit `errors.test.ts` o esistente: ConflictError code default/custom. Schema: reason obbligatorio.
  - [ ] e2e NUOVO `e2e/ppr-queue.spec.ts` (run-unique; richieste create via POST pubblica con IP finti run-unique — pattern 8.1): staff (`staff@airmanager.local`) apre la coda e vede la richiesta run-unique; admin imposta le istruzioni via UI; staff approva → feedback col numero `PPR-\d{4}-\d{4}`, riga fuori dalla coda, email Mailpit col numero E le istruzioni nella lingua del form (IT); reject di una seconda richiesta con motivo → email col motivo (EN se form EN); reject senza motivo → errore inline, nessuna chiamata; doppia decisione via API → 409 envelope `PPR_ALREADY_DECIDED`; pilota: GET /api/v1/ppr-requests → 403 e nav senza voce ppr; widget dashboard: conteggio visibile per staff con la coda popolata.
- [ ] Task 8: Story file aggiornato (Dev Agent Record, File List, Status: review) + `sprint-status.yaml` → `8-2-ppr-approval-queue: review`, tutto NEL commit di implementazione.

## Dev Notes

- **Perimetro**: SOLO coda/decisione/email/istruzioni/widget. NIENTE chiusura/tassa/registro filtrabile/export (8.3), NIENTE pagina `/settings` generale (deferred), NIENTE re-invio email o coda retry (NFR-7 deferral), NIENTE edit della richiesta.
- **Gli e2e del rate limit 8.1 restano intoccati**: le nuove richieste e2e usano IP finti run-unique (mai riusare IP fissi).
- **AD-5**: `authorize` PRIMA di ogni query in TUTTE le nuove funzioni (il precedente in ppr.service è la deroga pubblica di 8.1 — NON copiarla). **AD-8**: codici stabili nuovi `PPR_ALREADY_DECIDED` (409); 404 per id inesistente; envelope invariato. **AD-1**: la UI consuma le stesse API.
- **Concorrenza**: la matrice 409-vs-numero è il cuore della story — il FOR UPDATE sulla riga PRIMA dell'upsert contatore garantisce che decisioni concorrenti sulla STESSA richiesta diano 1 successo + 1 409 senza bruciare numeri; approvazioni concorrenti su richieste DIVERSE danno numeri distinti consecutivi. Il reviewer lo proverà dal vivo: scrivere il codice contando su questo scrutinio.
- **Idempotency TD-2**: `Idempotency-Key` per-utente, gate dopo Zod (pattern `cash-movements/route.ts:20-25`); dichiara nel registry l'header con `idempotencyKeyHeader`.
- **Lezioni review correnti**: guard fusi nella write atomica dentro tx (7.3); istanti-non-stringhe (N1 7.1); `.max()` su ogni stringa; i18n simmetrica contata; osservabili run-unique negli e2e; N1 8.1 (TOCTOU rate limit) NON è di questa story — non "sistemarlo" di passaggio.
- **Skill UI obbligatorie (regola utente)**: `design-taste-frontend` E `ui-ux-pro-max` (query utili: `"approval queue table row actions"`, `"admin settings inline form"`); coerenza `minimalist-ui`; Playwright MCP interattivo prima degli e2e.
- **Ambiente**: DB fresco all'avvio del dev; Mailpit :8025/:1025; build SEMPRE `env -u NODE_ENV npx next build`; MAI `playwright install`; prima del gate e2e: `curl localhost:3000` DEVE fallire (altrimenti `fuser -k 3000/tcp`).
- **Gate**: lint 0 errori (warning benigno noto), typecheck, `npx vitest run` (≥ 986 + nuovi), build, `npx playwright test` (141 baseline + nuovi; 4 flake da contention noti passano in isolamento).
- Un commit di implementazione (`Story 8.2: <sintesi>`, nessun riferimento AI/modello), NON push. Verificare `git status` (branch `claude/handoff-documentation-yjqssv`) prima del commit.

### Project Structure Notes

- Nuovi: migrazione `add_ppr_decision`, `src/server/services/app-settings.service.ts`(+test), `src/app/api/v1/ppr-requests/[id]/{approve,reject}/route.ts`, `src/app/api/v1/settings/ppr-operating-instructions/route.ts`, `src/app/[locale]/dashboard/ppr/{page.tsx,ppr-queue.tsx}`, `e2e/ppr-queue.spec.ts`.
- Modificati: `prisma/schema.prisma`, `prisma/seed.ts`, `src/server/auth/rbac.ts`(+test), `src/app/[locale]/dashboard/nav-items.ts`(+test), `src/server/services/errors.ts`, `src/server/services/ppr.service.ts`(+test), `src/lib/schemas/ppr.ts`, `src/lib/schemas/registry.ts`(+test), `src/app/api/v1/ppr-requests/route.ts` (aggiunta GET), `src/server/adapters/mail/templates.ts`, `src/app/[locale]/dashboard/page.tsx`, `messages/{it,en}.json`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.2]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-23, UJ-3, FR-41]
- [Source: _bmad-output/implementation-artifacts/8-1-ppr-public-form.md] — modello, service pubblico, email pattern, e2e IP finti
- [Source: docs/handoffs/HANDOFF.md#Deferred 2, 3] — idempotenza mutazioni PPR; ConflictError code opzionale (7.3 D1)
- [Source: prisma/schema.prisma#AppSetting ~13-20] — K/V esistente, primo uso reale
- [Source: src/server/services/bookings.service.ts#createBooking tx] — precedente FOR UPDATE in $transaction
- [Source: src/app/[locale]/dashboard/expiries/proposals-queue.tsx] — precedente coda con decisioni
- [Source: src/app/[locale]/dashboard/bookings/bookings-list.tsx] — precedente form-in-riga con motivo
- [Source: src/app/api/v1/cash-movements/route.ts#POST] — pattern idempotency TD-2
- [Source: src/app/[locale]/dashboard/page.tsx#my-expiries-widget] — pattern widget 6.4
- [Source: src/lib/zoned-time.ts#dateOnlyInZone] — anno Europe/Rome
- [Source: src/lib/api/pagination.ts] — paginazione query/response

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-09: Story file created (Fable 5 main session via bmad-create-story), ready-for-dev.
