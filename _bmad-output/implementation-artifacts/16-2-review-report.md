# Review adversarial — Story 16.2 «Il registro voli rifiuta duplicati e sovrapposizioni, e il contaore non perde minuti in silenzio»

**Data**: 2026-09-26 · **Reviewer**: subagent Opus 5.5 (unico layer adversarial) — **RE-RUN** (il primo reviewer, 2026-09-10, è stato fermato dal PO prima di produrre il report; il suo arbitro non conta: log perso, albero con WIP altrui)
**Commit sotto review**: `3138115` (feat, 15 file) + `bc64012` (Dev Agent Record)
**HEAD all'inizio e alla consegna**: `ed205bc` (nessun commit intervenuto; albero pulito salvo le cartelle untracked dell'utente, non toccate)
**Contratto**: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 16.2» · story file `_bmad-output/implementation-artifacts/16-2-guardie-registro-voli.md` (21 AC)
**Finding dell'audit chiusi**: `ops-audit.md` §F3, §F13, §F14 (+ §5.2 idempotenza da lasciare esatta)

---

## Verdetto

### SHIPPABLE-WITH-FIXES

Il cuore server della story è **corretto e verificato sul vivo**, non per lettura: la guardia di
sovrapposizione regge sotto concorrenza reale (4 raffiche da 2, 3, 3 e 5 POST paralleli → sempre
**esattamente una** 201), la semantica semi-aperta è quella delle prenotazioni, `CANCELLED` non occupa,
`force` non deroga, la correzione esclude l'originale e interroga il velivolo **nuovo**, il contratto
TD-2 è intatto, il clamp del contaore ora lascia la sua `HourMeterAdjustment` (e solo quando morde,
e rollbacka con la transazione), i bordi F14 sono al posto giusto. Arbitro e2e **532/532 verdi, 0 flaky**
su DB fresco. Dopo l'intera suite il DB contiene **0** coppie `REGISTERED` sovrapposte sullo stesso
velivolo, **0** voli con cicli a 0, **0** voli sotto il minuto, **0** contaori negativi.

**Un difetto funzionale reale** (la pista lasciata dal primo reviewer è **confermata**): sul percorso
**«Forza registrazione»** del form, un 409 `FLIGHT_OVERLAP` mostra «Impossibile forzare la registrazione.
Riprova.» — e riprovare dà lo stesso 409 all'infinito. Non è una corsa: è **deterministico**, perché
l'ordine degli errori (422 prima del 409, AD-4) fa sì che una richiesta sovrapposta **e** bloccata
(documento o AOG) arrivi al 409 **solo** passando dalla forzatura. Viola l'AC 18 e smentisce la
motivazione stessa della non-derogabilità ratificata («nessun vicolo cieco: il 409 nomina il volo»).
Fix piccolo, un solo file.

| # | Sev | Sostanza | File |
|---|---|---|---|
| MAJOR-1 | major | Il ramo FORCE del form risponde a `FLIGHT_OVERLAP` con «Riprova» (vicolo cieco), in registrazione **e** in correzione; banner in fondo resta quello stantio del 422 | `src/app/[locale]/dashboard/logbook/flight-editor.tsx:813-818` |
| MINOR-1 | minor | TD 16.2-g **attribuito alla sorgente sbagliata** (e la diagnosi scritta nei commenti dello spec la ripete): i tipi globali lasciati ATTIVI sono i 4 di `bookings.spec.ts` (story 7.4), non quelli del describe 14.4, che si disattivano già tutti; il «fix alla sorgente» proposto è già in atto e non chiude la finestra | `e2e/flights.spec.ts:872-885`, `:904-915` (+ il commento preesistente stantio `:704-713`); record §G/§K |
| LOW-1 | low | Doppia correzione CONCORRENTE dello stesso volo: il perdente risponde `FLIGHT_OVERLAP` nominando la correzione appena fatta dal vincitore, invece del 409 `CONFLICT` «già stornato» per cui il backstop esiste | `src/server/services/flights.service.ts:1651` vs `:1695` |
| LOW-2 | low | Censimento `ConflictError` sbagliato nei numeri («39 in 9 service» → sono **75 in 13 file** pre-story); la conclusione (nessuno passava `details`) regge | story §3.3/AD-3, `src/lib/api/handler.test.ts:299`, messaggio di commit |

**Decisioni PO**: nessuna nuova (v. §PO). La domanda aperta 16.2-f (durata minima > 1 minuto?) resta
com'è stata dichiarata dalla story.

