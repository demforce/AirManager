# Story 2.1: CRUD persone con archiviazione

Status: review

## Story

As a staff,
I want creare, modificare e archiviare le persone,
so that l'anagrafica sia unica e senza duplicati (FR-4).

## Acceptance Criteria

1. **Given** il permesso staff (`people.manage`), **When** creo una Persona con nome, cognome, email, telefono, indirizzo, codice fiscale opzionale, **Then** la persona appare nell'elenco paginato e ricercabile (nome/cognome/email).
2. **Given** una persona con dati collegati (utente, e in futuro voli/movimenti), **When** la archivio, **Then** non è proposta nelle nuove operazioni ma resta consultabile con tutto lo storico; **And** non esiste alcuna API di cancellazione fisica.
3. **Given** un `pilota` (senza `people.read`), **When** chiama `GET /api/v1/people`, **Then** riceve 403 con envelope AD-8.

## Tasks / Subtasks

- [x] Task 1: Modello e migrazione (AC: 1, 2)
  - [x] Estendere `Person` esistente: `email` (già esiste, unique opzionale), aggiungere `phone?`, `address?`, `fiscalCode?` (unique opzionale), `archivedAt DateTime?`; migrazione
- [x] Task 2: Service + API (AC: tutte)
  - [x] `people.service.ts`: `listPeople` (paginato con helper 1.5, ricerca `q` su nome/cognome/email case-insensitive, filtro `includeArchived` default false), `getPerson`, `createPerson`, `updatePerson`, `archivePerson`/`unarchivePerson` — lettura con `people.read`, scritture con `people.manage`; email/fiscalCode duplicati → `ConflictError` (+ mapping P2002 come in users.service)
  - [x] Route sottili con `apiRoute()`: `GET/POST /api/v1/people`, `GET/PATCH /api/v1/people/[id]`, `POST /api/v1/people/[id]/archive` e `/unarchive`; schemi Zod in `src/lib/schemas/people.ts` (import da `zod-with-openapi`!) registrati nel registry OpenAPI con paths
- [x] Task 3: UI elenco + form (AC: 1, 2)
  - [x] `/{locale}/dashboard/people`: **TanStack Table** (`@tanstack/react-table` 8.21.x — prima adozione: crea un componente tabella riusabile `src/components/data-table.tsx` che le prossime stories riuseranno) con colonne nome, email, telefono, stato (attiva/archiviata), ricerca server-side, paginazione; voce nav "Persone" già esistente
  - [x] Form crea/modifica (react-hook-form + zodResolver come in users) + azioni archivia/ripristina con conferma; badge "archiviata"; filtro per includere le archiviate
  - [x] Stile skill `minimalist-ui`; stringhe in `messages/{it,en}.json`
- [x] Task 4: Test (AC: tutte)
  - [x] Unit service: ricerca, filtro archiviate, conflitti email/CF, permessi (pilota → ForbiddenError su list/create)
  - [x] e2e: staff crea persona → appare in elenco; ricerca; archivia → sparisce dall'elenco default, appare con filtro; pilota su /dashboard/people → redirect/403; `GET /api/v1/people` da pilota → 403 envelope

## Dev Notes

