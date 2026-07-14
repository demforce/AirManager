# AirManager

Gestionale per aviosuperficie: piloti (anagrafica unificata con profili e accesso all'app), velivoli, registro voli con addebiti automatici, prenotazioni, PPR, finanze (conti prepagati, cassa, pacchetti ore, report), scuola volo, scadenze con alert email, export Excel/PDF, ricerca ⌘K. UI bilingue IT/EN.

## Stack

Next.js 16 (App Router) + TypeScript, Prisma 7 + PostgreSQL 16, Auth.js v5 (RBAC a 5 ruoli), next-intl (IT/EN), Tailwind CSS 4 con design system custom, Vitest + Playwright.

Vedi `CLAUDE.md` per le convenzioni di progetto e `_bmad-output/planning-artifacts/architecture/` per l'architettura completa.

## Requisiti

- **Node.js 22+** (con npm)
- **Docker** con Docker Compose (per PostgreSQL 16 e Mailpit) — in alternativa un PostgreSQL 16 locale e un qualunque SMTP di sviluppo, adattando `.env`
- **Git**

## Avvio in locale (deploy dev)

```bash
# 1. Clona il repository
git clone https://github.com/demforce/AirManager.git
cd AirManager

# 2. Installa le dipendenze (rigenera anche il client Prisma via postinstall)
npm install

# 3. Configura le variabili d'ambiente
cp .env.example .env
# I default combaciano con docker-compose.yml e bastano per lo sviluppo.
# Facoltativo ma consigliato: genera un AUTH_SECRET reale con `npx auth secret`.

# 4. Avvia i servizi (PostgreSQL 16 + Mailpit)
docker compose up -d

# 5. Applica le migrazioni e popola gli utenti demo
npx prisma migrate dev
npx prisma db seed

# 6. Avvia l'app
npm run dev
```

L'app è su **http://localhost:3000** (redirect automatico su `/it`, italiano di default; `/en` per l'inglese).

### Utenti demo (creati dal seed)

| Email | Ruolo |
| --- | --- |
| `admin@airmanager.local` | Admin (tutto, incluse gestione accessi e impostazioni) |
| `staff@airmanager.local` | Staff (operatività e finanze) |
| `instructor@airmanager.local` | Istruttore |
| `pilot@airmanager.local` | Pilota |
| `student@airmanager.local` | Allievo |

La password di tutti è quella impostata in `SEED_ADMIN_PASSWORD` nel tuo `.env` (`.env.example` la preimposta a `ChangeMe123!` — solo per sviluppo, mai in produzione).

### Email di sviluppo (Mailpit)

Inviti utente, reset password e alert scadenze/saldo finiscono in **Mailpit**: apri **http://localhost:8025** per leggerli. Nessuna email lascia mai la tua macchina.

### Reset rapido del database

```bash
npm run db:reset
```

Ricrea il database da zero (migrazioni + seed) — utile quando i dati di prova si accumulano.

## Script disponibili

| Script | Descrizione |
| --- | --- |
| `npm run dev` | Server di sviluppo Next.js su :3000 |
| `npm run build` | Build di produzione |
| `npm run start` | Avvia la build di produzione |
| `npm run gates` | Quality gate completo: lint + typecheck + unit test + build (output compatto) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Type-check TypeScript (`tsc --noEmit`) |
| `npm run test` | Unit test (Vitest) |
| `npm run test:e2e` | End-to-end test (Playwright) — al primo uso: `npx playwright install chromium`; avvia da solo l'app se non è già su :3000 |
| `npm run db:reset` | Ricrea il database (migrazioni + seed) |

## Note

- Il client Prisma generato (`src/generated/prisma`) non è versionato: viene rigenerato da `npm install` (hook `postinstall`) o da `npx prisma generate`. Dopo una nuova migrazione, se compaiono errori "Unknown field", rilancia `npx prisma generate`.
- Le API REST sotto `/api/v1/*` sono documentate OpenAPI e pensate per essere consumate anche da client esterni (futura app mobile).
- Codice, commenti e identificatori in inglese; la UI è bilingue IT/EN tramite i cataloghi in `messages/`.
