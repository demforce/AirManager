---
baseline_commit: 477f563fbc456c4107830d50f8f87a359ad570f7
---

# Story 1.1: Scaffold del progetto e ambiente di sviluppo

Status: done

## Review Record

- **Reviewer**: claude-opus via BMAD code-review (adversarial, 2026-07-04)
- **Verdict**: APPROVE WITH FIXES — 4 low findings, all fixed by the orchestrator:
  1. `src/lib/money.ts` doc example contradicted CLDR grouping behavior → example corrected.
  2. `src/i18n/request.ts` missing `timeZone` → now returns `Europe/Rome` (via `APP_TIMEZONE`).
  3. Unused `localeLabel` key removed from both message catalogs.
  4. `next/font/google` build-time network fetch (CI risk with restrictive egress) → replaced with self-hosted `geist` npm package for sans + system serif stack.
- **Deviation approved**: `src/proxy.ts` instead of `middleware.ts` (Next 16 renamed the convention). Note for story 1.2: Next 16 allows a single proxy file — the Auth.js middleware must be composed inside `src/proxy.ts` together with next-intl's `createMiddleware`.
- **Post-fix gates**: lint ✔, typecheck ✔, test 34/34 ✔, build ✔, e2e 4/4 ✔.
- Open environment caveat: `docker compose up -d` not verifiable in this sandbox (Docker Hub CDN blocked); compose file reviewed as correct, validated against local PostgreSQL 16.

## Story

As a sviluppatore del team,
I want un progetto Next.js 16 avviabile con database, i18n e strumenti di qualità configurati,
so that ogni story successiva parta da fondamenta funzionanti e verificabili.

## Acceptance Criteria

