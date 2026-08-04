# Review adversarial — Story 15.5 "Anagrafiche a card mobile"

Reviewer: `adversarial-reviewer` (Opus 5 xhigh) — 2026-08-04
Commit sotto review: `69062ee` (feat) + `6383d3a` (Dev Agent Record), su `dev`.
Macchina: Fedora locale dell'utente (Postgres + Mailpit via `docker compose`, non il container di CLAUDE.md).
Perimetro: R-15.5-a PIENO — Flotta, Piloti, Istruttori, scheda persona `people/{id}`, + R-15.2-g sui due editor multi-form.

## Verdetto

**shippable-with-fixes**

Il gate è **VERDE su DB fresco** (arbitro sotto), i gates locali passano, il desktop è
**misurato invariato** a 641/800/1280 su tutte le superfici toccate (consoli, quattro pannelli
`SlideOver`, scheda persona, widget Flotta della Panoramica), l'RBAC regge su tutti e quattro
gli attori, i contrasti delle superfici nuove sono sopra soglia nei due temi, e le guardie
delicate che il dev dichiara rosse **lo sono davvero** (le ho riprovate io per iniezione).

Ma **due AC non sono soddisfatti**, e in un caso la guardia che avrebbe dovuto proteggerne uno
è **cieca per costruzione** — esattamente la classe di difetto che questa story passa dieci
pagine a vietare:

- **2 findings Major** (un AC a11y violato su 115 velivoli su 121 con guardia cieca; una
  funzione desktop che sparisce su mobile senza dichiararlo)
- **5 findings Minor**
- **9 osservazioni** (nessuna azione obbligatoria)
- **3 decisioni da sottoporre al PO**

---

## Priorità zero — ESITO DELL'ARBITRO (suite completa, `CI=1`, build di produzione, DB fresco)

DB resettato dalla sessione principale immediatamente prima del run.

```
$ set -a && . ./.env && set +a && export JOBS_SECRET=review-15-5-arbiter
$ CI=1 scripts/e2e.sh start                      # avviato 2026-08-04T00:58:19+02:00
$ scripts/e2e.sh status
state: DONE — E2E_EXIT=0
--- summary ---
  1 flaky
  351 passed (8.4m)
=== e2e end: 2026-08-04T01:06:41+02:00 ===
E2E_EXIT=0
```

**352 test totali** (337 della 15.4 + 15 di `mobile-registries.spec.ts`), come atteso.
`e2e/mobile-registries.spec.ts`: **15/15 verdi** (`grep -ac '✓.*mobile-registries'` → 15).
Log copiato prima di ogni run successivo in
`/tmp/claude-1000/.../scratchpad/arbiter-full-suite.log`.

### L'unico flaky NON è quello del dev — ed è comunque pre-esistente

```
1 flaky
  [chromium] › e2e/billing.spec.ts:296:7 › Tre riquadri con numeri veri da scenario seminato
  (story Billing-2, AC 6) › ricarica + volo + payout, tutti dated today, move
  Risultato/Liquidità/Acconti by EXACTLY the expected deltas
    > 341 |     expect(depositsTotalAfter - depositsTotalBefore).toBe(10000);
```

`billing.spec.ts:296` è **esplicitamente elencato fra i TD pre-esistenti "subiti e non chiusi"**
dalla story stessa (§ Fuori scope dichiarato) ed è la classe "aggregato globale + uguaglianza
sotto `fullyParallel`" già registrata in CLAUDE.md (review Billing-2 F4). Verde al retry.

Il flaky dichiarato dal dev (`flights.spec.ts:602`, 422 da catalogo `ExpiryType` globale) **non
si è ripresentato** in questo run: la sua attribuzione resta plausibile e il TD che il dev ha
aperto (accoppiamento a stato globale fra `bookings.spec.ts`/`flights.spec.ts` e ogni persona
nuova) è **confermato dai dati**:

```
$ docker exec airmanager-postgres-1 psql -U airmanager -d airmanager \
    -c "SELECT count(*) FROM \"ExpiryType\" WHERE \"blocksBooking\";"
 count
-------
    11        # di cui 7 lasciati da altre spec ("Tipo prenotazioni …", "Tipo voli …")
```

Nessun lock TD-6 in gioco: `SELECT count(*) FROM "LoginAttempt" WHERE succeeded=false AND
"createdAt" > now() - interval '30 minutes'` → **3**.

### Gates

