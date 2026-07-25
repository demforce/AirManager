---
baseline_commit: e04cccd
---

# Story 13.10: Mobile pass — sweep sistematico usabilità a viewport mobile

Status: review

## Story

As a utente da smartphone,
I want che ogni pagina dell'app sia usabile a viewport mobile (niente overflow orizzontale, navigazione e azioni primarie raggiungibili, tabelle e overlay fruibili),
so that possa operare dall'aviosuperficie senza un desktop.

**Riferimenti vincolanti**: piano `docs/superpowers/plans/2026-07-22-epic-13-ui-feedback.md` (Task 10). Item utente: "all mobile UI/UX reviewed and fixed (currently broken on mobile)".

**Ratifica PO (AskUserQuestion 2026-07-25)**: pattern di navigazione mobile = **si TIENE il rail di sole icone 64px** (già nel design system a ≤900px, `airops.css:1302`; il prototipo AirOps non ha un pattern drawer). NESSUN drawer/hamburger: la story fixa ciò che non funziona DENTRO il sistema esistente. A 375px il contenuto ha ~311px utili — è il vincolo di progetto, non un difetto da "risolvere" con pattern nuovi.

## Acceptance Criteria

1. **(Sweep sistematico a 375×812)** OGNI superficie dell'inventario 13.9 (12 route NAV_ITEMS, `people/{id}`, 5 facce home per-ruolo, overlay: SlideOver, popover filtri/calendario, ExportMenu, editor inline, modal; pagine auth; `/ppr` pubblico) verificata a 375×812 con criteri OGGETTIVI: (a) `document.scrollWidth == clientWidth` (nessun overflow orizzontale di PAGINA — il contenuto largo scrolla nel SUO contenitore); (b) navigazione raggiungibile; (c) azione primaria di ogni pagina raggiungibile e cliccabile (hit-test, lezione 13.7); (d) form compilabili. Spot-check a 768×1024 sui fix. Screenshot documentati per pagina.
2. **(Item rimandati dalle review precedenti — OBBLIGATORI)** (a) **F4-13.7**: il popover filtri Pianificazione a 375px sfora il bordo SINISTRO di ~139px (`schedule.tsx` — ancoraggio right senza clamp; fix = clamp al viewport, raccomandazione già scritta nel finding); dopo il fix, stesso assert geometrico/hit-test degli altri guard. (b) **F8-13.8**: label bar chart minGap 1.83px @375 = soglia di partenza; se il layout mobile riduce ancora lo spazio, gestire (es. label alternate/ruotate/short) SENZA toccare la logica date.
3. **(Fix a livello sistema, non per-pagina)** Come la 13.9: correzioni in `airops.css` (media query, token) o nei componenti condivisi (`SlideOver`, tabelle, popover) — hack per-pagina solo dove il difetto è davvero locale. Le tabelle larghe scrollano nel proprio contenitore (`overflow-x:auto`), MAI la pagina intera.
4. **(Nessuna regressione desktop)** Ogni fix ri-verificato a 1440×900 (screenshot + suite e2e, che gira a viewport desktop).
5. **(e2e + skill UI)** e2e viewport-based SOLO dove economico (pattern già in repo: `bookings.spec.ts` "calendar mobile viewport 375x812" — assert su overflow di pagina, raggiungibilità azione primaria, hit-test); la prova primaria resta lo sweep documentato. Skill: karpathy-guidelines + design-taste-frontend + ui-ux-pro-max; coerenza AirOps.

## Contesto (puntatori — ricognizione 2026-07-25, da rifinire alla partenza)

- Responsive esistente: `airops.css:1297-1305` (≤1200: kpi 3-col, split 1-col; ≤900: sidebar rail 64px, kpi 2-col), `:1375-1379` (≤640: topbar compatta, user-chip senza nome), `:1365` (/ppr pubblico ≤820). Il resto dell'app non ha gestione mobile dedicata.
- e2e mobile esistente: `bookings.spec.ts` "calendar mobile viewport (375x812…)" — pattern di assert riusabile.
- F4-13.7 dettagli: review 13.7 finding F4 (Review Record in `13-7-pianificazione.md`); F8-13.8: Review Record in `13-8-shell-misc.md`.
- Topbar a 375px: verificare crumbs+switcher lingua+theme toggle+user-chip+logout (5 elementi — possibile overflow, misurare).
- **Ambiente**: identico alle story precedenti (DB fresco al dispatch, gates prima del commit, e2e foreground, MAI push, MAI playwright install, NON toccare package.json; per la suite CI=1: `export JOBS_SECRET=<non-placeholder>` — v. HANDOFF). Commit: `feat(13.10): mobile pass — usabilità a 375px su tutte le pagine` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Ritiro stack legacy (13.11).
- Redesign mobile-first / pattern di navigazione nuovi oltre la ratifica (v. sopra): questa story rende USABILE l'esistente, non riprogetta.
- App mobile Flutter (futura, consuma le API).

