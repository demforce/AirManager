---
baseline_commit: 738d399
---

# Story 16.3: Una persona in un posto solo — sovrapposizioni per persona e istruttore, ri-verifica in approvazione, guardia temporale sulle transizioni

Status: **review** — 2026-09-27 (dev su `325b7e5`, commit `4a1ae4d`; era ready-for-dev dal 2026-09-10). **Modello dev**: **Opus 5 xhigh** — la story **scrive codice UI**, e non per scelta: i tre punti in cui il client oggi tratta *ogni* 409 come «il velivolo è già prenotato» sono precisamente ciò che i due codici nuovi rendono **falso** (`new-booking-form.tsx:310`, `edit-booking-form.tsx:168`, `booking-transition.ts:100` — v. AD-7 con le righe esatte). Non c'è layout, non c'è CSS, non c'è componente nuovo: è **branching su codice d'errore + 6 stringhe i18n**, ma la regola utente 2026-07-29 («Opus 5 xhigh se la story scrive codice UI») **non ha una soglia** e questa story la attraversa. Review: **Opus 5 xhigh adversarial**, come sempre.

> ⚠️ **Baseline**: `738d399`. Ogni `file:riga` di questo file è **misurato su questo HEAD**. Vantaggio verificato: `git diff b7b8d13..HEAD -- src/server/services/bookings.service.ts src/server/services/errors.ts` è **vuoto**, quindi **tutte** le righe citate dall'ops-audit (misurate su `b7b8d13`) valgono ancora **invariate** — `:566`, `:936`, `:1161`, `:1038-1051`, `:1127-1176` sono confermate una per una in §3. Se il dev parte da un HEAD più avanzato, rilegge le righe citate e **corregge questo file** dove sono slittate.
>
> ✅ **Dev 2026-09-27, HEAD `325b7e5`**: `bookings.service.ts`, `bookings.service.test.ts` e i tre file client di AD-7 sono **byte-identici** a `738d399`; le righe slittate negli altri file (handler, registry, messages, e2e, censimento `FOR UPDATE`) sono **corrette qui sotto in place** (marcate «HEAD `325b7e5`») e censite una per una nel Dev Agent Record §A.
>
> ⚠️ **Un altro agent sta lavorando sulla 16.1** nello stesso working tree (`src/lib/zoned-time.ts` e i 6 service dei writer di «oggi»). Questa story **non tocca nessuno di quei file**: `bookings.service.ts` non è nel perimetro della 16.1. Se al momento del lavoro la 16.1 è già committata, l'unico effetto atteso qui è `zoned-time.ts` con `todayDateOnlyUtcInZone` in più — **non serve a questa story** (v. §6: la guardia temporale di F9 confronta due **istanti**, non due date-only).
>
> **Da leggere PRIMA di scrivere una riga**: `_bmad-output/planning-artifacts/audit-2026-09-10/ops-audit.md` §**F2**, §**F4**, §**F9**, le invarianti §**[I-1]**/§**[I-2]**, la sezione «Macchine a stati» e §**5.1**; la sezione «Story 16.3» + «Architettura e vincoli» + «Ratifiche PO» di `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` (**contratto**, gli AC di record). Skill obbligatoria: `.claude/skills/karpathy-guidelines/SKILL.md`. Skill UI: `design-taste-frontend` e `ui-ux-pro-max` si applicano al **testo dei messaggi** (l'unica superficie UI toccata), non a un ridisegno che qui non esiste.

---

## Story

As **un pilota, un istruttore o lo staff che prenota**,

I want che l'app impedisca alla stessa persona (o allo stesso istruttore) di essere **in due velivoli nello stesso istante** e che l'**approvazione** ri-controlli **chi** sta approvando,

so that il calendario dica la verità (F2), non si approvino prenotazioni di persone archiviate o con profilo disattivato (F4), e una prenotazione **futura** non possa essere chiusa come **volata** (F9).

### Il perché: una sola invariante applicata su tre soggetti che ne avrebbero bisogno

L'ops-audit ricostruisce l'invariante `[I-1]` — *un velivolo non può avere due prenotazioni APPROVED sovrapposte* — e la trova **applicata correttamente in tre punti, con lo stesso predicato**, serializzata da un `SELECT … FOR UPDATE` sulla riga `Aircraft` che **funziona sul vivo** (§5.1: due POST paralleli → 201 + 409; due approvazioni parallele → 200 + 409). Poi censisce **tutti** i predicati di sovrapposizione del codebase e trova `[I-2]`:

> 9 occorrenze, tutte in `bookings.service.ts`, **tutte chiavate su `aircraftId` o senza chiave di soggetto**. Nessuna su `personId`. Nessuna su `instructorProfileId`.

Il difetto non è un bug in una riga: è **un soggetto mancante**. La guardia esiste, è scritta bene, ed è cieca su due dei tre soggetti che occupano lo slot. Il caso operativamente grave non è il pilota con due aerei: è **l'istruttore su due lezioni contemporanee con due allievi diversi** — «uno dei due allievi arriverà a un aereo senza istruttore», e la prenotazione dell'istruttore **è** l'impegno che l'allievo compra.

E c'è una seconda cecità, sulla **stessa** funzione. Il doc-comment di `transitionBooking` (`:1088-1093`) promette che *«un'approvazione è, in effetti, "questa prenotazione sarebbe ancora creabile oggi"»*. L'audit lo verifica voce per voce: **è falso su quattro voci** (persona archiviata, profilo pilota/allievo disattivato, profilo istruttore disattivato, `startsAt` nel passato). Le prime tre sono buchi da chiudere; la quarta è **voluta** e va **dichiarata** (R-16-b) — perché oggi il commento afferma il contrario.

### Fatti misurati che vincolano il design

| Fatto | Misura (su `738d399`, 2026-09-10) | Conseguenza |
|---|---|---|
| Il difetto è **riproducibile sulle funzioni reali** | probe vitest: **9 failed / 3 passed** — output verbatim in §2 AC 12 | la discriminanza è **già scritta**, non da inventare |
| Il DB di carico **contiene già** violazioni della nuova invariante | `airmanager_load`: 40 000 prenotazioni, **7 141 APPROVED**, **18 coppie persona sovrapposte** (18/18 su **velivoli diversi**), **11 coppie istruttore** | F2 non è teorico: su dati realistici la guardia velivolo **non poteva** intercettarne nessuna. E la guardia nuova è **sulla scrittura**: le 29 coppie esistenti restano (v. §5) |
| Il lock esistente serializza **solo** i concorrenti sullo stesso velivolo | `:548`, `:915`, `:1145` — `WHERE "id" = <aircraftId>` | due approvazioni della stessa persona su **velivoli diversi** non si serializzano su nulla → il predicato-persona da solo resta un check-then-write (AC 5) |
| `handler.ts` **scarta** i `details` di un `ConflictError` | `src/lib/api/handler.ts:60` — `error instanceof ValidationError ? error.details : undefined` (**superato su HEAD `325b7e5`**: la 16.2, `3138115`, ha già esteso la riga — ora `handler.ts:65` — a `ConflictError`, pinnata da due unit in `handler.test.ts:270-313`) | «409 con la prenotazione in conflitto» **non arriva sul filo** senza una riga in più: AD-3 |
| Nessun chiamante di produzione popola `ConflictError.details` | `grep 'new ConflictError('` → **78** occorrenze, **0** con `details` (su HEAD `325b7e5`: la 16.2 ha aggiunto il primo, `FLIGHT_OVERLAP`) (il solo 3° argomento in uso è il `code`, `ppr.service.ts:500`) | la riga di `handler.ts` è a **impatto zero** sull'esistente, e `errors.test.ts:28` già pinna che la classe li porta |
| L'indice per il predicato-persona **c'è già** | `EXPLAIN ANALYZE` su `airmanager_load`: `Bitmap Index Scan on "Booking_personId_idx"`, 14 righe, **0,17 ms**; max prenotazioni per persona **25**, per istruttore **31**, media **9,4** | **nessun indice nuovo**, nessuna migrazione (AD-8) |
| Il client **appiattisce ogni 409** su un messaggio che nomina il velivolo | `new-booking-form.tsx:310`, `edit-booking-form.tsx:168`, `booking-transition.ts:100`; le 3 stringhe (`form.errors.overlap`, `list.actions.errors.conflict`) dicono tutte «il velivolo» | senza AD-7 la story spedisce un messaggio **falso**: «il velivolo è già prenotato» quando è **la persona** a essere occupata |
| I 13 punti e2e che marcano `FLOWN`/`NO_SHOW` sono **tutti** su prenotazioni **future** | 6 call-site in 5 file (tabella in §3.4) | la guardia F9 rompe **13 chiamate**: la riparazione è parte della story, non un effetto collaterale (AC 11) |
| Nessuno spec e2e ha **oggi** una collisione persona | censimento completo in §3.4: 0 coppie sovrapposte per la stessa persona, in nessun file | il rischio è **latente**, non attuale: si dichiara e si documenta (AC 11), non si riscrive la suite |
| `transitionBooking` **non legge** `instructorProfileId` | `LockedBookingRow` `:1076` e il `SELECT … FOR UPDATE` `:1118` non lo selezionano | il campo va aggiunto al lock: senza, la guardia istruttore sull'approvazione **non ha il dato** (AD-1) |
| Il DB e2e è **pulito** in questo momento | `airmanager`: **0** prenotazioni, 0 residui `audit_%`/`I-AUD%`/`Audit%`, **nessuna** `AppSetting` `sched*` | la trappola «residui dell'audit» della 16.1 è **superata**; resta quella della finestra 07:00-21:00 che `booking-window.spec.ts` lascia dietro di sé (§5) |

---

## §0 — Requisiti FISSI (contratto: piano epic 16-18, sezione «Story 16.3»)

| # | Requisito (dal piano — **AC di record**) |
|---|---|
| **P1** | Una prenotazione APPROVED per la persona P (o con istruttore I) rende **409 `PERSON_BUSY` / `INSTRUCTOR_BUSY`** ogni **creazione**, **spostamento** o **approvazione** di un'altra prenotazione con P (o I) su un intervallo sovrapposto, **su qualunque velivolo**, **con la prenotazione in conflitto**. `PENDING` **non** blocca (stessa semantica del velivolo). Il controllo sta nella **stessa transazione** dei tre predicati esistenti (`:566`, `:936`, `:1161`). |
| **P2** | Due **approvazioni concorrenti** di prenotazioni sovrapposte della stessa persona su **velivoli diversi** → **una 200 e una 409**. Il lock va preso **anche sulla persona** o si usa un vincolo equivalente — **la decisione è in questo file** (AD-2). |
| **P3** | Approvare una PENDING di una **persona archiviata**, o con **profilo pilota/allievo disattivato**, o su un **velivolo archiviato** → **422/409 con lo stesso codice che `createBooking` darebbe**. Approvare una prenotazione **già iniziata o passata resta permesso**, **e il doc-comment lo dice** (R-16-b). |
| **P4** | `FLOWN`/`NO_SHOW` su una prenotazione il cui **inizio è nel futuro** → **422 `BOOKING_NOT_STARTED`**. Dopo l'inizio dello slot le transizioni funzionano **come oggi**. |
| **P5** | Le **tre riproduzioni dell'audit** (F2; F4 nei tre casi; F9 sul 2027) sono **ROSSE sul pre-fix simulato** e diventano verdi. |

| # | Invariante (da «Architettura e vincoli») |
|---|---|
| **[I-a]** | **Guardie = 409/422 col codice esistente + unit discriminante + e2e**: ogni guardia nuova nasce con un test provato **ROSSO** simulando il pre-fix, con repo **ripristinato byte-identico** (sha256 dichiarato). |
| **[I-b]** | **`[startsAt, endsAt)` semi-aperto**: due prenotazioni che si **toccano** non si sovrappongono. Vale identico sui tre soggetti — nessuna eccezione «di comodo» per persona o istruttore. |
| **[I-c]** | **Solo `APPROVED` occupa uno slot** (story 12.2). Due `PENDING` sovrapposte coesistono **per progetto**, su qualunque soggetto: il conflitto emerge all'approvazione. |
| **[I-d]** | **Un solo calendario** (16.1): nessun `new Date()` confrontato con una data-only senza fuso. Qui la guardia F9 confronta **due istanti** (`startsAt` vs `now`), quindi il fuso **non entra** — e va detto, perché è l'unica ragione per cui questa story non dipende dalla 16.1. |
| **[I-e]** | **Nessuna cancellazione fisica, nessuna riscrittura di righe esistenti**: la story aggiunge **guardie**, non tocca una sola prenotazione già scritta (né le 29 coppie in conflitto del DB di carico). |

### Ratifiche già chiuse che vincolano QUESTA story

| R | Decisione PO (2026-09-10, vincolante) | Effetto vincolante qui |
|---|---|---|
| **R-16-a** | La stessa persona o lo stesso istruttore già impegnati in un intervallo sovrapposto → **409 secco, non derogabile**, su creazione, spostamento e approvazione (`PERSON_BUSY`, `INSTRUCTOR_BUSY`), **coerente col lock sul velivolo**. | **Nessun `force`**, nessun 422 derogabile, nessuna deroga per lo staff. La domanda dell'audit («esiste il caso legittimo del trasferimento in formazione?») è **chiusa: no**. Il dev **non riapre** la questione con AskUserQuestion. |
| **R-16-b** | Approvare una prenotazione **già iniziata o passata resta permesso** (lo staff regolarizza a posteriori) e va **dichiarato**; `FLOWN`/`NO_SHOW` su una prenotazione **futura** → **422** con guardia temporale. | Le due guardie temporali sono **la stessa domanda vista dai due lati** e hanno risposte **opposte**: nessun `BOOKING_IN_PAST` sull'approvazione (AC 7), un `BOOKING_NOT_STARTED` sulla chiusura (AC 8). |
| **R-16-c** (16.4) | Un tipo di scadenza disattivato smette di bloccare. | **Fuori scope qui.** L'approvazione continua a chiamare `findBlockingExpiredDocuments` **così com'è**: la 16.4 la modifica dentro, e le due story non si toccano. |
| **R-16-e** (16.8) | Archiviare un velivolo conta e avvisa come l'AOG. | **Fuori scope qui.** Questa story **non** tocca il ramo velivolo-archiviato dell'approvazione (che già esiste e già risponde 409, `:1150-1152`). |

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — UNA funzione di dominio per i tre predicati, con una precedenza dichiarata, e il predicato-velivolo **byte-identico**

L'ops-audit chiede *«mai in due copie che possano divergere: estrarre **una** funzione»*. La forma prescritta:

```ts
/** Il soggetto occupato che ha fatto scattare il 409 — l'ordine È la precedenza (AD-1). */
type BookingConflictSubject = 'AIRCRAFT' | 'PERSON' | 'INSTRUCTOR';

/**
 * L'UNICA implementazione dei tre predicati di sovrapposizione (story 16.3,
 * ops F2). Chiamata dai tre call-site (`createBooking`, `updateBooking`,
 * `transitionBooking` -> APPROVED) DENTRO la transazione e DOPO i lock, mai
 * in copia: i tre soggetti condividono la semantica semi-aperta
 * `[startsAt, endsAt)` e il filtro `status: 'APPROVED'` ([I-b], [I-c]).
 *
 * Precedenza AIRCRAFT -> PERSON -> INSTRUCTOR: il velivolo PRIMA, perché è
 * la risposta che i tre call-site danno oggi e che la UI e gli e2e leggono
 * (`e2e/bookings.spec.ts:429` asserisce «già prenotato» su un caso che è
 * ANCHE persona-occupata). Il predicato velivolo è quello di oggi, `where`
 * incluso: `bookings.service.test.ts:571` lo asserisce come oggetto ESATTO.
 */
async function findBookingConflict(
  tx: Prisma.TransactionClient,
  args: { aircraftId: string; personId: string; instructorProfileId: string | null; startsAt: Date; endsAt: Date; excludeBookingId?: string },
): Promise<{ subject: BookingConflictSubject; booking: { id: string; startsAt: Date; endsAt: Date } } | null>
```

**Tre `findFirst` in sequenza, non un `OR` unico.** Motivo verificabile: il `where` del predicato velivolo deve restare **identico** (l'asserzione esatta a `:571` e quelle `objectContaining` a `:1243` e `:1613` sono il guardrail), e la precedenza deve essere **leggibile come codice**, non ricostruita classificando il vincitore di una `OR`. Costo misurato: **2 query in più per scrittura** nel caso senza conflitto, ciascuna `Bitmap Index Scan` a **0,17 ms** su 40 000 righe (§«Fatti misurati»). Il terzo predicato **non parte** se `instructorProfileId` è `null`.

**Le tre `where`:**

| soggetto | `where` | `select` |
|---|---|---|
| AIRCRAFT | `{ aircraftId, status:'APPROVED', startsAt:{lt:endsAt}, endsAt:{gt:startsAt} }` (+ `id:{not:excludeBookingId}` dove c'è oggi) — **invariata** | `{ id: true }` — **invariato** |
| PERSON | `{ personId, status:'APPROVED', startsAt:{lt:endsAt}, endsAt:{gt:startsAt} }` (+ lo stesso `id:{not}`) | `{ id, startsAt, endsAt }` |
| INSTRUCTOR | `{ instructorProfileId, status:'APPROVED', … }` (+ lo stesso `id:{not}`) | `{ id, startsAt, endsAt }` |

**Perché il predicato-persona NON passa per l'istruttore, e viceversa.** Un istruttore è anche una persona: la stessa creatura umana può essere `personId` di una prenotazione e `instructorProfileId` di un'altra, e i due predicati **non se ne accorgono**. È un buco **reale e residuo**, e va **dichiarato** (§6, TD 16.3-a): chiuderlo vuol dire un predicato su «l'essere umano» via join `InstructorProfile.personId`, cioè un terzo codice e una domanda al PO su quale dei due nomi mostrare. R-16-a nomina **due** soggetti e **due** codici: la story ne implementa due. Il dev **non** allarga.

### AD-2 — La corsa si chiude con due **row lock** nuovi (`Person`, `InstructorProfile`), in un ordine globale dichiarato

**Decisione: opzione A — `SELECT … FOR UPDATE` sulla riga `Person` e, quando presente, sulla riga `InstructorProfile`, dentro la stessa transazione, DOPO il lock (o i lock) `Aircraft` e PRIMA dei tre predicati.**

L'ordine globale dei lock, **identico nei tre call-site**, diventa:

```
Booking (solo transitionBooking, :1118)  ->  Aircraft (1 riga, o N ORDER BY id)  ->  Person  ->  InstructorProfile
```

**Perché è libero da deadlock, per censimento e non per fiducia:**
1. ogni transazione blocca **al massimo una** riga `Person` e **al massimo una** `InstructorProfile` (`personId`/`instructorProfileId` sono **immutabili** su una prenotazione, `lib/schemas/bookings.ts` li strippa dal PATCH) → non serve nessun `ORDER BY` su questi due, a differenza del set multi-velivolo di `updateBooking`;
2. l'ordine **fra tabelle** è fisso e uguale nei tre percorsi → nessun ciclo possibile fra due transazioni di prenotazione;
3. **censimento completo dei `FOR UPDATE` in `src/server`** (§3.3): oggi si bloccano soltanto `Aircraft`, `Account`, `Booking`, `PprRequest`. **Nessuna** transazione blocca `Person` o `InstructorProfile`, e l'unica altra famiglia multi-lock è `flights.service.ts` con l'ordine `Aircraft -> Account`, **disgiunto** da `Person`/`InstructorProfile`. Non esiste un ordine contrario da cui costruire un ciclo. `archivePerson` (`people.service.ts:588-601`) è un `update` singolo **senza transazione**: prende il lock di riga per la durata di una istruzione e non ne chiede altri.

**Il lock è una `$queryRaw` nuda, il cui risultato non si legge:**

```ts
// Row lock (FOR UPDATE) sulla PERSONA (story 16.3, ops F2 / AC 2): il lock
// Aircraft sopra serializza solo i concorrenti sullo STESSO velivolo — due
// approvazioni della stessa persona su velivoli DIVERSI non si serializzano
// su nulla, e il predicato-persona da solo sarebbe un check-then-write
// (ops-audit F2, «serve un secondo lock»). La riga esiste per costruzione
// (FK `Booking.personId`), quindi non c'è nessun 404 da rialzare qui: il
// valore non viene letto, l'effetto È il lock.
await tx.$queryRaw`SELECT "id" FROM "Person" WHERE "id" = ${personId} FOR UPDATE`;
```

Idioma già in casa e **identico**: `accounts.service.ts:639`, `flights.service.ts:1305` (HEAD `325b7e5`; era `:1123`) (`SELECT "id" FROM "Account" … FOR UPDATE`, risultato ignorato).

**Perché NON un vincolo di esclusione Postgres (`btree_gist`).** Sarebbe la difesa più forte, ed è stata **deliberatamente esclusa** quando l'unico soggetto era il velivolo (`prisma/schema.prisma:1104-1109`). Rivalutata con tre soggetti, resta **no**, con tre ragioni misurabili: (a) servono **tre** constraint parziali su `status='APPROVED'` con range `tstzrange`, quindi una migrazione SQL raw + l'estensione `btree_gist` su un DB (il `load`) che **contiene già 29 coppie violanti** e la rifiuterebbe alla creazione; (b) l'errore arriva come `23P01` e per scegliere fra i tre codici bisognerebbe **parsare il nome del constraint**, cioè legare il contratto HTTP a un identificatore di schema; (c) **non elimina il lock**: il lock `Aircraft` serve anche a leggere lo **stato** del velivolo senza TOCTOU (`:548` fa entrambe le cose con una fetch). Costo alto, un solo beneficio, e contraddirebbe una scelta dichiarata senza rimuovere ciò che sostituirebbe.

**Perché NON `pg_advisory_xact_lock(hashtext(personId))`.** Idioma nuovo in un codebase che ha già il suo, e una collisione di hash serializzerebbe persone **non** correlate senza che nessuno se ne accorga. Nessun vantaggio sul row lock.

**Nota di onestà, da scrivere nel doc-comment**: il lock chiude la corsa **sull'invariante di sovrapposizione**. Le ri-verifiche di AD-4 (persona archiviata, profilo disattivato) restano **check-then-act**, esattamente come lo sono già oggi il blocco scadenze e la finestra oraria: una archiviazione che si infila fra la lettura e il commit non viene intercettata. Non è un buco introdotto da questa story ed è **fuori** da R-16-a; va dichiarato, non chiuso con un terzo lock.

### AD-3 — Due codici nuovi, `details` sul filo, e **nessun** `AIRCRAFT_BUSY`

| cosa | valore |
|---|---|
| Classe | `ConflictError` → **409** (`handler.ts:34`) |
| Codici | `PERSON_BUSY`, `INSTRUCTOR_BUSY` (SCREAMING_SNAKE, stabili: `errors.ts:10-11` — «part of the API contract … must not change once shipped») |
| Messaggi (log, inglese) | `'This person already has an approved booking for an overlapping interval.'` / `'This instructor already has an approved booking for an overlapping interval.'` |
| `details` | `{ bookingId: string, startsAt: Date, endsAt: Date }` della prenotazione **in conflitto** (P1: «con la prenotazione in conflitto») |

**Una riga in `src/lib/api/handler.ts:60` è obbligatoria**, altrimenti i `details` **non escono** (✅ **già presente su HEAD `325b7e5`**, `handler.ts:65`, dalla 16.2 — riusata, non rifatta):

```ts
const details = error instanceof ValidationError || error instanceof ConflictError ? error.details : undefined;
```

Impatto sull'esistente: **zero, per costruzione** — 78 `new ConflictError(` in `src/server`, **nessuno** passa `details` (verificato), quindi ogni envelope oggi prodotta resta identica. `errors.test.ts:28` già pinna che la classe li porta; serve **un unit in `handler.test.ts`** che pinna che ora **arrivano** (AC 9), accanto a quello che c'è per `ValidationError` (`handler.test.ts:255-267`).

**`AIRCRAFT_BUSY` NON si introduce**, benché l'audit lo nomini. Tre ragioni:
1. il 409 del velivolo resta `CONFLICT` con lo **stesso messaggio**: è il modo di far restare verdi, senza toccarli, il branch UI di fallback e le asserzioni e2e (`bookings.spec.ts:429` «già prenotato»);
2. la UI **non ha bisogno** di distinguerlo: gli basta riconoscere i due codici nuovi e lasciare tutto il resto al ramo che esiste (AD-7);
3. **privacy**: la prenotazione in conflitto per `PERSON_BUSY`/`INSTRUCTOR_BUSY` appartiene, per costruzione del predicato, **allo stesso soggetto** che la richiesta nomina — nessuna informazione nuova sul terzo. Quella del velivolo appartiene invece a **qualcun altro**, e metterne l'intervallo nei `details` sarebbe un canale di correlazione che la mascheratura della story 14.5 esiste per chiudere (`personId` in chiaro = ops F6). Il 409 del velivolo resta **senza `details`**, e questo va scritto nel commento.

### AD-4 — F4: una sola implementazione dei predicati, riusata dall'approvazione

`createBooking` risolve e valida la persona **fuori** dalla transazione a `:449-505`. L'estrazione **minima** che rende `transitionBooking` coerente senza cambiare di una virgola il comportamento di `createBooking`:

```ts
/** Il `select` che entrambi i percorsi usano per la persona-bersaglio (story 16.3): una sola forma, due caricamenti. */
const BOOKABLE_PERSON_SELECT = { id: true, archivedAt: true, pilotProfile: { select: { deactivatedAt: true } }, studentProfile: { select: { deactivatedAt: true } }, instructorProfile: { select: { deactivatedAt: true } } } as const;

/** 409 dell'archiviato — condiviso dai due percorsi (`createBooking` per ogni attore, `transitionBooking` in approvazione, ops F4). */
function assertPersonNotArchived(person: TargetPerson): void { … }   // il throw di :465, spostato

/** Il gate «almeno un profilo di volo attivo» del ramo STAFF di `createBooking` (:471-476), riusato verbatim dall'approvazione. */
function assertPersonHasActiveFlyingProfile(person: TargetPerson): void { … }   // 422 PERSON_NOT_BOOKABLE

/** 404 + 409 del profilo istruttore (:479-491), riusato dall'approvazione; ritorna l'id per `resolvedInstructorProfileId`. */
async function assertActiveInstructorProfile(db: PrismaLike, instructorProfileId: string): Promise<string> { … }
```

Dentro `createBooking` cambiano **solo** le tre righe di `throw` in tre chiamate: l'ordine, i messaggi, i codici e gli stati HTTP restano **identici** (i test di `createBooking` sono il guardrail e **non si toccano**). ⚠️ L'archiviato **non** va dentro `assertPersonHasActiveFlyingProfile`: a `:463-465` quel 409 vale per **tutti e tre** i percorsi di `createBooking`, mentre il gate del profilo esiste in tre varianti diverse (staff 422, own-self 403, cross-person 422). Impacchettarli insieme cambierebbe la risposta del percorso own-self da 409 a 403 — **regressione silenziosa**.

**Posizione nel ramo `to === 'APPROVED'`: le ri-verifiche di persona/istruttore vanno PRIME, prima di `findBlockingExpiredDocuments` (`:1130`)**, perché è l'ordine che `createBooking` ha (persona → scadenze → passato → finestra → [lock → velivolo → sovrapposizione]) e perché P3 chiede «lo **stesso** codice che `createBooking` darebbe»: con una persona archiviata **e** un documento scaduto, `createBooking` risponde 409 archiviato, e l'approvazione deve rispondere lo stesso. **Un unit dedicato alla precedenza** (AC 6).

⚠️ **`transitionBooking` non ha il dato dell'istruttore.** `LockedBookingRow` (`:1076`) e il `SELECT … FOR UPDATE` (`:1117-1118`) non selezionano `instructorProfileId`: va **aggiunto a entrambi**. Serve sia alla ri-verifica F4 sia al predicato `INSTRUCTOR_BUSY` sull'approvazione. `updateBooking` lo ha già (`EDITABLE_BOOKING_SELECT:731`).

### AD-5 — F9: `BOOKING_NOT_STARTED`, e la guardia è su `startsAt`, non su `endsAt`

```ts
if ((to === 'FLOWN' || to === 'NO_SHOW') && existing.startsAt.getTime() > Date.now()) {
  throw new ValidationError('This booking has not started yet and cannot be closed.', undefined, 'BOOKING_NOT_STARTED');
}
```

- **Dove**: dentro la transazione, **subito dopo** `isLegalBookingTransition` (`:1123-1125`) e **prima** del ramo `APPROVED` (`:1127`) — è una guardia sulla **transizione**, non una ri-verifica di creabilità, e deve valere sul valore `startsAt` **letto sotto il lock** (`:1118`), non su una seconda lettura.
- **`startsAt`, non `endsAt`**: l'audit lascia la scelta al PO («o `endsAt <= now` se il PO vuole la chiusura solo a slot concluso»); R-16-b ratifica **«su una prenotazione futura → 422»**, cioè il criterio dell'**inizio**. Conseguenza operativa voluta: uno slot **in corso** si può già chiudere come volato — è il caso normale del rientro anticipato, e chiudere solo a slot concluso costringerebbe ad aspettare l'ora piena. Va scritto nel doc-comment.
- **`ValidationError` → 422**, non 409: non è un conflitto di stato con un'altra riga, è **questa** richiesta che arriva troppo presto. Coerente con `BOOKING_IN_PAST` (`:534`), che è l'immagine speculare.
- **Nessun fuso**: `startsAt` è un istante (`DateTime` timestamptz) e `Date.now()` è un istante. Non c'è nessuna data-only nel confronto → **[I-d] soddisfatta senza dipendere dalla 16.1**.
- **`riapri` non è toccato**: `FLOWN|NO_SHOW|DENIED -> PENDING` resta libero. Riaprire una prenotazione chiusa per errore **deve** restare possibile, ed è anche la valvola di sicurezza per i dati già chiusi male (il DB e2e/demo può contenerne).

### AD-6 — Sei doc-comment diventano falsi (o incompleti) e vanno corretti nello stesso commit

Non è cosmetica: in questo progetto i doc-comment sono citati **come contratto** da altri moduli, e l'audit ha ricostruito le invarianti **da lì**.

| Riga su `738d399` | Cosa diventa falso / incompleto |
|---|---|
| `bookings.service.ts:51-57` | *«Person/instructor resolution runs OUTSIDE the transaction (Dev Notes: it **never participates in the overlap invariant, so it needs no lock**)»* — **falso su entrambe le metà** dopo AD-2. La risoluzione resta fuori (e va detto **perché**: ordine degli errori e pattern 403-prima-della-query), il **lock** entra dentro. |
| `:58-70` | Il paragrafo «Concurrency (AC 2)» descrive **un** lock su **un** soggetto e conclude *«the lock alone is sufficient»*. Va riscritto sui **tre** soggetti, con l'**ordine globale** di AD-2 e la ragione per cui resta senza `btree_gist`. |
| `:1088-1093` | *«an approval is, in effect, "would this booking still be creatable today"»* — l'audit lo qualifica **falso su quattro voci**. Dopo la story è **vero su tre** e va **dichiarata l'eccezione**: il passato è ammesso **per scelta** (R-16-b), con la parola «ratificata». |
| `:1140` | La stessa affermazione, inline. |
| `prisma/schema.prisma:1099-1109` | *«The concurrency guard against a double booking on the same aircraft (AC 2) is a `FOR UPDATE` lock on the `Aircraft` row … deliberately NOT a Postgres exclusion constraint … the lock alone makes the pre-check-overlap + insert airtight»* — va estesa ai due soggetti nuovi e ai due lock nuovi, **conservando** la scelta anti-`btree_gist` e aggiungendo la ragione rivalutata (AD-2). |
| `prisma/schema.prisma:1213-1221` | Il doc dell'indice: *«Backs both the overlap scan (`aircraftId` + range on `startsAt`) and the calendar view … every query already filters on `aircraftId`/`startsAt` (this index)»* — dopo la story ci sono **due scan in più**, serviti da `@@index([personId])` e `@@index([instructorProfileId])` che **esistono già**. Va detto quale indice serve quale scan, con la misura di §«Fatti misurati» (0,17 ms, 25/31 righe di picco), così il prossimo non aggiunge un indice che non serve. |

### AD-7 — UI: tre `if (status === 409)` da rendere consapevoli del codice, e **sei** stringhe

Il difetto da correggere è lo stesso in tre punti: **il client decide il messaggio dallo status, prima di leggere il corpo**.

| # | File:riga (HEAD) | Cosa fa oggi | Cosa deve fare |
|---|---|---|---|
| 1 | `src/app/[locale]/dashboard/bookings/new-booking-form.tsx:309-313` | `if (response.status === 409) { setFormError(labels.errors.overlap); return; }` — **prima** di leggere il body | leggere il body (come fa già il ramo 422 subito sotto), e su `PERSON_BUSY`/`INSTRUCTOR_BUSY` mostrare la stringa relativa; **ogni altro 409** → `labels.errors.overlap`, invariato |
| 2 | `src/app/[locale]/dashboard/bookings/edit-booking-form.tsx:167-171` | idem con `labels.errors.conflict` | idem; ogni altro 409 → `labels.errors.conflict`, invariato |
| 3 | `src/app/[locale]/dashboard/bookings/booking-transition.ts:100` | `if (response.status === 409) return { ok:false, conflict:true, **stale:true**, message: labels.conflict };` | leggere il body; per i due codici nuovi tornare `{ ok:false, conflict:true, **stale:false**, message: labels.PERSON_BUSY \| labels.INSTRUCTOR_BUSY }`; ogni altro 409 **byte-identico** a oggi |

⚠️ **`stale:false` sui due codici nuovi non è un dettaglio.** `stale` significa *«la riga sul mio schermo non è più reale»* e fa **chiudere il pannello e ricaricare** (`bookings-table.tsx:268-271`, `mobile-pending-bookings.tsx`). Su `PERSON_BUSY` la riga è **perfettamente viva**: è *un'altra* prenotazione che blocca. Conflarle è esattamente l'errore che la review 15.3 F2 ha già pagato una volta (documentato a `booking-transition.ts:66-79`).

**Il ramo 422 di `bookingErrorMessage` (`booking-transition.ts:44-63`) prende un `case 'BOOKING_NOT_STARTED'`**, altrimenti il 422 nuovo cade su `labels.generic` («Operazione non riuscita. Riprova.») — che è **la cosa che non può funzionare**: riprovare fallisce identico (stessa lezione di R-15.4-g, `BOOKING_OUTSIDE_WINDOW`).

**Sei stringhe, tre chiavi × due locale** (`messages/it.json`, `messages/en.json`; parità **0/0** oggi, verificata):

| chiave | IT | EN |
|---|---|---|
| `BookingsPage.form.errors.PERSON_BUSY` (dopo `overlap`, `it.json:1652`/`en.json:1652` su HEAD `325b7e5`) | `Questa persona ha già una prenotazione approvata che si sovrappone a questo intervallo.` | `This person already has an approved booking overlapping this interval.` |
| `BookingsPage.form.errors.INSTRUCTOR_BUSY` | `L'istruttore indicato ha già una prenotazione approvata che si sovrappone a questo intervallo.` | `The selected instructor already has an approved booking overlapping this interval.` |
| `BookingsPage.list.actions.errors.BOOKING_NOT_STARTED` (nel blocco `it.json:1719-1727` su HEAD `325b7e5`) | `La prenotazione non è ancora iniziata: può essere segnata come effettuata o assente solo dopo l'orario di inizio.` | `This booking has not started yet: it can only be marked as flown or no-show after its start time.` |

«Questa persona» funziona anche quando il pilota prenota **per sé** — è la stessa voce che `form.errors.PERSON_NOT_BOOKABLE` (*«Questa persona non ha un profilo attivo idoneo alla prenotazione.»*) usa già oggi su quello stesso percorso: **precedente in casa**, non da rilitigare. Nessun placeholder da interpolare in nessuna delle tre (niente nomi, niente marche: v. AD-3 privacy) → nessun `t.raw`.

**Le tre chiavi si consumano in `booking-labels.ts`:** `buildNewBookingFormLabels` (`:122-132`) e `buildEditBookingFormLabels` (`:161-172`) prendono i due `form.errors.*`; `buildBookingsTableLabels().actions.errors` (`:222-231`) prende tutte e tre — ed **è l'unica sorgente** anche del pannello mobile della Panoramica (`dashboard/page.tsx:622`: `errors: buildBookingsTableLabels(tBookings).actions.errors`), quindi la coda mobile è coperta **senza toccarla**. Il tipo `BookingTransitionErrorLabels` (`booking-transition.ts:26-37`) cresce di tre campi: il compilatore trova da solo ogni chiamante che ne manca uno.

**Zero CSS, zero layout, zero componente nuovo, zero testid nuovo.** Nessun `-mobile`/`mobile-` in gioco (CLAUDE.md), nessuna misura a 375/1280 da produrre: non cambia una regola di stile. Se il dev si trova a scrivere CSS, ha sbagliato story.

### AD-8 — La forma del fix, e cosa NON contiene

**Contiene**: 1 funzione di dominio nuova + 3 helper estratti + 2 `$queryRaw` di lock + 1 guardia temporale + 2 codici + 1 riga in `handler.ts` + 6 doc-comment + 3 descrizioni OpenAPI + 3 file client + 6 stringhe + i test.

**NON contiene**:
- **nessuna migrazione Prisma** e **nessun indice nuovo** (misurato: AD-1, `Booking_personId_idx` fa il lavoro in 0,17 ms);
- **nessun campo nuovo** su `Booking`;
- **nessuno status HTTP nuovo**: `409` e `422` sono già dichiarati su tutte e tre le rotte (`registry.ts:1495`, `:1529`, `:1563` su HEAD `325b7e5`, via `errorResponses(401, 403, 404, 409, 422)`) → si aggiornano solo le **tre descrizioni** (`:1484` POST, `:1521` PATCH, `:1555` transition), nello **stesso commit** dell'implementazione;
- **nessuna env var** → niente da sincronizzare in `.env.example`/`ci.yml`, `src/lib/env.ci-sync.test.ts` resta verde per costruzione;
- **nessun `force`** e nessuna deroga (R-16-a);
- **nessun tocco** a `listBookings`/`listCalendarBookings`/`cancelBooking`/`listReservedAircraftIds` — le altre 6 occorrenze del predicato di sovrapposizione censite da `[I-2]` sono **filtri di lettura**, non guardie (§3.2).

---

## §2 — Acceptance Criteria

> Ogni AC che dice **«misurato»** richiede **un numero** nel Dev Agent Record. Ogni AC che dice **«discriminante»** richiede la prova che il test è **ROSSO sul pre-fix simulato**, con repo **ripristinato byte-identico** (sha256 dei file toccati).

### I predicati

**AC 1 — Una funzione, tre predicati, una precedenza, tre call-site.**
`findBookingConflict` (AD-1) esiste **una volta sola** ed è chiamata dai tre call-site (`createBooking`, `updateBooking`, `transitionBooking`→APPROVED). Nessun `findFirst` di sovrapposizione sopravvive **inline** nei tre punti. La precedenza è AIRCRAFT → PERSON → INSTRUCTOR e ha un unit che la esercita con **tutti e tre** i conflitti presenti contemporaneamente (atteso: 409 `CONFLICT`, messaggio del velivolo).
**Verifica nel record, con l'output**:
```
grep -c "findBookingConflict" src/server/services/bookings.service.ts        # atteso: 1 definizione + 3 call-site
grep -n "status: 'APPROVED', startsAt: { lt" src/server/services/bookings.service.ts   # atteso: solo dentro la funzione
```

**AC 2 — `PERSON_BUSY` su creazione, spostamento e approvazione (discriminante).**
Una prenotazione **APPROVED** della persona P su un intervallo sovrapposto fa rispondere **409 `PERSON_BUSY`** a: `POST /api/v1/bookings`, `PATCH /api/v1/bookings/{id}`, `POST /api/v1/bookings/{id}/transition {to:'APPROVED'}` — **su qualunque velivolo**, incluso un velivolo diverso e libero. `details` porta `{ bookingId, startsAt, endsAt }` della prenotazione in conflitto. Una prenotazione **PENDING** della stessa persona sullo stesso intervallo **non** blocca ([I-c]); due intervalli che si **toccano** non si sovrappongono ([I-b], unit ai due bordi).

**AC 3 — `INSTRUCTOR_BUSY`, sugli stessi tre percorsi (discriminante).**
Identico ad AC 2 su `instructorProfileId`, con lo stesso `details`. Una prenotazione **senza** istruttore non fa mai partire il terzo predicato (unit: `findFirst` chiamata **2** volte, non 3).

**AC 4 — Il 409 del velivolo è invariato, e vince la precedenza.**
Messaggio, codice (`CONFLICT`) e **assenza** di `details` del conflitto-velivolo sono **byte-identici** a oggi nei tre punti. Prove: `bookings.service.test.ts:566-580` (asserzione **esatta** sul `where`) e `:1238-1249`/`:1607-1617` restano verdi **senza modifiche**; `e2e/bookings.spec.ts:429` (`:454` su HEAD `325b7e5`) continua a leggere «già prenotato» su un caso che è **anche** persona-occupata (dimostrazione della precedenza sul vivo).

**AC 5 — La corsa è chiusa, e la prova è parallela (misurato).**
`Person` e, quando presente, `InstructorProfile` sono bloccate `FOR UPDATE` dentro la transazione, **dopo** i lock `Aircraft` e **prima** dei predicati, nei tre call-site. Prove richieste:
1. **unit** sull'SQL e sull'ordine: le chiamate `$queryRaw` di ogni percorso contengono `FOR UPDATE` su `"Aircraft"`, poi su `"Person"`, poi su `"InstructorProfile"`; `invocationCallOrder` del lock persona **precede** la prima `booking.findFirst` (stesso idioma di `:553-564`);
2. **e2e reale, due approvazioni concorrenti**: un pilota (login run-unique) crea **due** prenotazioni PENDING per **sé** sullo **stesso intervallo** e su **due velivoli run-unique diversi** (legale: `PENDING` non blocca, [I-c]); lo staff manda **due `Promise.all` di `POST …/transition {to:'APPROVED'}`** → `statuses.sort()` **`[200, 409]`**, e il 409 ha codice **`PERSON_BUSY`**. Idioma da riusare: `e2e/bookings.spec.ts:1033-1054` (`:1061-1082` su HEAD `325b7e5`). È l'estensione alla persona della PROBE 6 dell'audit (§5.1).

### La ri-verifica dell'approvazione (F4, R-16-b)

**AC 6 — L'approvazione ri-verifica chi approva, con gli STESSI codici di `createBooking` (discriminante, tre casi).**
Nel ramo `to === 'APPROVED'`, **prima** del blocco scadenze:

| caso | atteso | uguale a `createBooking` |
|---|---|---|
| persona **archiviata** | **409** `CONFLICT`, `'Cannot book an aircraft for an archived person.'` | `:465` |
| persona **senza** profilo di volo attivo (pilota/allievo/istruttore tutti disattivati o assenti) | **422** `PERSON_NOT_BOOKABLE` | `:471-476` |
| `instructorProfileId` **disattivato** | **409** `CONFLICT`, `'This instructor profile is deactivated.'` | `:488` |

I tre verdetti vengono dagli **stessi** helper del percorso di creazione (AD-4): un `grep` nel record mostra **un solo** `throw` per ciascuno dei tre messaggi in tutto il file. **Unit di precedenza**: persona archiviata **e** documento bloccante scaduto → risponde **409 archiviato**, non 422 `EXPIRED_DOCUMENTS`. Il caso **velivolo archiviato** era già coperto (`:1150-1152`, unit `:1600-1605`) e resta invariato: va **dichiarato**, non riscritto.

**AC 7 — Approvare una prenotazione già iniziata o passata resta permesso, e il commento lo dice (R-16-b).**
Nessuna guardia temporale entra nel ramo `APPROVED`. Unit: approvare una prenotazione con `startsAt` **nel passato** risponde **200** (è il pin `B4` del probe, **verde su HEAD** e che **deve restare verde**). I quattro doc-comment di AD-6 (`:51-57`, `:58-70`, `:1088-1093`, `:1140`) sono corretti e il terzo **nomina R-16-b** e il perché («lo staff regolarizza a posteriori»). E2e: la catena `crea futura → sposta nel passato (staff) → approva → 200` in `api-v1.spec.ts` (AC 11 #1) è la prova end-to-end.

### La guardia temporale (F9)

**AC 8 — `FLOWN`/`NO_SHOW` su una prenotazione futura → 422 `BOOKING_NOT_STARTED` (discriminante).**
La guardia è su `startsAt > now` (AD-5), letto **sotto il lock** della riga `Booking`, per entrambi i target e **solo** per loro. Unit richiesti: 2027 → 422 su `FLOWN` **e** su `NO_SHOW`; una prenotazione **iniziata** (`startsAt` passato, `endsAt` futuro) → **200** su entrambi (lo slot in corso si chiude, AD-5); `riapri` da `FLOWN`/`NO_SHOW`/`DENIED` → **200** anche su una prenotazione futura (il rimedio a una chiusura sbagliata **non** si blocca).

### Il contratto sul filo

**AC 9 — `details` di un `ConflictError` arrivano sul filo, e l'OpenAPI dice i codici nuovi.**
`handler.ts:60` inoltra i `details` anche per `ConflictError`; un unit in `handler.test.ts` lo pinna (accanto a `:255-267`; ✅ su HEAD `325b7e5` sono già due, `:270-313`, dalla 16.2). Le **tre** descrizioni del registry (`registry.ts:1485` POST, `:1522` PATCH, `:1556` transition — su HEAD `325b7e5`) nominano `PERSON_BUSY`/`INSTRUCTOR_BUSY` (409, con la forma di `details`) e — sulla transition — `BOOKING_NOT_STARTED` (422) **e** il fatto ratificato che l'approvazione di una prenotazione già iniziata **è permessa**. Stesso commit dell'implementazione. Nel record: il `git diff --stat` di `registry.ts` e la conferma che `npm run gates` (che include il build, cioè la generazione OpenAPI) è verde.

**AC 10 — UI: tre rami consapevoli del codice, sei stringhe, zero stile.**
I tre punti di AD-7 leggono il corpo prima di scegliere il messaggio; `stale` resta `false` sui due codici nuovi; `bookingErrorMessage` ha il `case 'BOOKING_NOT_STARTED'`. Le sei stringhe esistono nei due locale e la **parità resta 0/0** — comando da riportare verbatim:
```
python3 -c "
import json
def k(o,p=''):
    if isinstance(o,dict):
        for a,b in o.items(): yield from k(b,p+'.'+a)
    else: yield p
a=set(k(json.load(open('messages/it.json')))); b=set(k(json.load(open('messages/en.json'))))
print('it-only:',len(a-b),'en-only:',len(b-a))"
```
`git diff --stat` su `src/app` deve mostrare **solo** i tre file di AD-7 + `booking-labels.ts`, e **nessun** `.css`. Verifica UI interattiva con Playwright MCP (o lo script throwaway sanzionato): il form di creazione mostra il messaggio **della persona** su un caso persona-occupata, e quello **del velivolo** su un caso velivolo-occupato — due screenshot nel record.

### Le fixture e la non-regressione

**AC 11 — Le fixture e2e riparate una per una, senza indebolire una sola asserzione.**
I **6 call-site / 13 chiamate** `FLOWN`/`NO_SHOW` censiti in §3.4 sono riparati **spostando la prenotazione nel passato** (percorso staff-only già in uso: `updateBooking` esenta `bookings.manage.any` da `BOOKING_IN_PAST`, `:880`, ed è l'idioma di `mobile-overview.spec.ts#moveBooking:130-136`), **mai** cancellando o allentando un'asserzione. Il record elenca, per ciascuno, la riga prima/dopo e l'asserzione che è rimasta identica. Vincoli misurati da rispettare:
- lo slot passato deve stare **dentro le 48 h** che la lista mostra (`dashboard/bookings/page.tsx:209`, `listFrom = now - 48h`; il DTO filtra `endsAt > from`), altrimenti la riga **sparisce dalla pagina** e il test fallisce per un'altra ragione: **ieri 07:30Z–08:30Z** soddisfa entrambi i vincoli (è sempre a meno di 48 h e sta dentro la finestra 07:00-21:00 che `booking-window.spec.ts` può aver lasciato, nei due offset DST);
- la prenotazione **nuova** dello spec deve usare **persone run-unique**, non `pilot@airmanager.local` (§3.4 (B)).

**AC 12 — Le discriminanze sono ROSSE sul pre-fix e verdi dopo (P5).**
I **9 test rossi** del probe di ricognizione (output verbatim sotto) sono portati dentro `src/server/services/bookings.service.test.ts` e diventano **verdi**; i **3 pin verdi** (`A0` controllo velivolo, `B4` R-16-b, `C3` slot iniziato) restano **verdi in entrambi gli stati**. La tabella guardia → discriminanza del record riporta l'esito per ciascuna e lo sha256 del ripristino.

**Il probe è già scritto e già misurato su `738d399`** — `/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/story-16-3/person-busy.probe.test.ts` con `vitest.probe.config.mjs` accanto (vitest è confinato a `src/**`, e un `defineConfig` importato da `/tmp` **non risolve `vitest/config`**: il config è un **oggetto letterale** esportato, v. il file). Output **verbatim**, `env -u DATABASE_URL -u AUTH_SECRET npx vitest run --config …/vitest.probe.config.mjs`:

```
 RUN  v4.1.9 /home/admin/AirManager

 ❯ …/story-16-3/person-busy.probe.test.ts (12 tests | 9 failed) 368ms
     × A1 create: the same person, already APPROVED on aircraft_1 for 09:00-10:00 today, cannot be booked on aircraft_2 for the same interval 250ms
     × A2 create: the same instructor, already APPROVED on aircraft_1 for 09:00-10:00 today, cannot be indicated on aircraft_2 for the same interval 17ms
     × A3 move: staff cannot MOVE a booking onto an interval where its own person is already APPROVED elsewhere 8ms
     × A4 approve: a PENDING booking whose person is already APPROVED elsewhere over the same interval cannot be approved 7ms
     × B1 approve: an ARCHIVED person cannot be approved (the same 409 `createBooking` gives) 7ms
     × B2 approve: a person whose ONLY flying profile is DEACTIVATED cannot be approved (422 PERSON_NOT_BOOKABLE, as on create) 8ms
     × B3 approve: a DEACTIVATED instructor profile on the booking cannot be approved (409, as on create) 10ms
     × C1: FLOWN on a booking that starts in 2027 answers 422 BOOKING_NOT_STARTED 11ms
     × C2: NO_SHOW on the same future booking answers 422 BOOKING_NOT_STARTED 5ms

 FAIL  … > A1 create: … cannot be booked on aircraft_2 for the same interval
AssertionError: expected { booking: { …(16) }, warnings: [] } to be an instance of ConflictError

 FAIL  … > A2 create: … cannot be indicated on aircraft_2 for the same interval
AssertionError: expected { booking: { …(16) }, warnings: [] } to be an instance of ConflictError

 FAIL  … > A3 move: … its own person is already APPROVED elsewhere
AssertionError: expected { id: 'booking_new', …(15) } to be an instance of ConflictError

 FAIL  … > A4 approve: … cannot be approved
AssertionError: expected { id: 'booking_new', …(15) } to be an instance of ConflictError

 FAIL  … > B1 approve: an ARCHIVED person cannot be approved
AssertionError: expected { id: 'booking_new', …(15) } to be an instance of ConflictError

 FAIL  … > B2 approve: … 422 PERSON_NOT_BOOKABLE, as on create
AssertionError: expected { id: 'booking_new', …(15) } to be an instance of ValidationError

 FAIL  … > B3 approve: a DEACTIVATED instructor profile … 409, as on create
AssertionError: expected { id: 'booking_new', …(15) } to be an instance of ConflictError

 FAIL  … > C1: FLOWN on a booking that starts in 2027 answers 422 BOOKING_NOT_STARTED
AssertionError: expected { id: 'booking_new', …(15) } to be an instance of ValidationError

 FAIL  … > C2: NO_SHOW on the same future booking answers 422 BOOKING_NOT_STARTED
AssertionError: expected { id: 'booking_new', …(15) } to be an instance of ValidationError

 Test Files  1 failed (1)
      Tests  9 failed | 3 passed (12)
```

I **tre verdi** sono la prova che il probe non è degenere: `A0` (sovrapposizione sullo **stesso** velivolo → già 409 oggi), `B4` (approvare una prenotazione **già iniziata** → 200 oggi, e R-16-b vuole che resti così), `C3` (`FLOWN` su uno slot **iniziato** → 200 oggi e dopo).

**AC 13 — Gate e suite.**
`npm run gates` verde; `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>` verde su ogni file di test toccato (regola CLAUDE.md sulla validazione eager dell'env — questa story **non** aggiunge import verso service «grossi», ma il gate lo verifica comunque); poi **DB fresco** e **suite e2e completa** via `scripts/e2e.sh start` + `scripts/e2e.sh status`, con l'esito verbatim nel record. La catena dei project serializzati **non cambia** (nessuno spec nuovo scrive `AppSettings` globali).

---

## §3 — Dev Notes: blast radius e censimento misurato su `738d399`

### 3.1 — I tre predicati, riverificati riga per riga

| dove | lock | predicato | throw |
|---|---|---|---|
| `createBooking` | `:543-548` — `SELECT … FROM "Aircraft" WHERE "id" = $1 FOR UPDATE`, **prima istruzione** della transazione | `:566-570` `findFirst({ where:{ aircraftId, status:'APPROVED', startsAt:{lt:endsAt}, endsAt:{gt:startsAt} }, select:{id:true} })` | `:571` `ConflictError('This aircraft is already booked for an overlapping interval.')` |
| `updateBooking` | `:909-915` — `WHERE "id" IN (…) ORDER BY "id" FOR UPDATE` (destinazione + corrente, anti-deadlock) | `:936-946`, idem **+ `id:{not:bookingId}`** | `:947`, stesso messaggio |
| `transitionBooking` → APPROVED | `:1117-1118` `Booking` FOR UPDATE (prima istruzione), poi `:1144-1145` `Aircraft` FOR UPDATE | `:1161-1171`, idem **+ `id:{not:bookingId}`** | `:1172`, stesso messaggio |

Ordine dei controlli nel ramo `APPROVED` **oggi**: scadenze `:1129-1138` → finestra `:1142` → lock+stato velivolo `:1144-1159` (archiviato `:1150-1152`) → sovrapposizione `:1161-1172`. **Assenti**: persona archiviata, profilo attivo, profilo istruttore attivo, guardia temporale.

Ordine dei controlli in `createBooking` **oggi** (da replicare in precedenza, AD-4): own-rules 403 `:413-439` → `force` 403 `:441-444` → persona 404/409/422 `:449-505` → scadenze `:511-531` → `BOOKING_IN_PAST` `:533-535` → finestra `:540` → [lock → stato velivolo → sovrapposizione → create].

### 3.2 — Le 9 occorrenze di `[I-2]`, e quali sono guardie

`grep -n "startsAt: { lt\|endsAt: { gt" src/server/services/bookings.service.ts` → 9, tutte in questo file. **3 sono guardie** (§3.1) e le tocca questa story. **6 sono filtri di lettura** e **non si toccano**: `listBookings`, `listCalendarBookings`, `listReservedAircraftIds` e i loro rami (il perimetro di una finestra temporale, non un'invariante). Il record deve riportare il censimento **rifatto** con questa classificazione — è la forma che l'invariante `[a]` dell'AOG ha già collaudato.

### 3.3 — Censimento dei `FOR UPDATE` in `src/server` (la base della prova anti-deadlock di AD-2)

| tabella bloccata | dove | ordine locale |
|---|---|---|
| `Aircraft` | `aircraft.service.ts:646`; `flights.service.ts:1275`, `:1500`, `:1639` (IN … ORDER BY id) — righe su HEAD `325b7e5`; `bookings.service.ts:548`, `:915` (IN … ORDER BY id), `:1145` | in `flights`: **Aircraft → Account** |
| `Account` | `accounts.service.ts:639`; `flights.service.ts:1305`, `:1510`, `:1679` (IN … ORDER BY id); `membership.service.ts:103` — righe su HEAD `325b7e5` | — |
| `Booking` | `bookings.service.ts:1118` | **Booking → Aircraft** |
| `PprRequest` | `ppr.service.ts:494` | — |
| `Person` | **nessuno** | ← i due target nuovi |
| `InstructorProfile` | **nessuno** | ← |

Nessun ordine contrario esiste: `flights` non blocca mai `Person`/`InstructorProfile`, `bookings` non blocca mai `Account`. L'unica transazione che scrive `Person` insieme ad altro (`people.service.ts:492-520`, create composito) non tocca `Aircraft`.

### 3.4 — Blast radius e2e (censimento completo, 11 file che toccano `/api/v1/bookings`)

**(A) `FLOWN`/`NO_SHOW` da riparare — 6 call-site, 13 chiamate, TUTTE su prenotazioni future:**

| # | file:riga | target | `startsAt` al momento della transizione | riparazione prescritta |
|---|---|---|---|---|
| 1 | `e2e/api-v1.spec.ts:166` | FLOWN | `2099-05-0N T10:00Z` (`futureInterval():126-130`) | fra approve e FLOWN **non** basta: riordinare in **crea (pilota, PENDING) → PATCH admin nel passato → approve (200 = prova e2e di R-16-b, AC 7) → FLOWN (200)** |
| 2 | `e2e/bookings.spec.ts:1734` (HEAD `325b7e5`) | FLOWN (via UI) | `2031-03-10T09:00Z` (`FUTURE_DAY`, fixture `setupPendingBookingAsStaff:1638-1663`) | **non** cambiare l'helper (lo usano 4 test, 2 dei quali non ne hanno bisogno): estenderne il `return` con il `bookingId` (additivo, già disponibile a `:1611`) e, nel solo test Effettuato/Assente, PATCH nel passato **prima** del click su approva |
| 3 | `e2e/bookings.spec.ts:1749` (HEAD `325b7e5`) | NO_SHOW (via UI) | idem, seconda fixture dello stesso test | idem |
| 4 | `e2e/mobile-overview.spec.ts:161-163` (helper `createPendingBooking:159-166`, usato a `:262`, `:313`, `:574`, `:614`) | NO_SHOW ×4 | «domani» 07:30Z + offset (`safeSlotTomorrow:104-108`) | dentro l'helper: `moveBooking` (già presente, `:130-136`) su **ieri 07:30Z**, poi i due hop `NO_SHOW → PENDING`. **Verificato**: nessuno dei 4 test asserisce l'intervallo (asseriscono `registration`, `lastName`, `'Durata'`), e la card pending mostra la finestra `now-48h` (`dashboard/page.tsx:306`), quindi la riga resta visibile **senza** rimettere la prenotazione nel futuro. Se il dev preferisce la variante conservativa, rimetta lo slot originale con un secondo `moveBooking` e lo dichiari |
| 5 | `e2e/mobile-overview-overflow.spec.ts:101-104` | NO_SHOW **×9** (loop `:85-105`) | «domani» 07:30Z + i·30min | stesso trattamento nel loop (9 PATCH in più). ⚠️ Il test misura l'**overflow** della card: se lo spostamento cambia l'ordine o il numero di righe visibili, **rimettere** lo slot originale. Valutare `test.setTimeout` |
| 6 | `e2e/mobile-planning.spec.ts:438` | FLOWN | «domani» T08:00Z | PATCH nel passato → FLOWN → riapri → **PATCH di ritorno** allo slot originale: questo test asserisce la **geometria** delle azioni del sheet (`:462-470`), quindi la fixture deve tornare identica |

**(B) Il rischio `PERSON_BUSY` fra spec — latente, non attuale (misurato).**
`pilot@airmanager.local` è **la sola identità condivisa** con cui uno spec **crea** prenotazioni (`STUDENT_EMAIL`/`INSTRUCTOR_EMAIL` sono solo login). Chi lo usa e su quali bande:

| file | banda | stato finale |
|---|---|---|
| `bookings.spec.ts` | `FUTURE_DAY` (2031-03-10) **02:00-03:00**, **06:00-07:00**, **09:00-10:00** | APPROVED |
| `bookings.spec.ts` | `FUTURE_DAY` 05:00-06:00, 10:00-11:00, 13:00-14:00, 14:00-15:00 | PENDING/CANCELLED (**non** bloccano, [I-c]) |
| `api-v1.spec.ts` | `2099-05-01..20 T10:00-11:00Z` | APPROVED per un istante, poi FLOWN; l'altro percorso resta PENDING → DENIED |
| `aircraft-out-of-service-until.spec.ts:306-309` | `oggi+120g T11:00-12:00` | PENDING |

⚠️ **Dev 2026-09-27 — censimento incompleto, corretto nel Dev Agent Record §E/§G**: guardava solo la direzione «una PENDING non blocca», non «una CREAZIONE è bloccata da una APPROVED»; `:1086` (02:00-03:00 locale, PENDING) collide con la APPROVED di `:1160` (stessa banda) nello stesso run, e `:408`/`:1160`/`:1808` collidono ciascuno col proprio residuo al secondo run sullo stesso DB. **Zero sovrapposizioni oggi**: le tre bande APPROVED del primo file sono disgiunte fra loro e i tre file vivono su intervalli di date che non si incrociano (2031 / 2099 / oggi+120). Ma **niente nel codice lo garantisce**, e con `fullyParallel: true` i test dello stesso file corrono in worker diversi. La story **non riscrive** la suite: (a) aggiunge **un commento** accanto a `FUTURE_DAY` (`bookings.spec.ts:286`) che elenca le bande APPROVED riservate al pilota del seed e dice perché devono restare disgiunte; (b) usa **persone run-unique** in tutti i test nuovi. Ogni altro spec crea persona **e** velivolo run-unique per test → esposizione nulla per costruzione.

**(C) Istruttore**: **una sola** prenotazione con `instructorProfileId` in tutta la suite (`bookings.spec.ts:529-564` su HEAD `325b7e5`, istruttore run-unique, PENDING, mai approvata). Nessuna coppia sovrapposta possibile → `INSTRUCTOR_BUSY` **non ha copertura e2e oggi** e la story deve aggiungerla.

**(D) Semi.** `prisma/seed.ts`: **zero** prenotazioni (il DB e2e nasce senza). `prisma/seed-demo.ts:476-492`: 6 prenotazioni via il **servizio reale**, una sola persona ne ha due (giorni diversi) → **nessun impatto**. `prisma/seed-load.ts`: v. §5, ultima voce.

### 3.5 — Unit esistenti che cambiano (e quelli che NON devono cambiare)

| file:riga | cosa succede | azione |
|---|---|---|
| `bookings.service.test.ts:227` | `queryRaw.mockResolvedValue(LOCKED_OPERATIONAL_AIRCRAFT)` serve **tutte** le `$queryRaw`: i lock nuovi ricevono la riga velivolo e la **ignorano** (AD-2) | nessuna |
| `:228` | `bookingFindFirst.mockResolvedValue(null)` serve tutti i predicati → «nessun conflitto» resta il default | nessuna |
| `:238` | `personFindUnique.mockImplementation(async () => ({ email: 'pilot@example.com' }))` — default pensato per l'email di DENY. **Con AD-4 la lettura persona entra nel ramo APPROVED**: `archivedAt` sarebbe `undefined`, e `undefined !== null` → **409 su OGNI test di approvazione** | **obbligatoria**: il default deve soddisfare **entrambi** i `select` (`{ email, id, archivedAt: null, pilotProfile:{deactivatedAt:null}, studentProfile:null, instructorProfile:null }`). È la modifica più insidiosa della story |
| `:1221` `expect(queryRawMock).toHaveBeenCalledTimes(1)` (updateBooking, «locks BOTH … in ONE query») | diventa **2** (velivoli + persona) | aggiornare il **numero** e aggiungere l'asserzione che `calls[1]` è il lock `"Person"`; `calls[0]` resta il lock multi-velivolo asserito oggi |
| `:1625` `expect(queryRawMock).toHaveBeenCalledTimes(1)` («no re-checks for DENY/FLOWN/NO_SHOW/riapri») | il test chiama `to:'FLOWN'` sulla fixture base (`startsAt` 2099) → **422 `BOOKING_NOT_STARTED`** | portare la fixture nel passato (`mockBookingLock({ status:'APPROVED', startsAt:new Date(PAST_STARTS_AT), endsAt:new Date(PAST_ENDS_AT) })`, costanti già presenti a `:147-148`); il conteggio **resta 1** (FLOWN non prende né velivolo né persona) ed è ciò che il test vuole dimostrare |
| `:1645-1659` matrice esaustiva `from × to` | le due coppie legali `APPROVED → FLOWN` e `APPROVED → NO_SHOW` girano sulla fixture 2099 → **422** | override della fixture **solo** per quei due `to`, nel passato; la matrice resta esaustiva |
| `:1716-1723` `it.each(['APPROVED','FLOWN','NO_SHOW','PENDING'])` «never sends an email» | FLOWN/NO_SHOW → 422 prima dell'email | stesso override |
| `:566-580`, `:1238-1249`, `:1607-1617` (le tre asserzioni sul `where` di sovrapposizione) | **devono restare verdi senza una modifica**: è la prova che AD-1 non ha cambiato il predicato velivolo | ⚠️ se cambiano, il predicato è stato alterato → **indagare, non aggiornare** |
| `:553-564` (lock **prima** del predicato) | resta valida: il lock persona sta fra i due | nessuna |
| `flights.service.test.ts`, `aircraft.service.test.ts` | nessun `Booking` di sovrapposizione, nessun `Person` FOR UPDATE | nessuna |

### 3.6 — File toccati (previsione; il record dichiara quelli effettivi)

**Produzione (7)**
1. `src/server/services/bookings.service.ts` — AD-1 (funzione + 3 call-site), AD-2 (2 lock ×3), AD-4 (3 helper + ramo APPROVED), AD-5 (guardia), AD-6 (4 doc-comment), `LockedBookingRow`+`SELECT` `:1076`/`:1118`.
2. `src/lib/api/handler.ts` — **una** riga (`:60`).
3. `prisma/schema.prisma` — **due** doc-comment (`:1099-1109`, `:1213-1221`). **Nessuna migrazione** (solo commenti → `prisma migrate diff` deve dire «no difference»: da riportare).
4. `src/lib/schemas/registry.ts` — tre descrizioni.
5. `src/app/[locale]/dashboard/bookings/booking-transition.ts` — AD-7 #3 + `case` + 3 campi nel tipo.
6. `src/app/[locale]/dashboard/bookings/new-booking-form.tsx` — AD-7 #1.
7. `src/app/[locale]/dashboard/bookings/edit-booking-form.tsx` — AD-7 #2.
+ `src/app/[locale]/dashboard/bookings/booking-labels.ts` e `messages/{it,en}.json` (AD-7).

**Test (4 + 5 spec)**
`src/server/services/bookings.service.test.ts` (il grosso), `src/lib/api/handler.test.ts` (1 unit), `e2e/bookings.spec.ts` (fixture + nuovi casi + commento bande), `e2e/api-v1.spec.ts`, `e2e/mobile-overview.spec.ts`, `e2e/mobile-overview-overflow.spec.ts`, `e2e/mobile-planning.spec.ts`.

**Cosa NON si tocca**: `prisma/seed.ts`, `prisma/seed-demo.ts`, `prisma/seed-load.ts` (§5), `playwright.config.ts`, `.env.example`, `.github/workflows/ci.yml`, `scripts/`, ogni altro service, ogni file `.css`, `src/lib/zoned-time.ts` e i file della 16.1.

---

## §4 — Piano di test

**Unit — nuovi in `bookings.service.test.ts`** (i 12 casi del probe, portati dentro il file esistente: la mock chain è **la stessa**, nessun mock nuovo)
1. `PERSON_BUSY` su create / update / transition→APPROVED, con `details` (AC 2); PENDING che **non** blocca; i due bordi che si **toccano** ([I-b]).
2. `INSTRUCTOR_BUSY` sugli stessi tre percorsi (AC 3); senza istruttore il terzo predicato **non parte** (conteggio `findFirst`).
3. Precedenza: tre conflitti insieme → messaggio/codice del **velivolo** (AC 1/4).
4. Lock: SQL `FOR UPDATE` su `"Person"`/`"InstructorProfile"` e `invocationCallOrder` **prima** del primo `findFirst`, nei tre percorsi (AC 5).
5. F4: archiviato / senza profilo attivo / istruttore disattivato + **precedenza** contro `EXPIRED_DOCUMENTS` (AC 6); e il pin R-16-b (passato → 200, AC 7).
6. F9: 2027 → 422 su FLOWN e NO_SHOW; slot **iniziato** → 200; `riapri` su una futura → 200 (AC 8).

**Unit — nuovo in `handler.test.ts`**: i `details` di un `ConflictError` arrivano nell'envelope (AC 9).

**Unit — esistenti che cambiano**: la tabella §3.5, **in quel modo** (numeri e fixture aggiornati al valore corretto; **mai** un `objectContaining` al posto di un'uguaglianza esatta — disciplina AD-4 della 16.1 e AD-8 di AOG-1b).

**e2e — nuovi** (in `e2e/bookings.spec.ts`, project principale, **persone run-unique**)
7. `PERSON_BUSY` end-to-end: persona P APPROVED su velivolo A → creazione su velivolo B, stesso intervallo → **409** con `code === 'PERSON_BUSY'`; e la stessa cosa in **approvazione**.
8. `INSTRUCTOR_BUSY` end-to-end (la copertura che oggi non esiste, §3.4 (C)).
9. **Corsa parallela** (AC 5 #2): due `Promise.all` di approvazione → `[200, 409]`, idioma `:1033-1054`.
10. `BOOKING_NOT_STARTED`: `POST …/transition {to:'FLOWN'}` su una prenotazione futura → **422** col codice.
11. UI: il form di creazione mostra il messaggio **della persona** (non quello del velivolo) su un caso persona-occupata — l'unica asserzione che distingue AD-7 fatto da AD-7 dimenticato.

**e2e — esistenti che cambiano**: i 6 call-site di §3.4 (A), con la regola «slot passato dentro le 48 h e dentro 07:00-21:00» di AC 11.

**Discriminanze obbligatorie** (ROSSE sul pre-fix simulato, repo ripristinato byte-identico con sha256): le 9 del probe. Il pre-fix si simula rimuovendo **una guardia alla volta** (non tutte insieme): il record riporta 9 righe con l'esito.

**Gate**: `npm run gates` → `npx vitest run` per file → **DB fresco** → `scripts/e2e.sh start` + `status` (MAI `playwright test` in foreground, MAI rilanciare la suite per scoprire com'è andata).

---

## §5 — Trappole note

- **Il default `personFindUnique` dei test di approvazione ti mangia mezz'ora.** `bookings.service.test.ts:240` (era citata `:238`) risolve `{ email }` e nient'altro: appena il ramo APPROVED legge la persona, `archivedAt` è `undefined` e la guardia archiviato scatta su **ogni** test di transizione. Il sintomo (decine di 409 dove ci si aspetta 200) **sembra** un difetto della guardia nuova: è la fixture. §3.5 ha la riga da scrivere.
- **`stale` non è `conflict`.** Marcare `stale:true` su `PERSON_BUSY` fa chiudere il pannello mobile e ricaricare la pagina su una riga **ancora viva**: è la review 15.3 F2 ripetuta (il commento a `booking-transition.ts:66-79` la racconta). Il test 11 di §4 è l'unica difesa.
- **Il predicato-velivolo deve restare `select:{id:true}`.** Aggiungere `startsAt`/`endsAt` anche là rompe l'asserzione **esatta** di `:566-580` e — peggio — apre la porta a metterne l'intervallo nei `details` di un conflitto che appartiene a **un'altra persona** (AD-3, privacy / ops F6).
- **Una prenotazione nel passato non si può CREARE**, per nessun attore (`:533-535`, senza esenzione staff). L'unico modo di ottenerne una è **crearla nel futuro e spostarla** (`updateBooking` esenta lo staff, `:880`). Ogni fixture di AC 11 passa da lì.
- **Uno slot passato può cadere fuori dalla lista.** `dashboard/bookings/page.tsx:209` parte da `now - 48h`: una prenotazione spostata a «tre giorni fa» **non compare** e il test fallisce con «row not found», che non c'entra niente con la guardia. **Ieri 07:30Z** è la scelta misurata (sempre < 48 h, e dentro la finestra oraria).
- **La finestra 07:00-21:00 sopravvive ai run.** `booking-window.spec.ts` (project serializzato) lascia `sched.openTime/closeTime` scritte nel DB globale; `mobile-overview.spec.ts:96-103` documenta un 422 `BOOKING_OUTSIDE_WINDOW` **misurato** proprio così. Ogni slot nuovo (passato o futuro) deve stare dentro quella finestra nei **due** offset DST. **Oggi il DB e2e non ha nessuna `AppSetting` `sched*`** (verificato), quindi un run pulito non la vede: non contare su questo.
- **Ripetere run e2e mirati sullo stesso DB fa scattare il lock anti-brute-force** (TD-6, cap per identifier): dopo ~10 login lo stesso spec fallisce **sempre** alla riga di login. Prima di attribuirlo alla flake: `SELECT identifier, count(*) FROM "LoginAttempt" WHERE "createdAt" > now() - interval '15 minutes' GROUP BY 1`. Questa story aggiunge login (il pilota della corsa parallela): tenerne conto.
- **`Escape` e i pannelli**: `SlideOver` chiude l'**intero** pannello (CLAUDE.md). I test nuovi che passano dal form di creazione chiudono i popup interagendo col campo successivo, mai con `Escape`.
- **Il DB di carico contiene già 29 coppie in conflitto** (18 persona, tutte su velivoli diversi; 11 istruttore) su 7 141 APPROVED — misurate. La guardia è **sulla scrittura**: le righe esistenti restano e nessuna lettura cambia, quindi le misure di performance dell'epic 17 **non** sono toccate. Ma **approvare o spostare** una di quelle prenotazioni su quel DB risponderà, correttamente, 409: se una story della 17 lo fa e lo interpreta come regressione, ha sbagliato diagnosi. `prisma/seed-load.ts` **non si tocca in questa story**: il suo commento dichiara già che la non-sovrapposizione è garantita **solo** per il sottoinsieme futuro/APPROVED **e solo per velivolo**, e le 28 000 prenotazioni passate sono sovrapposte **per progetto** (finiscono in stati terminali). Estendere la mappa di retry a `personId`/`instructorProfileId` è **8 righe** e ha senso, ma richiede un re-seed di 192 s e vive nell'epic 17 → **TD 16.3-c**, con le query di verifica già scritte (§7).
- **Non esiste una `AIRCRAFT_BUSY`.** Se durante il lavoro sembra «più pulito» rinominare il 409 del velivolo, si stanno rompendo tre asserzioni e un contratto HTTP spedito, per simmetria estetica: AD-3 spiega perché no.
- **`instructorProfileId` non è nel lock della prenotazione.** Se la guardia istruttore sull'approvazione «non scatta mai», il motivo è `:1118`: il campo non è selezionato e arriva `undefined`. È il primo posto da guardare.

---

## §6 — Fuori scope DICHIARATO

- **Il caso «stessa creatura umana, due ruoli»**: P come `personId` di una prenotazione e P come **istruttore** di un'altra, sovrapposte. R-16-a nomina **due soggetti e due codici**; chiuderlo richiede un predicato via `InstructorProfile.personId` e una decisione PO su quale nome mostrare. → **TD 16.3-a**, con la query per misurarne la frequenza sul DB di carico.
- **La sovrapposizione fra `Flight` (voli registrati) e prenotazioni**: `[I-2]` la nomina, ma è **ops F3** e vive nella **16.2**.
- **`riapri` senza storia delle transizioni** (ops **F10**): questa story tocca `transitionUpdateData` **zero** volte. TD già registrato dall'audit.
- **La guardia temporale sull'approvazione** (`BOOKING_IN_PAST` in APPROVED): **vietata** da R-16-b, non «non fatta».
- **Il `force` derogabile su `PERSON_BUSY`**: chiuso da R-16-a (409 secco).
- **Il vincolo di esclusione Postgres**: valutato e rifiutato con tre ragioni misurate (AD-2). Se un giorno il DB dovesse diventare l'arbitro, il posto dove ridiscuterlo è il doc-comment di `schema.prisma:1104-1109`, che questa story aggiorna proprio per lasciare la traccia della rivalutazione.
- **Un indice nuovo su `Booking`**: misurato inutile (0,17 ms, `Booking_personId_idx`).
- **La mascheratura dei `details`** e ops **F6** (`personId` in chiaro nelle liste): dominio della **16.7**. Qui si evita solo di **peggiorarla** (AD-3).
- **Il filtro `isActive` sulle scansioni dei documenti** (R-16-c): **16.4**.
- **Il ciclo di fix di AOG-1b** e l'archiviazione velivolo (R-16-e): **16.8**.
- **Ogni modifica di layout, CSS, componente o testid**: AD-7 è branching + stringhe. La story è su Opus per la regola, non perché ci sia design da fare.

---

## §7 — Riferimenti

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` — **contratto**: «Story 16.3» (AC di record), «Ratifiche PO» (**R-16-a**, **R-16-b**), «Architettura e vincoli», «Regole di processo».
- `_bmad-output/planning-artifacts/audit-2026-09-10/ops-audit.md` — **§F2** (i due scenari, la prova in DB, il rimedio, la nota sul secondo lock), **§F4** (le quattro sonde 7/7b/8/9), **§F9** (la sonda 10), **§[I-1]**/**§[I-2]** (il censimento dei predicati), **«Macchine a stati»** (la matrice e le quattro voci assenti), **§5.1** (PROBE 5/6, la prova che il lock funziona), **§6 domande 2 e 3** (chiuse da R-16-a/R-16-b).
- `_bmad-output/implementation-artifacts/16-1-un-solo-calendario.md` — formato di casa, disciplina «asserzione al valore corretto, mai indebolita», idioma del probe fuori repo.
- `_bmad-output/implementation-artifacts/aog-1b-avviso-prenotazioni-email.md` — formato, e la disciplina «una funzione di dominio, due call-site, mai due implementazioni» che AD-1 riusa.
- `CLAUDE.md` — gates, `scripts/e2e.sh`, validazione eager dell'env nei unit, catena serializzata e2e, testid mobile, lezione `Escape`/`SlideOver`, TD-6.
- `docs/handoffs/HANDOFF.md` — ciclo per story su questa macchina, reset DB, `JOBS_SECRET`, flake note, `Co-Authored-By` = il modello che ha fatto il lavoro.
- `.claude/skills/karpathy-guidelines/SKILL.md` — assunzioni esplicitate (§0/§1), semplicità (AD-1: tre `findFirst`, non un motore di conflitti), chirurgia (AD-4: tre `throw` che diventano tre chiamate), criteri verificabili (§2).
- Probe della ricognizione (**fuori dal repo**, rieseguibile): `/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/story-16-3/person-busy.probe.test.ts` + `vitest.probe.config.mjs`.
- Query di misura usate in questo file (read-only, `docker exec airmanager-postgres-1 psql -U <utente> -d airmanager_load`):
  ```sql
  -- coppie APPROVED sovrapposte per persona (18) e per istruttore (11)
  SELECT count(*) FROM "Booking" a JOIN "Booking" b
    ON a."personId"=b."personId" AND a.id<b.id
   AND a."startsAt" < b."endsAt" AND a."endsAt" > b."startsAt"
   WHERE a.status='APPROVED' AND b.status='APPROVED';
  -- (idem con a."instructorProfileId"=b."instructorProfileId" AND … IS NOT NULL)
  ```

### Da registrare in `sprint-status.yaml` (azione della sessione principale, non del dev)

| TD | Contenuto |
|---|---|
| **TD 16.3-a** | **Residuo dichiarato**: la stessa persona come `personId` di una prenotazione e come **istruttore** di un'altra, sovrapposte, **non** è intercettata (i due predicati sono chiavati su colonne diverse). Serve una decisione PO su un terzo predicato «per essere umano» e su quale codice/nome mostrare. |
| **TD 16.3-b** | **Invariante non documentata della suite e2e**: le bande APPROVED del pilota del seed su `FUTURE_DAY` devono restare disgiunte fra tutti gli spec. La story aggiunge un commento; la difesa strutturale (persone run-unique **ovunque**, anche negli spec vecchi) è un lavoro a sé. |
| **TD 16.3-c** | `prisma/seed-load.ts` garantisce la non-sovrapposizione **solo per velivolo** e solo sul sottoinsieme futuro/APPROVED: **18 coppie persona + 11 istruttore** misurate su `airmanager_load`. Estendere la mappa di retry ai due soggetti (≈8 righe) + re-seed 192 s → casa naturale l'epic 17. |
| **TD 16.3-d** | Le ri-verifiche di identità in approvazione (archiviato/profilo) restano **check-then-act**, come già il blocco scadenze e la finestra oraria: un terzo lock le chiuderebbe, R-16-a non lo chiede. |

---

## Dev Agent Record

Dev: subagent `dev-16-3` (Opus 5.5), 2026-09-27. Branch `dev`, HEAD di partenza `325b7e5`; implementazione in **`4a1ae4d`**. Skill seguite: `bmad-dev-story`, `karpathy-guidelines`, `design-taste-frontend` + `ui-ux-pro-max` (sul solo testo dei messaggi: niente layout, niente CSS).

### §A — Verifica della ricognizione sul HEAD corrente

`git log --oneline 738d399..325b7e5`: 16.1 (fix), 16.2 (`3138115`, `1a9552b`), AOG-1b (`a1b2362`…`09dd893`), `2ee2a1c` (lookup e2e di pagina 1), 17.1 (`a6e2a39`…`141c444`) + commit `docs`. `git diff --stat 738d399..325b7e5` sui file del perimetro: **`bookings.service.ts`, `bookings.service.test.ts`, `booking-transition.ts`, `new-booking-form.tsx`, `edit-booking-form.tsx`, `booking-labels.ts`, `errors.ts` byte-identici** → tutte le righe di §3.1/§3.5 valgono invariate (`:548`, `:566-571`, `:909-915`, `:936-947`, `:1076`, `:1117-1118`, `:1127-1174` riverificate una per una). Derive trovate e **corrette in place** nel corpo della story (marcate «HEAD `325b7e5`»):

| Citazione della story | Su HEAD `325b7e5` | Nota |
|---|---|---|
| `handler.ts:60` scarta i `details` di `ConflictError` | **già corretto dalla 16.2** (`handler.ts:65`), con due unit `handler.test.ts:270-313` | riusato, **non rifatto**: nessuna riga toccata in `handler.ts`/`handler.test.ts` |
| «0 `new ConflictError(` con `details`» | 1 (`FLIGHT_OVERLAP`, 16.2) | irrilevante per la story |
| `flights.service.ts:1123` (idioma lock `Account`) | `:1305` | |
| censimento `FOR UPDATE` §3.3: `aircraft.service.ts:638`, `flights.service.ts:1104/:1312/:1444`, `:1123/:1322/:1460`, `membership.service.ts:101` | `:646`, `:1275/:1500/:1639`, `:1305/:1510/:1679`, `:103` | stesse tabelle, stesso ordine locale; AOG-1b aggiunge `setOutOfService` (`aircraft.service.ts:448`, `updateMany` su `Aircraft`, nessun `Person`) |
| `it.json:1645` / `:1712-1720` | `:1652` / `:1719-1727` | +7 righe di AOG-1b/16.2 |
| `registry.ts:1484/:1521/:1555` (descrizioni), `:1494/:1528/:1562` | `:1485/:1522/:1556`, `:1495/:1529/:1563` | |
| `bookings.service.test.ts:238` (default `personFindUnique`) | `:240` | già sfasata sulla baseline |
| `e2e/bookings.spec.ts:429`, `:517-529`, `:1033-1054`, `:1595-1620`, `:1611`, `:1691`, `:1706` | `:454`, `:529-564`, `:1061-1082`, `:1638-1663`, `:1654`, `:1734`, `:1749` | `2ee2a1c` (+~45 righe) |
| probe di ricognizione in `/tmp/…/74e5575d…/story-16-3/` | **non esiste più** | i 12 casi sono stati riscritti dai titoli verbatim di AC 12 dentro `bookings.service.test.ts` (id A0…C3 nei titoli) |
| `prisma.ts` (17.1: `transactionOptions {maxWait 2000, timeout 5000}`, pool esplicito) | nessun impatto | la story aggiunge 1-2 `SELECT … FOR UPDATE` + 1-2 `findFirst` indicizzati per scrittura, ben dentro i 5 s |

**Censimento dei lock allargato ai lock IMPLICITI** (non chiesto da AD-2, trovato in ricognizione e segnalato al lead): ogni `INSERT` in una tabella con FK verso `Person`/`InstructorProfile` prende `FOR KEY SHARE` sulla riga padre, che **confligge** con `FOR UPDATE`. Tabelle con FK verso i due target (misurato su `pg_constraint`): `User`, `PilotProfile`, `StudentProfile`, `InstructorProfile`, `Account`, `HourPackage`, `Flight`, `Expiry`, `Booking` → `Person`; `InstructorRate`, `Flight`, `Booking`, `StudentInstructorAssignment`, `TrainingNote`, `InstructorPayout` → `InstructorProfile`. L'unico scrittore multi-statement che tocca **entrambi** è `Flight` (in `registerFlight`/`correctFlight`, dopo i propri lock `Aircraft → Account`): l'ordine dei suoi trigger RI misurato sul DB e2e è `Aircraft (c_48841) → Person (c_48846) → InstructorProfile (c_48851)`, **lo stesso** dei lock nuovi → nessun ciclo possibile su HEAD. `InstructorPayout` (unica altra transazione, `instructor-compensation.service.ts:484`) tocca solo `InstructorProfile` + `CashMovement`. Alternativa più forte **non** applicata (contraddirebbe il letterale «FOR UPDATE» di AC 5): `FOR NO KEY UPDATE` serializza gli scrittori di prenotazioni identicamente e non blocca mai i controlli FK → nota per la review (§H).

`grep -rn 'data-testid\^=' e2e/`: la story **non aggiunge testid** (AD-7), la convenzione `-mobile`/`mobile-` non è in gioco.

### §B — Riepilogo per AC con le prove

**AC 1 — una funzione, tre predicati, una precedenza, tre call-site.** `findBookingConflict` (`bookings.service.ts:359-394`) + `bookingConflictError` (`:407-415`) + `lockBookingPeople` (`:324-329`). `grep -c findBookingConflict` → **9** righe = 1 definizione (`:359`) + **3 call-site** (`:716` create, `:1090` update, `:1345` transition) + 5 menzioni nei doc-comment. `grep -n "status: 'APPROVED', startsAt: { lt"` → solo `:869` (`listCalendarBookings`, filtro di lettura); l'unico predicato-guardia è `:364` (`const overlapping = { status: 'APPROVED' as const, startsAt: { lt… }, endsAt: { gt… } }`, dentro la funzione). Precedenza: unit `%s: precedence AIRCRAFT -> PERSON -> INSTRUCTOR …` ×3 percorsi (tre conflitti insieme → `CONFLICT`, messaggio velivolo, **nessun** `details`, `findFirst` chiamata **1** volta) + `%s: with the person AND the instructor busy, the person wins` ×3.

**AC 2 — `PERSON_BUSY` su creazione, spostamento, approvazione.** Unit A1/A3/A4 (`$probe $path: … 409 PERSON_BUSY naming the conflicting booking`): codice, messaggio, `details` `{ bookingId, startsAt, endsAt }` (ISO a mano, idioma 16.2), niente scritto. PENDING che non blocca e bordi semi-aperti: unit `%s: the person and instructor predicates are EXACTLY the aircraft one re-keyed` (uguaglianza **esatta** su `where`/`orderBy`/`select` → `status: 'APPROVED'`, `lt`/`gt` stretti; un `lte`/`gte` o la perdita di `status` lo fanno rosso). e2e reale: `PERSON_BUSY: … blocks a create and a move on ANY aircraft … touching intervals do not overlap …` (409 su velivolo libero con `details` esatti, 201 sul bordo 10:00, 409 sullo spostamento).

**AC 3 — `INSTRUCTOR_BUSY` sui tre percorsi.** Unit A2/A2m/A2a; senza istruttore `findFirst` = **2** e nessun lock `InstructorProfile` (`%s: a booking WITHOUT an instructor never runs the third predicate`, ×3). e2e reale **nuovo** (la copertura che non esisteva, §3.4 (C)): `INSTRUCTOR_BUSY: … blocks an APPROVAL, a create and a move on ANY aircraft …` — l'approvazione prova sul vero DB che il lock di `Booking` legge `instructorProfileId` (§5 ultima trappola).

**AC 4 — il 409 del velivolo è invariato e vince la precedenza.** `bookings.service.test.ts:566-580`, `:1238-1249`, `:1607-1617` **verdi senza una modifica** (i tre file di test li contengono identici). e2e: `bookings.spec.ts:454` (ora sotto un pilota run-unique, §G) continua a leggere «già prenotato» su un caso aereo+persona; il nuovo e2e PERSON_BUSY asserisce l'envelope **esatto** `{ code: 'CONFLICT', message: 'This aircraft is already booked for an overlapping interval.' }` (nessuna chiave `details`); il nuovo e2e UI mostra «Il velivolo è già prenotato» con aereo+persona occupati.

**AC 5 — la corsa è chiusa (misurato).** (1) unit `%s: Person then InstructorProfile are locked FOR UPDATE, right AFTER the Aircraft lock and BEFORE the first overlap predicate` ×3: tabelle bloccate in ordine esatto `['Aircraft','Person','InstructorProfile']` (transition: `['Booking','Aircraft','Person','InstructorProfile']`), tutte `FOR UPDATE`, valori legati `personId`/`instructorProfileId`, `invocationCallOrder` dell'ultimo lock < primo `findFirst`. (2) e2e `two PARALLEL approvals …` (pilota con login run-unique, due PENDING sullo stesso intervallo su due velivoli run-unique, `Promise.all` di due approvazioni): **`[200, 409]`, il 409 è `PERSON_BUSY` e nomina l'altra**. Misura della discriminanza sul vivo: con la build **senza** il lock `Person` (e il predicato presente) 27 tentativi → **24 `[200, 200]`** (7 failed + 2 flaky su 10 ripetizioni con retry); con la build reale **10/10 passed** (log in §L).

**AC 6 — l'approvazione ri-verifica chi approva, con gli stessi codici di `createBooking`.** Unit B1/B2/B3 eseguono **sia** `createBooking` (staff) **sia** l'approvazione sulla stessa fixture e asseriscono che `[classe, code, message]` sono **uguali** fra i due percorsi e pari a `[ConflictError,'CONFLICT','Cannot book an aircraft for an archived person.']`, `[ValidationError,'PERSON_NOT_BOOKABLE','Person must have an active pilot, student or instructor profile to be booked.']`, `[ConflictError,'CONFLICT','This instructor profile is deactivated.']`. `grep -c` di ciascun messaggio nel file → **1** (un solo `throw` per verdetto, negli helper `assertPersonNotArchived`/`assertPersonHasActiveFlyingProfile`/`assertActiveInstructorProfile`). Precedenza: `precedence: an archived person WITH a blocking expired document answers the 409 archived …` (e `expiry.findMany` **mai** chiamata). Velivolo archiviato: già coperto (`:1600-1605`), invariato.

**AC 7 — approvare nel passato resta permesso, e il commento lo dice.** Unit B4 (pin verde prima e dopo). Doc-comment corretti: modulo (`:43-91`, risoluzione fuori/lock dentro e «Concurrency» sui tre soggetti con l'ordine globale e la rivalutazione `btree_gist`), `transitionBooking` (`:1238-1261`, nomina **R-16-b** e «staff regularize bookings after the fact»), inline nella finestra (`:1321-1324`, «minus the one ratified exception (R-16-b)»), `schema.prisma` (Booking + indice). e2e: `api-v1.spec.ts` «crea futura → sposta nel passato (staff) → approva **200** → FLOWN **200**».

**AC 8 — `FLOWN`/`NO_SHOW` futuro → 422 `BOOKING_NOT_STARTED`.** Guardia a `bookings.service.ts:1294-1299`, dopo `isLegalBookingTransition` e prima del ramo APPROVED, su `existing.startsAt` letto sotto il lock. Unit C1/C2 (2099: il «2027» dell'audit fissato su una data che non invecchia), C3 ×2 (slot **iniziato** → 200 su entrambi), riapri da FLOWN/NO_SHOW/DENIED su futura → 200, coppia illegale su futura → `BOOKING_TRANSITION_INVALID` (la matrice viene prima). e2e `Effettuato/Assente on a booking that has NOT STARTED answer 422 …` (poi, spostata a ieri, FLOWN → 200). Verifica UI: il toast del desktop mostra il messaggio nuovo e la riga resta «Approvato» (§K).

**AC 9 — `details` sul filo e OpenAPI.** `handler.ts` già inoltra i `details` di `ConflictError` dalla 16.2 (unit esistenti `handler.test.ts:270-313`, rosso al pre-fix: §D G13). `git show --stat 4a1ae4d -- src/lib/schemas/registry.ts` → `1 file changed, 3 insertions(+), 3 deletions(-)`: POST (PERSON_BUSY/INSTRUCTOR_BUSY con la forma dei `details`, precedenza, lock), PATCH (idem sul nuovo intervallo), transition (ri-verifiche F4 nell'ordine di create, PERSON_BUSY/INSTRUCTOR_BUSY, **R-16-b** esplicita, `BOOKING_NOT_STARTED` 422, riapri sempre). `npm run gates` (build incluso) verde.

**AC 10 — UI: tre rami consapevoli del codice, sei stringhe, zero stile.** `new-booking-form.tsx`, `edit-booking-form.tsx`: il corpo si legge **prima** del ramo 409; `PERSON_BUSY`/`INSTRUCTOR_BUSY` → la stringa relativa, ogni altro 409 → `overlap`/`conflict` invariati. `booking-transition.ts`: sui due codici `{ ok:false, conflict:true, stale:false }`, ogni altro 409 identico a prima; `case 'BOOKING_NOT_STARTED'`. Parità locale, comando verbatim:
```
$ python3 -c "
import json
def k(o,p=''):
    if isinstance(o,dict):
        for a,b in o.items(): yield from k(b,p+'.'+a)
    else: yield p
a=set(k(json.load(open('messages/it.json')))); b=set(k(json.load(open('messages/en.json'))))
print('it-only:',len(a-b),'en-only:',len(b-a))"
it-only: 0 en-only: 0
```
`git diff --stat 325b7e5..4a1ae4d -- src/app` → i tre file di AD-7 + `booking-labels.ts` + **`booking-transition.test.ts` (nuovo, §G)**; **nessun `.css`**. Screenshot §K.

**AC 11 — fixture riparate una per una.** §E. Nessuna asserzione cancellata o allentata.

**AC 12 — discriminanze rosse sul pre-fix, verdi dopo.** Pre-fix intero (i test nuovi contro il service di HEAD `325b7e5`, prima di scrivere il codice): `Tests 26 failed | 252 passed (278)` — rossi **A1, A2, A3, A4, B1, B2, B3, C1, C2** (i 9 del probe) + le loro varianti per percorso (A2m, A2a, precedenza persona>istruttore ×3, `where` esatti ×3, conteggio `findFirst` ×3, ordine dei lock ×3, SELECT del lock con `instructorProfileId`, select della persona ricaricata, precedenza archiviato>scadenze); **verdi** i pin **A0**, **B4**, **C3** ×2, riapri ×3, coppia illegale, precedenza velivolo ×3, DENY senza ri-verifiche. Dopo il fix: `278 passed`. Una guardia alla volta: §D.

**AC 13 — gate e suite.** §L.

### §C — Censimento `[I-2]` rifatto (predicati di sovrapposizione in `bookings.service.ts`)

`grep -n "startsAt: { lt\|endsAt: { gt\|startsAt: { lte"`:

| riga | dove | natura |
|---|---|---|
| `:364` | `findBookingConflict` — **l'unico** predicato-guardia, condiviso dai tre soggetti (3 `findFirst`: velivolo, persona, istruttore) chiamati dai 3 call-site | **guardia** (prima: 3 copie inline a `:566`, `:936`, `:1161`) |
| `:789-790` | `listBookings`, filtri `from`/`to` | filtro di lettura |
| `:869` | `listCalendarBookings` | filtro di lettura |
| `:1511` | `listReservedAircraftIds` (`lte`/`gt` su `now`) | filtro di lettura |

I filtri di lettura **non sono toccati** (AD-8).

### §D — Tabella guardia → discriminanza (pre-fix simulato UNA guardia alla volta, repo ripristinato byte-identico)

Harness fuori repo (`scratchpad/discriminance.py`): per ogni riga applica una sola mutazione, esegue `env -u DATABASE_URL -u AUTH_SECRET npx vitest run --reporter=json <file>`, ripristina e **asserisce** lo sha256 identico. sha256 dei file sotto mutazione (= contenuto di `4a1ae4d`): `bookings.service.ts` `4fbe51e74827f101ed591ba14b63dee95887952b03a33f799da3067c1a5a7bf8`, `handler.ts` `f6ec6ba2ed54351ce391a546e61d8fee27c2e38cc2f45a9d3b85f90af421b7ed`, `booking-transition.ts` `9cba07bed02c53cf49ec12dee7e4567239029506fd67ee5b0b53bf18d5bfcfee` — tutti «restored identical».

| # | pre-fix simulato | esito | test rossi |
|---|---|---|---|
| G1 | predicato **persona** rimosso | **RED 12/278** | A1, A3, A4; persona>istruttore ×3; `where` esatti ×3; conteggio `findFirst` ×3 |
| G2 | predicato **istruttore** rimosso | **RED 6/278** | A2, A2m, A2a; `where` esatti ×3 |
| G3 | lock `Person` rimosso | **RED 4/278** | ordine dei lock ×3; `updateBooking … locks BOTH …` (`$queryRaw` ×2 + `calls[1]` = Person) |
| G4 | lock `InstructorProfile` rimosso | **RED 3/278** | ordine dei lock ×3 |
| G5 | lock `Booking` senza `instructorProfileId` | **RED 1/278** | «the Booking row lock reads the booking's instructorProfileId» |
| G6 | approvazione senza ri-verifica **archiviato** | **RED 2/278** | B1; precedenza archiviato>scadenze |
| G7 | approvazione senza gate **profilo di volo** | **RED 1/278** | B2 |
| G8 | approvazione senza ri-verifica **istruttore** | **RED 1/278** | B3 |
| G9 | ri-verifiche persona spostate DOPO le scadenze | **RED 1/278** | precedenza archiviato>scadenze |
| G10 | guardia temporale rimossa | **RED 2/278** | C1, C2 |
| G11 | guardia su `endsAt` invece di `startsAt` | **RED 2/278** | C3 ×2 |
| G12 | precedenza invertita (persona prima del velivolo) | **RED 9/278** | precedenza velivolo ×3; `where` esatti ×3; `:553`, `:1250`, `:1607` (tre test pre-esistenti del 409 velivolo) |
| G13 | `handler.ts` senza `ConflictError` nei `details` (la riga pre-16.2) | **RED 1/42** | `handler.test.ts` «ConflictError … WITH its `details` (story 16.2)» |
| G14 | UI: `PERSON_BUSY`/`INSTRUCTOR_BUSY` nel 409 generico `stale:true` | **RED 2/4** | `booking-transition.test.ts` ×2 |
| G15 | UI: nessun `case 'BOOKING_NOT_STARTED'` | **RED 1/4** | `booking-transition.test.ts` «422 BOOKING_NOT_STARTED …» |
| E1 | **e2e**, build senza lock `Person` | **24/27 tentativi `[200, 200]`** | `two PARALLEL approvals …` (§B AC 5) — sorgente ripristinato a sha `4fbe51e7…` prima della build di verifica, poi build reale 10/10 |

### §E — Fixture e2e riparate (nessuna asserzione indebolita)

**(A) I 6 call-site / 13 chiamate `FLOWN`/`NO_SHOW` su prenotazioni future.** Riga prima (HEAD `325b7e5`) → dopo (`4a1ae4d`):

| # | prima | dopo | riparazione | asserzioni rimaste identiche |
|---|---|---|---|---|
| 1 | `api-v1.spec.ts:166` | `:178` (+ helper `longPastInterval` `:142`) | PATCH admin a **tre giorni fa 07:30Z-08:30Z** (fuori dalla finestra 48 h, §G #9) fra la login admin e l'approvazione: crea → sposta → approva **200** → FLOWN **200** (prova e2e di R-16-b) | `approved.status === 'APPROVED'`, `decidedAt` non nullo, FLOWN 200 + `status === 'FLOWN'`; solo il titolo del test descrive il passo nuovo |
| 2-3 | `bookings.spec.ts:1734`, `:1749` (test `:1718`) | `:1788`, `:1805` (+ `yesterdaySlot` `:326`, `moveIntoThePast` `:1715`) | `setupPendingBookingAsStaff` restituisce **anche** `bookingId` (additivo, gli altri 3 chiamanti invariati); solo in questo test, PATCH a ieri **prima** dell'approva e riga ri-localizzata con `findBookingRow` (il rango cambia); **dopo** le asserzioni, pulizia (riapri + ritorno allo slot `FUTURE_DAY`) perché nessuna prenotazione chiusa resti nella finestra della Panoramica (§G #9) | tutte: toast «approvata», «Approvato», toast «effettuata»/«assente», «Effettuato»/«Assente», conteggi azioni, «Riapri» |
| 4 | `mobile-overview.spec.ts:161-163` (helper `createPendingBooking`, 4 test) | `:159-174` | variante **conservativa**: sposta allo stesso slot di ieri (−2 giorni dal «domani»), NO_SHOW → PENDING, **rimette lo slot originale** | nessuna: la fixture letta dai 4 test è identica a prima |
| 5 | `mobile-overview-overflow.spec.ts:101-104` (loop ×9) | `:95-116` | idem nel loop, con ritorno allo slot originale (l'ordine/numero delle righe della card non cambia) | `toHaveCount(8)`, footer `+N`, deep-link, righe tutte «In attesa»; nessun `setTimeout` servito (run 2.0 s) |
| 6 | `mobile-planning.spec.ts:438` | `:437-453` | ieri 08:00Z-09:00Z → FLOWN → PENDING → **PATCH di ritorno** a domani 08:00Z-09:00Z | geometria del sheet (`:462-470` ora più in basso), tutte le asserzioni della card/sheet |

Vincoli rispettati: ieri 07:30Z/08:00Z < 48 h (visibile in lista) solo dove il test deve **vedere** la riga, tre giorni fa (fuori dalla finestra) per i fixture solo-API; tutti dentro 07:00-21:00 Roma nei due offset DST; **nessuna prenotazione chiusa lasciata nella finestra 48 h** (§G #9).

**(B) Il rischio `PERSON_BUSY` fra spec: il censimento della story era incompleto (§G #1).** Guardava solo «una PENDING non blocca»; la direzione opposta — **una CREAZIONE del pilota del seed è bloccata da una sua APPROVED sovrapposta** — rompeva tre test esistenti: `:408` (09:00-10:00 locale), `:1160` (02:00-03:00 locale), `:1808` (06:00-07:00Z) lasciano ciascuno una APPROVED del pilota del seed su `FUTURE_DAY` → **al secondo run sullo stesso DB ognuno collide col proprio residuo** (deterministico); e nello **stesso** run `:1086` crea 02:00-03:00 locale mentre `:1160` tiene 02:00-03:00 locale APPROVED → flake da ordinamento sotto `fullyParallel`. Riparazione: i tre test passano a un **pilota run-unique con login** (`createPilotWithLogin`, già in casa), stessi flussi UI, **ogni asserzione identica** (`:454` «già prenotato», `:1217` «già prenotato», masking: `me` è ora il pilota run-unique). Il commento a `FUTURE_DAY` (`bookings.spec.ts:285-298`) dichiara l'invariante: nessun test lascia il pilota del seed APPROVED. Censimento finale del pilota del seed: `:1086` (PENDING→CANCELLED, poi PENDING), `:1220` (PENDING→CANCELLED), `:1264`/`:1520` (403 prima di ogni query), `:1758` (PENDING), `:1920` (nessuna prenotazione propria), `api-v1` (FLOWN/DENIED nel test), `aircraft-out-of-service-until` (PENDING o 422 `AIRCRAFT_OUT_OF_SERVICE`, che precede il predicato) → **nessuna APPROVED residua**.

**(C) Test nuovi** (`bookings.spec.ts:2025-2239`, describe «One person in one place», tutti soggetti run-unique, giorno proprio `2031-03-17` — §G #10): PERSON_BUSY (create/move/bordo/precedenza), corsa parallela, INSTRUCTOR_BUSY (approvazione/create/move/bordo; la PENDING con istruttore si ottiene con sole chiamate staff via «riapri» su uno slot di tre giorni fa, l'`instructorProfileId` si legge dalla risposta di `POST …/instructor-rates`), BOOKING_NOT_STARTED, messaggio persona vs velivolo nel form.

### §F — Conteggi `findFirst` / `$queryRaw` per scrittura, prima e dopo

| percorso | prima | dopo, senza istruttore | dopo, con istruttore |
|---|---|---|---|
| `createBooking` | 1 `$queryRaw` (Aircraft) · 1 `findFirst` | 2 (Aircraft, Person) · 2 | 3 (+InstructorProfile) · 3 |
| `updateBooking` | 1 (Aircraft IN) · 1 | 2 · 2 | 3 · 3 |
| `transitionBooking` → APPROVED | 2 (Booking, Aircraft) · 1 | 3 · 2 (+1 `person.findUniqueOrThrow`) | 4 · 3 (+1 `instructorProfile.findUnique`) |
| FLOWN / NO_SHOW / DENIED / riapri | 1 (Booking) · 0 | invariato | invariato |
| conflitto velivolo trovato | — | 1 `findFirst` (gli altri due non partono) | idem |

### §G — Deviazioni motivate

1. **Tre test esistenti spostati su piloti run-unique** (`bookings.spec.ts:408/:1160/:1808` di HEAD) contro «la story non riscrive la suite» — il censimento §3.4 (B) era incompleto (§E (B)). Segnalato al lead prima di procedere; è solo test, stesse asserzioni.
2. **`orderBy: { startsAt: 'asc' }`** sui predicati persona/istruttore: i `details` nominano la prenotazione in conflitto **più vicina** (stessa regola di `FLIGHT_OVERLAP`, 16.2) invece di una arbitraria; il predicato velivolo resta byte-identico (select `{ id }`, niente `orderBy`).
3. **`details.startsAt/endsAt` come stringhe ISO scritte a mano** (disciplina 16.2) invece di `Date` lasciate a `NextResponse.json`: identico sul filo.
4. **`person.findUniqueOrThrow` nell'approvazione** invece di `findUnique`: la FK garantisce la riga; il default dei test diventa un mock **separato** (`personFindUniqueOrThrow` = `ACTIVE_PILOT_PERSON`) invece di riscrivere il default `personFindUnique` dell'email di DENY (§3.5 riga `:238`), che resta intatto.
5. **Fixture unit pre-esistenti aggiornate oltre la tabella §3.5**: anche `APPROVED -> FLOWN/NO_SHOW stamps closedAt/closedByUserId` (`:1524`, `:1535` di HEAD) giravano sulla fixture 2099 → portate su `STARTED_SLOT` (costante nuova accanto a `mockBookingLock`, = `PAST_STARTS_AT/ENDS_AT`), come `:1618`, la matrice (solo i due target di chiusura) e l'`it.each` delle email. `:1221` → `toHaveBeenCalledTimes(2)` + `calls[1]` = lock Person (esatto). Nessun `objectContaining` al posto di un'uguaglianza.
6. **`handler.ts`/`handler.test.ts` non toccati**: il lavoro di AD-3/AC 9 era già stato fatto dalla 16.2 (§A).
7. **Unit nuovo `booking-transition.test.ts`** (4 test, `fetch` stubbato): pinna `stale:false` sui due codici nuovi e il `case` del 422 — la story contava solo sull'e2e per `stale`; per questo `git diff --stat -- src/app` mostra un file in più rispetto ad AC 10 (un `.test.ts`, nessun `.css`).
8. Instructor e2e via «riapri» (FLOWN su uno slot spostato a tre giorni fa e ritorno) invece di un login istruttore: nessun flusso Mailpit in più, e l'approvazione con istruttore è provata sul vero DB.
9. **Slot passati: «ieri» SOLO dove il test deve vedere la riga, «tre giorni fa» per i fixture solo-API** (la story prescriveva «ieri 07:30Z» ovunque). Misurato sulla prima suite completa: le 4 prenotazioni chiuse lasciate a «ieri» (api-v1, Effettuato/Assente ×2, BOOKING_NOT_STARTED) finivano in testa alla card «Prenotazioni» della Panoramica (8 righe da `now - 48h`, `startsAt` crescente) e spingevano fuori pagina la prenotazione di domani di `home-dashboard.spec.ts:228` → **rosso deterministico** (3/3 tentativi). Correzione nel commit d'implementazione (amend, `4d3277c` → `bc8480d`, solo e2e): fixture solo-API a tre giorni fa (fuori da ogni finestra), e il test UI Effettuato/Assente riporta le sue due prenotazioni sul loro slot `FUTURE_DAY` dopo le asserzioni.
10. **Il describe nuovo vive su un giorno suo, `2031-03-17`** (una settimana DOPO `FUTURE_DAY`), non su `FUTURE_DAY`. Misurato sulla seconda suite completa: flaky `bookings.spec.ts:1127` (il test `:1086`, non toccato: dopo il `router.refresh()` dell'annullamento la riga trovata non è più sulla stessa pagina — classe «rank shift», il test non ri-localizza); le ~12 righe dei test nuovi sulle 09:00-11:00 di `FUTURE_DAY` stavano PRIMA della sua riga e ne alzavano la probabilità. Righe su un giorno successivo non spostano mai il rango di quelle di `FUTURE_DAY`. Non `runUniqueFutureDay()`: i suoi giorni 2040+ superano il `sched.maxAdvanceDays` (3650) che gli spec dei settings lasciano sul DB usato → 422 misurato. Amend `bc8480d` → `4a1ae4d` (solo e2e; sha del service invariato).

### §H — TD e note per la review

- **TD 16.3-a…d**: confermati come scritti nella story (§7). **TD 16.3-b** si restringe: l'invariante è ora rispettata dall'intera suite (§E (B)); resta come regola per gli spec futuri, scritta a `FUTURE_DAY`.
- **Nota (non TD)**: `FOR NO KEY UPDATE` al posto di `FOR UPDATE` sui due lock nuovi eliminerebbe per costruzione la classe di deadlock «lock esplicito vs `FOR KEY SHARE` dei trigger FK» (§A); su HEAD non esiste ciclo perché l'unico scrittore multi-FK (`Flight`) controlla `Person` prima di `InstructorProfile`, ma l'ordine dei trigger RI dipende dagli OID (nome `RI_ConstraintTrigger_c_<oid>`, ordinato come stringa). Segnalato al lead; nessuna risposta al momento della chiusura.
- Il desktop mostra ancora «Effettuato»/«Assente» su una APPROVED futura: il click risponde ora col messaggio chiaro (§K), ma nascondere le azioni sarebbe un cambio di UI fuori da AD-7.

### §I — File toccati (`4a1ae4d`)

Produzione: `src/server/services/bookings.service.ts`, `src/lib/schemas/registry.ts`, `prisma/schema.prisma` (solo doc-comment: `npx prisma migrate diff --from-schema <HEAD> --to-schema prisma/schema.prisma` → «No difference detected.»), `src/app/[locale]/dashboard/bookings/{booking-transition.ts,new-booking-form.tsx,edit-booking-form.tsx,booking-labels.ts}`, `messages/{it,en}.json`. Test: `src/server/services/bookings.service.test.ts`, `src/app/[locale]/dashboard/bookings/booking-transition.test.ts` (nuovo), `e2e/{bookings,api-v1,mobile-overview,mobile-overview-overflow,mobile-planning}.spec.ts`. Più questo story file (commit `docs(16.3)`).

### §J — Cosa NON ho fatto

Nessuna migrazione, nessun indice, nessun campo; nessun `AIRCRAFT_BUSY`; nessun `force`; nessuna guardia temporale sull'approvazione; nessun tocco a `listBookings`/`listCalendarBookings`/`cancelBooking`/`listReservedAircraftIds`, a `seed*.ts`, `playwright.config.ts`, `.env.example`, `ci.yml`, `scripts/`, ai file della 16.1; nessun CSS/testid/componente. Non chiuso il caso «stessa persona in due ruoli» (TD 16.3-a). Non toccati `sprint-status.yaml`, `HANDOFF.md`, `CLAUDE.md` (azione della sessione principale).

### §K — Verifica UI (screenshot)

Playwright MCP non utilizzabile in questo ambiente (`Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome`): usato il fallback sanzionato, script `@playwright/test` usa-e-getta fuori repo contro la build di produzione su :3000. Esito (testo letto dal DOM; lo stile maiuscolo è quello esistente di `booking-form-error`):

| caso | locale / larghezza | messaggio mostrato | file |
|---|---|---|---|
| aereo **e** persona occupati | it / 1280 | «Il velivolo è già prenotato per un intervallo che si sovrappone a questo.» | `scratchpad/16-3-it-1280-aircraft-busy.png` |
| solo persona occupata | it / 1280 | «Questa persona ha già una prenotazione approvata che si sovrappone a questo intervallo.» | `scratchpad/16-3-it-1280-person-busy.png` |
| aereo e persona | en / 375 | «The aircraft is already booked for an overlapping interval.» | `scratchpad/16-3-en-375-aircraft-busy.png` |
| solo persona | en / 375 | «This person already has an approved booking overlapping this interval.» | `scratchpad/16-3-en-375-person-busy.png` |
| «Effettuato» su APPROVED di domani | it / 1280 | toast «La prenotazione non è ancora iniziata: può essere segnata come effettuata o assente solo dopo l'orario di inizio.», riga ancora «Approvato» | `scratchpad/16-3-it-1280-flown-not-started.png` |

(`scratchpad` = `/tmp/claude-1000/-home-admin-AirManager/87e8c4a0-e70c-4ef9-934e-3d9b5a5f0be7/scratchpad/`, fuori repo.)

### §L — Gate ed esiti verbatim

`npm run gates` (su `4a1ae4d`, prima del commit):
```
PASS  lint (19s)
PASS  typecheck (3s)
PASS  test (6s) — Tests  1922 passed (1922)
PASS  build (29s)
```
(baseline 1880 → **1922**: +38 in `bookings.service.test.ts`, +4 in `booking-transition.test.ts`.) Verifica env-eager per file: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/server/services/bookings.service.test.ts` → `278 passed`; `… booking-transition.test.ts src/lib/api/handler.test.ts` → `46 passed`; suite intera senza env → `Test Files 75 passed (75) · Tests 1922 passed (1922)`.

e2e mirati (build di produzione una volta, `E2E_REUSE_SERVER=1`, DB appena resettato dal lead):
```
scripts/e2e.sh start e2e/bookings.spec.ts e2e/api-v1.spec.ts e2e/mobile-overview.spec.ts e2e/mobile-planning.spec.ts --project chromium
  70 passed (1.5m)            E2E_EXIT=0
scripts/e2e.sh start e2e/mobile-overview-overflow.spec.ts --project mobile-overview-overflow --no-deps
  1 passed (3.4s)             E2E_EXIT=0
race, build SENZA lock Person: -g "two PARALLEL approvals" --repeat-each=10
  7 failed · 2 flaky · 1 passed (1.0m)   E2E_EXIT=1   (24 tentativi su 27: [200, 200])
race, build reale: -g "two PARALLEL approvals" --repeat-each=10
  10 passed (20.3s)           E2E_EXIT=0
dopo il fix §G #9 (bc8480d): -g "Effettuato|One person in one place|Booking approval workflow — API"
  9 passed (25.2s)            E2E_EXIT=0
dopo il fix §G #10 (4a1ae4d): -g "One person in one place" --repeat-each=2
  10 passed (15.0s)           E2E_EXIT=0
```

Suite completa, `CI=1 scripts/e2e.sh start` (build propria, nessun server mio attivo), DB fresco verificato via SQL prima di ogni lancio (`Booking` 0, `Person` 4, `Flight` 0, `AppSetting` 0, `LoginAttempt` 0):
```
#1 su 4d3277c
  1 failed · 1 flaky · 40 did not run · 500 passed (10.5m)      E2E_EXIT=1
  failed  home-dashboard.spec.ts:228 (3/3 tentativi)  -> CAUSATO DA ME (fixture a «ieri», §G #9), corretto
  flaky   flights.spec.ts:1018 E3 [422, 422] al 1° tentativo, verde al retry -> classe nota TD 16.2-g, codice voli non toccato
  40 did not run = la catena dei project serializzati, che non parte se il project chromium fallisce
#2 su bc8480d
  1 flaky · 541 passed (12.9m)                                  E2E_EXIT=0
  541 + 1 = 542 = baseline 537 + 5 test nuovi, zero failed, zero did not run
  flaky   bookings.spec.ts:1127 (test :1086 non toccato, «rank shift» dopo router.refresh) -> probabilità alzata dai miei test su FUTURE_DAY, mitigato (§G #10)
```
**Stato dell'arbitro**: la #2 è su `bc8480d`; `4a1ae4d` ne differisce **solo** per la costante del giorno del describe nuovo (e2e, service identico, gates verdi, describe verde 10/10 sopra). Ho chiesto al lead un terzo reset per una #3 su `4a1ae4d`: non arrivato entro ~30 minuti, quindi chiudo su questa evidenza e **l'arbitro finale su `4a1ae4d` resta alla sessione principale**.

### Change Log

- 2026-09-27 — `4a1ae4d` feat(16.3): implementazione, test, fixture e2e (commit d'implementazione emendato due volte, solo e2e: `4d3277c` → `bc8480d` §G #9 → `4a1ae4d` §G #10); story file: derive corrette in place, Dev Agent Record, Status → review.