```
$ npm run gates
PASS  lint (17s)
PASS  typecheck (2s)
PASS  test (7s) — Tests  1689 passed (1689)
PASS  build (25s)

$ env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/lib/mobile-registries.test.ts
Test Files  1 passed (1)   Tests  21 passed (21)     # nessun @/lib/env trascinato
```

---

## Findings

### F1 (Major) — Il nome accessibile del bottom sheet è MALFORMATO su 115 velivoli su 121, e la guardia di AC 4 è CIECA per costruzione

**AC violato**: AC 4 — *"il nome accessibile del dialog non è malformato (lezione 15.2 F6:
nessun `—` doppio)"*.

**Dove**:
- `src/app/[locale]/dashboard/fleet/fleet-console.tsx:307`
  `sub={`${…basedOptions…} · ${sheetAircraft.fuelType ?? labels.mobile.noValue}`}`
  con `labels.mobile.noValue === "—"` (`messages/it.json`, `AircraftPage.mobile.noValue`).
- `src/components/ui/bottom-sheet.tsx:61` `label={`${sub} — ${title}`}`.
- Stessa classe su `src/app/[locale]/dashboard/pilots/pilots-console.tsx` — `subLineOf()`
  ritorna `labels.table.noValue` ("—") quando la persona non ha profili attivi né email.

**Riproduzione ed evidenza** (build di produzione, 375×812, admin):

```
$ node scratchpad/p19-a11yname.mjs      # apre 6 card Flotta e legge [role="dialog"][aria-label]
[
 { "name": "Basato · — — I-AAA1785797939858-4 · Test Model 1785797939858-4uagps",
   "splitLen": 2, "hasDoubleDash": true },
 { "name": "Basato · — — I-ABCD · Tecnam P92 Eaglet",  "splitLen": 2, "hasDoubleDash": true },
 { "name": "Basato · — — I-BBB1785797940856-H · …",    "splitLen": 2, "hasDoubleDash": true },
 { "name": "Basato · — — I-BK1785797977359-WP · Test Model", "splitLen": 2, "hasDoubleDash": true },
 { "name": "Basato · — — I-BK1785797977722-VK · Test Model", "splitLen": 2, "hasDoubleDash": true },
 { "name": "Basato · — — I-BK1785797979959-85 · Test Model", "splitLen": 2, "hasDoubleDash": true },
 { "pilot": "Pilota — 0Pilota-1785798007652-sfe37r Prenota" },
 { "instructor": "Elenco istruttori — Attacker-1785798251889-b7xltw Istruttore" }
]

$ node scratchpad/p20-pilotsub.mjs      # cerca una riga Piloti con sub vuoto
{ "page": 6, "row": "mobile-pilot-row-cmsdu1wch00l7cspv22pstt7s",
  "name": "— — Alert-1785798052832-zrf2x8 NoEmail", "splitLen": 2, "doubleDash": false }
```

**Blast radius misurato**:

```
$ docker exec airmanager-postgres-1 psql -U airmanager -d airmanager \
    -c "SELECT (\"fuelType\" IS NULL) AS fuel_null, count(*) FROM \"Aircraft\" WHERE \"archivedAt\" IS NULL GROUP BY 1;"
 fuel_null | count
-----------+-------
 f         |     6
 t         |   115        # 95% della flotta attiva
```

**Perché la guardia non l'ha visto** — `e2e/mobile-registries.spec.ts:271`:

```ts
expect(name!.split(' — ')).toHaveLength(2);
```

La stringa malformata contiene **due separatori adiacenti** (`… · —` + ` — ` + `I-ABCD …`);
`String.split` consuma il primo dei due e restituisce **esattamente 2** parti. L'asserzione è
verde **proprio sul caso che doveva vietare**. È la classe "guardia cieca per costruzione" che
la story cita tre volte (15.2, 15.3 F8, 15.4 iii), qui applicata al testo invece che al layout.

**Direzione di fix**: comporre `sub` **omettendo** i segmenti assenti (mai iniettare il
segnaposto `—` in una stringa che finisce in `aria-label`), sia sulla Flotta sia in
`subLineOf`; e riscrivere la guardia su una proprietà discriminante (`expect(name).not.toMatch(/—\s*—/)`
+ `expect(name).not.toMatch(/^—/)`), non su `split().length`.

---

### F2 (Major) — Su mobile l'anagrafica Istruttori PERDE il pannello di dettaglio del desktop: ore del mese, allievi recenti e voli recenti come CFI diventano irraggiungibili

