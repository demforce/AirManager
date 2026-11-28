# Review adversariale — Story 15.6 "Registro voli mobile"

- **Reviewer**: subagent adversarial (Opus 5 xhigh), 2026-08-04, macchina locale Fedora dell'utente.
- **Oggetto**: `_bmad-output/implementation-artifacts/15-6-registro-voli-mobile.md` (ratifiche R-15.6-a..i, AC 1-13, Dev Agent Record), commit `2850ede` (feat) + `a880f01` (record) su `dev`.
- **Verdetto**: **SHIPPABLE-WITH-FIXES** — 0 Major, **2 Minor**, **5 Low**. La suite completa passa da arbitro su DB fresco, i comportamenti di dominio 14.3/14.4 sono stati riprodotti dal vivo e NON regrediscono, il desktop e' invariato alle tre larghezze, i contrasti reggono nei due temi. I due Minor sono un difetto visivo con una **misura falsa nel record** e una **corsa fra il debounce della ricerca e il pannello Filtri** che riproduce esattamente il fallimento che AD-4 dichiarava inaccettabile.

---

## 0. Priorita' zero — arbitro: suite completa su DB fresco

Lanciata PRIMA di qualunque altra cosa, DB appena resettato dalla sessione principale, `CI=1`, build di produzione, `scripts/e2e.sh start`, esito letto SOLO da `scripts/e2e.sh status`.

```
$ set -a && . ./.env && set +a && export JOBS_SECRET=review-15-6-arbiter
$ CI=1 scripts/e2e.sh start
STARTED (pid 1034733) — log: /tmp/airmanager-e2e/last-run.log
$ scripts/e2e.sh status 25
state: DONE — E2E_EXIT=0
--- summary ---
  377 passed (10.5m)
=== e2e end: 2026-08-04T12:59:06+02:00 ===
E2E_EXIT=0
```

**377 passed, 0 failed, 0 flaky, exit 0** — verbatim. `grep -c "✓"` sul log: 377. Coincide con la dichiarazione del dev (§12: 377 = 353 baseline 15.5 + 24 nuovi). Catena serializzata (`settings → booking-window → treasury-settings → billing-global` + `mobile-metar` + `mobile-overview-overflow`) inclusa e verde. **Nemmeno la flake nota del login e' comparsa.** Log copiato in `<scratchpad>/arbiter-full-suite.log` prima di qualunque run successivo.

Gate di progetto rieseguito da me dopo le sonde:

```
$ npm run gates
PASS  lint (19s)
PASS  typecheck (3s)
PASS  test (7s) — Tests  1705 passed (1705)
PASS  build (29s)
```

---

## 1. Findings

### MINOR-1 — Il pannello "Filtri" si chiude da solo se il debounce della ricerca e' ancora pendente (il fallimento che AD-4 dichiarava inaccettabile, per un'altra porta)

**Severita'**: Minor (interazione; nessuna perdita di dato, ma il tap va perso e un eventuale draft con lui).

**File**: `src/app/[locale]/dashboard/logbook/logbook-console.tsx:305-312` (`debouncedPersonQuery`, 400 ms → `handleFilterChange` → `navigate`) + `:684` (`onClick={() => setFilterDraft(filters)}`), contro `page.tsx:237` (`key={JSON.stringify({page, ...exportFilters})}` — ogni navigazione RIMONTA la console e con lei `filterDraft`).

**Il fatto**: AD-4 e il commento a `:244-248` motivano l'intero pannello proprio con «un pannello che navigasse a ogni `onChange` si richiuderebbe da solo sotto il pollice». La navigazione, pero', non arriva solo dai controlli del pannello: la **ricerca persona** resta in testata col suo debounce di 400 ms, e quel timer sopravvive al tap su "Filtri". Chi digita un cognome e tocca subito "Filtri" vede il pannello aprirsi e sparire ~400 ms dopo.

**Riproduzione (misurata, build di produzione, 375x812, admin)** — `<scratchpad>/p5-domain.mjs`:

```js
await page.getByTestId('flight-filter-person').fill('Volo');
await page.getByTestId('mobile-flight-filters-button').click();
const rightAfterOpen = await page.locator('.slideover.open').count();  // 1
await page.waitForTimeout(1200);
// dopo il debounce:
```
```json
"panelAfterDebounce": {
  "rightAfterOpen": 1,
  "after1200ms": 0,
  "url": "http://localhost:3000/it/dashboard/logbook?personQuery=Volo"
}
```

