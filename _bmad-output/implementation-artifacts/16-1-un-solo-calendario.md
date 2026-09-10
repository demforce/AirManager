---
baseline_commit: 4c45753
---

# Story 16.1: Un solo calendario — «oggi» del volo e data valuta dei movimenti in Europe/Rome

Status: **ready-for-dev** — 2026-09-10. **Modello dev**: **Sonnet 5 xhigh (backend puro)** — questa story non tocca una riga di UI (v. §6: le 7 copie client di `todayDateOnly()` sono fuori scope DICHIARATO, ed è proprio quel confine che tiene la story su Sonnet). Review: **Opus 5 xhigh adversarial**, come sempre.

> ⚠️ **Baseline**: `4c45753` è il HEAD su cui **ho misurato e riverificato** ogni `file:riga` di questo file. I due report d'audit citano righe misurate su `b7b8d13`: **le ho riverificate tutte** e la tabella §A dice quali sono slittate (una sola: `dashboard/billing/page.tsx` 116 → 117). Se il dev parte da un HEAD più avanzato, rilegge le righe citate e **corregge questo file** dove sono slittate — la prassi ha pagato in tutte le story dell'epic 15 e in AOG-1b.
>
> **Da leggere PRIMA di scrivere una riga**: `_bmad-output/planning-artifacts/audit-2026-09-10/ops-audit.md` §F1 e l'invariante §[I-5]; `_bmad-output/planning-artifacts/audit-2026-09-10/ledger-audit.md` §MAJOR-3; la sezione «Story 16.1» e «Architettura e vincoli» di `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` (**contratto**, gli AC di record). Skill obbligatoria: `.claude/skills/karpathy-guidelines/SKILL.md` (questa story è **chirurgia**: 8 righe di produzione cambiate, non un rifacimento del tempo).

---

## Story

As **lo staff che registra un volo appena atterrato o una rettifica dopo mezzanotte**,

I want che l'app giudichi **«oggi»** e la **data valuta** col calendario dell'aviosuperficie (Europe/Rome),

so that fra le 00:00 e le 02:00 un volo **già atterrato** non sia rifiutato come «nel futuro», e una rettifica non finisca nel **mese contabile precedente** — quello per cui il report è già stato tirato.

### Il perché: due lati dello stesso `>` in due sistemi di riferimento

Il difetto non è «un fuso sbagliato». È **un confronto fra due calendari diversi**, e vive in una riga sola:

```ts
// src/server/services/flights.service.ts:760-763
const flightDate = deriveFlightDate(input.takeoffAt);   // <-- giorno CALENDARIO ROMA del decollo
if (flightDate.getTime() > todayDateOnlyUtc().getTime()) {   // <-- "oggi" UTC
  throw new ValidationError('Flight date cannot be in the future.', undefined, 'FLIGHT_DATE_IN_FUTURE');
}
```

Il lato sinistro **è già Roma** e lo è per scelta esplicita (`deriveFlightDate`, `:478-486`, doc-comment: *«il giorno ROMA, non UTC»*). Il lato destro avanza alle 00:00 **UTC**, cioè **un'ora dopo in CET e due in CEST**. Nella finestra fra i due mezzanotte, il giorno Roma è già domani e «oggi» è ancora ieri: un volo decollato alle 00:10 e atterrato alle 00:20 di Roma prende **422 `FLIGHT_DATE_IN_FUTURE`** — e la `$transaction` non viene nemmeno aperta.

La **stessa** discrepanza, sugli **stessi due helper**, data i movimenti: cinque writer stampano `effectiveDate` col calendario UTC, due col calendario Roma, e **tutti gli aggregati che li rileggono** delimitano il periodo su Roma (`currentMonthRange`, `period-presets.ts:43-48`). Dentro un singolo volo l'incoerenza è visibile a occhio nudo: **l'addebito è datato sul giorno Roma** (`flights.service.ts:1033`, `params.flightDate`) e **il suo storno sul giorno UTC** (`:1338`).

### Fatti misurati che vincolano il design

| Fatto | Misura (su `4c45753`) | Conseguenza |
|---|---|---|
| Il difetto è **riproducibile sulle funzioni reali** | probe vitest, 3 test rossi / 2 verdi: v. §2 AC 2 per l'output verbatim | la story ha una **discriminanza già scritta**, non da inventare |
| «Oggi» ha **due implementazioni** in `src/lib` | `todayDateOnlyUtc` (`date-only.ts:37-40`) e `todayDateOnlyInZone` (`zoned-time.ts:176-178`) | non serve una terza formula: serve **un** helper che le componga |
| I writer di `effectiveDate` sono **13 `create`**, ma i writer di **«oggi»** sono **7** | censimento completo in §3; 5 UTC + 2 Roma; i restanti 6 non datano «oggi» (data dal chiamante, o `flightDate`) | il perimetro è **7 call-site**, non «tutto il ledger» |
| Esistono **2 copie private** di `todayDateOnlyUtc` nei service | `accounts.service.ts:705-709`, `cash.service.ts:286-290` — ciascuna con **un solo** consumatore | dopo il fix diventano **orfane**: si cancellano (karpathy §3, «rimuovi gli orfani che le TUE modifiche hanno creato») |
| Il calendario Roma **corretto** esiste già in produzione ed è testato | `instructor-compensation.service.ts:482` = `parseDateOnlyUtc(todayDateOnlyInZone(APP_TIMEZONE))`, con **due unit al bordo** già verdi (`instructor-compensation.service.test.ts:377-425`, orologi `2026-12-31T23:30Z` e `2026-07-22T22:30Z`) | esiste un **precedente interno misurato**: si generalizza quello, non si inventa |
| L'idioma dell'orologio fisso è **già in casa** | `vi.useFakeTimers()` + `vi.setSystemTime()`: 4 file lo usano (`login-throttle`, `instructor-compensation`, `ppr`, `membership`) | zero infrastruttura di test nuova |
| Il DST è **già risolto e testato** | `zonedMidnightUtc` (doppia correzione, `zoned-time.ts:20-38`) con `zoned-time.test.ts` sui due giorni 2026; e `dateOnlyInZone` è esatto agli 8 bordi (probe, §2 AC 6) | la matrice DST è una **verifica**, non un algoritmo nuovo |
| Le righe storiche da ridatare sono **zero** su questo DB | `AccountMovement` ADJUSTMENT+REVERSAL: **0 slittate su 36**; `CashMovement` storni: **0 su 3** (query in §2 AC 7, eseguita 2026-09-10) | la deviazione «non ridatiamo» si dichiara **con un numero**, e il numero è 0 |

---

## §0 — Requisiti FISSI (contratto: piano epic 16-18, sezione «Story 16.1» + «Architettura e vincoli»)

| # | Requisito (dal piano — **AC di record**) |
|---|---|
| **P1** | Volo decollato 23:30 Roma, atterrato 00:20 Roma, registrato alle 00:30 Roma → **accettato**, nessun `FLIGHT_DATE_IN_FUTURE`. Il confronto usa la **data-only Roma su entrambi i lati**. |
| **P2** | I writer che oggi datano `effectiveDate` in UTC, scrivendo alle 00:30 Roma del 1° del mese, producono **il 1° del mese Roma**. I **sette** writer condividono **UN** helper. **Nessuna seconda formula.** |
| **P3** | I movimenti già scritti **NON vengono ridatati** (ledger append-only). La deviazione storica è **dichiarata con il conteggio**. |
| **P4** | Sui giorni di cambio ora **2026-03-29** e **2026-10-25**, ai bordi **00:00 / 01:00 / 02:00 / 03:00 Roma**, data del volo, «oggi» e `effectiveDate` **coincidono**. Un test **discriminante** riproduce il rifiuto pre-fix e diventa verde. |
| **P5** | Ogni occorrenza in `src/server` che produce una **data-only** è **classificata** (Roma corretto / UTC legittimo / da convertire), come fu per l'invariante `[a]` dell'AOG. |

