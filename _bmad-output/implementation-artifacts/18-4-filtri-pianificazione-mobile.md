---
baseline_commit: 1f6ab3e
---

# Story 18.4: I filtri di Pianificazione nella grammatica mobile

Status: **done** — il 2026-11-26 GPT 6 Sol xhigh ha approvato in revisione indipendente il candidato `142e81b` sulla base `c74143e`.

Piano originario del 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `1f6ab3e` con modelli statici). **Dev: Opus 5 xhigh** (UI). Review: Opus 5 xhigh adversarial. **Dipende da 17.2** (gruppo Velivolo = link `?aircraft=` sui velivoli del periodo + quello scelto, Q-17.2-c) **e 17.6** (ricerche «opzioni di prenotazione»: velivolo `self.read`, istruttore `bookings.read.names`; `SearchCombobox` con soglia 2, 20 risultati, riga «Altri risultati», label nascondibile). Va rimisurata e riletta su HEAD dopo che entrambe sono atterrate.

## Story

As an **utente da telefono che filtra la Pianificazione**,
I want uno sheet con ricerca,
so that l'ultimo popover desktop con centinaia di chip (ui M3) diventi un pannello con ricerca.

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 18.4»; `ui-review.md` M3; `17-2-timeline-pianificazione-scala.md` e `17-6-typeahead-server-cap-dichiarati.md` §PO.

## Stato su HEAD

- Il filtro è il popover desktop anche a 375 (`bookings/schedule.tsx`): trigger `schedule-filter-toggle` `:455-464`; popover `position:fixed` largo `FILTER_POPOVER_WIDTH=320` (`:220`, `:471-497`); gruppo Velivolo = un `<button>` per velivolo (`:500-521`, `schedule-filter-aircraft-{id}`); gruppo Istruttore solo se `instructors.length>0` (`:524-547`); Reimposta/Fatto `:549-558`; stato client `useState('all')` `:274-275`; nessuna regola CSS ≤ 640 per il popover; targhette mobile `mobile-tail-chips` `:729-753` (un bottone per velivolo, sempre nel DOM).
- Elenchi: velivoli da `listBookableAircraft` (`bookings/page.tsx:143`, `bookings.service.ts:1691-1699`); istruttori da `listActiveInstructors` (`:1721`, solo con `bookings.read.names`, `page.tsx:158`; secondo chiamante la Panoramica `dashboard/page.tsx:302`, che incorpora lo stesso `Schedule`).
- Gli altri filtri mobile sono `SlideOver` a tutto schermo con bozza + «Applica»: Registro voli (`logbook-console.tsx:870-965`, trigger solo telefono `mobile-flight-filters-button` `:579-586`, CSS `airops.css:2766-2767`, `:2807`), Scadenze (`scadenze-console.tsx:719`), Contabilità (`billing-console.tsx:1304`).
- Baseline: «227 chip / 5 057 px» erano sul DB di lavoro (214 velivoli); su HEAD col DB di carico 1 460 velivoli + 374 istruttori + 2 «Tutti» = **1 836 bottoni** da 27,4 px. Dopo la 17.2 il gruppo Velivolo scende a ~208 nel giorno più pieno (fino a ~712 in settimana); dopo la 17.6 il gruppo Istruttori ha un tetto dichiarato. La story serve ancora.

## Acceptance Criteria

