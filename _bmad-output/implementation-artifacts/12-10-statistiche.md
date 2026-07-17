---
baseline_commit: 0b3566885a5c7e9096173a872a603f29bd1d9669
---

# Story 12.10: Statistiche — stats API + pagina reports AirOps

Status: review

## Story

As a staff/admin dell'aviosuperficie,
I want la pagina Statistiche nel design AirOps — KPI mese/anno, serie mensili (ricavi, ore, transiti), utilizzo flotta, composizione movimenti, ore istruttori, classifiche per aeromobile e pilota — alimentata da una stats API reale,
so that l'andamento dell'aviosuperficie si legga a colpo d'occhio su dati veri (voli, PPR, ledger, compensi) senza fogli di calcolo esterni.

**Riferimenti vincolanti**: spec §3 (riga Statistiche, `/dashboard/reports`) + §5.4 + D11/D13; piano Task 10 (righe 259-290) + fate-map (riga "(new) reports"); prototipo `docs/design-reference/airops/src/ReportsView.jsx` (chart component inline: `BarChart` 1-24, `LineChart` 25-44, `RankBars` 46-76, view 78-207) + mock `data.jsx` (`REVENUE:150`, `HOURS_FLOWN:178`, `VISITING_MOVEMENTS:179`, `AIRCRAFT_STATS:209-218`, `PILOT_STATS:219-230`).

## Ratifiche utente (2026-07-17 — decise via AskUserQuestion PRIMA del dispatch)

1. **Movimenti = CONTEGGIO OPERAZIONI**: `kpis.movements` = numero voli REGISTERED del periodo + numero visiting flights ("un visiting flight ha per forza già un PPR quindi non serve contare i PPR" — cioè i transiti si identificano e contano UNA volta come PPR `COMPLETED` del periodo, definizione 12.4; nessun doppio conteggio, nessuna moltiplicazione per decolli/atterraggi). `transitShare` = transiti / movimenti. `movementMix` usa la STESSA unità (conteggi) con label reali D13 — Scuola / Turismo-Privato / Lavoro aereo / Transiti; il "Noleggi" del prototipo NON si porta (nessun FlightType RENTAL).
2. **KPI "Utilizzo flotta" → rinviato alla 12.11** (le chiavi settings "finestra prenotabile" nascono lì): kpi-row a 4 voci in 12.10, NIENTE dati finti (deviazione dichiarata dal contratto piano). La card "Utilizzo flotta" per-aeromobile RESTA, con barre RELATIVE al massimo del periodo (non serve denominatore). "Aeromobile operativo" (per la card e per il denominatore futuro) = `status=OPERATIONAL` e non archiviato.
3. **`ref` → STORICO COMPLETO**: `ref=YYYY-MM` arbitrario (≤ mese corrente) per voli/PPR/ledger. Compensi istruttori: i **minuti** si calcolano per QUALUNQUE periodo (groupBy sui voli SCHOOL del periodo — stessa query per corrente e storico); il **dovuto** (`owedCents`) è ben definito solo per il periodo corrente → valorizzato dal summary 12.7 quando ref = corrente, **`null` sui ref storici** (UI "—").
4. **KPI/serie "Ricavi" = ledger club-centric** (Σ positivi normalizzati account+cassa, regola twin 12.9 — include cassa non-volo come tasse PPR e iscrizioni); `fleet[].revenueCents` e `topPilots[].spentCents` restano sui FLIGHT charges (doppia nozione dichiarata, piano-conforme). *Contestualmente il PO ha ratificato la vista club-centric del ledger (12.9) e chiesto una vista per-pilota completa — già coperta da billing `?personId=` + `people/[id]/account`; la "quota associativa annuale da settings" è scope NUOVO da ratificare nella 12.11.*

## Acceptance Criteria

