# Review adversarial — Story 15.4 "Pianificazione mobile"

Reviewer: `adversarial-reviewer` (Opus 5 xhigh) — 2026-08-03
Commit sotto review: `89edaf3` (feat) + `357e7cf` (Dev Agent Record), su `dev`.
Macchina: Fedora locale dell'utente (Postgres+Mailpit via `docker compose`, non il container di CLAUDE.md).

## Verdetto

**shippable-with-fixes** — il codice di prodotto è solido (masking, RBAC, gating della CTA,
z-order, contrasti, invarianza desktop: **tutti verificati empiricamente e tutti corretti**),
ma **il gate della suite è ROSSO su DB fresco** e la causa sta in cose che questa story ha
introdotto: due test nuovi con una bomba a orologeria, un canale URL che risponde 500, e
l'impronta di fixture del nuovo spec che rompe uno spec di un'altra story.

- 4 findings **Major** (di cui 3 rendono rossa la suite / rompono un contratto dichiarato)
- 2 findings **Minor**
- 3 osservazioni (nessuna azione obbligatoria)
- 1 decisione PO da sottoporre

---

## Priorità zero — ESITO DELL'ARBITRO (suite completa, `CI=1`, build di produzione, DB fresco)

DB resettato dalla sessione principale immediatamente prima del run (volume nuovo, `migrate deploy` + `seed`).

```
$ set -a && . ./.env && set +a && export JOBS_SECRET=review-15-4-arbiter
$ CI=1 scripts/e2e.sh start          # avviato 2026-08-03T12:51:48+02:00
$ scripts/e2e.sh status
state: DONE — E2E_EXIT=1
--- summary ---
  3 failed
  19 did not run
  315 passed (6.5m)
```

**337 test totali** (326 della 15.3 + 10 di `mobile-planning.spec.ts` + 1 di `booking-window.spec.ts`).

I 3 rossi:

| # | test | causa provata |
|---|---|---|
| 1 | `e2e/mobile-planning.spec.ts:170` (agenda, 3 fasi, AOG) | **422 `BOOKING_IN_PAST`** sul `createBooking` della fixture — F1 |
| 2 | `e2e/mobile-planning.spec.ts:218` (marcatore ORA) | idem — F1 |
| 3 | `e2e/reports.spec.ts:206` (fleet/instructor/topPilot) | il velivolo run-unique è fuori dai primi 100 di `listAircraft` — F3 |

I **19 "did not run"** sono i project serializzati a valle (`settings`, `booking-window`,
`treasury-settings`, `billing-global`, `mobile-metar`, `mobile-overview-overflow`): Playwright
li salta quando la dipendenza `chromium` fallisce. **Li ho eseguiti io separatamente su DB
fresco + server riusato**, e i due che questa story tocca sono verdi:

```
$ E2E_REUSE_SERVER=1 scripts/e2e.sh start e2e/booking-window.spec.ts --project=booking-window --no-deps
state: DONE — E2E_EXIT=0 ... 4 passed (6.2s)     # incluso il test nuovo R-15.4-g (:128)
$ E2E_REUSE_SERVER=1 scripts/e2e.sh start e2e/mobile-overview-overflow.spec.ts --project=mobile-overview-overflow --no-deps
state: DONE — E2E_EXIT=0 ... 1 passed (3.9s)     # asserzione estesa alle RIGHE
```

`mobile-planning.spec.ts` ha chiuso **8/10** (verdi: tail chips, lista+sheet decisionale,
"Modifica", pannello a schermo corto, chip di stato, geometria/layering, empty state, multi-attore).

**La diagnosi §9 del Dev Agent Record è sbagliata.** Il dev attribuiva i 10 rossi di
`bookings.spec.ts` a volume del DB (7) e a `maxAdvanceDays` cross-spec (3), e prevedeva che su
DB fresco sparissero: **è vero, `bookings.spec.ts` è interamente verde in questo run** (compresi
i due test riscritti :864 e :906 e la guardia intatta :813). Ma il dev dichiarava anche
«spec nuovo verde (10/10)»: quel verde era un artefatto dell'**ora del giorno** in cui ha
lanciato il run (commit delle 11:36 CEST), non una proprietà del codice (F1).

