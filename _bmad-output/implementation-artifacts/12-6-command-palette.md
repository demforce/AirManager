---
baseline_commit: 1359912
---

# Story 12.6: Command palette ⌘K

Status: review

## Story

As a utente autenticato,
I want una command palette per navigare, creare e cercare da tastiera,
so that l'app abbia la spina dorsale di navigazione di un vero strumento desktop (FR-52; epics.md «Epic 12», intent doc cantiere F — ultima story dell'epic).

## Acceptance Criteria

1. **Given** l'area autenticata, **When** premo ⌘K/Ctrl+K (con `preventDefault` sul match — Firefox usa Ctrl+K per la barra ricerca) o clicco il **Search Trigger** in topbar (NUOVO client component stile DESIGN.md: input-like `bg-canvas` con hint `⌘K` right-aligned), **Then** si apre la palette: `<dialog>` nativo posizionato IN ALTO (non centrato), input di ricerca in testa, lista risultati sotto, niente titolo classico (`aria-label` sull'input/dialog); Esc chiude e restituisce il focus; il listener globale e la palette vivono nella shell persistente (`dashboard/layout.tsx`) — mai ri-montati tra le navigazioni.
2. **Given** la palette aperta, **Then** mostra il gruppo **"Vai a"**: le stesse voci di `visibleNavItems(actor)` con le label `DashboardPage.nav.*` (dati risolti server-side nel layout e passati piani, come per la sidebar) — il gating per ruolo è IDENTICO alla sidebar; digitare filtra le voci; ↑/↓ + Enter navigano (router push), la palette si chiude.
3. **Given** un actor con i permessi relativi, **Then** il gruppo **"Crea"** offre: "Registra volo" (`flights.manage`) e "Nuova persona" (stesso permesso del bottone esistente) — la voce naviga con deep-link `?new=1` alla pagina di destinazione, che AUTO-APRE il dialog esistente (NUOVO supporto: `flights/page.tsx` e `people/page.tsx` leggono `sp.new`, passano una prop di apertura iniziale ai rispettivi manager client; il param `new` NON conta come filtro — `hasActiveFlightFilter` non lo include). Chi non ha il permesso NON vede la voce (e il dialog resta comunque permission-gated a destinazione).
4. **Given** un actor **staff/admin**, **When** digito ≥2 caratteri, **Then** il gruppo **"Risultati"** cerca cross-entity sugli endpoint ESISTENTI (debounced, pattern `searchPeople`/`searchAircraft` del form volo): persone (`GET /api/v1/people?q=`) → Enter apre la scheda `people/[id]`, con azione secondaria "Voli di …" (`/dashboard/flights?personId=`); velivoli (`GET /api/v1/aircraft?q=`) → Enter apre il registro filtrato (`/dashboard/flights?aircraftId=`). **Per i ruoli NON-staff il gruppo ricerca NON compare** (gli endpoint rispondono comunque 403 server-side — NFR-10 resta in mano al server; decisione vincolante: NESSUN endpoint di ricerca nuovo, v. Contesto).
5. **Given** la palette, **Then** è bilingue IT/EN (stringhe nuove nel namespace `DashboardShell`: placeholder, gruppi, empty state, hint), keyboard-only completa (pattern combobox/listbox come `SearchCombobox`: `aria-activedescendant`, opzioni `role="option"`, un solo tab-stop) e senza mouse-trap; con query senza risultati mostra l'empty state.
6. **Given** la suite di test, **Then** `npm run gates` passa, gli e2e restano verdi e un NUOVO `e2e/command-palette.spec.ts` copre: (a) Ctrl+K apre, voci nav gated (admin vs pilota — pilota: 3 voci, niente gruppo Crea/Risultati), Enter naviga e chiude; (b) "Registra volo" dalla palette da un'ALTRA pagina → atterra su flights col dialog aperto (`?new=1`); (c) staff cerca una persona → Enter apre la scheda; (d) click sul Search Trigger apre la palette; selettori scoped (landmark/testid), convenzione di progetto.
7. **Given** la verifica visiva (Playwright MCP), **Then** screenshot di: trigger in topbar (desktop), palette aperta con i 3 gruppi (staff), palette del pilota (solo nav), empty state; giudizio estetico coerente con DESIGN.md «Search Trigger».

## Contesto e decisioni di design (vincolanti)

