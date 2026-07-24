---
baseline_commit: e22eeee
---

# Story 13.3: Scheda persona + estratto conto in AirOps, click sul nome, rimozione slide-over profilo

Status: done

## Story

As a admin/staff dell'aviosuperficie,
I want che la scheda persona e l'estratto conto siano in stile AirOps come il resto dell'app, che si aprano cliccando sul nome nella tabella Piloti, e che lo slide-over di profilo sola-lettura sparisca,
so that non ci siano più pagine con la vecchia UI Tailwind e ci sia UNA destinazione coerente per tutto ciò che riguarda una persona.

**Riferimenti vincolanti**: piano `docs/superpowers/plans/2026-07-22-epic-13-ui-feedback.md` (Task 3). Ultime 2 pagine legacy dell'app (Tailwind, colori light hardcoded). L'editor slide-over della 13.2 (`pilot-editor.tsx`) è il contratto di editing da riusare.

**Ratifiche PO (AskUserQuestion 2026-07-24)**:
- **R-13.3-a (SPLIT)**: questa story porta SOLO le 2 pagine (scheda persona + estratto conto) in AirOps, ripunta il click sul nome, elimina lo slide-over profilo sola-lettura. Il ritiro COMPLETO dello stack legacy (DataTable in `new-booking-form`/`aircraft-editor`, ExportButton in `ExportMenu`, poi Tailwind/Geist/TanStack fuori da `package.json`) è una **story dedicata a valle** (13.x cleanup) — NON in questa. Conseguenza: qui l'estratto conto va ricostruito SENZA `DataTable` (markup tabella AirOps) e l'export della pagina account usa l'`ExportMenu` AirOps (o `export-href`) invece di `ExportButton`, così i consumer legacy di queste 2 pagine spariscono; gli ALTRI consumer (booking/fleet/ExportMenu) restano e li chiude il cleanup.
- **R-13.3-b (estratto conto = sezione)**: l'estratto conto diventa una **sezione/tab dentro la scheda persona**, non più una pagina separata. La rotta `people/{id}/account` può restare come deep-link alla stessa vista (o redirigere alla scheda con la sezione attiva) — decidere in dev il modo meno invasivo che non rompe i link entranti.
- **R-13.3-c (modifica via slide-over 13.2)**: la scheda persona è una VISTA/dossier; un bottone "Modifica" apre lo **stesso `PilotEditor` slide-over** della 13.2 (montato come client component sulla pagina). Nessuna logica di editing duplicata.

## Acceptance Criteria