1. **(Stats API — TDD)** NUOVI `src/server/services/stats.service.ts` (+`.test.ts`), `src/lib/schemas/stats.ts`, `GET /api/v1/stats?period=month|year&ref=YYYY-MM` — RBAC **`finance.manage`** (ADMIN+STAFF, coerente con cash-report/instructor-compensation; NESSUNA permission nuova), autorizzazione in-service, route thin `apiRoute`, schema registrato in `src/lib/schemas/registry.ts` (component + `registerPath`, `z` da `./zod-with-openapi`). `ref` OPZIONALE (default = mese corrente), **storico supportato** (ratifica 3); ref futuro → 422. Finestre: `period=month` → KPI sul MESE di ref, serie = ultimi 6 mesi fino a ref incluso (rolling, come le label del prototipo); `period=year` → KPI sull'ANNO SOLARE di ref, serie = ultimi 12 mesi fino a ref incluso. Bucketing MESE Europe/Rome. Response (contratto piano righe 266-277, adattato dalle ratifiche): `kpis { revenueCents, flightMinutes, movements, transitShare }` (**NIENTE `fleetUtilization`** — ratifica 2, arriva in 12.11), `series { months[], revenueCents[], flightMinutes[], transitMovements[] }`, `fleet { registration, minutes, revenueCents }[]`, `movementMix { key: SCHOOL|TOURISM|AERIAL_WORK|TRANSIT, count }[]`, `instructors { name, minutes, owedCents|null }[]`, `topPilots { name, minutes, spentCents }[]` (top 10 per minuti, groupBy `personId` sui REGISTERED del periodo, nome da Person; **NIENTE metrica "Margine"**: non derivabile, il contratto non la prevede). **Movimenti (ratifica 1)**: `movements` = conteggio voli REGISTERED + conteggio PPR `COMPLETED` (eta nel periodo Rome, definizione 12.4); `transitShare` = transiti/movimenti (0 se denominatore 0); `movementMix` = conteggi voli per FlightType + transiti (stessa unità). **Istruttori (ratifica 3)**: minuti = groupBy voli SCHOOL per `instructorProfileId` nel periodo (stessa query per corrente e storico); `owedCents` dal summary 12.7 SOLO quando il periodo è quello corrente (month→owedMtd, year→owedYtd), altrimenti `null`. **Ricavi ledger (ratifica 4): RIUSARE i helper di normalizzazione segni + regola twin di `transactions.service.ts` (12.9), parametrizzati sul periodo — MAI reimplementarli** (due reader che possono divergere = lezione 12.8; se non sono esportati, esportarli con refactor chirurgico a comportamento invariato — la suite 12.9 resta verde). Unit test deterministici su fixture mockata: bordi mese Rome, serie rolling 6/12 punti, dedup twin nel revenue, movimenti/mix coerenti (stessa unità), owed null su ref storico, ref futuro → 422, 403 senza permesso.
2. **(Chart components)** NUOVI `src/components/charts/{bar-chart,line-chart,rank-bars}.tsx`: port 1:1 dei component inline di `ReportsView.jsx` (SVG viewBox 600, gridlines, barre rx=2 opacity .85/1.0, area+path del line chart, `RankBars` con `.segmented` toggle metrica e righe `.util-row`), props tipizzate, stringhe via next-intl, ZERO CSS nuova (classi `.util-*`/`.seg`/`.segmented` già in `airops.css`). RankBars "Per pilota" con 2 metriche (Ore/Spesa).
3. **(Pagina `/dashboard/reports`)** Server component (redirect se non `finance.manage`) + client console, pattern 12.5-12.9. `page-head`: "Statistiche", sub "Analisi dell'aeroporto · {periodo}", `.segmented` toggle **"{Mese} {anno}" / "Anno {anno}"** (URL-driven `?period=`, default year come il prototipo) — **NIENTE ExportMenu né "Condividi report"** (piano: no dead UI). `kpi-row` a **4 KPI** (ratifica 2): Ricavi / Ore volate / Movimenti / Quota transiti, formatter reali D11 (`formatCents`, `formatMinutes` H:MM o ore, percentuali). `split` 1: card Ricavi (LineChart, serie €) + card Ore volate (BarChart). `split` 2: card Movimenti in transito (BarChart) + card Utilizzo flotta (`.util-rows` per aeromobile: registration mono, barra `.seg.flown` RELATIVA al massimo del periodo, ore). `split` 3: card Composizione movimenti (barra segmentata + legenda, 4 chiavi ratifica 1 con colori del prototipo) + card Ore istruttori (`.util-rows`: nome, barra, "H:MM · dovuto" — dovuto "—" se null). `split` 4: RankBars "Per aeromobile" (Ore/Ricavo) + "Per pilota" (Ore/Spesa). Route-registry: voce `reports` (`route-registry.ts:94`) → **`enabled:true, airopsNative:true`**.
4. **(e2e)** NUOVO `e2e/reports.spec.ts`: pagina admin/staff con KPI e sezioni popolate da fixture reale (registra voli/PPR/pagamenti via API nel test, poi assert sui numeri ESATTI derivati — niente assert "non-vuoto" generici), toggle mese/anno cambia i dati (6 vs 12 label), composizione coerente con la fixture, 403/redirect pilota su pagina e API. Selettori scoped al landmark/exact (103-F1); MAI `hasText` su H:MM/date/importi per disambiguare (11.2). Nessun altro spec toccato (fate-map: solo new).
5. **(Gates)** **NESSUNA migrazione**. `npm run gates` verde; `reports.spec.ts` verde in locale (`--retries=2`); verifica interattiva entrambi i temi (pagina AirOps-native).

