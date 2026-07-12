---
baseline_commit: 3285505
---

# Story 12.5: Igiene dei dettagli su tutte le superfici

Status: done

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

- [x] **T1 (AC 1)** — `DatePicker` + variante datetime in `src/components/ui/` (+ unit test della logica pura estraibile: parsing/format/validazione DD/MM/YYYY↔ISO, composizione datetime).
- [x] **T2 (AC 2, 7)** — Adozione sui 13 date-form RHF + 12 filtri plain (wire invariato); conversione fill e2e correlati (helper prima).
- [x] **T3 (AC 2, 7)** — I 6 `datetime-local` → coppia data+ora (wire verificato PRIMA e replicato); e2e bookings/ppr-public convertiti; nuovi e2e picker (3 scenari AC 7).
- [x] **T4 (AC 3)** — Card ovunque (4 faux + 7 nude), row height fissa + ellipsis in `data-table.tsx` e sweep tabelle inline.
- [x] **T5 (AC 4, 5, 6)** — `Pager` condiviso sui ~9 nav; 2 coppie export → Menu; neutri warm → token; 123-N1 aria-invalid.
- [x] **T6 (AC 7, 8)** — `npm run gates`; e2e mirati: bookings, ppr-public, ppr-register, expiry-registration, expiry-dashboard, cash-register, cash-report, aircraft-rates, instructor-rates, person-profiles, school, flights, flight-log, flight-reversal, package-consumption, exports + nuovi; verifica visiva MCP (4 screenshot AC 8) + walk-through keyboard-only del DatePicker; Dev Agent Record + File List; sprint-status `12-5` → `review`.

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

Claude Sonnet 5 (dev subagent, xhigh), via `bmad-dev-story`.

### Debug Log References

- `npm run gates` (final, post-e2e-sweep): PASS lint (16s), PASS typecheck (3s), PASS test (7s, 1278/1278), PASS build (29s).
- Targeted e2e (T6 list, run per-file/small-group — the reliable signal on this long-lived, never-reset dev DB; see notesForReview for the mega-batch caveat): date-picker.spec.ts (3/3), bookings.spec.ts, ppr-public.spec.ts (5/5), ppr-register.spec.ts (9/9), expiry-registration.spec.ts (2/2), expiry-dashboard.spec.ts (4/4), cash-register.spec.ts (5/5), cash-report.spec.ts (3/3), aircraft-rates.spec.ts (2 fail — pre-existing DB-volume pagination, see notes), instructor-rates.spec.ts (4/4), person-profiles.spec.ts (5/5), school.spec.ts (18/18), flights.spec.ts (13/13), flight-log.spec.ts (7/7), flight-reversal.spec.ts (3/3), package-consumption.spec.ts (1/1), exports.spec.ts (8/8), pdf-exports.spec.ts (8/8) — all green except the 2 documented aircraft-rates failures.
- Playwright MCP live verification: DatePicker popover open in a form (bookings "Nuova prenotazione") and in a filter (finance "Dal"/"Al"), an ex-nude table in Card with ellipsis (expiries/types — also shows the Badge migration), the restyled Pager (aircraft list, "1 / 11"), the export Menu on scadenze ("Esporta" -> "Esporta Excel"/"Esporta PDF"); keyboard-only walkthrough (Tab to field, Tab to "Apri calendario", Enter to open, ArrowRight/ArrowDown to move the roving-tabindex focus day-by-day/week-by-week, Enter to commit and close) verified live against the flight-log "Dal" filter — confirmed the grid's roving tabindex, the commit-on-Enter, and the popover closing back to the field (NFR-8).
- Live-diagnosed and fixed a DatePicker popover CSS-clipping regression: a nude/faux-card table wrapped in `overflow-x-auto` implicitly computes `overflow-y: auto` (CSS spec), clipping an `absolute`-positioned popover that extends past the ancestor's flow height — reproduced live inside `ExpiryRow`'s inline edit form, fixed by switching `DatePicker`'s popover to `position: fixed` with coordinates measured via `getBoundingClientRect()` at open time, plus close-on-scroll/resize (fixed positioning doesn't auto-track scroll); re-verified live (before/after screenshots, not committed).

