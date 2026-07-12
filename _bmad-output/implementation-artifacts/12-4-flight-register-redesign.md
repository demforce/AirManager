---
baseline_commit: eb7d4fc
---

# Story 12.4: Registro voli ripensato — la story chiave di volta

Status: ready-for-dev

## Story

As a gestore o pilota,
I want un registro voli che si legga come un logbook professionale,
so that la pagina più usata (e oggi più "sito web") diventi la prova che il refactor funziona (FR-50, FR-51 per le regole applicate qui; epics.md «Epic 12», intent doc cantiere D — story chiave di volta).

## Acceptance Criteria

1. **Given** il registro voli, **When** lo apro, **Then** la tabella vive in una `Card` paper con `CardHeader` nested (titolo + toolbar filtri compatta + menu export) e `CardFooter` (load-more + conteggio) — mai nuda sul canvas; righe compatte ad ALTEZZA FISSA (spec compact DESIGN.md) con le SOLE colonne: **tratta** (partenza→arrivo), **velivolo**, **durata**, **costo**, **PIC**, più l'indicatore di stato SOLO sui voli non-REGISTERED (badge "Annullato"/lineage — un registro contabile deve mostrare gli storni: deviazione dichiarata dalla riga minima, `flight-status-badge` resta sui voli annullati) e la colonna azioni esistente (Dettaglio/Correggi/Annulla, INVARIATA da 12.3). Escono dalla riga (restano nello sheet 12.3): orari, istruttore, tipo, decolli/atterraggi, data (v. AC 2/3).
2. **Given** il registro SENZA filtri attivi (contesto "registro puro"), **Then** i voli sono raggruppati per GIORNO con header di giornata (data DD/MM/YYYY scritta UNA volta, `data-testid="flight-day-header"`, MAI `flight-row`) che resta sticky durante lo scroll del pannello; il raggruppamento usa `flight.flightDate` così com'è (è GIÀ il giorno Europe/Rome, derivato server-side in 11.1 — NESSUNA conversione client); niente colonna data in riga.
3. **Given** un contesto FLAT cross-giorno (QUALSIASI filtro attivo: date, velivolo, persona, tipo, stato, `instructorPersonId` — regola vincolante `hasActiveFilter`), **Then** il raggruppamento per giorno NON si applica e la colonna **data** È presente in riga (DD/MM/YYYY) — stessa tabella, due modalità.
4. **Given** più voli di quelli caricati, **Then** la paginazione numerata SPARISCE (link `←`/`→` e `flight-pagination-status` rimossi): nel footer un bottone load-more `data-testid="flight-load-more"` ("Carica giorni precedenti" nel registro raggruppato, "Carica altri voli" nel contesto flat) accumula le pagine successive via fetch client su `GET /api/v1/flights?page=N` (endpoint ESISTENTE, nessun param nuovo); il bottone sparisce quando `items.length === total`; il footer mostra "N di M voli". Un giorno spezzato dal confine di pagina si completa al load successivo (accettato e dichiarato); il cambio filtri resetta l'accumulo (remount via `key` esistente, che PERDE `page`); il param URL `?page` non è più emesso dalla UI (il server rende sempre pagina 1; `?page` legacy in URL viene ignorato).
5. **Given** il costo in riga, **Then** il gating ratificato è soddisfatto STRUTTURALMENTE (nessun cambio a service/DTO): staff/admin vedono tutte le righe (tutti i costi); pilota/allievo vedono SOLO le proprie righe (quindi solo i propri costi) — own-access già forzato in `listFlights`. Vietato "sistemare" il service: registrare questa analisi nel Dev Agent Record.
6. **Given** i filtri, **Then** la FilterBar esistente diventa la toolbar compatta del `CardHeader` (controlli e testid `flight-filter-*` INVARIATI); i due bottoni export Excel/PDF sono raccolti in UN menu overflow (nuovo componente riusabile zero-dep, es. `<details>`/popover nativo, keyboard-accessibile) — i testid `flights-export-button`/`flights-export-pdf-button` restano sulle voci del menu.
7. **Given** la suite di test, **Then** `npm run gates` passa e gli e2e restano verdi con gli aggiornamenti della lista CHIUSA (v. Contesto — pager→load-more, asserzioni data/movimenti spostate su header/sheet/contesto-flat); NUOVI scenari e2e: raggruppamento per giorno (2 voli stesso giorno → 1 header; giorni diversi → header multipli, niente colonna data), load-more che accumula (count righe cresce, bottone sparisce a fine lista), contesto flat con filtro → colonna data presente e niente header, menu export (apri → click voce → download).
8. **Given** la verifica visiva (Playwright MCP), **Then** screenshot di: registro raggruppato con 2+ giorni e header sticky in scroll, contesto flat filtrato, menu export aperto, vista pilota own-access; righe ad altezza uniforme, testi lunghi con max-width + ellipsis + `title` tooltip (tratta e PIC — regola FR-51 applicata qui).