## Contesto e decisioni di design (vincolanti — ricognizione 2026-07-16)

- **Prototipo**: layout = page-head (segmented month/year) → kpi-row 5 → 4×`split`. `chartN = isYear ? 12 : 6`; label mesi IT abbreviate. Colori: Ricavi oklch verde, Ore `--ink`, Transiti oklch blu; mix legenda 2-col (`--info`/`--accent`/`--ok`/`--ink-3`). Tutte le classi CSS già portate in 12.1 (`airops.css`: `.kpi-row:331`, `.split:708`, `.util-*:740-755`, `.segmented:781`) — nessuna CSS nuova.
- **Sorgenti dati**: voli = `prisma.flight.groupBy/aggregate` con pattern where di `buildFlightsWhere` (`flights.service.ts:1284`; il servizio stats è staff-only quindi niente own-scoping, ma FORZARE `status:'REGISTERED'` come `getFlightTotals:1400`); `flightDate @db.Date` via `parseDateOnlyUtc`. Transiti = `PprRequest` `status='COMPLETED'` + `eta` nel Rome-month (pattern `movements/page.tsx:100-110`, ratifica 12.4). Compensi = `getCompensationSummary(actor)` (`instructor-compensation.service.ts:208`, permesso `finance.manage` già in-service; mtd/ytd relativi a NOW — per questo `owedCents` si valorizza SOLO sul periodo corrente, ratifica 3; i minuti si calcolano invece in stats.service per qualunque periodo). Fleet join: `listAircraft` DTO (`aircraft.service.ts:16-71`) per registration/status.
- **Ledger revenue**: helper normalizzazione + twin da `transactions.service.ts` (12.9, in merge prima di questa story): il dev DEVE leggerne l'implementazione reale a HEAD e riusare le funzioni esportate (se la 12.9 non le ha esportate, estrarle in export — refactor chirurgico senza cambiarne il comportamento, la suite 12.9 resta verde).
- **Serie mensili**: nessun helper "ultimi N mesi" esiste — costruirlo su `currentMonthRange`/`currentYearRange` (`src/lib/period-presets.ts:43/61`) + `zoned-time.ts` (`APP_TIMEZONE='Europe/Rome'`, `time.ts:9`). Bucketing per mese Rome, non UTC.
- **Route/schema di riferimento**: `instructor-compensation/route.ts` (apiRoute + auth in-service) e `cash-report` (`registry.ts:1026-1039` per la registrazione). `registry.test.ts` enforcia la coerenza OpenAPI.
- **RBAC**: `finance.manage` (`rbac.ts:88-110`, ADMIN+STAFF); `route-registry` `reports.roles = STAFF_ROLES` già corretto; NESSUNA modifica a `rbac.ts`.
- **Fuori dal prototipo**: `PILOT_STATS.margin` (metrica "Margine") NON si porta — il contratto piano non la prevede e il margine club non è derivabile dai dati (decisione di sessione, piano-conforme). ExportMenu e "Condividi report" omessi (piano Step 2 esplicito).
- **Nav**: nessun link entrante esistente a `/dashboard/reports` oltre il registry — la voce sidebar è l'unica superficie.
- **Ambiente locale**: identico alle story precedenti (DB fresco al dispatch, port 3000, `--retries=2`, Playwright MCP rotto → script /tmp, MAI `playwright install`, gates SOLO `npm run gates`, lockfile `npx -y npm@10`).
- **Commit**: `feat(12.10): stats API + statistiche` (piano Step 3). Staging esplicito, niente push.

