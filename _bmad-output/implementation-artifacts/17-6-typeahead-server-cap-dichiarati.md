---
baseline_commit: e951960
---

# Story 17.6: Typeahead server-side per persone e velivoli, cap dichiarati ovunque restino

Status: **done** — 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `e951960`). **Dev: Opus 5 xhigh** (UI: `SearchCombobox`, form prenotazione, filtro del Registro voli, avvisi; skill `design-taste-frontend` + `ui-ux-pro-max`). Review: Opus 5 xhigh adversarial. **Ordine**: dopo l'Epic 16 (16.5 tocca `bookings.service.ts`, `registry.ts`, `messages`, `instructors-console.tsx`; 16.7 estende `maskBookingNames` a `personId` e TD-16.7-a diventa vivo con T1; 16.8 aggiunge `listArchivedAircraftByIds`; 16.9 tocca `transaction-editor.tsx` e `flight-editor.tsx`) e dopo 17.2 (il suo filtro per URL userà la ricerca di T1) e 17.5 (riscrive la lettura di `listPeople`/`listAircraft`). 18.4 consuma da T1 la ricerca velivolo e istruttore. Righe da rileggere su HEAD al momento del dev.

## Story

As a **chiunque compili un form con una persona o un velivolo**,
I want cercare digitando,
so that i picker funzionino a 5 000 persone e 1 500 velivoli (perf F6), `OPTIONS_PAGE_SIZE` sparisca dalle 5 pagine (ops cap #4), e ogni cap residuo dichiari di essere scattato (ops cap #1: `truncated` sul calendario).

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 17.6»; `perf-load-report.md` F6; `ops-audit.md` cap #1, #2, #4; `ui-review.md` M3; story 19.5 (D-4: «filtro locale, il tetto 100 persone resta; ricerca server → 403 per pilota/istruttore», `19-5-…md:94`, fuori scope §6 `:386`).

## Stato su HEAD (misurato il 2026-11-03)

- **Correzioni al piano**: `GET /aircraft?q=` **esiste già** (`listAircraftQuerySchema` `aircraft.ts:165-171`, servizio `aircraft.service.ts:118-149`, story 2.4) e `GET /people?q=` dalla 2.1, ma **solo admin** (`aircraft.manage`, `people.read`); INSTRUCTOR ha solo `self.read`, `bookings.manage.own`, `bookings.read.names` (`rbac.ts:103-106`). `SearchCombobox` nasce con la TD-3 (`3dac56c`); la 19.5 gli ha aggiunto la modalità statica, le opzioni disabilitate e lo stop di Escape.
- **Ricerca server già fatta (admin)**: `flight-editor.tsx` (`searchPeople` `:168-174`, `searchAircraft` `:495-500`, `searchPilotStudent` `:529-540`), `transaction-editor.tsx:78-84`, `scadenze-console.tsx:216-222`. Da allineare: `SearchCombobox.runSearch` (`search-combobox.tsx:263-281`) chiama il server **già da 1 carattere**; chiedono `pageSize: '50'`, non 20; non dicono se ci sono altri risultati; il browse al focus è la prima pagina da 100. L'unica ricerca già conforme è «Aggiungi istruttore» (`instructors-console.tsx:630-672`: ≥ 2 caratteri, 300 ms, 10 risultati; file della 16.5).
- **Filtro client su lista** (modalità statica `new-booking-form.tsx:301-331`, `edit-booking-form.tsx:182-193`): **tutti** i picker dei form prenotazione. Etichetta: una scelta dell'utente vive in `committedLabel`, ma un cambio esterno di `value` la ricava da `initialOptions` (`findLabel` `:91-94`, riconciliazione `:179-184`) e si perde se l'opzione non è in lista (oggi lo compensa solo `flight-editor` iniettando l'opzione, `:486-519`). Bug latente: `openBrowseMode` (`:257-260`) con selezione fuori lista rende attiva la riga 0 e Invio la sostituisce. La ri-verifica server c'è già (AD-5: `bookings.service.ts:326-369`, `:876-886`, `:1277-1290`).
- **`OPTIONS_PAGE_SIZE`**: 5 costanti (`dashboard/page.tsx:66`, `bookings/page.tsx:41`, `billing/page.tsx:24`, `logbook/page.tsx:32`, `expiries/page.tsx:26`), mirror e2e `aog-overview-count.spec.ts:38`, citazioni `search-combobox.tsx:62-66`, `logbook-console.tsx:328-331`. Select nativi dinamici: **l'unico con > 50 opzioni** è il filtro «Velivolo» del Registro voli (`flight-filter-aircraft` `logbook-console.tsx:527-540` e `-mobile` `:933-945`, 101 opzioni su 1 501); gli altri restano sotto (categorie cassa 7, tipi scadenza 6).
- **Calendario**: `listCalendarBookings` (`bookings.service.ts:1028-1055`) `take: 1000` (`:1052`) tronca **in silenzio**; risposta array nudo (`calendarBookingsResponseSchema` `bookings.ts:232-233`, OpenAPI `registry.ts:1474-1482`). Sul DB di carico il tetto non scatta mai (max 147 APPROVED in un giorno, 878 in una settimana): il test si costruisce lo stato da solo. `listBookableStudents` (`:1708`) e `listActiveInstructors` (`:1721`) senza `take`, gated `self.read`, nessuna route li espone (TD-16.7-a).
- **Inventario dei picker** (volumi su `airmanager_load`: 1 460 velivoli non archiviati, 82 fuori servizio; 4 757 persone non archiviate):

  | # | Superficie · campo | Meccanismo | Carico |
  |---|---|---|---|
  | 1 | Nuova prenotazione staff · `booking-person` | statico, `listPeople` p1×100 + filtro client | **86 raggiungibili su 4 364** prenotabili |
  | 2 | idem · `booking-aircraft` | statico, `listBookableAircraft` senza tetto | 1 460 opzioni tutte nel listbox |
  | 3 | idem · `booking-instructor` | statico, `listActiveInstructors` | 374 + «Nessuno» |
  | 4 | Prenotazione da istruttore · `booking-student` | statico, `listBookableStudents` | 1 202 |
  | 5-6 | Prenotazione da pilota/istruttore · velivolo; `move-booking-aircraft` | come #2 | 1 460 |
  | 7-9 | Registro voli + «Registra volo» · `flight-aircraft`, `flight-person`, `flight-instructor` | server, 50 risultati; browse primi 100 | in Panoramica il browse persone è 81, istruttori 8 |
  | 10 | Nuova transazione · `transaction-person` | server pilot-or-student, 50 | 4 044 |
  | 11 | Quota associativa · `membership-fee-person` | server **senza** `profile` (`scadenze-console.tsx:217`) | incoerenza: la ricerca restituisce anche i 320 «solo istruttori» |
  | 12 | Registro voli, filtro · `flight-filter-aircraft` (+`-mobile`) | **select nativo** | 101 opzioni su 1 501 |
  | 13 | Pianificazione, Filtri (chip velivolo/istruttore, `mobile-tail-chip-`) | chip + filtro client | coperti da 17.2 / 18.4 |
  | 14 | Panoramica, widget Velivoli | `listAircraft` p1×100 | 100 schede su 1 460, nulla dice «primi 100» |

  Altri dati: 1 440 coppie Cognome+Nome duplicate fra i non archiviati (omonimi); `q=ross` 88 righe in 5 ms (nessun indice necessario); `q=I-` sui velivoli corrisponde a tutti.

## Acceptance Criteria

1. **Contratto di ricerca**: *Given* un attore e `q` ≥ 2 caratteri *When* chiama la ricerca del suo dominio *Then* riceve ≤ 20 righe con DTO minimo e `truncated` (lettura di 21); gate: velivoli prenotabili `self.read`; persone prenotabili dallo staff `bookings.manage.any`; allievi e istruttori secondo §PO Q-17.6-d; un PILOT/STUDENT che chiama allievi o istruttori riceve 403 (unit + e2e sulla risposta API grezza).
2. **Soglia e debounce**: su un picker #1-11 1 carattere → nessuna richiesta; 2 caratteri → dopo il debounce una sola richiesta verso l'endpoint del suo dominio, listbox ≤ 20 opzioni selezionabili (+ la riga di §PO Q-17.6-b se `truncated`).
3. **Raggiungibilità (discriminante)**: *Given* una persona prenotabile run-unique oltre la centesima in ordine alfabetico (precondizione verificata via conteggio API > 100; il buffer lo crea il test se manca, come `typeahead-pickers.spec.ts:63-131`) *When* l'admin la cerca in «Nuova prenotazione» *Then* la trova e prenota (201); rosso sul pre-fix. Stesso schema per l'istruttore che cerca un allievo.
4. **Selezione id + etichetta**: una prenotazione il cui velivolo non è nelle opzioni iniziali mostra le marche in «Modifica»; un campo compilato fuori lista, rifocalizzato + Invio, mantiene il valore (estende lo F3 della review 19.5).
5. **Apertura**: comportamento al focus secondo §PO Q-17.6-a; la selezione corrente c'è **sempre**.
6. **Costante**: `grep -rn OPTIONS_PAGE_SIZE src/` = 0; i fetcher usano UNA costante condivisa (20 risultati, 2 caratteri); nessun `pageSize: '50'` residuo; il server applica il tetto anche se il client chiede di più.
7. **Guardia e2e**: *Given* ≥ 51 velivoli e 51 persone attive (precondizione costruita e verificata dal test) *When* visito ogni voce di `NAV_ITEMS` come admin a 1280 e 375 *Then* nessun `<select>` ha > 50 `<option>`; per ogni picker, digitando 2 caratteri, il listbox ha ≤ 20 opzioni selezionabili; rosso sul pre-fix per #12.
8. **Filtro velivolo del Registro voli**: secondo §PO Q-17.6-c; il contratto di URL `?aircraftId=` resta invariato (`logbook-console.tsx:285`, `logbook/page.tsx:88`); `flight-filter-aircraft` resta un solo nodo per albero (`mobile-logbook.spec.ts:70-80`, `:1195`, `:1223`, `:1299`).
9. **Calendario**: con > 1 000 APPROVED in `[from,to)` `listCalendarBookings` e `GET /bookings/calendar` danno `{ items: 1000, truncated: true }`, altrimenti `truncated: false`; OpenAPI aggiornato; Pianificazione (timeline desktop + agenda mobile) e calendario della Panoramica mostrano un avviso; unit rosso sul pre-fix; e2e via fixture SQL in un project serializzato.
10. **Roster**: `listBookableStudents` senza più chiamanti (lo sostituisce la ricerca); `listActiveInstructors` resta solo per il filtro della Pianificazione (§PO Q-17.6-e) con un tetto dichiarato (lettura N+1, riga nel popover); il form usa la ricerca.
11. **Nome completo**: «Rossi Mario» e «Mario Rossi» trovano la persona (ogni parola deve corrispondere a nome, cognome o email: AND fra le parole) — salva gli otto e2e che cercano con l'etichetta completa.
12. **Widget Velivoli della Panoramica**: §PO Q-17.6-f.
13. **Invarianti**: il primo Escape chiude solo il popup; focus sul primo campo non valido; velivolo fuori servizio disabilitato e con motivo nel form prenotazione, selezionabile nel form volo; opzioni ≥ 44 px a 375; desktop invariato; `typeahead-pickers.spec.ts` verde con le sole modifiche dichiarate.
14. **Misure**: ricerche nuove p50 < 50 ms e burst 10 senza errori (`bench.mjs`, `q` di 2 e 4 caratteri); KB e nodi prima/dopo (`render.mjs` 1280/375 su `/it/dashboard`, `/bookings`, `/logbook`, `/billing`, `/expiries` come admin e `/bookings` con `EMAIL=instructor@airmanager.local`); tabella di raggiungibilità prima/dopo (#1 da 86 a 4 364). Aspettativa onesta: KB in calo modesto finché la lista velivoli resta per la timeline.
15. **Gate**: `npm run gates` verde; e2e via `scripts/e2e.sh`.

## Tasks / Subtasks

- [x] Backend: ricerche «opzioni di prenotazione» (T1), costante (T2), parole multiple in `listPeople` (T4), busta del calendario (T5), OpenAPI.
- [x] `SearchCombobox`: soglia 2, riga «altri», selezione sempre nel browse, label opzionalmente nascosta per la barra filtri (oggi label sempre visibile, `minWidth: 200` `:378`), stato «Ricerca in corso…».
- [x] Form prenotazione (nuova, modifica, sposta), form volo/transazione/quota, filtro Registro voli, avvisi del calendario, widget Panoramica.
- [ ] Unit (la logica del combobox da provare va estratta in `src/lib/`: vitest è `node`, non jsdom), e2e (AC 3, 7, 9), mutanti su copia isolata, misure, Dev Agent Record.

## Dev Notes

**Decisioni tecniche della sessione principale**: **T1** restano `GET /people?q=` e `GET /aircraft?q=` (admin) per form volo, transazione e quota; si aggiunge una famiglia di ricerche «opzioni di prenotazione» sotto `/api/v1/bookings/…` (velivolo, persona prenotabile, allievo, istruttore) con i gate dell'AC 1; velivolo DTO `id, registration, model, status, statusReason` (D-5 della 19.5); istruttore id = `instructorProfileId` (quello del volo è un `personId`: non unificarli). **T2** una costante condivisa server/client. **T3** browse = prima pagina resa dal server con le stesse funzioni senza `q` (contratto «browse = zero rete» del componente); la selezione corrente sempre iniettata. **T4** ricerca per parole (AND) dentro `listPeople` (effetto collaterale: Piloti e «Aggiungi istruttore» cercano meglio). **T5** busta `{ items, truncated }` (non un header), tetto 1 000 invariato, lettura di 1 001. **T6** guardia e2e in coda alla catena serializzata dopo `aog-overview-count`, con precondizione costruita; misura una tantum su `airmanager_load` via `render.mjs` (Playwright non permette di cambiare `baseURL`). **T7** la landing istruttore filtra «i miei di oggi» dal client su un insieme che può essere troncato: residuo dichiarato. Correggere l'incoerenza #11 (quota senza `profile`) allineandola a pilot-or-student.

**Blast radius**: backend `bookings.service.ts` (calendario `:1028-1055`, funzioni dei picker `:1668-1730`; preservare `maskBookingNames` `:1055`), `people.service.ts:181-239`, `schemas/bookings.ts:232-233`, `registry.ts:1474-1482` (+ path nuovi; preservare l'insieme `200/401/403/422/500`), `registry.test.ts:71`, `:350-356`, route nuove sotto `src/app/api/v1/bookings/…`. UI `search-combobox.tsx`, `new-booking-form.tsx`, `edit-booking-form.tsx`, `bookings-table.tsx:951-964`, le 5 pagine, `logbook-console.tsx`, `flight-editor.tsx`, `transaction-editor.tsx`, `scadenze-console.tsx`, `dispatch-flight-button.tsx` (se cambia il tipo delle opzioni), `schedule.tsx` (avviso troncato), `booking-labels.ts`, `messages/{it,en}.json`, `airops.css`. Consumer di `listCalendarBookings` da adattare: `bookings/page.tsx:251`; `dashboard/page.tsx:289` (KPI «Voli oggi» `:359`, timeline `:363`, «In corso ora» `:449`); `dashboard/page.tsx:856` (landing istruttore); route `api/v1/bookings/calendar/route.ts:13`. Non toccare `listActiveInstructors` di `instructor-compensation.service.ts:115` (omonima, la 16.5 la vuole byte-identica).

**Test che fissano il comportamento attuale**: unit `bookings.service.test.ts:979-989` (`take: 1000`, array nudo), `:2665-2690` (`listBookable*`); invariati i test di mascheramento `:1003-1015`. e2e `typeahead-pickers.spec.ts:389-441` (AC 21 della 19.5: «ZERO calls» e «la ricerca risponde 403 per il pilota» → riscrivere: la regex `^/api/v1/(aircraft|people)` resterebbe verde per caso con una route sotto `/bookings`), `:485-549`, `:443-483`; `mobile-ink-targets.spec.ts:256-291`; `bookings.spec.ts:729-731` (calendario grezzo come array); otto chiamate con l'etichetta completa come query (`bookings.spec.ts:537`, `:622`, `:1590`, `:2274`, `:2305`; `datetime-picker.spec.ts:141`; `booking-window.spec.ts:185`; `booking-requirements.spec.ts:636`) — le salva l'AC 11; `flight-log.spec.ts:316`, `:364` (`not.toHaveValue(id)`: con un combobox il valore è l'etichetta → passerebbero per costruzione, ripensarli); `flight-delete-update.spec.ts:211` (`?aircraftId=`). Dipendono dal tetto 100 ma restano verdi (aggiramenti da NON ripulire): prefissi `AAA`/`0Pilota`/`0Req` (`booking-window.spec.ts:44`, `bookings.spec.ts:1581`, `booking-requirements.spec.ts:602`), `aircraft-out-of-service-until.spec.ts:282`, `:361`, `mobile-logbook.spec.ts:942`. Il commento «degrada ogni picker» di `playwright.config.ts:186-194` diventa falso: aggiornarlo, lo spec non si sposta.

**Mutanti** (solo su copia isolata, sha256 prima del commit): `take: CAP+1` → `CAP` (mai `truncated`); via la soglia dei 2 caratteri; `booking-person` di nuovo statico; via la selezione dal browse (F3 esteso rosso); gate allievi allargato a `self.read` (403 rosso).

**Trappole**: mai Escape per chiudere un popup in un test (si chiude interagendo col campo successivo). Name-match per sottostringa: «Velivolo» è anche l'`aria-label` del filtro del registro — se il filtro diventa un combobox con `<label>` visibile, ogni `getByLabel('Velivolo')` non limitato al form vede 2 nodi (oggi le 41 occorrenze sono limitate al form: tenerle così); `getByRole('option', { name, exact: true })`: se si mette `meta` (omonimi) **dentro** il `<li>` cambia il nome accessibile e le 84 chiamate a `selectFromCombobox` (`helpers.ts:180-184`) si rompono; la riga «altri risultati» **non** deve essere `role="option"` (falserebbe conteggi e tastiera, `typeahead-pickers.spec.ts:512`). Selettori `^=`: `schedule-filter-aircraft-` (`mobile-planning.spec.ts:384`), `schedule-filter-instructor-` (`bookings.spec.ts:1999`: 0 per il pilota, guardia di privacy 14.5), `mobile-tail-chip-` → nessun testid nuovo con quei prefissi (es. `schedule-filter-aircraft-search` sarebbe illegale). Persone di fixture run-unique; la guardia costruisce la propria precondizione (il DB e2e fresco ha 1 velivolo e 4 persone). Lampo di «Nessun risultato.» con browse da 20 prima della risposta del server (`:468`) → stato «Ricerca in corso…» (glossario: «…», mai «...»). i18n: `BANNED` vieta «timeline» («calendario dei velivoli»), «top N» («primi N»), «aeromobil*», «AOG», «fermo»; plurali ICU per «altri N»; niente `t.raw` su `plural`. Accessibilità: `aria-activedescendant` coerente quando le opzioni sostituiscono quelle ottimistiche; opzioni disabilitate raggiungibili; annunci «almeno 2 caratteri» e «altri risultati» in una regione `aria-live="polite"` fuori dal listbox; il trap dei pannelli comprende i portali (`focus-trap.ts`). Env eager: route e servizi nuovi nei test mockano la catena.

**Dimensione**: ~35-40 file, ~+1 400-1 900 / −400-600 (≈ 0,7 della 19.7a). Nessuno split se §PO Q-17.6-e = A; con B si divide (17.6a form + calendario + endpoint, 17.6b filtri della Pianificazione).

### References

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §Story 17.6; `perf-load-report.md` F6; `ops-audit.md` cap #1/#2/#4; `ui-review.md` M3; `19-5-form-volo-tipi-dropdown-toggle.md` (D-4, D-5, F3); `16-7-dati-sessioni-rate-limit.md` (TD-16.7-a)

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03 in un solo giro (AskUserQuestion: «Sì, tutte» sulle raccomandazioni presentate in linguaggio semplice).

- **Q-17.6-a — apertura senza digitare** = A: i primi 20 in ordine alfabetico, con la scelta attuale sempre presente.
- **Q-17.6-b — oltre 20 corrispondenze** = A: una riga in fondo «Altri risultati: continua a digitare» (non `role="option"`).
- **Q-17.6-c — filtro «Velivolo» del Registro voli** = A: diventa lo stesso campo di ricerca dei form, archiviati inclusi col suffisso « (Archiviato)». **Supera la decisione PO del 2026-07-21** («stesso controllo del Tipo, niente ricerca»), resa obsoleta dai volumi.
- **Q-17.6-d — chi cerca allievi e istruttori** = A: gli allievi li cercano istruttori attivi e amministratori; gli istruttori li cerca chi vede già i nomi nelle prenotazioni (`bookings.read.names`: amministratori e istruttori).
- **Q-17.6-e — filtri della Pianificazione** = A: restano come sono in questa story (diventano ricerca con 17.2/18.4 riusando la ricerca fatta qui); il gruppo Istruttori dichiara quando è troncato. Nessuno split.
- **Q-17.6-f — widget «Velivoli» della Panoramica** = A: «Mostrati i primi 100 · Vedi tutti».


## Dev Agent Record

### Agent Model Used

Codex Cloud, un solo agente di sviluppo. Revisione indipendente approvata da GPT 6 Sol xhigh, sostituto autorizzato dal PO.

### Completion Notes List

Suite Chromium completa su dati sintetici: 625 casi passati al primo tentativo, uno passato al retry (attesa Mailpit in `account-adjustments.spec.ts:94`), zero fallimenti finali, 28,1 minuti, exit 0. Le prove del rifiuto 403 sono passate. La mutazione che amplia i permessi non è stata eseguita.

### File List

Il diff rispetto a `f375b3e` comprende servizio prenotazioni, servizio persone, route delle opzioni, schemi OpenAPI, componenti dashboard e combobox, traduzioni, fixture e test. L’elenco completo è riproducibile con `git diff --name-only f375b3e...story/17-6`.

### Checkpoint backend — ricerca per parole (AC 11)

Base verificata `f375b3ebcacf988bda84dc3e1f0cf5a861e98ee5`. Il servizio persone applica una condizione per ogni parola su nome, cognome o email. Due casi sintetici verificano le due sequenze del nome, spazi multipli e filtro identico per elenco e totale. Sul codice iniziale il comando `vitest run src/server/services/people.service.test.ts -t 'matches every name token'` è uscito con codice 1 (due asserzioni sul filtro AND fallite). Dopo la modifica: 94/94 test del servizio, typecheck, lint dei due file e controllo del diff con esito positivo. Il checkpoint riguarda il servizio; restano l’integrazione nei picker, i gate completi, le misure e la revisione della story.

### Verifiche integrate su dati sintetici — 2026-11-25

Il benchmark usa lo stesso snapshot PostgreSQL 16 di `airmanager_load` per il prima e il dopo. `render.mjs 1280 375` ha misurato la build production della 17.5 e quella della 17.6. Per queste schermate il numero di nodi e i KiB di HTML serializzato coincidono alle due larghezze. Le misure includono l’intera pagina.

| Pagina e ruolo | KiB prima → dopo | Nodi DOM prima → dopo |
|---|---:|---:|
| Panoramica admin | 648 → 373 | 2962 → 2970 |
| Prenotazioni admin | 578 → 320 | 2687 → 2690 |
| Registro voli admin | 211 → 169 | 998 → 905 |
| Contabilità admin | 451 → 444 | 3275 → 3276 |
| Scadenze admin | 144 → 137 | 649 → 649 |
| Prenotazioni istruttore | 683 → 313 | 2644 → 2645 |

Su 4.757 persone attive, la vecchia prima pagina offriva 86 persone prenotabili. La ricerca staff applica il filtro ai 4.364 profili prenotabili prima del limite di pagina. Il dominio allievi conta 1.202 persone, quello istruttori 374 e la flotta prenotabile 1.460. Nella sonda UI su carico una persona oltre le prime 100 passa da assente a selezionabile. Il più grande select nativo del Registro passa da 101 a 3 opzioni. Nel form staff la larghezza del campo resta 479 px a 1280 e 335 px a 375; l’altezza dell’opzione su telefono è 44 px, con overflow orizzontale zero in entrambe le build.

| Ricerca | Query di 2 / 4 caratteri | p50 prima ricerca / seconda (ms) | Durata burst 10 (ms) |
|---|---|---:|---:|
| Velivoli | I- / I-AF | 16 / 11 | 115 / 106 |
| Persone | Fe / Ferr | 21 / 18 | 105 / 79 |
| Allievi | Fe / Ferr | 15 / 16 | 79 / 79 |
| Istruttori | Fe / Ferr | 17 / 17 | 100 / 93 |

Otto target di `bench.mjs`, cinque iterazioni e dieci richieste concorrenti per target: HTTP 200 su tutti, zero errori nei burst. Sono valori p50 di richieste singole e tempi complessivi dei burst.

**Prove discriminanti e diagnostica.** Su copia della base, i due unit del calendario (1.000 e 1.001 righe) falliscono sul vecchio array senza `items` (Vitest exit 1). Sul browser pre-fix la selezione staff oltre 100 va in timeout e la guardia nativa legge 55 opzioni contro un massimo di 50 (Playwright exit 1). Su copie isolate del codice modificato i test falliscono (exit 1) togliendo rispettivamente la lettura della riga 21, la soglia di due caratteri o il reinserimento della selezione. I test di autorizzazione controllano il rifiuto esplicito per ruolo, il profilo istruttore disattivato e l’assenza di letture della rosa quando l’accesso viene negato.

**Gate e recuperi.** La build esplorativa con `next build --webpack` è uscita con 1 per il tipo del contesto GET della route preesistente `accounts/negative-balances`. Il comando di build del repository usa Turbopack ed è passato. Il primo `npm run gates` è uscito con 1 per TS2339 nel nuovo test browser (proprietà DOM `options`). Corretto il conteggio degli elementi e ripetuto il gate completo: exit 0, lint, typecheck, 2.306 unit e build production. Nel primo run integrato browser, il test del velivolo fuori servizio metteva a terra il velivolo prima della ricerca: il nuovo picker lo mostrava correttamente disabilitato. Il test è stato corretto selezionando prima il velivolo operativo e mettendolo a terra prima del salvataggio, per verificare la 422 prevista.

### Revisione indipendente e chiusura — 2026-11-25

Il revisore separato `review176`, avviato con `fork_turns=none`, `model=gpt-6-sol` e `reasoning_effort=xhigh`, ha approvato il diff `f375b3e..a85f77c` senza rilievi bloccanti. Ha esaminato i criteri 1–15, contratti, autorizzazioni, masking, UI, misure e log dei gate eseguiti dallo sviluppo. Gate finale exit 0, 2.306 unit; Chromium exit 0, 625 passati al primo tentativo e un retry Mailpit.

Per pilota e allievo il test del servizio fallisce con un successo sintetico nel doppio (exit 1, due casi) e passa sul servizio originale (exit 0, due casi). Il piano include una mutazione del gate ACL che il PO ha escluso dall’esecuzione. Il revisore ha accettato questo limite.
