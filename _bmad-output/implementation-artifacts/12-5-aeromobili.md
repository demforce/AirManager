---
baseline_commit: 9cd1d7852324ecb29c590e8ff1a5d704e429b055
---

# Story 12.5: Aeromobili — fleet page AirOps + campi additivi

Status: review

## Story

As a staff dell'aviosuperficie,
I want la pagina Aeromobili nel design AirOps — griglia di card con stato derivato e editor slide-over completo (anagrafica, disponibilità, tariffe storicizzate, contaore, archiviazione) — con i nuovi campi posti/carburante/proprietario/basato e la tariffa dry facoltativa,
so that la flotta si gestisca nel nuovo linguaggio senza perdere NESSUNA funzione della pagina legacy (che questa story elimina).

**Riferimenti vincolanti**: spec §3 (riga Aeromobili) + §5.6 + D13; piano Task 5; prototipo `docs/design-reference/airops/src/Fleet.jsx` (FleetCard, AircraftEditor).

## Acceptance Criteria

1. **(Schema additivo)** UNICA migrazione hand-written `<ts>_add_aircraft_fleet_fields`: `CREATE TYPE "AircraftOwner" AS ENUM ('CLUB','PRIVATE')` + su `Aircraft`: `seats Int?`, `fuelType String?` (testo libero), `owner "AircraftOwner" NOT NULL DEFAULT 'CLUB'`, `based Boolean NOT NULL DEFAULT true`; su `AircraftRate`: `dryHourlyRateCents Int?`. (Enum NUOVO + default nello stesso file è sicuro — precedente `20260705150000_add_aircraft_status…`; NON è il caso ADD-VALUE della 12.2.) Doc-comment `///` sui campi in schema.prisma. `AIRCRAFT_SELECT` (`aircraft.service.ts:30`), `aircraftListItemSchema`, `createAircraftSchema`/`updateAircraftSchema` estesi (tutti opzionali/additivi); `createAircraftRateSchema` accetta `dryHourlyRateCents?` e `aircraftRateItemSchema` lo espone. **PRICING INTATTO**: `RATE_SELECT`/`getEffectiveRate`/`getEffectiveRates` (`rates.service.ts:31/:175/:201`) e `flights.service.ts:543/:570` NON si toccano — la dry è display-only (letta solo da `listAircraftRates`).
2. **(Fleet page)** NUOVA `/dashboard/fleet` (`aircraft.manage`, redirect come la pagina legacy; route-registry: voce `fleet` accesa con `airopsNative: true`): page-head con sub "N totali · N disponibili · N AOG" + griglia `.fleet-grid` di `.ac-card` (marche mono, badge stato, silhouette `Icon.acsmall`, modello, "Tariffa €X/h" dalla effective rate — batch `getEffectiveRates`, "—" se assente). **Badge stato derivato**: `AOG` = OUT_OF_SERVICE (tooltip/testo con statusReason); `Riservato` = esiste una prenotazione APPROVED che copre ADESSO (query batched sugli id della pagina — usare una singola findMany con overlap su now, NIENTE N+1); altrimenti `Disponibile`. Ricerca `q` e toggle "mostra archiviati" preservati (param URL esistenti); card archiviate con badge dedicato. Paginazione esistente preservata (griglia paginata come la lista legacy, PAGE_SIZE 20).
3. **(Editor slide-over)** Click su card (o "Aggiungi aeromobile") apre lo slide-over port di `AircraftEditor` con TUTTE le funzioni della pagina legacy, riorganizzate a sezioni:
   - **Anagrafica**: marche (uppercase), tipo, modello, posti, carburante (Select con opzioni AVGAS 100LL / Jet A-1 / Mogas — valore memorizzato come testo), proprietario (Club/Privato), basato (segmented Basato/Ospite), note → POST/PATCH esistenti.
   - **Disponibilità**: stato attuale + azioni fuori-servizio (motivo OBBLIGATORIO, `setOutOfService`) / rientro in servizio — endpoint esistenti, semantica atomica invariata.
   - **Tariffe** (lettura `aircraft.manage`, creazione `settings.manage` come oggi): tariffa corrente wet (+dry se presente), storico `validFrom desc`, form nuova tariffa wet OBBLIGATORIA + dry OPZIONALE (append-only, 409 su validFrom duplicato).
   - **Contaore**: valore H:MM (`formatMinutes`), adjustment con nuovo valore+motivo (lock FOR UPDATE esistente), storico paginato load-more.
   - **Archivia/Ripristina** con conferma two-step.
   Il form create per un nuovo aeromobile include hourMeterMinutes iniziale come oggi.
