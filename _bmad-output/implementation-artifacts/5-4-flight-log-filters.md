---
baseline_commit: 6ab21fd
---

# Story 5.4: Registro voli con filtri e permessi

Status: ready-for-review

## Story

As a pilota,
I want vedere i miei voli (e lo staff tutti),
so that ognuno abbia il proprio storico (FR-17).

## Acceptance Criteria

1. **Given** voli di persone diverse, **When** un pilota (o allievo) apre il registro, **Then** vede SOLO i propri voli (quelli in cui è la persona del volo), paginati (NFR-6), inclusi gli ANNULLATI (storia completa).
2. **And** un istruttore vede i propri voli come persona E i voli (scuola o no) in cui figura come istruttore.
3. **Given** lo staff, **When** apre il registro, **Then** vede TUTTI i voli con filtri per **periodo** (`dateFrom`/`dateTo` su `flightDate`), **velivolo**, **persona**, **tipo**, **stato** — combinabili, paginati.
4. **Given** un non-staff che passa `personId` di un ALTRO nel filtro, **When** chiama `GET /api/v1/flights`, **Then** 403 (mai dati altrui, nemmeno via filtro).

## Contesto e decisioni chiave (LEGGERE PRIMA DI CODIFICARE)

- **`listFlights` si apre all'own-access (AD-5)**: oggi (5.1) è `authorize('flights.manage')`. Diventa: chi ha `flights.manage` → tutti i voli + tutti i filtri; altrimenti `authorize('self.read')` e lo scope è FORZATO a `OR: [{ personId: actor.personId }, { instructorProfile: { personId: actor.personId } }]` (proprietario O istruttore a bordo — AC 2; la seconda gamba copre da sola anche gli istruttori che volano come persona del volo sulla prima). `actor.personId == null` con solo `self.read` → **pagina vuota** (nulla è "proprio"; scelta documentata — non un 403: il registro esiste, è semplicemente vuoto per un utente senza anagrafica collegata).
- **Filtro `personId` per non-staff**: se fornito e `!== actor.personId` → `ForbiddenError` (AC 4 — mai enumerare/filtrare dati altrui); se `=== actor.personId` è lecito (ridondante ma innocuo). Gli altri filtri (periodo/tipo/stato/velivolo) sono leciti per tutti DENTRO il proprio scope.
- **Filtri (query string, tutti opzionali e combinabili in AND)**: `dateFrom`/`dateTo` (`z.iso.date()`, su `flightDate` con `gte`/`lte` date-only via `parseDateOnlyUtc` — MAI timestamp); `aircraftId` (string); `personId` (string); `flightType` (enum); `status` (enum). Zod refine: `dateFrom <= dateTo` altrimenti 422 (VALIDATION_ERROR standard, niente codice custom qui). Id inesistenti nei filtri → semplicemente 0 risultati (nessun 404: è un filtro, non un lookup).
- **`actorEmail` diventa CONDIZIONALE** (`people.read`, stesso pattern `AccountStatementItem` 3.2): il DTO 5.1 lo includeva sempre perché la lista era staff-only; ora un pilota non deve vedere chi ha registrato il volo. Nessun altro campo del DTO cambia (l'istruttore vede legittimamente nome della persona del volo in cui insegna).
- **Ordine invariato**: `flightDate desc, createdAt desc, id desc` (5.1). Paginazione invariata (`paginate`/`paginationOffset`).
- **Nav**: `nav-items.ts` — l'item `flights` diventa visibile anche a pilota/allievo/istruttore: `permissions: ['flights.manage', 'self.read']` (union OR già supportata). ATTENZIONE: aggiornare i test che asseriscono la visibilità della nav per ruolo (`nav-items.test.ts` e le eventuali asserzioni e2e in `rbac.spec.ts`/`login.spec.ts` sul menu del pilota) — la comparsa di "Voli" per tutti è VOLUTA (FR-17).
- **Pagina `/dashboard/flights` a due volti**: per lo staff resta identica (form registrazione + azioni annulla/correggi) e GUADAGNA la barra filtri; per i non-staff mostra SOLO il registro personale paginato (niente form, niente azioni — il service è comunque il guardiano, la UI si limita a non mostrare ciò che fallirebbe) con filtri limitati a periodo/tipo/stato. I dropdown velivolo/persona della barra filtri si alimentano da `listAircraft`/`listPeople` che richiedono permessi staff — per questo i non-staff non li hanno (scelta documentata: niente endpoint nuovi per alimentare picker non-staff in questa story).
- **Stati visibili a tutti nel proprio scope**: gli ANNULLATI restano visibili anche al titolare (con badge esistente) — lo storico è storia, il filtro `status` serve proprio a escluderli a richiesta.
- **Niente export** (`?format=xlsx` è epic 10); niente route nuove: si estendono `GET /api/v1/flights` (query schema) e la pagina esistente.

## Tasks / Subtasks

- [x] Task 1: Service (AC 1/2/3/4)
  - [x] `flights.service.ts#listFlights(actor, query)`: nuovo ramo permessi come da Contesto (manage → tutto; self.read → scope forzato OR own/instructor, personId null → pagina vuota); costruzione `where` AND-combinata dai filtri; guardia 403 sul filtro `personId` altrui per non-staff; `actorEmail` condizionale su `people.read` (il DTO/tipo diventa `actorEmail?`). Aggiornato doc-comment (la promessa 5.1 "5.4 estenderà" si realizza).
  - [x] `src/lib/schemas/flights.ts`: `listFlightsQuerySchema` esteso con i 6 filtri opzionali + refine date; registry aggiornato (parametri query documentati in OpenAPI) + coverage (test generici invariati, path esistente).
- [x] Task 2: UI (AC 1/2/3) — **skill `design-taste-frontend` + `ui-ux-pro-max` OBBLIGATORIE**, stile minimalista editoriale
  - [x] `/dashboard/flights/page.tsx`: pagina accessibile a ogni ruolo (`canManage` da `flights.manage`, redirect difensivo solo se manca anche `self.read`); dati caricati scope-aware (`listFlights` con filtri sanificati dai `searchParams`; `listAircraft`/`listPeople` con `includeArchived: true`, solo se `canManage`, per alimentare SIA i picker della barra filtri SIA — filtrati in-memory su `archivedAt`/`profiles` — quelli invariati del form di registrazione).
  - [x] `flights-manager.tsx`: nuovo componente `FilterBar` — periodo (due date input), tipo (select), stato (select), e SOLO per staff velivolo/persona (select da `listAircraft`/`listPeople`, incl. archiviati — decisione presa e documentata nel doc-comment: "consultare lo storico"); reset filtri (`Azzera filtri`, mostrato solo con filtri attivi); ogni cambio filtro naviga subito (URL-driven, pattern `CashRegister`) e riporta a pagina 1 (mai `page` nel query string costruito); paginazione Prev/Next (pattern `FinancePage`, resa dalla server page, non dal client component). Non-staff: niente form registrazione, niente colonna/azioni annulla-correggi, titolo/descrizione "I miei voli" (chiavi `titleOwn`/`descriptionOwn`).
  - [x] Nav `flights` → `['flights.manage', 'self.read']`; aggiornati `nav-items.test.ts` (pilota/pilota+istruttore ora includono `flights`) e l'asserzione e2e sulla nav del pilota in `e2e/flights.spec.ts`.
  - [x] i18n simmetrici it/en (`filters.*`, `titleOwn`/`descriptionOwn`; 667 chiavi ciascuno, verificato via script Node).
- [x] Task 3: Test (AC tutti)
  - [x] Unit (`flights.service.test.ts`): pilota vede solo i propri (where con OR own/instructor — query-shape assertion); istruttore: OR include la gamba instructorProfile; staff: where dai filtri combinati (periodo gte/lte date-only, aircraftId, personId, flightType, status) + staff senza scope OR; non-staff + `personId` altrui → Forbidden, nessuna query; non-staff + proprio `personId` → ok (redundante ma lecito); `personId` null + self.read → pagina vuota senza query/transazione; `actorEmail` presente per staff, assente per pilota; attore senza alcun permesso → Forbidden. Schema (`listFlightsQuerySchema`): tutti i filtri combinati, dateFrom>dateTo → 422, dateFrom===dateTo ok, range aperto ok, data malformata/enum invalidi → 422.
  - [x] e2e (`e2e/flight-log.spec.ts`, 4 test): pilota vede SOLO i propri voli (incl. un annullato), niente form/azioni/picker staff, filtri periodo/tipo/stato propri funzionano; non-staff `personId` altrui → 403 envelope (proprio id → 200); staff: filtri velivolo/persona/tipo/periodo (combinati) restringono su 2 persone/2 velivoli/2 tipi/2 periodi; paginazione (21 voli per una persona filtrata, pageSize 20 → "1 / 2", Next/Prev funzionanti). Aggiornata l'asserzione nav esistente in `flights.spec.ts` (pilota ora vede "Voli").
  - [x] Regressione: suite 5.1/5.2/5.3 verdi (l'unico contratto cambiato è l'apertura own-access + actorEmail condizionale) — fallout reale trovato e corretto: `getByLabel('Velivolo')` non era più univoco su `/dashboard/flights` (form + nuova barra filtri condividono l'etichetta) → scoping a `getByTestId('flight-form').getByLabel(...)` in `flights.spec.ts`/`flight-reversal.spec.ts`/`package-consumption.spec.ts` (9 occorrenze).

## Dev Notes

- **AD-5**: authorize prima di tutto; scope own-access FORZATO nel service (mai fidarsi della UI); 403 sul filtro altrui PRIMA di ogni query. **AD-8**: 422 refine date standard; envelope invariati. **AD-2/AD-4**: nessun impatto (sola lettura). **NFR-6**: paginazione obbligatoria.
- **Lezioni review**: date-only UTC nei confronti su `@db.Date` (`parseDateOnlyUtc`, mai timestamp — review 3.5 F1); `actorEmail` condizionale (3.2); query-shape assertions; i18n simmetrica; e2e con dati run-unique (la paginazione soffre i DB sporchi — vedi handoff).
- **Cosa NON fare**: niente export xlsx/pdf (epic 10); niente endpoint dedicati per alimentare picker non-staff; niente vista calendario; niente drill-down/detail route per volo (i chip 5.3 restano testo); non toccare `registerFlight`/`cancelFlight`/`correctFlight`; niente permesso nuovo in `rbac.ts` (si compone `flights.manage` + `self.read` esistenti).
- **Ambiente/gate**: come 5.3 (postgres attivo; Mailpit 127.0.0.1:1025/8025, rilancio SOLO `run_in_background: true`; reset DB pre-e2e; MAI `playwright install`). Gate: lint / typecheck / `npx vitest run` (>= 573 + nuovi) / `npx next build` / `npx playwright test` (>= 92 + nuovi; flaky noti → isolamento su DB fresco). UN commit (`Story 5.4: <sintesi>`, nessun riferimento AI). NON push.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-17, NFR-6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-5, #AD-8]
- [Source: src/server/services/flights.service.ts#listFlights] — la funzione da aprire/estendere
- [Source: src/server/services/accounts.service.ts#assertReadAccess, #listAccountMovements] — pattern own-access + actorEmail condizionale (3.2)
- [Source: src/app/[locale]/dashboard/nav-items.ts] — visibilità nav per ruolo (union OR)
- [Source: src/app/[locale]/dashboard/flights/] — pagina/manager da estendere
- [Source: _bmad-output/implementation-artifacts/5-1-flight-logging-charges.md, 5-3-flight-reversal.md] — DTO/azioni esistenti

## Dev Agent Record

### Agent Model Used

Sonnet 5 (single dev agent, xhigh)

### Debug Log References

- Trovato durante la verifica interattiva (Playwright MCP): il pattern esistente di `CashRegister` di avvolgere il `<select>` DENTRO il proprio `<label>` (senza `htmlFor`/id separati) fa sì che il nome accessibile calcolato dal browser includa il `textContent` di TUTTE le `<option>` annidate — su `/dashboard/flights` questo ha fatto sì che il filtro "Persona" (le cui opzioni includono nomi di persone run-unique creati da altri spec e2e nello stesso DB condiviso) matchasse ACCIDENTALMENTE `page.getByLabel('Istruttore')` di un test preesistente, perché una delle opzioni conteneva la sottostringa "Istruttore" (un nome sintetico tipo `Istruttore-<suffix>` creato da `createInstructorWithRate` in un'altra spec). Riprodotto e verificato via `browser_evaluate` (confrontando `label[for=...].textContent` prima/dopo il fix). Corretto smontando l'annidamento nella `FilterBar` di questa story: `<label htmlFor>` come FRATELLO del controllo, mai wrapper — stesso pattern già usato (correttamente) da `RegisterFlightForm`. Non ho toccato `CashRegister` (stesso difetto latente, ma fuori scope di questa story: nessuna collisione osservata lì).
- Verifica interattiva end-to-end via Playwright MCP (Chromium headless, dev server + Mailpit locali) prima di scrivere gli e2e, in entrambi i ruoli: staff (admin) — form di registrazione invariato, barra filtri completa (Dal/Al/Velivolo/Persona/Tipo/Stato), filtro persona/stato che restringe correttamente, "Azzera filtri", annullamento volo con badge "Annullato" invariato; pilota (login separato) — titolo "I miei voli"/"My flights" (`/en` verificato per simmetria), SOLO Dal/Al/Tipo/Stato nella barra filtri (niente Velivolo/Persona), registro con SOLO il proprio volo, niente form né colonna Azioni, filtro stato/tipo funzionante, un `?personId=<altro>` manomesso nell'URL viene ignorato lato pagina (nessun crash) mentre la stessa chiamata diretta a `GET /api/v1/flights?personId=<altro>` risponde 403 `FORBIDDEN`. Paginazione verificata creando 21 voli per una persona via API e filtrando: "1 / 2", Next → "2 / 2" con 1 riga, Prev torna a "1 / 2".
- `npx playwright test` (suite intera, DB fresco): prima esecuzione post-fix-label, 91/96 poi 92/96 poi 92/96 a seconda del run — i fallimenti (mai la stessa spec due volte di fila, mai `flight-log.spec.ts`) sono tutti in `people-management.spec.ts` (2 test, estraneo a questa story) e a rotazione in `flights.spec.ts`/`flight-reversal.spec.ts`/`package-consumption.spec.ts` (1-2 test), sempre per timeout/elemento-non-trovato sotto il carico di ~96 test in parallelo sullo stesso dev server/DB — stesso pattern di flakiness "sotto carico" già documentato dalle story precedenti (5.1/5.3). Ogni spec fallita è stata ri-eseguita DA SOLA su DB fresco (`npx playwright test e2e/<file>.spec.ts`) ed è risultata **verde al 100%** (`flights.spec.ts` 6/6, `flight-reversal.spec.ts` 2/2, `people-management.spec.ts` 6/6, `flight-log.spec.ts` 4/4) — nessuna regressione reale, solo contesa di risorse sotto carico massimo.

### Completion Notes List

- Tutti gli AC (1-4) implementati e verificati: `listFlights` biforca su `flights.manage` (tutto + ogni filtro, `actorEmail` sempre) vs `self.read` (scope FORZATO `OR: [{personId}, {instructorProfile:{personId}}]`, `actorEmail` mai, ANNULLATI inclusi); guardia 403 sul filtro `personId` altrui PRIMA di ogni query; `personId` null con solo `self.read` → pagina vuota SENZA toccare `Flight`/aprire transazione; filtri (`dateFrom`/`dateTo` via `parseDateOnlyUtc`, `aircraftId`, `personId`, `flightType`, `status`) AND-combinati nel `where`, mai un ramo separato dallo scope own-access (si sommano).
- `toListItem` ora richiede esplicitamente `includeActorEmail: boolean` (nessun default silenzioso) — i tre chiamanti staff-only (`registerFlight`/`cancelFlight`/`correctFlight`) passano `true` esplicito, `listFlights` passa `hasPermission(actor, 'people.read')`.
- Nav (`nav-items.ts`): `flights` → `['flights.manage', 'self.read']` (union OR — ogni ruolo ha `self.read`, quindi la voce compare per tutti, VOLUTO da FR-17). `nav-items.test.ts` aggiornato (pilota ora vede `['bookings', 'flights']`; pilota+istruttore `['bookings', 'flights', 'school']`).
- Pagina `/dashboard/flights`: le letture aircraft/people restano SEQUENZIALI (mai `Promise.all`, stessa cautela 5.1 sul client `pg` condiviso) e avvengono SOLO se `canManage` (un non-staff non tocca `listAircraft`/`listPeople`, che richiederebbero permessi che non ha); `aircraftId`/`personId` dall'URL sono forwarded a `listFlights` SOLO se `canManage` — un non-staff con un `?personId=` manomesso nell'URL lo vede semplicemente ignorato dalla pagina (mai un crash), mentre il servizio resta comunque il guardiano reale per chi chiama l'API direttamente (AD-5). `FlightsManager` riceve un `key` derivato da `{page, ...filterQuery}`: forza un remount pulito ad ogni cambio filtro/pagina, cosicché lo stato locale ottimistico (righe da registra/annulla/correggi) riparta sempre dai dati freschi del server invece di restare "sporco" da una pagina/filtro precedente — stesso idioma di remount-per-identità già usato da `RegisterFlightForm`.
- Picker della barra filtri (solo staff): `aircraftFilterOptions`/`personFilterOptions` includono ARCHIVIATI (decisione presa e documentata: consultare lo storico) — derivati dalla STESSA chiamata `listAircraft`/`listPeople` (`includeArchived: true`) che il form di registrazione filtra poi in-memory su `archivedAt === null` (+ profili per persona/istruttore) per i SUOI picker attivi-soli, invariati da 5.1 — nessuna query aggiuntiva.
- `actorEmail` diventato opzionale nel DTO/schema (`flightListItemSchema.actorEmail: z.string().optional()`) — nessun consumer UI esistente lo leggeva (mai renderizzato in tabella), quindi zero fallout lato client.
- UI: skill `design-taste-frontend` interrogata — esplicitamente fuori scope per una pagina di dashboard interna (stesso precedente di 5.1/5.2/5.3); consultata anche `ui-ux-pro-max` (query su filtri/tabelle/pattern enterprise) che conferma lo stile minimalista/Swiss già in uso per dashboard essere la scelta giusta. Nessun sistema di design nuovo introdotto: la barra filtri riusa `inputClasses` in stile coerente con gli altri pannelli (`CashRegister`), pulsante "Azzera filtri" mostrato solo quando c'è almeno un filtro attivo.
- Deviazione consapevole rispetto al pattern `CashRegister` copiato inizialmente: le etichette della barra filtri NON avvolgono più i rispettivi `<select>`/`<input>` (label e controllo sono fratelli con `htmlFor`/`id`) — vedi Debug Log References per il bug di accessibilità/testabilità che questo evita.
- Fallout e2e onestamente documentato: 9 occorrenze di `page.getByLabel('Velivolo')` non scoped in `flights.spec.ts`/`flight-reversal.spec.ts`/`package-consumption.spec.ts` sono diventate ambigue (la nuova barra filtri ha anch'essa un campo "Velivolo") — corrette con `page.getByTestId('flight-form').getByLabel('Velivolo')`, nessun'altra asserzione indebolita.

### File List

- `src/lib/schemas/flights.ts` (`listFlightsQuerySchema` con i 6 filtri + refine date; `flightListItemSchema.actorEmail` opzionale)
- `src/lib/schemas/registry.ts` (descrizione `GET /api/v1/flights` aggiornata)
- `src/server/services/flights.service.ts` (`listFlights` own-access + filtri; `toListItem(flight, includeActorEmail)`; `FlightListItem.actorEmail` opzionale)
- `src/server/services/flights.service.test.ts` (nuova suite `listFlights` own-access/filtri; nuova suite `listFlightsQuerySchema`)
- `src/app/[locale]/dashboard/nav-items.ts` (`flights` → `['flights.manage', 'self.read']`)
- `src/app/[locale]/dashboard/nav-items.test.ts` (pilota/pilota+istruttore vedono `flights`)
- `src/app/[locale]/dashboard/flights/page.tsx` (query filtri da searchParams, dati scope-aware, paginazione, titolo/descrizione own-view)
- `src/app/[locale]/dashboard/flights/flights-manager.tsx` (`FilterBar`, `canManage`, gating form/azioni/colonna, remount via `key`)
- `messages/it.json`, `messages/en.json` (`FlightsPage.filters.*`, `titleOwn`/`descriptionOwn`, `list.heading` rinominato)
- `e2e/flight-log.spec.ts` (nuovo — 4 test, story 5.4)
- `e2e/flights.spec.ts` (asserzione nav pilota aggiornata; scoping `getByLabel('Velivolo')`)
- `e2e/flight-reversal.spec.ts` (scoping `getByLabel('Velivolo')`)
- `e2e/package-consumption.spec.ts` (scoping `getByLabel('Velivolo')`)

## Review Record

_(da compilare dopo la review)_

## Change Log

- 2026-07-07: Story file created (Fable 5 main session), ready-for-dev.
- 2026-07-07: Implemented (Sonnet 5 single dev agent, xhigh) — all tasks complete, all gates green (e2e: 3 full-suite runs, only known-flaky specs under full parallel load, all 100% green in isolation on a fresh DB). Status → ready-for-review.