### Completion Notes List

- All 8 ACs implemented: `DatePicker`/`DateTimeField` primitives (`src/components/ui/date-picker.tsx`, `date-time-field.tsx`, pure logic in `src/lib/date-input.ts` + 18 unit tests) adopted on all 33 recon-listed inputs (13 RHF date-form, 12 plain filters, 6 `datetime-local` pairs, wire byte-identical — verified per-field before touching); all 11 tables (4 faux-card + 7 nude) now live in `Card`, `data-table.tsx` gained fixed row height + a `TruncatedCell` helper, applied across every inline table too; shared `Pager` component absorbed all ~9 server-side pagers (adopted on the 9 recon-listed pages plus `users/page.tsx`, an identical pre-existing pattern not in the recon list — same component, zero new semantics, declared as a deviation below); the 2 residual export pairs (account-statement, expiries) collapsed into the `Menu` overflow pattern; the 6 residual warm-token occurrences migrated to DESIGN.md tokens; 123-N1 `aria-invalid` fix applied to both flight-time inputs.
- Wire discipline (AC 2, the story's central constraint): for each of the 6 `datetime-local` fields, read the exact pre-existing composition/submit code first and replicated the wire string byte-for-byte (`YYYY-MM-DDTHH:MM`, no seconds) in `composeDateTimeLocalValue`; for every `z.iso.date()` field the DD/MM/YYYY<->ISO conversion lives only in `date-input.ts`/the component — zero Zod schema or API changes anywhere in the diff.
- e2e conversion (~50 `.fill()` call sites, 14 spec files + 1 new): converted helper-first then literals, per the story's own instruction, reusing each file's existing ISO->display helper where one already existed. Final sweep grep (`\.fill\([^)]*[0-9]{4}-[0-9]{2}-[0-9]{2}`) across all of `e2e/` returns only the 4 already-wrapped `toDisplayDate(...)` calls the story itself flags as legitimate.
- Bug found and fixed during T6 verification (recon gap, not a deviation from the AC): `cash-register.spec.ts`'s `submitMovement` helper filled `#cash-effective-date` (converted to `DatePicker` by this same story) with a raw ISO literal — the recon's closed e2e-rewrite list (Dev Notes line 40) didn't flag this specific call site. A `DatePicker` silently rejects unparseable text (sets its own per-field invalid state, never calls `onChange`), so the field silently kept its default (today), corrupting 2 pre-existing AC 2 assertions. Fixed by converting the literal via a local `isoToDisplay()` helper, matching the pattern used everywhere else.
- Environmental e2e noise on this specific dev DB, NOT caused by this story (each confirmed via a clean `git diff` on the affected file — only date-format conversions, no logic/data changes — and by reproducing/eliminating the failure in isolation): (1) 2 `aircraft-rates.spec.ts` tests time out finding a newly-created aircraft's row because this long-lived, never-reset dev DB has accumulated 200+ aircraft from this session's own heavy e2e usage against a 20-row page size (pure pagination/volume artifact, pre-dates and is unrelated to this story's changes); (2) a batch of 18 spec files run concurrently together produces additional login-rate-limit/navigation-race failures (`bookings.spec.ts:489`, `flights.spec.ts:337`, `ppr-register.spec.ts:278`) that all pass cleanly when run individually or in small groups — a shared-`next-dev`-server-under-load artifact, not a regression (confirmed via clean git diff on every touched file in the failing tests' call path). One further pollution row (a stray `Expiry` "Licenza" record left on the seed pilot by an unrelated earlier spec run, which does NOT reuse "Licenza" per its own documented Story 7.4 lesson) was deleted directly via SQL after confirming it was not `bookings.spec.ts`'s own doing, to unblock `date-picker.spec.ts`'s AC 7 booking-submission test; no other DB surgery was performed (per instruction, `db:reset` was not re-run).

### File List

**New:**
- `src/components/ui/date-picker.tsx`
- `src/components/ui/date-time-field.tsx`
- `src/components/pager.tsx`
- `src/lib/date-input.ts`
- `src/lib/date-input.test.ts`
- `e2e/date-picker.spec.ts`

**Modified — primitives:**
- `src/components/data-table.tsx`

**Modified — app pages/components (DatePicker/DateTimeField adoption, Card/ellipsis sweep, Pager adoption, Menu export collapse, warm-token migration, 123-N1):**
- `src/app/[locale]/dashboard/aircraft/aircraft-manager.tsx`
- `src/app/[locale]/dashboard/aircraft/page.tsx`
- `src/app/[locale]/dashboard/bookings/booking-calendar.tsx`
- `src/app/[locale]/dashboard/bookings/bookings-list.tsx`
- `src/app/[locale]/dashboard/bookings/new-booking-form.tsx`
- `src/app/[locale]/dashboard/bookings/page.tsx`
- `src/app/[locale]/dashboard/expiries/my-expiries.tsx`
- `src/app/[locale]/dashboard/expiries/page.tsx`
- `src/app/[locale]/dashboard/expiries/proposals-queue.tsx`
- `src/app/[locale]/dashboard/expiries/types/types-manager.tsx`
- `src/app/[locale]/dashboard/finance/cash-register.tsx`
- `src/app/[locale]/dashboard/finance/categories/categories-manager.tsx`
- `src/app/[locale]/dashboard/finance/packages/packages-manager.tsx`
- `src/app/[locale]/dashboard/finance/page.tsx`
- `src/app/[locale]/dashboard/finance/report/page.tsx`
- `src/app/[locale]/dashboard/finance/report/report-filters.tsx`
- `src/app/[locale]/dashboard/flights/flights-manager.tsx`
- `src/app/[locale]/dashboard/flights/page.tsx`
- `src/app/[locale]/dashboard/people/[id]/account/account-statement-table.tsx`
- `src/app/[locale]/dashboard/people/[id]/account/page.tsx`
- `src/app/[locale]/dashboard/people/[id]/page.tsx`
- `src/app/[locale]/dashboard/people/account-panel.tsx`
- `src/app/[locale]/dashboard/people/assigned-instructors-panel.tsx`
- `src/app/[locale]/dashboard/people/expiries-panel.tsx`
- `src/app/[locale]/dashboard/people/instructor-rates-panel.tsx`
- `src/app/[locale]/dashboard/people/packages-panel.tsx`
- `src/app/[locale]/dashboard/people/page.tsx`
- `src/app/[locale]/dashboard/people/people-manager.tsx`
- `src/app/[locale]/dashboard/people/person-create-dialog.tsx`
- `src/app/[locale]/dashboard/people/profiles-panel.tsx`
- `src/app/[locale]/dashboard/ppr/page.tsx`
- `src/app/[locale]/dashboard/ppr/ppr-queue.tsx`
- `src/app/[locale]/dashboard/ppr/register/page.tsx`
- `src/app/[locale]/dashboard/ppr/register/ppr-register.tsx`
- `src/app/[locale]/dashboard/school/[id]/page.tsx`
- `src/app/[locale]/dashboard/school/page.tsx`
- `src/app/[locale]/dashboard/school/summary-filters.tsx`
- `src/app/[locale]/dashboard/school/training-notes-journal.tsx`
- `src/app/[locale]/dashboard/users/page.tsx` (deviation — see notesForReview)
- `src/app/[locale]/ppr/page.tsx`
- `src/app/[locale]/ppr/ppr-form.tsx`

**Modified — i18n:**
- `messages/it.json`
- `messages/en.json`

**Modified — e2e (fill-format conversion, T6):**
- `e2e/aircraft-rates.spec.ts`
- `e2e/bookings.spec.ts`
- `e2e/cash-register.spec.ts`
- `e2e/cash-report.spec.ts`
- `e2e/expiry-registration.spec.ts`
- `e2e/flight-log.spec.ts`
- `e2e/flight-reversal.spec.ts`
- `e2e/flights.spec.ts`
- `e2e/instructor-rates.spec.ts`
- `e2e/package-consumption.spec.ts`
- `e2e/person-profiles.spec.ts`
- `e2e/ppr-public.spec.ts`
- `e2e/ppr-register.spec.ts`
- `e2e/school.spec.ts`

**Modified — tracking:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (12-5: in-progress -> review)

## Review Record

Reviewer: subagent **Opus 4.8 (xhigh)**, adversarial. **Verdetto: fixes-required → fixed** (2 bloccanti + 2 nit fixati, 1 nit deferred).

- **Priorità zero — full e2e CI-mode su DB fresco, build di produzione**: **209 passed + 4 flaky (retry-green) + 1 FAILED / 214**. Gates 1278/1278. **Disciplina wire PROMOSSA con verifica empirica**: filtro digitato `02/01/2020` → `?dateFrom=2020-01-02`; booking persistito in DB al datetime esatto; PPR pubblico anonimo end-to-end ok. Arbitraggio ambientale: le predizioni specifiche del dev NON si sono riprodotte sul run fresco (aircraft-rates verdi) — è emerso invece 125-F1.
- **125-F1 (FIXATO)**: `bookings.spec.ts:397` deterministico sotto volume — prenotava `FUTURE_DAY T15:00` e assertava la riga su pagina 1 della lista paginata startsAt-ASC: con ~3 pagine di prenotazioni accumulate dalla suite parallela finiva a pagina 2 (fragilità di isolamento PREESISTENTE esposta dal full-run, non regressione — ma AC 7/CI rossa). Fix: passa a `soonestFutureSlot()` come gli altri test di visibilità-riga (ordina in testa e si auto-pulisce).
- **125-F2 (FIXATO)**: DatePicker/DateTimeField SEMPRE in italiano su superfici EN (placeholder hardcoded `GG/MM/AAAA`, mesi/giorni `Intl` con default `'it'`, zero call-site con `locale=`) — visibile sul form PPR pubblico EN. Fix: il componente risolve il locale dal provider next-intl (`useLocale()`) quando la prop è assente + placeholder locale-aware; nessun churn sui ~30 call-site. Verificato live su `/en/ppr`: `DD/MM/YYYY`, `Mon..Sun`, `July 2026` (e IT invariato).
- **125-N2 (FIXATO)**: `aria-controls` del trigger puntava all'id del label mese/anno — ora punta al `role="grid"` (id dedicato, solo mentre aperto). **125-N3 (FIXATO)**: i link prev/next del Pager ai bordi ora hanno `tabIndex={-1}` (il `pointer-events-none` non bloccava Enter da tastiera; il server già clampava).
- **125-N1 (accettato/deferred)**: digitare testo invalido SOPRA un valore già committato lascia partire al submit il vecchio valore valido (il campo mostra aria-invalid ma `onChange` non scatta) — coerente con la convenzione `SearchCombobox`; valutare un blocco-submit su dirty-invalid come follow-up.
- **Arbitrati a favore del dev**: fix `submitMovement` corretto; popover `position:fixed` verificato IN TOP LAYER dentro il Dialog nativo (non clippato, interattivo); keyboard-only walk-through completo promosso (roving tabindex corretto, ruoli grid/columnheader/gridcell); 11 tabelle in Card con row height 45px uniforme e 36 celle truncate+title; zero warm residui; zero input nativi residui.
- **Verifica fix**: gates 1278/1278; e2e bookings+date-picker+ppr-public 26/26; localizzazione EN verificata live con script throwaway.
