# Review adversarial — Story AOG-1a (`outOfServiceUntil`, guardia volo, deroga)

**Reviewer**: Opus 5 xhigh (subagent adversarial, unico layer adversarial della pipeline)
**Data**: 2026-08-07 · **Macchina**: Fedora locale dell'utente (Postgres+Mailpit in Docker), NON il container di CLAUDE.md
**Oggetto**: commit `405f68f` (feat) + `7e444bf` (Dev Agent Record) su `dev` — baseline `414dd66`/`b5a2c93`
**Story file**: `_bmad-output/implementation-artifacts/aog-1a-campo-guardia-volo.md`
**Ricognizione**: `_bmad-output/implementation-artifacts/aog-1-velivolo-fuori-servizio.md`

## VERDETTO: **SHIPPABLE-WITH-FIXES**

L'implementazione e' solida e le prove del Dev Agent Record reggono alla riverifica: ho **rimisurato** le geometrie
(identiche al centesimo a quelle dichiarate), **ricalcolato** i contrasti (identici), **riprodotto** due discriminanze
rosse, e **esercitato dal vivo** la matrice RBAC, il ciclo di vita, la concorrenza e i quattro percorsi 422.
Nessun BLOCKER. **1 MAJOR** (informazione persa nella deroga: il force «per il fermo» scavalca in silenzio documenti
bloccanti che l'operatore non ha mai visto — contraddice un'invarianza scritta nel codice dalla 14.4),
**2 MINOR**, **4 LOW** e 1 nota informativa.

---

## 1. Arbitro — suite e2e completa, verbatim

Comando: `set -a && . ./.env && set +a && export JOBS_SECRET=review-aog-1a-arbiter && CI=1 scripts/e2e.sh start`
(mai in foreground; esito letto SOLO da `scripts/e2e.sh status`; log copiato in
`<scratchpad>/arbiter-run1.log` prima di ogni run successivo).

```
state: DONE — E2E_EXIT=0
--- summary ---
  1 flaky
  519 passed (13.4m)
```

Totale **520** = 511 di baseline + 9 nuovi (8 in `chromium` + 1 in `aog-overview-count`).
**0 failed, 0 skipped, exit 0.** I 9 test della story: **tutti verdi al primo tentativo.**
Il project serializzato nuovo ha girato ultimo e ha stampato la sua precondizione:
`[AC 13] active aircraft before: 161, filler created: 0, active now: 161`.

### Il flaky NON e' quello dichiarato dal dev — diagnosticato, NON attribuibile alla story

Il dev dichiarava un ECONNRESET su `POST /api/v1/expiry-types` in `mobile-expiries-movements.spec.ts`.
Il mio arbitro ha prodotto un flaky **diverso**:

```
1) [chromium] › e2e/flights.spec.ts:602:7 › ... review F1/F2 (14.3): "Correggi volo" ...
   Error: expect(received).toBe(expected)   Expected: 201   Received: 422
   at e2e/flights.spec.ts:621:37     (verde al retry #1)
```

**Diagnosi con la prova (non attribuita alla flake):**

| Fatto | Misura |
|---|---|
| artefatto del tentativo fallito | `test-results/flights-...-chromium/` → `2026-08-07 11:16:12.986` |
| `ExpiryType` `Tipo voli 1786094172930-f0tc3s`, `scope ALL`, `blocksBooking=true` | `createdAt = 09:16:12.946 UTC` = **11:16:12.946 locale** — **40 ms prima** |

Il test `:602` crea un velivolo e un pilota **propri** (nessun AOG possibile: l'aeromobile nasce `OPERATIONAL` in quel
test), chiama `ensureValidSeedExpiries` **prima** che quel tipo bloccante esista, e poi fa `POST /api/v1/flights` →
`FLIGHT_BLOCKED_BY_EXPIRY`. E' esattamente la razza documentata a `e2e/flights.spec.ts:695-708`: il describe
«Blocking expiry guard-rail» e' `serial` **solo contro se stesso**, non contro il resto del file. Classe TD 15.5
**pre-esistente**; il diff della story non tocca ne' `flights.spec.ts` ne' gli `ExpiryType`.
Lock anti-brute-force TD-6: nessun rosso di login, nessuna attribuzione alla flake di login.

