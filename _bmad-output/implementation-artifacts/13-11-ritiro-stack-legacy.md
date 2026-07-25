---
baseline_commit: 0439757
---

# Story 13.11: Ritiro stack legacy — Tailwind/Geist/TanStack + componenti e glife orfane

Status: ready-for-dev

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

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