4. **(Sostituzione legacy)** `src/app/[locale]/dashboard/aircraft/` (page + aircraft-manager.tsx) ELIMINATA in questa story; il link del widget home (`dashboard/page.tsx:423` `linkHref="/dashboard/aircraft"`) punta a `/dashboard/fleet`; verificare se `nav-items.ts` è già orfano post-12.1 (la shell usa route-registry): se sì rimuovere la voce aircraft o l'intero file SE nessun consumer resta (grep prima — se ha ancora consumer, solo repoint href e nota per 12.13).
5. **(e2e)** `aircraft-management.spec.ts` / `aircraft-rates.spec.ts` / `aircraft-status-hours.spec.ts`: i comportamentali (409 duplicati, 403 RBAC via API, 401 envelope, guard redirect) INVARIATI; gli UI-strutturali riscritti su card-grid + slide-over (create appare in griglia, archivia sparisce dal default e riappare col filtro, out-of-service→badge AOG→rientro, adjustment contaore aggiorna card+storico, tariffe storico+corrente con dry). Test NUOVO: badge Riservato con una prenotazione APPROVED in corso (fixture con orari attorno a now — run-unique).
6. **(Gates)** `npm run gates` verde; i 3 spec aircraft verdi in locale (--retries=2); verifica interattiva in entrambi i temi (pagina AirOps-nativa, shim assente).

## Contesto e decisioni di design (vincolanti — ricognizione 2026-07-15)

- **Service** (`src/server/services/aircraft.service.ts`, 478 righe): tutto gated `aircraft.manage` (NESSUN aircraft.read — i piloti vedono la flotta via bookings). `listAircraft` L151 (paginata, `q` su registration/model, `archivedAt:null` salvo `includeArchived` L156), `listOutOfServiceAircraft` L194 (widget home), `createAircraft` L218 (P2002→409), `updateAircraft` L253 (NO hourMeterMinutes), `archiveAircraft` L295/`unarchiveAircraft` L315 (409 su stato sbagliato), `setOutOfService` L340/`returnToService` L370 (updateMany atomico), `adjustHourMeter` L406 ($transaction + FOR UPDATE), `listHourMeterAdjustments` L450. `AIRCRAFT_SELECT` L30 = proiezione unica: i campi nuovi si aggiungono LÌ.
- **Rates** (`src/server/services/rates.service.ts`, 226 righe): append-only, MAI update/delete (correzione = nuova riga con validFrom successivo); `createAircraftRate` L96 (`settings.manage`, 409 su archiviato L107 e su validFrom duplicato), `listAircraftRates` L145 (`aircraft.manage`, desc, take 500), `getEffectiveRate` L175 / `getEffectiveRates` L201 (batch, Map — usato dalla pagina per evitare N+1). Pricing: `flights.service.ts:543/:570` + `NO_AIRCRAFT_RATE` L417 — INTOCCABILI.
- **Pagina legacy** (`dashboard/aircraft/page.tsx` 264 righe + `aircraft-manager.tsx` 1362 righe client): searchParams `page/q/includeArchived` L13, batch rates L50, `canManageSettings` L108. Panels: create/edit/out-of-service/hour-meter/rates + confirm archive/unarchive/return L184-190. Endpoint chiamati: POST/PATCH aircraft L623/L720, `[id]/{archive,unarchive,return-to-service}` L297, `out-of-service` L888, `hour-meter-adjustments` GET/POST L981/L1014 (+load-more L1002), `rates` GET/POST L1220/L1240. Testids legacy: `aircraft-feedback/aircraft-export-button/aircraft-form-error/operational-status-{id}/current-rate-{id}/hour-meter-*/rates-current/rate-history-row` — i test riscritti possono rinominare coerentemente.
- **API/servizi invariati**: la story NON crea endpoint nuovi (solo schemi estesi). Export xlsx aeromobili esistente preservato (`aircraft-export-button` → `buildExportHref('/api/v1/aircraft', …)`).
- **"Riservato"**: derivazione presentazionale (nessun campo DB): `prisma.booking.findMany({ where: { aircraftId: { in: pageIds }, status: 'APPROVED', startsAt: { lte: now }, endsAt: { gt: now } }, select: { aircraftId: true } })` nel server component (o helper nel service se più pulito — scelta del dev, dichiararla).
- **Prisma**: `Aircraft` L229, `AircraftRate` L269 (`@@unique([aircraftId, validFrom])`). Precedente migrazione additiva enum+default: `20260705150000_add_aircraft_status_hour_meter_adjustment`.
- **Consumer esterni sicuri** (ricognizione): bookings/flights leggono dai SERVICE con tipi option locali — la cancellazione della pagina legacy non li tocca; gli unici href da ripuntare sono widget home L423 e (se vivo) nav-items.ts L32.
- **12.3 meccanismo `airopsNative`**: riusarlo per `fleet`.
- **Ambiente locale**: identico alle story precedenti (docker compose, DB fresco al dispatch, port 3000 libero, cold-start flake → --retries=2, MAI playwright install).
- **Commit**: `feat(12.5): fleet page AirOps + campi aeromobile additivi`. Niente push.

