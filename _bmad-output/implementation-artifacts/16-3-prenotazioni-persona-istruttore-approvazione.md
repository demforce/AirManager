---
baseline_commit: 738d399
---

# Story 16.3: Una persona in un posto solo — sovrapposizioni per persona e istruttore, ri-verifica in approvazione, guardia temporale sulle transizioni

Status: **ready-for-dev** — 2026-09-10. **Modello dev**: **Opus 5 xhigh** — la story **scrive codice UI**, e non per scelta: i tre punti in cui il client oggi tratta *ogni* 409 come «il velivolo è già prenotato» sono precisamente ciò che i due codici nuovi rendono **falso** (`new-booking-form.tsx:310`, `edit-booking-form.tsx:168`, `booking-transition.ts:100` — v. AD-7 con le righe esatte). Non c'è layout, non c'è CSS, non c'è componente nuovo: è **branching su codice d'errore + 6 stringhe i18n**, ma la regola utente 2026-07-29 («Opus 5 xhigh se la story scrive codice UI») **non ha una soglia** e questa story la attraversa. Review: **Opus 5 xhigh adversarial**, come sempre.

> ⚠️ **Baseline**: `738d399`. Ogni `file:riga` di questo file è **misurato su questo HEAD**. Vantaggio verificato: `git diff b7b8d13..HEAD -- src/server/services/bookings.service.ts src/server/services/errors.ts` è **vuoto**, quindi **tutte** le righe citate dall'ops-audit (misurate su `b7b8d13`) valgono ancora **invariate** — `:566`, `:936`, `:1161`, `:1038-1051`, `:1127-1176` sono confermate una per una in §3. Se il dev parte da un HEAD più avanzato, rilegge le righe citate e **corregge questo file** dove sono slittate.
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
| `handler.ts` **scarta** i `details` di un `ConflictError` | `src/lib/api/handler.ts:60` — `error instanceof ValidationError ? error.details : undefined` | «409 con la prenotazione in conflitto» **non arriva sul filo** senza una riga in più: AD-3 |
| Nessun chiamante di produzione popola `ConflictError.details` | `grep 'new ConflictError('` → **78** occorrenze, **0** con `details` (il solo 3° argomento in uso è il `code`, `ppr.service.ts:500`) | la riga di `handler.ts` è a **impatto zero** sull'esistente, e `errors.test.ts:28` già pinna che la classe li porta |
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

Idioma già in casa e **identico**: `accounts.service.ts:639`, `flights.service.ts:1123` (`SELECT "id" FROM "Account" … FOR UPDATE`, risultato ignorato).

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

**Una riga in `src/lib/api/handler.ts:60` è obbligatoria**, altrimenti i `details` **non escono**:

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
| `BookingsPage.form.errors.PERSON_BUSY` (dopo `overlap`, `it.json:1645`/`en.json:1645`) | `Questa persona ha già una prenotazione approvata che si sovrappone a questo intervallo.` | `This person already has an approved booking overlapping this interval.` |
| `BookingsPage.form.errors.INSTRUCTOR_BUSY` | `L'istruttore indicato ha già una prenotazione approvata che si sovrappone a questo intervallo.` | `The selected instructor already has an approved booking overlapping this interval.` |
| `BookingsPage.list.actions.errors.BOOKING_NOT_STARTED` (nel blocco `it.json:1712-1720`) | `La prenotazione non è ancora iniziata: può essere segnata come effettuata o assente solo dopo l'orario di inizio.` | `This booking has not started yet: it can only be marked as flown or no-show after its start time.` |

«Questa persona» funziona anche quando il pilota prenota **per sé** — è la stessa voce che `form.errors.PERSON_NOT_BOOKABLE` (*«Questa persona non ha un profilo attivo idoneo alla prenotazione.»*) usa già oggi su quello stesso percorso: **precedente in casa**, non da rilitigare. Nessun placeholder da interpolare in nessuna delle tre (niente nomi, niente marche: v. AD-3 privacy) → nessun `t.raw`.

