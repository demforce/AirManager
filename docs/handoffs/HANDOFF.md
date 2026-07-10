# HANDOFF — AirManager (aggiornato: 2026-07-10, Epic 9 DONE + TD-4; pronti per Epic 10)

## Goal

Costruire AirManager, il gestionale per un'aviosuperficie (piloti, velivoli, voli, PPR, finanze, scuola volo, tariffe, prenotazioni, scadenze, RBAC, export Excel/PDF) con il metodo BMAD v6: PRD → architettura → epics → stories → dev → review. Fase corrente: Fase 2, sviluppo story-by-story. **Resta SOLO l'Epic 10 (export Excel/PDF e dashboard per ruolo)** — ultimo epic del piano.

## Ruoli modello e regole di processo (config utente 2026-07-07, confermata su epic 5–9)

- **Stories**: sessione principale **Fable 5 (xhigh)**, via `bmad-create-story` DOPO ricognizione Explore (agente read-only, anche in parallelo ad altro lavoro).
- **Dev**: **UN SOLO subagent Sonnet 5 (xhigh)** per story via Workflow tool con output strutturato (schema: status/summary/commitSha/gates/filesChanged/notesForReview/deviations). Niente fan-out.
- **Review**: subagent **Opus 4.8 (xhigh)** adversarial via `bmad-code-review` — unico layer adversarial, MAI abbassarlo; briefato coi notesForReview del dev e col mandato ESPLICITO di chiudere in prima persona i gap di verifica dichiarati; priorità zero: **full suite e2e su DB fresco, su BUILD DI PRODUZIONE in modalità CI** (`CI=1 npx playwright test` — da 9.2/9.3 è lo standard: elimina i falsi rossi da contention del dev server). I fix li applica la sessione principale (il reviewer non ha Edit/Write).
- **Skill `karpathy-guidelines`** in ogni prompt di dev e review; **stories con UI**: dev DEVE usare `design-taste-frontend` + `ui-ux-pro-max` + verifica Playwright MCP (nota: `browser_resize` può mancare nell'MCP — per il mobile 375×812 usare e2e/markup review e dichiararlo).
- **Regole utente**: ogni **epic ha la sua PR**; ogni **story i suoi commit** (story file → implementazione → review record/fix); a **epic finito**: `/handoff`, push, PR, **STOP** — l'epic successivo parte in una NUOVA sessione.
- **Identità git**: `git config user.email noreply@anthropic.com && git config user.name Claude`; dopo ogni commit di subagent `git commit --amend --no-edit --reset-author` PRIMA del push (lo stop-hook lo pretende; il push firma i commit lato server). MAI force-push di commit già pushati.

## Current Progress

- **Epic 1..8 DONE e MERGED** (PR #2..#10) + tech-debt TD-1/2/3 (PR #8) + harness (PR #11, #12). Dettagli negli handoff archiviati.
- **Questa sessione, branch `claude/handoff-documentation-sawbdw` (PR da aprire subito dopo questo handoff)** — 12 commit, tutte le story col ciclo completo story-file → dev → review:
  - **TD-4 logout-session-race DONE** (finding prioritario post-Epic 8, review **clean-pass**): `src/proxy.ts` non usa più il wrapper `authEdge` (che ri-emetteva il session cookie a OGNI richiesta — nessun throttle `updateAge` nel ramo JWT di @auth/core) ma `getToken` di `next-auth/jwt` (zero Set-Cookie): la race col Set-Cookie di cancellazione dello `signOut` è morta alla fonte (15/15 cicli logout su `next start`, 12/12 del dev). `auth-edge.ts` rimosso. Trade-off documentato: niente sliding session (scadenza assoluta 30gg dal login). CI e2e RIPRISTINATA su build di produzione + `AUTH_TRUST_HOST` (revert di b95c066). `e2e/login.spec.ts` esteso col secondo ciclo di logout.
  - **9.1 assegnazione allievi–istruttori DONE** (review fixes-required → **fixed**): `StudentInstructorAssignment` m2m sui profili (AD-11), permesso nuovo `school.manage.any` (STAFF+ADMIN), `school.service.ts`, API `people/{id}/instructors[/{iid}]` + `school/students` self-scoped, panel scheda persona, pagina `/dashboard/school` (roster con ore SCHOOL batched + badge scadenze), seed `instructor@airmanager.local`/`student@airmanager.local`. **Finding 91-F1 (major)**: mancava il check `Person.archivedAt` nei resolver (persone archiviate assegnabili/visibili) — fixato coi code 422 folded + filtro roster; 91-F2 gating panel su profilo attivo.
  - **9.2 diario di addestramento DONE** (review **clean-pass**): modello `TrainingNote` (autore = InstructorProfile, `noteDate` date-only, volo SCHOOL collegato opzionale con 422 `FLIGHT_NOT_LINKABLE`), triplice accesso lettura (any / istruttore assegnato / own-access self.read — con profilo disattivato il proprio diario resta leggibile), edit solo autore o admin entro 7 giorni poi 409 `NOTE_IMMUTABLE` (admin incluso; permesso `school.notes.manage.any` admin-only via ALL_PERMISSIONS — pattern: permesso in catalogo assegnato a NESSUN ruolo esplicito), GET paginato envelope, pagina `/dashboard/school/[id]`, tile home "Il mio diario" (flag `hasActiveStudentProfile` in /me), colonna "ultima annotazione" nel roster (chiude il deferral 9.1). Due helper page-only (`getTrainingDiaryHeader`, `listStudentSchoolFlights`) con authorize proprio — deviazione dev corretta (le API letterali avrebbero risposto 403). Nit 92-N1 fixato (404 "Training diary not found."), 92-N2 deferred (locale nel formatter client).
  - **9.3 riepiloghi ore scuola DONE** (review **clean-pass**, zero fix): `getStudentHourSummaries`/`getInstructorHourSummaries` (batched, from/to inclusivi su `flightDate` date-only), API `school/summaries/{students,instructors}`, filtro NUOVO `instructorPersonId` in `listFlights` (guardia own per non-staff, chirurgico — canary flights verde), landing school due-facce (gestore: riepiloghi con preset periodo e drill-down "Apri nel registro"; istruttore: roster + "Le mie ore scuola"), nav Scuola anche a staff/admin. NESSUNA migrazione. Review: numeri provati su dataset costruito (DC 60/solista 45/checkride e stornati ESCLUSI, bounds inclusivi esatti); full suite prod-build **164 test, 0 fail veri**.
- **Gate di fine epic** (review 9.3, DB fresco, prod build): lint 0 errori (warning benigno noto), typecheck pulito, **1156/1156 unit**, build verde, e2e **164 test / 0 fail veri** (2 flaky pre-esistenti retry-green: cash-report:123 ECONNRESET, ppr-register:206). **Baseline per l'Epic 10: 164 e2e, 1156 unit, 28 migrazioni.**
- Tracking: `sprint-status.yaml` — epic-1..9 done, td-1..4 done, epic-10 backlog. Story file completi `td-4-*.md`, `9-*.md` con Review Record.
- Commit sessione: `1cc3db8`/`1222603`/`ec8ba7f` (TD-4), `49bb0e6`/`b0aa035`/`555f683` (9.1), `68ef6b0`/`a88c96a`/`20e8907` (9.2), `6628c45`/`f101c96`/`2206360` (9.3).

## ⚠️ Assumption di dominio da RATIFICARE con l'utente (9.3)

FR-34 chiede "ore doppio comando e solista separate" ma **il modello dati non ha un flag solista** (i voli SCHOOL richiedono un istruttore; il solista dell'allievo viene registrato come PRIVATE/OTHER senza istruttore). Decisione presa in-story (documentata in `9-3-school-hour-summaries.md` e nei doc-comment del service): **doppio comando = voli SCHOOL non stornati; solista = voli senza istruttore non stornati (qualunque tipo)**; il checkride (PRIVATE/OTHER CON istruttore) non conta in nessun bucket; il riepilogo istruttori conta solo i voli SCHOOL. Coerente col glossario PRD ("l'allievo vola solo in Voli scuola o solista autorizzato"). **Se l'utente vorrà un flag esplicito "solista" a schema, è una story futura** (la derivazione attuale è pura lettura, reversibile).

## What Worked

- Il ciclo comandi-BMAD con reviewer "chiudi-tu-i-gap": 4/4 story concluse in sessione; 91-F1 (archived leak) trovato SOLO dalla verifica empirica live del reviewer — il pattern "dev dichiara onestamente + reviewer chiude" continua a pagare.
- **Full suite e2e su BUILD DI PRODUZIONE in modalità CI per le review** (da 9.2): elimina l'intera classe di falsi rossi da contention del dev server (il dev 9.2 aveva 16 fail da timeout login; la stessa suite sulla prod build era pulita). Il dev server resta ok per gli e2e mirati.
- Ricognizione Explore prima di ogni story file (lanciabile in parallelo al baseline/altre attività): i story file citavano righe esatte e i dev non hanno avuto sorprese; la ricognizione 9.3 ha scovato PRIMA dello sviluppo il buco di dominio DC/solista.
- Workflow tool con output strutturato per dev e review: notesForReview/deviations del dev diventano direttamente il briefing del reviewer.
- Fix di review applicati dalla sessione principale con ri-verifica live (curl su dev server) + unit di regressione: chiusura rapida senza secondo giro di dev.

## What Didn't Work

- **Full suite e2e in dev-mode sotto contention della sandbox**: fail massicci e non deterministici (61 poi 10 per il dev TD-4; 16 per il dev 9.2, tutti timeout login) con set disgiunti tra run — MAI diagnosticarli come regressioni senza isolamento; la risposta strutturale è la prod build (sopra). `ppr-register` resta l'unico flake che a volte è rosso anche isolato (~1 su 2-3 run, documentato).
- Il tool `browser_resize` può mancare nel Playwright MCP: la verifica mobile del reviewer 9.2 è passata da markup review + screenshot del dev. Dichiararlo invece di fingere la verifica.
- Lo stop-hook git-check segnala "Unverified" sui commit finché non vengono pushati (la firma avviene lato server): amend+reset-author e push presto, non accumulare.

## Key Decisions (oltre a quelle nei story file)

- **Auth/logout (TD-4)**: il middleware non emette MAI Set-Cookie di sessione; sliding session sacrificata (30gg assoluti) — accettato per MVP. `secureCookie` derivato da `req.nextUrl.protocol` (Next risolve x-forwarded-proto): coerente emittente/lettore anche dietro reverse proxy TLS uniforme (provato dal reviewer).
- **Permessi school**: `school.manage.own` (INSTRUCTOR, self-scoped nei service), `school.manage.any` (STAFF+ADMIN), `school.notes.manage.any` (nessun ruolo esplicito = admin-only via ALL_PERMISSIONS — pattern riusabile per override admin senza check di ruolo nei service).
- **Diario**: il diario è DELL'ALLIEVO (istruttore assegnato vede tutte le annotazioni, anche altrui); niente delete (immutabilità post-7gg); finestra = 7×24h esatte UTC da createdAt.
- **Deferred aperti** (oltre agli storici epic 2–8 in HANDOFF-2026-07-09):
  1. 92-N2: locale non threadato nel formatter client del journal (cosmetico, nessuna differenza visibile oggi).
  2. 93-N1: admin senza profilo istruttore vede card "Le mie ore scuola 0:00" (comportamento ratificato; hiding = decisione di prodotto).
  3. 93-N2: la PAGINA school non impone from<=to (l'API sì) — empty state sano su URL manuale.
  4. Flag "solista" persistito a schema (v. assumption sopra) — solo se l'utente lo chiede.
  5. Storici: TOCTOU rate-limit PPR, nome aviosuperficie nel form pubblico, `closedByUserId` non nel DTO, description movimento PPR in inglese, "Azzera filtri" registro PPR, ricontrollo scadenze su updateBooking, pg.Pool DeprecationWarning, coda retry email NFR-7.
  6. Hydration warning pre-esistente in `flights-manager.tsx` (formato money server/client '1.900,00 €' vs '1900,00 €') — notato dal dev 9.3, fuori dai suoi diff; da sistemare quando si tocca quella superficie.

## Next Steps (in ordine)

1. **Aprire la PR di questa sessione** su main dal branch `claude/handoff-documentation-sawbdw` (titolo: Epic 9 scuola volo + TD-4 logout fix) — la fa questa sessione subito dopo questo handoff, poi si FERMA (regola utente). Nella descrizione PR: evidenziare l'assumption DC/solista da ratificare.
2. **NUOVA SESSIONE per Epic 10 (Export e dashboard)** — stories: 10.1 export Excel (FR-26/FR-34 "esportabile": riepiloghi scuola, registro voli, movimenti), 10.2 export PDF, 10.3 dashboard per ruolo. Fable crea ogni story file via `bmad-create-story` DOPO ricognizione Explore. Note: verificare in epics.md il perimetro esatto; per gli export serviranno probabilmente librerie nuove (valutare con Context7/raw.githubusercontent le opzioni correnti per Excel/PDF server-side su Next 16); i riepiloghi scuola 9.3 e il cash report 3.5 hanno già i service da riusare.
3. A inizio sessione: bootstrap automatico via hook; ri-baseline **164 e2e attesi** su DB fresco (meglio in modalità CI/prod build); flake noti sopra.
4. Ciclo per story INVARIATO (v. sezione ruoli). Migrazioni: timestamp DOPO `20260709235408_add_training_notes` (28esima).
5. PR: Epic 10 = branch nuovo + PR nuova su main (o stacked su questa se non ancora merged).

Ambiente (fallback manuale se l'hook SessionStart non gira): `service postgresql start`; ruolo/db airmanager; `.env` da `.env.example` (AUTH_SECRET random, JOBS_SECRET); `npm install`; `npx prisma migrate deploy && npx prisma db seed` (**28 migrazioni**; se il seed fallisce su SEED_ADMIN_PASSWORD: `set -a && . ./.env && set +a`); Mailpit `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025` in background. Reset DB (SOLO sessione principale): `npm run db:reset` PRIMA di dev E review. Prima di ogni run e2e: `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`). Build SEMPRE `env -u NODE_ENV` (o `npm run gates`). MAI `playwright install`. Utenti seed: admin@ / staff@ / pilot@ / instructor@ / student@airmanager.local (password = SEED_ADMIN_PASSWORD).
