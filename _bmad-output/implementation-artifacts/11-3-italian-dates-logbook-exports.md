---
baseline_commit: a0abb71
---

# Story 11.3: Date italiane ovunque ed export logbook

Status: review

## Story

As a utente,
I want date in formato italiano su ogni schermata ed export allineati al logbook,
so that il sistema parli la lingua del campo volo (FR-44, FR-45; epics.md «Epic 11», change-request-flight-log-2026-07-10.md).

## Acceptance Criteria

1. **Given** l'audit completo delle superfici UI che rendono date-only ISO raw (elenco CHIUSO in Contesto, dal recon di sessione), **When** le apro, **Then** ogni data è DD/MM/YYYY via `formatDateOnly` (o `formatDateTime` dove il dato è un instant) — NESSUN formatter nuovo, NESSUN cambio ai campi `<input type="date">` e ai request body (restano ISO).
2. **Given** l'export Excel del registro voli, **Then** contiene le colonne logbook SEPARATE — partenza, arrivo, ora decollo (HH:MM Europe/Rome), ora atterraggio, decolli — più la colonna PIC (derivazione story 11.2), con intestazioni localizzate IT/EN da `FlightsPage.list.table`; i voli storici senza dati logbook esportano celle vuote/`null`. Colonna `landings` esistente invariata.
3. **Given** l'export PDF del registro voli (A4 verticale, colonne flex a larghezza uguale — vincolo recon), **Then** le stesse informazioni entrano in forma COMPATTA: `tratta` (`dep → arr`), `orari` (`HH:MM–HH:MM`), `dec./att.` (`N / N`, sostituisce la colonna atterraggi), `PIC` — riusando le chiavi/formati della tabella registro (story 11.2). La leggibilità del PDF va VERIFICATA su un export reale generato con dati di prova (non solo il magic-byte check degli e2e); se ancora illeggibile, ulteriore merge dichiarato come deviazione.
4. **Given** la derivazione PIC, **Then** exports e registro usano UN SOLO helper condiviso: se la story 11.2 l'ha lasciato module-scope nel client `flights-manager.tsx`, estrarlo in `src/lib/flight-pic.ts` (client-safe e importabile server-side) e far importare il registro da lì — refactor chirurgico, unit test dei 3 rami + fallback se non già esistenti.
5. Test verdi: `exports.service.test.ts` aggiornato (mock voli in shape post-11.1, assert nuove colonne xlsx per indice e PDF per header-lookup, caso SCHOOL doppio-comando per il ramo istruttore del PIC); `e2e/exports.spec.ts` aggiornato (array intestazioni ESATTO e indici cella slittano); `e2e/pdf-exports.spec.ts` resta verde senza modifiche (non assert sul contenuto).
6. i18n IT/EN completo (nuove chiavi header sotto `FlightsPage.list.table`, riusando quelle introdotte da 11.2 dove esistono); email templates NON toccati (già localizzati, formato long-form deliberato — fuori scope, decisione ratificata in questa story).

## Contesto e decisioni di design (vincolanti)

- **Audit CHIUSO — superfici da retrofittare** (tutte rendono stringhe date-only ISO raw; refs dal recon, verificare per nome se le righe sono slittate):
  - `people/account-panel.tsx` :186 (`movement.effectiveDate`)
  - `people/[id]/account/account-statement-table.tsx` :153 (colonna data) e :131/:137/:370 (badge/sottotitolo `{date}` interpolati)
  - `people/expiries-panel.tsx` :281-282 (`issuedAt`/`expiresAt`)
  - `expiries/page.tsx` :303-304; `expiries/my-expiries.tsx` :129-130; `expiries/proposals-queue.tsx` :111/:116 (4 date correnti/proposte)
  - `finance/cash-register.tsx` :162 (colonna data) e :602 (label dialog conferma)
  - `aircraft/aircraft-manager.tsx` :1348 (`validFrom` storico tariffe); `people/instructor-rates-panel.tsx` :304 (idem istruttori)
  - `people/profiles-panel.tsx` :423/:469 (`courseStartDate`); `school/page.tsx` :293 (`courseStartDate` — la riga :296 accanto usa GIÀ `formatDateOnly`: allineare)
  - **ESCLUSI**: `flights-manager.tsx` (fatto da 11.2 — NON toccare), form/input bindings (restano ISO), email templates (già localizzati), export (già `formatDateOnly`), superfici già formattate (home, school journal, packages, bookings, ppr — v. recon).
