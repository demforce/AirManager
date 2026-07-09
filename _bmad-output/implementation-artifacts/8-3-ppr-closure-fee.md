---
baseline_commit: 7acc696
---

# Story 8.3: Chiusura PPR e tassa di atterraggio

Status: ready-for-dev

## Story

As a staff,
I want chiudere i PPR e incassare la tassa,
so that il registro e la cassa siano completi (FR-24).

## Acceptance Criteria

1. **Given** un PPR approvato, **When** lo marco `completato` confermando la tassa di atterraggio (default configurabile dall'admin, importo modificabile), **Then** nasce un CashMovement in entrata categoria "PPR" collegato al PPR; con tassa zero nessun movimento.
2. **Given** un PPR approvato mai arrivato, **When** lo marco `annullato`, **Then** nessun movimento di cassa; il registro PPR è filtrabile per stato/periodo.

## Contesto e decisioni di design (vincolanti)

- **Skill `karpathy-guidelines` obbligatoria** (regola utente in CLAUDE.md): leggere `.claude/skills/karpathy-guidelines/SKILL.md` prima di iniziare e applicarla (assunzioni esplicite, semplicità, modifiche chirurgiche, criteri verificabili).
- **Schema (migrazione `add_ppr_closure_fee`)**: su `CashMovement` nuovo FK **NON-unique** `pprRequestId String?` + relation + `@@index([pprRequestId])` (ERD `PprRequest ||--o{ CashMovement`; precedente esatto: `AccountMovement.flightId` non-unique con index — NON il pattern `accountMovementId @unique`); back-relation `PprRequest.cashMovements CashMovement[]`. Su `PprRequest`: `closedAt DateTime?`, `closedByUserId String?` + FK `User? @relation("PprRequestClosedBy")` (back-relation `User.pprRequestsClosed` — la CHIUSURA è un evento distinto dalla DECISIONE 8.2, non riusare decidedAt/decidedBy), `landingFeeCents Int?` (stampato SOLO al completamento, 0 incluso — è il dato del registro; NULL per cancellato/non chiuso).
- **Default tassa configurabile (AC 1)**: estendere `app-settings.service.ts` (pattern 8.2): chiave `ppr.landingFeeCents` (valore String = int centesimi serializzato), `getPprLandingFeeDefaultCents(actor)` → number gated `ppr.manage` (default **0** se assente; valore memorizzato non parsabile → 0 + `console.warn`, doc-comment), `setPprLandingFeeDefaultCents(actor, cents)` gated `settings.manage`, bound `int 0..2_147_483_647`. API `GET`/`PUT /api/v1/settings/ppr-landing-fee` (mirror esatto di `ppr-operating-instructions`). UI: la sezione impostazioni ESISTENTE della pagina `/dashboard/ppr` (visibile a `settings.manage`) guadagna il campo "Tassa di atterraggio predefinita" in euro (input stringa-euro + `parseCents` al submit, pattern `cash-register.tsx`; 0 ammesso, placeholder `0,00`).
- **Service `completePprRequest(actor, id, { landingFeeCents })`** — `authorize(actor, 'ppr.manage')` PRIMA di tutto (AD-5); in `prisma.$transaction`:
  1. Lock `FOR UPDATE` sulla riga (GENERALIZZARE l'helper `lockPendingPprRequest` di 8.2 in un helper con stato atteso parametrico — modifica chirurgica, i call site 8.2 restano identici nel comportamento): assente → 404; `status !== 'APPROVED'` → **409 `PPR_NOT_APPROVED`** (nuovo code stabile su `ConflictError`, distinto da `PPR_ALREADY_DECIDED`: qui il problema è lo STATO, vale sia per PENDING sia per già chiuso).
  2. Update: `status: 'COMPLETED'`, `closedAt`, `closedByUserId`, `landingFeeCents` (dal body, 0 ammesso).
  3. **`landingFeeCents > 0`** → `tx.cashMovement.create` DIRETTO (NON la `recordCashMovement` pubblica id-based — precedente flusso automatico: `recordTopUp` con `'Ricariche'`): categoria **"PPR"** risolta per `name` unique DENTRO la tx — assente o `isActive: false` → errore LOUD (rispettivamente `NotFoundError`/`ConflictError`, "fails loudly by design" come da doc di cash.service: la tx fallisce TUTTA, niente PPR completato senza movimento); `amountCents: +landingFeeCents` (entrata positiva), `description: 'PPR <pprNumber> landing fee'` (stessa lingua/stile delle description automatiche esistenti di recordTopUp — verificarne la convenzione esatta e allinearsi), `effectiveDate` = GIORNO della chiusura in **Europe/Rome** (`dateOnlyInZone(now, APP_TIMEZONE)` → Date UTC-midnight, MAI `new Date()` nudo su una colonna `@db.Date` — lezione 3.5), `actorUserId: actor.userId`, `pprRequestId: id`, `accountMovementId`/`reversalOfId` null. **`landingFeeCents === 0` → NESSUNA create** (branch prima).
- **Service `cancelPprRequest(actor, id)`**: stessa tx e guard (`APPROVED` → altrimenti 404/409 `PPR_NOT_APPROVED`); update `status: 'CANCELLED'`, `closedAt`, `closedByUserId`; NIENTE movimento, NIENTE fee, NIENTE motivo (l'AC non lo chiede — karpathy: niente speculativo). Nessuna email in TUTTA la story (FR-24 non ne prevede).
- **API**: `POST /api/v1/ppr-requests/[id]/complete` (body `{ landingFeeCents: z.number().int().min(0).max(2_147_483_647) }`) e `POST /api/v1/ppr-requests/[id]/cancel` (senza body) — ENTRAMBE con `idempotency: { endpoint: 'ppr-complete' | 'ppr-cancel' }` (TD-2: complete È una POST monetaria). Path NON in `PUBLIC_API_PATHS`. Registry: request/response schemas + 2 path (`security` cookieAuth, `errorResponses(401,403,404,409,422)`) + item schema esteso (pprNumber già c'è da 8.2; aggiungere `landingFeeCents`/`closedAt` nullable) + `registry.test.ts`.
- **Registro filtrabile (AC 2)**: estendere `listPprRequestsQuerySchema` con `from`/`to` (`z.iso.date().optional()`, periodo su **ETA** — il registro è un registro di ARRIVI) e `status: z.enum([...PprStatus, 'ALL']).optional()` — **il default del service resta PENDING** (contratto 8.2: la coda non cambia; `'ALL'` = nessun filtro stato, esplicito). Confini periodo: `eta ∈ [mezzanotte Europe/Rome di from, mezzanotte di to+1)` — riusare gli helper di zona esistenti (`zoned-time.ts`, pattern calendario 7.2); semi-aperto, MAI confronti su stringhe.
- **UI Registro**: nuova route `/dashboard/ppr/register` (`page.tsx` + `ppr-register.tsx` client), linkata dall'header della pagina coda (e link di ritorno). Filtri = pattern `flights-manager.tsx` FilterBar (select stato con opzione "Tutti", date from/to, applicazione live, "Azzera filtri", searchParams sanitizzati lato server — clamp `?page`/date regex/whitelist stato, lezione F1 7.2). Colonne: numero PPR (— se assente), richiedente, marche, ETA (data+ora Europe/Rome), stato (badge), tassa (`formatCents` se `landingFeeCents` non-null, — altrimenti). **Azioni di chiusura sulle righe APPROVED del registro**: "Completa" apre pannello inline di conferma (shape `ReverseForm` di cash-register: pannello per-riga, `key`-remount, conferma esplicita, `useIdempotencyKey`) con input tassa in euro PREFILLATO dal default admin (fetch del default al mount del pannello; modificabile; 0 ammesso); "Annulla PPR" two-step confirm. Feedback inline; riga aggiornata dopo l'azione (`router.refresh()` pattern bookings-list). i18n: estendere `PprQueuePage` o nuovo `PprRegisterPage.*` (scegliere UNO, simmetrico IT/EN). NIENTE export (epic 10). Stile `minimalist-ui` dashboard.
- **La coda 8.2 NON cambia** (mostra PENDING; le azioni approve/reject restano lì). Il widget dashboard NON cambia.

## Tasks / Subtasks

- [ ] Task 1: Schema + migrazione (AC 1/2)
  - [ ] `CashMovement.pprRequestId` non-unique + index + relazioni; `PprRequest.closedAt/closedByUserId/landingFeeCents` + FK/back-relations; migrazione `add_ppr_closure_fee`; `migrate deploy` + `generate`.
- [ ] Task 2: Settings tassa default (AC 1)
  - [ ] `app-settings.service.ts` get/set `ppr.landingFeeCents` (+test: default 0, valore corrotto → 0+warn, gate permessi); API `GET/PUT /api/v1/settings/ppr-landing-fee`; campo euro nella sezione impostazioni di `/dashboard/ppr`.
- [ ] Task 3: Service chiusura (AC 1/2)
  - [ ] Helper lock generalizzato (stato atteso parametrico, call site 8.2 invariati); `completePprRequest` (tx: 404/409 `PPR_NOT_APPROVED` → update COMPLETED+fee → movimento SOLO se fee>0, categoria "PPR" per name LOUD, effectiveDate zona, pprRequestId) + `cancelPprRequest` (CANCELLED, zero movimento).
- [ ] Task 4: Schemi + API + OpenAPI (AC 1/2)
  - [ ] `schemas/ppr.ts`: `completePprRequestSchema`, query estesa `from`/`to`/`status ALL`, item esteso (`landingFeeCents`, `closedAt`); route `[id]/complete` e `[id]/cancel` con idempotency; filtro periodo su eta nel service (`listPprRequests`); registry + test.
- [ ] Task 5: UI Registro (AC 1/2) — skill obbligatorie (karpathy + design-taste-frontend + ui-ux-pro-max)
  - [ ] `/dashboard/ppr/register` con filtri stato/periodo sanitizzati, azioni Completa (pannello fee prefillata modificabile) / Annulla su righe APPROVED, i18n simmetrica, link bidirezionale con la coda.
  - [ ] Verifica interattiva Playwright MCP (completa con fee default e modificata, fee 0, annulla, filtri, mobile 375×812) PRIMA degli e2e.
- [ ] Task 6: Test (AC 1/2)
  - [ ] Unit `ppr.service.test.ts`: complete su APPROVED → COMPLETED con fee stampata e movimento (campi esatti: categoria per name, +amount, effectiveDate zona, pprRequestId, actorUserId); fee 0 → nessuna create; PENDING/COMPLETED/CANCELLED → 409 `PPR_NOT_APPROVED`; assente → 404; categoria PPR mancante/inattiva → tx fallita LOUD e PPR NON completato; cancel → CANCELLED senza movimento né fee; authorize-first; filtro periodo eta semi-aperto (boundary mezzanotte Roma); status ALL vs default PENDING invariato (contratto 8.2).
  - [ ] e2e NUOVO `e2e/ppr-register.spec.ts` (run-unique; richieste via POST pubblica IP finti + approve via API staff — pattern 8.2; valutare `mode: 'serial'` SOLO se emerge la stessa classe di race FIFO documentata in 8.2): admin imposta default tassa via UI; staff completa dal registro con fee prefillata → riga COMPLETED con tassa formattata + movimento in `/dashboard/finance` categoria PPR con importo (pattern assert `cash-register.spec.ts`, isolare per importo/description run-unique); completa con fee 0 (modificata a mano) → NESSUN movimento nuovo (count via API prima/dopo); annulla → CANCELLED senza movimento; complete su PENDING via API → 409 envelope `PPR_NOT_APPROVED`; replay `Idempotency-Key` sul complete → UN SOLO movimento; filtri registro stato/periodo (URL params + righe attese).
- [ ] Task 7: Story file aggiornato (Dev Agent Record, File List, Status: review) + `sprint-status.yaml` → `8-3-ppr-closure-fee: review`, tutto NEL commit di implementazione.

## Dev Notes

- **Perimetro**: SOLO chiusura (complete/cancel), tassa+movimento, default admin, registro filtrabile. NIENTE export (epic 10), NIENTE email, NIENTE storno movimenti PPR (lo storno generico di cash-register già esiste e basta), NIENTE riapertura di PPR chiusi, NIENTE modifica della coda/widget 8.2.
- **AD-2**: tassa in centesimi interi. **AD-3**: il movimento è append-only, correzioni con lo storno esistente. **AD-5**: authorize prima di ogni query. **AD-8**: nuovi code stabili `PPR_NOT_APPROVED`; envelope invariato.
- **Il movimento nella stessa tx della chiusura**: o entrambi o nessuno (un PPR COMPLETED con fee>0 e senza movimento è uno stato corrotto). Il reviewer proverà: complete concorrenti sullo stesso id → 1 solo movimento; replay idempotente → 1 solo movimento.
- **Lezioni review correnti**: F1 8.2 (il replay idempotente è SEMANTICAMENTE identico, non byte-identico — non asserire byte-equality negli e2e sul body del replay); guard fusi in tx (7.3); date-only vs istanti (3.5/7.4): `effectiveDate` è `@db.Date`; clamp dei searchParams (F1 7.2); i18n simmetrica; `.max()` ovunque; run-unique.
- **Skill obbligatorie**: `karpathy-guidelines` (LEGGERLA PRIMA — regola utente), e per la UI `design-taste-frontend` + `ui-ux-pro-max` (query es. `"data table filters status date range"`); coerenza `minimalist-ui`; Playwright MCP interattivo prima degli e2e.
- **Ambiente**: DB fresco all'avvio; Mailpit :8025/:1025; build SEMPRE `env -u NODE_ENV npx next build`; MAI `playwright install`; prima del gate e2e: `curl localhost:3000` DEVE fallire (altrimenti `fuser -k 3000/tcp`). Il DB di sessione si inquina coi run ripetuti: le classi flaky aircraft/bookings documentate in 8.2 NON sono tue regressioni se i file sono fuori dal diff (il reviewer arbitra su DB fresco).
- **Gate**: lint 0 errori (warning benigno noto), typecheck, `npx vitest run` (≥ 1033 + nuovi), build, `npx playwright test` (145 baseline + nuovi).
- Un commit di implementazione (`Story 8.3: <sintesi>`, nessun riferimento AI/modello), NON push. Verificare `git status` (branch `claude/handoff-documentation-yjqssv`) prima del commit.
- **Questa è l'ULTIMA story dell'epic**: dopo la review, la sessione principale farà handoff + PR — nessuna azione extra richiesta al dev.

### Project Structure Notes

- Nuovi: migrazione `add_ppr_closure_fee`, `src/app/api/v1/ppr-requests/[id]/{complete,cancel}/route.ts`, `src/app/api/v1/settings/ppr-landing-fee/route.ts`, `src/app/[locale]/dashboard/ppr/register/{page.tsx,ppr-register.tsx}` (nomi coerenti col progetto), `e2e/ppr-register.spec.ts`.
- Modificati: `prisma/schema.prisma`, `src/server/services/ppr.service.ts`(+test), `src/server/services/app-settings.service.ts`(+test), `src/lib/schemas/ppr.ts`(+test), `src/lib/schemas/registry.ts`(+test), `src/app/[locale]/dashboard/ppr/{page.tsx,ppr-queue.tsx}` (solo link registro + campo settings), `messages/{it,en}.json`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.3]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-24 (importo standard configurabile, deciso 2026-07-04), FR-29, UJ-6]
- [Source: _bmad-output/implementation-artifacts/8-2-ppr-approval-queue.md] — lock helper, ConflictError code, AppSetting service, coda/impostazioni UI
- [Source: src/server/services/cash.service.ts#recordCashMovement ~314, doc ~37-45] — category-by-name nei flussi automatici, fails-loudly
- [Source: prisma/schema.prisma#AccountMovement.flightId ~444-448] — precedente FK non-unique + index
- [Source: src/app/[locale]/dashboard/finance/cash-register.tsx#ReverseForm ~556-628, NewMovementForm ~355-434] — pannello conferma per-riga, parseCents, useIdempotencyKey
- [Source: src/app/[locale]/dashboard/flights/page.tsx + flights-manager.tsx#FilterBar] — filtri stato/periodo sanitizzati
- [Source: src/lib/money.ts#parseCents/formatCents; src/lib/zoned-time.ts#dateOnlyInZone] — conversioni
- [Source: e2e/cash-register.spec.ts] — pattern assert movimenti in finance
- [Source: .claude/skills/karpathy-guidelines/SKILL.md] — regola utente 2026-07-09

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-09: Story file created (Fable 5 main session via bmad-create-story), ready-for-dev.