- **Pattern consolidati da seguire** (non reinventare): `users.service.ts` (authorize, paginate, P2002→Conflict, toListItem), `apiRoute()` wrapper (1.5), registry OpenAPI (`registerPath` + component schemas con `z` da `zod-with-openapi` — regola ESLint attiva), pagine dashboard esistenti (users) per layout/form.
- **Permessi esistenti**: `people.read` (staff/admin), `people.manage` (staff/admin) già in `ROLE_PERMISSIONS` (1.3) — verifica e usa quelli.
- **Person esistente** (da 1.2): id cuid, firstName, lastName, email unique opzionale, relazione 1-0/1 con User; NON rompere il collegamento utenti (seed admin/pilot hanno Person collegate).
- **Archiviazione**: `archivedAt` timestamp (non boolean) — dice anche quando; una persona archiviata con User attivo: lascia l'accesso invariato (fuori scope disattivare l'utente qui, si fa da gestione utenti).
- Il dettaglio persona completo è la story 2.3: qui basta il form di modifica; non costruire la scheda.
- Ambiente: `service postgresql start`; Mailpit `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 &` (serve agli e2e esistenti); Chromium preinstallato, MAI `playwright install`.
- **Gate**: lint, typecheck, test (135+ attesi), build, test:e2e (25+ attesi) tutti verdi.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-1, #AD-5, #AD-8, #AD-11]
- [Source: _bmad-output/implementation-artifacts/1-5-api-openapi.md#Review Record] — wrapper, registry, regola ESLint zod
- [Source: docs/handoffs/HANDOFF.md] — stato ambiente e convenzioni

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 via BMAD dev-story

### Debug Log References

- Environment restored: `service postgresql start` (already `16/main online`), Mailpit already running on 1025/8025 (pids present at session start).
- Baseline confirmed before any change: `npx vitest run` → 135/135 (15 files) passing on the untouched tree.
- `@tanstack/react-table@8.21.3` installed pinned (`npm view` confirmed it's the latest 8.21.x, matching the story's pinned range) — the story's Task 3 first adoption of the library.
- **Prisma migration in a non-interactive sandbox**: `npx prisma migrate dev` (with or without `--create-only`, piped through `yes`, and even wrapped in `script` for a pty) unconditionally refuses with "Prisma Migrate has detected that the environment is non-interactive, which is not supported" — this Prisma 7 CLI behavior is stricter than what stories 1.1–1.4 hit. Worked around it non-interactively and deterministically: generated the SQL diff with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (diffing the live dev DB, already in sync with all prior migrations, against the updated `schema.prisma`), hand-wrote it into a new `prisma/migrations/20260705061624_add_person_crud_fields/migration.sql` following the existing timestamp-prefixed naming convention, then applied it with `npx prisma migrate deploy` (non-interactive by design) and ran `npx prisma generate`. Verified the resulting SQL only adds the four new nullable columns + the `fiscalCode` unique index — no data loss, no change to `User`'s 1-0/1 link or the seed.
- `npx tsc --noEmit` — clean after every task increment.
- `npx eslint .` — 0 errors; 1 benign warning on `src/components/data-table.tsx` ("Compilation Skipped: Use of incompatible library" — React Compiler can't safely memoize functions returned by TanStack Table's `useReactTable()`; documented, not a defect, does not fail the lint gate).
- `npx vitest run` — 162/162 passing (135 pre-existing + 27 new in `people.service.test.ts`).
- `npm run build` (`next build`) — passes; `/dashboard/people` and all four `/api/v1/people*` routes present in the route table.
- `npx playwright test` — **found and fixed a real bug in the new e2e test itself** (not app code): the first draft of the "archive" test clicked the row's "Conferma" button and then immediately did `page.goto(...)` — the same-tab navigation aborted the in-flight `fetch('/api/v1/people/{id}/archive')` before it reached the server (verified via a Playwright trace: the `goto` call fired ~75ms after the click, and the `people-feedback` assertion trivially passed because that testid was already visible from the earlier "person created" message, not the archive one). Fixed by waiting for the row itself to disappear from the default list (`expect(row).toHaveCount(0)`) before navigating away, which only resolves once `router.refresh()` has re-fetched with the archive applied. Full suite: 31/31 passing (25 pre-existing + 6 new in `e2e/people-management.spec.ts`).
- Full gate re-run together at the end (lint, typecheck, unit, build, e2e) — all green, confirming no cross-task regressions.

### Completion Notes List

- **Task 1 — model/migration**: `Person` extended with `phone String?`, `address String?`, `fiscalCode String? @unique`, `archivedAt DateTime?` (timestamp, not boolean, per Dev Notes — records *when* archived). `User`'s 1-0/1 relation and the admin/pilot seed are untouched (migration only adds nullable columns + one unique index; verified via `npx prisma migrate deploy` against the existing dev DB with the seeded rows already present).
- **Task 2 — service/API**: `people.service.ts` mirrors `users.service.ts`'s shape (`PERSON_SELECT`, `toListItem`, `isUniqueViolation`/P2002 mapping). `listPeople` authorizes `people.read`, applies `archivedAt: null` unless `includeArchived`, and an `OR` of case-insensitive `contains` on `firstName`/`lastName`/`email` when `q` is set; `createPerson`/`updatePerson` authorize `people.manage` and pre-check + P2002-backstop uniqueness on `email`/`fiscalCode` (a falsy/`null` value never triggers a conflict — Postgres allows multiple `NULL`s in a unique column, needed so clearing a field is never blocked). `archivePerson`/`unarchivePerson` throw `ConflictError` when the action doesn't apply to the current state (already archived / not archived), consistent with `resendInvite`'s existing "nothing to do" pattern in `users.service.ts`. Routes are one-liners through `apiRoute()`; all four new paths (list/create, get/update, archive, unarchive) plus four new component schemas (`Person`, `PersonList`, `CreatePersonRequest`, `UpdatePersonRequest`) are registered in `registry.ts`, and `registry.test.ts`'s path-coverage assertion was extended to include them.
- **Deviation — `includeArchived` query boolean**: the story doesn't specify how this flag arrives over the wire; used `z.preprocess` instead of `z.coerce.boolean()` in `listPeopleQuerySchema`, because `z.coerce.boolean()` treats the *string* `"false"` as truthy (`Boolean("false") === true`) — a real footgun for a query-string flag. Only the literal `"true"` (or an actual `true`) turns it on; everything else, including an explicit `?includeArchived=false`, is `false`. The UI only ever appends the param when checked, never sends `"false"` explicitly, but the schema is defensive regardless (e.g. for the documented OpenAPI contract a future Flutter client might call directly).
- **Task 3 — UI**: `src/components/data-table.tsx` is the reusable table shell the story asks for — deliberately thin (only `getCoreRowModel`, `TData extends { id: string }` for a stable row key), so the next stories (aircraft, etc.) can adopt it by only supplying `columns`/`data`. `people-manager.tsx` reuses the exact visual language of `users-manager.tsx` (same card/button/badge classes, per `minimalist-ui`) but adds what's new to this story: a debounced (400ms) search box and an "include archived" checkbox that both push into the URL (via the locale-aware `useRouter` from `@/i18n/navigation`, not the plain `next/navigation` one used elsewhere in the codebase for `.refresh()`-only cases — needed here because search/filter genuinely change the route), and an inline two-step confirm (replaces the row's action buttons with "Confirm?"/"Yes"/"Cancel" in place) for archive/unarchive, per the story's "azioni ... con conferma". `/dashboard/people` is server-rendered like `/dashboard/users` (redirect-if-no-`people.read`, `listPeople` re-authorizes regardless — AD-5 defense in depth). The pre-existing `people` nav item (`nav-items.ts`) pointed at the epic-1 placeholder `/people`; repointed to `/dashboard/people`, mirroring how `users` was repointed in story 1.4 — this is the story's first real (non-placeholder) People page, so the nav item necessarily changes with it.
- **Task 4 — tests**: `people.service.test.ts` (27 tests) mirrors `users.service.test.ts`'s structure — `ForbiddenError` for every read/write with a `PILOT` actor, the AD-8 paginated shape, `includeArchived`/`q` where-clause assertions, create/update conflict + P2002-race mapping, and archive/unarchive state-transition guards. `e2e/people-management.spec.ts` (6 tests) covers: staff/admin creates a person → appears in the list (AC 1); search filters by last name and the URL reflects `q` (AC 1); archive removes from the default list, shows with the filter, restore brings it back (AC 2); pilot redirected from `/dashboard/people` and gets 403 from the API directly (AC 3, AD-5); unauthenticated request gets the 401 envelope. `ADMIN` (not a dedicated `STAFF` seed user) exercises the staff-permission paths, same choice `user-management.spec.ts` (story 1.4) already made — `ADMIN` holds every permission including `people.manage`/`people.read`, so it exercises the identical authorization boundary the AC describes without adding new seed data.