- **Export xlsx** (`exports.service.ts#exportFlightsXlsx`, ~:221-249): colonne = ordine della tabella registro post-11.2 ma con partenza/arrivo/orari SEPARATI (Excel non ha vincoli di larghezza; `width` opzionale su `ExportColumn`, default 18): data, velivolo, persona, istruttore, tipo, partenza, arrivo, ora decollo, ora atterraggio, durata, decolli, atterraggi, PIC, addebito, stato. Orari via `formatTimeOfDay(row.takeoffAt, locale)` — pattern GIÀ presente in `exportBookingsXlsx` :268; null-guard → `null`. Header: `t('list.table.*')` (namespace `FlightsPage`).
- **Export PDF** (`exportFlightsPdf`, ~:516-556): colonne compatte (AC 3) — data, velivolo, persona, istruttore, tipo, tratta, orari, durata, dec./att., PIC, addebito, stato (12). Celle PDF sono SEMPRE stringhe; null → `''`. Totali (`pdf.totalDuration`/`pdf.totalAmount`) INVARIATI. NIENTE landscape (non esiste), NIENTE modifiche a `document.tsx` salvo necessità dichiarata.
- **Precedente xlsx≠pdf**: già sancito nel file (doc-comment :55-57, nota aircraft :179-185) — set colonne divergenti legittimi.
- **PIC condiviso** (AC 4): la logica è nel story file 11.2 (non-SCHOOL → person; SCHOOL+isSolo → person; SCHOOL dual → instructor, fallback noValue). In export il fallback rende `''`/`null`. Formato nome `lastName firstName` (stesso di `${row.person.lastName} ${row.person.firstName}` già usato in export).
- **e2e exports.spec.ts** (~:126-137, :191): array intestazioni esatto + indici `getCell(n)` — aggiornarli TUTTI coerentemente col nuovo ordine; l'helper `registerFlight` degli spec invia già la shape 11.1 (`'Base Airfield'`, decollo `10:00Z`) quindi le nuove celle hanno valori assertabili deterministici.
- **Unit test exports** (`exports.service.test.ts`): i mock flights (~:132-160 xlsx, ~:394-421 pdf) sono in shape PRE-11.1 (`as never`) — portarli alla shape reale (campi logbook popolati e caso storico null) e aggiungere il caso SCHOOL doppio-comando (istruttore presente, `isSolo:false`) per coprire il ramo PIC-istruttore; i mock attuali coprono solo solo/istruttore-null.
- **Fuori scope (dichiarato)**: QTB/libretto pilota PDF (follow-up fuori epic); header colonne PDF ripetuto su pagine 2+ (deferred storico 102-N1); formato date nelle email (deliberato long-form); ogni altro export non-flights; larghezze proporzionali `PdfColumn` (introdurle SOLO se la verifica leggibilità lo impone, dichiarandolo).

## Tasks / Subtasks