Il pannello e' aperto (1) e 1200 ms dopo non esiste piu' (0), perche' il debounce ha navigato e il `key` ha rimontato la console.

**Rimedio suggerito (2 righe, chirurgico)**: al click del trigger, annullare/flushare il timer pendente e seminare il draft con `personQueryInput` invece che con `filters.personQuery` — cioe' esporre un `cancel()` dal `useDebouncedCallback` (o applicare subito la query) prima di `setFilterDraft`. In alternativa, dichiararlo TD con la misura qui sopra.

---

### MINOR-2 — Il pallino del `Badge` di anomalia NON viene dipinto sulla card, e il record ne riporta il contrasto come se lo fosse

**Severita'**: Minor (visivo + **misura falsa nel Dev Agent Record**; nessuna informazione persa: la parola nel pill resta).

**File**: `src/styles/airops.css:2616-2622` (`.mobile-row-flag .badge{ display: block; … }`, story **15.5**, il cui commento a `:2611-2615` dice testualmente *«The chip carries no dot here, so nothing needs flex layout»*) usato da `logbook-console.tsx:895` con `statusChip()` (`:393-409`) che passa **`<Badge tone="bad" dot>` / `<Badge tone="warn" dot>`**. Con `display: block` il `.b-dot` (`airops.css:714`, `width/height: 6px`) torna un elemento **inline**, e su un inline `width`/`height` non si applicano: larghezza **0**.

**Misura (build di produzione, 375x812, stesso volo, stesso `Badge`)** — `<scratchpad>/p8-dot.mjs`:

```json
{
 "card":    { "display": "inline", "w": 0, "h": 13, "badgeDisplay": "block" },
 "sheet":   { "display": "block",  "w": 6, "h": 6,  "badgeDisplay": "flex" },
 "desktop": { "display": "block",  "w": 6, "h": 6,  "badgeDisplay": "inline-flex" }
}
```

Cioe': lo **stesso** badge "Deroga"/"Annullato" ha il pallino nello **sheet** e sulla **riga desktop**, e non ce l'ha sulla **card mobile** — la superficie nuova di questa story. Confermato anche a occhio nello screenshot `<scratchpad>/shot-list-light-375.png` (pill "Deroga" senza pallino) contro `<scratchpad>/shot-sheet-step2-dark.png` (pill "Deroga" col pallino).

**Perche' e' un finding e non una preferenza**: il Dev Agent Record §5 (riga 568) elenca fra i contrasti misurati

> `pallino di Badge.bad / .warn (oggetto grafico, contro il proprio pill) | 8.38 / 11.32 | 7.46 / 9.28 | 3.0`

cioe' **misura un oggetto grafico che su quella superficie non viene dipinto** (i valori 8.38/11.32 sono il rapporto del TESTO, non del pallino). E' la stessa classe di claim che la 15.4 ha pagato con un pallino a 1.76:1 e la 15.3 con un glifo a 1.24:1, rovesciata. La mia misura del pallino **dove esiste** (sheet), fusa con la sua `opacity: 0.7` contro il proprio pill: **4.81 (chiaro) / 5.40 (scuro)** — sopra il 3:1, quindi il difetto e' solo l'assenza, non il contrasto.

**Rimedio suggerito**: una dichiarazione nel blocco 15.6 — `.mobile-row-flight > .mobile-row-flag .badge .b-dot{ display: inline-block; }` (no-op per il consumer 15.5, che non passa `dot`) — **oppure** togliere `dot` dai due `Badge` della card e correggere la riga 568 del record. Serve una decisione, non entrambe.

---

### LOW-1 — L'estensione a `flight-log.spec.ts` e' VACUA: non discrimina nulla

**File**: `e2e/flight-log.spec.ts:238-240` (tre `toHaveCount(0)` su `flight-cancel-action-mobile`, `flight-correct-action-mobile`, `flight-filter-aircraft-mobile`), presentata al §9 del record come «**esteso**, mai indebolito» del blast-radius 2.

**Il fatto**: quei tre nodi esistono **solo** mentre lo sheet (o il pannello) e' aperto — `logbook-console.tsx:1105` (`{sheetFlight ? <BottomSheet …/> : null}`) e `:1004` (`{filterDraft !== null ? <SlideOver …/> : null}`). Il test non apre ne' l'uno ne' l'altro, quindi l'asserzione e' verde **per chiunque**.

