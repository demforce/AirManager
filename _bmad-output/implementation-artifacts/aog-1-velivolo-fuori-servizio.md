---
baseline_commit: b5a2c93
---

# Story AOG-1: Velivolo fuori servizio — la data di rientro previsto, l'avviso delle prenotazioni impattate e la guardia sulla registrazione del volo

Status: **ratificata 2026-08-07 — ricognizione + ratifiche; implementazione negli story file `aog-1a` / `aog-1b`**

> Le dieci assunzioni bloccanti di §7 sono state **chiuse dal PO il 2026-08-07**: sotto ogni Q c'è la riga **DECISIONE PO**. Questo file resta il **record storico condiviso** (misure §1, censimento §2, blast radius §5) e **non** è più dispatchabile: il perimetro implementabile vive in
> `_bmad-output/implementation-artifacts/aog-1a-campo-guardia-volo.md` e `_bmad-output/implementation-artifacts/aog-1b-avviso-prenotazioni-email.md`.
> ⚠️ Dove una decisione PO contraddice una raccomandazione o un AC di questo file (**Q1**: semantica inclusiva contro la raccomandazione B; **Q5**: perimetro custom, più stretto di tutte e quattro le opzioni), **vince la riga DECISIONE PO**, e gli AC riscritti negli story file 1a/1b vincono su §4.

> Questa story nasce dall'action item `epic: 15` di `_bmad-output/implementation-artifacts/sprint-status.yaml:476` («STORY DEDICATA post-Epic-15», decisione PO 2026-07-31, opzione 2 di 3). L'item è il **contratto**: i tre requisiti e le due invarianti riportati in §0 **non sono ridiscutibili**. Tutto il resto di questo file è **ricognizione misurata** (§1-§2), **proposta motivata** (§3-§6) e **istruttoria per il PO** (§7).

---

## Story

As **l'amministratore che mette un velivolo fuori servizio**, e come **il pilota che ha una prenotazione approvata su quel velivolo**,

I want che mettere un velivolo in AOG mi dica **subito e senza cercarlo** quante prenotazioni sto impattando, mi lasci registrare **quando conto di riaverlo**, e impedisca che qualcuno registri un volo su un aeromobile fermo,

so that l'AOG smetta di essere **una riga nel database che nessuno difende**: oggi un `POST /api/v1/aircraft/{id}/out-of-service` scrive due colonne, non tocca nemmeno una prenotazione, non manda nemmeno una mail — e **un volo su quel velivolo si registra senza il minimo ostacolo** (provato a runtime, §1.4).

### Il perché, per esteso — l'asimmetria PENDING/APPROVED

I tre blocchi AOG che esistono oggi (`bookings.service.ts:554`, `:922`, `:1151`) fermano **creazione**, **spostamento** e **approvazione**. Ne esce una asimmetria che è il cuore di questa story:

- una prenotazione **PENDING** su un velivolo che va in AOG è **di fatto congelata** — l'admin che prova ad approvarla riceve un 422 col motivo (`transitionBooking`, `PENDING → APPROVED` rifà i controlli di creazione) e capisce perché;
- una prenotazione **APPROVED** sopravvive **INTATTA e MUTA**. Nessun blocco la tocca: nessuno la annulla, nessuno la marca, nessuno avvisa il titolare. L'unico segnale è **visivo** — il blocco AOG disegnato sopra le prenotazioni ancora in piedi nella timeline (desktop) e la riga AOG in testa all'agenda (mobile, R-15.4-h).

Il caso che fa male non è quello dell'admin: è **il pilota che si presenta al campo** con una prenotazione approvata e trova il velivolo smontato, senza che l'app gliel'abbia mai detto. E la domanda che fa subito dopo — *«e quando torna?»* — oggi ha risposta solo se qualcuno si è ricordato di scriverla nel testo libero di `statusReason`.

La **data di rientro previsto** è ciò che rende azionabile il requisito (1): senza, «X prenotazioni impattate» vale «tutte quelle future, per sempre», e nessuno ci fa niente; con, il conteggio si spacca in *prima del rientro previsto = da gestire* e *dopo = probabilmente ok*.

---

## §0 — Requisiti e invarianti FISSATI dal PO (non ridiscutibili)

| # | Requisito |
|---|---|
| **P1** | Quando l'admin mette un velivolo in AOG, l'avviso che esistono **X prenotazioni impattate** deve essere **SUBITO VISIVO** — non un dato da andare a cercare. |
| **P2** | Serve una **guardia sulla REGISTRAZIONE DEL VOLO** per un velivolo fuori servizio (oggi `flights.service.ts` non legge nemmeno `status`). |
| **P3** | `outOfServiceUntil DateTime?` su `Aircraft` — **data di rientro previsto OPZIONALE e INFORMATIVA**, con lo **stesso ciclo di vita di `statusReason`** (scritta col motivo, azzerata al rientro, regola **nel service**, mai a livello DB). |

| # | Invariante |
|---|---|
| **[a]** | **La data NON rimette MAI il velivolo in servizio da sola.** Un aeromobile è aeronavigabile quando lo dichiara una persona, non quando scade un timestamp. Il rientro resta **`returnToService` esplicito**. Nessun job, nessun cron, nessuna query che «filtri via» un AOG scaduto. |
| **[b]** | **Il campo è OPZIONALE.** Un AOG non programmato in attesa di un pezzo non ha una data, e renderla obbligatoria produce date inventate: senza data il conteggio è **dichiarato non delimitato** («rientro da definire»). |

---

## §1 — Ricognizione sul codice REALE (2026-08-07, `b5a2c93`)

I fatti misurati dell'action item sono di **fine luglio**: l'epic 15 ha rifatto tutte le superfici. Li ho **riverificati uno per uno**. Tre righe sono slittate, il resto tiene.

### §1.1 Fatti dell'action item — verificati vs slittati

