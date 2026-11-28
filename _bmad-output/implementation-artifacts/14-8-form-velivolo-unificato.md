---
baseline_commit: 9097d18
---

# Story 14.8: Form velivolo unificato — la creazione espone tutto ciò che espone la modifica

Status: done (review Opus 5 shippable-with-fixes → fix F1-F5+F7 `0ff9186`, arbitro 280/280, 0 flaky — 2026-07-28)

## Story

As a admin che aggiunge un velivolo alla flotta,
I want inserire in UN colpo solo tutte le informazioni (identità, tariffe orarie, contaore iniziale),
so that non devo creare l'aereo "a metà" e riaprirlo subito in modifica per completarlo.

**Riferimenti vincolanti**: piano epic 14 (item 8): "il form di creazione non espone tutte le voci del form di modifica (es. il costo). vorrei che i form fossero identici". Story UI: `design-taste-frontend` + `ui-ux-pro-max`, AirOps.

## Acceptance Criteria

1. **(Creazione completa)** Lo SlideOver "Nuovo velivolo" (`fleet/aircraft-editor.tsx` — oggi `mode='new'` rende SOLO `IdentitySection`, `:231`) espone anche: **tariffe orarie** per tipo volo (la stessa griglia di `RatesSection`, valori effettivi dalla creazione) e **contaore iniziale** (`HourMeterSection`-equivalente). La sezione Archivio resta solo in edit (ovvio); Disponibilità: valutare — un velivolo nuovo nasce disponibile, la sezione ha senso in creazione solo se costa zero (decisione del dev, motivata).
2. **(Un solo submit)** L'inserimento è UN submit composito (pattern della creazione pilota composita, story 13.1: person+profilo+rating+medical+access in un colpo): se la parte tariffe/contaore fallisce DOPO la creazione dell'identità, l'utente lo vede chiaramente (niente stato "creato a metà" silenzioso — rollback transazionale lato server se il backend lo consente con costo ragionevole, altrimenti sequenza client con errore esplicito sul passo fallito e slide-over che resta aperto in modalità edit del velivolo appena creato).
3. **(Parità dei form)** A parità di sezione, i campi di creazione e modifica sono IDENTICI (label, unità, validazioni per-campo della 14.2 incluse). Nessun campo esiste solo in uno dei due (eccetto Archivio).
4. **(Test)** Unit sul percorso composito (inclusi i fallimenti parziali); e2e: creazione con tariffe+contaore in un colpo → la card flotta e la pagina mostrano i valori senza passaggi di modifica; full suite CI=1 verde.

## Contesto (puntatori — ricognizione 2026-07-28)

- Editor: `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx` (`EditorTarget { mode: 'new' | 'edit' }` `:131`; branch new → solo IdentitySection `:231`; edit → Availability `:245`, Rates `:249`, HourMeter `:262`, Archive `:266`). Schemi: `createAircraftSchema`, `createHourMeterAdjustmentSchema` (`:29-30`), tariffe in `aircraft-rates` (epic 4 — records per tipo volo con validità temporale).
- Pattern submit composito: creazione pilota (story 13.1, `pilots/pilot-editor.tsx` NewPersonForm — person+profili+rating+medical+access).
- La 14.2 ha appena portato la validazione per-campo su questo editor: le sezioni nuove in creazione DEVONO nascere già col pattern (`Field error`, `aria-invalid`).
- **Ambiente**: ciclo e regole macchina come `docs/handoffs/HANDOFF.md`. Commit su `dev`: `feat(14.8): form velivolo unificato — creazione con tariffe e contaore` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Cambiamenti al modello tariffe (validità temporale, tipi volo): si riusa quello che c'è.
- La pagina flotta e le sue card: invariati oltre a ciò che serve per mostrare i valori inseriti.

## Dev Agent Record

**Status**: implementato, gates verdi, full suite CI=1 in corso di arbitraggio (v. sotto). Commit implementazione: `172471b`.

### AC1 — Creazione completa