- [x] **T1 (AC 4)** — Helper PIC condiviso `src/lib/flight-pic.ts` (estrazione da 11.2 se module-scope, altrimenti riuso diretto) + unit test se mancanti.
- [x] **T2 (AC 1)** — Retrofit `formatDateOnly` sulle superfici dell'audit CHIUSO; nessun cambio a form/wire.
- [x] **T3 (AC 2, 3, 6)** — Colonne export xlsx (separate) e PDF (compatte) + i18n header keys; verifica leggibilità PDF su export reale con dati di prova (decode/screenshot, come review 10.2). Nel passaggio: pulire il ramo morto `row.landings === null` in `exportFlightsPdf` (review 11.1, nit 111-N2 — il DTO è non-null dal 11.1).
- [x] **T4 (AC 5)** — `exports.service.test.ts` (mock post-11.1 + ramo PIC-istruttore) e `e2e/exports.spec.ts` (header array + indici); run mirato anche di `pdf-exports.spec.ts` e delle superfici retrofittate (expiries, cash-report, account-statement e2e).
- [x] **T5** — `npm run gates`; Dev Agent Record + File List; sprint-status `11-3` → `review`.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; UI marginale (solo formattazione celle esistenti): coerenza `minimalist-ui`, nessun redesign; per il PDF vale la verifica visiva (screenshot/decodifica) più degli e2e.
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE; gates SOLO `npm run gates`; MAI `playwright install`.
- UN commit di implementazione (`Story 11.3: ...`); `git commit --amend --no-edit --reset-author`; NON pushare.
- Baseline post-11.2 nel prompt di dispatch (migrazioni 30, unit/e2e aggiornati). Flake noti: `ppr-register:206`, `cash-report` ECONNRESET, login-redirect su webServer freddo.
- ATTENZIONE: gli e2e di expiries/cash/account potrebbero assert-are date ISO nelle righe (come faceva flight-reversal) — grep PRIMA di toccare le superfici (`grep -n "20[0-9][0-9]-" e2e/*.spec.ts`) e aggiornare i selettori `hasText` al nuovo formato dove serve.

### Project Structure Notes

- File toccati attesi: `src/server/services/exports.service.ts` (+test), `src/lib/flight-pic.ts` (+test), le 11 superfici UI dell'audit, `messages/{it,en}.json`, `e2e/exports.spec.ts`, eventuali e2e con `hasText` ISO. NESSUNA migrazione, env var, API nuova.

### References

- [Source: _bmad-output/planning-artifacts/epics.md «Story 11.3»; change-request-flight-log-2026-07-10.md]
- [Source: recon 11.3 in sessione — audit completo raw-ISO (11 superfici + esclusioni motivate); exports.service.ts :221-249 (xlsx flights), :516-556 (pdf flights), :61/:64 (cap 10k/2k), :111 (MONEY_NUM_FMT), :268 (formatTimeOfDay precedente bookings); adapters/excel/workbook.ts :22 (DEFAULT_COLUMN_WIDTH); adapters/pdf/document.tsx :60-61 (flex:1), :71-78 (header non ripetuto, MVP), :107 (wrap={false})]
- [Source: e2e/exports.spec.ts :77-87 (helper shape 11.1), :126-137 (header array esatto), :191 (getCell person); e2e/pdf-exports.spec.ts (nessun assert di contenuto)]
- [Source: exports.service.test.ts :126-186 (xlsx flights, mock pre-11.1), :384-453 (pdf flights, header-lookup)]
- [Source: messages/it.json — FlightsPage.list.table ~:963-984, FlightsPage.form (labels partenza/arrivo/orari da rispecchiare), PdfExport ~:1522]
- [Source: story file 11-2 (helper PIC, chiavi tabella, colonne compatte tratta/orari/dec-att)]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (dev subagent, xhigh)

### Debug Log References

