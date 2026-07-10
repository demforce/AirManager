# HANDOFF — AirManager (aggiornato: 2026-07-10 sera, retro Epic 9 + TD-5 DONE; pronti per Epic 10)

## Goal

Costruire AirManager, il gestionale per un'aviosuperficie (piloti, velivoli, voli, PPR, finanze, scuola volo, tariffe, prenotazioni, scadenze, RBAC, export Excel/PDF) con il metodo BMAD v6. Fase corrente: Fase 2, sviluppo story-by-story. **Resta SOLO l'Epic 10 (export Excel/PDF e dashboard per ruolo)** — ultimo epic del piano. Epic 1–9 + TD-1..5 tutti done.

## Ruoli modello e regole di processo (config utente 2026-07-07, confermata su epic 5–9 e TD-5)

- **Stories**: sessione principale **Fable 5 (xhigh)**, via `bmad-create-story` DOPO ricognizione Explore (lanciabile in parallelo ad altro lavoro).
- **Dev**: **UN SOLO subagent Sonnet 5 (xhigh)** per story via Workflow tool con output strutturato (schema: status/summary/commitSha/gates/filesChanged/notesForReview/deviations). Niente fan-out.
- **Review**: subagent **Opus 4.8 (xhigh)** adversarial — unico layer adversarial, MAI abbassarlo; briefato coi notesForReview del dev e col mandato ESPLICITO di chiudere in prima persona i gap dichiarati; priorità zero: **full suite e2e su DB fresco, su BUILD DI PRODUZIONE in modalità CI** (`CI=1 npx playwright test`). I fix li applica la sessione principale (il reviewer non ha Edit/Write).
- **Regola nuova dalla retro Epic 9 (AI-2, anche in CLAUDE.md)**: un'assumption di DOMINIO scoperta in ricognizione si ratifica con l'utente (AskUserQuestion) PRIMA di implementare la story — mai spedirla "da confermare" (il rework 9.4 nasceva da lì).
- **Skill `karpathy-guidelines`** in ogni prompt di dev e review; **stories con UI**: dev DEVE usare `design-taste-frontend` + `ui-ux-pro-max` + verifica Playwright MCP (`browser_resize` può mancare: per il mobile 375×812 usare markup review/e2e e dichiararlo).
- **Regole utente**: ogni **epic ha la sua PR**; ogni **story i suoi commit** (story file → implementazione → review record/fix); a fine sessione: `/handoff`, push, PR, **STOP** — il lavoro successivo parte in una NUOVA sessione.
- **Identità git**: `git config user.email noreply@anthropic.com && git config user.name Claude`; dopo ogni commit di subagent `git commit --amend --no-edit --reset-author` PRIMA del push. Push SUBITO dopo OGNI commit (un container è già stato ripristinato a snapshot vecchio a metà sessione). MAI force-push di commit già pushati.

## Current Progress

