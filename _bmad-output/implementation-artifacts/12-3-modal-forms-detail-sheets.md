---
baseline_commit: be1e98a
---

# Story 12.3: Form a comparsa — dialog di creazione e sheet di dettaglio

Status: done

## Story

As a membro dello staff,
I want creare voli e persone in un modale e consultarne il dettaglio in uno sheet laterale senza lasciare la tabella,
so that l'inserimento dati sia rapido e il contesto non vada mai perso (FR-49; epics.md «Epic 12», intent doc cantiere C + ratifiche 2026-07-12).

## Acceptance Criteria

1. **Given** i primitivi overlay, **Then** esistono in `src/components/ui/`: `Dialog` (modale centrato, card paper radius 24, bordo hairline) e `Sheet` (pannello laterale destro full-height sopra la tabella) — ENTRAMBI sull'elemento nativo `<dialog>` + `showModal()` (React 19): focus trap, Esc e `::backdrop` nativi, focus di ritorno all'elemento di origine, scrim neutro monocromo. NESSUNA nuova dipendenza (niente Radix/headless — primo overlay del progetto, decisione vincolante).
2. **Given** la pagina registro voli con `flights.manage`, **When** clicco il NUOVO bottone "Registra volo", **Then** il form attuale (`RegisterFlightForm`, label e `data-testid="flight-form"` INVARIATI) si apre nel Dialog e NON è più sempre visibile in testa; a successo il dialog si chiude e il pannello risultato addebito (`flight-result-panel`, testid invariati) appare sulla pagina; la correzione (`flight-correct-action`) apre lo STESSO dialog in correction mode (idioma `key`-remount, heading "Correggi volo" invariato). Il pannello di annullamento (`CancelFlightPanel`) resta com'è (fuori scope).
3. **Given** il dialog volo, **Then** è keyboard-first: focus iniziale sul primo campo (Velivolo); gli input orari 'Ora decollo'/'Ora atterraggio' diventano testuali con parsing rapido — accettano `1430`, `930`, `9:30`, `14:30` e normalizzano a `HH:MM` (parser puro NUOVO in `src/lib/` con unit test sui rami: 3-4 cifre, con/senza `:`, invalidi → errore campo) — e la semantica wire resta IDENTICA a `composeFlightTimes` (wall-time browser + rollover mezzanotte, `toISOString()` — righe :1026-1036, NON toccarla); la durata derivata live resta la pill `flight-computed-duration`. Un fill e2e con `10:00` continua a funzionare.
4. **Given** la pagina persone, **When** clicco "Nuova persona", **Then** si apre un Dialog minimo: nome, cognome, email, telefono + select "Ruolo" OPZIONALE (default nessuno) che, se scelto, rivela i SOLI campi obbligatori del profilo (pilota: numero+tipo licenza; allievo: data inizio corso; istruttore: ratings) — ratifica utente 2026-07-12. Submit: `POST /api/v1/people` poi, se ruolo scelto, `PUT /api/v1/people/{id}/profiles/{type}` (chiamate sequenziali); se il secondo passo fallisce la persona ESISTE: errore nel dialog con link alla scheda per riprovare (nessun rollback). A successo: feedback `people-feedback` (testid invariato) + link "Completa la scheda" a `/dashboard/people/[id]`; `address`/`fiscalCode` escono dal form di creazione (restano nell'edit e in scheda — progressive disclosure).
5. **Given** una riga del registro voli, **When** apro il dettaglio (azione per-riga NUOVA `data-testid="flight-detail-action"`), **Then** uno Sheet laterale mostra il volo completo SENZA perdere la tabella: tratta, orari, durata, decolli/atterraggi, contaore, note, tipo/solista, PIC, stato/lineage (storno/correzione) e la scomposizione addebito; per chi ha `flights.manage` lo sheet offre le azioni Correggi (apre il dialog di correzione) e Annulla (flusso esistente).
6. **Given** il dato del singolo volo, **Then** esiste il NUOVO endpoint `GET /api/v1/flights/{id}` + `getFlight` nel service (DTO = stessa shape/serializer della lista): `flights.manage` → qualunque volo; altrimenti `self.read` e volo proprio (person O instructor) → 200; volo ALTRUI → **404 `NotFoundError`** (pattern `getPerson` — non rivelare l'esistenza, NFR-10); anonimo → 401. Zod schema → OpenAPI; unit test dei 4 rami; e2e API: pilota su volo altrui → 404.
7. **Given** dialog e sheet, **When** li uso da tastiera, **Then** focus trap, Esc, ritorno del focus e `aria-labelledby` sul titolo funzionano (WCAG 2.1 AA); il `SearchCombobox` dentro il dialog non viene clippato (verificare overflow/z-index) e il suo Enter fall-through submitta il form senza chiudere il dialog per sbaglio.
8. **Given** la suite di test, **Then** `npm run gates` passa e gli e2e restano verdi con gli aggiornamenti della lista CHIUSA (v. Contesto); NUOVI scenari e2e: apertura/chiusura dialog volo da tastiera (Esc + focus di ritorno), parsing rapido `1430` → durata derivata corretta, creazione persona con ruolo (flusso a due chiamate via UI), 404 API su volo altrui.

## Contesto e decisioni di design (vincolanti)

- **Recon 2026-07-12 (fatti verificati)**: ZERO overlay/portal/`<dialog>`/dep UI in tutto il progetto (React 19.2.7, stack deliberatamente zero-dep: `cn()` naive, primitivi custom 12.1). Tutti i form sono inline in Card sopra le tabelle. Il form volo è SEMPRE visibile in testa (`flights-manager.tsx:415-504`), 16 campi (elenco completo nel recon §1 — righe :1361-1636), pickers `SearchCombobox` con stato plain fuori RHF, submit `fetch` diretto con `Idempotency-Key`, derivazione durata live GIÀ esistente (`composeFlightTimes` :1026-1036 + pill :1558). La correzione RIUSA lo stesso form via `key`-remount (`:418`), prefill da `flightFormDefaults` (:1051-1092). L'annullamento è un pannello separato (`CancelFlightPanel` :883-979).
- **Decisione `<dialog>` nativo (NO Radix)**: coerente con lo stack; `showModal()` dà focus trap/Esc/backdrop/inert gratis. Il primitivo gestisce: apertura via prop `open` (useEffect → `showModal()`/`close()`), evento `close` → callback (anche per Esc), click sullo scrim = chiudi (target === dialog element), scroll interno del contenuto (`max-h` + `overflow-y-auto`), `::backdrop` scrim neutro (es. ink al 40%), focus di ritorno nativo. Sheet = stesso elemento con posizionamento a destra (`h-dvh`, larghezza ~28-32rem, radius solo sul lato sinistro), stessa semantica.
- **`SearchCombobox` nel dialog**: nessun portal → resta nel flow (bene per il trap); il popup è `absolute z-20` (`search-combobox.tsx:282`) — attenzione al clipping se il corpo del dialog scrolla: se serve, `overflow-y-visible` sulla sezione pickers o popup verso il basso con margine. Enter fall-through documentato (`:215-224`): con popup chiuso Enter submitta il form — comportamento desiderato keyboard-first, verificare che il submit fallito NON chiuda il dialog.
- **Parser orari**: nuovo file `src/lib/time-input.ts` (o simile) con `parseTimeShorthand(raw): string | null` — `'1430'→'14:30'`, `'930'→'09:30'`, `'9:30'→'09:30'`, `'14:30'` idempotente, `'2500'/'abc'→null`; normalizzazione su change/blur nello stato plain esistente (`takeoffTimeValue`/`landingTimeValue` :1138-1140). NON toccare `composeFlightTimes` né il wire (ISO UTC via `toISOString()`, :1275-1276).
- **Modale persona — ratifica 2026-07-12**: select ruolo OPZIONALE con campi condizionali (schemi: `pilotProfileRequestSchema` licenseNumber+licenseType, `studentProfileRequestSchema` courseStartDate `z.iso.date()`, `instructorProfileRequestSchema` ratings — `src/lib/schemas/people.ts:116-141`). Obbligatori persona: SOLO firstName/lastName (`createPersonSchema` :12-19). Il form edit esistente (people-manager mode 'edit') resta INVARIATO (con address/fiscalCode). Il POST people risponde con la persona creata (id per il PUT profilo e per il link scheda).
- **`GET /api/v1/flights/{id}` (aggiunta API dichiarata, additiva)**: l'epic consente nuovi endpoint richiesti dalle superfici; il pattern own-access è in `listFlights` (`flights.service.ts:1289-1324` — canManage / self.read + OR person/instructor); per il singolo volo il volo altrui è **404** (pattern `getPerson`, non 403 — anti-enumeration). Riusare il serializer/DTO della lista (`FlightListItemDto` con breakdown) — NESSUN campo nuovo. Route `src/app/api/v1/flights/[id]/route.ts` accanto a cancel/correct.
- **Sheet volo**: read-only + azioni; il costo/breakdown è visibile a canManage e al titolare sul proprio volo (il service già scopa i dati — il DTO arriva solo se autorizzato). Voli storici pre-11.1: campi logbook null → "—" (pattern registro 11.2). Apertura via bottone per-riga (NON row-click: meno ambiguo per gli e2e); chiusura non perde filtri/pagina della tabella.
- **e2e — lista CHIUSA degli aggiornamenti attesi**:
  - `flights.spec.ts`: i test del form (es. :203-212) devono PRIMA cliccare `getByRole('button', {name:'Registra volo'})` per aprire il dialog (label bottone = label submit esistente: disambiguare con testid `flight-open-register` sul bottone di apertura se serve `exact`); i `getByLabel`/`getByTestId('flight-form')` restano validi dentro il dialog.
  - `flight-log.spec.ts:228`: `flight-form toHaveCount(0)` per il pilota read-only → sostituire con assenza del bottone di apertura (+ form non montato).
  - `flight-reversal.spec.ts:300-319`: il click su `flight-correct-action` ora apre il dialog — heading/label invariati, aggiungere solo le attese di apertura se servono.
  - `people-management.spec.ts:35-40`: il click su "Nuova persona" apre il dialog — `getByLabel('Nome',{exact:true})` ecc. restano validi; l'assert su address/fiscalCode nel CREATE (se esiste) va spostato sull'edit.
  - `typeahead-pickers.spec.ts`: verificare se i test aprono il form volo (ora dietro dialog) e aggiungere l'apertura.
  - `exports.spec.ts`/`flight-log.spec.ts` helper `registerFlight`: via API, IMMUNI.
- **Feedback**: dentro il dialog stessi pattern/testid (`flight-form-error` role=alert, errori per-campo text-ember, `person-form-error`); successo persona su `people-feedback` (role=status, resta sulla pagina dopo la chiusura del dialog).
- **NFR-10**: unica superficie dati nuova = GET flight by id (AC 6, 404 su altrui); dialog/sheet non espongono nulla che la pagina non esponesse già.
- **Fuori scope (dichiarato)**: sheet/dialog per altre tabelle (bookings, people edit — arrivano col sistema, non in questa story); spostare l'annullamento volo nello sheet; batch-entry "Invio e ripeti" (COULD — NON farlo qui); date picker custom (12.5); redesign della tabella voli (12.4); ⌘K (12.6); qualunque cambio a pricing/derivazioni server.

## Tasks / Subtasks

- [x] **T1 (AC 1, 7)** — Primitivi `Dialog` e `Sheet` su `<dialog>` nativo in `src/components/ui/` (props: open/onClose/title/labelledby; scrim, Esc, click-fuori, scroll interno, focus return) + unit test della logica non banale se estraibile.
- [x] **T2 (AC 6)** — `getFlight` nel service (4 rami RBAC, 404 su altrui) + route `GET /api/v1/flights/[id]` + Zod/OpenAPI + unit test.
- [x] **T3 (AC 2, 3)** — Dialog volo: bottone di apertura, form invariato dentro Dialog, correction mode, parser orari `parseTimeShorthand` + unit test, focus iniziale, risultato addebito sulla pagina.
- [x] **T4 (AC 4)** — Dialog persona minimo con ruolo condizionale (flusso a due chiamate, errore secondo passo con link scheda, feedback + link "Completa la scheda"); create form snellito (via address/fiscalCode).
- [x] **T5 (AC 5)** — Sheet dettaglio volo (azione per-riga, contenuto completo, azioni Correggi/Annulla per canManage, "—" sui null storici).
- [x] **T6 (AC 8)** — Aggiornamento e2e lista chiusa + nuovi scenari (Esc/focus, parsing 1430, persona con ruolo, 404 API); `npm run gates`; e2e mirati: `flights`, `flight-reversal`, `flight-log`, `people-management`, `typeahead-pickers`, `exports` + nuovi.
- [x] **T7** — Verifica visiva Playwright MCP (dialog volo aperto/chiuso, sheet dettaglio, dialog persona con ruolo espanso; keyboard-only walk-through) + screenshot; Dev Agent Record + File List; sprint-status `12-3` → `review`.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; story UI: OBBLIGATORIE `impeccable`, `design-taste-frontend`, `ui-ux-pro-max`; contratto `DESIGN.md` (dialog = card paper radius 24 hairline; input pill; bottoni pill). Riusare i primitivi 12.1 (`Button`, `Card`, `Input`/`inputBaseClasses`, `cn`) — il guard-pattern `bg-`/padding di Card/Skeleton vale anche per i nuovi primitivi se accettano override.
- `<dialog)`: attenzione a `cancel` event (Esc) vs `close`; a `inert` sul resto della pagina (nativo con showModal); il pannello contenuto della shell (12.2) scrolla — il dialog è viewport-fixed per natura, nessun conflitto atteso, ma verificare che lo sfondo non scrolli sotto (accettabile se lo scrim copre).
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`); gates SOLO `npm run gates`; MAI `playwright install`.
- UN commit di implementazione (`Story 12.3: ...`); NON pushare.
- Baseline: `be1e98a` (12.2 done), 30 migrazioni, 204 e2e / 1222 unit su DB fresco. Flake noti: `cash-report` ECONNRESET; `bookings.spec.ts:605` isolamento (deferred 12.2 — NON imputarlo a questa story se ricompare nel full-run sporco).
- Lezioni 12.1/12.2: lo sweep salta occorrenze → grep finale sui simboli spostati (`backTo...` insegnava); verificare live ciò che si dichiara (lo skeleton invisibile è passato da una verifica solo-markup).

### Project Structure Notes

- Nuovi file attesi: `src/components/ui/{dialog,sheet}.tsx`, `src/lib/time-input.ts` (+test), `src/server/services/flights.service.ts#getFlight` (+test), `src/app/api/v1/flights/[id]/route.ts`, schema Zod in `src/lib/schemas/flights.ts` (riuso DTO), componenti dialog volo/persona e sheet dentro le rispettive cartelle dashboard. Modifiche: `flights-manager.tsx`, `people-manager.tsx`, `flights/page.tsx`/`people/page.tsx` (bottoni), `messages/{it,en}.json` (chiavi nuove: titoli dialog/sheet, ruolo, link scheda), e2e lista chiusa. NESSUNA migrazione, env var, dipendenza nuova.

### References

- [Source: _bmad-output/planning-artifacts/epics.md «Story 12.3»; intent doc cantiere C + ratifiche sessione 2026-07-12 (modali keyboard-first, progressive disclosure CON ruolo condizionale, decolli/atterraggi nello sheet)]
- [Source: recon Explore 12.3 in sessione — flights-manager.tsx: form :415-504/:1110-1638, campi :1361-1636, composeFlightTimes :1026-1036, wire :1275-1276, correzione :418/:1051-1092, cancel :883-979, tabella :581-673; people-manager.tsx: create :291-323/:483-546, post-create :157-161; schemas/people.ts :12-19/:116-141; flights.service.ts own-access :1289-1324 (getFlight NON esiste, GET [id] NON esiste); search-combobox.tsx props :18-45, Enter :215-224, popup :282; package.json zero dep overlay, React 19.2.7]
- [Source: e2e — flights.spec.ts :31-35/:203-212; flight-log.spec.ts :77-81/:228; flight-reversal.spec.ts :229-243/:300-371; people-management.spec.ts :35-40; exports.spec.ts :81]
- [Source: story file 12-1 (primitivi, guard cn), 12-2 (shell, lezione verifica live)]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (xhigh), single dev subagent.

### Debug Log References

- `npm run gates`: PASS (lint, typecheck, 1242/1242 unit, build) — verified twice, before and after the final e2e-driven spec edits.
- Targeted e2e (36 tests: `flights`, `flight-reversal`, `flight-log`, `people-management`, `typeahead-pickers`, `package-consumption`, `exports`, including every new story-12.3 scenario): 36/36 passed on a clean re-run.
- One full-suite run (208 tests) for extra diligence: 199 passed, 5 failed, 4 skipped — every failure is in a file this story never touches (`aircraft-rates.spec.ts`, `bookings.spec.ts`, `ppr-register.spec.ts`) or is a bare `ECONNRESET` inside `flights.spec.ts`'s pre-existing `createAircraftWithRate` helper (unrelated to any 12.3 change). Re-running `aircraft-rates`/`bookings`/`ppr-register` in isolation still failed, but with WORSE symptoms (widespread `booking-form-success` timeouts) — this is the documented dirty-DB flake class (`bookings.spec.ts:605`, explicitly called out as pre-existing/deferred, not attributable to this story), aggravated by the full-suite run's own data accumulation on top of the session's already-reset baseline. No story-12.3 test failed in any run.
- Playwright MCP interactive verification (T7, live against the dev server, admin session via a throwaway cookie-injection script — password never printed): flight register dialog open/close, keyboard focus (found and fixed a real bug — see below), Esc (2 presses: combobox popup first, then the dialog), backdrop-click-to-close, SearchCombobox popup not clipped, time-shorthand parsing (`1430`/`1600` → `1:30` live), full correction round-trip via the sheet's "Correggi" action, cancel hand-off via the sheet's "Annulla" action, and the person-create dialog's role-conditional fields + two-call submit + success feedback/link — all confirmed working live, screenshots taken and reviewed (not committed).

### Completion Notes List

- **Live-verified bug found and fixed during T7**: the native `<dialog>` `showModal()` auto-focus algorithm was landing on the scrollable card wrapper (`overflow-y-auto` div) instead of the first real field — a documented Chromium quirk (an `overflow-y-auto` region with no explicit `tabindex` is still a "focusable area" for keyboard scrolling, and as the ancestor it precedes every field in tree order). Fixed in the shared `useNativeDialog` hook (`src/components/ui/dialog.tsx`) by explicitly focusing the first real focusable descendant right after `showModal()`. Confirmed live: `document.activeElement` now lands on `flight-aircraft`/`create-firstName` as expected (AC 3/7).
- **Esc requires two presses from the register dialog's default state**: the Velivolo `SearchCombobox` auto-opens its own popup on focus (pre-existing `handleFocus`/`openBrowseMode` behavior, story TD-3) — the first Esc closes that popup (per the combobox's own handler), the second closes the dialog and returns focus to the trigger. Verified live and reflected exactly in the new e2e test; this is correct nested-overlay behavior, not a bug.
- **`GET /api/v1/flights/{id}` (AC 6)**: added `getFlight` to `flights.service.ts` reusing `FLIGHT_SELECT`/`toListItem` verbatim (no new DTO fields) — `flights.manage` reads any flight; otherwise `self.read` plus the same own/instructor OR `listFlights` already uses. A flight belonging to someone else answers 404 `NotFoundError`, never 403, per the story's explicit (and empirically confirmed) anti-enumeration decision — 8 new unit tests cover all branches, plus a dedicated e2e API test (titolare 200, a different pilot 404).
- **`Dialog`/`Sheet` primitives (AC 1, T1)**: `src/components/ui/dialog.tsx`, both on the native `<dialog>` + `showModal()`, zero new dependency. No dedicated unit test file: the primitive's only non-trivial logic (open/close guards, backdrop-click detection, the focus fix above) is tightly coupled to real `HTMLDialogElement` behavior that this project's `vitest` setup (`environment: 'node'`, no jsdom/testing-library anywhere in the codebase) cannot exercise meaningfully — adding that test infrastructure just for this would itself be a new dependency, which AC 1 forbids. Coverage instead comes from the real-browser e2e scenarios (new + updated) and the live Playwright MCP walk-through.
- **`parseTimeShorthand` (AC 3, T3)**: new pure module `src/lib/time-input.ts`, 12 unit tests covering every branch (3/4-digit bare, with/without colon, idempotent `HH:MM`, out-of-range hour/minute, non-numeric, wrong digit count, empty, midnight/23:59). `composeFlightTimes` itself is byte-for-byte unchanged — the parser only normalizes the two raw strings BEFORE they reach it, both at submit time and for the live-duration calculation.
- **Flight dialog (AC 2/3)**: `RegisterFlightForm` itself is unchanged except: `type="time"` → `type="text"` on the two time fields (+ shorthand parsing wiring) and one added `id="flight-form-title"` on its existing `<h3>` (the Dialog's `aria-labelledby` target — no second title is ever rendered). The "Registra volo" open button reuses the SAME label as the submit button (by design, per the story) — existing e2e clicks on that label were re-scoped to `flight-form` where they meant the SUBMIT button (they resolved ambiguously once both are simultaneously in the accessibility tree — `inert` on the page did not exclude the trigger from Playwright's role queries in practice, contrary to my first assumption; verified and fixed).
- **Person dialog (AC 4)**: `src/app/[locale]/dashboard/people/person-create-dialog.tsx`, new. `createPersonSchema` reused as-is for the base fields (no schema change — `address`/`fiscalCode` are already `.nullish()`, simply omitted from this form's `defaultValues`/markup). Role-specific fields are plain state (same "plain state, not RHF" pattern already used elsewhere on this page) with a client-side required check BEFORE the first network call. The old `CreatePersonForm` function is deleted; `EditPersonForm` (with `address`/`fiscalCode`) is untouched.
- **Detail sheet (AC 5)**: `src/app/[locale]/dashboard/flights/flight-detail-sheet.tsx`, new — driven by the row's already-in-memory `FlightListItemDto` (identical shape to the new `GET /flights/{id}` DTO), no extra fetch; reuses `FlightStatusCell`/`flightTypeLabel`/`personLabel` (newly exported from `flights-manager.tsx`, zero logic duplication) for the status/lineage line. The per-row "Dettaglio" action is available on EVERY row (own-access included, since it's a view not a management action) — the actions `<th>`/`<td>` are therefore no longer `canManage`-gated (only the cancel/correct buttons inside stay gated). Correggi/Annulla from the sheet hand off to the SAME dialog/panel the row actions use (sheet closes first, so at most one overlay is ever open).
- **e2e closed list**: all 6 files the story named (`flights`, `flight-log:228`, `flight-reversal`, `people-management`, `typeahead-pickers`, `exports`) updated as specified. One EXTRA file not in the story's list, `package-consumption.spec.ts`, also opens the flight form 3 times and needed the same `openRegisterDialog` treatment — caught by a repo-wide grep sweep (the explicit 12.1/12.2 lesson: "lo sweep salta occorrenze").
- **Deviation (declared, not silent)**: the story's AC3 focus requirement is satisfied for the REGISTRATION flow (the default/primary case, explicitly named in the AC and covered by a new e2e test). In CORRECTION mode, the "Esci dalla correzione" button precedes the picker grid in DOM order, so it — not "Velivolo" — receives the fixed initial focus; this was left as-is (no `autoFocus` plumbing added to `SearchCombobox` for a single edge case) per karpathy "simplicity first," verified live and judged low-risk/reasonable (exiting correction is itself a sensible first action).
- No migrations, no new dependency, no env var change.

### File List

**New:**
- `src/components/ui/dialog.tsx` — `Dialog`/`Sheet` primitives (native `<dialog>`, zero dep).
- `src/lib/time-input.ts` — `parseTimeShorthand` pure parser.
- `src/lib/time-input.test.ts` — 12 unit tests.
- `src/app/api/v1/flights/[id]/route.ts` — `GET /api/v1/flights/{id}`.
- `src/app/[locale]/dashboard/flights/flight-detail-sheet.tsx` — flight detail Sheet.
- `src/app/[locale]/dashboard/people/person-create-dialog.tsx` — person create Dialog with optional role.

**Modified:**
- `src/server/services/flights.service.ts` — `getFlight` (AC 6).
- `src/server/services/flights.service.test.ts` — 8 new `getFlight` unit tests.
- `src/lib/schemas/registry.ts` — `GET /api/v1/flights/{id}` OpenAPI path + `Flight` component registration.
- `src/app/[locale]/dashboard/flights/flights-manager.tsx` — dialog-wrapped register/correct form, time-shorthand wiring, always-visible actions column + `flight-detail-action`, `FlightDetailSheet` wiring, exported `personLabel`/`flightTypeLabel`/`FlightStatusCell`.
- `src/app/[locale]/dashboard/flights/page.tsx` — `detail.*` label wiring.
- `src/app/[locale]/dashboard/people/people-manager.tsx` — `PersonCreateDialog` wiring, removed inline `CreatePersonForm`, `completeProfileHref` feedback link.
- `src/app/[locale]/dashboard/people/page.tsx` — `form.role`/`roleNone`/`profileError`/`completeProfile` label wiring.
- `messages/it.json`, `messages/en.json` — new keys: `FlightsPage.detail.*`, `PeoplePage.form.{role,roleNone,profileError,completeProfile}`.
- `e2e/flights.spec.ts` — `openRegisterDialog` helper, 6 call sites updated, submit-button scoping, 3 new story-12.3 scenarios.
- `e2e/flight-reversal.spec.ts` — `openRegisterDialog` helper + 2 call sites, submit-button scoping.
- `e2e/flight-log.spec.ts` — own-access assertion updated (`flight-open-register` absence).
- `e2e/typeahead-pickers.spec.ts` — dialog opened before the form interaction, submit-button scoping.
- `e2e/package-consumption.spec.ts` — `openRegisterDialog` helper + 3 call sites (not in the story's named list — found via sweep).
- `e2e/people-management.spec.ts` — new "Person create dialog with optional role" scenario.
- `_bmad-output/implementation-artifacts/12-3-modal-forms-detail-sheets.md` — this story file (Tasks, Dev Agent Record, File List, Status).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `12-3` → `review`.

## Review Record

Reviewer: subagent **Opus 4.8 (xhigh)**, adversarial. **Verdetto: clean-pass.** 3 nit, nessun fix richiesto.

- **Priorità zero — full e2e CI-mode su DB fresco, build di produzione**: **208 test → 198 passed + 9 flaky (retry-green, file estranei) + 1 failed** = solo `bookings.spec.ts:605` (flake di isolamento deferred 12.2, file MAI toccato). Arbitraggio sul full-run sporco del dev: aircraft-rates/ppr-register verdi su DB fresco → erano artefatti dati, non regressioni. Gates: **1242/1242 unit**. I 4 e2e nuovi 12.3 tutti verdi.
- **Verifiche live del reviewer**: matrice RBAC `GET /flights/{id}` via curl sui 5 ruoli seed (401/200/200/**404** su altrui — mai 403, mai 500 anche su id malformati/traversal); DTO no-leak (own-access = lista MENO `actorEmail`); psql conferma il profilo pilota creato dal dialog; MCP: focus su Velivolo (fix Chromium confermato), popup combobox non clippato, `1430`→pill `1:30` e `2500`→`—` senza errori console, sheet 16 campi con "—" sui null storici, Correggi→dialog prefillato, dialog persona 2 chiamate esatte (POST 201 → PUT 200) con link scheda, pilota vede solo Dettaglio e il proprio costo.
- **6 punti arbitrati (tutti a favore del dev)**: fix focus corretto; Esc a due passi = nested-overlay corretto; niente unit test Dialog accettabile (vitest `environment:'node'`, jsdom = dep vietata); deviazione focus correction-mode accettata; colonna azioni sempre visibile senza leak admin; sweep completo (person-profiles/person-detail passano col dialog invariati).
- **123-N1 (accettato)**: orario non parsabile → errore form-level `FLIGHT_TIMES_INVALID` senza `aria-invalid` sul campo colpevole (coerente col pre-12.3; con input free-text è più visibile — candidato igiene 12.5).
- **123-N2 (accettato)**: backdrop-click/Esc scartano il form a metà senza conferma — UX standard di modale, da AC 1.
- **123-N3 (accettato)**: imprecisione narrativa del Dev Record sullo sweep (person-profiles/person-detail esercitano il dialog ma non servivano modifiche).
