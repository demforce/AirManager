---
baseline_commit: e04cccd
---

# Story 13.10: Mobile pass — sweep sistematico usabilità a viewport mobile

Status: ready-for-dev

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

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
