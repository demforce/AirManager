---
baseline_commit: 0439757
---

# Story 13.11: Ritiro stack legacy — Tailwind/Geist/TanStack + componenti e glife orfane

Status: done

## Story

As a manutentore del progetto,
I want rimuovere le dipendenze UI legacy (Tailwind CSS, Geist, TanStack Table) e i componenti/asset ormai orfani,
so that il design system AirOps sia l'UNICO stack UI e il bundle/manutenzione non paghino codice morto.

**Riferimenti vincolanti**: ratifica R4 del piano epic-13 (SPLIT dalla 13.3, decisione utente 2026-07-24) + addenda dalle review 13.8 (F6) e 13.9 (F4). La review 13.3 ha già verificato: **0 consumer reali** di `DataTable`/`ExportButton` in `src/` — nessuna migrazione di consumer necessaria, solo rimozione.

## Acceptance Criteria

1. **(Componenti morti)** Rimossi: `src/components/data-table.tsx` (unico consumer TanStack), `src/components/export-button.tsx`, `src/components/dashboard/expiry-status-badge.tsx` (review 13.9 F4: 0 import, mai renderizzato), `src/app/[locale]/dashboard/ppr/ppr-queue.tsx` (dead-code confermato 13.6 e 13.9: `PprQueue` non importato da nessuna pagina). Prima di ogni rimozione: ri-verifica 0 consumer (grep import + export name) — se un consumer è comparso nel frattempo, FERMATI e segnala.
2. **(Glife orfane)** Rimosse `Icon.fleet` da `icons.tsx` e l'entry `'fleet'` dal literal union `NavIconKey` (`route-registry.ts` — review 13.8 F6). Ri-verifica 0 usi prima di rimuovere.
3. **(Geist)** Rimosso il wiring `GeistSans` da `src/app/[locale]/layout.tsx` (import + `${GeistSans.variable}` + la utility `font-[family-name:var(--font-sans)]` sul body — PROVATA inerte dalla review 13.9: perde contro `body{font-family:var(--font-ui)}` di airops.css) e la dipendenza `geist` da `package.json`. I font veri restano gli `@fontsource/*` self-hosted (invariati).
4. **(Tailwind)** Rimosso Tailwind CSS: direttive/`@import` in `src/app/globals.css`, config PostCSS, dipendenze in `package.json`. PRIMA della rimozione: sweep `grep -rE 'className="[^"]*\\b(bg-|text-|border-|rounded|flex|grid|p-|m-|min-h|max-w)' src/` per censire le utility residue VIVE — dopo le rimozioni degli AC1 le utility dovrebbero sopravvivere solo in punti già serviti da airops.css (es. `flex min-h-full flex-col` sul body: sostituire con regola CSS equivalente in airops.css/globals.css o classe dedicata). Ogni utility residua va o sostituita con l'equivalente token-based o dimostrata inerte e rimossa. Il build DEVE restare identico visivamente (spot-check screenshot su 3-4 pagine, entrambi i temi).
5. **(TanStack)** Rimossa `@tanstack/react-table` da `package.json` (unico consumer = `data-table.tsx`, rimosso in AC1).
6. **(Lockfile e CI)** `package.json` + lockfile aggiornati SOLO via `npx -y npm@10` (regola macchina locale). `.env.example`/`ci.yml`/hook NON dovrebbero cambiare (nessuna env var coinvolta) — verificare che `env.ci-sync.test.ts` resti verde.
7. **(e2e + verifica)** Nessun e2e nuovo richiesto (rimozione pura); la full suite CI=1 è l'arbitro che nulla si è rotto. `npm run gates` verde; spot-check visivo (AC4) documentato nel Dev Agent Record. CLAUDE.md: aggiornare la riga Stack (le dipendenze non sono più "DORMIENTI" — sono rimosse; la 13.11 era l'ultima story che le citava) NELLO STESSO commit.

## Contesto (puntatori — ricognizione 2026-07-25, da rifinire alla partenza)

