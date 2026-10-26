---
baseline_commit: 9272129
---

# Story 16.7: Dati e sessioni protetti — `personId` mascherato, identità rinfrescata, rate limit atomico

Status: **ready-for-dev** — 2026-09-10. **Modello dev**: **Opus 5 xhigh**. La story è **backend al 95%**, ma il cambio di DTO di F6 **non si esaurisce nei tipi**: `bookings-table.tsx:242-246` decide *quali righe mostrano i pulsanti «Modifica»/«Annulla»* confrontando `booking.personId === ownPersonId`, e con `personId` azzerato quel confronto diventa `null === null` (⇒ **vero**) per un attore `PILOT` **senza persona collegata**. È **una clausola** di codice client, non un ridisegno — ma è **logica di rendering**, e la regola utente 2026-07-29 («Opus 5 xhigh se la story scrive codice UI») non ha soglia, come già deciso per la 16.3. Review: **Opus 5 xhigh adversarial**, come sempre.

> ⚠️ **Baseline**: `9272129`. Ogni `file:riga` di questo file è **misurato su questo HEAD**. Verifica fatta: `git diff --stat b7b8d13..HEAD -- src/server/services/bookings.service.ts src/server/services/users.service.ts src/server/services/ppr.service.ts src/server/auth/jwt-active-check.ts src/lib/schemas/bookings.ts src/lib/schemas/registry.ts src/app/[locale]/dashboard/bookings/{bookings-table,page}.tsx src/app/[locale]/dashboard/page.tsx e2e/{bookings,ppr-public}.spec.ts src/server/auth/login-throttle.ts` è **VUOTO** ⇒ **tutte** le righe citate dall'ops-audit (misurate su `b7b8d13`) valgono **invariate**: `bookings.service.ts:219-222`, `:625-628`, `jwt-active-check.ts:38-52`, `ppr.service.ts:108-139` sono confermate una per una in §3. Se il dev parte da un HEAD più avanzato, **rilegge** le righe citate e **corregge questo file** dove sono slittate.
>
> ⚠️ **Altri agent nello stesso working tree**: la 16.1 è **committata** (`1a57609`), la 16.2/16.3/16.4 sono story file `ready-for-dev`. Questa story **non condivide un solo file** con nessuna di quelle: la 16.2 e la 16.3 toccano `flights.service.ts`/`bookings.service.ts` — **attenzione**, la 16.3 tocca `bookings.service.ts` (i tre predicati di sovrapposizione, `:566`/`:936`/`:1161`) e questa story tocca lo **stesso file** in `maskBookingNames` (`:219-222`) e nel tipo `BookingListItem` (`:105`). Sono **regioni disgiunte** (mascheratura vs guardie di conflitto) e nessuna delle due rinomina il file, ma **se la 16.3 è già in corso al dispatch, questa story si mette in coda su quel file** — il conflitto sarebbe banale ma inutile: coordinarsi con la sessione principale prima di iniziare. La 16.3 dichiara F6 esplicitamente fuori dal suo perimetro («La mascheratura dei `details` e ops F6: dominio della 16.7»).
>
> **Da leggere PRIMA di scrivere una riga**: `_bmad-output/planning-artifacts/audit-2026-09-10/ops-audit.md` §**F6**, §**F8**, §**F12**, §**5.4** (la matrice RBAC verificata corretta: **non regredirla**) e §**5.5**; la sezione «Story 16.7» + «Architettura e vincoli» + «Ratifiche PO» (**R-16-f**) di `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` (**contratto**, gli AC di record); `_bmad-output/implementation-artifacts/td-6-security-auth.md` (il meccanismo `tokenVersion` e `reserveLoginAttempt`: **si riusano**, non si reinventano). Skill obbligatoria: `.claude/skills/karpathy-guidelines/SKILL.md`. Skill UI: **non si applicano** — questa story non aggiunge una stringa, una classe CSS o un testid (v. §6).

---

## Story

As **un pilota che apre il calendario, e come admin che gestisce gli utenti**,

I want che le prenotazioni altrui **non rivelino l'identità del titolare**, che un cambio di collegamento utente↔persona **chiuda la sessione**, e che il modulo PPR pubblico **rispetti il suo tetto anche sotto raffica**,

so that la correlazione che il **403 sul filtro `personId`** esiste per impedire non sia aggirabile dalla **lista** (F6), nessuno conservi accesso «own» a una persona che non è più la sua (F8, **R-16-f**), e 8 richieste parallele non ne scrivano 7 contro un tetto di 5 (F12).

### Il perché: tre difese che esistono già e che oggi non chiudono

Le tre metà mancanti hanno la **stessa forma**: la difesa è stata costruita, è corretta, ed è **incompleta di una riga**.

1. **F6** — `listBookings` rifiuta con **403** un attore senza `bookings.read.names` che filtri per un `personId` non suo (`bookings.service.ts:625-628`), e il commento dichiara perché: *«masked names alone would still let such an actor enumerate "every booking of person X" via this filter, a linkability channel the masking itself does nothing to close»*. **Il payload gli consegna lo stesso dato senza il filtro**: la maschera azzera `personName`/`instructorProfileId`/`instructorName`/`notes`/`denyReason` e lascia `personId`. La review 14.5 F1 ha chiuso questo esatto canale per `instructorProfileId` — `personId` è rimasto. Misura dell'audit: un `PILOT` legge **16 `personId` distinti su una sola pagina** di `GET /bookings?perPage=50` (102 righe totali), col profilo d'uso per titolare (`…4hq0` × 3, `…22t0` × 2, …); e `GET /bookings/calendar` non ha nemmeno il filtro, quindi nemmeno la guardia — uno `STUDENT` (solo `self.read`) legge il calendario con i nomi mascherati e gli id in chiaro.
2. **F8** — `applyActiveRecheck` rilegge **deliberatamente** `roles` dal DB ogni 15 minuti, e il doc-comment lo dichiara: *«è così che un cambio di ruolo fatto da un admin si propaga a una sessione già autenticata (CWE-613)»*. `personId` — **l'altra metà** di ogni controllo "own" del dominio — non è nella `select` (`jwt-active-check.ts:40`). `updateUser` ri-punta l'utente a un'altra `Person` con **un solo `UPDATE`** e nessun invalidamento: la sessione aperta resta autorizzata sulla persona **precedente** fino a **30 giorni** (`auth.config.ts:19-26`: nessun `maxAge` override, default assoluto dal login, senza sliding). Dettaglio che rende lo stato incoerente anche a schermo: `getMe` risolve la persona **dal DB** partendo da `userId`, quindi la UI mostra la **nuova** identità mentre l'autorizzazione usa la **vecchia**.
3. **F12** — le tre difese del PPR pubblico (per-IP, bucket globale senza IP, per-destinatario) sono **tre `count()` seguiti da una `create()`**, senza lock né vincolo. Misura dell'audit: **8 POST paralleli** dallo stesso `x-forwarded-for` con tetto 5 → **7 righe scritte** e 7 email di ricevuta a indirizzi scelti dal mittente. E questo è l'**unico endpoint di scrittura completamente non autenticato dell'applicazione**. Il codebase ha già **il meccanismo giusto, scritto e misurato**: `reserveLoginAttempt` (`login-throttle.ts:94-118`, story TD-6 F2) fa `count`+`insert` dentro una transazione serializzata da `pg_advisory_xact_lock(hashtext(identifier)::bigint)`, con una sezione «SCOPE OF THE ATOMICITY GUARANTEE» che dichiara **cosa è atomico e cosa no**. Il rimedio è **riusare quell'idioma**, non inventarne uno.

### Fatti misurati che vincolano il design

| # | Fatto | Misura / prova |
|---|---|---|
| a | Il DTO mascherato ha **esattamente 16 campi** e `personId` è l'**unico** id correlabile a una persona che sopravvive | probe §2 AC 1, `toEqual` esatto |
| b | Nessun consumatore TypeScript di `BookingItemDto`/`BookingListResponseDto`/`CalendarBookingsResponseDto` esiste | `grep -rn` → **0 risultati** fuori da `src/lib/schemas/bookings.ts` |
| c | `apiRoute` **non valida** le risposte con Zod (nessun `responseSchema`, nessun `.parse` in uscita in `src/lib/api/handler.ts`) | ⇒ rendere `personId` nullable è un cambio di **contratto e di tipi**, non di runtime |
| d | Le proiezioni della timeline **non trasportano** `personId` | `CalendarDayBlock`/`CalendarWeekChip` (`src/lib/booking-schedule.ts:15-40`) e `buildAgendaEntries` (`src/lib/mobile-agenda.ts`): `grep -n personId` → **nessun risultato** |
| e | Gli **export** (xlsx/PDF) non emettono `personId` in nessuna colonna | `exports.service.ts:286-291` e `:769-772`, 6 colonne ciascuno, `row.personName ?? t('occupied')` |
| f | Gli **unici** due `prisma.user.update` del codebase sono `auth-tokens.service.ts:216` (set-password, **bumpa già**) e `users.service.ts:182` (updateUser, **non bumpa**) | `grep -rn "user.update" src/server` |
| g | L'eviction è osservabile **solo dopo** `ACTIVE_RECHECK_INTERVAL_MS` = **15 min** dal login (`jwt-active-check.ts:33-36`) | ⇒ un e2e «relink e la richiesta dopo dà 401» **non può funzionare** senza invecchiare il cookie (AD-5) |
| h | Isolamento di default del DB: **`read committed`** | `SHOW transaction_isolation` su `airmanager_load` ⇒ l'opzione `INSERT … SELECT … WHERE (SELECT count(*)…) < 5` **NON chiude la corsa** (AD-6) |
| i | Le due `count` del PPR sono **servite dall'indice** e costano **0,096 ms** (per-IP, *Index Only Scan*) e **0,292 ms** (per-email) | `EXPLAIN (ANALYZE)` su `airmanager_load`, 5 000 righe `PprRequest`, indice `PprRequest_submitterIp_createdAt_idx` |
| j | `hashtext('ppr:ip:203.0.113.5')::bigint` = **741491890** | il cast dell'idioma di `login-throttle.ts:96` funziona su una chiave con namespace |
| k | Pool Prisma di default = `nproc * 2 + 1` = **9** connessioni (`nproc` = 4, nessun `connection_limit` in `.env.example`) | ⇒ una raffica e2e di **8** transazioni interattive **entra** nel pool: 8 è la larghezza giusta per il test, 20 no |
| l | `Booking.personId` è **NOT NULL** in DB (`schema.prisma:1153`); `User.personId` è **nullable+unique** (`:457`) | ⇒ la maschera è una **proiezione di DTO**: `assertOwnAccessAndTiming` (`:773`) confronta il valore **del DB**, mai quello mascherato |

