---
baseline_commit: b5a2c93
---

# Story AOG-1a: `outOfServiceUntil` — il campo, il suo ciclo di vita, le due superfici ratificate e la guardia sulla registrazione del volo

Status: **review** — implementata 2026-08-07 (dev Opus 5 xhigh); Dev Agent Record in coda. *(Nessuna chiave `aog-1a` esiste in `sprint-status.yaml`: il tracking di questa story vive nello story file — verificato, non assunto.)*

> **Da leggere PRIMA di scrivere una riga**: `_bmad-output/implementation-artifacts/aog-1-velivolo-fuori-servizio.md` **per intero** — è la ricognizione **misurata** su questo stesso baseline (`b5a2c93`): §1 le misure a runtime, §1.4 il probe che prova l'assenza della guardia volo, §2 il censimento delle **15** superfici, §5 il blast radius file-per-file, §7 le dieci domande **con la riga DECISIONE PO**. Questo file è il **perimetro implementabile**; quel file è il **record storico delle misure**. Dove i due divergono (Q1 semantica inclusiva, Q5 perimetro custom), **vince questo file**.
>
> Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md` (chirurgia, niente speculativo, criteri verificabili), `design-taste-frontend`, `ui-ux-pro-max` — la story tocca UI.

---

## Story

As **l'amministratore che mette un velivolo in AOG**, e come **l'operatore che registra un volo**,

I want poter scrivere **quando conto di riavere il velivolo**, vedere quella data **là dove serve a decidere** (l'editor che la scrive, e i 422 che fermano chi prova a prenotare o a volare), e che **la registrazione di un volo su un aeromobile fermo venga fermata** — con una via d'uscita motivata per l'admin quando il volo da registrare è proprio quello che ha causato il fermo,

so that l'AOG smetta di essere una riga di database che nessuno difende: oggi un volo su un velivolo fuori servizio si registra **senza il minimo ostacolo** (provato a runtime, doc base §1.4: la sola cosa che lo ferma è la data del volo), e la domanda «e quando torna?» ha risposta solo se qualcuno l'ha scritta nel testo libero di `statusReason`.

### Il difetto, misurato (non dedotto)

```
POST /api/v1/flights {aircraftId: <AOG>, takeoffAt: 2031-05-04T09:00Z, …}
→ 422 FLIGHT_DATE_IN_FUTURE          ← la guardia AOG non esiste: passa tutte le guardie di stato

