# HANDOFF — AirManager (aggiornato: 2026-07-26 — **EPIC 13 COMPLETO, 11/11 story DONE**. Branch `epic-13-ui-feedback` interamente NON pushato; la sessione si è fermata a fine epic come da regola. Prossimo epic: decide l'utente in una NUOVA sessione)

## Stato: Epic 13 chiuso

**Epic 13 — UI feedback batch post-Epic 12** (punch-list utente 2026-07-22, ~36 item → 11 story): TUTTO DONE. Fonti di verità — NON duplicate qui:
- **Piano** (item→story, ratifiche R1-R6): `docs/superpowers/plans/2026-07-22-epic-13-ui-feedback.md`
- **Tracking**: `_bmad-output/implementation-artifacts/sprint-status.yaml` (epic-13: done) + story file `13-*.md` (ogni story porta AC, ratifiche, Dev Agent Record e Review Record completi — la storia dettagliata di ogni ciclo dev/review/fix è LÌ).
- Story chiuse in quest'ultima sessione: **13.7** Pianificazione (popover fixed + PDF prenotazioni), **13.8** Shell & misc (switcher lingua, icona fleet, label chart, rimozione logo, precompile scadenze), **13.9** Dark theme pass (5 cause radice token-level + fix review), **13.10** Mobile pass (rail 64px ratificato; clamp popover, form-grid/page-head responsive, 4 major dalla review sulla classe "clippato dentro card"), **13.11** Ritiro stack legacy (**Tailwind CSS, Geist e TanStack Table RIMOSSI da package.json**; 4 componenti morti + glife orfane rimossi; mini-reset esplicito al posto del preflight; censimento utility chiuso a zero token morti).
- **Reviewer switchato a Opus 5** (decisione utente 2026-07-25) — primo epic-segmento completo col nuovo modello: 5 review, tutte shippable-with-fixes, qualità dei findings alta (v. lezioni).
- **Ultima full suite (arbitro)**: `CI=1 npx playwright test` su build prod, DB fresco → **259 passed (7.4m), exit 0, 0 flaky**, catena settings 6/6 + booking-window 3/3.

## Branch e stato git