---

## §0 — Requisiti FISSI (contratto: piano epic 16-18, sezione «Story 16.7»)

I tre AC del piano, **verbatim**, sono il contratto di record:

- **Given** un PILOT che legge `GET /bookings` o il calendario **When** la riga non è sua **Then** `personId` (e ogni id correlabile) è nullo come già lo sono i nomi; l'e2e prova che da una pagina non si estrae alcun id di terzi.
- **Given** un admin che cambia o rimuove `User.personId` **When** salva **Then** `tokenVersion` avanza nella stessa transazione e la sessione dell'utente è invalidata al primo controllo attivo (TD-6); unit + e2e.
- **Given** 8 POST paralleli al modulo PPR pubblico dallo stesso IP con tetto 5 **When** arrivano insieme **Then** al massimo 5 scrivono: conteggio e inserimento sono atomici (lock consultivo per IP, o `INSERT … SELECT … WHERE count < 5`, o vincolo equivalente — scelta nel file story).

### Ratifica già chiusa che vincola QUESTA story

- **R-16-f (ops F8)**: *ricollegare o scollegare un utente da una persona **termina la sessione** via `tokenVersion` (è un cambio di identità)*. Chiusa via AskUserQuestion il 2026-09-10 e **riconfermata** lo stesso giorno (secondo giro). Non è rinegoziabile: la variante debole («rinfresca `token.personId` e lascia viva la sessione») è **esclusa** dalla ratifica.

### Le tre scelte che il piano lascia al file story, e come sono chiuse qui

| Scelta lasciata aperta | Chiusa in |
|---|---|
| «ogni id correlabile» — quali campi, su quali superfici | **AD-1** + AC 4 (censimento completo dei 14 endpoint `self.read`) |
| Il meccanismo atomico del PPR | **AD-6/AD-7** (`pg_advisory_xact_lock`, **due** chiavi, ordine di classe) |
| Come si prova l'invalidamento della sessione in e2e | **AD-5** (cookie invecchiato di 16 min, ricetta completa) |

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — `personId` si azzera **dentro `maskBookingNames`**, in **una** riga, e non serve nient'altro

La maschera è **già** l'unico punto di verità: **una** funzione (`bookings.service.ts:219-223`), **due** call-site (`listBookings:653`, `listCalendarBookings:721`), **zero** implementazioni alternative (`grep -rn maskBookingNames src/` → solo `bookings.service.ts`). Il fix è **aggiungere `personId: null` alla riga `:222`** e allargare il tipo a `:105`. Non c'è una seconda mascheratura da inseguire, non c'è un secondo DTO da tenere in sincrono, e i due endpoint che il piano nomina (`GET /bookings`, `GET /bookings/calendar`) sono **esattamente** quei due call-site.

**Le altre superfici del piano non aggiungono lavoro, e questo è misurato**:
- **agenda mobile** e **widget della Panoramica** sono alimentati da `listCalendarBookings`/`listBookings` (`dashboard/bookings/page.tsx:251,287`; `dashboard/page.tsx:301,306,311,901,1047`) ⇒ ereditano la maschera. Le loro **proiezioni non trasportano `personId`** (fatto **d**), quindi non c'è una terza forma da correggere.
- gli **export** non emettono `personId` (fatto **e**).
- la Panoramica admin (`renderAdminOverview`) è gated su `finance.manage` (`dashboard/page.tsx:138`) ⇒ mai mascherata; il landing istruttore riceve `ownInstructorProfileId: string` **non nullable** (`:883-888`) e l'istruttore ha `bookings.read.names` ⇒ nessuna riga mascherata gli arriva; il landing pilota legge **solo** `personId: person.id` (`:1047`) ⇒ righe proprie.

**Alternativa valutata e rifiutata**: l'id per-richiesta non correlabile (HMAC di `personId` con un sale di sessione), che l'audit stesso nomina come piano B *«più costosa e senza vantaggi qui»*. Serve solo se un client dovesse **raggruppare** righe di terzi (nessuno lo fa: fatto **d**) e introduce un segreto nuovo, una rotazione e un canale di correlazione **dentro** la stessa richiesta. Fuori.

### AD-2 — Il contratto: `personId` diventa `.nullable()` su `bookingItemSchema`, **non** un DTO separato per la lista

`bookingItemSchema` (`src/lib/schemas/bookings.ts:145-163`) serve **quattro** superfici: la lista (`bookingListResponseSchema:167`), il calendario (`calendarBookingsResponseSchema:230`), e le tre risposte singole `PATCH /bookings/{id}` / `POST /bookings/{id}/cancel` / `POST /bookings/{id}/transition` (`registry.ts:1527,1542,1561`), più `createBookingResponseSchema.booking:194`.

Rendere `personId` nullable **su tutte e quattro** è la scelta corretta, per la stessa ragione che ha già fatto scegliere così per `personName` nella 14.5: **un unico DTO di prenotazione**, con `null` che significa «l'identità è trattenuta». Le tre risposte singole restituiscono sempre righe **proprie o staff** (mai mascherate: `updateBooking`/`cancelBooking` passano da `assertOwnAccessAndTiming`, `transitionBooking` richiede `bookings.manage.any`) ⇒ il campo lì è **di fatto** sempre valorizzato, e il nullable è una **debolezza dichiarata del tipo**, non un cambio di comportamento. Il doc-comment dello schema deve dirlo, con la stessa frase che già usa per `personName`.

**Alternativa rifiutata**: uno `bookingListItemSchema` separato con `personId` nullable e un `bookingItemSchema` intatto. Costo: **due** schemi da tenere in sincrono su 14 campi identici, un componente OpenAPI nuovo, e il primo campo aggiunto in futuro entra in uno e non nell'altro. È esattamente il tipo di duplicazione che la 14.5 ha evitato. Fuori.

**Nello stesso commit** (regola del piano: «registry/OpenAPI nello stesso commit»): le **due** descrizioni OpenAPI che elencano i campi mascherati (`registry.ts:1452` per la lista, `:1503` per il calendario) devono nominare **anche `personId`**, e la frase «*`personId` may only be used as a filter to query the actor's OWN bookings for such an actor (403 otherwise)*» (`:1452`) va **completata**: oggi dice cosa succede al **filtro** e tace su cosa arriva nel **payload** — che è precisamente il buco. Nessun file OpenAPI committato da rigenerare: `src/app/api/v1/openapi.json/route.ts` genera dal registry a runtime.

### AD-3 — Il client: **una** clausola, e la trappola `null === null`

`bookings-table.tsx:242-246`:

```ts
function isOwnRow(booking: BookingRowDto): boolean {
  if (!canManageOwn) return false;
  if (booking.personId === ownPersonId) return true;          // <-- :244
  return booking.instructorProfileId !== null && booking.instructorProfileId === ownInstructorProfileId;
}
```

Con `personId` azzerato sulle righe mascherate, `:244` diventa **vero** quando `ownPersonId` è `null`. L'attore che ci cade esiste ed è creabile dall'admin: **ruolo `PILOT` senza persona collegata** (`User.personId` è nullable, `schema.prisma:457`; `createUser`/`updateUser` accettano `personId: null`). Ha `bookings.manage.own` (⇒ `canManageOwn` vero) e **non** ha `bookings.read.names` (⇒ vede righe mascherate). Risultato senza la guardia: **ogni** riga di terzi gli mostra «Modifica»/«Annulla».

**Non è un buco di autorizzazione** — e questo va scritto nel commento, perché è la ragione per cui la correzione è di **una riga** e non di un `isOwn` sul filo: il server resta l'autorità (AD-5 del progetto), `assertOwnAccessAndTiming` (`bookings.service.ts:773`) confronta `booking.personId` **letto dal DB** (NOT NULL, fatto **l**) con `actor.personId` e risponde **403** a ognuno di quei pulsanti. È un difetto **cosmetico** (pulsanti che promettono un'azione che fallisce), e si chiude così:

```ts
if (ownPersonId !== null && booking.personId === ownPersonId) return true;
```

