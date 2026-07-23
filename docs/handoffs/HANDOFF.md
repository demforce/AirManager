# HANDOFF — AirManager (aggiornato: 2026-07-23 — **EPIC 13 in corso, story 13.1 DONE (1/10)**. Branch `epic-13-ui-feedback` stacked su epic-12; scan Claude Security in corso su `src`)

## Goal

**Epic 13 — UI feedback batch post-Epic 12**: punch-list utente 2026-07-22 (~36 item) → 10 story. Fonti di verità — NON duplicate qui:
- **Piano** (item→story, recon puntuale, ratifiche R1–R6): `docs/superpowers/plans/2026-07-22-epic-13-ui-feedback.md`
- **Tracking**: `_bmad-output/implementation-artifacts/sprint-status.yaml` + story file `13-*.md` nella stessa dir.
- **Epic 12** (13/13 done, la base su cui questo epic poggia): dettagli nei story file `12-*.md`; baseline pre-Epic-13 era 232/232 e2e CI=1.

**Ratifiche PO vive** (dettaglio nel piano): R1 sospesi visibili con badge; R2 ratings a chip; R3 storici aereo 5+"mostra tutte"; R4 ritiro stack legacy (Tailwind/Geist/TanStack) con la 13.3; **R5 "Ratings" come termine in ENTRAMBE le lingue, ovunque**; **R6 la data di emissione non esiste più** (`Expiry.issuedAt` droppata dal DB in 13.1). Più le ratifiche per-story nei rispettivi story file.

## Branch e stato git