1. **Given** un checkout pulito del repository, **When** eseguo `docker compose up -d` e `npm run dev`, **Then** l'app si avvia su localhost con una pagina di benvenuto servita su `/it` e `/en` tramite next-intl (routing `[locale]`), **And** PostgreSQL 16 e Mailpit girano via docker-compose e `npx prisma migrate dev` applica una migrazione iniziale minima.
2. **Given** il progetto scaffoldato, **When** eseguo `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, **Then** tutti e quattro terminano con successo (Vitest con almeno un test di fumo; Playwright configurato con un e2e di fumo eseguibile con `npm run test:e2e`), **And** la struttura cartelle rispecchia il Structural Seed dello spine.

## Tasks / Subtasks

- [x] Task 1: Scaffold Next.js (AC: 1, 2)
  - [x] `create-next-app` (TypeScript, Tailwind, ESLint, App Router, src-dir, alias `@/*`) **dentro la root del repo esistente** (l'app vive nella root, non in una sottocartella)
  - [x] Ripulire la home di default; struttura cartelle come da spine (vedi Dev Notes)
- [x] Task 2: i18n con next-intl (AC: 1)
  - [x] Routing `src/app/[locale]/` con `locale ∈ {it, en}`, default `it`, cataloghi `messages/it.json` e `messages/en.json`
  - [x] Pagina di benvenuto localizzata (titolo AirManager + descrizione) su `/it` e `/en`; redirect `/`→`/it`
- [x] Task 3: Database e Prisma (AC: 1)
  - [x] `docker-compose.yml` nella root: `postgres:16` (porta 5432, volume) + `axllent/mailpit` (porte 1025/8025)
  - [x] Prisma 7 con datasource postgres via `DATABASE_URL`; primo modello minimo `AppSetting { id, key unique, value, updatedAt }` e migrazione iniziale
  - [x] Client singleton in `src/server/db/prisma.ts`
  - [x] `.env.example` completo + validazione env con zod in `src/lib/env.ts` (fail-fast al boot)
- [x] Task 4: Qualità e test (AC: 2)
  - [x] Script npm: `dev`, `build`, `lint`, `typecheck`, `test` (vitest run), `test:e2e` (playwright)
  - [x] Vitest 4 configurato per unit test (`*.test.ts` accanto al codice); un test di fumo reale (es. helper `src/lib/money.ts: formatCents`)
  - [x] Playwright con un e2e di fumo: apre `/it`, verifica il titolo; e uno per `/en`
  - [x] `README.md` aggiornato con setup dev (docker compose, migrate, dev, test)

## Dev Notes

- **Ambiente**: Node 22, Docker disponibile. PostgreSQL 16 anche come binari locali, ma usa docker-compose. **Chromium per Playwright è preinstallato** (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`): NON eseguire `playwright install`; se serve, usa `executablePath: '/opt/pw-browsers/chromium'`.
- **Versioni verificate su npm il 2026-07-04** (usa queste, non conoscenza pregressa): next 16.2.10, react 19.2.7, prisma/@prisma/client 7.8.0, next-intl 4.13.1, tailwindcss 4.3.2, zod 4.4.3, vitest 4.1.9, @playwright/test 1.61.1, typescript 6.0.3. In caso di dubbio sulle API (Prisma 7 generator, next-intl 4 setup con Next 16, Tailwind 4 senza tailwind.config): consulta la doc ufficiale via WebFetch su raw.githubusercontent.com (es. `vercel/next.js` → `docs/`, `prisma/docs`, `amannn/next-intl` → `docs/`). `curl` verso siti doc NON funziona in questo ambiente.
- **Architettura vincolante** (spine AD-1, AD-8): strati `src/app` (sottile) → `src/server/services` → `src/server/db`; in questa story crea le cartelle (`services/`, `adapters/`, `lib/schemas/`) anche se quasi vuote, con un README di una riga ciascuna. Envelope errori e helper API arrivano nella story 1.5 — non anticiparli.
- **NFR-5**: crea subito `src/lib/money.ts` (formatCents/parseCents, EUR) e `src/lib/time.ts` (minuti↔hh:mm) con test — sono il test di fumo Vitest e serviranno ovunque.
- **i18n**: nessuna stringa hardcoded nella pagina di benvenuto; tutto nei cataloghi.
- **UI**: layout minimale pulito (skill `minimalist-ui` per il look della pagina di benvenuto: monocromo caldo, tipografia, niente gradienti).
- **Cosa NON fare**: niente Auth.js (story 1.2), niente RBAC (1.3), niente shadcn/ui per ora se non necessario, nessun modello di dominio oltre AppSetting.

### Project Structure Notes

Struttura target (dal Structural Seed dello spine — creala ora):

```
prisma/schema.prisma, prisma/seed.ts (stub)
messages/it.json, messages/en.json
src/app/[locale]/(pagina benvenuto, layout)
src/app/api/v1/ (vuota con .gitkeep o health minimale)
src/server/{auth,db,services,adapters}/
src/lib/{schemas,money.ts,time.ts,env.ts}
e2e/ (playwright)
docker-compose.yml
```

I file BMAD (`_bmad/`, `_bmad-output/`, `.claude/`, `CLAUDE.md`, `docs/`) esistono già nella root: **non toccarli** e non farli entrare in lint/build (configura ignore se serve).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#Structural Seed, #Stack, #Design Paradigm]
- [Source: CLAUDE.md#Convenzioni] — commit in inglese, lint+typecheck+test+build verdi prima del commit

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 via BMAD dev-story

### Debug Log References

- `npm run lint` — pass (0 errors, 0 warnings)
- `npm run typecheck` (`tsc --noEmit`) — pass
- `npm run test` (Vitest) — 34/34 passed (`src/lib/money.test.ts`, `src/lib/time.test.ts`)
- `npm run build` (`next build`) — pass; routes `/it`, `/en` prerendered as SSG, `/_not-found` static, proxy (middleware) present
- `npm run test:e2e` (Playwright, Chromium at `/opt/pw-browsers/chromium`) — 4/4 passed (`e2e/welcome.spec.ts`)
- `npx prisma migrate dev --name init` — verified twice from a clean DB (dropped + recreated the database and re-ran), reproducible
- Boot fail-fast verified manually: started `next start` with `DATABASE_URL=""` → server refused to come up, threw `Invalid environment configuration: DATABASE_URL must be a valid connection string` from `src/instrumentation.ts` → `src/lib/env.ts`

### Completion Notes List

- Scaffolded Next.js 16.2.10 (App Router, TypeScript, Tailwind 4, ESLint, `src/` dir, `@/*` alias) directly into the existing repo root via `create-next-app` in a scratch directory (npm rejects a project name with capital letters when run in-place against `AirManager/`), then merged the generated files in by hand, preserving `_bmad/`, `_bmad-output/`, `.claude/`, `CLAUDE.md`, `docs/` untouched and merging `.gitignore` (added `next-env.d.ts`, `*.tsbuildinfo`, `/src/generated/`) instead of overwriting it.
- next-intl 4.13.1 i18n routing: `src/i18n/{routing,navigation,request}.ts`, `src/proxy.ts` (see deviation note below), `messages/{it,en}.json`, `src/app/[locale]/{layout,page}.tsx`. Welcome page fully localized (namespaces `Metadata`, `HomePage`), no hardcoded user-facing strings, styled per the `minimalist-ui` skill (warm monochrome `#FBFBFA`/`#2F3437`/`#EAEAEA`, Geist Sans + Newsreader serif heading via `next/font/google`, no gradients/shadows). `routing.localeDetection: false` so `/` always redirects to `/it` regardless of the browser's `Accept-Language` (matches the AC wording literally and makes the e2e redirect test deterministic).
- Prisma 7.8.0 setup differs materially from Prisma 5/6 knowledge — verified live via a scratch install + `prisma init`/`prisma generate` before writing schema code: (1) config now lives in `prisma.config.ts` (`defineConfig` from `prisma/config`, loads `DATABASE_URL` via `dotenv/config`), not `datasource.url = env(...)` in the schema; (2) the `prisma-client` generator emits plain `.ts` source (no compiled `.js`/`.d.ts`, no package.json) to a custom `output` path — pointed it at `src/generated/prisma` (gitignored, regenerated by the `postinstall` script) so it's reachable via the existing `@/*` alias; (3) `PrismaClient` now requires an explicit driver adapter (no bare `datasourceUrl` option) — added `@prisma/adapter-pg` + `pg` and wired `new PrismaPg(env.DATABASE_URL)` in `src/server/db/prisma.ts` and `prisma/seed.ts`. Migration engine (CLI) still reads the connection string from `prisma.config.ts` independently of the adapter.
- `src/lib/money.ts` (`formatCents`/`parseCents`, integer cents, EUR via `Intl.NumberFormat`) and `src/lib/time.ts` (`formatMinutes`/`parseMinutes`, plus `formatTimeOfDay`/`APP_TIMEZONE = 'Europe/Rome'` for timestamp presentation) with 34 Vitest unit tests total — the story's designated smoke test. Note: Node's ICU renders it-IT currency as `"<amount> €"` (non-breaking space) and omits thousands grouping below 10 000 (CLDR `minimumGroupingDigits`) — both confirmed empirically and asserted explicitly in the tests rather than assumed.
- `src/lib/env.ts` validates `DATABASE_URL`/`NODE_ENV` with Zod 4 at import time; `src/instrumentation.ts` (`register()`) imports it so an invalid/missing `DATABASE_URL` crashes the server at boot in both dev and `next start`, not just on first DB access — verified manually (see Debug Log).
- Structural Seed folders created empty-but-real per Dev Notes: `src/lib/schemas/`, `src/server/services/`, `src/server/adapters/`, `src/server/auth/` (one-line `README.md` each — no Auth.js/RBAC/domain logic added, per "Cosa NON fare"), `src/app/api/v1/.gitkeep` (left empty; no error envelope/health route added since that's story 1.5's scope).
- `docker-compose.yml`: `postgres:16` (named volume, healthcheck) + `axllent/mailpit`, matching `.env.example` credentials.
- **Deviation — `src/proxy.ts` instead of `src/middleware.ts`**: `next build` on Next.js 16.2.10 emits `"The 'middleware' file convention is deprecated. Please use 'proxy' instead"`. Renamed the file (same `createMiddleware(routing)` export from `next-intl/middleware`, which is unaffected by the Next.js-level rename) to ship without a deprecation warning baked into the scaffold; not a story requirement but a same-version correction, low risk.
- **Environment limitation — Docker Hub unreachable in this sandbox**: `docker compose up -d` was actually run and fails here with `CONNECT tunnel failed, response 403` to `production.cloudfront.docker.com` (Docker Hub's layer/blob CDN, not just the registry API) — confirmed as an org egress-policy denial via the agent-proxy status endpoint, not a code defect. `docker-compose.yml` itself is correct and will pull fine in an environment with normal Docker Hub access. To actually exercise `prisma migrate dev`, the app, and the Playwright e2e suite in *this* sandbox, I started the local PostgreSQL 16 cluster already present at `/usr/lib/postgresql/16` (per `CLAUDE.md`) and created a role/database matching the docker-compose credentials (`airmanager`/`airmanager`/`airmanager` on `localhost:5432`) so `.env`/`.env.example` need no sandbox-specific changes. Mailpit is unused by any code in this story, so its absence doesn't block anything. **Reviewer note**: please re-verify `docker compose up -d` in an environment with Docker Hub access if possible, since it could not be end-to-end verified here.
- Removed the default `create-next-app` demo assets (`public/*.svg`, boilerplate `page.tsx`/`layout.tsx` content, Vercel/Next.js logos and copy) per "ripulire la home di default".

### File List

- `package.json`, `package-lock.json` — scripts (`dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `postinstall`), pinned dependency versions
- `.gitignore` — merged (added `next-env.d.ts`, `*.tsbuildinfo`, `/src/generated/`)
- `.env.example` — new
- `README.md` — rewritten with dev setup instructions
- `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs` — new (scaffold config, next-intl plugin wiring, ignores for `_bmad*`/`docs`/`src/generated`)
- `docker-compose.yml` — new
- `prisma.config.ts`, `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/migrations/20260704134753_init/migration.sql`, `prisma/migrations/migration_lock.toml` — new
- `vitest.config.ts`, `playwright.config.ts` — new
- `src/i18n/routing.ts`, `src/i18n/navigation.ts`, `src/i18n/request.ts` — new
- `src/proxy.ts` — new (next-intl middleware; named `proxy.ts` per Next.js 16's renamed convention)
- `messages/it.json`, `messages/en.json` — new
- `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx` — new (localized welcome page)
- `src/app/globals.css` — rewritten (warm monochrome palette, font variables)
- `src/app/favicon.ico` — new (from scaffold)
- `src/app/api/v1/.gitkeep` — new (empty placeholder)
- `src/instrumentation.ts` — new (boot-time env validation)
- `src/lib/env.ts` — new
- `src/lib/money.ts`, `src/lib/money.test.ts` — new
- `src/lib/time.ts`, `src/lib/time.test.ts` — new
- `src/lib/schemas/README.md` — new (placeholder folder)
- `src/server/db/prisma.ts` — new (Prisma client singleton with `@prisma/adapter-pg`)
- `src/server/services/README.md`, `src/server/adapters/README.md`, `src/server/auth/README.md` — new (placeholder folders)
- `e2e/welcome.spec.ts` — new (4 smoke tests: `/` redirect, `/it`, `/en`, locale switch)
- `public/` — removed default `create-next-app` SVG assets (file, globe, next, vercel, window)
- `src/generated/prisma/**` — generated by Prisma at `postinstall`/`prisma generate`; gitignored, not part of the committed file list
