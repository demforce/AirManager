# AirManager — Gestionale per aviosuperficie

Software di gestione per un'aviosuperficie: piloti, velivoli, voli, PPR, finanze (piloti e aviosuperficie), scuola volo (allievi/istruttori), tariffe orarie, prenotazioni, scadenze (visite mediche, ratings), ruoli/permessi, export Excel/PDF.

## Stack (deciso con l'utente)

- Next.js 15 (App Router, TypeScript) — API-first: le API REST (Zod + OpenAPI) saranno consumate anche da una futura app mobile Flutter
- Prisma ORM + PostgreSQL 16
- Auth.js (NextAuth v5) con RBAC — ruoli: admin, staff, istruttore, pilota, allievo
- next-intl — UI in italiano + inglese
- Tailwind CSS + shadcn/ui, TanStack Table
- Test: Vitest + Playwright e2e

## Processo di sviluppo (metodo BMAD, v6 in `_bmad/`)

- Workflow: PRD → architettura → epics → stories → dev → review. Artefatti in `_bmad-output/`, conoscenza di progetto in `docs/`.
- **Ruoli modello** (aggiornato 2026-07-07, resume Epic 4): la sessione principale gira su **Fable 5 (extra-high)** e crea documenti/stories; il dev di ogni story è **Sonnet 5 via workflow ultracode** (implement → verifica multi-agente → fix); la review è un agente **Opus 4.8 (extra-high)** adversarial.
- **Regole PR/commit/sessione** (fissate dall'utente):
  - Ogni **epic** ha la sua **PR** (branch dedicato; PR stacked sulla precedente se non ancora merged).
  - Ogni **story** ha i suoi **commit** (story file → implementazione → fix di review).
  - A epic finito: creare l'handoff con la skill `/handoff` (→ `docs/handoffs/HANDOFF.md`, committato), push, e **fermarsi** — la sessione NON inizia l'epic successivo: aspetta che l'utente apra una nuova sessione.
- Stories con UI: il prompt del dev agent deve richiamare la skill `minimalist-ui` (dashboard/tabelle/form) o `design-taste-frontend` (pagine pubbliche/landing, es. form PPR).

## Consultazione documentazione librerie

L'utente vuole best practice aggiornate via Context7 (https://context7.com). In questo ambiente remoto `mcp.context7.com` è bloccato dalla network policy: finché non viene sbloccato, usare **WebFetch su raw.githubusercontent.com** dei repo ufficiali (es. `vercel/next.js` → `docs/`, `prisma/docs`, `nextauthjs/next-auth`) — funziona. `curl` verso siti doc generici NON funziona (solo registry npm/PyPI e GitHub).

## Convenzioni

- Branch di lavoro: uno per epic. Epic 4 = `claude/epic-4-rates-packages` (PR #5, stacked su PR #4 Epic 3 `claude/handoff-model-assignment-yyv1r1`); sessione corrente su `claude/epic-4-resume-pr-5-ambmfd`, push su entrambi. (Storici, merged: `claude/airfield-management-system-rh1y4r` epic 1-2, `claude/handoff-docs-6jz8ou` epic 3.1-3.4 via PR #3.)
- Codice, commenti e identificatori in inglese; UI bilingue IT/EN via next-intl; documenti BMAD in italiano.
- Prima di ogni commit di una story: `lint`, `typecheck`, test Vitest e `next build` devono passare.
- PostgreSQL 16 è disponibile nel container (`/usr/lib/postgresql/16`); Docker disponibile.