> Nota di processo: due arbitri consecutivi, due flaky **diversi**, entrambi pre-esistenti e non attribuibili.
> Vale la pena registrare `flights.spec.ts:602` come seconda faccia misurata del TD 15.5.

## 2. Gate riverificati da me

```
PASS  lint (19s)
PASS  typecheck (3s)
PASS  test (7s) — Tests  1792 passed (1792)
PASS  build (27s)
```
Unit in shell PULITA (regola CLAUDE.md a 3 occorrenze):
`env -u DATABASE_URL -u AUTH_SECRET npx vitest run aircraft.service.test.ts bookings.service.test.ts flights.service.test.ts`
→ **3 passed / 448 tests**, verde.

---

## 3. FINDINGS

### MAJOR-1 — La deroga AOG scavalca in SILENZIO documenti bloccanti che l'operatore non ha mai visto (e contraddice un'invarianza scritta nel codice)

**File**: `src/server/services/flights.service.ts:556-563` (throw AOG, **prima** dello scan documenti) +
`:729` (`if (blockingDocuments.length > 0 || outOfServiceBlock)`) — contro il commento **`:697-698`**:
> «every blocking document across EITHER is reported together (**never partial — the admin sees the whole picture
> before deciding to override**)»

**Riproduzione (API reale, build di produzione, stessa persona, stesso volo):**

```
# CONTROLLO — velivolo OPERATIONAL, persona senza le scadenze bloccanti
POST /api/v1/flights  -> 422 FLIGHT_BLOCKED_BY_EXPIRY
   details.documents = ["Visita medica classe 2","Licenza",
                        "Tipo prenotazioni ...9gxyfk","...ivo99h","...6ivbh6","...oql1dq"]   (6 documenti NOMINATI)

# STESSA persona, STESSO volo, velivolo ora AOG
POST /api/v1/flights  -> 422 AIRCRAFT_OUT_OF_SERVICE
   details = {"reason":"Revisione","outOfServiceUntil":"2026-08-27"}      <-- NESSUN documento nominato

# l'admin deroga avendo letto SOLO il fermo
POST /api/v1/flights {force:true, forceReason:"Deroga pensata SOLO per il fermo"}
   -> 201   forcedAt="2026-08-07T09:29:08.484Z"   forceReason="Deroga pensata SOLO per il fermo"
```

Il volo e' registrato con **6 documenti bloccanti scavalcati**, di cui l'operatore non ha mai letto il nome, con una
motivazione scritta per un blocco diverso. Lo **stamp appiattisce**: `forcedAt`/`forcedByUserId`/`forceReason` non
registrano *quali* blocchi sono stati scavalcati, quindi ne' il badge «Deroga» ne' l'audit trail distinguono
«ho derogato al fermo» da «ho derogato al fermo E a una visita medica scaduta».

**Perche' e' un finding e non una preferenza.** R-AOG-c ratifica «UN SOLO `force` copre entrambi i blocchi» e §I.2
del record ratifica l'**ordine** del 422 («vince il 422 di stato»). Nessuna delle due dichiara la **conseguenza
informativa**: sul percorso AOG la garanzia della 14.4 (AC 1/4: nominare OGNI documento bloccante prima che l'admin
decida) **non vale piu'**, e il commento che la enuncia (`:697-698`) e' rimasto in pagina, ora falso. Un guard-rail
di sicurezza (visita medica / licenza scaduta) diventa scavalcabile con una conferma data per un altro motivo.

**Decisione PO da sottoporre** (tre opzioni, tutte piccole):
1. **Accettare e DICHIARARE** — aggiornare il commento `:697-698` e il record perche' smettano di promettere il
   quadro completo, e registrare il TD.
2. **Il 422 AOG porta anche i documenti** — `details: { reason, outOfServiceUntil, documents }` (lo scan gia' esiste
   piu' sotto; costo: spostare/duplicare la chiamata quando `outOfServiceBlock` e' vero) e il messaggio UI li elenca.
