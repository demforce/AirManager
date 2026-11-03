# Review adversariale — Story 15.7 "Scadenze + Transiti mobile"

- **Reviewer**: subagent adversarial (Opus 5 xhigh), 2026-08-04, macchina LOCALE (Fedora dell'utente).
- **Oggetto**: `_bmad-output/implementation-artifacts/15-7-scadenze-transiti-mobile.md` (ratifiche R-15.7-a..k, AC 1-15, Dev Agent Record con 7 deviazioni + AC 10 dichiarato parziale), commit `519a269` (feat) + `f18138b` (record) su `dev`.
- **Verdetto**: **SHIPPABLE-WITH-FIXES** — **0 Major**, **1 Minor**, **7 Low**. Il cuore economico della story (chiusura del transito dal telefono) e' stato esercitato **dal vivo** e verificato **in DB con psql**: un solo `CashMovement`, importo esatto, categoria PPR, race a due chiusure concorrenti risolta 200/409 con **un solo** movimento, replay idempotente, 409 distinto dal generico, annullo senza effetto contabile. Il desktop e' invariato alle tre larghezze, i contrasti reggono nei due temi su **tutti** i 5 tier scadenza e i **7** stati transito, la suite completa passa da arbitro su DB fresco. L'unico Minor e' un target da 20px sul controllo che scavalca un rifiuto del server, con la guardia calibrata **sul valore ottenuto**.

---

## 0. Priorita' zero — arbitro: suite completa su DB fresco

Lanciata PRIMA di qualunque altra cosa, su DB appena resettato dalla sessione principale, `CI=1`, build di produzione, `scripts/e2e.sh start`, esito letto SOLO da `scripts/e2e.sh status` (mai rilanciata).

```
$ set -a && . ./.env && set +a && export JOBS_SECRET=review-15-7-arbiter
$ CI=1 scripts/e2e.sh start
STARTED (pid 1383338) — log: /tmp/airmanager-e2e/last-run.log
$ scripts/e2e.sh status 25
state: DONE — E2E_EXIT=0
--- summary ---
  1 flaky
  404 passed (10.8m)
=== e2e end: 2026-08-04T18:38:23+02:00 ===
E2E_EXIT=0
```

**404 passed + 1 flaky, exit 0** — verbatim. `grep -ac "✓"` sul log: **405** (404 + il retry verde del flaky). Il totale coincide con la dichiarazione del dev (405 = 380 baseline 15.6 + 23 spec nuovo + 2 spec quota).

**L'unico flaky non e' della story ed e' un TD gia' registrato**: `billing.spec.ts:296` (`depositsTotalAfter - depositsTotalBefore` = 5000 invece di 10000, verde al retry) — e' *letteralmente* il TD di `sprint-status.yaml` ("delta-assert su un aggregato GLOBALE sotto `fullyParallel`... rimedio: spostarlo nel project `billing-global`"). Nessuna spec di questa story crea movimenti di denaro concorrenti... **anzi, ne crea**: la chiusura del transito con tassa scrive in cassa. Non e' pero' un acconto (`AccountMovement` di tipo TOP_UP), che e' cio' che quel test somma, quindi la non-attribuibilita' regge. La flake nota di `flights.spec.ts:602` non e' comparsa.

**Catena serializzata**: eseguita per intero e in ordine, col project nuovo **in ultima posizione**:
`chromium → settings → booking-window → treasury-settings → billing-global → mobile-metar → mobile-overview-overflow → mobile-membership-fee` (test 405 e 406 del log). Il `testIgnore` del project `chromium` include `mobile-membership-fee.spec.ts` (`playwright.config.ts:50`), quindi non gira due volte.

**`afterAll` del project nuovo verificato in DB** (non a parole):

```
$ docker exec airmanager-postgres-1 psql -U airmanager -d airmanager \
    -c "select key, value from \"AppSetting\" where key like 'membership%';"
        key             | value
----------------------------+-------
 membership.annualFeeCents  | 0
```

Gate di progetto rieseguito da me dopo tutte le sonde:

```
$ npm run gates
PASS  lint (20s)
PASS  typecheck (2s)
PASS  test (7s) — Tests  1724 passed (1724)
PASS  build (29s)

$ env -u DATABASE_URL -u AUTH_SECRET -u JOBS_SECRET npx vitest run src/lib/mobile-{expiries,movements,sub-line,logbook}.test.ts
Test Files  4 passed (4)   Tests  35 passed (35)
```

(la regola "env eager" di CLAUDE.md e' rispettata: i 4 file passano **senza** env esportato).

---

## 1. Findings

### MINOR-1 — "Forza addebito" e' un target da **20px** su un pannello a tutto schermo, e la sua guardia e' calibrata sul valore ottenuto (19.5px)

**Severita'**: Minor (ergonomia di un controllo che **scavalca un rifiuto del server su denaro**; nessuna perdita di dato, nessuna regressione funzionale).

**File**:
- `src/styles/airops.css:3009` — `.membership-fee-override-label > input[type="checkbox"]{ width: 20px; height: 20px; flex-shrink: 0; }`
- `src/styles/airops.css:2823` — `.membership-fee-override-label{ display:flex; align-items:center; gap:6px; ... }` (la label **avvolge** l'input, quindi il target reale e' la riga label)
- `src/app/[locale]/dashboard/expiries/scadenze-console.tsx:841-843`
- `e2e/mobile-membership-fee.spec.ts:102` — `if (rect.height < 19.5) out.push(...)` e `:108` — `toBeGreaterThanOrEqual(20)`

**Il fatto**: il pannello quota e' stato portato alla grammatica full-screen dell'epic e **tutti** gli altri controlli sono a 44px (misurati: submit 168×44, input 44). Il solo controllo che decide se un **rifiuto del server** (422 `MEMBERSHIP_FEE_INSUFFICIENT_BALANCE`) viene scavalcato resta a **20px** di altezza. Il target *reale*, cioe' la label che lo avvolge, misura **343×20**: largo ma alto 20px — sotto il pavimento di 44px che AC 5/6 impongono a "ogni controllo" e sotto anche i 24px di WCAG 2.5.8 (AA).

**Misura** (`<scratchpad>/rv-f-misc.mjs`, build di produzione, 375×812, admin, `membership.annualFeeCents=5000`):

```json
"f4_panel": {
  "card":     { "x": 0, "y": 0, "w": 375, "h": 812 },
  "submit":   { "x": 192, "y": 750, "w": 168, "h": 44 },
  "checkbox": { "x": 16, "y": 304, "w": 20, "h": 20 },
  "labelBox": { "h": 20, "w": 343 },
  "labelWrapsCheckbox": true,
  "small": [ { "id": "membership-fee-override-checkbox", "type": "checkbox", "h": 20, "w": 20 } ]
}
```

**Perche' e' un finding e non una preferenza**: la guardia che dovrebbe proteggerlo (`mobile-membership-fee.spec.ts:98-106`) usa la soglia **19.5px**, cioe' *mezzo pixel sotto il valore ottenuto*. E' la guardia scritta sul risultato invece che sul requisito: una regressione a 20px non la fara' mai diventare rossa, e nemmeno un ritorno a 13×13 verrebbe preso da `:108` se qualcuno abbassasse quel `20`. Confronta con lo sweep dell'altro spec (`mobile-expiries-movements.spec.ts:252-269`, soglia **43.5**), che e' il criterio dell'epic.

**Rimedio suggerito** (una dichiarazione): dare alla riga label il pavimento gia' usato ovunque —
`.membership-fee-override-label{ min-height: 44px; }` dentro la media query (il checkbox puo' restare 20×20: il target diventa la riga) — e portare la soglia dello sweep a 43.5 come nell'altro spec. **In alternativa**: dichiararlo TD esplicito accanto a (k) (la ✕ a 32px di `SlideOver`) e portarlo in 15.10 — ma allora la soglia 19.5 va commentata come deliberata, non lasciata come se fosse un criterio.

---

### LOW-1 — Il tasto BACK lascia la chip strip Scadenze a mentire, e la navigazione successiva **ri-applica** la finestra abbandonata (difetto PRE-esistente del desktop, ereditato dalla scelta D1)

**Severita'**: Low (pre-esistente e misurato identico sul desktop; qui vive pero' sulla superficie dove "indietro" e' il gesto primario).

**File**: `src/app/[locale]/dashboard/expiries/scadenze-console.tsx:505-520` (chip = `<button>` → `handleFilterChange`) + `:192` (`useState(initialFilters)`, nessuna sincronizzazione con le props) + `expiries/page.tsx:118` (console montata **senza `key`**).

**Il fatto**: la deviazione **D1** del record motiva bene la scelta `<button>` invece di `Link` (senza `key` una `Link` lascerebbe `filters` indietro). Quello che la motivazione non copre e' la **navigazione all'indietro**, che nessun `onClick` intercetta: dopo un back, l'URL torna indietro ma lo stato locale no.

**Riproduzione (mobile, 375×812)** — `<scratchpad>/rv-b-chips.mjs`:

```json
"b1_urlAfterChip":            ".../expiries?window=7&expiryTypeId=X",
"b1_pressed":                 [["chip-60","false"],["chip-30","false"],["chip-7","true"],...],
"b2_urlAfterBack":            ".../expiries?expiryTypeId=X",          <-- niente window (=60)
"b2_pressedAfterBack":        [["chip-60","false"],["chip-30","false"],["chip-7","true"],...],  <-- la chip mente
"b2_urlAfterApplyPostBack":   ".../expiries?window=7&expiryTypeId=X"  <-- il back viene ANNULLATO
```

**La stessa prova sul DESKTOP (1280×800), repo intatto** — `<scratchpad>/rv-j-back.mjs`:

```json
"desktop_urlAfterBack":       ".../expiries?expiryTypeId=X",
"desktop_pressedAfterBack":   [["scadenze-window-60",""],["scadenze-window-7","on"],...],
"desktop_urlAfterNextFilter": ".../expiries?window=7"
```

⇒ **identico**: il difetto e' del `.segmented` pre-esistente, non introdotto dalla 15.7. Sui Movimenti, dove le chip sono `Link` e la console **rimonta** col `key`, il back e' corretto (`b3_currentAfterBack`: `APPROVED` `aria-current=true` dopo il back da `status=ALL`).

**Rimedio**: fuori dal mandato "desktop invariato" di questa story. Da registrare come TD (una riga: `useEffect` di sync `filters ← initialFilters`, che vale per entrambe le facce) e valutare in 15.10.

---

### LOW-2 — Le due voci del menu Esporta restano **35px** su entrambe le testate mobile (terza occorrenza della classe 15.5 F4, non dichiarata nel §7 del record)

**File**: `src/components/ui/export-menu.tsx:35-56` (le due `<a class="btn">` dentro `.popover`); le regole nuove agiscono sul **trigger** (`airops.css:2856`, `.scadenze-head > div:has(> .btn) > .btn{min-height:44px}`) ma non sulle voci del popover.

**Misura** (`<scratchpad>/rv-g-misc2.mjs`, 375×812, menu APERTO):

```json
"g1_scadenze": { "x":150,"y":486,"w":180,"h":104,"z":"20","inside":true,
  "links":[ {"t":"PDFPDF","h":35,"w":150,"inside":true,"hit":"A.btn"},
            {"t":"XLSExcel (.xlsx)","h":35,"w":150,"inside":true,"hit":"A.btn"} ] }
"g1_movements": { ... "links":[ {"t":"PDFEsporta PDF","h":35}, {"t":"XLSEsporta Excel","h":35} ] }
```

Il popover e' **dentro il viewport** e le voci sono **hit-testabili** (`hit: A.btn`), quindi l'export funziona: e' solo il pavimento dei 44px che non arriva li'. Lo sweep `SMALL_TARGETS` non lo vede perche' le voci esistono solo a menu aperto. Era gia' **F4 della review 15.5** (Minor, con decisione PO "ora o con l'export della 15.8"), e il §7 di questo record non lo elenca fra i TD subiti.

---

### LOW-3 — Sul DESKTOP l'esito dei promemoria e' ora annunciato **due volte** (toast `role="status"` + paragrafo `role="status"`): la deviazione D3 e' dichiarata, il suo costo a11y no

**File**: `src/app/[locale]/dashboard/expiries/scadenze-console.tsx:300-313` (`toast.show(...)` **oltre** a `setRemindersFeedback(...)`) + `airops.css:2879` (`.scadenze-reminders-feedback{display:none}` solo ≤640px).

**Misura** (`<scratchpad>/rv-g-misc2.mjs`, 1280×800, misurata **mentre il toast e' ancora su**):

```json
"g2": { "pText": "Promemoria inviati: 0 ai titolari, 0 agli amministratori.",
        "pDisplay": "block", "toastCount": 1,
        "toastText": ["Promemoria inviati: 0 ai titolari, 0 agli amministratori."],
        "liveSameText": 2,
        "liveRoles": ["status:Promemoria inviati: 0 ai titol", "status:Promemoria inviati: 0 ai titol"] }
```

Due live region con lo **stesso testo** ⇒ doppio annuncio per uno screen reader desktop. Il record dichiara la deviazione ("sul desktop l'azione ora produce anche un toast transitorio, che prima non c'era. Nessun cambiamento di geometria, nessuno spec lo legge") ma non il doppio annuncio. Rimedio possibile a costo zero: `aria-live="off"` sul `<p>` quando il toast e' attivo, oppure accettarlo e dirlo.

---

### LOW-4 — La guardia AC 9 (paginazione) e' **interamente condizionale**: puo' passare senza asserire nulla

**File**: `e2e/mobile-expiries-movements.spec.ts:849` e `:863` — `if ((await scadenzePagination.count()) === 1) { ... }` / `if ((await movementsPagination.count()) === 1) { ... }`.

Su un DB con meno di 21 scadenze in `window=all` o meno di 21 richieste PPR in `status=ALL`, **entrambi** i rami saltano e il test e' verde senza aver misurato nulla — esattamente la classe "asserzione vacua" della lezione 15.6 LOW-1. Nel run arbitro qui il DB era abbastanza popolato (449 scadenze, 46 PPR misurati a fine suite), ma su un DB fresco all'inizio della suite `fullyParallel` non e' garantito. Rimedio: creare le proprie fixture fino a superare la pagina, oppure `expect(count).toBe(1)` e far fallire il test se la precondizione manca.

---

### LOW-5 — Il titolo del test AC 6 promette una verifica sui popover data che il test **non esegue** (il comportamento e' pero' corretto: l'ho misurato io)

**File**: `e2e/mobile-expiries-movements.spec.ts:734` (titolo: "*...e i suoi popover data restano dentro il viewport*") vs `:759-761`, che fanno `.fill()` sui due `DateInput` — un `fill` **non apre** il calendario, quindi ne' lo z-order ne' il contenimento vengono mai misurati. AC 6 lo chiede esplicitamente ("i loro popover portalati (z 65/66) restano sopra ogni superficie nuova e interamente dentro il viewport").

**Verifica indipendente** (`<scratchpad>/rv-b-chips.mjs`, popover aperto **davvero** dal trigger calendario dentro il pannello):

```json
"b7_popover": { "found": true, "cls": "cal-popover", "x": 48, "y": 158, "w": 280, "h": 361,
                "z": "66", "vw": 375, "vh": 812, "insideViewport": true,
                "topHit": "cal-cell   |BUTTON" },
"b7_navsAfterPick": 0, "b7_fromValue": "2026-08-15", "b7_panelOpen": 1
```

⇒ il popover e' **sopra** il pannello (hit-test = la sua cella), interamente dentro il viewport, e scegliere un giorno **non naviga** (scrive solo il draft). Il comportamento e' quello che AC 6 chiede; e' la **guardia** a essere muta.

---

### LOW-6 — La guardia AC 10 enumera **25** testid dei ~45 che l'AC elenca (la proprieta' regge: l'ho verificata sull'elenco intero)

**File**: `e2e/mobile-expiries-movements.spec.ts:882-889`. Mancano dall'elenco, fra gli altri: `scadenze-stat-*`, `scadenze-page-prev/next`, `scadenze-pagination-status`, `membership-fee-*`, `my-expiries`, `my-expiry-row`, `my-expiry-status-badge`, `my-expiry-pending-badge`, `ppr-register-row`, `ppr-register-empty`, `ppr-register-filter-reset`, `ppr-register-complete-button`, `ppr-register-cancel-button`, `ppr-complete-*`, `movements-kpi-*`, `movements-pagination*`, `manual-ppr-submit`.

**Verifica indipendente** (`<scratchpad>/rv-c-geom.mjs`, 30 testid su 3 pagine, a **375 e 1280**):

```
@375  non-1: { "ppr-register-row": 19, "ppr-register-complete-button": 19, "ppr-register-cancel-button": 19 }
@1280 non-1: { "ppr-register-row": 19, "ppr-register-complete-button": 19, "ppr-register-cancel-button": 19 }
```

Gli unici "non 1" sono per-riga (19 righe in pagina), che e' la molteplicita' legittima. **Nessun duplicato desktop/mobile.** Il finding e' sulla copertura della guardia, non sull'implementazione.

---

### LOW-7 — Le opzioni del typeahead persone nel pannello quota misurano **36px**, e non sono dichiarate fra i TD

**Misura** (`<scratchpad>/rv-f-misc.mjs`, pannello quota a 375px, combobox aperto):

```json
"f4_typeahead": { "found": true, "z": "66", "pos": "fixed", "x": 16, "y": 162, "w": 343, "h": 240,
                  "inside": true, "optionH": 36, "optionHit": "LI.combo-option active", "optionCount": 50 }
```

Lo z-order e il contenimento sono **corretti** (z66 sopra il `.mini-modal` z60, dentro il viewport, opzione hit-testabile): quello che resta sotto il pavimento e' l'altezza della riga-opzione, dentro la primitiva condivisa `SearchCombobox`. Stessa classe del TD **(k)** dichiarato dal dev per la ✕ a 32px di `SlideOver` — merita la stessa riga nel §7.

---

## 2. Verifiche superate (con i numeri, non con un giudizio)

### 2.1 La chiusura contabile dal telefono — esercitata dal vivo e letta in DB

`<scratchpad>/rv-a-closure.mjs` (build di produzione, 375×812, admin) + `psql`.

| # | scenario | esito UI | esito DB |
|---|---|---|---|
| A1 | chiusura con tassa 37,50 dallo sheet | prefill non vuoto, metodo `CASH`, focus sul campo tassa, toast "PPR completato.", sheet chiuso, riga → `Partito` con `37,50 €` | **1** `CashMovement` `PPR PPR-2026-0031 landing fee`, 3750, categoria **PPR**, `CASH` |
| A2 | 409: un altro operatore chiude mentre lo sheet e' aperto (POST reale, 200) | toast **"Questo PPR non è più in stato Approvato (probabilmente già chiuso da un altro operatore)."** — mai il generico | 1 solo movimento (1234, quello dell'altro operatore) |
| A3 | 500 sulla prima submit, poi retry | seconda submit riuscita | `a3_keysDistinct: 2` ⇒ **`Idempotency-Key` rigenerata dopo la risposta**; 1 solo movimento (1000) |
| A4 | **race**: due POST `complete` paralleli, chiavi diverse | — | `[200, 409]`, **1 solo** movimento (5000) |
| A5 | stessa chiave due volte | — | `[200, 200]` (replay), **1 solo** movimento (2500) |
| A6 | annullo come secondo `secondStep` (target 167×44 e 167×44) | toast "PPR annullato.", riga → `Annullato` | **nessun** movimento per quel PPR |

```
$ docker exec airmanager-postgres-1 psql -U airmanager -d airmanager -c "..."
          description          | amountCents | category | paymentMethod |  status   | landingFeeCents
-------------------------------+-------------+----------+---------------+-----------+-----------------
 PPR PPR-2026-0031 landing fee |        3750 | PPR      | CASH          | COMPLETED |            3750
 PPR PPR-2026-0032 landing fee |        1234 | PPR      | CASH          | COMPLETED |            1234
 PPR PPR-2026-0033 landing fee |        1000 | PPR      | CASH          | COMPLETED |            1000
 PPR PPR-2026-0034 landing fee |        5000 | PPR      | CASH          | COMPLETED |            5000
 PPR PPR-2026-0035 landing fee |        2500 | PPR      | CASH          | COMPLETED |            2500
(5 rows)   <-- una riga per PPR, mai due; PPR-2026-0036 (annullato) assente
```

Geometria del `secondStep` a 375px: fee **341×44**, metodo **341×44**, submit **167×54** a `y 733` (dentro il viewport), `pageOverflow 0` ⇒ il difetto §a.4-2 (pannello che si apriva 483px a sinistra del dito) **non si riproduce**.

**A 320×568** (`<scratchpad>/rv-h-320.mjs`) la chiusura resta praticabile: fee 44 / metodo 44 / submit 54 tutti **visibili e hit-testabili** (`hit: self`), toast "PPR completato."; lo sheet di dettaglio (11 righe) e' `overflow-y: auto` con scroll interno (655 > 452), quindi "Chiudi" e' raggiungibile scorrendo il pannello.

**Riga-pannello desktop invariata** (1280×900): `ppr-complete-form` padding `14px 18px`, `display:flex`, `gap:10px`; `.ppr-complete-field` `max-width: 200px`; fee 200×36.84, metodo 200×36, submit 174.42×34.84, chiudi 67.98×34.84; conferma inline di annullo **68×25 / 32×25** (invariata, come R-15.7-d prescrive).

### 2.2 Le guardie discriminanti — riprovate DA ME per iniezione sul repo intatto

`<scratchpad>/rv-i-disc.mjs` (375×812, `addStyleTag` che simula il pre-fix):

| guardia | post | pre-fix simulato | rossa? |
|---|---|---|---|
| testata Scadenze ≤ 261.5 | `head 175 + strip 64 = 239` | **287.69 + 0** | ✅ |
| testata Movimenti ≤ 142.98 + CTA ≥44 | `69 + 64 = 133`, CTA **319×44** | **196.14 + 0**, CTA **127×35** | ✅ |
| ellissi su ogni testo che eccede | `[]` | `["mobile-row-name","mobile-row-sub"]` | ✅ |
| contenimento dei figli nella card | `[]` | `["mobile-row-side","badge bad","b-dot"]` | ✅ |
| `display:none` dei due alberi | `desktopBody none / mobile block` | `flex / none` | ✅ |

### 2.3 Il nome accessibile dello sheet col `pprNumber` NULLO — fixture reali, non simulazioni

`<scratchpad>/rv-e-actors.mjs`, transito **PENDING** (pprNumber `null`, `etd` assente) e transito **REJECTED** (pprNumber `null` per sempre):

```json
"e1_pending":  { "name": "Piper PA-28 — I-NULNJT",  "actions": [] }
"e1_rejected": { "name": "Robin DR400 — I-REJYCM", "actions": [] }
"e1_nameWellFormed": { "pending": true, "rejected": true }
```

Nessun segnaposto, nessun separatore doppio, nessun `PPR-` inventato; **zero azioni** su righe non `APPROVED` (gate §a.4-1 intatto). Parita' dello sheet enumerata: Rotta, Richiedente, Email, Telefono, ETA, Partenza (`—`), Persone a bordo, Tassa (`—`), Note, **Origine richiesta = Modulo web**, e **Motivo rifiuto** solo sul REJECTED.

### 2.4 Le tre superfici per ruolo (AC 14) — 4 attori × 2 larghezze

`<scratchpad>/rv-e-actors.mjs`, `clearCookies()` fra un'identita' e l'altra:

| attore | faccia | righe self (desktop/mobile) | empty (desktop/mobile) | switch `display` @375 / @1280 | promemoria / quota | `/movements` |
|---|---|---|---|---|---|---|
| pilota | self | 9 / 9 | 0 / 0 | `none`+`block` / `flex`+`none` | 0 / 0 | → `/it/dashboard` |
| allievo | self | 0 / 0 | **1 / 1** | `none`+`block` / `block`+`none` | 0 / 0 | → `/it/dashboard` |
| istruttore | self | 0 / 0 | **1 / 1** | `none`+`block` / `block`+`none` | 0 / 0 | → `/it/dashboard` |
| admin | registry | — | — | — | 1 / 1 | resta su `/movements` |

Empty state self con **testid proprio** su entrambi gli alberi (`my-expiries-empty`, `mobile-my-expiries-empty`), **un nodo ciascuno**. Card self: `aria-label` = "Apri dettaglio scadenza: TipoSelf … · 19/08/2026", sheet = "19/08/2026 — TipoSelf …" con righe Scadenza/Stato/Note (parita' con le 4 colonne desktop). Nessun utente **multi-ruolo** esiste sul DB (`select count(*) from "User" where array_length(roles,1) > 1` → **0**) e la faccia e' decisa da un solo booleano lato server (`expiries.manage` vs `self.read`), quindi il caso non aggiunge rischio.

### 2.5 Contrasti — enumerati esemplare per esemplare, nei DUE temi (cookie `am-theme`, non `prefers-color-scheme`)

`<scratchpad>/rv-d-contrast.mjs` (canvas → WCAG, sfondo effettivo risalendo gli antenati). **Tutti e 5 i tier** della scadenza e **tutti e 7** gli stati del transito, con fixture dedicate:

| oggetto | chiaro | scuro |
|---|---|---|
| `.mobile-row-name` | 18.79 | 15.74 |
| `.mobile-row-sub` / `.mobile-row-model` | **4.85** | **5.72** |
| `.mobile-row-tail` (chip marche) | 17.01 | 17.67 |
| Badge scadenza: Scaduto / ≤7 / ≤30 / ≤60 / Valido | 8.38 / 8.38 / 11.32 / 8.46 / 9.05 | 7.46 / 7.46 / 9.28 / 8.79 / 10.63 |
| pallino dei Badge (tutti, **6×6 dipinto**) | = badge | = badge |
| Badge transito: In attesa / Atteso / Al suolo / Rifiutato / Partito / Annullato / In arrivo | 11.32 / 11.32 / 9.31 / 8.38 / 9.05 / 9.05 / 8.46 | 9.28 / 9.28 / 9.57 / 7.46 / 10.63 / 10.63 / 8.79 |
| chip strip (inattiva / attiva) | 18.79 / 17.99 | 15.74 / 17 |
| sheet: sub / titolo / chiave / valore / azione / chiudi | 4.85 / 18.79 / 4.85 / 18.79 / 17.99 / 9.99 | 5.72 / 15.74 / 5.72 / 15.74 / 17 / 9.47 |
| pannello Filtri: titolo / label / input / applica / azzera / ✕ | 18.79 / 4.85 / 17.79 / 17.99 / 18.79 / 9.99 | 15.74 / 5.72 / 14.77 / 17 / 15.74 / 9.47 |

**Minimo assoluto 4.85 (chiaro) / 5.72 (scuro)**, nessun testo sotto 4.5, nessun oggetto grafico sotto 3. La card mobile **non eredita** la coppia difettosa del desktop (3.38:1 `--bad` su `--bad-soft`): i giorni vivono nel sub a `--ink-3` e il pill e' il `Badge` a 5 tier. Il pallino e' **dipinto** (6×6) su tutti i badge di card: la regressione 15.6 MINOR-2 non e' stata reintrodotta.

### 2.6 Desktop invariato — misurato a 1280 / 800 / 641 su entrambe le pagine

`<scratchpad>/rv-c-geom.mjs`. Coincide con la tabella §4 del record:

```
.app grid-template-columns   232px 1048px | 64px 736px | 64px 577px
Scadenze .card-head          106.84 @1280 | 148.23 @641           (148.23 @800 col mio tipo-fixture lungo: e' la
                                                                   sensibilita' ai DATI della correzione C2, riprodotta)
Scadenze .students cw/sw     990/990 | 678/868 | 519/868
Scadenze .kpi-row card       239 | 161 | 121.25   (display: grid)
.segmented                   259.53×33.39, bottoni 48.94×27.39 (identico alle tre larghezze)
.search                      190×34.13, cw 188 / sw 190 (TD (e) invariato)
Movimenti .card-head         67.84 | 110.69 | 114.69
Movimenti .students cw/sw    990/990 | 678/800 | 519/800
log-arrival-button           127.11×34.84 (invariato)
.page-head                   51.44 ovunque; pageOverflow 0; tab bar display:none
alberi mobile                display: none a tutte e tre le larghezze
```

Il diff CSS e' **puramente additivo** (`git show 519a269 -- src/styles/airops.css | grep -c "^-"` → 1, cioe' la sola riga di header del diff): nessun token cambia valore, **nessun literal di colore nuovo** (grep su `#hex|rgb(|hsl(|oklch(` nelle righe aggiunte → 0). Le 8 dichiarazioni fuori-query replicano *alla lettera* gli inline sostituiti (verificato riga per riga) e le due classi 15.3/15.5 riusate (`kpi-row-grid` `airops.css:2083`, `registry-pagination` `:2491`) vivono **dentro** `@media (max-width:640px)`, quindi non toccano il desktop.

### 2.7 Geometria mobile a 320 / 375 / 390 (tre superfici)

```
scadenze@320  head 184.69 + strip 64 = 248.69 (pre-fix 304.34)   clipped [] outside [] small [] overflow 0
scadenze@375  head 175    + strip 64 = 239    (pre-fix 261.50)   clipped [] outside [] small [] overflow 0
scadenze@390  idem
movements@320/375/390  head 69 + strip 64 = 133 (pre-fix 142.98/229.83)  clipped [] outside [] small [] overflow 0
"Le mie scadenze" @375 (pilota)  small [] clipped [] overflow 0
```

KPI: Scadenze **grid 2×2** (`154.5px 154.5px`, h 199) come R-15.7-h; Movimenti **strip** (`flex`, cw 375 / sw 687, h 77) come R-15.3-c. Sub-line del transito ellissata a 320px su ogni riga (`textOverflow: ellipsis`, chip marche e tipo dentro il rect della card).

### 2.8 Export (R-15.7-k(1)) — non solo l'href: il **contenuto** del file

`<scratchpad>/rv-f-misc.mjs`, con `window=7` + `expiryTypeId` + `personQuery` attivi (2 scadenze dello stesso tipo, una a 3 giorni e una a 200):

```json
"f1_hrefs": [ "/api/v1/expiries/pdf?window=7&expiryTypeId=…&personQuery=ExpVicina-…&locale=it",
              "/api/v1/expiries?window=7&expiryTypeId=…&personQuery=ExpVicina-…&format=xlsx&locale=it" ],
"f1_rowsOnScreen": 1, "f1_xlsStatus": 200, "f1_pdfStatus": 200
```

Contenuto reale dell'`.xlsx` scaricato (`sharedStrings.xml`): `['ExpVicina-… Export', 'TipoExp …']` — **`has Vicina: True | has Lontana: False`**. Il file dice quello che dice lo schermo: il TD (b) e' **davvero chiuso**, non solo negli href. `listAllExpiriesQuerySchema` accetta gia' `window`/`personQuery` (`schemas/expiries.ts:146-148`) e la stessa query alimenta xlsx e PDF (`api/v1/expiries/route.ts`, `api/v1/expiries/pdf/route.ts`).

### 2.9 Altro verificato

- **Tastiera**: card transito raggiunta con Tab reali e aperta con Enter (`g4_openedByKeyboard: 1`), focus sul pannello (`mobile-sheet-panel`), Escape chiude e **restituisce il focus al trigger** (`ppr-register-row-mobile`). Un solo nodo di sheet (`g5_sheetNodes: 1`).
- **i18n**: zero chiavi orfane in tutto il file; `ExpiriesPage` 91/91 e `MovementsPage` 95/95 con `diff: []`.
- **Nessuna dipendenza nuova** (`package.json` fuori dal diff); `ManualPprForm` **non toccato** (fuori dal diff) e `ppr-queue.spec.ts` verde nell'arbitro.
- **Blast radius 1-10**: le 5 asserzioni page-level di `movements.spec.ts` e la sesta di `expiry-dashboard.spec.ts:182` sono state scopate alla RIGA (riscrittura al valore corretto, non indebolimento); `expiry-dashboard.spec.ts:135` puo' restare page-level perche' la stringa mobile e' nuova ("Nessuna scadenza in questa finestra." vs "Nulla in questa finestra."), e lo spec nuovo asserisce `toHaveCount(1)` su quella desktop.
- **AC 10 "parziale"**: la clausola "`getByText(<marche>)` al piu' 1 nodo a 1280" e' effettivamente **irrealizzabile** con lo switch CSS-only (i due alberi coesistono nel DOM). La proprieta' sostitutiva ("1 per albero, 2 in totale") e' quella giusta e la cura prescritta dal blast radius e' stata applicata. **Concordo con la dichiarazione del dev.**
- **`sprint-status.yaml` e `HANDOFF.md` non aggiornati** dal dev: corretto, li aggiorna il commit di chiusura (l'ultimo tocco e' `ed76466`, 15.6).
- **TD (l)** verificato in DB (`membership.annualFeeCents = 0` dopo la suite); **TD (m)** verificato leggendo `gotoMovementsFor` (filtro stato + giorno-Roma + ultima pagina del bucket).

---

## 3. Osservazioni (nessuna azione obbligatoria)

1. **La prima card della Scadenze e' scesa, non salita**: `firstCardTop` **609** su 812 (75%) contro i **567** (70%) del pre-fix, perche' la KPI 2×2 costa +97.7px contro i -22.5px guadagnati dalla testata. Il dev lo dichiara con onesta' e ⟨Q8⟩ lo aveva preventivato ("≈ +90px"), ma vale la pena ricordare che il difetto di apertura della story ("prima riga al 70% dello schermo") **e' peggiorato** sulla Scadenze, mentre sui Movimenti e' migliorato (512 → 445). Materiale per il PO, non un finding.
2. **La sub-line del transito taglia l'ETA per prima** a 320px (`rotta · richiedente · ETA`, ellissi corretta): su un campo, l'ora stimata e' spesso il dato piu' operativo. Il template mette la rotta per prima, quindi e' fedelta' alla fonte; se il PO preferisce, l'ordine e' una riga in `transitCardSubLine`.
3. Le due chip strip usano semantiche diverse (`aria-pressed` sui `<button>` Scadenze, `aria-current` sulle `Link` Movimenti). E' **corretto** per i due tipi di elemento, ma va saputo quando qualcuno scrivera' una guardia comune.

---

## 4. Decisioni da sottoporre al PO

1. **MINOR-1 (checkbox "Forza addebito" a 20px)**: si porta la riga label a 44px adesso (una dichiarazione CSS + soglia dello sweep a 43.5), oppure si dichiara TD accanto a (k) e si rimanda a 15.10?
2. **LOW-2 (voci del menu Esporta a 35px)**: e' la **terza** story in cui ricompare (15.5 F4 → decisione PO gia' chiesta). Si fissa ora il pavimento sulle voci del `.popover` o si aspetta il redesign dell'`ExportMenu` in 15.8?
3. **Osservazione 1 (prima card a 609px)**: si conferma la KPI 2×2 sulla Scadenze (ratificata in R-15.7-h) o si valuta di spostarla/collassarla per far salire la lista?
4. **LOW-1 (back button che non sincronizza i filtri)**: TD nuovo con il fix a una riga (`useEffect` di sync `filters ← initialFilters` sulle console senza `key`) da fare in 15.10, o si accetta com'e' (e' cosi' dal 13.5 sul desktop)?
5. **LOW-3 (doppio annuncio sul desktop)**: si tiene il toast anche sul desktop (deviazione D3) o lo si limita a ≤640px con un `aria-live="off"` sul paragrafo?

---

## 5. Stato dell'ambiente al termine della review

- **DB**: `airmanager` su `localhost:5432`, **sporco per costruzione** (il run arbitro + le mie sonde). Ho creato: ~8 richieste PPR (di cui 5 chiuse con tassa, 1 annullata, 2 PENDING/REJECTED), ~10 persone e 5 tipi di scadenza run-unique, 1 persona con doppio profilo (pilota+istruttore). **Nessun attore di seed mutato.**
- **Impostazioni globali toccate e RIPRISTINATE**: `membership.annualFeeCents` portato a 5000 per la sonda del pannello quota e **riportato a 0** nello stesso script (`f4_restored: {"annualFeeCents": 0}`, riverificato in psql). `ppr.landingFeeCents` = 1250, lasciato dalla suite (`movements.spec.ts:269`, TD (h) noto), non toccato da me.
- **Porta 3000**: **libera** (`PORT_3000_FREE`) — il server di produzione avviato per le sonde e' stato ucciso (lezione della review 15.6, che lo aveva lasciato acceso).
- **Log dell'arbitro** copiato in `<scratchpad>/rv-arbiter-full-suite.log` prima di ogni run successivo. Tutti gli script di sonda sono `<scratchpad>/rv-*.mjs` (throwaway, **non committati**, nessun `playwright install`).