| # | Invariante (da «Architettura e vincoli», valida per tutto l'epic 16) |
|---|---|
| **[I-a]** | **Un solo calendario**: ogni «oggi», «giorno del volo», `effectiveDate` e bordo di mese si calcola in **Europe/Rome** con gli helper esistenti. **Nessun `new Date()` confrontato con una data-only senza fuso.** *La 16.1 fissa l'idioma, le story successive lo riusano* — quindi il nome e la collocazione dell'helper sono **contratto**, non gusto. |
| **[I-b]** | **Ledger append-only**: nessun `update`/`delete` su `AccountMovement`/`CashMovement`; ogni correzione è una **riga nuova**. Questa story **aggiunge zero righe** al ledger e **non ne modifica nessuna**. |
| **[I-c]** | **Guardie = codice esistente + unit discriminante**: ogni comportamento corretto qui nasce con un test provato **ROSSO sul pre-fix simulato**, con repo **ripristinato byte-identico** dopo (sha256 dichiarato). |
| **[I-d]** | Una `@db.Date` si lega **sempre** come `Date` a mezzanotte UTC, mai come istante con ora (lezione review 3.5 F1, doc-comment `date-only.ts:10-16`). L'helper nuovo **deve** restituire quella forma. |

### Ratifiche già chiuse che vincolano QUESTA story

| R | Decisione | Effetto vincolante qui |
|---|---|---|
| **Nessuna nuova** | Il piano non elenca ratifiche PO specifiche per la 16.1: il rimedio è **quello proposto dai due audit** e accettato nel piano (un helper unico Roma, i 7 writer che lo condividono, nessuna ridatazione). | Il dev **non apre AskUserQuestion** per il perimetro di questa story. Se durante il lavoro emerge un'assumption di dominio nuova, vale la regola di progetto: si ratifica **prima** di implementarla (retro Epic 9). |
| **DQ-2** (pendente) | Data valuta **futura** accettata e conteggiata nella liquidità di oggi (ledger MAJOR-4). | **Fuori scope, blocca solo la 16.6.** Qui non si aggiunge nessuna validazione sul futuro di `effectiveDate`: v. §6. |

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — UN helper nuovo, in `src/lib/zoned-time.ts`, e si chiama `todayDateOnlyUtcInZone`

```ts
/**
 * "Oggi" come `Date` a mezzanotte UTC — la forma che Prisma lega a una
 * colonna `@db.Date` (invariante [I-d]) — calcolato sul calendario
 * WALL-CLOCK di `timeZone`, non su quello UTC.
 *
 * È il caso `instant = now` di {@link dateOnlyInZone}, legato in
 * `@db.Date` da `parseDateOnlyUtc`. Da NON confondere con
 * `date-only.ts#todayDateOnlyUtc`, che è "oggi" secondo il calendario
 * UTC: i due divergono di un giorno fra le 00:00 di Roma e le 00:00 UTC
 * (1h in CET, 2h in CEST), ed è esattamente quella divergenza che
 * `FLIGHT_DATE_IN_FUTURE` e le cinque `effectiveDate` UTC hanno pagato
 * (ops F1 / ledger MAJOR-3).
 */
