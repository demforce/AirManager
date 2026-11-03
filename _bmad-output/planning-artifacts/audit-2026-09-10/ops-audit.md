# Audit avversariale della logica di dominio OPERATIVA — AirManager

**Data**: 2026-09-10 · **Perimetro**: scheduling (prenotazioni), voli, velivoli (stato/contaore/tariffe/AOG), PPR, scadenze/alert, transiti, ciclo di vita delle persone.
**Escluso**: la logica del denaro (auditata in parallelo da un agente gemello) — citata qui solo dove interseca l'operativo (minuti di un volo, doppio addebito da doppia registrazione).
**Autore**: agente auditor avversariale. Nessun file del repo modificato oltre a questo report. Nessun commit. Suite e2e non eseguita. DB non resettato. Nessun processo terminato.

---

## 1. Metodo e perimetro

### Cosa ho letto
`CLAUDE.md`, `.claude/skills/karpathy-guidelines/SKILL.md`, `src/server/services/README.md`, `prisma/schema.prisma` (1768 righe, tutti i modelli in perimetro con i loro doc-comment, che in questo progetto sono la fonte normativa della semantica), e per intero o nelle parti rilevanti:

`bookings.service.ts` · `flights.service.ts` · `aircraft.service.ts` · `aircraft-status.ts` · `aog-impact.ts` · `ppr.service.ts` · `expiries.service.ts` · `expiry-alerts.service.ts` · `expiry-types.service.ts` · `people.service.ts` · `users.service.ts` · `me.service.ts` · `stats.service.ts` · `app-settings.service.ts` (sezione scheduling) · `rates.service.ts` · `exports.service.ts` (parti operative) · `src/lib/date-only.ts` · `src/lib/zoned-time.ts` · `src/lib/time.ts` · `src/lib/expiry-status.ts` · `src/lib/period-presets.ts` · `src/server/auth/rbac.ts` · `session.ts` · `auth.config.ts` · `jwt-active-check.ts` · gli schemi Zod di bookings/flights/aircraft/people/ppr · l'inventario completo delle 82 route `src/app/api/v1/**` · le storie AOG (`aog-1`, `aog-1a`, `aog-1b`) e `aog-1b-review-report.md`.

Ho letto anche i test unitari delle superfici in perimetro per ricostruire le invarianti *intese* e, soprattutto, per capire **cosa non è testato**: nessuna delle 8 falle che seguono ha un test che la copra, in nessuna direzione.

### Cosa NON ri-riporto
I 2 MAJOR / 2 MINOR / 4 LOW della review AOG-1b (finestra dichiarata vs mostrata quando il bound è passato, doppio click sul doppio passo, fold a 1280, link del banner non filtrato, conteggi unit, email che nomina solo la prima prenotazione, `role="status"`). Sono note e in carico. Dove costruisco su di esse lo dico.

### Come ho provato
Tre strumenti, in ordine di preferenza:

1. **Lettura del codice con citazione `file:riga`** — obbligatoria per ogni claim.
2. **Sonde API dirette** su `http://localhost:3000` (build di produzione viva), con **fixture mie** create ex novo e prefisso `audit_` / `I-AUD…`. Mai toccati gli attori del seed (solo login: admin 1, pilot 1, student 1 — 3 login totali, tetto 8 rispettato). Mai modificato un `AppSetting` globale. Le impostazioni di scheduling in vigore durante l'audit (lette, non scritte) sono: `sched.openTime=00:00`, `sched.closeTime=23:59`, `sched.minSlotMinutes=30`, `sched.turnaroundMinutes=0`, `sched.maxAdvanceDays=3650`.
3. **Sonde SQL in sola lettura** via `docker compose exec -T postgres psql`.
4. Uno **script throwaway** in `…/scratchpad/ops-audit/f1-flightdate-tz.ts` che importa le funzioni REALI del repo (`date-only.ts`, `zoned-time.ts`, `time.ts`) e riproduce alla lettera la guardia di `resolveFlightInput`.

Nota di metodo: vitest è confinato a `src/**/*.test.ts` dal suo config, e non volendo scrivere file di test dentro il repo ho eseguito la prova F1 con `npx tsx` importando i moduli veri per path assoluto. Il valore probatorio è identico: le funzioni sotto prova sono quelle di produzione, non copie.

**Stati usati**: CONFERMATO (riprodotto) / PLAUSIBILE (la lettura del codice lo implica, non riprodotto) / DOMANDA DI DESIGN (funziona come scritto, decide il PO).
**Severità**: BLOCKER (corruzione dati / rilevante per la sicurezza del volo: un volo o una prenotazione ammessi che devono essere bloccati, perdita silenziosa di storia) / MAJOR (stato errato visibile o sfruttabile da un non-admin) / MINOR / LOW.

---

## 2. Le invarianti del dominio come le ho ricostruite

Ricostruite dal codice, non dai documenti: dove il doc-comment e il codice divergono lo segnalo, perché in questo progetto il doc-comment è citato come contratto da altri moduli.

### [I-1] Un velivolo non può avere due prenotazioni APPROVED sovrapposte
Unica invariante di sovrapposizione realmente **applicata**. Intervallo semi-aperto `[startsAt, endsAt)`: due prenotazioni che si toccano non si sovrappongono. Applicata in tre punti, tutti con lo stesso predicato:

| dove | riga | predicato |
|---|---|---|
| `createBooking` | `bookings.service.ts:566-568` | `aircraftId` + `status:'APPROVED'` + `startsAt < endsAt_new` + `endsAt > startsAt_new` |
| `updateBooking` | `bookings.service.ts:936-943` | idem + `id: { not: bookingId }` |
| `transitionBooking` (→APPROVED) | `bookings.service.ts:1161-1168` | idem |

Serializzazione: `SELECT … FOR UPDATE` sulla riga `Aircraft` come **prima** istruzione della transazione (`:544-546`, `:928-930`, `:1141-1143`); su `updateBooking`/`correctFlight` il lock è multi-riga con `ORDER BY id` (anti-deadlock). **Verificata corretta sul vivo** (§5.1).

Chi occupa lo slot: **solo `APPROVED`**. Due `PENDING` sullo stesso intervallo coesistono per progetto; il conflitto emerge all'approvazione.

### [I-2] Non esiste nessuna invariante di sovrapposizione su PERSONA, ISTRUTTORE o VOLO
Il censimento completo dei predicati di sovrapposizione nel codebase (`grep 'startsAt: { lt'` / `'endsAt: { gt'` su tutto `src/`) restituisce **9 occorrenze, tutte in `bookings.service.ts`, tutte chiavate su `aircraftId` o senza chiave di soggetto**. Nessuna su `personId`. Nessuna su `instructorProfileId`. Nessuna su `Flight.takeoffAt/landingAt`. → Findings **F2**, **F3**.

### [I-3] Il contaore è un contatore incrementale, non una somma derivata
`Aircraft.hourMeterMinutes` è mutato da tre scritture e solo tre:
- `registerFlightCore` → `+= minutes` (`flights.service.ts:1044-1047`) — mai un `SET` a `hourMeterEnd`;
- `cancelFlight`/`correctFlight` → `max(0, current - minutes)` (`:1357`, `:1490`);
- `adjustHourMeter` → `SET newMinutes`, con riga `HourMeterAdjustment` nella stessa transazione e lock `FOR UPDATE` sulla lettura del valore precedente (`aircraft.service.ts:626-660`).

`Flight.hourMeterStart/hourMeterEnd` sono **osservazioni**, dichiaratamente informative dalla 11.1, validate solo come coppia coerente fra loro (`flights.service.ts:770-784`) e **mai** confrontate col contaore del velivolo. → Findings **F5**, **F6**.

### [I-4] Nessuna cancellazione fisica nel dominio operativo — con un'eccezione
`Person`, `Aircraft`, `Flight`, `Booking`, `PprRequest` non hanno API di delete: soft-archive (`archivedAt`) o soft-cancel (`status`). Le uniche `.delete()` nei service sono `cashCategory` (fuori perimetro), `expiryType` (protetta da `RESTRICT` + pre-check) e **`expiry`** (`expiries.service.ts:308`), che è cancellazione fisica di un record di aeronavigabilità/licenza. → Finding **F11**.

### [I-5] La data del volo è un giorno di calendario ROMA
`flightDate` è derivato da `takeoffAt` in `Europe/Rome` (`deriveFlightDate`, `flights.service.ts:484-486`), coerentemente con gli aggregati di `stats.service.ts` (mesi Roma via `currentMonthRange`). Ma la guardia "non nel futuro" lo confronta con `todayDateOnlyUtc()` (`:761`), che è UTC. → Finding **F1**.

### [I-6] `Aircraft.outOfServiceUntil` non decide nulla
Invariante [a] dello schema (`schema.prisma:296-306`): nessun job, nessun `where`, nessun `if` riapre un velivolo; solo `returnToService`. Ogni guardia legge `status` da solo. **Censimento rifatto da me su tutto `src/server`**: le occorrenze di `outOfServiceUntil` sono solo in `select`, in `outOfServiceDetails` (payload del 422), nella finestra di conteggio di `computeAogImpact` e nella scrittura/reset. **Invariante tenuta.**

### [I-7] Ogni ledger append-only è corretto per costruzione
`AircraftRate`/`InstructorRate`: nessun update/delete, `@@unique([soggetto, validFrom])`, tariffa efficace = `max(validFrom <= D)`. Nessuna sovrapposizione possibile, un solo tipo di lacuna (prima della prima tariffa → `NO_AIRCRAFT_RATE`). `HourMeterAdjustment`, `PackageConsumption`, `SentAlert`: append-only. **Verificate corrette** (§5.4).

### Macchine a stati, come le ho trovate

**Booking** (`isLegalBookingTransition`, `bookings.service.ts:1038-1051`; `transitionBooking` è `bookings.manage.any` per **ogni** transizione, riapri compreso):

```
                    ┌───────────────── riapri ─────────────────┐
                    v                                          │
  (create own) → PENDING ──approve──> APPROVED ──flown────> FLOWN
  (create staff) ────────────────────┘   │      ──no_show──> NO_SHOW
                    │                    │                     │
                    └──deny──> DENIED ───┼─────────────────────┘
                                  │      │
                                  └──────┴── riapri ──> PENDING

  PENDING ──cancel──> CANCELLED   (endpoint separato, mai in transitionBooking)
  APPROVED ─cancel──> CANCELLED   → CANCELLED è pozzo assoluto (mai `from`)
```

Ri-controlli su `PENDING → APPROVED` (`:1127-1176`): scadenze bloccanti · finestra oraria · velivolo (archiviato / fuori servizio) · sovrapposizione. **Assenti**: stato archiviato della persona, profilo attivo della persona, profilo attivo dell'istruttore, `startsAt` nel passato. Il doc-comment della funzione promette *«un'approvazione è, in effetti, "questa prenotazione sarebbe ancora creabile oggi"»* — **è falso su quattro voci**. → Finding **F4**.