**AC violato**: AC 11 — *"il dettaglio che il desktop apre da `instructor-name-{id}` —
l'`InstructorProfile`, uno SlideOver di sola lettura — su mobile è **assorbito dallo sheet**,
che è esattamente la forma che R3 prescrive per un dettaglio-riga"*. Anche R4 ("si porta TUTTO",
nessuna funzione persa).

**Dove**: `src/app/[locale]/dashboard/instructors/instructors-console.tsx:277-325` (lo sheet
mobile porta 3 righe e 2 azioni) contro `src/app/[locale]/dashboard/instructors/instructor-profile.tsx:139-218`
(il pannello desktop). Lo switch `.instructors-desktop-body{display:none}`
(`src/styles/airops.css:2400`) rende `instructor-name-{id}` inattingibile a ≤640px.

**Evidenza** (375×812, admin):

```
$ node scratchpad/p9-instr-ppr.mjs
"reach": { "nameNodes": 32, "nameVisible": 0, "desktopBodyDisplay": "none" },

"sheet": { "text": "ELENCO ISTRUTTORI | Attacker-… Istruttore | — | TARIFFA PAYOUT | — |
                    ORE TOTALI | 0:00 | TOTALE DOVUTO | — | Modifica | Paga | Chiudi",
           "actions": ["instructor-edit-mobile","instructor-pay-mobile","Chiudi"] },

"profile": "Attacker-… Istruttore | ✕ | IA | … | ORE TOTALI | 0:00 | ORE NEL MESE | 0:00 |
            DOVUTO TOTALE | — | TARIFFA ORARIA | — | ALLIEVI RECENTI | Nessun allievo recente. |
            VOLI RECENTI COME CFI | Nessun volo registrato. | Chiudi | Modifica istruttore"
```

Sul telefono spariscono quindi: **Ore nel mese** (`detail.mtdMinutes`, `GET` dedicato),
**Allievi recenti** (`instructor-profile-student-chip`), **Voli recenti come CFI**
(`instructor-profile-flight-row`). In più, lo sheet Istruttori — a differenza di quello Piloti,
che ha `pilot-open-profile-mobile` — **non offre nessun ingresso alla scheda persona**, quindi
quei dati non sono raggiungibili nemmeno per vie traverse dalla lista.

Il record §11 ("Cosa NON ho fatto") **non dichiara** questa omissione; §2 rivendica per AC 11
solo la "parità informativa verso le 5 colonne desktop", che è un sottoinsieme di ciò che l'AC
chiede.

**Direzione di fix**: o si portano le tre voci mancanti dentro `mobile-instructor-sheet`
(il `fetchDetail` esiste già), o si aggiunge un'azione "Vai alla scheda"/"Profilo" allo sheet e
si dichiara la scelta come ratifica PO.

---

### F3 (Minor + decisione PO) — R-15.5-g non raggiunge il proprio scopo: a 375px le testate mobili sono PIÙ ALTE del pre-fix su tutte e tre le anagrafiche, e il record si contraddice sulla Flotta

**Misure post** (`.registry-head`, build di produzione, admin — `scratchpad/p3.json`, `p4-head.mjs`):

| superficie | 320px | 375px | 390px | pre-fix @375 (ricognizione, confermata dal dev "al pixel") |
|---|---|---|---|---|
| Flotta | **221.84** | **221.84** | 179 | 192 |
| Piloti | **221.84** | **179** | 179 | 149 |
| Istruttori | **167.84** | **167.84** | 125 | 150 |

A 375px la testata Flotta impila **quattro** righe (toggle 44 · export 35 · ricerca 46 · CTA 44):

```
"fleet@375": { "headH": 222, "kids": [
   "fleet-toggle-archived: y=163 h=44 w=141",
   "search registry-search: y=258 h=46 w=281",
   "(ExportMenu): y=215 h=35 w=137",
   "fleet-new-button: y=312 h=44 w=281" ], "firstCardTop": 383 }
```

`firstCardTop = 383` su un viewport da 812: **il 47% dell'altezza dello schermo prima della
prima card**, contro il ~25% che la ricognizione contestava al pre-fix.

**Contraddizione nel record**: §1 correzione 5 afferma *"Flotta **-16px** rispetto al pre-fix"*,
mentre §7 riporta onestamente *"`.card-head` Flotta pre **192px** → post **220px**"*. Il -16
confronta un post misurato a **390px** con un pre misurato a **375px**. La riga di §1 va
corretta: a 375px la Flotta **peggiora di ~30px**, non migliora.

