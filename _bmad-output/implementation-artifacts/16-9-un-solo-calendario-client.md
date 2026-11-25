---
baseline_commit: 58e1d94
---

# Story 16.9: Un solo calendario anche nel browser e nelle pagine

## §R — Riallineamento su `dev@56c6664` (2026-11-03, sessione principale) — **PREVALE su tutto il resto del file**

Il file è misurato su `58e1d94` (2026-09-10). Da allora 19.3/19.4 hanno già chiuso due copie e la coerenza della Flotta; tre story della 19.x hanno passato a questa story il **dominio Scadenze in UTC**. Dove il resto del file contraddice questa sezione, vale questa sezione.

**Censimento rieseguito su HEAD** (`grep -rn "function todayDateOnly" src/app src/components`): **5** copie (erano 7) — `people/[id]/account-section.tsx:199`, `billing/transaction-editor.tsx:73`, `instructors/instructors-console.tsx:444`, `logbook/flight-editor.tsx:201`, `pilots/pilots-console.tsx:760`; `toISOString().slice(0,10)` = le stesse 5 righe; `new Date().toISOString()` = 6 (le 5 + `dashboard/page.tsx:1002`, un istante, fuori perimetro); `getFullYear|getMonth|getDate` = 15 (+ `calendar-popover.tsx:85` `dayBefore`, 19.3). Sparite: #3 `aircraft-editor` (convertita in `2e66d40`, `aircraft-editor.tsx:398` `useState(() => todayDateOnlyInZone(APP_TIMEZONE))`), #5 `instructor-rates-panel.tsx` (cancellato in `e160065`; il successore `instructor-editor.tsx:350` è su Roma). **Ottava copia (Addendum)**: `src/components/dashboard/expiry-editor.tsx:38` (`addMonthsClampUtc(todayDateOnlyUtc(), validityMonths)` in `precompileExpiresAt`) → diventa **AC 21**.

