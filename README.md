# AirManager

Gestionale per aviosuperficie: piloti, velivoli, voli, finanze, scuola volo, prenotazioni e scadenze.

## Stack

Next.js 16 (App Router) + TypeScript, Prisma 7 + PostgreSQL 16, next-intl (IT/EN), design system AirOps custom (CSS + primitive React), Vitest + Playwright.

Vedi `CLAUDE.md` per le convenzioni di progetto e `_bmad-output/planning-artifacts/architecture/` per l'architettura completa.

## Setup ambiente di sviluppo

1. **Dipendenze**

   ```bash
   nvm use  # Node 22, vedi .nvmrc
   npx --yes npm@10.9.11 ci
   ```

   Il lockfile attuale non viene accettato da npm 11 per alcuni pacchetti opzionali di altre piattaforme.

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
| `npm run db:reset:test` | Ricrea solo `airmanager_test` o `airmanager_e2e` su localhost e su una porta dedicata diversa da 5432, poi applica migrazioni e seed; richiede `TEST_DATABASE_URL` esplicito e un ruolo PostgreSQL con diritto di creare DB. Usa il driver `pg`, senza `sudo` o client `psql`. |
| `npm run seed:load` | Popola un DB dedicato con migliaia di righe per i test di carico — mai in CI. Vedi `docs/operations/load-testing.md`. |

## Note

- Il client Prisma generato (`src/generated/prisma`) non è versionato: viene rigenerato da `npm install` (hook `postinstall`) o da `npx prisma generate`.
- Codice, commenti e identificatori in inglese; la UI è bilingue IT/EN tramite i cataloghi in `messages/`.
