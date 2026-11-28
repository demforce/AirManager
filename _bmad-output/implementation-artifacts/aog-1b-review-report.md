# Review adversarial — Story AOG-1b («Stai per impattare N prenotazioni»)

**Reviewer**: subagent Opus 5 xhigh (adversarial, unico layer) · **Data**: 2026-08-07
**Commit sotto review**: `ea54b3f` (feat) + `b7b8d13` (Dev Agent Record), su `dev`
**Baseline**: `7f0a2fb` (chiusura AOG-1a) · **Macchina**: Fedora locale dell'utente (Postgres + Mailpit in Docker), NON il container di CLAUDE.md

## VERDETTO: **SHIPPABLE-WITH-FIXES**

2 MAJOR (entrambi riproducibili in modo deterministico e non coperti da alcun test), 2 MINOR (uno dei quali è una decisione PO), 4 LOW.
Nessun BLOCKER: la funzione di dominio è UNA sola e le sue frontiere sono corrette al millisecondo, la transazione e la sua guardia atomica reggono la corsa, l'email è best-effort davvero, l'RBAC è pulito su tutti e quattro i ruoli, i gate sono verdi e l'arbitro è verde.

---

## 1. Arbitro — suite e2e completa, verbatim

DB appena resettato e seminato prima del run; `CI=1 scripts/e2e.sh start`, esito letto SOLO con `scripts/e2e.sh status`, log copiato in
`/tmp/claude-1000/.../scratchpad/arbiter-run.log` (707 righe).

```
log: /tmp/airmanager-e2e/last-run.log
args: <full suite>
state: DONE — E2E_EXIT=0
--- summary ---
  1 flaky
  523 passed (13.6m)
```

- **524 test totali** (523 passed + 1 flaky recuperato al retry), **0 failed, 0 skipped, exit 0** — coincide con i 524 dichiarati dal dev (521 baseline + 3 nuovi).
- I **3 test METAR sono PASSATI** (`mobile-metar.spec.ts` 61/167/208, righe 507/508/509 del log): aviationweather.gov era raggiungibile, quindi 0 skipped e il conto torna esattamente come dichiarato in §L.
- I **3 test della story sono verdi al primo tentativo**: `aog-impact-email.spec.ts:156` (11.4s), `:283` (5.3s), `:334` (1.6s).
- **Il flaky NON è attribuibile alla story**: `aircraft-rates.spec.ts:98` — `getByTestId('toast').filter({ hasText: 'Tariffa aggiunta' })` in strict-mode violation su **due** toast simultanei. Il diff di 1b non tocca `aircraft-rates.spec.ts`, né `toast.tsx`, né le tariffe. È la classe «due toast dello stesso testo coesistono» già nota alla suite.
- `flights.spec.ts:602` (TD 15.5 seconda faccia), lock TD-6 e `datetime-picker:127`: **nessuno si è presentato**.

### Gate unit, riverificati da me
```
PASS  lint (20s)
PASS  typecheck (2s)
PASS  test (7s) — Tests  1819 passed (1819)
PASS  build (29s)
```
Shell PULITA (regola CLAUDE.md a 3 occorrenze, AC 16):
`env -u DATABASE_URL -u AUTH_SECRET npx vitest run` → `aog-impact.test.ts` **8 passed**, `aircraft.service.test.ts` **71 passed**, `templates.test.ts` **19 passed** (v. LOW-1: §L dice 22).

---

## 2. Findings

### MAJOR-1 — La finestra DICHIARATA contraddice il numero MOSTRATO ogni volta che `outOfServiceUntil` è già passato (anteprima, banner, riga persistente **e email**)

**File**
- `src/server/services/aog-impact.ts:105-108` — il clamp («un limite superiore già passato non è un limite») vive QUI e **solo** qui;
- `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx:896-899` — `windowText` è derivato **indipendentemente** da `impactUntil` (`:775`), senza alcuna conoscenza del clamp; consumato da banner (`:929`), riga (`:940`) e anteprima (`:965`);
- `src/server/adapters/mail/templates.ts:374-375` — stessa derivazione indipendente per la frase «Fermo: …» dell'email, alimentata da `src/server/services/aircraft.service.ts:571`.

