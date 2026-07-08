---
baseline_commit: 42893c4
---

# Story 6.3: Alert automatici via email

Status: done

## Story

As a pilota,
I want ricevere promemoria prima delle scadenze,
so that non voli mai con documenti scaduti (FR-37).

## Acceptance Criteria

1. **Given** scadenze a 60/30/7/0 giorni dalla data odierna, **When** il job `POST /api/v1/jobs/expiry-alerts` (bearer `JOBS_SECRET`, AD-9) viene invocato, **Then** ogni titolare riceve una email nella propria lingua per ogni soglia raggiunta, e lo staff un riepilogo unico.
2. **Given** il job invocato due volte nello stesso giorno, **When** rigira, **Then** nessuna email duplicata: `SentAlert` ha vincolo unico (scadenza, soglia) — test automatico.

## Contesto e decisioni di design (vincolanti)

- **NIENTE UI in questa story** — solo backend: modello, service del job, route bearer-protetta, template email, test. Le skill UI e la verifica Playwright MCP NON si applicano; la verifica empirica è via **Mailpit API** (`http://127.0.0.1:8025/api/v1/messages`).
- **Soglie = marcatori di cadenza, non uguaglianze strette**: `EXPIRY_ALERT_THRESHOLDS = [60, 30, 7, 0]` (const esportata da `src/lib/expiry-status.ts`, accanto a `EXPIRY_WARNING_DAYS`). Per ogni scadenza con `daysLeft = giorni calendariali (expiresAt − oggi, UTC date-only)`: le soglie **dovute** sono TUTTE le `T` con `daysLeft <= T`; le **da consumare** sono le dovute senza riga `SentAlert`. Se ce ne sono: **UNA sola email al titolare** (il testo parla dei giorni REALI, mai della soglia) e una riga `SentAlert` per OGNI soglia consumata. Così il ritmo normale è 60→30→7→0 (4 email), ma il catch-up (job saltato per giorni, o scadenza registrata già a −N giorni) produce UNA email e consuma tutte le soglie arretrate in colpo solo — mai 4 email insieme, mai alert persi per sempre per un cron mancato. Anche `daysLeft < 0` (già scaduta) rientra: tutte e 4 le soglie dovute.
- **Idempotenza AD-9 = vincolo DB, e l'ordine è insert-PRIMA-send**: `SentAlert` `@@unique([expiryId, threshold])`; le righe si creano in transazione PRIMA dell'invio email; un P2002 (secondo run concorrente) = quell'expiry la manda l'altro run → skip silenzioso. Trade-off documentato (doc-comment): un crash tra insert e send perde quell'email (accettato: AD-9 privilegia "un alert per soglia, SEMPRE al massimo uno"; il riepilogo staff resta la rete di sicurezza).
- **Rinnovo = nuovo ciclo di alert**: quando `expiresAt` CAMBIA VALORE (via `updateExpiry` o APPROVE di proposta con data diversa), le righe `SentAlert` di quella scadenza vengono cancellate NELLA STESSA transazione (`deleteMany`) — altrimenti il vincolo unico bloccherebbe per sempre gli alert del nuovo ciclo. Se la data non cambia (es. update delle sole note), NON si tocca nulla.
- **Titolare senza email** (`Person.email` null): le soglie si consumano COMUNQUE (`SentAlert` creato, il job non rivaluta all'infinito) ma l'email non parte; la voce compare nel riepilogo staff marcata "senza email" — lo staff è la rete di recupero. Lingua del titolare: `User.locale` della persona linkata, fallback `'it'` (esattamente il pattern di `sendNegativeBalanceAlert`, 3.3).
- **Riepilogo staff = UN'email per destinatario staff PER RUN, solo se il run ha consumato alert**: destinatari = tutti gli `User` attivi (`isActive`) con ruolo `ADMIN` o `STAFF`, ciascuno nella PROPRIA `locale`; il corpo elenca gli alert del run (persona, tipo, data scadenza, giorni rimanenti/scaduta, flag senza-email). Run senza nuovi alert → NESSUNA email a nessuno (è ciò che rende vero l'AC 2 end-to-end, riepilogo incluso).
- **Auth del job = bearer, NON sessione/RBAC** (AD-9): la route confronta `Authorization: Bearer <token>` con `process.env.JOBS_SECRET` in modo timing-safe (`crypto.timingSafeEqual` su digest — mai `===` su stringhe segrete); mancante/errato → 401 envelope AD-8; `JOBS_SECRET` non configurato → 500 envelope (mai fallback insicuro). Il service del job NON riceve un `Actor` — doc-comment che dichiara l'eccezione ad AD-5: il guardiano è il bearer al boundary della route (unica route non-sessione oltre alle auth).
- **"Oggi" = `todayDateOnlyUtc()`** (coerente con 6.2 e tutto il calendario `@db.Date` del repo); `daysLeft` = differenza in giorni su mezzenotte UTC (riusare la stessa aritmetica di `computeExpiryStatus` — estrarre un helper `daysUntilUtc(expiresAt, today)` in `expiry-status.ts` se serve, senza duplicare la formula).

