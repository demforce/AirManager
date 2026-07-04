---
baseline_commit: 828e16f82b2f73f1a93d32e25645f2913fd57f7d
---

# Story 1.4: Gestione utenti con invito e reset password

Status: review

## Story

As a admin,
I want creare, disattivare e modificare utenti con inviti e reset via email,
so that controlli chi accede al sistema (FR-3).

## Acceptance Criteria

1. **Given** l'elenco utenti (solo admin, permesso `users.manage`), **When** creo un utente scegliendo ruoli, email, lingua e Persona collegata (opzionale), **Then** parte una email di invito (visibile in Mailpit, nella lingua scelta) con link a token monouso a scadenza per impostare la password, **And** finché non la imposta l'utente non può accedere.
2. **Given** un utente disattivato, **When** tenta il login o usa una sessione esistente, **Then** il login è rifiutato e la sessione decade entro 15 minuti (ricontrollo `isActive` lato JWT).
3. **Given** la pagina "password dimenticata", **When** inserisco una email, **Then** ricevo (se l'account esiste ed è attivo) una email di reset con token monouso, senza che la UI riveli l'esistenza dell'account.

## Tasks / Subtasks

- [x] Task 1: Adapter email (AC: 1, 3)
  - [x] `src/server/adapters/mail/`: interfaccia `MailSender` (`send({to, subject, text, html?})`) + implementazione SMTP via `nodemailer` verso Mailpit (host/port da env `SMTP_HOST`/`SMTP_PORT`, default localhost:1025); factory che le stories future riuseranno (AD Deferred: provider prod dietro la stessa interfaccia)
  - [x] Template email invito e reset in IT e EN (testo semplice va bene; oggetto+corpo dai cataloghi o file dedicati — nessuna stringa hardcoded)
- [x] Task 2: Modelli e token (AC: 1, 3)
  - [x] Prisma: `User.locale` (enum o string 'it'|'en', default 'it'); modello `AuthToken { id, tokenHash unique, type INVITE|PASSWORD_RESET, userId FK, expiresAt, usedAt? , createdAt }`; migrazione
  - [x] Token: valore random ≥32 byte, salvato SOLO come hash (sha256); scadenza invito 7 giorni, reset 2 ore; monouso (usedAt)
  - [x] `User.passwordHash` diventa nullable: l'utente invitato non ha password finché non la imposta; `authorize()` rifiuta utenti senza password (con dummy-verify per il timing, come il fix 1.2)
- [x] Task 3: Service + API utenti (AC: 1, 2)
  - [x] `src/server/services/users.service.ts` con `authorize(actor,'users.manage')`: list (paginata), create (invia invito), update (ruoli, lingua, persona, isActive), resendInvite; niente delete fisico
  - [x] Route API `/api/v1/users` (GET, POST) e `/api/v1/users/[id]` (GET, PATCH) sottili con envelope AD-8
  - [x] Service `auth-tokens.service.ts`: `setPasswordWithToken(token, newPassword)` e `requestPasswordReset(email)` (silenzioso se email inesistente/inattiva)
- [x] Task 4: Ricontrollo isActive nel JWT (AC: 2)
  - [x] Nel callback `jwt`: ogni ≥15 minuti (timestamp `lastActiveCheck` nel token) rileggi `isActive` dal DB (solo runtime node — non nel proxy edge); se inattivo il token viene invalidato e la richiesta successiva finisce al login
  - [x] Test unit sul comportamento (mock del tempo)
- [x] Task 5: UI (AC: 1, 2, 3)
  - [x] `/{locale}/dashboard/users`: tabella utenti (email, ruoli, stato, persona, lingua) + form crea/modifica + disattiva/riattiva + reinvia invito — solo `users.manage`, skill `minimalist-ui`, TanStack Table NON necessaria (tabella semplice per ora)
  - [x] Pagine pubbliche `/{locale}/set-password?token=...` (imposta password: min 10 char; poi redirect login) e `/{locale}/forgot-password` (sempre messaggio neutro di conferma) — aggiungile a `PUBLIC_WEB_PATHS` nel proxy
- [x] Task 6: Test (AC: tutti)
  - [x] Unit: token hash/scadenza/monouso; create user → invito; requestPasswordReset silenzioso su email ignota; authorize rifiuta passwordHash null; ricontrollo isActive
  - [x] e2e: admin crea utente → email in Mailpit (API http://localhost:8025/api/v1/messages) → set-password col token → login col nuovo utente; utente disattivato → login rifiutato; forgot-password → email reset → nuova password funziona; pilota su /dashboard/users → 403/redirect

## Dev Notes

- **Mailpit**: gira in locale (docker-compose in prod dev; in questo sandbox avvia il binario o usa il container se già attivo — se Mailpit non è disponibile, installa/avvia `axllent/mailpit` da binario GitHub releases, oppure in extremis un fake SMTP nodemailer JSON transport per i test unit e verifica e2e via API Mailpit solo se raggiungibile; documenta cosa hai fatto). SMTP: localhost:1025, UI/API: localhost:8025.
- **Sicurezza**: mai salvare token in chiaro; risposta di forgot-password identica per email esistente/inesistente (timing: esegui comunque lavoro equivalente); i link email usano `APP_URL` da env (aggiungi a env.ts/.env.example, default http://localhost:3000).
- **AD-5**: tutta l'autorizzazione nei service; le route restano sottili.
- **Pattern esistenti**: rbac/authorize (1.3), envelope AD-8 locale (route `me`), dummy-hash timing (authorize.ts, fix 1.2 — estendilo al caso passwordHash null), seed idempotente.
- **Non fare**: OpenAPI registry (1.5), gestione Persone completa (2.x — qui solo select di Person esistenti per il collegamento).
- **Gate**: lint, typecheck, test, build, test:e2e verdi.

### Project Structure Notes

- Nuovi: `src/server/adapters/mail/*`, `src/server/services/users.service.ts`, `src/server/services/auth-tokens.service.ts`, route `/api/v1/users*`, pagine `dashboard/users`, `set-password`, `forgot-password`; migrazione Prisma.
- Aggiornati: `prisma/schema.prisma`, `src/server/auth/{auth.config,authorize}.ts`, `src/proxy.ts` (public paths), `messages/{it,en}.json`, `src/lib/env.ts`, `.env.example`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-5, #AD-8, Deferred (MailSender)]
- [Source: _bmad-output/implementation-artifacts/1-3-rbac.md#Review Record] — pattern e vincoli correnti
- [Source: _bmad-output/implementation-artifacts/1-2-login.md#Review Record] — timing dummy-hash da preservare

## Dev Agent Record

### Agent Model Used

claude-fable-5 via BMAD dev-story

### Debug Log References

- `npm run lint` (ESLint) — pass (0 errors, 0 warnings; one transient unused-variable warning in `users-manager.tsx` fixed before the final run)
- `npm run typecheck` (`tsc --noEmit`) — pass (first run surfaced: stale generated Prisma client → `prisma generate`; RHF v7 + resolvers v5 need the three-generic `useForm<z.input<S>, unknown, z.output<S>>` form because `createUserSchema.locale` has a `.default()`; `createTranslator` needed statically-typed messages — solved by typing the loader's return as `typeof import('.../messages/it.json')`)
- `npm run test` (Vitest) — 99/99 passed (66 pre-existing incl. 1 new authorize case + 33 new: `jwt-active-check.test.ts` 5, `users.service.test.ts` 17, `auth-tokens.service.test.ts` 11, `templates.test.ts` 4 — one initial failure was a test bug: the mocked `MailSender.send` returned `undefined`, breaking the fire-and-forget `.catch()`; fixed with `mockResolvedValue(undefined)`)
- `npm run build` (`next build`) — pass; all new routes present (`/[locale]/dashboard/users`, `/[locale]/set-password`, `/[locale]/forgot-password`, `/api/v1/users`, `/api/v1/users/[id]`, `/api/v1/users/[id]/resend-invite`, `/api/v1/auth/set-password`, `/api/v1/auth/forgot-password`)
- `npm run test:e2e` (Playwright, Chromium at `/opt/pw-browsers/chromium`, Mailpit on 1025/8025, Postgres seeded) — 21/21 passed, run twice consecutively to confirm stability (first attempt had 5 failures caused by a race in the new spec's `login()` helper — it didn't await the dashboard redirect before navigating on; fixed with `loginExpectingDashboard`)
- `npx prisma migrate dev --name add_user_management` — migration `20260704183719_add_user_management` created and applied; `prisma migrate deploy` then reports no pending migrations; seed re-run OK (unchanged, still idempotent)
- Mailpit API shape verified live before writing the e2e helpers (`GET /api/v1/search?query=to:<email>` → `messages[].{ID,Subject}`; `GET /api/v1/message/{ID}` → `{Text}` with CRLF line endings)

### Completion Notes List

- **Mailpit provisioning (sandbox)**: neither route suggested by the Dev Notes worked in this environment — `docker pull axllent/mailpit` fails (Docker Hub blob storage answers 403 through the egress proxy) and the GitHub release binaries are also 403 (only `raw.githubusercontent.com` and the package registries are whitelisted). Since `proxy.golang.org` IS whitelisted and Go 1.24 is preinstalled, Mailpit v1.30.3 was **built from source** with `GOPROXY=https://proxy.golang.org go install github.com/axllent/mailpit@latest` (Go toolchain auto-upgraded to 1.25.11) and runs from `/root/go/bin/mailpit --listen 0.0.0.0:8025 --smtp 0.0.0.0:1025`. Anyone re-running the e2e suite in a fresh sandbox must start Mailpit (and `service postgresql start`) first; in normal dev the docker-compose Mailpit service covers this.
- **MailSender adapter (Task 1)**: `src/server/adapters/mail/` holds the `MailSender` interface (`mail-sender.ts`), the nodemailer SMTP implementation (`smtp-mail-sender.ts`, host/port/from from validated env, no auth/TLS — it's Mailpit) and a `getMailSender()` singleton factory (`index.ts`) so the production provider swap (architecture spine, Deferred) is a one-line change. **nodemailer is pinned to 7.0.13, not the latest 9.x**: `next-auth@5.0.0-beta.31` declares `peerOptional nodemailer@^7.0.7` and npm refuses to resolve 9.x against it; 7.0.13 is the newest release satisfying the peer range.
- **Email templates (Task 1)**: `templates.ts` renders subject+body from the new `Emails.invite`/`Emails.passwordReset` catalogue entries via next-intl's `createTranslator`, loading `messages/{locale}.json` directly — NOT via `getTranslations()`, which is bound to the current request's locale, while an invite email must be in the *recipient's* stored locale (AD-7). Plain-text bodies with ICU plurals (`{expiresInDays, plural, ...}`); no hardcoded strings anywhere.
- **Schema (Task 2)**: `User.passwordHash` now nullable (invited user = no password yet), `User.locale` is a plain `String @default("it")` rather than a Prisma enum — it maps 1:1 onto next-intl's `AppLocale` union and is validated at the Zod boundary (`localeSchema`), so an enum would just add a translation layer. New `AuthTokenType` enum + `AuthToken` model (unique `tokenHash`, FK to `User`, `expiresAt`, nullable `usedAt`, index on `userId`). Migration `20260704183719_add_user_management`.
- **Token mechanics (Task 2)**: 32 random bytes (`crypto.randomBytes`) base64url-encoded in the emailed link; only the sha256 hex digest is persisted. Invite TTL 7d, reset TTL 2h (exported constants, unit-tested). Single-use via `usedAt`; additionally, issuing a new token invalidates any previous *unused* token of the same type for the same user (transactional `updateMany` + `create`), so at most one live invite and one live reset link exist per user. `setPasswordWithToken` throws the *same* `ValidationError` for unknown, expired and already-used tokens — a probing client can't distinguish the three.
- **authorize() extension (Task 2)**: the 1.2 dummy-hash timing fix is preserved and extended exactly as required — the guard is now `!user || !user.isActive || !user.passwordHash`, so "invited but no password yet" costs the same Argon2id verify as "unknown email" and returns the same `null`. New unit test covers the null-passwordHash case; the four pre-existing authorize tests still pass.
- **users.service.ts (Task 3)**: every function calls `authorize(actor, 'users.manage')` first (AD-5). `listUsers` returns the AD-8 pagination shape `{items,total,page,pageSize}`, newest-first so fresh invitees are on page 1. `createUser` → `ConflictError` on duplicate email, validates the optional `personId` (must exist and not be linked to another user — `NotFoundError`/`ConflictError`), creates with `passwordHash: null`, then sends the invite; an SMTP failure is logged but does NOT roll back the creation (the admin can `resendInvite`). `updateUser` patches roles/locale/personId (nullable = unlink)/isActive; no physical delete exists anywhere. `resendInvite` refuses (409) if the user already set a password. Exposes `passwordSet: boolean` (derived) — never the hash. `listAvailablePersons` powers the Person `<select>` (story scope: link existing Persons only; full People CRUD is epic 2).
- **auth-tokens.service.ts (Task 3)**: `requestPasswordReset` is deliberately unauthorized (public flow), never throws, and does equivalent work on both branches — for a missing/inactive account it still performs a same-shape `AuthToken` lookup, and for a real account the SMTP send is fire-and-forget (`void ...send().catch(log)`) so the HTTP response time doesn't include the SMTP round-trip on exactly one branch. The API route always answers `200 {ok:true}`.
- **API routes (Task 3)**: `/api/v1/users` (GET list, POST create), `/api/v1/users/[id]` (GET, PATCH), `/api/v1/users/[id]/resend-invite` (POST), plus public `/api/v1/auth/set-password` and `/api/v1/auth/forgot-password`. All thin (Zod parse → service → JSON), each with the same minimal local `DomainError`→HTTP mapping used by `/api/v1/me` — consciously duplicated per route because the shared envelope helper is story 1.5's deliverable (1.3 review F2). Zod validation failures answer 422 with `z.flattenError` details.
- **JWT isActive recheck (Task 4)**: extracted to `src/server/auth/jwt-active-check.ts` (`applyActiveRecheck(token, now)`) for direct unit testing with injected time — 5 tests cover: interval not elapsed (no DB hit), boundary hit + watermark refresh, deactivated → `null`, deleted → `null`, missing watermark → immediate recheck. Wired into **`auth.ts` only** by overriding the `jwt` callback: it first delegates to the edge-safe `authConfig.callbacks.jwt` (which now also stamps `lastActiveCheck` at sign-in), skips the recheck when `params.user` is present (fresh sign-in was just DB-verified), otherwise applies the recheck. `auth-edge.ts`/`src/proxy.ts` still never touch the DB. Returning `null` from the `jwt` callback is the documented `@auth/core` contract for "kill this session" (verified in the current `@auth/core` source: the session action calls `sessionStore.clean()` on a null token, clearing the cookie), which yields exactly AC 2's ≤15-minute decay.
- **UI (Task 5)**: `/{locale}/dashboard/users` is a server component (reads through `listUsers`/`listAvailablePersons`, AD-1) plus a `users-manager.tsx` client component: simple table (email, roles, status badge Attivo/Disattivo/Invito in sospeso, person, language), inline create/edit panels (react-hook-form + zodResolver + shared schemas), deactivate/reactivate toggle, resend-invite (only shown while no password is set), page-based pagination links. Admin-gating: server-side `hasPermission` redirect + the services' own `authorize` (the UI is never the only guardian). Public `set-password` (min 10 chars + confirm field, success → login link; token read from the query string; missing token → error state) and `forgot-password` (always the same neutral confirmation — the client doesn't even inspect the response body, so the UI can't become an enumeration channel). Both added to `PUBLIC_WEB_PATHS`; the two auth API endpoints added to `PUBLIC_API_PATHS`. A "Password dimenticata?" link was added to the login page (natural entry point for AC 3; strings in both catalogues). All styling per `minimalist-ui` (warm monochrome, `#EAEAEA` borders, muted pastel badges, no TanStack Table per the story).
- **Env**: `APP_URL` (email link base, default http://localhost:3000), `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` added to `src/lib/env.ts` (all with dev defaults, so boot doesn't break) and documented in `.env.example`/`.env`.
- **Tests (Task 6)**: 33 new unit tests (see Debug Log for the breakdown) covering the full required list: token hash/expiry/single-use, create→invite, silent `requestPasswordReset`, `authorize` null-passwordHash rejection, isActive recheck with mocked time, plus the RBAC guard on every users.service function. New `e2e/user-management.spec.ts` (7 tests): full invite flow driven through Mailpit's API (create in UI → poll `search?query=to:<email>` → extract the `/set-password?token=` link from the message text → set password → login); invited-but-pending user rejected at login; deactivate → login rejected; forgot-password with both an unknown email (neutral confirmation, no email) and a real one (reset email → new password works); pilot redirected from `/dashboard/users`; pilot gets 403 from `GET /api/v1/users`; unauthenticated request gets the AD-8 401 envelope.
- **Deviation — extra route `/api/v1/users/[id]/resend-invite`**: the story's route list names only `/api/v1/users` and `/api/v1/users/[id]`, but Task 3 requires `resendInvite` in the service and Task 5 requires a "reinvia invito" button; a dedicated POST sub-route is the AD-1-compliant way to expose it (the alternative — overloading PATCH with a side-effectful "resend" flag — would conflate a state update with an action). Flagged for the reviewer.
- **Deviation — locale-less `/set-password` link in emails**: the emailed link is `APP_URL/set-password?token=...` without a locale prefix; next-intl's middleware redirects it to `/{defaultLocale}/set-password` preserving the query string (verified e2e). Building `/{user.locale}/set-password` links instead would be a one-line change in `auth-tokens.service.ts#buildSetPasswordUrl`; kept simple since the page itself is fully localized either way. Flagged for the reviewer.
- **AC 2 session-decay note**: the e2e suite covers the login-rejection half of AC 2 end-to-end; the "existing session dies within 15 minutes" half is covered by the `applyActiveRecheck` unit tests with mocked time (an e2e test would need to fast-forward the clock inside the Next.js server process, which Playwright cannot do).

### File List

- `package.json`, `package-lock.json` — modified (added `nodemailer@7.0.13`, `@types/nodemailer@8.0.1`; see Completion Notes for the 7.x pin rationale)
- `.env.example`, `.env` — modified (added `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM`)
- `prisma/schema.prisma` — modified (`User.passwordHash` nullable, `User.locale`, new `AuthTokenType` enum + `AuthToken` model)
- `prisma/migrations/20260704183719_add_user_management/migration.sql` — new
- `src/lib/env.ts` — modified (validated `APP_URL`/`SMTP_HOST`/`SMTP_PORT`/`MAIL_FROM`)
- `src/lib/schemas/users.ts` — new (`createUserSchema`, `updateUserSchema`, `listUsersQuerySchema`, `localeSchema`, `roleSchema`)
- `src/lib/schemas/auth-tokens.ts` — new (`setPasswordSchema` min 10 chars, `forgotPasswordSchema`)
- `src/server/adapters/mail/mail-sender.ts` — new (`MailSender` interface, `MailMessage`)
- `src/server/adapters/mail/smtp-mail-sender.ts` — new (nodemailer SMTP implementation)
- `src/server/adapters/mail/index.ts` — new (`getMailSender()` factory)
- `src/server/adapters/mail/templates.ts` — new (IT/EN invite + reset emails from the i18n catalogues)
- `src/server/adapters/mail/templates.test.ts` — new (4 tests)
- `src/server/services/auth-tokens.service.ts` — new (hashed single-use tokens, `sendInviteEmail`, `requestPasswordReset`, `setPasswordWithToken`)
- `src/server/services/auth-tokens.service.test.ts` — new (11 tests)
- `src/server/services/users.service.ts` — new (list/get/create/update/resendInvite/listAvailablePersons, all behind `users.manage`)
- `src/server/services/users.service.test.ts` — new (17 tests)
- `src/server/auth/authorize.ts` — modified (rejects null `passwordHash` via the same dummy-verify timing path)
- `src/server/auth/authorize.test.ts` — modified (new null-passwordHash test; fixtures gained `locale`)
- `src/server/auth/auth.config.ts` — modified (stamps `lastActiveCheck` at sign-in; still edge-safe/DB-free)
- `src/server/auth/auth.ts` — modified (Node-only `jwt` callback override applying `applyActiveRecheck`)
- `src/server/auth/jwt-active-check.ts` — new (`applyActiveRecheck`, `ACTIVE_RECHECK_INTERVAL_MS`)
- `src/server/auth/jwt-active-check.test.ts` — new (5 tests, mocked time)
- `src/server/auth/types.d.ts` — modified (`lastActiveCheck` on both `JWT` augmentations)
- `src/app/api/v1/users/route.ts` — new (GET list, POST create)
- `src/app/api/v1/users/[id]/route.ts` — new (GET, PATCH)
- `src/app/api/v1/users/[id]/resend-invite/route.ts` — new (POST; see Deviation note)
- `src/app/api/v1/auth/set-password/route.ts` — new (public POST)
- `src/app/api/v1/auth/forgot-password/route.ts` — new (public POST, always 200)
- `src/app/[locale]/dashboard/users/page.tsx` — new (admin users page, server component + pagination)
- `src/app/[locale]/dashboard/users/users-manager.tsx` — new (client: table + create/edit forms + actions)
- `src/app/[locale]/(auth)/set-password/page.tsx`, `src/app/[locale]/(auth)/set-password/set-password-form.tsx` — new (public page + client form)
- `src/app/[locale]/(auth)/forgot-password/page.tsx`, `src/app/[locale]/(auth)/forgot-password/forgot-password-form.tsx` — new (public page + client form)
- `src/app/[locale]/(auth)/login/page.tsx` — modified ("Password dimenticata?" link)
- `src/app/[locale]/dashboard/nav-items.ts` — modified (`users` nav item gated on `users.manage`)
- `src/proxy.ts` — modified (`/set-password`, `/forgot-password` in `PUBLIC_WEB_PATHS`; two auth endpoints in `PUBLIC_API_PATHS`)
- `messages/it.json`, `messages/en.json` — modified (`UsersPage`, `SetPasswordPage`, `ForgotPasswordPage`, `Emails.*`, `LoginPage.forgotPassword`, `DashboardPage.nav.users`)
- `e2e/user-management.spec.ts` — new (7 e2e tests incl. the full Mailpit-driven invite/reset flows)
- `src/server/adapters/README.md`, `src/server/services/README.md`, `src/server/auth/README.md` — modified (document the new modules)

## Change Log

- 2026-07-04 — Story 1.4 implemented (MailSender adapter + Mailpit, AuthToken invite/reset flows, nullable passwordHash + timing-safe authorize, JWT isActive recheck, admin users UI, public set-password/forgot-password pages, 33 new unit tests + 7 new e2e tests). All gates green: lint, typecheck, test 99/99, build, test:e2e 21/21 (×2). Status → review.
