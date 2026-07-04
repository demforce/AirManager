# Story 1.1: Scaffold del progetto e ambiente di sviluppo

Status: ready-for-dev

## Story

As a sviluppatore del team,
I want un progetto Next.js 16 avviabile con database, i18n e strumenti di qualità configurati,
so that ogni story successiva parta da fondamenta funzionanti e verificabili.

## Acceptance Criteria

1. **Given** un checkout pulito del repository, **When** eseguo `docker compose up -d` e `npm run dev`, **Then** l'app si avvia su localhost con una pagina di benvenuto servita su `/it` e `/en` tramite next-intl (routing `[locale]`), **And** PostgreSQL 16 e Mailpit girano via docker-compose e `npx prisma migrate dev` applica una migrazione iniziale minima.
2. **Given** il progetto scaffoldato, **When** eseguo `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, **Then** tutti e quattro terminano con successo (Vitest con almeno un test di fumo; Playwright configurato con un e2e di fumo eseguibile con `npm run test:e2e`), **And** la struttura cartelle rispecchia il Structural Seed dello spine.

## Tasks / Subtasks

- [ ] Task 1: Scaffold Next.js (AC: 1, 2)
  - [ ] `create-next-app` (TypeScript, Tailwind, ESLint, App Router, src-dir, alias `@/*`) **dentro la root del repo esistente** (l'app vive nella root, non in una sottocartella)
  - [ ] Ripulire la home di default; struttura cartelle come da spine (vedi Dev Notes)
- [ ] Task 2: i18n con next-intl (AC: 1)
  - [ ] Routing `src/app/[locale]/` con `locale ∈ {it, en}`, default `it`, cataloghi `messages/it.json` e `messages/en.json`
  - [ ] Pagina di benvenuto localizzata (titolo AirManager + descrizione) su `/it` e `/en`; redirect `/`→`/it`
- [ ] Task 3: Database e Prisma (AC: 1)
  - [ ] `docker-compose.yml` nella root: `postgres:16` (porta 5432, volume) + `axllent/mailpit` (porte 1025/8025)
  - [ ] Prisma 7 con datasource postgres via `DATABASE_URL`; primo modello minimo `AppSetting { id, key unique, value, updatedAt }` e migrazione iniziale
  - [ ] Client singleton in `src/server/db/prisma.ts`
  - [ ] `.env.example` completo + validazione env con zod in `src/lib/env.ts` (fail-fast al boot)
- [ ] Task 4: Qualità e test (AC: 2)
  - [ ] Script npm: `dev`, `build`, `lint`, `typecheck`, `test` (vitest run), `test:e2e` (playwright)
  - [ ] Vitest 4 configurato per unit test (`*.test.ts` accanto al codice); un test di fumo reale (es. helper `src/lib/money.ts: formatCents`)
  - [ ] Playwright con un e2e di fumo: apre `/it`, verifica il titolo; e uno per `/en`
  - [ ] `README.md` aggiornato con setup dev (docker compose, migrate, dev, test)

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

### Debug Log References

### Completion Notes List

### File List
