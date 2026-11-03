---
baseline_commit: cffc391
---

# Story 15.3: Panoramica mobile — KPI, "In corso ora", coda prenotazioni con decisione, feed Avvisi, card METAR; riconciliazione delle tre landing per-ruolo

Status: **draft — NON dispatchare al dev prima delle ratifiche PO** (sezione finale "Assunzioni da ratificare", Q1-Q8: la regola di progetto — retro Epic 9 — vieta di spedire un'assunzione "da confermare" dentro l'implementazione)

## Story

As a amministratore che apre AirManager dal telefono la mattina (hangar, piazzale, ufficio senza scrivania),
I want vedere in una schermata sola come sta il campo — numeri del giorno, chi è in movimento adesso, cosa devo approvare, cosa sta per scadere o è in rosso, e il meteo del campo — e poter decidere le prenotazioni in attesa senza aprire un'altra pagina,
so that la prima schermata dell'app è una console operativa vera anche su un telefono, non una pagina desktop rimpicciolita.

E, simmetricamente: **pilota, allievo e istruttore** aprono la LORO home nello stesso linguaggio (saluto, KPI, azione primaria, la loro lista di oggi, meteo) — la riconciliazione della landing per-ruolo della 12.12 col template richiesta dal bullet di piano.

**Riferimenti vincolanti**: piano epic 15 `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md` — **R1** (soglia 640px: 641-900px TENGONO il rail 64px della 13.10; nessuna regola di questa story esce dal `@media (max-width: 640px)`), **R2** (il template è incompleto by design: quello che non mostra — qui la schermata "Allievo", il motivo obbligatorio del rifiuto, l'ordinamento del feed Avvisi — lo progetta il team nello stesso linguaggio), **R3** (dettaglio-riga = **bottom sheet**; form = pannello a tutto schermo), **R4** (si porta TUTTO: nessuna superficie resta "tabella/griglia desktop scrollabile" come stato finale), **R5** (logout e lingua già nel menu profilo, 15.1 — non si toccano). Architettura vincolante: **componenti mobile dedicati + switch a media query CSS pura** (niente `matchMedia`, niente user-agent, niente route parallele), `display:none` VERO su entrambi gli alberi, ogni regola mobile **ADDITIVA**, **MAI** cambiare il valore di un token esistente, nessun literal di colore nuovo.

**Convenzione testid dell'epic** (fissata dalla 15.1, in CLAUDE.md e nel doc-comment di `mobile-nav.tsx`): i testid dell'albero **desktop non cambiano mai**; una superficie mobile che **DUPLICA** una desktop prende lo stesso nome col suffisso **`-mobile`**; una che esiste **SOLO** su mobile prende un nome nuovo col prefisso **`mobile-`**.

**Lezioni delle review 15.1/15.2 da NON ripetere**:
1. **Una guardia può essere cieca per costruzione** (15.2, KPI strip): quando una regola nuova SOSTITUISCE un vincolo, la guardia va scritta sul lato che la regola ha **LIBERATO**, non su quello che il vincolo già teneva. Qui il caso concreto è la griglia 2×2 di Q3: la guardia non è "la riga esiste", è "il 3° e il 4° KPI sono raggiungibili SENZA scorrere" (nella strip non lo erano — `mobile-primitives.spec.ts:195` asserisce proprio `last reachable === false`).
2. **I casi multi-attore vanno enumerati** (15.1 F1): questa story tocca **tutte e tre** le facce della home e quindi **quattro** ruoli (admin, istruttore, pilota, allievo). Nessuna verifica vale se fatta solo da admin.
3. **Il livello di prova più alto è la build reale** (15.2): la discriminanza di una guardia su comportamento JS si prova ricompilando, non iniettando CSS.

**Fonte visiva**: template `AirOps Mobile.dc.html` — copia locale di sessione in `/tmp/claude-1000/-home-admin-AirManager/35489d76-4a1d-401d-aa86-1f8ddb2722a3/scratchpad/AirOps-Mobile.dc.html` (lo scratchpad viene ripulito tra sessioni: se manca, la sessione principale lo riscarica con `DesignSync` dal progetto `dcd71b3a-dbcf-494e-a543-29325a5435de`; i subagent NON lo raggiungono). **Leggerlo davvero** prima di scrivere codice. Sezioni in scope:
- **righe 64-123 — `Admin · Panoramica`**: testata (titolo 23px/600 + sub 12px con pallino `--ok`), KPI strip a scroll-snap (69-77), card "In volo ora" (78-89: head = titolo 13.5px + "N attivi" mono; righe `1fr auto` con chip marche mono + titolo + sub mono + badge di stato), card "Prenotazioni in attesa" (90-105: head + righe con pilota/sub mono/id mono a destra + **riga azioni Approva/Nega** `flex:1 padding:7px` + **empty state** "Nessuna prenotazione da approvare."), card "Avvisi" (106-116: righe `30px 1fr` con quadratino icona colorato per tono + titolo 12.5px + sub mono), card "Meteo campo" (117-121: label mono uppercase + station a destra, temperatura 26px + pallino categoria + `VFR`, raw METAR in box `--bg-sunken` mono 11px `word-break:break-word`).
- **righe 402-431 — `Pilota · Home`**: saluto 23px + sub "Conto · … · saldo €480", **KPI grid `1fr 1fr`** (407-414, valore 19px — NON la strip), CTA "Prenota volo" **full-width** (415, solido `--ink`), card "I miei prossimi voli" (416-424), card Meteo (425-429).
- **righe 434-463 — `Istruttore · Oggi`**: saluto + sub, **KPI grid `1fr 1fr`** (439-446), card "La mia giornata" (447-456: righe `46px 1fr auto` — **colonna orari** mono con inizio 11.5px/600 e fine 10px `--ink-4`), card Meteo.
- **righe 584-601 — row-builder**: `{sub, title, badge, rows[], act?}` è la forma dell'API di `BottomSheet` già implementata in 15.2. `openBooking` (592) = rows Aeromobile, Istruttore, Inizio, Fine, Durata, Tipo + `act` solo se pending; `openFlight` (589) = Orario, Pilota, Istruttore, Aeromobile, Tipo.
- **NON si portano** (assunzioni accettate del piano): orologio in topbar, "Accedi come", il toggle tema nella topbar del template (in app vive già altrove).
- Il template **NON ha una schermata "Allievo"** → R2. Vedi però la ricognizione (a): in app l'allievo **condivide già** la faccia personale del pilota, quindi la R2 qui costa zero — non c'è una quarta schermata da inventare.

---

## Ricognizione (2026-07-30, teammate story — verificata su file e righe; il dev la **verifichi e CORREGGA** se sbaglia: la prassi ha pagato in 14.3/14.4/14.6/14.8/14.9, 15.1 e 15.2)

### a) La superficie reale: `src/app/[locale]/dashboard/page.tsx` (752 righe, TRE facce)

Gate delle facce (righe 109-122, doc-comment 73-95) — **non è il ruolo, sono permesso e profilo ATTIVO**:
1. `hasPermission(actor,'finance.manage')` → `renderAdminOverview` (151-433);
2. altrimenti `getOwnInstructorProfileId(actor) !== null` → `renderInstructorLanding` (536-644) — profilo **attivo**, non il ruolo (lezione 14.6 F2);
3. altrimenti `me.person !== null` → `renderPilotLanding` (648-752);
4. fallback difensivo (128-138) che nessun ruolo di seed raggiunge.

**Scoperta 1 — la schermata "Allievo" che il template non ha, in app ESISTE GIÀ**: pilota e allievo rendono **la stessa** `renderPilotLanding`; l'unica differenza è la CTA "Prenota volo", gated su `canBook` (671-672: permesso `bookings.manage.*` **E** `person.activePilotLicenseType !== null` — review 14.6 F2). `e2e/home-dashboard.spec.ts:167-176` lo asserisce esplicitamente. **R2 qui non chiede una schermata nuova: chiede di portare la stessa in linguaggio mobile.**

Composizione della faccia **admin** (300-431), voce per voce, con quello che il template mobile prevede al suo posto:

| # | Superficie desktop di oggi | riga | testid | Nel template mobile |
|---|---|---|---|---|
| 1 | `.page-head`: h1 `overview.title` + `.sub` (ICAO · N AOG · N PPR · N al suolo) + CTA `DispatchFlightButton` | 302-322 | `dispatch-flight-button` | testata 65-68 (+ CTA: **non c'è**, v. Q4) |
| 2 | `.kpi-row` con **5** KPI | 324-340 | `kpi-flights-today`, `kpi-fleet-available`, `kpi-ppr-pending`, `kpi-bookings-pending`, `kpi-revenue` | KPI strip 69-77 — **già implementata in 15.2 via CSS** |
| 3 | `<Schedule view="day">` — calendario del giorno | 342-359 | `schedule-section` | **assente** (è la schermata "Voli di oggi", 15.4) |
| 4 | `<BookingsTable>` — tabella 8 righe, tutti gli stati, azioni complete | 361-390 | `bookings-list-section`, `booking-row`, `booking-approve-action`, `booking-reject-action` | card "Prenotazioni in attesa" 90-105 |
| 5 | `.split` → `<ScadenzeWidget>` + `<FleetCard>` | 392-430 | `scadenze-widget`, `fleet-card-widget` | **assenti**: le scadenze confluiscono nel feed "Avvisi" 106-116; la flotta è la sua pagina (15.5) |
| — | *(nessuna)* | — | — | card "In volo ora" 78-89 — **NUOVA** |
| — | *(nessuna)* | — | — | card "Avvisi" 106-116 — **NUOVA** |
| — | *(nessuna in pagina; c'è nella sidebar)* | — | — | card "Meteo campo" 117-121 — **NUOVA in pagina** |

Faccia **istruttore** (577-643): `.page-head` (saluto + sub `{flightsToday} voli oggi · {owed} dovuti nel mese`) + CTA `instructor-landing-logbook-cta`; `.kpi-row` con **4** KPI (`kpi-hours-month`, `kpi-payout-rate`, `kpi-owed-month`, `kpi-flights-today`); card "La mia giornata" con righe `.list-item` a `44px 1fr auto auto` (icona / nome+marche / orario mono / `Badge` di fase) e empty state `instructor-landing-myday-empty`. **Combacia già col template 434-456** salvo: KPI grid 2×2 (Q3), colonna orari a sinistra invece che a destra, e la card meteo (Q6).

Faccia **pilota/allievo** (674-751): `.page-head` (saluto + `Conto · {balance}`) + 3 CTA (`pilot-landing-profile-cta`, `pilot-landing-logbook-cta`, `pilot-landing-book-cta` condizionale); `.kpi-row` con **4** KPI (`kpi-balance` — è un `<Link>` a `/dashboard/my-account` —, `kpi-license`, `kpi-medical`, `kpi-ratings`); card "I miei prossimi voli" (`pilot-landing-upcoming-row`, empty `pilot-landing-upcoming-empty`). **Combacia col template 402-424** salvo: KPI grid 2×2 (Q3), CTA full-width (Q4), card meteo (Q6).

### b) I dati REALI, voce per voce del bullet di piano — **dove il template mostra un dato che l'app non ha, è detto qui**

**b.1 — KPI strip: GIÀ FATTA, non è lavoro di questa story.**
`airops.css:1924-1973` (story 15.2, ratifica **R-15.2-f**): a ≤640px **ogni** `.kpi-row` dell'app è già una strip a `scroll-snap-type: x mandatory`, full-bleed (`margin-inline:-28px`, che è esattamente il padding di `.page`, 293-299), con `flex: 1 0 auto; min-width: 146px; max-width: 100%` sulle card e `.kpi-value` a 23px clampato a 2 righe. **Il bullet di piano "KPI strip" è quindi già soddisfatto per la faccia admin.** Quello che resta da decidere è solo se le facce a 4 KPI debbano invece avere la **griglia 2×2 del template** (Q3) — e i delta (Q7).

**b.2 — "In volo ora": il dato NON esiste. Va derivato, e il nome va cambiato.**
Prove:
- `prisma/schema.prisma:890-893`: `enum FlightStatus { REGISTERED, CANCELLED }` — **non esiste uno stato "in volo"**. Il volo si registra **dopo**, a posteriori, dal registro (`flights.service.ts#registerFlight`), con `takeoffTime`/`landingTime` già noti. Non c'è decollo/atterraggio in tempo reale, non c'è tracking, non c'è un "volo aperto".
- `enum BookingStatus` (1216-1223): `PENDING|APPROVED|DENIED|FLOWN|NO_SHOW|CANCELLED` — `FLOWN` è un passo **manuale** a posteriori (commento a `page.tsx:226-227`).
- L'unica nozione di "adesso" già calcolata in app è `dayPhaseOf(startsAt, endsAt, now)` (`page.tsx:530-534`): `inProgress` quando `now >= startsAt && now < endsAt`. La usa già la faccia istruttore, e l'etichetta i18n esiste: `instructorLanding.status.inProgress = "in corso"`.
- L'altra nozione di "adesso" è `deriveApprovedPprMovementStatus(eta, now) === 'AL_SUOLO'` (`lib/ppr-movement-status.ts:36-41`), già calcolata sulla Panoramica (`page.tsx:215`) per la sub-riga "N in transito al suolo": è un **ospite atterrato**, cioè il contrario di "in volo".
- Il dato di partenza è **già in pagina**: `calendarBookingsToday` (`page.tsx:199`, finestra `todayStart`→`tomorrowStart`) — nessuna query nuova serve.

⇒ **La card si può fare con dati veri, ma non si può chiamare "In volo ora"**: mostrerebbe prenotazioni in corso, non voli confermati in aria. Q1 decide semantica e titolo.

**b.3 — Coda prenotazioni con Approva/Nega: esiste, e "Nega" NON è un tap solo.**
- Endpoint unico: `POST /api/v1/bookings/{id}/transition` con `{to, reason?}` (`bookings-table.tsx:208-212`).
- `handleApprove` (228-233): transition → toast → `router.refresh()`. **Nessuna conferma**, come il PPR.
- **Il motivo del rifiuto è obbligatorio nel dominio**, non una scelta di UI: `bookings-table.tsx:257-259` blocca il submit vuoto senza chiamata di rete e `submitDeny` passa `reason`; lo schema (`lib/schemas/bookings.ts:242-250`) tiene `reason` opzionale a livello di tipo ma **obbligatorio per `to: 'DENIED'`** (commento esplicito alle righe 242-244). Il desktop lo raccoglie in una `.mini-modal` (`booking-deny-reason`, `booking-deny-error`, `booking-deny-submit`, righe 481-518).
⇒ **Un "Nega" inline sulla card non può completare l'azione**: apre comunque un secondo passo. È il fatto tecnico che pesa su Q2.
- Fonte righe: la card admin ha già `embedBookingsResult` (8 righe, TUTTI gli stati, `startsAt` ascendente — decisione PO 2026-07-26, `page.tsx:203-207`) e `embedPendingResult.total` (il conteggio PENDING nella stessa finestra, review 12.12 F3). Una card mobile "in attesa" filtra `status === 'PENDING'` su quelle righe: **zero query nuove**, ma il conteggio mostrato deve restare quello **della finestra** (`embedPendingResult.total`), non il totale all-time del KPI — la distinzione è già documentata a `page.tsx:364-367` ed è esattamente il difetto che la review 12.12 F3 aveva colto.

**b.4 — Feed "Avvisi": tre fonti reali, tutte verificate.**
1. **Scadenze**: `listAllExpiries(actor, {window:'60', pageSize:60})` — **già fetchate** (`page.tsx:208`, cap `EXPIRIES_WIDGET_SCAN_LIMIT = 60` con la nota review 12.12 F4 sui conteggi cappati). Urgenza e categoria si derivano con le funzioni PURE già condivise: `tierOf(daysUntilUtc(...))` e `categoryOf(typeName)` (`lib/expiry-status.ts`) — 0 = scaduto, 1 = ≤7g, 2 = ≤30g, 3 = ≤60g. `ScadenzeWidget` usa già le stesse.
2. **Saldi negativi**: `listNegativeBalances(actor)` (`accounts.service.ts:737-771`) — un solo `groupBy` con `having` + una join di nomi, ordinato **dal più negativo**, gate `finance.manage` (738), archiviati inclusi deliberatamente (review 3.3 F1: "archiviare non deve mai nascondere il debito"). Oggi la usa **solo** `/dashboard/billing` (`billing/page.tsx:93`). **È una query NUOVA sulla home** (costo: un `groupBy` + una `findMany`, da mettere nel `Promise.all` esistente).
   ⚠️ **Non confondere con `hasNegativeBalanceAlert`** (`accounts.service.ts:494`): quella è la funzione **puntuale** che decide se avvisare **al momento di un addebito** (saldo già in rosso O che finisce in rosso — estesa dal PO a ogni addebito, ratifica 14.4); **non** è una lista. Per un feed serve `listNegativeBalances`.
3. **PPR in attesa**: `pendingPprResult.total` — **già fetchato** (`page.tsx:194`) e già mostrato sia nella sub-riga sia nel KPI `kpi-ppr-pending`.
   Q5 decide composizione, ordine e tetto. Nota: la card "Avvisi" del template è **solo nella schermata admin**; il template **non** ne dà una a pilota/istruttore, e le loro scadenze personali sono già nei KPI `kpi-medical`/`kpi-ratings` (`page.tsx:659-663`) → **non inventarne una** per quelle facce.

**b.5 — METAR: il dato esiste, ma su mobile OGGI è INVISIBILE.**
- Servizio: `server/services/metar.service.ts` — `getMetar(station)` (131-145), cache **in-memory 10 minuti** keyed by station (38-42), **ogni errore degrada a `null`, mai un throw** (doc-comment 10-14). DTO: `{raw, tempC, windDir, windKt, visM, qnh, category: 'VFR'|'MVFR'|'IFR'}`.
- Station: `getMetarStation()` (`app-settings.service.ts`), configurabile in Impostazioni (`settings/club-card.tsx:167-184`, testid `club-metar-station-input`, `PUT /api/v1/settings/metar-station`) con **fallback all'ICAO** del campo (`settings/page.tsx:177-182`). Esiste anche `GET /api/v1/metar`.
- **Dove viene reso oggi**: `dashboard/layout.tsx:81-109` lo fetcha e lo passa a `<Sidebar metar={...}>`; `sidebar.tsx:100-122` rende `.weather-card`.
- **Scoperta 2 — su telefono E su tablet il meteo non si vede**: `.sidebar{display:none}` a ≤640px (`airops.css:1677`) **e** `.weather-card{display:none}` già a ≤900px (`airops.css:1439`, rail 64px della 13.10). `src/components/shell/mobile-top-bar.tsx` non contiene **zero** occorrenze di `metar`/`weather` (verificato con grep). Quindi la card METAR del template non è "un doppione del desktop": è l'**unico** modo di vedere il meteo sotto i 900px. Q6 decide da dove prende il dato e su quali facce compare (e traccia il buco 641-900px come TD, fuori scope R1).

**b.6 — Delta sotto i KPI: il template li INVENTA, l'app ne ha due veri.**
Template righe 74 + script 630-636: ogni KPI admin ha una terza riga (`"▲ 3 vs media"`, `"1 AOG · I-FOXT"`, `"più vecchia 6h fa"`, `"da approvare"`, `"+12,4% su mese prec."`). Di questi:
- **reale**: `"N AOG"` — `aogCount` è già calcolato (`page.tsx:214`) e già mostrato nella sub-riga;
- **reale**: la variazione sui ricavi — `getStats` restituisce una `series` mensile rolling a 6 mesi (`lib/schemas/stats.ts:52,109`), quindi il mese precedente è disponibile;
- **inventati**: "vs media" dei voli, "più vecchia 6h fa" dei PPR (l'età della richiesta più vecchia non è calcolata da nessuna parte), "da approvare" è una didascalia fissa.
Il componente `KPI` **ha già** le prop `delta`/`trend` (`components/ui/kpi.tsx:31-58`) e nessuna delle 9 `.kpi-row` dell'app le usa. ⚠️ **`KPI` è UN SOLO componente condiviso con il desktop**: aggiungere una riga delta si vede anche a 1280px. Q7.

### c) Le primitive della 15.2 da RIUSARE (API verificata sul codice, non sul record)

- **`src/components/ui/bottom-sheet.tsx`** (86 righe): `BottomSheet({open, onClose, testId, sub, title, badge?, rows: {k,v}[], actions?, secondStep?, closeLabel})`. Compone `MobileSheet`; il nome accessibile del dialog è `` `${sub} — ${title}` `` (riga 61). `secondStep` **sostituisce** righe+azioni+Chiudi nello **stesso** nodo dialog (ratifica R-15.2-a) — è già il meccanismo pronto per un motivo di rifiuto. `onClose` **deve essere referenzialmente stabile** (`useCallback`): `MobileSheet` ci basa l'effetto di focus (commento riga 37).
- **`src/components/ui/mobile-sheet.tsx`**: scrim (`<testId>-scrim`), `Escape` montato **solo da aperto**, focus al pannello e **ritorno al trigger**, `role="dialog"` + `aria-label`, z-index **40**. Deliberatamente **senza** `aria-modal`/focus-trap finché non arriva la 15.10.
- **Modalità full-screen di `SlideOver`** (`airops.css:1882-1915`): `left:0; width:100%`, entrata da `translateY`, `.so-actions` **sticky** con `.so-body:has(.so-actions){padding-bottom:0}`, `.so-foot .btn{min-height:44px}`. **In questa story non serve** (non si aprono form nuovi): la sola superficie che la usa è `DispatchFlightButton` → `FlightEditor`, già coperta dalla 15.2. Da NON toccare.
- **CSS della card mobile già esistente come modello**: `.ppr-card`/`.ppr-card-head`/`.ppr-card-main`/`.ppr-card-name`/`.ppr-card-sub`/`.ppr-card-side`/`.ppr-card-id` (`airops.css:1856-1874`) — **la card è UN solo `<button>`**, i figli sono `<span>` resi `display:block` (commento 1864-1865), niente `button` dentro `button`, `min-height:44px`. Le liste di questa story hanno la stessa forma: **valutare di generalizzare quei nomi** (es. `.mobile-card*`) invece di duplicarli sei volte — ma **solo se la generalizzazione non cambia una riga di resa del PPR** (verifica: diff dei computed style della coda PPR a 375px pre/post, deve essere vuoto). Se non è a costo zero, si duplicano con nomi propri e si dice perché.
- **Consumer di riferimento da leggere prima di scrivere**: `src/app/[locale]/dashboard/ppr/ppr-console.tsx` — doppio albero (`.ppr-queue-desktop` riga 303 / `.ppr-queue-mobile` riga 374), `sheetForId`/`sheetRejecting`/`rejectReason`/`rejectError` (128-131), `detailRows()`, azioni gated su `PENDING` (441), `secondStep` col motivo (~490-500).

### d) `src/styles/airops.css` — dove va la roba nuova e cosa NON toccare

- **Sezioni mobile esistenti**: shell 15.1 ai **1653-1787**, primitive 15.2 ai **1789-1981**. Le regole nuove vanno **in coda**, in un blocco proprio con commento di sezione `/* ---------- panoramica mobile (story 15.3) ---------- */`, sempre dentro `@media (max-width: 640px)` — **tranne** la riga `display:none` fuori-query per ogni albero mobile nuovo (precedente esatto: `.ppr-queue-mobile{display:none}` alla riga **1809**, motivata al 1806-1808: senza quella la suite desktop trova due match per ogni testo in pagina).
- **Mappa z-index in uso** (non introdurre valori nuovi senza una misura che li motivi): `.topbar`/`.mobile-topbar` 4 · `.mobile-tabbar` 5 · popover/typeahead 19/20/30 · `.mobile-sheet` **40** · `.slideover` **50** · `.mini-modal` **60** · popover portalati dei picker **65/66** · `.toast-host` **200** (a ≤640px sollevato a `calc(92px + env(...))`, riga 1687).
- **Riuso invece di colori nuovi**: Approva/Nega = `.btn.mini.ok` / `.btn.mini.bad` (**1151-1162**, con gli override dark `html[data-theme="dark"]` della 13.9 alle 1161-1162); primario solido = `.btn.primary` (**344-349**); toni del feed Avvisi = `Badge` (`components/ui/badge.tsx`) e/o le classi `.stat-tone-*` introdotte da Billing-2 — **misurare il contrasto**, non sceglierlo a occhio (lezione 13.9).
- **Classi condivise da NON usare come aggancio dello switch**: `.card`, `.split`, `.list`, `.list-item`, `.students`/`.student-row` (13 file). Lo switch va agganciato a **classi di pagina proprie** (precedente 15.1/15.2). `.split` (il contenitore Scadenze+Flotta, `page.tsx:392`) è usato anche altrove: se Q4 chiede di nasconderlo, si nasconde **una classe nuova messa su quel `div` specifico**, non `.split`.
- **`.page`** = `padding: 22px 28px 60px` a ogni larghezza (293-299) — è l'aritmetica su cui poggia il full-bleed della strip (`margin-inline:-28px`), ed è **asserita** da `mobile-primitives.spec.ts:188` (`.kpi-row` deve restare figlio DIRETTO di `.page`). **Qualunque wrapper nuovo attorno alla `.kpi-row` rompe quel test.**
- **`.page-head`** è `flex-wrap: wrap` a ≤640px (riga 1573, fix 13.10) — la testata **non va duplicata**: v. AD-3.

### e) e2e e unit — il campo minato preciso

**Spec che vivono sulla home (`/dashboard`)**:
| file | righe | cosa fa | rischio |
|---|---|---|---|
| `e2e/home-dashboard.spec.ts` | 136-148 | admin: `heading "Panoramica operativa"`, **5** `kpi-*`, `dispatch-flight-button`, `schedule-section`, `bookings-list-section`, `scadenze-widget`, `fleet-card-widget` — tutti `toBeVisible()` | gira a **viewport desktop**: `sharedUse` estende `devices['Desktop Chrome']` (`playwright.config.ts:13-19`), che porta `viewport 1280×720`, e nessun test lo cambia ⇒ nascondere quelle superfici a ≤640px NON lo tocca. **Ma un secondo nodo con lo stesso testid/heading lo rompe in strict mode a qualsiasi viewport** |
| " | 150-191 | pilota / allievo / istruttore: heading `^Ciao, ` / `^Buongiorno, `, i 4 `kpi-*` per faccia, `pilot-landing-*-cta`, `instructor-landing-logbook-cta`, `toHaveCount(0)` sulle CTA altrui | idem: **niente duplicati di heading, KPI e CTA** |
| " | 193-224 | istruttore disattivato: `kpi-payout-rate`/`instructor-landing-myday-empty`/heading `toHaveCount(0)` | un duplicato mobile farebbe fallire i `toHaveCount(0)` |
| " | 228-267 | crea una prenotazione PENDING e la cerca con `getByTestId('booking-row').filter({hasText: registration})`, legge `booking-row-starts-at` e `kpi-bookings-pending .kpi-value` | **`booking-row` NON va riusato dall'albero mobile** (convenzione `-mobile`); **`.kpi-value` deve restare uno per KPI** |
| `e2e/mobile-primitives.spec.ts` | 172-265 | **gira su `/it/dashboard` a 375px come admin**: `.kpi-row` è strip, `parentElement` è `.page`, `children.length >= 5`, **primo raggiungibile / ULTIMO NO**, wheel reale → `scrollLeft>0` → ultimo raggiungibile, niente overflow di pagina, non-clipping con valore lungo iniettato, tetto con valore lunghissimo, e a 1280px `display === 'grid'` | **il test più esposto della story**: qualunque wrapper attorno alla `.kpi-row` admin, qualunque KPI in meno, o un secondo `.kpi-row` prima di quella lo rompe. Se Q3 passa, la griglia 2×2 vale **solo** per le facce a 4 KPI (pilota/istruttore) e questo test — che è admin — resta verde: **va detto e va provato** |
| `e2e/mobile-shell.spec.ts` | 36-58, 113-133, 175-200 | admin e pilota a 375px su `/it/dashboard`: un solo landmark `navigation`, tab bar, sidebar/topbar nascoste; **bottom-geometry**: scorre a fondo pagina e hit-testa **ogni `.page a, .page button` visibile** verificando che la tab bar non ne inghiotta il centro | **ogni controllo nuovo della Panoramica mobile entra automaticamente in questo test**: card-trigger, Approva/Nega, link "Vedi tutte", CTA full-width |
| `e2e/pdf-exports.spec.ts` | 375 | `getByTestId('bookings-list-section')` | duplicato = rotto |
| `e2e/bookings.spec.ts` | 741, 780, 936 | `schedule-section` — ma su `/dashboard/bookings`, non sulla home | nessuno se non si tocca `schedule.tsx` |
| `movements`, `login`, `flights`, `user-management`, `account-adjustments`, `ppr-queue` | varie | passano da `/it/dashboard` per navigare | un errore SSR sulla home li rompe **tutti** |

**Unit**: `page.tsx` è un server component senza test. Le funzioni PURE che questa story introduce (derivazione "in corso", merge/ordinamento/tetto del feed Avvisi) **devono** stare in `src/lib/` con i loro `*.test.ts` — e per costruzione non importano servizi, quindi **non** trascinano `@/lib/env` (lezione a 3 occorrenze in CLAUDE.md). Verifica comunque in shell pulita: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.

**Stato globale**: questa story **non** scrive AppSettings → nessuno spec nuovo entra nella catena serializzata. Ma **decide prenotazioni**, quindi ogni test nuovo deve lavorare **solo su fixture proprie** e non asserire mai un **conteggio globale** con uguaglianza (lezione 12.11 F1 / review Billing-2 F4): `>= 1` filtrato sulla propria targa, mai "la card ha 3 righe".

### f) Convenzioni trasversali (CLAUDE.md, non ripeterle sbagliate)

`karpathy-guidelines` su ogni riga; `npm run gates` prima del commit (**mai** i 4 comandi separati); ogni stringa nuova in **entrambi** i locale (`messages/it.json` + `messages/en.json`); segnaposto riempiti lato client → **`t.raw`** (con `t()` next-intl rende la chiave: 3 occorrenze storiche); **MAI `Escape`** negli e2e per chiudere un popup dentro uno `SlideOver`; **MAI** `getByRole('link', {name})` page-level né `hasText` con valori H:MM/date per disambiguare righe; prima di attribuire un fallimento e2e al lock anti-brute-force TD-6, contare i `LoginAttempt` **falliti** (`login-throttle.ts:25` conta solo `succeeded=false` — lezione 15.2).

---

## Decisioni architetturali (motivate, vincolanti — non sono ratifiche PO, sono vincoli tecnici)

**AD-1 — Doppio markup con switch a classi di pagina proprie.** Le liste nuove della Panoramica mobile vivono in un albero proprio (`.overview-mobile`, `.landing-mobile`, o nomi equivalenti scelti dal dev), `display:none` **fuori** dalla media query e `display:block` dentro; le superfici desktop che il mobile sostituisce prendono una classe propria e vanno a `display:none` dentro la query. **Mai** agganciare lo switch a `.card`/`.split`/`.list`/`.students`. Precedente e motivazione: `airops.css:1806-1809` e `1851-1852`.

**AD-2 — Non si tocca `bookings-table.tsx`, né `schedule.tsx`, né `fleet-card.tsx`, né `scadenze-widget.tsx`.** Sono i componenti di `/dashboard/bookings` e `/dashboard/fleet`, che ricevono il loro linguaggio mobile in **15.4** e **15.5**: un albero mobile dentro `bookings-table.tsx` comparirebbe **anche là** e anticiperebbe il taglio di due story. La card mobile "Prenotazioni in attesa" è un **componente nuovo** della cartella `dashboard/`. Per non duplicare la rete, la chiamata di transizione (`POST /api/v1/bookings/{id}/transition`, `bookings-table.tsx:207-226`) va estratta in un modulo condiviso minimo (una funzione, non un hook, non una classe) consumato da **entrambi**: è una modifica chirurgica e a comportamento invariato su desktop (verifica: `bookings.spec.ts` verde senza modifiche). Se il dev conclude che l'estrazione non è a comportamento invariato, **duplica le ~30 righe e lo motiva** — non modifica il desktop per comodità.

**AD-3 — Testata e KPI NON si duplicano.** `.page-head` (h1 + sub + CTA) e `.kpi-row` restano **un solo nodo** per faccia, adattati in CSS. Motivo dirimente e misurabile: `home-dashboard.spec.ts:138/152/169/180` asserisce gli heading e `265` legge `kpi-bookings-pending .kpi-value`; `mobile-primitives.spec.ts:179-264` misura `.kpi-row` e **richiede che sia figlio diretto di `.page`**. Un secondo albero di testata o di KPI rompe entrambi in strict mode a **qualsiasi** viewport. Se Q3 passa, la griglia 2×2 è una **classe modificatore sulla stessa riga** (es. `.kpi-row.kpi-row-grid`), non un secondo albero.

**AD-4 — Le derivazioni sono funzioni PURE in `src/lib/`, con unit test.** Valgono per la derivazione "in corso" e per il merge/ordinamento/tetto del feed Avvisi. Motivo: sono l'unica parte di questa story che un e2e non può provare in modo discriminante (non si può forzare un DB con 40 saldi negativi e 12 scadenze scadute dentro uno spec senza inquinare la suite), e la lezione 15.2 dice che una regola senza guardia è una regola che può sparire. Restano pure ⇒ niente `@/lib/env`.

---

## Acceptance Criteria

> Gli AC marcati **⟨Qn⟩** dipendono dalla ratifica corrispondente e vanno riletti dopo le risposte del PO. Ogni misura si intende a **375×812** e ripetuta a **390×844** (i due viewport già usati dalla suite), tema **chiaro e scuro**.

1. **(Panoramica admin — le cinque superfici del template)** A ≤640px la faccia admin rende, nell'ordine del template (64-121): testata (una sola, AD-3), KPI strip (già esistente), card **"In corso ora" ⟨Q1⟩**, card **"Prenotazioni in attesa"** con la decisione ⟨Q2⟩, card **"Avvisi" ⟨Q5⟩**, card **"Meteo campo" ⟨Q6⟩**. Le superfici desktop che il mobile sostituisce sono trattate secondo ⟨Q4⟩. **Verifica**: a 375px `getComputedStyle(...).display === 'none'` misurato in e2e su ogni albero inattivo (non a occhio) e visibilità dell'attivo; a 1280px l'inverso; nessun testid duplicato in tutta la suite (strict mode verde).

2. **(Card "In corso ora" ⟨Q1⟩)** Righe derivate **senza query nuove** da `calendarBookingsToday` (`page.tsx:199`) con la derivazione pura di AD-4; head con conteggio; ogni riga mostra chip marche (mono, `--bg-sunken`, bordo), titolo, sub mono e badge di stato, come il template 78-89; empty state proprio. Il **titolo della card e il conteggio** dicono la verità sul dato (non "voli in aria" se il dato è "prenotazioni in corso"). **Verifica**: unit test della funzione pura sui 4 casi di confine (prima dell'inizio, esattamente a `startsAt`, dentro, esattamente a `endsAt`, dopo) + e2e che crea una prenotazione a cavallo di adesso e la trova nella card.

3. **(Coda prenotazioni con decisione ⟨Q2⟩)** A ≤640px le prenotazioni **PENDING** della finestra sono card nel linguaggio del template (90-105): richiedente, sub mono (marche · orario), numero/id a destra dove il desktop lo mostra; il conteggio nell'head è quello **della finestra** (`embedPendingResult.total`), non l'all-time del KPI (`page.tsx:364-367`). Approvare esegue `POST .../transition {to:'APPROVED'}`, mostra lo **stesso toast** del desktop e fa `router.refresh()`; negare raccoglie il **motivo obbligatorio** (b.3) con la stessa validazione client di oggi (submit vuoto ⇒ errore inline e **zero richieste di rete**) e la stessa gestione del **409**. Empty state "Nessuna prenotazione da approvare." come da template (104). Nessun literal di colore nuovo: `.btn.mini.ok`/`.btn.mini.bad`/`.btn.primary`. Target ≥44px. **Verifica**: e2e su fixture propria — approva dal telefono, la riga sparisce dalla card e il badge desktop dice "Approvata"; nega con motivo vuoto ⇒ errore inline provato con `page.route`/`waitForRequest` (assenza di toast **non** basta); nega con motivo ⇒ toast + sparizione + `denyReason` leggibile sul desktop.

4. **(Feed "Avvisi" ⟨Q5⟩)** Solo sulla faccia **admin** (il template non ne dà uno alle altre; le scadenze personali sono già nei KPI di pilota/allievo). Righe `30px 1fr` col quadratino di tono, titolo e sub mono (template 106-116). Ogni voce è **verificabile alla fonte** (nessun avviso senza un dato che lo genera) e porta a una destinazione sensata. Ordine, tetto e comportamento di troncamento come da ⟨Q5⟩. **Verifica**: unit test della funzione pura di AD-4 — ordinamento, tetto, e il caso "più voci del tetto" (che l'e2e non può forzare); e2e che, creata una scadenza scaduta su una persona di fixture, la trova nel feed.

5. **(Card METAR ⟨Q6⟩)** Card nel linguaggio del template (117-121): label mono uppercase + station, temperatura + pallino di categoria + sigla, raw METAR in box `--bg-sunken` mono con `word-break: break-word` (una riga METAR reale è lunga: **misurare** che non produca overflow orizzontale di pagina a 375px). **Assente** — non vuota — quando `getMetar` restituisce `null` (stazione non configurata o fetch fallito): è lo stesso `metar &&` che la sidebar applica da sempre (`sidebar.tsx:100`). **Nessuna chiamata di rete lato client.** **Verifica**: a 375px la card c'è (con stazione configurata) e a 1280px `toHaveCount(0)` in pagina mentre `.weather-card` della sidebar è visibile; `document.documentElement.scrollWidth <= clientWidth` con un raw METAR lungo iniettato (text-node substitution, lezione 13.10).

6. **(Landing pilota/allievo ⟨Q3⟩⟨Q4⟩⟨Q6⟩⟨Q8⟩)** A ≤640px la faccia personale rende: saluto + sub saldo (una sola testata), KPI secondo ⟨Q3⟩, CTA "Prenota volo" secondo ⟨Q4⟩ **con la stessa condizione `canBook` di oggi** (`page.tsx:671-672`: permesso **E** profilo pilota attivo — non reintrodurre il gate sul solo ruolo, difetto chiuso da review 14.6 F2), card "I miei prossimi voli", card METAR. L'**allievo** rende la stessa schermata **senza** la CTA (R2 chiuso dalla ricognizione a). **Verifica**: e2e con l'attore `pilot@airmanager.local` **e** con `student@airmanager.local` (mai solo uno — lezione 15.1 F1); `pilot-landing-book-cta` `toHaveCount(0)` per l'allievo anche nell'albero mobile.

7. **(Landing istruttore ⟨Q3⟩⟨Q6⟩⟨Q8⟩)** A ≤640px: saluto + sub, KPI secondo ⟨Q3⟩, card "La mia giornata" con la **colonna orari a sinistra** del template (447-456: inizio mono 11.5px/600, fine mono 10px `--ink-4`) e il `Badge` di fase già calcolato da `dayPhaseOf`, empty state invariato, card METAR. **Nessuna CTA di creazione** (ratifica 12.12 n.3, asserita da `home-dashboard.spec.ts:187-190`). **Verifica**: e2e con `instructor@airmanager.local`; il testid `instructor-landing-myday-empty` resta **un solo nodo**.

8. **(Dettaglio-riga in bottom sheet ⟨Q8⟩)** Le righe delle liste che ⟨Q8⟩ include aprono il `BottomSheet` della 15.2 con `sub`/`title`/`badge`/`rows[]` modellati sui row-builder del template (589/592) e **parità informativa**: lo sheet mostra **almeno** quello che la card mostra, più i campi che la card non ha spazio di mostrare. La card che apre lo sheet è **un solo `<button>`** senza elementi interattivi annidati (idioma `.ppr-card`, `airops.css:1853-1861`), con nome accessibile parlante. **Verifica**: apertura **da tastiera** (Tab + Enter); ispezione DOM: zero `button` dentro `button` e zero `<a>` dentro `<button>` nell'albero mobile; il nome accessibile non è generico.

9. **(Convenzione testid — nessun duplicato)** Desktop **invariati**: `kpi-*`, `booking-row`, `booking-row-starts-at`, `booking-approve-action`, `booking-reject-action`, `booking-deny-reason`, `booking-deny-submit`, `bookings-list-section`, `schedule-section`, `scadenze-widget`, `fleet-card-widget`, `dispatch-flight-button`, `pilot-landing-upcoming-row`, `pilot-landing-upcoming-empty`, `pilot-landing-book-cta`, `pilot-landing-logbook-cta`, `pilot-landing-profile-cta`, `instructor-landing-myday-row`, `instructor-landing-myday-empty`, `instructor-landing-logbook-cta`. Duplicati mobile col suffisso `-mobile` (es. `booking-row-mobile`, `pilot-landing-upcoming-row-mobile`, `instructor-landing-myday-row-mobile`); superfici solo-mobile col prefisso `mobile-` (es. `mobile-overview-inprogress`, `mobile-overview-pending-bookings`, `mobile-overview-alerts`, `mobile-metar-card`, `mobile-booking-sheet`). **Verifica**: la **suite completa** passa in strict mode; un `page.getByTestId(id)` per ciascuno dei testid desktop elencati restituisce **esattamente 1** nodo a 375px e a 1280px.

10. **(Geometria e layering, con la tab bar della 15.1 presente)** A 375px e 390px: nessun overflow orizzontale **di pagina** (`document.documentElement.scrollWidth <= clientWidth`) su tutte e tre le facce; nessun controllo della Panoramica finisce sotto la tab bar (z 5) — che è già quello che `mobile-shell.spec.ts:175-200` hit-testa su **ogni** `.page a, .page button`, e i controlli nuovi ci entrano automaticamente; il bottom sheet (z 40) copre la tab bar con lo scrim; i toast (200) restano sopra tutto. **Verifica**: `elementFromPoint` per ogni coppia (non giudizio visivo — lezioni 13.7/13.10/15.1), valori riportati nel record; `mobile-shell.spec.ts` verde **senza modifiche** (se va modificato, è un segnale: si aggiorna al valore **corretto**, mai indebolito — lezione 14.6).

11. **(Ogni regola nuova ha la sua guardia, provata discriminante — 15.1 F2/F3 + lezione 15.2 sulla guardia cieca)** Il dev elenca nel record ogni regola CSS/comportamento introdotta per un difetto **misurato** e, per ciascuna, l'asserzione che la protegge. Minimo: (i) `display:none` dell'albero desktop ≤640px; (ii) `display:none` dell'albero mobile >640px; (iii) ⟨Q3⟩ se passa la griglia 2×2: **il 3° e il 4° KPI raggiungibili SENZA scorrere** — cioè il lato che la regola ha **liberato**, non "la riga esiste"; (iv) card METAR presente ≤640 / assente >640; (v) non-overflow col raw METAR lungo; (vi) empty state di ogni lista = **un solo** nodo. Ognuna va **provata discriminante** simulando il pre-fix (iniezione CSS / `addInitScript` / neutralizzazione del componente con **rebuild** se il difetto è JS — lezione 15.2): il test deve diventare **rosso**. Se una regola non è proteggibile con un'asserzione sensata, va detto e motivato, mai lasciata muta.

12. **(Invarianti)** Desktop >640px **invariato**: verifica interattiva a 1280px e 800px sulle tre facce (nessuna differenza visiva né di geometria misurata rispetto al pre-diff, misura pre/post); 641px continua a prendere il rail 64px (R1, test di confine 15.1 verde). `npm run gates` verde; **nessuna dipendenza nuova**; **nessun token esistente cambia valore**, nessun literal di colore nuovo; ogni stringa nuova in **entrambi** i locale; contrasto delle superfici nuove **misurato** (canvas→WCAG) ≥4.5:1 in tema chiaro **e** scuro; gate finale = **suite completa `CI=1` su build di produzione, DB fresco** (`export JOBS_SECRET=<non-placeholder>` prima del run; foreground, output su file, mai `| tail`).

---

## Blast radius (enumerato — il dev lo verifichi e lo chiuda voce per voce nel record)

**e2e che possono rompersi** (dettaglio e righe nella ricognizione e):
1. `e2e/home-dashboard.spec.ts` — **7 punti**: heading admin (138), 5 KPI admin (140-142), 4 widget admin (143-147), heading+KPI+CTA pilota (152-164), allievo (169-175), istruttore (180-190), istruttore disattivato con 3 `toHaveCount(0)` (221-223), `booking-row`+`booking-row-starts-at`+`kpi-bookings-pending .kpi-value` (248-266). **Causa di rottura più probabile: un testid o un heading duplicato dall'albero mobile.**
2. `e2e/mobile-primitives.spec.ts:172-265` — **il più esposto**: gira sulla home admin a 375px e vincola `.kpi-row` a essere figlio diretto di `.page`, con ≥5 card e l'ultima **non** raggiungibile. Va **rieseguito e riletto**, non solo rieseguito: se Q3 passa, occorre dire esplicitamente perché resta verde (è admin, la griglia è per le facce a 4 KPI).
3. `e2e/mobile-shell.spec.ts` — 3 test sulla home a 375px, incluso il **bottom-geometry** che hit-testa ogni `.page a, .page button`: i controlli nuovi ci entrano da soli.
4. `e2e/pdf-exports.spec.ts:375` — `bookings-list-section`.
5. `e2e/bookings.spec.ts` — usa `schedule-section` su `/dashboard/bookings`: intatto **se** AD-2 è rispettata (niente modifiche a `schedule.tsx`).
6. `movements`, `login`, `flights`, `user-management`, `account-adjustments`, `ppr-queue` — passano dalla home per navigare: un errore SSR sulla home li rompe **tutti insieme**. È il segnale d'allarme da guardare per primo se la suite crolla.

**Unit**: nessun test copre oggi `page.tsx`. I nuovi test sono quelli delle funzioni pure di AD-4. Se il dev estrae la funzione di transizione (AD-2), `bookings-table.tsx` cambia di poco e **`bookings.spec.ts` è la sua guardia**.

**Cosa può rompersi senza che un test lo veda** (da verificare a mano):
- il **tablet 641-900px**: nessuna regola di questa story deve toccarlo (R1), ma è la fascia dove `.weather-card` è già nascosta e la sidebar è a rail — controllare a 800px che nulla di nuovo compaia;
- il **tema scuro** delle superfici nuove (i toni del feed Avvisi sono l'elemento a rischio — 13.9 ha già trovato 5 cause radice token-level);
- la **sub-riga** della testata admin (`subParts.join(' · ')`, `page.tsx:216-221`): a 375px va già a capo (`.page-head{flex-wrap:wrap}`) ma con 4 segmenti può occupare 3 righe — misurare.

---

## Piano di test

**Dove vivono i test nuovi**
- **Spec nuovo `e2e/mobile-overview.spec.ts`**, project `chromium` `fullyParallel` (non scrive AppSettings ⇒ **non** entra nella catena serializzata). `setViewportSize` **dentro il test** (pattern 13.10, decisione di epic: **niente project Playwright duplicato**).
- Regola di isolamento **non negoziabile**: ogni test crea le proprie fixture (velivolo, persona, prenotazione) e asserisce **solo su quelle**, filtrando per targa/cognome run-unique. **Mai** un conteggio globale con uguaglianza (lezione 12.11 F1, review Billing-2 F4: "fotografia + uguaglianza" flaka per costruzione sotto `fullyParallel`).
- I test **per ruolo** (pilota, allievo, istruttore) usano gli attori di seed già usati da `home-dashboard.spec.ts` (`pilot@`, `student@`, `instructor@`) e `page.context().clearCookies()` fra un'identità e l'altra (idioma già in quel file, righe 200-204).

**Casi minimi**
1. *admin, 375px*: le cinque superfici mobile visibili, le superfici desktop sostituite a `display:none` **misurato**, nessun overflow di pagina.
2. *admin, 1280px*: l'inverso, e le 4 superfici desktop di `home-dashboard.spec.ts` intatte.
3. *admin, 375px, decisione*: fixture PENDING → approva dalla card/sheet → sparizione + stato APPROVED verificato sul desktop; seconda fixture → nega con motivo vuoto (**zero richieste di rete**, provato con `page.route`) → poi con motivo → `denyReason` visibile.
4. *admin, 375px, "in corso"*: fixture a cavallo di adesso → compare nella card; fixture interamente futura → non compare.
5. *admin, 375px, avvisi*: scadenza scaduta su persona di fixture → compare nel feed.
6. *pilota / allievo / istruttore, 375px*: la loro faccia, i loro KPI ⟨Q3⟩, la loro lista, la CTA giusta (presente per il pilota, assente per l'allievo, assente per l'istruttore), METAR.
7. *METAR*: presente ≤640, `toHaveCount(0)` in pagina >640 mentre `.weather-card` della sidebar è visibile; raw lungo iniettato → nessun overflow.
8. *tastiera*: Tab fino alla prima card → Enter → sheet aperto, focus dentro; Escape → chiuso, focus tornato al trigger.

**Guardie DISCRIMINANTI (lezione 15.2 — la guardia va scritta sul lato che la regola ha LIBERATO)**
- ⟨Q3⟩ griglia 2×2: **non** "la riga esiste" e **non** "il primo KPI si vede" (li teneva già la strip). L'asserzione è: **tutti e 4** i KPI `reachable()` con `scrollLeft === 0` **e** `scrollWidth <= clientWidth` sulla riga. Discriminanza: iniettando le regole della strip il test deve diventare rosso (oggi, con la strip, l'ultimo KPI è `reachable() === false` — lo dice già `mobile-primitives.spec.ts:195`).
- Sostituzione degli alberi: asserire **entrambi** i lati (desktop `none` + mobile visibile a 375px; l'inverso a 1280px). Un solo lato lascia passare "ho nascosto tutto".
- Empty state: `toHaveCount(1)`, non `toBeVisible()` — un doppione è esattamente il difetto che la convenzione testid esiste per prevenire (precedente: `mobile-primitives.spec.ts:71`).
- Feed Avvisi: il **tetto** e l'**ordine** si provano in **unit** (l'e2e non può fabbricare 40 saldi negativi senza inquinare la suite) — AD-4.
- Ogni guardia va provata rossa contro una simulazione del pre-fix, con il repo **intatto** (iniezione CSS / `addInitScript`; se il difetto è JS, **rebuild** — lezione 15.2).

**Gate finale**: `npm run gates` + **suite completa `CI=1` su build di produzione con DB fresco**, foreground, output su file (`export JOBS_SECRET=<non-placeholder>` prima del run). Se il dev non la completa, la **review la riesegue da arbitro** (prassi consolidata 13.9/13.11/15.2).

---

## Contesto (puntatori)

- Piano epic 15 (R1-R5 + architettura, VINCOLANTI): `docs/superpowers/plans/2026-07-29-epic-15-mobile-ui.md`.
- Story precedenti, da leggere per intero: `_bmad-output/implementation-artifacts/15-1-shell-mobile.md` (convenzione testid, mappa z-index, lezioni F1-F3) e `15-2-primitive-mobile.md` (API delle primitive, 7 ratifiche R-15.2-a..g, lezioni sulla guardia cieca e sulla prova per rebuild).
- Consumer di riferimento del doppio markup + `BottomSheet`: `src/app/[locale]/dashboard/ppr/ppr-console.tsx`.
- Template locale: percorso in testa (fonte remota raggiungibile solo dalla sessione principale via `DesignSync`).
- Regole ambiente e ciclo per story: `docs/handoffs/HANDOFF.md` (DB fresco solo dalla sessione principale, `JOBS_SECRET` da esportare, run e2e mai in background da subagent, MCP Playwright non raggiungibile dai subagent → fallback sanzionato: script `playwright-core` throwaway lanciati dalla root, mai committati, **mai** `playwright install`).
- **Skill obbligatorie dev**: `karpathy-guidelines` + `design-taste-frontend` + `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"` — utile su "mobile dashboard cards", "alert feed list", "kpi grid mobile", "weather card").
- Modello: **Opus 5 xhigh** per dev e per eventuali fix-subagent (regola utente 2026-07-29: il codice UI lo scrive Opus 5; l'epic 15 è tutto UI). ⚠️ `.claude/agents/dev-story.md` ha `model: sonnet` nel frontmatter: **passare `model:'opus'` esplicitamente al dispatch**. Review adversarial: `adversarial-reviewer` Opus 5 xhigh — ⚠️ quel tipo di agent **non ha il tool di messaggistica**: concederglielo o mettere in conto di leggere il transcript (trappola 15.2).
- Commit: `feat(15.3): panoramica mobile — in corso ora, coda prenotazioni, avvisi, METAR; landing per-ruolo` — Co-Authored-By col modello che ha scritto il codice.

## Fuori scope dichiarato

- **`/dashboard/bookings`** (agenda "Voli di oggi", filtri, form prenotazione) → **15.4**; **`/dashboard/fleet`**, Piloti, Istruttori, scheda persona → **15.5**. AD-2 esiste per non anticiparle.
- Registro voli (15.6), Scadenze/Transiti (15.7), Contabilità/Statistiche/Impostazioni (15.8), aree self e `/ppr` pubblico (15.9).
- **Focus trap** e `aria-modal` su sheet/pannelli, dark-pass e a11y-pass completi, riesame del "project mobile" Playwright → **15.10**. La baseline di tastiera resta quella della 15.1 (focus al pannello, ritorno al trigger, Escape).
- **METAR nella fascia 641-900px**: `.weather-card` è nascosta lì da prima di questo epic (`airops.css:1439`, ratifica 13.10 sul rail). R1 vincola questa story a ≤640px ⇒ il buco resta e va **tracciato come TD in `sprint-status.yaml`**, non chiuso qui di straforo.
- Qualunque modifica alle API, agli schemi Zod, al dominio o al comportamento desktop (il motivo obbligatorio del rifiuto di una prenotazione è un **vincolo esistente**, non una modifica).
- Sostituzione o riscrittura di `BottomSheet`/`MobileSheet`/modalità full-screen di `SlideOver`: si **riusano**, non si reinventano (bullet di brief).

---
---

# RATIFICHE PO — CHIUSE il 2026-07-30, PRIMA del dispatch al dev

Le otto assunzioni sotto sono state poste al PO in due giri di `AskUserQuestion` e **chiuse tutte
sulla raccomandazione del teammate story**. Valgono come vincoli: il dev le implementa così, non le
ridiscute. (Q5 è stata riformulata dopo una richiesta di chiarimento del PO — "non ho capito il feed
avvisi cosa sia" — e ratificata al secondo giro; l'esito è invariato.)

| # | Ratifica | Decisione del PO |
|---|---|---|
| **R-15.3-a** | Card "In volo ora" | **"In corso ora" = prenotazioni di oggi con `startsAt <= now < endsAt`**. Il dato "volo in aria" NON esiste (`FlightStatus` = `REGISTERED\|CANCELLED`): il titolo del template si cambia perché il numero non menta. Zero query nuove (`calendarBookingsToday` è già in pagina). |
| **R-15.3-b** | Approva/Nega prenotazioni | **Solo dentro il bottom sheet, come la coda PPR** — la card è un trigger unico, il motivo del rifiuto è il `secondStep` già costruito in 15.2. **Conferma e non deroga R-15.2-b**: le due code decisionali dell'app hanno UNA sola grammatica. Il bullet di piano ("Approva/Nega inline") è superato da questa ratifica. |
| **R-15.3-c** | KPI pilota/istruttore | **Griglia 2×2 dove i KPI sono 4**, strip dove sono 5 (admin) — come il template. Una classe modificatore sulla stessa riga, **mai un secondo albero**. R-15.2-f resta il default per ogni altra pagina. |
| **R-15.3-d** | Superfici desktop assenti dal template | **Nascoste ≤640px con CTA verso la loro pagina**: calendario → Pianificazione, card Flotta → Flotta; tabella prenotazioni → card "in attesa"; widget Scadenze → feed Avvisi. Le CTA di testata diventano **full-width sotto la sub-riga** (pattern template 415), non bottoni schiacciati in testata. |
| **R-15.3-e** | Feed Avvisi | **Tre fonti — scadenze + saldi negativi + PPR in attesa — ordinate per urgenza** (scaduto → saldo negativo → ≤7g → PPR) e **tetto a 5 righe** con "Vedi tutte" verso la pagina di competenza quando tronca. Accettata la query nuova `listNegativeBalances` nel `Promise.all` esistente. Ordine e tetto si provano in **unit su funzione pura**. Solo faccia admin. |
| **R-15.3-f** | Card METAR | **Resa da `dashboard/page.tsx` su tutte e tre le facce, visibile solo ≤640px.** Accettato il costo: a processo freddo layout e pagina possono mancare entrambi la cache 10' e fare due fetch upstream. Il buco **641-900px** resta fuori scope e va tracciato come **TD** in `sprint-status.yaml`. |
| **R-15.3-g** | Riga "delta" sotto i KPI | **Nessun delta.** Il componente `KPI` è condiviso col desktop e il mandato della story è "desktop invariato"; tre dei cinque delta del template sono numeri inventati. |
| **R-15.3-h** | Bottom sheet di dettaglio | **Su tutte e quattro le liste** (in corso ora, prenotazioni in attesa, i miei prossimi voli, la mia giornata) — grammatica unica e parità informativa col desktop. Costo accettato: quattro builder di righe e quattro casi e2e. |

---

# ASSUNZIONI DA RATIFICARE COL PO — **PRIMA** del dispatch al dev
> **CHIUSE — v. la tabella qui sopra.** Il testo che segue resta come istruttoria (fatti, opzioni
> scartate e motivi): serve al dev e al reviewer per capire *perché* una decisione è quella e non
> un'altra, e al PO se in futuro vorrà rivederla.

> Regola di progetto (retro Epic 9, riconfermata dal piano epic 15: "Per ogni altro dubbio chiedi a me" — PO, 2026-07-29): un'assunzione scoperta in ricognizione si ratifica **prima** di implementare, mai spedita "da confermare". Ognuna qui sotto è una scelta **non deducibile** dal template (incompleto by design, R2) né dal codice.

### Q1 — "In volo ora": cosa mostra la card, dato che l'app non ha il concetto di volo attivo?

**Il fatto**: `FlightStatus` ha solo `REGISTERED|CANCELLED` (`prisma/schema.prisma:890-893`) — un volo si registra **dopo**. Non esiste tracking, non esiste un volo aperto. L'unica nozione di "adesso" già calcolata è la prenotazione in corso (`dayPhaseOf`, `page.tsx:530-534`, etichetta i18n già presente: "in corso"); l'altra è il PPR approvato **AL_SUOLO** (ospite atterrato — il contrario di "in volo").

- **(a) "In corso ora" = prenotazioni di oggi con `startsAt <= adesso < endsAt`** — dato vero, zero query nuove (`calendarBookingsToday` è già in pagina), lessico già in i18n. *(RACCOMANDATA)*
- **(b) "Movimenti in corso" = (a) + PPR approvati al suolo** — più ricco, ma mette sotto un titolo solo due domini diversi (prenotazioni del club e ospiti in transito) e il conteggio diventa ambiguo.
- **(c) Non portare la card** — la Panoramica mobile perde il "cosa sta succedendo adesso", che è il senso stesso della schermata.

**Raccomandazione: (a)**, con il titolo cambiato rispetto al template. Motivo: la card del template promette "in volo", e mostrare una prenotazione in corso sotto quel titolo farebbe credere a un amministratore che un velivolo è in aria quando potrebbe non essere neppure decollato. Il costo è una parola; il beneficio è che il numero non mente.

### Q2 — Approva/Nega delle prenotazioni: **inline sulla card** (bullet di piano + template) o **dentro il bottom sheet** (precedente R-15.2-b)?

**Il conflitto**: il bullet 15.3 del piano dice "coda prenotazioni con Approva/Nega **inline**" e il template le mostra così (98-101). Ma la ratifica **R-15.2-b** (PO, 2026-07-30) ha scelto, per la coda PPR, la sede **unica** nello sheet — divergenza **deliberata** dal template, motivata così: non esporre due bottoni distruttivi sotto il pollice mentre si scorre. **In più**, un fatto tecnico: "Nega" richiede un **motivo obbligatorio** (`bookings-table.tsx:257-259`), quindi **non può completarsi con un tap** neanche inline.

- **(a) Come il PPR: la card è un trigger unico, Approva/Nega vivono nello sheet, il motivo è il `secondStep` già implementato** — una sola grammatica per le due code decisionali dell'app, nessun elemento interattivo annidato, riuso al 100% di ciò che la 15.2 ha costruito. Costo: 2 tap per approvare. *(RACCOMANDATA)*
- **(b) Inline come da bullet e template**: 2 bottoni sulla card; "Approva" si completa in un tap, "Nega" apre comunque il secondo passo. Costo: la card non può più essere un `<button>` (torna il problema `stopPropagation` / interattivo dentro interattivo che R-15.2-b aveva eliminato per costruzione), e le due code dell'app si comportano in modo diverso.
- **(c) Ibrido: solo "Approva" inline, "Nega" solo nello sheet** — il tap veloce dove è sicuro, il passo lento dove serve. Costo: asimmetria da spiegare.

**Raccomandazione: (a)**. Se il PO preferisce (b) o (c), è una **decisione consapevole che deroga a R-15.2-b**: va messo a verbale che le due code divergono, altrimenti la prima review che le confronta lo segnala come incoerenza.

### Q3 — KPI di pilota/allievo e istruttore: **strip orizzontale** (stato attuale) o **griglia 2×2** (template)?

**Il fatto**: la ratifica **R-15.2-f** ha applicato la strip a scroll-snap a **tutte** le 9 `.kpi-row` dell'app (`airops.css:1924-1951`), accettando esplicitamente il costo "dal terzo KPI serve uno scorrimento". Il template però usa la strip **solo** per l'admin (5 KPI, 69-77) e una **griglia `1fr 1fr`** per pilota (407-414) e istruttore (439-446), che hanno esattamente **4** KPI: in griglia si vedono tutti e quattro insieme, nella strip due sono nascosti.

- **(a) Tutto strip (status quo)** — uniforme, zero codice. Ma su pilota/istruttore nasconde metà dei KPI dietro uno scroll che il template non chiedeva, e sono i KPI che un pilota apre l'app per vedere (saldo, medico, ratings).
- **(b) Griglia 2×2 dove i KPI sono 4, strip dove sono 5** — fedele al template. Costo: **una classe modificatore** sulla stessa riga (AD-3: mai un secondo albero), applicata dalle due landing. R-15.2-f resta in vigore come **default** per ogni altra pagina. *(RACCOMANDATA)*
- **(c) 2×2 ovunque** — rompe la scelta del template per l'admin (5 KPI non stanno in 2×2 senza una riga zoppa) e ribalta R-15.2-f su 7 pagine.

**Raccomandazione: (b)**. È esattamente ciò che il template fa, costa una classe, non tocca nessun'altra pagina, e la guardia e2e è forte e discriminante (i 4 KPI raggiungibili senza scorrere — il lato che la regola *libera*).

### Q4 — Sulla Panoramica **admin** mobile, che fine fanno calendario, tabella prenotazioni, widget Scadenze e card Flotta? E le CTA delle testate?

**Il fatto**: il template mobile non ha nessuna delle quattro superfici desktop (calendario del giorno, tabella prenotazioni completa, widget scadenze, card flotta) — le sostituisce con le sue card. E la sua testata admin **non ha CTA**, mentre quella pilota ha un "Prenota volo" **full-width** (415).

- **(a) Su mobile: calendario e card Flotta **nascosti**, con un link/CTA verso la loro pagina (Pianificazione, Flotta — entrambe già in tab bar, e ricevono il loro linguaggio mobile in 15.4/15.5); tabella prenotazioni sostituita dalla card "in attesa"; widget Scadenze sostituito dal feed Avvisi (che le include). Le CTA di testata diventano **full-width** sotto la sub-riga (pattern del template 415), non bottoni schiacciati nella testata.* *(RACCOMANDATA)*
- **(b) Tenere tutto in coda alla pagina mobile** — nulla sparisce, ma la home diventa lunghissima e contiene un calendario a griglia usabile solo con scroll orizzontale: è precisamente quello che R4 dice di non lasciare come stato finale.
- **(c) Nascondere senza link** — più pulito, ma un amministratore che sul desktop usa il widget Flotta non ha modo di capire dov'è finito.

**Raccomandazione: (a)**. Nota di verifica: `home-dashboard.spec.ts:144-147` asserisce le quattro superfici `toBeVisible()` ma **gira a viewport desktop** (1280×720, ereditato da `devices['Desktop Chrome']` in `playwright.config.ts:13-19`) → nasconderle a ≤640px **non** lo rompe. Va comunque riletto, non solo rieseguito.

### Q5 — Feed "Avvisi": quali fonti, in che ordine, con che tetto?

**Il fatto**: tre fonti reali e verificate — scadenze (già in pagina, finestra 60g, cap 60), **saldi negativi** (`listNegativeBalances`, `finance.manage`, una query **nuova** sulla home), PPR in attesa (già contato). Il template mostra 3 righe generiche e non dice ordine né tetto (R2).

- **(a) Tutte e tre, ordinate per urgenza reale (scaduto → saldo negativo → in scadenza ≤7g → PPR in attesa), tetto a 5 voci + riga "Vedi tutte" verso la pagina di competenza quando si tronca.** Costo: una query in più nel `Promise.all` esistente (un `groupBy` + una `findMany`). *(RACCOMANDATA)*
- **(b) Solo scadenze + PPR (nessuna query nuova)** — a costo zero, ma la home mobile non direbbe mai che qualcuno è in rosso, che è metà del lavoro di un gestore di aviosuperficie.
- **(c) Tutte e tre senza tetto** — su un campo reale i saldi negativi sono decine: la card diventerebbe la pagina.

**Raccomandazione: (a)** con tetto 5. Il tetto e l'ordine si provano in **unit** su una funzione pura (AD-4), perché nessun e2e può fabbricare quel volume senza inquinare la suite.

### Q6 — Card METAR: da dove prende il dato, e su quali facce compare?

**Il fatto (scoperta di ricognizione)**: il METAR **esiste** ed è già fetchato dal layout (`dashboard/layout.tsx:94`), ma è reso **solo** dentro `Sidebar` — che è `display:none` a ≤640px, e la `.weather-card` è nascosta già a ≤900px (`airops.css:1439`). **Su telefono e tablet il meteo del campo oggi non si vede affatto.** `mobile-top-bar.tsx` non lo cita.

- **(a) `dashboard/page.tsx` chiama `getMetarStation()` + `getMetar()` e rende una card `mobile-metar-card` (solo ≤640px) su **tutte e tre** le facce, come il template.** Costo reale: `getMetar` ha una cache in-memory di 10 minuti per stazione (`metar.service.ts:38-42,131-145`), quindi normalmente è un **cache hit** a costo zero; a processo freddo layout e pagina possono mancare entrambi la cache e fare **due** fetch upstream, una volta ogni 10 minuti. Ogni errore degrada già a `null` per contratto del servizio. *(RACCOMANDATA)*
- **(b) Spostare il fetch nel layout e rendere lì una card mobile** — un solo fetch garantito, ma la card comparirebbe su **ogni** pagina mobile, mentre il template la mette solo nelle home.
- **(c) Non portarla** — mobile e tablet restano senza meteo, su un'app per aviosuperficie.

**Raccomandazione: (a)**. Il buco della fascia **641-900px** resta e va tracciato come **TD** in `sprint-status.yaml` (R1 vincola questa story a ≤640px): chiuderlo qui sarebbe uno scavalco della ratifica.

### Q7 — La terza riga "delta" sotto i KPI del template: portarla?

**Il fatto**: il template mostra un delta su ogni KPI admin, ma **3 su 5 sono inventati** ("▲ 3 vs media", "più vecchia 6h fa", "da approvare"). Reali sono solo il conteggio AOG (già calcolato, `page.tsx:214`) e la variazione dei ricavi (ricavabile dalla `series` di `getStats`). Il componente `KPI` ha già le prop `delta`/`trend` — **ed è condiviso col desktop**: aggiungere la riga si vede anche a 1280px.

- **(a) Nessun delta (status quo)**: i KPI restano label + valore su entrambi i mondi. Zero rischio, zero modifiche al desktop. *(RACCOMANDATA)*
- **(b) Delta solo dove il dato è reale** (AOG su "Flotta disponibile", variazione mese su "Ricavi"), gli altri tre senza. Porta il linguaggio del template senza inventare numeri — **ma è una modifica visibile anche sul desktop**, in una story il cui mandato è "desktop invariato".
- **(c) Tutti e cinque i delta come nel template** — richiederebbe di inventare tre numeri. **Da escludere.**

**Raccomandazione: (a)**. Se il PO vuole il linguaggio completo del template, (b) è accettabile ma va messo a verbale che la Panoramica **desktop** cambia aspetto, e serve una misura pre/post dell'altezza delle card KPI (la strip ha un tetto di larghezza e `.kpi` ha `overflow:hidden`: una terza riga cambia la geometria).

### Q8 — Quali righe aprono un bottom sheet di dettaglio?

**Il fatto**: R3 dice "dettaglio-riga = bottom sheet" e il template mette un `open` su **tutte** le righe di tutte le liste (589/592). Le liste in gioco sono quattro: "in corso ora" e "prenotazioni in attesa" (admin), "i miei prossimi voli" (pilota/allievo), "la mia giornata" (istruttore). Oggi tutte e quattro mostrano **meno** di quello che il record contiene (es. la riga pilota mostra marche + data, ma non istruttore, durata, note).

- **(a) Tutte e quattro** — grammatica unica, parità informativa piena, riuso della primitiva 15.2 (il costo marginale per lista è un builder di `rows[]`). *(RACCOMANDATA)*
- **(b) Solo la coda prenotazioni** (dove il tap serve a decidere); le altre tre restano righe informative non tappabili. Meno lavoro, ma tre liste su quattro restano più povere del desktop e la story lascia una grammatica mista da chiudere in 15.10.
- **(c) Nessuna** — la Panoramica mobile mostrerebbe meno del desktop, contro l'AC di parità informativa che regge tutto l'epic.

**Raccomandazione: (a)**, con una nota di onestà sul costo: sono quattro builder di righe più quattro casi e2e; se il PO vuole contenere l'ampiezza della story, (b) è il taglio difendibile — a patto di scriverlo come **debito esplicito** per 15.10, non di lasciarlo implicito.

---
---

# Dev Agent Record — 15.3 (dev agent, Opus 5 xhigh, 2026-07-30)

Status: **implementata**. Gates verdi. Suite e2e: esito onesto in fondo alla sezione.

## 1. Verifica della ricognizione — 12 conferme, 4 correzioni

**Confermato sul codice (path e righe reali):**

| Voce | Esito |
|---|---|
| (a) gate delle facce `page.tsx:109-122`, `renderAdminOverview` 151-433, `renderInstructorLanding` 536-644, `renderPilotLanding` 648-752, `dayPhaseOf` 530-534, `canBook` 671-672 | ✓ esatti |
| (a) Scoperta 1: pilota e allievo rendono **la stessa** `renderPilotLanding`, unica differenza la CTA su `canBook` | ✓ — R2 non chiedeva una quarta schermata |
| (b.1) strip KPI già fatta, `airops.css:1924-1973` | ✓ |
| (b.3) `transition` 207-226, `handleApprove` 228-233, submit vuoto bloccato a 257-259; testid desktop `booking-approve-action`/`booking-reject-action`/`booking-deny-reason`/`booking-deny-error`/`booking-deny-submit` | ✓ tutti presenti |
| (b.4) `listNegativeBalances` = `groupBy` + `having` + `findMany`, gate `finance.manage`, ordinata dal più negativo; **non** `hasNegativeBalanceAlert` | ✓ |
| (b.5) `getMetar` cache 10' (38-42), degrada a `null` per contratto; layout 81-109; `sidebar.tsx:100-122`; `.weather-card{display:none}` a ≤900px (1439) | ✓ |
| (c) API di `BottomSheet`/`MobileSheet`, `onClose` stabile per contratto, `secondStep` sostituisce nello STESSO nodo | ✓ |
| (d) sezioni CSS 15.1 (1653-1787) e 15.2 (1789-1981), precedente `.ppr-queue-mobile{display:none}` a 1809, `.page{padding:22px 28px 60px}` 293-299, `.page-head{flex-wrap:wrap}` 1573 | ✓ |
| (e) `home-dashboard.spec.ts` 136-267, `mobile-primitives.spec.ts` 172-265 (e `:195` asserisce ULTIMO non raggiungibile), `mobile-shell.spec.ts` 36-58/113-133/175-200 | ✓ |
| (e) tutta la suite gira a viewport desktop 1280×720 se non la cambia | ✓ |
| (f) `.list-icon.amber/.red/.green` esistono con i toni calibrati in 13.9 | ✓ (ma v. correzione 4) |
| Fuori scope: `.slideover` full-screen non serviva | ✓ non toccata |

**CORREZIONE 1 (semantica, importante) — `listCalendarBookings` è APPROVED-only.**
La ricognizione (b.2) dice che la card si può fare con `calendarBookingsToday` e non dice che quella query filtra `status: 'APPROVED'` (`bookings.service.ts:711-714`). Conseguenza: "In corso ora" mostra **prenotazioni APPROVATE in corso**, non "qualsiasi prenotazione". È *più* corretto di quanto la ricognizione implicasse (una PENDING non è "in corso"), ma è un fatto che va detto: il conteggio della card non include le richieste non ancora approvate.

**CORREZIONE 2 (difetto nel piano della ricognizione) — la coda mobile NON può filtrare le 8 righe del desktop.**
(b.3) prescrive: «una card mobile "in attesa" filtra `status === 'PENDING'` su quelle righe: zero query nuove». Quelle righe sono `embedBookingsResult` = 8 righe su **tutti** gli stati ordinate per `startsAt`: in una finestra affollata possono contenere **zero** PENDING mentre la testata — che per AC 3 deve mostrare `embedPendingResult.total` — dichiara cinque. È esattamente la classe di difetto della review 12.12 F3. Corretto chiedendo **righe** alla query PENDING che già esisteva (`embedPendingResult`, `pageSize` 1 → `MOBILE_PENDING_BOOKINGS_PAGE_SIZE = 8`): la card elenca ciò che la sua testata conta, e le query restano quelle di prima (nessuna aggiunta oltre a `listNegativeBalances`).

**CORREZIONE 3 — il fallback all'ICAO è nel SERVIZIO, non nella pagina Impostazioni.**
(b.5) attribuisce il fallback a `settings/page.tsx:177-182`; è `getMetarStation()` stesso (`app-settings.service.ts:420-426`) a fare `?? getAirfieldIcao()`. Conseguenza pratica **non prevista dalla story**: su DB **fresco** nessuna delle due chiavi esiste, `getAirfieldIcao()` torna `''` e `getMetar('')` torna `null` **senza fare richieste** ⇒ **su seed pulito la card METAR non esiste**. Da qui la scelta di spec separato per il METAR (§4).

**CORREZIONE 4 — `.list-icon.red` è rotta in dark mode, da prima di questa story.**
(f) invita a riusare i toni "già calibrati in 13.9". `.list-icon.red` porta un literal tarato sul chiaro (`oklch(0.4 0.17 25)`) e **non ha override dark**: sul fill `--bad-soft` scuro il glifo è invisibile (misurato, v. §6). Il `.amber` invece è sano (usa `--accent-ink`, che ha l'override). Fix applicato **scoped alla superficie nuova**; il difetto gemello sul `ScadenzeWidget` desktop è lasciato intatto e segnalato come TD (§8) perché ripararlo là sarebbe una modifica visibile al desktop in una story il cui mandato è "desktop invariato".

## 2. Riepilogo per AC

1. **Panoramica admin, cinque superfici** — `.overview-mobile` rende, nell'ordine del template: `mobile-overview-inprogress`, `mobile-overview-pending-bookings`, `mobile-overview-alerts`, `mobile-metar-card`, `.mobile-shortcuts`. Ordine dei primi tre asserito sul DOM. Superfici desktop sostituite: `.home-desktop-surface` su calendario, tabella e `.split` ⇒ `display:none` misurato a 375/390px, `block/block/grid` a 641/800/1280px.
2. **"In corso ora"** — `filterInProgress(calendarBookingsToday, now)` (funzione pura, 4 confini in unit); chip marche mono + nome + sub `HH:MM–HH:MM (· istruttore)` + badge "in corso"; head `{count} in corso`; empty state proprio. Titolo cambiato rispetto al template per R-15.3-a. Zero query nuove.
3. **Coda prenotazioni con decisione** — righe dalla query PENDING della finestra (correzione 2), head `{total} da approvare` = `embedPendingResult.total`. Approva/Nega **solo nello sheet** (R-15.3-b); motivo obbligatorio nel `secondStep`; submit vuoto ⇒ errore inline e **0 richieste** (provato con `page.route` che le conta); 409 ⇒ stesso messaggio del desktop **più** chiusura sheet + `router.refresh()` (lezione review 15.2 F4). Nessun colore nuovo: `.btn.primary` / `.btn.mini.bad`. Target misurati 44px.
4. **Feed "Avvisi"** — solo faccia admin. Tre fonti reali; ordine e tetto in `buildOverviewAlerts` (puro, 12 unit test). Ogni riga è un `<Link>` alla pagina dove la voce si tratta; "Vedi tutte" appare solo quando tronca e punta alla pagina di competenza della **prima voce nascosta**.
5. **Card METAR** — resa da `page.tsx` su tutte e tre le facce, solo ≤640px; assente (non vuota) quando `getMetar` torna `null`; nessuna chiamata client. Raw in box `--bg-sunken` con `overflow-wrap: anywhere`.
6. **Landing pilota/allievo** — testata unica, KPI 2×2 (`kpi-row-grid`), CTA full-width sotto la sub-riga con il `canBook` di oggi intatto, `pilot-landing-upcoming-mobile` + sheet, card METAR. Allievo verificato separatamente: `pilot-landing-book-cta` = 0 nodi.
7. **Landing istruttore** — KPI 2×2, `instructor-landing-myday-mobile` con la **colonna orari a sinistra** (`.mobile-row-timed`, 46px), badge da `dayPhaseOf`, nessuna CTA di creazione, card METAR.
8. **Bottom sheet su tutte e quattro le liste** — `mobile-booking-sheet`, righe Aeromobile/Pilota/Istruttore/Inizio/Fine/Durata/Note (lo stato è il badge, non una riga duplicata); card = **un solo `<button>`**, zero `button`/`<a>` annidati (misurato); nome accessibile parlante; apertura da tastiera e ritorno del focus verificati.
9. **Testid** — nessun testid desktop toccato; duplicati mobile col suffisso, superfici solo-mobile col prefisso. **Deviazione motivata**: NON ho usato `booking-row-mobile`/`booking-approve-action-mobile` (esempi dell'AC 9) ma `mobile-overview-pending-row`/`mobile-overview-approve`. Motivo: la 15.4 aggiungerà l'albero mobile **dentro `bookings-table.tsx`**, che è embeddata **anche sulla home** ⇒ quei nomi sarebbero diventati doppi sulla home, cioè esattamente il difetto che la convenzione previene. La card in attesa è una superficie della home, non il gemello mobile della tabella.
10. **Geometria e layering** — nessun overflow di pagina su tutte e tre le facce a 375 e 390px (misurato); `mobile-shell.spec.ts` verde **senza modifiche**; hit-test manuale a fondo pagina: 0 controlli inghiottiti dalla tab bar, 0 controlli sotto i 44px nell'albero mobile; sheet (z 40) dipinge sopra la tab bar (`elementFromPoint` sulla barra restituisce un nodo dentro `.mobile-sheet`).
11. **Regola → guardia** — tabella in §5, con prova di discriminanza.
12. **Invarianti** — desktop **misurato invariato** (§7): 9 snapshot (3 facce × 1280/800/641px), 10 campi geometrici ciascuno, differenza **zero** su ogni box visibile. `npm run gates` verde. Nessuna dipendenza nuova, nessun token cambiato di valore, nessun literal di colore nuovo (le due nuove regole di colore riusano `var(--bad)` e `var(--ink-4)`). Stringhe nuove in **entrambi** i locale. Contrasto misurato in chiaro e scuro (§6).

## 3. File toccati

**Nuovi** — `src/lib/booking-day-phase.ts` (+ test), `src/lib/overview-alerts.ts` (+ test), `src/app/[locale]/dashboard/bookings/booking-transition.ts`, `src/app/[locale]/dashboard/mobile-booking-list.tsx`, `src/app/[locale]/dashboard/mobile-pending-bookings.tsx`, `src/components/dashboard/mobile-alerts-card.tsx`, `src/components/dashboard/mobile-metar-card.tsx`, `e2e/mobile-overview.spec.ts`, `e2e/mobile-metar.spec.ts`.

**Modificati** — `src/app/[locale]/dashboard/page.tsx` (le tre facce), `src/styles/airops.css` (+193 righe, un blocco in coda), `src/app/[locale]/dashboard/bookings/bookings-table.tsx` (solo AD-2, v. sotto), `messages/{it,en}.json` (solo aggiunte), `playwright.config.ts` (progetto `mobile-metar` in catena).

**AD-2, `bookings-table.tsx`**: estratti in `booking-transition.ts` la richiesta, il ramo 409 e la mappa codice→messaggio; `transition` è ora un wrapper di 10 righe, `confirmCancel` usa le stesse due funzioni, `ApiErrorBody`/`errorBodyOf`/`errorMessage` locali rimossi, `BookingsTableLabels.actions.errors` è il tipo condiviso. Comportamento invariato per costruzione (corpi spostati verbatim); guardia = `bookings.spec.ts`.

## 4. Decisioni non ovvie (e perché)

1. **Un solo link per destinazione.** Calendario e tabella prenotazioni vivono **entrambi** su `/dashboard/bookings`: la card in attesa NON ha un footer "Tutte le prenotazioni" e la riga `.mobile-shortcuts` porta una sola voce "Pianificazione" (più "Aeromobili"). Due CTA con la stessa destinazione sono un difetto, non una feature.
2. **Chevron sulla coda in attesa.** Le altre tre liste riempiono la colonna destra con un badge di stato; qui ogni riga è PENDING per costruzione (la testata lo dice già), quindi un badge non direbbe nulla — e R-15.3-b ha togliendo i bottoni inline anche togliuto il segnale "questa riga fa qualcosa". Il chevron (`Icon.chevR`, `--ink-4`, misurato 3.66/4.14:1) è l'affordance che rimette quel segnale.
3. **`.ppr-card*` NON generalizzato.** La ricognizione chiedeva di valutarlo "solo se a costo zero": le righe di questa story hanno un chip marche, una colonna orari e un badge a destra che la card PPR non ha, quindi la generalizzazione avrebbe cambiato la resa della coda PPR a 375px. Famiglia sorella (`.mobile-row*`), duplicazione dichiarata.
4. **Tetto del feed e "Vedi tutte".** Le scadenze a ≤30g/≤60g NON sono scartate: entrano dopo la riga PPR. Motivo: su mobile il feed **sostituisce** `ScadenzeWidget` (R-15.3-d), la cui finestra di default è 30 giorni; scartarle avrebbe fatto vedere al telefono **meno** del desktop. Il tetto le nasconde per prime, che è l'intento dell'ordine ratificato.
5. **Spec METAR separato e in catena serializzata.** La card esiste solo con una stazione **configurata**, e configurarla è una scrittura su `AppSetting` globale: sotto `fullyParallel` farebbe comparire la weather-card della sidebar (e sparare un fetch upstream) sotto i piedi di ogni altro spec. Nuovo progetto `mobile-metar`, ultimo della catena, che ripristina "nessuna stazione" in `afterAll`. Ed è l'unica asserzione della story che dipende da un servizio terzo: se `aviationweather.gov` non è raggiungibile il test **skippa dicendolo**, non falsifica.
6. **Fixture "a cavallo di adesso".** `createBooking` rifiuta `startsAt <= now` per **tutti** (`BOOKING_IN_PAST`), ma `updateBooking` esenta lo staff da quel check (asimmetria documentata: "staff can correct an in-progress booking"). La fixture nasce nel futuro e viene **spostata** su adesso: nessuno `sleep`, nessun test dipendente dall'ora.
7. **PENDING creata da admin.** Una prenotazione creata dallo staff nasce APPROVED e `APPROVED → PENDING` non è una transizione legale: il helper passa per `NO_SHOW → PENDING` (due hop legali) invece di far girare il flusso di invito Mailpit in ogni test.
8. **`—` come segnaposto di valore assente** (`mobile.detail`, `noValue`): è l'idioma già usato da `ppr-console.tsx` e dai KPI. La skill `design-taste-frontend` vieta l'em-dash come vezzo tipografico; qui è un valore di dominio ("nessun istruttore"), coerente con l'app, non decorazione.

## 5. Regola nuova → guardia, con prova di discriminanza

Ogni riga è una regola introdotta per un difetto **misurato**. La colonna "pre-fix simulato" riporta il valore misurato con la regola neutralizzata a runtime (injection CSS / rimozione della classe modificatore), col repo **intatto**.

| # | Regola | Guardia | Pre-fix simulato | Discriminante |
|---|---|---|---|---|
| i | `.overview-mobile{display:none}` **fuori** dalla media query | `mobile-overview.spec.ts` — `toBeHidden(mobile-overview-inprogress)` + `display === 'none'` a 1280px | injection `.overview-mobile{display:flex!important}` → `display: flex`, elemento **visible: true** | ✅ la guardia diventa rossa |
| ii | `.home-desktop-surface{display:none}` **dentro** la query | stessa spec — `every(display === 'none')` sui 3 nodi a 375/390px | injection `display:block!important` dentro la query → `['block','block','block']` | ✅ |
| iii | `.kpi-row.kpi-row-grid` (griglia 2×2 dove i KPI sono 4) | stessa spec — **tutti e 4** i KPI `reachable()` con `scrollLeft === 0` **e** `scrollWidth <= clientWidth`; la prova di discriminanza è **dentro il test** (`classList.remove('kpi-row-grid')` → l'ultimo KPI torna `reachable() === false`) | senza la classe: ultimo KPI **non** raggiungibile (è la strip 15.2, come asserisce `mobile-primitives.spec.ts:195`) | ✅ — ed è scritta sul lato che la regola **libera**, non su "la riga esiste" |
| iv | card METAR solo ≤640px | `mobile-metar.spec.ts` — visible a 375px, `toBeHidden()` + box di larghezza 0 a 1280px | injection che riapre l'albero mobile a 1280px → card **visible: true** | ✅ |
| v | `.mobile-metar-raw{overflow-wrap:anywhere}` | stessa spec — `boxOverflow <= 0` con un **token non spezzabile** iniettato (oltre alla riga lunga realistica e al check di pagina) | con `overflow-wrap:normal`: `boxOverflow` **0 → 143px**, la `.card` ne ritaglia **126px** (page overflow resta 0: `.card{overflow:hidden}` lo nasconde) | ✅ **ma solo sul token non spezzabile**: v. nota sotto |
| vi | un solo empty state per lista | `mobile-overview.spec.ts` — `toHaveCount(1)` su `instructor-landing-myday-empty` **e** su `…-empty-mobile` | non simulabile a runtime: un doppione richiede una modifica di codice | ⚠️ strutturale, dichiarato |
| vii | `html[data-theme="dark"] .mobile-alert-row .list-icon.red{color:var(--bad)}` | **nessuna asserzione e2e**: il contrasto è misurato via canvas→WCAG (§6), non asserito nella suite | pre-fix misurato in §6 | ⚠️ dichiarato: nessuna guardia automatica sul contrasto esiste in questo repo (vale per tutte le superfici, non solo per questa) |

**Nota onesta su (v)**: con una riga METAR **realistica** (che contiene spazi) la regola non cambia nulla — il word-wrap normale la manda a capo già così, `boxOverflow` resta 0 in entrambi i casi (misurato). La regola è load-bearing **solo** contro un token unico più largo del box, ed è per quello che la spec inietta anche quel caso: senza il secondo probe la guardia sarebbe stata cieca esattamente come la guardia KPI della 15.2.

**Nota su `mobile-primitives.spec.ts` (il test più esposto della story)**: resta verde **e va detto perché**. Gira sulla home **admin**, che ha **5** KPI ⇒ la `.kpi-row` lì non porta `kpi-row-grid`, resta la strip della 15.2, `.kpi-row` resta figlio DIRETTO di `.page` (nessun wrapper introdotto attorno ad essa: l'albero mobile è un **fratello** della riga KPI, non un contenitore), i `children` restano 5 e l'ultimo resta non raggiungibile. La griglia 2×2 vale solo per le due facce a 4 KPI.

## 6. Contrasto misurato (canvas → WCAG), chiaro e scuro, 375px

| Superficie | chiaro | scuro | soglia |
|---|---|---|---|
| titolo card (13.5/600) | 18.79 | 15.74 | 4.5 ✓ |
| conteggio card mono (10.5) | 4.85 | 5.72 | 4.5 ✓ |
| titolo riga (13/600) | 18.79 | 15.74 | 4.5 ✓ |
| sub riga mono (10.5) | 4.85 | 5.72 | 4.5 ✓ |
| chip marche (10.5/500) | 17.01 | 17.67 | 4.5 ✓ |
| titolo avviso (12.5/500) | 18.79 | 15.74 | 4.5 ✓ |
| sub avviso mono (10.5) | 4.85 | 5.72 | 4.5 ✓ |
| label METAR mono (9.5) | 4.85 | 5.72 | 4.5 ✓ |
| station METAR (11) | 9.99 | 9.47 | 4.5 ✓ |
| temperatura (26/600) | 18.79 | 15.74 | 3.0 ✓ |
| raw METAR (11) | 9.05 | 10.63 | 4.5 ✓ |
| empty state (12.5) | 4.85 | 5.72 | 4.5 ✓ |
| bottone shortcut (13/500) | 18.79 | 15.74 | 4.5 ✓ |
| **icona avviso `red`** | 8.38 | **4.94** (pre-fix: v. sotto) | 3.0 (oggetto grafico) ✓ |
| icona avviso `amber` | 11.32 | 9.74 | 3.0 ✓ |
| chevron coda (oggetto grafico) | 3.66 | 4.14 | 3.0 ✓ |

Il difetto dark di `.list-icon.red` è stato **visto** in screenshot (quadratino rosso pieno, glifo assente) e la correzione è misurata sopra a **4.94:1**. Il valore *pre-fix* è riportato nel commento CSS della regola.

## 7. Desktop invariato — misura pre/post

Metodo: script `playwright-core` che raccoglie 10 campi geometrici (`.page`, `.page-head`, `h1`, `.sub`, il contenitore azioni, `.kpi-row` + `display` + box di ogni card KPI, i box di **ogni** `.card` della pagina, `grid-template-columns` di `.app`, `scrollHeight`, overflow orizzontale) su **3 facce × 3 larghezze** (1280 / 800 / **641**) = 9 snapshot; poi `git stash` delle sole modifiche tracciate, stesso script, `git stash pop`, diff campo per campo.

**Risultato: 9 snapshot, 9 campi differenti, tutti della stessa specie** — la lista `cards` guadagna N voci `[0,0,0,0]` (le card mobile, in DOM ma `display:none` ⇒ box a dimensione zero). **Ogni box visibile è identico al pixel**, e identici sono `.page`, `.page-head`, `h1`, `.sub`, azioni di testata, `.kpi-row` (posizione, dimensione, `display: grid`, box di ogni card), `grid-template-columns` di `.app` (incluso il rail `64px` a 641px, R1), `scrollHeight` e overflow. Nessun cambiamento desktop, misurato e non dedotto.

## 8. Blast radius — chiuso voce per voce

| # | Voce | Esito |
|---|---|---|
| 1 | `e2e/home-dashboard.spec.ts`, 7 punti | **verde**, senza modifiche. Nessun heading/testid/KPI duplicato: `mobile-overview.spec.ts` lo asserisce a 375 **e** 1280px su 10 testid + heading + `.kpi-row` (1) + `.kpi-value` (5). |
| 2 | `e2e/mobile-primitives.spec.ts:172-265` | **verde**, senza modifiche, e riletto: v. la nota in §5 (è admin, 5 KPI, la strip resta; `.kpi-row` resta figlio diretto di `.page` perché l'albero mobile è un fratello). |
| 3 | `e2e/mobile-shell.spec.ts` (incl. bottom-geometry su ogni `.page a, .page button`) | **verde**, senza modifiche. Hit-test manuale ripetuto a fondo pagina con l'albero mobile presente: 0 controlli coperti dalla tab bar, 0 controlli sotto 44px. |
| 4 | `e2e/pdf-exports.spec.ts:375` (`bookings-list-section`) | intatto: la tabella è **wrappata**, non modificata, e il testid resta 1 nodo (asserito). |
| 5 | `e2e/bookings.spec.ts` (guardia di AD-2) | v. §9: 6 test rossi nella run completa, **causa accertata: inquinamento del DB fatto da me durante la verifica interattiva**, non il codice. Prova nel dettaglio in §9. |
| 6 | `movements`, `login`, `flights`, `user-management`, `account-adjustments`, `ppr-queue` (passano dalla home) | **verdi** — nessun errore SSR sulla home. |
| — | Tablet 641-900px | misurato a 641 e 800px: nessuna superficie nuova compare, `display` degli alberi mobile `none`, rail 64px intatto, overflow 0. |
| — | Tema scuro delle superfici nuove | misurato (§6); trovato e corretto 1 difetto (correzione 4). |
| — | Sub-riga della testata admin a 375px | 4 segmenti, va a capo su 2 righe dentro `.page-head{flex-wrap:wrap}`, nessun overflow (misurato 0). |
| — | Unit | 1626 test verdi; 21 nuovi (9 su `booking-day-phase`, 12 su `overview-alerts`), verificati anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` (funzioni pure: nessuna catena `@/lib/env`). |

## 9. Esito ONESTO della suite e2e

`npm run gates`: **verde** (lint / typecheck / 1626 unit / build), rieseguito come ultima cosa prima del commit.

**Run completa `CI=1` su build di produzione** (`playwright test`, foreground con output su file, 13.4 min): **290 passed, 13 failed**. Le 13 sono state diagnosticate **una per una**; **nessuna è causata dal codice di questa story**, e la prova per la voce che pesa (la guardia di AD-2) è un run a confronto sul baseline. In compenso **due erano miei test scritti male** e li ho corretti.

| Classe | Test | Causa accertata | Prova |
|---|---|---|---|
| A — DB oltre il tetto dei picker | `flight-log:289`, `flight-reversal:161`, `flights:483`, `reports:206` | il `<select>` "Velivolo" del registro voli è cappato a `OPTIONS_PAGE_SIZE = 100` (`logbook/page.tsx:33`) e il DB ne aveva **154** (ora 422): `selectOption` non trova più l'opzione della propria fixture e va in timeout | conteggio DB + messaggio `did not find some options`; limitazione preesistente dell'app, nessuna riga del mio diff tocca velivoli o voli |
| B — mia fixture interattiva | `bookings.spec.ts` × 6 | avevo registrato una scadenza **scaduta non bloccante** ("Inglese ICAO") sul pilota di **seed** durante la verifica interattiva: la form di creazione passa allora al ramo `successWithWarnings` e `booking-form-success` non compare più | snapshot DOM del fallimento: «Prenotazione creata. Attenzione: i seguenti documenti risultano scaduti (non bloccanti): **Inglese ICAO**». Scadenza rimossa. |
| C — asserzione dentro una finestra cappata | `home-dashboard:228` (preesistente), **`mobile-overview:238` e `:280` (miei)** | la card della home è una **finestra di 8 righe** ordinata per `startsAt` sulle ultime 48h: con 269 prenotazioni in DB una fixture specifica non ci sta. È la trappola "fotografia + uguaglianza" della review Billing-2 F4 | **corretti i miei due test**: la decisione si rilegge dall'API filtrata sul velivolo run-unique (deterministico), e il rendering desktop di una riga APPROVED/DENIED resta guardato da `bookings.spec.ts` |

**Prova che AD-2 non rompe `bookings.spec.ts`** (la voce più delicata del blast radius): `bookings.spec.ts --project=chromium --workers=1` eseguito due volte sullo stesso DB, prima col mio albero e poi col **baseline** (`git stash` delle sole modifiche tracciate, quindi build senza la mia estrazione):

- **mio albero: 10 failed / 24 passed**
- **baseline: 11 failed / 23 passed** — questo è il run lanciato col nuovo runner distaccato
  (`bash scripts/e2e.sh start e2e/bookings.spec.ts --project=chromium --workers=1`); `scripts/e2e.sh
  status` lo riporta come `state: DONE — E2E_EXIT=1`, `11 failed / 23 passed (12.5m)`, log in
  `/tmp/airmanager-e2e/last-run.log` (verificabile finché la macchina non ripulisce /tmp).

`comm -13 baseline mine` = **insieme vuoto**: nessun test fallisce col mio codice che non falliva già senza. Il baseline ne fallisce perfino uno in più (`:1645`). Le 10 sono tutte "riga non trovata in una lista paginata" o timeout della funzione che scorre le pagine a caccia della propria riga — cioè volume di DB, non la transizione.

**Run di verifica delle mie spec dopo le correzioni** (`bookings + mobile-overview + mobile-primitives + mobile-shell`, `CI=1`, DB con i `sched.*` residui rimossi): **41 passed / 9 failed**, e i 9 sono solo `bookings.spec.ts` (classe A/B/C sopra). Le mie: **`mobile-overview` 9/9, `mobile-primitives` 3/3, `mobile-shell` 5/5**. `mobile-metar` 2/2 (run dedicato, progetto in catena).

**Cosa NON è stato fatto e perché**: una run completa **valida** su **DB fresco**. Il DB condiviso è arrivato a **422 velivoli / 269 prenotazioni** durante questa sessione (il primo tentativo di suite l'ho lanciato per errore su `next dev` con 2 worker: invalido per contesa, ma ha comunque creato fixture) e oltre le 100 unità supera il tetto dei picker dell'app, quindi qualunque run successivo è inquinato per costruzione. **Non ho resettato il DB**: la regola di progetto lo riserva alla sessione principale (`docs/handoffs/HANDOFF.md`) e c'è un rischio noto di collisione fra sessioni parallele — che in questa sessione si è materializzato (il commit `1dab4fc` di un'altra sessione ha introdotto `scripts/e2e.sh` mentre lavoravo). ⇒ **la run completa su DB fresco la deve rifare la review, da arbitro** (prassi 13.9/13.11/15.2). Aspettativa: le classi A e B sparirebbero da sole; della classe C resta solo `home-dashboard:228`, che è una fragilità **preesistente** di quella spec.

Due residui che ho ripulito a mano sul DB condiviso, dichiarati: la mia scadenza scaduta sul pilota di seed (classe B) e le righe `sched.*` che la catena serializzata di un run precedente aveva lasciato (07:00-21:00), che facevano fallire con 422 `BOOKING_OUTSIDE_WINDOW` ogni creazione fuori orario — incluse due mie fixture. Da lì una correzione utile: **le fixture di `mobile-overview.spec.ts` non sono più ancorate all'orologio** (`safeSlotTomorrow`, slot alle 07:30Z = 08:30/09:30 Roma, dentro qualunque finestra la suite configuri e prima dello slot `09:00Z` usato dalle altre spec), e la fixture "a cavallo di adesso" nasce nella finestra e viene **spostata** su adesso, perché `updateBooking` è l'unico percorso senza controllo di finestra.

⚠️ **Nota per la review sul runner**: durante il mio lavoro un'altra sessione ha committato `scripts/e2e.sh` (runner distaccato) e la regola CLAUDE.md «MAI `playwright test` in foreground». I run riportati sopra sono stati lanciati prima di quel cambio (foreground con output su file, e background della mia shell) **tranne il confronto sul baseline**, che è passato dal nuovo runner e il cui esito è leggibile con `scripts/e2e.sh status` — è quindi l'unico dei miei run che la review può riauditare senza rieseguire nulla. Chi riprende il lavoro: build+start UNA volta, poi `E2E_REUSE_SERVER=1 bash scripts/e2e.sh start ...` per ogni run, così la build non si ripaga. Porta :3000 lasciata **libera** (nessun processo `next` residuo, verificato). Il progetto Playwright `mobile-metar` che aggiungo convive con la loro modifica di `playwright.config.ts` (`reuseExistingServer` con opt-in `E2E_REUSE_SERVER`): il file in HEAD contiene **entrambe** (verificato su `git show HEAD:playwright.config.ts`).

## 10. Debito tecnico da tracciare (non chiuso qui)

1. **METAR nella fascia 641-900px** — dichiarato fuori scope dalla story (R1): la `.weather-card` della sidebar è nascosta lì da 13.10 e la card mobile vive solo ≤640px, quindi il tablet resta senza meteo. Da mettere in `sprint-status.yaml`.
2. **`.list-icon.red` in tema scuro** — difetto **preesistente** (misurato **1.35:1**) che colpisce il `ScadenzeWidget` desktop. Qui è corretto solo sulla superficie nuova, per non modificare il desktop in una story "desktop invariato". Il fix globale è una riga (`html[data-theme="dark"] .list-icon.red{ color: var(--bad) }`) e va deciso dal PO.
3. **Tetto `OPTIONS_PAGE_SIZE = 100` dei picker** — con più di 100 velivoli in anagrafica il `<select>` del registro voli non contiene più l'ultimo creato. Su un'aviosuperficie reale non succede, ma **la suite e2e ci muore** su un DB riusato (4 test). Emerso qui, non causato qui.
4. **`home-dashboard.spec.ts:228`** asserisce la propria fixture dentro la finestra di 8 righe della card della home: fragile per costruzione su DB popolato, esattamente come i miei due test prima della correzione. Da riscrivere con la stessa medicina.

## 11. Cosa NON ho fatto (dichiarato)

- **Nessuna guardia automatica sul contrasto**: le misure di §6 sono state prese con uno script throwaway, non sono asserzioni della suite (nel repo non esiste un guard di contrasto per nessuna superficie).
- **Nessun focus trap / `aria-modal`** sullo sheet: è 15.10, e la baseline di tastiera della 15.1 è rispettata (focus al pannello, ritorno al trigger, Escape) e verificata.
- **`bookings-table.tsx` non ha un albero mobile** (AD-2): è 15.4. Per questo la coda in attesa della home è un componente nuovo con testid `mobile-overview-*`, che non ruba i nomi che la 15.4 vorrà.
- **Nessun delta sotto i KPI** (R-15.3-g) e **nessun avviso sulle facce pilota/istruttore** (il template non ne dà, le loro scadenze sono già nei KPI).
- **Nessuna modifica al desktop**, nemmeno per riparare il difetto dark di `.list-icon.red` (v. §10.2).

---

# Review Record — 15.3 (reviewer adversarial, Opus 5 xhigh, 2026-07-30)

Report integrale con le evidenze: `_bmad-output/implementation-artifacts/15-3-review-report.md`.
Qui il riassunto decisionale: verdetto, esito dei claim, cosa è stato fatto di ogni finding,
le ratifiche PO sopraggiunte e il gate finale.

## Verdetto: **SHIPPABLE-WITH-FIXES** — nessun blocker

Le 8 ratifiche PO sono implementate tutte e otto. L'RBAC regge alla prova sull'HTML grezzo per
tutti e quattro i ruoli. Il gate arbitro della review, su **DB fresco**, è **320/320, `E2E_EXIT=0`**
(gates: 1626 unit). Restano **4 Medium** e **4 Low**, tutti chiusi (v. sotto).

## I 5 claim del dev, verificati

| Claim | Esito |
|---|---|
| «290 passed / 13 failed, nessuna dal codice della story» | ✅ **VERO**, alla prova più forte: su DB fresco i 13 rossi spariscono tutti (320/320). Le tre classi di attribuzione (A tetto `OPTIONS_PAGE_SIZE`, B fixture interattiva, C finestra cappata) erano corrette. La classe C era perfino **pessimistica**: `home-dashboard:228`, dato per rosso residuo, passa. |
| «Guardia AD-2: nessun test fallisce solo col mio codice» | ✅ **VERO, con prova più forte** — `bookings.spec.ts` interamente verde (34/34). ⚠️ Il log del confronto baseline del dev non era più riauditabile: `scripts/e2e.sh start` sovrascriveva `last-run.log` (v. §"strumento" sotto). |
| «Desktop invariato: 9 snapshot, differenza zero» | ⚠️ **VERO ma di scopo troppo stretto**: misurato in modo indipendente a 641/800/1280px, tutto conferma. Ma "desktop invariato" ≠ "nient'altro è cambiato": **F1 è una regressione su un'altra superficie MOBILE**, che nessuno dei 9 snapshot poteva vedere. |
| «2 miei test erano scritti male, corretti e non resi ciechi» | ✅ **VERO**: le correzioni rileggono la decisione dall'API filtrata sul velivolo run-unique, e la guardia KPI 2×2 è stata rimisurata indipendentemente (strip → `[true,true,false,false,false]`, griglia → `[true,true,true,true]`: discriminante). |
| «Deviazione testid `mobile-overview-*`» | ✅ **REGGE**: `BookingsTable` è embeddata anche sulla home, quindi in 15.4 il suo albero mobile emetterebbe `booking-row-mobile` proprio lì — il doppione che la convenzione previene. |

## Findings — cosa è stato fatto (fix in `7c08be9`, F8 in questo commit)

| # | Sev | Difetto | Chiusura |
|---|---|---|---|
| **F1** | 🟠 M | `.home-head-actions .btn` era un selettore **discendente** e `DispatchFlightButton` monta trigger e pannello come **fratelli**: la regola raggiungeva il piede del `SlideOver` a tutto schermo — superficie che la story dichiarava intoccabile. Misurato: "Registra volo" da 118px a **191px** stirati. | Figlio diretto (`> .btn`): la regola resta sui bottoni della testata qualunque cosa un figlio monti sotto. |
| **F2** | 🟠 M | La mitigazione "riga stantia" era agganciata al **409**, ma lo scenario che documenta ("un altro operatore ha già deciso") risponde **422** `BOOKING_TRANSITION_INVALID` (il 409 è sovrapposizione di slot): lo sheet restava aperto su una riga morta. | Campo `stale` distinto da `conflict` nell'outcome: lo sheet chiude e la riga sparisce. Desktop invariato (usa il suo booleano). Ramo ora coperto da e2e. |
| **F3** | 🟠 M | "Prenotazioni in attesa": la testata contava **10**, la card ne elencava **8**, senza alcun segnale di troncamento. | Footer "+N · Vedi tutte" verso il filtro PENDING, col pattern già scritto nella card sorella Avvisi. |
| **F4** | 🟠 M | Due `mobile-booking-sheet` aperti insieme dopo 2 Tab: due `role="dialog"`, due scrim, testid duplicato. | Risolto nella **primitiva**, non nei chiamanti: "uno sheet alla volta" è una proprietà del pattern, e la 15.4 in avanti aggiunge coppie di proprietari. Identità per **token di istanza**, così un'istanza non può chiudere se stessa ri-registrandosi. |
| **F5** | 🟡 L | La regola «feed Avvisi SOLO sulla faccia admin» (AC 4 / R-15.3-e) non aveva guardia — e protegge dati finanziari di terzi. | Guardia e2e sull'esclusività admin. |
| **F6** | 🟡 L | Il METAR era `await`-ato **in serie** dopo il `Promise.all`, su tutte e tre le facce e a ogni larghezza. R-15.3-f aveva ratificato il doppio fetch, **non** la serializzazione. | METAR dentro il `Promise.all` sulle tre facce. |
| **F7** | 🟡 L | «+N altri» del feed presentava come totale un numero che lo scan a monte aveva già cappato. | **Ratifica PO**: "+N e oltre" quando lo scan era cappato, invece di un totale che mente. |
| **F8** | 🟡 L | La regola d'ordine di AC 1 era guardata per 3 superfici su 5 e **la posizione della card METAR da nessuna parte**: `mobile-overview.spec.ts` gira nel project `chromium`, dove la stazione non è configurata — lì la card non è proprio nell'albero, e `order.slice(0,3)` resta verde per una card scivolata in fondo. | Asserzione d'**ordine intero** (non un prefisso) in `mobile-metar.spec.ts`, cioè dove la card esiste davvero: `.overview-mobile` a 5 voci e `.landing-mobile` a 2 sulle facce pilota/allievo/istruttore. |

**Discriminanza di F8, misurata** (mutazione del DOM col repo intatto, stazione configurata):

| Superficie | Intatto | METAR spostata |
|---|---|---|
| admin `.overview-mobile` | verde | **rossa** — mentre l'asserzione a prefisso del dev, sulla **stessa** mutazione, resta **verde (cieca)** |
| pilota `.landing-mobile` | verde | **rossa** |
| istruttore `.landing-mobile` | verde | **rossa** |

## Ratifiche PO sopraggiunte in review (2)

- **Glifo in tema scuro — il fix diventa GLOBALE** (copre anche il `ScadenzeWidget` desktop, chiudendo il TD §10.2 del Dev Record). La lezione sta nella misura: il dev aveva riparato `.list-icon.red` (1.35:1) e dichiarato che l'ambra andava bene, ma **nessuno aveva misurato il gemello verde**, che stava a **1.24:1 — peggio del difetto trovato**. Ora 7.00:1 e 4.96:1; `.amber` non serviva (9.70:1). *Enumerare gli esemplari di un pattern, mai fidarsi dell'elenco di chi ha fatto il fix.*
- **F7**: "+N e oltre" al posto di un totale cappato.

## Gate finale

- Arbitro della review sul commit di codice `99d6453`, DB fresco: **320 passed, 0 failed, 0 flaky, `E2E_EXIT=0`** (7.9m).
- Arbitro sul commit di fix `7c08be9`, DB fresco: **325 passed, 1 flaky, 0 failed, `E2E_EXIT=0`** (9.3m). L'unico flaky è `billing.spec.ts:296` (`depositsTotalAfter - depositsTotalBefore` = 5000 invece di 10000), **retry verde**: è un delta-assert su un aggregato **globale** sotto `fullyParallel`, la classe Billing-2 F4 — non attribuibile a questa story, le cui spec non creano alcun movimento di denaro (verificato). Va a TD.
- **Arbitro finale sullo stato committato** (F8 incluso), DB resettato prima del run e verificato fresco (1 velivolo / 0 prenotazioni / 4 persone / 0 tentativi di login): **326 passed, 0 failed, 0 flaky, `E2E_EXIT=0`** (8.2m, `CI=1` su build di produzione). Il flaky di `billing.spec.ts:296` non si è ripresentato — coerente con la diagnosi "contesa fra worker", non un difetto stabile. `npm run gates` verde, **1630 unit**.
- F8 verificata anche mirata: `mobile-metar` **2/2 in 6,6s** sul server di produzione riusato.

## Strumento — una perdita di evidenza chiusa in corsa

`scripts/e2e.sh start` **troncava** `last-run.log`: un run mirato lanciato subito dopo un run
arbitro ne distruggeva l'unica prova, e `status` non poteva più rileggerla. Segnalato dalla review
(§5 del report) e **ri-innescato durante questa chiusura**. Ora il log precedente viene ruotato in
`<log>.prev`. Non è un finding della story: è l'infrastruttura che la story stessa ha introdotto
(`1dab4fc`), riparata dove faceva danno.

## TD lasciati aperti (in `sprint-status.yaml`)

1. **METAR invisibile nella fascia 641-900px** — fuori scope per R1, owner naturale 15.10.
2. **Tetto `OPTIONS_PAGE_SIZE = 100`** dei picker — il rimedio esiste già in casa (typeahead server-side, story TD-3) ma non è applicato al `<select>` Velivolo del registro voli.
3. **`home-dashboard.spec.ts:228`** — fixture cercata dentro la finestra di 8 righe della card della home: fragilità preesistente, stessa medicina già applicata ai due test del dev.
4. **`billing.spec.ts:296`** — delta-assert su aggregato globale: la mitigazione "delta invece di fotografia" non basta quando l'aggregato è globale e altre spec scrivono acconti in parallelo.