3. **Doppio passo** — dopo il force sull'AOG, se restano documenti bloccanti si risponde `FLIGHT_BLOCKED_BY_EXPIRY`
   e si chiede una seconda conferma (rompe pero' il «un solo force» ratificato).

*(Le opzioni 2 e 3 hanno un costo non nullo e toccano un contratto ratificato: la scelta e' del PO, non del dev.)*

---

### MINOR-1 — La Panoramica ora dichiara sulla STESSA schermata due numeri di flotta incompatibili

**File**: `src/app/[locale]/dashboard/page.tsx:332-340` (`aogCount = outOfServiceAircraft.length`, non paginato)
contro `:268` (`operationalIds`, dai **primi 100** per marca) usato a `:543` (KPI «Flotta disponibile») e
`:733-734` (`totalCount`/`availableCount` del widget Flotta).

**Misura dal vivo (DB post-suite, 175 velivoli attivi, stesso istante):**

```
/it/dashboard   .page-head .sub : "LIIK · 24 AOG · 15 PPR in attesa · 4 in transito al suolo"
/it/dashboard   KPI             : "Flotta disponibile 87 / 88"
/it/dashboard/fleet .sub        : "175 totali · 151 disponibili · 24 AOG"
```

`88 operativi + 24 AOG = 112`: ne' 100 (la pagina) ne' 175 (la flotta). **Prima** del fix i due numeri della
Panoramica erano entrambi cappati e quindi **coerenti fra loro** (`100 - 88 = 12 AOG`, e `12 + 88 = 100`): sbagliati
rispetto alla Flotta, ma non contraddittori sulla stessa schermata. Il fix parziale ratificato (R-AOG-f) ha chiuso
una faccia e **aperto una contraddizione interna**. Il record (§H c) dichiara che «restano aperte le altre tre
pagine», ma non misura ne' dichiara questo effetto **sulla pagina appena fixata**, che e' proprio quella dell'AC 13
(«la Panoramica smette di dichiarare un numero falso» — il KPI ne dichiara ancora uno, e ora stona).

**Decisione PO**: estendere lo stesso lettore a `operationalIds.length`/`totalCount` (2 righe, nessuna query nuova
oltre a quella gia' aggiunta) oppure dichiarare esplicitamente la convivenza dei due scope.

---

### MINOR-2 — Asimmetria di contratto: la richiesta rifiuta `null`, la risposta lo restituisce

**File**: `src/lib/schemas/aircraft.ts:102` (`outOfServiceUntil: z.iso.date().optional()`) contro
`:191` (`outOfServiceUntil: z.iso.date().nullable()`).

```
POST /api/v1/aircraft/{id}/out-of-service  {"reason":"edge","outOfServiceUntil":null}
   -> 422 VALIDATION_ERROR
```

Un client (la futura app Flutter e' un consumatore dichiarato dell'API) che legge un `Aircraft` e rimanda indietro
il campo cosi' com'e' letto prende un 422. La convenzione del repo per un campo opzionale **e** azzerabile e'
`.nullish()` — nello **stesso file**, `updateAircraftSchema:74-79` (`notes`, `seats`, `fuelType`).
Costo del fix: `.nullish()` + `input.outOfServiceUntil == null ? null : parseDateOnlyUtc(...)` (il service gia'
tratta `undefined` come `null`). Alternativa: dichiararlo.

---

### LOW-1 — AC 11: il record dichiara «provato su ENTRAMBI i call-site», l'e2e prova il messaggio su UNO solo

**File**: `e2e/aircraft-out-of-service-until.spec.ts:390-402`. Sulla CTA «Pianifica volo» della Panoramica lo spec
asserisce solo `force-flight-section` count 0 e l'etichetta dell'opzione del picker: **non** invia il form e **non**
legge `flight-form-error`. §C (AC 11) dice «Provato su **entrambi** i call-site».

**Ho verificato dal vivo che il claim e' VERO** (quindi e' un buco di prova, non un difetto):

```
[cta it]     422 msg: "Il velivolo I-AAU3... è fuori servizio: Revisione CTA .... Fermo fino al 06/09/2026 compreso."
[logbook it] 422 msg: "Il velivolo I-AAU3... è fuori servizio: Revisione CTA .... Fermo fino al 06/09/2026 compreso."
[cta en]     422 msg: "Aircraft I-AAU3... is out of service: Revisione CTA .... Grounded until 06/09/2026 inclusive."
[logbook en] 422 msg: "Aircraft I-AAU3... is out of service: Revisione CTA .... Grounded until 06/09/2026 inclusive."
force section count: 1 in tutti e quattro i casi
```
Fix: una asserzione in piu' nello spec (il flusso e' gia' scritto per il registro voli).

### LOW-2 — Il fallback del picker in correzione perde il suffisso «(fuori servizio)»

**File**: `src/app/[locale]/dashboard/logbook/flight-editor.tsx:429-431`. Quando si corregge un volo il cui velivolo
NON e' fra le `aircraftOptions` (archiviato, o oltre `OPTIONS_PAGE_SIZE`), l'opzione inserita in testa e' la marca
nuda, senza il suffisso che AC 12 chiede. Caso limite delimitato dal TD `OPTIONS_PAGE_SIZE` gia' aperto.

### LOW-3 — L'audit `data-testid^=` di §J e' incompleto (la conclusione resta valida)

§J elenca 10 prefissi; il grep reale ne da' **12 + 1 dinamico**: mancano `pilot-row-`,
`reports-rank-aircraft-row-` e il loop `[data-testid^="${prefix}"]` di `e2e/mobile-reports.spec.ts:611-612`
(`reports-fleet-row-`, `reports-rank-aircraft-row-`, `reports-rank-pilot-row-`, `reports-instructor-row-`).
Nessuno copre `out-of-service-*`, quindi la scelta del testid resta corretta: e' un difetto di **accuratezza del
record**, non di codice.

### LOW-4 — TD 14.8 F6 raggiungibile dal campo nuovo: confermato empiricamente

```
POST /out-of-service {"outOfServiceUntil":"0001-01-01"} -> 200, DTO restituisce "1901-01-01"
```
Dichiarato onestamente in §H (a) (`parseDateOnlyUtc` mappa gli anni 0-99 su 1900+anno) e non raggiungibile dal
`DateInput` nativo — ma **e' raggiungibile dall'API**, che questa story dichiara consumata anche da un client
mobile. Nessuna azione richiesta: la dichiarazione e' accurata. Solo consapevolezza PO.

### INFO — Il bundle i18n della pagina pubblica `/ppr` porta le 7 chiavi nuove

La «misura di controllo» («/ppr pubblico NON raggiunto») e' **vera sulla superficie resa** (0 nodi
`out-of-service-*`, nessuna differenza visiva, HTTP 200) ma **falsa sul payload**: `/it/ppr` serializza l'intero
bundle `messages/*.json` al client, quindi `"until":"Fermo fino al (compreso)"`,
`AIRCRAFT_OUT_OF_SERVICE_UNTIL`, ecc. compaiono nell'HTML. **Comportamento pre-esistente** (la stessa pagina gia'
spediva `aogTitle`, `setOutOfService`, ...): nessuna classe nuova, nessun finding.

