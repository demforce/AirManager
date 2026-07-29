---
baseline_commit: 806692a
---

# Story 15.1: Shell mobile — tab bar per-ruolo, sheet "Altro", topbar compatta con menu profilo

Status: review

## Story

As a utente di AirManager al telefono (admin sul piazzale, pilota/allievo/istruttore in giro),
I want una navigazione mobile nativa — tab bar in basso con le MIE aree, topbar compatta col titolo pagina e un menu profilo per logout e lingua,
so that ogni pagina dell'app resta raggiungibile e usabile con una mano su schermi ≤640px, senza il rail desktop né zoom.

**Riferimenti vincolanti**: piano epic 15 `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md` — ratifiche **R1** (tab bar SOLO ≤640px; 641-900px TENGONO il rail 64px della ratifica 13.10), **R2** (template incompleto: nav non-admin la progetta il team con le route del registry, ≤5 voci senza "Altro"; admin = 5 slot del template + sheet "Altro"), **R5** (logout e switcher lingua nel menu che si apre dal PROFILO in topbar) + assunzioni accettate (orologio in topbar e "Accedi come" = artefatti del prototipo, NON si implementano; i valori `--ink-4` dell'app prevalgono sul template). Architettura vincolante del piano: **componenti mobile dedicati + switch a media query CSS puro** (niente route parallele, niente user-agent sniffing, niente `matchMedia`), `display:none` VERO su entrambi gli alberi, regole mobile ADDITIVE in `@media (max-width: 640px)`, MAI cambiare valori di token esistenti.

**Fonte visiva**: template `AirOps Mobile.dc.html` (+ `data.js` fixture) — copie locali per questa sessione in
`/tmp/claude-1000/-home-admin-AirManager/91bdbd74-cbd8-4aa7-8084-d487c2a53d22/scratchpad/design/`
(`support.js` è il runtime del prototipo, NON è design). Aprire il file e leggerlo PRIMA di scrivere codice.

**Ricognizione (2026-07-29, sessione principale — il dev verifichi e corregga se sbaglio, prassi premiata 14.3/14.4/14.6/14.8/14.9)**:

- **Shell attuale** (`src/components/shell/` + `src/app/[locale]/dashboard/layout.tsx`):
  - `layout.tsx` (server) costruisce `rawItems = visibleNavItems(actor.roles).filter(myCompensation ⇒ profilo istruttore ATTIVO)` (riga ~113, lezione 14.6 F2) e li raggruppa per `NAV_GROUPS`; passa stringhe già tradotte ai client component (convenzione di casa: MAI `useTranslations` nei client component). **Il mobile-nav DEVE ricevere lo STESSO array filtrato — non richiamare `visibleNavItems` per conto suo, o perde il filtro profilo-attivo.**
  - `sidebar.tsx`: `aside.sidebar` con `role="navigation"` e `aria-label={t('shell.navLabel')}` ("Aree operative") — è il landmark UNICO a cui gli e2e scopano i link (lezione 103-F1). Con `display:none` l'albero nascosto esce dall'accessibility tree: a ogni breakpoint deve restare UN solo landmark con quel nome.
  - `top-bar.tsx`: `header.topbar` = crumbs (brand/ICAO/titolo via `findNavItemByPathname` + `pageTitles`) / spacer / **Link switcher lingua che conserva pathname+query** (fix 13.8 F1 — `useSearchParams`, da NON perdere nel menu profilo) / `ThemeToggle` (cookie `am-theme`, component riusabile as-is) / user-chip (`Avatar` init+color) / form `logoutAction` (Server Action passata dal layout — pattern valido Server→Client).
  - `route-registry.ts`: 14 `NAV_ITEMS` con `roles`; `visibleNavItems()` filtra `enabled` + ruolo. Qui va il **campo di priorità/slot mobile** (architettura del piano: registry unica fonte di verità — href/icona/ruoli/slot).
- **Conteggi per ruolo** (dal registry, oggi): ADMIN 12 voci → 4 slot + "Altro" con 8; INSTRUCTOR 5 (overview, schedule, scadenze, logbook, myCompensation — l'ultima gated sul profilo attivo → può scendere a 4); PILOT e STUDENT 5 (overview, schedule, scadenze, logbook, myAccount). Non-admin: sempre ≤5 → tab bar piena, MAI "Altro" (R2).
- **Template — geometrie chiave** (fedeltà, coi valori del template salvo dove l'app prevale):
  - Topbar mobile (righe 45-58): sticky top z-basso, `--panel` + border-bottom, logo quadrato 30px (`--ink` bg), titolo pagina 14px/600 ellissato + sub mono 9.5px (nel template "AIROPS · LIML" → nell'app **brand + ICAO reali** dal layout), theme toggle 32px, **avatar rotondo 32px come BOTTONE** (nel template apre "Cambia ruolo" → da noi apre il MENU PROFILO, R5). L'orologio "10:52" NON si porta.
  - Tab bar (righe 467-477): `position:fixed; bottom:0`, grid a N colonne uguali, sfondo `color-mix(in oklch, var(--panel) 94%, transparent)` + `backdrop-filter:blur(14px)`, border-top, padding `6px 6px 12px`; item = colonna icona 19px + label 9.5px (peso 600 attivo / 500 inattivo, colore `--ink` / `--ink-4`) + dot accent 4px (`opacity` 1/0), `min-height:44px`. Il `max-width:430px` centrato del template è la CORNICE del mockup, non design: nell'app la barra è full-width (≤640px). Contenuto: il template dà `padding-bottom:100px` al main (riga 61).
  - Sheet "Altro" (righe 479-494): scrim `oklch(0.1 0.01 250 / 0.4)` full-screen, pannello dal fondo `border-radius:20px 20px 0 0`, grabber 36×4, label mono uppercase "Altre sezioni", grid 2 colonne di bottoni (padding 12, radius 12, `min-height:44px`, icona 16px, attivo `--panel-2`), animazione `sheetUp 240ms cubic-bezier(.2,.7,.2,1)`.
  - Sheet ruolo (righe 496-513): NON si implementa ("Accedi come"), ma il suo linguaggio (riga avatar + label + sub, radius 12) è la base visiva del **menu profilo** R5.
  - Nav admin del template (riga 606): `Panoramica(home) / Voli(cal) / PPR(doc) / Flotta(plane)` + `Altro(grid)`; `moreIds` = visiting, pilots, instructors, scadenze, logbook, billing, reports, settings — coincide 1:1 con le 8 voci admin restanti del registry. Le label dell'app restano `shell.nav.*` (es. "Pianificazione", non "Voli" — i18n dell'app prevale sul mock, stessa regola dei token).
  - Toast del template a `bottom:92px` (sopra la barra).
- **Icone** (`src/components/ui/icons.tsx`): esistono già `dashboard/calendar/doc/plane/users/compass/clock/book/cash/chart/gear`; **manca un glifo per "Altro"** → aggiungere `grid` col path del template (`M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z`).
- **z-index in app**: `.topbar` 4, popover/typeahead 19/20/30, SlideOver 50 (scrim) / 60, `.toast-host` 200 (fixed right:18 bottom:18 — a ≤640px va ALZATO sopra la tab bar). La tab bar deve stare sopra il contenuto ma SOTTO popover/slideover/toast; i due sheet nuovi (Altro/profilo) sopra la tab bar.
- **CSS breakpoint esistenti**: `@media (max-width:900px)` = rail 64px (INTOCCATO, R1); i blocchi `max-width:640px` esistenti (topbar compatta 1526-1530, form-grid, ppr-form-grid, page-head, filter-date-range) restano; la regola 1526-1530 (`.user-chip-name` nascosto ecc.) diventa morta quando la topbar desktop è `display:none` ≤640px — rimuoverla SOLO se effettivamente morta, con motivazione.
- **TRAPPOLA `.app`**: `display:none` sulla sidebar NON rimuove il track `232px` (o `64px`) della grid di `.app` — è definito sul container, non dal contenuto: `.main` si auto-piazzerebbe nella colonna 1 larga 232px. ≤640px serve anche `.app{ grid-template-columns: 1fr }` (additivo).
- **e2e mobile-viewport esistenti**: `bookings.spec.ts` 3 test a 375px (clamp popover con hit-test, scroll `.week-grid`, day view + `new-booking-button` visibile — righe ~813-923); `my-compensation.spec.ts` a 390px (hit-test `elementFromPoint` sulla cella IMPORTO, righe ~328-362 — **la tab bar fissa può intercettare il punto se la riga finisce sotto la barra**); `datetime-picker.spec.ts` a 375px ma su `/ppr` PUBBLICA (fuori shell dashboard → niente tab bar, impatto atteso zero). Tutti e tre da rieseguire; se rossi, aggiornarli al comportamento CORRETTO senza indebolirli (lezione 14.6).
- **Convenzioni trasversali**: karpathy-guidelines su ogni riga; `npm run gates` prima del commit; unit nuove che importano servizi "grossi" → shell pulita `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`; MAI `Escape` negli e2e per chiudere popup dentro pannelli; MAI `getByRole('link', {name})` page-level.

## Acceptance Criteria

1. **(Switch R1 — CSS puro)** A ≤640px la `Sidebar` è `display:none` e compaiono tab bar + topbar mobile; a >640px i componenti mobile sono `display:none` e NULLA cambia rispetto a oggi (641-900px: rail 64px INVARIATO; >900px: sidebar piena INVARIATA). Niente `matchMedia`/user-agent/route parallele; ogni regola mobile è additiva dentro `@media (max-width: 640px)`; nessun token esistente di `airops.css` cambia valore. A ogni breakpoint l'accessibility tree contiene UN SOLO landmark `navigation` con nome "Aree operative".
2. **(Tab bar per-ruolo — R2)** Nuovo componente mobile (es. `src/components/shell/mobile-nav.tsx`) pilotato dallo **stesso array filtrato** che il layout passa alla Sidebar (incluso il filtro myCompensation profilo-attivo). Regola: se le voci visibili sono ≤5 → tutte in tab bar, niente "Altro"; se >5 → le 4 voci a slot prioritario (nuovo campo nel `route-registry.ts`, unica fonte di verità) + quinta tab "Altro". Con la registry di oggi: ADMIN = Panoramica/Pianificazione/PPR/Aeromobili + Altro (come il template); INSTRUCTOR e PILOT/STUDENT = le loro 5 (o 4 se myCompensation è filtrata) senza "Altro". Stato attivo = pathname exact-match (stessa semantica della Sidebar): colore/peso/dot accent; la tab "Altro" è attiva quando la route corrente appartiene alle sue voci. Target touch ≥44px; label = chiavi `shell.nav.*` esistenti passate via props.
3. **(Sheet "Altro")** Tap su "Altro" → scrim + pannello dal fondo nel linguaggio del template (grabber, label sezione, grid 2 colonne, voce attiva evidenziata, ≥44px). Le voci sono le restanti del registry nell'ordine dei gruppi attuali; navigare chiude lo sheet; tap sullo scrim chiude. `Escape` chiude lo sheet (siamo FUORI da SlideOver: il listener globale di slide-over.tsx non c'entra qui, ma il dev verifichi che non ci siano interferenze quando uno SlideOver è aperto sotto).
4. **(Topbar compatta)** ≤640px: topbar mobile col linguaggio del template — logo quadrato, titolo della pagina corrente (stesso lookup `findNavItemByPathname` + `pageTitles` + fallback della TopBar), sotto-riga mono con brand + ICAO reali, `ThemeToggle` riusato, bottone avatar (iniziali+colore del user-chip). NIENTE orologio, NIENTE switch-ruolo. La topbar desktop resta INVARIATA a >640px.
5. **(Menu profilo — R5)** Tap sull'avatar → sheet dal fondo (linguaggio del template): identità (nome completo + ruolo primario), **switcher lingua IT/EN** che conserva pathname E query string (riusare l'approccio del Link di top-bar.tsx — fix 13.8 F1, stessa semantica), **logout** (stessa Server Action del layout). Scrim/navigazione chiudono il menu; trigger con `aria-expanded` e nome accessibile; focus non intrappolato in modo rotto (l'a11y pass completo è 15.10, qui base corretta: il menu è raggiungibile e operabile da tastiera).
6. **(Geometria del fondo pagina)** ≤640px NESSUN contenuto interattivo resta coperto dalla tab bar: padding-bottom sul contenitore del contenuto (riferimento template ~100px) + `env(safe-area-inset-bottom)` additivo sulla barra; `.toast-host` alzato sopra la barra (riferimento template: 92px). Layering: contenuto < tab bar < sheet mobile (Altro/profilo) — e tab bar SOTTO popover (19/20/30), SlideOver (50/60) e toast (200) esistenti, che devono restare pienamente usabili a 375px con la barra presente (verifica con hit-test, non a occhio — lezione 13.7/13.10).
7. **(Convenzione testid — architettura epic, si fissa QUI)** Documentata nel doc-comment del componente mobile (e richiamata nel Dev Agent Record): i testid dell'albero desktop NON cambiano; l'albero mobile usa testid propri col suffisso `-mobile` quando duplica una superficie desktop (es. `logout-button-mobile`), nomi nuovi semplici per ciò che esiste solo su mobile (es. `mobile-tab-bar`, `mobile-more-sheet`, `mobile-profile-menu`). Aggiunta una riga alla sezione convenzioni e2e di CLAUDE.md nello stesso commit.
8. **(e2e)** (a) Nuovo spec mirato (es. `e2e/mobile-shell.spec.ts`, viewport `setViewportSize` pattern 13.10, NESSUNO stato globale scritto → resta nel project fullyParallel): admin naviga da tab bar E da sheet "Altro"; un ruolo non-admin ha le SUE tab e nessun "Altro"; menu profilo fa logout e switch lingua (con conservazione della query dimostrata); un solo landmark nav per breakpoint; un elemento a fondo pagina resta hit-testabile con la barra presente. (b) I 3 spec mobile-viewport esistenti verdi (aggiornati al valore corretto se la geometria nuova li rompe, mai indeboliti). (c) Suite desktop: invariata per costruzione (display:none) — gate finale = full suite `CI=1` su build prod, DB fresco.
9. **(Invarianti)** Desktop >640px invariato (verifica interattiva Playwright MCP su 3 pagine campione a 1280px e 800px: nessuna differenza visiva); `npm run gates` verde; niente dipendenze nuove; i18n: ogni stringa nuova in ENTRAMBI i locale (`messages/it.json` + `en.json`), namespace `shell`.

## Contesto (puntatori)

- Piano epic 15 (ratifiche + architettura VINCOLANTI): `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md`.
- Template locale: v. percorso in testa (fonte remota: progetto design `dcd71b3a-dbcf-494e-a543-29325a5435de`, raggiungibile solo dalla sessione principale).
- Regole ambiente/ciclo: `docs/handoffs/HANDOFF.md` (macchina locale Fedora). Reset DB solo dalla sessione principale (consenso PO). Full suite: `export JOBS_SECRET=local-dev-secret-1` prima di `CI=1 npx playwright test` su build prod; run lunghi MAI come Bash background (nohup + marker file).
- **Skill obbligatorie dev**: `karpathy-guidelines` + `design-taste-frontend` + `ui-ux-pro-max` (story UI). Verifica interattiva col Playwright MCP dove disponibile; fallback sanzionato: script `@playwright/test` throwaway lanciati dalla root, mai committati.
- Commit: `feat(15.1): shell mobile — tab bar per-ruolo, sheet Altro, topbar compatta con menu profilo` — Co-Authored-By: Claude Opus 5 <noreply@anthropic.com> (regola modello 2026-07-29: il codice UI lo scrive Opus 5).

## Fuori scope dichiarato

- `BottomSheet` dettaglio-riga e `MobileFormPanel` full-screen (story 15.2 — R3).
- Porting delle PAGINE al linguaggio mobile (15.3+): qui le pagine restano com'erano dopo 13.10 (usabili, baseline), cambia solo la shell.
- KPI strip a scroll-snap (15.2/15.3), dark-pass e a11y-pass completi (15.10), project Playwright mobile dedicato (riesame a fine epic).
- TD 14.6 F4 (estratto conto non-responsive sotto ~700px — componente condiviso, resta TD).
- Qualunque modifica al comportamento desktop o alle API.

## Dev Agent Record

**Agente**: dev-story (Opus 5 xhigh — regola modello 2026-07-29: il codice UI lo scrive Opus 5). Skill caricate: `karpathy-guidelines`, `design-taste-frontend`, `ui-ux-pro-max` (query "mobile bottom tab bar…" e "bottom sheet modal focus…": ≥44px, 8px fra i target, 3-5 tab con gli extra dietro "More", chiusura esplicita dello sheet — tutte rispettate).

### Verifica della ricognizione (sessione principale)

Ricognizione **confermata** su tutti i punti verificabili; correzioni e precisazioni:

1. **Conteggi per ruolo — CONFERMATI ma con una precisazione**: ADMIN vede 12 voci → "4 slot + Altro con 8" è corretto (il testo dell'AC 2 dice "4 voci a slot prioritario + quinta tab Altro", ed è quello implementato: `MOBILE_TAB_COUNT - 1` = 4). INSTRUCTOR/PILOT/STUDENT = 5 (4 se `myCompensation` è filtrata): confermato da unit test sul registry reale.
2. **Icone — CONFERMATO**: mancava solo il glifo "Altro"; aggiunto `Icon.grid` col path del template. Nessun'altra icona serviva (le 8 voci dello sheet riusano `plane/users/compass/clock/book/cash/chart/gear`).
3. **TRAPPOLA `.app` — CONFERMATA E NECESSARIA**: senza `grid-template-columns: 1fr` a ≤640px `.main` resta nella colonna da 232px. Aggiunta.
4. **Regola CSS 1526-1530 — CONFERMATA MORTA, rimossa**: `.user-chip`/`.user-chip-name` esistono SOLO dentro `top-bar.tsx` (grep) e `.topbar` è ora `display:none` ≤640px, quindi tutte e tre le dichiarazioni del blocco non potevano più applicarsi a nulla. Le due regole *fuori* media query (`.crumbs`, `.user-chip{flex-shrink}`) restano: valgono ancora da 641px in su. Motivazione lasciata come commento al posto del blocco.
5. **Geometria della barra — MISURATA, non stimata** (il template dava 6+44+12): l'altezza reale è **67px** con label su una riga (admin) e **78px** con la label più lunga su due righe ("Le mie transazioni", pilota/allievo). Il `padding-bottom` del contenuto usa quindi il valore del template (100px) che copre entrambi i casi con ≥22px di margine; `.toast-host` sale a 92px (valore del template) + safe-area.
6. **z-index — CORREZIONE alla ricognizione**: la barra sta a **5** (sopra il contenuto, sotto popover 19/20/30, SlideOver 50/60, toast 200) come da AC 6, ma i due sheet NON possono stare appena sopra la barra: un `.popover` (z 19/20/30) può essere aperto mentre si tocca la tab bar, e dipingerebbe **sopra** lo sheet e il suo scrim. Gli sheet stanno quindi a **z 40** — sopra i popover, sotto SlideOver e toast (verificato per hit-test, v. sotto).
7. **`my-compensation.spec.ts` a 390px — nessun impatto**: la riga IMPORTO non finisce sotto la barra (test verde senza modifiche), come i 3 spec mobile-viewport esistenti.

### Riepilogo per AC

1. **Switch R1** — `.sidebar`/`.topbar` `display:none` ≤640px, albero mobile `display:none` >640px (regole base FUORI dalla media query). Nessun `matchMedia`/UA/route parallele; tutte le regole nuove sono additive dentro `@media (max-width: 640px)`; nessun token esistente cambia valore. Misurato: a 1280px e 800px `app.gridTemplateColumns` resta `232px …` / `64px …`, `.main` padding-bottom 0px, un solo landmark `navigation` "Aree operative" (e2e + misura interattiva).
2. **Tab bar per-ruolo** — `mobile-nav.tsx` alimentato dallo STESSO `rawItems` della Sidebar (filtro `myCompensation` incluso: `layout.tsx` calcola `mobileNavLayout(rawItems)` DOPO il filtro). Campo `mobileSlot` (1-4) nel registry; `mobileNavLayout()` è la regola ≤5/>5. ADMIN = Panoramica/Pianificazione/Richieste PPR/Aeromobili + Altro; PILOT/STUDENT/INSTRUCTOR = le loro 5 (o 4) senza Altro. Attivo = `pathname === href` (semantica Sidebar) → colore/peso/dot; "Altro" attivo quando la route è una delle sue. Target ≥44px (`min-height: 44px`, colonna 73px a 375px). Label = chiavi `shell.nav.*` esistenti.
3. **Sheet "Altro"** — scrim + pannello dal fondo, grabber 36×4, label mono "ALTRE SEZIONI", grid 2 colonne ≥44px, voce attiva `--panel-2`; navigare chiude (onClick), scrim chiude, Escape chiude. Interferenza con SlideOver: **impossibile per costruzione** (lo scrim di SlideOver, z 50, copre la tab bar; lo scrim dello sheet copre la pagina) e comunque i due listener sono entrambi su `window` e chiuderebbero solo il proprio pannello — motivazione nel doc-comment di `mobile-sheet.tsx`.
4. **Topbar compatta** — `.brand-mark` riusato (zero CSS nuovo), titolo dallo stesso lookup `findNavItemByPathname` + `pageTitles` + fallback della TopBar, sotto-riga mono `AirManager · ICAO` (solo brand se l'ICAO non è configurato), `ThemeToggle` riusato, bottone avatar rotondo con `Avatar` (iniziali+colore del user-chip). Niente orologio, niente switch-ruolo.
5. **Menu profilo** — sheet dal fondo: identità (nome + ruolo primario), riga "Cambia lingua · EN" (stesso `Link href={{pathname, query}}` + `useSearchParams` della TopBar: query preservata, provato in e2e), riga "Esci" (STESSA Server Action del layout). Trigger con `aria-haspopup="dialog"` + `aria-expanded` + `aria-label`; il pannello è `role="dialog"` con nome accessibile, prende il focus all'apertura e lo **restituisce al trigger** alla chiusura (misurato: `document.activeElement` torna `mobile-profile-button` dopo Escape). Deliberatamente NIENTE `aria-modal` finché non c'è un focus trap (15.10).
6. **Geometria del fondo** — `.main{ padding-bottom: calc(100px + env(safe-area-inset-bottom)) }`, barra con `padding-bottom: calc(12px + env(safe-area-inset-bottom))`, `.toast-host{ bottom: calc(92px + env(...)) }`. Layering verificato per hit-test a 375px: popover `.popover` z 20 → hit-test sul proprio centro OK sopra la barra; `SlideOver` (z 50) dipinge sopra la barra (elementFromPoint all'altezza della barra dentro il pannello NON restituisce `.mobile-tabbar`); toast (z 200) renderizzato a `bottom 726 < barTop 745` e hit-testabile.
7. **Convenzione testid** — documentata nel doc-comment di `mobile-nav.tsx` e aggiunta a CLAUDE.md (sezione convenzioni e2e) nello stesso commit: desktop invariato, `-mobile` per i duplicati (`logout-button-mobile`, `locale-switch-mobile`), `mobile-*` per ciò che è solo mobile (`mobile-tab-bar`, `mobile-tab-<id>`, `mobile-more-sheet`, `mobile-more-<id>`, `mobile-profile-menu`, `mobile-profile-button`, `mobile-topbar`).
8. **e2e** — nuovo `e2e/mobile-shell.spec.ts` (4 test, nessuna scrittura di stato globale → resta nel project `fullyParallel`): admin (tab bar + sheet + scrim/Escape + un solo landmark a 375 e a 1280), pilota (le sue 5 tab, niente Altro, niente route admin), menu profilo (lingua con query preservata + logout), geometria del fondo. La guardia di geometria è **provata discriminante** contro una simulazione pre-fix (`.main` senza padding sulla stessa pagina): contentBottom 812 vs 745 di barTop e hit-test a fine contenuto che cade su `.mobile-tabbar`. I 3 spec mobile-viewport esistenti: **verdi senza modifiche**.
9. **Invarianti** — `npm run gates` verde; nessuna dipendenza nuova; stringhe nuove in `it.json` + `en.json` (`shell.mobile.more/moreSheet/profile`); verifica interattiva desktop 1280/800 su 3 pagine (v. sotto).

### Deviazioni motivate (dove il template era muto o l'app prevale)

- **Label su due righe nella tab bar** (il template ha solo label da una parola): AC 2 impone le chiavi `shell.nav.*` esistenti, e "Le mie transazioni" non entra in 73px. Scelto il wrap a 2 righe invece del troncamento con ellissi (leggibilità); i dot inattivi restano nel flusso con `opacity: 0`, e poiché **un solo dot è mai visibile** non c'è disallineamento da compensare.
- **Righe del menu profilo senza icona** (il template usa icone nelle righe dello sheet ruolo): l'icon-set dell'app non ha glifi "globo"/"logout" e la regola anti-slop vieta di disegnarne a mano; le righe usano il testo già tradotto ("Cambia lingua" + chip "EN", "Esci"), coerente con la topbar desktop e con nome accessibile = testo visibile.
- **Radius 12px del template → `var(--radius-sm)` (10px)** per le voci di sheet: stessa regola dei token già ratificata per `--ink-4` (il token dell'app prevale sul literal del template); il pannello resta a `--radius-lg` (= 20px del template).
- **`mobile-sheet.tsx` come componente condiviso** (non previsto esplicitamente dalla story): due consumatori REALI oggi (Altro + profilo), evita di duplicare scrim/Escape/focus. Non è il `BottomSheet` dettaglio-riga della 15.2 (R3) — nota esplicita nel doc-comment.
- **z-index degli sheet a 40** invece che "appena sopra la barra" — motivazione al punto 6 della verifica ricognizione.
- **Bottoni della topbar mobile a 32px** (theme toggle `.iconbtn` + avatar), sotto i 44px della linea guida touch: valore del template E dimensione già in uso su tutta l'app; l'AC 2 chiede ≥44px per la tab bar, che è la superficie di navigazione primaria. Stesso precedente documentato in `bookings.spec.ts` (story 12.3).
- **`prefers-reduced-motion`**: l'animazione `sheet-up` è disattivata sotto `reduce` (2 righe) — non richiesto dalla story, ma è l'unica animazione nuova ed è la regola della skill `design-taste-frontend`.

### File List

- `src/components/shell/mobile-nav.tsx` (nuovo) — tab bar + sheet "Altro"; doc-comment con la convenzione testid dell'epic.
- `src/components/shell/mobile-top-bar.tsx` (nuovo) — topbar compatta + menu profilo (lingua + logout).
- `src/components/shell/mobile-sheet.tsx` (nuovo) — sheet dal fondo condiviso (scrim/Escape/focus).
- `src/components/shell/route-registry.ts` — campo `mobileSlot`, `MOBILE_TAB_COUNT`, `mobileNavLayout()`.
- `src/components/shell/route-registry.test.ts` (nuovo) — 3 unit test sulla regola ≤5/>5 (verde anche in shell pulita: `env -u DATABASE_URL -u AUTH_SECRET`).
- `src/app/[locale]/dashboard/layout.tsx` — monta `MobileTopBar` e `MobileNav` con lo stesso array filtrato della Sidebar.
- `src/components/ui/icons.tsx` — `Icon.grid` (glifo "Altro").
- `src/styles/airops.css` — sezione "mobile shell" additiva + rimozione del blocco ≤640px ormai morto della topbar desktop.
- `messages/it.json`, `messages/en.json` — `shell.mobile.*`.
- `e2e/mobile-shell.spec.ts` (nuovo) — 4 test.
- `CLAUDE.md` — convenzione testid mobile (AC 7).

### Test

- `npm run gates`: **PASS** (lint 20s, typecheck 11s, test 1603/1603, build 31s).
- e2e mirati su build prod (`CI=1`, `JOBS_SECRET` esportato): `mobile-shell.spec.ts` **4/4**; `bookings.spec.ts` (3 test a 375px), `datetime-picker.spec.ts` (375px), `my-compensation.spec.ts` (390px) **verdi senza modifiche** — run congiunto 50 passed / 1 failed (il fallito era la sola guardia di geometria nuova, poi corretta e riverificata 4/4).
- Verifica interattiva (script `@playwright/test` throwaway, mai committato): 375×812 admin + pilota (tab bar, sheet, menu profilo, tema scuro), 390×844, 1280×900 e 800×900 su Panoramica/Pianificazione/Aeromobili.

### Suite completa (CI=1, build prod) — esito ONESTO

`275 passed / 11 failed / 1 flaky / 15 did not run` in 13.5 min (i 15 "did not run" sono i project serializzati `settings`→`billing-global`, saltati perché il project `chromium` è rosso). **La suite NON è verde su questo DB, e la causa è la SATURAZIONE DEL DB, non il diff di questa story** — misurata, non narrata:

- `Aircraft` = **166** righe, ma ogni picker/filtro velivolo carica `OPTIONS_PAGE_SIZE = 100` (es. `logbook/page.tsx:33`): il velivolo run-unique creato da uno spec non entra più nelle `<option>` → `selectOption` va in timeout ("did not find some options"). `Person` = 339 (stesso cap 100), `Booking` = 132 con `BOOKINGS_PAGE_SIZE = 20` e ordine `startsAt` asc da oggi: pagina 1 è satura (8 righe oggi + 11 domani + 1 = 20 esatte), quindi le fixture fresche cadono fuori pagina → `getByTestId('booking-row')… element(s) not found` (7 fallimenti su 11 sono esattamente questo, più `home-dashboard` con la sua card da 8 righe e `reports` coi delta su aggregati globali).
- **Prova decisiva**: `flight-log.spec.ts:289` rieseguito **DA SOLO** (zero concorrenza, 3 tentativi) fallisce identico sullo stesso DB. Un test desktop, single-worker, che fallisce per mancanza di una `<option>`: nessuna riga di questa story (CSS ≤640px + un campo di registry + due componenti mobile `display:none` sopra i 640px) può produrlo.
- Il DB è stato saturato dalle esecuzioni e2e ripetute di questa sessione (run mirato dei 4 spec + suite completa creano ognuno decine di velivoli/persone). **Il ciclo prevede DB fresco prima della review**: l'arbitro deve rieseguire la suite su DB pulito.

### Note per la review

- Punto più delicato: lo **z-index 40** degli sheet (v. correzione 6). Vale la pena rifare l'hit-test con un `.popover`/`SlideOver` aperto sotto lo sheet.
- Secondo punto: il **wrap a 2 righe** della label lunga cambia l'altezza della barra (67→78px); il `padding-bottom` di `.main` (100px) e il `bottom` del `.toast-host` (92px) sono dimensionati sul caso peggiore misurato — se una story futura allunga una label `shell.nav.*`, quei due numeri vanno rimisurati.
- Terzo: `MobileSheet` non ha focus trap (scelta esplicita, 15.10) — verificare che questo non sia considerato bloccante per l'AC 5.
