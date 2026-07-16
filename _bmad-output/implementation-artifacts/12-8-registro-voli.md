---
baseline_commit: fda70d9fb4574919d27adb600d30fdd6b30af01f
---

# Story 12.8: Registro voli — logbook AirOps + "Nuova voce"

Status: done

## Story

As a staff dell'aviosuperficie (e come pilota/istruttore per il proprio registro),
I want il registro voli nel design AirOps — tabella logbook con filtri/totali/KPI, "Nuova voce" con durata e costo derivati, storno e correzione — sostituendo la pagina `/dashboard/flights` legacy,
so that la registrazione e la consultazione dei voli avvenga nel nuovo linguaggio SENZA perdere nessun comportamento (derivazione durata/costo, RBAC own-registry, storno/correzione, export xlsx/PDF).

**Riferimenti vincolanti**: spec §3 (riga Registro voli, `/dashboard/logbook`) + D11/D13; piano Task 8 (righe 228-236, fate-map 336/346); prototipo `docs/design-reference/airops/src/LogbookView.jsx` + `Forms.jsx#NewLogbookForm`.

## Ratifiche utente (2026-07-15 — decise via AskUserQuestion PRIMA del dispatch)

1. **"Nuova voce" → SlideOver** (coerenza con fleet 12.5 / pilots 12.6): il form è uno **SlideOver**, NON inline. Il **breakdown/totale/nuovo saldo** al successo è PRESERVATO dentro lo SlideOver (o toast dettagliato) — nessun feedback perso rispetto al `flight-result-*` inline attuale.
2. **Rotta legacy `/dashboard/flights` → HARD-DELETE** (scelta utente, NIENTE redirect): eliminare la rotta; **ripuntare TUTTI i link interni** a `/dashboard/logbook` preservando i query param. I bookmark esterni a `/dashboard/flights` faranno 404 (accettato). ⚠️ Il repoint dei link entranti (AC 5) DEVE essere COMPLETO — nessuna rete di sicurezza da redirect.
3. **KPI/totali = solo REGISTERED** (deciso dalla sessione principale): ricavo/ore/decolli-atterraggi/voci contano solo i REGISTERED; i CANCELLED restano visibili in tabella (badge ANNULLATO) quando il filtro stato li include, ma NON contribuiscono ai totali/KPI.

## Acceptance Criteria