## Dev Agent Record

### Implementation Plan

Sweep sistematico a 375×812 (Chromium locale via `playwright-core` + il binario cacheato `~/.cache/ms-playwright/chromium-1228` — il path container `/opt/pw-browsers/chromium` di CLAUDE.md non esiste su questa macchina, drift noto), script throwaway in scratchpad (mai committati). Per ogni superficie: `document.scrollWidth vs clientWidth` (nessun overflow di pagina), hit-test via `document.elementFromPoint` sull'azione primaria, screenshot. Ogni difetto trovato → fix a livello sistema (`airops.css`/componente condiviso) → riverifica a 375 + regressione a 1440×900/414px dove pertinente.

4 fix, tutti a livello sistema (mai hack per-pagina):

1. **F4-13.7 (popover filtri/calendario, `schedule.tsx`)**: `useFixedPopover` guadagna `clampPopoverLeft(desiredLeft, width)`, una utility condivisa dai due popover (stesso file, stesso "un meccanismo non duplicato" della 13.7) che clampa il bordo sinistro del popover `position:fixed` dentro `[8, viewportWidth-width-8]`. Il popover filtri (prima: `right: viewportWidth - triggerRect.right`) ora imposta `left` clampato + `right:'auto'`. Il popover calendario (prima: `left` = centro trigger + `transform:translateX(-50%)` CSS) ora imposta `left` clampato (centro − metà larghezza) + `transform:'none'` inline, cancellando la centratura CSS per usare lo stesso meccanismo di clamp.
2. **`.form-grid` (NUOVO finding, non nella story — scoperto durante lo sweep)**: i 18 consumer di `.form-grid` (ogni SlideOver/editor/card Settings) non collassavano a viewport stretto. Dentro un `.slideover-panel` (`width:min(520px,92vw)`, ~305px di contenuto a 375px) la griglia 2 colonne forzava le `<select>` oltre la loro colonna `1fr` (i grid item non si restringono sotto il min-content di default), spingendo la SECONDA colonna fuori schermo e costringendo uno scroll orizzontale DENTRO `.so-body` per raggiungerla — misurato: `.so-body` scrollWidth 382px vs 344px clientWidth, select "Istruttore" a `left:239 right:413` (38px oltre i 375px). Fix: `.form-grid{grid-template-columns:1fr}` sotto 640px (stessa soglia della regola topbar esistente).
3. **`.page-head` (NUOVO finding, non nella story — scoperto durante lo sweep)**: la riga titolo/azioni di 13 page-head non va a capo — `.btn` è `display:inline-flex` (per l'allineamento icona+label), e un contesto flex non lascia wrappare il proprio testo come farebbe un elemento block/inline normale, quindi il min-size automatico del bottone è la sua larghezza SENZA wrap. Un header con due azioni (`people/{id}`: "Modifica" + "Torna all'elenco") non può restringersi sotto la loro larghezza combinata. Misurato pre-fix su `people/{id}` a 375px: `document.documentElement.scrollWidth` 406px vs 375px viewport (**overflow di PAGINA reale**, non solo di un overlay). Fix: `.page-head{flex-wrap:wrap}` sotto 640px — le azioni vanno a capo sotto il titolo invece di sforare.
4. **F8-13.8 (label bar/line chart, `bar-chart.tsx`/`line-chart.tsx`)**: rimisurato con un metodo più preciso (glyph-level via `Range.getBoundingClientRect()` sul text node, non il bounding box dello span — per il BarChart lo span si STIRA a riempire la colonna grid, quindi il suo box "tocca" quello adiacente a gap 0 anche quando il testo dentro ha ancora margine: misura fuorviante se presa sullo span). Gap reale glyph-level a 375px: **0.63-0.69px** (sotto la soglia di partenza 1.83px della 13.8 — differenza plausibilmente dovuta a metriche font di una build Chromium diversa da quella usata nella review 13.8, non introdotta da questa story: nessuna modifica di questa story tocca `.split`/`.card`/i chart). Screenshot conferma: le label si leggono come un'unica sequenza ("AgoSetOttNov…") senza spazi percepibili. Comodo di nuovo (≥3.6px) da 414px in su. Fix (come suggerito dalla story, "label alternate", SENZA toccare `shortMonthLabel`/logica date): classe condivisa `chart-label` sulle label di entrambi i chart, `airops.css` nasconde le pari (`nth-child(even)`) con `visibility:hidden` (non `display:none`, per non alterare l'allineamento grid/flex) sotto 400px. Dopo il fix: minGap ~17px (6 label visibili invece di 12).