---

## 4. Cosa ho verificato e che REGGE (prove)

### 4.1 Semantica INCLUSIVA (Q1) ai confini
| Prova | Esito |
|---|---|
| `until = OGGI`, volo **nel giorno stesso** | `422 AIRCRAFT_OUT_OF_SERVICE`, `details={"reason":"Boundary oggi","outOfServiceUntil":"2026-08-07"}` — il giorno-until e' dentro il fermo, «compreso» |
| prenotazione nel giorno **dopo** l'until | `422 AIRCRAFT_OUT_OF_SERVICE` — blocco per **STATO**, non per data: comportamento pre-esistente **invariato** |
| date-only / fuso | `@db.Date` a riposo (verificato in DB: `data_type = date`), `parseDateOnlyUtc` in scrittura, `toDateOnlyString` in lettura, `formatDateOnly` con `timeZone:'UTC'` — nessun off-by-one su 12+ round-trip misurati |
| la semantica e' scritta UNA volta | doc-comment Prisma `schema.prisma:295-311`; ogni altro punto (`aircraft.service.ts`, `aircraft-status.ts`, `schemas/aircraft.ts`, `registry.ts`) **cita** e non reinterpreta — verificato leggendo tutti e 4 |

### 4.2 Invariante [a] — il rientro non e' MAI automatico
- **Censimento rifatto da me**: `grep -rn outOfServiceUntil src/` → 19 file, di cui 4 `src/generated/prisma/**`;
  **zero** occorrenze dentro una `where` Prisma, un `if` che decida lo stato, o un job/cron. Confermo §D.
