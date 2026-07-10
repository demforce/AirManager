---
baseline_commit: eff9bf4
---

# Story 10.2: Export PDF dei report

Status: done

## Story

As a gestore,
I want PDF impaginati dei report principali con l'intestazione dell'aviosuperficie,
so that li archivi e li giri a soci e commercialista (FR-40; epics.md:793-803).

## Acceptance Criteria

1. **Impostazioni aviosuperficie (prerequisito dell'intestazione)**: un admin configura **nome** e **logo** dell'aviosuperficie in una nuova pagina `/dashboard/settings` (gate `settings.manage`, admin-only — permesso GIÀ nel catalogo); persistenza su 2 chiavi `AppSetting` esistenti K/V (`airfield.name`, `airfield.logo` come data-URL base64 PNG/JPEG, max ~200KB validati da Zod) — **NESSUNA migrazione**. API `GET/PUT /api/v1/settings/airfield`: lettura per chiunque autenticato (serve all'intestazione dei PDF di ogni ruolo), scrittura `settings.manage` (pattern read/write asimmetrico di `getPprLandingFeeDefaultCents`). Default se non configurato: nome "AirManager", nessun logo.
2. **Given** le impostazioni configurate, **When** esporto uno dei 4 report — **estratto conto persona**, **report finanziario di periodo**, **registro voli** (filtri correnti), **lista scadenze** (filtri correnti) — dalle route dedicate `/api/v1/**/pdf` (convenzione spine :105), **Then** ricevo un PDF (@react-pdf/renderer, `renderToBuffer`) con `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="airmanager-<report>-<YYYY-MM-DD>.pdf"`, e dentro: intestazione (logo se presente + nome), titolo del report, periodo/filtri applicati, tabella dati con le stesse colonne della vista, **totali dove pertinenti** (v. Contesto), data di generazione e numerazione pagine, tutto **nella lingua del query param `locale`** (`it`|`en`, come 10.1).
3. **Parità di permessi con le viste** (identica alla 10.1, riuso degli stessi service): estratto conto own per pilota (proprio 200 / altrui 403), report finanziario `finance.manage`, registro voli own-scoped, scadenze `expiries.manage`; 401 senza sessione; 422 su filtri invalidi. Route PDF dedicate ma stesso `apiRoute` + pass-through `Response` (GIÀ esistente dalla 10.1).
4. Oltre `PDF_EXPORT_MAX_ROWS = 2_000` righe il PDF risponde 422 `EXPORT_TOO_LARGE` (un PDF non è uno strumento dati: oltre, si usa l'export Excel 10.1) — cap dedicato, stesso codice errore.
5. Le 4 viste report hanno il bottone **"Esporta PDF"** accanto all'"Esporta Excel" della 10.1 (stesso componente `ExportButton` riusato/generalizzato, filtri live, locale corrente); la pagina settings segue lo stile minimalist-ui (form editoriale sobrio, preview logo, rimozione logo); i18n IT/EN.
6. OpenAPI: le 4 route PDF + `GET/PUT settings/airfield` registrate (response binaria `application/pdf` per le prime); `registry.test.ts` aggiornato; unit + e2e (v. T6).

## Contesto e decisioni di design (vincolanti)

- **Settings**: estendere `src/server/services/app-settings.service.ts` con la coppia narrow `getAirfieldBranding()` / `setAirfieldBranding(actor, {name, logoDataUrl})` — il doc-comment del modulo (righe 5-15) prescrive ESATTAMENTE questo pattern ("a future story ... adds its own narrow get/set pair here"); upsert per chiave come righe 59-72/135-143. Lettura branding: actor autenticato, NESSUN gate di permesso (l'intestazione serve a ogni ruolo che può esportare un report; il dato non è sensibile). Scrittura: `authorize(actor,'settings.manage')` (rbac.ts:38 — solo ADMIN via riga 81; STAFF escluso per FR-3, commento righe 90-102). Pagina `/dashboard/settings`: pattern admin-only di `users/page.tsx:32-35` (`hasPermission` → redirect + il service ri-authorize, AD-5); upload logo CLIENT-SIDE (`<input type="file">` → FileReader → data-URL) senza infrastruttura storage; Zod: `z.string().regex(/^data:image\/(png|jpeg);base64,/)` + max length ≈ 280_000 caratteri (~200KB). Nav: voce Impostazioni visibile solo con `settings.manage` (`nav-items.ts` + test).
- **Adapter PDF** (`src/server/adapters/pdf/` — spine :227, gemello di `excel/`): componenti react-pdf condivisi — layout documento con header (logo `<Image src={dataUrl}>` + nome), titolo, sottotitolo periodo/filtri, tabella generica a colonne (stesso concetto `ExportColumn` dell'adapter excel: header + value(row), qui tutto stringhe già formattate), riga totali opzionale, footer con `formatDateTime` di generazione + "pag. N/M" (`render` prop di react-pdf). `renderPdfBuffer(document)` → Buffer; `pdfResponse(buffer, filename)` simmetrico a `xlsxResponse` (`src/server/adapters/excel/response.ts`). **Font built-in Helvetica** (Latin-1 copre gli accentati italiani) — NIENTE `Font.register`, niente asset nuovi.
- **@react-pdf/renderer `4.5.1`** nuova dependency (peer React ^19 ok con react 19.2.7). SOLO server-side (adapter + route handler Node): mai importato da client component. ATTENZIONE build: se `npm run gates` fallisce il build per bundling delle transitive (yoga-layout/fontkit), aggiungere `serverExternalPackages: ['@react-pdf/renderer']` in `next.config.ts` — SOLO se il build lo richiede (niente config speculativa; dichiararlo in notesForReview).
- **Exports service**: estendere `src/server/services/exports.service.ts` (10.1) con 4 funzioni `export<Report>Pdf(actor, query)` che seguono lo STESSO shape a 3 passi documentato nel doc-comment del modulo (righe 27-54): riuso list service con `page:1, pageSize` capata, cap → `EXPORT_TOO_LARGE` (qui `PDF_EXPORT_MAX_ROWS = 2_000`), mappatura a colonne localizzate (`createTranslator` + `resolveLocale` esistenti, righe 60-90) e ritorno `{ buffer, filename }`. In più rispetto all'excel: il fetch del branding (`getAirfieldBranding`) e i TOTALI:
  - **Estratto conto** (`/api/v1/people/{id}/account/pdf`): riuso `listAccountMovements` (accounts.service.ts:334, scoping `assertReadAccess` :97-103) — la vista NON ha filtro periodo: il PDF è l'estratto COMPLETO (parità con la vista; niente from/to inventati) + **saldo finale** da `getAccountOverview` :115 (`balanceCents` = SUM, AD-3). Colonne come `account-statement-table.tsx`; `actorEmail` incluso solo se l'actor ha `people.read` (parità DTO :351).
  - **Report finanziario** (`/api/v1/cash-report/pdf`): riuso `getCashReport` (cash.service.ts:538, gate `finance.manage`); il DTO `CashReport` (:481-489) ha GIÀ tutti i totali (totalIn/totalOut/net + per categoria) — tabella categorie + riga totali, periodo from/to nel sottotitolo.
  - **Registro voli** (`/api/v1/flights/pdf`): riuso `listFlights` (flights.service.ts:1214, own-scoping :1215-1235) con gli stessi filtri della vista; **totali NUOVI calcolati nell'export service** (somma `minutes` → `formatMinutes`, somma `breakdown.totalAmountCents` → euro) — NON toccare flights.service (superficie money: chirurgia 10.1 invariata).
  - **Lista scadenze** (`/api/v1/expiries/pdf`): riuso `listAllExpiries` (expiries.service.ts:435, gate `expiries.manage`), colonne della dashboard con **stato colorato** riusando ESATTAMENTE la palette di `expiry-status-badge.tsx:12-16` (ok verde `#346538`, expiring `#956400`, expired `#9F2F2D`); nessun totale (non pertinente).
- **Route**: 4 file `route.ts` nuovi sotto `src/app/api/v1/.../pdf/` con `apiRoute` (il pass-through `Response` della 10.1 in `handler.ts` copre già il binario); query = stesso schema di filtri della vista + `locale` (riuso `exportQuerySchema` di `common.ts:47` SENZA `format` — route dedicata; se serve, un fragment `pdfQuerySchema = exportQuerySchema.omit({format})` o solo il campo locale). NIENTE `?format=pdf` sugli endpoint elenco: la convenzione spine per i PDF è la route dedicata.
- **UI**: riusare/generalizzare `src/components/export-button.tsx` + `src/lib/export-href.ts` (10.1) per il secondo bottone (label "Esporta PDF", href verso la route pdf con filtri live): estratto conto `people/[id]/account/page.tsx`, report `finance/report/page.tsx` (barra azioni :128-139), registro `flights-manager.tsx` (accanto all'export excel), scadenze `expiries/page.tsx`. Verifica interattiva Playwright MCP (desktop + mobile 375×812) di settings page e bottoni.
- **Test PDF senza dipendenze nuove** (ratificato): le asserzioni sui CONTENUTI (colonne, totali, intestazioni localizzate) si fanno a livello unit sull'input passato all'adapter (funzioni export testabili: mock del list service, ispezione colonne/righe/totali) — il BINARIO si verifica con magic bytes `%PDF-` + headers negli e2e. NIENTE pdf-parse in devDeps.
- **Fuori scope (dichiarato)**: upload file su storage (logo = data-URL in AppSetting); font custom/brand; PDF di viste diverse dai 4 report FR-40; filtro periodo sull'estratto conto (la vista non lo ha); export PDF dei riepiloghi scuola (FR-34 richiede "esportabile" = Excel 10.1; il PDF non è richiesto); threshold saldo negativo nella pagina settings (deferred storico, resta fuori).

## Tasks / Subtasks

- [x] **T1 (AC 1)** — Settings: `getAirfieldBranding`/`setAirfieldBranding` in app-settings.service (+ unit: default, upsert, gate scrittura, validazione logo); schema Zod `airfieldBrandingSchema`; route `GET/PUT /api/v1/settings/airfield`; OpenAPI + registry.test.
- [x] **T2 (AC 1, 5)** — Pagina `/dashboard/settings` admin-only (form nome + upload/preview/rimozione logo, client-side base64) + nav item + nav test; i18n IT/EN; stile minimalist-ui; verifica Playwright MCP.
- [x] **T3 (AC 2)** — Adapter pdf: layout condiviso (header branding, titolo, periodo, tabella, totali, footer data+pagine), `renderPdfBuffer`, `pdfResponse` (+ unit smoke: buffer inizia con `%PDF-`, filename); dependency @react-pdf/renderer.
- [x] **T4 (AC 2, 3, 4)** — Le 4 funzioni `export<Report>Pdf` in exports.service (+ unit: parità argomenti ai list service, cap 2000 → 422, colonne/totali/localizzazione per estratto conto con saldo, cash report con totali DTO, flights con totali calcolati, expiries con stati) + le 4 route pdf.
- [x] **T5 (AC 5)** — Bottoni "Esporta PDF" nelle 4 viste (filtri live, locale corrente); i18n.
- [x] **T6 (AC tutti)** — e2e `e2e/pdf-exports.spec.ts`: admin esporta i 4 PDF → 200, content-type/disposition, magic bytes `%PDF-`; branding configurato via settings page → (unit copre l'intestazione; e2e: PUT settings + export 200); pilota: proprio estratto conto 200 / altrui 403 / cash-report e expiries 403; unauth 401; filtri invalidi 422; settings page: admin configura nome+logo, staff/pilota redirect da /dashboard/settings e 403 su PUT; click bottone UI → download (una vista). Regressione: e2e exports (10.1) + report/statement/expiries esistenti.
- [x] **T7** — `npm run gates`; story file (Dev Agent Record) + sprint-status (10-2 → review).

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; story CON UI (pagina settings + bottoni): `design-taste-frontend` + `ui-ux-pro-max` + minimalist-ui + verifica Playwright MCP (se `browser_resize` manca, dichiarare la verifica alternativa).
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE; gates SOLO `npm run gates`; MAI `playwright install`. Baseline post-10.1: unit e e2e correnti al momento del dispatch (la sessione principale li fornirà nel prompt).
- UN commit di implementazione (`Story 10.2: ...`); `git commit --amend --no-edit --reset-author`; NON pushare.
- Il pattern a 3 passi e i helper (`resolveLocale`, `createTranslator`, cap/errore) esistono GIÀ in exports.service.ts (10.1) — estendere, non reinventare; stessa cosa per `ExportButton`/`buildExportHref`.
- `AppSetting` è K/V string: il data-URL del logo ci sta (value è `String`, Postgres text) — verificare comunque con un logo reale ~150KB in Playwright MCP.
- react-pdf: componenti in file `.tsx` dell'adapter server (JSX server-only); niente `use client`; se il typecheck si lamenta del JSX in server file, seguire il pattern dei file `.tsx` server esistenti (le pagine).

### Project Structure Notes

- Nuovi file: `src/server/adapters/pdf/*`, route `src/app/api/v1/{people/[id]/account,cash-report,flights,expiries}/pdf/route.ts`, `src/app/api/v1/settings/airfield/route.ts`, `src/app/[locale]/dashboard/settings/*`, `e2e/pdf-exports.spec.ts`; estensioni a `app-settings.service.ts`, `exports.service.ts`, `export-button.tsx`/`export-href.ts`, `registry.ts`, `nav-items.ts`, `messages/{it,en}.json`.
- NESSUNA migrazione (AppSetting K/V esistente, schema.prisma:15-20); nessuna env var nuova.

### References

- [Source: _bmad-output/planning-artifacts/epics.md:793-803 — story 10.2; prd.md:311-312 — FR-40]
- [Source: ARCHITECTURE-SPINE.md:105 — PDF su route dedicate `/api/v1/**/pdf`; :227 — adapters/pdf]
- [Source: src/server/services/app-settings.service.ts:5-19 (pattern narrow get/set), :59-72,:135-143 (upsert+gate), :107/:135 (read/write asimmetrico)]
- [Source: src/server/auth/rbac.ts:38 (`settings.manage`), :81 (solo ADMIN), :90-102 (STAFF escluso, FR-3)]
- [Source: src/app/[locale]/dashboard/users/page.tsx:32-35 — pattern pagina admin-only]
- [Source: src/server/services/accounts.service.ts:334 (listAccountMovements), :97-103 (assertReadAccess), :115 (getAccountOverview/balance), :272-284 (AccountStatementItem), :351 (actorEmail gating)]
- [Source: src/server/services/cash.service.ts:538 (getCashReport), :473-489 (DTO con totali)]
- [Source: src/server/services/flights.service.ts:1214 (listFlights), :169-214 (FlightListItem/breakdown)]
- [Source: src/server/services/expiries.service.ts:435 (listAllExpiries), :333-345 (item); src/lib/expiry-status.ts:67; expiries/expiry-status-badge.tsx:12-16 (palette)]
- [Source: src/server/services/exports.service.ts:27-90 (shape a 3 passi, EXPORT_MAX_ROWS, resolveLocale — 10.1); src/server/adapters/excel/response.ts (xlsxResponse); src/components/export-button.tsx; src/lib/export-href.ts]
- [Source: src/server/adapters/mail/templates.ts:16-57 — createTranslator off-request; finance/report/page.tsx:75-82,:128-139 — barra azioni]

## Dev Agent Record

### Agent Model Used

Sonnet 5 (claude-sonnet-5), xhigh — dev subagent.

### Debug Log References

- `npx tsc --noEmit -p tsconfig.json` — clean after every implementation batch.
- `npx vitest run` — 1200/1200 passed (baseline 1159 + this story's new/extended unit tests).
- `npm run gates` — lint/typecheck/test/build all PASS (build via `env -u NODE_ENV npx next build`, no `serverExternalPackages` needed — `@react-pdf/renderer` bundled cleanly).
- `npx playwright test e2e/pdf-exports.spec.ts` — 7/7 passed (dev server).
- Regression e2e: `exports.spec.ts` (10.1), `cash-report.spec.ts`, `expiry-dashboard.spec.ts`, `expiry-registration.spec.ts`, `expiry-types.spec.ts`, `flight-log.spec.ts`, `flights.spec.ts`, `account-statement.spec.ts` — 35/35 passed.
- Playwright MCP interactive verification (dev server): `/dashboard/settings` desktop + mobile 375×812 (`browser_resize` available this session), logo upload via `document.querySelector('input[type=file]').click()` + `browser_file_upload` (the label→hidden-input click needed a JS-triggered click to surface the file-chooser modal to the MCP tool), save feedback "Impostazioni salvate.", logo removal; "Esporta PDF" buttons on `/dashboard/flights`, `/dashboard/expiries`, `/dashboard/finance/report` (desktop + mobile, no wrap/overflow); clicked "Esporta PDF" on the cash report and confirmed a real, valid single-page PDF downloaded (`file` reports "PDF document, version 1.3, 1 page(s)").

### Completion Notes List

- **Adapter PDF** (`src/server/adapters/pdf/`): `document.tsx` — `PdfColumn<T>`/`PdfTotal` types (gemelli di `ExportColumn` dell'adapter excel, ma testuali: niente `numFmt`, un money value è già una stringa formattata da `formatCents`/`formatSignedCents`), `PdfReportDocument` (header branding + titolo + sottotitolo opzionale + tabella + totali opzionali + footer con data generazione e numerazione pagina via `Text render` + `fixed`, react-pdf), `renderPdfBuffer` (generico, `ReactElement → Buffer`) e `renderReportPdf` (props → Buffer, usato da exports.service — tiene il JSX fuori dal file `.ts` del service). `response.ts#pdfResponse` simmetrico a `xlsxResponse`. Font Helvetica built-in (nessun `Font.register`), verificato con un logo PNG reale (data-URL) e senza — nessun warning.
- **Semplificazione dichiarata** (Dev Notes lasciava discrezione): l'header di colonna della tabella PDF NON è ripetuto su ogni pagina per un report multi-pagina (nessun uso di `fixed` sulla riga header) — limitazione MVP onesta piuttosto che un tentativo di posizionamento `fixed` non verificabile visivamente in questo ambiente (niente `pdf-parse`).
- **exports.service.ts**: 4 funzioni `export<Report>Pdf` che seguono lo stesso shape a 3 passi del 10.1 (riuso list/aggregate service → cap `PDF_EXPORT_MAX_ROWS=2000` → mappatura a colonne localizzate), `assertWithinCap` refattorizzato per condividere la logica fra il cap xlsx (10.1) e quello PDF senza duplicazione. `toPdfExport` centralizza branding + footer labels (`PdfExport.generatedAt`/`.page`, nuovo namespace i18n condiviso).
  - Estratto conto: titolo = `t('kicker')` ("Estratto conto"), sottotitolo = nome persona (via `getPerson`, stesso own-access rule già applicato da `listAccountMovements`), totale = saldo finale (`getAccountOverview`). Colonna "Registrato da" solo con `people.read`, come l'export Excel.
  - Report finanziario: riuso ESATTO delle chiavi i18n `CashReportPage` già usate dalla pagina (nessuna chiave nuova necessaria), sottotitolo = periodo, totali = entrate/uscite/saldo.
  - Registro voli: totali (durata totale, importo totale) calcolati nell'export service sulle righe effettivamente esportate, MAI in `flights.service.ts`; sottotitolo = periodo SOLO se `dateFrom`/`dateTo` entrambi presenti nei filtri (altrimenti omesso — scelta di semplicità, non richiesta esplicitamente dall'AC).
  - Scadenze: palette stato duplicata come costanti hex locali (`EXPIRY_STATUS_PDF_COLOR`) invece di importata da `expiry-status-badge.tsx` — quel modulo è `'use client'`, importarlo in un service server-only sarebbe un attraversamento di boundary rischioso; i 3 valori sono commentati come "kept in exact sync by hand" con puntatore alla fonte.
- **Route PDF dedicate**: `flights/pdf` ed `expiries/pdf` riusano LETTERALMENTE lo stesso query schema della vista JSON (`listFlightsQuerySchema`/`listAllExpiriesQuerySchema`, che già include `page`/`pageSize`/`format` oltre ai filtri) invece di ritagliare un fragment ad hoc — semplificazione dichiarata: i campi extra sono innocui (ignorati dal branch PDF), ed evita di duplicare la definizione dei filtri in un secondo schema. `account/pdf` usa il nuovo `pdfQuerySchema` (solo `locale`, nessun filtro — la vista non ne ha). `cash-report/pdf` ha un nuovo `cashReportPdfQuerySchema` (stesso `from`/`to` obbligatorio + `locale`, base condivisa con `cashReportQuerySchema` via un oggetto Zod estratto prima del `.refine`).
- **Settings**: `getAirfieldBranding()` non prende un `actor` (a differenza di ogni altro getter del modulo) — non ha alcun controllo di permesso da fare, quindi non ha bisogno del parametro; la route lo richiama senza passare `actor`. `setAirfieldBranding` resta gated `settings.manage` come da Dev Notes.
- **Pagina `/dashboard/settings`**: nav item `settings` (esistente dalla story 1.3 ma mai implementato, puntava a `/settings` placeholder) ripuntato a `/dashboard/settings` — stesso pattern di ogni altro nav item "placeholder → pagina reale" delle epic precedenti (2.1, 2.4, ecc.), test nav aggiornato. Upload logo client-side (`FileReader.readAsDataURL`), preview/rimozione, validazione client (tipo + ~200KB) con guardiano server reale in Zod (AD-5).
- **UI**: `buildExportHref` (10.1) lasciato invariato; nuovo `buildPdfExportHref` gemello (nessun `format` in query, la route è già dedicata). `ExportButton` riusato senza modifiche (è già generico href+label). Bottone "Esporta PDF" aggiunto accanto a "Esporta Excel" in 3 viste (estratto conto, registro voli, scadenze); il report finanziario non aveva un export Excel (10.1 non lo copriva) quindi ha SOLO il bottone PDF, posizionato nella barra azioni in alto.
- **OpenAPI**: 4 route PDF (`content: pdfContent()`, nuovo helper gemello di `xlsxContent()`) + `GET/PUT settings/airfield` registrate; `registry.test.ts` esteso con path e response-shape assertions.
- **Test**: adapter PDF (`document.test.ts`) — smoke binario (`%PDF-`, con/senza logo, righe vuote); `exports.service.test.ts` esteso mockando `renderReportPdf` (mai il vero rendering) e ispezionando le `props` passate (colonne/valori/totali/titolo/sottotitolo) — la strategia di test prescritta dalle Dev Notes ("niente pdf-parse"); `app-settings.service.test.ts` esteso per branding get/set. e2e nuovo `e2e/pdf-exports.spec.ts` (7 scenari, T6 completo) + regressione (10.1 e viste toccate) verificata verde.
- **Nessuna migrazione, nessuna env var nuova** — confermato: `env.ci-sync.test.ts` incluso nei 1200 unit verdi.

### File List

- `package.json`, `package-lock.json` — nuova dependency `@react-pdf/renderer@^4.5.1`.
- `src/lib/schemas/settings.ts` — nuovo: `airfieldBrandingSchema`/`AirfieldBrandingDto`.
- `src/lib/schemas/common.ts` — nuovo `pdfQuerySchema`/`PdfQuery`.
- `src/lib/schemas/cash.ts` — nuovo `cashReportPdfQuerySchema`/`CashReportPdfQuery` (base condivisa `cashReportPeriodSchema` estratta).
- `src/lib/schemas/registry.ts` — `pdfContent()`, 4 route PDF + `GET/PUT settings/airfield` registrate, componente `AirfieldBranding`.
- `src/lib/schemas/registry.test.ts` — assertion sui nuovi path/response shape.
- `src/lib/export-href.ts` — nuovo `buildPdfExportHref`.
- `src/server/adapters/pdf/document.tsx` — nuovo: `PdfColumn`/`PdfTotal`/`PdfReportDocument`/`renderPdfBuffer`/`renderReportPdf`.
- `src/server/adapters/pdf/document.test.ts` — nuovo: smoke test binario.
- `src/server/adapters/pdf/response.ts` — nuovo: `pdfResponse`.
- `src/server/services/app-settings.service.ts` — `getAirfieldBranding`/`setAirfieldBranding`; doc-comment del modulo aggiornato (non più "PPR-specific").
- `src/server/services/app-settings.service.test.ts` — test branding get/set.
- `src/server/services/exports.service.ts` — `PDF_EXPORT_MAX_ROWS`, `assertWithinPdfExportCap`, `toPdfExport`, 4 funzioni `export<Report>Pdf`.
- `src/server/services/exports.service.test.ts` — test dei 4 export PDF (mock `renderReportPdf`).
- `src/app/api/v1/settings/airfield/route.ts` — nuovo: GET/PUT.
- `src/app/api/v1/people/[id]/account/pdf/route.ts` — nuovo.
- `src/app/api/v1/cash-report/pdf/route.ts` — nuovo.
- `src/app/api/v1/flights/pdf/route.ts` — nuovo.
- `src/app/api/v1/expiries/pdf/route.ts` — nuovo.
- `src/app/[locale]/dashboard/settings/page.tsx` — nuovo: pagina admin-only.
- `src/app/[locale]/dashboard/settings/settings-form.tsx` — nuovo: form client (nome + logo upload/preview/rimozione).
- `src/app/[locale]/dashboard/nav-items.ts` — `settings` ripuntato a `/dashboard/settings`.
- `src/app/[locale]/dashboard/nav-items.test.ts` — assertion href aggiornata.
- `src/app/[locale]/dashboard/people/[id]/account/page.tsx` — bottone "Esporta PDF".
- `src/app/[locale]/dashboard/expiries/page.tsx` — bottone "Esporta PDF".
- `src/app/[locale]/dashboard/flights/flights-manager.tsx` — bottone "Esporta PDF" (prop `exportPdfLabel`).
- `src/app/[locale]/dashboard/flights/page.tsx` — prop `exportPdfLabel` passata.
- `src/app/[locale]/dashboard/finance/report/page.tsx` — bottone "Esporta PDF" (nessun export Excel preesistente su questa vista).
- `messages/it.json`, `messages/en.json` — `Export.buttonPdf`, `PdfExport.*`, `SettingsPage.*`, `AccountStatementPage.pdf.balance`, `FlightsPage.pdf.*`.
- `e2e/pdf-exports.spec.ts` — nuovo: 7 scenari e2e (T6).

## Review Record

Reviewer: subagent **Opus 4.8 (extra-high)**, adversarial. **Verdict: clean-pass — zero finding mandatory.** 1 nit non-mandatory registrato come nota di miglioramento futuro (nessun cambio di codice).

- **Priorità zero — full suite e2e su DB fresco, BUILD DI PRODUZIONE in modalità CI**: **179/179 passed, 0 flaky** (3.9m; 172 baseline + 7 nuovi `pdf-exports.spec.ts`); ppr-register e cash-report verdi senza retry. Gates ri-eseguiti da tree pulito: lint/typecheck/build verdi, **1200/1200 unit**, `env.ci-sync.test.ts` verde (nessuna env var nuova); confermato che `serverExternalPackages` NON è servito (il build bundla @react-pdf pulito). Nessun edit del reviewer (working tree pulito a fine review).
- **Gap del dev chiusi dal reviewer**: (a) contenuti PDF verificati EMPIRICAMENTE oltre il livello unit — branding impostato con nome accentato ("Aviosuperficie Però città") + PNG reale, i 4 PDF scaricati dal server di produzione e i content stream FlateDecode decodificati a mano: accenti WinAnsi corretti, logo embedded (`/I1 Do`), totali esatti (flights "Durata totale 45:40" / "Totale addebiti 6593,33"; cash "Saldo del periodo +2827,20"), simbolo € reso correttamente, colori stato expiry esatti (#346538/#956400/#9F2F2D = badge component); (b) PDF multi-pagina reale generato (4 pagine): rendering corretto, footer `fixed` con "Pag. 4 di 4" ripetuto su ogni pagina; (c) matrice RBAC completa 5 ruoli live sulle 4 route PDF + settings PUT + unauth — tutto esatto (own-account, cash/expiries staff-only, flights own-scoped, PUT solo admin, 401 unauth); (d) persistenza branding provata a DB con psql dopo PUT live; (e) settings UI guidata via Playwright MCP (form pre-popolato dalla GET, stile editoriale coerente).
- **102-N1 (nit, ACCETTATO)** — il PDF multi-pagina non ripete la riga di intestazione colonne sulle pagine 2+ (`document.tsx:95-102`, manca `fixed` sull'header row; il footer invece lo ha). Provato su PDF 4 pagine reale: leggibile, numerazione presente — non viola AC 2 (che chiede colonne della vista + numerazione pagine, non header per-pagina); la stessa Completion Notes del dev lo dichiarava. Nota di miglioramento futuro.
- NOTA ambiente: la review ha lasciato nel DB seed il branding di test — il `db:reset` pre-dev della sessione principale lo pulisce.

### Final gates (review run, DB fresco, prod build)

lint/typecheck/build verdi, **1200/1200 unit**, full suite CI-mode **179/179, 0 flaky**. Nessun fix richiesto: nessun commit di fix post-review.

## Change Log

- 2026-07-10: Story file created (Fable 5 main session) — seconda story Epic 10. Decisioni chiave: branding su AppSetting K/V (nessuna migrazione, logo data-URL senza storage), lettura branding senza gate / scrittura settings.manage, route PDF dedicate con riuso del plumbing 10.1 (pass-through, exports.service, ExportButton), cap PDF 2000 righe, test contenuti a livello unit + magic bytes negli e2e (niente pdf-parse).
- 2026-07-10: Implementation (Sonnet 5 dev subagent) — tutti i task T1-T7 completati. Gates verdi (lint/typecheck/test/build), 1200/1200 unit, 7/7 e2e nuovi + 35/35 e2e di regressione. Deviazioni dichiarate: header tabella non ripetuto su multi-pagina PDF; palette stato scadenze duplicata come costanti hex (no import cross-boundary da modulo `'use client'`); `flights/pdf` ed `expiries/pdf` riusano il query schema della vista JSON invece di un fragment dedicato; sottotitolo periodo omesso su `flights/pdf` quando i filtri data non sono entrambi presenti.
- 2026-07-10: Review Opus 4.8 xhigh — clean pass, zero mandatory. Full suite prod-build CI-mode 179/179 senza flaky; contenuti PDF decodificati e provati (branding accentato, logo, totali, €, colori); matrice RBAC 5 ruoli completa; multi-pagina verificato. 102-N1 accettato (header colonne non ripetuto pagine 2+ — miglioramento futuro). Nessun fix. Status → done.
