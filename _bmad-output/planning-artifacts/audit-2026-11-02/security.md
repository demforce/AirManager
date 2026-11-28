# AirManager — application security audit (2026-11-02)

**Target:** `/home/admin/AirManager`, branch `dev` at `a598b26`, plus the uncommitted story 19.8 work ("Salva unico" settings console).

**Method:** read-only. Every claim below was read along its full code path (route, Zod schema, service, Prisma). Supporting evidence:

- node simulations of library code: the Next.js router and the getaddrinfo resolver;
- a run of the real SMTP host schema;
- `npm audit --omit=dev`;
- GitHub advisory API lookups for the advisories that might apply.

**Not run:** no server was started, the database was never touched, and no e2e or gates were executed. "VERIFIED" therefore means the exact code path was read and quoted, and in two cases also simulated. It does not mean an exploit was fired against a live instance.

Three read-only sub-agents swept domain authorization, the page layer, and injection/SSRF. I re-checked their load-bearing claims myself: 25 matrix line references, the open-redirect chain, the SMTP bypasses, and findings S-5, S-6, S-9, S-11, S-12 and S-14.

---

## 1. Executive summary

AirManager's core access control is sound.

- **Permissions:** every privileged route authorizes in the service with an ADMIN-only permission.
- **Ownership:** own-access checks compare `actor.personId` before any query, and exports reuse the scoped list services.
- **SQL:** all raw SQL, including the new 19.7b registry, is parameterized.
- **Prior fixes:** most findings from the 2026-07-22 audit and the 2026-07-23 scan are fixed and still hold.

The real exposure is in four places:

1. **Outdated runtime dependencies (High).** Next.js 16.2.10 has a Server Actions CPU-exhaustion advisory whose precondition this app meets: a logout Server Action exists. next-auth beta.31 has a crash on a malformed bearer header, triggerable through the edge proxy.
2. **Availability (Medium).** Two problems:
   - Any authenticated user, a STUDENT included, can monopolize the single Node process with a 2,000-row bookings PDF.
   - The dashboard layout awaits an outbound METAR fetch that has no timeout.
3. **Post-login open redirect (Medium).** The `callbackUrl` guard is bypassable with `%09`/`%0A`/`%0D`. The previous audit listed it as clean.
4. **Booking privacy and workflow (Medium).**
   - Masked bookings still carry `personId` and `forcedAt`, and `?status=` exposes others' DENIED/CANCELLED rows (ops F6, still open and wider than recorded).
   - An owner can move an APPROVED booking to another aircraft or time and it stays APPROVED.

Two prior identity findings are still open: ops F6 and ops F8 (relinking a user to another person does not end the session). Story 16.7, which fixes both, is still `ready-for-dev`.

| Severity | New findings | IDs |
|---|---|---|
| Critical | 0 | |
| High | 1 | S-1 |
| Medium | 5 | S-2 to S-6 |
| Low | 7 | S-7 to S-13 |
| Info | 5 | S-14 to S-18 |

Prior findings still open: F6 (Medium, extended by S-6) and F8 (Medium). The accepted residuals D-A to D-D are unchanged.

---

## 2. Status of prior findings

| ID (source) | Title | Status | Evidence |
|---|---|---|---|
| H1 (OWASP 07-22) | Login brute force | **FIXED** | `reserveLoginAttempt` caps failures at 10 per identifier per 15 min. The count and insert are serialized with `pg_advisory_xact_lock` (`src/server/auth/login-throttle.ts:93-118`, called at `authorize.ts:38`). Residual: lockout abuse, see S-7. |
| H2 | Role changes never rechecked | **FIXED** | `applyActiveRecheck` re-reads `roles` from the DB at most every 15 min (`jwt-active-check.ts:40,51`). |
| H3 | Idempotency key freed after commit | **FIXED** | Top-up reads its overview inside the transaction (`accounts.service.ts:275`). Adjustment and flight registration degrade a failed post-commit read instead of throwing (`accounts.service.ts:705`, `flights.service.ts:1209-1220`). |
| H4 | forgot-password unthrottled | **FIXED, with a residual** | 3 per hour per email and 10 per hour per IP (`auth-tokens.service.ts:17-52`). Residual: the count-then-insert race, see S-8. |
| H5 | PPR rate limit bypass | **N/A, code removed** | The PPR domain and its public endpoint were deleted in story 19.1, and no `ppr` route exists. A stale `/ppr` public web path remains, see S-17. |
| M1 | Idempotency key not bound to payload | **FIXED** | A sha256 fingerprint is stored, and a mismatch returns 422 `IDEMPOTENCY_KEY_MISMATCH` (`src/lib/api/handler.ts:187-189,241-249`). |
| M2 | SMTP password stored in cleartext | **FIXED** | AES-256-GCM with an HKDF key (`src/server/crypto/secret-box.ts:22-48`). It is written encrypted in HEAD (`app-settings.service.ts:258`) and in the work in progress (`:272`). |
| M3 | No security headers | **FIXED, with residuals** | CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `poweredByHeader:false` (`next.config.ts:9-35`). Residuals: `script-src 'unsafe-inline'` with no nonce, no HSTS (deliberate for LAN HTTP), no Permissions-Policy. |
| M4 | Weak or placeholder secrets | **FIXED** | `AUTH_SECRET` requires at least 32 characters, and both placeholders are refused in production (`src/lib/env.ts:31,59-75`). Residual: `JOBS_SECRET` only requires `min(1)` when set. |
| M5 | Unbounded request body | **FIXED in `apiRoute`; one route bypasses it** | A streaming 64 KB cap applies (`handler.ts:103-164,385-397`). `PUT /people/{id}/profiles/{type}` bypasses the cap, see S-9. |
| L1 | SMTP host SSRF | **PARTIALLY FIXED** | The literal-IP guard exists but non-canonical literals bypass it, see S-10. The DNS-resolution class is still acknowledged as unhandled. |
| L2 | Excel formula injection | **FIXED** | `neutralizeFormulaInjection` is applied to every cell (`src/server/adapters/excel/workbook.ts:30,53`). |
| L3 | Known default admin password | **FIXED** | `SEED_ADMIN_PASSWORD` is optional in `env.ts:35`, and the seeds refuse `NODE_ENV=production` (`prisma/seed.ts:381`, `seed-demo.ts:250`). |
| L4 | Postgres exposed on 0.0.0.0 | **FIXED** | Postgres binds `127.0.0.1:5432` and Mailpit binds loopback (`docker-compose.yml:58,71-72`). |
| D-A | forgot-password timing oracle | **ACCEPTED-RESIDUAL, unchanged** | A real account runs a write transaction; an unknown address runs one read (`auth-tokens.service.ts:153-160`). |
| D-B | Token in the URL query string | **ACCEPTED-RESIDUAL, unchanged** | `buildSetPasswordUrl` (`auth-tokens.service.ts:77-81`). Mitigations hold: SHA-256 at rest, single use, 2 h reset and 7 d invite TTL, Referrer-Policy, no third-party resources on the page. |
| D-C | No `Secure` cookie on plain HTTP; logout does not revoke | **ACCEPTED-RESIDUAL** | `.env` sets `AUTH_URL=http://192.168.56.115:3000`. The session is sliding, not absolute, see S-16. |
| D-D | CPU exhaustion by rotating identifiers without a trusted proxy | **ACCEPTED-RESIDUAL, unchanged** | It also implies unbounded growth of `LoginAttempt` and `PasswordResetAttempt`, see S-8. |
| DIS-A | next-auth pinned to a beta | **REOPENED** | beta.31 now has published advisories, and GHSA-xmf8-cvqr-rfgj applies (proxy `getToken`), see S-1. |
| F1 (scan 07-23) | Password reset does not end sessions | **FIXED** | `tokenVersion` is incremented inside the reset transaction (`auth-tokens.service.ts:214-217`) and compared on recheck (`jwt-active-check.ts:47`). Eviction happens within 15 min or less. |
| F2 (scan 07-23) | Login lock TOCTOU | **FIXED** | Per-identifier reservation is atomic (`login-throttle.ts:93-118`). The per-IP cap is documented as best effort. |
| ops F6 | `personId` not masked on bookings | **STILL OPEN** (story 16.7 is ready-for-dev) | `bookings.service.ts:260`. It is wider than recorded, see S-6. |
| ops F8 | `Actor.personId` never refreshed | **STILL OPEN, Medium** | The recheck select has no `personId` (`jwt-active-check.ts:40`). `updateUser` writes `personId` without bumping `tokenVersion` (`users.service.ts:182-188`). After a relink or unlink, the old session keeps "own" access to the previous person: account, statement, flights, expiries, booking create/edit/cancel. `getMe` meanwhile shows the new identity. Fix as ratified in R-16-f: add `tokenVersion: { increment: 1 }` when `personId` changes, and add `personId` to the recheck select. |
| ops F12 | PPR rate limit race | **N/A, code removed** | The same check-then-write shape survives in forgot-password, see S-8. |
| ops F4 | Approval does not re-verify the person | **FIXED** (16.3) | The APPROVED branch re-asserts archived status and active profile (`bookings.service.ts:1359-1360`). |
| ops F11 | `deleteExpiry` is a physical delete with no trace | **STILL OPEN, Info** | Admin only (`expiries.service.ts:327-335`). This is an audit-trail gap, not an access-control gap. |
| ledger audit | RBAC-adjacent items | **None open** | VC-5 to VC-7 re-confirmed: every money write requires `finance.manage` or `payouts.manage` (ADMIN only), and the self-service readers take no id parameter. |