**Alternativa rifiutata**: aggiungere un booleano `isOwn` al DTO sul filo. `maskBookingNames` lo calcola già internamente (`:220`), quindi «costa poco» — ma `isOwnRow` **non** è `isOwn`: fattorizza anche `canManageOwn` e `ownInstructorProfileId`, e la 14.5 ha **deliberatamente** scelto «nessun booleano separato da tenere in sincrono» (doc-comment `:203-205`: *«`personName: null` is the client's ONLY masking signal … no separate boolean to keep in sync»*). Un campo nuovo sul filo per un caso di bordo che una clausola chiude è la definizione di speculativo.

**Il resto del client è pass-through di tipo**: `BookingRowDto.personId` (`bookings-table.tsx:41`) → `string | null`, e i due mapper che lo popolano (`dashboard/bookings/page.tsx:392`, `dashboard/page.tsx:399`) **non cambiano una riga** — cambiano di tipo. Sono **3 file** e **4 righe** in tutto.

### AD-4 — F8: il bump è **condizionato al cambio**, nella **stessa** `user.update`, e `jwt-active-check.ts` **non si tocca**

Forma del fix in `users.service.ts#updateUser` (`:182-190`):

```ts
const personIdChanges = patch.personId !== undefined && patch.personId !== existing.personId;
…
data: {
  …(patch.roles !== undefined && { roles: patch.roles }),
  …(patch.locale !== undefined && { locale: patch.locale }),
  …(patch.personId !== undefined && { personId: patch.personId }),
  …(patch.isActive !== undefined && { isActive: patch.isActive }),
  …(personIdChanges && { tokenVersion: { increment: 1 } }),
},
```

Tre proprietà, tutte volute:

1. **Stessa `update`, quindi stessa atomicità** — è il modello letterale di `setPasswordWithToken` (`auth-tokens.service.ts:216-219`: `data: { passwordHash, tokenVersion: { increment: 1 } }`), e la review TD-6 ha già dovuto asserire *«updateUser chiamata esattamente UNA volta con entrambi i campi in un solo `data`»* per provare che non sono due scritture. Qui non serve nemmeno un `$transaction`: è **una** query.
2. **Condizionato al cambio, non alla presenza** — `existing` è già in mano (`prisma.user.findUnique({ where: { id } })` a `:154`, senza `select` ⇒ la riga intera, `personId` compreso). Un `PATCH` che **rimanda lo stesso `personId`** (il client manda il form intero: `user-management` invia i campi che vede) **non è un cambio di identità** e non deve buttare fuori l'utente. È la differenza fra una guardia e un fastidio.
3. **`isActive`/`roles` non bumpano** — la disattivazione è **già** coperta dal recheck (`!user.isActive` → `null`, `jwt-active-check.ts:43-45`) e il cambio di ruolo è **già** coperto dalla riscrittura di `token.roles` (`:51`), che è il comportamento **ratificato** dalla story 1.4 («max 15 min di grazia») e che nessuno ha chiesto di trasformare in un logout.

**`jwt-active-check.ts` NON si modifica, ed è una deviazione deliberata dal rimedio proposto dall'audit** (che suggerisce *«aggiungere `personId: true` alla `select` … e `token.personId = user.personId`»* **oltre** al bump). Motivo, verificabile leggendo l'ordine di `applyActiveRecheck`: il confronto `token.tokenVersion !== user.tokenVersion` **ritorna `null` prima** di qualunque assegnazione (`:47-49` precede `:51`). Con il bump in `updateUser`, una sessione la cui `personId` è cambiata **non arriva mai** alla riga che assegnerebbe il nuovo valore: la `select` allargata sarebbe **codice morto** per l'unico scenario che la motiva, e l'unico altro writer di `User.personId` è `createUserCore` (fatto **f**), che crea un utente **senza sessione**. Aggiungerla significherebbe scrivere due righe che nessun test può distinguere da zero righe. Il record deve dichiarare questa deviazione **con questo argomento**.

### AD-5 — F8: l'eviction si prova invecchiando il cookie di **16 minuti**, non aspettando 15

Il fatto **g** rende l'AC del piano («la richiesta dopo → 401») **non eseguibile** come scritta: `token.lastActiveCheck` è timbrato a `Date.now()` al sign-in (`auth.config.ts:42`) e il recheck parte solo dopo `ACTIVE_RECHECK_INTERVAL_MS`. Un e2e che fa login, relink e poi una richiesta osserva **200**, correttamente, per i 15 minuti successivi.

La review TD-6 ha già risolto questo problema **a mano**, e il suo Review Record lo documenta: *«cookie DECIFRATO … con `lastActiveCheck` invecchiato di 16 min → **401 UNAUTHENTICATED**, e controllo decisivo: stesso invecchiamento ma `tokenVersion` corrente → 200 (⇒ l'eviction è causata dal mismatch di versione, non dall'invecchiamento)»*. Questa story **automatizza quella prova**, che è l'unico modo di far nascere la guardia con la sua asserzione:

```
1. login come l'utente U (collegato alla persona A) via UI/API
2. leggi il cookie `authjs.session-token` dal context Playwright
3. decode({ token: raw, secret: process.env.AUTH_SECRET, salt: 'authjs.session-token' })   // @auth/core/jwt
4. relink: PATCH /api/v1/users/{U} { personId: <B> } come admin  → 200
5. re-encode lo STESSO payload con lastActiveCheck = Date.now() - 16*60*1000, e rimetti il cookie
6. GET /api/v1/me  → 401
7. CONTROLLO DECISIVO: ripeti 5-6 su un utente NON relinkato (stesso invecchiamento)  → 200
```

Vincoli misurati: `@auth/core@0.41.2` esporta `encode`/`decode` da `@auth/core/jwt` (`node_modules/@auth/core/jwt.d.ts`, `salt` è **obbligatorio** nei parametri) e il `salt` **è il nome del cookie** — `authjs.session-token` su http, `__Secure-authjs.session-token` su https, come dichiara il doc-comment di `src/proxy.ts:85-86`. La suite gira su **http://localhost:3000** ⇒ nome senza prefisso. `AUTH_SECRET` è nell'ambiente del runner (lo stesso `.env` che il server legge).

**Il passo 7 non è un extra**: senza di lui il test passa anche se l'eviction fosse causata dall'invecchiamento, cioè proverebbe la story 1.4 invece di questa.

**Fallback dichiarato, con la sua condizione**: se il round-trip JWE non regge (una versione di `@auth/core` che cambia lo schema di derivazione del salt è l'unico rischio reale), il dev **non insiste oltre ~30 minuti**: scrive l'e2e nella sua parte osservabile (relink → 200; il **nuovo login** dell'utente relinkato funziona e `GET /api/v1/me` mostra la persona **B**), tiene gli unit di AC 6/7, e **dichiara nel record** che la prova dell'eviction resta sul percorso unit + probe manuale, con la ricetta sopra. Quello che **non** è accettabile è consegnare F8 senza nessuna asserzione sul bump.

### AD-6 — F12: `pg_advisory_xact_lock`, **non** `INSERT … SELECT`, **non** una tabella contatori

Le tre opzioni che il piano lascia aperte, decise con le misure:

| Opzione | Verdetto |
|---|---|
| `INSERT … SELECT … WHERE (SELECT count(*) …) < 5` in `$executeRaw` | **RIFIUTATA — non chiude la corsa.** Il DB gira in `read committed` (fatto **h**): la sub-select vede lo **snapshot dello statement** e le righe concorrenti **non ancora committate sono invisibili**. Otto INSERT paralleli leggono tutti `count = 4` e scrivono tutti. Funzionerebbe solo alzando l'isolamento a `serializable` (che sposta il problema su un retry-loop da scrivere) o prendendo comunque un lock. |
| Tabella contatori `INSERT … ON CONFLICT DO UPDATE … RETURNING` sulla chiave `(ip, ora)` — il pattern che `PprCounter` (`ppr.service.ts:441-445`) usa **correttamente** | **RIFIUTATA — atomica ma cambia la semantica del tetto.** Richiede una migrazione, una tabella nuova, una politica di GC delle righe vecchie e, soprattutto, trasforma la **finestra scorrevole di 60 minuti** (`createdAt > now() - 1h`) in una **finestra a scatti** su bucket orari: un mittente otterrebbe 5+5 richieste a cavallo di un bordo. È un cambio di comportamento che nessuno ha chiesto e che andrebbe ratificato. |
| **`pg_advisory_xact_lock(hashtext(<chiave>)::bigint)` dentro `prisma.$transaction`, prima dei `count` e della `create`** | **SCELTA.** Zero migrazioni, zero tabelle, zero cambi di semantica: la finestra scorrevole, i tre tetti e i loro `where` restano **letteralmente gli stessi**. È l'idioma **già nel repo** (`login-throttle.ts:94-118`, TD-6 F2), applicato allo **stesso problema** (un rate limit check-then-write) e con una garanzia **già misurata** in quella story («40 richieste HTTP concorrenti → esattamente `LOGIN_MAX_FAILED_PER_IDENTIFIER` ammesse»). Costo: la sezione critica sono **due `count` da 0,096 e 0,292 ms** (fatto **i**, entrambe servite dall'indice) più un INSERT ⇒ **sotto il millisecondo**; 8 richieste serializzate finiscono in pochi ms, e il lock non attraversa mai l'invio dell'email. |

### AD-7 — F12: **due** chiavi con namespace, prese in un **ordine di classe**, e la prova che non c'è deadlock

Il PPR ha **tre** tetti su **due** dimensioni indipendenti (il bucket — per-IP *oppure* globale-senza-IP, mai entrambi — e il destinatario). Un solo lock non può serializzarle tutte, quindi:

```ts
const bucketKey = meta.ip ? `ppr:ip:${meta.ip}` : 'ppr:no-ip';
const emailKey  = input.email ? `ppr:email:${input.email.toLowerCase()}` : null;
// dentro la transazione, in QUEST'ORDINE:
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bucketKey})::bigint)`;
if (emailKey) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${emailKey})::bigint)`;
```

