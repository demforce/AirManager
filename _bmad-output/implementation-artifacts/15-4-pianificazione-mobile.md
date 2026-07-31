---
baseline_commit: 51b60e1
---

# Story 15.4: Pianificazione mobile — agenda "Voli di oggi" con chip marche e marcatore ORA, lista prenotazioni a card con filtri, form di prenotazione a tutto schermo

Status: **review** (implementata 2026-07-31 — v. il Dev Agent Record in fondo; ratifiche PO R-15.4-a..i tutte chiuse prima del dispatch)

## Story

As a amministratore (e, con le stesse superfici, istruttore/pilota/allievo) che guarda la giornata di volo dal telefono in piazzale,
I want vedere l'agenda dei movimenti di oggi in ordine di orario, con il marcatore di **adesso** al punto giusto, filtrabile per marche con un tocco, e poter aprire, decidere, spostare o creare una prenotazione senza scorrere in orizzontale una timeline larga il triplo dello schermo,
so that la pagina più operativa dell'app smette di essere una griglia desktop rimpicciolita e diventa una vera schermata da campo.

**Riferimenti vincolanti**: piano epic 15 `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md` — **R1** (soglia 640px: 641-900px TENGONO il rail 64px della 13.10; nessuna regola di questa story esce da `@media (max-width: 640px)`), **R2** (il template è incompleto by design: quello che non mostra — la vista settimana, i filtri di stato, i form, l'annullamento — lo progetta il team nello STESSO linguaggio, non lo rimanda), **R3** (dettaglio-riga = **bottom sheet**; FORM di creazione/modifica = **pannello a tutto schermo** con header fisso e azione primaria fissa in basso), **R4** (si porta TUTTO, **filtri e form inclusi**: nessuna superficie resta "griglia desktop scrollabile in orizzontale" come stato finale — ed è esattamente lo stato di oggi, misurato in §a.1), **R5** (logout/lingua già nel menu profilo, 15.1 — non si toccano). Architettura vincolante: **componenti mobile dedicati + switch a media query CSS pura** (niente `matchMedia`, niente user-agent, niente route parallele), `display:none` VERO su entrambi gli alberi, ogni regola mobile **ADDITIVA**, **MAI** cambiare il valore di un token esistente, nessun literal di colore nuovo.

**Convenzione testid dell'epic** (fissata dalla 15.1, in CLAUDE.md e nel doc-comment di `mobile-nav.tsx`): i testid dell'albero **desktop non cambiano mai**; una superficie mobile che **DUPLICA** una desktop prende lo stesso nome col suffisso **`-mobile`**; una che esiste **SOLO** su mobile prende un nome nuovo col prefisso **`mobile-`**.

**Lezioni delle review 15.1/15.2/15.3 da NON ripetere** (sono le tre che questa story può violare per davvero):
1. **La regressione sta sul lato che la regola ha LIBERATO** (15.2 guardia cieca, 15.3 F1). Qui il caso concreto è il selettore: `.home-head-actions .btn` era un *discendente* e ha sfondato dentro il piede di un `SlideOver` a tutto schermo (misurato: 118px → 191px). Questa story mette classi nuove su `schedule.tsx` e `bookings-table.tsx`, che **montano `SlideOver` e popover portalati come discendenti/fratelli**: ogni selettore nuovo deve essere ancorato (`>`), e va provato che non raggiunge il pannello del form.
2. **"Desktop invariato" ≠ "nient'altro è cambiato"** (review 15.3, claim 3): `schedule.tsx` e `bookings-table.tsx` sono renderizzati **anche dalla Panoramica** (`dashboard/page.tsx:618` e `639`, dentro `.home-desktop-surface`). Ogni misura pre/post va fatta su **due pagine**, non su una.
3. **Una guardia d'ordine/prefisso è cieca** (15.3 F8): asserire "le prime 3 voci" lascia passare una superficie scivolata in fondo. Le asserzioni d'ordine di questa story sono **intere**, non a prefisso.

**Fonte visiva**: template `AirOps Mobile.dc.html` — copia locale di sessione in `/tmp/claude-1000/-home-admin-AirManager/7fab7f81-c481-44b3-9f25-52715f8036a3/scratchpad/AirOps-Mobile.dc.html` (lo scratchpad viene ripulito tra sessioni: se manca, la sessione principale lo riscarica con `DesignSync` dal progetto `dcd71b3a-dbcf-494e-a543-29325a5435de`; i subagent NON lo raggiungono). **Leggerlo davvero** prima di scrivere codice. Sezioni in scope:
- **righe 126-153 — `Admin · Voli di oggi`**: testata (titolo 23px/600 + sub 12px "MAR 21 APR · {{schedCount}} movimenti in programma"), **strip di chip marche** (131-135: `overflow-x:auto`, `scrollbar-width:none`, pill `border-radius:999px`, mono 11px, `padding:5px 12px`, attivo = fondo `--ink` / testo `--bg` / bordo `--ink`, inattivo = `--panel`/`--ink-2`/`--border`), **card agenda** unica (136-152) con righe `grid-template-columns:46px 1fr auto`, `box-shadow: inset 3px 0 0 {{edge}}`, colonna orari mono (t1 11.5px/600, t2 10px `--ink-4`), titolo 13px/600 ellissi + sub mono 10.5px ellissi, chip di stato a destra; **riga marcatore ORA** (139) inserita PRIMA della riga: fondo `--accent-soft`, pallino 7px `--accent`, testo mono 10px `--accent-ink` "ORA · 10:52".
- **script 636-641** — la meccanica del template: `schedFlights` = FLIGHTS filtrati per marca e **ordinati per orario di inizio**; `nowIdx = findIndex(f.start > NOW)` e `nowBefore: i === nowIdx` (⇒ **un solo** marcatore, e **nessun** marcatore se non esiste un volo successivo a "adesso"); `edgeMap = {complete: --ok, active: --accent, scheduled: --info, aog: --bad}` con `solo → --border-strong`; le righe **AOG sono nell'agenda** (`title: tail + " fuori servizio"`, `sub: "manutenzione non programmata"`); `tailChips = ["Tutti"].concat(TAILS)`.
- **script 589 (`openFlight`)** — il row-builder del bottom sheet: `{sub: tail · tipo, title: rotta, badge, rows:[Orario, Pilota, Istruttore, Aeromobile, Tipo]}`.
- **script 592 (`openBooking`)** — il row-builder della prenotazione: `{sub: "Prenotazione " + id, title: pilota, badge, rows:[Aeromobile, Istruttore, Inizio, Fine, Durata, Tipo], act: solo se pending}`.
- **Il template NON mostra** (⇒ R2, li progetta il team): la vista **settimana**, i filtri di **stato**, la **paginazione**, il **form** di creazione/modifica, l'**annullamento**, l'**export**, e la nozione di "stato prenotazione" (mostra fasi di volo). **Non si portano** (assunzioni accettate del piano): orologio in topbar, "Accedi come".

---

## Ricognizione (2026-07-30, teammate story — verificata su file, righe e **misure a runtime**; il dev la **verifichi e CORREGGA** se sbaglia: la prassi ha pagato in 14.3/14.4/14.6/14.8/14.9 e in 15.1/15.2/15.3)

### a) La superficie reale

`src/app/[locale]/dashboard/bookings/` — 6 file, 2286 righe:

| file | righe | ruolo |
|---|---|---|
| `page.tsx` | 365 | server component: gate, fetch, sanificazione `?view`/`?date`/`?page`, proiezioni calendario, href di export |
| `schedule.tsx` | 585 | client: card "Programma" — testata con nav data + filtri + toggle giorno/settimana, **timeline giorno** e **griglia settimana** |
| `bookings-table.tsx` | 524 | client: card "Prenotazioni" — testata con export + CTA, tabella, paginazione, mini-modal del rifiuto, i due `SlideOver` |
| `new-booking-form.tsx` | 579 | client: `SlideOver` di creazione (7.1/7.3/**7.4 force**) |
| `edit-booking-form.tsx` | 233 | client: `SlideOver` di modifica ("Sposta") |
| `booking-transition.ts` | 114 | modulo condiviso 15.3 (AD-2): `postBookingTransition` + mappa codice→messaggio, usato ANCHE dalla coda mobile della Panoramica |
| `booking-labels.ts` | — | builder dei quattro pacchetti di label |

**⚠️ `schedule.tsx` e `bookings-table.tsx` sono renderizzati anche dalla Panoramica** (`dashboard/page.tsx:618-637` e `639-670`), dentro `.home-desktop-surface` — che a ≤640px è `display:none` (`airops.css:2035`). Conseguenza pratica **verificata dalla review 15.3** (claim 5): un albero mobile aggiunto in questi due file esiste nel DOM anche sulla home, ma **non si vede** (l'antenato è `none`). È il motivo per cui la 15.3 ha usato i testid `mobile-overview-*` invece di `booking-row-mobile`: quei nomi sono **liberi e riservati a questa story**.

#### a.1 — Cosa fa la pagina a 375px OGGI (misurato, non dedotto)

Misure prese con script `playwright-core` throwaway su `next dev` a 375×812, attore admin, **DB di sviluppo popolato (102 velivoli, 20 righe per pagina di lista)** — il conteggio dei velivoli è anomalo (è il TD `OPTIONS_PAGE_SIZE` in `sprint-status.yaml`) e va letto come tale; **le larghezze non dipendono dal volume**:

| superficie | clientWidth | scrollWidth | overflow orizzontale nascosto |
|---|---|---|---|
| `.schedule` (vista **giorno**) | 317px | **1094px** | **777px** — la timeline è una griglia a `min-width:1000px` (`airops.css:487-493` e `514-523`) dentro un contenitore `overflow-x:auto` |
| `.sched-resource` (colonna velivolo) | **160px** su 317 visibili | — | metà dello schermo è occupata dalla colonna delle marche: dell'asse 16 ore se ne vedono ~2 |
| `.week-grid` (vista **settimana**) | 317px | **848px** | **531px** — 7 colonne `minmax(120px,1fr)`; se ne vedono ~2,5 su 7 (è il difetto che 13.10 F2 ha reso *scorribile*, non risolto) |
| `.students` (tabella prenotazioni) | 317px | **938px** | **621px** — 6 colonne (`bookings-table.tsx:273`); a 375px si vede la colonna "Pilota" e mezza "Inizio" |
| `.card-head` della card Prenotazioni | — | — | **92px di altezza** a 375px contro 64px a 1280px: Esporta + "Nuova prenotazione" vanno a capo |
| pagina | — | — | **overflow orizzontale di pagina = 0** (i tre contenitori scrollano per conto proprio) |

⇒ **La pagina non è rotta: è illeggibile.** È il caso letterale che R4 vieta come stato finale ("nessuna pagina resta tabella desktop scrollabile"). Nessuna di queste tre superfici va "aggiustata": vanno **sostituite** a ≤640px (Q1).

#### a.2 — Il marcatore ORA di oggi è **una pillola vuota** (difetto misurato, PRE-esistente)

`airops.css:558-580`: `.now-line` è una barra verticale 1px con una pillola `::before` che stampa `content: attr(data-time)`. **`data-time` non viene mai scritto**: `grep -rn "data-time" src/` restituisce **una sola occorrenza, il CSS stesso** — `schedule.tsx:479` rende `<div className="now-line" style={{ left: … }} />` e basta. Misurato a runtime, a 375px **e** a 1280px: `getComputedStyle(el,'::before').content === '""'`, larghezza **12px** (solo il padding). Cioè: la barra c'è, l'ora **non c'è**, e sopra la barra galleggia un rettangolo `--accent` vuoto. Il marcatore ORA che la 15.4 deve portare su mobile **non ha oggi un gemello funzionante sul desktop** (Q2).

#### a.3 — Dati del server, voce per voce (e dove il template mostra un dato che l'app NON ha)

| dato template | fonte reale | note |
|---|---|---|
| agenda dei movimenti | `calendarBookings = listCalendarBookings(actor, {from,to})` (`page.tsx:211`) → `projectDayBlocks` (`page.tsx:212`) | **`listCalendarBookings` è APPROVED-only** (`bookings.service.ts:714`, decisione 12.2 AC 4): l'agenda non vede le PENDING (Q9) |
| orario riga (t1/t2) | `CalendarDayBlock.timeLabel` = `"HH:MM–HH:MM"` (`lib/booking-schedule.ts:127`) | **`CalendarDayBlock` NON porta `status`, né `startsAt`/`endsAt`, né `aircraftRegistration`** (righe 13-25): il tipo va esteso, oppure l'agenda si costruisce da `calendarBookings` (che è `BookingListItem[]`, righe 100-121, e ha tutto) **senza passare dalla proiezione** — la proiezione serve alle percentuali, che l'agenda non usa |
| marche (chip di riga) | `BookingListItem.aircraftRegistration` | c'è |
| chip di stato riga (`complete/active/scheduled`) | **derivazione pura già in casa**: `dayPhaseOf(startsAt, endsAt, now)` in `src/lib/booking-day-phase.ts` (estratta dalla 15.3, AD-4) → `inProgress｜completed｜scheduled`, semantica `[startsAt, endsAt)` documentata | **combacia 1:1 col template** (`_badge`: complete/active/scheduled). Le etichette i18n `instructorLanding.status.*` esistono già |
| bordo colorato di riga (`edge`) | derivabile dalla stessa fase | `edgeMap` template: complete→`--ok`, active→`--accent`, scheduled→`--info`, aog→`--bad` |
| **"Tipo" (Doppio/Solo/Noleggio)** | **NON ESISTE** sul dominio `Booking` | il modello ha `instructorProfileId` (e basta): "doppio" è derivabile come "istruttore presente", "solo/noleggio" **no**. Nel sheet la riga "Tipo" del template va **omessa** o sostituita da "Istruttore" (Q4) |
| **"rotta" come titolo** | **NON ESISTE**: `Booking` non ha origine/destinazione | il titolo di riga è il **pilota** (`personName`, o `labels.occupied` se mascherato — 14.5 R3) |
| marcatore ORA | `isToday` (`page.tsx:197`) + `nowLinePercent` (219-221) esistono già; l'ORARIO no (a.2) | |
| chip marche | `aircraftOptions = listBookableAircraft(actor)` (`page.tsx:134`), con `status` e `registration` | già passate a `Schedule` |
| righe AOG | `aircraft.status === 'OUT_OF_SERVICE'` + `statusReason` → oggi `schedule-aog-block` per riga velivolo (`schedule.tsx:481-486`) | in un'agenda ordinata per orario un AOG **non ha orario** (Q8) |
| conteggio sub testata | `dayBlocks.length` (o le righe agenda dopo il filtro) | il `sub` della pagina è oggi **statico** (`t('sub')`, `page.tsx:309`) |

#### a.4 — I filtri che esistono OGGI (e quelli che non esistono)

- **Timeline**: due filtri **client-side, non URL** dentro il popover `schedule-filter-toggle` (`schedule.tsx:193-194`, `312-420`): `filterAircraftId` (tutte le marche) e `filterInstructorId`. ⚠️ Il gruppo istruttori è renderizzato **solo se `instructors.length > 0`** (righe 381-401) e `page.tsx:148-149` popola quella lista **solo per chi ha `bookings.read.names`**: è il fix della review 14.5 F1 (il filtro era un oracolo che de-anonimizzava i blocchi mascherati). **Qualunque chip istruttore su mobile deve ereditare quel gate, non reintrodurlo.**
- Il popover è già clampato dentro il viewport a 375px (13.10 F4-13.7) ed è **guardato** da `bookings.spec.ts:813-846`.
- **Lista prenotazioni**: **nessun filtro**. La pagina mostra sempre `ALL_BOOKING_STATUSES` (`page.tsx:51`, `178`) su una finestra `from = now − 48h` (176, ratifica review 12.3 F7), 20 per pagina (35).
- **Scoperta 1 — c'è un deep link che oggi non filtra niente**: la 15.3 (fix di review F3) ha aggiunto alla coda della Panoramica un footer che porta a **`/dashboard/bookings?status=PENDING`** (`mobile-pending-bookings.tsx:224`), e `mobile-overview-overflow.spec.ts:127` ne asserisce **solo l'URL**. Ma `bookings/page.tsx` **non legge `status`**: `PageProps.searchParams` è `{ page?, view?, date? }` (righe 26-29). ⇒ il link atterra sulla lista completa, non filtrata. È un difetto **aperto sulla superficie che questa story possiede** (Q5).

#### a.5 — Il form: cosa deve essere preservato, dove vive, e cosa gli manca

`new-booking-form.tsx` (579 righe) — comportamenti **esistenti e testati** che il pannello a tutto schermo non deve perdere:

| comportamento | dove | e2e che lo guarda |
|---|---|---|
| 3 forme di form (`staff` / `instructor` con toggle "Per me/Per un allievo" / `pilot`) | `page.tsx:151-170`, form 378-474 | `bookings.spec.ts:442, 501, 542, 575` |
| validazione per-campo Zod mode-aware | 128-156, `fieldErrorLabel` 229-234 | `bookings.spec.ts` (14.2) |
| **409 sovrapposizione** → `labels.errors.overlap` nel banner, **mai confuso** con un 422 | 296-299 | `bookings.spec.ts:383-441`, `1099-1155` |
| 422 `AIRCRAFT_OUT_OF_SERVICE` / `BOOKING_IN_PAST` / `PERSON_NOT_BOOKABLE` | 302-307 | `bookings.spec.ts:462` |
| **422 `EXPIRED_DOCUMENTS` + blocco 7.4** con i nomi dei documenti | 308-319 | `bookings.spec.ts:1337, 1361, 1393, 1471, 1491` |
| **"Forza prenotazione" (7.4 AC 2)**: sezione ambra, motivo **obbligatorio**, re-invio del **body identico** + `force`+`forceReason`, solo `mode === 'staff'` | 213-218, 334-372, 499-545 (`force-booking-section/reason/error/submit/cancel`) | `bookings.spec.ts:1393-1444`, `1445-1470` |
| success + success-**con-warning** ambra (documenti non bloccanti) | 547-566 (`booking-form-success`, `booking-form-warning`) | `bookings.spec.ts:1361-1392` |
| reset su chiusura da OGNI via (X, scrim, Esc, Annulla) | `handleClose` 236-249 | — |
| i bottoni restano **dentro `<form>`**, non nel `footer` di `SlideOver` | doc-comment 166-188 (motivo: il locator e2e è `getByTestId('new-booking-form').getByRole('button')`) | `bookings.spec.ts` (ovunque) |

- **Scoperta 2 — la riga d'azione dei DUE form prenotazione NON ha la classe della 15.2**: `.so-actions` (la barra sticky in basso della modalità a tutto schermo, `airops.css:1915-1923`, dentro `@media (max-width:640px)` ⇒ **inerte sul desktop**) è applicata **solo** a `manual-ppr-form.tsx:345` e `fleet/aircraft-editor.tsx:605`. `new-booking-form.tsx:568` e `edit-booking-form.tsx:221` hanno una `<div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18}}>` **senza classe**. ⇒ oggi, su un telefono, il pannello è sì a tutto schermo (15.2), ma **l'azione primaria non è fissa in basso**: R3 non è soddisfatta su questa pagina. Aggiungere la classe è una parola per file, desktop-inerte per costruzione. ⚠️ Il form ha però una **seconda** riga d'azione (la sezione force, 528-543): due barre sticky impilate sono esattamente il difetto che la review 15.2 F3 ha rinviato a 15.5 (v. `sprint-status.yaml`) — v. AD-6.
- **Scoperta 3 — il 422 `BOOKING_OUTSIDE_WINDOW` cade nel messaggio generico**: `bookings.service.ts:336` e `349` lo sollevano (finestra `sched.openTime/closeTime` e `maxAdvanceDays`), ma `new-booking-form.tsx:294-323` non ha un ramo per quel codice ⇒ `labels.errors.generic` = **"Impossibile creare la prenotazione. Riprova."** (verificato: `BookingsPage.form.errors` non ha la chiave). Su un telefono, dove l'utente non vede le Impostazioni, è il messaggio meno utile possibile (Q7).
- **`DateTimeInput` dentro il pannello**: i popover dei picker sono **portalati su `document.body`** con z-index 65/66 (TD-7) perché il `transform` di `.slideover-panel` intrappola i `position:fixed` discendenti. A ≤640px il pannello è a tutto schermo (`airops.css:1895-1901`, `translateY`): i picker restano sopra (65/66 > 50) — **da verificare, non da assumere**, perché la riga `.so-actions` sticky è nuova su questo form e sta sotto di loro.

#### a.6 — Le primitive 15.2/15.3 da RIUSARE (API verificata sul codice)

- **`src/components/ui/bottom-sheet.tsx`**: `BottomSheet({open, onClose, testId, sub, title, badge?, rows, actions?, secondStep?, closeLabel})`; `secondStep` **sostituisce** righe+azioni nello **stesso** nodo dialog (R-15.2-a) ed è il meccanismo già usato per un motivo obbligatorio; `onClose` deve essere **referenzialmente stabile** (`useCallback`). Dopo il fix 15.3 F4 la primitiva garantisce **uno sheet alla volta** (identità per token d'istanza) — proprietà su cui questa story si appoggia, avendo **due** proprietari di sheet nella stessa pagina.
- **`src/app/[locale]/dashboard/mobile-booking-list.tsx`** (139 righe, 15.3): lista read-only a card + sheet, `testId`/`rowTestId`/`emptyTestId` **come prop**, `withTimeColumn` che attiva la colonna orari `46px 1fr auto` del template. **È a un passo dall'agenda della 15.4** — le mancano solo il bordo colorato di riga e il marcatore ORA (AD-4).
- **`src/app/[locale]/dashboard/mobile-pending-bookings.tsx`** (325 righe, 15.3): la coda che **decide** — `postBookingTransition`, `secondStep` col motivo, gestione `stale` (422 `BOOKING_TRANSITION_INVALID`, review 15.3 F2) e `conflict` (409), focus spostato a ogni passo, footer di troncamento. **È il modello esatto** dello sheet decisionale di questa story.
- **CSS già pronto e riusabile** (tutto dentro `@media (max-width:640px)`): `.mobile-card-head/-title/-count/-empty/-foot` (`airops.css:2076-2084`), `.mobile-row` + `.mobile-row-timed` (2088-2106, **`46px 1fr auto`** = la griglia dell'agenda del template), `.mobile-row-t1/-t2/-main/-title/-tail/-name/-sub/-chev` (2107-2132). Il `.mobile-row-tail` **è già** il chip marche mono del template.
- **`.ppr-card*`** (1869-1887) resta la famiglia sorella della coda PPR: la 15.3 ha deciso di **non** generalizzarla (costo non zero). Non riaprire quella decisione.

#### a.7 — `airops.css`: dove va la roba nuova, cosa non toccare

- Sezioni mobile: shell 15.1 **1666-1801**, primitive 15.2 **1802-1995**, panoramica 15.3 **1996-2185**. Le regole nuove vanno **in coda**, in un blocco proprio `/* ---------- pianificazione mobile (story 15.4) ---------- */`, dentro `@media (max-width: 640px)` — **tranne** la riga `display:none` fuori-query per ogni albero mobile nuovo (precedenti: `.ppr-queue-mobile` 1822, `.overview-mobile`/`.landing-mobile` 2022-2023).
- **Mappa z-index in uso** (non introdurre valori nuovi senza una misura che li motivi): `.topbar`/`.mobile-topbar` 4 · `.mobile-tabbar` 5 · popover/typeahead 19/20/30 · `.mobile-sheet` **40** · `.slideover` **50** · `.mini-modal` **60** · popover portalati dei picker **65/66** · `.toast-host` **200** (a ≤640px sollevato, riga 1687).
- **Classi condivise da NON usare come aggancio dello switch**: `.card`, `.card-head`, `.students`/`.student-row` (13 file), `.schedule`, `.week-grid`, `.list`. Lo switch va su **classi di pagina proprie**.
- **Riuso invece di colori nuovi**: chip di stato = `Badge` (`ui/badge.tsx`, toni `'' | ok | warn | bad | info`); azioni = `.btn.primary` / `.btn.mini.ok` / `.btn.mini.bad` (1151-1162, con gli override dark 13.9); il chip marche attivo del template (fondo `--ink`, testo `--bg`) è esattamente `.btn.primary`. **Contrasto misurato** (canvas→WCAG), mai scelto a occhio.

### b) e2e e unit — il campo minato preciso

**Spec che vivono su `/dashboard/bookings`** (6 file, 30 riferimenti):

| file | righe | cosa fa | rischio per questa story |
|---|---|---|---|
| `e2e/bookings.spec.ts` | 1873 righe, 34 test, **22** `goto('/dashboard/bookings')` | l'intera copertura di dominio (7.1/7.2/7.3/7.4/12.2/12.3/14.5) | gira a **viewport desktop** (`sharedUse` = `devices['Desktop Chrome']`, 1280×720, `playwright.config.ts:13-19`): un albero mobile `display:none` non lo tocca — **ma un testid duplicato lo rompe in strict mode a QUALSIASI viewport** |
| " | **813-846** | 375px: clamp dei DUE popover (filtri + calendario) dentro il viewport, hit-test su `schedule-filter-done` e `.cal-foot .btn` | **sopravvive solo se la testata della card `schedule-section` resta viva a ≤640px** — è la ragione principale di AD-2 |
| " | **848-883** | 375px: `.week-grid` scrolla e il 7° giorno diventa raggiungibile; asserisce `reachable() === false` **prima** dello scroll | **si rompe per costruzione** se la griglia settimana viene sostituita (Q1). Va **riscritto al valore corretto**, mai indebolito (lezione 14.6) |
| " | **885-923** | 375px: `schedule-aircraft-row` + `schedule-block` **visibili**, `new-booking-button` visibile, niente overflow di pagina | **si rompe per costruzione** se la timeline giorno viene sostituita (Q1). Idem: riscrittura al valore corretto |
| " | 1556-1734 | workflow approvazione: `booking-approve-action`, `booking-reject-action`, `booking-deny-reason`, `booking-deny-submit`, `booking-flown-action`, `booking-noshow-action`, `booking-cancel-action`, `booking-cancel-confirm`, `booking-reopen-action`, `booking-move-action` | **nessuno di questi testid può essere riusato dall'albero mobile** (convenzione `-mobile`) |
| `e2e/home-dashboard.spec.ts` | 228-267 | sulla **home**: `page.getByTestId('booking-row')` **page-level** + `booking-row-starts-at` + `kpi-bookings-pending .kpi-value` | l'albero mobile di `bookings-table.tsx` finisce **anche qui**: deve usare `booking-row-mobile`, mai `booking-row` |
| `e2e/pdf-exports.spec.ts` | 374-380 | `bookings-list-section` → `booking-row` filtrato per targa → menu Esporta → PDF | duplicato di testid = rotto |
| `e2e/mobile-shell.spec.ts` | 145-172 | **390×844 su `/it/dashboard/bookings?view=week&date=…`**: titolo `Pianificazione` nella topbar, switch lingua che preserva pathname+query, logout | è l'unico spec mobile che **atterra su questa pagina**: qualunque errore SSR o hydration a ≤640px lo rompe. La sua asserzione `toHaveURL(/\/en\/dashboard\/bookings\?view=week&date=…$/)` **si rompe se la pagina aggiunge/normalizza query param** |
| `e2e/shell-misc.spec.ts` | 53-58 | stessa cosa a viewport desktop | idem sui query param |
| `e2e/datetime-picker.spec.ts` | 132, 177, 197 | `DateTimeInput` dentro `new-booking-form` (a **viewport desktop**): apertura popover, flip, clamp | la riga `.so-actions` sticky nuova sta **sotto** i picker portalati (65/66 > 50): verificare a 375px che non ne copra nessuno |
| `e2e/mobile-overview-overflow.spec.ts` | 113-127 | clic sul footer della coda mobile della home → `waitForURL(/\/dashboard\/bookings\?status=PENDING/)` | se Q5 passa, la pagina **inizia a filtrare** su quel link: il test resta verde (asserisce l'URL) ma **va esteso**, altrimenti resta cieco esattamente come F8 |
| `e2e/booking-window.spec.ts` | 65-128 | project **serializzato** `booking-window`, scrive `sched.*` globali e ripristina in `afterAll` | è **la sede naturale** di ogni test nuovo che tocchi la finestra di prenotazione (Q7 / AC 7) |
| `e2e/reports.spec.ts` | 307-315 | ⚠️ fa un `PUT /api/v1/settings/scheduling` **globale dal project `fullyParallel`** senza ripristino (TD aperto in `sprint-status.yaml`) → la finestra può restare a **07:00-21:00** per il resto del run | è la causa già documentata (`mobile-overview.spec.ts:97`) dei 422 `BOOKING_OUTSIDE_WINDOW` sulle fixture create fuori orario: **ogni fixture nuova di questa story deve stare dentro 07:00-21:00 Roma**, come ha fatto la 15.3 |

**Unit**: `page.tsx` è un server component senza test. `booking-day-phase.test.ts` e `overview-alerts.test.ts` (15.3) sono i precedenti: ogni derivazione pura nuova (composizione dell'agenda, posizione del marcatore ORA, ordinamento, sanificazione di `?status`) va in `src/lib/` con il suo `*.test.ts` — per costruzione non importa servizi, quindi non trascina `@/lib/env` (lezione a 3 occorrenze in CLAUDE.md). Verifica comunque: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.

**Stato globale**: questa story **non** scrive AppSettings *se* nessun test nuovo tocca la finestra. Se un test lo fa (Q7), **entra in `booking-window.spec.ts`** (project serializzato già esistente), **non** in uno spec nuovo del project `chromium`. Regola CLAUDE.md, nata da fallimenti veri (12.11 F1).

### c) Convenzioni trasversali (CLAUDE.md, non ripeterle sbagliate)

`karpathy-guidelines` su ogni riga; `npm run gates` prima del commit (**mai** i 4 comandi separati); ogni stringa nuova in **entrambi** i locale (`messages/it.json` + `messages/en.json`); segnaposto riempiti lato client → **`t.raw`** (con `t()` next-intl rende la chiave: 3 occorrenze storiche); suite e2e **SEMPRE** via `scripts/e2e.sh start` + `scripts/e2e.sh status`, **MAI** `playwright test` in foreground; build una volta per ciclo (`env -u NODE_ENV npm run build && npm run start &`, poi `E2E_REUSE_SERVER=1`); **MAI `Escape`** negli e2e per chiudere un popup dentro uno `SlideOver` (chiude tutto il pannello — review 14.3 F1/F2, e questa pagina è **il posto** dove succede); MAI `getByRole('link', {name})` page-level; MAI `hasText` con valori H:MM o date per disambiguare righe ("11:00" contiene "1:00" — lezione 11.2, e questa pagina è piena di orari); prima di attribuire un fallimento e2e al lock anti-brute-force TD-6, contare i `LoginAttempt` **falliti** (`login-throttle.ts:25`).

---

## Decisioni architetturali (motivate, vincolanti — non sono ratifiche PO, sono vincoli tecnici)

**AD-1 — Gli alberi mobile vivono DENTRO `schedule.tsx` e `bookings-table.tsx`, non in componenti di pagina paralleli.** Motivo dirimente: entrambi i componenti possiedono lo **stato** che le superfici mobile devono condividere — i filtri client (`filterAircraftId`/`filterInstructorId`, `schedule.tsx:193-194`) e **tutta** la macchina delle azioni di riga (`bookings-table.tsx:166-259`: transizioni, motivo del rifiuto, conferma di annullamento, `SlideOver` di modifica). Un componente parallelo o duplica quello stato (due sorgenti di verità sul filtro) o duplica la rete (che la 15.3 ha appena unificato in `booking-transition.ts`). Conseguenza accettata e **da guardare**: l'albero mobile esiste nel DOM anche sulla Panoramica, dove è invisibile perché `.home-desktop-surface` è `display:none` (`airops.css:2035`) — l'AC 9 lo asserisce con una misura, non con una speranza.

**AD-2 — Si sostituisce il CORPO, non la card: le testate restano un solo nodo.** A ≤640px vanno a `display:none` **solo** `.schedule`, `.week-grid` e `.students` (tramite classi di pagina proprie messe su quei nodi, mai le classi stesse: `.students` è condivisa da 13 console). Restano vive e uniche: `.card-head` di `schedule-section` (titolo, `calendar-heading`, `calendar-prev`/`schedule-date-pick`/`calendar-next`, `schedule-filter-toggle`, `calendar-view-day`/`calendar-view-week`) e `.card-head` di `bookings-list-section` (titolo, `bookings-pending-summary`, `ExportMenu`, `new-booking-button`). Tre motivi, tutti verificabili: (i) evita di **duplicare 8 testid di navigazione** e la logica di href che ci sta dietro; (ii) `bookings.spec.ts:813-846` (clamp dei popover a 375px, guardia della 13.10) **resta verde senza modifiche** — se sparisse la testata, sparirebbe anche quella copertura; (iii) è lo stesso principio di AD-3 della 15.3 ("testata e KPI non si duplicano"), che lì ha evitato la rottura in strict mode di sei asserzioni.

**AD-3 — Nessun secondo albero dove basta una classe modificatore.** La strip di chip marche, il footer di paginazione, l'empty state e la CTA sono **gli stessi nodi** del desktop restilizzati, quando esistono; si crea markup nuovo solo dove la forma cambia davvero (le righe: da `.student-row` a 6 colonne a `.mobile-row`). Precedente: `.kpi-row.kpi-row-grid` (15.3, `airops.css:2060`).

**AD-4 — L'agenda riusa `MobileBookingList` SOLO se l'estensione è a costo zero per i tre consumer esistenti.** L'agenda ha due cose che quel componente non ha: il bordo colorato di riga (`inset 3px 0 0`) e la **riga marcatore ORA** intercalata fra due righe. Regola (la stessa che la 15.3 ha applicato a `.ppr-card*`): si estende `MobileBookingList` **solo** se bastano ≤2 prop opzionali **e** il diff dei computed style delle tre liste della home a 375px pre/post è **vuoto** (misurato, non dedotto); altrimenti nasce un componente sorello in `bookings/` che riusa le **stesse classi CSS** `.mobile-row*`, e la duplicazione va dichiarata nel record col motivo. In entrambi i casi: la riga marcatore **non è un `<button>`** e non entra nell'ordine di tabulazione (è un separatore, non un comando).

**AD-5 — Le derivazioni sono funzioni PURE in `src/lib/`, con unit test.** Valgono per: la composizione delle righe d'agenda (ordinamento per `startsAt`, filtro marche, inserimento delle righe AOG), il calcolo della **posizione del marcatore ORA** (indice della prima riga con `startsAt > now`, e il caso "nessuna" del template), e la sanificazione di `?status` se Q5 passa. Motivo: sono l'unica parte che un e2e non può provare in modo discriminante sui casi di confine (agenda vuota, marcatore prima della prima riga, marcatore assente perché tutto è passato, filtro che svuota la lista), e la lezione 15.2 dice che una regola senza guardia è una regola che può sparire. Restano pure ⇒ niente `@/lib/env`. Precedente diretto: `src/lib/booking-day-phase.ts`.

**AD-6 — La barra d'azione sticky va sulla riga PRIMARIA, una sola per pannello.** `.so-actions` (esistente, `airops.css:1915-1923`, inerte >640px) si applica alla riga finale di `new-booking-form.tsx:568` e `edit-booking-form.tsx:221`. **Non** si applica alla riga della sezione "Forza prenotazione" (`new-booking-form.tsx:528`): due barre sticky impilate sono il difetto che la review 15.2 F3 ha rinviato a 15.5 (`sprint-status.yaml`). Se la misura a 375px mostra che il bottone "Forza prenotazione" non è raggiungibile senza scorrere, **si dichiara e si misura**, non si aggiunge una seconda barra.

**AD-7 — Un solo sheet aperto, un solo `mobile-booking-sheet` nel DOM.** La pagina ha **due** proprietari di `BottomSheet` (agenda e lista). Entrambi devono renderlo condizionalmente (`{openRow ? <BottomSheet …/> : null}`, idioma di `mobile-booking-list.tsx:120` e `mobile-pending-bookings.tsx:235`), così il testid resta un solo nodo; la mutua esclusione a runtime è già garantita dalla primitiva (fix 15.3 F4). **Va asserito**, non assunto.

---

## Acceptance Criteria

> Gli AC marcati **⟨Qn⟩** dipendono dalla ratifica corrispondente e vanno riletti dopo le risposte del PO. Ogni misura si intende a **375×812** e ripetuta a **390×844**, tema **chiaro e scuro**.

1. **(Testata e chip marche — template 127-135)** A ≤640px la card `schedule-section` mostra, sotto la testata esistente (AD-2), una **strip orizzontale di chip** con "Tutti" + una per velivolo prenotabile, che pilota lo **stesso** `filterAircraftId` del popover (nessuno stato duplicato: cambiare il chip aggiorna il popover e viceversa, asserito). Pill `border-radius:999px`, mono 11px, attivo = `.btn.primary` (nessun literal di colore nuovo), `min-height` ≥44px, strip `overflow-x:auto` con `scrollbar-width:none`. Il sub della testata dichiara il **conteggio reale** dei movimenti mostrati dopo il filtro. Filtro istruttore secondo ⟨Q3⟩, **con lo stesso gate `bookings.read.names` di oggi** (a.4: mai reintrodurre l'oracolo chiuso da 14.5 F1). **Verifica**: e2e — con N velivoli, `chip.count() === N+1`; toccare un chip riduce le righe d'agenda alle sole di quel velivolo **e** il popover mostra quel velivolo selezionato; la strip non produce overflow orizzontale **di pagina** (`document.documentElement.scrollWidth <= clientWidth`) con una flotta lunga; l'ultimo chip diventa raggiungibile dopo uno `mouse.wheel` REALE (pattern `bookings.spec.ts:848-883`).

2. **(Agenda del giorno ⟨Q1⟩⟨Q8⟩⟨Q9⟩ — template 136-152)** A ≤640px, in `view=day`, `.schedule` è `display:none` **misurato** e al suo posto c'è una card unica con una riga per movimento, **ordinate per orario di inizio**, con: colonna orari a sinistra (`.mobile-row-timed`, t1 inizio 11.5px/600 mono, t2 fine 10px `--ink-4` mono), chip marche (`.mobile-row-tail`), titolo = pilota (o `labels.occupied` se mascherato, 14.5 R3), sub mono con istruttore/note, `Badge` di **fase** derivata da `dayPhaseOf` (`src/lib/booking-day-phase.ts`) e bordo sinistro colorato coerente con quella fase. Righe AOG secondo ⟨Q8⟩; perimetro degli stati secondo ⟨Q9⟩. Empty state proprio, **un solo nodo**. **Verifica**: e2e con fixture run-unique a cavallo di adesso, una futura e una conclusa nella stessa giornata → tre righe con le tre fasi, nell'ordine degli orari; unit test della funzione pura di AD-5 sui casi di confine (lista vuota, un solo movimento, due movimenti adiacenti `endsAt === startsAt`).

3. **(Marcatore ORA ⟨Q2⟩)** Nel giorno **corrente** (`isToday`, `page.tsx:197`) l'agenda mostra **esattamente una** riga marcatore, immediatamente **prima** del primo movimento con `startsAt > now`, con pallino 7px `--accent`, fondo `--accent-soft` e testo mono `ORA · HH:MM` con **l'ora vera** (template 139). Se nessun movimento è successivo a "adesso" (giornata finita) **oppure** il giorno mostrato non è oggi, il marcatore **non compare** (comportamento del template, `nowIdx === -1`). Il fix desktop della pillola vuota (a.2) segue ⟨Q2⟩. **Verifica**: unit sulla funzione pura (marcatore in testa quando tutto è futuro, in coda-assente quando tutto è passato, in mezzo nel caso normale, assente se `isToday === false`); e2e — `toHaveCount(1)` sul marcatore, e il testo contiene `HH:MM` (regex `\b`-anchored, mai `hasText` con un orario, lezione 11.2).

4. **(Vista settimana a ≤640px ⟨Q1⟩)** In `view=week` il corpo mobile è quello ratificato in ⟨Q1⟩; in ogni caso **nessuna superficie della vista settimana resta uno scroll orizzontale da 848px** (misura di a.1) e **ogni** giorno della settimana è raggiungibile **senza scorrere in orizzontale** (`reachable()` con `elementFromPoint` su tutti e 7, `scrollLeft === 0`). Il conteggio per giorno resta quello di oggi (`weekChips` filtrati, `schedule.tsx:531-537`) e il tocco su un giorno porta alla sua vista giorno preservando `?page` (contratto crosstalk 6.4 M1, guardato da `bookings.spec.ts:1278-1335`). **Verifica**: e2e a 375px — 7 giorni tutti `reachable()` con `scrollLeft === 0` (è **il lato che la regola libera**: oggi `mobile-primitives`-style l'ultimo è `false`, `bookings.spec.ts:868`); il test 848-883 riscritto al valore nuovo, con commento che spiega perché il valore vecchio non è più corretto.

5. **(Lista prenotazioni a card + sheet decisionale ⟨Q4⟩)** A ≤640px `.students` è `display:none` **misurato** e ogni prenotazione è una card `.mobile-row` (**un solo `<button>`**, figli `<span>`, nessun elemento interattivo annidato, `min-height` ≥44px, nome accessibile parlante) con: pilota, sub mono `marche · data · orario`, `Badge` di stato. Il tocco apre il `BottomSheet` con **parità informativa** verso la riga desktop (pilota, inizio, fine, velivolo, stato, istruttore, note, e il **motivo del rifiuto** su una DENIED) e le azioni ammesse dallo stesso gate del desktop (`canManageAny` / `isOwnRow`, `bookings-table.tsx:174-178` e 363-411) secondo ⟨Q4⟩. Il **rifiuto** raccoglie il motivo obbligatorio come `secondStep` **dentro lo stesso sheet** (R-15.2-a), con la **stessa validazione client di oggi** (submit vuoto ⇒ errore inline e **zero richieste di rete**) e la stessa gestione di `conflict` (409) e `stale` (422 `BOOKING_TRANSITION_INVALID` — review 15.3 F2: sullo `stale` lo sheet **si chiude** e la lista si aggiorna). L'**annullamento** conserva la conferma in due passi. Toast e `router.refresh()` identici al desktop; **nessuna logica di rete duplicata** (si riusa `postBookingTransition`). **Verifica**: e2e su fixture propria — approva dal telefono e verifica lo stato **rileggendolo dall'API filtrata sul velivolo run-unique** (mai "la card ha N righe": trappola 12.11 F1 / Billing-2 F4 / 15.3 classe C); nega con motivo vuoto ⇒ errore inline provato con `page.route`/`waitForRequest` (l'assenza di toast **non** basta); nega con motivo ⇒ toast + stato DENIED + motivo leggibile; annulla con conferma; apertura dello sheet **da tastiera** (Tab + Enter).

6. **(Filtri di stato e `?status` ⟨Q5⟩)** Secondo ⟨Q5⟩. Se il filtro passa: `?status` è sanificato con lo stesso pattern difensivo di `?view`/`?date` (`page.tsx:63-84`: valore ignoto ⇒ default, **mai** un errore), il filtro **attraversa la paginazione** (ogni href lo preserva, come già fa con `?view`/`?date`, `bookings-table.tsx:262-271`) e **gli href di export lo rispecchiano** (`page.tsx:267-274` è la regola già scritta: "l'export riflette gli STESSI filtri della lista"). Il deep link `/dashboard/bookings?status=PENDING` della coda mobile della Panoramica (`mobile-pending-bookings.tsx:224`) **filtra davvero**. **Verifica**: e2e — dalla home mobile, tocco sul footer della coda → la lista contiene solo righe PENDING (asserito sulle **righe**, non solo sull'URL: l'asserzione attuale di `mobile-overview-overflow.spec.ts:127` è cieca, classe F8); unit sulla sanificazione (valore ignoto, vuoto, lista, maiuscole).

7. **(Form a tutto schermo — R3, parità di comportamento)** A ≤640px, nei due form prenotazione: il pannello occupa **tutto** il viewport (già 15.2), la testata resta fissa, e l'azione primaria è **fissa in basso** (`.so-actions` su `new-booking-form.tsx:568` e `edit-booking-form.tsx:221`, AD-6) con bottoni `flex:1; min-height:44px`. **Tutti** i comportamenti elencati in a.5 restano identici: 3 forme di form, validazione per-campo, 409 mai confuso col 422, `EXPIRED_DOCUMENTS` coi nomi, **"Forza prenotazione" 7.4 col motivo obbligatorio e il re-invio del body identico**, success e success-con-warning, reset su ogni via di chiusura, bottoni dentro `<form>`. Il 422 `BOOKING_OUTSIDE_WINDOW` segue ⟨Q7⟩. I popover dei picker (z 65/66) restano **sopra** il pannello e **sopra** la barra sticky, interamente dentro il viewport. **Verifica misurata** a 375px, con la form aperta e i campi compilati: rect del pannello == rect del viewport (±1px); il bottone di submit è **hit-testabile senza scorrere** (`elementFromPoint` sul suo centro) col body in cima; apertura del picker Inizio → popover interamente dentro il viewport e il suo bottone di conferma hit-testabile (**mai `Escape` per chiuderlo** — chiude il pannello, review 14.3 F1); e2e del percorso force a 375px (blocco → sezione ambra → motivo → 201). A 1280px le tre grandezze desktop del pannello sono **identiche** al pre-diff (misura pre/post).

8. **(CTA "Nuova prenotazione" ⟨Q6⟩)** Secondo ⟨Q6⟩: posizione della CTA a ≤640px e chiusura (o no) del TD 14.6 F2 (`canCreate` è gated sul **permesso** mentre `createBooking` richiede un **profilo attivo**, `bookings.service.ts:490` — un pilota con profilo disattivato clicca e prende 403). **Verifica**: e2e con un attore pilota a profilo **disattivato** (il caso che il TD descrive) e con uno attivo; a ≤640px la CTA è `min-height` ≥44px e non è coperta dalla tab bar (AC 10).

9. **(Convenzione testid — nessun duplicato)** Desktop **invariati**: `schedule-section`, `calendar-heading`, `calendar-prev`, `calendar-next`, `schedule-date-pick`, `schedule-filter-toggle`, `schedule-filter-done`, `schedule-filter-aircraft-*`, `schedule-filter-instructor-*`, `calendar-view-day`, `calendar-view-week`, `schedule-aircraft-row`, `schedule-block`, `schedule-aog-block`, `schedule-week-day`, `schedule-week-day-count`, `bookings-list-section`, `bookings-pending-summary`, `new-booking-button`, `booking-row`, `booking-row-starts-at`, `booking-approve-action`, `booking-reject-action`, `booking-move-action`, `booking-flown-action`, `booking-noshow-action`, `booking-cancel-action`, `booking-cancel-confirm`, `booking-reopen-action`, `booking-deny-reason`, `booking-deny-error`, `booking-deny-submit`, `booking-page-prev`, `booking-page-next`, `booking-pagination-status`, `new-booking-form`, `move-booking-form`, `move-booking-save`, `booking-form-error`, `booking-form-success`, `booking-form-warning`, `force-booking-section`, `force-booking-reason`, `force-booking-error`, `force-booking-submit`, `force-booking-cancel`. Duplicati mobile col suffisso **`-mobile`** (`booking-row-mobile`, `booking-approve-action-mobile`, `booking-reject-action-mobile`, `booking-deny-reason-mobile`, `booking-deny-submit-mobile`, `booking-cancel-action-mobile`, `booking-cancel-confirm-mobile`, …); superfici solo-mobile col prefisso **`mobile-`** (`mobile-agenda`, `mobile-agenda-row`, `mobile-agenda-empty`, `mobile-agenda-now`, `mobile-tail-chips`, `mobile-tail-chip-<id>`, `mobile-bookings-list`, `mobile-status-chips` se ⟨Q5⟩ passa). Lo sheet resta `mobile-booking-sheet` e **un solo nodo** (AD-7). **Verifica**: un `page.getByTestId(id)` per **ciascuno** dei testid desktop elencati restituisce **esattamente 1** nodo a 375px **e** a 1280px, su `/dashboard/bookings` **e** su `/dashboard` (dove gli stessi due componenti sono embeddati); suite completa verde in strict mode.

10. **(Geometria e layering, con la tab bar della 15.1 presente)** A 375px e 390px, su `/dashboard/bookings`: nessun overflow orizzontale **di pagina** in `view=day` **e** in `view=week`; nessun controllo della pagina finisce sotto la tab bar (z 5) — hit-test `elementFromPoint` su **ogni** `.page a, .page button` visibile a fondo pagina, con lo stesso metodo di `mobile-shell.spec.ts:174-205` (che però gira sulla **home**: questa pagina non è coperta, il test va scritto qui); il bottom sheet (z 40) copre la tab bar con lo scrim; il pannello del form (z 50) la copre del tutto; i picker (65/66) restano sopra il pannello **e sopra `.so-actions`**; i toast (200) sopra tutto. **Verifica**: valori riportati nel record per ciascuna coppia, non giudizi visivi (lezioni 13.7/13.10/15.1).

11. **(Ogni regola nuova ha la sua guardia, provata discriminante — 15.1 F2/F3, 15.2 guardia cieca, 15.3 F8)** Il dev elenca nel record ogni regola CSS/comportamento introdotta per un difetto **misurato** e, per ciascuna, l'asserzione che la protegge. Minimo: (i) `display:none` degli alberi desktop (`.schedule`, `.week-grid`, `.students`) a ≤640px; (ii) `display:none` degli alberi mobile >640px; (iii) i 7 giorni **tutti raggiungibili senza scorrere** in vista settimana — cioè il lato che la regola **libera**, non "la griglia esiste"; (iv) `.so-actions`: il submit hit-testabile **senza scorrere** con la form piena — di nuovo il lato liberato, non "il bottone esiste"; (v) marcatore ORA presente/assente nei tre casi dell'AC 3; (vi) empty state di ogni lista = **un solo** nodo (`toHaveCount(1)`, non `toBeVisible()`); (vii) il selettore delle regole nuove **non raggiunge** il piede del `SlideOver` (lezione 15.3 F1: misurare la larghezza dei bottoni del pannello pre/post). Ognuna va **provata discriminante** simulando il pre-fix col repo **intatto** (iniezione CSS / `addInitScript`; se il difetto è JS, **rebuild** — lezione 15.2): il test deve diventare **rosso**. Se una regola non è proteggibile con un'asserzione sensata, va detto e motivato, mai lasciata muta.

12. **(Invarianti)** Desktop >640px **invariato** su **entrambe** le pagine che rendono questi componenti (`/dashboard/bookings` **e** `/dashboard`, lezione 15.3 claim 3): misura pre/post a **1280px, 800px e 641px** (R1: a 641px il rail 64px resta) su geometria di `.page`, `.page-head`, le due `.card` e i loro `.card-head`, `.schedule`, `.week-grid`, `.students`, e sul pannello `SlideOver` aperto. `npm run gates` verde; **nessuna dipendenza nuova**; **nessun token esistente cambia valore**, nessun literal di colore nuovo; ogni stringa nuova in **entrambi** i locale; contrasto delle superfici nuove **misurato** (canvas→WCAG) ≥4.5:1 (testo) / ≥3:1 (oggetti grafici: bordo di riga, pallino ORA, chip) in tema chiaro **e** scuro; gate finale = **suite completa `CI=1` su build di produzione, DB fresco**, lanciata con `scripts/e2e.sh start` e letta con `scripts/e2e.sh status` (`export JOBS_SECRET=<non-placeholder>` prima del run).

---

## Blast radius (enumerato — il dev lo chiuda voce per voce nel record)

**e2e che possono rompersi** (righe in §b):
1. `e2e/bookings.spec.ts` — **il file più esposto dell'epic**: 34 test, 22 navigazioni su questa pagina. Tre test a 375px sono nel percorso diretto: **813-846** deve restare verde **senza modifiche** (è la prova che AD-2 regge); **848-883** e **885-923** si rompono per costruzione se Q1 passa e vanno **riscritti al valore corretto** (mai indeboliti — lezione 14.6), con commento sul perché il valore vecchio non è più giusto. Gli altri 31 girano a 1280px: si rompono **solo** per testid duplicato o errore SSR.
2. `e2e/home-dashboard.spec.ts:228-267` — `getByTestId('booking-row')` **page-level sulla home**, dove `bookings-table.tsx` è embeddato: **la causa di rottura n.1** se l'albero mobile riusa un testid desktop.
3. `e2e/mobile-shell.spec.ts:145-172` — 390px su questa pagina con `?view=week&date=…`: rompe se la pagina normalizza/aggiunge query param o se il render mobile solleva.
4. `e2e/shell-misc.spec.ts:53-58` — stesso contratto di query, viewport desktop.
5. `e2e/pdf-exports.spec.ts:374-380` — `bookings-list-section` + `booking-row` + menu Esporta.
6. `e2e/datetime-picker.spec.ts:132/177/197` — i picker dentro `new-booking-form`; la barra sticky nuova è geometria nuova sotto di loro.
7. `e2e/mobile-overview-overflow.spec.ts:113-127` — se Q5 passa, va **esteso** (oggi asserisce solo l'URL: cieco per costruzione).
8. `e2e/booking-window.spec.ts` — sede di ogni test nuovo sulla finestra (project serializzato).
9. `movements`, `login`, `flights`, `user-management`, `account-adjustments`, `ppr-queue`, `home-dashboard` — passano dalla home, che embedda **entrambi** i componenti toccati: un errore SSR/hydration li rompe **tutti insieme**. È il primo segnale da guardare se la suite crolla.

**Unit**: nessun test copre `page.tsx`. I nuovi sono quelli delle funzioni pure di AD-5. Se il dev tocca `CalendarDayBlock`, `lib/booking-schedule.ts` ha già i suoi test: sono la guardia.

**Cosa può rompersi senza che un test lo veda** (da verificare a mano e riportare):
- il **tablet 641-900px**: nessuna regola di questa story deve toccarlo (R1) — misurare a 800px e 641px che nulla di nuovo compaia e che il rail resti 64px;
- il **tema scuro** delle superfici nuove — il bordo colorato di riga e il pallino ORA sono oggetti grafici su fondo `--panel`: 13.9 ha già trovato 5 cause radice token-level, e la review 15.3 ne ha trovato una **su un gemello che nessuno aveva misurato** (`.list-icon.green` a 1.24:1). **Enumerare gli esemplari, non fidarsi dell'elenco;**
- la **Panoramica** a ogni larghezza (i due componenti sono embeddati lì): verifica visiva + misura;
- il **flusso force 7.4** con la barra sticky: il bottone "Forza prenotazione" della sezione ambra è **sotto** la barra primaria (AD-6) — misurare se resta raggiungibile.

---

## Piano di test

**Dove vivono i test nuovi**
- **Spec nuovo `e2e/mobile-planning.spec.ts`**, project `chromium` `fullyParallel`, `setViewportSize` **dentro il test** (pattern 13.10; nessun project Playwright duplicato — decisione di epic, riesame in 15.10). Copre: chip, agenda, marcatore, vista settimana, lista a card, sheet decisionale, geometria/layering, form a tutto schermo.
- **Test che scrivono stato GLOBALE**: se Q7 passa (messaggio dedicato per `BOOKING_OUTSIDE_WINDOW`), il test che lo prova **entra in `e2e/booking-window.spec.ts`**, dentro il suo `describe.serial`, nel project serializzato `booking-window` che **già** ripristina la finestra permissiva in `afterAll`. **Non** si crea un project nuovo e **non** si scrive `sched.*` dal project `fullyParallel`: è la regola di CLAUDE.md, ed è il TD ancora aperto su `reports.spec.ts:307-315`.
- **Modifiche a spec esistenti**: `bookings.spec.ts:848-883` e `885-923` riscritti al valore nuovo (con commento); `mobile-overview-overflow.spec.ts` esteso se Q5 passa. Ogni riscrittura va **motivata nel record** e non deve ridurre la copertura (lezione 14.6).
- **Unit nuovi** in `src/lib/*.test.ts` per le funzioni pure di AD-5, verificati anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.

**Regole di isolamento non negoziabili**
- Ogni test crea le **proprie** fixture (velivolo, persona, prenotazioni) e asserisce **solo** su quelle, filtrando per targa/cognome run-unique. **Mai** un conteggio globale con uguaglianza ("l'agenda ha 3 righe"): sotto `fullyParallel` flaka per costruzione (12.11 F1, Billing-2 F4, e la classe C dei 13 rossi della 15.3).
- Le fixture stanno **dentro 07:00-21:00 Roma**: un altro spec (`reports.spec.ts:307-315`, TD aperto) può aver lasciato quella finestra globale, e ogni creazione fuori orario prende 422 `BOOKING_OUTSIDE_WINDOW` (già successo alla 15.3).
- La fixture "a cavallo di adesso" si crea **nel futuro** e si **sposta** su adesso con un `PATCH` da staff: `createBooking` rifiuta `startsAt <= now` per tutti (`BOOKING_IN_PAST`), `updateBooking` esenta lo staff — asimmetria già usata e documentata dalla 15.3. Nessuno `sleep`, nessun test appeso all'orologio.
- Attori: la pagina è aperta a **tutti** (`bookings.manage.any` OR `bookings.manage.own` OR `self.read`, `page.tsx:123-128`) e la forma del form cambia con il ruolo. La verifica multi-attore **non è opzionale** (lezione 15.1 F1): admin, istruttore, pilota, allievo — almeno l'agenda, la lista e il gate della CTA per ciascuno, con `page.context().clearCookies()` fra un'identità e l'altra.

**Guardie DISCRIMINANTI** (la guardia va scritta sul lato che la regola ha LIBERATO)
- Vista settimana: **non** "la griglia esiste" — l'asserzione è **tutti e 7** i giorni `reachable()` con `scrollLeft === 0`. Discriminanza: oggi, con la griglia, il 7° è `reachable() === false` (`bookings.spec.ts:868` lo asserisce già).
- Barra `.so-actions`: **non** "il bottone esiste" — è "il submit è hit-testabile col body in cima e la form piena". Discriminanza: rimuovendo la classe a runtime il test diventa rosso.
- Sostituzione degli alberi: asserire **entrambi** i lati (desktop `none` + mobile visibile a 375px; l'inverso a 1280px). Un solo lato lascia passare "ho nascosto tutto".
- Ordine delle superfici mobile: asserzione d'**ordine intero**, mai a prefisso (lezione 15.3 F8).
- Selettori nuovi: misurare la larghezza dei bottoni del piede del `SlideOver` pre/post (lezione 15.3 F1).
- Ogni guardia va provata rossa contro una simulazione del pre-fix col repo **intatto**.

**Gate finale**: `npm run gates` + **suite completa `CI=1` su build di produzione con DB fresco**, via `scripts/e2e.sh start` (mai `playwright test` in foreground), esito letto con `scripts/e2e.sh status` (sentinella `E2E_EXIT`). Se il dev non la completa, la **review la riesegue da arbitro** (prassi 13.9/13.11/15.2/15.3).

---

## Contesto (puntatori)

- Piano epic 15 (R1-R5 + architettura, VINCOLANTI): `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md`.
- Story precedenti, da leggere per intero: `15-1-shell-mobile.md` (convenzione testid, mappa z-index, F1-F3), `15-2-primitive-mobile.md` (API delle primitive, R-15.2-a..g, guardia cieca, prova per rebuild), `15-3-panoramica-mobile.md` (**Review Record in fondo**: guardie non cieche, "desktop invariato" non basta, il gemello va misurato) e `15-3-review-report.md`.
- Consumer di riferimento da leggere prima di scrivere: `src/app/[locale]/dashboard/mobile-booking-list.tsx`, `mobile-pending-bookings.tsx`, `src/app/[locale]/dashboard/ppr/ppr-console.tsx`.
- Template locale: percorso in testa (fonte remota raggiungibile solo dalla sessione principale via `DesignSync`).
- Regole ambiente e ciclo per story: `docs/handoffs/HANDOFF.md` (DB fresco solo dalla sessione principale, `JOBS_SECRET` da esportare, MCP Playwright non raggiungibile dai subagent → fallback sanzionato: script `playwright-core` throwaway lanciati dalla root con Chromium `~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`, mai committati, **mai** `playwright install`).
- **Skill obbligatorie dev**: `karpathy-guidelines` + `design-taste-frontend` + `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"` — utile su "mobile agenda list", "filter chips horizontal scroll", "mobile form sticky action bar", "timeline mobile alternative").
- Modello: **Opus 5 xhigh** per dev e per eventuali fix-subagent (regola utente 2026-07-29). ⚠️ `.claude/agents/dev-story.md` ha `model: sonnet` nel frontmatter: **passare `model:'opus'` esplicitamente al dispatch**. Review adversarial: `adversarial-reviewer` Opus 5 xhigh — ⚠️ quel tipo di agent **non ha il tool di messaggistica**: concederglielo o mettere in conto di leggere il transcript (trappola 15.2).
- Commit: `feat(15.4): pianificazione mobile — agenda voli di oggi, chip marche, marcatore ORA, lista a card, form a tutto schermo` — Co-Authored-By col modello che ha scritto il codice.

## Fuori scope dichiarato

- **Export XLS/PDF nel linguaggio mobile** → 15.8 (R-15.2-c). L'`ExportMenu` resta quello di oggi nella testata della card, funzionante.
- **Flotta, Piloti, Istruttori, scheda persona** → 15.5; **Registro voli** → 15.6; **Scadenze/Transiti** → 15.7; **aree self e `/ppr` pubblico** → 15.9.
- **Barra d'azione fissa su `pilot-editor`/`instructor-editor`** (2 e 3 form nello stesso pannello) → 15.5, TD ratificato R-15.2-g. Qui si toccano **solo** i due form prenotazione.
- **Focus trap** e `aria-modal` su sheet e pannelli, dark-pass e a11y-pass completi, riesame del "project mobile" Playwright, `viewport-fit=cover` (TD di epic) → **15.10**. La baseline di tastiera resta quella della 15.1 (focus al pannello, ritorno al trigger, Escape).
- **METAR nella fascia 641-900px** (TD aperto), **tetto `OPTIONS_PAGE_SIZE = 100`** dei picker (TD aperto, non causato qui), **`home-dashboard.spec.ts:228`** e **`billing.spec.ts:296`** (TD di fragilità e2e pre-esistenti): non si chiudono di straforo in questa story.
- **`reports.spec.ts:307-315`** (PUT scheduling globale dal project parallelo): TD aperto, owner backlog. Questa story ne **subisce** l'effetto (fixture dentro 07:00-21:00) ma non lo chiude, a meno che il PO non decida diversamente.
- Qualunque modifica alle API, agli schemi Zod o al dominio. Le sole modifiche server ammesse sono quelle che le ratifiche approvano esplicitamente (lettura di `?status`, lettura del profilo attivo per la CTA).

---
---

# RATIFICHE PO — CHIUSE il 2026-07-30, PRIMA del dispatch al dev

Le nove assunzioni sotto sono state poste al PO in tre giri di `AskUserQuestion` e **chiuse tutte
sulla raccomandazione del teammate story** (una con una precisazione: R-15.4-f). Valgono come
vincoli: il dev le implementa così, non le ridiscute.

| # | Ratifica | Decisione del PO |
|---|---|---|
| **R-15.4-a** | Timeline a ≤640px | **Giorno → agenda; settimana → lista verticale di 7 giorni** (nome, numero, conteggio movimenti, tocco → vista giorno), riusando `weekDates`/`weekChips` già in pagina. Nessun dato nuovo dal server. I 2 e2e coinvolti (`bookings.spec.ts:848`, `:885`) si **riscrivono al valore corretto, mai indeboliti** (lezione 14.6): `:848` diventa più forte — da "il 7° giorno è raggiungibile DOPO uno scroll" a "tutti e 7 raggiungibili SENZA scorrere". |
| **R-15.4-b** | Marcatore ORA | **Marcatore mobile completo ("ORA · HH:MM") E riparazione del desktop**: `data-time={formatWallClock(now)}` su `.now-line`. È una **deviazione ratificata** da "desktop invariato": la pillola `--accent` oggi è **vuota** (`content === '""'`, 12px, misurato a 375 e 1280px) perché il CSS legge un attributo che nessuno scrive. Il cambiamento visivo desktop (12px → ~40px) va **misurato pre/post** e dichiarato nel record, non nascosto. |
| **R-15.4-c** | Filtri della timeline | **Chip marche + popover conservato**, sincronizzati sulla **stessa** fonte di verità (`filterAircraftId`): mai un secondo stato. Nessuna perdita del filtro istruttore (che esiste solo con `bookings.read.names`, fix privacy 14.5 F1) e la guardia di geometria `bookings.spec.ts:813-846` resta **intatta**. |
| **R-15.4-d** | Azioni nello sheet della lista | **Parità completa** con la riga desktop (tutte le azioni ammesse da stato+permesso), **ma "Modifica" CHIUDE prima lo sheet** e apre il pannello a tutto schermo dalla lista, tornando alla lista. Niente pannello z50 impilato su sheet z40: è una geometria mai misurata in questo repo, e le sovrapposizioni nuove sono dove l'epic ha già trovato difetti. Rifiuta e Annulla usano il `secondStep` (motivo obbligatorio / conferma). |
| **R-15.4-e** | Filtro di stato della lista | **`?status` letto e sanificato server-side** (pattern di `?view`/`?date`) **+ chip di stato nella lista mobile**. Chiude il deep link rotto introdotto dal fix 15.3 F3 (`?status=PENDING` oggi atterra sulla lista completa, e l'e2e asserisce solo l'URL: la suite non lo vede). Il filtro deve attraversare **paginazione ed export**. **DOM desktop invariato.** |
| **R-15.4-f** | CTA "Nuova prenotazione" | **Full-width sotto la testata** a ≤640px (linguaggio R-15.3-d) **+ TD 14.6 F2 CHIUSO**: `canCreate` richiede anche il **profilo attivo**. **Precisazione esplicita del PO: chi non ha il profilo necessario NON DEVE VEDERE il bottone** — nascosto, non disabilitato, mai mostrato-e-poi-403. Il caso "profilo disattivato" va testato (regola multi-attore, lezione 15.1 F1). |
| **R-15.4-g** | 422 `BOOKING_OUTSIDE_WINDOW` | **Messaggio dedicato che DICE la finestra** (i valori sono già in pagina), in **entrambi** i locale, su creazione **e** modifica. Cambia un **testo** anche sul desktop (non il layout): deviazione consapevole da dichiarare nel record. Il test vive in `booking-window.spec.ts` (project **serializzato**). |
| **R-15.4-h** | Velivoli AOG | **Righe AOG in TESTA all'agenda**, una per velivolo fuori servizio, motivo come sub, bordo `--bad`. "Quale velivolo non vola oggi e perché" è la prima cosa utile a chi apre la pagina dal piazzale, ed è ciò che il desktop già mostra. Derivazione con **funzione pura + unit test**. |
| **R-15.4-i** | Stati in agenda | **APPROVED-only, badge = fase** (`dayPhaseOf`): l'agenda è "cosa è programmato", la lista sotto è "cosa c'è da decidere". Coerente con la timeline desktop (12.2 AC 4) e col template; **zero query nuove**. Divergere dal desktop sullo **stesso dato** è ciò che l'epic evita da R-15.2-d. |

---

# ASSUNZIONI DA RATIFICARE COL PO — **PRIMA** del dispatch al dev

> **CHIUSE — v. la tabella qui sopra.** Il testo che segue resta come istruttoria (fatti misurati,
> opzioni scartate e motivi): serve al dev e al reviewer per capire *perché* una decisione è quella
> e non un'altra, e al PO se in futuro vorrà rivederla.

> Regola di progetto (retro Epic 9, `sprint-status.yaml` AI-2): un'assumption si ratifica **prima** di implementare, mai "da confermare" dentro il codice. Ogni domanda porta il **fatto misurato** che la genera, le **opzioni** e la **raccomandazione motivata** del teammate story.

### Q1 — Che fine fa la timeline a ≤640px (giorno **e** settimana)?

**Fatto** (a.1, misurato a 375px): la vista giorno è una griglia `min-width:1000px` dentro uno scroll orizzontale (`scrollWidth` **1094px** su 317 visibili, **777px** nascosti), di cui **160px** sono la colonna delle marche: si vedono ~2 ore su 16. La vista settimana è 848px su 317 (**531px** nascosti): ~2,5 giorni su 7. Il template **non ha una timeline**: ha un'agenda, e **non ha affatto** una vista settimana. R4 vieta "griglia desktop scrollabile" come stato finale.

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Giorno → agenda; settimana → lista verticale di 7 giorni** (una riga per giorno: nome, numero, conteggio movimenti, tocco → vista giorno), riusando `weekDates`/`weekChips` già calcolati | R2 (la settimana la progetta il team); 2 e2e da riscrivere (`bookings.spec.ts:848`, `885`); nessun dato nuovo dal server |
| B | Giorno → agenda; **settimana → invariata** (resta lo scroll orizzontale a 848px) | 1 solo e2e da riscrivere; ma lascia in piedi esattamente ciò che R4 vieta |
| C | Giorno → agenda; **il toggle giorno/settimana sparisce a ≤640px** (mobile = solo giorno) | il più semplice; **perdita di funzionalità** su mobile, contro R4 |
| D | Agenda **in aggiunta** alla timeline (entrambe visibili) | zero e2e rotti; ma raddoppia il contenuto e non toglie lo scroll orizzontale: peggiora la pagina |

**Raccomandazione: A.** È l'unica che rispetta R4 su entrambe le viste, non perde niente (il tocco su un giorno porta alla sua agenda, che è più informativa delle barrette decorative di `.wd-bars`) e usa dati già in pagina. Il costo — due e2e riscritti — è esattamente il tipo di aggiornamento che la lezione 14.6 prescrive (al valore **corretto**, mai indebolito), e uno dei due (`848`) diventa perfino più forte: da "il 7° giorno è raggiungibile **dopo** uno scroll" a "tutti e 7 sono raggiungibili **senza** scorrere".

### Q2 — Marcatore ORA: e la pillola vuota del desktop?

**Fatto** (a.2, misurato): `.now-line::before` stampa `content: attr(data-time)` (`airops.css:567`) ma `schedule.tsx:479` non scrive mai `data-time` — misurato `content === '""'`, larghezza **12px**, a 375px **e** a 1280px: sulla timeline desktop galleggia da sempre una pillola `--accent` **vuota**. Il template mobile vuole "ORA · 10:52" con l'ora vera.

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | Marcatore mobile completo ("ORA · HH:MM"); **desktop invariato**, pillola vuota tracciata come TD | zero rischio desktop; ma lascia in piedi un difetto visibile sulla superficie che stiamo portando |
| B | Marcatore mobile completo **+ una riga sul desktop**: `data-time={formatWallClock(now)}` su `.now-line` | 1 attributo; **cambia visivamente il desktop** (da pillola vuota 12px a "10:52" ~40px) ⇒ va ratificato, non fatto di nascosto; chiude il difetto dove è nato |
| C | Nessun marcatore su mobile (agenda senza "adesso") | perde il contenuto più utile del template su una schermata operativa |

**Raccomandazione: B, con la ratifica esplicita del cambiamento desktop.** È una riga, ripara un difetto misurato sulla stessa superficie, e la misura pre/post dell'AC 12 lo documenta invece di nasconderlo. Se il PO preferisce l'intangibilità assoluta del desktop in questa story, **A** è accettabile e il TD va aperto subito.

### Q3 — I filtri della timeline su mobile: chip, popover, o entrambi?

**Fatto** (a.4): oggi ci sono **due** filtri client-side dentro un popover (`schedule-filter-toggle`): marche e istruttore. Il gruppo istruttore esiste **solo** per chi ha `bookings.read.names` (fix privacy 14.5 F1: era un oracolo di de-anonimizzazione). Il popover è già clampato a 375px ed è guardato da `bookings.spec.ts:813-846`. Il template mostra **solo** una strip di chip marche.

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Chip marche + popover conservato** (stesso stato: chip e popover restano sincronizzati) | zero feature loss, `bookings.spec.ts:813` intatto; due affordance per lo stesso filtro (accettabile: rapido vs completo) |
| B | Chip marche **+ chip istruttore** (seconda strip, solo se `instructors.length > 0`), popover nascosto ≤640px | più fedele al template; **fa sparire una guardia e2e** (813 gira a 375px sul popover) e va riscritta |
| C | Solo chip marche, popover nascosto ≤640px | **perde il filtro istruttore su mobile** ⇒ contro R4 |
| D | Nessun chip, solo il popover di oggi | il più economico; ignora il template |

**Raccomandazione: A.** Costo minimo, nessuna perdita, nessuna guardia distrutta, e i chip aggiungono l'affordance rapida del template senza inventare una seconda fonte di verità (lo stato è uno solo, `filterAircraftId`). **B** è la scelta "più template", ma paga la riscrittura di una guardia di geometria che oggi ci protegge da una classe di difetti già vista due volte (13.7 F4, 13.10).

### Q4 — Quali azioni nello sheet della lista, e dove si conferma l'annullamento?

**Fatto** (`bookings-table.tsx:342-414`): la riga desktop offre fino a **7** azioni gated da stato+permesso — Approva, Rifiuta (mini-modal col motivo obbligatorio), Modifica (apre un `SlideOver`), Effettuato, Assente, Annulla (conferma in due passi inline), Riapri. R-15.2-b/R-15.3-b hanno stabilito che su mobile **la decisione vive solo nello sheet**. Sette bottoni `flex:1` non stanno in una riga a 375px.

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Parità completa**: tutte le azioni ammesse nello sheet, riga che va a capo (`flex-wrap`), primaria = Approva (o Modifica sulle APPROVED); Rifiuta e Annulla usano il `secondStep` (motivo / conferma); Modifica apre il pannello a tutto schermo **sopra** lo sheet (z 50 > 40) e alla chiusura torna alla lista | massima fedeltà funzionale; 2 `secondStep` diversi + una sovrapposizione pannello-su-sheet da verificare |
| B | Parità **meno Modifica** (che resta desktop-only) | evita overlay-su-overlay; **perde una funzione** su mobile ⇒ contro R4 |
| C | Solo Approva/Rifiuta su mobile, il resto desktop-only | perdita netta, contro R4 |
| D | Parità completa **ma Modifica chiude prima lo sheet** e apre il pannello dalla lista | niente overlay-su-overlay, niente perdita; il ritorno porta alla lista, non al dettaglio |

**Raccomandazione: D.** Ha la parità di A senza impilare un pannello z50 sopra uno sheet z40 (che funziona, ma è una geometria che nessuno in questo repo ha ancora misurato, e la lezione ricorrente dell'epic è che le sovrapposizioni nuove nascondono difetti). Il "torna alla lista invece che al dettaglio" è anche il comportamento che il desktop ha già: dopo un Salva, `router.refresh()` e la riga aggiornata nella lista.

### Q5 — Il filtro di stato della lista: si implementa `?status`?

**Fatto** (a.4, Scoperta 1): la coda mobile della Panoramica linka **`/dashboard/bookings?status=PENDING`** (`mobile-pending-bookings.tsx:224`, fix di review 15.3 F3), ma `bookings/page.tsx` **non legge `status`** (righe 26-29): il link atterra sulla lista completa. `mobile-overview-overflow.spec.ts:127` asserisce **solo l'URL**, quindi il difetto è invisibile alla suite. La lista non ha **nessun** filtro, né su mobile né su desktop.

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **`?status` sanificato server-side** (pattern di `?view`/`?date`) + **chip di stato su mobile**; desktop: nessun controllo nuovo, ma l'URL funziona per tutti | chiude il deep link rotto; il filtro attraversa paginazione ed **export** (regola `page.tsx:267-274`); DOM desktop invariato |
| B | Come A **+ il filtro anche sul desktop** (select nella testata della card) | il più coerente a lungo termine; **cambia il desktop**, fuori dal mandato "desktop invariato" |
| C | Filtro **client-side solo mobile** sulle 20 righe della pagina corrente | non chiude il deep link e **mente**: filtra una pagina, non la lista |
| D | Niente: il deep link resta un no-op | lascia in piedi un difetto introdotto dalla 15.3, su una superficie che questa story riscrive |

**Raccomandazione: A.** È il minimo onesto: il contratto URL vale per tutti (anche per una futura app Flutter, che è il motivo per cui le API sono REST-first), i chip danno alla lista mobile il filtro che R4 chiede, e il desktop non cambia di un pixel. **B** resta la scelta giusta per una story futura che possa toccare il desktop.

### Q6 — La CTA "Nuova prenotazione": dove va su mobile, e si chiude il TD 14.6 F2?

**Fatto**: la CTA sta nella **testata della card** (`bookings-table.tsx:284-288`), che a 375px va a capo (misurato: `.card-head` 92px contro 64px a 1280px). Ed è gated su `canCreate = canManageAny || canManageOwn` (`page.tsx:130`), mentre `createBooking` pretende un **profilo attivo** (`bookings.service.ts:490`: "Only a licensed pilot or an active instructor may book"): un pilota col profilo disattivato **vede il bottone e prende 403**. È il TD 14.6 F2, aperto in `sprint-status.yaml`, e la landing della home è già stata allineata (usa `activePilotLicenseType !== null`, `dashboard/page.tsx:671-672`). Il dato serve: `getMe(actor)` (`me.service.ts`) lo restituisce già ed è **una sola query**.

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | CTA **full-width sotto la testata** della card a ≤640px (pattern template 415 / R-15.3-d) **+ chiusura del TD**: `canCreate` richiede anche il profilo attivo per i modi `pilot`/`instructor` | 1 query in più; chiude un TD sulla superficie che stiamo riscrivendo; coerente con la home |
| B | CTA full-width sotto la testata, **TD non chiuso** | zero rischio; lascia il bottone che porta a un 403 |
| C | CTA nella testata, invariata (va a capo) | nessun lavoro; testata a 92px con due controlli schiacciati |
| D | CTA in un FAB flottante | non esiste nel template né nell'app; introdurrebbe un pattern nuovo e un conflitto con la tab bar |

**Raccomandazione: A.** La CTA full-width è già il linguaggio ratificato dalla 15.3 (R-15.3-d) e il TD costa una query su una pagina che ne fa già otto. Chiuderlo **qui** è più economico che riaprire il file fra tre story — e il test del caso "profilo disattivato" è un caso multi-attore che la lezione 15.1 F1 impone comunque di scrivere.

### Q7 — Il 422 `BOOKING_OUTSIDE_WINDOW` merita un messaggio suo?

**Fatto** (a.5, Scoperta 3): `bookings.service.ts:336/349` risponde 422 `BOOKING_OUTSIDE_WINDOW` quando la prenotazione cade fuori da `sched.openTime/closeTime` o oltre `maxAdvanceDays`; `new-booking-form.tsx:294-323` non ha un ramo per quel codice ⇒ l'utente legge **"Impossibile creare la prenotazione. Riprova."** Riprovare non serve a niente: l'orario è fuori finestra. Il brief chiede esplicitamente che il form mobile "preservi" questo comportamento.

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | Messaggio dedicato in **entrambi** i locale, che **dica la finestra** (i valori sono già in pagina: `page.tsx:208-209`), su creazione **e** modifica | 2 stringhe × 2 locale + 1 ramo per form; cambia un **testo** anche sul desktop (non il layout); il test vive in `booking-window.spec.ts` (serializzato) |
| B | Messaggio dedicato **senza** i valori della finestra ("Orario fuori dall'orario di apertura del campo") | più semplice, non espone la configurazione; meno utile |
| C | Si lascia il generico | "preserva il comportamento" alla lettera; conserva il messaggio meno utile dell'app su una pagina mobile |

**Raccomandazione: A.** È il tipo di difetto che si vede solo dal telefono (dove l'utente non ha le Impostazioni a un clic) e costa due stringhe. Il cambiamento di testo sul desktop va dichiarato nel record come deviazione consapevole da "desktop invariato" — che nel mandato dell'epic significa "nessuna regressione di layout/comportamento", non "nessun messaggio d'errore può migliorare".

### Q8 — I velivoli AOG entrano nell'agenda?

**Fatto**: il template **li mette in agenda** (righe `f.kind === 'aog'`, titolo "I-XXXX fuori servizio", sub "manutenzione non programmata", bordo `--bad`). Nell'app un AOG è uno **stato del velivolo** (`OUT_OF_SERVICE` + `statusReason`), reso oggi come blocco a tutta larghezza sulla riga di quel velivolo (`schedule.tsx:481-486`, `schedule-aog-block`). In un'agenda ordinata per orario, **un AOG non ha un orario**.

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Righe AOG in testa all'agenda**, prima dei movimenti, una per velivolo fuori servizio, con il motivo come sub e il bordo `--bad` | conserva l'informazione che il desktop dà; l'ordinamento resta onesto (fuori-orario in testa) |
| B | AOG **solo nel sub della testata** ("N AOG"), come fa la Panoramica | compatto; perde il **quale** e il **perché** |
| C | Niente AOG su mobile | perdita netta rispetto al desktop ⇒ contro R4 |
| D | Righe AOG in **coda** all'agenda | meno visibili proprio quando contano (chi pianifica guarda prima cosa non vola) |

**Raccomandazione: A.** "Quale velivolo non vola oggi e perché" è la prima cosa che serve a chi apre questa pagina dal piazzale, ed è esattamente ciò che il desktop mostra. Il costo è una funzione pura in più (AD-5) con i suoi unit test.

### Q9 — L'agenda mostra solo le APPROVATE, o anche le PENDING del giorno?

**Fatto**: `listCalendarBookings` è **APPROVED-only** per decisione 12.2 AC 4 (`bookings.service.ts:714`: "a cancelled or not-yet-approved booking has no slot to show here"), quindi la timeline desktop non mostra le PENDING. La lista sotto, invece, mostra **tutti** gli stati su una finestra di 48h+futuro. Se l'agenda restasse APPROVED-only, il chip di stato sarebbe la **fase** (in programma / in corso / completato) — che è esattamente ciò che il template mostra.

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **APPROVED-only, badge = fase** (`dayPhaseOf`) — l'agenda è "cosa è programmato", la lista sotto è "cosa c'è da decidere" | coerente con la timeline desktop e col template; zero query nuove; il badge dice qualcosa di vero |
| B | APPROVED + PENDING, badge = **stato** per le pending e fase per le approvate | l'agenda mostra tutto il giorno; **diverge dalla timeline desktop** a parità di dati, e serve una seconda query (o un secondo filtro sulle righe di lista, che hanno una finestra diversa) |
| C | Tutti gli stati del giorno | l'agenda si riempie di annullate e rifiutate: rumore |

**Raccomandazione: A.** Divergere dal desktop sullo **stesso dato** è la cosa che l'epic ha evitato in ogni story (è il motivo di R-15.2-d). La coda delle pending ha già la sua sede — la lista sotto, e la card della Panoramica — e il badge di fase è l'unico che aggiunge informazione a un'agenda ordinata per orario.

---
---

# Dev Agent Record (dev-15-4, Opus 5 xhigh — 2026-07-31)

Status: **review**. Gates verdi, spec nuovo verde (10/10), due e2e riscritti verdi,
`booking-window` verde (4/4), `mobile-overview-overflow` verde (1/1). La suite COMPLETA
non è stata eseguita: il DB di sviluppo è saturo per colpa di questa sessione (§9) e la
sua ripulitura è riservata alla sessione principale.

## 1. Verifica della ricognizione (conferme e correzioni, numerate)

**Confermate sul codice (misurate o lette riga per riga):**

1. **a.2 — la pillola ORA è vuota**: `grep -rn "data-time" src/` restituisce **una sola**
   occorrenza (il CSS, `airops.css:567`). Misurato a runtime PRE-fix su `/dashboard/bookings`
   **e** su `/dashboard`, a 1280/800/641px: `content === '""'`, larghezza **12px**. Confermato.
2. **a.4 Scoperta 1 — `?status` non è letto**: `PageProps.searchParams` era
   `{ page?, view?, date? }`. Confermato.
3. **a.5 Scoperta 2 — `.so-actions` mancante sui due form prenotazione**: presente solo in
   `manual-ppr-form.tsx:345` e `fleet/aircraft-editor.tsx:605`. Confermato.
4. **a.5 Scoperta 3 — nessun ramo `BOOKING_OUTSIDE_WINDOW`** nei due form. Confermato.
5. **a.3 — `listCalendarBookings` è APPROVED-only** (`bookings.service.ts:713`). Confermato.
6. **TD 14.6 F2** — `createBooking` esige un profilo attivo sul percorso self
   (`ForbiddenError`, "Only a licensed pilot or an active instructor may book"), mentre
   `canCreate` guardava solo il permesso. Confermato.
7. **a.6 — `.mobile-row*`/`.mobile-row-timed` sono la griglia `46px 1fr auto` del template**
   e il `BottomSheet` garantisce **uno sheet alla volta** (token d'istanza, `mobile-sheet.tsx:55`).
   Confermato e riusato.
8. **§b — `bookings.spec.ts:813-846` (clamp dei due popover a 375px) resta verde SENZA
   modifiche**: rieseguito, verde. È la prova che AD-2 (testata unica) regge.
9. **§b — `home-dashboard.spec.ts:228` usa `booking-row` page-level**: confermato; l'albero
   mobile usa `booking-row-mobile` (match ESATTO in `getByTestId`, nessuna collisione).

**Correzioni (la ricognizione sbagliava o era incompleta):**

1. **`weekDates[].href` NON porta alla vista giorno.** La ricognizione e l'AC 4 danno per
   scontato che "il tocco su un giorno porta alla sua vista giorno"; il commento di
   `page.tsx:249` lo afferma. In realtà `calendarHref` eredita `view` corrente
   (`overrides.view ?? view`), quindi l'href di una cella di settimana è
   `?view=week&date=…`: sul desktop sposta l'ancora DENTRO la settimana. Sul telefono
   sarebbe stato un vicolo cieco (la lista dei 7 giorni ricaricava se stessa). Le righe
   mobile usano quindi `buildDateHref(dateOnly, 'day', listPage, today, listStatus)`.
   **Desktop invariato** (la cella `.week-day` continua a comportarsi come prima).
2. **`updateBooking` NON ricontrolla la finestra di prenotazione.**
   `assertWithinSchedulingWindow` è chiamata solo da `createBooking` (:538) e dal
   `PENDING→APPROVED` di `transitionBooking` (:1121). R-15.4-g chiede il messaggio "su
   creazione **e** modifica": il ramo è stato aggiunto a **entrambi** i form, ma sul
   percorso di modifica **non è raggiungibile oggi** (misurato: PATCH fuori finestra → 200).
   Non ho aggiunto il controllo server: è fuori dallo scope dichiarato della story. TD in §10.
3. **Non esiste `GET /api/v1/bookings/{id}`** (solo PATCH): gli e2e leggono lo stato dalla
   lista filtrata per `aircraftId`. Inoltre `listBookings` senza `?status` è **APPROVED-only**
   (`bookings.service.ts:633`) — un dettaglio che rende cieca qualsiasi verifica di
   DENIED/CANCELLED fatta senza passare gli stati.
4. **`aircraftOptions` include i velivoli OUT_OF_SERVICE** (serve all'agenda AOG) — vero,
   ma l'endpoint per metterli AOG è `POST /api/v1/aircraft/{id}/out-of-service` (`{reason}`),
   non uno `/status`: la prima stesura delle mie misure non produceva righe AOG per questo.

## 2. Riepilogo per AC

| AC | Esito | Prova |
|---|---|---|
| 1 chip marche + conteggio | fatto | `mobile-tail-chips` (Tutti + N velivoli, `chip.count() === popover.count() + 1`), min-height 44px misurata, strip `overflow-x:auto` che scorre da sé (page overflow 0), chip↔popover sulla **stessa** `filterAircraftId` (asserito nei due versi), conteggio `mobile-agenda-count` = movimenti dopo il filtro |
| 2 agenda del giorno | fatto | `.schedule` `display:none` misurato; 3 righe run-unique con le tre fasi **nell'ordine intero** `['completato','in corso','in programma']`; AOG in testa (indice < primo movimento); unit test sui confini |
| 3 marcatore ORA | fatto | `toHaveCount(1)`, testo `\bORA · \d{2}:\d{2}\b`, ordine `[riga, ORA, riga]`, 0 marcatori su una data ≠ oggi; unit test dei 4 casi |
| 4 settimana ≤640px | fatto | `.week-grid` nascosta; 7 righe tutte raggiungibili con `scrollLeft === 0` e **scroll di pagina verticale** (v. §5 per la discriminanza); href senza `view=week` |
| 5 lista a card + sheet | fatto | card = 1 `<button>` senza figli interattivi, ≥44px; apertura **da tastiera**; rifiuto vuoto ⇒ 0 richieste di rete misurate; rifiuto con motivo ⇒ DENIED + motivo riletti **dall'API**; riapri/approva/annulla idem; `stale` chiude lo sheet |
| 6 `?status` | fatto | chip di stato, sanificazione pura + unit test (ignoto/vuoto/lista/minuscole), filtro che attraversa paginazione, export **e** navigazione calendario; `mobile-overview-overflow` esteso alle RIGHE |
| 7 form a tutto schermo | fatto | pannello == viewport (375×812 e 375×560), `.so-actions` sticky, submit hit-testabile con `scrollTop 0` su un viewport dove il corpo **scorre davvero** (49px di overflow), picker z 66 sopra la barra e dentro il viewport |
| 8 CTA | fatto | full-width 281×44 sotto la testata; pilota con profilo **disattivato** ⇒ bottone **assente** (e2e multi-attore, profilo ripristinato in `finally`) |
| 9 testid | fatto | 11 testid desktop `toHaveCount(1)` a 375 **e** 1280, su `/dashboard/bookings` **e** `/dashboard`; alberi mobile `toBeHidden()` a 1280 |
| 10 geometria/layering | fatto | overflow di pagina 0 a 375 e 390 in giorno **e** settimana; 0 controlli su 105 intersecano la tab bar; sheet 40 < pannello 50 < picker 65/66 |
| 11 guardie discriminanti | fatto | tabella §5 (7 regole, 6 provate rosse per iniezione, 1 provata strutturalmente) |
| 12 invarianti | fatto | §7: unica differenza desktop = la pillola ORA ratificata; contrasti §6; gates verdi |

## 3. File toccati

- `src/lib/mobile-agenda.ts` (**nuovo**) + `src/lib/mobile-agenda.test.ts` (**nuovo**, 15 test)
- `src/lib/booking-status-filter.ts` (**nuovo**) + `src/lib/booking-status-filter.test.ts` (**nuovo**, 8 test)
- `src/app/[locale]/dashboard/bookings/page.tsx` — `?status`, `canCreateNew`, righe agenda, `nowTime`, messaggio finestra
- `src/app/[locale]/dashboard/bookings/schedule.tsx` — albero mobile (chip, agenda, marcatore, settimana, sheet) + `data-time`
- `src/app/[locale]/dashboard/bookings/bookings-table.tsx` — albero mobile (chip di stato, card, sheet decisionale), `canCreateNew`, `?status` negli href
- `src/app/[locale]/dashboard/bookings/booking-labels.ts` — `buildSchedulingWindowSummary`, label mobile
- `src/app/[locale]/dashboard/bookings/new-booking-form.tsx` / `edit-booking-form.tsx` — `.so-actions` + ramo `BOOKING_OUTSIDE_WINDOW`
- `src/app/[locale]/dashboard/page.tsx` — prop nuove (la home monta gli stessi due componenti)
- `src/styles/airops.css` — blocco `pianificazione mobile (story 15.4)` in coda + `.mobile-row-t2` (§6)
- `messages/it.json` / `messages/en.json` — chiavi nuove nei DUE locale
- `e2e/mobile-planning.spec.ts` (**nuovo**, 10 test), `e2e/bookings.spec.ts` (2 test riscritti),
  `e2e/booking-window.spec.ts` (1 test nuovo), `e2e/mobile-overview-overflow.spec.ts` (asserzione estesa)

## 4. Decisioni non ovvie

1. **La tail chip NON compare nella riga d'agenda** (sta nel sub, come il template, riga 145).
   Misurato a 375px con la chip nel titolo: il nome del pilota veniva troncato a **una
   lettera** ("P…"), perché il titolo divide 1fr con la chip **e** il badge dopo la colonna
   orari da 46px. Le card della LISTA (senza colonna orari) tengono la chip, com'è in 15.3.
2. **`canCreate` non cambia significato**: è ancora "questo attore può aprire un form" e
   monta i due pannelli. La CTA passa da `canCreateNew` (permesso **+** profilo attivo).
   Cambiare `canCreate` avrebbe smontato l'`EditBookingForm` di un pilota disattivato,
   togliendogli la "Modifica" sulle proprie righe: una regressione, non il TD.
3. **La query in più per il profilo si paga solo dove serve**: `getMe` è chiamata solo per
   `!canManageAny && canManageOwn && ownInstructorProfileId === null`.
4. **`?status` canonicalizzato**: la funzione pura restituisce `param` (l'eco per gli href).
   "Tutti e sei gli stati" ⇒ `param: null`, così l'URL di default resta pulito.
5. **Le righe AOG sono bottoni** come le altre: il sheet mostra il motivo **intero**, che
   nella riga è troncato con ellissi. Un solo modello d'interazione, nessun `cursor` finto.
6. **`.bottom-sheet-actions` con base 50%**: `flex: 1` (15.2) non manda mai a capo (base 0 ⇒
   gli item si comprimono), e questo sheet arriva a **quattro** decisioni. Misurato sui due
   gemelli esistenti (coda PPR e coda pending): identici al pixel, v. §7.
7. **`?status` non passa dalla paginazione quando si CAMBIA filtro** (i chip azzerano `?page`):
   pagina 7 di un altro insieme non significa niente; il server la clamperebbe lasciando un
   URL che mente.

## 5. Regola nuova → guardia → prova di DISCRIMINANZA

Simulazioni fatte sul repo **intatto** (iniezione CSS/DOM sulla build di produzione).

| # | Regola (difetto misurato) | Guardia | Verde ora | Simulando il pre-fix |
|---|---|---|---|---|
| i | `.schedule`/`.students` `display:none` ≤640px (erano 1094px e 938px di scroll orizzontale in 317px) | `mobile-planning`: `.schedule`/`.students` `toBeHidden()` + albero mobile visibile | ✅ | `.schedule-desktop-body{display:block}` → **rosso** |
| ii | alberi mobile `display:none` >640px | a 1280px `mobile-agenda`/`mobile-bookings-list` `toBeHidden()` | ✅ | `.schedule-mobile{display:block}` → **rosso** |
| iii | settimana = lista verticale (erano 848px, 7° giorno irraggiungibile) | `bookings.spec` riscritto: **tutti e 7** raggiungibili, `scrollLeft === 0` | ✅ | `.week-grid{display:grid}` + mobile `none` → **rosso** |
| iv | `.so-actions` sui due form (l'azione primaria non era fissa) | submit hit-testabile con `scrollTop === 0` su viewport 375×560 dove il corpo **scorre** | ✅ | `.so-actions{position:static}` → **rosso** |
| v | marcatore ORA solo oggi e solo se c'è un movimento futuro | 1 marcatore oggi, **0** su data ≠ oggi, ordine `[riga, ORA, riga]` | ✅ | nodo `mobile-agenda-now` iniettato sulla pagina di domani → **rosso** |
| vi | empty state = UN nodo | `toHaveCount(1)` su `mobile-agenda-empty` | ✅ | secondo nodo iniettato → **rosso** |
| vii | il selettore della CTA non raggiunge il piede del `SlideOver` (lezione 15.3 F1) | i bottoni del pannello misurano 164px contro i 281px della CTA full-width; `.bookings-head [data-testid=new-booking-form]` non esiste (il form **non** è discendente della testata) | ✅ | strutturale: nessun selettore di questa story può raggiungerlo, i pannelli sono montati in fondo alla card |

⚠️ **La guardia (iii) era CIECA nella prima stesura** e l'ho scoperta con questa procedura:
usava `el.scrollIntoView({block:'center'})`, che scrolla anche il contenitore orizzontale
più vicino (`inline: 'nearest'`) e trascinava dentro la cella clippata della `.week-grid`
— **misurato: 7/7 "raggiungibili" anche col pre-fix**. Sostituita con uno scroll di pagina
verticale esplicito (`window.scrollTo`), che lascia intatto lo scroll orizzontale. È la
stessa classe della trappola `.click()`→`scrollIntoViewIfNeeded` di review 13.7 F2.

## 6. Contrasto misurato (canvas → WCAG), tema chiaro **e** scuro

Superfici nuove, `--panel` come sfondo. Testo ≥4.5:1, oggetti grafici ≥3:1.

| elemento | chiaro | scuro |
|---|---|---|
| titolo riga (`.mobile-row-name`) | 18.79 | 15.74 |
| orario inizio (`.mobile-row-t1`) | 18.79 | 15.74 |
| **orario fine (`.mobile-row-t2`)** | **4.85** (era 3.66) | **5.72** (era 4.14) |
| sub riga (`.mobile-row-sub`) | 4.85 | 5.72 |
| chip marche attiva / inattiva | 17.99 / 18.79 | 17.00 / 15.74 |
| chip marche di riga (`.mobile-row-tail`) | 17.01 | 17.67 |
| etichetta ORA su `--accent-soft` | 11.13 | 9.74 |
| **pallino ORA** su `--accent-soft` | **11.13** (era **1.76**) | **9.74** (era 7.23) |
| bordi di riga (ok / accent / info / bad) | 6.74 / 5.04 / 4.01 / 6.26 (erano 2.73 / 2.04 / 3.61 / 3.96) | 8.79-11.53 |
| badge di fase (completato/in corso/in programma) + AOG | 8.38-11.32 | 7.46-9.57 |

Tre correzioni di colore, **senza token nuovi né literal nuovi**:
- **pallino ORA** `--accent` → `--accent-ink`: ambra su ambra misurava **1.76:1** in chiaro
  (la classe di difetto del gemello `.list-icon.green` trovata dalla review 15.3);
- **bordi di riga** `var(--X)` → `color-mix(in oklch, var(--X) 70%, var(--ink))`: due dei
  quattro erano sotto 3:1 in chiaro. Il mix con `--ink` migliora **entrambi** i temi;
- **`.mobile-row-t2`** `--ink-4` → `--ink-3`: `--ink-4` è calibrato (13.9) su una soglia di
  **3:1** — giusta per un'intestazione di tabella, non per del TESTO. ⚠️ **Deviazione
  dichiarata**: la classe è condivisa con la lista "La mia giornata" della 15.3 (unico altro
  consumer), che ne beneficia con lo stesso numero; è un cambio di **solo colore**, nessuna
  geometria (verificato: nessuna differenza nelle misure pre/post di §7).
- **Non conforme e dichiarato**: `--accent-soft` della striscia ORA contro `--panel` misura
  **1.16 / 1.38**. È uno sfondo, non un oggetto grafico portatore d'informazione (il pallino
  e il testo sopra lo sono, e stanno a 9.74-11.13): non rientra in 1.4.11.

## 7. Misura pre/post delle DUE deviazioni ratificate

Metodo: build PRE (stash) e build POST misurate sugli **stessi dati** (nessun seed fra le due
— il primo confronto era contaminato dal volume creato dalle mie stesse misure, e l'ho
rifatto). 1280/800/641px × `/dashboard/bookings`, `?view=week`, `/dashboard`.

**Risultato: 18 differenze in totale, TUTTE la pillola ORA.**

| misura | PRE | POST |
|---|---|---|
| `.now-line::before` `content` | `""` | `"10:36"` |
| `.now-line` `data-time` | assente | `10:36` |
| larghezza pillola | **12px** | **41.66px** |

Invariati al pixel (0 differenze): `.page`, `.page-head`, le due `.card` e le due `.card-head`,
`.schedule`, `.week-grid`, `.students`, il rail (64px a 641px), il pannello `SlideOver` aperto
(x 760, w 520, h 900), la sua riga d'azione (y 394, h 35, `position: static`), le larghezze dei
suoi bottoni (68 / 90) e il `padding-bottom` di `.so-body` (18px) — su **entrambe** le pagine.

**Seconda deviazione (R-15.4-g), il testo del 422** — cambia su desktop e mobile:
- PRE: «Impossibile creare la prenotazione. Riprova.»
- POST: «Orario fuori dalla finestra di prenotazione (campo aperto 14:00–18:00, prenotabile
  fino a 3650 giorni in anticipo).» (valori dalle impostazioni reali della pagina)

**Terzo gemello misurato (non richiesto, ma è dove la 15.3 si è fatta male)** — i due sheet
esistenti, a 375px, con la nuova base flex: coda pending e coda PPR, bottoni
`[{w:166.5,h:44,top:689,left:17},{w:166.5,h:44,top:689,left:192}]` **identici** con e senza
la dichiarazione nuova (simulazione `flex-basis:0` iniettata a runtime).

## 8. Blast radius, voce per voce

1. `bookings.spec.ts` — **813-846 verde senza modifiche** (prova di AD-2). **848-883** e
   **885-923** riscritti al valore nuovo (verdi), con il commento sul perché il vecchio non è
   più corretto. Gli altri test del file: v. §9.
2. `home-dashboard.spec.ts:228` — `booking-row` page-level: nessuna collisione
   (`getByTestId` è match esatto; il mobile usa `booking-row-mobile`). Asserito anche
   nel test AC 9 (`/dashboard`: `mobile-bookings-list` **hidden**, testid desktop = 1 nodo).
3. `mobile-shell.spec.ts:145-172` — la pagina non aggiunge né normalizza query param quando
   `?status` è assente (`param: null` ⇒ nessuna chiave): contratto URL invariato.
4. `shell-misc.spec.ts:53-58` — idem.
5. `pdf-exports.spec.ts:374-380` — `bookings-list-section`/`booking-row` intatti; l'href di
   export ora rispecchia `?status` (assente ⇒ stringa identica a prima).
6. `datetime-picker.spec.ts` — misurato a 375×560 con la barra sticky: popover z 66 dentro il
   viewport, bottone di conferma hit-testabile (scorrendo il **suo** scrollbox, metodo 13.7 F2).
7. `mobile-overview-overflow.spec.ts` — esteso alle righe: verde (1/1).
8. `booking-window.spec.ts` — test nuovo dentro il project serializzato: verde (4/4).
9. `movements/login/flights/user-management/...` — nessun errore SSR/hydration: la home
   renderizza (misurata a 375/641/800/1280) e i suoi testid restano unici.

**Fasce non coperte da test, verificate a mano**: 641px e 800px (nessuna regola nuova si
attiva, rail 64px invariato, misure in §7); tema scuro (§6); Panoramica a tutte le larghezze
(§7); flusso force 7.4 — il bottone "Forza prenotazione" resta nella sezione ambra che
**scorre** (nessuna seconda barra sticky, AD-6), raggiungibile scorrendo il corpo.

## 9. Esito ONESTO della suite

Eseguito con `scripts/e2e.sh start` + `status` (mai in foreground), su build di produzione
riusata (`E2E_REUSE_SERVER=1`), `JOBS_SECRET` esportato.

| run | esito |
|---|---|
| `e2e/mobile-planning.spec.ts` (nuovo) | **E2E_EXIT=0 — 10/10 verdi** |
| `e2e/booking-window.spec.ts --project=booking-window` | **E2E_EXIT=0 — 4/4 verdi** |
| `e2e/mobile-overview-overflow.spec.ts --project=mobile-overview-overflow` | **E2E_EXIT=0 — 1/1 verde** |
| `e2e/bookings.spec.ts` (intero) | **E2E_EXIT=1 — 24 verdi, 10 rossi** |
| `npm run gates` | **verde** (lint, typecheck, 1654 test unit, build) |

**I 10 rossi di `bookings.spec.ts`: diagnosi provata, nessuno attribuibile a questa story.**

- **7 test** falliscono su `getByTestId('booking-row').filter({hasText: <targa>})` dopo una
  creazione riuscita. Causa **misurata**: la lista è `startsAt asc` su 20 righe per pagina e
  il DB di sviluppo contiene ora **150 prenotazioni tutte dentro la finestra di 48h** →
  **8 pagine**. Prova diretta: creata una prenotazione a `now+10min` (lo slot che
  `soonestFutureSlot()` sceglie proprio per stare in cima) e cercata pagina per pagina →
  **trovata a pagina 2 di 8**. È esattamente la fragilità che il commento di
  `soonestFutureSlot` documenta ("this session's own repeated re-runs alone scattered enough
  near-term bookings to blow past `BOOKINGS_PAGE_SIZE`"). **Il volume l'ho creato io**, con
  gli script di misura e le riesecuzioni del ciclo dev.
- **3 test** (`timeline 7.2 AC 1` e simili) falliscono con **422 `BOOKING_OUTSIDE_WINDOW`**
  su una data 2040-2048 scelta da `runUniqueFutureDay()`. Causa **misurata**: il
  `PERMISSIVE_SCHEDULING` di `booking-window.spec.ts` lascia `maxAdvanceDays: 3650`
  (~10 anni) e quelle date stanno a 4900-8000 giorni. Prova diretta: `POST` per il
  2043-05-05 → `422 {"code":"BOOKING_OUTSIDE_WINDOW","message":"Booking cannot be made more
  than 3650 day(s) in advance."}`. È un'interazione cross-spec **pre-esistente**, che ho
  scoperto solo perché ho eseguito `booking-window` **prima** di `bookings.spec` (con
  `--no-deps`); nell'ordine reale della suite `chromium` gira prima, e su un DB fresco
  `maxAdvanceDays` è `null`.

⚠️ **Serve un reset del DB prima del gate finale** (150 prenotazioni, 131 velivoli, 8 pagine
di lista): non l'ho fatto io — è riservato alla sessione principale. Con DB fresco la suite
completa `CI=1` va rieseguita dall'arbitro (prassi 13.9/13.11/15.2/15.3).

## 10. Debito tecnico da tracciare

1. **`updateBooking` non ricontrolla la finestra di prenotazione** (`assertWithinSchedulingWindow`
   gira su create e su approve). Il ramo client c'è su entrambi i form (R-15.4-g), ma sul
   percorso "Sposta" non è raggiungibile: spostare fuori finestra risponde 200. Decisione PO.
2. **`runUniqueFutureDay()` (2040-2048) contro `maxAdvanceDays: 3650`**: 3 test di
   `bookings.spec.ts` sono rossi per costruzione appena `booking-window.spec.ts` ha girato
   una volta sullo stesso DB. Va deciso se il permissivo debba essere `maxAdvanceDays: null`.
3. **`reports.spec.ts:307-315`** (PUT scheduling globale dal project parallelo): TD aperto,
   subìto e non chiuso qui.
4. **Volume del DB di sviluppo**: le liste paginate rendono fragile ogni asserzione "riga in
   pagina 1". `findMobileCard`/`findBookingRow` sono il rimedio locale; il rimedio vero è il
   reset periodico.
5. **`.mobile-row-t2`**: se in futuro si vuole tornare a `--ink-4` sulle liste mobile, va
   fatto con un token nuovo per il testo quieto ≥4.5:1, non ripristinando 3.66:1.

## 11. Cosa NON ho fatto (dichiarato)

- **Non ho eseguito la suite completa `CI=1` su DB fresco**: il DB è saturo per colpa mia e
  il reset non è mio (§9). Ho eseguito per intero i file toccati e quelli nel percorso diretto.
- **Non ho aggiunto il controllo di finestra a `updateBooking`** (fuori scope, §10.1).
- **Non ho toccato il desktop** oltre alle due deviazioni ratificate (§7): in particolare la
  cella `.week-day` continua a restare in vista settimana (correzione 1 di §1).
- **Non ho generalizzato `.ppr-card*`** né toccato le primitive 15.2 oltre alla base flex
  della riga d'azione dello sheet (misurata identica sui due gemelli).
- **Non ho aggiunto focus trap / `aria-modal`** (15.10), né toccato l'export mobile (15.8).
- **Non ho committato** gli script di misura throwaway (vivono nello scratchpad di sessione).