`npm run gates`: **verde** (lint 19s, typecheck 2s, 1654 unit test, build 25s).
Unit nuovi anche senza env (lezione CLAUDE.md a 3 occorrenze):
`env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/lib/mobile-agenda.test.ts src/lib/booking-status-filter.test.ts` → **24 passed**.

---

## Findings

### F1 — MAJOR — `mobile-planning.spec.ts` è una bomba a orologeria: 2 test rossi da mezzogiorno in poi, 4 in totale nell'arco della giornata

**File**: `e2e/mobile-planning.spec.ts:101-105` (`todaySlotUtc`), usato a `:179`, `:180`, `:181`, `:224`, `:225`, `:258`, `:627`.
**Regola violata**: `bookings.service.ts:531` — `if (startsAt.getTime() <= Date.now()) throw ValidationError(... 'BOOKING_IN_PAST')`, valida **per tutti**, staff incluso (lo dice il doc-comment dello spec stesso a `:113-118`).

`todaySlotUtc(10)` costruisce uno slot **alle 10:00 UTC di oggi**. Se la suite parte dopo le
10:00 UTC (= 12:00 Roma in estate) quello slot è nel passato e la POST risponde 422 — prima
ancora che il test veda una pagina. Le fixture vengono poi spostate con `moveBooking` (che è
esente), ma **la CREATE avviene prima dello spostamento**.

Scadenze per test (ora di Roma, DST estiva):

| riga | slot | il test muore dopo le |
|---|---|---|
| `:179-181` (test agenda) | `todaySlotUtc(10)` | **12:00** |
| `:224-225` (test marcatore ORA) | `todaySlotUtc(10)` | **12:00** |
| `:258` (test tail chips) | `todaySlotUtc(13)` | **15:00** |
| `:627` (test multi-attore) | `todaySlotUtc(15)` | **17:00** |

**Evidenza** (arbitro, run partito alle 12:51 Roma — 3 tentativi ciascuno, tutti rossi):

```
1) [chromium] › e2e/mobile-planning.spec.ts:170:7 › day view at 375px …
    Error: {"error":{"code":"BOOKING_IN_PAST","message":"startsAt must be in the future."}}
    Expected: 201   Received: 422
      at createBooking (e2e/mobile-planning.spec.ts:109:52)
      at e2e/mobile-planning.spec.ts:179:18
2) [chromium] › e2e/mobile-planning.spec.ts:218:7 › the ORA marker exists once …
    Error: {"error":{"code":"BOOKING_IN_PAST", …}}   at :224:18
```

**Riproduzione**: `date` ≥ 12:00 Roma, DB fresco, `scripts/e2e.sh start e2e/mobile-planning.spec.ts`.
**Fix suggerito**: creare le fixture su uno slot **futuro dentro la finestra** (è il pattern che
gli altri test dello stesso file già usano: `${tomorrow}T08:00:00.000Z`) e poi `moveBooking`
sugli istanti voluti — la funzione c'è già. Io ho usato esattamente questo schema nelle mie
probe e regge a qualunque ora (`fixtures.mjs`, scratchpad). Un `todaySlotUtc` che parte da
`Date.now()` è comunque sbagliato: va eliminato o vincolato a `> now`.

---

### F2 — MAJOR — `?status` ripetuto risponde **500**: il contratto "un valore a mano non produce MAI un errore" è rotto

**File**: `src/lib/booking-status-filter.ts:37` (firma `raw: string | undefined`) e `:40` (`raw.split(',')`);
`src/app/[locale]/dashboard/bookings/page.tsx:32` (`searchParams: Promise<{ …; status?: string }>`) e `:210`.

In Next.js App Router `searchParams` restituisce **`string | string[]`**: un parametro ripetuto
è un array. Il tipo dichiarato mente, e `raw.split` esplode. Il doc-comment della funzione
promette il contrario ("an unknown, empty or malformed value NEVER errors"), e l'AC 6 lo chiede
esplicitamente ("valore ignoto ⇒ default, **mai** un errore").

**Evidenza** (build di produzione, admin loggato):

