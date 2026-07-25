---
baseline_commit: ea917a1
---

# Story 13.8: Shell & misc trasversali — switcher lingua, icone sidebar, label reports, rimozione logo, precompile scadenze

Status: review

## Story

As a utente dell'app (ogni ruolo),
I want cambiare lingua dalla shell, icone sidebar coerenti, label dei report leggibili e un'impostazione club senza il campo logo inutilizzato,
so that la shell sia completa e le Impostazioni riflettano ciò che l'app usa davvero.

**Riferimenti vincolanti**: piano `docs/superpowers/plans/2026-07-22-epic-13-ui-feedback.md` (Task 8).

**Ratifiche PO (AskUserQuestion 2026-07-25)**: (a) item "reports month labels" = problema di LAYOUT confermato dall'utente (label compresse/sovrapposte nel bar chart) — NESSUN difetto nei nomi (`reports/page.tsx#shortMonthLabel` è UTC-parsed e locale-driven, ricognizione confermata); (b) il follow-up **F2 della review 13.3** (precompile data scadenza da `ExpiryType.validityMonths` nel `LiveExpiryEditor` condiviso) è ACCORPATO a questa story come AC dedicato.

## Acceptance Criteria

1. **(Switcher lingua IT/EN)** Nella top bar (`top-bar.tsx:62`), accanto al `ThemeToggle` e con la stessa taglia/stile di controllo, un controllo per passare IT↔EN che PRESERVA il pathname corrente (pattern già in app: `Link` di `@/i18n/navigation` con `locale={otherLocale}`, v. `ppr/page.tsx:52,69` — nel dashboard non esiste alcuno switcher oggi). Convenzione di casa: niente `useTranslations` nei client component — label/aria risolte server-side in `layout.tsx` e passate via prop. Nota icone: in `icons.tsx` NON esiste un 'globe' — decidere al dev tra chip testuale "IT/EN" (coerente col prototipo AirOps) o nuova icona; coerenza visiva col `ThemeToggle` adiacente.
2. **(Icone sidebar — aereo piccolo per Flotta)** `route-registry.ts:78`: `fleet` passa da `icon: 'fleet'` a `icon: 'plane'` (stessa icona che Movimenti usa già, `route-registry.ts:72` — item utente: "aereo piccolo per entrambe"). Verificare che la glifa `fleet` in `icons.tsx` resti usata altrove o segnalarla come orfana (non rimuoverla se fuori scope).
3. **(Reports — leggibilità label mesi)** Fix di LAYOUT (ratifica a): le label dell'asse X del bar chart in `reports-console.tsx` non devono comprimersi/sovrapporsi (verifica anche a viewport stretti ragionevoli per desktop — il mobile pass è 13.10). NESSUNA modifica a `shortMonthLabel`/logica date.
4. **(Rimozione logo club — UI + backend)** Il campo logo sparisce da `settings-form.tsx` (resta il solo nome; attenzione: `pdf-exports.spec.ts` pilota i testid di questo form) e dal backend: `airfieldBrandingSchema`/`AirfieldBrandingDto` perdono `logoDataUrl` (`src/lib/schemas/settings.ts` + `registry.ts` + `registry.test.ts` — wire change ratificato dalla punch-list), `getAirfieldBranding`/`setAirfieldBranding` diventano name-only (`app-settings.service.ts:174` + `AIRFIELD_LOGO_KEY`), l'adapter PDF (`src/server/adapters/pdf/document.tsx` + test) e i 6 call-site di `exports.service.ts` passano a branding name-only, `/ppr` (mark pubblico, `ppr/page.tsx:49`) e ogni altro consumer (`dashboard/layout.tsx:81`, `dashboard/page.tsx:182`, `logbook/page.tsx:102`, `settings/page.tsx:134`, route `settings/airfield`) fanno fallback al solo nome. Sweep i18n: chiavi `logo*` di SettingsPage rimosse SPECULARMENTE da it.json/en.json. La riga `AppSetting` `airfield.logo` eventualmente presente resta orfana nel DB (nessuna migrazione distruttiva richiesta) — ma il seed non deve più scriverla (verificare).
5. **(Precompile data scadenza — F2 review 13.3, ratifica b)** Nel `LiveExpiryEditor` condiviso (`src/components/dashboard/expiry-editor.tsx`): selezionando un `ExpiryType` con `validityMonths` valorizzato, il campo data si precompila a oggi+validityMonths (comportamento che il vecchio form a pagina aveva e che la 13.3 ha perso — feature-loss F2). La data resta EDITABILE (il precompile è un default, non un vincolo); tipo senza `validityMonths` → nessun precompile. Beneficia scheda persona + Piloti + Istruttori (stesso componente).
6. **(e2e + skill UI)** e2e: switcher lingua (click reale → URL/locale cambiano, pathname preservato), icona fleet, form settings senza logo (aggiornare gli spec che oggi toccano il logo — `pdf-exports.spec.ts` e affini — SENZA indebolire le altre assert), precompile scadenza (AC5). Selettori scoped/exact, mai hasText con date/H:MM. Skill: karpathy-guidelines + design-taste-frontend + ui-ux-pro-max; coerenza AirOps; verifica interattiva Playwright (MCP; fallback throwaway /tmp).

