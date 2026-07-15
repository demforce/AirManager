---
baseline_commit: eeb849fa4b3a33fd4f07fc901ea28533ce1d99e2
---

# Story 12.4: PPR — console, modulo pubblico, Voli in transito

Status: done

## Story

As a staff dell'aviosuperficie,
I want la console PPR e il registro movimenti nel design AirOps — con inserimento manuale delle richieste, "Registra arrivo" e stati derivati (atteso/in arrivo/al suolo/partito) — e il modulo PPR pubblico ricostruito nel nuovo linguaggio,
so that il flusso transiti sia gestibile end-to-end nel nuovo design senza perdere nessun comportamento esistente (fee, idempotenza, rate-limit, email).

**Riferimenti vincolanti**: spec §3 (righe Richieste PPR / Voli in transito / Modulo pubblico) + D13; piano Task 4; prototipo `docs/design-reference/airops/src/Ops.jsx` (PPRView, VisitingView), `Forms.jsx#ManualPPRForm/LogArrivalForm`, `PPR Request.html`.

## Acceptance Criteria

1. **(Schema additivo + PPR manuale)** Migrazione hand-written additiva su `PprRequest`: `email` diventa NULLABLE (il pubblico la mantiene OBBLIGATORIA a livello Zod; il manuale può avere solo telefono) e nuova colonna `createdByUserId TEXT? FK User SET NULL` (null = richiesta dal modulo pubblico → badge "da modulo web"). Nuova `createManualPprRequest(actor, input, { approveImmediately?: boolean })` (`ppr.manage`): crea PENDING (niente email di ricevuta, niente honeypot/rate-limit — è staff); con `approveImmediately` approva NELLA STESSA transazione (pprNumber emesso dal counter come oggi). TUTTI i percorsi email esistenti (ricevuta/approvazione/rifiuto) skippano silenziosamente quando `email` è null. Zod: `createManualPprRequestSchema` (email opzionale, phone obbligatorio se email assente — refine "almeno un contatto"); route `POST /api/v1/ppr-requests/manual` con idempotency (crea dati) e registrazione OpenAPI.
2. **(Console PPR)** `/dashboard/ppr` ricostruita come `Ops.jsx#PPRView`: card full-width "Richieste in arrivo" (colonne nominativo·tipo / richiedente+contatto+badge "da modulo web" quando `createdByUserId` è null / orario arrivo→partenza / POB / stato / azioni), azioni SOLO su PENDING: Approva (endpoint esistente, feedback con pprNumber), Rifiuta (motivazione obbligatoria — mini-modal, endpoint esistente); NIENTE "Riapri" (il dominio ha PPR_ALREADY_DECIDED — D13, il bottone del prototipo NON si porta). Bottoni testata: "Modulo pubblico" (link `/ppr` nuova tab), "Regole pubblicate" (l'editor istruzioni operative esistente, visibile con `settings.manage` come oggi), "PPR manuale" (slide-over `ManualPPRForm` → POST manual, resta PENDING). Filtro stato + paginazione con le convenzioni URL esistenti della coda.
3. **(Voli in transito)** NUOVA `/dashboard/movements` (sostituisce `/dashboard/ppr/register`, che viene ELIMINATA in questa story) come `Ops.jsx#VisitingView`: KPI row reali (al suolo ora / in arrivo oggi / attesi domani / movimenti nel mese — conteggi dal periodo), tabella registro (nominativo / tipo / rotta origine→destinazione / richiedente·contatto / arrivo / partenza / stato derivato / azioni + fee). **Stati derivati** dal helper puro NUOVO `src/lib/ppr-movement-status.ts` (unit test con i casi limite del giorno Roma 22–24 UTC, lezione PR #17): APPROVED con eta oltre oggi → `atteso`; APPROVED con eta oggi non passata → `in arrivo`; APPROVED con eta passata e non chiuso → `al suolo`; COMPLETED → `partito`; CANCELLED → badge `annullato` (stato reale, non derivato). Azioni preservate IDENTICHE: completa con fee prefillata dal default (GET settings, editabile, Idempotency-Key) e annulla two-step; default lista = APPROVED (come oggi), filtro stati/periodo e "Azzera filtri" con le STESSE semantiche TD-5 (default APPROVED, bottone nascosto al load); export xlsx preservato (`buildExportHref('/api/v1/ppr-requests', …)`). "Registra arrivo" = slide-over `LogArrivalForm` → POST manual con `approveImmediately: true`. Route-registry: voce `movements` accesa (`airopsNative: true`); redirect o 404 pulito da `/dashboard/ppr/register` (scegliere redirect permanente alla nuova route).
4. **(Modulo pubblico)** `/ppr` ricostruito da `PPR Request.html` (hero, sezioni form, aside info card, success panel, footer — classi `.ppr-*` già in `airops.css` dalla 12.1): CAMPI INVARIATI dello schema reale (NO apertura alare — non esiste nel dominio, D13; honeypot `website` PRESERVATO invisibile; eta/etd datetime-local; POB 1–99), POST identico con rate-limit/ETA_IN_PAST/ETD_NOT_AFTER_ETA invariati, success panel SENZA numero di riferimento (la risposta resta deliberatamente `{status:'PENDING'}` — il numero arriva con l'email di approvazione, comportamento attuale, D13: niente reference fittizio del prototipo). Brand: nome aviosuperficie da `getAirfieldBranding()` + ICAO da `getAirfieldIcao()` quando non vuoto; i dati aeroporto del prototipo SENZA backing (orari, pista, circuito, AFIS, elevazione, carburante) sono OMESSI — l'aside mostra solo la card "Come funziona" (testo i18n statico) e una card aeroporto ridotta a nome/ICAO/contatto email di contatto SE disponibili. Locale switch IT/EN preservato.
5. **(e2e)** `ppr-public.spec.ts`: selettori aggiornati, TUTTI i comportamentali invariati (IT/EN receipt, honeypot, rate-limit 429, ETA_IN_PAST). `ppr-queue.spec.ts`: riscritti gli UI-strutturali (approve feedback col numero, reject reason obbligatoria, 409 second-approve, RBAC pilota) + NUOVO: PPR manuale → appare PENDING senza email di ricevuta. `ppr-register.spec.ts` → RINOMINATO `movements.spec.ts` portando TUTTI i comportamentali (fee default prefill+completamento+cash movement, fee 0 senza movimento, annulla two-step, 409 PPR_NOT_APPROVED, replay idempotency = un solo movimento, filtri periodo con `romeDateOnly`, azzera-filtri TD-5) + NUOVI: stati derivati renderizzati correttamente (fixture con eta ieri/oggi/domani), "Registra arrivo" → riga subito `al suolo`/`in arrivo` con pprNumber emesso.
6. **(Gates)** `npm run gates` verde; migrazione su DB fresco ok; `ppr-public` + `ppr-queue` + `movements` verdi in locale (--retries=2); verifica interattiva di console, movements e modulo pubblico in entrambi i temi (pagine AirOps-native, flag `airopsNative` sul registry, shim assente).

## Contesto e decisioni di design (vincolanti — ricognizione 2026-07-15)

- **Service** (`src/server/services/ppr.service.ts`): `createPprRequest` L69 (pubblico, honeypot→rate-limit→validazione→create→email best-effort L70-137, `PPR_RATE_LIMIT_MAX=5`/60min L41-43), `listPprRequests` L224 (filtro `status` default PENDING o 'ALL', periodo su `eta` con `zonedMidnightUtc` L227-233 — è GIÀ la query del registro), `approvePprRequest` L318 / `rejectPprRequest` L374 (`PPR_ALREADY_DECIDED` 409 L258), `completePprRequest` L439 (fee → CashMovement categoria "PPR" per nome, solo se >0, L454-479; `effectiveDate` = giorno Roma di closedAt) / `cancelPprRequest` L494 (`PPR_NOT_APPROVED` 409 L261), lock condiviso `lockPprRequest` L288. Error codes: `ETA_IN_PAST`/`ETD_NOT_AFTER_ETA` (confronto su ISTANTI, L91/L97), `RATE_LIMITED` 429.
- **Manual create**: NON esiste — net-new (AC 1). Comporre il create nel pattern del service esistente (stessa validazione dominio eta/etd, NIENTE honeypot/rate-limit per lo staff); `approveImmediately` riusa la logica approve ESISTENTE (counter pprNumber con guard FOR-UPDATE) nella stessa transazione.
- **Pagine attuali**: queue `dashboard/ppr/page.tsx` (auth redirect L57-65, `?page` only, editor istruzioni/fee con `settings.manage` L67-76; azioni client `ppr-queue.tsx`: approve L132 feedback pprNumber L143, reject L146-158 con blocco client su reason vuota; righe decise rimosse dallo stato locale). Register `ppr/register/page.tsx` (`?page&status&from&to`, `sanitizeStatus` default `APPROVED` L78, "Azzera filtri" TD-5 = reset a APPROVED+date vuote, nascosto sul default, 'ALL' conta come filtro attivo L137-148; complete con Idempotency-Key L448 e prefill fee da `GET /api/v1/settings/ppr-landing-fee` L408-426; dopo mutazione `router.refresh()`; export L185).
- **Pubblico attuale** (`src/app/[locale]/ppr/page.tsx` + `ppr-form.tsx`): campi L35-52 dello schema (NO wingspan), honeypot L441-443, POST L196-210, success `data-testid="ppr-success"` L235-247 SENZA riferimento, locale prop nel body. NON legge alcun setting oggi — la card aeroporto ridotta di AC 4 è ADDITIVA (name/ICAO/email di contatto SE esistono — l'email di contatto NON ha setting oggi: ometterla finché 12.11 non la aggiunge; quindi card = nome+ICAO soltanto).
- **Schemi** (`src/lib/schemas/ppr.ts`): `createPprRequestSchema` L35-52, `pprStatusSchema` L76 (5 stati — gli stati derivati NON entrano nello schema: sono presentazione), `listPprRequestsQuerySchema` L95-105, `pprRequestItemSchema` L115-142 (esclude submitterIp; aggiungere `createdByUserId`? NO — esporre un boolean derivato `fromPublicForm` per il badge, niente id utente nel DTO). Route API: `ppr-requests/route.ts` (POST pubblico + GET list/export), `[id]/{approve,reject,complete,cancel}` tutte con idempotency.
- **e2e**: `romeDateOnly` helper in `ppr-register.spec.ts:81-83` (portarlo in `movements.spec.ts`); inventario test in ricognizione (public :163/:197/:231/:280/:305; queue :171/:214/:246/:266; register :189/:227/:250/:272/:283/:313/:341).
- **12.3 shim opt-out**: usare il meccanismo `airopsNative` introdotto dalla 12.3 per `ppr` (console), `movements` e la pagina pubblica (che è FUORI dal layout dashboard — verificare che il root layout pubblico non abbia shim: il modulo pubblico rende su `[locale]/ppr` senza dashboard layout, quindi nessun opt-out necessario lì).
- **Ambiente locale**: identico alle story precedenti (docker compose, DB fresco al dispatch, port 3000 libero, cold-start login flake → --retries=2, Mailpit localhost:8025, MAI playwright install).
- **Commit**: `feat(12.4): PPR console, modulo pubblico, voli in transito`. Niente push.

## Fuori scope dichiarato

- Setting email di contatto/orari/pista per la card aeroporto pubblica (12.11 se ratificato lì).
- Reopen di una PPR decisa (il dominio non lo prevede — D13).
- Badge conteggio sidebar (12.12).
- Statistiche transiti mensili oltre il KPI del periodo corrente (serie storiche → 12.10).

## Dev Agent Record

### Completion Notes

- **Schema (AC 1)**: migrazione hand-written additiva `20260715160000_add_ppr_manual_create` — `PprRequest.email` NOT NULL → nullable, nuova colonna `createdByUserId TEXT?` FK `User` `ON DELETE SET NULL`. Verificata empiricamente su DB fresco (`\d "PprRequest"` via psql nel container Postgres) prima e dopo `prisma migrate deploy`.
- **`createManualPprRequest`** (`ppr.service.ts`) — nuova funzione: stessa validazione dominio eta/etd di `createPprRequest` (ETA_IN_PAST/ETD_NOT_AFTER_ETA), niente honeypot/rate-limit/receipt email. `approveImmediately` (parametro `options`, non letto da `input`) issua il pprNumber nella STESSA transazione riusando la logica del counter di `approvePprRequest` (inlined, non richiama quella funzione: la riga è appena creata nella stessa tx, nessun lock necessario). Nessuna email di approvazione inviata nemmeno con `approveImmediately` (assunzione esplicitata — vedi Deviazioni). Guardie null-email aggiunte a `createPprRequest`/`approvePprRequest`/`rejectPprRequest` (email ora nullable lato DB).
- **TDD**: `src/lib/ppr-movement-status.ts` — helper puro `deriveApprovedPprMovementStatus(eta, now)`, test scritti PRIMA dell'implementazione (`ppr-movement-status.test.ts`, 11 casi incl. i boundary Roma 22-24 UTC CET/CEST, lezione PR #17), verificati falliti poi passati. Service tests per `createManualPprRequest` aggiunti a `ppr.service.test.ts` (9 nuovi test) nelle stesse convenzioni esistenti (mock Prisma, `mockTransaction`).
- **Console `/dashboard/ppr`** (AC 2): rebuild come `Ops.jsx#PPRView` — card unica "Richieste in arrivo", filtro stato aggiunto (novità reale oltre il prototipo statico, default PENDING invariato), approve DIRETTO (niente doppia conferma — precedente `bookings-table.tsx` 12.3), reject via `.mini-modal` (stesso pattern del deny modal di 12.3). Editor istruzioni/tassa invariato nel contenuto, ora raggiungibile via anchor-scroll "Regole pubblicate" invece che sempre inline (assunzione — vedi Deviazioni).
- **`/dashboard/movements`** (AC 3): nuova pagina come `Ops.jsx#VisitingView`, sostituisce il register. KPI reali: "al suolo ora"/"in arrivo oggi" da UNA query cumulativa (APPROVED, `to=oggi`, cap 500 righe) classificata in JS col helper puro; "attesi domani" da query diretta (bound esatto, nessuna comparazione con `now`); "movimenti nel mese" = tutti gli stati con eta nel mese corrente (assunzione — vedi Deviazioni). Filtri/paginazione/export/idempotency del vecchio register preservati 1:1 (stessi testid `ppr-register-*`). `/dashboard/ppr/register` sostituita da un permanent redirect (308, `permanentRedirect` aggiunto a `i18n/navigation.ts`) a `/dashboard/movements`.
- **Form condiviso** `src/components/ppr/manual-ppr-form.tsx`: UN componente dietro sia "PPR manuale" (`approveImmediately=false`) sia "Registra arrivo" (`approveImmediately=true`) — stesso endpoint, stesso schema. Deviazione dal prototipo (due componenti separati con campi liberi "Richiedente"/"Contatto") per aderenza allo schema reale (firstName/lastName/email/phone separati) — stesso pattern già usato da `new-booking-form.tsx` in 12.3.
- **Modulo pubblico `/ppr`** (AC 4): rebuild 1:1 da `PPR Request.html` (`.ppr-*` già in `airops.css` dal 12.1). Bug CSS reale trovato e fissato: `html,body{height:100%}` (globale, per lo shell `.app`) forzava `.ppr-page` (primo vero consumer, fuori dallo shell) a shrinkare a `100vh` quando il contenuto reale eccede un viewport, lasciando il background chiaro del `<body>` legacy visibile sotto in dark theme — fix chirurgico: `flex-shrink:0` su `.ppr-page` in `airops.css`. Verificato via screenshot Playwright prima/dopo (light+dark). Success panel SENZA riferimento fittizio (D13), con bottone "Invia un'altra richiesta" (reset locale, non nel dominio ma coerente col prototipo e non vietato da D13).
- **Route registry**: `ppr`/`visiting` → `airopsNative:true`; `visiting` → `enabled:true`.
- **Verifica interattiva**: Playwright MCP non disponibile (rotto sulla macchina, come da nota) — script Playwright throwaway in `/tmp` (cancellato prima del commit) contro `localhost:3000`, entrambi i temi via cookie `am-theme`. Screenshot confermano: form pubblico light/dark, console con manuale/reject, movements con KPI/registra arrivo/complete, redirect register→movements.
- **e2e**: `ppr-public.spec.ts` invariato (label/testid preservati byte-identici, comportamentali intatti). `ppr-queue.spec.ts` riscritto: approve diretto, mini-modal reject, toast al posto del paragrafo persistente, nuovo test "PPR manuale". `ppr-register.spec.ts` → rinominato `movements.spec.ts`, TUTTI i comportamentali portati (fee prefill/completamento/movimento, fee 0, annulla two-step, 409, idempotency replay, filtri periodo, azzera-filtri TD-5) + 2 nuovi (stati derivati con fixture eta passata/oggi/domani via wait reale, "Registra arrivo"). Bug reale trovato in corsa: `<input type="date">` sotto `devices['Desktop Chrome']` non dispara `onChange` React in modo affidabile per `.fill()` programmatico (confermato con 4 tecniche diverse, incluso il native-setter trick già usato per l'honeypot) — assertion di quel singolo sotto-caso riscritta per verificare l'esclusione via navigazione diretta (stessa logica server-side), documentato inline. Trovato anche un bug di paginazione nei 2 nuovi test (assumevano page 1, il DB dev accumulato spingeva le righe FIFO su pagine successive) — fissato con `gotoQueueLastPage`/`gotoMovementsLastPage`.
- **`key` mancante**: aggiunto `key={JSON.stringify({page, status})}`/`key={JSON.stringify({page, ...filterQuery})}` su `PprConsole`/`MovementsTable` (pattern del pre-12.4 register, dimenticato nella prima stesura) — remount pulito ad ogni cambio filtro/pagina.

### File List

**Migrazione**
- `prisma/schema.prisma` (M)
- `prisma/migrations/20260715160000_add_ppr_manual_create/migration.sql` (nuovo)

**Libreria/schemi**
- `src/lib/ppr-movement-status.ts` (nuovo)
- `src/lib/ppr-movement-status.test.ts` (nuovo)
- `src/lib/schemas/ppr.ts` (M — `createManualPprRequestSchema`, `pprRequestItemSchema.email`/`fromPublicForm`)
- `src/lib/schemas/registry.ts` (M — registrazione route `POST /api/v1/ppr-requests/manual`)
- `src/lib/use-idempotency-key.ts` (M — doc-comment aggiornato, sesto consumer)
- `src/i18n/navigation.ts` (M — export `permanentRedirect`)

**Servizio/route API**
- `src/server/services/ppr.service.ts` (M — `createManualPprRequest`, guardie email null, `createdByUserId`)
- `src/server/services/ppr.service.test.ts` (M — 9 nuovi test)
- `src/server/services/exports.service.ts` (M — namespace export `MovementsPage`)
- `src/app/api/v1/ppr-requests/manual/route.ts` (nuovo)

**Shell**
- `src/components/shell/route-registry.ts` (M — `ppr`/`visiting` airopsNative/enabled)

**Console PPR (`/dashboard/ppr`)**
- `src/app/[locale]/dashboard/ppr/page.tsx` (M — rebuild completo)
- `src/app/[locale]/dashboard/ppr/ppr-console.tsx` (nuovo)
- `src/app/[locale]/dashboard/ppr/manual-ppr-launch-button.tsx` (nuovo)
- `src/app/[locale]/dashboard/ppr/register/page.tsx` (M — ora solo redirect permanente)
- `src/app/[locale]/dashboard/ppr/register/ppr-register.tsx` (eliminato)

**Voli in transito (`/dashboard/movements`, nuovo)**
- `src/app/[locale]/dashboard/movements/page.tsx` (nuovo)
- `src/app/[locale]/dashboard/movements/movements-table.tsx` (nuovo)
- `src/app/[locale]/dashboard/movements/log-arrival-launch-button.tsx` (nuovo)

**Componente condiviso**
- `src/components/ppr/manual-ppr-form.tsx` (nuovo)

**Modulo pubblico (`/ppr`)**
- `src/app/[locale]/ppr/page.tsx` (M — rebuild completo)
- `src/app/[locale]/ppr/ppr-form.tsx` (M — rebuild completo)

**Stili**
- `src/styles/airops.css` (M — `flex-shrink:0` su `.ppr-page`, fix bug dark-theme)

**i18n**
- `messages/it.json`, `messages/en.json` (M — `PprQueuePage` ristrutturato, `PprRegisterPage` → `MovementsPage`, `PprPage` ristrutturato)

**e2e**
- `e2e/ppr-queue.spec.ts` (M — riscritto)
- `e2e/ppr-register.spec.ts` → `e2e/movements.spec.ts` (rinominato + riscritto/esteso)
- `e2e/ppr-public.spec.ts` (invariato)

**Sprint tracking**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (M — `12-4-...: review`)

### Change Log

- 2026-07-15: Implementazione story 12.4 completa — migrazione additiva, `createManualPprRequest` + route + TDD, console PPR e movements register rebuild in linguaggio AirOps, modulo pubblico rebuild da `PPR Request.html`, fix bug CSS dark-theme (`.ppr-page` flex-shrink), e2e riscritti/estesi (2 bug reali trovati e fissati in corsa: paginazione FIFO nei nuovi test, automazione date-input inaffidabile sotto `devices['Desktop Chrome']`). `npm run gates` verde. 19/19 e2e verdi (ppr-public, ppr-queue, movements) con `--retries=2`.

### Deviazioni dal piano (da verificare in review)

1. **Nessuna email di approvazione per `approveImmediately`**: la story dice solo "riusa la logica approve ESISTENTE (counter pprNumber con guard FOR-UPDATE)" — non menziona l'email. Ho scelto di NON inviarla nemmeno quando l'email è presente (coerenza con "niente email di ricevuta" del create manuale, D13-style: lo staff sta già interagendo direttamente col richiedente). Va confermato che sia la lettura corretta.
2. **"Regole pubblicate" come anchor-scroll**: il prototipo non implementa alcun comportamento reale per questo bottone. Ho scelto un semplice `<a href="#ppr-instructions">` che porta alla sezione (sempre renderizzata quando `settings.manage`, non un toggle) — stessa visibilità "come oggi" richiesta dall'AC, minima invenzione.
3. **"Movimenti nel mese" = tutti gli stati** — **[SUPERATO: ratificato dall'utente in review → conta solo `COMPLETED` (transiti materializzati); cambiato in `368fe12`. Vedi Review Record.]** Scelta originale del dev: la query usava `status:'ALL'` con eta nel mese corrente (includeva PENDING/REJECTED).
4. **`origin`/`destination` nella sezione "Aeromobile"** del modulo pubblico: il prototipo non ha questi campi (mock senza rotta); li ho collocati nella sezione Aeromobile piuttosto che crearne una dedicata — deviazione minima di layout, non di contenuto/validazione.
5. **Manuale/Registra arrivo: stessa validazione ETA_IN_PAST del pubblico** — **[SUPERATO: ratificato dall'utente in review → sul percorso staff un `eta` passato è ora ACCETTATO ("Registra arrivo" logga un aeromobile appena atterrato → "al suolo" subito); cambiato in `368fe12`. Il modulo pubblico resta strict (ETA_IN_PAST). Vedi Review Record.]** Segnalazione originale del dev: la frizione operativa del vincolo ETA_IN_PAST applicato anche al manuale, implementato come da Dev Notes ("STESSA validazione dominio eta/etd").
6. **Due test e2e riscritti per limiti di automazione** — **[SUPERATO dal fix F5 (`8f637a6`): il `.fill()` reale sul date-input nativo è stato ripristinato e passa in CI-mode; il testo seguente descrive il workaround poi rimosso. Vedi Review Record.]** (storico) il sotto-caso "period filter" di `movements.spec.ts` verificava l'esclusione via navigazione diretta invece che via `.fill()` sul date-input nativo (bug di interoperabilità Playwright+Chromium+React confermato con 4 tecniche diverse, non un difetto del componente — il valore DOM cambiava correttamente ma l'evento non raggiungeva mai `onChange` di React).

## Review Record

**Reviewer**: adversarial-reviewer (Opus 4.8, effort xhigh) — RE-review sul tree corrente dopo che la prima review (di una sessione interrotta) aveva applicato i fix F1/F5 senza persistere i findings. **Data**: 2026-07-15.

### Arbiter (priority zero)

- **`CI=1 npx playwright test` su build di produzione → 210 passed, 0 failed** (prima sul commit `8f637a6`, poi ri-verificato dopo il fix di review `368fe12`: ancora **210/210**). `npm run gates` verde (lint · typecheck · **1332** unit · build). i18n key parity 1354/1354 simmetrica.

### Verdetto

**Shippable.** Zero blockers, zero majors, **zero code defects**. F1 (contratto DTO — nessun `createdByUserId`/`submitterIp` sul wire, `fromPublicForm` derivato) e F5 (`.fill()` reale sul date-input ripristinato) verificati empiricamente. La review interrotta non aveva lasciato nulla di rotto.

### Evidenza empirica (non solo lettura codice)

- **Migrazione** (`\d "PprRequest"`): `email` NULLABLE; `createdByUserId TEXT` FK → `User` `ON DELETE SET NULL`. Confermato.
- **RBAC** su `POST /api/v1/ppr-requests/manual`: admin→201, staff→201, istruttore/pilota/allievo→403 (solo `ppr.manage`).
- **Race pprNumber**: 8 `approveImmediately` concorrenti → 8 numeri DISTINTI, zero duplicati in tabella (counter inlined `INSERT … ON CONFLICT … RETURNING` serializza correttamente).
- **Idempotency**: replay stessa `Idempotency-Key` → stesso `id`, esattamente 1 riga (psql).
- **Email null-guards** (Mailpit): manuale phone-only + approve/reject, e `approveImmediately` con email presente → 0 mail, nessun throw; controllo positivo: submit pubblico con email → esattamente 1 ricevuta.
- **Pubblico**: honeypot `website` → 201 senza riga creata; body legittimo `{status:'PENDING'}` senza riferimento fittizio (D13); ETA_IN_PAST/ETD_NOT_AFTER_ETA su istanti.
- **308** `GET /dashboard/ppr/register` → `/dashboard/movements`. Boundary Roma 22–24 UTC (CET/CEST) pinnati come assert reali nei unit.

### Findings

- **MIN-1** (doc drift, non un difetto di codice): la Deviazione #6 dello story file descriveva ancora il workaround rimosso dal fix F5. **Fixato** in questo commit docs (annotazione [SUPERATO] sulla #6).

### Adjudicazione delle 6 deviazioni

1. **Nessuna email per `approveImmediately`** → **ACCEPT** (flag PO). Non è una regressione dell'approve normale (che continua a inviare l'email quando presente); "Registra arrivo" è azione on-the-spot dello staff.
2. **"Regole pubblicate" anchor-scroll** → **ACCEPT** (invenzione minima, visibilità invariata).
3. **KPI "movimenti nel mese"** → **RATIFICATO dall'utente**: solo `COMPLETED` → cambiato in `368fe12`.
4. **origin/destination in sezione "Aeromobile"** → **ACCEPT** (solo layout; schema/validazione invariati, body POST byte-identico).
5. **Registra arrivo & ETA_IN_PAST** → **RATIFICATO dall'utente**: `eta` passato ACCETTATO sul percorso staff (pubblico resta strict) → cambiato in `368fe12`.
6. **Riscritture e2e per limiti automazione** → **RISOLTO**: il fix F5 ha ripristinato il `.fill()` reale; il diff inventario (`eeb849f:ppr-register.spec.ts` vs `movements.spec.ts`) mostra tutti i **7** comportamentali originali preservati 1:1 + **2** nuovi (stato derivato, Registra arrivo). Nessuna copertura persa.

### Commit di review

- `368fe12` — `fix(12.4)`: adjudicazione (#5 past-eta staff, #3 KPI COMPLETED, contratto OpenAPI, unit + e2e aggiornati).
- questo commit — `docs(12.4)`: Review Record, status → done, sprint-status.