export function todayDateOnlyUtcInZone(timeZone: string): Date {
  return parseDateOnlyUtc(todayDateOnlyInZone(timeZone));
}
```

**Perché `zoned-time.ts` e non `date-only.ts`.** I due moduli hanno cariche dichiarate nei rispettivi doc-comment e vanno rispettate: `date-only.ts` è il modulo delle colonne `@db.Date` *«with no real timezone conversion involved at all»* (`:13-15`), `zoned-time.ts` è *«the only one that actually crosses the UTC/Europe-Rome boundary»* (`:16-18`). Una funzione che **attraversa il confine** appartiene al secondo. Costo: `zoned-time.ts` acquisisce **un** import (`parseDateOnlyUtc` da `@/lib/date-only`). **Nessun ciclo**: `date-only.ts` non importa nulla (verificato, `grep '^import' src/lib/date-only.ts` → 0 righe).

**Perché questo nome.** La grammatica dei nomi in casa è già fissata: in `date-only.ts` il suffisso `Utc` significa «`Date` a mezzanotte UTC per una `@db.Date`» (`parseDateOnlyUtc`, `todayDateOnlyUtc`, `addMonthsClampUtc`), e in `zoned-time.ts` `InZone` significa «sul calendario wall-clock di `timeZone`» (`dateOnlyInZone`, `todayDateOnlyInZone`). `todayDateOnlyUtcInZone` è la composizione esatta delle due, e si legge come tale. Un rinominamento è ammesso **solo** con la motivazione scritta nel record; ciò che **non** è ammesso è una firma diversa (niente default `APP_TIMEZONE` implicito: `zoned-time.ts` è parametrizzato per costruzione, e nessuna delle sue 7 funzioni esportate nasconde la zona).

**Perché NON due funzioni.** Serve anche la forma «da un istante qualunque» (`parseDateOnlyUtc(dateOnlyInZone(instant, tz))`), e infatti esiste già **in due punti** (`flights.service.ts:485` dentro `deriveFlightDate`; `ppr.service.ts:655` su `closedAt`). Quei due punti **non chiedono «oggi»**: chiedono il giorno di un istante specifico, e sono **già corretti**. Aggiungere ora un secondo helper `dateOnlyUtcInZone(instant, tz)` per «unificarli» sarebbe astrazione non richiesta (karpathy §2): **si lasciano come sono**, e il record lo dichiara. L'unica funzione nuova è quella di «oggi».

### AD-2 — I sette call-site, e nessun ottavo

L'helper sostituisce **esattamente** questi sette usi di «oggi». Ogni riga fuori da questa lista è **fuori perimetro** e va motivata come deviazione:

| # | Call-site su `4c45753` | Oggi | Dopo |
|---|---|---|---|
| 1 | `flights.service.ts:761` — guardia `FLIGHT_DATE_IN_FUTURE` | `todayDateOnlyUtc()` (import da `@/lib/date-only`) | `todayDateOnlyUtcInZone(APP_TIMEZONE)` |
| 2 | `flights.service.ts:1338` — `cancelFlight`, `FLIGHT_CHARGE_REVERSAL.effectiveDate` | idem | idem |
| 3 | `flights.service.ts:1474` — `correctFlight`, storno del volo originale | idem | idem |
| 4 | `accounts.service.ts:651` — `recordAdjustment`, `ADJUSTMENT.effectiveDate` | copia **privata** `:706-709` | idem, e la copia privata **si cancella** |
| 5 | `cash.service.ts:425` — `reverseCashMovement`, storno di cassa | copia **privata** `:287-290` | idem, e la copia privata **si cancella** |
| 6 | `membership.service.ts:90` — `chargeMembershipFee`, la variabile `today` (usata a `:91` `paymentYear`, `:133` `effectiveDate`, `:152` e `:164` base della scadenza a 12 mesi) | `todayDateOnlyUtc()` | idem — **una sola riga cambia, quattro usi ne ereditano il calendario** |
| 7 | `instructor-compensation.service.ts:482` — `recordPayout` | `parseDateOnlyUtc(todayDateOnlyInZone(APP_TIMEZONE))` — **già Roma** | `todayDateOnlyUtcInZone(APP_TIMEZONE)` — **stesso valore, formula collassata** |

Il #7 è quello che rende vero P2 («i sette writer condividono UN helper»): senza toccarlo resterebbero **due** formule Roma equivalenti, ed è precisamente ciò che P2 vieta. È un cambio a **valore invariato**: i due unit al bordo che già esistono (`instructor-compensation.service.test.ts:377-425`) devono restare **verdi byte-identici**, ed è la prova.

`ppr.service.ts:655` **NON è un ottavo call-site**: non è «oggi», è il giorno Roma di `closedAt`, e il suo doc-comment (`:643-644`) spiega perché deve venire *dallo stesso istante* con cui la riga è timbrata, *«never a second independent `new Date()` call that could tick a millisecond apart»*. Sostituirlo con «oggi» **reintrodurrebbe** quel secondo `new Date()`. Si lascia, e il record lo dichiara.

### AD-3 — Cinque doc-comment diventano FALSI e vanno corretti nello stesso commit

Non è cosmetica: sono le righe che il prossimo che legge crederà. Tutte e cinque affermano oggi «UTC» dove dopo il fix c'è Roma.

| Riga su `4c45753` | Testo che diventa falso |
|---|---|
| `flights.service.ts:545-546` | *«in the future (server-clock UTC "today") -> `FLIGHT_DATE_IN_FUTURE`»* |
| `flights.service.ts:1290` | *«`effectiveDate` = today UTC date-only, NOT the flight's own date»* — la seconda metà resta **vera** e va conservata |
| `accounts.service.ts:574-576` | *«a rettifica always values as of today, the server clock's UTC calendar date»* |
| `cash.service.ts:373` | *«`effectiveDate` is always today (server clock, UTC calendar date)»* |
| `date-only.ts:36` | *«`@db.Date` calendar-only "today" (server clock, UTC).»* — la funzione **resta**, il doc-comment deve dire **dove resta legittima** e puntare a `todayDateOnlyUtcInZone` per i percorsi Roma (è la richiesta letterale dell'ops-audit §F1: *«la scelta coerente è dichiarare un `todayInAppZone()` unico e usarlo dove il lato confrontato è Roma»*) |

E il **titolo** di un test esistente diventa falso: `flights.service.test.ts:528` recita *«for a flight date after today (server UTC clock)»*. Il ledger-audit lo nomina esplicitamente: *«Il test esistente che copre quella guardia si intitola, correttamente, "for a flight date after today (server UTC clock)" — il difetto è che il resto della catena non è UTC»*. Va riscritto (il test resta valido: `9999-12-31` è nel futuro in qualunque calendario).

### AD-4 — Due asserzioni unit vanno riallineate AL VALORE CORRETTO, mai indebolite

`flights.service.test.ts:1529` (cancelFlight) e `:1813` (correctFlight) asseriscono `effectiveDate: todayDateOnlyUtc()` dentro un `toHaveBeenCalledWith` **esatto** (oggetto `data` completo, non `objectContaining`). Vanno portate al nuovo helper **mantenendo l'uguaglianza esatta**. ⚠️ **Vietato** trasformarle in `expect.any(Date)` o `objectContaining`: è la lezione 14.6 (un'asserzione indebolita per far passare un fix è un fix che può sparire) e la disciplina di AD-8 di AOG-1b.

Fuori da queste due, **nessun altro unit esistente asserisce una `effectiveDate` prodotta da «oggi»**: censimento in §3.

### AD-5 — La forma del fix è *sostituzione*, non *riscrittura*

Il perimetro di produzione è **8 righe** cambiate + **1 funzione nuova** + **2 funzioni private cancellate** + **5 doc-comment**. Niente di più:
- nessun cambio di firma pubblica di service;
- nessun DTO nuovo, nessuna rotta nuova, **nessun tocco a OpenAPI/registry** (nessun contratto HTTP cambia forma: `effectiveDate` era e resta `YYYY-MM-DD`);
- nessuna migrazione Prisma;
- nessuna nuova env var (quindi **niente** da sincronizzare in `.env.example`/`ci.yml`, e `src/lib/env.ci-sync.test.ts` resta verde per costruzione);
- **zero righe di UI**.

Se il dev si trova a scrivere una migrazione, un DTO o un componente, ha sbagliato story: si ferma e lo dichiara.

---

## §2 — Acceptance Criteria

> Ogni AC che dice **«misurato»** richiede **un numero** nel Dev Agent Record. Ogni AC che dice **«discriminante»** richiede la prova che il test è **ROSSO sul pre-fix simulato**, col repo **ripristinato byte-identico** dopo (sha256 dei file toccati, lezione 13.7/15.10/AOG-1b).

### L'helper

**AC 1 — Un helper, sette call-site, nessuna seconda formula.**
`todayDateOnlyUtcInZone` esiste in `src/lib/zoned-time.ts` con la firma e il doc-comment di AD-1, ha unit propri in `src/lib/zoned-time.test.ts` (almeno: un giorno ordinario; le 00:30 Roma in CEST; le 00:30 Roma in CET; il ritorno è a **mezzanotte UTC esatta** — `getUTCHours/Minutes/Seconds/Milliseconds` tutti 0, invariante [I-d]), ed è chiamato dai **sette** call-site della tabella AD-2 e da nessun altro. Le due copie private (`accounts.service.ts:705-709`, `cash.service.ts:286-290`) **non esistono più**.
**Verifica nel record, con l'output dei comandi**:
```
grep -rn "todayDateOnlyUtcInZone" src --include=*.ts --include=*.tsx | grep -v test   # atteso: 1 definizione + 7 call-site
grep -rn "function todayDateOnlyUtc" src/server                                        # atteso: 0 righe
grep -rn "parseDateOnlyUtc(todayDateOnlyInZone" src                                    # atteso: 0 righe (la formula è collassata nell'helper)
```

### La guardia del volo (P1, P4)

**AC 2 — Un volo già atterrato non è «nel futuro» (discriminante).**
`flights.service.ts:761` confronta contro il giorno **Roma**. Il test discriminante vive in `src/server/services/flights.service.test.ts` (accanto alla guardia che descrive) con `vi.useFakeTimers()` + `vi.setSystemTime()`, e copre **estate e inverno**:

| Orologio | Decollo → atterraggio | Roma | Atteso |
|---|---|---|---|
| `2026-07-14T23:00:00.000Z` (01:00 del 15/07, CEST) | `22:10Z` → `22:20Z` | 00:10 → 00:20 del 15/07 | **accettato** |
| `2026-01-14T23:30:00.000Z` (00:30 del 15/01, CET) | `23:05Z` → `23:20Z` | 00:05 → 00:20 del 15/01 | **accettato** |

**La discriminanza è già scritta e già misurata.** Probe eseguito su `4c45753` — `/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/story-16-1/tz-boundary.probe.test.ts`, con `vitest.probe.config.mjs` accanto (vitest è confinato a `src/**`, quindi serve un config con `include` esplicito). Output **verbatim**, `env -u DATABASE_URL -u AUTH_SECRET npx vitest run --config …/vitest.probe.config.mjs`:

```
 ❯ …/story-16-1/tz-boundary.probe.test.ts (5 tests | 3 failed) 94ms
     × A1 (ops F1, MUST be green after the story): a flight that took off 00:10 Rome and landed 00:20 Rome, registered at 01:00 Rome, is ACCEPTED 28ms
     × A2 (ops F1, winter): the same rejection exists in CET, in the 00:00-01:00 Rome window 4ms
     × B1 (ledger MAJOR-3, MUST be green after the story): a flight storno at 00:30 Rome on the 1st is dated on the NEW month 10ms

 FAIL  … > A1 … is ACCEPTED
AssertionError: promise rejected "ValidationError: Flight date cannot be in… { …(2) }" instead of resolving
Caused by: ValidationError: Flight date cannot be in the future.
 ❯ resolveFlightInput src/server/services/flights.service.ts:762:11
 ❯ registerFlight src/server/services/flights.service.ts:1086:20
Serialized Error: { code: 'FLIGHT_DATE_IN_FUTURE', details: undefined }

 FAIL  … > A2 … in the 00:00-01:00 Rome window
AssertionError: promise rejected "ValidationError: Flight date cannot be in… { …(2) }" instead of resolving
Caused by: ValidationError: Flight date cannot be in the future.
 ❯ resolveFlightInput src/server/services/flights.service.ts:762:11

 FAIL  … > B1 … is dated on the NEW month
AssertionError: expected '2026-08-31' to be '2026-09-01' // Object.is equality
Expected: "2026-09-01"
Received: "2026-08-31"

 Test Files  1 failed (1)
      Tests  3 failed | 2 passed (5)
```

I due test verdi del probe sono la **prova pura** (A0: alle 01:00 Roma i due helper danno `2026-07-15` e `2026-07-14`; al bordo di mese `2026-09-01` e `2026-08-31`) e la **matrice DST** (C, AC 6). Il dev **porta i cinque casi del probe dentro `src/`** (il file di scratchpad non entra nel repo: la mock chain è già quella di `flights.service.test.ts`, quindi i test A si inseriscono nel file esistente senza mock nuovi) e li fa diventare **5 su 5 verdi**.

**AC 3 — Il boundary «oggi stesso» resta accettato, e ora è il boundary GIUSTO.**
Il test esistente `flights.service.test.ts:538-546` (*«accepts today's date»*) costruisce il decollo con `toDateOnlyString(todayDateOnlyUtc())`. Dopo il fix quel valore **non è più «oggi»** nella finestra notturna: il test resta verde per la ragione sbagliata (una data passata è accettata). Va portato al calendario nuovo — decollo sul **giorno Roma corrente** — così il bordo `flightDate == oggi` è davvero esercitato. Il titolo `:528` è riscritto (AD-3).

### La data valuta (P2)

**AC 4 — I cinque writer UTC datano sul giorno Roma (discriminante, uno per writer).**
Un unit per ciascuno, con orologio a **`2026-08-31T22:30:00.000Z`** (= 00:30 del 1° settembre a Roma, CEST — l'istante che il ledger-audit usa nella sua prova), che asserisce `effectiveDate` **uguale a `2026-09-01`**:

| Writer | File di test | Asserzione |
|---|---|---|
| `cancelFlight` (`flights.service.ts:1338`) | `flights.service.test.ts` | `effectiveDate` del `FLIGHT_CHARGE_REVERSAL` = `parseDateOnlyUtc('2026-09-01')` |
| `correctFlight` (`:1474`) | idem | idem, sulla **prima** `accountMovement.create` |
| `recordAdjustment` (`accounts.service.ts:651`) | `accounts.service.test.ts` | `effectiveDate` dell'`ADJUSTMENT` = `2026-09-01` |
| `reverseCashMovement` (`cash.service.ts:425`) | `cash.service.test.ts` | `effectiveDate` del `CashMovement` di storno = `2026-09-01` |
| `chargeMembershipFee` (`membership.service.ts:133`) | `membership.service.test.ts` | `effectiveDate` dell'`ADJUSTMENT` = `2026-09-01` |

**Almeno tre** delle cinque devono essere provate **ROSSE** sul pre-fix simulato (il probe copre già `cancelFlight`); il record riporta la tabella guardia → discriminanza con l'esito e il ripristino sha256.

**AC 5 — La quota associativa cambia anno sul calendario Roma.**
Unit su `chargeMembershipFee` con orologio a **`2026-12-31T23:30:00.000Z`** (= 00:30 del 1° gennaio 2027 a Roma, CET): la `description` è **`Quota associativa 2027`** (non 2026) e `effectiveDate` è **`2027-01-01`**; la scadenza a 12 mesi (`:164`, `addMonthsClampUtc(today, 12)`) parte da **`2027-01-01`**. È la stessa riga di codice di AC 4 (`:90`) vista dal lato dell'**anno** e della **scadenza**: quattro usi, una sola sorgente. ⚠️ `membership.service.test.ts:89` fissa deliberatamente `2027-03-10T12:00:00Z` (mezzogiorno, lontano da ogni confine) e **quel `FIXED_TODAY` non si tocca**: il caso nuovo è un `describe` a sé che sposta l'orologio e lo ripristina.

**AC 6 — I due giorni di cambio ora, ai quattro bordi (misurato).**
Un unit in `src/lib/zoned-time.test.ts` verifica che il giorno di calendario Roma sia esatto agli **8 istanti** che coprono 00:00 / 01:00 / 02:00 / 03:00 Roma sui due giorni di transizione 2026, e che `todayDateOnlyUtcInZone` concordi con `dateOnlyInZone` su ognuno. La matrice (già verde nel probe — «C», 2 test passati su 5):

| Istante UTC | Roma | Atteso |
|---|---|---|
| `2026-03-28T23:00:00Z` | 00:00 (CET) | `2026-03-29` |
| `2026-03-29T00:00:00Z` | 01:00 (CET) | `2026-03-29` |
| `2026-03-29T01:00:00Z` | **03:00** (CEST — le 02:00 non esistono) | `2026-03-29` |
| `2026-03-29T02:00:00Z` | 04:00 (CEST) | `2026-03-29` |
| `2026-10-24T22:00:00Z` | 00:00 (CEST) | `2026-10-25` |
| `2026-10-24T23:00:00Z` | 01:00 (CEST) | `2026-10-25` |
| `2026-10-25T00:00:00Z` | **01:00 di nuovo** (CET — ora ripetuta) | `2026-10-25` |
| `2026-10-25T01:00:00Z` | 02:00 (CET) | `2026-10-25` |

Il record dichiara che i due bordi **patologici** (l'ora che non esiste e l'ora ripetuta) sono coperti **per costruzione** e non per fortuna.

### Le righe storiche (P3)

**AC 7 — Nessuna ridatazione, e il conteggio è nel record (misurato).**
La story **non esegue nessun `UPDATE`** su `AccountMovement`/`CashMovement` (invariante [I-b]). La deviazione storica è dichiarata nel Dev Agent Record col conteggio delle righe che oggi stanno nel giorno precedente, misurato con questa query (le forme di riga prodotte dai cinque writer UTC — i top-up e i movimenti di cassa manuali sono esclusi perché la loro `effectiveDate` viene **dal chiamante** e può legittimamente differire da `createdAt`):

```sql
SELECT 'AccountMovement/ADJUSTMENT+REVERSAL' AS shape, count(*) AS tot,
       count(*) FILTER (WHERE "effectiveDate" = (("createdAt" AT TIME ZONE 'Europe/Rome')::date - 1)) AS slittate
FROM "AccountMovement" WHERE type IN ('ADJUSTMENT','FLIGHT_CHARGE_REVERSAL')
UNION ALL
SELECT 'CashMovement/storni', count(*),
       count(*) FILTER (WHERE "effectiveDate" = (("createdAt" AT TIME ZONE 'Europe/Rome')::date - 1))
FROM "CashMovement" WHERE "reversalOfId" IS NOT NULL;
```

Eseguita da me su `4c45753` (`docker compose exec -T postgres psql -U airmanager -d airmanager`, 2026-09-10):

```
                shape                | tot | slittate
-------------------------------------+-----+----------
 AccountMovement/ADJUSTMENT+REVERSAL |  36 |        0
 CashMovement/storni                 |   3 |        0
```

**Zero righe da ridatare su 39.** Il dev **ripete la query** sul DB su cui lavora (dopo il reset di AC 11 il conteggio sarà quello del seed) e riporta i numeri: se anche fossero > 0, **non si ridata** — si dichiara.

### Il censimento (P5)

**AC 8 — Ogni produttore di data-only in `src/server` è classificato, voce per voce.**
Nel Dev Agent Record, una tabella con **una riga per occorrenza** e una delle tre etichette: **Roma corretto** / **UTC legittimo** / **da convertire (fuori scope, TD)**. Il perimetro del censimento è, dichiarato:

```
grep -rn "todayDateOnlyUtc()" src --include=*.ts --include=*.tsx | grep -v "\.test\.ts" | grep -v src/generated
grep -rn "new Date()" src/server --include=*.ts | grep -v "\.test\.ts"
grep -rn "toISOString().slice(0, *10)" src/server src/lib --include=*.ts | grep -v "\.test\.ts"
grep -rn "dateOnlyInZone\|todayDateOnlyInZone\|zonedMidnightUtc" src/server --include=*.ts | grep -v "\.test\.ts"
```

La base di partenza — **il censimento che ho già fatto su `4c45753`** — è in **§3**: il dev la **riverifica** (i numeri di riga possono slittare) e la **chiude** con l'esito post-fix. Come per l'invariante `[a]` dell'AOG: se l'elenco cresce, ogni voce nuova va classificata, non ignorata.

### Non-regressione e gate

**AC 9 — Tabella guardia → discriminanza, con ripristino provato.**
Per ogni comportamento nuovo (AC 2, AC 4 ×3 minimo, AC 5, AC 6) una riga con: cosa si è rotto nel pre-fix simulato, il **numero di test rossi**, e lo **sha256 dei file ripristinati** che dimostra che il repo è tornato byte-identico. Nessuna riga «per ispezione».

**AC 10 — `npm run gates` verde, e i test nuovi verdi anche SENZA env.**
`npm run gates` (lint + typecheck + vitest + build, output compatto — **mai** i quattro comandi separati) passa, col conteggio unit prima/dopo nel record. Inoltre, per ogni file di test toccato o creato:
```
env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>
```
deve passare — è la classe alla **terza occorrenza** in questo progetto (validazione Zod eager di `@/lib/env` trascinata da un import nuovo: CI resta verde, il gate locale no; v. CLAUDE.md e lezione 14.7 F1). ⚠️ `zoned-time.ts` non importa nulla oggi e con AD-1 importa **solo** `@/lib/date-only`, che a sua volta non importa nulla: la catena resta pulita, ma **va verificata**, non assunta.

**AC 11 — Suite e2e completa verde, su DB RESETTATO.**
`scripts/e2e.sh start` (**mai** `playwright test` in foreground; `scripts/e2e.sh status` è l'unico modo di sapere com'è andata — assenza di sentinella `E2E_EXIT=<code>` + nessun processo vivo = run **MORTO**, non riuscito). Prima del run che conta, **DB fresco obbligatorio**: v. §5, «Il DB e2e è sporco». Nel record: esito verbatim, `passed/failed/flaky/skipped`, exit code, e la baseline di confronto.
La story **non aggiunge nessuno spec e2e**: il comportamento corretto vive in una finestra di 1-2 ore notturne che un e2e non può fabbricare senza falsificare l'orologio del **server** (fuori dalla portata di Playwright, che guida il browser). La copertura è **unit, deterministica e sull'orologio finto** — ed è la copertura giusta. Questo è **dichiarato**, non omesso.

---

## §3 — Dev Notes: blast radius e censimento misurato su `4c45753`

### 3.1 — I 13 `create` di `effectiveDate`, e chi fra loro data «oggi»

Censimento completo (`grep -rn "accountMovement.create\|cashMovement.create" src/server --include=*.ts | grep -v test` → 13 righe; `expiry-alerts.service.ts:133` è un `sentAlert.createMany` senza `effectiveDate` e non conta):

| # | Writer | `create` | Da dove viene `effectiveDate` | Calendario | Dopo la story |
|---|---|---|---|---|---|
| 1 | `recordAdjustment` (rettifica di conto) | `accounts.service.ts:645` | `todayDateOnlyUtc()` **privata** `:706-709`, usata a `:651` | **UTC** | **→ Roma** (AD-2 #4) |
| 2 | `reverseCashMovement` (storno di cassa) | `cash.service.ts:414` | `todayDateOnlyUtc()` **privata** `:287-290`, usata a `:425` | **UTC** | **→ Roma** (AD-2 #5) |
| 3 | `chargeMembershipFee` (quota associativa) | `membership.service.ts:127` | `today` = `todayDateOnlyUtc()` `:90`, usata a `:133` (+ `:91` anno, `:152`/`:164` scadenza) | **UTC** | **→ Roma** (AD-2 #6) |
| 4 | `cancelFlight` (storno volo) | `flights.service.ts:1328` | `todayDateOnlyUtc()` a `:1338` (import `@/lib/date-only`) | **UTC** | **→ Roma** (AD-2 #2) |
| 5 | `correctFlight` (storno volo originale) | `flights.service.ts:1467` | `todayDateOnlyUtc()` a `:1474` | **UTC** | **→ Roma** (AD-2 #3) |
| 6 | `recordPayout` (compenso istruttore) | `instructor-compensation.service.ts:497` | `parseDateOnlyUtc(todayDateOnlyInZone(APP_TIMEZONE))` a `:482` | **Roma** ✓ | **→ helper condiviso**, valore invariato (AD-2 #7) |
| 7 | `completePprRequest` (tassa di atterraggio) | `ppr.service.ts:682` | `parseDateOnlyUtc(dateOnlyInZone(closedAt, APP_TIMEZONE))` a `:655`, da `closedAt` `:654` | **Roma** ✓ | **invariato** — non è «oggi» (AD-2) |
| 8 | `registerFlightCore` (`FLIGHT_CHARGE`) | `flights.service.ts:1022` | `params.flightDate`, cioè `deriveFlightDate(takeoffAt)` `:484-486` | **Roma** ✓ | **invariato** |
| 9 | `recordTopUp` (`AccountMovement`) | `accounts.service.ts:238` | `new Date(input.effectiveDate)` `:227` — data-only dal **chiamante** | n/a | **invariato** |
| 10 | `recordTopUp` (gemello `CashMovement`) | `accounts.service.ts:251` | stessa variabile di #9 | n/a | **invariato** |
| 11 | `recordCashMovement` (movimento manuale) | `cash.service.ts:340` | `new Date(input.effectiveDate)` `:346` — dal **chiamante** | n/a | **invariato** |
| 12-13 | `recordTransaction` (dispatcher) | `transactions.service.ts:531`, `:549` | **passa** `input.effectiveDate` a #9 e #11: non è un writer proprio | n/a | **invariato** |

**Sette writer di «oggi» = #1-#7.** Cinque UTC, due Roma, un helper dopo la story. `new Date('2026-09-01')` di #9/#11 parsa a mezzanotte **UTC** ed è quindi la forma giusta per una `@db.Date` (equivalente a `parseDateOnlyUtc`): **UTC legittimo**, la data non è «oggi» ma una scelta dell'utente. *(Nota, non azione: quei due potrebbero usare `parseDateOnlyUtc` per esplicitare l'intento — è **fuori scope**, karpathy §3.)*

### 3.2 — Le 16 invocazioni di `todayDateOnlyUtc()` in tutto `src`, classificate

`grep -rn "todayDateOnlyUtc()" src --include=*.ts --include=*.tsx | grep -v "\.test\.ts" | grep -v src/generated` (escluse la definizione `date-only.ts:37` e le 2 definizioni private):

| Riga | Contesto | Classificazione |
|---|---|---|
| `flights.service.ts:761` | guardia `FLIGHT_DATE_IN_FUTURE` | **DA CONVERTIRE — in scope** (AC 2) |
| `flights.service.ts:1338`, `:1474` | `effectiveDate` dei due storni volo | **DA CONVERTIRE — in scope** (AC 4) |
| `accounts.service.ts:651` | `effectiveDate` rettifica | **DA CONVERTIRE — in scope** (AC 4) |
| `cash.service.ts:425` | `effectiveDate` storno di cassa | **DA CONVERTIRE — in scope** (AC 4) |
| `membership.service.ts:90` | `today` della quota (4 usi) | **DA CONVERTIRE — in scope** (AC 4/AC 5) |
| `expiries.service.ts:131`, `:236`, `:289`, `:444`, `:507` | «oggi» di `computeExpiryStatus` e dei contatori Scadenze | **DA CONVERTIRE — FUORI SCOPE, TD** (§6) |
| `expiry-alerts.service.ts:110` | «oggi» dell'alert job | **DA CONVERTIRE — FUORI SCOPE, TD** (§6) |
| `dashboard/page.tsx:295`, `fleet/page.tsx:65`, `pilots/page.tsx:55` | data passata a `getEffectiveRates`/lookup tariffe **per la visualizzazione** | **DA CONVERTIRE — FUORI SCOPE, TD** (§6). ⚠️ Il percorso del **denaro** non passa da qui: `registerFlight` cerca la tariffa con `flightDate` (Roma), `flights.service.ts:869` e `:876` |
| `components/dashboard/expiry-editor.tsx:34` | default `expiresAt = oggi + validityMonths` in un **form client** | **FUORI SCOPE, TD** (§6) |

Dopo la story, `date-only.ts#todayDateOnlyUtc` **resta esportata** e ha ancora 10 consumatori legittimi-per-decisione (scadenze, alert job, 3 pagine, 1 form): il suo doc-comment deve dirlo (AD-3).

### 3.3 — `new Date()` in `src/server` (26 occorrenze), e le data-only

`grep -rn "new Date()" src/server --include=*.ts | grep -v "\.test\.ts"` → 26 righe. **Nessuna di queste produce una data-only usata in un confronto**, tranne quelle già censite sopra. Classificazione per gruppi (il dev la riverifica e la riporta nel record):

- **Istanti puri, UTC legittimo per costruzione** (`DateTime`/`timestamptz`, nessuna aritmetica di calendario): `aircraft.service.ts:386` (`archivedAt`), `auth-tokens.service.ts:103`/`:211` (`usedAt`), `bookings.service.ts:523` (`forcedAt`), `:1013` (`cancelledAt`), `:1178` (transizione), `flights.service.ts:857` (`forcedAt`), `:1323`/`:1464` (`cancelledAt`), `people.service.ts:601` (`archivedAt`), `:742` (`deactivatedAt`), `ppr.service.ts:411`/`:520`/`:581` (`decidedAt`), `:710` (`closedAt`), `exports.service.ts:145` (etichetta «generato il», display).
- **`now` iniettabile passato a una funzione Roma-corretta**: `stats.service.ts:142` (`getStats(…, now = new Date())` → `dateOnlyInZone`/`zonedMidnightUtc`), `billing-summary.service.ts:158` (`ref = new Date()` → `currentMonthRange`, Roma), `aircraft.service.ts:447`/`:512` (finestra di `computeAogImpact`, che usa `zonedMidnightUtc`). **Roma corretto.**
- **Data-only Roma già corretta**: `bookings.service.ts:345` (`dateOnlyInZone(new Date(), APP_TIMEZONE)`), `ppr.service.ts:654-655`.
- **Data-only UTC**: le 2 copie private (`accounts.service.ts:707`, `cash.service.ts:288`) — **cancellate** dalla story.

Produttori via `toISOString().slice(0,10)` in `src/server`/`src/lib` (6): `accounts.service.ts:75` e `cash.service.ts:283` (copie private di `toDateOnlyString` — **formattano** una `@db.Date` già a mezzanotte UTC: **UTC legittimo**, nessun fuso in gioco), `people.service.ts:111` (idem), `date-only.ts:21` (l'originale), `zoned-time.ts:132`/`:149` (aritmetica pura di calendario su `Date` UTC-mezzanotte: **UTC legittimo** per il doc-comment del modulo).

### 3.4 — Chi RILEGGE `effectiveDate` (e perché il fix è necessario, non estetico)

Tutti i lettori delimitano il periodo su **Roma**, quindi oggi un writer UTC scrive **fuori** dal mese che il lettore chiede:

- `period-presets.ts:43-48` `currentMonthRange` (Roma via `romeDateParts:26-34` — **quarta** implementazione corretta di «parti di calendario Roma», nota in §6);
- consumatori: `billing-summary.service.ts:161` (`getBillingSummary`), `dashboard/billing/page.tsx:117` *(ledger-audit citava `:116` su `b7b8d13`: **slittata di +1**)*;
- filtri inclusivi su `effectiveDate`: `accounts.service.ts:374`, `cash.service.ts:493`/`:599`, `transactions.service.ts:217-218`/`:250-251`/`:465`/`:478`, `billing-summary.service.ts:87`/`:105`/`:109`;
- pagine che **visualizzano** `effectiveDate` (nessuna cambia): `people/[id]/account-section.tsx:387`/`:451`/`:544`/`:800`, `exports.service.ts:361`/`:382`/`:540` (Excel/PDF).

### 3.5 — File toccati (previsione; il record dichiara quelli effettivi)

**Produzione (6 file)**
1. `src/lib/zoned-time.ts` — **+1 funzione** (AD-1) + **1 import**.
2. `src/lib/date-only.ts` — **solo** il doc-comment `:36` (AD-3). La funzione **non si tocca**.
3. `src/server/services/flights.service.ts` — `:761`, `:1338`, `:1474`, import `:3`/`:6`, doc-comment `:545-546` e `:1290`.
4. `src/server/services/accounts.service.ts` — `:651`, **cancellazione** `:705-709`, doc-comment `:574-576`, import.
5. `src/server/services/cash.service.ts` — `:425`, **cancellazione** `:286-290`, doc-comment `:373`, import.
6. `src/server/services/membership.service.ts` — `:90`, import `:1`.
7. `src/server/services/instructor-compensation.service.ts` — `:482` (collasso sull'helper), import `:1`/`:4`.

*(Sette, non sei: il #7 è quello che rende vero «un solo helper».)*

**Test (6 file)**
8. `src/lib/zoned-time.test.ts` — unit dell'helper (AC 1) + matrice DST (AC 6).
9. `src/server/services/flights.service.test.ts` — i 2 casi di AC 2, il boundary di AC 3, il titolo `:528`, le asserzioni `:1529` e `:1813` (AD-4), il caso a 22:30Z di AC 4.
10. `src/server/services/accounts.service.test.ts` — AC 4 su `recordAdjustment`.
11. `src/server/services/cash.service.test.ts` — AC 4 su `reverseCashMovement`.
12. `src/server/services/membership.service.test.ts` — AC 4 + AC 5 (⚠️ `FIXED_TODAY:89` **intatto**).
13. `src/lib/date-only.test.ts` — solo se il dev aggiunge un test che pinna la **divergenza voluta** fra i due helper (raccomandato: è l'unica asserzione che impedisce a un futuro «cleanup» di unificarli per sbaglio).

**Cosa NON si tocca**: nessun file in `src/app` (**zero UI**), nessuno spec `e2e/`, `src/lib/schemas/*` (nessun contratto cambia), `prisma/` (nessuna migrazione), `.env.example`/`.github/workflows/ci.yml`/`scripts/` (nessuna env var nuova), `src/server/services/expiries.service.ts` e `expiry-alerts.service.ts` (§6), `src/server/services/ppr.service.ts` (AD-2).

---

## §4 — Piano di test

**Unit — nuovi**
1. `zoned-time.test.ts`: `todayDateOnlyUtcInZone` su un giorno ordinario, alle 00:30 Roma in CEST, alle 00:30 Roma in CET; ritorno a mezzanotte UTC esatta (invariante [I-d]); matrice DST agli 8 istanti (AC 6).
2. `flights.service.test.ts`: volo notturno accettato in **estate** e in **inverno** (AC 2); `effectiveDate` degli storni a 22:30Z (AC 4).
3. `accounts.service.test.ts`, `cash.service.test.ts`, `membership.service.test.ts`: `effectiveDate` a 22:30Z (AC 4); quota a `2026-12-31T23:30Z` → `Quota associativa 2027` (AC 5).

**Unit — esistenti che cambiano**
4. `flights.service.test.ts:528` (titolo), `:538-546` (boundary «oggi», AC 3), `:1529` e `:1813` (valore, **mai** indebolite — AD-4).
5. `instructor-compensation.service.test.ts:377-425` — **devono restare verdi senza una modifica**: è la prova che AD-2 #7 è a valore invariato. Se cambiano, il collasso dell'helper ha alterato il comportamento e va indagato, non «aggiornato».

**Idioma obbligatorio dell'orologio** (già in casa, 4 file): `vi.useFakeTimers()` → `vi.setSystemTime(new Date('…Z'))` → asserzioni → `vi.useRealTimers()`. Il ripristino **dentro** il test o in un `afterEach` del `describe`: un `useFakeTimers` che sopravvive contamina i test successivi dello stesso file (e in `flights.service.test.ts` molti dipendono dall'orologio reale via `BASE_INPUT`, datato `2020-01-15`).

**Discriminanze obbligatorie** (ROSSE sul pre-fix simulato, repo ripristinato byte-identico con sha256): AC 2 estate, AC 2 inverno, AC 4 su almeno tre writer, AC 5 sull'anno. Il probe di §2 ne dimostra già **tre** su `4c45753`: il dev le riproduce dentro `src/` e le fa passare.

**Gate**: `npm run gates`; poi `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>` su ogni file toccato (AC 10); poi **DB fresco** e suite e2e completa via `scripts/e2e.sh` (AC 11).

---

## §5 — Trappole note

- **Il DB e2e è SPORCO e va resettato prima del run che conta.** Verificato da me su `4c45753` (letture, nessuna scrittura): `Aircraft registration LIKE 'I-AUD%'` → **2**, `Person lastName LIKE 'Audit%'` → **3**, `Booking notes LIKE 'audit_%'` → **12**, `Flight notes LIKE 'audit_%'` → **7**, `PprRequest submitterIp = '203.0.113.191'` → **7**. Sono i residui dell'ops-audit (§7 di quel report, che contiene lo script `DELETE` in ordine di dipendenza). **Preferito: reset completo** — `fuser -k 3000/tcp; docker compose down -v && docker compose up -d && sleep 5 && set -a && . ./.env && set +a && npx prisma migrate deploy && npx prisma db seed` (`npm run db:reset` **non** funziona su questa macchina). ⚠️ `docker compose down -v` è distruttivo: se il permesso viene negato, **fermarsi e chiedere il comando inline** all'utente (`! docker compose down -v`), **mai** cercare un'alternativa distruttiva (prassi confermata nell'HANDOFF).
- **`JOBS_SECRET`**: il `.env` locale ha ancora il placeholder → la validazione env di produzione lo rifiuta e il `webServer` in `CI=1` non parte. Prima di ogni full suite: `export JOBS_SECRET=<valore-non-placeholder>`.
- **`useFakeTimers` e i test vicini.** `flights.service.test.ts` costruisce `BASE_INPUT` con `buildTimes('2020-01-15', 80)` **al caricamento del modulo** e molti test dipendono dal fatto che la guardia confronti con l'orologio reale. Un orologio finto che non viene ripristinato rende rossi test che non c'entrano nulla, e il fallimento **sembra** un difetto della story.
- **`vi.setSystemTime` NON sposta il fuso del processo.** Sposta solo `Date.now()`. `Intl.DateTimeFormat` con `timeZone: 'Europe/Rome'` continua a funzionare (verificato nel probe: A0 e C verdi). Quindi il test **non** ha bisogno di `TZ=…` e **non** deve dipendere dal fuso della macchina: se un test passa solo con `TZ=Europe/Rome`, è scritto male.
- **La finestra è di 1-2 ore.** Un test scritto con un orologio a mezzogiorno **non discrimina niente**: passa prima e dopo il fix. È esattamente il difetto che `membership.service.test.ts:89` documenta (`2027-03-10T12:00:00Z`, *«lontano da ogni confine»*). Ogni test di questa story che non fissa l'orologio in `[00:00, 02:00)` Roma è **inutile**, e va detto nel record se ce n'è uno.
- **`toDateOnlyString` è UTC per progetto.** Formatta una `@db.Date` letta dal DB, che arriva già a mezzanotte UTC: **non** va «convertita» a Roma. Se il dev applica `dateOnlyInZone` a un valore letto da una colonna `@db.Date`, introduce un difetto nuovo (la lezione review 3.5 F1 al contrario).
- **`addMonthsClampUtc` opera su `Date` UTC-mezzanotte** ed è corretta così: dopo il fix riceve la mezzanotte UTC del **giorno Roma**, e continua a fare aritmetica di calendario pura. Nessuna modifica.
- **Il gate locale e CI divergono sull'env** (terza occorrenza, CLAUDE.md): un import nuovo verso un service «grosso» trascina `@/lib/env` (Zod eager) nel test. Qui il rischio è **basso** (l'helper vive in `zoned-time.ts`, che non importa niente), ma AC 10 lo verifica comunque.
- **Ripetere run e2e mirati sullo stesso DB fa scattare il lock anti-brute-force** (TD-6, cap per identifier): dopo ~10 login lo stesso spec fallisce **sempre** alla riga di login, identico alla flake nota ma deterministico. Prima di attribuirlo alla flake: `SELECT identifier, count(*) FROM "LoginAttempt" WHERE "createdAt" > now() - interval '15 minutes' GROUP BY 1`.
- **Suite e2e: SEMPRE `scripts/e2e.sh`**, mai `playwright test` in foreground; `scripts/e2e.sh status` è l'unico modo di leggere l'esito. Un run in background lanciato da un subagent **muore con la sessione del subagent**.
- **`e2e/billing.spec.ts:53`, `cash-report.spec.ts:48`, `mobile-billing.spec.ts:59`, `expiry-registration.spec.ts:39`, `aircraft-rates.spec.ts:60`, `instructor-rates.spec.ts:49` hanno ciascuno un `todayDateOnly()` UTC.** Nessuno di essi asserisce una data prodotta dai writer di questa story (verificato: il test dello storno di cassa, `billing.spec.ts:437-456`, filtra **per categoria e non per data**, e il suo commento a `:444-445` spiega perché). **Non si toccano** — ma il commento a `:445` dice «TODAY (server clock)» e diventa impreciso: correggerlo è ammesso e desiderabile, allargare il sweep no. La classe di flake latente che quei sei helper portano (un test che data un movimento «oggi UTC» e poi lo cerca in un aggregato di mese **Roma** è rosso nella finestra notturna del 1° del mese) è **preesistente** e va registrata come TD, non risolta qui.

---

## §6 — Fuori scope DICHIARATO

- **Ridatare le righe esistenti** — invariante [I-b], contratto P3. Si dichiara con il conteggio (AC 7), non si esegue.
- **Qualunque modifica di UI** — contratto del piano. Ed è il confine che tiene la story su **Sonnet 5 xhigh**: appena si tocca un componente, la regola utente impone **Opus 5 xhigh**.
- **DQ-2 (data valuta futura rifiutata o esclusa dagli aggregati)** — ratifica PO **pendente**, blocca solo la **16.6**. Qui non si aggiunge nessuna validazione sul futuro di `effectiveDate`.
- **Il dominio Scadenze**: `expiries.service.ts:131`/`:236`/`:289`/`:444`/`:507` e `expiry-alerts.service.ts:110` restano su «oggi» UTC. **Motivo, con la misura**: l'errore è di **1-2 ore su una granularità di giorni**, non tocca denaro e **non blocca nessuno** — la scansione dei documenti bloccanti di prenotazioni e voli si data sul **giorno del volo** (Roma), non su «oggi» (`zoned-time.ts:152-164`, `bookings.service.ts:345`). L'ops-audit lo qualifica *«benigno»* con le stesse parole. Convertirli cambierebbe i contatori Scadenze e le finestre dell'alert job, cioè **allargherebbe il blast radius a un dominio che questa story non deve toccare**, e i loro unit esistenti (**20** riferimenti a `todayDateOnlyUtc()`: 9 in `expiries.service.test.ts`, 11 in `expiry-alerts.service.test.ts`) andrebbero riscritti in blocco. → **TD**, v. §7 «Da registrare».
- **I tre call-site di pagina sulle tariffe** (`dashboard/page.tsx:295`, `fleet/page.tsx:65`, `pilots/page.tsx:55`) e **il default del form scadenze** (`expiry-editor.tsx:34`): sono **visualizzazione**, e il percorso del denaro non passa da lì (`registerFlight` cerca la tariffa con `flightDate` Roma, `flights.service.ts:869`/`:876`). → **TD**.
- **Le 7 copie client di `todayDateOnly()`** (`new Date().toISOString().slice(0,10)`, tutte UTC): `people/[id]/account-section.tsx:159-161`, `billing/transaction-editor.tsx:73-75`, `fleet/aircraft-editor.tsx:231-233`, `instructors/instructors-console.tsx:440-442`, `instructors/instructor-rates-panel.tsx:71-73`, `logbook/flight-editor.tsx:230-232`, `pilots/pilots-console.tsx:713-715`. **È il terzo calendario**, e nessuno dei due report d'audit lo nomina: lo dichiaro qui come **finding nuovo di ricognizione**. Effetto: fra le 00:00 e le 02:00 Roma un form pre-compila **ieri** come data valuta o `validFrom` di default (l'utente può correggerla, ma nessuno guarda un default). **Fuori scope perché** (a) il contratto P5 limita il censimento a `src/server`, (b) sette componenti client renderebbero questa una story **UI**, con obbligo di Opus 5 xhigh, `design-taste-frontend` e `ui-ux-pro-max`. → **TD, con proposta**: casa naturale la **16.6** (data valuta) o una story propria dell'epic 18; l'unificazione è un helper client unico (le 7 copie sono già identiche fra loro). **Va portato alla sessione principale** per una decisione PO.
- **La quarta implementazione di «parti di calendario Roma»**: `period-presets.ts:26-34` (`romeDateParts`, privata) fa con `Intl.DateTimeFormat('en-US')` ciò che `zoned-time.ts:64-80` (`readWallTimeParts`) e `:165-167` (`dateOnlyInZone`, `en-CA`) già fanno. **È corretta** e non produce nessun difetto → consolidarla è **pulizia**, non correttezza: fuori scope (karpathy §3, «non refactorare ciò che non è rotto»). → **TD**.
- **`parseDateOnlyUtc` al posto di `new Date(input.effectiveDate)`** in `accounts.service.ts:227` e `cash.service.ts:346`: equivalenti oggi, l'esplicitazione è cosmetica. Fuori scope.
- **La classe di flake latente dei 6 helper `todayDateOnly()` negli spec e2e** (§5, ultima voce): preesistente, non introdotta né peggiorata da questa story. → **TD**.
- **Ogni altro finding degli epic 16-18**: F2/F3/F4/F5/F6/F7/F8/F9, MAJOR-1/2/4/5/6, i MINOR e i LOW hanno le loro story (mappa nel piano, sezione «Copertura dei findings»).

---

## §7 — Riferimenti

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` — **contratto**: sezione «Story 16.1» (gli AC di record), «Architettura e vincoli» (invarianti [I-a]…[I-c]), «Ratifiche PO», «Regole di processo».
- `_bmad-output/planning-artifacts/audit-2026-09-10/ops-audit.md` — **§F1** (la prova, la finestra di impatto, il rimedio e la nota collaterale sul dominio scadenze), **§[I-5]** (la data del volo è un giorno Roma), **§7** (residui `audit_*`/`I-AUD%` + script di pulizia).
- `_bmad-output/planning-artifacts/audit-2026-09-10/ledger-audit.md` — **§MAJOR-3** (i cinque writer UTC vs i due Roma, la prova a `2026-08-31T22:30Z`, i test mancanti), **§MAJOR-4** (DQ-2, fuori scope qui).
- `_bmad-output/implementation-artifacts/aog-1b-avviso-prenotazioni-email.md` — formato di casa, e la disciplina «asserzione al valore corretto, mai indebolita» (AD-8) che AD-4 riusa.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:479` (`16-1-un-solo-calendario: backlog`) e `:509-511` (l'action item con i TD da audit e la nota «reset prima della 16.1»).
- `docs/handoffs/HANDOFF.md` — ciclo per story su questa macchina, reset DB, `JOBS_SECRET`, flake note, `Co-Authored-By` = il modello che ha fatto il lavoro.
- `CLAUDE.md` — gates, `scripts/e2e.sh`, unit + validazione eager dell'env, catena serializzata e2e, convenzioni.
- `.claude/skills/karpathy-guidelines/SKILL.md` — assunzioni esplicitate (§0/§1), semplicità (AD-1: **un** helper, non due), chirurgia (AD-5: 8 righe), criteri verificabili (§2).
- Probe della ricognizione (**fuori dal repo**, rieseguibile): `/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/story-16-1/tz-boundary.probe.test.ts` + `vitest.probe.config.mjs`.

### Da registrare in `sprint-status.yaml` (azione della sessione principale, non del dev)

| TD | Contenuto |
|---|---|
| **TD 16.1-a** | Dominio Scadenze e alert job ancora su «oggi» UTC (6 call-site, §6): benigno e misurato, da valutare con la 16.4 che tocca già quelle scansioni. |
| **TD 16.1-b** | Tre call-site di pagina sulle tariffe + default del form scadenze su «oggi» UTC (§6): visualizzazione, nessun effetto sul denaro. |
| **TD 16.1-c** | **Finding nuovo**: 7 copie client di `todayDateOnly()` in UTC = il terzo calendario, non nominato da nessun audit (§6). **Serve una decisione PO** sulla casa (16.6 o epic 18) prima di aprirlo. |
| **TD 16.1-d** | `period-presets.ts#romeDateParts` = quarta implementazione (corretta) di «parti di calendario Roma»: consolidamento, non correttezza. |
| **TD 16.1-e** | Classe di flake latente: 6 helper `todayDateOnly()` UTC negli spec e2e vs aggregati di mese Roma (§5). |

---

## Dev Agent Record

*(da compilare dal dev subagent — §A verifica della ricognizione sul HEAD corrente, §B riepilogo per AC con le prove, §C censimento di AC 8 classificato voce per voce, §D tabella guardia → discriminanza con sha256 del ripristino, §E conteggio delle righe storiche di AC 7, §F deviazioni motivate, §G TD da registrare, §H file toccati, §I cosa NON ho fatto, §J gate ed esiti verbatim)*