## Contesto (puntatori — ricognizione 2026-07-25, HEAD 418ce9f)

- Top bar: `src/components/shell/top-bar.tsx` (ThemeToggle a :62; client component, strings-by-prop). Switcher esistente da imitare: `src/app/[locale]/ppr/page.tsx:52,69`.
- Icone: `src/components/ui/icons.tsx` (`plane` :21, `fleet` :48; nessun `globe`).
- Reports: `src/app/[locale]/dashboard/reports/page.tsx:18-23` (`shortMonthLabel`, nessun difetto date) + `reports-console.tsx` (bar chart).
- Logo: consumer completi mappati sopra in AC4 (grep `getAirfieldBranding|AIRFIELD_LOGO_KEY` — 8 file src + 4 test file con `logoDataUrl`).
- **Ambiente**: identico alle story precedenti (DB fresco al dispatch, gates prima del commit, e2e foreground, MAI push, MAI playwright install, NON toccare package.json). Commit: `feat(13.8): shell & misc — switcher lingua, icone sidebar, reports, rimozione logo, precompile scadenze` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.
- Precompile (AC5): `src/components/dashboard/expiry-editor.tsx`; `ExpiryType.validityMonths` già nel modello Prisma; il vecchio comportamento di riferimento era nel form della pagina `people/{id}` pre-13.3 (v. git history se serve).

## Fuori scope dichiarato

- Dark theme (13.9) e mobile (13.10): niente regressioni, ma la revisione trasversale è là.
- Ritiro stack legacy (13.11).
- Qualunque altra card di Impostazioni oltre alla parte identity (logo).

## Dev Agent Record

### Implementation Plan

