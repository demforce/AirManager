---
baseline_commit: 19f5b33
---

# Story 13.9: Dark theme pass — sweep sistematico leggibilità

Status: ready-for-dev

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

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