---

## 3. Authorization matrix

Roles come from `src/server/auth/rbac.ts:104-110`:

| Role | Permissions |
|---|---|
| ADMIN | every permission |
| INSTRUCTOR | `self.read`, `bookings.manage.own`, `bookings.read.names` |
| PILOT | `self.read`, `bookings.manage.own` |
| STUDENT | `self.read` |

How each route is reached:

- `src/proxy.ts` returns 401 for every non-public `/api/v1` path.
- `apiRoute` resolves the session again and returns 401 if there is none (`handler.ts:366-371`).
- The permission check happens in the service at the line given below.
- `[session]` means any signed-in user with no permission check, which is intended for non-sensitive reads.
- `public` routes skip the session entirely.

| Route | Method | Service check (file:line) | Non-ADMIN rule / notes |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | Auth.js | Auth.js double-submit CSRF token on the credentials callback |
| `/api/v1/health` | GET | public | `{status:'ok'}` |
| `/api/v1/openapi.json` | GET | public | Whole API description (recon only) |
| `/api/v1/auth/forgot-password` | POST | public | Throttled; always returns 200 `{ok:true}` (S-8) |
| `/api/v1/auth/set-password` | POST | public | 256-bit token hashed at rest, single-use claim in a transaction, `tokenVersion` bump |
| `/api/v1/jobs/expiry-alerts` | POST | bearer `JOBS_SECRET`, timing-safe (`jobs-bearer.ts`) | 500 if unset (fails closed). Replay-safe: `SentAlert` rows are per threshold and the digest is sent only when something is new |
| `/api/v1/me` | GET | `self.read` me.service.ts:29 | Own user and person only, read by userId |
| `/api/v1/metar` | GET | [session] | Station is admin-set and the upstream host is fixed (S-4) |
| `/api/v1/accounts/negative-balances` | GET | `finance.manage` accounts.service.ts:756 | Admin only |
| `/api/v1/aircraft` | GET (+xlsx) | `aircraft.manage` aircraft.service.ts:119 | Admin only |
| `/api/v1/aircraft` | POST | `aircraft.manage` :198 | Also needs `settings.manage` when rates are included |
| `/api/v1/aircraft/{id}` | GET / PATCH | `aircraft.manage` :175 / :257 | Admin only |
| `/api/v1/aircraft/{id}/archive`, `/unarchive` | POST | `aircraft.manage` :314 / :334 | Admin only |
| `/api/v1/aircraft/{id}/out-of-service` | POST | `aircraft.manage` :380 | Admin only |
| `/api/v1/aircraft/{id}/out-of-service-impact` | GET | `aircraft.manage` :445 | Admin only |
| `/api/v1/aircraft/{id}/return-to-service` | POST | `aircraft.manage` :539 | Admin only |
| `/api/v1/aircraft/{id}/rates` | GET / POST | `aircraft.manage` rates.service.ts:219 / `settings.manage` :190 | Writes lock the Aircraft row `FOR UPDATE` |
| `/api/v1/bookings` | GET (+xlsx) | `self.read` bookings.service.ts:815-816 | Filtering by another `personId` without `bookings.read.names` returns 403 (:819). Others' rows are masked (:257-260), but `personId`, `forcedAt` and `?status=` leak (S-6) |
| `/api/v1/bookings` | POST | `bookings.manage.any`, else `.own` :609-611 | Self-booking needs an active pilot or instructor profile. Booking for someone else needs an active instructor, the actor's own `instructorProfileId`, and a target with an active student profile. `force` is admin only. A non-admin booking is created PENDING |
| `/api/v1/bookings/calendar` | GET | `self.read` :888-889 | Same mask, and no `personId` filter, so no 403 guard (S-6) |
| `/api/v1/bookings/{id}` | PATCH | `.any`, else `.own` :1052-1055 | Own means own person or own instructor profile, future bookings only (:962-980). `personId` and the instructor are immutable. **Status is kept** (S-5) |
| `/api/v1/bookings/{id}/cancel` | POST | `.any`, else `.own` :1202 | Same own and timing rule |
| `/api/v1/bookings/{id}/transition` | POST | `bookings.manage.any` :1331 | Admin only. APPROVED re-checks person, profile, aircraft and overlap |
| `/api/v1/bookings/pdf` | GET | via `listBookings` | Same scoping and mask. Up to 2,000 rows for any role (S-3) |
| `/api/v1/cash-categories` | GET / POST | `finance.manage` cash.service.ts:86 / `settings.manage` :109 | Admin only |
| `/api/v1/cash-categories/{id}` | PATCH / DELETE | `settings.manage` :132 / :229 | Admin only |
| `/api/v1/cash-categories/{id}/deactivate`, `/reactivate` | POST | `settings.manage` :191 / :206 | Admin only |
| `/api/v1/cash-movements` | GET (+xlsx) / POST | `finance.manage` :523 / :356 | Admin only. Optional idempotency key |
| `/api/v1/cash-movements/{id}` | PATCH | `finance.manage` :490 | Admin only |
| `/api/v1/cash-movements/{id}/reverse` | POST | `finance.manage` :416 | Guarded `updateMany` plus unique `reversalOfId` |
| `/api/v1/cash-report`, `/cash-report/pdf` | GET | `finance.manage` :623 | Admin only |
| `/api/v1/expiries` | GET (+xlsx) / POST | `expiries.manage` expiries.service.ts:564 / :196 | Admin only. Registry SQL is parameterized |
| `/api/v1/expiries/{id}` | PATCH / DELETE | `expiries.manage` :274 / :327 | Admin only. DELETE is physical (ops F11) |
| `/api/v1/expiries/pdf` | GET | `expiries.manage` via `listAllExpiries` | Admin only |
| `/api/v1/expiry-alerts/trigger` | POST | `settings.manage` in the route | Admin only |
| `/api/v1/expiry-types` | GET / POST | `expiries.manage` expiry-types.service.ts:113 / `settings.manage` :144 | Admin only |
| `/api/v1/expiry-types/{id}` | PATCH / DELETE | `settings.manage` :200 / :256 | Admin only |
| `/api/v1/flights` | GET (+xlsx) | `flights.manage`, else `self.read` + own scope (`authorizeFlightsQuery`, flights.service.ts:1470) | Non-admins see only rows where they are the person or the instructor. A filter on another person or instructor returns 403 |
| `/api/v1/flights` | POST | `flights.manage` :1150 | Admin only. Optional idempotency key |
| `/api/v1/flights/{id}` | PUT / DELETE | `flights.manage` :1357 / :1305 | Locks Flight, then Aircraft, then Account (19.6 hard delete) |
| `/api/v1/flights/pdf` | GET | via `listFlights` | Same scope |
| `/api/v1/instructor-compensation` | GET (summary, `?personId`, xlsx) | `finance.manage` instructor-compensation.service.ts:213 / :393 | Admin only. Instructors use the own-only page reader (:325, no id parameter) |
| `/api/v1/instructor-compensation/{personId}/rate` | PUT | `payouts.manage` :532 | Admin only |
| `/api/v1/instructor-payouts` | POST | `payouts.manage` :467 | Idempotency key required |
| `/api/v1/people` | GET (+xlsx) / POST | `people.read` people.service.ts:182 / `people.manage` :464 (+`users.manage` :472) | Admin only. Returns email, phone and address |
| `/api/v1/people/{id}` | GET | `people.read`, else `self.read` with an own-id check before the query (:335-339) | No existence oracle |
| `/api/v1/people/{id}` | PATCH | `people.manage` :615 (+ per-block permissions) | Admin only |
| `/api/v1/people/{id}/archive`, `/unarchive` | POST | `people.manage` :772 / :792 | The linked User keeps access (S-12) |
| `/api/v1/people/{id}/profiles/{type}` | PUT | `people.manage` :928 | **The body is parsed before authorization and without the cap** (S-9) |
| `/api/v1/people/{id}/profiles/{type}/deactivate` | POST | `people.manage` :957 | Admin only |
| `/api/v1/people/{id}/expiries` | GET | `expiries.manage`, else `self.read` + own (expiries.service.ts:125-129) | Checked before the query |
| `/api/v1/people/{id}/instructor-rates` | GET / POST | `people.read` instructor-rates.service.ts:166 / `settings.manage` :130 | Admin only |
| `/api/v1/people/{id}/membership-fee` | POST | `finance.manage` membership.service.ts:88 | Account `FOR UPDATE`. Idempotency key required |
| `/api/v1/people/{id}/account` | GET | `assertReadAccess` accounts.service.ts:99-105,118 | `people.read`, or `self.read` with a matching `personId` |
| `/api/v1/people/{id}/account/movements` | GET (+xlsx) | `assertReadAccess` :359 | "Recorded by" email only with `people.read` |
| `/api/v1/people/{id}/account/pdf` | GET | via `listAccountMovements`, `getAccountOverview`, `getPerson` | Same own rule |
| `/api/v1/people/{id}/account/top-ups` | POST | `finance.manage` :198 | Admin only. Overview read inside the transaction |
| `/api/v1/people/{id}/account/adjustments` | POST | `finance.manage` :596 | Account `FOR UPDATE`. Original movement checked under the lock |
| `/api/v1/settings/airfield` | GET / PUT | [session] / `settings.manage` app-settings.service.ts:453 | Branding only |
| `/api/v1/settings/club` | GET / PUT | [session] / `settings.manage` :106, :130 | GET exposes the ICAO code and the club contact email to every role (acceptable) |
| `/api/v1/settings/currency` | GET / PUT | [session] / `settings.manage` :440 | Untracked route file (19.8 work in progress) |
| `/api/v1/settings/membership-fee` | GET / PUT | `finance.manage` :355 / `settings.manage` :373 | Admin only |
| `/api/v1/settings/metar-station` | GET / PUT | [session] / `settings.manage` :327 | Not sensitive |
| `/api/v1/settings/scheduling` | GET / PUT | [session] / `settings.manage` :191 | Opening hours only |
| `/api/v1/settings/smtp` | GET / PUT | `settings.manage` :232 / :255 | GET returns `hasPassword` only |
| `/api/v1/settings/smtp/test-email` | POST | `settings.manage` smtp-test-email.service.ts:21 | Fixed recipient (club contact email); returns `{sent}` only |
| `/api/v1/settings/treasury` | PUT | `settings.manage` :543 | Admin only |
| `/api/v1/settings` (19.8, untracked) | PATCH | `settings.manage` settings.service.ts:140 | The body goes through `bodySchema: z.unknown()`, so the 64 KB cap applies. It is then strictly re-parsed, and SMTP uses the same schema and encrypted write as the PUT |
| `/api/v1/stats` | GET | `finance.manage` stats.service.ts:136 | Admin only |
| `/api/v1/transactions` | GET (+xlsx) / POST | `finance.manage` transactions.service.ts:394; POST delegates to top-up, adjustment or cash movement, each of which authorizes | Idempotency key required |
| `/api/v1/users` | POST | `users.manage` users.service.ts:126 | Admin only |
| `/api/v1/users/{id}` | PATCH | `users.manage` :153 | Accepts only roles, locale, `personId` and `isActive`. No `tokenVersion` bump on a `personId` change (F8). The last-admin guard is racy (S-11) |
| `/api/v1/users/{id}/resend-invite` | POST | `users.manage` :204 | Admin only. Only when no password is set |

