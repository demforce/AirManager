# AirManager — Gestionale per aviosuperficie

Software di gestione per un'aviosuperficie: piloti, velivoli, voli, PPR, finanze (piloti e aviosuperficie), scuola volo (allievi/istruttori), tariffe orarie, prenotazioni, scadenze (visite mediche, ratings), ruoli/permessi, export Excel/PDF.

## Stack (deciso con l'utente)

- Next.js 16 (App Router, TypeScript) — API-first: le API REST (Zod + OpenAPI) saranno consumate anche da una futura app mobile Flutter
- Prisma ORM + PostgreSQL 16
- Auth.js (NextAuth v5) con RBAC — ruoli: admin, staff, istruttore, pilota, allievo
- next-intl — UI in italiano + inglese
- Tailwind CSS + shadcn/ui, TanStack Table
- Test: Vitest + Playwright e2e

## Processo di sviluppo (metodo BMAD, v6 in `_bmad/`)

- Workflow: PRD → architettura → epics → stories → dev → review. Artefatti in `_bmad-output/`, conoscenza di progetto in `docs/`.
- **Ruoli modello** (config utente 2026-07-07): stories = sessione principale **Fable 5 xhigh**; dev = **UN SOLO subagent Sonnet 5 xhigh** per story; review = subagent **Opus 4.8 xhigh** adversarial (l'unico layer adversarial — mai abbassarlo). Definizioni operative in `.claude/agents/` (`dev-story`, `adversarial-reviewer`); dettagli del ciclo corrente in `docs/handoffs/HANDOFF.md`.
- **Regole PR/commit/sessione** (fissate dall'utente):
  - Ogni **epic** ha la sua **PR** (branch dedicato; PR stacked sulla precedente se non ancora merged).
  - Ogni **story** ha i suoi **commit** (story file → implementazione → fix di review).
  - A epic finito: creare l'handoff con la skill `/handoff` (→ `docs/handoffs/HANDOFF.md`, committato), push, e **fermarsi** — la sessione NON inizia l'epic successivo: aspetta che l'utente apra una nuova sessione.
- **Guidelines di coding** (regola utente 2026-07-09): la skill di progetto **`karpathy-guidelines`** (`.claude/skills/karpathy-guidelines/SKILL.md`, dal plugin `forrestchang/andrej-karpathy-skills`) si applica a OGNI lavoro di scrittura/refactor/review del codice — sessione principale, dev subagent e reviewer: assunzioni esplicitate, semplicità prima di tutto (niente speculativo), modifiche chirurgiche (ogni riga cambiata riconducibile alla richiesta), esecuzione goal-driven con criteri verificabili. I subagent lanciati vanno istruiti a leggerla e seguirla.
- **Stories con UI** (regola utente): il dev agent DEVE usare la skill `design-taste-frontend` ("taste", anti-slop) E la skill di progetto `ui-ux-pro-max` (`.claude/skills/ui-ux-pro-max` — design intelligence: stili, palette, tipografia, UX checklist; interrogabile via `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`). Mantenere la coerenza visiva con lo stile editoriale minimalista già stabilito nell'app (`minimalist-ui`: monocromi caldi, bento flat, niente gradienti/ombre pesanti). Verifica UI interattiva col Playwright MCP.

## Consultazione documentazione librerie

L'utente vuole best practice aggiornate via Context7 (https://context7.com). In questo ambiente remoto `mcp.context7.com` è bloccato dalla network policy: finché non viene sbloccato, usare **WebFetch su raw.githubusercontent.com** dei repo ufficiali (es. `vercel/next.js` → `docs/`, `prisma/docs`, `nextauthjs/next-auth`) — funziona. `curl` verso siti doc generici NON funziona (solo registry npm/PyPI e GitHub).

## Convenzioni

- Branch di lavoro: uno per epic. Lo stato branch/PR è per-sessione e vive SOLO in `docs/handoffs/HANDOFF.md` — mai registrarlo qui.
- Codice, commenti e identificatori in inglese; UI bilingue IT/EN via next-intl; documenti BMAD in italiano.
- Prima di ogni commit di una story: `npm run gates` deve passare (lint + typecheck + vitest + build in output compatto — stampa solo i fallimenti; MAI eseguire i 4 comandi verbosi separatamente nei gate).
- I test nuovi entrano in CI da soli (glob: vitest `src/**/*.test.ts`, Playwright `e2e/`) — MAI elencare test in CI. Se una story introduce una env var, un servizio o uno step di setup, aggiornare NELLO STESSO commit `.env.example`, `.github/workflows/ci.yml` e gli hook/script (`.claude/hooks/session-start.sh`, `scripts/`): il test `src/lib/env.ci-sync.test.ts` fallisce se l'env contract e la CI divergono.
- e2e: i click di navigazione usano selettori scoped al landmark (`getByRole('navigation', { name: 'Aree operative' })`) o `exact: true` — MAI un `getByRole('link', { name: ... })` page-level: il name-match di Playwright è substring, ogni nuovo link che contiene il label rompe il test (lezione 103-F1, epic 10).
- PostgreSQL 16 è disponibile nel container (`/usr/lib/postgresql/16`); Docker disponibile. Il bootstrap ambiente (deps, .env, Postgres, migrazioni, Mailpit) è automatico via hook SessionStart (`.claude/hooks/session-start.sh`, idempotente — rieseguibile a mano con `AIRMANAGER_BOOTSTRAP_FORCE=1`).

## Compaction

Alla compaction preservare SEMPRE: story id corrente, file modificati non ancora committati, esito dell'ultimo `npm run gates`, branch e PR correnti.

## Manutenzione di questo file (automatica — l'utente non lo aggiorna a mano)

- Se durante la sessione un fatto o una regola qui dentro risulta sbagliato/stale, correggerlo SUBITO nello stesso commit del lavoro in corso.
- Un hook SessionStart (`.claude/hooks/claude-md-drift.sh`) verifica i fatti controllabili (versioni, path, npm script, niente branch); se segnala drift, il fix va fatto in sessione.
- A fine epic la skill `/handoff` include la revisione di questo file: aggiornare fatti e convenzioni durevoli, rimuovere regole ormai superflue, tenerlo snello.
- **Playwright MCP** (`.mcp.json`, server `playwright` = `@playwright/mcp` headless sul Chromium preinstallato `/opt/pw-browsers/chromium`): usarlo per la verifica UI interattiva durante dev e review (navigare l'app reale, screenshot, driving dei form) — complementare agli e2e Playwright (`e2e/`), che restano il gate automatico. I tool MCP (`mcp__playwright__*`) sono disponibili dalle sessioni avviate dopo il commit di `.mcp.json`. MAI `playwright install`.
- **CodeGraph MCP** (trial, server `codegraph` in `.mcp.json`; indice locale `.codegraph/` ricostruito dall'hook SessionStart): per domande STRUTTURALI sul codice (chi chiama X, impatto di una modifica, dove è definito Y) preferire il tool `codegraph_explore` all'esplorazione manuale grep/glob/read — risparmia contesto.
