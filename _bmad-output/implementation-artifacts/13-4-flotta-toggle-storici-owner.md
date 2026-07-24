---
baseline_commit: a90c22c
---

# Story 13.4: Flotta — toggle archiviati on/off, storici a 5+"mostra tutte", rimozione owner/private

Status: review

## Story

As a admin/staff dell'aviosuperficie,
I want che il filtro archiviati della flotta sia un bottone on/off, che gli storici di tariffe e rettifiche contaore non crescano all'infinito, e che il campo "proprietario/privato" degli aeromobili sparisca,
so that la pagina Flotta resti pulita e coerente col resto dell'app senza campi inutili.

**Riferimenti vincolanti**: piano `docs/superpowers/plans/2026-07-22-epic-13-ui-feedback.md` (Task 4). Ratifica **R3** (storici aereo: ultime 5 + "mostra tutte"). Rimozione owner e toggle già coperti dalle ratifiche epic-level (nessuna nuova domanda).

## Acceptance Criteria

1. **(Toggle archiviati on/off)** In `fleet-console.tsx` il checkbox "Mostra archiviati" (`includeArchived`, `setIncludeArchived`, `navigate`) diventa un **bottone toggle on/off** in stile AirOps (stato attivo evidente, stesso pattern del toggle Piloti introdotto in 13.2), stessa query param `?includeArchived` (la catena server funziona già — `aircraft.service.ts:172`). Coerenza visiva con il toggle Piloti.
2. **(Storico tariffe: 5 + mostra tutte)** In `aircraft-editor.tsx` `RatesSection` (`fetchRatesHistory` L606, `history.map` L733) oggi carica e mostra TUTTE le righe → di default mostra solo le **ultime 5**, con un "mostra tutte" che espande il resto (R3). Modo meno invasivo: slice client-side (i dati sono già fetchati) o pagina server — a scelta del dev, purché lo storico completo resti raggiungibile.
3. **(Storico rettifiche contaore: 5 + mostra tutte)** Lo storico rettifiche (`fetchHourMeterHistory` L755, `HOUR_METER_HISTORY_PAGE_SIZE = 50`, `loadMore`) mostra di default le **ultime 5** con "mostra tutte"/"carica altri" (R3). Ridurre la finestra iniziale a 5 riusando il meccanismo `loadMore` esistente (rinominato coerentemente se serve), non 50.
4. **(Rimozione owner/private — UI + backend)** Il campo `Aircraft.owner` (enum `AircraftOwner`, display-only introdotto in 12.5) viene RIMOSSO da UI e backend. Migrazione hand-written (doc-comment): `ALTER TABLE "Aircraft" DROP COLUMN "owner"` + `DROP TYPE "AircraftOwner"`. Sweep COMPLETO dei consumer (inventario 2026-07-24): `prisma/schema.prisma` (enum L264 + campo L307 + doc-comment L260), `src/lib/schemas/aircraft.ts` (`aircraftOwnerSchema`, `AircraftOwnerDto`, campo owner), `src/server/services/aircraft.service.ts` (create/update), `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx` (Select owner L391-395, `defaultValues.owner`, tipi), `src/components/dashboard/fleet-card.tsx` (`FleetCardItem.owner`), `src/app/[locale]/dashboard/fleet/page.tsx` (mapping owner), `prisma/seed-demo.ts` (owner nei dati). i18n `labels.identity.owner`/`ownerOptions.*` rimosse (IT+EN). Verificare che il pricing/altro NON dipenda da owner (era display-only — diff service atteso limitato a create/update dei campi anagrafici).
5. **(e2e + skill UI)** e2e: toggle archiviati mostra/nasconde un aeromobile archiviato; storici limitati a 5 con "mostra tutte" che espande; nessun riferimento a owner/proprietario nell'editor. e2e esistenti che asseriscono il campo owner o l'intero storico aggiornate. Selettori scoped/exact, MAI hasText con date/H:MM. Skill: karpathy-guidelines + design-taste-frontend + ui-ux-pro-max; coerenza AirOps. Verifica interattiva: prova PRIMA i tool `mcp__playwright__*` (server via Docker, scope locale — se non raggiungibili dalla sessione subagent, fallback script `@playwright/test` throwaway in /tmp, cancellati prima del commit).

## Contesto (puntatori — ricognizione 2026-07-24)