**Pages under `src/app/[locale]/dashboard/**`.**

- **Session:** every page and the layout call `getSessionActor()` and redirect to `/login` when there is no session. This also covers paths containing a dot, which skip the proxy matcher.
- **Role gate:** each page re-applies its gate server-side, for example `finance.manage` for billing and reports, and `settings.manage` for settings. Hiding entries in `NAV_ITEMS` is cosmetic only.
- **Data access:** there is no direct Prisma call in `src/app/[locale]` or `src/components`.
- **Client props:** the only leak is the same `personId` on masked rows on the bookings page (`bookings/page.tsx:392`, S-6). The settings page sends `hasPassword` only, both in HEAD and in the 19.8 work in progress. The linked-user block reaches the client only with `people.manage`.

---

## 4. New findings

### S-1 — High — VERIFIED version / SUSPECTED exploitability — vulnerable runtime dependencies (Next.js, next-auth, nodemailer, zod)

**Location:** `package.json:31-39`: `next` 16.2.10, `next-auth` 5.0.0-beta.31, `nodemailer` 9.0.3, `zod` 4.4.3.

**What.** `npm audit --omit=dev` reports 28 advisories: 3 critical, 12 high, 13 moderate. I fetched the descriptions of the plausibly applicable ones from the GitHub advisory API and checked each precondition against the code:

