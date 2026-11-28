---
baseline_commit: e951960
---

# Story 17.2: La timeline di Pianificazione scala — righe scelte dal server, griglia in CSS, filtro server

Status: **done** (2026-11-25) — pronta il 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `e951960`). **Dev: Opus 5 xhigh** (UI: `schedule.tsx`, `airops.css`, due pagine, i18n; il backend è una funzione). Review: Opus 5 xhigh adversarial. **Ordine**: dopo la 16.8 (aggiunge la riga «Archiviato» desktop `schedule-archived-status` e mobile kind `archived`, `listArchivedAircraftByIds`, precedenza archiviato > fuori servizio, e un link gemello del banner sull'archivio che «la 17.2 aggiorna per entrambi») — se la 16.8 non fosse atterrata, la 17.2 la precede e la 16.8 adegua il suo AD-10 (T6). 18.7-D1 dipende da questa story. Righe da rileggere su HEAD al momento del dev.

## Story

As an **admin sulla Panoramica e sulla Pianificazione**,
I want vedere i velivoli che contano oggi e trovare gli altri con un filtro,
so that le due pagine di atterraggio non rendano 1 460 righe e decine di migliaia di nodi (perf F1, F9; ui D1) e restino leggibili già a 185 velivoli.

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 17.2»; `perf-load-report.md` F1, F9; `ui-review.md` D1; TD AOG-1b-b (owner 17.2, in `sprint-status.yaml`).

## Stato su HEAD (misurato il 2026-11-03)

- **Righe**: Pianificazione `bookings/page.tsx:141-143` chiama `listBookableAircraft(actor)` che finisce in `Schedule aircraft=` (`:434`), nel picker (`:459`) e nell'agenda mobile (`buildAgendaEntries(calendarBookings, aircraftOptions, now)` `:287`); Panoramica `dashboard/page.tsx:301` → `:648` (Schedule) e `:679` (picker). `listBookableAircraft` (`bookings.service.ts:1691-1699`) = `findMany` con `archivedAt: null`, senza `take`. `schedule.tsx:603-672` disegna una `.sched-row` per velivolo; la fila di targhette mobile (`:728-753`) mette un `<button>` per velivolo a ogni larghezza, nascosto via CSS (1 460 bottoni anche a 1280 e sulla Panoramica).
- **Conteggi su `airmanager_load`**: 1 501 velivoli, **1 460 non archiviati**, **82 fuori servizio** non archiviati (2 archiviati); 40 000 prenotazioni (7 168 APPROVED, 4 832 PENDING); 382 APPROVED future su 81 fuori servizio; nessuna APPROVED futura su un archiviato. Giorni (Roma): 04/11 → 115 APPROVED su 108 velivoli, righe ≈ 185; **08/11 (il più pieno) → 138 APPROVED su 133 velivoli, righe 208** (EXPLAIN 6,6 ms, una query); settimana 09-15/11 → 817 APPROVED su 630 velivoli. ⚠️ Il giorno della semina l'«oggi» del DB di carico è vuoto (le prenotazioni partono da domani): una misura fatta «oggi» darebbe una vittoria finta. Query del calendario `bookings.service.ts:1028-1056` 8,9 ms; il suo `take: 1000` (`:1052`) è il cap silenzioso della 17.6.
- **Filtro velivolo**: stato client (`schedule.tsx:274` `useState('all')`, applicato `:293`, `:310-313`, `:682-687`, `:817-822`; popover `:504-514`, reso solo da aperto); la pagina pulisce solo `page/view/date/status` (`bookings/page.tsx:123`, `:215`). Il backend è già pronto: `listBookings` filtra `aircraftId` (`bookings.service.ts:972`), Zod di lista ed export lo accettano (`schemas/bookings.ts:115`; `/bookings` e `/bookings/pdf` usano lo stesso schema) → nessun cambio API/OpenAPI. TD AOG-1b-b: il link del banner fuori servizio `aircraft-editor.tsx:873` (`?status=PENDING,APPROVED`, senza velivolo) è pinnato esatto da `aog-impact-email.spec.ts:244`.
- **Griglia**: `HOURS.map(… .grid-line)` a `schedule.tsx:619-621`, CSS `airops.css:554-561`. ⚠️ **Le linee non sono 25 ma 17** con la finestra predefinita 06-22 (`HOURS = windowEndHour − windowStartHour + 1`, `booking-schedule.ts:45-46`; il «25» del piano conta anche 8 nodi strutturali). Una riga vuota oggi = 26 elementi (con la `now-line`), dopo = 9. La linea a `left:100%` è già tagliata da `.sched-track{overflow:hidden}`.
- **Picker: GIÀ FATTO** — `BookableAircraftOption` (`bookings.service.ts:1679`) e `AircraftOption` (`new-booking-form.tsx:23-29`) hanno già `id, registration, model, status, statusReason`; l'oggetto completo di F9 (`fleetItems` con contaore, note, posti, ecc.) è sparito con 19.2/19.3 (`FleetCardItem` 8 campi, `fleet-card.tsx:20-31`; `dispatchAircraftOptions` 4); il select nativo da 1 448 `<option>` è sparito con la 19.5 (`SearchCombobox` statico, opzioni rese solo da aperto, `search-combobox.tsx:428-472`). **Resta** l'elenco intero nel payload RSC: ≈ 210 KB di JSON per 1 460 velivoli (+ 374 istruttori ≈ 42 KB) — finché non arriva la ricerca server (17.6).
- **Baseline non più valide**: 2,6 MB / 43 417 nodi / 7,9 s / 14 fps sono di `b7b8d13` con Postgres di fabbrica; post-17.1 (§C) Panoramica 43 826 nodi, Pianificazione 44 163 (long task inaffidabili, MAJOR-3; byte non registrati); l'Epic 19 ha cambiato le pagine e il DB è stato ri-seminato → il «prima» va rimisurato sul HEAD pre-fix.
- DESK-2 (audit 2026-11-02, untracked: richieste in attesa disegnate come blocchi fantasma) resta aperta e fuori scope.

## Acceptance Criteria

1. **Righe (vista giorno)**: *Given* `/dashboard/bookings?date=D` o la Panoramica (oggi) *When* rende *Then* le `schedule-aircraft-row` sono, in ordine di marche: i velivoli non archiviati con ≥ 1 APPROVED che interseca il giorno D in Europe/Rome (stessi bordi di `zonedMidnightUtc`, `page.tsx:243-244`); più i non archiviati OUT_OF_SERVICE (stato attuale, mai la data: invariante [a] di AOG-1a); più gli archiviati con prenotazioni se la 16.8 è atterrata. Vista settimana: stessa regola sull'intervallo della settimana. La selezione usa gli `aircraftId` della stessa `calendarBookings` + **un** `aircraft.findMany` + un `count` (T1), non `listBookableAircraft`. Prova: unit con flotta finta di 1 000 liberi + 2 prenotati + 1 fuori servizio → 3 righe e liberi = 1 000 (rosso sul pre-fix: 1 003); e2e: il velivolo A prenotato (run-unique) c'è, il B libero no. Velivolo con sole richieste in attesa: §PO Q-17.2-e.
2. **Contatore**: con N > 0 velivoli liberi una sola riga «Altri N velivoli liberi · Mostra» (ICU `one`/`other`, testid desktop univoci); N = 0 → nessuna riga; con filtro attivo nessun contatore. Comportamento di «Mostra»: §PO Q-17.2-a.
3. **Stati vuoti**: righe = [] ma flotta > 0 → mai «Nessun velivolo disponibile.» (oggi lo farebbero `schedule.tsx:587`, che sostituisce anche la griglia settimanale, e `:759`): serve il totale della flotta, non `aircraft.length` (usato come «c'è una flotta» anche a `:729`).
4. **Filtro**: `?aircraft=<id>` pulito dal server (id sconosciuto → ignorato, mai errore), righe = [X] anche se X è libero; popover e targhette mobile diventano link (`aria-current`, `scroll: false`) con l'elenco di §PO Q-17.2-c; resta vera la relazione «targhette = voci del popover + 1» (`mobile-planning.spec.ts:382-386`); **ogni** href conserva ogni altro parametro (`calendarHref` `:328-343`, `hrefString` `:356-365`, `buildDateHref` `schedule.tsx:225-233`, `pageHref` `bookings-table.tsx:452`, `statusHref` `:470`, celle e righe della settimana); il filtro istruttore resta stato client. Portata del filtro (lista, export, link del banner): §PO Q-17.2-b.
5. **Griglia**: *Given* qualunque pagina e larghezza *Then* `.grid-line` = 0 nodi e lo stile calcolato di `.sched-track` ha un `background-image` a gradiente con N = `windowEndHour − windowStartHour` tasselli (variabile CSS `--sched-hours`, T4); e2e rosso sul pre-fix.
6. **Picker** (non regressione, già vero): `aircraftOptions` resta il DTO a 5 campi (unit `bookings.service.test.ts:2665-2672` invariato); nessun altro campo del velivolo arriva al client da Panoramica e Pianificazione.
7. **Misure** con `scripts/perf` su `airmanager_load`, nello stesso giorno D con attività (dichiarare D, righe, blocchi; scegliere D = il giorno più pieno dei prossimi 7 con la query `generate_series` + overlap su `zonedMidnight`), a 1280 e 375, su Panoramica e Pianificazione giorno/settimana/«Mostra»: `domInteractive` < 1 s a 1280, scroll ≥ 55 fps; **i nodi non dipendono dai velivoli liberi** (differenza fra «Mostra» e predefinito ≈ 9 × N, predefinito invariato). Target di peso (< 300 KB, < 3 000 nodi): §PO Q-17.2-d. Scomposizione pre-fix nel record: nodi dentro `schedule-section` / agenda mobile / resto; byte del payload RSC (`DUMP=1`, somma degli script `self.__next_f.push`) contro il markup.
8. **Parità visiva** (DB e2e, fixture run-unique): `schedule-section` post-fix in «Mostra» (o filtrato su un velivolo) contro pre-fix **a parità di righe visibili**, a 1280 chiaro/scuro, differenza di pixel sotto soglia dichiarata (il gradiente può differire di 1 px d'antialiasing); agenda mobile a 375 identica.
9. **Gate**: `npm run gates` verde; e2e via `scripts/e2e.sh` verde su DB fresco.

## Tasks / Subtasks

- [ ] Passo 0: «prima» sul HEAD pre-dev (dopo le 16.x): build una volta, server su `airmanager_load` (porta libera via `ss -ltnp`, `JOBS_SECRET` reale, `PERSON`/`AIRCRAFT` espliciti); `bench.mjs targets-hot.json 5 10`; un file target usa-e-getta fuori dal repo con `?date=D`, `?view=week&date=D` e «Mostra» (i placeholder di `bench.mjs` sono UTC); `PAGES='/it/dashboard,/it/dashboard/bookings?date=D,/it/dashboard/bookings?view=week&date=D' render.mjs 1280 375` (⚠️ `PAGES` si divide sulla virgola: niente `status=A,B`).
- [ ] Selezione righe + contatore (AC 1-3) con T1, funzione accanto a `bookings.service.ts:1691` (gate `self.read`, nessuna transazione interattiva); se la 16.8 è atterrata assorbe `listArchivedAircraftByIds`.
- [ ] Filtro server e link (AC 4) con T3; Panoramica con T5 (`bookingsHref` `dashboard/page.tsx:237-242`, prev/next `:368-373`).
- [ ] Griglia CSS (AC 5); i18n (`BookingsPage.schedule.*`).
- [ ] Unit + e2e nuovi (`e2e/schedule-rows.spec.ts` nel project `chromium`), adeguamento degli e2e che si rompono, misura «dopo», parità visiva (script `@playwright/test` usa-e-getta in /tmp, due build sullo stesso DB e2e), Dev Agent Record; target `page bookings week` e «Mostra» in `scripts/perf/targets*.json`.

## Dev Notes

**Decisioni tecniche della sessione principale**: **T1** una query `OR: [{ id: { in: bookedIds } }, { archivedAt: null, status: OUT_OF_SERVICE }]` + `count({ archivedAt: null })` (sconsigliato filtrare in memoria l'elenco del picker: va rifatto con la 17.6 e non copre gli archiviati della 16.8; per non serializzare la Panoramica si può usare il filtro di relazione `bookings: { some: … }`). **T2** l'AC del piano sul DTO del picker è già vero → non regressione; il picker tiene `model` per aderire alla lettera dell'AC anche se `aircraftOptionLabel` non lo usa. **T3** parametri `?aircraft=<id>` e uno per «Mostra», puliti dal server. **T4** griglia via `--sched-hours` sulle ore arrotondate (`page.tsx:450-451`). **T5** Panoramica: filtro e «Mostra» portano alla Pianificazione, come prev/next. **T6** ordine con la 16.8 (v. Status). Il cap 1 000 del calendario resta (flag `truncated` = 17.6): le righe derivano dallo stesso elenco dei blocchi, quindi righe ⊇ blocchi anche sotto il cap.

**Blast radius**: `bookings.service.ts` (funzione nuova); `bookings/page.tsx` (parametri, selezione, contatore, link; lista ed export se §PO Q-17.2-b = A); `schedule.tsx` (preservare `ScheduleAircraftRow` `:49-55`, filtri, righe AOG 19.12b — titolo `:323-325`, sheet `:858-880` —, `data-time` della `now-line`, i 7 testid desktop pinnati a un solo nodo `mobile-planning.spec.ts:46-58`; cambia `useState` dell'aircraft → prop, link, contatore, griglia); `dashboard/page.tsx` (`:301` resta per il picker; righe nuove per `:648`); `bookings-table.tsx:452-479`; `booking-labels.ts`; `airops.css:554-561` (+ riga del contatore); `messages/{it,en}.json`; `fleet/aircraft-editor.tsx:873` (+ il link archivio della 16.8) se §PO Q-17.2-b = A; `scripts/perf/targets*.json` (nessun placeholder nuovo). Invariati ma con input cambiato: `mobile-agenda.ts:50-71`, `booking-schedule.ts`. Consumatori di `Schedule` e di `listBookableAircraft`: solo le due pagine.

**e2e che si rompono**: `mobile-planning.spec.ts:757` (targhetta di un velivolo libero il 2031-03-11 → riscrivere con `?aircraft=`); `bookings.spec.ts:824-858` (6 velivoli liberi per allungare il popover della settimana → dare loro prenotazioni nella settimana); `aog-impact-email.spec.ts:244` (href esatto) se §PO Q-17.2-b = A. **Da riverificare**: `bookings.spec.ts:718`, `:781-805`, `:1088`, `:1119`, `:1978-2034`; `bookings.spec.ts:1227-1228` (diventa vacuo: riga assente → 0 blocchi; rinforzarlo); `mobile-planning.spec.ts:339`, `:394-401` (il click diventa navigazione), `:421`; `home-dashboard.spec.ts:145`; `mobile-overview.spec.ts:42/216/231`; `mobile-a11y-sweep.spec.ts:484-503`. Unit: `mobile-agenda.test.ts:36` regge; il mock Prisma di `bookings.service.test.ts:27-29` non ha `aircraft.count` (aggiungerlo).

**Discriminanze** (rosse sul pre-fix, solo su copia isolata con sha256): unit della selezione con 1 000 liberi; e2e zero `.grid-line`; velivolo libero run-unique assente di default e presente con «Mostra»; `?aircraft=<libero>` → una riga; crosstalk (pagina 2, targhetta di stato e prev/next conservano `aircraft`); settimana senza righe → la griglia c'è.

**Trappole**: testid — i `^=` vivi sono `mobile-tail-chip-` (conta anche `mobile-tail-chip-all`) e `schedule-filter-aircraft-`/`-instructor-`: un testid nuovo con quei prefissi rompe `mobile-planning:382-386` e `bookings:1999`; il contatore è solo desktop → nome nuovo, niente `-mobile`/`mobile-`, un solo nodo (verifica `grep -rn 'data-testid\^=' e2e/`). `router.push` scorre in cima: `scroll: false`; il filtro passa da istantaneo a un giro di server (pending → 18.3). Persone e velivoli run-unique; N si asserisce con ≥ 1 o per presenza/assenza, mai per uguaglianza (`fullyParallel`); nessun AppSetting scritto → niente catena; giorno di Roma con `toLocaleDateString('en-CA',{timeZone:'Europe/Rome'})` (lezione `mobile-planning:352-360`). Env eager: verifica `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`. i18n: numero noto al server → `t(key, values)` lato server; `one`/`other` in entrambe le lingue; mai `t.raw` su `plural`; `BANNED` vieta «timeline», «slot», «AOG», «fermo», «aeromobile» → «velivolo/i». Solo letture, niente `$transaction(async)`. Run ripetuti di bench/render → lock anti-brute-force.

**Dimensione**: ~15-18 file, +700/−200 (+3 file con §PO Q-17.2-b = A), sotto la 19.7a. Nessuno split.

### References

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §Story 17.2; `perf-load-report.md` F1/F9; `ui-review.md` D1; `16-8-archivio-velivolo-tutele-aog.md` §R (AD-10); `17-1-fondamenta-misura-configurazione.md` §C

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03 in un solo giro (AskUserQuestion: «Sì, tutte» sulle raccomandazioni presentate in linguaggio semplice).

- **Q-17.2-a — «Mostra»** = A: aggiunge nel calendario le righe vuote dei velivoli liberi, con «Nascondi» per tornare; dalla Panoramica porta alla Pianificazione.
- **Q-17.2-b — portata del filtro velivolo** = A: un filtro vale per tutta la pagina (calendario, elenco prenotazioni, export); il link «vedi prenotazioni» dell'avviso fuori servizio (e quello dell'archivio della 16.8) apre la Pianificazione già filtrata su quel velivolo (chiude TD AOG-1b-b).
- **Q-17.2-c — elenco del filtro e targhette mobile** = A: solo i velivoli con prenotazioni o fuori servizio nel periodo, più quello scelto; la ricerca per nome arriva con 17.6/18.4.
- **Q-17.2-d — traguardi di peso** = A: restano «sotto 1 secondo» e «scorrimento fluido»; «< 300 KB e < 3 000 elementi» sono sostituiti da «la pagina non cresce coi velivoli liberi» (AC 7); i 300 KB valgono dopo la 17.6.
- **Q-17.2-e — velivolo con sole richieste in attesa** = fra i liberi (il calendario mostra solo le approvate; DESK-2 resta aperta a parte).


## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List

## Verifica — 2026-11-25

- La Pianificazione seleziona lato server i velivoli con prenotazioni approvate nel periodo e quelli fuori servizio; conserva quelli archiviati con prenotazioni rilevanti. I velivoli liberi sono sintetizzati in una sola riga di conteggio. «Mostra / Nascondi» aggiunge o toglie le righe libere. Un filtro velivolo vale anche per elenco e collegamenti PDF/Excel, ed è mantenuto cambiando periodo, vista, pagina o stato. Un ID sconosciuto non genera errori. I link dei due avvisi della Flotta passano ora il singolo velivolo (TD AOG-1b-b).
- Griglia a gradiente CSS con una variabile per il numero di ore; rimosse le linee individuali. Nessun cambiamento al DTO dei selettori di creazione. Gate (lint, tipi, **2291 unit**, build) passati; verifiche mirate sulle nuove righe, i link, la griglia, l’archivio e il filtro mobile.
- Misura sintetica stessa installazione e stesso DB: 1501 velivoli, 40.000 prenotazioni, 60.018 voli. Giorno più carico nei prossimi sette: 30/11/2026, 136 approvate, **128 blocchi** disegnati in entrambe le versioni. Giorno predefinito 1.460 → 206 righe, 24.820 → 0 nodi di griglia. Panoramica misurata su oggi (senza blocchi); il giorno attivo di Pianificazione è il controllo indipendente.

| Superficie | px | Nodi prima → dopo | HTML KB prima → dopo | domInteractive ms prima → dopo | Scroll fps prima → dopo |
|---|---:|---:|---:|---:|---:|
| Panoramica | 1280 | 41.562 → 2.965 | 2485 → 648 | 1279 → 495 | 42 → 62 |
| Pianificazione, giorno | 1280 | 41.731 → 5.628 | 2491 → 851 | 1023 → 271 | 39 → 63 |
| Pianificazione, settimana | 1280 | 2.319 → 1.525 | 885 → 976 | 298 → 281 | 63 → 62 |
| Pianificazione, Mostra | 1280 | 41.731 → 15.660 | 2492 → 1420 | 958 → 564 | 44 → 60 |
| Panoramica | 375 | 41.562 → 2.965 | 2485 → 648 | 828 → 465 | 62 → 62 |
| Pianificazione, giorno | 375 | 41.731 → 5.628 | 2491 → 851 | 372 → 237 | 63 → 62 |
| Pianificazione, settimana | 375 | 2.319 → 1.525 | 885 → 976 | 249 → 281 | 62 → 62 |
| Pianificazione, Mostra | 375 | 41.731 → 15.660 | 2492 → 1420 | 400 → 336 | 63 → 62 |

- Scomposizione giorno: 41.061 → 4.958 nodi sotto la scheda, agenda invariata a 2.180; payload RSC 512 → 564 kB. Le righe predefinite non crescono coi velivoli liberi, il payload dei selettori di creazione li contiene ancora (17.6). In settimana il maggiore payload spiega perché i byte complessivi crescono anche con meno nodi.
- Parità visiva sullo stesso velivolo prenotato, stessa data: a 1280 l’immagine ha la stessa geometria (992×197), 0,896% di pixel diversi in chiaro e 0,913% in scuro; nessun pixel varia oltre 16 livelli per canale (griglia). Agenda a 375 identica pixel per pixel (317×62).
- Commit `0ebfbc2`. Arbitro completo da DB sintetico fresco: **623/623 browser, exit 0**. Il primo giro mirato ha evidenziato due attese del nuovo comportamento asincrono (scroll al popover e via URL su mobile); fissate e riprovate prima dell’arbitro.
