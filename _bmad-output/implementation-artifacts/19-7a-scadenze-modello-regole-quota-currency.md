---
baseline_commit: 869c9cf
---

# Story 19.7a: Scadenze — modello e regole (licenza, visite mediche, quota, currency)

Status: **done** — 2026-11-02 (review SHIPPABLE-WITH-FIXES, arbitro rosso per un e2e su aggregato globale → fix `b2314e8` + docs `5a9a9eb` (F1 utilBarWidths ordinate, F2 solista non conta per l'istruttore — decisione della sessione principale da R-19-i «a bordo», F3 lock sul tipo, F4 quota per kind MEMBERSHIP, F5 tie-break); arbitro finale della sessione principale su DB fresco **548 + 1 flaky = 549, exit 0**, flaky = collisione di marca negli spec AOG, corretta a parte). Storico — **review** — 2026-11-02 (dev completato, implementazione `83c4a0c`; ready-for-dev dal 2026-11-01). Prima metà della 19.7, **divisa dalla sessione principale** in 19.7a (questa: modello, regole, funzioni di valutazione, righe Piloti) e **19.7b** (`19-7b-registro-scadenze-unificato.md`: registro Scadenze unificato con righe derivate, filtro Categoria, contatori, Panoramica, export, guardia prestazioni). **Nessuna domanda PO aperta.** **Modello dev: Opus 5 xhigh (UI)**: la story scrive codice UI sulle righe Piloti (desktop, chip mobile, sheet), sul badge di categoria del registro Scadenze, sulla landing pilota e un tocco transitorio al form della card «Visite mediche» (D-18), oltre a schema, due migrazioni, regole di dominio pure, service, API/OpenAPI, seed ed e2e. Review: **Opus 5 xhigh adversarial**. Chiave sprint-status: `19-7a-scadenze-modello-regole-quota-currency`.

> ⚠️ **Dipendenze e baseline**: ogni `file:riga` è misurato su **`869c9cf`** con `git show HEAD:<file>` (l'albero di lavoro contiene il lavoro in corso della 19.2). Il dev parte **DOPO il commit di 19.1…19.6**; la **19.7b parte dopo il commit di questa story** e ne consuma i contratti (§5.12). Le story precedenti toccano file di questa:
> - **19.2** toglie `fiscalCode` (anche da `pilots/page.tsx:78`) e il contaore (`flights.service.ts` cambia molto); riscrive `seed-load.ts` in fasi vicine a quelle toccate qui.
> - **19.3** introduce `e2e/db-fixtures.ts` (`seedAircraftRate`, `seedInstructorRate`) e `todayRome()`/`addDaysIso()` in `e2e/helpers.ts` (19.3 D-7): con queste si costruiscono i voli nel passato (le tariffe via API hanno `validFrom ≥ oggi`).
> - **19.4** riscrive l'editor pilota/istruttore a Salva unico: `LiveExpiryEditor` diventa un componente in bozza, **esporta** `assertScopeCompatible` e lascia a questa story il filtro della quota in `fetchExpiryTypes` (19.4 §6, `expiry-editor.tsx:39-45` su questa baseline).
> - **19.5** riduce `FlightType` a `TOURISM`/`SCHOOL` (irrilevante per la currency).
> - **19.6** elimina `Flight.status`/`CANCELLED` (dopo di lei ogni riga `Flight` è un volo registrato: la currency conta tutte le righe), introduce `PUT /flights/{id}` (per questo `getCurrencyStatus` accetta `excludeFlightId`) e tocca `people.service.ts:293`.
>
> **Prima di scrivere una riga**: `git log --oneline -10`, rieseguire i censimenti di §3 e correggere le righe slittate (T0).
>
> **Da leggere PRIMA**: `CLAUDE.md` (convenzioni e2e: substring di `getByLabel`/`hasText`, mai `Escape` dentro uno `SlideOver`, testid `-mobile`/`mobile-` e divieto del suffisso dove esiste un `^=`, suite solo via `scripts/e2e.sh`, env eager negli unit); `sprint-change-proposal-2026-11-01.md` §2.3, §4.0 **R-19-a/i/j/k**, §4.2 righe 19.7-19.10, **§4.5**, **§4.6**, §4.10 **A8/A16**; `19-8-impostazioni-salva-unico.md` (banner: contratto currency/quota/visite concordato con questa story); `19-4-*.md` §6, `19-3-*.md` D-7, `19-6-*.md` AD-4; `15-5-*.md` (righe Piloti, `pilotRowFlag`). Skill: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max`.

### Decisioni PO (2026-11-01) — tutte chiuse

- **Q-19.7-a = B**: le righe currency compaiono **mescolate ai documenti in ogni vista del registro Scadenze, contatori inclusi** (contro la raccomandazione A). → **19.7b**.
- **Q-19.7-b = A**: chi è tenuto alla quota e non l'ha mai pagata compare come **«Mancante»**, in ogni vista, contata come scaduta. → **19.7b**.
- **Q-19.7-c = Sì**: anche chi non ha **nessuna** visita medica registrata compare come «Visita medica — Mancante» (regola dei doppioni: 19.7b D-22). → **19.7b**.
- **Split** (sessione principale): questa story non tocca il registro Scadenze oltre a ciò che serve perché nulla si rompa (la categoria del badge da `kind`, AD-8).

**Già risolte dalla CR**: un volo da istruttore conta per la currency (§4.5, R-19-i); i voli in doppio contano per la currency dell'allievo (§4.5, A5); la scadenza mostrata è la data dell'X-esimo volo più recente **+ Y** (§4.5, D-6); le visite valgono anche per l'istruttore (R-19-j).

---

## Story

As **l'amministratore dell'aviosuperficie**,

I want che la licenza sparisca dalle scadenze, che **una qualsiasi visita medica valida** basti a chiunque sia a bordo, che la **quota associativa** sia un elemento a sé fuori dai ratings, e che la **currency** di piloti e allievi (almeno X voli negli ultimi Y giorni) sia calcolata dall'app e si veda sulle righe dei piloti,

so that le scadenze riflettano le regole ratificate (punti PO 8 e 12, R-19-i/j/k), la 19.7b possa costruire il registro unificato e le story dei check (19.9 voli, 19.10 prenotazioni) trovino pronte le funzioni di valutazione di currency, quota e visite mediche.

### Il perché

Oggi «Licenza» è un tipo di scadenza bloccante (`prisma/seed.ts:365`) e il PO ha ratificato che **non è una scadenza** (R-19-k, FR-35: resta il dato informativo `PilotProfile.licenseType`). Le tre visite hanno ciascuna un **ambito** per ruolo (`seed.ts:362-364`) e la registrazione volo pretende **quella** classe (`flights.service.ts:397-421`): un pilota con una classe 1 valida viene bloccato perché gli manca la classe 2. Il PO ha ratificato il contrario: **basta una visita valida di qualsiasi classe** (R-19-j). La quota è un rating qualunque (kind `RATING`, `seed.ts:371`): compare nella card «Ratings» delle Impostazioni e in Scadenze porta l'etichetta «Abilitazione» (`expiry-status.ts:106-111` classifica per **sottostringa del nome**). La currency non esiste.

### Fatti misurati che vincolano il design (su `869c9cf`)

| Fatto | Misura | Conseguenza |
|---|---|---|
| Mettere le 3 visite a `scope = ALL` **bloccherebbe ogni volo** | `findMissingBlockingDocuments` pretende **ogni** tipo bloccante attivo con scope `ALL` o del ruolo (`flights.service.ts:401-409`) | la regola «almeno una MEDICAL valida» entra **dentro** le scansioni esistenti, nello stesso commit della migrazione (AD-3) |
| L'ambito guida tre punti di codice | `assertScopeCompatible` (`expiries.service.ts:156-171`), `isExpiryScopeCompatible` (`src/lib/expiry-scope.ts:12-17`), `assertExpiryTypesValidForComposite` (`people.service.ts:412-437`) | con le MEDICAL **tutte** a `ALL` per invariante (AD-2) i tre punti restano corretti **senza toccarli**: `ALL` passa ovunque e i chip offrono ogni visita a chiunque — esattamente R-19-j |
| La categoria in Scadenze si deduce dal **nome** | `categoryOf()` (`expiry-status.ts:106-111`); etichette italiane cablate (`scadenze-console.tsx:39`, `:152`) | quota fra le «Abilitazioni», anche nel KPI «Ratings» della landing (`dashboard/page.tsx:1043`); la categoria deve venire da `kind` (AD-8) |
| La quota è riconosciuta per **nome** in tre punti | upsert in `membership.service.ts:140-145`; filtro chip in `expiry-editor.tsx:44`; costante in `src/lib/expiry-scope.ts:29` | un `kind` dedicato (D-1) toglie i confronti per nome dai lettori |
| `ALTER TYPE … ADD VALUE` non è usabile nella stessa transazione | precedente 12.2 (`20260714090000_booking_approval_workflow`, commento a `:12`); la 13.1 l'ha evitato solo perché creava un tipo nuovo (`20260722190000_add_expiry_type_kind/migration.sql:2-8`) | **due** migrazioni (AD-1) |
| Le prenotazioni non controllano i documenti **mancanti** | `findBlockingExpiredDocuments`: solo scadute, solo la persona (`bookings.service.ts:465-479`); chiamanti `:685`, `:1068`, `:1344` | la regola mediche si applica **dentro** quella semantica (D-5) |
| Il badge Piloti legge **tutti** i documenti bloccanti entro 30 giorni | `listBlockingExpiriesByPerson` filtra `expiresAt ≤ oggi+30` in SQL (`expiries.service.ts:547-567`) | le MEDICAL vanno lette tutte e ridotte alla migliore prima del filtro (AD-3, §5.4) |
| L'e2e helper registra un'idoneità per **ogni** tipo bloccante applicabile | `ensureValidSeedExpiries` (`e2e/helpers.ts:56-77`) | dopo la migrazione registrerebbe tutte e tre le visite e renderebbe impossibile «persona con sola visita scaduta» (`flights.spec.ts:934-941`) → una visita sola, se la persona non ne ha (AD-9) |
| Lo spec usa il seme «Licenza» in 2 punti | `flights.spec.ts:1198` (testo a `:1209`), `mobile-registries.spec.ts:891`, `:923` | riscritti su un tipo che esiste ancora (§3.6) |
| Nessun «oggi di Roma» nel codice scadenze | `expiries.service.ts` usa `todayDateOnlyUtc()` | la currency usa la data di Roma (A16, `todayDateOnlyInZone(APP_TIMEZONE)`, `zoned-time.ts:178`); il resto resta alla 16.9 |

---

## §0 — Requisiti fissi e ratifiche

### §0.1 Contratto

| # | Requisito |
|---|---|
| **P1** | **Licenza**: tipo eliminato con le sue righe, e la categoria «Licenza» in Scadenze (R-19-k). |
| **P2** | **Visite mediche senza ambito**: basta **una** visita valida di qualsiasi classe, per chiunque sia a bordo (R-19-j); le scansioni bloccanti **esistenti** di voli e prenotazioni applicano la regola nuova, così nulla si rompe prima della 19.9. |
| **P3** | **Quota associativa** come elemento a sé (tipo `MEMBERSHIP` di sistema): fuori dai ratings, 12 mesi dal pagamento con rinnovo cumulativo `max(oggi, scadenza) + 12 mesi` (come oggi), dovuta da piloti, allievi e istruttori (R-19-k, §4.6). La sua presenza nel registro con la riga «Mancante» è della 19.7b. |
| **P4** | **Currency** derivata, mai salvata: current con almeno X voli registrati negli ultimi Y giorni in cui la persona è a bordo (come pilota/allievo o istruttore); X e Y in AppSetting (predefiniti 1 e 90); vale per piloti e allievi (R-19-i, §4.5). |
| **P5** | Currency visibile **sulle righe pilota/allievo** (§4.5). Nel registro Scadenze: 19.7b. Nessuna email (A8). |
| **P6** | Funzioni di valutazione riusabili dalla 19.9/19.10 e dalla 19.7b: stato currency di una persona a una data, stato quota, esito della regola mediche — **senza** avviso né deroga. |

### §0.2 Ratifiche vincolanti

| R | Decisione | Effetto qui |
|---|---|---|
| **R-19-a** | DB di test, migrazioni distruttive ammesse. | AD-1. |
| **R-19-i** | Currency per piloti e allievi, X e Y configurabili; chi non è current vola solo con istruttore. | P4, AD-5. Il divieto del volo solista è della **19.9/19.10**. |
| **R-19-j** | Una visita valida di qualsiasi classe, per chiunque sia a bordo. | P2, AD-3. |
| **R-19-k** | Quota 12 mesi per tutti; licenza eliminata. | P1, P3, AD-4. |
| **§4.5** | Stato derivato; scadenza = quando l'X-esimo volo più recente esce dalla finestra; volo con istruttore conta. | D-6. |
| **§4.6** | Quota fuori dalla card Ratings; importo in Impostazioni; l'`override` dell'addebito si allinea al pattern unico §4.4. | **Confine**: Impostazioni = **19.8**; `override` (`membership.service.ts:111-129`) = **19.9/19.10**. |
| **A8**, **A16** | Currency senza email; «oggi» nuovo = Roma. | D-9. |
| **16.4 superseded** | «Tipo disattivato non blocca» → 19.9/19.10. | Qui la semantica `isActive` delle scansioni per tipo resta com'è; per le MEDICAL vale D-4. |

**Superati da questa story** (da non «ripristinare»): story 6.1 AC 1 per «la licenza fra i tipi standard»; story 7.4 per «ogni visita è un documento bloccante a sé» (ora requisito unico, D-4); story 13.1 R-13.1-a per «le visite hanno un ambito»; story 13.2 review F3 per «la quota si esclude per nome» (ora per `kind`); review 14.4 F5 / R-14.4-a per «una visita del proprio ambito mancante blocca» (ora blocca solo **nessuna** visita); story 12.11/12.12 per `categoryOf` per sottostringa del nome.

### §0.3 Scelte prese su delega (nessuna è un'assunzione di dominio nuova)

| ID | Scelta | Riconducibile a | Alternativa scartata |
|---|---|---|---|
| **D-1** | La quota diventa **`ExpiryTypeKind.MEMBERSHIP`** sulla riga «Quota associativa»: stessa tabella, stesse righe `Expiry`, stesso rinnovo. Tipo **di sistema**: nessuna API lo crea, lo modifica o lo cancella (AD-4). | R-19-k: un `kind` la separa dai ratings in ogni lettore che già divide per `kind` (`settings/page.tsx:162-163`, `expiry-editor.tsx:41`) e tiene registro, promemoria e scheda persona | colonna o tabella dedicata: rifà ciò che esiste; costante per nome: la quota resta fra i ratings ovunque la costante non sia nota |
| **D-2** | Licenza: la migrazione cancella righe `Expiry` e tipo **per nome esatto** `'Licenza'` (`ExpiryUpdateProposal` e `SentAlert` in cascata, `schema.prisma:1462`, `:1512`). `PilotProfile.licenseNumber/licenseType` restano (KPI «Licenza» della landing, `dashboard/page.tsx:1107-1108`). | R-19-k + R-19-a; backfill per nome esatto (`20260709120000_add_booking_expiry_block/migration.sql:7`, `20260722190000_add_expiry_type_kind/migration.sql:25`) | sottostringa: cancellerebbe tipi custom |
| **D-3** | «Senza ambito» è un **invariante dei dati**: ogni `MEDICAL` ha `scope = 'ALL'` e `blocksBooking = true`; migrazione + service (valori omessi = quelli fissi; espliciti e diversi = 422 `MEDICAL_TYPE_FIELDS`). `scope` resta NOT NULL. | con `ALL` i tre punti che leggono l'ambito restano corretti senza toccarli (la 19.4 si aspettava di cambiare `assertScopeCompatible`: non serve, §5.6) | `scope` nullable: ogni DTO, export, sheet e helper gestirebbe il `null` |
| **D-4** | **Regola mediche**: requisito per chiunque sia a bordo **se esiste almeno un tipo MEDICAL attivo**; soddisfatto da **una** riga `Expiry` MEDICAL (tipo attivo o no) con `expiresAt ≥ data` (il giorno di scadenza è valido). Se fallisce produce **un solo** documento: la visita scaduta più recente (`typeName`, `expiresAt`), oppure — nessuna visita registrata — un documento «mancante» con `typeName` = nomi dei tipi MEDICAL attivi in ordine alfabetico uniti da `' / '` e `expiresAt: null`. `blocksBooking` non si legge sui MEDICAL; MEMBERSHIP non entra mai nelle scansioni per tipo. | R-19-j. «Almeno un tipo attivo» evita il vicolo cieco di un'installazione senza visite. Il documento «mancante» unico riusa la forma `{ typeName, expiresAt: null }` che la UI già rende (`flight-editor.tsx:185-197`) | elencare ogni classe mancante: «servono tutte e tre»; un nome italiano cablato nel server |
| **D-5** | Le scansioni **mantengono la loro semantica** e cambiano solo per le MEDICAL: prenotazioni = solo scadute, solo la persona (senza visite **non** bloccata, come oggi); voli = scadute + mancanti, persona + istruttore. Le visite non producono più `warnings` nelle prenotazioni. | Confine con la 19.9/19.10 | estendere ora i mancanti alle prenotazioni: perimetro della 19.10 |
| **D-6** | **Finestra della currency**: a una data D contano i voli con `flightDate` in **[D − Y, D]**, ciascuno singolarmente (due lo stesso giorno contano 2); `expiresAt` = data dell'X-esimo volo più recente ≤ D **+ Y giorni** (ultimo giorno valido); current ⇔ `expiresAt ≠ null ∧ D ≤ expiresAt` ⇔ voli nella finestra ≥ X. Granularità a giorno; i voli dopo D non contano. | §4.5; `Flight.flightDate @db.Date`; voli futuri impossibili (`FLIGHT_DATE_IN_FUTURE`, `flights.service.ts:785`) | finestra (D − Y, D]: contraddice «Y giorni dall'ultimo volo» |
| **D-7** | **A bordo** = `Flight.personId = P` oppure l'istruttore del volo è P (`Flight.instructorProfileId` → `InstructorProfile.personId`); un volo conta una volta per persona (`UNION`). | R-19-i, §4.5 | — |
| **D-8** | **Soggetti currency**: non archiviati, con profilo pilota **o** allievo attivo. Un istruttore senza profilo pilota non ha currency. | R-19-i | — |
| **D-9** | «Oggi» della currency = data di Roma (`todayDateOnlyInZone(APP_TIMEZONE)`), server e client. Il resto del modulo scadenze resta su `todayDateOnlyUtc()` (16.9). | A16 | — |
| **D-10** | **Impostazioni currency** (contratto **concordato con la 19.8**, banner di `19-8-impostazioni-salva-unico.md`): chiavi `currency.minFlights` (X, 1-99, predefinito 1) e `currency.windowDays` (Y, 1-3650, predefinito 90); `getCurrencySettings()` senza gate; `writeCurrencySettingsCore(tx, input)` esportata senza `authorize`; `setCurrencySettings(actor, input)` = `authorize(settings.manage)` + core; `currencySettingsSchema` in `src/lib/schemas/settings.ts`. **Nessuna** route né UI (sono della 19.8). | Confine CR + pattern della 19.8 per il suo endpoint composito atomico (A17) | una route PUT qui: la 19.8 la sostituirebbe |
| **D-12** | La categoria viene da **`kind`**, mai dal nome: `categoryOf(typeName)` si elimina; le righe del registro portano `category` (= `kind` del tipo), quelle di `GET /people/{id}/expiries` portano `typeKind`; il badge diventa i18n. Landing pilota: «Scadenza medico» = visita con `expiresAt` **più lontana**, «Ratings» = solo `kind = RATING`. | il fatto misurato; è il minimo perché la quota non diventi un'«Abilitazione» e perché sparisca la categoria «Licenza» (P1) | tenere il nome come euristica: due fonti di verità |
| **D-13** | Badge Piloti per le MEDICAL: le visite di una persona si riducono alla **migliore** (expiresAt massima) prima della soglia dei 30 giorni; i ratings bloccanti restano per tipo. | D-4 | — |
| **D-14** | Righe Piloti: currency nella cella «Ultimo volo» (desktop) e nel chip unico della riga mobile, con soglie `tierOf`: **Non current** (rosso) se non current; **Currency Ngg** (giallo) se current e scade entro 30 giorni; niente oltre. Nello sheet mobile una riga «Currency» sempre presente per pilota/allievo. La data «Ultimo volo» **non cambia significato**. | §4.5; R-15.5-c | una colonna in più nella griglia a 7 colonne misurate (`pilots-console.tsx:314`) |
| **D-18** | Nella card «Visite mediche» attuale (`ratings-card.tsx`, `kind="MEDICAL"`) spariscono dal **form** il select dell'ambito e il checkbox «Blocca prenotazioni», e il body non li manda più. Unico tocco alla UI Impostazioni. | senza, la creazione di una visita dalla card darebbe 422 fino alla 19.8 (il form manda `blocksBooking: false` per predefinito, `ratings-card.tsx:530`); `expiry-types.spec.ts:116` sceglie l'ambito «Piloti» per una visita | lasciare il 422 transitorio; un service che ignora in silenzio il body |

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — DUE migrazioni forward, dopo l'ultima presente (19.6)

1. `prisma/migrations/<ts>_expiry_kind_membership/migration.sql` — **solo** `ALTER TYPE "ExpiryTypeKind" ADD VALUE 'MEMBERSHIP';`, commento in testa con story, R-19-k e motivo della divisione (precedente 12.2).
2. `prisma/migrations/<ts+1>_expiries_licence_medical_membership/migration.sql` — commento in testa (story, R-19-a/j/k, pattern TD-2) e, nell'ordine:

```sql
-- 1. Licence is no longer an expiry (R-19-k): rows first (proposals and SentAlert cascade), then the type.
DELETE FROM "Expiry" WHERE "expiryTypeId" IN (SELECT "id" FROM "ExpiryType" WHERE "name" = 'Licenza');
DELETE FROM "ExpiryType" WHERE "name" = 'Licenza';
-- 2. Medical visits have no scope and always count toward the requirement (R-19-j, D-3).
UPDATE "ExpiryType" SET "scope" = 'ALL', "blocksBooking" = true WHERE "kind" = 'MEDICAL';
-- 3. The membership fee is its own kind (R-19-k, D-1), never a per-type blocking document.
UPDATE "ExpiryType" SET "kind" = 'MEMBERSHIP', "scope" = 'ALL', "blocksBooking" = false, "isActive" = true WHERE "name" = 'Quota associativa';
```

Nessun altro DDL (gli invarianti li garantisce il service, AD-2; `prisma migrate diff` resta vuoto). `schema.prisma`: valore `MEMBERSHIP` e doc-comment riscritti su `ExpiryScope` (`:1277-1288`, non vale per le MEDICAL), `ExpiryTypeKind` (`:1290-1300`, tre valori, MEMBERSHIP di sistema), `ExpiryType` (`:1302-1370`: via «licenza» dai tipi standard, `blocksBooking` letto solo per i RATING, `:1339-1352`).

**Prova nel record**: DB gemello popolato (`prisma migrate reset` sul baseline pre-19.7a + `npx prisma db seed` + `npm run seed:demo`), conteggi prima/dopo (`Expiry` per tipo, `ExpiryUpdateProposal`, `SentAlert`, tipi per `kind`/`scope`), `migrate diff` vuoto, `SELECT "name","kind","scope","blocksBooking","isActive" FROM "ExpiryType" ORDER BY 1`.

### AD-2 — Invarianti del catalogo

| Invariante | Chi lo garantisce |
|---|---|
| Nessun tipo «Licenza» seminato | migrazione + `seed.ts`, `seed-demo.ts`, `seed-load.ts` |
| `kind = MEDICAL` ⇒ `scope = ALL` ∧ `blocksBooking = true` | migrazione + `expiry-types.service.ts` su create/patch (AD-7) + seed |
| Esattamente un tipo `MEMBERSHIP` (nome `MEMBERSHIP_FEE_TYPE_NAME`, `ALL`, `blocksBooking = false`, attivo) | migrazione + seed + `chargeMembershipFee` (upsert **per nome**, protetto dall'unicità di `name`) + il service che rifiuta `kind: MEMBERSHIP` in scrittura e blocca PATCH/DELETE su quel tipo |
| Le scansioni per tipo (`blocksBooking`) leggono solo `kind = RATING` | AD-3 |

### AD-3 — Regola mediche: funzione pura, helper di service, due scansioni aggiornate

- **Pura** — `src/lib/medical-requirement.ts` (nessun import di service):
  `evaluateMedicalRequirement(input: { activeMedicalTypeNames: string[]; medicals: Array<{ typeName: string; expiresAt: string }> }, dateOnly: string): { typeName: string; expiresAt: string | null } | null` — `null` = requisito non attivo **o** soddisfatto; altrimenti il documento unico di D-4. Confronto su stringhe `YYYY-MM-DD` (convenzione di `bookings.service.ts:474`); `expiresAt === dateOnly` è valida.
- **Service** — `expiries.service.ts`: `getMedicalRequirementFailure(personId: string, dateOnly: string)` (nomi dei tipi MEDICAL attivi + righe MEDICAL della persona → la funzione pura). Senza attore, come `findBlockingExpiredDocuments`. Esportata per 19.9/19.10.
- **Prenotazioni** — `findBlockingExpiredDocuments` (`bookings.service.ts:465-479`): la select prende `kind`; la partizione per `blocksBooking` si applica ai soli `kind ≠ MEDICAL` (MEMBERSHIP resta un `warning` come oggi); le MEDICAL escono dai `warnings` e, se `getMedicalRequirementFailure` restituisce un documento **con** `expiresAt ≠ null`, quello si aggiunge a `blockingDocuments`. Il documento «mancante» **non** si aggiunge (D-5).
- **Voli** — `findMissingBlockingDocuments` (`flights.service.ts:397-421`): i tipi applicabili prendono `kind: 'RATING'`; in coda, se `getMedicalRequirementFailure` restituisce un documento con `expiresAt === null`, lo aggiunge. Firma `(personId, applicableProfiles, flightDateOnly)`; `scanBlockingDocuments` (`:441-462`) la passa per persona **e** istruttore. Scaduto da una funzione, mancante dall'altra: **mai due volte**.
- **Badge Piloti** — `listBlockingExpiriesByPerson` (`expiries.service.ts:547-567`): RATING bloccanti entro l'orizzonte (come oggi, con `kind: 'RATING'`) + **tutte** le MEDICAL degli id della pagina; per persona la MEDICAL migliore entra solo se entro l'orizzonte (D-13). Forma restituita invariata.

### AD-4 — Quota associativa

- `membership.service.ts`: upsert **per nome** come oggi, il `create` scrive `kind: 'MEMBERSHIP'`; doc-comment aggiornati. Rinnovo, `SentAlert`, lock, `override` e 422 **invariati**.
- **Nuova** `getMembershipStatus(personId: string, dateOnly: string): Promise<{ status: 'valid' | 'expired' | 'missing'; expiresAt: string | null }>` — riga `Expiry` di `kind = MEMBERSHIP`; `valid` ⇔ `expiresAt ≥ dateOnly`. Senza attore; esportata per 19.9/19.10.
- `MEMBERSHIP_FEE_TYPE_NAME` (`src/lib/expiry-scope.ts:29`) resta chiave dell'upsert e del seed (doc-comment senza «esclusa dai chip per nome»). Il filtro per nome in `fetchExpiryTypes` (`expiry-editor.tsx:44`, o dove la 19.4 l'ha spostato) **si elimina**.
- Tipo MEMBERSHIP **bloccato**: `PATCH`/`DELETE /api/v1/expiry-types/{id}` → **409 `MEMBERSHIP_TYPE_LOCKED`** (dopo il 404, prima di ogni altra validazione).

### AD-5 — Currency

- **Impostazioni** (D-10), in `app-settings.service.ts` (accanto alla quota, `:329-374`): `getCurrencySettings()` (senza gate, predefiniti applicati, valore salvato fuori limiti → predefinito con `console.warn`, mai un'eccezione); `writeCurrencySettingsCore(tx: Prisma.TransactionClient, input: CurrencySettingsInput): Promise<void>` (esportata, nessun `authorize`, solo i due upsert su `tx`); `setCurrencySettings(actor, input)` = `authorize(actor, 'settings.manage')` + core in `prisma.$transaction`. Predefiniti `{ minFlights: 1, windowDays: 90 }` come costante di `src/lib/currency.ts`; `currencySettingsSchema` + `CurrencySettingsInput` in `src/lib/schemas/settings.ts` (⚠️ quel file importa `@/lib/env` eager: `src/lib/currency.ts` **non** lo importa).
- **Pura** — `src/lib/currency.ts`: `computeCurrency(flightDates: string[], atDate: string, settings: { minFlights: number; windowDays: number }): { current: boolean; expiresAt: string | null; lastFlightDate: string | null; flightsInWindow: number }` — scarta le date `> atDate`, ordina, aritmetica con `addDaysDateOnly` (`zoned-time.ts:147`). È l'implementazione di riferimento di D-6; la 19.7b ne scriverà una gemella in SQL e la controllerà contro questa sulla stessa fixture (doc-comment che lo dice).
- **Service** — `src/server/services/currency.service.ts`:
  - `loadOnBoardFlightDates(personIds: string[], atDate: string, settings, excludeFlightId?: string)` — `$queryRaw` con `Prisma.join` (precedente `flights.service.ts:1679`): `UNION` fra `Flight.personId` e `InstructorProfile.personId` del volo, `flightDate ≤ atDate`, per persona le righe con `ROW_NUMBER() OVER (PARTITION BY personId ORDER BY flightDate DESC, id DESC) ≤ minFlights` **oppure** `flightDate ≥ atDate − windowDays` → `Map<personId, string[]>`; date passate come stringhe con cast `::date` (§5.8);
  - `getCurrencyStatus(personId: string, atDate: string, options?: { excludeFlightId?: string })` — senza attore; esportata per 19.9/19.10;
  - `listCurrencyByPerson(actor, personIds, today)` — gate `people.read` (stessa ragione di `listBlockingExpiriesByPerson`): solo i soggetti D-8 fra gli id dati → `Map<personId, { current: boolean; expiresAt: string | null; daysUntil: number | null }>`.

### AD-6 — UI: pagina Piloti (`pilots/page.tsx`, `pilots-console.tsx`, `src/lib/mobile-registries.ts`)

- `pilots/page.tsx` chiama `listCurrencyByPerson(actor, ids, todayRome)` accanto a `listBlockingExpiriesByPerson` (`:50-56`) e passa `currencyById` alla console.
- Desktop, cella «Ultimo volo» (`:390`): la data come oggi e sotto, se serve, un `Badge` — `bad` «Non current», `warn` «Currency Ngg» se current e `daysUntil ≤ 30`; testid `pilot-currency-{id}` (§5.13). Colonna di 110 px (`:314`): badge sotto la data, nessun trabocco (verifica a 1280 e 1024 px).
- Mobile: `pilotRowFlag` (`mobile-registries.ts:65-78`) riceve `currency: { current: boolean; daysUntil: number | null } | null` e due chip nuovi (`currencyExpired`, `currencyExpiring`). Priorità: sospeso → documento scaduto → currency non current → il più urgente fra documento in scadenza e currency in scadenza (parità → documento). Funzione pura testata a unità.
- Sheet (`pilotSheetRows`, `:664-688`): riga «Currency» per un soggetto D-8: «Fino al {date}» / «Scaduta il {date}» / «Nessun volo utile».

### AD-7 — Contratto API

| Endpoint | Cambia |
|---|---|
| `POST /api/v1/expiry-types` | `kind` accetta solo `RATING`/`MEDICAL` (`expiryTypeKindInputSchema`; `MEMBERSHIP` → 422 `VALIDATION_ERROR`). `scope` e `blocksBooking` **opzionali senza default Zod**, risolti dal service per `kind`: MEDICAL → `ALL`/`true` se omessi, **422 `MEDICAL_TYPE_FIELDS`** se espliciti e diversi; RATING → `scope` omesso = `ALL`, `blocksBooking` omesso = `false` (allentamento retrocompatibile). La lista «Visite mediche» della 19.8 manderà solo `{ name, kind: 'MEDICAL', validityMonths }`. |
| `PATCH /api/v1/expiry-types/{id}` | 404 → **409 `MEMBERSHIP_TYPE_LOCKED`** sul tipo MEMBERSHIP → `kind` del body come sopra → stato **risultante** MEDICAL con `scope ≠ ALL` o `blocksBooking = false` → **422 `MEDICAL_TYPE_FIELDS`**. |
| `DELETE /api/v1/expiry-types/{id}` | 409 `MEMBERSHIP_TYPE_LOCKED` (dopo il 404, prima del controllo «in uso»). |
| `GET /api/v1/expiry-types` | query `kind` accetta anche `MEMBERSHIP`; item con `kind` a tre valori. |
| `GET /api/v1/expiries` (+ `/pdf`) | item: nuovo campo **`category`: `'MEDICAL' \| 'RATING' \| 'MEMBERSHIP'`** (= `kind` del tipo). Additivo; la 19.7b lo estenderà con `'CURRENCY'` e le righe derivate. |
| `GET /api/v1/people/{id}/expiries` | item: nuovo `typeKind`. |

I rifiuti MEMBERSHIP/MEDICAL sono **controlli semplici dentro** create/update/delete di `expiry-types.service.ts` (la 19.8 li estrae in core transazionali, §5.10). OpenAPI (`registry.ts:1229-1370`) aggiornato; nessun path nuovo.

### AD-8 — Lettori della categoria e altri tocchi minimi

- `src/lib/expiry-status.ts:96-111`: `categoryOf` ed `ExpiryCategory` **si eliminano**.
- Registro Scadenze (`scadenze-console.tsx`): il badge legge `item.category` con etichette i18n `ExpiriesPage.registry.category.{MEDICAL,RATING,MEMBERSHIP}` e toni `info`/`warn`/`''` (`:39`, `:151-152`, `:488`, `:696`); `expirySheetSub` (`src/lib/mobile-expiries.ts`) riceve l'etichetta già tradotta. Nient'altro del registro cambia (sorgente, filtri, contatori: 19.7b).
- `dashboard/page.tsx:1039-1043` (landing pilota): visita con `expiresAt` massima fra `typeKind === 'MEDICAL'`; ratings = `typeKind === 'RATING'`.
- `ratings-card.tsx`: solo il form con `kind === 'MEDICAL'` (D-18; body `:539-545`, predefinito `:530`).
- Seed: `prisma/seed.ts:338-381`, `seed-demo.ts:107-125` e `:232-237`, `seed-load.ts:1231`, `:1264` — via Licenza, visite `scope: 'ALL'`, quota `kind: 'MEMBERSHIP'`.

### AD-9 — Helper e2e

- `ensureValidSeedExpiries` (`e2e/helpers.ts:56-77`): i RATING bloccanti applicabili coperti uno per uno come oggi; per le MEDICAL **una sola** visita (la prima attiva per nome) e **solo se** la persona non ne ha già una. Doc-comment (`:13-55`) riscritto (via «plus "Licenza"», regola D-4, ordine per le visite: **prima** la visita voluta, **poi** l'helper — l'inverso di `:32-40` per i tipi custom).
- **Nuovo** helper riusabile dalla 19.7b: `registerFlightOn(page, { aircraftId, personId, instructorPersonId?, flightType, date })` in `e2e/helpers.ts` — `POST /api/v1/flights` con decollo alle 10:00 di Roma del giorno dato (il velivolo deve avere una tariffa a quella data via `seedAircraftRate` della 19.3, e l'istruttore una tariffa via `seedInstructorRate`).

---

## §2 — Acceptance Criteria

### Schema, migrazioni, seed

1. **Migrazioni** come AD-1. Sul gemello popolato: righe del tipo Licenza = 0, le altre righe `Expiry` **invariate per numero e per tipo**, `ExpiryUpdateProposal`/`SentAlert` delle righe Licenza spariti (conteggi nel record); catalogo finale: nessuna «Licenza», le 3 visite `MEDICAL/ALL/true`, «Quota associativa» `MEMBERSHIP/ALL/false/attivo`, ratings invariati; `migrate diff` vuoto.
2. **Seed**: `npx prisma db seed` su DB fresco dà lo stesso catalogo; `npm run seed:demo` non registra licenze; `grep -rn "'Licenza'" prisma src e2e scripts` → solo `prisma/migrations/**`; `seed-load.ts` riletto senza Licenza. Nel record la distribuzione currency di piloti/allievi demo (current / ≤ 30 / non current); se uno dei tre stati manca, spostare il `daysAgo` di **un** volo demo (`seed-demo.ts:437`) e dire quale.

### Catalogo (API)

3. `POST /expiry-types` `{ kind: 'MEDICAL', scope: 'PILOTS', … }` → 422 `MEDICAL_TYPE_FIELDS`; `{ kind: 'MEDICAL', blocksBooking: false, … }` → 422; `{ name, kind: 'MEDICAL' }` → 201 con `ALL`/`true`; `{ name }` → 201 con `ALL`/`false`; `{ name, scope: 'INSTRUCTORS' }` → 201 come oggi. `PATCH` di una visita con `{ scope: 'STUDENTS' }` → 422; `PATCH` di un RATING `PILOTS` con `{ kind: 'MEDICAL' }` → 422, con `{ kind: 'MEDICAL', scope: 'ALL', blocksBooking: true }` → 200. **UI transitoria** (D-18): il form della card «Visite mediche» non ha più `medical-scope-select` né «Blocca prenotazioni»; creare e rinominare una visita dalla card funziona (`expiry-types.spec.ts:105-140` riscritto e verde); il form «Ratings» invariato (`rating-scope-select`, `mobile-settings.spec.ts:512`, `:586`). Unit + almeno un e2e API.
4. `POST`/`PATCH` con `kind: 'MEMBERSHIP'` → 422 `VALIDATION_ERROR`; `PATCH` (anche `{ isActive: false }`) e `DELETE` sul tipo quota → 409 `MEMBERSHIP_TYPE_LOCKED`; `GET ?kind=MEMBERSHIP` → un elemento; `GET ?kind=RATING` → nessuna quota. Unit + e2e API.

### Visite mediche (R-19-j)

5. **Unit pura** `evaluateMedicalRequirement`: (a) nessun tipo attivo → `null` anche con sole scadute; (b) valida + scaduta → `null`; (c) `expiresAt === dateOnly` → valida; (d) giorno prima → scaduta; (e) sole scadute → la **più recente** (a parità di data, nome minore); (f) nessuna visita → `{ typeName: 'A / B / C' (alfabetico, soli tipi attivi), expiresAt: null }`.
6. **Voli** (e2e API, data volo = ieri di Roma, tariffa via fixture SQL): (a) pilota con classe 2 scaduta e classe 1 valida → **201** (prima: 422); (b) sola classe 2 scaduta → 422 `FLIGHT_BLOCKED_BY_EXPIRY` con **un** documento (classe 2, la sua data, `role: 'person'`); (c) nessuna visita (helper **non** chiamato) → 422 in cui **esattamente un** documento ha `expiresAt: null` e `typeName` = nomi delle visite attive uniti da `' / '` (gli altri, se ci sono, sono ratings custom ambientali); (d) Scuola: allievo con LAPL valida, istruttore con sola classe 1 scaduta → 422 con un documento `role: 'instructor'`; (e) allievo con classe 2 valida, istruttore con LAPL valida → 201.
7. **Prenotazioni**: (a) classe 2 scaduta + classe 1 valida → nessun `EXPIRED_DOCUMENTS`, nessun `warning` di visita (e2e); (b) sole classe 2 e LAPL scadute → 422 `EXPIRED_DOCUMENTS` con **un** documento, la più recente (unit); persona senza visite non bloccata (unit, D-5).
8. **Ratings bloccanti invariati**: gli e2e su un RATING custom `blocksBooking: true` (`flights.spec.ts` «Blocking expiry guard-rail», `bookings.spec.ts` `createExpiryTypeForBooking`) restano verdi senza modifiche alla loro logica.
9. **Badge Piloti** (unit su `listBlockingExpiriesByPerson`): classe 2 scaduta + classe 1 a +200 → nessuna voce; sola classe 2 a −12 → voce; classe 1 a +20 e classe 2 a −5 → voce classe 1 a +20. `mobile-registries.spec.ts:355-380` verde.

### Quota associativa (R-19-k)

10. `chargeMembershipFee` su un DB senza tipo quota lo crea con `kind: 'MEMBERSHIP'`; col tipo presente non lo modifica; rinnovo cumulativo invariato (`membership-fee.spec.ts`, `mobile-membership-fee.spec.ts` verdi). Unit su `getMembershipStatus`: `expiresAt === dateOnly` → `valid`; giorno prima → `expired`; nessuna riga → `missing`; riga di un altro tipo non conta.
11. **Fuori dai ratings, categoria propria**: nessuna riga «Quota associativa» nella card «Ratings» (`expiry-types.spec.ts:56-58` riscritto: conteggio 0); nessun chip quota negli editor (guardia di `people-management.spec.ts:354-361` su `?kind=MEMBERSHIP`); nel registro Scadenze una quota addebitata a una persona di fixture porta il badge «Quota associativa» (e2e, `window=all` + ricerca per nome); `grep -rn MEMBERSHIP_FEE_TYPE_NAME src` → solo `expiry-scope.ts`, `membership.service.ts`.

### Currency (R-19-i)

12. **Impostazioni** (unit): chiavi assenti → `{ 1, 90 }`; valore non intero o fuori limiti → predefinito di quel campo e `console.warn`; `setCurrencySettings` senza `settings.manage` → `ForbiddenError` prima di ogni query; `writeCurrencySettingsCore` scrive solo sul `tx` ricevuto e non chiama `authorize`; lo schema rifiuta 0, negativi, decimali, X > 99, Y > 3650.
13. **Unit pura** `computeCurrency` (X=1, Y=90 salvo dove detto): volo a D−90 → current, `expiresAt = D`, `flightsInWindow = 1`; D−91 → non current, `expiresAt = D−1`; nessun volo → `{ false, null, null, 0 }`; **X=2**: D−10 e D−91 → non current, `expiresAt = D−1`, `flightsInWindow = 1`; X=2, D−10 e D−90 → current, `expiresAt = D`; X=2, **due voli lo stesso giorno** D−5 → current, `expiresAt = D+85`; X=3 con due voli → `expiresAt: null`; voli dopo `atDate` ignorati; Y=1: volo a D−1 → current, `expiresAt = D`; su tutti i casi `current === (flightsInWindow >= minFlights)`.
14. **`getCurrencyStatus`** (unit, prisma e impostazioni mockati): un volo da istruttore conta come uno da pilota; `excludeFlightId` lo toglie; impostazioni lette a ogni chiamata; `atDate` passata così com'è alla query.
15. **Righe Piloti** (e2e, persone di fixture con suffisso comune, voli con `registerFlightOn`, date di Roma): A pilota con un volo a oggi−90 → badge desktop «Currency 0gg»; B allievo con un volo in doppio a oggi−91 → «Non current»; C pilota senza voli → «Non current»; D pilota+istruttore con un solo volo **da istruttore** a oggi−10 → nessun badge (80 giorni); E istruttore senza profilo pilota → nessun badge. A 375 px il chip di C dice «Non current» e lo sheet di A ha «Currency: Fino al <oggi>». Unit su `pilotRowFlag` per ogni ramo di priorità (sospeso > documento scaduto > currency non current > più urgente fra i due «in scadenza», parità → documento; currency current a 31 giorni → nessun chip).

### Categoria da `kind`, landing, prestazioni

16. `category` negli item di `GET /api/v1/expiries` e `typeKind` in quelli di `GET /people/{id}/expiries`; `grep -rn "categoryOf\|ExpiryCategory" src` → 0; badge di categoria del registro tradotti in IT ed EN (e2e su `/en/dashboard/expiries` per almeno un badge); landing pilota con classe 2 scaduta e classe 1 valida → «Scadenza medico» = classe 1, e la quota non compare fra i «Ratings».
17. **Misura** (non soglia) della lettura di `listCurrencyByPerson` su 20 id: `EXPLAIN (ANALYZE, BUFFERS)` della `SELECT` sul DB di carico **in sola lettura** (`SELECT current_database()` nel record; mai scritture, migrazioni o indici su quel DB; letterali adattati se lo schema è più vecchio, dichiarandolo). Tempo nel record.

### Residui, contratti, gate

18. Nessun residuo: `grep -rni "licenz" src --include=*.ts --include=*.tsx` → solo `licenseNumber`/`licenseType`/`kpis.license` e affini; `grep -rn "'Licenza'" e2e` → 0.
19. **i18n**: chiavi di §3.8 in **entrambi** i file; parità verde; nessuna chiave orfana introdotta.
20. **Unit**: `npm run gates` verde; ogni file di test nuovo o toccato passa anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.
21. **e2e**: arbitro completo verde su DB fresco via `scripts/e2e.sh` (conteggio prima/dopo, test nuovi/cambiati elencati).
22. **Verifica UI** (Playwright MCP o script throwaway in /tmp): pagina Piloti con i tre stati del badge (desktop e 375 px, chip e sheet), badge di categoria nel registro Scadenze, card «Visite mediche» col form ridotto, landing pilota; tema chiaro e scuro per la pagina Piloti.

---

## §3 — Dev Notes: blast radius (misurato su `869c9cf` con `git show HEAD:`)

### 3.1 — Schema e migrazioni
`prisma/schema.prisma:1277-1370` (doc `blocksBooking` `:1339-1352`); due cartelle in `prisma/migrations/`.

### 3.2 — Server
- `expiries.service.ts`: `EXPIRY_SELECT` `:60-72`, `toListItem` `:84-104` (+ `typeKind`); `DASHBOARD_SELECT` `:341-349`, `toDashboardItem` `:361-375` (+ `category`); `listBlockingExpiriesByPerson` `:547-567`; nuova `getMedicalRequirementFailure`.
- `bookings.service.ts:443-479`; `flights.service.ts:382-462` (chiamanti `:716`, `:861`).
- `expiry-types.service.ts:98-208`, `ExpiryTypeListItem.kind` `:41`.
- `membership.service.ts:11`, `:30-84`, `:140-145`, nuova `getMembershipStatus`.
- `app-settings.service.ts` (sezione currency); nuovo `currency.service.ts`.

### 3.3 — Zod e OpenAPI
`src/lib/schemas/expiry-types.ts:26`, create `:50-56`, update `:75-85`, query `:97-100`, item `:110-119`; `src/lib/schemas/expiries.ts:46-55` (`typeKind`), `:160-174` (`category`); `src/lib/schemas/settings.ts`; `registry.ts:1229-1370`.

### 3.4 — UI
- `pilots/page.tsx:50-56`, `:96-181`; `pilots/pilots-console.tsx:56`, `:69-85`, `:127`, `:291-299`, `:390`, `:500-504`, `:664-688`; `src/lib/mobile-registries.ts:38-78`.
- `expiries/scadenze-console.tsx:29`, `:39`, `:151-152`, `:488`, `:696` (solo il badge); `expiries/page.tsx` (label delle categorie); `src/lib/mobile-expiries.ts:10-12` (doc).
- `src/lib/expiry-status.ts:96-111` (via); `dashboard/page.tsx:16`, `:1039-1043`.
- `components/dashboard/expiry-editor.tsx:26`, `:39-45` (o dove la 19.4 li ha spostati).
- `ratings-card.tsx` (solo il form MEDICAL, D-18).

### 3.5 — Seed
`prisma/seed.ts:338-381`, `prisma/seed-demo.ts:107-125`, `:223-251`, `:295-306`; `prisma/seed-load.ts:1230-1275`.

### 3.6 — Blast radius e2e (comando: `grep -rnE "Licenza|Quota associativa|Visita medica|kind=RATING|ensureValidSeedExpiries|blocksBooking" e2e`)

| Spec | Punto (HEAD) | Destino |
|---|---|---|
| `helpers.ts` | `:13-77` | AD-9 (una visita) + nuovo `registerFlightOn` |
| `flights.spec.ts` | `:921-944`, E8 `:1198`, `:1209` | E8 su `'Visita medica classe 2'` |
| `mobile-registries.spec.ts` | `:891`, `:923` | `'Licenza'` → `'Rating SEP'` |
| `expiry-types.spec.ts` | `:48-58`, `:105-140` | visite con ambito «Tutti»; quota assente dai ratings; card «Visite mediche» senza select ambito |
| `people-management.spec.ts` | `:335-361` | guardia su `?kind=MEMBERSHIP` |
| `aircraft-out-of-service-until.spec.ts` | `:465-…` | nessuna modifica attesa (nomi misurati dinamicamente) |
| `bookings.spec.ts:267`, `flights.spec.ts:179` | commenti «MAI riusare 'Licenza'» | riformulare |
| `membership-fee.spec.ts`, `mobile-membership-fee.spec.ts` | rinnovo | invariati |
| **nuovo** `e2e/expiry-rules-currency.spec.ts` (nome indicativo) | AC 3, 4, 6, 7a, 11, 15, 16 | fixture run-unique, nessuna scrittura di AppSettings |

Nessuno spec scrive AppSettings globali (X e Y ai predefiniti; X>1 provato a unità).

### 3.7 — Unit esistenti che cambiano
`expiries.service.test.ts` (select con `kind`, `category` nella mappatura, `listBlockingExpiriesByPerson`), `bookings.service.test.ts`, `flights.service.test.ts`, `flights-expiry-boundary.integration.test.ts:24-37` (righe mock con `kind`), `expiry-types.service.test.ts`, `membership.service.test.ts`, `mobile-registries.test.ts:42-95` (via le stringhe «Licenza»), `mobile-expiries.test.ts:30-31`.

### 3.8 — Chiavi i18n (entrambi i file; copy definitiva della 19.12)
- `ExpiriesPage.registry.category.{MEDICAL,RATING,MEMBERSHIP}` — «Visita medica», «Rating», «Quota associativa» / «Medical», «Rating», «Membership fee».
- `PilotsPage.currency.{label,notCurrent,expiring,until,expiredOn,never}` — «Currency», «Non current», «Currency {days}gg», «Fino al {date}», «Scaduta il {date}», «Nessun volo utile» / «Currency», «Not current», «Currency {days}d», «Until {date}», «Expired on {date}», «No qualifying flight».

---

## §4 — Piano di test

### 4.1 — Unit
Nuovi: `src/lib/medical-requirement.test.ts` (AC 5), `src/lib/currency.test.ts` (AC 13), `src/server/services/currency.service.test.ts` (AC 14). Estesi: `app-settings.service.test.ts` (AC 12), `expiry-types.service.test.ts` (AC 3-4), `membership.service.test.ts` (AC 10), `expiries.service.test.ts` (AC 9), `bookings.service.test.ts` (AC 7b), `flights.service.test.ts` (AC 6 a livello di scansione: persona e istruttore, mai due documenti medici per la stessa persona), `mobile-registries.test.ts` (AC 15).

### 4.2 — e2e (`fullyParallel`, fixture run-unique, `scripts/e2e.sh`)
Per le visite, **prima** le visite volute registrate a mano, **poi** `ensureValidSeedExpiries` (AD-9); per «persona senza visite» l'helper **non** si chiama. Velivolo via API + `seedAircraftRate` con `validFrom` ≤ la data più vecchia usata; voli con `registerFlightOn`; date da `todayRome()`/`addDaysIso()`. Righe raggiunte con la ricerca per suffisso; celle asserite in modo esatto (mai `hasText` con date o «0gg», lezione 11.2).

### 4.3 — Discriminanza e sonde (nel Dev Agent Record)
(a) **Regola mediche**: sul codice pre-story (stash) AC 6a risponde 422 e AC 6c risponde 422 con i documenti del ruolo (classe 2 **e** Licenza mancanti, più gli ambientali): output prima/dopo. (b) **Trappola dello scope `ALL`**: solo la migrazione senza AD-3 → il volo felice di un pilota con la sola classe 2 valida risponde 422; poi ripristinare. (c) **Bordo currency**: AC 15 con il volo di A a oggi−91 deve fallire (A «Non current»). (d) **Badge Piloti**: AC 9 con l'orizzonte applicato **prima** della riduzione delle visite deve fallire.

### 4.4 — Gate
`npm run gates`; arbitro e2e completo su DB fresco (`scripts/e2e.sh start`, esito solo da `scripts/e2e.sh status`; `E2E_REUSE_SERVER=1` per i run mirati). Prima del primo reset DB controllare i processi vivi su :3000.

---

## §5 — Trappole note

1. **`ADD VALUE` e uso nella stessa migrazione**: «unsafe use of new value» → due cartelle.
2. **Lo scope `ALL` senza la regola** blocca ogni volo (sonda 4.3-b): migrazione e AD-3 nello stesso commit.
3. **Due filtri sulla stessa relazione** (se il dev ne aggiunge in `listAllExpiries`): un solo oggetto `expiryType: { … }` — la lezione dell'`AND` in `people.service.ts:183-196`. (Il filtro Categoria vero e proprio è della 19.7b.)
4. **Orizzonte prima della riduzione**: nel badge Piloti, filtrare `expiresAt ≤ oggi+30` **prima** di scegliere la visita migliore dà un badge «scaduto» falso.
5. **Doppio documento medico**: scaduto solo da `findBlockingExpiredDocuments`, mancante solo da `findMissingBlockingDocuments`.
6. **`assertScopeCompatible` e chip**: la 19.4 si aspettava che questa story li cambiasse; **non** si toccano (D-3). Ogni scrittura di un tipo MEDICAL passa da `expiry-types.service.ts` (grep `expiryType.create\|expiryType.update\|expiryType.upsert`).
7. **Env eager negli unit**: `currency.service.ts` → `app-settings.service.ts` → `@/server/crypto/secret-box` → `@/lib/env`; `membership.service.ts` → `accounts.service.ts` → mail; `src/lib/schemas/settings.ts` → `@/lib/env`. Mockare la catena; le regole pure stanno in `src/lib/`.
8. **Date**: stringhe `YYYY-MM-DD` di Roma, cast `::date` in SQL (un `Date` JS legato diventa `timestamptz` e può spostare il giorno); niente `new Date(string)` grezzo.
9. **`t.raw`**: `PilotsPage.currency.expiring`/`until`/`expiredOn` si interpolano nel client → `t.raw` (pattern `flagExpired`, `pilots/page.tsx:137-138`).
10. **Confine con la 19.8** (contratto nel suo banner): chiavi `currency.minFlights`/`currency.windowDays`, `getCurrencySettings`/`writeCurrencySettingsCore`/`setCurrencySettings`, `currencySettingsSchema`, codici `MEDICAL_TYPE_FIELDS`/`MEMBERSHIP_TYPE_LOCKED`, invariante D-3; rifiuti come controlli semplici dentro le funzioni del service. Fra le due story la card ha già il form ridotto (D-18); la colonna ambito della sua tabella mostra «Tutti» finché la 19.8 non la toglie. Se al T0 il file della 19.8 risultasse cambiato, vale quello.
11. **Confine con la 19.9/19.10**: nessun check nuovo su voli e prenotazioni (né currency, né quota, né saldo): solo la regola mediche dentro le scansioni esistenti.
12. **Confine con la 19.7b** (contratti che lei consuma, da non rinominare): `computeCurrency`, `CURRENCY_DEFAULTS`, `getCurrencySettings`, `loadOnBoardFlightDates`/`listCurrencyByPerson`, `getMedicalRequirementFailure`/`evaluateMedicalRequirement`, `ExpiryTypeKind.MEMBERSHIP`, il campo `category` degli item del registro, le chiavi `ExpiriesPage.registry.category.*`, l'helper e2e `registerFlightOn`.
13. **Pagina Piloti e `^=`**: nessun testid nuovo con suffisso `-mobile` su nomi con selettori `^=` (`pilot-row-`); badge desktop `pilot-currency-{id}`, chip dentro `mobile-pilot-row-{id}`.
14. **`kind` a tre valori nei tipi TS**: tre dove si legge un item del catalogo, due dove si sceglie una lista o si scrive (`RatingsCard`, `fetchExpiryTypes`, input Zod).

---

## §6 — Fuori scope DICHIARATO

- Registro Scadenze unificato (righe currency, quota e visita «Mancante», filtro Categoria, contatori, Panoramica, export, API delle righe derivate, guardia prestazioni) → **19.7b**.
- Avviso con deroga e check di currency, quota e saldo su voli e prenotazioni; volo solista; `override` della quota → **19.9/19.10**.
- UI delle Impostazioni e route `GET/PUT /api/v1/settings/currency` → **19.8**.
- Mancanti e istruttore nelle prenotazioni (D-5) → **19.10**.
- «Oggi» di Roma nel resto del modulo scadenze → **16.9**.
- Registrazione manuale di una quota via `POST /api/v1/expiries` (resta possibile da API come correzione).

---

## §7 — Riferimenti

- CR §2.3, §4.0 (R-19-a/i/j/k), §4.2, §4.5, §4.6, §4.7 (FR-35, FR-46), §4.10 (A5, A8, A16); decisioni PO 2026-11-01 su Q-19.7-a/b/c (sopra).
- Story: `19-7b-registro-scadenze-unificato.md`, `19-8-impostazioni-salva-unico.md` (banner), `19-3-*.md` D-7, `19-4-*.md` §6, `19-6-*.md` AD-4; `15-5-*.md`, `14-4-*.md` (R4, R-14.4-a), `13-1-*.md`, `13-2-*.md` (F3), `12-11-*.md`.
- Codice: `prisma/schema.prisma:1277-1520`; `src/server/services/{expiries,expiry-types,membership,bookings,flights,app-settings}.service.ts`; `src/lib/{expiry-status,expiry-scope,mobile-registries,mobile-expiries,zoned-time,date-only}.ts`; `src/app/[locale]/dashboard/{expiries,pilots,settings}/`, `dashboard/page.tsx`.

---

## Tasks / Subtasks

- [x] **T0 — Riallineamento**: `git log`, censimenti di §3 su HEAD, righe corrette; API reale di `e2e/db-fixtures.ts` (19.3) e del componente scadenze in bozza (19.4); banner della 19.8.
- [x] **T1 — Schema e migrazioni** (AC 1).
- [x] **T2 — Regole pure** (AC 5, 13).
- [x] **T3 — Catalogo** (AC 3-4) + form della card «Visite mediche» (D-18).
- [x] **T4 — Scansioni** (AC 6-9).
- [x] **T5 — Quota** (AC 10-11).
- [x] **T6 — Currency: impostazioni e service** (AC 12, 14, 17).
- [x] **T7 — Piloti UI** (AC 15).
- [x] **T8 — Categoria da `kind` e landing** (AC 16).
- [x] **T9 — Seed** (AC 2).
- [x] **T10 — e2e** (AC 21): helper (`ensureValidSeedExpiries`, `registerFlightOn`), spec adattati, spec nuovo.
- [x] **T11 — Residui, i18n, gate, verifica UI** (AC 18-22).

---

## Dev Agent Record

### Agent Model Used

Opus 5.5 (`claude-opus-5-5`), dev subagent unico della story (`dev-19-7a`), skill `bmad-dev-story` + `karpathy-guidelines`, `design-taste-frontend`, `ui-ux-pro-max`. Implementazione: commit `83c4a0c` su `dev` (HEAD di partenza `9f3e2dc`, 19.1…19.6 committate; il `baseline_commit: 869c9cf` del frontmatter resta quello delle misure della story).

### §A — Riallineamento sul HEAD (T0)

Censimenti di §3 rieseguiti su `9f3e2dc`. Scostamenti di riga rispetto a `869c9cf` (il disegno non cambia):

| Punto | Story (`869c9cf`) | HEAD `9f3e2dc` |
|---|---|---|
| `schema.prisma` `ExpiryScope` / `ExpiryTypeKind` / `ExpiryType` | `:1277` / `:1290` / `:1302` | `:1154` / `:1168` / `:1195` (la 19.2/19.6 hanno accorciato lo schema) |
| `expiries.service.ts#listBlockingExpiriesByPerson` | `:547-567` | `:566-586` (ora `:608`) |
| `bookings.service.ts#findBlockingExpiredDocuments` e chiamanti | `:465-479`; `:685`, `:1068`, `:1344` | `:471-487`; `:691`, `:1074`, `:1350` |
| `flights.service.ts#findMissingBlockingDocuments` / `scanBlockingDocuments`, chiamanti | `:397-421` / `:441-462`; `:716`, `:861` | `:361-385` / `:405-426`; `:686`, `:812` |
| `dashboard/page.tsx` landing | `:1039-1043` | `:1029-1033` |
| filtro quota per nome nell'editor | `expiry-editor.tsx:39-45` | `components/dashboard/expiry-editor.tsx:43-49` (la 19.4 l'ha lasciato in `fetchExpiryTypes`, come previsto) |
| `seed-load.ts` | `:1231`, `:1264` | `:1082`, `:1115` |
| e2e: E8 di `flights.spec.ts`; `mobile-registries.spec.ts` Licenza | `:1198`/`:1209`; `:891`/`:923` | `:1161`/`:1172`; `:904`/`:936` |
| chiavi i18n al HEAD | — | 1644 per lingua (non 1642: il fix della 19.6 ne ha aggiunte 2) |

- **API reale 19.3** (`e2e/db-fixtures.ts`): `seedAircraftRate(aircraftId, { studentPriceCents, pilotPriceCents, validFrom })`, `seedInstructorRate(personId, { priceCentsPerHour, validFrom })`; `todayRome()`/`addDaysIso()` in `e2e/helpers.ts`. Usate tali e quali.
- **19.4**: `assertScopeCompatible` è esportata (`expiries.service.ts:157`), il componente in bozza è `ExpiryDraftEditor`/`usePersonExpiryDraft`; nessuno dei due è stato toccato (D-3, trappola §5.6). Tolto solo il filtro per nome in `fetchExpiryTypes`.
- **19.6**: nessuno stato `CANCELLED` — la query della currency conta ogni riga `Flight`.
- **Banner 19.8**: contratti rispettati con i nomi concordati (vedi §B AC 12 e §H D-f/D-g). Il banner cita «migrazione + CHECK» e «indice unico parziale» per il tipo MEMBERSHIP: la 19.7a (scritta dopo, AD-1) dice «nessun altro DDL» — vale la 19.7a, l'invariante lo tengono migrazione, seed e service.
- **Censimento e2e §3.6 ripetuto**: oltre ai punti elencati sono emersi `people-management.spec.ts:286-289` (cercava una visita con `scope === 'PILOTS'`), `mobile-registries.spec.ts:401`/`:484` (i piloti di fixture senza voli ora hanno il chip «Non current»), `mobile-expiries-movements.spec.ts:302` (etichetta «Abilitazione»). Corretti, §H D-e.

### §B — Riepilogo per AC con le prove

| AC | Esito | Prova |
|---|---|---|
| 1 | ✅ | §C: gemello popolato + 6 fixture, conteggi prima/dopo, catalogo finale, `migrate diff` vuoto; sonda della migrazione unica che fallisce con «unsafe use of new value». |
| 2 | ✅ | DB fresco (`migrate deploy` + `db seed` + `seed:demo`): catalogo identico a quello migrato (6 tipi, nessuna Licenza). `grep` in §F. Distribuzione currency demo in §E (tre stati presenti dopo lo spostamento di **due** voli di Stefano Colombo, §H D-a). |
| 3 | ✅ | Unit `expiry-types.service.test.ts` (11 casi nuovi su create/PATCH di visite e rating); e2e API `expiry-rules-currency.spec.ts` «catalogue» (422 ×2, 201 ALL/true, 201 ALL/false, 201 INSTRUCTORS, PATCH 422 ×2 e 200); UI: `expiry-types.spec.ts` riscritto (visite «Tutti», form «Visite mediche» senza `medical-scope-select` né checkbox, body inviato esattamente `{ name, validityMonths: null, kind: 'MEDICAL' }`, risposta ALL/true, rinomina e disattiva verdi); form «Ratings» invariato (`mobile-settings.spec.ts` verde nella catena con `--no-deps`). |
| 4 | ✅ | Unit (5 casi: lock su PATCH anche `isActive`, 404 prima del lock, DELETE prima del controllo «in uso», schema che rifiuta MEMBERSHIP su create/update e lo accetta come filtro); e2e API (422 ×2, 409 ×3, `?kind=MEMBERSHIP` → un elemento, `?kind=RATING&includeInactive=true` senza quota, tipo ancora presente dopo il DELETE rifiutato). |
| 5 | ✅ | `src/lib/medical-requirement.test.ts` (8 casi: a-f + tie a ordine invertito + tipo disattivato). |
| 6 | ✅ | e2e «flights» (a)-(e) su date di Roma passate e tariffe via fixture SQL; unit di scansione in `flights.service.test.ts` (5) e catena reale in `flights-expiry-boundary.integration.test.ts` (2: visita scaduta = un documento, mai raddoppiato; visita che scade il giorno del volo = 201). Discriminanza §D (a). |
| 7 | ✅ | (a) e2e «bookings» (201, `warnings: []`); (b) unit `bookings.service.test.ts` (classe 2 + LAPL scadute → un documento, la LAPL; visita scaduta + rating bloccante scaduto → due documenti, la visita una volta; persona senza visite non bloccata; classe 2 scaduta + classe 1 valida → nessun blocco né warning). |
| 8 | ✅ | `flights.spec.ts` «Blocking expiry guard-rail» e `bookings.spec.ts` (`createExpiryTypeForBooking`) verdi senza modifiche di logica (serie mirata 320/320, §G). |
| 9 | ✅ | Unit `listBlockingExpiriesByPerson` (4 casi nuovi + 2 riscritti, mock fedele a SQL sul filtro `expiresAt`); `mobile-registries.spec.ts:355-380` verde. Mutante «orizzonte prima della riduzione» rosso, §D (d). |
| 10 | ✅ | Unit `membership.service.test.ts` (create con `kind: 'MEMBERSHIP'`; `getMembershipStatus` ×4); `membership-fee.spec.ts` e `mobile-membership-fee.spec.ts` verdi. |
| 11 | ✅ | `expiry-types.spec.ts` (quota in nessuna card); `people-management.spec.ts` (guardia su `?kind=MEMBERSHIP`, nessun chip); e2e «membership fee badge» (`window=all` + `personQuery`, badge «Quota associativa» / «Membership fee»); `grep` in §F. |
| 12 | ✅ | `app-settings.service.test.ts` (15 casi: default, valori salvati, fallback per campo con `console.warn`, `ForbiddenError` prima di ogni query, core solo sul `tx` e senza `authorize`, schema ai bordi). |
| 13 | ✅ | `src/lib/currency.test.ts` (11 casi, invariante `current === flightsInWindow >= X` su ognuno). |
| 14 | ✅ | `currency.service.test.ts` (9 casi: UNION dei due sedili senza `UNION ALL`, `excludeFlightId` su entrambi, impostazioni lette a ogni chiamata, `atDate` legata così com'è con `::date`, soggetti D-8, mappatura `daysUntil`). La SQL è stata eseguita davvero su Postgres: distribuzione demo §E via `listCurrencyByPerson` e misura AC 17. |
| 15 | ✅ | e2e «currency on the pilot rows» (A «Currency 0gg», B e C «Non current», D/F/E nessun badge, badge dentro la colonna da 110px, chip di C a 375, sheet di A «Fino al <oggi>»); unit `pilotRowFlag` (8 casi su ogni ramo di priorità). Mutante A a oggi−91 rosso, §D (c). |
| 16 | ✅ | Unit (`typeKind`, `category`); `grep` §F; e2e badge EN «Membership fee»; e2e landing (visita più lontana, quota fuori dai «Ratings»). |
| 17 | ✅ | §E: `EXPLAIN (ANALYZE, BUFFERS)` in `BEGIN READ ONLY … ROLLBACK` su `airmanager_load`. |
| 18 | ✅ | §F. |
| 19 | ✅ | §F: 1644 → 1653 per lingua, parità 0/0, le 9 chiavi tutte lette. |
| 20 | ✅ | `npm run gates` verde (§J); ogni file di test nuovo/toccato passa con `env -u DATABASE_URL -u AUTH_SECRET` (suite completa 76 file / 1939 test eseguita così). |
| 21 | ⏳ arbitro | Serie mirate verdi (§G). L'arbitro completo su DB fresco è della sessione principale: **delta atteso 543 → 549** (+6 del nuovo spec, nessun test rimosso). |
| 22 | ✅ | §I. |

### §C — Migrazioni: gemello popolato, conteggi prima/dopo, `migrate diff`, catalogo finale

Gemello `airmanager_twin197a`: catena **fino alla 19.6** (cartella di migrazioni copiata senza le due nuove) + `npx prisma db seed` + `npm run seed:demo` del HEAD, poi 6 fixture: F1 `SentAlert` su una riga Licenza, F2 `ExpiryUpdateProposal` PENDING su un'altra riga Licenza, F3 `SentAlert` su una classe 2 (deve restare), F4 tipo custom «Licenza estera» con una riga (il nome esatto deve risparmiarlo), F5 visita custom «Visita medica speciale» `PILOTS/false/disattiva`, F6 «Quota associativa» disattivata e messa a `PILOTS`.

| Misura | Prima | Dopo |
|---|---|---|
| `Expiry` per tipo | Inglese ICAO 2, **Licenza 6**, Licenza estera 1, Quota 7, Rating SEP 5, classe 1 2, classe 2 6, LAPL 1, speciale 0 | Inglese ICAO 2, Licenza estera 1, Quota 7, Rating SEP 5, classe 1 2, classe 2 6, LAPL 1, speciale 0 (solo le 6 Licenza sparite) |
| `ExpiryUpdateProposal` (totale / F2) | 1 / 1 | 0 / 0 |
| `SentAlert` (totale / F1 / F3) | 2 / 1 / 1 | 1 / 0 / 1 |
| tipi per `kind`/`scope` | RATING/PILOTS 5, MEDICAL/PILOTS 2, MEDICAL/STUDENTS 1, MEDICAL/INSTRUCTORS 1 | RATING/PILOTS 3, MEDICAL/ALL 4, MEMBERSHIP/ALL 1 |

Catalogo finale (`SELECT "name","kind","scope","blocksBooking","isActive" FROM "ExpiryType" ORDER BY 1`): Inglese ICAO RATING/PILOTS/f/t · Licenza estera RATING/PILOTS/t/t · Quota associativa **MEMBERSHIP/ALL/f/t** · Rating SEP RATING/PILOTS/f/t · Visita medica classe 1, classe 2, LAPL **MEDICAL/ALL/t/t** · Visita medica speciale MEDICAL/ALL/t/f. `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → `-- This is an empty migration.`

Sonda della divisione (AD-1, trappola §5.1): clone del gemello, `ALTER TYPE … ADD VALUE 'MEMBERSHIP'` + `UPDATE … SET "kind" = 'MEMBERSHIP'` in **una** transazione (`psql -1`) → `ERROR: unsafe use of new value "MEMBERSHIP" of enum type "ExpiryTypeKind" — HINT: New enum values must be committed before they can be used.` Catena da zero (`migrate deploy` su DB vuoto) applicata senza errori su tre gemelli.

### §D — Sonde e discriminanze §4.3 (a)-(d)

Build del codice pre-story ottenuta da `git archive 9f3e2dc` nello scratchpad (niente `git stash`, vietato), servita su :3001; codice della story su :3000. Stesso script di sonde (fixture via API + una tariffa via SQL).

- **(a) Regola mediche** — pre-story su DB alla baseline: AC 6a (classe 2 scaduta + classe 1 valida + Licenza valida) → **422** `FLIGHT_BLOCKED_BY_EXPIRY` `[Visita medica classe 2, 2026-10-13, person]`; AC 6c (nessuna visita) → **422** `[Visita medica classe 2 (null), Licenza (null)]`. Story su DB migrato pulito: 6a → **201**; 6c → **422** con **un** documento `{ typeName: "Visita medica classe 1 / Visita medica classe 2 / Visita medica LAPL", expiresAt: null, role: "person" }`.
- **(b) Trappola dello scope `ALL`** — codice pre-story su DB **migrato** (solo la migrazione, senza AD-3): pilota con la sola classe 2 valida → **422** `[Visita medica classe 1 (null), Visita medica LAPL (null)]`. Codice della story sullo stesso DB → **201**. (Il client pre-story non sa leggere una riga `MEMBERSHIP` via `GET /expiry-types`: le sonde leggono gli id dei tipi in SQL.)
- **(c) Bordo currency** — mutante dello spec: il volo di A a oggi−91 (B spostato a −92 per non sovrapporsi sullo stesso velivolo) → rosso `Expected "Currency 0gg" / Received "Non current"`. Ripristino: sha256 `e1722d6d…b506a` identico prima e dopo.
- **(d) Badge Piloti** — mutante di `listBlockingExpiriesByPerson` con `expiresAt: { lte: horizon }` anche sulla lettura delle visite → 2 rossi (forma della query e «classe 2 scaduta + classe 1 a +200 → nessuna voce»). Ripristino: sha256 `e06a5291…134b` identico.

### §E — Distribuzione currency demo (AC 2) e misura di AC 17

**Demo** (DB fresco + `seed` + `seed:demo`, misurata con `listCurrencyByPerson` reale, oggi di Roma 2026-11-02, X=1/Y=90): current >30 — De Santis (88gg), Esposito (82), Fontana allievo (80), Greco (85), Marchetti (86), Romano (84); **≤30 — Colombo Stefano (26gg, scade 2026-11-28)**; **non current — Volante Piero `pilot@airmanager.local`, Allieva Sara `student@airmanager.local`** (soggetti del seed base, senza voli). Prima dello spostamento lo stato ≤30 mancava: spostati **due** voli di Stefano (`daysAgo` 44 → 66 e 18 → 64, riordinati in testa all'elenco cronologico) — §H D-a.

**AC 17** — `SELECT current_database()` → `airmanager_load` (60487 voli, 5007 persone; schema più vecchio, la query usa solo colonne presenti), tutto dentro `BEGIN READ ONLY … ROLLBACK`, nessuna scrittura. Query letterale di `loadOnBoardFlightDates` con X=1, `atDate` 2026-11-02, finestra da 2026-08-04; i 20 id sono soggetti D-8 scelti in una sottoquery (il suo costo, ~5 ms, è dentro la misura):
- 20 soggetti per cognome (nessun istruttore), a freddo: Bitmap Index Scan su `Flight_personId_idx` ×20, 281 righe, **Execution Time 84.6 ms** (shared hit=222 read=291), Planning 7.8 ms;
- 20 soggetti con priorità agli istruttori (anche il ramo `InstructorProfile` lavora): primo giro **227.1 ms** (letture a freddo), rieseguito **47.6 ms**, Planning 1.8 ms.

### §F — Grep di AC 2, 11, 16, 18 e parità i18n (verbatim)

```
$ grep -rn "'Licenza'" prisma src e2e scripts | grep -v "prisma/migrations/"
(nessun risultato)
$ grep -rn MEMBERSHIP_FEE_TYPE_NAME src
src/lib/expiry-scope.ts:27:export const MEMBERSHIP_FEE_TYPE_NAME = 'Quota associativa';
src/server/services/membership.service.ts:2:import { MEMBERSHIP_FEE_TYPE_NAME } from '@/lib/expiry-scope';
src/server/services/membership.service.ts:11:/** The fee type is upserted by NAME (`MEMBERSHIP_FEE_TYPE_NAME`, …
src/server/services/membership.service.ts:142:      where: { name: MEMBERSHIP_FEE_TYPE_NAME },
src/server/services/membership.service.ts:144:      create: { name: MEMBERSHIP_FEE_TYPE_NAME, kind: 'MEMBERSHIP', …
$ grep -rn "categoryOf\|ExpiryCategory" src
(nessun risultato)
$ grep -rni "licenz" src --include=*.ts --include=*.tsx | grep -v src/generated
src/app/[locale]/dashboard/page.tsx:1033:  // Ratifica PO 2026-07-18: la licenza è LIFETIME (mai una data di scadenza —   ← il KPI licenseType
src/server/services/me.service.ts:16:    /** Story 12.12 (ratifica PO 2026-07-18: la licenza è LIFETIME, non scade): the ACTIVE `PilotProfile`'s `licenseType` …
$ grep -rn "'Licenza'" e2e
(nessun risultato)
```

(`src/generated/prisma/**` contiene solo il client rigenerato: nessuna stringa «Licenza» di dominio.) Per arrivare qui sono stati rinominati anche due dati di test estranei alla story (`'Licenza PPL'` → `'Rating SEP'` in `templates.test.ts` e `mobile-expiries.test.ts`) e i commenti «MAI riusare 'Licenza'» di `flights.spec.ts`/`bookings.spec.ts`.

i18n: `messages/it.json` e `messages/en.json` 1644 → 1653, aggiunte `ExpiriesPage.registry.category.{MEDICAL,MEMBERSHIP,RATING}` e `PilotsPage.currency.{label,notCurrent,expiring,until,expiredOn,never}`, nessuna rimossa, parità it/en 0/0; tutte lette (`expiries/page.tsx`, `pilots/page.tsx`; `expiring`/`until`/`expiredOn` con `t.raw`).

### §G — Delta test (unit ed e2e, prima/dopo)

**Unit**: HEAD `9f3e2dc` 73 file / **1847** test (misurati sull'albero estratto) → **76 file / 1939** (+3 file; +92 test = medical-requirement 8, currency 11, currency.service 9, expiry-types 16, app-settings 15, expiries 10, mobile-registries 8, flights 5, bookings 4, membership 4, boundary 2). Nessun test eliminato: rinominate le fixture «Licenza» (bookings, flights, boundary, mobile-registries), adattati i test di schema che pretendevano `scope` obbligatorio e il default Zod di `blocksBooking`, e la mappatura del badge (due letture).

**e2e** (tutte su gemello `airmanager_e2e197a` = catena completa + seed base, build di produzione una volta, `E2E_REUSE_SERVER=1 scripts/e2e.sh`):
1. spec nuovo da solo: 6/6;
2. serie mirata `--project=chromium` su 30 spec (tutti i consumatori di `ensureValidSeedExpiries` + i toccati: expiry-types, people-management, mobile-registries, mobile-expiries-movements, expiry-dashboard, flights, bookings, membership-fee, aircraft-out-of-service-until, flight-no-charge, flight-delete-update, home-dashboard, person-save, expiry-registration, api-v1, person-detail, my-account, instructor-compensation, typeahead-pickers, mobile-logbook, mobile-self-public, billing, exports, pdf-exports, my-compensation, aog-impact-email, flight-log, expiry-alerts, mobile-reports, expiry-rules-currency): **320 passed, 0 failed, 0 flaky** (7.6 min);
3. sullo stesso DB già inquinato dalla serie 2, catena con `--no-deps` (mobile-membership-fee, mobile-settings) + spec col pilota/allievo di seed (home-dashboard, mobile-overview, mobile-shell, mobile-a11y-sweep, mobile-ink-targets) + spec nuovo: **77 passed**;
4. dopo l'allargamento della colonna Tipo (nuova build): expiry-rules-currency, expiry-dashboard, mobile-expiries-movements, mobile-a11y-sweep: **39 passed**.

Test e2e nuovi: `e2e/expiry-rules-currency.spec.ts` (6). Cambiati: `expiry-types.spec.ts` (2 test), `flights.spec.ts` (E8), `mobile-registries.spec.ts` (3 test), `people-management.spec.ts` (2 test), `mobile-expiries-movements.spec.ts` (1 riga), `helpers.ts` (`ensureValidSeedExpiries`, `registerFlightOn`). **Delta arbitro atteso: 543 → 549.**

### §H — Deviazioni motivate

- **D-a (AC 2)** — spostati **due** voli demo, non uno: ogni pilota demo ha ≥ 3 voli sparsi su 70 giorni, nessuno spostamento singolo produce lo stato ≤30. Scelto Stefano Colombo (voli a 70/44/18 → 70/66/64: scade fra 26 giorni); voli riordinati per tenere l'elenco cronologico (saldi sensati). La sua classe 2 (scaduta a −10) era valida alle date dei voli.
- **D-b (AD-8)** — registro Scadenze: la colonna «Tipo» passa da 110 a 132 px. Con le etichette nuove il badge «Quota associativa» (125 px misurati) veniva tagliato dalla cella; misura dopo: 127/132 px in IT chiaro, «Membership fee» 107/132 px in EN scuro, nessun taglio. Unico tocco al registro oltre al badge.
- **D-c (AD-3)** — `getMedicalRequirementFailure` non legge le visite della persona quando non c'è alcun tipo MEDICAL attivo (requisito spento: il risultato è `null` comunque). Una query in meno su ogni scansione delle installazioni senza visite.
- **D-d (AD-6)** — lo sheet mobile calcola la riga «Documenti» con il solo flag dei documenti (`documentFlagOf`, `currency: null`), così un chip di currency più prioritario non nasconde un documento in scadenza; per i documenti il comportamento è identico a prima.
- **D-e (§3.6)** — e2e corretti fuori dal censimento della story, tutti conseguenza diretta delle regole: `people-management.spec.ts:286-289` (la visita si cerca per nome, non più per `scope === 'PILOTS'`), `mobile-registries.spec.ts:401`/`:484` (un pilota di fixture senza voli porta ora il chip «Non current»: asserito come unico chip al posto di «nessun chip»), `mobile-expiries-movements.spec.ts:302` (l'etichetta «Abilitazione» diventa «Rating», asserita come «Rating · TipoMob» del sottotitolo).
- **D-f (banner 19.8)** — niente CHECK né indice unico parziale sul tipo MEMBERSHIP (citati dal banner della 19.8, superati da AD-1 della 19.7a scritta dopo): invariante tenuto da migrazione + seed + `expiry-types.service.ts` + l'upsert per nome protetto da `name @unique`.
- **D-g (contratto 19.8)** — oltre a `CURRENCY_DEFAULTS`, `src/lib/currency.ts` esporta **`CURRENCY_LIMITS`** (`{ minFlights: { min: 1, max: 99 }, windowDays: { min: 1, max: 3650 } }`), letto da `currencySettingsSchema` e dal getter: il mirror client della 19.8 legge di lì i limiti (come chiede il suo banner). `setCurrencySettings` restituisce i valori scritti (`CurrencySettings`). Nessun nome di §5.12 è cambiato.
- **D-h** — `registerFlightOn` restituisce l'id del volo creato (la story non fissava il ritorno) e pretende 201 (stampa il corpo in caso contrario).

**TD aperti**
- **TD 19.7a-a** — una registrazione volo calcola la regola mediche due volte per persona (scansione delle scadute e dei mancanti, fino a 4 query in più per persona e istruttore). Corretto ma ridondante: il servizio unico dei check della 19.9 può leggerla una volta.
- **TD 19.7a-b** — il badge Piloti mostra la visita migliore anche quando nessun tipo MEDICAL è attivo (requisito spento): D-13 alla lettera, caso limite di un'installazione che disattiva tutte le visite.
- **TD 19.7a-c** — sul DB e2e longevo altri spec lasciano tipi MEDICAL attivi (`person-save.spec.ts` «Salva MEDICAL ALL …», le «Visita idoneità …» di `expiry-types.spec.ts` sono disattivate): entrano nel nome del documento «mancante» e possono essere la «prima visita attiva» scelta da `ensureValidSeedExpiries`. Innocuo (mai cancellati, gli spec che lo asseriscono leggono l'elenco attivo prima e dopo), da tenere presente nella 19.7b.
- **TD 19.7a-d** — la tabella della card «Visite mediche» mostra ancora «Ambito: Tutti» e il badge «Blocca prenotazioni» su ogni visita: li toglie la 19.8 (D-18).

### §I — Verifica UI (screenshot)

Script throwaway `playwright-core` su Chromium locale contro la build di produzione (nessun Playwright MCP su questa macchina), fixture dello spec nuovo:
- **Piloti 1280 chiaro e scuro**: A «Currency 0gg» (warn, 94 px), B e C «Non current» (bad, 88 px) sotto la data, cella 110 px, `fits: true`; a **1024** i tre badge restano nella cella; D/E/F senza badge. Badge e testo da token AirOps (`.badge.warn`/`.badge.bad`), stato detto a parole oltre che dal colore.
- **Piloti 375 chiaro e scuro**: chip A «Currency 0gg», B/C «Non current», D/E/F nessuno; sheet di A con la riga «CURRENCY — Fino al 02/11/2026» dopo «Stato».
- **Registro Scadenze**: badge «Visita medica»/«Rating» (IT), «Medical»/«Rating» (EN); «Quota associativa» (IT chiaro) e «Membership fee» (EN scuro) interi dopo D-b.
- **Impostazioni**: form «Nuova visita medica» con soli nome e validità (`medical-scope-select` assente), form «Ratings» con ambito e checkbox invariati.
- **Landing pilota**: «Scadenza medico 21/05/2027» (la classe 1, non la classe 2 scaduta), «Ratings: Rating SEP» (niente quota).

### §J — Gate ed esiti verbatim

```
$ npm run gates
PASS  lint (29s)
PASS  typecheck (6s)
PASS  test (16s) — Tests  1939 passed (1939)
PASS  build (51s)
$ env -u DATABASE_URL -u AUTH_SECRET npx vitest run
 Test Files  76 passed (76)
      Tests  1939 passed (1939)
```

Gemelli `airmanager_twin197a`, `airmanager_demo197a`, `airmanager_e2e197a`, `airmanager_base197a` eliminati a fine lavoro; `airmanager` e `airmanager_load` mai scritti (il secondo letto solo in transazione READ ONLY). Server fermati per PID.

### Completion Notes List

- Modello: `ExpiryTypeKind.MEMBERSHIP` (D-1) e due migrazioni (AD-1); visite `ALL`/`true` come invariante dei dati (D-3), senza toccare `assertScopeCompatible`, `isExpiryScopeCompatible` né la validazione del composito persona.
- Regole pure riusabili: `evaluateMedicalRequirement` (`src/lib/medical-requirement.ts`), `computeCurrency` + `CURRENCY_DEFAULTS`/`CURRENCY_LIMITS` (`src/lib/currency.ts`). Funzioni di service per 19.7b/19.9/19.10: `getMedicalRequirementFailure` (expiries), `getMembershipStatus` (membership), `getCurrencyStatus`/`loadOnBoardFlightDates`/`listCurrencyByPerson` (currency), `getCurrencySettings`/`writeCurrencySettingsCore`/`setCurrencySettings` (app-settings), `currencySettingsSchema` (schemas/settings).
- Scansioni esistenti con la regola nuova: prenotazioni = solo scadute e solo la persona (D-5), voli = scadute + mancanti per persona e istruttore, mai due documenti medici.
- UI: righe Piloti (badge desktop `pilot-currency-{id}`, chip mobile, riga «Currency» nello sheet), badge di categoria i18n nel registro, landing per `kind`, form «Visite mediche» ridotto. Nessun testid con suffisso `-mobile` su nomi con selettori `^=`.
- Nessuna email, nessun check nuovo su voli/prenotazioni oltre alla regola mediche, nessuna route di impostazioni (confini 19.8/19.9/19.10 rispettati).

### File List

Nuovi:
- `prisma/migrations/20261102200000_expiry_kind_membership/migration.sql`
- `prisma/migrations/20261102200100_expiries_licence_medical_membership/migration.sql`
- `src/lib/medical-requirement.ts`, `src/lib/medical-requirement.test.ts`
- `src/lib/currency.ts`, `src/lib/currency.test.ts`
- `src/server/services/currency.service.ts`, `src/server/services/currency.service.test.ts`
- `e2e/expiry-rules-currency.spec.ts`

Modificati:
- `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/seed-demo.ts`, `prisma/seed-load.ts`
- `src/server/services/expiries.service.ts`, `expiry-types.service.ts`, `membership.service.ts`, `bookings.service.ts`, `flights.service.ts`, `app-settings.service.ts` (+ i rispettivi `.test.ts`, più `flights-expiry-boundary.integration.test.ts`)
- `src/server/adapters/mail/templates.test.ts`
- `src/lib/schemas/expiry-types.ts`, `src/lib/schemas/expiries.ts`, `src/lib/schemas/settings.ts`, `src/lib/schemas/registry.ts`
- `src/lib/expiry-status.ts`, `src/lib/expiry-scope.ts`, `src/lib/mobile-registries.ts` (+ test), `src/lib/mobile-expiries.ts` (+ test)
- `src/app/[locale]/dashboard/pilots/page.tsx`, `src/app/[locale]/dashboard/pilots/pilots-console.tsx`
- `src/app/[locale]/dashboard/expiries/page.tsx`, `src/app/[locale]/dashboard/expiries/scadenze-console.tsx`
- `src/app/[locale]/dashboard/page.tsx`, `src/app/[locale]/dashboard/settings/ratings-card.tsx`, `src/components/dashboard/expiry-editor.tsx`
- `messages/it.json`, `messages/en.json`
- `e2e/helpers.ts`, `e2e/expiry-types.spec.ts`, `e2e/flights.spec.ts`, `e2e/bookings.spec.ts`, `e2e/mobile-registries.spec.ts`, `e2e/mobile-expiries-movements.spec.ts`, `e2e/people-management.spec.ts`
- `_bmad-output/implementation-artifacts/19-7a-scadenze-modello-regole-quota-currency.md` (questo record, Status → review)

### Change Log

- 2026-11-02 — `83c4a0c` feat(19.7a): implementazione completa (22 AC); questo commit docs: Dev Agent Record e Status → review.
- 2026-11-02 — `b2314e8` fix(19.7a): fix di review F1-F5; commit docs successivo: Review Record e report di review. Status resta review.

## Review Record — 19.7a

- **Review adversarial** (`review-19-7a`, Opus 5.5, 2026-11-02): **SHIPPABLE-WITH-FIXES**. Arbitro su DB fresco **rosso**: 508 passed, 1 failed deterministico (`mobile-billing.spec.ts:1073`), 40 did not run (la catena serializzata, poi verde a parte 40/40); totale 549 = delta atteso. Report: `19-7a-review-report.md`, committato con questo record. Finding: F1 blocker, F2 medium, F3-F5 low.
- **Fix** (`fix-19-7a`, Opus 5.5, commit **`b2314e8`**). Decisioni della sessione principale: F1 asserzione indipendente dall'ordine; F2 il solista non conta per l'istruttore (nessuna conferma PO necessaria: è la lettera di CR §4.5); F3 validazione sotto lock di riga; F4 tipo quota trovato per `kind`, scelta del meccanismo delegata; F5 ordine totale.

### F1 (blocker) — sonda `utilBarWidths` indipendente dall'ordine; chiude TD 19.1-g

- **Fix** (`e2e/mobile-billing.spec.ts`, `NEIGHBOUR_PROBE`): l'insieme delle larghezze si confronta **ordinato decrescente** (`.sort((a, b) => b - a)`), con un commento che dice perché. Le attese restano `[281, 0]` e `[]`: nessuna è stata indebolita.
- **Perché basta**: l'ordine del `Set` è l'ordine DOM delle righe, cioè un dato globale (quanti velivoli hanno minuti nell'anno decide se il primo per registrazione resta fra i top-8 visibili). L'invariante voluto dal commento della sonda è la **larghezza** delle barre, e quella resta asserita.
- **TD 19.1-g chiuso** (era nel §7 della 19.1: «da confrontare come insieme»): è esattamente questo caso. La riga della 19.1 non è stata toccata (regola: niente file story di altre story); la chiusura è registrata qui, come la 19.8 ha fatto per il TD 19.1-a.
- **Prove** (gemello `airmanager_fix197a` = catena completa + seed base, build di produzione su :3000, `E2E_REUSE_SERVER=1`):
  1. pre-fix, `flights.spec.ts` + `expiry-rules-currency.spec.ts`, poi sullo stesso DB 8 velivoli OPERATIONAL con minuti nell'anno (6 `I-FL` + 2 «Regole 19.7a»);
  2. `mobile-billing.spec.ts:1073` con l'asserzione **originale** → **rosso**, stesso diff dell'arbitro: `utilBarWidths` `[0, 281]` invece di `[281, 0]`;
  3. con il fix, stesso DB → `mobile-billing.spec.ts` intero **26 passed**;
  4. **discriminanza** (mutante dello spec che inietta `.util-rows{ padding-inline: 40px !important; }` su Statistiche, cioè una regola che raggiunge `.util-*`) → **rosso**, `281 → 237`; ripristino con sha256 identico (`6c646738…71d0b7`). Un primo mutante su `width` di `.util-bar` era passato: a 375 px la barra ha `flex: 0 0 100%` e `width` non la muove — un mutante sbagliato, non una sonda cieca.
  5. dopo il fix del server (sotto), di nuovo **dopo** `expiry-rules-currency.spec.ts` sullo stesso DB: `mobile-billing.spec.ts` **24 passed, 2 skipped** (i due `test.skip` previsti dallo spec quando il movimento seminato è già stato consumato da un run precedente sullo stesso DB).

### F2 (medium) — il volo Scuola solista non conta per la currency dell'istruttore

- **Fix** (`currency.service.ts#loadOnBoardFlightDates`): il ramo `InstructorProfile` della CTE `on_board` prende `AND f."isSolo" = false`. Il ramo `personId` non cambia: il solista conta per l'allievo che lo vola. Doc-comment del modulo aggiornato («a dual flight counts for both; a SOLO counts for the student only»). `isSolo` esiste solo su un volo SCHOOL (`SOLO_REQUIRES_SCHOOL`), quindi il filtro non tocca altri voli.
- **D-7 corretto**: «a bordo» = `Flight.personId = P` oppure l'istruttore del volo è P **e il volo non è solista**. La regola TS pura `computeCurrency` riceve solo date e non duplica la definizione: nessun altro punto da cambiare.
- **19.7b** (non ancora implementata): la sua forma SQL della currency (§2 di `19-7b-registro-scadenze-unificato.md`, ramo `JOIN "InstructorProfile" ip …`, D-15) **deve rispettare la stessa regola**: `AND f."isSolo" = false` sul ramo istruttore, altrimenti la parità SQL/TS di D-15 fallisce sul primo solista.
- **Osservazione fuori scope** (non cambiata): `flights.service.ts#scanBlockingDocuments` scansiona i documenti dell'istruttore anche su un volo solista. È comportamento pre-19.7a; se un istruttore che non è a bordo debba avere la visita valida è materia del servizio unico dei check della 19.9.
- **Guardie**:
  - unit `currency.service.test.ts` «a SOLO counts for the student only»: il ramo istruttore contiene il filtro, quello della persona no;
  - e2e AC 15 esteso (stesso test, nessun test nuovo): G pilota+istruttore il cui unico volo è il solista dell'allievo H a oggi−20, supervisionato → G **«Non current»**, H nessun badge (current). Il titolo del test dice ora «a supervised solo does not». `registerFlightOn` accetta `isSolo?: boolean` (additivo, il contratto per la 19.7b non cambia).
  - **pre-fix** (build di HEAD `552dc48`, gemello): `expiry-rules-currency.spec.ts:376` **rosso** a `:420`, `Expected: "Non current"`, `element(s) not found` (G risultava current); gli altri 5 test dello spec verdi. **Fix**: verde (serie sotto).

### F3 (low) — validazione D-3 sotto lock di riga

- **Fix** (`expiry-types.service.ts#updateExpiryType`): lettura, validazione e update dentro **un** `prisma.$transaction`, con `SELECT "id" FROM "ExpiryType" WHERE "id" = … FOR UPDATE` come prima istruzione e la lettura Prisma subito dopo (il pattern di `accounts.service.ts#recordAdjustment`). In READ COMMITTED la lettura dopo il lock vede il risultato già committato della PATCH concorrente, quindi la seconda delle due valida lo stato **finale**. Ordine dei controlli invariato: 404 → 409 `MEMBERSHIP_TYPE_LOCKED` → 422 `MEDICAL_TYPE_FIELDS` → nome duplicato; il backstop P2002 resta fuori dalla transazione.
- **Perché non il CHECK**: una riga di service chiude la corsa senza riaprire AD-1 («nessun altro DDL») né toccare `migrate diff`; la 19.8, che estrae questi controlli nei suoi core transazionali, eredita una funzione che già legge sotto lock.
- **Guardie**:
  - unit «validates against the row read UNDER a FOR UPDATE lock»: `$queryRaw` con `FOR UPDATE` sull'id, chiamato **prima** della lettura, e la PATCH `{ scope: PILOTS }` su una riga che nel frattempo è diventata MEDICAL → 422, nessun update;
  - sonda di concorrenza (`scratchpad/fix197a/probes.ts`, 25 tipi run-unique, `PATCH {kind: MEDICAL}` ‖ `PATCH {scope: PILOTS}` in `Promise.all`, stato finale letto in SQL):

    | | esiti | righe MEDICAL con `scope ≠ ALL` |
    |---|---|---|
    | pre-fix (HEAD `552dc48`) | `200/200 → MEDICAL/PILOTS` ×23, `200/422` ×1, `422/200` ×1 | **23/25** |
    | fix | `200/422 → MEDICAL/ALL/true` ×20, `422/200 → RATING/PILOTS/true` ×5 | **0/25** |

    Tipi della sonda cancellati a fine run (0 residui); nessun 500 nel log del server.

### F4 (low) — il tipo quota si trova per `kind`, un omonimo viene riallineato

- **Fix** (`membership.service.ts#chargeMembershipFee`): `findFirst({ where: { kind: 'MEMBERSHIP' } })`; **solo se assente**, `upsert` per nome con `update: { kind: 'MEMBERSHIP', scope: 'ALL', blocksBooking: false, isActive: true }` (prima `update: {}`). Doc-comment aggiornati.
- **Scelta fra le due strade** proposte dalla sessione principale — riallineare l'omonimo invece di rifiutare la creazione di un rating con quel nome:
  - nessuna superficie nuova (codice d'errore, OpenAPI, messaggio i18n nella card Ratings);
  - è la semantica che la migrazione 19.7a già dà al nome (passo 3: la riga «Quota associativa» diventa la quota, qualunque fosse il suo `kind`);
  - **ripara** anche un'installazione dirottata prima del fix (al primo addebito successivo), cosa che il rifiuto da solo non farebbe;
  - resta senza corse: l'upsert su `name @unique` è nativo (`INSERT … ON CONFLICT`), due primi addebiti concorrenti non creano due righe, e una PATCH admin concorrente sulla stessa riga ora prende il lock di F3 e vede il `kind` aggiornato (409).
  - Finestra residua, dichiarata: prima del **primo addebito in assoluto** un admin può avere nella card Ratings un rating chiamato «Quota associativa». Nessun lettore lo scambia per la quota (`getMembershipStatus` filtra per `kind`: `missing`, vero perché nessuno ha pagato); al primo addebito diventa la quota.
- **Invariante AD-2** («esattamente un tipo MEMBERSHIP»): creato solo da questo upsert, dalla migrazione e dal seed, sempre sul nome unico; `expiry-types.service.ts` rifiuta `kind: MEMBERSHIP` in scrittura e blocca PATCH/DELETE del tipo.
- **Guardie**:
  - unit `membership.service.test.ts`: «no MEMBERSHIP type yet» (ricerca per `kind`, poi upsert con l'`update` di riallineamento) e «the MEMBERSHIP type exists» (nessun upsert, l'`Expiry` va sull'id trovato per `kind`);
  - riproduzione del reviewer (`probes.ts`, gemello `airmanager_fix197a_noseed`: catena + seed, poi riga quota cancellata per simulare la produzione; rating creato con `scope: PILOTS, blocksBooking: true`):

    | | tipo MEMBERSHIP dopo l'addebito | rating «Quota associativa» | `Expiry` della persona | PATCH `isActive: false` | card Ratings |
    |---|---|---|---|---|---|
    | pre-fix | `[]` | presente | `Quota associativa:RATING:2027-11-02` | 200 | 1 riga |
    | fix | `Quota associativa:ALL/false/true` (**stessa riga** del rating) | assente | `Quota associativa:MEMBERSHIP:2027-11-02` | **409** | 0 righe |

### F5 (low) — ordine totale della «visita migliore» nel badge Piloti

- **Fix** (`expiries.service.ts#listBlockingExpiriesByPerson`): a parità di `expiresAt` vince il **nome minore** (confronto `<`, lo stesso di `pilotRowFlag` che consuma questo risultato). È un ordine totale: il nome è unico per tipo e c'è una sola riga per (persona, tipo). Scelto il nome invece dell'id suggerito per esempio, così il chip è leggibile e coerente con il tie-break del suo consumatore.
- **Guardia**: unit «two visits expiring the SAME day» con le righe nei **due** ordini → sempre «Visita medica classe 1».

### Prove trasversali

- **Unit, discriminanza** (i file di test nuovi sui quattro service di HEAD `552dc48`, rimessi con `git show`, poi ripristinati con sha256 verificato): **5 failed / 166** — esattamente i 5 test nuovi o riscritti (F2, F3, F4 ×2, F5). Sul fix: **166 passed**, anche con `env -u DATABASE_URL -u AUTH_SECRET`.
- **e2e sul fix** (build dei gate, gemello `airmanager_fix197a` già usato per il pre-fix, `E2E_REUSE_SERVER=1`, retries CI):
  - project `chromium`: `expiry-rules-currency`, `expiry-types`, `membership-fee`, `mobile-registries`, `person-save`, `people-management` → **64 passed, 0 flaky**, `E2E_EXIT=0`;
  - poi `mobile-billing.spec.ts` sullo stesso DB → **24 passed, 2 skipped** (vedi F1), `E2E_EXIT=0`;
  - catena con `--no-deps --workers=1`: `settings`, `mobile-membership-fee`, `mobile-settings` (card Ratings/Visite e quota) → **21 passed**, `E2E_EXIT=0`.
  - Nel run pre-fix di `flights.spec.ts` (retries 0) è fallito anche `flights.spec.ts:1027` (E5) alla registrazione iniziale (`:1037`, 422 invece di 201): è il flaky noto delle guardie 16.2 (TD 16.2-g), su build pre-fix e spec non toccato.
- **Gate** (sul contenuto committato): `PASS lint (34s) · PASS typecheck (5s) · PASS test (11s) — Tests 1943 passed (1943) · PASS build (31s)`.
- **Delta**: unit **1939 → 1943** (+4: currency 1, expiry-types 1, membership 1 nuovo + 1 riscritto, expiries 1). e2e atteso per l'arbitro **549 → 549** (il caso F2 è dentro il test AC 15 esistente; nessun test aggiunto o rimosso). L'arbitro completo su DB fresco resta alla sessione principale.

### Stato della macchina

- Server :3000/:3001 fermati per PID, porte libere; `scripts/e2e.sh status` = DONE, ultimo run = la catena (`E2E_EXIT=0`).
- Gemelli `airmanager_fix197a` e `airmanager_fix197a_noseed` **eliminati**; `airmanager` e `airmanager_load` mai toccati.
- `.next` = build dei gate sul contenuto committato (`b2314e8`). Script, output e log delle prove in `scratchpad/fix197a/`.

### Chiusura (sessione principale, 2026-11-02)

- **Arbitro finale**: DB `airmanager` resettato, `CI=1 scripts/e2e.sh start` su HEAD `5a9a9eb`: **548 passed + 1 flaky = 549, E2E_EXIT=0** (14,4 min); delta 543 → 549 confermato, nessun test aggiunto dal fix.
- **Flaky** `aog-impact-email.spec.ts:283` → 409 «An aircraft with this registration already exists» alla creazione della fixture: la marca era `I-AOGB` + `Date.now()` (13 cifre) troncata a 20 caratteri, cioè **senza la parte casuale** → due velivoli creati nello stesso millisecondo collidevano. Difetto LATENTE del test (AOG-1b), non della 19.7a; stessa forma in `aircraft-out-of-service-until.spec.ts` (1 sola cifra casuale sopravviveva). Corretto dalla sessione principale in un commit a parte (`fix(e2e)`): tempo in base 36 + 6 caratteri casuali entro i 20; i due spec 16/16 con `--retries=0`, gates verdi.
- **F2** deciso dalla sessione principale senza domanda al PO: R-19-i dice «voli in cui la persona è **a bordo**», e nel solista l'istruttore non lo è. Nota del fix per la **19.9**: `scanBlockingDocuments` controlla ancora i documenti dell'istruttore anche sul volo solista (comportamento preesistente) — da allineare lì.

