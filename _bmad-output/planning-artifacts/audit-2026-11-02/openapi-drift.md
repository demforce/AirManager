OpenAPI registry vs real REST API: drift audit at HEAD a598b26 (read-only)
==========================================================================

The registry matches the routes almost exactly: no stale entries, no path-parameter mismatches. The drift is in documented error responses and one idempotency header.

METHOD
Parsed HEAD route files and src/lib/schemas/registry.ts with scripts (cmp.py, parse_reg.py, reg.json). Compiled HEAD sources in a scratch TS project (tsproj/, Prisma client regenerated from HEAD schema in scratch, node_modules symlinked, nothing written to the repo) and ran a type-level diff of each sampled service's return type against its registered schema (keys, null/optional flags, enum literal sets; NOT int vs float or string formats -- timestamp formats checked separately, all z.iso.datetime). Read mappers for spreads that could leak extra fields at runtime. No runtime response validation exists anywhere (no schema.parse of outputs).

COUNTS
- 70 v1 route files, 93 exported methods (92 via apiRoute, 1 hand-rolled: jobs/expiry-alerts POST). profiles/[type] expands to 3 literal paths -> 97 path+method operations.
- Non-v1: only src/app/api/auth/[...nextauth]/route.ts (re-exports Auth.js GET/POST), unregistered by design. No route.ts outside src/app/api.
- Registry: 96 registerPath calls, 73 unique paths.
- Route methods missing from registry: 1 -- GET /api/v1/openapi.json (self-endpoint, Low).
- Stale registry entries (no route): 0.
- Path-param naming mismatches: 0. {id}<->[id], {personId}<->[personId]; [type] enumerated as pilot/student/instructor = profileTypeSchema (src/lib/schemas/people.ts:117).
- Config parity over 92 apiRoute exports: querySchema 0 mismatches, bodySchema 0, success status 0 (13x201, 3x204), public/auth security 0; idempotency header 1 mismatch (transactions).

10 SAMPLED ROUTES (all VERIFIED: both sides read, type diff run)
| Route                      | Service / mapper                                      | Field drift                  | Error drift |
| GET /people                | people.service.ts:181, toListItem:115                 | none                         | none |
| GET /flights               | flights.service.ts:1554, toListItem:248               | none (actorEmail optional ok)| none |
| POST /bookings             | bookings.service.ts:608 -> {booking,warnings}, toListItem:200 | none (201 ok)        | none: 403/404/409/422 all thrown and documented |
| GET /aircraft/{id}         | aircraft.service.ts:174, toListItem:64                | none                         | none |
| GET /expiries              | expiries.service.ts:563, toRegistryItem:519           | none; 19.7b fields + description current | none |
| GET /people/{id}/account   | accounts.service.ts:117                               | none                         | 404 MISSING: thrown accounts.service.ts:123-126; registry lists only 401/403 (registry.ts:579) |
| GET /stats                 | stats.service.ts:135, explicit literals               | none                         | none |
| GET+PUT /settings/club     | inline literal club/route.ts:21,32                    | none                         | none |
| GET /bookings/pdf          | exports.service.ts:703                                | n/a (binary)                 | none (EXPORT_TOO_LARGE 422, exports.service.ts:75, documented); Content-Disposition undocumented (Low) |
| DELETE /flights/{id}       | flights.service.ts:1304                               | n/a (204 ok)                 | none (403/404/409 at :1305/:1311/:1282) |
Request-body parity holds on every sampled route. Stats/transactions service types derive from the schemas (schemas/stats.ts:110, schemas/transactions.ts:78) so the type diff is tautological there; code read instead: explicit literals, internal createdAt stripped by stripInternal (transactions.service.ts:366).

OTHER FINDINGS
1. Medium, VERIFIED -- POST /api/v1/transactions documents a required header as optional. Route rejects requests without Idempotency-Key with 422 IDEMPOTENCY_KEY_REQUIRED (src/app/api/v1/transactions/route.ts:30-33); registry references optional idempotencyKeyHeader (registry.ts:903) instead of requiredIdempotencyKeyHeader. Only the description says MANDATORY. A generated client (planned Flutter app) will omit it and fail every call.
2. Medium, VERIFIED -- registry test does not enforce route coverage. registry.test.ts:19-93 is a hand list of 66 paths with arrayContaining: no methods, no filesystem walk. 7 registered paths absent from it: aircraft/{id}/out-of-service-impact, bookings/{id}/transition, instructor-compensation, instructor-compensation/{personId}/rate, instructor-payouts, stats, transactions. A new route.ts with no registry entry passes CI (precedent: story 12.11 shipped 9 unregistered routes, registry.ts:303-305). Only other check: e2e/api-v1.spec.ts:31-40 (7 paths).
3. Medium, VERIFIED -- 413 PAYLOAD_TOO_LARGE (src/lib/api/handler.ts:391-396) undocumented on all 39 body-validated routes; errorResponses only accepts 401|403|404|409|422 (registry.ts:334), so it cannot be documented.
4. Low, VERIFIED -- POST /people/{id}/membership-fee missing 409: idempotency layer returns 409 IDEMPOTENCY_IN_PROGRESS (handler.ts:259-263); registry lists 401/403/404/422 (registry.ts:1768). The other 6 idempotent routes document 409.
5. Low, VERIFIED -- POST /auth/set-password documents a 404 it never returns (registry.ts:1204); service throws only ValidationError/422 (auth-tokens.service.ts:197,212).
6. Low, VERIFIED -- PUT /instructor-compensation/{personId}/rate description cites nonexistent PUT /api/v1/people/{id}/instructor-rates (registry.ts:1816); that route exports only GET/POST (people/[id]/instructor-rates/route.ts:14,18).
7. Low, VERIFIED -- response headers not modeled: Idempotency-Replayed and export Content-Disposition (src/server/adapters/pdf/response.ts:16) appear only in description text.
8. Low/Medium, VERIFIED (security-adjacent) -- PUT /people/{id}/profiles/{type} reads body via raw request.json() (profiles/[type]/route.ts:34), bypassing the 64 KB cap (handler.ts:103,391); authenticated users only. For audit-security.

INLINE-LITERAL RESPONSES (no shared DTO mapper; all match their registered schemas)
- settings/club (:21,:32), settings/membership-fee (:11,:16), settings/metar-station (:11,:16)
- health {status:'ok'} (:13)
- {ok:true} on 7 routes: auth/forgot-password:23, auth/set-password:15, cash-categories/[id]/deactivate:9, cash-categories/[id]/reactivate:9, cash-categories/[id] DELETE:21, users/[id]/resend-invite:9, people/[id]/profiles/[type]/deactivate:16
- jobs/expiry-alerts hand-rolled outside apiRoute (:32-49)
