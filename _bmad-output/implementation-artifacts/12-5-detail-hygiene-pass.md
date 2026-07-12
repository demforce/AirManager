---
baseline_commit: 3285505
---

# Story 12.5: Igiene dei dettagli su tutte le superfici

Status: ready-for-dev

## Story

As a utente,
I want che ogni sezione dell'app riceva le stesse regole di qualità dei dettagli,
so that nessuna schermata tradisca il nuovo sistema (FR-51; epics.md «Epic 12», intent doc cantiere E — "orrori→regole" 1, 2, 4, 7).

## Acceptance Criteria

1. **Given** i primitivi data, **Then** esistono in `src/components/ui/`: `DatePicker` (input testuale DD/MM/YYYY + calendario popover custom, zero dipendenze — pattern overlay di `Menu`, chiusura Esc/click-fuori, navigazione tastiera mese/giorno) e la variante datetime (DatePicker + input ora testuale che RIUSA `parseTimeShorthand` — stesso pattern del dialog volo). API: value ISO (`YYYY-MM-DD` / composizione datetime) in/out — la conversione DD/MM/YYYY↔ISO vive SOLO nel componente; digitare `12/07/2026` a mano DEVE funzionare (keyboard-first, il popover è un aiuto non un obbligo); input invalido → errore per-campo con `aria-invalid`.
2. **Given** i 33 input nativi del censimento CHIUSO (v. Contesto: 13 date-form RHF + 12 date-filtro plain + 6 `datetime-local`), **Then** TUTTI usano i nuovi primitivi; il valore sul WIRE resta BYTE-IDENTICO a oggi (ISO verbatim per gli `z.iso.date()`; per i 6 datetime-local verificare e replicare ESATTAMENTE la stringa attualmente inviata PRIMA di toccare — stessa disciplina di `composeFlightTimes` in 12.3); nessun cambio a schemi Zod/API.
3. **Given** le tabelle elenco, **Then** TUTTE vivono in Card paper: le 4 "faux card" (bookings-list :229, ppr-queue :191, ppr-register :257, expiry-dashboard :266) diventano `Card` vere; le 7 tabelle NUDE del censimento (my-expiries :80, proposals-queue :98, expiries-panel :200, assigned-instructors-panel :149, instructor-rates-panel :292, aircraft-manager :1099/:1324, school own-students :279) ricevono il contenitore Card; `data-table.tsx` guadagna row height fissa (una riga di testo, py compatto uniforme) ed ellipsis: le celle testo-libero (nomi, email, descrizioni, note — censimento §6) ottengono `max-w-* truncate` + `title`.
4. **Given** i ~9 pager server-side duplicati (people, aircraft, bookings, account-statement, ppr-queue, ppr-register, expiry-dashboard+proposte, finance, school/[id]), **Then** un componente `Pager` condiviso li assorbe: markup unico restylato sui token (leggibile, non "1/3 microscopico"), STESSO comportamento server-side `?page=` e STESSI `data-testid`/status esistenti (`booking-pagination-status`, `ppr-*-pagination*`, `expiry-dashboard-pagination-status` — INVARIATI); il load-more resta esclusivo di registro voli e storico contaore.
5. **Given** le 2 coppie export residue (account-statement :172-173, expiries :241-242), **Then** collassano nel `Menu` overflow col pattern ESATTO del registro voli (`ExportButton variant="menuItem"`, testid degli item INVARIATI); gli export singoli restano bottoni singoli.
6. **Given** i dettagli residui, **Then**: le 6 occorrenze warm residue (`#F0EEE6`/`#5F5B53` ×4, `#FAFAF8` ppr-queue :317, `#F2F1EC` booking-calendar :220) migrano ai token (censimento CHIUSO §8); gli input orario del dialog volo ricevono `aria-invalid` anche quando `formError === FLIGHT_TIMES_INVALID` (123-N1 — righe :1861/:1877, errore legato ai due campi, banner invariato).
7. **Given** la suite di test, **Then** `npm run gates` passa e gli e2e restano verdi: i ~50 `fill` su input data (censimento §2, 14 spec) convertiti a DD/MM/YYYY minimizzando il churn sui 3 helper (`PAST_DATE`, `addDaysUtc`, `futureDatetimeLocal`/`FUTURE_DAY`) e sui literal inline; i 6 datetime → coppia data+ora (fill separati); NUOVI e2e: DatePicker digitato a mano (data valida → submit ok; `31/02/2026` → errore campo), selezione da popover, coppia data+ora nel form prenotazione.
8. **Given** la verifica visiva (Playwright MCP), **Then** screenshot di: DatePicker aperto in un form e in un filtro, una tabella ex-nuda in Card con ellipsis su un testo lungo (creato ad hoc), il Pager restylato, il menu export su scadenze. Le sezioni non citate ricevono SOLO l'applicazione del sistema — nessun redesign per-pagina (WON'T ratificato).

