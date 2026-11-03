# Review adversarial — Story 16.1 «Un solo calendario»

**Data**: 2026-09-10 · **Reviewer**: subagent Opus 5 xhigh (unico layer adversarial)
**Commit sotto review**: `1a57609` (feat, 13 file) + `7369abf` (Dev Agent Record + sprint-status)
**HEAD all'inizio della review**: `9272129` · **HEAD alla consegna**: `38f19c7` (sessioni parallele: story file 16.3/16.5/16.7 + sprint-status) · **Baseline ricognizione**: `738d399`
> `git diff --stat 7369abf..38f19c7 -- src/ prisma/ e2e/` è **vuoto**: tutti i commit intervenuti sono di sola documentazione, quindi arbitro, gates, probe e conclusioni di questa review valgono invariati sul HEAD di consegna.
**Contratto**: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 16.1» + §«Architettura e vincoli»
**Story file**: `_bmad-output/implementation-artifacts/16-1-un-solo-calendario.md`

---

## Verdetto

### SHIPPABLE-WITH-FIXES

Il contratto è rispettato: **11/11 AC verificati empiricamente**, non per lettura. La sostituzione è
esattamente quella prescritta (1 helper nuovo, 7 call-site, 2 funzioni private cancellate, 5 doc-comment,
0 migrazioni, 0 UI, 13 file), l'arbitro e2e è verde a conteggio invariato, e le 8 discriminanze dichiarate
sono **reali**: le ho riprodotte in modo indipendente in un worktree isolato, senza toccare il repo.

**Nessun difetto di codice trovato.** I 5 findings sono tutti di **verità documentale e di censimento** —
cioè esattamente la materia di AD-3 (i doc-comment che diventano falsi) e di P5/AC 8 (ogni occorrenza
classificata). Sono correggibili in un commit di review-fix da poche righe, senza toccare logica.

| # | Sev | Sostanza | File |
|---|---|---|---|
| MINOR-1 | minor | Il **sesto** doc-comment falsificato dalla story, nel posto più autorevole | `prisma/schema.prisma:971-972` |
| MINOR-2 | minor | Censimento AC 8: `pilots/page.tsx:55` è dominio Scadenze, non tariffe → finisce nel TD sbagliato | record §C + `src/lib/date-only.ts:39-40` |
| MINOR-3 | minor | `fleet/page.tsx:65` produce un **bordo di mese** (invariante [I-a] lo nomina), non solo un lookup tariffe — e il doc-comment nuovo si autocontraddice | record §C + `src/lib/date-only.ts:42-43` |
| LOW-1 | low | Un calendario in più **non coperto da nessuno dei 5 TD**: il fuso del PROCESSO nelle etichette di mese/anno | `billing/page.tsx:128`, `reports/page.tsx:58-59` |
| LOW-2 | low | AD-2 #7 (il collasso che rende vero P2) non ha guardia di valore, e la «prova» dichiarata in §D non prova quello | record §D + `instructor-compensation.service.test.ts:539` |

Nessuna decisione PO necessaria: nessun finding cambia il perimetro ratificato.

---

## Arbitro — suite e2e completa su DB fresco

DB `airmanager` verificato fresco prima del run (letture: 4 `Person`, 0 `Flight`, 0 `AccountMovement`,
2 `CashMovement` di seed; 0 residui `I-AUD%`/`Audit%`/`audit_%`/`203.0.113.191`).
`export JOBS_SECRET=local-dev-not-a-placeholder-0123456789abcdef` + `CI=1 scripts/e2e.sh start` (full suite,
detached). Esito letto **solo** con `scripts/e2e.sh status`, mai rilanciando:

```
state: DONE — E2E_EXIT=0
--- summary ---
  2 flaky
  522 passed (20.5m)
=== e2e end: 2026-09-10T19:59:24+02:00 ===
E2E_EXIT=0
```

**522 passed + 2 flaky + 0 failed + 0 skipped = 524 test, exit 0.**
Baseline di confronto (arbitro precedente su `b7b8d13`): 524 test, 523 passed + 1 flaky. **Conteggio
totale invariato** → la story non aggiunge spec e2e, come dichiara AC 11. I 3 skip METAR ambientali noti
non si sono verificati (aviationweather.gov raggiungibile), quindi 0 skipped invece di 3: differenza
d'ambiente, non di codice.

### Attribuzione dei 2 flaky (nessuno dei due tocca date o fusi)

| Flaky | Errore verbatim | Classe |
|---|---|---|
| `mobile-expiries-movements.spec.ts:888` | `apiRequestContext.post: read ECONNRESET` su `POST /api/v1/expiry-types` | reset di trasporto sotto carico, preesistente |
| `settings.spec.ts:133` | `expect(page).toHaveURL(/\/it\/dashboard$/)` → `http://localhost:3000/it/login`, timeout 5000ms | classe login-timeout preesistente |

**Escluso il lock anti-brute-force (TD-6)** come causa, con la misura invece dell'ipotesi:

```
SELECT coalesce(ip,'(null)'), succeeded, count(*) FROM "LoginAttempt"
WHERE "createdAt" > now() - interval '20 minutes' GROUP BY 1,2;
 ::1|t|613
 ::1|f|3
```

3 fallimenti nella finestra (i wrong-password deliberati di `login.spec.ts`) contro un cap di
`LOGIN_MAX_FAILED_PER_IDENTIFIER = 10` e `LOGIN_MAX_FAILED_PER_IP = 30`
(`src/server/auth/login-throttle.ts:25,33`): il throttle **non** ha morso. Entrambi i flaky sono passati
al retry.

---

## Findings

### MINOR-1 — Il sesto doc-comment: `prisma/schema.prisma:971-972` è ora FALSO

AD-3 elenca **cinque** doc-comment che diventano falsi e il dev li ha corretti tutti e cinque
(verificati uno per uno, sotto). Ne esiste un **sesto**, e sta nel posto che questo progetto tratta come
fonte unica della semantica di una colonna:

```prisma
prisma/schema.prisma:971-972
  /// Calendar-only date of the flight (`@db.Date`) — never in the future
  /// (enforced in the service against the server-clock UTC "today").
  flightDate     DateTime     @db.Date
```

Dopo `1a57609` la guardia confronta contro **«oggi» Europe/Rome**
(`flights.service.ts:763`), non contro il calendario UTC dell'orologio del server. La riga afferma il
contrario di quello che il codice fa, ed è **la definizione** della colonna che questa story ha cambiato
di significato.

Che sia il posto autorevole non è un'opinione mia: è la prassi scritta in casa —
`src/server/services/aircraft-status.ts:23-25` dice *«the semantics are written once in `schema.prisma`'s
doc-comment and are never re-interpreted here»*.

**Riproduzione / evidenza**

```
$ grep -rn "server-clock UTC\|server clock, UTC\|server UTC clock" --include=*.ts --include=*.prisma src prisma e2e
src/lib/date-only.ts:37:             * `@db.Date` calendar-only "today" (server clock, UTC calendar day) —   [CORRETTO: è vero]
prisma/schema.prisma:972:            /// (enforced in the service against the server-clock UTC "today").     [FALSO]
src/generated/prisma/models/Flight.ts:3811: * (enforced in the service against the server-clock UTC "today").  [copia generata]
e2e/cash-report.spec.ts:46 / e2e/billing.spec.ts:51 / e2e/my-compensation.spec.ts:123                      [fuori scope, TD 16.1-e]
```

**Costo del fix: una riga.** Nessuna migrazione — i `///` non producono DDL. La copia in
`src/generated/prisma/models/Flight.ts:3811` si rigenera da sola (`prisma generate` gira già dentro
`npm run gates`) e non entra nel commit: `src/generated/` è gitignored
(`git check-ignore -v` → `.gitignore:16:/src/generated/`).

---

### MINOR-2 — Il censimento classifica `pilots/page.tsx:55` come «lookup tariffe»: è dominio Scadenze, e così finisce nel TD sbagliato

Il doc-comment **scritto da questa story** in `src/lib/date-only.ts:37-46` enumera i consumatori residui
legittimi:

```
src/lib/date-only.ts:39-40
 * (story 16.1: scadenze/alert-job "oggi", 3 pagine di visualizzazione
 * tariffe, il default di un form).
```

Le pagine residue sono tre, ma **solo due** sono lookup di tariffe:

| Riga | Che cosa fa davvero |
|---|---|
| `src/app/[locale]/dashboard/page.tsx:295` | `getEffectiveRates(actor, allAircraftIds, todayDateOnlyUtc())` — tariffe ✓ |
| `src/app/[locale]/dashboard/fleet/page.tsx:65` | tariffe **+ un bordo di mese** (v. MINOR-3) |
| `src/app/[locale]/dashboard/pilots/page.tsx:55` | `listBlockingExpiriesByPerson(actor, ids, todayDateOnlyUtc())` — **dominio Scadenze**, nessuna tariffa |

`listBlockingExpiriesByPerson` (`src/server/services/expiries.service.ts:547-567`) usa quel «oggi» per
**due** calcoli di dominio: l'orizzonte `today + BLOCKING_FLAG_HORIZON_DAYS` (`:554`, 30 giorni) sui soli
`ExpiryType` con `blocksBooking: true` (`:556`), e il `daysUntil` di ogni riga
(`daysUntilUtc(row.expiresAt, today)`, `:563`).

Il Dev Agent Record §C ripete la classificazione della story (`dashboard/pilots/page.tsx:55` → *«idem»*,
cioè `getEffectiveRates`) e la manda in **TD 16.1-b** («visualizzazione, nessun effetto sul denaro»).
La sua casa è **TD 16.1-a** (dominio Scadenze e alert job), cioè la voce che la **story 16.4** raccoglierà.
Registrata in 16.1-b, questa riga resta orfana: 16.4 tocca le scansioni delle scadenze e non guarderebbe
un TD intitolato «tariffe».

**Effetto runtime** (dichiarato, non ipotizzato): nella finestra 00:00-02:00 Roma il flag dei documenti
bloccanti e il `daysUntil` della riga pilota su telefono sono di un giorno indietro — un documento scaduto
ieri-Roma risulta ancora valido. È **display**: la guardia che blocca davvero si data sul **giorno del
volo** (Roma), `bookings.service.ts:345`/`flights.service.ts:485`. La motivazione di §6 regge; è la
**collocazione del TD** a essere sbagliata.

**Fix**: correggere la riga del censimento in §C, spostare la voce in TD 16.1-a, e riscrivere
`date-only.ts:39-40` con l'enumerazione vera (2 pagine tariffe + 1 pagina documenti bloccanti + 1 default
di form + scadenze/alert-job).

---

### MINOR-3 — `fleet/page.tsx:65` produce un BORDO DI MESE su calendario UTC, e il doc-comment nuovo si autocontraddice

Dalla stessa riga che il censimento descrive come «lookup tariffe» escono **tre** valori:

```ts
src/app/[locale]/dashboard/fleet/page.tsx:65-74
  const today = todayDateOnlyUtc();
  const now = new Date();
  const monthStart = parseDateOnlyUtc(`${toDateOnlyString(today).slice(0, 7)}-01`);
  const [currentRatesById, reservedIds, monthMinutesById] = await Promise.all([
    getEffectiveRates(actor, ids, today),
    listReservedAircraftIds(actor, ids, now),
    sumFlightMinutesByAircraft(actor, ids, monthStart, today),
  ]);
```

`sumFlightMinutesByAircraft` (`src/server/services/aircraft.service.ts:723-736`) filtra
`flightDate: { gte: from, lte: to }` — e `flightDate` è un giorno **Roma**. Quindi una finestra UTC
interroga una colonna Roma.

**Misura** (`node`, eseguita ora):