- **Recon 2026-07-12 su HEAD `1359912`** (fatti verificati):
  - Topbar = server component presentazionale (`topbar.tsx:26-35`, riceve solo primitive; LocaleSwitcher/LogoutButton sono già client montati dentro — stesso pattern per il trigger). `layout.tsx:34-63` calcola actor/me/navItems UNA volta (shell persistente).
  - **Ricerca esistente**: SOLO people e aircraft hanno `q` free-text; ENTRAMBI staff-only (`people.read` a `people.service.ts:181`, `aircraft.manage` a `aircraft.service.ts:152` — un pilota/allievo riceve 403). Flights/bookings/PPR NON hanno `q`. I client helper `searchPeople`/`searchAircraft` sono in `flights-manager.tsx:58-92` (debounce/shape — riusare il pattern, eventualmente estraendoli in un modulo condiviso).
  - **NESSUN deep-link ad azione esiste** (`?new` non è letto da nessuna page); i dialog creazione sono stato locale dei manager client (`dialogOpen` `flights-manager.tsx:419`; `createDialogOpen` `people-manager.tsx:128`).
  - **Deep-link con filtri già supportati**: flights `?personId=/aircraftId=` (letti SOLO se canManage, `flights/page.tsx:108-109`), people/[id] (own-access o people.read), bookings `?date=`, expiries `?scope/status`, finance `?from/to/categoryId/sign` — la palette li usa senza aggiungerne.
  - **Dialog primitive**: il centraggio di `ui/dialog.tsx` è hardcoded sull'elemento `<dialog>` (`:108`) e `useNativeDialog` NON è esportato (`:48`).
  - **Nessun listener keydown globale** nell'app; i18n: namespace `DashboardShell` per le stringhe di shell; label nav in `DashboardPage.nav.*`.
- **Decisione — ricerca SOLO staff, NESSUN endpoint nuovo**: l'epic ammette endpoint nuovi per ⌘K, ma una ricerca own-scoped per non-staff (propri voli/prenotazioni) aggiunge superficie API e valore marginale: per i non-staff le 3 voci nav + "le mie" pagine coprono il caso d'uso. La palette quindi: non-staff = navigazione (+ Crea se mai avranno permessi); staff = navigazione + crea + ricerca. Questa è una DELIMITAZIONE dichiarata dell'AC epico "cerca cross-entity (persone, velivoli, voli, prenotazioni, PPR)": voli/prenotazioni/PPR si raggiungono via nav e via azioni secondarie dai risultati persona/velivolo (deep-link filtrati), non via free-text (che il server non supporta). Da riportare nel handoff di fine epic.
- **Decisione — palette su `<dialog>` nativo con variante top-aligned**: ESPORTARE `useNativeDialog` da `ui/dialog.tsx` (refactor chirurgico, Dialog/Sheet invariati) e costruire `CommandPalette` (nuovo, `src/components/ui/command-palette.tsx` o in `dashboard/`) col proprio `<dialog>` `items-start` (`mt-[12-15vh]`, `max-w-xl`), stesso plumbing (showModal, close event, click-fuori). NIENTE cmdk/dipendenze (coerenza zero-dep dell'epic).
- **Decisione — `?new=1`**: la voce "Crea" NAVIGA (non monta dialog duplicati nella palette): un solo punto di verità per i form. La page legge `sp.new === '1'` (+ permesso) e passa `initialCreateOpen` al manager; il manager apre il dialog al mount UNA volta (lo stato resta suo). Il param non entra in `hasActiveFlightFilter` (contesto grouped invariato) né nel `key` di remount se creerebbe reset indesiderati — verificare.
- **Interazione**: input testuale unico; i gruppi si filtrano insieme (nav: match su label; crea: match su label; risultati: fetch debounced ≥2 char); ordine gruppi Vai a → Crea → Risultati; `aria-activedescendant` attraversa i gruppi; Enter = azione della voce attiva; il fetch fallito mostra empty state con messaggio (niente crash).
- **e2e**: attenzione a `Meta+k` vs `Control+k` (in Playwright su Linux usare `Control+k`); il nuovo spec segue i pattern di `app-shell.spec.ts` (login helper, landmark scoped). Verifica trasversale: il listener NON deve rubare ⌘K quando il focus è in un input? DECISIONE: la palette si apre COMUNQUE (convenzione Linear/Slack) — ma non quando un altro `<dialog>` è già aperto (guard su `document.querySelector('dialog[open]')` o stato).
- **Fuori scope (dichiarato)**: jump-to-date (COULD, non richiesto); batch-entry; ricerca own-scoped non-staff (v. decisione); endpoint nuovi; voci crea aggiuntive (prenotazione/movimento — candidabili post-epic); riordino/priorità risultati sofisticati; history/recent.
- **NFR-8/10**: un solo tab-stop nella palette; il server resta l'unico guardiano (la palette nasconde ciò che l'actor non può fare, ma ogni azione atterra su superfici già gated).

## Tasks / Subtasks

