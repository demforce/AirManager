---
baseline_commit: 069a5975f2665154ead12d1a415fb45fcddb0cce
---

# Story 2.3: Scheda dettaglio persona

Status: review

## Story

As a staff,
I want una scheda persona con tutto il quadro,
so that trovi profili, contatti e storico in un colpo d'occhio (FR-6).

## Acceptance Criteria

1. **Given** una persona con profili attivi, **When** apro la sua scheda, **Then** vedo sezioni per: dati anagrafici, profili, e segnaposto pronti per scadenze/saldo/pacchetti/voli/prenotazioni che si popoleranno negli epic successivi senza cambiare struttura.
2. **And** un pilota autenticato vede la propria scheda in sola lettura; 403 su schede altrui.

## Tasks / Subtasks

- [x] Task 1: Accesso "own" nel service (AC: 2)
  - [x] `getPerson` (people.service.ts): consentire la lettura anche a un actor **senza** `people.read` ma con `self.read` e `actor.personId === personId` richiesto — è esattamente lo scoping "own" documentato nel module doc di `rbac.ts` (il check `personId` vive nel service, MAI in `authorize()`); ogni altro caso resta `ForbiddenError` (403 envelope AD-8). NON toccare `listPeople` né le scritture: restano `people.read`/`people.manage` puri
  - [x] Nessuna migrazione: la story non aggiunge modelli
- [x] Task 2: Pagina scheda (AC: 1, 2)
  - [x] `/{locale}/dashboard/people/[id]`: server page (pattern `people/page.tsx`: sessione → redirect se non autorizzato, poi il service ri-autorizza comunque — AD-5 defense in depth; chi può aprirla: `people.read` oppure own con `self.read`)
  - [x] Sezioni: **Dati anagrafici** (nome, email, telefono, indirizzo, CF, badge archiviata), **Profili** (riusare `profiles-panel.tsx` — con `people.manage` interattivo, altrimenti sola lettura: vedi Task 3), e segnaposto strutturali per **Scadenze**, **Saldo conto**, **Pacchetti ore**, **Ultimi voli**, **Prossime prenotazioni** — card vuote con titolo tradotto e testo "disponibile prossimamente"-style, pensate perché gli epic 3-7 le riempiano senza ristrutturare la pagina
  - [x] Collegamenti: nell'elenco persone il nome diventa link alla scheda; per gli utenti self-service (`self.read` con `personId`, senza `people.read`) aggiungere accesso alla PROPRIA scheda (voce nav o card in dashboard — scegliere il punto più coerente con `nav-items.ts` esistente e documentare)
  - [x] Stile skill `minimalist-ui`; stringhe in `messages/{it,en}.json` simmetriche
- [x] Task 3: Profili in sola lettura (AC: 2)
  - [x] `profiles-panel.tsx` accetta una modalità read-only (prop, derivata server-side da `hasPermission(actor,'people.manage')`): niente form/bottoni attiva/disattiva, solo i dati — la UI nasconde, il service resta il guardiano (AD-5: le mutazioni profili sono già `people.manage`)
- [x] Task 4: Test (AC: tutte)
  - [x] Unit service `getPerson`: staff → qualunque persona; pilota con `personId` proprio → ok; pilota su persona altrui → `ForbiddenError`; pilota con `personId: null` → `ForbiddenError`; actor senza `self.read` né `people.read` → `ForbiddenError`
  - [x] e2e: staff apre la scheda dall'elenco → vede anagrafica + profili + i 5 segnaposto; pilota (seed `pilot@airmanager.local`) apre la propria scheda → dati visibili, NESSUN controllo di modifica profili; pilota su scheda altrui → 403/redirect; `GET /api/v1/people/{own id}` da pilota → 200, su id altrui → 403 envelope

## Dev Notes

