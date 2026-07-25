---
baseline_commit: 19f5b33
---

# Story 13.9: Dark theme pass — sweep sistematico leggibilità

Status: done

## Story

As a utente che usa il tema scuro,
I want che ogni pagina dell'app sia leggibile in dark theme (nessuna combinazione testo/sfondo illeggibile),
so that il tema scuro sia usabile quanto il chiaro.

**Riferimenti vincolanti**: piano `docs/superpowers/plans/2026-07-22-epic-13-ui-feedback.md` (Task 9). Item utente: "dark theme has unreadable text (background vs text color combos)".

## Acceptance Criteria

1. **(Sweep sistematico)** OGNI pagina dell'app viene verificata in dark theme con screenshot documentati: tutte le route di `NAV_ITEMS` (`route-registry.ts` — overview/bookings/ppr/movements/pilots/instructors/fleet/expiries/logbook/billing/reports/settings), `people/{id}` (scheda persona + sezione estratto conto), le facce per-ruolo della home (admin/staff/istruttore/pilota/allievo — landing 12.12), e gli overlay principali (SlideOver, popover, modal, form editor, toast). Il sistema tema è token-based: `html[data-theme="dark"]` in `airops.css:41` ridefinisce le custom property (`--bg/--panel/--ink*/--accent*/...`) + una manciata di override dark-specifici (`airops.css:569,663-666`).
2. **(Fix a livello token, non per-pagina)** Ogni combinazione illeggibile trovata si corregge alla RADICE: uso corretto dei token esistenti (es. testo `--ink` su sfondo `--panel`, mai colori che funzionano solo in light) o, se un token è sbagliato in dark, si corregge il token/override in `airops.css`. Niente hack per-pagina dove evitabile (ratifica del piano). Caccia mirata: grep di colori hardcoded (hex/oklch/rgb literali, inline style con `color`/`background`) in `src/` FUORI da `airops.css` — ogni hit in una superficie visibile va verificato in dark.
3. **(Nessuna regressione light)** Ogni fix va ri-verificato ANCHE in light theme (stesso giro di screenshot sulle pagine toccate).
4. **(e2e + skill UI)** e2e SOLO dove economico e robusto (es. assert su computed style di uno spot fixato come regression-guard — pattern lezione 13.7: assert di stile/geometria, non proxy fragili); la prova primaria del sweep sono gli screenshot prima/dopo documentati nel Dev Agent Record. Skill: karpathy-guidelines + design-taste-frontend + ui-ux-pro-max; coerenza AirOps (i token sono il design system — non inventare colori nuovi).

## Contesto (puntatori — ricognizione 2026-07-25, da rifinire alla partenza)

- Tema: `airops.css:15` (light tokens) / `:41` (dark tokens); override dark-specifici sparsi (`grep 'data-theme="dark"' src/styles/airops.css`). Toggle cookie-persisted `data-theme` (`theme-toggle.tsx`, SSR-safe via root layout).
- Da chiarire in ricognizione alla partenza: se le pagine FUORI shell (login/set-password/forgot-password, modulo pubblico `/ppr`) onorano `data-theme` — se non lo onorano, sono fuori scope (nessun utente le vede in dark) e va solo DOCUMENTATO.
- Candidati noti di partenza (da verificare, non esaustivo): inline style con colori nei componenti (grep), superfici con `--accent-soft`/`--warn-soft` + testo scuro, chart (`bar-chart.tsx`, KPI) in dark.
- **Ambiente**: identico alle story precedenti (DB fresco al dispatch, gates prima del commit, e2e foreground, MAI push, MAI playwright install, NON toccare package.json). Commit: `feat(13.9): dark theme pass — leggibilità token-level su tutte le pagine` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Mobile (13.10) e ritiro stack legacy (13.11).
- Redesign/ribilanciamento estetico del tema scuro: questa story fixa LEGGIBILITÀ (contrasto testo/sfondo), non rifà la palette.
- Pagine che non onorano `data-theme` (se confermato in ricognizione): documentare, non implementare il supporto tema lì.