POST /api/v1/bookings {aircraftId: <AOG>, startsAt: 2031-05-04T09:00Z, …}
→ 422 AIRCRAFT_OUT_OF_SERVICE        ← controprova sullo stesso velivolo, stesso istante
```

`flights.service.ts:496-499` seleziona `{ id, registration, archivedAt }`: **`status` non viene nemmeno letto**. `grep -rn AIRCRAFT_OUT_OF_SERVICE src/server/services/` dà **tre** occorrenze, tutte in `bookings.service.ts` (`:555`, `:926`, `:1155`), **zero** in `flights.service.ts`.

---

## §0 — Requisiti FISSI (contratto: action item PO + ratifiche 2026-08-07)

**Non sono assunzioni.** Un dev che ne trova uno scomodo lo **dichiara nel record**; non lo reinterpreta.

| # | Requisito (action item, `sprint-status.yaml:476`) |
|---|---|
| **P2** | Serve una **guardia sulla REGISTRAZIONE DEL VOLO** per un velivolo fuori servizio. |
| **P3** | `outOfServiceUntil DateTime?` su `Aircraft` — data di rientro **OPZIONALE e INFORMATIVA**, con lo **stesso ciclo di vita di `statusReason`** (scritta col motivo, azzerata al rientro, regola **nel service**, mai a livello DB). |

*(P1 — «X prenotazioni impattate subito visivo» — è il contratto di **AOG-1b**, non di questa story.)*

| # | Invariante |
|---|---|
| **[a]** | **La data non rimette MAI il velivolo in servizio da sola.** Il rientro resta `returnToService` esplicito. Nessun job, nessun cron, nessuna `where` che «filtri via» un AOG scaduto. |
| **[b]** | **Il campo è OPZIONALE.** `null` significa «rientro da definire» ed è uno stato legittimo, non un dato mancante da riempire. |

### Ratifiche PO del 2026-08-07 che vincolano QUESTA story

| R | Q | Decisione | Effetto vincolante qui |
|---|---|---|---|
| **R-AOG-a** | Q1 | **A — semantica INCLUSIVA** (contro la raccomandazione B): `outOfServiceUntil` = **ultimo giorno FERMO**; finestra `[ora, fine giornata di until]`; etichetta **«Fermo fino al {data} compreso»** | La semantica si scrive **una volta** nel doc-comment Prisma (AC 1) e si riusa **identica** in service, i18n e messaggi 422. Il **nome** del campo non cambia (P3). |
| **R-AOG-c** | Q3 | **B — blocco 422 + deroga admin motivata** sul modello 14.4; **un solo `force`** per entrambi i blocchi; `flights.forceExpiry` **non si rinomina** | AC 8-11. |
| **R-AOG-d** | Q4 | **B — il picker del form volo nomina l'AOG e l'opzione resta SELEZIONABILE** | AC 12. |
| **R-AOG-e** | Q5 + Q5-bis | **Perimetro CUSTOM, più stretto di tutte e quattro le opzioni**: la data affiora **SOLO** nell'**editor Disponibilità** e nei **tre messaggi 422** (prenotazione, spostamento, **volo**). Tutte le altre superfici del censimento **invariate quanto alla data**; badge e motivo esistenti **restano come oggi** | AC 5, 7, 14. **Cancella** gli AC-9/AC-10 del doc base. |
| **R-AOG-f** | Q6 | **A — il conteggio AOG della Panoramica si fixa qui** riusando `listOutOfServiceAircraft` | AC 13. |
| **R-AOG-g** | Q7 | **A — `out-of-service-submit` ≥44px SOLO a ≤640**, desktop identico al centesimo, misura pre/post nel record | AC 6. |
| **R-AOG-h** | Q8 | **A — `date-only.ts` NON si tocca**; l'eredità del TD 14.8 F6 si **dichiara** | AC 15. |
| **R-AOG-j** | Q10 | **A — split**: 1a e 1b, dev **Opus 5 xhigh**, review adversarial **Opus 5 xhigh** ciascuna | Vedi §6: cosa NON è di questa story. |

*(R-AOG-b (Q2) e R-AOG-i (Q9) governano **AOG-1b**: anteprima, doppio passo, conteggio in transazione, banner, email. Qui sono **fuori scope dichiarato**.)*

---

## §1 — Decisioni architetturali (vincoli tecnici; le AD del doc base, adattate al perimetro ratificato)

**AD-1 (doc base AD-1, riscritta su R-AOG-a) — `outOfServiceUntil` è un `DateTime? @db.Date`, e la semantica inclusiva vive nel doc-comment.**
Migrazione **additiva**, nessun backfill: ogni riga esistente parte `NULL`, che è esattamente «rientro da definire». `@db.Date` perché il dominio è **un giorno di calendario** e il repo ha già l'infrastruttura (`src/lib/date-only.ts`: `parseDateOnlyUtc`, `toDateOnlyString`, `todayDateOnlyUtc`, con la lezione review 3.5 F1 nel doc-comment — *una colonna `@db.Date` si confronta come data di calendario, mai come timestamp*). Il doc-comment è **la fonte unica** della semantica inclusiva; ogni altro punto (service, i18n, 422, e — in 1b — il conteggio) **cita** quella regola, non la reinterpreta.

**AD-2 (doc base AD-2) — Il ciclo di vita sta nel service, e la guardia atomica resta INTATTA.**
`setOutOfService` (`aircraft.service.ts:393-416`): la `updateMany` guardata mantiene la `where` **identica** (`{ id, status: 'OPERATIONAL' }`, review 2.2 F1 — due chiamate concorrenti non possono vincere entrambe) e aggiunge **una** chiave nel `data`. `returnToService` (`:423-438`): `data: { status: 'OPERATIONAL', statusReason: null, outOfServiceUntil: null }` — l'azzeramento è **nella stessa istruzione** dello `statusReason`, così non esistono due percorsi che possano divergere; il doc-comment `:418-422` (*«a stale reason … must never linger»*) diventa la spiegazione di **entrambi** i campi.
**Invariante [a] garantita per costruzione**: il campo è letto solo per **mostrare**, mai per decidere se un velivolo vola.

**AD-3 (doc base AD-3, ristretta da R-AOG-e) — Il 422 arricchito: `details` uniforme, testo UI solo dove il PO l'ha chiesto.**
- **Contratto** (uniforme, additivo): i tre `ValidationError` di `bookings.service.ts` (`:555`, `:925`, `:1154`) e il **nuovo** del volo portano `details: { reason, outOfServiceUntil }` (ISO date o `null`). Uniforme perché è **lo stesso errore di dominio** e l'API è consumata anche dalla futura app Flutter: tre forme diverse per lo stesso codice sarebbero il difetto, non l'economia. `details` è additivo — ogni consumer ignora i campi che non conosce.
- **Messaggio del server**: **INVARIATO** («Aircraft is out of service: {reason}.»). Non è una superficie utente: la stringa che l'utente legge è costruita client-side dalle label. Cambiarla romperebbe spec esistenti senza guadagno.
- **Testo UI**: la clausola inclusiva compare **solo** nei **tre** messaggi nominati dal PO — **creazione** prenotazione (`new-booking-form.tsx:304-305`), **spostamento** (`edit-booking-form.tsx:167-168`), **volo** (nuovo). ⚠️ Il quarto percorso, l'**approvazione** (`booking-transition.ts:33,56-57`), **resta il testo di oggi**: non è fra i tre nominati e Q5 dice «tutte le altre invariate». *(Divergenza consapevole fra contratto e UI, dichiarata: se il PO la vuole chiudere basta una label, ma non è ratificata.)*
- **Quando `outOfServiceUntil` è `null`** la stringa UI è **byte-identica a quella di oggi** in entrambi i locale. Non «rientro da definire», non un `—`: **niente**. Motivo doppio: (i) l'assenza di clausola non è ambigua perché non nomina un posto vuoto; (ii) protegge gli spec esistenti che asseriscono quelle stringhe (AC 7 chiede l'elenco).
- Precedente: **R-15.4-g** — un 422 deve **dire** all'utente il vincolo che ha incontrato, in **entrambi i locale**, su **tutti** i percorsi toccati; e cambiare un testo anche sul desktop è una deviazione **da dichiarare**, non da nascondere.

**AD-4 (doc base AD-4) — La guardia volo vive in `resolveFlightInput`, accanto ad `AIRCRAFT_ARCHIVED`.**
`resolveFlightInput` (`flights.service.ts:477`) è **condivisa** da `registerFlight` (`:913`) e `correctFlight` (`:1238`): è la ragione per cui la funzione esiste (story 5.3 Task 2) e mettere la guardia lì evita una seconda copia che diverge. Il `select` `:496-499` guadagna `status`, `statusReason`, `outOfServiceUntil`; il check si posiziona **subito dopo** `AIRCRAFT_ARCHIVED` (`:520-521`), così l'ordine documentato a `:413-417` (*existence 404 → state 422 → domain 422*) resta quello — e il probe di §1.4 diventa **rosso** (pre-fix `FLIGHT_DATE_IN_FUTURE`, post-fix `AIRCRAFT_OUT_OF_SERVICE`): **la discriminanza del fix è già scritta**.

| Percorso | Guardia | Perché |
|---|---|---|
| `registerFlight` | **SÌ** | è P2 |
| `correctFlight` che **CAMBIA** velivolo verso un AOG | **SÌ** | è una registrazione nuova su quel velivolo |
| `correctFlight` a velivolo **INVARIATO** | **NO** | R-14.4-b/R-14.3-a: correggere non è registrare da capo. Bloccare la correzione delle *note* di un volo storico perché il velivolo è fermo **oggi** è il vicolo cieco che la 14.4 ha già dovuto chiudere |
| `cancelFlight` | **MAI** | uno storno deve sempre potersi fare |

**AD-5 (doc base AD-5) — La guardia NON può essere datata, ed è per questo che la deroga esiste.**
`Aircraft` **non ha** una data di inizio AOG: le colonne sono `status`, `statusReason` e (nuova) `outOfServiceUntil`; `updatedAt` cambia a **ogni** update (anche `adjustHourMeter`) ed è inservibile come «messo a terra il». La guardia guarda **solo lo stato corrente**. Conseguenza concreta: *velivolo rientra con un atterraggio duro → AOG immediato → il volo di stamattina, quello che l'ha causato, non si registra più*. Aggiungere `groundedAt` sarebbe **fuori contratto** (P3 nomina un campo solo) e speculativo: **non si fa, si dichiara**. La via d'uscita è la deroga (AD-6).

**AD-6 (doc base AD-6, ratificata R-AOG-c) — La deroga riusa l'impianto 14.4 per intero.**

| Pezzo | Esiste già | Dove |
|---|---|---|
| `force` + `forceReason` nel body (`forceReason` obbligatorio quando `force: true`) | **SÌ** | `schemas/flights.ts:110-119` |
| Permesso ADMIN-only, controllato **per PRIMO, prima di ogni query** | **SÌ** | `flights.forceExpiry` (`rbac.ts:58,75`), `flights.service.ts:492-494` |
| Colonne `forcedAt`/`forcedByUserId`/`forceReason` su `Flight` | **SÌ** | migrazione `20260729092054_flight_expiry_block_force` |
| Propagazione dello stamp | **SÌ** | `forceStamp` in `ResolvedFlightInput:364` → `registerFlightCore:771,805` |
| Masking del motivo ai non-`flights.manage` | **SÌ** | R-14.4-c, `toListItem:313-318` |
| Badge «Deroga» nel registro | **SÌ** | `logbook-console.tsx:365-378` |
| Sezione «Forza registrazione» nel form | **SÌ ma gated** su `blockedDocuments` | `flight-editor.tsx:952-1000`, gate a `:953` — serve un **secondo innesco** per il ramo AOG |

Costo reale ≈ **una condizione in più su `forceStamp`**, **un secondo innesco nel form**, **due stringhe i18n**. Nome: `flights.forceExpiry` diventa stretto per una deroga che copre due blocchi — **non si rinomina** (precedente F3 della 14.4 su `blocksBooking`: rinominare toccava UI/i18n/test senza cambiare la semantica): si aggiorna il **doc-comment**, non l'identificatore.
⚠️ **Da MISURARE, non assumere** (AC 10 d): se il percorso `correctFlight` **non** accetta oggi `force`/`forceReason`, la guardia su «correzione che cambia velivolo» diventa un **vicolo cieco** — il dev lo misura, e o estende il force lì in modo minimo, o **dichiara** il vicolo cieco con la misura. Silenzio = finding.

**AD-7 (doc base AD-7) — Rapporto col TD 14.9 F11 (422-prima-di-403): dichiarato, non toccato.**
Il TD dice che `/api/v1/stats` e `/api/v1/cash-report` rispondono 422 (Zod) prima del 403. Il 422 nuovo di questa story **non tocca quella convenzione**: `AIRCRAFT_OUT_OF_SERVICE` sul percorso volo nasce **dentro il service**, **dopo** `authorize(actor, 'flights.manage')` e dopo il 403 di `flights.forceExpiry` (`:492-494`) — un attore senza permesso prende **403 e non lo vede mai**. Stessa posizione dei tre 422 gemelli delle prenotazioni. **Va scritto nel Dev Agent Record**, non fixato qui.

**AD-8 (doc base AD-8) — OpenAPI nello stesso commit, sempre.**
`POST /api/v1/aircraft/{id}/out-of-service`: rotta `src/app/api/v1/aircraft/[id]/out-of-service/route.ts` + `registry.ts:263` (`SetOutOfServiceRequest`) + `registry.ts:1097-1109` (path). Il **body cambia** (campo nuovo) ⇒ registry aggiornato **nello stesso commit**. **Lezione 15.9**: `registry.test.ts` usa `expect.arrayContaining` e quindi **non segnala** uno schema o una rotta mancante (è già il contenuto dell'action item «F5 review 12.11: 8 route non registrate» — questa voce non diventa la nona). Vale anche per `aircraftListItemSchema` (`schemas/aircraft.ts:172-186`).

**AD-9 (NUOVA — nasce dalla guardia atomica + R-AOG-e) — La data si scrive AL MOMENTO DEL FERMO; non esiste un percorso per modificarla dopo.**
Fatto: `setOutOfService` è guardata `where: { id, status: 'OPERATIONAL' }` ⇒ chiamarla su un velivolo **già AOG** dà `ConflictError` (409). Quindi, con il perimetro ratificato, **la data si scrive solo insieme al motivo**, al momento del grounding; per cambiarla oggi bisognerebbe rientrare e rifermare.
Conseguenze **vincolanti**:
1. **Non si tocca** la `where` guardata e **non si inventa** un percorso di update: sarebbe capacità non richiesta (karpathy §2) e toccherebbe la disciplina di concorrenza della review 2.2 F1.
2. **Nessun controllo che 409 sempre**: il campo data **non deve comparire abilitato** dove non può essere scritto (velivolo già AOG). Un controllo che porta sempre a un errore è un **vicolo cieco** (lezione 14.6 F2). Il dev **misura** cosa rende oggi la sezione Disponibilità per un velivolo `OPERATIONAL` e per uno già `OUT_OF_SERVICE`, e riporta le due facce.
3. La limitazione va **DICHIARATA** nel Dev Agent Record e in `sprint-status.yaml` come TD nuovo («la data di rientro non è modificabile senza rientro in servizio — serve una ratifica PO per aprire un percorso»).

---

## §2 — Acceptance Criteria

> Ogni AC che dice **«misurato»** richiede **un numero** nel Dev Agent Record, non un'affermazione. Ogni AC che dice **«discriminante»** richiede la prova che il test è **rosso sul pre-fix**, col repo **ripristinato byte-identico** dopo (lezione 13.7/15.10). Le misure UI si intendono a **1280×900** e **375×812**, in **tema chiaro e scuro**, nei **due locale**.

### Schema e ciclo di vita

**AC 1 — Il campo esiste, additivo, con la semantica R-AOG-a scritta una volta sola.**
`Aircraft.outOfServiceUntil DateTime? @db.Date` via **migrazione additiva** (`npx prisma migrate dev` **e** `npx prisma generate` — `npm run gates` **non** cattura un client Prisma stantio, lezione 14.4). Riportato nel record: `SELECT count(*) FROM "Aircraft" WHERE "outOfServiceUntil" IS NOT NULL` = **0** subito dopo la migrazione. Il doc-comment Prisma dichiara: (i) **ultimo giorno FERMO, inclusivo**, finestra `[ora, fine giornata di until]`; (ii) **informativo** — non rimette in servizio da solo (invariante [a]); (iii) **stesso ciclo di vita di `statusReason`**, applicato in `aircraft.service.ts`, **non** a livello DB; (iv) **opzionale** — `null` = «rientro da definire» (invariante [b]).

**AC 2 — Invariante [a], BLOCCANTE. Tre prove, tutte e tre.**
(a) **unit**: un velivolo `OUT_OF_SERVICE` con `outOfServiceUntil` **nel passato** resta AOG — `getAircraft`/`listAircraft`/`listOutOfServiceAircraft` lo restituiscono ancora AOG, `createBooking` su di esso risponde ancora **422 `AIRCRAFT_OUT_OF_SERVICE`**;
(b) **statico**: `grep -rn 'outOfServiceUntil' src/server/` — l'elenco completo delle occorrenze va nel record **classificato una per una** (lettura DTO / visualizzazione / messaggio d'errore), e **nessuna** sta dentro una `where` Prisma, un `if` che decida lo stato, o un job;
(c) **e2e**: un velivolo messo AOG con data **di ieri** è ancora rifiutato dalla creazione prenotazione **e** dalla registrazione volo (AC 8).

**AC 3 — Invariante [b] e azzeramento al rientro.**
`POST /api/v1/aircraft/{id}/out-of-service` **senza** `outOfServiceUntil` risponde **200** e scrive `null` (unit + e2e). `returnToService` azzera `outOfServiceUntil` **insieme** a `statusReason`: unit che asserisce **entrambe** le chiavi nella **stessa** `updateMany`, con la `where` guardata **invariata** — mai indebolito a `objectContaining` (lezione 14.6). Un `outOfServiceUntil` nel **passato** è un input **legittimo** e non viene rifiutato: nessuna validazione «data futura» viene aggiunta (non è ratificata, e invariante [a] la rende semanticamente sbagliata). Dichiarato nel record.

### Contratti

**AC 4 — Il campo viaggia sui contratti, e l'OpenAPI è nello stesso commit.**
`setOutOfServiceSchema` (`schemas/aircraft.ts:90-94`) accetta `outOfServiceUntil` **opzionale** (`z.iso.date()`, coerente con le altre date del repo); la rotta lo passa al service; il DTO lo porta lungo **tutti e quattro** i punti in fila — `AircraftListItem:15-32`, `AIRCRAFT_SELECT:37-50`, `toListItem:54-70`, `aircraftListItemSchema:172-186`; `registry.ts:263` e `:1097-1109` aggiornati **nello stesso commit** (AD-8), con la verifica **esplicita** che il registry descriva il campo nuovo (il test `arrayContaining` **non** lo controlla: la verifica è una lettura riportata nel record).
⚠️ **La forma della RESPONSE di `setOutOfService` NON cambia in questa story**: il DTO col conteggio è di **AOG-1b**. Un dev che la cambia qui rompe la cucitura dello split.

### L'editor Disponibilità (superficie ratificata #1)

**AC 5 — Il campo data e l'etichetta inclusiva vivono nella sezione Disponibilità, e in nessun altro posto.**
Nella sezione **Disponibilità** dell'`AircraftEditor` (`fleet/aircraft-editor.tsx:286`, corpo `AvailabilitySection:690-765`): un campo data reso col **`DateInput` già importato** (`:20`, già usato a `:914` — **zero import nuovi**), etichetta e testo di aiuto nella forma **inclusiva** («fermo fino al … **compreso**»), **opzionale** (submit valido con campo vuoto). La riga «Stato attuale» (`availability-current`) porta la data quando c'è e la dicitura **«rientro da definire»** quando è `null` — **mai** una stringa vuota, mai un `—` ambiguo dove il posto è nominato, mai una data inventata. **IT ed EN insieme** (`messages/it.json` + `messages/en.json`, sempre le due). Misure **pre/post** dell'altezza della sezione e del pannello a **375** e **1280**; contrasto WCAG di **ogni pixel di testo nuovo** calcolato **computazionalmente** (canvas → sRGB → WCAG, lezione 13.9 — mai giudizio visivo) con lo sfondo **effettivo risolto risalendo gli antenati e con la cascata reale** (lezione 15.9: `.fld-error` vinceva su `.stat-tone-bad`), **≥ 4,5:1**, in **entrambi i temi**.
**Vietato aggiungere un 41° `var(--bad)`/`var(--ok)` inline**: quel debito (40 dichiarazioni in 19 file) è un item TD post-epic con ciclo proprio — usare `.alert-box.*` (`airops.css:790-796`) o `.stat-tone-*` (`:737-742`).
**Vincolo AD-9**: il campo non compare abilitato dove la scrittura darebbe 409; le due facce (velivolo `OPERATIONAL` / già `OUT_OF_SERVICE`) sono **misurate e riportate**.

**AC 6 — `out-of-service-submit` a ≥44px, solo sul telefono (R-AOG-g).**
Misura **pre** riportata: **335×34,84** a 375×812, bordo inferiore a y 841 **sotto il fold** (812). Misura **post**: **≥44px a ≤640**. **Desktop identico al centesimo** (misura pre/post a 1280 dello stesso bottone e del pannello). La regola è **ancorata a quel bottone** e vive dentro `@media (max-width: 640px)`: non è uno sweep, non tocca le altre azioni secondarie di sezione (tariffe, contaore, archivio) che **R-15.10-f** ha lasciato dov'erano per decisione. Nessun **altro** controllo nuovo sotto 44px a ≤640.

### I tre messaggi 422 (superficie ratificata #14, ristretta)

**AC 7 — La clausola inclusiva compare esattamente nei tre percorsi nominati, e la stringa senza data è invariata.**
(a) `details` = `{ reason, outOfServiceUntil }` sui tre throw di `bookings.service.ts` (`:555`, `:925`, `:1154`) **e** sul nuovo del volo; il **messaggio del server resta invariato** (AD-3).
(b) UI: **creazione** (`new-booking-form.tsx:304-305`), **spostamento** (`edit-booking-form.tsx:167-168`) e **volo** mostrano «… **fermo fino al {data} compreso**» quando la data c'è, in **IT e EN**, a **375 e 1280**.
(c) Con `outOfServiceUntil = null` le tre stringhe sono **byte-identiche a quelle di oggi**: il dev **enumera** gli spec e le label che le asseriscono (`booking-labels.ts:123,162,223` e gli e2e che le leggono) e riporta l'esito.
(d) Il percorso **approvazione** (`booking-transition.ts:33,56-57`) **non cambia testo**: dichiarato nel record come conseguenza di R-AOG-e, non come dimenticanza.
(e) La data è formattata con il formattatore di date già in uso nella pagina; **nessun** e2e la usa dentro `hasText` per disambiguare una riga (lezione 11.2 — e qui il rischio è massimo perché la story **mette date in pagina**).

### La guardia sul volo (P2)

**AC 8 — Il 422 esiste, ed è DISCRIMINANTE.**
`POST /api/v1/flights` su un velivolo `OUT_OF_SERVICE` risponde **422 `AIRCRAFT_OUT_OF_SERVICE`** con `details.reason` **e** `details.outOfServiceUntil` (ISO date o `null`). **Prova obbligatoria**: il probe del doc base §1.4 (data **futura** su velivolo AOG) risponde `FLIGHT_DATE_IN_FUTURE` **prima** del fix e `AIRCRAFT_OUT_OF_SERVICE` **dopo** — **entrambe** le risposte nel record.

**AC 9 — Il perimetro di AD-4 è provato riga per riga: quattro test, quattro esiti.**
`registerFlight` **bloccato**; `correctFlight` che **cambia** velivolo verso un AOG **bloccato**; `correctFlight` a velivolo **invariato** **NON** bloccato (unit dedicato: una correzione di sole note su un volo storico il cui velivolo è AOG **oggi** passa); `cancelFlight` **mai** bloccato.
⚠️ **Ordine dei 422**: un velivolo AOG **e** archiviato deve dare `AIRCRAFT_ARCHIVED` (stato prima del dominio) — test dedicato.

**AC 10 — La deroga è deliberata, motivata, tracciata, e copre entrambi i blocchi con UN SOLO `force`.**
(a) `force` senza `flights.forceExpiry` → **403 prima di ogni query** (`:492-494`);
(b) `force: true` senza `forceReason` → **422 dallo schema** (`schemas/flights.ts:110-119`, `.refine` incondizionato);
(c) deroga riuscita su un velivolo AOG → `forcedAt`/`forcedByUserId`/`forceReason` sulla riga `Flight` **e** badge «Deroga» nel registro (`logbook-console.tsx:365-378`);
(d) **un solo `force`** copre **entrambi** i blocchi: test con velivolo AOG **+** scadenza bloccante contemporanei ⇒ **una sola** conferma li scavalca entrambi e produce **uno solo** stamp; e il dev **misura e dichiara** se il force raggiunge `correctFlight` (AD-6, ⚠️): estensione minima o vicolo cieco dichiarato, mai silenzio;
(e) `force: true` **senza niente da scavalcare** → **nessuno stamp** (convenzione «scavalcato un blocco, non spuntata una checkbox», `schema.prisma`, `Booking.forcedAt`);
(f) il **doc-comment** di `flights.forceExpiry` (`rbac.ts:58,75`) è aggiornato per dire che copre due blocchi; **l'identificatore no** (R-AOG-c);
(g) ereditato dalla **14.4 F1 (BLOCKER)**: il pannello **rimonta** fra chiusure (`key`) così `pendingForceBody` non sopravvive — verificato **anche** sulla CTA «Pianifica volo» della Panoramica, che è l'altro call-site dello **stesso** `FlightEditor`.

**AC 11 — L'errore arriva all'utente con un nome, e senza vicoli ciechi.**
Dal `FlightEditor` di `/dashboard/logbook` **e** dalla CTA «Pianifica volo» della Panoramica (`dispatch-flight-button.tsx`, **stesso** componente) l'operatore vede un messaggio che **nomina il velivolo, il motivo e — se c'è — il fermo fino al {data} compreso**: **mai** `labels.errors.generic` (che è ciò che si ottiene senza una chiave i18n nuova: `flight-editor.tsx:627-628` fa `knownErrors[code] ?? generic`). La sezione «Forza registrazione» (`:952-1000`, oggi gated su `blockedDocuments` a `:953`) guadagna il **secondo innesco** per il ramo AOG. **Nessun vicolo cieco** (lezione 14.6 F2): se l'attore **non** può derogare, l'affordance **non compare** e il messaggio non promette una via che non esiste. Provato per **entrambi** i call-site, a 375 e 1280.

**AC 12 — Il picker del form volo nomina l'AOG e resta selezionabile (R-AOG-d).**
`aircraftOptions` in **entrambe** le pagine che lo costruiscono (`logbook/page.tsx:124-126`, `dashboard/page.tsx:386` `dispatchAircraftOptions`) porta i campi necessari a comporre il suffisso; il `SearchCombobox` (`flight-editor.tsx:422-427`) rende l'opzione nella **stessa lingua** del form prenotazione — marca, motivo, **«(fuori servizio)»** — e l'opzione **resta selezionabile** (nessun `disabled`, nessuna esclusione dalla lista: la deroga esiste e la correzione di un volo storico su quel velivolo deve restare possibile). **La data NON entra qui** (R-AOG-e). Misurato a 375 e 1280 su entrambi i call-site.

### Il conteggio della Panoramica (R-AOG-f)

**AC 13 — La Panoramica smette di dichiarare un numero falso.**
Pre-fix **misurato**: `/dashboard` dice «**1 AOG**» e `/dashboard/fleet` dice «**3 AOG**», stesso istante, stesso DB (**148 velivoli attivi**), perché `dashboard/page.tsx:327` conta sui **primi 100** (`OPTIONS_PAGE_SIZE`, `:70`) mentre la Flotta usa `listOutOfServiceAircraft` (non paginata, `aircraft.service.ts:211-221`). Post-fix: la Panoramica **riusa `listOutOfServiceAircraft`** e i due numeri coincidono.
**Guardia**: ⚠️ **vietato** asserire per uguaglianza un aggregato **globale** in uno spec `fullyParallel` (review **Billing-2 F4**: flaky 2 run su 2). La guardia di questo AC vive quindi in uno spec **serializzato** (project con `dependencies` in `playwright.config.ts` — **unica fonte di verità** dell'elenco e dell'ordine, non enumerarla altrove: un elenco copiato invecchia, è successo con la 15.8b), e **prima di asserire verifica la propria precondizione**: se al momento del run i velivoli attivi sono **≤ `OPTIONS_PAGE_SIZE`** la guardia **non discrimina** ⇒ lo spec crea lo scarto necessario (riportando quanti ne crea e quanto costa) oppure il dev propone un'alternativa **altrettanto discriminante** e la motiva. **Prova rossa sul pre-fix obbligatoria**: senza, questo AC non è chiuso.

### Perimetro, debito, test

**AC 14 — Le superfici NON toccate sono elencate una per una, con il motivo (R-AOG-e).**
Il record elenca **tutte** le voci del censimento §2 del doc base che **non** cambiano — #2/#3 card flotta desktop e mobile, #4 sheet flotta mobile, #5 testata Flotta, #7 widget Flotta della Panoramica, #8/#9 timeline desktop, #10/#11 agenda mobile e suo sheet, #12/#13 opzioni dei form prenotazione, #15 export Excel — ciascuna col motivo **«decisione PO R-AOG-e»**, mai «le altre restano com'erano». **Badge e motivo esistenti restano come oggi**: nessuno viene rimosso o ritoccato. Non-regressione **misurata** su almeno le superfici che rendono l'`AircraftListItem` arricchito (card flotta a 1280 e 375, sheet flotta mobile): geometria **pre/post** identica al centesimo.

**AC 15 — Il debito si dichiara, non si subisce in silenzio.**
Il record dice, per ciascuno: (a) **TD 14.8 F6** (`parseDateOnlyUtc`, anni <100 → 1900+anno) — **ereditato e dichiarato**, `date-only.ts` **non toccato** (R-AOG-h), con la classe condivisa col resto (`z.iso.date()` in ingresso, `@db.Date` a valle); (b) **AD-7** (422-prima-di-403, TD 14.9 F11) — posizione del 422 nuovo dichiarata, niente fix; (c) **TD `OPTIONS_PAGE_SIZE`** — chiusa **solo** la faccia della Panoramica, le altre tre pagine restano (§6); (d) **AD-9** — la data non è modificabile senza rientro in servizio: **TD nuovo** in `sprint-status.yaml` con la misura; (e) i **40 `var(--bad)`/`var(--ok)` inline in 19 file** — questa story **non ne tocca uno e non ne aggiunge**.

**AC 16 — Unit, e girano in shell PULITA.**
Copertura: scrittura con data / senza data; azzeramento al rientro (AC 3); guardia atomica invariata; `details` dei 422; i **quattro** percorsi di AC 9; i cinque casi della deroga (AC 10 a-e); il conteggio di AC 13 se la derivazione è isolabile. **Devono passare con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`** — regola CLAUDE.md a **3 occorrenze**: un import nuovo verso un service «grosso» trascina la validazione **eager** di `@/lib/env` e fa fallire `npm run gates` in locale mentre CI resta verde. Mockare la catena (`vi.mock('@/server/adapters/mail')` / `'./app-settings.service'` / `'@/lib/env'`, modello `bookings.service.test.ts`).