```
instant            : 2026-08-31T22:30:00.000Z = 2026-09-01 00:30 Rome
UTC today          : 2026-08-31
fleet window used  : [2026-08-01 .. 2026-08-31]   <-- tutto AGOSTO
Rome-correct window: [2026-09-01 .. 2026-09-01]
```

Non è uno scarto di un giorno: alle 00:30 Roma del 1° del mese la barra **«Ore mese»** della card telefono
(`fleet-console.tsx:267`, label `messages/it.json:983`) somma **il mese precedente intero**.

E qui c'è una contraddizione interna allo stesso commit: il doc-comment nuovo dice, letteralmente, che
per un bordo di mese si usa l'helper Roma —

```
src/lib/date-only.ts:42-43
 * a month boundary), use `zoned-time.ts#todayDateOnlyUtcInZone` instead
```

— mentre il censimento della stessa story dichiara **legittima** una riga residua che calcola esattamente
un bordo di mese. L'invariante [I-a] nomina il caso per esteso: *«ogni «oggi», «giorno del volo»,
`effectiveDate` e bordo di mese si calcola in Europe/Rome»*.

Il **codice** è fuori scope per contratto (è `src/app`, UI, e P5 limita il censimento a `src/server`): non
chiedo di cambiarlo qui. Il deliverable è che **il TD dica la verità** — «bordo di mese e finestra di ore
volate su calendario UTC contro una colonna `flightDate` Roma: alla mezzanotte del 1° la barra mostra il
mese precedente» — invece di «visualizzazione, nessun effetto sul denaro».

---

### LOW-1 — Un calendario in più, non coperto da nessuno dei 5 TD: il fuso del PROCESSO

Due etichette formattano «adesso» **senza** opzione `timeZone`, cioè sul fuso del processo:

```
src/app/[locale]/dashboard/billing/page.tsx:128
  const monthLabel = new Intl.DateTimeFormat(displayLocale === 'en' ? 'en-IE' : 'it-IT', { month: 'long', year: 'numeric' }).format(new Date());

src/app/[locale]/dashboard/reports/page.tsx:58-59
  const monthLabel = new Intl.DateTimeFormat(intlLocale, { month: 'long', year: 'numeric' }).format(now);
  const yearLabel  = t('periodToggle.year', { year: now.getFullYear() });
```

Che in produzione il processo giri in UTC non è una mia congettura: è scritto in casa —
`src/lib/period-presets.ts:11` *«(Node's server clock is UTC in this environment)»*. Quindi le etichette
sono UTC mentre i numeri sotto sono delimitati su Roma: `billing/page.tsx:117` usa `currentMonthRange()`
(Roma), `reports/page.tsx:51` usa `getStats` (Roma via `zonedMidnightUtc`).

Conseguenza: alle 00:30 Roma del 1° del mese la pagina Prima nota **titola il mese precedente sopra i
numeri del mese nuovo**; a Capodanno l'etichetta d'anno di Statistiche dice l'anno vecchio.

Non è un difetto di questa story (preesistente, display-only, `src/app`, fuori dal perimetro P5) e non è
una regressione. È però **il terzo sistema di riferimento** (dopo Roma e UTC) e **nessuno dei cinque TD lo
copre**: 16.1-a è il dominio Scadenze, 16.1-b le tariffe/form, 16.1-c le 7 copie client di
`todayDateOnly()` (che sono UTC, non process-local), 16.1-d `romeDateParts`, 16.1-e gli helper e2e.
Va aggiunto — casa naturale 16.1-b o la 16.9.

---

### LOW-2 — AD-2 #7 non ha una guardia di valore, e la «prova» dichiarata in §D non prova quello

Il Dev Agent Record §D scrive:

> «`instructor-compensation.service.ts` non ha una riga in questa tabella: il collasso di AD-2 #7 è a
> **valore invariato** (non un fix di bug), e la prova è che i due unit esistenti al bordo
> (`instructor-compensation.service.test.ts:377-425`) restano verdi **senza essere toccati**».

Quei due test non esercitano `recordPayout`. Sono dentro
`describe('getCompensationSummary — mtd/ytd/total Rome-day boundaries (PR #17 lesson)')` e verificano
`variantBounds`, che prende «oggi» da `todayDateOnlyInZone` a `instructor-compensation.service.ts:181` —
una riga che questa story **non ha toccato** e che AD-2 dichiara esplicitamente fuori dai 7 call-site.

L'unica asserzione esistente sull'`effectiveDate` del payout è la **forma**, non il valore:

```
src/server/services/instructor-compensation.service.test.ts:539
  expect(movementArgs.data['effectiveDate']).toBeInstanceOf(Date);
```

**Prova empirica** (v. §«Discriminanze riprodotte»): nella simulazione pre-fix
`instructor-compensation.service.test.ts` è l'**unico** dei 7 file rimasto verde, **34/34**. Con la
semantica dell'helper riportata a UTC, `recordPayout` scriveva la data sbagliata e **nessun test si
accorgeva**.

La prova vera dell'equivalenza **esiste** e l'ha scritta il dev: `src/lib/zoned-time.test.ts:250`
(*«agrees with parseDateOnlyUtc(todayDateOnlyInZone(...)) — same value, collapsed formula (AD-2 #7)»*), ed
è ROSSA sul pre-fix. Il record cita la prova sbagliata.

**Fix**: correggere la frase in §D (citare `zoned-time.test.ts:250`). Opzionale, una riga: portare `:539`
al valore Roma con orologio finto — `recordPayout` è uno dei 7 call-site e oggi è il solo senza guardia di
valore.

---

## Osservazioni (non findings)

**O-1 — La matrice DST discrimina in 3 punti su 8, contro quanto dice la deviazione §F-3.**
La deviazione 3 motiva l'assenza di AC 6 dalla tabella guardia→discriminanza con *«non c'è un "prima
rotto" da riprodurre»*. È vero per `dateOnlyInZone` (già esatta prima della story), **falso** per la
seconda metà della matrice, quella che verifica l'helper nuovo: nella mia simulazione pre-fix i 3 istanti
in cui il giorno Roma ≠ giorno UTC diventano rossi —

```
× todayDateOnlyUtcInZone agrees with dateOnlyInZone at 'spring-forward: 00:00 Rome (CET)'
    expected '2026-03-28T00:00:00.000Z' to be '2026-03-29T00:00:00.000Z'
