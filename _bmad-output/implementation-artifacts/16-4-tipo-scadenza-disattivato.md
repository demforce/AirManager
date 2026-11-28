---
baseline_commit: 738d399
---

# Story 16.4: Un documento disattivato non blocca più nessuno

Status: **ready-for-dev** — 2026-09-10. **Modello dev**: **Sonnet 5 xhigh (backend puro)** — questa story non tocca una riga di UI (§6: nessun componente, nessun testid nuovo, nessuna stringa i18n nuova; il confine è quello che la tiene su Sonnet). Review: **Opus 5 xhigh adversarial**, come sempre.

> ⚠️ **DIPENDENZA DURA: questa story si sviluppa DOPO che la 16.1 è committata.** Il fold-in (§AC 9-11) riusa `todayDateOnlyUtcInZone(timeZone)`, l'helper che **nasce con la 16.1** in `src/lib/zoned-time.ts` (firma: `(timeZone: string) => Date`, ritorno a mezzanotte UTC esatta del giorno di calendario di `timeZone`). Su `738d399` quell'helper **non esiste** (verificato: `git show HEAD:src/lib/zoned-time.ts` non lo contiene). Se il dev trova `grep -rn "todayDateOnlyUtcInZone" src/lib/zoned-time.ts` a zero righe, la 16.1 non è chiusa: **fermarsi e segnalarlo alla sessione principale**, non reimplementare l'helper (sarebbe la seconda formula che la 16.1 esiste per eliminare).
>
> ⚠️ **Baseline**: `738d399` è il HEAD su cui **ho misurato e riverificato** ogni `file:riga` di questo file. L'ops-audit cita righe misurate su `b7b8d13`: le ho riverificate e la §3.1 dice quali sono slittate. **La 16.1 fa slittare due righe di questo file** (§3.5, tabella dello slittamento previsto): il dev le rilegge e **corregge questo file** dove sono slittate — prassi che ha pagato in tutto l'epic 15, in AOG-1b e nella 16.1.
>
> **Da leggere PRIMA di scrivere una riga**: `_bmad-output/planning-artifacts/audit-2026-09-10/ops-audit.md` **§F5** (la prova, il colpo di grazia dei 42 tipi, il rimedio) e **§F16** (le tre `where` dell'alert job e dei contatori, con le misure); la sezione **«Story 16.4»** e **«Architettura e vincoli»** di `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` (**contratto**, gli AC di record) e la **ratifica R-16-c**; `_bmad-output/implementation-artifacts/aog-1a-campo-guardia-volo.md` (come `scanBlockingDocuments`/`findActiveInstructor` sono stati estratti e **condivisi** dai due 422 — il fix di questa story deve atterrare nel codice condiviso, **una volta**). Skill obbligatoria: `.claude/skills/karpathy-guidelines/SKILL.md` (questa story è **chirurgia**: ~14 righe di produzione cambiate, di cui 5 sono un'aggiunta di una chiave a un `where`).

---

## Story

As **un admin che ritira un tipo di scadenza dal catalogo**,

I want che **disattivarlo lo tolga davvero dai controlli**,

so that nessuno resti **non prenotabile e non volabile** per un documento che la schermata Impostazioni non mostra più, e l'alert job non scriva **a persone archiviate** né **per tipi ritirati**.

### Il perché: le due metà della stessa regola non concordano su cosa sia un tipo vivo

Il dominio scadenze ha **due** scansioni di documenti bloccanti, che girano **una accanto all'altra** sullo stesso volo:

| Scansione | Dove | `where` | Filtra `isActive`? |
|---|---|---|---|
| **gli SCADUTI** | `bookings.service.ts:278-281` (`findBlockingExpiredDocuments`) | `{ personId }` | **NO** |
| **i MANCANTI** | `flights.service.ts:392-395` (`findMissingBlockingDocuments`) | `{ isActive: true, blocksBooking: true, scope: { in: scopes } }` | **SÌ** |

La prima è la funzione **condivisa** da `createBooking` (`:515`), `updateBooking` (`:891`), `transitionBooking→APPROVED` (`:1130`) e — dalla 14.4 — da `resolveFlightInput` attraverso `scanBlockingDocuments` (`flights.service.ts:432`, `:438`). **Una riga mancante in un `where` si propaga a cinque superfici.**

Il colpo di grazia è nell'ops-audit §F5: `GET /api/v1/expiry-types` restituisce **42** tipi (solo attivi, `expiry-types.service.ts:79`) e il nome citato dal 422 **non è fra loro**. L'admin legge un errore che nomina un documento che la sua schermata non mostra, e le uniche vie d'uscita reali sono `deleteExpiry` (che distrugge il record di conformità, F11) o un `force` admin **su ogni singolo volo**.

E la disattivazione è **pubblicizzata** come la via d'uscita sicura: `deleteExpiryType` rifiuta la cancellazione di un tipo in uso con *«This expiry type is in use — deactivate it instead.»* (`expiry-types.service.ts:193`, `:200`). Oggi quella frase è **falsa**. Questa story la rende vera. Non è un'aggiunta di funzionalità: è la promessa già scritta nel codice che viene mantenuta.

### Fatti misurati che vincolano il design

| Fatto | Misura | Conseguenza sul design |
|---|---|---|
| Il filtro è **una chiave** in un `where`, non un algoritmo | `expiryType: { isActive: true }` è un `ExpiryTypeWhereInput` valido: `Expiry.expiryType?: XOR<ExpiryTypeScalarRelationFilter, ExpiryTypeWhereInput>` (`src/generated/prisma/models/Expiry.ts:240`); `person` idem a `:239` | il fix sta in **SQL**, mai in un `.filter()` JS dopo la query (AD-1) |
| Il costo sulla **rotta calda** è nullo | DB `airmanager_load` (13 612 `Expiry`), scansione per-persona: **0,124 ms → 0,170 ms** (`EXPLAIN ANALYZE`, il tipo risolto con `Index Scan using "ExpiryType_pkey"` + `Memoize`) | nessun indice nuovo, nessuna cache (AD-5) |
| Il costo sui **contatori** è reale ma piccolo | il conteggio «scadute» passa da `Index Only Scan` su `Expiry_expiresAt_idx` (**0,42 ms**, `Heap Fetches: 0`) a due `Hash Join` (**4,86 ms**) | si dichiara con il numero; **nessun indice lo recupera** (AD-5) |
| Il leak è **misurato, non teorico** | su `airmanager_load`: **708** `Expiry` su 13 612 appartengono a persone archiviate; il tier «scadute» conta **3 387** oggi e **3 196** col filtro (**−191, 5,6 %**); i candidati dell'alert job passano da **5 415** a **5 108** (**−307**) | AC 3 e AC 5 sono verificabili con un numero |
| La metà `isActive` **non è più riproducibile in locale** | il DB di lavoro è stato **resettato** dopo l'audit: `ExpiryType` = 7 attivi / 0 disattivati, `Expiry` = 0 (misurato ora); `airmanager_load` = 7 / 0 | i **3 su 42** dell'audit (§F5, §F16) sono la misura **di record**; la riproduzione di questa story è l'**unit discriminante** di §3.4, non una query al DB |
| `ExpiryType` è una tabella **minuscola** | 7 righe in locale, ~45 all'epoca dell'audit; il planner fa `Seq Scan on "ExpiryType" (rows=7)` anche con il filtro | un indice su `ExpiryType.isActive` **non verrebbe mai usato** (AD-5) |
| Il set degli «orfani» è **chiuso** | `registerExpiry` risponde già 409 *«This expiry type is deactivated.»* (`expiries.service.ts:211-213`) | non nascono `Expiry` nuove su tipi disattivati: il perimetro non cresce (invariante [I-e]) |
| Il fold-in ha **un bersaglio preciso** | `expiries.service.ts:131`, `:236`, `:289`, `:444`, `:507` + `expiry-alerts.service.ts:110` = **6** occorrenze di `todayDateOnlyUtc()`, e **20** riferimenti negli unit (9 in `expiries.service.test.ts`, 11 in `expiry-alerts.service.test.ts`) | la 16.1 lo ha censito e rinviato **a questa story** (TD 16.1-a, §6 di `16-1-un-solo-calendario.md`) |

---

## §0 — Requisiti FISSI (contratto: piano epic 16-18, sezione «Story 16.4» + «Architettura e vincoli»)

| # | Requisito (dal piano — **AC di record**) |
|---|---|
| **P1** | Tipo `isActive = false` **scaduto** per la persona P → quando P prenota, viene approvata, o registra un volo: **nessun 422 per quel documento**. `findBlockingExpiredDocuments` e `scanBlockingDocuments` (i due call-site condivisi dalla AOG-1a) filtrano `expiryType.isActive`. |
| **P2** | L'alert job **salta persone archiviate e tipi disattivati**; **nessuna `SentAlert` nuova** per loro; **i contatori della dashboard Scadenze coincidono con l'elenco visibile**. |
| **P3** | Il 422 di `deleteExpiryType` per un tipo in uso è **vero**: «disattivalo invece» **è** la via d'uscita. |
| **P4** | Pre-fix simulato: la riproduzione dell'audit (tipo disattivato che blocca; **42 voci** nel catalogo attivo) è **ROSSA** e diventa verde. |
| **P5** | L'alert job e le scansioni del dominio scadenze (**6 call-site** censiti dalla ricognizione 16.1 che usano ancora «oggi» **UTC**) usano lo **stesso helper Europe/Rome della 16.1** (`todayDateOnlyUtcInZone`), con **un unit ai bordi 00:00–02:00 Roma** — fold-in deciso il 2026-09-10. |
| **P6** | **ops F11** (storia dei documenti) **NON è in questa story**: TD registrato. |