## Fuori scope dichiarato

- Qualunque uso della dry rate nel pricing/consumi (display-only, per sempre finché non ratificato diversamente).
- FleetCard nella Panoramica (12.12 — riusa il componente di questa story).
- Rimozione definitiva di `nav-items.ts` se ha ancora consumer (12.13).

## Dev Agent Record

### Nota di chiusura (sessione principale)

Il dev subagent (Sonnet 5 xhigh) ha implementato la story ma ha **esaurito il runway DURANTE la ri-esecuzione e2e finale**, prima di committare e di compilare queste note (ultimo messaggio: "Waiting for the Monitor to report completion of the aircraft-focused e2e re-run"; processi e2e/next-server orfani terminati dalla sessione principale). La sessione principale ha chiuso meccanicamente (pattern lezione 12.3): verifica **`npm run gates` verde** (lint · typecheck · **1344** unit · build), migrazione applicata e colonne/enum verificate su **DB fresco** via psql (`Aircraft.{seats,fuelType,owner,based}`, `AircraftRate.dryHourlyRateCents`, enum `AircraftOwner=CLUB,PRIVATE` — tutti come da AC 1), poi commit `feat(12.5)`. **Le note sottostanti sono ricostruite dal diff, non dall'auto-report del dev** — la review adversarial va condotta a freddo sull'intero diff.

### Aree da scrutinare in review (dal diff, NON auto-dichiarate dal dev)

- **"Riservato"** (AC 2): derivazione aggiunta in `bookings.service.ts` (+ test) — verificare che sia **batched** (nessun N+1 sugli id di pagina) e che non alteri la logica overlap/pricing esistente.
- **Rimozione legacy + repoint** (AC 4): `dashboard/aircraft/{page,aircraft-manager}.tsx` ELIMINATI; `nav-items.ts`, `dashboard/page.tsx` (widget home), `route-registry.ts` modificati — verificare href `/dashboard/fleet` e assenza di consumer orfani.
- **e2e non-aircraft toccati**: `flight-reversal.spec.ts`, `flights.spec.ts`, `home-dashboard.spec.ts` modificati (presumibilmente per repoint/eliminazione legacy) — confermare che i comportamentali restino invariati.
- **Confine pricing INTOCCABILE** (AC 1): `rates.service.ts` (+ test) modificato per la dry rate display-only — confermare che `getEffectiveRate*`/`RATE_SELECT` e `flights.service.ts` NON cambino la semantica di pricing.
- **Arbiter**: la suite **CI=1 completa su build di produzione NON è stata eseguita in CI-mode** dal dev (girava in dev-mode quando il turno è finito) — è la priority-zero della review.

### File List (ricostruita dal git status)

- **Migrazione**: `prisma/migrations/20260715170000_add_aircraft_fleet_fields/migration.sql` (nuovo); `prisma/schema.prisma` (M)
- **Fleet page (nuovi)**: `src/app/[locale]/dashboard/fleet/page.tsx`, `fleet-console.tsx`, `aircraft-editor.tsx`
- **Servizi/schemi (M)**: `aircraft.service.ts` (+ `.test`), `rates.service.ts` (+ `.test`), `bookings.service.ts` (+ `.test`), `exports.service.ts`, `src/lib/schemas/aircraft.ts`
- **Shell/nav (M)**: `src/components/shell/route-registry.ts`, `dashboard/nav-items.ts`, `dashboard/page.tsx`
- **Legacy (D)**: `dashboard/aircraft/page.tsx`, `dashboard/aircraft/aircraft-manager.tsx`
- **i18n (M)**: `messages/it.json`, `messages/en.json`
- **e2e (M)**: `aircraft-management`, `aircraft-rates`, `aircraft-status-hours`, `flight-reversal`, `flights`, `home-dashboard` (`.spec.ts`)
- **Tracking (M)**: `sprint-status.yaml` (12-5 → review)