| Fatto dichiarato nell'item | Riga dichiarata | Riga **VERA** su `b5a2c93` | Esito |
|---|---|---|---|
| `setOutOfService` scrive SOLO `status` + `statusReason`, con guardia atomica | `aircraft.service.ts:393-416` | **`:393-416`** (`updateMany` guardata `status:'OPERATIONAL'` a `:406-409`, `ConflictError` a `:411`, rilettura `findUniqueOrThrow` a `:414`) | **CONFERMATO alla riga** |
| Blocco AOG in **creazione** prenotazione | `bookings.service.ts:554` | **`:554`** (`if (aircraft.status === 'OUT_OF_SERVICE')`, throw a `:555`) | **CONFERMATO alla riga** |
| Blocco AOG in **spostamento** (anche per admin) | `bookings.service.ts:903` | **`:922`** (throw `:923-927`) | **SLITTATO +19** |
| Blocco AOG in **approvazione** (dentro `transitionBooking`) | `bookings.service.ts:1132` | **`:1151`** (throw `:1152-1156`) | **SLITTATO +19** |
| `flights.service.ts` NON legge `status` | `:496` | **`:496-499`** — `select: { id: true, registration: true, archivedAt: true }`. `status` **assente**. | **CONFERMATO alla riga** |
| `listOutOfServiceAircraft` già esistente | `:202-215` | **`:211-221`** (il doc-comment inizia a `:202`, la `export async function` è a `:211`) | **SLITTATO** (l'item citava il doc-comment) |
| Le uniche 3 occorrenze di `AIRCRAFT_OUT_OF_SERVICE` nel dominio sono in `bookings.service.ts` | — | **CONFERMATO**: `grep -rn AIRCRAFT_OUT_OF_SERVICE src/server/services/` → `bookings.service.ts:555`, `:926`, `:1155`. Zero in `flights.service.ts`. | **CONFERMATO** |
| Il commento «il vero blocco arriva con l'Epic 7» | `aircraft.service.ts:391` | **`:387-391`** (doc-comment di `setOutOfService`) | **CONFERMATO** (contenuto identico) |

### §1.2 Ciclo di vita attuale di `statusReason` — il modello che `outOfServiceUntil` deve copiare

- **Scrittura**: `setOutOfService` (`aircraft.service.ts:393-416`) — `updateMany({ where: { id, status: 'OPERATIONAL' }, data: { status: 'OUT_OF_SERVICE', statusReason: reason } })`. La guardia atomica sulla `where` (review 2.2 F1) fa sì che due chiamate concorrenti non possano entrambe «vincere»: la perdente matcha zero righe e prende `ConflictError` (409).
- **Azzeramento**: `returnToService` (`:423-438`) — `updateMany({ where: { id, status: 'OUT_OF_SERVICE' }, data: { status: 'OPERATIONAL', statusReason: null } })`, con la guardia speculare. Doc-comment `:418-422`: *«a stale reason from a previous grounding must never linger once the aircraft is airworthy again»* — è **esattamente** la regola che la data deve ereditare.
- **Livello DB**: nessuna regola. `prisma/schema.prisma`, `model Aircraft`, doc-comment su `statusReason`: *«Mandatory while `status == OUT_OF_SERVICE`; reset to `null` on return to service (enforced in `aircraft.service.ts`, not at the DB level)»*.
- **Validazione input**: `setOutOfServiceSchema` (`src/lib/schemas/aircraft.ts:90-94`) — `{ reason: z.string().trim().min(1).max(500) }`. Cap a 500 per difesa in profondità (review 2.4 F2 / 2.5 F3).
- **DTO**: `AircraftListItem` (`aircraft.service.ts:15-32`) → `AIRCRAFT_SELECT` (`:37-50`) → `toListItem` (`:54-70`) → `aircraftListItemSchema` (`src/lib/schemas/aircraft.ts:172-186`). **Quattro punti** da toccare in fila per un campo nuovo, tutti nello stesso file o adiacenti.

### §1.3 Il flusso admin che mette AOG — misurato a runtime

Build di produzione (`env -u NODE_ENV npm run build && npm run start`, `JOBS_SECRET` esportato), DB post-suite (**148 velivoli attivi, 3 AOG, 92 prenotazioni, 386 persone, 121 voli**), login `admin@airmanager.local`, misure con `playwright-core` throwaway, **zero scritture di dominio**.

Il flusso vive in **UN SOLO posto**: la sezione **«Disponibilità»** dello `SlideOver` `AircraftEditor`, su `/dashboard/fleet` (`src/app/[locale]/dashboard/fleet/aircraft-editor.tsx`, sezione montata a `:286`, corpo `AvailabilitySection` `:690-765`).

| Misura | Desktop 1280×900 | Telefono 375×812 |
|---|---|---|
| Larghezza pannello (`[role=dialog]`) | **520px** (x=760) | **375px** (x=0, a tutto schermo) |
| `availability-current` (`<p>`, testo «Stato attuale: …») | y **556**, h 15 | y **699**, h 15 |
| `out-of-service-reason` (`<textarea rows=2>`) | y **593**, 479×56 | y **736**, 335×56 |
| `out-of-service-submit` (`<button class="btn">`) | y **662**, h **34,84** | y **806**, 335×**34,84** — **bottom 841 > 812: sotto il fold** |
| `identity-submit` (submit PRIMARIO, nel `.so-foot` dalla 15.10) | y 853, h 35 | y 756, **h 44** |
| `role`/`aria-modal` del pannello | `dialog` / `true` (15.10) | idem |

**Tre fatti che contano per il design:**

1. **Il submit dell'AOG è a 34,84px sul telefono** — sotto i 44 dell'epic 15. Non è un difetto introdotto: la ratifica **R-15.10-f** ha messo nel `.so-foot` solo il submit **PRIMARIO** (`identity-submit`, misurato 44px), lasciando dove stavano le **azioni secondarie di sezione** (tariffe, contaore, archivio, **disponibilità**). Se questa story aggiunge pixel a quella sezione, deve **dichiarare** cosa fa di quel bersaglio (Q7).
2. **Il toast dura 2600 ms** (`src/components/ui/toast.tsx:26`, `TOAST_LIFETIME_MS = 2600`). Oggi il successo dell'AOG è annunciato **solo** da un toast (`aircraft-editor.tsx:713`, `toastLabels.setOutOfService` = «Velivolo segnato fuori servizio.»). **Un toast non è un portatore accettabile per «X prenotazioni impattate»**: 2,6 secondi e sparisce, e P1 dice «SUBITO VISIVO», non «visibile per due secondi e mezzo».
3. **Esistono due label MORTE già pronte per una conferma**: `AircraftPage.editor.availability.confirm` («Conferma») e `.confirmReturnToService` («Rimettere in servizio questo velivolo?») sono dichiarate nel tipo (`aircraft-editor.tsx:66-67`) e passate dalla pagina (`fleet/page.tsx:187-188`), ma **mai consumate** — `grep 'labels.availability'` nel componente dà 5 occorrenze: `sectionTitle`, `current`, `returnToService`, `reason`, `setOutOfService`. La conferma è stata progettata e mai implementata: un secondo passo di conferma qui **riusa una stringa già tradotta**, non ne inventa una.

### §1.4 La guardia sul volo — l'assenza PROVATA a runtime, non solo letta

`resolveFlightInput` (`flights.service.ts:477`, condivisa da `registerFlight` `:913` e `correctFlight` `:1238`) ha un ordine di guardie **documentato** nel proprio doc-comment (`:413-417`): *aircraft exists → 404; person exists → 404; **aircraft archived → `AIRCRAFT_ARCHIVED`** (`:520-521`); person archived → …; …; **data del volo nel futuro → `FLIGHT_DATE_IN_FUTURE`** (`:575-577`)*.

Una guardia di **stato del velivolo** starebbe **prima** del controllo sulla data (accanto a `AIRCRAFT_ARCHIVED`). Quindi: se registro un volo su un velivolo AOG con una **data futura**, il codice che risponde mi dice qual è la prima guardia che ho incontrato.

Probe write-free (422 prima di qualunque transazione, nessuna riga creata), velivolo `I-SMSI1EO98HDS` (AOG, motivo «Revisione 15.5»), pilota con profilo attivo:

```
POST /api/v1/flights {aircraftId: <AOG>, takeoffAt: 2031-05-04T09:00Z, landingAt: …T10:00Z}
→ 422 {"error":{"code":"FLIGHT_DATE_IN_FUTURE","message":"Flight date cannot be in the future."}}

POST /api/v1/flights {aircraftId: <AOG>, takeoffAt: 2020-01-04T10:00Z, landingAt: …T09:00Z}
→ 422 {"error":{"code":"FLIGHT_TIMES_INVALID","message":"landingAt must be strictly after takeoffAt."}}
```

Controprova sullo stesso velivolo, stesso momento, percorso prenotazioni:

```
POST /api/v1/bookings {aircraftId: <AOG>, startsAt: 2031-05-04T09:00Z, …}
→ 422 {"error":{"code":"AIRCRAFT_OUT_OF_SERVICE","message":"Aircraft is out of service: Revisione 15.5.",
        "details":{"reason":"Revisione 15.5"}}}
```

**Verdetto**: un volo su un velivolo fuori servizio attraversa **tutte** le guardie di stato dell'aeromobile. L'unica cosa che lo ferma è la data o l'orario. La guardia non esiste — provato, non dedotto.

### §1.5 Il picker velivolo del volo NON sa nulla dell'AOG

Il form prenotazione usa un `<select>` con l'opzione **disabilitata** e il motivo nel testo (misurato: `«I-SMSI1EO98HDS — Revisione 15.5 (fuori servizio)»`, `disabled=true`, identico a 1280 e a 375). Il form **volo** no:

- `logbook/page.tsx:124-126` costruisce `aircraftOptions` come `{ id, registration }` — **`status` e `statusReason` non viaggiano**;
- idem `dashboard/page.tsx:386` (`dispatchAircraftOptions`, la CTA «Pianifica volo» che riusa lo **stesso** `FlightEditor`);
- il controllo è un **`SearchCombobox`** (`flight-editor.tsx:422-427`), non un `<select>`: **non esiste l'affordance «opzione disabilitata»** che il form prenotazione usa.

Quindi la guardia volo, oltre al 422, ha un **buco di affordance** da decidere (Q4): il picker può nominare l'AOG come fa il form prenotazione, oppure no.

### §1.6 Il conteggio delle prenotazioni impattate — dati reali

| Misura sul DB post-suite | Valore |
|---|---|
| Prenotazioni totali | **92** — APPROVED **63**, CANCELLED 13, PENDING **11**, FLOWN 2, DENIED 2, NO_SHOW 1 |
| Prenotazioni sui **3 velivoli AOG** attuali | **0** (sono tre velivoli run-unique creati dagli spec, mai prenotati) |
| Velivolo con più prenotazioni future vive | `I-BK1786051898884-22` — **21 APPROVED future**, 0 PENDING |
| Stati «vivi» ai fini dell'impatto | `PENDING` (congelata) + `APPROVED` (muta e pericolosa). `DENIED`/`CANCELLED`/`FLOWN`/`NO_SHOW` sono stati chiusi. |

`GET /api/v1/bookings` sa già filtrare esattamente questo: `listBookingsQuerySchema` (`src/lib/schemas/bookings.ts:110-117`) espone `aircraftId`, `from`, `to`, `status` (CSV) e restituisce `total` nella busta paginata AD-8. **Il conteggio non richiede una query nuova nel senso di un concetto nuovo** — richiede di decidere *dove* farlo (Q2).

### §1.7 Difetto NUOVO scoperto in ricognizione — il conteggio AOG della Panoramica è **sbagliato**

Misurato sulla stessa build, stesso istante, stesso DB:

| Pagina | Testo misurato | Fonte | Corretto? |
|---|---|---|---|
| `/dashboard` (Panoramica), `.page-head .sub` | «LIMH · **1 AOG** · 15 PPR in attesa · 10 in transito al suolo» | `dashboard/page.tsx:327` — `aogCount = aircraftResult.items.length - operationalIds.length`, dove `aircraftResult = listAircraft(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE /* = 100, :70 */ })` | **NO** |
| `/dashboard/fleet`, `.page-head .sub` | «148 totali · 145 disponibili · **3 AOG**» | `fleet/page.tsx:61` — `listOutOfServiceAircraft` (non paginata, `aircraft.service.ts:211-221`) | **SÌ** |

Con **148 velivoli attivi** la Panoramica conta l'AOG solo sui **primi 100 in ordine di marca** e ne dichiara **1 invece di 3**. Visibile **a entrambe le larghezze** (il `.sub` è l'unica superficie AOG che il telefono ha sulla Panoramica: la `FleetCard` è `.home-desktop-surface`, misurata `visible:false` a 375px, e la `.overview-mobile` **non ha alcuna superficie flotta**).

È una faccia nota del TD `OPTIONS_PAGE_SIZE = 100` (`sprint-status.yaml`, item «TD emerso in 15.3»), ma qui **non degrada un picker: dichiara un numero falso proprio sulla grandezza che P1 vuole rendere visibile**. Non è mio d'ufficio → **Q6**.

---

## §2 — Censimento delle superfici dove l'AOG affiora oggi

L'action item ne stimava «≥6». Ne ho contate **15** con `grep` (mai a memoria), verificandone la visibilità a **1280×900** e **375×812**. `outOfServiceUntil` viaggia sugli **stessi** percorsi: questa tabella è il **blast radius del campo**.

| # | Superficie | File:riga | Desktop | Mobile | Cosa mostra oggi | Cosa deve mostrare con la data |
|---|---|---|---|---|---|---|
| 1 | **Editor velivolo — sezione Disponibilità** (dove si mette AOG) | `fleet/aircraft-editor.tsx:286`, `:690-765` | sì (pannello 520px) | sì (a tutto schermo) | `Stato attuale: {statusReason}`; textarea motivo; submit; bottone rientro | **campo data** (input) + **la data nello «Stato attuale»** + **avviso X prenotazioni** (P1) |
| 2 | **Card flotta desktop** `.ac-card.aog` | `components/dashboard/fleet-card.tsx:73-100`, badge `:41-63` | sì | no (`display:none` ≤640) | badge «AOG», tinta `.aog`; **motivo NON mostrato** | decidere se la data entra qui (Q5) |
| 3 | **Card flotta mobile** `mobile-fleet-card-{id}` | `fleet/fleet-console.tsx:230-256` | no | sì | badge «AOG», tinta `.aog`; motivo NON mostrato | idem #2 (parità obbligatoria) |
| 4 | **Sheet flotta mobile** `mobile-fleet-sheet` | `fleet/fleet-console.tsx:299-333`, righe `:339-357` | no | sì | riga «Stato» + riga **«Motivo AOG»** (`:343-344`) | **riga «Rientro previsto»** accanto al motivo |
| 5 | **Testata pagina Flotta** `.sub` | `fleet/page.tsx:61`, `:78-80`, i18n `AircraftPage.sub` | sì | sì | «148 totali · 145 disponibili · 3 AOG» (**corretto**) | invariata (salvo Q6) |
| 6 | **Testata Panoramica** `.sub` | `dashboard/page.tsx:264`, `:327`, `:331` | sì | sì | «… · **1 AOG** · …» (**SBAGLIATO**, §1.7) | Q6 |
| 7 | **Widget Flotta della Panoramica** (`FleetCard`) | `dashboard/page.tsx:399-415`, `:712-731` | sì | **no** (`.home-desktop-surface`) | badge AOG sulle card + `aogCount` nel sommario | eredita #2 |
| 8 | **Timeline desktop — pill di riga** `.res-status.aog` | `bookings/schedule.tsx:611-620` | sì | no | pallino `--bad` + «AOG» | invariata |
| 9 | **Timeline desktop — blocco** `schedule-aog-block` | `bookings/schedule.tsx:633-640` | sì (3 blocchi misurati) | no (`.schedule` `display:none` a 375) | `f-head`=«AOG», `f-sub`=`statusReason` | **`f-sub` deve poter portare la data** |
| 10 | **Agenda mobile — righe AOG in testa** (R-15.4-h) | `bookings/schedule.tsx:322-325` (`agendaTitle`), `:334-339` (`agendaSub`); dati `bookings/page.tsx:285-318`; derivazione pura `src/lib/mobile-agenda.ts:40,55-70` | no | sì (3 righe misurate) | titolo «{marca} fuori servizio», sub = `statusReason` | **sub o riga di dettaglio con la data** |
| 11 | **Sheet dell'agenda mobile** | `bookings/schedule.tsx:341-348` | no | sì | righe «Velivolo» + «Motivo» | **riga «Rientro previsto»** |
| 12 | **Form nuova prenotazione — opzione disabilitata** | `bookings/new-booking-form.tsx:18-24`, `:400-412`; i18n `BookingsPage.form.outOfServiceSuffix` | sì | sì (stesso `<select>`, h **36px**) | «I-XXX — {motivo} (fuori servizio)», `disabled` | il suffisso può portare la data |
| 13 | **Form modifica prenotazione — idem** | `bookings/edit-booking-form.tsx:26-34`, `:196-206` | sì | sì | idem #12 | idem |
| 14 | **Messaggi 422 `AIRCRAFT_OUT_OF_SERVICE`** (3 percorsi) | `new-booking-form.tsx:304-305`, `edit-booking-form.tsx:167-168`, `booking-transition.ts:33,56-57`; label `booking-labels.ts:123,162,223` | sì | sì | «Il velivolo è fuori servizio: {reason}.» | **«… rientro previsto il {date}»** — la stessa medicina di **R-15.4-g** |
| 15 | **Export Excel velivoli** | `server/services/exports.service.ts:197-209` (colonna `operationalStatus` `:203-206`) | — | — | colonna «Stato operativo» = Operativo/Fuori servizio; **nessun motivo, nessuna data** | Q5 (colonna nuova sì/no) |

