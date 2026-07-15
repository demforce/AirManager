# HANDOFF — AirManager (aggiornato: 2026-07-15, Epic 12 in corso — story 12.1–12.3 DONE, sessione fermata su richiesta utente)

## Goal

**Epic 12 — sostituzione totale della UI col design "AirOps" + backend build-out** (change request utente 2026-07-14, brainstormato e ratificato per sezioni). Fonti di verità — NON duplicate qui:
- **Spec** (decisioni D1–D13 + mappa pagine + ratifiche): `docs/superpowers/specs/2026-07-14-airops-ui-replacement-design.md`
- **Piano** (13 story, contratti backend, fate-map e2e): `docs/superpowers/plans/2026-07-14-epic-12-airops-ui.md`
- **Prototipo** (riferimento visivo VINCOLANTE, markup/classi 1:1): `docs/design-reference/airops/`
- **Tracking**: `_bmad-output/implementation-artifacts/sprint-status.yaml` + story file `12-*.md` nella stessa dir.

## Branch e stato git

- Branch: **`epic-12-airops-ui`** (da main 56d2f77). Una PR per l'epic A FINE epic (regola utente); ogni story = suoi commit.
- **MAI PUSHATO**: questa macchina NON ha credenziali git (verificato: nessun credential helper). Il push lo fa l'utente (`git push -u origin epic-12-airops-ui`). CI gira solo su PR verso main → l'arbitro resta la full suite locale in CI-mode.
- Ultimo commit: `2ca537b`. Sequenza: spec+mirror `b58ec62` → piano `f2f22bd` → 12.1 (`d177a14` story, `c9dc3f7` impl, `af4e5f5` cherry-pick fix datetime, `e1582f1` review fixes) → 12.2 (`b4b385b` story, `cd445a3` impl, `5ebe87f` review fixes) → 12.3 (`ebce517` story, `25531b8` impl, `5ea86b0` review fixes, `2ca537b` review record).
- Untracked deliberati: story file bozza `12-4-*.md`, `12-5-*.md`, `12-6-*.md` (si committano al dispatch, dopo aver settato `baseline_commit` e `Status: ready-for-dev`) e `.claude/workflows/` (salvataggio workflow dell'utente — non toccare).
- Il branch `fix/e2e-datetime-local-tz` dell'utente resta separato; il suo commit eb4dfe7 è GIÀ cherry-pickato nell'epic (af4e5f5).

## Current Progress (Epic 12: 3/13 done)

- **12.1 DONE** — design system (airops.css port verbatim + fontsource), primitive `src/components/ui/`, shell `src/components/shell/` (route-registry con flag `enabled` per accendere le voci man mano), tema cookie `am-theme` su `<html>`, pagine auth. Review: F1 overflow topbar mobile (fixato, sezione "AirManager additions" in coda a airops.css), F2 nav Impostazioni → ADMIN-only.
- **12.2 DONE** — workflow prenotazioni backend: enum `PENDING/APPROVED/DENIED/FLOWN/NO_SHOW/CANCELLED` (migrazione RENAME VALUE + ADD VALUE in DUE file — PG16 rifiuta SET DEFAULT su valore appena aggiunto nello stesso file transazionale), `transitionBooking` con matrice esplicita, ri-check expiry/overlap all'approve, email rifiuto (`Emails.bookingDenied`), `POST /api/v1/bookings/[id]/transition`, param `status` (comma-separated) su listBookings. SOLO le APPROVED occupano lo slot. Review: F1/F2 call-site legacy senza `status` (widget home, export) — fixati.
- **12.3 DONE** — pagina Pianificazione AirOps: timeline orizzontale 06–22 per aeromobile (riuso proiezioni 7.2), week grid, tabella workflow con azioni per stato, form create/edit in SlideOver, meccanismo **`airopsNative`** sul registry + `LegacyBackdrop` (shim solo per pagine legacy). Review dura ma sana: 16 fail CI-mode → 3 bug prodotto reali (crosstalk ?view/?date, Annulla mancante su PENDING own, error-leak edit form) + test rotti (SlideOver mai aperto) — tutto fixato, dettagli nel Review Record dello story file.
- **Baseline attuale su DB fresco, build produzione**: **207/207 e2e (CI=1), 1310 unit, 32 migrazioni**. Verificata su due run consecutive.
- **Ratifiche utente POST-spec** (già nei file giusti, elencate per memoria): allievi NON creano prenotazioni (RBAC invariato; CTA "Prenota volo" nascosta per STUDENT in 12.12); finestra lista prenotazioni = **now − 48h**; il conteggio "N in attesa" resta ancorato a now (dichiarato, non ratificato diversamente).

## Next Steps (in ordine)

1. **Story 12.4** (PPR console + modulo pubblico + Voli in transito): bozza PRONTA in `_bmad-output/implementation-artifacts/12-4-ppr-console-pubblico-transiti.md` — settare baseline_commit=HEAD e Status: ready-for-dev, committare, DB fresco, dispatch dev. Ricognizione già incorporata (fatti chiave: manual-create PPR NON esiste; email PprRequest da rendere nullable + `createdByUserId`; stati derivati net-new via helper puro; "Azzera filtri" TD-5 da preservare).
2. Poi 12.5 (bozza pronta), 12.6 (bozza pronta), 12.7…12.13 dal piano (Task 7–13) — ricognizione Explore prima di ogni story file nuovo.
3. A epic completo: `/handoff`, push (utente), PR unica, STOP.

## Ciclo per story su QUESTA macchina (consolidato in 3 story)

1. Story file (sessione principale Fable) → commit `docs(12.N)`.
2. **DB fresco** (lo script db:reset NON funziona qui): `fuser -k 3000/tcp; docker compose down -v && docker compose up -d && sleep 4 && set -a && . ./.env && set +a && npx prisma migrate deploy && npx prisma db seed`.
3. **Dev**: Workflow tool, UN agent `agentType:'dev-story'` effort xhigh, prompt col path dello story file + regole ambiente (v. sotto) + report strutturato (status/summary/commitSha/gates/filesChanged/notesForReview/deviations). UI story: design-taste-frontend + ui-ux-pro-max, verifica interattiva.
4. DB fresco → **Review**: Workflow tool, `agentType:'adversarial-reviewer'` effort xhigh (Opus — MAI degradare), briefato con notesForReview + mandato chiudi-tu-le-note + **priority zero: `CI=1 npx playwright test` su build di produzione** (il dev-mode locale può mentire: in 12.3 era verde dove il CI-mode falliva 16 test).
5. Fix: chirurgici → sessione principale; corposi → fix-subagent dedicato coi findings verbatim (pattern 12.3, ha funzionato). Review record nello story file, sprint-status, commit `fix(12.N)` + `docs(12.N)`.
6. In parallelo a dev/review: Explore recon read-only per la story successiva + bozza story file (untracked).

## Ambiente / regole macchina locale (Fedora dell'utente — NON il container di CLAUDE.md)

- Postgres+Mailpit via `docker compose` del repo (5432/1025/8025); Mailpit API `http://localhost:8025/api/v1/messages`.
- **Lockfile SOLO via `npx -y npm@10`** (npm 11 locale rompe `npm ci` in CI).
- **MCP Playwright ROTTO** (path container `/opt/pw-browsers`): workaround sanzionato = script `@playwright/test` throwaway in /tmp (browser in `~/.cache/ms-playwright` funzionano; MAI `playwright install`), da cancellare prima del commit.
- Flake noto: PRIMO login POST su dev server freddo fallisce una volta (classe cold-compile) → e2e locali con `--retries=2`. In CI-mode (build prod) non si è mai manifestato.
- e2e prima di ogni run: `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`).
- Utenti seed: admin@/staff@/pilot@/instructor@/student@airmanager.local (password in `SEED_ADMIN_PASSWORD` di `.env` — non copiarla nei documenti).
- gates: `npm run gates` (mai i 4 comandi separati). Identità git già configurata (Claude/noreply); commit con Co-Authored-By Fable; MAI push (v. sopra).