| Advisory | Applies here? | Why |
|---|---|---|
| Next **GHSA-m99w-x7hq-7vfj** (fixed in 16.2.11) and **GHSA-p3m5-59mp-jv5r** (fixed in 16.4.1): crafted requests to an App Router app with at least one Server Action cause excessive CPU and block the process | **Yes** | The dashboard layout defines a `'use server'` logout action (`src/app/[locale]/dashboard/layout.tsx`). The advisories describe these as unauthenticated, with no workaround besides upgrading. |
| Next **GHSA-955p-x3mx-jcvp**: Server Action IDs disclosed to unauthenticated users | Yes, low impact | The only action is logout. |
| next-auth **GHSA-xmf8-cvqr-rfgj**: `getToken()` throws on a malformed `Authorization: Bearer` header when no session cookie is present | **Yes** | `src/proxy.ts:91` calls `getToken` for every `/api/v1` and page request without try/catch. An unauthenticated request with a bad percent-encoding in the bearer value gets an unhandled exception and a 500 instead of a 401. This is per request: availability noise, not an auth bypass. |
| nodemailer `<=10.1.3`: address-parser misrouting; quadratic SMTP reply, AUTH-regex and DKIM parsing; DNS-cache TLS servername reuse | Partly | Recipients come from admin-entered, Zod-validated emails, and the SMTP server is admin-configured. Impact is limited to an admin's own misconfiguration, or MITM-driven DoS when security is `NONE` on the LAN. |
| zod `<4.6.6`: memory exhaustion on oversized constrained collections | Low | JSON bodies are capped at 64 KB, except S-9. |
| next-auth **GHSA-8fpg-xm3f-6cx3** (fail-open when `auth` holds an error object) | No | `getSessionActor` requires `session?.user` (`src/server/auth/session.ts`), and the proxy uses `getToken`, not the `auth()` wrapper. |
| Next **GHSA-6gpp-xcg3-4w24** (proxy bypass) | No | It needs a single `config.i18n.locales` entry. There is no `i18n` in `next.config.ts`, and pages enforce auth themselves anyway. |
| Image-optimizer RCE/SSRF | No | No `next/image`, no `images` config, no `public/` directory. |
| `next/og`, `use cache`, rewrites, custom server, ISR advisories | No | None of these features is used. |
| Email-provider and OAuth advisories | No | Credentials provider only. |

Dev and CLI-only chains are not runtime-reachable: prisma CLI pulls `hono`, `mysql2`, `fast-uri` and `deepmerge-ts`; `exceljs` pulls `archiver` and `glob`; `next` pulls build-time `postcss`, `nanoid` and `source-map-js`.

**Scenario.** An unauthenticated client on the LAN or the internet sends crafted Server Action requests and pins the single Node process. Every user's dashboard stops responding.

**Fix.**

- Upgrade `next` to at least 16.4.4, the `npm audit` target, which covers both Server Actions advisories.
- Upgrade `next-auth` to 5.0.0-beta.32. Until then, wrap the proxy's `getToken` in try/catch and treat a throw as "no token".
- Upgrade `nodemailer` to the first patched release above 10.1.3. This is a major version bump, so retest the SMTP adapter.
- Upgrade `zod` to at least 4.6.6.