- **Contaore iniziale**: era GIÀ esposto in creazione (`IdentitySection`, campo `identity.hourMeter` "Contaore iniziale (minuti)", `:isNew` branch preesistente) — verificato via e2e preesistenti (`Contaore attuale: 10:00` dopo un create con 600 minuti) e via verifica interattiva. Nessuna modifica necessaria: è già l'equivalente semantico di `HourMeterSection` per un valore INIZIALE (non ha senso una sezione con "delta/motivo/storico" per un aereo che non esiste ancora — un `HourMeterSection` pieno sarebbe speculativo, karpathy-guidelines §2).
- **Tariffe**: AGGIUNTA una sezione "Tariffe" (stesso `<Section title={labels.rates.sectionTitle}>` wrapper di edit-mode) dentro lo SlideOver di creazione, con la STESSA griglia di `RatesSection`: Prezzo wet, Prezzo dry (opzionale), In vigore da (default: oggi). Gated da `canManageSettings` (stesso permesso `settings.manage` che governa il form "nuova tariffa" in edit — uno STAFF senza `settings.manage` non vede la sezione, coerente col fatto che POST rates è admin-only).
- **Disponibilità**: ESCLUSA dalla creazione, come da indicazione della story ("un velivolo nuovo nasce disponibile") — un aereo appena creato è sempre `OPERATIONAL`/non fuori servizio, non c'è alcun campo utile da esporre; includerla sarebbe stato speculativo.
- **Archivio**: resta solo in edit (ovvio, un aereo appena creato non può essere archiviato).

### AC2 — Un solo submit