Nessuna transizione ha guardia temporale: `FLOWN` su una prenotazione del 2027 è ammessa. `riapri` azzera `decidedAt/decidedByUserId/denyReason/closedAt/closedByUserId` senza tabella di storia. → Findings **F9**, **F10**.

**Flight** (`FlightStatus`): `REGISTERED → CANCELLED`, unica transizione, unidirezionale. Correzione = storno + nuova riga con `correctionOfId` (`@unique`). Un volo `CANCELLED` non è né stornabile né correggibile (`loadRegisteredFlightForReversal`, `flights.service.ts:1232-1235`); un movimento già stornato a mano è rifiutato con messaggio distinto (`:1245-1252`) e il backstop `P2002` su `reversalOfId` chiude la corsa. La catena di correzioni non si collassa mai. **Verificata corretta.**

**PprRequest**: `PENDING → APPROVED | REJECTED`; `APPROVED → COMPLETED | CANCELLED`. Nessun ritorno, nessuna riapertura. Lock `FOR UPDATE` sulla riga come prima istruzione (`lockPprRequest`, `ppr.service.ts:487-501`) con `expectedStatus` parametrico: il secondo concorrente perde **prima** di bruciare un numero PPR o di scrivere un movimento. Numerazione per anno atomica in **una** istruzione `INSERT … ON CONFLICT DO UPDATE … RETURNING` (`:441-445`), anno di calendario **Roma**. **Verificata corretta** (§5.3).

**Aircraft**: `OPERATIONAL ⇄ OUT_OF_SERVICE` con guardia atomica bidirezionale (`updateMany` con lo stato atteso nel `where`, `aircraft.service.ts:452-468` e `:600-606`). Asse ortogonale `archivedAt` ⇄ `null`, **senza nessuna guardia incrociata fra i due assi**. → Finding **F7**.

---

## 3. Findings

### F1 — MAJOR / CONFERMATO — Il giorno del volo è ROMA, il "oggi" che lo giudica è UTC: fra mezzanotte e le 02:00 un volo appena atterrato è rifiutato come «nel futuro»

**File**: `src/server/services/flights.service.ts:484-486` (derivazione) e `:760-763` (guardia).

```ts
// :484  il giorno CALENDARIO ROMA del decollo
function deriveFlightDate(takeoffAtIso: string): Date {
  return parseDateOnlyUtc(dateOnlyInZone(new Date(takeoffAtIso), APP_TIMEZONE));
}
// :760
const flightDate = deriveFlightDate(input.takeoffAt);
if (flightDate.getTime() > todayDateOnlyUtc().getTime()) {     // <-- "oggi" UTC
  throw new ValidationError('Flight date cannot be in the future.', undefined, 'FLIGHT_DATE_IN_FUTURE');
}
```

I due lati del `>` sono in due sistemi di riferimento diversi. `dateOnlyInZone(·, 'Europe/Rome')` avanza al giorno successivo alle 00:00 di Roma; `todayDateOnlyUtc()` (`src/lib/date-only.ts:37-40`) avanza alle 00:00 UTC, cioè 1 ora dopo in CET e **2 ore dopo in CEST**.

**Scenario**: sono le 01:00 di Roma del 15 luglio. Un aereo è decollato alle 00:10 ed è atterrato alle 00:20. L'admin registra il volo. `flightDate = 2026-07-15`; `todayDateOnlyUtc() = 2026-07-14`. → 422 `FLIGHT_DATE_IN_FUTURE` su un volo **già atterrato**.

**Prova** (`…/scratchpad/ops-audit/f1-flightdate-tz.ts`, esegue le funzioni reali del repo, `npx tsx`, 7/7 verdi):

```
--- SUMMER (CEST, UTC+2): Rome 2026-07-15 01:00 == 2026-07-14T23:00Z ---
PASS  Rome calendar day now                actual=2026-07-15  expected=2026-07-15
PASS  guard's todayDateOnlyUtc()           actual=2026-07-14  expected=2026-07-14
PASS  volo decollato Roma 00:10 e atterrato -> FLIGHT_DATE_IN_FUTURE   actual=true
--- WINTER (CET, UTC+1): Rome 2026-01-15 00:30 == 2026-01-14T23:30Z ---
PASS  ... stessa rottura nella finestra 00:00-01:00 Roma               actual=true
--- controllo: alle 02:30 Roma (estate) lo stesso volo passa ---
PASS  same flight accepted                 actual=false expected=false
```

**Finestra di impatto**: ogni notte, dalle 00:00 alle 01:00 di Roma in inverno e dalle 00:00 alle 02:00 in estate. È esattamente la finestra in cui si chiude la giornata di volo dopo un tramonto tardo. L'unico rimedio per l'operatore è aspettare, oppure post-datare il decollo mentendo sui tempi del logbook.

**Rimedio proposto**: sostituire `todayDateOnlyUtc()` con `parseDateOnlyUtc(dateOnlyInZone(new Date(), APP_TIMEZONE))` in `:761`. Un `todayDateOnlyInZone` esiste già (`src/lib/zoned-time.ts`) e restituisce la stringa; serve la sua versione `Date`, o `parseDateOnlyUtc` applicato al risultato. Il fix è di una riga e non cambia nessun altro comportamento: il lato sinistro del confronto è già Roma.

**Test mancanti**: nessun test di `resolveFlightInput` fissa l'orologio in `[00:00, 02:00)` Roma. Il test discriminante è: `vi.setSystemTime('2026-07-14T23:00:00Z')` + `takeoffAt: '2026-07-14T22:10:00Z'` → deve essere **accettato**.

**Nota collaterale (stessa classe, impatto minore)**: `todayDateOnlyUtc()` è il "oggi" anche di `computeExpiryStatus` (`expiries.service.ts:131`, `:236`, `:289`, `:444`, `:507`), dell'alert job (`expiry-alerts.service.ts:110`) e di `membership.service.ts:90`. Nella stessa finestra notturna un documento scaduto ieri (Roma) è ancora contato come «scade oggi», quindi valido. Nel dominio scadenze l'errore è di 1-2 ore su una granularità di giorni ed è benigno; lo cito perché il *fix* di F1 va deciso sapendo che la nozione di "oggi" è UTC in tutto il resto del codebase, e mescolare le due è precisamente ciò che ha prodotto F1. La scelta coerente è dichiarare un `todayInAppZone()` unico e usarlo dove il lato confrontato è Roma.

---

### F2 — MAJOR / CONFERMATO — La stessa persona e lo stesso istruttore possono essere APPROVED su due velivoli nello stesso istante

**File**: `bookings.service.ts:566-568`, `:936-943`, `:1161-1168`. Tutti e tre i predicati di sovrapposizione sono chiavati **solo** su `aircraftId`. Il censimento in [I-2] mostra che non esiste nessun altro controllo, in nessun service.

**Scenario 1 (persona)**: un pilota è prenotato 09:00-10:00 su I-AAA e 09:00-10:00 su I-BBB. Entrambe APPROVED. Fisicamente impossibile; contabilmente due slot bruciati; per la torre, due movimenti attesi da una persona sola.

**Scenario 2 (istruttore)**: lo stesso istruttore è indicato su due lezioni scuola contemporanee, su due velivoli, con due allievi diversi. Entrambe APPROVED. Uno dei due allievi arriverà a un aereo senza istruttore. È il caso operativamente più grave: la prenotazione dell'istruttore **è** l'impegno che l'allievo compra.

**Prova** (sonde 1 e 2, admin, fixture `audit_`; `Booking` in DB dopo le sonde):

```
            id             |   registration   |    pilot     | has_instr |  status  |      startsAt       |   notes
---------------------------+------------------+--------------+-----------+----------+---------------------+------------
 cmtvk5btk000tyupvrqxvcgc6 | I-AUD1789046541A | audit_pilot  | f         | APPROVED | 2026-11-20 09:00:00 | audit_p1_a
 cmtvk5bxh000uyupv2a4u3fm8 | I-AUD1789046541B | audit_pilot  | f         | APPROVED | 2026-11-20 09:00:00 | audit_p1_b   <-- stessa persona
 cmtvk5tlo000wyupvrlz3ip99 | I-AUD1789046541A | audit_pilot2 | t         | APPROVED | 2026-11-21 09:00:00 | audit_p2_a
 cmtvk5c47000vyupvova0hpyv | I-AUD1789046541B | audit_pilot  | t         | APPROVED | 2026-11-21 09:00:00 | audit_p2_b   <-- stesso instructorProfileId
```

Controlli negativi nella stessa sessione, per escludere che le sonde fossero degeneri: sovrapposizione sullo **stesso** velivolo → `409 CONFLICT` «This aircraft is already booked for an overlapping interval»; intervalli che si toccano (`endsAt == startsAt`) sullo stesso velivolo → `201 APPROVED`. La guardia `[I-1]` funziona; semplicemente non esiste per persona e istruttore.

**Rimedio proposto**: due predicati aggiuntivi accanto a quello esistente, nella stessa transazione e sotto lo stesso lock, in tutti e tre i call-site (`create`, `update`, `transition→APPROVED`) — mai in due copie che possano divergere: estrarre **una** funzione `findConflictingBookings(tx, { aircraftId, personId, instructorProfileId, startsAt, endsAt, excludeId })` che restituisce il tipo di conflitto, e tre codici 422/409 distinti (`AIRCRAFT_BUSY` esiste già come messaggio, servono `PERSON_BUSY` e `INSTRUCTOR_BUSY`) perché la UI deve poter dire *quale* soggetto è occupato. Attenzione: il lock corrente è sulla riga `Aircraft` e serializza solo i concorrenti sullo **stesso velivolo**; due create concorrenti su velivoli **diversi** per la stessa persona non si serializzano su nulla, quindi il predicato-persona da solo resta un check-then-write. Serve un secondo lock (sulla riga `Person`, e sulla riga `InstructorProfile`) preso in ordine deterministico, oppure un vincolo di esclusione Postgres — che il commento di `schema.prisma:1180-1186` ha deliberatamente escluso quando l'unica invariante era quella per velivolo, e che con tre soggetti va rivalutato.

**Domanda al PO prima di implementare**: la doppia prenotazione della stessa persona è sempre un errore, o esiste il caso legittimo del pilota che tiene due aerei per un trasferimento in formazione? La risposta cambia se `PERSON_BUSY` è un 409 secco o un 422 derogabile con `force`.

**Test mancanti**: `bookings.service.test.ts` (2300+ righe) non ha un solo caso con due prenotazioni della stessa persona o dello stesso istruttore. I test discriminanti sono i due scenari sopra.

---

### F3 — MAJOR / CONFERMATO — Il registro voli non ha nessun controllo di sovrapposizione né di duplicazione: lo stesso volo registrato due volte addebita due volte e avanza il contaore due volte

**File**: `flights.service.ts:596-902` (`resolveFlightInput`, tutte le guardie) e `:975-1050` (`registerFlightCore`). Nessuna interroga `Flight` per cercare righe esistenti.