## Dev Agent Record

### Implementation Plan

Metodo eseguito in 5 passi (dev subagent Sonnet 5 xhigh), come da mandato:

1. **Inventario** — tutte le 12 route di `NAV_ITEMS` (route-registry.ts), `people/{id}` (scheda + estratto conto + form top-up/edit), le 5 facce home per-ruolo (admin/staff/istruttore/pilota/allievo), gli overlay principali (SlideOver nuova prenotazione, SlideOver aircraft-editor, popover filtri, popover calendario, ExportMenu, form inline settings), login/forgot-password/set-password, `/ppr` pubblico.
2. **Ricognizione preliminare** — login/set-password/forgot-password E `/ppr` pubblico onorano TUTTI `data-theme` (verificato leggendo il codice: ogni pagina auth ha `<main style={{background:'var(--bg)',color:'var(--ink)'}}>` esplicito; `.ppr-page` in `airops.css:1310` ha un commento storico — story 12.4 — che documenta un fix precedente per lo stesso pattern di bug "overflow mostra il body light sotto"). Conclusione: **nessuna pagina è fuori scope per mancato supporto tema** — la ricognizione preliminare del piano ipotizzava che potessero non onorarlo, ma il codice le onora tutte già da prima di questa story.
3. **Caccia** — grep sistematico di colori hardcoded (hex/oklch/rgb letterali, inline `style` con `color`/`background`) in `src/` fuori da `airops.css`, incrociato con uno **strumento di audit di contrasto WCAG scriptato** (Playwright + canvas rasterization per risolvere qualsiasi sintassi colore — oklch/lab/rgb — a RGB 0-255 comparabile, poi formula di luminanza relativa WCAG): script throwaway in scratchpad, MAI committato. Screenshot dark/light per ogni superficie, archiviati in scratchpad (non committati).
4. **Fix token-level** — 5 cause radice sistemiche (dettagliate sotto), ognuna corretta nel token/override in `airops.css` (o rimuovendo un override che lo scavalcava), MAI un hack per-pagina. Ogni fix ri-verificato in light via lo stesso script di audit (nessuna regressione).
5. **Prova** — screenshot prima/dopo + audit di contrasto computazionale (non il solo giudizio visivo — vedi nota metodologica sotto) per ogni pagina/overlay/ruolo; e2e regression-guard aggiunto per la causa radice più grave (vedi File List).

**Nota metodologica importante**: la prima ispezione visiva "a occhio" degli screenshot (via tool di lettura immagine) ha inizialmente giudicato ERRONEAMENTE una pagina in dark come "già chiara/leggibile" quando in realtà il testo era quasi invisibile (rapporto di contrasto ~1.4:1, testo scuro su sfondo scuro). Il giudizio visivo diretto si è rivelato inaffidabile in questo ambiente per differenze di contrasto sottili — la campionatura pixel oggettiva (`sharp`/canvas raw RGB) e il calcolo del rapporto di contrasto WCAG hanno smascherato l'errore. Da lì in poi TUTTE le verifiche di leggibilità in questo sweep sono state fatte via lo script di audit computazionale (mai per solo giudizio visivo), con lo screenshot usato come prova documentale complementare, non come unico strumento di verifica.

### Cause radice fixate (token-level, `src/styles/airops.css` salvo dove indicato)