- Branch: **`epic-13-ui-feedback`**, stacked su `epic-12-airops-ui` (**PR #20 ancora OPEN**; PR #18 superata, close a carico utente). Epic-13 = ~21 commit, TUTTI non pushati — **push = utente** (classifier blocca Claude); dopo il push va aperta la PR dell'epic-13 (stacked su #20 finché non merged).
- HEAD alla chiusura: `569ef06` `docs(13.11): chiusura story — EPIC 13 COMPLETO (11/11)` (poi il commit di questo handoff).
- Untracked deliberato: churn plugin utente (`.claude/skills/*`, `.github/*`, `.agents/`, `skills-lock.json`, `.claude/workflows/`) — NON committare mai.

## Next steps (in ordine — per la PROSSIMA sessione)

1. **Utente**: push del branch + apertura PR epic-13 (+ eventuale merge chain #20 → epic-13).
2. **Security findings post-epic** (decisione utente 2026-07-24, ora sbloccata: l'epic è finito): 2 findings auth PRE-esistenti dallo scan Claude Security (dettagli+fix proposti in `sprint-status.yaml` action_items; report gitignored in `CLAUDE-SECURITY-20260723-073138/`). F1 MEDIUM CWE-613 (reset password non revoca sessioni JWT → tokenVersion/sessionsValidFrom), F2 LOW CWE-367 (TOCTOU login-lock → check atomico). Candidate a mini-epic o TD pass col ciclo solito.
3. **Retrospettiva epic-13** (optional in sprint-status) — materiale pronto: i Review Record + le lezioni sotto.
4. Prossimo epic: decide l'utente (nessun backlog di story pronte oltre i punti sopra).

## Ciclo per story su QUESTA macchina (consolidato — INVARIATO, riusarlo tale e quale)

1. Story file (sessione principale Fable, xhigh) → commit `docs(N)` (pattern: chiusura story precedente + story nuova in UN commit).
2. **DB fresco**: `fuser -k 3000/tcp; docker compose down -v && docker compose up -d && sleep 5 && set -a && . ./.env && set +a && npx prisma migrate deploy && npx prisma db seed` (lo script `npm run db:reset` NON funziona qui: assume l'utente OS postgres del container remoto).
3. **Dev**: Workflow tool, UN agent `agentType:'dev-story'` effort xhigh, prompt col path story + regole ambiente + report strutturato. UI story: design-taste-frontend + ui-ux-pro-max.
4. DB fresco → **Review**: `agentType:'adversarial-reviewer'` effort xhigh (**Opus 5** — MAI degradare), notesForReview verbatim + priority zero full suite CI=1 build prod. Se il dev non ha completato la sua full suite, la review la RIESEGUE come arbitro (successo 13.9/13.11).
5. Fix: chirurgici → sessione principale; corposi → fix-subagent coi findings verbatim + decisioni PO sopraggiunte. Review Record nello story file, `fix(N)` + `docs(N)` chiusura (sprint-status + HANDOFF SEMPRE).
6. Decisioni PO: AskUserQuestion batchate nei momenti naturali (fine review / pre-dispatch) — l'utente risponde anche a sessione non presidiata, il pattern ha retto per tutto l'epic.

## Ambiente / regole macchina locale (Fedora dell'utente — NON il container di CLAUDE.md)

- Postgres+Mailpit via `docker compose` del repo (5432/1025/8025); Mailpit API `http://localhost:8025/api/v1/messages`.
- **Lockfile SOLO via `npx -y npm@10`**.
- **JOBS_SECRET**: il `.env` locale ha ancora il placeholder → la validazione env di produzione lo RIFIUTA e il webServer CI=1 non parte. Prima di ogni full suite: `export JOBS_SECRET=<valore-non-placeholder>`. Fix definitivo = valore reale in `.env` (azione utente, mai fatta).
- **Playwright**: suite e2e nativa (verde e ripetibile). MCP Playwright funziona dalla sessione PRINCIPALE via override Docker in `~/.claude.json`; dai SUBAGENT non è raggiungibile → fallback sanzionato: script `playwright-core` throwaway (Chromium cacheato `~/.cache/ms-playwright/chromium-1228`), MAI committati, MAI `playwright install`.
- **Flake e2e noto (riqualificato review 13.10)**: classe "login POST bloccato a 5s sotto contesa worker" — massiccia su `next dev` (cold-compile), OCCASIONALE anche su build prod CI=1 (1 flaky/run, retry sempre verde). Mai attribuirla a una story senza prova.
- e2e SEMPRE foreground con output su FILE (mai `| tail`: bufferizza e al kill non esce nulla). I run in background dei subagent MUOIONO con la loro sessione: se un report dichiara la suite incompleta, la sessione principale la RIESEGUE (2 volte su 3 è servito).
- **Classifier flake**: "claude-sonnet-5 temporarily unavailable" su Bash/Workflow → transitorio; se persiste (outage API più ampio, successo 1 volta: ~20 min), backoff con Monitor (`sleep N; echo retry`) e riprovare — le operazioni read-only e Write/Edit continuano a funzionare.
- gates: `npm run gates` (mai i 4 comandi separati). **Co-Authored-By = il modello che ha fatto il lavoro** (dev/fix subagent = `Claude Sonnet 5`; sessione principale = `Claude Fable 5`); push/`gh pr close`/`git stash drop` bloccati → comandi inline `!` dell'utente.
- Parallel-session collision risk (memoria): controllare `git log` per commit altrui PRIMA di ogni commit epic-level.

## Lezioni consolidate (Epic 13 — le più durevoli, dettagli nei Review Record)

- **Il "gemello" va MISURATO, non dichiarato** (3 occorrenze: popover calendario 13.7, LineChart 13.8, .ppr-mark 13.9): quando una story fixa UN esemplare di un pattern, dev e reviewer enumerano ESPLICITAMENTE gli altri esemplari e li verificano.
- **Guard e2e discriminanti** (13.7): per bug visivi/clipping servono assert di GEOMETRIA + hit-test (`elementFromPoint`), mai click Playwright (scrollIntoViewIfNeeded aggira i clip); la discriminanza va PROVATA contro una riproduzione del pre-fix (MutationObserver/addInitScript, repo intatto).
- **Contrasto = misura computazionale** (13.9): il giudizio visivo fallisce sotto ~3:1; canvas→RGB→WCAG (o oklch→sRGB in python per i token). Le spiegazioni di MECCANISMO si provano, non si narrano.
- **Mobile = rect vs box visibile della card + hit-test** (13.10): `document.scrollWidth` di pagina NON vede il contenuto clippato da `.card{overflow:hidden}` (4 major in una review). E il DB fresco NASCONDE gli overflow da valori lunghi: fixture realistiche (text-node substitution in-page).
- **Rimozione di un framework CSS = diff ortogonale contro il bundle baseline** (13.11): 258 test verdi non vedevano 3 major (utility vive in template literal + preflight); il censimento con grep su `className="..."` è cieco — sweep token-vs-CSS su OGNI espressione + diff dei computed style con iniezione del CSS baseline fino a diff vuoto.
- **Cosa ha funzionato**: decisioni PO batchate via AskUserQuestion nei momenti naturali; la review come arbitro quando il dev non completa la suite; fix chirurgici in sessione principale con verifica aritmetica pre-commit; recon+draft della story successiva durante le review (zero tempi morti).

## Suggested skills (prossima sessione)

- `karpathy-guidelines` — in OGNI prompt di dev/fix/review (regola di progetto).
- Story UI: `design-taste-frontend` + `ui-ux-pro-max`; riferimento visivo = AirOps (`src/styles/airops.css` + `docs/design-reference/airops/`).
- `/claude-security` — se si parte dai 2 findings post-epic (il plugin è installato; il report esistente è nel run dir gitignored).
- `handoff` — a fine epic o fine sessione.
- Review adversarial: agent type `adversarial-reviewer` via Workflow tool (Opus 5 xhigh) — non una skill, ma il quality gate portante.
