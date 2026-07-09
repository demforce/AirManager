# HANDOFF — AirManager (aggiornato: Epic 7 DONE + merge della bonifica TD-1/2/3; pronti per Epic 8)

## Goal

Costruire AirManager, il gestionale per un'aviosuperficie (piloti, velivoli, voli, PPR, finanze, scuola volo, tariffe, prenotazioni, scadenze, RBAC, export Excel/PDF) con il metodo BMAD v6: PRD → architettura → epics → stories → dev → review. Fase corrente: Fase 2, sviluppo story-by-story degli epic.

**NOTA CRONOLOGIA (importante)**: due sessioni hanno lavorato IN PARALLELO da main@9fdfdf4 — questa (Epic 7, branch `claude/handoff-resume-gcly8l`, PR #9) e una sessione di bonifica tech-debt (TD-1/2/3, PR #8, **già merged su main**). Nessuna delle due vedeva l'altra: l'Epic 7 NON usa ancora ciò che la bonifica ha introdotto (SearchCombobox, Idempotency-Key — vedi Deferred). Il merge di main nell'epic branch è stato fatto a fine epic (conflitti solo su handoff/sprint-status, risolti fondendo i contenuti; gate ri-eseguiti sul risultato). L'handoff della bonifica è archiviato in `docs/handoffs/HANDOFF-2026-07-08-1835.md` — leggerlo per i dettagli TD.

## Ruoli modello e regole di processo (config approvata dall'utente 2026-07-07, confermata su epic 5, 6, 7 e bonifica)

- **Stories**: sessione principale **Fable 5 (effort extra-high)**. REGOLA UTENTE (dalla sessione epic 7): usare SEMPRE i comandi BMAD — story via skill `bmad-create-story`, dev via `bmad-dev-story` (invocata DAL subagent), review via `bmad-code-review` (invocata DAL subagent).
- **Dev**: **UN SOLO subagent Sonnet 5 (extra-high)** per story via Workflow tool con output strutturato (schema: status/summary/commitSha/gates/filesChanged/notesForReview/deviations). NIENTE fan-out ultracode.
- **Review**: subagent **Opus 4.8 (extra-high)** adversarial via `bmad-code-review` — l'unico layer adversarial, mai abbassarlo; briefarlo coi notesForReview del dev, richiedere verifiche EMPIRICHE (race parallele, matrice RBAC via API reale, psql, Playwright MCP) e assegnare la **priorità zero** esplicita (consolidata: full-suite e2e su DB fresco che il dev non può avere). Il reviewer protegge anche dagli errori del coordinatore (lezione TD-3 M1). I fix li applica la sessione principale.
- **Regole utente**: ogni **epic ha la sua PR**; ogni **story ha i suoi commit** (story file → implementazione → review record/fix); a **epic finito**: `/handoff`, push, aggiornare la PR, **STOP** — l'epic successivo parte in una NUOVA sessione.
- **Stories con UI**: il dev DEVE usare le skill `design-taste-frontend` E `ui-ux-pro-max` (`.claude/skills/ui-ux-pro-max`, DB: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`), stile minimalista editoriale esistente, verifica interattiva Playwright MCP (anche mobile 375×812 se l'AC lo chiede) prima degli e2e.
- **Identità git**: il committer dei subagent risulta "Unverified" per il hook → dopo ogni commit del dev: `git commit --amend --no-edit --reset-author` PRIMA del push. MAI force-push di commit già pushati (il classifier lo blocca, giustamente).

## Current Progress

- **Epic 1..6 DONE e MERGED** (PR #2..#7). **Bonifica TD-1/2/3 DONE e MERGED** (PR #8: chiusi TUTTI i finding deferiti epic 2–6; idempotenza `Idempotency-Key` sulle 5 POST monetarie via `apiRoute`; `SearchCombobox` typeahead oltre il cap 100 sui picker della pagina voli; hardening e2e strutturale su people/flights/reversal specs — dettagli nel handoff archiviato).
- **Epic 7 (Prenotazioni velivoli) DONE** — branch `claude/handoff-resume-gcly8l`, **PR #9** (titolo/body aggiornati), main merged nel branch a fine epic:
  - **7.1 creazione prenotazione** (`Booking` mirror di `Flight`: personId prenotante + instructorProfileId? + actorUserId creatore; intervallo semi-aperto `[startsAt, endsAt)`; lock `FOR UPDATE` sulla riga Aircraft in tx = guard overlap airtight, NIENTE exclusion constraint; RBAC: `bookings.manage.own` TOLTO a STUDENT → allievo solo = 403 da authorize; codici 422 stabili `AIRCRAFT_OUT_OF_SERVICE`/`BOOKING_IN_PAST`/`PERSON_NOT_BOOKABLE`; 4 helper `self.read` per i picker; primi datetime pieni del progetto: wire UTC ISO, `datetime-local` in form, display Europe/Rome) — review clean pass (race provata a 4 racer; N1 fixato: refine Zod confronta ISTANTI mai stringhe ISO).
  - **7.2 vista calendario** (dentro `/dashboard/bookings`: header → calendario → form → lista; `view=day|week`/`date` sanitizzati; `src/lib/zoned-time.ts` con doppia correzione DST testata sulle transizioni 2026; `listCalendarBookings` non paginata range max 8gg + `GET /api/v1/bookings/calendar`; proiezione blocchi SERVER-side; nav a `self.read` → l'allievo vede il calendario; mobile 375×812) — review fixes-required: F1 (bound anni su `?date` hand-edited → 500) e F2 (ancoraggio blocchi bottom-clamped) fixati con e2e di regressione.
  - **7.3 modifica e cancellazione** (soft-cancel `BookingStatus` + tracking `updatedBy`/`cancelledBy`; cancellata = slot libero, filtro ACTIVE ovunque; own = personId O instructorProfile match; own-path 422 `BOOKING_ALREADY_STARTED` dopo l'inizio, staff senza vincoli temporali; edit in tx con multi-lock `ORDER BY id FOR UPDATE` e guard fuso nella write atomica `updateMany WHERE status='ACTIVE'` — chiude la TOCCTOU edit-vs-cancel; UI row actions `bookings-list.tsx`; debito e2e crosstalk href saldato) — review clean pass (edit-vs-cancel ~20 race, crossing-move 12 run zero deadlock; D1 deferred: 409 senza code distintivo).
  - **7.4 blocco scadenze critiche** (`ExpiryType.blocksBooking` backfillato per medica/licenza, checkbox admin; regola sulla DATA DEL VOLO via `dateOnlyInZone` — il giorno di scadenza stesso è valido, convenzione 5.2; assente ≠ scaduto; solo createBooking, deferral dichiarato su edit; bloccanti → 422 `EXPIRED_DOCUMENTS`, non bloccanti → `warnings` nella risposta `{ booking, warnings }`; force solo staff con motivo, stamp solo su bypass reale) — review clean pass ZERO finding. Il dev era stato interrotto da un riavvio container a metà: ripreso con successo sul lavoro parziale (vedi What Worked).
- **Gate di fine epic pre-merge** (review 7.4 su DB fresco): lint 0 errori (warning benigno noto), typecheck pulito, 927/927 unit, build verde, e2e 121/129 (8 fail = classi baseline fuori dal diff). **Gate post-merge con main (TD)**: vedi il commit di merge — ri-eseguiti dalla sessione principale sul risultato fuso.
- Tracking: `sprint-status.yaml` — epic-1..7 done + td-1/2/3 done. Story file completi: `7-*.md` e `td-*.md`.

## What Worked

- Il ciclo BMAD-comandi: `bmad-create-story` in sessione → dev subagent con `bmad-dev-story` → reviewer con `bmad-code-review`. Su 4 story epic 7: 3 clean pass (7.4 a zero finding), 1 fixes-required con 2 should-fix applicati in sessione.
- **Reviewer su DB fresco come priorità zero**: scioglie sistematicamente il rumore da volume del dev; criterio "byte-identico fuori dal diff = regressione impossibile per costruzione" per classificare i fail e2e estranei.
- **Ripresa da riavvio container a metà dev (7.4)**: nota "RESUME AFTER CONTAINER RESTART: il lavoro parziale è TUO, inventarialo con git status/diff, verificalo, continua" nello script del workflow + `Workflow({scriptPath, resumeFromRunId})` — il dev ha ereditato, verificato riga per riga (1 solo drift trovato) e completato senza rifare.
- Deviazioni dichiarate di qualità dai dev (7.3: guard fuso nella write atomica che chiude una TOCTOU non vista dalla story; 7.4: pulizia DB tentata, bloccata dal classifier, documentata invece di forzata) — il reviewer le giudica, non si nascondono.
- Race di concorrenza SEMPRE provate dal vivo in review: 4 POST paralleli, edit-vs-cancel, crossing-move senza deadlock.

## What Didn't Work

- **Due sessioni parallele sullo stesso repo = conflitti garantiti su handoff/sprint-status e rischio di lavoro divergente** (l'epic 7 ha costruito select native cappate a 100 mentre la bonifica introduceva SearchCombobox proprio per quello). Se ricapita: controllare `git fetch origin main && git log ..origin/main` a INIZIO sessione e prima di ogni handoff; i file di coordinamento (handoff, sprint-status) si risolvono fondendo i contenuti, mai scegliendo un lato.
- **Il DB di sessione mai resettato avvelena progressivamente gli e2e** (compounding fino a 169+ Person): mitigato con reviewer su DB fresco e assert run-unique; l'hardening strutturale TD-1/TD-3 sulle spec people/flights dovrebbe aver ridotto la classe — RI-BASELINARE la full suite su DB fresco a inizio Epic 8 prima di fidarsi delle vecchie classificazioni flaky.
- **Commit dei subagent "Unverified"**: amend+reset-author prima del push; NON force-push su commit già pushati.
- Riavvii container a metà epic (1 in questa sessione) e un tentativo di review morto per **session limit** ("resets 10pm UTC"): recovery collaudata — postgres/Mailpit su, `git status`/`migrate status` (il filesystem sopravvive), ripulire il dev server orfano su :3000 (`fuser -k 3000/tcp`), resume o rilancio da zero.

## Key Decisions (oltre a PRD/spine/CLAUDE.md, story files e handoff TD archiviato)

- **STUDENT senza `bookings.manage.own`** (7.1): l'allievo non prenota/gestisce da solo; visibilità calendario via `self.read` (7.2).
- **Concorrenza prenotazioni = lock `FOR UPDATE` sulla riga Aircraft** (create singolo; edit multi-lock dedupe `ORDER BY id`), niente exclusion constraint; guard di stato SEMPRE fusi nella write atomica, mai check-then-write.
- **Semantica intervalli semi-aperta** `[startsAt, endsAt)` ovunque; back-to-back legittimo.
- **Tre moduli tempo distinti**: `date-only.ts` (@db.Date), `time.ts` (display Europe/Rome), `zoned-time.ts` (wall-time/mezzanotte di zona, doppia correzione DST); proiezioni calendario server-side.
- **Soft-cancel libera lo slot**; tracking = campi dedicati, niente tabella audit.
- **Blocco scadenze**: flag sul TIPO; confronto con la data del VOLO; assente ≠ scaduto; force solo staff con motivo, stampato solo su bypass reale; risposta create = `{ booking, warnings }`.
- (TD-2) Idempotenza = opzione di `apiRoute`, chiave per-utente, gate dopo Zod, errore libera il key. (TD-3) `SearchCombobox` + param `profile` su `GET /people` = il contratto dei picker oltre il cap.
- **Deferred aperti** (lista fusa post-merge — quella storica epic 2–6 è TUTTA chiusa da TD-1/2/3):
  1. **Picker prenotazioni → `SearchCombobox`** (nuovo, dal merge): il form di 7.1 usa select native cappate a 100 per velivoli/persone/allievi/istruttori, costruite prima che TD-3 esistesse — migrarle a `SearchCombobox` (+ eventuale `profile` esteso) alla prima story che tocca la pagina bookings.
  2. **`Idempotency-Key` su `POST /api/v1/bookings`** (nuovo, dal merge): mutante e a rischio doppio-submit (il retry di rete di un client mobile può creare due prenotazioni back-to-back... no, identiche → la seconda 409 per overlap: rischio basso, ma il pattern TD-2 è pronto — valutare alla prima occasione).
  3. ConflictError senza `code` distintivo (7.3 D1 — fix minimo: code opzionale come ValidationError, per il client Flutter).
  4. Ricontrollo scadenze su `updateBooking` (7.4, loophole MVP dichiarato).
  5. pg.Pool DeprecationWarning sotto concorrenza (residuo TD-1, internals Prisma, innocuo).
  6. TD2-D3 ramo `Prisma.JsonNull` senza test; TD1-D2 commento fuorviante cosmetico; N2 7.1 ordine nomi tabella-vs-picker; N1 7.2 min-height overlap cosmetico.
  7. Ri-baseline della classe flaky e2e post-hardening TD (vedi What Didn't Work).

## Next Steps (in ordine)

1. **Verificare che la PR #9 sia mergeable** dopo il merge commit di main nel branch (fatto in questa sessione, coi gate ri-eseguiti) e farla mergiare dall'utente. Poi questa sessione si FERMA (regola utente).
2. **NUOVA SESSIONE per Epic 8 (PPR piloti esterni)** — story 8.1 (form PPR pubblico): Fable crea `8-1-ppr-public-form.md` via `bmad-create-story`. Note dominio: form PUBBLICO bilingue (prima superficie non autenticata oltre login/set-password — attenzione a middleware/`PUBLIC_API_PATHS`, rate limit applicativo NFR); `PprRequest` nell'ERD (`PprRequest ||--o{ CashMovement "tassa (opz.)"`); `design-taste-frontend` PIENAMENTE in scope (landing/form pubblica, non dashboard); email di esito nelle story successive con Mailpit; tassa di atterraggio → cassa (categoria seed "PPR" da 3.4). Per eventuali picker: `SearchCombobox`, non select cappate. A inizio sessione: ri-baseline full suite e2e su DB fresco.
3. Ciclo per story INVARIATO (sempre comandi BMAD, un commit per passo, amend reset-author sui commit dei subagent, reset DB prima di dev E review).
4. PR: quando PR #9 viene merge-ata, Epic 8 = nuova PR su main (o stacked su #9 se non ancora merged).
5. Pendenze non bloccanti: deferred sopra; retrospettive opzionali; Context7 ancora bloccato (WebFetch su raw.githubusercontent.com funziona).

Ambiente da ripristinare a inizio sessione (container nuovo): `service postgresql start`; se manca ruolo/DB: `sudo -u postgres psql -c "CREATE ROLE airmanager LOGIN PASSWORD 'airmanager' CREATEDB;" && sudo -u postgres createdb -O airmanager airmanager`; `.env` da `.env.example` (AUTH_SECRET random; include `JOBS_SECRET` dev); `npm install`; `npx prisma migrate deploy && npx prisma db seed` (**23 migrazioni**: 19 storiche + 1 TD-2 idempotency + 3 epic 7); Mailpit: `go install github.com/axllent/mailpit@latest` poi `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025` con Bash `run_in_background: true`. Build SEMPRE `env -u NODE_ENV npx next build`. Reset DB (SOLO sessione principale): `sudo -u postgres psql -c 'DROP DATABASE airmanager WITH (FORCE);'` + createdb + deploy + seed — PRIMA di lanciare dev E review. PRIMA di ogni run e2e di gate: `curl localhost:3000` deve FALLIRE (altrimenti `fuser -k 3000/tcp`). MAI `playwright install`. Git identity: `git config user.email noreply@anthropic.com && git config user.name Claude`; amend+reset-author sui commit dei subagent.
