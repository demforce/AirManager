# HANDOFF — AirManager (aggiornato: 2026-07-11, EPIC 11 DONE + merge di main con retro Epic 9 + TD-5 — documento FUSO)

## Goal

Costruire AirManager, il gestionale per un'aviosuperficie, col metodo BMAD v6. **MVP completo** (epics 1–10 + TD-1..5 + retro Epic 9, tutti merged). Questo branch contiene il **primo change request post-MVP dell'utente**: l'**Epic 11 — registro voli logbook** (FR-43..45), decisioni ratificate in `_bmad-output/planning-artifacts/change-request-flight-log-2026-07-10.md`. Epic 11 è DONE: 3/3 stories implementate e reviewate.

**NOTA DI FUSIONE (seconda in due giorni)**: il 2026-07-10 hanno lavorato di nuovo DUE sessioni in parallelo dalla stessa base (main post-PR #14): (a) retro Epic 9 + TD-5 (PR #15, MERGED l'11/07) e (b) Epic 11 (questo branch, PR #16). Questo handoff fonde i due; la ri-verifica del tree fuso è documentata sotto.

## Ruoli modello e regole di processo (config utente 2026-07-07, confermata su epic 5–11 e TD-5)

- **Stories**: sessione principale **Fable 5 (xhigh)**, via `bmad-create-story` DOPO ricognizione Explore (lanciata in parallelo al lavoro corrente).
- **Dev**: **UN SOLO subagent Sonnet 5 (xhigh)** per story via Workflow tool con output strutturato (status/summary/commitSha/gates/filesChanged/notesForReview/deviations).
- **Review**: subagent **Opus 4.8 (xhigh)** adversarial — unico layer adversarial, MAI abbassarlo (se temporaneamente indisponibile: riprovare, mai degradare); briefato coi notesForReview del dev e col mandato ESPLICITO di chiudere in prima persona i gap dichiarati; priorità zero: **full suite e2e su DB fresco, BUILD DI PRODUZIONE in modalità CI** (`CI=1 npx playwright test`). I fix li applica la sessione principale (il reviewer non ha Edit/Write).
- **Regola dalla retro Epic 9 (AI-2, anche in CLAUDE.md)**: un'assumption di DOMINIO si ratifica con l'utente (AskUserQuestion) PRIMA di implementare — mai spedirla "da confermare".
- **Skill `karpathy-guidelines`** in ogni prompt di dev e review; **stories con UI**: dev DEVE usare `design-taste-frontend` + `ui-ux-pro-max` + verifica Playwright MCP. Note operative: `browser_resize` può mancare (mobile → markup review/e2e, dichiararlo); il credential guard può bloccare il login MCP interattivo dei subagent — workaround sanzionati: script Playwright throwaway che legge `process.env`, o la prova via e2e reale.
- **Regole utente**: ogni **epic ha la sua PR**; ogni **story i suoi commit** (story file → implementazione → review record/fix); a **epic finito**: `/handoff`, push, PR, **STOP**. **Lezione ripetuta DUE volte: MAI due sessioni di sviluppo in parallelo dalla stessa base senza coordinamento** — sia il 10/07 (Epic 10 ∥ TD-5) sia questa fusione (Epic 11 ∥ TD-5) sono costate conflitti su handoff/sprint-status e una ri-verifica completa; il rischio semantico è reale (TD-5 ha cambiato il formato money mentre gli epic scrivevano test che asseriscono importi).
- **Identità git**: `git config user.email noreply@anthropic.com && git config user.name Claude`; dopo ogni commit di subagent `git commit --amend --no-edit --reset-author` PRIMA del push. Pushare SUBITO dopo ogni commit. MAI force-push di commit già pushati.
- Reset DB (`npm run db:reset`, SOLO sessione principale) PRIMA di ogni dev E di ogni review.

## Current Progress

- **Epic 1..10 DONE e MERGED** (PR #2..#14) + TD-1..4 — dettagli negli handoff archiviati (`docs/handoffs/HANDOFF-*.md`).
- **Retro Epic 9 + TD-5 MERGED (PR #15, 11/07)**: retro formale (`epic-9-retro-2026-07-10.md`, action item in sprint-status); TD-5 = 6 fix chirurgici (money-format deterministico `useGrouping:'always'` — separatore migliaia SEMPRE in it; school `from>to` degrada al default; locale diario threadato; "Azzera filtri" PPR nascosto al load e reset→APPROVED; updateBooking ricontrolla le scadenze al cambio giorno; pg DeprecationWarning chiusa come non-fixabile-a-call-site).
- **Fix flake e2e (PR #17, branch `claude/epic-e2e-check-failures-nut6za`)**: `ppr-register:292` (il test derivava il giorno dell'ETA in UTC mentre il registro bucketizza in Europe/Rome — deterministico rosso tra le 22 e le 24 UTC in CEST; ora gli helper ritornano l'ETA inviata e il test la formatta col giorno di Roma) e `ppr-register:206` (race reale: il prefill async della tassa di default sovrascriveva un valore già digitato — ora riempie solo il campo vuoto).
- **QUESTO branch `claude/flight-log-schema-design-9tmjqn` (PR #16) — EPIC 11 COMPLETO + merge di main:**
  - **Change request ratificato** (3 risposte utente): durata SEMPRE derivata atterraggio−decollo; orari+aeroporti OBBLIGATORI sui voli nuovi (storia resta null); PIC copre sempre pilota/allievo/istruttore → MAI memorizzato, solo derivato. Suggerimento QTB/libretto PDF: NON richiesto, resta follow-up candidato.
  - **11.1 campi logbook e durata derivata DONE** (review fixes-required → fixed): `Flight` + `departureAirfield`/`arrivalAirfield`/`takeoffAt`/`landingAt` (nullable, storia intatta), `takeoffs`/`landings` NOT NULL DEFAULT 1 (migrazione 30, hand-written con backfill), `minutes` e `flightDate` DERIVATI server-side (giorno ROMA via `dateOnlyInZone` — non UTC), 422 `FLIGHT_TIMES_INVALID`/`FLIGHT_DATE_IN_FUTURE`, contaore/pricing/pacchetti INVARIATI a parità di minutes, hourMeter coppia informativa opzionale. POST /flights contratto BREAKING deliberato (nessun consumer esterno). 111-F1 fixato; 111-N1 ratificato; 111-N2 delegato a 11.3 (fatto).
  - **11.2 registro logbook, PIC e scheda persona DONE** (review **clean-pass**): colonne compatte tratta/orari/dec.-att./PIC (helper puro `src/lib/flight-pic.ts` — PIC MAI memorizzato), DD/MM/YYYY sulle superfici voli, pannello "Ultimi voli" REALE su `people/[id]` con link per-ruolo. Lezione: `hasText` substring — regex `\b`-anchored in flight-reversal.spec.
  - **11.3 date italiane + export logbook DONE** (review **clean-pass**): retrofit `formatDateOnly` su 11 superfici (audit CHIUSO), xlsx voli a 15 colonne SEPARATE, PDF voli a 12 colonne COMPATTE; 3 bug PDF reali trovati coi render veri e fixati (`PdfColumn.width` pesi flex retro-compatibili, trattino spaziato, freccia ASCII solo nel PDF).
  - **Merge di origin/main (post-PR #15) in questo branch**: conflitti solo documentali (handoff, sprint-status), codice auto-fuso; ri-verifica del tree fuso: v. gate sotto.
- **Gate del tree fuso (Epic 11 + TD-5 + fix flake)**: v. descrizione PR #16 aggiornata — gates e full suite CI-mode su DB fresco rieseguiti dopo il merge. **Migrazioni: 30** (+1: `20260710130000_add_flight_logbook_fields`).
- Commit Epic 11 (in ordine): `02e71b9` → `4a79b2a` → `a710d4a` → `d458a6c` → `c490bf3` → `6bf6ded` → `dfe6056` → `11005c1` → `455ead8` → `a0abb71` → `0a5d125` → `c7e1af3` → `94729bd` → `7e8af27` (handoff) → merge di main + questo handoff fuso. Tracking: `sprint-status.yaml` — epic-11 done; action_items retro Epic 9 preservati.

## What Worked

- Il ciclo consolidato (Explore recon in parallelo → story file Fable → dev Sonnet via Workflow → review Opus col mandato chiudi-tu-i-gap → fix in sessione principale) ha chiuso 3/3 stories Epic 11 e il TD-pass multi-item.
- **La verifica su artefatti REALI paga**: i 3 bug PDF di 11.3 erano invisibili a unit test e magic-byte check — trovati SOLO renderizzando il PDF vero. Idem 111-F1 (verifica UI live del reviewer).
- I reviewer hanno chiuso in prima persona i gap dichiarati dai dev (INSERT psql di voli storici, simulazione backfill, root-cause del flake orario `ppr-register:292` — poi fixato in PR #17 esattamente su quella diagnosi).
- Story file con "decisioni vincolanti" + elenco CHIUSO (audit date 11.3): deviazioni poche e SEMPRE dichiarate, tutte ratificate.

## What Didn't Work

- **Due sessioni di sviluppo in parallelo dalla stessa base, DI NUOVO** (v. regole): seconda fusione handoff/sprint-status in due giorni. Coordinare sempre: o sequenziali, o su superfici disgiunte dichiarate.
- **`hasText` con valori H:MM o date**: substring match → collisioni con colonne nuove (lezione 11.2, stessa classe di 103-F1). Convenzione: regex `\b`-anchored o assert esatti sulla cella.
- **Accumulo dati negli e2e ripetuti in sessione**: righe oltre pagina 1 → falsi fail (aircraft-rates, bookings `FUTURE_DAY`). Il full-run su DB FRESCO resta l'arbitro.
- **Giorni di calendario negli e2e**: MAI derivarli con `toISOString()` quando il backend bucketizza in Europe/Rome (`ppr-register:292`, fascia rossa 22–24 UTC) — usare il giorno di Roma dell'istante reale inviato (fix in PR #17, helper `romeDateOnly` nello spec).

## Key Decisions (oltre a quelle nei story file)

- **Logbook**: durata = atterraggio−decollo SEMPRE (floor 1); `flightDate` = giorno di decollo in Europe/Rome; aeroporti testo libero prefillati dal nome base; PIC derivato (non-SCHOOL → person; SCHOOL solo → allievo; SCHOOL dual → istruttore), MAI colonna DB; contratto POST /flights breaking ratificato (Flutter non esiste ancora).
- **Formato money (TD-5, cambio visibile)**: separatore migliaia SEMPRE presente in it anche sotto 10.000 € (`1.500,00 €`) — determinismo SSR/client. Ogni asserzione futura su stringhe money deve aspettarselo.
- **Export**: parità permessi export=vista via riuso dei list service; cap 10k xlsx / 2k pdf → 422 `EXPORT_TOO_LARGE`; xlsx colonne separate (15) vs PDF compatte (12) — divergenza sancita; separatori ASCII solo nel PDF (vincolo WinAnsi); email long-form date DELIBERATO (escluso dal retrofit DD/MM/YYYY).
- **Ricontrollo scadenze su spostamento prenotazione (TD-5)**: SOLO al cambio del GIORNO di volo; niente `force` sull'update (deferral).
- **Deferred aperti** (lista riconciliata post-TD-5 + Epic 10 + Epic 11):
  1. Nome aviosuperficie nel form PPR pubblico (la config esiste da 10.2 — micro-story).
  2. TOCTOU rate-limit PPR + trust `x-forwarded-for` (scelte infra al go-live).
  3. `closedByUserId` non nel DTO (additivo, quando Flutter).
  4. Description movimento PPR in inglese (solo su richiesta utente).
  5. Coda retry email NFR-7 (infra post-MVP).
  6. `force` su updateBooking (TD-5, su richiesta).
  7. 101-N1 / 102-N1 (accettati): 422 locale/format nel ramo JSON; header colonne PDF non ripetuto sulle pagine 2+.
  8. 103-N1: audit selettori nav non-scoped negli e2e pregressi.
  9. Fixture `FUTURE_DAY` in bookings.spec.ts (accumulo su DB non resettato).
  10. pg DeprecationWarning: non-fixabile-a-call-site (sparirà con upgrade pg/Prisma).
  11. Epic 11: 112-N1 a11y tabella voli (`scope="col"` + caption); 112-N3/113-N2 naming `moneyLocale`; 113-N1 overflow PDF token non spezzabili (marche senza max-length); 113-N3 mock exports `as never` → factory tipizzata; QTB/libretto pilota PDF (suggerito, mai richiesto).
  - CHIUSI: hydration money-format, 92-N2, 93-N2, "Azzera filtri" PPR, ricontrollo scadenze updateBooking (TD-5); flake `ppr-register:292` e `:206` (PR #17).

## Next Steps (in ordine)

1. **Merge in main**: PR #17 (fix flake) e poi PR #16 (questo branch, Epic 11 + merge main) — sessione dell'11/07 su mandato utente "mergia e chiudi tutte le PR".
2. **STOP.** La prossima sessione parte SOLO da una decisione dell'utente. Candidati naturali: (a) micro-TD sui deferred più concreti (nome aviosuperficie nel form PPR, header PDF multi-pagina, a11y tabella voli, max-length marche + ellipsis PDF, audit selettori 103-N1); (b) QTB/libretto pilota PDF (l'infrastruttura c'è tutta); (c) go-live prep (hosting, provider email, rate limiting — v. ARCHITECTURE-SPINE «Deferred»); (d) v2 dal PRD §6.2: app Flutter sulle API v1 (ATTENZIONE: contratto POST /flights cambiato in 11.1), pagamenti online, notifiche push.
3. A inizio prossima sessione: bootstrap via hook; baseline attesa sul tree fuso: **200 e2e / 1222 unit / 30 migrazioni** su DB fresco (CI-mode/prod build). Flake residui noti: `cash-report` ECONNRESET sotto load, login-redirect su webServer freddo (i due `ppr-register` sono fixati).
4. Se si sviluppa: ciclo per story INVARIATO (v. sezione ruoli); applicare AI-2 (ratifica assumption) e AI-3 (convenzioni cross-cutting negli story file).

Ambiente (fallback manuale se l'hook SessionStart non gira): `service postgresql start`; ruolo/db airmanager; `.env` da `.env.example` (AUTH_SECRET random, JOBS_SECRET); `npm install`; `npx prisma migrate deploy && npx prisma db seed` (**30 migrazioni**; se il seed fallisce su SEED_ADMIN_PASSWORD: `set -a && . ./.env && set +a`); Mailpit `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025` in background. Reset DB (SOLO sessione principale): `npm run db:reset` PRIMA di dev E review. Prima di ogni run e2e: `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`). Build SEMPRE via `npm run gates`. MAI `playwright install`. Utenti seed: admin@ / staff@ / pilot@ / instructor@ / student@airmanager.local (password = SEED_ADMIN_PASSWORD).