**Le tre chiavi si consumano in `booking-labels.ts`:** `buildNewBookingFormLabels` (`:122-132`) e `buildEditBookingFormLabels` (`:161-172`) prendono i due `form.errors.*`; `buildBookingsTableLabels().actions.errors` (`:222-231`) prende tutte e tre — ed **è l'unica sorgente** anche del pannello mobile della Panoramica (`dashboard/page.tsx:622`: `errors: buildBookingsTableLabels(tBookings).actions.errors`), quindi la coda mobile è coperta **senza toccarla**. Il tipo `BookingTransitionErrorLabels` (`booking-transition.ts:26-37`) cresce di tre campi: il compilatore trova da solo ogni chiamante che ne manca uno.

**Zero CSS, zero layout, zero componente nuovo, zero testid nuovo.** Nessun `-mobile`/`mobile-` in gioco (CLAUDE.md), nessuna misura a 375/1280 da produrre: non cambia una regola di stile. Se il dev si trova a scrivere CSS, ha sbagliato story.

### AD-8 — La forma del fix, e cosa NON contiene

**Contiene**: 1 funzione di dominio nuova + 3 helper estratti + 2 `$queryRaw` di lock + 1 guardia temporale + 2 codici + 1 riga in `handler.ts` + 6 doc-comment + 3 descrizioni OpenAPI + 3 file client + 6 stringhe + i test.

**NON contiene**:
- **nessuna migrazione Prisma** e **nessun indice nuovo** (misurato: AD-1, `Booking_personId_idx` fa il lavoro in 0,17 ms);
- **nessun campo nuovo** su `Booking`;
- **nessuno status HTTP nuovo**: `409` e `422` sono già dichiarati su tutte e tre le rotte (`registry.ts:1494`, `:1528`, `:1562` via `errorResponses(401, 403, 404, 409, 422)`) → si aggiornano solo le **tre descrizioni** (`:1484` POST, `:1521` PATCH, `:1555` transition), nello **stesso commit** dell'implementazione;
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
Messaggio, codice (`CONFLICT`) e **assenza** di `details` del conflitto-velivolo sono **byte-identici** a oggi nei tre punti. Prove: `bookings.service.test.ts:566-580` (asserzione **esatta** sul `where`) e `:1238-1249`/`:1607-1617` restano verdi **senza modifiche**; `e2e/bookings.spec.ts:429` continua a leggere «già prenotato» su un caso che è **anche** persona-occupata (dimostrazione della precedenza sul vivo).

