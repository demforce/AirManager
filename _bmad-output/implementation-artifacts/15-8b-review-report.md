# Review adversariale — story 15.8b (Statistiche + Impostazioni mobile)

Reviewer: subagent adversarial (Opus 5 xhigh) · data 2026-08-05 · macchina LOCALE (Fedora dell'utente)
Oggetto: commit `a3400df` (feat) + `be2ed53` (record), branch `dev`
Story: `_bmad-output/implementation-artifacts/15-8b-statistiche-impostazioni-mobile.md`

## Verdetto

**APPROVATA CON RISERVA — 1 MAJOR, 2 MINOR, 4 LOW.**

L'implementazione e' solida e il Dev Agent Record e' onesto: **ogni** numero dichiarato nel record
che ho potuto rimisurare (contrasti nei due temi, geometria desktop a 641/800/1280, testate,
ripristino DB, esito suite) e' stato **riprodotto al centesimo**. Il MAJOR non e' un errore di
misura ne' una svista di consegna: e' una deviazione (la n. 3, "cap su tutte e quattro le liste")
applicata a una lista che **non e' ordinata per la sua metrica**, con la conseguenza che sul
telefono la card "Utilizzo flotta" mostra otto righe da `0:00`.

## Esito arbitro — suite completa (VERBATIM)

DB fresco (resettato prima del run), build di produzione, `CI=1`, lanciata con `scripts/e2e.sh start`
e letta con `scripts/e2e.sh status`. Log copiato in
`/tmp/claude-1000/-home-admin-AirManager/ee712b45-2921-41fc-b3f4-238d53ae4fd0/scratchpad/arbiter-full-suite.log`.

```
  453 passed (11.1m)
=== e2e end: 2026-08-05T18:24:53+02:00 ===
E2E_EXIT=0
```

**453/453, zero failed, zero flaky, exit 0** — coincide esattamente con la dichiarazione del dev
(§12 del record). Nessuna delle flake note (billing.spec:296, flights.spec:602, login sotto
contesa, lock TD-6) si e' presentata.

`npm run gates` (rieseguito da me):

```
PASS  lint (19s)
PASS  typecheck (3s)
PASS  test (6s) — Tests  1754 passed (1754)
PASS  build (27s)
```

Stato DB dopo la suite, verificato con psql:

```
 sched.closeTime           | 23:59
 sched.maxAdvanceDays      | 3650
 sched.minSlotMinutes      | 30
 sched.openTime            | 00:00
 sched.turnaroundMinutes   | 0
 treasury.openingBankCents | 0
 treasury.openingCashCents | 0
 treasury.openingDate      | 2000-01-01
```

```
 blocco | tipo | blocking | total       cat
--------+------+----------+-------     -----
      0 |    0 |       11 |    47          0
```

Cioe': finestra permissiva ripristinata (**non** la 07:00-21:00 di `reports.spec.ts`), zero fixture
`Blocco mobile*`/`Tipo mobile*`/`Cat mobile*` sopravvissute, 11 tipi bloccanti = i 4 di seed + i 7 di
`bookings`/`flights` (TD di volume preesistente, **non aggravato**). Tutto come dichiarato.

---

## FINDINGS

### MAJOR-1 — Il cap di "Utilizzo flotta" mostra le prime 8 righe in ordine di MARCHE, non le 8 piu' usate: sul telefono la card e' otto righe da `0:00`

**File**: `src/app/[locale]/dashboard/reports/reports-console.tsx:140-142` (marcatura `.ranked-row-overflow`
per indice di DOM) in combinazione con `src/server/services/stats.service.ts:230-237`
(`fleet` costruito da `aircraftRows` che `listAircraft` ordina **per registration asc** — il commento
alla riga 230 lo dice: *"`listAircraft` already orders by registration asc"*).

**Che cosa richiede l'AC 3**: *"rendono le **prime N** righe **per la metrica selezionata**"*.
`RankBars` lo fa (ordina client-side per la metrica, `rank-bars.tsx:79`); le due liste di
`reports-console` **no**: `stats.instructors` arriva gia' ordinato per minuti decrescenti dal
server (`stats.service.ts:272`), ma **`stats.fleet` no** — e' alfabetico.

**Riproduzione** (server di produzione, admin, 375x812, DB post-suite con 144 velivoli operativi):

```
API fleet FIRST 8 (ordine server, = ordine DOM):
 [{"r":"I-AAA1785946470978-P","m":0},{"r":"I-ABCD","m":0},{"r":"I-AMSGAMU7M5GG","m":0},
  {"r":"I-BBB1785946472308-M","m":0},{"r":"I-BK1785946507478-GL","m":0},
  {"r":"I-BK1785946508563-O7","m":0},{"r":"I-BK1785946512154-AX","m":0},
  {"r":"I-BK1785946512368-M6","m":0}]

API fleet TOP 8 by minutes:
 [{"r":"I-CP1785946905336-GF","m":120},{"r":"I-PRF1785946922151-5","m":90},
  {"r":"I-RP3DI3BH","m":90},{"r":"I-FL1785946631965-2O","m":80},
  {"r":"I-BL1785946499997-DV","m":60}, ...]

DOM @375, righe VISIBILI di "Utilizzo flotta" (8 su 144):
 I-AAA1785946470978-P  0:00  barW 0%
 I-ABCD                0:00  barW 0%
 I-AMSGAMU7M5GG        0:00  barW 0%
 I-BBB1785946472308-M  0:00  barW 0%
 I-BK1785946507478-GL  0:00  barW 0%
 I-BK1785946508563-O7  0:00  barW 0%
 I-BK1785946512154-AX  0:00  barW 0%
 I-BK1785946512368-M6  0:00  barW 0%
 foot: "Prime 8 di 144  Mostra tutte (136)"

DOM @375, righe VISIBILI di "Per aeromobile" (RankBars, ordinata):
 I-CP1785946905336-GF 2:00 · I-PRF1785946922151-5 1:30 · I-RP3DI3BH 1:30 · ...
```

**Perche' e' un difetto e non una preferenza**: la card si chiama *"Utilizzo flotta · ore · anno"*.
Prima di questa story il telefono rendeva tutte e 144 le righe (card alta 9.356px, il difetto che
la story chiude): scorrendo, l'utilizzo si vedeva. Dopo, la vista di default e' informativamente
**vuota** e le due card gemelle della stessa pagina si comportano in modo opposto — una mostra
la top 8 vera, l'altra otto zeri, entrambe sotto la stessa dicitura "Prime 8 di 144", che in
questo contesto si legge come un ranking. Su un'aviosuperficie reale (10-30 velivoli) l'effetto
e' attenuato ma identico in natura: il cap sceglie 8 marche in ordine alfabetico.

**Perche' nessuna guardia l'ha visto**: `e2e/mobile-reports.spec.ts:317-375` asserisce il **numero**
di righe visibili (8), il testo del foot e l'espansione — mai **quali** righe. La deviazione 3 del
record ("il cap e' applicato a TUTTE E QUATTRO le liste... condividono componente e linguaggio")
ha esteso il cap senza verificare che tutte e quattro fossero effettivamente **ordinate**.

**Fix possibili** (decisione PO/dev, non mia): (a) marcare `.ranked-row-overflow` per **rango** e
non per indice di DOM (calcolare i top-N per minuti e nascondere gli altri — il DOM resta
alfabetico, ma le 8 visibili sono quelle giuste; l'ordine visivo resterebbe non-monotono);
(b) riordinare `fleet` per minuti desc lato client in `reports-console.tsx` (nessuno spec asserisce
l'ORDINE di `fleet`: `reports.spec.ts:263/283` legge per `registration` e per testid — verificato);
(c) non cappare la lista non ordinata. Nessuna opzione tocca il server (AD-10 salvo).

---

### MINOR-1 — "Mostra tutte" perde il fuoco su `<body>`: e' esattamente la classe 15.2 F1 / 15.8a MINOR-2, chiusa dentro lo sheet ma non qui

**File**: `src/components/charts/ranked-cap-foot.tsx:41-53` + i quattro chiamanti
(`reports-console.tsx:154-156`, `:224-231`, `rank-bars.tsx:127`): il foot e' reso solo mentre
`!expanded`, quindi il click su "Mostra tutte" **smonta il bottone che lo ha ricevuto**.

**Riproduzione** (375x812, tastiera, non mouse):

```
before: { visibleFleetRows: 8, footButton: true }
[focus su mobile-reports-fleet-cap-button] + Enter
after : { visibleFleetRows: 144, foot: 0, activeElement: "BODY/", docH: 9401 }
```

Un utente da tastiera che espande una lista da 144 righe si ritrova il fuoco su `<body>`: il Tab
successivo riparte dall'inizio del documento (una pagina alta 9.401px). Il record cita la lezione
giusta in §3h ("il fuoco segue il `secondStep` nei DUE sensi... `document.activeElement`") e la
applica dentro lo sheet delle Impostazioni, ma non alla superficie nuova delle Statistiche.
Non e' dichiarato in §8 fra i TD subiti.

**Fix**: portare il fuoco su un ancoraggio stabile all'espansione (l'ultima riga resa, o la testata
della card), oppure lasciare il bottone montato in stato "Mostra meno"/disabilitato invece di
smontarlo.

---

### MINOR-2 — Con il form di un catalogo APERTO c'e' un target da 20x20 non dichiarato, e lo sweep dell'AC 4 e' strutturalmente cieco a quello stato

**File**: `src/app/[locale]/dashboard/settings/ratings-card.tsx:588-589` (la checkbox `blocksBooking`),
`src/styles/airops.css` (blocco 15.8b: `.settings-card form input[type="checkbox"]{ width: 20px; height: 20px; }`),
guardia in `e2e/mobile-settings.spec.ts:261-265` (l'unico punto in cui `SMALL_TARGETS` gira a 320/375/390).

**Riproduzione** (375x812, admin):

```
== forms CLOSED, small targets:
   [{"tag":"BUTTON","c":"date-input-btn","h":36,"w":36}]                 <- l'unica esclusione dichiarata

== ratings form OPEN ("Aggiungi" su Abilitazioni), small targets:
   [{"tag":"BUTTON","c":"date-input-btn","h":36,"w":36},
    {"tag":"INPUT","type":"checkbox","h":20,"w":20}]                     <- NON dichiarato

== checkbox/label: { cbBox: 20x20, labelBox: 277x72.5, labelMinH: "44px" }
```

L'AC 4 chiede *"**Ogni** controllo di form e **ogni** bottone di salva e' >= 44px"* e il record
dichiara **una sola** eccezione ("**231 -> 1** target sotto 43,5 ... l'1 e' il trigger calendario
36x36, **dichiarato**"). In realta' i target sotto soglia a 375 sono **due**, e il secondo compare
solo in uno stato che la guardia non visita mai: `SMALL_TARGETS` viene valutato esclusivamente con
i due form di catalogo **chiusi** (righe 258, 264, 738 dello spec). Il test AC 9 (:674) apre il
form e non misura; il test AC 6 (:552) lo apre e non misura.

**Attenuante reale**: il `<label>` che avvolge la checkbox e' 277x72.5 con `min-height: 44px`, quindi
l'area toccabile efficace e' conforme, ed esiste il precedente `.membership-fee-override-label`
(15.7). Il difetto non e' l'ergonomia: e' che (i) l'esclusione non e' dichiarata — che e' proprio
la lezione 15.8a MINOR-1 che il record cita ("un'esclusione non dichiarata e' una guardia che
mente"), e (ii) la guardia non coprirebbe una regressione futura **dentro** i due form di catalogo
(nome/ambito/validita'/submit/annulla), che oggi passano solo per costruzione.

**Fix**: valutare `SMALL_TARGETS` anche con il form aperto (una riga in piu' nel test AC 4) e
dichiarare la checkbox come esclusione motivata, oppure portare la checkbox a 24px+ dentro il suo
box da 44 come fa il precedente citato.

---

### LOW-1 — Dichiarazione CSS morta: `align-items: center` sulla label della checkbox e' battuta dallo stile inline

**File**: `src/styles/airops.css` (blocco 15.8b) `.settings-card form label:has(> input[type="checkbox"]){ min-height: 44px; align-items: center; }`
contro `src/app/[locale]/dashboard/settings/ratings-card.tsx:588` `style={{ display: 'flex', alignItems: 'flex-start', ... }}`.

Misurato: `getComputedStyle(label).alignItems === "flex-start"`, `minHeight === "44px"`. Lo stile
inline vince, quindi la meta' `align-items` della regola non fa nulla — la stessa meccanica che il
dev ha correttamente applicato in senso opposto per `.chart-label` (§3e: "uno style inline batte
qualunque regola di classe"). Una riga cambiata che non e' riconducibile a un effetto misurabile
(karpathy: modifiche chirurgiche).

---

### LOW-2 — `inactiveLabel` e' superficie API morta, con unit test che coprono un ramo che la produzione non percorre

**File**: `src/lib/mobile-settings.ts:25,30` e `:51,56`; test `src/lib/mobile-settings.test.ts:27,31,64`.

Nessun chiamante passa `inactiveLabel`: `ratings-card.tsx:393-397` compone la sub-line con
`scopeLabel`/`validityLabel`/`blocksLabel`, `cash-categories-card.tsx:295-298` con
`movementsLabel`/`systemLabel` — lo stato disattivato vive nel `Badge`, non nella sub-line.
Verificato con `grep -rn inactiveLabel src/ e2e/`: 4 occorrenze nel modulo, 3 nei suoi test, **zero**
nei consumer. Codice speculativo secondo `karpathy-guidelines` ("niente speculativo"); il rischio
concreto e' che un unit verde faccia credere coperto un comportamento che non esiste.

---

### LOW-3 — Il ramo `/dashboard/reports` della guardia di vicinato 15.7 non asserisce piu' NESSUNA altezza

**File**: `e2e/mobile-expiries-movements.spec.ts:1285-1291` (deviazione 10 del record).

Confronto riga per riga, com'e' stato chiesto:

| prima (15.7) | dopo (15.8b) |
|---|---|
| `expect(segmented.btnMinHeight).not.toBe('44px')` | — (solo per bookings/expiries) |
| `expect(segmented.h).toBeGreaterThan(20)` | — |
| `expect(segmented.btnH).toBeLessThan(43.5)` | — |
| — | `expect(segmented.cls).toMatch(/\breports-(period\|rank-metrics)\b/)` |

La motivazione del dev regge sul punto che conta: una regola scritta su `.segmented` verrebbe
comunque catturata dalle **altre due** pagine, e l'ho verificato dal vivo — a 375px i figli di
`.segmented` misurano ancora **27,39** su `/dashboard/bookings` (e 0, perche' nascosti, su
`/dashboard/expiries` e `/dashboard`). Quindi la copertura contro il difetto per cui la guardia
esiste **non** e' persa.

Resta pero' che sull'unica pagina dove il pavimento esiste l'asserzione nuova e' **tautologica**:
le due classi sono nel markup incondizionatamente (`page.tsx:115`, `rank-bars.tsx:88`), quindi
l'assert non puo' fallire per nessuna regressione immaginabile. Una asserzione sul **requisito**
(`btnH >= 43.5` sul ramo reports) l'avrebbe resa discriminante nei due sensi, com'e' la regola
dell'epic. Non e' un indebolimento di copertura: e' un'asserzione che non discrimina piu' nulla.

---

### LOW-4 — La convenzione "catena serializzata" in CLAUDE.md e' ora piu' stale di prima

**File**: `CLAUDE.md`, voce *"e2e, stato globale"* — enumera come membri della catena
`settings.spec.ts`, `booking-window.spec.ts`, `treasury-settings.spec.ts`. La catena ha oggi
**nove** project (verificato con `--list`, sotto), e questa story ha spostato dentro proprio lo
spec che per due epic e' stato il **contro-esempio** citato ovunque (`reports.spec.ts`: scriveva
`sched.*` da un project `fullyParallel`), piu' `mobile-settings.spec.ts`. La regola resta vera,
l'elenco no. La regola di manutenzione di CLAUDE.md ("se un fatto risulta sbagliato/stale,
correggerlo SUBITO nello stesso commit") vale anche per un elenco che il lettore prende per
completo — e la 15.8b e' esattamente il commit in cui il fatto e' cambiato.

---

## Verifiche superate (evidenza)

### 1. CRUD ExpiryType dal telefono, dal vivo — riprodotto DA ME, non letto nell'e2e

375x812, admin, server di produzione. Sequenza completa creazione -> 422 -> PATCH -> 409 -> DELETE:

```
CREATE  201  body {"name":"REV Blocco …","scope":"PILOTS","blocksBooking":true,"validityMonths":null,"kind":"RATING"}
card    "REV Blocco … | Piloti · senza scadenza · Blocca prenotazioni | Attivo"
        aria-label "Apri dettaglio: REV Blocco …"
FLIGHT  422  {"error":{"code":"FLIGHT_BLOCKED_BY_EXPIRY", … details.documents contiene "REV Blocco …"}}
PATCH   200  body {"name":"…","scope":"PILOTS","blocksBooking":false,"validityMonths":null}   <- NIENTE `kind`
PATCH2  200  body {… "blocksBooking":true …}   -> volo di nuovo 422 FLIGHT_BLOCKED_BY_EXPIRY
expiry  201  (tipo messo IN USO)
secondStep DOM {"sheets":1,"kv":0,"active":"rating-delete-confirm-mobile"}
DELETE  409  toast: ["Questo tipo è in uso: disattivalo invece di eliminarlo."]  sheet chiuso
```

- `kind` inviato **solo** in creazione, `validityMonths` `null` per 0: confermato leggendo il body
  della richiesta, non un testo in pagina.
- Il 422 `FLIGHT_BLOCKED_BY_EXPIRY` da un tipo creato **dal telefono** e' reale, e il legame
  `blocksBooking` -> guardia 14.4 regge **nei due sensi** dopo un PATCH che toglie e rimette il flag.
- `secondStep`: un solo `.mobile-sheet` nel DOM, zero `.bottom-sheet-kv`, fuoco sul "Si'".
- 409 distinto dal generico, annunciato a toast (canale unico: nessun doppio annuncio).
- Categorie di sistema: "Elimina" **assente** (`cash-category-delete-button-mobile` count 0 sullo
  sheet di "Ricariche") — coperto dall'e2e e confermato nel codice (`cash-categories-card.tsx:348`).

**Race di due DELETE concorrenti** (nessun 500):

```
RACE expiry-type delete:   204  404
RACE cash-category delete: 200  404
```

### 2. La catena riorganizzata (Q13 / R-15.8b-f)

- **Posizione motivata**: `playwright.config.ts:64-88` — `reports` fra `booking-window` (che
  **possiede** `sched.*`) e `treasury-settings`; la motivazione e' scritta nel config, non solo nel
  record.
- **`--no-deps` di OGNI project della catena** (verificato, non dedotto):

```
settings                   Total: 7 tests in 1 file
booking-window             Total: 4 tests in 1 file
reports                    Total: 5 tests in 1 file
treasury-settings          Total: 3 tests in 1 file
billing-global             Total: 2 tests in 1 file
mobile-metar               Total: 2 tests in 1 file
mobile-overview-overflow   Total: 1 test in 1 file
mobile-membership-fee      Total: 2 tests in 1 file
mobile-settings            Total: 12 tests in 1 file
```
  (7+4+5+3+2+2+1+2+12 = **38** in catena; 453 - 38 = 415 in `chromium`.)

- **Run reale `--no-deps`** del project nuovo, su build di produzione:
  `E2E_REUSE_SERVER=1 scripts/e2e.sh start --project=reports --no-deps` -> `5 passed (6.2s)`,
  `E2E_EXIT=0`.
- **Ripristino REALE**, riletto in psql **dopo** quel run (che scrive 07:00-21:00):
  `sched.* = 00:00 / 23:59 / 30 / 0 / 3650`. Non e' un `expect` che si autoconferma: e' il DB.
- **Time-dependency chiusa**: `grep -rn "settings/scheduling" e2e/*.ts` restituisce scrittori solo
  in `booking-window`, `settings`, `reports`, `mobile-settings` — **tutti e quattro in catena**.
  Nessuno scrittore resta nel project `fullyParallel` dove girano le fixture "oggi" di
  `mobile-planning`.
- **Delta di durata**: il dev dichiara ~43s aggiunti alla coda serializzata (5,2s + 37,4s misurati
  in isolamento). Il mio run completo ha chiuso in **11,1m** contro i **12,2m** del dev: il delta
  dichiarato e' dello stesso ordine del rumore fra due macchine/DB, quindi **non falsificabile** ma
  coerente; il costo di catena in se' e' verificato dal fatto che `reports` (5 test) gira ora
  serializzato.

### 3. Il cap client-side (deviazione 3 / punto (a) del dev)

- Righe oltre il cap: `display: none` computato (**non** `visibility`), quindi **fuori** dall'albero
  di accessibilita' e dal find-in-page. Misurato: `{"id":"reports-fleet-row-…","d":"none","vis":"visible"}`
  — `visibility` resta `visible` ma `display:none` prevale sull'esposizione.
- Espansione **da tastiera**: focus sul bottone + Enter -> 8 -> 144 righe visibili, foot rimosso.
  (Il fuoco perso e' il MINOR-1.)
- A **1280**: 144 righe su 144 **visibili**, `capFeet: ["none","none","none"]`. `reports.spec.ts`
  (che legge i testid composti page-level a 1280) e' verde in catena.
- **Il conteggio del foot dice il vero su un DB con N diverso** dal DB del dev:
  `"Prime 8 di 144 · Mostra tutte (136)"` (144 velivoli), `"Prime 8 di 10 · Mostra tutte (2)"`
  (top piloti), e **nessun foot** sulla lista istruttori (5 righe <= 8) — il caso di confine
  `capped === false` di `rankedCap` e' esercitato dal vivo.
- `docH` @375 su `/dashboard/reports`: **3.588-3.612** su 144 velivoli (il dev dichiarava 3.726 su
  145): coerente.

### 4. I contrasti token-level (Q12) — TUTTI riprodotti al centesimo, nei due temi e alle due larghezze

Metodo replicato (canvas->WCAG, sfondo risolto risalendo gli antenati, alpha letta prima della
composizione, nodi senza `getClientRects()` esclusi), cookie `am-theme`.

| esemplare | chiaro (misurato da me) | scuro | dichiarato dal dev |
|---|---|---|---|
| `.util-bar .seg.flown` | **4,56** | **12,36** | 4,56 / 12,36 |
| barra `RankBars` metrica 1 (`.flow-bar-in`) | **4,56** | **12,36** | 4,56 / 12,36 |
| barra `RankBars` metrica 2 (`.flow-bar-accent`) | **3,63** | **12,95** | 3,63 / 12,95 |
| fascia mix SCUOLA (`.flow-bar-in`) | **5,04** | **11,01** | 5,04 / 11,01 |
| fascia mix TURISMO (`.flow-bar-accent`) | **4,01** | **11,53** | 4,01 / 11,53 |
| fascia mix LAVORO AEREO (`.flow-bar-muted`) | **7,85** | **7,92** | 7,85 / 7,92 |
| fascia mix TRANSITI (`.flow-bar-info`) | **6,26** | **9,76** | 6,26 / 9,76 |
| `.chart-label` (testo, soglia 4,5) | **4,85** | **5,72** | 4,85 / 5,72 |
| `.util-value` | 9,99 | 9,47 | invariato |

**Gemelli** (la parte che la lezione 15.3 impone e che ho rifatto io):

| gemello | chiaro | scuro |
|---|---|---|
| `/dashboard/billing` `.flow-bar-in` / `-out` (15.8a) | **4,56** / **6,10** | **12,36** / **9,87** |
| `.stat-tone-ok` / `-bad` su billing | 10,63 / 9,82 | 9,3 / 6,61 |
| `.so-sub` (altro consumer di `--ink-4`) | **3,66** | **4,14** — *invariato: il token non e' stato toccato* |

**Meccanica di specificita' della §10 della 15.8a rispettata**: il fix non aggiunge un secondo
selettore concorrente, elenca `.util-bar .seg.flown` **dentro** la regola `.flow-bar-in`
(`airops.css:774-775`) e toglie il `background` da `.util-bar .seg.flown` (`:915-916`) — la seconda
delle due opzioni che la 15.8a offriva. I valori della 15.8a su `/dashboard/billing` sono
**identici** ai suoi: la regola ha guadagnato un selettore, non un valore.

**Nessuna superficie fuori perimetro tocca le classi nuove** (verificato a 375):

```
/it/dashboard          chartLabel 0  utilBar 0  segFlown 0  flowBars 0  settingsCard 0  rankedRows 0
/it/dashboard/fleet    …0…
/it/dashboard/bookings …0…
/it/dashboard/expiries …0…
/it/dashboard/billing  flowBars 34   (la superficie 15.8a, misurata sopra: identica)
```

### 5. Le deviazioni

- **Dev. 1 (`.page-head` +12,61px)**: misurata **117,44** a 375 (pre 104,83), **51,44** a 641/800/1280.
  Il prezzo aritmetico dei 44px e' reale e la contropartita (documento da ~21.9k a ~3,6k) pure.
- **Dev. 2 (Impostazioni +612px)**: le **sette** testate a 375 misurano oggi
  `79,17 / 79,17 / 129,17 / 63,23 / 113,23 / 113,23 / 145,11` contro il pre-fix dichiarato
  `89,17 / 89,17 / 132,02 / 73,23 / 116,08 / 116,08 / 147,95`: **tutte e sette sotto il pre-fix**,
  in un contesto browser diverso da quello del dev (il che rafforza, non indebolisce, il TD (k)).
  `docH` 8.861 @320 / 8.738 @375 / 8.698 @390 su un DB piu' carico del suo: il tradeoff regge.
- **Dev. 3 (cap su tutte e quattro)**: **e' l'origine del MAJOR-1** — v. sopra.
- **Dev. 10 (guardie di vicinato)**: v. LOW-3; copertura sostanzialmente invariata, asserzione
  reports tautologica.
- Dev. 4/5/6/7/8/9: verificate sul codice e coerenti; la 7 (Tesoreria mai scritta) e' confermata
  dal DB (`treasury.*` = 0/0/2000-01-01 dopo l'intera suite).

### 6. Guardie rimesse alla prova

- **Sweep degli scroller con l'esclusione INPUT/TEXTAREA**: onesta e riproducibile. A 375 l'unico
  scroller e' `club-contact-email-input` (`cw 275 / sw 302`); a 320 sono tre
  (`airfield-name-input` 262 in 220, `club-contact-email-input` 302 in 220, `smtp-from-input` 236
  in 220). E **a 641px, dove nessuna regola di questa story vive, gli stessi tre sfondano**
  (`231 / 262-302-236`) — la prova che l'esclusione e' il TD (e) preesistente e non una comodita':

```
inputs scrolling own value @641  [airfield-name-input 231/262, club-contact-email-input 231/302, smtp-from-input 231/236]
inputs scrolling own value @1280 []
```

- **Contenimento**: iniettando nella card un nome da 122 caratteri e una sub-line da 91 a **320px**,
  `CHILDREN_OUT_OF_CARD` resta `[]`, `text-overflow: ellipsis` presente su nome e sub
  (`nameSw 778 / nameCw 154`), `pageOverflow 0`. La guardia sul rect non e' cieca.
- **Testate font-dipendenti (TD (k))**: confermato dal vivo — le stesse testate misurano
  113,23 sotto `playwright-core` e 129,17 sotto il contesto della suite; il confronto PRE/POST
  nella stessa pagina e' la scelta giusta.

### 7. Desktop invariato

```
reports  @641  app "64px 577px"   pageHead 51.44  svg [483,483,483]        fleetVisible 144/144  capFeet none  tabbar none  overflow 0
reports  @800  app "64px 736px"   pageHead 51.44  svg [642,642,642]        fleetVisible 144/144  capFeet none  tabbar none  overflow 0
reports  @1280 app "232px 1048px" pageHead 51.44  svg [612.66,287.34,612.66] fleetVisible 144/144 capFeet none tabbar none  overflow 0
settings @641  formGrid "232.5px 232.5px"  desktopBodies flex×3  mobileBodies none×3  overflow 0
settings @1280 formGrid "468px 468px"      desktopBodies flex×3  mobileBodies none×3  overflow 0
```

`.segmented > *` a 641/800/1280 misura **27,39** (invariato: il pavimento e' solo dentro la media
query). Le altezze di card a 1280 combaciano con le baseline dell'AC 12 dove i dati non sono
cambiati (club **807,84** vs 807,8 · SMTP **385,17** vs 385,2 · tesoreria **296,56** vs 296,6 ·
mediche **398,47** vs 398,5 · pianificazione **396,92** vs 396,9); ratings e categorie divergono
perche' il DB ha piu' righe (dipendenza dai dati, non regressione).
La **Panoramica** non usa ne' i grafici ne' `.util-*` ne' `.flow-bar-*` (misurato sopra): nessun
gemello nascosto li'.

### 8. Multi-attore

Matrice RBAC reale (API + UI, `clearCookies()` fra un'identita' e l'altra, due larghezze):

```
admin      stats 200  expiry-types 200  cash-categories 200  POST expiry-type 201  PUT sched 200
           reports@375 /it/dashboard/reports   settings@375 /it/dashboard/settings   (idem @1280)
pilot      stats 403  expiry-types 403  cash-categories 403  POST 403  PUT sched 403
           reports@375 /it/dashboard  settings@375 /it/dashboard  (idem @1280)
instructor idem pilot
student    idem pilot
```

`GET /settings/scheduling` risponde 200 a tutti — preesistente e necessario alla UI di prenotazione,
non una regressione di questa story. L'attore "multi-ruolo" con `finance.manage` senza
`settings.manage` **non e' costruibile** post-14.9 (dichiarato dal dev, deviazione 6): confermato
sul registry (`route-registry.ts:125` `ADMIN_ROLES`, `:129` `['ADMIN']`).

### 9. Consegna

- **i18n**: 1950 chiavi in `it.json`, 1950 in `en.json`, **zero** orfane in entrambe le direzioni.
- `"{count} movimenti"` non e' pluralizzato, ma e' il pattern gia' in uso nel file
  (`it.json:1577 "agendaCount": "{count} movimenti"`): non e' un finding.
- **sprint-status.yaml / HANDOFF** non aggiornati: **atteso** (spettano al commit `docs(15.8b)` di
  chiusura della sessione principale).
- **TD (j)(k)(l)** del record: verificati e accurati — (j) il pavimento `.settings-card .btn`
  raggiunge davvero i `.btn.mini` della tabella nascosta (ed e' il motivo per cui la guardia (i) non
  conta i target); (k) riprodotto (v. sopra); (l) coerente con le mie misure a 390/EN.
- **CLAUDE.md**: v. LOW-4.
- Nessuna dipendenza npm nuova, nessun token cambia valore, nessun literal di colore nuovo
  (`color-mix` sui token): verificato sul diff di `airops.css`.

---

## Stato lasciato dalla review

- **Suite**: `453 passed`, `E2E_EXIT=0`. Log dell'arbitro copiato in
  `…/scratchpad/arbiter-full-suite.log` (il `last-run.log` corrente contiene il run mirato
  `--project=reports --no-deps`, anch'esso exit 0).
- **DB**: `sched.*` permissivo (00:00/23:59/30/0/3650), `treasury.*` 0/0/2000-01-01 — **come lasciati
  dalla suite**. Fixture della review ripulite: tipo `REV Blocco …` e scadenza associata cancellati
  (204/204), tipi `REV Race …` e categoria `REV Race cat …` consumati dal test di race,
  aeromobile `I-RV4X8MM` archiviato. **Residuo dichiarato**: una `Person` "RevBloccato Probe-…" con
  profilo pilota (nessuna API di cancellazione persona) — stessa classe di residuo che ogni run e2e
  lascia; nessun tipo bloccante aggiunto (i bloccanti restano **11**, come dopo la suite).
- **Porta 3000**: server di produzione **fermato** a fine review.
- Script di probe: solo nello scratchpad di sessione, **non** committati.

## Decisioni da sottoporre al PO

1. **MAJOR-1** — Il cap sulla lista "Utilizzo flotta" (non ordinata) mostra otto velivoli scelti in
   ordine alfabetico, quasi sempre a `0:00`. Va scelto fra: (a) nascondere per **rango** invece che
   per posizione, (b) riordinare la lista per minuti decrescenti sul client (cambia anche il
   desktop: nessuno spec asserisce quell'ordine), (c) togliere il cap dalla sola lista non
   ordinata. Nessuna opzione tocca il server.
2. **MINOR-2** — Se il PO ritiene sufficiente il target efficace del `<label>` da 44px, la checkbox
   `blocksBooking` va comunque **dichiarata** come seconda esclusione dello sweep e la guardia va
   estesa allo stato "form aperto"; altrimenti va portata a >= 24px dentro il box da 44.
