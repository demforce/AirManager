# AirManager — Gestionale per aviosuperficie

Software di gestione per un'aviosuperficie: piloti, velivoli, voli, PPR, finanze (piloti e aviosuperficie), scuola volo (allievi/istruttori), tariffe orarie, prenotazioni, scadenze (visite mediche, ratings), ruoli/permessi, export Excel/PDF.

## Stack (deciso con l'utente)

- Next.js 16 (App Router, TypeScript) — API-first: le API REST (Zod + OpenAPI) saranno consumate anche da una futura app mobile Flutter
- Prisma ORM + PostgreSQL 16
- Auth.js (NextAuth v5) con RBAC — ruoli: admin, staff, istruttore, pilota, allievo
- next-intl — UI in italiano + inglese
- **UI primaria: design system "AirOps" custom** (epic 12) — `src/styles/airops.css` + primitive React in `src/components/ui/` (`Badge`, `KPI`, `SlideOver`, `CalendarPopover`, ...), porting del prototipo in `docs/design-reference/airops/`; font self-hosted via `@fontsource/*` (Inter Tight/JetBrains Mono/Instrument Serif — regola: niente font fetch a build-time). Story 13.3: le ultime 2 pagine legacy Tailwind (`people/{id}`, `people/{id}/account`) sono state portate ad AirOps — **non esistono più pagine legacy nell'app**, ma le dipendenze restano installate e **DORMIENTI**: Tailwind CSS + TanStack Table restano in `package.json` a servizio dei soli componenti `src/components/data-table.tsx`/`export-button.tsx` (0 consumer reali oggi — nessuna pagina li importa più, ma non vanno rimossi qui), Geist resta wired in `layout.tsx`; il ritiro completo (dipendenze + componenti) è la story dedicata 13.11. `search-combobox.tsx` è già ritematizzato AirOps e usato anche da pagine nuove. shadcn/ui è stato ritirato (epic 12, story 12.1) — nessuna dipendenza Radix/CVA in `package.json`.
- Test: Vitest + Playwright e2e

## Processo di sviluppo (metodo BMAD, v6 in `_bmad/`)