- `data-table.tsx` (TanStack, Tailwind classes), `export-button.tsx` (Tailwind): 0 consumer (review 13.3 N4, ri-confermato 13.9). `ExportMenu` (`src/components/ui/export-menu.tsx`, AirOps) è il sostituto ovunque (8 pagine).
- `GeistSans`: solo `layout.tsx` (`className={\`\${GeistSans.variable} h-full antialiased\`}` + utility font sul body).
- `expiry-status-badge.tsx`: review 13.9 F4 (0 import). `ppr-queue.tsx`: dead-code (13.6 + 13.9, ~40 colori hex, mai importato).
- Tailwind v4: utilities in `@layer utilities` (perdono contro airops.css unlayered — review 13.9 F3): molte utility residue sono già oggi INERTI, ma vanno censite una a una (AC4).
- **Ambiente**: identico alle story precedenti (DB fresco al dispatch, gates prima del commit, e2e foreground su file, MAI push, `export JOBS_SECRET=<non-placeholder>` per la suite CI=1 — v. HANDOFF). Questa story PUÒ toccare `package.json` (è il suo scopo — unica eccezione alla regola). Commit: `feat(13.11): ritiro stack legacy — Tailwind/Geist/TanStack + componenti orfani` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Qualunque cambiamento visivo o funzionale: questa story rimuove SOLO codice morto/inerte; se una rimozione cambia il rendering, il fix è ripristinare l'equivalente token-based, non ridisegnare.
- `search-combobox.tsx`: già ritematizzato AirOps (resta, invariato).

## Dev Agent Record

### Deviazioni dai percorsi letterali dell'AC (file esistono, path diverso)

- **AC1**: `src/components/dashboard/expiry-status-badge.tsx` non esiste — il file orfano (0 import, review 13.9 F4, stessa palette `EXPIRY_STATUS_BADGE_CLASSES`) è a `src/app/[locale]/dashboard/expiries/expiry-status-badge.tsx`. Rimosso da quel percorso.
- **AC2**: `icons.tsx` non è in `src/components/shell/` ma in `src/components/ui/icons.tsx` (route-registry.ts stesso lo dichiara: "`Icon.*` (`src/components/ui/icons.tsx`)"). Modificato lì.

Nessun altro scostamento: gli altri 3 file dell'AC1 (`data-table.tsx`, `export-button.tsx`, `ppr-queue.tsx`) e `route-registry.ts` erano ai percorsi indicati.

### Verifiche 0-consumer (AC1/AC2, prima di ogni rm)

Per ciascuno, grep import (`from '...basename'`) + grep del nome esportato in tutto `src/`, ESCLUSO il file stesso:
- `data-table.tsx` (`DataTable`/`DataTableProps`): 0 import reali; 3 hit solo in commenti (`new-booking-form.tsx`, `aircraft-editor.tsx`, `people/[id]/account/page.tsx`).
- `export-button.tsx` (`ExportButton`/`ExportButtonProps`): 0 import reali; hit solo in commenti (`export-menu.tsx`, `account/page.tsx`, `account-section.tsx`).
- `expiry-status-badge.tsx` (`ExpiryStatusBadge`, `EXPIRY_STATUS_BADGE_CLASSES`): 0 import reali; solo 2 commenti (`pdf/document.tsx`, `exports.service.ts` — spiegano perché la palette è duplicata lì, non toccati: fuori scope, non sono consumer del componente).
- `ppr-queue.tsx` (`PprQueue`): 0 import; `ppr/page.tsx` importa `PprConsole`, non `PprQueue`. `e2e/ppr-queue.spec.ts` esiste ma testa la pagina/feature via browser (nessun import di sorgente) — non è un consumer.
- `Icon.fleet`: 0 usi (`grep -rn "Icon\.fleet"` → vuoto).
- `icon: 'fleet'` / `NavIconKey` `'fleet'`: 0 usi in `NAV_ITEMS` (l'unica entry `fleet` in `NAV_ITEMS` usa `icon: 'plane'` dalla story 13.8, con commento che già segnalava l'orfano).

Nessun consumer vivo scoperto: tutte e 6 le rimozioni AC1/AC2 eseguite come da story.