1. **(Pagina logbook — server)** NUOVA `/dashboard/logbook` (sostituisce `/dashboard/flights`): stesse due facce RBAC di oggi — `flights.manage` (staff/admin) = manager completo; ogni altro ruolo = registro **own** in sola lettura (`self.read`; il service impone `OR: [{personId: actor.personId}, {instructorProfile:{personId}}]`, `flights.service.ts:1313`). URL param preservati (`page/dateFrom/dateTo/aircraftId/personId/instructorPersonId/flightType/status`, sanitizer come `flights/page.tsx:45-56`); per i non-staff `aircraftId`/`personId` droppati e `instructorPersonId` ammesso solo se `=== actor.personId` (page.tsx:105-118, comportamento server invariato). Pickers via `listAircraft`/`listPeople` (`profile:'pilot-or-student'`/`'instructor'`), flights via `listFlights`, page size **20**. Route-registry: voce `logbook` (`route-registry.ts:90`, oggi `enabled:false`) → **`enabled:true, airopsNative:true`**.
2. **(Tabella logbook)** Port di `LogbookView.jsx`: page-head "Registro voli · N voci", KPI row (Voci / Ore hh:mm / Decolli·Atterraggi / Ricavo — **conteggiati sui soli REGISTERED**, ratifica 3; **KPI "Voli IFR" OMESSO**: nessun campo IFR nel dominio, D13/piano), tabella `.logbook` colonne **data (DD/MM/YYYY `formatDateOnly`) / tratta (part→arr) / pilota (+CFI sub) / aereo / tipo (Badge) / ore (H:MM) / decolli / atterraggi / costo (TD-5 `formatCents`) / azioni**; **PIC** derivato via `src/lib/flight-pic.ts#flightPicPerson` (non-SCHOOL o SCHOOL-solo → person; SCHOOL-dual → instructor; testid `flight-pic-cell`), riga `flight-row`, badge stato `flight-status-badge` (REGISTERED/ANNULLATO). **Riga Totali** (ore/costo dei REGISTERED). Filtri: staff = periodo + pilota + aereo + tipo + stato; **non-staff = periodo + tipo + stato** (niente picker aereo/persona, come oggi). Mappatura tipo: `TOURISM`→"Turismo/Privato", `SCHOOL`→"Scuola" (+ "— solista" se `isSolo`), `AERIAL_WORK`→"Lavoro aereo" (riusa le label i18n esistenti `flights/page.tsx:291-300`). Paginazione (testid `flight-pagination-status`) preservata.
3. **("Nuova voce" — D13, SlideOver ratifica 1)** Solo `flights.manage`. Port di `Forms.jsx#NewLogbookForm` in uno **SlideOver** (primitive 12.1, come fleet/pilots) sul dominio REALE: campi **data, aeromobile (typed selector), pilota (typed selector), istruttore (select/typed), tipo (`FlightType`), partenza/arrivo ICAO OBBLIGATORI, orario decollo/atterraggio OBBLIGATORI, decolli/atterraggi (default 1)**; **NIENTE durata/costo manuali** (derivati server-side) — mostrare la **durata calcolata live, read-only, nel footer** del form. POST `/api/v1/flights` (`registerFlight`, **risposta nested `{ flight, account }`** — schema `registerFlightResponseSchema`), `Idempotency-Key` (solo registrazione). Vincoli dominio invariati: `SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR`, `SOLO_REQUIRES_SCHOOL`, `NO_AIRCRAFT_RATE`, `NO_INSTRUCTOR_RATE`, `FLIGHT_TIMES_INVALID`, `HOUR_METER_INVALID`, past-midnight = giorno successivo. Il **breakdown/totale/nuovo saldo** al successo è PRESERVATO **dentro lo SlideOver** al successo (o toast dettagliato) — nessun feedback perso rispetto al `flight-result-*` inline.
4. **(Correggi + Storna)** Azioni su riga solo per `REGISTERED` (come oggi): **Correggi** (`correctFlight`, apre l'editor precompilato + motivo, linka vecchio→nuovo e riadatta consumi/pacchetti) e **Storna/Annulla** (`cancelFlight`, motivo obbligatorio, 409 su secondo storno, reverte saldo/contaore/pacchetto, badge ANNULLATO+motivo). Testid preservati o rinominati coerentemente (`flight-cancel-*`, `flight-correct-action`). Nessuna modifica a `flights.service.ts`/schema/route (SOLO UI).
5. **(Repoint + HARD-DELETE rotta legacy — ratifica 2)** `/dashboard/flights` **ELIMINATA (hard-delete, NIENTE redirect)**. Ripuntare a `/dashboard/logbook` **TUTTI** i link entranti coi query param preservati (il repoint DEVE essere COMPLETO — nessuna rete di sicurezza da redirect, i bookmark esterni faranno 404): `pilots/pilot-profile.tsx:260` ("Vedi tutti", `?personId=`, testid `pilot-profile-view-all-flights` — DEVE restare verde), `people/[id]/page.tsx:484`, `school/page.tsx:37` (drill-down `?instructorPersonId=&flightType=SCHOOL&dateFrom&dateTo` — il logbook DEVE onorarli, incl. self-scoping non-staff), widget `dashboard/page.tsx:247-248/517`, nav legacy `nav-items.ts:43`. ELIMINARE `dashboard/flights/{page.tsx, flights-manager.tsx}` (+ la dir se vuota) — NON `api/v1/flights/**`, NON `flights.service.ts`, NON `schemas/flights.ts`. Grep finale per zero riferimenti residui a `/dashboard/flights`.
6. **(e2e)** `flights.spec.ts` RISCRITTO sui nuovi selettori/rotta ma con TUTTI i comportamentali preservati (durata derivata + live, breakdown, FLIGHT_CHARGE negativo, contaore avanza, SCHOOL con istruttore addebita entrambi, `NO_AIRCRAFT_RATE`, 403 AD-8 pilota, `FLIGHT_TIMES_INVALID`, past-midnight, colonne logbook + PIC=istruttore su SCHOOL dual, nav mostra "Registro voli"). `flight-log.spec.ts` ADATTATO (pilota vede SOLO i propri voli own/come-istruttore, read-only; 403 su personId altrui; filtri combinati staff; paginazione). `flight-reversal.spec.ts` ADATTATO (storno reverte tutto, 409, correzione linka vecchio→nuovo, pilota 403 su /cancel e /correct). `exports.spec.ts` + `pdf-exports.spec.ts` restano VERDI invariati (stessi endpoint `/api/v1/flights` + `/pdf`). Selettori scoped/exact (103-F1), MAI `hasText` con H:MM/date per disambiguare righe.
7. **(Gates)** `npm run gates` verde; spec toccati verdi in locale (--retries=2); verifica interattiva in entrambi i temi (pagina AirOps-native, shim assente).

## Contesto e decisioni di design (vincolanti — ricognizione 2026-07-15)

- **Service INTOCCABILE** (`flights.service.ts`, 65 KB): la 12.8 è **solo-UI**. Export reale = `registerFlight` L839 (authorize `flights.manage`; ritorna **`{ flight: toListItem(...), account }`** L922 — nested, come `createBooking`); `cancelFlight` L1026 / `correctFlight` L1130 (anch'essi nested); `listFlights` L1289 (own-access WHERE L1313, foreign personId/instructorPersonId → 403 L1297-1304, null personId → pagina vuota L1308, ordine `flightDate desc,createdAt desc,id desc` L1340). Error code `NO_AIRCRAFT_RATE` L545. NON reimplementare nulla: consumare l'API esistente.
- **PIC** = `src/lib/flight-pic.ts#flightPicPerson` (L25-28, puro, mai persistito) — usarlo per la colonna PIC.
- **Schema** (`schemas/flights.ts`): `flightTypeSchema` TOURISM/SCHOOL/AERIAL_WORK (L9), `registerFlightSchema` L74-91 (NO minutes/flightDate/dur/cost — derivati), `flightListItemSchema` L143-176 (minutes/takeoffs/landings/breakdown/person/instructor/isSolo/status), `registerFlightResponseSchema` L191-194 (`{flight,account}`), `correctFlightSchema` L220 (=register+reason), `cancelFlightSchema` L205 (`{reason}`).
- **Pagina/manager legacy**: `flights/page.tsx` (449, RBAC L87-94, param L14-56, pickers L146-166, page size 20 L39, testid `flight-instructor-filter-banner/-clear` L244/250, `flight-pagination-status` L429); `flights-manager.tsx` (1637: `FlightsManager` L325 con patch ottimistico, tabella L577-669 `flight-row`/`flight-pic-cell`, result-panel L428-499 `flight-result-*`, azioni L638-664, `CancelFlightPanel` L896-976, `FilterBar` L749-878 con `SearchCombobox` staff-only, `RegisterFlightForm` L1107 doppia come "Correggi", `composeFlightTimes` L1023, `useIdempotencyKey` in registrazione). i18n namespace `FlightsPage` (label tree L280-413) → re-home/riusa in `LogbookPage` senza lasciare stringhe non tradotte.
- **API routes che RESTANO**: `api/v1/flights/route.ts` (GET+POST), `[id]/cancel`, `[id]/correct`, `pdf`.
- **Couplings**: 12.7 (compensi, in corso) e 12.10 (stats) leggono `Flight` **direttamente via Prisma**, non via UI/`listFlights` → la 12.8 non li rompe finché NON tocca service/schema/API. Il pulsante "Registra volo" della 12.7 punta al form di QUESTA story (piano L225) — form condiviso/riusabile. Export (`exports.service.ts:27` importa `listFlights`) e `people.service`/`school.service` (letture Prisma dirette) intatti.
- **Template**: struttura server `page.tsx` (redirect-gate + `Promise.all` + ISO-serialize) → `*-console.tsx` client (tabella/filtri/stato) → `*-editor`/SlideOver, come fleet (12.5)/pilots (12.6). Primitive 12.1 in `src/components/ui/` (slide-over/field/badge/kpi/export-menu/toast/segmented/calendar-popover). Verificare se 12.3/12.5/12.6 hanno già prodotto un combobox design-styled da riusare al posto di `search-combobox.tsx` (piano Task 3).
- **Due sistemi nav coesistono** (`route-registry.ts` sidebar vs `nav-items.ts` legacy): confermare quale rende la shell così la voce non porti a 404.
- **Ambiente locale**: identico alle story precedenti (docker compose, DB fresco al dispatch, port 3000 libero, cold-start login flake → --retries=2, `POST /flights` richiede tariffa aeromobile → 422 `NO_AIRCRAFT_RATE`, DTO nested, MAI playwright install, Playwright MCP rotto → script throwaway).
- **Commit**: `feat(12.8): logbook AirOps + nuova voce`. Niente push.

## Fuori scope dichiarato

- Qualunque campo/enum nuovo (IFR, ME, noleggio come tipo): il dominio ha solo TOURISM/SCHOOL/AERIAL_WORK + isSolo (D13). Schema INVARIATO.
- Modifiche a `flights.service.ts`/`schemas/flights.ts`/`api/v1/flights` (solo-UI).
- Consumo dei voli in Statistiche/serie storiche (12.10) e nei compensi (12.7 — già fatto).
- Shortcut "Registra volo" dalle altre pagine oltre al riuso del form condiviso (le pagine che lo invocano restano nelle rispettive story).

## Dev Agent Record

### Completion Notes

- Implementata `/dashboard/logbook` (server `page.tsx` + client `logbook-console.tsx` + `flight-editor.tsx`), port di `LogbookView.jsx`/`Forms.jsx#NewLogbookForm` sul dominio reale (D13): tabella `.logbook`/`.lb-row` con colonna PIC dedicata (`flight-pic-cell`, oltre alle 10 colonne del prototipo — necessaria per l'assert e2e su PIC=istruttore), riga Totali, KPI row (Voci/Ore/Decolli-Atterraggi/Ricavo, ratifica 3: solo REGISTERED, scope pagina corrente — `flights.service.ts` non espone un aggregato cross-pagina e sommare su tutte le pagine avrebbe richiesto N round-trip; nessuna modifica al service, SOLO-UI rispettato).
- "Nuova voce" = SlideOver (ratifica 1), stesso componente per "Correggi volo" (come il legacy `RegisterFlightForm`); durata calcolata live mostrata SOLO nel footer (AC 3); breakdown/nuovo saldo mostrati DENTRO lo SlideOver al successo (stato `lastResult`), mai un semplice toast — l'utente chiude esplicitamente quando pronto.
- Storno via mini-modal (`.mini-modal`/`.mini-modal-card`, stesso pattern già usato da `bookings-table.tsx#denyModal`) — testid `flight-cancel-panel`/`flight-cancel-confirm`/`flight-cancel-feedback` preservati.
- Rotta legacy `/dashboard/flights` HARD-DELETATA (ratifica 2): eliminati `flights/page.tsx` e `flights-manager.tsx` (+ dir). Ripuntati TUTTI i link entranti: `pilot-profile.tsx`, `people/[id]/page.tsx`, `school/page.tsx` (drill-down istruttore), `dashboard/page.tsx` (2 widget), `nav-items.ts` (label "Voli" invariata, solo href). `route-registry.ts`: voce `logbook` → `enabled:true, airopsNative:true`. Grep finale: zero riferimenti residui a `/dashboard/flights` in codice/test (solo commenti storici/doc rimasti, intenzionale).
- i18n: `FlightsPage` lasciato INTATTO (letto direttamente da `exports.service.ts` per gli header xlsx/pdf, fuori scope SOLO-UI) — contenuto duplicato/riadattato sotto una nuova namespace `LogbookPage` in `messages/it.json`/`en.json`.
- e2e: `flights.spec.ts` riscritto, `flight-log.spec.ts`/`flight-reversal.spec.ts` adattati (selettori SlideOver, nav sidebar "Registro voli"). `exports.spec.ts`/`pdf-exports.spec.ts`/`person-detail.spec.ts`/`school.spec.ts`/`home-dashboard.spec.ts`: solo swap di path (`/dashboard/flights` → `/dashboard/logbook`), invariati altrimenti. `package-consumption.spec.ts`/`typeahead-pickers.spec.ts`: oltre allo swap di path, aggiunta l'apertura esplicita dello SlideOver ("Nuova voce") — assumevano il form legacy sempre aperto inline; `package-consumption.spec.ts` ha anche guadagnato lo stesso scoping-per-aereo (T0 hardening) già usato altrove, sostituendo una disambiguazione per H:MM con il testo della package-note (lezione 11.2).
- Due bug trovati e fissati durante la verifica e2e completa (non durante una review, durante l'implementazione stessa): (1) la nota "di cui X da pacchetto" era stata omessa dalla cella Ore; (2) azioni riga (Storna/Correggi) e lineage (badge/nota di correzione o annullamento) erano trattati come mutuamente esclusivi invece che combinabili (un volo REGISTERED che è ESSO STESSO una correzione deve mostrare entrambi).
- Verifica interattiva (script Playwright throwaway, Playwright MCP rotto in questo ambiente): entrambi i temi (light/dark), flusso completo registra→breakdown→chiudi→correggi→breakdown→chiudi→storna, vista own-access pilota (niente form/filtri staff).

### File List

- `src/app/[locale]/dashboard/logbook/page.tsx` (nuovo)
- `src/app/[locale]/dashboard/logbook/logbook-console.tsx` (nuovo)
- `src/app/[locale]/dashboard/logbook/flight-editor.tsx` (nuovo)
- `src/app/[locale]/dashboard/flights/page.tsx` (eliminato)
- `src/app/[locale]/dashboard/flights/flights-manager.tsx` (eliminato)
- `src/app/[locale]/dashboard/pilots/pilot-profile.tsx` (repoint link)
- `src/app/[locale]/dashboard/people/[id]/page.tsx` (repoint link)
- `src/app/[locale]/dashboard/school/page.tsx` (repoint drill-down)
- `src/app/[locale]/dashboard/page.tsx` (repoint 2 widget)
- `src/app/[locale]/dashboard/nav-items.ts` (repoint href)
- `src/components/shell/route-registry.ts` (flip `logbook` a `enabled:true, airopsNative:true`)
- `messages/it.json`, `messages/en.json` (nuova namespace `LogbookPage`)
- `e2e/flights.spec.ts` (riscritto)
- `e2e/flight-log.spec.ts`, `e2e/flight-reversal.spec.ts` (adattati)
- `e2e/exports.spec.ts`, `e2e/pdf-exports.spec.ts`, `e2e/person-detail.spec.ts`, `e2e/school.spec.ts`, `e2e/home-dashboard.spec.ts` (swap path)
- `e2e/package-consumption.spec.ts`, `e2e/typeahead-pickers.spec.ts` (swap path + apertura SlideOver + T0 hardening)

### Change Log

- 2026-07-15/16: implementazione story 12.8 (commit `feat(12.8)`), fix post-verifica e2e completa (commit `fix(12.8)`).

## Review Record

**Reviewer**: adversarial-reviewer (Opus 4.8, effort xhigh, via workflow). **Data**: 2026-07-16. Rebuild solo-UI con hard-delete di rotta + repoint completo → review completeness-critical + arbitro CI-mode (il dev aveva girato solo il subset in dev-mode).

### Arbiter (priority zero)

- **`CI=1 npx playwright test` su build prod, DB fresco → 220 passed, 0 failed** (tutti i 10 spec toccati verdi in CI-mode: il gap "solo dev-mode" del dev chiuso). Dopo il fix di review `f7014e3`: **220/220** ri-verificato. Gates 1370 → **1380 unit** (10 test nuovi per `getFlightTotals`).

### Verdetto

**Shippable dopo un fix escalato al PO.** Solo-UI, repoint, RBAC, storno/correggi, export tutti verificati empiricamente.

### Findings

- **MAJOR — escalato al PO, RATIFICATO e FIXATO in `f7014e3`**: KPI/Totali/conteggio header sommavano solo la PAGINA CORRENTE (≤20 voli), non l'insieme filtrato → fuorviante (filtro mese, pagina 1 mostra i totali di pagina 1). NON coperto da Ratifica 3 (che aveva solo blessato "solo REGISTERED"). **Decisione utente: totali filtrati REALI.** Fix: nuovo `getFlightTotals(actor, query)` in `flights.service.ts` (ADDITIVO — `listFlights`/register/cancel/correct invariati, provato dalla loro suite), helper condivisi `authorizeFlightsQuery`/`buildFlightsWhere` (list+totals non possono divergere), forza `status:'REGISTERED'`. **Own-scoping RBAC verificato dalla sessione principale** (personId/instructorPersonId altrui → 403, personId null → zero, OR own-access) — 9 unit test incl. quelli security-critical. Suite → 1380.
- **MINOR — FIXATO**: `LogbookPage.sub`/`subOwn` rendevano "1 voci registrate" → ICU plural (convenzione repo).

### Evidenza empirica

- **SOLO-UI**: `git diff -- flights.service.ts schemas/flights.ts api/v1/flights/**` era VUOTO pre-fix (il fix di review aggiunge SOLO `getFlightTotals` + helper additivi, comportamento esistente invariato).
- **Repoint (hard-delete, no redirect)**: grep `dashboard/flights` → solo doc-comment, zero href vivi; ogni link entrante guidato live atterra su `/dashboard/logbook` coi param (pilot-profile "Vedi tutti", school drill-down `?instructorPersonId=` con self-scoping non-staff, people/[id], 2 widget, nav legacy).
- **RBAC per ruolo** (build prod): pilota UI = niente form/filtri/azioni renderizzati (non solo nascosti), API foreign personId/instructorPersonId → 403, POST → 403; staff = manager completo.
- **Export single-click** (2 `.btn`, non ExportMenu): `exports.spec`/`pdf-exports.spec` verdi.
- Bug auto-fixati dal dev verificati (package-note sub-line; azioni+lineage non esclusivi).

### Verdetti (close-your-notes)

- **#3 (per-page totals)**: escalato al PO → **totali filtrati reali** (fix sopra).
- **#7** (SearchCombobox label legacy) ACCETTATO (cosmetico). **#8** (2 bottoni export, non ExportMenu) ACCETTATO (contratto single-click). **#9** (Badge testid wrapper) ACCETTATO+CORRETTO (TS rende il bug impossibile altrove — grep conferma zero `<Badge data-testid>`). Inventario test preservato (parità con `fda70d9:e2e/flights.spec.ts`, solo label nav cambiata).

### Commit di review

- `f7014e3` — `fix(12.8)`: totali filtrati reali (MAJOR) + i18n plural (MINOR).
- questo commit — `docs(12.8)`: Review Record, status → done, sprint-status.