```
{"u":"/it/dashboard/bookings?status=PENDING","status":200,"hasList":1}
{"u":"/it/dashboard/bookings?status=PENDING&status=APPROVED","status":500,"hasList":0,
 "bodyText":"This page couldn’t load | A server error occurred. Reload to try again. | ERROR 718123473"}
{"u":"/it/dashboard/bookings?status[]=PENDING","status":200}
{"u":"/it/dashboard/bookings?status=pending","status":200}
{"u":"/it/dashboard/bookings?status=NOPE","status":200}
{"u":"/it/dashboard/bookings?status=","status":200}
{"u":"/it/dashboard/bookings?status=PENDING,APPROVED","status":200}
```

server log:
```
⨯ TypeError: a.split is not a function
    at <unknown> (.next/server/chunks/ssr/src_11pkmsi._.js:1:218)  { digest: '718123473' }
```

**E i parametri PRE-esistenti reggono** — la regressione è solo del canale nuovo:
```
/it/dashboard/bookings?view=day&view=week          -> 200
/it/dashboard/bookings?date=2026-01-01&date=…      -> 200
/it/dashboard/bookings?page=1&page=2               -> 200
```
(`sanitizeView` usa `includes`, `sanitizeDate` usa `RegExp.test` — entrambi tollerano un array;
`sanitizeBookingStatusFilter` no.)

**Fix suggerito**: `status?: string | string[]` nel `PageProps` e, nella funzione pura,
normalizzare in testa (`const value = Array.isArray(raw) ? raw.join(',') : raw`) — più un unit
test sul caso array in `booking-status-filter.test.ts` (oggi gli 8 test coprono solo stringhe).

---

### F3 — MAJOR — i 10 velivoli/run del nuovo spec sfondano il tetto di 100 di `listAircraft` e rendono rosso `reports.spec.ts:206`

**File**: `e2e/mobile-planning.spec.ts:72-79` (`createAircraft`, prefisso `I-P…`), chiamata 10 volte per run;
`src/server/services/stats.service.ts:160` — `listAircraft(actor, { page: 1, pageSize: 100, includeArchived: false })`, ordinato per `registration asc`;
`e2e/reports.spec.ts:235-236` — `after.fleet.find(row => row.registration === aircraft.registration)`.

`getStats` legge **solo i primi 100 velivoli in ordine di targa**. Le targhe che il nuovo spec
conia (`I-P<tag><suffisso>`) ordinano **prima** di quelle di `reports.spec.ts` (`I-RP…`), quindi
lo spostano fuori dalla finestra.

**Evidenza** — stato del DB al termine del run arbitro (DB partito fresco):

```sql
SELECT count(*) FILTER (WHERE "archivedAt" IS NULL) FROM "Aircraft";   -- 116

WITH r AS (SELECT registration, row_number() OVER (ORDER BY registration ASC) AS rank
           FROM "Aircraft" WHERE "archivedAt" IS NULL)
SELECT * FROM r WHERE registration LIKE 'I-RP%' OR rank IN (99,100,101,102);
     registration     | rank
----------------------+------
 I-PNWMSD45Y6I6DJ     |   99      <- mobile-planning
 I-PRBMSD469OFI6N     |  100      <- mobile-planning
 I-PRF1785754642533-X |  101
 I-PSHMSD460GIOK8     |  102      <- mobile-planning
 I-RP5M5YLP           |  109      <- reports.spec (fuori dai primi 100)
 I-RPHOI0YV           |  110
 I-RPQ0JHV8           |  111

SELECT count(*) FROM "Aircraft" WHERE "archivedAt" IS NULL
  AND registration ~ '^I-P(AG|AO|NW|CH|CO|SH|MV|ST|EM|RB)[0-9A-Z]+$';   -- 16
```

Aritmetica: 16 velivoli `I-P*` vengono da `mobile-planning` (10 del run + 6 dei retry dei due
test di F1). Anche togliendo i 6 dei retry, `I-RP5M5YLP` starebbe a rank **103** — comunque
fuori. Senza lo spec nuovo starebbe a **93**. Il fallimento è quindi **causato dall'impronta di
fixture della story**, su una fragilità pre-esistente (TD `pageSize: 100`, già tracciato in
`sprint-status.yaml`). Errore osservato, identico su 3 tentativi:

```
3) [chromium] › e2e/reports.spec.ts:206:7 › … populates fleet/instructor/topPilot rows exactly
   Expected: {"minutes": 90, "registration": "I-RP5M5YLP", "revenueCents": 22500}
   Received: undefined
```