| # | Invariante (da «Architettura e vincoli», valida per tutto l'epic 16) |
|---|---|
| **[I-a]** | **Un solo calendario**: ogni «oggi» si calcola in **Europe/Rome** con gli helper esistenti. **La 16.1 ha fissato l'idioma; questa story lo riusa e non ne inventa un secondo.** |
| **[I-c]** | **Guardie = codice esistente + unit discriminante**: ogni comportamento corretto nasce con un test provato **ROSSO sul pre-fix simulato**, con repo **ripristinato byte-identico** dopo (sha256 dichiarato dei file toccati). |
| **[I-d]** | Una `@db.Date` si lega **sempre** come `Date` a mezzanotte UTC (lezione review 3.5 F1, doc-comment `date-only.ts:10-16`). `toDateOnlyString` **formatta** una colonna `@db.Date` già a mezzanotte UTC: **non** va «convertita» a Roma. |
| **[I-e]** | **Il set degli orfani è chiuso** (nuova, misurata qui): `registerExpiry` 409a su un tipo disattivato (`expiries.service.ts:211-213`), quindi nessuna `Expiry` nuova nasce su un tipo ritirato. Ogni AC di questa story ragiona su un insieme **che non cresce**. |
| **[I-f]** | **Nessun contratto API cambia** (nuova): zero campi DTO nuovi, zero query-param nuovi, zero codici d'errore nuovi → `src/lib/schemas/*` e `src/lib/schemas/registry.ts` **non si toccano**, l'OpenAPI generato è **byte-identico**. Se il dev si trova a modificare uno schema, ha sbagliato strada. |

### Ratifiche già chiuse che vincolano QUESTA story

