---
baseline_commit: d4ddd6570adfc0b719d960a1ca6147a8542ad20a
---

# Story 1.5: Infrastruttura API v1 con OpenAPI

Status: review

## Story

As a sviluppatore del futuro client Flutter,
I want API REST versionate, validate e documentate,
so that il mobile consumi le stesse funzionalità del web (FR-42).

## Acceptance Criteria

1. **Given** gli schemi Zod registrati nel registry OpenAPI, **When** richiedo `GET /api/v1/openapi.json`, **Then** ricevo la spec OpenAPI 3.x generata dal codice, che include gli endpoint esistenti (`health`, `me`, `users*`, `auth/set-password`, `auth/forgot-password`) con request/response tipizzate e security scheme di sessione.
2. **Given** un input non valido su un endpoint `/api/v1/*`, **When** lo invio, **Then** ricevo 422 con envelope `{"error":{"code":"VALIDATION_ERROR","message":...,"details":...}}` conforme ad AD-8 — e ogni errore inatteso produce 500 con envelope `{"error":{"code":"INTERNAL_ERROR",...}}` senza stack trace (chiude il deferred F2 della review 1.3).
3. Un helper di paginazione standard `{items,total,page,pageSize}` è disponibile e testato; le date nel wire format sono ISO 8601 UTC.

## Tasks / Subtasks

- [x] Task 1: Helper API condiviso (AC: 2)
  - [x] `src/lib/api/handler.ts` (o `src/server/api/handler.ts`): wrapper per route handlers che: valida body/query/params con schemi Zod, invoca il service, serializza la risposta, mappa `DomainError` → HTTP (403/404/422/409) e qualsiasi altro errore → 500 `INTERNAL_ERROR` con envelope AD-8, log server-side senza leak al client
  - [x] Refactor delle route esistenti (`me`, `users`, `users/[id]`, `users/[id]/resend-invite`, `auth/set-password`, `auth/forgot-password`, `health`) per usare il wrapper — comportamento e test esistenti invariati (i mapping locali spariscono)
- [x] Task 2: Registry OpenAPI (AC: 1)
  - [x] `@asteasolutions/zod-to-openapi` 8.5.x: registry in `src/lib/schemas/registry.ts`; registra schemi request/response e path esistenti con tags, summary, error responses standard (401/403/404/422/409/500) e security scheme (cookie di sessione `authjs.session-token` + nota che il client mobile userà lo stesso JWT)
  - [x] `GET /api/v1/openapi.json`: genera la spec (OpenAPI 3.1 se supportato, altrimenti 3.0) dal registry a runtime; endpoint pubblico (aggiungi a `PUBLIC_API_PATHS`) — la spec non espone dati, solo contratti
- [x] Task 3: Paginazione e formati (AC: 3)
  - [x] `src/lib/api/pagination.ts`: schema query `page`/`pageSize` (default 1/20, max 100) + tipo risposta `{items,total,page,pageSize}`; adotta l'helper in `GET /api/v1/users` (già paginato, allinea la forma)
  - [x] Verifica/normalizza serializzazione date: tutte le risposte API emettono ISO 8601 UTC (Prisma Date → toISOString; test su un endpoint con date)
- [x] Task 4: Test (AC: tutti)
  - [x] Unit: wrapper (DomainError→status corretti; errore generico→500 envelope senza message interno; zod fail→422 con details), pagination helper (default, clamp, forma risposta)
  - [x] e2e/integration: `GET /api/v1/openapi.json` → 200, spec valida (parse JSON, `openapi` version presente, path attesi presenti); input invalido su `POST /api/v1/users` → 422 envelope; errore forzato → 500 envelope

## Dev Notes