**Fix suggerito (serve una decisione PO, v. sotto)**: la via meno invasiva è che
`mobile-planning.spec.ts` **archivi in `afterAll` i velivoli che crea** (o ne crei molti meno:
oggi ne conia 2 dove 1 basterebbe, `:172-173`, `:255-256`); la via strutturale è alzare/paginare
il tetto in `stats.service.ts`, che però è dominio di un'altra story.

---

### F4 — MAJOR — il nuovo spec disattiva il profilo del PILOTA DI SEED dal project `fullyParallel`, e questa story ha reso la CTA dipendente da quello stato

**File**: `e2e/mobile-planning.spec.ts:668` (`POST /people/{id}/profiles/pilot/deactivate` sul pilota di seed) — file che sta nel project `chromium`, `fullyParallel: true` (`playwright.config.ts:23,42-51`);
`src/app/[locale]/dashboard/bookings/page.tsx:192-198` (`canCreateNew`) → `bookings-table.tsx:557` (la CTA non viene renderizzata affatto).

Fino alla 15.4 il bottone c'era comunque (e il 403 arrivava al submit). Ora **sparisce dal DOM**.
Nel frattempo `e2e/bookings.spec.ts` fa login come `pilot@airmanager.local` e **clicca
`new-booking-button`** in 4 punti (`:383-390`, `:419`, `:1066`, `:1134` e dintorni; 13 occorrenze
del testid nel file). Se un worker concorrente entra nella finestra di disattivazione, quel
click va in timeout: rosso non deterministico, su uno spec che questa story non tocca.

**Evidenza** (build di produzione, misura diretta della dipendenza):

```
[pilot profile ACTIVE]       CTA=1  POST /api/v1/bookings=201  sheetActions=["booking-move-action-mobile","booking-cancel-action-mobile"]
deactivate: 200
[pilot profile DEACTIVATED]  CTA=0  POST /api/v1/bookings=403  sheetActions=["booking-move-action-mobile","booking-cancel-action-mobile"]
restore: 200
```

(La stessa misura conferma anche due cose GIUSTE: il gating della CTA coincide **esattamente**
con il 403 del server — R-15.4-f rispettata alla lettera — e il pilota disattivato **conserva
"Modifica"/"Annulla"** sulle proprie righe, cioè la decisione §4.2 del record regge.)

**Regola di progetto violata**: `playwright.config.ts:38-41` — «Any future spec with the same
requirement must join this chain the same way»; e il precedente registrato in HANDOFF (15.1:
«un subagent morto aveva patchato i ruoli di `pilot@airmanager.local`… bonificare il DB»).