1. *Given* admin a 375×812 su Pianificazione *When* tocco «Filtri» *Then* si apre un pannello a tutto schermo (dialogo con trap) con campo di ricerca Velivolo, campo Istruttore, Reimposta e Applica; 0 `.segmented`; ogni controllo ≥ 44 px. Rosso su HEAD.
2. *Given* ≥ 21 velivoli che corrispondono alla stessa query (precondizione costruita dal test) *When* digito 1 carattere *Then* nessuna richiesta; *When* 2 *Then* una sola richiesta all'endpoint della 17.6, ≤ 20 opzioni e la riga «Altri risultati».
3. *Given* un velivolo run-unique senza prenotazioni nel giorno *When* lo cerco, lo scelgo e premo Applica *Then* l'URL ha `?aircraft=<id>` e conserva gli altri parametri; agenda e timeline mostrano solo quella riga (17.2 AC 4); riaprendo il pannello trovo le marche come etichetta. Applicazione: §PO Q-18.4-c.
4. *Given* pilota o allievo *Then* nessun campo Istruttore nel DOM e nessun elenco istruttori nel payload RSC (sostituisce la guardia `bookings.spec.ts:1998-1999`, che diventerebbe vacua).
5. Reimposta azzera entrambi i filtri; il trigger mostra il conteggio dei filtri attivi (ICU plural).
6. Con il popup della ricerca aperto il primo Escape chiude solo il popup, il pannello resta.
7. Desktop a 1280: §PO Q-18.4-a. Fila di targhette: §PO Q-18.4-b.
8. Non regressione: gli 8 testid desktop restano 1 nodo a 375/390/1280 (`mobile-planning.spec.ts:46-58`); nessuno sfondamento a 375/390; popover del calendario invariato (clamp 13.10); `scroll:false`; conservazione dei parametri negli href (17.2 AC 4); `mobile-booking-sheet` a un nodo; `grep listActiveInstructors` = 0 chiamanti in `bookings.service.ts` (rimuoverla se orfana, con la sua parte di unit `bookings.service.test.ts:2665-2690`; **non toccare** l'omonima in `instructor-compensation.service.ts:115`).
9. Misure a 375 e 1280, due temi, admin/istruttore/pilota: bottoni nella UI filtri prima/dopo; sweep dei bersagli esteso al pannello; KB del payload RSC di `/bookings` e `/dashboard` su `airmanager_load` (`render.mjs`; il roster istruttori pesa ~42 KB). `npm run gates` + e2e via `scripts/e2e.sh` verdi.

## Dev Notes

**Decisioni tecniche della sessione principale**: `SlideOver` a tutto schermo (precedente dei tre filtri; con la tastiera aperta un bottom sheet non ha spazio per i risultati); velivolo nell'URL (17.2), istruttore resta stato client (17.2 AC 4); trigger desktop `schedule-filter-toggle` resta 1 nodo a ogni larghezza, nascosto via CSS a ≤ 640 come nel Registro voli (mai `matchMedia`); i test che lo cliccano a 375 si spostano sul trigger mobile.

**Blast radius**: `schedule.tsx`; `bookings/page.tsx` e `dashboard/page.tsx` (niente roster, etichetta della selezione); `airops.css` (blocco pianificazione mobile `:2301-2432`); `messages/{it,en}.json` (`BookingsPage.schedule.*`); `bookings.service.ts`. **e2e che pinnano**: `mobile-planning.spec.ts:339`, `:367-428` (relazione «targhette = voci del popover + 1» `:382-386`, click su `schedule-filter-toggle` a 375 `:383`, `:397`), `:757`; `bookings.spec.ts:801-805`, `:808-858` (popover alto con 6 velivoli: la premessa sparisce), `:908-930` (clamp del popover filtri a 375), `:1998-1999`; lo spec della 17.2 (`schedule-rows.spec.ts`).

**Discriminanze** (rosse sul pre-fix; mutanti solo su copia isolata con sha256): 0 chip e tutto ≥ 44 nel pannello; velivolo fuori dalle righe del giorno trovato e applicato; pilota senza campo Istruttore; mutanti soglia 2→1, gate del campo Istruttore rimosso, Applica che non scrive `aircraft`.

**Trappole**: prefissi `^=` vivi `schedule-filter-aircraft-`, `schedule-filter-instructor-`, `mobile-tail-chip-` → nessun testid nuovo può usarli (`schedule-filter-aircraft-search` è illegale anche con `-mobile`); nomi proposti: trigger `mobile-schedule-filters-button`, campi `schedule-aircraft-search` e `schedule-instructor-search` con i gemelli del pannello in `-mobile` (verifica `grep -rn 'data-testid\^=' e2e/`); mai Escape per chiudere il popup della ricerca nei test; il trap del `SlideOver` comprende i portali; `getByLabel('Velivolo')` compare in 41 punti limitati al form: tenere il label del pannello fuori dalla loro portata; i18n «…», `BANNED` («timeline», «aeromobil*», «AOG», «fermo», «reset»), contatore ICU plural; se la 18.4 precede la 18.1, il pannello si garantisce i 44 px da solo.

**Dimensione**: ~12-15 file, +600-900/−250-350 (≈ 0,3 della 19.7a). Nessuno split.

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03/04 in un solo giro (AskUserQuestion: «Sì, tutte» sulle 24 raccomandazioni dell'Epic 18 presentate in linguaggio semplice, split inclusi).

- **Q-18.4-a** = A: anche al computer il riquadro «Filtri» di Pianificazione e Panoramica diventa un campo di ricerca (stessa ricerca della 17.6).
- **Q-18.4-b** = A: la fila di targhette sopra l'agenda resta, con i soli velivoli del giorno, come scorciatoia a un tocco.
- **Q-18.4-c** = A: sul telefono il filtro si applica con «Applica» (bozza nel pannello), come nel Registro voli.


## Dev Agent Record

### Modello e perimetro

Sviluppo GPT 6.2 Astra xhigh, un solo agente. Il modello di revisione ordinaria autorizzato dal PO è GPT 6 Sol xhigh in un contesto separato. Base effettiva `c74143e31d95f80c187ec60b020beb25ae00297b`.

### Implementazione e copertura

- AC 1, 5 e 6. A ≤640 px «Filtri» apre il `SlideOver` AirOps con bozza, focus trap, Reimposta e Applica. Il conteggio attivo usa ICU nelle due lingue. Il primo Escape chiude la lista della ricerca. Il test mobile misura il rettangolo intero 375×812 e i bersagli ≥44 px. Verifica anche Tab, focus di ritorno, chiusura con Indietro e cronologia dopo un reset.
- AC 2–4. Entrambe le superfici usano `SearchCombobox` e la ricerca prenotazioni della 17.6. `self.read` per la flotta, `bookings.read.names` per i nominativi. L’istruttore selezionato è locale. Un pilota e un allievo sintetici consultano la flotta, non ricevono il campo Istruttore né il nome sentinella nel payload RSC. Il test conferma prima la presenza di ciascuna sentinella tramite ricerca amministrativa consentita. La prova positiva dell’istruttore usa lo stesso endpoint. Un velivolo libero run-unique, assente dalle righe e dalle targhette del giorno, viene trovato per marche, applicato conservando `date`, `status` e `page`, ed è l’unica riga della griglia. Agenda vuota e valore riaperto sono verificati.
- AC 7–8. Il popover desktop usa la ricerca sia in Pianificazione sia nella Panoramica admin. Il calendario conserva il posizionamento originale. Le targhette sono le scorciatoie dei soli velivoli pertinenti al giorno (prenotati o fuori servizio); il velivolo libero selezionato resta raggiungibile nel campo, la vista settimana non monta la striscia. Rimossi la lettura del roster di 100 e i suoi due chiamanti. La distinta funzione dei compensi e il contratto della modifica prenotazione restano nella base.
- Controprova «form obsoleto» sulla build applicativa. Una fixture pilota regolarizzata con `ensureBookingRequirements` crea una prenotazione senza deroga; un normale `PATCH` mentre il form è aperto riceve 200. La UI invia i cinque valori iniziali di `expected`; seconda risposta 409, messaggio di errore visibile. `scripts/e2e.sh start e2e/cleanup-probe.spec.ts --project=chromium --workers=1 --retries=0` dalla copia di prova, server del candidato. 1 passato, `E2E_EXIT=0`. Nel primo tentativo la fixture non era in regola per la modifica ordinaria: `Expected: 200 / Received: 422`, `E2E_EXIT=1`, prima del controllo di obsolescenza.
- TDD. Sul pre-fix, `npx vitest run src/server/services/bookings.service.test.ts -t 'without joining'` esce 1: la lista delle scorciatoie include anche `free`. `scripts/e2e.sh start e2e/mobile-planning.spec.ts -g '18.4:' --project=chromium --workers=2 --retries=0` dà 4 fallimenti, `E2E_EXIT=1`: manca `mobile-schedule-filters-button`. Nel primo run mirato sul candidato 7 passati, una scadenza a 240000 ms nel vecchio percorso cumulativo `@picker-cap`, `E2E_EXIT=1`. Il successivo Tab aveva aperto la lista Istruttore sopra «Fatto». La misura di soglia/cap ha ora una propria fixture, riparte dalla pagina per ogni viewport e verifica anche la raggiungibilità dell’ultima opzione dopo lo scroll.

### Discriminanti isolate

Una copia in `/tmp/am184/counter` ha ricevuto tre variazioni indipendenti, ciascuna verificata dal caso che esercita quella singola condizione. Sorgenti originali controllati con `sha256sum -c /tmp/am184/source-checksums` (exit 0): `schedule.tsx` `6cebc0fdd97e285ce5346ae517ac112f1eb1eca826e5c432590f30ae473978dc`, `picker.ts` `29fa7f945ecb41ae20b99bd48da9d3ac501ee7e7fec3b8c9c23b3ccdb1a4dd98`. Nella copia le impronte rispettive sono `ca5c5f5f9e9ae6a00d0353813ef2d7d19fa9b13517ec8914d9cf39cfe19d48e5` e `816c31a10161ebb4ab7e55889635b66be18650b610ef18b2f216bd35850840b6`.

| Prova sulla copia | Risultato osservato |
|---|---|
| Soglia da 2 a 1 | `npx vitest run src/lib/picker.test.ts -t 'requires two'`, exit 1. Nel browser la prima lettera ha generato una chiamata `["I"]`, attese `[]`. |
| Applica naviga senza velivolo selezionato | Il browser attende il parametro `aircraft=<id>`, riceve `?date=2031-03-11&status=APPROVED&page=2`. |
| Campo istruttore fittizio disabilitato nel pannello pilota | `Expected: 0, Received: 1`. Il doppio non è collegato a dati o rete. La prova verifica la sensibilità dell’asserzione DOM e lascia intatta la protezione del servizio. |

Comandi browser `scripts/e2e.sh start e2e/mobile-planning.spec.ts e2e/picker-cap.spec.ts -g '18.4: mobile drafts|18.4: pilot receives|18.4: the planning aircraft search' --no-deps --workers=2 --retries=0`, exit 1; riesame dei casi Applica e soglia con `-g '18.4: mobile drafts|18.4: the planning aircraft search' --no-deps --workers=1 --retries=0`, exit 1 atteso per entrambi. Al primo passaggio il test soglia era scaduto a 30000 ms in attesa del campo desktop e non provava la discriminante; il secondo raggiunge il campo con il consueto `waitForDashboardContent`. Nella copia la build alternativa `next build --webpack` era uscita 1 su `accounts/negative-balances/route.ts`, `RouteHandlerContext<EmptyParams> | undefined is not a valid type for the function's second argument`. La build ordinaria Turbopack con copia locale delle dipendenze è uscita 0. Log `/tmp/am184/counter{1,2,-build,-turbo-build,-threshold}.log`.

### Misure su PostgreSQL sintetico

Build di produzione prima/dopo; stesso `airmanager_load` locale (1.501 velivoli), data `2027-01-19` in Pianificazione, giorno corrente in Panoramica. Sonda locale basata sul login e sul browser di `scripts/perf/render.mjs`, eseguita come `/tmp/am184/measure before` e `/tmp/am184/measure after`. Ogni riga di misura apre la superficie alla larghezza/tema indicati e conta link e bottoni nel riquadro aperto. Gli input sono contati a parte. Il payload è il numero di byte del body di un GET autenticato con `RSC: 1` e risposta `text/x-component`. 32 osservazioni per build (4 ruoli × 2 larghezze × 2 temi × 2 pagine). Log locali `/tmp/am184/{before,after}.log`.

| Ruolo | Azioni filtri Pianificazione prima, 375 / 1280 | Dopo, bottoni + campi 375 / 1280 | RSC Pianificazione prima → dopo, KiB | RSC Panoramica prima → dopo, KiB |
|---|---:|---:|---:|---:|
| Admin | 297 / 297 | 3+2 / 2+2 | 253,03 → 242,71 | 251,30 → 228,77–228,78 |
| Istruttore | 297 / 297 | 3+2 / 2+2 | 250,07 → 239,75 | 76,64–76,65 → 76,87 |
| Pilota | 196 / 196 | 3+1 / 2+1 | 231,21 → 231,23 | 77,18–77,19 → 77,40–77,41 |
| Allievo | 196 / 196 | 3+1 / 2+1 | 231,22 → 231,23–231,24 | 76,96–76,97 → 77,19 |

I conteggi coincidono per i temi chiaro e scuro. Nella Panoramica admin a 1280 px le azioni scendono da 289 a 2 bottoni più 2 campi; le landing degli altri ruoli hanno una superficie diversa. A 375 px nel giorno misurato restano 194 targhette compresa «Tutti», 317 px visibili e 14.992 px scorribili in entrambe le build. Nel pannello mobile il minimo tra altezza e larghezza di ogni bottone e input è passato da 34,84 a 44 px. L’assenza del roster incide sui ruoli con lettura nominativa; per pilota e allievo la dimensione RSC è pressoché invariata.

**Cardinalità AC 8.** Sonda `node /tmp/am184/ac8.mjs`, exit 0, sul server del candidato e sul DB di carico separato. Ordine degli identificatori: `schedule-section`, `calendar-heading`, `calendar-prev`, `calendar-next`, `schedule-date-pick`, `schedule-filter-toggle`, `calendar-view-day`, `calendar-view-week`. Il vettore osservato è **[1, 1, 1, 1, 1, 1, 1, 1]** in ciascuna delle sei combinazioni: giorno e settimana a 375, 390 e 1280 px. In tutte e sei, `documentElement.scrollWidth − documentElement.clientWidth = 0 px`. Log `/tmp/am184/ac8.log`.

### Gate del candidato

Candidato applicativo `142e81bdbcb46ea937f413fe0843010654f864d5` (tree `5b8e96a895bf075c6a228116d098f44db73b56a1`). `npm run gates`, exit 0: lint 41 s, typecheck 6 s, 2.349 unit in 16 s, build 56 s. I cinque casi mirati di `mobile-planning.spec.ts` e `picker-cap.spec.ts` erano passati senza retry (`E2E_EXIT=0`). Le ultime due rifiniture ai test, attesa di idratazione e ordine delle asserzioni, sono quelle controllate dal gate congelato e dalla suite completa.

`npm run db:reset:test`, exit 0: `Test database airmanager_e2e reset and seeded.` PostgreSQL 16 disposable su loopback porta 55484, distinto da `airmanager_load`. Server production del candidato con `--keepAliveTimeout 75000`; Mailpit locale su 1025/8025. Nel solo processo di test la lettura METAR per LIML ha una fixture sintetica in memoria, senza chiamata al provider. La verifica integrata usa `E2E_REUSE_SERVER=1 scripts/e2e.sh start`; lo stato si legge con `scripts/e2e.sh status`.

**Suite completa del candidato.** `E2E_REUSE_SERVER=1 scripts/e2e.sh start`, conferma con `scripts/e2e.sh status`. `E2E_EXIT=0`, 28,8 minuti, 697 casi: **695 passati al primo tentativo, 2 passati al primo retry, 0 saltati e 0 fallimenti definitivi**. Tutti i sei casi intitolati 18.4 sono passati al primo tentativo, così come la regressione 17.2, le prove di cardinalità/geometria, cronologia e calendario. I tre casi METAR (telefono/desktop, fascia tablet, landing dei tre ruoli) sono passati al primo tentativo con la fixture LIML locale. Il provider meteo reale rimane fuori dalla misura. Log del gate `/tmp/am184/gates-frozen.log`, suite `/tmp/am184/full-final.log`, reset `/tmp/am184/reset-final.log`, mock esterno al repository `/tmp/am184/weather.cjs`.

| Retry della suite completa | Primo tentativo, diagnostica sanitizzata | Esito successivo |
|---|---|---|
| Registro voli, volo scuola con istruttore, `flights.spec.ts:296` | Dopo il salvataggio il test attendeva la riga del volo con il nome istruttore. `flight-row … element(s) not found; Timeout: 5000ms` (asserzione a riga 326). | Retry 1 passato |
| Scadenze mobile, bersagli condivisi, `mobile-expiries-movements.spec.ts:666` | Su `/it/dashboard/reports`, `.segmented button height`: attesa ≥43,5 px, lettura 0 px (riga 699). | Retry 1 passato |

Il log identifica le due asserzioni fallite; la causa dei valori intermittenti non è stata stabilita. Nessun esito delle storie precedenti è stato usato per sostituire un gate del candidato.

### Revisione indipendente del 2026-11-26

GPT 6 Sol xhigh ha esaminato in sola lettura il diff da `c74143e` a `142e81b` (albero `5b8e96a`), i log dei gate, le misure prima e dopo e le prove browser. Ha approvato gli AC 1–9 e le tre decisioni PO senza rilievi. Il candidato approvato conserva il rifiuto 409 del salvataggio obsoleto. La controprova per il pilota misura la sensibilità del test alla comparsa di un campo nel DOM. Il controllo server delle autorizzazioni è rimasto attivo. I tre casi METAR sono stati verificati con la fixture LIML locale.

### File interessati

Le due pagine server Pianificazione e Panoramica, `bookings/schedule.tsx`, il servizio prenotazioni con i suoi unit, `search-combobox.tsx`, `ui/fixed-popover.ts`, CSS AirOps, cataloghi IT/EN, gli spec browser `bookings`, `mobile-planning` e `picker-cap`, questo record.