### AC3 — Geist

`import { GeistSans } from 'geist/font/sans'` e `${GeistSans.variable}` rimossi da `layout.tsx`; `font-[family-name:var(--font-sans)]` (provata inerte, review 13.9) rimossa dal body. Dipendenza `geist` rimossa da `package.json`. `grep -rn "GeistSans\|geist/font"` post-rimozione: 0 hit in `src/`.

### AC4 — Censimento utility Tailwind residue

Comando dell'AC (`grep -rlE 'className="[^"]*\b(bg-|text-|border-|rounded|flex|grid|p-|m-|min-h|max-w)' src/`): **28 file** con hit. La maggioranza erano **falsi positivi**: il pattern `\bgrid` matcheva dentro classi AirOps legittime tipo `form-grid`/`week-grid`/`ppr-grid`/`cal-grid`/`fleet-grid`/`grid-line` (word-boundary su `-`), tutte definite in `airops.css` — non toccate. Sweep supplementare con prefissi più ampi (`gap-`,`items-`,`w-`,`px-`,`py-`,`mt-`,`relative`,`absolute`,...) per non fidarmi solo del pattern dell'AC.

**Utility Tailwind reali trovate: 16 occorrenze in 8 file** (censite una a una, nessuna assunta):

| File | Classe | Verdetto | Azione |
|---|---|---|---|
| `(auth)/login\|forgot-password\|set-password/page.tsx` (×3) | `flex min-h-screen items-center justify-center px-6 py-16` su `<main>` | **VIVA** (nessuna regola airops.css compete su `<main>`) | → `style={{display:'flex',minHeight:'100vh',alignItems:'center',justifyContent:'center',padding:'64px 24px',...}}` |
| `layout.tsx` `<html>` | `h-full` | **INERTE** (airops.css `html,body{height:100%}` già lo copre) | rimossa, nessuna sostituzione |
| `layout.tsx` `<html>` | `antialiased` | **VIVA solo per `-moz-osx-font-smoothing`** (il webkit-part duplicava airops.css) | `-moz-osx-font-smoothing:grayscale` aggiunta alla regola `body{}` esistente in airops.css (accanto a `-webkit-font-smoothing` già presente) |
| `layout.tsx` `<body>` | `flex min-h-full flex-col` | **VIVA** (geometria shell reale — vedi commento `.ppr-page`/`flex-shrink:0` in airops.css, che documenta la dipendenza) | → regola `body{display:flex;flex-direction:column;min-height:100%}` in `globals.css` |
| `bookings-table.tsx:334` | `mt-4 text-sm` (empty state) | VIVA (nessuna regola compete su `<p>`) | → `style` inline `marginTop:16,fontSize:14,lineHeight:'20px'` |
| `bookings-table.tsx:375-376` | `flex flex-col gap-2` / `flex flex-wrap items-center gap-2` (cancel-confirm) | VIVA | → `style` inline equivalenti |
| `bookings-table.tsx:493` | `text-xs` (deny-error `<p>`) | VIVA | → `style` inline `fontSize:12,lineHeight:'16px'` |
| `schedule.tsx:547,626` | `mt-4 text-sm` (×2, empty state) | VIVA | → `style` inline, stessi valori |
| `ppr-console.tsx:271` | `text-xs` (reject-error `<p>`) | VIVA | → `style` inline |
| `search-combobox.tsx:246` | `relative min-w-[200px]` | VIVA (`.fld` in airops.css non setta `position`/`min-width`) | → `style={{position:'relative',minWidth:200}}` — nota: la "Fuori scope" della story per questo file va letta come "nessun re-styling", non "nessuna modifica": questa era l'unica dipendenza Tailwind viva del file, necessaria per non rompere il layout dopo il retiro |

**Totale: 16 hit reali → 0 dimostrate morte-e-lasciate (le uniche "morte" erano falsi-positivi grid, non toccate), 1 inerte pura (`h-full`, rimossa senza sostituto), 15 vive (tutte migrate 1:1 a CSS/inline-style equivalente, valori Tailwind v4 standard: `mt-4`=16px, `text-sm`=14px/20px, `text-xs`=12px/16px, `gap-2`=8px, `px-6`=24px, `py-16`=64px).**