Non è un bug (nessun overflow, nessun controllo perso, tutto hit-testabile), ma **R-15.5-g è
stata ratificata dal PO sul beneficio dichiarato "altezza della testata drasticamente ridotta"**,
e il risultato consegnato è l'opposto al viewport di riferimento dell'epic. → decisione PO.

---

### F4 (Minor) — `ExportMenu` in testata resta un target da 35px, sotto i 44px che AC 3 impone a "ogni controllo", e nessuna guardia lo copre

**Evidenza** (`scratchpad/p14-export.mjs`, 375×812):

```
"fleet": { "trigger": { "h": 35, "w": 137, "text": "Esporta Excel ▾" },
           "opened": { "items": [
             {"t":"fleet-toggle-archived","h":44}, {"t":"Esporta Excel ▾","h":35},
             {"t":"XLSEsporta Excel","h":35},      {"t":"fleet-new-button","h":44} ] } }
```

Identico su `pilots` e `instructors`, a 320/375/390. La regola `.registry-head > .btn{min-height:44px}`
(`airops.css:2422`) è un selettore **figlio diretto**, e il `.btn` dell'`ExportMenu` è un
**nipote** (dentro il wrapper `div:has(> .btn)`), quindi non lo raggiunge.

La guardia AC 3 (`e2e/mobile-registries.spec.ts:459-464`) itera solo su
`FLEET_TESTIDS = ['fleet-search','fleet-toggle-archived','fleet-new-button']`: il quarto
controllo della testata non è coperto. Il record §2 AC 3 scrive "3 testid = 1 nodo ciascuno,
**tutti ≥44px**", che è vero per i tre elencati e silenziosamente escludente per il quarto.

**Attenuante**: R-15.5-g dice "`ExportMenu` INVARIATO in testata (export mobile = 15.8)".
→ decisione PO: il target 44px vale ora o si rimanda con l'export alla 15.8?

---

### F5 (Minor) — Il selettore `.info-row .v` è DISCENDENTE e non ancorato: raggiunge il modulo PUBBLICO `/ppr`, superficie fuori scope (15.9)

`src/styles/airops.css:2584` (dentro `@media (max-width:640px)`):

```css
.info-row .v{ min-width: 0; overflow-wrap: anywhere; }
```

`.info-row` è condivisa: oltre a `people/[id]/page.tsx:308` vive in
`src/app/[locale]/ppr/page.tsx:136` e `:141` (blocco "aviosuperficie" del modulo pubblico).

**Evidenza** (`scratchpad/p9-instr-ppr.mjs`, `/it/ppr` a 375px):

```
"ppr": { "count": 2, "overflowWrap": "anywhere", "minWidth": "0px", "pageOverflow": 0 }
```

Oggi l'effetto è **nullo** (i valori sono corti: nome aviosuperficie e ICAO), ma è esattamente
la classe che la story stessa mette fra le "lezioni da NON ripetere" (n. 2, review 15.3 F1:
"il selettore nuovo deve essere ANCORATO") e che il dev ha applicato correttamente ovunque
altro (`.registry-head > …`, `.home-head-actions > .btn`, `.person-expiries …`). Va ancorata
alla scheda persona.

---

### F6 (Minor) — `.so-body:has(.so-actions){padding-bottom:0}` ora colpisce i due editor multi-form in MODIFICA, dove la barra NON è in fondo: l'ultimo controllo resta a filo del bordo inferiore

La regola (`src/styles/airops.css:1915`) è motivata nel proprio doc-comment per i corpi in cui
la riga d'azione **è l'ultimo elemento**. Con `.so-actions` messa sulla riga identità
(`pilot-editor.tsx:335`, `instructor-editor.tsx:321`), in MODIFICA la barra sta a metà pannello
ma il `padding-bottom: 0` vale lo stesso.

**Evidenza** (`scratchpad/p18-editmode.mjs`, pilot-editor MODIFICA aperto dallo sheet, 375×560):

```
"atTop":    { "actionsPos": "sticky", "bodyPaddingBottom": "0px", "stuck": true,
              "coveredControls": ["fiscalCode@496"] },
"atBottom": { "lastControls": ["… pilot-access-create top=416 hit=self",
                               "pilot-archive-toggle top=525 hit=self"],
              "bottomGap": 0 }
```

`bottomGap: 0` = l'ultimo figlio del corpo tocca il bordo inferiore del pannello (pre-fix:
18px). Desktop non toccato (`padding-bottom: 18px`, misurato a 641/800/1280). Cosmetico, ma è
un effetto collaterale introdotto qui e non dichiarato.