- Toggle: `fleet-console.tsx` (`includeArchived` state L95, `navigate` L98, checkbox `onChange` L117). Riferimento toggle: quello introdotto in Piloti (13.2) su `pilots-console.tsx`.
- Storici: `aircraft-editor.tsx` — `RatesSection` (`fetchRatesHistory` L606, render `history.map` L733, UNBOUNDED); hour-meter (`HOUR_METER_HISTORY_PAGE_SIZE=50` L750, `fetchHourMeterHistory` L755, `loadMore` L95/label). Endpoint: `/api/v1/aircraft/[id]/rates` (ritorna tutto), `/api/v1/aircraft/[id]/hour-meter-adjustments?pageSize&page` (paginato).
- Owner: enum+campo `schema.prisma:264,307` (+ doc-comment L260), migrazione originale `20260715170000_add_aircraft_fleet_fields`; consumer elencati in AC4. Doc-comment 12.5 dichiara owner "presentation/anagrafica only, no pricing" → rimozione sicura.
- **Ambiente**: identico alle story precedenti (DB fresco al dispatch, gates prima del commit, e2e foreground, commit appena i gates passano, MAI push, MAI playwright install; questa story TOCCA una migrazione ma NON `package.json`). Commit: `feat(13.4): flotta toggle archiviati + storici 5+mostra tutte + rimozione owner` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Ritiro stack legacy (13.11) e ogni altra pagina della punch-list (13.5+).
- Qualunque cambiamento alla logica pricing/contaore oltre la rimozione del campo owner (display-only).

## Dev Agent Record

### Implementation Plan