**Confidence.** The vulnerable versions and preconditions are verified. No proof of concept was run, and the advisory texts post-date my own knowledge, so I took their descriptions at face value.

### S-2 — Medium — VERIFIED (library code traced and simulated in node, not in a browser) — open redirect after login via control characters in `callbackUrl`

**Location:** `src/app/[locale]/(auth)/login/page.tsx:65` (guard), `login-form.tsx:65` (`router.push(callbackUrl)` with `next/navigation`).

**What.** The guard is `/^\/(?![/\\])/`. It rejects `//host` and `/\host` but accepts `/\t/evil.example`, `/\n/evil.example` and `/\r/evil.example`. The WHATWG URL parser strips ASCII tab, LF and CR. Next 16.2.10 then does the following:

1. `dispatchNavigateAction` builds `new URL(addBasePath(href), location.href)` (`node_modules/next/dist/client/components/app-router-instance.js:219`), which resolves to `http://evil.example/`.
2. `isExternalURL` is true.
3. `navigateReducer` calls `completeHardNavigation` (`navigate-reducer.js:34-35`).
4. That sets `canonicalUrl` to the external `href` with `mpaNavigation: true` (`segment-cache/navigation.js:261-271`), and the browser follows with `location.assign`.

The 2026-07-22 audit listed this guard as clean.

**Evidence.**

```text
callbackUrl=%2F%09%2Fevil.example
{ callbackUrl: '/\t/evil.example', guardOk: true, resolved: 'http://evil.example/', isExternal: true }
```

This is the output of the fork's script, which I re-ran (`scratchpad/audit/forkB/chain.cjs`).

**Scenario.** A member who is logged out receives a link to the club's real login page with this `callbackUrl`. After a successful login they land on an attacker page styled as "session expired, re-enter your password". This is credential phishing that borrows the real site's trust, admins included.

**Fix.** Parse the value against a fixed origin. Accept it only if the origin matches and the raw string has no control characters or backslashes, then pass on `pathname + search + hash`:

```ts
const u = new URL(cb, 'http://x.invalid');
const ok = u.origin === 'http://x.invalid' && !/[\u0000-\u001f\\]/.test(cb);
```

Add unit cases for `%09`, `%0A`, `%0D`, `/\t\\` and `//`.

### S-3 — Medium — VERIFIED code, cost taken from the perf report — any authenticated user can monopolize the Node process with exports

**Location:**

- `src/server/services/exports.service.ts:61,64,703-704`: `PDF_EXPORT_MAX_ROWS = 2_000`, `EXPORT_MAX_ROWS = 10_000`.
- `src/server/adapters/pdf/document.tsx:158`: in-process `renderToBuffer`.
- `bookings.service.ts:816`: `listBookings` needs only `self.read`.

**What.** `GET /api/v1/bookings/pdf` and `GET /api/v1/bookings?format=xlsx` are open to every role, STUDENT included. There is no per-user rate limit, no concurrency cap and no worker thread. The perf audit measured react-pdf at 16-70 ms of CPU per row and states that each PDF occupies the Node process for its full duration (`audit-2026-09-10/perf-load-report.md:174-177`): 11.5 s for 124 booking rows, 40 s for 559 expiry rows. The cap rejects requests above 2,000 rows, so the attacker simply narrows `from`/`to` until the matching set falls just under it.

**Scenario.** A student, or a stolen low-privilege session, loops `GET /api/v1/bookings/pdf?from=…&to=…` with a range just under 2,000 approved bookings. Each request burns roughly 30-140 s of main-thread CPU. Two or three parallel loops make the app unusable for everyone, including flight registration and billing.

**Fix.**

- Short term: lower the PDF cap to about 300 rows, and add a per-user or global concurrency limit with 429 for PDF and xlsx exports.
- Structural: move to a streaming PDF engine at about 1 ms per row, which is perf plan item 8, or render in a worker or job.

### S-4 — Medium — VERIFIED — the METAR fetch has no timeout and no single-flight, and the dashboard layout awaits it on every page

**Location:** `src/server/services/metar.service.ts:111` (bare `fetch`), `:131-145` (the cache is written only after the fetch settles), `src/app/[locale]/dashboard/layout.tsx:94`, `dashboard/page.tsx:229`. This is already tracked as TD 19.7b-e.

**What.** There is no `AbortSignal` and no in-flight deduplication, and `getMetar` is awaited in the layout for every role and every dashboard route. A slow or blackholed `aviationweather.gov` holds each render until undici's default header timeout of about 300 s. Every concurrent navigation during a cache miss starts its own fetch. A failure is cached as `null` for 10 minutes, after which the cycle repeats. A nonexistent station costs about 16 s per cycle, per the handoff.

**Who can trigger it.** The upstream service or an admin's station choice. No low-privilege trigger exists, and there is no SSRF: the host is fixed and the station is `encodeURIComponent`-ed, admin-set, and at most 10 characters.

**Scenario.** The upstream service degrades during a busy Saturday, and no dashboard page renders for anyone until it recovers.

**Fix.**

- Add `signal: AbortSignal.timeout(3000)`.
- Keep a per-station in-flight promise map.
- Stream the weather card behind `<Suspense>` instead of awaiting it in the layout.

### S-5 — Medium — VERIFIED — an owner can move an APPROVED booking and it stays APPROVED

**Location:** `src/server/services/bookings.service.ts:1052-1068` (own path), `:1162-1171`:

```ts
const guard = await tx.booking.updateMany({
  where: { id: bookingId, status: existing.status },
  data: { aircraftId: nextAircraftId, startsAt: nextStartsAt, endsAt: nextEndsAt, notes: nextNotes, updatedByUserId: actor.userId },
});
```

**What.** A PILOT, or an INSTRUCTOR for their own or their student's booking, can change aircraft, day and duration of an APPROVED booking. The status is never reset to PENDING, so the admin's approval silently transfers to a different booking.

What still applies: overlap, opening hours, aircraft state and the expiry check on a day change.

What does not apply: the human approval step that story 12.2 introduced. Its AC 3 limits `PENDING → APPROVED` to `bookings.manage.any`, while AC 4 only says "editable from PENDING and APPROVED" and says nothing about status.

**Scenario.** A pilot requests a cheap 30-minute local slot, which gets approved. They then PATCH it to the club's busiest aircraft on a weekend morning for four hours. It shows as APPROVED and blocks everyone else from that slot.

