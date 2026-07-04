---
baseline_commit: 39b5e85df9a9feedda2fcb25583f090290856589
---

# Story 1.3: Ruoli e permessi applicati nel service layer

Status: review

## Story

As a gestore,
I want che ogni azione sia autorizzata in base ai ruoli dell'utente,
so that nessuno veda o modifichi dati fuori dal proprio perimetro (FR-2).

## Acceptance Criteria

1. **Given** la mappa permessi→ruoli centralizzata in `src/server/auth/rbac.ts`, **When** un service viene invocato da un attore privo del permesso richiesto, **Then** viene sollevato `ForbiddenError` mappato in HTTP 403 (envelope AD-8 `{"error":{"code":"FORBIDDEN",...}}`) sia dalle pagine sia dalle API.
2. **Given** un utente con più ruoli (es. pilota+istruttore), **When** accede, **Then** i suoi permessi sono l'unione dei ruoli e la navigazione della dashboard mostra l'unione delle voci.
3. I test unitari coprono la matrice permessi per almeno: staff che legge tutti, pilota che legge solo sé stesso (403 sull'altrui), unione multi-ruolo.

## Tasks / Subtasks

- [x] Task 1: Errori di dominio (AC: 1)
  - [x] `src/server/services/errors.ts`: gerarchia `DomainError` (`ForbiddenError`, `NotFoundError`, `ValidationError`, `ConflictError`) con `code` stabile SCREAMING_SNAKE — base che la story 1.5 riuserà per l'envelope completo
- [x] Task 2: RBAC centrale (AC: 1, 2)
  - [x] `src/server/auth/rbac.ts`: tipo `Permission` (stringhe union, set iniziale: `people.read`, `people.manage`, `aircraft.manage`, `finance.manage`, `flights.manage`, `bookings.manage.own`, `bookings.manage.any`, `school.manage.own`, `expiries.manage`, `settings.manage`, `users.manage`, `self.read`), mappa `ROLE_PERMISSIONS: Record<Role, Permission[]>` conforme al PRD §4.1 (admin tutto; staff gestione operativa; istruttore propri allievi; pilota/allievo self-service)
  - [x] `authorize(actor, permission)` che lancia `ForbiddenError`; `hasPermission(actor, permission)` puro per la UI; `Actor` = `{ userId, personId, roles }` da `getSessionActor()`
- [x] Task 3: Primo consumo reale (AC: 1, 2)
  - [x] Service `src/server/services/me.service.ts`: `getMe(actor)` (dati utente + persona collegata; permesso `self.read`) — primo service reale che rispetta AD-1/AD-5
  - [x] Endpoint `GET /api/v1/me` (route sottile → service; 401 già gestito dal proxy; DomainError → risposta AD-8 con mapping minimale locale, l'helper completo arriva in 1.5)
  - [x] Dashboard: navigazione per ruolo (voci placeholder: Persone/Velivoli/Voli/Prenotazioni/Finanze/Scuola/Scadenze/PPR/Impostazioni filtrate con `hasPermission`; per un multi-ruolo si vede l'unione) — skill `minimalist-ui`, stringhe nei cataloghi IT/EN
- [x] Task 4: Test (AC: 3)
  - [x] Unit sulla matrice: admin ha tutto; staff non ha `users.manage` né `settings.manage`(solo admin); pilota ha `self.read`+`bookings.manage.own` ma non `people.read`; unione pilota+istruttore; `authorize` lancia `ForbiddenError`
  - [x] e2e: `GET /api/v1/me` con sessione → 200 con i propri dati; dashboard mostra voci diverse per admin vs (se seedato) utente pilota di test

## Dev Notes

- **AD-5 vincolante**: la sicurezza sta nel service layer — ogni futuro service riceverà `Actor` e chiamerà `authorize()`. La UI usa `hasPermission` SOLO per nascondere la navigazione.
- La mappa permessi iniziale copre gli epic futuri: tienila piatta e semplice, niente framework RBAC esterni, niente permessi su risorsa (il filtro "own" si implementa nei service con `actor.personId`).
- Seed: aggiungi al seed un utente di test `pilot@airmanager.local` (ruolo PILOT, password da `SEED_ADMIN_PASSWORD`) con Person collegata — serve per i test della matrice e per gli e2e; idempotente.
- Pattern esistenti da seguire: `getSessionActor()` in `src/server/auth/session.ts` (estendi se serve per esporre `Actor`), envelope AD-8 già usato nel proxy, struttura route `src/app/api/v1/health` come riferimento.
- **Gate**: lint, typecheck, test, build, test:e2e verdi.

### Project Structure Notes

- Nuovi file: `src/server/services/errors.ts`, `src/server/auth/rbac.ts`, `src/server/services/me.service.ts`, `src/app/api/v1/me/route.ts`; dashboard aggiornata in `src/app/[locale]/dashboard/`.
- Non toccare `_bmad/`, `.claude/`, `docs/`; in `_bmad-output/` solo questo file e `sprint-status.yaml`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#4.1] — perimetri dei ruoli
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-5, #AD-8, Consistency Conventions]
- [Source: _bmad-output/implementation-artifacts/1-2-login.md#Dev Agent Record] — pattern auth/session esistenti

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 via BMAD dev-story

### Debug Log References

- `npm run lint` (ESLint) — pass (0 errors, 0 warnings; one transient warning for an unused `ROLE_PERMISSIONS` import in a test was fixed before the final run)
- `npm run typecheck` (`tsc --noEmit`) — pass (one issue found+fixed: Prisma's overloaded `findUnique` type made `mockResolvedValue`'s literal test fixtures ambiguous in `me.service.test.ts`; narrowed via a local `MeSelectResult` type instead of `any`)
- `npm run test` (Vitest) — 57/57 passed (44 pre-existing + 13 new: `rbac.test.ts` 6, `me.service.test.ts` 3, `nav-items.test.ts` 4)
- `npm run build` (`next build`) — pass; new route `/api/v1/me` present alongside the existing routes
- `npm run test:e2e` (Playwright, Chromium at `/opt/pw-browsers/chromium`) — 14/14 passed (`e2e/rbac.spec.ts` 3 new + `e2e/login.spec.ts` 7 + `e2e/welcome.spec.ts` 4 pre-existing), run twice consecutively to confirm no flakiness
- `npx prisma migrate deploy` — no pending migrations (this story adds no Prisma models); `npx prisma db seed` run twice to confirm the new pilot user upsert is idempotent

### Completion Notes List

- **Domain errors (Task 1)**: `src/server/services/errors.ts` adds an abstract `DomainError` base (`name` set via `new.target.name`) with four concrete subclasses (`ForbiddenError` → `FORBIDDEN`, `NotFoundError` → `NOT_FOUND`, `ValidationError` → `VALIDATION_ERROR` with optional `details`, `ConflictError` → `CONFLICT`). No HTTP mapping lives here by design — only `GET /api/v1/me` maps them, locally, since the shared helper is story 1.5's job.
- **RBAC (Task 2)**: `src/server/auth/rbac.ts` defines the flat `Permission` union exactly as enumerated in this story, `ROLE_PERMISSIONS: Record<Role, Permission[]>`, pure `hasPermission()`, union-aware `getPermissions()`, and `authorize()` (throws `ForbiddenError`). `Actor` is `Pick<SessionActor, 'userId' | 'personId' | 'roles'>`, importing `SessionActor` from `./session.ts` directly — so the RBAC "actor" concept and `getSessionActor()`'s return type can never drift apart. Role → permission assignment follows PRD §4.1: ADMIN gets every permission; STAFF gets operational + finance permissions but explicitly not `users.manage`/`settings.manage` (admin-only per FR-3); INSTRUCTOR gets `self.read` + `bookings.manage.own` + `school.manage.own` (FR-2 "propri allievi"); PILOT/STUDENT get `self.read` + `bookings.manage.own` only. Resource-level "own" filtering (e.g. "is this booking actually this pilot's?") is deliberately NOT encoded here — it stays inside each future service via `actor.personId`, per the Dev Notes and AD-5.
- **First real service (Task 3)**: `src/server/services/me.service.ts#getMe(actor)` calls `authorize(actor, 'self.read')` (granted to every role, so this never actually rejects a logged-in user — the call exists to establish the pattern from the very first service, per AD-1/AD-5) then reads the user + linked person via Prisma, throwing `NotFoundError` if the session's `userId` no longer resolves (defensive: token could outlive a deleted user). `GET /api/v1/me` (`src/app/api/v1/me/route.ts`) is a thin route: re-checks the session (defense in depth — the proxy already 401s unauthenticated `/api/v1/*` requests), calls the service, and maps any thrown `DomainError` to the AD-8 envelope with a small local `statusForDomainError()` switch (403/404/422/409) — intentionally not a shared helper, per the Dev Notes.
- **Dashboard navigation (Task 3)**: extracted to `src/app/[locale]/dashboard/nav-items.ts` (`NAV_ITEMS` + `visibleNavItems(actor)`) rather than inlined in the page component, so the union-filtering logic is independently unit-testable (`nav-items.test.ts`). Nine placeholder items (Persone/Velivoli/Voli/Prenotazioni/Finanze/Scuola/Scadenze/PPR/Impostazioni) map to the permissions defined in `rbac.ts`; `bookings` is visible if the actor has *either* `bookings.manage.own` *or* `bookings.manage.any` (so both a bare pilot and staff/admin see it). Rendered as a `<nav aria-label>` of bordered tiles (minimalist-ui: `#EAEAEA` borders, `8px` radius, warm off-white hover) below the existing welcome/logout header on the dashboard page.
- **Deviation — PPR nav item has no dedicated permission**: the Permission union fixed by this story (Task 2) does not include a PPR-specific permission, since the PPR domain itself doesn't exist until epic 8. The `ppr` nav placeholder is gated on `bookings.manage.any` as the closest existing proxy for "staff/admin operational work" (documented inline in `nav-items.ts`). Flagged for the reviewer; expected to be replaced by a dedicated `ppr.manage` permission when epic 8 lands.
- **Seed (Task 3 Dev Note)**: `prisma/seed.ts` refactored so `hashPassword()` runs once and both `seedAdminUser()` and the new `seedPilotUser()` reuse the hash; added `pilot@airmanager.local` (role `PILOT`, same `SEED_ADMIN_PASSWORD`, linked `Person` "Piero Volante"), upserted idempotently exactly like the admin. Verified idempotent by running `prisma db seed` twice in a row.
- **Tests (Task 4)**: `src/server/auth/rbac.test.ts` covers the exact matrix requested — admin has every one of the 12 catalogue permissions; staff has the operational set but `hasPermission`/`authorize` both reject `users.manage` and `settings.manage`; pilot has `self.read`+`bookings.manage.own` but not `people.read`; a pilot+instructor actor gets the *union* (`self.read`, `bookings.manage.own`, `school.manage.own`), verified both via `hasPermission` and `getPermissions()`; `authorize()` throws `ForbiddenError` (asserted by type, not just "any error") and does not throw when the permission is present. `me.service.test.ts` mocks `prisma.user.findUnique` (same pattern as `authorize.test.ts` from story 1.2) to cover the happy path, a user with no linked person, and the `NotFoundError` path. `e2e/rbac.spec.ts` adds the three e2e scenarios required: `GET /api/v1/me` returns 200 with the caller's own data, admin's dashboard nav shows every area, and the seeded pilot's dashboard nav shows only self-service areas (`Prenotazioni`) with `Persone`/`Impostazioni`/`Finanze` asserted absent (`toHaveCount(0)`, not just hidden).
- **No new Prisma migration**: this story adds no schema changes — `Role` and the `User`/`Person` models already existed from story 1.2. Confirmed `prisma migrate deploy` reports "No pending migrations to apply."

### File List

- `src/server/services/errors.ts` — new (`DomainError` hierarchy: `ForbiddenError`, `NotFoundError`, `ValidationError`, `ConflictError`)
- `src/server/auth/rbac.ts` — new (`Permission`, `ROLE_PERMISSIONS`, `Actor`, `hasPermission`, `getPermissions`, `authorize`)
- `src/server/auth/rbac.test.ts` — new (permission matrix unit tests)
- `src/server/services/me.service.ts` — new (`getMe(actor)`, first real service)
- `src/server/services/me.service.test.ts` — new (unit tests, mocked Prisma)
- `src/app/api/v1/me/route.ts` — new (`GET /api/v1/me`, thin route + local `DomainError` → AD-8 mapping)
- `src/app/[locale]/dashboard/nav-items.ts` — new (`NAV_ITEMS`, `visibleNavItems(actor)`)
- `src/app/[locale]/dashboard/nav-items.test.ts` — new (union-filtering unit tests)
- `src/app/[locale]/dashboard/page.tsx` — modified (renders the role-filtered navigation)
- `prisma/seed.ts` — modified (adds idempotent `pilot@airmanager.local` PILOT test user; refactored to hash the password once)
- `messages/it.json`, `messages/en.json` — modified (`DashboardPage.navHeading` + `DashboardPage.nav.*` strings)
- `e2e/rbac.spec.ts` — new (3 e2e tests: `/api/v1/me` 200, admin nav, pilot nav)
- `src/server/auth/README.md` — modified (documents `rbac.ts`)
- `src/server/services/README.md` — modified (documents `errors.ts` and `me.service.ts`)