- `npm run gates` (final, clean tree): lint/typecheck/build PASS, unit test PASS — 1218/1218 (baseline 1215 + 3 new: 2 in the xlsx `describe` — historical-null row, SCHOOL-dual PIC row — and 1 in the PDF `describe` — SCHOOL-dual PIC; other new PDF assertions were added to the EXISTING main test, not as standalone `it`s).
- Targeted e2e (dev server, DB left by the main session — not reset): `exports.spec.ts` + `pdf-exports.spec.ts` (15/15); `expiry-dashboard.spec.ts` + `expiry-registration.spec.ts` + `expiry-alerts.spec.ts` + `expiry-types.spec.ts` (12/12); `cash-register.spec.ts` + `cash-report.spec.ts` (8/8); `aircraft-rates.spec.ts` + `instructor-rates.spec.ts` (8/8, one `ECONNRESET` flake on `instructor-rates.spec.ts` reproduced-green on isolated retry — known flake class per Dev Notes); `account-adjustments.spec.ts` + `account-statement.spec.ts` + `person-profiles.spec.ts` (13/13); `person-detail.spec.ts` + `school.spec.ts` (18/18); `flights.spec.ts` + `flight-log.spec.ts` (14/14). All green; re-run after the PDF adapter fixes (below) to confirm no regression.
- Real-PDF readability check (AC 3, not just the e2e magic-byte check): registered live flights via the API against the running dev server (admin session, throwaway Node scripts reading `SEED_ADMIN_PASSWORD` from the environment — password never printed/typed literally), fetched `/api/v1/flights/pdf` for realistic data (TOURISM, SCHOOL dual-command, cancelled AERIAL_WORK), then verified TWO ways: (a) manual FlateDecode content-stream extraction (same method as story 10.2's review) confirming exact text/values; (b) a TRUE visual render via the Playwright MCP browser — fetched the PDF binary from within an authenticated browser context, loaded it as a `data:` URL so Chromium's native PDF.js viewer renders it, screenshotted, and pixel-inspected at 4-6x zoom. This caught 3 real bugs the e2e magic-byte check and the unit-level column tests could never catch (see Completion Notes) — all 3 fixed and re-verified visually clean.

### Completion Notes List

- T1 was already fully done by story 11.2: `src/lib/flight-pic.ts` exists (dedicated file, 4 unit tests covering all branches incl. the anomalous-fallback case) and the registry (`flights-manager.tsx`) already imports it. This story's only T1 work was making `exports.service.ts` import and reuse the SAME helper (no duplication) — done in T3.
- T2: retrofitted all 11 closed-audit surfaces to `formatDateOnly`, no changes to `<input type="date">` bindings or request bodies. Where a component had no `locale`/`moneyLocale` in scope yet, added the minimal thread-through: `useLocale()` in the smallest client sub-component that needed it (`ExpiryRow`, `MyExpiryRow`, `ProposalsQueue`), a new `moneyLocale` prop on `AdjustmentForm` (threaded from `AccountStatementTable`, which already had it), or `locale as 'it' | 'en'` in server components that already carry `locale` (`expiries/page.tsx`, `school/page.tsx`).
- T3 (xlsx): `exportFlightsXlsx` gained 6 new columns (partenza, arrivo, ora decollo, ora atterraggio, decolli, PIC) plus reordering to match the story's column order; `landings` column unchanged (key/value). New i18n keys under `FlightsPage.list.table`: `departure`, `arrival`, `takeoffTime`, `landingTime`, `takeoffs` (IT/EN).
- T3 (PDF, AC 3 — the substantive part of this story): `exportFlightsPdf` gained `tratta`/`orari`/PIC columns and replaced the old `landings`-only column with `dec./att.` (`${takeoffs} / ${landings}`, both always non-null per story 11.1 — this also cleans review 11.1's nit 111-N2 dead branch by replacement, not a no-op edit). The REAL verification (browser-rendered, not just decoded) found and fixed 3 genuine legibility regressions, none visible from the unit-level column tests or the e2e magic-byte check:
  1. **Column overflow, systemic**: growing the PDF from 9 to 12 equal-`flex:1` columns (523pt page width / 12 ≈ 43.6pt/column) made several ALWAYS-present, UNBREAKABLE tokens wider than their column — a bare `DD/MM/YYYY` date (10 chars, no whitespace, no hyphenation dictionary entry) and an aircraft registration overflowed visibly into the neighboring column on every single row, in every possible flights PDF (not a test-data artifact — this recurs for literally every date/aircraft cell). Fixed by adding an optional `width?: number` (relative flex weight, default 1 — unchanged behavior for the other 3 PDF reports, which never set it) to `PdfColumn<T>` in `document.tsx`, and assigning explicit weights in `exportFlightsPdf` (date 1.4, aircraft 1.3, route 1.3, person/instructor/PIC/amount 1.1, duration 0.6, movements 0.7, status 0.9, type unset/1). Declared deviation from equal-flex, explicitly pre-authorized by Dev Notes ("larghezze proporzionali PdfColumn — introdurle SOLO se la verifica leggibilità lo impone, dichiarandolo").
  2. **`Orari` (times) column overflow into `Durata`**: `"11:00–12:00"` (bare en-dash, no space) has no valid word-wrap break point for react-pdf, so it rendered as one unbreakable line that overflowed rightward into the `Durata` cell next to it — visually "11:20:20" (the time's trailing "20" glyph-collided with the duration's "0:20"). Fixed by spacing the separator: `"11:00 – 12:00"` — the space gives react-pdf's default word-wrap an actual break point, confirmed clean on re-render. This is a PDF-only format change (the registry/story 11.2's own bare `–` display is unaffected — a fluid HTML table has no such width constraint).
  3. **Route arrow glyph**: the registry's `→` (U+2192) separator, reused verbatim in the first PDF draft, is outside the PDF's built-in Helvetica/WinAnsiEncoding repertoire (story 10.2 deliberately uses no `Font.register`/custom font). react-pdf silently substitutes a WinAnsi codepoint that Chromium's PDF.js then renders as a stray `'` (right single quote), not an arrow — confirmed on the visual render, invisible in the earlier content-stream hex decode (which just showed "byte 0x92" without judging what glyph it actually paints as). Fixed by using ASCII `"->"` for the PDF's `tratta` column only; the web registry keeps `→` (native Unicode, no font constraint).
  - After all 3 fixes, re-verified on THREE separate real PDFs (an initial synthetic-suffix dataset, a corrected same-aircraft-filtered dataset, and a fully realistic-name dataset) — the last one fully clean at 4-6x zoom: every column legible, no overlaps, arrow renders correctly, wraps hyphenate sensibly (`Istrut-tore`, `Colom-bo`, `Decol-li/Atter-raggi`).
  - Residual, accepted limitation (not fixed, noted for the reviewer): a PERSON/INSTRUCTOR/PIC name that is one long unbroken token with no internal space/hyphenation point (observed only with a synthetic test lastName carrying a glued-on 17-digit uniqueness suffix, e.g. `Verifica1783718846845405` — NOT realistic production data, where Italian surnames are short dictionary words that hyphenate fine, confirmed clean with realistic names `Colombo`/`Romano` etc.) can still overflow a narrow column. Same category of issue as #1/#2 above but only manifests for pathological inputs; fixing it generically (per-cell dynamic font-shrink or truncation) would be a materially bigger, speculative change to the shared PDF adapter, out of proportion to this story's scope.
- T4: `exports.service.test.ts` — xlsx suite: mocks brought to the real post-11.1 shape (`departureAirfield`/`arrivalAirfield`/`takeoffAt`/`landingAt`/`takeoffs` populated, `landings` non-null), plus 2 new tests (historical-null-logbook row; SCHOOL dual-command PIC-is-instructor). PDF suite: mocks brought to the same real shape, existing test extended with route/times/movements/PIC assertions (incl. the historical-null case via the SAME two-row fixture, reusing rather than duplicating), plus 1 new dedicated SCHOOL-dual-command PIC test. `e2e/exports.spec.ts`: header array updated to the new 15-column order + all cell indices re-numbered + new assertions for the added columns (partenza/arrivo/ora-decollo/decolli/atterraggi/PIC), all deterministic given the shared `registerFlight` helper's fixed `'Base Airfield'`/`10:00Z` fixture. `pdf-exports.spec.ts` needed NO changes (no content assertions, per story) and stayed green throughout.
- Grepped `e2e/*.spec.ts` for ISO-date `hasText`/`toContainText`/`getByText` assertions BEFORE touching the retrofitted surfaces (Dev Notes' explicit warning, the 11.2 substring-collision lesson): found and fixed 4 spots that would otherwise have broken silently — `aircraft-rates.spec.ts`/`instructor-rates.spec.ts` (rate-history row date, both `PAST_DATE` and the dynamically-computed `today`, via a small local `ddmmyyyy()` helper), `person-profiles.spec.ts` (`courseStartDate` display text, 2 occurrences), `school.spec.ts` (own-student roster `courseStartDate` cell), and — found only via a second, deeper grep for the `addDaysUtc()` relative-date helper pattern (not caught by the literal `20[0-9][0-9]-` grep since `expiry-registration.spec.ts` computes dates at runtime) — 8 `toContainText(addDaysUtc(...))` assertions across the proposal-approval flow (`my-expiry-row`/`proposal-row`/`expiry-row` all display `issuedAt`/`expiresAt` via `formatDateOnly` now), fixed via a new `addDaysDisplay()` companion that converts to `DD/MM/YYYY` for display assertions while `addDaysUtc()` stays ISO for API payloads/`<input type="date">` fills (AC 1 constraint).
- Reused `flightPicPerson` directly in both `exportFlightsXlsx` and `exportFlightsPdf` (inline 2-3 line blocks per call site, `null` fallback for xlsx vs `''` for PDF) rather than adding a further wrapper helper — the two call sites differ only in their empty-value representation, not worth a third abstraction layer (karpathy: no speculative abstraction for two call sites).

### File List

- `src/server/services/exports.service.ts` — `exportFlightsXlsx` (6 new columns, reordered) and `exportFlightsPdf` (tratta/orari/PIC columns, `dec./att.` replaces `landings`, proportional `width`s) both now import and reuse `flightPicPerson`.
- `src/server/services/exports.service.test.ts` — xlsx/PDF flight mocks brought to post-11.1 shape; 3 new tests (historical-null xlsx row, SCHOOL-dual PIC xlsx row, SCHOOL-dual PIC PDF row); route/times/movements/PIC assertions added to the PDF suite.
- `src/server/adapters/pdf/document.tsx` — `PdfColumn<T>` gained an optional `width` (relative flex weight, default 1, backward compatible); `headerCell`/`cell` styles apply it per column.
- `messages/it.json`, `messages/en.json` — new `FlightsPage.list.table` keys: `departure`, `arrival`, `takeoffTime`, `landingTime`, `takeoffs`.
- `src/app/[locale]/dashboard/people/account-panel.tsx` — recent-movements `effectiveDate` via `formatDateOnly`.
- `src/app/[locale]/dashboard/people/[id]/account/account-statement-table.tsx` — statement date column + adjustment/reversal badge dates via `formatDateOnly`; new `moneyLocale` prop on `AdjustmentForm`.
- `src/app/[locale]/dashboard/people/expiries-panel.tsx` — `issuedAt`/`expiresAt` via `formatDateOnly` (new `useLocale()` in `ExpiryRow`).
- `src/app/[locale]/dashboard/expiries/page.tsx` — dashboard row `issuedAt`/`expiresAt` via `formatDateOnly`.
- `src/app/[locale]/dashboard/expiries/my-expiries.tsx` — own-scadenze row dates via `formatDateOnly` (new `useLocale()` in `MyExpiryRow`).
- `src/app/[locale]/dashboard/expiries/proposals-queue.tsx` — current/proposed dates (4 values) via `formatDateOnly` (new `useLocale()`).
- `src/app/[locale]/dashboard/finance/cash-register.tsx` — register date column + reverse-form dialog label via `formatDateOnly`.
- `src/app/[locale]/dashboard/aircraft/aircraft-manager.tsx` — rate-history `validFrom` via `formatDateOnly`.
- `src/app/[locale]/dashboard/people/instructor-rates-panel.tsx` — rate-history `validFrom` via `formatDateOnly`.
- `src/app/[locale]/dashboard/people/profiles-panel.tsx` — student `courseStartDate` (2 occurrences) via `formatDateOnly` (new `useLocale()` in `StudentSection`).
- `src/app/[locale]/dashboard/school/page.tsx` — own-student roster `courseStartDate` via `formatDateOnly` (aligned with the adjacent `lastNoteDate` cell, already correct).
- `e2e/exports.spec.ts` — xlsx header array (15 columns) + cell indices updated; new assertions for partenza/arrivo/ora-decollo/decolli/atterraggi/PIC.
- `e2e/aircraft-rates.spec.ts`, `e2e/instructor-rates.spec.ts` — rate-history date assertions converted to `DD/MM/YYYY` via a new local `ddmmyyyy()` helper.
- `e2e/person-profiles.spec.ts` — `courseStartDate` display assertions converted to `DD/MM/YYYY`.
- `e2e/school.spec.ts` — own-student roster `courseStartDate` assertion converted to `DD/MM/YYYY`.
- `e2e/expiry-registration.spec.ts` — new `addDaysDisplay()` helper; 8 display assertions across the propose/approve/reject flow converted to `DD/MM/YYYY` (API payload and `<input type="date">` fills stay on `addDaysUtc()`, unchanged).
