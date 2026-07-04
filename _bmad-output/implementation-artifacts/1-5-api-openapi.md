# Story 1.5: Infrastruttura API v1 con OpenAPI

Status: ready-for-dev

## Story

As a sviluppatore del futuro client Flutter,
I want API REST versionate, validate e documentate,
so that il mobile consumi le stesse funzionalità del web (FR-42).

## Acceptance Criteria

1. **Given** gli schemi Zod registrati nel registry OpenAPI, **When** richiedo `GET /api/v1/openapi.json`, **Then** ricevo la spec OpenAPI 3.x generata dal codice, che include gli endpoint esistenti (`health`, `me`, `users*`, `auth/set-password`, `auth/forgot-password`) con request/response tipizzate e security scheme di sessione.
2. **Given** un input non valido su un endpoint `/api/v1/*`, **When** lo invio, **Then** ricevo 422 con envelope `{"error":{"code":"VALIDATION_ERROR","message":...,"details":...}}` conforme ad AD-8 — e ogni errore inatteso produce 500 con envelope `{"error":{"code":"INTERNAL_ERROR",...}}` senza stack trace (chiude il deferred F2 della review 1.3).
3. Un helper di paginazione standard `{items,total,page,pageSize}` è disponibile e testato; le date nel wire format sono ISO 8601 UTC.

## Tasks / Subtasks

- [ ] Task 1: Helper API condiviso (AC: 2)
  - [ ] `src/lib/api/handler.ts` (o `src/server/api/handler.ts`): wrapper per route handlers che: valida body/query/params con schemi Zod, invoca il service, serializza la risposta, mappa `DomainError` → HTTP (403/404/422/409) e qualsiasi altro errore → 500 `INTERNAL_ERROR` con envelope AD-8, log server-side senza leak al client
  - [ ] Refactor delle route esistenti (`me`, `users`, `users/[id]`, `users/[id]/resend-invite`, `auth/set-password`, `auth/forgot-password`, `health`) per usare il wrapper — comportamento e test esistenti invariati (i mapping locali spariscono)
- [ ] Task 2: Registry OpenAPI (AC: 1)
  - [ ] `@asteasolutions/zod-to-openapi` 8.5.x: registry in `src/lib/schemas/registry.ts`; registra schemi request/response e path esistenti con tags, summary, error responses standard (401/403/404/422/409/500) e security scheme (cookie di sessione `authjs.session-token` + nota che il client mobile userà lo stesso JWT)
  - [ ] `GET /api/v1/openapi.json`: genera la spec (OpenAPI 3.1 se supportato, altrimenti 3.0) dal registry a runtime; endpoint pubblico (aggiungi a `PUBLIC_API_PATHS`) — la spec non espone dati, solo contratti
- [ ] Task 3: Paginazione e formati (AC: 3)
  - [ ] `src/lib/api/pagination.ts`: schema query `page`/`pageSize` (default 1/20, max 100) + tipo risposta `{items,total,page,pageSize}`; adotta l'helper in `GET /api/v1/users` (già paginato, allinea la forma)
  - [ ] Verifica/normalizza serializzazione date: tutte le risposte API emettono ISO 8601 UTC (Prisma Date → toISOString; test su un endpoint con date)
- [ ] Task 4: Test (AC: tutti)
  - [ ] Unit: wrapper (DomainError→status corretti; errore generico→500 envelope senza message interno; zod fail→422 con details), pagination helper (default, clamp, forma risposta)
  - [ ] e2e/integration: `GET /api/v1/openapi.json` → 200, spec valida (parse JSON, `openapi` version presente, path attesi presenti); input invalido su `POST /api/v1/users` → 422 envelope; errore forzato → 500 envelope

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

### Debug Log References

### Completion Notes List

### File List
