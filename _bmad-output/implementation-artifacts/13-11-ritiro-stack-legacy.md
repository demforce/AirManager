---
baseline_commit: 0439757
---

# Story 13.11: Ritiro stack legacy — Tailwind/Geist/TanStack + componenti e glife orfane

Status: review

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

## Review Record

_(compilato dopo la review adversarial)_