- **Dal vivo con data di IERI**: prenotazione `422 AIRCRAFT_OUT_OF_SERVICE`; volo `422 AIRCRAFT_OUT_OF_SERVICE`
  con `details.outOfServiceUntil = "2026-08-06"`; DTO di lista ancora `{"status":"OUT_OF_SERVICE","until":"2026-08-06"}`.
- **In DB**: `count(*) FILTER (WHERE status='OPERATIONAL' AND "outOfServiceUntil" IS NOT NULL) = 0` su 206 righe —
  nessuna data «orfana» sopravvive a un rientro, su dati reali generati da una suite intera.

### 4.3 Ciclo di vita
```
returnToService            -> 200  status=OPERATIONAL  statusReason=null  outOfServiceUntil=null
re-ground SENZA data       -> 200  outOfServiceUntil=null      (la data VECCHIA non sopravvive)
setOutOfService su gia'AOG -> 409  CONFLICT                    (AD-9, guardia atomica intatta)
setOutOfService con data PASSATA -> 200, accettata             (coerente con quanto dichiara la story)
```
**Concorrenza** (due `POST /out-of-service` in parallelo sullo stesso velivolo): `200` + `409`, riga finale
`{"statusReason":"Race A","until":"2026-08-12"}` — la `where: { id, status:'OPERATIONAL' }` della review 2.2 F1 e'
intatta e la data non puo' arrivare da un vincitore diverso dal motivo.

