---
baseline_commit: 98fc82a
---

# Story 12.1: Fondamenta del design system

Status: ready-for-dev

## Story

As a pilota o membro dello staff,
I want un'interfaccia con un linguaggio visivo coerente e professionale in ogni schermata,
so that l'app trasmetta la credibilità di uno strumento infra-grade, non di un sito web (FR-46, FR-47; epics.md «Epic 12», intent doc + DESIGN.md in `_bmad-output/brainstorming/brainstorm-ui-refactor-2026-07-12/`).

## Acceptance Criteria

1. **Given** il tema dell'applicazione, **When** una qualunque pagina è renderizzata, **Then** i token di `DESIGN.md` sono la fonte unica del tema (variabili in `globals.css` `@theme`): palette monocroma (canvas `#f5f5f5`, paper `#ffffff`, surface-alt `#fafafa`, ink `#0a0a0a`, ink-soft `#171717`, mid-gray `#737373`, hairline `#e5e5e5`, ember `#e7000b`), Geist su TUTTO il testo (il serif display SPARISCE), radius 18px sugli elementi interattivi / 24px sulle card / 10px nested, `--shadow-subtle` come unica ombra, body 14px — e in `src/` non restano occorrenze dei vecchi hex della palette warm (`#FBFBFA`, `#F7F6F3`, `#2F3437`, `#787774`, `#EAEAEA`, `#111111`, `#333333`) né `font-serif`.
2. **Given** i componenti base condivisi, **Then** esistono in `src/components/ui/` (NUOVI, custom — NIENTE shadcn/Radix in questa story, v. Contesto): `Button` (filled ink / ghost canvas / outline hairline, pill 18px, h≈36px, testo 14px/500), `Card` (+ `CardHeader`/`CardFooter` nested con radius asimmetrici), `Badge` (solid `#171717` / soft `#f5f5f5` / outline, capsula 12px/500), `Input` (fill `#f5f5f5`, ring hairline al focus, radius 18px) — e i pattern oggi duplicati inline li usano: le 16 definizioni locali di `inputClasses`, i ~28 primary button `bg-[#111111]`, i bottoni secondary/outline, le card/tile. `data-table.tsx`, `search-combobox.tsx`, `export-button.tsx` restylati sui token.
3. **Given** le superfici della pagina, **Then** lo stack a 3 toni (canvas → surface-alt → paper) crea la gerarchia: body canvas, card contenuto paper con bordo hairline + shadow subtle; nessun gradiente; l'ombra del dropdown combobox normalizzata a `--shadow-subtle`.
4. **Given** un'azione distruttiva o un error-state vero (messaggi `role="alert"`, errori di validazione form), **Then** usa Ember `#e7000b` (testo/icona; superfici neutre); Ember NON compare in nessun uso decorativo. Gli accenti semantici non-error restano INVARIATI nei valori attuali: semaforo scadenze/stati (`#EDF3EC`/`#346538`, `#FBF3DB`/`#956400`, `#FDEBEC`/`#9F2F2D` come STATO, es. scadenza EXPIRED nel badge), segno monetario (verde entrate / rosso saldo negativo), feedback di successo `role="status"` — decisione utente 2026-07-12: SOLO regola Ember, niente conversione acromatica degli stati.
5. **Given** le pagine esistenti e la suite di test, **Then** comportamento, route, API, testi i18n, `data-testid` e nomi accessibili (incluso il landmark `aria-label="Aree operative"`) restano INVARIATI (refactor visivo puro); `npm run gates` passa e gli e2e restano verdi.
6. **Given** la verifica visiva, **Then** il dev rende conto con screenshot reali (Playwright MCP) di almeno: login, dashboard home, registro voli, scheda persona, dashboard scadenze — leggibilità e gerarchia confermate, non solo test verdi.

## Contesto e decisioni di design (vincolanti)