× todayDateOnlyUtcInZone agrees with dateOnlyInZone at 'fall-back: 00:00 Rome (CEST)'
× todayDateOnlyUtcInZone agrees with dateOnlyInZone at 'fall-back: 01:00 Rome (CEST)'
```

Rafforza la story: la matrice non è solo una verifica, è anche una guardia. Vale un rigo nel record.

**O-2 — La conversione parziale (TD 16.1-a) crea una cucitura fra `membership` (ora Roma) e `expiries`
(ancora UTC).** Un `Expiry` creato da `chargeMembershipFee` alle 00:30 Roma prende `expiresAt` sul giorno
Roma (`membership.service.ts:92,164`), ma `computeExpiryStatus` lo confronta con «oggi» UTC
(`expiries.service.ts:131`). Scarto massimo 1 giorno, in 1-2 ore, su una validità di 12 mesi, e su un
`ExpiryType` con `blocksBooking: false` (`membership.service.ts:143`): **non blocca nessuno e non tocca
denaro** — la motivazione di §6 regge per intero. Da nominare nel TD 16.1-a, perché è la cucitura che la
16.4 chiuderà.

**O-3 — `correctFlight` chiama l'helper due volte per richiesta** (`:763` via `resolveFlightInput` per la
guardia del volo nuovo, `:1477` per lo storno dell'originale), a millisecondi di distanza. Se la richiesta
attraversasse la mezzanotte Roma fra le due, i due valori differirebbero di un giorno — ed è **corretto
così**: sono risposte a due domande diverse («il volo è nel futuro?» e «quando avviene lo storno?»),
esattamente il contrario del caso che `ppr.service.ts:641-644` vieta (dove i due valori **devono** venire
dallo stesso istante). Pattern identico al pre-fix. Nessuna azione.

---

## «Verificato corretto» — quello che ho attaccato e che ha tenuto

### 1. AC 1 — un helper, sette call-site, nessun ottavo, nessuna seconda formula

```
$ grep -rn "todayDateOnlyUtcInZone" src --include=*.ts --include=*.tsx | grep -v "\.test\."
src/lib/zoned-time.ts:195                                          <- definizione (1)
src/lib/date-only.ts:42                                            <- doc-comment, non codice
src/server/services/flights.service.ts:6,763,1341,1477             <- 3 call-site
src/server/services/cash.service.ts:4,422                          <- 1
src/server/services/accounts.service.ts:6,654                      <- 1
src/server/services/membership.service.ts:5,92                     <- 1
src/server/services/instructor-compensation.service.ts:4,482       <- 1
                                                                      = 7 call-site esatti

$ grep -rn "function todayDateOnlyUtc" src        -> solo date-only.ts:47 (la canonica) + zoned-time.ts:195
                                                     ZERO copie private residue