**AC 17 — e2e: convenzioni alla lettera, e l'isolamento MOTIVATO.**
- **testid**: superficie mobile che **duplica** una desktop → suffisso `-mobile`; superficie **solo** mobile → prefisso `mobile-`. **Verifica obbligatoria prima di scegliere ogni nome**: `grep -rn 'data-testid\^=' e2e/` — un `-mobile` su un nome coperto da un selettore `^=` rompe sei helper **a qualsiasi viewport** (AD-5 della 15.5). L'elenco dei prefissi trovati va nel record.
- **selettori**: navigazione scoped al landmark (`getByRole('navigation', { name: 'Aree operative' })`) o `exact: true`, mai `getByRole('link', { name })` page-level (lezione 103-F1); **mai `hasText` con date o `H:MM`** (lezione 11.2).
- **fixture**: **niente time-dependent** (lezione 15.4 F1: `todaySlotUtc(10)` rendeva rossi 2 test da mezzogiorno in poi). Le date di rientro si costruiscono **relative e calcolate**, mai letterali.
- **isolamento**: mettere un velivolo in AOG **è stato globale**. Fatto misurato: i tre spec che oggi lo fanno (`bookings.spec.ts:470`, `mobile-planning.spec.ts:291`, `mobile-registries.spec.ts:300`) vivono nel project `fullyParallel` e **non ripristinano nulla** — reggono perché ognuno crea **il proprio velivolo run-unique** e mette AOG **quello** (`mobile-planning.spec.ts:738` lo documenta esplicitamente). **Regola qui**: stessa disciplina (velivolo run-unique) ⇒ **nessun project serializzato** per il grosso della story; **eccezione obbligata**: la guardia di **AC 13** legge un **aggregato globale** ⇒ va in **catena serializzata**. La scelta — cosa resta parallelo, cosa entra in catena e **perché** — va **scritta nel record**, non lasciata implicita.
- **precondizione dei voli**: uno spec che registra voli **deve** usare `ensureValidSeedExpiries` (`e2e/helpers.ts`) — sul DB post-suite ci sono **11 `ExpiryType` bloccanti** (7 lasciati da `bookings.spec.ts`/`flights.spec.ts`, TD 15.5) e ogni persona **nuova** ne è priva ⇒ `POST /api/v1/flights` risponde **422 `FLIGHT_BLOCKED_BY_EXPIRY`** *prima* di arrivare alla guardia AOG. Un rosso così **sembra** della story e non lo è.