- **FATTO CHIAVE dal recon (2026-07-12)**: l'app NON usa shadcn/ui (nessun `src/components/ui/`, `components.json`, CVA, `cn()`) — il claim in CLAUDE.md era drift, corretto nel commit di questa story. Design attuale: warm-monochrome custom con hex inline duplicati in decine di file. NON esiste alcun Dialog/Sheet/Modal nell'app.
- **Decisione: componenti custom leggeri, NIENTE shadcn/Radix/CVA in 12.1.** I 4 primitivi (Button/Card/Badge/Input) sono stateless e banali: introdurli custom è chirurgico e senza nuove dipendenze (per il join di classi: helper locale o template string — NON aggiungere librerie). Le primitive comportamentali arrivano quando servono: Radix Dialog/Sheet in 12.3, cmdk in 12.6 — deciderà quello story file. Non anticipare nulla qui.
- **Mappa di migrazione hex → token (meccanica, esaustiva per la palette warm)**:
  | Vecchio | Nuovo token | Note |
  | --- | --- | --- |
  | `#FBFBFA` (bg app) | canvas `#f5f5f5` | anche `layout.tsx:40` che hardcoda le classi |
  | `#FFFFFF` | paper | card/superfici |
  | `#F7F6F3` (muted/hover) | canvas `#f5f5f5` | hover su paper |
  | `#2F3437` (testo) | ink `#0a0a0a` | |
  | `#111111` (heading, primary btn) | ink `#0a0a0a` | btn filled: bg ink, hover ink-soft `#171717` |
  | `#333333` (hover btn) | ink-soft `#171717` | |
  | `#787774` (muted) | mid-gray `#737373` | |
  | `#EAEAEA` (border) | hairline `#e5e5e5` | |
  - **ESCLUSI dalla sostituzione meccanica** (AC 4): `#346538`/`#EDF3EC` (verde), `#956400`/`#FBF3DB` (giallo), `#9F2F2D`/`#FDEBEC` (rosso) — vanno discriminati per occorrenza: `role="alert"`/errori validazione → ember; semaforo di stato, segno monetario, feedback `role="status"` → INVARIATI.
- **Radius**: input/button 6px → 18px (pill); card 12px → 24px; elementi nested dentro card → 10px; badge/pill già `rounded-full` ok (equivalente capsula). Tabelle: il contenitore è la card (24px).
- **Tipografia**: Geist è GIÀ caricato (`geist/font/sans`, `layout.tsx:4`) — nessun cambio di caricamento. Rimuovere l'uso di `--font-serif`/`font-serif` (heading Iowan) → Geist 600 con tracking da scala DESIGN.md (24px −0.6px, 30px −0.75px, 36px −0.9px); body 14px/1.43. Definire la scala completa come token anche se non tutte le taglie sono usate subito.
- **Semaforo di stato**: valori INVARIATI ma CENTRALIZZATI — `EXPIRY_STATUS_BADGE_CLASSES` (`expiries/expiry-status-badge.tsx:12-16`) è l'unico condiviso; la stessa tripletta è duplicata inline in: `aircraft-manager.tsx:197,206`, `people-manager.tsx:82`, `profiles-panel.tsx:154`, `categories-manager.tsx:134`, `packages-manager.tsx:216`, `users-manager.tsx:75-77`, `ppr/register/ppr-register.tsx:74-77`, `people/[id]/page.tsx:144`. Estrarre un `StatusPill`/costanti condivise in `src/components/ui/` e riusarle in questi punti (lista CHIUSA), geometria capsula coerente col Badge. NON ridisegnare la semantica dei colori (solo consolidamento).
- **Error/destructive → Ember**: sostituire il rosso SOLO su messaggi `role="alert"` ed errori di validazione (grep `role="alert"` — decine di occorrenze, es. `aircraft-manager.tsx:684,745,925,1091,1308`, `people-manager.tsx:410,473`, `login-form.tsx:91`, `set-password-form.tsx:129`, `ppr-form.tsx:446`, `expiries-panel.tsx:483,601`) e sulle azioni distruttive esistenti (bottoni elimina/annulla volo/storno). Superfici neutre: testo ember su bg neutro/soft, niente riquadri rosso-tinta nuovi.
- **PDF ed email: FUORI SCOPE.** `pdf/document.tsx` e `pdf/document.test.ts:8` (asserzione `#9F2F2D`) NON si toccano. Email templates invariati.
- **Test fragili (dal recon)**: `e2e/cash-register.spec.ts:100,103` selezionano per classe colore (`text-[#346538]`/`text-[#9F2F2D]`) — il segno monetario resta INVARIATO quindi NON devono rompersi; se una modifica li tocca, è un segnale di violazione dell'AC 4. Preservare TUTTI i `data-testid` (es. `*-feedback`, `*-widget*`, `expiry-dashboard-row`, `ppr-row-detail`; il Badge scadenze passa `data-testid` dal chiamante — non perderlo) e i nomi accessibili (`getByRole` con label italiane).
- **Fuori scope (dichiarato)**: shell persistente/sidebar (12.2 — la nav resta com'è, solo restyle token); dialog/sheet (12.3); registro voli (12.4 — riceve solo token/componenti); date picker custom, ellipsis/row-height/export-menu sweep (12.5); ⌘K (12.6); dark mode (WON'T); redesign per-pagina di layout/IA (le pagine cambiano SOLO pelle); rework palette semaforo/monetario.

## Tasks / Subtasks