**Sorgenti dati che alimentano quelle 15 superfici** (i punti dove il campo deve entrare perché il resto lo veda):
`aircraft.service.ts` `AircraftListItem:15-32` / `AIRCRAFT_SELECT:37-50` / `toListItem:54-70` · `schemas/aircraft.ts:172-186` (`aircraftListItemSchema`) · `bookings.service.ts:1234` (`BookableAircraftOption`) + `:1247-1254` (`listBookableAircraft`, `select` esplicito) · `components/dashboard/fleet-card.tsx:20-37` (`FleetCardItem`) · `bookings/schedule.tsx:48-54` (`ScheduleAircraftRow`) + `:62-82` (`ScheduleAgendaRow`).

**Superficie MANCANTE, degna di nota**: sul telefono la Panoramica **non ha alcuna faccia flotta** — `.overview-mobile` (`dashboard/page.tsx:543`) porta «In corso ora», «Prenotazioni in attesa», ecc., misurato. L'unico segnale AOG che un telefono vede sulla home è il contatore del `.sub` (§1.7, sbagliato). **Non propongo di aggiungerne una**: sarebbe una superficie nuova fuori dal contratto. La dichiaro.

---

## §3 — Decisioni architetturali proposte (ognuna con il suo perché)

### AD-1 — `outOfServiceUntil` è un `DateTime?` **date-only**, scritto e azzerato SOLO dal service

Schema (migrazione **additiva**, nessun backfill: ogni riga esistente parte `NULL`, che è esattamente «rientro da definire»):

```prisma
/// Expected return-to-service date (story AOG-1), calendar-only. INFORMATIVE:
/// it never returns the aircraft to service by itself (invariant [a]) — only
/// `returnToService` does. Same life-cycle as `statusReason`: written together
/// with it by `setOutOfService`, reset to `null` by `returnToService`
/// (enforced in `aircraft.service.ts`, not at the DB level). OPTIONAL
/// (invariant [b]): `null` means "return date not yet known".
outOfServiceUntil DateTime? @db.Date
```

Perché `@db.Date` e non un timestamp: il dominio è **un giorno di calendario**, e il repo ha già l'infrastruttura per farlo bene — `src/lib/date-only.ts` (`parseDateOnlyUtc`, `toDateOnlyString`, `todayDateOnlyUtc`), con la lezione review 3.5 F1 scritta nel doc-comment: *una colonna `@db.Date` va confrontata come data di calendario, mai come timestamp*. Le stesse funzioni che 7.4/14.4 usano per confrontare una scadenza col **giorno del volo**.

⚠️ **TD 14.8 F6**: `parseDateOnlyUtc` mappa gli anni `0-99` su `1900+anno` (`'0001-01-01'` finisce a DB come `1901-01-01` in silenzio). Se la story **tocca** `date-only.ts` deve chiuderlo (`setUTCFullYear` post-costruzione o rifiuto anni <1000 nello schema). Se **non** lo tocca, deve **dichiarare** che il campo nuovo eredita la classe (input `z.iso.date()` come le altre date). → Q8.

### AD-2 — Il ciclo di vita nel service, con la guardia atomica INTATTA

- `setOutOfService(actor, id, { reason, outOfServiceUntil? })`: la `updateMany` guardata resta **identica** nella `where` (`{ id, status: 'OPERATIONAL' }`) e aggiunge **una** chiave nel `data`. Nessuna riga della disciplina di concorrenza cambia.
- `returnToService`: `data: { status: 'OPERATIONAL', statusReason: null, outOfServiceUntil: null }` — l'azzeramento è **nella stessa istruzione** dello `statusReason`, così non esistono due percorsi che possano divergere (il doc-comment `:418-422` diventa la spiegazione di entrambi i campi).
- **Nessun** filtro, `where`, indice o job che tratti `outOfServiceUntil` come una condizione di servizio. **Invariante [a] garantita per costruzione**: il campo è letto solo per **mostrare** e per **contare**, mai per decidere se un velivolo vola.

### AD-3 — Il 422 arricchito: la stessa medicina di R-15.4-g