### 4.4 Guardia volo, ordine e deroga (Q3)
| Prova | Esito |
|---|---|
| archiviato **e** fermo | `422 AIRCRAFT_ARCHIVED` (stato prima del dominio) |
| `force:true` senza `forceReason` | `422 VALIDATION_ERROR` (refine dello schema) |
| `force` da istruttore / pilota / allievo | `403 FORBIDDEN` (matrice completa sotto) |
| deroga admin | `201`, `forcedAt`/`forceReason` sulla riga, badge «Deroga» (e2e) |
| vicolo cieco 14.4 F4 | **chiuso**: correzione che **mantiene** il velivolo fermo → `201`, `forcedAt=null`; storno → `200` |
| correzione che **sposta** su un velivolo fermo | `422 AIRCRAFT_OUT_OF_SERVICE` (e derogabile: `correctFlightSchema` accetta gia' `force`) |
| sezione force innescata dal 422 AOG | `force-flight-section` count **1** su entrambi i call-site, IT ed EN |
| claim strutturale della deviazione 5 | **VERIFICATO** su `rbac.ts:107-112`: `ADMIN = ALL_PERMISSIONS`; `INSTRUCTOR/PILOT/STUDENT` non hanno ne' `flights.manage` ne' `flights.forceExpiry` → nessun ruolo ha l'uno senza l'altro |

**Matrice RBAC misurata** (`POST /aircraft/{id}/out-of-service` e `POST /flights` con `force`):

| attore | out-of-service | flights + force |
|---|---|---|
| admin | 200 | 201 (con stamp) |
| istruttore | **403 FORBIDDEN** | **403 FORBIDDEN** |
| pilota | **403 FORBIDDEN** | **403 FORBIDDEN** |
| allievo | **403 FORBIDDEN** | **403 FORBIDDEN** |

### 4.5 I tre (quattro) 422
- creazione: `422` con `details {reason, outOfServiceUntil}` ✅
- spostamento: e2e ✅
- **approvazione** (`transitionBooking`, prenotazione PENDING creata dal pilota, velivolo fermato dopo):
  `422 AIRCRAFT_OUT_OF_SERVICE`, `details {"reason":"Fermo post-prenotazione","outOfServiceUntil":"2026-08-22"}`
  — il **contratto** e' arricchito, il **testo** no: divergenza dichiarata in §G, confermata ✅
- volo: ✅
- **stringa senza data BYTE-IDENTICA**: verificato per costruzione, non solo per asserzione — le chiavi
  `BookingsPage.form.errors.AIRCRAFT_OUT_OF_SERVICE` e `...list.actions.errors.AIRCRAFT_OUT_OF_SERVICE` sono
  `diff`-identiche a `414dd66` in **entrambi** i locale (la clausola vive in una chiave NUOVA `_UNTIL`).

### 4.6 Picker (Q4) — misurato su 4 combinazioni (2 pagine x 2 locale)
```
[cta it]      "I-AAU3MSIQY7YB — Revisione CTA MSIQY7YB (fuori servizio)"   aria-disabled: null
[logbook it]  idem
[cta en]      "I-AAU3MSIQY7YB — Revisione CTA MSIQY7YB (out of service)"   aria-disabled: null
[logbook en]  idem
```
Chiave i18n riusata (`BookingsPage.form.outOfServiceSuffix`, nessun hardcode — verificato a grep: 6 consumatori,
una sola stringa). Typeahead server-side funzionante (l'opzione e' arrivata via ricerca, non dalla prima pagina) e
etichettata **identica** a quella server-rendered. `AircraftOption` esportato: le uniche 2 copie locali
(`logbook-console.tsx`, `dispatch-flight-button.tsx`) sono rimosse e nessun altro file le importava
(grep: 2 soli call-site di `FlightEditor`). `AircraftFilterOption` reso esplicito: non eredita piu' campi che non usa.

### 4.7 Contatore Panoramica (Q6)
- Su DB con **175** velivoli attivi: Panoramica «24 AOG» = Flotta «24 AOG» ✅ (AC 13 chiuso).
- `listOutOfServiceAircraft` e' gia' gated `aircraft.manage` e `renderAdminOverview` e' raggiungibile solo con
  `finance.manage`, dietro un `listAircraft(actor, ...)` che chiede lo stesso permesso: nessuna esposizione nuova.
  Un PILOT non passa da qui (`renderPilotLanding`).
- Costo: una `findMany` non paginata su `status='OUT_OF_SERVICE' AND archivedAt IS NULL`, **dentro** il `Promise.all`
  gia' esistente — 25 righe su 206 nel DB reale. Accettabile.
- `aog-overview-count.spec.ts` e' nel `testIgnore` del project principale, ha `dependencies: ['mobile-settings']`
  ed e' **foglia** (nessun project dipende da lui): verificato riga per riga in `playwright.config.ts`. L'unica
  modifica al config e' l'ingresso in catena. ✅

### 4.8 UI editor (Q5/Q7) — geometrie RIMISURATE, identiche al centesimo al record

| Elemento | 1280 (mio) | 1280 (record) | 375 (mio) | 375 (record) |
|---|---|---|---|---|
| `out-of-service-submit` | **479 x 34,84** @y777,13 | 479x34,84 @y777,13 | **335 x 44** @y908,17 | 335x44 @y908,17 |
| `out-of-service-until` | **232,5 x 38,84** @y683,5 | 232,5x38,84 @y683,5 | **335 x 44** @y826,78 | 335x44 @y826,78 |
| `out-of-service-reason` | 479 x 55,69 @y592,59 | idem | 335 x 55,69 @y735,88 | idem |

**Confine della media query, misurato**: a **640** il submit e' 44; a **641** e' **34,84** — la regola e'
mobile-only alla lettera.

**Cascata della regola nuova (lezione 15.9), enumerata dal CSSOM a runtime:**
```
rules touching out-of-service-submit: 1
  [data-testid="out-of-service-submit"]  @media (max-width: 640px)  { min-height: 44px; }
matchedNodesOnThisPage: 1     totalNodesWithTestid: 1
```
Un solo nodo in tutta l'app (`aircraft-editor.tsx:810`); nessun'altra regola nel foglio tocca quel selettore.

**Contrasti ricalcolati (canvas → sRGB → WCAG, sfondo effettivo risalendo gli antenati, `getClientRects().length>0`):**

| Testo nuovo | chiaro | scuro | soglia |
|---|---|---|---|
| `.fld-label` «Fermo fino al (compreso)» (10,5px) | **4,85** | **5,72** | ≥4,5 ✅ |
| `.fld-hint` «Facoltativo: l'ultimo giorno di fermo…» (12px) | **4,85** | **5,72** | ≥4,5 ✅ |
| `availability-current` con la clausola inclusiva (10,5px) | **4,85** | **5,72** | ≥4,5 ✅ |
| `out-of-service-until` (valore, 13px) | 17,79 | 14,77 | ≥4,5 ✅ |

Identici al centesimo a §F. **Testi resi, verbatim, nei due locale:**
```
IT: "Stato attuale: Revisione CTA MSIQW5II · fermo fino al 06/09/2026 compreso"
EN: "Current status: Revisione CTA MSIQW5II · grounded until 06/09/2026 inclusive"
IT: "Fermo fino al (compreso)" / "Facoltativo: l'ultimo giorno di fermo. Vuoto = rientro da definire."
```
**Le due facce di AD-9**: su velivolo gia' AOG `out-of-service-until` e `out-of-service-submit` hanno **count 0**
(rimisurato). Nessun controllo che porterebbe sempre a 409.
**Nessuno stato che sopravvive fra aperture**: `FleetConsole:307` monta `AircraftEditor` con
`key = target===null ? 'closed' : ... : target.aircraft.id` → lo stato `until` non puo' bleedare (classe 14.4 F1).

### 4.9 Discriminanze — ne ho ripercorse DUE io stesso (worktree usa e getta, repo intatto)

| Simulazione del pre-fix | Comando | Esito |
|---|---|---|
| `outOfServiceBlock` neutralizzato in `resolveFlightInput` | `env -u DATABASE_URL -u AUTH_SECRET npx vitest run flights.service.test.ts` | **8 failed / 142 passed** |
| `returnToService` senza `outOfServiceUntil: null` | idem su `aircraft.service.test.ts` | **1 failed / 57 passed** |
| regola CSS rimossa **a runtime** dal CSSOM, 375px | Playwright | **44,00 → 34,84** |

Le tre guardie discriminano davvero. Il worktree e' stato rimosso (`git worktree list` → solo `/home/admin/AirManager`),
**nessun file del repo e' stato modificato** (`git status` invariato rispetto all'inizio della sessione).

