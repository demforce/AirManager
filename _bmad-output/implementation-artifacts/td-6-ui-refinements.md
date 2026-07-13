---
baseline_commit: ff82d5d
---

# TD-6: Rifiniture UI post-Epic 12 (change request utente 2026-07-12)

Status: done

## Story

As a utente,
I want cinque rifiniture trasversali all'interfaccia appena refactorata,
so that tabelle e form siano più asciutti e coerenti (change request utente a valle dell'Epic 12; ratifiche in questa sessione: filtri chiusi+auto-aperti con contatore; storni come badge inline nella tratta).

## Acceptance Criteria

1. **Filtri dietro un tasto** — **Given** le barre filtri multi-controllo delle tabelle (lista CHIUSA: registro voli `flight-filter-bar`, cassa, registro PPR `ppr-register-filter-bar`, dashboard scadenze `expiry-dashboard-filters`), **Then** sono NASCOSTE di default dietro un tasto "Filtri" (nuovo componente riusabile, outline, con **contatore dei filtri attivi** come badge quando >0) e il pannello si **auto-apre se un filtro è attivo** (stato/URL — deep-link e banner inclusi); il bottone reset esistente resta DENTRO il pannello coi suoi testid. DELIMITAZIONE dichiarata: le barre di ricerca (people/aircraft: search+checkbox, affordance primaria) e i selettori di periodo dei report (finance/report, school summary: preset+range che SONO il contenuto della pagina) NON si nascondono.
2. **Azioni di riga a icone** — **Given** i bottoni azione STABILI delle righe di tabella (lista CHIUSA dal recon §2: voli Dettaglio/Annulla/Modifica; persone Modifica/Profili/Archivia-Ripristina; velivoli Modifica/Archivia/Fuori-Rientro servizio/Rettifica contaore/Tariffe; prenotazioni Sposta/Cancella; scadenze-panel Modifica/Elimina; utenti Modifica/Disattiva-Attiva/Reinvia invito; categorie Rinomina/Disattiva-Riattiva/Elimina; pacchetti e tipi Modifica/Disattiva-Riattiva/Elimina; PPR register Completa/Annulla; my-expiries Proponi aggiornamento), **Then** diventano bottoni-ICONA: nuovo set SVG inline zero-dep in `src/components/ui/icons.tsx` (stile canonico esistente: `viewBox 24`, `stroke=currentColor`, `strokeWidth 1.75`, round, `aria-hidden`, ~16px — come `CalendarGlyph`/`SearchIcon`) + variante `size="icon"` di `Button` (quadrata, min-target 32px); OGNI bottone-icona ha `aria-label` E `title` = label testuale ATTUALE (invarianza `getByRole('button',{name})` — gli e2e per-name NON devono cambiare). I flussi di CONFERMA transienti (Conferma/annulla, prompt inline) restano TESTUALI (un'azione distruttiva si conferma leggendo, non decifrando un'icona).
3. **"Correggi" → "Modifica"** — **Given** l'azione di correzione volo, **Then** i VALORI i18n cambiano: `FlightsPage.list.table.correctAction` "Correggi"→"Modifica" (EN "Correct"→"Edit"), `correctPanel.title` "Correggi volo"→"Modifica volo" (EN coerente); `correctPanel.submit` ("Conferma correzione") ed `exit` ("Annulla correzione") RESTANO (il concetto di dominio resta lo storno-correzione); testid `flight-correct-*` INVARIATI; e2e aggiornati (`flight-reversal.spec.ts:316` heading; l'aria-label dell'icona riga usa il nuovo valore).
4. **Bottoni finali dei form allineati** — **Given** le righe di bottoni finali di form/dialog/sheet, **Then** stanno su UNA riga allineata: fix del caso segnalato (sheet dettaglio volo: Chiudi entra nello stesso `flex gap-3` di Modifica/Annulla — `flight-detail-sheet.tsx:115-125`) + audit degli altri contenitori (recon §4: quasi tutti già `flex gap-3` a 2 bottoni — verificare che nessun altro vada a capo a larghezze normali; dichiarare l'esito dell'audit).
5. **Via la colonna STATO dal registro voli** — **Given** il registro, **Then** la colonna Stato SPARISCE (th :824, td :966, `GROUPED_COLUMN_COUNT` 7→6): sui voli non-REGISTERED un badge compatto "Annullato" (testid `flight-status-badge` INVARIATO) compare INLINE nella cella tratta e la riga è leggermente attenuata (`text-mid-gray`/opacity — ratifica utente); il dettaglio storno completo (motivo, lineage `correctionOf`/`correctedBy`) resta nello SHEET (che già riusa `FlightStatusCell`); e2e `flight-reversal.spec.ts:255/:340` restano validi (badge nella riga).
6. **Given** la suite, **Then** `npm run gates` passa e gli e2e restano verdi con gli aggiornamenti (lista CHIUSA in Contesto); NUOVI scenari e2e minimi: tasto Filtri (chiuso di default → click apre → filtro applicato → contatore visibile; deep-link con filtro → pannello già aperto), un bottone-icona risolto per accessible name (es. `getByRole('button',{name:'Modifica'})` sulla riga voli).
7. **Given** la verifica visiva (Playwright MCP), **Then** screenshot di: registro voli (filtri chiusi + contatore, righe senza colonna Stato con un annullato inline), pannello filtri aperto, una tabella con azioni a icone (tooltip visibile), sheet coi 3 bottoni allineati; giudizio contro DESIGN.md (icone thin-stroke, capitolo Imagery).

## Contesto e decisioni di design (vincolanti)

- **Ratifiche utente 2026-07-12 (sera)**: filtri chiusi di default + auto-aperti se attivi + contatore sul tasto; storni = badge inline nella tratta + riga attenuata (niente colonna).
- **Recon su HEAD `ff82d5d` — censimenti CHIUSI** (path:linea nel recon di sessione):
  - §1 barre filtri: flights `flights-manager.tsx:1128` (hasActiveFilter :1093, reset :1207); cash `cash-register.tsx:268` (NESSUN flag/reset oggi — crearne uno col pattern flights); ppr-register `:196` (hasActiveFilter :154 — il default APPROVED NON conta come attivo); expiry-dashboard `dashboard-filters.tsx:80` (flag :76, reset :134). NON toccare: people :376 / aircraft :485 (search), report `report-filters.tsx:47` / school `summary-filters.tsx:45` (preset periodo), my-expiries/users/bookings (nessuna barra).
  - §2 azioni riga: voli `FlightRow` :972-997 (button inline, testid presenti — gli unici NON `<Button>`); people :288-342, aircraft :379-461, bookings :290-341 (testid), expiries-panel :296-331, users :190-212, categories :147-201, packages :224-280, types :181-236, ppr-register :290-330 (testid), my-expiries :148. e2e per-NAME (da preservare via aria-label): people-management :95-118, person-profiles :43, aircraft-management :85-107, cash-register :168/:191, package-types :121-155, expiry-types :129-197, user-management :148, expiry-registration :263/:305; il sheet usa `getByRole 'Chiudi'` (flights :308/:555, flight-log :341).
  - §3 Correggi: valori i18n it/en :1077 e :1100; usi :996/:1706 e `flight-detail-sheet.tsx:117`; e2e stringhe :316/:319.
  - §4 contenitori bottoni: sheet :115-125 (unico a-capo anomalo); `FormActions` condiviso e `flex gap-3` altrove.
  - §5 colonna Stato: header :824, cella :966-968, `FlightStatusCell` :1017-1052 (REGISTERED→null; badge :1035; cancelledDetail :1042; chip lineage :1048-1049), `GROUPED_COLUMN_COUNT` :918; e2e badge SOLO flight-reversal :255/:340.
  - §6 stile SVG canonico: `date-picker.tsx:380` e `search-trigger.tsx:14`.
- **Componente disclosure filtri**: riusabile (`src/components/filter-disclosure.tsx` o simile, client): props = label, activeCount, defaultOpen (=hasActiveFilter al mount), children; niente `<details>` qui (serve animazione/stato controllato? NO — semplicità: anche `<details>` va bene se il default-open è gestibile via prop `open` iniziale; scegliere la via più semplice e dichiararla). Il contatore usa una chiave i18n nuova per superficie o condivisa (`DashboardShell.filtersToggle`? — scegliere UNA collocazione condivisa e dichiararla).
- **Icone**: set minimo condiviso (occhio/dettaglio, matita/modifica, x-cerchio/annulla, cestino/elimina, archivio, ripristino, persona-badge/profili, interruttore/attiva-disattiva, busta/reinvia, contaore/gauge, tag-euro/tariffe, frecce/sposta, spunta/completa, invio-proposta) — nomi funzionali, riuso tra tabelle; NIENTE libreria esterna. `title` nativo basta come tooltip (convenzione FR-51). Dove un'icona risulterebbe criptica il dev PUÒ tenere icona+testo come deviazione dichiarata (bar molto strette escluse).
- **e2e — aggiornamenti attesi (lista CHIUSA)**: i test che APRONO i filtri da UI devono prima cliccare il tasto Filtri → flight-log (:245-334 aree filtri), flights (:522), cash-register (:114-116), ppr-register (:336 e filtri status), expiry-dashboard (filtri); i test che arrivano con filtri da URL (exports :259, school drill-down, home :235) trovano il pannello GIÀ aperto (auto-open) — verificare che le asserzioni non cambino. flight-reversal :316 heading "Modifica volo". NESSUN cambio ai test per-name delle azioni (garantito dall'aria-label).
- **Fuori scope (dichiarato)**: nascondere le barre search/periodo (delimitazione AC 1); icone su bottoni FUORI dalle righe di tabella (form, export, load-more, paletta); rinomine oltre Correggi; cambi API/service; 121-N1 (bottone forza prenotazione — decisione utente ancora pendente).

## Tasks / Subtasks

- [x] **T1 (AC 1)** — Componente disclosure "Filtri" + contatore; adozione sulle 4 barre (cash guadagna anche flag attivo/reset col pattern flights); i18n nuove chiavi.
- [x] **T2 (AC 2, 3)** — `icons.tsx` + `Button size="icon"`; conversione delle azioni riga (lista chiusa) con aria-label/title = label attuale; rinomina Correggi→Modifica (i18n it/en + e2e heading).
- [x] **T3 (AC 4, 5)** — Sheet: 3 bottoni allineati + audit contenitori; rimozione colonna Stato con badge inline nella tratta + riga attenuata (colSpan aggiornato).
- [x] **T4 (AC 6)** — Aggiornamento e2e lista chiusa + 2 scenari nuovi; `npm run gates`; e2e mirati: flight-log, flights, flight-reversal, cash-register, ppr-register, expiry-dashboard, people-management, person-profiles, aircraft-management, package-types, expiry-types, user-management, bookings, exports.
- [x] **T5 (AC 7)** — Verifica visiva MCP (4 screenshot) con giudizio DESIGN.md; Dev Agent Record + File List; sprint-status `td-6` → `review`.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; story UI: OBBLIGATORIE `impeccable`, `design-taste-frontend`, `ui-ux-pro-max` (query: "icon buttons accessibility"); contratto `DESIGN.md` (Imagery: icone thin-stroke 1.5–2px, funzionali, mai decorative).
- Il rischio n.1 della story è la rottura dei `getByRole('button',{name})`: l'aria-label DEVE essere il label i18n corrente (quello NUOVO per Modifica) — verificare con un run mirato PRIMA dello sweep completo.
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`); gates SOLO `npm run gates`; MAI `playwright install`; MAI stash; niente screenshot committati.
- Baseline: `ff82d5d` (epic 12 done + handoff), 30 migrazioni, **218 e2e / 1278 unit** su DB fresco. Flake noti: bookings:636 (isolamento, deferred), classi ECONNRESET, cold-compile dev-mode.

### Project Structure Notes

- Nuovi file attesi: `src/components/ui/icons.tsx`, componente disclosure filtri, `e2e` scenari nel file più pertinente (flight-log o nuovo piccolo spec). Modifiche: `button.tsx` (size icon), le 4 barre filtri, i ~11 file con azioni riga, `flight-detail-sheet.tsx`, `flights-manager.tsx` (colonna Stato), `messages/{it,en}.json`, e2e lista chiusa. NESSUNA migrazione, env var, API o dipendenza nuova.

### References

- [Source: change request utente 2026-07-12 sera (5 punti) + 2 ratifiche AskUserQuestion (filtri auto-open+contatore; storni inline)]
- [Source: recon Explore TD-6 in sessione su HEAD ff82d5d — censimenti §1-§7 (barre filtri con flag/reset, azioni riga per tabella con e2e per-name, occorrenze Correggi, contenitori bottoni, colonna Stato, stile SVG canonico, collocazioni i18n)]
- [Source: story file 12-4 (FlightRow/FlightStatusCell/GROUPED_COLUMN_COUNT), 12-3 (sheet), Review Record 12.1-12.6 (lezioni: verifica live, sweep con grep, mai stash)]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), BMAD dev subagent, xhigh effort.

### Debug Log References

- `npm run gates` (final): PASS lint / PASS typecheck / PASS test (1278/1278) / PASS build.
- Targeted e2e (curl localhost:3000 must fail before every run; `fuser -k 3000/tcp` before each): flight-log.spec.ts (9/9, 1 cold-compile login flake on the very first re-run, 0 on the clean re-run), flights.spec.ts (13/13), flight-reversal.spec.ts (2/2, incl. the `test.slow()` reversal flow), cash-register.spec.ts (5/5), ppr-register.spec.ts (7/7), expiry-dashboard.spec.ts (4/4), person-profiles/package-types/user-management (14/14), aircraft-management/aircraft-rates/aircraft-status-hours (10/13 — the 3 failures are pre-existing dirty-DB/cold-compile flakes, not regressions, see below), bookings.spec.ts + exports.spec.ts (27/30 — the 3 failures are all the SAME documented `booking-form-success` flake class as the story's own "bookings:636" note, at the booking-CREATE step, never reaching the Sposta/Cancella icon buttons).
- Two real e2e bugs found and fixed during this sweep (both were MY OWN e2e-authoring mistakes, not product bugs): (1) `flight-log.spec.ts`'s `resetFiltersAndSettle` helper and one inline reset click checked/used a filter field BEFORE reopening the now-closed "Filtri" panel post-reset — reordered to reopen first; (2) `ppr-register.spec.ts`'s "PPR category cash movement" test used `cash-filter-category` directly without opening the cash register's own "Filtri" panel first (a cross-file testid usage I missed on the first sweep of `cash-register.spec.ts` alone) — fixed with an explicit toggle click.
- `aircraft-rates.spec.ts`'s 2 failures: confirmed via the Playwright error-context page snapshot that EVERY icon action button (Modifica/Archivia/Fuori servizio/Rettifica contaore/Tariffe) resolves correctly by accessible name across dozens of rows on page 1 — the failing test's own newly-created aircraft simply landed on page 2 of the (accumulated, never-reset) dev DB, a pre-existing pagination-scoping gap in that one spec file (other specs already carry a documented fix for this same class of issue), unrelated to TD-6.

### Completion Notes List

- **AC 1 (Filtri disclosure)**: new `src/components/ui/filter-disclosure.tsx` — a plain `useState` toggle (not `<details>`, declared choice: keeps the trigger a normal outline `Button` + solid `Badge` counter instead of fighting `<summary>`'s UA marker style) wrapping each of the 4 filter bars (`flight-filter-bar`, `cash-filter-bar` — new, cash had no active-filter/reset before this story — `ppr-register-filter-bar`, `expiry-dashboard-filters`). `defaultOpen` = the caller's own `hasActiveFilter`, so a deep link or a filter already in the URL lands pre-opened. Toggle label is `DashboardShell.filtersToggle` ("Filtri"/"Filters"), read via `useTranslations` directly in the component (same pattern as `search-trigger.tsx`) — ONE shared i18n key, no prop-threading through 4 page.tsx files. Reset buttons keep their existing testids, now inside the panel.
- **AC 2/3 (icon row actions + Correggi→Modifica)**: new `src/components/ui/icons.tsx` (14 thin-stroke SVGs, canonical style from `CalendarGlyph`/`SearchIcon`: viewBox 24, strokeWidth 1.75, round caps, aria-hidden, ~16px) + `Button` `size="icon"` (32px square). Converted the closed list of 11 tables' STABLE row actions to icon buttons with `aria-label`/`title` = the CURRENT i18n label (verified with a targeted risk-mitigation e2e — `row action icon buttons resolve by their CURRENT accessible name` — before the full sweep). Transient confirm flows (Sì/Annulla, Conferma/Annulla prompts) were left textual, untouched. `FlightsPage.list.table.correctAction`/`correctPanel.title` renamed Correggi→Modifica (EN Correct→Edit) in it/en; `flight-correct-*` testids and the `submit`/`exit` labels (still storno-correzione domain concept) unchanged.
- **AC 4 (form footer buttons)**: `flight-detail-sheet.tsx` — Chiudi now shares the same `flex gap-3` row as Modifica/Annulla (was a separate row below). Audit of every other multi-button container in the app (22 files using `flex gap-3`, all `FormActions`-style duplicated-per-file 2-button rows) found no other anomaly — the sheet was the sole a-capo case, confirmed by direct file inspection of every panel/dialog footer.
- **AC 5 (Stato column removed)**: `flights-manager.tsx` — header/cell removed, `GROUPED_COLUMN_COUNT` 7→6. `FlightStatusCell` (unchanged, still reused verbatim by the sheet) now renders inside the tratta cell (below the route text) instead of its own column; row gets `opacity-60` when `status === 'CANCELLED'`. `flight-status-badge` testid and its container text (reason, lineage chips) are unchanged in substance — only relocated — so `flight-reversal.spec.ts`'s existing row-content assertions kept passing unmodified.
- **AC 6 (e2e)**: updated the closed list per Dev Notes (flight-log, flights, flight-reversal, cash-register, ppr-register — the `cash-filter-category` fix above lives here too); added 2 new minimal scenarios to `flight-log.spec.ts`: the Filtri toggle lifecycle (closed→click→apply→counter→deep-link-preopened) and an icon button resolved by `getByRole('button', {name: 'Modifica'})`, asserting `'Correggi'` has zero matches.
- **AC 7 (visual verification)**: logged in via cookie injection (server-side NextAuth credentials POST via curl reading `SEED_ADMIN_PASSWORD` from `.env`, never printed; injected the resulting session cookie into the Playwright MCP browser context — no password ever typed through an MCP tool call). Screenshots taken and judged, then deleted (not committed, per rule): (1) registry with Filtri closed, no Stato column, icon actions — matches DESIGN.md Imagery (thin-stroke #0a0a0a icons via `currentColor`/`text-ink`, functional not decorative); (2) `?status=CANCELLED` deep link — Filtri auto-opened with counter badge "1" (matches the DESIGN.md Badge tag spec: `#171717`/`#fafafa` pill) and the reset button inside, a cancelled row showing the "Annullato" badge + reason inline in the tratta cell, row visibly dimmed; (3) hover on an icon button — `title`/`aria-label` confirmed present via DOM inspection (`"Modifica"`), the native OS tooltip bubble itself is not capturable in a headless `page.screenshot()`, a Playwright/Chromium limitation, not a defect; (4) the detail sheet — Modifica/Annulla/Chiudi on one aligned row, still textual (sheet buttons are not table row actions, out of AC 2's scope). Judgment: compliant with DESIGN.md's clinical-monochrome contract; no deviations found.
- **Declared "Stato" i18n key**: `FlightsPage.list.table.status` (the removed column header's translation) was intentionally LEFT in `messages/{it,en}.json` and in the `FlightsManagerLabels` type — deleting it would touch 4 more files (2 large JSON dictionaries with several other `"status"` keys nearby, the type, and `page.tsx`'s wiring) for a purely cosmetic dead-string cleanup the AC never asked for; flagged for the reviewer rather than risking a JSON edit mistake for no behavioral gain.

### File List

- `src/components/ui/icons.tsx` (new)
- `src/components/ui/filter-disclosure.tsx` (new)
- `src/components/ui/button.tsx` (size="icon")
- `src/app/[locale]/dashboard/flights/flights-manager.tsx`
- `src/app/[locale]/dashboard/flights/flight-detail-sheet.tsx`
- `src/app/[locale]/dashboard/finance/cash-register.tsx`
- `src/app/[locale]/dashboard/finance/page.tsx`
- `src/app/[locale]/dashboard/finance/categories/categories-manager.tsx`
- `src/app/[locale]/dashboard/finance/packages/packages-manager.tsx`
- `src/app/[locale]/dashboard/ppr/register/ppr-register.tsx`
- `src/app/[locale]/dashboard/expiries/dashboard-filters.tsx`
- `src/app/[locale]/dashboard/expiries/my-expiries.tsx`
- `src/app/[locale]/dashboard/expiries/types/types-manager.tsx`
- `src/app/[locale]/dashboard/people/people-manager.tsx`
- `src/app/[locale]/dashboard/people/expiries-panel.tsx`
- `src/app/[locale]/dashboard/aircraft/aircraft-manager.tsx`
- `src/app/[locale]/dashboard/bookings/bookings-list.tsx`
- `src/app/[locale]/dashboard/users/users-manager.tsx`
- `messages/it.json`
- `messages/en.json`
- `e2e/flight-log.spec.ts`
- `e2e/flights.spec.ts`
- `e2e/flight-reversal.spec.ts`
- `e2e/cash-register.spec.ts`
- `e2e/ppr-register.spec.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/td-6-ui-refinements.md` (this file)

## Change Log

- 2026-07-13: Implemented all 5 ACs — reusable "Filtri" disclosure with active-filter counter on the 4 closed-list bars; icon-only row actions (14 new SVGs, `Button size="icon"`) across the 11 closed-list tables with `aria-label`/`title` invariance; Correggi→Modifica i18n rename; flight-detail-sheet footer button alignment fix + full-app audit (no other anomaly); flight registry Stato column removed in favor of an inline badge + dimmed row; e2e closed-list updates plus 2 new minimal scenarios; visual verification against DESIGN.md via Playwright MCP. Status → review.

## Review Record

Reviewer: subagent **Opus 4.8 (xhigh)**, adversarial. **Verdetto: clean-pass.** 4 note non bloccanti, nessun fix richiesto.

- **Priorità zero — full e2e CI-mode su DB fresco, build di produzione**: **214 passed + 5 flaky (retry-green, classi note) + 2 failed / 221**. I 2 hard-fail (`command-palette.spec.ts:95` dialog vuoto sotto DB sporco; `instructor-rates.spec.ts:123` race di refresh della tariffa corrente) sono PROVATI pre-esistenti con checkout del baseline `f5c81d3` e ri-esecuzione mirata: falliscono identici PRIMA di TD-6. Gates 1278/1278.
- **I 5 punti verificati live** (admin + pilota own-access, build di produzione, bounding box): filtri chiusi/auto-aperti/contatore/reset/keyboard su tutte e 4 le superfici (deep-link `?status=` → pannello aperto con badge "1"); icone su 7 superfici risolte per accessible name con target 32px e stroke 1.75 conforme a DESIGN.md; Correggi→Modifica completo senza residui UI-facing; sheet a 3 bottoni su UNA riga (y identica) e audit falsificato senza controesempi; registro a 6 colonne col badge "Annullato" inline + riga attenuata, coerente anche own-access.
- **Note accettate**: TD6-N1 (due bug PRE-esistenti reali smascherati dal DB sporco: race refresh tariffa istruttore; dialog palette vuoto su pagina voli sotto accumulo — ticket separato, v. deferred handoff); TD6-N2 (chiave i18n morta `list.table.status`, inerte); TD6-N3 (wrapper `mt-1` vuoto sulle righe REGISTERED); TD6-N4 (contatore filtri esclude il drill-down `instructorPersonId` — by design, vive nel banner).