- **Pattern consolidati**: server page + client manager come `people/page.tsx`/`people-manager.tsx`; `profiles-panel.tsx` esiste già (2.2) e va riusato, non duplicato; `getSessionActor()` per l'actor; `hasPermission()` per decidere cosa rendere (mai unico guardiano).
- **`self.read` esiste già** (1.3) per PILOT/STUDENT/INSTRUCTOR/STAFF/ADMIN — NON aggiungere permessi nuovi; il seed `pilot@airmanager.local` ha già Person collegata e PilotProfile attivo (2.2), perfetto per gli e2e.
- **`GET /api/v1/people/[id]`** già ritorna `PersonDetail` con i profili (2.2): l'unica modifica API è la regola di autorizzazione own in `getPerson`; aggiornare la descrizione del path nel registry OpenAPI se cita solo `people.read`.
- La scheda è READ-heavy: nessuna nuova mutazione in questa story. Le azioni di modifica anagrafica restano nell'elenco (2.1); non duplicarle nella scheda.
- I segnaposto NON sono feature flag: sono sezioni statiche tradotte (IT/EN) con struttura (heading + card) stabile — gli epic successivi sostituiranno il contenuto, non il layout (AC 1).
- Persona inesistente → `NotFoundError` → 404 (pagina: `notFound()` di Next).
- Nessuna dipendenza npm nuova prevista; se servisse, `npm view` prima del pin.
- Ambiente: PostgreSQL su, Mailpit su 1025/8025 (riavviare se container nuovo: `service postgresql start`; `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 &`); MAI `playwright install`.
- **Gate**: lint (1 warning benigno noto su data-table.tsx), typecheck, Vitest (175+ attesi), `next build`, e2e Playwright (36+ attesi) tutti verdi prima del commit.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-5, #AD-8]
- [Source: src/server/auth/rbac.ts] — module doc sullo scoping own (self.read + actor.personId nel service)
- [Source: _bmad-output/implementation-artifacts/2-2-person-profiles.md#Dev Agent Record] — profiles-panel, PersonDetail, pattern

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 via BMAD dev-story

### Debug Log References

- `npx vitest run src/server/services/people.service.test.ts` → 44 passed (own-access tests included) before running the full suite.
- `npx tsc --noEmit` → clean.
- `npm run lint` → 0 errors, 1 pre-existing benign warning (`data-table.tsx`, `react-hooks/incompatible-library`).
- `npx vitest run` → 179 passed (175 pre-existing + 4 new `getPerson` own-access unit tests).
- `npm run build` → succeeded; `/[locale]/dashboard/people/[id]` listed among the dynamic routes.
- `npx playwright test e2e/person-detail.spec.ts` → 4/4 passed in isolation.
- `npx playwright test` (full suite) → 40 passed (36 pre-existing + 4 new).

### Completion Notes List

- **Task 1**: `getPerson` now branches on `hasPermission(actor, 'people.read')`; when absent it calls `authorize(actor, 'self.read')` (still throws `ForbiddenError` for an actor with neither permission, e.g. a stale-role actor with `roles: []`) and then compares `actor.personId === id`, throwing `ForbiddenError` on any mismatch — including `personId: null`. The `personId` comparison lives only in the service, never in `authorize()`, per `rbac.ts`'s module doc. `listPeople` and every write (`createPerson`/`updatePerson`/`archivePerson`/`unarchivePerson`/`upsertProfile`/`deactivateProfile`) are untouched. Also updated the `GET /api/v1/people/{id}` OpenAPI registry description to mention the own-access rule.
- **Task 2**: New server page `src/app/[locale]/dashboard/people/[id]/page.tsx`, following the `people/page.tsx` pattern (session → redirect if unauthorized, then `getPerson` re-authorizes — AD-5 defense in depth). Access: `people.read` (any person) or own access (`self.read` + matching `personId`). A `NotFoundError` from the service is mapped to Next's `notFound()`. Sections: anagrafica (dl of firstName/lastName/email/phone/address/fiscalCode with a `—` placeholder for empty values, plus an "Archiviata" badge when `archivedAt` is set), the reused `ProfilesPanel` (see Task 3), and 5 structural placeholder cards (Scadenze, Saldo conto, Pacchetti ore, Ultimi voli, Prossime prenotazioni) with a stable "disponibile prossimamente" style body — future epics fill these without touching the layout. The person list's name column (`people-manager.tsx`) is now a `Link` to the scheda. For self-service actors without `people.read`, the dashboard page (`dashboard/page.tsx`, which already loads `me` via `getMe`) gains a "La mia scheda"/"My profile" tile linking to `/dashboard/people/{me.person.id}` — chosen over a permanent `nav-items.ts` entry because that list is a static, non-parameterized permission→href map and can't express "the caller's own id"; staff/admin don't get this tile since they already reach any scheda through the People list. Documented inline in `dashboard/page.tsx`.
- **Task 3**: `ProfilesPanel` gained an optional `readOnly` prop (default `false`, unused by the existing interactive call site in `people-manager.tsx`) plus made `onClose`/`onChanged` optional (the embedded read-only usage has neither a "close" affordance nor mutations to react to). Each of the three sections (Pilot/Student/Instructor) now renders a plain data line (or nothing, if never activated) instead of the edit/activate/deactivate controls when `readOnly` is true; all hooks stay unconditional (only the JSX branches), so there's no Rules-of-Hooks concern. The service remains the actual guardian — profile writes still `authorize(actor, 'people.manage')` regardless of what the UI shows (AD-5).
- **Task 4**: 4 new unit tests in `people.service.test.ts` covering the own-access matrix from the story (own ok, other person forbidden, `personId: null` forbidden, no role at all forbidden). New e2e file `e2e/person-detail.spec.ts` (4 tests): staff opens a scheda from the list and sees anagrafica + profiles (interactive) + the 5 placeholders; a pilot opens their own scheda via the dashboard tile and sees read-only profile data with no edit/deactivate buttons; a pilot is redirected away from someone else's scheda; `GET /api/v1/people/{id}` returns 200 for the pilot's own id and a 403 AD-8 envelope for another id.
- No new npm dependencies. No schema/migration changes (as expected by the story).

### File List

- `src/server/services/people.service.ts` (modified — `getPerson` own-access scoping)
- `src/server/services/people.service.test.ts` (modified — own-access unit tests)
- `src/lib/schemas/registry.ts` (modified — `GET /people/{id}` description)
- `src/app/[locale]/dashboard/people/[id]/page.tsx` (new — scheda persona page)
- `src/app/[locale]/dashboard/people/people-manager.tsx` (modified — name column links to the scheda)
- `src/app/[locale]/dashboard/people/profiles-panel.tsx` (modified — `readOnly` mode, optional `onClose`/`onChanged`)
- `src/app/[locale]/dashboard/page.tsx` (modified — "own scheda" tile for self-service actors)
- `messages/it.json` (modified — `PersonDetailPage` namespace, `DashboardPage.myProfile`)
- `messages/en.json` (modified — `PersonDetailPage` namespace, `DashboardPage.myProfile`)
- `e2e/person-detail.spec.ts` (new — e2e coverage for AC 1/2)

## Change Log

- 2026-07-05: Story 2.3 implemented — own-access scoping in `getPerson`, the person detail page with anagrafica/profiles/5 placeholders, read-only `ProfilesPanel` mode, own-scheda dashboard link, and unit/e2e coverage. Status → review.