- [ ] **T1 (AC 1)** — Token in `globals.css` `@theme` da DESIGN.md (colori, radius, spacing, type scale con tracking, `--shadow-subtle`); base: body canvas/ink/Geist 14px; rimozione `--font-serif`; `layout.tsx` su classi token.
- [ ] **T2 (AC 2)** — Componenti `src/components/ui/`: `Button` (3 varianti), `Card`+header/footer, `Badge` (3 varianti), `Input`, `StatusPill` (semaforo centralizzato); restyle `data-table.tsx`, `search-combobox.tsx` (ombra → subtle), `export-button.tsx`.
- [ ] **T3 (AC 1, 2, 3)** — Migrazione: sostituzione meccanica hex warm → token su tutta `src/` (tabella sopra); adozione dei componenti condivisi sui pattern duplicati (16 `inputClasses`, ~28 primary button, secondary/outline, card/tile, 9 punti semaforo); radius normalizzati; `font-serif` → Geist scale.
- [ ] **T4 (AC 4)** — Split semantico del rosso: `role="alert"`/validazione/distruttivo → ember; semaforo/monetario/`role="status"` INVARIATI; verifica che `cash-register.spec.ts:100,103` resti verde SENZA modifiche.
- [ ] **T5 (AC 5, 6)** — `npm run gates`; e2e mirati sulle superfici più toccate (login, flights, people, expiries, cash) + verifica visiva Playwright MCP con screenshot delle 5 pagine chiave; Dev Agent Record + File List; sprint-status `12-1` → `review`.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; story UI: OBBLIGATORIE le skill `impeccable`, `design-taste-frontend` e `ui-ux-pro-max` (query utili: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "design tokens monochrome"`). Lo stile target NON è più `minimalist-ui` (superato da questo epic): fonte di verità = `DESIGN.md` + regole in questo file.
- La sostituzione hex è MECCANICA ma va fatta file-per-file con occhio: gli hex esclusi (verdi/gialli/rossi semantici) NON si toccano se non nel ramo error/destructive (T4). A fine T3: `grep -rn "FBFBFA\|F7F6F3\|2F3437\|787774\|EAEAEA\|#111111\|#333333\|font-serif" src/` deve tornare vuoto.
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`); gates SOLO `npm run gates`; MAI `playwright install`. Login MCP: se il credential guard blocca, workaround sanzionati (script throwaway che legge `process.env`, o prova via e2e reale).
- UN commit di implementazione (`Story 12.1: ...`); `git commit --amend --no-edit --reset-author`; NON pushare.
- Baseline: tree `98fc82a` + commit story file; migrazioni 30; baseline test attesa 200 e2e / 1222 unit (v. HANDOFF). Flake noti: `cash-report` ECONNRESET sotto load, login-redirect su webServer freddo.
- ATTENZIONE regressione classica: componenti server vs client — i nuovi componenti `ui/` devono restare compatibili con l'uso in server components dove i pattern attuali lo sono (niente handler obbligatori, `'use client'` solo dove serve davvero).

### Project Structure Notes

- Nuovi file attesi: `src/components/ui/{button,card,badge,input,status-pill}.tsx` (+ eventuali `*.test.ts` di logica varianti se non banali). Modifiche diffuse ma superficiali (classi) su `src/app/[locale]/**` e i 3 componenti condivisi esistenti. `globals.css` riscritto sui token. NESSUNA migrazione, env var, API, dipendenza nuova.
- CLAUDE.md: fatto stack corretto nel commit dello story file (niente shadcn/ui) — non serve altro intervento del dev.

### References

- [Source: _bmad-output/planning-artifacts/epics.md «Epic 12» e «Story 12.1»; _bmad-output/brainstorming/brainstorm-ui-refactor-2026-07-12/{brainstorm-intent.md, DESIGN.md, .memlog.md}]
- [Source: recon Explore 2026-07-12 in sessione — theming: globals.css:3-17, layout.tsx:4,39-40; componenti condivisi: data-table.tsx, search-combobox.tsx:264,281, export-button.tsx:30; semaforo: expiry-status-badge.tsx:12-16,38 + 9 duplicazioni (lista chiusa in Contesto); alert/error: occorrenze `role="alert"`; test fragili: e2e/cash-register.spec.ts:100,103, pdf/document.test.ts:8, e2e/bookings.spec.ts:439-440 (landmark)]
- [Source: ARCHITECTURE-SPINE.md «Consistency Conventions» (UI kit, naming, test), «Stack» (Tailwind 4.3, next-intl 4.13)]
- [Source: story file 11-3 (lezione: grep PRIMA i selettori e2e sensibili al rendering; thread-through `useLocale` nei sub-componenti)]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
