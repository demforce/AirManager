# Review adversarial — Story 16.3 «Una persona in un posto solo — sovrapposizioni per persona e istruttore, ri-verifica in approvazione, guardia temporale sulle transizioni»

**Data**: 2026-09-27 · **Reviewer**: subagent Opus 5.5 (unico layer adversarial)
**Commit sotto review**: `4a1ae4d` (feat) · `98f1410` (docs) · `24d4072` (fix: lock `FOR NO KEY UPDATE`) · `c06aa29` (docs)
**HEAD all'inizio e alla consegna**: `c06aa29` (nessun commit intervenuto; albero pulito salvo le cartelle untracked dell'utente e la cancellazione preesistente `.claude/skills/design-taste-frontend/SKILL.md`, non toccate)
**Contratto**: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 16.3», ratifiche R-16-a / R-16-b · story file `16-3-prenotazioni-persona-istruttore-approvazione.md` (13 AC + emendamenti AD-2/AC 5)
**Finding dell'audit chiusi**: `ops-audit.md` §F2, §F4, §F9
**Skill applicate**: `bmad-code-review` (metodo), `karpathy-guidelines` (assunzioni esplicite, prove verificabili, nessuna modifica al repo)

---

## Verdetto

### SHIPPABLE-WITH-FIXES