- **AC 1 (toggle archiviati)**: `fleet-console.tsx` — checkbox `<label>` sostituito dal bottone `.btn ${includeArchived ? 'on' : ''}` `aria-pressed` + `Icon.check` condizionale, `data-testid="fleet-toggle-archived"` — stesso identico markup del toggle Piloti (`pilots-console.tsx`, story 13.2). Stato/handler/query param invariati (`includeArchived`, `handleIncludeArchivedChange`, `navigate`).
- **AC 2 (storico tariffe)**: `RatesSection` — nuovo `HISTORY_VISIBLE_COUNT = 5` (condiviso con AC 3), stato locale `showAllRates` (default `false`); render slice client-side (`history.slice(0, HISTORY_VISIBLE_COUNT)` finché non espanso — i dati sono già tutti fetchati da `fetchRatesHistory`, quindi "mostra tutte" è un puro toggle, zero round-trip aggiuntivi). Bottone `data-testid="rates-history-show-all"` con label `t.raw` interpolata client-side (`labels.rates.showAll.replace('{count}', ...)`, stesso idiom di `scadenze-widget.tsx`'s `seeAll`), visibile solo se `history.length > 5` e non ancora espanso.
- **AC 3 (storico rettifiche contaore)**: `HOUR_METER_HISTORY_PAGE_SIZE` (usato come `pageSize` reale della query) portato da `50` a `5` (= `HISTORY_VISIBLE_COUNT`) — il meccanismo `loadMore`/"Carica altri" esistente è riusato INVARIATO (nessun rename: resta paginato 5 alla volta). Scelta deliberata rispetto a un "mostra tutte" single-shot: `paginationQuerySchema` cappa `pageSize` a 100 — un aeromobile con uno storico rettifiche > 100 righe non potrebbe mai essere "mostrato tutto" in una sola chiamata; l'incremento paginato resta corretto per qualunque cardinalità, a costo di più click per storici molto lunghi (accettabile, AC 3 ammette esplicitamente sia "mostra tutte" sia "carica altri").
- **AC 4 (rimozione owner)**: sweep completo — `prisma/schema.prisma` (enum `AircraftOwner` L264 + campo L307 + doc-comment L260, diff chirurgico verificato via `git diff` prima/dopo `prisma format` — il format automatico avrebbe riallineato colonne di modelli NON toccati, quindi editing manuale invece), migrazione hand-written `prisma/migrations/20260724120000_drop_aircraft_owner/migration.sql` (`DROP COLUMN` + `DROP TYPE`, doc-comment nello stile TD-2 delle migrazioni 13.1), `src/lib/schemas/aircraft.ts` (`aircraftOwnerSchema`/`AircraftOwnerDto` rimossi, campo `owner` rimosso da create/update/list schema), `aircraft.service.ts` (import type, `AircraftListItem.owner`, `AIRCRAFT_SELECT`, `toListItem`, create/update data — diff limitato ai campi anagrafici, pricing/contaore MAI toccati), `aircraft-editor.tsx` (tipo labels, `AircraftApiResponse`, `toEditable`, `defaultValues`, `<Select>` owner rimosso dal form), `fleet-card.tsx` (`FleetCardItem.owner`), `fleet/page.tsx` + `dashboard/page.tsx` (mapping `FleetCardItem` — quest'ultimo NON elencato nell'inventario AC 4 ma trovato dallo sweep grep-based, è l'Overview widget story 12.12), `prisma/seed-demo.ts` (3 occorrenze `owner: 'CLUB'|'PRIVATE' as const` rimosse), test unitari (`aircraft.service.test.ts`: fixture + 3 test case aggiornati/rinominati). i18n: `AircraftPage.editor.identity.owner`/`ownerOptions.{club,private}` rimossi IT+EN, parità chiavi verificata via script (0 chiavi orfane in entrambe le direzioni).
- Migrazione applicata e verificata su DB VERAMENTE fresco (drop+create via `docker exec` psql, `prisma migrate deploy` da zero attraverso tutte le 42 migrazioni, poi `prisma db seed`): colonna `owner` e tipo `AircraftOwner` assenti via `\d "Aircraft"`/`pg_type`, resto dello schema (`based`, `status`, FK da `AircraftRate`/`Booking`/`Flight`/`HourMeterAdjustment`/`PackageTypeAircraft`) intatto.
- `npx prisma generate` rieseguito (client rigenerato, `src/generated/` gitignored — nessun file da includere nel commit).

### Completion Notes

- AC 1: done — toggle identico a Piloti (screenshot comparativo off/on, stesso accent/checkmark), stessa query `?includeArchived`, catena server invariata.
- AC 2: done — 5 righe di default, "Mostra tutte (N)" espande il resto (screenshot: 6 tariffe seedate → 5 mostrate + bottone "Mostra tutte (1)" → click → 6 righe, bottone sparito). Storico completo sempre raggiungibile (nessun dato scartato, solo nascosto).
- AC 3: done — finestra iniziale 5 (era 50), "Carica altri" riusato invariato (screenshot: 6 rettifiche seedate → 5 mostrate + bottone → click → 6 righe, bottone sparito).
- AC 4: done — nessun riferimento a `owner`/`AircraftOwner` residuo in `src/`, `prisma/schema.prisma`, `e2e/` (grep di conferma, esclusi `src/generated` e la migrazione storica `20260715170000` che introduceva il campo — mai riscritta). Pricing/contaore NON toccati: diff di `aircraft.service.ts` limitato ai campi anagrafici (create/update `owner` rimosso), nessuna riga di `rates.service.ts`/logica contaore modificata (0 file toccati in quell'area).
- AC 5: e2e aggiornate (`aircraft-management.spec.ts`: checkbox→toggle, assert "Proprietario" assente nel form; 2 nuovi test in `aircraft-rates.spec.ts`/`aircraft-status-hours.spec.ts` per il 5+"mostra tutte"/"carica altri"). Skill applicate: `karpathy-guidelines` (diff chirurgico, niente riformattazione speculativa dello schema.prisma), `design-taste-frontend`+`ui-ux-pro-max` (toggle 1:1 col pattern Piloti, bottone "mostra tutte" nello stile `.btn` esistente, nessun elemento nuovo introdotto nel design system). Verifica interattiva: MCP `mcp__playwright__*` NON raggiungibile da questa sessione subagent (`Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome`) → fallback script `@playwright/test` throwaway (cancellati prima del commit) contro il dev server reale — screenshot allegati nel Debug Log sotto.

### File List

- `src/app/[locale]/dashboard/fleet/fleet-console.tsx` (toggle archiviati bottone on/off)
- `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx` (storico tariffe 5+mostra tutte, storico contaore finestra 5, campo owner rimosso)
- `src/app/[locale]/dashboard/fleet/page.tsx` (label `rates.showAll` wired, mapping/labels owner rimossi)
- `src/app/[locale]/dashboard/page.tsx` (Overview widget: mapping owner rimosso — consumer trovato dallo sweep, non elencato in AC 4)
- `src/components/dashboard/fleet-card.tsx` (`FleetCardItem.owner` rimosso)
- `src/lib/schemas/aircraft.ts` (`aircraftOwnerSchema`/`AircraftOwnerDto` rimossi, campo owner rimosso da create/update/list schema)
- `src/server/services/aircraft.service.ts` (owner rimosso da tipo/select/create/update — diff limitato ai campi anagrafici)
- `src/server/services/aircraft.service.test.ts` (fixture + test aggiornati)
- `prisma/schema.prisma` (enum `AircraftOwner` + campo `owner` rimossi)
- `prisma/migrations/20260724120000_drop_aircraft_owner/migration.sql` (nuova, hand-written)
- `prisma/seed-demo.ts` (owner rimosso da 3 aeromobili demo)
- `messages/it.json`, `messages/en.json` (`editor.identity.owner`/`ownerOptions` rimossi, `editor.rates.showAll` aggiunto — parità IT/EN verificata)
- `e2e/aircraft-management.spec.ts` (checkbox→toggle `fleet-toggle-archived`, assert no campo Proprietario)
- `e2e/aircraft-rates.spec.ts` (nuovo test: storico tariffe 5+"mostra tutte")
- `e2e/aircraft-status-hours.spec.ts` (nuovo test: storico contaore 5+"carica altri")

### Interactive verification (Playwright)

`mcp__playwright__*` tentato per primo: irraggiungibile da questa sessione subagent (stesso errore Chromium già documentato in story 13.3) → fallback a script `@playwright/test` throwaway (posizionati temporaneamente nella working dir per la risoluzione dei moduli ESM da `/tmp`, cancellati prima del commit — nessuno mai messo in staging) contro il dev server reale (`npm run dev`, stesso Chromium bundled usato dalla suite e2e).

- Screenshot comparativo `Mostra archiviati` OFF/ON su Piloti vs Flotta: stile pixel-identico (stesso accent ambra, stesso checkmark, stesso bordo) — confermato visivamente prima del commit.
- Editor aeromobile: form anagrafica senza alcun campo "Proprietario" (screenshot). Seedate 6 tariffe (date distinte) + 6 rettifiche contaore via API sull'aeromobile demo `I-ABCD`: storico tariffe mostra le ultime 5 (2020→2016) + bottone "Mostra tutte (1)" → click → tutte 6 (2020→2015), bottone sparito; storico rettifiche mostra le ultime 5 (Rettifica 6→2) + "Carica altri" → click → tutte 6 (Rettifica 6→1), bottone sparito.
- e2e (foreground, dev server reale, DB resettato drop+create+migrate+seed prima e dopo): i 3 spec file toccati (`aircraft-management`, `aircraft-rates`, `aircraft-status-hours`) passano 16/16 a `--workers=1`. Un run iniziale a concorrenza piena (`--workers` di default, 3 file insieme) ha prodotto molti falsi negativi da login-timeout — stessa classe di flakiness "cold-compile sotto `next dev`" già documentata in `playwright.config.ts` e nella story 13.3 (non una regressione: confermato rieseguendo gli stessi test in isolamento, dove passano; nessun `LoginAttempt` fallito registrato nel DB nella finestra, quindi non è nemmeno il rate-limit di login — solo latenza del dev server sotto carico concorrente). Una singola failure pre-esistente e non toccata da questa story (`"Riservato" badge`, booking a `now+3s`) è risultata anch'essa flaky solo sotto 2 worker concorrenti e verde in isolamento — stessa causa.
- `npm run seed:demo` (consumer esplicito AC 4) rieseguito manualmente con env sourced: completa senza errori, "3 aeromobili pronti (con storico tariffe)" — conferma che la rimozione di `owner` dall'array `AIRCRAFT` non rompe l'upsert.
- Suite vitest completa: 1443/1443 verdi dopo ogni fase di modifica.

### Change Log

- 2026-07-24: Story 13.4 implementata (toggle archiviati Flotta on/off pattern Piloti, storici tariffe/contaore limitati a 5 righe + espansione, rimozione completa campo `owner`/`AircraftOwner` da UI+backend+DB con migrazione hand-written verificata su psql). `npm run gates`: PASS (lint/typecheck/test 1443 verdi/build). e2e: 3 spec toccati, 16/16 verdi a `--workers=1` (vedi Interactive verification per l'analisi della flakiness a concorrenza piena, non imputabile a questa story).

## Review Record

_(compilato dopo la review adversarial)_