---

## Arbitro — suite e2e completa su DB fresco (priorità zero, lanciato per primo)

Pre-condizioni verificate prima dello start: `SELECT count(*) FROM "Person"` = **4**, `"Flight"` = **0**;
nulla in ascolto su `:3000` (`ss -ltnp`). Ambiente: `set -a && . ./.env && set +a`,
`export JOBS_SECRET=local-dev-not-a-placeholder-0123456789abcdef`, `CI=1 scripts/e2e.sh start` (suite
completa, detached, build di produzione dentro il webServer). Esito letto **solo** con
`scripts/e2e.sh status`, mai rilanciando:

```
log: /tmp/airmanager-e2e/last-run.log
args: <full suite>
state: DONE — E2E_EXIT=0
--- summary ---
  532 passed (12.4m)
--- last 12 lines ---
  ...
  ✓  532 [aog-overview-count] › e2e/aog-overview-count.spec.ts:70:7 › Panoramica fleet-wide AOG count (story AOG-1a, AC 13) › ...
  532 passed (12.4m)
=== e2e end: 2026-09-26T21:16:17+02:00 ===
E2E_EXIT=0
```

**532 passed + 0 flaky + 0 failed + 0 skipped = 532, exit 0** (start 21:03:55, end 21:16:17).
Conteggio atteso dal dev: 524 baseline + 8 nuovi = **532** → confermato. Gli 8 test del blocco 16.2
(`e2e/flights.spec.ts:948-1218`, #160-#170) sono **tutti verdi al primo tentativo**. I 3 test
`mobile-metar` non hanno skippato (aviationweather.gov raggiungibile): differenza d'ambiente, non di codice.
Nessun flaky della classe «login POST fermo a 5 s» in questo run.

Nota d'ambiente (non attribuibile): il log riporta il warning Next.js *non-standard NODE_ENV* perché
`.env` esporta `NODE_ENV="development"` e `npm run start` lo eredita (la build usa già `env -u NODE_ENV`,
`playwright.config.ts:188`). Preesistente, identico in tutti gli arbitri che seguono la procedura del HANDOFF.

**Gate** (dopo i probe, server fermato): `npm run gates` → `PASS lint (22s) · PASS typecheck (11s) ·
PASS test (7s) — Tests 1873 passed (1873) · PASS build (29s)`. Validazione eager dell'env:
`env -u DATABASE_URL -u AUTH_SECRET npx vitest run` sui 3 file di test toccati → `Tests 224 passed (224)`.

---

## Findings

### MAJOR-1 — Il ramo «Forza registrazione» risponde a `FLIGHT_OVERLAP` con «Riprova», per sempre

**Dove**: `src/app/[locale]/dashboard/logbook/flight-editor.tsx:813-818` (`onForceSubmit`):

```ts
if (!response.ok) {
  // A concurrent change (e.g. the person/aircraft got archived meanwhile)
  // — the generic message is enough here, the primary submit path above
  // already covers every other domain code.
  setForceError(labels.force.generic);
  return;
}
```

Il commento era vero prima della 16.2 e **ora è falso**: il ramo `FLIGHT_OVERLAP` aggiunto dalla story
(`:675-692`) vive **solo** in `onValid`. Ma `resolveFlightInput` gira prima della transazione, quindi
(AD-4, dichiarato dalla story stessa) **tutti i 422 precedono il 409**: una richiesta che è sovrapposta
**e** bloccata da un documento (`FLIGHT_BLOCKED_BY_EXPIRY`) o da un fermo (`AIRCRAFT_OUT_OF_SERVICE`)
riceve il 422 al primo invio, apre la sezione di forzatura, e **solo lì** incontra il 409. Il percorso
normale non lo vede mai. Il messaggio mostrato è «Impossibile forzare la registrazione. Riprova.»: ogni
nuovo tentativo ripete lo stesso 409 — è esattamente il vicolo cieco che AD-4 dichiara inesistente
(«il 409 **nomina** il volo in conflitto, e la via d'uscita è stornare/correggere quello»). Il banner in
fondo resta per giunta quello **stantio** del 422 (i documenti), che la forzatura ha appena scavalcato.

**Viola**: AC 18 («un `FLIGHT_OVERLAP` — in registrazione **e** in correzione — nomina data e ora del
volo in conflitto») e la lezione 14.6 F2 (niente vicoli ciechi). L'e2e E6 non lo vede perché guida solo
l'invio normale.

**Riproduzione** (build di produzione, script throwaway `playwright-core` in scratchpad, contesto
`Europe/Rome`; fixture `rvw162_*`):
1. velivolo `I-RVW162U…`; volo F1 via API per un pilota pulito: `2020-04-01T08:00Z→09:00Z` (10:00-11:00 locali);
2. pilota P con la **Licenza** (tipo di seed PILOTS, bloccante) registrata **scaduta** `2019-06-01` — nessun `ExpiryType` globale creato;
3. form «Nuova voce»: velivolo U, pilota P, 01/04/2020, 10:30→11:30 → «Registra volo»;
4. compilare il motivo nella sezione «Forza registrazione» → «Forza registrazione».

**Evidenza** (output verbatim dello script):
```
### U1 first submit banner
Impossibile registrare il volo: risultano mancanti o scaduti i seguenti documenti: Licenza (scaduto il 01/06/2019) — pilota/allievo rvw162_Pilota rvw162_PMUIRUYC0ZV6.
### U1 after force: force-flight-error
Impossibile forzare la registrazione. Riprova.
### U1 network
[ { "url": "/api/v1/flights", "status": 422, "code": "FLIGHT_BLOCKED_BY_EXPIRY", ... },
  { "url": "/api/v1/flights", "status": 409, "code": "FLIGHT_OVERLAP", ... "force": true, "forceReason": "rvw162 forzatura con sovrapposizione" } ]
### U1 retry force: network
[ { "url": "/api/v1/flights", "status": 409, "code": "FLIGHT_OVERLAP", ... } ]
### U1 retry force: force-flight-error
Impossibile forzare la registrazione. Riprova.
```
Stessa cosa in **correzione** (volo G del pilota pulito, corretto verso pilota P e verso la finestra di F1):
```
### U2 network
[ { "url": "/api/v1/flights/cmuirv2dl006tmepvs75dz6ny/correct", "status": 422, "code": "FLIGHT_BLOCKED_BY_EXPIRY" },
  { "url": "/api/v1/flights/cmuirv2dl006tmepvs75dz6ny/correct", "status": 409, "code": "FLIGHT_OVERLAP" } ]
### U2 after force: force-flight-error
Impossibile forzare la registrazione. Riprova.
```
Screenshot: scratchpad `rvw/u1-force-register-overlap.png` (sezione arancio col «Riprova» sotto il banner
rosso dei documenti). Il **secondo innesco** (fermo AOG) arriva allo stesso ramo — verificato l'ordine
sul filo: `aogPlain: '422 AIRCRAFT_OUT_OF_SERVICE'`, `aogForced: '409 FLIGHT_OVERLAP'`.

**Fix suggerito** (chirurgico, un file): in `onForceSubmit`, sul `!response.ok`, leggere
`error.code`/`error.details` come già fa `onValid`; se `409 && code === 'FLIGHT_OVERLAP'` →
`resetForceState()` (la forzatura non può aiutare: la sezione va chiusa, non lasciata a promettere un
bypass) e `setFormError(<la stessa frase del ramo di onValid>)`. La composizione della frase (i tre
`.replace` di `:687-689`) diventa così una funzione locale con **due** call-site (non astrazione a uso
singolo). Correggere il commento di `:814-816`. Test: estendere E6 (o un caso nuovo) col pilota bloccato
**per-persona** come nel probe (Licenza scaduta registrata PRIMA di `ensureValidSeedExpiries`, che poi la
salta) — nessun `ExpiryType` globale, quindi nessuna esposizione alla classe di flake di MINOR-1.

---

### MINOR-1 — TD 16.2-g: la classe di flake è diagnosticata bene, ma attribuita alla sorgente sbagliata

**Cosa dice il dev** (record §G/§K, e — più grave — nei commenti **tracciati** dello spec,
`e2e/flights.spec.ts:872-885` e `:904-915`): il describe «Blocking expiry guard-rail» (14.4) crea
`ExpiryType` globali `scope: 'ALL'`, `blocksBooking` e «**4 dei suoi 5 test li lasciano ATTIVI**;
`deactivateBlockingType` è applicato a **uno** solo»; il fix alla sorgente sarebbe «estendere
`deactivateBlockingType` a tutti e 5».

**Cosa dice il codice**: quel describe ha **4** test (non 5), di cui **3** creano un tipo bloccante
(`:724`, `:783`, `:815`) e **tutti e 3** lo disattivano (`:768`, `:804`, `:834`; `deactivateBlockingType`
esiste dal `fix(14.4)` `a3ac276`). Il commento **preesistente** `:704-713` («4 of the 5 tests below …
never deactivated afterward») è stantio dal fix della 14.4 / rimozione STAFF 14.9: il dev l'ha creduto
senza verificarlo e l'ha ricopiato in due commenti nuovi e nel TD. I tipi globali che restano **ATTIVI
per sempre** sono invece i 4 di `e2e/bookings.spec.ts` («Booking expiry block (Story 7.4)»,
`createExpiryTypeForBooking(page, true)` ×4, nessuna disattivazione nel file).

**Evidenza** (SQL sul DB **intatto** dopo l'arbitro, prima di ogni probe):
```
$ SELECT name, "isActive", "createdAt" FROM "ExpiryType" WHERE scope='ALL' AND "blocksBooking" ORDER BY "createdAt"
Tipo prenotazioni 1790449562579-vfks1o|t|2026-09-26 19:06:02.64
Tipo prenotazioni 1790449565383-408p9n|t|2026-09-26 19:06:05.394
Tipo prenotazioni 1790449567871-j8mrop|t|2026-09-26 19:06:07.881
Tipo prenotazioni 1790449568320-hmagcs|t|2026-09-26 19:06:08.338
Tipo voli 1790449660087-nd180u|f|2026-09-26 19:07:40.106
Tipo voli 1790449666426-qjtsqm|f|2026-09-26 19:07:46.45
Tipo voli 1790449671625-jkyqmi|f|2026-09-26 19:07:51.711
$ … count(*) FILTER (WHERE "isActive"), count(*) → 4|7
```
«Tipo prenotazioni» = `bookings.spec.ts:271`; «Tipo voli» = `flights.spec.ts:186`, **tutti inattivi**.

**Il meccanismo del dev è giusto, il rimedio no**: una persona fresca è vulnerabile se la sua scansione
`ensureValidSeedExpiries` precede la **creazione** di un tipo ALL-bloccante e la sua POST la segue. La
disattivazione a fine test non chiude quella finestra (il tipo è attivo per tutta la durata del test che
lo crea — in questo run i 3 «Tipo voli» sono nati alle 19:07:40-51, mentre il blocco 16.2 girava fra
19:07:13 e 19:08:17: esposto, e verde); e i 4 tipi permanenti mordono chi è stato scansionato prima
della loro nascita. Un TD che dice «estendi `deactivateBlockingType`» manda il prossimo dev a cambiare
codice che è già così, e non tocca né `bookings.spec.ts` né la finestra.

**Fix suggerito** (documentale, nessun codice di prodotto): correggere i due commenti nuovi
(`:872-885`, `:904-915`) e quello stantio `:704-713`; riscrivere TD 16.2-g come «tipi `ALL`-bloccanti
creati da spec in parallelo (`bookings.spec.ts` 7.4 — permanenti; `flights.spec.ts` 14.4 — attivi per la
durata del test): rimedio = blocco **per-persona** su un tipo di seed (come nel probe di MAJOR-1) o
spostamento di quei describe nella catena serializzata, non la disattivazione».

---

### LOW-1 — Doppia correzione concorrente: il perdente legge `FLIGHT_OVERLAP` sulla correzione appena fatta

**Dove**: `flights.service.ts:1651` (guardia, **prima** dello storno) vs `:1695` (backstop
`"This flight's charge has already been reversed."`, il cui commento dice «the racer may have been a
double-correct/-cancel»). Due correzioni concorrenti dello **stesso** volo A: la prima committa A→A′
sullo slot; la seconda si sblocca sul lock del velivolo, la guardia esclude A (che nel frattempo è
`CANCELLED`) ma trova A′ `REGISTERED` sullo stesso intervallo → 409 `FLIGHT_OVERLAP` **che nomina A′**,
prima di arrivare al backstop. Prima della story il perdente riceveva `CONFLICT` «già stornato» e il form
mostrava «Questo volo è già stato annullato.»; ora mostra «Questo velivolo ha già un volo registrato il
…. Annulla o correggi quel volo» — dove «quel volo» è la correzione dell'altro operatore.

**Evidenza** (due `POST /correct` identici in `Promise.all`, 5 ripetizioni):
```
### L1 concurrent double-correct same flight
[ { "s": 409, "code": "FLIGHT_OVERLAP", "details": { "flightId": "cmuirugh1001imepvob0dxgnz", ... } },
  { "s": 201, "newId": "cmuirugh1001imepvob0dxgnz" } ]
### L3 double-correct race distribution (4 runs)
[ "201  | 409 FLIGHT_OVERLAP", "201  | 409 FLIGHT_OVERLAP", "201  | 409 FLIGHT_OVERLAP", "201  | 409 FLIGHT_OVERLAP" ]
### L2 sequential re-correct of the already-corrected flight
{ "s": 409, "code": "CONFLICT", "msg": "Flight is already cancelled." }
```
Il caso **sequenziale** (quello per cui il ramo «già annullato» è stato scritto) è intatto — anche in UI:
`U3 banner: Questo volo è già stato annullato.` (volo annullato via API mentre il form di correzione era
aperto, poi invio → `409 CONFLICT`).

**Perché LOW**: solo sotto corsa (il pulsante del form è `disabled={isSubmitting}`: serve un secondo
operatore/tab o un client API), status invariato (409), nessun danno ai dati (A′ unico, un solo storno),
e l'operatore converge al vero al giro successivo. Cambia però il **codice sul filo** per l'app Flutter.

**Fix suggerito** (3-4 righe, opzionale): dentro la transazione, subito dopo il lock dei velivoli e prima
della guardia, rileggere lo `status` dell'originale (le due transazioni sono già serializzate dal lock del
velivolo, READ COMMITTED vede il commit del vincitore) e, se non è più `REGISTERED`, lanciare la stessa
`ConflictError('Flight is already cancelled.')` del pre-check. In alternativa, dichiararlo nel doc-comment
di `correctFlight` come comportamento accettato.

---

### LOW-2 — Censimento `ConflictError`: numeri sbagliati, conclusione giusta

Story §3.3/AD-3 («**39** occorrenze in 9 service; zero passano un secondo argomento»), il commento di
`src/lib/api/handler.test.ts:299` («all 39 pre-existing call sites») e il messaggio del commit `3138115`.
Misura su HEAD:
```
$ grep -rn 'new ConflictError(' src/server --include=*.ts | grep -v '\.test\.ts' | wc -l
76        # 75 pre-story in 13 file (accounts 3, aircraft 7, bookings 13, cash 15, expiries 4,
          # expiry-types 6, flights 4, instructor-compensation 1, instructor-rates 4, people 7,
          # ppr 2, rates 3, users 6) + 1 nuova
```
Verifica della conclusione (l'unica cosa che conta per il blast radius di `handler.ts:65`): fra le 75
preesistenti, nessuna popola `details` — l'unica con più di un argomento è `ppr.service.ts:500`, che passa
`undefined` esplicito. Sul filo: `I1` doppio annullo → `{"error":{"code":"CONFLICT","message":"Flight is
already cancelled."}}`, `I2` marche duplicate → idem senza `details`, `I3` sovrapposizione di
**prenotazione** → `{"error":{"code":"CONFLICT","message":"This aircraft is already booked for an
overlapping interval."}}` — chiave `details` **assente** in tutti e tre. **Fix**: correggere il numero nel
commento del test (e, se si vuole, nel record).

---

## Verificato corretto (empiricamente)

Tutti i probe sono stati eseguiti **dopo** l'arbitro, sul server di produzione della stessa build
(`.next/BUILD_ID` `VYFdPoX-jSNZbXg1vhHjr`, `npm run start` su :3000), con **un** contesto autenticato per
ruolo (7 login admin, 1 per istruttore/pilota/allievo in tutta la review). Script throwaway in
scratchpad (`rvw/lib.mjs`, `api-probes.mjs`, `ui-probes.mjs`, `rbac.mjs`, `legacy.mjs`, `aog.mjs`), mai
nel repo.

**Guardia sotto concorrenza (P1, AC 1/3/9)**
- 2 POST paralleli identici senza chiave → `[201, 409]`; il 409 porta `details`
  `{"flightId":"cmuirufld000dmepv8enqiwvf","takeoffAt":"2020-03-02T09:00:00.000Z","landingAt":"2020-03-02T10:00:00.000Z"}`
  = l'id della 201, istanti ISO 8601 UTC stringa. SQL: 1 `Flight`, 1 `FLIGHT_CHARGE`; contaore 100→160.
- 3 paralleli identici → `409, 201, 409`; 3 paralleli **diversi** parzialmente sovrapposti
  (09:00-10:00 / 09:30-10:30 / 09:45-10:15) → `409, 201, 409`; 5 paralleli identici → `201` + 4× `409`.
  SQL: 1 volo `REGISTERED` per giorno; contaore finale **340** = 100 + 4×60 (mai un doppio avanzamento).
- Il predicato usa `tx` (non `prisma`: trappola §5.8 — i test mockati non la vedrebbero, la raffica sì);
  isolamento `SHOW default_transaction_isolation` = `read committed`, nessun `isolationLevel` custom.

**Bordi, `CANCELLED`, determinismo (AC 2/4/5)**
- Bordi che si toccano (10:00→11:00 e 08:00→09:00 attorno a 09:00→10:00) → `201, 201, 201`;
  sovrapposizione di **un minuto** (10:59→12:00) → 409 che nomina il volo 10:00-11:00.
- Intervallo che ne racchiude tre (07:00→12:00) → 409 che nomina il **più precoce** (08:00).
- Registra → annulla → ri-registra lo stesso intervallo → `201, 200, 201`.

**`force` non deroga (AC 11)**
- `force: true` + `forceReason` su sovrapposizione → `409 FLIGHT_OVERLAP`; `force` senza motivo → `422
  VALIDATION_ERROR` (refine Zod). Pilota bloccato + sovrapposto: normale → `422 FLIGHT_BLOCKED_BY_EXPIRY`,
  forzato → `409 FLIGHT_OVERLAP`. Velivolo AOG + sovrapposto: `422 AIRCRAFT_OUT_OF_SERVICE` → forzato
  `409 FLIGHT_OVERLAP`. SQL: `forcedAt IS NOT NULL` = **0** sul velivolo in tutti i casi.
- Ordine documentato: sovrapposto **e** su velivolo archiviato → `422 AIRCRAFT_ARCHIVED`.

**Correzione (P3, AC 10)**
- Correzione di A sullo slot di B → 409 che nomina B; SQL: A `REGISTERED`, **0** `FLIGHT_CHARGE_REVERSAL`
  per A (nulla scritto, storno incluso). Stessa con `force` → 409.
- Correzione di A **parzialmente sopra il proprio** vecchio intervallo → 201; poi di nuovo sull'intervallo
  originale di A (ora `CANCELLED`) → 201.
- Correzione verso **un altro velivolo** occupato → 409 che nomina il volo dell'altro velivolo; verso uno
  slot libero dell'altro velivolo → 201; lo slot liberato sul velivolo originale accetta una registrazione
  nuova → 201.
- Corsa correzione-verso-S contro registrazione-su-S → `201` + `409 FLIGHT_OVERLAP`; SQL: 1 solo volo su S.

**Idempotenza TD-2 intatta (P2, AC 7/8)**
- Stessa chiave due volte → `201` + `201`, header `idempotency-replayed: true`, stesso `flight.id`; SQL:
  1 `Flight`, 1 `FLIGHT_CHARGE`; contaore 100→160 (uno solo). Il replay **non** tocca la guardia (se la
  toccasse sarebbe un 409).
- Stesso corpo con chiave **nuova** → `409 FLIGHT_OVERLAP`, e il record di quella chiave è **liberato**
  (SQL: in `IdempotencyRecord` resta solo la prima chiave, `responseStatus 201`); ritentare con la stessa
  chiave nuova → di nuovo 409 (nessun record `PENDING` orfano).
- Due paralleli con la stessa chiave → `201` + `409 IDEMPOTENCY_IN_PROGRESS` (comportamento TD-2 preesistente).
- `git diff 3138115^ 3138115 -- src/lib/api/handler.ts`: 1 riga sostituita + 5 di commento, gate di
  idempotenza non toccato.

**F13 — il contaore non perde più minuti in silenzio (AC 12-15)**
- Volo 30′ su contaore 130 → rettifica a 5 → storno: `200`, contaore **0**, e SQL
  `5|0|Storno volo I-RVW162GMUIRUF7DYLO 2020-03-14 (id cmuiruhxi0040mepvzsq5xw6j): 25 minuti non sottraibili dal contaore.|t`
  (`actorUserId` valorizzato).
- Clamp che non morde (contaore 100 + volo 30′ = 130, poi storno) → contaore **100**, **0** righe; contaore
  **esattamente** uguale ai minuti (0 + 30, poi storno) → **0**, **0** righe (il `< 0` stretto è giusto).
- Via `correctFlight` stesso velivolo (contaore 5, 30′ → 40′): `201`, riga `5→0 … 25 minuti`, contaore
  finale **40** = 0 + 40 (due eventi distinti, come AD-6 dichiara). Via `correctFlight` che **cambia**
  velivolo (contaore 7): riga `7→0 … 23 minuti` sull'originale, contaore 0; velivolo nuovo 100+30 = 130,
  **0** righe.
- **Rollback**: correzione verso slot occupato con clamp che morderebbe → `409`, contaore resta **5**, righe
  HMA = **1** (solo la manuale): la riga del clamp nasce e muore con la transazione.
- Nessun percorso 422 sul contaore; censimento scrittori (AC 15) riconfermato col grep: `flights.service.ts:1071`
  (helper nuovo), `:1218` (`+=`), `aircraft.service.ts:656` (rettifica), `:289` (creazione) — nessun
  `Math.max(0` residuo fuori dall'helper (`:1056`).

**F14 — i bordi dichiarati (AC 16/17)**
- `takeoffs: 0` e `landings: 0` → `422 VALIDATION_ERROR` con `details.fieldErrors.takeoffs`/`.landings`
  «Too small: expected number to be >=1» (bordo Zod, `path` sul campo); idem in `/correct`.
- 40 s e 59,999 s → `422 FLIGHT_TIMES_INVALID`; 60 s → `201 minutes=1`; 89 s → `minutes=1`; 90 s →
  `minutes=2` (arrotondamento preesistente); 1441 min → `422 FLIGHT_TIMES_INVALID`; 30 s in correzione → 422.
- Nessun gemello sopravvissuto: `grep -rn 'Math.max(1' src/` → solo paginazioni/grafici; in
  `flights.service.ts` resta solo il commento che ne racconta la rimozione.
- OpenAPI generato (`GET /api/v1/openapi.json`): `RegisterFlightRequest`/`CorrectFlightRequest`
  `takeoffs`/`landings` = `{"type":"integer","minimum":1,"maximum":500}`.

**`handler.ts` generico (AC 3)**: `ConflictError` con `details` → 409 con `details` (E1, A1); senza →
chiave assente (I1/I2/I3 sopra); `ValidationError` invariato (`I4`: Zod 422 con `details`); `NotFoundError`
invariato (`I5`: `{"error":{"code":"NOT_FOUND","message":"Flight not found."}}`). Unit `handler.test.ts`
×2 verdi.

**UI (AC 18) — percorso normale**: E6 verde nell'arbitro (IT, registrazione e correzione); probe EN:
`This aircraft already has a flight logged on 01/04/2020 from 10:00 to 11:00. Cancel or correct that
flight, or change the times.` (ora locale del browser, come dichiarato in §F.4); `0` negli atterraggi →
`Takeoffs and landings must be at least 1.`; `min="1"` sui due input cicli; «già annullato» ancora servito
al caso sequenziale (U3). Parità i18n: 1980/1980 foglie, differenza vuota nei due sensi. Le due label sono
nel tipo `FlightEditorLabels`, quindi il builder duplicato di `dashboard/page.tsx` è coperto dal typecheck.

**RBAC**: istruttore, pilota e allievo → `403 FORBIDDEN` su register, correct, cancel e
hour-meter-adjustments **anche con corpo sovrapposto** (l'autorizzazione precede la guardia: nessuna
informazione su voli altrui trapela nel 409); volo e contaore invariati dopo i tentativi.

**TD 16.2-e — dati già sovrapposti**: coppia fabbricata **sul mio fixture** con un `UPDATE` SQL degli
istanti (dichiarato; la sovrapposizione non è producibile dall'API): correzione che tiene lo slot → `409`
che nomina l'altro volo (atteso e dichiarato); correzione verso slot libero → 201; **annullo** di uno dei
due → 200; annullo di un volo mentre un vicino `REGISTERED` lo sovrappone → 200. `cancelFlight` non è
guardato (`flights.service.ts:1498-1557`), come AD-4. Nessun percorso legittimo resta senza uscita.

**Forense post-suite** (DB intatto, prima dei probe): `Flight` 136 (120 `REGISTERED`), coppie
`REGISTERED` sovrapposte sullo stesso velivolo **0**, cicli a 0 **0**, durate < 1 min **0**, istanti NULL
**0**, contaori negativi **0**, `IdempotencyRecord` pendenti **0**, righe HMA generate dal clamp **1** (la
E7: `5|0|Storno volo I-FL1790449680592-B0 2020-01-01 (id cmuiriflq01a3yrpv39kvo1bd): 25 minuti non
sottraibili dal contaore.`).

**Fixture e2e spostate (AC 20)**: `flight-log.spec.ts` (ora del terzo volo 10:00→12:00, stesso velivolo e
stesso giorno — il punto del caso resta), `reports.spec.ts` (ora 12:00, stesso giorno/mese Roma — i KPI
restano del mese corrente), `flights.spec.ts:463-467` (data API 01→05 gen, resta «atterraggio dopo
mezzanotte, 40 minuti»): **nessuna asserzione indebolita o rimossa** nel diff; l'helper con default
`'10:00'` lascia byte-identici tutti gli altri call-site.

**Unit**: 23 test nuovi + 1 invertito e rititolato (non cancellato) + 2 in `handler.test.ts`; lo stand-in
`findFirstOverlapping` interpreta l'operatore passato dalla guardia, quindi i bordi sono discriminanti per
costruzione. Le 9 discriminanze di §D non sono state rieseguite (vietato modificare file tracciati): il
loro effetto sul filo è però riprodotto sopra, guardia per guardia.

---

## Decisioni PO

Nessuna nuova. MAJOR-1 e i due MINOR/LOW sono correggibili senza cambiare il perimetro ratificato
(la non-derogabilità resta; il fix la rende **onesta** anche sul percorso di forzatura). Resta aperta,
come la story l'ha dichiarata, la domanda 16.2-f: *«Esiste un minimo di durata di volo sensato per
l'aviosuperficie, o basta rifiutare sotto il minuto?»* — opzioni: (a) sotto il minuto = 422, com'è oggi;
(b) una soglia di dominio (es. 5 minuti). Raccomandazione del reviewer: **(a)**, finché il PO non porta
un caso reale: una soglia più alta rifiuterebbe circuiti e voli di prova brevi senza una regola che la
giustifichi.

LOW-1 è una scelta tecnica, non di dominio: raccomando il fix di 3-4 righe (codice sul filo stabile per
l'app Flutter), ma accettarlo e dichiararlo nel doc-comment è legittimo.

---

## Residuo nel DB `airmanager` (fixture della review, prefisso `rvw162`)

| Oggetto | Filtro | Righe |
|---|---|---|
| Velivoli | `registration LIKE 'I-RVW162%'` | 18 (1 archiviato, 0 fuori servizio — l'AOG è stato riportato in servizio) |
| Persone | `"lastName" LIKE 'rvw162_%'` | 12 |
| Voli | sui velivoli `I-RVW162%` | 53 (33 `REGISTERED`) |
| Movimenti conto | legati a quei voli | 73 |
| `HourMeterAdjustment` | sui velivoli `I-RVW162%` | 7 |
| `IdempotencyRecord` | `key LIKE 'rvw162-idem-%'` | 2 |
| `Booking` | sui velivoli `I-RVW162%` | 1 (futuro, +2 giorni) |
| `Expiry` | delle persone `rvw162_%` | 72 |

Due voli del mio fixture hanno avuto gli istanti riscritti via SQL per fabbricare la coppia di TD 16.2-e;
entrambe le coppie sono state poi risolte (un volo annullato/corretto per coppia): coppie `REGISTERED`
sovrapposte nel DB **0** (misurato a fine review). Nessun `ExpiryType` creato dalla review (i blocchi
per-persona usano il tipo di seed «Licenza»); i 4 `ExpiryType` ALL-bloccanti attivi sono quelli lasciati
dalla suite (`bookings.spec.ts`), v. MINOR-1. Nessun reset del DB eseguito; `airmanager_load` mai toccato.

## Stato della macchina

- Server di produzione dei probe (`next-server`, PID 24134 da `ss -ltnp`) **fermato** per PID; `:3000`
  libero; nessun processo `next` residuo.
- Suite e2e **terminata** (`E2E_EXIT=0`); log in `/tmp/airmanager-e2e/last-run.log`.
- `npm run gates` ha ricostruito `.next` (artefatto ignorato) dopo lo stop del server.
- Nessun file tracciato modificato, nessun commit (`git status`: solo le cartelle untracked dell'utente e
  la cancellazione preesistente `.claude/skills/design-taste-frontend/SKILL.md`, non toccate).
- Script dei probe e screenshot nello scratchpad della sessione, fuori dal repo.