## Contesto e decisioni di design (vincolanti)

- **Recon 2026-07-12 su HEAD `3285505`** — censimenti CHIUSI (path:linea nel recon, riportati qui in sintesi):
  - §1 input nativi (33 su 15 file): RHF date-form = flights-manager :1726, training-notes-journal :189/:340, instructor-rates-panel :246, aircraft-manager :1287, expiries-panel :463/:470/:576/:584, person-create-dialog :243, profiles-panel :437, packages-panel :359, account-panel :343, cash-register :511. Filtri plain = flights-manager :1095/:1106, cash-register :280/:291, ppr-register :213/:224, summary-filters :78/:89, report-filters :72/:83, my-expiries :241/:254. Datetime-local = new-booking-form :462/:477, bookings-list :489/:504, ppr-form :383/:398. ZERO `type="time"` residui (12.3 li ha già convertiti).
  - §2 e2e: ~50 fill ISO su 14 spec; leve = `PAST_DATE` (def. in ~9 spec), `addDaysUtc` (4 spec), `FUTURE_DAY`+`futureDatetimeLocal`; NESSUN `toHaveValue` sull'input (asserzioni tutte downstream) → il churn è solo sui fill.
  - §3 tabelle: 7 già in Card via `data-table.tsx` (che wrappa in `Card overflow-x-auto p-0`, celle `px-5 py-3` NON fisse, zero truncate) + 5 esplicite; 4 faux-card; 7 nude (liste sopra).
  - §4 pager: markup `<nav>` inline ripetuto quasi identico; testid presenti solo su bookings/ppr/expiries.
  - §5 pattern Menu del registro: `flights-manager.tsx:719-757`, `ExportButton` ha GIÀ `variant='menuItem'` (`export-button.tsx:37`).
  - §9 NESSUN date-picker riusabile esistente (booking-calendar è un server component di visualizzazione, non un picker).
- **DatePicker (decisione)**: client component zero-dep; anatomia = input testuale (display DD/MM/YYYY, parsing tollerante `1/7/2026`→`01/07/2026`, validazione calendario reale — `31/02` invalido) + bottone/trigger calendario popover (griglia mese, frecce mese/anno, giorno selezionabile da tastiera). Doppia integrazione: RHF (il componente riceve value ISO e chiama un onChange ISO — adattatore con `setValue`/`register` come già fatto per i pickers plain del form volo) e stato plain per i filtri. Il popover NON è un portal (pattern Menu/SearchCombobox — funziona anche dentro Dialog, lezione 12.3). Label/`htmlFor` invariati per gli e2e `getByLabel`.
- **Variante datetime**: coppia DatePicker + input ora shorthand (riuso `parseTimeShorthand`); i label esistenti (`Inizio`, `Fine`, `ETA`, `ETD`) restano sul campo DATA e il campo ora ha label derivato (es. "Ora inizio") — scelta da tenere coerente in it/en e negli e2e. WIRE: comporre la STESSA stringa oggi prodotta dal `datetime-local` (verificare con git diff/network PRIMA: probabile `YYYY-MM-DDTHH:MM`) — vietato cambiare gli schemi.
- **Row height/ellipsis in `data-table.tsx`**: intervento nel componente (copre 7 liste in un colpo) + sweep sulle tabelle inline del censimento; il pattern ellipsis è quello del registro 12.4 (`max-w-* truncate` + `title`).
- **Pager condiviso**: componente presentazionale (riceve page/totalPages/hrefBuilder/testids) — NESSUN cambio di semantica URL; le pagine senza testid non ne guadagnano di nuovi (evitare churn e2e inutile).
- **PPR form pubblico**: usa la variante datetime anche lì (è la superficie col worst horror originale) mantenendo il tono `design-taste-frontend` del form pubblico; e2e `ppr-public.spec.ts:139` si adegua.
- **e2e — riscritture attese (lista CHIUSA dal recon §2)**: flights :444; flight-reversal :201/:212/:213-214(no, orari già text)/:301; aircraft-rates :132/:144/:172/:185; instructor-rates :140/:148/:173/:181; person-profiles :82; expiry-registration :143-144 (helper); school :411/:506; package-consumption :170/:181/:224/:256/:264; cash-register :114-116; flight-log :328-330; cash-report :101; ppr-register :336; bookings ~20 fill datetime (:293-1060, elenco nel recon); ppr-public :139. Convertire helper prima, literal poi; grep finale `fill\('20[0-9][0-9]-` su e2e/ deve tornare SOLO occorrenze legittime non-date-input (dichiararle).
- **Fuori scope (dichiarato)**: consolidamento Badge/StatusPill e adozione Badge sui kicker (deferred 12.1, resta deferred); tracking heading per-taglia (121-N2 — passaggio FABLE di fine epic); ⌘K e jump-to-date (12.6); load-more su altre liste; redesign di qualunque pagina; cambi a schemi/API/permessi; email/PDF.
- **NFR-8**: il DatePicker è la superficie a11y più delicata della story — ruoli/aria del pattern combobox+grid o dialog, focus management; verificare da tastiera SOLO (senza mouse) almeno un flusso completo.

