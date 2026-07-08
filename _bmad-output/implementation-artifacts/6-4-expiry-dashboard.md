---
baseline_commit: 966e64a
---

# Story 6.4: Dashboard scadenze

Status: ready-for-dev

## Story

As a gestore,
I want vedere tutte le scadenze ordinate per urgenza,
so that intervenga prima che diventino un problema (FR-38).

## Acceptance Criteria

1. **Given** scadenze in stati diversi, **When** apro la dashboard scadenze (staff), **Then** vedo l'elenco ordinato per prossimità con badge colore (verde >60gg, giallo ≤60gg, rosso scaduto) e filtri per tipo/ambito/stato.
2. **And** ogni pilota/allievo vede le proprie scadenze con gli stessi colori nella propria home.

## Contesto e decisioni di design (vincolanti)

- **NESSUNA migrazione**: story di sola lettura/presentazione — un metodo service nuovo, un GET nuovo, due superfici UI. L'export è **Epic 10** (mappa FR: "export in Epic 10") — NON aggiungerlo.
- **Il filtro stato si traduce in range di date in SQL**, mai post-filtering in JS: con `today = todayDateOnlyUtc()` e `W = EXPIRY_WARNING_DAYS` (60), `expired` = `expiresAt < today`; `expiring` = `today <= expiresAt <= today+W`; `ok` = `expiresAt > today+W`. Il `status` per-riga nel DTO resta comunque calcolato con `computeExpiryStatus` (stessa fonte di verità di 6.2 — i due DEVONO combaciare: unit test che lo prova sui boundary). Il `total` della paginazione rispetta i filtri.
- **Ordine = urgenza = `expiresAt asc`** (le scadute vengono prime per costruzione), tie-break `id asc` per stabilità di paginazione.
- **Badge stato: UN componente condiviso, basta duplicazioni**: 6.2 ha già il markup badge in `expiries-panel.tsx` E `my-expiries.tsx`; 6.4 aggiunge due superfici. ESTRARRE `ExpiryStatusBadge` (client, `src/app/[locale]/dashboard/expiries/expiry-status-badge.tsx`) con la palette esistente (`ok` verde `#EDF3EC`/`#346538`, `expiring` giallo `#FBF3DB`/`#956400`, `expired` rosso `#FDEBEC`/`#9F2F2D`, label localizzate passate da fuori) e usarlo in TUTTI e quattro i punti (refactor dei due esistenti incluso — a parità di resa visiva, gli e2e esistenti non devono cambiare).
- **La dashboard staff VA nella landing `/dashboard/expiries`** (la 6.1/6.2 l'avevano annunciato): sezione "Tutte le scadenze" SOPRA la coda proposte — filtri (tipo, ambito, stato) + tabella + paginazione, tutto URL-driven server-side (pattern `finance/page.tsx`: searchParams sanitizzati, `Link` per pagina/filtri). Coda proposte e link "Tipi di scadenza" RESTANO come sono.
- **"Home" del pilota/allievo = `/dashboard`** (`dashboard/page.tsx`): sezione "Le mie scadenze" per gli actor `self.read` con `personId` e SENZA `expiries.manage` (stessa asimmetria deliberata dei tile "La mia scheda"/"Il mio conto": lo staff ha la dashboard, non il widget). Lista compatta (tipo, data scadenza, `ExpiryStatusBadge`) via `listPersonExpiries` — riuso puro, NIENTE nuovo service per la home; sezione visibile SOLO se la persona ha ≥1 scadenza (una home pulita per chi non ne ha) + link a `/dashboard/expiries`.
- **Permessi invariati**: dashboard staff = `expiries.manage`; home widget = `self.read` + `personId` (il service own-access di 6.2 fa già il guard). NESSUN cambio a `rbac.ts`.

## Tasks / Subtasks

- [ ] Task 1: Service (AC 1)
  - [ ] In `expiries.service.ts`: `listAllExpiries(actor, { expiryTypeId?, scope?, status?, page?, pageSize? })` — `authorize(actor, 'expiries.manage')`; filtri combinabili in AND (pattern `listFlights` 5.4): `expiryTypeId` (id esatto; inesistente → lista vuota, NON 404 — è un filtro), `scope` = scope del TIPO (join `expiryType.scope`), `status` → range di date (vedi Contesto); ordinamento `expiresAt asc, id asc`; paginazione `{ items, total }` (pattern `listCashMovements`), `pageSize` default 20 max 100. DTO `ExpiryDashboardItem`: `id`, `personId`, `personFirstName`, `personLastName`, `expiryTypeId`, `typeName`, `typeScope`, `issuedAt`, `expiresAt`, `notes`, `status` (via `computeExpiryStatus`).
  - [ ] Doc-comment sul metodo: mapping stato→range e perché il post-check `computeExpiryStatus` combacia per costruzione (stesso `today`, stesso W).
- [ ] Task 2: API + OpenAPI (AC 1)
  - [ ] `GET /api/v1/expiries` (la route esiste con solo POST: aggiungere il GET) — query schema in `src/lib/schemas/expiries.ts`: `expiryTypeId?` string, `scope?` = `expiryScopeSchema`, `status?` = `z.enum(['ok','expiring','expired'])`, `page`/`pageSize` come gli altri list. Response = lista paginata di `expiryDashboardItemSchema`. Registry (tag `Expiries`, errorResponses `401,403,422`) + `registry.test.ts` coverage.
- [ ] Task 3: UI dashboard staff (AC 1) — stile `minimalist-ui`, skill obbligatorie
  - [ ] `/dashboard/expiries/page.tsx`: nuova sezione "Tutte le scadenze" in testa (sopra la coda proposte), SOLO per `expiries.manage`: barra filtri server-driven (3 select: tipo — tutti i tipi `includeInactive` per lo storico, ambito — 4 valori localizzati, stato — 3 valori localizzati; bottone/link reset; submit GET, pattern filtri `finance` o `flights`), tabella (persona → `Link` alla scheda `/dashboard/people/{id}`, tipo, ambito, rilascio, scadenza, `ExpiryStatusBadge`; date locale-aware come le esistenti), empty state, paginazione `Link` ?page= che PRESERVA i filtri (pattern `pageHref` di finance). La faccia own-access ("Le mie scadenze" di 6.2) resta INVARIATA.
  - [ ] Estrazione `ExpiryStatusBadge` + refactor dei due usi esistenti (vedi Contesto — resa visiva identica).
- [ ] Task 4: UI home (AC 2)
  - [ ] `dashboard/page.tsx`: sezione "Le mie scadenze" (vedi Contesto: solo self-service con `personId` e ≥1 scadenza; `listPersonExpiries` direttamente dal server component; lista compatta con `ExpiryStatusBadge` + link "Tutte le mie scadenze" → `/dashboard/expiries`). Il layout della home resta centrato/compatto — la sezione si accoda sotto la nav senza stravolgere la pagina.
  - [ ] i18n `messages/{it,en}.json` simmetrici: `ExpiriesPage.dashboard.*` (filtri, tabella, empty, paginazione), `DashboardPage.myExpiries.*` (heading, link), label già esistenti riusate dove possibile (ambiti, stati).
- [ ] Task 5: Test (AC 1/2)
  - [ ] Unit (`expiries.service.test.ts`): permessi (staff ok, pilota → Forbidden); mapping stato→range (per ciascuno dei 3 stati: il `where` generato contiene il range giusto vs `todayDateOnlyUtc`; boundary: una expiry a today+60 è `expiring` sia nel filtro sia in `computeExpiryStatus`, a today+61 è `ok` — coerenza filtro/badge); filtri combinati in AND; `expiryTypeId` inesistente → lista vuota; ordinamento e paginazione (skip/take giusti, `total` filtrato); schema query: `status` fuori enum → 422, `pageSize` oltre max → 422.
  - [ ] e2e `expiry-dashboard.spec.ts` (tutto run-unique: tipo dedicato + persone dedicate; filtrare SEMPRE per il tipo run-unique per l'isolamento su DB sporco): staff crea 3 scadenze (ok: +120gg; expiring: +30gg; expired: −10gg) su persone run-unique → apre `/dashboard/expiries`, filtra per tipo run-unique → 3 righe ORDINATE (expired, expiring, ok) coi badge giusti (rosso/giallo/verde); filtro stato=expired (+tipo) → solo la riga rossa; filtro ambito → coerente; link persona → scheda; **AC 2**: scadenza run-unique creata per il PILOTA SEED → login pilota → la home `/dashboard` mostra "Le mie scadenze" con la riga e il badge; l'admin sulla home NON vede la sezione; `GET /api/v1/expiries` da pilota → 403 envelope.
- [ ] Task 6: verifica interattiva Playwright MCP (admin/staff: filtri, paginazione con >20 righe se pratico, badge; pilota: home widget) PRIMA degli e2e.

## Dev Notes

- **Perimetro**: niente export (Epic 10), niente blocco prenotazioni (7.4), niente nuovi permessi/modelli/migrazioni. La coda proposte e "Le mie scadenze" (6.2) NON si toccano se non per il refactor del badge (resa identica).
- **Date**: `todayDateOnlyUtc()` UNA volta per request e passato ovunque (filtro e status devono usare lo STESSO oggi); binding `@db.Date` via `parseDateOnlyUtc`/aritmetica UTC (mai `new Date(string)`); il client NON ricalcola mai lo status (riceve la stringa dal server — lezione 6.2).
- **Lezioni review**: sanitizzazione searchParams a pagina (pattern `sanitizeDateParam`/enum-check di finance — un param inventato a mano non deve raggiungere il service malformato; il service ha comunque Zod al boundary API); clamp della pagina fuori range (pattern 3.2 F1, vedi finance `lastPage`); i18n simmetrica contata; enum mai raw in UI; overflow tabella in container; paginazione che preserva i filtri.
- **Riuso**: `listPersonExpiries`/`computeExpiryStatus`/`EXPIRY_WARNING_DAYS` (6.2/6.3); pattern filtri+paginazione URL da `finance/page.tsx` (e `flights/page.tsx` per i filtri multipli); palette badge ESISTENTE (vedi Contesto). NIENTE nuove librerie.
- **Skill UI obbligatorie (regola utente)**: `design-taste-frontend` E `ui-ux-pro-max` (query: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`); coerenza `minimalist-ui`; Playwright MCP per la verifica interattiva (Task 6).
- **Ambiente**: DB resettato a inizio story; Mailpit su (serve solo alla suite completa). PRIMA di ogni run e2e di gate: verificare che NON ci sia un dev server residuo su :3000 (`curl` deve fallire; ammazzarlo se c'è — lezione 6.3). Build SEMPRE `env -u NODE_ENV npx next build`. MAI `playwright install`. Flaky e2e: classe nota (flight specs + people-management sotto carico) — DB fresco, re-run in isolamento per le spec estranee.
- **Gate**: lint (warning noto), typecheck, `npx vitest run` (≥ 734 + nuovi), build, `npx playwright test` (≥ 105 + nuovi) su DB fresco.
- Un commit di implementazione (`Story 6.4: <sintesi>`, nessun riferimento AI/modello), story file aggiornato (Dev Agent Record, Status: review) e `sprint-status.yaml` → `6-4-expiry-dashboard: review` inclusi. NON push. `git status` prima del commit (branch `claude/handoff-documentation-85b39b`, non detached).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.4]
- [Source: _bmad-output/implementation-artifacts/6-2-expiry-registration.md] — `listPersonExpiries`, palette badge, faccia own della landing
- [Source: src/app/[locale]/dashboard/finance/page.tsx] — pattern filtri/paginazione URL-driven + clamp pagina
- [Source: src/app/[locale]/dashboard/flights/page.tsx] — pattern filtri multipli combinabili (5.4)
- [Source: src/lib/expiry-status.ts] — `computeExpiryStatus`, `EXPIRY_WARNING_DAYS`, aritmetica UTC condivisa
- [Source: src/app/[locale]/dashboard/page.tsx] — home e asimmetria deliberata dei tile self-service

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Review Record

## Change Log

- 2026-07-08: Story file created (Fable 5 main session), ready-for-dev.