### 4.10 Contratti / OpenAPI (documento GENERATO, non il registry)
```
SetOutOfServiceRequest: {"type":"object","properties":{
   "reason":{"type":"string","minLength":1,"maxLength":500},
   "outOfServiceUntil":{"type":"string","format":"date"}}, "required":["reason"]}
Aircraft.outOfServiceUntil: {"type":["string","null"],"format":"date"}
POST /aircraft/{id}/out-of-service  200 -> lo STESSO oggetto Aircraft (nessun DTO nuovo: cucitura 1b intatta)
description mentions INCLUSIVE: true
```
`rbac.ts`: **solo** doc-comment (`:58-64`), `ALL_PERMISSIONS` e `ROLE_PERMISSIONS` byte-identici — verificato a diff.

### 4.11 Test e consegna
- **Copertura non ridotta** (lezione 14.6): i tre file di test toccati cambiano solo (i) letterali di fixture per il
  campo additivo, (ii) la firma `setOutOfService(actor,id,{reason})`, (iii) i due `toHaveBeenCalledWith` **esatti**
  aggiornati al valore corretto — **mai** indeboliti a `objectContaining`. Verificato riga per riga sul diff.
  `bookings.service.test.ts:1983` (`toEqual` esatto su `BookableAircraftOption`) **non si e' rotto** ⇒ perimetro
  R-AOG-e rispettato.