## What Worked / What Didn't (lezioni di QUESTA sessione)

- **Ha funzionato**: recon Explore in parallelo a dev/review (pipeline sempre piena); review adversarial con verifica empirica (ha trovato bug veri in TUTTE e tre le story: overflow mobile, call-site pending nascoste, crosstalk/cancel/error-leak); fix-subagent dedicato con findings verbatim per fix corposi; bozze story file scritte appena la recon arriva.
- **Non ha funzionato / trappole**: (a) il dev della 12.3 ha esaurito il runway PRIMA del commit — la sessione principale ha chiuso meccanicamente (pattern replicabile: rm scratch, e2e, record, gates, commit); (b) **una run e2e locale in dev-mode può essere verde dove il CI-mode fallisce** (12.3: 22 pass locali vs 16 fail CI) — il gate è SOLO `CI=1` su build prod; (c) i test riscritti vanno auditati per copertura (il reviewer ha fatto il diff dell'inventario test — prassi da mantenere); (d) subagent commit già con l'identità giusta — niente amend necessario.

## Suggested skills (prossima sessione)

- `karpathy-guidelines` — in OGNI prompt di dev/fix/review (regola di progetto).
- `design-taste-frontend` + `ui-ux-pro-max` — story UI (12.4 lo è: console + pubblico + movements).
- `handoff` — a fine epic o a fine sessione.
- NON usare `minimalist-ui` come vincolo visivo: superata dall'epic (riferimento = prototipo AirOps).