**Prova** (sonde 13-15, admin con `force` — le fixture non hanno scadenze registrate, vedi §7; il `force` scavalca solo il blocco documenti, non introduce nessuna deroga sulle guardie in esame):

| sonda | richiesta | esito | contaore I-AUD…A |
|---|---|---|---|
| — | stato iniziale | — | 6000 |
| 13a | volo 2026-09-01 09:00→10:00, `audit_pilot`, I-AUD…A | `201` id `…9ehe0016…` | 6060 |
| 13b | **richiesta byte-identica** (note a parte) | `201` id `…9xs90018…` | **6120** |
| 14 | 2026-09-01 09:**30**→10:30, altro pilota, **stesso velivolo** | `201` id `…9zd9001a…` | 6180 |
| 15 | 2026-09-01 09:**15**→09:45, **stesso pilota**, altro velivolo | `201` id `…9zu7001c…` | — |

Tre difetti distinti nella stessa lacuna:

1. **Duplicazione**: due `Flight`, due `AccountMovement` di tipo `FLIGHT_CHARGE`, contaore +120 per 60 minuti volati. Il saldo del pilota fixture è arrivato a `-42200` centesimi su voli in gran parte doppi. Un doppio clic sul pulsante "Registra volo", o un utente che ricarica dopo un timeout, produce esattamente questo. **L'idempotenza esiste ed è corretta** (§5.2) ma è **opt-in sull'header**: se il client non manda `Idempotency-Key`, il server non ha nessuna seconda linea di difesa. Ho verificato che `POST /api/v1/flights` dichiara `idempotency: { endpoint: 'flight-register' }` (`src/app/api/v1/flights/route.ts:33`), quindi la protezione è disponibile — resta da verificare (fuori dal mio perimetro di lettura UI) che *ogni* client la usi; il difetto di dominio è che il server accetta il duplicato quando non la usa.
2. **Sovrapposizione sul velivolo**: due voli sullo stesso aeromobile con finestre orologio sovrapposte. Dalla 11.1 `takeoffAt`/`landingAt` sono istanti reali e `minutes` ne è derivato, quindi la sovrapposizione è ora una contraddizione *esprimibile e verificabile* — e non verificata.
3. **Sovrapposizione sulla persona**: lo stesso pilota in volo su due aerei. Simmetrico a F2, sull'altro ledger.