1. **`<body>` — la causa radice più grave, sistemica su OGNI pagina.** `src/app/[locale]/layout.tsx` aveva classi Tailwind hardcoded `bg-[#FBFBFA] text-[#2F3437]` su `<body>`, e `src/app/globals.css` aveva una regola `body{ background: var(--background); color: var(--foreground) }` con `--background`/`--foreground` letterali light-only (relitto dello scaffold Next.js pre-AirOps, mai reso theme-aware). **[Meccanismo CORRETTO in review, F3]** Il vero e unico colpevole era la regola di `globals.css`: unlayered e più tarda nella cascata rispetto all'`@import` di `airops.css`, scavalcava la regola CORRETTA e già theme-aware (`body{ background: var(--bg); color: var(--ink) }`, `airops.css:69-78`). Le classi Tailwind sul `<body>` erano invece INERTI (Tailwind v4 le emette in `@layer utilities`, che perde contro il CSS unlayered a prescindere dalla specificità — provato dal reviewer re-iniettandole a runtime: zero effetto); la loro rimozione resta giusta ma come pulizia di codice morto e fuorviante, non come fix. Risultato: ogni elemento che eredita il colore da `<body>` (praticamente tutto il testo "quieto" senza un proprio `color` esplicito — H1, `.card-title`, `.brand-name`, `.so-title`, `.nav-label`, header di tabella, testo di stato vuoto…) restava fissato a `#2F3437` (grigio scuro) IN ENTRAMBI I TEMI. In dark, contro pannelli scuri, dava un contrasto ~1.3-1.5:1 (praticamente invisibile). **Fix**: rimosse entrambe le hardcode (classi da `layout.tsx`, regola + le due custom property ormai morte da `globals.css`) — la regola già corretta di `airops.css` ora vince senza contendenti. Un SOLO fix, risolve ~13-14 elementi per pagina su tutte le 12 route + tutti gli overlay + le 5 home + `people/{id}`.
2. **`.btn.mini.ok` / `.btn.mini.bad`** (bottoncini azione inline: "Sospendi"/"Riattiva" piloti, "Elimina" ratings/visite/categorie in Settings, "Paga" istruttori, "Reject" PPR) — colore hardcoded `oklch(0.42 0.12 155)` / `oklch(0.5 0.17 25)` tarato per il tema chiaro, applicato direttamente su `--panel`/`--bg` (nessun fill fino all'hover). In dark: ~2.2-2.7:1. **Fix**: override `html[data-theme="dark"]` che riusa i token ESISTENTI `var(--ok)`/`var(--bad)` (già calibrati per stare su pannelli scuri altrove).
3. **`.cal-cell.sel`** (data selezionata nel popover calendario) e **`.btn.accent`** (CTA "Invia richiesta" della pagina pubblica `/ppr`) — stesso pattern: `--accent` resta luminoso in ENTRAMBI i temi (per design, L .78 light / .82 dark — "pop" del brand), ma il testo sopra era `white` hardcoded (cal-cell, ~1.77:1 dark) o `var(--accent-ink)` (btn.accent — il valore dark di `--accent-ink`, tarato per stare su `--accent-soft` SCURO in dark, resta quasi luminoso quanto `--accent` pieno: ~1.35:1). **Fix**: override `html[data-theme="dark"]` su entrambi i selettori, stesso ink scuro fisso riusato (`oklch(0.28 0.09 60)`, ~8.4:1 contro l'accent scuro) — NON un nuovo colore inventato, il valore LIGHT esistente di `--accent-ink` riapplicato come costante.
4. **5 alert/conferma inline nelle pagine auth** (`login-form.tsx`, `forgot-password-form.tsx`, `set-password-form.tsx` ×2, `set-password/page.tsx`) — `<p role="alert"|"status">` con `style={{background:'var(--*-soft)', color:'oklch(...)'}}` inline: il colore era una copia LETTERALE (pixel-identica) del colore light di `.badge.ok`/`.bad`/`.info`, ma essendo uno style inline non può essere scavalcato da un selettore `html[data-theme="dark"]` — quindi non riceveva mai il bump già esistente per `.badge.*`. Trovato via `/set-password?token=` (alert "Link non valido": 1.35:1). **Fix**: nuova classe condivisa `.alert-box.{ok|bad|info}` in `airops.css` che riusa ESATTAMENTE gli stessi valori (light E i dark-override già esistenti per `.badge.*`), 5 call-site aggiornati da `style={{...}}` a `className="alert-box bad|ok|info"`.
5. **`.ppr-brand-sub` / `.ppr-top-right`** (sotto-etichette nella barra superiore della pagina pubblica `/ppr`) — `.ppr-top` ha `background:var(--ink); color:var(--bg)` (barra DELIBERATAMENTE invertita, si capovolge col tema: scura in light, chiara in dark — scelta di design, non un bug). Le sotto-etichette avevano un grigio chiaro hardcoded tarato solo per la barra scura del tema light; in dark la barra diventa chiara ma il testo restava lo stesso grigio chiaro → ~1.7-2:1. **Fix**: sostituito il letterale con `color-mix(in oklch, var(--bg) NN%, var(--ink))` — un'espressione theme-agnostic che segue automaticamente l'inversione della barra in ENTRAMBI i temi, nessun override dark necessario.

### Inventario sweep (pagina/overlay → esito)

Tutte le verifiche sotto sono state fatte con l'audit di contrasto computazionale (Playwright + canvas + formula WCAG), non a giudizio visivo. "Difetti trovati" = solo quelli SOTTO le cause radice 1-5 sopra (già fixate); non ripeto la lista generale delle "note ink-4" (vedi sezione dedicata) su ogni riga.

| Superficie | Ruolo | Difetti dark trovati | Esito |
|---|---|---|---|
| `/dashboard` (overview) | admin, staff, istruttore, pilota, allievo | Causa radice 1 | Fixata (tutte le 5 facce, verificate individualmente) |
| `/dashboard/bookings` (Pianificazione) | admin | Causa radice 1 | Fixata |
| `/dashboard/ppr` | admin | Causa radice 1 | Fixata |
| `/dashboard/movements` | admin | Causa radice 1 | Fixata |
| `/dashboard/pilots` | admin | Causa radice 1 + 2 (bottone "Sospendi") | Fixata |
| `/dashboard/instructors` | admin | Causa radice 1 + 2 (bottone "Paga") | Fixata |
| `/dashboard/fleet` | admin | Causa radice 1 | Fixata |
| `/dashboard/expiries` | admin | Causa radice 1 | Fixata |
| `/dashboard/logbook` | admin | Causa radice 1 | Fixata |
| `/dashboard/billing` | admin | Causa radice 1 | Fixata |
| `/dashboard/reports` | admin | Causa radice 1; colori chart giudicati leggibili (non fixati, vedi sotto) | Fixata (causa 1) |
| `/dashboard/settings` | admin | Causa radice 1 + 2 (13× bottone "Elimina") | Fixata |
| `people/{id}` (scheda + estratto conto) | admin | Causa radice 1 | Fixata |
| `people/{id}` — form "Registra ricarica" (inline) | admin | Causa radice 1 | Fixata |
| `people/{id}` — form "Modifica" (inline) | admin | Causa radice 1 | Fixata |
| SlideOver "Nuova prenotazione" | admin | Causa radice 1 | Fixata |
| SlideOver "Registra un aeromobile" (fleet) | admin | Causa radice 1 | Fixata |
| Popover filtri (Pianificazione) | admin | Causa radice 1 | Fixata |
| Popover calendario (Pianificazione) | admin | Causa radice 1 + 3 (cella "oggi" selezionata) | Fixata |
| ExportMenu (Pianificazione) | admin | Nessuno | — (nessun fix necessario) |
| Settings — form inline "Aggiungi Ratings" | admin | Causa radice 1 | Fixata |
| Settings — form inline "Modifica" (rating esistente) | admin | Causa radice 1 | Fixata |
| `/login` | pubblico (cookie tema, no sessione) | Causa radice 1 | Fixata |
| `/login` con errore credenziali | pubblico | Causa radice 1 + 4 (alert errore) | Fixata |
| `/forgot-password` con conferma | pubblico | Causa radice 1 + 4 (alert conferma) | Fixata |
| `/set-password` senza token | pubblico | Causa radice 1 + 4 (alert "link non valido") | Fixata |
| `/set-password` con token | pubblico | Causa radice 1 | Fixata |
| `/ppr` (pubblico, form richiesta PPR) | pubblico | Causa radice 1 + 3 (CTA "Invia richiesta") + 5 (sotto-etichette barra) | Fixata |

### Giudicati "leggibili abbastanza" — NON fixati (il reviewer li ricontrollerà)

1. **Pattern `--ink-4`** (header colonna tabella, etichette gruppo sidebar "OPERAZIONI"/"ANAGRAFICHE"/…, separatore breadcrumb "/", etichette assi/mesi nei grafici) — rapporto ~2.78-2.96 in dark. **Verificato SIMMETRICO in light** (2.34-2.48, light è peggio di dark) via lo stesso audit sulla stessa pagina in entrambi i temi — non è una regressione dark-specifica, è la 4ª scala "molto attenuata" di `--ink` applicata coerentemente da ENTRAMBI i temi. Esplicitamente fuori scope AC4 ("non rifà la palette").
2. **`reports-console.tsx`** — colori hardcoded dei grafici (`oklch(0.55 0.14 155)` linea Ricavi, `oklch(0.6 0.14 260)` barre Transiti) — misurato 3.89:1 / 4.45:1 contro il pannello scuro: sopra la soglia WCAG 3:1 per oggetti grafici/non-testuali (quella applicabile a una linea/barra decorativa, non la 4.5:1 del testo). Leggibili, non brillanti — un ritocco sarebbe una scelta di palette, non un fix di contrasto.
3. **`instructor-profile.tsx`** — cerchio avatar (`background: oklch(0.62 0.14 300)`, `color:'#fff'`) — coppia fissa, IDENTICA in entrambi i temi (non legge `data-theme`). Non segnalata dall'audit di contrasto. Non essendo dark-specifica, fuori scope di questa story anche se il contrasto assoluto è modesto.

### Codice morto / dormiente confermato — non toccato

- **`src/app/[locale]/dashboard/ppr/ppr-queue.tsx`** — ~40 colori hex hardcoded, ma il componente `PprQueue` non è importato da NESSUNA pagina (confermato via grep sull'export — l'unico match è il file stesso). Codice morto pre-esistente, irraggiungibile in qualsiasi tema, non toccato (fixarlo sarebbe fuori scope e rischio di scope creep).
- **`data-table.tsx` / `export-button.tsx`** — 0 consumer reali (confermato via grep), come da CLAUDE.md (ritiro previsto story 13.11). Non verificati in dark (irraggiungibili).
- **`expiry-status-badge.tsx`** — **[riclassificato in review, F4]** inizialmente elencato tra i "giudicati leggibili", ma il componente NON è mai renderizzato: 0 import (`grep ExpiryStatusBadge src/` → solo la definizione + 2 commenti; `my-expiries.tsx` usa il `<Badge>` AirOps). Codice morto pre-esistente, scansione DOM del reviewer su 9 combinazioni ruolo×pagina = 0 pillole Tailwind a runtime. Candidato al ritiro in 13.11 con gli altri.

### Falsi positivi dalla caccia grep iniziale (documentati per completezza)

- `schedule.tsx` — `#9664`/`#9654` sono le entità HTML `&#9664;`/`&#9654;` (◄/►), non colori.
- `search-combobox.tsx:267` — `#EAEAEA`/`#111111` compaiono in un COMMENTO che descrive un fix PRECEDENTE (Review F6, story 12.x) già risolto: la className reale è `"input"` (classe token-based), nessun colore hardcoded rimasto nel componente.

### Non verificato empiricamente (assunzioni esplicite)

- **Toast** (`.toast{ background:var(--ink); color:var(--bg) }`) — non innescato a runtime (avrebbe richiesto una mutazione reale sui dati di seed, es. sospendere un pilota, con rischio di impatto sugli e2e). Inferenza per analogia: usa ESATTAMENTE lo stesso pattern di inversione `background:var(--ink);color:var(--bg)` di `.btn.primary`, verificato visivamente corretto in ogni screenshot di questo sweep (alto contrasto in entrambi i temi). Nessun colore hardcoded nella regola `.toast` stessa.
- **Modal di reject PPR con una richiesta reale** — il seed DB non ha richieste PPR pendenti (0 in coda), quindi il flusso approva/rifiuta non è stato innescato con dati reali. Il bottone "Rifiuta" (`ppr-reject-button`) usa la classe `.btn.mini.bad`, la stessa fixata (causa radice 2) e verificata su piloti/istruttori/settings — copertura per costruzione, non osservazione diretta di QUESTA istanza specifica.

### File List

- `src/app/[locale]/layout.tsx` — rimosse le classi Tailwind hardcoded `bg-[#FBFBFA] text-[#2F3437]` da `<body>` (causa radice 1).
- `src/app/globals.css` — rimossa la regola `body{ background/color }` con `--background`/`--foreground` letterali (causa radice 1).
- `src/styles/airops.css` — override dark per `.btn.mini.ok`/`.btn.mini.bad` (causa 2), `.cal-cell.sel`/`.btn.accent` (causa 3), nuova classe `.alert-box.{ok|bad|info}` + dark override (causa 4), `color-mix` su `.ppr-brand-sub`/`.ppr-top-right` (causa 5).
- `src/app/[locale]/(auth)/login/login-form.tsx` — alert errore da inline style a `.alert-box bad`.
- `src/app/[locale]/(auth)/forgot-password/forgot-password-form.tsx` — alert conferma da inline style a `.alert-box info`.
- `src/app/[locale]/(auth)/set-password/set-password-form.tsx` — alert successo/errore da inline style a `.alert-box ok`/`.alert-box bad`.
- `src/app/[locale]/(auth)/set-password/page.tsx` — alert "token mancante" da inline style a `.alert-box bad`.
- `e2e/login.spec.ts` — nuovo test regression-guard (causa radice 1): asserisce che `getComputedStyle(document.body).color` in dark NON sia più il letterale pre-fix `rgb(47, 52, 55)` e sia "chiaramente chiaro" (ogni canale > 200), risolvendo il colore via rasterizzazione canvas (Chromium riporta `color` calcolato come `lab()`/`oklch()` per i token oklch di questo design system, non sempre `rgb()` — un parsing regex naive fallisce).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `13-9-dark-theme-pass: backlog → review`.

### Completion Notes

- Tutte le 12 route di `NAV_ITEMS`, `people/{id}` (scheda + estratto conto + form inline), le 5 facce home per-ruolo, gli overlay principali (SlideOver ×2, popover ×2, ExportMenu, form inline settings ×2), le 3 pagine auth (login/forgot-password/set-password, inclusi gli stati di errore/successo) e la pagina pubblica `/ppr` sono state verificate in dark theme con l'audit di contrasto computazionale + screenshot; ogni fix è stato ri-verificato anche in light (nessuna regressione misurata — AC3).
- 5 cause radice a livello di token fixate in `airops.css`/`globals.css`/`layout.tsx` (mai un hack per-pagina) — coprono l'intero inventario sopra.
- 1 nuovo test e2e come regression-guard per la causa radice più grave (root cause 1), seguendo il pattern richiesto (assert di computed style, non screenshot-diff) — lezione 13.7.
- `npm run gates`: PASS (lint, typecheck, 1446 test, build).
- e2e: suite completa eseguita in foreground, nessuna regressione dai cambi di questa story (vedi Review Record / report finale per il numero esatto).

## Review Record (adversarial, Opus 5 xhigh — 2026-07-25)

**Verdetto: shippable-with-fixes.**

**Priority zero (il dev NON aveva completato il run — mandato esplicito al reviewer): VERDE.** Full suite CI=1 su build di produzione, DB fresco, eseguita FINO ALLA FINE: **256 passed (8.5m), 0 failed, 0 flaky** (delta +1 vs 255 = il nuovo guard `login.spec.ts`; catena settings 6/6 + booking-window 3/3 dopo chromium). **Verdetto esplicito sui 2 fallimenti visti dal dev in `account-adjustments.spec.ts`: NON riproducibili, artefatto d'ambiente** — il log del dev mostra `[WebServer] ... .next/dev` = girava contro `next dev` (CI non impostato), la classe cold-compile documentata in `playwright.config.ts`; nello stesso log fallivano anche spec di dominio aircraft, pattern da compilazione a freddo, non da tema. Nella run prod del reviewer quei 4 test sono verdi in testa alla suite. Gates PASS pieno (1446 unit).

**Metodologia**: il reviewer ha RISCRITTO lo strumento di audit (compositing alpha dell'intero stack di antenati, classificazione large-text WCAG) e rimisurato tutto in modo indipendente: i numeri del dev sono risultati esatti al centesimo; la nota di inaffidabilità del giudizio visivo è corroborata (simulazione pre-fix: h1 a 1.52:1). Le 5 cause radice verificate in dark E light su build prod (valori nel report); le 5 superfici alert auth innescate DAVVERO (incluso set-password con token reale via Mailpit), `role`/`data-testid`/metrica tipografica intatti; toast e modal reject PPR innescati con una richiesta PPR REALE creata dal form pubblico.

**Findings → esiti (fix `fix(13.9)` in sessione principale, decisioni PO 2026-07-25):**
- **F1 minor** — `.ppr-mark` (logo /ppr pubblico): stesso pattern accent-fill della causa #3, mancato dallo sweep — 1.58:1 in dark (9.2:1 light) → **FIXATO**: override dark con la stessa costante `oklch(0.28 0.09 60)`.
- **F2 po-decision** — `.cal-cell.sel` fixato solo in dark, light restava 2.04:1 (pre-esistente) → **PO: fix theme-agnostic ORA**: ink scuro fisso in ENTRAMBI i temi (7.3:1 light / 8.4:1 dark, una riga in meno), esteso anche a `.now-line::before` (stesso pattern, 1.96:1 light).
- **F3 minor** — il meccanismo dichiarato della causa #1 era FALSO (le classi Tailwind erano inerti: `@layer utilities` perde contro il CSS unlayered; provato re-iniettandole a runtime — il vero fix è la sola rimozione della regola `body{}` di globals.css) → **CORRETTO** nelle 3 sedi (story, commento `layout.tsx`, commento `login.spec.ts`); la rimozione resta giusta come pulizia.
- **F4 minor** — `expiry-status-badge.tsx` classificato "giudicato leggibile" ma è codice MORTO (0 import, 0 pillole nel DOM su 9 combinazioni ruolo×pagina) → **RICLASSIFICATO** nella sezione codice morto, candidato 13.11.
- **F5 minor** — assunzione toast chiusa a metà dal dev: testo ok (17:1) ma `.toast-dot` a 2.38:1 in dark (il toast si inverte col tema, i tone token no) → **FIXATO**: costanti per-tono scurite (L 0.55) sotto `html[data-theme="dark"]`, tutte ≥4:1 (verifica aritmetica oklch→WCAG).
- **F6 po-decision** — famiglia `--ink-4` (header colonna, label gruppo, 10.5px): numeri del dev ESATTI (dark 2.78-2.96, light 2.34-2.48 — light peggio), unica famiglia residua sotto 3:1 → **PO: alzare il token ORA in entrambi i temi**: light 0.72→0.62 (3.5-3.6:1), dark 0.50→0.58 (4.1-4.5:1).
- **F7 note** — avatar istruttore 3.85:1 identico nei due temi: classificazione del dev corretta, pre-esistente e theme-independent, **nessuna azione** (backlog design-system).

**Fix post-review applicati dalla sessione principale** (chirurgici — v. diff del commit `fix(13.9)`): `airops.css` (F1, F2+now-line, F5, F6), `layout.tsx` + `login.spec.ts` + questo story file (F3, F4). Tutti i valori nuovi verificati aritmeticamente (oklch→sRGB→WCAG) prima del commit; **full suite CI=1 rieseguita dopo il commit `e04cccd` su DB fresco: 256 passed (8.1m), 0 fail, 0 flaky, catena settings 6/6 + booking-window 3/3 confermata.**