**Che cosa succede.** La deviazione 7 (§H) è corretta e necessaria per AC 9: un `until` scaduto torna finestra NON delimitata, quindi il conteggio continua a contare **tutte** le prenotazioni vive future. Ma la **frase** che accompagna quel numero continua a dire «conteggio fino al {data} compreso» con la data scaduta. Il risultato è un enunciato **falso**: un conteggio non delimitato presentato come delimitato da un giorno già finito (una finestra che, presa alla lettera, è vuota). È esattamente lo scenario per cui AC 9 esiste — **il fermo andato lungo** — e quindi non è un caso di laboratorio: è la condizione normale di ogni AOG il giorno dopo la data prevista, a ogni riapertura del pannello.

Nota di metodo: AD-1 esiste per impedire «due percorsi che si tengono allineati». Qui la finestra è espressa **due volte** — la regola clampata nel dominio e la frase ricostruita nella UI/nel template — e le due **non** sono allineate.

**Riproduzione (misurata, server di produzione)**

1. API, fixture proprie (2 APPROVED: +3 giorni e +40 giorni; `until` = ieri):
```
preview(until=2026-08-17)  -> {"pending":1,"approved":2}
preview(no until)          -> {"pending":1,"approved":4}
preview(until=2026-08-06)  -> {"pending":1,"approved":4}   <-- ieri: identico al NON delimitato
preview(until=2026-08-07)  -> {"pending":0,"approved":0}
```
2. UI (velivolo con una prenotazione a +3 e una a +40, `it`, 1280×900):
```
A/preview until=+10             : "Stai per impattare 1 prenotazione. | ... | conteggio fino al 17/08/2026 compreso · stima"
A/preview until=YESTERDAY       : "Stai per impattare 2 prenotazioni. | ... | conteggio fino al 06/08/2026 compreso · stima"
A/banner (past until)           : "Fermo registrato: 2 prenotazioni impattate. | ... | conteggio fino al 06/08/2026 compreso | Vedi le prenotazioni"
A/row at reopen (past until)    : "2 prenotazioni nel fermo · conteggio fino al 06/08/2026 compreso"
A/stored until                  : "2026-08-06"
```
La seconda delle due prenotazioni contate è a **+40 giorni**, cioè 41 giorni **oltre** la finestra dichiarata.

3. L'email, verbatim da Mailpit (velivolo fermato con `until` = ieri, unica APPROVED a +40 giorni):
```
grounding: {"impactedBookings":{"pending":0,"approved":1}}, outOfServiceUntil:"2026-08-06"

SUBJECT: Velivolo fuori servizio: I-PAST1786113820404-
Ciao Lontano,
Il velivolo I-PAST1786113820404-, su cui hai una prenotazione approvata, è stato messo fuori servizio.
Motivo: Fermo scaduto
Fermo: fino al 06/08/2026 compreso
La tua prima prenotazione interessata: 16/09/2026, 10:00
```
Il pilota riceve un avviso che dichiara il fermo **finito 41 giorni prima** della prenotazione per cui viene avvisato. Il messaggio si contraddice da solo.

**Copertura**: nessun unit e nessun e2e esercita la frase con un `until` passato. L'unico test del clamp (`aog-impact.test.ts:161`) verifica il **numero**, mai la stringa che lo accompagna.

**Rimedio suggerito (decisione PO)** — l'opzione coerente con AD-1 è **una sola**: fare uscire la finestra EFFETTIVA dalla funzione di dominio invece di ricostruirla a valle. Es. `computeAogImpact` restituisce anche `effectiveUntil: string | null` (null quando il bound è stato clampato), il DTO lo porta (anteprima + response), e UI ed email scelgono la frase su QUELLO. Serve la ratifica PO su **quale frase** usare nel caso «bound scaduto»: riusare `impactWindowUndelimited` («rientro da definire: conteggio non delimitato») è la scelta minima e già tradotta, ma dice «rientro da definire» quando una data c'è; una frase nuova («fermo oltre il {data} previsto: conteggio non delimitato») costa 2 chiavi ×2 locale. Non ho scelto io: è materia PO.

