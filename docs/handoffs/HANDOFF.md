# HANDOFF — AirManager (aggiornato: 2026-07-10 sera, EPIC 11 DONE — registro voli logbook, post-MVP)

## Goal

Costruire AirManager, il gestionale per un'aviosuperficie, col metodo BMAD v6. **MVP completo** (epics 1–10 + TD-1..4, tutti merged). Questa sessione ha eseguito il **primo change request post-MVP dell'utente**: l'**Epic 11 — registro voli logbook** (FR-43..45), nato dal feedback utente del 2026-07-10 (decisioni ratificate in `_bmad-output/planning-artifacts/change-request-flight-log-2026-07-10.md`). Epic 11 è DONE: 3/3 stories implementate e reviewate.

## Ruoli modello e regole di processo (config utente 2026-07-07, confermata su epic 5–11)

- **Stories**: sessione principale **Fable 5 (xhigh)**, via `bmad-create-story` DOPO ricognizione Explore (lanciata in parallelo al lavoro corrente).
- **Dev**: **UN SOLO subagent Sonnet 5 (xhigh)** per story via Workflow tool con output strutturato (status/summary/commitSha/gates/filesChanged/notesForReview/deviations).
- **Review**: subagent **Opus 4.8 (xhigh)** adversarial — unico layer adversarial, MAI abbassarlo; briefato coi notesForReview del dev e col mandato ESPLICITO di chiudere in prima persona i gap dichiarati; priorità zero: **full suite e2e su DB fresco, BUILD DI PRODUZIONE in modalità CI** (`CI=1 npx playwright test`). I fix li applica la sessione principale (il reviewer non ha Edit/Write).
- **Regole utente**: ogni **epic ha la sua PR**; ogni **story i suoi commit** (story file → implementazione → review record/fix); a **epic finito**: `/handoff`, push, PR, **STOP**.
- **Identità git**: `git config user.email noreply@anthropic.com && git config user.name Claude`; i subagent fanno `git commit --amend --no-edit --reset-author`; push SUBITO dopo ogni commit (della sessione principale — i subagent NON pushano). MAI force-push di commit già pushati.
- Reset DB (`npm run db:reset`, SOLO sessione principale) PRIMA di ogni dev E di ogni review.

## Current Progress