- Workflow: PRD → architettura → epics → stories → dev → review. Artefatti in `_bmad-output/`, conoscenza di progetto in `docs/`.
- **Ruoli modello** (config utente 2026-07-07): stories = sessione principale **Fable 5 xhigh**; dev = **UN SOLO subagent Sonnet 5 xhigh** per story; review = subagent **Opus 4.8 xhigh** adversarial (l'unico layer adversarial — mai abbassarlo). Definizioni operative in `.claude/agents/` (`dev-story`, `adversarial-reviewer`); dettagli del ciclo corrente in `docs/handoffs/HANDOFF.md`.
- **Assumption di dominio** (retro Epic 9, 2026-07-10): un'assumption scoperta in ricognizione/story si ratifica con l'utente (AskUserQuestion) PRIMA di implementare — mai spedirla "da confermare" (il rework 9.4 nasceva da lì).
- **Regole PR/commit/sessione** (fissate dall'utente):
  - Ogni **epic** ha la sua **PR** (branch dedicato; PR stacked sulla precedente se non ancora merged).
  - Ogni **story** ha i suoi **commit** (story file → implementazione → fix di review).
  - **Ciclo per story** (regola utente 2026-07-15): create story → dev → review → commit; nel `docs(N)` di chiusura aggiornare SEMPRE **anche `docs/handoffs/HANDOFF.md` e `sprint-status.yaml`** (non solo a fine epic), POI passare alla story successiva.
  - A epic finito: creare l'handoff con la skill `/handoff` (→ `docs/handoffs/HANDOFF.md`, committato), push, e **fermarsi** — la sessione NON inizia l'epic successivo: aspetta che l'utente apra una nuova sessione.
- **Guidelines di coding** (regola utente 2026-07-09): la skill di progetto **`karpathy-guidelines`** (`.claude/skills/karpathy-guidelines/SKILL.md`, dal plugin `forrestchang/andrej-karpathy-skills`) si applica a OGNI lavoro di scrittura/refactor/review del codice — sessione principale, dev subagent e reviewer: assunzioni esplicitate, semplicità prima di tutto (niente speculativo), modifiche chirurgiche (ogni riga cambiata riconducibile alla richiesta), esecuzione goal-driven con criteri verificabili. I subagent lanciati vanno istruiti a leggerla e seguirla.
- **Stories con UI** (regola utente): il dev agent DEVE usare la skill `design-taste-frontend` ("taste", anti-slop) E la skill di progetto `ui-ux-pro-max` (`.claude/skills/ui-ux-pro-max` — design intelligence: stili, palette, tipografia, UX checklist; interrogabile via `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`). Mantenere la coerenza visiva con lo stile stabilito nell'app: il design system **AirOps** (v. Stack) per OGNI pagina — dopo la story 13.3 non restano più pagine legacy Tailwind da portare avanti; `minimalist-ui` resta un riferimento storico, non più applicabile a nessuna pagina viva. Verifica UI interattiva col Playwright MCP.

## Consultazione documentazione librerie

L'utente vuole best practice aggiornate via Context7 (https://context7.com). In questo ambiente remoto `mcp.context7.com` è bloccato dalla network policy: finché non viene sbloccato, usare **WebFetch su raw.githubusercontent.com** dei repo ufficiali (es. `vercel/next.js` → `docs/`, `prisma/docs`, `nextauthjs/next-auth`) — funziona. `curl` verso siti doc generici NON funziona (solo registry npm/PyPI e GitHub).

## Convenzioni

- **Route map**: la sidebar (`/dashboard/{overview,bookings,ppr,movements,pilots,instructors,fleet,expiries,logbook,billing,reports,settings}`) è interamente definita in `src/components/shell/route-registry.ts` (`NAV_ITEMS`, unica fonte di verità: href/icona/gruppo/ruoli visibili) — consultarlo invece di enumerare le route qui. Fuori registry: `/(auth)/{login,set-password,forgot-password}`, `/ppr` (modulo pubblico PPR), `people/{id}` (scheda persona AirOps — story 13.3, con estratto conto come sezione; linkata da Piloti/PilotLanding/billing, non dalla sidebar). `people/{id}/account` è un redirect verso `people/{id}` (deep-link retrocompatibile, story 13.3 R-13.3-b) — non una pagina propria.
- Branch di lavoro: uno per epic. Lo stato branch/PR è per-sessione e vive SOLO in `docs/handoffs/HANDOFF.md` — mai registrarlo qui.
- Codice, commenti e identificatori in inglese; UI bilingue IT/EN via next-intl; documenti BMAD in italiano.
- Prima di ogni commit di una story: `npm run gates` deve passare (lint + typecheck + vitest + build in output compatto — stampa solo i fallimenti; MAI eseguire i 4 comandi verbosi separatamente nei gate).
- I test nuovi entrano in CI da soli (glob: vitest `src/**/*.test.ts`, Playwright `e2e/`) — MAI elencare test in CI. Se una story introduce una env var, un servizio o uno step di setup, aggiornare NELLO STESSO commit `.env.example`, `.github/workflows/ci.yml` e gli hook/script (`.claude/hooks/session-start.sh`, `scripts/`): il test `src/lib/env.ci-sync.test.ts` fallisce se l'env contract e la CI divergono.
- e2e: i click di navigazione usano selettori scoped al landmark (`getByRole('navigation', { name: 'Aree operative' })`) o `exact: true` — MAI un `getByRole('link', { name: ... })` page-level: il name-match di Playwright è substring, ogni nuovo link che contiene il label rompe il test (lezione 103-F1, epic 10). Stessa classe: MAI `hasText` con valori H:MM o date per disambiguare righe ("11:00" contiene "1:00") — regex `\b`-anchored o assert esatti sulla cella (lezione 11.2, epic 11); anche i NOMI delle fixture contano (una persona "Finestra" rompe `getByLabel('Fine')` via accessible-name del select — lezione 12.11 F2).
- e2e, stato globale: gli spec che SCRIVONO AppSettings globali (`settings.spec.ts`, `booking-window.spec.ts`) vivono nella catena di project serializzati di `playwright.config.ts` (`dependencies`: girano DOPO la suite principale; run locale singolo con `--no-deps`). OGNI nuovo spec che muta settings globali deve entrare nella catena — con `fullyParallel` uno spec "verde da solo" può rompere le create concorrenti degli altri (422 `BOOKING_OUTSIDE_WINDOW`, lezione 12.11 F1).
- **Ambiente** (i fatti seguenti valgono per il container remoto; su altre macchine — es. la Fedora locale dell'utente — fa fede `docs/handoffs/HANDOFF.md`): PostgreSQL 16 disponibile nel container (`/usr/lib/postgresql/16`); Docker disponibile. Il bootstrap ambiente (deps, .env, Postgres, migrazioni, Mailpit) è automatico via hook SessionStart (`.claude/hooks/session-start.sh`, idempotente — rieseguibile a mano con `AIRMANAGER_BOOTSTRAP_FORCE=1`).
- **Playwright MCP** (`.mcp.json`, server `playwright` = `@playwright/mcp` headless sul Chromium preinstallato `/opt/pw-browsers/chromium` — path del container remoto: dove non esiste, workaround sanzionato = script `@playwright/test` throwaway in /tmp, v. HANDOFF): usarlo per la verifica UI interattiva durante dev e review (navigare l'app reale, screenshot, driving dei form) — complementare agli e2e Playwright (`e2e/`), che restano il gate automatico. MAI `playwright install`.
- **CodeGraph MCP** (trial, server `codegraph` in `.mcp.json`; indice locale `.codegraph/` ricostruito dall'hook SessionStart): per domande STRUTTURALI sul codice (chi chiama X, impatto di una modifica, dove è definito Y) preferire il tool `codegraph_explore` all'esplorazione manuale grep/glob/read — risparmia contesto.

## Compaction

Alla compaction preservare SEMPRE: story id corrente, file modificati non ancora committati, esito dell'ultimo `npm run gates`, branch e PR correnti.

## Manutenzione di questo file (automatica — l'utente non lo aggiorna a mano)

- Se durante la sessione un fatto o una regola qui dentro risulta sbagliato/stale, correggerlo SUBITO nello stesso commit del lavoro in corso.
- Un hook SessionStart (`.claude/hooks/claude-md-drift.sh`) verifica i fatti controllabili (versioni, path, npm script, niente branch); se segnala drift, il fix va fatto in sessione.
- A fine epic la skill `/handoff` include la revisione di questo file: aggiornare fatti e convenzioni durevoli, rimuovere regole ormai superflue, tenerlo snello.