**AC 18 — I gate.**
`npm run gates` **verde** (lint + typecheck + vitest + build in output compatto — **mai** i quattro comandi verbosi separati). Suite e2e completa su **build di produzione** via **`scripts/e2e.sh`**, **MAI** `playwright test` in foreground; esito letto **solo** con `scripts/e2e.sh status` — **assenza della sentinella `E2E_EXIT=` + nessun processo vivo = run MORTO, non riuscito**; un secondo `start` **riporta** il run in corso invece di duplicarlo. Prima di attribuire un rosso alla flake di login: `SELECT identifier, count(*) FROM "LoginAttempt" WHERE "createdAt" > now() - interval '15 minutes' GROUP BY 1` (TD-6). Per una **serie** di run: build una volta (`env -u NODE_ENV npm run build && npm run start &`) poi `E2E_REUSE_SERVER=1 scripts/e2e.sh start …`.

---

## §3 — Dev Notes: blast radius (dal doc base §5, **ripartito**: qui c'è solo 1a)

**Schema / dati (3)**
1. `prisma/schema.prisma` — `model Aircraft`: campo + doc-comment che spiega **[a]**, **[b]** e la semantica **inclusiva** (AC 1).
2. `prisma/migrations/<ts>_aircraft_out_of_service_until/` — additiva, nessun backfill.
3. `src/generated/prisma/**` — rigenerato (`npx prisma generate`), **mai** editato a mano.

**Service / contratti (6)**
4. `src/server/services/aircraft.service.ts` — `AircraftListItem:15-32`, `AIRCRAFT_SELECT:37-50`, `toListItem:54-70`, `setOutOfService:393-416` (una chiave in più nel `data`, `where` **intatta**), `returnToService:423-438` (azzeramento nella **stessa** istruzione).
5. `src/server/services/bookings.service.ts` — i tre `details` (`:555`, `:925`, `:1154`). ⚠️ Il velivolo arriva da un `SELECT … FOR UPDATE`: se il raw guadagna la colonna, **tutti** i mock `queryRaw` dei test vanno aggiornati (voce 22). **NON** si toccano `BookableAircraftOption:1234` né `listBookableAircraft:1247-1254`: le opzioni del form prenotazione sono **fuori perimetro** (R-AOG-e).
6. `src/server/services/flights.service.ts` — `select:496-499` (+`status`, `statusReason`, `outOfServiceUntil`), guardia **dopo** `:521`, doc-comment `:413-417` e `:445-470` da aggiornare, `forceStamp` (`ResolvedFlightInput:364` → `registerFlightCore:771,805`).
7. `src/lib/schemas/aircraft.ts` — `setOutOfServiceSchema:90-94`, `aircraftListItemSchema:172-186`.
8. `src/lib/schemas/flights.ts` — **solo doc-comment** (`force`/`forceReason` esistono già, `:81-119`).
9. `src/lib/schemas/registry.ts` — `:263`, `:1097-1109`. **Stesso commit** (AD-8).

**RBAC (1)**
10. `src/server/auth/rbac.ts:58,75` — **doc-comment** di `flights.forceExpiry` (copre due blocchi). **Identificatore invariato.**

**API (1)**
11. `src/app/api/v1/aircraft/[id]/out-of-service/route.ts` — passa il campo nuovo al service.

**UI + i18n (9)**
12. `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx` — sezione Disponibilità `:286`, `AvailabilitySection:690-765`: campo data (**`DateInput` già importato a `:20`, già usato a `:914`**), «Stato attuale» con data / «rientro da definire», due facce di AD-9.
13. `src/app/[locale]/dashboard/fleet/page.tsx` — wiring label/dati (`:95`, `:186-189`).
14. `src/app/[locale]/dashboard/page.tsx` — `aogCount:327` (AC 13) **e** `dispatchAircraftOptions:386` (AC 12). ⚠️ **`fleetItems:399-415` NON si tocca** (card fuori perimetro).
15. `src/app/[locale]/dashboard/logbook/page.tsx:124-126` — `aircraftOptions` (AC 12).
16. `src/app/[locale]/dashboard/logbook/flight-editor.tsx` — label del combobox `:422-427`, `knownErrors` `:627-628` (chiave nuova), secondo innesco della sezione force `:952-1000` (gate a `:953`).
17. `src/app/[locale]/dashboard/logbook/logbook-console.tsx:365-378` — badge «Deroga»: **verifica**, non modifica.
18. `src/app/[locale]/dashboard/bookings/{new,edit}-booking-form.tsx` (`:304-305`, `:167-168`) + `booking-labels.ts:123,162,223` — i due messaggi 422 ratificati. ⚠️ `booking-transition.ts:33,56-57` **NON** si tocca (AD-3).
19. `src/styles/airops.css` — **una** regola dentro `@media (max-width: 640px)` ancorata a `out-of-service-submit` (AC 6). Nessun token esistente cambia valore, nessun literal di colore nuovo.
20. `messages/it.json` + `messages/en.json` — **sempre le due insieme**.

**Test (5)**
21. `src/server/services/aircraft.service.test.ts` — ⚠️ **quattro punti di rottura CERTI**, verificati riga per riga nel doc base: (i) la fixture `SELECTED_AIRCRAFT:105-120` (letterale del DTO, spreadata ovunque) guadagna il campo; (ii) `:217-236` — `toEqual({ items: [<DTO letterale, non spread>], total: 1 })` **si rompe** con un campo additivo; (iii) `:582-585` — `expect(updateManyMock).toHaveBeenCalledWith({ …, data: { status, statusReason } })` **si rompe** appena `setOutOfService` scrive una terza chiave; (iv) `:611-614` — la gemella su `returnToService` **si rompe** con l'azzeramento. Le (iii)/(iv) sono le asserzioni che **provano** AC 3: si aggiornano al valore **corretto**, **mai** indebolite a `objectContaining`. `:296` usa lo spread e segue da sola; `:709` (contaore) non è toccato.
22. `src/server/services/bookings.service.test.ts` — i mock `queryRaw` a `:196`, `:426`, `:433`, `:1174`, `:1181`, `:1192-1193`, `:1569`, `:1579` restituiscono righe letterali `{ id, status, statusReason, archivedAt }`: se il `SELECT … FOR UPDATE` guadagna una colonna **vanno tutti aggiornati**. ⚠️ `:1983` (`toEqual` esatto su `BookableAircraftOption`) **NON deve rompersi**: se si rompe, qualcuno è uscito dal perimetro R-AOG-e.
23. `src/server/services/flights.service.test.ts` — i quattro percorsi di AC 9 + i cinque casi di AC 10.
24. `e2e/` — spec nuovo per il grosso (fullyParallel, velivolo run-unique) **+** la guardia di AC 13 in **catena serializzata**. Motivazione nel record (AC 17).
25. `src/lib/schemas/registry.test.ts` — solo se cambiano i path (non dovrebbero: sono già registrati). Il campo nuovo nel body **non** è coperto da `arrayContaining`: verifica **a lettura**.

---

## §4 — Piano di test

**Unit nuovi/estesi** — `aircraft.service.test.ts` (scrittura con/senza data, azzeramento, guardia atomica, DTO), `flights.service.test.ts` (4 percorsi + deroga + ordine `AIRCRAFT_ARCHIVED` prima), `bookings.service.test.ts` (i tre `details`). Tutti verificati anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.

**e2e** — uno spec nuovo nel project `chromium` `fullyParallel` (`setViewportSize` **dentro** il test, pattern 13.10), che crea **il proprio** velivolo run-unique e i propri attori:
1. AOG **con** data → editor: campo, etichetta inclusiva, «Stato attuale» con la data; AOG **senza** data → «rientro da definire»;
2. bersaglio `out-of-service-submit` ≥44 a 375, invariato a 1280 (AC 6);
3. creazione prenotazione su quel velivolo → 422 con la clausola inclusiva, IT **ed** EN; spostamento idem;
4. registrazione volo → 422 con nome/motivo/data e **niente** `errors.generic`; deroga admin → volo registrato + badge «Deroga»; attore senza permesso → **nessuna affordance**;
5. picker volo: l'opzione porta «(fuori servizio)» ed **è selezionabile**, su **entrambi** i call-site;
6. AOG con data **di ieri** → prenotazione **e** volo ancora rifiutati (AC 2 c).
**In catena serializzata**: la sola guardia di **AC 13** (aggregato globale), con la precondizione sul numero di velivoli attivi verificata dentro il test.

**Discriminanze obbligatorie** (rosse sul pre-fix, repo ripristinato byte-identico dopo): il probe di AC 8; la guardia di AC 13; almeno una guardia per **ogni** regola CSS nuova (AC 6).

---

## §5 — Trappole note (dal doc base §5 — leggerle PRIMA di scrivere)