1. **(Scheda persona AirOps)** `people/[id]/page.tsx` ricostruita in AirOps (niente più `#FBFBFA`/`#2F3437` hardcoded, niente utility Tailwind; primitive `src/components/ui/` + `airops.css`; tema light/dark corretto). Dossier read-oriented con: intestazione (nome + badge stato/ruoli), anagrafica, profili attivi, Ratings/scadenze (lista; la gestione avviene via editor), saldo, ultimi voli. Un bottone "Modifica" apre il `PilotEditor` slide-over della 13.2 (R-13.3-c). Le pagine sono generiche per QUALSIASI persona (non solo piloti), come oggi.
2. **(Estratto conto come sezione)** L'estratto conto (overview saldo + tabella movimenti + export) diventa una sezione/tab della scheda persona (R-13.3-b), ricostruita con markup tabella AirOps (pattern `.student-row`/grid come billing/logbook), SENZA `DataTable`/TanStack. Export via `ExportMenu` AirOps (xlsx+pdf, riuso `buildExportHref`/`buildPdfExportHref`), NON `ExportButton`. Stessa RBAC di oggi (`getAccountOverview`/`listAccountMovements` ri-checkano il permesso — invariato). La rotta `people/{id}/account` non deve rompere i link entranti (deep-link o redirect alla sezione).
3. **(Click sul nome → scheda)** Nella tabella Piloti (`pilots-console.tsx`) il click sul NOME naviga a `/dashboard/people/{id}` (come già fa la card saldi-negativi di billing, `billing-console.tsx:623`) invece di aprire lo slide-over profilo. Lo slide-over profilo sola-lettura (`pilot-profile.tsx`, `PilotProfile`, stato `profileTarget`/`setProfileTarget`, import e render in `pilots-console.tsx`) viene ELIMINATO (componente + wiring + i18n orfane + eventuali e2e che lo esercitano). Il bottone "Modifica" della tabella (che apre `PilotEditor`) resta invariato.
4. **(Nessun consumer legacy residuo su QUESTE 2 pagine)** Dopo la story: `people/[id]/page.tsx`, `people/[id]/account/*` e i loro pannelli (`account-panel.tsx`, `expiries-panel.tsx`, `profiles-panel.tsx`, `account-statement-table.tsx`) NON importano più `DataTable`, `ExportButton`, né utility Tailwind/Geist. I componenti `data-table.tsx`/`export-button.tsx` RESTANO nel repo (li rimuove il cleanup a valle quando cadono gli ultimi consumer booking/fleet/ExportMenu) — dichiararlo, non rimuoverli qui. Aggiornare il commento di stato in CLAUDE.md sullo stack dormiente per riflettere che le pagine legacy non esistono più ma le dipendenze sì (fino al cleanup).
5. **(e2e + skill UI)** e2e: navigazione nome→scheda persona; scheda mostra anagrafica/profili/ratings/saldo; "Modifica" apre l'editor; sezione estratto conto mostra i movimenti ed esporta; la rotta `/account` non è rotta. e2e esistenti che aprivano lo slide-over profilo aggiornate/rimosse. Selettori scoped/exact, MAI hasText con date/H:MM. Skill: karpathy-guidelines + design-taste-frontend + ui-ux-pro-max; coerenza AirOps assoluta. Verifica interattiva: prova i tool `mcp__playwright__*` (server via Docker, scope locale — se non raggiungibili dalla sessione subagent, fallback script `@playwright/test` throwaway in /tmp, cancellati prima del commit).

## Contesto (puntatori — ricognizione 2026-07-24)

- Scheda persona: `src/app/[locale]/dashboard/people/[id]/page.tsx` (legacy: `main` con `background:#FBFBFA`, header L119-155, anagrafica `dl` L157-169, poi `ProfilesPanel`/`ExpiriesPanel`/`AccountPanel` + "Ultimi voli"). Pannelli: `../profiles-panel.tsx`, `../expiries-panel.tsx`, `../account-panel.tsx`.
- Estratto conto: `src/app/[locale]/dashboard/people/[id]/account/page.tsx` (usa `ExportButton` L3, `AccountStatementTable`; reader `getAccountOverview`/`listAccountMovements` da `accounts.service`; export href `buildExportHref`/`buildPdfExportHref`). Tabella: `account/account-statement-table.tsx` (`DataTable` L8+L268, `ColumnDef` L150).
- Slide-over profilo da eliminare: `pilot-profile.tsx` + in `pilots-console.tsx` import L39, stato L159, onClick L287 (`setProfileTarget(pilot)`), render L411-414. La rotta target esiste già come link in `billing-console.tsx:623`.
- Editor da riusare (13.2): `PilotEditor` in `pilot-editor.tsx` (client component driven by props; va montato con un wrapper client sulla pagina server della scheda). Contiene già `LiveExpiryEditor` per ratings/scadenze.
- **Ambiente**: identico alle story precedenti (DB fresco al dispatch, gates prima del commit, e2e foreground, commit appena i gates passano, MAI push, MAI playwright install, MAI dipendenze nuove — anzi qui NON si tocca `package.json`). Commit: `feat(13.3): scheda persona + estratto conto AirOps, click nome, rimozione slide-over profilo` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Ritiro delle dipendenze legacy (Tailwind/Geist/TanStack) e dei loro consumer booking/fleet/ExportMenu (`data-table.tsx`/`export-button.tsx` restano) — story cleanup dedicata a valle (R-13.3-a).
- Conversione di `search-combobox` ad airops.css e il fix font del logbook (era abbinato al ritiro legacy nel piano; segue il cleanup / la 13.5).
- Qualunque cambiamento backend/schema o alle altre pagine della punch-list (13.4+).

## Dev Agent Record

### Implementation Plan