**Perché non c'è deadlock, e la prova è sull'ordine, non sulla fortuna**: **ogni** transazione prende **prima** la chiave-bucket e **poi** la chiave-email. Un ciclo di attesa richiederebbe una transazione che tiene una chiave-email e attende una chiave-bucket, cosa che questo codice non fa mai. È lo stesso argomento con cui il codebase difende i lock multi-riga (`ORDER BY id FOR UPDATE` in `createBooking`/`correctFlight`: *«rende due correzioni incrociate provabilmente prive di deadlock»*), applicato a un ordine di **classe** invece che di valore.

**Le collisioni di `hashtext` sono innocue** e va detto nel commento: se due chiavi diverse collidono sullo stesso `bigint`, diventano **lo stesso** lock — `pg_advisory_xact_lock` è **rientrante** nella stessa transazione (prenderlo due volte non blocca), e un'altra transazione si limita a serializzare di più. Nessun caso produce un ciclo.

**Il namespace (`ppr:ip:` / `ppr:email:` / `ppr:no-ip`) non è decorativo**: `login-throttle.ts:96` usa `hashtext(${identifier})` con l'**email nuda** come chiave. Senza prefisso, un tentativo di login su `mario@example.com` e una richiesta PPR per `mario@example.com` prenderebbero **la stessa** chiave e si serializzerebbero a vicenda per nessun motivo. (Anche in quel caso nessun deadlock: `reserveLoginAttempt` prende **una sola** chiave e non ne attende una seconda, quindi non può stare in un ciclo. Ma è confusione gratuita.) Il prefisso va **commentato con questa ragione**.

**«SCOPE OF THE ATOMICITY GUARANTEE» va scritto**, nella stessa forma che `login-throttle.ts:46-64` ha già: **atomici** il tetto per-IP, il bucket globale senza IP e il tetto per-destinatario (le tre `count` e la `create` stanno tutte dentro la stessa transazione sotto le stesse chiavi); **residuo** dichiarato: due richieste con **destinatario uguale** ma **IP diverso** si serializzano sulla chiave-email e quindi sono atomiche anche loro — la sola cosa che questa costruzione **non** dà è un ordine globale fra bucket diversi, che nessun tetto richiede.

### AD-8 — F12: la **precedenza degli errori** resta identica, e l'email resta **post-commit**

`createPprRequest` oggi fa, in quest'ordine: **(1)** honeypot → **(2)** tetti (per-IP *o* globale, poi per-destinatario) → **(3)** validazione di dominio (`ETA_IN_PAST`, `ETD_NOT_AFTER_ETA`) → **(4)** `create` → **(5)** email best-effort. Una richiesta **oltre il tetto** e **con `eta` nel passato** risponde oggi **429**, non 422.

La forma nuova deve **preservare quell'ordine**, quindi la transazione si apre **dopo l'honeypot** e racchiude **(2)(3)(4)**:

```
honeypot  →  $transaction[ lock bucket → lock email → count/count → validazione dominio → create ]  →  email post-commit
```

La validazione di dominio è **pura** (due confronti fra istanti, zero I/O), quindi tenerla dentro il lock **non allunga** la sezione critica in modo misurabile e **non sposta** la precedenza di un solo caso. Portarla fuori (prima della transazione) sarebbe più «pulito» e cambierebbe **429 → 422** su una combinazione che un test dell'audit potrebbe non coprire: è esattamente il tipo di miglioramento non richiesto che la skill vieta.

**L'email resta fuori dalla transazione**, dopo il commit, con il suo `try/catch` invariato: è la regola di casa (AOG-1b: «best-effort POST-COMMIT»), e tenere una connessione e due lock aperti per la durata di un invio SMTP (~76 ms/destinatario misurati in AOG-1b su Mailpit locale) trasformerebbe il rate limit in un collo di bottiglia.

**Conseguenza sui test, da non scoprire a metà lavoro**: `ppr.service.test.ts` mocka `$transaction` come `vi.fn()` **senza implementazione** e il `describe('ppr.service (story 8.1)')` (`:181`) **non chiama `mockTransaction()`** nel suo `beforeEach` (`:182-189`). Appena la `create` finisce dentro una transazione, **~15 test del percorso pubblico rompono insieme** con `TypeError`. La riparazione è **due righe** nel `beforeEach` (il `mockTransaction()` esiste già in quel file, `:88-94`, usato dal `describe` della coda staff) più `$executeRaw: vi.fn()` nel mock di `prisma`. §3.4 ha l'elenco.

### AD-9 — La forma del fix, e cosa **non** contiene

