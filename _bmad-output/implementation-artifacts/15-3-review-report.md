# Review adversarial — Story 15.3 "Panoramica mobile"

Reviewer: adversarial subagent (Opus 5 xhigh) — unico layer adversarial della pipeline.
Data: 2026-07-30. Repo `/home/admin/AirManager`, branch `dev`.
Diff sotto review: **`99d6453`** (feat) + `6fd9355`, `1006193`, `118d599` (docs). Base `6a5d112`.
Skill applicate: `bmad-code-review` (gather → adversarial → triage), `karpathy-guidelines`.

---

# VERDETTO: **SHIPPABLE-WITH-FIXES**

Nessun blocker. La story fa quello che le 8 ratifiche PO chiedono, l'RBAC regge
alla prova sull'HTML grezzo per tutti e quattro i ruoli, e la suite completa su
DB fresco è **verde al 100%**. Restano **4 findings Medium** (tutti riparabili con
modifiche chirurgiche) e **4 Low** (F8 aggiunta nell'addendum finale).

---

## 0. Run arbitro e2e — il numero che conta

```
$ docker exec airmanager-postgres-1 psql -U airmanager -d airmanager \
    -c 'select (select count(*) from "Aircraft") aircraft, (select count(*) from "Booking") bookings,
               (select count(*) from "Person") people, (select count(*) from "LoginAttempt") attempts;'
 aircraft | bookings | people | attempts
----------+----------+--------+----------
        1 |        0 |      4 |        0        <-- DB FRESCO, prima del run

$ export JOBS_SECRET=<non-placeholder>; bash scripts/e2e.sh start
STARTED (pid 507437) — log: /tmp/airmanager-e2e/last-run.log

$ bash scripts/e2e.sh status
state: DONE — E2E_EXIT=0
--- summary ---
  320 passed (7.9m)
```

**320 passed / 0 failed / 0 flaky / 0 skipped — `E2E_EXIT=0`, DB fresco: SÌ.**
Inclusi i due spec nuovi (`mobile-overview` 9/9 nel project `chromium`,
`mobile-metar` 2/2 in coda alla catena serializzata: **non ha skippato**,
`aviationweather.gov` è raggiungibile da questo host — verificato a mano,
`HTTP 200` in 0.51s).

Gate unitari, rieseguiti da me:
```
$ npm run gates
PASS  lint (21s)   PASS  typecheck (3s)   PASS  test (8s) — 1626 passed   PASS  build (31s)
GATES_EXIT=0
```

---

## 1. Esito dei 5 claim del dev

| # | Claim | Esito | Prova |
|---|---|---|---|
| 1 | «290 passed / 13 failed, **nessuna dal codice della story**» | ✅ **VERO** | Su DB fresco i 13 rossi spariscono tutti: 320/320. L'attribuzione (classi A "tetto `OPTIONS_PAGE_SIZE`", B "fixture interattiva", C "finestra cappata") era corretta. |
| 2 | «Guardia AD-2: insieme dei "falliscono solo con me" vuoto» | ✅ **VERO, e con prova più forte** | `bookings.spec.ts` è **interamente verde** nel run arbitro su DB fresco: l'estrazione di `postBookingTransition` non rompe nulla. ⚠️ Nota: il log del confronto baseline del dev **non è più riauditabile** — `scripts/e2e.sh start` sovrascrive `/tmp/airmanager-e2e/last-run.log`, e il mio run l'ha sostituito. Il claim regge sull'evidenza nuova, non su quella citata. |
| 3 | «Desktop invariato: 9 snapshot, differenza zero» | ⚠️ **VERO ma di scopo troppo stretto** | Misurato da me a 641/800/1280px: `.overview-mobile`/`.landing-mobile` `display:none`, `.home-desktop-surface` `block/block/grid`, `.kpi-row` `grid`, `.home-head-actions` `display:flex gap:8px flex:0 1 auto`, `.app` `64px 577px` (641) / `64px 736px` (800) / `232px 1048px` (1280), page-overflow 0 ovunque. **Ma "desktop invariato" non è "nulla d'altro è cambiato": F1 è una regressione visiva su un'ALTRA superficie MOBILE, che nessuno dei 9 snapshot poteva vedere.** |
| 4 | «2 miei test erano scritti male, corretti (e non resi ciechi)» | ✅ **VERO** | Le correzioni rileggono la decisione **dall'API filtrata sul velivolo run-unique** (deterministico, non "fotografia+uguaglianza"). La guardia KPI 2×2 porta la simulazione pre-fix **dentro** il test (`classList.remove('kpi-row-grid')`); l'ho rimisurata in modo indipendente: strip admin → `reachable = [true,true,false,false,false]`; griglia pilota/allievo/istruttore → `[true,true,true,true]`. **Discriminante.** |
| 5 | «Deviazione testid `mobile-overview-*` invece di `booking-row-mobile`» | ✅ **REGGE** | `BookingsTable` è embeddata **anche sulla home** (`page.tsx:624`): in 15.4 il suo albero mobile emetterebbe `booking-row-mobile` sulla home, cioè esattamente il doppione che la convenzione previene (e `toHaveCount` conta anche i nodi `display:none`). Deviazione dichiarata e motivata: accettata. |

---

## 2. Findings

### 🟠 F1 — MEDIUM — `.home-head-actions .btn` sfonda dentro il pannello `SlideOver` del `FlightEditor` (superficie che la story dichiara "da NON toccare")

**File**: `src/styles/airops.css:2027-2030` (regole `.home-head-actions .btn`, `.home-head-actions .btn.primary`) · `src/app/[locale]/dashboard/page.tsx:489-500`.

`DispatchFlightButton` rende **il trigger E il `<FlightEditor>` (uno `SlideOver`)
come fratelli dentro lo stesso `<div className="home-head-actions">`**. Il
selettore **discendente** `.home-head-actions .btn` raggiunge quindi anche i
bottoni del footer del pannello a tutto schermo — la superficie che la story
elenca esplicitamente fra quelle intoccabili:

> «**Modalità full-screen di `SlideOver`** … la sola superficie che la usa è
> `DispatchFlightButton` → `FlightEditor`, già coperta dalla 15.2. **Da NON toccare**.»
> (`15-3-panoramica-mobile.md`, riga 111)

**Riproduzione** (375×812, admin, build di produzione):
1. `/it/dashboard` → tap "Pianifica volo" → il pannello si apre a tutto schermo.
2. Misurare i `.btn` di `.so-foot`, poi rimuovere a runtime la sola classe
   `home-head-actions` dal wrapper (= stato pre-story) e rimisurare.

**Evidenza** (`probe3`, output verbatim):

| | `flex` | `justify-content` | larghezza "Annulla" | larghezza "Registra volo" |
|---|---|---|---|---|
| **come spedito** | `1 1 0px` / `1 1 100%` | `center` | 69px | **191px** |
| **senza la classe (pre-story)** | `0 1 auto` | `normal` | 69px | **118px** |

Screenshot a confronto: `/tmp/shot-editor-with-class.png` vs
`/tmp/shot-editor-without-class.png` — i bottoni passano da "allineati a destra a
larghezza naturale" a "stirati per riempire la riga".

**Perché è un finding e non una preferenza**: (a) è una modifica **misurabile** a
una superficie fuori dal perimetro dichiarato; (b) non è né misurata né dichiarata
nel Dev Agent Record — §7 misura solo ≥641px e §8 chiude il blast radius senza
accorgersene; (c) la regola `.home-head-actions .btn.primary{ flex-basis: 100% }`
è una bomba a orologeria: **qualunque** `.btn.primary` che finisca, oggi o domani,
dentro quel wrapper (anche annidato in un pannello) diventa full-width.

**Fix suggerito**: figlio diretto — `.home-head-actions > .btn` e
`.home-head-actions > .btn.primary`. Verifica: rimisurare i due `.so-foot .btn`
(devono tornare 69/118 e `flex: 0 1 auto`) e ricontrollare che
`dispatch-flight-button` resti 319×44 in testata.

---

### 🟠 F2 — MEDIUM — la mitigazione "riga stantia" è agganciata al 409, ma lo scenario che documenta produce **422**: lo sheet resta aperto su una riga morta

**File**: `src/app/[locale]/dashboard/mobile-pending-bookings.tsx:109-119` (ramo di
`handleApprove`) e `:140-149` (ramo di `submitDeny`) ·
`src/app/[locale]/dashboard/bookings/booking-transition.ts:76-78`.

Il commento nel codice dichiara:

> «Review 15.2 F4's lesson: **a 409 means somebody else decided this booking**, so
> the row on screen is stale — it has to go, or the same card keeps re-opening a
> sheet that can only produce another 409.» (`mobile-pending-bookings.tsx:111-113`)

**È falso.** `transitionBooking` (`src/server/services/bookings.service.ts:1103`)
alza per quel caso una `ValidationError` con codice `BOOKING_TRANSITION_INVALID`,
che `src/lib/api/handler.ts` mappa a **422**, non a 409 (`ConflictError → 409`,
`handler.ts:34`). Il 409 su questo endpoint significa un'altra cosa: sovrapposizione
di slot / aeromobile archiviato — e il testo di `errors.conflict` lo dice
(«Il velivolo è già prenotato per questo intervallo…»).

Conseguenza misurata: nel caso reale «un altro operatore ha già deciso»,
`outcome.conflict === false` ⇒ **niente `closeSheet()`, niente `router.refresh()`**.

**Riproduzione** (375×812, admin):
1. creare una prenotazione PENDING run-unique;
2. `/it/dashboard`, tap sulla riga in "Prenotazioni in attesa" → sheet aperto;
3. approvarla **fuori banda** (`POST /api/v1/bookings/{id}/transition {to:'APPROVED'}` → 200);
4. premere "Approva" nello sheet.

**Evidenza** (`probe8`, output verbatim):
```json
"oobStatus": 200,
"uiTransitionStatus": 422,          <-- non 409
"after409Steps": [
  {"at":300,  "sheets":1, "row":1, "toast":"Questa prenotazione è già stata aggiornata da un altro operatore..."},
  {"at":1000, "sheets":1, "row":1, "toast":"...stessa..."},
  {"at":2500, "sheets":1, "row":1, "toast":""},
  {"at":5000, "sheets":1, "row":1, "toast":""}
]
```
A 5 secondi dall'errore lo sheet è **ancora aperto** sopra una riga che non esiste
più in quello stato, e ripremere "Approva" ripete l'errore all'infinito: è
letteralmente il ciclo che il commento dice di aver chiuso.

Il messaggio mostrato è comunque quello giusto (il testo di
`BOOKING_TRANSITION_INVALID` è già "già aggiornata da un altro operatore"), quindi
l'utente non è disinformato — ma la superficie resta bloccata.

Nota di simmetria: sul desktop il 422 non fa refresh nemmeno lui, quindi il
comportamento non è *peggiore* del desktop; è però la superficie **primaria** della
story, e il Dev Agent Record §2 AC 3 lo dichiara risolto («409 ⇒ … **più chiusura
sheet + `router.refresh()`** (lezione review 15.2 F4)»).

**Fix suggerito**: trattare come "stantia" anche `BOOKING_TRANSITION_INVALID`
(es. `stale: conflict || code === 'BOOKING_TRANSITION_INVALID'` in
`postBookingTransition`), e — visto che nessun test copre questo ramo — aggiungere
la guardia e2e corrispondente (fixture PENDING, decisione fuori banda via
`page.request`, poi tap su Approva ⇒ sheet chiuso e riga sparita).

---

### 🟠 F3 — MEDIUM — "Prenotazioni in attesa": la testata conta 10, la card ne elenca 8, e non c'è nessun segnale di troncamento

**File**: `src/app/[locale]/dashboard/page.tsx:80-89` (il doc-comment che dichiara
l'invariante), `:298` (`pageSize: MOBILE_PENDING_BOOKINGS_PAGE_SIZE = 8`), `:549`
(`count: t('overview.mobile.pending.count', { count: embedPendingResult.total })`) ·
`src/app/[locale]/dashboard/mobile-pending-bookings.tsx:197-201` (il commento che
motiva l'assenza di footer).

Il codice dichiara come proprio invariante:

> «this story only asks it for rows too, so **the card lists what the count counts**
> and no query is added.» (`page.tsx:83-84`)

L'invariante è **falso appena `total > 8`**, che è la condizione normale di un
campo attivo.

**Evidenza** (`probe3` + `psql`, DB reale post-suite):
```json
"pending": { "head": "Prenotazioni in attesa / 10 da approvare", "rows": 8, "foot": 0 }
```
```
$ docker exec airmanager-postgres-1 psql -U airmanager -d airmanager -t -c \
  "select count(*) from \"Booking\" where status='PENDING' and \"startsAt\" >= now() - interval '48 hours';"
   10
```
La card mostra 8 righe, la testata dice 10, **e non c'è nulla che dica dove sono le
altre 2**: `.mobile-card-foot` è assente per scelta esplicita
(`mobile-pending-bookings.tsx:197-201`). L'unico varco è la scorciatoia generica
"Pianificazione" a fondo pagina, che non è collegata alla card né al numero.

È una forma attenuata dello stesso difetto di review 12.12 F3 (la testata dichiara
più di quanto la superficie mostri), su una **coda decisionale**. E la card sorella
"Avvisi" risolve esattamente questo problema, nella stessa pagina, con
`hiddenCount` + riga "+N altri · Vedi tutte" (`overview-alerts.ts:66-77`,
`mobile-alerts-card.tsx:79-85`) — quindi l'asimmetria non è nemmeno difendibile
come coerenza di linguaggio.

Il desktop, per confronto, è onesto: la sua testata dice «10 in attesa · 69 totali»
ed ha la paginazione.

**Fix suggerito**: riusare il pattern già scritto — footer "+N · Vedi tutte" verso
`/dashboard/bookings?status=PENDING` quando `total > righe`. (Alternativa
"cappare la testata a 8" **NON** va bene: violerebbe AC 3, che pretende
`embedPendingResult.total`.)

---

### 🟠 F4 — MEDIUM — due `mobile-booking-sheet` aperti insieme dopo **2 tab**: due `role="dialog"`, due scrim, testid duplicato

**File**: `src/app/[locale]/dashboard/mobile-booking-list.tsx:124` e
`src/app/[locale]/dashboard/mobile-pending-bookings.tsx:208` — entrambi passano
`testId="mobile-booking-sheet"`, e sulla **faccia admin sono montati entrambi**
(`page.tsx:528` e `:542`), ciascuno con il proprio `openId` indipendente.

**Riproduzione** (375×812, admin, tastiera):
1. `/it/dashboard`, aprire una riga di "In corso ora" → sheet aperto, focus sul pannello;
2. premere **Tab** due volte.

**Evidenza** (`probe9`, output verbatim):
```json
"doubleSheet": {
  "tabsPressed": 2,
  "trail": ["1:BUTTON/null/IN", "2:BUTTON/mobile-overview-pending-row/OUT"],
  "result": { "sheets": 2, "dialogs": 2, "scrims": 2 }
}
```
Al secondo Tab il focus è già **fuori** dallo sheet, sulla prima riga della coda in
attesa; `Enter` apre il secondo sheet **senza chiudere il primo**: due pannelli
sovrapposti, due scrim, e `page.getByTestId('mobile-booking-sheet')` diventa
ambiguo in strict mode — che è precisamente ciò che AC 9 vieta
(«nessun testid duplicato in tutta la suite»).

Il focus trap è dichiarato fuori scope (15.10) e **non è quello che contesto**: il
difetto qui è di questa story, che per la prima volta monta **due proprietari di
sheet con lo stesso testid sulla stessa faccia**. In 15.2 (`ppr-console.tsx`) il
proprietario era uno solo, quindi il problema non poteva esistere.

**Fix suggerito** (uno dei due, entrambi chirurgici):
- testid distinti (`mobile-inprogress-sheet` / `mobile-pending-sheet`) — toglie
  l'ambiguità di strict mode ma lascia i due dialog impilati; **oppure**
- alzare `openId` a un unico stato della Panoramica, così l'apertura di uno chiude
  l'altro (chiude anche il doppio dialog).
In entrambi i casi serve un'asserzione: `toHaveCount(<=1)` su `[role="dialog"]`
dopo la sequenza Tab+Enter sopra.

---

### 🟡 F5 — LOW — la regola «feed Avvisi SOLO sulla faccia admin» (AC 4 / R-15.3-e) non ha nessuna guardia

Ho verificato che **regge** (v. §3, RBAC), ma nessuno spec la asserisce: né
`mobile-overview.spec.ts` né `home-dashboard.spec.ts` contengono un
`toHaveCount(0)` su `mobile-overview-alerts` per pilota/allievo/istruttore. È
esattamente la classe di regola che AC 11 vuole protetta («una regola senza guardia
è una regola che può sparire»), e qui la regola protegge **dati finanziari di
terzi**: il giorno in cui qualcuno spostasse `MobileAlertsCard` in un componente
condiviso fra le tre facce, niente diventerebbe rosso.

**Fix suggerito**: tre righe in `mobile-overview.spec.ts` (loop sui tre attori,
`await expect(page.getByTestId('mobile-overview-alerts')).toHaveCount(0)`).

---

### 🟡 F6 — LOW — il METAR è `await`-ato in serie DOPO il `Promise.all`, su tutte e tre le facce e a **ogni** larghezza

**File**: `src/app/[locale]/dashboard/page.tsx:227-232` (`renderMobileMetarCard`),
chiamato a `:473`, `:856`, `:990`.

`renderMobileMetarCard` esegue `getMetarStation()` (una lettura DB) **più**
`getMetar()` (una `fetch` HTTP verso `aviationweather.gov` **senza timeout** —
`metar.service.ts:110-124`, difetto preesistente della 12.11) fuori dal
`Promise.all` che sta appena sopra. Risultato: la latenza upstream si somma a
quella delle query invece di sovrapporsi, per ogni render della home, **anche a
1280px dove la card ha box 0×0**.

R-15.3-f ha ratificato *il doppio fetch*, non la serializzazione: infilare le due
promise nel `Promise.all` esistente è una modifica di due righe che toglie il
costo senza toccare la ratifica.

---

### 🟡 F7 — LOW — «+N altri» del feed Avvisi è un numero cappato presentato come totale

`buildOverviewAlerts` calcola `hiddenCount` sulle sole scadenze effettivamente
fetchate, e quelle sono cappate a `EXPIRIES_WIDGET_SCAN_LIMIT = 60`
(`page.tsx:79`, `:304`). Misurato sul DB reale: la riga dice **«+48 altri · Vedi
tutte»** mentre il numero vero di voci non mostrate è ≥ quello.

È la stessa limitazione già accettata in review 12.12 F4 per `ScadenzeWidget`, ma
là il testo è «+N altre» *dentro una finestra dichiarata*; qui diventa il conteggio
di un feed che si presenta come completo. Basta un commento nel codice + (se il PO
lo vuole) una resa "+60 e oltre".

---

## 3. Cosa ho attaccato e ha retto (non-findings, con la misura)

**RBAC — a prova di HTML grezzo, non solo di DOM renderizzato.**
`listNegativeBalances` è doppiamente gated (`authorize(actor,'finance.manage')` in
`accounts.service.ts:737` **e** chiamata solo dentro `renderAdminOverview`, a sua
volta dietro `canManageFinance`, `page.tsx:132`). Verificato scaricando l'HTML del
server per i tre attori non-admin (`probe9`):

```json
"pilota":     {"alertsCard":false,"alertRow":false,"pendingCard":false,"inProgress":false,"approveBtn":false}
"allievo":    {"alertsCard":false,"alertRow":false,"pendingCard":false,"inProgress":false,"approveBtn":false}
"istruttore": {"alertsCard":false,"alertRow":false,"pendingCard":false,"inProgress":false,"approveBtn":false}
```
Nessun saldo, nessuna scadenza altrui, nessun bottone di decisione raggiunge chi
non ha `finance.manage`. (Il ruolo STAFF non esiste più dalla 14.9 — matrice reale:
admin / istruttore / pilota / allievo, tutti e quattro provati.)

**KPI 2×2 (R-15.3-c) — la guardia è discriminante e regge anche al valore lungo.**
Misurato a 375px su tutte e tre le facce personali: `display:grid`, 4 figli,
`scrollLeft 0`, `scrollWidth - clientWidth = 0`, `reachable = [true,true,true,true]`.
Poi ho iniettato **il valore che aveva prodotto il difetto 15.2 F2**
(`'SEP(land) · IR(A) · Night · TMG · Acrobatico · Rimorchio alianti'`) **e** un token
non spezzabile di 59 caratteri in *tutti* e 4 i `.kpi-value`:
`pageOverflow 0`, `rowOverflow 0`, `maxCardWidth 154.5 ≤ 375`, `valueOverflow 0`,
`reachable` ancora `[true,true,true,true]`. Il tetto della strip (`max-width:100%`)
è tolto dalla griglia (`max-width:none`), ma `min-width:0` sul grid item +
`overflow-wrap:anywhere` + `-webkit-line-clamp:2` reggono al posto suo. **Nessun
difetto.**

**Switch degli alberi e fascia tablet (R1).** 375/390: `.overview-mobile` `flex`,
tutti e tre i `.home-desktop-surface` `none`, page-overflow 0. 641/800/1280:
`.overview-mobile` `none`, `.home-desktop-surface` `block/block/grid`, `.kpi-row`
`grid`, rail `64px` a 641 e 800, page-overflow 0.

**Card METAR (R-15.3-f).** Con stazione configurata (`LIML`), a 375px è presente e
visibile su **tutte e tre** le facce (admin/pilota/istruttore), testo
`METEO CAMPO | LIML | 33°C | VFR | METAR LIML 301850Z 11004KT 070V150 CAVOK 33/20 Q1016 NOSIG`,
`rawBoxOverflow 0`, `pageOverflow 0`. A 641/800/1280 il box è **0×0** con
`offsetParent null` e antenato `display:none` — il buco 641-900px del TD è reale e
la card non lo copre di straforo. A 1280 `.weather-card` della sidebar torna
`flex`. Stazione ripristinata a `''` a fine probe (`PUT /api/v1/settings/metar-station` → 200).

**Contrasto (canvas → WCAG), riprodotto in modo indipendente.** Chiaro / scuro:
titolo card 18.79 / 18.69 · conteggio mono 4.85 / 6.79 · titolo riga 18.79 / 18.69 ·
sub mono 4.85 / 6.79 · chip marche 17.01 / 17.67 · chevron 3.66 / **4.92** ·
titolo avviso 18.79 / 18.69 · sub avviso 4.85 / 6.79 · bottoni shortcut/see-all
18.79 / 15.74 · **icona avviso `red` sulla superficie NUOVA: 8.38 / 4.94** ·
**gemello desktop `ScadenzeWidget`: 8.38 / 1.35**. I due numeri chiave (4.94 nuovo,
1.35 desktop) **coincidono al centesimo** con la tabella §6 del dev: la correzione
dark è reale e il TD §10.2 è reale. Tutti i testi ≥4.5, tutti gli oggetti grafici ≥3.
*(Nota d'ambiente: gli screenshot PNG in questo container non ri-renderizzano i
colori `lab()` del tema scuro — le misure sono computed-style + canvas, non
giudizio visivo.)*

**Sheet, toast, layering.** Sheet aperto: `z-index 40`, `elementFromPoint` sul
centro della tab bar restituisce un nodo **dentro `.mobile-sheet`** (lo scrim la
copre); pannello senza overflow (`panelOverflow 0`), pagina senza overflow.
`.toast-host` `z-index 200`, `bottom 92px`. Toast di successo misurato:
`"Prenotazione approvata."` — lo stesso del desktop (`list.actions.approveSuccess`).

**Parità informativa dello sheet.** Righe rese, verbatim:
`AEROMOBILE | PILOTA | ISTRUTTORE | INIZIO | FINE | DURATA | NOTE`, con badge di
stato in testa e `aria-label` del dialog
`"Prenotazione · 30/07/2026 — I-M… · Pilota Mob…"`. La card mostra un
sottoinsieme; lo sheet aggiunge istruttore, durata e note. Il "Tipo" del template
non è portabile: `model Booking` (`prisma/schema.prisma:1131-1154`) **non ha** un
campo tipo. Nessun `button` dentro `button`, nessun `<a>` dentro `<button>`
(misurato 0/0).

**Geometria dei target.** A 375px: righe 60px, righe avviso 55px, `see-all` 44px,
shortcut 155×44, `dispatch-flight-button` 319×44 **sotto** la sub-riga
(`subBottom 126.4` → `wrapTop 146.4`) — R-15.3-d rispettata. Nessun controllo
sotto i 44px nell'albero mobile.
Sul test "tab bar che inghiotte": a metà scroll un controllo può finire sotto la
barra fissa (vero per qualunque lista con bottom bar); **a fondo pagina nessun
controllo è intrappolato** — è ciò che `mobile-shell.spec.ts:175-200` asserisce, ed
è verde senza modifiche nel run arbitro.

**Estrazione AD-2.** `postBookingTransition`/`bookingErrorMessage`/`readBookingApiError`
sono i corpi del desktop **spostati verbatim**; `BookingsTable#transition` è un
wrapper di 10 righe e `confirmCancel` usa le stesse due funzioni. Nessuna divergenza
di messaggi. `bookings.spec.ts` (34 test) verde.

**Convenzioni.** Stringhe nuove in **entrambi** i locale (38 righe per file, `it`+`en`);
nessun literal di colore nuovo (solo `var(--…)`); nessun token esistente cambiato di
valore; nessuna dipendenza nuova; `t.raw` usato dove il segnaposto è riempito lato
client (`alerts.seeAll`); funzioni pure in `src/lib/` senza catena `@/lib/env`
(1626 unit verdi); `.split` non usato come aggancio dello switch (classe propria
`.home-desktop-surface`); `.kpi-row` resta **figlio diretto** di `.page`
(l'albero mobile è un fratello) — `mobile-primitives.spec.ts` verde senza modifiche.

**Unit delle funzioni pure.** `booking-day-phase.test.ts` copre i 4 confini
(`<start`, `=start`, dentro, `=end`, `>end`) e l'ordine di `filterInProgress`;
`overview-alerts.test.ts` copre l'ordine ratificato completo, il tie-break interno
al rank, il tetto a 5 con 40 debitori, le tre destinazioni di "Vedi tutte" e il
deep-link della voce singola. Sono le due cose che un e2e non può fabbricare, e
sono coperte davvero.

---

## 4. Ratifiche PO — stato di implementazione

| Ratifica | Implementata | Note |
|---|---|---|
| R-15.3-a "In corso ora" | ✅ | `filterInProgress` puro, zero query nuove, titolo cambiato, head `{n} in corso`. Correzione onesta del dev: la fonte è APPROVED-only. |
| R-15.3-b decisione solo nello sheet | ✅ | Card = un solo `<button>`; motivo obbligatorio nel `secondStep`; submit vuoto ⇒ 0 richieste (provato con route contata). ⚠️ ma v. **F2**. |
| R-15.3-c KPI 2×2 dove sono 4 | ✅ | Classe modificatore sulla stessa riga, guardia discriminante. |
| R-15.3-d superfici desktop nascoste + CTA | ✅ | 3 `.home-desktop-surface`, 2 shortcut (una per destinazione), CTA full-width sotto la sub-riga. ⚠️ ma v. **F1** (effetto collaterale della regola CTA). |
| R-15.3-e feed Avvisi, 3 fonti, ordine, tetto 5 | ✅ | Puro + 12 unit. ⚠️ **F5** (nessuna guardia sull'esclusività admin), **F7** (conteggio cappato). |
| R-15.3-f METAR su 3 facce, solo ≤640 | ✅ | Misurato su tutte e tre. ⚠️ **F6** (serializzazione). |
| R-15.3-g nessun delta sotto i KPI | ✅ | Nessuna prop `delta`/`trend` introdotta. |
| R-15.3-h sheet su tutte e 4 le liste | ✅ | 4 liste, 4 builder. ⚠️ **F4** (due sheet con lo stesso testid sulla faccia admin). |

---

## 5. Riepilogo per la sessione principale (commit di review-fix)

Ordine consigliato — tutti chirurgici, nessuno tocca il dominio o le API:

1. **F1** — `airops.css`: `.home-head-actions .btn` → `.home-head-actions > .btn`
   (idem per `.btn.primary`). Verifica: `.so-foot .btn` torna `flex: 0 1 auto`, 69/118px.
2. **F2** — `booking-transition.ts`/`mobile-pending-bookings.tsx`: considerare
   stantia anche `BOOKING_TRANSITION_INVALID` (chiudere lo sheet + `router.refresh()`),
   + guardia e2e sul ramo (oggi scoperto).
3. **F3** — footer "+N · Vedi tutte" sulla card "Prenotazioni in attesa" quando
   `embedPendingResult.total > righe` (riusare il pattern di `MobileAlertsCard`).
4. **F4** — testid distinti per i due sheet **o** `openId` unico per la Panoramica,
   + asserzione `[role="dialog"]` ≤ 1 dopo Tab+Enter.
5. **F5/F6/F7/F8** — tre righe di e2e per F5, due righe nel `Promise.all` per F6, un
   commento per F7, un'asserzione d'ordine in `mobile-metar.spec.ts` per F8.

Nessun file è stato modificato da questa review (per design: il reviewer non ha
Edit/Write). Gli script `probe*.tmp.mjs` usati per le misure sono stati creati nella
root e **rimossi** a fine review; gli screenshot di prova restano in `/tmp`
(`shot-editor-with-class.png`, `shot-editor-without-class.png`,
`shot-light-admin-375.png`, `shot-dark2.png`).

⚠️ **Stato del DB dopo questa review**: la suite completa + le mie fixture l'hanno
ripopolato (era fresco a inizio review). Prima del prossimo run "da arbitro" va
resettato di nuovo.

Porta **:3000 lasciata libera** (il server di produzione usato per le prove è stato
terminato; `ss -ltn` non mostra più listener).

---

# ADDENDUM — la previsione falsificabile del dev, verificata riga per riga

Il team lead ha girato la previsione del dev sui 13 rossi come **affermazione da
falsificare**. L'ho verificata sul log del run arbitro (`/tmp/airmanager-e2e/last-run.log`),
non sul racconto.

**Contatori grezzi del log** — nessuna interpretazione:
```
$ grep -acE '^\s+✓' last-run.log            -> 320      (righe di test riuscito)
$ grep -acE '^\s+(✘|✗|×|-)' last-run.log     -> 0        (righe di test fallito/skippato)
$ grep -ac 'skipped\|did not run' last-run.log -> 0
$ grep -a 'E2E_EXIT' last-run.log            -> E2E_EXIT=0
  320 passed (7.9m)
```

### Classe A — «sparisce col DB fresco» (tetto `OPTIONS_PAGE_SIZE = 100`)
**CONFERMATA. 4 su 4 verdi**, con i numeri di riga esatti che il dev aveva dichiarato:
```
✓  131 e2e/flight-log.spec.ts:289
✓  133 e2e/flight-reversal.spec.ts:161
✓  144 e2e/flights.spec.ts:483
✓  277 e2e/reports.spec.ts:206
```

### Classe B — «sparisce col reseed» (scadenza scaduta sul pilota di seed)
**CONFERMATA.** `e2e/bookings.spec.ts`: **34 test, 34 verdi**, zero rossi. I 6 rossi
della classe B non esistono più su DB fresco. (È anche la prova indipendente più
forte per la guardia di AD-2: v. claim 2 in §1.)

### Classe C — «resterebbe solo `home-dashboard:228`, fragilità preesistente»
**FALSIFICATA — ma nella direzione opposta a quella che preoccupava.** Il test
**passa**:
```
✓  155 [chromium] › e2e/home-dashboard.spec.ts:228:7 › Home dashboard — data-driven (story 12.12, AC 1)
      › a fresh PENDING booking appears in the AdminOverview…
```
E con lui tutti gli altri 5 test di quel file (136, 150, 167, 178, 193).
La previsione era **pessimistica**, non sbagliata: il dev aveva annunciato un
residuo rosso che su DB fresco non si materializza. Questo **non** riabilita
`home-dashboard:228` come test robusto — resta una fixture cercata dentro una
finestra di 8 righe, e su DB popolato è la stessa trappola "fotografia+uguaglianza"
che il dev ha dovuto togliere dai propri due test (Dev Record §10.4, TD già
tracciato). Ma la sua fragilità **non ha dovuto essere concessa**: non l'ho vista.

### Verdetto sul criterio di smentita
Il criterio proposto dal dev («un fallimento fuori dalle tre classi smentisce
l'attribuzione») e quello più severo aggiunto dal team lead («anche un fallimento
dentro A o B che il DB fresco non fa sparire») **non sono attivabili**: fallimenti
non ce n'è nessuno, dentro o fuori dalle classi. L'attribuzione «nessuna dal codice
della story» **regge alla prova più forte disponibile**.

### Fatto tecnico 1 — `mobile-metar` **NON ha skippato**: AC 5 è provato, non "non smentito"
```
✓  319 [mobile-metar] › e2e/mobile-metar.spec.ts:61:7  › at 375px the card is the only place the METAR exists…
✓  320 [mobile-metar] › e2e/mobile-metar.spec.ts:128:7 › the card is rendered on the pilota, allievo and istruttore faces too
```
Zero occorrenze di `skipped`/`did not run` nel log. Upstream raggiungibile da questo
host, verificato in modo indipendente prima del run:
`curl -s -w '%{http_code} %{time_total}' 'https://aviationweather.gov/api/data/metar?ids=LIML&format=json'`
→ `200 0.508903`. Quindi il ramo `test.skip` non è stato preso e **AC 5 è verde per
davvero**, non "non provato".

### Fatto tecnico 2 — 4 figli senza stazione: **l'osservazione del team lead è fondata, e ho misurato quanto**

Confermato il fatto: senza stazione `.overview-mobile` ha **4** figli
(`getMetar('')` degrada a `null` per contratto, e `null` non rende nulla).

```json
"noStation":   { "overview": ["mobile-overview-inprogress","mobile-overview-pending-bookings","mobile-overview-alerts","mobile-shortcuts"] }
"withStation": { "overview": ["mobile-overview-inprogress","mobile-overview-pending-bookings","mobile-overview-alerts","mobile-metar-card","mobile-shortcuts"] }
```
L'implementazione è **corretta**: con stazione configurata la card METAR è in **4ª
posizione**, esattamente l'ordine del template (64-121), e sulle due landing
`.landing-mobile` = `[lista, mobile-metar-card]`. Nessun difetto di resa.

Ma la domanda del team lead — «un test che asserisce solo i primi tre figli è
abbastanza discriminante?» — ha una risposta misurata: **no, per metà della regola**.
V. F8.

---

### 🟡 F8 — LOW — la regola d'ordine di AC 1 è guardata per 3 superfici su 5, e la posizione della card METAR **non è guardata da nessuna parte**

**File**: `e2e/mobile-overview.spec.ts:195-198` (`expect(order.slice(0, 3)).toEqual([...])`)
· `e2e/mobile-metar.spec.ts:74-81` (asserisce presenza/visibilità/conteggio, **mai** posizione).

Due cose si sommano:

1. **`mobile-overview.spec.ts` gira nel project `chromium`, dove la stazione METAR
   non è configurata** (il seed non ne ha una, e `mobile-metar` è l'ULTIMO della
   catena serializzata, quindi scrive la stazione *dopo*). Nel momento in cui quella
   asserzione d'ordine viene valutata, **la card METAR non è proprio nell'albero**:
   `order` ha 4 voci. La posizione della card non può essere guardata lì nemmeno in
   linea di principio.
2. `mobile-metar.spec.ts`, che invece la stazione ce l'ha e vede 5 figli, non
   asserisce l'ordine.

Discriminanza misurata mutando il DOM col repo intatto (stazione configurata):

| Mutazione | `order.slice(0,3)` | l'asserzione del dev |
|---|---|---|
| METAR spostata in **prima** posizione | `[mobile-metar-card, inprogress, pending]` | ❌ **diventa rossa** (bene) |
| METAR spostata **dopo** `.mobile-shortcuts` | `[inprogress, pending, alerts]` | ✅ **resta verde** (cieca) |

Cioè: la guardia intercetta una card infilata *prima* dei tre, e **non** intercetta
la card meteo che scivola in fondo alla pagina — che è l'unico modo realistico in
cui quell'ordine può rompersi (basta spostare `{metarCard}` di due righe in
`page.tsx`, sotto `.mobile-shortcuts`). Stessa lacuna per `.landing-mobile`
(`[lista, metar]`): nessun test la asserisce.

Non è un difetto di resa — l'ordine spedito è quello giusto, misurato. È una regola
di AC 1 lasciata parzialmente muta, che è ciò che AC 11 vieta.

**Fix suggerito** (una riga, nel posto dove la card esiste davvero): in
`mobile-metar.spec.ts`, dopo aver configurato la stazione,
```js
expect(await page.evaluate(() => [...document.querySelectorAll('.overview-mobile > *')]
  .map((n) => n.getAttribute('data-testid') ?? n.className)))
  .toEqual(['mobile-overview-inprogress','mobile-overview-pending-bookings','mobile-overview-alerts','mobile-metar-card','mobile-shortcuts']);
```
e l'equivalente a due voci per `.landing-mobile` sulle facce pilota/istruttore.
Prova di discriminanza già disponibile: le due mutazioni della tabella qui sopra.