- **`Escape` e i pannelli**: `SlideOver` chiude l'**INTERO** pannello (listener globale su `window`, `slide-over.tsx`); i popover portalati come `CalendarPopover` — **e questa story ne apre uno nuovo, sul campo data** — intercettano **in cattura** e consumano il **PRIMO** `Escape` (verificato 15.10). **Mai** usare `Escape` per chiudere il calendario e poi asserire sul pannello: si corre contro l'animazione di chiusura e si asserisce su nodi fantasma (review 14.3 F1/F2, 3 fallimenti deterministici mascherati). Chiudere **interagendo col campo successivo**.
- **`SlideOver`/`MobileSheet` sono DIALOGHI** con focus trap che **comprende i portali attivi** (`src/components/ui/focus-trap.ts`, condiviso); un pannello chiuso è `inert`. Il campo data nuovo vive **dentro** quel contesto: il `CalendarPopover` portalato deve restare raggiungibile dal trap — **verificarlo, non assumerlo**.
- **Componenti condivisi, il «gemello» si MISURA**: `FlightEditor` serve **due** call-site (registro voli + CTA Panoramica, dove viveva il **BLOCKER 14.4 F1**); `FleetCardGrid`/`badgeFor` servono **due** pagine (qui non si toccano — ma una regola CSS mal ancorata ci arriva lo stesso).
- **`OPTIONS_PAGE_SIZE = 100`** (`dashboard/page.tsx:70`, `logbook/page.tsx:32`, `bookings/page.tsx`, `billing/page.tsx`): TD aperto. Su DB post-suite (**148** velivoli) l'ultimo velivolo creato **non è selezionabile** in alcuni picker — un e2e che crea un velivolo e poi lo cerca in un `<select>` **può morire per questo**, non per un difetto della story: **diagnosticare prima di attribuire**.
- **`ExpiryType` bloccanti lasciati dagli spec** (TD 15.5): v. AC 17, `ensureValidSeedExpiries`.
- **Migrazione**: `npx prisma migrate dev` **e** `npx prisma generate`. `npm run gates` **non** cattura un client Prisma stantio (lezione 14.4: un eccesso di proprietà su uno spread non viene controllato da `tsc`).
- **Lock anti-brute-force** (TD-6): ripetere run e2e mirati sullo stesso DB fa fallire lo spec alla riga di login dopo ~10 login — deterministico, non flake. Query di verifica in AC 18.
- **DB su questa macchina**: `docker compose exec -T postgres psql -U airmanager -d airmanager` (`psql` **non** è nel PATH dell'host).
- **Env**: `export JOBS_SECRET=<non-placeholder>` prima di ogni suite `CI=1`.

---

## §6 — Fuori scope DICHIARATO

**Va in AOG-1b** (non anticiparlo, nemmeno «già che ci sono»): l'**anteprima** «Stai per impattare N prenotazioni», il **doppio passo** di conferma (le label morte `availability.confirm`/`confirmReturnToService` restano morte in 1a), il **conteggio in transazione**, il **DTO di response nuovo** di `setOutOfService`, il **banner persistente**, la **riga persistente** alla riapertura, e **tutte** le email.

**Fuori da entrambe**:
- **Annullamento automatico** delle prenotazioni impattate (decisione PO 2026-07-31, opzione 2 di 3: l'AOG conta e avvisa, non decide).
- **`groundedAt`**: fuori contratto P3 — AD-5 spiega perché la sua assenza è un vincolo dichiarato, non un difetto da riparare qui.
- **Rinomina** di `flights.forceExpiry` e di `ExpiryType.blocksBooking` (precedente F3 della 14.4).
- **TD `OPTIONS_PAGE_SIZE`** in generale (4 pagine): qui si chiude **solo** la faccia della Panoramica (R-AOG-f).
- **TD 14.8 F6** su `date-only.ts` (R-AOG-h): dichiarato, non chiuso.
- **TD 14.9 F11** (422-prima-di-403 su `/stats` e `/cash-report`): AD-7 dichiara solo la posizione del 422 nuovo.
- **I 40 `var(--bad)`/`var(--ok)` inline in 19 file**: TD post-epic con ciclo proprio — **non se ne tocca uno e non se ne aggiunge**.
- **Le 42 celle `.cal-popover` a 34,58px** e la semantica di dialogo del popover calendario (TD post-epic 15.10): si **usa** `DateInput`/`CalendarPopover` così com'è.
- **Le 13 superfici del censimento** che R-AOG-e lascia invariate quanto alla data (AC 14), **compreso** il messaggio 422 di **approvazione** (AD-3).
- **Una superficie flotta nuova sulla Panoramica mobile**: `.overview-mobile` non ne ha e non ne guadagna una (doc base §2).

---

## §7 — Riferimenti

- `_bmad-output/implementation-artifacts/aog-1-velivolo-fuori-servizio.md` — ricognizione misurata, censimento, §7 con le **DECISIONI PO**.
- `_bmad-output/implementation-artifacts/aog-1b-avviso-prenotazioni-email.md` — la story che **consuma** questo schema.
- `_bmad-output/implementation-artifacts/14-4-guardrail-registrazione-volo.md` — il modello blocco-vs-deroga (R-14.4-a/b/c/d, F1 BLOCKER del remount, F4 vicolo cieco, F3 sul non rinominare).
- `_bmad-output/implementation-artifacts/7-4-booking-expiry-block.md` — il precedente della guardia (`blocksBooking`, force + motivazione).
- `_bmad-output/implementation-artifacts/15-4-pianificazione-mobile.md` (R-15.4-g) — il 422 che porta il vincolo fino all'utente.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:476` — l'action item AOG (contratto).
- `docs/handoffs/HANDOFF.md` — ciclo per story su questa macchina, stato branch/PR.
- `CLAUDE.md` — testid mobile/AD-5, e2e, catena serializzata, `SlideOver`/`MobileSheet` post-15.10, gates, `scripts/e2e.sh`.
- `.claude/skills/karpathy-guidelines/SKILL.md` — assunzioni esplicitate, semplicità (AD-5/AD-9: niente colonne né percorsi speculativi), chirurgia (§6), criteri verificabili (§2).

---

## Dev Agent Record — AOG-1a

**Dev**: Opus 5 xhigh (subagent) · **Data**: 2026-08-07 · **Baseline**: `414dd66` (codice identico a `b5a2c93`; i commit successivi sono docs-only) · **Macchina**: Fedora locale (Postgres+Mailpit in Docker), NON il container di CLAUDE.md.

### §A — Verifica della ricognizione (ogni riga riverificata prima di toccarla)

| Fatto dichiarato dalla story | Esito sulla riga |
|---|---|
| `setOutOfService` `:393-416`, `updateMany` guardata `{ id, status: 'OPERATIONAL' }` | **CONFERMATO** |
| `returnToService` `:423-438`, guardia speculare | **CONFERMATO** |
| `flights.service.ts:496-499` seleziona `{ id, registration, archivedAt }` — `status` assente | **CONFERMATO** |
| 3 `AIRCRAFT_OUT_OF_SERVICE` in `bookings.service.ts` (`:555`, `:926`, `:1155`), 0 in `flights.service.ts` | **CONFERMATO** |
| `DateInput` già importato in `aircraft-editor.tsx:20`, già usato a `:914` | **CONFERMATO** — zero import nuovi |
| `correctFlightSchema` accetta già `force`/`forceReason` (`⚠️` AD-6/AC 10d) | **CONFERMATO alla riga**: `schemas/flights.ts:244-246` fa `registerFlightFields.extend({reason}).refine(requireForceReason)` ⇒ **nessun vicolo cieco**, nessuna estensione necessaria (prova e2e + unit, §C AC 10) |
| Sezione force gated su `blockedDocuments` (`flight-editor.tsx:953`) | **CONFERMATO** — serviva davvero un secondo innesco |
| 4 punti di rottura in `aircraft.service.test.ts` | **CONFERMATI tutti e quattro** (fixture, `toEqual` letterale, i due `toHaveBeenCalledWith` esatti) |
| mock `queryRaw` di `bookings.service.test.ts` da aggiornare | **CONFERMATO**: **9** righe letterali (non 8 — la ricognizione elencava 8 posizioni, `:1192` e `:1193` sono due righe distinte). Aggiornate tutte. `:1983` (`toEqual` esatto su `BookableAircraftOption`) **NON si è rotto** ⇒ perimetro R-AOG-e rispettato |

**Correzioni alla ricognizione (2)**

1. **Il DTO NON viaggia come `z.iso.datetime()`.** La ricognizione non lo specificava; la convenzione REALE del repo per una colonna `@db.Date` è `YYYY-MM-DD` sul filo (`AircraftRateListItem.validFrom` → `rates.service.ts:26/57` + `schemas/aircraft.ts:23`; `ExpiryListItem.expiresAt` → `expiries.service.ts:54/92` + `schemas/expiries.ts:51`). Ho seguito quella: `AircraftListItem.outOfServiceUntil: string | null`, `toListItem` converte con `toDateOnlyString`, `aircraftListItemSchema` usa `z.iso.date().nullable()`. Conseguenza: `type SelectedAircraft = AircraftListItem` (alias) è diventato `Omit<AircraftListItem,'outOfServiceUntil'> & { outOfServiceUntil: Date | null }`, esattamente lo stesso split che `rates.service.ts` fa per `validFrom`. **Il vantaggio concreto**: `details.outOfServiceUntil` del 422 e il DTO parlano lo STESSO formato, così la UI non ha due percorsi di parsing.
2. **`$queryRaw` restituisce un `Date` a mezzanotte UTC per una colonna `@db.Date`** — misurato, non assunto, con un probe `tsx` sul client Prisma 7 + `adapter-pg` di questo repo: `RAW typeof: object | instanceof Date: true | value: 2031-05-12T00:00:00.000Z`. È il presupposto di `outOfServiceDetails`, ed è ora pinnato da un unit test (`bookings.service.test.ts`, «carries the expected-return date as a YYYY-MM-DD calendar day in details»).

### §B — Il difetto, riprodotto e chiuso sulla MIA macchina

Probe write-free (422 prima di ogni transazione), **stesso velivolo, stesso DB, stessa build di produzione**, prima su un worktree a `414dd66` e poi sul repo con il fix:

```
PRE  (414dd66)  POST /api/v1/flights {aircraft AOG, takeoffAt +400gg}
                → 422 FLIGHT_DATE_IN_FUTURE
PRE  (414dd66)  POST /api/v1/flights {aircraft AOG, takeoffAt 2020-01-15}
                → 422 FLIGHT_BLOCKED_BY_EXPIRY
PRE  (414dd66)  POST /api/v1/bookings {stesso velivolo, stesso istante}
                → 422 AIRCRAFT_OUT_OF_SERVICE  details {"reason":"Probe AOG"}

POST (fix)      POST /api/v1/flights {aircraft AOG, takeoffAt +400gg}
                → 422 AIRCRAFT_OUT_OF_SERVICE  details {"reason":"Probe AOG","outOfServiceUntil":"2031-05-12"}
POST (fix)      POST /api/v1/flights {aircraft AOG, takeoffAt 2020-01-15}
                → 422 AIRCRAFT_OUT_OF_SERVICE  details {"reason":"Probe AOG","outOfServiceUntil":"2031-05-12"}
POST (fix)      POST /api/v1/bookings {stesso velivolo, stesso istante}
                → 422 AIRCRAFT_OUT_OF_SERVICE  details {"reason":"Probe AOG","outOfServiceUntil":"2031-05-12"}
```

La riga PRE con data **passata** aggiunge un fatto che la ricognizione non aveva: pre-fix il primo ostacolo su un volo storico non era nemmeno la data, era **la scadenza**. Post-fix è lo stato del velivolo, cioè l'ordine documentato *existence 404 → state 422 → domain 422*.

### §C — Riepilogo per AC, con le prove

| AC | Esito | Prova |
|---|---|---|
| **1** campo additivo + semantica una volta sola | ✅ | migrazione `20260807074113_aircraft_out_of_service_until` = **una riga** (`ALTER TABLE "Aircraft" ADD COLUMN "outOfServiceUntil" DATE;`), nessun backfill. `SELECT count(*) … WHERE "outOfServiceUntil" IS NOT NULL` = **0** subito dopo (`total 1 | with_date 0`). `npx prisma generate` eseguito. Doc-comment Prisma con i quattro punti (i) inclusiva (ii) informativa (iii) stesso ciclo di `statusReason` (iv) opzionale — **è la sola fonte**, ogni altro punto la cita |
| **2a** invariante [a], unit | ✅ | `aircraft.service.test.ts`: 3 test nuovi (`setOutOfService` con data passata resta AOG; `listOutOfServiceAircraft` la restituisce ancora; `getAircraft` idem). `flights.service.test.ts`: «a grounding whose outOfServiceUntil is in the PAST still blocks» |
| **2b** invariante [a], statico | ✅ | §D — censimento di **tutte** le occorrenze in `src/server/`, classificate una per una. **Zero** dentro una `where`, un `if` di stato o un job |
| **2c** invariante [a], e2e | ✅ | `aircraft-out-of-service-until.spec.ts` «a grounding whose date is already PAST still blocks both a booking and a flight» — prenotazione **e** volo entrambi 422, `details.outOfServiceUntil` = ieri |
| **3** invariante [b] + azzeramento | ✅ | POST senza il campo → 200 e `null` (unit + e2e). `returnToService` asserito **esatto**: `data: { status:'OPERATIONAL', statusReason: null, outOfServiceUntil: null }`, `where` **invariata**, MAI indebolito a `objectContaining`. Nessuna validazione «data futura» aggiunta: una data passata è input legittimo (unit dedicato) |
| **4** contratti + OpenAPI stesso commit | ✅ | 4 punti in fila toccati (`AircraftListItem`, `AIRCRAFT_SELECT`, `toListItem`, `aircraftListItemSchema`). **Verifica a lettura del documento generato** (`generateOpenApiDocument()`, il test `arrayContaining` non la copre): `SetOutOfServiceRequest.properties.outOfServiceUntil = {"type":"string","format":"date"}`, `required = ["reason"]` (quindi opzionale); risposta 200 di `/out-of-service` e items di `GET /api/v1/aircraft` = `{"type":["string","null"],"format":"date"}`; la `description` del path nomina la semantica INCLUSIVA. **La forma della response di `setOutOfService` NON è cambiata** (resta `AircraftListItem`) — la cucitura con 1b è intatta |
| **5** campo + etichetta inclusiva, e in nessun altro posto | ✅ | §E (misure) e §F (contrasti). `DateInput` già importato — **zero import nuovi**. Etichetta «Fermo fino al (compreso)», hint «Facoltativo: l'ultimo giorno di fermo. Vuoto = rientro da definire.», riga «Stato attuale» = `{motivo} · fermo fino al {data} compreso` / `{motivo} · rientro da definire`. IT+EN insieme. **Nessun `var(--bad)`/`var(--ok)` inline aggiunto** (0 nuovi: il campo usa `Field`+`.fld-hint`, già esistenti) |
| **6** ≥44px solo a ≤640 | ✅ | §E: **pre 335×34,84** (bottom 840,41 > 812) → **post 335×44** a 375; **desktop 479×34,84 pre e post, identico al centesimo**. Una sola regola, dentro `@media (max-width: 640px)`, ancorata a `[data-testid="out-of-service-submit"]`. Nessun altro controllo nuovo sotto 44 a ≤640 (`out-of-service-until` misurato **44** a 375, eredita la regola `.date-input` della 15.10) |
| **7** i tre 422 | ✅ | (a) `details` = `{reason, outOfServiceUntil}` sui 4 throw, messaggio server **INVARIATO**; (b) creazione + spostamento + volo mostrano la clausola in IT e EN (e2e); (c) senza data la stringa è **byte-identica**: e2e `toHaveText('Il velivolo è fuori servizio: {reason}.')` — chiave i18n `AIRCRAFT_OUT_OF_SERVICE` **non toccata**, la clausola vive in una chiave NUOVA `AIRCRAFT_OUT_OF_SERVICE_UNTIL`; (d) approvazione dichiarata invariata (§G); (e) data formattata con `formatDateOnly` (il formattatore già in pagina), e **nessun** `hasText` con date negli e2e |
| **8** il 422 del volo, discriminante | ✅ | §B: entrambe le risposte riportate, misurate su due build reali |
| **9** perimetro AD-4, 4 percorsi 4 esiti | ✅ | unit (`registerFlight` bloccato; `correctFlight` che cambia velivolo bloccato; `correctFlight` a velivolo invariato **passa** e **senza stamp**; `cancelFlight` mai bloccato) + e2e API che ripete i tre percorsi di correzione/storno. **Ordine**: test dedicato «archiviato E fermo → `AIRCRAFT_ARCHIVED`» |
| **10** deroga | ✅ | (a) 403 prima di ogni query (unit: `aircraftFindUniqueMock` **non chiamato**); (b) 422 dallo schema (test già esistente, invariato); (c) stamp sulla riga + badge «Deroga» nel registro (e2e); (d) **un solo `force`** su AOG **+** documento bloccante ⇒ un solo `flightCreate`, un solo stamp (unit); il force **raggiunge** `correctFlight` — **misurato, nessun vicolo cieco** (unit «an ADMIN can derogate a correction that moves the flight onto a grounded aircraft»); (e) `force` a vuoto su velivolo operativo ⇒ **nessuno stamp**; (f) doc-comment di `flights.forceExpiry` aggiornato, **identificatore invariato**; (g) remount verificato sul **secondo** call-site (CTA Panoramica): riaperto il pannello, `force-flight-section` ha **count 0** |
| **11** l'errore arriva con un nome | ✅ | chiave i18n nuova ⇒ **mai** `errors.generic` (e2e asserisce anche `not.toContainText('Riprova')`). Messaggio = marca + motivo + «Fermo fino al {data} compreso». Provato su **entrambi** i call-site. Nessun vicolo cieco: §G lo dichiara con la misura |
| **12** picker che nomina l'AOG e resta selezionabile | ✅ | `aircraftOptions` guadagna `status`/`statusReason` in **entrambe** le pagine; il label riusa **la stessa chiave i18n del form prenotazione** (`BookingsPage.form.outOfServiceSuffix`), non una copia; opzione **senza** `disabled`/`aria-disabled`, cliccata davvero nell'e2e. **La data NON entra qui.** Anche la ricerca server-side del combobox produce lo stesso label (parità reale, non solo sulla prima pagina) |
| **13** il conteggio della Panoramica | ✅ | **Pre-fix misurato su questa macchina** (build `414dd66`, 101 velivoli attivi, stesso istante, stesso DB): Panoramica «**0 AOG**», Flotta «**1 AOG**». **Post-fix, stesso DB**: Panoramica «**3 AOG**», Flotta «**3 AOG**». Guardia e2e in project serializzato, con la precondizione verificata dentro il test |
| **14** superfici non toccate, una per una | ✅ | §G |
| **15** debito dichiarato | ✅ | §H |
| **16** unit in shell pulita | ✅ | `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>` su tutti e tre i file toccati: **verde**. Nessun import nuovo verso un service «grosso» è entrato in un test (anzi: `outOfServiceDetails` è stato messo in un modulo puro **apposta** per non trascinare `@/lib/env`, §I) |
| **17** convenzioni e2e + isolamento motivato | ✅ | §J |
| **18** gate | ✅ | §K |

### §D — AC 2b: censimento di `outOfServiceUntil` in `src/server/`, classificato

| File:riga | Cosa fa | Classe |
|---|---|---|
| `aircraft.service.ts:26-27` | tipo del DTO | dichiarazione |
| `aircraft.service.ts:50` | chiave di `AIRCRAFT_SELECT` | **lettura** |
| `aircraft.service.ts:58-59` | tipo della riga grezza | dichiarazione |
| `aircraft.service.ts:71` | `toListItem` → `toDateOnlyString` | **visualizzazione (DTO)** |
| `aircraft.service.ts:431` | `setOutOfService`, chiave del `data` | **scrittura (ciclo di vita)** |
| `aircraft.service.ts:460` | `returnToService`, azzeramento | **scrittura (ciclo di vita)** |
| `bookings.service.ts:547-548 / 914-915 / 1144-1145` | colonna nei tre `SELECT … FOR UPDATE` | **lettura** |
| `flights.service.ts:509` | chiave del `select` | **lettura** |
| `aircraft-status.ts:29-36` | `outOfServiceDetails` | **messaggio d'errore** |
| `prisma/schema.prisma:312` | la colonna | schema |

**Zero** occorrenze dentro una `where` Prisma, dentro un `if` che decida lo stato, o dentro un job/cron. L'invariante [a] è garantita **per costruzione**: la sola cosa che decide se un velivolo vola resta `status`.

### §E — AC 5/6/14: misure pre/post (build di produzione, `playwright-core`, worktree a `414dd66` per il PRE)

Tutte a **1280×900** e **375×812**, tema chiaro e scuro (geometria identica nei due temi).

| Elemento | 1280 PRE | 1280 POST | 375 PRE | 375 POST |
|---|---|---|---|---|
| `[role=dialog]` (pannello) | 520×900 @x760 | **520×900 @x760** | 375×812 @x0 | **375×812 @x0** |
| `.so-body` | 519×756,39 | **519×756,39** | 375×659,23 | **375×659,23** |
| `availability-current` | 479×15,22 @y556,16 | **479×15,22 @y556,16** | 335×15,22 @y699,44 | **335×15,22 @y699,44** |
| `out-of-service-reason` | 479×55,69 @y592,59 | **479×55,69 @y592,59** | 335×55,69 @y735,88 | **335×55,69 @y735,88** |
| `out-of-service-until` (**nuovo**) | — | 232,5×38,84 @y683,5 | — | **335×44** @y826,78 |
| `out-of-service-submit` | **479×34,84** @y662,28 | **479×34,84** @y777,13 | **335×34,84** @y805,56 (bottom **840,41** > 812) | **335×44** @y908,17 |
| `identity-submit` (piede) | 115,27×34,84 | **115,27×34,84** | 115,27×44 | **115,27×44** |
| `documentElement` overflow-X | 0 | **0** | 0 | **0** |

- **Crescita della sezione Disponibilità** (AC 5, pre/post): a **1280** il submit scende da y662,28 a y777,13 ⇒ **+114,85px** (campo 38,84 + label + hint + gap del `.form-grid`); a **375** da y805,56 a y908,17 ⇒ **+102,61px** (campo 44 + label + hint, colonna singola sotto 640). Il **pannello** e il **`.so-body`** non cambiano di un centesimo a nessuna delle due larghezze — la sezione cresce dentro il corpo scrollabile, non sposta la cornice.
- **AC 6 chiuso**: 34,84 → **44** a 375; **desktop 479×34,84 identico al centesimo** pre e post. La `y` desktop scende di 114,85px perché la story **aggiunge un campo sopra** — è la story stessa a chiederlo (AC 5), non un effetto della regola CSS, che vive dentro `@media (max-width: 640px)`.
- **Non-regressione AC 14 misurata**: pannello, `.so-body`, «Stato attuale», textarea del motivo e submit primario sono **identici al centesimo** pre/post a entrambe le larghezze.
- **Le due facce di AD-9, misurate**: su velivolo `OPERATIONAL` la sezione rende motivo + data + submit; su velivolo **già `OUT_OF_SERVICE`** rende la riga di stato + il solo bottone di rientro — `out-of-service-until` e `out-of-service-submit` hanno **count 0** (misurato a 1280 e 375, entrambi i temi). Nessun controllo che porterebbe sempre a un 409.

### §F — AC 5: contrasti WCAG, calcolati (canvas → sRGB → WCAG, sfondo effettivo risalendo gli antenati, cascata reale)

Ogni pixel di testo **nuovo**, nei due temi, a entrambe le larghezze:

| Testo nuovo | Chiaro | Scuro | Soglia |
|---|---|---|---|
| `.fld-label` «Fermo fino al (compreso)» (su `--panel`) | **4,85** | **5,72** | ≥4,5 ✅ |
| `.fld-hint` «Facoltativo: l'ultimo giorno di fermo…» | **4,85** | **5,72** | ≥4,5 ✅ |
| `availability-current` con la clausola inclusiva | **4,85** | **5,72** | ≥4,5 ✅ |
| `availability-current` con «rientro da definire» | **4,85** | **5,72** | ≥4,5 ✅ |

Tutti misurati con `getClientRects().length > 0` (niente `display:none`, che darebbe contrasti falsi). Nessun literal di colore nuovo, nessun token cambiato di valore.

**Testo reso, IT ed EN (verbatim dalla misura):**
- IT: `Stato attuale: Revisione 100h · fermo fino al 12/05/2031 compreso` / `Stato attuale: Attesa pezzo · rientro da definire`
- EN: `Current status: 100h inspection · grounded until 12/05/2031 inclusive`
- EN label/hint: `Grounded until (inclusive)` / `Optional: the last day the aircraft stays grounded. Empty = return date not yet known.`

### §G — AC 14: le superfici NON toccate, una per una

| # censimento | Superficie | Motivo |
|---|---|---|
| 2 | Card flotta desktop `.ac-card.aog` | **decisione PO R-AOG-e**. `components/dashboard/fleet-card.tsx` **non è nemmeno aperto in scrittura**: `FleetCardItem` è rimasto invariato e il campo è stato aggiunto su un tipo NUOVO di pagina (`FleetConsoleItem`), così il file condiviso con la Panoramica non cambia di una riga |
| 3 | Card flotta mobile `mobile-fleet-card-{id}` | **decisione PO R-AOG-e** (stesso componente) |
| 4 | Sheet flotta mobile `mobile-fleet-sheet` | **decisione PO R-AOG-e**. `fleetSheetRows` continua a mostrare «Motivo AOG» e **nessuna** riga «Rientro previsto» |
| 5 | Testata pagina Flotta `.sub` | **decisione PO R-AOG-e**; già corretta, `listOutOfServiceAircraft` invariata |
| 7 | Widget Flotta della Panoramica (`FleetCard`) | **decisione PO R-AOG-e**; `fleetItems:399-415` **non toccato** (l'unica riga cambiata in `dashboard/page.tsx` oltre a `aogCount` è `dispatchAircraftOptions`, che è AC 12) |
| 8 | Timeline desktop — pill `.res-status.aog` | **decisione PO R-AOG-e** |
| 9 | Timeline desktop — blocco `schedule-aog-block` | **decisione PO R-AOG-e**; `f-sub` resta `statusReason` |
| 10 | Agenda mobile — righe AOG in testa | **decisione PO R-AOG-e**; `mobile-agenda.ts` non toccato |
| 11 | Sheet dell'agenda mobile | **decisione PO R-AOG-e** |
| 12 | Form nuova prenotazione — opzione disabilitata | **decisione PO R-AOG-e**; il suffisso resta `{reason} (fuori servizio)`, senza data. `BookableAircraftOption`/`listBookableAircraft` **non toccati** (prova: `bookings.service.test.ts:1983`, `toEqual` esatto, **non si è rotto**) |
| 13 | Form modifica prenotazione — idem | **decisione PO R-AOG-e** |
| 15 | Export Excel velivoli | **decisione PO R-AOG-e**; `exports.service.ts` non toccato |
| — | **422 di approvazione** (`booking-transition.ts:33,56-57`) | **decisione PO R-AOG-e + AD-3**: non è fra i tre percorsi nominati. Il **contratto** cambia lo stesso (il throw `:1156` porta il `details` arricchito, uniformità AD-3), il **testo** no. Divergenza consapevole, dichiarata qui, non una dimenticanza: chiuderla costa una label e una riga, ma non è ratificata |
| — | Superficie flotta nuova sulla Panoramica mobile | **non creata** (fuori scope §6) |
| — | Badge e motivo esistenti ovunque | **invariati**: nessuno rimosso, nessuno ritoccato |

**Vicolo cieco AC 11, misurato e dichiarato**: «attore che non può derogare» è oggi **strutturalmente irraggiungibile** dalla UI — dalla 14.9 nessun ruolo ha `flights.manage` senza `flights.forceExpiry` (fatto già scritto in `flights.service.ts:494-500`, review 14.9 F4). L'e2e prova quindi la cosa vera e verificabile: un attore **senza** `flights.manage` (PILOT) non trova **alcuna** affordance (`logbook-new-button` count 0, `flight-form` count 0) ⇒ nessun messaggio promette una via che non esiste.

### §H — AC 15: il debito, dichiarato voce per voce

| Voce | Stato |
|---|---|
| **(a) TD 14.8 F6** — `parseDateOnlyUtc` mappa gli anni `0-99` su `1900+anno` | **EREDITATO e DICHIARATO** (R-AOG-h). `date-only.ts` **non toccato** (0 righe). Il campo nuovo condivide con gli altri consumatori esattamente: `z.iso.date()` in ingresso (`setOutOfServiceSchema`), `parseDateOnlyUtc` per il binding, `@db.Date` a valle, `toDateOnlyString` in uscita — la stessa catena di `AircraftRate.validFrom` e `Expiry.expiresAt`. Un `outOfServiceUntil: '0001-01-01'` finirebbe a DB come `1901-01-01` in silenzio, come per ogni altra data del repo. Nessun percorso reale lo produce (il `DateInput` nativo non emette anni <1000) |
| **(b) AD-7 / TD 14.9 F11** (422-prima-di-403) | **DICHIARATO, non toccato.** Il 422 nuovo nasce **dentro** il service, **dopo** `authorize(actor,'flights.manage')` e **dopo** il 403 di `flights.forceExpiry` (`flights.service.ts:500-502`): un attore senza permesso prende **403 e non lo vede mai** — provato dall'unit «force without flights.forceExpiry is a 403, BEFORE any query», che asserisce anche che `prisma.aircraft.findUnique` **non è stato chiamato**. Stessa posizione dei tre 422 gemelli delle prenotazioni. Nessun fix qui |
| **(c) TD `OPTIONS_PAGE_SIZE = 100`** | Chiusa **solo** la faccia della Panoramica (R-AOG-f). Restano aperte `logbook/page.tsx:32`, `bookings/page.tsx`, `billing/page.tsx` |
| **(d) AD-9** — la data non è modificabile senza rientro in servizio | **TD NUOVO da registrare in `sprint-status.yaml`** (non l'ho scritto io: il file è della sessione principale). Misura: `setOutOfService` è guardata `where: { id, status: 'OPERATIONAL' }` ⇒ una seconda chiamata su un velivolo già AOG dà **409 `ConflictError`**; l'editor perciò **non rende** il campo data su un velivolo già fermo (misurato: count 0). Per correggere una data oggi bisogna `returnToService` + rifermare. **Serve una ratifica PO per aprire un percorso di update** |
| **(e) 40 `var(--bad)`/`var(--ok)` inline in 19 file** | **Non ne ho toccato uno e non ne ho aggiunto uno.** Verificato: `git diff -U0 | grep '^+.*var(--bad)\|^+.*var(--ok)'` → **0 righe** |

### §I — Decisioni non ovvie

1. **`outOfServiceDetails` vive in `src/server/services/aircraft-status.ts` (file NUOVO), non in `bookings.service.ts`.** Il blast radius della story lo collocava implicitamente in `bookings.service.ts` (dove sta già `findBlockingExpiredDocuments`, l'altro helper condiviso flights↔bookings). L'ho spostato dopo aver **misurato** il costo: `flights.service.test.ts` fa `vi.mock('./bookings.service', () => ({ findBlockingExpiredDocuments: … }))`, cioè sostituisce l'INTERO modulo. Con l'helper lì dentro, il test di flights o (i) esplode con `No "outOfServiceDetails" export is defined on the mock` — è successo, l'ho visto —, oppure (ii) ne mocka una copia, e allora le asserzioni su `details` provano il mock e non il codice, oppure (iii) usa `importOriginal` e trascina `@/server/adapters/mail` + la validazione **eager** di `@/lib/env` (la classe a 3 occorrenze di CLAUDE.md). Un modulo puro che importa solo `date-only` chiude tutte e tre. **4 call-site, 2 service: non è un'astrazione monouso.**
2. **Il `force` è controllato NELLA guardia AOG, non solo alla fine.** La guardia deve stare **prima** del controllo sulla data (altrimenti il probe di AC 8 non discrimina), ma la deroga si applica **dopo**, insieme ai documenti bloccanti. Soluzione: la guardia lancia solo `if (outOfServiceBlock && !input.force)`, e `outOfServiceBlock` confluisce nella condizione dello `forceStamp`. Conseguenza voluta: quando NON si forza e ci sono **entrambi** i blocchi, vince il 422 di **stato** (`AIRCRAFT_OUT_OF_SERVICE`), coerente con l'ordine documentato — unit dedicato.
3. **`FleetCardItem` NON è stato allargato.** Il campo vive su `FleetConsoleItem` (nuovo, in `fleet-console.tsx`). Motivo: `FleetCardItem` è il tipo del componente **condiviso** con la Panoramica, e allargarlo avrebbe obbligato a toccare `dashboard/page.tsx#fleetItems`, che la story vieta esplicitamente. Costo: 4 righe in `fleet-console.tsx` (`onCardClick` risale la riga larga per id, perché `FleetCardGrid` restituisce quella stretta). **`components/dashboard/fleet-card.tsx` non compare fra i file modificati.**
4. **Il suffisso «(fuori servizio)» del picker volo riusa la chiave `BookingsPage.form.outOfServiceSuffix`**, non una copia sotto `LogbookPage`. Due pagine hanno guadagnato un `getTranslations('BookingsPage')` per farlo. Una stringa sola per un fatto solo: le due form non possono divergere.
5. **La registrazione del velivolo per il messaggio AC 11** non passa dal label del combobox (che ora porta il suffisso) né allargando `SearchCombobox` (primitiva condivisa, 7 call-site). Passa da una `Map` derivata dalle opzioni rese + una `ref` popolata **solo** dalla ricerca server-side (un event handler). Il primo tentativo scriveva la ref dentro il `useMemo` → **errore di lint `react-hooks/refs`** («Cannot access refs during render»), corretto.
6. **`AircraftOption` è ora esportato da `flight-editor.tsx`** e le due copie locali (`logbook-console.tsx:43`, `dispatch-flight-button.tsx:17`) sono state rimosse — erano diventate strutturalmente incompatibili. `AircraftFilterOption` (barra filtri) è stato reso esplicito invece di derivare da `AircraftOption`: il filtro non ha bisogno di `status`/`statusReason` e la pagina non glieli passa.

### §J — AC 17: e2e, convenzioni e isolamento

**Testid nuovi**: uno solo, `out-of-service-until`. Audit obbligatorio eseguito **prima** di sceglierlo — `grep -rn 'data-testid\^=' e2e/` dà i prefissi: `ac-card-`, `mobile-fleet-card-`, `mobile-fleet-`, `mobile-pilot-row-`, `mobile-instructor-row-`, `mobile-tail-chip-`, `schedule-filter-aircraft-`, `schedule-filter-instructor-`, `reports-fleet-row-`, `flight-row-mobile`. **Nessuno** copre `out-of-service-*`. Il controllo è **un solo nodo DOM a tutte le larghezze** (come `out-of-service-reason`), quindi né suffisso `-mobile` né prefisso `mobile-`: entrambi sarebbero sbagliati.

**Isolamento, con la motivazione (la scelta, non l'implicito):**
- Il **grosso** (`aircraft-out-of-service-until.spec.ts`, 8 test) resta nel project `chromium` **fullyParallel**. Ogni test crea **il proprio** velivolo run-unique e ferma **quello** — la disciplina identica dei tre spec che già fermano velivoli (`bookings.spec.ts:470`, `mobile-planning.spec.ts:291`, `mobile-registries.spec.ts:300`). Nessun test legge un aggregato globale ⇒ nessun project serializzato serve.
- La **sola** guardia di AC 13 legge un aggregato **globale** ⇒ project serializzato **nuovo**, `aog-overview-count`, **ULTIMO** della catena (`dependencies: ['mobile-settings']`). **Due** motivi indipendenti, entrambi fatali sotto `fullyParallel`, scritti nel commento del config: (i) asserisce un'**uguaglianza** fra due aggregati globali letti da due navigazioni (la classe che in review Billing-2 F4 ha flakato 2 run su 2); (ii) per **discriminare** deve spingere la flotta attiva oltre `OPTIONS_PAGE_SIZE`, e una flotta 100+ degrada ogni `<select>` della suite (TD aperto) — quindi deve girare quando non resta più niente da girare. Nulla dipende da esso.
- **La guardia verifica la propria precondizione** prima di asserire: conta i velivoli attivi e, se sono ≤100, crea lo scarto necessario con marche prefissate `I-AFIL…` (che ordinano **prima** della sua `I-ZAOG…`). **Costo misurato e stampato dal test**: `[AC 13] active aircraft before: 13, filler created: 88, active now: 101` — 88 POST, il test dura **2,6 s**. Su DB post-suite il costo tende a zero (i velivoli ci sono già).

**Fixture**: nessuna time-dependent. Ogni data è calcolata con `dateOnlyFromToday(offset)` (mai un letterale che può scadere a metà run), e la data attesa nel messaggio è prodotta dallo **stesso** `Intl.DateTimeFormat` di `formatDateOnly`, non hard-coded. **Nessun `hasText` con date o `H:MM`.** I `<select>` sono pilotati per **valore (id)**, mai per testo dell'opzione — il testo di un'opzione AOG contiene il motivo, e due di questi test fermano il velivolo a metà flusso.

**Precondizione voli**: `ensureValidSeedExpiries(page, personId, 'PILOTS')` su ogni pilota creato — senza, `POST /api/v1/flights` risponde `FLIGHT_BLOCKED_BY_EXPIRY` prima di arrivare alla guardia (l'ho visto nel probe pre-fix: proprio quello è successo sul percorso con data passata).

**Tabella guardia → discriminanza (tutte provate ROSSE simulando il pre-fix, repo ripristinato byte-identico):**

| Guardia nuova | Simulazione del pre-fix | Esito rosso |
|---|---|---|
| «44px touch floor» (AC 6) | rimossa la regola `[data-testid="out-of-service-submit"]{min-height:44px}` | **FAILED** (altezza 34,84 < 44) |
| «picker + 422 + deroga» (AC 8/10/11/12) | guardia AOG neutralizzata in `resolveFlightInput` | **FAILED** (nessun 422, il volo si registra) |
| «data passata blocca ancora» (AC 2c) | idem | **FAILED** (201 invece di 422) |
| «perimetro AD-4» (AC 9) | idem | **FAILED** (`Expected: 422 / Received: 201` sulla correzione che sposta il volo su un velivolo fermo) |
| «Panoramica == Flotta» (AC 13) | `aogCount` riportato a `aircraftResult.items.length - operationalIds.length` | **FAILED** (`Expected: 30 / Received: 9`) |

Ripristino: `sha256sum -c` sui tre file toccati dalla simulazione → **`src/styles/airops.css: OK`, `src/server/services/flights.service.ts: OK`, `src/app/[locale]/dashboard/page.tsx: OK`**. Byte-identico, verificato, non affermato.

Le 4 restanti (editor, i due messaggi 422 di prenotazione) **passano** anche sotto quella simulazione, correttamente: dipendono da `aircraft.service.ts`/`bookings.service.ts`/`aircraft-editor.tsx`, che quella simulazione non toccava.

### §K — Gate ed esiti, onesti

- **`npm run gates`**: `PASS lint (19s) · PASS typecheck (3s) · PASS test (7s) — 1792 passed · PASS build (27s)`. Eseguito **dopo** il ripristino byte-identico della simulazione pre-fix.
- **Unit in shell pulita**: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` su `aircraft.service.test.ts` (58 passed), `bookings.service.test.ts` (240 passed), `flights.service.test.ts` (150 passed) — verde.
- **e2e mirati** (build di produzione, `E2E_REUSE_SERVER=1`, via `scripts/e2e.sh`): `--project=chromium -g "story AOG-1a"` → **8 passed, E2E_EXIT=0**; `--project=aog-overview-count --no-deps` → **1 passed, E2E_EXIT=0**.
- **Suite completa `CI=1` su build di produzione e DB fresco**: esito in §L2.
- **Lock anti-brute-force (TD-6)**: nessun rosso attribuito alla flake di login; nessuno è occorso.

### §L2 — La suite completa, e un mio errore da dichiarare

**Errore mio, diagnosticato con la prova, non attribuito alla flake**: durante il primo run `CI=1` ho lanciato `npm run gates` (che esegue `next build`) mentre la suite stava servendo dalla **stessa** `.next`. Due test di `mobile-registries.spec.ts` sono caduti con

```
[WebServer] errno: -2, code: 'ENOENT', syscall: 'open',
[WebServer] path: '/home/admin/AirManager/.next/server/app-paths-manifest.json'
```

cioè il manifest del server letto mentre la build lo stava riscrivendo. **Entrambi sono passati al retry #1** (quindi la suite li conta *flaky*, non *failed*), ma la causa non è ambientale: è la regola di CLAUDE.md «MAI ricompilare col server vivo», violata da me. Non l'ho mascherata: ho **rifatto la suite completa da capo**, su DB resettato, senza toccare la build durante il run.

**Run 1 (contaminato da me)** — DB fresco, `CI=1`, `scripts/e2e.sh start`: **518 passed, 2 flaky, 0 failed, 0 skipped, `E2E_EXIT=0`**, 14,1 min. Totale **520** = **511** di baseline (arbitro finale dell'epic 15) **+ 9 miei** (8 in `chromium` + 1 in `aog-overview-count`). I 2 flaky sono i due sopra.

**Run 2 (arbitro pulito)** — DB resettato di nuovo, `CI=1`, nessuna build lanciata durante il run: esito sotto.

*Metodo di reset usato* (l'HANDOFF suggerisce `docker compose down -v`; ho scelto la via meno distruttiva, stesso risultato e container in piedi): `DROP DATABASE … WITH (FORCE)` + `CREATE DATABASE` via `docker compose exec -T postgres psql`, poi `npx prisma migrate deploy && npx prisma db seed`. Verificato dopo ogni reset: `aircraft 1 | with_date 0`.

**Run 2 (arbitro pulito)** — DB resettato, `CI=1`, **nessuna build lanciata durante il run**: **519 passed, 1 flaky, 0 failed, 0 skipped, `E2E_EXIT=0`**, 15,1 min. Totale **520**.
Il flaky NON è mio e l'ho **diagnosticato con la prova invece di attribuirlo alla flake**: `mobile-expiries-movements.spec.ts:361` è caduto con `apiRequestContext.post: read ECONNRESET` su `POST /api/v1/expiry-types` — un reset di trasporto, non un'asserzione, su uno spec e un endpoint che **il mio diff non tocca** (classe ambientale già registrata nell'HANDOFF come «POST bloccato sotto contesa worker»). Verde al retry #1.
I miei 9 test: **tutti verdi al primo tentativo in entrambi i run**.

**Coda: una fragilità del MIO spec, trovata da me DOPO l'arbitro, e chiusa.**
Rilanciando lo spec da solo sul DB **post-suite** (misurato: **400 persone, 204 velivoli**) i due test delle prenotazioni sono andati in timeout su `locator.selectOption … did not find some options` per `select[name="personId"]`. Causa: il picker persona del form prenotazione in modalità **staff** è alimentato da `listPeople(page: 1, pageSize: OPTIONS_PAGE_SIZE)` — **cap a 100** — e una persona appena creata cade fuori da quel centinaio su un DB carico. **Non è un difetto della story: è il TD `OPTIONS_PAGE_SIZE` che la story stessa mi aveva avvisato di diagnosticare prima di attribuire.** Nel run completo i due test passavano solo perché giravano presto (DB ancora leggero): fortuna, non robustezza.
Chiuso alla radice: i due test ora guidano il form dal **pilota del seed**, in modalità `pilot`, che **non ha il picker persona** (l'admin resta su un secondo contesto, perché solo `aircraft.manage` può fermare un velivolo, e il fermo deve arrivare col form già a schermo). Il picker velivolo resta l'unico usato ed è **non paginato** (`listBookableAircraft`). Aggiunto anche `findBookingRow`, che **cammina le pagine** invece di dare per scontata la prima (la lista è `startsAt`-ascendente su un DB condiviso: su quale pagina cada una prenotazione è una proprietà delle fixture altrui).
**Riprova sul DB più ostile disponibile** (400 persone, 204 velivoli): `--project=chromium -g "story AOG-1a"` → **8 passed, `E2E_EXIT=0`**; `--project=aog-overview-count --no-deps` → **1 passed, `E2E_EXIT=0`** (`[AC 13] active aircraft before: 187, filler created: 0` — su DB carico la guardia non paga nulla).
**Gate rieseguiti dopo questa correzione**: `PASS lint (20s) · PASS typecheck (3s) · PASS test (7s) — 1792 passed · PASS build (28s)`.
Le modifiche sono **solo dentro `e2e/aircraft-out-of-service-until.spec.ts`**: nessuna riga di produzione è cambiata dopo l'arbitro, quindi il verde del run 2 sul codice di produzione resta valido.

Nota su `[AC 13] active aircraft before: 160, filler created: 0` (run 1): su un DB **post-suite** la guardia non paga nulla — i 160 velivoli attivi che la suite crea da sola superano già `OPTIONS_PAGE_SIZE`. Gli 88 POST li paga solo chi la lancia su un DB fresco con `--no-deps`.

### §M — File toccati

**Schema / dati (3)**
- `prisma/schema.prisma` — `Aircraft.outOfServiceUntil` + doc-comment (la fonte unica della semantica)
- `prisma/migrations/20260807074113_aircraft_out_of_service_until/migration.sql` — **nuovo**, additivo, una riga
- `src/generated/prisma/**` — rigenerato (`npx prisma generate`), gitignorato, mai editato a mano

**Service / contratti (7)**
- `src/server/services/aircraft-status.ts` — **nuovo** (`outOfServiceDetails`, §I.1)
- `src/server/services/aircraft.service.ts`
- `src/server/services/bookings.service.ts`
- `src/server/services/flights.service.ts`
- `src/lib/schemas/aircraft.ts`
- `src/lib/schemas/registry.ts`
- `src/server/auth/rbac.ts` (solo doc-comment)

**API (1)**
- `src/app/api/v1/aircraft/[id]/out-of-service/route.ts`

**UI + i18n (11)**
- `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx`
- `src/app/[locale]/dashboard/fleet/fleet-console.tsx`
- `src/app/[locale]/dashboard/fleet/page.tsx`
- `src/app/[locale]/dashboard/page.tsx`
- `src/app/[locale]/dashboard/dispatch-flight-button.tsx`
- `src/app/[locale]/dashboard/logbook/page.tsx`
- `src/app/[locale]/dashboard/logbook/flight-editor.tsx`
- `src/app/[locale]/dashboard/logbook/logbook-console.tsx`
- `src/app/[locale]/dashboard/bookings/{new,edit}-booking-form.tsx` + `booking-labels.ts`
- `src/styles/airops.css` — **una** regola
- `messages/it.json` + `messages/en.json` — 7 chiavi ciascuno, **parità verificata** (0 chiavi solo-IT, 0 solo-EN)

**Test / config (5)**
- `src/server/services/aircraft.service.test.ts`
- `src/server/services/bookings.service.test.ts`
- `src/server/services/flights.service.test.ts`
- `e2e/aircraft-out-of-service-until.spec.ts` — **nuovo**
- `e2e/aog-overview-count.spec.ts` — **nuovo** + `playwright.config.ts` (project serializzato)

**NON toccati, a riprova del perimetro**: `src/components/dashboard/fleet-card.tsx`, `src/app/[locale]/dashboard/bookings/schedule.tsx`, `src/app/[locale]/dashboard/bookings/page.tsx`, `src/lib/mobile-agenda.ts`, `src/app/[locale]/dashboard/bookings/booking-transition.ts`, `src/server/services/exports.service.ts`, `src/lib/date-only.ts`, `src/components/search-combobox.tsx`, `src/components/ui/date-input.tsx`, `src/components/ui/calendar-popover.tsx`.

### §L — Cosa NON ho fatto

- **Tutto il blocco di AOG-1b**: anteprima «Stai per impattare N prenotazioni», doppio passo di conferma (le label `availability.confirm`/`confirmReturnToService` **restano morte**, verificato), conteggio in transazione, **DTO di response nuovo** di `setOutOfService` (la forma è invariata: la cucitura dello split è intatta), banner persistente, riga persistente alla riapertura, **tutte** le email.
- `groundedAt`, rinomine (`flights.forceExpiry`, `blocksBooking`), il TD `OPTIONS_PAGE_SIZE` sulle altre tre pagine, `date-only.ts`, il TD 14.9 F11, i 40 `var(--bad)`/`var(--ok)` inline, le 42 celle `.cal-popover`, una superficie flotta nuova sulla Panoramica mobile.
- **`sprint-status.yaml` e `docs/handoffs/HANDOFF.md`**: non toccati (sono della sessione principale). Il TD nuovo di AD-9 va registrato lì — §H (d) ne porta il testo e la misura.
- **Nessun commit** (per istruzione).