Scelta: **composito server-side transazionale** (non sequenza client), motivata:
- Il pattern di riferimento (13.1, `createPerson`) mostra che quando il backend può ragionevolmente wrappare le scritture in UNA `$transaction`, è la soluzione più robusta (zero stati intermedi possibili, non solo "recuperabili").
- `POST /api/v1/aircraft` accetta ora un blocco `rate` OPZIONALE (`createAircraftSchema.rate`, stesso shape di `createAircraftRateSchema` — riuso, non duplicazione). `aircraft.service.ts#createAircraft`:
  1. autorizza `aircraft.manage` (sempre) e — SOLO se `rate` è presente — `settings.manage`, PRIMA di qualsiasi scrittura (stesso ordine "check tutti i permessi, poi scrivi" di `createPerson`'s blocco `access`).
  2. se `rate` è assente: comportamento INVARIATO (singola `prisma.aircraft.create`, path pre-14.8, zero rischio di regressione — verificato con gli unit test esistenti, tutti ancora verdi senza modifiche).
  3. se `rate` è presente: `prisma.$transaction(async (tx) => { create aircraft; createAircraftRateCore(tx, ...) })` — un fallimento nell'inserimento della tariffa fa rollback dell'intera transazione (l'aereo non viene creato). `createAircraftRateCore` è l'estrazione della insert grezza da `rates.service.ts#createAircraftRate` (stesso pattern `createPersonCore`), senza il pre-check `assertRateAvailable`: l'`aircraftId` è appena generato, la collisione `[aircraftId, validFrom]` è strutturalmente impossibile.
- **Perché non è mai possibile uno stato "creato a metà"**: la validazione Zod dell'INTERO body composito (identità + `rate`) avviene PRIMA che l'handler giri (bodySchema di `apiRoute`); gli `authorize()` girano prima di ogni scrittura; le scritture condividono una sola transazione. Un 422/403/500 in qualunque punto non lascia mai un aereo a metà — non serve una sequenza client con "editor che resta aperto in edit dell'aereo appena creato" (quel fallback, previsto dalla story come alternativa "se il rollback non è ragionevole", non è servito: il rollback lo È).
- **Client**: i campi tariffa in creazione sono stato React piano + validazione imperativa al submit (NON react-hook-form), stesso pattern/motivazione di `pilot-editor.tsx#NewPersonForm` (fighting RHF su un blocco condizionale annidato non vale la complessità per un form one-shot). `onSubmit`/`onInvalid` condivisi con l'identità: un submit con ENTRAMBI un campo identità vuoto E un prezzo tariffa non valido marca entrambi (stesso flag `rateSubmitAttempted`, stesso ruolo di `submitAttempted` in `NewPersonForm`).

### AC3 — Parità dei form

Campi tariffa in creazione: STESSE label (`labels.rates.price/priceDry/validFrom`), STESSA unità (€/h), STESSA regola di validità (`parseCents` > 0 e ≤ `INT_MAX`, stesso messaggio `labels.errors.invalidPrice`), STESSO pattern per-campo (`aria-invalid` + `Field error` + `aria-describedby` via `Field`, story 14.2). Zero nuove chiavi i18n: riusate integralmente `labels.rates.*`/`labels.errors.*` già esistenti — nessun rischio di drift testuale fra i due form.

Campi contaore iniziale: invariati (erano già a parità semantica, v. AC1).

Unica differenza dichiarata: Archivio/Disponibilità assenti in creazione (per costruzione, non un gap).

### AC4 — Test

- **Unit** (`src/server/services/aircraft.service.test.ts`, describe `composite create with a rate (story 14.8)`): autorizzazione (`settings.manage` mancante → 403 PRIMA di ogni findFirst/create/transazione), successo (aereo+tariffa in UNA `$transaction`, dati passati correttamente ad `aircraftRate.create`), path senza `rate` invariato (nessuna transazione, nessuna insert tariffa), fallimento PARZIALE (l'insert della tariffa rigetta dentro la transazione → l'errore si propaga, mai un "successo silenzioso").
- **e2e** (`e2e/aircraft-rates.spec.ts`): (1) creazione con tariffa wet+dry+contaore in un colpo → card flotta mostra SUBITO la tariffa wet (`/120,00\s€/`), riaprendo l'editor contaore/tariffa wet/dry sono già lì, NESSUN passaggio di modifica; (2) STAFF (senza `settings.manage`) non vede la sezione "Tariffe" nel form di creazione, e un `rate` inviato direttamente all'API viene rifiutato con 403 PRIMA di ogni scrittura.
- **Gates**: `npm run gates` verde (lint/typecheck/test 1548 passed/build).
- **Full suite CI=1**: DB fresco (`docker compose down -v && up -d`, migrate deploy, seed) → `JOBS_SECRET=story148-dev-secret-not-a-placeholder` → `CI=1 npx playwright test` (build prod + start automatici via `webServer`, `env -u NODE_ENV` nello script di build) → **279 passed (9.9m), 0 failed, 0 flaky**. Nessuna occorrenza del flake noto "login POST ~5s" in questo run.

### File toccati

- `src/lib/schemas/aircraft.ts` — `createAircraftRateSchema` spostato sopra `createAircraftSchema`; `createAircraftSchema.rate` opzionale.
- `src/server/services/rates.service.ts` — nuova `createAircraftRateCore` (estrazione, riuso da `aircraft.service.ts`).
- `src/server/services/aircraft.service.ts` — `createAircraft` autorizza `settings.manage` se `rate` presente, transazione condizionale.
- `src/server/services/aircraft.service.test.ts` — mock `aircraftRate.create`, `adminActor()`, 4 nuovi test.
- `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx` — sezione Tariffe in creazione, submit composito, `canManageSettings` propagato a `IdentitySection`.
- `e2e/aircraft-rates.spec.ts` — 2 nuovi test (creazione composita, gate STAFF).

### Deviazioni dal story file

- Nessuna deviazione sostanziale. Unica precisazione: la story ipotizzava che il contaore iniziale fosse mancante in creazione ("espone anche ... contaore iniziale") — la ricognizione ha trovato che era GIÀ presente; documentato qui invece di ri-implementarlo, per non introdurre codice ridondante (karpathy-guidelines §3, "tocca solo ciò che devi").

## Review Record

Reviewer adversarial (Opus 5 xhigh), 2026-07-28. Perimetro: `git diff 55baa8f..HEAD` (commit `172471b` feat, `e5a6124` docs). Verdetto: **shippable-with-fixes** — 1 major, 3 minor, 3 nit.

### Priorità zero — full suite (arbitro)

DB fresco verificato prima del run (5 User, 1 Aircraft, 0 AircraftRate). `export JOBS_SECRET=story148-review-secret-not-a-placeholder` → `CI=1 npx playwright test` su build prod (`env -u NODE_ENV npm run build && npm run start` via `webServer`), output su file.

**`279 passed (9.5m)`, exit 0, zero `✘`, zero flaky, zero retry.** Nessuna occorrenza della classe di flake "login POST ~5s". Catena serializzata completa (chromium 264 → settings 271 → booking-window 274 → treasury-settings 277 → billing-global 279). Il claim del dev è confermato alla lettera. Il run ha superato il cap foreground di 600s ed è stato lanciato in background sulla sessione del reviewer e atteso fino al summary — dichiarato.

`npm run gates` rieseguito dal reviewer dopo le sonde: exit 0 — lint 19s, typecheck 3s, **1548 unit passed**, build 45s.

### Verdetto sulle 3 deviazioni dichiarate

1. **Contaore già presente in creazione** — CONFERMATA e ACCETTATA. `git show 55baa8f:.../aircraft-editor.tsx` mostra il ramo `isNew` col Field "Contaore iniziale (minuti)" già alla baseline. Non re-implementarlo è corretto (karpathy §3).
2. **Composito server-side transazionale** — CONFERMATA EMPIRICAMENTE e ACCETTATA. Trigger Postgres `BEFORE INSERT ON "AircraftRate"` che solleva sempre eccezione, **con controllo di discriminanza**: create senza rate → 201 e riga presente; `POST /aircraft/{id}/rates` → 500 (il trigger colpisce davvero quella tabella); create CON rate → 500 e **l'aereo NON esiste in DB**. Trigger rimosso → 201 con entrambe le righe. Race a 8 POST concorrenti stessa registrazione + rate → 1×201, 7×409, DB con 1 aereo + 1 tariffa e **0 tariffe orfane in tutto il database**; abort client a 0/3/15 ms → nessuna riga; triplo click sul submit → 1 aereo + 1 tariffa. Nessuna `Idempotency-Key` su questo POST, e non serve: l'unicità di `registration` dà idempotenza naturale.
3. **Path senza rate bit-per-bit invariato** — CONFERMATA e ACCETTATA. Solo hoist di `data` in una const; test unit pre-esistenti invariati (+73/-0) e verdi; nuovo test che asserisce `$transaction` mai chiamata; staff senza rate → 201 sull'API reale.

### RBAC (matrice completa via HTTP, build prod)

| ruolo | POST /aircraft CON rate | POST /aircraft SENZA rate |
|---|---|---|
| admin | 201 (aereo + tariffa in DB, actorUserId corretto) | 201 |
| staff | **403** `settings.manage` — **nessuna riga in DB** | 201 |
| istruttore / pilota / allievo | 403 `aircraft.manage` | 403 `aircraft.manage` |

UI: lo staff non vede la sezione "Tariffe" nel form di creazione (labels: Marche, Tipo, Modello, Posti, Carburante, Basato, Contaore iniziale, Note).

### Findings

- **F1 (major)** — **Prezzo dry senza prezzo wet: il valore digitato viene scartato in silenzio.** `aircraft-editor.tsx:352` considera il blocco tariffa attivo solo se il wet è non vuoto; con solo il dry compilato il body parte senza `rate`, esce "Velivolo creato.", lo SlideOver si chiude e il prezzo dry non esiste da nessuna parte (DB: `I-DRYONLYU1` con 0 tariffe; card "Tariffa —"). In **modifica** lo stesso input è rifiutato con "Campo obbligatorio." sul wet (`newRateFormSchema.price: min(1)`) → rottura di parità AC3 + perdita dati. Il form è anche internamente incoerente: dry="abc" con wet vuoto **blocca** il submit e marca il campo, dry="95,00" con wet vuoto passa e butta via il valore — valida un campo che poi scarta. *Fix*: `rateTouched` su wet **o** dry, e `ratePriceMissing` mappato sul Field "Prezzo wet" con `labels.errors.required` (chiave esistente, zero i18n nuove) incluso nella guardia di `onSubmit`.
- **F2 (minor)** — Un 422 sul blocco `rate` cade sul banner generico: la lista `known` (`aircraft-editor.tsx:435-443`) non contiene `rate`, che è la chiave emessa dal server. Raggiungibile dalla UI (anno fuori formato ISO in `<input type=date>`): banner "Si è verificato un errore. Riprova." e nessun marker su "In vigore da". Edit si comporta allo stesso modo → parità salva, ma il blocco nuovo nasce senza il pattern 14.2 completo. *Fix*: validare client-side la forma ISO riusando `labels.errors.invalidDate`.
- **F3 (minor)** — Contratto OpenAPI: `rate` compare correttamente in `CreateAircraftRequest`, ma la `description` di `POST /api/v1/aircraft` (`registry.ts:1031`) non dice che inviarlo richiede `settings.manage` — su un progetto API-first con client Flutter futuro è un gap. Nessun assert in `registry.test.ts` per il campo nuovo, nonostante il precedente `blocksBooking` (`:151-155`).
- **F4 (minor)** — I 4 unit nuovi non possono dimostrare l'atomicità: `mockInteractiveTransaction` passa lo stesso `prisma` come `tx`, quindi passerebbero anche con l'atomicità rotta. Il comportamento reale è corretto (provato col trigger), ma il claim portante non ha guardiano in CI. *Fix*: `tx` come oggetto distinto e assert che `prisma.aircraftRate.create` NON venga chiamato.
- **F5 (nit)** — `catch` di `createAircraft` (`aircraft.service.ts:275-281`): ogni P2002 diventa "conflitto di marche", incluso (in teoria) uno proveniente da `AircraftRate`. Scopare su `error.meta.target`.
- **F6 (nit, pre-esistente)** — `parseDateOnlyUtc` (`date-only.ts:31-34`): `validFrom: '0001-01-01'` è salvato come `1901-01-01` (`Date.UTC` mappa gli anni 0-99 su 1900+anno). Identico sull'endpoint standalone → fuori perimetro 14.8, da tracciare come TD.
- **F7 (nit)** — Uno staff non vede alcuna sezione "Tariffe" in creazione, mentre in modifica la vede in sola lettura con `readOnlyHint`. Difendibile; decisione PO.

### Cosa ha retto bene

Prova empirica del rollback con controllo di discriminanza; RBAC pulita su tutte e 5 le utenze con il 403 che non lascia nulla in DB; validazione per-campo 14.2 realmente presente sul blocco nuovo (bordi rossi + messaggi inline + `aria-describedby`, nessun banner); parità dei campi misurata via dump DOM (label/placeholder/inputmode/type identici, zero i18n nuove); tariffa effettiva subito su card ed editor da un solo submit (assert e2e discriminante, controllo "—" verificato); il popover calendario funziona sull'input CONTROLLATO di creazione (2026-07-28 → 2026-07-15) — path che nessun e2e della story copre; edge del blocco rate tutti 422 con `fieldErrors.rate` e zero scritture, chiavi ostili (`aircraftId`, `actorUserId`) strippate da Zod; diff igienico, 7 file, zero test indeboliti (+64/-0 e +73/-0 sui due file di test).

### Nota di ambiente

Le sonde hanno lasciato ~100 velivoli di prova nel DB locale (prefissi `I-RB*`, `I-TX*`, `I-EDG*`, `I-RACE*`, `I-DRYONLY*`, `I-LIVE*`, `I-DBLCLK*`, `I-DRYINV*`): il reset DB prima della prossima story li rimuove. Trigger e funzione `airm_review148_*` rimossi e verificati assenti (`pg_trigger`/`pg_proc` → 0 righe). Nessun file scritto nel repo, nessun push, nessun `playwright install`.

### Fix post-review (2026-07-28, chirurgici in sessione principale — commit `0ff9186`)

- **F1 fixed (major)** — il blocco tariffa conta come "toccato" se QUALSIASI campo lo è (`rateTouched`): prezzo dry senza wet → submit bloccato, wet marcato "Campo obbligatorio." (specchio di `newRateFormSchema.price min(1)` di edit) — la perdita silenziosa di dati e l'incoerenza interna (dry validato-poi-scartato) sono chiuse. **Guard e2e nuovo dedicato** (dry-only → aria-invalid sul wet, editor aperto, zero righe a DB), verde.
- **F2 fixed** — forma ISO di `validFrom` validata client-side (regex + `labels.errors.invalidDate`, chiave prima inutilizzata): il 422 `fieldErrors.rate` non mappabile è irraggiungibile dalla UI.
- **F3 fixed** — descrizione OpenAPI di POST /aircraft dichiara il requisito `settings.manage` del blocco `rate` (403 con rate, 201 senza); test di registry àncora `CreateAircraftRequest.rate` al contratto (pattern `blocksBooking`).
- **F4 fixed** — test di atomicità con client tx DISTINTO (spy propri) + assert che il client globale non venga mai toccato dal path composito: l'atomicità è asserita, non assunta.
- **F5 fixed** — `isUniqueViolation` controlla `meta.target ∋ registration` (fallback difensivo se target assente): un P2002 della tariffa cade come 500, non più come "marche duplicate".
- **F6 → TD** — bug PRE-esistente di `date-only.ts` (anni <100 shiftati di 1900 da `Date.UTC`): fuori perimetro, tracciato come action item in sprint-status.
- **F7 fixed** — la sezione Tariffe si rende anche allo staff in creazione col `readOnlyHint` di edit (principio PO "form identici"); test STAFF rafforzato con l'assert sull'hint.

**Gates post-fix**: PASS lint/typecheck/test/build — 1549 unit (+1 registry). I run dello spec su `next dev` hanno esibito la classe login-flake in forma massiccia (2 worker: 6-8 rossi TUTTI alla riga di login; 1 worker: 7/8 con tutti i test 14.8 verdi) — coerente con la lezione documentata, non attribuibile ai fix.

**Full suite finale (arbitro = sessione principale, build prod, DB fresco)**:

```
280 passed (9.2m)
```
Exit code `0`, zero flaky (280 = 279 + il nuovo guard F1).

**Esito finale: tutti i findings chiusi (F6 tracciato come TD). Story DONE.**