| R | Decisione | Effetto vincolante qui |
|---|---|---|
| **R-16-c** (2026-09-10, AskUserQuestion, raccomandazione accettata) | «Un tipo di scadenza **disattivato smette di bloccare** (filtro `isActive` nelle scansioni dei documenti bloccanti di prenotazioni e voli, nell'alert job e nei contatori Scadenze): la disattivazione è la via d'uscita pulita che il messaggio "deactivate it instead" già promette.» | **Cambio di semantica autorizzato.** Il dev **non riapre** la domanda e **non apre AskUserQuestion** sul perimetro. Le tre superfici nominate dalla ratifica sono **esattamente** le tre di AD-2: scansioni bloccanti, alert job, contatori Scadenze. |
| **R-16-c**, seconda metà (da F16) | Persone **archiviate** fuori dall'alert job e dai contatori. L'audit la qualifica: *«sull'archiviazione la decisione è ovvia»*. | Il filtro `person: { archivedAt: null }` entra **solo** dove entra `isActive` per l'alert job e i contatori (AD-2), **non** nelle scansioni bloccanti (motivo in AD-2, nota (b)). |
| **ops F5, nota accessoria** — `findBlockingExpiredDocuments` non filtra nemmeno per `scope` | *«una scadenza di tipo PILOTS continua a bloccare una persona che ha perso il profilo pilota. Impatto minore, stessa radice.»* | **FUORI SCOPE, TD** (§6): la ratifica R-16-c nomina `isActive` e **non** `scope`; filtrare per `scope` è un **secondo** cambio di semantica che ha bisogno di una sua decisione PO. |

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — Il filtro sta nel `where` SQL, e mai in un `.filter()` JS

Il rimedio dell'audit è letterale: *«aggiungere `expiryType: { isActive: true }` al `where` di `findBlockingExpiredDocuments:278`»*. Tre ragioni per cui non si fa in JS:

1. `findBlockingExpiredDocuments` **non seleziona** `isActive` (`bookings.service.ts:280`: `select: { expiresAt: true, expiryType: { select: { name: true, blocksBooking: true } } }`). Filtrare in JS costringerebbe a **allargare il `select`**, cioè a cambiare la shape che 4 file di test costruiscono a mano come fixture — un blast radius più grande **per un risultato peggiore**.
2. `getExpiryTierCounts` sono **4 `count()`** (`expiries.service.ts:511-514`): non c'è un JS in cui filtrare senza portare 13 612 righe in memoria — esattamente ciò che il doc-comment `:491-503` vieta (*«4 plain COUNT queries rather than fetching every row into memory»*).
3. `listAllExpiries` **pagina** (`:474-478`): un filtro post-query renderebbe `total` e `items` incoerenti fra loro, e il doc-comment `:436-438` dichiara che `total` riflette **lo stesso `where`**.

**La forma del fix è quindi: una chiave in più in un `where` esistente.** Nessuna funzione nuova, nessun helper nuovo, nessun parametro nuovo.

### AD-2 — I call-site, censiti e classificati. Nessun ottavo.

| # | Funzione | `file:riga` (HEAD `738d399`) | `where` oggi | `where` dopo | `isActive` | `archivedAt` |
|---|---|---|---|---|---|---|
| **1** | `findBlockingExpiredDocuments` (la scansione CONDIVISA) | `bookings.service.ts:279` | `{ personId }` | `{ personId, expiryType: { isActive: true } }` | **SÌ** | no (b) |
| **2** | `findMissingBlockingDocuments` (voli) | `flights.service.ts:393` | `{ isActive: true, blocksBooking: true, scope: { in: scopes } }` | **INVARIATO** | già sì | n/a |
| **3** | `runExpiryAlertsJob` (candidati) | `expiry-alerts.service.ts:114` | `{ expiresAt: { lte: horizon } }` | `+ person: { archivedAt: null }, expiryType: { isActive: true }` | **SÌ** | **SÌ** |
| **4** | `listAllExpiries` (registro Scadenze) | `expiries.service.ts:446-465` | v. AD-4 | v. AD-4 | **SÌ** | **SÌ** |
| **5** | `getExpiryTierCounts` (i 4 contatori) | `expiries.service.ts:511-514` | `{ expiresAt: … }` ×4 | `+` i due filtri **in tutte e quattro** | **SÌ** | **SÌ** |
| **6** | `listBlockingExpiriesByPerson` (il chip «documento bloccante» dei Piloti) | `expiries.service.ts:556` | `{ personId: { in: … }, expiresAt: { lte: horizon }, expiryType: { blocksBooking: true } }` | `expiryType: { blocksBooking: true, isActive: true }` | **SÌ** | no (c) |
| **7** | `listPersonExpiries` (le scadenze di UNA persona) | `expiries.service.ts:134` | `{ personId }` | **INVARIATO** — v. AD-3 | **NO** | n/a |

**I consumatori che eredìtano il fix senza una riga cambiata** (verificato, e va detto nel record perché è ciò che rende il fix «una volta sola»):
- le **cinque** superfici di blocco, via #1: `createBooking` (`bookings.service.ts:515`), `updateBooking` (`:891`), `transitionBooking→APPROVED` (`:1130`), e i **due** call-site di `scanBlockingDocuments` in `resolveFlightInput` (`flights.service.ts:700` = il 422 `AIRCRAFT_OUT_OF_SERVICE` di AOG-1a, `:838` = il 422 `FLIGHT_BLOCKED_BY_EXPIRY`) che passano da `scanBlockingDocuments` `:432`/`:438`;
- il **widget Scadenze della Panoramica** (`dashboard/page.tsx:312`, `listAllExpiries(actor, { window: '60', … })`) e gli **export Excel e PDF** (`exports.service.ts:447`, `:696`), via #4. Non esistono aggregati di scadenze in `stats.service.ts` (verificato: zero query su `Expiry`).

**Note vincolanti:**

**(a)** `#2` **non si tocca**. È l'unica metà che era già giusta, e il suo `where` è il **modello** di quello che va scritto in `#1`. Toccarla sarebbe rumore.

**(b) Perché `#1` NON prende `person: { archivedAt: null }`.** La scansione riceve un `personId` che il chiamante ha **già** risolto e validato: `createBooking` rifiuta una persona archiviata prima di arrivarci, e `resolveFlightInput` idem. Aggiungere il filtro qui non chiuderebbe nessun buco e renderebbe la funzione **silenziosamente permissiva** su un input che non dovrebbe mai arrivarle (una persona archiviata smetterebbe di essere bloccata *da tutto*, invece di essere respinta prima). Karpathy §2: nessun error handling per scenari impossibili.

**(c) Perché `#6` NON prende `archivedAt`.** Riceve gli id della **pagina corrente** di `/dashboard/pilots`, costruita con `includeArchived: false` (`pilots/page.tsx:48`): nella vista normale il filtro sarebbe **morto**. L'unica vista in cui arriverebbero id archiviati è `?archivedOnly=true` (`pilots/page.tsx:46`, `:48`), dove il chip è discutibile ma **la ratifica non nomina questo lettore per l'archiviazione** e sbiancare un chip nella vista archiviati è una decisione di **UI**. Karpathy §3: non si tocca ciò che la richiesta non copre. Se il PO vorrà sbiancarlo, è una riga nello stesso `where`.

**(d) Perché `#6` prende `isActive` pur non essendo nominato dalla ratifica.** Il chip dice, alla lettera, *«questa persona è bloccata da questo documento»* (doc-comment `expiries.service.ts:524-544`, story 15.5 R-15.5-c). Dopo il fix di `#1` quella frase, per un tipo disattivato, è **falsa sullo schermo**: è la stessa bugia di F5 spostata da un 422 a un chip. Un fix che rende vero il 422 e lascia falso il chip **non ha chiuso F5**.

### AD-3 — `listPersonExpiries` **non** si filtra, e il motivo è verificabile

È la decisione meno ovvia della story, e va scritta nel record con la prova.

`LiveExpiryEditor` (`src/components/dashboard/expiry-editor.tsx`) fa **due** fetch e le incrocia: il catalogo con **`includeInactive=true`** (`:100`, `:107` → `fetchExpiryTypes(kind, true)`, `:41`) e le scadenze della persona via `GET /api/v1/people/{id}/expiries` (`:48`), cioè **`listPersonExpiries`**. Poi classifica le «current» contro `catalogIds` e ne consente la cancellazione (`DELETE /api/v1/expiries/{id}`, `:186`).

Il `includeInactive=true` non è un caso: è **esattamente** il meccanismo che tiene una `Expiry` su un tipo ritirato **visibile e cancellabile**. Se `listPersonExpiries` filtrasse `isActive`:

- il chip spariresse dall'editor → la riga diventa **invisibile**;
- resterebbe però a occupare lo slot `@@unique([personId, expiryTypeId])` (`schema.prisma:1429`) → riattivando il tipo, il `registerExpiry` di quella persona risponderebbe **409** *«already registered — update it instead»* contro una riga **che nessuno può vedere**;
- la sola via d'uscita sarebbe un `DELETE` su un id che l'UI non espone più.

Quindi: `#7` **invariato**, e questo è un requisito verificabile (AC 7), non un'omissione. Il residuo — la scheda persona mostra ancora un documento scaduto di un tipo ritirato **senza dire che è ritirato** — è **dichiarato** (§6) e va a TD: chiuderlo vuol dire un campo DTO nuovo + un badge, cioè **UI**, cioè Opus, cioè un'altra story.

### AD-4 — La trappola del merge: due chiavi condizionali che si sovrascrivono

`listAllExpiries` costruisce il `where` con **spread condizionali** (`expiries.service.ts:446-465`):

```ts
const where = {
  ...(query.expiryTypeId ? { expiryTypeId: query.expiryTypeId } : {}),          // :447
  ...(query.personId ? { personId: query.personId } : {}),                      // :448
  ...(query.personQuery ? { person: { OR: [ … ] } } : {}),                       // :449-458  <-- chiave `person`
  ...(query.scope ? { expiryType: { scope: query.scope } } : {}),               // :459      <-- chiave `expiryType`
  ...(query.window ? { expiresAt: … } : query.status ? { expiresAt: … } : {}),  // :460-464
};
```

Aggiungere `person: { archivedAt: null }` e `expiryType: { isActive: true }` **come due spread in più** è la strada sbagliata: in un object literal **l'ultima chiave omonima vince**, quindi

- se le righe nuove stanno **dopo** `:459`, il filtro `scope` e il filtro `personQuery` **sparinscono in silenzio**;
- se stanno **prima**, sparinscono `archivedAt` e `isActive`.

In **entrambi** i casi il typecheck passa, i test dello `status` passano, e un filtro utente smette di funzionare. La forma corretta è **una sola** chiave `person` e **una sola** chiave `expiryType`, con la parte condizionale **dentro**:

```ts
person: { archivedAt: null, ...(query.personQuery ? { OR: [ … ] } : {}) },
expiryType: { isActive: true, ...(query.scope ? { scope: query.scope } : {}) },
```

(`expiryTypeId` a `:447` è uno **scalare FK**, indipendente dalla relazione `expiryType`: le due chiavi convivono, come già oggi con `scope`.)

**Il filtro `personQuery` non ha oggi nessun test sulla shape del `where`** (verificato: `grep -n personQuery src/server/services/expiries.service.test.ts` → **0 righe**). La trappola è quindi **non presidiata**: AC 8 la presidia con un test nuovo. Il filtro `scope`, invece, ha il suo test a `:261-271`, che diventa una **discriminanza gratuita** del clobber.

### AD-5 — Nessun indice nuovo, e la ragione è misurata

Il DB non ha, oggi, alcun indice su `ExpiryType.isActive` né su `Person.archivedAt` (verificato: `schema.prisma:1321-1361` ha solo `name @unique` e la PK; `Expiry` ha `@@unique([personId, expiryTypeId])`, `@@index([expiryTypeId])`, `@@index([expiresAt])` a `:1429-1431`). **Non si aggiunge nulla**, per tre misure fatte su `airmanager_load` (13 612 `Expiry`, 5 007 `Person` di cui 250 archiviate, 7 `ExpiryType`):

1. **Rotta calda (le scansioni bloccanti)** — il costo è nullo: `0,124 ms → 0,170 ms`. Il lato `Expiry` è già ristretto da `personId` (colonna guida di `@@unique([personId, expiryTypeId])`), e il tipo si risolve con `Index Scan using "ExpiryType_pkey"` sotto un `Memoize`. Un indice su `isActive` non ha nulla da migliorare.
2. **`ExpiryType` è troppo piccola perché un indice serva** — il planner sceglie `Seq Scan on "ExpiryType" (rows=7)` con `Filter: "isActive"`. Con ~45 righe e una selettività ~93 %, Postgres **non userebbe** un indice su quel booleano nemmeno se esistesse.
3. **Il costo dei contatori non è recuperabile con un indice sulle ALTRE tabelle** — è la perdita dell'`Index Only Scan`:

| Query (tier «scadute») | Piano | Tempo |
|---|---|---|
| oggi | `Index Only Scan using "Expiry_expiresAt_idx"`, `Heap Fetches: 0` | **0,422 ms** |
| dopo | `Hash Join` (`Person`) ⟵ `Hash Join` (`ExpiryType`) ⟵ `Bitmap Heap Scan` (`Heap Blocks: 317`) | **4,861 ms** |

Il join **costringe** a toccare l'heap di `Expiry`, e nessun indice su `Person` o `ExpiryType` lo evita. **+4,4 ms su uno dei quattro `count()`**, cioè ~**+18 ms** sul rendering di `/dashboard/expiries` a 13 600 scadenze. **Si dichiara con il numero e non si ottimizza qui**: portare i 4 contatori a una `COUNT` sola in SQL è **story 17.4** (piano epic, «statistiche e ledger mensile in SQL»), che ha l'harness di misura della 17.1 e non ce l'ha questa. Aggiungere qui un indice speculativo è esattamente la «flessibilità non richiesta» che karpathy §2 vieta.

### AD-6 — Il fold-in: sei call-site, un helper, e cinque doc-comment che diventano falsi

I **sei** call-site di `todayDateOnlyUtc()` del dominio scadenze (censiti dalla ricognizione 16.1, TD 16.1-a) passano a `todayDateOnlyUtcInZone(APP_TIMEZONE)`:

| # | `file:riga` (HEAD) | Funzione | A cosa serve «oggi» |
|---|---|---|---|
| 1 | `expiries.service.ts:131` | `listPersonExpiries` | `computeExpiryStatus`/`daysUntilUtc` di ogni riga (`toListItem`, `:84`) |
| 2 | `expiries.service.ts:236` | `registerExpiry` | lo `status` della riga appena creata |
| 3 | `expiries.service.ts:289` | `updateExpiry` | lo `status` della riga appena aggiornata |
| 4 | `expiries.service.ts:444` | `listAllExpiries` | i range `expiresAt` di `status`/`window` **E** lo `status` per riga (`toDashboardItem`, `:361`) |
| 5 | `expiries.service.ts:507` | `getExpiryTierCounts` | i quattro bordi di banda |
| 6 | `expiry-alerts.service.ts:110` | `runExpiryAlertsJob` | l'orizzonte `today + 60` (`:111`) **E** `daysLeft` di ogni candidato (`:124`) |

**Conseguenze meccaniche, tutte da fare nello stesso commit:**

- l'import `todayDateOnlyUtc` **diventa orfano** in `expiries.service.ts:3` e in `expiry-alerts.service.ts:2` → **va rimosso** (karpathy §3: si ripuliscono gli orfani che le PROPRIE modifiche creano). Al suo posto: `import { APP_TIMEZONE } from '@/lib/time'` e `import { todayDateOnlyUtcInZone } from '@/lib/zoned-time'`. `expiries.service.ts` conserva `parseDateOnlyUtc` e `toDateOnlyString` da `@/lib/date-only`.
- `src/lib/expiry-status.ts:5-7` dice *«both server callers (which pass `todayDateOnlyUtc()`)»* e `:12` ripete `todayDateOnlyUtc` → **FALSO** dopo il fold-in.
- `src/lib/date-only.ts` — il doc-comment che **la 16.1 ha appena riscritto** elenca fra i consumatori legittimi *«scadenze/alert-job "oggi"»* → **FALSO** dopo il fold-in. Va aggiornato (i consumatori legittimi che restano: il re-export di `rates.service.ts:13`, `dashboard/page.tsx:295`, `fleet/page.tsx:65`, `pilots/page.tsx:55`, `expiry-editor.tsx:34`). **Riga da rileggere sul HEAD del momento**: la 16.1 la sposta.
- `expiry-alerts.service.ts:62` (`candidates`: *«Scadenze inspected this run (`expiresAt <= today + 60 days`)»*) → va detto **quali** scadenze, dopo i due filtri.
- `expiries.service.ts:423-440` (`listAllExpiries`: *«Lists EVERY scadenza across every person»*) e `:491-503` (`getExpiryTierCounts`: *«GLOBAL counts across every scadenza»*) → **FALSI**.

**Perché il fold-in non è cosmetico: due difetti concreti nella finestra 00:00–02:00 Roma.**

1. **Il tier «scadute» perde un giorno.** Alle 00:30 Roma del giorno D, «oggi UTC» è **D−1**. `expired` è `expiresAt < today` (`expiresAtRangeForStatus`, `:396-397`, e `computeExpiryStatus` con `daysRemaining < 0`), quindi un documento scaduto **il giorno prima (D−1)** risulta **NON scaduto** — la banda `expiring` lo tiene, il tier «scadute» non lo conta, la riga non è rossa. Con l'helper Roma è scaduto, che è la verità.
2. **L'alert job manca la soglia a 7 giorni e scrive il numero sbagliato.** `daysLeft = daysUntilUtc(expiresAt, today)`. Alle 00:30 Roma del giorno D, per un documento che scade a **D+7**: `daysLeft = 8`, quindi `dueThresholds(8) = [60, 30]` (perché `8 <= 7` è falso, `expiry-alerts.service.ts:105-107`). La soglia **7 non viene consumata** e l'email al titolare dice *«8 giorni»*. Con l'helper Roma: `daysLeft = 7`, soglia 7 consumata, email corretta. **È la finestra in cui girano i cron notturni**, quindi il difetto non è ipotetico: è il caso normale.

### AD-7 — Le asserzioni unit si riallineano **al valore corretto**, mai si indeboliscono

Il fix cambia la shape di `where` che i test asseriscono per **uguaglianza**. Ogni riga qui sotto va portata al valore **nuovo e corretto**; sostituire un `toHaveBeenCalledWith({ where: … })` con un `objectContaining` più lasso, o cancellare l'asserzione, è **regressione della copertura** e va respinto in review (disciplina AD-8 di AOG-1b, AD-4 della 16.1).

| `file:riga` | Asserzione oggi | Valore atteso dopo |
|---|---|---|
| `bookings.service.test.ts:1319` | `where: { personId: 'person_pilot' }` | `where: { personId: 'person_pilot', expiryType: { isActive: true } }` |
| `bookings.service.test.ts:1858` | `where: { personId: 'person_student' }` | `where: { personId: 'person_student', expiryType: { isActive: true } }` |
| `expiries.service.test.ts:257` | `where: { expiryTypeId: 'type_missing' }` | `+ person: { archivedAt: null }, expiryType: { isActive: true }` |
| `expiries.service.test.ts:267-269` | `where: { expiryType: { scope: 'INSTRUCTORS' } }` | `where: { person: { archivedAt: null }, expiryType: { scope: 'INSTRUCTORS', isActive: true } }` — **discriminanza del clobber di AD-4** |
| `expiries.service.test.ts:278-281` | `toMatchObject({ expiryTypeId, expiryType: { scope } })` | resta valido (è `toMatchObject`), ma va **esteso** a `expiryType: { scope: 'PILOTS', isActive: true }` |
| `expiries.service.test.ts:398-401` | `where: { personId: 'person_1', expiryTypeId: 'type_1' }` | `+` i due filtri |
| `expiries.service.test.ts:426-429` | i quattro `toHaveBeenNthCalledWith(n, { where: { expiresAt: … } })` | `+` i due filtri **in tutti e quattro** |
| `expiry-alerts.service.test.ts:92-93` | legge `call.where.expiresAt.lte` e lo confronta con `addDaysUtc(todayDateOnlyUtc(), 60)` | **`todayDateOnlyUtcInZone(APP_TIMEZONE)`**. ⚠️ Con l'orologio reale questo test resta **verde per la ragione sbagliata** (i due helper coincidono per 22-23 ore su 24): riallinearlo comunque, perché è la sua **unica** difesa nella finestra notturna. |
| `expiries.service.test.ts:293`, `:302`, `:314`, `:324`, `:335`, `:349`, `:368`, `:382`, `:424` | 9 usi di `todayDateOnlyUtc()` come valore atteso | `todayDateOnlyUtcInZone(APP_TIMEZONE)` — **stessa nota**: verdi per 22 ore al giorno, vanno riallineati e **non** contano come discriminanti (i discriminanti sono AC 10 e AC 11, con orologio fissato) |

**Fixture che NON cambiano** (verificato — e va detto nel record, perché è la prova che il blast radius è piccolo): tutte le fixture che mockano `prisma.expiry.findMany` restituiscono `{ expiresAt, expiryType: { name, blocksBooking } }` (`bookings.service.test.ts:1294-1303`, `flights-expiry-boundary.integration.test.ts:206-226`) e il `select` **non cambia** — `isActive` vive nel `where`, non nel `select`. **Nessuna fixture di test dipende dal fatto che un tipo inattivo blocchi** (verificato: zero occorrenze di `isActive` nei quattro file unit del dominio).

### AD-8 — `SentAlert`: nessuna riga nuova, nessuna riga toccata, e la riattivazione **riprende** la cadenza

Il filtro entra **solo nel `where` dei candidati** (`expiry-alerts.service.ts:114`). Conseguenze, tutte volute e tutte da dichiarare:

- **nessuna `SentAlert` nuova** per una persona archiviata o un tipo disattivato: il candidato non entra nel loop, quindi `createMany` (`:133-135`) non viene mai chiamato per lui;
- **le `SentAlert` esistenti restano intatte**: nessun `deleteMany` nuovo. Il solo `deleteMany` su `SentAlert` resta quello di `updateExpiry` (`expiries.service.ts:275`) al cambio di `expiresAt`, **invariato**;
- **riattivando il tipo** (o dis-archiviando la persona), il candidato ritorna **con le sue soglie già consumate** e riprende la cadenza da dove era, invece di ri-alertare da 60. È il comportamento corretto: il contratto di idempotenza è *«una soglia è alertata AL MASSIMO una volta, per sempre»* (`schema.prisma:1436-1439`), non *«una volta per periodo di attività del tipo»*;
- **il digest admin si allinea da sé**: `digestItems` (`:182-188`) contiene solo ciò che è stato consumato in questo run.

---

## §2 — Acceptance Criteria

> Ogni AC che dice **«misurato»** richiede **un numero** nel Dev Agent Record. Ogni AC che dice **«discriminante»** richiede la prova che il test è **ROSSO sul pre-fix simulato**, col repo **ripristinato byte-identico** dopo (sha256 dei file toccati, lezione 13.7/15.10/AOG-1b/16.1).

### Le scansioni bloccanti (P1, P4)

**AC 1 — Una riga, in una funzione, per cinque superfici (discriminante).**
`findBlockingExpiredDocuments` (`bookings.service.ts:274-291`) interroga `prisma.expiry.findMany` con `where: { personId, expiryType: { isActive: true } }`. Il `select` a `:280` è **invariato**. Il test discriminante è quello di §3.4, portato in `src/server/services/bookings.service.test.ts` accanto al `describe` `createBooking — expiry-based booking block` (`:1740`): un mock di `prisma.expiry.findMany` che **onora** il `where` ricevuto (le due sole chiavi che il codice può inviare) e una riga scaduta su un tipo `isActive: false` → `blockingDocuments` è **vuoto**. Il pre-fix è **ROSSO** con l'output di §3.4.
**Verifica nel record**: `grep -n "expiryType: { isActive: true }" src/server/services/bookings.service.ts` → **1 riga**.

**AC 2 — Le cinque superfici, nominate una per una.**
Nessuna delle cinque produce più un 422 per un documento scaduto su un tipo disattivato, **e nessuna di esse ha una riga cambiata** (il fix è nel condiviso): `createBooking` (`:515`), `updateBooking` (`:891`), `transitionBooking→APPROVED` (`:1130`), il 422 `AIRCRAFT_OUT_OF_SERVICE` di AOG-1a (`flights.service.ts:700`, via `scanBlockingDocuments:432`/`:438`), il 422 `FLIGHT_BLOCKED_BY_EXPIRY` (`flights.service.ts:838`).
**Verifica nel record**: `git diff --stat` mostra che le cinque righe di call-site **non appaiono**; e il diff di `flights.service.ts` per questa story è **vuoto** (`findMissingBlockingDocuments` era già corretta, AD-2 nota (a)) — se contiene qualcosa, va motivato.

**AC 3 — I «missing» restano come sono.**
`findMissingBlockingDocuments` (`flights.service.ts:383-407`) è **byte-identica**. Il suo `where` (`:393`) era già `{ isActive: true, … }`: è il modello, non il bersaglio.
**Verifica nel record**: sha256 di `flights.service.ts` prima e dopo, **uguale** (o, se la 16.1 lo ha toccato, `git diff HEAD -- src/server/services/flights.service.ts` vuoto per questa story).

### L'alert job (P2)

**AC 4 — Due filtri nel `where` dei candidati, e nessuna riga nuova in `SentAlert` (discriminante).**
`runExpiryAlertsJob` (`expiry-alerts.service.ts:113-116`) interroga con `where: { expiresAt: { lte: horizon }, person: { archivedAt: null }, expiryType: { isActive: true } }`. Due unit nuovi in `expiry-alerts.service.test.ts`, sul modello di quello a `:87-94` (che legge il `where` dal mock): (i) il `where` porta **entrambi** i filtri; (ii) con un `findMany` che li **onora** e un solo candidato su tipo disattivato, il run torna `{ candidates: 0, alertsCreated: 0, holderEmailsSent: 0, digestEmailsSent: 0 }` e `sentAlert.createMany` **non è mai chiamato**. Pre-fix: **ROSSO** su entrambi.

**AC 5 — Le soglie già consumate sopravvivono, e la riattivazione riprende (non ricomincia).**
Nessun `deleteMany` su `SentAlert` nuovo (AD-8): il solo resta `expiries.service.ts:275`. Un unit prova che un candidato con `sentAlerts: [{ threshold: 60 }]` che **rientra** nel `where` (tipo riattivato) consuma **30** e non **60** — cioè la cadenza riprende. **Verifica nel record**: `grep -rn "sentAlert.deleteMany" src/server` → **1 riga**, la stessa di prima.

### Il registro Scadenze e i suoi contatori (P2)

**AC 6 — Contatori ed elenco condividono i filtri, e i due numeri coincidono (misurato).**
`listAllExpiries` (`expiries.service.ts:441-465`, nella forma di AD-4) e i **quattro** `count()` di `getExpiryTierCounts` (`:511-514`) portano **tutti** `person: { archivedAt: null }` e `expiryType: { isActive: true }`. Il record riporta i numeri **prima/dopo** letti sul DB (`airmanager_load` va bene; il DB locale è vuoto di scadenze): il mio riferimento misurato è tier «scadute» **3 387 → 3 196** e candidati alert **5 415 → 5 108**.
**Verifica nel record**: l'output di una `SELECT` che confronta i due conteggi, e la nota che il **widget della Panoramica** (`dashboard/page.tsx:312`) e i **due export** (`exports.service.ts:447`, `:696`) eredìtano il filtro **senza una riga cambiata**.

**AC 7 — Il chip dei Piloti non mente più.**
`listBlockingExpiriesByPerson` (`expiries.service.ts:547-567`) porta `expiryType: { blocksBooking: true, isActive: true }` (`:556`). Un unit prova che una riga su un tipo disattivato **non** entra nella mappa. Motivazione nel record: AD-2 nota (d).

**AC 8 — `listPersonExpiries` è invariata, e il perché è provato, non affermato.**
`expiries.service.ts:134` resta `where: { personId }`. Il record dichiara la catena di AD-3 con i `file:riga` (`expiry-editor.tsx:41` `includeInactive`, `:48` `fetchPersonExpiries`, `:186` il `DELETE`) e la conseguenza che il filtro avrebbe (riga invisibile + 409 sullo slot `@@unique` alla riattivazione). **Nessun test nuovo qui**: la prova è la catena di codice, e va scritta.

**AC 9 — Il merge delle chiavi non perde nessun filtro utente (discriminante).**
Un unit **nuovo** in `expiries.service.test.ts` (il caso oggi assente, AD-4) prova che `listAllExpiries(actor, { personQuery: 'ross', scope: 'PILOTS', … })` produce **una** chiave `person` che contiene **sia** `archivedAt: null` **sia** l'`OR` su `firstName`/`lastName`, e **una** chiave `expiryType` che contiene **sia** `isActive: true` **sia** `scope: 'PILOTS'`. Il pre-fix simulato di questo AC **non** è il codice di HEAD: è la **variante clobber** (i due filtri come spread separati) — il record dichiara di averla scritta, provata ROSSA su questo test e sul test `:267-269`, e rimossa.

### Il fold-in su Europe/Rome (P5)

**AC 10 — Sei call-site, un helper, zero seconde formule.**
I sei di AD-6 chiamano `todayDateOnlyUtcInZone(APP_TIMEZONE)`. Gli import orfani sono rimossi.
**Verifica nel record, con l'output dei comandi**:
```
grep -rn "todayDateOnlyUtc()" src/server/services/expiries.service.ts src/server/services/expiry-alerts.service.ts   # atteso: 0 righe
grep -rn "todayDateOnlyUtc" src/server src/app src/components --include=*.ts --include=*.tsx | grep -v test           # atteso: rates.service.ts (import+re-export), dashboard/page.tsx:295, fleet/page.tsx:65, pilots/page.tsx:55, expiry-editor.tsx:34
grep -c "todayDateOnlyUtcInZone(APP_TIMEZONE)" src/server/services/expiries.service.ts                               # atteso: 5
```

**AC 11 — Il bordo del giorno sul tier «scadute» (discriminante, orologio fissato).**
Un unit in `expiries.service.test.ts` con `vi.useFakeTimers()` + `vi.setSystemTime()` prova che il range di `status: 'expired'` e lo `status` calcolato per riga **concordano sul giorno Roma**, su **entrambe** le stagioni:

| Orologio | Roma | «oggi» pre-fix | «oggi» dopo | Documento `expiresAt` | Atteso dopo |
|---|---|---|---|---|---|
| `2026-03-14T23:30:00.000Z` | 00:30 del 15/03, **CET** | `2026-03-14` | `2026-03-15` | `2026-03-14` | **`expired`** (pre-fix: `expiring`) |
| `2026-07-14T22:30:00.000Z` | 00:30 del 15/07, **CEST** | `2026-07-14` | `2026-07-15` | `2026-07-14` | **`expired`** (pre-fix: `expiring`) |
| `2026-07-15T10:00:00.000Z` | 12:00 del 15/07 | `2026-07-15` | `2026-07-15` | `2026-07-14` | `expired` — **caso di controllo**: fuori dalla finestra i due helper coincidono, e il test **non** discrimina |

La terza riga è obbligatoria: serve a dimostrare che le prime due **discriminano davvero** e che il fix non ha cambiato il comportamento diurno. ⚠️ **Un test scritto con l'orologio a mezzogiorno non prova niente** (lezione `membership.service.test.ts:89`, *«lontano da ogni confine»*): ogni caso discriminante di questa story fissa l'orologio in `[00:00, 02:00)` Roma.

**AC 12 — Il bordo del giorno sull'alert job: la soglia e il numero nell'email (discriminante).**
Un unit in `expiry-alerts.service.test.ts` con orologio a **`2026-07-14T22:30:00.000Z`** (= 00:30 del 15/07 Roma, CEST) e un candidato con `expiresAt = 2026-07-22` (= D+7 sul calendario Roma) prova che: `daysLeft` passato a `buildExpiryAlertEmail` è **7** (pre-fix: **8**), le soglie consumate sono `[60, 30, 7]` (pre-fix: `[60, 30]`), e `horizon` è `2026-09-13` (pre-fix: `2026-09-12`). Pre-fix: **ROSSO** su tutte e tre.

### Il messaggio, i doc-comment, la non-regressione

**AC 13 — Il 422 «disattivalo invece» non cambia di una virgola, e il record dice perché (P3).**
`deleteExpiryType` (`expiry-types.service.ts:182-206`) e le sue due `ConflictError` (`:193`, `:200`) sono **invariate**; le stringhe UI `SettingsPage…feedback.deleteInUseError` (`messages/it.json:2196` e `:2266`, `messages/en.json:2196` e `:2266`) sono **invariate**. **Motivo, da scrivere nel record**: il messaggio prometteva una via d'uscita che il codice non manteneva; questa story sistema **il codice**, non il testo. Cambiare il testo dopo aver reso vera la promessa sarebbe cambiarlo **due volte per nulla**.
**Verifica**: `git diff -- messages/ src/server/services/expiry-types.service.ts` → **vuoto**.

**AC 14 — I doc-comment che il fix rende falsi sono corretti nello stesso commit.**
I cinque di AD-6 (`expiry-status.ts:5-7` e `:12`; `date-only.ts` — riga da rileggere, la 16.1 la sposta; `expiry-alerts.service.ts:62`; `expiries.service.ts:423-440`; `expiries.service.ts:491-503`) più i due della semantica nuova: `findBlockingExpiredDocuments` (`bookings.service.ts:255-273`, che oggi dichiara *«Identical query … as `createBooking`'s original inline logic»* — non più) e `listBlockingExpiriesByPerson` (`expiries.service.ts:524-544`). Ciascuno nomina **R-16-c** come ragione.
**Ammesso e desiderabile nello stesso giro**: la frase *«i 4 numeri sommano al totale delle scadenze»* di `getExpiryTierCounts` (`:497-498`) è **già falsa oggi** (le righe oltre +60 giorni non stanno in nessuna banda — ops-audit §F16, nota accessoria). Sta **nella stessa frase** che il fix costringe a riscrivere: correggerla è chirurgia, non allargamento.
**In `schema.prisma`**: il doc-comment di `ExpiryType.blocksBooking` (`:1331-1347`) cita `findBlockingExpiredDocuments` come consumatore e va integrato con «solo per i tipi **attivi** (R-16-c)» — i doc-comment Prisma sono citati come contratto in questo progetto. **Nessuna migrazione**: solo commento (`npx prisma generate` non cambia lo schema SQL; se `prisma migrate` propone qualcosa, il dev si è sbagliato).

**AC 15 — e2e: il 422 che scompare, e il registro che si svuota.**
Due test nuovi, entrambi filtrati su fixture **run-unique** (nessun aggregato globale, nessuna fotografia+uguaglianza — CLAUDE.md «e2e, stato globale»):
1. **`e2e/flights.spec.ts`**, dentro il `describe` *«Blocking expiry guard-rail & admin override»* (`:695`, già `mode: 'serial'` a `:707`): pilota run-unique, `createExpiryTypeForFlights(page, true)` (`:185`), `registerExpiry(…, EXPIRED_BEFORE_PAST_DATE)` → `POST /api/v1/flights` dà **422 `FLIGHT_BLOCKED_BY_EXPIRY`** nominando il tipo; poi `deactivateBlockingType(page, blockingType.id)` (`:207`) e **la stessa POST** dà **201**, senza `force`, con `forcedAt === null`. È F5 end-to-end, e riusa **solo** helper già esistenti. **Bonus dichiarato**: la finestra in cui il tipo è attivo è la più corta dei cinque test del blocco, quindi questo test **non** aggrava il TD 15.5 (seconda faccia, `flights.spec.ts:602`).
2. **`e2e/expiry-dashboard.spec.ts`**: persona + tipo run-unique + una `Expiry` **scaduta**; `/it/dashboard/expiries?window=all&expiryTypeId=<id>` mostra **1** riga; `PATCH /api/v1/expiry-types/<id> { isActive: false }`; ricarica → **0** righe. Deterministico e isolato dal filtro per `expiryTypeId` run-unique.

**AC 16 — Nessuna assertion indebolita, e la lista è esplicita.**
Il record elenca **ogni** asserzione toccata con vecchio e nuovo valore (la tabella di AD-7 compilata con gli esiti), e dichiara che nessuna è stata rilassata da uguaglianza a `objectContaining`, né rimossa. Se un test è stato cancellato, il record dice **quale** e **perché**.

**AC 17 — Contratto e gate.**
`src/lib/schemas/*` e `src/lib/schemas/registry.ts` **non toccati**, OpenAPI generato **invariato** (invariante [I-f]). `npm run gates` **verde**. Il gate locale senza env passa: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/server/services/expiries.service.test.ts src/server/services/expiry-alerts.service.test.ts src/server/services/bookings.service.test.ts src/server/services/flights.service.test.ts src/server/services/flights-expiry-boundary.integration.test.ts` — è la **terza classe** di CLAUDE.md (validazione Zod eager di `@/lib/env` trascinata da un import nuovo). Il rischio qui è **basso** (`zoned-time.ts` importa solo `@/lib/date-only`, che non importa nulla — verificato dalla 16.1), ma **si verifica, non si assume**. Suite e2e completa con `scripts/e2e.sh` e l'esito letto con `scripts/e2e.sh status`, **mai** rieseguita per scoprirlo.

---

## §3 — Dev Notes: blast radius e censimento misurato su `738d399`

### 3.1 — Righe dell'ops-audit riverificate (misurate su `b7b8d13`, ricontrollate su `738d399`)

| Citazione dell'audit | Esito |
|---|---|
| F5: `bookings.service.ts:274-291` (`findBlockingExpiredDocuments`) | ✅ esatto — `:274` la firma, `:278-281` la query, `:279` il `where` |
| F5: `bookings.service.ts:277-280` (lo snippet) | ✅ lo snippet è `:278-281`; il `where` è a **`:279`** (l'audit dice `:278`, off-by-one) |
| F5: `flights.service.ts:383-407` (`findMissingBlockingDocuments`) | ✅ esatto; il `where` con `isActive` è a **`:393`** (l'audit dice `:392-395` per lo snippet: esatto) |
| F5: `expiry-types.service.ts:193`, `:200` (il messaggio) | ✅ esatto, entrambe |
| F16: `expiry-alerts.service.ts:113-116` | ✅ esatto; `where` a `:114`, `today` a `:110`, `horizon` a `:111` |
| F16: `expiries.service.ts:446-465` (`listAllExpiries`) | ✅ **il `where`** è esattamente `:446-465`; la funzione parte a `:441` |
| F16: `expiries.service.ts:504-518` (`getExpiryTierCounts`) | ✅ la funzione parte a `:504`; i quattro `count()` sono `:511-514` |
| F11: `expiries.service.ts:299-318` (`deleteExpiry`), `:262-289` (`updateExpiry`), `schema.prisma:1429` | ✅ tutte esatte |
| F5: «`GET /api/v1/expiry-types` restituisce 42 tipi» | ⚠️ **non riproducibile ora**: DB resettato dopo l'audit (7 attivi / 0 inattivi, 0 `Expiry`). La misura di record resta quella dell'audit. |

**Non censito dall'audit, aggiunto da questa ricognizione**: `listBlockingExpiriesByPerson` (`expiries.service.ts:547-567`, il chip dei Piloti della 15.5) è un **settimo** lettore che filtra `blocksBooking` e non `isActive` → AD-2 #6, AC 7.

### 3.2 — Lo slittamento previsto per effetto della 16.1 (da rileggere e correggere in questo file)

La 16.1 modifica `src/lib/zoned-time.ts`, `src/lib/date-only.ts`, `accounts.service.ts`, `cash.service.ts`, `flights.service.ts`, `instructor-compensation.service.ts`, `membership.service.ts` — e **NON** modifica `expiries.service.ts`, `expiry-alerts.service.ts`, `bookings.service.ts`, `expiry-types.service.ts` (§6 della 16.1, «Cosa NON si tocca»: quei due service del dominio scadenze sono esplicitamente esclusi). Quindi:

| File di questo story file | Slittamento previsto |
|---|---|
| `expiries.service.ts`, `expiry-alerts.service.ts`, `bookings.service.ts`, `expiry-types.service.ts`, `schema.prisma`, `messages/*.json`, i test | **nessuno** — le righe citate qui restano valide |
| `flights.service.ts:383`, `:393`, `:427`, `:432`, `:438` | **nessuno** (gli hunk della 16.1 su questo file iniziano a `:545`) |
| `flights.service.ts:700`, `:838` (i due call-site di `scanBlockingDocuments`) | **+2 righe** → attesi a **`:702`** e **`:840`** |
| `date-only.ts` — la riga del doc-comment di `todayDateOnlyUtc` | la 16.1 la sposta da `:36` a `~:47` **e la riscrive**: **rileggerla**, non fidarsi del numero |

### 3.3 — File toccati (previsione; il record dichiara quelli effettivi)

1. `src/server/services/bookings.service.ts` — **+1 chiave** nel `where` (`:279`) + il doc-comment `:255-273`.
2. `src/server/services/expiry-alerts.service.ts` — `where` (`:114`), `today` (`:110`), import (`:2`), doc-comment (`:62`).
3. `src/server/services/expiries.service.ts` — `where` di `listAllExpiries` (`:446-465`, forma di AD-4), i 4 `count()` (`:511-514`), `where` del chip (`:556`), i **5** «oggi» (`:131`, `:236`, `:289`, `:444`, `:507`), import (`:3`), 3 doc-comment (`:423-440`, `:491-503`, `:524-544`).
4. `src/lib/expiry-status.ts` — **solo** il doc-comment (`:5-7`, `:12`). Le funzioni **non si toccano**.
5. `src/lib/date-only.ts` — **solo** il doc-comment di `todayDateOnlyUtc`.
6. `prisma/schema.prisma` — **solo** il doc-comment di `ExpiryType.blocksBooking` (`:1331-1347`). **Nessuna migrazione.**
7. `src/server/services/bookings.service.test.ts` — `:1319`, `:1858` (AD-7) + il test discriminante di AC 1.
8. `src/server/services/expiries.service.test.ts` — le 7 asserzioni di AD-7, i 9 `todayDateOnlyUtc()`, i test nuovi di AC 7, AC 9, AC 11.
9. `src/server/services/expiry-alerts.service.test.ts` — `:92-93` + gli 11 `todayDateOnlyUtc()`, i test nuovi di AC 4, AC 5, AC 12.
10. `e2e/flights.spec.ts` — **1 test nuovo** nel `describe` serial (`:695`), zero helper nuovi.
11. `e2e/expiry-dashboard.spec.ts` — **1 test nuovo**, zero helper nuovi.

**Cosa NON si tocca**: nessun file in `src/app` (**zero UI** — è il confine che tiene la story su Sonnet), nessun componente in `src/components`, `src/lib/schemas/*` e `registry.ts` (invariante [I-f]), `messages/*.json` (AC 13), `src/server/services/expiry-types.service.ts` (AC 13), `src/server/services/flights.service.ts` (AC 3), `prisma/migrations/` (nessuna migrazione), `.env.example` / `.github/workflows/ci.yml` / `scripts/` (nessuna env var nuova), `playwright.config.ts` (nessuno spec nuovo, nessun project nuovo — i due test di AC 15 entrano in spec **già esistenti**, e nessuno dei due muta `AppSettings` globali).

### 3.4 — Il test discriminante di F5, provato ROSSO ora

Scritto e girato in ricognizione (file throwaway, poi rimosso; la sua casa definitiva è `bookings.service.test.ts`, AC 1). L'idea che lo rende una riproduzione **comportamentale** e non un controllo di shape: il mock di `prisma.expiry.findMany` **onora** il `where` che riceve, per le sole due chiavi che il codice di produzione può inviare.

```ts
type Row = { personId: string; expiresAt: Date; typeName: string; blocksBooking: boolean; typeIsActive: boolean };

const DB: Row[] = [
  // La riga dell'audit: scaduta 2019-06-01, bloccante, su un tipo DISATTIVATO.
  { personId: 'person_pilot', expiresAt: new Date('2019-06-01T00:00:00.000Z'), typeName: 'Tipo voli disattivato', blocksBooking: true, typeIsActive: false },
];

const expiryFindMany = vi.fn(async (args: { where: { personId: string; expiryType?: { isActive?: boolean } } }) => {
  const wantsActiveOnly = args.where.expiryType?.isActive === true;
  return DB.filter((row) => row.personId === args.where.personId)
    .filter((row) => (wantsActiveOnly ? row.typeIsActive : true))
    .map((row) => ({ expiresAt: row.expiresAt, expiryType: { name: row.typeName, blocksBooking: row.blocksBooking } }));
});
```

Mock della catena secondo CLAUDE.md (`@/server/db/prisma`, `@/server/adapters/mail`, `@/server/adapters/mail/templates`, `./app-settings.service` — quest'ultimo per schivare `@/server/crypto/secret-box`, stesso motivo documentato in `flights-expiry-boundary.integration.test.ts:16-21`). Comando: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.

**Esito su `738d399` — verbatim, ed è questo che il dev deve far diventare verde:**

```
 ❯ src/server/services/__tmp_f5_repro.test.ts (2 tests | 2 failed) 56ms
     × an expired document on an isActive=false type does NOT block a flight/booking on 2026-09-10 38ms
     × the scan asks the DB for ACTIVE types only 10ms

 FAIL … > an expired document on an isActive=false type does NOT block a flight/booking on 2026-09-10
AssertionError: expected [ { …(2) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "expiresAt": "2019-06-01",
+     "typeName": "Tipo voli disattivato",
+   },
+ ]

 FAIL … > the scan asks the DB for ACTIVE types only
AssertionError: expected "vi.fn()" to be called with arguments: [ ObjectContaining{…} ]

Received:

  1st vi.fn() call:

  [
    {
      "select": { "expiresAt": true, "expiryType": { "select": { "blocksBooking": true, "name": true } } },
      "where": { "personId": "person_pilot" },
    },
  ]

 Test Files  1 failed (1)
      Tests  2 failed (2)
```

Il secondo output è la prova diretta di F5 in forma di dato: il `where` che parte verso il DB è **`{ "personId": "person_pilot" }`** e nient'altro.

---

## §4 — Piano di test

1. `bookings.service.test.ts` — il discriminante di §3.4 (AC 1) e le 2 asserzioni riallineate (`:1319`, `:1858`).
2. `expiry-alerts.service.test.ts` — `where` con i due filtri, run a zero candidati, cadenza che riprende, bordo 00:30 CEST su `daysLeft`/soglie/`horizon` (AC 4, 5, 12); `:92-93` riallineata; gli 11 `todayDateOnlyUtc()` portati all'helper Roma.
3. `expiries.service.test.ts` — i 4 `count()` e i `where` riallineati (AD-7); il merge `personQuery`+`scope` (AC 9, **test nuovo su un caso oggi scoperto**); il chip (AC 7); il bordo del tier «scadute» a 00:30 CET **e** CEST + il controllo diurno (AC 11).
4. `flights.service.test.ts` e `flights-expiry-boundary.integration.test.ts` — **devono restare verdi senza una modifica**: il primo mocka `findBlockingExpiredDocuments` al confine di modulo, il secondo la fa girare per davvero con `prisma.expiry.findMany` mockato e fixture che **non** cambiano shape. Se cambiano, il fix ha toccato qualcosa che non doveva: **indagare, non «aggiornare»**.
5. `expiry-types.service.test.ts` — **verde senza modifiche** (AC 13).
6. e2e: `flights.spec.ts` (F5 end-to-end, AC 15.1) e `expiry-dashboard.spec.ts` (registro che si svuota, AC 15.2).
7. **Pre-fix simulato**, con `sha256sum` dichiarato prima/dopo il ripristino, su: `bookings.service.ts` (togliere la chiave), `expiry-alerts.service.ts` (togliere i due filtri **e** rimettere `todayDateOnlyUtc`), `expiries.service.ts` (idem, **più** la variante *clobber* di AD-4 per AC 9). Il repo torna **byte-identico**.
8. Gate: `npm run gates`; il comando `env -u …` di AC 17; suite e2e completa via `scripts/e2e.sh start` + `scripts/e2e.sh status`.

---

## §5 — Trappole note

- **Il merge delle chiavi `person`/`expiryType`** (AD-4): due spread condizionali omonimi si **sovrascrivono in silenzio**, il typecheck passa, e un filtro utente muore. È la trappola numero uno di questa story e ha un solo presidio, il test nuovo di AC 9.
- **`expiryTypeId` (scalare) ≠ `expiryType` (relazione)**: convivono nello stesso `where`. Non «unificarli».
- **Un test con l'orologio a mezzogiorno non discrimina niente**: i due helper coincidono per 22-23 ore su 24. Ogni caso discriminante fissa l'orologio in `[00:00, 02:00)` Roma. Le **20** asserzioni riallineate di AD-7 restano verdi anche pre-fix per quasi tutta la giornata: **non contano** come prova.
- **`vi.setSystemTime` non sposta il fuso del processo**, solo `Date.now()`. `Intl.DateTimeFormat({ timeZone: 'Europe/Rome' })` continua a funzionare (verificato nella ricognizione 16.1): un test che passa **solo** con `TZ=Europe/Rome` è scritto male.
- **`useFakeTimers` e i test vicini**: le fixture di `expiries.service.test.ts` e `expiry-alerts.service.test.ts` calcolano le date **rispetto all'orologio del momento della chiamata** (`expiry-alerts.service.test.ts:59`, dentro `candidateFixture()`: `expiresAt: addDaysUtc(todayDateOnlyUtc(), 60)`), non a valori fissi. Un orologio finto lasciato attivo sposta quindi **anche** le fixture dei test vicini e li rende rossi senza che c'entrino nulla — e il fallimento **sembra** un difetto della story. I casi nuovi vivono in un `describe` a sé che sposta l'orologio e lo **ripristina** (`vi.useRealTimers()` in `afterEach`).
- **`toDateOnlyString` è UTC per progetto** (invariante [I-d]): formatta una `@db.Date` già a mezzanotte UTC. Applicargli `dateOnlyInZone` introduce un difetto nuovo (la lezione review 3.5 F1 al contrario).
- **`deactivateBlockingType` di `e2e/flights.spec.ts:207` diventa DOPPIAMENTE efficace.** Oggi neutralizza solo la scansione dei **mancanti** (che già filtrava `isActive`); dopo il fix neutralizza anche gli **scaduti**. È un miglioramento per la classe di flake del TD 15.5, **non** una regressione. Verificato che in tutti e tre i suoi usi (`:760`, `:796`, `:826`) è l'**ultima** istruzione del test: nessuna asserzione gira dopo di essa, quindi **nessun test esistente si rompe**.
- **Nessuna fixture di test dipende dal fatto che un tipo inattivo blocchi** (verificato: `grep -rn isActive` nei 4 file unit del dominio → 0 righe utili). Se il dev ne trova una, è un caso che il censimento ha mancato: va **dichiarato**, non aggirato.
- **Il DB locale non riproduce F5**: 7 `ExpiryType` tutti attivi, 0 `Expiry` (resettato dopo l'audit). Chi cerca di riprodurre il difetto con una query resta a mani vuote e rischia di concludere che il difetto non esiste. La riproduzione di record è l'unit di §3.4.
- **`JOBS_SECRET`**: il `.env` locale ha il placeholder → la validazione env di produzione lo rifiuta e il `webServer` in `CI=1` non parte. Prima di ogni full suite: `export JOBS_SECRET=<valore-non-placeholder>`. Serve per forza qui: `expiry-alerts.spec.ts` chiama la rotta del job.
- **Ripetere run e2e mirati sullo stesso DB fa scattare il lock anti-brute-force** (TD-6, cap per identifier): dopo ~10 login lo stesso spec fallisce **sempre** alla riga di login, identico alla flake nota ma deterministico. Prima di attribuirlo alla flake: `SELECT identifier, count(*) FROM "LoginAttempt" WHERE "createdAt" > now() - interval '15 minutes' GROUP BY 1`.
- **Suite e2e: SEMPRE `scripts/e2e.sh`**, mai `playwright test` in foreground; `scripts/e2e.sh status` è l'**unico** modo di leggere l'esito. Un run in background lanciato da un subagent **muore con la sessione del subagent**. Assenza di sentinella `E2E_EXIT=` + nessun processo vivo = run **MORTO**, non riuscito.
- **`SlideOver` chiude su `Escape`**: mai usarlo per chiudere un popup di picker nei test e2e (lezione review 14.3 F1/F2). Non serve nei due test di AC 15 (entrambi via API o con `page.goto`), ma il test 15.1 guida il form dei voli: seguire l'idioma dei test fratelli, che non usano `Escape`.

---

## §6 — Fuori scope DICHIARATO

- **ops F11 — la storia dei documenti** (contratto P6). `deleteExpiry` (`expiries.service.ts:299-318`) è l'**unica** cancellazione fisica del dominio operativo e `Expiry` è **una riga per `(persona, tipo)`** (`schema.prisma:1429`), quindi «quando è scaduta la medica precedente» non è rispondibile. Il rimedio è un **cambio di modello** (soft-delete con unique parziale, o `Expiry` append-only con «corrente = max»), non un fix. Già registrato come TD in `sprint-status.yaml:511`. **Nota che vale la pena scrivere nel record**: questa story riduce la pressione su F11, perché toglie a `deleteExpiry` il ruolo di «unica via d'uscita da F5» che l'audit gli attribuiva — d'ora in poi la via d'uscita è la disattivazione, che non distrugge nulla.
- **Il filtro per `scope` nella scansione degli scaduti** (ops F5, nota accessoria): una scadenza di tipo `PILOTS` continua a bloccare chi ha perso il profilo pilota. La ratifica R-16-c nomina `isActive` e **non** `scope`: è un **secondo** cambio di semantica, con la sua decisione PO. → **TD, con proposta**: il predicato esiste già (`assertScopeCompatible`, `expiries.service.ts:156-173`, e la derivazione degli scope di `findMissingBlockingDocuments:387-390`), quindi il costo è basso; la domanda («un documento registrato quando eri pilota deve bloccarti come allievo?») è di dominio. **Da portare alla sessione principale.**
- **`listPersonExpiries` filtrata** (AD-3): resta invariata **per progetto**. Il residuo — la scheda persona mostra un documento scaduto di un tipo ritirato **senza dire che è ritirato** — chiede un campo DTO nuovo (`typeIsActive`) e un badge, cioè **UI**, cioè Opus 5 xhigh + `design-taste-frontend` + `ui-ux-pro-max`. → **TD**; casa naturale l'epic 18.
- **I 4 contatori Scadenze in una `COUNT` sola** (AD-5): il fix costa **+4,4 ms** misurati su uno dei quattro. L'ottimizzazione è **story 17.4**, che ha l'harness di misura della 17.1. Qui si dichiara il numero e si va avanti.
- **`pilots/page.tsx:55`** — l'«oggi» che alimenta il chip di AD-2 #6 arriva dalla **pagina** in UTC (`todayDateOnlyUtc()`), e resta tale. Non è fra i **6** call-site del contratto P5 (che sono i due service), ed è già registrato come **TD 16.1-b**. **Conseguenza da dichiarare, non nascondere**: dopo questa story `listBlockingExpiriesByPerson` filtra i tipi attivi ma data il suo orizzonte a 30 giorni sul calendario **UTC** — errore di 1-2 ore su una granularità di giorni, su un chip di visualizzazione. **Proposta per la sessione principale**: la casa giusta è la **16.9** («Un solo calendario anche nel browser»), che è già UI/Opus e già tocca i default di data lato client. → **domanda aperta**, v. §7.
- **Qualunque modifica di UI**: zero file in `src/app` e `src/components`. È il confine che tiene la story su **Sonnet 5 xhigh**; appena si tocca un componente, la regola utente impone **Opus 5 xhigh**.
- **Il testo del 422 «disattivalo invece»** (AC 13): non cambia. La promessa era giusta, l'implementazione no.
- **Ogni altro finding degli epic 16-18**: F1 → 16.1, F3/F13/F14 → 16.2, F2/F4/F9 → 16.3, MAJOR-1/2 → 16.5, il ledger → 16.6, F6/F8/F12 → 16.7, F7 → 16.8, il cap dell'alert job → 17.8 (piano epic, «Copertura dei findings»).

---

## §7 — Riferimenti

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` — **§«Story 16.4»** (gli AC di record), **§«Architettura e vincoli»** (le invarianti [I-a]/[I-c]), **§«Ratifiche PO»** (**R-16-c**), **§«Copertura dei findings»** (F5/F16 → 16.4; F11 → TD).
- `_bmad-output/planning-artifacts/audit-2026-09-10/ops-audit.md` — **§F5** (la prova, i 42 tipi del catalogo, il rimedio «una riga», la nota accessoria sullo `scope`, i test mancanti), **§F16** (le tre `where`, le misure 30/3 e 29/3, la nota sul doc-comment dei 4 tier), **§F11** (fuori scope, con il rimedio proposto), **§[I-4]** (l'unica delete del dominio operativo).
- `_bmad-output/implementation-artifacts/aog-1a-campo-guardia-volo.md` — come `scanBlockingDocuments`/`findMissingBlockingDocuments`/`findActiveInstructor` sono stati **estratti e condivisi** dai due 422 (review MAJOR-1, decisione PO 2026-08-07 opzione 2): il fix di questa story atterra **una volta** proprio grazie a quell'estrazione.
- `_bmad-output/implementation-artifacts/16-1-un-solo-calendario.md` — **AD-1** (firma e collocazione di `todayDateOnlyUtcInZone`), **AD-3** (i doc-comment che vanno corretti nello stesso commit), **AD-4** (asserzioni riallineate al valore corretto, mai indebolite), **§6** (i 6 call-site del dominio scadenze rinviati **qui**, con la misura), **§7** (TD 16.1-a e 16.1-b).
- `_bmad-output/implementation-artifacts/aog-1b-avviso-prenotazioni-email.md` — formato di casa e la disciplina «asserzione al valore corretto, mai indebolita».
- `CLAUDE.md` — mock della catena per la validazione eager di `@/lib/env`; `scripts/e2e.sh` obbligatorio; stato globale e2e; convenzioni dei selettori; TD-6 e il lock anti-brute-force.
- `.claude/skills/karpathy-guidelines/SKILL.md` — assunzioni esplicitate (§0/§1), semplicità (AD-1: **una chiave**, non un algoritmo), chirurgia (§3.3: 6 file di produzione, di cui 3 solo commenti), criteri verificabili (§2).

### Da registrare in `sprint-status.yaml` (azione della sessione principale, non del dev)

| TD | Contenuto |
|---|---|
| **TD 16.4-a** | Il filtro per `scope` nella scansione degli **scaduti** (ops F5, nota accessoria): un documento `PILOTS` blocca ancora chi ha perso il profilo pilota. Serve una **decisione PO**; il predicato esiste già (`assertScopeCompatible`). |
| **TD 16.4-b** | La scheda persona mostra un documento scaduto di un tipo **ritirato** senza dirlo (AD-3): campo DTO `typeIsActive` + badge → **UI/Opus**, casa naturale l'epic 18. |
| **TD 16.4-c** | I 4 contatori Scadenze costano **+4,4 ms** misurati per il join (AD-5): l'ottimizzazione a una `COUNT` sola è **17.4**, non qui. |
| **TD 16.1-b** (aggiornare) | `pilots/page.tsx:55` resta l'ultimo «oggi» UTC del dominio scadenze. **Proposta: spostarlo nella 16.9.** |

### Domande aperte per la sessione principale

1. **`pilots/page.tsx:55` va folded nella 16.4 o nella 16.9?** Il contratto P5 dice «6 call-site» e questo è il settimo, in un file di pagina. La 16.9 è già UI/Opus e già tocca i default di data lato client: **raccomando la 16.9**, e ho scritto la story su quel presupposto (§6).
2. **`scope` nelle scansioni bloccanti (TD 16.4-a) merita un giro di AskUserQuestion adesso**, dato che si tocca esattamente quel `where`? Ho tenuto la story sul contratto (solo `isActive`) perché R-16-c nomina solo quello, ma se il PO risponde «sì, filtra anche lo scope» il costo marginale è **una chiave in più nello stesso `where`**.

## Addendum della sessione principale (2026-09-10, prima del dispatch)

- **`src/app/[locale]/dashboard/pilots/page.tsx:55`** (ultimo «oggi» UTC del dominio scadenze, componente SERVER): rientra in **questa** story, non nella 16.9 — è logica server del dominio scadenze, stesso helper `todayDateOnlyUtcInZone(APP_TIMEZONE)` degli altri sei call-site; la 16.9 resta limitata alle sette copie client di `todayDateOnly()`.
- **TD 16.4-a** (filtro per `scope` nella scansione dei documenti scaduti): NON entra in questa story; da registrare in `sprint-status.yaml` alla chiusura come TD con la stima «una chiave in più nella stessa `where`», da ratificare col PO quando si vorrà.