$ grep -rn "parseDateOnlyUtc(todayDateOnlyInZone" src -> solo zoned-time.ts:196 (il corpo dell'helper)
```

`APP_TIMEZONE = 'Europe/Rome'` (`src/lib/time.ts:9`), costante, non da env.

### 2. AD-4 — le due asserzioni esatte sono state RIALLINEATE, non indebolite

`flights.service.test.ts:1584` (cancelFlight) e `:1886` (correctFlight): il `toHaveBeenCalledWith` resta
**esatto sull'oggetto `data` completo** (`accountId`, `type`, `amountCents`, `reversalOfId`, `flightId`,
`effectiveDate`, `description`, `actorUserId`), cambia solo la sorgente del valore atteso da
`todayDateOnlyUtc()` a `todayDateOnlyUtcInZone(APP_TIMEZONE)`. **Nessun `objectContaining`, nessun
`expect.any`** ha preso il posto di un'uguaglianza. I due discriminanti nuovi (`:1594`, `:1896`) usano
`objectContaining` ma pinnano il **letterale** `parseDateOnlyUtc('2026-09-01')` — cioè aggiungono
l'asserzione di valore che le due esatte, calcolando l'atteso con la stessa funzione della produzione, non
possono dare. È la disciplina giusta.

### 3. Le 8 discriminanze sono REALI — riprodotte in modo indipendente

Non mi sono fidato della tabella §D. Ho creato un **worktree isolato** (`git worktree add --detach`, mai il
repo di lavoro) e ho simulato il pre-fix con **una** modifica semantica: il corpo di
`todayDateOnlyUtcInZone` riportato al calendario UTC. Una riga che riverte i sette call-site insieme.

```
$ npx vitest run --maxWorkers=1  <i 7 file>
 ❯ src/server/services/flights.service.test.ts   (157 tests | 4 failed)
 ❯ src/server/services/accounts.service.test.ts  ( 81 tests | 1 failed)
 ❯ src/lib/zoned-time.test.ts                    ( 58 tests | 6 failed)
 ❯ src/server/services/membership.service.test.ts( 16 tests | 2 failed)
 ❯ src/lib/date-only.test.ts                     ( 15 tests | 1 failed)
 ❯ src/server/services/cash.service.test.ts      ( 73 tests | 1 failed)
   src/server/services/instructor-compensation.service.test.ts (34 tests | 0 failed)  <- v. LOW-2
 Test Files  6 failed | 1 passed (7)
      Tests  15 failed | 419 passed (434)
```

Corrispondenza uno-a-uno con la tabella §D:

| §D | Test rosso nella mia simulazione | Errore |
|---|---|---|
| D1 | `accepts a flight that took off 00:10 Rome … (CEST, summer)` | rifiutato `FLIGHT_DATE_IN_FUTURE` |
| D2 | `… (CET, winter)` | idem |
| D3 | `cancelFlight` → `story 16.1, AC 4 … NEW (Roma) month` | atteso `2026-09-01`, ricevuto `2026-08-31` |
| D4 | `correctFlight` → idem | idem |
| D5 | `accounts` → `the ADJUSTMENT is dated on the NEW (Roma) month` | idem |
| D6 | `cash` → `the reversal is dated on the NEW (Roma) month` | idem |
| D7 | `membership` AC 4 | idem |
| D8 | `membership` AC 5 | `Quota associativa 2026` invece di `2027`, `2026-12-31` invece di `2027-01-01` |
| — | +6 sull'helper stesso e sulla divergenza voluta (attesi: ho rotto l'helper) | |

Worktree rimosso; **repo di lavoro byte-identico a HEAD**, verificato:

```
OK   src/lib/zoned-time.ts                                aae1d36c4a0bd2df
OK   src/lib/date-only.ts                                 168b3e00dd1410da
OK   src/server/services/flights.service.ts               942b90e181863f00   <- = sha256 dichiarato in §D
OK   src/server/services/accounts.service.ts              7ebb320eb98b7cd4   <- = §D
OK   src/server/services/cash.service.ts                  a47626a5b92cc276   <- = §D
OK   src/server/services/membership.service.ts            a2c1606d0dd0f1d0   <- = §D
OK   src/server/services/instructor-compensation.service.ts 3050b3add85e6f1a
$ git status --short -- src/ prisma/ e2e/ _bmad-output/   ->  (vuoto)
```

I quattro sha256 che il dev dichiara in §D **coincidono** con quelli che misuro io su HEAD: la sua
dichiarazione di ripristino byte-identico è vera, non asserita.

### 4. Matrice DST — la mia è più larga di quella richiesta, e passa

Probe indipendente (18 casi, fuori dal repo): 00:30 / 01:30 / 03:30 Roma su **entrambi** i giorni di
transizione 2026, l'ora ripetuta del 25/10 in **entrambi** i passaggi (02:30 CEST e 02:30 CET, cioè
`2026-10-25T00:30Z` e `T01:30Z`), i bordi `23:59:59.999`, il giorno dopo la transizione, il bordo di mese
e il bordo d'anno. Per ognuno verifico **cinque** cose: la data-only Roma dell'helper, la mezzanotte UTC
esatta (invariante [I-d]), l'accordo con `todayDateOnlyInZone`, l'accordo con `dateOnlyInZone` sullo
stesso istante, e che `todayDateOnlyUtc()` continui a dire il giorno **UTC** (divergenza deliberata
preservata).

```
Tests  18 passed (18)
```

I due bordi patologici sono coperti **per costruzione**: l'ora che non esiste (02:00-03:00 del 29/03) non
è rappresentabile come istante e il probe la attraversa con `T01:00Z`→03:00 e `T01:30Z`→03:30; l'ora
ripetuta del 25/10 è esercitata **due volte**, ai due istanti UTC distinti che mappano sullo stesso wall
clock.

### 5. Indipendenza dal fuso del PROCESSO (la produzione gira in UTC)

Lo stesso probe sotto cinque fusi di processo:

| TZ del processo | Esito |
|---|---|
| `Europe/Rome` (host) | 18 passed |
| `UTC` | 18 passed |
| `America/Los_Angeles` | 18 passed |
| `Pacific/Kiritimati` (+14) | 18 passed |
| `Asia/Kolkata` (+05:30) | 18 passed |

Gli helper dipendono **solo** dall'istante, mai da `TZ`. La trappola di §5 (*«se un test passa solo con
`TZ=Europe/Rome`, è scritto male»*) non è scattata.

### 6. AC 10 — catena di import pulita, test verdi senza env

`src/lib/time.ts` e `src/lib/date-only.ts` **non importano nulla** (`grep '^import'` → 0 righe);
`src/lib/zoned-time.ts` importa **solo** `@/lib/date-only`. Nessun ciclo, nessuna catena verso
`@/lib/env` (la classe alla terza occorrenza di CLAUDE.md è strutturalmente assente qui). Verificato,
non assunto — ogni file toccato in shell spogliata (`env -u DATABASE_URL -u AUTH_SECRET -u JOBS_SECRET -u AUTH_URL`):

```
src/lib/zoned-time.test.ts                                   58 passed
src/lib/date-only.test.ts                                    15 passed
src/server/services/flights.service.test.ts                 157 passed
src/server/services/accounts.service.test.ts                 81 passed
src/server/services/cash.service.test.ts                     73 passed
src/server/services/membership.service.test.ts               16 passed
src/server/services/instructor-compensation.service.test.ts  34 passed   (non toccato, invariato)
```

### 7. Gates — rieseguiti da me, non creduti

```
PASS  lint (33s)
PASS  typecheck (4s)
PASS  test (10s) — Tests  1849 passed (1849)
PASS  build (33s)
```

**1849** = esattamente il numero dichiarato in §J. Il +30 rispetto ai 1819 di `b7b8d13` torna riga per
riga: 21 in `zoned-time.test.ts` (5 helper + 8 + 8 matrice), 1 in `date-only.test.ts`, 4 in
`flights.service.test.ts`, 1 accounts, 1 cash, 2 membership.

### 8. Invariante [I-b] (append-only) — nessuna riga ridatata, e la misura vale oltre questo DB

Nel diff di `1a57609`: **zero** `update`/`updateMany`/`delete`/`deleteMany`/`$executeRaw` su
`AccountMovement`/`CashMovement` (grep sulle sole righe aggiunte: i due soli match sono `queryRaw.mock…`
nei test). **Zero** file sotto `prisma/`. 13 file di codice, tutti in `src/`.

Misura **in sola lettura** sul DB di carico `airmanager_load` (mai scritto):

```
AccountMovement/ADJUSTMENT+REVERSAL | tot 16125 | "slittate" 10
CashMovement/storni                 | tot     0 | 0
InstructorPayout                    | tot  2254 | -

righe create nella finestra 00:00-02:00 Roma:
AccountMovement  0 su 104612
CashMovement     0 su  31421
```

Le 10 «slittate» sono artefatti del seeding (`effectiveDate` assegnata indipendentemente da `createdAt`):
**nessuna** riga del corpus è stata creata nella finestra di esposizione, quindi non esiste una riga reale
da ridatare. La conclusione P3 («zero righe da ridatare») tiene anche su un corpus di 136.000 movimenti,
non solo sul DB vuoto che il dev ha misurato (0 su 0, §B AC 7).

### 9. Nessun ottavo writer di «oggi» — censimento incrociato per COLONNA, non per grep

I quattro grep dell'AC 8 li ho riprodotti tutti e coincidono col record §C (grep 1: 10 consumatori residui;
grep 2: 23 righe grezze / 22 usi; grep 3: 6 righe; grep 4: tutte pre-esistenti). Ma un grep per *nome di
funzione* può mancare un writer che compone la data in un altro modo, così ho attaccato dal lato opposto —
**dalle colonne**:

- tutte le `@db.Date` dello schema (19 dichiarazioni, `grep -n "@db.Date" prisma/schema.prisma`);
- tutti i `.create` sui modelli che le portano.

Esito: i writer di «oggi» sono **7 e solo 7**. Tutti gli altri prendono la data dal chiamante
(`recordTopUp`, `recordCashMovement`, `people.service.ts:511` `parseDateOnlyUtc(expiry.expiresAt)`,
`instructor-rates`/`rates` `validFrom`, `expiries.service.ts:226`) o da un istante specifico
(`ppr.service.ts:655` da `closedAt`, `flights.service.ts:1035` da `params.flightDate`).
Due modelli con una `effectiveDate`/`noteDate` propria — `HourPackage` (`schema.prisma:862`) e
`TrainingNote.noteDate` (`:246`) — **non hanno nessun writer** in `src/server`: nessun buco nascosto lì.

Cercati e **non trovati** i due generi che un grep su `new Date()` non vede:
- getter **locali** su un «adesso» (`getFullYear`/`getMonth`/`getDate`/`getHours`/`getDay`) in
  `src/server` e `src/lib`: **0 occorrenze**;
- `Date.now()` confrontato con una data-only: 13 occorrenze, **tutte** confronti fra istanti su colonne
  `DateTime` (throttle, TTL di token, `startsAt`, cache METAR).

### 10. Nessun testo di contratto falsificato

`src/lib/schemas/registry.ts` non documenta mai «oggi UTC» né per `effectiveDate` (`:813`, `:846`, `:908`
parlano solo di filtri inclusivi e di ordinamento) né per la guardia del volo (`:976` dice «future date»
senza nominare un calendario). Nessuna modifica a OpenAPI/registry era dovuta, e infatti non ce n'è.
`messages/it.json:1169`/`en.json:1169` non menzionano un fuso.

### 11. I cinque doc-comment di AD-3: corretti e ora VERI (letti uno per uno)

| Riga | Verifica |
|---|---|
| `flights.service.ts:545-548` | dice ora *«"today" is ALSO the Europe/Rome calendar day now, story 16.1»* e conserva il motivo del difetto ✓ |
| `flights.service.ts:1292-1294` | *«`effectiveDate` = today Europe/Rome date-only (story 16.1), NOT the flight's own date»* — la seconda metà, che AD-3 ordinava di conservare, **è conservata** ✓ |
| `accounts.service.ts:576-579` | *«the aviosuperficie's own Europe/Rome calendar date (story 16.1)»* ✓ |
| `cash.service.ts:369-372` | *«always today, the aviosuperficie's own Europe/Rome calendar date»* + *«never backdated to the original's date»* conservato ✓ |
| `date-only.ts:37-46` | dice dove resta legittima e rimanda all'helper Roma — **richiesta letterale dell'ops-audit §F1 soddisfatta** ✓ (con l'imprecisione di MINOR-2/MINOR-3 nell'enumerazione) |
| `flights.service.test.ts:530` (titolo) | *«after today (Europe/Rome calendar, story 16.1)»* ✓ |

Non falsificati, verificati: `expiry-status.ts:6,11-12` (i suoi chiamanti passano ancora
`todayDateOnlyUtc()`: `expiries.service.ts:94,372,373,563`, `expiry-alerts.service.ts:124`),
`expiry-alerts.service.ts:17`, `instructor-compensation.service.ts:78-84`, `aog-impact.ts:74-82`,
`accounts.service.ts:75`, `cash.service.ts:283`, `people.service.ts:109`, `rates.service.ts:8`,
`period-presets.ts:1-15`, `schema.prisma:1386-1390` e `:1748-1749`.

### 12. `membership.service.ts:92` — una riga, quattro usi, tutti coerenti

`today = todayDateOnlyUtcInZone(APP_TIMEZONE)` alimenta `paymentYear` (`:93`, `getUTCFullYear()` su una
mezzanotte-UTC del giorno **Roma** = l'anno Roma ✓), `effectiveDate` (`:135`), il confronto con la scadenza
esistente (`:154`) e `addMonthsClampUtc(today, 12)` (`:166`, con `addMonthsClampUtc(base, …)` a `:158` sul rinnovo; aritmetica di calendario pura su una
mezzanotte UTC, invariata come prescritto). `FIXED_TODAY` (`membership.service.test.ts:89`) **intatto**; il
`describe` nuovo si appoggia agli hook di file (`beforeEach` `useFakeTimers` `:91-92`, `afterEach`
`useRealTimers` `:119-121`) → nessuna contaminazione dei test vicini, che è la trappola di §5.

### 13. `ppr.service.ts:655` e `instructor-compensation.service.ts:181` correttamente NON convertiti

Il primo è il giorno Roma di `closedAt`, non «oggi», e il suo doc-comment (`:641-644`) spiega perché deve
venire da **quello** istante; il secondo delimita un report. Nessuno dei due appare in `git diff`.
Confermato AD-2.

### 14. Concorrenza — non applicabile, e dico perché

Il diff cambia **il valore di un campo** dentro transazioni che esistevano già: nessun lock, nessun ordine
di lock, nessuna guardia di unicità, nessuna finestra di transazione toccata. Il catch P2002 su
`reversalOfId` di `cancelFlight` è byte-identico. Non c'è logica di overlap/idempotenza in questa story su
cui far correre richieste concorrenti; l'avrei fatto se il diff avesse spostato una riga dentro o fuori da
una `$transaction`, e non lo fa.

---

## Prove sull'API reale (build di produzione, DB reale)

Server di produzione avviato una volta sulla build dei gates (`npm run start`, :3000), probe guidate con
`playwright-core` (il Playwright MCP non è disponibile ai subagent su questa macchina). Fixture create dal
reviewer, prefisso `rvw161_`.

**Limite dichiarato, non nascosto**: le probe sono girate alle **20:03 Roma = 18:03 UTC**, quando il giorno
Roma e il giorno UTC **coincidono**. La discriminanza della guardia richiede per costruzione un istante in
`[00:00 Roma, 00:00 UTC)` e **non si può fabbricare falsificando l'orologio del server** da un client
HTTP. La copertura discriminante è, correttamente, quella unit (§3). Quello che l'API prova comunque è che
la data **memorizzata** è il giorno Roma, e non un giorno UTC — e questo si può dimostrare anche a
mezzogiorno, scegliendo un **istante di decollo** il cui giorno UTC differisce dal giorno Roma.

### Le due righe che valgono la review (SQL, non risposte HTTP)

```
     registration     |  takeoff (UTC naive) |   takeoff Rome   |   landing Rome   | takeoff UTC day | stored flightDate | status
----------------------+----------------------+------------------+------------------+-----------------+-------------------+-----------
 I-RVW161178906342504 | 2026-09-09 21:30:00  | 2026-09-09 23:30 | 2026-09-10 00:20 | 2026-09-09      | 2026-09-09        | CANCELLED
 I-RVW161178906342504 | 2026-09-09 22:30:00  | 2026-09-10 00:30 | 2026-09-10 01:10 | 2026-09-09      | 2026-09-10        | REGISTERED
```

- **Riga 1 = la forma esatta di P1**: decollo 23:30 Roma, atterraggio **00:20 Roma del giorno dopo**. Volo
  **accettato** (201), e datato sul giorno del **decollo** (`2026-09-09`): un volo che attraversa la
  mezzanotte Roma non si spezza in due giornate.
- **Riga 2 = la prova del calendario**: l'istante di decollo `2026-09-09T22:30:00Z` ha giorno **UTC**
  `2026-09-09` e giorno **Roma** `2026-09-10`. La colonna memorizzata è **`2026-09-10`** — il giorno Roma.
  È un volo *già atterrato* nella finestra 00:00-02:00 Roma, ed è stato **accettato**: nessun
  `FLIGHT_DATE_IN_FUTURE`.

### Il resto della matrice

| Probe | Richiesta | Esito |
|---|---|---|
| C (non-regressione) | `POST /flights`, decollo `2026-09-10T22:30Z` = **00:30 Roma dell'11/09**, cioè domani-Roma | **422 `FLIGHT_DATE_IN_FUTURE`** ✓ la guardia non è stata smontata |
| cancelFlight | `POST /flights/{id}/cancel` sulla riga 1 | 200; storno scritto (sotto) |
| D | `POST /people/{id}/account/adjustments` | 200 |
| E | `POST /cash-movements` (`effectiveDate` `2026-09-02` dal chiamante) + `POST /cash-movements/{id}/reverse` | 200 |
| F | `POST /people/{id}/membership-fee` | 200 |
| G | `POST /people/{id}/account/adjustments` come **PILOTA** | **403** ✓ |
| G2 | `POST /flights` come **PILOTA** | **403** ✓ |

Le `effectiveDate` scritte, lette in SQL (Roma «oggi» = `2026-09-10`):

```
          type          | amountCents |                         description                          | effectiveDate
------------------------+-------------+--------------------------------------------------------------+---------------
 FLIGHT_CHARGE          |       -7500 | Volo I-RVW161… 2026-09-09 — 0:50                             | 2026-09-09   <- il giorno del VOLO
 FLIGHT_CHARGE          |       -6000 | Volo I-RVW161… 2026-09-10 — 0:40                             | 2026-09-10   <- il giorno del VOLO (Roma)
 FLIGHT_CHARGE_REVERSAL |        7500 | Storno volo I-RVW161… 2026-09-09 — rvw161_storno_volo        | 2026-09-10   <- OGGI, non il giorno del volo
 ADJUSTMENT             |       -1234 | rvw161_rettifica                                             | 2026-09-10
 ADJUSTMENT             |       -5000 | Quota associativa 2026                                       | 2026-09-10

 CashMovement rvw161_cassa   +4321  effectiveDate 2026-09-02   (dal chiamante)
 CashMovement rvw161_storno  -4321  effectiveDate 2026-09-10   (OGGI, mai retrodatato all'originale)
```

L'ultima coppia chiude l'incoerenza che §2 della story denunciava a occhio nudo: l'addebito è datato sul
giorno del volo, il suo storno su «oggi», e **ora i due «oggi» sono lo stesso calendario**.

### RBAC

Lo story non tocca autorizzazione (nessuna riga di `rbac`/`authorize` nel diff). Controllo di
non-regressione sui due percorsi che ho esercitato: PILOTA → **403** su `account/adjustments`
(`finance.manage`, ADMIN-only dalla 14.9) e **403** su `POST /flights` (`flights.manage`). Coerente con la
matrice post-14.9: ADMIN è l'unica figura amministrativa. La copertura RBAC piena dei quattro ruoli è nella
suite e2e, verde sopra.

---

## Fix richiesti (per il commit di review-fix della sessione principale)

1. **MINOR-1** — `prisma/schema.prisma:971-972`: sostituire *«against the server-clock UTC "today"»* con
   *«against the Europe/Rome calendar "today" (story 16.1)»*. Una riga. Nessuna migrazione. `src/generated`
   si rigenera nei gates e non entra nel commit.
2. **MINOR-2** — `src/lib/date-only.ts:39-40`: correggere l'enumerazione (`pilots/page.tsx:55` non è una
   pagina di tariffe, è il flag dei documenti bloccanti). Record §C: correggere la riga
   `dashboard/pilots/page.tsx:55` da *«idem»* a *«`listBlockingExpiriesByPerson` — dominio Scadenze»* e
   spostarne il TD da **16.1-b** a **16.1-a**.
3. **MINOR-3** — Record §C: la riga `fleet/page.tsx:65` deve dire che da lì escono anche `monthStart` e la
   finestra di `sumFlightMinutesByAircraft`, con la misura (alle 00:30 Roma del 1° la barra «Ore mese»
   somma il mese precedente intero). Il testo di **TD 16.1-b** va aggiornato di conseguenza: non è
   «visualizzazione tariffe», è un **bordo di mese** su una colonna Roma, che l'invariante [I-a] nomina.
4. **LOW-1** — Aggiungere al TD (16.1-b o 16.9) le etichette process-local: `billing/page.tsx:128`,
   `reports/page.tsx:58-59` (`Intl` senza `timeZone` e `getFullYear()` su un `now`), con la nota che
   `period-presets.ts:11` dichiara il server in UTC.
5. **LOW-2** — Record §D: sostituire la prova citata per AD-2 #7 con `zoned-time.test.ts:250` (quella vera).
   Opzionale, una riga: portare `instructor-compensation.service.test.ts:539` da `toBeInstanceOf(Date)` al
   valore Roma sotto orologio finto.
6. **O-1** (facoltativo) — Record §F deviazione 3: precisare che la **seconda metà** della matrice DST
   discrimina in 3 punti su 8 (misurato in questa review).
7. **O-2** (facoltativo) — TD 16.1-a: nominare la cucitura `membership` (Roma) ↔ `expiries` (UTC), con la
   ragione per cui è innocua (`blocksBooking: false`).

Nessuno di questi fix tocca logica di dominio: dopo il commit di review-fix i gates devono restare a
**1849** unit (o **1850** con l'asserzione opzionale di LOW-2) e la suite e2e non va rieseguita — nessun
percorso runtime cambia.

---

## Residuo lasciato dal reviewer (da pulire prima della prossima misura «pulita» sul DB e2e)

DB `airmanager` (il DB e2e). Fixture del reviewer, prefisso `rvw161`/`I-RVW161`:

| Oggetto | Conteggio | Come si trova |
|---|---|---|
| `Aircraft` | 2 | `registration LIKE 'I-RVW161%'` |
| `AircraftRate` | 2 | sui due velivoli sopra |
| `Person` | 2 | `"firstName" = 'rvw161'` |
| `Flight` | 2 | sui due velivoli (1 `CANCELLED`, 1 `REGISTERED`) |
| `AccountMovement` | 8 | sui conti delle due persone (top-up, 2 `FLIGHT_CHARGE`, 1 `FLIGHT_CHARGE_REVERSAL`, 2 `ADJUSTMENT` `rvw161_rettifica`, quota) |
| `CashMovement` | 2 | `description LIKE 'rvw161%'` (1 movimento + il suo storno) |
| `Expiry` | 1 | quota associativa della persona del secondo run |

Due velivoli e due persone perché il primo run della probe si è fermato a metà (bug mio nella lettura di
`GET /cash-categories`, che restituisce un array e non `{items}`), ed è stato ripetuto per intero.
**Nessuna riga preesistente è stata modificata o cancellata**; nessun `UPDATE`/`DELETE` è mai stato emesso
contro `AccountMovement`/`CashMovement`. `airmanager_load` è stato solo **letto**.

Residuo **non mio**, lasciato dalla suite e2e appena girata (rilevante per chi registrerà un volo a mano su
questo DB): **8 `ExpiryType` con `blocksBooking = true` e `isActive = true`**, per cui ogni nuova persona
senza documenti viene rifiutata con `FLIGHT_BLOCKED_BY_EXPIRY` (è quello che ha fatto fallire le mie prime
due probe, risolto con `force: true`). Totali del DB dopo il run: 195 `Aircraft`, 396 `Person`.

Reset consigliato prima della prossima story che misuri conteggi sul DB e2e (comandi dal task, `docker
compose down -v` **non** eseguito).

## Stato della macchina alla consegna

- **:3000** — libero. Il server di produzione avviato per le probe è stato terminato **per PID**
  (`next-server` pid 260751, letto da `ss -ltnp`), mai con `pkill`. Verificato: `port 3000 free`.
- **:5432 / :1025 / :8025** — Postgres e Mailpit in Docker, su e healthy (non toccati).
- **Repo** — pulito: `git status --short -- src/ prisma/ e2e/ _bmad-output/` vuoto; i 7 file di produzione
  byte-identici a HEAD (sha256 sopra). Il worktree temporaneo è stato rimosso (`git worktree list` → solo
  `/home/admin/AirManager`). Nessun file creato dentro il repo.
- **Artefatti fuori dal repo** (scratchpad di sessione): probe DST (`dst-matrix.probe.test.ts` +
  `vitest.probe.config.mjs`), probe API (`api-probe.mjs`, `cancel-probe.mjs`), log della simulazione
  pre-fix (`prefix-run.log`), log del server (`server.log`).
- **Log e2e** — `/tmp/airmanager-e2e/last-run.log`, chiuso con `E2E_EXIT=0`. **La suite non è stata
  rieseguita** per leggerne l'esito.
