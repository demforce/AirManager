---
baseline_commit: 72e7e1b
---

# Story 19.3: Tariffe allievo/pilota ed editor velivolo a Salva unico

Status: **review** — 2026-11-02 (dev: implementazione `2e66d40`, Dev Agent Record in fondo). Scritto **ready-for-dev** il 2026-11-01. **Le 4 domande PO qui sotto sono RATIFICATE (2026-11-01): Q-a = nessun prezzo sulle card, Q-b = A, Q-c = B (allievo esclusivo anche con istruttore), Q-d = B** (CLAUDE.md, retro Epic 9: un'assunzione di dominio si ratifica PRIMA di implementare). Gli AC sono scritti sull'opzione raccomandata e marcano con **[Q-x]** le righe che cambiano se il PO sceglie diversamente. **Modello dev: Opus 5 xhigh (UI)**: la story scrive UI su editor velivolo (modifica + creazione), card flotta desktop/mobile, sheet mobile, widget Panoramica, editor pilota (messaggio profili esclusivi) e sulla primitiva `CalendarPopover`/`DateInput`, oltre a schema, migrazione, service, OpenAPI, seed ed e2e. Review: **Opus 5 xhigh adversarial**, come sempre. Un solo dev subagent. Chiave sprint-status: `19-3-tariffe-allievo-pilota-editor-velivolo`.

> ⚠️ **Baseline e ordine**: ogni `file:riga` di questo file è misurato su **`72e7e1b`** (HEAD al 2026-11-01; il codice è quello di `5ca0be6` più il fix 16.3 su `bookings.*`/`new-booking-form.tsx` e 2 righe di `registry.ts`). Il dev della 19.3 parte **DOPO i commit della 19.1 (rimozione PPR) e della 19.2 (via campi velivolo e contaore)**, che toccano **gli stessi file**: `prisma/schema.prisma` + due migrazioni, `aircraft-editor.tsx` (19.2: `IdentitySection` resta a Marche/Tipo/Modello, via `BasedSegmented`, `HourMeterSection` → readout «Ore di volo» con prop `totalMinutes`), `aircraft.service.ts`, `src/lib/schemas/aircraft.ts`, `fleet-console.tsx` (righe dello sheet), `fleet/page.tsx` (`totalMinutesById`), `fleet-card.tsx` (`FleetCardItem` perde 5 campi), `dashboard/page.tsx` (KPI PPR e mapper flotta), `flights.service.ts` (lock su `"id"`, via contaore e note), `registry.ts`, `messages/*.json`, i tre seed ed e2e (`aircraft-rates.spec.ts:50,:206,:219-220` perdono il «Contaore iniziale»). Effetto atteso: righe slittate, blocchi già semplificati. **Prima di scrivere una riga**: `git log --oneline -5` (19.1 e 19.2 committate), rieseguire i **censimenti di §3** (sono comandi, non elenchi da fidarsi) e correggere le righe di questo file dove sono slittate.
>
> **Da leggere PRIMA di scrivere una riga**: `CLAUDE.md` per intero (e2e: `getByLabel` substring, mai `Escape` dentro uno `SlideOver`, testid `-mobile`/`mobile-` e il divieto `^=`, suite solo via `scripts/e2e.sh`, unit + env eager, gates); `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` §4.0 **R-19-e**, **R-19-f**, **R-19-m**, §4.2 riga 19.3, §4.8 **AD-4**, §4.10 **A6, A7, A12, A16, A17**; `_bmad-output/implementation-artifacts/19-2-via-codice-fiscale-campi-velivolo-contaore.md` (lo stato dell'editor da cui parti); `14-8-form-velivolo-unificato.md` (il composito di creazione che qui si allinea); `16-9-un-solo-calendario-client.md` §AD-1 e caso 3 (idioma `todayDateOnlyInZone(APP_TIMEZONE)` lato client, idratazione). Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`).

---

## ❓ Domande PO aperte (da ratificare PRIMA del dispatch — la sessione principale registra qui l'esito)

**Q-19.3-a — Quale prezzo mostrano le superfici che oggi mostrano «la» tariffa?** Oggi un solo valore (il wet) compare in 4 punti: card della Flotta desktop (`fleet-card.tsx:94-97`, riga «Tariffa»), **la stessa card nel widget Panoramica** (`FleetCardGrid` è condiviso, `dashboard/page.tsx:451`), card mobile (`fleet-console.tsx:259-262`) e sheet mobile (`fleet-console.tsx:364`). Dopo la story i prezzi sono due.

| Opzione | Cosa | Pro | Contro |
|---|---|---|---|
| **A (raccomandata)** | Entrambi, su due righe etichettate («Allievo 125,00 €/h» / «Pilota 132,00 €/h») in tutti e 4 i punti | nessuna ambiguità; una sola regola per tutte le superfici | le card crescono di una riga (desktop, widget e mobile: da verificare a 375) |
| B | Solo il prezzo pilota («Tariffa pilota»); il prezzo allievo solo nell'editor | card invariate in altezza | chi gestisce la scuola non vede il prezzo allievo senza aprire l'editor |
| C | Entrambi in una riga «Allievo · Pilota» → «125,00 · 132,00 €/h» | card invariate in altezza | quale numero è quale lo dice solo l'ordine dell'etichetta |

> **DECISIONE PO (2026-11-01)**: **NESSUN PREZZO** (opzione nuova, «D») — card Flotta desktop, widget Panoramica, card e sheet mobile **non mostrano più la tariffa**: si vede solo nell'editor velivolo. AC 27 si riscrive così: via la riga «Tariffa» da `fleet-card.tsx` e dallo sheet/card mobile di `fleet-console.tsx`, via `wetRateCents`/`rateLabel` dai mapper (`fleet/page.tsx`, `dashboard/page.tsx`) e dalle props, via le chiavi i18n relative; nessun overflow a 375; AD-8 e le chiavi [Q-a] di §3.8 decadono. — AC 27 e le chiavi di §3.8 marcate [Q-a] seguono la scelta.

**Q-19.3-b — Correggere un volo già registrato: categoria di prezzo congelata o profilo attuale?** R-19-e fissa la regola per la **registrazione**. Caso non coperto: un allievo vola a prezzo allievo; poi prende la licenza (profilo allievo disattivato, pilota attivato); poi l'admin corregge un suo volo vecchio (es. un orario sbagliato). Con la regola «profilo attuale» la correzione **ri-prezza il volo a prezzo pilota** (alla tariffa storica del giorno del volo, ma nella colonna pilota).

| Opzione | Cosa |
|---|---|
| **A (raccomandata)** | Se la correzione **non cambia la persona**, resta la categoria congelata sul volo originale; se cambia la persona, vale il profilo attuale della nuova persona. Stesso principio «correggere non è registrare di nuovo» già ratificato per il tipo volo (R-14.3-a) e per le scadenze (R-14.4-b). Vale anche per la modifica in place che la 19.6 introdurrà. |
| B | Sempre il profilo attuale della persona (regola unica, più semplice; il caso sopra ri-prezza il volo). |

> **DECISIONE (2026-11-01, sessione principale — principio AD-4 «niente ricalcoli retroattivi», già ratificato per tipo volo R-14.3-a e scadenze R-14.4-b)**: **A** — se la correzione/modifica non cambia la persona resta la categoria congelata; se cambia la persona vale il profilo attuale della nuova persona. AC 11 invariato. — AC 11 segue la scelta (con B l'AC 11 si riduce a «la correzione ricalcola dal profilo attuale», e `OriginalFlightIdentity` non guadagna il campo).

**Q-19.3-c — Istruttore + allievo sulla stessa persona: ammesso?** R-19-e rende esclusivi pilota e allievo («un allievo non ha licenza») e dice che l'istruttore resta combinabile **col pilota**. Non dice nulla di istruttore + allievo (es. un istruttore VDS che fa il corso per un'altra abilitazione).

| Opzione | Cosa |
|---|---|
| **A (raccomandata)** | Ammesso: nessuna regola oltre a quella ratificata. Il prezzo del volo dipende solo da pilota/allievo, quindi la combinazione non crea ambiguità di prezzo (un istruttore+allievo vola a prezzo allievo). |
| B | Vietato: il profilo allievo esclude sia il pilota sia l'istruttore (stesso 422). |

> **DECISIONE PO (2026-11-01)**: **B — VIETATO**: il profilo allievo esclude sia il pilota sia l'istruttore («un istruttore ha la licenza, quindi non può essere allievo»). Stesso codice 422 per le quattro direzioni (pilota↔allievo, istruttore↔allievo); AC 13-15 si estendono alle due direzioni istruttore↔allievo; migrazione/seed: chi ha istruttore+allievo attivi perde l'allievo (come per pilota+allievo). Il nome del codice va reso generico (es. `STUDENT_PROFILE_EXCLUSIVE`) invece di `PILOT_STUDENT_PROFILES_EXCLUSIVE`, e così l'helper (`assertStudentProfileExclusive`). — AC 13-15 seguono la scelta (con B si aggiungono le due direzioni istruttore↔allievo allo stesso codice).

**Q-19.3-d — Una tariffa programmata (decorrenza futura) si vede nell'editor?** R-19-f: placeholder = tariffa **attuale**, «nessuno storico visibile», e «una tariffa con data ≥ oggi si può riscrivere». Ma se l'admin salva un aumento dal 1° dicembre e riapre l'editor, vede ancora il prezzo di oggi e **nessun segno** del cambio in arrivo: per riscriverlo deve ricordarsi la data a memoria.

| Opzione | Cosa |
|---|---|
| A | Nessuna indicazione (lettera di R-19-f). |
| **B (raccomandata)** | Una sola riga sotto i campi, solo se esiste: «Variazione programmata dal 01/12/2026: allievo 130,00 €/h · pilota 138,00 €/h» (la **prossima** riga con `validFrom > oggi`). Nessuna lista, nessuno storico. |

> **DECISIONE PO (2026-11-01)**: **B — una riga sotto i campi** con la sola prossima variazione programmata. Vale anche per la tariffa istruttore della 19.4 (Q-19.4-b = A). AC 25 resta. — AC 25 esiste solo con B.

**Scelte prese su delega** (non assunzioni di dominio nuove, ognuna ricondotta a una ratifica o a un vincolo tecnico; la sessione principale può riaprirle col PO senza toccare il resto): §0.3 D-1..D-9.

---

## Story

As **l'amministratore dell'aviosuperficie**,

I want che ogni velivolo abbia un **prezzo allievo** e un **prezzo pilota**, che il volo prenda quello del **profilo** di chi vola e lo tenga congelato, che i profili pilota e allievo non possano coesistere, che una nuova tariffa (velivolo o istruttore) **parta da oggi o dopo** e si possa riscrivere finché non è passata, e che l'editor del velivolo abbia **un solo Salva** per anagrafica e tariffe,

so that il prezzo giusto si applichi da solo (punti PO 6 e 7), nessuno possa riscrivere il passato già fatturato, e il form chieda una sola conferma (punto PO 14, R-19-m).

### Il perché

Oggi `AircraftRate` ha un prezzo fatturato (`priceCentsPerHour`, il «wet») e uno solo informativo (`dryHourlyRateCents`): il PO vuole invece due prezzi fatturati, scelti da chi vola (R-19-e). Le tariffe sono append-only con decorrenza libera, anche nel passato: dopo la story la decorrenza minima è **oggi** (data di Roma, A16) e una riga non ancora passata si riscrive invece di dare 409 (R-19-f). L'editor velivolo ha oggi una sezione «Tariffe» con un proprio form, un proprio submit, la tariffa attuale «(wet)»/«(dry)» e lo storico: diventa due campi dentro il form dell'anagrafica, salvati insieme da **un endpoint composito atomico** (A17, `PATCH /aircraft/{id}`).

### Fatti misurati che vincolano il design (su `72e7e1b`)

| Fatto | Misura | Conseguenza |
|---|---|---|
| Il prezzo fatturato è uno solo | `flights.service.ts:892-895` `getEffectiveRate` → `:919` `aircraftRateCentsPerHour: aircraftRate.priceCentsPerHour`; il core `:1157` `round(rate × minutes / 60)` | la scelta del prezzo si fa in **un punto** (`resolveFlightInput`), il core resta invariato |
| Il profilo è già letto nel punto giusto | `:662-663` `hasActivePilot`/`hasActiveStudent`, `:732` `PERSON_NOT_PILOT_OR_STUDENT`, `:753` `STUDENT_FLIGHT_MUST_BE_SCHOOL` tratta «entrambi attivi» come pilota | categoria = `hasActivePilot ? PILOT : STUDENT` (D-5); nessuna query nuova |
| Le tariffe si leggono FUORI dalla transazione «perché append-only» | `flights.service.ts:890-891` e doc `:570-573` | con la riscrittura il commento diventa falso; la lettura fuori transazione resta corretta (AD-4) ma va motivata di nuovo |
| Nessun controllo sulla data | `rates.service.ts:145-187`, `instructor-rates.service.ts:115-155`: `validFrom` libero, 409 sulla stessa data (`assertRateAvailable` `:94`/`:92`) | validazione nuova + upsert al posto del 409 |
| Il 409 «stessa data» ha una UI | `aircraft-editor.tsx:1220` (`conflictRate`), pannello istruttore (19.4) | sull'editor velivolo sparisce col `RatesSection`; sul pannello istruttore diventa irraggiungibile (lo rifà la 19.4) |
| Il placeholder ha già una fonte server | `fleet/page.tsx:72` `getEffectiveRates(actor, ids, today)` → `:103` `wetRateCents`; l'editor riceve `target.aircraft` | il placeholder viene da lì (D-6): l'editor smette di chiamare `GET /aircraft/{id}/rates` |
| Quella fonte usa la data **UTC** | `fleet/page.tsx:65` `todayDateOnlyUtc()` (TD 16.9) | placeholder e «minimo oggi» devono parlare dello stesso giorno → la riga diventa Roma qui (D-8) |
| `CalendarPopover` non sa disabilitare giorni | `calendar-popover.tsx:128-143` ogni cella è un `<button>` cliccabile; `date-input.tsx:119` passa `min` solo all'`<input>` nativo; **nessun** `DateInput` usa `min`/`max` oggi (grep) | prop nuova opzionale, render invariato per i consumer che non la passano (`datetime-input.tsx`, `schedule.tsx`) |
| Il blast radius e2e è sulle **date passate** | **27** creazioni di tariffa via API con `validFrom` 2020/2026-01 in **20** spec (§3.6), voli datati 2020-01-01 e simili | dopo la story quelle POST rispondono 422 e i voli passati non troverebbero tariffa → fixture SQL (D-7), la trappola principale |
| Profili pilota+allievo sulla stessa persona nei dati | seed: `seed-demo.ts` 0 persone (verificato sull'array `DEMO_PEOPLE`), `seed-load.ts` insiemi disgiunti per costruzione (`:280-287`), `seed.ts` 3 persone distinte; e2e: **1** fixture, `my-account.spec.ts:236` | A7 è già soddisfatta dai seed: si verifica con una query; si riscrive 1 fixture |
| Nessuna fonte di accesso al DB negli e2e | 0 import di `pg`/Prisma in `e2e/`; `playwright.config.ts:1` carica `.env`; `ci.yml:73` esporta `DATABASE_URL` al job e2e; `pg` 8.22.0 e `@types/pg` già in `package.json` | un helper SQL di test non richiede dipendenze né env nuove |
| i18n | **1 989** chiavi per file al HEAD, parità 0/0 (19.1 e 19.2 la cambiano) | delta di questa story in §3.8, parità da rimisurare |

---

## §0 — Requisiti fissi e ratifiche

### §0.1 Contratto (CR approvata, §4.2 riga 19.3)

| # | Requisito |
|---|---|
| **P1** | `AircraftRate`: `studentPriceCents` + `pilotPriceCents` al posto di `priceCentsPerHour` e `dryHourlyRateCents` (migrazione: wet → entrambi, dry scartato — A6). |
| **P2** | Prezzo applicato = quello del profilo della persona (allievo → allievo, pilota → pilota anche su un volo Scuola), **congelato sul volo con la categoria applicata** (AD-4). |
| **P3** | Profili pilota e allievo mutuamente esclusivi: 422 con codice dedicato su API profili e `createPerson`; seed riallineati (A7). Istruttore combinabile col pilota. |
| **P4** | Tariffe velivolo **e** istruttore: `validFrom ≥ oggi` (Europe/Rome, A16) lato API; una riga con `validFrom ≥ oggi` si riscrive. |
| **P5** | Editor velivolo: due campi prezzo con placeholder = tariffa attuale, campo vuoto = invariata, «In vigore da» predefinito oggi e minimo oggi; niente storico né diciture wet/dry; identità + tariffe in **un solo Salva** via endpoint composito **atomico** (A17); Fuori servizio/Rientro/Archivia restano azioni (R-19-m). |

### §0.2 Ratifiche vincolanti

| R | Effetto qui |
|---|---|
| **R-19-e** | AC 9-10; P3 → AC 13-16. |
| **R-19-f** | AC 4-8 (velivolo e istruttore), AC 19-21 (UI velivolo). La UI della tariffa istruttore è della **19.4**. |
| **R-19-m** | AC 18, 23. |
| **A6** | AC 3 (migrazione). Nei seed, D-9. |
| **A7** | AC 16. |
| **A12** | Conseguenza accettata, nessun codice: un istruttore senza tariffa prima di oggi non registra voli datati prima della sua prima tariffa (`NO_INSTRUCTOR_RATE`, invariato). Idem per un velivolo nuovo (`NO_AIRCRAFT_RATE`). |
| **A16** | Ogni «oggi» nuovo è Roma: server `todayDateOnlyUtcInZone(APP_TIMEZONE)` (come `flights.service.ts:784`), client `todayDateOnlyInZone(APP_TIMEZONE)` (idioma 16.9 AD-1). |
| **A17** | AD-3: una `$transaction`, mai N richieste orchestrate dal client (il precedente `club-card.tsx:90-116` NON va replicato). |

**Ratifiche/AC storici SUPERATI** (da non «ripristinare»): story 4.1 AC 2 e 4.2 AC 2 (409 sulla stessa `validFrom` → ora riscrittura); il carattere «append-only, nessuna API di update» di `AircraftRate`/`InstructorRate` (`schema.prisma:340-352`, `:375-391`); story 12.5 AC 1 limitatamente al prezzo «dry»; story 13.4 AC 2 (storico tariffe «ultime 5 + mostra tutte»); story 14.8 AC 1-2 limitatamente alla forma del blocco tariffe (il composito resta); R-15.10-f per l'editor velivolo (le sezioni non hanno più submit propri).

### §0.3 Scelte prese su delega

| ID | Scelta | Riconducibile a | Alternativa scartata |
|---|---|---|---|
| **D-1** | Il contratto API chiede **entrambi** i prezzi (`studentPriceCents`, `pilotPriceCents`, `validFrom` tutti obbligatori). «Vuoto = invariata» è una regola della **UI**: il client riempie il campo vuoto col valore del placeholder (= tariffa in vigore **oggi**: ciò che vedi è ciò che salvi). | R-19-f parla del campo e del suo placeholder | il server riempie i mancanti: più codice server, e con una tariffa programmata in mezzo il «valore invariato» diventerebbe ambiguo (quello di oggi o quello in vigore alla nuova decorrenza?) |
| **D-2** | `GET /aircraft/{id}/rates` e `GET /people/{id}/instructor-rates` **restano** nell'API (contratto aggiornato ai due prezzi per il velivolo); l'editor velivolo **smette** di chiamarle. Resta anche `POST /aircraft/{id}/rates` (stessa semantica nuova: decorrenza ≥ oggi, riscrittura, 201). | API-first (futura app Flutter, CLAUDE.md); AD-4 emendato: «lo storico resta nel DB ma non è mostrato in UI»; è l'unico modo per un client API di vedere una tariffa programmata o verificare una riscrittura; il pannello istruttore le usa fino alla 19.4 | cancellarle: rottura di contratto non richiesta dalla CR |
| **D-3** | Una decorrenza passata è un **422 `RATE_VALID_FROM_IN_PAST`**, verificato nel service (un solo helper condiviso dai due service), prima di ogni scrittura. | precedente `FLIGHT_DATE_IN_FUTURE` (service, codice dedicato) | refine Zod: codice generico `VALIDATION_ERROR` e «oggi» valutato nel parser |
| **D-4** | Nella migrazione, chi ha **pilota e allievo entrambi attivi** perde l'allievo (`StudentProfile.deactivatedAt = now()`). | il codice vivo tratta già «entrambi attivi» come pilota (`flights.service.ts:740-753`: «a student who ALSO holds an active pilot profile — took the license — is unrestricted»); DB di test (R-19-a) | lasciare righe incoerenti: l'invariante varrebbe solo per i dati nuovi |
| **D-5** | `Flight.aircraftPriceCategory` (enum `AircraftPriceCategory { STUDENT PILOT }`, NOT NULL) è la «categoria applicata» di AD-4; esposta nel DTO (`breakdown.aircraftPriceCategory`) e nell'OpenAPI, **nessuna UI nuova**. Backfill dei voli esistenti dal profilo attuale (allievo-solo → STUDENT, altrimenti PILOT), dopo la normalizzazione di D-4. | AD-4 (§4.8 CR: «congelato sul volo con la categoria applicata») | non salvarla: il prezzo congelato non direbbe più da quale colonna viene (e Q-b=A non sarebbe implementabile) |
| **D-6** | Il placeholder arriva dal server (`getEffectiveRates` della pagina Flotta, già batch) dentro l'item; dopo un Salva il pannello **resta aperto** (comportamento attuale della modifica) e aggiorna il placeholder in locale: se la tariffa salvata ha `validFrom === oggi` diventa l'attuale, altrimenti l'attuale non cambia. La regola è **esatta**: ogni scrittura ha `validFrom ≥ oggi`, quindi solo una riga di oggi può diventare «la riga con il massimo `validFrom ≤ oggi`». | R-19-f; superficie minima | rileggere lo storico via `GET`: la UI tornerebbe a dipendere dallo storico che R-19-f toglie |
| **D-7** | Gli e2e che hanno bisogno di una tariffa **nel passato** (voli datati nel passato) la scrivono con un helper SQL di test, `e2e/db-fixtures.ts` (via `pg`, stesso `DATABASE_URL`); il percorso API si prova solo con date ≥ oggi. | la regola ratificata rende impossibile via API ciò che quei test devono preparare; un seed fa già esattamente questo (`seed-demo.ts:399-406`) | spostare a «oggi» i voli di 20 spec: cambia il significato di test costruiti su date precise (bordi di fuso, mesi, scadenze); un flag di bypass nell'app: una porta di servizio in produzione |
| **D-8** | `fleet/page.tsx:65` passa a `todayDateOnlyUtcInZone(APP_TIMEZONE)` (una riga). Assorbe la metà «Flotta» dell'AC 9 della 16.9 (editor + pagina nello stesso commit, la coerenza che quella story chiede). `dashboard/page.tsx:295` resta alla 16.9. | A16; 16.9 caso 3 | lasciarla UTC: fra le 00:00 e le 02:00 di Roma il placeholder parlerebbe del giorno prima mentre il «minimo» parla di oggi |
| **D-9** | Seed: `seed-demo.ts` dà prezzi **diversi** (allievo = pilota − 7,00 €/h, numeri in AC 29) perché il PO valuta l'app sui dati demo; `seed-load.ts` (misura, mai guardato) usa lo stesso valore per entrambi (A6 alla lettera). | A7 («seed riallineati»); nessuna regola di prezzo inventata: sono dati demo | prezzi uguali anche in demo: la funzione non si vedrebbe |

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — UNA migrazione forward, scritta a mano, dopo quelle di 19.1 e 19.2

`prisma/migrations/<timestamp>_aircraft_rate_student_pilot_prices/migration.sql`, timestamp **successivo** alle migrazioni di 19.1 e 19.2. Va scritta a mano (pattern TD-2, commento in testa con story e ratifiche R-19-e/A6/D-4/D-5): `migrate dev` genererebbe un DROP+ADD che perde i prezzi. Forma attesa:

```sql
-- 1. AircraftRate (A6): the wet price becomes both prices, the dry one is dropped.
ALTER TABLE "AircraftRate" RENAME COLUMN "priceCentsPerHour" TO "pilotPriceCents";
ALTER TABLE "AircraftRate" ADD COLUMN "studentPriceCents" INTEGER;
UPDATE "AircraftRate" SET "studentPriceCents" = "pilotPriceCents";
ALTER TABLE "AircraftRate" ALTER COLUMN "studentPriceCents" SET NOT NULL, DROP COLUMN "dryHourlyRateCents";
-- 2. Exclusive profiles (D-4): pilot wins, BEFORE the flight backfill below reads profiles.
UPDATE "StudentProfile" s SET "deactivatedAt" = now()
 WHERE s."deactivatedAt" IS NULL
   AND EXISTS (SELECT 1 FROM "PilotProfile" p WHERE p."personId" = s."personId" AND p."deactivatedAt" IS NULL);
-- 3. Flight price category (D-5).
CREATE TYPE "AircraftPriceCategory" AS ENUM ('STUDENT', 'PILOT');
ALTER TABLE "Flight" ADD COLUMN "aircraftPriceCategory" "AircraftPriceCategory";
UPDATE "Flight" f SET "aircraftPriceCategory" = CASE
  WHEN EXISTS (SELECT 1 FROM "StudentProfile" s WHERE s."personId" = f."personId" AND s."deactivatedAt" IS NULL)
   AND NOT EXISTS (SELECT 1 FROM "PilotProfile" p WHERE p."personId" = f."personId" AND p."deactivatedAt" IS NULL)
  THEN 'STUDENT'::"AircraftPriceCategory" ELSE 'PILOT'::"AircraftPriceCategory" END;
ALTER TABLE "Flight" ALTER COLUMN "aircraftPriceCategory" SET NOT NULL;
```

Verifica obbligatoria su un **DB gemello** (precedenti 14.9 `am_rev149`, 19.2 AD-1), mai su `airmanager` con un arbitro vivo: catena `migrate deploy` da zero → `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --shadow-database-url <gemello> --script` = vuoto; `\d "AircraftRate"`, `\d "Flight"`, `\dT "AircraftPriceCategory"`; poi `npx prisma generate`. Prova del backfill: sul gemello, PRIMA della migrazione, inserire una tariffa wet 15000 + dry 12000, una persona con pilota+allievo attivi e un volo di un allievo-solo; DOPO: `(15000, 15000)`, allievo disattivato, volo `STUDENT`. **`airmanager_load` NON si tocca** (DB di misura dell'epic 17).

### AD-2 — Due core di scrittura, gli unici writer delle tariffe

- `rates.service.ts`: `createAircraftRateCore` (`:114-129`) diventa **`upsertAircraftRateCore(tx, aircraftId, input, actorUserId)`**: `tx.aircraftRate.upsert({ where: { aircraftId_validFrom }, create: {...}, update: { studentPriceCents, pilotPriceCents, actorUserId } })`. `createdAt` resta quello della prima scrittura. Chiamato da `createAircraftRate` (`POST /rates`), `createAircraft` (composito di creazione) e `updateAircraft` (composito di modifica).
- `instructor-rates.service.ts`: nuovo **`upsertInstructorRateCore(tx, instructorProfileId, input, actorUserId)`**, chiamato da `createInstructorRate` ed **esportato per la 19.4** (il suo composito persona lo chiamerà dentro la propria transazione: contratto di questa story verso la 19.4).
- Via `assertRateAvailable` (`rates.service.ts:94-102`, `instructor-rates.service.ts:92-101`) e i due `try/catch` P2002 → `ConflictError` «already exists» (`:179-184` e twin): la stessa data non è più un conflitto.
- **Upsert nativo**: Prisma emette `INSERT … ON CONFLICT DO UPDATE` solo se l'upsert non ha letture annidate. Il `select` con `actorUser: { select: { email } }` (`RATE_SELECT`) **lo disabilita** e Prisma ripiega su leggi-poi-scrivi (un doppione concorrente darebbe P2002 → 500). Quindi: upsert piatto (`select: { id: true }`), poi la lettura con `RATE_SELECT` per la response. Nel Dev Agent Record: la SQL emessa (log query Prisma) con `ON CONFLICT`. Se non fosse nativo: catch P2002 → un retry come update. Mai un 500.
- **Decorrenza (D-3)**: un solo helper esportato da `rates.service.ts`, `assertRateValidFromNotPast(validFrom: string): void` → `parseDateOnlyUtc(validFrom).getTime() < todayDateOnlyUtcInZone(APP_TIMEZONE).getTime()` ⇒ `ValidationError('validFrom cannot be in the past.', undefined, 'RATE_VALID_FROM_IN_PAST')`. Usato dai quattro percorsi di scrittura (`POST /aircraft/{id}/rates`, `POST /aircraft`, `PATCH /aircraft/{id}`, `POST /people/{id}/instructor-rates`) **prima** di ogni scrittura e prima della transazione.

### AD-3 — `PATCH /aircraft/{id}` composito atomico (A17)

`updateAircraftSchema` (`aircraft.ts:73-81`) guadagna `rate: createAircraftRateSchema.optional()`, lo stesso blocco del composito di creazione. `updateAircraft` (`aircraft.service.ts:328-360`):

1. `authorize(actor, 'aircraft.manage')`; se `rate`: `authorize(actor, 'settings.manage')` (stesso split di `createAircraft:273-281`, stesso commento sul ramo oggi irraggiungibile);
2. esistenza → 404;
3. se `rate`: velivolo archiviato → 409 (`'Cannot add a rate to an archived aircraft.'`, come `createAircraftRate:156-158`); `assertRateValidFromNotPast` → 422;
4. pre-check marche → 409 (invariato);
5. senza `rate`: **invariato** (un solo `prisma.aircraft.update`, fuori transazione); con `rate`: `prisma.$transaction(async (tx) => { tx.aircraft.update(...); upsertAircraftRateCore(tx, ...) })` — P2002 sulle marche → 409 come oggi.

La response resta `AircraftListItem` (contratto invariato: nessun campo tariffa nel DTO velivolo, stessa deviazione documentata in `exports.service.ts:182-187`).

### AD-4 — Prezzo dal profilo, congelato con la categoria

In `resolveFlightInput` (`flights.service.ts:612`), dopo la lettura della tariffa (`:892-895`):

```ts
const aircraftPriceCategory: AircraftPriceCategory = hasActivePilot ? 'PILOT' : 'STUDENT'; // [Q-b] vedi sotto
const aircraftRateCentsPerHour = aircraftPriceCategory === 'PILOT' ? aircraftRate.pilotPriceCents : aircraftRate.studentPriceCents;
```

`ResolvedFlightInput` (`:362-380`) e `RegisterFlightCoreInput` (`:~1078-1112`) guadagnano `aircraftPriceCategory`; `registerFlightCore` lo scrive su `Flight.create` (`:1160-1188`) accanto a `aircraftRateCentsPerHour` (il nome della colonna snapshot non cambia: è il prezzo applicato). `FLIGHT_SELECT`/`SelectedFlight`/`toListItem`/`FlightBreakdown` (`:128-137`, `:215`, `:253`, `:311-320`) lo portano in `breakdown.aircraftPriceCategory`. «Entrambi attivi» (dati legacy) → PILOT, coerente con D-4.

**[Q-b = A]** `OriginalFlightIdentity` (`:360`) guadagna `aircraftPriceCategory`; `loadRegisteredFlightForReversal` lo seleziona; `correctFlight` (`:1621-1626`) lo passa; in `resolveFlightInput`: `original && original.personId === input.personId ? original.aircraftPriceCategory : (hasActivePilot ? 'PILOT' : 'STUDENT')`. La tariffa resta quella in vigore a `flightDate` (invariato).

**Lettura fuori transazione**: resta. Con la riscrittura, l'unica riga che può cambiare sotto un volo è quella con `validFrom === oggi` (le altre sono passate, o future e quindi irrilevanti per un volo ≤ oggi): un volo di oggi registrato mentre l'admin riscrive la tariffa di oggi prende l'uno o l'altro prezzo, entrambi legittimi in quell'istante, e lo congela. Riscrivere i doc-comment che dicono «append-only, no meaningful race»: `flights.service.ts:29-31`, `:570-573`, `:890-891`, `:1232`.

### AD-5 — Profili esclusivi, serializzati sul `Person`

- **Un solo punto di controllo, sullo stato finale**: nuovo helper esportato `assertPilotStudentExclusive(tx, personId)` in `people.service.ts`: legge `PilotProfile` e `StudentProfile` della persona **dentro `tx`** e, se entrambi hanno `deactivatedAt === null`, lancia `ValidationError('Pilot and student profiles are mutually exclusive.', undefined, 'PILOT_STUDENT_PROFILES_EXCLUSIVE')`. Si chiama **dopo** le scritture dei profili della stessa transazione, così il rollback annulla tutto (profilo e `Account`). È il contratto verso la **19.4**: il suo composito persona lo chiamerà una volta, dopo disattivazioni e attivazioni dello stesso Salva («disattiva Allievo + attiva Pilota» passa, «attiva Pilota» con Allievo attivo no). I core `upsert*ProfileCore` restano invariati.
- `upsertProfile` (`people.service.ts:695-720`), rami `pilot` e `student`: dentro la transazione (già c'è, `:711`/`:716`), **primo statement** `SELECT "id" FROM "Person" WHERE "id" = ${personId} FOR NO KEY UPDATE` (sostituisce il `findUnique` di `:702-705` come controllo di esistenza: 0 righe → 404), poi il core di oggi, poi `assertPilotStudentExclusive(tx, personId)`. Ramo `instructor`: invariato **[Q-c = A]** (con Q-c = B l'helper controlla anche istruttore↔allievo).
- `FOR NO KEY UPDATE` e non `FOR UPDATE`: stessa scelta e stessa motivazione di `bookings.service.ts:334-347` (non blocca le FK check di chi inserisce righe che puntano alla persona). Ordine dei lock: questa transazione prende `Person` → (profilo) → `Account` (upsert). Verificare con `grep -rn "FOR UPDATE\|FOR NO KEY UPDATE" src/server` che nessuna transazione prenda `Account` e poi `Person` (su `72e7e1b`: le prenotazioni prendono `Booking → Aircraft → Person → InstructorProfile`, il registro voli `Aircraft → Account`, nessuna `Account → Person`). Riportare il censimento nel record.
- `createPerson` (`:468`): subito dopo gli `authorize`, prima di ogni query, `input.profiles?.pilot && input.profiles?.student` → stesso 422 (persona nuova: nessuna concorrenza da serializzare, e il body da solo basta a decidere — non serve l'helper).
- `deactivateProfile`: invariato (disattivare non può violare l'esclusività).

### AD-6 — Editor velivolo: un solo form, un solo Salva

`IdentitySection` contiene **in entrambi i modi** il blocco «Tariffe» dentro `<form id="identity-form">`; il Salva resta il bottone `identity-submit` di `.so-foot` (`aircraft-editor.tsx:302-313`, testid invariati). Via dal file: `RatesSection` (`:1115-1313`) con `newRateFormSchema`, `HISTORY_VISIBLE_COUNT`, `fetchRatesHistory`, `currentRateOf` (`:270-274`), il suo `<Section>` in `:343-353`, `todayDateOnly` (`:238-241`, orfano dopo la story — v. 16.9) e gli import resi inutili (`formatDateOnly`, `AircraftRateItemDto`, `z` se restano senza uso). Lo stato a campi semplici del blocco di creazione (`:426-443`, 14.8) diventa il blocco unico:

| Stato | Regola |
|---|---|
| `studentPrice`, `pilotPrice` (stringhe) | placeholder = prezzo attuale formattato come valore digitabile (`132,00`, senza simbolo) se c'è una tariffa in vigore oggi, altrimenti `0,00` |
| `validFrom` | predefinito `todayDateOnlyInZone(APP_TIMEZONE)`; `min` = lo stesso valore sul `DateInput` |
| tariffa «toccata» | almeno un prezzo compilato. Entrambi vuoti → **nessun** blocco `rate` nel body (la data da sola non scrive nulla) |
| campo vuoto con tariffa attuale | vale il prezzo attuale (D-1) |
| campo vuoto senza tariffa attuale (creazione, o velivolo senza tariffa in vigore) | obbligatorio |
| errori client | prezzo non valido → `invalidPrice`; data mancante → `required`; forma non ISO → `invalidDate` (review 14.8 F2, invariato); `validFrom < oggi` (confronto fra stringhe ISO) → **`validFromPast`**. Nessuna richiesta parte con un errore |
| 422 server | `RATE_VALID_FROM_IN_PAST` → errore sul campo «In vigore da» (la mezzanotte fra render e invio) |

`EditableAircraft` (`:188`) smette di omettere la tariffa: l'editor tiene `currentRate` (e, con [Q-d = B], `scheduledRate`) in uno **stato proprio**, inizializzato dall'item e aggiornato dopo il Salva (D-6), così le azioni Disponibilità/Archivio (che ricostruiscono l'aircraft da `toEditable(response)`, senza tariffa) non lo perdono. Dopo un Salva riuscito: toast `updated`, prezzi svuotati, `validFrom` di nuovo a oggi, placeholder aggiornati. Velivolo archiviato: al posto dei tre campi la riga `readOnlyHint` (testo nuovo, §3.8) — il body non porta mai `rate`.

Testid nuovi del blocco (stessi in creazione e modifica): `aircraft-rate-student`, `aircraft-rate-pilot`, `aircraft-rate-valid-from` (al posto di `new-aircraft-rate-price`, `-price-dry`, `-valid-from`). Verificato: nessun selettore `^=` li intercetta (`grep -rn 'data-testid\^=' e2e/` → `ac-card-`, `pilot-row-`, `mobile-*-card-`, nessun `aircraft-rate`). Rieseguire il grep.

### AD-7 — `CalendarPopover` rispetta un minimo (primitiva condivisa con la 19.4)

- `CalendarPopoverProps` guadagna `minDate?: Date` (data «widget» a costruttore locale, la stessa convenzione di `cursor`/`today`, `date-input.tsx:58-61`). Una cella con giorno `< minDate` si rende `disabled` (non cliccabile, fuori dall'ordine di tabulazione); il bottone «Oggi» è `disabled` se `today < minDate`. Stile: una regola `.cal-cell:disabled` in `airops.css` vicino a `.cal-cell` (`:1350-1378`) con i token esistenti, distinguibile sia da una cella abilitata sia da `.out`, senza hover. Prop omessa → render byte-identico (`datetime-input.tsx`, i due popover di `schedule.tsx` non cambiano).
- `DateInput` legge `inputProps.min` (stringa `YYYY-MM-DD`, già passata all'`<input>` nativo) e la passa come `minDate` (`dateOnlyToLocalDate`). Nessuna prop nuova su `DateInput`.
- Il `min` nativo non impedisce di **digitare** una data precedente (i form sono `noValidate`): la validazione client di AD-6 resta necessaria, e il 422 server resta l'ultima linea.
- Il «today» del widget resta browser-local (residuo dichiarato dalla 16.9, TD 16.9-a): per un browser in Italia coincide con Roma.

### AD-8 — Dove si mostra la tariffa [Q-a = A]

`FleetCardItem.wetRateCents` (`fleet-card.tsx:34-35`) → `currentRate: { studentPriceCents: number; pilotPriceCents: number } | null`. Mapper: `fleet/page.tsx:103`, `dashboard/page.tsx:451`. Rese:

| Superficie | Oggi | Dopo |
|---|---|---|
| Card desktop + widget Panoramica (`FleetCardGrid`, `fleet-card.tsx:94-97`) | una `meter-row` «Tariffa» | due `meter-row`: «Allievo» / «Pilota», `—` se `currentRate === null` |
| Card mobile (`fleet-console.tsx:259-262`) | uno `.mobile-ac-meter` «Tariffa» | due `.mobile-ac-meter`, stesse etichette; verificare a 375 nessun overflow della griglia a due colonne |
| Sheet mobile (`fleet-console.tsx:364`) | riga «Tariffa» | righe «Tariffa allievo», «Tariffa pilota» nella stessa posizione |

`FleetCardGridProps.rateLabel` → `rateLabels: { student: string; pilot: string }`; stesso per `FleetCardLabels`/`FleetConsoleLabels`. Con [Q-a = B] o C cambiano solo queste tre righe e le chiavi di §3.8.

---

## §2 — Acceptance Criteria

### A — Modello e migrazione

1. **`AircraftRate`** (`schema.prisma:340-373`): `studentPriceCents Int`, `pilotPriceCents Int`; via `priceCentsPerHour` e `dryHourlyRateCents`; `@@unique([aircraftId, validFrom])` e `@@index([aircraftId])` restano. Doc-comment riscritto: due prezzi fatturati scelti dal profilo, `validFrom ≥ oggi` (Roma) per le scritture, riga con `validFrom ≥ oggi` riscrivibile, storico nel DB e non in UI (AD-4 emendato). Doc-comment di **`InstructorRate`** (`:375-391`) riscritto allo stesso modo (colonne invariate).
2. **`Flight`**: enum `AircraftPriceCategory { STUDENT PILOT }` e colonna `aircraftPriceCategory` NOT NULL accanto a `aircraftRateCentsPerHour` (`:1035`); il paragrafo «Snapshot, never recalculated» del doc-comment (`:925-933`) nomina la categoria.
3. **Migrazione** (AD-1): una sola, forward, dopo quelle di 19.1/19.2; catena da zero verde su DB gemello; `migrate diff` vuoto; prova del backfill (wet → entrambi, dry scartato; pilota+allievo → allievo disattivato; categoria dei voli) riportata nel record con l'output psql.

### B — Decorrenza e riscrittura (velivolo e istruttore)

4. **Decorrenza passata = 422** `RATE_VALID_FROM_IN_PAST` su `POST /api/v1/aircraft/{id}/rates`, `POST /api/v1/aircraft` (blocco `rate`), `PATCH /api/v1/aircraft/{id}` (blocco `rate`), `POST /api/v1/people/{id}/instructor-rates`, prima di ogni scrittura (unit: nessun `upsert`/`create`/`$transaction` chiamato). **Unit discriminante del fuso** (orologio finto, `vi.useFakeTimers()` + ripristino): a `2026-11-01T23:30:00Z` (= 00:30 del 2 novembre a Roma) `validFrom: '2026-11-01'` → 422, `'2026-11-02'` → accettato; stesso caso per il twin istruttore. `validFrom` uguale a oggi → accettato.
5. **Riscrittura**: una seconda scrittura con la stessa `(soggetto, validFrom)` aggiorna i prezzi (e `actorUserId`) della riga esistente e risponde **201** con la riga aggiornata — mai 409, mai una seconda riga. Velivolo e istruttore. I due core di AD-2 sono gli unici writer (`grep -rn "aircraftRate.create\|instructorRate.create" src/server` → 0, esclusi i test). Upsert nativo dimostrato (SQL emessa con `ON CONFLICT` nel record) oppure P2002 gestito: un doppione concorrente non produce mai un 500.
6. **I voli registrati non cambiano** (P2, R-19-f): e2e — un volo di oggi registrato con la tariffa di oggi a 130,00/140,00, poi la tariffa di oggi riscritta a 150,00/160,00 via API → la `breakdown` del volo già registrato è invariata; un volo nuovo di oggi prende il prezzo nuovo. (Nota: `FLIGHT_DATE_IN_FUTURE` confronta solo la data, un volo di oggi è accettato a qualunque ora.)
7. **Contratto API**: `createAircraftRateSchema` = `{ studentPriceCents, pilotPriceCents, validFrom }`, tutti obbligatori, prezzi interi `> 0` e `≤ 2_147_483_647`; un body col solo `priceCentsPerHour` → 422 `VALIDATION_ERROR`. `aircraftRateItemSchema` con i due prezzi, senza `priceCentsPerHour`/`dryHourlyRateCents`. `createInstructorRateSchema` invariato nella forma (doc-comment aggiornato: decorrenza ≥ oggi, riscrittura). OpenAPI (`registry.ts`): descrizioni di `POST /aircraft/{id}/rates` (`:1197-1210`), `POST /people/{id}/instructor-rates` (`:689-700`), `POST /aircraft` (`:1036-1047`), `PATCH /aircraft/{id}` (summary e descrizione `:1063-1073`: «registration, type, model; optional `rate` saved in the same transaction») riscritte — via «Append-only», «409 on the same validFrom», «hour meter, notes»; 422 `RATE_VALID_FROM_IN_PAST` documentato. `registry.test.ts`: `AircraftRate` ha `studentPriceCents`/`pilotPriceCents` e **non** `priceCentsPerHour`/`dryHourlyRateCents`; `UpdateAircraftRequest` ha `rate`; i path `/aircraft/{id}/rates` e `/people/{id}/instructor-rates` restano (D-2).
8. **Nessuna UI legge lo storico velivolo**: `grep -n "/rates" 'src/app/[locale]/dashboard/fleet/aircraft-editor.tsx'` → 0. Le GET restano (D-2) con la loro descrizione OpenAPI aggiornata («history kept for API clients; not shown in the UI»).

### C — Prezzo dal profilo

9. **Scelta e congelamento** (AD-4): unit — persona con profilo allievo attivo su volo Scuola → `aircraftRateCentsPerHour = studentPriceCents`, `aircraftPriceCategory = STUDENT`; pilota su Turismo → `pilotPriceCents`, `PILOT`; **pilota su volo Scuola con istruttore → prezzo pilota** (R-19-e alla lettera); entrambi attivi (legacy) → `PILOT`. Il DTO dei voli porta `breakdown.aircraftPriceCategory`; `flightBreakdownSchema` (`flights.ts:140-148`) documentato.
10. **e2e prezzo per profilo** (in `flights.spec.ts`): velivolo con tariffa (fixture SQL, D-7) allievo 100,00 / pilota 150,00 €/h; volo Scuola di 60' di un allievo → `aircraftAmountCents = 10000`, categoria `STUDENT`; volo di 60' di un pilota → `15000`, `PILOT`; volo Scuola di 60' di un pilota con istruttore → `15000`, `PILOT`.
11. **[Q-b = A] Correzione**: unit discriminante — volo di un allievo registrato `STUDENT`; la persona passa a pilota (allievo disattivato, pilota attivato); `correctFlight` sullo stesso volo con la stessa persona → nuovo volo ancora `STUDENT` a prezzo allievo della tariffa in vigore a `flightDate`; la stessa correzione che **cambia** persona verso un pilota → `PILOT`.
12. **Doc-comment** di `flights.service.ts` che parlano di tariffe «append-only, no meaningful race» (`:29-31`, `:570-573`, `:890-891`, `:1232`) riscritti con la motivazione di AD-4; la descrizione OpenAPI di `POST /flights` (`:976`, «AD-4 rate snapshot at `flightDate`») nomina il prezzo per profilo.

### D — Profili pilota e allievo esclusivi

13. **API profili**: persona con allievo attivo → `PUT /api/v1/people/{id}/profiles/pilot` → **422 `PILOT_STUDENT_PROFILES_EXCLUSIVE`** e nulla scritto (il pilota resta assente/disattivato, `GET /people/{id}` lo conferma: il rollback ha annullato anche la scrittura del core); simmetrico per `PUT …/student` con pilota attivo. Il controllo vive solo in `assertPilotStudentExclusive` (`grep -rn "PILOT_STUDENT_PROFILES_EXCLUSIVE" src/server` → l'helper e il pre-check di `createPerson`, nient'altro). Riattivare/aggiornare lo **stesso** tipo resta 200. `PUT …/instructor` mai bloccato **[Q-c = A]**. Il passaggio allievo → pilota (disattiva, poi attiva) resta 200 (`person-profiles.spec.ts:81`, invariato e verde).
14. **Concorrenza** (AD-5): unit — il primo `$queryRaw` della transazione di `upsertProfile` contiene `FROM "Person"` e `FOR NO KEY UPDATE` e precede ogni altra query della transazione; con 0 righe → 404; `assertPilotStudentExclusive` legge i profili dal `tx` (non da `prisma`) e gira dopo il core. e2e — su una persona nuova `PUT …/pilot` e `PUT …/student` in parallelo (`Promise.all`) → esattamente un 200 e un 422.
15. **`POST /api/v1/people`** con `profiles.pilot` **e** `profiles.student` → stesso 422, prima di ogni scrittura (unit: `$transaction` non chiamato; e2e: la persona non esiste dopo la risposta). OpenAPI: il 422 documentato su `POST /people` e sui due `PUT` (`registry.ts:437`, `:512-524`, `:540-552`).
16. **UI pre-19.4** (l'editor pilota attuale): attivare «Pilota» con «Allievo» attivo (e viceversa) mostra nella sezione il messaggio `PeoplePage.profilesPanel.errors.exclusive` invece del generico (`pilot-editor.tsx:984-986`, `:1104-1106`: mappatura `code === 'PILOT_STUDENT_PROFILES_EXCLUSIVE'`); il form «Nuovo» con entrambe le spunte mostra `PilotsPage.editor.errors.profilesExclusive` nel banner (`:632-633`). e2e in `person-profiles.spec.ts`. **Seed e fixture** (A7): dopo `npx prisma db seed` + `npm run seed:demo` su DB fresco, `SELECT count(*) FROM "PilotProfile" p JOIN "StudentProfile" s USING ("personId") WHERE p."deactivatedAt" IS NULL AND s."deactivatedAt" IS NULL` = **0** (output nel record); `seed-load.ts` disgiunto per costruzione (`:280-287`, verificarlo leggendo, non eseguendo); la fixture `my-account.spec.ts:236` (allievo a cui si attivava anche il pilota per un volo Turismo) riscritta senza doppio profilo — es. volo Scuola con l'istruttore seminato e tariffa istruttore via fixture SQL, con il saldo atteso ricalcolato.

### E — Editor velivolo a Salva unico

17. **Un solo form, un solo Salva** (AD-6): in modifica il pannello ha un solo `<form>` con submit (`identity-form`), che contiene identità + «Tariffe» (Prezzo allievo, Prezzo pilota, In vigore da); `identity-submit` in `.so-foot` è l'unico bottone che salva dati; Disponibilità (Fuori servizio/Rientro) e Archivio restano bottoni d'azione propri. Nessun `new-rate-form`, `new-rate-submit`, `rates-current`, `rates-current-dry`, `rate-history-row`, `rates-history-show-all` nel DOM; nessun testo «wet», «dry», «Storico tariffe» nel pannello (e2e). `mobile-a11y-sweep.spec.ts:281` resta verde (v. §5 trappola 7).
18. **Placeholder e hint**: con una tariffa in vigore oggi i due campi hanno `placeholder` = prezzo attuale (`132,00`) e hint di campo `Attuale: 132,00 €/h — lascia vuoto per non cambiarlo.` (`Field` `hint`, collegato via `aria-describedby`: il placeholder da solo non è accessibile); senza tariffa in vigore placeholder `0,00` e hint `noCurrentRate`.
19. **Semantica del Salva** (e2e, stato verificato con `GET /aircraft/{id}/rates`): (a) prezzi vuoti + modello cambiato → modello salvato, **nessuna** riga nuova; (b) solo prezzo allievo compilato, tariffa attuale 120,00/140,00 → riga di oggi `{12500, 14000}` se si scrive 125,00; (c) senza tariffa attuale, un solo prezzo → l'altro campo `aria-invalid="true"` col messaggio `required`, nessuna richiesta, nessun toast; (d) data di ieri digitata → errore `validFromPast` sul campo, nessuna richiesta; (e) stessa data due volte (130,00/150,00 poi 135,00 + pilota vuoto) → **una** riga di oggi `{13500, 15000}`.
20. **Atomicità** (AD-3): unit — con `rate` nel body `updateAircraft` esegue `aircraft.update` e l'upsert sullo **stesso** `tx` dentro un'unica `$transaction` (`prisma.aircraft.update` non chiamato fuori); se l'upsert rigetta, `updateAircraft` rigetta e nessuna scrittura avviene fuori dalla transazione; senza `rate` nessuna `$transaction` (percorso invariato); `settings.manage` verificato solo con `rate`. e2e — `PATCH` con marche nuove + `rate` con decorrenza di ieri → 422 e marche invariate; `PATCH` con `rate` su un velivolo archiviato → 409.
21. **Dopo il Salva** (D-6): pannello aperto, toast «Velivolo aggiornato.», campi prezzo vuoti, «In vigore da» di nuovo a oggi, placeholder = prezzi appena salvati se la decorrenza era oggi, invariati se futura; dopo il `router.refresh()` la card mostra i prezzi nuovi.
22. **Velivolo archiviato**: al posto dei tre campi la riga `readOnlyHint` col testo nuovo; il body del Salva non contiene mai `rate`.
23. **Creazione** (14.8, invariato nel principio): stesso blocco a due prezzi + «In vigore da» nello stesso submit composito; blocco facoltativo (velivolo senza tariffa → 201 come oggi); un solo prezzo → l'altro obbligatorio (non c'è tariffa attuale da ereditare); data passata bloccata in UI e 422 dal server; subito dopo, card e placeholder dell'editor riaperto mostrano i prezzi.
24. **Primitiva calendario** (AD-7): e2e con `test.use({ timezoneId: 'Europe/Rome' })` sul popover di «In vigore da»: ogni cella che precede la cella `.today` nel DOM è `disabled`, la cella `.today` è abilitata e un click la scrive nel campo; il popover di un `DateInput` senza `min` (es. il filtro dell'estratto conto) non ha celle disabilitate. Nessun cambiamento di render per `datetime-input.tsx` e `schedule.tsx` (prop omessa).
25. **[Q-d = B] Variazione programmata**: con una riga `validFrom > oggi`, sotto i campi compare **una** riga `aircraft-rate-scheduled` con la prossima (data più vicina) e i suoi due prezzi; nessuna riga se non esiste. Fonte server: una funzione batch in `rates.service.ts` sul modello di `getEffectiveRates` (`validFrom > onDate`, `orderBy validFrom asc`, `distinct aircraftId`), chiamata nel `Promise.all` di `fleet/page.tsx:71-75`, dato su `FleetConsoleItem` (non su `FleetCardItem`: il widget non lo usa). Dopo un Salva con decorrenza futura la riga si aggiorna in locale (la più vicina fra quella nota e quella salvata; a parità di data, la salvata).
26. **Ruolo del pannello istruttore** (19.4): `instructor-rates-panel.tsx` **non si tocca** (contratto `priceCentsPerHour`/`validFrom` invariato). Gli e2e `instructor-rates.spec.ts:76` e `:111` si adattano alla semantica nuova (date = oggi e oggi+30 calcolate su Roma; il caso «409 stessa data» diventa «riscrittura: una riga sola col prezzo nuovo nello storico del pannello»); più un test API: decorrenza di ieri → 422 `RATE_VALID_FROM_IN_PAST`.

### F — Superfici della tariffa

27. **[Q-a = A]** (AD-8): card desktop, widget Panoramica, card e sheet mobile mostrano i due prezzi etichettati, `—` senza tariffa; a 375 nessun overflow orizzontale né testo troncato nella card mobile. `fleet/page.tsx:65` usa la data di Roma (D-8); `dashboard/page.tsx` cambia solo il mapper (`:451`).

### G — i18n, seed, residui, gate

28. **i18n** (§3.8): chiavi rimosse assenti da **entrambi** i file, nuove presenti in entrambi, testo cambiato; parità it/en **0/0** (`diff <(jq -r '[paths(scalars)|map(tostring)|join(".")]|.[]' messages/it.json | sort) <(jq -r '…' messages/en.json | sort)` vuoto); conteggio chiavi nel record.
29. **Seed**: `seed-demo.ts` `AIRCRAFT[].rates` (`:135`, `:141`, `:147`) con `studentPriceCents`/`pilotPriceCents` — I-B412 2025-06-01 11800/12500, 2026-01-01 12500/13200; I-A661 12300/13000, 13100/13800; I-PDVB 17200/17900, 18200/18900 — e la `create` di `:399-406` allineata; `seed-load.ts` (`:480`, `:513-525`, `:658`, `:731`: righe tariffa con entrambi i prezzi uguali, `effectiveRate` che restituisce la coppia, il volo prende la colonna del suo profilo e scrive `aircraftPriceCategory` — Scuola = allievo, altrimenti pilota); `seed.ts` invariato (nessuna tariffa). `npx prisma db seed` e `npm run seed:demo` verdi su DB fresco; `seed-load.ts` passa il typecheck (NON eseguirlo).
30. **Nessun residuo** (tutti **0 righe**, escluse `src/generated/`, `prisma/migrations/`, `_bmad-output/`, `docs/`):
    - `grep -rniE "dryHourlyRateCents|wetRateCents|priceDry|currentDry|WithDry|\bwet\b|\bdry\b" src e2e messages prisma/schema.prisma prisma/seed.ts prisma/seed-demo.ts prisma/seed-load.ts --exclude-dir=generated`
    - `grep -rn "priceCentsPerHour" src/lib/schemas/aircraft.ts src/server/services/rates.service.ts src/server/services/aircraft.service.ts 'src/app/[locale]/dashboard/fleet' src/components/dashboard/fleet-card.tsx 'src/app/[locale]/dashboard/page.tsx' prisma/seed-demo.ts`
    - `grep -rn "conflictRate\|rateAdded\|newRateTitle\|RatesSection\|fetchRatesHistory\|currentRateOf\|HISTORY_VISIBLE_COUNT\|createAircraftRateCore\|assertRateAvailable" src 'src/app/[locale]/dashboard/fleet'` — **unica eccezione ammessa**: le chiavi/label `conflictRate` del pannello istruttore (`InstructorsPage…`, `instructor-rates-panel.tsx`), della 19.4
    - `grep -rn "priceCentsPerHour" e2e` → solo corpi di tariffe **istruttore** (`instructor-rates.spec.ts`, `db-fixtures.ts#seedInstructorRate`)
31. **OpenAPI servito**: `GET /api/v1/openapi.json` sull'app reale contiene `studentPriceCents`, `pilotPriceCents`, `aircraftPriceCategory`, `RATE_VALID_FROM_IN_PAST`, `PILOT_STUDENT_PROFILES_EXCLUSIVE`; non contiene `dryHourlyRateCents`.
32. **Gate**: `npm run gates` verde; e2e mirati verdi via `scripts/e2e.sh start <spec…>` (§4.2); l'arbitro full-suite su DB fresco lo esegue la sessione principale.
33. **Verifica UI interattiva** (Playwright MCP o script throwaway in `/tmp`), screenshot a **1280** e **375**: editor velivolo in modifica (con tariffa, senza tariffa, archiviato, con errore `validFromPast`, popover di «In vigore da» aperto coi giorni disabilitati, [Q-d] riga programmata) e in creazione; card Flotta desktop e mobile; sheet mobile; widget Panoramica; editor pilota col messaggio di profili esclusivi. Nessun overflow, `.so-foot` con il solo Salva, nessuna stringa wet/dry.

---

## §3 — Dev Notes: blast radius (misurato su `72e7e1b`; rieseguire i comandi dopo 19.1 e 19.2)

### 3.1 — Schema
- `prisma/schema.prisma`: `Aircraft.rates` doc `:330`; `AircraftRate` `:340-373`; `InstructorRate` `:375-405`; `Flight` doc `:913-961` (snapshot `:925-933`), colonne `:1035-1044`; enum nuovo vicino a `FlightType`/`FlightStatus` (`:897-911`).

### 3.2 — Server
- `src/server/services/rates.service.ts`: header `:8-20`, tipi/select `:21-83` (via `RATE_SELECT_WITH_DRY`, `AircraftRateListItemWithDry`, `toListItemWithDry`: con due prezzi obbligatori la variante «with dry» non ha più ragione — un solo `RATE_SELECT` e un solo `toListItem`), `assertRateAvailable` `:94-102` (via), core `:104-129` (AD-2), `createAircraftRate` `:131-187`, `listAircraftRates` `:189-213` (doc: storico per l'API, D-2), `getEffectiveRate(s)` `:215-277` (doc «the hook epic 5's flight snapshot will call» è stale da anni: riscriverlo col consumatore reale). Il re-export `export { todayDateOnlyUtc }` (`:13`) **resta** (lo usa ancora `dashboard/page.tsx:43`; lo toglie la 16.9).
- `src/server/services/instructor-rates.service.ts`: header `:7-17`, `assertRateAvailable` `:88-101` (via), `createInstructorRate` `:103-155` (decorrenza + core), doc di `listInstructorRates`/`getEffectiveInstructorRate` («the hook epic 5's flight snapshot will call»).
- `src/server/services/aircraft.service.ts`: import `:20`; `createAircraft` doc `:259-270` + `:282-319` (decorrenza prima della transazione, core rinominato); `updateAircraft` doc `:321-327` + `:328-360` (AD-3). ⚠️ La 19.2 riscrive gli stessi due blocchi (campi): rileggere.
- `src/server/services/flights.service.ts`: AD-4 (righe in AD-4 e AC 12) + `OriginalFlightIdentity` `:360` [Q-b].
- `src/server/services/people.service.ts`: `createPerson` `:468-544` (AD-5), `upsertProfile` doc `:674-686` («reactivating, e.g. the student→pilot transition, is just an upsert»: ora richiede prima la disattivazione — riscrivere) + `:695-720`.
- Route: `src/app/api/v1/aircraft/[id]/rates/route.ts` (commento `:7-11`), `src/app/api/v1/aircraft/[id]/route.ts` (invariata: `updateAircraftSchema` porta già il blocco).

### 3.3 — Zod e OpenAPI
- `src/lib/schemas/aircraft.ts`: `createAircraftRateSchema` + doc `:5-26`; doc `createAircraftSchema` `:28-47` (frase sul `rate`), `updateAircraftSchema` `:64-81` (campo `rate` + doc); `aircraftRateItemSchema` + doc `:269-291`.
- `src/lib/schemas/people.ts`: doc `createInstructorRateSchema` `:245-261`.
- `src/lib/schemas/flights.ts`: `flightBreakdownSchema` `:132-148`.
- `src/lib/schemas/registry.ts`: righe di AC 7, 12, 15; `registry.test.ts:151-154` (accanto, le asserzioni nuove).

### 3.4 — UI
| File | Righe (HEAD) | Cosa |
|---|---|---|
| `fleet/aircraft-editor.tsx` | header `:3-14` (la frase «every other section is a self-contained mini-form» diventa falsa), labels `:107-121` (blocco `rates`), `:148` (`conflictRate`), `:164` (`rateAdded`), `:188` (`EditableAircraft`), `:238-241`, `:252-262` (`isValidRatePrice` resta), `:270-274`, `:343-353`, `:409-443`, `:493-513`, `:625-676`, `:1115-1313` | AD-6 |
| `fleet/fleet-console.tsx` | `:57`, `:65`, `:80`, `:219`, `:259-262`, `:364` | AD-8, label |
| `fleet/page.tsx` | `:9`, `:65`, `:72`, `:103`, `:132`, `:150`, `:221-233`, `:261`, `:276` | D-8, AD-8, label |
| `components/dashboard/fleet-card.tsx` | `:34-35`, `:70`, `:76`, `:94-97`, `:109`, `:150` | AD-8 |
| `dashboard/page.tsx` | `:451`, `:764` | mapper, label |
| `components/ui/calendar-popover.tsx` | props `:39-62`, celle `:128-143`, «Oggi» `:174-176` | AD-7 |
| `components/ui/date-input.tsx` | `:97`, `:119-152` | AD-7 |
| `src/styles/airops.css` | vicino a `:1350-1378` | `.cal-cell:disabled` |
| `pilots/pilot-editor.tsx` | `:632-633`, `:984-986`, `:1104-1106` + label plumbing (`pilot-editor-labels.ts:57`, `:132-136`) | AC 16 |

### 3.5 — Lock dopo la story
Nuovo: `people.service.ts#upsertProfile` → `Person FOR NO KEY UPDATE` (rami pilota/allievo). Invariati: registro voli `Aircraft → Account`, prenotazioni `Booking → Aircraft → Person → InstructorProfile` (16.3 AD-2), `accounts.service.ts:639`. Nessun lock sulle tariffe (upsert nativo, AD-2).

### 3.6 — Blast radius e2e
- **Tariffe create via API con decorrenza passata** — `grep -rnE "/rates\`|instructor-rates\`" e2e` (fuori dai due spec delle tariffe): **27** siti in **20** spec → `seedAircraftRate`/`seedInstructorRate` di `e2e/db-fixtures.ts` con la stessa data, **stesso prezzo per allievo e pilota** (così nessuna asserzione d'importo esistente cambia): `aircraft-out-of-service-until:72`, `billing:94`, `bookings:2039`, `exports:44`, `flight-log:149`, `flight-reversal:133,152`, `flights:145,168`, `instructor-compensation:73,81`, `mobile-logbook:102,140`, `mobile-registries:89,508`, `mobile-reports:235`, `mobile-self-public:144`, `mobile-settings:607`, `my-account:114`, `my-compensation:150,157`, `pdf-exports:62`, `people-management:173`, `person-detail:161`, `reports:105,111`, `typeahead-pickers:115`. Senza questa sostituzione falliscono **rumorosamente** (body senza `studentPriceCents` → 422; decorrenza passata → 422): nessun verde silenzioso.
- **`e2e/db-fixtures.ts`** (nuovo, non è uno spec: il `testMatch` di default lo ignora): `pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, allowExitOnIdle: true })` a livello di modulo (uno per worker; `allowExitOnIdle` per non trattenere il worker); errore esplicito se `DATABASE_URL` manca (stesso stile delle guardie `SEED_ADMIN_PASSWORD`). `seedAircraftRate(aircraftId, { studentPriceCents, pilotPriceCents, validFrom })` → `INSERT INTO "AircraftRate" ("id","aircraftId","studentPriceCents","pilotPriceCents","validFrom","actorUserId") VALUES ('e2e_' || gen_random_uuid(), $1, $2, $3, $4::date, (SELECT "id" FROM "User" WHERE "email" = 'admin@airmanager.local')) ON CONFLICT ("aircraftId","validFrom") DO UPDATE SET …`; `seedInstructorRate(personId, { priceCentsPerHour, validFrom })` risolve `InstructorProfile.id` dal `personId`. Doc-comment che dice **perché** (D-7) e che il percorso API si prova solo in `aircraft-rates`/`instructor-rates`.
- **`e2e/helpers.ts`**: `todayRome()` (`Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', … })`) e `addDaysIso(date, n)`. Le copie locali `todayDateOnly()` UTC (`aircraft-rates.spec.ts:58-61`, `instructor-rates.spec.ts:48-51`) → `todayRome()`: con l'API che rifiuta il passato, una data UTC fra le 00:00 e le 02:00 di Roma sarebbe «ieri» → 422.
- **`aircraft-rates.spec.ts` riscritto** (oggi 6 test: `:73`, `:115`, `:135`, `:155`, `:194`, `:230`): AC 17-24 + 403 del pilota su `POST /rates` col body nuovo (`:135` adattato) + [Q-d] AC 25. Setup per velivolo con tariffa attuale: velivolo via API + `seedAircraftRate(PAST_DATE)`. Lo spec perde `createAndOpenAircraft` via UI dove non serve.
- **`instructor-rates.spec.ts:76`, `:111`** (AC 26) + test API 422.
- **`flights.spec.ts`**: un test nuovo (AC 10) e uno per AC 6 (o in `aircraft-rates`).
- **`person-profiles.spec.ts`**: test nuovi per AC 13-16 (API simmetrica, parallelo, `POST /people` con entrambi, messaggio UI nella sezione e nel form «Nuovo»).
- **`my-account.spec.ts:225-254`**: AC 16 (fixture senza doppio profilo).
- **`mobile-registries.spec.ts`**: le righe dello sheet flotta (parità, `:316` riscritto dalla 19.2) guadagnano «Tariffa allievo»/«Tariffa pilota» al posto di «Tariffa» [Q-a].
- Nessuno spec nuovo entra nella catena serializzata: nessuno muta AppSettings né asserisce aggregati globali.

### 3.7 — Unit esistenti che cambiano
- `rates.service.test.ts` (45 righe su `priceCentsPerHour`/dry), `instructor-rates.service.test.ts` (22): riscritti su forma, decorrenza (AC 4) e riscrittura (AC 5); i casi «409 same validFrom» diventano «upsert».
- `aircraft.service.test.ts:465-504` (blocco `rate` della creazione) + casi nuovi di AC 20.
- `flights.service.test.ts`: `getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: … })` (25 occorrenze) → `{ studentPriceCents, pilotPriceCents }` (con prezzi diversi dove il test deve discriminare); il caso `:514` (entrambi attivi) guadagna l'asserzione `PILOT`; casi nuovi di AC 9 e [Q-b] AC 11.
- `flights-expiry-boundary.integration.test.ts:202` (mock tariffa).
- `people.service.test.ts`: casi nuovi di AC 13-15; `:903` (allievo → pilota) resta verde.
- `registry.test.ts` (AC 7, 15).
- **Env eager** (CLAUDE.md): nessun import nuovo verso mail/crypto previsto; se un test nuovo importa un service «grosso», mockare la catena e verificare con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.

### 3.8 — Chiavi i18n (in **entrambi** `messages/it.json` e `messages/en.json`)
- **Rimosse (11)**: `AircraftPage.editor.rates.{current,currentDry,newRateTitle,price,priceDry,submit,historyTitle,historyEmpty,showAll}`, `AircraftPage.editor.errors.conflictRate`, `AircraftPage.toast.rateAdded`. **[Q-a = A] +3**: `AircraftPage.rateLabel`, `AircraftPage.mobile.sheet.rate`, `DashboardPage.fleetCard.rateLabel`.
- **Nuove (6)**: `AircraftPage.editor.rates.studentPrice` («Prezzo allievo (€/h)» / «Student price (€/h)»), `…rates.pilotPrice` («Prezzo pilota (€/h)» / «Pilot price (€/h)»), `…rates.currentHint` (`t.raw`, «Attuale: {price}/h — lascia vuoto per non cambiarlo.» / «Current: {price}/h — leave empty to keep it.»), `AircraftPage.editor.errors.validFromPast` («La decorrenza non può essere nel passato.» / «The effective date cannot be in the past.»), `PilotsPage.editor.errors.profilesExclusive` («Una persona non può essere insieme pilota e allievo.» / «A person cannot be both a pilot and a student.»), `PeoplePage.profilesPanel.errors.exclusive` («Pilota e allievo non possono essere attivi insieme: disattiva prima l'altro profilo.» / «Pilot and student cannot both be active: deactivate the other profile first.»). **[Q-a = A] +6**: `AircraftPage.rateStudentLabel`/`ratePilotLabel` («Allievo»/«Pilota»), `AircraftPage.mobile.sheet.rateStudent`/`ratePilot` («Tariffa allievo»/«Tariffa pilota»), `DashboardPage.fleetCard.rateStudentLabel`/`ratePilotLabel`. **[Q-d = B] +1**: `AircraftPage.editor.rates.scheduled` (`t.raw`, «Variazione programmata dal {date}: allievo {student}/h · pilota {pilot}/h»).
- **Testo cambiato (1)**: `AircraftPage.editor.rates.readOnlyHint` → «Un velivolo archiviato non accetta nuove tariffe.» / «An archived aircraft cannot take new rates.» (il testo attuale, «Solo un amministratore…», è falso dalla 14.9: la riga compare solo per un velivolo archiviato).
- Restano: `rates.sectionTitle`, `rates.validFrom`, `rates.noCurrentRate` (diventa l'hint senza tariffa). Copy definitiva: 19.12 (glossario).

---

## §4 — Piano di test

### 4.1 — Unit
§3.7 + le prove nuove: decorrenza col fuso (AC 4), riscrittura (AC 5), atomicità del PATCH (AC 20), prezzo/categoria (AC 9), [Q-b] correzione (AC 11), esclusività e ordine del lock (AC 13-15), schema registry (AC 7).

### 4.2 — e2e (via `scripts/e2e.sh`, mai `playwright test` in foreground)
Mirati prima della consegna: `aircraft-rates`, `instructor-rates`, `flights`, `person-profiles`, `my-account`, `aircraft-management`, `mobile-registries`, `mobile-a11y-sweep`, `home-dashboard` o `mobile-overview` (widget), più **tutti i 20 spec di §3.6** (cambiano solo la fixture, ma è lì che una data sbagliata o una colonna sbagliata nell'SQL si vedrebbe). Il conteggio dei test prima/dopo va dichiarato alla sessione principale per l'arbitro.

### 4.3 — Discriminanza (nel Dev Agent Record, ognuna con ripristino byte-identico e sha256 del file prima/dopo)
1. Nell'helper della decorrenza `todayDateOnlyUtcInZone(APP_TIMEZONE)` → `todayDateOnlyUtc()` ⇒ l'unit delle 00:30 di Roma (AC 4) **rosso**.
2. In `resolveFlightInput` sempre `pilotPriceCents` ⇒ unit AC 9 ed e2e AC 10 (allievo) **rossi**.
3. Nel core `upsert` → `create` ⇒ unit/e2e della riscrittura (AC 5, AC 19e) **rossi**.
4. Via il `FOR NO KEY UPDATE` da `upsertProfile` ⇒ unit dell'ordine (AC 14) **rosso**.
5. Upsert della tariffa fuori dalla `$transaction` in `updateAircraft` ⇒ unit di AC 20 **rosso**.
6. [Q-b = A] Ignorare `original.aircraftPriceCategory` ⇒ unit di AC 11 **rosso**.

### 4.4 — Gate
`npm run gates` (mai i quattro comandi separati) + grep di AC 30 + parità i18n di AC 28 + e2e mirati. **Prima** di gates/build/e2e: `scripts/e2e.sh status` e `ss -ltnp | grep :3000` — mai una build sotto un arbitro vivo (incidente AOG-1b, HANDOFF).

---

## §5 — Trappole note

1. **Le date passate negli e2e sono la trappola principale** (D-7): ogni tariffa creata via API con una data passata ora è un 422, e un volo datato nel passato senza tariffa a quella data è un 422 `NO_AIRCRAFT_RATE`/`NO_INSTRUCTOR_RATE`. Non «spostare a oggi» i voli: usare la fixture SQL con la data originale.
2. **La fixture SQL è accoppiata allo schema**: deve scrivere esattamente le colonne che scrive il core (nomi tra virgolette, `validFrom` come `date`). Uno schema che cambia la rompe rumorosamente — è voluto.
3. **Upsert non nativo** (AD-2): un `select` annidato nell'upsert fa ripiegare Prisma su leggi-poi-scrivi. Provare la SQL emessa.
4. **«Vuoto = invariata» è UI, non API** (D-1): il server riceve sempre due prezzi. Non aggiungere prezzi opzionali allo schema.
5. **Il `min` nativo non blocca la digitazione** (AD-7): `fill('2020-01-01')` passa; la validazione client e il 422 restano.
6. **Fuso negli e2e**: il «today» del popover è quello del browser; il test della primitiva va con `timezoneId: 'Europe/Rome'`, altrimenti fra le 00:00 e le 02:00 di Roma la cella `.today` (UTC) risulterebbe disabilitata.
7. **`mobile-a11y-sweep.spec.ts:281`** asserisce che il corpo del pannello velivolo **scorre** a 375 (`scrollable === true`, «this editor is only interesting because its body scrolls»). Dopo 19.2 (campi tolti) e 19.3 (storico tolto) potrebbe non scorrere più: se succede, la premessa del test è cambiata, non il difetto — dichiararlo e scegliere un velivolo che allunga il pannello (es. fuori servizio con motivo e anteprima), mai togliere le asserzioni su `.so-foot`.
8. **`getByLabel` è substring** (CLAUDE.md): «Prezzo allievo»/«Prezzo pilota» condividono «Prezzo»; «Pilota» compare anche come badge/profilo nell'editor pilota. Usare i testid di AD-6 o `{ exact: true }`; nelle asserzioni di assenza mai un count 0 su substring.
9. **Mai `Escape` dentro lo `SlideOver`** per chiudere il popover del calendario: si chiude scegliendo un giorno o cliccando lo scrim.
10. **`src/generated/prisma` è gitignored**: `npx prisma generate` dopo lo schema, altrimenti typecheck e build su client stantio.
11. **Migrazione sul DB gemello**, mai su `airmanager` con l'arbitro vivo; mai `docker compose down -v` (distrugge `airmanager_load`).
12. **File in comune con 19.1/19.2** (banner): rifare i censimenti. In particolare `aircraft-editor.tsx` arriva dalla 19.2 già senza contaore e campi: il blocco tariffe è l'unico pezzo del create che la 19.2 ha lasciato «invariato, della 19.3».
13. **Confine con la 16.9**: questa story sostituisce in `aircraft-editor.tsx` il `todayDateOnly()` UTC con `todayDateOnlyInZone(APP_TIMEZONE)` e converte `fleet/page.tsx:65` (D-8). Annotare nel record che la 16.9 deve rimisurare i suoi casi 3 e la metà Flotta dell'AC 9 (già chiusi qui); il pannello istruttore (caso 5) e `dashboard/page.tsx:295` restano suoi.
14. **Confine con la 19.4** (il suo story file cita i nomi di questa story come segnaposto ⟨19.3: …⟩): contratti consegnati qui = `upsertInstructorRateCore`, `assertPilotStudentExclusive(tx, personId)` (stato finale), `assertRateValidFromNotPast`, i codici `RATE_VALID_FROM_IN_PAST`/`PILOT_STUDENT_PROFILES_EXCLUSIVE`, il lock `Person FOR NO KEY UPDATE`, la prop `minDate` del `CalendarPopover` (via `min` del `DateInput`). La 19.3 **non** rende esclusive le spunte del form «Nuovo» (mappa solo il 422, AC 16): il controllo UI lo disegna la 19.4, che renderà la combinazione impossibile in entrambi i form e riscriverà quindi i due e2e UI di AC 16 (transitori per costruzione: vanno scritti comunque, provano la mappatura finché la 19.4 non atterra). Gli e2e API di AC 13-15 restano la prova permanente del 422. Il pannello istruttore non si tocca qui. Scelte UI allineate con la 19.4: pannello aperto dopo il Salva (D-6), una sola riga per la tariffa programmata ([Q-d]/Q-19.4-b: stessa risposta sui due editor).

---

## §6 — Fuori scope DICHIARATO

- UI della tariffa istruttore (pannello `instructor-rates-panel.tsx` nell'editor istruttore, placeholder, «In vigore da», via storico): **19.4**. Qui solo backend + contratto (AC 4-5, 26).
- Costo stimato della prenotazione per profilo (A9): **19.10**.
- Una UI che mostri la categoria di prezzo applicata a un volo (riepilogo del form volo, registro, estratto conto): non richiesta; il dato è nel DTO (D-5).
- Togliere le GET dello storico dall'API (D-2). Mostrare tutte le tariffe programmate (con [Q-d = B] solo la prossima).
- `dashboard/page.tsx:295` in UTC e il re-export `todayDateOnlyUtc` di `rates.service.ts:13`: **16.9**.
- Il compenso istruttore (`InstructorProfile.payoutRateCents`, «Tariffa payout»): non è una tariffa addebitata, non cambia. Snapshot del compenso: **16.5**.
- Revisione delle copy: **19.12**.

---

## §7 — Riferimenti

- CR: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` (§4.0 R-19-e/f/m, §4.2, §4.7 FR-10/11/48/49, §4.8 AD-4, §4.10 A6/A7/A12/A16/A17).
- PRD: `_bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md:409-420` (change record FR-10, FR-11, FR-49). Architettura: `ARCHITECTURE-SPINE.md:53-57` (AD-4 già emendato: nessun aggiornamento richiesto).
- Precedenti: `14-8-form-velivolo-unificato.md` (composito di creazione), `16-3-*.md` AD-2 (`FOR NO KEY UPDATE`, ordine dei lock), `16-1-*` (`todayDateOnlyUtcInZone`), `16-9-un-solo-calendario-client.md` (idioma client e idratazione), `19-2-*.md` AD-1 (migrazione su gemello), `13-4-*` (storico tariffe che qui sparisce).
- `CLAUDE.md` (convenzioni e2e, gates, env eager, manutenzione del file); `docs/handoffs/HANDOFF.md` (ambiente, reset DB, arbitro).

---

## Tasks / Subtasks

- [x] **T0 — Riallineamento** (tutti): `git log --oneline -5` (19.1 e 19.2 committate), `scripts/e2e.sh status`, `:3000` libero; ricontrollare le decisioni PO registrate in testa; rieseguire i censimenti di §3 e annotare nel record gli scostamenti di riga.
- [x] **T1 — Schema e migrazione** (AC 1-3): schema, migrazione AD-1 a mano, prova su DB gemello con backfill, `prisma generate`.
- [x] **T2 — Tariffe server** (AC 4-8): helper decorrenza, due core upsert (nativo verificato), `createAircraftRate`, `createInstructorRate`, `createAircraft`, `updateAircraft` composito (AD-3), doc-comment.
- [x] **T3 — Prezzo dal profilo** (AC 9-12): `resolveFlightInput`, core, DTO, [Q-b] correzione, doc-comment.
- [x] **T4 — Profili esclusivi** (AC 13-16): `upsertProfile` col lock, `createPerson`, mappatura UI nell'editor pilota.
- [x] **T5 — Zod e OpenAPI** (AC 7, 12, 15, 31).
- [x] **T6 — Primitiva calendario** (AC 24): `CalendarPopover` + `DateInput` + CSS.
- [x] **T7 — Editor velivolo** (AC 17-23, [Q-d] 25): AD-6; `fleet/page.tsx` (D-8, item, [Q-d] fonte batch).
- [x] **T8 — Superfici tariffa** (AC 27): card, widget, card e sheet mobile [Q-a].
- [x] **T9 — i18n** (AC 28): §3.8, parità misurata.
- [x] **T10 — Seed** (AC 16, 29): seed-demo, seed-load (solo typecheck), query di esclusività.
- [x] **T11 — Unit** (§3.7, §4.1) + discriminanza §4.3 con sha256.
- [x] **T12 — e2e** (§3.6): `db-fixtures.ts`, `todayRome`, 27 sostituzioni, spec riscritti e nuovi.
- [x] **T13 — Verifica** (AC 30-33): grep a zero, OpenAPI servito, `npm run gates`, e2e mirati via `scripts/e2e.sh`, screenshot 1280/375; Dev Agent Record compilato.

---

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (`claude-opus-5-5`), dev subagent unico della story (`dev-19-3`), 2026-11-01/02.

### §A — Riallineamento sul HEAD (T0) e decisioni PO applicate

- Partenza da `dc47b71` (19.1 `08eb558` e 19.2 `b0d142c` committate); durante il lavoro altre sessioni hanno committato solo story file (`125f339`, `5a666b1`, nessun file in comune). Implementazione in **`2e66d40`**. `:3000` libero ed `e2e.sh status` DONE prima di ogni build/run; `.next/dev/types/validator.ts` non presente.
- **Decisioni PO applicate** (testa del file): **Q-a = nessun prezzo** sulle card (AC 27 riscritto: via la riga «Tariffa» da `fleet-card.tsx`, dalla card e dallo sheet mobile di `fleet-console.tsx`, via `wetRateCents`/`rateLabel` da item, props e mapper; AD-8 e chiavi [Q-a] di §3.8 decadute); **Q-b = A** (categoria congelata se la persona non cambia); **Q-c = B** (allievo esclusivo con pilota **e** istruttore, nomi generici per decisione della sessione principale: codice **`STUDENT_PROFILE_EXCLUSIVE`**, helper **`assertStudentProfileExclusive(tx, personId)`** — sostituiscono i segnaposto `PILOT_STUDENT_PROFILES_EXCLUSIVE`/`assertPilotStudentExclusive` del file e della 19.4); **Q-d = B** (una riga con la sola prossima variazione).
- **Scostamenti di riga** rispetto a `72e7e1b` (censimenti §3 rieseguiti sul HEAD): `schema.prisma` `AircraftRate` 333-353 (era 340-373), `InstructorRate` 371-386, `Flight` 892+ e snapshot 863-870; `rates.service.ts` `assertRateAvailable` 94, core 114-129, `createAircraftRate` 145-187, `getEffectiveRate(s)` 227-277 (righe quasi invariate); `instructor-rates.service.ts` 92-155; `aircraft.service.ts` `createAircraft` 196-237, `updateAircraft` 240-279 (19.2 aveva già ridotto i campi a marche/tipo/modello); `flights.service.ts` `getEffectiveRate` 850, `hasActivePilot` 639, `OriginalFlightIdentity` 341, `registerFlightCore` 1026; `people.service.ts` `createPerson` 460, `upsertProfile` 686-718; `aircraft-editor.tsx` 1225 righe (`RatesSection` 1011-1169, blocco create 382-568); `fleet/page.tsx` `todayDateOnlyUtc` 65, `getEffectiveRates` 76; `dashboard/page.tsx` `getEffectiveRates` 289, mapper 427-437; `calendar-popover.tsx` celle 128-143, «Oggi» 173-176; i18n **1720** chiavi per file al HEAD (non 1989: 19.1/19.2).
- **Census e2e** (`grep -rnE "/rates\`|instructor-rates\`" e2e`, fuori dai due spec tariffe): **27 siti in 20 spec**, come da §3.6 (righe slittate di poche unità).

### §B — Riepilogo per AC con le prove

| AC | Esito | Prova |
|---|---|---|
| 1-2 | ✅ | `schema.prisma`: `AircraftRate.studentPriceCents/pilotPriceCents`, via `priceCentsPerHour`/`dryHourlyRateCents`, doc riscritti (anche `InstructorRate`); enum `AircraftPriceCategory` e `Flight.aircraftPriceCategory` NOT NULL, paragrafo «Snapshot» che nomina la categoria |
| 3 | ✅ | §C (gemello, backfill, `migrate diff` vuoto) |
| 4 | ✅ | `rates.service.ts:75` `assertRateValidFromNotPast` usato da `createAircraftRate`, `createAircraft:207`, `updateAircraft`, `createInstructorRate`; unit 00:30 Roma (rates + instructor-rates), unit «nessun upsert/transazione» sui 4 percorsi; e2e `aircraft-rates` (API: 422 su POST /rates, POST /aircraft senza creare, PATCH senza cambiare marche), `instructor-rates` (422 e lista vuota) |
| 5 | ✅ | unici writer `upsertAircraftRateCore:93`/`upsertInstructorRateCore:95`; `grep -rn "aircraftRate.create\|instructorRate.create" src/server` (no test) = **0**; SQL nativa §D; e2e riscrittura stesso giorno (201, una riga) velivolo e istruttore |
| 6 | ✅ | e2e `flights.spec.ts` «rewriting today's rate never reprices…»: 140,00 → volo 70,00 €; riscrittura 150/160; volo nuovo 80,00 €; il primo riletto dal registro invariato |
| 7 | ✅ | Zod a due prezzi obbligatori; corpo col solo `priceCentsPerHour` → 422 `VALIDATION_ERROR` (unit + e2e); `registry.test.ts` +5 test; descrizioni OpenAPI riscritte (`POST/GET /aircraft/{id}/rates`, `POST /aircraft`, `PATCH /aircraft/{id}`, `POST/GET /people/{id}/instructor-rates`) |
| 8 | ✅ | `grep -n "/rates" aircraft-editor.tsx` = **0**; GET restano con descrizione «kept for API clients» |
| 9 | ✅ | `flights.service.ts:880`; unit nuovi (allievo Scuola → STUDENT, pilota Turismo → PILOT, pilota Scuola → PILOT, entrambi → PILOT, DTO); `breakdown.aircraftPriceCategory` in `flightBreakdownSchema` |
| 10 | ✅ | e2e `flights.spec.ts` (fixture SQL 100/150): 10000 STUDENT, 15000 PILOT, 15000 PILOT su Scuola |
| 11 | ✅ | unit «price category on a correction»: stessa persona ora pilota → STUDENT a 10000; persona cambiata → PILOT |
| 12 | ✅ | doc-comment del modulo, di `resolveFlightInput` e del commento in linea riscritti (via «append-only, no meaningful race»); descrizioni OpenAPI di `POST /flights` e `/correct` |
| 13 | ✅ | e2e `person-profiles` (pilota↔allievo e istruttore↔allievo, `GET` conferma il rollback, stesso tipo di nuovo = 200, pilota+istruttore = 200); `grep -rn STUDENT_PROFILE_EXCLUSIVE src/server` → solo `studentProfileExclusiveError` (usato dall'helper e dal pre-check di `createPerson`) + doc. `person-profiles.spec.ts:81` (allievo → pilota) verde |
| 14 | ✅ | unit: primo `$queryRaw` con `FROM "Person"` e `FOR NO KEY UPDATE`, unico, prima di tutto, su `tx` distinto; 0 righe → 404; helper legge da `tx`; e2e `Promise.all` → `[200, 422]` |
| 15 | ✅ | unit (`$transaction` mai chiamato) ed e2e (422, persona inesistente dopo) per pilota+allievo e istruttore+allievo; 422 documentato su `POST /people` e sui tre `PUT` |
| 16 | ✅ | editor pilota: messaggio nella sezione per i tre profili, banner `profilesExclusive` nel «Nuovo» (e2e); seed §F (query = 0); `seed-load.ts` disgiunto per costruzione (letto: studenti = `afterPilot.slice`, dopo istruttori e piloti, righe 279-286); fixture `my-account.spec.ts` riscritta (volo Scuola con istruttore run-unique e tariffa SQL, saldo 150 − 70 = 80,00 €) |
| 17-18 | ✅ | e2e `aircraft-rates` (un solo `<form>`, un solo submit in `.so-foot`, testid vecchi a 0, niente wet/dry/storico, placeholder `120,00`/`140,00`, `toHaveAccessibleDescription` dell'hint, `min` = oggi Roma) |
| 19 | ✅ | e2e a/b/c/d/e (stato verificato con `GET …/rates`; c/d: zero richieste registrate, nessun toast) |
| 20 | ✅ | unit (stesso `tx`, `$transaction` unica, rigetto propagato, senza `rate` nessuna transazione, `authorize` spiato: `settings.manage` solo con `rate`); e2e 422 + marche invariate, 409 su archiviato |
| 21 | ✅ | e2e: pannello aperto, campi vuoti, data a oggi, placeholder = prezzi appena salvati (oggi) o invariati (data futura, AC 25) |
| 22 | ✅ | e2e: riga `aircraft-rate-readonly`, nessun campo, body del Salva senza `rate` |
| 23 | ✅ | e2e creazione: un prezzo solo bloccato, data passata bloccata, poi 201 con `rate` nel body, placeholder nell'editor riaperto, card senza «€» |
| 24 | ✅ | e2e con `timezoneId: 'Europe/Rome'`: celle prima di `.today` tutte `disabled`, dalla `.today` in poi abilitate, «Oggi» abilitato, click scrive oggi; il `DateInput` «Fermo fino al» (senza `min`) non ha celle disabilitate; `datetime-input.tsx`/`schedule.tsx` non passano la prop (render invariato) |
| 25 | ✅ | `getNextScheduledRates` (`rates.service.ts:252`, unit); e2e: riga con la più vicina (oggi+20 fra +20/+40), Salva a oggi+10 la sostituisce |
| 26 | ✅ | `instructor-rates-panel.tsx` **non toccato**; spec adattato (oggi/oggi+30 su Roma, riscrittura = una riga col prezzo nuovo, 422 API) |
| 27 | ✅ (Q-a) | nessun prezzo su card desktop/widget/card e sheet mobile (screenshot §I, `widget has €: false`); `fleet/page.tsx:70` data di Roma (D-8); `dashboard/page.tsx` perde la lettura `getEffectiveRates` (orfana: §H) |
| 28 | ✅ | §F |
| 29 | ✅ | `seed-demo.ts` (numeri di AC 29, verificati su gemello), `seed-load.ts` (prezzi uguali, `effectiveRate` → coppia, colonna dal profilo, `aircraftPriceCategory`, correzione = categoria dell'originale), typecheck verde, non eseguito |
| 30 | ✅ con residui motivati | §F |
| 31 | ✅ | `GET /api/v1/openapi.json` sull'app reale: `studentPriceCents` 23, `pilotPriceCents` 23, `aircraftPriceCategory` 14, `RATE_VALID_FROM_IN_PAST` 4, `STUDENT_PROFILE_EXCLUSIVE` 4, `dryHourlyRateCents` **0** |
| 32 | ✅ | §J |
| 33 | ✅ | §I |

### §C — Migrazione: catena, `migrate diff`, backfill (psql)

`prisma/migrations/20261102000000_aircraft_rate_student_pilot_prices/migration.sql`, a mano (TD-2), dopo `20261101223000_*` della 19.2. Q-c = B esteso al passo 2: l'allievo cade anche se attivo con un **istruttore** attivo.

Gemello `am_rev193` (createdb nel container; mai `airmanager` con arbitro vivo; `airmanager_load` non toccato), migrazioni precedenti applicate con psql, fixture inserite, poi la migrazione:

```
BEFORE  r1 | 15000 | 12000 | 2025-01-01      r2 | 16000 |  (null) | 2026-01-01
        StudentProfile attivi: p1 (pilota+allievo), p2 (solo allievo), p3 (istruttore+allievo)
UPDATE 2 (studentPriceCents) · UPDATE 2 (allievi disattivati: p1, p3) · UPDATE 4 (voli)
AFTER   r1 | studentPriceCents 15000 | pilotPriceCents 15000      r2 | 16000 | 16000
        StudentProfile attivo solo p2
        Flight f1 (p1) PILOT · f2 (p2) STUDENT · f3 (p3) PILOT · f4 (p4 pilota) PILOT
\d "AircraftRate": pilotPriceCents/studentPriceCents integer NOT NULL, nessun dryHourlyRateCents, AircraftRate_aircraftId_validFrom_key UNIQUE
\dT "AircraftPriceCategory": STUDENT, PILOT · \d "Flight": aircraftPriceCategory "AircraftPriceCategory" NOT NULL
```

Catena da zero su gemello ricreato: `migrate deploy` → «All migrations have been successfully applied.»; `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → **`-- This is an empty migration.`** (Prisma 7: `--from-migrations` vuole `shadowDatabaseUrl` nel config, stessa forma equivalente della 19.2 §G-5). Poi `prisma db seed` + `npm run seed:demo` verdi (§F). Gemelli `am_rev193` e `am_e2e193` cancellati (`dropdb`) a fine lavoro. `npx prisma generate` dopo lo schema. Sul DB `airmanager` (appena resettato dalla sessione principale) applicato `migrate deploy` per gli e2e.

### §D — Upsert nativo (SQL emessa) e censimento dei lock

Log query Prisma (`$on('query')`) sul gemello, due scritture sulla stessa `(aircraftId, 2030-01-01)` e una istruttore:

```
INSERT INTO "public"."AircraftRate" ("id","aircraftId","studentPriceCents","pilotPriceCents","validFrom","actorUserId","createdAt") VALUES ($1,…,$7) ON CONFLICT ("aircraftId","validFrom") DO UPDATE SET "studentPriceCents" = $8, "pilotPriceCents" = $9, "actorUserId" = $10 WHERE (…) RETURNING "public"."AircraftRate"."id"
(seconda identica) → riga finale { studentPriceCents: 22222, pilotPriceCents: 22222 } (una sola)
INSERT INTO "public"."InstructorRate" (…) VALUES (…) ON CONFLICT ("instructorProfileId","validFrom") DO UPDATE SET "priceCentsPerHour" = $7, "actorUserId" = $8 WHERE (…) RETURNING …
```

Upsert piatto (`select: { id: true }`), poi `findUniqueOrThrow` con `RATE_SELECT` nella stessa transazione: un doppione concorrente non può dare P2002 → 500.

**Lock** (`grep -rn "FOR UPDATE\|FOR NO KEY UPDATE" src/server`): nuovo `people.service.ts:745` `Person FOR NO KEY UPDATE`, **primo** statement della transazione di `upsertProfile` (tutti e tre i rami, Q-c = B), seguito solo dal profilo della persona e dall'`Account` (upsert del core). Invariati: prenotazioni `Booking → Aircraft → Person → InstructorProfile` (`bookings.service.ts:348-350`), registro voli `Aircraft → Account` (`flights.service.ts:1173/1202`, `1393/1402`, `1522/1562`), `accounts.service.ts:639` e `membership.service.ts:103` (`Account`). **Nessuna transazione prende `Account` e poi `Person`**: chi tiene `Account FOR UPDATE` tocca `Person` solo con il `FOR KEY SHARE` delle FK, compatibile con `FOR NO KEY UPDATE`. Il doc-comment del modulo prenotazioni che diceva «no other service locks … `Person`» è stato corretto nello stesso commit (`bookings.service.ts:83-90`, chiesto anche dalla 19.4).

### §E — Discriminanza (§4.3) con sha256

Script in scratchpad: mutazione, `npx vitest run <file>`, ripristino del contenuto originale, sha256 (16 hex) prima/dopo.

| # | Mutazione | Esito | sha256 prima → dopo |
|---|---|---|---|
| 1 | helper decorrenza su «oggi» UTC | `rates.service.test` **1 failed** («00:30 in Rome on 2 November…») | `cd8a88c8b63700af` → identico |
| 2 | sempre `pilotPriceCents` | `flights.service.test` **2 failed** (allievo Scuola; correzione Q-b) | `e6cb83c37099e4b0` → identico |
| 3 | core `upsert` → `create` | `rates.service.test` **2 failed** (AC 5) | `cd8a88c8b63700af` → identico |
| 4 | via `FOR NO KEY UPDATE` | `people.service.test` **2 failed** (ordine/forma del lock; ramo istruttore) | `4aae95886fa45b91` → identico |
| 5 | upsert su `prisma` invece di `tx` in `updateAircraft` | `aircraft.service.test` **2 failed** (AC 20) | `5b9c6028c2d29c08` → identico |
| 6 | ignorare `original.aircraftPriceCategory` | `flights.service.test` **1 failed** (AC 11) | `e6cb83c37099e4b0` → identico |

L'e2e di AC 10 (#2) non è stato mutato a mano: la stessa mutazione rompe l'unit, e l'e2e asserisce 10000 vs 15000.

### §F — Grep di AC 30, parità i18n, query di esclusività sui seed (verbatim)

```
$ grep -rniE "dryHourlyRateCents|wetRateCents|priceDry|currentDry|WithDry|\bwet\b|\bdry\b" src e2e messages prisma/schema.prisma prisma/seed*.ts --exclude-dir=generated
src/lib/schemas/registry.test.ts:156:        expect(…).not.toHaveProperty('dryHourlyRateCents');
e2e/aircraft-rates.spec.ts:111:    for (const testId of ['new-rate-form', …, 'rates-current-dry', …]) {
$ grep -rn "priceCentsPerHour" src/lib/schemas/aircraft.ts … prisma/seed-demo.ts
prisma/seed-demo.ts:373:          priceCentsPerHour: p.instructor.rateCentsPerHour,
$ grep -rn "conflictRate\|rateAdded\|newRateTitle\|RatesSection\|fetchRatesHistory\|currentRateOf\|HISTORY_VISIBLE_COUNT\|createAircraftRateCore\|assertRateAvailable" src
→ solo src/app/[locale]/dashboard/instructors/instructor-rates-panel.tsx (sue funzioni gemelle e commenti) e instructors/page.tsx:171 (`rateAdded` del pannello)
$ grep -rn "priceCentsPerHour" e2e
→ solo tariffe istruttore (seedInstructorRate, instructor-rates.spec, createInstructor*Rate) + aircraft-rates.spec.ts:336 (il corpo col solo priceCentsPerHour → 422 di AC 7)
```

Residui motivati in §H (D-3, D-4). **i18n**: 1720 → **1713** chiavi per file (−15: 9 `editor.rates.*`, `errors.conflictRate`, `toast.rateAdded`, `rateLabel`, `mobile.sheet.rate`, `mobile.noValue` orfana, `DashboardPage.fleetCard.rateLabel`; +8: `rates.studentPrice/pilotPrice/currentHint/scheduled`, `errors.validFromPast`, `PilotsPage.editor.errors.profilesExclusive`, `PeoplePage.profilesPanel.errors.exclusive`, `InstructorsPage.addInstructor.exclusiveError`; testo cambiato `rates.readOnlyHint`); `diff <(jq … it.json | sort) <(jq … en.json | sort)` **vuoto** (parità 0/0). Copy dei due messaggi di esclusività estesa all'istruttore (Q-c = B).

**Seed** su gemello fresco (`prisma db seed` + `npm run seed:demo` verdi):
```
SELECT count(*) FROM "PilotProfile" p JOIN "StudentProfile" s USING ("personId") WHERE p."deactivatedAt" IS NULL AND s."deactivatedAt" IS NULL → 0
(stessa query InstructorProfile ⋈ StudentProfile) → 0
AircraftRate demo: I-A661 12300/13000, 13100/13800 · I-B412 11800/12500, 12500/13200 · I-PDVB 17200/17900, 18200/18900
Flight demo: STUDENT/SCHOOL 2 voli a 12500 (prezzo allievo I-B412 2026) · PILOT/TOURISM 22 voli 13200-18900
```

### §G — Delta test (unit ed e2e, prima/dopo)

- **Unit**: 1769 → **1797** (+28: 47 `it(` aggiunti, 20 tolti/riscritti nel diff). File: `rates.service.test` (riscritto: decorrenza col fuso, upsert, scheduled, schema a due prezzi), `instructor-rates.service.test`, `aircraft.service.test` (composito di modifica, `authorize` spiato), `flights.service.test` (prezzo/categoria, correzione Q-b), `people.service.test` (esclusività, lock su `tx` distinto, `createPerson`; il test del composito pilota+allievo+istruttore diventa pilota+istruttore), `registry.test`, `flights-expiry-boundary.integration.test` (mock). `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` dei file toccati: verde.
- **e2e**: +13 test → **delta atteso arbitro 489 → 502** (aircraft-rates 6 → 10, instructor-rates 3 → 4, person-profiles 5 → 11, flights 23 → 25; people-management e my-account invariati nel numero). Nessuno spec nuovo nella catena serializzata.
- **Run mirati** (build di produzione da `npm run gates`, `E2E_REUSE_SERVER=1 scripts/e2e.sh start --no-deps …`):
  1. aircraft-rates, instructor-rates, flights, person-profiles, my-account, aircraft-management, people-management → **77 passed**, `E2E_EXIT=0`.
  2. i 17 spec restanti di §3.6 + bookings, mobile-registries, mobile-a11y-sweep (trappola 7: il pannello scorre ancora a 375, verde senza modifiche), home-dashboard, mobile-overview → **224 passed, 2 failed** (`flight-log.spec.ts:307`, `flight-reversal.spec.ts:156`, entrambi su `selectOption` del filtro velivolo del registro). Causa misurata: DB non resettato fra i due run (199 velivoli, `I-FL…` alle posizioni 84-114 per marche) e il picker del registro limitato a `OPTIONS_PAGE_SIZE = 100` (TD noto dei picker) — non la story. **Riprova**: gli stessi due spec su un DB gemello fresco (`am_e2e193`, migrate + seed, server dedicato) → **6 passed**, `E2E_EXIT=0`. Il reset del DB `airmanager` col mandato PO è stato **negato dal classifier** (Irreversible Local Destruction): DB lasciato nello stato post-run, con la migrazione 19.3 applicata.

### §H — Deviazioni motivate

1. **Nomi generici** (Q-c = B, sessione principale): `STUDENT_PROFILE_EXCLUSIVE` e `assertStudentProfileExclusive` al posto dei nomi di AD-5/AC 13-16; l'helper legge anche `InstructorProfile` e il ramo `instructor` di `upsertProfile` ha lock e controllo (AD-5 lo lasciava invariato con Q-c = A).
2. **`dashboard/page.tsx` perde `getEffectiveRates`** (e l'import di `todayDateOnlyUtc`): con Q-a nessun widget mostra la tariffa, la lettura restava orfana. Di conseguenza il re-export `export { todayDateOnlyUtc }` di `rates.service.ts` (che §3.2 diceva «resta, lo toglie la 16.9») è rimasto senza consumatori ed è stato tolto: la riga `dashboard/page.tsx:295` UTC di cui parlava la 16.9 non esiste più (la 16.9 deve rimisurare).
3. **`AircraftPage.mobile.noValue`** rimossa: usata solo dalle due righe tariffa della card/sheet mobile (Q-a).
4. **«Aggiungi istruttore»** (`instructors-console.tsx`): con Q-c = B attivare l'istruttore su un allievo è un 422; mappato su un messaggio dedicato (`InstructorsPage.addInstructor.exclusiveError`) invece del generico — stessa regola di AC 16 sull'unica altra UI che attiva l'istruttore. Non era in un AC: segnalarlo in review.
5. **Hint senza tariffa solo in modifica**: in creazione i campi non hanno hint (nessuna tariffa da descrivere su un velivolo che non esiste); placeholder `0,00`.
6. **Riga «programmata» e `readOnlyHint` in `.fld-hint`** (12 px, muto) invece di `.fld-label` (mono maiuscolo): sono frasi, come gli altri hint dei campi.
7. **Residui di AC 30**: (a) le due asserzioni di **assenza** (`registry.test.ts:156`, `aircraft-rates.spec.ts:111`) che AC 7 e AC 17 richiedono — stessa eccezione della 19.2 §G-1; (b) `seed-demo.ts:373` è la colonna `InstructorRate.priceCentsPerHour`, che non cambia nome; (c) grep 3: oltre a `conflictRate`, il pannello istruttore (non toccabile, AC 26) ha funzioni omonime proprie (`fetchRatesHistory`, `currentRateOf`, `HISTORY_VISIBLE_COUNT`, `rateAdded`) e commenti che citano `fleet/aircraft-editor.tsx#RatesSection/#currentRateOf/#HISTORY_VISIBLE_COUNT/#todayDateOnly`, ora inesistenti: li riscrive la 19.4.
8. **e2e `bookings.spec.ts:2040`**: la tariffa istruttore che serviva solo a leggere l'`instructorProfileId` resta via API con `validFrom: todayRome()` invece della fixture SQL (uno dei 27 siti del census: lì la data passata non serviva, nessun volo); gli altri 26 usano `db-fixtures.ts`.
9. **Parametri degli helper e2e** `createAircraftWithRate(page, priceCents)`/`addRate(…, priceCents)` rinominati da `priceCentsPerHour` (grep 4 di AC 30); i siti e2e con prezzo unico scrivono **lo stesso valore** su allievo e pilota (nessun importo atteso cambia).
10. **`bookings.service.ts`**: toccato solo il doc-comment del censimento lock (§D), perché la story lo rendeva falso.

**TD aperti** (da riportare nel §7 della sessione principale): 19.3-a il pannello istruttore calcola ancora «oggi» in UTC (`instructor-rates-panel.tsx:71`, default e tariffa attuale) — fra le 00:00 e le 01:00/02:00 di Roma il default dà un 422 `RATE_VALID_FROM_IN_PAST` (19.4/16.9); 19.3-b il picker velivolo del registro voli limitato a 100 (causa delle 2 rosse del run 2 su DB sporco, già noto); 19.3-c `today` dell'editor velivolo è fissato al mount: un pannello lasciato aperto a cavallo della mezzanotte mostra il «minimo» di ieri finché non si riapre (il server risponde 422, mappato sul campo).

**Contratti consegnati alla 19.4** (nomi definitivi): `assertStudentProfileExclusive(tx, personId)` (`people.service.ts:692`, stato finale, legge da `tx`), lock `SELECT "id" FROM "Person" WHERE "id" = ${personId} FOR NO KEY UPDATE` (primo statement, `:745`), codice **`STUDENT_PROFILE_EXCLUSIVE`** (422), `assertRateValidFromNotPast(validFrom)` (`rates.service.ts:75`, import pulito: `date-only`, `time`, `zoned-time`), `upsertInstructorRateCore(tx, instructorProfileId, input, actorUserId)` (`instructor-rates.service.ts:95`, ritorna l'id), codice `RATE_VALID_FROM_IN_PAST`, `CalendarPopover.minDate` alimentata dal `min` del `DateInput`, `PATCH /aircraft/{id}` col blocco `rate`, e2e `seedAircraftRate`/`seedInstructorRate` (`e2e/db-fixtures.ts`), `todayRome()`/`addDaysIso()` (`e2e/helpers.ts`), copy `PeoplePage.profilesPanel.errors.exclusive` / `PilotsPage.editor.errors.profilesExclusive` / `AircraftPage.editor.errors.validFromPast` / `AircraftPage.editor.rates.currentHint`.

**Confine con la 16.9**: in `aircraft-editor.tsx` il `todayDateOnly()` UTC non esiste più (sostituito da `todayDateOnlyInZone(APP_TIMEZONE)`), `fleet/page.tsx:70` è su Roma (D-8): caso 3 e metà Flotta dell'AC 9 della 16.9 già chiusi qui; pannello istruttore (caso 5) resta suo; la riga `dashboard/page.tsx:295` non esiste più (§H-2).

### §I — Verifica UI (screenshot)

Script `playwright-core` throwaway nello scratchpad (Chromium `chromium-1228`, `timezoneId: 'Europe/Rome'`), app reale su build di produzione, viewport **1280×900** e **375×812**: card Flotta (desktop e mobile), sheet mobile, editor in modifica con tariffa e riga programmata, popover di «In vigore da» coi giorni passati barrati e disabilitati, errore `validFromPast`, senza tariffa, archiviato, creazione, widget Panoramica, editor pilota col messaggio di esclusività. Esiti:

```
24 schermate: scrollWidth == innerWidth in tutte (1280/1280, 375/375) — nessun overflow
so-foot (1280 e 375): ["Annulla","Salva modifiche"] · wet/dry/storico nel pannello: false · widget Panoramica con «€»: false
```

Coerenza AirOps (skill `design-taste-frontend` letta: design read «UI di prodotto/admin AirOps, preservare», fuori dal suo perimetro landing — applicate solo le regole generali di contrasto, stati, niente decorazione; `ui-ux-pro-max` consultata: label visibile + hint collegato, mai placeholder-come-label): blocco «Tariffe» con la stessa `Section` e `.form-grid` di identità e disponibilità, hint e riga programmata in `.fld-hint`, celle disabilitate barrate e attenuate (`.cal-cell:disabled`, token esistenti, nessun hover, distinguibili da `.out`), card Flotta senza la riga prezzo. La copy di `currentHint` mantiene il trattino lungo di AC 18 (il file i18n ne usa già 30; copy definitiva in 19.12).

### §J — Gate ed esiti verbatim

```
$ npm run gates          (ultimo, prima del commit 2e66d40)
PASS  lint (21s)
PASS  typecheck (2s)
PASS  test (8s) — Tests  1797 passed (1797)
PASS  build (30s)
```
e2e mirati: §G (77 + 224 passed; 2 rosse da DB sporco, verdi su DB fresco). L'arbitro full-suite su DB fresco resta alla sessione principale (atteso **502**).

**Stato macchina a fine lavoro**: `:3000` libero, nessun run e2e attivo, gemelli cancellati, DB `airmanager` non resettato (classifier) con la migrazione 19.3 applicata e i dati dei run mirati; nessuno stash; file untracked dell'utente e cancellazione di `.claude/skills/design-taste-frontend/SKILL.md` non toccati.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created (story writer, 2026-11-01, ricognizione su `72e7e1b`).
- Dev 2026-11-02: tutte le task T0-T13 completate; implementazione `2e66d40`; Status → review.

### File List

- `prisma/schema.prisma`
- `prisma/migrations/20261102000000_aircraft_rate_student_pilot_prices/migration.sql` (nuovo)
- `prisma/seed-demo.ts`, `prisma/seed-load.ts`
- `src/server/services/rates.service.ts`, `instructor-rates.service.ts`, `aircraft.service.ts`, `flights.service.ts`, `people.service.ts`, `bookings.service.ts` (doc), `exports.service.ts` (doc)
- `src/server/services/rates.service.test.ts`, `instructor-rates.service.test.ts`, `aircraft.service.test.ts`, `flights.service.test.ts`, `people.service.test.ts`, `flights-expiry-boundary.integration.test.ts`
- `src/lib/schemas/aircraft.ts`, `flights.ts`, `people.ts` (doc), `accounts.ts` (doc), `registry.ts`, `registry.test.ts`
- `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx`, `fleet-console.tsx`, `page.tsx`
- `src/app/[locale]/dashboard/page.tsx`
- `src/app/[locale]/dashboard/pilots/pilot-editor.tsx`, `pilot-editor-labels.ts`
- `src/app/[locale]/dashboard/instructors/instructors-console.tsx`, `page.tsx`
- `src/components/dashboard/fleet-card.tsx`
- `src/components/ui/calendar-popover.tsx`, `date-input.tsx`
- `src/styles/airops.css`
- `messages/it.json`, `messages/en.json`
- `e2e/db-fixtures.ts` (nuovo), `e2e/helpers.ts`
- `e2e/aircraft-rates.spec.ts` (riscritto), `instructor-rates.spec.ts`, `person-profiles.spec.ts`, `flights.spec.ts`, `my-account.spec.ts`, `people-management.spec.ts`, `mobile-registries.spec.ts`, `aircraft-management.spec.ts` (commento), `bookings.spec.ts`
- e2e solo fixture SQL: `aircraft-out-of-service-until`, `billing`, `exports`, `flight-log`, `flight-reversal`, `instructor-compensation`, `mobile-logbook`, `mobile-reports`, `mobile-self-public`, `mobile-settings`, `my-compensation`, `pdf-exports`, `person-detail`, `reports`, `typeahead-pickers` (`.spec.ts`)
- `_bmad-output/implementation-artifacts/19-3-tariffe-allievo-pilota-editor-velivolo.md` (questo record)

### Change Log

- 2026-11-02 — Implementazione completa della story 19.3 (`2e66d40`): modello a due prezzi e categoria sul volo, decorrenza ≥ oggi e riscrittura, profilo allievo esclusivo, PATCH composito, editor velivolo a Salva unico, primitiva calendario con minimo, card senza prezzo, seed/i18n/OpenAPI, e2e con fixture SQL. Status → review.