**Correzione post-review (F4): il censimento sopra era INCOMPLETO — il metodo (grep su `className="..."` a doppi apici) è cieco ai `className={\`...${cond ? '...' : ''}\`}` (template literal/ternari) e alle classi con prefisso non nella lista di prefissi dell'AC.** Il metodo corretto, usato dal reviewer e rieseguito qui, è uno sweep token-vs-CSS: estrarre OGNI token da qualsiasi prop `class(Name)?=` (stringa, espressione, template literal) e confrontarlo con l'insieme di classi definite in `airops.css`+`globals.css`. Il totale reale censito è **16 + 20 = 36 hit**, non 16:

- **16 hit** già in tabella sopra (metodo grep dell'AC, doppi apici) — tutti corretti, nessuna revisione.
- **18 hit non censiti** (F1): `pointer-events-none opacity-40` in template literal, 9 file × 2 punti (pagination prev/next) — vive a baseline (bundle pre-13.11 le conteneva), morte a HEAD (link "disabilitato" pienamente opaco e cliccabile). Fix: token-based `[aria-disabled="true"].btn` in `airops.css` + rimozione delle due utility dai 9 file (v. "Fix post-review" sotto).
- **2 hit non censiti** (F2): `sr-only` in `schedule.tsx:602,614` (doppi apici, ma prefisso `sr-` non nella lista dell'AC) — viva a baseline (bundle pre-13.11 la conteneva, `clip-path:inset(50%)` etc.), morta a HEAD (testo screen-reader renderizzato a video). Fix: `.sr-only` aggiunta ad `airops.css` con le stesse dichiarazioni.
- **Il PREFLIGHT (F3)**: non è un `className` quindi nessun metodo grep/sweep basato su classi poteva censirlo — è la rimozione di `@import 'tailwindcss'` stesso (il reset `@layer base` che ci viene incluso). Fix: mini-reset esplicito in `airops.css` (v. sotto).

Sweep token-vs-CSS post-fix (`class-sweep.mjs`): **5 token non definiti**, tutti falsi positivi già noti (`all`/`day`/`week`/`hint`/`OUT_OF_SERVICE` — stringhe di confronto JS, non classi CSS, verificate una a una). Zero classi Tailwind morte residue.

Tailwind CSS rimosso: `@import 'tailwindcss'` + `@theme inline`/`:root{--font-sans/--font-serif}` (config-only, nessun consumer rimasto dopo AC1/AC3) da `globals.css`; `postcss.config.mjs` eliminato; `tailwindcss`+`@tailwindcss/postcss` rimosse da `package.json`.

### AC5 — TanStack

`@tanstack/react-table` rimossa da `package.json` (unico consumer era `data-table.tsx`, già rimosso in AC1).

### AC6 — Lockfile

`npx -y npm@10 install` (mai npm nudo): rimossi 12 pacchetti (geist, tailwindcss, @tailwindcss/postcss, @tanstack/react-table + transitive). `.env.example`/`ci.yml`/hook non toccati (nessuna env var coinvolta). `npm run gates` verde conferma `env.ci-sync.test.ts` incluso.

### AC7 — CLAUDE.md

Riga Stack aggiornata nello stesso commit: rimosso il linguaggio "DORMIENTI" (ora le dipendenze sono rimosse), rimosso il riferimento a 13.11 come "story dedicata" futura (è questa story).

### Verifica visiva (AC4)

Server dev (`npm run dev`), script Playwright-core throwaway (`~/.cache/ms-playwright/chromium-1228`, non committato) — login `admin@airmanager.local`. Pagine verificate in light+dark (screenshot + `getComputedStyle` sui punti di rischio):
- `/it/login` (+ forgot-password/set-password stesso pattern): centratura, `<main>` computed `display:flex;min-height:900px(=100vh viewport);align-items:center;justify-content:center;padding:64px 24px` — identico all'originale Tailwind.
- `/it/dashboard` (shell completa: sidebar, KPI, calendario) — layout intatto in entrambi i temi.
- `/it/dashboard/bookings` (tabella "Pianificazione"): empty-state `<p>` "Nessuna prenotazione." verificato via `getComputedStyle` → `marginTop:16px;fontSize:14px;lineHeight:20px` (match esatto Tailwind `mt-4 text-sm`).
- `/it/ppr` (pubblico, non autenticato): form PPR intatto in entrambi i temi — conferma che `.ppr-page`'s `flex-shrink:0` (che dipende dal body flex-column) continua a funzionare con la regola CSS sostitutiva.
- `/it/dashboard/logbook` (form volo con 3 `SearchCombobox`, filtro con 1 in più): 3 `.fld` con `style="position:relative;min-width:200px"` verificati via `getComputedStyle` → `position:relative;minWidth:200px` — nessuna rottura del layout del filtro/form (screenshot conferma, nessun overflow/wrap indesiderato).
- `/it/dashboard/pilots` (tabella con filtro testo semplice, non SearchCombobox): intatta.

Nessuna differenza visiva rilevata nei 6 punti verificati, in entrambi i temi.

### Gates

`npm run gates`: PASS lint (23s) · PASS typecheck (3s) · PASS test (9s, 1446/1446) · PASS build (35s).

### File List

- `CLAUDE.md` — riga Stack aggiornata (AC7)
- `package.json` / `package-lock.json` — rimosse `geist`, `tailwindcss`, `@tailwindcss/postcss`, `@tanstack/react-table` (via `npx -y npm@10 install`)
- `postcss.config.mjs` — rimosso
- `src/app/[locale]/layout.tsx` — Geist + Tailwind wiring rimossi da `<html>`/`<body>`
- `src/app/globals.css` — `@import 'tailwindcss'` + `@theme inline`/font tokens rimossi; nuova regola `body{display:flex;flex-direction:column;min-height:100%}`
- `src/styles/airops.css` — aggiunta `-moz-osx-font-smoothing:grayscale` alla regola `body{}`
- `src/components/data-table.tsx` — rimosso
- `src/components/export-button.tsx` — rimosso
- `src/app/[locale]/dashboard/expiries/expiry-status-badge.tsx` — rimosso
- `src/app/[locale]/dashboard/ppr/ppr-queue.tsx` — rimosso
- `src/components/ui/icons.tsx` — `Icon.fleet` rimosso
- `src/components/shell/route-registry.ts` — `'fleet'` rimosso da `NavIconKey`, commento aggiornato
- `src/app/[locale]/(auth)/login/page.tsx`, `forgot-password/page.tsx`, `set-password/page.tsx` — utility Tailwind del `<main>` → inline style
- `src/app/[locale]/dashboard/bookings/bookings-table.tsx` — 3 punti Tailwind → inline style
- `src/app/[locale]/dashboard/bookings/schedule.tsx` — 2 punti Tailwind → inline style
- `src/app/[locale]/dashboard/ppr/ppr-console.tsx` — 1 punto Tailwind → inline style
- `src/components/search-combobox.tsx` — `relative min-w-[200px]` → inline style + commento aggiornato

### Fix post-review (2026-07-25)

Applicati i 7 finding della review adversarial (Opus 5 xhigh) — v. "Review Record" sotto per il verdetto completo. Nessun redesign: ogni fix ripristina il comportamento baseline (pre-Tailwind-retirement) con un equivalente token-based in `airops.css`, verificato per confronto diretto contro le regole del bundle CSS Tailwind pre-13.11 ancora su disco (`.next/dev/static/chunks/_0uehz7x._.css`, non committato) e/o contro il tarball ufficiale `tailwindcss@4.3.2`.

**F1 (major) — stato "disabilitato" della paginazione**: aggiunta `.btn[aria-disabled="true"]{ opacity:.4; pointer-events:none; }` in `airops.css`, agganciata all'attributo `aria-disabled` già presente su tutti e 18 i punti (9 console × prev/next) — verificato con un grep dedicato prima del fix (18/18 avevano già l'attributo, nessuna aggiunta necessaria). Rimossa la classe morta `pointer-events-none opacity-40` dai 9 file (il ternario nel template literal si riduce a un `className="btn"` semplice, essendo lo stato ormai comunicato solo da `aria-disabled` + CSS). Verifica: `getComputedStyle` (`opacity:"0.4"`, `pointerEvents:"none"`) su pilots/bookings/billing/fleet/logbook; test funzionale (Playwright `click()` sul link "Precedente" a pagina 1 — timeout perché il pointer non raggiunge l'elemento, nessuna navigazione a `?page=0`); sweep token-vs-CSS post-fix (0 `pointer-events-none`/`opacity-40` residui).

**F2 (major) — `.sr-only`**: aggiunta ad `airops.css` con le ESATTE dichiarazioni del preflight Tailwind (`position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border-width:0;`), JSX invariato. Verificato su un blocco realmente clampato (booking che attraversa la mezzanotte locale, seed 2026-07-25 21:33–22:33Z = 23:33–00:33 CEST): i 3 span `.sr-only` hanno bounding box 1×1px (`display:block` ma `clip-path:inset(50%)` + `overflow:hidden` li azzerano visivamente), screenshot pulito (nome persona + orario + "▶", nessun testo hint a video).

**F3 (major) — preflight rimosso senza sostituto**: mini-reset esplicito in testa ad `airops.css`, chiuso iterando col metodo del reviewer (iniezione del CSS baseline via Playwright su pagine reali + diff dei computed style, `diff2.mjs`) finché il diff sulle 11 pagine dashboard + login + ppr pubblico, in ENTRAMBI i temi, non conteneva più differenze visivamente rilevanti. Regole aggiunte, e perché:
- `*,*::before,*::after{ box-sizing:border-box; margin:0; padding:0; border:0 solid; }` (estende la regola box-sizing già esistente) — il preflight Tailwind resetta margin/padding/border su OGNI elemento (`*, ::before, ::after, ::backdrop`); l'intero design system AirOps è stato costruito e tarato visivamente MENTRE questo reset era attivo (ogni componente setta la propria padding esplicita partendo da zero) — la sua assenza faceva riemergere i default UA del browser: `<option>` con `padding-left:2px` invece di `0`, `.bare-input`/`.iconbtn` con padding UA nativa (2px/6px) invece di `0`, altezze exceeding di conseguenza (topbar, righe tabella) di 1-2px cumulati sull'intera pagina.
- `ol,ul,menu{ list-style:none; }` — il preflight lo resetta; senza, i puntini elenco ricompaiono (verificato su `/ppr` pubblico, card "Come funziona"). `new-booking-form.tsx:535` setta `style={{listStyle:'disc'}}` inline sul proprio `<ul>` — un inline style vince sempre su una regola in cascata via tag-selector, quindi resta correttamente puntato (verificato).
- `p,h1,h2,h3,h4,h5,h6,figure,blockquote{ margin:0; }` — il preflight NON ha una regola dedicata qui (il margine di questi tag è già a zero via il reset universale sopra), ma la si mantiene esplicita per leggibilità/robustezza indipendente dall'ordine delle regole. Effetto misurato: gli hint `<p class="hint">` di Impostazioni (classe non definita in CSS) avevano `margin-bottom:14px` (default UA) invece di `0`, spaziando le righe in modo non voluto; stesso per il `<p>` "Password dimenticata?" di login (traslava la card di ~6px).
- `button,input,select,optgroup,textarea{ letter-spacing:inherit; font-weight:inherit; }` — preflight: `letter-spacing:inherit` (il `.btn`'s testo aveva `letter-spacing:normal` invece di ereditare il `-0.005em` del body, ±1px di larghezza sui bottoni) e — scoperta durante l'iterazione di chiusura, non nell'evidenza originale del reviewer ma stesso meccanismo — `font-weight:inherit` (senza, gli `<optgroup>` nativi di un `<select>` — es. le categorie di Contabilità — rendevano in bold invece che regular, uno scostamento visibile aprendo il menu a tendina).
- `svg{ display:block; vertical-align:middle; }` — preflight: senza, `vertical-align` torna `baseline` (comportamento UA per elementi inline-block), impercettibile nei bottoni (già `display:inline-flex` via `.btn`) ma corretto per coerenza col comportamento baseline testato per l'intera durata dell'epic 12/13.

Diff di chiusura (`diff2.mjs`, entrambi i temi, 11 pagine dashboard + login + ppr pubblico): residuano SOLO due classi di differenza, entrambe verificate innocue — (a) `appearance` computed `auto` vs `button` su ogni `<button>`: per un elemento `<button>` reale i due valori risolvono nello stesso rendering nativo (chrome/bordo interamente sovrascritti da `.btn`/`.iconbtn`'s `background`/`border` espliciti) — nessuna differenza a schermo, confermato via screenshot; (b) input `type="hidden"` (Next.js Server Actions) e l'honeypot PPR (`x=-9999`) — invisibili per costruzione, mai dipinti. Nessuna delle due era nell'elenco delle regole raccomandate dalla review, e aggiungerle avrebbe ecceduto lo scopo "solo ciò che è load-bearing".

**F4 (minor) — censimento**: tabella AC4 corretta (v. sopra), sweep `class-sweep.mjs` rieseguito: 5 token non definiti residui, tutti falsi positivi noti (`all`/`day`/`week`/`hint`/`OUT_OF_SERVICE`).

**F5 (minor) — README**: riga 7 aggiornata, "Tailwind CSS 4" → "design system AirOps custom (CSS + primitive React)".

**F6 (note) — commento `date-input.tsx:30`**: riscritto (0 consumer passano un `className` custom, verificato — la prop resta, non rimossa, come da istruzione).

**F7 (note) — guard e2e**: 2 assert aggiunti in `e2e/bookings.spec.ts`. (a) Nel test "crosstalk href" (già crea 21 prenotazioni, garantendo `totalPages > 1`): prima della navigazione esistente a `?page=2`, verificato che il link "Precedente" a `?page=1` abbia `aria-disabled="true"`, `pointerEvents:"none"` via `getComputedStyle`, e che un click `force:true` (bypassa SOLO l'attesa di Playwright, non il vero pointer-events del browser) non cambi l'URL. (b) Nuovo test dedicato: una prenotazione che attraversa la mezzanotte locale (garantito `clampedBottom=true` indipendentemente dalla finestra `sched.openTime`/`closeTime` configurata — a differenza di uno scenario "bordo finestra", che invece dipende dai settings correnti del DB, si è scoperto essere fragile in ambiente con una finestra 00:00–23:59 già configurata) — asserisce che il suo `.sr-only` abbia bounding box ≤1×1px.

### File List (fix post-review)

- `src/styles/airops.css` — mini-reset preflight (F3), `.btn[aria-disabled="true"]` (F1), `.sr-only` (F2)
- `src/app/[locale]/dashboard/bookings/bookings-table.tsx`, `expiries/scadenze-console.tsx`, `people/[id]/account-section.tsx`, `pilots/pilots-console.tsx`, `fleet/fleet-console.tsx`, `billing/billing-console.tsx`, `logbook/logbook-console.tsx` — rimossa `pointer-events-none opacity-40` dal template literal (F1)
- `src/app/[locale]/dashboard/ppr/page.tsx`, `movements/page.tsx` — idem (F1)
- `README.md` — riga Stack (F5)
- `src/components/ui/date-input.tsx` — commento (F6)
- `e2e/bookings.spec.ts` — 2 guard e2e (F7)
- `_bmad-output/implementation-artifacts/13-11-ritiro-stack-legacy.md` — tabella AC4 corretta (F4), questa sezione, Review Record

## Review Record

### Adversarial (Opus 5 xhigh — 2026-07-25)

**Verdetto: shippable-with-fixes.**

**Priority zero** (eseguita dal reviewer perché il dev non aveva completato il run): full suite CI=1 su build prod, DB fresco, foreground-to-file — **258 passed (7.6m), 0 failed, 0 flaky, 0 retry**, esattamente il numero atteso (nessun e2e nuovo previsto da questa story). Catena project serializzati confermata sul log (`chromium`=249, `settings`=6, `booking-window`=3, in coda). `e2e/ppr-queue.spec.ts` (feature PPR, non il componente morto rimosso): 6/6.

**AC audit**: AC1 (componenti morti), AC2 (glife orfane), AC3 (Geist), AC5 (TanStack), AC6 (lockfile/CI) — FATTI e TESTATI, verificati indipendentemente dal reviewer sul commit baseline (`git grep ... 0439757`): 0 consumer reali per tutte le 6 rimozioni, deviazioni di path (AC1/AC2) e la deviazione dichiarata su `search-combobox.tsx` CONFERMATE corrette (quest'ultima con la prova, mancante al dev, che il bundle CSS pre-13.11 conteneva davvero `.relative`/`.min-w-[200px]` come classi vive). AC4 (Tailwind) e AC7 (verifica) — **PARZIALI**: le rimozioni core sono corrette ma "il build DEVE restare identico visivamente" era violato in 3 modi provati (F1/F2/F3 sotto) e lo spot-check visivo del dev (6 pagine, screenshot senza baseline) non poteva vederli.

**Findings** (F1-F3 major, F4-F5 minor, F6-F7 note) — tutti fixati in questa sessione, v. "Fix post-review" sopra per il dettaglio:
- **F1**: `pointer-events-none opacity-40` erano utility Tailwind VIVE a baseline (provato dal bundle CSS pre-13.11 ancora su disco) sfuggite al censimento AC4 (in template literal, 18 punti/9 console) — a HEAD il link "Precedente" a pagina 1 era pienamente opaco E cliccabile (naviga a `?page=0`), provato sia via computed style sia funzionalmente (hit-test + click reale).
- **F2**: `sr-only` era un'altra utility Tailwind VIVA (bundle pre-13.11, `clip-path:inset(50%)` etc.) sfuggita al censimento (prefisso `sr-` non nella lista di prefissi dell'AC) — a HEAD il testo screen-reader dei blocchi volo clampati nella Pianificazione era renderizzato a video.
- **F3**: il PREFLIGHT (`@layer base` di Tailwind) è sparito senza sostituto — mai censito (non è un `className`, nessun grep/sweep basato su classi poteva vederlo): elenchi puntati ricomparsi su `/ppr` pubblico, margini UA sui `<p>` (Impostazioni, login), letter-spacing/metriche dei controlli alterate.
- **F4**: il censimento AC4 nel Dev Agent Record era dichiarato completo ma il metodo (grep su `className="..."` a doppi apici) era cieco ai template literal/ternari e ai prefissi non elencati — 20 hit reali (18 F1 + 2 F2) mancavano dalla tabella.
- **F5**: `README.md:7` dichiarava ancora "Tailwind CSS 4".
- **F6**: commento stale in `date-input.tsx:30` — parlava di "pagine legacy Tailwind" ormai inesistenti (né le pagine né Tailwind esistono più).
- **F7**: 258 test verdi non intercettavano né F1 né F2 — nessun assert su stato disabled/visually-hidden in tutta la suite e2e esistente.

**Lezione**: una suite 258/258 verde non garantisce l'assenza di regressioni visive quando il fix rimuove un intero framework CSS — serve un metodo di verifica ORTOGONALE ai test funzionali esistenti (diff dei computed style contro il bundle baseline realmente prodotto pre-rimozione), non solo screenshot "a occhio" senza baseline. I 2 guard e2e aggiunti in F7 chiudono la lacuna PER QUESTI due casi specifici, non in generale.

**Chiusura (sessione principale, 2026-07-26)**: la full suite post-fix, che il fix-subagent non aveva potuto portare a termine (48/259 verdi al momento del report, run morta con la sessione), è stata RIESEGUITA dalla sessione principale su DB fresco, build di produzione: **259 passed (7.4m), EXITCODE=0, 0 fail, 0 flaky, catena settings 6/6 + booking-window 3/3 confermata** (delta +1 vs 258 = il nuovo guard F7). Story DONE.