---

### MAJOR-2 — Il doppio passo è annullato da un **doppio click**: il bottone «Conferma» nasce esattamente sotto il punto in cui è stato premuto «Fuori servizio»

**File**: `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx:1006-1026` (la `.fld wide` che, armata, SOSTITUISCE il submit con la coppia conferma/annulla).

**Che cosa succede.** Lo stato armato rimpiazza il trigger **nella stessa posizione**: misurato, `out-of-service-submit` è a `x 781, y 444.25` e `out-of-service-confirm` compare a `x 781, y 444.25` — origine identica, e il suo box **copre il punto di click del trigger**. Un doppio click (l'input accidentale più comune su un bottone) arma e conferma in un colpo solo: il velivolo va in AOG, parte il fan-out email ai piloti, e la conferma che R-AOG-b ha ratificato non viene mai letta da nessuno.

Il record (§G-5) dichiara di riusare «l'idioma dell'Archivio». **Non è lo stesso idioma**: `ArchiveSection` (`:1455-1466`) mette PRIMA una `<span className="fld-label">` con la domanda, quindi il suo `archive-confirm` è spostato a destra e non copre il trigger. Misurato sulla stessa pagina:

```
archive trigger box:  {"x":781,   "y":786.59,"width":71.42,"height":34.84}
archive-confirm box:  {"x":981.78,"y":786.59,"width":82.30,"height":34.84}
archive-confirm covers the trigger CENTER?: false
archive-confirm covers the trigger LEFT edge?: false
```
contro
```
submit box (scrolled in view): {"x":781,"y":444.25,"width":479,"height":34.84}
armed?: 1
confirm box:                   {"x":781,"y":444.25,"width":82.30,"height":34.84}
confirm covers the submit click point?: true
status after the second click at the SAME point: "OUT_OF_SERVICE"
status after native dblclick at the left edge:   "OUT_OF_SERVICE"
```

**Riproduzione**: aprire l'editor di un velivolo OPERATIONAL, compilare il motivo, **scorrere il submit in vista** (v. MINOR-1: sul desktop non lo è) e fare doppio click sul suo bordo sinistro. 2 varianti su 2 (due click a 250 ms e `dblclick` nativo) hanno scritto. Nota: la mia prima prova era **invalida** perché i click grezzi cadevano su un bottone clippato fuori dal `.so-body`; ripetuta con `scrollIntoViewIfNeeded()` il difetto è deterministico.

**Perché conta**: il doppio passo è l'unica cosa che 1b aggiunge fra l'admin e una scrittura che (i) è irreversibile senza un rientro in servizio, (ii) spedisce email a N piloti, (iii) per AD-9 di 1a rende la data non più modificabile. Un salvagente che il gesto accidentale più banale scavalca non è un salvagente.

**Rimedio suggerito**: adottare l'idioma dell'Archivio **per intero** — una domanda davanti alla coppia (sposta il confirm fuori dal punto di click e, come effetto collaterale, chiude anche il caso «anteprima assente perché la fetch è fallita», in cui oggi il secondo passo è una coppia di bottoni senza alcuna domanda). In alternativa: invertire l'ordine (Annulla prima di Conferma), oppure una piccola guardia temporale sul secondo passo. La scelta fra «domanda nuova» (2 chiavi ×2 locale, ma `availability.confirmReturnToService` mostra che il progetto scrive volentieri domande) e «riordino dei due bottoni» è materia PO.

---

### MINOR-1 — Il fold a **1280×900**: il submit primario finisce sotto il bordo del corpo scrollabile, e §C dichiara il contrario

**File**: `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx:959-969` (il box `aog-impact-preview`, sempre montato dentro `.form-grid`).

**Misura** (stessa pagina, stesso pannello, l'unica differenza è `display:none` sul solo box nuovo):
```
1280 WITH preview   : bodyBottom 840.16, submitTop 869.25, submitBottom 904.09, visibleWithoutScroll=false, scrollTop=0
1280 WITHOUT preview: bodyBottom 840.16, submitTop 777.13, submitBottom 811.97, visibleWithoutScroll=true,  scrollTop=0
```
Prima di 1b il «Fuori servizio» era **visibile all'apertura** a 1280×900; adesso è **29-64 px sotto** il bordo inferiore di `.so-body` e richiede uno scroll. §C dichiara il fold **solo a 375** e scrive «era già così prima di 1b (908,17 > 659,23)»: vero a 375, **falso a 1280**, che è l'altra larghezza che AC 14 impone di misurare («misure pre/post … a 375 e 1280», «dice **se e quanto** il contenuto finisce sotto il fold»).

Concausa dichiarabile: il box di anteprima è renderizzato **anche quando il conteggio è zero** — misurato: `"Stai per impattare 0 prenotazioni. | In attesa (congelate): 0 · Approvate (da gestire): 0 | rientro da definire: conteggio non delimitato · stima"` — cioè 78,13 px + 14 px di gap spesi su ogni velivolo senza prenotazioni, che sono esattamente i 92,13 px che spingono il CTA sotto il fold. AC 1(f) dice che «zero è un risultato», il che riguarda la funzione di dominio; **non** obbliga a spendere il box.

**Rimedio suggerito**: o si dichiara il fold a 1280 e lo si accetta (aggiornando §C), o si compatta l'anteprima (una riga sola quando il totale è 0), o si sposta il box sotto il submit. Ricadrebbe comunque sotto AC 14: serve la misura, non un giudizio.

---

### MINOR-2 (decisione PO) — Il link del banner non è filtrato per velivolo, e non è nemmeno negli AC

**File**: `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx:931-933` — `href={/${locale}/dashboard/bookings?status=PENDING,APPROVED}`.

- La **motivazione misurata** della deviazione 1 (§H) **regge**: `bookings/page.tsx:37` dichiara `searchParams: { page?, view?, date?, status? }` e non un `aircraftId`; il filtro velivolo della timeline è stato client. Aggiungere `?aircraftId` sarebbe un contratto d'URL nuovo su una pagina fuori dal blast radius di §3.
- Il link **funziona**: navigato dal vivo, `/it/dashboard/bookings?status=PENDING,APPROVED` risponde 200 (h1 «Pianificazione», 40 righe in lista, i chip di stato riflettono il filtro, nessuna error boundary).
- **Ma**: (i) AC 5 di questa story **non menziona alcun link** — è un'aggiunta non richiesta (karpathy §3: ogni riga riconducibile alla richiesta); (ii) il testo dell'opzione A del doc base, che la decisione «C = A + B» incorpora, diceva «banner persistente … **con link alla lista prenotazioni filtrata**». Il link consegnato porta a **tutte** le prenotazioni PENDING/APPROVED dell'aviosuperficie, non a quelle del velivolo di cui il banner parla.

**Da sottoporre al PO**: (a) accettare così com'è e scriverlo nel Review Record; (b) togliere il link (e con esso la regola CSS `.alert-box a`, che senza link non serve a nessuno); (c) aprire una story per `?aircraftId` su `/dashboard/bookings`. Non è materia da decidere in review.

---

### LOW-1 — Conteggio unit sbagliato nel record
§L dichiara `templates.test.ts` **22 passed**; misurato in shell pulita: **19 passed** (16 preesistenti + 3 nuovi, coerente con §J). Il totale dei gate (1819) è invece esatto.

### LOW-2 — Il messaggio del commit `ea54b3f` dice «in catena serializzata»
Il messaggio del commit chiude con «e2e Mailpit filtrato per destinatario univoco della fixture **in catena serializzata**». Non è vero e per fortuna: `aog-impact-email.spec.ts` vive nel project `chromium` `fullyParallel`, `playwright.config.ts` non è toccato, e §E motiva correttamente la scelta. Verificato: la catena (`settings → booking-window → reports → treasury-settings → billing-global → mobile-metar → mobile-overview-overflow → mobile-membership-fee → mobile-settings → aog-overview-count`) non contiene lo spec nuovo. Il **record** è giusto, il **messaggio di commit** no.

### LOW-3 — L'email di un titolare con più prenotazioni impattate nomina solo la prima, e nessun test lo verifica
Dichiarato in §G-4 e coperto lato unit sul **numero di invii** (`sends ONE email per HOLDER`), non sul **testo**. Il corpo dice «La tua **prima** prenotazione interessata», che è onesto, ma il destinatario non sa quante altre ne ha nel fermo mentre il banner dell'admin conta per prenotazione. Osservazione, non difetto: nessuna azione richiesta se il PO conferma §G-4.

### LOW-4 — `role="status"` sull'anteprima si ri-annuncia a ogni ricalcolo
`aircraft-editor.tsx:959` — il box è `aria-live=polite` e cambia mentre l'admin digita la data (una volta per debounce). Corretto per AC 2 («il numero si ricalcola»), ma è un contenuto vivo dentro un dialogo: se il PO vuole limitare la verbosità, `aria-live` solo sul totale è l'alternativa. Nessuna evidenza di danno; lo registro perché la scelta è deliberata (§G-8) e va ratificata o dimenticata consapevolmente.

---

## 3. Che cosa ho verificato e ho trovato CORRETTO (prove)

### 3.1 La funzione di dominio è UNA
`grep` su tutto `src/`: `computeAogImpact` ha **2 call-site di produzione** — `aircraft.service.ts:476` (dentro la transazione del grounding) e `:509` (anteprima). Nessun altro `booking.count/findMany/aggregate` su `aircraftId` esiste fuori da `bookings.service.ts` (liste, non conteggi d'impatto). La riga persistente e il banner **non** hanno un secondo percorso: la riga passa dallo stesso `GET /out-of-service-impact`.

### 3.2 Le frontiere della finestra, provate sul DB reale (fixture INSERITE via psql per avere gli istanti esatti)
Fixture su velivolo proprio, `until` = +10 giorni (agosto, CEST = UTC+2):

| booking | istante | atteso | esito |
|---|---|---|---|
| `dayBefore` | U-1 10:00Z | dentro | dentro |
| `onUntilLate` | U 21:59Z = **23:59 Roma di U** | dentro (INCLUSIVA) | **dentro** |
| `afterMidnight` | U 22:00Z = **00:00 Roma di U+1** | fuori | **fuori** |
| `inProgress` | now-1h, finisce fra 2h | fuori (già iniziata) | fuori |
| `cancelled`/`denied`/`flown`/`noshow` | dentro finestra | mai contate | mai contate |
| `pendingIn` | U-4 | `pending` | `pending` |
| `far` | +40 | fuori con `until`, dentro senza | esattamente così |

```
preview(until=U)     -> {"pending":1,"approved":2}
preview(no until)    -> {"pending":1,"approved":4}
preview(until=U+1)   -> {"pending":1,"approved":3}
preview(until=oggi)  -> {"pending":0,"approved":0}
preview(until=2026-13-45) -> 422 VALIDATION_ERROR {"until":["Invalid ISO date"]}
preview(until=)      -> 422 (la UI non manda mai il parametro vuoto: `impactUntil===null` omette la query)
preview(aircraft inesistente) -> 404 NOT_FOUND
```
La semantica inclusiva R-AOG-a regge **al minuto** sul bordo DST-aware, e non solo negli unit con il fake client.

### 3.3 La transazione, la guardia atomica e la corsa
- Due `POST /out-of-service` **concorrenti** sullo stesso velivolo: `[200, 409]`, `statusReason` = quello del vincitore («race-1»). Il `ConflictError` lanciato **dentro** `$transaction` risale intatto come 409 (non un 500) sul Prisma reale, non solo sul mock.
- 409 su velivolo già AOG: **nessun conteggio, nessuna email** — il numero di messaggi al titolare è rimasto identico (1 → 1). Il fan-out è quindi davvero **post-COMMIT** e non post-tentativo.
- La `where` guardata e il `data` sono asseriti **esatti** in unit (`aircraft.service.test.ts`), mai rilassati a `objectContaining`; l'ordine `['tx-start','updateMany','booking.findMany','tx-end']` prova il ricalcolo **dentro** la transazione, `['tx-start','tx-end','send']` prova l'invio **fuori e dopo**.
- Il diff di `setOutOfService` è re-indentazione + `tx.` : la `where`, il `ConflictError` e la rilettura sono gli stessi di 1a (AD-8 rispettato).

### 3.4 Il contratto e i suoi consumatori
- `git diff --name-only 7f0a2fb ea54b3f` = **17 file**, esattamente quelli di §J. **NON toccati**, verificato: `bookings.service.ts`, `flights.service.ts`, `aircraft-status.ts`, `prisma/schema.prisma`, `fleet-card.tsx`, `fleet-console.tsx`, `dashboard/page.tsx`, `dashboard/bookings/**`, `mobile-agenda.ts`, `exports.service.ts`, `date-only.ts`, le primitive UI, **`out-of-service/route.ts`**, `aog-overview-count.spec.ts`, **`playwright.config.ts`**. In `airops.css` il diff è **solo additivo** (zero righe rimosse): la regola (10) di 1a è byte-identica.
- Consumatori della response cambiata: cercati tutti. `bookings.spec.ts:470`, `mobile-planning.spec.ts:291`, `mobile-registries.spec.ts:300`, `aog-overview-count.spec.ts:86` leggono **solo lo status** e non si accorgono di nulla; l'unico che leggeva il corpo era l'helper `ground()` di 1a, adattato (3 righe, nessuna asserzione indebolita).
- OpenAPI **generato** (letto, non dedotto): 84 path, `/api/v1/aircraft/{id}/out-of-service-impact` **registrato** (parametro `until` `{"type":"string","format":"date"}` non required; 200/401/403/404/422); la 200 di `out-of-service` è ora `required:["aircraft","impactedBookings"]` con `aircraft.outOfServiceUntil: {"type":["string","null"],"format":"date"}` ancora al suo posto; schemi `AogBookingImpact` e `SetOutOfServiceResponse` presenti. (Nota: `registry.test.ts` non elenca la rotta nuova, ma non elenca nemmeno altre 6 rotte esistenti — la lista non è mantenuta esaustiva, quindi non è un difetto di questa story.)

### 3.5 RBAC, matrice completa
```
anon        GET  out-of-service-impact -> 401 UNAUTHENTICATED
anon        POST out-of-service        -> 401 UNAUTHENTICATED
admin       GET  impact -> 200 {"pending":0,"approved":0}   POST -> 409 (velivolo già AOG: auth superata)
istruttore  GET  impact -> 403 "Actor lacks required permission: aircraft.manage"   POST -> 403
pilota      GET  impact -> 403                                                       POST -> 403
allievo     GET  impact -> 403                                                       POST -> 403
```
L'anteprima è gated **come la scrittura che precede** (AD-2), e non restituisce mai la lista dei titolari: solo i due interi.

### 3.6 L'email (R-AOG-i), dal vivo
- **Solo le APPROVED**: 4 impattate su 2 titolari → **2 email** (una per titolare); il titolare della PENDING, che **ha** un'email a fascicolo, non ha ricevuto nulla (`[]` in Mailpit filtrato per il suo indirizzo run-unique).
- **Locale del destinatario**: l'e2e della story lo asserisce su un `User.locale='en'` esplicito e sul fallback `it` senza `User`; le mie prove hanno confermato l'italiano per persone senza utente.
- **Best-effort REALE**: `docker compose stop mailpit`, poi grounding → **200 in 28 ms**, riga scritta (`OUT_OF_SERVICE|SMTP down probe`), conteggio nella response (`{"pending":0,"approved":1}`). Mailpit riavviato subito dopo. D3-bis non è una dichiarazione: è vero.
- **Nessuna email al rientro**: `POST /return-to-service` → 200, casella del titolare invariata (1 → 1).
- **Nessuna email sul 409** (v. 3.3).

### 3.7 Il doppio passo e l'anteprima (le parti che funzionano)
- **Il debounce non perde l'ultima digitazione**: digitando una data intera nel controllo nativo parte **UNA** sola richiesta, e la query è quella finale (`["until=2026-08-17"]`), col numero corretto a schermo. La misura 4→1 di §B è riproducibile.
- **Annullare non scrive**: verificato sul DB dall'e2e (`GET /api/v1/aircraft/{id}` → OPERATIONAL) e da me nella prima prova di doppio click (fallita perché il bottone era clippato: lo stato è rimasto OPERATIONAL).
- **Anteprima senza data**: «rientro da definire: conteggio non delimitato · stima», in IT e EN.
- **La UI non promette che i due numeri coincidano**: l'anteprima porta «· stima», il banner no. TOCTOU accettato e dichiarato.
- **`confirmReturnToService` resta morta** e il rientro NON ha preso un secondo passo: i due spec citati (`aircraft-status-hours.spec.ts:74`, `aircraft-out-of-service-until.spec.ts:205`) non sono stati toccati in quel punto; le uniche modifiche sono **+1 click** dopo il submit, nessuna asserzione rimossa o indebolita (lezione 14.6 rispettata).

### 3.8 Il costo del fan-out (AC 13 / TD)
Riprodotto **indipendentemente** dal dev, stessa macchina, build di produzione:
```
grounding con  0 destinatari: 200 in   27 ms
grounding con 21 destinatari: 200 in 1517 ms   (impactedBookings {"pending":0,"approved":21})
-> ~71 ms/destinatario contro Mailpit LOCALE
```
Il dev dichiara 1615/16/~76: **la misura è onesta**. E sì, il fan-out è **dentro la richiesta**: `aircraft.service.ts:481` fa `await sendAircraftGroundedEmails(...)` **prima** del `return`, quindi il banner arriva dopo il fan-out. Con un SMTP remoto il tempo scala col RTT. È esattamente ciò che il TD di §I dice; nessun cap/coda/batching introdotto (AC 13, karpathy §2). **Il TD va registrato in `sprint-status.yaml`** dalla sessione principale.

### 3.9 Invariante [a], censimento rifatto da me
`grep -rn 'outOfServiceUntil' src/ prisma/schema.prisma`: le 4 voci nuove di 1b sono `aircraft.service.ts:476` (limite della finestra), `:571` (parametro del messaggio), `templates.ts:369/375` (frase del messaggio), `aog-impact.ts` (solo doc-comment). **Zero** occorrenze in una `where` che selezioni velivoli per stato, in un `if` che decida se un velivolo vola, in un job o in un cron. Un velivolo con `outOfServiceUntil` = ieri è rimasto `OUT_OF_SERVICE` in ogni lettura fatta (API e DB).

### 3.10 i18n e contrasti, rimisurati
- **Parità 0/0** su **1978** chiavi per file (script di flatten sui due JSON): 0 solo-IT, 0 solo-EN.
- `t()` vs `t.raw`: `t.raw` su **tutte e sole** le stringhe con segnaposto client-side (`impact*Many`, `impactSplit`, `impactWindowUntil`); `t()` sulle altre. Corretto.
- **Contrasti** (canvas → sRGB → WCAG, sfondo effettivo risalendo gli antenati, `getClientRects().length>0`, cascata reale; i colori computati sono `lab(...)` e vanno passati per il canvas — un parser `rgb()` ingenuo qui fallisce):

| Testo | chiaro | scuro | dichiarato |
|---|---|---|---|
| `aog-impact-preview` | **8,46** | **8,79** | 8,46 / 8,79 ✔ |
| `aog-impact-banner` | **8,38** | **7,46** | 8,38 / 7,46 ✔ |
| `aog-impact-bookings-link` | **8,38** | **7,46** | idem, e `color` **identico** a quello del box ✔ |
| `aog-impact-row` | **4,85** | **5,72** | 4,85 / 5,72 ✔ |

- **Geometria**, rimisurata: `out-of-service-submit` **479×34,84 a 1280** e **335×44 a 375** — invariato al centesimo rispetto a 1a; `aog-impact-preview` 479/335 × **78,125**; `aog-impact-banner` × **101,5**; `aog-impact-row` × **17,39**; `out-of-service-confirm` **82,30×34,84** a 1280 e **82,30×44** a 375; `out-of-service-cancel` **67,98×44** a 375; `[role=dialog]` e `.so-body` invariati (519×756,39 e 375×659,23); overflow-X **0**.
- Nessun `var(--bad)`/`var(--ok)` inline nuovo (diff pulito); la regola `.alert-box a` non tocca nessun'altra superficie: **nessuno** degli altri 6 usi di `.alert-box` contiene un `<a>` (il link «Vai al login» di `set-password-form.tsx` è FUORI dal box).

### 3.11 Convenzioni e2e
- Testid nuovi (`aog-impact-preview|banner|row|bookings-link`, `out-of-service-confirm|cancel`): `grep -rn 'data-testid\^=' e2e/` non ha alcun prefisso che li copra; ognuno è **un solo nodo DOM** a tutte le larghezze.
- Lo spec nuovo crea **il proprio** velivolo, le proprie persone e le proprie prenotazioni; filtra Mailpit per `to:<indirizzo run-unique>` **+ subject esatto** (necessario: la fixture DENIED produce «Prenotazione rifiutata: <marca>» allo **stesso** destinatario); nessun aggregato globale, nessun `messages[0]`, nessun `hasText` con date; date tutte relative.

---

## 4. Stato della macchina alla chiusura

- **Porta 3000: LIBERA** (server di probe costruito una volta, riusato per tutte le prove, ucciso prima di `npm run gates` e prima di chiudere).
- **Mailpit: RIAVVIATO e funzionante** (`docker compose ps` → running; API 8025 risponde). ⚠️ **Il riavvio ha svuotato la casella** (Mailpit qui è in memoria): i messaggi della suite arbitro non sono più leggibili. Nessuna conseguenza sui test — la suite era già finita — ma va saputo se qualcuno cercasse quei messaggi.
- **Postgres: in piedi**, DB **NON** resettato dopo l'arbitro. Stato: 214 velivoli / 26 AOG / 14 con data / 140 prenotazioni / 400 persone.
- **Residui delle mie probe, dichiarati**: 20 velivoli run-unique (`model` in `Review probe, Race, UI probe, Geom probe, Fold probe, Arm probe, Fanout, Smtp probe, Misc probe, Arc probe, Past probe`), di cui **10 lasciati OUT_OF_SERVICE**; ~35 prenotazioni con `id` prefisso `rvw_/ui_/fan_/smtp_/en_/past_`; 5 persone `rvw-*`/`uip-*`/`past-*`. **Nessun attore di seed e nessun `AppSettings` globale è stato modificato**; nessun file toccato; nessun commit.
- Prossima suite: conviene resettare il DB (`docker compose down -v` + migrate + seed) prima di misurare di nuovo aggregati globali.

---

## 5. Decisioni PO da sottoporre

1. **MAJOR-1** — quale frase mostra la UI (e dice l'email) quando il bound del fermo è **già passato**: riuso di `impactWindowUndelimited` (zero chiavi nuove, ma dice «rientro da definire» quando una data c'è) **oppure** una frase nuova dedicata (2 chiavi ×2 locale). E se la finestra effettiva deve **uscire dalla funzione di dominio** nel DTO (raccomandato: è l'unica forma che rispetta AD-1) o essere ricalcolata nel client con la stessa regola.
2. **MAJOR-2** — come si chiude il bypass del doppio passo: domanda davanti alla coppia (idioma Archivio **completo**, 2 chiavi ×2 locale) / inversione dell'ordine dei due bottoni / guardia temporale. La prima chiude anche il caso «anteprima assente».
3. **MINOR-1** — il fold a 1280: accettare e **dichiarare** (aggiornando §C), oppure compattare l'anteprima quando il totale è 0.
4. **MINOR-2** — il link del banner: accettarlo non filtrato / rimuoverlo / aprire una story per `?aircraftId` su `/dashboard/bookings`.
5. **TD da registrare** (non un finding, un'azione): il costo del fan-out in-request — **1517 ms misurati da me con 21 destinatari** contro 27 ms a zero — va in `sprint-status.yaml` come dichiarato in §I.