**Prova** — `<scratchpad>/p11-vacuous.mjs`, attore **ADMIN** (`flights.manage` pieno), sheet e pannello chiusi:

```json
{"actor":"ADMIN (flights.manage), sheet closed, panel closed",
 "counts":{"flight-cancel-action-mobile":0,"flight-correct-action-mobile":0,"flight-filter-aircraft-mobile":0,
           "flight-cancel-action":18,"flight-correct-action":18,"flight-filter-aircraft":1}}
```

Non indebolisce nulla (i nomi desktop 18/18/1 restano le asserzioni vere), ma **non aggiunge la copertura che il record le attribuisce**. La guardia di masking reale e' in `e2e/mobile-logbook.spec.ts:1123-1127`, che lo sheet lo apre davvero (`.bottom-sheet-actions` count 0 + `not.toContainText('Fixture e2e 15.6')`).

---

### LOW-2 — AC 12 e AC 9: il record dichiara piu' copertura di quella che gli e2e hanno

- **AC 12** chiede «ADMIN, PILOTA, ALLIEVO, ISTRUTTORE a **375 e 1280px**». Lo spec ha due test non-admin: `mobile-logbook.spec.ts:1084` (pilota) e `:1136` (istruttore), **entrambi solo a 375px**, e **nessun test ALLIEVO**. Il record (§2, riga 521) scrive «ADMIN / PILOTA / ALLIEVO / ISTRUTTORE a 375 **e** 1280 con `clearCookies`».
- **AC 9**: il test di geometria (`mobile-logbook.spec.ts:945`) fa `login(page, ADMIN_EMAIL)` e itera i **viewport**, non gli attori; il record (riga 518) scrive «a 320/375/390 e per admin **e** pilota».