**AC 5 — La corsa è chiusa, e la prova è parallela (misurato).**
`Person` e, quando presente, `InstructorProfile` sono bloccate `FOR UPDATE` dentro la transazione, **dopo** i lock `Aircraft` e **prima** dei predicati, nei tre call-site. Prove richieste:
1. **unit** sull'SQL e sull'ordine: le chiamate `$queryRaw` di ogni percorso contengono `FOR UPDATE` su `"Aircraft"`, poi su `"Person"`, poi su `"InstructorProfile"`; `invocationCallOrder` del lock persona **precede** la prima `booking.findFirst` (stesso idioma di `:553-564`);
2. **e2e reale, due approvazioni concorrenti**: un pilota (login run-unique) crea **due** prenotazioni PENDING per **sé** sullo **stesso intervallo** e su **due velivoli run-unique diversi** (legale: `PENDING` non blocca, [I-c]); lo staff manda **due `Promise.all` di `POST …/transition {to:'APPROVED'}`** → `statuses.sort()` **`[200, 409]`**, e il 409 ha codice **`PERSON_BUSY`**. Idioma da riusare: `e2e/bookings.spec.ts:1033-1054`. È l'estensione alla persona della PROBE 6 dell'audit (§5.1).

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
`handler.ts:60` inoltra i `details` anche per `ConflictError`; un unit in `handler.test.ts` lo pinna (accanto a `:255-267`). Le **tre** descrizioni del registry (`registry.ts:1484` POST, `:1521` PATCH, `:1555` transition) nominano `PERSON_BUSY`/`INSTRUCTOR_BUSY` (409, con la forma di `details`) e — sulla transition — `BOOKING_NOT_STARTED` (422) **e** il fatto ratificato che l'approvazione di una prenotazione già iniziata **è permessa**. Stesso commit dell'implementazione. Nel record: il `git diff --stat` di `registry.ts` e la conferma che `npm run gates` (che include il build, cioè la generazione OpenAPI) è verde.

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
| `Aircraft` | `aircraft.service.ts:638`; `flights.service.ts:1104`, `:1312`, `:1444` (IN … ORDER BY id); `bookings.service.ts:548`, `:915` (IN … ORDER BY id), `:1145` | in `flights`: **Aircraft → Account** |
| `Account` | `accounts.service.ts:639`; `flights.service.ts:1123`, `:1322`, `:1460` (IN … ORDER BY id); `membership.service.ts:101` | — |
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
| 2 | `e2e/bookings.spec.ts:1691` | FLOWN (via UI) | `2031-03-10T09:00Z` (`FUTURE_DAY`, fixture `setupPendingBookingAsStaff:1595-1620`) | **non** cambiare l'helper (lo usano 4 test, 2 dei quali non ne hanno bisogno): estenderne il `return` con il `bookingId` (additivo, già disponibile a `:1611`) e, nel solo test Effettuato/Assente, PATCH nel passato **prima** del click su approva |
| 3 | `e2e/bookings.spec.ts:1706` | NO_SHOW (via UI) | idem, seconda fixture dello stesso test | idem |
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

**Zero sovrapposizioni oggi**: le tre bande APPROVED del primo file sono disgiunte fra loro e i tre file vivono su intervalli di date che non si incrociano (2031 / 2099 / oggi+120). Ma **niente nel codice lo garantisce**, e con `fullyParallel: true` i test dello stesso file corrono in worker diversi. La story **non riscrive** la suite: (a) aggiunge **un commento** accanto a `FUTURE_DAY` (`bookings.spec.ts:286`) che elenca le bande APPROVED riservate al pilota del seed e dice perché devono restare disgiunte; (b) usa **persone run-unique** in tutti i test nuovi. Ogni altro spec crea persona **e** velivolo run-unique per test → esposizione nulla per costruzione.

**(C) Istruttore**: **una sola** prenotazione con `instructorProfileId` in tutta la suite (`bookings.spec.ts:517-529`, istruttore run-unique, PENDING, mai approvata). Nessuna coppia sovrapposta possibile → `INSTRUCTOR_BUSY` **non ha copertura e2e oggi** e la story deve aggiungerla.

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

- **Il default `personFindUnique` dei test di approvazione ti mangia mezz'ora.** `bookings.service.test.ts:238` risolve `{ email }` e nient'altro: appena il ramo APPROVED legge la persona, `archivedAt` è `undefined` e la guardia archiviato scatta su **ogni** test di transizione. Il sintomo (decine di 409 dove ci si aspetta 200) **sembra** un difetto della guardia nuova: è la fixture. §3.5 ha la riga da scrivere.
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

*(da compilare dal dev subagent — §A verifica della ricognizione sul HEAD corrente (le righe di §3.1 una per una), §B riepilogo per AC con le prove, §C censimento `[I-2]` classificato (3 guardie / 6 filtri), §D tabella guardia → discriminanza con l'esito ROSSO e lo sha256 del ripristino, §E le 6 fixture e2e riparate con riga prima/dopo e l'asserzione rimasta identica, §F i conteggi `findFirst`/`$queryRaw` prima e dopo, §G deviazioni motivate, §H TD da registrare, §I file toccati, §J cosa NON ho fatto, §K screenshot UI (messaggio persona vs messaggio velivolo), §L gate ed esiti verbatim incl. `scripts/e2e.sh status`)*
