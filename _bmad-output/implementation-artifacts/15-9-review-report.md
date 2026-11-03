# Review adversarial — story 15.9 (Aree self + modulo pubblico mobile)

- **Reviewer**: adversarial subagent (Opus 5 xhigh), 2026-08-06, macchina **LOCALE** (Fedora dell'utente).
- **Oggetto**: commit `8898288` (feat) + `91c2b30` (Dev Agent Record), branch `dev`, HEAD.
- **Story file**: `_bmad-output/implementation-artifacts/15-9-aree-self-pubblico-mobile.md` — letto per intero (ratifiche R-15.9-a..j, AC 1-16, blast radius, piano di test, Q1-Q10, Dev Agent Record con 7 deviazioni e 6 correzioni).
- **Verdetto**: **SHIPPABLE WITH FIXES** — **0 major**, **2 minor**, **5 low**, 7 osservazioni. Il nucleo della story regge alla prova empirica: il TD 14.6 F4 è **chiuso davvero** su entrambe le facce (sweep `[]` a 320/375/390 e **rosso a 25 nodi** col difetto reiniettato), il desktop è **intatto al centesimo** su tutte e quattro le superfici, il filtro server è un match esatto senza scorciatoie, e i quattro punti che il dev stesso segnalava all'attenzione avversariale sono stati verificati dal vivo e **tengono tutti e quattro**.

---

## 0. Esito arbitro — suite completa `CI=1`, build di produzione, DB fresco

Lanciata **per prima cosa** con `scripts/e2e.sh start`, letta **solo** con `scripts/e2e.sh status` (mai rieseguita). Log integrale copiato in `/tmp/claude-1000/-home-admin-AirManager/756bf5df-6305-44ec-bd2f-d0e61f2d5e2e/scratchpad/review-159-arbiter-full.log`.

```
=== e2e start: 2026-08-06T10:54:57+02:00 ===
state: DONE — E2E_EXIT=0
--- summary ---
  1 flaky
  2 skipped
  470 passed (14.5m)

  1) [chromium] › e2e/expiry-alerts.spec.ts:132:7 › Automatic expiry alert emails, idempotent job
     (Story 6.3, AC 1/2, FR-37, AD-9) › a scadenza due in 7 days triggers a holder alert email; …
     Error: apiRequestContext.post: read ECONNRESET
       at createPersonWithEmail (/home/admin/AirManager/e2e/expiry-alerts.spec.ts:107:39)
=== e2e end: 2026-08-06T11:09:26+02:00 ===
E2E_EXIT=0
```

- **470 passed + 1 flaky + 2 skipped = 473** = i **453** della baseline 15.8b + i **20** nuovi. Numeri identici a quelli dichiarati dal dev.
- **Tutti e 20** i test di `e2e/mobile-self-public.spec.ts` sono GIRATI e passati (`grep -c` = 20 righe `✓`), zero skip fra loro.
- ⚠️ **Il flaky NON è quello dichiarato dal dev**: da me ha flakato `expiry-alerts.spec.ts:132` con un **ECONNRESET** sul `POST /api/v1/people` (flake infrastrutturale, verde al retry), mentre **`billing.spec.ts:296` è passato al primo colpo**. Il TD (h) non si è manifestato in questo run (v. LOW-3 per il perché la mitigazione dichiarata non è quella che protegge).
- `mobile-registries.spec.ts:863` — il test **senza** l'esclusione di `account-section` — è **verde** nell'arbitro: `✓ 306 … scheda persona at <=640px: one column, no hidden side-scroll ANYWHERE — the estratto conto included since story 15.9 (AC 12) (2.1s)`.
- `my-compensation.spec.ts:347` (geometria riscritta) verde; `datetime-picker.spec.ts` e `ppr-public.spec.ts` **non toccati** (verificato sul diff) e verdi.

**`npm run gates`** (mio, dopo aver ucciso il server di probe):

```
PASS  lint (21s)
PASS  typecheck (3s)
PASS  test (7s) — Tests  1773 passed (1773)
PASS  build (31s)
```

**Unit senza env** (regola CLAUDE.md): `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/lib/mobile-self.test.ts src/lib/schemas/ppr.test.ts` → **24 passed**, nessun `@/lib/env` trascinato.

---

## 1. Findings

### MINOR-1 — Due colori inline `var(--ok)`/`var(--bad)` restano su `account-section.tsx`, misurati **2,73:1** e **3,96:1** in tema chiaro, e vivono ENTRAMBI sul telefono

**Dove**:
- `src/app/[locale]/dashboard/people/[id]/account-section.tsx:290` — `<p role="status" data-testid="adjustment-feedback" className="card-sub" style={{ color: 'var(--ok)' }}>`
- `src/app/[locale]/dashboard/people/[id]/account-section.tsx:668` (`TopUpForm`) e `:786` (`AdjustmentForm`) — `<p role="alert" className="fld-label" style={{ color: 'var(--bad)', … }}>`

**AC violati**: **AC 9** (iii: «il fix **deve** sostituire l'inline con la classe, non aggiungere una regola che non vincerà mai»; v: «**misura dei GEMELLI**: enumerare e misurare **tutte** le superfici che usano la classe toccata») e **AC 13** («contrasto delle superfici nuove **misurato** … ≥4,5:1 … **enumerando tutti gli esemplari** (la 15.4 ha trovato un pallino a 1,76:1 …): non fidarsi dell'elenco»).

**Perché è dentro lo scope, non un pre-esistente qualunque**:
1. Sono **gli stessi due numeri** (2,73 / 3,96) che questa story ha chiuso a tre righe di distanza, nello **stesso file**, nello **stesso commit**: dei 5 `style={{color: var(--ok|--bad)}}` di `account-section.tsx` il fix ne ha sostituiti **3** (importo di riga, saldo, importo compensi) e ne ha lasciati **2**.
2. Il `<p adjustment-feedback>` (2,73:1) è — **per la deviazione 1 del dev (R-15.9-j)** — l'**unico canale di annuncio** del percorso rettifica *inline* **sul telefono**: la story ha deciso di tenerlo visibile a ogni larghezza, quindi lo ha promosso a superficie mobile.
3. Il `<p role="alert">` (3,96:1) è il messaggio che l'**AC 3 (f)** impone di provare **a 375px dentro lo sheet nuovo** — ed è esattamente ciò che asserisce il test del dev (`e2e/mobile-self-public.spec.ts:567`, `toHaveText('Questo movimento ha già una rettifica collegata.')`). È testo nuovo su superficie nuova.

**Misura (mia, canvas→WCAG, sfondo effettivo risalendo gli antenati, alpha letta prima della composizione, build di produzione)**:

```
### CONTRAST light
 "@1280 adjustment-feedback (inline var(--ok))": { "r": 2.73,  "txt": "Rettifica registrata." }
 "@375  adjustment-feedback (inline var(--ok))": { "r": 2.73,  "txt": "Rettifica registrata." }
 "@375  sheet p[role=alert] (inline var(--bad))": { "r": 3.96, "txt": "Questo movimento ha già una re…" }
### CONTRAST dark   (nessuna discesa: 9.3 e 6.61)
```

Per confronto, nello stesso run e con lo stesso metodo, tutto ciò che il fix HA toccato è a posto: `.mobile-row-amount` **10,63 / 9,82**, riga desktop **10,63 / 9,82**, `account-balance` neutro **18,79**, `.mobile-row-sub` **4,85**, `.mobile-row-name` **18,79**, badge mobile **11,32**, `.bottom-sheet-k` **4,85**, `.fld-error` dentro lo sheet **9,82**; e i **gemelli** su `/dashboard/billing` sono **invariati al centesimo** (`.stat-tone-ok` 10,63 su 39 nodi, `.stat-tone-bad` 9,82 su 102 — dark 9,3 / 6,61).

**Riproduzione**: 375×812, tema chiaro, `/it/dashboard/people/{id}` come ADMIN → «Registra rettifica» → importo `-1,00` + motivo → invio ⇒ il `<p>` verde compare nella `.card-head`; misurare il rapporto col round-trip canvas. Per il rosso: aprire lo sheet di un movimento, «Registra rettifica», far creare via API la rettifica collegata a quel movimento, poi inviare ⇒ `p[role="alert"]`.

**Fix suggerito (3 righe, medicina già ratificata)**: `className="card-sub stat-tone-ok"` (riga 290) e `className="fld-label stat-tone-bad"` (righe 668, 786), rimuovendo il `color` dagli `style` inline e lasciando `marginTop` dove serve. `.stat-tone-*` è a `airops.css:733-735` con l'override `html[data-theme="dark"]` che restituisce i token vivaci, quindi il tema scuro non si muove.

---

### MINOR-2 — Lo sweep degli scroller nascosti di `/ppr` esclude **ogni antenato** del honeypot, non «il honeypot e il suo wrapper»: è cieco su `#formCard`, sul `<form>` e sulla `.ppr-grid`

**Dove**: `e2e/mobile-self-public.spec.ts:186-204`, riga **198**: `el.querySelector('[data-testid="ppr-honeypot"]') === null &&`.

**AC violati**: **AC 6 (c)** («`pageOverflow` resta 0 e **nessun contenitore interno** ha scroll orizzontale nascosto, con l'elenco delle **eccezioni dichiarate** — il **wrapper del honeypot** è una di queste e va **nominata**»), **AC 11** e **AC 12** (una guardia con un'esclusione più larga di quella dichiarata è la classe 15.8a MINOR-1 / 15.8b MINOR-2: «un'esclusione non dichiarata è una guardia che mente»).

**Prova empirica (iniezione, repo intatto)** — a 375px su `/it/ppr`:

```
### A1 /ppr sweep before injection
 "strict": ["|1/198"]                 // solo il wrapper del honeypot
 "spec":   []
 "ancestorsExcluded": ["DIV.ppr-grid#grid", "DIV.card#formCard", "FORM.#", "DIV.#"]

### A2 dopo aver iniettato un figlio da 2000px dentro #formCard (overflow-x:hidden)
 "strict": ["card|325/2048", "|1/198"]   // lo sweep onesto LO VEDE
 "spec":   []                            // la guardia della story NON lo vede
```

Cioè: **quattro** nodi sono fuori dallo sweep (il wrapper, il `<form>`, `#formCard`, `.ppr-grid`), e fra questi ci sono proprio i contenitori che possono sfondare. Oggi `/ppr` è sano (lo sweep stretto restituisce solo il wrapper del honeypot a **tutte** le larghezze 320/375/390/641/800/821/1280, in **entrambi** i temi — misurato), quindi **non c'è un difetto nascosto ora**: c'è una guardia che non proteggerà la 15.10.

**Fix suggerito**: sostituire il predicato con l'esclusione del **solo wrapper**, p.es. `el.querySelector(':scope > [data-testid="ppr-honeypot"]') === null` (o confrontare l'identità col `parentElement` del honeypot), e ri-provarla rossa con la stessa iniezione.

---

### LOW-1 — I due testid nuovi dei badge mobile hanno **zero** asserzioni in tutto `e2e/`

`adjustment-badge-mobile` e `reversal-badge-mobile` (`account-section.tsx:437`, `:444`) compaiono **1 volta in `src/`** e **0 volte in `e2e/`** (`grep -rn`). L'AC 1 chiede che i badge restino sulla card «**con lo stesso testo di oggi** (compreso il fallback `linked`)» e l'AC 3 (c) che il comportamento sia esercitato a 375px; la prova portata dal record è il **solo** unit test della funzione pura `linkedBadgeText`, che non dice nulla sul fatto che il badge sia reso, con quel testo, in quel nodo. Il badge di **storno** (`FLIGHT_CHARGE_REVERSAL`) non è reso da **nessun** test a nessuna larghezza.

Verificato a mano che il ramo rettifica funziona: a 320/375/390 il badge c'è, testo `«Rettifica del movimento del 15/01/2026»` (fallback `linked` non provato da me), contenuto nella card (`badgeRect.right 252,83 ≤ cardRight 343`), contrasto 11,32 chiaro / 9,28 scuro. **Gap di copertura, non difetto.**

---

### LOW-2 — La guardia degli empty state è dichiarata «con la clonazione DOM del pre-fix» ma la simulazione **non è nel test committato**

Record §7: «empty state = un nodo per albero | `toHaveCount(1)` + **clonazione DOM del nodo** | dopo `appendChild(node.cloneNode(true))` ⇒ 2 ⇒ rosso». In `e2e/mobile-self-public.spec.ts` **non esiste** alcun `cloneNode`/`appendChild` (`grep`), mentre l'idioma dell'epic è di committare la simulazione **dentro** il test — quattro precedenti: `mobile-billing.spec.ts:302`, `mobile-settings.spec.ts:489`, `mobile-expiries-movements.spec.ts:480` e `:487`. L'AC 12 (vi) chiede esattamente quel metodo («**non** "non iniettabile"»). Il test attuale (righe 333-354) asserisce comunque conteggi e stringhe distinte a **entrambe** le larghezze, quindi la copertura c'è: manca la prova di discriminanza *nel repo*.

---

### LOW-3 — La motivazione con cui il record dichiara di non aggravare il TD (h) è **sbagliata**: «Acconti» è una Σ **all-time** dei saldi positivi, la data passata non protegge nulla

Record §8 TD (h): «**8 conti** con ricariche (**tutte datate `2026-01-15`, passato**, compresa quella inviata dal form — cambiata apposta), **4 rettifiche** che il dominio data **oggi**».

Ma l'asserzione che flaka in `billing.spec.ts:341` è `depositsTotalAfter - depositsTotalBefore`, e `deposits.totalCents` è definito in `src/server/services/billing-summary.service.ts:35-38` come «**Σ of every POSITIVE account balance**» — un aggregato **senza finestra temporale**. Quindi:

- le **8 ricariche** (`e2e/mobile-self-public.spec.ts:102-110`, `paymentMethod: 'CASH'`) muovono `deposits.totalCents` **nell'istante in cui committano**, qualunque sia `effectiveDate`;
- le **4 rettifiche** negative lo muovono allo stesso modo;
- la data passata protegge davvero solo `revenue`/`cost`/`net` (scoped al mese di `ref`) e `bank` non è toccato perché il metodo è CASH.

Conclusione operativa: il TD (h) **è esposto** a 12+ scritture concorrenti del nuovo spec dentro la finestra `before/after` di `billing.spec.ts:296` — la conclusione onesta del record («esposizione dichiarata») resta, la **spiegazione** va corretta. Nel mio arbitro `billing.spec.ts:296` è passato; nel run del dev ha flakato.

---

### LOW-4 — Il parametro nuovo replica la classe **422-prima-di-403** (TD 14.9 F11) e il record non lo dichiara

Misurato dal vivo come **PILOT** (attore senza `ppr.manage`) su `GET /api/v1/ppr-requests`:

```
"status=ALL"                              -> 403 FORBIDDEN
"status=ALL&pprNumber=PPR-2026-0001"      -> 403 FORBIDDEN
"status=ALL&pprNumber=NOT-A-NUMBER"       -> 422 VALIDATION_ERROR   <-- 422 prima di 403
"status=BOGUS"                            -> 422 VALIDATION_ERROR   <-- identico, PRE-ESISTENTE
```

Causa: `src/lib/api/handler.ts` valida la query (riga ~372) **dopo** la sessione (riga ~363) ma **prima** di `handle` → l'`authorize(actor,'ppr.manage')` del service. È una proprietà del chassis `apiRoute`, non di questa story, e **non aggiunge nessuna informazione nuova** (`?status=BOGUS` la espone già oggi). Anonimo con parametro malformato risponde correttamente **401 UNAUTHENTICATED**. Va **dichiarato** nel record come classe replicata, non «risolto» qui.

---

### LOW-5 — Inesattezze minori del Dev Agent Record

| claim | realtà misurata |
|---|---|
| «**6 chiavi nuove** per locale» (§2) | **5** chiavi foglia (`AccountStatementPage.mobile.{empty,openDetail,close}`, `MyCompensationPage.mobile.registeredOn`, `PprQueuePage.mobile.viewInMovements`). Parità i18n verificata: **1955/1955**, zero chiavi orfane in un solo locale. |
| «`export-menu-trigger` … post **44**» (§5) | **44,00** sulla faccia self, **53,69** sulla faccia admin a 375 (l'etichetta va a capo). Sopra il pavimento in entrambi i casi: la tabella cita un solo valore per due geometrie. |
| «§5 `.ppr-top` post **72**» | **72,00** a ≥641 (esatto) e **73,50** a 320/375/390 (il record non distingue). |

---

## 2. I quattro punti che il dev ha segnalato all'attenzione avversariale — verificati DAL VIVO, tengono tutti

### 2.1 Il ramo `inSheet` di `adjustPanel` — **regge**

- Con il secondo passo dello sheet aperto: `account-adjustment-form` = **1** nodo, `.mobile-sheet` = 1, `.slideover.open/.mini-modal` = **0** (AD-8 rispettato).
- Aprendo lo sheet **mentre** il riquadro inline della testata è aperto: forms = **1**, visibili = 1, sheets = 1 (nessun doppione).
- Ridimensionando a 1280 col secondo passo aperto: forms = 1, **visibili = 0**, `.mobile-sheet` `display:none` (la regola base `airops.css:1748` copre il caso rotazione-in-orizzontale; nessun blocco dello scroll del body in `MobileSheet`, quindi nessuno stato bloccato).
- **`key` di remount**: sheet riga A → secondo passo → digitato `42` → chiusura → azione **standalone** della testata ⇒ il campo importo arriva **vuoto** (`""`). Il contratto RHF è conservato nei due punti di render.

### 2.2 La chiusura DERIVATA dello sheet (deviazione 2) — **regge, e la superficie d'attacco è più piccola di quanto sembri**

- `?page=1→2` con lo sheet aperto ⇒ lo sheet **sparisce** (già coperto dall'e2e a `:520`), e i dati non possono essere stantii perché `sheetRow = rowById.get(sheetRowId)` si ricalcola a ogni render dei props del server: dopo un `router.refresh()` lo sheet **segue** la riga (badge compreso) invece di fotografarla.
- Attacco «cambia pagina con lo sheet aperto **cliccando**»: **non raggiungibile**: lo scrim del `MobileSheet` (z 40, `inset: 0`) copre la paginazione, quindi l'unico percorso reale è una navigazione d'indirizzo — che è quella provata. Nessun `useEffect` di sincronizzazione da scrivere (e la lint `react-hooks/set-state-in-effect` lo vieterebbe): la motivazione del dev è corretta.
- Residuo innocuo: se la riga sparisce mentre il secondo passo è aperto, `adjustPanel.inSheet` resta appeso ma **non rende nulla** (il riquadro inline è gated su `!inSheet`) e `openSheet()`/`closeSheet()` lo azzerano. Nessun nodo fantasma misurato.

### 2.3 La deviazione 1 (R-15.9-j, feedback della rettifica) — **regge nello spirito: un canale per percorso, mai due**

Misurati **tutti e quattro** i percorsi dal vivo (`/dashboard/people/{id}` come ADMIN):

| percorso | `adjustment-feedback` | toast | annunci |
|---|---|---|---|
| **mobile 375 · riquadro inline** | 1 nodo, testo «Rettifica registrata.», **dentro il viewport** (`top 19,9 / bottom 35,8` di 812) | **0** | **1** |
| **mobile 375 · sheet** | **0 nodi** | 1 («Rettifica registrata.») | **1** |
| **desktop 1280 · riquadro inline** | 1 nodo, `top 110,2` | **0** | **1** |
| **desktop 1280 · sheet** | — | — | **non raggiungibile** (`.account-mobile` è `display:none`, 0 sheet nel DOM) |

L'implementazione letterale della ratifica («toast su mobile, il `<p>` resta al desktop») avrebbe davvero prodotto **due** annunci sul desktop o **zero** sul percorso inline mobile, che R-15.9-j vieta nella stessa frase («canale unico, nessun doppio annuncio»). Il difetto che la ratifica voleva curare — il feedback fuori campo — **non si presenta**: il `<p>` è sopra il riquadro che l'utente ha appena usato ed è risultato in viewport dopo l'invio. ⚠️ Unico strascico: quel `<p>` è a **2,73:1** (MINOR-1). **Deviazione da RATIFICARE dal PO**, non un finding.

### 2.4 Il costo reale della griglia KPI (+156,48px) e i +37,46px della testata self — **veri, quantificati, e senza danni collaterali**

- KPI a 375: `grid`, tracce `155.5px 155.5px`, `scrollWidth == clientWidth`, **`kpi-gross-mtd.top === kpi-owed-mtd.top` (248)** ⇒ Maturato e Dovuto sulla **stessa riga** (ratifica 14.7 F4 salva), quinto a piena larghezza (`319` = larghezza riga), altezza riga **233,45**. A 320: tracce `128px 128px`, quinto a `264`. A 390: `163px 163px`.
- `docH` **812** a 375 con un pagamento (la pagina resta in **uno schermo**), `pageOverflow 0`, **zero** controlli sotto 43,5px, hit-test a fondo pagina `[]`, `cardOverflow []`.
- Desktop **invariato**: a 641/800 la `.kpi-row` è già 2 colonne **da prima** (`airops.css:1507`, query pre-esistente) e a 1280 sono **5 tracce** — la classe `kpi-row-grid` vive interamente dentro `@media (max-width:640px)` (aperta a `airops.css:2119`), quindi non può toccare la fascia ≥641.
- Testata self: `.account-head` **63,84 → 101,3** a 320/375/390 (+37,46 esatti), `.page-head` **51,44 invariata**; a 641/800/1280 la testata è **63,84/63,84/63,84** identica al pre. Il TD (m) è accurato e la via d'uscita indicata (nascondere `.card-title` come fa `.billing-head`) è coerente col codice esistente.

---

## 3. Verifiche indipendenti che hanno CONFERMATO il lavoro

### 3.1 TD 14.6 F4 — chiuso davvero, su entrambe le facce

Faccia **admin** (`/dashboard/people/{id}`, 21 movimenti + 1 rettifica), misure mie a 320/375/390:

```
desktopBody: "none"   mobileTree: "block"   .students: 0/0 (display:none)
sweep (.page *, senza ALCUNA esclusione): []        cardOverflow: []
clippedWithoutEllipsis: []   pageOverflow: 0
target < 43,5: ["iconbtn:32.00", "recent-flights-view-all:15.94"]  (entrambi PRE-ESISTENTI, fuori scope)
cardHead: 162,98 @320 · 110,98 @375/@390     docH: 2896 / 2827 / 2827
```

Guardia **provata rossa** da me, repo intatto, iniettando `@media(max-width:640px){.account-desktop-body{display:flex!important}.account-mobile{display:none!important}}`:

```
["students account-desktop-body","student-row header","","student-row","","badge warn","student-row", … ]  (25 nodi)
```

Faccia **self** (`/dashboard/my-account`, stesso conto): a 320/375/390 `sweep []`, `cardOverflow []`, `small []`, `covered []`, `pageOverflow 0`, export **44**, prev/next **44**, `writeActions` **0** (nessuna azione di scrittura per l'attore self, a nessuna larghezza). Sheet self: nome accessibile `«06/08/2026 — Rettifica»`, righe `Data / Descrizione / Importo` + titolo = tipo, **nessun** «Registrato da», **0** azioni.

### 3.2 Desktop invariato — misurato, non dedotto

| superficie | 641 | 800 | 1280 |
|---|---|---|---|
| scheda persona `.card-head` | 106,69 | 63,84 | 63,84 |
| scheda persona `.students` | 483/802 | 642/802 | 954/954 |
| scheda persona azione di riga | 24,67 | 24,67 | 24,67 |
| paginazione (`.account-pagination`) | `flex/center/gap 16px/margin-top 16px`, h **34,84** | idem | idem |
| `export-menu-trigger` | 34,84 | 34,84 | 34,84 |
| my-account `.students` tracce | — | `104 150 190 120` | `104 150 502 120` |
| my-compensation `.kpi-row` | 2 tracce `254,5` (pre-esistente) | `334` | **5 tracce** |
| `/ppr` `.ppr-grid` | `593px` | `752px`* | `623,33 366,66` |

*misurato `800 → 752px` una colonna, coerente con la soglia 820 pre-esistente. L'**unica** variazione desktop è `.ppr-top` **60 → 72** (dichiarata, prezzo aritmetico dei 44px dello switch).

### 3.3 `/ppr` — risanamento chirurgico, provato per attribuzione delle regole CSS

Misure a **320/375/390/641/800/821/1280** in **entrambi** i temi (identiche fra chiaro e scuro, diff programmatico = `IDENTICAL`):

- ≤390: **12 campi su 12** a **44,00** (textarea 74,53 by design), **2 `.date-input-btn` 44×44**, `ppr-submit` **277×44,30 full width** (`.ppr-actions` `flex-wrap: wrap`), `switch lingua` **45,72×44** a **ogni** larghezza (320→1280), `pageOverflow 0`, sweep stretto = **solo** il wrapper del honeypot.
- ≥641: campi 36,84 / 38,84 e trigger 24×24 **invariati** (fascia fuori AC, TD (c)/(d) dichiarati).
- **Attribuzione delle regole** (enumerando `document.styleSheets` e filtrando con `el.matches`): `.ppr-hero` → `[reset, .ppr-hero]`, `.ppr-foot` → `[reset, .ppr-foot]`, `.ppr-top` → `[reset, .ppr-top]`, `.ppr-aside` → `[reset, .ppr-aside, @(max-width:820px) .ppr-aside]` (regola **pre-esistente**), `#formCard` → `[reset, .card]`. **Nessuna** regola della 15.9 raggiunge hero/aside/footer: il risanamento è chirurgico per costruzione, non per promessa.
- **Lo switch funziona davvero**: IT→EN naviga a `/en/ppr`, l'etichetta si inverte in «Italiano», l'`h1` diventa «Request landing permission»; **la mail di ricevuta segue la lingua** — submit EN reale ⇒ Mailpit `Subject: "PPR request received: I-REVW"`.
- Nessuna label toccata (`ppr-form.tsx` **non è nel diff**) ⇒ TD (k) non aggravato, `ppr-public.spec.ts` intatto.

### 3.4 Il lavoro server R-15.9-h — contratto e permessi

```
### API contract ?pprNumber (ADMIN)
 PPR-2026-0001            -> 200, total 1, tutti gli items con QUEL numero
 PPR-2026-00010           -> 200 (seq > 4 cifre ammessa)
 PPR-2026-1 / PPR-26-0001 / ppr-2026-0001 / 2026-0001 / <empty> /
 'PPR-2026-0001 OR 1=1' / "PPR-2026-0001'" / NOT-A-NUMBER  -> 422 VALIDATION_ERROR (mai 500)
 PPR-9999-9999            -> 200, total 0  (ben formato ma inesistente = pagina vuota)
 numero "vicino" (…0000)  -> total 0        (nessun match per prefisso/substring)
 numero in minuscolo      -> 422            (nessun trucco di case)
 senza filtro             -> total 73
```

- Registry OpenAPI aggiornato **nello stesso commit** (`src/lib/schemas/registry.ts:1609`, descrizione del parametro con formato, 422 e pagina vuota) — verificato sul diff.
- Il link compare **solo** dove il numero esiste: sul DB `PENDING 16/0`, `REJECTED 3/0`, `APPROVED 43/43`, `COMPLETED 8/8`, `CANCELLED 3/3` (query `psql`) ⇒ il ramo `sheetRequest.pprNumber ? <Link> : status==='PENDING' ? <approva/rifiuta>` **non può** rubare le azioni a una PENDING.
- Deep link end-to-end: `/it/dashboard/movements?status=ALL&pprNumber=PPR-2026-0001` mostra **1 riga** a 375 **e** a 1280 (entrambi gli alberi); numero inesistente ⇒ 0 righe + «Nessun PPR trovato per i filtri selezionati.», **nessun errore**; `?pprNumber=NOT-A-NUMBER` sulla **pagina** ⇒ **200** col registro normale (20 righe), mai un 422 su un render.
- **Permessi**: un PILOT che naviga il deep link viene **rediretto** a `/it/dashboard` (la destinazione è gated `ppr.manage` come la sorgente ⇒ nessun ramo di permesso da scrivere, come dichiarato). V. LOW-4 per l'ordinamento 422/403 sull'API.
- `/dashboard/ppr`: il diff di `ppr-console.tsx` è **21 righe** — un import, il tipo della label, il ternario delle azioni. **Nient'altro** (R-15.9-i rispettata alla lettera).

### 3.5 Blast radius e non-interferenza — 14 selettori nuovi × 14 pagine × 2 larghezze

Conteggi su `my-account`, `my-compensation`, `people/{id}`, `billing`, `logbook`, `movements`, `bookings`, `dashboard`, `reports`, `expiries`, `ppr`, `settings`, `fleet`, `pilots` a **375** e **1280**:

- `.account-mobile`, `.account-desktop-body`, `.account-head`, `.account-pagination`, `.account-topup-panel`, `.account-adjust-panel`, `.account-sheet-step`, `.compensation-mobile`, `.compensation-desktop-body`, `.compensation-kpi-row`, `.mobile-row-movement`, `.mobile-row-payout`, `.ppr-brand-block`, `.ppr-form-grid` ⇒ **0 match** fuori dalle quattro superfici.
- `account-movement-row` **20** / `account-movement-row-mobile` **20** sulla scheda persona a **entrambe** le larghezze; `account-balance` **1**; `adjustment-badge` **2** / `adjustment-badge-mobile` **2**; `account-statement-header-row` **1**.
- Le quattro stringhe lette page-level: `Nessun conto attivo` **1**, `Nessun movimento registrato.` **1**, `Nessun movimento in questo conto.` **1**, `Nessun profilo istruttore attivo.` **1** — a **1280** come a 375.
- `.date-input-btn` **resta 24×24** su logbook/movements/bookings/dashboard/`/dashboard/ppr` (36×36 su billing/settings dalle story precedenti) ⇒ deviazione 4 ancorata davvero, TD (d) invariato e **dichiarato**.
- `.kpi-row` e `.students` fuori dalle superfici della story: **invariati** (`flex 375/717` logbook, `flex 375/890` dashboard, `flex 375/828` reports, `grid 319/319` expiries/billing).
- `grep -rn 'data-testid\^=' e2e/` rifatto: **29 occorrenze / 10 file**, prefissi `ac-card-`, `pilot-row-`, `schedule-filter-{aircraft,instructor}-`, `mobile-tail-chip-`, `mobile-fleet-`, `mobile-fleet-card-`, `reports-fleet-row-`, `reports-rank-aircraft-row-` — **nessuno** è prefisso di un testid nuovo; nessun albero mobile riusa `account-adjustment-row-{id}`.

### 3.6 Multi-attore e stati degradati (AC 14)

Oltre ai quattro attori coperti dall'e2e, ho creato e provato **a 375 e 1280** i due degradati che lo spec nuovo **non** copre:

| attore | my-account | my-compensation |
|---|---|---|
| **PILOT senza `personId`** | 200, «Nessun conto attivo», `mobile-account-empty` 1, `account-statement-empty` 1, sweep `[]`, overflow 0 | 200, «Nessun profilo istruttore attivo.», 0 KPI |
| **INSTRUCTOR con profilo DISATTIVATO** | 200, idem | 200, «Nessun profilo istruttore attivo.», 0 KPI — **mai 403** (comportamento 14.7 AC 4 preservato) |

Entrambi restano coperti al **desktop** dagli spec pre-esistenti (`my-account.spec.ts:288`, `my-compensation.spec.ts:226`); a 375 la verifica è stata **mia**, non del repo.

### 3.7 La riscrittura di `my-compensation.spec.ts:329-361` — è un RAFFORZAMENTO

Confronto riga per riga del `git diff`: il requisito passa da «larghezza > 0 e hit-test **dopo aver scrollato `.students` a destra**» a «larghezza > 0 **e** hit-test **e** `insideCard` **e** `anyScroller === false` **senza alcuno scroll**», più l'asserzione nuova che `.compensation-desktop-body` è `display:none` e il `toContainText('123,45 €')` conservato. Il difetto originale (cella importo a 0px) **fallirebbe ancora** la versione nuova. Nessuna asserzione persa.

---

## 4. Osservazioni (non finding)

1. **Il flaky dell'arbitro non è quello del dev**: `expiry-alerts.spec.ts:132` (ECONNRESET, infra) invece di `billing.spec.ts:296`, che qui è **verde**. Due run, due flaky diversi: il rumore è ambientale.
2. **Fascia 641-800 sulla faccia admin**: `.students` **483/802** e **642/802** con la traccia Descrizione a **0px** — cioè 319px/160px ancora nascosti sul tablet. **Invariato** rispetto al pre (la tabella del record lo dichiara «identiche»), ma il testo della story dichiarava il buco a 641 solo per la faccia **self** (31px) e per my-compensation (157px): vale la pena scriverlo per la 15.10.
3. **Overflow desktop pre-esistente del badge**: a 800/1280 sulla faccia self il `badge warn` misura `148/254` dentro la cella Tipo da 150px (sweep desktop). Pre-esistente e invariato (le `cols` non sono state toccate).
4. **Attore senza `personId`**: la card mostra comunque il trigger `ExportMenu`, che apre uno **sheet vuoto** (entrambi gli href sono `undefined` e `ExportMenu` omette le voci senza href). Pre-esistente (14.6), non introdotto qui — ma ora il trigger è a 44px e a piena larghezza, quindi il nulla è più invitante.
5. **Non-remount e rotazione**: con il secondo passo aperto, ruotare a landscape (>640px) nasconde lo sheet (`.mobile-sheet{display:none}` fuori query) lasciando lo stato appeso; nessun blocco di scroll, nessun nodo duplicato, si ripristina ruotando indietro. Comportamento **di tutto l'epic**, non di questa story.
6. **`.registry-pagination` riusata** dall'estratto conto: l'unica regola che la tocca è `airops.css:2557` (dentro la query 640), quindi aggiungere la classe è inerte al desktop — verificato (34,84 identico a 641/800/1280).
7. **Consegna**: `sprint-status.yaml` ha ancora `15-9-…: backlog` e `HANDOFF.md` è fermo al 2026-08-05 — **atteso**, li scrive la sessione principale nel `docs(15.9)` di chiusura. Working tree pulito (solo la cancellazione pre-esistente di `.claude/skills/design-taste-frontend/SKILL.md`, estranea alla story).

---

## 5. Decisioni da sottoporre al PO

1. **MINOR-1 — chiudere adesso i due contrasti residui o dichiararli TD per la 15.10?** Raccomandazione: **chiudere adesso**. Sono tre righe nello stesso file appena riscritto, la medicina è quella già ratificata due volte (R-15.8a-i, R-15.9-d), e uno dei due (`adjustment-feedback` a 2,73:1) è — per la deviazione 1 — l'**unico** annuncio che il telefono dà sul percorso inline: lasciarlo significa che la story ha migliorato il canale e peggiorato la sua leggibilità relativa.
2. **Ratifica della deviazione 1** (R-15.9-j): il `<p role="status">` resta a **ogni** larghezza per il percorso *inline* e il toast serve **solo** il percorso *sheet*. Verificato che nessun percorso dà due annunci e che il `<p>` è in viewport dopo l'invio a 375. Serve la ratifica formale perché la lettera della ratifica diceva «toast su mobile, il `<p>` resta al desktop».
3. **Ratifica implicita già consumata da confermare**: il deep link è in **una** direzione (coda PPR → Transiti), con la motivazione «il verso opposto punterebbe alla stessa entità» — R-15.9-h lasciava la scelta al dev, quindi è dentro mandato: va solo registrata.

---

## 6. Stato dell'ambiente lasciato dalla review

- **Porta 3000: LIBERA** (il server di produzione delle probe è stato ucciso; l'ultima `npm run gates` ha ricostruito `.next` a server spento).
- **DB**: non resettato. Contiene i dati del run d'arbitro **più** le fixture della review, tutte **additive** e riconoscibili: persona `RevPersona Rev159-…` (id `cmshaqhj70002yypv6ljfucsn`, 21 ricariche datate 2026-01-15 + rettifiche di prova), utenti `rev159-*@airmanager.local` (personless, istruttore disattivato, istruttore con payout, login self), 1 richiesta PPR pubblica EN (`I-REVW`). **Nessun attore di seed è stato modificato, nessun `AppSetting` è stato scritto** (verificato: la review non tocca `airfield.*` né la catena serializzata).
- Script di probe e log in `/tmp/claude-1000/-home-admin-AirManager/756bf5df-6305-44ec-bd2f-d0e61f2d5e2e/scratchpad/` (`review-159-arbiter-full.log`, `p1..p9-*.mjs`, `ppr-out.txt`, `contrast-out.txt`, `degraded-out.txt`) — **mai** committati.
