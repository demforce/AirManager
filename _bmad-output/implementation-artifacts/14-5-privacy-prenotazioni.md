---
baseline_commit: 0ff9186
---

# Story 14.5: Privacy prenotazioni — piloti e allievi vedono "Occupato", non i nomi degli altri

Status: done (review Opus 5 shippable-with-fixes — bypass privacy reale trovato e chiuso → fix F1-F7 `3073f78`, suite 282/282, 0 flaky — 2026-07-29)

## Story

As a pilota o allievo che consulta la pianificazione,
I want vedere che un velivolo è occupato in uno slot senza sapere CHI l'ha prenotato,
so that la disponibilità resta consultabile ma le prenotazioni altrui restano private.

**Riferimenti vincolanti**: piano epic 14 (item 9+14), **ratifica R3**: admin E istruttori vedono i nomi; piloti e allievi vedono solo "Occupato" (velivolo + orario, nessun nome) — le PROPRIE prenotazioni restano ovviamente complete.

## Acceptance Criteria

1. **(Masking SERVER-SIDE)** Il mascheramento avviene nel DTO, mai solo in CSS/client: per un actor senza il nuovo permesso (AC2), `listBookings` (e ogni lettura derivata) sostituisce `personName`/`instructorName` con `null` (+ flag/shape che il client rende come "Occupato") su OGNI prenotazione NON propria (propria = `personId` dell'actor, o prenotazione fatta da lui). I nomi non devono MAI raggiungere il wire per chi non ha il permesso (verifica sulla risposta API grezza, non sul render).
2. **(Permesso dedicato)** Nuovo permesso RBAC (es. `bookings.read.names`) concesso a ADMIN, STAFF e INSTRUCTOR (`src/server/auth/rbac.ts:97` — oggi INSTRUCTOR ha solo `self.read`+`bookings.manage.own`); PILOT e STUDENT no. La logica usa il permesso, MAI il ruolo diretto (pattern RBAC esistente). NOTA: STAFF sparirà con la 14.9 — qui va comunque incluso per coerenza fino ad allora.
3. **(Tutti i consumer — "il gemello va misurato")** Il masking copre OGNI superficie che mostra prenotazioni: tabella bookings (`bookings-table.tsx`), pianificazione/schedule (`schedule.tsx` — usato sia da `/dashboard/bookings` sia dall'Overview di `/dashboard`), **PDF export** (`/api/v1/bookings/pdf` — un pilota che esporta ottiene "Occupato", non i nomi), API `GET /api/v1/bookings`, export Excel se esiste. Enumerazione dei consumer nel Dev Agent Record.
4. **(UI "Occupato")** Le prenotazioni mascherate mostrano una label i18n "Occupato"/"Booked" (velivolo e orario restano visibili; nessun altro dato personale: niente note/tipo se rivelano l'identità — valutare e motivare). Coerenza AirOps; nessuna differenza di layout che riveli indirettamente il contenuto.
5. **(Invarianti)** Admin/staff/istruttore: NESSUN cambiamento visibile. Le proprie prenotazioni: complete per tutti. I flussi di creazione/spostamento/cancellazione: INVARIATI (il pilota continua a gestire le proprie).
6. **(Test)** Unit sul masking nel servizio (proprio vs altrui, per ruolo/permesso). e2e: pilota vede "Occupato" sulle prenotazioni altrui e i SUOI dati sulle proprie (tabella E schedule), allievo idem, istruttore vede i nomi, PDF del pilota senza nomi altrui (assert sul contenuto del PDF o della risposta). Full suite CI=1 verde; e2e esistenti che asseriscono nomi da ruoli pilota/allievo aggiornati ai valori corretti (mai indeboliti).

## Contesto (puntatori — ricognizione 2026-07-28)

- DTO: `src/lib/schemas/bookings.ts:124-142` (`personName`/`instructorName` denormalizzati a read time). Servizio: `src/server/services/bookings.service.ts#listBookings`.
- Consumer enumerati (grep `listBookings|BookingListItem`): `bookings/page.tsx`, `dashboard/page.tsx` (Overview embedded), `api/v1/bookings/route.ts`, `api/v1/bookings/pdf/route.ts`, `exports.service.ts` (+ test).
- RBAC: `src/server/auth/rbac.ts` (`PERMISSIONS_BY_ROLE` — INSTRUCTOR `:97`); pattern permesso-non-ruolo in tutto il codice.
- Rendering: `bookings-table.tsx` (colonna pilota), `schedule.tsx` (blocchi calendario con nome).
- **Ambiente**: ciclo e regole macchina come `docs/handoffs/HANDOFF.md`. Story con superficie UI → skill `design-taste-frontend` + `ui-ux-pro-max`. Commit su `dev`: `feat(14.5): privacy prenotazioni — masking server-side dei nomi per piloti e allievi` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- PPR/movimenti (nomi dei richiedenti transiti): non citati dal feedback, restano com'è.
- Rimozione STAFF (story 14.9).
- Notifiche/email di prenotazione: invariati.

## Dev Agent Record

**Status finale**: implementata, gates verdi, full suite CI=1 281/281 (0 flaky). Commit `feat`: `64affed`.

### AC → esito

1. **Masking server-side**: `bookings.service.ts#maskBookingNames` (nuova) — chiamata da `listBookings` e `listCalendarBookings`, DOPO `toListItem`, PRIMA del ritorno. Per un actor senza `bookings.read.names` e `booking.personId !== actor.personId`, sostituisce `personName`/`instructorName`/`notes`/`denyReason` con `null`. Verificato sulla risposta API grezza sia via unit test (mock Prisma) sia via e2e (`GET /api/v1/bookings/calendar` — `rawBlock.personName` `null`) sia via script Playwright interattivo (vedi sotto). `personName` diventa `string | null` in `BookingListItem`/`bookingItemSchema` — `null` è un segnale univoco di masking (una prenotazione reale ha sempre una persona), niente flag booleano separato.
2. **Permesso dedicato**: `bookings.read.names` aggiunto a `Permission` (`rbac.ts`), concesso ad ADMIN (via `ALL_PERMISSIONS`), STAFF, INSTRUCTOR; PILOT/STUDENT non lo ricevono. La logica usa SEMPRE `hasPermission(actor, 'bookings.read.names')`, mai il ruolo diretto.
3. **Tutti i consumer** — enumerazione (grep `listBookings|listCalendarBookings`):
   - `bookings/page.tsx` → `bookings-table.tsx` (tabella "Prenotazioni") — mascherato (masking a monte, nel service).
   - `bookings/page.tsx` → `listCalendarBookings` → `schedule.tsx` (Programma, vista giorno/settimana) — mascherato.
   - `dashboard/page.tsx` (`renderAdminOverview`, gated `finance.manage`) — stesso `Schedule`/`BookingsTable`, ma l'actor è SEMPRE admin/staff (ha il permesso): invariato per costruzione.
   - `dashboard/page.tsx` (`renderInstructorLanding`) — instructor ha il permesso: invariato.
   - `dashboard/page.tsx` (`renderPilotLanding`) — `listBookings(actor, { personId: person.id, ... })` è già filtrato alla persona stessa: masking sempre no-op (mai altrui in quella vista).
   - `GET /api/v1/bookings` (route thin, ritorna `listBookings` direttamente) — mascherato.
   - `GET /api/v1/bookings/calendar` — mascherato.
   - `exports.service.ts#exportBookingsXlsx`/`exportBookingsPdf` — entrambi chiamano `listBookings` internamente (nessuna via di bypass): `row.personName ?? t('occupied')` sostituisce il fallback precedente, così un pilota che esporta ottiene "Occupato" invece di un nome o una cella vuota (colonna Istruttore già `?? ''`, coerente: mascherato o assente sono indistinguibili, come da AC4 "nessuna differenza di layout").
   - `createBooking`/`updateBooking`/`cancelBooking`/`transitionBooking` — NON toccati: il chiamante è sempre "sé stesso" (attore proprietario) o un attore con `bookings.manage.any` (che nel nuovo schema RBAC ha sempre anche `bookings.read.names`), quindi il DTO ritornato non necessita masking.
4. **UI "Occupato"**: nuova chiave i18n `BookingsPage.occupied` ("Occupato"/"Booked"), riusata identica da `bookings-table.tsx` (`labels.occupied`) e `schedule.tsx` (`labels.occupied`) — stessa classe/stile del nome vero (`.student-name`, stesso blocco `.flight`), nessuna differenza di layout. `notes`/`denyReason` mascherati a `null` insieme ai nomi (non solo i due campi nome): `notes` è testo libero che può nominare una persona (l'AC4 chiede esplicitamente di valutarlo); `denyReason` è testo libero scritto da staff su un rifiuto altrui, stessa categoria di rischio — mascherato per coerenza, anche se non nominato esplicitamente dall'AC. Lo `status` (badge PENDING/APPROVED/...) resta visibile: non identifica una persona, e non era nello scope dichiarato.
5. **Invarianti**: admin/staff/istruttore — nessuna riga di codice li tocca diversamente (branch `canReadNames || own` sempre vero per loro). Le proprie prenotazioni: `booking.personId === actor.personId` è l'UNICA condizione di "own" per un attore mascherato (un PILOT/STUDENT non può mai essere l'istruttore di una prenotazione, quindi non serve un secondo check su `instructorProfileId`). Creazione/spostamento/cancellazione: zero righe toccate in quei path.
6. **Test**:
   - Unit (`bookings.service.test.ts`): nuovo describe "listBookings — privacy masking" (pilota mascherato su altrui, NON mascherato su proprio, allievo mascherato, istruttore NON mascherato su prenotazione né propria né sua, staff NON mascherato) + analogo per `listCalendarBookings`.
   - Unit (`exports.service.test.ts`): `exportBookingsPdf` con `personName: null` in input → colonna "Pilota" = "Occupato" (mai una cella vuota che nasconderebbe la mancata fuga del nome).
   - Unit (`rbac.test.ts`): matrice permessi aggiornata con `bookings.read.names` per ogni ruolo + nuovo test dedicato istruttore.
   - e2e (`bookings.spec.ts`): (a) test esistente "un allievo alone sees..." AGGIORNATO (era: asserisce il nome del pilota sul calendario — ora ratifica R3 lo vieta): asserisce "Occupato", `not.toContainText` sul nome, e un controllo sulla risposta API GREZZA (`GET .../calendar`) con `personName: null`; (b) test esistente "own-path pilot sees only Modifica/Annulla..." AGGIORNATO: la riga "altrui" non è più disambiguabile per cognome (ora mascherato) — disambiguata da "Occupato" invece, con assert esplicito che il cognome non compaia; (c) nuovo describe "Booking privacy masking" — pilota vede dati completi sulla propria (tabella E schedule) e "Occupato" sull'altrui, istruttore vede il nome vero su una prenotazione che non è né sua né creata da lui.
   - Verifica interattiva (script Playwright throwaway, MAI committato, Chromium cache `~/.cache/ms-playwright/chromium-1228`): confermato visivamente pilota/allievo → "Occupato" su altrui + dati reali su propria (screenshot), istruttore → nome vero, risposta API grezza (`GET /api/v1/bookings`) con `personName`/`instructorName`/`notes` tutti `null` per il pilota sull'altrui, PDF export del pilota 200/`application/pdf` valido.

### Deviazione (motivata) dall'enumerazione consumer del Contesto

Il Contesto elencava anche `bookings/page.tsx`, `dashboard/page.tsx` (Overview embedded) come consumer DA VERIFICARE, non da modificare singolarmente: dato che il masking vive nel SERVICE (`listBookings`/`listCalendarBookings`), nessuno di questi due file necessitava modifiche dirette — il masking li raggiunge per costruzione. Le uniche modifiche client-side sono state i due punti di RENDER del nome (`bookings-table.tsx`, `schedule.tsx`) più i tipi che ora ammettono `personName: string | null` lungo tutta la catena (`booking-schedule.ts`, `bookings-table.tsx`, `schemas/bookings.ts`).

### Fix e2e in corso d'opera (contesa `fullyParallel`, non un bug applicativo)

Il primo giro di full suite (DB fresco) falliva in modo riproducibile (2/2 run) su `e2e/home-dashboard.spec.ts:186` — l'Overview admin mostra le ULTIME 8 prenotazioni (`EMBED_BOOKINGS_PAGE_SIZE`) ordinate per `startsAt` crescente; il nuovo describe "Booking privacy masking" usava "domani" (stesso bucket condiviso da altri spec) per le sue 2 prenotazioni di fixture, e sotto `fullyParallel` questo spingeva la riga del test di home-dashboard fuori dalla finestra di 8 righe (stessa classe di contesa già documentata in CLAUDE.md per gli aggregati globali). Fix chirurgico: le fixture del nuovo describe usano `FUTURE_DAY` (2031-03-10, la stessa costante già usata da altri test di questo file per lo stesso motivo) invece di "domani" — un giorno lontano non compete mai per la finestra "più vicine" di nessun altro test. Rieseguito 2 volte dopo il fix: 281/281, 0 flaky, catena serializzata (settings/booking-window/treasury-settings/billing-global) intatta.

### File toccati

`src/server/auth/rbac.ts`, `src/server/auth/rbac.test.ts`, `src/lib/schemas/bookings.ts`, `src/server/services/bookings.service.ts`, `src/server/services/bookings.service.test.ts`, `src/server/services/exports.service.ts`, `src/server/services/exports.service.test.ts`, `src/lib/booking-schedule.ts`, `src/app/[locale]/dashboard/bookings/bookings-table.tsx`, `src/app/[locale]/dashboard/bookings/schedule.tsx`, `src/app/[locale]/dashboard/bookings/booking-labels.ts`, `messages/it.json`, `messages/en.json`, `e2e/bookings.spec.ts`.

### Gates / full suite (verbatim)

```
PASS  lint (32s)
PASS  typecheck (5s)
PASS  test (14s) — Tests  1558 passed (1558)
PASS  build (40s)
```

Full suite finale (CI=1, build prod, DB fresco): **281 passed (8.7m), exit 0, 0 flaky**, catena serializzata 15/15.

## Review Record

**Reviewer**: subagent adversarial (Opus 5 xhigh) — 2026-07-28. **Verdetto**: shippable-with-fixes (2 major, 4 minor, 1 nit).

### Priority zero — full suite (arbitro, DB fresco, build prod)

`export JOBS_SECRET=<non-placeholder>` + `CI=1 npx playwright test` (foreground su file). Verbatim:

```
  2 flaky
    [chromium] › e2e/aircraft-rates.spec.ts:331:7 › ... a STAFF actor (aircraft.manage but not settings.manage) sees no "Tariffe" block ... (story 14.8, AC 1/2)
    [chromium] › e2e/cash-register.spec.ts:169:7 › ... deleting a category in use via the API fails with a clear message suggesting deactivation (AC 1)
  279 passed (9.7m)
EXIT=0
```

281 test totali, exit 0. Entrambi i flaky sono classe **trasporto** (`apiRequestContext.post: read ECONNRESET` su `POST /api/v1/users` e `POST /api/v1/cash-categories`, fixture di setup di spec preesistenti), verdi al retry #1 — nessun test della 14.5 coinvolto. Gate rieseguiti a valle: `PASS lint (21s) / PASS typecheck (4s) / PASS test (12s) — 1558 passed / PASS build (53s)`.

### Cosa regge (verificato empiricamente, non per lettura)

- **Masking server-side, sul filo**: da `pilot@` e `student@`, su `GET /api/v1/bookings` e `GET /api/v1/bookings/calendar`, la prenotazione altrui arriva con `personName`, `instructorName`, `notes`, `denyReason` **tutti `null`**; la propria arriva completa.
- **Export**: PDF scaricato da sessione pilota → `I-ZD2ZK | Occupato | ... | Approvato` (colonna Istruttore vuota) accanto a `I-ZWNT5 | Piero Volante` (la propria). Idem xlsx (`sharedStrings.xml`).
- **Nessun side-channel nel DOM**: il blocco mascherato è `<div class="flight" title="10:00–11:00">…<span>Occupato</span></div>`; scansione di tutti gli attributi della pagina → zero occorrenze dei nomi mascherati.
- **Invarianti AC 5**: un allievo vede completa la lezione prenotata per lui dall'istruttore; 403 e 409 non rivelano il proprietario dello slot; la landing pilota non contiene nomi altrui e l'embed Overview è irraggiungibile (gate `finance.manage`).

### Findings

| # | Sev | Titolo |
|---|-----|--------|
| F1 | **major** | `instructorName` mascherato ma **ricostruibile in 3 click**: `instructorProfileId` resta in chiaro nel DTO e la pagina serve a tutti l'anagrafica istruttori (id → cognome) |
| F2 | **major** | Il nuovo e2e fallisce **deterministicamente** su DB non fresco: asserisce pagina 1 mentre le fixture `FUTURE_DAY` ordinano ultime |
| F3 | minor | `personId` non mascherato + filtro `?personId=` senza guardia (il precedente `listFlights` risponde 403) → linkabilità pseudonima |
| F4 | minor | Due definizioni divergenti di "own": l'istruttore-di-record vede la propria lezione "Occupato" ma la modifica e **riceve indietro il DTO non mascherato** |
| F5 | minor | AC 6 chiede un e2e sul PDF del pilota: assente (lo unit test **inietta** `personName: null`, non può fallire su regressione) |
| F6 | minor | OpenAPI: `personName` diventa nullable (breaking per il client Flutter) senza una riga di contratto; `bookings.read.names` non documentato |
| F7 | nit | Risposta grezza verificata solo su `/bookings/calendar`, non su `GET /api/v1/bookings` |

**F1 — evidenza decisiva.** `maskBookingNames` (`bookings.service.ts:208-211`) lascia `instructorProfileId`; `bookings/page.tsx:140` chiama `listActiveInstructors(actor)` (servizio `self.read`, `bookings.service.ts:1220-1229`) **incondizionatamente** e lo passa a `Schedule` (`page.tsx:311`), componente client → la mappa id→cognome finisce nel payload RSC di ogni pilota/allievo; il popover filtri rende un bottone per istruttore (`schedule.tsx:386`) e filtra i blocchi via `matchesInstructorFilter(block.instructorProfileId)` (`schedule.tsx:214, 453, 527`).

```
RAW (pilot@):  "personName":null, "instructorName":null, "instructorProfileId":"cms56tt5x000rbkpvhiawiawz"
HTML (pilot@): {"instructorProfileId":"cms56tt5x000rbkpvhiawiawz","firstName":"Docente","lastName":"Riservato-…"}

UI (pilot@), senza filtro:  ["I-Q452553 | Occupato | 13:00–14:00", "I-ZD2ZK | Occupato | 10:00–11:00"]
UI dopo filtro "Riservato-…": ["I-ZD2ZK | Occupato | 10:00–11:00"]   ← il pilota ora sa di chi è quella lezione
```

Questo falsifica l'affermazione del Dev Agent Record: *"nulling instructorName unconditionally also means a masked dual-instruction booking renders IDENTICALLY to a masked solo one — no layout tell"*. Fix: azzerare anche `instructorProfileId` in `maskBookingNames` e non rendere il gruppo filtro Istruttore per chi non ha `bookings.read.names`.

**F2 — riproduzione.** Con 65 prenotazioni nella finestra della lista (`from = now-48h`, `BOOKINGS_PAGE_SIZE = 20`, ordine `startsAt asc`):

```
$ npx playwright test e2e/bookings.spec.ts -g "pilot sees full data" --workers=1
exit=1
    Locator: getByTestId('booking-row').filter({ hasText: 'I-BK…' })
    Expected substring: "Piero"   → element(s) not found     (e2e/bookings.spec.ts:1760)
```

Le asserzioni di *schedule* dello stesso test passano (vista giorno non paginata). Fix: usare `findBookingRow` (già nel file, `:1496`), mantenendo `FUTURE_DAY`.

### Verdetto sulle 3 deviazioni dichiarate

1. **Consumer non toccati direttamente** — ACCETTATA sul meccanismo (tutti e sei i consumer verificati mascherati sul filo), **RESPINTA come enumerazione**: "per costruzione" copre il campo, non la superficie; il join a livello di pagina è sfuggito (F1). È la lezione *"il gemello va MISURATO"* applicata al dato collaterale.
2. **`denyReason` mascherato** — ACCETTATA: stessa classe di rischio di `notes`, costo operativo nullo, elimina anche un tell di layout sotto il badge DENIED. Tenere visibile lo `status` è corretto.
3. **`tomorrow` → `FUTURE_DAY`** — ACCETTATA nella diagnosi (la contesa con `home-dashboard.spec` è reale), **RESPINTA nell'implementazione**: nessun assert è stato svuotato, ma il test non è più rieseguibile su DB sporco (F2).

### Nota ambiente

DB lasciato **sporco** (68 prenotazioni, incluse le fixture d'attacco); il server prod avviato per gli attacchi è stato spento (porta 3000 libera). Reset DB prima del prossimo run di suite.

### Fix post-review (2026-07-29, fix-subagent Sonnet 5 xhigh — commit `3073f78`)

- **F1 fixed (IL BYPASS, major)** — chiuso su ENTRAMBE le metà: `maskBookingNames` azzera anche `instructorProfileId`; `bookings/page.tsx` non chiama più `listActiveInstructors` (passa array vuoto) senza `bookings.read.names`, e `schedule.tsx` non rende il gruppo filtro Istruttore con array vuoto (l'emptiness È il segnale di permesso — niente prop ridondante). **Attacco del reviewer riprodotto POST-fix da pilot@ E student@**: (a) nessun cognome istruttore nel payload RSC, (b) zero elementi `schedule-filter-instructor-*`, (c) API calendar con `personName`/`instructorName`/`instructorProfileId` tutti null sulla riga mascherata. Controprova: admin e istruttore vedono tutto come prima. Unit su `instructorProfileId: null` per entrambe le letture.
- **F2 fixed** — `findBookingRow` promosso a scope modulo e usato dalle due lookup del nuovo describe: il test non assume più pagina 1 (il verde precedente era artefatto dell'ordine di esecuzione su DB fresco).
- **F3 fixed** — `listBookings` lancia `ForbiddenError` PRIMA di ogni query se un attore senza `bookings.read.names` filtra per un `personId` non suo (stessa forma di `authorizeFlightsQuery`); `listCalendarBookings` non ha quel filtro (documentato). Unit: pilota su altrui 403 senza query, pilota su sé stesso OK, staff OK.
- **F4 fixed** — le due nozioni di "own" allineate: `maskBookingNames` riceve `ownInstructorProfileId` (risolto una volta per richiesta, SOLO quando `canReadNames` è false — asserito con `not.toHaveBeenCalled()`), e un profilo istruttore DISATTIVATO non conta come own (unit dedicato).
- **F5 fixed** — e2e AC6 mancante aggiunto: export xlsx da sessione pilota (scelta del reviewer: assert a livello di cella con ExcelJS, stesso path di masking del PDF) filtrato su aircraftId run-unique → "Occupato" al posto del cognome altrui.
- **F6 fixed** — le 3 description OpenAPI documentano il contratto di masking (quali campi vanno a null, che null = "Occupato" e mai "persona assente", il permesso, e il 403 del filtro personId).
- **F7 fixed** — assert grezzo anche su `GET /api/v1/bookings` (prima solo `/calendar`).

**Gates post-fix**: PASS lint/typecheck/test/build — **1565 unit**.

**Full suite finale** (fix-subagent, DB fresco + build prod + JOBS_SECRET, foreground):

```
282 passed (9.5m)
```
Exit code `0`, **0 flaky**, entrambi i test toccati verdi (privacy masking 9.2s, nuovo export xlsx 3.2s).

**Nota ambiente registrata dal subagent**: `scripts/reset-db.sh` non funziona in questa sandbox (assume l'utente OS `postgres` del container remoto); equivalente usato: DROP/CREATE via `docker exec ... psql -U airmanager` + `migrate deploy` + `db seed` — deliberatamente NON `prisma migrate reset`.

**Esito finale: tutti i findings chiusi. Story DONE.**