**Fix (needs a PO decision).** For actors without `bookings.manage.any`, choose one:

- Reset `status: 'PENDING'` and clear `decidedAt`/`decidedByUserId` whenever the aircraft, start or end changes.
- Or forbid own-path edits of APPROVED bookings and allow cancel only.

### S-6 — Medium — VERIFIED — the booking mask leaks more than ops F6 recorded: `personId`, `forcedAt`, and others' DENIED/CANCELLED rows

**Location:** `bookings.service.ts:257-260` (mask), `:815-831` (`listBookings`, where `status` comes from the query), `:888` (calendar). The page sends the same rows to the client at `src/app/[locale]/dashboard/bookings/page.tsx:392`. All of this is in HEAD.

```ts
return { ...booking, personName: null, instructorProfileId: null, instructorName: null, notes: null, denyReason: null };
```

**What.** Ops F6 is still open: masked rows keep `personId`. Two more leaks were not in F6:

- **`forcedAt` is not masked.** It is set only when an admin overrode a blocking expired document (for example the medical) for that person's booking.
- **`?status=PENDING,DENIED,CANCELLED`** is honoured for every role, so a PILOT or STUDENT lists everyone's denied and cancelled requests, keyed by `personId`.

The 403 on the `personId` filter (`:819`) is therefore moot. The OpenAPI schema documents `personId` as non-null (`src/lib/schemas/bookings.ts:149`), so the leak is part of the documented contract.

**Scenario.** In a club of a few dozen members, mapping a stable id to a name is trivial: one shared slot or one face at the airfield is enough. A student then reconstructs a member's schedule, their denied requests, and the fact that they flew past an expired document. That last point is regulatory-sensitive and medical-adjacent.

**Fix.**

- Story 16.7's AD-1: set `personId: null` in the mask, make the schema field nullable, and treat null as "not own" in `bookings-table.tsx`.
- Also null `forcedAt`.
- Restrict `status` to `APPROVED` for actors without `bookings.read.names`.
- Switch the unit tests to exact `toEqual`.

### S-7 — Low — VERIFIED (code) — login throttle keys are attacker-steerable: a re-armable account lockout and a spoofable IP lockout

**Location:** `src/server/auth/login-throttle.ts:25,33,93-118`; `auth.ts:35` and `src/lib/api/client-ip.ts:8-14` (first `x-forwarded-for` entry).

**What.** 10 failed attempts lock an identifier for 15 minutes after the last counted failure, for every IP. The correct password is refused while locked, because the reservation check runs before the verify. An attacker who knows a member's email can keep that account locked indefinitely with 10 requests every 15 minutes. Separately, behind a proxy that forwards a client-supplied XFF, an attacker can attribute 30 failures to the club's NAT IP and lock out everyone behind it.

**Scenario.** The admin's email, often the club contact address, is kept permanently locked. Existing sessions keep working, but a logged-out admin cannot get in.

**Fix.**

- Make the identifier lock IP-aware, for example lock (identifier, IP) pairs and apply a much higher global identifier cap.
- Alternatively, let a correct password through on a different IP after a progressive delay.
- Derive the IP from a trusted proxy hop, not the first XFF entry.
- This is related to the accepted D-D residual, but the targeted lockout itself is not recorded as accepted.

### S-8 — Low — VERIFIED (code; burst not executed) — forgot-password throttle is check-then-insert, and the throttle tables are unbounded

**Location:** `src/server/services/auth-tokens.service.ts:32-52` (two `count()` calls), `:63-65` and `:147-151` (separate `create()`, no lock or transaction).

**What.** This is the same shape as ops F12, which measured 8 parallel requests writing 7 rows against a cap of 5. A parallel burst against one email passes the 3-per-hour cap N times. Each pass issues a token (invalidating the previous one) and sends a reset email. Separately:

- `PasswordResetAttempt` rows are written for any email, including unknown ones.
- `LoginAttempt` rows are written for any identifier.
- Neither table has a retention job.

With rotating emails, and with no XFF (`ip` null skips the per-IP check), an unauthenticated client can grow both tables without limit. `LoginAttempt` growth is the accepted D-D; `PasswordResetAttempt` growth is new and cheaper, because it involves no Argon2.

**Scenario.** A burst of 50 concurrent requests for the treasurer's email delivers dozens of reset emails at once and keeps invalidating the legitimate link. It can be repeated every hour.

**Fix.** Reuse `reserveLoginAttempt`'s idiom: `pg_advisory_xact_lock(hashtext('pwreset:'||email))` around count and insert. Add a periodic purge of rows older than the window, for example in the existing cron job.

### S-9 — Low — VERIFIED — `PUT /people/{id}/profiles/{type}` reads an uncapped body before authorization

**Location:** `src/app/api/v1/people/[id]/profiles/[type]/route.ts:34`:

```ts
const raw: unknown = await request.json().catch(() => null);
```

Authorization comes only afterwards, in `upsertProfile` (`people.service.ts:928`).

**What.** The route declares no `bodySchema`, so `apiRoute`'s 64 KB streaming cap (`handler.ts:385-397`) never runs. Any authenticated STUDENT can make the server buffer and `JSON.parse` a multi-MB body before getting the 403. This partially regresses M5.

Possibly related, SUSPECTED and not measured: with a proxy present, Next 16 itself buffers request bodies up to `experimental.proxyClientMaxBodySize`, 10 MB by default. If so, that is the effective ceiling for this route, and Next pre-buffers up to that size even on routes where the 64 KB cap applies.

**Fix.**

- Use `bodySchema: z.unknown()` and dispatch on `type` afterwards, as the new settings PATCH does. Or call `authorize(actor, 'people.manage')` before reading the body.
- Consider `experimental.proxyClientMaxBodySize: '128kb'`.

### S-10 — Low — VERIFIED (schema executed plus getaddrinfo) — the SMTP host SSRF guard is bypassable with non-canonical literals

**Location:** `src/lib/schemas/settings.ts`, `isDisallowedSmtpHost` (line 146 in HEAD; the dirty diff only adds lines).

**What.** `smtpSettingsInputSchema` accepts hosts that resolve to loopback or to the metadata address:

| Accepted host | Resolves to |
|---|---|
| `127.1` | `127.0.0.1` (via getaddrinfo) |
| `0177.0.0.1` | `127.0.0.1` |
| `169.254.43518` | `169.254.169.254` |
| `LOCALHOST.` | `::1` and `127.0.0.1` |
| `::ffff:7f00:1`, `::127.0.0.1` | loopback (valid IPv6 literals; nodemailer connects to them directly) |