- **Fixture non time-dependent**: ogni data e' `dateOnlyFromToday(offset)` calcolata a runtime; la data attesa nel
  messaggio e' prodotta dallo **stesso** `Intl.DateTimeFormat` di `formatDateOnly`. Nessun `hasText` con date o
  `H:MM`. I `<select>` sono pilotati per **valore**. Il test dell'invariante [a] usa `dateOnlyFromToday(-1)`:
  **non scadra' fra un mese**.
- **i18n**: parita' totale, `0` chiavi solo-IT e `0` solo-EN (script su tutto l'albero); tutte le 7 chiavi nuove per
  locale sono consumate.
- **`sprint-status.yaml`**: nessuna chiave `aog-1a` (come dichiarato); l'action item AOG e' ancora `open`; **il TD
  AD-9 NON e' registrato** — e' lavoro della sessione principale, il dev lo dichiara esplicitamente in §L.

---

## 5. Decisioni PO da sottoporre

1. **MAJOR-1** — la deroga informata sul percorso AOG: accettare e dichiarare (opzione 1), arricchire il 422 AOG con
   i documenti (opzione 2), o doppio passo (opzione 3, rompe «un solo force»). **Serve una ratifica**: la scelta
   cambia un contratto gia' ratificato (R-AOG-c).
2. **MINOR-1** — la Panoramica: allineare anche il KPI/widget allo stesso lettore, oppure dichiarare la convivenza
   dei due scope sulla stessa pagina.
3. **MINOR-2** — `outOfServiceUntil` in ingresso: `.nullish()` (convenzione del repo) oppure dichiarare l'asimmetria.
4. **TD AD-9 (gia' individuato dal dev)** — «la data di rientro non e' modificabile senza rientro in servizio».
   **Merita la ratifica**: e' onesto, e' davvero un TD e non un buco di AC (l'AC 5 chiede esplicitamente che il campo
   **non compaia** dove la scrittura darebbe 409, ed e' quello che fa). Va registrato in `sprint-status.yaml`
   dalla sessione principale, col testo e la misura di §H (d).
5. **TD 15.5, seconda faccia** — registrare `flights.spec.ts:602` come vittima misurata della corsa
   `ensureValidSeedExpiries` vs `ExpiryType` bloccante creato da un describe SERIAL solo contro se stesso
   (`flights.spec.ts:695-708`): pre-esistente, non di questa story, ma ora ha due occorrenze documentate.

---

## 6. Stato lasciato dalla review

- **Suite e2e**: `E2E_EXIT=0`, log corrente in `/tmp/airmanager-e2e/last-run.log`, **copia** in
  `<scratchpad>/arbiter-run1.log`.
- **Porta 3000**: **LIBERA** — il server di produzione avviato per i probe e' stato ucciso prima dei gate
  (`ss -ltnp | grep :3000` → nessun listener). `.next` e' la build di produzione prodotta da `npm run gates` su HEAD.
- **DB**: **post-suite + probe**, NON resettato. `206` velivoli, `25 OUT_OF_SERVICE` (20 con data, 5 senza),
  `0` righe `OPERATIONAL` con una data residua. **Nessun attore, nessuna impostazione, nessun velivolo di SEED e'
  stato mutato**: i probe hanno creato solo righe nuove (velivoli `I-RV*`/`I-P2*`/`I-U*`/`I-CSS*`, persone `Rev *`,
  voli e prenotazioni su quelle righe). **Il DB va resettato prima del prossimo arbitro** (regola nota:
  `datetime-picker.spec.ts:127` e i picker cappati a `OPTIONS_PAGE_SIZE` degradano oltre le ~100 persone/velivoli).
- **Repo**: nessun file modificato dal reviewer; il worktree usa-e-getta e' stato rimosso.
