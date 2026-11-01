---
baseline_commit: 5ca0be6
---

# Story 19.2: Via codice fiscale, campi velivolo, contaore e note volo

Status: **ready-for-dev** — 2026-11-01. **Nessuna domanda PO aperta** (v. §0.3: le tre scelte di interpretazione sono prese su delega, ognuna ricondotta a una ratifica già chiusa). **Modello dev: Opus 5 xhigh (UI)** — la story scrive codice UI su sei superfici (editor pilota, editor istruttore, scheda persona, editor velivolo + sheet flotta mobile, form volo, sheet registro voli mobile) oltre a schema, migrazione, service, OpenAPI, seed ed e2e. Review: **Opus 5 xhigh adversarial**, come sempre. Chiave sprint-status: `19-2-via-codice-fiscale-campi-velivolo-contaore`.

> ⚠️ **Baseline e ordine**: ogni `file:riga` di questo file è misurato su **`5ca0be6`** (HEAD al 2026-11-01). Il dev della 19.2 parte **DOPO il commit della 19.1** (rimozione del dominio PPR, scritta in parallelo da un altro writer), che tocca **gli stessi file** in punti diversi: `prisma/schema.prisma` (modelli PPR + FK `CashMovement.pprRequestId`) e una **sua** migrazione, `prisma/seed*.ts`, `messages/*.json`, `src/lib/schemas/registry.ts` + `registry.test.ts`, `src/server/services/exports.service.ts`, `src/app/[locale]/dashboard/page.tsx` (KPI/avvisi PPR), `src/styles/airops.css` (blocco `.info-row` condiviso col `/ppr` pubblico — lo stesso commento di `:2745` che qui perde «fiscal code») e molti spec e2e. Effetto atteso: **solo slittamento di righe**. Prima di scrivere una riga: `git log --oneline -5`, rieseguire i **censimenti di §3** (sono comandi, non elenchi da fidarsi) e correggere le righe di questo file dove sono slittate. Anche il fix cycle della 16.3 (agent `fix-16-3`) può atterrare prima: tocca `bookings.service.ts` ed e2e `bookings`/`api-v1` — stesso effetto.
>
> **Da leggere PRIMA di scrivere una riga**: `CLAUDE.md` (convenzioni e2e: `getByLabel` è substring, mai `Escape` dentro uno `SlideOver`, testid `-mobile`/`mobile-`, suite solo via `scripts/e2e.sh`, unit test ed env eager); `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` §2.3 «Contaore», §4.0 **R-19-a**/**R-19-b**, §4.2 riga 19.2; `_bmad-output/implementation-artifacts/16-2-guardie-registro-voli.md` §1 (perché il lock `FOR UPDATE` sull'`Aircraft` serializza `FLIGHT_OVERLAP`); `13-4-flotta-toggle-storici-owner.md` (il precedente più vicino: drop di `Aircraft.owner` con sweep repo-wide, `migrate diff` a zero drift, verifica psql). Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`).

### ❓ Domande PO aperte

**Nessuna.** La ricognizione non ha trovato assunzioni di dominio fuori dalla CR. Le tre scelte di interpretazione (dove mostrare le «Ore totali», niente campo ore nel DTO API, la sub dello sheet flotta) sono in §0.3, ognuna ricondotta a una ratifica chiusa (R-19-b) o a un vincolo tecnico: la sessione principale può riaprirle col PO prima del dispatch senza toccare il resto della story.

---

## Story

As **l'amministratore dell'aviosuperficie**,

I want che dall'anagrafica spariscano il **codice fiscale**, dal velivolo **posti, carburante, basato/ospite e note**, dal sistema l'intero **contaore** (contaore del velivolo, rettifiche, contatori iniziale/finale sul volo) e dal volo le **note**,

so that i form chiedano solo ciò che il campo usa davvero (punti PO 4, 5, 10), e le ore di un velivolo, dove compaiono, siano **la somma dei voli registrati** invece di un contatore da tenere allineato a mano (R-19-b).

### Il perché

Il PO, dopo l'uso con i dati demo, ha dichiarato inutilizzati questi campi e ha ratificato il **DROP totale** («siamo ancora in dev, il db è di test», R-19-a). Il contaore era l'unico pezzo con logica propria: avanzava a ogni registrazione (`+=` minuti), scendeva a ogni storno (con clamp a 0 tracciato da una `HourMeterAdjustment`, story 16.2 F13), aveva rettifiche motivate con storico paginato e due contatori informativi sul volo validati come coppia (`HOUR_METER_INVALID`). Dall'11.1 la durata del volo viene da decollo/atterraggio: **nessuna regola di dominio legge più il contaore** (nessuna manutenzione, nessun costo). Resta una sola cosa che il contaore portava con sé e che NON va persa: il lock `FOR UPDATE` sulla riga `Aircraft` in registrazione/annullamento/correzione, che dalla 16.2 serializza la guardia `FLIGHT_OVERLAP`.

### Fatti misurati che vincolano il design (su `5ca0be6`)

| Fatto | Misura | Conseguenza |
|---|---|---|
| Il contaore non alimenta nessuna regola | `hourMeterMinutes` letto solo da: avanzamento/decremento in `flights.service.ts`, `adjustHourMeter`, DTO/UI/export; nessun service di manutenzione, costo o statistica lo legge | eliminabile senza sostituto di dominio |
| Il lock `Aircraft` in `registerFlight` legge proprio la colonna che sparisce | `flights.service.ts:1274-1275` `SELECT "hourMeterMinutes" FROM "Aircraft" … FOR UPDATE`; idem `cancelFlight` `:1499-1500`, `correctFlight` `:1638-1641` (lì la mappa `hourMeterById` fa ANCHE da controllo di esistenza) | il lock **resta** con `SELECT "id"` (AD-3). Un `$queryRaw` che seleziona una colonna droppata **compila** e fallisce solo a runtime: lo prende il grep di AC 22, non il typecheck |
| Il lock è già pinnato da test che restano | unit `flights.service.test.ts:1008` (register), `:1706` (cancel), `:2028` (correct), `:2271` (guardia DOPO il lock); e2e `flights.spec.ts:1018` **E3** (due POST paralleli → un 201 e un 409) | le asserzioni sul lock non si toccano: cambiano solo i mock (`[{ id }]` al posto di `[{ hourMeterMinutes: 500 }]`) |
| Zod **strip** delle chiavi ignote (Zod 4.4.3, nessuno `strictObject` in `src/lib/schemas`) | un client che continua a mandare `hourMeterMinutes`/`notes`/`fiscalCode` riceve **201/200**, la chiave è scartata | nessun 422 nuovo; i 29 spec e2e che mandano `hourMeterMinutes` resterebbero verdi **senza** essere ripuliti → li costringe il grep (AC 22). Un test che «prova la rimozione» asserisce l'**assenza** nella response, mai un 422 (precedente `flights.service.test.ts:2887`) |
| `createAircraftSchema` **richiede** `hourMeterMinutes` | `src/lib/schemas/aircraft.ts:54` (`z.number().int().min(0)`, obbligatorio) | dopo la story `POST /aircraft` con sole marche/tipo/modello → 201 (oggi 422) |
| Blast radius e2e del contaore | `hourMeterMinutes` in **41 righe di 29 spec**; «Contaore iniziale (minuti)» compilato in **5** helper UI; `hour-meter-current` letto in 7 punti di 5 spec; 5 test interamente sul contaore | §3.6 |
| Blast radius unit | `flights.service.test.ts` 94 righe sul contaore, `aircraft.service.test.ts` 54, + `exports.service.test.ts`, `flights-expiry-boundary.integration.test.ts`, `people.service.test.ts`, `registry.test.ts`, `handler.test.ts`, `accounts.service.test.ts` (solo un commento) | §3.7 |
| i18n | **1 989** chiavi per file, parità it/en **0/0** (prima della 19.1). Questa story: **44 chiavi rimosse, 4 nuove, 2 testi cambiati** per file (§3.8) → netto −40 rispetto al conteggio post-19.1 | parità da rimisurare a fine story |
| `src/generated/prisma` è **gitignored** | `.gitignore:16` `/src/generated/`, rigenerato da `postinstall`/`prisma generate` | non si committa; va rigenerato in locale dopo lo schema, altrimenti typecheck su client stantio |
| La sub dello sheet flotta mobile è fatta SOLO dei campi che spariscono | `fleet-console.tsx:329` `sub = [based ? 'Basato' : 'Ospite', fuelType].filter(Boolean).join(' · ')`; `BottomSheet` compone il nome accessibile `${sub} — ${title}` (`bottom-sheet.tsx:61`); lo spec `mobile-registries.spec.ts:164-175` asserisce un nome ben formato | senza sostituto la sub diventa **vuota** e il nome rompe `expectWellFormedSheetName` → AD-6 |

---

## §0 — Requisiti fissi e ratifiche

### §0.1 Contratto (CR approvata, §4.2 riga 19.2)

| # | Requisito |
|---|---|
| **P1** | Drop `Person.fiscalCode` (+ indice unico `Person_fiscalCode_key`); il conflitto «email o codice fiscale» diventa **solo email**. |
| **P2** | Drop `Aircraft.seats`, `Aircraft.fuelType`, `Aircraft.based`, `Aircraft.notes` (form, card/sheet mobile, API/Zod/OpenAPI, seed). |
| **P3** | Drop `Aircraft.hourMeterMinutes`, tabella `HourMeterAdjustment` + API `/api/v1/aircraft/{id}/hour-meter-adjustments` + sezione «Contaore» dell'editor; drop `Flight.hourMeterStart`/`hourMeterEnd` (form volo, `HOUR_METER_INVALID`); via l'avanzamento in registrazione e il decremento (`decreaseHourMeterForReversal`) in annullamento/correzione. |
| **P4** | Drop `Flight.notes` (punto PO 10: «eliminare i campi contatore iniziale e finale e il campo note»). |
| **P5** | Il lock `FOR UPDATE` sull'`Aircraft` in registrazione/annullamento/correzione volo **RESTA**: serializza la guardia `FLIGHT_OVERLAP` (16.2). |

### §0.2 Ratifiche vincolanti

| R | Decisione | Effetto qui |
|---|---|---|
| **R-19-a** | DROP totale, nessun dato preservato (DB di test). | Migrazione distruttiva senza backfill; le note di manutenzione di `seed-demo.ts:134` («Revisione 100h… prossima a 1900h») **si perdono** — atteso. |
| **R-19-b** | Contaore eliminato del tutto (UI+API+DB). **Le ore del velivolo, dove mostrate, sono la somma dei voli registrati.** | AD-5: le tre superfici che mostravano il contaore mostrano «Ore totali» = Σ `minutes` dei voli `REGISTERED`. |
| Punto PO 10 | Via contatori iniziale/finale e note dal form volo. | AC 18. Il resto del form volo (tipi, dropdown, toggle) è della **19.5**: fuori perimetro. |

**Ratifiche/AC storici SUPERATI da questa story** (da non «ripristinare»): story 2.4 AC 1 (contaore iniziale), story 2.5 AC 2-3 (rettifiche motivate con storico), story 11.1 (contatori informativi sul volo), story 12.5 AC 1 (posti/carburante/basato/note), story 16.2 F13/AD-6 (traccia del clamp sullo storno), **R-15.6-b** limitatamente alle righe «Contaore» e «Note» dello sheet del registro voli mobile (la regola «il telefono può mostrare di più, mai di meno» resta: qui spariscono i dati, non la parità), la parità dello sheet flotta di R-15.5 limitatamente a Posti/Carburante/Contaore/Note.

### §0.3 Scelte prese su delega (nessuna è un'assunzione di dominio nuova)

| ID | Scelta | Riconducibile a | Alternativa scartata |
|---|---|---|---|
| **D-1** | Le ore del velivolo sono mostrate in **tre** punti, gli stessi in cui oggi si mostra il contaore: riga dello sheet flotta mobile, colonna dell'export Excel velivoli, **readout in sola lettura nell'editor** (al posto della sezione «Contaore», che su desktop è l'unica vista di dettaglio del velivolo). Nessun punto nuovo: card flotta desktop/mobile e widget Panoramica restano come sono. | R-19-b alla lettera («dove mostrate») | togliere il readout dall'editor: il desktop perderebbe l'unica vista delle ore, mentre il mobile la terrebbe nello sheet — incoerenza fra facce, e gli e2e `flights.spec`/`flight-reversal` perderebbero la loro asserzione discriminante |
| **D-2** | Il DTO API `Aircraft` **non** guadagna un campo ore: perde `hourMeterMinutes` e basta. | R-19-b parla di ciò che è *mostrato*; l'API non mostra | aggiungere `flownMinutes` a `AircraftListItem`: una query di aggregazione in più su OGNI risposta che restituisce un velivolo (anche le scritture: archive, out-of-service, PATCH…) per un consumatore che oggi non esiste; la futura app Flutter può derivarlo da `GET /flights` |
| **D-3** | La sub dello sheet flotta mobile diventa il **tipo** del velivolo (`aircraft.type`). | AD-6 (vincolo tecnico: la sub non può essere vuota) | sub vuota: rompe il nome accessibile (lezione 15.2 F6, review 15.5 F1) |

> Se la sessione principale o il PO volessero diversamente su D-1/D-2, la modifica è locale (AC 14-15) e non tocca il resto della story.

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — UNA migrazione forward, distruttiva, dopo quella della 19.1

`prisma/migrations/<timestamp>_remove_fiscal_code_aircraft_fields_hour_meter/migration.sql`, timestamp **successivo** alla migrazione della 19.1. Contenuto atteso (forma, non lettera):

```sql
-- DropTable (cascata implicita sulle sue FK verso Aircraft e User)
DROP TABLE "HourMeterAdjustment";
-- AlterTable (il DROP COLUMN rimuove anche l'indice unico Person_fiscalCode_key)
ALTER TABLE "Person" DROP COLUMN "fiscalCode";
ALTER TABLE "Aircraft" DROP COLUMN "hourMeterMinutes", DROP COLUMN "notes", DROP COLUMN "seats", DROP COLUMN "fuelType", DROP COLUMN "based";
ALTER TABLE "Flight" DROP COLUMN "hourMeterStart", DROP COLUMN "hourMeterEnd", DROP COLUMN "notes";
```

Generata con `prisma migrate dev --create-only` oppure scritta a mano col pattern TD-2 (precedente `20260724120000_drop_aircraft_owner`: commento in testa che cita story e ratifica, R-19-a/R-19-b). Verifica obbligatoria su un **DB gemello** (precedente 14.9 `am_rev149`), mai su `airmanager` mentre un arbitro e2e è vivo: catena completa `migrate deploy` da zero → `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --shadow-database-url <gemello> --script` = migrazione vuota; `\d "Person"`, `\d "Aircraft"`, `\d "Flight"` senza le colonne; `\dt "HourMeterAdjustment"` → nessuna relazione. Poi `npx prisma generate`.

**`airmanager_load` NON si tocca** (DB di misura dell'epic 17, HANDOFF): non si esegue `seed:load`, non lo si migra. Resterà indietro di due migrazioni (19.1 + 19.2) finché l'epic 17 non lo migra: drop di colonne, nessun dato utile perso.

### AD-2 — Codice fiscale: il pre-check di unicità diventa a un solo campo

`people.service.ts#assertUnique` (`:156-176`) oggi costruisce un `OR` su `email`/`fiscalCode`. Diventa: `if (!email) return;` → `findFirst({ where: { email, …excludeId } })`. Il messaggio dei **tre** `ConflictError` (`:174`, `:395`, `:572`) diventa `'A person with this email already exists.'`; il codice resta `CONFLICT` (generico), così la mappatura client esistente `code === 'CONFLICT' ? labels.errors.conflictEmail : …` (`pilot-editor.tsx:301`, `:633`) **non cambia** — cambia solo il testo della chiave i18n. `isUniqueViolation` (`:147`) resta (l'unico `@unique` residuo su `Person` è `email`): si aggiorna solo il suo doc-comment.

### AD-3 — Il lock `Aircraft` resta, con la sua ragione riscritta

Nei tre percorsi la **forma** del lock non cambia — primo statement della transazione, stesso ordine macro `Aircraft → Account` (modulo `flights.service.ts:94-110`), `correctFlight` con UN `SELECT … WHERE id IN (…) ORDER BY id FOR UPDATE` — cambia solo **cosa seleziona**:

| Percorso | Oggi | Dopo |
|---|---|---|
| `registerFlight` `:1271-1279` | `SELECT "hourMeterMinutes" … FOR UPDATE`, poi `existingAircraft.hourMeterMinutes` passato al core | `SELECT "id" … FOR UPDATE`; `NotFoundError` se 0 righe (invariato); niente valore passato al core |
| `cancelFlight` `:1499-1504` | idem, poi `decreaseHourMeterForReversal` `:1546-1554` | `SELECT "id" … FOR UPDATE` (resta: ordine macro col `correctFlight` concorrente e serializzazione annulla‖correggi dello stesso volo, che è ciò su cui poggia la ri-lettura LOW-1 della 16.2 a `:1645-1654`); nessun decremento |
| `correctFlight` `:1637-1643` | `SELECT "id", "hourMeterMinutes" … ORDER BY "id" FOR UPDATE` → `Map` usata anche come controllo di esistenza | `SELECT "id" … ORDER BY "id" FOR UPDATE` → un `Set` di id con **lo stesso** controllo di esistenza (`!has(original) \|\| !has(resolved)` → `NotFoundError`); niente decremento né `hourMeterById.set` |

`registerFlightCore` (`:1147-1222`) perde il parametro `aircraftHourMeterMinutes` e l'ultimo `tx.aircraft.update` (`:1216-1219`): dopo la story **nessuna** scrittura sulla riga `Aircraft` parte dal registro voli (verificato: nessun codice legge `Aircraft.updatedAt`). `decreaseHourMeterForReversal` (`:1013-1072`) sparisce intera.

**Doc-comment che diventano falsi** e vanno riscritti nello stesso commit (la ragione del lock non è più «taken for the contaore anyway»): modulo `:55-82` (storno senza contaore; «right under the `Aircraft` `FOR UPDATE` lock they take for the contaore anyway» → il lock esiste per serializzare `FLIGHT_OVERLAP` e per l'ordine macro), `:86` (il core non avanza più nulla), `assertNoOverlappingFlight` `:925-953` (`:932`, `:937` «taken for the contaore anyway», `:953` «notes, cycles, hour-meter readings»), `registerFlightCore` `:1127`, `:1142-1146`, `registerFlight` `:1241-1244` («same raw-query pattern as `adjustHourMeter`»), `:1271-1273`, `cancelFlight` `:1479-1483`, `correctFlight` `:1581`, `:1598`, e i riferimenti «notes/hour-meter-only correction» `:509`, `:605`, `:680`, `:685` («`updatedAt` changes on every write, including `adjustHourMeter`» → «on every write to the row»). Stesso censimento nella descrizione OpenAPI di `POST /flights` (`registry.ts:976`: «advances `Aircraft.hourMeterMinutes`», «Exactly one of `minutes` or the `hourMeterStart`/`hourMeterEnd` pair» — già stale dall'11.1, «invalid hour-meter pair», «the same `Aircraft` `FOR UPDATE` lock as the contaore», «one contaore advance») e di `/correct` (`:1006`: «changed notes, cycles or hour-meter readings»).

### AD-4 — Rimozione dei campi velivolo: l'editor resta un form RHF a tre campi

`IdentitySection` (`aircraft-editor.tsx:406-685`) perde Posti, Carburante, Basato, Contaore iniziale, Note: restano Marche, Tipo, Modello (+ il blocco «Tariffe» del create, invariato — è della 19.3). Orfani creati dalla story e quindi da togliere: `BasedSegmented` (`:688-724`), `KNOWN_FUEL_TYPES` (`:276`), `seatsField`/`hourMeterField`/`currentFuelType`/`extraFuelOption` (`:476-482`), gli import `Select` e `Segmented` (`:18`, `:20` — nessun altro uso nel file), la lista `known` della mappatura 422 (`:531-539`) ridotta a `registration`/`type`/`model`. La primitiva `Segmented` **resta** (consumer `new-booking-form.tsx:500`); si riscrivono solo i due commenti che citano `BasedSegmented` come esempio (`src/components/ui/segmented.tsx:24`, `new-booking-form.tsx:480`).

### AD-5 — «Ore totali» (R-19-b, D-1): UNA funzione, tre superfici, una query per pagina

La fonte unica è `aircraft.service.ts#sumFlightMinutesByAircraft` (`:731-743`, story 15.5), che **già** somma i `minutes` dei soli `REGISTERED` per un batch di id. Cambia solo la firma: `from: Date | null, to: Date | null` (`null` = nessun limite da quel lato — il `where` omette `gte`/`lte`). Il call-site esistente (`fleet/page.tsx:74`, «Ore mese») **non cambia**. Il totale si chiede con `(actor, ids, null, null)` — **senza** limite superiore: `fleet/page.tsx:64` calcola `today` in **UTC** (`todayDateOnlyUtc`, TD 16.9), e un `lte: today` escluderebbe i voli registrati fra le 00:00 e le 02:00 ora di Roma.

| Superficie | Oggi | Dopo | testid |
|---|---|---|---|
| Sheet flotta mobile (`fleet-console.tsx:357-372`) | riga «Contaore» = `formatMinutes(aircraft.hourMeterMinutes)` | riga **«Ore totali»** = `formatMinutes(totalMinutesById[id] ?? 0)`, **nella stessa posizione** (prima di «Ore mese») | — (righe generiche dello sheet) |
| Export xlsx velivoli (`exports.service.ts:189-210`) | colonna «Contaore»/«Hour meter» | colonna **«Ore totali»/«Total hours»** nella stessa posizione, una chiamata batch su `result.items.map(id)` | — |
| Editor velivolo, modalità MODIFICA (`aircraft-editor.tsx:355-357`) | sezione «Contaore» (valore + form rettifica + storico) | sezione **«Ore di volo»** in sola lettura, una riga: `<p className="fld-label" data-testid="aircraft-total-hours">{labels.flightHours.total}: {formatMinutes(totalMinutes)}</p>` — stessa classe del vecchio `hour-meter-current`, **nessun** CSS nuovo, **nessun** `var(--…)` inline | `aircraft-total-hours` (nuovo; nessun selettore `^=` lo intercetta — verificato `grep -rn 'data-testid\^=' e2e/`) |

Plumbing: `fleet/page.tsx` aggiunge la chiamata al `Promise.all` di `:71-75` e passa `totalMinutesById={Object.fromEntries(...)}` a `FleetConsole` (stesso pattern di `monthMinutesById`, prop accanto, **non** dentro `FleetConsoleItem`: `EditableAircraft` dell'editor è ricostruito dalle response API via `toEditable`, che il totale non lo hanno); `FleetConsole` passa all'editor `totalMinutes={target?.mode === 'edit' ? totalMinutesById[target.aircraft.id] ?? 0 : null}`. Il totale non cambia per nessuna azione dell'editor (l'editor non registra voli) e `router.refresh()` lo riallinea comunque. `exports.service.ts` importa `sumFlightMinutesByAircraft` (stesso gate `aircraft.manage` di `listAircraft`).

### AD-6 — Sheet flotta mobile: la sub è il tipo

`fleet-console.tsx:329-331`: `sub={sheetAircraft.type}` (`Aircraft.type` è NOT NULL e `min(1)` allo Zod: mai vuoto). Il commento `:323-328` (review 15.5 F1, «115 of the 121 active aircraft have no `fuelType`») si riscrive in una riga che dice perché il tipo. Le righe dello sheet diventano: Stato, (Motivo AOG), Tariffa, **Ore totali**, Ore mese. `labels.mobile.sheet` perde `seats`/`fuel`/`hourMeter`/`notes` e guadagna `totalHours`.

### AD-7 — `FleetCardItem` perde i cinque campi, nessuna superficie nuova

`src/components/dashboard/fleet-card.tsx:20-38`: via `hourMeterMinutes`, `notes`, `seats`, `fuelType`, `based`. `FleetCardGrid` non ne leggeva nessuno (rende solo marche, badge, modello, tariffa): i mapper di `fleet/page.tsx:87-105` e `dashboard/page.tsx:438-453` perdono le righe corrispondenti, nient'altro.

---

## §2 — Acceptance Criteria

### Persona — codice fiscale (P1)

1. **Schema e DB**: `Person.fiscalCode` e l'indice `Person_fiscalCode_key` non esistono più (`schema.prisma:42-45` e doc-comment `:30-35`; psql `\d "Person"` sul DB migrato non mostra né colonna né indice).
2. **API e contratto**: `POST /api/v1/people` e `PATCH /api/v1/people/{id}` con `fiscalCode` nel body rispondono 201/200 e la chiave non è né persistita né restituita; `GET /api/v1/people`, `GET /api/v1/people/{id}` non hanno `fiscalCode`. OpenAPI: `Person`, `PersonDetail`, `CreatePersonRequest`, `UpdatePersonRequest` senza la proprietà (assert in `registry.test.ts`); summary di `PATCH /people/{id}` (`registry.ts:465`) senza «fiscal code».
3. **Conflitto solo su email** (AD-2): due persone con la stessa email → 409 `CONFLICT` con messaggio `A person with this email already exists.`; una persona senza email non interroga mai il DB per l'unicità (`findFirst` non chiamato). Unit discriminante: il `where` di `findFirst` è `{ email, … }` e **non** contiene `OR` né `fiscalCode`. i18n: `PilotsPage.editor.errors.conflictEmail` = «Esiste già una persona con questa email.» / «A person with this email already exists.»; stesso testo per `PeoplePage.form.conflictError` (chiave orfana preesistente: se ne cambia il testo perché cita il CF, non la si cancella).
4. **UI**: nessun campo «Codice fiscale» nell'editor pilota (modifica `pilot-editor.tsx:347-349` e nuovo `:663-665`), nell'editor istruttore (`instructor-editor.tsx:345-347`), nessuna riga nei «Dati anagrafici» della scheda persona (`people/[id]/page.tsx:170`). e2e: `getByLabel('Codice fiscale', { exact: true })` → count 0 in editor pilota (nuovo e modifica) e istruttore; la scheda persona non contiene la riga. La griglia dei tre form **non lascia un buco** accanto a «Telefono» (oggi Telefono | Codice fiscale sulla stessa riga): il dev sceglie la disposizione (es. Email | Telefono affiancati) e la verifica a 1280 e 375 (AC 26).

### Velivolo — posti, carburante, basato, note (P2)

5. **Schema e DB**: `Aircraft.seats`, `fuelType`, `based`, `notes` non esistono più (`schema.prisma:290`, `:313-324`).
6. **API e contratto**: `POST`/`PATCH /api/v1/aircraft` ignorano le quattro chiavi (strip: 201/200, non persistite, non restituite); DTO `AircraftListItem` e schema OpenAPI `Aircraft`/`CreateAircraftRequest`/`UpdateAircraftRequest` senza di esse (assert in `registry.test.ts`); summary di `PATCH /aircraft/{id}` (`registry.ts:1065`) = «Update an aircraft (registration, type, model)».
7. **Editor velivolo** (AD-4): il form anagrafica, in creazione e in modifica, ha **solo** Marche, Tipo, Modello (+ il blocco Tariffe del create, invariato). e2e (precedente `aircraft-management.spec.ts:61-62` per «Proprietario»): `form.getByLabel(x, { exact: true })` → count 0 per «Posti», «Carburante», «Basato», «Note», «Contaore iniziale (minuti)».
8. **Sheet flotta mobile** (AD-6): righe = Stato, (Motivo AOG), Tariffa, Ore totali, Ore mese; nessuna riga Posti/Carburante/Contaore/Note; la sub è il tipo del velivolo; il nome accessibile resta ben formato per **ogni** velivolo (`expectWellFormedSheetName`, `mobile-registries.spec.ts:164-175`, invariato).

### Contaore (P3, P5, R-19-b)

9. **Schema e DB**: `Aircraft.hourMeterMinutes`, il modello/tabella `HourMeterAdjustment` (`schema.prisma:407-428`), le relazioni `Aircraft.hourMeterAdjustments` (`:329`) e `User.hourMeterAdjustments` (`:461-463`), `Flight.hourMeterStart`/`hourMeterEnd` (`:1020-1026`) non esistono più. I doc-comment di `schema.prisma` che citavano il contaore come termine di paragone (`:204`, `:270-276`, `:348`, `:366`, `:642`, `:761`, `:914-954`) sono riscritti o ripuntati su un elemento vivo.
10. **API rimossa**: `GET` e `POST /api/v1/aircraft/{id}/hour-meter-adjustments` → **404** (la cartella della route è cancellata; precedente e2e `movements.spec.ts:215-218`). OpenAPI: niente path, niente `CreateHourMeterAdjustmentRequest`/`HourMeterAdjustmentList` (`registry.ts:269-270`, `:1150-1176`, import `:21-24`); `registry.test.ts:60` tolto dall'elenco e sostituito da un'asserzione di **assenza** del path.
11. **Creazione velivolo**: `POST /api/v1/aircraft` con solo `{ registration, type, model }` → 201 (oggi 422). `createAircraftSchema`/`updateAircraftSchema`/`aircraftListItemSchema` senza `hourMeterMinutes`; via `createHourMeterAdjustmentSchema`, `listHourMeterAdjustmentsQuerySchema`, `hourMeterAdjustmentListItemSchema`, `hourMeterAdjustmentListResponseSchema` e i loro tipi.
12. **Registro voli senza contaore**: `POST /flights` e `POST /flights/{id}/correct` ignorano `hourMeterStart`/`hourMeterEnd` (strip) e la response non li contiene; il codice `HOUR_METER_INVALID` non esiste più (service `:788-805`, label `flight-editor.tsx:89`, i18n, registry). Nessun `tx.aircraft.update` e nessun `hourMeterAdjustment` in `flights.service.ts`; `decreaseHourMeterForReversal` non esiste più. Annullare un volo non scrive sulla riga `Aircraft`.
13. **Il lock resta** (P5, AD-3): `registerFlight`, `cancelFlight`, `correctFlight` aprono ancora la transazione con `SELECT "id" FROM "Aircraft" … FOR UPDATE` (multi-riga `IN (…) ORDER BY "id"` in `correctFlight`), prima del lock `Account`. Gli unit `flights.service.test.ts:1008`, `:1706`, `:2028`, `:2271` restano verdi con le **stesse** asserzioni (`toContain('FOR UPDATE')`, `toContain('Aircraft')`, ordine dei `$queryRaw`); gli unit della guardia (U-series `describe` di `:2271` e seguenti, U8/U9) restano verdi; gli e2e **E1, E3, E4** (`flights.spec.ts:959`, `:1018`, `:1037`) restano verdi senza le asserzioni sul contaore (il «one row» resta via `countFlights`). Un `NotFoundError` su velivolo inesistente resta in tutti e tre i percorsi.
14. **Editor velivolo — contaore**: nessuna sezione «Contaore» (via `HourMeterSection` `:1321-1500`, `fetchHourMeterHistory`, `HOUR_METER_HISTORY_PAGE_SIZE`, `formatSignedMinutes`, e `safeFormatMinutes`/l'import `formatDateTime` se restano senza uso); in creazione nessun «Contaore iniziale». In **modifica** (AD-5, D-1): sezione «Ore di volo» con `aircraft-total-hours` = Σ `minutes` dei voli `REGISTERED` del velivolo, in `H:MM` (velivolo senza voli → `0:00`).
15. **«Ore totali» ovunque si mostravano le ore** (AD-5): la riga dello sheet flotta mobile e la colonna dell'export xlsx velivoli (`Ore totali` / `Total hours`, stessa posizione della vecchia colonna) mostrano **lo stesso** numero del readout dell'editor; un volo `CANCELLED` non conta; una sola query di aggregazione per pagina della flotta e una per export (nessuna query per riga). Unit: `sumFlightMinutesByAircraft(actor, ids, null, null)` costruisce un `where` **senza** `flightDate`; il caso esistente con finestra resta invariato.
16. **e2e che misuravano il contaore, riconvertiti con lo stesso potere discriminante**: `flights.spec.ts:255-270` (volo di 80' → `aircraft-total-hours` = `1:20`, era `3:00` = 100+80); `flight-reversal.spec.ts:201-208` (volo di 60' → `1:00`, era `9:20`) e `:247-250` (dopo l'annullamento → `0:00`, era `8:20`); `aircraft-management.spec.ts:82-84` (velivolo appena creato → `0:00`); `exports.spec.ts:181` intestazioni `[…, 'Model', 'Total hours', 'Status', …]` + almeno un'asserzione di valore su un velivolo con voli (es. il test di `:107` con due voli 90'+30' → `2:00` sull'export velivoli filtrato per marche).
17. **Nessuna superficie nuova**: card flotta desktop e mobile, widget Panoramica (`FleetCard`) invariati nella resa; `FleetCardItem` senza i cinque campi (AD-7).

### Volo — note (P4)

18. **Schema, API, UI**: `Flight.notes` non esiste più; `POST /flights`/`/correct` ignorano `notes` (strip) e la response non lo contiene. Il form volo (`flight-editor.tsx`, nuovo e correzione, desktop e pannello mobile) non ha «Contaore iniziale», «Contaore finale», «Note» (e2e: `getByLabel(x, { exact: true })` → count 0); lo sheet del registro voli mobile non ha le righe «Contaore» e «Note» (`mobile-logbook.spec.ts:540-541` → `rows['Contaore']` e `rows['Note']` **undefined**, il resto della parità invariato).
19. **I test «correzione solo-note» diventano «correzione solo-cicli»** con le stesse asserzioni: e2e `flights.spec.ts:610-699` (riempie «Atterraggi» con `{ exact: true }` — «Ora atterraggio» contiene «atterraggi» — e quel campo, più in basso del combobox, è anche ciò che chiude il popup: mai `Escape`, CLAUDE.md), `flights.spec.ts:1082-1092` (`landings: 2` al posto di `notes`); unit U8 `flights.service.test.ts:2377` e il caso «notes-only correction» di `:2050` riformulati su un campo vivo (es. `landings`).

### Migrazione, seed, contratti, residui

20. **Migrazione** (AD-1): una sola migrazione forward, successiva a quella della 19.1; catena `migrate deploy` da zero verde su DB gemello; `migrate diff` = zero drift; esiti psql riportati nel Dev Agent Record.
21. **Seed**: `prisma/seed.ts` (`:196-215`), `prisma/seed-demo.ts` (`:130-148`, `:436` commento, `:452` note volo), `prisma/seed-load.ts` (`:183-193`, `:445-525`, `:575-585`, `:650-690`, `:720-760`, `:785-790`, `:855-863` + commenti `:15`, `:451`, `:535`, `:608-613`, `:696-705`) senza i campi rimossi. `npx prisma db seed` e `npm run seed:demo` girano verdi su DB fresco; `seed-load.ts` passa il typecheck (NON eseguirlo: AD-1). In `seed-load.ts` la de-duplicazione per velivolo dei `takeoffAt` (`:609-620`) **resta** (evita anche due voli sovrapposti): si riscrive solo la sua motivazione.
22. **Nessun residuo** — tutti a **0 righe** (escluse `src/generated/`, `prisma/migrations/`, `_bmad-output/`, `docs/`):
    - `grep -rniE "hour.?meter|contaore|HOUR_METER" src e2e messages scripts prisma/schema.prisma prisma/seed.ts prisma/seed-demo.ts prisma/seed-load.ts --exclude-dir=generated`
    - `grep -rniE "fiscal" src e2e messages prisma/schema.prisma prisma/seed.ts prisma/seed-demo.ts prisma/seed-load.ts --exclude-dir=generated`
    - `grep -rnE "\bseats\b|fuelType|fuelOptions|KNOWN_FUEL_TYPES|\.based\b|\bbased:|basedOptions|BasedSegmented|'based'" src e2e messages prisma/schema.prisma prisma/seed.ts prisma/seed-demo.ts prisma/seed-load.ts --exclude-dir=generated` — **unica eccezione ammessa**: `src/lib/mobile-reports.ts:62` («than there are seats», prosa senza relazione coi velivoli)
    - `grep -nw "notes" src/lib/schemas/flights.ts src/server/services/flights.service.ts 'src/app/[locale]/dashboard/logbook/flight-editor.tsx' 'src/app/[locale]/dashboard/logbook/logbook-console.tsx' 'src/app/[locale]/dashboard/logbook/page.tsx' src/lib/schemas/aircraft.ts src/server/services/aircraft.service.ts 'src/app/[locale]/dashboard/fleet/'*.tsx src/components/dashboard/fleet-card.tsx` — **unica eccezione ammessa**: il commento di `logbook-console.tsx:790-791` («lineage (correction/cancellation notes)», prosa)
    - `grep -n "editor.fields.notes\|'mobile.notes'\|mobile.sheet.notes\|editor.identity.notes" -r src` → 0
23. **i18n**: le 44 chiavi di §3.8 assenti da **entrambi** i file, le 4 nuove presenti in entrambi, i 2 testi cambiati; parità it/en **0/0** (`diff <(jq -r '[paths(scalars)|map(tostring)|join(".")]|.[]' messages/it.json | sort) <(jq … messages/en.json | sort)` vuoto) e conteggio chiavi riportato nel record.
24. **OpenAPI servito**: `GET /api/v1/openapi.json` sull'app reale non contiene `hour-meter-adjustments`, `hourMeterMinutes`, `hourMeterStart`, `hourMeterEnd`, `fiscalCode`, `seats`, `fuelType`, `based` (lo schema `Aircraft` non ha più `notes`; `Flight`/`RegisterFlightRequest`/`CorrectFlightRequest` neppure). Contratto per la futura app Flutter: la response di `GET /aircraft` è un **sottoinsieme** stretto di quella di oggi (nessun campo rinominato, nessun campo nuovo — D-2).
25. **Gate**: `npm run gates` verde (lint, typecheck, vitest, build); e2e mirati verdi via `scripts/e2e.sh start <spec…>` (l'elenco di §4.2); l'arbitro full-suite su DB fresco lo esegue la sessione principale.
26. **Verifica UI interattiva** (Playwright MCP o script throwaway in `/tmp`, v. CLAUDE.md), screenshot a **1280** e **375** di: editor pilota (modifica + nuovo), editor istruttore, scheda persona, editor velivolo (nuovo + modifica con `aircraft-total-hours`), sheet flotta mobile, form volo (nuovo + correzione), sheet registro voli mobile — nessun buco di griglia, nessun overflow orizzontale, `.so-foot` invariato.

---

## §3 — Dev Notes: blast radius (misurato su `5ca0be6`; rieseguire i comandi dopo la 19.1)

### 3.1 — Schema e migrazione
- `prisma/schema.prisma`: `Person` `:30-45`; `Aircraft` doc `:266-283` + campi `:289-290`, `:313-324`, relazione `:329`; `AircraftRate` doc `:348`, `:366`; `HourMeterAdjustment` `:407-428`; `User` `:461-463`; `StudentInstructorAssignment` doc `:204`; `AccountMovement` doc `:638-643`; `PackageType` doc `:761`; `Flight` doc `:914-954`, campi `:1020-1026`, `:1033`. ⚠️ Altri `notes` del file NON si toccano: `InstructorPayout.notes` `:181`, `Booking.notes` `:1175`, `Expiry.notes` `:1428`, `PprRequest.notes` `:1683` (quest'ultimo sparisce con la 19.1).
- Migrazioni d'origine (storiche, immutabili): `20260705061624_add_person_crud_fields`, `20260705100000_add_aircraft`, `20260705150000_add_aircraft_status_hour_meter_adjustment`, `20260707150000_add_flights`, `20260710130000_add_flight_logbook_fields`, `20260715170000_add_aircraft_fleet_fields`.

### 3.2 — Server
- `src/server/services/people.service.ts`: `:26`, `:74`, `:95`, `:122`, `:146`, `:156-176` (AD-2), `:387`, `:395`, `:480`, `:545`, `:554`, `:566`, `:572`.
- `src/server/services/aircraft.service.ts`: import `:7`, `:9`; DTO `:27-28`, `:33-38`; `AIRCRAFT_SELECT` `:64-65`, `:69-71`; `toListItem` `:85-86`, `:90-92`; blocco rettifiche `:98-150`; `createAircraft` `:289-295`; `updateAircraft` doc `:321-326` + `:348-351`; `adjustHourMeter` + `listHourMeterAdjustments` `:619-706` (via); `sumFlightMinutesByAircraft` `:708-743` (firma nullable, AD-5; doc-comment aggiornato col secondo consumatore).
- `src/server/services/flights.service.ts`: righe di AD-3 + DTO `:155-159`, `FLIGHT_SELECT` `:211-214`, `SelectedFlight` `:249-252`, `toListItem` `:298-301`, `ResolvedFlightInput` `:372-373`, `resolveFlightInput` doc `:563-565` + corpo `:788-805` + return `:917-918`, `RegisterFlightCoreInput` `:1078-1106`, core `:1175-1179`, `registerFlight` `:1311`, `:1324-1328`, `correctFlight` `:1714-1752`.
- `src/server/services/exports.service.ts:181-210` (AD-5; il commento di deviazione `:182-187` sulla tariffa resta vero).
- Doc-comment da ripuntare: `src/server/services/errors.ts:37` (esempio «invalid hour-meter reading» → «an invalid takeoff/landing pair»), `src/lib/time.ts:59`, `src/lib/schemas/accounts.ts:31`, `:115`, `src/server/services/accounts.service.ts:282`, `src/app/api/v1/aircraft/[id]/rates/route.ts:10` («same pattern as `.../out-of-service`»).
- Route da cancellare: `src/app/api/v1/aircraft/[id]/hour-meter-adjustments/route.ts` (intera cartella).

### 3.3 — Zod e OpenAPI
- `src/lib/schemas/people.ts:9`, `:22`, `:36`, `:100`.
- `src/lib/schemas/aircraft.ts`: doc `:9`, `:33-44`, campi `:54-58`, doc `:64-70`, campi `:77-80`, doc `:105`, `:109`, blocco rettifiche `:157-199`, doc `:226-230`, campi `:236-237`, `:242-244`, doc `:276`.
- `src/lib/schemas/flights.ts`: doc `:60-80`, campi `:104-105`, `:113`, doc `:151-155`, campi `:175-179`, doc `:245-247`.
- `src/lib/schemas/registry.ts`: import `:21-24`, register `:269-270`, `:465`, `:976`, `:1006`, `:1065`, path `:1150-1176`. `src/lib/schemas/registry.test.ts:60` + asserzioni nuove (AC 2, 6, 10, 24).

### 3.4 — UI
| File | Righe | Cosa |
|---|---|---|
| `pilots/pilot-editor.tsx` | `:56`, `:261`, `:287`, `:311`, `:323`, `:347-349`, `:459`, `:594`, `:663-665` | CF via (tipo label, PilotRow, mappatura 422, form modifica e nuovo) |
| `pilots/pilot-editor-labels.ts` | `:37` | label CF |
| `pilots/pilots-console.tsx` | `:52` | `PilotRow.fiscalCode` |
| `pilots/page.tsx` | `:78` | mapper |
| `people/[id]/page.tsx` | `:170`, `:190` | riga «Dati anagrafici» + `personRow` |
| `instructors/instructor-editor.tsx` | `:51`, `:205`, `:283`, `:345-347` | CF via |
| `instructors/page.tsx` | `:131` | label CF |
| `fleet/aircraft-editor.tsx` | header `:7`, import `:18`, `:20`, `:27`, `:30`, `:35-36`; labels type `:53-60`, `:122-133`, `:149`, `:163`; `AircraftApiResponse` `:195-203`; `toEditable` `:219-226`; helper `:243-268`, `:276`; sezione `:355-357`; `IdentitySection` `:446-454`, `:476-482`, `:531-539`, `:580-622`; `BasedSegmented` `:688-724`; commento `:752`; `HourMeterSection` `:1321-1500` | AD-4, AD-5 (prop `totalMinutes`, sezione «Ore di volo») |
| `fleet/fleet-console.tsx` | `:68`, `:79`, `:92-93` (prop nuova accanto), `:303-314` (prop all'editor), `:323-331`, `:357-372` | AD-5, AD-6 |
| `fleet/page.tsx` | `:71-75`, `:92-93`, `:99-101`, `:125`, `:151-155`, `:171-182`, `:235-245`, `:262`, `:275` | AD-5, label |
| `components/dashboard/fleet-card.tsx` | `:25-31` | AD-7 |
| `dashboard/page.tsx` | `:443-449` (mapper flotta), `:795`, `:820-822`, `:826` (label del `FlightEditor`) | ⚠️ le note di `:177`, `:188`, `:207`, `:407` sono della **prenotazione**: restano |
| `logbook/flight-editor.tsx` | `:58-59`, `:83-85`, `:89`, `:245-249`, `:263-267`, `:278-282`, `:335` (commento «notes-only»), `:594-611`, `:621`, `:626`, `:642-645`, `:1062-1070` | P3/P4 |
| `logbook/logbook-console.tsx` | `:160-161`, `:430` (commento R-15.6-b), `:461-466` | righe sheet |
| `logbook/page.tsx` | `:320`, `:345-347`, `:351`, `:416-417` | label |
| `components/ui/segmented.tsx:24`, `bookings/new-booking-form.tsx:480` | commenti che citano `BasedSegmented` | AD-4 |
| `src/styles/airops.css` | `:2745-2746` («an email or a fiscal code» → «an email»), `:3886` («(tariffe, contaore, archivio)» → «(tariffe, archivio)») | solo commenti |

### 3.5 — Il lock dopo la story (censimento `FOR UPDATE` in `src/server`)
Prima: `aircraft.service.ts:646` (`adjustHourMeter`), `flights.service.ts:1275`, `:1500`, `:1639` sull'`Aircraft` + i lock `Account`/`Booking`/`PprRequest`. Dopo: **sparisce solo** `aircraft.service.ts:646`; i tre di `flights.service.ts` restano (colonna selezionata `"id"`). L'ordine globale dei lock delle prenotazioni (16.3 AD-2, `Booking → Aircraft → Person → InstructorProfile`) non è toccato; quello del registro voli (`Aircraft → Account`) neppure.

### 3.6 — Blast radius e2e (comando: `grep -rnE "hourMeter|HourMeter|hour-meter|Contaore|contaore|fiscal|seats|fuelType|based: true|notes" e2e`)
- **`hourMeterMinutes` nei payload `POST /api/v1/aircraft`** — 29 spec, 41 righe, si toglie la chiave e basta (nessuno di questi test legge il valore): `aircraft-out-of-service-until:67`, `aog-impact-email:109`, `aog-overview-count:82,107`, `api-v1:94`, `billing:90`, `bookings:93`, `booking-window:33`, `datetime-picker:37`, `exports:39`, `flight-log:144`, `flight-reversal:147`, `flights:162`, `home-dashboard:124`, `instructor-compensation:68`, `mobile-logbook:98` (anche `seats: 2`), `mobile-overview-overflow:65` (+ commento `:60` «needs `type` and `hourMeterMinutes`»), `mobile-overview:67`, `mobile-planning:75`, `mobile-registries:80` (anche `seats`/`fuelType`/`based`/`notes`, e il parametro `fuelType` della helper `:77`, passato esplicitamente solo dal chiamante `:333`), `mobile-reports:215`, `mobile-self-public:140`, `mobile-settings:604`, `my-account:110`, `my-compensation:146`, `pdf-exports:57`, `people-management:168`, `person-detail:157`, `reports:101`, `typeahead-pickers:111`.
- **Helper UI che compilano «Contaore iniziale (minuti)»** (il campo non esiste più → il `fill` andrebbe in timeout): `aircraft-management:66`, `:98`; `aircraft-rates:50`, `:206`; `aircraft-status-hours:50`.
- **Asserzioni su `hour-meter-current`**: `aircraft-management:84` → AC 16; `aircraft-rates:219-220` → si toglie la riga (il test è sulle tariffe) e si riscrive il commento; `flight-reversal:208`, `:250` → AC 16; `flights:270` → AC 16; `aircraft-status-hours:89`, `:99` (nei test che si cancellano).
- **Test da CANCELLARE** (interamente sul contaore): `aircraft-status-hours.spec.ts:84` (rettifica + storico) e `:111` (storico «ultimi 5 + carica altri»); `flights.spec.ts:316` (coppia non valida) e `:337` (coppia incompleta); `flights.spec.ts:1271` **E7** (clamp dello storno + `HourMeterAdjustment`). Totale **−5 test e2e**: dichiararlo alla sessione principale per il conteggio dell'arbitro (che cambia anche per la 19.1).
- **Test da RIFORMULARE**: `flights.spec.ts` E1/E2/E3 (`:959`, `:993`, `:1018` — via `hourMeterMinutes()` `:898-902` e le asserzioni `meter*`, titoli senza «one contaore advance»; il «one row» resta su `countFlights`), titoli/commenti `:265`, `:279`, `:295`, `:867`; `flight-reversal.spec.ts:161` (titolo «balance/contaore revert» → «balance revert»), `:201-205`, `:247-249`; `aircraft-status-hours.spec.ts` header `:12-17` e describe `:58` («Aircraft operational status (Story 2.5)»); `aircraft-management.spec.ts:82`; `mobile-registries.spec.ts:150-160` (commento della helper: storia del difetto 15.5 F1 senza nominare `fuelType`), `:316` (parità dello sheet con le righe nuove — preferire la mappa `bottom-sheet-k → bottom-sheet-v` come fa `mobile-logbook.spec.ts:521-525`, non `toContainText('Note')` che è substring), `:331` (commento «based · fuel»), il test `:327-350` («velivolo SENZA carburante», ora «la sub è sempre il tipo»); `mobile-logbook.spec.ts:153-155` (tipo `FlightOverrides`), `:500-505`, `:538-541`; `flights.spec.ts:610-699` e `:1082-1092` (AC 19).
- **⚠️ Selettori `^=`** (CLAUDE.md): `aircraft-status-hours.spec.ts:39`, `aircraft-management.spec.ts:46`, `aircraft-rates.spec.ts:39` sono citati per **numero di riga** in `CLAUDE.md` («Il suffisso `-mobile` è ILLEGALE…»). Se le modifiche sopra quelle righe le fanno slittare, aggiornare `CLAUDE.md` **nello stesso commit** (regola di manutenzione del file).

### 3.7 — Unit esistenti che cambiano
- `flights.service.test.ts`: mock `hourMeterAdjustment` `:47`, `:129`, `:323`; i `queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }])` (≈20 occorrenze da `:508`) → `[{ id: 'aircraft_1' }]`; `aircraftUpdateMock` asserito a `:1002-1005` → `not.toHaveBeenCalled()` (è la prova di AC 12); **via**: `:722` (coppia divergente accettata), `:742`, `:751`, `:760` (`HOUR_METER_INVALID`), `:1673` (decremento), `:1682` (clamp), l'intero `describe` `:2466-2530` (U10, U11, AC 14, U12), `:2894` (schema accetta la coppia), `:2908` (note > 1000); **riformulati**: titoli `:695`, `:959`, `:971`, `:1966`, `:2302` (via la variabile `hourMeterMinutes` e il mock dell'update), `:2050`, `:2377` (AC 19), `:2903` (via `notes`), + un caso nuovo «una chiave `hourMeterStart`/`hourMeterEnd`/`notes` è scartata» sul modello di `:2887`. **Restano identici nelle asserzioni**: `:1008`, `:1017`, `:1706`, `:2028`, `:2271` (AC 13).
- `aircraft.service.test.ts`: mock `hourMeterAdjustment` `:17`, `:90-92`, `:117-125`; **via**: gate `:242`, `:249`; `:411`, `:422`, `:433` (campi 12.5 in create), `:526`, `:558`; `describe` `:1050-1097` e `:1098-1153`; fixture `SELECTED_AIRCRAFT`/`input` senza i campi; `describe` `:1154` + un caso `from/to = null` (AC 15); + un caso «una chiave `hourMeterMinutes`/`seats`/`fuelType`/`based`/`notes` è scartata da `createAircraftSchema`».
- `people.service.test.ts`: `:158`, `:224`, `:270`, `:480`, **via** `:504-510`, riformulato `:512-518` («never conflicts when email is omitted»), + l'unit discriminante di AC 3 sulla forma del `where`.
- `exports.service.test.ts`: fixture voli `:163-166`, `:223-226`, `:274-277` (+ `notes: null` delle altre fixture **solo se** sono voli — `:364`, `:791`, `:837`, `:890`, `:935`, `:981` sono di altri export: verificare caso per caso); il `vi.mock('./aircraft.service', …)` di `:18` guadagna `sumFlightMinutesByAircraft: vi.fn()`.
- `flights-expiry-boundary.integration.test.ts:135-138`, `:205`; `registry.test.ts:60`; `handler.test.ts:318`, `:326` (codice d'esempio → `FLIGHT_TIMES_INVALID`); `accounts.service.test.ts:116` (commento).
- **Env eager** (CLAUDE.md): nessun import nuovo verso mail/crypto; se un test nuovo importa un service «grosso», mockare la catena e verificare con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.

### 3.8 — Chiavi i18n (in **entrambi** `messages/it.json` e `messages/en.json`)
- **Rimosse (44)**: `PeoplePage.form.fiscalCode`; `PilotsPage.editor.identity.fiscalCode`; `InstructorsPage.editor.identity.fiscalCode`; `PersonDetailPage.personalData.fiscalCode`; `AircraftPage.table.hourMeter`; `AircraftPage.mobile.sheet.{seats,fuel,hourMeter,notes}`; `AircraftPage.editor.identity.{seats,fuelType,fuelOptions.avgas,fuelOptions.jetA1,fuelOptions.mogas,based,basedOptions.based,basedOptions.guest,notes,hourMeter,hourMeterHint}`; `AircraftPage.editor.hourMeter.{sectionTitle,current,newValue,hint,reason,delta,submit,historyTitle,historyEmpty,loadMore}`; `AircraftPage.editor.errors.invalidHourMeter` (già orfana nel corpo dell'editor); `AircraftPage.toast.hourMeterAdjusted`; `FlightsPage.form.{hourMeterStart,hourMeterEnd,notes,invalidHourMeter,errors.HOUR_METER_INVALID}`; `LogbookPage.editor.{invalidHourMeter,fields.hourMeterStart,fields.hourMeterEnd,fields.notes,errors.HOUR_METER_INVALID}`; `LogbookPage.mobile.{hourMeter,notes}`.
- **Nuove (4)**: `AircraftPage.table.totalHours` («Ore totali» / «Total hours»); `AircraftPage.mobile.sheet.totalHours` (idem); `AircraftPage.editor.flightHours.sectionTitle` («Ore di volo» / «Flight hours»); `AircraftPage.editor.flightHours.total` («Ore totali» / «Total hours»). Copy definitiva: la 19.12 (glossario).
- **Testo cambiato (2)**: `PilotsPage.editor.errors.conflictEmail`, `PeoplePage.form.conflictError` (AC 3).
- ⚠️ Le chiavi `*.notes` di prenotazioni, scadenze, compensi, Panoramica (`DashboardPage.mobile.detail.notes` = note della **prenotazione**) NON si toccano; quelle PPR spariscono con la 19.1.

---

## §4 — Piano di test

### 4.1 — Unit
Come §3.7. Le prove nuove: (a) forma del `where` di `assertUnique` (AC 3); (b) strip delle chiavi rimosse su `createPersonSchema`/`updatePersonSchema`, `createAircraftSchema`/`updateAircraftSchema`, `registerFlightSchema`/`correctFlightSchema` (AC 2, 6, 12, 18); (c) `registerFlight`/`correctFlight`/`cancelFlight` non chiamano `aircraft.update` (AC 12); (d) `sumFlightMinutesByAircraft` con limiti `null` (AC 15); (e) le quattro prove del lock **invariate** (AC 13).

### 4.2 — e2e (project `chromium` `fullyParallel`, fixture run-unique; via `scripts/e2e.sh`)
Mirati da far girare prima della consegna: `aircraft-management`, `aircraft-rates`, `aircraft-status-hours`, `flights`, `flight-reversal`, `exports`, `mobile-registries`, `mobile-logbook`, `people-management` (o lo spec che apre l'editor pilota) + lo spec dell'editor istruttore, `person-detail`, `api-v1`, `registry` via vitest. Nuove asserzioni minime: assenze di AC 4, 7, 18; `POST /aircraft` con sole marche/tipo/modello → 201 e una POST con le chiavi rimosse → 201 con response senza di esse (AC 6, 11); `GET`/`POST …/hour-meter-adjustments` → 404 (AC 10); readout/riga/colonna «Ore totali» (AC 15-16). Nessuno spec nuovo entra nella catena serializzata: nessuno muta AppSettings né asserisce aggregati globali.

### 4.3 — Discriminanza
È una story di rimozione: la «guardia» da provare rossa è una sola, il lock. Prova obbligatoria nel Dev Agent Record: commentare il `$queryRaw … FOR UPDATE` di `registerFlight` → `flights.service.test.ts:1008` **rosso**; ripristino byte-identico (sha256 dichiarato del file prima/dopo). Per AC 15: sostituire `status: 'REGISTERED'` con nulla nel `where` di `sumFlightMinutesByAircraft` → l'asserzione `0:00` dopo l'annullamento di `flight-reversal.spec.ts` (o un unit equivalente) **rossa**; ripristino byte-identico.

### 4.4 — Gate
`npm run gates` (mai i quattro comandi verbosi separati) + i grep di AC 22 + parità i18n di AC 23 + gli e2e mirati. **Prima** di gates/build/e2e: `scripts/e2e.sh status` e `ss -ltnp | grep :3000` — mai una build sotto un arbitro vivo (incidente AOG-1b, HANDOFF).

---

## §5 — Trappole note

1. **`$queryRaw` su una colonna droppata compila** (template string): solo il grep di AC 22 e gli e2e del registro voli lo prendono. Non affidarsi al typecheck.
2. **Zod strip**: gli spec che mandano ancora `hourMeterMinutes`/`notes` passerebbero verdi senza pulizia → il grep li costringe. Nessun test deve aspettarsi un 422 per una chiave rimossa.
3. **Non cancellare il lock insieme alla lettura del contaore** (AD-3): cambia la colonna selezionata, non lo statement. In `correctFlight` la `Map` era anche il controllo di esistenza: il `Set` lo deve mantenere.
4. **`getByLabel` è substring** (CLAUDE.md): «Atterraggi» matcha «Ora atterraggio», «Note» può matchare label future, «Posti»/«Tipo» idem → sempre `{ exact: true }`, anche nelle asserzioni di assenza (un count 0 su substring è cieco, un count > 0 su substring è un falso rosso).
5. **Mai `Escape` dentro lo `SlideOver`** per chiudere il popup del combobox nel test «correzione solo-cicli»: si chiude riempiendo «Atterraggi».
6. **`src/generated/prisma`** è gitignored: `npx prisma generate` dopo ogni modifica allo schema, altrimenti typecheck e build girano su un client stantio.
7. **Migrazione sul DB gemello**, mai su `airmanager` con l'arbitro vivo; **mai** `docker compose down -v` (distrugge `airmanager_load`); `airmanager_load` non si migra né si ri-semina qui (AD-1).
8. **File in comune con la 19.1** (banner in testa): rifare i censimenti, non fidarsi delle righe.
9. **`exports.service.test.ts`** mocka `./aircraft.service` con un factory esplicito: aggiungere `sumFlightMinutesByAircraft` al factory, o il primo test che arrivasse all'export velivoli fallirebbe con «No export is defined on the mock».
10. **La griglia degli editor persona** perde un campo a metà riga (AC 4): verificare visivamente, non solo via test.
11. **Commenti storici con i nomi rimossi** (story 2.5, 12.5, 15.5 F1, 16.2 F13…): se il nome compare nel grep di AC 22 va riformulato anche quando il commento racconta il passato — un commento che nomina un campo inesistente come se esistesse è il difetto che la sweep 13.4 ha già pagato.

---

## §6 — Fuori scope DICHIARATO

- Resto del form volo (due tipi, dropdown uniformi, toggle DC/solista): **19.5**. Volo senza addebito, cancellazione definitiva, modifica in place: **19.6** (qui annullamento e correzione restano storno + catena, solo senza contaore).
- Tariffe allievo/pilota, editor velivolo a Salva unico, il campo «dry» del create: **19.3**. Editor pilota/istruttore a Salva unico: **19.4**.
- Un campo «ore» nel DTO API `Aircraft` (D-2). Una vista desktop nuova delle ore oltre al readout dell'editor (D-1).
- Migrare/ri-seminare `airmanager_load` (epic 17).
- Revisione delle copy nuove: **19.12**.
- La chiave orfana `PeoplePage.form.*` e gli altri orfani preesistenti non legati ai campi rimossi: si segnalano, non si cancellano (karpathy).

---

## §7 — Riferimenti

- CR: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` (§2.3, §4.0 R-19-a/R-19-b, §4.2, §4.7 FR-7/FR-9).
- PRD: `_bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md` (change record: FR-7 senza contaore e senza posti/carburante/note/basato, FR-9 eliminato — `:407-408`).
- Architettura: `_bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md:220` — riga «Velivoli (FR-7..9) | AD-2 (contaore in minuti)»: **da aggiornare in questa story** (es. «Velivoli (FR-7; FR-9 eliminato) | AD-2»).
- Precedenti: `13-4-flotta-toggle-storici-owner.md` (drop campo velivolo + sweep), `14-9-rimozione-ruolo-staff.md` (catena migrazioni su DB gemello), `16-2-guardie-registro-voli.md` (lock e `FLIGHT_OVERLAP`), `15-5-*`/`15-6-*` (sheet flotta e registro mobili, R-15.5-b, R-15.6-b).
- `CLAUDE.md` (convenzioni e2e, gates, env eager, manutenzione del file); `docs/handoffs/HANDOFF.md` (ambiente, reset DB, arbitro).

---

## Tasks / Subtasks

- [ ] **T0 — Riallineamento** (AC tutti): `git log --oneline -5` (la 19.1 deve essere committata), `scripts/e2e.sh status`, `:3000` libero; rieseguire i comandi di §3.6 e i grep di AC 22 sul HEAD e annotare nel record gli scostamenti di riga rispetto a questo file.
- [ ] **T1 — Schema e migrazione** (AC 1, 5, 9, 18, 20): `schema.prisma` (campi, modello, relazioni, doc-comment §3.1); migrazione AD-1; verifica su DB gemello (deploy da zero, `migrate diff` vuoto, psql); `npx prisma generate`.
- [ ] **T2 — Server** (AC 2, 3, 11, 12, 13, 15): `people.service.ts` (AD-2); `aircraft.service.ts` (campi, via rettifiche, firma nullable di `sumFlightMinutesByAircraft`); `flights.service.ts` (AD-3: lock su `"id"`, via contaore e note, core senza update `Aircraft`, doc-comment); `exports.service.ts` (colonna «Ore totali»); doc-comment di §3.2; cancellare la route `hour-meter-adjustments`.
- [ ] **T3 — Zod e OpenAPI** (AC 2, 6, 10, 11, 12, 24): `people.ts`, `aircraft.ts`, `flights.ts`, `registry.ts` (path, register, descrizioni `:465`, `:976`, `:1006`, `:1065`), `registry.test.ts`.
- [ ] **T4 — UI persona** (AC 4): editor pilota (modifica + nuovo), editor istruttore, scheda persona, pagine/label; griglia senza buchi.
- [ ] **T5 — UI velivolo** (AC 7, 8, 14, 15, 17): `aircraft-editor.tsx` (AD-4, AD-5), `fleet-console.tsx` (AD-5, AD-6), `fleet/page.tsx`, `fleet-card.tsx`, `dashboard/page.tsx` (mapper); commenti `segmented.tsx`/`new-booking-form.tsx`/`airops.css`.
- [ ] **T6 — UI volo** (AC 12, 18): `flight-editor.tsx`, `logbook-console.tsx`, `logbook/page.tsx`, label del `FlightEditor` in `dashboard/page.tsx`.
- [ ] **T7 — i18n** (AC 3, 23): §3.8 su entrambi i file; parità misurata.
- [ ] **T8 — Seed** (AC 21): `seed.ts`, `seed-demo.ts`, `seed-load.ts`; `db seed` + `seed:demo` su DB fresco; `seed-load.ts` solo typecheck.
- [ ] **T9 — Unit** (AC 3, 12, 13, 15, 19): §3.7 + prove nuove di §4.1; prova di discriminanza del lock (§4.3) con sha256.
- [ ] **T10 — e2e** (AC 4, 7, 8, 10, 11, 13, 16, 18, 19): §3.6; asserzioni nuove di §4.2; eventuale aggiornamento delle righe `^=` citate in `CLAUDE.md`.
- [ ] **T11 — Documenti** (§7): riga `ARCHITECTURE-SPINE.md:220`.
- [ ] **T12 — Verifica** (AC 22, 24, 25, 26): grep a zero, OpenAPI servito, `npm run gates`, e2e mirati via `scripts/e2e.sh`, screenshot 1280/375; Dev Agent Record compilato (righe effettive, conteggi test prima/dopo, delta e2e per l'arbitro).

---

## Dev Agent Record

### Agent Model Used

### §A — Riallineamento sul HEAD (T0)

### §B — Riepilogo per AC con le prove

### §C — Migrazione: catena, `migrate diff`, psql

### §D — Discriminanza (lock, «Ore totali») con sha256

### §E — Grep di AC 22 e parità i18n (verbatim)

### §F — Delta test (unit ed e2e, prima/dopo)

### §G — Deviazioni motivate

### §H — Verifica UI (screenshot)

### §I — Gate ed esiti verbatim

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created (story writer, 2026-11-01, ricognizione su `5ca0be6`).

### File List