## Fuori scope dichiarato

- Chiavi settings "finestra pianificazione" e loro UI (12.11) — v. ratifica 2.
- Export/condivisione del report (omessi dal piano); `owedCents` istruttori per periodi storici (ratifica 3: null).
- Quota associativa annuale da settings (richiesta PO 2026-07-17 durante la review 12.9): scope NUOVO da ratificare nella 12.11.
- METAR, scadenze, Panoramica (12.11/12.12); rimozioni legacy residue (12.13).
- Qualunque migrazione DB; modifiche a `flights.service.ts`/`ppr.service.ts`/compensi (solo letture; l'unico refactor ammesso è l'export dei helper 12.9, comportamento invariato).

## Dev Agent Record

### Completion Notes

- **Stats API (AC 1)**: `stats.service.ts#getStats(actor, {period, ref?}, now?)` — `finance.manage` in-service, `ref` (`YYYY-MM`) opzionale (default mese corrente Rome), storico completo, futuro → 422 `ValidationError('STATS_REF_IN_FUTURE')`. KPI window = mese/anno di `ref`; serie = rolling 6/12 mesi fino a `ref` incluso (indipendente dall'allineamento calendario del KPI quando `period=year`).
- **Revenue reuse (ratifica 4)**: `transactions.service.ts` guadagna UN solo export nuovo, `getLedgerRevenueCents(actor, from, to)` — thin wrapper sui `fetchAllLedgerRows`/`sumPositive` GIÀ esistenti (dietro `getBillingKpis`), comportamento invariato, `transactions.service.test.ts` (26 test) resta verde senza modifiche. `stats.service.ts` lo richiama una volta per ciascun bucket mensile della serie + una volta per la finestra KPI — MAI query dirette su `accountMovement`/`cashMovement`.
- **Movimenti (ratifica 1)**: `movements` = COUNT flight REGISTERED (via `prisma.flight.groupBy(by:['flightType'])`, riusato anche per `flightMinutes`/`movementMix`) + COUNT PPR `COMPLETED` (eta nella finestra, bounds Rome via `zonedMidnightUtc`/`addDaysDateOnly`, pattern 12.4). `movementMix` sempre 4 chiavi fisse (SCHOOL/TOURISM/AERIAL_WORK/TRANSIT), anche a conteggio 0.
- **Istruttori (ratifica 3)**: minuti via `groupBy(instructorProfileId)` su SCHOOL REGISTERED per QUALUNQUE periodo; `owedCents` letto da `getCompensationSummary(actor)` (mtd/ytd a seconda di `period`) SOLO quando `ref` è il periodo corrente — la summary non viene nemmeno interrogata sui ref storici (test dedicato: `getCompensationSummary` NON chiamata).
- **Fleet/topPilots (ratifica 4, doppia nozione dichiarata)**: `fleet[].revenueCents` = solo componente aeromobile (`aircraftAmountCents`), MAI l'istruttore — assunzione esplicita (il tempo istruttore non è "ricavo dell'aeromobile"); `topPilots[].spentCents` = aeromobile + istruttore (la spesa reale del pilota). `fleet` = solo aeromobili `status=OPERATIONAL` non archiviati (`listAircraft`), ordine registration asc riusato da `listAircraft` stesso (nessun re-sort).
- **Serie mensili**: nessun helper "ultimi N mesi" preesisteva — `monthRangeFor`/`yearRangeFor`/`shiftMonth`/`rollingMonths` nuovi in `stats.service.ts` (calendario puro su stringhe `YYYY-MM`, nessuna conversione timezone: `ref` è già un mese-calendario Rome). Bucketing voli (date-only) via `toDateOnlyString().slice(0,7)`; bucketing PPR (istanti) via `dateOnlyInZone(eta, APP_TIMEZONE).slice(0,7)` — Rome-esatto (test dedicato sul confine ottobre/novembre 2026, post-cambio-ora).
- **Chart components (AC 2)**: `bar-chart.tsx`/`line-chart.tsx` porting 1:1, presentational puri (nessuno stato) con guardia `Math.max(1, ...data)` contro dati reali tutti-a-zero (il mock del prototipo non è mai a zero, i dati reali possono esserlo). `rank-bars.tsx` — stessa resa visiva ma API adattata: niente `period`/`mField`/`yField` (il toggle periodo qui è navigazione server-side via `?period=`, quindi le righe arrivano già scoped al periodo corrente; l'unico stato client rimasto è il toggle metrica).
- **Pagina (AC 3)**: server component (redirect non-`finance.manage`) + `reports-console.tsx` client (stato del solo `RankBars`). Toggle periodo = `<Link>` `?period=month|year` (URL-driven, NIENTE `ref` picker in UI in questa story — l'API lo supporta, ma la pagina interroga sempre il periodo corrente). 4 KPI (ratifica 2, NIENTE "Utilizzo flotta" KPI). `route-registry.ts` `reports` → `enabled:true, airopsNative:true`.
- **Adattamenti dichiarati dal prototipo**: (1) card-sub ricavi "€" non "€k" — i numeri reali di una piccola aviosuperficie non sono nell'ordine delle migliaia come nel mock, "€k" avrebbe reso male; (2) niente "Noleggi" nel mix (nessun `FlightType` RENTAL, ratifica 1); (3) niente metrica "Margine" in RankBars pilota (non derivabile, piano-conforme); (4) niente `ExportMenu`/"Condividi report" (piano Step 2).
- **Verifica interattiva**: script Playwright throwaway in `/tmp` (Playwright MCP rotto in questo ambiente) contro DB fresco — pagina verificata in light/dark, toggle mese/anno, KPI/grafici/RankBars popolati da dati reali via fixture API. Script cancellato prima del commit.

### File List

- `src/lib/schemas/stats.ts` (nuovo)
- `src/server/services/stats.service.ts` (nuovo)
- `src/server/services/stats.service.test.ts` (nuovo)
- `src/server/services/transactions.service.ts` (edit chirurgico: +`getLedgerRevenueCents`, nessun'altra riga toccata)
- `src/app/api/v1/stats/route.ts` (nuovo)
- `src/lib/schemas/registry.ts` (edit: import + `register('Stats', ...)` + `registerPath('/api/v1/stats')`)
- `src/components/charts/bar-chart.tsx` (nuovo)
- `src/components/charts/line-chart.tsx` (nuovo)
- `src/components/charts/rank-bars.tsx` (nuovo)
- `src/app/[locale]/dashboard/reports/page.tsx` (nuovo)
- `src/app/[locale]/dashboard/reports/reports-console.tsx` (nuovo)
- `src/components/shell/route-registry.ts` (edit: `reports` → `enabled:true, airopsNative:true`)
- `messages/it.json`, `messages/en.json` (edit: sezione `ReportsPage`)
- `e2e/reports.spec.ts` (nuovo)

### Change Log

- 2026-07-17 — Implementazione stats API + pagina Statistiche AirOps-native (story 12.10). `npm run gates` verde.

## Review Record

_(a cura della review adversarial)_
