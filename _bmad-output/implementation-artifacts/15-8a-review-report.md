# Review adversarial — story 15.8a (Contabilità mobile + redesign `ExportMenu`)

- **Reviewer**: adversarial subagent (Opus 5 xhigh), 2026-08-05, macchina LOCALE (Fedora dell'utente).
- **Oggetto**: commit `0e5d6cb` (feat) + `ca5e08d` (Dev Agent Record), branch `dev`.
- **Story file**: `_bmad-output/implementation-artifacts/15-8a-contabilita-exportmenu-mobile.md` (letto per intero: ratifiche R-15.8a-a..j, AC 1-15, appendice, Dev Agent Record).
- **Verdetto**: **SHIPPABLE WITH FIXES** — 0 major, 3 minor, 4 low, 3 osservazioni. Nessun difetto di dominio: la definizione di ricavo, la prospettiva club, il gate sul COUNT del secchiello e il desktop sono verificati **INTATTI dal vivo**, non per lettura.

---

## 0. Esito arbitro — suite completa `CI=1`, build di produzione, DB fresco

Lanciata **per prima cosa** con `scripts/e2e.sh start`, letta solo con `scripts/e2e.sh status` (mai rieseguita).
Log integrale copiato in `/tmp/claude-1000/-home-admin-AirManager/ee712b45-2921-41fc-b3f4-238d53ae4fd0/scratchpad/review-158a-arbiter-full.log`.

```
state: DONE — E2E_EXIT=0
--- summary ---
  1 flaky
  430 passed (10.6m)

  1) [chromium] › e2e/billing.spec.ts:296:7 › Tre riquadri con numeri veri da scenario seminato (story Billing-2, AC 6)
     › ricarica + volo + payout, tutti dated today, move Risultato/Liquidità/Acconti by EXACTLY the expected deltas
     Error: expect(received).toBe(expected)
     Expected: 10000   Received: 5000
       at e2e/billing.spec.ts:341:54   (depositsTotalAfter - depositsTotalBefore)

  1 flaky
    [chromium] › e2e/billing.spec.ts:296:7 › …
  430 passed (10.6m)
=== e2e end: 2026-08-05T11:06:48+02:00 ===
E2E_EXIT=0
```

- **430 passed + 1 flaky = 431 test**, esattamente i **405** della baseline 15.7 più i **26** nuovi di `mobile-billing.spec.ts`.
- **Tutti e 26** i test di `mobile-billing.spec.ts` sono GIRATI, **zero skip** (verificato: `grep -c "mobile-billing.spec.ts" = 26`, nessuna riga `skipped`). I due `test.skip` guardati sul secchiello non sono scattati: su DB fresco entrambe le fixture di seed c'erano, e `billing-global.spec.ts:86` ha consumato **la sua** restando verde.
- Il flaky **non è quello dichiarato dal dev** (loro: `flights.spec.ts:602`). È `billing.spec.ts:296`, il delta-assert su un aggregato **globale** (`deposits.totalCents`) — **TD (j) già registrato** dalla story stessa e già flaky nell'arbitro 15.7. Passa al retry. V. **MINOR-3**: la story vietava esplicitamente di aggravarlo, e il nuovo spec crea denaro nel project `fullyParallel`.

**`npm run gates`**: `PASS lint (20s) / PASS typecheck (3s) / PASS test (6s) — 1739 passed / PASS build (27s)`.
**Unit senza env** (regola CLAUDE.md): `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/lib/mobile-billing.test.ts` → `15 passed`, nessun `@/lib/env` trascinato.

---

## 1. Findings

### MINOR-1 — I 61 link di "Saldi negativi" restano target da 18,13px, e la guardia che doveva vederli li esclude senza dichiararlo

**Dove**: `src/styles/airops.css:3253-3255` (`.billing-negative-row{min-height:44px}` + `.billing-negative-row > a{…ellissi…}`, nessun `min-height` sull'ancora) · guardia: `e2e/mobile-billing.spec.ts:190` (`if (el.closest('.billing-negative-list')) continue;`).

**AC violato**: AC 6 — «"Saldi negativi" … conserva il suo scroller ma con un'altezza sensata su mobile e **i suoi link ≥44px** non coperti dalla tab bar».

**Misura (mia, indipendente, build di produzione)**:

```
=== @320 small targets: 61  {"A h=18.13": 61}
=== @375 small targets: 61  {"A h=18.13": 61}
=== @390 small targets: 61  {"A h=18.13": 61}
negRows (altezza della riga): [44, 44, 44, 44]
negLinks (altezza dell'ANCORA):  [{"h":18.13,"w":147.42}, {"h":18.13,"w":158.61}, {"h":18.13,"w":150.47}, {"h":18.13,"w":139.38}]
```

Sono gli **unici** controlli sotto i 44px rimasti sulla pagina: il mio sweep, identico a `SMALL_TARGETS` **senza** l'esclusione della riga 190, ne trova 61 e nient'altro. La riga è alta 44px, ma il bersaglio tappabile è l'`<a>`: 13px sopra e 13px sotto sono spazio morto. È lo stesso idioma che il dev **ha già applicato** al link "Vedi tutte le persone" della stessa card (`airops.css:3256-3257`: `display:inline-flex; align-items:center; min-height:44px`) — semplicemente non è stato esteso alle righe.

**Perché è un finding e non un dettaglio**: (i) l'esclusione **non è dichiarata** nel doc-comment della funzione (`e2e/mobile-billing.spec.ts:181`: «*excluding the closed `SlideOver` and the `display: none` desktop tree*» — la terza esclusione non c'è); (ii) il record §2 AC 6 scrive «righe 44px, link ellissato», che è vero ma non è quello che l'AC chiede; (iii) AC 12 impone che una regola non proteggibile sia **detta**, mai lasciata muta.

**Riproduzione**: `node /tmp/…/scratchpad/rev-A-targets.mjs` (probe salvato in `rev-A-targets.json`).

**Fix suggerito**: `.billing-negative-row > a{ display:inline-flex; align-items:center; min-height:44px; }` dentro la media query (una riga, stesso idioma del link della testata), e **togliere** l'esclusione della riga 190 dallo sweep — che a quel punto resta verde e diventa discriminante anche qui.

---

### MINOR-2 — Uscendo da un `secondStep` su una riga CASH il focus cade su `<body>`: il fix di review 15.2 F1 copre solo il ramo ACCOUNT

**Dove**: `src/app/[locale]/dashboard/billing/billing-console.tsx:543-547` (l'effetto) + `:1380` (`ref={sheetPrimaryRef}` presente **solo** sul bottone "Rettifica", ramo `ACCOUNT`). I bottoni `transaction-reclassify-action-mobile` (`:1393`) e `transaction-reverse-action-mobile` (`:1408`) non hanno alcun ref.

Il commento del codice dichiara esattamente il difetto che resta aperto:

```
Review 15.2 F1: entering a second step removes the very button that was
pressed, and `document.activeElement` falls back to `<body>` — the dialog
context is lost for assistive technology even though the node survives.
```

`sheetPrimaryRef.current` è `null` su ogni riga CASH ⇒ `else sheetPrimaryRef.current?.focus()` è un **no-op**, e il focus resta dove il bottone "Indietro" è appena stato smontato.

**Misura (mia, dal vivo a 375px)**:

```
FOCUS CASH row:    open= DIV[dialog]  inStep= TEXTAREA[transaction-reverse-reason-mobile]  afterBack= BODY[]
FOCUS ACCOUNT row: inStep= transaction-adjust-amount-mobile                                 afterBack= transaction-adjust-action-mobile
```

**AC toccato**: AC 3 («focus al primo campo entrando, **ritorno al bottone uscendo**») — rispettato su ACCOUNT, non su CASH (storno **e** riclassifica, cioè 2 delle 3 scritture della story).

**Riproduzione**: `node /tmp/…/scratchpad/rev-D-writes.mjs` (blocco 4) e `rev-E-misc.mjs` (blocco D).

**Fix suggerito**: un solo ref per il bottone che ha aperto lo step (o tre ref, o `data-testid` + query nel `useEffect`); il pattern minimo è mettere `ref={sheetPrimaryRef}` sul primo bottone reso, qualunque sia il ramo.

---

### MINOR-3 — TD (j) dichiarato "non aggravato": il nuovo spec crea denaro nel project `fullyParallel`, che è la metà del TD che la story vietava di toccare

**Dove**: `e2e/mobile-billing.spec.ts` (project `chromium`, `fullyParallel`) — per run crea **4 ricariche** (`recordTopUp` 15.000 + 9.000 + 12.000 + 20.000 = **56.000 cent** di saldi conto positivi nuovi), **~28 movimenti di cassa** (`:221` 4.200, `:299` 3.300, `:364` 5.000, `:466` 7.700, `:631` 6.100, `:715` 21× (100+i), `:817` 8.800, `:847` 121.622, `:893` 4.400, `:922` 5.500), **1 rettifica** (−2.500) e **1 storno**.

**Cosa dice la story** (AC 15 j): «`billing.spec.ts:296` delta-assert su un aggregato globale, flaky nell'arbitro 15.7 — TD già registrato, e questa story tocca la stessa pagina: **non aggravarlo (nessun test nuovo che crei denaro fuori dalla catena)**».

**Cosa dice il record** (§8, TD (j)): «**non aggravato**: nessun test nuovo asserisce un aggregato globale con uguaglianza». È vero — ma risponde solo alla **metà delle asserzioni**. La metà delle **scritture** è disattesa: le ricariche muovono `deposits.totalCents`, che è esattamente l'aggregato che `billing.spec.ts:341` confronta con uguaglianza.

**Evidenza**: nell'arbitro di questa review il flaky è caduto **proprio lì** (`depositsTotalAfter - depositsTotalBefore` = 5.000 invece di 10.000). **Onestà**: la causalità **non è provata** — quel test è documentato come flaky 2/2 già in `billing.spec.ts:290-292`, ha flakato nell'arbitro 15.7 (prima di questa story) e il delta mancante (−5.000) non corrisponde a nessuna fixture di `mobile-billing.spec.ts`. Il finding è sulla **dichiarazione**, non sulla causa: il record afferma "non aggravato" su una base che copre metà del requisito.

**Fix suggerito**: correggere la riga del record (dichiarare le scritture e il rischio residuo), oppure spostare i due test che creano ricariche (`:437` rettifica, `:253` prospettiva club) fuori dal `fullyParallel`. La seconda opzione costa un project serializzato in più e non la raccomando: la dichiarazione onesta basta, il TD è già registrato.

---

### LOW-1 — Il popover desktop dell'`ExportMenu` è geometricamente identico ma **comportamentalmente** nuovo, e il record non lo dichiara

**Dove**: `src/components/ui/export-menu.tsx:52-59` (passa il telaio `MobileSheet` a ogni larghezza) + `src/components/ui/mobile-sheet.tsx:89-121`.

A >640px il menu **ora**: (i) è un `role="dialog"` con `aria-label="Esporta"`; (ii) **prende il focus** all'apertura (prima restava sul trigger); (iii) si chiude con **Escape** (prima no); (iv) entra nel registro globale "un solo sheet alla volta" (`mobile-sheet.tsx:55`), quindi può **chiudere** un altro sheet aperto.

**Misura mia @1280** (`rev-C2-anchor.mjs`):

```
/it/dashboard/expiries {"triggerRight":582.91,"wrapperRight":582.91,"panelRight":582.91,"panelTop":381.28,"wrapperBottom":375.28,"delta":6,"activeRole":"dialog","activeIsPanel":true}
/it/dashboard/logbook  {"triggerRight":502.91,"wrapperRight":502.91,"panelRight":502.91,"delta":6,"activeRole":"dialog","activeIsPanel":true}
/it/dashboard/billing  {"triggerRight":582.91,"wrapperRight":582.91,"panelRight":582.91,"delta":6,"activeRole":"dialog","activeIsPanel":true}
```

L'ancoraggio è **esattamente** quello di prima (`panelRight == triggerRight`, 6px sotto il wrapper) ⇒ la parte geometrica di AC 8 regge. Ma `activeIsPanel: true` è un cambiamento di comportamento su **dieci** superfici desktop, e il record (§3a, §7 dev.3) descrive solo il telaio CSS e il `preventScroll`. Il `MobileSheet` non ha focus trap né `aria-modal` (dichiarato, 15.10): spostare il focus dentro un dialog non modale su desktop è una scelta, non un no-op.

**Nota**: è probabilmente un **miglioramento** (Escape chiude, il focus segue il menu). Non chiedo di annullarlo — chiedo che sia **dichiarato** nel record accanto a "popover desktop identico", perché non lo è.

---

### LOW-2 — La guardia (vii-bis) è dichiarata "non implementabile": non lo è, e l'ho scritta in tre righe

**Dove**: record §6 riga vii-bis + §3e. Il dev descrive il metodo esatto («iniettare un `<p data-testid="billing-adjust-feedback">` nella testata a 375 e verificare che resti `display:none`») e poi non lo implementa, motivando che sarebbe «una guardia su uno stato che il codice non può produrre».

Ma è **la stessa tecnica** che l'AC 12 (vii) prescrive per l'empty state (`node.parentElement.appendChild(node.cloneNode(true))`, metodo review 15.6 LOW-3) e che il dev **ha** usato lì. Iniettare un nodo che il flusso non produce è precisamente lo scopo dell'iniezione DOM.

**Prova che funziona** (`rev-H-feedback.mjs`):

```
@375  headBefore=175      injected= {"display":"none","headH":175}
@1280 headBefore=109.23   injected= {"display":"block","headH":109.23}
```

La regola `.billing-head > .billing-feedback{display:none}` **funziona** e **non fa crescere la testata** (175 → 175). Manca solo l'asserzione che la protegge da una futura rimozione.

**Fix suggerito**: tre righe in `mobile-billing.spec.ts` dentro il test AC 12, sulla falsariga del blocco (vii).

---

### LOW-3 — La coppia `.flow-bar-*` non è riusabile dalla 15.8b come la §10 promette (specificità), e non vive dove la sua gemella vive

**Dove**: `src/styles/airops.css:3062-3063` (`.flow-bar-in`/`.flow-bar-out`, dentro il blocco della story 15.8a, fuori dalla media query) vs `src/styles/airops.css:874` (`.util-bar .seg.flown{ background: var(--ok); }`).

**Il fatto**: `.util-bar .seg.flown` ha specificità **(0,3,0)**; `.flow-bar-in` ha **(0,1,0)**. Aggiungere la classe al `<div class="seg flown">` della 15.8b **non cambierebbe nulla**: vince la regola esistente. La nota di tensione §10 dice «la 15.8b **riusa quelle due classi** su `.util-bar .seg`» — non è vero alla lettera: servirà `.util-bar .seg.flow-bar-in{…}` (o togliere la dichiarazione di `.seg.flown`).

**Secondo punto, di collocazione**: `.flow-bar-*` è un fix di contrasto **token-level valido a ogni larghezza**, gemello dichiarato di `.stat-tone-ok/-bad` (`airops.css:733-738`). Sta però nel blocco *"contabilità mobile + export menu (story 15.8a)"* in coda al file. Chi cercherà la medicina per un oggetto grafico la cercherà accanto a `.stat-tone-*`, non in un blocco mobile per-story.

**Giudizio richiesto dalla review** (il nome e la collocazione reggono il riuso?): **il NOME sì** — `flow-bar-in/-out` nomina la forma, non la pagina, ed è la scelta giusta; **la COLLOCAZIONE no**, e la promessa di riuso è **imprecisa sulla meccanica CSS**. Da correggere nella §10 (o spostando le due regole accanto a `.stat-tone-*` in questo stesso review-fix, che è un movimento a costo zero e senza cambio di valore).

**Valore misurato del fix** (mio, indipendente, cookie `am-theme`, `getClientRects().length > 0`):

```
light: flow-bar-in 4.56  flow-bar-out 6.10     (pre-fix 2.47 / 3.59, soglia 3.0)
dark : flow-bar-in 12.36 flow-bar-out 9.87     (pre-fix 10.45 / 7.42)
```

---

### LOW-4 — I due trigger del calendario restano 36×36 dove l'AC 5 li nomina esplicitamente fra i "≥44px", e lo sweep non li vede mai

**Dove**: `src/styles/airops.css:3229` (`.billing-filter-panel .date-input-btn{36×36}`) e `:3266` (`.transaction-form .date-input-btn{36×36}`).

**Misura mia @375**: `filter panel @375 {"billing-filter-date-from-mobile":44, "billing-filter-date-to-mobile":44, "billing-filter-category-mobile":44, "mobile-billing-filters-apply":44, "billing-filter-reset-mobile":44, "calBtn":[36,36]}`.

**Attenuanti reali**: (i) il dev lo **dichiara** (deviazione 5, TD (b)); (ii) esiste un **precedente vivo e già passato in review**: `.movements-filter-panel .date-input-btn{ width:36px; height:36px }` (`airops.css:2928`, story 15.7); (iii) 24×24 → 36×36 è comunque un miglioramento.

**Il problema residuo è la guardia**: `SMALL_TARGETS` include `.slideover.open button`, ma nel test AC 5 lo sweep gira **solo con i pannelli chiusi** (`e2e/mobile-billing.spec.ts:623-625`) — quindi i 36px non sarebbero visti nemmeno se domani diventassero 20. Uno sweep con il pannello Filtri aperto (e l'editor aperto) chiuderebbe il buco.

**Decisione PO richiesta**: confermare 36px per un trigger annidato dentro una casella da 44 (linea 15.7) e allineare la lettera dell'AC, oppure portarli a 44.

---

## 2. Osservazioni (non finding — nessuna azione obbligatoria)

1. **`PATCH /cash-movements/{id}` non ha guardia di concorrenza.** Race provata dal vivo su una riga non attribuita:
   ```
   RACE reclassify statuses: 200 200        (due PATCH concorrenti, metodi DIVERSI)
   RACE still unattributed?  false          (last-write-wins, nessun 409)
   REPLAY patch on attributed row status: 409
     {"error":{"code":"CONFLICT","message":"This movement already has a payment method — reclassification is only for unattributed movements."}}
   ```
   Il replay **sequenziale** è corretto (409); solo il caso **concorrente** passa due volte. Server **non toccato** da questa story ⇒ pre-esistente. Vale però una riga di TD: il flusso telefono (scegli → conferma) allarga la finestra fra lettura e scrittura.
2. **Idempotenza delle scritture: OK.** Doppio tap rapido (`dispatchEvent('click')` ×2) su `transaction-reclassify-confirm-mobile` ⇒ **1 sola** `PATCH` (`{"paymentMethod":"POS"}`); su `transaction-adjust-confirm-mobile` ⇒ **1 solo** POST e **1 solo** `ADJUSTMENT` da −1000. La scelta del metodo da sola ⇒ **0** richieste.
3. **`sprint-status.yaml` non aggiornato** (atteso, va nel commit `docs(15.8a)` di chiusura): riga 403 dice ancora `15-8-contabilita-statistiche-impostazioni-mobile: backlog` e non esistono voci `15-8a`/`15-8b` benché lo split sia ratificato da `f64faa9`. Da sistemare in chiusura, insieme a `docs/handoffs/HANDOFF.md` (fermo a `accfd2f`).

---

## 3. Verifiche indipendenti — tutto ciò che ho riprovato e che TIENE

### 3.1 Le scritture contabili dal telefono (priorità 1 della review)

| verifica | metodo | esito |
|---|---|---|
| prospettiva club sulla card | fixture nuova (`recordTopUp` 15.000, CASH) letta in **tre** posti nello stesso stato | card mobile **150,00 €** `stat-tone-ok` · cella desktop Entrate **150,00 €** · **xlsx** `Entrate = 150` (letto con `exceljs` dal file scaricato). Tre facce, **una** regola |
| funzioni pure riusate, non duplicate | `grep -rn "ledgerClubAmountCents\|getLedgerRevenueCents" src/` | `ledgerClubAmountCents` importata da `lib/schemas/transactions.ts` in `billing-console.tsx:56` e usata a `:665`, `:847`, `:969`; l'unica altra sede è `exports.service.ts:436-437`. **Nessuna seconda implementazione.** `src/lib/mobile-billing.ts` decide solo *quale colonna*, mai il segno |
| rettifica → 1 solo `ADJUSTMENT` | doppio submit + API filtrata | `POSTs fired: 1  ADJUSTMENT rows created: 1  [-1000]` |
| storno → 1 storno + 1 riga marcata, nel suo mese | flusso reale dallo sheet + API filtrata | `[{"d":"2026-08-05","amt":-4200,"rev":true},{"d":"2026-08-05","amt":4200,"reversed":true}]` |
| riclassifica = **1** PATCH, la scelta non scrive | contatore `page.route` | `PATCHes after CHOOSE only: 0` → `PATCHes after DOUBLE confirm: 1 ["{\"paymentMethod\":\"POS\"}"]` |
| nessuna `.mini-modal` a ≤640px | conteggio DOM durante il flusso | `mini-modal nodes while sheet open: 0`, `sheet nodes: 1` |
| parità dello sheet di riga | riga senza pilota **e** senza metodo (secchiello) | 11 righe: Data, Pilota (—), Tipo, Descrizione, **Metodo "Non attribuito"**, Entrate, Uscite, Stato, Origine, Riferimento, Identificativo; nome accessibile `05/07/2019 · Costo — Altro — …` (nessun `— —`, nessun segnaposto) |
| azioni gated come sul desktop | riga CASH non attribuita | `Assegna metodo` (44px) + `Storna` (44px), nessuna "Rettifica" |

### 3.2 Il secchiello gated sul **COUNT** (review Billing-2 F1) — provato col caso patologico

Ho creato due righe non attribuite di segno opposto (**+903 / −903 ⇒ somma 0, conteggio 2**) e riletto la pagina:

```
SECCHIELLO zero-sum: {"linkPresent":true,"linkText":"Non attribuiti (2) · 0,00 €","linkH":44,
                      "desktopLink":true,"desktopValue":"0,00 €"}
```

Il link è presente su **entrambe** le facce con somma zero ⇒ il gate è davvero sul conteggio, anche dentro lo sheet, con target 44px.

### 3.3 La deviazione 1 (SEED) — il punto più delicato, verificato voce per voce

- **Idempotenza**: `prisma/seed.ts:279-296` fa find-or-skip **per riga**; rieseguire il seed su un DB dove esiste solo la prima crea solo la seconda. ✓
- **Nessuna condivisione di fixture**: dopo l'arbitro, in DB:
  ```
  Movimento storico pre-Billing-1 (seed)        | 500 | CASH | 2019-06-15
  Movimento storico pre-Billing-1 mobile (seed) | 700 | CASH | 2019-06-16
  ```
  Ognuno consumato dal **suo** spec (`billing-global` filtra `hasText: 'Movimento storico pre-Billing-1'`, `mobile-billing` su `'…mobile (seed)'`), entrambi verdi nello stesso run.
- **Chi legge quel dato**: `computeTreasuryTotals` (`billing-summary.service.ts:99-121`) — la riga entra **solo** in `unattributedCents/Count` finché è non attribuita (`paymentMethod: null` ⇒ fuori da cash/bank/available); `result`/`byCategory`/`getCashReport`/`getStats` sono **finestrati sul mese** e la data 2019-06-16 è fuori da ogni preset (`lib/period-presets.ts`: mese, mese precedente, YTD, anno). ✓
- **Nessuna asserzione assoluta**: `grep -rn "billing-panel-unattributed\|unattributedCents\|unattributedCount" e2e/` ⇒ solo presenze/conteggi, **nessun valore atteso**. ✓
- **Effetto residuo dichiarabile**: una volta consumate, le due righe diventano `CASH` e sommano 1.200 cent (invece di 500) al `cashCents` di un DB "sporco". È la stessa proprietà che la fixture singola aveva già (trade-off accettato in review Billing-2 F4/F5) — solo più grande di 700. Non c'è spec che la legga in valore assoluto (`treasury-settings.spec.ts:91` asserisce un **delta**).
- **Onestà del record**: dichiarata in §7 dev.1 e in un doc-comment di 14 righe in `prisma/seed.ts:258-273`, con il motivo verificabile (nessun writer HTTP può creare una `CashMovement` senza `paymentMethod`). ✓

### 3.4 La deviazione 3 (`MobileSheet` + `preventScroll`) e i suoi gemelli

- **Consumer esistenti invariati**: `mobile-nav`, `mobile-top-bar`, `BottomSheet` (e quindi PPR, prenotazioni, flotta, piloti, istruttori, voli, scadenze, transiti) non passano le tre prop nuove ⇒ `classes()` produce la stessa stringa di prima; `panelRef.focus({preventScroll:true})` su un pannello `position:fixed` in fondo al viewport è un no-op per costruzione. La suite completa (26 spec mobile inclusi) è verde.
- **Il fix dello scroll ha gemelli?** Misurato all'apertura del menu su **tutti e dieci** i consumer a 375/641/800/1280: `scrollBefore: 0 → scrollAfter: 0` ovunque, incluso `people/{id}` (dove il dev aveva misurato −461px). Nessun altro punto del codice fa `focus()` su un `.popover`: `grep` conferma che l'unico consumer non-fixed del telaio è `ExportMenu`.
- **Residuo non curato (segnalato, non finding)**: la cleanup fa `previouslyFocused?.focus()` **senza** `preventScroll` (`mobile-sheet.tsx:112`). In pratica innocuo (il trigger è ancora in vista, perché l'apertura non ha più scrollato), ma è il gemello simmetrico del fix.

### 3.5 `ExportMenu` — 10 consumer (non 9), misurati da me

La story ne elencava **nove**: manca `pilots-console.tsx:346`. Il dev l'ha corretto e ne ha misurati **dieci**; `grep -rn "ExportMenu" --include=*.tsx src/` conferma dieci call-site. **Correzione giusta, credito al dev.**

**A 375px, tutti e dieci** (mia misura, `rev-C-export.json`): pannello `x = 0`, `w = 375`, `inside: true`, voci **44px** e tutte `own: true` all'hit-test, `trigger/pdf/xls/sheet` = 1 nodo ciascuno, `esportaButtons = 1`.

**Pre → post sul contenimento** (pre = artefatto del dev `158a-C-export-pre.json`, post = **mia** misura indipendente):

```
billing@375   PRE x=-29.09 w=180 inside=false linkH=53.69/53.69  →  NOW x=0 w=375 inside=true linkH=44/44
bookings@375  PRE x=-29.09 w=180 inside=false linkH=34.84/34.84  →  NOW x=0 w=375 inside=true linkH=44/44
(altri 8)     PRE inside=true  linkH=34.84                        →  NOW x=0 w=375 inside=true linkH=44
```

TD (c) e TD (d) **CHIUSI**, su dieci superfici, incluso il secondo caso fuori-viewport che la ricognizione non aveva elencato (Prenotazioni).

**Desktop invariato**: su 28 combinazioni consumer×larghezza (641/800/1280) le proprietà `w, h, z, position, padding, border-radius, min-width, display, gap` sono **identiche** al pre-fix; l'unica differenza è `x` su 6 combinazioni, che è la posizione del **trigger** (dipende dai dati della testata) — e infatti `panelRight == triggerRight == wrapperRight` con `delta = 6px` esattamente come prima. I cinque spec page-level (`cash-report:76-77`, `exports:272-275`, `pdf-exports:225` e `:355-356`, `movements:225`) — più `ppr-queue:549-554` e `mobile-planning:649-650`, che la story non elencava — sono verdi **senza una riga modificata** (`git show --stat 0e5d6cb` non li tocca).

**"Il consumer della Statistiche non esiste"**: confermato — `/dashboard/reports` non monta `ExportMenu` (nessuna occorrenza nel grep). Nessun consumer è rimasto col popover vecchio a 375.

### 3.6 KPI strip tappabile (Q3)

- **Parità nello STESSO render** (la prima stesura del dev era flaky per costruzione; questa è la versione corretta):
  ```
  KPI PARITY: {"net":["1.093,48 €","1.093,48 €"],
               "avail":["1.940,18 €","1.940,18 €"],
               "dep":["7.628,99 €","7.628,99 €"]}
  ```
- **R4, nessuna riga persa**: i tre sheet portano **tutte** le righe dei riquadri desktop —
  `result` → Ricavi / Costi / Utile-Perdita; `treasury` → Cassa / Banca / di cui acconti / Disponibile **+ il link secchiello con il suo importo**; `deposits` → Totale / Esposizione / Conti in rosso **+ il link "in rosso"**. Un solo nodo `mobile-billing-panel-sheet` per volta.
- **Guadagno misurato da me** (build di produzione, dati correnti): riquadri `display:none`, strip **152,97px** @375/@390 e **174,23** @320; prima card del registro a **563,41** @375 e **584,67** @320 — contro i 1068,23 / 1153,47 del pre-fix del dev. La prima riga passa dal **131%** al **69%** del viewport.
- **Tap da tastiera**: i KPI sono `<button>` reali con `aria-label` parlante (`Apri dettaglio: Risultato 1.093,48 €`); l'apertura da Tab+Enter è coperta dal test AC 2 del dev ed è verde.
- **Una sola `.kpi-row`** a 375 **e** a 1280 (verificato dal test AC 4, e la mia misura conferma `display:none` a 1280).

### 3.7 Contrasti — rimisurati da me nei DUE temi, col metodo del record

Metodo: canvas→WCAG, sfondo effettivo risalendo gli antenati, alpha letta prima della composizione, tema pilotato dal **cookie `am-theme`**, nodi filtrati per `getClientRects().length > 0`.

| esemplare | chiaro | scuro | soglia | esito |
|---|---|---|---|---|
| `billing-by-category-row` in (`.stat-tone-ok`) | **10,63** | 9,3 | 4,5 | ✓ |
| `billing-by-category-row` out (`.stat-tone-bad`) | **9,82** | 6,61 | 4,5 | ✓ |
| `negative-balance-row` importo (`.stat-tone-bad`) | **9,82** | 6,61 | 4,5 | ✓ |
| barra "in" (`.flow-bar-in`) | **4,56** | 12,36 | 3,0 | ✓ |
| barra "out" (`.flow-bar-out`) | **6,10** | 9,87 | 3,0 | ✓ |
| tag **PDF** dell'export (extra del dev) | **9,82** | 6,61 | 4,5 | ✓ |
| tag **XLS** dell'export (extra del dev) | **10,63** | 9,3 | 4,5 | ✓ |

**Gemelli enumerati da me** (non fidandomi dell'elenco): ho misurato **tutti** i nodi di testo visibili delle superfici nuove — card (titolo, sub, chip `bookType`, importo, badge di stato), KPI strip (label + value), chip strip, testata (Filtri, ricerca), sheet di riga (sub, title, k, v, bottoni), sheet dei riquadri, sheet export — nei **due** temi a **375 e 1280**. **Unico testo sotto 4,5 in tutta la raccolta**: il link `negative-balance-row > a` a **3,61** in chiaro, che è il colore globale degli `<a>` (`var(--info)`) e che il dev **dichiara** come TD nuovo (m), fuori mandato. Nessun altro esemplare scende, in nessuno dei due temi.

*Nota metodologica*: contando anche i `background-color` dei bottoni come "oggetti grafici" si ottengono decine di falsi positivi a 1,0-1,12 (un `.btn` su `--panel` ha lo stesso sfondo del pannello, e il suo significato lo porta il bordo) — è la stessa classe di artefatto che il dev descrive per i nodi dentro `display:none`. Li ho scartati, non sono findings.

### 3.8 Le guardie che avevano TROVATO difetti, riprovate

- **`scrollWidth <= clientWidth + 1` sulle due card del `.split`** (difetto 1 del §4): a 320 e 375 le due card sono **impilate e della stessa larghezza**, nessuno scroller interno. Verificato anche via la mia misura `pageOverflow = 0` a 320/375/390.
- **Contenimento sul rect** (`CHILDREN_OUT_OF_CARD`): verde nel run arbitro sulla fixture con importo `1.216,22 €` e descrizione lunga.
- **La testata 239**: mia misura indipendente, **`head 175 + strip 64 = 239`** identica a **320, 375 e 390** — contro 350,89 / 265,66 / 265,66 del pre-fix. Con `?bookType=REVENUE` la mia misura resta 239 (il chip attivo non aggiunge righe).
- **Discriminazione "clippato nel proprio scroller" vs "coperto dalla tab bar"** (correzione 3 del dev): riprodotta. A 375, scrollando a fondo pagina, il mio sweep **senza** discriminazione trova 1 hit (`A.mobile-tab`); con i rect: link a `y = 767,2`, scroller `.billing-negative-list` da `331,19` a `651,19` ⇒ il link è **fuori dal rettangolo visibile del proprio scroller**, non sotto la barra. La discriminazione del dev è **corretta**. A 320 resta un solo hit su `HEADER.mobile-topbar` (barra sticky, eccezione 15.1 dichiarata nella correzione 4).

### 3.9 Desktop invariato — rimisurato da me

```
@1280  .billing-head 109,23 · .students cw/sw 990/990 · .billing-split "488px 488px" → [488, 488]
       .app "232px 1048px" · .page-head 51,44 · pageOverflow 0 · tab bar display:none
       .billing-kpi-row display:none · .billing-mobile display:none
@800   .billing-head 152,23 · .students 678/988 · .app "64px 736px" · split [332, 332] · overflow 0
@641   .billing-head 180,53 (IT) · .students 519/988 · .app "64px 577px" · split [252,5 · 252,5] · overflow 0
```

Tutti i valori coincidono con la baseline dell'AC 13. `TransactionEditor` a **1280**: `kind 36 · person 36,84 · amount 34,84 · method 36 · date 38,84 · description 36,84 · submit 34,84`, trigger calendario **24×24**, ✕ **32×32** — **identici al pre-fix**. A **375**: i sei campi e il submit a **44**, pannello `0,0 375×812`.

### 3.10 Consegna

- **i18n**: `BillingPage` **155 chiavi in IT e 155 in EN**, zero orfane da entrambe le parti; sull'intero file **1934 = 1934**, nessuna chiave presente in un solo locale. Le 24 chiavi `mobile.*` ci sono in entrambi.
- **`grep -rn 'data-testid\^=' e2e/`**: 14 occorrenze, 9 file, prefissi `ac-card-`, `mobile-fleet-`, `mobile-fleet-card-`, `mobile-tail-chip-`, `pilot-row-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-` — nessuno collide con i nomi nuovi. Verifica del record **confermata**.
- **Nessuna dipendenza npm nuova**, nessun token esistente cambiato di valore, nessun literal di colore nuovo (il fix grafico è `color-mix` sui token, tecnica `.mobile-row-edge-*` della 15.4).
- **Nessuna modifica server** oltre a `prisma/seed.ts` (dato di test): `git show --stat 0e5d6cb` non tocca API, schemi Zod, service.

---

## 4. Decisioni da sottoporre al PO

1. **LOW-4 / MINOR-1 — il pavimento dei 44px sui bersagli "secondari"**: i 61 link di "Saldi negativi" (18,13px) vanno portati a 44 (raccomando **sì**, una riga CSS) e i due trigger del calendario a 36 vanno confermati come sono (linea già ratificata in 15.7, `airops.css:2928`) o portati a 44. La lettera dell'AC 5 li nomina fra i "≥44".
2. **LOW-3 — dove vive `.flow-bar-*`**: confermare il **nome** (regge il riuso) e decidere se **spostare** le due regole accanto a `.stat-tone-*` (`airops.css:733-738`) prima che la 15.8b le erediti, correggendo la §10 con la meccanica reale (`.util-bar .seg.flow-bar-in`, per specificità).
3. **MINOR-3 — TD (j)**: accettare la dichiarazione corretta ("il nuovo spec crea denaro nel `fullyParallel`, rischio residuo sul delta-assert globale di `billing.spec.ts:296`") oppure ordinare lo spostamento dei due test con ricarica in un project serializzato. Raccomando la **prima**: il TD è già registrato e un ottavo project costa più di quanto renda.

---

## 5. Stato lasciato dalla review

- **Suite**: `E2E_EXIT=0` — 430 passed + 1 flaky noto (`billing.spec.ts:296`, TD (j)). Log integrale in `/tmp/claude-1000/-home-admin-AirManager/ee712b45-2921-41fc-b3f4-238d53ae4fd0/scratchpad/review-158a-arbiter-full.log`.
- **DB**: le 4 righe `CashMovement` non attribuite che avevo inserito per i probe (`rev158a-unattr-1..4`) sono state **cancellate** (`DELETE 4`); il DB torna con `paymentMethod IS NULL` **count = 0** e le due righe di seed al loro posto, entrambe consumate dai rispettivi spec (stato normale di post-suite). Restano le fixture create dall'UI durante i probe (3 persone `RevRace/RevFocus/RevXls`, 2 categorie `RevCat`, un movimento di cassa e il suo storno, una rettifica da −10,00 €): dati di test ordinari, dello stesso tipo che ogni run e2e lascia. **Nessun attore di seed è stato mutato.**
- **Porta 3000**: il server di produzione avviato per i probe **è stato spento**; nessun processo in ascolto lasciato dietro.
- **Repo**: nessun file modificato dalla review (`git status` invariato); gli script di probe vivono solo nello scratchpad (`rev-A-targets.mjs`, `rev-B-contrast.mjs`, `rev-C-export.mjs`, `rev-C2-anchor.mjs`, `rev-D-writes.mjs`, `rev-E-misc.mjs`, `rev-F-tabbar.mjs`, `rev-G-editor.mjs`, `rev-H-feedback.mjs`, `rev-I-xlsx.mjs`), mai committati.