**Ho chiuso io il buco** (`<scratchpad>/p10-selfservice.mjs`, volo SCUOLA forzato con `forceReason: "Motivo riservato <TAG>"` intestato alla persona dell'utente `student@airmanager.local` con CFI la persona di `instructor@airmanager.local`), e **non c'e' niente di rotto**:

```json
"allievo@375":  {"rowsMobile":1,"ariaLabel":"Apri dettaglio volo: I-S6SLF… · 01/08/2020 · Allieva Sara",
                 "leaksForceReason":false,"adminControls":["flight-filter-aircraft:0","flight-filter-person:0",
                 "logbook-new-button:0","flight-cancel-action:0","flight-correct-action:0"],
                 "sheet":{"actions":0,"badge":"Deroga","leaksForceReason":false,"rowKeys":[14 righe],
                          "label":"01/08/2020 · I-S6SLF… · Scuola — Alfa→Beta"}}
"allievo@1280": {"rowsMobile":1, … stessa masking …}
"istruttore@375": {"firstCard":"I-S6SLF… | Allieva Sara | 01/08/2020 · Alfa→Beta · Scuola · CFI Istruttrice Ines | 1:30 | 225,00 € | Deroga",
                   "sheet":{"actions":0,"leaksForceReason":false}}
"istruttore@1280": { … idem … }
```

Cioe': l'allievo vede il proprio volo, 0 azioni, **zero** `forceReason`, badge "Deroga" presente (parita' col desktop: il server maschera il motivo, non il fatto); l'istruttore-come-CFI vede **l'allievo** sul titolo della card e **se stesso** nel sub. Resta un **buco di regressione** (nessun e2e lo tiene fermo), non un difetto di prodotto.

---

### LOW-3 — La guardia (vii) e' discriminante: la dichiarazione «non iniettabile» e' troppo pessimista

Il record §4 riga 548 dichiara la guardia dell'empty state «**non iniettabile**: il difetto sarebbe un secondo nodo, che nessuna regola CSS puo' creare». Vero per il CSS, **falso in generale**: un'iniezione DOM la fa rossa. `<scratchpad>/p12-guard7.mjs`:

```json
{"before":{"mobile":1,"desktop":1},
 "after": {"mobile":2,"desktop":1},   // dopo n.parentElement.appendChild(n.cloneNode(true))
 "guardWouldFail": true}
```

Poiche' l'asserzione e' `toHaveCount(1)` (non `toBeVisible()`), il secondo nodo la fa fallire. La guardia e' quindi **piu' forte** di come e' dichiarata. Nessuna azione sul codice; va corretta la riga del record.

Al contrario, **la (v) sul contenimento la confermo NON discriminante coi dati reali**: ho costruito il caso peggiore legale (marche di **20 caratteri** `I-ABCDEFGHIJKLMNOP`, pilota "Dellavedova… Massimiliano Ferdinando", CFI "Montecchiari… Bartolomeo Alessandro", tratta di 36 caratteri, importo 10.472,52 €, badge "Deroga") e a **320px e 375px, chiaro e scuro**, non sfonda nulla (`<scratchpad>/p7-visual.mjs`):

```json
"light@320": {"rowW":262,"bad":[],"clipped":[],"tail":126,"badgeDisplay":"block"}
"dark@320":  {"rowW":262,"bad":[],"clipped":[],"tail":126}
```

La dichiarazione del dev regge: la guardia resta di regressione, col predicato provato non vacuo.

---

### LOW-4 — La motivazione di C1 sull'`Idempotency-Key` e' imprecisa (il comportamento e' giusto)

Il record C1 (riga 492) e' **corretto nella sostanza**: la ricognizione sbagliava, la chiave si rigenera dopo OGNI risposta HTTP (`flight-editor.tsx:565` e `:667`, contratto scritto in `src/lib/use-idempotency-key.ts`). L'ho verificato **sul filo**:

```json
"keys": ["611e3583-7234-448e-82af-343ff22ca92a", "127787c8-7017-4e90-a1e3-718928c79419"]   // 422 poi 201, DIVERSE
```

La *motivazione* pero' («il tentativo rifiutato possiede gia' la vecchia chiave lato server, riusarla rischierebbe di **rigiocare il rifiuto**») non e' quello che fa il server: un tentativo fallito **libera** la chiave (TD-2 AC 4, `e2e/idempotency.spec.ts:165` — *"a failed attempt frees the key immediately"*). Prova in DB:

```
$ psql … -c "SELECT key, endpoint, \"responseStatus\" FROM \"IdempotencyRecord\" WHERE key IN ('611e…','1277…');"
                 key                  |    endpoint     | responseStatus | done
 127787c8-7017-4e90-a1e3-718928c79419 | flight-register |            201 | t
(1 row)   ← della chiave del 422 non resta traccia
```

Nessuna azione sul codice: rigenerare resta il contratto documentato. Va corretta la frase.

---

### LOW-5 — Consegna incompleta: `sprint-status.yaml` e i TD nuovi

- `_bmad-output/implementation-artifacts/sprint-status.yaml:372` dice ancora `15-6-registro-voli-mobile: **backlog**`, e la riga `last_updated` (35) e' ferma a «Prossima: 15.6».
- I **due TD nuovi** dichiarati dal record §10 non sono in `action_items`: **(g)** `.search` largo 190px con `cw 188 / sw 190` sul desktop del registro (l'ho **riconfermato**: `"searchScroll": "188/190"` identico a 641/800/1280 — pre-esistente, guidato dalla larghezza, fuori mandato) e **(h)** `.so-sub` di `SlideOver` a `--ink-4` (**misurato da me: 3.66 in tema chiaro** contro il 4.5 richiesto al testo — la primitiva serve ogni pannello dell'app, e' 15.10).
- Manca in `action_items` anche **la faccia NUOVA del TD (a)** trovata dal dev facendo rossa la suite: `OPTIONS_PAGE_SIZE = 100` governa anche `personOptions`, e in **correzione** l'hint `studentOnlyCorrectionHint` (affordance 14.3) non compare per una persona fuori dalla prima pagina di 100. La ratifica R-15.6-g copriva il filtro **Velivolo**, non questa.
- `docs/handoffs/HANDOFF.md` non aggiornato (per convenzione va nel `docs(15.6)` di chiusura, insieme allo sprint-status).

---

## 2. Verifiche empiriche superate (cosa NON e' rotto, con le misure)

### 2.1 Testata mobile — la misura chiave della story, rifatta da me

`<scratchpad>/p1-geometry.mjs`, build di produzione, admin, **`.logbook-head` + `.mobile-chip-strip`** (il confronto onesto della deviazione n.1: la sola `.card-head` sarebbe 175):

| caso | testata | chips | totale | pre-fix | esito |
|---|---|---|---|---|---|
| IT 375 | 175 | 64 | **239** | 266 | ✓ |
| EN 375 | 175 | 64 | **239** | 266 | ✓ |
| IT 375 **con 3 filtri attivi** | 175 | 64 | **239** | 309 | ✓ |
| IT/EN 320 | 175 | 64 | **239** | 351 | ✓ |
| IT/EN 390 | 175 | 64 | **239** | 266 | ✓ |

Target ad **ogni** larghezza e in **entrambi** i locale: ricerca (wrapper 46, input 44), `mobile-flight-filters-button` **44**, Esporta **44**, "Nuova voce" **44**, le tre chip **44**. `pageOverflow: 0` ovunque. La testata **non cresce piu'** quando un filtro e' attivo (il bottone "Azzera" e' migrato nel pannello): e' il guadagno che la 15.5 non aveva.

Nota onesta di contesto: la prima card resta a `top` **487** su 812 (60%, contro il 68% pre-fix) e su un **320x568** a 487 su 568 (86%) — il resto e' `page-head` + KPI strip, fuori dal mandato di questa story. Il criterio ratificato (testata ≤ pre-fix con target ≥44) e' rispettato con margine.

### 2.2 Desktop e fascia tablet — invarianti, contro le baseline dell'AC 11

`<scratchpad>/p2-desktop.mjs`, valori misurati contro quelli scritti nell'AC 11:

| | 641 | 800 | 1280 |
|---|---|---|---|
| `.app` grid | `64px 577px` ✓ | `64px 736px` ✓ | `232px 1048px` ✓ |
| `.card-head` | 152 ✓ | 152 ✓ | 109 ✓ |
| `.logbook` cw/sw | 519/1344 ✓ | 678/1344 ✓ | 990/1344 ✓ |
| `.lb-row` tracce | `92px 150px 150px 110px 130px 64px 55px 55px 100px 130px 150px` ✓ (identiche alle tre) |
| `.kpi-row` | grid ✓ | grid ✓ | grid ✓ |
| `.filter-date-range` | `flex / nowrap / gap 5px / 272x37` ✓ (identica a prima: l'inline style spostato in `.logbook-filter-range` non muove nulla) |
| `.logbook-search` | `190x34`, `188/190` ✓ (identica: TD (g), pre-esistente) |
| `.logbook-mobile` | `none` ✓ | `none` ✓ | `none` ✓ |
| trigger "Filtri" | `none` ✓ | `none` ✓ | `none` ✓ |
| tab bar | `none` ✓ | `none` ✓ | `none` ✓ |
| overflow pagina | 0 ✓ | 0 ✓ | 0 ✓ |
| `SlideOver` aperto | 520 largo, `border-left 1px`, `.so-body padding-bottom 18px`, `.so-foot bottom == viewport`, submit **35px**, `.so-actions` **0** ✓ a tutte e tre |

`flight-filter-person` resta **18px** sul desktop (difetto pre-esistente **non** ereditato di straforo: sul mobile e' 44). AD-6 confermata: **zero righe** in `flight-editor.tsx` (`git show --stat` non lo elenca) e la geometria full-screen del pannello arriva dal CSS 15.2, non da codice nuovo.

### 2.3 Comportamenti di dominio 14.4 / 14.3 — riprodotti dal vivo a 375px

`<scratchpad>/p5-domain.mjs`. **La sequenza che nella 14.4 registrava il volo al PILOTA SBAGLIATO** (apri → 422 su A → chiudi → riapri → scegli B → deroga → registra):

```json
"step2_afterReopen": { "force": 0, "formError": 0, "person": "" },
"step3_registeredFor": [ { "person": "VoloREVMSEJXJDUB Mobile", "forced": true,
                           "reason": "Review 15.6 deroga REVMSEJXJDU" } ],
"step3_expect": "must be VoloREVMSEJXJDUB Mobile ONLY, never VoloREVMSEJXJDUA Mobile"
```

Un solo volo, intestato a **B**, con la deroga giusta: il difetto **non si riproduce**. Il `key` di `logbook-console.tsx:932` resta l'unico e lo sheet passa dallo **stesso** `setEditorTarget` (`:1132`).

**Remount fra due correzioni diverse** (sheet volo 1 → Modifica → chiudi → sheet volo 2 → Modifica):

```json
"correctionRemount": { "first":{"person":"…B Mobile","date":"2026-08-04"},
                       "second":{"person":"…A Mobile","date":"2020-06-02"}, "differ": true }
```

**Invariante 14.3**: coperta dall'e2e `mobile-logbook.spec.ts:843` (correzione: `toBeEnabled()` + `TOURISM` a file; nuova: `toBeDisabled()` + `SCHOOL`), verde nell'arbitro. La rimozione dell'asserzione sull'hint e' **motivata correttamente**: l'hint dipende da `personOptions` cappato a 100, l'invariante no — v. LOW-5 per il TD.

### 2.4 Idempotenza e concorrenza (attacco richiesto)

`<scratchpad>/p6-race.mjs`:

```json
"postsAfterDoubleTapOnRegister": 1,        // doppio tap sul submit primario => UN solo POST
"postsTotal": 2,                            // primo invio (422) + re-invio con force (201)
"keys": ["611e3583-…", "127787c8-…"],      // DIVERSE (contratto TD-2, correzione C1 confermata)
"flightsAfterDoubleTap": 1,                 // un solo volo creato
"concurrentCancel": [200, 409],             // due POST /cancel in parallelo sullo STESSO volo
"flightAfterCancel": [{"status":"CANCELLED","reason":"Race A RACMSEJZHG6"}]
```

DB (`psql`) sul volo stornato in gara:

```
          type          | amountCents | is_reversal |               description
 FLIGHT_CHARGE          |      -12000 | f           | Volo I-R7RAC… 2026-08-04 — 1:00
 FLIGHT_CHARGE_REVERSAL |       12000 | t           | Storno volo I-R7RAC… — Race A RACMSEJZHG6
(2 rows)
```

**Un addebito, uno storno**: nessun doppio reversal, nessun doppio volo. Il doppio tap e' protetto (`disabled={isSubmitting…}` a `flight-editor.tsx:713`, `disabled={forceSubmitting}` a `:992`, `disabled={cancelSubmitting}` a `logbook-console.tsx:1188`).

### 2.5 Pannello Filtri, `?page`, deep-link (attacco richiesto)

```json
"panel_applied": {"url":"…/logbook?dateFrom=2020-01-01&aircraftId=…&flightType=TOURISM","trigger":"Filtri (3)"}
"beforePanel":  {"url":"…/logbook?page=2","status":"2 / 6"}
"afterPanelFromPage2": {"url":"…/logbook?flightType=TOURISM","status":"1 / 5"}   // ?page AZZERATO
"chipFromPage2": "…/logbook?status=REGISTERED"                                    // ?page AZZERATO
```

Applica = **una** navigazione con tutti i filtri insieme (contato anche dall'e2e con `framenavigated`); `?page` cade sia dall'Applica sia dalle chip (lezione 15.4 §4.7 rispettata). Il conteggio sul trigger conta i **soli** filtri nascosti (periodo+velivolo+tipo = 3) come dichiarato.

**Deep link drill-down istruttore** (`<scratchpad>/p9-drilldown.mjs`): a 375px il banner `flight-instructor-filter-banner` e' visibile («Filtro istruttore attivo | Rimuovi filtro istruttore») e la lista e' scopata (1 riga). Toccando una chip l'`instructorPersonId` cade — **esattamente come il `<select>` desktop**: `afterChip` e `afterDesktopSelect` finiscono entrambi su `?status=REGISTERED`. Parita' piena, comportamento pre-esistente, nessuna regressione.

**Divergenza fra i due alberi (rischio della deviazione n.1, doppio albero)**: **strutturalmente impossibile**. `page.tsx:237` rimonta la console con `key={JSON.stringify({page, ...exportFilters})}`, quindi lo stato `filters` non puo' restare indietro rispetto all'URL; il draft del pannello e' seminato da `filters` all'apertura (`:684`) e i controlli desktop leggono lo stesso `filters`. Verificato dall'e2e (`flight-filter-status` desktop legge `CANCELLED` dopo un tap sulla chip) e dalle mie navigazioni.

### 2.6 Contrasti nei DUE temi, esemplari enumerati da me (non fidandomi dell'elenco)

`<scratchpad>/p3b-contrast.mjs` — colori **dipinti su canvas** (`getComputedStyle` restituisce `oklch`/`lab` verbatim), sfondo effettivo risolto risalendo gli antenati **partendo dall'elemento** (misurare dal genitore dava 1.04 sui `.btn.primary`: falso), tema imposto col cookie `am-theme` (il `prefers-color-scheme` **non** governa questa app — `data-theme` verificato: `light`/`dark`).

| oggetto | chiaro | scuro | soglia |
|---|---|---|---|
| `.mobile-row-name` | 18.79 | 15.74 | 4.5 ✓ |
| `.mobile-row-sub` | 4.85 | 5.72 | 4.5 ✓ |
| `.mobile-row-amount` / `.mobile-row-note` | 18.79 / 4.85 | 15.74 / 5.72 | 4.5 ✓ |
| `.mobile-row-tail` (chip marche) | 17.01 | 17.67 | 4.5 ✓ |
| `.mobile-row-flag .badge` ("Deroga") | 11.32 | 9.28 | 4.5 ✓ |
| chip di stato attiva (testo) / riempimento vs card | 17.99 / 18.79 | 17.00 / 15.74 | 4.5 / 3 ✓ |
| chip inattiva (testo) | 18.79 | 15.74 | 4.5 ✓ |
| trigger "Filtri" / Esporta / bare-input | 18.79 / 18.79 / 17.01 | 15.74 / 15.74 / 17.67 | 4.5 ✓ |
| `.bottom-sheet-sub` (**dopo il fix C6**) | **4.85** | **5.72** | 4.5 ✓ |
| `.bottom-sheet-k` / `-v` / `-title` / `-close` | 4.85 / 18.79 / 18.79 / 9.99 | 5.72 / 15.74 / 15.74 / 9.47 | 4.5 ✓ |
| azioni sheet: `.btn.primary` / `.btn.mini.bad` | 17.99 / 6.53 | 17.00 / 6.61 | 4.5 ✓ |
| pannello: `.so-title` / `.fld-label` / `.iconbtn` / `select.input` / footer | 18.79 / 4.85 / 9.99 / 17.79 / 17.99-18.79 | 15.74 / 5.72 / 9.47 / 14.77 / 17.00-15.74 | ✓ |
| pallino del badge (dove **e'** dipinto: sheet), fuso con `opacity .7` | 4.81 | 5.40 | 3 ✓ |
| bordi chip/card e riempimenti dei `Badge` | 1.14-1.38 | 1.29-1.38 | decorativi (precedente 15.5) |

**Gemelli della deviazione `.bottom-sheet-sub` → `--ink-3`** (tocca TUTTI gli sheet dell'epic). Misurati da me sui consumer vivi:

| sheet | chiaro | scuro |
|---|---|---|
| coda PPR (`"Richiesta"`) | **4.85** | **5.72** |
| prenotazioni 15.4 (`"I-PAG… · 04/08/2026"`) | **4.85** | **5.72** |
| flotta 15.5 (`"Basato"`) | **4.85** | **5.72** |

La deviazione **migliora** l'epic e non rompe nessun gemello. (`pilot-row-mobile` non e' il testid della riga Piloti: sonda saltata, ma la classe e' la stessa e i tre esemplari sopra bastano.)

Da segnalare come **pre-esistente**: `.so-sub` di `SlideOver` misurato da me **3.66** in tema chiaro (il dark non l'ho rimisurato dopo la correzione del meccanismo di tema — il record dichiara 4.14, comunque sotto 4.5). Il dev l'ha **evitato** non passando sottotitolo al pannello (`logbook-console.tsx:1008-1011`, `.so-sub` verificato vuoto: `""`), scelta corretta (v. LOW-5 per il TD).

### 2.7 RBAC, masking, parita' dello sheet

`<scratchpad>/p4-actors.mjs` + `p10-selfservice.mjs`, ADMIN/PILOTA/ALLIEVO/ISTRUTTORE a **375 e 1280**:

| attore | testata @375 | chip | controlli | righe | azioni sheet | masking |
|---|---|---|---|---|---|---|
| ADMIN | 175 (+64) | si' | ricerca + Filtri + Esporta + Nuova voce | 20 = 20 desktop | **2** (44px) | vede `forceReason` (5 righe) |
| PILOTA | 69 (+64) | si' | Filtri + Esporta | i propri | **0** | nessun `forceReason` |
| ALLIEVO | 69 (+64) | si' | Filtri + Esporta | i propri | **0** | nessun `forceReason`, badge "Deroga" presente |
| ISTRUTTORE | 69 (+64) | si' | Filtri + Esporta | i propri **+ CFI** | **0** | nessun `forceReason` |

Sheet: **14 righe fisse** per tutti (Data, Tratta, Pilota, Istruttore, **PIC**, Aereo, Tipo, Ore, **Orari**, Decolli, Atterraggi, **Contaore**, Costo, **Note**) + le condizionali (Deroga/Annullato/Storico). Nome accessibile ben formato su tutti i casi provati (`"01/08/2020 · I-S6SLF… · Scuola — Alfa→Beta"`, nessun `—` orfano, nessun segmento vuoto). Su riga CANCELLED: **0 azioni** e motivo leggibile (`p6`: `{"actions":0,"mentionsReason":true}`).

### 2.8 Convenzione testid e blast radius

`grep -rn 'data-testid\^=' e2e/` → **14 occorrenze** (il record dice 13: differenza irrilevante, e' `mobile-registries.spec.ts:859` che il conteggio del dev non listava), prefissi `pilot-row-`, `ac-card-`, `mobile-tail-chip-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`, `mobile-fleet-card-`, `mobile-fleet-`: **nessuno tocca `flight-`** ⇒ il suffisso `-mobile` e' legale, come dichiarato. Nessun nome nuovo collide con `instructor-profile-flight-row-mobile` (15.5). I 10 singleton desktop restano 1 nodo a 375 e 1280 (misurato), `flight-row` e `flight-row-mobile` hanno lo stesso conteggio (20/20), e su `/dashboard` (secondo consumer di `FlightEditor`) `flight-form` = 1, `mobile-flight-sheet` = 0, `flight-row-mobile` = 0. Nessuna chiave nuova dell'editor ⇒ `dashboard/page.tsx#buildFlightEditorLabels` correttamente non toccata.

### 2.9 Igiene

- **Nessuna dipendenza nuova** (`package.json` non nel diff), **nessun token ridefinito** (grep sul diff CSS: zero righe `--token:`), **nessun literal di colore** nel blocco 15.6 (grep `#`/`rgb(`/`oklch(`/`hsl(` → nulla).
- 17 chiavi nuove in **entrambi** i locale, `filtersCount` via `t.raw` (segnaposto riempito client-side).
- Nessuna env var nuova ⇒ `.env.example`/CI intatti, `env.ci-sync.test.ts` verde nei gates.
- Unit nuovi: 16 test in `src/lib/mobile-logbook.test.ts`, funzione pura senza import di servizi (nessun `@/lib/env` trascinato).

---

## 3. Decisioni da sottoporre al PO

1. **MINOR-2 (pallino del badge)**: si corregge il pallino sulla card (una dichiarazione CSS) **oppure** si ratifica la card senza pallino e si corregge la riga 568 del record? *Raccomandazione: correggere il CSS* — il pallino e' l'affordance che il design system usa per "stato anomalo" su desktop e nello sheet, e la card e' l'unica superficie dove sparisce.
2. **MINOR-1 (debounce vs pannello)**: fix ora (2 righe) o TD dichiarato? *Raccomandazione: fix ora* — e' il difetto che AD-4 dichiara inaccettabile, e il rimedio e' locale.
3. **TD nuovo, faccia `personOptions` del tetto 100**: la ratifica R-15.6-g copriva il **filtro Velivolo**; questa faccia tocca un'affordance 14.3 (`studentOnlyCorrectionHint` invisibile per una persona oltre la pagina 1). Confermare "si subisce" e registrarlo, o promuoverlo a story?
4. **Copertura AC 12/AC 9** (LOW-2): si aggiunge un test ALLIEVO e il giro a 1280 per pilota/istruttore, o si allinea il record alla copertura reale?

---

## 4. Stato dell'ambiente al termine

- **DB NON piu' fresco**: la suite arbitro (377 test) piu' le mie sonde hanno scritto. Ho creato **5 velivoli**, **~7 persone**, **~8 voli** (di cui 1 stornato in gara) e — attenzione — ho aggiunto una **`InstructorRate` (50,00 €/h, `validFrom 2019-01-01`) alla persona dell'utente di seed `instructor@airmanager.local`** e un volo SCUOLA intestato alla persona di `student@airmanager.local`. **Prima del prossimo run completo conviene resettare** (`docker compose down -v` → `up -d` → `migrate deploy` → `db seed`): e' esattamente la classe di contaminazione del seed che la review 15.4 ha gia' pagato.
- Server di produzione lasciato **in ascolto su :3000** (`npm run start`, `JOBS_SECRET=review-15-6-probe`): va ucciso prima di un `CI=1 scripts/e2e.sh start`.
- Artefatti della review (mai committati): `<scratchpad>/arbiter-full-suite.log`, `p1-geometry.mjs`, `p2-desktop.mjs`, `p3b-contrast.mjs`, `p4-actors.mjs`, `p5-domain.mjs`, `p6-race.mjs`, `p7-visual.mjs`, `p8-dot.mjs`, `p9-drilldown.mjs`, `p10-selfservice.mjs`, `p11-vacuous.mjs`, `p12-guard7.mjs`, `shot-*.png`.