- **AD-8 è il contratto**: envelope esatto `{error:{code,message,details?}}`; codici stabili SCREAMING_SNAKE; niente stack trace o messaggi interni nel 500 (`message` generico, dettagli solo nel log server).
- **AD-1**: gli schemi Zod in `src/lib/schemas/` restano la fonte unica: request/response degli endpoint esistenti vanno definiti/riusati lì (login.ts, users già esistenti — estendi senza duplicare).
- **zod-to-openapi 8.5.x con Zod 4**: verifica l'API corrente su raw.githubusercontent.com (`asteasolutions/zod-to-openapi` README/docs) — l'integrazione Zod 4 è recente, non fidarti della memoria.
- **Non fare**: nuovi endpoint di dominio (arrivano con gli epic 2+), niente Swagger UI (basta il JSON; una UI si valuterà più avanti), niente auth con bearer token mobile (verrà quando servirà il client Flutter).
- **Pattern**: DomainError (1.3), envelope nel proxy e nelle route 1.4; mantieni le route sottilissime — la logica sta nel wrapper e nei service.
- Mailpit per gli e2e: binario `/root/go/bin/mailpit` (porte 1025/8025), PostgreSQL via `service postgresql start`.
- **Gate**: lint, typecheck, test, build, test:e2e verdi.

### Project Structure Notes

