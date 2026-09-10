---
baseline_commit: 738d399
---

# Story 16.2: Il registro voli rifiuta duplicati e sovrapposizioni, e il contaore non perde minuti in silenzio

Status: **review** — 2026-09-10 (implementazione `3138115`; Dev Agent Record in coda a questo file). **Modello dev: Opus 5 xhigh** (non Sonnet: la story tocca UI — due label i18n nuove in due locale, il ramo 409 del form di correzione che oggi mente, e due `min={0}` → `min={1}`; v. AD-11 e §3.4. È UI di TESTO e di plumbing, nessun layout: se il PO preferisce Sonnet, la parte server è separabile ma il form resterebbe con un messaggio generico su un 409 nuovo — deviazione da dichiarare).

> ⚠️ **Baseline e stato del working tree (misurato il 2026-09-10)**: il frontmatter dichiara `738d399`, ma **tutti** i `file:riga` di `flights.service.ts` in questo file sono misurati sul **working tree**, che contiene le modifiche **NON ancora committate** della **story 16.1** (un dev sta implementando «Un solo calendario» adesso, nella stessa directory): `todayDateOnlyUtc` → `todayDateOnlyUtcInZone(APP_TIMEZONE)` alla guardia `FLIGHT_DATE_IN_FUTURE` (`:763`) e alle due `effectiveDate` degli storni (`:1341`, `:1477`), più due doc-comment allungati. Sono state scelte le righe **post-16.1** perché la 16.1 sarà **committata prima** del dispatch di questa story (ciclo per-story del progetto). Sul HEAD `738d399` **puro** le stesse righe stanno **2 righe più in su** fino a ~`:1291` e **3 più in su** dopo.
> ⇒ **Prima di scrivere una riga: `git log --oneline -3` + rileggere ogni riga citata sul HEAD corrente e correggere questo file dove è slittata** (prassi che ha pagato in tutte le story degli epic 15 e AOG). Se la 16.1 **non** è ancora chiusa quando questa story parte, **fermarsi e chiedere alla sessione principale**: le due story toccano funzioni adiacenti dello stesso file e lavorare su un working tree con modifiche altrui non committate è la ricetta per un conflitto illeggibile.
>
> **Da leggere PRIMA di implementare**: `_bmad-output/planning-artifacts/audit-2026-09-10/ops-audit.md` §2 (invarianti **[I-1]**, **[I-2]**, **[I-3]**, **[I-5]**), **F3**, **F13**, **F14** e **§5.2** (l'idempotenza è verificata CORRETTA: il contratto TD-2 non si tocca); `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 16.2» (AC di contratto) e §«Architettura e vincoli»; `_bmad-output/implementation-artifacts/aog-1a-campo-guardia-volo.md` §1 (AD-4: l'idioma «una guardia condivisa da `registerFlight` e `correctFlight` vive in un punto solo»). Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`; per la parte UI `design-taste-frontend` e `ui-ux-pro-max`.
>
> 🧹 **Il DB di lavoro va resettato PRIMA di qualunque run e2e**: contiene il residuo dell'audit (misurato oggi: **2** velivoli `registration LIKE 'I-AUD%'`, **7** voli `notes LIKE 'audit_%'`, 2 `HourMeterAdjustment` `reason ILIKE 'audit%'`, 1 `IdempotencyRecord` `key LIKE 'audit-idem-%'`) e **5 coppie di voli REGISTERED già sovrapposti** (query in §3.6) che questa guardia NON riscrive. Reset (macchina locale, `HANDOFF.md`): `fuser -k 3000/tcp; docker compose down -v && docker compose up -d && sleep 5 && set -a && . ./.env && set +a && npx prisma migrate deploy && npx prisma db seed`.

---

## Story

As **l'admin che tiene il registro voli** (l'unico ruolo che può registrare: `flights.manage`, ADMIN-only),

I want che un volo **identico o sovrapposto** sullo stesso velivolo sia **rifiutato**, e che **ogni** movimento del contaore lasci **una traccia**,

so that lo stesso volo non addebiti due volte né avanzi due volte il contaore, uno storno non porti il contaore sotto zero **in silenzio**, e i minimi che lo schema **dichiara** valgano davvero.

### Il perché: la seconda linea di difesa non esiste

L'idempotenza di richiesta esiste, è **corretta** e l'audit l'ha verificata sul vivo (§5.2: stesso `Idempotency-Key` due volte → **una** riga, **un** movimento, **un** avanzamento del contaore, header `Idempotency-Replayed: true`). Ma è **opt-in sull'header**: se il client non manda la chiave, il server **non ha nessuna altra difesa**. `resolveFlightInput` (`flights.service.ts:598-903`) esegue **20 `throw`** su **17 codici** distinti e **nessuno** interroga `Flight` per cercare righe esistenti; `registerFlightCore` (`:977-1052`) scrive e avanza il contaore senza guardarsi intorno.

Il risultato misurato dall'audit (sonde 13a/13b/14) è **un doppio addebito e un contaore che avanza di 120 minuti per 60 minuti volati**. Il difetto non richiede malizia: **un doppio clic** su «Registra volo», o un reload dopo un timeout, lo produce.

### Fatti misurati che vincolano il design

| Fatto | Misura | Conseguenza |
|---|---|---|
| Il registro voli non ha **nessun** predicato di sovrapposizione | censimento dell'audit: 9 occorrenze di `startsAt: { lt`/`endsAt: { gt`, **tutte** in `bookings.service.ts`, nessuna su `Flight` (**[I-2]**) | la guardia va **scritta**, non estesa: non esiste un esemplare da copiare *sui voli* — l'esemplare da copiare è quello delle **prenotazioni** (**[I-1]**) |
| La disciplina di concorrenza c'è già | `SELECT "hourMeterMinutes" FROM "Aircraft" … FOR UPDATE` come **prima** istruzione della transazione: `:1103-1104` (`registerFlight`), `:1443-1444` (`correctFlight`, multi-riga `ORDER BY id`) | il posto giusto per la lettura di sovrapposizione è **dentro** la transazione, **dopo** quel lock: serializzazione **gratis**, zero lock nuovi |
| `[startsAt, endsAt)` è **semi-aperto** e verificato sul vivo | audit §5.1: sovrapposizione → 409, `endsAt == startsAt` → 201 | la semantica dei voli deve essere **la stessa**: bordi che si toccano **non** sono sovrapposizione. Un'app con due regole d'intervallo sarebbe il difetto |
| `ConflictError` accetta `details`… ma il layer API **li scarta** | `errors.ts` (*«`details` mirrors `ValidationError`'s shape too, even though no caller populates it yet»*) e **`handler.ts:60`**: `const details = error instanceof ValidationError ? error.details : undefined` | «409 con id e orari del volo in conflitto» **non è ottenibile** senza toccare quella riga: è la prima modifica del piano, non un dettaglio |
| Il contaore è un contatore **incrementale** con audit trail obbligatorio | **[I-3]**; `schema.prisma:274-276` (*«Story 2.5 (AC 2) makes it change ONLY via a tracked `HourMeterAdjustment` — never through this table's generic update path — so the audit trail can't be bypassed»*) | il clamp `Math.max(0, …)` a `:1360` e `:1493` **viola** l'invariante quando scatta: 25 minuti evaporati nella sonda 19 |
| Lo storno **deve** sempre potersi fare | doc-comment del modulo `:64-67` (*«a manual `HourMeterAdjustment` … must never BLOCK a cancellation»*) e Contesto 5.3 (*«cancellare è sempre lecito»*) | fra le due opzioni che il piano lascia aperte per F13, il **422 è escluso**: v. AD-6 |
| Il minimo dichiarato dallo schema non è applicato | `schema.prisma:1027-1032` (*«both NOT NULL DEFAULT 1 (every flight has at least one of each)»*) vs `schemas/flights.ts:106-107` `min(0)`; e `flights.service.ts:754` `Math.max(1, …)` che **arrotonda in silenzio** un volo di 20 secondi a 1 minuto | il fix è **una cifra** in due righe Zod + **un bordo inferiore** dove già vive quello superiore |
| Il form manda già la chiave di idempotenza | `flight-editor.tsx:622` (`IDEMPOTENCY_KEY_HEADER` sulla registrazione, **non** sulla correzione) e `:630` `regenerateIdempotencyKey()` | il doppio clic *entro la stessa risposta* è già coperto dal client; il 409 nuovo copre **il server** e **ogni altro client** (l'API è consumata anche dalla futura app Flutter) |
| Il DB di lavoro contiene già dati che violano l'invariante | **5** coppie `REGISTERED` sovrapposte sullo stesso velivolo (misura in §3.6) | la guardia vale sulle **scritture nuove**: nessun backfill, nessuna riscrittura (ledger e registro sono append-only per progetto) — ma **una correzione** di uno di quei voli può ora legittimamente rispondere 409 |

---

## §0 — Requisiti FISSI (contratto)

Gli AC di contratto sono quelli del piano (`docs/superpowers/plans/2026-09-10-epics-16-18-audit.md`, §«Story 16.2»), qui numerati per essere citabili:

| # | Requisito di contratto |
|---|---|
| **P1** | Un volo `REGISTERED` sullo stesso velivolo con intervallo **sovrapposto** (bordi che si toccano **esclusi**) → **409 `FLIGHT_OVERLAP`** con **id e orari** del volo in conflitto; il controllo vive **nella transazione, sotto il lock del velivolo** già usato per il contaore. |
| **P2** | La stessa richiesta due volte **senza** `Idempotency-Key` → la seconda è **409** (è una sovrapposizione totale), **un solo addebito**, contaore avanzato **una volta**; **con** la chiave il replay resta **la risposta di successo + `Idempotency-Replayed: true`** — contratto TD-2 **invariato**. |
| **P3** | `correctFlight`: la guardia **esclude l'originale** che sta sostituendo e vale **contro tutti gli altri**. |
| **P4** | Storno di un volo i cui minuti superano il contaore corrente: il contaore non scende sotto zero **E** viene scritta una `HourMeterAdjustment` con la differenza e il motivo, **oppure** 422 nominando la causa — **la scelta è in questo file** (AD-6): «perdere i minuti in silenzio» non è più un esito possibile. |
| **P5** | Volo di durata **< 1 minuto** o con `takeoffs`/`landings` **= 0** → **422**, coerente con la semantica **dichiarata dallo schema**. |
| **P6** | Sul **pre-fix simulato** la doppia registrazione è **ROSSA** (due addebiti, `6000→6060→6120` come misurato dall'audit) e diventa **verde** col fix. |

**Ratifica applicabile** (piano, blocco «Decisioni **non** sottoposte perché senza alternativa ragionevole»): *«le guardie di duplicato/sovrapposizione sui voli sono **409 non derogabili**»* ⇒ **`force`/`forceReason` NON scavalcano `FLIGHT_OVERLAP`** (a differenza di `FLIGHT_BLOCKED_BY_EXPIRY` e `AIRCRAFT_OUT_OF_SERVICE`, R-AOG-c). Nessuna ratifica PO nuova è necessaria per questa story (le ratifiche R-16-a..h del 2026-09-10 non la toccano: `4e5cdba` ha chiuso anche DQ-2, che riguarda la 16.6).

**Invarianti che questa story deve lasciare intatte:**

| # | Invariante | Qui significa |
|---|---|---|
| **[I-1]** | Un velivolo non ha due prenotazioni `APPROVED` sovrapposte, intervallo **semi-aperto** | i voli adottano **la stessa** semantica di bordo, non una seconda |
| **[I-3]** | Il contaore è un **contatore incrementale** e cambia **solo** con traccia | il clamp che scatta scrive la sua riga; il `+=` di `registerFlightCore` resta `+=` (mai un `SET` a `hourMeterEnd`) |
| **TD-2** | L'idempotenza di richiesta è corretta ed è **opt-in** | non si rende obbligatoria, non si cambia il fingerprint, non si cambia lo status di replay |
| **AD-1 (progetto)** | Una regola di dominio vive in **una** funzione | la guardia di sovrapposizione e la scrittura del clamp hanno **due call-site ciascuna e una implementazione ciascuna** |

---

## §1 — Decisioni architetturali

**AD-1 — La guardia vive DENTRO la transazione, sotto il lock del velivolo, in UNA funzione con due call-site.**
Non in `resolveFlightInput` (dove vive la guardia AOG della 1a): quella funzione gira **prima** della transazione e una lettura non serializzata dal lock lascerebbe esattamente la finestra TOCTOU che le prenotazioni hanno già chiuso mettendo i loro tre predicati **dentro** la transazione dopo il `FOR UPDATE` (`bookings.service.ts:567`, `:941`, `:1166`). P1 lo impone e la disciplina esistente lo conferma.
Firma proposta (il dev può cambiarne il nome, non la forma):

```ts
/** Un solo predicato di sovrapposizione per i voli — due call-site, mai due implementazioni. */
async function assertNoOverlappingFlight(
  tx: Prisma.TransactionClient,
  params: { aircraftId: string; takeoffAt: Date; landingAt: Date; excludeFlightId: string | null },
): Promise<void>
```

Posizione dei due call-site:
- `registerFlight`: **subito dopo** il lock del velivolo (`:1103-1106`), **prima** dell'`account.upsert` di `:1112` — così una registrazione rifiutata non passa nemmeno per la get-or-create del conto (che pure rollbackerebbe: è economia, non correttezza).
- `correctFlight`: **subito dopo** il lock multi-riga (`:1443-1450`) e **prima** dello storno di `:1465`, con `excludeFlightId = originalFlight.id`.

⚠️ In **entrambi** i call-site gli argomenti vengono da `resolved`, **non** dal volo originale: `aircraftId: resolved.aircraft.id`, `takeoffAt: resolved.takeoffAt`, `landingAt: resolved.landingAt`. In `correctFlight` è **il velivolo NUOVO** che va interrogato (una correzione che sposta il volo su un altro velivolo deve essere verificata **là**), ed è già sotto lock perché `aircraftIds` (`:1442`) contiene entrambi.

**AD-2 — Il predicato, e perché ogni sua clausola c'è.**

```ts
const conflict = await tx.flight.findFirst({
  where: {
    aircraftId: params.aircraftId,
    status: 'REGISTERED',
    takeoffAt: { lt: params.landingAt },
    landingAt: { gt: params.takeoffAt },
    ...(params.excludeFlightId === null ? {} : { id: { not: params.excludeFlightId } }),
  },
  orderBy: { takeoffAt: 'asc' },
  select: { id: true, takeoffAt: true, landingAt: true },
});
```

| Clausola | Perché |
|---|---|
| `takeoffAt < landingAt_new` **e** `landingAt > takeoffAt_new` | **stesso** predicato semi-aperto delle prenotazioni (**[I-1]**): due voli che si toccano (`landingAt_esistente == takeoffAt_nuovo`) **non** si sovrappongono — un rientro alle 10:00 e un decollo alle 10:00 sono lo stesso istante di pista, non un conflitto |
| `status: 'REGISTERED'` | un volo `CANCELLED` **non occupa** nulla: è la stessa scelta di «solo `APPROVED` occupa lo slot» delle prenotazioni. Rende inoltre la guardia **indipendente dall'ordine** dello storno in `correctFlight` |
| `id: { not: excludeFlightId }` | in `correctFlight` la guardia gira **prima** dello storno, quindi l'originale è **ancora `REGISTERED`**: senza questa clausola **ogni** correzione che tiene il proprio slot (il caso comune: correggere le note, i cicli, il contaore) sarebbe un 409. Qui la clausola è **portante**, non decorativa |
| `orderBy: { takeoffAt: 'asc' }` | fra più conflitti il volo **nominato** dev'essere deterministico, o un'asserzione e2e diventa flaky per costruzione |
| `select` di tre campi | è tutto ciò che serve al `details`; nessun `FLIGHT_SELECT` (nessuna maschera, nessun join) |

**Righe con `takeoffAt`/`landingAt` a `NULL`** (voli storici pre-11.1: le colonne sono nullable, `schema.prisma:1007-1017`): un `NULL` non soddisfa né `lt` né `gt`, quindi **non conflitta e non è conflittabile**. È corretto e va **dichiarato**: prima della 11.1 gli istanti non esistevano, quindi la sovrapposizione non era nemmeno esprimibile (audit F3, difetto 2). Nel DB di lavoro tali righe sono **0** (misura §3.6); in produzione possono esistere.

**AD-3 — Il 409 e il suo `details`: una riga di `handler.ts` va cambiata, ed è misurata.**
Oggi `handler.ts:60` passa `details` **solo** per `ValidationError`. Con il codice attuale un `ConflictError('…', { … }, 'FLIGHT_OVERLAP')` arriverebbe al client **senza** `details` — cioè P1 sarebbe silenziosamente non soddisfatto e nessun test lo vedrebbe (nessuna `ConflictError` popola `details` oggi). Modifica **minima e additiva**:

```ts
const details = error instanceof ValidationError || error instanceof ConflictError ? error.details : undefined;
```

Blast radius **nullo per costruzione**: `errors.ts` dichiara che nessun caller di `ConflictError` popola `details`; il censimento dei 39 `new ConflictError(` in `src/server` (§3.3) lo conferma — tutti a un solo argomento. Il payload:

```
409 { "error": { "code": "FLIGHT_OVERLAP",
                 "message": "…",
                 "details": { "flightId": "…", "takeoffAt": "2026-09-01T09:00:00.000Z", "landingAt": "2026-09-01T10:00:00.000Z" } } }
```

`takeoffAt`/`landingAt` sono **ISO 8601 UTC espliciti** (`.toISOString()`), non `Date` lasciate serializzare da `NextResponse.json`: stessa disciplina di `aircraft-status.ts#outOfServiceDetails`, che converte a mano — l'API è consumata anche dall'app Flutter e il contratto va scritto, non dedotto. Il **messaggio server** è una riga di log, non una superficie utente (AD-3 della 1a): la frase che l'operatore legge è composta client-side dalle label (AD-11).

**AD-4 — Perimetro: dove la guardia vale e dove no.**

| Percorso | Guardia | Perché |
|---|---|---|
| `registerFlight` | **SÌ** | è P1/P2 |
| `correctFlight`, che **tiene** il proprio slot | **SÌ, e passa** | l'originale è escluso per id: una correzione di note/cicli/contaore non diventa mai un vicolo cieco |
| `correctFlight`, che **sposta** il volo su uno slot occupato (stesso velivolo o velivolo nuovo) | **SÌ, e blocca** | è una registrazione nuova su quello slot |
| `cancelFlight` | **MAI** | uno storno non crea nessun intervallo (stessa riga dell'AD-4 della 1a) |
| `force: true` | **non deroga** | ratifica del piano: 409 **non derogabile**. Nessun vicolo cieco: il 409 **nomina** il volo in conflitto, e la via d'uscita è stornare/correggere quello — un'azione che l'app già offre |

⚠️ **Ordine degli errori, da dichiarare**: `resolveFlightInput` gira **prima** della transazione, quindi tutti i suoi 404/422 (velivolo archiviato, AOG, persona, documenti, tariffe, orari) **precedono** il 409. Una richiesta sia sovrapposta **sia** su velivolo archiviato risponde `AIRCRAFT_ARCHIVED`. È la stessa gerarchia di `createBooking` (i 422 di stato prima, il 409 di sovrapposizione dentro la transazione) e va scritta nel doc-comment: *existence 404 → state/domain 422 → conflict 409*.

**AD-5 — Nessuna migrazione, nessun indice nuovo, e il piano è misurato.**
`Flight` ha già `@@index([aircraftId])` (`schema.prisma:1085`). `EXPLAIN` del predicato sul DB di lavoro:

```
 Limit  (cost=8.18..8.19 rows=1 width=42)
   ->  Sort  (cost=8.18..8.19 rows=1 width=42)
         Sort Key: "takeoffAt"
         ->  Index Scan using "Flight_aircraftId_idx" on "Flight"  (cost=0.14..8.17 rows=1 width=42)
               Index Cond: ("aircraftId" = 'x'::text)
               Filter: ((status = 'REGISTERED') AND ("takeoffAt" < now()) AND ("landingAt" > now()))
```

L'indice **è scelto**; lo `status`/gli istanti restano un filtro sulle righe di **quel** velivolo. Ordine di grandezza del filtro: il velivolo più volato del DB di lavoro ha **21** voli; nel DB di carico (`seed-load.ts`) sono ~40 per velivolo (60 000 voli / 1 500 velivoli). Un `@@unique([aircraftId, takeoffAt, status])` parziale (l'alternativa che l'audit nomina) **non si fa**: costa una migrazione, non copre la sovrapposizione *parziale* (che è il caso 14 dell'audit) e non può convivere con i dati già sovrapposti in DB. Il costo dichiarato di questa story è **una `findFirst` indicizzata per registrazione/correzione, dentro un lock già preso**.

**AD-6 — F13: si scrive la `HourMeterAdjustment`, NON si risponde 422. (Decisione di questo file, come il piano chiede.)**
Il 422 è **escluso** per tre ragioni concordi:
1. Bloccherebbe uno storno, contro il Contesto della 5.3 (*«cancellare è sempre lecito»*) e contro il doc-comment che il clamp ha **da sempre** (`:64-67`): *una rettifica manuale che sottostima i minuti di questo volo non deve mai BLOCCARE l'annullamento*.
2. Sarebbe un **vicolo cieco misurabile**: l'unica uscita per l'operatore sarebbe alzare a mano il contaore con una `adjustHourMeter` inventata **solo** per poter stornare — cioè falsificare l'audit trail per rispettarlo (lezione 14.6 F2).
3. `HourMeterAdjustment` esiste **esattamente** per questo (`schema.prisma:407-428`); scrivere la riga **ripristina** [I-3] senza toccare la semantica del clamp.

> Nota di onestà, da riportare nel Dev Agent Record: la frase dello schema (`:274-276`) dice «**ONLY** via a tracked `HourMeterAdjustment` — never through this table's generic update path», e il `+=` di `registerFlightCore` (`:1048`) è **già** la generic update path. **[I-3]** (che descrive tre scrittori) è la lettura corretta e più recente. Questa story **non** riallinea quel doc-comment né instrada la registrazione dentro `HourMeterAdjustment` (sarebbe una riscrittura del percorso di scrittura del contaore, fuori richiesta): chiude l'unico caso in cui il contaore cambia **perdendo informazione** — il clamp. La divergenza fra la lettera del doc-comment e le tre scritture è **preesistente** e va **segnalata**, non corretta qui.

Forma (una funzione, **due** call-site — `cancelFlight:1358-1361` e `correctFlight:1493-1494`):

```ts
/** Il contaore giù di uno storno: clamp a 0 + (SOLO se il clamp morde) la riga di rettifica che [I-3] pretende. Ritorna il nuovo valore. */
async function decreaseHourMeterForReversal(
  tx: Prisma.TransactionClient,
  params: { aircraftId: string; currentMinutes: number; flightMinutes: number; actorUserId: string;
            flight: { id: string; registration: string; flightDate: Date } },
): Promise<number>
```

- Scrive **solo se** `currentMinutes - flightMinutes < 0` (se il clamp non morde, il comportamento resta **byte-identico** a oggi: nessuna riga, nessun costo).
- Riga: `previousMinutes = currentMinutes`, `newMinutes = 0`, `reason` **generato**:
  `Storno volo {registration} {YYYY-MM-DD} (id {flightId}): {n} minuti non sottraibili dal contaore.` con `n = flightMinutes - currentMinutes`.
- `reason` è **italiano non localizzato** e **visibile all'utente** (`aircraft-editor.tsx:1404` rende `entry.reason` nello storico contaore). Precedente esatto e dichiarato: le `description` generate dei movimenti (`Volo {registration} {data} — {H:MM}`, `:990`; `Storno volo {registration} {data} — {motivo}`, `:1342`) sono già italiano generato server-side. Non si introduce i18n server-side per una riga d'audit.
- `HourMeterAdjustment` **non ha** una FK verso `Flight` (`schema.prisma:414-428`): il legame è **nel testo**, e per questo il testo contiene l'id. **Nessuna migrazione** (aggiungere la FK sarebbe capacità non richiesta).
- `actorUserId` è l'attore dello storno (la colonna è NOT NULL).
- In `correctFlight` la riga registra **il clamp**, cioè `current → 0`, **non** il valore finale (`0 + minuti_nuovi`): sono due eventi distinti — la rettifica dello storno e il `+=` ordinario della registrazione nuova. Conflatarli in una riga sola racconterebbe un evento che non è avvenuto. **Da scrivere nel doc-comment**, perché è la prima domanda che farà la review.
- La guardia atomica e l'ordine dei lock **non si toccano**; la riga nasce nella **stessa** transazione dello storno (come `adjustHourMeter`, `aircraft.service.ts:633-659`).

**AD-7 — F14: `min(1)` al bordo Zod per i cicli; il minimo di durata dove già vive il massimo.**
- `takeoffs`/`landings`: `schemas/flights.ts:106-107` `min(0)` → **`min(1)`**. Allineamento **letterale** al doc-comment dello schema Prisma (`:1027-1032`), default DB già `1`, **nessuna migrazione**. Il 422 è il `VALIDATION_ERROR` di Zod, con `path` sul campo: è esattamente «al bordo Zod» che P5 chiede.
- **Durata minima**: **deviazione dichiarata dalla lettera di P5**. Il bordo inferiore va **dove già vive il bordo superiore** — `resolveFlightInput:751-757`, codice `FLIGHT_TIMES_INVALID` — e non in un `.refine` Zod. Tre ragioni: (i) **un** vincolo di durata, **un** codice sul filo, **un** messaggio i18n già esistente e già mappato dal form (un `.refine` risponderebbe `VALIDATION_ERROR` con `path: ['landingAt']`, che il form **non** mappa: `flight-editor.tsx:661` conosce `landingTime`, non `landingAt` ⇒ l'utente leggerebbe «Riprova»); (ii) il confronto è fra due istanti già parsati dal service; (iii) la regola diventa: *`landingAt` deve essere successivo a `takeoffAt` di **almeno un minuto** e la durata non può superare 1440 minuti*, un'unica frase.
  Conseguenza: `Math.max(1, …)` a `:754` diventa **orfano del mio stesso cambiamento** (con `landingAt - takeoffAt >= 60_000` il `Math.round` non può più dare 0) e va **rimosso**, non lasciato come rumore.
  ⚠️ **Non si introduce nessun minimo diverso da 1 minuto**: l'audit lascia esplicitamente al PO l'ipotesi «5 minuti?» e **non è ratificata** ⇒ speculativa (karpathy §2). Va in §6 come domanda aperta.

**AD-8 — L'asse PERSONA è FUORI da questa story, dichiarato.**
F3 elenca **tre** difetti nella stessa lacuna: duplicazione, sovrapposizione sul **velivolo**, sovrapposizione sulla **persona** (lo stesso pilota su due aerei). Gli AC di contratto (P1-P3) nominano **solo** il velivolo. La persona resta fuori per ragioni tecniche, non di comodo: **il lock sul velivolo non la serializza** (esattamente come in F2 per le prenotazioni), quindi servirebbe un lock sulla persona o un vincolo equivalente — che è **la decisione ancora aperta della story 16.3** (suo AC 2). Aggiungere qui una guardia non serializzata darebbe una protezione che regge sui test sequenziali e cede sotto concorrenza: peggio che dichiararla mancante. ⇒ **TD da registrare** (§6), da chiudere con l'idioma che la 16.3 sceglierà.

**AD-9 — Ortogonalità con la story 16.1 (un solo calendario).**
La guardia confronta **due istanti** (`DateTime` timestamptz): nessuna data-only, nessun «oggi», nessun giorno di calendario ⇒ **immune** al fuso e indipendente dall'esito della 16.1. Questa story **non tocca** `:763` (`FLIGHT_DATE_IN_FUTURE`) né le due `effectiveDate: todayDateOnlyUtcInZone(APP_TIMEZONE)` (`:1341`, `:1477`), che sono **della 16.1** (già scritte nel working tree, v. nota di baseline). Il minimo di durata (AD-7) è pure un confronto fra istanti.

**AD-10 — OpenAPI/registry nello stesso commit.**
Le tre `registerPath` toccate hanno **già** `409` in `errorResponses` (`registry.ts:982`, `:997`, `:1012`): nessuno status nuovo. Va aggiornata la **descrizione** di `POST /api/v1/flights` (`registry.ts:976`) e di `POST /api/v1/flights/{id}/correct` (`registry.ts:1006`) nominando `FLIGHT_OVERLAP`, la semantica semi-aperta, l'esclusione dell'originale in correzione, il fatto che `force` **non** deroga, e i nuovi bordi di `takeoffs`/`landings`/durata. `registry.test.ts` usa `expect.arrayContaining` ⇒ **non** segnala una descrizione stale: la verifica è la lettura (lezione 15.9).
🔎 **Testo morto notato, non toccato** (karpathy §3): la descrizione a `registry.ts:976` contiene ancora *«Exactly one of `minutes` or the `hourMeterStart`/`hourMeterEnd` pair must be given»*, falso dalla 11.1. **Segnalato**, non corretto qui: non è riconducibile a questa richiesta. Va nel Dev Agent Record come voce per il backlog.

**AD-11 — La UI: due frasi nuove, un ramo che oggi mente, due `min`.**
| Pezzo | Dove | Cosa |
|---|---|---|
| Il ramo 409 della **correzione** che oggi **mente** | `flight-editor.tsx:633-635`: `if (isCorrecting && response.status === 409) setFormError(labels.conflictError)` — cioè «Questo volo è già stato annullato.» | un `FLIGHT_OVERLAP` in correzione leggerebbe una frase **falsa**. Il ramo va **preceduto** dal controllo del codice: `FLIGHT_OVERLAP` prende il suo messaggio, tutto il resto resta **byte-identico** |
| La frase del 409 | `messages/{it,en}.json` → `LogbookPage.editor.errors.FLIGHT_OVERLAP`, `t.raw` (placeholder client-side, come `AIRCRAFT_OUT_OF_SERVICE`) | deve **nominare data e ora** del volo in conflitto (`details.takeoffAt`/`landingAt`, formattati con `formatDateOnly`/`H:MM` come il resto del form) — è ciò che rende l'errore azionabile invece di un muro |
| Il minimo dei cicli | `flight-editor.tsx:998`, `:1001` (`min={0}` → `min={1}`) **e** un controllo client-side accanto a `:591-592`, con **una** label nuova `LogbookPage.editor.invalidCycles` | il `<form>` è `noValidate` (`:894`) ⇒ `min` non blocca il submit: senza il controllo client-side uno `0` digitato risponderebbe «Riprova». Il precedente **esatto** è `labels.invalidHourMeter` (`:585`), stessa meccanica, stesso banner |
| Il plumbing delle label | **due** builder: `logbook/page.tsx:349-377` e `dashboard/page.tsx:824-850` (duplicati per progetto, v. il doc-comment a `dashboard/page.tsx:778`) + il tipo `FlightEditorLabels` (`flight-editor.tsx:86-115`, `:56`) | una label aggiunta in un solo builder è un `undefined` a runtime nell'altra pagina |

**Nessuna** superficie mobile duplicata: `FlightEditor` è **uno** (`grep FlightEditor` → `logbook-console.tsx:966`, `dispatch-flight-button.tsx:51`), senza gemello `-mobile`. Nessun testid nuovo ⇒ la convenzione 15.1/15.5 non è in gioco (verifica comunque `grep -rn 'data-testid\^=' e2e/` prima di aggiungerne uno).

---

## §2 — Acceptance Criteria

### La guardia di sovrapposizione

1. **Given** un volo `REGISTERED` sul velivolo A, `takeoffAt` 09:00Z / `landingAt` 10:00Z **When** registro sullo **stesso** velivolo un volo 09:30Z→10:30Z **Then** `409` con `error.code === 'FLIGHT_OVERLAP'`, **nessun** `Flight` creato, **nessun** `AccountMovement`, contaore **invariato** (verificato leggendo `hourMeterMinutes` prima e dopo).
2. **Given** lo stesso volo **When** registro 10:00Z→11:00Z (`takeoffAt_nuovo == landingAt_esistente`) **oppure** 08:00Z→09:00Z (`landingAt_nuovo == takeoffAt_esistente`) **Then** `201` in **entrambi** i casi: i bordi che si toccano non sono sovrapposizione, **stessa** semantica semi-aperta di **[I-1]** (un unit per ciascuno dei due bordi).
3. **Given** un volo che si sovrappone **When** il 409 arriva al client **Then** `error.details` contiene `flightId`, `takeoffAt`, `landingAt` del volo in conflitto, gli istanti come **stringhe ISO 8601 UTC**; e il pass-through di `details` per `ConflictError` (`handler.ts:60`) ha **il suo** unit in `handler.test.ts`, sul modello di *«maps a domain-level ValidationError to 422 with its `details`»* (`handler.test.ts:255-267`).
4. **Given** un volo `CANCELLED` che occupava 09:00Z→10:00Z **When** registro 09:00Z→10:00Z sullo stesso velivolo **Then** `201`: solo `REGISTERED` occupa. **E Given** un volo storico con `takeoffAt`/`landingAt` a `NULL` sullo stesso velivolo **Then** non conflitta mai — la proprietà **non è producibile dall'API** (gli istanti sono obbligatori dalla 11.1), quindi si verifica come **forma del predicato**: un unit asserisce il `where` passato a `findFirst` (nessuna clausola che catturi `NULL`) e il **doc-comment** dichiara il limite. Nessun test e2e per questo caso: fabbricare la riga richiederebbe una scrittura diretta a DB fuori dal dominio.
5. **Given** fra più voli in conflitto **When** il 409 viene composto **Then** il volo nominato è quello con il `takeoffAt` **minore** (`orderBy` esplicito), così l'asserzione è deterministica.
6. **Given** la guardia **When** si cerca la sua implementazione **Then** esiste **una sola** funzione con **due** call-site (`registerFlight` dopo il lock di `:1103`, `correctFlight` dopo il lock di `:1443`), **dentro** la transazione, **prima** di ogni scrittura; nessun secondo predicato di sovrapposizione compare in `src/server` (verifica: `grep -rn "takeoffAt: { lt\|landingAt: { gt" src/` → esattamente **1** occorrenza).

### Duplicato e idempotenza (contratto TD-2 invariato)

7. **Given** la stessa richiesta **byte-identica**, **senza** `Idempotency-Key`, inviata due volte **Then** la prima `201`, la seconda **`409 FLIGHT_OVERLAP`**; a DB **un** `Flight`, **un** `FLIGHT_CHARGE`, contaore avanzato **una** volta (`6000 → 6060`, mai `6120`).
8. **Given** la stessa richiesta **con** lo stesso `Idempotency-Key` due volte **Then** la seconda risposta è **`201`** (lo `successStatus` della rotta, replayato da `handler.ts:480-486` — **non** 200: l'AC del piano dice «200», la misura dell'audit §5.2 e il codice dicono **201**; la correzione è dichiarata qui) con header `Idempotency-Replayed: true`, **stesso** `flight.id`, **un** solo movimento, contaore avanzato una volta. Nessuna riga di `handler.ts` relativa al gate di idempotenza è modificata dalla story (diff dichiarato: **solo** la riga 60).
9. **Given** due `POST /api/v1/flights` **paralleli**, identici, senza chiave **Then** esattamente **una** `201` e **una** `409` — il lock `FOR UPDATE` sul velivolo serializza, come già misurato per le prenotazioni (audit §5.1, sonda 5). Test e2e con due `page.request.post` in `Promise.all` (modello: `idempotency.spec.ts:100-104`).

### La correzione

10. **Given** un volo e una sua correzione che **cambia solo le note** (stesso velivolo, stessi orari) **Then** `201`: l'originale è escluso per id. **E Given** una correzione che sposta il volo su un intervallo occupato da un **altro** volo `REGISTERED` (stesso velivolo o velivolo diverso) **Then** `409 FLIGHT_OVERLAP` che nomina quell'altro volo, e **la transazione intera** (storno compreso) non ha effetto: il volo originale è ancora `REGISTERED`, senza `FLIGHT_CHARGE_REVERSAL` (asserzione a DB o via `GET /api/v1/flights`).
11. **Given** `force: true` + `forceReason` su una richiesta sovrapposta **Then** **409** comunque: la deroga non copre questa guardia (ratifica del piano); nessun `forcedAt` scritto, e il doc-comment della guardia dice **perché** e **dove** sta la via d'uscita (stornare o correggere il volo nominato).

### Il contaore (F13)

12. **Given** un velivolo con contaore **5** e un volo `REGISTERED` da **30** minuti **When** lo storno **Then** `200`, contaore **0**, **e** una riga `HourMeterAdjustment` `previousMinutes = 5`, `newMinutes = 0`, `reason` che nomina marche, data del volo, id e i **25** minuti non sottraibili; tutto nella **stessa** transazione (rollback insieme allo storno). Riprodotta anche via `correctFlight`.
13. **Given** un velivolo con contaore **6000** e un volo da 30 minuti **When** lo storno **Then** contaore **5970** e **nessuna** riga `HourMeterAdjustment` creata: quando il clamp non morde il comportamento è **identico a oggi** (unit di non-regressione).
14. **Given** qualunque storno **Then** non esiste nessun percorso che risponda 422 per il contaore: lo storno resta **sempre lecito** (AD-6), e il doc-comment del modulo (`:64-67`) è aggiornato per dire che il clamp **ora lascia traccia** invece di limitarsi a essere «deliberato».
15. **Given** `grep -rn "data: { hourMeterMinutes\|hourMeterMinutes:" src/server` **Then** i punti che **scrivono** il contaore sono **tre**, uno **in meno** di oggi: il `+=` di `registerFlightCore` (`:1048`), il `SET` di `adjustHourMeter` (`aircraft.service.ts:654-658`) e il **nuovo helper** (che assorbe i due `Math.max(0, …)` di `cancelFlight` e `correctFlight`, oggi due scritture separate). Il censimento, voce per voce e classificato, va nel Dev Agent Record — come fu per l'invariante [a] dell'AOG.

### I bordi dichiarati dallo schema (F14)

16. **Given** `takeoffs: 0` o `landings: 0` **Then** `422` al bordo Zod; e il test di schema esistente `flights.service.test.ts:2283-2289` («rejects takeoffs/landings outside [0, 500]») è **invertito** sul caso `0` e rititolato — non cancellato: era la prova che il bordo **sbagliato** era intenzionale.
17. **Given** `takeoffAt` 09:00:00Z e `landingAt` 09:00:20Z (la sonda 17 dell'audit) **Then** `422 FLIGHT_TIMES_INVALID`, non un volo da 1 minuto; `landingAt` 09:01:00Z → `201` con `minutes = 1`; il tetto di 1440 minuti risponde **come oggi**, stesso codice; `Math.max(1, …)` è rimosso perché orfano (AD-7).
18. **Given** il form **Then** i due input cicli hanno `min={1}` e uno `0` digitato risponde con la label `invalidCycles` in **entrambi** i locale (mai «Riprova»); e un `FLIGHT_OVERLAP` — in registrazione **e** in correzione — nomina **data e ora** del volo in conflitto in entrambi i locale, con parità di chiavi it/en verificata.

### Non-regressione e prove

19. **Given** il **pre-fix simulato** (P6) **Then** ognuna delle guardie nuove ha la sua discriminanza **ROSSA** provata, con ripristino `sha256` dei file toccati, secondo la tabella §4.3. Il punto di partenza è già scritto: il test throwaway di §4.4, che **oggi passa** riproducendo `6000 → 6060 → 6120`, dopo il fix deve **fallire** e va portato dentro `flights.service.test.ts` con l'aspettativa **rovesciata**.
20. **Given** la suite completa **Then** `npm run gates` verde e suite e2e completa su build di produzione e **DB fresco**, con le **tre** fixture di §3.5 corrette **spostando gli orari** — mai indebolendo un'asserzione, mai cancellando un caso.
21. **Given** `registry.ts` **Then** aggiornato nello **stesso commit** (AD-10), con le descrizioni delle due POST che nominano `FLIGHT_OVERLAP`, la semantica dei bordi, la non-derogabilità e i nuovi minimi.

---

## §3 — Dev Notes: blast radius (misurato sul working tree del 2026-09-10, 16.1 in-flight inclusa — v. nota di baseline)

### 3.1 File da modificare

| File | Righe | Cosa |
|---|---|---|
| `src/server/services/flights.service.ts` | `598-903` (nessun cambio), `751-757` (bordo inferiore durata; `754` `Math.max` via), `977-1052` (nessun cambio), `1103-1112` (call-site 1), `1304-1372` (clamp → helper), `1411-1555` (call-site 2 + clamp → helper), doc-comment modulo `:56-79` | 2 funzioni nuove (guardia, helper contaore), 2 call-site ciascuna |
| `src/lib/api/handler.ts` | **`60`** | `details` anche per `ConflictError` (AD-3) |
| `src/lib/schemas/flights.ts` | `106-107` | `min(0)` → `min(1)` (+ doc-comment: il perché è il doc-comment Prisma) |
| `src/lib/schemas/registry.ts` | `976`, `1006` | descrizioni (AD-10) |
| `src/app/[locale]/dashboard/logbook/flight-editor.tsx` | `56`, `86-115`, `591-592`, `633-635`, `727-728`, `998`, `1001` | tipo label, controllo cicli, ramo 409, due `min` |
| `src/app/[locale]/dashboard/logbook/page.tsx` | `349-377` | 2 label nuove |
| `src/app/[locale]/dashboard/page.tsx` | `824-850` | le **stesse** 2 label (builder duplicato) |
| `messages/it.json`, `messages/en.json` | `LogbookPage.editor` | `errors.FLIGHT_OVERLAP`, `invalidCycles` |

**Nessuna** migrazione Prisma. **Nessun** file nuovo (le due funzioni stanno accanto a chi le usa: `flights.service.ts` è già il posto di `resolveFlightInput`/`registerFlightCore`; estrarre un modulo per due funzioni con due call-site interni sarebbe astrazione a uso singolo — karpathy §2).

### 3.2 Test unit: i mock, non i dati

`flights.service.test.ts` (2 335 righe) è **interamente mockato** (`vi.mock('@/server/db/prisma')`, `:13-49`) e `$transaction` è uno stand-in che passa `prisma` come `tx` (`:160-166`). Conseguenza **verificata**: **nessuno** dei ~200 test esistenti «collide» con la guardia nuova — non esiste un DB dove due voli coesistano. Serve **una** riga nel mock (`flight: { …, findFirst: vi.fn() }`, `:29-35`) e **un** default in `beforeEach` (`mockResolvedValue(null)`, accanto ai default `:311-330`), esattamente come fu per `expiryType.findMany`/`expiry.findMany` nella 14.4 — «ogni test preesistente continua a passare **non modificato**».
Stesso trattamento per il **secondo** file che mocka prisma con un `flight` parziale: `flights-expiry-boundary.integration.test.ts:23-35` (solo `flight: { create }`) — senza `findFirst` lancia `TypeError` appena la guardia gira.
Per il contaore serve inoltre `hourMeterAdjustment: { create: vi.fn() }` nel mock (oggi assente in `flights.service.test.ts`: la tabella era toccata solo da `aircraft.service.ts`).

### 3.3 Censimento `ConflictError` (per AD-3)

`grep -rn "new ConflictError(" src/server --include=*.ts | grep -v test` → **39** occorrenze in 9 service; **zero** passano un secondo argomento. Il pass-through di `details` non può quindi cambiare nessuna risposta esistente. Le 4 di `flights.service.ts` (`:1239`, `:1258`, `:1353`, `:1487`) restano invariate: la nuova è la **quinta**, l'unica con `details` e con un `code` non generico.

### 3.4 UI: cosa il form fa oggi (misurato)

- Registrazione: `POST /api/v1/flights` con `IDEMPOTENCY_KEY_HEADER` (`:618-625`); correzione: `POST /flights/{id}/correct` **senza** chiave (per progetto, TD-2: la correzione è già protetta da `reversalOfId`).
- `:630` rigenera la chiave **dopo** ogni risposta ⇒ un secondo clic *dopo* la risposta è una richiesta nuova con chiave nuova: **è esattamente il caso che il 409 copre**.
- `:633-635` il ramo che mente (AD-11). `:727-728` il fallback `knownErrors[code] ?? generic`: senza la label nuova, `FLIGHT_OVERLAP` leggerebbe «Impossibile registrare il volo. Riprova.» — un muro su un errore che ha una via d'uscita precisa.
- `<form … noValidate>` (`:894`) ⇒ `min={1}` da solo non basta (AD-11).

### 3.5 e2e: le TRE fixture che prenderanno il 409 (censimento completo)

| # | `file:riga` | Helper | Velivolo | Orari | Perché collide | Correzione richiesta |
|---|---|---|---|---|---|---|
| 1 | `e2e/flight-log.spec.ts:215` | `registerFlight` (`:173`, `T10:00:00.000Z` fisso) | fresco per test (`createAircraftWithRate`, `:138`) | `2020-02-01` 10:00→10:40 vs il volo di `:203` (`2020-02-01` 10:00→10:30, resta `REGISTERED`) | stesso velivolo, stessa data, stessa ora d'inizio | dare all'helper un parametro d'ora **oppure** spostare la data del terzo volo. ⚠️ Il test asserisce che il volo di **un'altra persona** sullo **stesso velivolo** non compare nel registro own-access: il «same aircraft» è il **punto** del caso ⇒ **si cambia l'ORA, non il velivolo** (es. 12:00→12:40) |
| 2 | `e2e/reports.spec.ts:247` | `registerFlight` (`:126`) — **non prende nessuna data**: sempre *oggi* `T10:00Z` | fresco per test (`:98`) | oggi 10:00→10:30 vs il volo SCHOOL di `:245` (oggi 10:00→11:00) | idem | l'helper deve accettare un'ora (default 10:00) e il secondo volo passare 12:00. I due voli **devono** restare nello stesso **mese Roma** (il test asserisce i KPI del mese: `todayDateOnly()` è deliberato) ⇒ **si sposta l'ora, mai il giorno** |
| 3 | `e2e/flights.spec.ts:451-460` | POST inline (non l'helper `flightTimes` di `:54`) | fresco per test (`:151`) | API `2020-01-01` 23:30Z→`2020-01-02` 00:10Z vs il volo appena registrato **dalla UI** nello stesso test (`:438-443`: data `2020-01-01`, 23:30→00:10) | `composeFlightTimes` (`flight-editor.tsx:206-215`) parsa `new Date('2020-01-01T23:30')` in **ora locale del browser**: su un host `Etc/UTC` (il container: lo dice lo spec stesso a `:497-501`) i due intervalli sono **identici** ⇒ 409 garantito lì, **assente** su un host `Europe/Rome`: la fixture è **TZ-dipendente** | spostare la **data** della chiamata API (es. `2020-01-05T23:30Z` → `2020-01-06T00:10Z`): conserva il senso del caso (atterraggio dopo mezzanotte via API, `minutes = 40`) e lo rende **indipendente dal fuso** — che è un miglioramento indipendente dalla guardia |

Siti di creazione **verificati non collidenti** (perché la story possa dichiarare il censimento completo): ogni velivolo e2e è creato **dentro** il test con marche run-unique (nessun `beforeAll` condiviso; nessuno spec registra voli sul velivolo di seed `I-ABCD`) ⇒ **zero** collisioni fra test sotto `fullyParallel`. Nel dettaglio: `flights.spec.ts:379`/`:781` (403, non arrivano alla guardia), `:399`/`:413` (422, nulla persiste), `:502`+`:534` (stesso velivolo ma 10:00→11:00 vs 12:00→12:30, già separati), `:611` (correzione del proprio volo), i test solo-UI (una registrazione ciascuno); `flight-log.spec.ts:203`/`:205` (date distinte), `:305`+`:306` (due velivoli), `:379` (21 date distinte); `exports.spec.ts:114`+`:115`, `:201`+`:202` (date distinte), `:264`; `pdf-exports.spec.ts:187`, `:347`; tutto `mobile-logbook.spec.ts` (velivolo fresco per test, date distinte, loop `2020-03-01..21`); `flight-reversal.spec.ts` (mai due `REGISTERED` sovrapposti); `aircraft-out-of-service-until.spec.ts:486`/`:498`/`:555` (422), `:582`→`:636`; `billing.spec.ts:263`, `:316`; `my-account.spec.ts:176`, `:248`; `my-compensation.spec.ts:280`; `instructor-compensation.spec.ts:131`/`:174`/`:217`; `mobile-reports.spec.ts:248`; `mobile-registries.spec.ts:262`, `:512`; `mobile-self-public.spec.ts:147`; `mobile-settings.spec.ts:610` (422); `people-management.spec.ts:179`; `person-detail.spec.ts:165`. **`e2e/idempotency.spec.ts` non tocca i voli** (usa i top-up): il contratto TD-2 va verificato dai test **nuovi** di questa story, non da lì.

**Seed**: `prisma/seed.ts` **non crea voli** (solo il velivolo `I-ABCD`, `:202-215`). `prisma/seed-demo.ts:440` usa il **vero** `registerFlight` e i suoi 24 voli stanno su 3 velivoli ma hanno **24 valori `daysAgo` distinti** (`:193-218`) ⇒ **0** coppie (velivolo, giorno) ripetute (verificato) ⇒ nessuna collisione, nessuna modifica. `prisma/seed-load.ts:770` usa `flight.createMany` (**bypassa** il service, quindi non vedrà mai il 409) ma **genera** sovrapposizioni sullo stesso velivolo: dedupla solo l'istante di decollo esatto (`:613-622`). Va **dichiarato** (§6), non corretto: è il DB di misura dell'epic 17 e nessun percorso di scrittura del dominio passa da lì.

### 3.6 Misure sul DB di lavoro (oggi, `docker compose` locale)

| Query | Esito |
|---|---|
| `SELECT count(*), count(DISTINCT "aircraftId") FROM "Flight"` | **131** voli su **64** velivoli |
| velivolo più volato | `I-L6MSJ1FJ05Z7Z` e `I-FL1786112542067-WC`: **21** voli ciascuno |
| coppie `REGISTERED` sovrapposte sullo stesso velivolo | **5** (residuo audit + fixture 1/2/3 di §3.5) |
| `"takeoffAt" IS NULL OR "landingAt" IS NULL` | **0** |
| residuo audit | 2 `Aircraft I-AUD%`, 7 `Flight notes LIKE 'audit_%'` |

⇒ il reset del DB **prima** dei run e2e non è igiene: senza reset, tre spec partono già rossi per dati, non per codice.

---

## §4 — Piano di test

### 4.1 Unit (`flights.service.test.ts`, `handler.test.ts`, e lo schema)

| # | Caso | Asserzione |
|---|---|---|
| U1 | sovrapposizione parziale (09:30→10:30 su 09:00→10:00) | `409`, `code: 'FLIGHT_OVERLAP'`, `flight.create` **mai** chiamato, `aircraft.update` **mai** chiamato |
| U2 | sovrapposizione totale (identica) | idem — è il duplicato di P2 |
| U3 | bordo `takeoff_nuovo == landing_esistente` | `201` |
| U4 | bordo `landing_nuovo == takeoff_esistente` | `201` |
| U5 | il conflitto è `CANCELLED` | `201` (il `where` chiede `status: 'REGISTERED'`) |
| U6 | `details` | `{ flightId, takeoffAt, landingAt }` con istanti ISO |
| U7 | `force: true` su richiesta sovrapposta | `409`, nessun `forcedAt` nei dati passati a `flight.create` |
| U8 | `correctFlight` che tiene il proprio slot | `201`; il `where` passato a `findFirst` contiene `id: { not: 'flight_orig' }` |
| U9 | `correctFlight` verso uno slot occupato, **sul velivolo originale** e (secondo caso) **su un velivolo DIVERSO** | `409` in entrambi, `findFirst` interrogato con `aircraftId === resolved.aircraft.id` (mai quello dell'originale), e `accountMovement.create` del **reversal** mai chiamato (la transazione non arriva allo storno) |
| U10 | clamp che morde (`current 5`, volo 30') | `hourMeterAdjustment.create` con `previousMinutes: 5`, `newMinutes: 0`, `reason` che contiene «25», le marche, la data e l'id; `aircraft.update` a `0` |
| U11 | clamp che non morde | `hourMeterAdjustment.create` **mai** chiamato |
| U12 | clamp in `correctFlight` | riga scritta con `newMinutes: 0`, e il contaore finale `0 + minuti_nuovi` |
| U13 | durata 20 s | `422 FLIGHT_TIMES_INVALID` |
| U14 | durata 60 s | `201`, `minutes: 1` |
| U15 | durata 1441 min | `422 FLIGHT_TIMES_INVALID` (non-regressione) |
| U16 | schema: `takeoffs: 0`, `landings: 0` | `safeParse().success === false` (test `:2283-2289` invertito e rititolato) |
| U17 | schema: `takeoffs: 1`, `landings: 500`, omessi | `true` (non-regressione dei bordi validi) |
| U18 | `handler.test.ts` | una `ConflictError` con `details` → `409` **con** `details` (modello: il test di `ValidationError` a `:255-267`) |

### 4.2 e2e (nuovo blocco in `e2e/flights.spec.ts` — velivolo fresco, nessuna `AppSettings` toccata ⇒ **niente** project serializzato)

| # | Caso | Asserzione |
|---|---|---|
| E1 | registrazione + richiesta **byte-identica senza chiave** | `201` poi `409 FLIGHT_OVERLAP`; `GET /api/v1/flights?aircraftId=…` → **1** riga; contaore del velivolo invariato dopo il secondo tentativo (via `GET /api/v1/aircraft/{id}`) |
| E2 | stessa richiesta **con** `Idempotency-Key` due volte | `201` + `201` con `idempotency-replayed: true`, **stesso** `flight.id`, **1** riga, contaore avanzato **una** volta (il contratto TD-2 provato **dentro** questa story) |
| E3 | due POST identici **in parallelo** | una `201`, una `409` (mai due 201) |
| E4 | bordi che si toccano | `201` |
| E5 | correzione che tiene il proprio slot / che si sposta su uno occupato | `201` / `409` + l'originale ancora `REGISTERED` |
| E6 | UI: il 409 in registrazione **e** in correzione | il banner del form nomina data e ora del volo in conflitto (IT), e **non** la frase «Questo volo è già stato annullato» |
| E7 | storno che sfonda il contaore | `adjustHourMeter` a 5 → storno di un volo da 30' → contaore `0` **e** `GET /api/v1/aircraft/{id}/hour-meter-adjustments` mostra **due** righe, la seconda col motivo generato |

Convenzioni obbligatorie: selettori scoped al landmark o `exact: true`; **mai** `hasText` con `H:MM` o date per disambiguare righe (lezione 11.2); **mai** `Escape` per chiudere un picker (lezione 14.3 F1/F2); nomi di fixture che non collidano con gli accessible-name dei campi (lezione 12.11 F2).

### 4.3 Tabella guardia → discriminanza (ognuna provata **ROSSA** sul pre-fix simulato, con ripristino `sha256`)

| Guardia | Pre-fix da simulare | Rosso atteso |
|---|---|---|
| sovrapposizione parziale | rimuovere la `findFirst` (o rendere il `where` sempre vuoto) | U1, E1, E3 |
| bordo semi-aperto | usare `lte`/`gte` invece di `lt`/`gt` | U3, U4, E4 |
| `status: 'REGISTERED'` | togliere la clausola | U5 |
| esclusione dell'originale | togliere `id: { not: … }` | U8, E5 (verde solo col fix) |
| `details` sul filo | riportare `handler.ts:60` a `ValidationError` solo | U6, U18, E6 |
| traccia del clamp | tornare a `Math.max(0, …)` inline | U10, U12, E7 |
| nessuna traccia se non morde | scrivere la riga **sempre** | U11 |
| minimo di durata | ripristinare `Math.max(1, …)` | U13 |
| minimo dei cicli | `min(0)` | U16 |

### 4.4 Il test discriminante di partenza (già scritto ed **eseguito** oggi, pre-fix)

`/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/story-16-2/f3-duplicate.test.ts` (throwaway, **fuori** dal repo: `vitest.config.ts` include solo `src/**`; eseguito con un config di scratch e `node_modules` simlinkato). Riproduce le sonde 13a/13b e 14 con l'idioma di mock di `flights.service.test.ts` e un contaore **stateful** (il `FOR UPDATE` restituisce ciò che l'`aircraft.update` precedente ha scritto). Esito **verbatim** di oggi:

```
 RUN  v4.1.9 /home/admin/AirManager

 ✓ …/story-16-2/f3-duplicate.test.ts > ops-audit F3 (pre-fix) — the flight registry accepts a duplicate and an overlap on the same aircraft > probe 13a/13b — the SAME request twice: two flights, two charges, contaore 6000 -> 6060 -> 6120 59ms
 ✓ …/story-16-2/f3-duplicate.test.ts > ops-audit F3 (pre-fix) — the flight registry accepts a duplicate and an overlap on the same aircraft > probe 14 — a partially overlapping flight on the SAME aircraft (09:30 -> 10:30) is accepted too 3ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

**Due test verdi = il difetto**: la seconda registrazione byte-identica è accettata, `flight.create` è chiamato **due** volte, i due `FLIGHT_CHARGE` sono `-15000` ciascuno e il contaore fa `6000 → 6060 → 6120` — i numeri esatti della tabella F3. Il dev **porta questi due casi dentro** `flights.service.test.ts` con l'aspettativa **rovesciata** (`rejects.toMatchObject({ code: 'FLIGHT_OVERLAP' })`, `flight.create` chiamato **una** volta, contaore `6060`) e cita nel Dev Agent Record entrambi gli output: quello di oggi (verde = difetto) e quello del pre-fix simulato dopo il fix (rosso = discriminanza).

### 4.5 Gate

`npm run gates` (mai i 4 comandi separati). Suite e2e **solo** via `scripts/e2e.sh start` + `scripts/e2e.sh status` (mai `playwright test` in foreground), su **DB fresco** e build di produzione, con `export JOBS_SECRET=<non-placeholder>` prima del run (`HANDOFF.md`). Per una serie di run mirati: build una volta + `E2E_REUSE_SERVER=1`. Se ripetendo run mirati un login inizia a fallire sempre: è il cap anti-brute-force (`LoginAttempt`), non la story.

---

## §5 — Trappole note

1. **`details` scartato in silenzio** (AD-3): senza la riga di `handler.ts` la story «funziona» in unit (l'errore ha i suoi `details` in memoria) e **fallisce sul filo**. È la trappola numero uno di questa story.
2. **`correctFlight` senza `id: { not: … }`**: la guardia gira **prima** dello storno ⇒ ogni correzione conservativa diventa un 409. Il test U8 esiste per questo.
3. **La fixture TZ-dipendente** (`flights.spec.ts:451`): oggi collide sul container (UTC) e **non** collide su una Fedora in `Europe/Rome`. Un dev che verifichi solo in locale può non vederla mai. Correggerla **spostando la data**, non l'ora.
4. **L'helper senza data di `reports.spec.ts:126`**: cambiare la **data** ai suoi voli rompe il test in un altro modo (i KPI sono del **mese Roma corrente**). Si cambia **l'ora**.
5. **Due builder di label**: aggiungere una chiave solo in `logbook/page.tsx` lascia `undefined` nel form aperto dalla Panoramica (`dashboard/page.tsx:824-850`), e il crash si vede **solo** su quella pagina.
6. **`noValidate`** (`flight-editor.tsx:894`): `min={1}` non blocca nulla da solo.
7. **In `correctFlight`, passare `originalFlight.aircraftId` invece di `resolved.aircraft.id`**: la guardia controllerebbe il velivolo **sbagliato** su ogni correzione che cambia velivolo — e nessun test sequenziale la vedrebbe se i due velivoli sono liberi. Il caso U9/E5 con **velivolo diverso** esiste per questo.
8. **Il mock `$transaction`** passa `prisma` come `tx` (`:160-166`): la guardia deve usare **`tx`**, non `prisma`, altrimenti in produzione la lettura esce dalla transazione (e i test resterebbero verdi comunque — errore invisibile ai test).
9. **Il secondo file di mock**: `flights-expiry-boundary.integration.test.ts:23-35` mocka `flight: { create }` e basta.
10. **`hourMeterAdjustment` non è nei mock** di `flights.service.test.ts`: va aggiunto, o U10/U12 falliscono con un `TypeError` che sembra un bug del codice.
11. **Non toccare** `:763` né le `effectiveDate: todayDateOnlyUtcInZone(APP_TIMEZONE)` (`:1341`, `:1477`): sono della 16.1 (AD-9). Un diff di questa story su quelle righe è un segnale di scope creep — o il sintomo di un working tree condiviso con un altro dev.
12. **La descrizione OpenAPI** non è coperta da test (`expect.arrayContaining`): se non la si aggiorna, nessun gate protesta (lezione 15.9).
13. **Il `reason` generato è visibile** (`aircraft-editor.tsx:1404`): va letto come una frase, non come un log.

---

## §6 — Fuori scope DICHIARATO

| Voce | Perché fuori | Dove va |
|---|---|---|
| **Sovrapposizione per PERSONA sui voli** (F3, difetto 3: lo stesso pilota su due aerei nello stesso istante) | il lock sul velivolo **non** la serializza; l'idioma (lock sulla persona o vincolo equivalente) è la decisione aperta della **16.3** AC 2. Una guardia non serializzata sarebbe una falsa sicurezza | **TD nuovo** in `sprint-status.yaml`: «sovrapposizione per persona sui voli — da chiudere con l'idioma scelto dalla 16.3» |
| **Durata minima > 1 minuto** (l'ipotesi «5 minuti?» dell'audit) | **non ratificata**: sarebbe una regola di dominio inventata dal dev | domanda PO (§7) |
| **Un `0` digitato a mano nei cicli via API** | il 422 c'è (AC 16); il messaggio dedicato lo dà il controllo client-side (AC 18). Non si aggiunge un **codice di dominio** nuovo per un finding LOW | dichiarato |
| **`seed-load.ts` che genera sovrapposizioni** (`:613-622`, `:770`) | usa `createMany`, **bypassa** il service: nessun percorso di dominio ci passa. Il DB di carico è lo strumento di misura dell'epic 17 | dichiarato nel Dev Agent Record; TD se l'epic 17 lo richiede |
| **Riscrivere/ripulire le 5 coppie sovrapposte già in DB** | registro append-only; una guardia vale sulle scritture nuove | dichiarato |
| **Rinominare `conflictError`** o rifattorizzare la gestione errori del form | fuori richiesta (karpathy §3): si **aggiunge** un ramo, non si riscrive il blocco | — |
| **Il testo morto in `registry.ts:976`** («Exactly one of `minutes` …», falso dalla 11.1) | non riconducibile a questa richiesta | segnalato nel Dev Agent Record |
| **FK `HourMeterAdjustment → Flight`** | migrazione non richiesta; il legame nel `reason` soddisfa la tracciabilità che F13 chiede | dichiarato |
| **Rendere obbligatorio `Idempotency-Key`** | §5.2 dice che l'opt-in è corretto; il 409 **è** la seconda linea di difesa richiesta | — |
| **`todayDateOnly()` client-side in `flight-editor.tsx:230`** (`toISOString().slice(0,10)`: fra 00:00 e 02:00 Roma precompila **ieri**) | è **una delle 7 copie** censite dalla ricognizione 16.1 e assegnate alla **story 16.9** (già in `sprint-status.yaml:487`). Il dev di questa story apre lo stesso file: **non** la tocchi | story **16.9** |
| **Riallineare il doc-comment di `schema.prisma:274-276`** alle tre scritture reali del contaore | preesistente, non riconducibile a questa richiesta | segnalato nel Dev Agent Record |

---

## §7 — Riferimenti

- **AC di contratto**: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` → «Story 16.2», «Architettura e vincoli», blocco ratifiche.
- **Findings**: `_bmad-output/planning-artifacts/audit-2026-09-10/ops-audit.md` → **F3** (§3, sonde 13a/13b/14/15), **F13** (sonda 19), **F14** (sonda 17), invarianti **[I-1]**/**[I-2]**/**[I-3]**/**[I-5]**, **§5.1** (concorrenza verificata), **§5.2** (idempotenza verificata), **§7** (residuo su DB e query di pulizia).
- **Idioma della guardia condivisa**: `_bmad-output/implementation-artifacts/aog-1a-campo-guardia-volo.md` §1 AD-4 (perimetro `registerFlight`/`correctFlight`/`cancelFlight`) e AD-3 (un `details` uniforme per un codice).
- **Idioma «una funzione di dominio, due call-site»**: `_bmad-output/implementation-artifacts/aog-1b-avviso-prenotazioni-email.md` (`computeAogImpact`).
- **Codice**: `flights.service.ts` (doc-comment del modulo `:24-112`, `resolveFlightInput:598`, `registerFlightCore:977`, `registerFlight:1085`, `loadRegisteredFlightForReversal:1204`, `cancelFlight:1304`, `correctFlight:1411`); `handler.ts:34`/`:60`/`:439-447`/`:473-486`; `errors.ts` (`ConflictError`); `aircraft.service.ts:611-660` (`adjustHourMeter`, modello della riga di rettifica); `bookings.service.ts:567`/`:941`/`:1166` (i tre predicati semi-aperti da imitare); `schema.prisma:407-428` (`HourMeterAdjustment`), `:962-1090` (`Flight`, indici a `:1085-1088`).
- **Domanda PO aperta** (non blocca la story): esiste un minimo di durata di volo sensato per l'aviosuperficie (5 minuti?), o basta rifiutare sotto il minuto? Oggi la story implementa **sotto il minuto = 422** e non inventa altro.
---

## Dev Agent Record

### §A — Verifica della ricognizione sul HEAD corrente

Il frontmatter dichiara `baseline_commit: 738d399`; la nota di baseline avverte che **tutti** i `file:riga` di `flights.service.ts` sono misurati sul working tree **post-16.1 non committato**, con lo shift dichiarato (2 righe fino a ~`:1291`, 3 dopo) rispetto a `738d399` puro.

Stato al momento del dev: la 16.1 **è chiusa** (`1a57609` = implementazione, `7369abf` = Dev Agent Record). HEAD = `6a1b5c7`; fra `7369abf` e `6a1b5c7` ci sono **solo** commit `docs(...)` delle story 16.3–16.7 (`git log --oneline`), zero modifiche di codice. La condizione della nota («la 16.1 sarà committata prima del dispatch») è quindi soddisfatta e **le righe post-16.1 dello story file sono le righe di HEAD**: la baseline effettiva del mio lavoro è `6a1b5c7`, che per `src/` coincide con `1a57609`.

Riverifica riga per riga sul HEAD, **zero drift trovato** — nessuna correzione da fare nel testo della story:

| Citazione | Verificato su HEAD |
|---|---|
| `flights.service.ts` `resolveFlightInput:598`, `registerFlightCore:977`, `registerFlight:1085`, `loadRegisteredFlightForReversal:1204`, `cancelFlight:1304`, `correctFlight:1411` | esatte (elenco `grep -n '^export async function\|^async function'`) |
| lock velivolo `:1103-1104` (register), `:1443-1444` (correct, multi-riga `ORDER BY id`), `account.upsert:1112` | esatte |
| clamp `Math.max(0, …)` `:1360` (cancel), `:1493` (correct) | esatte |
| durata `:749-757`, `Math.max(1, …)` a `:754` | esatte |
| `:763` `FLIGHT_DATE_IN_FUTURE`, `:1341`/`:1477` `effectiveDate: todayDateOnlyUtcInZone(APP_TIMEZONE)` (righe della 16.1) | esatte, e **non toccate** |
| `handler.ts:60` (`const details = error instanceof ValidationError ? …`) | esatta |
| `schemas/flights.ts:106-107` (`min(0)` su takeoffs/landings) | esatte |
| `registry.ts:976` / `:1006` (descrizioni), `:982`/`:997`/`:1012` (409 già in `errorResponses`) | esatte |
| `flight-editor.tsx` `:56` `conflictError`, `:58` `invalidHourMeter`, `:585` `invalidHourMeter`, `:591-592` cicli, `:633-635` ramo 409 (la riga del `setFormError` è la `634`), `:618-625` fetch + `IDEMPOTENCY_KEY_HEADER`, `:630` `regenerateIdempotencyKey()`, `:727-728` fallback `knownErrors[code] ?? generic`, `:894` `noValidate`, `:998`/`:1001` `min={0}`, `:206-215` `composeFlightTimes`, `:230` `todayDateOnly()` | esatte |
| `logbook/page.tsx:349-377` e `dashboard/page.tsx:824-850` (i due builder di label) | esatte |
| `schema.prisma` `:274-276` («ONLY via a tracked `HourMeterAdjustment`»), `:407-428` `HourMeterAdjustment` (modello a `:414`), `:1007-1017` istanti nullable, `:1027-1032` «both NOT NULL DEFAULT 1», `:1085` `@@index([aircraftId])` di `Flight` | esatte |
| `bookings.service.ts:567`/`:941`/`:1166` (i tre predicati semi-aperti) | esatte |
| `aircraft.service.ts:611-660` `adjustHourMeter` (riga di rettifica a `:645-655`, update a `:654-658`) | esatte |
| `aircraft-editor.tsx:1404` (`{entry.reason}` nello storico contaore) | esatta |
| `handler.test.ts:255-267` (il test modello per `details`) | esatta |
| `flights.service.test.ts` mock prisma `:13-49`, `$transaction` stand-in `:160-166`, delegate `flight` `:29-35`, default di `beforeEach` `:311-330` | esatte |
| `flights-expiry-boundary.integration.test.ts:23-35` (mock con `flight: { create }` e basta) | esatta |
| `FlightEditor` usato in 2 punti: `logbook-console.tsx:966`, `dispatch-flight-button.tsx:51`; nessun gemello `-mobile` | esatta |

Una sola citazione **non** allineata al codice reale, già segnalata dalla story stessa: il test di schema «rejects takeoffs/landings outside [0, 500]» è a `:2371-2377`, non `:2283-2289` (l'AC 16 lo indirizza per titolo, che è univoco — nessuna ambiguità).

`grep -rn 'data-testid\^=' e2e/` eseguito come prescritto: 10 occorrenze, tutte su prefissi (`pilot-row-`, `flight-row-mobile`, `mobile-fleet-card-`, `mobile-pilot-row-`, `mobile-instructor-row-`, `mobile-tail-chip-`, `schedule-filter-aircraft-`). Questa story **non aggiunge nessun testid**, quindi la convenzione 15.1/15.5 non è in gioco.

### §B — Riepilogo per AC con le prove

**AC 1 — sovrapposizione parziale → 409, niente scritto.** `assertNoOverlappingFlight` (`flights.service.ts:927-1013`, doc-comment incluso), chiamata in `registerFlight` subito dopo il lock e prima dell'`account.upsert`. Unit **U1** (09:30→10:30 su 09:00→10:00): `code: 'FLIGHT_OVERLAP'`, `flight.create` **mai** chiamato, `accountMovement.create` **mai**, `aircraft.update` **mai**. e2e **E1** sul vero stack: contaore letto via `GET /api/v1/aircraft/{id}` prima e dopo il secondo tentativo, **invariato**; `GET /api/v1/flights?aircraftId=…` → **1** riga.

**AC 2 — bordi che si toccano → 201, un unit per bordo.** Unit **U3** (`takeoff_nuovo == landing_esistente`, 10:00→11:00) e **U4** (`landing_nuovo == takeoff_esistente`, 08:00→09:00), entrambi `resolves` con `flight.create` chiamato una volta. e2e **E4** conferma i due bordi + il volo centrale (3 righe a DB).
Nota di metodo: `flights.service.test.ts` mocka prisma per intero, quindi un `findFirst` che restituisce una riga fissa **non** proverebbe la semantica di bordo (la deciderebbe il mock). Il mio stand-in (`findFirstOverlapping`/`matchesInstant`, `flights.service.test.ts:2091-2146`) **interpreta l'operatore** che la guardia passa (`lt`/`lte`/`gt`/`gte`) invece di confrontare con un `<`/`>` proprio: è per questo che U3/U4 diventano **rossi** se la guardia passa a `lte`/`gte` (§D riga 2), e non resterebbero verdi.

**AC 3 — `details` sul filo.** `ConflictError('…', { flightId, takeoffAt, landingAt }, 'FLIGHT_OVERLAP')` con gli istanti convertiti a mano con `.toISOString()` (mai `Date` lasciate a `NextResponse.json`, stessa disciplina di `aircraft-status.ts#outOfServiceDetails`). Unit **U6** asserisce le tre chiavi con le **stringhe** ISO. La riga di `handler.ts:60` ha i suoi **due** unit in `handler.test.ts` (§F, deviazione 2): uno che pretende `details` su un `ConflictError` che li porta, uno che pretende la chiave `details` **assente** su un `ConflictError` che non li porta (le 39 pre-esistenti). e2e **E1** legge il payload dal filo e lo confronta con l'`id` del primo volo.

**AC 4 — `CANCELLED` non occupa; istanti `NULL` non conflittano.** Unit **U5** (l'unico candidato è `CANCELLED` → 201). Per il `NULL`: la proprietà non è producibile dall'API (gli istanti sono obbligatori dalla 11.1), quindi è verificata come **forma del predicato** — l'unit `AC 4/AC 6` asserisce il `where` con `toEqual` esatto:
```
{ aircraftId: 'aircraft_1', status: 'REGISTERED',
  takeoffAt: { lt: 2020-01-15T10:30:00.000Z }, landingAt: { gt: 2020-01-15T09:30:00.000Z } }
```
Nessuna clausola può catturare un `NULL` (`lt`/`gt` su una colonna nullable non matchano mai `NULL` in SQL), e il limite è **dichiarato** nel doc-comment della guardia. Lo stesso unit pinna il `select` a `{ id, takeoffAt, landingAt }` (nessun `FLIGHT_SELECT`, nessun join). Nessun e2e per il caso `NULL`, come la story prescrive.

**AC 5 — il volo nominato è deterministico.** `orderBy: { takeoffAt: 'asc' }`; unit con **due** conflitti (09:45→10:15 e 09:00→10:00) che asserisce `details.flightId === 'flight_existing'` (il `takeoffAt` minore) **e** l'`orderBy` passato a `findFirst`.

**AC 6 — una sola implementazione, due call-site, dentro la transazione prima di ogni scrittura.**
```
$ grep -rn "takeoffAt: { lt\|landingAt: { gt" src/
src/server/services/flights.service.ts:988      (la guardia)
src/server/services/flights.service.ts:989      (la guardia)
src/server/services/flights.service.test.ts:2261 (l'assert del where di AC 4)
src/server/services/flights.service.test.ts:2262 (idem)
```
**Una** occorrenza in codice di produzione (le due righe dello stesso predicato), le altre due sono l'asserzione del test. I due call-site: `registerFlight:1285` e `correctFlight:1651`. L'ordine è pinnato da un unit che confronta `mock.invocationCallOrder`: lock `$queryRaw` **<** `flight.findFirst` **<** `account.upsert` **<** `flight.create`.

**AC 7 — la stessa richiesta due volte senza chiave.** Unit `P2/P6 (probe 13a/13b)` con contaore **stateful** (il `FOR UPDATE` mockato restituisce ciò che l'`aircraft.update` precedente ha scritto) e store dei voli creati: prima chiamata 201 e contaore `6000 → 6060`, seconda `FLIGHT_OVERLAP`, `flight.create` chiamato **1** volta, `accountMovement.create` **1** volta, contaore **6060** (mai 6120). Nello stesso test, terzo passo = la sonda 14 dell'audit (sovrapposizione parziale sullo stesso store) → 409, contaore ancora 6060. e2e **E1**.

**AC 8 — il contratto TD-2 invariato, e la correzione dell'AC del piano.** e2e **E2**: stessa richiesta con lo stesso `Idempotency-Key` → **201** (non 200: `successStatus` della rotta replayato da `handler.ts`, come la story dichiara) + header `idempotency-replayed: true`, **stesso** `flight.id`, **1** riga a DB, contaore avanzato **una** volta. Diff su `handler.ts`: **solo** la riga 60 (`git diff -- src/lib/api/handler.ts` = 1 riga sostituita + 5 di commento, zero righe del gate di idempotenza).

**AC 9 — due POST paralleli.** e2e **E3**: `Promise.all` di due `page.request.post` identici, `[201, 409]` dopo l'ordinamento degli status, 1 riga a DB, contaore avanzato una volta. Il lock `FOR UPDATE` sull'`Aircraft` è ciò che serializza: il secondo si blocca, poi legge la riga committata.

**AC 10 — la correzione.** Unit **U8** (stesso velivolo, stessi istanti, note cambiate → 201, e il `where` contiene `id: { not: 'flight_orig' }`), **U9a** (spostamento su slot occupato dello **stesso** velivolo → 409, e `flight.update`/`accountMovement.create`/`flight.create` **mai** chiamati: la transazione non arriva allo storno), **U9b** (spostamento su un **altro** velivolo occupato → 409 con `aircraftId: 'aircraft_2'` nel `where`) e **U9b (mirror)** (stesso spostamento su slot **libero** del velivolo nuovo → 201). e2e **E5** verifica a DB che dopo il 409 entrambi i voli sono ancora `REGISTERED`.

**AC 11 — `force` non deroga.** Unit **U7**: `force: true` + `forceReason` su richiesta sovrapposta → 409, `flight.create` mai chiamato (quindi nessun `forcedAt` scritto, per costruzione). Il doc-comment della guardia dice **perché** (ratifica del piano) e **dove** sta la via d'uscita (stornare o correggere il volo nominato — azione già offerta su ogni riga del registro).

**AC 12 — il clamp scrive la sua riga.** `decreaseHourMeterForReversal` (`flights.service.ts:1015-1073`, doc-comment incluso). Unit **U10** (contaore 5, volo 30′): `hourMeterAdjustment.create` con `previousMinutes: 5`, `newMinutes: 0` e `reason` **verbatim**
```
Storno volo I-ABCD 2020-01-15 (id flight_orig): 25 minuti non sottraibili dal contaore.
```
più `aircraft.update` a `0`. Unit **U12** riproduce il caso via `correctFlight`. e2e **E7** sul vero stack: `adjustHourMeter` a 5, storno di un volo da 30′, `GET /api/v1/aircraft/{id}` → **0**, `GET /api/v1/aircraft/{id}/hour-meter-adjustments` → **2** righe, quella del clamp con `previousMinutes 5 / newMinutes 0` e il motivo che nomina marche, data, id e i 25 minuti.

**AC 13 — quando il clamp non morde, nulla cambia.** Unit **U11** (contaore 6000, volo 30′): `hourMeterAdjustment.create` **mai** chiamato, `aircraft.update` a **5970**. È il test di non-regressione che rende rossa la simulazione «scrivi la riga sempre» (§D riga 7).

**AC 14 — nessun 422 sul contaore.** Unit `AC 14`: storno con contaore **0** e volo da 30′ → risolve, `flight.status === 'CANCELLED'`, una riga di rettifica. Il doc-comment del modulo (`flights.service.ts:67-73` per il clamp, `:74-82` per il paragrafo nuovo «No duplicate, no overlap») e quello di `cancelFlight` sono aggiornati: il clamp resta deliberato **e ora lascia traccia**; è aggiunto anche il paragrafo «No duplicate, no overlap».

**AC 15 — censimento degli scrittori del contaore.** §C.

**AC 16 — cicli `[1, 500]`.** `schemas/flights.ts:106-112`: `min(1)` su entrambi, col doc-comment che rimanda al doc-comment Prisma. Il test esistente è **invertito e rititolato** («rejects takeoffs/landings outside **[1, 500]** — a 0 included»), non cancellato, e un secondo test nuovo pinna i bordi ancora validi (1, 500, omessi).

**AC 17 — durata minima.** `resolveFlightInput:749-763`: `landingAt - takeoffAt < 60_000` → 422 `FLIGHT_TIMES_INVALID`; `Math.max(1, …)` **rimosso** perché orfano del cambiamento (con un intervallo ≥ 60 000 ms il `Math.round` non può più dare 0). Unit: 20 s → 422 (la sonda 17 dell'audit), 60 s → 201 con `minutes: 1`. I due test pre-esistenti sul tetto (1441 → 422, 1440 → 201) e su `landingAt == takeoffAt` → 422 passano **non modificati**: `0 < 60_000` è vero, quindi lo stesso codice risponde. e2e nel blocco F14 (20 s via API → 422 `FLIGHT_TIMES_INVALID`).

**AC 18 — la UI.** Tre pezzi:
1. `min={0}` → `min={1}` sui **soli** due input cicli (`flight-editor.tsx:1041`, `:1044`); i due input contaore restano `min={0}`.
2. Controllo client-side accanto ai due `Number(...)` (`flight-editor.tsx:597-604`): un valore presente `< 1` risponde con `labels.invalidCycles` nello **stesso** banner `flight-form-error` di `invalidHourMeter`, mai «Riprova».
3. Il ramo 409: `FLIGHT_OVERLAP` è intercettato **prima** del ramo `isCorrecting && response.status === 409`, che resta **byte-identico** (2 righe di codice invariate) e continua a servire ogni altro 409 della correzione. Il messaggio nomina giorno e finestra orologio del volo in conflitto.

Parità i18n verificata su tutto il file, non solo sulle chiavi nuove:
```
solo IT: []   solo EN: []   totale chiavi IT/EN: 2326 / 2326
```
Testi (i placeholder `{date}`/`{from}`/`{to}` presenti in entrambi i locale):
```
it invalidCycles     Decolli e atterraggi devono essere almeno 1.
en invalidCycles     Takeoffs and landings must be at least 1.
it FLIGHT_OVERLAP    Questo velivolo ha già un volo registrato il {date} dalle {from} alle {to}. Annulla o correggi quel volo, oppure cambia gli orari.
en FLIGHT_OVERLAP    This aircraft already has a flight logged on {date} from {from} to {to}. Cancel or correct that flight, or change the times.
```
e2e **E6** guida il form reale nei due percorsi (registrazione e correzione) e asserisce sia la presenza della frase con data e ore, sia l'**assenza** di «già stato annullato». e2e nel blocco F14 asserisce `min="1"` sui due input e la label `invalidCycles` su uno `0` digitato.

**AC 19 — discriminanze rosse.** §D: 9 righe su 9 provate rosse sul pre-fix simulato, con ripristino sha256 verificato a ogni giro.

**AC 20 — gates e suite e2e.** §J.

**AC 21 — OpenAPI nello stesso commit.** `registry.ts:976` e `:1006` riscritte: nominano `FLIGHT_OVERLAP`, la shape di `details`, la semantica semi-aperta, il fatto che solo `REGISTERED` occupa, che il controllo è dentro la transazione sotto il lock, che `force` **non** deroga, il rapporto col replay `Idempotency-Key`, l'esclusione dell'originale in correzione e i due nuovi bordi (`[1, 500]` sui cicli, un minuto di durata minima). Nessuno status nuovo (il 409 era già in `errorResponses` per tutte e tre le POST).

### §C — Censimento degli scrittori del contaore (AC 15)

`grep -rn "data: { hourMeterMinutes\|hourMeterMinutes:" src/server`, classificato voce per voce sul **codice di produzione** (esclusi i `*.test.ts`, che nel grep sono la maggioranza delle righe):

| # | `file:riga` | Cosa | Classe |
|---|---|---|---|
| 1 | `flights.service.ts:1218` | `data: { hourMeterMinutes: params.aircraftHourMeterMinutes + params.minutes }` in `registerFlightCore` | **scrittura** — il `+=` della registrazione, invariato ([I-3]: resta un `+=`, mai un `SET` a `hourMeterEnd`) |
| 2 | `flights.service.ts:1071` | `data: { hourMeterMinutes: newMinutes }` in `decreaseHourMeterForReversal` | **scrittura — NUOVA**, assorbe i due `Math.max(0, …)` separati di `cancelFlight` e `correctFlight` |
| 3 | `aircraft.service.ts:656` | `data: { hourMeterMinutes: input.newMinutes }` in `adjustHourMeter` | **scrittura** — il `SET` della rettifica manuale, invariato |
| 4 | `aircraft.service.ts:289` | `hourMeterMinutes: input.hourMeterMinutes` in `createAircraft` | **valore iniziale alla creazione della riga**, non una mutazione del contaore di un velivolo esistente — classificato a parte, invariato |
| 5 | `aircraft.service.ts:27`, `:64`, `:85` | tipo del DTO, campo del `select`, mapping del DTO | **lettura/tipo**, non scrittura |
| 6 | `flights.service.ts:1274`, `:1499`, `:1638` | `tx.$queryRaw<Array<{ hourMeterMinutes: number }>>` (i tre `FOR UPDATE`) | **lettura sotto lock** |
| 7 | `aircraft.service.ts:637` | idem, il `FOR UPDATE` di `adjustHourMeter` | **lettura sotto lock** |

**Scritture che mutano il contaore di un velivolo esistente: 3** (voci 1-3), **una in meno di prima** della story (erano 4: `registerFlightCore`, `cancelFlight`, `correctFlight`, `adjustHourMeter`). La voce 4 è una creazione di riga, non una mutazione, e la story non la considera nel conteggio; la nomino perché il grep dell'AC 15 la cattura e un conteggio "4 `data:`" senza classificazione sembrerebbe contraddire il "tre" dell'AC.

**Nota di onestà pretesa dall'AD-6 (da riportare, non correggere).** `schema.prisma:274-276` dice che `hourMeterMinutes` cambia «**ONLY** via a tracked `HourMeterAdjustment` — never through this table's generic update path». Le scritture reali sono **tre** e due di esse (il `+=` di `registerFlightCore` e ora il clamp) sono esattamente la generic update path: **[I-3]** dell'ops-audit, che descrive tre scrittori, è la lettura corretta e più recente. La divergenza è **pre-esistente** a questa story e non è riconducibile alla sua richiesta: non ho riallineato quel doc-comment (e `prisma/schema.prisma` era comunque in mano a un altro agent in questa sessione, v. §I). Va nel backlog.

### §D — Tabella guardia → discriminanza (9/9 provate ROSSE sul pre-fix simulato)

Metodo: per ogni riga, **una** modifica chirurgica al file di produzione, poi i test che la tabella §4.3 nomina, poi ripristino da una copia pristine presa **prima** di ogni simulazione e verifica `sha256` dei **tre** file (`flights.service.ts`, `handler.ts`, `schemas/flights.ts`) a ogni giro. Esiti verbatim:

| # | Pre-fix simulato | Rosso ottenuto | Ripristino |
|---|---|---|---|
| 1 | la guardia diventa un no-op (nessuna `findFirst`) | `12 failed \| 3 passed \| 164 skipped` — U1, U2, U6, U7, AC 4/6, AC 5, AC 6 (ordine), **probe 13a/13b**, U8, U9a, U9b, U9b-mirror | sha256 OK (3/3) |
| 2 | `lt`/`gt` → `lte`/`gte` | `3 failed \| 12 passed` — **U3**, **U4**, AC 4/6 (il `where`) | sha256 OK (3/3) |
| 3 | via la clausola `status: 'REGISTERED'` | `2 failed \| 13 passed` — **U5**, AC 4/6 | sha256 OK (3/3) |
| 4 | via `id: { not: excludeFlightId }` | `2 failed \| 13 passed` — **U8**, U9b-mirror | sha256 OK (3/3) |
| 5 | `handler.ts:60` torna a `ValidationError` solo | `1 failed \| 3 passed` — **U18** (`handler.test.ts`) | sha256 OK (3/3) |
| 6 | il clamp torna al `Math.max(0, …)` senza riga | `3 failed \| 2 passed` — **U10**, **U12**, AC 14 | sha256 OK (3/3) |
| 7 | la riga viene scritta **sempre** | `1 failed \| 4 passed` — **U11** | sha256 OK (3/3) |
| 8 | ripristinati `<=` e `Math.max(1, …)` | `1 failed` — **U13** (20 s) | sha256 OK (3/3) |
| 9 | `min(1)` → `min(0)` sui cicli | `1 failed` — **U16** | sha256 OK (3/3) |

Estratto verbatim della riga 1 (la discriminanza che il §4.4 chiede esplicitamente — il test throwaway che **oggi passava** riproducendo `6000 → 6060 → 6120`, portato dentro `flights.service.test.ts` con l'aspettativa rovesciata, e rosso sul pre-fix):
```
ROW 1 sovrapposizione parziale: la guardia diventa un no-op (nessuna findFirst)
  Test Files  1 failed (1)
  Tests  12 failed | 3 passed | 164 skipped (179)
  × U1: a PARTIALLY overlapping flight (09:30->10:30 over 09:00->10:00) is a 409 FLIGHT_OVERLAP — nothing written at all
  × U2: a byte-identical interval (the duplicate) is the same 409 FLIGHT_OVERLAP
  × U6: the 409 carries details { flightId, takeoffAt, landingAt } with the instants as ISO 8601 UTC STRINGS, not Dates
  × AC 5: with two conflicting flights, the 409 names the one with the EARLIEST takeoffAt (explicit orderBy)
  × AC 4/AC 6: the where has aircraftId + status + the two instant comparisons and NOTHING that could catch a NULL instant …
  × AC 6: the guard reads AFTER the Aircraft FOR UPDATE lock and BEFORE the account upsert and any write
  × U7: force: true + forceReason on an overlapping request is STILL a 409 — no flight row, so no forcedAt either
  × P2/P6 (probe 13a/13b): the SAME request twice WITHOUT an Idempotency-Key -> 201 then 409, one flight, one charge, contaore 6000 -> 6060 (never 6120)
  × U8: a correction that KEEPS its own slot (same aircraft, same instants, changed notes) is accepted — the original is excluded by id
  × U9a: a correction that MOVES the flight onto a slot occupied by ANOTHER flight on the SAME aircraft is a 409 — the storno never happens
  × U9b: a correction that moves the flight onto ANOTHER aircraft is checked on THAT aircraft (resolved, never the original)
  × U9b (mirror): the same move onto a FREE slot on the other aircraft succeeds — the guard interrogates aircraft_2 and finds nothing
  ripristino sha256: OK (3/3 byte-identici)
```
Verifica finale dei tre file dopo tutte le simulazioni:
```
$ sha256sum -c pristine/sha256.txt
src/server/services/flights.service.ts: OK
src/lib/api/handler.ts: OK
src/lib/schemas/flights.ts: OK
```
**Le discriminanze e2e della tabella §4.3 (E1/E3/E4/E5/E6/E7) non sono state riprodotte separatamente**: ognuna di quelle righe ha almeno un unit nella colonna «rosso atteso», e ogni unit è stato provato rosso. Riprodurre anche il rosso e2e costerebbe una `next build` per riga (l'e2e gira su build di produzione) senza aggiungere informazione sulla discriminanza. Dichiarato come deviazione (§F, 5).

### §E — Le tre fixture e2e spostate (censimento della story, verificato)

| # | `file:riga` | Cosa ho cambiato | Perché così |
|---|---|---|---|
| 1 | `e2e/flight-log.spec.ts:221-228` (il volo, `:175` l'helper) | l'helper `registerFlight` accetta `takeoffTimeUtc` (default `'10:00'`, cioè il valore che ogni call-site pre-esistente usava implicitamente) e il terzo volo passa `'12:00'` | il caso ASSERISCE che il volo di **un'altra persona** sullo **stesso velivolo** non compare nel registro own-access: il «same aircraft» è il punto, quindi ho spostato **l'ora**, mai il velivolo. Nessuna asserzione indebolita: il volo esiste ancora, sullo stesso velivolo, nello stesso giorno |
| 2 | `e2e/reports.spec.ts:253-259` (il volo, `:128` l'helper) | stesso parametro sull'helper (che non prende data: è sempre *oggi*), il volo TOURISM passa `'12:00'` | i KPI asseriti sono quelli del **mese Roma corrente**, quindi il **giorno** non può muoversi. Spostata l'ora, il mese resta lo stesso |
| 3 | `e2e/flights.spec.ts:455-471` | la chiamata API passa da `2020-01-01T23:30Z → 2020-01-02T00:10Z` a `2020-01-05T23:30Z → 2020-01-06T00:10Z` | il volo registrato **dalla UI** nello stesso test compone gli istanti in ora **locale del browser**: su un host `Etc/UTC` i due intervalli erano **identici** (409 garantito), su un host `Europe/Rome` non si toccavano — la fixture era **TZ-dipendente**. Spostata la **data**, non l'ora: il caso resta «atterraggio dopo mezzanotte via API, `minutes = 40`» e diventa indipendente dal fuso |

Nessun'altra fixture ha preso il 409: il censimento della story (§3.5) è stato eseguito e la suite completa lo conferma (§J). `prisma/seed.ts` non crea voli; `seed-demo.ts` usa il vero `registerFlight` su 24 `daysAgo` distinti (0 coppie velivolo-giorno ripetute) e non è stato toccato.

### §F — Deviazioni motivate

1. **`min(1)` sui cicli senza cambiare il bordo superiore né il messaggio di `FLIGHT_TIMES_INVALID`.** Il controllo client-side nuovo verifica **solo** il bordo inferiore (`< 1`), non `> 500` né la non-interezza: quei due casi rispondono oggi come rispondevano prima della story (422 field-shaped → banner generico). La story cambia il bordo **inferiore**; estendere il controllo agli altri due sarebbe capacità non richiesta.
2. **Due unit su `handler.ts:60`, non uno.** L'AC 3 chiede l'unit «`ConflictError` con `details` → 409 con `details`». Ne ho aggiunto un secondo, simmetrico: `ConflictError` **senza** `details` → la chiave `details` **assente** dall'envelope. È la metà del contratto che protegge le **39** `ConflictError` pre-esistenti (`errorEnvelope` omette la chiave quando `details === undefined`), e senza di esso una futura "semplificazione" che passasse `details: null` non farebbe rumore.
3. **Il testo di `FLIGHT_TIMES_INVALID` non è stato riscritto.** La regola ora è «almeno un minuto», ma il messaggio («L'orario di atterraggio deve essere successivo al decollo e la durata non può superare 24 ore.») resta **vero** e la frase non è raggiungibile per il caso sub-minuto **dal form**: i due campi sono `type="time"` a granularità di minuto, e `composeFlightTimes` fa rotolare al giorno successivo un atterraggio uguale al decollo (1440 minuti, non 0). Il caso sub-minuto esiste **solo** via API, dove il consumatore legge il `code`, non la frase italiana. Riscrivere una stringa utente senza un caso utente che la raggiunga è fuori richiesta (karpathy §3).
4. **Il messaggio del 409 è reso in ora LOCALE del browser.** `details.takeoffAt`/`landingAt` sono ISO 8601 UTC sul filo; il form li rende con `localDateFromIso`/`localTimeFromIso`, gli stessi helper con cui **già** precompila una correzione. È la convenzione unica di questo form: l'operatore rilegge esattamente gli orari che questo form gli mostrerebbe per quel volo. Le sette copie client di `todayDateOnly()` in UTC sono materia della story **16.9** e non sono state toccate (`flight-editor.tsx:230` invariato).
5. **Discriminanze e2e non riprodotte separatamente** (v. §D, ultimo capoverso).
6. **Un unit in più su `correctFlight` verso un velivolo diverso.** La story chiede U9 (409 su velivolo diverso occupato); ho aggiunto lo specchio (velivolo diverso **libero** → 201, col `where` su `aircraftId: 'aircraft_2'`). Senza lo specchio, la trappola §5.7 (passare `originalFlight.aircraftId` invece di `resolved.aircraft.id`) resterebbe invisibile: interrogare il velivolo sbagliato **non** fa fallire il caso "occupato" quando anche l'originale è occupato.
7. **Un helper di test con un interprete di operatori** (`findFirstOverlapping`/`matchesInstant`, `flights.service.test.ts:2091-2146`): è ciò che rende reali U3/U4/U5/U8 in un file dove prisma è interamente mockato (v. AC 2). Ogni ramo di quell'helper è esercitato da almeno un test; non è astrazione a uso singolo.
8. **`e2e/flights.spec.ts` ha una prima esecuzione rossa nel log, dovuta a un mio selettore.** `getByLabel('Atterraggi')` matcha **anche** «Ora atterraggio» (il name-match di Playwright è substring): strict-mode violation su 2 elementi. Corretto con `exact: true` su entrambi i locator dei cicli, con il commento che cita la lezione 103-F1. È un difetto del mio test, non del codice: nessuna riga di produzione è stata toccata per farlo passare.
9. **I miei 8 test e2e usano una fixture di persona SENZA login** (`createPilotPerson`, `e2e/flights.spec.ts:917`, locale al blocco), non `createPilotWithLogin`. Motivo misurato, non estetico: il primo arbitro pieno ha prodotto **1 flaky**, ed era il mio E2 — diagnosi in §K. `createPilotWithLogin` attende l'email di invito su Mailpit e naviga il set-password: ~5 secondi fra `ensureValidSeedExpiries` e la prima POST, che è la finestra in cui un `ExpiryType` globale bloccante creato da un altro test rende il volo un 422. Nessuno dei miei test ha bisogno di un login (agiscono tutti da ADMIN, anche E6 che guida il form). Quattro chiamate API sequenziali riducono quella finestra di ~due ordini di grandezza (misurato: E1 da 5,0 s a 2,0 s), e i 16 test di un `--repeat-each=2` passano. **Non la chiude**: il vero fix è alla sorgente (TD 16.2-g).

### §G — TD da registrare (per la sessione principale)

| TD | Cosa | Perché fuori da qui |
|---|---|---|
| **16.2-a** | **Sovrapposizione per PERSONA sui voli** (F3, difetto 3: lo stesso pilota su due velivoli nello stesso istante) | il lock sull'`Aircraft` **non** la serializza: servirebbe un lock sulla persona o un vincolo equivalente, che è la decisione aperta della **16.3** (suo AC 2). Una guardia non serializzata regge sui test sequenziali e cede sotto concorrenza: peggio che dichiararla mancante |
| **16.2-b** | `prisma/seed-load.ts:770` **genera** sovrapposizioni sullo stesso velivolo (dedupla solo l'istante di decollo esatto, `:613-622`) | usa `flight.createMany`, **bypassa** il service: nessun percorso di dominio ci passa. Il DB di carico è lo strumento di misura dell'epic 17 — se quell'epic pretende dati conformi all'invariante, va deduplicato lì |
| **16.2-c** | il doc-comment di `schema.prisma:274-276` («ONLY via a tracked `HourMeterAdjustment`») **contraddice** le tre scritture reali del contaore | pre-esistente, non riconducibile a questa richiesta (§C) |
| **16.2-d** | testo morto in `registry.ts:976`: «Exactly one of `minutes` or the `hourMeterStart`/`hourMeterEnd` pair must be given», **falso dalla story 11.1** | idem: l'ho **letto** riscrivendo la descrizione e **non** corretto, perché non è riconducibile a questa richiesta. La descrizione nuova che ho scritto non lo ripete né lo contraddice |
| **16.2-e** | **le 5 coppie di voli `REGISTERED` già sovrapposte** che il DB di lavoro conteneva prima del reset | registro append-only: la guardia vale sulle scritture nuove. Conseguenza operativa da conoscere: **una correzione** di uno di quei voli può ora legittimamente rispondere 409 |
| **16.2-f** | domanda PO aperta: esiste un minimo di durata sensato per l'aviosuperficie (5 minuti?) o basta rifiutare sotto il minuto? | l'ipotesi «5 minuti» dell'audit **non è ratificata**; la story implementa «sotto il minuto = 422» e non inventa altro |
| **16.2-g** | **igiene di suite**: 4 dei 5 test del describe «Blocking expiry guard-rail» (`e2e/flights.spec.ts`) lasciano ATTIVO un `ExpiryType` globale `scope: 'ALL'`, `blocksBooking: true`; `deactivateBlockingType` esiste ed è applicato a **uno** solo. Estenderlo a tutti e 5 chiude alla sorgente una classe di flake già documentata con **quattro** vittime pre-esistenti (`my-account`, `pdf-exports`, `instructor-compensation`, `reports`) e ora una quinta (§K) | sono le fixture della story **14.4**, non di questa: toccare 4 test di un'altra story per un flake che il mio blocco ha soltanto **esposto** sarebbe scope creep. Ho ridotto la mia esposizione (§F, 9) e diagnosticato la causa |

### §H — File toccati

Produzione (7):
- `src/server/services/flights.service.ts` — 2 funzioni nuove (`assertNoOverlappingFlight`, `decreaseHourMeterForReversal`), 2 call-site ciascuna, bordo inferiore della durata, `Math.max(1, …)` rimosso, doc-comment del modulo/`registerFlight`/`cancelFlight`/`correctFlight`
- `src/lib/api/handler.ts` — **1** riga (riga 60) + il suo commento
- `src/lib/schemas/flights.ts` — `min(0)` → `min(1)` sui due campi cicli + doc-comment
- `src/lib/schemas/registry.ts` — le 2 descrizioni OpenAPI
- `src/app/[locale]/dashboard/logbook/flight-editor.tsx` — tipo delle label (2 chiavi), controllo cicli, ramo `FLIGHT_OVERLAP`, 2 `min={1}`
- `src/app/[locale]/dashboard/logbook/page.tsx` — le 2 label nuove
- `src/app/[locale]/dashboard/page.tsx` — le **stesse** 2 label (builder duplicato per progetto)

i18n (2): `messages/it.json`, `messages/en.json` — `LogbookPage.editor.invalidCycles` e `LogbookPage.editor.errors.FLIGHT_OVERLAP`.

Test (6): `src/server/services/flights.service.test.ts` (mock `flight.findFirst` + `hourMeterAdjustment.create`, 23 test nuovi, 1 invertito e rititolato), `src/lib/api/handler.test.ts` (2 test nuovi), `src/server/services/flights-expiry-boundary.integration.test.ts` (mock `flight.findFirst` + default), `e2e/flights.spec.ts` (blocco nuovo di 8 test + fixture 3), `e2e/flight-log.spec.ts` (fixture 1), `e2e/reports.spec.ts` (fixture 2).

**Nessuna** migrazione Prisma, **nessun** file nuovo, **nessuno** status HTTP nuovo, **nessun** testid nuovo, **nessuna** riga di CSS.

### §I — Cosa NON ho fatto

- **`prisma/schema.prisma`, `src/lib/date-only.ts`, `src/server/services/instructor-compensation.service.test.ts`**: non toccati. Erano in mano a un fix-agent della story 16.1 in questa stessa sessione; lo staging del mio commit elenca i path uno per uno (mai `git add -A`).
- Le righe della 16.1 in `flights.service.ts` (`:763`, `:1341`, `:1477`): invariate — `git diff` non le tocca.
- `flight-editor.tsx:230` (`todayDateOnly()` client-side in UTC): invariata, è della story 16.9.
- `conflictError` non è stato rinominato e il blocco di gestione errori del form non è stato rifattorizzato: ho **aggiunto** un ramo prima, non riscritto il blocco.
- Nessun backfill, nessuna riscrittura delle coppie sovrapposte già a DB.
- `Idempotency-Key` **non** è stato reso obbligatorio; il fingerprint, il gate e lo status di replay di `handler.ts` sono invariati.
- Nessun indice, nessun `@@unique` parziale: `EXPLAIN` sceglie già `Flight_aircraftId_idx` e un unique parziale non coprirebbe la sovrapposizione **parziale**.
- Nessuna guardia sull'asse **persona** (AD-8, TD 16.2-a).

### §J — Gate ed esiti verbatim

`npm run gates` (mai i 4 comandi separati), eseguito **dopo** che il commit `fix(16.1)` di un altro agent (`6e8d8a9`) era atterrato nell'albero, così che il risultato valga sull'albero reale:
```
> airmanager@0.1.0 gates
> bash scripts/gates.sh

PASS  lint (23s)
PASS  typecheck (3s)
PASS  test (10s) — Tests  1873 passed (1873)
PASS  build (54s)
```
**1873 = 1849 baseline + 24 nuovi.** Il baseline non è dedotto ma **misurato**: ripristinando i tre file di test alle loro versioni `HEAD` e rieseguendo gli stessi tre file, il conteggio passa da `224 passed` a `200` (24 di differenza), e `1873 - 24 = 1849` — lo stesso numero che il commit `6e8d8a9` dichiara («gates 1849 unit invariati»). I 24: 21 nel blocco nuovo di `flights.service.test.ts`, 2 sui bordi di durata, 1 di non-regressione sui bordi validi dei cicli, 2 in `handler.test.ts` — meno 2 di somma perché il test dei cicli `[0, 500]` è **invertito**, non aggiunto, e uno dei 21 è la sonda dell'audit. (Il dettaglio è nella lista dei titoli: 25 righe `+it(` di cui **una** è la riscrittura del titolo esistente.)

Verifica CLAUDE.md (validazione eager di `@/lib/env`): i tre file di test toccati girano anche **senza** env esportate —
```
$ env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/server/services/flights.service.test.ts \
      src/lib/api/handler.test.ts src/server/services/flights-expiry-boundary.integration.test.ts
Tests  224 passed (224)
```
Nessun import nuovo verso un service «grosso» è stato introdotto: `hourMeterAdjustment` è una voce del mock prisma già presente, non un modulo nuovo.

Suite e2e **solo** via `scripts/e2e.sh` (mai `playwright test` in foreground), su build di produzione e **DB fresco** (`DROP DATABASE … WITH (FORCE)` + `createdb` + `migrate deploy` + `db seed`, mai `docker compose down -v`, mai il DB `airmanager_load`), con `JOBS_SECRET` non-placeholder esportato.

1. **Run mirato del blocco nuovo** (`--no-deps -g "Story 16.2"`): `8 passed (24.7s)`, `E2E_EXIT=0`.
2. **Primo arbitro pieno su DB fresco**: `531 passed`, **1 flaky**, 0 failed, `E2E_EXIT=0` — `531 + 1 = 532 = 524 baseline (chiusura 16.1) + 8 di questa story`. Il flaky era **il mio E2**: diagnosi e rimedio in §K.
3. **Ripetizione del blocco dopo il rimedio** (`--repeat-each=2`): `16 passed (25.0s)`, `E2E_EXIT=0`, con i tempi per test dimezzati (E1 da 5,0 s a 2,0 s).
4. **ARBITRO FINALE su DB fresco, dopo il rimedio**: `530 passed`, **2 flaky**, **0 failed**, `E2E_EXIT=0` — `530 + 2 = 532`, di nuovo `524 + 8`. I due flaky: uno **pre-esistente e non attribuibile** a questa story (`aircraft-rates.spec.ts:155`, «rate history shows only the last 5 by default»), uno ancora della classe di §K, questa volta atterrato su **E4** invece che su E2 e con la **stessa firma** (la PRIMA POST del test → 422, mai un'asserzione sulla guardia):
```
  Error: expect(received).toBe(expected)
  Expected: 201
  Received: 422
    1017 |       data: flightBody(aircraft.id, pilot.personId, `${PAST_DATE}T09:00:00.000Z`, `${PAST_DATE}T10:00:00.000Z`),
  > 1019 |     expect(middle.status()).toBe(201);
```
Cioè: il rimedio **ha ridotto** la finestra come misurato, ma — come dichiarato — **non l'ha chiusa**, e la classe resta quella di §K. Le due esecuzioni piene concordano su questo: nessun test del blocco fallisce mai su un'asserzione della guardia, del contaore o del messaggio; il solo modo in cui uno di essi diventa rosso è il 422 di un `ExpiryType` globale altrui. Ho lasciato la diagnosi **nel file**, in testa al describe nuovo, così che chi la incontra la riconosca senza rifare l'analisi, e il fix alla sorgente è il **TD 16.2-g**.

### §K — Il flaky del primo arbitro: diagnosi

Il primo arbitro pieno ha prodotto **1 flaky**, ed era mio: `E2` (replay con `Idempotency-Key`), rosso al primo tentativo **e** al retry #1, verde al retry #2. Il punto di rottura non è la guardia né l'idempotenza:
```
Error: expect(received).toBe(expected)
Expected: 201
Received: 422
  944 |     const first = await page.request.post('/api/v1/flights', { data: body, headers: { 'Idempotency-Key': key } });
> 945 |     expect(first.status()).toBe(201);
```
È la **PRIMA** POST che risponde 422, prima che qualunque idempotenza o sovrapposizione entri in gioco. La causa è una classe di flake **pre-esistente e già documentata in questo stesso file** (`e2e/flights.spec.ts`, doc-comment di `deactivateBlockingType` e commento di `test.describe.configure({ mode: 'serial' })`): il describe «Blocking expiry guard-rail» crea `ExpiryType` **globali** `scope: 'ALL'`, `blocksBooking: true` e **4 dei suoi 5 test li lasciano ATTIVI**. Sotto `fullyParallel`, un tipo che diventa attivo **dopo** la scansione `ensureValidSeedExpiries` di una persona fresca blocca la sua registrazione volo con 422 `FLIGHT_BLOCKED_BY_EXPIRY` (per la review F5 della 14.4, un tipo bloccante applicabile **senza** documento registrato è un blocco). L'interleaving del log lo conferma: il mio test #162 girava fra il #161 e il #164 di quel describe.

Il doc-comment esistente elenca **quattro** vittime già osservate di questa stessa classe (`my-account`, `pdf-exports`, `instructor-compensation`, `reports`) e chiude con «serial mode makes this describe block race-free against itself, **the only source of these ALL-scope types in this file**» — vero sulla sorgente, ma il mio blocco è un **consumatore** nuovo nello stesso file.

Rimedio applicato (§F, 9), dentro il mio perimetro: i miei 8 test non usano più `createPilotWithLogin` ma una `createPilotPerson` locale, senza login — nessuno di essi ha bisogno di autenticarsi come pilota (agiscono tutti da ADMIN, E6 incluso). Questo elimina l'attesa dell'email di invito su Mailpit e la navigazione del set-password, riducendo la finestra fra la scansione e la POST da ~5 s a quattro chiamate API sequenziali. Misura: E1 passa da 5,0 s a 2,0 s, e `--repeat-each=2` dà 16/16.

**La finestra non è chiusa, ed è onesto dirlo**: il rimedio vero è disattivare quei tipi alla sorgente (estendere `deactivateBlockingType` a tutti e 5 i test del describe della 14.4), che chiuderebbe anche le quattro vittime pre-esistenti. Non l'ho fatto perché sono fixture di un'altra story e toccare 4 dei suoi test per un flake che il mio blocco ha soltanto **esposto** sarebbe scope creep — registrato come **TD 16.2-g**.