**Intersezione col denaro** (segnalata all'agente gemello): il duplicato genera un `FLIGHT_CHARGE` in più; lo storno esiste, ma richiede che qualcuno *si accorga*. Nessun avviso, nessun conteggio, nessun 409.

**Rimedio proposto**: dentro la transazione di `registerFlight`/`correctFlight`, sotto il lock `Aircraft` già preso, una `findFirst` su `Flight` con `status: 'REGISTERED'`, `aircraftId`, `takeoffAt < landingAt_new`, `landingAt > takeoffAt_new`, escludendo `correctionOfId`-self su `correctFlight` → 409. Un predicato analogo su `personId` (che però, come in F2, non è serializzato dal lock velivolo). Per la duplicazione secca il rimedio più economico e più forte è un `@@unique([aircraftId, takeoffAt, status])` parziale — o, senza migrazione, un 409 sulla tripla `(aircraftId, personId, takeoffAt)` già `REGISTERED`, che è quasi certamente sempre un errore.

**Test mancanti**: `flights.service.test.ts` (121 KB) non ha un caso di doppia registrazione né di sovrapposizione. I test discriminanti sono le righe 13b e 14 della tabella.

---

### F4 — MAJOR / CONFERMATO — L'approvazione di una prenotazione non ri-verifica la persona: si approvano prenotazioni di persone ARCHIVIATE, con profilo DISATTIVATO, e collocate nel PASSATO

**File**: `bookings.service.ts:1127-1176`. Il ramo `to === 'APPROVED'` esegue quattro ri-controlli (scadenze, finestra, velivolo, sovrapposizione) e **non interroga mai `Person`**. Il doc-comment della funzione (`:1092-1096`) dichiara *«un'approvazione è, in effetti, "questa prenotazione sarebbe ancora creabile oggi"»*: `createBooking` interroga `Person` a `:449-461` e rifiuta con `409` l'archiviato (`:463-465`) e con `422 PERSON_NOT_BOOKABLE` chi non ha profilo attivo (`:467-473`).

**Prova** (sonde 7, 7b, 8, 9 — tutte su fixture `audit_`, stato ripristinato a fine audit):

```
PROBE 7  archivio la persona, poi APPROVO la sua prenotazione PENDING
  archived: 2026-09-10T13:24:38.734Z
  approve archived-person booking -> APPROVED            <-- passa
PROBE 7b creo una prenotazione NUOVA per la stessa persona archiviata (controllo)
  create -> {'code': 'CONFLICT', 'message': 'Cannot book an aircraft for an archived person.'}   <-- rifiutata

PROBE 8  disattivo il profilo pilota (unico profilo di volo), poi APPROVO
  deactivate -> {"ok":true}
  approve deactivated-profile booking -> APPROVED        <-- passa (create darebbe 422 PERSON_NOT_BOOKABLE)

PROBE 9  lo staff SPOSTA una PENDING nel passato, poi la approva
  move to past -> ('2026-08-01T09:00:00.000Z', 'PENDING')
  approve past booking -> ('APPROVED', '2026-08-01T09:00:00.000Z')   <-- passa
```

Quattro conseguenze:

- **Persona archiviata**: l'archiviazione è la procedura di uscita dal club. Dopo di essa la persona resta APPROVED su un velivolo, compare nel calendario, e `transitionBooking` la può portare a `FLOWN` — ma `registerFlight` rifiuterà il volo con `PERSON_ARCHIVED` (`flights.service.ts:711-713`). Lo stato finale è una prenotazione volata che non può avere un volo.
- **Profilo disattivato**: la disattivazione del profilo pilota è come si registra un brevetto scaduto o ritirato. Approvare dopo di essa è la firma amministrativa su un volo che il regolamento del club vieta.
- **Passato**: `updateBooking` esenta deliberatamente lo staff da `BOOKING_IN_PAST` (`:531-534`, l'`if` è `!canManageAny && …`) — scelta ratificata, «lo staff può correggere una prenotazione in corso». Ma combinata con l'assenza di guardia temporale sull'approvazione, produce prenotazioni APPROVED nel passato che occupano uno slot storico e falsano ogni conteggio di occupazione retroattivo.
- **Istruttore**: simmetricamente non ri-verificato. Un istruttore il cui profilo è stato disattivato resta indicato su lezioni approvabili.

**Rimedio proposto**: estrarre da `createBooking:449-505` la funzione che risolve e valida la persona-bersaglio (esiste già in forma inline, con i tre predicati `isActivePilot`/`isActiveStudent`/`isActiveInstructor` a `:233-244`) e chiamarla **dalla stessa** posizione nel ramo `APPROVED` di `transitionBooking`, sull'`existing.personId` letto sotto il lock. Stessa cosa per `instructorProfileId`. Sul passato: decidere se l'approvazione di una prenotazione già iniziata è legittima (probabile: lo staff regolarizza a posteriori) e, se sì, **dichiararlo** invece di lasciarlo come effetto collaterale — perché oggi il doc-comment afferma il contrario.

**Test mancanti**: `bookings.service.test.ts` copre i quattro ri-controlli esistenti sull'approvazione e nessuno dei quattro assenti. I test discriminanti sono le quattro sonde sopra.

---

### F5 — MAJOR / CONFERMATO — Disattivare un tipo di scadenza non smette di bloccare: la persona diventa non prenotabile e non volabile per un documento che non esiste più nel catalogo

**File**: `bookings.service.ts:274-291` (`findBlockingExpiredDocuments`) contro `flights.service.ts:383-407` (`findMissingBlockingDocuments`).

```ts
// bookings.service.ts:277-280 — la scansione degli SCADUTI
const expiries = await prisma.expiry.findMany({
  where: { personId },                                    // <-- nessun filtro isActive
  select: { expiresAt: true, expiryType: { select: { name: true, blocksBooking: true } } },
});
// flights.service.ts:392-395 — la scansione dei MANCANTI
const applicableTypes = await prisma.expiryType.findMany({
  where: { isActive: true, blocksBooking: true, scope: { in: scopes } },   // <-- filtra isActive
```

Le due metà della stessa regola non concordano su cosa sia un tipo vivo. `findBlockingExpiredDocuments` è la funzione **condivisa** da `createBooking`, `updateBooking`, `transitionBooking→APPROVED` e (dalla 14.4) `resolveFlightInput`: la asimmetria si propaga a tutte e quattro le superfici.

**Prova**. Dati in DB: 3 `ExpiryType` con `isActive=false` **e** `blocksBooking=true`, con 3 righe `Expiry` che li referenziano. Uno di essi:

```
personId                  | person                             | type                           | isActive | blocksBooking | expiresAt
cmsj1b7mu013x51pvyk97izpw | Volo Titolare-1786112575576-gjnxt4 | Tipo voli 1786112576198-xmzvnx | f        | t             | 2019-06-01
```

Sonda 22b (una `POST /bookings` che **deve** fallire, nessuna riga creata):

```json
{"error":{"code":"EXPIRED_DOCUMENTS",
  "message":"Cannot create this booking: the following documents are expired: Tipo voli 1786112576198-xmzvnx.",
  "details":{"documents":[{"typeName":"Tipo voli 1786112576198-xmzvnx","expiresAt":"2019-06-01"}]}}}
```

E sul lato voli, stessa persona, stesso documento: `FLIGHT_BLOCKED_BY_EXPIRY` con lo stesso `typeName`.

Il colpo di grazia: quel tipo **non è nel catalogo attivo**. `GET /api/v1/expiry-types` restituisce 42 tipi e il nome citato dal 422 non è fra loro. L'admin legge un errore che nomina un documento che la sua schermata Impostazioni non mostra.

**Perché è un difetto e non una scelta**: `deleteExpiryType` rifiuta la cancellazione di un tipo in uso con il messaggio letterale *«This expiry type is in use — deactivate it instead.»* (`expiry-types.service.ts:193`, `:200`). La disattivazione è **pubblicizzata come la via d'uscita sicura**, e non lo è: lascia il blocco in piedi. Le uniche vie d'uscita reali sono `deleteExpiry` (che distrugge il record storico, vedi F11) o un `force` admin su ogni singolo volo.

**Rimedio proposto**: aggiungere `expiryType: { isActive: true }` al `where` di `findBlockingExpiredDocuments:278`. È una riga, ed è la scelta che rende le due metà della regola coerenti. Va decisa dal PO perché **cambia semantica**: oggi la disattivazione non sblocca, domani sì. La domanda per il PO è al §6.

Da valutare nello stesso intervento: `findBlockingExpiredDocuments` non filtra nemmeno per `scope`, quindi una scadenza di tipo `PILOTS` continua a bloccare una persona che ha perso il profilo pilota. Impatto minore, stessa radice.

**Test mancanti**: `expiry-types.service.test.ts` prova che la disattivazione toglie il tipo dalle liste; nessun test prova cosa succede alle `Expiry` esistenti su un tipo disattivato.

---

### F6 — MAJOR / CONFERMATO — La mascheratura dei nomi sulle prenotazioni lascia passare `personId`: la stessa correlazione che la guardia sul filtro `personId` esiste per impedire

**File**: `bookings.service.ts:219-223` (`maskBookingNames`) e `:625-628` (la guardia sul filtro).

```ts
// :222 — cosa viene azzerato
return { ...booking, personName: null, instructorProfileId: null, instructorName: null, notes: null, denyReason: null };
//        ^ personId NON è nella lista
```

La review 14.5 F1 ha chiuso proprio questo canale per `instructorProfileId`, e il commento lo dice: *«`instructorProfileId` era il bypass reale — un filtro istruttore lato client lo confrontava con un elenco non mascherato per de-anonimizzare ogni blocco mascherato»*. `personId` è rimasto, e ha la stessa forma: un id opaco ma **stabile**, joinabile.

La guardia a `:625-628` rifiuta con 403 un attore senza `bookings.read.names` che filtri per un `personId` non suo, e il suo commento spiega perché: *«i nomi mascherati da soli lascerebbero comunque a un attore del genere enumerare "ogni prenotazione della persona X" via questo filtro, un canale di collegabilità che la mascheratura non chiude»*. **Il payload gli consegna lo stesso dato, senza il filtro.**

**Prova** (login `pilot@airmanager.local`, ruolo `PILOT` = `self.read` + `bookings.manage.own`, senza `bookings.read.names`):

```
GET /api/v1/bookings?perPage=50            total: 102
{'id':'…','personId':'cmsj1p3g60003v5pvzgqx3xzo','personName':None,'instructorProfileId':None,
 'instructorName':None,'notes':None,'aircraftRegistration':'I-RVW…','startsAt':'2026-08-07T13:33:43Z','status':'APPROVED'}
…
GET /api/v1/bookings?personId=cmsj1g4hq021t51pvzwjwhgyp   ->  403     <-- la guardia
```

e la stessa enumerazione, ricostruita lato client dal corpo della risposta non filtrata:

```
distinct personIds visible to the PILOT on page 1: 16
top holders (pseudonymous schedule profile): [('cmsj1g4hq021t51pvzwjwhgyp', 3), ('cmsj1g4py022051pvu7wu80no', 2), ('cmsj1fwar020f51pvlap0m8ix', 2), …]
```

Lo stesso vale per `GET /api/v1/bookings/calendar`, che non ha filtro `personId` e quindi nessuna guardia: uno `STUDENT` (solo `self.read`) legge il calendario con nomi mascherati e `personId` in chiaro (verificato: `[('cmtvk4adt000iyupvwqabg6ls', None), ('cmtvk5bkk000qyupvvdelb8ng', None)]`).

**Impatto realistico**: pseudonimizzazione, non anonimizzazione. Un pilota costruisce «il titolare `…4hq0` ha I-XXX ogni martedì alle 9» e gli basta **una** occasione di associare quell'id a un nome — il proprio, quello del proprio istruttore via `getOwnInstructorProfileId`, un allievo visto nel picker di `listBookableStudents` (gate `self.read`, cioè **ogni** ruolo, `bookings.service.ts:1265`) — per de-anonimizzare tutta la serie storica. La ratifica R3 è «i piloti vedono *Occupato*»; il payload dice «Occupato, sempre lo stesso, ed ecco la sua chiave primaria».

**Rimedio proposto**: azzerare `personId` in `maskBookingNames:222`. Costo di contratto: `bookingItemSchema.personId` (`src/lib/schemas/bookings.ts`) è `z.string()` non nullable, quindi va reso `.nullable()` come è già stato fatto per `personName` nella 14.5, e va verificato che nessun consumatore client usi `personId` sulle righe mascherate (sulle righe **proprie** resta valorizzato, quindi la UI "le mie prenotazioni" non cambia). Se il PO preferisce non toccare il contratto, l'alternativa è un id per-richiesta non correlabile (HMAC di `personId` con un sale di sessione), più costosa e senza vantaggi qui.

**Nota positiva nello stesso perimetro**: gli export **rispettano** la maschera. `exports.service.ts:286-291` e `:769-772` rendono `row.personName ?? t('occupied')`, e la fonte è `listBookings`, già mascherata. Nessuna fuga di nomi via PDF/XLSX.

**Test mancanti**: `bookings.service.test.ts` verifica che `personName`/`instructorProfileId`/`notes`/`denyReason` siano `null` su una riga mascherata; nessuna asserzione dice cosa **non** deve esserci. Il test discriminante è un'asserzione negativa sull'intera forma della riga mascherata (`expect(Object.keys(...))` o un `toEqual` esatto), che è anche l'unico modo di non riaprire lo stesso buco al prossimo campo aggiunto al DTO.

---

### F7 — MAJOR / CONFERMATO — Archiviare un velivolo è più forte che metterlo fuori servizio e non ha nessuna delle sue tutele; e ogni operazione di stato funziona su un velivolo archiviato

**File**: `aircraft.service.ts:373-391` (`archiveAircraft`), `:439-499` (`setOutOfService`), `:590-608` (`returnToService`), `:626-660` (`adjustHourMeter`).

`archiveAircraft` verifica esattamente due cose: che il velivolo esista e che non sia già archiviato. Nessuna query su `Booking`. `setOutOfService`, `returnToService` e `adjustHourMeter` non verificano **mai** `archivedAt`.

**Prova** (sonde 20 e 21, sul velivolo fixture I-AUD…A che aveva 5 prenotazioni APPROVED future):

```
PROBE 20  archivio un velivolo con 5 prenotazioni APPROVED future
  APPROVED future bookings prima:  5
  archive -> ('archivedAt=2026-09-10T13:29:27.965Z', 'status=OPERATIONAL')   <-- nessun avviso, nessun conteggio
  APPROVED future bookings dopo:   5                                        <-- intatte
  ancora nel calendario? ['I-AUD1789046541A', 'I-AUD1789046541A']           <-- sì

PROBE 21  metto fuori servizio e correggo il contaore di un velivolo ARCHIVIATO
  out-of-service on archived -> ('OUT_OF_SERVICE','audit probe on archived', impact={'pending': 2, 'approved': 5})
  hour-meter adjust on archived -> 9999
```

Due problemi distinti.

**(a) L'asimmetria con AOG.** Le storie AOG-1a/1b hanno costruito, per il fermo temporaneo, un apparato completo: anteprima «stai per impattare N prenotazioni» con debounce, conteggio autoritativo dentro la transazione, banner persistente, email best-effort ai titolari delle APPROVED. L'archiviazione è l'atto **definitivo** — il velivolo esce dalla flotta, `createBooking` lo rifiuta (`:551-553`), `updateBooking` lo rifiuta come destinazione (`:922-924`), `transitionBooking→APPROVED` lo rifiuta (`:1150-1152`), `listBookableAircraft` lo esclude (`:1251`) — e non ha **niente**: né conteggio, né avviso, né email. Le 5 prenotazioni restano APPROVED, restano nel calendario, e il primo a scoprirlo è il pilota che si presenta.

**(b) I due assi di stato non si parlano.** Un velivolo archiviato può essere messo fuori servizio (e questo **fa partire il fan-out email** ai 5 titolari, per un aereo che nessuno può più prenotare), riportato in servizio, e avere il contaore corretto. `statusReason` e `outOfServiceUntil` sopravvivono all'archiviazione: la sonda 20 mostra `status=OPERATIONAL` conservato sull'archiviato, e la 21 lo porta a `OUT_OF_SERVICE` senza che nulla protesti.

**Rimedio proposto**. Su (a): riusare `computeAogImpact` — è già la **unica** funzione di dominio per «quante prenotazioni impatta questo velivolo», con `until: null` (finestra non delimitata, che è esattamente la semantica dell'archiviazione) — per l'anteprima e per il conteggio autoritativo di `archiveAircraft`, e decidere con il PO se le prenotazioni future vanno **bloccate** (409 «archivia prima annullando le N prenotazioni»), **annullate in cascata** nella stessa transazione, o solo **contate e notificate** come nel fermo. La terza è la più coerente con quanto già ratificato e la meno invasiva. Su (b): un `archivedAt: null` nel `where` delle tre `updateMany`/transazioni di stato, e `status`/`statusReason`/`outOfServiceUntil` azzerati (o congelati) all'archiviazione.

**Test mancanti**: `aircraft.service.test.ts` (71 test) non ha un caso di archiviazione con prenotazioni pendenti, né un caso di operazione di stato su un archiviato.

---

### F8 — MAJOR / PLAUSIBILE — `Actor.personId` non viene mai rinfrescato: ri-collegare o scollegare un utente da una persona lascia l'accesso "own" sulla persona precedente fino a 30 giorni

**File**: `src/server/auth/auth.config.ts:33-48` e `src/server/auth/jwt-active-check.ts:38-52`.

```ts
// auth.config.ts:33  — scritto SOLO al sign-in (il ramo è `if (user)`)
jwt({ token, user }) {
  if (user) { token.userId = …; token.roles = user.roles; token.personId = user.personId; … }
// jwt-active-check.ts:38-51 — il recheck periodico (ogni 15 min)
const user = await prisma.user.findUnique({
  where: { id: token.userId },
  select: { isActive: true, roles: true, tokenVersion: true },   // <-- personId assente
});
…
token.roles = user.roles;                                         // <-- solo roles
```

`roles` viene deliberatamente riletto e sovrascritto, e il doc-comment spiega perché: *«è così che un cambio di ruolo fatto da un admin si propaga a una sessione già autenticata senza aspettare la scadenza del JWT (CWE-613)»*. `personId` — l'**altra metà** di ogni controllo "own" del dominio — non è nell'elenco. Il grep su `src/server/auth/` conferma che `token.personId` è scritto in un solo punto (`auth.config.ts:37`) e letto in un solo punto (`:54`).

`updateUser` (`users.service.ts`) accetta `patch.personId` e ri-punta l'utente a un'altra `Person` con un singolo `UPDATE`. Ogni servizio in perimetro decide "mio" confrontando `actor.personId`: `assertOwnAccessAndTiming` (`bookings.service.ts:768-790`), `maskBookingNames` (`:220`), `authorizeFlightsQuery` (`flights.service.ts:1562-1586`), `listPersonExpiries` (`expiries.service.ts:119`), `getOwnInstructorProfileId` (`:1298-1310`). Nessuno rilegge il collegamento dal DB.

**Scenario**: un admin scollega l'utente U dalla persona A (per esempio perché il collegamento era sbagliato) e lo collega a B. La sessione di U, se aperta, continua per un massimo di **30 giorni** (`auth.config.ts:19-26`: nessun `maxAge` override, default 30 giorni **assoluti** dal login, senza sliding) a essere autorizzata su le prenotazioni, i voli, le scadenze e l'estratto conto di **A**, e a non vedere quelli di B. Se il collegamento è azzerato (`personId: null`), l'accesso "own" ad A non viene revocato affatto.

Il dettaglio che rende lo stato incoerente anche a schermo: `getMe` (`me.service.ts:29-45`) risolve la persona **dal DB** partendo da `actor.userId`, quindi la UI mostra la **nuova** identità mentre l'autorizzazione continua a usare la **vecchia**.

**Perché PLAUSIBILE e non CONFERMATO**: riprodurlo richiede un `User` con password impostata da ri-collegare a un'altra `Person`. Le uniche credenziali disponibili sono quelle del seed, che il mandato mi vieta di modificare, e creare un utente nuovo richiede il flusso di invito completo (il token è sha256-hashed in DB, non recuperabile). Il codice però non lascia margine di interpretazione: l'unica scrittura di `token.personId` è dentro `if (user)`, e la `select` del recheck è letterale.

**Rimedio proposto**: aggiungere `personId: true` alla `select` di `jwt-active-check.ts:40` e `token.personId = user.personId` accanto a `:51`. Due righe, stessa finestra di grazia di 15 minuti già ratificata per i ruoli, nessun cambio di contratto. Vale anche la pena di far scattare il recheck **immediatamente** su un cambio di collegamento, con lo stesso meccanismo `tokenVersion` già usato per il reset password: `updateUser` che tocca `personId` bumperebbe `tokenVersion`, evictando la sessione. Questa è la variante forte e la raccomando, perché il collegamento utente↔persona è un cambio di **identità**, non di permessi.

**Test mancanti**: `jwt-active-check` ha test per `isActive`, `roles` e `tokenVersion`; nessuno per `personId`.

---

### F9 — MINOR / CONFERMATO — Nessuna transizione di prenotazione ha guardia temporale: `FLOWN` su una prenotazione del 2027

**File**: `bookings.service.ts:1038-1051` (`isLegalBookingTransition`) e `:1108-1189`. La matrice è puramente sullo `status`; nessun ramo guarda `startsAt`/`endsAt` rispetto a `now`.

**Prova** (sonda 10): prenotazione creata per `2027-06-01T09:00Z`, `POST /bookings/{id}/transition {"to":"FLOWN"}` → `FLOWN`. Idem per `NO_SHOW` per costruzione (stesso ramo, `:1046`).

**Impatto**: `FLOWN`/`NO_SHOW` sono i due stati di chiusura e alimentano la lettura operativa «cosa è stato volato». Chiuderli su una prenotazione futura è un errore di data entry che nessuna guardia intercetta, e che **libera lo slot** (solo `APPROVED` occupa, [I-1]): l'aereo risulta libero per un giorno per cui c'è una prenotazione chiusa come volata.

**Rimedio proposto**: `FLOWN`/`NO_SHOW` solo se `startsAt <= now` (o `endsAt <= now` se il PO vuole la chiusura solo a slot concluso) — 422 con codice nuovo. Da decidere insieme a F4 (approvazione nel passato): le due guardie temporali sono la stessa domanda vista dai due lati.

---

### F10 — MINOR / CONFERMATO — «Riapri» cancella la traccia di chi aveva deciso e chiuso, e non esiste nessuna storia delle transizioni

**File**: `bookings.service.ts:1061-1074` (`transitionUpdateData`, ramo `PENDING`).

```ts
case 'PENDING':
  return { status: 'PENDING', decidedAt: null, decidedByUserId: null, denyReason: null, closedAt: null, closedByUserId: null };
```

Il reset è documentato e intenzionale (`schema.prisma:1192-1201`). Il problema non è il reset: è che quei campi sono **l'unica** traccia esistente. Non c'è tabella `BookingStatusHistory`, e `Booking` non ha nessun campo append-only: `decidedAt`/`decidedByUserId`/`denyReason`/`closedAt`/`closedByUserId` sono cinque caselle singole e riscrivibili.

**Prova** (sonda 10, continuazione):

```
prima del riapri:   FLOWN | closedAt 2026-09-10 13:25:02.294 | closedByUserId cmsj13l4o…
dopo  il riapri:  PENDING | closedAt (vuoto) | closedByUserId (vuoto) | decidedAt (vuoto) | denyReason (vuoto)
```

Chi ha approvato, chi ha negato e con che motivazione, chi ha marcato `NO_SHOW`: tutto perso, senza traccia del fatto che sia esistito. In un contesto dove il `NO_SHOW` può avere conseguenze economiche e dove `denyReason` viene **spedito per email al titolare**, la motivazione notificata smette di essere ricostruibile lato club.

Questo stride con la disciplina del resto del codebase, che è ostinatamente append-only: `HourMeterAdjustment`, `AircraftRate`, `PackageConsumption`, `SentAlert`, e soprattutto `Flight`, dove *ogni* "modifica" è storno + riga nuova con `correctionOfId` e la catena non si collassa mai (`schema.prisma:960-976`). Le prenotazioni sono il solo ledger operativo con storia sovrascrivibile.

**Rimedio proposto**: una `BookingStatusChange` append-only (`bookingId`, `from`, `to`, `reason`, `actorUserId`, `createdAt`) scritta nella stessa transazione di `transitionBooking` e di `cancelBooking`. I cinque campi correnti restano come proiezione dello stato attuale (nessun cambio di contratto per la UI). Basso rischio, alto valore.

---

### F11 — MINOR / CONFERMATO — `deleteExpiry` è l'unica cancellazione fisica del dominio operativo, e cancella un record di aeronavigabilità senza lasciare traccia; e `Expiry` non ha comunque storia

**File**: `expiries.service.ts:299-318` (`deleteExpiry`) e `:262-289` (`updateExpiry`); `schema.prisma:1429` (`@@unique([personId, expiryTypeId])`).

Due fatti che si sommano:

1. **`deleteExpiry` è un `DELETE` vero** (`:308`), non un soft-delete, e cascata su `SentAlert` e `ExpiryUpdateProposal` (`onDelete: Cascade`, `schema.prisma:1459`, `:1509`). Non resta nulla: non la data che il documento aveva, non chi lo aveva registrato (`Expiry.actorUserId`), non il fatto che un volo fosse stato forzato oltre di esso — la deroga resta stampata su `Flight.forcedAt/forceReason`, ma il documento che citava non esiste più. È l'**unica** delete del dominio operativo ([I-4]), in un codebase che altrove non cancella niente.
2. **`Expiry` è una riga sola per `(persona, tipo)`** e `updateExpiry` sovrascrive `expiresAt` in posto, azzerando anche le `SentAlert` (`:275-277`). Non esiste nessuna storia dei documenti precedenti: «quando è scaduta la visita medica precedente», «quando è stata rinnovata», «per quanti giorni questa persona ha volato con la medica scaduta» sono domande **non rispondibili**, oggi e per sempre.

Il doc-comment definisce `deleteExpiry` *«uno strumento di correzione per lo staff (tipo/persona sbagliati)»*, che è un caso d'uso legittimo. Ma è anche l'unica via d'uscita da F5, il che significa che sarà usato per **sbloccare persone**, non per correggere errori di battitura — e ogni uso di quel tipo distrugge un record di conformità.

**Rimedio proposto**: soft-delete (`deletedAt`) con esclusione da ogni lettura, che è lo schema già usato per `Person`/`Aircraft`, e che il vincolo `@@unique([personId, expiryTypeId])` costringe a ripensare (unique parziale su `deletedAt IS NULL`, come già fatto a mano per `ExpiryUpdateProposal_expiryId_pending_key`). La storia dei rinnovi è una domanda di design separata: si risolve rendendo `Expiry` append-only con "corrente = max(issuedAt)", ma è un cambio di modello, non un fix. Va in backlog con il suo peso, non dentro questo audit. Vedi §6.

---

### F12 — MINOR / CONFERMATO — Il rate limit del PPR pubblico è un check-then-write: 8 richieste parallele ne hanno scritte 7 contro un tetto dichiarato di 5

**File**: `ppr.service.ts:108-139`. Le tre difese (per-IP, bucket globale senza IP, per-email) sono tre `count()` seguiti da una `create()`, senza lock né vincolo DB.

**Prova** (sonda, 8 `POST /api/v1/ppr-requests` non autenticate in parallelo con lo stesso `X-Forwarded-For`, `PPR_RATE_LIMIT_MAX = 5`):

```
req5=429 req3=201 req6=201 req8=201 req1=201 req4=201 req2=201 req7=201
rows_created_past_a_cap_of_5: 7
```

7 righe e 7 email di ricevuta a indirizzi scelti dal mittente, contro un tetto di 5. L'amplificazione misurata è ~1,4× con concorrenza 8; cresce con la concorrenza, perché ogni richiesta in volo vede lo stesso `count` pre-inserimento.

**Contesto**: `createPprRequest` è l'**unico** endpoint di scrittura completamente non autenticato dell'applicazione. Le altre due difese (honeypot, per-email) funzionano — l'honeypot l'ho verificato: `201` in risposta e **0** righe scritte, che è esattamente il comportamento voluto (indistinguibile dal successo). Il difetto è solo la finestra di corsa sui contatori.

**Rimedio proposto**: sostituire il `count`+`create` con un'unica istruzione che decida e scriva — un `INSERT … WHERE (SELECT count(*) …) < 5` in SQL raw, oppure una tabella contatori con `INSERT … ON CONFLICT DO UPDATE … RETURNING` sulla chiave `(ip, ora)` e rifiuto sul valore restituito. Il secondo è il pattern che questo codebase **già usa correttamente** per `PprCounter` (`:441-445`): riusarlo qui è coerente e non introduce concetti nuovi.

**Test mancanti**: `ppr.service.test.ts` (47 KB) prova che il 6° tentativo *sequenziale* dà 429; nessun test è concorrente.

---

### F13 — MINOR / CONFERMATO — Lo storno di un volo che sfonda il contaore verso il basso perde minuti in silenzio, senza riga di rettifica

**File**: `flights.service.ts:1357` (`cancelFlight`) e `:1490` (`correctFlight`).

```ts
data: { hourMeterMinutes: Math.max(0, existingAircraft.hourMeterMinutes - flight.minutes) }
```

Il clamp è documentato e la motivazione è buona: *«una rettifica manuale precedente che sottostima i minuti di questo volo non deve mai BLOCCARE l'annullamento»*. Ma quando il clamp scatta, la differenza sparisce senza che nulla la registri.

**Prova** (sonda 19, sul velivolo fixture I-AUD…B che portava un volo di 30 minuti):

```
contaore prima:                                                      6031
adjustHourMeter -> newMinutes 5   (riga HourMeterAdjustment: 6031 -> 5, reason audit_probe_clamp)
cancel del volo da 30 minuti  ->  ('CANCELLED', 30)
contaore dopo:                                                          0     (l'aritmetica darebbe -25)
HourMeterAdjustment sul velivolo:  6031|5|audit_probe_clamp                   (nessuna riga per il clamp)
```

25 minuti evaporati. `HourMeterAdjustment` — la tabella che esiste **esattamente** per non permettere che il contaore cambi senza traccia (`schema.prisma:407-412`: *«story 2.5 (AC 2) lo fa cambiare SOLO tramite un `HourMeterAdjustment` tracciato — mai attraverso il percorso di update generico di questa tabella — così che l'audit trail non possa essere bypassato»*) — non ne sa niente. Su `correctFlight` è peggio, perché il clamp precede la nuova registrazione: il contaore finisce a `0 + minuti_nuovi`, cioè diventa il totale del **solo** volo corretto.

**Rimedio proposto**: quando `current - minutes < 0`, scrivere nella stessa transazione una riga `HourMeterAdjustment` con `previousMinutes = current`, `newMinutes = 0` e un `reason` generato («clamp su storno volo {id}: {n} minuti non sottraibili»). Il clamp resta, l'invariante «il contaore non cambia senza traccia» torna vera.

---

### F14 — LOW / CONFERMATO — Un volo di 20 secondi diventa 1 minuto; `takeoffs`/`landings` accettano 0 contro la semantica dichiarata dallo schema

**File**: `flights.service.ts:752`, `src/lib/schemas/flights.ts:106-107`.

```ts
const minutes = Math.max(1, Math.round((landingAt.getTime() - takeoffAt.getTime()) / 60_000));
takeoffs: z.number().int().min(0).max(500).optional(),
landings: z.number().int().min(0).max(500).optional(),
```

**Prova** (sonda 17): `takeoffAt 09:00:00 / landingAt 09:00:20`, `takeoffs: 0`, `landings: 0` → `201`, `minutes=1`, `takeoffs=0`, `landings=0`.

Due cose piccole:
- Il clamp a 1 minuto è ragionevole (un volo di durata nulla non deve essere gratis) ma il `min(0)` sui cicli contraddice il doc-comment dello schema, che afferma *«entrambi NOT NULL DEFAULT 1 (ogni volo ha almeno uno di ciascuno)»* (`schema.prisma:1017-1021`). Un volo con 0 atterraggi è rappresentabile e un logbook non dovrebbe permetterlo.
- Non c'è durata minima: un volo di 1 minuto passa ogni guardia. Con il tetto a 1440 minuti sul lato alto, il lato basso è scoperto.

**Rimedio proposto**: `min(1)` su `takeoffs`/`landings` in `schemas/flights.ts:106-107` (allineamento allo schema, nessuna migrazione: il default DB è già 1). Sulla durata minima, decidere con il PO se esiste un minimo sensato (5 minuti?) o se il clamp a 1 basta.

---

### F15 — LOW / PLAUSIBILE — Senza orario di apertura configurato non esiste nessun limite alla durata di una prenotazione

**File**: `bookings.service.ts:322-355` (`assertWithinSchedulingWindow`) e `src/lib/schemas/bookings.ts` (`createBookingSchema`).

```ts
if (settings.openTime && settings.closeTime) {   // <-- se una delle due è null, TUTTO il blocco è saltato
  …
  const withinWindow = startDay === endDay && startMinutes >= openMinutes && endMinutes <= closeMinutes;
```

Il requisito «stesso giorno di calendario» vive **dentro** quell'`if`. Se `openTime` o `closeTime` è `null` — stato legittimo e documentato come *«chiavi assenti → nessun vincolo nuovo, backward-safe»* — non resta nessun limite: né sulla durata, né sulla stessa giornata. `createBookingSchema` verifica solo `endsAt > startsAt`; `maxAdvanceDays` limita `startsAt`, mai `endsAt`. Una prenotazione `startsAt = domani`, `endsAt = 2050` è accettabile e, se APPROVED, blocca il velivolo per sempre.

**Perché PLAUSIBILE**: nel DB di lavoro `openTime=00:00` e `closeTime=23:59` sono configurati, quindi il blocco è attivo e la mia sonda 11 (prenotazione di 6 mesi) è stata correttamente rifiutata con `BOOKING_OUTSIDE_WINDOW`. Riprodurre F15 richiede di azzerare quelle due impostazioni globali, che il mandato mi vieta.

**Rimedio proposto**: un tetto di durata **indipendente** dalla finestra — nello schema Zod (un `.refine` su `endsAt - startsAt`) o nel service prima della transazione, con un massimo ratificato dal PO. È un vincolo di sanità, non di orario, e non deve dipendere da una configurazione opzionale.

---

### F16 — LOW / PLAUSIBILE (metà) e CONFERMATO (metà) — L'alert job e i contatori Scadenze non filtrano né le persone archiviate né i tipi disattivati

**File**: `expiry-alerts.service.ts:113-116`, `expiries.service.ts:446-465` (`listAllExpiries`), `:504-518` (`getExpiryTierCounts`).

```ts
// expiry-alerts.service.ts:113-116
const candidates: Candidate[] = await prisma.expiry.findMany({
  where: { expiresAt: { lte: horizon } },      // <-- nessun person.archivedAt, nessun expiryType.isActive
  select: CANDIDATE_SELECT,
});
```

Idem per i 4 `count()` di `getExpiryTierCounts` e per il `where` di `listAllExpiries` (che filtra `expiryTypeId`, `personId`, `personQuery`, `scope`, `expiresAt` — e nient'altro).

**Prova**, dati reali del DB di lavoro:

| misura | valore |
|---|---|
| `Expiry` totali | 559 |
| candidati dell'alert job nella finestra 60 giorni | 30 |
| di cui su tipi **disattivati** | **3** |
| di cui su persone **archiviate** | 0 |
| KPI «scadute» della registry | 29 |
| di cui su tipi **disattivati** | **3** (10%) |
| di cui su persone **archiviate** | 0 |

**Metà CONFERMATA**: 3 dei 30 candidati e 3 delle 29 «scadute» stanno su tipi che l'admin ha disattivato e che non compaiono più nel catalogo (§F5). Consumeranno soglie `SentAlert`, genereranno email al titolare e compariranno nel digest admin, per documenti ritirati dal catalogo.

**Metà PLAUSIBILE**: nessuna persona archiviata ha oggi scadenze nella finestra, quindi non ho potuto riprodurre l'alert a un ex socio. Il codice è però inequivocabile — il `where` è letterale — e la conseguenza è che il KPI «scadute» cresce in modo monotono con ogni persona che lascia il club, senza nessuna via per azzerarlo che non sia `deleteExpiry` (F11).

Non ho eseguito il job: farlo avrebbe consumato righe `SentAlert` per le scadenze di **altre** persone (30 candidati), alterando in modo permanente la loro cadenza di alert, e avrebbe spedito email. Fuori dal mandato.

**Rimedio proposto**: `person: { archivedAt: null }` e `expiryType: { isActive: true }` nei tre `where`. Sull'archiviazione la decisione è ovvia; sui tipi disattivati è la stessa domanda di F5 e va risolta con la stessa risposta, in un colpo.

**Nota accessoria (LOW, documentale)**: il doc-comment di `getExpiryTierCounts` afferma *«i 4 numeri sommano al totale delle scadenze»*. Non è vero: le righe oltre +60 giorni (la tier 4, `ok`) non stanno in nessuna delle 4 bande. Sui dati attuali, 4 bande su 559 righe totali. Nessun impatto utente, ma è un commento normativo sbagliato in un file dove i commenti sono citati come contratto.

---

### F17 — LOW / DOMANDA DI DESIGN — Una tariffa retroattiva sbagliata è permanente; e nessuna prenotazione può attraversare la mezzanotte

Due conseguenze accettate del design che l'operatore deve conoscere, entrambe verificate:

**(a) Tariffe.** `AircraftRate` è append-only senza update né delete, con `@@unique([aircraftId, validFrom])` (`schema.prisma:354-370`). Una tariffa inserita per errore con un `validFrom` **passato** non è né correggibile (409 sulla stessa data) né cancellabile. Le nuove registrazioni e — più importante — ogni `correctFlight` di un volo che cade nella finestra fra quella tariffa e la successiva, la ri-cercano con `getEffectiveRate` (`rates.service.ts:196-206`) e la applicano. La storia dei voli già registrati è protetta dallo snapshot (AD-4, corretto); la *ri-prezzatura* di una correzione futura non lo è.

**(b) Mezzanotte.** `assertWithinSchedulingWindow` richiede `startDay === endDay` in `Europe/Rome`, e il doc-comment lo dichiara: *«una prenotazione che attraversa la mezzanotte è sempre fuori finestra»*. Con la configurazione attuale (`closeTime=23:59`), una prenotazione 22:00→24:00 Roma è rifiutata — verificato, sonda 12: `BOOKING_OUTSIDE_WINDOW`. Non c'è modo di esprimere un `closeTime` di 24:00, quindi non c'è modo di prenotare fino a mezzanotte inclusa, né di attraversarla. Per un'aviosuperficie diurna è irrilevante; se un giorno si vola di notte, la finestra come è modellata (due `HH:MM` sullo stesso giorno) non lo esprime.

Nessun rimedio proposto: sono decisioni da §6.

---

## 4. Cap e limiti che si romperanno sotto carico

Il carico atteso citato nel mandato è ~1000 velivoli / ~5000 persone. Baseline attuale del DB di lavoro: **216 velivoli, 403 persone, 152 prenotazioni, 131 voli, 559 scadenze, 47 tipi di scadenza**. Ordinati per «cosa mente prima».

| # | dove (`file:riga`) | cap | cosa succede a 1000 velivoli / 5000 persone |
|---|---|---|---|
| 1 | `bookings.service.ts:718` — `listCalendarBookings` | `take: 1000`, **non paginato, troncamento silenzioso** | **Il caso più grave.** Il calendario/timeline è la superficie su cui si prenota. Su una finestra di 8 giorni con 1000 velivoli, 1000 righe si esauriscono con ~1 prenotazione per velivolo su 8 giorni. Oltre, le prenotazioni vengono **tagliate senza nessun segnale**: l'utente vede uno slot libero che è occupato, prenota, e riceve un 409 dalla guardia `[I-1]` — che regge (bene) ma dopo aver fatto perdere tempo. Nei casi peggiori (slot mostrato libero, `PENDING` creata, approvata più tardi quando il conflitto è diverso) la UI e il DB raccontano storie diverse. L'ordine è `startsAt asc`, quindi ciò che si perde è sistematicamente la **coda della finestra**. |
| 2 | `bookings.service.ts:1248` `listBookableAircraft` · `:1265` `listBookableStudents` · `:1278` `listActiveInstructors` | **nessun `take`** | Query illimitate, gate `self.read` — cioè **ogni utente autenticato**. Il picker del form prenotazione e le righe della timeline caricano tutti i 1000 velivoli e tutti i 5000 allievi a ogni render. Non mentono (restituiscono tutto) ma diventano il collo di bottiglia della pagina più usata, e sono raggiungibili da un pilota qualsiasi: 3 endpoint non paginati come superficie di carico. |
| 3 | `expiry-alerts.service.ts:113-116` — `runExpiryAlertsJob` | **nessun `take`, nessuna paginazione**; email inviate in-request in un `for` seriale | A 5000 persone × ~5 documenti la finestra di 60 giorni può contenere migliaia di candidati, tutti caricati in memoria in una query, poi una email per candidato in sequenza. Il TD già registrato in AOG-1b («costo del fan-out in-request», ~76 ms/destinatario su Mailpit locale) vale qui **moltiplicato**: 1000 candidati ≈ 76 secondi di richiesta HTTP. Il cron va in timeout, e poiché le righe `SentAlert` sono inserite **prima** dell'invio (scelta corretta e documentata), un timeout a metà lascia soglie consumate senza email inviate — recuperabili solo dal digest admin, che però è l'ultima cosa che il job fa e non arriverà. |
| 4 | `dashboard/page.tsx:70` + `bookings/page.tsx:41` + `billing/page.tsx:24` + `logbook/page.tsx:33` + `expiries/page.tsx:25` — `OPTIONS_PAGE_SIZE = 100` | 100 **per pagina**, aggregati calcolati sopra | TD già noto e dichiarato. Confermo l'estensione: sono **cinque** pagine indipendenti con la stessa costante duplicata, non una. Oltre i 100 velivoli i picker perdono opzioni e l'overlay «Riservato» della Panoramica copre solo i primi 100 (residuo già dichiarato dalla review AOG-1a MINOR-1). A 1000 velivoli il 90% della flotta è invisibile a quelle superfici. |
| 5 | `expiries.service.ts:137` `listPersonExpiries` `take: 200` · `expiry-types.service.ts:87` `take: 500` · `rates.service.ts:209` e `instructor-rates.service.ts:182` `take: 500` · `movements/page.tsx` cap sugli APPROVED aperti | 200 / 500 / 500 / 500 / n | Cap difensivi su insiemi realisticamente piccoli, tutti **silenziosi**. Il più esposto è `take: 500` sulla storia tariffe: append-only e mai potata, a 10 anni di listino con ritocchi mensili si arriva a 120 righe per velivolo — largo, ma la storia non ha una fine. Il cap sui transiti è già documentato come degradazione accettata («sottoconta i KPI invece di crashare»). |

**Il tema comune**: nessuno di questi cap dice al chiamante di essere scattato. `paginate()` esiste e restituisce un `total` (le liste paginate sono corrette); i cap difensivi tagliano e tacciono. Il rimedio generale, minimo e uniforme, è restituire un flag `truncated` dove il cap può realisticamente scattare — a partire dal #1, che è quello su cui si prende una decisione operativa.

---

## 5. Verificato corretto (con prove)

### 5.1 La concorrenza sulle prenotazioni regge davvero — su entrambi i percorsi
Il lock `SELECT … FOR UPDATE` sulla riga `Aircraft` come prima istruzione della transazione non è decorativo. Due sonde parallele reali:

```
PROBE 5  due POST /bookings PARALLELE, stesso velivolo, stesso intervallo
  req1 http=201   ->  cmtvk6odl000yyupv39yjs7hi
  req2 http=409   ->  CONFLICT «This aircraft is already booked for an overlapping interval»

PROBE 6  due POST /bookings/{id}/transition {"to":"APPROVED"} PARALLELE su due PENDING sovrapposte, stesso velivolo
  cmtvk6oz2… http=200  ->  APPROVED
  cmtvk6op0… http=409  ->  CONFLICT «This aircraft is already booked for an overlapping interval»
```

Il secondo caso è il più interessante: `transitionBooking` blocca prima la propria riga `Booking` (nessuna contesa, sono righe diverse) e **poi** la riga `Aircraft` — è quel secondo lock che serializza, e sotto READ COMMITTED la lettura di sovrapposizione successiva vede il commit del vincitore. Funziona. Per costruire due `PENDING` sovrapposte ho usato il percorso `APPROVED → FLOWN → riapri → PENDING`, che è anche la prova che «riapri» libera lo slot come documentato.

Verificati anche i due bordi dell'intervallo semi-aperto: sovrapposizione sullo stesso velivolo → 409; `endsAt == startsAt` (intervalli che si toccano) → 201. La semantica `[startsAt, endsAt)` è esatta.

### 5.2 L'idempotenza a livello di richiesta funziona ed è esatta
`POST /api/v1/flights` con lo **stesso** `Idempotency-Key` due volte:

```
attempt1 http=201   (nessun header di replay)   flight id: cmtvkb0hi001jyupvf5gi3z3c
attempt2 http=201   idempotency-replayed: true  flight id: cmtvkb0hi001jyupvf5gi3z3c   <-- stessa riga
contaore prima 6240  ->  dopo 6270   (+30 per un volo di 30 minuti, una volta sola)
```

Un solo `Flight`, un solo `AccountMovement`, un solo avanzamento del contaore, e l'header `Idempotency-Replayed: true` che distingue il replay dalla creazione. Il fingerprint del corpo è legato alla chiave (`IDEMPOTENCY_KEY_MISMATCH` su corpo diverso). È la difesa giusta contro il retry di rete — e F3 esiste solo perché è opt-in.

### 5.3 La numerazione PPR è atomica e la macchina a stati non perde numeri
`INSERT INTO "PprCounter" … ON CONFLICT ("year") DO UPDATE SET "lastSeq" = "lastSeq" + 1 RETURNING "lastSeq"` (`ppr.service.ts:441-445`): una sola istruzione, il row lock di Postgres fa la serializzazione, nessuna finestra read-then-write. L'anno è quello di **calendario Roma** (`dateOnlyInZone(decidedAt, APP_TIMEZONE).slice(0,4)`), quindi un'approvazione a Capodanno cade nell'anno che dice l'orologio di Roma, non UTC — è l'errore di F1 evitato correttamente, nello stesso codebase, quattro file più in là. Il `lockPprRequest` con `expectedStatus` parametrico garantisce che il perdente di una corsa non bruci un numero e non scriva un movimento. `completePprRequest` fa la chiusura e il `CashMovement` in una transazione (o entrambi o nessuno), e una categoria "PPR" mancante o inattiva fa rollback invece di completare in silenzio con la tassa non registrata.

Unica duplicazione da segnalare (LOW, manutenzione): il blocco di numerazione è **copiato** in `approvePprRequest:441-445` e `createManualPprRequest:533-537`, identico. Oggi non divergono; è il tipo di duplicazione che AD-1 esiste per prevenire.

### 5.4 L'RBAC operativo tiene su tutta la matrice che ho provato
Tutte le sonde sono richieste reali contro la build di produzione:

| attore | azione | esito |
|---|---|---|
| `PILOT` | `GET /flights` senza filtri | `total: 1` — solo il proprio volo |
| `PILOT` | `GET /flights?personId=<altro>` | `403` |
| `PILOT` | `POST /flights` | `403` |
| `PILOT` | `PATCH /bookings/<altrui>` | `403` |
| `PILOT` | `POST /bookings/<altrui>/cancel` | `403` |
| `PILOT` | `POST /bookings/<altrui>/transition` | `403` |
| `PILOT` | `GET /bookings?personId=<altro>` | `403` |
| `STUDENT` | `POST /bookings` | `403` (nessun `bookings.manage.own`, come da ratifica 7.1) |
| anonimo | `GET /api/v1/ppr-requests` | `401` |
| anonimo | `POST /api/v1/ppr-requests` con honeypot pieno | `201` e **0 righe** scritte |

Il caso `GET /api/v1/ppr-requests` merita una nota: quel pathname è in `PUBLIC_API_PATHS` di `src/proxy.ts` per via del `POST` pubblico, quindi il middleware **non** controlla la sessione per nessun metodo su quel path. Risponde 401 comunque, perché `apiRoute` risolve la sessione da sé e `listPprRequests` chiama `authorize(actor, 'ppr.manage')` prima di ogni query. È AD-5 (*«il middleware non è mai l'unico guardiano»*) verificato alla lettera su una route che dal middleware non ha alcun aiuto.

### 5.5 Altre cose che ho cercato di rompere e non si sono rotte
- **Invariante [a] di `outOfServiceUntil`**: censimento rifatto su tutto `src/server`. Nessun `where`, nessun `if`, nessun job la usa per riaprire un velivolo. Tenuta.
- **Le frontiere di `computeAogImpact`**: finestra `[now, fine giornata di until]` costruita con `zonedMidnightUtc(addDaysDateOnly(until, 1))` — DST-safe, e il clamp «un upper bound già passato non è un bound» è nell'unico posto giusto. Una sola implementazione, due call-site.
- **`zoned-time.ts`**: l'algoritmo a doppia correzione per la mezzanotte locale è corretto sui due giorni di transizione 2026 (2026-03-29 a 23 ore, 2026-10-25 a 25 ore); i suoi test lo provano e la mia lettura conferma che la seconda correzione riparte dal `guess` originale, che è il dettaglio che la rende esatta.
- **Confini dei mesi negli aggregati**: `stats.service.ts` e `period-presets.ts` derivano i mesi dalle parti **Roma** (`romeDateParts`), coerentemente con `flightDate` che è un giorno Roma. Nessuna deriva fra il giorno del volo e il mese che lo conta.
- **Storno e correzione voli**: un volo `CANCELLED` non è né stornabile né correggibile; un movimento già stornato a mano dà un `ConflictError` con messaggio distinto che non mente sullo stato del volo (fix review 5.3 M1, verificato in codice); il backstop `P2002` su `reversalOfId` chiude la corsa del doppio storno; il lock multi-riga con `ORDER BY id` rende due correzioni incrociate provabilmente prive di deadlock; l'ordine macro dei lock (Aircraft poi Account) è lo stesso in `registerFlight`, `cancelFlight` e `correctFlight`.
- **Coerenza fra `Aircraft.hourMeterMinutes` e i flussi**: il `+=` invece del `SET` a `hourMeterEnd` è la scelta corretta e il doc-comment spiega perché (registrazioni fuori ordine, rettifiche manuali precedenti, il decremento dello storno nella stessa transazione). `adjustHourMeter` legge il valore precedente sotto `FOR UPDATE`, quindi due rettifiche concorrenti non registrano mai un "prima" stantio.
- **Nessuna cancellazione fisica** di `Person`, `Aircraft`, `Flight`, `Booking`, `PprRequest`. Le `onDelete: Cascade` esistono solo su `SentAlert` e `ExpiryUpdateProposal` verso `Expiry` — cioè su righe che non hanno significato senza il loro bersaglio. `Expiry → ExpiryType` è `Restrict` esplicito.
- **Gli export rispettano la mascheratura** (`exports.service.ts:286-291`, `:769-772`): nessuna fuga di nomi via PDF/XLSX verso un pilota.
- **`StudentInstructorAssignment` e `TrainingNote`**: nessun riferimento vivo in `src/server/services/` né in `src/app/`. Il modulo scuola è stato ritirato dalla 12.13; le tabelle restano dormienti. Nessuna logica da auditare, e nessun percorso che possa lasciare righe orfane, perché nessuno scrive più.

---

## 6. Domande per il PO

Ordinate per quanto la risposta blocca il fix.

1. **F5 / F16 — un tipo di scadenza disattivato deve smettere di bloccare?** È la domanda che decide una riga di codice (`expiryType: { isActive: true }` in `findBlockingExpiredDocuments:278`) ma cambia semantica su quattro superfici. Oggi la risposta di fatto è «no, continua a bloccare», e l'errore mostrato all'admin nomina un documento che la sua schermata Impostazioni non contiene. Le opzioni sono: **(a)** filtrare `isActive` — la disattivazione diventa la via d'uscita pulita che il messaggio *«deactivate it instead»* già promette; **(b)** lasciare com'è e cambiare il messaggio di `deleteExpiryType`, perché oggi mente; **(c)** distinguere «disattivato per nuove registrazioni» da «non più richiesto», che è un campo nuovo. Raccomando **(a)**.

2. **F2 — la doppia prenotazione della stessa persona è sempre un errore?** Da questo dipende se `PERSON_BUSY` è un 409 secco o un 422 derogabile. Per l'**istruttore** non vedo caso legittimo e proporrei un 409 senza deroga.

3. **F4 / F9 — le prenotazioni nel passato.** Approvare una prenotazione già iniziata e marcare `FLOWN` una prenotazione futura sono oggi entrambe permesse. La prima è probabilmente voluta (lo staff regolarizza a posteriori) e va **dichiarata**, perché il doc-comment afferma il contrario; la seconda è probabilmente solo un buco. Confermare quale delle due è intenzionale.

4. **F7 — cosa deve fare l'archiviazione di un velivolo con prenotazioni future?** Bloccare (409, «annulla prima le N prenotazioni»), annullare in cascata nella stessa transazione, o contare e notificare come già fa il fermo? La terza riusa `computeAogImpact` e l'apparato AOG-1b senza costruire niente di nuovo, ed è la più coerente con quanto già ratificato.

5. **F8 — un cambio di collegamento utente↔persona deve terminare la sessione?** Il meccanismo `tokenVersion` esiste già ed è esattamente questo. Raccomando sì: è un cambio di identità, non di permessi.

6. **F11 — serve la storia dei documenti?** Oggi `Expiry` è una riga sola per `(persona, tipo)` e il rinnovo sovrascrive. «Quando è scaduta la medica precedente» e «per quanti giorni ha volato scaduta» non sono rispondibili. Se servono (mi aspetto che a un certo punto servano, per la conformità), è un cambio di modello da mettere in backlog con il suo peso, non un fix.

7. **F17b — si volerà mai fuori dalla finestra 00:00–23:59 dello stesso giorno Roma?** Se sì, la finestra come modellata (due `HH:MM` sullo stesso giorno di calendario) non lo esprime, e nessun `closeTime` può valere 24:00.

8. **Cap #1 — il calendario deve dire quando ha troncato?** A 1000 velivoli mostrerà silenziosamente meno di quello che c'è. Un flag `truncated` nella risposta è economico; alzare il `take` sposta solo il problema.

---

## 7. Residui lasciati su DB e API

Tutte le fixture create da me. Nessun attore del seed modificato (solo login: `admin@` 1, `pilot@` 1, `student@` 1). Nessun `AppSetting` scritto. Tutte le fixture sono state **ripristinate** allo stato attivo/operativo a fine audit (verificato: 3 persone non archiviate con profili attivi, 2 velivoli `OPERATIONAL` e non archiviati).

| tabella | righe | come si riconoscono | note |
|---|---|---|---|
| `Aircraft` | 2 | `registration LIKE 'I-AUD%'` → `I-AUD1789046541A` (contaore 9999), `I-AUD1789046541B` (contaore 0) | entrambi `OPERATIONAL`, `archivedAt` nullo, `statusReason` nullo. I contaore sono i valori lasciati dalle sonde 19 e 21 |
| `Person` | 3 | `lastName LIKE 'Audit%'` → `audit_pilot`, `audit_pilot2`, `audit_instr` | non archiviate; profili pilota/istruttore attivi (ripristinati) |
| `PilotProfile` / `InstructorProfile` | 2 + 1 | via le persone sopra | `deactivatedAt` nullo |
| `AircraftRate` | 2 | sui due velivoli `I-AUD%`, `validFrom 2026-01-01`, 12000 c/h | append-only, non cancellabili per progetto |
| `InstructorRate` | 1 | su `audit_instr`, `validFrom 2026-01-01`, 5000 c/h | idem |
| `Booking` | 12 | `notes LIKE 'audit_%'` (`audit_p1_a/b`, `audit_p2_a/b`, `audit_p4`, `audit_race`, `audit_pendX/Y`, `audit_arch`, `audit_deact`, `audit_past`, `audit_futureflown`) | stati misti (APPROVED / PENDING / FLOWN) per costruzione delle sonde. Verificato: 0 prenotazioni su persone `audit_` senza nota `audit_` |
| `Flight` | 7 | `notes LIKE 'audit_%'` (`audit_dup1`, `audit_dup2`, `audit_acoverlap`, `audit_personoverlap` → **CANCELLED**, `audit_metercrazy`, `audit_20s`, `audit_idem`) | tutti con `forcedAt`/`forceReason = "audit probe"` |
| `HourMeterAdjustment` | 2 | `reason` = `audit_probe_clamp` (6031→5) e `audit probe archived meter` (→9999) | append-only per progetto |
| `Account` | 2 | dei due `audit_pilot*` | creati automaticamente dai profili pilota. Saldi: `audit_pilot` **−42200** c, `audit_pilot2` **−12000** c — sono gli addebiti dei voli sonda, **non** un difetto contabile |
| `AccountMovement` | 8 | sui due conti sopra | 7 `FLIGHT_CHARGE` + 1 `FLIGHT_CHARGE_REVERSAL` (lo storno della sonda 19) |
| `PprRequest` | 7 | `submitterIp = '203.0.113.191'`, `lastName = 'AuditRate'`, `firstName LIKE 'audit_rl%'` | residuo della sonda F12 sul rate limit. Stato `PENDING`, nessun numero PPR assegnato. **7 email di ricevuta inviate** a `audit_rl{1..8}@example.test` (dominio `.test`, non instradabile) |
| `IdempotencyRecord` | 1 | `key LIKE 'audit-idem-%'` | residuo della sonda 18 |

Zero righe scritte da: la sonda honeypot (`lastName='honeypot'` → 0 righe, come deve essere) e la sonda F5/22b (la `POST /bookings` è stata rifiutata con 422, nessuna riga creata).

**Come ripulire**, se e quando lo si vuole (ordine di dipendenza; non l'ho eseguito, non è nel mandato):

```sql
DELETE FROM "AccountMovement" WHERE "accountId" IN
  (SELECT ac.id FROM "Account" ac JOIN "Person" p ON p.id=ac."personId" WHERE p."lastName" LIKE 'Audit%');
DELETE FROM "Flight"  WHERE notes LIKE 'audit_%';
DELETE FROM "Booking" WHERE notes LIKE 'audit_%';
DELETE FROM "HourMeterAdjustment" WHERE reason ILIKE 'audit%';
DELETE FROM "AircraftRate" WHERE "aircraftId" IN (SELECT id FROM "Aircraft" WHERE registration LIKE 'I-AUD%');
DELETE FROM "InstructorRate" WHERE "instructorProfileId" IN
  (SELECT ip.id FROM "InstructorProfile" ip JOIN "Person" p ON p.id=ip."personId" WHERE p."lastName" LIKE 'Audit%');
DELETE FROM "Account" WHERE "personId" IN (SELECT id FROM "Person" WHERE "lastName" LIKE 'Audit%');
DELETE FROM "PilotProfile"      WHERE "personId" IN (SELECT id FROM "Person" WHERE "lastName" LIKE 'Audit%');
DELETE FROM "InstructorProfile" WHERE "personId" IN (SELECT id FROM "Person" WHERE "lastName" LIKE 'Audit%');
DELETE FROM "Person"   WHERE "lastName" LIKE 'Audit%';
DELETE FROM "Aircraft" WHERE registration LIKE 'I-AUD%';
DELETE FROM "PprRequest" WHERE "submitterIp" = '203.0.113.191';
DELETE FROM "IdempotencyRecord" WHERE key LIKE 'audit-idem-%';
```

**File di lavoro** (fuori dal repo, in `/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/ops-audit/`): `f1-flightdate-tz.ts` (la prova di F1, rieseguibile con `npx tsx`), `login.sh`, `env.sh`, `mkfixtures.sh` e gli output JSON delle sonde. I tre cookie jar delle sessioni seed (`admin.jar`/`pilot.jar`/`student.jar`) sono stati **cancellati a fine audit**, insieme ai due tentativi abbandonati di configurazione vitest (vitest è confinato a `src/**`). Le sessioni corrispondenti restano tecnicamente valide fino alla scadenza del JWT: nessun segreto è mai stato scritto nel repo.

---

## 8. Riepilogo

| severità | # | findings |
|---|---|---|
| BLOCKER | 0 | — |
| MAJOR | 8 | F1 fuso orario della data volo · F2 doppia prenotazione persona/istruttore · F3 duplicazione e sovrapposizione voli · F4 approvazione senza ri-verifica persona · F5 tipo scadenza disattivato che blocca ancora · F6 `personId` non mascherato · F7 archiviazione velivolo senza tutele · F8 `personId` mai rinfrescato nel JWT |
| MINOR | 5 | F9 nessuna guardia temporale sulle transizioni · F10 «riapri» cancella l'audit · F11 `deleteExpiry` fisica · F12 corsa sul rate limit PPR · F13 clamp del contaore senza traccia |
| LOW | 4 | F14 durata minima e cicli a 0 · F15 durata prenotazione illimitata senza orari · F16 alert e KPI non filtrati · F17 tariffa retroattiva permanente + mezzanotte |

**Nessun BLOCKER**: le due invarianti su cui poggia tutto — un velivolo non ha due prenotazioni APPROVED sovrapposte, e nessun ledger operativo si cancella fisicamente — reggono, e reggono anche sotto concorrenza reale (§5.1). L'idempotenza, la numerazione PPR, l'RBAC operativo e la matrice di storno/correzione dei voli sono corretti e li ho verificati sul vivo.

Il filo conduttore degli 8 MAJOR è uno solo, e vale la pena dirlo perché suggerisce dove cercare il prossimo: **le guardie di questo dominio sono state scritte sul percorso di creazione e non replicate sui percorsi che portano allo stesso stato**. `createBooking` verifica la persona, `transitionBooking→APPROVED` no (F4). `createBooking` rifiuta il velivolo archiviato, `archiveAircraft` non guarda le prenotazioni (F7). La scansione dei documenti mancanti filtra `isActive`, quella degli scaduti no (F5). `roles` viene rinfrescato nel JWT, `personId` no (F8). La mascheratura azzera `instructorProfileId` dopo una review, `personId` no (F6). E dove una guardia non esiste affatto — sovrapposizione per persona, per istruttore, fra voli — non esiste in **nessuno** dei percorsi (F2, F3), che è l'unica forma di coerenza rimasta.