## Contesto e decisioni di design (vincolanti)

- **Recon 2026-07-12 (fatti verificati, righe post-12.3)**: tabella inline 13 colonne (`flights-manager.tsx:646-749`, header :649-663) SENZA Card; pager inline in `flights/page.tsx:415-441` (`flight-pagination-status`, link `←`/`→`, `pageHref` :212-214); `FLIGHTS_PAGE_SIZE=20` (:39); fetch SOLO server-side con remount client via `key={JSON.stringify({page,...filterQuery})}` (:260); il client non fa mai fetch lista (solo patch ottimistiche post-mutazione, `flights-manager.tsx:357/:406-436`); FilterBar già toolbar sobria (`:839-967`, testid `flight-filter-*`); export pair `:606-640` con href da filtri live; ordinamento server `flightDate desc, createdAt desc, id desc` (`flights.service.ts:1340`); `flightDate` è GIÀ stringa `YYYY-MM-DD` del giorno Roma (`:483` `dateOnlyInZone`, `:325` `toDateOnlyString`); `breakdown` arriva SEMPRE nel DTO ma own-access vede solo righe proprie (gating strutturale, unico campo gated è `actorEmail`); PIC via `flightPicPerson` (`:667/:702-704`); NESSUN pattern load-more nell'app (primo del progetto); contesti flat esistenti = drill-down school/home con `instructorPersonId` (banner `flight-instructor-filter-banner`, param NON nella FilterBar).
- **Load-more (decisione)**: primo render server INVARIATO (pagina 1, 20 righe, `initialFlights` + `total`); il client accumula pagine successive con fetch su `GET /api/v1/flights` (query = filtri correnti + `page` incrementale + `pageSize=20`), append a `flights` state; le patch ottimistiche esistenti (register prepend, cancel/correct replace) continuano a operare sullo stato accumulato. `key` del remount: TOGLIERE `page` (non più emesso), TENERE i filtri — il cambio filtri resetta l'accumulo per costruzione. Il clamp `?page` fuori range in `page.tsx:173-177` si semplifica (sempre pagina 1). Errore di fetch load-more → messaggio inline `role="alert"` + bottone riprova (pattern feedback esistente).
- **Due contesti (regola meccanica)**: `hasActiveFilter = dateFrom||dateTo||aircraftId||personId||flightType||status||instructorPersonId`. False → grouped (header giornata, no colonna data); true → flat (colonna data, no header). Il banner instructor esistente resta.
- **Header di giornata**: riga dedicata dentro la stessa `<table>` (es. `<tr>` con `<th colSpan scope="colgroup">` — a11y bonus per il deferred 112-N1) con `formatDateOnly(flightDate, locale)`; sticky rispetto allo scroll del pannello shell (position sticky sulla riga/celle con top coordinato con l'header colonne; se il compromesso tecnico dentro `overflow-x-auto` lo impedisce, la degradazione a NON-sticky va dichiarata come deviazione, non silenziata). MAI testid `flight-row` sull'header.
- **Riga compatta**: altezza fissa (py compatto uniforme, un'unica riga di testo per cella); tratta e PIC con `max-w-* truncate` + `title` (tooltip nativo basta — FR-51); durata `formatMinutes`; la nota pacchetto in durata (`:690-697`) si sposta nello sheet (la riga resta a 1 riga di testo). L'eventuale suffisso solista (`:686-689`) esce con la colonna tipo (è nello sheet).
- **e2e — lista CHIUSA degli aggiornamenti attesi** (dal recon §8):
  - `flight-log.spec.ts:351-375` (pager): riscrivere su load-more — 20 righe iniziali, click `flight-load-more`, righe 21, bottone sparisce; niente più `flight-pagination-status`/`→`/`←`/`?page=2`.
  - `flights.spec.ts:478-552`: l'asserzione data `01/01/2020` si sposta sul `flight-day-header` (o sulla riga DOPO aver attivato un filtro → contesto flat); `'2 / 3'` (movimenti) e orari attesi si asseriscono nello SHEET (aprendo `flight-detail-action`); PIC resta in riga.
  - `flight-reversal.spec.ts:308/:322-327`: i `filter({hasText:'02/01/2020'})` sulla riga vanno sostituiti (filtro per marche/registration, o contesto flat via filtro data che rimette la data in riga — scegliere la via più stabile e dichiararla).
  - `exports.spec.ts:253-267`: aprire il menu overflow prima del click su `flights-export-button`.
  - Verifica trasversale: `getByTestId('flight-row')` + `toHaveCount` restano validi (gli header giornata NON sono flight-row).
- **Fuori scope (dichiarato)**: menu export sulle ALTRE viste (12.5 estende il pattern); date picker custom (12.5); sticky header colonne generalizzato alle altre tabelle; jump-to-date (⌘K, COULD 12.6); cambi a service/DTO/API (nessuno necessario — AC 5); redesign filtri oltre il riposizionamento in CardHeader; virtualizzazione/infinite scroll (esplicitamente scartati dalla ratifica).
- **NFR**: il fetch load-more riusa l'endpoint paginato esistente (NFR-6 invariato); nessuna superficie dati nuova (NFR-10 invariato).

## Tasks / Subtasks

- [ ] **T1 (AC 1, 6)** — Card paper con CardHeader (titolo + FilterBar riposizionata + menu export overflow, nuovo componente riusabile zero-dep keyboard-accessibile) e CardFooter (load-more + "N di M voli"); pager inline rimosso da `page.tsx`.
- [ ] **T2 (AC 1, 2, 3)** — Riga compatta (colonne ratificate + status badge condizionale + azioni), due contesti con regola `hasActiveFilter`, header di giornata sticky, ellipsis+tooltip su tratta/PIC.
- [ ] **T3 (AC 4)** — Load-more client con accumulo (fetch su API esistente, errore con retry, reset su cambio filtri via `key` senza `page`), footer contatore; `?page` legacy ignorato.
- [ ] **T4 (AC 7)** — Aggiornamento e2e lista chiusa + 4 nuovi scenari; `npm run gates`; e2e mirati: `flights`, `flight-log`, `flight-reversal`, `exports`, `package-consumption` + nuovi.
- [ ] **T5 (AC 5, 8)** — Registrare l'analisi del gating strutturale nel Dev Agent Record; verifica visiva MCP (4 screenshot AC 8, sticky verificato in scroll reale); Dev Agent Record + File List; sprint-status `12-4` → `review`.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; story UI: OBBLIGATORIE `impeccable`, `design-taste-frontend`, `ui-ux-pro-max`; contratto `DESIGN.md` (nested card header/footer con radius asimmetrici — il componente `CardHeader`/`CardFooter` di 12.1 esiste già; row height fissa da densità compact).
- QUESTA è la story chiave di volta dell'epic: l'intent doc la definisce "se il refactor vince qui, vince ovunque". Il giudizio estetico conta quanto i test: la verifica MCP va fatta con dati realistici multi-giorno (registrane un po' via API se il seed non basta — pattern `registerFlight` di exports.spec).
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`); gates SOLO `npm run gates`; MAI `playwright install`. NON stashare mai il lavoro: se bloccato, committa con gates verdi e dichiara.
- Baseline: `eb7d4fc` (12.3 done), 30 migrazioni, 208 e2e / 1242 unit su DB fresco. Flake noti: `cash-report` ECONNRESET; `bookings.spec.ts:605` isolamento su DB sporco (deferred, non imputare); dopo MOLTI re-run sospetta accumulo dati e prova in isolamento.
- Lezioni 12.1–12.3: verifica LIVE ciò che dichiari (skeleton invisibile); sweep con grep finale (`flight-pagination-status`, `pageHref` non devono sopravvivere); i `filter({hasText})` su date sono la classe di rottura nota (lezione 11.2) — negli e2e nuovi usare testid/regex ancorate.

### Project Structure Notes

- Nuovi file attesi: componente menu overflow riusabile (es. `src/components/action-menu.tsx` o `ui/menu.tsx`), eventuale `flight-day-*` helper/subcomponente dentro `flights/`. Modifiche: `flights-manager.tsx` (tabella, load-more, contesti), `flights/page.tsx` (pager via, key senza page), `messages/{it,en}.json` (chiavi load-more/contatore/menu export), e2e lista chiusa. NESSUNA migrazione, env var, API o dipendenza nuova.

### References

- [Source: _bmad-output/planning-artifacts/epics.md «Story 12.4»; intent doc cantiere D + ratifica load-more per giorni 2026-07-12 (header sticky nel testo dell'opzione ratificata); riga definitiva ratificata (data solo flat / tratta / velivolo / durata / costo / PIC); orrori→regole 3-6 (header giornata, row height, card paper, load-more, menu export)]
- [Source: recon Explore 12.4 in sessione — flights/page.tsx :15-24/:39/:171-189/:212-214/:252-260/:415-441; flights-manager.tsx :98-105/:357/:382-436/:606-640/:646-749/:839-967; flights.service.ts :325/:483/:1289-1340; schemas/flights.ts :35-49/:166-167; flight-pic.ts :4-28; export-button.tsx :23-35; NESSUN pattern load-more esistente; contesti flat = school/page.tsx:36-38 e dashboard/page.tsx:235 via instructorPersonId]
- [Source: e2e — flight-log.spec.ts :351-375 (pager), :235-334 (filtri/conteggi); flights.spec.ts :478-552 (colonne logbook); flight-reversal.spec.ts :238-249/:280/:308/:322-327; exports.spec.ts :253-267]
- [Source: story file 12-3 (sheet dettaglio con orari/movimenti/tipo — destinazione delle info che escono dalla riga), 12-1/12-2 Review Record (lezioni)]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