**8 file di codice cambiati** (più uno che l'audit propone di toccare e che resta invariato, ultima riga), nessuna migrazione, nessuna dipendenza, nessuna env var, nessuna stringa i18n, nessun testid, nessun CSS:

| File | Cambio |
|---|---|
| `src/server/services/bookings.service.ts` | `personId: null` in `maskBookingNames:222`; `BookingListItem.personId: string \| null` (`:105`); doc-comment di `maskBookingNames` e di `listBookings` allineati |
| `src/lib/schemas/bookings.ts` | `personId: z.string().nullable()` (`:149`) + doc-comment |
| `src/lib/schemas/registry.ts` | due descrizioni (`:1452`, `:1503`) che nominano `personId` fra i campi mascherati |
| `src/app/[locale]/dashboard/bookings/bookings-table.tsx` | tipo (`:41`) + **una clausola** in `isOwnRow` (`:244`) |
| `src/app/[locale]/dashboard/bookings/page.tsx` | (solo se il typecheck lo chiede sul mapper `:392`) |
| `src/app/[locale]/dashboard/page.tsx` | (idem, `:399`) |
| `src/server/services/users.service.ts` | bump condizionato in `updateUser:182-190` + doc-comment |
| `src/server/services/ppr.service.ts` | transazione + due lock + doc-comment «scope of the guarantee» |
| `src/server/auth/jwt-active-check.ts` | **NESSUN CAMBIO** (AD-4) — citato qui perché è il file che l'audit propone di toccare |

**Non contiene**: nessun `force`, nessun campo nuovo sul filo, nessun booleano `isOwn`, nessuna tabella, nessun indice (le due `count` sono già servite, fatto **i**), nessun tocco a `ACTIVE_RECHECK_INTERVAL_MS` (valore ratificato dalla story 1.4), nessun tocco alla matrice dei permessi (§5.4 dell'audit la certifica corretta).

---

## §2 — Acceptance Criteria

> Ogni AC che dice **«misurato»** richiede **un numero** nel Dev Agent Record. Ogni AC che dice **«discriminante»** richiede la prova che il test è **ROSSO sul pre-fix simulato**, con repo **ripristinato byte-identico** (sha256 dei file toccati).

### F6 — `personId` mascherato

**AC 1 — `personId` è `null` su ogni riga mascherata, sui **due** call-site, con asserzione sulla **forma esatta** (discriminante).**
`maskBookingNames` azzera `personId` insieme ai cinque campi che già azzera. Provato su **entrambi** i call-site (`listBookings`, `listCalendarBookings`) e per **entrambi** gli attori senza `bookings.read.names` (`PILOT`, `STUDENT`). L'asserzione decisiva è un **`toEqual` esatto** sulla riga mascherata, non un `toMatchObject`: è l'unico modo di non riaprire lo stesso buco al **prossimo** campo aggiunto al DTO (è la raccomandazione letterale di §F6, «Test mancanti»). Il test esistente `bookings.service.test.ts:767` — `expect(result.items[0]?.personId).toBe('person_pilot')` — **asserisce oggi il difetto** e va **invertito**, non cancellato (§3.5).

**AC 2 — La riga **propria** resta intatta, e la staff non vede nessuna differenza.**
Su una riga il cui `personId` è quello dell'attore, `personId` **resta valorizzato** (insieme a `personName`/`notes`/`denyReason`): la UI «le mie prenotazioni» e il blocco «mio» della timeline non cambiano. Per un attore con `bookings.read.names` (ADMIN, INSTRUCTOR) **nessun campo** cambia: i quattro test esistenti di `:791-830` restano verdi **senza modifiche**.

**AC 3 — Il contratto sul filo cambia in **un** posto e l'OpenAPI lo dice (stesso commit).**
`bookingItemSchema.personId` è `.nullable()`; le descrizioni di `GET /api/v1/bookings` (`registry.ts:1452`) e `GET /api/v1/bookings/calendar` (`:1503`) elencano `personId` fra i campi forzati a `null`, e la frase sul filtro `personId` non lascia più credere che il payload sia protetto. `GET /api/v1/openapi.json` risponde 200 con `Booking.personId` di tipo `["string","null"]` (verifica nel record con l'estratto JSON). `e2e/api-v1.spec.ts:21-28` resta verde.

**AC 4 — Censimento «ogni id correlabile»: completo, e con l'esito dichiarato.**
Il record elenca **tutti** i campi del DTO mascherato (16) e classifica ciascuno: *identità* (azzerato) / *operativo* (intatto, e perché non nomina una persona). E riporta il censimento dei **14** `authorize(actor, 'self.read')` di `src/server/services/*.ts` con, per ognuno, se può restituire l'id di una **persona diversa** dall'attore. Esito atteso, già verificato in ricognizione (§3.3): **la lista/il calendario delle prenotazioni sono l'unica superficie**; tutte le altre sono own-scoped per costruzione, e i due roster id→nome (`listBookableStudents`, `listActiveInstructors`) **non sono raggiungibili** da un PILOT/STUDENT (nessuna route API, e i due call-site di pagina sono gated). Se il dev trova una quindicesima superficie, la **dichiara** e non la corregge in silenzio.

**AC 5 — e2e: da una pagina non si estrae **nessun** id di terzi.**
Nel `describe('Booking privacy masking …')` di `e2e/bookings.spec.ts:1765`, la lettura grezza già presente a `:1856-1859` guadagna `expect(rawBookings.items[0]?.personId).toBeNull()`; la lettura grezza del **calendario** a `:633-635` (test dell'allievo) guadagna la stessa asserzione. In più, **un'asserzione d'insieme**: per un `PILOT`, su una pagina di `GET /api/v1/bookings?perPage=50`, l'insieme dei `personId` **non nulli** ha cardinalità **≤ 1** e, se è 1, contiene **solo** il proprio (è la forma esatta della misura «16 id distinti» dell'audit, rovesciata). Numero misurato nel record, **prima e dopo**.

**AC 6 — Il client: nessuna riga propria persa, nessuna riga di terzi guadagnata.**
`BookingRowDto.personId` è `string | null` e `isOwnRow` non tratta più `null === null` come proprietà (AD-3). Il record dichiara: (a) le due righe cambiate, (b) perché **non** è un buco di autorizzazione (il 403 di `assertOwnAccessAndTiming` sul valore **di DB**), (c) che l'attore che ci cadeva — `PILOT` **senza** persona collegata — non ha un e2e dedicato, e perché (v. §4: nessuna infrastruttura di test per componenti; `vitest.config.ts` è `environment: 'node'` con `include: ['src/**/*.test.ts']`). Verifica UI **obbligatoria** con Playwright MCP: `/it/dashboard/bookings` come `pilot@airmanager.local` — la riga propria mostra le azioni, una riga «Occupato» **no** — con screenshot nel record.

### F8 — identità rinfrescata (R-16-f)

**AC 7 — Il bump avviene nella **stessa** `user.update`, **solo** quando `personId` cambia (discriminante).**
`PATCH /api/v1/users/{id}` con un `personId` **diverso** da quello attuale (relink) **o** `null` (unlink) esegue **una** `prisma.user.update` il cui `data` contiene `personId` **e** `tokenVersion: { increment: 1 }` (asserzione su **una sola** chiamata con **entrambi** i campi in un solo `data` — la forma che TD-6 ha già usato per provare l'atomicità, non due scritture).

**AC 8 — Nessun bump quando l'identità non cambia (regressione).**
Un `PATCH` che tocca **solo** `roles`, `locale` o `isActive` **non** bumpa (un cambio di ruolo resta un cambio di **permessi**, propagato dal recheck come ratificato dalla 1.4); un `PATCH` che rimanda **lo stesso** `personId` **non** bumpa. Entrambi con un'asserzione **negativa esplicita** (`data.tokenVersion` è `undefined`), non con un `objectContaining` che lascerebbe passare il bump.

**AC 9 — L'eviction è provata, non asserita a parole.**
Il test di AD-5 (cookie invecchiato di 16 min) dimostra **401** dopo un relink e **200** per un utente non relinkato con lo stesso invecchiamento — il controllo decisivo che attribuisce l'eviction al **mismatch di versione** e non all'età del token. Se il round-trip JWE non regge, si applica il fallback di AD-5, **dichiarato nel record con il motivo tecnico e il tempo speso**. In entrambi i casi: gli unit esistenti di `jwt-active-check.test.ts:117-168` (mismatch → `null`) restano verdi **senza modifiche** e vanno **citati** come la metà «lato lettura» della prova.

**AC 10 — I residui sono dichiarati, con i numeri.**
Il record dichiara: (a) la **grazia ≤ 15 min** (`ACTIVE_RECHECK_INTERVAL_MS`) durante la quale la sessione stantia autorizza ancora la persona **precedente** — enorme miglioramento rispetto ai **30 giorni** di oggi, ma non zero, ed è il valore ratificato dalla 1.4 che questa story **non** tocca; (b) che `jwt-active-check.ts` **non** è stato modificato, con l'argomento di AD-4 (la `select` allargata sarebbe codice morto perché il confronto di versione ritorna **prima**); (c) che `createUserCore` non bumpa perché crea utenti **senza sessione**.

### F12 — rate limit atomico

**AC 11 — Un solo meccanismo, dentro la transazione, con i `where` **invariati**.**
`createPprRequest` esegue conteggi e inserimento dentro **una** `prisma.$transaction` serializzata dai **due** advisory lock di AD-7. I tre `where` dei `count` sono **byte-identici** a oggi (finestra scorrevole di 60 min, `submitterIp`, `createdByUserId: null`, email case-insensitive): i quattro test esistenti che asseriscono la **forma esatta** del `where` (`ppr.service.test.ts:323-332`, `:356-368`, `:379-388`, e l'happy-path `:210-236`) restano verdi **senza cambiare un carattere del `where` atteso**. Nessuna migrazione, nessuna tabella, nessun indice nuovo.

**AC 12 — La raffica scrive **esattamente** 5 (discriminante, e2e reale).**
Nuovo test in `e2e/ppr-public.spec.ts`: **8 `POST /api/v1/ppr-requests` in `Promise.all`**, un `x-forwarded-for` **run-unique** e **8 email distinte** (`uniqueEmail(...)` per iterazione, come già fa il test sequenziale a `:342-364`) — così il tetto che morde è **solo** quello per-IP e non c'è confusione col tetto per-destinatario. Atteso: **5 × 201** e **3 × 429** con `error.code === 'RATE_LIMITED'` (`statuses.sort()` deterministico: il tetto è `>= 5` ⇒ passano i conteggi 0..4). Misura pre-fix da riprodurre e riportare: **7 scritte su 8** (la sonda §F12 dell'audit). Il conteggio si legge dai **codici di risposta** (un 201 ⟺ una riga su questo percorso): l'e2e non ha accesso al DB e `listPprRequests` non filtra per `submitterIp` — e non deve iniziare a farlo per un test.

**AC 13 — Il doc-comment dichiara **cosa** è atomico (e la prova del non-deadlock è scritta).**
`createPprRequest` guadagna una sezione in stile «SCOPE OF THE ATOMICITY GUARANTEE» (il precedente è `login-throttle.ts:46-64`) che dice: quali tetti sono serializzati e da quale chiave; che l'ordine **bucket → email** è quello che rende impossibile un ciclo di attesa; che le collisioni di `hashtext` sono innocue per rientranza; perché le chiavi hanno un **namespace** (`login-throttle` usa l'email nuda: senza prefisso i due domini si serializzerebbero a vicenda); e che l'email di ricevuta resta **post-commit**, fuori dai lock.

**AC 14 — Nessuna riga a 429, e la precedenza degli errori è **invariata** (AD-8).**
Un 429 (per-IP, globale-senza-IP, per-destinatario) e un 422 (`ETA_IN_PAST`, `ETD_NOT_AFTER_ETA`) **non lasciano nessuna riga** e **non inviano nessuna email** — la transazione fa rollback e il lock si rilascia. Una richiesta che viola **entrambi** (oltre il tetto **e** `eta` nel passato) risponde **429**, come oggi. L'honeypot resta **prima** di tutto (`:98-100`) e non apre nessuna transazione: il test `:263` che asserisce `countMock` **non chiamato** resta verde, e va aggiunta l'asserzione gemella `transactionMock` **non chiamato**.

### Trasversali

**AC 15 — L'RBAC non regredisce, e la prova è la matrice dell'audit.**
`src/server/auth/rbac.test.ts` (matrice dei permessi, in particolare `bookings.read.names`: `false` per PILOT/STUDENT, `true` per INSTRUCTOR, unione per i multi-ruolo) resta verde **senza modifiche**. Il **403** sul filtro `personId` di `listBookings` (`bookings.service.ts:625-628`, test `:836-850`) resta **in piedi e verde**: la maschera non lo sostituisce, lo **completa**. `e2e/api-v1.spec.ts` e `e2e/rbac.spec.ts` verdi. Il record ricopia la tabella §5.4 dell'audit e dichiara, riga per riga, che l'esito non cambia.

**AC 16 — Le discriminanze sono ROSSE sul pre-fix e verdi dopo.**
Almeno **quattro** discriminanze, ognuna provata rossa **rimuovendo una guardia alla volta** (non tutte insieme) e con il repo **ripristinato byte-identico** (sha256 dei file toccati nel record): (1) `personId` non azzerato → i **3** test rossi del probe F6; (2) bump assente → i **2** test rossi del probe F8; (3) advisory lock rimossi → la raffica e2e scrive **> 5**; (4) la clausola di `isOwnRow` rimossa → **dichiarata non automatizzabile** (AC 6c) con l'argomento, oppure automatizzata se il dev trova una via che non richiede infrastruttura nuova. Tabella guardia → discriminanza obbligatoria nel record.

**AC 17 — Gate e suite.**
`npm run gates` verde (lint + typecheck + vitest + build). Suite e2e completa con `scripts/e2e.sh start` e **`scripts/e2e.sh status`** come unica fonte dell'esito (MAI `playwright test` in foreground, MAI rilanciare la suite per scoprire com'è andata). Delta test dichiarato: `N unit prima → M dopo`, `X e2e prima → Y dopo`. Parità i18n **0/0** (questa story non aggiunge stringhe).

### I probe di ricognizione sono già scritti e già misurati su `9272129`

`/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/story-16-7/` — `f6-personid-mask.probe.test.ts`, `f8-tokenversion.probe.test.ts`, `vitest.probe.config.ts` accanto (vitest è confinato a `src/**` e un `defineConfig` importato da `/tmp` **non risolve `vitest/config`**: il config è un **oggetto letterale** esportato). Comando: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run --config …/vitest.probe.config.ts`.

**F6, output verbatim** (3 failed / 1 passed):

```
 FAIL  …/f6-personid-mask.probe.test.ts > F6 (ops-audit) — a masked booking row must not carry the holder id > listBookings: personId is null on a row that is not the PILOT actor own
 FAIL  …/f6-personid-mask.probe.test.ts > F6 … > listCalendarBookings: personId is null on a row that is not the STUDENT actor own
AssertionError: expected 'person_other' to be null
- Expected:  null
+ Received:  "person_other"
 FAIL  …/f6-personid-mask.probe.test.ts > F6 … > the masked row carries NO correlatable id at all (exact shape, so the next DTO field cannot reopen the channel)
AssertionError: expected { id: 'booking_1', …(15) } to deeply equal { id: 'booking_1', …(15) }
    "notes": null,
-   "personId": null,
+   "personId": "person_other",
    "personName": null,
 Test Files  1 failed (1)
      Tests  3 failed | 1 passed (4)
```

Il **1 passed** è il controllo `does NOT mask the actor's OWN row (personId stays valorizzato)`: verde **prima e dopo**, ed è la difesa contro un fix troppo largo (AC 2).

**F8, output verbatim** (2 failed / 2 passed):

```
     × re-linking to another person bumps tokenVersion in the SAME update call 57ms
     × unlinking (personId: null) bumps tokenVersion too 9ms
  [
-   ObjectContaining { "data": { "personId": null, "tokenVersion": { "increment": 1 } } }
+   { "data": { "personId": null }, "select": {…}, "where": { "id": "user_1" } }
  ]
 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
```

⚠️ **I 2 passed di F8 sono verdi per tautologia**, e va detto: `a patch that does NOT touch personId leaves tokenVersion alone` e `re-sending the SAME personId is not a change` passano **oggi** perché **nulla** bumpa mai. Non sono discriminanti: diventano guardie **dopo** il fix, contro un bump incondizionato (AD-4 punto 2). La tabella del record deve classificarli così, non contarli come prove.

---

## §3 — Dev Notes: blast radius e censimento misurato su `9272129`

### 3.1 — F6, riga per riga

```
bookings.service.ts:105     BookingListItem.personId: string           -> string | null
bookings.service.ts:147     SelectedBooking.personId: string           INVARIATO (è la riga di DB, NOT NULL)
bookings.service.ts:162-183 toListItem                                 INVARIATO (proietta il valore vero)
bookings.service.ts:219-223 maskBookingNames                           +`personId: null` a :222
bookings.service.ts:653     listBookings -> maskBookingNames           call-site 1/2, invariato
bookings.service.ts:721     listCalendarBookings -> maskBookingNames   call-site 2/2, invariato
bookings.service.ts:625-628 il 403 sul filtro personId                 INVARIATO (AC 15)
bookings.service.ts:741     EditableBooking.personId: string           INVARIATO (riga di DB)
bookings.service.ts:773     assertOwnAccessAndTiming                   INVARIATO — l'autorità, sul valore di DB
src/lib/schemas/bookings.ts:149   personId: z.string()                 -> .nullable()
src/lib/schemas/registry.ts:1452  descrizione GET /bookings            +personId nell'elenco mascherato
src/lib/schemas/registry.ts:1503  descrizione GET /bookings/calendar   +personId nell'elenco mascherato
```

Client (3 file, 4 righe):

```
bookings-table.tsx:41   personId: string   -> string | null   (+ doc-comment come quello di personName a :42)
bookings-table.tsx:244  isOwnRow           -> + `ownPersonId !== null &&`
bookings/page.tsx:392   personId: booking.personId            pass-through (nessun cambio testuale)
dashboard/page.tsx:399  personId: booking.personId            pass-through (nessun cambio testuale)
```

### 3.2 — F8 e F12, riga per riga

```
users.service.ts:154      const existing = await prisma.user.findUnique({ where: { id } })   <- riga INTERA, personId incluso
users.service.ts:182-190  prisma.user.update({ data: {…} })    + `...(personIdChanges && { tokenVersion: { increment: 1 } })`
auth-tokens.service.ts:216-219   il MODELLO da copiare (passwordHash + increment in un solo data)
jwt-active-check.ts:38-52 NESSUN CAMBIO (AD-4)

ppr.service.ts:98-100     honeypot                       resta FUORI dalla transazione
ppr.service.ts:108-124    count per-IP / count globale   dentro la transazione, `where` INVARIATI
ppr.service.ts:126-139    count per-destinatario         idem
ppr.service.ts:141-153    validazione dominio            dentro la transazione (AD-8: precedenza invariata)
ppr.service.ts:156-173    create                         dentro la transazione
ppr.service.ts:175-197    email di ricevuta              POST-COMMIT, invariata
login-throttle.ts:94-118  l'IDIOMA da copiare            (non si tocca)
```

### 3.3 — Censimento «ogni id correlabile» (AC 4), già eseguito

I **14** `authorize(actor, 'self.read')` di `src/server/services/*.ts`:

| Servizio:riga | Può restituire l'id di una persona **diversa** dall'attore? |
|---|---|
| `bookings.service.ts:622` (`listBookings`) | **SÌ — è F6.** |
| `bookings.service.ts:695` (`listCalendarBookings`) | **SÌ — è F6**, e qui non esiste nemmeno il filtro, quindi nemmeno il 403. |
| `bookings.service.ts:1249` (`listBookableAircraft`) | No — velivoli. |
| `bookings.service.ts:1266` (`listBookableStudents`) | **Roster id→nome**, ma **non raggiungibile**: nessuna route API (`grep -rn` su `src/app/**/route.ts` → 0) e l'unico call-site di pagina (`bookings/page.tsx:175`) è dentro `else if (ownInstructorProfileId)`. |
| `bookings.service.ts:1279` (`listActiveInstructors`) | **Roster id→nome**, idem: `bookings/page.tsx:158` lo chiama **solo** `if (canReadNames)`, `dashboard/page.tsx:314` è dentro `renderAdminOverview` (gated `finance.manage`, `:138`). |
| `bookings.service.ts:1299` (`getOwnInstructorProfileId`) | No — il **proprio** profilo, o `null`. |
| `accounts.service.ts:101` (`assertReadAccess`) | No — `actor.personId !== personId` → 403. |
| `accounts.service.ts:420,439` (`getOwnAccountOverview`, `listOwnAccountMovements`) | No — `actor.personId` o forma vuota. |
| `instructor-compensation.service.ts:243,326` | No — il proprio profilo o `null`. |
| `me.service.ts:29` | No — sé stesso. |
| `flights.service.ts:1568` (`authorizeFlightsQuery`) | No — own-only (**§5.4** dell'audit: `GET /flights?personId=<altro>` → **403**). |
| `people.service.ts:340` (`getPerson`) | No — `actor.personId !== id` → 403. |

**Conclusione**: la lista e il calendario delle prenotazioni sono **l'unica** superficie da cui un attore non-staff estrae l'id di un terzo. L'amplificatore che l'audit nomina (*«un allievo visto nel picker di `listBookableStudents` (gate `self.read`, cioè ogni ruolo)»*) è **vero a livello di servizio** e **non raggiungibile** dalle superfici vive: il gate permissivo è un rischio latente, non un canale aperto. **Non si tocca** in questa story (nessuna route, nessun consumatore non gated) → **TD 16.7-a**.

### 3.4 — Blast radius dei test (censimento completo)

**Unit che CAMBIANO** — e come:

| File:riga | Cosa asserisce oggi | Come cambia |
|---|---|---|
| `bookings.service.test.ts:767` | `expect(result.items[0]?.personId).toBe('person_pilot')` — **asserisce il difetto** | → `.toBeNull()`, e il test guadagna il `toEqual` esatto di AC 1. **Mai** cancellato: invertito, con un commento che dice perché la vecchia asserzione era sbagliata. |
| `bookings.service.test.ts:763` | `toMatchObject({ personName: null, … })` | + `personId: null` (e il `toEqual` esatto vive nel test nuovo, non qui: `toMatchObject` resta utile per la leggibilità dei 5 campi storici). |
| `users.service.test.ts:200-208` | `expect(updateMock).toHaveBeenCalledWith(objectContaining({ data: { personId: null } }))` — **`data` esatto** | → `data: { personId: null, tokenVersion: { increment: 1 } }`. |
| `users.service.test.ts:188-199` | `data: { isActive: false }` esatto | **INVARIATO** (AC 8: `isActive` non bumpa). Se rompe, il fix è incondizionato ⇒ AD-4 violato. |
| `ppr.service.test.ts` `beforeEach` del `describe('ppr.service (story 8.1)')` (`:182-189`) | non installa `mockTransaction()` | + `transactionMock.mockReset(); mockTransaction();` e `$executeRaw: vi.fn()` nel mock di `prisma` (`:12-31`). **Senza questo, ~15 test rompono insieme con `TypeError`** (AD-8). |
| `ppr.service.test.ts:262-303` (honeypot) | `countMock`/`createMock` non chiamati | + `transactionMock` non chiamato (AC 14). |
| `src/lib/booking-schedule.test.ts:12-25` | fixture con `personId: 'p-1'` | **INVARIATO** (`string` è assegnabile a `string \| null`). Verificato. |

**Unit che NON devono cambiare** (se cambiano, il fix è troppo largo): `bookings.service.test.ts:770-780` (riga propria), `:782-790` (student), `:791-835` (instructor/admin non mascherati), `:836-850` (il **403** sul filtro), `:951-970` (mascheratura del calendario, che guadagna solo l'asserzione su `personId`); `jwt-active-check.test.ts:117-168`; `auth-tokens.service.test.ts` (il bump del set-password); `rbac.test.ts` **interamente**; `ppr.service.test.ts` `describe` della coda staff (`:431`+, che **già** usa `mockTransaction()` nel suo `beforeEach:444`).

**e2e che CAMBIANO**:

| File:riga | Cambio |
|---|---|
| `e2e/bookings.spec.ts:1856-1859` | + `expect(rawBookings.items[0]?.personId).toBeNull()` e l'asserzione d'insieme di AC 5 |
| `e2e/bookings.spec.ts:633-635` | il tipo letto diventa `{ aircraftId: string; personName: string \| null; personId: string \| null }` + `expect(rawBlock?.personId).toBeNull()` |
| `e2e/ppr-public.spec.ts` | **nuovo** test di raffica (AC 12), accanto al sequenziale `:342-364` di cui riusa `uniqueFakeIp()`/`uniqueEmail()`/`REQUIRED_API_FIELDS` |
| **nuovo** o dentro un file esistente | il test di eviction di AD-5 (AC 9). Casa naturale: un file nuovo `e2e/session-identity.spec.ts` — **non** `login.spec.ts` (che è l'unico spec che fa login falliti: aggiungere login lì avvicina il cap TD-6 di 10 tentativi/identifier, v. §5) |

**e2e che NON cambiano**: `api-v1.spec.ts`, `rbac.spec.ts`, `exports.spec.ts`, `pdf-exports.spec.ts` (nessuna colonna `personId`, fatto **e**), `ppr-queue.spec.ts`, tutti i `mobile-*.spec.ts` (`grep -rn "\.personId" e2e/mobile-*` → solo **input** di creazione e path di URL, mai letture da una riga di prenotazione).

**Nessuno dei test nuovi va nella catena serializzata** di `playwright.config.ts`: non scrivono `AppSettings` e non asseriscono aggregati globali (il conteggio di AC 12 è confinato a un `x-forwarded-for` run-unique; l'utente di AC 9 è run-unique).

### 3.5 — Fixture e seed

- **Nessun cambio al seed**, né base né di carico. F6 non aggiunge dati; F8 ha bisogno di **un utente con password impostata da ri-collegare** — che è precisamente ciò che l'audit **non** poteva fare (mandato: non modificare gli attori del seed) e che l'e2e **può**, con l'idioma già in casa: `createPilotPerson` + `POST /api/v1/users` + `setPassword(...)` via Mailpit, come fa `e2e/aog-impact-email.spec.ts:120-200`. **Persone e email run-unique**, e **una seconda persona** come bersaglio del relink.
- **F12 non ha bisogno di fixture**: 8 POST non autenticati con IP ed email run-unique.
- **`airmanager_load`**: 5 000 righe `PprRequest`; nessuna scrittura richiesta da questa story su quel DB. Le due `count` restano servite dall'indice a quel volume (fatto **i**).

### 3.6 — File toccati (previsione; il record dichiara quelli effettivi)

Codice: i **8** di AD-9 (più `jwt-active-check.ts` **a zero**). Test: `bookings.service.test.ts`, `users.service.test.ts`, `ppr.service.test.ts`, `e2e/bookings.spec.ts`, `e2e/ppr-public.spec.ts`, `e2e/session-identity.spec.ts` (nuovo). Documenti: questo file (Dev Agent Record). **Non si toccano**: `prisma/schema.prisma`, `.env.example`, `.github/workflows/ci.yml`, `playwright.config.ts`, `package.json`, i file di traduzione.

---

## §4 — Piano di test

**Unit — nuovi in `src/server/services/bookings.service.test.ts`** (mock chain **identica**, nessun mock nuovo — i 4 casi del probe F6 portati dentro)
1. `personId` nullo su `listBookings` per `PILOT` e per `STUDENT`; nullo su `listCalendarBookings`; **`toEqual` esatto** sulla riga mascherata (AC 1).
2. Riga propria: `personId` **valorizzato** insieme a `personName`/`notes`/`denyReason` (AC 2).

**Unit — nuovi in `src/server/services/users.service.test.ts`** (i 4 casi del probe F8)
3. Relink → un solo `update` con `personId` **e** `tokenVersion: { increment: 1 }` (AC 7); unlink → idem.
4. Solo `roles`/`locale`/`isActive` → **nessun** `tokenVersion` (asserzione negativa esplicita); stesso `personId` → **nessun** bump (AC 8).

**Unit — nuovi in `src/server/services/ppr.service.test.ts`**
5. I due `$executeRaw` di lock sono emessi **in quest'ordine** (bucket **poi** email) e **prima** del primo `count` — `invocationCallOrder`, stesso idioma di `bookings.service.test.ts:553-564`; con `ip: null` la chiave-bucket è `ppr:no-ip`; senza email il secondo lock **non** parte (AC 11/13).
6. Un 429 e un 422 **non** chiamano `create` e **non** inviano email; una richiesta oltre il tetto **e** con `eta` passata risponde **429** (AC 14).

**e2e — nuovi**
7. `e2e/ppr-public.spec.ts`: **8 POST in `Promise.all`** → `[201×5, 429×3]` (AC 12).
8. `e2e/session-identity.spec.ts`: relink + cookie invecchiato di 16 min → **401**, e il controllo decisivo su un utente non relinkato → **200** (AC 9, AD-5).
9. `e2e/bookings.spec.ts`: le tre asserzioni di AC 5.

**Verifica UI interattiva** (Playwright MCP, AC 6): `/it/dashboard/bookings` come `pilot@airmanager.local` — riga propria **con** azioni, riga «Occupato» **senza**; e `/it/dashboard` come admin invariata. Screenshot nel record.

**Discriminanze obbligatorie** (ROSSE sul pre-fix simulato, **una guardia alla volta**, repo ripristinato byte-identico con sha256): le 3 del probe F6, le 2 del probe F8, la raffica e2e coi lock rimossi. Tabella con l'esito riga per riga.

**Gate**: `npm run gates` → `npx vitest run` per file → **DB fresco** → `scripts/e2e.sh start` + `scripts/e2e.sh status`.

---

## §5 — Trappole note

- **`null === null` è vero.** È il difetto che AD-3 chiude, e la stessa forma va cercata **due volte** prima di dichiarare il lavoro fatto: `dashboard/page.tsx:906` filtra `booking.instructorProfileId === ownInstructorProfileId` e `bookings-table.tsx:245` fa lo stesso confronto. Entrambi sono **salvi** — il primo riceve `ownInstructorProfileId: string` non nullable (`:883-888`) e serve un attore con `bookings.read.names`; il secondo ha già la guardia `!== null` **a sinistra**. Verificarli, non fidarsi di questo elenco.
- **Il test che asserisce il difetto.** `bookings.service.test.ts:767` dice `expect(result.items[0]?.personId).toBe('person_pilot')` **dentro** il test della mascheratura. Chi lo trova rosso e lo «ripara» rimettendo `personId` nel DTO ha invertito il fix. Il commento del test nuovo deve spiegarlo, perché il prossimo lettore avrà lo stesso riflesso.
- **~15 test PPR rompono in blocco, e non è colpa dei lock.** `describe('ppr.service (story 8.1)')` non installa `mockTransaction()` (AD-8). Il sintomo è `TypeError: (intermediate value) is not iterable` oppure `createMock not called`, e **sembra** un difetto della transazione nuova: è la fixture. Due righe nel `beforeEach`.
- **`prisma.$executeRaw` va aggiunto al mock**, altrimenti il primo lock è `undefined(...)`. `login-throttle.test.ts` ha già il mock giusto da copiare.
- **Non usare `hashtext` senza namespace.** `login-throttle.ts:96` usa l'email nuda come chiave: `ppr:email:<email>` **deve** avere il prefisso, o una richiesta PPR e un tentativo di login sullo stesso indirizzo si serializzano a vicenda (nessun deadlock, ma un accoppiamento invisibile fra due sottosistemi).
- **`::bigint` non è opzionale.** `pg_advisory_xact_lock` ha overload `(bigint)` e `(int, int)`; `hashtext` restituisce `integer` e senza il cast Postgres sceglie l'overload sbagliato o rifiuta. `login-throttle.ts:96` ha la forma esatta.
- **Il lock non deve mai contenere l'invio SMTP.** L'email di ricevuta esce **dopo** il commit (AD-8): l'AOG-1b ha misurato **~76 ms per destinatario** su Mailpit locale, e tenere due advisory lock per quel tempo trasforma il rate limit in una coda.
- **La raffica e2e e il pool.** 8 transazioni interattive concorrenti entrano nel pool di default (9, fatto **k**); una raffica da 20 no, e il fallimento sarebbe un `P2028`/timeout `maxWait` — cioè un **500** invece di un 429, letto come «il fix non funziona». Otto è la larghezza misurata giusta; il dimensionamento esplicito del pool è **17.1**, non questa story. Il record dichiara questo residuo.
- **Ripetere run e2e mirati sullo stesso DB fa scattare il lock anti-brute-force** (TD-6, cap **10** per identifier / 15 min). Questa story aggiunge login (l'utente di AC 9, più il suo **secondo** login se si usa il fallback di AD-5). Prima di attribuire un fallimento alla flake nota: `SELECT identifier, count(*) FROM "LoginAttempt" WHERE "createdAt" > now() - interval '15 minutes' GROUP BY 1`; se il conteggio è alto, resettare il DB. **Usare identifier run-unique** e non `pilot@airmanager.local` per il test di eviction.
- **`AUTH_SECRET` deve essere lo stesso** che usa il server sotto test, altrimenti il `decode` di AD-5 falla con un errore di decifratura che sembra un bug del test. E il `salt` è il **nome del cookie**, non una costante libera (`src/proxy.ts:85-86`).
- **La 16.3 tocca lo stesso file** (`bookings.service.ts`, regioni disgiunte). Verificare `git log --oneline -3` prima di iniziare e non ricostruire a mano un `maskBookingNames` che nel frattempo è slittato di riga.
- **`Escape` e i pannelli**: `SlideOver` chiude l'**intero** pannello (CLAUDE.md). Il test nuovo di AC 5/6 non usa `Escape` per chiudere nulla.

---

## §6 — Fuori scope DICHIARATO

- **Il gate `self.read` dei due roster id→nome** (`listBookableStudents:1266`, `listActiveInstructors:1279`): permissivo a livello di servizio, **non raggiungibile** dalle superfici vive (§3.3). Restringerlo (a `bookings.read.names` per gli istruttori, o al possesso di un profilo istruttore attivo per gli allievi) è corretto ma è **un cambio di permessi** che nessun finding chiede → **TD 16.7-a**.
- **La grazia di 15 minuti** (`ACTIVE_RECHECK_INTERVAL_MS`): valore **ratificato** dalla story 1.4, dichiarato come residuo (AC 10a), non toccato.
- **`personId` nella `select` del recheck**: rimedio **proposto dall'audit** e deliberatamente **non fatto**, con l'argomento di AD-4 (codice morto sotto il bump). Se un giorno la ratifica R-16-f venisse rovesciata verso la variante debole, quello è il posto.
- **La sessione assoluta di 30 giorni senza sliding** (`auth.config.ts:19-26`, trade-off di TD-4): fuori.
- **Le altre classi IDOR che l'audit ha trovato corrette** (§5.4, §5.5): flights own-only, PPR staff-only, estratti conto own-only. Questa story si limita a **non regredirle** (AC 15).
- **ops F10** (nessuna storia delle transizioni di prenotazione) e **ops F11** (storia dei documenti): TD già registrati dall'audit, non qui.
- **Il dimensionamento del pool e `maxWait`/`timeout`** delle transazioni interattive: **story 17.1**, che ha l'AC dedicata. Qui si dichiara solo il residuo (§5).
- **`x-forwarded-for` non verificato** (assunzione dichiarata nel doc-comment di `extractSubmitterIp` (`:73-83`), residuo D-D dell'audit OWASP 2026-07-22): questa story rende **reale** il tetto, non **inforgiabile** l'identità del mittente. Il tetto per-destinatario esiste proprio perché l'IP è rotabile, ed è quello che questa story rende atomico. Fuori, e va **detto** nel doc-comment.
- **Qualunque stringa i18n, CSS, componente, testid, layout**: zero. Le skill UI non si applicano (AD-9); la verifica Playwright MCP di AC 6 serve a provare che **nulla** è cambiato a schermo, non a disegnare.

---

## §7 — Riferimenti

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` — **contratto**: «Story 16.7» (i 3 AC di record), «Ratifiche PO» (**R-16-f**), «Architettura e vincoli» («guardie = 409/422 col codice esistente + unit discriminante + e2e»; «ogni guardia nuova nasce con un test che la prova ROSSA simulando il pre-fix»).
- `_bmad-output/planning-artifacts/audit-2026-09-10/ops-audit.md` — **§F6** (le due misure: 16 id distinti su una pagina, il calendario di uno `STUDENT`; il rimedio e il costo di contratto; «Test mancanti» = l'asserzione negativa sulla forma), **§F8** (le due `select` letterali, lo scenario a 30 giorni, l'incoerenza con `getMe`, il rimedio forte raccomandato), **§F12** (la sonda a 8 paralleli, i 7 su 5, il pattern `PprCounter` come alternativa), **§5.4** (la matrice RBAC da non regredire), **§5.5** (cosa non si è rotto), **§6 domanda 5** (chiusa da R-16-f), **§7** (le fixture residue dell'audit, ripristinate).
- `_bmad-output/implementation-artifacts/td-6-security-auth.md` — il meccanismo `tokenVersion` (F1) e `reserveLoginAttempt` (F2) **da riusare**; e, nel Review Record, la ricetta della prova che AD-5 automatizza (cookie decifrato, `lastActiveCheck` invecchiato di 16 min, controllo decisivo con `tokenVersion` corrente).
- `_bmad-output/implementation-artifacts/16-3-prenotazioni-persona-istruttore-approvazione.md` e `16-1-un-solo-calendario.md` — formato di casa, disciplina «asserzione al valore corretto, mai indebolita», idioma del probe fuori repo.
- `src/server/auth/login-throttle.ts:34-118` — l'idioma dell'advisory lock **e** il modello della sezione «SCOPE OF THE ATOMICITY GUARANTEE» che AC 13 richiede.
- `CLAUDE.md` — gates, `scripts/e2e.sh`, validazione **eager** dell'env nei unit, catena serializzata e2e, cap anti-brute-force TD-6, lezione `Escape`/`SlideOver`, Playwright MCP.
- `docs/handoffs/HANDOFF.md` — ciclo per story su questa macchina, reset DB, `JOBS_SECRET` per la suite `CI=1`, flake note, `Co-Authored-By` = il modello che ha fatto il lavoro.
- `.claude/skills/karpathy-guidelines/SKILL.md` — assunzioni esplicitate (§1: le tre alternative rifiutate con la misura), semplicità (AD-1: una riga, non un HMAC; AD-3: una clausola, non un campo sul filo), chirurgia (AD-8: la precedenza degli errori resta identica), criteri verificabili (§2).
- Probe della ricognizione (**fuori dal repo**, rieseguibili): `/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/story-16-7/{f6-personid-mask,f8-tokenversion}.probe.test.ts` + `vitest.probe.config.ts`.
- Query di misura usate in questo file (**read-only**, `docker compose exec -T postgres psql -U airmanager -d airmanager_load`):
  ```sql
  SHOW transaction_isolation;                              -- read committed  (AD-6)
  SELECT hashtext('ppr:ip:203.0.113.5')::bigint;           -- 741491890       (AD-7)
  SELECT indexname FROM pg_indexes WHERE tablename='PprRequest';
  EXPLAIN (ANALYZE) SELECT count(*) FROM "PprRequest"
    WHERE "submitterIp"='203.0.113.5' AND "createdAt" > now() - interval '1 hour';   -- 0,096 ms, Index Only Scan
  ```

### Da registrare in `sprint-status.yaml` (azione della sessione principale, non del dev)

| TD | Contenuto |
|---|---|
| **TD 16.7-a** | `listBookableStudents`/`listActiveInstructors` sono gated `self.read` (**ogni** ruolo) e restituiscono roster **id→nome**. Non raggiungibili oggi (nessuna route API; i 3 call-site di pagina sono gated — censimento §3.3), quindi nessun canale aperto: ma il gate del servizio non riflette l'intenzione, e AD-5 del progetto dice che il servizio è il vero guardiano. Restringerlo è un cambio di permessi da ratificare. |
| **TD 16.7-b** | **Residuo dichiarato di F8**: la sessione stantia autorizza la persona **precedente** per ≤ **15 min** (`ACTIVE_RECHECK_INTERVAL_MS`, ratificato dalla story 1.4). Da 30 giorni a 15 minuti; azzerarlo richiede un controllo per-richiesta (costo: una query per richiesta) o una revoca push. |
| **TD 16.7-c** | **Residuo dichiarato di F12**: il tetto è atomico, l'**identità del mittente** no (`x-forwarded-for` non verificato — assunzione già dichiarata di `extractSubmitterIp`, residuo D-D dell'audit OWASP). Il tetto per-destinatario è la difesa contro la rotazione, e ora è atomico. |
| **TD 16.7-d** | Le transazioni interattive nuove del PPR usano `maxWait`/`timeout` **di default** (2 s / 5 s) e il pool di default (**9**, `nproc*2+1`): sotto una raffica molto più larga di 8 la risposta degenera in **P2028/500** invece di 429. Casa naturale del dimensionamento esplicito: **story 17.1**. |

---

## Dev Agent Record

*(da compilare dal dev subagent — §A verifica della ricognizione sul HEAD corrente (le righe di §3.1 e §3.2 una per una, con lo shift dichiarato se la 16.3 è stata committata prima), §B riepilogo per AC con le prove, §C il censimento di AC 4 (16 campi del DTO classificati + i 14 `self.read`), §D tabella guardia → discriminanza con l'esito ROSSO e lo sha256 del ripristino, distinguendo le discriminanze dai pin tautologici, §E la misura di AC 5 prima/dopo (id distinti visibili a un PILOT su una pagina), §F la misura di AC 12 prima/dopo (righe scritte su 8 paralleli), §G l'esito di AD-5 (automatizzato o fallback, con il motivo tecnico e il tempo speso), §H deviazioni motivate — a partire da `jwt-active-check.ts` non toccato, §I TD da registrare, §J file toccati, §K cosa NON ho fatto, §L screenshot UI di AC 6, §M gate ed esiti verbatim incl. `scripts/e2e.sh status`)*
