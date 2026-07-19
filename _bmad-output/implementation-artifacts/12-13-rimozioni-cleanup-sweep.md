---
baseline_commit: 943a5b0
---

# Story 12.13: Rimozioni e cleanup sweep finale

Status: ready-for-dev

## Story

As a manutentore di AirManager,
I want rimuovere tutte le superfici legacy sostituite dall'epic 12 (scuola, pacchetti, proposte scadenze, pagine users/finance/detail residue, shell legacy) e chiudere i follow-up accumulati (registry OpenAPI, CLAUDE.md, seed, i18n orfani),
so that il codebase a fine epic contenga UNA sola UI (AirOps) e un contratto API pulito, senza codice morto né documentazione stale.

**Riferimenti vincolanti**: spec §6 (rimozioni, righe :72-82) + D4/D5/D9/D10 + §9 (:113 — NIENTE migrazioni distruttive: tabelle scuola/pacchetti dormienti); piano Task 13 (:306-320, delete list + endpoint audit + steps) + fate-map e2e (:324-342) + self-review :349 (package-consumption = l'unico punto oltre la UI); action item F5 (sprint-status, review 12.11).

## Ratifiche utente (2026-07-19, AskUserQuestion pre-dispatch — regola AI-2)

1. **Scuola: VIA TUTTO.** Con `dashboard/school` + `api/v1/school/*` muoiono ANCHE `api/v1/people/{id}/instructors/**` (assegnazione istruttore↔allievo), `api/v1/people/{id}/training-notes/**` (diario) e le funzioni summary in `exports.service.ts:32,460-482` (export riepiloghi ore): allievi e istruttori restano SOLO come ruoli + profili. Permessi `school.*` rimossi da rbac, entry registry relative rimosse. Tabelle DB dormienti (§9, nessuna migrazione).
2. **`search-combobox.tsx` si TIENE** — deviazione DICHIARATA dal piano :313/spec :80 (stale): è usato da 6 file di pagine NUOVE (billing×3, expiries, logbook×2) ed è già tematizzato AirOps (F6 12.11).
3. **`people/{id}` e `people/{id}/account` si TENGONO, RIPULITI** — aggiornamento post-12.12: la F1 della 12.12 li ha RICOLLEGATI dal PilotLanding ("La mia scheda" → detail, "Il mio conto" → account), oltre al link dalla pagina Piloti: NON sono orfani (la bozza pre-12.12 diceva il contrario). Ripulitura: via `packages-panel.tsx` (D10) e `assigned-instructors-panel.tsx` (ratifica 1) + ogni link a superfici morte; restano `data-table.tsx`/`export-button.tsx` come loro supporti (deviazione dichiarata dal piano :313) e quindi TanStack/Tailwind/Geist DORMIENTI ma presenti.
4. **Perdite D10/Task13 CONFERMATE**: (a) pacchetti ore VIA da UI e API, INCLUSO il ramo package-consumption dentro `registerFlight` coi suoi unit test (da ora i voli addebitano SEMPRE il conto direttamente; i pacchetti già consumati restano storico DB); (b) flusso proposte scadenze VIA (UI + API + permesso `expiries.propose.own`); (c) diario/assegnazioni/riepiloghi scuola VIA (ratifica 1). Nessuna migrazione distruttiva.
5. **`ppr/register`: HARD-DELETE** — via anche il redirect 308 dello shim 12.4: la vecchia route sparisce del tutto (404).

## Acceptance Criteria

1. **(Rimozioni UI+API)** Delete: `dashboard/school/**` + `api/v1/school/**` + `api/v1/people/{id}/instructors/**` + `api/v1/people/{id}/training-notes/**` + `school.service.ts(+test)` + `schemas/school.ts` + funzioni summary in `exports.service.ts` (ratifica 1 — allievi/istruttori restano SOLO ruoli+profili); `dashboard/users/**` (le API users restano SOLO per i flussi usati dalla nuova Piloti — invito/sospensione/riattivazione; rimuovere gli handler ora inutilizzati); `dashboard/finance/**` residue (categories/packages) — le API cash-* RESTANO; `api/v1/package-types/**` + `package-types.service(+test)` + `packages.service(+test)` + `api/v1/people/{id}/packages` + ramo package-consumption in `registerFlight` coi suoi unit test (ratifica 4a); `api/v1/expiry-proposals/**` + `expiries/{id}/proposals` + parti proposte di `expiries.service.ts` + `proposals-queue.tsx` + form "Proponi aggiornamento" in `my-expiries.tsx` + permesso `expiries.propose.own` (ratifica 4b); `ppr/register` HARD-DELETE incluso il redirect (ratifica 5 → 404). **`people/{id}` e `people/{id}/account` RESTANO** (ratifica 3 — linkati da Piloti E dal PilotLanding 12.12: "La mia scheda"/"Il mio conto" NON devono rompersi) ma RIPULITI: via `packages-panel.tsx`, `assigned-instructors-panel.tsx` e ogni link a superfici morte.
2. **(Shell)** Rimozione `LegacyBackdrop` + campo `airopsNative` dal route-registry (dopo la 12.12 tutte le entry sono native) + wrapper in `layout.tsx`; rimozione `nav-items.ts(+test)` (orfano dopo 12.12). Sidebar/topbar invariate.
3. **(F5 — registry OpenAPI, action item review 12.11)** Registrare in `src/lib/schemas/registry.ts` le 9 route mancanti (settings/{club,scheduling,smtp,smtp/test-email,metar-station,membership-fee}, `metar`, `expiry-alerts/trigger`, `people/{id}/membership-fee`) — pattern `registerPath` esistente (modello: `settings/ppr-landing-fee` :2019-2033); schemas già esistenti in settings.ts/metar.ts/membership.ts. AGGIUNGERE i path a `registry.test.ts` (arrayContaining) così il test li impone da qui in avanti. Il registry riflette ANCHE le rimozioni (proposte, school, packages).
4. **(Audit endpoint finale — spec §6 :82, CORRETTO dalla recon)** Ogni endpoint v1 senza consumer nella nuova UI viene rimosso, con verifica su OpenAPI generato. ATTENZIONE (piano stale): `accounts/negative-balances` NON si rimuove (consumer vivi in `billing/page.tsx` + `billing-console.tsx`); `cash-*`, `expiry-types`, `membership-fee`, users invito/sospensione RESTANO. Documentare l'esito dell'audit (lista endpoint rimossi/tenuti con consumer) nel Dev Agent Record.
5. **(rbac + i18n + seed)** Rimozione permessi orfani (`school.manage.own/any`, `school.notes.manage.any`, `expiries.propose.own` — ratifiche 1/4); pulizia namespace i18n orfani in it.json+en.json SPECULARI — ATTENZIONE post-ratifica 3: `PersonDetailPage`/`ExpiriesPanel` NON sono più interamente orfani (la detail resta viva, si tolgono solo le key dei pannelli rimossi `AssignedInstructorsPanel`/`HourPackagesPanel`); interi orfani restano SchoolPage, TrainingDiaryPage, FinancePage, CashCategoriesPage, PackagesPage; PARZIALI con cautela: PeoplePage/AircraftPage/FlightsPage/UsersPage sono condivisi con pagine vive/exports; seed: drop semina school/packages.
6. **(Docs)** CLAUDE.md aggiornato NELLO STESSO commit: riga stack (:11) riscritta — la UI primaria è il design system AirOps custom (D2); Tailwind/TanStack restano DORMIENTI a servizio di `people/{id}[.../account]`, `data-table`/`export-button` e `search-combobox` (ratifiche 2/3); riferimento `minimalist-ui` (:25, superato dal design AirOps); route map. L'hook `claude-md-drift.sh` non deve segnalare drift dopo l'update. Geist font: RESTA (`[locale]/layout.tsx` — pagine legacy vive per ratifica 3).
7. **(e2e)** Delete: `school.spec.ts`, `package-types.spec.ts`, `package-sale.spec.ts`, `package-consumption.spec.ts`; adattare/rimuovere sezioni proposte negli spec expiry-* e le sezioni feature-rimosse in exports/pdf-exports (verificare, forse già pulite); person-detail/people-management/person-profiles/typeahead-pickers/accounts-topups/account-statement → ADATTARE (la scheda e l'estratto conto RESTANO — ratifica 3 — ma perdono i pannelli pacchetti/istruttori-assegnati e le sezioni proposte); user-management.spec → adattare/rimuovere con la pagina users. La catena project di playwright.config (chromium→settings→booking-window) RESTA. NIENTE nuovi spec salvo un assert che `ppr/register` risponde 404 (ratifica 5).
8. **(Gates)** NESSUNA migrazione DB (tabelle dormienti, §9 :113). `npm run gates` verde; **full `CI=1 npx playwright test` su build prod, DB fresco, VERDE** (Step 4 del piano — questa story tocca tutto, il full run lo fa ANCHE il dev prima del commit finale, non solo la review); verifica interattiva che le pagine vive non abbiano regressioni (pilots→estratto conto, billing, expiries own-face senza "Proponi").

## Contesto e decisioni di design (vincolanti — ricognizione 2026-07-18)

- **Delete list piano** (:308-313) verbatim in recon; STALE su 3 punti (ratifiche 2/3 + negative-balances in AC4).
- **Scuola, dipendenze cross**: `school.service.ts` espone anche assignInstructor/listStudentInstructors/unassignInstructor (:136,159,200 → route `people/{id}/instructors/**`) e training-notes (:482,512,558 → route `people/{id}/training-notes/**`); summaries importate da `exports.service.ts:32,460-482`. `instructor-compensation.service.ts` (12.7) NON dipende da school (commento :17-19, groupBy re-implementato apposta) — i compensi non bloccano la rimozione.
- **Proposte scadenze**: UI `proposals-queue.tsx` + form in `my-expiries.tsx:54,202` (montati da `expiries/page.tsx:18-19,223-229,284`); service `expiries.service.ts` :44,540,585-668,687,727; route `expiry-proposals/**`, `expiries/{id}/proposals`; registry :56-65,333-336,1695-1725.
- **Shell**: `route-registry.ts:62` (`airopsNative`), `:72` entry overview (la 12.12 la flippa a true); `legacy-backdrop.tsx`; consumer registry: layout/sidebar/top-bar/legacy-backdrop/nav-items.test. `nav-items.ts`: unico consumer è la home HEAD che la 12.12 riscrive.
- **i18n**: inventario orfani/parziali con righe in recon (§6) — it.json e en.json sono speculari, pulire ENTRAMBI.
- **F5 meccanica**: ~15 registerPath + register degli schema + estensione `registry.test.ts:14-92`; tabella route→metodi→schema nella recon (§4).
- **Verifiche post-12.12 (FATTE al close-out 12.12)**: la nuova home NON usa più nav-items/packages/school, `overview` è `airopsNative:true`, `nav-items.ts(+test)` è orfano confermato. NOVITÀ 12.12 rilevante: il PilotLanding linka `people/{id}` ("La mia scheda") e `people/{id}/account` ("Il mio conto") — 3 e2e (`account-statement`, `accounts-topups`, `person-detail`) esercitano quei percorsi dal landing: NON romperli (ratifica 3).
- **Ambiente locale**: identico alle story precedenti (DB fresco al dispatch, port 3000, `--retries=2`, MAI `playwright install`, gates SOLO `npm run gates`, catena project playwright con `--no-deps` per run singoli).
- **Commit**: `feat(12.13): remove superseded pages/APIs, cleanup, CLAUDE.md` (piano :320). Staging esplicito, niente push. A story chiusa: `/handoff`, push (utente), PR unica, STOP (fine epic).

## Fuori scope dichiarato

- Migrazioni distruttive (tabelle scuola/pacchetti restano dormienti — §9 :113).
- Rimozione di `search-combobox`/`data-table`/`export-button` e delle dipendenze TanStack/Tailwind/Geist (ratifiche 2/3: restano a servizio delle pagine vive).
- Qualunque feature nuova; restyling delle pagine vive.
- Rimozione delle env SMTP legacy (restano come fallback del mailer settings-first, 12.11).
- Nota PO 12.7 (floor sul dovuto negativo dei compensi) — resta follow-up separato post-epic.

## Dev Agent Record

### Completion Notes

_(a cura del dev agent)_

### File List

_(a cura del dev agent)_

### Change Log

_(a cura del dev agent)_

## Review Record

_(a cura della review adversarial)_