Il cuore server della story è **corretto e verificato sul vivo**, non per lettura. Le tre guardie di
sovrapposizione reggono sotto concorrenza reale: **151 raffiche** (approvazione‖approvazione per persona e
per istruttore, creazione‖approvazione, spostamento‖approvazione, raffiche a tre) → **sempre esattamente un
vincitore**, con entrambi gli ordini di arrivo osservati; dopo tutte le raffiche il DB contiene **0** coppie
APPROVED sovrapposte per persona, per istruttore e per velivolo. Il lock `FOR NO KEY UPDATE` fa esattamente
ciò che l'emendamento dichiara: con la riga `Person` (o `InstructorProfile`) tenuta da una sessione psql, i
due scrittori di prenotazioni restano **parcheggiati ~3 s** e poi ne passa uno solo, mentre gli insert che la
referenziano per FK (`Expiry`, `Flight`, `InstructorRate`) passano in **68-163 ms**. Precedenza, `details`,
bordi semi-aperti, stati che non bloccano, ri-verifiche F4 con **gli stessi codici di `createBooking`** (4 casi
+ precedenza), R-16-b e la guardia F9 (anche a ±0,3 s dall'inizio dello slot) sono tutti come da contratto.
Le tre UI code-aware funzionano in IT/EN, desktop e mobile. Arbitro e2e **542/542, exit 0** (3 flaky non
attribuibili, provati sotto).

**Due difetti reali**, nessuno dei due nel predicato:

| # | Sev | Sostanza | File |
|---|---|---|---|
| MAJOR-1 | major | Il ramo **FORZA** del form di creazione risponde a `PERSON_BUSY`/`INSTRUCTOR_BUSY` con «Impossibile forzare la prenotazione. Riprova.» — vicolo cieco **deterministico** (la 409 è raggiungibile SOLO passando dalla forzatura quando c'è anche un documento scaduto bloccante), e il banner sopra resta quello stantio dell'`EXPIRED_DOCUMENTS`. Quarto ramo 409 che AD-7 non ha censito; stessa classe della 16.2 MAJOR-1 | `src/app/[locale]/dashboard/bookings/new-booking-form.tsx:392-397` |
| MAJOR-2 | major | **Deadlock** `40P01` → **500 INTERNAL_ERROR** fra `PATCH /bookings/{id}` e `POST /bookings/{id}/transition {APPROVED}` sulla **stessa** prenotazione: **40/40** su HEAD. Difetto **preesistente** (20/20 sulla build pre-story), ma la story scrive **il contrario come proprietà dimostrata** nel doc-comment di modulo, nel doc di `schema.prisma` e in AD-2 («per censimento e non per fiducia»): il censimento ha omesso il lock di riga IMPLICITO dell'`updateMany` su `Booking` | `src/server/services/bookings.service.ts:75-81` (claim), `:1071-1118` vs `:1294-1338` (inversione); `prisma/schema.prisma:1110`; story file AD-2 `:137-139` |
| LOW-1 | low | `api-v1.spec.ts:148` lascia il **pilota del seed** APPROVED su uno slot fisso del giorno (tre giorni fa 07:30Z) se fallisce fra l'approvazione e il FLOWN: il retry (e ogni rerun dello stesso giorno sullo stesso DB) fallisce **deterministicamente** allo spostamento con 409 `PERSON_BUSY`. Il commento a `FUTURE_DAY` («api-v1.spec.ts closes its own within the test») vale solo sul percorso felice | `e2e/api-v1.spec.ts:142-145`, `:178`; `e2e/bookings.spec.ts:296` |

**Decisione PO necessaria**: una (PO-1, TD 16.3-a riprodotto sul vivo: lo stesso essere umano APPROVED come
istruttore su un velivolo e come pilota su un altro, nello stesso slot). Non blocca la story: è il residuo
dichiarato, ma il titolo della story («una persona in un posto solo») lo rende una domanda da porre, non da
lasciare implicita.

---

## Arbitro — suite e2e completa su DB fresco (priorità zero, lanciato per primo)

Pre-condizioni verificate prima dello start: `Person` = **4**, `Booking` = **0**, `Flight` = **0** (SQL);
nulla in ascolto su `:3000`/`:3001` (`ss -ltnp`). Ambiente: `set -a && . ./.env && set +a`,
`export JOBS_SECRET=local-dev-not-a-placeholder-0123456789abcdef`, `CI=1 scripts/e2e.sh start` (build di
produzione dentro il webServer, detached). Nessuna build, server o probe durante il run. Esito letto **solo**
con `scripts/e2e.sh status`:

```
log: /tmp/airmanager-e2e/last-run.log
args: <full suite>
state: DONE — E2E_EXIT=0
--- summary ---
  3 flaky
  539 passed (15.3m)
...
  3 flaky
    [chromium] › e2e/aircraft-rates.spec.ts:155:7 › Historicized aircraft rates (...) › rate history shows only the last 5 by default, with "mostra tutte" revealing the rest (AC 2, story 13.4)
    [chromium] › e2e/movements.spec.ts:308:7 › Voli in transito / movements register (...) › completing with the fee cleared to 0,00 (...)
    [chromium] › e2e/movements.spec.ts:462:7 › Voli in transito / movements register (...) › derived movement status (epic 12, story 12.4, AC 3): al suolo (...), in arrivo (...), atteso (...)
  539 passed (15.3m)
=== e2e end: 2026-09-27T11:50:16+02:00 ===
E2E_EXIT=0
```

**539 passed + 3 flaky + 0 failed + 0 did not run = 542 = 537 + 5, exit 0** (start 11:34:57, end 11:50:16,
build `PF5WSG_1HvQYNjmn5Rw36`). I 5 test nuovi del describe «One person in one place»
(`bookings.spec.ts:2057/2098/2131/2186/2208`) e i test a fixture spostata (`api-v1.spec.ts:148/193`,
`bookings.spec.ts:1127`, `home-dashboard.spec.ts:228`, Effettuato/Assente, `mobile-*`) sono **verdi al primo
tentativo**: le due classi TD 16.3-e/16.3-f **non** si sono manifestate in questo run.

**Attribuzione dei 3 flaky (nessuno attribuibile alla story)** — la diff `325b7e5..c06aa29` non tocca PPR,
movimenti, tariffe o `aircraft.service`; `ppr.service.ts`/`aircraft.service.ts` citano `bookings.service` solo
in commenti (`grep` → righe 466 e 525, entrambe dentro doc-comment):
- `aircraft-rates.spec.ts:155` — `Error: apiRequestContext.get: read ECONNRESET` su `GET /api/v1/aircraft?q=…`
  (reset del socket keep-alive a livello di trasporto; verde al retry #1).
- `movements.spec.ts:308` — toast «PPR completato.» non comparso entro 5 s (classe «timeout di 5 s sotto
  carico»); il describe è `serial` (`movements.spec.ts:236`), quindi il retry rigioca il gruppo: verde al #1.
- `movements.spec.ts:462` — al retry #1 del gruppo, riga non trovata su `gotoMovementsLastPage` (classe
  «page rank» su registro condiviso); verde al retry #2.

**Forense post-suite** (DB intatto, prima di ogni probe): `Booking` 112 (76 APPROVED); coppie APPROVED
sovrapposte **0** per persona, **0** per istruttore, **0** per velivolo, **0** «stesso essere umano in due
ruoli»; pilota del seed: 2 CANCELLED, 3 PENDING, 1 DENIED, 1 FLOWN (quello di `api-v1`, 2026-09-24 07:30Z),
**0 APPROVED**; prenotazioni con l'`instructorProfileId` dell'istruttore del seed: **0**. Settings lasciati
dalla catena: finestra `00:00-23:59`, `minSlotMinutes` 30, `maxAdvanceDays` 3650, turnaround 0.

**Gate** (dopo i probe, server fermato, servizio ripristinato — v. MAJOR-2): `npm run gates` →
`PASS lint (29s) · PASS typecheck (3s) · PASS test (10s) — Tests 1922 passed (1922) · PASS build (39s)`.
Validazione eager dell'env: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run
src/server/services/bookings.service.test.ts src/app/[locale]/dashboard/bookings/booking-transition.test.ts
src/lib/api/handler.test.ts` → `Test Files 3 passed (3) · Tests 324 passed (324)`.

---

## Finding

### MAJOR-1 — Il ramo «Forza prenotazione» risponde a `PERSON_BUSY`/`INSTRUCTOR_BUSY` con «Riprova» (vicolo cieco deterministico)

**Dove**: `src/app/[locale]/dashboard/bookings/new-booking-form.tsx:392-397` (`onForceSubmit`):

```ts
if (!response.ok) {
  // A concurrent change (e.g. the slot got taken, or the reason was
  // rejected as too long) — the generic message is enough here, the
  // primary error path above already covers every other domain code.
  setForceError(labels.force.generic);
  return;
}
```

**Perché è deterministico, non una corsa**: `createBooking` controlla le scadenze **fuori** dalla transazione e
**prima** del predicato (`bookings.service.ts:676-700` → poi `:703` transazione → `:726` `findBookingConflict`).
Una richiesta che è insieme «persona con documento scaduto bloccante» **e** «persona/istruttore occupati»
risponde quindi **sempre** 422 `EXPIRED_DOCUMENTS` al primo POST, e arriva al 409 **solo** attraverso la
forzatura. Il commento del codice («the primary error path above already covers every other domain code») è
falso proprio per questi due codici: il ramo primario non li vede mai in questo scenario. E poiché R-16-a li
rende **non derogabili**, «Riprova» è l'unica cosa che non può funzionare (lezione R-15.4-g; identica alla
16.2 MAJOR-1 sul `flight-editor`, classificata major con la stessa motivazione). Il banner principale resta
inoltre quello stantio dell'`EXPIRED_DOCUMENTS`. AD-7 censisce «tre punti» che trattano ogni 409 come velivolo;
questo è il quarto (la variante del 409 aereo era già così prima della story, ma lì la story non cambiava nulla;
i due codici nuovi lo rendono raggiungibile in un caso nuovo e frequente — un allievo con visita medica scaduta
e un'altra lezione già approvata).

**Riproduzione** (build di produzione, script throwaway `rvw163/ui-force.mjs`): pilota run-unique `F` APPROVED
su `FA` oggi 17:00-18:00Z; poi tipo di scadenza run-unique `blocksBooking: true` + scadenza di `F` al
2020-01-01; creazione staff per `F` su un altro velivolo `FB` 17:15-17:45Z.

```
API first: 422 EXPIRED_DOCUMENTS | API forced: 409 PERSON_BUSY
UI first error: Impossibile creare la prenotazione: risultano scaduti i seguenti documenti: rvw163 blocca MUJNN3BTM7UO.
UI force error: [ 'Impossibile forzare la prenotazione. Riprova.' ]
```

Screenshot: `scratchpad/rvw163/u5b-force-person-busy-it-1280.png` (pannello «Forza prenotazione» con
«Impossibile forzare la prenotazione. Riprova.», banner superiore ancora «documenti scaduti»). Il retry manuale
risponde di nuovo 409 `PERSON_BUSY` (provato via API).

**Fix suggerito** (un file, stessa forma dei tre rami già corretti): in `onForceSubmit` leggere il corpo; su
409 con `PERSON_BUSY`/`INSTRUCTOR_BUSY` mostrare `labels.errors[code]`, su ogni altro 409
`labels.errors.overlap` (il messaggio del velivolo, oggi mai mostrato su questo ramo); tenere
`labels.force.generic` per il resto. Mettere il messaggio nel banner principale (`setFormError`) e chiudere il
pannello di forzatura (`resetForceState()`), perché la forzatura non può più servire. Più un e2e (o un unit con
`fetch` stubbato, come `booking-transition.test.ts`) sul ramo forza → persona occupata.

### MAJOR-2 — Deadlock `PATCH(X)` ‖ `approva(X)` → 500 (preesistente), e la story dichiara il contrario come proprietà dimostrata

**L'inversione** (righe su HEAD `c06aa29`):
- `updateBooking` (`:1071` transazione): `Aircraft … ORDER BY "id" FOR UPDATE` (`:1077-1078`) → `Person`
  (`:1099`, `lockBookingPeople`) → **`UPDATE "Booking"`** via `updateMany` (`:1118`), che prende il lock di
  riga su `Booking X`.
- `transitionBooking` → APPROVED (`:1294`): **`Booking X … FOR UPDATE`** (`:1295-1296`, primo statement) →
  … → `Aircraft … FOR UPDATE` (`:1337-1338`).

Stesso `Booking X` e stesso `Aircraft` in ordine opposto: ciclo garantito se le due richieste si incrociano.

**Il claim falso, scritto come contratto** (AD-6: «i doc-comment sono citati come contratto»):
- `bookings.service.ts:75-81`: «The global lock order is the same on all three paths — `Booking` (transition
  only) → `Aircraft` … → `Person` → `InstructorProfile` — and each transaction locks at most ONE person and ONE
  instructor …, so two booking writers **can never wait on each other in a cycle**».
- `prisma/schema.prisma:1110`: «in one global order on every write path — `Aircraft` … → `Person` →
  `InstructorProfile`» (omette `Booking`).
- story file AD-2 `:137-139`: «Perché è libero da deadlock, **per censimento e non per fiducia** … l'ordine fra
  tabelle è fisso e uguale nei tre percorsi → **nessun ciclo possibile fra due transazioni di prenotazione**».

Il censimento ha contato i lock espliciti e (merito del dev) i `FOR KEY SHARE` impliciti dei trigger FK, ma
non il lock di riga **implicito** dell'`updateMany` guardato su `Booking` — la stessa classe di omissione.

**Evidenza** (build di produzione, `rvw163/deadlock.mjs`: prenotazione PENDING `X`, poi `Promise.all` di
approvazione e spostamento della stessa `X`):

HEAD `c06aa29` (build `PF5WSG_1HvQYNjmn5Rw36`), N=20 + 20:
```
"D1 approve(X) | move(X same aircraft)":     { "500:INTERNAL_ERROR | 200 [slow>900ms]": 8, "200 | 500:INTERNAL_ERROR [slow>900ms]": 12 }
"D1b approve(X) | move(X to other aircraft)": { "500:INTERNAL_ERROR | 200 [slow>900ms]": 7, "200 | 500:INTERNAL_ERROR [slow>900ms]": 13 }
```
Log Postgres (`docker compose logs postgres`), un esempio fra 40:
```
ERROR:  deadlock detected
DETAIL:  Process 19171 waits for ShareLock on transaction 102391; blocked by process 19172.
        Process 19172 waits for ShareLock on transaction 102390; blocked by process 19171.
        Process 19171: SELECT "id", "status", "statusReason", "outOfServiceUntil", "archivedAt" FROM "Aircraft" WHERE "id" = $1 FOR UPDATE
        Process 19172: UPDATE "public"."Booking" SET "aircraftId" = $1, "startsAt" = $2, … WHERE ("public"."Booking"."id" = $7 AND "public"."Booking"."status" = …)
CONTEXT:  while locking tuple (11,3) in relation "Aircraft"
```
Server: `Unhandled /api/v1 error … Raw query failed. Code: 40P01` (e la variante `DriverAdapterError: deadlock
detected` quando la vittima è l'`UPDATE`) → envelope `INTERNAL_ERROR` 500; il perdente aspetta ~1 s
(`deadlock_timeout`) prima di morire. Nessuna corruzione: la transazione vittima fa rollback.

**Preesistente — provato, non dedotto**: `bookings.service.ts` sostituito temporaneamente con
`git show 325b7e5:…` (sha256 `55ab1046…`), build, server, controllo d'identità della build (persona
sovrapposta su un altro velivolo → **201**, cioè la guardia persona assente), stessa sonda N=10+10:
```
"D1 approve(X) | move(X same aircraft)":     { "500:INTERNAL_ERROR | 200 [slow>900ms]": 8, "200 | 500:INTERNAL_ERROR [slow>900ms]": 2 }
"D1b approve(X) | move(X to other aircraft)": { "500:INTERNAL_ERROR | 200 [slow>900ms]": 7, "200 | 500:INTERNAL_ERROR [slow>900ms]": 3 }
```
File ripristinato con `git checkout --` → sha256 `918e9f3b98cd3bb0a02eed6af53ae5ff74ba9f934232b96b33d51950ad529e73`
(identico a prima e al record del dev); rebuild (`npm run gates`) e controllo d'identità sulla build ripristinata
→ **409 `PERSON_BUSY`**.

**Impatto**: il pilota che sposta la sua PENDING mentre l'admin la approva (o due admin) → uno dei due riceve
«Si è verificato un errore» invece di un 409 parlante. Raro in un'aviosuperficie, ma deterministico quando
succede, e soprattutto il doc-comment ora **garantisce** l'assenza del ciclo a chi toccherà questi lock dopo.

**Fix suggerito** (preferito, 1 statement + 1 unit): prendere il lock di riga di `Booking X` come **primo**
statement della transazione di `updateBooking` (`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`,
prima del lock multi-velivolo): l'ordine `Booking → Aircraft → Person → InstructorProfile` diventa davvero
globale, le due transazioni sulla stessa prenotazione si serializzano su `Booking X` e il perdente riceve la
risposta pulita che il codice già prevede (409 dal guard `updateMany` o dal `isLegalBookingTransition`).
Unit sull'ordine dei lock (idioma già usato: `invocationCallOrder`) + ripetere la sonda D1 (attese `[200, 409]` /
`[200, 200]` a seconda di chi vince, mai 500). `cancelBooking` resta senza lock (un solo `updateMany`, nessun
altro lock: nessun ciclo possibile). **Alternativa minima** se la sessione principale non vuole toccare il
comportamento in questa story: correggere i tre claim (codice, `schema.prisma`, AD-2) e aprire un TD con questa
riproduzione. In entrambi i casi il claim attuale non può restare.

### LOW-1 — `api-v1.spec.ts:148`: il pilota del seed resta APPROVED su uno slot fisso del giorno se il test fallisce a metà

`longPastInterval()` (`e2e/api-v1.spec.ts:142-145`) è «tre giorni fa 07:30Z-08:30Z», uguale per tutti i run
dello stesso giorno. Il test approva la prenotazione del **pilota del seed** lì (`:178`) e la chiude FLOWN due
righe dopo. Se fallisce fra le due (una qualunque flake: login, 5 s), la prenotazione resta APPROVED su quello
slot; il retry crea una nuova PENDING e la sposta sullo **stesso** slot → **409 `PERSON_BUSY`** (il predicato
persona controlla anche gli spostamenti di una PENDING, verificato: S2 sotto) → il retry è rosso per
costruzione, e così ogni rerun dello stesso giorno sullo stesso DB. È esattamente l'accoppiamento che il
commento a `FUTURE_DAY` (`bookings.spec.ts:285-298`) vieta, e che quel commento dichiara chiuso
(«api-v1.spec.ts closes its own within the test», `:296`) — vero solo sul percorso felice. Non riprodotto sul
vivo (servirebbe iniettare un fallimento a metà test); la catena causale è verificata pezzo per pezzo dalle
sonde S2/S6. **Fix**: `try/finally` che, se la prenotazione non è arrivata a FLOWN, la annulla
(`POST …/cancel`, senza controlli); oppure uno slot passato unico per run.

---

## Decisioni PO necessarie

### PO-1 — «Lo stesso essere umano in due ruoli» (TD 16.3-a): riprodotto sul vivo

**Fatto**: la persona `H` (profilo istruttore + profilo pilota) è istruttore della lezione dell'allievo `St` su
`A`, 2031-06-05 09:00-10:00Z, APPROVED; l'admin prenota `H` come **pilota** su `B` nello stesso slot → **201
APPROVED**. SQL: `H` occupa **2** prenotazioni APPROVED sovrapposte (una come `instructorProfileId`, una come
`personId`). La variante «H pilota di sé stesso con sé stesso istruttore» è invece già bloccata (`PERSON_BUSY`).

```
lesson: St with instructor H on A 09-10 (APPROVED) -> 201 {"id":"cmujn3bf80047r1pvfgkfm53h","status":"APPROVED"}
H books HIMSELF as pilot on B 09:00-10:00 (same human, same slot) -> 201 {"id":"cmujn3bft0048r1pv8fclccie","status":"APPROVED"}
SQL H occupied APPROVED at D4 09-10 (as person OR as instructor): 2
```

La story lo dichiara (§6, AD-1, TD 16.3-a) e R-16-a nomina due soggetti e due codici, quindi **non è un difetto
della story**. Ma il titolo («una persona in un posto solo») e il caso d'uso reale (l'istruttore che si prenota
un volo proprio durante una sua lezione: l'allievo resta senza istruttore, cioè lo scenario grave che l'audit
F2 voleva chiudere) lo rendono una domanda da porre esplicitamente.

**Opzioni**:
- **A** — resta residuo dichiarato (status quo, TD 16.3-a).
- **B** — estendere i due predicati esistenti via `InstructorProfile.personId`: una persona impegnata come
  istruttore altrove → `PERSON_BUSY`; un istruttore impegnato come pilota altrove → `INSTRUCTOR_BUSY`. Nessun
  codice nuovo; il lock diventa «le righe `Person` dei due esseri umani coinvolti, `ORDER BY id`» (serve
  l'ordinamento: due righe della stessa tabella).
- **C** — un terzo codice (`HUMAN_BUSY` o simile) con messaggio proprio.

**Raccomandazione**: **B in una story successiva** (non nel review-fix: cambia l'insieme dei lock e va provata
con la stessa disciplina di discriminanza di questa). Riusa i codici e le stringhe già spediti, e il messaggio
«Questa persona ha già una prenotazione approvata…» resta vero.

(Il fix di MAJOR-2 è una scelta tecnica della sessione principale, non del PO.)

---

## Verificato corretto (empiricamente)

Tutti i probe dopo l'arbitro, sul server di produzione della **stessa build** dell'arbitro
(`PF5WSG_1HvQYNjmn5Rw36`, `npm run start` su :3000), salvo la sonda di preesistenza di MAJOR-2 (build
temporanea pre-story, poi ripristino). Script throwaway in `scratchpad/rvw163/` (`lib.mjs`, `api.mjs`,
`races.mjs`, `deadlock.mjs`, `lockhold.mjs`, `lockhold-i.mjs`, `ui.mjs`, `ui-m.mjs`, `ui-force.mjs`), mai nel
repo. Solo login admin riusciti (TD-6 conta solo i fallimenti: `login-throttle.ts`). Fixture `rvw163_`.

**Semantica (AC 1-4, [I-b], [I-c]) — `api.mjs`, output verbatim in `rvw163/api.out`**
- `PERSON_BUSY` su velivolo diverso e libero, `details` = `{bookingId, startsAt, endsAt}` ISO UTC stringa della
  prenotazione in conflitto; bordi: 08:00-09:00 e 10:00-11:00 accanto a 09:00-10:00 → **201**; sovrapposizione
  di **un minuto** (08:31-09:01) → 409; con **tre** conflitti i `details` nominano il **più precoce**
  (08:00-09:00), come dichiarato (`orderBy startsAt asc`).
- CANCELLED, PENDING, DENIED, FLOWN, NO_SHOW **non bloccano** (creazione su C sopra CANCELLED(A)+PENDING(B) →
  201; seconda prenotazione spostata sopra uno slot FLOWN → 200); approvare la PENDING di una persona che nel
  frattempo è APPROVED altrove → 409 `PERSON_BUSY` con i `details` di quella.
- Precedenza: aereo+persona+istruttore → `{"code":"CONFLICT","message":"This aircraft is already booked for an
  overlapping interval."}` **senza chiave `details`**; persona+istruttore → `PERSON_BUSY`; solo istruttore →
  `INSTRUCTOR_BUSY`; solo aereo → `CONFLICT` senza `details`.

**Concorrenza (AC 5) — `races.mjs`, N=25**
```
"B1 person 2-way approve":                  { "200,409:PERSON_BUSY": 25 }
"B2 instructor 2-way approve":              { "200,409:INSTRUCTOR_BUSY": 25 }
"B3 approve vs create (person)":            { "409:PERSON_BUSY | 201": 25 }
"B3i approve vs create (instructor)":       { "409:INSTRUCTOR_BUSY | 201": 24, "200 | 409:INSTRUCTOR_BUSY": 1 }
"B4 approve vs move (person)":              { "409:PERSON_BUSY | 200": 25 }
"B5 person 3-way approve":                  { "200,409:PERSON_BUSY,409:PERSON_BUSY": 13 }
"B5i approve(I) | create(I) | move(other)": { "409:INSTRUCTOR_BUSY | 201 | 200": 11, "200 | 409:INSTRUCTOR_BUSY | 200": 2 }
SQL person / instructor / aircraft overlaps (whole DB, APPROVED): 0 / 0 / 0
```
In B1 il 409 nomina sempre l'altra prenotazione della coppia (nessun `WRONG bookingId`).

**Il lock, non il caso — `lockhold.mjs` / `lockhold-i.mjs`**: una sessione psql tiene
`SELECT … FOR NO KEY UPDATE` sulla riga per 4 s; nel frattempo partono insieme approvazione, creazione
sovrapposta e due insert FK-referenzianti:
```
Person, round 0: approve 2995ms 200 · create 3002ms 409:PERSON_BUSY · POST expiry 93ms 201 · POST flight 129ms 201
Person, round 2: approve 3012ms 409:PERSON_BUSY · create 3004ms 201 · POST expiry 82ms 201 · POST flight 121ms 201
InstructorProfile, round 0: approve 2978ms 200 · create 2990ms 409:INSTRUCTOR_BUSY · POST instructor-rate 68ms 201 · POST flight(instr.) 108ms 201
InstructorProfile, round 2: approve 3023ms 409:INSTRUCTOR_BUSY · create 3012ms 201 · POST instructor-rate 68ms 201 · POST flight(instr.) 103ms 201
```
Entrambi gli scrittori superano i pre-check, si fermano sul lock, e al rilascio ne vince uno solo (entrambi gli
ordini osservati): è la prova deterministica del crossing che le raffiche mostrano solo statisticamente. Gli
insert FK non aspettano: l'emendamento `FOR NO KEY UPDATE` è corretto. Anche la raffica mista
approvazione‖volo‖scadenza sulla stessa persona (`deadlock.mjs` D2, 20 volte) → `200 | 201 | …` senza 500.

**F4 — ri-verifica in approvazione = risposta di `createBooking` (AC 6)**
```
approve archived             -> 409 CONFLICT "Cannot book an aircraft for an archived person."    | create -> identico
approve deactivated-profile  -> 422 PERSON_NOT_BOOKABLE                                          | create -> identico
approve deactivated-instructor -> 409 CONFLICT "This instructor profile is deactivated."          | create -> identico
approve on archived aircraft -> 409 CONFLICT "Aircraft is archived."                             | create -> identico
approve on grounded aircraft -> 422 AIRCRAFT_OUT_OF_SERVICE (details.reason/outOfServiceUntil)   | create -> identico
```
E la PENDING di una persona archiviata resta **rifiutabile** (DENY → 200): nessun vicolo cieco.

**R-16-b (AC 7)**: PENDING spostata a due giorni fa → approvazione **200**; PENDING su slot iniziato
(now-10m, now+50m) → approvazione 200 → FLOWN 200.

**F9 (AC 8)**: FLOWN e NO_SHOW su futura → 422 `BOOKING_NOT_STARTED`; prenotazione creata con inizio a +8 s:
FLOWN a t-7 s → 422, a **t+0,3 s → 200** (confronto fra istanti, nessun fuso in gioco); FLOWN su PENDING futura
→ 422 `BOOKING_TRANSITION_INVALID` (la matrice precede la guardia); DENY e «riapri» su futura → 200.

**Dati legacy sovrapposti (le 18+11 coppie del DB di carico)** — simulato sul DB e2e con un `UPDATE` SQL su due
righe `rvw163_` proprie (dichiarato): PATCH solo-note di una delle due → 409 `PERSON_BUSY` (stessa semantica che
il predicato velivolo ha sempre avuto su una coppia legacy: coerente, non una regressione); spostarla fuori
dalla sovrapposizione → 200; annullarla → 200; poi PATCH solo-note dell'altra → 200. Nessun percorso
legittimo di uscita è bloccato (annulla, sposta, FLOWN/NO_SHOW non controllano la sovrapposizione).

**UI (AC 10) — `ui.mjs`, `ui-m.mjs`, testo letto dal DOM + screenshot riletti**
```
U1  edit (Sposta), persona occupata, it 1280  -> "Questa persona ha già una prenotazione approvata che si sovrappone a questo intervallo."
U1b edit, aereo+persona occupati, it 1280      -> "Il velivolo è già prenotato per questo intervallo, oppure la prenotazione non è più valida. Ricarica la pagina e riprova."  (invariato)
U2  approva da riga, it 1280                   -> toast persona; riga ancora "In attesa · Approva · Rifiuta" (stale:false, nessun refresh)
U3  nuovo, istruttore occupato, en 1280        -> "The selected instructor already has an approved booking overlapping this interval."
U3b Flown su futura, en 1280                   -> "This booking has not started yet: it can only be marked as flown or no-show after its start time."
U3c approva, en 1280                           -> "This person already has an approved booking overlapping this interval."
U4  Panoramica mobile, approva, it 375         -> toast persona; sheet ANCORA APERTO (sheet_still_open: true)
U4b Sposta da lista mobile, it 375             -> "Questa persona ha già una prenotazione approvata che si sovrappone a questo intervallo."
```
Screenshot in `scratchpad/rvw163/`: `u1-edit-person-busy-it-1280.png`, `u2-approve-person-busy-it-1280.png`,
`u3-new-instructor-busy-en-1280.png`, `u3b-flown-not-started-en-1280.png`,
`u4-mobile-approve-person-busy-it-375.png`, `u4b-mobile-move-person-busy-it-375.png`.

**Contratto sul filo (AC 9)**: `GET /api/v1/openapi.json` servito dalla build: le descrizioni di
`POST /bookings`, `PATCH /bookings/{id}`, `POST /bookings/{id}/transition` nominano `PERSON_BUSY` e
`INSTRUCTOR_BUSY`; la transition anche `BOOKING_NOT_STARTED` e R-16-b; `409`/`422` dichiarati su tutte e tre.
Parità i18n: `it-only: 0 en-only: 0`.

**Codice e test (lettura mirata + diff)**
- Un solo predicato-guardia (`findBookingConflict`, `bookings.service.ts:369-404`), chiamato dai tre percorsi
  (`:726`, `:1100`, `:1355`); predicato velivolo con `where`/`select` pre-story; il terzo predicato non parte
  senza istruttore; `lockBookingPeople` dopo i lock `Aircraft` e prima dei predicati in tutti e tre i percorsi;
  il lock `Booking` di `transitionBooking` ora legge `instructorProfileId` (`:1296`).
- Unit: le sole righe rimosse da `bookings.service.test.ts` sono il `toHaveBeenCalledTimes(1)` diventato 2 (con
  asserzione esatta su `calls[1]`) e le fixture spostate su `STARTED_SLOT`; nessuna asserzione indebolita,
  nessun `objectContaining` al posto di un'uguaglianza.
- e2e: le 6 riparazioni FLOWN/NO_SHOW (`api-v1`, Effettuato/Assente, `mobile-overview`, `mobile-overview-overflow`,
  `mobile-planning`) e le 3 conversioni a pilota run-unique cambiano solo la fixture: ogni asserzione
  preesistente è identica (diff riga per riga). La scelta «ieri» solo dove la riga deve essere vista, «tre
  giorni fa» per le fixture solo-API è coerente con la finestra `now-48h` delle liste. Le riparazioni
  «conservative» (spostamento → hop → ritorno allo slot originale) lasciano identiche le fixture lette.
- Censimento del pilota/istruttore del seed rifatto con `grep` sugli 11 spec che toccano `/api/v1/bookings` +
  i 7 che guidano `new-booking-form`: coincide con §E(B) del record; confermato dal forense SQL post-suite
  (pilota del seed **0 APPROVED**, istruttore del seed **0 prenotazioni**).
- `grep -rn "'FLOWN'\|'NO_SHOW'" src/server`: l'unico scrittore di FLOWN/NO_SHOW è `transitionBooking`, quindi la
  guardia F9 non ha percorsi laterali.

**TD 16.3-a..f**: 16.3-a riprodotto (PO-1); 16.3-b e 16.3-c onesti (il DB di carico non è stato toccato, per
istruzione); 16.3-d onesto (le ri-verifiche F4 leggono la persona prima del lock `Person`: check-then-act
dichiarato); 16.3-e e 16.3-f plausibili, **non** manifestati in questo arbitro.

---

## Residuo e note

- **Doc stantio preesistente, non della story**: la descrizione OpenAPI di `PATCH /bookings/{id}` dice ancora
  «the overlap pre-check excludes this booking and every CANCELLED row» (dalla 12.2 conta solo APPROVED). Fuori
  perimetro; da correggere quando si tocca quella descrizione (es. nel fix di MAJOR-2).
- La sonda D2 (`deadlock.mjs`) ha registrato `422 SCOPE_MISMATCH` sulla POST della scadenza per un tipo con
  scope non compatibile col pilota di prova: rumore della sonda, non del codice.
- Sulla Panoramica mobile il toast d'errore copre i bottoni Approva/Rifiuta dello sheet
  (`u4-mobile-approve-person-busy-it-375.png`): comportamento preesistente del toast, non introdotto qui, e
  stile — non un finding.

## Stato della macchina alla consegna

- **Repo**: HEAD `c06aa29`, **nessun file tracciato modificato**, nessun commit. L'unica modifica temporanea
  (`bookings.service.ts` → versione `325b7e5`, per la prova di preesistenza di MAJOR-2) è stata ripristinata
  con `git checkout --`: sha256 `918e9f3b98cd3bb0a02eed6af53ae5ff74ba9f934232b96b33d51950ad529e73` prima e dopo.
- **`.next`**: ricostruita da `npm run gates` sul codice di HEAD (`BUILD_ID` `fd5XgT9JJOUy5BKrj4G_v`); la build
  dell'arbitro era `PF5WSG_1HvQYNjmn5Rw36`.
- **Server**: tutti quelli avviati dal reviewer fermati per PID (`510301`, `519911` pre-story, `522142`);
  `:3000`/`:3001` liberi.
- **DB e2e `airmanager`** (usato, NON resettato — va resettato prima del prossimo arbitro): `Person` 476,
  `Booking` 590, `Flight` 179; fixture `rvw163_` (60 persone, 57 velivoli, relative prenotazioni/voli/scadenze);
  3 tipi di scadenza `rvw163 blocca …` tutti **disattivati**; coppie APPROVED sovrapposte per persona /
  istruttore / velivolo = **0 / 0 / 0**; resta **1** coppia «stesso essere umano in due ruoli» (la riproduzione
  di PO-1: `cmujn3bft0048r1pv8fclccie` + `cmujn3bf80047r1pvfgkfm53h`, 2031-06-05), lasciata come evidenza. La
  coppia sovrapposta creata dal controllo d'identità sulla build pre-story è stata annullata sulla build
  ripristinata (`cmujnr903000e5zpvcj731qd6` → CANCELLED). La coppia «legacy» simulata via SQL in S8 ha una
  delle due righe annullata.
- **`airmanager_load`**: mai toccato. Nessun `docker compose down/up/restart`.
- **Log**: arbitro in `/tmp/airmanager-e2e/last-run.log`; probe, output e screenshot in
  `/tmp/claude-1000/-home-admin-AirManager/87e8c4a0-e70c-4ef9-934e-3d9b5a5f0be7/scratchpad/rvw163/`.
