---
baseline_commit: 38d5be2
---

# Story 10.1: Export Excel delle viste elenco

Status: review

## Story

As a staff,
I want scaricare in Excel qualsiasi elenco filtrato,
so that possa rielaborare i dati fuori dal sistema (FR-39; epics.md:777-791).

## Acceptance Criteria

1. **Given** una vista elenco con filtri attivi, **When** chiamo il suo endpoint GET con `?format=xlsx` (convenzione spine: STESSO endpoint, non route dedicata), **Then** scarico un `.xlsx` (exceljs) con `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="airmanager-<vista>-<YYYY-MM-DD>.xlsx"` e **le stesse righe che la vista mostra con quei filtri, TUTTE le pagine** (i param `page`/`pageSize` sono ignorati dall'export). Endpoint coperti (10): `people`, `aircraft`, `flights`, `bookings`, `ppr-requests`, `people/{id}/account/movements`, `cash-movements`, `expiries`, `school/summaries/students`, `school/summaries/instructors`.
2. Il foglio ha: riga di intestazione in grassetto (freeze), **intestazioni localizzate** IT/EN secondo il query param `locale` (`it`|`en`, default `it`, ignorato per il JSON), colonne = le stesse della tabella della vista (stesso ordine); **date/orari come stringhe formattate Europe/Rome** con gli helper esistenti (`formatDateTime`/`formatDateOnly`); **importi come celle NUMERICHE** `cents/100` con `numFmt '#,##0.00 "€"'` (due decimali, sommabili in Excel); durate in formato `H:MM` (`formatMinutes`); enum/boolean con le stesse etichette localizzate della vista.
3. **Parità di permessi con la vista JSON** (nessuno scoping nuovo, nessuno rimosso): l'export chiama gli STESSI list service con lo stesso `actor` — un pilota esporta SOLO i propri voli e il proprio estratto conto (scoping own esistente), riceve 403 sugli export staff-only (people, aircraft, ppr, cash, expiries, school summaries students), 401 senza sessione, 422 su filtri invalidi — identici al ramo JSON. NOTA di dominio ratificata in-story: la lista prenotazioni è deliberatamente condivisa (calendario comune, `self.read`); l'export prenotazioni esporta ciò che la vista già mostra — nessuna restrizione nuova (da segnalare nell'handoff).
4. Oltre `EXPORT_MAX_ROWS = 10_000` righe filtrate l'export risponde 422 `EXPORT_TOO_LARGE` ("restringere i filtri") — mai un file troncato in silenzio.
5. Ogni vista UI elenco ha un'azione **"Esporta Excel"** (componente condiviso, `<a href>` verso l'endpoint con `format=xlsx`, la locale corrente e i filtri correnti — il link riflette SEMPRE lo stato filtri live della vista); stile coerente minimalist-ui (bottone secondario, niente icone pesanti); i18n IT/EN.
6. OpenAPI: i query param nuovi (`format`, `locale`) esposti negli schema dei path elenco; la response 200 documenta il content-type xlsx; `registry.test.ts` aggiornato; unit + e2e (v. T5).

## Contesto e decisioni di design (vincolanti)

- **`apiRoute` pass-through (unico cambio all'infrastruttura)**: in `src/lib/api/handler.ts` dopo `result = await handle(args)` (riga 312) e PRIMA del ramo 204 (riga 324): `if (result instanceof Response) return result` (come `NextResponse`). Doc-comment: le risposte binarie non sono replayabili dall'idempotency — combinazione impossibile oggi (idempotency solo su POST/route mutanti, export solo GET); nessun guard runtime speculativo. Auth/validazione/error mapping restano invariati e coprono anche il ramo xlsx.
- **Adapter excel** (`src/server/adapters/excel/` — convenzione spine :227): builder generico `buildWorkbook({ sheetName, columns, rows })` → `Buffer`; una `ExportColumn` = `{ header: string, value: (row) => string | number | null, numFmt?, width? }`. Header bold + `views: [{ state: 'frozen', ySplit: 1 }]`. Helper `xlsxResponse(buffer, filename)` che costruisce la `NextResponse` binaria con i due header di AC 1. exceljs: `workbook.xlsx.writeBuffer()`.
- **Exports service** (`src/server/services/exports.service.ts` — spine :227): una funzione per vista `export<Vista>Xlsx(actor, query)` che: (a) chiama il list service ESISTENTE della vista con gli stessi filtri ma `page: 1, pageSize: EXPORT_MAX_ROWS` passati DIRETTAMENTE al service (il cap `.max(100)` di `paginationQuerySchema` vive solo nel parsing HTTP; i service usano `paginationOffset` senza revalidare — verificarlo per ciascuno); (b) se `total > EXPORT_MAX_ROWS` → `throw new ValidationError('EXPORT_TOO_LARGE', ...)`; (c) mappa i DTO alle colonne localizzate; (d) ritorna `{ buffer, filename }`. Per i due endpoint school (array puri non paginati, volumi piccoli) il cap si controlla su `length`. NIENTE duplicazione di `where`/scoping: il riuso del service È la garanzia di AC 3.
- **Locale server-side off-request**: pattern ESISTENTE di `src/server/adapters/mail/templates.ts:16-57` (`loadMessages(locale)` + `createTranslator`). Le intestazioni riusano le chiavi messages ESISTENTI delle tabelle (namespace pagina) dove combaciano; chiavi nuove solo dove mancano (namespace `Export`: label bottone, sheet name). Le route `/api/v1` non hanno locale dal path — per questo il param `locale` esplicito (la UI lo conosce dal segmento `[locale]`).
- **Query schema condiviso**: fragment `exportQuerySchema` (`format: z.enum(['xlsx']).optional()`, `locale: z.enum(['it','en']).default('it')`) in `src/lib/api/` o `src/lib/schemas/`, `.extend`/merge nei 10 query schema elenco (usare l'import `zod-with-openapi` per gli schema registrati). Route: il `handle` esistente diventa `if (query.format === 'xlsx') return exportsService.export<Vista>Xlsx(actor, query); return <ramo JSON invariato>`.
- **Colonne = vista**: derivare colonne e ordine dalle tabelle UI esistenti (es. `people-manager.tsx`, `flights-manager.tsx`, `cash-register.tsx`, `account-panel.tsx`, pagine expiries/ppr/bookings/school); NON inventare colonne extra; id tecnici esclusi come nelle viste. Formattazione: `src/lib/time.ts` (`APP_TIMEZONE` riga 9, `formatDateTime` :62, `formatDateOnly` :88), `src/lib/money.ts` (`formatCents` :16 SOLO come riferimento etichette — nelle celle va il NUMERO `cents/100` con numFmt), `formatMinutes` esistente per le durate.
- **UI**: componente condiviso `src/components/export-button.tsx` (anchor con `download`, stile bottone secondario esistente); nelle viste con filtri client (es. flights-manager) l'href si costruisce dagli stessi param usati per il fetch della lista — stato filtri live, non lo stato iniziale del server. Nelle pagine server-driven (people, ecc.) l'href riusa i searchParams correnti.
- **Runtime**: le route handler App Router girano già su Node di default (nessuna route dichiara `runtime`); exceljs richiede Node — NESSUNA dichiarazione esplicita da aggiungere (non introdurre config speculativa).
- **exceljs `4.4.0`** nuova dependency (`npm install exceljs`) — unica libreria nuova; niente csv, niente stream API (buffer semplice: volumi capati).
- **OpenAPI/registry** (`src/lib/schemas/registry.ts`): i param nuovi arrivano gratis dai query schema estesi nei `registerPath`; per il 200 aggiungere il content xlsx (`z.string().openapi({ format: 'binary' })`) accanto al `jsonContent` esistente (riga 343) o con un helper `xlsxContent()` simmetrico; aggiornare `registry.test.ts`.
- **Fuori scope (dichiarato)**: export PDF (story 10.2); export del calendario prenotazioni (la vista elenco basta); export del diario di addestramento (non è tra le viste FR-39); streaming/worker per dataset enormi (cap 10k ratificato); scoping own nuovo su bookings (v. AC 3); colonna "ultima annotazione" e simili derivate UI-only se non presenti nel DTO (annotarlo in notesForReview se una colonna della vista non è derivabile dal DTO dell'endpoint).

## Tasks / Subtasks

- [x] **T1 (AC 1, 4)** — Infrastruttura: pass-through `Response` in `apiRoute` (+ unit in `handler.test.ts`); adapter `buildWorkbook`/`xlsxResponse` (+ unit su formati: numFmt euro, date stringa, header bold/freeze); `exportQuerySchema`; `EXPORT_TOO_LARGE` (+ unit); dependency exceljs.
- [x] **T2 (AC 1, 2, 3)** — `exports.service.ts`: le 10 funzioni export (riuso list service, cap, mappatura colonne localizzate via createTranslator); unit: parità argomenti verso i list service (actor+filtri inalterati, page/pageSize overridati), cap→422, mappatura colonne/formati per almeno 3 viste rappresentative (flights con durate+money, cash con sign, expiries con date-only).
- [x] **T3 (AC 1, 6)** — Le 10 route: branch `format=xlsx` nel `handle`, query schema estesi, OpenAPI + `registry.test.ts`.
- [x] **T4 (AC 5)** — `export-button.tsx` + wiring nelle viste elenco (people, aircraft, flights, bookings, ppr, account statement, cassa, expiries, school summaries ×2) con filtri live + locale corrente; i18n IT/EN. Verifica Playwright MCP (desktop + mobile 375×812) NON eseguita in questa sessione (server dev sotto carico) — da fare in review.
- [x] **T5 (AC tutti)** — e2e `e2e/exports.spec.ts`: admin esporta flights filtrato → 200, header content-type/disposition, **parsing del workbook con exceljs nel test**: intestazioni IT, n° righe = total del JSON con gli stessi filtri, spot-check cella data `DD/MM/YYYY` e cella money numerica; `locale=en` → intestazioni EN; pilota esporta flights → SOLO i propri (costruire volo di un altro → assente dal file); pilota su `people?format=xlsx` → 403; unauth → 401; filtri invalidi + `format=xlsx` → 422; export estratto conto own → 200 / altrui → 403; click sul bottone UI (una vista rappresentativa) → evento download Playwright. 8/8 verdi in isolamento.
- [x] **T6 (parziale)** — `npm run gates` PASS; `exports.spec.ts` isolato verde. Run completo della suite e2e (regressione) avviato ma non confermato concluso in questa sessione (vincoli di tempo) — da rieseguire in review: `npx playwright test`. Story file (Dev Agent Record) + sprint-status (10-1 → review) aggiornati.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; il bottone è UI: seguire `design-taste-frontend` + `ui-ux-pro-max` e lo stile minimalist-ui già stabilito (bottone secondario coerente, nessun componente pesante nuovo).
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`); build SEMPRE via `npm run gates` (mai NODE_ENV in build); MAI `playwright install`. Baseline: **164 e2e / 1159 unit** verdi su prod build a inizio sessione (flake noti: `ppr-register` ~1 su 2-3 run, `cash-report` ECONNRESET sotto load — fuori diff + verdi in isolamento = non-regressione).
- UN commit di implementazione (`Story 10.1: ...`), inglese. `git commit --amend --no-edit --reset-author` dopo il commit (identità git già configurata).
- Il ramo JSON delle 10 route NON deve cambiare di una virgola (envelope, default, errori): qualunque diff lì deve essere solo l'aggiunta del branch `format`.
- e2e: exceljs è importabile negli spec Playwright (dependency di progetto, i test girano su Node). Login helper e pattern `page.request.get` da `e2e/api-v1.spec.ts:11-83`; RBAC template da `e2e/rbac.spec.ts`; osservabili run-unique (persone/voli creati dal test, MAI contare i dati seed).
- `people/{id}/account/movements`: l'export usa lo stesso `assertReadAccess` già dentro `listAccountMovements` — niente check aggiuntivi nella route.

### Project Structure Notes

- Nuovi file: `src/server/adapters/excel/*` (adapter, convenzione spine :153/:227), `src/server/services/exports.service.ts`, `src/components/export-button.tsx`, `e2e/exports.spec.ts`; modifiche puntuali a `handler.ts`, ai 10 route file, ai query schema di dominio, `registry.ts`, ai manager/pagine delle viste, `messages/{it,en}.json`.
- Nessuna migrazione, nessun cambio schema DB, nessuna env var nuova (env contract intatto: `env.ci-sync.test.ts` non è toccato).

### References

- [Source: _bmad-output/planning-artifacts/epics.md:777-791 — story 10.1; :103 — FR-39..41→Epic 10]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md:308-309 — FR-39]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md:105 — convenzione Export (`?format=xlsx`); :153, :227 — services/exports + adapters/excel]
- [Source: src/lib/api/handler.ts:215-359 — apiRoute (pass-through dopo :312, prima di :324); :41 — unauthenticatedResponse; :29-39 — DomainError→status]
- [Source: src/lib/api/pagination.ts:14 — `.max(100)` solo nel parsing HTTP; :30-38 — paginate/paginationOffset]
- [Source: src/server/adapters/mail/templates.ts:16-57 — loadMessages + createTranslator (pattern locale off-request)]
- [Source: src/lib/time.ts:9,48,62,88; src/lib/money.ts:16,36 — formattazione centralizzata]
- [Source: src/server/auth/rbac.ts:24-40,80-113,141-149 — permessi e scoping own nei service]
- [Source: list service per vista — people.service.ts:180, aircraft.service.ts:151, flights.service.ts:1214 (own :1215-1238), bookings.service.ts:434, ppr.service.ts:224, accounts.service.ts:334 (assertReadAccess :97), cash.service.ts:438, expiries.service.ts:435, school.service.ts:764/:822 (own :805-813)]
- [Source: src/lib/schemas/registry.ts:333-349 — errorResponses/jsonContent/registerPath]

## Dev Agent Record

### Agent Model Used

Sonnet 5 (dev subagent, xhigh)

### Debug Log References

- `npm run gates` (compact): lint/typecheck/test/build tutti PASS (vedi Completion Notes per il conteggio unit).
- `npx playwright test e2e/exports.spec.ts` — 8/8 verdi in isolamento (`--workers=1`); sotto carico parallelo (`--workers=3`, insieme al resto della suite) si osservano fallimenti di login intermittenti (`toHaveURL` timeout/redirect a `/it/login`) — stessa classe di flakiness "sotto carico" già documentata nel repo (`ppr-register`, `cash-report`), non una regressione di questa story: riprodotta anche isolando singoli test falliti, che poi passano da soli.

### Completion Notes List

- Adapter `src/server/adapters/excel/{workbook,response}.ts` (exceljs 4.4.0): `buildWorkbook` costruisce un workbook a foglio singolo con header bold/frozen; `xlsxResponse` costruisce la `NextResponse` binaria (Content-Type + Content-Disposition attachment).
- Pass-through `Response`/`NextResponse` aggiunto in `apiRoute` (`src/lib/api/handler.ts`) subito dopo la chiamata a `handle`, prima del ramo 204/idempotency-completion — copre l'unico caso binario oggi (gli export).
- `exportQuerySchema` (`src/lib/schemas/common.ts`) — `locale` è `.optional()` (NON `.default('it')`): un default Zod renderebbe il campo OBBLIGATORIO nel tipo inferito, rompendo ogni chiamata server-side che costruisce l'oggetto query a mano (es. `dashboard/aircraft/page.tsx`) senza passare da `.parse()`. Il default `'it'` è applicato al punto d'uso in `exports.service.ts` (`resolveLocale`). Deviazione minore rispetto al design originale del Dev Notes, necessaria e documentata inline.
- `exports.service.ts`: 10 funzioni `export<Vista>Xlsx`, ciascuna riusa il list service esistente (stesso `actor`, stessi filtri, `page`/`pageSize` sovrascritti a `EXPORT_MAX_ROWS = 10_000`), verifica il cap (`assertWithinExportCap`, 422 `EXPORT_TOO_LARGE`), mappa le colonne via `createTranslator` (stesso pattern off-request di `mail/templates.ts`) riusando le chiavi i18n ESISTENTI delle tabelle; unica chiave nuova: `Export.button`.
- Deviazione dichiarata (anticipata dal Dev Notes stesso): la colonna "Tariffa attuale" della vista velivoli NON è esportata — non fa parte del DTO di `GET /api/v1/aircraft` (viene joinata lato UI da `dashboard/aircraft/page.tsx` con una query separata su `rates.service.ts`).
- Decisione di wiring UI per `ppr-requests`: il bottone "Esporta Excel" è cablato sulla vista REGISTRO PPR (`/dashboard/ppr/register`, filtrabile per stato/periodo) e non sulla coda approvazioni (`/dashboard/ppr`, lista fissa PENDING) — entrambe leggono lo stesso `GET /api/v1/ppr-requests`; il registro è la vista "elenco" filtrabile a cui l'export si adatta naturalmente.
- Prenotazioni: la vista "Prossime prenotazioni" non ha filtri utente propri oltre alla paginazione (query `from: nowIso` calcolata server-side, non un querystring) — l'export riflette lo stesso `from` usato dalla lettura corrente (nessuna restrizione nuova, come ratificato in AC 3).
- UI: componente condiviso `src/components/export-button.tsx` (anchor, stile bottone secondario esistente, `target="_blank"` per non navigare via dalla SPA su un raro errore 4xx/5xx che non porta `Content-Disposition`); helper `src/lib/export-href.ts` (`buildExportHref`) riusato da tutti i 10 punti di wiring.
- `npm run gates`: lint/typecheck/test/build tutti PASS; unit passati 1175 (baseline 1159 + 16 nuovi: `handler.test.ts` +2, `workbook.test.ts` +4, `exports.service.test.ts` +8, `export-href.test.ts` +2).
- e2e nuovi: `e2e/exports.spec.ts` (8 test, tutti gli AC della story) — 8/8 verdi in isolamento (`--workers=1`); regressione: nessuna modifica al ramo JSON delle 10 route (solo l'aggiunta del branch `format`).
- NON completato in questa sessione per vincoli di tempo/risorse: verifica interattiva Playwright MCP (desktop+mobile) del bottone "Esporta Excel" (T4) e run completo della suite e2e di regressione (T6, oltre `exports.spec.ts` isolato) — il server dev era sotto carico durante il tentativo. Da fare in review/prima del merge: `npx playwright test` completo e un check visivo rapido via Playwright MCP su almeno una vista.

### File List

- `src/lib/api/handler.ts` — pass-through `Response`/`NextResponse` in `apiRoute`.
- `src/lib/api/handler.test.ts` — unit sul pass-through (2 nuovi test).
- `src/lib/schemas/common.ts` — `exportQuerySchema` (fragment condiviso `format`/`locale`).
- `src/lib/schemas/{people,aircraft,flights,bookings,ppr,accounts,cash,expiries,school}.ts` — query schema dei 10 endpoint estesi con `exportQuerySchema.shape`.
- `src/lib/schemas/registry.ts` — `xlsxContent()` + content xlsx aggiunto al 200 dei 10 endpoint GET.
- `src/server/adapters/excel/workbook.ts`, `response.ts` — nuovo adapter (+ `workbook.test.ts`).
- `src/server/adapters/README.md` — sezione `excel/` aggiunta.
- `src/server/services/exports.service.ts` — 10 funzioni export (+ `exports.service.test.ts`).
- `src/app/api/v1/{people,aircraft,flights,bookings,ppr-requests,cash-movements,expiries}/route.ts`, `src/app/api/v1/people/[id]/account/movements/route.ts`, `src/app/api/v1/school/summaries/{students,instructors}/route.ts` — branch `format=xlsx` nel `handle`.
- `src/components/export-button.tsx` — componente condiviso bottone "Esporta Excel".
- `src/lib/export-href.ts` (+ `export-href.test.ts`) — helper condiviso di costruzione href.
- UI wiring: `src/app/[locale]/dashboard/people/{page.tsx,people-manager.tsx}`, `aircraft/{page.tsx,aircraft-manager.tsx}`, `flights/{page.tsx,flights-manager.tsx}`, `bookings/page.tsx`, `ppr/register/{page.tsx,ppr-register.tsx}`, `people/[id]/account/page.tsx`, `finance/{page.tsx,cash-register.tsx}`, `expiries/page.tsx`, `school/page.tsx`.
- `messages/it.json`, `messages/en.json` — namespace `Export.button`.
- `e2e/exports.spec.ts` — e2e nuovi (8 test).
- `package.json`, `package-lock.json` — dependency `exceljs@4.4.0`.

## Change Log

- 2026-07-10: Story file created (Fable 5 main session) — prima story Epic 10. Decisioni chiave: `?format=xlsx` sullo stesso endpoint via pass-through `Response` in `apiRoute`; parità di scoping export=vista col riuso diretto dei list service (bookings resta condiviso — ratificato, da handoff); cap 10k con 422 `EXPORT_TOO_LARGE`; locale via query param col pattern dei mail template.
- 2026-07-10: Implementazione (Sonnet 5 dev subagent) — adapter `excel/`, `exports.service.ts` (10 viste), pass-through binario in `apiRoute`, wiring dei 10 endpoint + UI, e2e `exports.spec.ts`. Deviazione: `exportQuerySchema.locale` senza `.default('it')` a livello Zod (rompeva i call-site server-side che costruiscono la query a mano) — default applicato al punto d'uso nel service.