- [x] **T1 (AC 1)** — Export di `useNativeDialog`; `CommandPalette` top-aligned su `<dialog>` nativo; listener globale ⌘K/Ctrl+K (client, nella shell) con guard dialog-già-aperto; `SearchTrigger` in topbar.
- [x] **T2 (AC 2, 3)** — Gruppi Vai a + Crea (dati piani dal layout, gating = sidebar); supporto `?new=1` su flights/people (prop di apertura iniziale, param fuori da filtri/key).
- [x] **T3 (AC 4)** — Gruppo Risultati staff-only (riuso pattern searchPeople/searchAircraft, debounce, azioni primaria+secondaria, empty/error state).
- [x] **T4 (AC 5)** — i18n `DashboardShell.*` IT/EN; a11y combobox/listbox con activedescendant; keyboard-only completo.
- [x] **T5 (AC 6)** — `e2e/command-palette.spec.ts` (4 scenari); `npm run gates`; e2e mirati: app-shell, flights, people-management, rbac + nuovo spec.
- [x] **T6 (AC 7)** — Verifica visiva MCP (screenshot) con giudizio DESIGN.md; Dev Agent Record + File List; sprint-status `12-6` → `review`.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; story UI: OBBLIGATORIE `impeccable`, `design-taste-frontend`, `ui-ux-pro-max` (query: "command palette UX"); contratto `DESIGN.md` «Search Trigger» (`bg-canvas text-mid-gray radius-18 con ⌘K right-aligned`).
- ULTIMA story dell'epic: dopo la review arriva un pass grafico complessivo — lascia il campo pulito (zero residui, zero screenshot committati, grep finali).
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`); gates SOLO `npm run gates`; MAI `playwright install`. MAI stash.
- Baseline: `1359912` (12.5 done), 30 migrazioni, ~214 e2e / 1278 unit su DB fresco. Flake noti: cash-report/school ECONNRESET; classi di volume su full-run sporco (provare in isolamento).
- Il listener globale è l'unico codice "sempre attivo" introdotto dall'epic: tenerlo minimo (un keydown, un check, un preventDefault) e passivo altrove.

### Project Structure Notes

- Nuovi file attesi: `src/components/ui/command-palette.tsx` (o `dashboard/command-palette.tsx`), `dashboard/search-trigger.tsx`, `e2e/command-palette.spec.ts`; eventuale estrazione `src/lib/entity-search.ts` (searchPeople/searchAircraft condivisi). Modifiche: `ui/dialog.tsx` (export hook), `dashboard/layout.tsx` + `topbar.tsx`, `flights/page.tsx`+`flights-manager.tsx`, `people/page.tsx`+`people-manager.tsx` (`?new=1`), `messages/{it,en}.json`. NESSUNA migrazione, env var, endpoint o dipendenza nuova.

### References

- [Source: _bmad-output/planning-artifacts/epics.md «Story 12.6»; intent doc cantiere F; DESIGN.md «Search Trigger»]
- [Source: recon Explore 12.6 in sessione su HEAD 1359912 — topbar.tsx :5-35; layout.tsx :30-68; ricerca: people.service.ts :180-237 (:181 authorize staff-only), aircraft.service.ts :151-165 (:152), flights.service.ts :1289-1327, bookings.service.ts :459-484 (calendario condiviso by design), ppr.service.ts :225; searchPeople/searchAircraft flights-manager.tsx :58-92; dialog.tsx :48 (hook non esportato) :108 (centraggio); nav-items.ts :28-77; deep-link reali §7; zero listener globali; i18n DashboardShell/DashboardPage.nav]
- [Source: story file 12-2 (shell/layout, app-shell.spec), 12-3 (Dialog nativo, pattern overlay), 12-5 Review Record (125-N1 convenzione commit-on-valid)]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (dev subagent). Implementation was produced by a prior dev-subagent run on this same story that was killed mid-verification (timeout on an e2e `fill`, then interrupted) before completing tests/visual check/bookkeeping/commit. This session (continuation, same model) did NOT re-implement — it read the full diff against the AC, ran/repaired the e2e suite, did the interactive MCP visual/i18n verification, completed this record, and made the single implementation commit.

### Debug Log References

- `npm run gates` on the inherited WIP (pre-verification): PASS, 1278/1278 unit — confirmed by the orchestrating session before handoff.
- First `npx playwright test e2e/command-palette.spec.ts` run (default 2 workers, cold `next dev`/Turbopack, DB freshly reset) failed all 4 scenarios at the shared login helper (`toHaveURL(/\/it\/dashboard$/)` timing out on first-ever hit of each route while Turbopack compiled it on demand) — a known flaky class already documented in this story's Dev Notes and in `playwright.config.ts`'s CI-vs-dev comment, not an app or test bug. Re-running the same spec (routes now warm) passed all 4/4, repeated twice (workers=1 and default parallelism) for confirmation. No code or test changes were needed.
- Targeted regression run `e2e/app-shell.spec.ts e2e/flights.spec.ts e2e/people-management.spec.ts e2e/rbac.spec.ts`: 27/27 passed.
- Standalone Playwright-library script (not the app) confirmed, outside the test runner, that "Registra volo" from the palette on the people page does land on `/dashboard/flights?new=1` with the create dialog open, and that a staff person search does open the scheda — isolating the earlier failures to test-runner/dev-server warmup, not component logic.
- Interactive MCP verification (session cookie injection via a local Playwright script that read `SEED_ADMIN_PASSWORD` from `.env` server-side and wrote only the resulting session cookies to a scratch file — the password itself was never typed into or printed by any tool call, per the story's env-handling instruction): confirmed (a) admin/staff palette shows Vai a + Crea + Risultati (3 groups), person search returns a primary "Cognome Nome" row plus a secondary indented "Voli di …" action, empty query shows the empty state; (b) pilot palette shows only 3 nav items, no Crea/Risultati; (c) the `?new=1` deep-link auto-opens the flight registration dialog; (d) pressing Ctrl+K while that dialog is open does NOT open the command palette (guard via `document.querySelector('dialog[open]')` works); (e) `/en/dashboard` renders the palette fully in English (trigger "Search", dialog `aria-label` "Commands", "Go to"/"Create"/"Results" groups, "Log flight"/"New person", "Flights of {name}", footer hint) — no leaked IT strings.
- All debug scripts, screenshots, and MCP artifacts (`.playwright-mcp/`, `test-results/`, root `*.png`) were deleted before the commit; `git status` was clean of them.

### Completion Notes List

- Implementation (T1–T4, all of AC 1–5) is exactly as left by the prior dev-subagent run; this session made no functional code changes — verification only confirmed it already met every AC.
- T5/AC 6: the new `e2e/command-palette.spec.ts` (4 scenarios: Ctrl+K + role gating + Enter-navigates; "Registra volo" cross-page `?new=1` deep-link; staff person search → scheda; trigger click) passes 4/4, confirmed on two separate runs after ruling out the dev-server cold-compile flake described above. The four targeted regression specs (app-shell, flights, people-management, rbac) pass in full (27/27) — no interaction with the new global keydown listener or the `?new=1` deep-links regressed existing flows.
- T6/AC 7: visual verification against DESIGN.md "Search Trigger" (`bg-canvas`/`text-mid-gray`, 18px radius, right-aligned `⌘K` hint) done via Playwright MCP — trigger, 3-group admin palette, results group (primary + secondary row), empty state, pilot nav-only palette, and the fully-localized EN palette were all screenshotted and judged visually consistent with the token contract; no visual fixes were needed.
- Verified the two structural guarantees called out in the story's Contesto: `?new=1` is not merged into `flights/page.tsx`'s `filterQuery` (so it never pollutes `hasActiveFlightFilter` or the `FlightsManager` remount `key`), and the global ⌘K/Ctrl+K listener is guarded by `document.querySelector('dialog[open]')` so it never fires while another native `<dialog>` (e.g. the flight form) is already open — confirmed interactively, not just by reading the code.
- `npm run gates` re-run clean after the story-file/sprint-status bookkeeping edits (no source changes since the orchestrating session's pre-handoff gates run).

### File List

- `src/app/[locale]/dashboard/command-palette.tsx` (new)
- `src/app/[locale]/dashboard/search-trigger.tsx` (new)
- `e2e/command-palette.spec.ts` (new)
- `src/components/ui/dialog.tsx` (export `useNativeDialog`)
- `src/app/[locale]/dashboard/layout.tsx` (resolve nav/create/search permissions, pass to `Topbar`)
- `src/app/[locale]/dashboard/topbar.tsx` (render `SearchTrigger`)
- `src/app/[locale]/dashboard/flights/page.tsx`, `src/app/[locale]/dashboard/flights/flights-manager.tsx` (`?new=1` → `initialCreateOpen`)
- `src/app/[locale]/dashboard/people/page.tsx`, `src/app/[locale]/dashboard/people/people-manager.tsx` (`?new=1` → `initialCreateOpen`)
- `messages/it.json`, `messages/en.json` (`DashboardShell.searchTrigger`/`DashboardShell.commandPalette`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (`12-6-command-palette` → `review`)
- `_bmad-output/implementation-artifacts/12-6-command-palette.md` (this file — tasks/Dev Agent Record)