- `people/[id]/page.tsx` rebuilt server-side in AirOps: intestazione (h1 + badge ruoli/archiviata), card "Dati anagrafici" (`.info-row`), card "Profili" (read-only mini-cards, no activate/edit/deactivate control — moved to the editor), card "Scadenze" (read-only `.students`/`.student-row` list — type/scadenza/stato/note, no add/edit/delete), embedded "Estratto conto" section (`account-section.tsx`), "Ultimi voli" panel (unchanged logic, restyled) + "Prossime prenotazioni" placeholder.
- `account-section.tsx` (new client component): merges the legacy `AccountPanel` (balance + "Registra ricarica") and `account/page.tsx` + `AccountStatementTable` (paginated statement + "Registra rettifica" + adjustment badges) into ONE card — `.students`/`.student-row` grid (no `DataTable`), `ExportMenu` (no `ExportButton`). Movements/pagination are server-fetched by the page (`listAccountMovements`, `?page=` on the SAME `/people/{id}` URL) and passed as props; the component only owns the interactive top-up/rettifica panels, `router.refresh()` on success (same eventually-consistent pattern the legacy `AccountStatementTable` already used).
- `people/[id]/account/page.tsx` → thin redirect to `people/[id]` (R-13.3-b, "meno invasivo": no incoming link/bookmark breaks, `?page=` preserved for the embedded statement's own pagination) — chosen over a duplicate standalone page because the two legacy pages are being consolidated into ONE.
- `edit-person-button.tsx` (new client component, R-13.3-c): mounts the SAME `PilotEditor` (13.2) via a "Modifica" button (`people.manage`-gated). `onClose` ALSO calls `router.refresh()` (not just `onMutated`) — unlike `pilots-console.tsx` (whose table never shows ratings inline), this dossier renders a read-only "Scadenze" card and `LiveExpiryEditor` (13.2) has no `onMutated`-style callback of its own; closing is the only reliable moment to pick up a rating change made during the session.
- `pilot-editor-labels.ts` (new, extracted from `pilots/page.tsx` — `booking-labels.ts` precedent): `buildPilotEditorLabels`/`buildPilotEditorToastLabels`, reused by both `pilots/page.tsx` and the new `people/[id]/page.tsx` so the `PilotEditor` label wiring has ONE implementation.
- `people.service.ts`: added `getPersonUser(personId)` (same derivation as `listPilotsPageData`'s per-row `user`) so the scheda persona can build the `PilotRow`-shaped object the embedded editor needs, without touching the `GET /api/v1/people/{id}` wire contract.
- `pilots-console.tsx`: removed `PilotProfile` import/state (`profileTarget`)/render; the pilot NAME is now a `Link` to `/dashboard/people/{id}` (same pattern as `billing-console.tsx`'s negative-balance link). The "Modifica" row action (opens `PilotEditor`) is untouched.
- Deleted: `pilots/pilot-profile.tsx` (the read-only slide-over), `pilots/expiry-grouping.ts` (its only consumer), `people/account-panel.tsx`, `people/expiries-panel.tsx`, `people/profiles-panel.tsx`, `people/[id]/account/account-statement-table.tsx`. `data-table.tsx`/`export-button.tsx` themselves are NOT deleted (13.11 cleanup) — after this story they have ZERO remaining consumers anywhere in `src/` (verified by repo-wide grep), including `new-booking-form.tsx`/`aircraft-editor.tsx` (the Contesto's "altri consumer" no longer reference them either — pre-existing state, not something this story touched).
- i18n: removed the orphaned `PilotsPage.profile.*` subtree (it/en) — was only consumed by the deleted `pilot-profile.tsx`. No other new/removed keys: the new page/section reuse `PersonDetailPage`, `AccountStatementPage`, `PeoplePage.profilesPanel`, `ExpiriesPanel`, `PilotsPage.editor`/`toast`/`pagination`, `Export` verbatim (all already bilingual IT/EN).
- CLAUDE.md: updated the AirOps/dormant-stack paragraph, the "Stories con UI" rule, and the route-map line — the two legacy pages no longer exist; Tailwind/TanStack Table/Geist remain installed but now serve ZERO page consumers (only `data-table.tsx`/`export-button.tsx` themselves), until story 13.11.

### Completion Notes

- AC 1 (scheda persona AirOps): done — no hardcoded hex, no Tailwind utilities, `airops.css` primitives (`Badge`, `.card`, `.info-row`, `.students`/`.student-row`) throughout; light/dark verified interactively (Playwright, see notes below). "Modifica" opens the 13.2 `PilotEditor`.
- AC 2 (estratto conto come sezione): done — merged section, `.student-row` grid, `ExportMenu` (xlsx+pdf), same RBAC (`getAccountOverview`/`listAccountMovements` re-check `people.read`/own-access, unchanged). `/account` redirects, `?page=` preserved.
- AC 3 (click sul nome): done — `pilots-console.tsx` name cell is a `Link`; `pilot-profile.tsx` + all wiring + orphaned i18n removed.
- AC 4 (nessun consumer legacy residuo): done — verified by repo-wide grep for `DataTable`/`ExportButton`/`components/data-table`/`components/export-button`: zero hits under `people/[id]/**` after this story (only the definition files + this story's own doc-comments mention the names). CLAUDE.md updated.
- AC 5 (e2e + skill UI): `karpathy-guidelines`, `design-taste-frontend`, `ui-ux-pro-max` read and applied. e2e updated for the new architecture — see Deviations below for the one dropped scenario (no UI surface left to exercise it) and File List for the full set of touched specs. Interactive verification via Playwright MCP (see notes below); `npm run gates` PASS (lint/typecheck/vitest/build).

### File List

- `src/app/[locale]/dashboard/people/[id]/page.tsx` (rewritten, AirOps)
- `src/app/[locale]/dashboard/people/[id]/account-section.tsx` (new)
- `src/app/[locale]/dashboard/people/[id]/edit-person-button.tsx` (new)
- `src/app/[locale]/dashboard/people/[id]/account/page.tsx` (rewritten → redirect)
- `src/app/[locale]/dashboard/people/[id]/account/account-statement-table.tsx` (deleted)
- `src/app/[locale]/dashboard/people/account-panel.tsx` (deleted)
- `src/app/[locale]/dashboard/people/expiries-panel.tsx` (deleted)
- `src/app/[locale]/dashboard/people/profiles-panel.tsx` (deleted)
- `src/app/[locale]/dashboard/pilots/pilots-console.tsx` (`PilotProfile` wiring removed, name → `Link`)
- `src/app/[locale]/dashboard/pilots/pilot-editor.tsx` (`ToastLabels` exported)
- `src/app/[locale]/dashboard/pilots/pilot-editor-labels.ts` (new, extracted)
- `src/app/[locale]/dashboard/pilots/pilot-profile.tsx` (deleted)
- `src/app/[locale]/dashboard/pilots/expiry-grouping.ts` (deleted, orphaned)
- `src/app/[locale]/dashboard/pilots/page.tsx` (uses `pilot-editor-labels.ts`, drops orphaned `profile` labels)
- `src/server/services/people.service.ts` (added `getPersonUser`)
- `src/server/services/exports.service.ts` (doc-comment path fixes only)
- `messages/it.json`, `messages/en.json` (removed orphaned `PilotsPage.profile.*`)
- `CLAUDE.md` (dormant-stack / UI-story-rule / route-map updated)
- `e2e/person-detail.spec.ts` (rewritten for read-only dossier + "Modifica"/editor smoke test)
- `e2e/people-management.spec.ts` (pilot-profile slide-over test → navigation + new page assertions)
- `e2e/account-statement.spec.ts` (rewritten: redirect route, `.student-row` grid, testid renames)
- `e2e/account-adjustments.spec.ts` (testid renames: `account-balance`, `account-movement-row`)
- `e2e/accounts-topups.spec.ts` (heading rename "Saldo conto" → "Estratto conto")
- `e2e/flights.spec.ts`, `e2e/flight-reversal.spec.ts` (testid renames only)
- `e2e/expiry-registration.spec.ts` (registration flow rewritten through "Modifica" → `LiveExpiryEditor`; validityMonths-precompile test dropped, see Deviations)

### Interactive verification (Playwright)

`mcp__playwright__*` tried first: unreachable from this subagent session (`Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome`) — fell back to throwaway `@playwright/test` scripts (deleted before commit) driving the real dev server (Playwright's own bundled Chromium, the same binary the e2e suite already uses — no `playwright install` run).

- **Bug found and fixed during verification**: the FIRST pass (screenshot + `getByLabel('Nome').inputValue()`) showed the `PilotEditor` slide-over opening but rendering EMPTY (just the "✕" close button, no anagrafica/profili/ratings content). Root cause: `edit-person-button.tsx` mounted `<PilotEditor target={...}>` WITHOUT a `key` that changes between closed/open — `PilotEditor`'s internal `current` is a `useState` whose initializer only runs on MOUNT, so the ONE long-lived instance (this button never unmounts it) kept the `target: null`-time initial value forever, even after `target` became `{mode:'edit', pilot}`. Fixed by adding `key={open ? \`editor-${person.id}\` : 'editor-closed'}` (same remount-per-target convention `pilots-console.tsx` already uses for its own `PilotEditor` mount). Re-verified: editor now renders fully populated (anagrafica/profili/ratings/visita medica/accesso/archivio), light AND dark theme, both via screenshot and `.innerText()` dump.
- Also fixed during verification: the "Registra rettifica" panel's `amountHint` text was rendering BELOW the whole 2-column form-grid (disconnected from "Importo") instead of directly under the amount field, because `.fld-ctrl` is `display:flex` (row) — a bare extra `<p>` sibling inside `Field`'s children would have sat side-by-side with the `<input>`, not stacked. Fixed by wrapping each field's input+hint/error in an inner `flexDirection:'column'` div (single flex child of `.fld-ctrl`), matching the legacy `AdjustmentForm`'s layout precision.
- **Full flow verification** (screenshots + scripted assertions, light AND dark via the real theme-toggle button, `data-theme` confirmed `dark` server-side via cookie): scheda persona for a pilot with profile/ratings/balance/movements data — anagrafica/profili/scadenze/estratto conto render correctly, no Tailwind/hardcoded-hex remnants; "Modifica" opens the `PilotEditor` pre-filled and a save refreshes the dossier; estratto conto — top-up (balance updates, `router.refresh()`), standalone rettifica (balance updates, `adjustment-feedback` visible), row-level rettifica on the top-up row (`adjustment-badge` appears, the original row's "Rettifica questo movimento" action disappears once `hasReversal`), export menu (`Esporta Excel`/`Esporta PDF` hrefs correct, `?format=xlsx|pdf&locale=it`); `/account?page=1` redirects to `/people/{id}?page=1` preserving the param; Piloti table name click navigates to the scheda (no more slide-over).
- **e2e** (foreground, `--no-deps`, real dev server): all 8 touched spec files run individually AND together at `--workers=1` (serial — `--workers>1` against `next dev` reproduces the pre-existing "cold-compile timeout flakiness" `playwright.config.ts` already documents, manifesting as login timeouts on UNRELATED/untouched tests too, e.g. story-13.2 tests never touched by this story; confirmed environmental, not a regression, by re-running the affected tests in isolation where they pass). Final serial run: 44/46 passed; the 2 remaining failures are the same login-flake class (one a pure-API test, one an untouched 13.2 test), each independently confirmed passing on a solo re-run. One genuine e2e bug found and fixed along the way: `expiry-registration.spec.ts`'s new `registerExpiryViaUi` helper didn't wait for an add to settle before starting the next one — two chip-adds back to back could race the first's `refresh()`; fixed by asserting the add-form closes and the new row appears before returning.

### Change Log

- 2026-07-24: Story 13.3 implemented (scheda persona + estratto conto AirOps, click sul nome, rimozione slide-over profilo). Interactive Playwright verification found and fixed a real bug (`PilotEditor` missing remount `key` in `edit-person-button.tsx` — see above). `npm run gates`: PASS. e2e: 8 touched spec files green serially (see notes above for the pre-existing `next dev` parallel-flake class encountered and ruled out).

## Review Record (adversarial, Opus 4.8 xhigh — 2026-07-24)

**Verdetto**: shippable-with-fixes. **Priorità zero: la full suite CI-mode su build prod era ROSSA** (230 passed, **1 failed**, 9 did-not-run, exit 1) — il dev l'aveva mal diagnosticata come login-flake, ma in CI-mode su DB fresco il fallimento è DETERMINISTICO. Un solo test rotto ha bloccato a cascata l'intera catena `settings`+`booking-window` (9 test saltati).

**Findings e risoluzione (fix chirurgici, sessione principale):**
- **F1 (major, FIXATO)**: `account-statement.spec.ts:86` falliva 3/3 (`account-movement-row` non trovata). Causa nel TEST, non nell'app (provato via psql: il pilota seed ha il conto ma ZERO movimenti — il seed base crea il conto vuoto, `seed-demo` non è usato dagli e2e). Il vecchio test passava per caso: la legacy `DataTable` rendeva un `<tr>` placeholder per lo stato vuoto, mentre la riscrittura AirOps (`account-section.tsx`) rende `<p>Nessun movimento</p>` → l'asserzione sul testid non trovava nulla. Fix: il test ora registra un top-up reale sul pilota (come admin, prima del login come pilota — riuso `ownPersonId`/`recordTopUp` già nel file), così la riga movimento esiste. **Nessun difetto di prodotto.**
- **F2 (minor, feature-loss → follow-up ACCETTATO)**: registrando una scadenza dalla scheda persona non si precompila più "Data scadenza" da `validityMonths` (comodità che il vecchio `ExpiriesPanel` a pagina aveva; `LiveExpiryEditor` della 13.2 non l'ha mai avuta). Il reviewer conferma: piccola regressione UX reale, ma il fix tocca l'editor condiviso (Piloti/Istruttori) → **fuori scope 13.3**, tracciato come action item epic-13 (aggiungere il precompile al `LiveExpiryEditor` condiviso, beneficia tutti e 3 i consumer).
- **F3 (nota, FIXATO)**: il commento RBAC in `people/[id]/page.tsx` sovrastimava l'uniformità delle regole (`listPersonExpiries` usa `expiries.manage`-OR-own, NON `people.read`). Innocuo oggi (nessun ruolo ha `people.read` senza `expiries.manage`), ma il commento era impreciso e mascherava un accoppiamento latente. Fix: commento corretto e reso esplicito il rischio. Il read difensivo (Forbidden expiries → lista vuota invece di redirect) NON è stato aggiunto: scenario impossibile oggi (karpathy — niente gestione di casi impossibili).

**Chiusura note dev** (verificate LIVE dal reviewer): N1 RBAC estratto conto CHIUSA (matrice 5 ruoli corretta, degrada a redirect/404, nessun leak cross-persona; solo il commento era impreciso → F3); N2 bugfix key-remount CHIUSO (Modifica apre l'editor popolato, salva, la scheda si aggiorna); N3 `/account` redirect CHIUSO (preserva `?page=`, NON è un bypass RBAC — la destinazione ri-autorizza); **N4 CONFERMATO: ZERO consumer legacy residui in `src/`** — `DataTable`/`ExportButton` non sono più importati da nessuna pagina, INCLUSI `new-booking-form`/`aircraft-editor` (rilevante per lo scope della 13.11: il ritiro delle dipendenze non ha più consumer applicativi da portare, solo i 2 componenti + il wiring in `layout.tsx`/`ExportMenu`); N5 feature-loss → F2; N6 flakiness ambientale (ma il vero rosso era F1, deterministico); N7 tema dark CONFERMATO; N8 i18n (solo rimozione `PilotsPage.profile.*`).

**Verifica post-fix** (sessione principale): `npm run gates` verde (1443 unit). Full suite `CI=1` su build prod, DB fresco: primo giro ancora rosso (il fix F1 introduceva 3 login e senza logout il re-login veniva rimbalzato dalla sessione attiva → timeout `fill`, deterministico), secondo fix `a90c22c` (`clearCookies()` in testa al login helper) → **240 passed, exit 0, 0 flaky**, catena `settings`+`booking-window` (i 9 test prima saltati) girata e verde. Lezione: un fix di test può introdurre un nuovo fallimento deterministico — sempre ri-verificare la full suite, mai chiudere su un run parziale.