`100.64.0.0/10` is also allowed. Plain `localhost` is allowed only because it equals `env.SMTP_HOST`, which is a documented exemption.

**Scenario.** An admin, or a stolen admin session, points SMTP at `169.254.43518:80` or `127.1:<port>` and presses "send test email". The result is a blind TCP probe: only `{sent}` comes back, and the recipient is fixed.

**Fix.** Resolve at send time with `dns.lookup(host, {all:true})` and check each address with a CIDR library, for example `ipaddr.js` `range() !== 'unicast'`. Then connect to the vetted IP with `tls.servername = host`. Or drop the claim from the comments and record this as accepted residual L1.

### S-11 — Low — VERIFIED — the last-admin guard is racy

**Location:** `src/server/services/users.service.ts:167-176` (`count`), `:182-190` (`update`). They are separate statements with no transaction or lock.

**Scenario.** Two admins demote or deactivate each other at the same moment. Both counts see one other admin, both updates commit, and the club has zero active admins. Recovery then needs direct DB access.

**Fix.** Put the count and update in one transaction under `pg_advisory_xact_lock(<constant>)`, or `SELECT … FOR UPDATE` the active admin rows.

### S-12 — Low — VERIFIED (documented design choice) — archiving a person leaves their login, roles and instructor powers intact

**Location:** `people.service.ts:771-788`. The doc-comment says "A `User` still linked to this person keeps its access unchanged".

**What.** An archived instructor keeps `bookings.read.names`, so they still see every booking with names, notes and deny reasons. They can also still create bookings for students: the cross-person path checks the actor's instructor profile, never whether the actor's person is archived (`bookings.service.ts:639-651`).

**Scenario.** An instructor leaves the club, the admin archives them, and they keep reading the full schedule.

**Fix (PO decision).** Either:

- deactivate the linked User when archiving, with the last-admin guard, or bump `tokenVersion` and refuse login when the person is archived;
- or document that archive is not offboarding and add an explicit "revoke access" step in the UI.

### S-13 — Low — VERIFIED mechanics / SUSPECTED exploitability — CSRF defense rests solely on `SameSite=Lax`

**Location:** `src/lib/api/handler.ts:116-164`: `readJsonBodyCapped` runs `JSON.parse` on any body regardless of `Content-Type`. There is no `Origin` or `Sec-Fetch-Site` check anywhere (searched `src/lib/api`, `src/proxy.ts` and `src/app/api`). The session cookie is `SameSite=Lax` (`@auth/core/lib/utils/cookie.js:48-54`) and is not `Secure` over the LAN HTTP deployment.

**What.** A cross-site attacker cannot ride the cookie, because Lax blocks it on cross-site POSTs. A same-site attacker can, and SameSite ignores ports. That covers any other HTTP service on the same host IP, or a sibling subdomain if the club later uses `app.club.it` next to other `*.club.it` sites. Such an attacker can send:

- a `<form enctype="text/plain">` whose name/value pair forms valid JSON, for example `{"amountCents":50000,…,"x":"=…"}`, which Zod then strips;
- or a `no-cors` simple `fetch`.

Either drives every state-changing endpoint, including bodiless ones like `/people/{id}/archive` or `/bookings/{id}/cancel`.

**Fix.** In `apiRoute`, for non-GET methods, require `Content-Type: application/json` for body routes, and reject a request whose `Origin` (or `Sec-Fetch-Site: cross-site`/`same-site`) does not match `APP_URL`'s origin. That costs about 10 lines and protects every route at once.

### S-14 — Info — VERIFIED — an instructor can read any student's blocking-document types and dates through a failing booking

**Location:** `bookings.service.ts:687-718` (instructor-for-student path) and `:455-477` (`findBlockingExpiredDocuments`).

**What.** The 422 `EXPIRED_DOCUMENTS` response carries `details.documents[]` with `{typeName, expiresAt}`, medical included. `startsAt` has no upper bound, so a far-future date makes every document "expired". Pairing it with an out-of-hours slot means the booking never gets created. This works for every active student, not only the instructor's own.

**Why Info.** Instructors arguably need this information. If not, drop `expiresAt` from `details` for non-admins and cap the booking horizon.

### S-15 — Info — VERIFIED — the SMTP transport has no `socketTimeout`

**Location:** `src/server/adapters/mail/smtp-mail-sender.ts:36-44`. Only the connection and greeting timeouts are set, at 10 s each, so nodemailer's default 10-minute socket timeout applies.

**What.** `createUser`, `createPerson` and `resendInvite` await the invite email inside the admin's request. A stalling SMTP server can hold those requests for up to 10 minutes.

**Fix.** Set `socketTimeout: 20_000`.

### S-16 — Info — VERIFIED (Auth.js source) — JWT sessions slide for 30 days and logout does not revoke them

**Location:** `node_modules/@auth/core/lib/actions/session.js:33-50`. Every session read re-signs the JWT with a fresh `maxAge` of 30 days (`init.js:38`).

**What.** The ops audit described the session as "30 days absolute". In fact a stolen cookie never expires while it keeps being used. Logout clears only the local cookie. The only revocations are a password set, which bumps `tokenVersion`, or deactivation, both effective within 15 minutes. This refines the accepted D-C residual.

**Fix.** Add a "log out all sessions" control that bumps `tokenVersion`, and make logout bump it too. Consider `session.maxAge` of about 7 days.

### S-17 — Info — VERIFIED — stale `/ppr` entry in `PUBLIC_WEB_PATHS`

**Location:** `src/proxy.ts:13`. The page was removed in story 19.1 and the path now returns 404. A future `/ppr` page would become public without anyone deciding that. Remove the entry.

### S-18 — Info — VERIFIED — several admin-entered strings have no `.max()`

**Location:**

- `src/lib/schemas/people.ts:18-22,31-35`: names, phone, address.
- `src/lib/schemas/people.ts:123-124`: licence number and type.
- `src/lib/schemas/aircraft.ts:61-63,79-81`: registration, type, model.

**What.** These fields are bounded only by the 64 KB body cap. They are rendered into PDFs, xlsx files and email subjects. This is a layout and robustness issue, not injection: nodemailer strips CR and LF from headers.

**Fix.** Add `.max(100-200)`.

---

## 5. Checked and OK

