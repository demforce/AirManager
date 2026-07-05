---
baseline_commit: 9c25deb5c91742370092d4f159389224046e7c09
---

# Story 1.2: Login con email e password

Status: done

## Review Record

- **Reviewer**: claude-opus via BMAD code-review (adversarial, security-focused, 2026-07-04)
- **Verdict**: APPROVE WITH FIXES — all applied by the orchestrator:
  1. **HIGH — open redirect**: `callbackUrl` accepted protocol-relative URLs (`//evil.com`, `/\evil.com`) → now rejected via `/^\/(?![/\\])/` in the login page.
  2. **MEDIUM — user-enumeration timing**: unknown/inactive email returned without Argon2id work → `authorize()` now verifies against a cached dummy hash so both failure paths cost the same.
  3. **LOW — email normalization**: login schema now trims + lowercases before `z.email()` validation.
  4. **LOW — unbounded password**: `.max(256)` added to the login schema.
  5. **LOW — proxy matcher dot gap**: added `'/api/:path*'` matcher so future API paths containing a dot (e.g. `report.xlsx`) can never bypass the 401 gate.
- Approved as correct: edge/node Auth.js split, no sensitive data in JWT, adapter omission, dashboard path deviation, `@auth/core/jwt` type augmentation, seed handling, i18n symmetry.
- **Post-fix gates**: lint ✔, typecheck ✔, test 44/44 ✔, build ✔, e2e 11/11 ✔.

## Story

As a utente registrato,
I want autenticarmi con email e password e uscire con logout,
so that acceda solo io ai miei dati (FR-1).

## Acceptance Criteria

1. **Given** un utente attivo seedato (admin demo) con password nota, **When** invio credenziali corrette dalla pagina di login localizzata, **Then** ottengo una sessione JWT (Auth.js v5, password hash Argon2id) e vengo rediretto alla dashboard, **And** il logout invalida la sessione e riporta al login.
2. **Given** credenziali errate o utente inesistente, **When** tento il login, **Then** vedo un errore generico localizzato che non rivela se l'email esiste.
3. **Given** una route web protetta o un endpoint `/api/v1/*` protetto, **When** li richiedo senza sessione, **Then** la web reindirizza al login e l'API risponde 401 con envelope `{"error":{"code":"UNAUTHENTICATED","message":...}}`.

## Tasks / Subtasks

- [x] Task 1: Modelli Prisma minimi per l'auth (AC: 1)
  - [x] `Person` minimale (id cuid, firstName, lastName, email unique opzionale, createdAt/updatedAt) — AD-11: anagrafica unica; la story 2.1 la estenderà
  - [x] `User` (id, email unique, passwordHash, isActive default true, roles Role[], personId unique FK opzionale verso Person) + enum `Role { ADMIN, STAFF, INSTRUCTOR, PILOT, STUDENT }`
  - [x] Migrazione + `prisma/seed.ts`: admin demo (email `admin@airmanager.local`, password da env `SEED_ADMIN_PASSWORD`, default dev nota nel README) con Person collegata
- [x] Task 2: Auth.js v5 (AC: 1, 2)
  - [x] next-auth `5.0.0-beta.31` (esatta) + Credentials provider con verifica Argon2id (`@node-rs/argon2`); strategia sessione JWT (obbligatoria con Credentials) — **`@auth/prisma-adapter` deliberatamente omesso, vedi Completion Notes**
  - [x] `src/server/auth/auth.ts` esporta `auth`, `signIn`, `signOut`, handlers; route `src/app/api/auth/[...nextauth]/route.ts`
  - [x] Nel JWT: userId, roles, personId; helper `getSessionActor()` in `src/server/auth/` che le stories future useranno
- [x] Task 3: UI login/logout (AC: 1, 2)
  - [x] Pagina `src/app/[locale]/(auth)/login/page.tsx` localizzata IT/EN (skill `minimalist-ui`), form email+password con errori generici localizzati
  - [x] Dashboard placeholder protetta che mostra nome utente e pulsante logout; dopo login redirect lì — **percorso `src/app/[locale]/dashboard/page.tsx` invece di `(dashboard)/page.tsx`, vedi Completion Notes (deviazione)**