I tre `ValidationError` esistenti già portano `{ reason }` in `details` (`bookings.service.ts:555`, `:925`, `:1154`). Diventano `{ reason, outOfServiceUntil }` (ISO date o `null`) e i tre messaggi UI (#14 del censimento) guadagnano il ramo «rientro previsto il {data}» / «rientro da definire».

Il precedente è esplicito: **R-15.4-g** ha stabilito che un 422 deve **dire** all'utente il vincolo che ha incontrato (lì la finestra di prenotazione, coi valori già in pagina), in **entrambi i locale**, su **creazione e modifica** — e che cambiare un **testo** anche sul desktop è una deviazione **consapevole da dichiarare nel record**, non da nascondere. Identico qui.

`details` è **additivo**: ogni consumer esistente ignora i campi che non conosce (stessa convenzione di `Booking`'s DTO, `schemas/bookings.ts:126-131`).

### AD-4 — La guardia volo vive in `resolveFlightInput`, accanto ad `AIRCRAFT_ARCHIVED`

`resolveFlightInput` è **condivisa** da `registerFlight` (`:913`) e `correctFlight` (`:1238`): metterla lì significa che «tutti i 422 si applicano ai DATI NUOVI» vale anche per questa, senza una seconda copia che diverge (è la ragione per cui la funzione esiste, story 5.3 Task 2).

Il `select` di `:496-499` guadagna `status` e `statusReason` (+ `outOfServiceUntil`), e il check si posiziona **subito dopo** `AIRCRAFT_ARCHIVED` (`:520-521`) — così l'ordine documentato *existence 404 → state 422 → domain 422* resta quello, e il probe di §1.4 diventa **rosso** (il pre-fix rispondeva `FLIGHT_DATE_IN_FUTURE`, il post-fix deve rispondere `AIRCRAFT_OUT_OF_SERVICE`): **la discriminanza del fix è già scritta**.

**Perimetro** (proposto, → **Q3**):

| Percorso | Guardia? | Perché |
|---|---|---|
| `registerFlight` (volo nuovo) | **SÌ** | è il requisito P2 |
| `correctFlight` **che CAMBIA velivolo** verso un AOG | **SÌ** | è una registrazione nuova su quel velivolo |
| `correctFlight` che **NON** cambia velivolo | **NO** | principio **R-14.4-b**/**R-14.3-a**: correggere non è registrare da capo. Bloccare la correzione delle *note* di un volo storico perché il velivolo è fermo **oggi** è il vicolo cieco che la 14.4 ha già dovuto chiudere una volta |
| `cancelFlight` (storno) | **MAI** | uno storno deve sempre poter essere fatto; ostacolarlo è una trappola pura |

### AD-5 — Perché la guardia volo **non può** essere datata (fatto misurato, non opinione)

`Aircraft` **non ha una data di inizio AOG**. Le colonne sono `status`, `statusReason` e (nuova) `outOfServiceUntil`; `updatedAt` cambia a **ogni** update (anche una modifica di note o un `adjustHourMeter`) ed è quindi inservibile come «messo a terra il».

Conseguenza diretta: la guardia volo può confrontarsi **solo con lo stato CORRENTE**, mai con la data del volo. E questo produce il caso che rende la scelta blocco-secco/deroga **non teorica**:

> il velivolo rientra con un atterraggio duro → l'admin lo mette **subito** in AOG → poi si siede e **registra il volo di ieri/di stamattina**, quello che ha causato l'AOG. Con un blocco secco, quel volo **non si può più registrare**. Mai. È un vicolo cieco della stessa classe di **14.4 F4**.

Aggiungere una colonna `groundedAt` per datare la guardia sarebbe **fuori dal contratto** (P3 nomina un solo campo) e speculativo (karpathy §2). **Lo dichiaro e non lo faccio.**

### AD-6 — La deroga, se il PO la vuole, **costa quasi zero**: l'impianto esiste già

Questa è la scoperta che rende **Q3** una domanda economica e non filosofica. Se la guardia volo diventa «blocco + deroga admin motivata», **non serve costruire niente**:

| Pezzo | Esiste già? | Dove |
|---|---|---|
| `force` + `forceReason` nel body | **SÌ** | `schemas/flights.ts:110-119` (`.refine` che rende `forceReason` obbligatorio *incondizionatamente* quando `force: true`) |
| Permesso ADMIN-only per forzare | **SÌ** | `flights.forceExpiry` (`server/auth/rbac.ts:58,75`), controllato **per PRIMO, prima di ogni query** (`flights.service.ts:492-494`) |
| Colonne di tracciamento sul `Flight` | **SÌ** | `forcedAt`/`forcedByUserId`/`forceReason` (migrazione `20260729092054_flight_expiry_block_force`) |
| Propagazione dello stamp fino alla riga | **SÌ** | `forceStamp` in `ResolvedFlightInput:364` → `registerFlightCore:771,805` |
| Masking del motivo ai non-`flights.manage` | **SÌ** | R-14.4-c, `toListItem:313-318` |
| Badge «Deroga» nel registro voli | **SÌ** | `logbook-console.tsx:365-378` |
| Sezione «Forza registrazione» nel form | **SÌ** | `flight-editor.tsx:952-1000` — ma **gated su `blockedDocuments`** (`:953`), quindi serve un secondo innesco per il ramo AOG |

Costo reale della deroga ≈ **una condizione in più su `forceStamp`, un secondo innesco nel form, due stringhe i18n**. Il costo di **non** averla è il vicolo cieco di AD-5.

Nota sul nome: `flights.forceExpiry` diventerebbe un nome un po' stretto per una deroga che copre due blocchi. **Non rinominarlo** — è esattamente la decisione **F3 della 14.4** su `blocksBooking` (rinominare avrebbe toccato UI/i18n/test senza cambiare la semantica): si aggiorna il **doc-comment**, non l'identificatore.

### AD-7 — Rapporto col TD 14.9 F11 (422-prima-di-403), dichiarato

Il TD aperto dice: `/api/v1/stats` e `/api/v1/cash-report` rispondono **422 (Zod) prima del 403**, mentre tutti gli altri endpoint gated fanno 403 — un attore non autorizzato apprende la forma dei parametri.

**Il 422 nuovo di questa story non tocca quella convenzione, e va detto perché**: `AIRCRAFT_OUT_OF_SERVICE` sul percorso volo nasce **dentro il service**, **dopo** `authorize(actor, 'flights.manage')` (che è la prima riga di `registerFlight`) e dopo il 403 di `flights.forceExpiry`. Un attore senza permesso prende **403 e non arriva mai** a vederlo. Stessa posizione dei tre 422 gemelli delle prenotazioni. → **da scrivere nel Dev Agent Record**, non da fixare qui.

### AD-8 — Contratti OpenAPI aggiornati **nello stesso commit**

`POST /api/v1/aircraft/{id}/out-of-service` ha una rotta e una registrazione: `src/app/api/v1/aircraft/[id]/out-of-service/route.ts` + `registry.ts:263` (`SetOutOfServiceRequest`) + `registry.ts:1097-1109` (path). Il **body cambia** (campo nuovo) e la **response cambia** (se si sceglie di portare il conteggio, Q2).

**Lezione 15.9**: il registry va aggiornato **nello stesso commit** — `registry.test.ts` usa `expect.arrayContaining`, quindi **non segnala** una rotta o uno schema mancante (è già il contenuto dell'action item aperto «F5 review 12.11: 8 route non registrate»). Vale anche per `aircraftListItemSchema` (`:172-186`), che documenta il DTO.

---

## §4 — Acceptance Criteria (numerati, verificabili, misurabili)

> Ogni AC che dice «misurato» richiede **un numero nel Dev Agent Record**, non un'affermazione. Ogni AC che dice «discriminante» richiede la **prova che il test è rosso sul pre-fix** (repo ripristinato byte-identico dopo, lezione 13.7/15.10).

### Schema e ciclo di vita

**AC-1** — `Aircraft.outOfServiceUntil DateTime? @db.Date` esiste, tramite **migrazione additiva** (`npx prisma migrate dev`, client rigenerato — lezione 14.4: `npm run gates` **non** cattura un client Prisma stantio). Nessuna riga esistente modificata: `SELECT count(*) FROM "Aircraft" WHERE "outOfServiceUntil" IS NOT NULL` = **0** subito dopo la migrazione, riportato.

**AC-2 (invariante [a], BLOCCANTE)** — *La data non rimette mai in servizio da sola.* Prove richieste, tutte e tre:
  - (a) **unit**: un velivolo con `status='OUT_OF_SERVICE'` e `outOfServiceUntil` **nel passato** resta `OUT_OF_SERVICE` — `getAircraft`/`listAircraft`/`listOutOfServiceAircraft` lo restituiscono ancora AOG, e `createBooking` su di esso risponde ancora **422 `AIRCRAFT_OUT_OF_SERVICE`**;
  - (b) **statico**: `grep -rn 'outOfServiceUntil' src/server/` non mostra **nessuna** occorrenza dentro una `where` Prisma, un `if` che decida lo stato, o un job — l'elenco delle occorrenze va nel record, **classificato una per una** (lettura/visualizzazione/conteggio);
  - (c) **e2e**: un velivolo messo AOG con data **di ieri** è ancora rifiutato dalla creazione prenotazione e (AC-6) dalla registrazione volo.

**AC-3 (invariante [b])** — *Il campo è opzionale.* `POST /api/v1/aircraft/{id}/out-of-service` **senza** `outOfServiceUntil` risponde **200** e scrive `null` (unit + e2e). Ogni superficie del censimento §2 che mostra la data mostra, in sua assenza, la dicitura «rientro da definire» (i18n IT/EN) e **mai** una stringa vuota, un `—` ambiguo dove il posto è nominato, o una data inventata. `returnToService` azzera `outOfServiceUntil` **insieme** a `statusReason`: unit che asserisce **entrambe** le chiavi nella **stessa** `updateMany`, con la `where` guardata **invariata**.

### L'avviso «X prenotazioni impattate» (P1)

**AC-4** — Mettendo un velivolo in AOG, chi lo fa vede **entro la stessa interazione, senza navigare altrove**, quante prenotazioni vive sono impattate, **spaccate per stato** (PENDING «congelate» / APPROVED «da gestire») e con la finestra **dichiarata in chiaro** (fino al {data} / non delimitata). Il portatore dell'avviso è **persistente**, non un toast: verifica esplicita che il messaggio sia ancora presente e leggibile **≥ 5 s** dopo la conferma (il toast dura 2600 ms, `toast.tsx:26` — un test che lo misuri sotto quella soglia non prova niente).

**AC-5** — Il conteggio è **esatto su fixture note e run-unique**: uno spec crea **un proprio** velivolo, **N₁ PENDING + N₂ APPROVED future** su di esso (più almeno **una CANCELLED e una DENIED che NON devono contare**, e almeno **una passata** che non deve contare), lo mette AOG e asserisce **i due numeri esatti**. Vietato asserire per uguaglianza un aggregato **globale** (i «3 AOG» della Flotta, l'«1 AOG» della Panoramica): sotto `fullyParallel` flaka per costruzione — review **Billing-2 F4**.

### La guardia sul volo (P2)

**AC-6** — `POST /api/v1/flights` su un velivolo `OUT_OF_SERVICE` risponde **422 `AIRCRAFT_OUT_OF_SERVICE`** con `details.reason` **e** `details.outOfServiceUntil` (ISO date o `null`). **Discriminanza obbligatoria**: il probe di §1.4 (data futura su velivolo AOG) risponde `FLIGHT_DATE_IN_FUTURE` **prima** del fix e `AIRCRAFT_OUT_OF_SERVICE` **dopo** — riportare **entrambe** le risposte nel record.

**AC-7** — Il perimetro di AD-4 è rispettato e **provato riga per riga**: `registerFlight` bloccato; `correctFlight` che **cambia** velivolo verso un AOG bloccato; `correctFlight` a velivolo **invariato** **NON** bloccato (unit dedicato: una correzione di sole note su un volo storico il cui velivolo è AOG oggi passa); `cancelFlight` **mai** bloccato. Quattro test, quattro esiti.

**AC-8** — Esercitata **via API** (AC-6) **e via UI**: dal `FlightEditor` di `/dashboard/logbook` **e** dalla CTA «Pianifica volo» della Panoramica (`dispatch-flight-button.tsx`, **stesso** componente) l'operatore vede un messaggio che **nomina il velivolo, il motivo e il rientro previsto** — mai il generico `labels.errors.generic` (che è ciò che si otterrebbe **senza** una chiave i18n nuova: `flight-editor.tsx:627-628` fa `knownErrors[code] ?? generic`). Nessun **vicolo cieco** (lezione 14.6 F2): se la deroga esiste (Q3) e l'attore non può usarla, l'affordance non compare.

**AC-8-bis** *(solo se Q3 = deroga)* — La deroga è **deliberata, motivata e tracciata**: `force` senza `flights.forceExpiry` → **403 prima di ogni query**; `force: true` senza `forceReason` → 422 dallo schema; deroga riuscita → `forcedAt`/`forcedByUserId`/`forceReason` sulla riga `Flight` e badge «Deroga» nel registro; `force: true` **senza niente da scavalcare** → **nessuno stamp** (convenzione «scavalcato un blocco, non spuntata una checkbox», `schema.prisma`, `Booking.forcedAt`). E, ereditato dalla 14.4 F1 (BLOCKER): il pannello **rimonta** fra chiusure (`key`), così `pendingForceBody` non sopravvive — verificato **anche** sulla CTA della Panoramica.

### Le superfici, la parità e il colore

**AC-9** — Tutte le superfici del censimento §2 che il PO decide di toccare (Q5) mostrano la data in modo **coerente in IT e EN**, e per **ognuna** il record riporta la misura **prima/dopo** a **1280×900 e 375×812**. Le superfici **non** toccate sono elencate **una per una** con il motivo (mai «le altre restano com'erano»).

**AC-10 (parità desktop/mobile)** — Per ogni coppia desktop/mobile toccata (card flotta #2/#3, sheet #4, timeline #9 / agenda #10-#11, form #12-#13) le **due facce dicono la stessa cosa sullo stesso dato**. Divergere sullo stesso dato è ciò che l'epic 15 evita da **R-15.2-d**.

**AC-11 (contrasto)** — Ogni pixel di testo **nuovo** è misurato **computazionalmente** (canvas → sRGB → WCAG, lezione 13.9; mai giudizio visivo) in **tema chiaro e scuro**, con lo sfondo **effettivo risolto risalendo gli antenati, e con la CASCATA reale** (lezione 15.9: `.fld-error` vinceva su `.stat-tone-bad`). Testo ≥ **4,5:1**. **Vietato aggiungere un 41° `var(--bad)`/`var(--ok)` inline**: quel debito (40 dichiarazioni in 19 file) è un item TD **post-epic con ciclo proprio** e **non appartiene a questa story** — usare `.alert-box.bad|ok|info` (`airops.css:790-796`, entrambi i temi già gestiti) o `.stat-tone-*` (`:737-742`).

**AC-12 (bersagli touch)** — Nessun controllo **nuovo** sotto **44px** a ≤640. Il record dichiara esplicitamente cosa succede a `out-of-service-submit` (misurato **34,84px** oggi, §1.3) → **Q7**.

### Test e isolamento

**AC-13 (unit)** — Copertura di: scrittura con data / senza data; azzeramento al rientro; guardia atomica invariata; conteggio impattate (PENDING/APPROVED sì, CANCELLED/DENIED/FLOWN/NO_SHOW no, passate no, finestra con e senza data); guardia volo nei 4 percorsi di AC-7; `details` del 422. **Devono passare in shell PULITA**: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>` — regola CLAUDE.md a **3 occorrenze**: un import nuovo verso un service «grosso» trascina la validazione eager di `@/lib/env` e fa fallire `npm run gates` in locale mentre CI resta verde. Mockare la catena (`vi.mock('@/server/adapters/mail')` / `'./app-settings.service'` / `'@/lib/env'`, modello `bookings.service.test.ts`).

**AC-14 (e2e)** — Convenzioni **rispettate alla lettera**:
  - **testid**: superficie mobile che **duplica** una desktop → suffisso `-mobile`; superficie **solo** mobile → prefisso `mobile-`. **Verifica obbligatoria prima di scegliere un nome**: `grep -rn 'data-testid\^=' e2e/` — un `-mobile` su un nome coperto da un selettore `^=` rompe sei helper **a qualsiasi viewport** (AD-5 della 15.5);
  - **selettori**: navigazione scoped al landmark o `exact: true`, mai `getByRole('link', { name })` page-level (lezione 103-F1); **mai `hasText` con date o `H:MM`** per disambiguare righe (lezione 11.2) — e qui è particolarmente insidioso, perché questa story **mette date in pagina**;
  - **niente fixture time-dependent** (lezione **15.4 F1**: `todaySlotUtc(10)` rendeva rossi 2 test da mezzogiorno in poi). Le date di rientro nelle fixture sono **relative e calcolate**, mai letterali «oggi + qualcosa» che scada durante il run.

**AC-15 (isolamento / stato globale)** — Uno spec che mette un velivolo in AOG **scrive stato globale** che le create concorrenti di altri spec possono incontrare. **Fatto misurato**: i tre spec che oggi lo fanno (`bookings.spec.ts:470`, `mobile-planning.spec.ts:291`, `mobile-registries.spec.ts:300`) vivono nel project `fullyParallel` e **non ripristinano nulla** — funzionano perché ognuno crea **il proprio velivolo run-unique** e mette AOG **quello**; `mobile-planning.spec.ts:738` documenta esplicitamente che «le righe AOG che il DB condiviso porta appartengono ad ALTRI velivoli». **Regola per questa story**: stessa disciplina (velivolo run-unique) ⇒ **nessun project serializzato necessario**; ma **se** un test tocca un velivolo **del seed** o asserisce per uguaglianza un aggregato AOG **globale**, allora entra nella catena di `playwright.config.ts` (che è **l'unica fonte di verità** dell'elenco e dell'ordine: non enumerarla altrove, un elenco copiato invecchia — è successo con la 15.8b). La scelta va **motivata nel record**, non lasciata implicita.

**AC-16 (gate)** — `npm run gates` verde; suite e2e completa su build di produzione **via `scripts/e2e.sh`** (MAI `playwright test` in foreground), esito letto **solo** con `scripts/e2e.sh status` — assenza di sentinella `E2E_EXIT=` + nessun processo vivo = run **MORTO**, non riuscito. Prima di attribuire un rosso alla flake di login: `SELECT identifier, count(*) FROM "LoginAttempt" WHERE "createdAt" > now() - interval '15 minutes' GROUP BY 1` (TD-6).

---

## §5 — Dev Notes

### Blast radius ENUMERATO (file per file, con il perché)

**Schema / dati (3)**
1. `prisma/schema.prisma` — `model Aircraft`: campo + doc-comment che spiega **[a]** e **[b]**.
2. `prisma/migrations/<ts>_aircraft_out_of_service_until/` — additiva, nessun backfill.
3. `src/generated/prisma/**` — rigenerato (`npx prisma generate`), **mai** editato a mano.

**Service / contratti (6)**
4. `src/server/services/aircraft.service.ts` — `AircraftListItem:15-32`, `AIRCRAFT_SELECT:37-50`, `toListItem:54-70`, `setOutOfService:393-416`, `returnToService:423-438` (+ eventuale conteggio, Q2).
5. `src/server/services/bookings.service.ts` — i tre `details` (`:555`, `:925`, `:1154`); `BookableAircraftOption:1234` + `listBookableAircraft:1247-1254` se la data va nell'opzione del picker.
6. `src/server/services/flights.service.ts` — `select` `:496-499`, guardia dopo `:521`, doc-comment `:413-417` e `:445-470` da aggiornare, `forceStamp` se Q3 = deroga.
7. `src/lib/schemas/aircraft.ts` — `setOutOfServiceSchema:90-94` (+ campo `z.iso.date().optional()`), `aircraftListItemSchema:172-186`.
8. `src/lib/schemas/flights.ts` — solo doc-comment (`force`/`forceReason` esistono già, `:81-119`).
9. `src/lib/schemas/registry.ts` — `:263`, `:1097-1109` (+ `:1111-1123` se cambia la response del rientro). **Stesso commit** (lezione 15.9).

**API (1)**
10. `src/app/api/v1/aircraft/[id]/out-of-service/route.ts` — passa il campo nuovo al service.

**UI (10 + i18n)**
11. `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx` — sezione Disponibilità: campo data (**`DateInput` già importato a `:20` e già usato a `:914`** — zero import nuovi), «Stato attuale» con la data, **avviso impattate**, eventuale conferma a due passi (le label morte `availability.confirm`/`confirmReturnToService` sono lì, §1.3).
12. `src/app/[locale]/dashboard/fleet/page.tsx` — wiring label/dati (`:95`, `:186-189`).
13. `src/app/[locale]/dashboard/fleet/fleet-console.tsx` — card mobile `:230-256`, `fleetSheetRows:339-357`.
14. `src/components/dashboard/fleet-card.tsx` — `FleetCardItem:20-37`, `badgeFor:41-63`, grid `:73-100` (**componente CONDIVISO** fra `/dashboard/fleet` e il widget della Panoramica: ogni modifica va misurata su **entrambe** le superfici).
15. `src/app/[locale]/dashboard/page.tsx` — `fleetItems:399-415`; `aogCount:327` **solo se Q6 = sì**.
16. `src/app/[locale]/dashboard/bookings/schedule.tsx` — `ScheduleAircraftRow:48-54`, `ScheduleAgendaRow:62-82`, `agendaSub:334-339`, `agendaDetailRows:341-348`, blocco desktop `:633-640`.
17. `src/app/[locale]/dashboard/bookings/page.tsx` — costruzione righe agenda `:285-318`.
18. `src/lib/mobile-agenda.ts` (+ `.test.ts`) — solo se il tipo `A` deve portare la data.
19. `src/app/[locale]/dashboard/bookings/{new,edit}-booking-form.tsx` + `booking-transition.ts` + `booking-labels.ts` — i tre messaggi 422 (#14).
20. `src/app/[locale]/dashboard/logbook/flight-editor.tsx` (+ `logbook/page.tsx`, `dispatch-flight-button.tsx`, `logbook-console.tsx`) — messaggio del 422 nuovo, secondo innesco della sezione force se Q3 = deroga.
21. `messages/it.json` + `messages/en.json` — **le due sempre insieme**.

**Test (≥5)**
22. `src/server/services/aircraft.service.test.ts` — ⚠️ **quattro punti di rottura CERTI**, verificati riga per riga: (i) la fixture `SELECTED_AIRCRAFT:105-120` (letterale del DTO, spreadata ovunque) guadagna il campo; (ii) `:217-236` — `toEqual({ items: [<DTO letterale, non spread>], total: 1 })` **si rompe** con un campo additivo; (iii) `:582-585` — `expect(updateManyMock).toHaveBeenCalledWith({ …, data: { status, statusReason } })` **si rompe** appena `setOutOfService` scrive una terza chiave; (iv) `:611-614` — la gemella su `returnToService` (`data: { status:'OPERATIONAL', statusReason: null }`) **si rompe** con l'azzeramento della data. Le (iii)/(iv) sono le asserzioni che **provano** AC-3: vanno aggiornate al valore **corretto** (mai indebolite a `objectContaining`, lezione 14.6). `:296` usa lo spread di `SELECTED_AIRCRAFT` e segue da sola; `:709` è sugli aggiustamenti contaore e non è toccato.
23. `src/server/services/flights.service.test.ts` — i 4 percorsi di AC-7.
24. `src/server/services/bookings.service.test.ts` — ⚠️ `:1983` `toEqual` esatto su `BookableAircraftOption`; i mock `queryRaw` a `:196`, `:426`, `:433`, `:1174`, `:1181`, `:1192-1193`, `:1569`, `:1579` restituiscono righe letterali `{ id, status, statusReason, archivedAt }`: se il `SELECT … FOR UPDATE` guadagna una colonna, **vanno tutti aggiornati**.
25. `e2e/` — spec nuovo o esteso (AC-14/15).
26. `src/lib/schemas/registry.test.ts` — solo se cambiano i path (non dovrebbe: sono già registrati).

### Trappole note — da leggere PRIMA di scrivere

- **Fixture time-dependent: VIETATE** (lezione 15.4 F1). Uno spec che costruisce «oggi alle 10:00 UTC» muore dopo mezzogiorno a Roma. Qui il rischio è doppio, perché la story mette **date** in pagina: costruirle **relative** e non asserirle mai per stringa letterale.
- **`hasText` con date: VIETATO** per disambiguare righe (lezione 11.2). «11:00» contiene «1:00»; e una data formattata `DD/MM/YYYY` in pagina è un magnete per questo errore. Regex `\b`-anchored o assert esatti sulla cella.
- **Migrazione**: `npx prisma migrate dev` **e** `npx prisma generate`. `npm run gates` **non** cattura un client Prisma stantio (lezione 14.4: un eccesso di proprietà su uno spread non viene controllato da `tsc`).
- **Unit + env eager**: v. AC-13. Verifica obbligatoria in shell pulita.
- **`Escape` negli e2e**: `SlideOver` chiude l'INTERO pannello (listener globale su `window`); i popover portalati (`CalendarPopover` — e la story ne apre uno **nuovo**, sul campo data) intercettano **in cattura** e consumano il **PRIMO** `Escape` (verificato 15.10). Mai usare `Escape` per chiudere il calendario in un test e poi asserire sul pannello: si corre contro l'animazione di chiusura (review 14.3 F1/F2). Chiudere interagendo col campo successivo.
- **`SlideOver`/`MobileSheet` sono DIALOGHI** con focus trap che **comprende i portali attivi** (`src/components/ui/focus-trap.ts`); un pannello chiuso è `inert`. Il campo data nuovo vive **dentro** quel contesto: il `CalendarPopover` portalato deve restare raggiungibile dal trap (è già così — verificarlo, non assumerlo).
- **Componenti condivisi**: `FleetCardGrid`/`badgeFor` servono **due** pagine; `FlightEditor` serve **due** call-site (registro voli + CTA Panoramica, dove viveva il **BLOCKER 14.4 F1**). Il «gemello» va **MISURATO, non dichiarato** (3 occorrenze, lezioni epic 13).
- **`OPTIONS_PAGE_SIZE = 100`** (`dashboard/page.tsx:70`, `logbook/page.tsx:32`, `bookings/page.tsx`, `billing/page.tsx`): TD aperto. Su DB post-suite (148 velivoli) l'ultimo velivolo creato **non è selezionabile** in alcuni picker. Un e2e che crea un velivolo e poi lo cerca in un `<select>` **può morire per questo**, non per un difetto della story: diagnosticare prima di attribuire.
- **`ExpiryType` bloccanti lasciati dagli spec** (TD 15.5): 11 tipi bloccanti sul DB post-suite, 7 lasciati da `bookings.spec.ts`/`flights.spec.ts`. Ogni persona **nuova** ne è priva ⇒ `POST /api/v1/flights` risponde **422 `FLIGHT_BLOCKED_BY_EXPIRY`** prima ancora di arrivare alla guardia AOG. Uno spec di **questa** story che registra voli **deve** usare `ensureValidSeedExpiries` (`e2e/helpers.ts`) o creerà un rosso che sembra suo e non lo è.
- **Ordine dei 422 sul percorso volo**: la guardia AOG va **dopo** `AIRCRAFT_ARCHIVED` e **prima** della data. Un test che passa un velivolo AOG **e** archiviato deve aspettarsi `AIRCRAFT_ARCHIVED` (esistenza/stato prima del dominio).
- **`docker compose exec -T postgres psql -U airmanager -d airmanager`** è la via per interrogare il DB su questa macchina (`psql` **non** è nel PATH dell'host).

---

## §6 — Proposta di taglio e modello dev

### Il conto

| Blocco | File | Test nuovi/toccati | Rischio dominante |
|---|---|---|---|
| **A — campo + ciclo di vita + contratti** (schema, migrazione, service, DTO, OpenAPI) | 10 | ~8 unit + 3 `toEqual` da riallineare | basso, meccanico |
| **B — la data sulle 15 superfici** (di cui il PO ne sceglierà un sottoinsieme, Q5) | ~10 UI + i18n | ~4 e2e, parità 2 larghezze, contrasti 2 temi | **ampio ma poco profondo** |
| **C — guardia volo (+ deroga)** | 4 | ~6 unit + 2 e2e | **profondo e stretto**: perimetro, vicolo cieco, force |
| **D — avviso X prenotazioni** | 4 | ~3 unit + 2 e2e | **design**: dove vive, quanto dura, quali stati, notifiche |

Somma: **~24 file toccati, ~23 test**. Per confronto, la **15.8** — che il PO ha **splittato** (Q1, decisione 2026-08-05) — pesava 3.849 righe, ~19 scritture e 53 test in 10 file, «2,3× la 15.7, zero codice condiviso».

### Raccomandazione: **SPLIT in due story**, entrambe **Opus 5 xhigh**

- **AOG-1a — «la data di rientro e la guardia sul volo»** = blocchi **A + B + C**.
  Consegna: il campo che viaggia su tutte le superfici ratificate, i 422 arricchiti (R-15.4-g), la guardia volo col suo perimetro. Auto-contenuta e verificabile da sola.
- **AOG-1b — «l'avviso delle prenotazioni impattate»** = blocco **D** (+ notifiche, se Q9 = sì).
  Consegna: il conteggio, la superficie d'avviso, e — solo se ratificato — l'email ai piloti. Parte **dal repo consegnato da 1a**, che le fornisce già la finestra (`outOfServiceUntil`) di cui il conteggio ha bisogno.

**Perché lì la cucitura**: 1b **consuma** lo schema di 1a e **nient'altro**; nessuna riga di 1a andrebbe riscritta da 1b. Il conteggio senza la data sarebbe «tutte le future per sempre» — cioè l'inutilità che il PO ha già rifiutato scegliendo (3). E 1b è dove vive il rischio **di design** (dove sta l'avviso, quanto dura, chi lo riceve): tenerlo separato evita che una discussione di prodotto blocchi una migrazione additiva.

**Modello dev**: **Opus 5 xhigh su entrambe**. Regola utente 2026-07-29: *story che scrive codice UI = Opus 5 xhigh*. Entrambe scrivono UI (1a tocca 10 file UI; 1b **è** una superficie). Un split backend/UI puro — «1a backend con Sonnet, 1b UI con Opus» — **non** è proponibile: 1a è per due terzi UI.

**Alternativa (story unica)**: difendibile — il campo e il conteggio sono la stessa feature, e la sessione ha già portato story più grandi (la 15.10 ne ha chiuse 26 di voci). **Costo**: un solo dev tiene insieme migrazione + 15 superfici + due larghezze + due temi + guardia volo + deroga + email; è esattamente il profilo di rischio per cui la 15.8 è stata splittata, e il primo giro di review su un pacchetto così **trova cose vere ma tardi**.

**Review**: subagent **Opus 5 xhigh adversarial** per ciascuna story (l'unico layer adversarial, mai abbassarlo). Ciclo standard `docs/handoffs/HANDOFF.md` §«Ciclo per story su QUESTA macchina».

---

## §7 — Assunzioni da ratificare (BLOCCANTI)

> Regola di progetto (retro Epic 9, `sprint-status.yaml` AI-2): un'assumption si ratifica **PRIMA** di implementare, mai «da confermare» dentro il codice. Ogni domanda porta il **fatto misurato** che la genera, le **opzioni** e la **raccomandazione motivata**.

---

### Q1 — Semantica della data: «AOG **fino al** 12/08» include il 12 o no?

**Fatto.** L'action item scrive `«AOG fino al ...»`. In italiano «fino al 12» è ambiguo: *fermo per tutto il 12* oppure *torna il 12*. La differenza è **una prenotazione**: quella del 12 rientra o no nel conteggio (AC-5). Precedente nel repo: 7.4/14.4 confrontano una scadenza col **giorno** del volo con semantica **inclusiva** — «scadenza = giorno del volo → 201» (review 14.4, boundary confermati). Nel repo esiste già un altro esempio esplicito di semi-apertura dichiarata: `[startsAt, endsAt)` delle prenotazioni.

| # | Opzione | Conseguenza |
|---|---|---|
| A | **`outOfServiceUntil` = ultimo giorno FERMO** (inclusivo). Finestra = `[ora, fine giornata di until]`. Etichetta: «Fermo fino al 12/08 compreso» | coerente con l'inclusività di 7.4/14.4; il conteggio include il 12 |
| B | **`outOfServiceUntil` = giorno del RIENTRO** (esclusivo). Finestra = `[ora, inizio giornata di until)`. Etichetta: «Rientro previsto il 12/08» | coerente col nome del campo («until» = rientro previsto) e con la frase che il pilota si aspetta |
| C | Rinominare in `expectedReturnDate` e adottare B | il nome smette di essere ambiguo, ma diverge dal nome fissato in P3 |

**Raccomandazione: B** — con l'etichetta UI **«Rientro previsto il {data}»** e nessun rinominare (P3 fissa il nome del campo). Motivo: la domanda che l'utente fa è *«quando torna?»*, non *«fino a quando è fermo?»*; l'action item stesso scrive «DATA DI RIENTRO PREVISTO». La semantica va scritta **una volta** nel doc-comment Prisma e riusata identica in service, conteggio, messaggi 422 e i18n — mai reinterpretata per superficie.

**DECISIONE PO (2026-08-07): A — CONTRO la raccomandazione.** `outOfServiceUntil` = **ultimo giorno FERMO**, semantica **INCLUSIVA**. Finestra di conteggio `[ora, fine giornata di until]`. Etichetta UI **«Fermo fino al {data} compreso»**. La raccomandazione B è **superata**: ogni AC, messaggio e i18n di questo file che parli di «rientro previsto il {data}» come *semantica* va letto nella forma inclusiva (il **nome** del campo resta `outOfServiceUntil`, P3). Resta valido — e diventa vincolante — il criterio di scrittura: la semantica si scrive **una volta sola** nel doc-comment Prisma e si riusa identica in service, conteggio, messaggi 422 e i18n; mai reinterpretata per superficie.

---

### Q2 — Dove vive e quando compare l'avviso «X prenotazioni impattate» (P1)

**Fatto misurato.** Oggi l'unico segnale dopo un AOG è un **toast di 2600 ms** (`toast.tsx:26`). Il flusso vive in **un** posto (§1.3). L'endpoint restituisce oggi l'`AircraftListItem`. Il conteggio è già esprimibile via `GET /api/v1/bookings?aircraftId&status=PENDING,APPROVED&from&to` (`schemas/bookings.ts:110-117`). Precedente interno per un campo **advisory** nella response di una scrittura: `balanceAlert` di `RegisterFlightResult` (story 14.4, AC 3).

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Conteggio calcolato NELLA STESSA transazione del grounding e restituito nella response**; la UI lo rende come **banner persistente** (`.alert-box.bad`) dentro la sezione Disponibilità, con link alla lista prenotazioni filtrata. Toast invariato | **esatto e atomico** (nessun TOCTOU); `setOutOfService` diventa un `$transaction` (piccola modifica, guardia atomica invariata); response DTO nuovo → **OpenAPI nello stesso commit** |
| B | **Anteprima PRIMA di confermare**: appena il pannello si apre (o al primo carattere del motivo) una `GET` conta le impattate; la sezione mostra «Stai per impattare N prenotazioni» e il submit diventa un **secondo passo di conferma** (le label `availability.confirm` esistono già, §1.3) | più «avviso» e meno «referto»; ma **TOCTOU** (il numero può cambiare fra anteprima e submit) e una fetch in più a ogni apertura |
| C | **A + B**: anteprima prima, numero **reale** dopo | il più utile, il più caro; due percorsi da tenere allineati |
| D | Solo toast con dentro il numero | **scartata**: 2600 ms non è «SUBITO VISIVO», è «visibile per due secondi e mezzo» |

**Raccomandazione: A**, con **una condizione**: il banner **non deve essere l'unica traccia**. Un admin che chiude il pannello perde il numero. Quindi A + la riga **«N prenotazioni nel periodo di fermo»** mostrata **ogni volta** che si apre la Disponibilità di un velivolo già AOG (stesso conteggio, stessa funzione di dominio). Così l'avviso è **subito visivo** al momento della decisione **e** ritrovabile dopo, senza inventare una superficie nuova. B resta la scelta se il PO vuole che l'avviso arrivi **prima** dell'atto irreversibile — dicendo però che il numero mostrato è una stima.

**DECISIONE PO (2026-08-07): C — anteprima + numero reale.** All'apertura della sezione Disponibilità: conteggio **«Stai per impattare N prenotazioni»** e submit a **DOPPIO PASSO** (le label morte `availability.confirm`, §1.3, vengono finalmente consumate). Al grounding: conteggio **RICALCOLATO nella stessa transazione**, restituito **nella response** (DTO nuovo ⇒ **OpenAPI nello stesso commit**) e reso come **banner persistente `.alert-box.bad`**. La riga **«N prenotazioni nel fermo»** riappare **a ogni riapertura** della Disponibilità di un velivolo già AOG (la condizione della raccomandazione, ratificata). **Anteprima e definitivo chiamano la STESSA funzione di dominio** — il TOCCO/TOCTOU è accettato e dichiarato: l'anteprima è una **stima**, il numero della response è quello **autoritativo**. Tutto questo è il perimetro di **AOG-1b**.

---

### Q3 — Guardia sul volo: **blocco secco** o **deroga admin motivata**?

**Fatti.** (i) L'AOG **non ha una data di inizio**: `Aircraft` non ha `groundedAt` e `updatedAt` cambia a ogni update (AD-5) ⇒ la guardia può guardare **solo** lo stato corrente, mai la data del volo. (ii) Conseguenza concreta: *velivolo rientra con un atterraggio duro → AOG immediato → il volo che l'ha causato non si registra più*. Vicolo cieco della stessa classe di **14.4 F4** (correzione di volo storico rivalutata sulle scadenze odierne). (iii) La deroga **costa quasi zero**: `force`/`forceReason` (`schemas/flights.ts:110-119`), permesso `flights.forceExpiry` ADMIN-only con 403 **prima di ogni query** (`flights.service.ts:492-494`), colonne `forcedAt`/`forcedByUserId`/`forceReason` già su `Flight`, masking R-14.4-c, badge «Deroga» — **tutto già in piedi** (AD-6). Manca un innesco nella sezione force del form (`flight-editor.tsx:953`, oggi gated su `blockedDocuments`) e due stringhe.

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Blocco secco**: 422 sempre, nessuna via d'uscita | il più semplice; ma produce un **vicolo cieco reale** (fatto ii) e un dato di volo perso o registrato su un velivolo sbagliato per aggirarlo |
| B | **Blocco + deroga admin motivata** sul modello 14.4: 422 di default, `force: true` + `forceReason` obbligatorio, gated su `flights.forceExpiry`, stamp persistito e badge «Deroga» | ~1 condizione nel service + 1 innesco UI + 2 stringhe; riusa **tutto** l'impianto; nessun permesso nuovo (**non** rinominare `flights.forceExpiry` — precedente F3 della 14.4 su `blocksBooking`) |
| C | Nessun blocco, solo avviso non bloccante | non soddisfa P2 |
| D | Blocco solo se la **data del volo** cade nel fermo | **non implementabile**: manca `groundedAt` (fatto i). Richiederebbe una colonna fuori contratto |

**Raccomandazione: B.** È l'unica che soddisfa P2 **senza** creare il vicolo cieco che la 14.4 ha già dovuto chiudere una volta, ed è la più economica dopo A. Sotto-decisione inclusa: **un solo `force`** copre entrambi i blocchi (scadenze e AOG); lo stamp resta «scavalcato un blocco» (mai su un `force` a vuoto); il doc-comment del permesso si aggiorna, l'identificatore **no**.

**DECISIONE PO (2026-08-07): B.** Guardia volo = **blocco 422 + deroga admin motivata** sul modello 14.4: `force: true` + `forceReason` **obbligatorio**, gated su **`flights.forceExpiry`** (**NON rinominare** — precedente F3 della 14.4), stamp `forcedAt`/`forcedByUserId`/`forceReason` **persistito** e badge «Deroga». **UN SOLO `force` copre entrambi i blocchi** (scadenze **e** AOG); il **doc-comment** del permesso si aggiorna, l'**identificatore no**. Perimetro AD-4 confermato (registrazione sì; correzione che cambia velivolo sì; correzione a velivolo invariato no; storno mai). Perimetro di **AOG-1a**.

---

### Q4 — Il picker velivolo del form volo deve **nominare** l'AOG?

**Fatto misurato.** Il form prenotazione disabilita l'opzione e ci scrive il motivo («I-SMSI1EO98HDS — Revisione 15.5 (fuori servizio)», `disabled=true`, identico a 1280 e 375). Il form volo **no**: `aircraftOptions` è `{ id, registration }` (`logbook/page.tsx:124-126`, `dashboard/page.tsx:386`) e il controllo è un **`SearchCombobox`**, che **non ha** l'affordance «opzione disabilitata» (`flight-editor.tsx:422-427`).

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Solo 422**: il picker resta muto, il messaggio arriva al submit | zero costo; ma l'operatore compila tutto il form prima di sapere |
| B | **L'opzione porta un suffisso** «(fuori servizio)» come il form prenotazione, **selezionabile** (la deroga di Q3 esiste) | `aircraftOptions` guadagna 2 campi in 2 pagine + il label nel combobox; parità di linguaggio coi form prenotazione |
| C | Opzione **esclusa** dalla lista | **scartata**: rende impossibile anche la deroga e la correzione di un volo storico su quel velivolo |

**Raccomandazione: B**, ma **solo se Q3 = B**: un'opzione che dice «fuori servizio» ed è selezionabile ha senso perché la deroga esiste. Se Q3 = A (blocco secco), allora B diventa fuorviante (nomina un'opzione che non porterà mai a nulla) e si sceglie **A**.

**DECISIONE PO (2026-08-07): B** (condizione soddisfatta: Q3 = B). Il picker velivolo del form **volo** porta il suffisso **«(fuori servizio)»** e l'opzione resta **SELEZIONABILE** (la deroga esiste). `aircraftOptions` guadagna i campi necessari nelle **2** pagine che lo costruiscono (`logbook/page.tsx:124-126`, `dashboard/page.tsx:386`) + il label nel `SearchCombobox`. ⚠️ **Quanto al DATO mostrato**, questa opzione si legge insieme a Q5: lì passa **stato e motivo** come nel form prenotazione, **mai la data** (Q5 la confina a editor + tre messaggi 422). Perimetro di **AOG-1a**.

---

### Q5 — Su **quali** delle 15 superfici va la data di rientro?

**Fatto.** Il censimento §2 ne elenca 15. Non tutte hanno spazio: la card flotta (desktop e mobile) oggi **non mostra nemmeno il motivo**, solo il badge; l'export Excel ha una colonna «Stato operativo» senza motivo né data.

| # | Opzione | Superfici toccate |
|---|---|---|
| A | **Minimo coerente**: #1 editor, #4 sheet flotta mobile, #11 sheet agenda, #14 i tre messaggi 422 | 4 superfici (2 delle quali già portano il motivo); niente pixel nuovi sulle card; **parità mobile/desktop garantita** perché #4 e #11 sono già mobile-only e #14 vale su entrambe |
| B | **A + le narrative**: #9 `f-sub` del blocco timeline desktop, #10 sub della riga agenda mobile, #12/#13 suffisso nelle opzioni dei form prenotazione | 8 superfici; **parità piena** desktop/mobile sui due percorsi (timeline↔agenda, form) |
| C | **B + le card** (#2/#3) e **l'export** (#15) | 11 superfici; le card guadagnano una riga che oggi non hanno (rischio di affollamento a 375px: la card mobile è già 6 righe) |
| D | Tutte e 15 | massimo costo, massimo rischio di regressione visiva |

**Raccomandazione: B.** A è troppo poco: la data che il pilota vuole vive **nella timeline e nell'agenda**, che sono le pagine che apre. C aggiunge pixel a una card **condivisa fra due pagine** (`FleetCardGrid`) e a un export, per un guadagno marginale (il badge AOG con il tap che apre lo sheet — dove la data c'è — è già il percorso naturale). L'export si può rivalutare quando qualcuno lo chiederà.

**DECISIONE PO (2026-08-07): decisione CUSTOM — nessuna delle quattro opzioni, perimetro PIÙ STRETTO di A.** La **data di rientro** affiora **SOLO**:
> **(i)** nell'**editor Disponibilità** (settings del velivolo, superficie #1);
> **(ii)** nei **tre messaggi 422 arricchiti** — **prenotazione**, **spostamento**, **volo** — dove **«Fermo fino al {data} compreso»** si aggiunge al solo motivo (**Q5-bis = A**, domanda posta in ratifica e non presente in questa tabella).
>
> **TUTTE le altre superfici del censimento §2 restano INVARIATE quanto alla data**: timeline desktop (#8, #9), agenda mobile e suo sheet (#10, #11), card flotta desktop e mobile (#2, #3), sheet flotta mobile (#4), opzioni dei form prenotazione (#12, #13), testate (#5, #6, #7 — salvo il **conteggio** di Q6), export Excel (#15). **NB**: il **badge** e il **motivo** che quelle superfici mostrano **oggi restano come oggi** — questa story **non li rimuove** e non li ritocca.
>
> ⚠️ Ne discende che gli **AC-9/AC-10** di §4 (data «coerente su tutte le superfici toccate», parità desktop/mobile su card/sheet/timeline/agenda/form) sono **superati**: la parità e le misure pre/post valgono **solo** sulle superfici davvero toccate. Gli AC riscritti in `aog-1a` vincono. Perimetro di **AOG-1a**.

---

### Q6 — Il conteggio AOG **sbagliato** della Panoramica (1 invece di 3) si chiude qui?

**Fatto misurato (difetto NUOVO, §1.7).** `/dashboard` dice «1 AOG», `/dashboard/fleet` dice «3 AOG», stesso istante, stesso DB (148 velivoli attivi). Causa: `dashboard/page.tsx:327` conta sui **primi 100** velivoli (`OPTIONS_PAGE_SIZE`), mentre la Flotta usa `listOutOfServiceAircraft` (non paginata). Visibile **a entrambe le larghezze**; sul telefono è **l'unica** superficie AOG della Panoramica.

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Fix qui**: la Panoramica riusa `listOutOfServiceAircraft` per il conteggio (già esiste, già gated `aircraft.manage`, già usata dalla Flotta) | ~3 righe + 1 lettura in più sulla pagina; chiude un numero falso proprio sulla grandezza che P1 vuole rendere visibile; **fuori dal contratto stretto** dell'action item |
| B | **Non fix**: si dichiara come TD, ereditato dal TD `OPTIONS_PAGE_SIZE` | perimetro pulito; ma la story «rende l'AOG visibile» lascia in piedi un contatore AOG che mente |
| C | Fix **generale** del TD `OPTIONS_PAGE_SIZE` (4 pagine) | fuori scope, sicuramente |

**Raccomandazione: A.** È 3 righe, riusa una funzione **già esistente e già chiamata altrove**, e non è un «miglioramento adiacente» gratuito: è **letteralmente** il requisito P1 («l'avviso deve essere subito visivo») applicato alla superficie che lo mostra per prima. Se il PO preferisce il perimetro stretto, **B è accettabile** purché il numero falso finisca in `sprint-status.yaml` con la misura (1 vs 3 su 148).

**DECISIONE PO (2026-08-07): A.** Il conteggio AOG della Panoramica si **fixa qui**, riusando `listOutOfServiceAircraft` (~3 righe). Perimetro di **AOG-1a**. Il fix NON estende il TD `OPTIONS_PAGE_SIZE` alle altre tre pagine (resta fuori scope, §8).

---

### Q7 — `out-of-service-submit` è a **34,84px** sul telefono: si alza?

**Fatto misurato** (375×812, build prod): il bottone «Fuori servizio» è **335×34,84** e il suo bordo inferiore (y 841) **cade sotto il fold** (812). La ratifica **R-15.10-f** ha portato a 44px il submit **primario** (`identity-submit`, nel `.so-foot`) lasciando le **azioni secondarie di sezione** dov'erano — decisione consapevole, non una svista. Questa story **aggiunge un campo** proprio in quella sezione (quindi la spinge ancora più giù).

| # | Opzione | Costo / conseguenza |
|---|---|---|
| A | **Si alza a ≥44 a ≤640** (solo quel bottone, regola mobile-only; desktop identico al centesimo) | ~4 righe CSS + misura pre/post su 2 larghezze; coerente con l'epic 15 |
| B | **Si dichiara** e basta (rientra nella classe già ratificata delle azioni secondarie) | zero costo; ma la story **peggiora** la raggiungibilità aggiungendo un campo sopra |
| C | Il bottone AOG **diventa** il submit primario del `.so-foot` quando la sezione è aperta | **scartata**: rompe l'idioma dei 7 call-site di `footer` e collide con `identity-submit` |

**Raccomandazione: A** — limitata a **quel** bottone, a ≤640, con la misura pre/post nel record. Non è uno sweep: è la manutenzione della superficie che questa story sta modificando.

**DECISIONE PO (2026-08-07): A.** `out-of-service-submit` va a **≥44px SOLO a ≤640**; il **desktop resta identico al centesimo**; misura **pre/post** obbligatoria nel Dev Agent Record. Perimetro di **AOG-1a**.

---

### Q8 — TD 14.8 F6 (`parseDateOnlyUtc`, anni <100): si tocca?

**Fatto.** `date-only.ts#parseDateOnlyUtc` usa `Date.UTC`, che mappa gli anni `0-99` su `1900+anno`: `'0001-01-01'` passa `z.iso.date()` e finisce a DB come `1901-01-01` **in silenzio**. TD aperto (review 14.8 F6), con rimedio già indicato: `setUTCFullYear` post-costruzione **oppure** rifiuto degli anni <1000 nello schema.

| # | Opzione | Conseguenza |
|---|---|---|
| A | **Non toccare** `date-only.ts`; `outOfServiceUntil` eredita la classe e lo si **dichiara** nel record | perimetro pulito; il TD resta com'è, con un consumatore in più |
| B | **Chiudere il TD qui** (`setUTCFullYear`) | tocca un helper usato da rate velivolo, tariffe istruttore, pacchetti, voli, prenotazioni: **blast radius largo per una story che non lo chiede** |
| C | Rifiutare gli anni <1000 **solo** nello schema di questo campo | 1 riga, difende il campo nuovo, non tocca gli altri consumatori — ma introduce **due** regole diverse per lo stesso tipo di dato |

**Raccomandazione: A.** Karpathy §3 (chirurgia): il TD è pre-esistente, ha un ciclo suo, e una data di rientro con anno `0001` è un input che nessun percorso reale produce. Dichiararlo costa una riga nel record; chiuderlo costa un giro di regressione su cinque servizi.

**DECISIONE PO (2026-08-07): A.** `date-only.ts` **non si tocca**. L'eredità del TD 14.8 F6 (anni <100 mappati su 1900+anno) si **DICHIARA** nel Dev Agent Record di **AOG-1a** come classe ereditata dal campo nuovo, con l'elenco di ciò che il campo condivide con gli altri consumatori (`z.iso.date()` in ingresso, `@db.Date` a valle).

---

### Q9 — Si avvisano **anche i piloti** delle prenotazioni impattate, o solo l'admin?

**Il PO ha detto «admin»** (action item). **Ma il caso che fa male è il pilota che si presenta al campo.** Porto il costo reale, misurato sul codice.

**Fatti.** L'infrastruttura email **esiste ed è matura**: `MailSender` (`server/adapters/mail/`), Mailpit in dev (`127.0.0.1:1025/8025`, `docker compose`, API `http://localhost:8025/api/v1/messages`), **9 template** già scritti (`templates.ts:53-350`), e un **modello di invio esatto** da copiare — `sendBookingDeniedEmail` (`bookings.service.ts:1203-1221`): fuori dalla transazione, best-effort (`try/catch` + `console.error`, mai un throw che faccia fallire una scrittura valida), locale dal `User.locale` del destinatario (fallback `it`), **skip silenzioso** se la persona non ha email. Il conteggio di Q2 restituisce già **esattamente l'insieme** dei destinatari.

| # | Opzione | Costo stimato / conseguenza |
|---|---|---|
| A | **Solo admin** (alla lettera del PO) | zero costo aggiuntivo; ma il pilota con una APPROVED resta **muto**: il difetto centrale della story rimane per metà aperto |
| B | **Email ai titolari delle prenotazioni impattate** (PENDING + APPROVED) al momento del grounding | 1 template (`buildAircraftGroundedEmail`, sulla falsariga di `buildBookingDeniedEmail`) + 1 funzione di fan-out ricalcata su `sendBookingDeniedEmail` + 4 stringhe i18n × 2 locale + 1 e2e che legge Mailpit. **Nessuna infrastruttura nuova.** Rischio: **N email in un colpo** su un velivolo molto prenotato (misurato: fino a **21 APPROVED future** su un velivolo del DB attuale) |
| C | **Solo le APPROVED** (le PENDING sono già congelate e il pilota lo scopre alla decisione) | come B ma con meno destinatari e un criterio **spiegabile**: si avvisa chi ha una prenotazione che l'app **non** fermerà da sola |
| D | Nessuna email, ma **marcatura visibile** della prenotazione impattata nelle liste del pilota | nessun invio; ma è una superficie nuova su pagine che l'epic 15 ha appena rifatto, e il pilota deve comunque aprire l'app |

**Raccomandazione: C** — se il PO vuole chiudere il caso «pilota al campo» al costo minimo difendibile. B è più completo ma manda email anche a chi verrà comunque fermato dal 422 all'approvazione. A è coerente con la lettera della decisione PO e lascia il caso aperto: **legittimo**, purché sia una scelta e non una dimenticanza.

Sotto-decisione se C o B: l'invio è **best-effort e post-commit** (mai dentro la transazione del grounding, mai capace di far fallire l'AOG — regola già scritta nel doc-comment di `sendBookingDeniedEmail`), e un `returnToService` **non** manda una seconda email di «tutto a posto» a meno che il PO non la chieda esplicitamente.

**DECISIONE PO (2026-08-07): C.** Email **best-effort POST-COMMIT** ai titolari delle sole prenotazioni **APPROVED** impattate, sul modello esatto di `sendBookingDeniedEmail` (`bookings.service.ts:1203-1221`): **fuori** dalla transazione, `try/catch` che non fa mai fallire l'AOG, **locale del destinatario**, **skip silenzioso** senza email. **Nessuna email al rientro** (`returnToService`). **Le PENDING non ricevono nulla** (sono già congelate dal 422 all'approvazione). Costo ratificato: **1 template nuovo + fan-out + stringhe i18n ×2 + un e2e Mailpit**. Perimetro di **AOG-1b**.

---

### Q10 — Split o story unica, e quale modello dev?

**Fatti.** §6: ~24 file, ~23 test, 4 blocchi con profili di rischio **diversi**. Precedente: la 15.8 (3.849 righe, ~19 scritture, 53 test in 10 file) è stata **splittata dal PO** perché «2,3× la 15.7, zero codice condiviso».

| # | Opzione | Conseguenza |
|---|---|---|
| A | **Split AOG-1a (campo + superfici + guardia volo) / AOG-1b (avviso + notifiche)**, entrambe **Opus 5 xhigh** | due cicli story→dev→review; cucitura pulita (1b consuma solo lo schema di 1a); la discussione di prodotto su Q2/Q9 non blocca la migrazione |
| B | **Story unica**, **Opus 5 xhigh** | un ciclo solo; ma un dev tiene insieme migrazione + 15 superfici + 2 larghezze + 2 temi + guardia + deroga + email |
| C | Split backend/UI (backend Sonnet, UI Opus) | **scartata**: 1a è per due terzi UI; la regola utente 2026-07-29 impone Opus a ogni story che scrive UI |

**Raccomandazione: A.**

**DECISIONE PO (2026-08-07): A.** **SPLIT** in **AOG-1a** («il campo, i contratti, le due superfici ratificate e la guardia sul volo») e **AOG-1b** («l'anteprima, il conteggio, il banner e l'email»), entrambe dev **Opus 5 xhigh**, entrambe con **review adversarial Opus 5 xhigh** dedicata. 1b parte **dallo stato post-1a** e non riscrive righe di produzione di 1a. Story file: `aog-1a-campo-guardia-volo.md`, `aog-1b-avviso-prenotazioni-email.md`.

---

## §8 — Fuori scope DICHIARATO

- **Annullamento automatico delle prenotazioni impattate.** Il PO ha scelto l'opzione 2 di 3 il 2026-07-31; l'AOG **non** annulla nulla. Questa story **conta e avvisa**, non decide per l'admin.
- **`groundedAt`** (data di inizio fermo). Fuori dal contratto P3, e AD-5 spiega perché la sua assenza è un vincolo dichiarato e non un difetto da riparare qui.
- **Rinomina** di `flights.forceExpiry` e di `ExpiryType.blocksBooking` (precedente: decisione F3 della 14.4).
- **TD `OPTIONS_PAGE_SIZE = 100`** in generale (4 pagine). Solo la faccia della Panoramica è in discussione, e solo in Q6.
- **I 40 `var(--bad)`/`var(--ok)` inline in 19 file di form**: item TD **post-epic con ciclo proprio**. Questa story non ne tocca uno e **non ne aggiunge**.
- **TD 14.9 F11** (422-prima-di-403 su `/stats` e `/cash-report`): non è di questa story; AD-7 dichiara solo come il 422 nuovo si posiziona rispetto alla convenzione aperta.
- **Le 42 celle `.cal-popover` a 34,58px** e la semantica di dialogo del popover calendario (item TD post-epic 15.10): la story **usa** `DateInput`/`CalendarPopover` così com'è.
- **Notifiche push / in-app**: se Q9 sceglie di avvisare i piloti, il canale è **l'email esistente**. Nessun canale nuovo.

---

## §9 — Riferimenti letti per costruire questa story

- `_bmad-output/implementation-artifacts/sprint-status.yaml:476` — l'action item AOG (contratto) + gli altri action_items (per non pestare lavoro altrui).
- `_bmad-output/implementation-artifacts/7-4-booking-expiry-block.md` — il precedente della guardia (`blocksBooking`, `blockingDocuments`, force+motivazione).
- `_bmad-output/implementation-artifacts/14-4-guardrail-registrazione-volo.md` — il modello **blocco-secco-vs-deroga** (R4, R-14.4-a/b/c/d, F1 BLOCKER del remount, F4 vicolo cieco).
- `_bmad-output/implementation-artifacts/15-4-pianificazione-mobile.md` (R-15.4-g, R-15.4-h) e `15-4-review-report.md` (F1, fixture time-dependent) — il 422 che porta il vincolo fino all'utente, e le righe AOG dell'agenda.
- `docs/handoffs/HANDOFF.md` — semantiche UI correnti dell'epic 15 + regole di macchina.
- `CLAUDE.md` — convenzioni testid mobile/AD-5, e2e, catena serializzata, `SlideOver`/`MobileSheet` post-15.10.
- `.claude/skills/karpathy-guidelines/SKILL.md` — assunzioni esplicitate (§7), semplicità (AD-5/Q8: niente colonne speculative), chirurgia (§8), criteri verificabili (§4).