1. **AC1 — switcher lingua**: `top-bar.tsx` resta client-only (nessun `useTranslations`). Locale corrente via `useLocale()` (`next-intl`, GIA' usato in client component altrove — `calendar-popover.tsx`, `my-expiries.tsx` — non è una lookup di messaggi, quindi non viola la convenzione). `otherLocale` calcolato client-side; `Link` di `@/i18n/navigation` con `href={pathname}` (stesso `pathname` già letto da `usePathname()` per il breadcrumb) e `locale={otherLocale}` preserva la route corrente. Aria/title (`localeSwitchLabel`) risolti server-side in `dashboard/layout.tsx` via `t('localeSwitch.label')`, passati come prop — nuova chiave i18n `shell.localeSwitch.label` speculare IT/EN. Verifica: `npx tsc --noEmit` pulito, verifica interattiva Playwright (screenshot + click reale IT↔EN con pathname preservato).
2. **AC2 — icona fleet**: one-liner in `route-registry.ts:78`, `icon: 'fleet' → 'plane'`. Verificato via script Playwright: `Icon.fleet` (glifa in `icons.tsx`) non è più referenziata da nessuna voce di `NAV_ITEMS` → ORFANA (segnalata sotto, non rimossa: fuori scope).
3. **AC3 — reports label leggibilità**: diagnosi con screenshot reali (viewport 1024–1920, period=year, 12 barre) — l'"Ore volate" (BarChart nella colonna stretta `1fr` di `.split{grid-template-columns:2fr 1fr}`) mostrava glifi compressi in orizzontale (fino a ~8px di larghezza per "Ago" contro i ~19-24px del "Ricavi" nella colonna larga) perché il testo era un `<text>` SVG dentro un `viewBox` fisso (600 unità) scalato NON uniformemente (`preserveAspectRatio="none"`, altezza CSS fissa, larghezza fluida) — la larghezza del carattere scala con il contenitore, l'altezza no. Fix chirurgico in `bar-chart.tsx`: le label escono dall'SVG e diventano una riga HTML reale (`grid` con una colonna per barra, stesso inset percentuale derivato da `pad`) sotto il grafico — font-size reale, mai scalato dal viewBox. ZERO modifiche a `shortMonthLabel`/logica date (`reports/page.tsx` intatto). Verifica: screenshot prima/dopo a 1024/1280/1366/1440/1600/1920px + misura programmatica `getBoundingClientRect()` (0 collisioni prima E dopo, ma larghezza glifo prima ~8px dopo colonna piena ~26px).
4. **AC4 — rimozione logo**: sweep completo (v. File List) — schema (`airfieldBrandingSchema` name-only), registry OpenAPI + test, servizio (`getAirfieldBranding`/`setAirfieldBranding` → singola chiave `airfield.name`, `AIRFIELD_LOGO_KEY` rimossa), adapter PDF (`PdfReportDocumentProps.branding` name-only, `<Image>` rimosso), `exports.service.ts` (`toPdfExport`'s branding type), UI (`settings-form.tsx` riscritto name-only, `club-card.tsx`/`page.tsx` prop type), i18n (chiavi `club.form.logo*` rimosse speculari IT/EN), e2e (`pdf-exports.spec.ts` aggiornato, stesso testid `airfield-settings-form`/`airfield-name-input`/`airfield-settings-save`/`airfield-settings-feedback`, nessun indebolimento delle altre assert). Verificato con grep finale: zero riferimenti a `logoDataUrl`/`AIRFIELD_LOGO_KEY`/`airfield-logo` restanti nel codice (a parte i doc-comment che raccontano la rimozione). Seed: verificato che né `seed.ts` né `seed-demo.ts` scrivevano `airfield.logo` — già vero prima di questa story, nessuna modifica necessaria.
5. **AC5 — precompile scadenza**: portato in `expiry-editor.tsx` lo stesso calcolo del form pre-13.3 (`today + validityMonths`, clamp all'ultimo giorno reale del mese target) usando gli helper GIA' esistenti `@/lib/date-only` (`todayDateOnlyUtc`/`addMonthsClampUtc`/`toDateOnlyString` — zero nuovo codice di date-math). `ExpiryCatalogEntry` esteso con `validityMonths: number | null` (il campo è GIA' nel payload reale di `GET /api/v1/expiry-types`, solo il tipo TS non lo esponeva). Precompile SOLO alla selezione del chip (non al deselezionare), campo resta uno state normale quindi resta editabile. `NewExpiryChipGroup`/`NewPersonForm` (wizard di creazione persona, `pilot-editor.tsx`) NON toccato: la story delimita esplicitamente lo scope al `LiveExpiryEditor` condiviso — segnalato in Note per il reviewer.
6. **AC6 — e2e**: nuovo file `e2e/shell-misc.spec.ts` (switcher lingua round-trip IT→EN→IT con pathname preservato; icona fleet, confronto `svg.innerHTML()` fleet vs movements, con sanity-check negativo contro piloti per escludere falsi positivi). `e2e/expiry-registration.spec.ts`: sostituita la NOTE che documentava la copertura droppata in 13.3 con un test reale (precompile 24 mesi con clamp, editabilità, e nessun precompile senza validityMonths) — helper locali `addMonthsUtc`/`todayUtc` (mai import di codice server negli e2e, stessa convenzione di `addDaysUtc`). `e2e/pdf-exports.spec.ts` aggiornato per AC4. Selettori: scoped al landmark `navigation[name="Aree operative"]` o exact-match su testid, mai `hasText` su date/orari.

### Completion Notes

- Tutti gli AC implementati e verificati (screenshot reali per AC1/AC3, comparazione programmatica DOM per AC2, sweep grep per AC4, e2e dedicati per AC1/AC2/AC5, e2e aggiornati per AC4).
- `npm run gates`: PASS (lint, typecheck, 1446 test unitari, build).
- e2e toccati/correlati (`shell-misc.spec.ts`, `expiry-registration.spec.ts`, `pdf-exports.spec.ts`, `reports.spec.ts`, `settings.spec.ts` via progetto `settings --no-deps`): 24 test totali, tutti PASS su server "caldo" (vedi nota ambientale sotto).
- **Nota ambientale (non un difetto della story)**: su questa macchina Fedora locale, `next dev` (Turbopack) sotto contesa multi-worker Playwright soffre di flakiness da "cold compile" — la primissima richiesta a una route non ancora compilata può superare i 5s del timeout di default di `expect().toHaveURL()`, facendo fallire il login iniziale di un test SENZA alcuna relazione con le modifiche di questa story. Riprodotto anche su file COMPLETAMENTE non toccati da questa story (`account-adjustments.spec.ts`) lanciati in coppia — prova che è una caratteristica dell'ambiente, non una regressione. Mitigazione usata per la verifica: pre-scaldare il dev server (alcune navigazioni autenticate reali) prima di lanciare gli e2e, che poi passano in modo affidabile. `npm run gates` non esegue e2e (solo lint/typecheck/vitest/build), quindi questo non blocca il gate.

### File List

- `src/components/shell/top-bar.tsx` — switcher IT/EN (AC1); preserva la query string (fix review F1)
- `src/app/[locale]/dashboard/layout.tsx` — prop `localeSwitchLabel` (AC1)
- `messages/it.json`, `messages/en.json` — chiave `shell.localeSwitch.label` (AC1); rimozione chiavi `SettingsPage.club.form.logo*` (AC4)
- `src/components/shell/route-registry.ts` — icona fleet → `plane` (AC2)
- `src/components/charts/bar-chart.tsx` — label asse X fuori dall'SVG (AC3); `aria-hidden` sulla riga label (fix review F7)
- `src/components/charts/line-chart.tsx` — label asse X fuori dall'SVG, `aria-hidden` (fix review F2/F7)
- `src/lib/schemas/settings.ts` — `airfieldBrandingSchema` name-only (AC4); doc-comment `airfield.logo` rimosso (fix review F3)
- `src/lib/schemas/registry.ts`, `src/lib/schemas/registry.test.ts` — OpenAPI + test name-only (AC4); description `airfield.logo` rimosso (fix review F3)
- `src/server/services/app-settings.service.ts`, `src/server/services/app-settings.service.test.ts` — `getAirfieldBranding`/`setAirfieldBranding` name-only (AC4)
- `src/server/adapters/pdf/document.tsx`, `src/server/adapters/pdf/document.test.ts` — branding name-only, `<Image>` rimosso (AC4)
- `src/server/services/exports.service.ts`, `src/server/services/exports.service.test.ts` — `toPdfExport` branding type (AC4)
- `src/app/[locale]/dashboard/settings/settings-form.tsx` — riscritto name-only (AC4)
- `src/app/[locale]/dashboard/settings/club-card.tsx` — prop type name-only (AC4)
- `src/app/[locale]/dashboard/settings/page.tsx` — label logo* rimosse (AC4)
- `src/app/api/v1/settings/club/route.ts` — doc-comment aggiornato (AC4)
- `e2e/pdf-exports.spec.ts` — test logo → name-only (AC4)
- `src/components/dashboard/expiry-editor.tsx` — precompile data scadenza (AC5)
- `e2e/expiry-registration.spec.ts` — nuovo test precompile (AC5/AC6)
- `e2e/shell-misc.spec.ts` — nuovo file, switcher lingua + icona fleet (AC1/AC2/AC6); test query-preservation aggiunto (fix review F1)

### Note per il reviewer (assunzioni esplicite)

- **AC1, scelta chip testuale vs icona**: `icons.tsx` non ha un `globe`. Scelto un chip testuale (classe `.iconbtn` esistente, stessa dimensione/bordo/hover del `ThemeToggle` adiacente, contenuto = codice ISO del locale TARGET in maiuscolo — "EN" quando sei in IT, coerente col pattern già in `/ppr` dove `t('switchTo')` mostra il nome del locale target, non quello corrente). Alternativa scartata: disegnare una nuova icona `globe` nel set — più invasivo (tocca `icons.tsx`, file condiviso da tutta l'app) per un guadagno visivo marginale rispetto a un chip mono coerente con lo stile "badge" già presente nell'app.
- **AC2, orfano `Icon.fleet`**: dopo il cambio, la glifa `fleet` in `icons.tsx` (e la entry `'fleet'` nel literal union `NavIconKey`) non è più raggiunta da nessuna voce di `NAV_ITEMS` — verificato via grep e via script Playwright (nessun altro consumer nel codebase). Lasciata al suo posto (fuori scope, la story lo richiede esplicitamente) — candidata per il ritiro nella story 13.11 o in un cleanup dedicato.
- **AC4, superfici del sweep che meritano attacco in review**: (a) `PUT /api/v1/settings/airfield` non fa più `.strict()` sul body — un client che mandasse ancora `logoDataUrl` verrebbe silenziosamente IGNORATO da Zod (comportamento di default, non introdotto da questa story) invece di un 422; è il comportamento wire-contract ratificato dalla punch-list, ma vale la pena controllare che nessun altro consumer interno si affidi ancora al campo. (b) La riga `AppSetting` `airfield.logo` (se presente da installazioni pre-13.8) resta orfana nel DB per design (nessuna migrazione distruttiva) — confermato che il seed non la scrive (mai lo ha fatto). (c) I 6 call-site di `toPdfExport` in `exports.service.ts` non hanno richiesto modifiche di codice (solo la firma del parametro `branding` è cambiata) perché passano sempre la variabile `branding` (mai un literal) — compatibilità strutturale TypeScript, verificata con `tsc --noEmit`.
- **AC5, scope deliberatamente ristretto**: il precompile è stato aggiunto SOLO al `LiveExpiryEditor` condiviso, come esplicitamente delimitato dalla story ("Beneficia scheda persona + Piloti + Istruttori, stesso componente"). Il form di CREAZIONE persona (`NewExpiryChipGroup` dentro `pilot-editor.tsx`'s `NewPersonForm`, story 13.2) usa lo stesso `ExpiryCatalogEntry[]` ma un flusso di selezione/state completamente separato e NON precompila — non è stato toccato. Segnalo perché è una superficie sorella facilmente confondibile con quella in scope: se il PO la considera un gap, è materiale per una story successiva, non una svista di questa.
- **Ambiente**: la flakiness e2e da "cold compile" di `next dev` sotto Playwright multi-worker (vedi Completion Notes) è stata riprodotta anche su spec NON toccate da questa story — non è una regressione introdotta qui.

### Fix post-review (2026-07-25)

Applicati i finding F1/F2/F3/F7 della review adversarial (v. Review Record sotto). F4/F5 sono decisioni PO/note senza codice.

- **F1 (major) — query string persa dallo switcher lingua**: `top-bar.tsx` ora legge `useSearchParams()` (`next/navigation`) e passa `<Link href={{ pathname, query: Object.fromEntries(searchParams.entries()) }} locale={otherLocale} …>` (stessa forma-oggetto già usata in `reports/page.tsx:112,120`) invece di `href={pathname}`. Nessun boundary `Suspense` richiesto: `npm run gates` (build compreso) resta verde senza modifiche — il layout `dashboard` è già dinamico/session-gated, quindi la route non viene mai prerenderizzata staticamente. Verifica reale: script scratchpad (adattato da `rev-ac1b.cjs` del reviewer) su build di produzione, click reali → le 6 rotte con query string riportate dal reviewer ora leggono `query kept: YES` (bookings?view=week&date, reports?period, billing?type&page, expiries?window, movements?status, più il caso `pilots?page&q` dell'href SSR/DOM). Nuovo test e2e `e2e/shell-misc.spec.ts` ("preserves the query string … round-trip (review F1)"): naviga `/it/dashboard/bookings?view=week&date=2026-08-05`, click sullo switcher, assert `/en/dashboard/bookings?view=week&date=2026-08-05`, click di nuovo, assert ritorno a `/it/…` con la stessa query — verde.
- **F2 (minor) — LineChart "Ricavi" con label ancora dentro l'SVG scalato**: stesso fix chirurgico già applicato al `BarChart` per AC3, esteso a `line-chart.tsx`: le label escono dall'SVG in una riga HTML sotto il grafico. I punti del `LineChart` sono a `i/(n-1)` (non colonne `1fr`), quindi la riga usa `display:flex; justify-content:space-between` sullo stesso inset `pad`-derivato (`padPercent`) invece del `grid` a colonne del BarChart. Misura programmatica (script scratchpad, stesso pattern di `rev-ac3.cjs` del reviewer ma con i marker `<circle>` del LineChart al posto dei `<rect>`): `maxAlignDelta` = **7.39px, costante a 1201/1440/1920/375px** (= metà della larghezza di un glifo monospace a 9px, `glyphBoxW=14.8` — l'offset non dipende dal viewport, a differenza della distorsione precedente che cresceva con la larghezza). A 375px le label sono a grandezza reale (non scalate, `glyphBoxW` invariato) con `minGap≈2px`, leggibilità paragonabile al BarChart fixato (F8, `minGap=1.83px` alla stessa viewport). Screenshot prima/dopo a 1201/1440/1920/375 confermano le label non più "stirate" a viewport larghi.
- **F3 (minor) — doc OpenAPI/schema citavano ancora `airfield.logo`**: rimossa la clausola `/airfield.logo` da `src/lib/schemas/registry.ts:1767` (description SERVITA in `/api/v1/openapi.json`, endpoint pubblico) e da `src/lib/schemas/settings.ts:25` (doc-comment interno). Verifica runtime: `curl http://localhost:3000/api/v1/openapi.json` → `airfield.logo in doc: false` (prima del fix: `true`), `logoDataUrl in doc: false` (invariato).
- **F7 (note) — label row nell'albero a11y**: aggiunto `aria-hidden="true"` alla riga HTML delle label sia in `bar-chart.tsx` sia nella nuova riga di `line-chart.tsx`, ripristinando la semantica pre-story (il grafico resta interamente decorativo, coerente con l'SVG `role="img" aria-hidden="true"` già esistente). Verifica: `ariaSnapshot()` (script scratchpad, pattern `rev-a11y.cjs`) sulle card "Ore volate" e "Ricavi" ora mostra solo `text: <titolo> <sub> · <unità>`, zero abbreviazioni di mese nell'albero di accessibilità.
- **F4/F5**: nessun codice — v. Review Record.

Verifica trasversale post-fix: `npm run gates` verde (lint/typecheck/1446 test/build); sweep console browser (stesse pagine del reviewer + round-trip switcher) → 0 errori/warning; e2e mirati (`shell-misc.spec.ts` 3/3, `expiry-registration.spec.ts`, `pdf-exports.spec.ts` 9/9, `reports.spec.ts` 5/5) verdi contro il build di produzione.

## Review Record

### Review adversarial (Opus 5 xhigh — 2026-07-25)

**Verdetto**: shippable-with-fixes.

**Priority zero**: full suite CI=1 su build di produzione, DB fresco — VERDE **254/254** (8.3m, 0 flake, 0 retry). Catena serializzata confermata via grep sul log: `settings.spec.ts` 6/6 ✓ e `booking-window.spec.ts` 3/3 ✓, entrambi dopo il progetto `chromium` come da `playwright.config.ts`. Delta esatto vs baseline 251 = **+3**, tutto spiegato: `shell-misc.spec.ts` nuovo (+2), `expiry-registration.spec.ts` +1 (precompile), `pdf-exports.spec.ts` invariato 9→9 (test del logo riscritto in-place name-only, nessuna assert indebolita — verificato via `git diff` sulle sole righe rimosse: tutte e sole coperture della feature eliminata).

**Gates**: PASS lint · PASS typecheck · PASS test 1446/1446 · PASS build. Sweep console browser (5 pagine + round-trip switcher): 0 errori/warning.

**Findings**:
- **F1 (major)** — lo switcher lingua butta via la query string (`href={pathname}` senza `useSearchParams`), verificato su 11 pagine/6 rotte con click reali su build di produzione. → **FIXATO** (`useSearchParams` + `Link` object-form, e2e query-preservation dedicato).
- **F2 (minor)** — il `LineChart` "Ricavi" della stessa riga reports aveva ancora le label dentro l'SVG `viewBox` scalato (stessa causa già risolta nel `BarChart` per AC3) — distorte a desktop, illeggibili a 375px. → **FIXATO per estensione** (stesso pattern, adattato a `justify-content:space-between` per i punti a `i/(n-1)`; pattern 13.6-F2/13.7-F1 di "estendere il fix al gemello").
- **F3 (minor)** — il documento OpenAPI pubblico e un doc-comment interno citavano ancora la chiave `airfield.logo` dopo la sua rimozione (AC4). → **FIXATO** (2 righe, una per file).
- **F4 (po-decision)** — il wizard di creazione persona (`NewExpiryChipGroup` in `pilot-editor.tsx`'s `NewPersonForm`) non precompila la data scadenza, mentre le 3 superfici del `LiveExpiryEditor` condiviso (people/{id}, Piloti, Istruttori) sì — comportamento dichiarato/scope ristretto dal dev, non una svista. **Decisione PO (2026-07-25): ACCETTATO DEFINITIVAMENTE, nessun follow-up.**
- **F5 (note)** — `PUT /api/v1/settings/airfield` non è `.strict()`: un body con `logoDataUrl` viene ignorato in silenzio (200) invece di rifiutato (422); comportamento pre-esistente (lo schema non è mai stato strict), non introdotto da questa story. **ACCETTATO**, nessuna azione.
- **F6 (note)** — la glifa `Icon.fleet` e la entry `'fleet'` di `NavIconKey` sono ormai orfane (nessun consumer dopo il cambio icona AC2) — confermato, lasciate al loro posto per design (fuori scope). **In carico alla story 13.11** (ritiro stack legacy).
- **F7 (note)** — la nuova riga HTML delle label del `BarChart` entrava nell'albero di accessibilità come testo nudo (12 abbreviazioni di mese senza valori), mentre prima della 13.8 erano dentro l'SVG `aria-hidden`. → **FIXATO** (`aria-hidden` sulla riga label di `bar-chart.tsx` e sulla nuova riga di `line-chart.tsx`, ripristino della semantica pre-story).
- **F8 (note)** — a 375px il `BarChart` ha `minGap=1.83px` tra le label (nessuna sovrapposizione, ma è il caso limite più stretto misurato). Nessuna azione richiesta in questa story (il mobile pass è la 13.10) — **soglia di partenza documentata per la 13.10**.

**Dev Notes chiuse** (verificate empiricamente dal reviewer, tutte confermate): scelta del chip testuale target-locale per lo switcher (coerente col pattern `/ppr`) CONFERMATA; `useLocale()` in client component legittimo (precedenti reali: `calendar-popover.tsx`, `my-expiries.tsx`, `instructor-rates-panel.tsx`) CONFERMATO; il seed non ha mai scritto `airfield.logo` CONFERMATO; nessuna deviazione non dichiarata nel diff del file story.

**Esito fix**: F1/F2/F3/F7 applicati in questo stesso giro (v. "Fix post-review" sopra nel Dev Agent Record) e riverificati su build di produzione (script scratchpad + e2e dedicati). F4/F5/F6/F8 restano note/decisioni senza codice, registrate qui.
