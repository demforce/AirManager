---
baseline_commit: ff82d5d
---

# TD-6: Rifiniture UI post-Epic 12 (change request utente 2026-07-12)

Status: ready-for-dev

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

- [ ] **T1 (AC 1)** — Componente disclosure "Filtri" + contatore; adozione sulle 4 barre (cash guadagna anche flag attivo/reset col pattern flights); i18n nuove chiavi.
- [ ] **T2 (AC 2, 3)** — `icons.tsx` + `Button size="icon"`; conversione delle azioni riga (lista chiusa) con aria-label/title = label attuale; rinomina Correggi→Modifica (i18n it/en + e2e heading).
- [ ] **T3 (AC 4, 5)** — Sheet: 3 bottoni allineati + audit contenitori; rimozione colonna Stato con badge inline nella tratta + riga attenuata (colSpan aggiornato).
- [ ] **T4 (AC 6)** — Aggiornamento e2e lista chiusa + 2 scenari nuovi; `npm run gates`; e2e mirati: flight-log, flights, flight-reversal, cash-register, ppr-register, expiry-dashboard, people-management, person-profiles, aircraft-management, package-types, expiry-types, user-management, bookings, exports.
- [ ] **T5 (AC 7)** — Verifica visiva MCP (4 screenshot) con giudizio DESIGN.md; Dev Agent Record + File List; sprint-status `td-6` → `review`.

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

### Debug Log References

### Completion Notes List

### File List