- Branch: **`epic-13-ui-feedback`**, stacked su `epic-12-airops-ui` (**PR #20 ancora OPEN**, merge pendente; PR #18 superata, close a carico utente). Su epic-12 restano 4 commit non pushati (batch fix security post-handoff); epic-13 è interamente non pushato — **push = utente** (classifier).
- Sequenza epic-13: `eab82c8` docs(13) piano → `a099062` docs(13.1) story → `c259205` feat(13.1) impl → `ada175c` fix(13.1) review+R5/R6 → `docs(13.1)` chiusura (questo).
- Untracked deliberato: churn plugin dell'utente (`.claude/skills/*`, `.github/*`, `.agents/`, `skills-lock.json`) — NON committare; bozza `13-2-piloti-ui-form-unico.md` untracked finché non parte la story.

## Current Progress (Epic 13: 1/10)

- **13.1 DONE** — split `ExpiryType.kind` RATING/MEDICAL (migrazione + backfill nomi seed; card "Visite mediche" in Impostazioni = `RatingsCard` parametrizzata), drop del free-text `InstructorProfile.ratings` (sweep completo; le abilitazioni istruttore ora = `Expiry` scope INSTRUCTORS), `POST /api/v1/people` composite one-step (profiles/expiries/access in UNA transazione, invito post-commit, 403 mai silenzioso). Review Opus: shippable-with-fixes, arbitro 233/233; N5 (issuedAt=oggi non ratificata) → F1 major. Fix `ada175c`: **R6 drop `Expiry.issuedAt`** (migrazione `20260723120000`, sweep ~30 file: schemi, services, membership fee, export, UI legacy, seed-demo, test; expiresAt nel passato ora legale = "scaduta"), **R5 "Ratings" bilingue** (sweep i18n IT; nota: prestito invariato anche al singolare — "Aggiungi Ratings" — scelta documentata dal fix agent, grammatica imperfetta ma terminologia coerente, raffinabile se il PO lo chiede), F3 `kind` patchabile via PATCH, F4 e2e card medica. **Full suite: 234/234 CI=1 su build prod, 0 flake.** Lasciato vivo (fuori scope R6): `ExpiryUpdateProposal.proposedIssuedAt` (modello dormiente, v. decisione pendente F7-12.13).
- **13.2 NEXT** — Piloti UI (form unico, editor scadenze inline, toggle archiviati, chip anche per le pagine ISTRUTTORI — gap N6 del dev 13.1 assegnato qui). Bozza story pronta (untracked), ratifiche già coperte (R1/R2/R5/R6 + R-13.1-c date obbligatorie).

## Next Steps (in ordine)

1. **Scan Claude Security in corso** (avviato 2026-07-23 07:31 UTC, scope `src` 316 file, effort medium, revisione stampata `c259205`): al termine il report è in `CLAUDE-SECURITY-20260723-073138/` (gitignored). **Caveat**: il working tree è cambiato a metà scan (commit `ada175c` del fix 13.1) — findings con line-ref da verificare contro entrambe le revisioni; a fine epic è comunque previsto uno scan del diff completo.
2. Story **13.2**: finalizzare la bozza (allineare i nomi campo al contratto composite reale dal Dev Agent Record 13.1) → commit story → DB fresco → dev → review → fix → docs. Poi 13.3…13.10 come da piano.
3. Push quando l'utente lo lancia (o mandato esplicito in sessione).

## Ciclo per story su QUESTA macchina (consolidato — invariato dall'Epic 12)

1. Story file (sessione principale Fable) → commit `docs(13.N)`.
2. **DB fresco**: `fuser -k 3000/tcp; docker compose down -v && docker compose up -d && sleep 4 && set -a && . ./.env && set +a && npx prisma migrate deploy && npx prisma db seed`.
3. **Dev**: Workflow tool, UN agent `agentType:'dev-story'` effort xhigh, prompt col path story + regole ambiente + report strutturato (status/summary/commitSha/gates/filesChanged/notesForReview/deviations). UI story: design-taste-frontend + ui-ux-pro-max, verifica interattiva.
4. DB fresco → **Review**: `agentType:'adversarial-reviewer'` effort xhigh (Opus — MAI degradare), notesForReview verbatim + mandato chiudi-tu-le-note + **priority zero `CI=1 npx playwright test` su build prod**.
5. Fix: chirurgici → sessione principale; corposi → fix-subagent coi findings verbatim + eventuali decisioni PO sopraggiunte (pattern 12.13/13.1: le ratifiche arrivate in review entrano nel batch di fix). Review Record nello story file, sprint-status, `fix(13.N)` + `docs(13.N)`.
6. In parallelo a dev/review: recon/bozza della story successiva (untracked).

## Ambiente / regole macchina locale (Fedora dell'utente — NON il container di CLAUDE.md)

- Postgres+Mailpit via `docker compose` del repo (5432/1025/8025); Mailpit API `http://localhost:8025/api/v1/messages`.
- **Lockfile SOLO via `npx -y npm@10`**.
- **Playwright** (decisione utente 2026-07-23): suite e2e NATIVA finché verde (Fedora non è ufficialmente supportata ma i run sono ripetutamente verdi); **MCP Playwright ora FUNZIONA via Docker** — override locale in `~/.claude.json` (`docker run -i --rm --init --network host mcr.microsoft.com/playwright:v1.61.1-noble npx -y @playwright/mcp@latest --headless`), il `.mcp.json` committato resta per il container remoto. **Tenere il tag immagine allineato a `@playwright/test` in package.json a ogni upgrade.** Fallback e2e se un upgrade rompesse il run nativo: `docker run --rm --init --network host --env-file .env -v $PWD:/repo -w /repo mcr.microsoft.com/playwright:v1.61.1-noble npx playwright test`. MAI `playwright install`.
- **Disco**: root 28G — 2026-07-23 ripulite cache npm/pip/pnpm (~7G liberati, 75% usato). Se torna pieno: candidati residui = journal (232M, sudo utente), browser firefox/webkit inutilizzati (~583M), ~/.cache/puppeteer (643M), immagine postgres:16-alpine orfana (418M). MAI `docker system prune` (cancellerebbe i container FERMI dello stack airops dell'utente).
- **Plugin claude-security installato** (2026-07-23, scope user): `/claude-security` per scan on-demand; a fine epic previsto scan del diff.
- Flake noto: primo login POST su dev server freddo → e2e locali `--retries=2`; in CI-mode (build prod) mai manifestato. e2e prima di ogni run: `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`).
- Utenti seed admin@/staff@/pilot@/instructor@/student@airmanager.local (password in `SEED_ADMIN_PASSWORD` di `.env`).
- gates: `npm run gates` (mai i 4 comandi separati). **Co-Authored-By = il modello che ha fatto il lavoro** (dev/fix subagent = `Claude Sonnet 5`; sessione principale = `Claude Fable 5`); push consentito SOLO su mandato esplicito (classifier); `gh pr close`/`git stash drop` sempre bloccati → comandi inline `!` dell'utente.
- **Classifier flake noto** (2026-07-22): "claude-sonnet-5 temporarily unavailable" su Bash → riprovare dopo qualche minuto, le operazioni read-only continuano a funzionare.

## What Worked / What Didn't (lezioni: quelle Epic 12 restano valide — v. story file; nuove 13.1)

- **Ha funzionato (13.1)**: ratifiche PO arrivate DURANTE la review (R5/R6) integrate nel batch di fix con istruzioni verbatim → 234/234 al primo giro (pattern 12.13 confermato); la R6 ha chiuso F1 alla radice invece di patcharlo (rimozione > guardia); recon epic-level una-tantum (19 item) che alimenta tutte le story → niente recon ripetuta per story piccole.
- **Trappole confermate**: (a) le assunzioni di dominio non ratificate diventano findings major in review (N5→F1: il dev DEVE segnalarle, la sessione DEVE ratificarle appena emergono, non a review finita); (b) su questa macchina il dev verifica e2e con `--workers=1` in dev-mode — il verdetto vero resta SOLO il CI=1 su build prod; (c) un secondo processo Claude sulla stessa dir può esistere (memoria "parallel sessions"): controllare git log per commit altrui PRIMA di ogni commit epic-level.

## Suggested skills (prossima sessione)

- `karpathy-guidelines` — in OGNI prompt di dev/fix/review (regola di progetto).
- Story UI (13.2+): `design-taste-frontend` + `ui-ux-pro-max`; riferimento visivo = AirOps (`src/styles/airops.css` + `docs/design-reference/airops/`).
- `handoff` — a fine epic o fine sessione.