- **Epic 1..10 DONE e MERGED** (PR #2..#14) + TD-1..4 — dettagli negli handoff archiviati.
- **Questa sessione, branch `claude/flight-log-schema-design-9tmjqn` (da main post-merge PR #14) — EPIC 11 COMPLETO, PR da aprire subito dopo questo handoff:**
  - **Change request ratificato** (3 risposte utente): durata SEMPRE derivata atterraggio−decollo; orari+aeroporti OBBLIGATORI sui voli nuovi (storia resta null); PIC copre sempre pilota/allievo/istruttore → MAI memorizzato, solo derivato. Suggerimento QTB/libretto PDF: NON richiesto, resta follow-up candidato.
  - **11.1 campi logbook e durata derivata DONE** (review fixes-required → fixed, 194/194 e2e): `Flight` + `departureAirfield`/`arrivalAirfield`/`takeoffAt`/`landingAt` (nullable, storia intatta), `takeoffs`/`landings` NOT NULL DEFAULT 1 (migrazione 30, hand-written con backfill), `minutes` e `flightDate` DERIVATI server-side (`Math.round`, floor 1, giorno ROMA via `dateOnlyInZone` — non UTC), 422 `FLIGHT_TIMES_INVALID` (≤0 o >1440), `FLIGHT_DATE_IN_FUTURE` sulla data derivata, contaore/pricing/pacchetti INVARIATI a parità di minutes, hourMeter demolito a coppia informativa opzionale (`HOUR_METER_INVALID` service-level). Form: date+2×time, durata live read-only, aeroporti prefillati da `getAirfieldBranding().name`, prefill correzione. POST /flights contratto BREAKING deliberato (nessun consumer esterno). 111-F1 (prefill decolli/atterraggi a '1' nel form) fixato in sessione; 111-N1 ratificato (floor a 1 anche <30s); 111-N2 delegato a 11.3 (fatto).
  - **11.2 registro logbook, PIC e scheda persona DONE** (review **clean-pass**, 197/197 e2e): colonne compatte tratta/orari/dec.-att./PIC (helper puro `src/lib/flight-pic.ts`, 4 unit test — PIC MAI memorizzato), DD/MM/YYYY sulle superfici voli, pannello "Ultimi voli" REALE su `people/[id]` (server-rendered, `listFlights` diretto AD-1, link "Vedi tutti" per-ruolo: `?personId=` staff, nudo per titolare). Lezione: `hasText` substring — la colonna orari nuova ("11:00") matchava i filtri durata (`'1:00'`) → regex `\b`-anchored in flight-reversal.spec.
  - **11.3 date italiane + export logbook DONE** (review **clean-pass**, 195 passed + 2 flake noti): retrofit `formatDateOnly` su 11 superfici (audit CHIUSO nel story file — account panel/statement, expiries ×4, cash register, storici tariffe ×2, courseStartDate ×2), xlsx voli a 15 colonne SEPARATE, PDF voli a 12 colonne COMPATTE. Il dev ha trovato coi render REALI 3 bug PDF veri (overflow colonne, separatore orari senza wrap point, `→` fuori WinAnsi Helvetica → glifo errato) e li ha fixati: `PdfColumn.width` (peso flex relativo, default 1 retro-compatibile — verificato sui report a larghezza default), trattino spaziato e freccia ASCII SOLO nel PDF (registry web intatto).
- **Gate di fine epic** (review 11.3, DB fresco, prod build CI-mode): lint/typecheck/build verdi, **1218/1218 unit**, e2e **195 passed / 1 flaky noto / 1 failed = `ppr-register:292` PROVATO flake pre-esistente** (v. sotto). **Migrazioni: 30** (+1: `20260710130000_add_flight_logbook_fields`).
- Commit sessione (in ordine): `02e71b9` (change request) → `4a79b2a` (epic 11 in epics.md+tracking) → `a710d4a` (story file 11.1) → `d458a6c` (impl 11.1) → `c490bf3` (story file 11.2) → `6bf6ded` (story file 11.3) → `dfe6056` (review 11.1 + fix 111-F1) → `11005c1` (baseline 11.2) → `455ead8` (impl 11.2) → `a0abb71` (review 11.2) → `0a5d125` (baseline 11.3) → `c7e1af3` (impl 11.3) → `94729bd` (review 11.3) → questo handoff. Tracking: `sprint-status.yaml` — epic-11 done.

## What Worked

- Il ciclo consolidato (Explore recon in parallelo → story file Fable → dev Sonnet via Workflow → review Opus col mandato chiudi-tu-i-gap → fix in sessione principale) ha chiuso 3/3 stories; gli story file 11.2 e 11.3 erano pronti PRIMA che servissero.
- **La verifica su artefatti REALI paga**: i 3 bug PDF di 11.3 erano invisibili a unit test e magic-byte check — trovati SOLO renderizzando il PDF vero (content stream + screenshot Chromium). Idem 111-F1 (11.1): trovato SOLO dalla verifica UI live del reviewer.
- I reviewer hanno chiuso in prima persona i gap dichiarati dai dev (INSERT psql di voli storici pre-migrazione, simulazione backfill BEGIN/ROLLBACK, ratifica RBAC dead-branch, root-cause del flake orario di ppr-register:292): il mandato esplicito "chiudi tu i gap" continua a funzionare.
- Story file con "decisioni vincolanti" + elenco CHIUSO (audit date 11.3): il dev non ha dovuto ri-scoprire nulla; deviazioni poche e SEMPRE dichiarate (tutte ratificate in review).

## What Didn't Work

- **`hasText` con valori H:MM o date**: substring match → collisioni con le colonne nuove (lezione 11.2, stessa classe di 103-F1). Convenzione: regex `\b`-anchored o assert esatti sulla cella.
- **Accumulo dati negli e2e ripetuti in sessione**: 68 velivoli accumulati hanno spinto righe nuove oltre pagina 1 (lista alfabetica, PAGE_SIZE 20) → falsi fail in aircraft-rates. Il full-run del reviewer su DB FRESCO resta l'arbitro.
- Il story file 11.1 conteneva una contraddizione interna (Contesto "<30s → 422" vs AC "≥1") — l'AC è autoritativa e la review l'ha pescata (111-N1): rileggere i Contesto contro le AC prima del dispatch.

## Key Decisions (oltre a quelle nei story file)

- **Logbook**: durata = atterraggio−decollo SEMPRE (deriva `minutes`, floor 1); `flightDate` = giorno di decollo in Europe/Rome; aeroporti testo libero prefillati dal nome base; PIC derivato (non-SCHOOL → person; SCHOOL solo → allievo; SCHOOL dual → istruttore), MAI colonna DB; contratto POST /flights breaking ratificato (Flutter non esiste ancora).
- **Export**: xlsx colonne separate (15) vs PDF compatte (12) — divergenza sancita; `PdfColumn.width` pesi relativi; separatori ASCII solo nel PDF (vincolo font WinAnsi).
- **Email**: formato date long-form ("1 gennaio 2027") DELIBERATO, escluso dal retrofit DD/MM/YYYY (ratificato in 11.3).
- **Flake nuovo DIAGNOSTICATO (non fixato, pre-esistente)**: `ppr-register:292` fallisce SOLO nella fascia 22:00–24:00 UTC — il test costruisce la finestra ETA in UTC, il registro bucketizza in Europe/Rome. Candidato fix TD: costruire la finestra col giorno di Roma.
- **Deferred aperti** (nuovi di questo epic): 112-N1 pass a11y tabella voli (`scope="col"` + caption); 112-N3/113-N2 naming `moneyLocale`; 113-N1 overflow PDF token non spezzabili (marche SENZA max-length in `aircraft.ts:16` — candidato: cap schema o ellipsis celle); 113-N3 mock exports `as never` → factory tipizzata; QTB/libretto pilota PDF (suggerito, mai richiesto). Storici invariati dall'handoff epic 10 (v. archivio `HANDOFF-2026-07-10-1152.md`).

## Next Steps (in ordine)

1. **Aprire la PR dell'Epic 11** su main dal branch `claude/flight-log-schema-design-9tmjqn` (questa sessione, subito dopo il push dell'handoff).
2. **STOP.** La prossima sessione parte SOLO da una decisione dell'utente. Candidati naturali: (a) TD-pass sui deferred (i più concreti: fix flake `ppr-register:292`, a11y tabella voli, max-length marche + ellipsis PDF); (b) QTB/libretto pilota PDF (l'infrastruttura c'è tutta); (c) go-live prep (hosting, email provider, rate limiting — v. ARCHITECTURE-SPINE «Deferred»); (d) app mobile Flutter sulle API v1 (ATTENZIONE: il contratto POST /flights è cambiato in 11.1).
3. A inizio prossima sessione: bootstrap automatico via hook; baseline attesa **197 e2e / 1218 unit / 30 migrazioni** su DB fresco (CI-mode/prod build). Flake noti: `ppr-register:206` (~1 run su 2-3), `ppr-register:292` (SOLO 22:00–24:00 UTC), `cash-report` ECONNRESET sotto load, login-redirect su webServer freddo.
4. Se si continua a sviluppare: ciclo per story INVARIATO (v. sezione ruoli).

Ambiente (fallback manuale se l'hook SessionStart non gira): `service postgresql start`; ruolo/db airmanager; `.env` da `.env.example` (AUTH_SECRET random, JOBS_SECRET); `npm install`; `npx prisma migrate deploy && npx prisma db seed` (**30 migrazioni**; se il seed fallisce su SEED_ADMIN_PASSWORD: `set -a && . ./.env && set +a`); Mailpit `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025` in background. Reset DB (SOLO sessione principale): `npm run db:reset` PRIMA di dev E review. Prima di ogni run e2e: `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`). Build SEMPRE via `npm run gates`. MAI `playwright install`. Utenti seed: admin@ / staff@ / pilot@ / instructor@ / student@airmanager.local (password = SEED_ADMIN_PASSWORD).
