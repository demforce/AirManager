---
baseline_commit: a90c22c
---

# Story 13.4: Flotta — toggle archiviati on/off, storici a 5+"mostra tutte", rimozione owner/private

Status: ready-for-dev

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

_(compilato dal dev subagent)_

## Review Record

_(compilato dopo la review adversarial)_