*(Il `fiscalCode` coperto dalla barra a `scrollTop 0` è invece il comportamento VOLUTO della
riga sticky — il doc-comment di `airops.css:1908-1914` lo dichiara: "form fields slide through
the gap underneath it". Non è un finding.)*

---

### F7 (Minor) — Il TD nuovo "`--ink-3` su `--panel-2` = 4.34:1 sul desktop `.ac-model`/`.meter-row`" non riproduce

Misurato sulla pagina reale (canvas → WCAG, sfondo effettivo risolto risalendo gli antenati),
`/dashboard/fleet` a 1280px:

```
"light_desktop": { "acModel": 4.59, "meterRow": 4.59 }
"dark_desktop":  { "acModel": 5.36, "meterRow": 5.36 }
```

Cioè **sopra** la soglia 4.5, non 4.34. Il TD scritto in `sprint-status.yaml` porta un numero
che non si riproduce: o va rimisurato con il metodo del dev e allegato, o va chiuso. (La scelta
di usare `--ink-2` sulla card mobile resta comunque corretta e misurata: 9.46 chiaro / 8.88 scuro.)

---

## Verifiche superate (con i numeri, non con un giudizio)

### 1. Le 8 guardie del record — riprovate INDIPENDENTEMENTE per iniezione sul repo intatto

| # | iniezione | esito misurato |
|---|---|---|
| iii | `1fr 1fr` + `min-width:auto` sulla card + `text-overflow:clip` sul modello | tracce **219.14 / 202.41**, `equal:false`, `fits:false` → **ROSSO**; `pageOverflow` resta **0** in entrambi i casi ⇒ la tesi "l'overflow di pagina sarebbe una guardia cieca" è **confermata** |
| iv | `.mobile-ac-model{text-overflow:clip}` | `clippedWithoutEllipsis: ['mobile-ac-model','mobile-ac-model']` a 375 e **3** a 320 → **ROSSO** |
| vii | `.so-actions{position:static}` | submit `bottom 1740` in un viewport 560, `reachable: null` → **ROSSO** (baseline: `bottom 548`, `reachable:true`, `bodyScrolls:true`) |
| ix | versione DISCENDENTE `.home-head-actions .btn{min/max-width:12px}` | bottoni del pannello `SlideOver` da **164/164/61/61/47/47** a **26/26/18/18/18/18** → **ROSSO**; con il `>` restano 164/61/47 ⇒ la trappola 15.3 F1 esiste davvero su quella testata |
| chip | `grid-column: 2/-1` + badge `inline-flex/max-width:none/overflow:visible` | `chipFits:false`, chip `right 374` contro riga `right 346` → **ROSSO**; e lo sweep degli scroller lo cattura anche lui (`['card','pilots-mobile','mobile-row…','mobile-row-flag']`), quindi la guardia dedicata è cintura **e** bretelle |

Le guardie i/ii/v/vi/viii sono coperte dalla suite (15/15 verdi nell'arbitro) e dai 21 unit.

**Nota sulla discriminanza di (iii) dichiarata dal dev**: iniettando **solo** `1fr 1fr`
le tracce restano `137.5 / 137.5` e la guardia resta verde — come il dev dichiara. **Non è un
buco**: con `min-width:0` sulla card e le ellissi, `1fr` e `minmax(0,1fr)` sono equivalenti,
quindi non c'è regressione da catturare. Anche togliendo il solo `min-width:0` non cambia nulla
di misurabile (`cardWiderThanTrack: 0`, `cardOverflow: 0` a 320 e 375): la protezione reale
sono le ellissi, ed **è guardata**.

**La classe di guardia cieca segnalata dal dev, riletta altrove nell'epic**: l'esclusione
`textOverflow !== 'ellipsis'` dallo sweep degli scroller esiste **solo** in
`mobile-registries.spec.ts` (`grep -rn textOverflow e2e/*.spec.ts` → 4 occorrenze, tutte in
quel file). Gli altri sweep dell'epic non escludono nulla, quindi non ereditano il buco. Dentro
questo file gli altri elementi ellissati (`.mobile-ac-tail/-model/-meter>span`,
`.mobile-row-name/-sub`, `.mobile-ac-status .badge`) restano coperti perché i loro **genitori**
non hanno ellissi e finiscono nello sweep. Verificato.

### 2. Desktop invariato — misurato, non dedotto (641 / 800 / 1280)

```
.card-head Flotta   106.69 / 106.69 / 63.84      .card-head Piloti  149.53 / 106.69 / 63.84
.registry-search    240 / 240 / 240 (Flotta)     260 / 260 / 260 (Piloti)   [ = inline pre-fix ]
.fleet-grid         235.5×2 / 315×2 / 229.5×4
.students Piloti    519/1102 · 678/1102 · 990/1102        (scrollWidth invariato)
alberi mobile       .fleet-mobile/.pilots-mobile/.instructors-mobile = display:none a ogni larghezza
```

Quattro pannelli `SlideOver` aperti (pilot NUOVO, pilot MODIFICA, instructor, aircraft), a tutte
e tre le larghezze, **identici**:

```
panelW 520 · .so-body padding-bottom 18px · .so-actions position static, border-top 0px,
background rgba(0,0,0,0), margin-left 0px · submit 35px · .so-actions count = 1
```

Scheda persona: `.person-bottom-grid` `252.5×2 / 332×2 / 488×2` con `gap 16px`,
`.person-expiries .student-row` **4 tracce**, header `display: grid`,
`.home-head-actions` `flex / 8px`, `.info-row .v` `overflow-wrap: normal` — cioè esattamente i
valori inline rimossi. Panoramica: `fleet-card-widget` = 1 nodo, `[data-testid^="mobile-fleet-"]`
= **0** a 375 **e** 1280.

### 3. Testid (AC 6) — enumerati TUTTI, non i 7 del test

A **375 e 1280**, su `/dashboard/fleet` (+ `?q=` e `?q=ZZZNOPE`), `/dashboard/pilots`,
`/dashboard/instructors`, `/dashboard`:

```
fleet-search 1 · fleet-toggle-archived 1 · fleet-new-button 1 · fleet-page-prev 1 ·
fleet-page-next 1 · fleet-pagination-status 1 · fleet-empty 1 · mobile-fleet-grid 1 ·
mobile-fleet-empty 1 · pilots-* idem · instructors-new-button 1 ·
instructors-payment-cycle-button 1 · mobile-instructors-list 1 · fleet-card-widget 1 (solo /dashboard)
duplicati sulle tre console: []   (i duplicati su /dashboard sono righe di lista pre-esistenti)
```

`grep -rn 'data-testid\^=' e2e/` → 6 helper storici + 3 della 15.4 + 4 nuovi tutti su prefissi
`mobile-`: **nessun nome nuovo comincia per `ac-card-`, `pilot-row-`, `instructor-row-`,
`mobile-tail-chip-`, `schedule-filter-*`**. AD-5 tiene, e i sei file `^=` girano verdi nella
suite completa senza essere stati toccati.

### 4. Multi-attore (AC 12) — i tre ruoli + il multi-ruolo, a 375 E 1280

| attore | `people/{id}` proprio @375 | @1280 | `/fleet` · `/pilots` · `/instructors` @375 |
|---|---|---|---|
| PILOT | ok, overflow 0, 1 colonna, header actions 44×319 | 2 colonne 488×2 | redirect `/it/dashboard` ×3 |
| INSTRUCTOR | ok, overflow 0, 1 colonna | 2 colonne | redirect ×3 |
| STUDENT | ok, overflow 0, 1 colonna | 2 colonne | redirect ×3 |
| PILOT+INSTRUCTOR (creato e **ripristinato**) | ok, overflow 0, 1 colonna, 6 card | 2 colonne, 6 card | `/instructors` → redirect |

`hidden: []` per tutti (scroller interni nascosti fuori dall'estratto conto: zero). Masking
intatto: nessun attore non-admin vede il bottone "Modifica" della testata.
Lo stato del DB è stato **ripristinato** (`PATCH /api/v1/users/{id}` → `["PILOT"]`, esito 200).

### 5. I due reader nuovi

- `sumFlightMinutesByAircraft` (`aircraft.service.ts:534-568`): **una** `groupBy` batchata,
  `authorize(actor,'aircraft.manage')`, short-circuit su `ids = []`, `status:'REGISTERED'`.
  **Valori incrociati con SQL** — la pagina mostra `1:00 / 1:00 / 1:00 / 2:00` e
  `SELECT sum(minutes) … WHERE status='REGISTERED' AND flightDate >= date_trunc('month',…)`
  dà `60 / 60 / 60 / 120`. Corretto. Nessun N+1.
- `listBlockingExpiriesByPerson` (`expiries.service.ts:544-567`): **una** `findMany` batchata,
  `authorize(actor,'people.read')`, orizzonte 30g filtrato in SQL coerente con `pilotRowFlag`.
  `Expiry` ha `@@unique([personId, expiryTypeId])` (schema:1410), quindi non esiste il caso
  "vecchia riga scaduta + rinnovo valido" che avrebbe falsato il chip. Il confine
  "scaduto vs in scadenza" combacia con quello del dominio (`findBlockingExpiredDocuments` usa
  `expiresAt < flightDate`, `tierOf(0) = tier 1 = in scadenza`).
- RBAC via HTTP: entrambe le pagine sono ADMIN-only e i tre attori non-admin sono **rediretti**
  (tabella sopra). I reader non hanno endpoint propri.

### 6. Geometria, layering e contrasti (320 / 375 / 390, tema chiaro E scuro, 4 superfici)

24 combinazioni misurate (`scratchpad/p3.json`): `pageOverflow` **0** ovunque,
`hiddenScrollers` **[]** ovunque, `covered` (controlli sotto la tab bar) **[]** ovunque,
`lowContrast` (< 4.5:1 sul testo dei nuovi alberi) **[]** ovunque.

Barra ore, misurata (canvas → WCAG):

| | chiaro | scuro |
|---|---|---|
| fill `--ok` vs traccia (card normale) | **4.56** | **12.36** |
| fill `--bad` vs traccia (card AOG) | **6.10** | **9.87** |
| saldo negativo `.stat-tone-bad` | **9.82** | **6.61** |
| chip flag `.badge.bad` su riga | **8.38** | **7.46** |
| `.mobile-ac-model` (`--ink-2` su `--panel-2`) | **9.46** | **8.88** |

Nessun token inesistente sopravvive: incrociando **tutte** le `var(--x)` del repo con le
definizioni di `airops.css`, l'insieme "usati e non definiti" è **vuoto** — la correzione di
`--bad-ink` è completa, non parziale.

### 7. Altro verificato

- `messages/it.json` / `messages/en.json`: **0** chiavi presenti solo in un locale (albero intero).
- `.card-title` nascosto a ≤640px: nessun test legge "Flotta"/"Anagrafica piloti"/"Elenco
  istruttori" (grep su `e2e/`: solo titoli di test).
- Il popover del `DateInput` dentro `instructor-editor` (che ora ha `.so-actions`) resta
  **sopra** il pannello e dentro il viewport: `popover-scrim z 65`, `cal-popover z 66`,
  `inViewport: true`, cella in fondo hit-testabile (`hit = 'cal-cell out'`). AC 7 regge.
- `e2e/mobile-planning.spec.ts:352` — la riga cambiata ("domani" in Europe/Rome) è **corretta** e
  non indebolisce la 15.4: la spec è verde nell'arbitro (10/10) e l'asserzione ora è vera a ogni ora.
- `CLAUDE.md`: la riga AD-5 è aggiunta nel punto giusto (convenzione testid dell'albero mobile)
  e dice la cosa giusta. `sprint-status.yaml`: story a `review`, TD R-15.2-g chiuso e riscritto
  con le misure corrette, 3 TD nuovi (di cui uno con il numero contestato in F7).

---

## Osservazioni (nessuna azione obbligatoria)

- **O1** — La traccia della barra ore misura **1.05:1** (chiaro) / **1.20:1** (scuro) contro lo
  sfondo della card: per i **115 velivoli su 121** senza ore volate la "barra ore" è un elemento
  di fatto invisibile. È la ricetta del template (`--bg-sunken`) e il *fill* è sopra soglia; se
  il PO vuole che la barra "vuota" si veda, serve un bordo o una traccia più scura → 15.10.
- **O2** — `sumFlightMinutesByAircraft` usa `todayDateOnlyUtc()`: fra le 00:00 e le 02:00 di
  Roma del **primo giorno del mese** la didascalia "Ore mese" mostra il mese **precedente**.
  È la convenzione date-only UTC dell'app (`getEffectiveRates` sulla stessa pagina usa lo stesso
  `today`), non un difetto introdotto qui.
- **O3** — Il chip di riga segnala solo i documenti bloccanti **registrati** e scaduti/in
  scadenza; una persona a cui un documento bloccante **manca del tutto** non ha chip pur essendo
  rifiutata da `POST /flights` (`findMissingBlockingDocuments`, "assente O scaduta"). Il
  doc-comment di `src/lib/mobile-registries.ts:52-58` promette più di quanto il chip mantenga
  ("the chip says 'this pilot cannot fly today'"). R-15.5-c parla solo di documenti registrati:
  è la ratifica ad essere più stretta della promessa, non il codice ad essere sbagliato.
- **O4** — AC 2 chiede `--bad` sul saldo negativo; il dev usa `.stat-tone-bad` dopo aver
  misurato `--bad` a 3.96:1. Deviazione giusta e documentata nel codice e in §6, ma **non
  elencata** fra le 7 deviazioni dichiarate.
- **O5** — Deviazione "chip Archiviati = lo STESSO bottone ridisegnato a pillola, non un nodo
  dentro `.mobile-chip-strip`": diverge dal testo letterale di R-15.5-g ma ne rispetta la
  sostanza (un solo nodo, un solo stato, `aria-pressed`, aspetto a pillola). Verificato:
  `aria-pressed` esisteva già sui due toggle (non introdotto qui), quindi l'aggancio
  `.registry-head > .btn[aria-pressed]` non tocca "Ciclo pagamenti".
- **O6** — Il commento CSS di `airops.css:2419-2421` dice "Row 2: the search … the last thing
  before the first card. Row 3: the CTA": l'ordine reale è ricerca (`order:4`) **poi** CTA
  (`order:5`), quindi l'ultima cosa prima della lista è la CTA. Commento da correggere.
- **O7** — `mobile-planning.spec.ts`: `new Date(+24h).toLocaleDateString('en-CA',{timeZone:'Europe/Rome'})`
  resta ambiguo nell'ora 00:00-01:00 del giorno di **fine ora legale** (giornata di 25 ore).
  Un'ora l'anno; segnalato per completezza.
- **O8** — Impronta di fixture del nuovo spec: 5 velivoli + 6 persone + 1 utente + 1 volo per
  run non ripuliti (i 21 della paginazione **sono** archiviati in `finally`). Dichiarato dal
  dev; alimenta il TD `OPTIONS_PAGE_SIZE = 100`.
- **O9** — La riga sticky in MODIFICA copre un campo del form a `scrollTop 0`
  (`fiscalCode`): è il comportamento **voluto** e documentato di `.so-actions`, non un difetto.

---

## Decisioni da sottoporre al PO

1. **F3 — R-15.5-g ha mancato il proprio obiettivo.** La testata mobile a 375px passa da
   192→222 (Flotta), 149→179 (Piloti), 150→168 (Istruttori). Il PO aveva ratificato l'opzione A
   *perché* prometteva "altezza della testata drasticamente ridotta". Si accetta il risultato
   (e si corregge la riga contraddittoria del record), o si chiede un secondo giro sul layout
   della testata (es. etichette dei toggle più corte, o toggle+export sulla stessa riga a 375
   accorciando "Mostra archiviati"/"Esporta Excel")?
2. **F4 — target 44px sull'`ExportMenu`.** R-15.5-g lo dichiara "invariato, export mobile =
   15.8", ma AC 3 dice "ogni controllo ≥44px". Si applica ora (una riga CSS) o si rimanda
   formalmente alla 15.8 aggiornando AC 3?
3. **F2 — cosa deve fare lo sheet Istruttori.** Portare dentro le tre voci del pannello
   desktop (ore del mese, allievi recenti, voli recenti come CFI), oppure aggiungere un ingresso
   alla scheda persona e ratificare la perdita del resto su mobile?

---

## Stato del DB al termine della review

- DB **sporcato dalla suite completa dell'arbitro** (fixture di tutte le spec) — è lo stato
  atteso dopo un run `CI=1`.
- Le uniche scritture della review: una `PATCH /api/v1/users/{id}` sul seed
  `pilot@airmanager.local` per il test multi-ruolo, **ripristinata nello stesso script**
  (verificato: `roles = {PILOT}`).
- Nessun server lasciato in ascolto su :3000 (`next start` terminato prima dei gates).
- Log dell'arbitro copiato in
  `/tmp/claude-1000/-home-admin-AirManager/ee712b45-2921-41fc-b3f4-238d53ae4fd0/scratchpad/arbiter-full-suite.log`;
  script di probe (non committati) nello stesso scratchpad: `p1-desktop.mjs` … `p24-picker3.mjs`.
- Per il ciclo di fix: DB fresco consigliato prima del run di verifica
  (`docker compose down -v` → `up -d` → `migrate deploy` → `db seed`).
