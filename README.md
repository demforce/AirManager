# AirManager

Gestionale per aviosuperficie: piloti, velivoli, voli, PPR, finanze, scuola volo, prenotazioni e scadenze.

## Stack

Next.js 16 (App Router) + TypeScript, Prisma 7 + PostgreSQL 16, next-intl (IT/EN), Tailwind CSS 4, Vitest + Playwright.

Vedi `CLAUDE.md` per le convenzioni di progetto e `_bmad-output/planning-artifacts/architecture/` per l'architettura completa.

## Setup ambiente di sviluppo

1. **Dipendenze**

   ```bash
   npm install
   ```

2. **Variabili d'ambiente**

   ```bash
   cp .env.example .env
   ```

3. **Servizi di sviluppo** (PostgreSQL 16 + Mailpit, via Docker)

   ```bash
   docker compose up -d
   ```

   - PostgreSQL: `localhost:5432` (vedi `docker-compose.yml` per le credenziali)
   - Mailpit (SMTP fittizio + web UI): `http://localhost:8025`

4. **Database — migrazioni Prisma + seed**

   ```bash
   npx prisma migrate dev
   npx prisma db seed
   ```

   Il seed crea l'utente admin demo: email `admin@airmanager.local`, password quella impostata in `SEED_ADMIN_PASSWORD` (`.env.example` la imposta a `ChangeMe123!` per lo sviluppo — non riusarla in produzione).

5. **Avvio app**

   ```bash
   npm run dev
   ```

   L'app è disponibile su `http://localhost:3000`, con redirect automatico su `/it` (italiano, lingua di default) o `/en`.

## Script disponibili

| Script | Descrizione |
| --- | --- |
| `npm run dev` | Avvia il server di sviluppo Next.js |
| `npm run build` | Build di produzione |
| `npm run start` | Avvia il build di produzione |
| `npm run lint` | ESLint |
| `npm run typecheck` | Type-check TypeScript (`tsc --noEmit`) |
| `npm run test` | Unit test (Vitest) |
| `npm run test:e2e` | End-to-end test (Playwright); richiede l'app raggiungibile (viene avviata automaticamente in dev) |

## Note

- Il client Prisma generato (`src/generated/prisma`) non è versionato: viene rigenerato da `npm install` (hook `postinstall`) o da `npx prisma generate`.
- Codice, commenti e identificatori in inglese; la UI è bilingue IT/EN tramite i cataloghi in `messages/`.