- **Epic 1..9 DONE e MERGED** (PR #2..#13) + TD-1..4 + harness. Dettagli negli handoff archiviati.
- **Questa sessione, branch `claude/retrospective-td-pass-deferred-v9vw5a`** (da main post-merge PR #13) — mandato utente: "retrospettiva, TD-pass sui deferred". 4 commit:
  - **Retrospettiva Epic 9 DONE** (`cd2db85`): `_bmad-output/implementation-artifacts/epic-9-retro-2026-07-10.md` — prima retro formale; 5 action item (AI-1 td-5 ✓, AI-2 ratifica assumption, AI-3 convenzioni cross-cutting negli story file, AI-4 decisione 93-N1 all'utente, AI-5 story 10.2 chiude il deferred nome-aviosuperficie); triage dei deferred; readiness Epic 10: NESSUN epic-update richiesto. Action item tracciati in `sprint-status.yaml` sezione `action_items`.
  - **TD-5 deferred pass DONE** (story `0078beb`, impl `ace9552`, review record `c98722e`; review **clean-pass, zero mandatory**): (1) hydration money-format KILLED — `formatCents` pinna `useGrouping:'always'` (`src/lib/money.ts` + augmentation `money.d.ts`): separatore migliaia SEMPRE presente in it (anche sotto 10.000, cambio VISIBILE deliberato), deterministico tra ICU Node/browser; (2) `/dashboard/school` degrada al default su `from>to`; (3) locale threadato nel diario via `useLocale()`; (4) registro PPR: "Azzera filtri" nascosto al load, reset → default APPROVED; (5) **updateBooking ricontrolla le scadenze** SOLO se cambia il giorno di volo (helper `findBlockingExpiredDocuments` estratto dal create, byte-identico; NIENTE force sull'update — deferral dichiarato; chiave i18n nuova `BookingsPage.list.actions.errors.EXPIRED_DOCUMENTS`; fixato en passant un bug del nuovo MoveBookingForm: `response.clone()` per letture multiple del body); (6) pg DeprecationWarning = `Calling client.query() when the client is already executing a query` (query-overlap runtime dentro il client Prisma→pg) — **non-fixabile-a-call-site**, provato da dev E reviewer indipendentemente (le due forme del costruttore PrismaPg producono config identico): item chiuso senza cambi di codice.
- **Gate di fine sessione** (review TD-5, DB fresco, prod build): lint 0 errori (warning benigno noto), typecheck pulito, **1163/1163 unit**, build verde, **full suite 167 test / 0 fail veri** (1 flaky pre-esistente `ppr-register:206` retry-verde). **Baseline per l'Epic 10: 167 e2e, 1163 unit, 29 migrazioni** (nessuna migrazione in TD-5).
- Tracking: `sprint-status.yaml` — epic-1..9 done, td-1..5 done, epic-9-retrospective done, epic-10 backlog, action_items AI-1 done / AI-2..5 open.
- **PR di questa sessione: da aprire su main** dal branch `claude/retrospective-td-pass-deferred-v9vw5a` (se non risulta già aperta).

## What Worked

- Il ciclo comandi-BMAD anche per un TD-pass multi-item: story file con design vincolante da ricognizione Explore (6 item, riferimenti file:riga esatti) → un dev → review adversarial. Il dev ha chiuso 6 fix chirurgici senza sforare il perimetro; il reviewer ha riprovato TUTTO vivo e confermato in prima persona l'analisi "non-fixabile" dell'AC 6 invece di pretendere un diff.
- La clausola di story "se non riproducibile/fixabile al call-site, documentare SENZA cambi speculativi" (AC 6): ha permesso al dev di chiudere onestamente un item con ZERO codice — meglio di un fix a caso.
- Retro come input diretto del TD-pass: il triage della retro È diventato il perimetro della story (AI-1), con i deferred restanti motivati uno a uno.
- Full suite su prod build CI-mode come unico gate autoritativo: confermato anche stavolta (dev: e2e mirati; reviewer: 167/167 senza fail veri).

## What Didn't Work

- `e2e/bookings.spec.ts` accumula righe Booking sulla fixture condivisa `FUTURE_DAY` (2031-03-10) se rieseguito ripetutamente sullo stesso DB: oltre `BOOKINGS_PAGE_SIZE=20` fanno fallire test PRE-esistenti ("Prossime prenotazioni"). Meccanismo già previsto dal doc-comment di `soonestFutureSlot()` nel file — problema di fixture design pre-esistente, NON toccato in TD-5 (il test nuovo usa giorni run-fresh). Se una sessione futura vede rossi lì dopo run ripetuti: è questo, resettare il DB.
- `ppr-register:206` resta l'unico flake vero (~1 rosso ogni 2-3 run anche isolato, retry-verde) — documentato, non inseguirlo.

## Key Decisions (oltre a quelle nei story file)

- **Formato money (TD-5, cambio visibile)**: separatore delle migliaia SEMPRE presente in it anche sotto 10.000 € (`1.500,00 €`, prima `1500,00 €`) — prezzo del determinismo SSR/client, formato convenzionale italiano. Ogni futura asserzione su stringhe money deve aspettarsi il separatore.
- **Ricontrollo scadenze su spostamento prenotazione**: scatta SOLO al cambio del GIORNO di volo (una prenotazione creata con force resta editabile nello stesso giorno); niente `force` sull'update — lo staff che deve forzare uno spostamento cancella e ricrea (deferral dichiarato, da promuovere a feature solo su richiesta).
- **Deferred aperti** (post-TD-5, tutti motivati):
  1. 93-N1: admin senza profilo istruttore vede card "Le mie ore scuola 0:00" — DECISIONE DI PRODOTTO in attesa dell'utente (AI-4).
  2. Nome/claim aviosuperficie nel form PPR pubblico → story 10.2 (config nome/logo, AI-5).
  3. TOCTOU rate-limit PPR + trust x-forwarded-for (accettato in review 8.1; richiede scelte infra).
  4. `closedByUserId` non nel DTO (additivo quando servirà al client Flutter).
  5. Description movimento PPR in inglese (invertire solo su richiesta utente).
  6. Coda retry email NFR-7 (infra post-MVP, deferral di progetto).
  7. `force` su updateBooking (nuovo, v. sopra); fixture design `FUTURE_DAY` in bookings.spec.ts (v. What Didn't Work).
  8. pg DeprecationWarning: non-fixabile-a-call-site (chiuso come analisi; sparirà con upgrade di pg/Prisma).

## Next Steps (in ordine)

1. **Aprire la PR di questa sessione** su main dal branch `claude/retrospective-td-pass-deferred-v9vw5a` (retro + TD-5), se non già aperta. Al merge, la sessione Epic 10 parte da main.
2. **NUOVA SESSIONE per Epic 10 (Export e dashboard)** — stories: 10.1 export Excel (exceljs — prescritto da epics.md:773+; viste elenco filtrate, header localizzati, permessi rispettati), 10.2 export PDF (@react-pdf/renderer; include config nome/logo aviosuperficie → chiude deferred N2 8.1, AI-5), 10.3 dashboard per ruolo. Fable crea ogni story file via `bmad-create-story` DOPO ricognizione Explore; valutare le librerie con doc aggiornate via WebFetch su raw.githubusercontent (Context7 bloccato dalla network policy).
3. **A inizio sessione Epic 10**: bootstrap automatico via hook; ri-baseline **167 e2e attesi** su DB fresco (CI-mode/prod build); applicare AI-2 (ratifica assumption PRIMA del dev) e AI-3 (convenzioni cross-cutting citate negli story file); sottoporre all'utente la decisione 93-N1 (AI-4) alla prima occasione utile.
4. Ciclo per story INVARIATO (v. sezione ruoli). Migrazioni: timestamp DOPO `20260710120000_rename_flight_types_add_solo_flag` (29esima; TD-5 non ne ha aggiunte).
5. PR: Epic 10 = branch nuovo + PR nuova su main (o stacked su questa se non ancora merged).

Ambiente (fallback manuale se l'hook SessionStart non gira): `service postgresql start`; ruolo/db airmanager; `.env` da `.env.example` (AUTH_SECRET random, JOBS_SECRET); `npm install`; `npx prisma migrate deploy && npx prisma db seed` (**29 migrazioni**; se il seed fallisce su SEED_ADMIN_PASSWORD: `set -a && . ./.env && set +a`); Mailpit `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025` in background. Reset DB (SOLO sessione principale): `npm run db:reset` PRIMA di dev E review. Prima di ogni run e2e: `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`). Build SEMPRE `env -u NODE_ENV` (o `npm run gates`). MAI `playwright install`. Utenti seed: admin@ / staff@ / pilot@ / instructor@ / student@airmanager.local (password = SEED_ADMIN_PASSWORD).