- **Injection:** all `$queryRaw`/`$executeRaw` calls are tagged templates with bound values. That covers login-throttle `hashtext(${identifier})`, currency, cash, the accounts/membership/flights/bookings locks, and the 19.7b registry CTE with its filters, `LIMIT`/`OFFSET` and `ILIKE` escaped with `ESCAPE '\'`. There is no `$queryRawUnsafe`, `Prisma.raw` or user-controlled identifier or `ORDER BY`.
- **XSS:**
  - No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` in `src/`.
  - No `mailto:`/`tel:`/`href` built from DB strings.
  - `target=_blank` links carry `rel="noopener noreferrer"`.
  - Emails are text-only.
- **Excel and PDF:** formula neutralization covers every cell. Filenames are static, so there is no `Content-Disposition` injection. The PDFs have no remote resources.
- **Email links:** reset and invite URLs are built from `env.APP_URL`, not from the Host header, so host-header poisoning is not possible.
- **Tokens and passwords:**
  - Tokens are 32 bytes of `randomBytes`, stored as SHA-256 hashes.
  - Single use is enforced by an atomic `updateMany` claim.
  - TTL is 2 h for reset and 7 d for invite, and issuing a token invalidates earlier ones of the same type.
  - Passwords are Argon2id with m=19456 KiB, t=2, p=1 (the OWASP minimum), 10 to 256 characters, with no breached-password check (Info).
- **Login:**
  - Login and forgot-password give no enumeration signal in their responses.
  - The login timing is equalized with a dummy Argon2 hash, also on the locked path.
  - Auth.js double-submit CSRF protects the credentials callback.
  - Logout is a Server Action, protected by Next's Origin check, and there is no GET logout.
- **Sessions:**
  - The JWT carries `userId`, `roles`, `personId` and `tokenVersion`.
  - Roles, active status and `tokenVersion` are re-verified at most every 15 minutes, on API and page paths alike.
  - The edge proxy only checks that a token exists, and is never the only guard.
  - Paths containing a dot skip the proxy, but the dashboard layout and pages still redirect when there is no session.
- **Mass assignment:**
  - No service spreads a request body into Prisma `data`.
  - User PATCH accepts only roles, locale, `personId` and `isActive`, admin only.
  - Booking PATCH cannot change `personId`, instructor or status.
  - Schemas strip unknown keys by default. There is no `.passthrough()`, `.loose()` or `z.any()`. The only `z.unknown()` is the 19.8 PATCH, which re-parses strictly.
- **Input bounds:**
  - Money inputs are integer and positive, with a max of 2,147,483,647 or signed with a max.
  - `pageSize` is capped at 100.
  - Takeoffs and landings are capped at 1 to 500.
  - Currency settings are bounded to 1-99 and 1-3650.
- **Money concurrency:**
  - Adjustments and the membership fee lock the Account `FOR UPDATE`.
  - Flight register, update and delete lock Flight, then Aircraft, then Account, in a deterministic order.
  - Cash reversal uses a guarded `updateMany` plus the unique `reversalOfId`.
  - Payouts, transactions and the membership fee require an idempotency key.
  - The idempotency gate is per user and fingerprinted. Records created before a 403 are freed.
- **Existence oracles:** own-access checks run before any query, so there is no 403-vs-404 oracle on people, accounts or expiries. Booking conflict 409s carry no details for aircraft conflicts. They name only the requested person's or instructor's own booking.
- **Secrets:**
  - `.env` is gitignored.
  - The SMTP GET returns only `hasPassword`, in HEAD and in the 19.8 work in progress.
  - AES-GCM is used correctly: random 12-byte IV, tag verified, HKDF-SHA256 with a purpose-specific info string.
  - The legacy-cleartext passthrough in `decryptSecret` is only reachable with DB write access. After an `AUTH_SECRET` rotation the SMTP password has to be re-entered (Info).
  - `internalErrorResponse` returns a generic 500 and logs the error server-side.
  - No passwords, tokens or bodies are logged; nodemailer redacts credentials.
- **Jobs:** the bearer check is timing-safe on sha256 digests. An unset `JOBS_SECRET` returns 500, so the route fails closed. The job is idempotent per threshold.
- **Pages:**
  - Every dashboard page re-applies its role gate server-side.
  - There is no direct Prisma call in pages or components.
  - Instructor pickers go only to `bookings.read.names` holders, and the people roster only to `bookings.manage.any` holders.
  - The pilot and instructor landing pages filter to own data.
  - The logbook drops `personId`, `aircraftId` and `personQuery` filters for non-managers.
- **Security headers:** see M3 in section 2. `allowedDevOrigins` affects `next dev` only.
- **OpenAPI:** the registry matches the runtime DTOs for bookings, so the leak in S-6 is part of the documented contract. `/api/v1/openapi.json` is public by design (recon value only).

---

## 6. Open questions and assumptions

1. **S-5:** should an owner's edit of an APPROVED booking go back to PENDING, or should owners only be allowed to cancel? This is a PO decision; it was not ratified in 12.2.
2. **S-12:** is "archive person" meant to offboard someone, ending their access, or only to hide them from lists?
3. **S-6 and F6:** does the PO still intend to ship 16.7 as written? It should also null `forcedAt` and restrict `status` for non-names actors.
4. **Deployment:** is production behind a TLS reverse proxy that sets a trusted client IP and caps body size? If yes, S-7 (IP part), S-9 (corollary), S-13 and D-C/D-D shrink. If production stays plain HTTP on a LAN IP, S-13's same-host precondition and D-C matter more.
5. **S-1:** I relied on the published GitHub advisory texts, which post-date my own knowledge, and did not reproduce them. The Server Actions DoS needs only one action, and this app has one.
6. **Assumption:** severity reflects a single small club with a few dozen members and one admin or a handful of admins. That makes insider (STUDENT/PILOT) misuse and id-to-name mapping realistic, and multi-tenant concerns irrelevant.
7. **Concurrent work:** the working tree changed during the audit; another session is editing e2e specs. No finding depends on those files. Every finding exists in HEAD `a598b26`, and none is in a dirty file except the untracked 19.8 settings route, which I checked and found consistent with the per-section PUTs.

Scratch evidence: `scratchpad/audit/forkB/chain.cjs` (open-redirect simulation), `scratchpad/audit/forkC/ssrf.ts` (SMTP guard probe), `scratchpad/audit/npm-audit.json`.