**Fix suggerito**: o il test multi-attore migra in un project serializzato, o — meglio — usa un
attore **proprio** invece del pilota di seed (la story ha già `createPilot`; serve solo un
utente con password nota, oppure si verifica il caso "profilo assente" su una persona nuova
senza account, leggendo `canCreateNew` dal payload invece che dal DOM di quell'utente).

---

### F5 — MINOR — la regola `.bottom-sheet-actions` introdotta per un difetto misurato **non ha guardia** (AC 11)

**File**: `src/styles/airops.css:2318-2325`.

Il record (§4.6) motiva la regola con una misura ("quattro decisioni schiacciate su una riga da
195px") ma la tabella §5 elenca 7 guardie e **questa non c'è**. Nessun test asserisce la
geometria dei bottoni dello sheet: rimuovendo la dichiarazione la suite resta verde.

**Evidenza** (sheet di una PENDING come admin, 375px — POST vs simulazione del pre-fix
`flex-basis: 0%` iniettata a runtime):

```
POST:  [{approve w=166.5 top=637 left=17},{reject w=166.5 top=637 left=192},
        {move w=166.5 top=689 left=17},{cancel w=166.5 top=689 left=192}]   wrap=wrap basis=calc(50% - 4px)
PRE :  [{w=79.3 top=689 left=17},{w=79.3 left=104},{w=79.3 left=192},{w=79.3 left=279}]
```

79.3px non contengono "Modifica"/"Annulla": è un difetto visivo vero, che può tornare senza che
nulla diventi rosso — la classe esatta della "guardia mancante" delle review 15.1 F2 e 15.2.

**Nota positiva sullo stesso punto**: i **due gemelli** dichiarati identici dal dev lo sono
davvero, misurati da me con e senza la dichiarazione nuova:

```
[coda pending della home]  POST [{w:166.5,h:44,top:689,left:17},{w:166.5,h:44,top:689,left:192}]
                           PRE  [{w:166.5,h:44,top:689,left:17},{w:166.5,h:44,top:689,left:192}]
[coda PPR]                 POST [{ppr-approve w:166.5,h:44,top:689,left:17},{ppr-reject w:166.5,h:44,top:689,left:192}]
                           PRE  [identico]
```

---

### F6 — MINOR — con `?status` attivo la sottotestata della card può contraddirsi ("2 in attesa · 0 totali"), **anche sul desktop**

**File**: `src/app/[locale]/dashboard/bookings/page.tsx:213` (`total` ora è il totale **filtrato**) e `:225-226` (`pendingCount`, query separata **non filtrata**); reso in `bookings-table.tsx:552` con `messages/it.json:1560` («{pending} in attesa · {total} totali»).

Prima di questa story `pending ≤ total` era vero per costruzione. Ora non più.

**Evidenza** (stessa misura a 375 e a 1280 — quindi è anche una modifica di ciò che il desktop *dice*, pur senza toccarne il DOM):

```
[375]  /it/dashboard/bookings                 sub="2 in attesa · 30 totali"  rowsMobile=20
[375]  /it/dashboard/bookings?status=PENDING  sub="2 in attesa · 2 totali"   rowsMobile=2
[375]  /it/dashboard/bookings?status=DENIED   sub="2 in attesa · 0 totali"   rowsMobile=0   <-- contraddizione
[1280] /it/dashboard/bookings?status=DENIED   sub="2 in attesa · 0 totali"   rowsDesktop=0
```

**Fix suggerito**: quando `statusFilter.param !== null`, o si nasconde la parte "in attesa", o si
aggiunge al sub un'indicazione del filtro attivo. Costo: una riga di label.

---

## Osservazioni (nessuna azione richiesta — ratificate o pre-esistenti)

1. **Righe AOG indipendenti dalla data e sempre in testa** (R-15.4-h). Su un DB con 6 velivoli
   fuori servizio l'agenda apre con 6 righe prima del primo movimento, **su qualunque data**
   (anche 2031), e il sub dichiara "11 movimenti" mentre le righe visibili sono 17. È coerente
   col desktop (che mostra il blocco AOG su ogni giorno) e col conteggio documentato ("movimenti",
   non "righe"), ma su una flotta con molti AOG l'agenda del telefono si apre lontano dall'ORA.
   Misurato: `rowsTotal=17`, `mobile-agenda-count="11 movimenti"`.
2. **Nessun controllo di `?status` sopra i 640px** (ratifica R-15.4-e, opzione A): un utente
   desktop che apre il deep link vede una lista filtrata senza affordance per svuotare il filtro.
   Ratificato dal PO, lo segnalo solo perché F6 lo rende più visibile.
3. **`href` senza prefisso di lingua sulle righe della settimana mobile**
   (`/dashboard/bookings?date=…`, mentre `calendar-next` è `/it/dashboard/bookings?…`): il click
   funziona (`router.push` di next-intl), e **è la stessa identica costruzione del desktop**
   (`schedule.tsx:696-700`, `<a href={href} onClick={preventDefault; router.push}>`). Parità
   esatta con il pre-esistente ⇒ non è un finding di questa story.

---

## Verifiche empiriche superate (claim del dev CONFERMATI)

Tutte le misure sotto sono mie, su build di produzione, DB resettato da me a metà review.

| area | esito |
|---|---|
| **Masking 14.5 sulle superfici NUOVE** | pilota e allievo vedono `Occupato` nella riga d'agenda **e nello sheet**; `ISTRUTTORE —`, `NOTE —`; il payload RSC non contiene né la nota (`cardsWithSecret:false`) né il nome dell'istruttore (`instructorNameLeak:false`); l'API `/bookings?status=…` come pilota restituisce `personName/instructorName/notes/denyReason` tutti `null`. Nessun oracolo introdotto da `?status`. |
| **RBAC matrice** | admin / istruttore / pilota / allievo: agenda e lista visibili a tutti, chip presenti, overflow di pagina 0; CTA = 1/1/1/**0** (l'allievo non ha profilo pilota ⇒ `createBooking` risponderebbe 403: gating corretto). |
| **Attore MULTI-ruolo** (lezione 15.1) | `roles=['INSTRUCTOR','PILOT']` via `PATCH /users/{id}`: pagina 200, `mobile-agenda`=1, `mobile-bookings-list`=1, CTA=1, tab bar 6 voci, overflow 0, **0 errori di console/pageerror**, `mobile-booking-sheet` non duplicato. Ruoli ripristinati. |
| **Race su decisioni concorrenti** | un secondo attore approva prima → il tap "Approva" nello sheet prende `422 BOOKING_TRANSITION_INVALID`, **lo sheet si chiude** (`sheets:0`) e il toast dice «Questa prenotazione è già stata aggiornata da un altro operatore…». AC 5 (`stale`) verificato dal vivo, non solo letto. |
| **Z-order e layering** | tab bar 5 < sheet **40** (il punto centrale della tab bar col sheet aperto colpisce `bottom-sheet-close`) < pannello **50** < picker **66**; il popover del picker è interamente dentro il viewport, **si sovrappone alla barra `.so-actions` e sta SOPRA** (`elementFromPoint` → `cal-cell`); `.so-actions` `position: sticky` a 375px. |
| **Marcatore ORA** | `<div tabindex=-1>`, non focusable, nessun ruolo: separatore, non comando (AD-4). Testo reale: `ORA · 13:15` (niente chiave i18n grezza). Pillola desktop riparata: `data-time="13:15"`, `::before content "13:15"`, width **41.66px** — identica alla misura del record. |
| **Geometria mobile** | `/dashboard/bookings` e `?view=week`, a **375** e **390**: overflow di pagina **0**, overflow del body **0**, **0 controlli** intersecano la tab bar (test su ogni `.page a, .page button` con scroll verticale di pagina). Con dati **lunghi reali** (nome 40 caratteri, note 80, motivo AOG 90, targa 20) le righe restano a 317px e l'overflow resta 0; anche con text-node substitution su nomi/sub/badge l'overflow di pagina resta 0. La strip dei chip scorre **dentro di sé** (`scrollWidth 2646` vs `clientWidth 317`, `overflow-x:auto`). |
| **Contrasto, entrambi i temi** (canvas→WCAG, colori risolti via canvas perché Chromium serializza `lab()`/`oklab()`) | chiaro/scuro: `mobile-row-name` 18.79/15.74 · `t1` 18.79/15.74 · **`t2` 4.85/5.72** · `sub` 4.85/5.72 · etichetta ORA 11.13/9.74 · **pallino ORA 11.13/9.74** · bordi riga ok 5.04/11.01, accent 4.01/11.53, info 6.26/9.76, **bad 6.74/8.79** · chip attiva 17.99/17.00 · chip inattiva 18.79/15.74 · chip targa di riga 17.01/17.67 · badge fase 8.46-11.32 / 8.79-9.57 · badge AOG 8.38/7.46 · chip di stato 17.99/15.74 · chevron settimana 3.66/4.14 (oggetto grafico, ≥3:1). **Tutti i numeri del record §6 riprodotti.** La striscia `--accent-soft` su `--panel` sta a 1.16/1.38 — è uno sfondo, non porta informazione: dichiarazione del dev accettata. |
| **Gemello `.mobile-row-t2`** | unico altro consumer = "La mia giornata" dell'istruttore (15.3): stesso guadagno (4.85/5.72), **geometria invariata** (`46px 109.875px 105.125px`, riga 60px, font 10px) — cambio di solo colore, confermato. |
| **Invarianza desktop, DUE pagine** (`/dashboard/bookings` e `/dashboard`), 641/800/1280 | rail **64px** a 641 e 800; alberi mobile `visible:false` a tutte e tre le larghezze; tab bar presente ma **non visibile**; `.page`, `.page-head`, `.schedule`, `.students`, i due `.card-head` identici fra le due pagine a parità di larghezza; overflow 0; `.bookings-head > .btn.primary` ha `flex-basis:auto` (regola inerte >640). Pannello `SlideOver`: `x:760 w:520 h:900` a 1280, `.so-actions` `position: static`, bottoni **68 / 90 px**, `.so-body` `padding-bottom: 18px` — **esattamente** i numeri pre/post del record §7. |
| **Blast radius dei selettori nuovi** (letto selettore per selettore E misurato) | su 13 pagine × 2 larghezze, `.mobile-chip-strip > .btn`, `.bookings-head > .btn.primary`, `a.mobile-row`, `.mobile-row-edge-*`, `.mobile-agenda-now*`, `.schedule-mobile`, `.bookings-mobile`, `.mobile-agenda-count` **non matchano nulla** fuori dalle due card di questa story; `.bookings-head > .btn.primary` matcha **solo** `new-booking-button`; `.so-actions` matcha 1 nodo per pannello aperto (bookings, ppr, movements). La guardia (vii) del record — claim solo "strutturale" — regge anche alla misura. |
| **`?status` attraverso tutto** | `calendar-next` → `?date=…&status=PENDING`; riga settimana mobile → `?date=…&status=CANCELLED`; export XLS → `status=PENDING` (asserito dall'e2e); `?page` fuori range clampato senza URL bugiardi; agenda **indifferente** al filtro (APPROVED-only, R-15.4-i): 17 righe con `status=DENIED` come senza. |

---

## Decisione PO da sottoporre all'utente

1. **F3 — chi paga il tetto dei 100 velivoli?** Il gate è rosso perché `mobile-planning.spec.ts`
   conia 10 velivoli per run e `stats.service.ts:160` ne legge 100. Due strade:
   (a) lo spec pulisce/riduce le sue fixture (chirurgico, dentro il fix di review);
   (b) si alza/pagina il tetto in `stats.service.ts` (chiude il TD, ma è dominio di un'altra story).
   Raccomandazione del reviewer: **(a) adesso**, e il TD (b) resta aperto dove già sta.
2. **TD §10.1 del record confermato dalla misura**: `updateBooking` non ricontrolla la finestra
   di prenotazione (`PATCH` fuori finestra → **200**, asserito e documentato in
   `booking-window.spec.ts:175` e verificato in questo run). Il ramo client
   `BOOKING_OUTSIDE_WINDOW` sul form di **modifica** è quindi codice oggi irraggiungibile — non è
   un difetto introdotto qui, ma va deciso se aggiungere il controllo server. **Ho verificato che
   il ramo non maschera nient'altro**: il form di modifica conserva `BOOKING_IN_PAST`,
   `BOOKING_ALREADY_STARTED`, `EXPIRED_DOCUMENTS`, `conflict` e il generico; e il messaggio su
   **creazione** funziona per davvero (test `booking-window.spec.ts:128` verde: banner con 14:00 e
   18:00, senza "Riprova").

---

## Stato lasciato dalla review

- **DB: SPORCO** — l'ho resettato a metà review (volume nuovo + `migrate deploy` + `db seed`) per
  le probe, e le probe l'hanno riportato a **23 velivoli non archiviati**, più persone, prenotazioni
  e 1 PPR pendente. Attori di seed **ripristinati e verificati** (`roles` originali, `PilotProfile.deactivatedAt IS NULL`).
  **Prima del prossimo run che conta serve un reset.**
- **Porta 3000 libera**: il server di produzione che avevo avviato per le probe è stato terminato.
- Script di probe throwaway (mai committati) in
  `/tmp/claude-1000/-home-admin-AirManager/ee712b45-2921-41fc-b3f4-238d53ae4fd0/scratchpad/`
  (`p1-status.mjs`, `p2-selectors.mjs`, `p3-contrast.mjs`, `p4-aog-geom.mjs`, `p6-long.mjs`,
  `p7-rbac.mjs`, `p8-cta-multirole.mjs`, `p9-twins.mjs`, `p9b-ppr.mjs`, `p10-z-race.mjs`,
  `p11-status-ui.mjs`, `p12-desktop.mjs`, `p13-instr-twin.mjs`, `p14-pilot-status.mjs`).
- ⚠️ Il log dell'arbitro (`/tmp/airmanager-e2e/last-run.log`) è stato **sovrascritto** dai due run
  mirati successivi: i numeri e gli errori sono trascritti verbatim qui sopra. Lezione per il
  prossimo arbitro: **copiare il log** prima di lanciare qualunque run mirato.