- Nuovi: `src/lib/api/{handler,pagination}.ts` (o `src/server/api/` se preferisci lato server — scegli e documenta), `src/lib/schemas/registry.ts`, route `src/app/api/v1/openapi.json/route.ts`.
- Aggiornate: tutte le route `/api/v1/*` esistenti (refactor al wrapper), `src/proxy.ts` (PUBLIC_API_PATHS + openapi.json).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-1, #AD-8, Consistency Conventions]
- [Source: _bmad-output/implementation-artifacts/1-3-rbac.md#Review Record] — F2 deferred da chiudere qui
- [Source: _bmad-output/implementation-artifacts/1-4-user-management.md#Review Record] — route e pattern correnti

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 via BMAD dev-story

### Debug Log References

- `npm run lint` (ESLint) — pass (0 errors; one transient "unused eslint-disable directive" warning in `handler.test.ts` fixed by removing the now-unnecessary disable comment)
- `npm run typecheck` (`tsc --noEmit`) — pass (one issue found+fixed: test fixtures for `SessionActor.roles` inferred as `readonly ["ADMIN"]` via `as const`, incompatible with the mutable `Role[]` field — fixed by typing the fixture as `SessionActor` instead of asserting `as const`)
- `npm run test` (Vitest) — 135/135 passed (99 pre-existing + 36 new: `handler.test.ts` 17, `pagination.test.ts` 12, `registry.test.ts` 5, `users/route.test.ts` 2)
- `npm run build` (`next build`) — pass; `/api/v1/openapi.json` present alongside every existing route
- `npm run test:e2e` (Playwright) — **NOT executed this session**: the sandbox's Bash safety-classifier became unavailable partway through this run (every script-executing command, e.g. `npm run *`, started failing with "temporarily unavailable... cannot determine the safety of Bash"; read-only commands like `git`/`grep` kept working throughout). It never recovered despite 40+ retries over ~90 minutes. `npm run lint`/`typecheck`/`test`/`build` had already all been confirmed green, on this exact final code, before the outage began. `npm run test:e2e` was never successfully executed even once in this session — **this is the one DoD gate NOT verified**. The reviewer/user must run it before merging (`service postgresql start`, ensure Mailpit is up on 1025/8025, then `npm run test:e2e`). By static review, the new `e2e/api-v1.spec.ts` follows the exact login-helper/selector patterns already proven passing in `e2e/rbac.spec.ts`/`e2e/user-management.spec.ts` (same `getByLabel('Email')`/`getByRole('button', { name: 'Accedi' })`/dashboard-redirect wait), but that is not a substitute for actually running it.
- `npx prisma migrate deploy` — no pending migrations (this story adds no Prisma models)

### Completion Notes List

- **⚠️ Reviewer: `npm run test:e2e` was not executed this session** (sandbox tooling outage — see Debug Log). Everything else (lint, typecheck, 135/135 unit+integration tests, build) is green on the final code. Please run the e2e suite before/while reviewing.
- **Shared wrapper (Task 1)**: `src/lib/api/handler.ts#apiRoute()` builds a Next.js route handler from a declarative config (`auth: 'required' | 'public'`, `querySchema`, `bodySchema`, `successStatus`, `handle`). It resolves the session actor (skippable via `auth: 'public'`), validates query/body with Zod (422 `VALIDATION_ERROR` + `z.flattenError` details on failure), calls `handle`, serializes the result, and maps any thrown `DomainError` to its AD-8 status (403/404/422/409) or, for anything else, to a safe 500 `INTERNAL_ERROR` envelope — logging the real error server-side via `console.error` first (closes story 1.3 review F2). The `actor` type in `handle`'s arguments is conditionally `SessionActor` vs `SessionActor | null` based on the `auth` mode (a TS conditional type keyed off the literal `TAuth` type parameter), so `auth: 'required'` routes never need a non-null assertion on `actor`.
- **Route refactor (Task 1)**: all seven existing `/api/v1/*` routes (`health`, `me`, `users` GET/POST, `users/[id]` GET/PATCH, `users/[id]/resend-invite`, `auth/set-password`, `auth/forgot-password`) now export `GET`/`POST`/`PATCH` built with `apiRoute(...)` — every per-route `statusForDomainError`/`unauthenticatedResponse`/`validationErrorResponse` local duplicate (deliberately introduced in 1.3/1.4 pending this story) is gone. Behavior is unchanged: same status codes, same envelope shape, same success payloads — verified by the full pre-existing test suite staying green.
- **OpenAPI registry (Task 2)**: `src/lib/schemas/registry.ts` builds an `OpenAPIRegistry`, registers a `cookieAuth` security scheme (`apiKey`/`cookie`/`authjs.session-token`, documented as the JWT the future Flutter client will resend as a bearer token), registers named component schemas (`Error`, `Ok`, `Me`, `User`, `UserList`, `CreateUserRequest`, `UpdateUserRequest`, `SetPasswordRequest`, `ForgotPasswordRequest`), and registers all 8 paths with tags/summaries and the standard AD-8 error responses (401/403/404/409/422 as applicable + always 500). `generateOpenApiDocument()` uses `OpenApiGeneratorV31` (OpenAPI 3.1, per the Dev Notes' "3.1 se supportato"). `GET /api/v1/openapi.json` (`src/app/api/v1/openapi.json/route.ts`) is a one-line `apiRoute({ auth: 'public', handle: () => generateOpenApiDocument() })`, added to `PUBLIC_API_PATHS` in `src/proxy.ts`.
- **Response schemas added, not duplicated (Task 2, AD-1)**: request schemas (`createUserSchema`, `updateUserSchema`, `setPasswordSchema`, `forgotPasswordSchema`, `listUsersQuerySchema`) were already the single source of truth from 1.3/1.4 and are reused as-is. Response shapes that had no prior Zod schema (services returned plain TS types) got new, documentation-only companions: `userListItemSchema`/`userListResponseSchema` in `users.ts`, `meResponseSchema` in the new `me.ts`, plus a new `common.ts` for the shared `errorEnvelopeSchema`/`okResponseSchema`. These do not change runtime validation (the services' TS return types remain authoritative) — they exist solely so the registry has something to register and generate a typed response schema from.
- **Deviation — `extendZodWithOpenApi` not used (Task 2)**: verified against the actually-installed `@asteasolutions/zod-to-openapi@8.5.0` + `zod@4.4.3` (not from memory, per the Dev Notes) that `extendZodWithOpenApi(z)` patches `ZodType.prototype` at call time and has **no effect on schemas already constructed** before the call — `registry.register()` itself calls `.openapi()` internally, so this broke every domain schema imported into `registry.ts` (they're built at import time in `users.ts`/`auth-tokens.ts`/`me.ts`, before `registry.ts`'s own top-level code could run the extension). Fixed by adding `src/lib/schemas/zod-with-openapi.ts`, a thin re-export that runs `extendZodWithOpenApi` as its own module-load side effect; every schema file that the registry registers (`common.ts`, `me.ts`, `users.ts`, `auth-tokens.ts`, and `src/lib/api/pagination.ts`'s `paginatedResponseSchema` helper) now imports `z` from there instead of `'zod'` directly, which guarantees correct ordering regardless of which route imports which schema file first (ES module imports are always evaluated before the importing module's own top-level code, so the extension is guaranteed to have already run before any of these files call `z.object(...)`). `login.ts` (never registered) is untouched. This is flagged for the reviewer as a non-obvious library/Zod-version interaction worth double-checking independently.
- **Pagination (Task 3)**: `src/lib/api/pagination.ts` adds `paginationQuerySchema` (page ≥1 default 1, pageSize 1-100 default 20), `paginate()` (builds `{items,total,page,pageSize}`), `paginationOffset()` (`skip`/`take` for Prisma), and `paginatedResponseSchema(itemSchema)` (the OpenAPI-side counterpart of `paginate`'s shape, generic over the item schema). `listUsersQuerySchema` in `users.ts` now just re-exports `paginationQuerySchema` instead of redefining the same two fields; `users.service.ts#listUsers` now calls `paginationOffset(query)`/`paginate(...)` instead of hand-computing `skip`/`take` and building the envelope manually — behavior is identical (verified by the pre-existing `users.service.test.ts` suite staying green unmodified).
- **Date serialization (Task 3, AC 3)**: no code change was needed — `Date` → `JSON.stringify` (used by `NextResponse.json`) already calls `Date.prototype.toJSON()`, which returns `toISOString()` (UTC, `Z` suffix) natively. Added `createdAt: z.iso.datetime()` to `userListItemSchema` for documentation, and a new e2e assertion (`e2e/api-v1.spec.ts`) regex-checks a real `GET /api/v1/users` response's `createdAt` values against `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`.
- **Tests (Task 4)**: `src/lib/api/handler.test.ts` (17 tests) covers auth required/public, query/body validation → 422 with details, dynamic params pass-through, success status/serialization, every `DomainError` subtype → its AD-8 status, and unexpected errors (generic `Error`, a thrown string) → 500 `INTERNAL_ERROR` with no message leak, plus a `console.error` server-side log assertion. `src/lib/api/pagination.test.ts` (12 tests) covers defaults, coercion, clamping, `paginate`/`paginationOffset`, and `paginatedResponseSchema` validation. `src/lib/schemas/registry.test.ts` (5 tests) asserts the generated document is valid OpenAPI 3.x, includes every existing path, documents the cookie security scheme, and documents the full 401/403/404/409/422/500 response set on a representative endpoint. `src/app/api/v1/users/route.test.ts` (2 tests, integration) exercises the **real** `route.ts` module (not a stand-in) with `users.service` mocked at its boundary: one confirms the 422 envelope end-to-end through the actual route, the other forces `listUsers` to reject with a generic `Error` and asserts the real route answers 500 `INTERNAL_ERROR` with the underlying message never appearing in the response body (this is this story's "errore forzato → 500 envelope" check — see the Deviation note below for why it's an integration test rather than a live e2e request). `e2e/api-v1.spec.ts` (4 Playwright tests) covers `GET /api/v1/openapi.json` unauthenticated → 200 valid spec with expected paths and the `cookieAuth` security scheme, `POST /api/v1/users` invalid body → 422 (as an authenticated admin, through a live server), an unauthenticated `/api/v1/users` request → 401 through the shared wrapper, and the ISO-8601-UTC date-format check on live data.
- **Deviation — the "forced 500" check is a Vitest integration test, not a live Playwright e2e request**: the story's Task 4 asks for an "e2e/integration" test forcing a 500. Triggering a *genuine* unhandled failure through a running HTTP server would require something like crashing the DB connection mid-request — fragile, environment-dependent, and exactly the kind of flakiness this story's tests shouldn't introduce. Instead, `src/app/api/v1/users/route.test.ts` imports the real, un-mocked `route.ts` and wraps only the service-layer call (`listUsers`) with a mock that rejects — every other real module (the route, `apiRoute`, the AD-8 mapping) executes for real. Flagged for the reviewer as the interpretation taken for that bullet.

### File List

- `package.json`, `package-lock.json` — modified (added `@asteasolutions/zod-to-openapi@^8.5.0`)
- `src/lib/api/handler.ts` — new (`apiRoute()` shared wrapper, AD-8 envelope helpers)
- `src/lib/api/handler.test.ts` — new (17 unit tests)
- `src/lib/api/pagination.ts` — new (`paginationQuerySchema`, `paginate`, `paginationOffset`, `paginatedResponseSchema`)
- `src/lib/api/pagination.test.ts` — new (12 unit tests)
- `src/lib/schemas/zod-with-openapi.ts` — new (`extendZodWithOpenApi` side-effect wrapper; see Deviation note)
- `src/lib/schemas/registry.ts` — new (OpenAPI registry + `generateOpenApiDocument()`)
- `src/lib/schemas/registry.test.ts` — new (5 unit tests)
- `src/lib/schemas/common.ts` — new (`errorEnvelopeSchema`, `okResponseSchema`)
- `src/lib/schemas/me.ts` — new (`meResponseSchema`)
- `src/lib/schemas/users.ts` — modified (`listUsersQuerySchema` reuses `paginationQuerySchema`; added `userListItemSchema`/`userListResponseSchema`; `z` now imported from `zod-with-openapi`)
- `src/lib/schemas/auth-tokens.ts` — modified (`z` now imported from `zod-with-openapi`)
- `src/server/services/users.service.ts` — modified (`listUsers` uses `paginationOffset`/`paginate`; `UserListResult` is now `PaginatedResult<UserListItem>`)
- `src/app/api/v1/health/route.ts` — modified (uses `apiRoute`)
- `src/app/api/v1/me/route.ts` — modified (uses `apiRoute`; local `DomainError` mapping removed)
- `src/app/api/v1/users/route.ts` — modified (uses `apiRoute`; local mapping removed)
- `src/app/api/v1/users/route.test.ts` — new (2 integration tests, incl. the "forced 500" check)
- `src/app/api/v1/users/[id]/route.ts` — modified (uses `apiRoute`; local mapping removed)
- `src/app/api/v1/users/[id]/resend-invite/route.ts` — modified (uses `apiRoute`; local mapping removed)
- `src/app/api/v1/auth/set-password/route.ts` — modified (uses `apiRoute`, `auth: 'public'`; local mapping removed)
- `src/app/api/v1/auth/forgot-password/route.ts` — modified (uses `apiRoute`, `auth: 'public'`)
- `src/app/api/v1/openapi.json/route.ts` — new (`GET`, public, serves `generateOpenApiDocument()`)
- `src/proxy.ts` — modified (`/api/v1/openapi.json` added to `PUBLIC_API_PATHS`)
- `e2e/api-v1.spec.ts` — new (4 e2e tests: openapi.json spec, 422 on invalid create, 401 unauthenticated, ISO-8601 UTC dates)

## Change Log

- 2026-07-04/05 — Story 1.5 implemented (shared `apiRoute()` wrapper closing 1.3's F2 deferral, OpenAPI 3.1 registry + `GET /api/v1/openapi.json`, shared pagination helper adopted by `GET /api/v1/users`, ISO 8601 UTC dates verified). All seven pre-existing `/api/v1/*` routes refactored onto the wrapper with no behavior change. 36 new unit/integration tests + 4 new e2e tests. Status → review.