## Tasks / Subtasks

- [ ] **T1 (AC 1)** — `DatePicker` + variante datetime in `src/components/ui/` (+ unit test della logica pura estraibile: parsing/format/validazione DD/MM/YYYY↔ISO, composizione datetime).
- [ ] **T2 (AC 2, 7)** — Adozione sui 13 date-form RHF + 12 filtri plain (wire invariato); conversione fill e2e correlati (helper prima).
- [ ] **T3 (AC 2, 7)** — I 6 `datetime-local` → coppia data+ora (wire verificato PRIMA e replicato); e2e bookings/ppr-public convertiti; nuovi e2e picker (3 scenari AC 7).
- [ ] **T4 (AC 3)** — Card ovunque (4 faux + 7 nude), row height fissa + ellipsis in `data-table.tsx` e sweep tabelle inline.
- [ ] **T5 (AC 4, 5, 6)** — `Pager` condiviso sui ~9 nav; 2 coppie export → Menu; neutri warm → token; 123-N1 aria-invalid.
- [ ] **T6 (AC 7, 8)** — `npm run gates`; e2e mirati: bookings, ppr-public, ppr-register, expiry-registration, expiry-dashboard, cash-register, cash-report, aircraft-rates, instructor-rates, person-profiles, school, flights, flight-log, flight-reversal, package-consumption, exports + nuovi; verifica visiva MCP (4 screenshot AC 8) + walk-through keyboard-only del DatePicker; Dev Agent Record + File List; sprint-status `12-5` → `review`.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; story UI: OBBLIGATORIE `impeccable`, `design-taste-frontend` (per il form PPR pubblico), `ui-ux-pro-max` (query utile: "date picker accessibility"); contratto `DESIGN.md`.
- QUESTA è la story più LARGA dell'epic (~35 file, 14 spec): procedere nell'ordine dei task (T1→T6) e committare SOLO a lavoro completo con gates verdi. Se il contesto si esaurisce: NIENTE stash (lezione 12.2) — committa lo stato con gates verdi e dichiara ESATTAMENTE cosa manca in notesForReview.
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`); gates SOLO `npm run gates`; MAI `playwright install`.
- Baseline: `3285505` (12.4 done), 30 migrazioni, ~211 e2e / 1260 unit su DB fresco. Flake noti: cash-report/school ECONNRESET; bookings:605 isolamento su DB sporco (deferred); dopo molti re-run prova in isolamento.
- Lezioni 12.1–12.4: verifica LIVE ciò che dichiari; grep finale di sweep; `filter({hasText})` su date = classe di rottura; gli screenshot del reviewer NON si committano (root `.png` ora in .gitignore).

### Project Structure Notes

- Nuovi file attesi: `src/components/ui/date-picker.tsx` (+ eventuale `date-time-field.tsx`), `src/components/pager.tsx`, `src/lib/date-input.ts` (+test, parsing/format puri). Modifiche diffuse: i 15 file del censimento input, le ~11 tabelle, i ~9 pager, 2 pagine export, `data-table.tsx`, `messages/{it,en}.json`, ~14 spec e2e. NESSUNA migrazione, env var, API o dipendenza nuova.

### References

- [Source: _bmad-output/planning-artifacts/epics.md «Story 12.5»; intent doc cantiere E, orrori→regole 1 (date picker DD/MM/YYYY), 2 (ellipsis), 4 (row height), 5 (card paper), 7 (menu overflow)]
- [Source: recon Explore 12.5 in sessione su HEAD 3285505 — censimenti §1 (33 input), §2 (~50 fill e2e + helper), §3 (tabelle per stato), §4 (pager), §5 (coppie export + pattern Menu), §6 (celle senza ellipsis), §7 (123-N1 righe :1525-1535/:1861/:1877/:1951), §8 (6 warm), §9 (nessun picker riusabile), §10 (stima churn)]
- [Source: story file 12-3 (parseTimeShorthand, pattern overlay senza portal, disciplina wire), 12-4 (pattern Menu/ExportButton menuItem, ellipsis registro), Review Record 12.1-12.4 (lezioni)]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
