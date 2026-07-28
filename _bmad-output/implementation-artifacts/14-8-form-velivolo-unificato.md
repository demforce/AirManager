---
baseline_commit: 9097d18
---

# Story 14.8: Form velivolo unificato — la creazione espone tutto ciò che espone la modifica

Status: ready-for-dev (branch `dev`, epic 14)

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

_(compilato dopo la review adversarial)_