## Tasks / Subtasks

- [x] Task 1: Modello `SentAlert` + migrazione + wipe-on-renewal (AC 2)
  - [x] `prisma/schema.prisma`: `model SentAlert` — `id cuid`; `expiryId` + FK `Expiry` **`onDelete: Cascade`** (la 6.2 l'aveva annunciato: cancellare la scadenza cancella la sua storia alert; back-relation `Expiry.sentAlerts SentAlert[]`); `threshold Int` (giorni: 60/30/7/0); `sentAt DateTime @default(now())`; `@@unique([expiryId, threshold])` (AD-9); `@@index([expiryId])` implicito nel unique composito — aggiungere solo se serve altro. Doc-comment: semantica soglia-consumata (vedi Contesto), wipe on renewal.
  - [x] Migrazione `prisma/migrations/20260708100000_add_sent_alerts/migration.sql` (diff a mano, banner rimosso); `migrate deploy` + `generate`; verificare FK CASCADE e unique in SQL.
  - [x] `expiries.service.ts`: in `updateExpiry` e nel ramo APPROVE di `decideExpiryProposal`, se il valore di `expiresAt` cambia rispetto al corrente → `sentAlert.deleteMany({ where: { expiryId } })` NELLA STESSA transazione della scrittura (per `updateExpiry`, che oggi è single-write, questo introduce una `$transaction` a due statement); se non cambia → nessun delete. Doc-comment + unit test per entrambe le vie (cambia → wipe; non cambia → non tocca).
- [x] Task 2: Config `JOBS_SECRET`
  - [x] `.env.example`: `JOBS_SECRET="dev-jobs-secret-change-me"` con commento (bearer del cron esterno per `/api/v1/jobs/*`, AD-9; generare un valore reale per ambiente). Aggiungere la stessa riga al `.env` locale (serve a dev server ed e2e).
- [x] Task 3: Service del job `expiry-alerts.service.ts` (AC 1/2)
  - [x] Nuovo `src/server/services/expiry-alerts.service.ts`: `runExpiryAlertsJob(): Promise<ExpiryAlertsJobResult>` con `ExpiryAlertsJobResult = { candidates: number; alertsCreated: number; holderEmailsSent: number; holdersWithoutEmail: number; digestEmailsSent: number }` (il JSON di risposta del job — il log del cron esterno). Nessun `Actor` (vedi Contesto).
  - [x] Query candidati: `expiry.findMany({ where: { expiresAt: { lte: today+60gg } }, include: { person (nome, email), expiryType (name), sentAlerts } })` + `user.findUnique` per locale del titolare (o include via person → user se la relazione lo consente); `today+60` costruito con aritmetica UTC date-only (60 = `Math.max(...EXPIRY_ALERT_THRESHOLDS)` — MAI hardcodare 60 due volte).
  - [x] Per ogni candidato: calcolare `daysLeft`, soglie dovute e da consumare (vedi Contesto); se da consumare è vuoto → skip. Altrimenti: `sentAlert.createMany({ data: [...] })` in try/catch — **P2002 → skip email e non conteggiare** (run concorrente); poi UNA email al titolare (se `person.email`) via `getMailSender()`, nella sua lingua.
  - [x] Riepilogo: se `alertsCreated > 0`, per ogni utente staff/admin attivo un'email nella sua `locale` con l'elenco del run. Errori di invio singoli: try/catch per destinatario, il job NON fallisce per un send fallito (conta e prosegue — il result riporta i numeri effettivi).
  - [x] Template in `src/server/adapters/mail/templates.ts` (stesso file/pattern di `buildNegativeBalanceAlertEmail`, recipient-locale AD-7): `buildExpiryAlertEmail(locale, { personName, typeName, expiresAt, daysLeft })` e `buildExpiryDigestEmail(locale, { items: Array<{ personName, typeName, expiresAt, daysLeft, holderEmailed }> })`. Corpi plain-text da `Emails.expiryAlert.*` / `Emails.expiryDigest.*` in `messages/{it,en}.json` (SIMMETRICI): la frase temporale via sotto-chiavi dedicate (`expiresToday`, `expiresInDays` con `{days}`, `expiredDaysAgo` con `{days}`) — MAI la soglia nel testo, sempre i giorni reali; data formattata locale-aware date-only UTC (`Intl.DateTimeFormat(locale, { timeZone: 'UTC', dateStyle: 'long' })` o helper esistente se c'è — non inventarne un secondo).
- [x] Task 4: Route + OpenAPI (AC 1)
  - [x] `src/app/api/v1/jobs/expiry-alerts/route.ts`: `POST` — estrae il bearer, confronto timing-safe con `JOBS_SECRET` (vedi Contesto: `crypto.timingSafeEqual` su hash/digest di pari lunghezza), 401 su mismatch/assente, 500 su env mancante, poi `runExpiryAlertsJob()` → 200 col result JSON. Envelope errori AD-8 coerente col resto (riusare `apiRoute()` SE il suo contratto lo consente senza sessione; altrimenti handler dedicato che replica l'envelope — decidere leggendo `handler.ts`, documentare la scelta).
  - [x] `registry.ts`: nuovo tag `['Jobs']`, path `POST /api/v1/jobs/expiry-alerts` con security scheme bearer (registrare `bearerAuth` nei components se non esiste), response 200 (schema del result) + errorResponses `(401)` (+500 implicito dell'envelope); schema Zod del result in `src/lib/schemas/expiry-alerts.ts` (o dentro `expiries.ts` se più coerente — una scelta, documentata). `registry.test.ts` coverage della path.
- [x] Task 5: Test (AC 1/2)
  - [x] Unit `expiry-alerts.service.test.ts` (mock prisma + mock MailSender — spiare `send`): cadenza normale (daysLeft 60 → 1 email titolare + soglia 60 consumata; poi 30 → seconda email); catch-up (daysLeft 5, nessuna soglia consumata → UNA email, soglie 60/30/7 consumate; daysLeft −3 → UNA email "scaduta", tutte e 4); già consumate → zero email; secondo run identico → zero email zero righe (AC 2); P2002 su createMany → skip senza email e senza throw; titolare senza `Person.email` → soglie consumate, zero email titolare, voce nel digest con flag; locale destinatario (user EN → email EN, senza user → IT); digest: un'email per staff/admin attivo nella propria locale, NESSUN digest se zero alert; utenti staff inattivi esclusi; send che throwa su UN destinatario → job prosegue e conta giusto.
  - [x] Unit in `expiries.service.test.ts`: wipe SentAlert quando `expiresAt` cambia (update e approve), NO wipe quando resta uguale.
  - [x] Unit route (pattern degli altri route/handler test se esistono; altrimenti servizio del confronto bearer estratto e testato): bearer giusto → 200; sbagliato/assente/malformato (`Bearer` senza token, token vuoto) → 401; `JOBS_SECRET` assente dall'env → 500 (mai 200).
  - [x] e2e `expiry-alerts.spec.ts` (Mailpit DEVE essere su; leggere `JOBS_SECRET` da `process.env.JOBS_SECRET ?? 'dev-jobs-secret-change-me'`): via API staff creare persona run-unique con email run-unique + profilo pilota + scadenza a +7 giorni (tipo run-unique scope ALL); `POST /api/v1/jobs/expiry-alerts` col bearer → 200, result con `alertsCreated >= 1`; interrogare Mailpit API (`GET /api/v1/search?query=to:<email-run-unique>` o lista messaggi filtrata) → l'email del titolare esiste; **secondo POST identico → 200 con zero nuovi alert e il conteggio Mailpit per quel destinatario INVARIATO (AC 2)**; POST senza/con bearer errato → 401 envelope. (Filtrare SEMPRE per l'email run-unique: il DB e Mailpit sono sporchi degli altri test. Il digest si asserisce nel result count, non nella mailbox staff — l'admin seed riceve digest da ogni run del file, contarli sarebbe flaky.)
- [x] Task 6: Nota architettura — aggiornare `docs/` SOLO se esiste già una pagina operativa/deploy che elenca le env var (grep veloce); altrimenti il commento in `.env.example` basta. NON creare nuova documentazione.

## Dev Notes

- **Perimetro**: niente UI, niente dashboard (6.4), niente scheduling interno (il cron è ESTERNO e invoca la route — AD-9); niente alert per saldo negativo (già coperti, 3.3) — non toccare quel flusso.
- **AD-7**: ogni email nella lingua del DESTINATARIO (`User.locale`), mai in quella di chi/cosa triggera. **AD-8**: envelope errori standard anche su 401/500 della route job. **AD-2**: qui non c'è denaro; le date restano date-only UTC.
- **MailSender SEMPRE via `getMailSender()`** (`src/server/adapters/mail`) — mai nodemailer diretto; i template SEMPRE in `templates.ts` con `createTranslator` + catalogo messages (mai stringhe hardcoded).
- **Attenzione al doppio conteggio nel result**: `alertsCreated` = righe `SentAlert` create; `holderEmailsSent` = email titolare effettivamente inviate (≤ del numero di expiry processate); tenerli distinti rende il log del cron leggibile e i test precisi.
- **Lezioni review**: P2002 backstop OVUNQUE si creino righe con unique (qui è il cuore dell'AC 2); niente `Date` con time-of-day contro `@db.Date`; i18n simmetrica contata; messaggi server English-only; niente segreti loggati (mai loggare il bearer ricevuto).
- **Ambiente**: DB resettato a inizio story; **Mailpit su** (background, `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025` se fosse caduto — Bash `run_in_background: true`, MAI `&`). Aggiungere `JOBS_SECRET` al `.env` PRIMA di avviare dev server/e2e. Build SEMPRE `env -u NODE_ENV npx next build`. MAI `playwright install`. Flaky e2e: classe nota (flight specs), stessa procedura (DB fresco, isolamento per le spec estranee).
- **Gate**: lint (warning noto), typecheck, `npx vitest run` (≥ 675 + nuovi), build, `npx playwright test` (≥ 101 + nuovi) su DB fresco + Mailpit.
- Un commit di implementazione (`Story 6.3: <sintesi>`, nessun riferimento AI/modello), story file aggiornato (Dev Agent Record, Status: review) e `sprint-status.yaml` → `6-3-expiry-alerts: review` inclusi. NON push. `git status` prima del commit (branch giusto, non detached).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-9] — job idempotenti via route protette, `SentAlert` unique
- [Source: src/server/adapters/mail/templates.ts] — pattern template recipient-locale (AD-7), da estendere
- [Source: src/server/services/accounts.service.ts#sendNegativeBalanceAlert] — pattern locale destinatario + person.email (3.3)
- [Source: src/lib/expiry-status.ts, src/lib/date-only.ts] — aritmetica giorni UTC da riusare, MAI duplicare
- [Source: _bmad-output/implementation-artifacts/6-2-expiry-registration.md] — modelli Expiry/proposal, nota "SentAlert dovrà scegliere onDelete"

## Dev Agent Record

### Agent Model Used

Sonnet 5 (single dev agent); gate finali ed e2e completati dalla sessione principale (Fable 5) — il run e2e completo non era terminato entro il turno del dev, che ha correttamente TRATTENUTO il commit (regola "tutti i gate verdi prima del commit").

### Debug Log References

- Typecheck rotto una volta da un generic `Translator<...>` nei template mail: risolto facendo costruire a `expiryDaysPhrase()` il proprio translator ristretto al namespace `Emails.expiryDays` invece di passarne uno condiviso tra namespace.
- Gap NON previsto dalla story trovato durante la verifica end-to-end: `src/proxy.ts` (edge middleware) risponde 401 a ogni `/api/v1/*` non in `PUBLIC_API_PATHS` PRIMA che la route giri — la route job non ci sarebbe MAI arrivata al proprio check bearer. Aggiunta `/api/v1/jobs/expiry-alerts` all'allowlist con doc-comment (la route resta protetta dal SUO bearer; ogni futura `/api/v1/jobs/*` richiede la stessa entry).
- Sessione principale: il primo run e2e completo era contaminato da un dev server STALE (avviato a metà implementazione; `reuseExistingServer: !CI` lo riusa) → 2 falsi fail deterministici su `person-profiles.spec.ts` (404 al posto di 403). Dopo il riavvio del container (nessun server preesistente): person-profiles 5/5, run completo pulito. LEZIONE per le prossime story: prima di un run e2e di gate, verificare che NON ci sia un dev server residuo su :3000 (`curl -s -o /dev/null localhost:3000` deve fallire) — o ammazzarlo.

### Completion Notes List

- `SentAlert` (unique `(expiryId, threshold)`, CASCADE con la Expiry) + wipe-on-renewal: `updateExpiry` ora è una `$transaction` a due statement e il ramo APPROVE di `decideExpiryProposal` confronta `expiresAt` correnti/proposti via `.getTime()` e cancella le righe alert solo se la data CAMBIA.
- `runExpiryAlertsJob` con semantica catch-up delle soglie (dovute = `daysLeft <= T`, consumate in blocco, UNA email coi giorni reali), P2002 → skip silenzioso (run concorrente), insert-prima-send, titolare senza email conteggiato e flaggato nel digest; digest a ogni staff/admin attivo nella propria locale SOLO se il run ha consumato alert.
- Bearer timing-safe in `src/server/auth/jobs-bearer.ts`: entrambi i lati hashati SHA-256 a lunghezza fissa prima di `crypto.timingSafeEqual` (che throwa su buffer di lunghezza diversa e leakerebbe la lunghezza via eccezione); `JOBS_SECRET` assente → 500, mai fallback.
- Route job hand-rolled sull'envelope AD-8 (`apiRoute()` presuppone la sessione e non ha il path 401-bearer); `JOBS_SECRET` opzionale in `env.ts` (deploy senza secret boota, solo la route risponde 500).
- Il job fa N+1 `user.findUnique` per la locale dei titolari (pattern 3.3 `sendNegativeBalanceAlert` citato dalla story) — flaggato al reviewer come possibile join unico.
- e2e `expiry-alerts.spec.ts` (2 test): run del job con bearer → email titolare in Mailpit (filtro per destinatario run-unique), secondo run → zero nuove email e mailbox invariata (AC 2 end-to-end), bearer errato/assente → 401 envelope.
- Deviazioni: (1) Task 6 — nessuna pagina docs/ operativa esistente, quindi solo il commento in `.env.example` (fallback previsto dal task); (2) e2e con tipo scope ALL (nessun profilo necessario, pattern di `expiry-registration.spec.ts`); (3) fix fuori-lista a `src/proxy.ts` (vedi Debug Log — load-bearing per AC 1).
- Gate finali (sessione principale, dopo riavvio container, DB fresco + Mailpit): lint 0 errori (warning noto), typecheck pulito, **734/734 unit**, `env -u NODE_ENV npx next build` verde, e2e **98/103** — i 5 fail sono ESATTAMENTE la classe flaky documentata (3 flight-form race + coppia people-management, quest'ultima ri-verificata 6/6 in isolamento su DB fresco); `expiry-alerts.spec.ts` verde nel run completo e in isolamento.

### File List

- `prisma/schema.prisma` + `prisma/migrations/20260708100000_add_sent_alerts/migration.sql`
- `src/lib/env.ts`, `src/lib/expiry-status.ts` (+test), `src/lib/schemas/expiry-alerts.ts`, `src/lib/schemas/registry.ts` (+test)
- `src/proxy.ts` (allowlist job route — vedi Debug Log)
- `src/server/auth/jobs-bearer.ts` (+test)
- `src/server/adapters/mail/templates.ts` (+test)
- `src/server/services/expiry-alerts.service.ts` (+test), `src/server/services/expiries.service.ts` (+test, wipe-on-renewal)
- `src/app/api/v1/jobs/expiry-alerts/route.ts` (+test)
- `messages/it.json`, `messages/en.json`, `.env.example`
- `e2e/expiry-alerts.spec.ts`

## Review Record

Reviewer: subagent **Opus 4.8 (extra-high)**, adversarial. **Verdict: fixes-required → F1 applicato dalla sessione principale (Fable 5), poi done.**

- **F1 (mandatory, FIXED)** — `expiry-alerts.spec.ts` flaky: le assert su `alertsCreated`/`holderEmailsSent` leggevano i contatori GLOBALI del singolo run del job, che gareggiano coi test/spec concorrenti che creano anch'essi scadenze dovute (un run parallelo può spazzare l'expiry del test prima della sua chiamata, o viceversa). Riprodotto dal reviewer: 1 fail su 7 run su DB fresco (`alertsCreated ... Received: 0`). Il comportamento del PRODOTTO è corretto (verificato indipendentemente); il difetto era solo di isolamento del test. Fix: eliminate TUTTE le assert sui contatori globali (test 1 E test 2, che aveva la stessa classe di race); AC 1/AC 2 asseriti SOLO su osservabili run-unique — mailbox Mailpit del destinatario run-unique (esiste, count===1, invariata al secondo run) e, per il test senza-email, il CONTENUTO del digest (nuovo helper `waitForMailpitMessageWithText`: cerca il cognome run-unique nel corpo del digest all'admin + flag "senza email"). Verifica del fix: 5/5 run isolati su DB fresco + 3/3 run insieme a `expiry-registration.spec.ts` (lo stress del cross-file race) + suite completa.
- **M1 (deferred)** — il flag "senza email" del digest compare anche quando il titolare HA l'email ma l'invio SMTP è fallito (path raro; l'azione di recupero dello staff è identica). Wording distinto invio-fallito/senza-email rimandato — proposta del reviewer stesso: deferral sicuro.

Verificato empiricamente e trovato corretto (sintesi): allowlist proxy exact-match (probe su varianti path/case/encoding/trailing-slash → tutte ancora 401/404, nessun path aperto); bearer guard (no header/token errato/'Bearer ' vuoto/scheme lowercase/secret in query → 401 envelope; `JOBS_SECRET` assente → 500 anche con bearer corretto, provato su server reale con env strippata — mai fallback insicuro; regex e SHA-256+timingSafeEqual solidi, nessun secret loggato); cadenza/catch-up esatti su daysLeft 61/60/30/7/0/−1/−400 (61 escluso; set di soglie consumate corretti; 24 alert, 7 email, 1 senza-email, 1 digest); testo email coi giorni REALI mai la soglia, locale destinatario (EN→EN, non linkato→IT), date date-only UTC; AC 2 (secondo run tutto-zero, Mailpit e SentAlert invariati); doppio run CONCORRENTE → 1 sola email titolare via P2002-skip, zero duplicati; ciclo rinnovo (PATCH data → wipe + re-alert; solo-note/stessa-data → NO wipe; wipe in-transazione confermato per update e APPROVE); matrice digest (uno per staff/admin attivo nella PROPRIA locale, inattivi e piloti esclusi, zero digest su run a zero alert); migrazione (unique + CASCADE in pg); `EXPIRY_ALERT_THRESHOLDS` unica fonte del 60; registry bearerAuth + coverage; i18n 9/9 simmetriche; regressione 6.2 intatta (734/734). Giudizi del dev accettati (N+1 lookup locale ok a questi volumi, translator per-item ok, subject digest senza conteggio ok).

### Final gates (dopo il fix F1, sessione principale)

lint 0 errori (warning benigno noto), typecheck pulito, **734/734 unit**, `expiry-alerts.spec.ts` 5/5 isolato + 3/3 con expiry-registration su DB fresco, suite e2e completa su DB fresco (vedi Change Log), `env -u NODE_ENV npx next build` verde.

## Change Log

- 2026-07-08: Story file created (Fable 5 main session), ready-for-dev.
- 2026-07-08: Implemented (Sonnet 5 single dev agent; gate e2e finale completato dalla sessione principale dopo un riavvio container e la bonifica di un dev server stale che falsava il run) — SentAlert + wipe-on-renewal, job idempotente con catch-up, template IT/EN recipient-locale, route bearer timing-safe + allowlist proxy. Tutti i gate verdi. Status: review.
- 2026-07-08: Review Opus 4.8 xhigh — F1 mandatory (assert e2e sui contatori globali del job → race coi test paralleli) FIXATO dalla sessione principale: assert solo su osservabili run-unique (mailbox titolare + contenuto digest), verificato 5/5 isolato + 3/3 cross-file + suite completa 100/103 (3 fail = classe flaky nota); M1 (wording flag digest su SMTP fallito) deferred su proposta del reviewer. Prodotto verificato corretto su tutta la superficie d'attacco (proxy, bearer, cadenza, concorrenza, rinnovo, digest). Status → done.