**OBSOLETE**: AC 7 (`fleet/page.tsx:70` già `todayDateOnlyUtcInZone(APP_TIMEZONE)`, 19.3 D-8), AC 8 (eliminato: la correzione della finestra di mese della Flotta è atterrata con la 19.3 e l'unit eserciterebbe solo la formula; la giuntura la copre l'AC 15), AC 9 (`currentRateOf` rimosso dalla 19.3: l'editor riceve le tariffe dal server, `fleet/page.tsx:80-82`), AC 10 (`dashboard/page.tsx` non chiama più `getEffectiveRates`; le due «oggi» `:250`, `:847` sono già su Roma); task §3.6 punti 8, 9, 13; il re-export di `rates.service` (già tolto).

**NEEDS CHANGE**:
- **AC 1/3/20**: i call-site sono **5 + `expiry-editor`**. Conto finale: 7 copie censite dalla 16.1 = 2 chiuse da 19.3/19.4 + 5 sostituite qui + l'ottava. Il residuo UTC di `pilots/page.tsx` è a `:60` (non più «della 16.4», superseded) — entra nel perimetro, v. decisione D-R1.
- **AC 2**: riferimento Capodanno `instructors-console.tsx:449-451` (`yearStartDateOnly`).
- **AC 4**: test a `billing.spec.ts:364-382`; writer `accounts.service.ts:758`; `movements.spec.ts` non esiste più → usare `todayRome()` di `e2e/helpers.ts:163`.
- **AC 5**: `cash-register.spec.ts` helper `submitCashMovement` (`:54-67`, data a `:61`); kind predefinito `payment` → `value={date}` a `transaction-editor.tsx:337`.
- **AC 6**: resta **solo Contabilità** (`TransactionEditor` montato senza condizione, `billing-console.tsx:1193`, `value=` controllato `:337`/`:341`). La Flotta esce.
- **AC 11**: resta il doc-comment **falso** di `date-only.ts:36-47` (e `expiry-status.ts:6/:12`, `zoned-time.ts:189`) — con D-R2 si riscrivono/cancellano insieme all'helper.
- **AC 13**: `periodLabel` a `:69,:73,:81,:87,:93,:108` (definita a `:60`); `intlLocale` fuori dal formatter serve solo a `fleetUtilization` `:142`; anche `monthLabel`/`yearLabel` nei bottoni del toggle `:121`/`:129`; `reports/page.tsx` importa `todayDateOnlyInZone` e `APP_TIMEZONE`.
- **AC 14**: `calendar-popover.tsx:93` → `:107`.
- **AC 15**: fixture `mobile-registries.spec.ts:260` (`addDaysUtc(0)`, voli `:268-269`), assert `:291`. Motivazione nuova: la finestra è già Roma dalla 19.3, quindi su HEAD la fixture è un flake latente il 1° del mese fra 00:00 e 01:00/02:00. Usare `todayRome()`. Guardia volo `flights.service.ts:588`.
- **AC 16**: TD 16.1-e su HEAD = 5 helper (`billing.spec.ts:53`, `cash-report:47`, `reports:57`, `mobile-billing:58`, `my-compensation:125`). Spec da aggiungere: `expiry-registration.spec.ts:233` (`addMonthsUtc(todayUtc(), 24)` → `todayRome()`, via l'helper locale `todayUtc` `:38-40`), `instructor-compensation.spec.ts:166-171` (il commento «`periodEnd` is the BROWSER's today» diventa falso; finestra `[periodEnd, +1]` resta verde), `typeahead-pickers.spec.ts:64` (v. D-R4), e le fixture Scadenze di D-R1.
- **AC 18**: via le note «modificati dalla 16.2». Il DB lo resetta **solo la sessione principale** (ricetta HANDOFF, non `docker compose down -v` di §5). Arbitro fuori dalla fascia 23:40-01:00 di Roma.
- **AC 19**: discriminanze AC 2 (due stagioni), AC 2 Capodanno, AC 12, AC 21 (helper), D-R1 — **solo su copia isolata con sha256**, mai in place.

**Decisioni della sessione principale (2026-11-03; tecniche/di perimetro, il dominio è già deciso dall'invariante «un solo calendario» del piano `:29` e dal P5 della 16.4)**:
- **D-R1 — il dominio Scadenze in UTC ENTRA qui** (passato alla 16.9 da 19.7a D-9, 19.7b D-21, 19.9 TD-19.9-b): `expiries.service.ts:139/247/296`, `expiry-alerts.service.ts:110`, `pilots/page.tsx:60` (oggi due calendari su due righe adiacenti, `:60` UTC e `:61` Roma) → `todayDateOnlyUtcInZone(APP_TIMEZONE)`. Riusare i test progettati nella 16.4 AC 11/12 (`16-4-…md:279-300`) come discriminanze. Analizzare le fixture `addDaysUtc` degli spec Scadenze vicino alle soglie (`expiry-dashboard.spec.ts:161` `addDaysUtc(3)`, `:185` `addDaysUtc(30)`, `expiry-alerts.spec.ts`, `mobile-expiries-movements.spec.ts`): «sicure» dichiarate o convertite a `todayRome()`. Chiude TD-19.9-b.
- **D-R2 — `todayDateOnlyUtc` si cancella** (orfano dopo D-R1 + AC 21): via anche `date-only.test.ts:27-56` (compreso il pin della divergenza AD-7) e i doc-comment che lo citano; gli unit di `expiry-alerts.service.test.ts:58-293` passano a `todayDateOnlyUtcInZone`.
- **D-R3 — AC 8 eliminato** (v. sopra).
- **D-R4 — TD-19.10-b** (`typeahead-pickers.spec.ts:64`, rosso 00:00-01:00 Roma, usa il prefill UTC di `flight-editor.tsx:220`): dichiarato «atteso chiuso dalla 16.9», con la misura dentro la fascia come residuo esplicito — non affermato chiuso senza un run in fascia.
- **AC 21 (Addendum)**: `expiry-editor.tsx:38` `todayDateOnlyUtc()` → `todayDateOnlyUtcInZone(APP_TIMEZONE)`; pin e2e `expiry-registration.spec.ts:233`; prova unit solo sull'helper (`precompileExpiresAt` è privato in un `.tsx`, vitest raccoglie solo `src/**/*.test.ts` in env node).

**Fatti nuovi su HEAD**: idioma e2e `todayRome()`/`addDaysIso()` in `e2e/helpers.ts:163/168` (11 spec; precedenti `aircraft-rates.spec.ts:224`, `instructor-rates.spec.ts:108/120`) — mai importare da `src/`. Idioma client `useState(() => todayDateOnlyInZone(APP_TIMEZONE))` (`aircraft-editor.tsx:398`, `instructor-editor.tsx:350`); in `transaction-editor.tsx:93` è sostituzione pura, nessun hook nuovo. `zoned-time.ts` è usabile lato client (importa solo `@/lib/date-only`); il commento di `bookings-table.tsx:53` («server-only») è falso: segnalarlo nel record, non correggerlo. `DateInput`/`CalendarPopover`: il `min` limita anche popover e «Oggi», con `minDate` in ora locale → aggiungere al TD 16.9-a (invisibile per un browser in Italia). TD-19.10-a (fixture a ora±20 min che attraversano la mezzanotte) NON si sovrappone. Nessuna stringa nuova: diff di `messages/*.json` vuoto. Righe spostate: `account-section.tsx:862` (prefill ricarica, montato solo con `topUpOpen`), `transaction-editor.tsx:93/122/337/341`, `instructors-console.tsx:449-451/:473` (resta un doc-comment che cita `fleet/aircraft-editor.tsx#todayDateOnly` inesistente, `:443`), `flight-editor.tsx:220/263/306/858`, `pilots-console.tsx:786/817`; montaggi `pilots-console.tsx:589`, `instructors-console.tsx:254`, `logbook-console.tsx:807-808`, `dispatch-flight-button.tsx:51`. Importano già `@/lib/time`: account-section, instructors-console, flight-editor, pilots-console; non lo importano transaction-editor ed expiry-editor.

**Stima**: taglia S/M (≈ 1/6 della 19.7a) con D-R1. Nessuno split. Dev **Opus** (5 componenti client + expiry-editor).

Status: **done** (2026-11-25, v. record finale) — pronta il 2026-09-10. **Modello dev**: **Opus 5 xhigh** — la story tocca **sette componenti client** (regola utente 2026-07-29: se una story scrive UI, il dev è Opus 5 xhigh). Review: **Opus 5 xhigh adversarial**, come sempre. Skill obbligatorie per il dev: `.claude/skills/karpathy-guidelines/SKILL.md` (questa story è **chirurgia**: ~30 righe di produzione, di cui 21 sono **cancellazioni**), `design-taste-frontend` e `ui-ux-pro-max` per la regola «story con UI» — con l'avvertenza che qui **non cambia un pixel**: nessun layout, nessun token, nessuna stringa nuova (§6). Le due skill servono alla **verifica** interattiva, non a un ridisegno.

> ⚠️ **DIPENDENZA DURA (soddisfatta su questo HEAD)**: la story riusa `todayDateOnlyInZone(timeZone)` e `todayDateOnlyUtcInZone(timeZone)` di `src/lib/zoned-time.ts`, il secondo **nato con la 16.1**. Verificato su `58e1d94`: `zoned-time.ts:178` e `:195` esistono, e la 16.1 è `done` (commit `58e1d94`). Se `grep -n "todayDateOnlyUtcInZone" src/lib/zoned-time.ts` tornasse vuoto, **fermarsi**: non reimplementare l'helper (sarebbe la seconda formula che la 16.1 esiste per eliminare).
>
> ⚠️ **Baseline e lavoro parallelo**: `58e1d94` è il HEAD su cui ho misurato **ogni `file:riga`** di questo file. **Due file di questa story sono in lavorazione dalla 16.2 in questo momento** (`git status`): `src/app/[locale]/dashboard/logbook/flight-editor.tsx` e `src/app/[locale]/dashboard/page.tsx` — le righe che cito vengono da `git show HEAD:<path>` e nel worktree sporco sono **già slittate** (misurato: l'helper di `flight-editor.tsx` è a `:230` su HEAD e a `:235` nel worktree). Sporchi anche `e2e/reports.spec.ts` e `messages/{it,en}.json`. **Il dev rilegge le righe sul HEAD del momento e corregge questo file dove sono slittate** — prassi che ha pagato in tutto l'epic 15, in AOG-1b, nella 16.1.
>
> ⚠️ **Confine con la 16.4**: `dashboard/pilots/page.tsx:55` (l'«oggi» UTC del chip documenti bloccanti) **NON è di questa story**: la 16.4 lo ha rivendicato esplicitamente (`16-4-tipo-scadenza-disattivato.md` §7, «rientra in **questa** story, non nella 16.9 […] la 16.9 resta limitata alle sette copie client di `todayDateOnly()`»). Lo stesso file 16.4 riscrive il doc-comment di `src/lib/date-only.ts:37-46` che **anche questa story deve correggere** (AC 11): chi atterra secondo **rilegge e riconcilia**, non sovrascrive.
>
> **Da leggere PRIMA di scrivere una riga**: la sezione **«Story 16.9»** e **«Architettura e vincoli»** di `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` (**contratto**, gli AC di record); `_bmad-output/implementation-artifacts/16-1-un-solo-calendario.md` §6 (il censimento che ha scoperto le 7 copie) e §1 AD-1 (perché l'helper vive in `zoned-time.ts` e perché **non** ha un default di fuso implicito); `_bmad-output/implementation-artifacts/16-1-review-report.md` **§MINOR-3** (il bordo di mese di `fleet/page.tsx`, con la misura) e **§LOW-1** (le due etichette process-local, con la misura).

---

## Story

As **un utente che apre un form dopo mezzanotte** (e come **admin che guarda la Flotta o la Prima nota alle 00:30 del 1° del mese**),

I want che la data precompilata, la finestra «Ore mese» e il titolo del mese dicano **oggi secondo il calendario dell'aviosuperficie**,

so that nessuno registri un movimento datato **ieri** senza accorgersene, la barra delle ore volate non sommi **il mese precedente intero**, e la pagina non titoli **agosto** sopra i numeri di **settembre**.

### Il perché: dopo la 16.1 il server è su Roma, e il browser è rimasto indietro

La 16.1 ha portato su Europe/Rome i **sette writer di «oggi»** del server. Non ha toccato — per confine dichiarato — i tre posti dove «oggi» nasce **fuori** da quei writer:

| Dove | Formula | Calendario |
|---|---|---|
| **7 componenti client** (`todayDateOnly()`, 7 copie identiche) | `new Date().toISOString().slice(0, 10)` | **UTC** |
| **2 pagine server** di visualizzazione | `todayDateOnlyUtc()` | **UTC** |
| **2 etichette** di mese/anno | `Intl.DateTimeFormat(…)` **senza** `timeZone` | **fuso del PROCESSO** (UTC in produzione, `period-presets.ts:11`) |

Il risultato è che oggi, alle 00:30 di Roma, **la stessa schermata mente a se stessa**. Il caso più netto non è un default correggibile a mano: è un campo **disabilitato**.

```tsx
// src/app/[locale]/dashboard/billing/transaction-editor.tsx:341  (kind = "Addebito conto")
<DateInput value={todayDateOnly()} disabled data-testid="transaction-date" />
```

Quel campo **non è un prefill**: è la promessa di quale data valuta il server scriverà. E il server, dalla 16.1, scrive:

```ts
// src/server/services/accounts.service.ts:654  (recordAdjustment)
effectiveDate: todayDateOnlyUtcInZone(APP_TIMEZONE),
```

Fra le 00:00 e le 02:00 di Roma la UI dice **ieri** e il ledger registra **oggi**. Non è un difetto introdotto dalla 16.1: la 16.1 ha corretto un lato e ha **reso visibile** che l'altro era sbagliato da sempre.

E c'è un dettaglio che dice quale fosse l'intenzione originale: **tre delle sette copie hanno un doc-comment che dichiara «browser-local»**.

```tsx
// fleet/aircraft-editor.tsx:230
/** Same browser-local "today" `YYYY-MM-DD` default as the legacy `RatesPanel`'s `todayDateOnly`. */
// instructors/instructors-console.tsx:439
/** Browser-local `YYYY-MM-DD` — same convention as every other `<input type="date">` default in this codebase … */
// instructors/instructor-rates-panel.tsx:70
/** `<input type="date">` default — same browser-local-time convention as `fleet/aircraft-editor.tsx#todayDateOnly`. */
```

`toISOString()` è **UTC**, non browser-local. I commenti descrivono un codice che non esiste: chi li ha scritti voleva il calendario dell'utente e ha ottenuto quello di Greenwich. Questa story mantiene l'intenzione (per un utente in Italia il calendario dell'utente **è** quello dell'aviosuperficie) scegliendo l'unico calendario che è giusto su **entrambi** i lati del render — v. AD-1.

### Fatti misurati che vincolano il design

Probe rieseguibile (fuori dal repo): `/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/story-16-9/client-calendar.probe.test.ts` + `vitest.probe.config.mjs`, lanciato con `TZ=UTC npx vitest run --config … --reporter=verbose --silent=false` → **9 passed**.

| Fatto | Misura (su `58e1d94`) | Conseguenza sul design |
|---|---|---|
| Il difetto delle 7 copie è **riproducibile** | `A1 copy(UTC) = 2026-08-31 \| Rome = 2026-09-01` (istante `2026-08-31T22:30:00.000Z`, CEST); `A2 copy(UTC) = 2026-01-31 \| Rome = 2026-02-01` (CET) | la discriminanza è **già scritta**, in due stagioni |
| «Ieri» diventa **anno sbagliato** in un caso | `A3 copy yearStart = 2026-01-01 \| Rome yearStart = 2027-01-01` (`instructors-console.tsx:446` deriva l'anno da `todayDateOnly()`) | il payout del 1° gennaio propone un periodo che parte **13 mesi prima** |
| Un test scritto a mezzogiorno **non discrimina** | `A4`: alle 12:00 Roma le due formule coincidono | ogni test di questa story fissa l'orologio in `[00:00, 02:00)` Roma |
| Il bordo di mese della Flotta è **un mese intero**, non un giorno | `B1 pre-fix window = { from: '2026-08-01', to: '2026-08-31' }` vs `post-fix = { from: '2026-09-01', to: '2026-09-01' }` | il fix vale **una riga** e ne corregge **due** (tariffe + finestra), v. AD-3 |
| Le etichette sbagliano il **mese** e l'**anno** | `C1 process TZ = UTC \| bare = agosto 2026 \| zoned = settembre 2026`; `C2 getFullYear() = 2026 \| Rome year = 2027` | e sono **invisibili in locale** (`TZ=Europe/Rome` le rende corrette): la prova va scritta con `timeZone` esplicito, non col fuso della macchina |
| Roma nel browser **esiste già in produzione** | `bookings/schedule.tsx` (`'use client'`) importa `@/lib/booking-schedule`, che a `:73`/`:78` chiama `zonedWallTime(instant, APP_TIMEZONE)` da `@/lib/zoned-time`; `@/lib/time` è importato da **21** componenti client | l'import di `zoned-time`/`APP_TIMEZONE` in un client component è **prassi misurata**, non un rischio da valutare |
| `zoned-time.ts` è **puro** | `grep '^import' src/lib/zoned-time.ts` → 1 riga (`@/lib/date-only`, che non importa nulla); `src/lib/time.ts` → **0** import | nessuna catena verso `@/lib/env` (la trappola di CLAUDE.md), nessun `server-only` |
| I pannelli sono **renderizzati anche da chiusi** | `slide-over.tsx:24`: *«the panel is rendered, not unmounted, when closed»* (load-bearing), e i 7 editor sono montati **senza condizione** dai loro console (`billing-console.tsx:1193`, `pilots-console.tsx:552`, `instructors-console.tsx:250`, `fleet-console.tsx:303`, `logbook-console.tsx:966`, `dispatch-flight-button.tsx:51`, `instructor-editor.tsx:177`) | «oggi» viene calcolato **anche in Node**, al render della pagina: v. AD-1, idratazione |
| Due dei sette valori finiscono nell'**HTML del server** | controllati: `transaction-editor.tsx:337`/`:341` (`value={date}` / `value={todayDateOnly()}`) e `aircraft-editor.tsx:661` (`value={rateValidFrom}`). I registrati con react-hook-form (`register()` non emette `value`: `account-section.tsx:686`, `aircraft-editor.tsx:1103`, `instructor-rates-panel.tsx:119`, `pilots-console.tsx:739`, `instructors-console.tsx:469`, `flight-editor.tsx:253`) sono riempiti **dopo** il mount | un helper **browser-local** produrrebbe un valore diverso fra Node (UTC) e browser: due `value` diversi fra HTML e idratazione. Un helper **Roma** non ha niente da divergere |
| L'idioma dell'orologio finto è **già in casa** | `vi.useFakeTimers()` + `vi.setSystemTime()`; `zoned-time.test.ts:217-256` e `date-only.test.ts:40-56` lo usano già ai bordi di questa story | zero infrastruttura di test nuova |
| Vitest **non raccoglie `.tsx`** | `vitest.config.ts:7` `include: ['src/**/*.test.ts']`, `environment: 'node'`; `find src -name '*.test.tsx'` → **0** | non esistono test di componente: la prova unit vive in `src/lib/*.test.ts`, la prova di superficie negli e2e (AC 4/5) |
| Il numero e la stringa nell'ICU rendono **identici** | `node -e` con `intl-messageformat`: `it number: "Anno 2026" \| string: "Anno 2026"` | AC 13 può tenere `number` per stabilità di tipo **senza** rischiare un cambio di resa |

---

## §0 — Requisiti FISSI

Contratto: piano epic 16-18, sezione **«Story 16.9»**, più i due TD che questa story **assorbe** per decisione della sessione principale del 2026-09-10 (**TD 16.1-b** e **TD 16.1-c**, `sprint-status.yaml:512`).

| # | Requisito (**AC di record**) |
|---|---|
| **P1** | Delle **sette copie** client di `todayDateOnly()` ne resta **UNA** implementazione in `src/lib`, usata da tutti i form; un **unit con orologio fittizio alle 00:30 Roma** prova che il prefill è **oggi**. |
| **P2** | Il **server** resta l'autorità: nessun cambio alle guardie (16.1). Una data precompilata arriva e viene validata come oggi. |
| **P3** | I **due call-site di pagina** ancora su «oggi» UTC passano a Roma: `dashboard/page.tsx:295` (lookup tariffe) e `dashboard/fleet/page.tsx:65`, che è **anche un bordo di mese** (`monthStart` + finestra di `sumFlightMinutesByAircraft` contro una colonna `flightDate` **Roma**) — misurato: alle 00:30 Roma del 1° la barra «Ore mese» somma **il mese precedente intero** (review 16.1 §MINOR-3). Unit al bordo. |
| **P4** | Le **due etichette process-local** passano a `timeZone: APP_TIMEZONE` / parti di calendario Roma: `billing/page.tsx:128` e `reports/page.tsx:58-59` — alle 00:30 Roma del 1° la Prima nota titola il mese precedente sopra i numeri del mese nuovo, e a Capodanno Statistiche dice l'anno vecchio (review 16.1 §LOW-1). **Riusare** ciò che esiste: **nessuna quinta implementazione** delle parti di calendario Roma (il consolidamento di `period-presets.ts#romeDateParts` è **TD 16.1-d**, fuori scope). |

| # | Invariante (da «Architettura e vincoli», valida per tutto l'epic 16) |
|---|---|
| **[I-a]** | **Un solo calendario**: ogni «oggi», «giorno del volo», `effectiveDate` **e bordo di mese** si calcola in **Europe/Rome** con **gli helper esistenti**. Nessun `new Date()` confrontato con una data-only senza fuso. |
| **[I-b]** | **Guardie e comportamenti nascono con una discriminanza**: ogni correzione qui è provata **ROSSA sul pre-fix simulato**, con repo ripristinato **byte-identico** dopo (sha256 dichiarato). |
| **[I-c]** | **Una `@db.Date` si lega sempre come `Date` a mezzanotte UTC** (lezione review 3.5 F1, `date-only.ts:10-16`). `todayDateOnlyUtcInZone` restituisce quella forma; `todayDateOnlyInZone` restituisce la **stringa** `YYYY-MM-DD`, che è la forma di un `<input type="date">` e del wire. Non confonderle. |
| **[I-d]** | **UI additiva e invarianza misurata**: nessuna regola CSS nuova, nessun testid nuovo, nessuna stringa i18n nuova. Il desktop e il mobile restano **identici al centesimo** (§6). |

### Ratifiche che vincolano QUESTA story

| R | Decisione | Effetto vincolante qui |
|---|---|---|
| **Nessuna nuova** | Il piano non elenca ratifiche PO per la 16.9; l'assorbimento dei TD 16.1-b/c è **decisione della sessione principale** del 2026-09-10. | Il dev **non apre AskUserQuestion** per il perimetro. Se emerge un'assumption di dominio nuova, vale la regola di progetto: si ratifica **prima** (retro Epic 9). Le due domande aperte di §7 sono **per la sessione principale**, non per il dev. |
| **R-16-h** (16.6) | Una `effectiveDate` **futura** oltre «oggi Europe/Rome» sarà **rifiutata al bordo Zod** (422). | Rafforza AD-1: un prefill **Roma** è per costruzione ≤ oggi-Roma e resta accettato; un prefill sul fuso del **browser** potrebbe, per un browser a est di Roma, proporre una data che la 16.6 rifiuterà. |
| **16.1 / AD-1** | `zoned-time.ts` è **parametrizzato per costruzione**: «nessuna delle sue 7 funzioni esportate nasconde la zona». | Vieta la scorciatoia «aggiungo `todayDateOnlyAirfield()` senza argomenti»: i call-site scrivono `todayDateOnlyInZone(APP_TIMEZONE)`, come i sette writer del server scrivono `todayDateOnlyUtcInZone(APP_TIMEZONE)`. |

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — **Nessuna funzione nuova**: le 7 copie diventano `todayDateOnlyInZone(APP_TIMEZONE)`

Le sette copie restituiscono una **stringa `YYYY-MM-DD`**. In `src/lib/zoned-time.ts` quella funzione esiste già, esportata, documentata e usata dal server:

```ts
// src/lib/zoned-time.ts:178
export function todayDateOnlyInZone(timeZone: string): string {
  return dateOnlyInZone(new Date(), timeZone);
}
```

Il fix è quindi **una cancellazione più un import**: −7 funzioni private (21 righe), +0 righe in `src/lib`. È la forma più karpathy possibile del requisito P1 («ne resta UNA in `src/lib`»): quella UNA **c'è già**.

**Perché Roma e non «locale del browser»** — il contratto la nomina come *«data-only locale del browser, che per l'utente in Italia coincide col calendario dell'aviosuperficie»*. Implemento **il calendario dell'aviosuperficie**, che per quell'utente è **lo stesso valore**, e che è l'unico corretto sui tre fronti che ho misurato:

1. **Idratazione.** I sette editor sono montati **senza condizione** e `SlideOver` **non smonta** i figli da chiuso (`slide-over.tsx:24`): «oggi» viene calcolato anche nel render di Node. Per due dei sette il valore finisce **nell'HTML** (`transaction-editor.tsx:337`/`:341`, `aircraft-editor.tsx:661`, controllati). Un helper browser-local darebbe **UTC** in Node e **Roma** nel browser: nella finestra notturna React idrata un `value` diverso da quello servito — la classe di difetto più difficile da vedere, perché non c'è messaggio d'errore su un attributo di form. Con Roma **non c'è niente che possa divergere**, e non serve nessun `useEffect` di mount né stato «calcolato dopo il primo render» (nessun altro prefill in questa codebase lo fa: sarebbe un idioma nuovo per un difetto che scompare da solo).
2. **Invariante [I-a]**, che dice *ogni* «oggi», senza distinguere server e browser.
3. **Coerenza col ledger**: il campo disabilitato di `transaction-editor.tsx:341` deve mostrare **esattamente** ciò che `recordAdjustment` scriverà (`accounts.service.ts:654`, Roma). È una **promessa**, non un default.

**Residui dichiarati, non corretti** (per un browser in Italia sono invisibili; v. §6 e TD 16.9-a): il layer *widget* resta browser-local — `date-input.tsx:97` (`const today = new Date()`, bordo `.today` e bottone «Oggi») e `flight-editor.tsx:205-215` (`composeFlightTimes` interpreta data+ora nel fuso del browser). Sono **presentazione e composizione**, non «oggi» come valore di dominio, e il doc-comment di `date-input.tsx:58` lo dichiara già (*«a client-side calendar WIDGET, never an instant»*).

**Costo import**: 6 dei 7 file importano già da `@/lib/time` (basta aggiungere `APP_TIMEZONE` al gruppo esistente: `account-section.tsx:34`, `aircraft-editor.tsx:27`, `instructors-console.tsx:33`, `instructor-rates-panel.tsx:12`, `flight-editor.tsx:35`, `pilots-console.tsx:39`); solo `transaction-editor.tsx` ne acquisisce uno nuovo. Tutti e 7 acquisiscono `import { todayDateOnlyInZone } from '@/lib/zoned-time';`, dopo `@/lib/time` nell'ordine alfabetico del gruppo `@/lib/*` che il repo usa (`dashboard/page.tsx:20-21`: `@/lib/time` poi `@/lib/zoned-time`). **Nessuna regola eslint di import order** (verificato) → l'ordine è convenzione, non gate: rispettarla comunque.

### AD-2 — I sette call-site, e nessun ottavo

Righe su `58e1d94` (`flight-editor.tsx` va **riletto**: la 16.2 lo sta modificando).

| # | File | Helper | Consumi | Il valore va | Nell'HTML del server? |
|---|---|---|---|---|---|
| 1 | `people/[id]/account-section.tsx` | `:159-161` | `:639` | `defaultValues.effectiveDate` del form Ricarica → **POST** `/people/{id}/account/top-ups` | no (react-hook-form) |
| 2 | `billing/transaction-editor.tsx` | `:73-75` | `:93` (`useState`), `:122` (`reset`), `:341` (campo **disabilitato**) | `effectiveDate` di ricarica/cassa (**POST**) **e** la data che il server sceglierà per l'addebito | **sì** (`value=` controllato) |
| 3 | `fleet/aircraft-editor.tsx` | `:230-233` | `:264` (`currentRateOf`), `:420` (`useState`), `:1103`, `:1143` | `validFrom` della tariffa nuova (**POST**) **e** il confronto «tariffa in vigore» **lato client** | **sì** (`:661` `value=`) |
| 4 | `instructors/instructors-console.tsx` | `:439-442` | `:446` (`yearStartDateOnly`), `:469` | `periodStart`/`periodEnd` del payout → **POST** `/instructor-payouts` | no (rhf `values`) |
| 5 | `instructors/instructor-rates-panel.tsx` | `:70-73` | `:87` (`currentRateOf`), `:119`, `:160` | `validFrom` (**POST**) **e** «tariffa in vigore» lato client | no (rhf) |
| 6 | `logbook/flight-editor.tsx` | `:230-232` | `:253` | `flightDate` del form volo → composto in `takeoffAt`/`landingAt` (**POST** `/flights`) | no (rhf) |
| 7 | `pilots/pilots-console.tsx` | `:713-715` | `:739`, `:770` | `effectiveDate` della ricarica (**POST**) | no (rhf) |

**Nessuno dei sette è un'autorità**: dove il valore parte verso il server, la guardia del server decide (P2, 16.1 — `flights.service.ts:763` (HEAD; nel worktree della 16.2 è `:784`) per il volo, e la 16.6 per la data valuta). Dove **non** parte (i due `currentRateOf`, `:264` e `:87`, e il campo disabilitato `:341`) il valore è **ciò che l'utente legge**, e allora la sua correttezza è tutta lì.

**Il caso 3 è anche una coerenza di pagina** (lezione AOG-1a MINOR-1, «misurare la PAGINA»): `currentRateOf` sceglie *client-side* la riga con `validFrom <= today` e `fleet/page.tsx:73` sceglie *server-side* la tariffa con `getEffectiveRates(actor, ids, today)`. Oggi sono **entrambi UTC** (coincidono, entrambi sbagliati); dopo la story devono essere **entrambi Roma**. Convertire uno solo dei due lascerebbe, nella finestra notturna, la card della Flotta e il pannello aperto sopra di essa a nominare **due tariffe diverse**. → i due fix vivono **nello stesso commit** (AC 9).

### AD-3 — `fleet/page.tsx`: **una** riga, e `monthStart` si corregge da sé

```ts
// src/app/[locale]/dashboard/fleet/page.tsx:65-74  (HEAD, verbatim)
  const today = todayDateOnlyUtc();
  const now = new Date();
  const monthStart = parseDateOnlyUtc(`${toDateOnlyString(today).slice(0, 7)}-01`);
  const [currentRatesById, reservedIds, monthMinutesById] = await Promise.all([
    getEffectiveRates(actor, ids, today),
    listReservedAircraftIds(actor, ids, now),
    sumFlightMinutesByAircraft(actor, ids, monthStart, today),
  ]);
```

`sumFlightMinutesByAircraft` (`aircraft.service.ts:723-736`) filtra `flightDate: { gte: from, lte: to }`, e `flightDate` **è un giorno Roma** (`flights.service.ts#deriveFlightDate`). La finestra è UTC, la colonna è Roma.

**Il fix è la sola riga `:65`**: `todayDateOnlyUtc()` → `todayDateOnlyUtcInZone(APP_TIMEZONE)`. `monthStart` **non si tocca**: deriva da `today` e diventa Roma per costruzione (probe B1: `{from:'2026-09-01', to:'2026-09-01'}`). `.slice(0, 7)` su una `Date` a mezzanotte UTC del giorno **Roma** è aritmetica di calendario pura — esattamente la carica dichiarata di `date-only.ts` (`:10-16`).

**Cosa NON fare**, e perché: **non** introdurre qui `zonedMidnightUtc` né `romeDateParts` né `currentMonthRange()`. `zonedMidnightUtc` produce un **istante** (`2026-08-31T22:00:00.000Z`), che è la forma sbagliata da legare a una `@db.Date` ([I-c]: sarebbe la lezione review 3.5 F1 al contrario). `romeDateParts` è **privata** di `period-presets.ts` ed esportarla per una pagina aprirebbe TD 16.1-d dalla porta di servizio. `currentMonthRange()` sarebbe corretta ma cambierebbe **due** valori invece di uno e leggerebbe l'orologio una seconda volta, senza aggiungere niente.

**Costo dichiarato**: la pagina legge l'orologio due volte (`:65` e `:66`, come già oggi). Perché sia un problema servirebbe che la richiesta attraversasse la mezzanotte di Roma **fra due statement adiacenti**; e anche in quel caso i due valori resterebbero due giorni Roma consecutivi, non due calendari diversi. Accettato, dichiarato, non mitigato.

### AD-4 — `dashboard/page.tsx`: lo **stesso** idioma, non un secondo

```ts
// src/app/[locale]/dashboard/page.tsx  (HEAD)
:43   import { getEffectiveRates, todayDateOnlyUtc } from '@/server/services/rates.service';
:255    const now = new Date();
:256    const today = todayDateOnlyInZone(APP_TIMEZONE);      // <-- Roma, già qui
:295      getEffectiveRates(actor, allAircraftIds, todayDateOnlyUtc()),   // <-- UTC, 39 righe sotto
```

Due calendari nella stessa `Promise.all`, a 39 righe di distanza. Il fix è `todayDateOnlyUtcInZone(APP_TIMEZONE)` a `:295`.

**Alternativa scartata**: `parseDateOnlyUtc(today)` riuserebbe la stringa Roma già in scope e leggerebbe l'orologio zero volte in più. La scarto perché darebbe **due forme diverse** per la stessa nozione nelle due pagine gemelle (qui `parseDateOnlyUtc(today)`, in Flotta `todayDateOnlyUtcInZone(APP_TIMEZONE)`), e la 16.1 ha reso `todayDateOnlyUtcInZone(APP_TIMEZONE)` **l'idioma dell'epic** — sette writer del server lo scrivono già così. Un solo idioma vale più di una lettura d'orologio risparmiata. La deviazione è dichiarata qui, non va riaperta in review.

### AD-5 — Le due etichette: **una** funzione di presentazione in `src/lib/time.ts`

Le due righe difettose sono la **stessa** formula, con la **stessa** mappa di locale:

```ts
// billing/page.tsx:128
const monthLabel = new Intl.DateTimeFormat(displayLocale === 'en' ? 'en-IE' : 'it-IT', { month: 'long', year: 'numeric' }).format(new Date());
// reports/page.tsx:58
const monthLabel = new Intl.DateTimeFormat(intlLocale, { month: 'long', year: 'numeric' }).format(now);   // intlLocale = displayLocale === 'en' ? 'en-IE' : 'it-IT'
```

Diventano **una chiamata** a una funzione nuova in `src/lib/time.ts`, il modulo il cui doc-comment dichiara già *«this module only deals with duration conversion and the Europe/Rome presentation used by the UI»* (`:1-6`), accanto alle sue due gemelle con la **stessa** shape (`formatTimeOfDay:48`, `formatDateTime:62`, entrambe `timeZone: APP_TIMEZONE` + la stessa mappa `it-IT`/`en-IE`):

```ts
/**
 * Formats an instant as the `MMMM YYYY` month label of the Europe/Rome
 * calendar (story 16.9, review 16.1 LOW-1) — display only. Without the
 * explicit `timeZone` the label follows the PROCESS clock, which is UTC in
 * production (`period-presets.ts:11`): at 00:30 Rome on the 1st the Prima
 * Nota page titled the PREVIOUS month above the new month's numbers, whose
 * bounds come from `currentMonthRange()` (Rome).
 */
export function formatMonthYear(date: Date, locale: 'it' | 'en' = 'it'): string {
  return new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-IE', {
    timeZone: APP_TIMEZONE,
    month: 'long',
    year: 'numeric',
  }).format(date);
}
```

**Perché una funzione qui è giustificata e a §AD-1 no**: qui i call-site sono **due e identici**, il modulo di destinazione ha esattamente quella carica, e — decisivo — **senza una funzione l'AC non è verificabile**: una formula inline in una pagina RSC non ha nessun unit che possa chiamarla, e il gate diventerebbe «fidati del diff». Con la funzione la discriminanza vive in `src/lib/time.test.ts` accanto a quelle di `formatDateTime`. Non è una quinta implementazione delle **parti di calendario Roma** (P4): non produce parti, formatta per la vista, come le altre due funzioni del file.

**L'anno di Statistiche** (`reports/page.tsx:59`) resta **inline**, con l'idioma già in casa (`instructors-console.tsx:446` deriva l'anno da una data-only nello stesso modo):

```ts
const yearLabel = t('periodToggle.year', { year: Number(todayDateOnlyInZone(APP_TIMEZONE).slice(0, 4)) });
```

Un call-site solo → nessuna funzione. `Number(...)` e non la stringa: **misurato identico nella resa** (`intl-messageformat`: `"Anno 2026"` in entrambi i casi), quindi la scelta è solo di stabilità di tipo verso `next-intl`.

### AD-6 — Gli orfani che questa story crea si cancellano

| Orfano | Perché | Azione |
|---|---|---|
| `rates.service.ts:13` `export { todayDateOnlyUtc };` | Il re-export esiste per *«existing importers (`aircraft/page.tsx`)»* (`:8-12`), pagina cancellata da tempo. **Censimento su HEAD**: gli unici importatori sono `dashboard/page.tsx:43` e `fleet/page.tsx:9`, **entrambi convertiti da questa story** | cancellare `:13`, togliere il token `todayDateOnlyUtc` dall'import `:2` (`parseDateOnlyUtc`/`toDateOnlyString` restano, usati internamente), aggiornare il commento `:8-12` |
| Il doc-comment di `date-only.ts:37-46` | Enumera i consumatori legittimi rimasti: *«2 pagine di visualizzazione tariffe»* → dopo questa story **zero**. Resta vero per il dominio Scadenze (16.4) e per `expiry-editor.tsx:34` | riscrivere l'enumerazione. ⚠️ **La 16.4 riscrive le stesse righe**: chi atterra secondo **rilegge e riconcilia** |
| I 3 doc-comment «browser-local» | `aircraft-editor.tsx:230`, `instructors-console.tsx:439`, `instructor-rates-panel.tsx:70` descrivono una funzione che sparisce | cancellati con la funzione |

### AD-7 — Nessuna asserzione indebolita, e le due gemelle restano intatte

Le asserzioni esistenti si riallineano **al valore corretto**, mai si rilassano (disciplina AOG-1b AD-8, 16.1 AD-4). In particolare **devono restare verdi senza essere toccate**: `zoned-time.test.ts:201-215` (`todayDateOnlyInZone`, che questa story **estende** ai bordi, non riscrive) e `date-only.test.ts:40-56` (il pin della divergenza voluta fra i due helper: se diventa rosso, qualcuno ha «unificato» gli helper e ha riaperto il difetto della 16.1).

### AD-8 — La forma del fix è **sostituzione**, non riscrittura

Nessun componente cambia struttura, nessuna proprietà nuova, nessun hook nuovo, nessun `useEffect`. Per ciascuno dei 7 file il diff atteso è: −4 righe (doc-comment + funzione), +1/+2 righe di import, N sostituzioni di `todayDateOnly()` → `todayDateOnlyInZone(APP_TIMEZONE)`. Un diff che tocca il JSX di uno di questi file è **fuori perimetro** e va motivato.

---

## §2 — Acceptance Criteria

### L'helper unico (P1)

**AC 1** — Dopo la story `grep -rn "toISOString()\.slice(0, *10)" src/app src/components | grep -v "\.test\."` → **0 righe** e `grep -rn "function todayDateOnly" src/app src/components` → **0 righe**. `git diff --stat src/lib/zoned-time.ts` → **0** (l'helper esiste già, AD-1); `src/lib/date-only.ts` cambia **solo** il doc-comment (AD-6).

**AC 2** — Unit **discriminante** in `src/lib/zoned-time.test.ts`, dentro `describe('todayDateOnlyInZone')` (`:201`), con `vi.useFakeTimers()` + ripristino:
- a `2026-08-31T22:30:00.000Z` (00:30 CEST del 1° settembre) → `'2026-09-01'`, e la formula delle 7 copie (`new Date().toISOString().slice(0, 10)`, scritta nel test) → `'2026-08-31'`: **le due DEVONO divergere**, come `date-only.test.ts:40-56` pinna la divergenza gemella;
- a `2026-01-31T23:30:00.000Z` (00:30 CET del 1° febbraio) → `'2026-02-01'`;
- a `2026-12-31T23:30:00.000Z` → `'2027-01-01'`, cioè l'anno che `instructors-console.tsx:446` deriva (misura A3: oggi propone `2026-01-01`).

**AC 3** — I **sette** call-site di AD-2 usano `todayDateOnlyInZone(APP_TIMEZONE)`; il Dev Agent Record riporta la tabella con i `file:riga` **effettivi** (riletti sul HEAD del momento) e dichiara che non esiste un ottavo: il censimento di §3.4 elenca ciò che resta browser-local **per scelta** (`date-input.tsx:97`, `composeFlightTimes`, `localDateFromIso`) e ciò che resta UTC **per confine di story** (`expiry-editor.tsx:34`, `pilots/page.tsx:55`).

**AC 4** — **La promessa del campo disabilitato è vera** (il caso più forte della story): e2e in `e2e/billing.spec.ts` (test «Addebito conto (standalone adjustment)», `:365-385`), dopo `transaction-kind → adjustment`:
1. `expect(page.getByTestId('transaction-date')).toHaveValue(<giorno Roma calcolato dallo spec>)`;
2. dopo il submit, `GET /api/v1/people/{personId}/account/movements` → l'`effectiveDate` del movimento `ADJUSTMENT` creato è **lo stesso valore**.
Il giorno Roma lo calcola lo spec con l'idioma già in uso in `e2e/` (`movements.spec.ts:89`, `bookings.spec.ts:1532`, `mobile-expiries-movements.spec.ts:180`: `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', … })`) — **mai** importando da `src/`.

**AC 5** — **Il prefill visibile è oggi**: e2e in `e2e/cash-register.spec.ts`, in **un** test, subito dopo `waitForSelector('[data-testid="transaction-form"]')` e **prima** di riempirlo: `transaction-date` ha il valore del giorno Roma. (Il `kind` di default è `payment`, quindi il campo editabile `:337` è quello reso all'apertura.)

**AC 6** — **Nessun difetto di idratazione**: la verifica interattiva (Playwright MCP, o lo script `@playwright/test` throwaway se il MCP non è disponibile — workaround sanzionato, HANDOFF) apre le **tre** superfici con `value=` controllato (`/dashboard/billing` → nuovo movimento; `/dashboard/fleet` → editor velivolo, blocco Tariffe in creazione) e registra: console **senza** warning di idratazione né errori, e valore mostrato == giorno Roma. Il record dichiara la ragione strutturale (AD-1: il valore è funzione del solo istante e di un fuso **esplicito**, identico in Node e nel browser) e le misure lette.

### Le due pagine server (P3)

**AC 7** — `fleet/page.tsx:65` usa `todayDateOnlyUtcInZone(APP_TIMEZONE)`; `:71` (`monthStart`) è **byte-identica**; l'import `:9` non porta più `todayDateOnlyUtc`. `grep -rn "zonedMidnightUtc\|romeDateParts\|currentMonthRange" src/app/\[locale\]/dashboard/fleet/page.tsx` → **0 righe** (AD-3).

**AC 8** — Unit **discriminante** del bordo di mese in `src/lib/date-only.test.ts` (accanto al pin della divergenza), a `2026-08-31T22:30:00.000Z`, che replica la formula di `fleet/page.tsx:65-71` **chiamando gli helper reali** e cita nel commento `fleet/page.tsx:65-74`:
- pre-fix (`todayDateOnlyUtc()`): finestra `[2026-08-01 .. 2026-08-31]` — **tutto agosto**;
- post-fix (`todayDateOnlyUtcInZone(APP_TIMEZONE)`): `[2026-09-01 .. 2026-09-01]`.
Output atteso già misurato (probe B1, verbatim in §«Fatti misurati»). Residuo **da dichiarare** nel record: il test esercita la *formula*, non la riga della pagina (una pagina RSC non è unit-testabile); la cucitura è coperta dall'e2e di AC 15.

**AC 9** — **Coerenza della pagina Flotta**: `aircraft-editor.tsx:264` (`currentRateOf`, client) e `getEffectiveRates` di `fleet/page.tsx:73` (server) usano lo **stesso** calendario nello **stesso** commit. Il record lo dichiara con la conseguenza del non farlo (card e pannello che nominano due tariffe diverse fra le 00:00 e le 02:00). Idem per la gemella `instructor-rates-panel.tsx:87`.

**AC 10** — `dashboard/page.tsx:295` usa `todayDateOnlyUtcInZone(APP_TIMEZONE)`; **nessun'altra riga** della pagina cambia (`:256` era già Roma). ⚠️ File in lavorazione dalla 16.2: rileggere la riga.

**AC 11** — Orfani rimossi: `rates.service.ts:13` cancellata, `:2` senza `todayDateOnlyUtc`, commento `:8-12` aggiornato; `grep -rn "todayDateOnlyUtc" src/app src/server/services/rates.service.ts` → restano **solo** i consumatori del dominio Scadenze e `expiry-editor.tsx:34` (più `pilots/page.tsx:55` se la 16.4 non è ancora atterrata). Doc-comment di `date-only.ts:37-46` **vero** dopo la story, con la nota di riconciliazione verso la 16.4.

### Le due etichette (P4)

**AC 12** — `formatMonthYear(date, locale)` in `src/lib/time.ts` (AD-5), usata da `billing/page.tsx:128` e `reports/page.tsx:58`; unit **discriminante** in `src/lib/time.test.ts` a `2026-08-31T22:30:00.000Z`:
- `formatMonthYear(new Date(), 'it')` → `'settembre 2026'`, `'en'` → `'September 2026'`;
- la formula pre-fix (senza `timeZone`, scritta nel test) → `'agosto 2026'` **quando il processo è in UTC**.
⚠️ Il test **non deve dipendere dal fuso della macchina**: la parte «pre-fix» va confrontata sotto un fuso di processo noto o va sostituita da un `timeZone: 'UTC'` esplicito che riproduce il processo di produzione. Un test che passa solo con `TZ=Europe/Rome` (o solo senza) è scritto male: misurato, in locale la formula difettosa sembra **corretta**.

**AC 13** — `reports/page.tsx:59` calcola l'anno con `Number(todayDateOnlyInZone(APP_TIMEZONE).slice(0, 4))`; il tipo dell'argomento ICU resta `number`. Le altre 6 occorrenze di `periodLabel` (`:60`, `:71`, `:75`, `:85`, `:91`, `:97`, `:113`) e `intlLocale` per `transitSharePercent` (`:64`) **non cambiano**.

**AC 14** — `calendar-popover.tsx:93` (`month: 'long'` sul **cursore** del calendario) e `reports/page.tsx:18-23` (`shortMonthLabel`, `timeZone: 'UTC'` su una data costruita) **non cambiano**: il record dichiara perché (il primo formatta una `Date` locale di widget, il secondo una `YYYY-MM` già scelta — nessuno dei due è «adesso»).

### Non-regressione, blast radius, gate

**AC 15** — **L'unico spec e2e adattato è `e2e/mobile-registries.spec.ts`**, e il motivo è che questa story **cambia la finestra che quel test asserisce**: la fixture del test della barra ore (`:261`, `const today = addDaysUtc(0)`, flight a `${today}T10:00:00.000Z`) alimenta l'assert «Ore mese» = `1:00` (`:292-293`) contro la finestra di `fleet/page.tsx`, che diventa **Roma**. La fixture passa al giorno **Roma** (helper locale con l'idioma `Intl`/`en-CA` di `movements.spec.ts:89`), con il commento che spiega la dipendenza. Residuo dichiarato: nella finestra notturna l'istante `T10:00Z` sul giorno Roma è **avanti** rispetto all'orologio reale, e resta accettato perché la guardia del volo è **date-only** (`flights.service.ts:763` (HEAD; nel worktree della 16.2 è `:784`), 16.1) — se una story futura aggiungesse una guardia sull'**istante**, questa fixture è la prima da rivedere.

**AC 16** — **Nessun altro spec e2e cambia**, e il record dice **perché**, uno per uno (analisi in §3.5): i 7 helper `todayDateOnly()` UTC negli spec (`billing.spec.ts:52`, `cash-report.spec.ts:47`, `instructor-rates.spec.ts:48`, `aircraft-rates.spec.ts:59`, `reports.spec.ts:60`, `mobile-billing.spec.ts:58`, `my-compensation.spec.ts:124`) restano **TD 16.1-e**, che questa story **aggiorna con la misura** invece di chiuderlo (§7).

**AC 17** — `npm run gates` verde (esito verbatim nel record). Per **ogni** file di test toccato, anche `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>` (la trappola della validazione eager di `@/lib/env`, terza occorrenza in CLAUDE.md — qui il rischio è basso: `time.ts` e `zoned-time.ts` non importano nulla di «grosso», ma la verifica è obbligatoria).

**AC 18** — Suite e2e **completa** su **DB fresco** via `scripts/e2e.sh start` + `scripts/e2e.sh status`, esito verbatim nel record (`E2E_EXIT=`). `messages/it.json` e `messages/en.json` **invariati** (nessuna stringa nuova) — ⚠️ sono modificati dalla 16.2: il diff di questa story su quei file deve essere **vuoto**.

**AC 19** — Le **quattro discriminanze** (AC 2 estate, AC 2 inverno/Capodanno, AC 8, AC 12) sono provate **ROSSE** simulando il pre-fix (rimettendo la formula UTC), con repo ripristinato **byte-identico** e sha256 dei file dichiarati (invariante [I-b]).

**AC 20** — Il record dichiara le **tre famiglie** del censimento client (§3.4) e chiude il finding di ricognizione della 16.1 con un numero: 7 copie trovate, 7 sostituite, 0 rimaste.

---

## §3 — Dev Notes: blast radius e censimento misurato su `58e1d94`

### 3.1 — Il censimento completo delle formule di data-only nel client

```bash
grep -rn "new Date()\.toISOString()" src/app src/components --include=*.tsx --include=*.ts | grep -v "\.test\."
```
→ **8 righe**: le 7 copie di AD-2 + `dashboard/page.tsx:1050` (`new Date().toISOString()`, un **istante** completo passato come `from` a `listBookings` — non una data-only, **fuori perimetro**).

```bash
grep -rn "getFullYear()\|getMonth()\|getDate()" src/app src/components | grep -v "\.test\."
```
→ **14 righe**, tutte del layer **widget/composizione** e tutte browser-local **per scelta**: `date-input.tsx:66`, `datetime-input.tsx:60`, `calendar-grid.ts:9-17`, `calendar-popover.tsx:106-139`, `schedule.tsx:219`/`:367`, `edit-booking-form.tsx:80`, `flight-editor.tsx:217`/`:225`, più `reports/page.tsx:59` (**in scope**, AC 13).

### 3.2 — Le due pagine server, verbatim

`fleet/page.tsx:65-74` è citata in AD-3. `dashboard/page.tsx:43/:255-256/:295` in AD-4. Le funzioni di servizio a valle **non cambiano**: `getEffectiveRates(actor, ids, today: Date)` (`rates.service.ts`), `sumFlightMinutesByAircraft(actor, ids, from: Date, to: Date)` (`aircraft.service.ts:723-736`, `where flightDate: { gte, lte }`).

### 3.3 — Le due etichette, e chi le legge

`billing/page.tsx:128` → `monthLabel` alimenta **tre** superfici: `:150` (`BillingPanels`, `billing-panels.tsx:108` `card-sub` desktop + `billing-panels-mobile.tsx:65` `sub` mobile) e `:209` (`byCategory.sub`). I **numeri** sotto vengono da `currentMonthRange()` (`:117`, Roma). `reports/page.tsx:58-60` → `periodLabel` alimenta **7** sub di card; i numeri vengono da `getStats` (`:51`, Roma via `zonedMidnightUtc`). Nessun testid, nessuna stringa, nessun layout coinvolto: cambia **il valore** di due variabili.

### 3.4 — Cosa NON si tocca, e perché (le tre famiglie)

| Famiglia | Righe | Decisione |
|---|---|---|
| **Le 7 copie UTC** | AD-2 | **convertite** |
| **Il layer widget, browser-local** | `date-input.tsx:97` (`.today` + bottone «Oggi»), `datetime-input.tsx:60`, `calendar-popover.tsx:93`/`:131`, `calendar-grid.ts`, `schedule.tsx:219`, `edit-booking-form.tsx:80`, `flight-editor.tsx:205-215`/`:225` | **invariate**. Presentazione e composizione, non «oggi» di dominio; per un browser in Italia coincidono col giorno Roma. Il solo punto in cui il widget **nomina** un giorno di dominio è `date-input.tsx:97`/`:150` («Oggi») → **TD 16.9-a**, v. §7 |
| **Le data-only UTC del dominio Scadenze** | `expiry-editor.tsx:34` (client, default `expiresAt = oggi + validityMonths`), `pilots/page.tsx:55` (server) | **invariate qui**: perimetro della **16.4** (e per `expiry-editor.tsx` nemmeno lì — v. la domanda aperta di §7). Effetto misurato di `expiry-editor.tsx:34`: nella finestna notturna la scadenza precompilata è **un giorno prima**; il suo e2e la pinna già (`expiry-registration.spec.ts:218`, `addMonthsUtc(todayUtc(), 24)`) |

### 3.5 — Blast radius dei test, spec per spec

**Unit esistenti che questa story tocca**: `src/lib/zoned-time.test.ts` (**estende** `describe('todayDateOnlyInZone')`, `:201-215`, senza modificare i 2 test presenti), `src/lib/date-only.test.ts` (+1 `describe` per AC 8), `src/lib/time.test.ts` (+1 `describe` per AC 12). **Nessun** test di componente esiste (vitest `include: ['src/**/*.test.ts']`, `environment: 'node'`, zero `.test.tsx`): non tentare di crearne uno, non verrebbe raccolto.

**e2e — analisi per spec** (perché la lista è così corta):

| Spec | Come usa «oggi» | Effetto di questa story |
|---|---|---|
| `mobile-registries.spec.ts:261` (`addDaysUtc(0)` → flight → assert «Ore mese» `1:00`, `:292`) | fixture datata UTC **asserita contro la finestra della pagina Flotta**, che diventa Roma | **ROMPE nella finestra notturna** → **adattato** (AC 15). L'altra fixture dello stesso file (`:511`/`:520`, riga istruttore «dovuti») è asserita contro `getCompensationSummary`, già Roma **prima** di questa story: esposizione **preesistente**, non toccata |
| `aircraft-rates.spec.ts:80`, `instructor-rates.spec.ts:83` | riempiono `In vigore da` con l'UTC di oggi e asseriscono «tariffa in vigore» | **sicuri**: nella finestra l'UTC di oggi è il giorno Roma **precedente**, e `validFrom <= today` resta vero. La conversione a Roma li renderebbe *più* stretti, non più corretti → non toccati |
| `cash-register.spec.ts:61` | **riempie** `transaction-date` | prefill sovrascritto: nessun effetto. Ospita l'assert nuovo di AC 5 |
| `billing.spec.ts:303`, `cash-report.spec.ts:58`, `mobile-billing.spec.ts:92/100/312`, `my-compensation.spec.ts:279` | fixture `effectiveDate`/`flightDate` datate UTC, asserite contro aggregati di mese **Roma** (`currentMonthRange`, `getBillingSummary`, `getStats`, `variantBounds`) | esposizione **preesistente** e **invariata** (quelle finestre erano già Roma prima di questa story) → **TD 16.1-e**, aggiornato in §7. `billing.spec.ts` ospita l'assert nuovo di AC 4 |
| `reports.spec.ts:127` | `${todayDateOnly()}T10:00:00.000Z` — un **istante** dal giorno UTC | preesistente, invariato; ⚠️ il file è in lavorazione dalla **16.2** → non toccarlo |
| `expiry-registration.spec.ts:218` | pinna il default di `expiry-editor.tsx:34` | fuori perimetro (§3.4) → invariato |
| `datetime-picker.spec.ts:145-192` | asserisce i valori scritti dal **picker** | layer widget invariato → nessun effetto |

### 3.6 — File toccati (previsione; il record dichiara quelli effettivi)

**Produzione (12)**
1-7. i 7 componenti di AD-2 (in ognuno: −doc-comment, −funzione, +import, N sostituzioni).
8. `src/app/[locale]/dashboard/fleet/page.tsx` — `:9` (import), `:65` (**una** riga).
9. `src/app/[locale]/dashboard/page.tsx` — `:43` (import), `:295`.
10. `src/app/[locale]/dashboard/billing/page.tsx` — `:6` (import), `:128`.
11. `src/app/[locale]/dashboard/reports/page.tsx` — import, `:58`, `:59`.
12. `src/lib/time.ts` — **+1 funzione** (AD-5).
13. `src/server/services/rates.service.ts` — `:2`, `:8-13` (AD-6).
14. `src/lib/date-only.ts` — **solo** doc-comment `:37-46` (AD-6).

*(Quattordici voci per «12 file»: le ultime tre sono cancellazioni/commenti, non funzionalità. Il conteggio esatto lo dichiara il record.)*

**Test (4)**: `src/lib/zoned-time.test.ts`, `src/lib/date-only.test.ts`, `src/lib/time.test.ts`, `e2e/mobile-registries.spec.ts` + i due assert nuovi in `e2e/billing.spec.ts` e `e2e/cash-register.spec.ts`.

**Cosa NON si tocca**: `src/lib/zoned-time.ts` (l'helper esiste), `src/lib/schemas/*` (nessun contratto), `prisma/` (nessuna migrazione), `messages/*.json` (nessuna stringa), `src/styles/airops.css` (nessuna regola), `.env.example`/`.github/workflows/ci.yml`/`scripts/` (nessuna env var, nessuno step), `src/server/services/expiries.service.ts`/`expiry-alerts.service.ts`/`pilots/page.tsx` (16.4), `src/components/ui/*` (layer widget).

---

## §4 — Piano di test

**Unit — nuovi**
1. `zoned-time.test.ts` (AC 2): 3 istanti (CEST, CET, Capodanno) + il pin di divergenza contro la formula UTC. `vi.useFakeTimers()` → `vi.setSystemTime(...)` → asserzioni → `vi.useRealTimers()` in `afterEach` del `describe` (il file lo fa già a `:218-220`).
2. `date-only.test.ts` (AC 8): la finestra della Flotta pre/post fix a `2026-08-31T22:30:00.000Z`.
3. `time.test.ts` (AC 12): `formatMonthYear` nei due locale + la formula pre-fix sotto un fuso di processo **dichiarato**.

**Unit — esistenti che NON devono cambiare** (AD-7): `zoned-time.test.ts:201-215`, `date-only.test.ts:40-56`, `zoned-time.test.ts:217-256`, `time.test.ts` (i test di `formatDateTime`/`formatDateOnly`).

**e2e**: l'assert di AC 4 in `billing.spec.ts`, l'assert di AC 5 in `cash-register.spec.ts`, la fixture di AC 15 in `mobile-registries.spec.ts`.

**Verifica interattiva** (AC 6): Playwright MCP sulle 3 superfici con `value=` controllato, in **entrambi** i temi non serve (nessun cambio visivo) — quello che si legge è il **valore** e la **console**.

**Discriminanze obbligatorie** ([I-b]): AC 2 (estate), AC 2 (Capodanno), AC 8, AC 12 — ROSSE sul pre-fix simulato, repo ripristinato con sha256 dichiarato.

**Gate**: `npm run gates` → per-file `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>` → **DB fresco** → `scripts/e2e.sh start` / `scripts/e2e.sh status`.

---

## §5 — Trappole note

- **La finestra è di 1-2 ore.** Un test con l'orologio a mezzogiorno **non discrimina niente** (misura A4). Ogni test di questa story fissa l'orologio in `[00:00, 02:00)` Roma, e se ce n'è uno che non lo fa va detto nel record.
- **`vi.setSystemTime` NON sposta il fuso del processo**: sposta `Date.now()`. `Intl.DateTimeFormat` con `timeZone: 'Europe/Rome'` continua a funzionare (verificato: le probe girano con `TZ=UTC` e le asserzioni Roma passano). Quindi un test **non deve** dipendere da `TZ=…` — tranne per la metà «pre-fix» di AC 12, che per costruzione parla del **fuso del processo**: lì il fuso va reso esplicito nel test, non ereditato.
- **In locale il difetto delle etichette è INVISIBILE**: con `TZ=Europe/Rome` la formula senza `timeZone` dà la risposta giusta. È esattamente perché nessuno l'ha visto finora.
- **`useFakeTimers` che sopravvive contamina il file.** Ripristino dentro il test o in un `afterEach` del `describe`.
- **`todayDateOnlyInZone` restituisce una stringa, `todayDateOnlyUtcInZone` una `Date` a mezzanotte UTC** ([I-c]). Nei 7 componenti serve la **stringa** (un `<input type="date">` e il wire); nelle 2 pagine serve la **`Date`** (`getEffectiveRates`/`sumFlightMinutesByAircraft` legano una `@db.Date`). Scambiarle è un typecheck rosso nel caso migliore e una `@db.Date` con ora nel caso peggiore.
- **Non applicare `dateOnlyInZone` a un valore letto da una colonna `@db.Date`**: arriva già a mezzanotte UTC e `toDateOnlyString` lo formatta così per progetto (lezione review 3.5 F1 al contrario).
- **Il file `flight-editor.tsx` e `dashboard/page.tsx` sono in mano alla 16.2 adesso**, e `messages/*.json` e `e2e/reports.spec.ts` pure. Rileggere le righe, non fidarsi dei numeri; il diff di questa story su `messages/*.json` deve essere **vuoto**.
- **`JOBS_SECRET`**: il `.env` locale ha il placeholder → la validazione env di produzione lo rifiuta e il `webServer` in `CI=1` non parte. Prima di ogni full suite: `export JOBS_SECRET=<valore-non-placeholder>`.
- **Il DB e2e va resettato prima del run che conta** (residui dell'audit e delle story precedenti). Preferito: `fuser -k 3000/tcp; docker compose down -v && docker compose up -d && sleep 5 && set -a && . ./.env && set +a && npx prisma migrate deploy && npx prisma db seed` (`npm run db:reset` non funziona su questa macchina). ⚠️ `docker compose down -v` è **distruttivo**: se il permesso viene negato, **fermarsi e chiedere il comando inline** all'utente (`! docker compose down -v`), mai cercare un'alternativa distruttiva. E prima del primo reset: controllare che nessun'altra sessione stia usando `:3000` e il DB (la 16.2 lo sta usando **ora**).
- **Ripetere run e2e mirati sullo stesso DB fa scattare il lock anti-brute-force** (TD-6): dopo ~10 login lo stesso spec fallisce **sempre** alla riga di login. Prima di attribuirlo alla flake: `SELECT identifier, count(*) FROM "LoginAttempt" WHERE "createdAt" > now() - interval '15 minutes' GROUP BY 1`.
- **Suite e2e: SEMPRE `scripts/e2e.sh`**, mai `playwright test` in foreground; `scripts/e2e.sh status` è l'unico modo di leggere l'esito. Un run lanciato in background da un subagent **muore con la sessione del subagent**.
- **`page.clock` esiste** (Playwright 1.61.1) e sarebbe la via per un e2e con orologio finto alle 00:30. **Non è richiesto e va evitato qui**: l'HTML lo rende il server con l'orologio **reale**, il browser idraterebbe con quello **finto**, e si misurerebbe un disallineamento artificiale invece del comportamento. La prova al bordo è unit (AC 2/8/12); l'e2e prova la **cucitura** all'orologio reale (AC 4/5/15).

---

## §6 — Fuori scope DICHIARATO

- **Il dominio Scadenze**: `expiries.service.ts` (5 call-site), `expiry-alerts.service.ts:110`, `pilots/page.tsx:55` → **16.4**, che li ha rivendicati (§7 di quel file). Questa story non ne tocca uno.
- **`expiry-editor.tsx:34`** (default client `expiresAt = oggi UTC + validityMonths`): **ottava** copia client di «oggi», fuori scope per confine di story (dominio Scadenze). **Misura**: nella finestra notturna la scadenza precompilata è di **un giorno** anteriore; è pinnata da `expiry-registration.spec.ts:218`. **Domanda aperta** in §7: dopo la 16.4 sarebbe **l'unico** consumatore rimasto di `date-only.ts#todayDateOnlyUtc`.
- **Il consolidamento di `period-presets.ts#romeDateParts`** (quarta implementazione, corretta, delle parti di calendario Roma) → **TD 16.1-d**. Questa story **non la esporta** e non ne aggiunge una quinta (AD-5).
- **I 7 helper `todayDateOnly()` UTC negli spec e2e** → **TD 16.1-e**, aggiornato con la misura (§7). Motivo per cui **non** è «lo stesso one-liner»: per le fixture **date-only** lo sarebbe, ma per quelle che compongono un **istante** dal giorno (`${today}T10:00Z`: `reports.spec.ts:127`, `mobile-registries.spec.ts:269`/`:520`) datare sul giorno Roma mette l'istante **avanti** rispetto all'orologio reale dentro la stessa finestra che si voleva sanare. Al bordo esatto **nessuna** fixture è robusta: serve una decisione su come gli e2e datano i voli, non una sostituzione. Questa story converte **solo** la fixture di cui ha cambiato la finestra (AC 15).
- **Il layer widget** (`date-input.tsx`, `datetime-input.tsx`, `calendar-popover.tsx`, `calendar-grid.ts`, `schedule.tsx`): browser-local per scelta → **TD 16.9-a** per il solo bottone «Oggi».
- **Qualunque modifica visiva**: nessun layout, nessun token, nessuna regola CSS, nessun testid, nessuna stringa i18n, nessuna label. La story cambia **valori**, non pixel ([I-d]). Un diff in `airops.css` o in `messages/*.json` è fuori perimetro.
- **Ridatare righe già scritte** (ledger append-only) e **qualunque guardia server nuova**: la 16.1 resta l'autorità (P2), la 16.6 aggiungerà la sua.
- **Il fuso del browser come concetto supportato**: l'app assume che l'utente sia in Italia (`time.ts:9`, ogni timestamp formattato in Roma, `composeFlightTimes` che compone istanti sul fuso locale). Questa story **non** introduce il supporto per un browser fuori fuso, e non lo peggiora: dichiara il residuo (AD-1).

---

## §7 — Riferimenti

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` — **contratto**: «Story 16.9» (i 2 AC di record), «Architettura e vincoli» ([I-a]), «Modello dei subagent» (UI → Opus 5 xhigh).
- `_bmad-output/implementation-artifacts/16-1-un-solo-calendario.md` — **§6** (il censimento che ha scoperto le 7 copie, con le righe misurate su `4c45753`), **§1 AD-1** (dove vive l'helper e perché non nasconde la zona), **§3.2** (la classificazione delle 16 invocazioni di `todayDateOnlyUtc`), **§5** (le trappole dell'orologio finto, riusate qui).
- `_bmad-output/implementation-artifacts/16-1-review-report.md` — **§MINOR-3** (bordo di mese di `fleet/page.tsx`, con la misura node) e **§LOW-1** (le due etichette process-local, con le righe e la conseguenza).
- `_bmad-output/implementation-artifacts/16-4-tipo-scadenza-disattivato.md` — **§7** (rivendicazione di `pilots/page.tsx:55`, e l'elenco dei consumatori legittimi che restano a `date-only.ts`: la riga da riconciliare).
- `_bmad-output/implementation-artifacts/aog-1a-campo-guardia-volo.md` — la lezione **«misurare la PAGINA»** (MINOR-1: un numero corretto a metà crea una contraddizione sulla stessa schermata), che AC 9 riusa.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:488` (`16-9-un-solo-calendario-client: backlog`) e `:512` (i TD 16.1-a…e con la casa proposta).
- `docs/handoffs/HANDOFF.md` — ciclo per story su questa macchina, reset DB, `JOBS_SECRET`, flake note, workaround Playwright, `Co-Authored-By` = il modello che ha fatto il lavoro.
- `CLAUDE.md` — gates, `scripts/e2e.sh`, unit + validazione eager dell'env, catena serializzata e2e, convenzione testid, «story con UI» → `design-taste-frontend` + `ui-ux-pro-max`.
- `.claude/skills/karpathy-guidelines/SKILL.md` — assunzioni esplicitate (§0/§1), semplicità (AD-1: **zero** funzioni nuove dove ne esiste già una), chirurgia (AD-8), rimozione degli orfani creati (AD-6), criteri verificabili (§2).
- Probe della ricognizione (**fuori dal repo**, rieseguibili): `/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/story-16-9/client-calendar.probe.test.ts` + `vitest.probe.config.mjs` — `TZ=UTC npx vitest run --config <config> --reporter=verbose --silent=false` → 9 passed, output in §«Fatti misurati».

### Da registrare in `sprint-status.yaml` (azione della sessione principale, non del dev)

| TD | Contenuto |
|---|---|
| **TD 16.1-b** | **CHIUSO da questa story** (i 2 call-site di pagina + le 2 etichette). Resta fuori il solo `pilots/page.tsx:55`, che è della **16.4**. |
| **TD 16.1-c** | **CHIUSO da questa story** (7 copie client → 1 helper esistente). |
| **TD 16.1-e** | **Aggiornato, non chiuso**: 7 (non 6) helper `todayDateOnly()` UTC negli spec e2e — `billing.spec.ts:52`, `cash-report.spec.ts:47`, `instructor-rates.spec.ts:48`, `aircraft-rates.spec.ts:59`, `reports.spec.ts:60`, `mobile-billing.spec.ts:58`, `my-compensation.spec.ts:124` — più `mobile-registries.spec.ts:72` (`addDaysUtc`). **Misura nuova**: per le fixture *date-only* la conversione a Roma è un one-liner; per quelle che compongono un **istante** dal giorno (`${today}T10:00Z`) datare su Roma mette l'istante **avanti** all'orologio reale dentro la stessa finestra — al bordo esatto nessuna fixture è robusta. Serve una decisione su **come gli e2e datano i voli**, non una sostituzione. Casa proposta: una story di igiene della suite, o la prima story che aggiunga una guardia sull'**istante** del volo. |
| **TD 16.9-a** (nuovo) | Il bottone **«Oggi»** e il bordo `.today` di `DateInput`/`CalendarPopover` (`date-input.tsx:97`, `:150`) restano sul fuso del **browser**: è l'unico punto in cui il layer widget nomina un giorno di dominio. Per un browser in Italia coincide col giorno Roma → **coerenza, non correttezza**. Fix noto: 2 righe (`dateOnlyToLocalDate(todayDateOnlyInZone(APP_TIMEZONE))`), blast radius = **ogni** campo data dell'app. |

### Domande aperte per la sessione principale (non per il dev)

1. **`expiry-editor.tsx:34` — chi lo prende?** È l'**ottava** copia client di «oggi» (default `expiresAt = oggi UTC + validityMonths`, effetto misurato: un giorno di anticipo nella finestra notturna). La 16.4 lo elenca fra i consumatori **legittimi** che restano; questa story lo esclude perché è dominio Scadenze. Dopo la 16.4 sarebbe **l'unico** consumatore rimasto di `date-only.ts#todayDateOnlyUtc` in tutto `src`. **Raccomandazione**: farlo entrare **qui** — costo misurato **2 righe** (`todayDateOnlyUtc()` → `parseDateOnlyUtc(todayDateOnlyInZone(APP_TIMEZONE))` in `expiry-editor.tsx:34`, e l'helper `todayUtc()` di `expiry-registration.spec.ts:37` che ne pinna il valore a `:218`). Se la risposta arriva prima del dispatch, va scritta come AC 21 in questo file; altrimenti resta fuori e diventa TD.
2. **Il residuo dell'AC 8** va bene così? L'unit del bordo di mese esercita la *formula* di `fleet/page.tsx:65-71` chiamando gli helper reali, non la riga della pagina (una pagina RSC non è unit-testabile senza estrarre una funzione). L'alternativa era estrarre `monthStartUtc(date)` in `date-only.ts` — **scartata** come astrazione non richiesta per un call-site solo. Se la review vuole la riga esercitata, la scelta va cambiata **prima** del dev, non dopo.

## Addendum della sessione principale (2026-09-10, prima del dispatch)

- **`expiry-editor.tsx:34` ENTRA in questa story**: dopo la 16.4 sarebbe l'ultimo consumatore client dell'«oggi» UTC e il fold-in costa due righe; stesso helper `todayDateOnlyInZone(APP_TIMEZONE)`, stessa prova a 00:30 Roma.
- **Unit sulla finestra di mese**: accettato che eserciti la formula e non la riga di pagina (nessun `monthStartUtc` estratto); la riga di `fleet/page.tsx:65` è coperta dall'e2e `mobile-registries.spec.ts:261` adattato.
- TD 16.1-e resta aperto con la misura della ricognizione (convertire le fixture e2e a Roma sposterebbe l'istante avanti all'orologio reale nella finestra stessa); TD 16.9-a («Oggi» del date picker browser-local) da registrare alla chiusura.


## Record finale — 2026-11-25

- Implementazione `d45d308`: rimossi i cinque calcoli UTC duplicati nei form; uso unico del calendario Europe/Rome per le date proposte, il periodo dei compensi a Capodanno, Scadenze, chip documenti dei piloti e finestre del job di avviso. Il prefill delle scadenze conserva il clamp dei mesi. Eliminato l’helper UTC rimasto senza chiamanti.
- Contabilità e Statistiche usano le etichette del mese/anno di Roma. **AC 14**: lasciati invariati il cursore locale del widget e il formatter della serie, che formatta un mese già scelto e non l’istante corrente. Non sono cambiate le guardie dei writer.
- Verifica: **215 unit mirati**, poi gate completi lint, tipi, **2282 unit** e build. Prove di unit al confine di giorno in inverno/estate e al 1º gennaio; prova browser con fuso UTC e orologio alle 00:30 del 1º gennaio a Roma, sulle date proposte in Contabilità. E2E completo su DB sintetico: **621 passed + 1 flaky, 0 failed, exit 0** (9,8 min). Il retry ha passato l’asserzione di un conteggio trasversale tra pagine di Prenotazioni (prima esecuzione 3 anziché 2); non esercita un form o un calcolo di Scadenze di questa story.
- Chiude TD-19.9-b. TD-19.10-b: fixture passata a Roma e guardia a orologio fissato nel form Contabilità; non si dichiara eseguito l’intero spec typeahead nella fascia reale 00:00–01:00. I limiti del popover che dipendono dalla data locale del browser restano TD 16.9-a.