### File List

- `prisma/schema.prisma` — modified (`Person`: `phone`, `address`, `fiscalCode` unique optional, `archivedAt`)
- `prisma/migrations/20260705061624_add_person_crud_fields/migration.sql` — new (hand-generated via `prisma migrate diff --script`, applied via `migrate deploy` — see Debug Log for why `migrate dev` doesn't work in this sandbox)
- `package.json`, `package-lock.json` — modified (added `@tanstack/react-table@8.21.3`, exact-pinned)
- `src/lib/schemas/people.ts` — new (`createPersonSchema`, `updatePersonSchema`, `listPeopleQuerySchema`, `personListItemSchema`, `personListResponseSchema`)
- `src/server/services/people.service.ts` — new (`listPeople`, `getPerson`, `createPerson`, `updatePerson`, `archivePerson`, `unarchivePerson`)
- `src/server/services/people.service.test.ts` — new (27 unit tests)
- `src/app/api/v1/people/route.ts` — new (`GET`/`POST`)
- `src/app/api/v1/people/[id]/route.ts` — new (`GET`/`PATCH`)
- `src/app/api/v1/people/[id]/archive/route.ts` — new (`POST`)
- `src/app/api/v1/people/[id]/unarchive/route.ts` — new (`POST`)
- `src/lib/schemas/registry.ts` — modified (People component schemas + 6 paths registered)
- `src/lib/schemas/registry.test.ts` — modified (path-coverage assertion extended with the 4 People paths)
- `src/components/data-table.tsx` — new (reusable `@tanstack/react-table` shell, first adoption)
- `src/app/[locale]/dashboard/people/page.tsx` — new (server page: auth/redirect, `listPeople`, pagination)
- `src/app/[locale]/dashboard/people/people-manager.tsx` — new (client: search/filter, create/edit forms, archive/unarchive with confirm)
- `src/app/[locale]/dashboard/nav-items.ts` — modified (`people` nav item now points at `/dashboard/people` instead of the epic-1 placeholder `/people`)
- `messages/it.json`, `messages/en.json` — modified (new `PeoplePage` section, symmetric IT/EN)
- `e2e/people-management.spec.ts` — new (6 e2e tests: create+list, search, archive/restore, pilot redirect/403, unauthenticated 401)

## Change Log

- 2026-07-05 — Story 2.1 implemented (`Person` extended with `phone`/`address`/`fiscalCode`/`archivedAt`, `people.service.ts` CRUD+archiving, 6 new `/api/v1/people*` routes registered in the OpenAPI registry, `/dashboard/people` UI on the new reusable `src/components/data-table.tsx`). 27 new unit tests + 6 new e2e tests. Status → review.