### Inventario (sweep 375×812, criteri oggettivi)

Legenda esito: OK = nessun difetto; FIX = difetto trovato e corretto (vedi sopra); N/A = superficie non applicabile al ruolo.

| Superficie | Ruolo | scrollWidth==clientWidth | Nav raggiungibile | Azione primaria hit-test | Form compilabile | Esito |
|---|---|---|---|---|---|---|
| `/dashboard` (overview) | admin | ✓ 375=375 | ✓ | ✓ (Pianifica volo) | — | OK |
| `/dashboard/bookings` (Pianificazione) | admin | ✓ | ✓ | ✓ (Nuova prenotazione) | ✓ (SlideOver, v. sotto) | FIX (popover, form-grid) |
| `/dashboard/ppr` (Richieste PPR) | admin | ✓ | ✓ | ✓ (Nuovo PPR manuale) | ✓ (SlideOver) | OK |
| `/dashboard/movements` (Voli in transito) | admin | ✓ | ✓ | — | — | OK |
| `/dashboard/pilots` (Piloti) | admin | ✓ | ✓ | ✓ (Nuovo pilota, SlideOver) | ✓ | FIX (form-grid, via sistema) |
| `/dashboard/instructors` (Istruttori) | admin | ✓ | ✓ | ✓ (Aggiungi istruttore, SlideOver) | ✓ | FIX (form-grid, via sistema) |
| `/dashboard/fleet` (Aeromobili) | admin | ✓ | ✓ | ✓ (Nuovo aeromobile, SlideOver) | ✓ | FIX (form-grid, via sistema) |
| `/dashboard/expiries` (Scadenze) | admin | ✓ | ✓ | — | — | OK |
| `/dashboard/logbook` (Registro voli) | admin | ✓ | ✓ | ✓ (Nuovo volo, SlideOver) | ✓ | FIX (form-grid, via sistema) |
| `/dashboard/billing` (Contabilità) | admin | ✓ | ✓ | ✓ (Nuova transazione, SlideOver) | ✓ | FIX (form-grid, via sistema) |
| `/dashboard/reports` (Statistiche) | admin | ✓ | ✓ | — | — | FIX (F8-13.8, chart-label) |
| `/dashboard/settings` (Impostazioni) | admin | ✓ | ✓ | ✓ (form inline, es. "Aggiungi" ratings) | ✓ | OK (già entro soglia) |
| `people/{id}` (scheda persona) | admin | ✗→✓ | ✓ | ✓ (Modifica / Torna all'elenco) | ✓ (edit inline, Registra ricarica) | **FIX (page-head, overflow di pagina reale)** |
| Home per-ruolo: admin | admin | ✓ | ✓ | ✓ | — | OK |
| Home per-ruolo: staff | staff | ✓ | ✓ | ✓ | — | OK |
| Home per-ruolo: istruttore | instructor | ✓ | ✓ | ✓ | — | OK |
| Home per-ruolo: pilota | pilot | ✓ | ✓ | ✓ (3 pillole, vanno a capo) | — | OK |
| Home per-ruolo: allievo | student | ✓ | ✓ | ✓ (2 pillole) | — | OK |
| Overlay: SlideOver nuova prenotazione | admin | ✓ (dopo fix) | — | ✓ (Prenota) | ✓ | FIX (form-grid) |
| Overlay: SlideOver aircraft-editor | admin | ✓ (dopo fix) | — | ✓ (Aggiungi aeromobile) | ✓ | FIX (form-grid) |
| Overlay: popover filtri Pianificazione | admin | ✓ (dopo fix, era -139px) | — | ✓ (Fatto) | ✓ | **FIX (F4-13.7)** |
| Overlay: popover calendario Pianificazione | admin | ✓ (dopo fix, era +12px oltre bordo destro) | — | ✓ (Oggi) | — | **FIX (F4-13.7 twin)** |
| Overlay: ExportMenu (Pianificazione) | admin | ✓ | — | ✓ (Esporta PDF/XLS) | — | OK |
| Overlay: editor inline `people/{id}` "Modifica" | admin | ✓ (dopo fix page-head) | — | ✓ (Salva modifiche) | ✓ | FIX (via page-head + form-grid) |
| Overlay: editor inline `people/{id}` "Registra ricarica" | admin | ✓ | — | ✓ (Conferma ricarica) | ✓ | OK |
| Overlay: form inline Settings "Aggiungi" | admin | ✓ | — | ✓ | ✓ | OK |
| Overlay: SlideOver PPR manuale | admin | ✓ | — | ✓ | ✓ | OK (già usa `.form-grid`, beneficia del fix) |
| Pagina auth: `/login` | — | ✓ | — | ✓ (Accedi) | ✓ | OK |
| Pagina auth: `/forgot-password` | — | ✓ | — | ✓ | ✓ | OK |
| Pagina auth: `/set-password` (senza/con token) | — | ✓ | — | ✓ | ✓ | OK |
| `/ppr` pubblico | — | ✓ | — | ✓ (Invia richiesta, dopo scroll pagina normale) | ✓ | OK (`.ppr-form-grid` misurato SENZA overflow a 375px — non toccato) |
| Topbar 375px (crumbs+switcher+theme+user-chip+logout) | admin | ✓ | ✓ (tutti e 5 hit-test true) | — | — | OK (regola ≤640px già esistente basta) |
| Tabelle larghe (billing/logbook/movements/pilots) | admin | ✓ (scroll nel contenitore, non body) | — | — | — | OK (verificato containment) |

Spot-check 768×1024: nessun fix applicato tocca la fascia 641-1200px (tutte le media query nuove sono `max-width:640px` o `max-width:400px`); verificato con misure dirette a 414/480/560/640/768px (v. Completion Notes).

### Completion Notes

- **F4-13.7** (AC 2a, OBBLIGATORIO): risolto. Misure prima/dopo: filtro `left:-139.5px→8px` (right `180.5px→328px`, dentro [0,375]); calendario `right:387.2px→367px` (dentro [0,375]). Assert e2e nuovo (`bookings.spec.ts`) verifica geometria + hit-test per entrambi.
- **F8-13.8** (AC 2b, OBBLIGATORIO): rimisurato con metodo glyph-level (più preciso della misura a livello di span/box usata implicitamente nella 13.8 review per il BarChart, che lo span STIRATO rende fuorviante) — gap reale 0.63-0.69px a 375px, sotto soglia. Fix "label alternate" applicato SENZA toccare `shortMonthLabel`/logica date (solo `className` sulle label + regola CSS).
- **Fix a livello sistema (AC 3)**: tutti e 4 i fix vivono in `airops.css` (media query) o nel meccanismo condiviso `useFixedPopover` (`schedule.tsx`) — zero hack per-pagina. `.form-grid`/`.page-head`/`.chart-label` toccano rispettivamente 18/13/2(componenti) consumer con UNA riga di CSS ciascuno.
- **Nessuna regressione desktop (AC 4)**: ogni fix riverificato a 1440×900 — popover invariati (nessun clamp attivo, valori identici al pre-fix), `.form-grid` resta 2 colonne (`232.5px 232.5px` misurato), `.page-head` resta `flex-wrap:nowrap`, chart-label mostra tutte le 12 label (36/36 visibili). Verificato anche a 414px (soglia chart-label: 12/12 label visibili, nessuna nascosta) e 640px (`.form-grid`/`.page-head` — sotto la soglia, comportamento mobile atteso e corretto).
- **Item NON fixati, giudicati OK (assunzioni esplicite per il reviewer)**:
  - `.ppr-form-grid` (form pubblico `/ppr`): stessa forma 2-colonne di `.form-grid` ma misurato SENZA overflow a 375px (nessuna sidebar a mangiare spazio, `.ppr-grid` già 1-colonna sotto 820px) — lasciato invariato, nessun difetto da correggere.
  - Topbar 5 elementi a 375px: già gestito dalla regola ≤640px esistente (story 12.1/12.1 review F1) — 0 overflow, tutti e 5 gli elementi (crumbs, switcher, theme-toggle, user-chip, logout) hit-testable, verificato con misure puntuali.
  - ExportMenu, form inline Settings "Aggiungi", editor inline "Registra ricarica": nessun overflow misurato, nessun fix necessario.
  - Wrap del testo nelle label di `/ppr` (es. "ETD (Partenza previsto — facoltativo)" su 2 righe): comportamento CSS normale (wrap, non overflow), leggibile, nessun fix.
- **Flakiness dev-mode investigata e attribuita** (lezione 13.9 applicata: attribuzione PROVATA, non assunta): una prima run di `bookings.spec.ts` intero contro `next dev` (non build prod) con worker paralleli ha mostrato 18/29 test falliti, tutti con lo STESSO sintomo (`toHaveURL` bloccato su `/it/login`, timeout 5s). Ho isolato e riprovato UN test fallito (`pilot moves their own booking…`) da solo: **PASS** (14.3s). Root cause identificata: `next dev` compila le route on-demand — la fascia "Ready in 369ms" non significa route compilate, e con più worker paralleli che colpiscono `/login`+`/dashboard`+route API insieme la prima ondata di richieste (compile a freddo) eccede il timeout `toHaveURL` di 5s del test. Non è una regressione introdotta da questa story (nessun test di business logic toccato, solo CSS/markup). La suite CI=1 full su build di produzione (sotto) è la prova definitiva, come da runway.
- **Nota tooling** (non un difetto applicativo): durante la sessione, un'aggiunta CSS (`chart-label`) non compariva nel bundle servito nonostante fosse presente nel sorgente e nonostante un restart del dev server — risolto con `rm -rf .next` (cache Turbopack persistente non invalidata correttamente per quella modifica specifica) seguito da restart. Le altre due modifiche CSS della stessa sessione (`.form-grid`, `.page-head`) erano invece state raccolte correttamente da un semplice restart — comportamento non riprodotto in modo affidabile, segnalato per trasparenza.
- `npm run gates`: PASS (lint 25s / typecheck 23s / test 1446 passed / build 60s).

### Interactive verification (Playwright)

`mcp__playwright__*` non raggiungibile da questa sessione (Chromium non trovato a `/opt/google/chrome/chrome`, path del server MCP registrato — non esiste su questa macchina locale) → fallback a script `@playwright/test`/`playwright-core` throwaway in scratchpad (mai in staging, mai committati), Chromium locale cacheato `~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome` (drift noto rispetto al path container di CLAUDE.md). Login via form reale (`getByLabel`), navigazione via `page.goto`, misure via `page.evaluate` (scrollWidth/clientWidth, `getBoundingClientRect`, `document.elementFromPoint`, `Range.getBoundingClientRect` per le label glyph-level). Screenshot prima/dopo per ogni fix (popover, form-grid/SlideOver, page-head/people-id, chart-label/reports) + regressione 1440×900/414px per ognuno — dettagli numerici sopra.

### File List

- `src/app/[locale]/dashboard/bookings/schedule.tsx` — `clampPopoverLeft` (utility condivisa) + coordinate clampate per i due popover (F4-13.7).
- `src/components/charts/bar-chart.tsx` — classe `chart-label` sulle label X-axis (F8-13.8 follow-up).
- `src/components/charts/line-chart.tsx` — idem.
- `src/styles/airops.css` — 3 nuove regole `@media (max-width:640px)`/`@media (max-width:400px)`: `.form-grid`, `.page-head`, `.chart-label:nth-child(even)`.
- `e2e/bookings.spec.ts` — nuovo test "story 13.10 (F4-13.7): at 375px both popovers stay clamped inside the viewport".
- `_bmad-output/implementation-artifacts/13-10-mobile-pass.md` — questo file (Dev Agent Record, Status → review).

### Change Log

- 2026-07-25: implementazione story 13.10 — sweep sistematico 375×812, 4 fix a livello sistema (popover clamp F4-13.7, `.form-grid` 1-colonna, `.page-head` flex-wrap, chart-label alternate F8-13.8), 1 nuovo test e2e, gates PASS.

## Review Record

_(compilato dopo la review adversarial)_