- [x] Task 4: Protezione route (AC: 3)
  - [x] **Composto dentro `src/proxy.ts`** (Next 16 ammette UN solo file proxy — nota vincolante dalla review 1.1): next-intl `createMiddleware` + controllo sessione Auth.js; web non autenticata → redirect a `/{locale}/login`; `/api/v1/*` non autenticata → 401 JSON con envelope AD-8 (scritto a mano, l'helper completo arriva in 1.5)
  - [x] `/api/v1/health` (creata, non esisteva) resta pubblica; pagina di benvenuto `/` e `/login` pubbliche
- [x] Task 5: Test (AC: tutti)
  - [x] Unit: verifica hash Argon2id round-trip; authorize() del provider (utente inattivo/inesistente/password errata → null)
  - [x] e2e Playwright: login ok → dashboard; login errato → errore generico; route protetta senza sessione → redirect login; `/api/v1/*` senza sessione → 401 envelope; logout → di nuovo login

## Dev Notes

- **Versioni**: next-auth `5.0.0-beta.31` (dist-tag beta, verificato su npm 2026-07-04), `@auth/prisma-adapter` 2.11.x, `@node-rs/argon2` ultima stabile. Per l'API Auth.js v5 con Next App Router consulta la doc ufficiale via WebFetch su raw.githubusercontent.com (`nextauthjs/next-auth` → `docs/`), NON conoscenza pregressa: la v5 differisce molto dalla v4.
- **Attenzione Prisma 7**: il progetto usa driver adapter (`@prisma/adapter-pg`) e client generato in `src/generated/` — vedi `prisma.config.ts` e `src/server/db/prisma.ts` esistenti. L'adapter Prisma di Auth.js si usa SOLO per i modelli richiesti se servono; con Credentials+JWT l'adapter può anche essere omesso — valuta e documenta la scelta nel Dev Agent Record (meno tabelle inutili = meglio; niente tabelle Account/Session OAuth se non necessarie).
- **AD-5**: la mappa ruoli/permessi completa arriva in 1.3 — qui SOLO autenticazione; non anticipare authorize()/rbac.ts.
- **AD-8**: envelope errore esatto `{"error":{"code":"UNAUTHENTICATED","message":"..."}}` per le API.
- **i18n**: tutte le stringhe (login, errori, dashboard placeholder) nei cataloghi `messages/{it,en}.json`; il redirect al login deve preservare il locale corrente.
- **Env**: aggiungi `AUTH_SECRET` (e `SEED_ADMIN_PASSWORD`) a `src/lib/env.ts` e `.env.example`.
- **Playwright**: Chromium preinstallato (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`), NON eseguire `playwright install`. Postgres locale già attivo (service postgresql); DB da migrare/seedare prima degli e2e.
- **Gate**: lint, typecheck, test, build, test:e2e tutti verdi prima di dichiarare done.

### Project Structure Notes

- Nuovi file in `src/server/auth/`, `src/app/[locale]/(auth)/login/`, `src/app/[locale]/(dashboard)/`, `src/app/api/auth/[...nextauth]/`.
- Non toccare `_bmad/`, `_bmad-output/` (tranne questo story file), `.claude/`, `docs/`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-5, #AD-8, #AD-10, #AD-11]
- [Source: _bmad-output/implementation-artifacts/1-1-project-scaffold.md#Review Record] — vincolo proxy unico Next 16
- [Source: CLAUDE.md#Convenzioni]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 via BMAD dev-story

### Debug Log References

- `npm run lint` (ESLint) — pass (0 errors, 0 warnings)
- `npm run typecheck` (`tsc --noEmit`) — pass
- `npm run test` (Vitest) — 44/44 passed (34 pre-existing + 10 new: `password.test.ts` 5, `authorize.test.ts` 5)
- `npm run build` (`next build`) — pass; routes `/[locale]`, `/[locale]/login`, `/[locale]/dashboard`, `/api/auth/[...nextauth]`, `/api/v1/health` all present; proxy compiled
- `npm run test:e2e` (Playwright, Chromium at `/opt/pw-browsers/chromium`) — 11/11 passed (`e2e/login.spec.ts` 7 new + `e2e/welcome.spec.ts` 4 pre-existing), run twice consecutively to confirm no flakiness, and once more after a full DB reset (see below)
- `npx prisma migrate deploy` verified from a clean DB: dropped + recreated the `airmanager` database (`sudo -u postgres psql`), then `prisma migrate deploy` applied both `20260704134753_init` and `20260704173859_add_auth_models` cleanly, `prisma db seed` re-created the demo admin, and the full test/e2e suite was re-run against that fresh DB (all green)
- Manual verification of the Credentials flow at the HTTP level (`curl` against `/api/auth/csrf` + `/api/auth/callback/credentials`) to isolate a flaky-test root cause from a real auth bug (see below) — confirmed 302 + session cookie for correct credentials

### Completion Notes List

- **Prisma models (Task 1)**: added `Role` enum and minimal `Person`/`User` models exactly as specified (AD-11: `Person` is the single anagrafica; `User` is 1-to-0/1 optional on `Person` since not every login has a person yet and vice versa). Migration `20260704173859_add_auth_models` applied and re-verified from a clean DB. `prisma/seed.ts` now upserts the demo admin (`admin@airmanager.local`, password from `SEED_ADMIN_PASSWORD`, Argon2id-hashed) with a linked `Person` ("Admin AirManager"), idempotently.
- **Auth.js v5 verified live, not from prior knowledge**: fetched the current `nextauthjs/next-auth` docs (`docs/pages/getting-started/{installation,authentication/credentials,migrating-to-v5,typescript}.mdx`) via WebFetch on raw.githubusercontent.com per project convention, since `mcp.context7.com` is blocked and v5's API differs substantially from v4. Confirmed: `AUTH_SECRET` is the required env var, Credentials `authorize()` returns `null` on failure (never throws for the generic case), JWT/session callback shapes, and the `auth((req) => ...)` middleware-wrapper pattern for Next 16's `proxy.ts`.
- **Deviation — `@auth/prisma-adapter` intentionally NOT installed**, per the Dev Notes' explicit invitation to evaluate this: with the Credentials provider + `session.strategy: 'jwt'`, Auth.js never persists `Account`/`Session`/`VerificationToken` rows — the adapter exists to back OAuth account linking and database sessions, neither of which this story uses. Installing it would only create three permanently-empty OAuth tables. This is a deliberate narrowing of the architecture spine's stack table (AD-10 mentions the adapter) for the reason the story's own Dev Notes anticipated; revisit if a future story adds an OAuth provider or moves to database sessions.
- **Edge/Node config split (`auth.config.ts` + `auth.ts` + `auth-edge.ts`)**: the Credentials provider pulls in `@node-rs/argon2`, a native Node addon incompatible with the Edge runtime that `src/proxy.ts` runs in. Following the standard Auth.js v5 pattern, `auth.config.ts` holds only the edge-safe pieces (session strategy, secret, jwt/session callbacks) with no `providers`; `auth.ts` (Node runtime — route handlers, server components, server actions) spreads that config and adds the real `Credentials` provider; `auth-edge.ts` instantiates a second, provider-less `NextAuth(authConfig)` purely to decode the JWT cookie inside `src/proxy.ts`. Both instances share the same `AUTH_SECRET` and callbacks, so they decode the same cookie identically.
- **`authorize()` extracted to `src/server/auth/authorize.ts`** (`authorizeCredentials`) specifically so Task 5's unit test could exercise it directly (mocking `prisma.user.findUnique`) without going through the full Auth.js request cycle. Covers: correct credentials → user object; non-existent user → `null`; inactive user → `null`; wrong password → `null`; malformed input (Zod) → `null` without even querying the DB.
- **Type augmentation gotcha (Auth.js v5 beta)**: the officially documented pattern (`declare module 'next-auth/jwt' { interface JWT {...} }`) did NOT flow through to the `session` callback's `token` parameter — `token.userId` etc. resolved to `unknown` there (assignable when *writing*, since `JWT extends Record<string, unknown>`, but not when *reading* into a typed field). Root cause: `next-auth/jwt` re-exports `JWT` from `@auth/core/jwt` via `export *`, which does not participate in TypeScript's interface-merging (only the module that originally declares an interface does), and the internal `NextAuthConfig` callback types reference `@auth/core/jwt`'s `JWT` directly. Fixed by additionally declaring `declare module '@auth/core/jwt' { interface JWT {...} }` in `src/server/auth/types.d.ts` (documented inline). Also needed `session.strategy: 'jwt' as const` — without the `as const`, TS widens `'jwt'` to `string` when computing the `session` callback's overload, which independently also produced the `unknown` token type.
- **Deviation — dashboard route path**: the story specifies `src/app/[locale]/(dashboard)/page.tsx`, but that resolves to the exact same URL (`/{locale}`) as the existing public welcome page from story 1.1 (`src/app/[locale]/page.tsx`) — Next.js route groups `(name)` do not add a path segment, so the two would collide ("two parallel pages... resolve to the same path"), and AC 3 requires the welcome page to stay public at `/`. Resolved by placing the dashboard at `src/app/[locale]/dashboard/page.tsx` (no route group, explicit `/dashboard` segment) instead of nesting a redundant `(dashboard)/dashboard/page.tsx`. The `(auth)/login/` grouping from the story is unaffected (no collision) and was kept as specified. Future stories that add more dashboard-area pages can introduce a shared `(dashboard)` group/layout at that point if useful.
- **UI**: login page and dashboard styled per `minimalist-ui` (warm monochrome `#FBFBFA`/`#2F3437`/`#EAEAEA`, no gradients/shadows, `Newsreader` serif heading via the existing font setup), consistent with the story 1.1 welcome page. Login form is a client component using `react-hook-form` + `@hookform/resolvers/zod` + the shared `loginSchema` (per the architecture's Consistency Conventions form kit), calling `next-auth/react`'s `signIn('credentials', { redirect: false })` and showing one generic localized error (`data-testid="login-error"`) for every failure case (AC 2) — never distinguishing wrong-password from unknown-email. All strings are in `messages/{it,en}.json` (`LoginPage`, `DashboardPage` namespaces); no hardcoded UI text.
- **Proxy composition (`src/proxy.ts`)**: single file per the Next 16 constraint noted in story 1.1's review. `authEdge((req) => ...)` wraps next-intl's `createMiddleware`. `/api/auth/*` is always passed through (it's how sessions get created). `/api/v1/*` returns the exact AD-8 envelope `{"error":{"code":"UNAUTHENTICATED","message":"..."}}` with 401 for anything other than the newly-created public `/api/v1/health`. Web paths are matched by stripping the locale prefix and checking against an explicit public-paths allowlist (`''`, `/login`) — everything else (including future dashboard-area pages) is protected by default, redirecting to `/{locale}/login?callbackUrl=...`. Requests without a locale prefix yet are handed to next-intl first; the auth check re-applies once the follow-up request arrives with the prefix.
- **Env**: added `AUTH_SECRET` and `SEED_ADMIN_PASSWORD` to `src/lib/env.ts` (both required, fail-fast at boot like the rest of the schema) and to `.env.example`/`.env` (a real generated secret and a `ChangeMe123!` dev password).
- **Flaky-test root cause found and fixed during Task 5**: the first e2e run showed 2 intermittent failures. Investigated with a scratch debug spec (console/network logging) plus a direct `curl` against `/api/auth/callback/credentials` to rule out a real auth bug — the Credentials flow itself was solid. The actual bug was in the test: `page.getByRole('alert')` matched *two* elements (my own error `<p role="alert">` **and** Next.js's built-in `#__next-route-announcer__`, which also carries `role="alert"`), a Playwright strict-mode violation. Fixed by adding `data-testid="login-error"` to the error paragraph and asserting on that instead. Re-ran the full e2e suite three times after the fix (including once against a from-scratch DB) with 11/11 passing every time.

### File List

- `package.json`, `package-lock.json` — added `next-auth@5.0.0-beta.31`, `@node-rs/argon2@2.0.2`, `react-hook-form@7.80.0`, `@hookform/resolvers@5.4.0` (exact pins, no `^`, matching project convention)
- `.env.example`, `.env` — added `AUTH_SECRET`, `SEED_ADMIN_PASSWORD`
- `prisma/schema.prisma` — new `Role` enum, `Person` and `User` models
- `prisma/migrations/20260704173859_add_auth_models/migration.sql` — new
- `prisma/seed.ts` — seeds the demo admin user + linked `Person`
- `src/lib/env.ts` — added `AUTH_SECRET`/`SEED_ADMIN_PASSWORD` to the validated env schema
- `src/lib/schemas/login.ts` — new (shared Zod login schema, form + `authorize()`)
- `src/server/auth/password.ts`, `src/server/auth/password.test.ts` — new (Argon2id hash/verify + unit tests)
- `src/server/auth/authorize.ts`, `src/server/auth/authorize.test.ts` — new (extracted, unit-tested Credentials `authorize()`)
- `src/server/auth/auth.config.ts` — new (edge-safe NextAuth config: session/secret/callbacks)
- `src/server/auth/auth.ts` — new (full NextAuth instance: `auth`, `signIn`, `signOut`, `handlers`, Credentials provider)
- `src/server/auth/auth-edge.ts` — new (edge-runtime NextAuth instance for `src/proxy.ts`)
- `src/server/auth/session.ts` — new (`getSessionActor()` helper for future stories)
- `src/server/auth/types.d.ts` — new (Session/User/JWT module augmentation, incl. the `@auth/core/jwt` fix)
- `src/server/auth/README.md` — updated (describes the new files)
- `src/app/api/auth/[...nextauth]/route.ts` — new (Auth.js route handler)
- `src/app/api/v1/health/route.ts` — new (public health check; `.gitkeep` removed)
- `src/app/[locale]/(auth)/login/page.tsx`, `src/app/[locale]/(auth)/login/login-form.tsx` — new (login page + client form)
- `src/app/[locale]/dashboard/page.tsx` — new (protected placeholder dashboard; see Completion Notes for the path deviation)
- `src/proxy.ts` — rewritten (composes next-intl `createMiddleware` + Auth.js session gate; single-proxy-file constraint from story 1.1)
- `messages/it.json`, `messages/en.json` — added `LoginPage`, `DashboardPage` namespaces
- `playwright.config.ts` — added `dotenv/config` import so `SEED_ADMIN_PASSWORD` is available to e2e tests
- `e2e/login.spec.ts` — new (7 tests: login success, wrong password, unknown user, protected-route redirect, API 401 envelope, public health endpoint, logout)
