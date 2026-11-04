---
baseline_commit: 9272129
---

# Story 16.5: Il dovuto agli istruttori non cambia quando cambia la tariffa, e non sparisce quando l'istruttore va via

## §R — Riallineamento su `dev@56c6664` (2026-11-03, sessione principale) — **PREVALE su tutto il resto del file, Addendum compreso dove lo contraddice**

Il corpo della story (baseline `9272129`) **non è mai stato emendato dopo l'Addendum R-16-i/j/k** in coda (che prevale), e da allora l'Epic 19 ha riscritto il modello del volo. Leggere la story con: R-16-i/j/k (Addendum), CR 2026-11-01 R-19-c, R-19-d, Q-19.6-a, Q-19.3-b, Q-19.4-a, A20 e §4.3 («la modifica in place conserva lo snapshot salvo cambio istruttore/durata»).

**Il volo su HEAD** (19.6 `6651ec1`): niente `status`, `cancelledAt`, `correctionOfId` (`schema.prisma:866-876`); esistono `updateFlight` (modifica in place, `flights.service.ts:1205`) e `deleteFlight` (cancellazione definitiva, `:1149-1167`). Colonne nuove: `noCharge` (19.6), `aircraftPriceCategory` (19.3), `FlightType` TOURISM|SCHOOL (19.5), `forcedAt`/`forcedByUserId` (19.9). **Un solo builder** (19.6 AD-4): lo snapshot va in `buildFlightWrite().flightData` (`:860-889`), **mai** in `totalAmountCents` (che è anche il costo del controllo saldo `:676` e l'addebito). `buildFlightWrite` è puro: la tariffa conservata dell'originale arriva tramite `OriginalFlightIdentity` (`:302-311`), come Q-19.3-b conserva la categoria (`:634-635`). Su un volo `noCharge` il compenso **non** si azzera (R-19-d, Q-19.6-a).

**Contratto riallineato**:
- **P1**: «correzione e storno» → `updateFlight` + `deleteFlight`.
- **P2 / AC 2 / AC 5 / AD-1 (R-16-k)**: volo con istruttore **senza tariffa = 0/0** (non NULL); NULL/NULL solo per i voli **senza istruttore**.
- **P3**: «REGISTERED non stornati» → «ogni riga Flight SCHOOL» (il filtro status è già sparito, `instructor-compensation.service.ts:124-132`). Lo snapshot si scrive anche sui TOURISM con istruttore (A5); il lettore somma solo SCHOOL (regola preesistente).
- **P4**: VALID + azione **Paga** sulla sezione «non più attivi» (R-16-i).
- **P5 / AC 18 / AD-4**: censimento degli arrotondamenti su HEAD: `flights.service.ts:646` (istruttore), `:861` (velivolo), `instructor-compensation.service.ts:168`, **`bookings.service.ts:598`** (due `Math.round(x*min/60)` del costo stimato, 19.10 A9) → `centsForMinutes` anche lì (decisione D-R2); `seed-load.ts:636`, `:638` (2 copie, non 4). Test half-up `flights.service.test.ts:827-835`.
- **AC 1**: correggere anche i doc-comment `Flight.noCharge` (`schema.prisma:898-904`, «compensation … reads `minutes`, never the amounts»), `payoutRateCents` (`:132-134`, «`owed` is always `null`», contraddetto da R-16-k) e la lista degli snapshot (`:851-858`).
- **AC 6**: «storno» → `deleteFlight`: la riga sparisce e il dovuto scende esattamente dello snapshot, senza codice nuovo. **Conseguenza dichiarata**: cancellare un volo già liquidato porta il dovuto sotto zero (R-16-d + R-19-c).
- **AC 7 / AD-6**: `correctFlight` non esiste; `updateFlight` riscrive `write.flightData` (`:1282-1285`) a ogni modifica, quindi cade l'invariante I5 «nessun `flight.update` le tocca». Regola della tariffa in modifica: ratifica Q-16.5-a in §R-PO.
- **AC 8 / AD-10**: niente `_count` né conteggio dei «non prezzati» (R-16-k): `_sum: { minutes, instructorPayoutCents }`, niente clausola `status`; `owed = maturato − pagato` è sempre un numero. `listInactiveInstructors` resta.
- **AC 9**: il percorso UI della tariffa è il PATCH composito `/people/{id}` (`people.service.ts:733-734`, 409 `INSTRUCTOR_PROFILE_INACTIVE` `:731`, 19.4); `setPayoutRate` resta per API ed e2e. Editor a Salva unico: l'hint va sul campo (`instructor-editor.tsx:546`, `Field` ha `hint` `field.tsx:35`), sezione d'errore `payoutRate` (`person-save.ts:94`). Q-19.4-a: campo vuoto = nessun compenso (null → 0 dovuto).
- **AC 10 / AC 11**: un volo registrato senza tariffa ha snapshot 0/0; impostare la tariffa dopo non lo riscrive; il dovuto non è mai `null`. Il dovuto è 0 per **ogni** istruttore senza tariffa: «—» → «0,00 €» su roster, sheet, profilo, editor, I miei compensi, landing Panoramica e widget Contabilità.
- **AC 12**: copy dal glossario: «compenso orario», **mai «payout»** (`BANNED` `/payout/i`, `messages.test.ts:217-242`, fa fallire i gate; vietati anche «tariffa payout», «ciclo pagamenti»).
- **AC 13 / AC 16 (R-16-i)**: la sezione «non più attivi» ha **Paga**; `PaySlideOver` riceve anche quelle righe; `recordPayout` → 409 **solo** per un istruttore non più attivo con dovuto ≤ 0 (oggi 409 secco senza codice, `:437-443`, `:469`) — codice nuovo **`INSTRUCTOR_NOTHING_OWED`** (decisione D-R3), mappato in UI. Nessun tetto all'importo pagato (R-16-i pone solo dovuto > 0); il controllo non prende lock (corsa innocua, non si perde denaro) — entrambi dichiarati.
- **AC 14**: in e2e «Totale dovuto» è un aggregato globale: delta-assert o riga dell'API, **mai uguaglianza**.
- **AC 15 / AD-5**: **OBSOLETE** (contatore e slot `delta` del KPI decadono con R-16-k; `kpi.tsx:35` `delta` resta inutilizzato, non toccarlo).
- **AC 17**: `mobile-a11y-sweep.spec.ts:283` invariato; il grep `^=` non trova collisioni. Testid: `inactive-instructor-row-{id}` / `mobile-inactive-instructor-row-{id}`; Paga `inactive-instructor-pay-{id}` + gemello `-mobile`.
- **AC 19**: su un volo **con** addebito (su `noCharge` `instructorAmountCents` è 0, `buildFlightWrite:862`).
- **AC 20**: export in `exports.service.ts:486-501`, namespace `InstructorsPage`, pattern unico 19.12b.
- **AC 21**: in Statistiche un ex istruttore mostra il dovuto solo se ≠ 0 (il summary filtra); filtro billing `billing/page.tsx:192`.
- **AC 22**: quattro descrizioni OpenAPI: `registry.ts:1853`, `:1856`, `:1874` (POST payout «409 if no active profile» → R-16-i), `:1889`. L'OpenAPI è servito a runtime, niente da rigenerare.
- **AC 23**: `seed-load.ts` tipo `:565-566`, calcolo `:636-638`, `createMany` `:670-690`, mappa `instructorProfileRows` `:313`/`:337-340`; tariffa null → 0/0. `seed-demo.ts` VALID.
- **AC 24**: righe e2e: test 1 volo `:127` / tariffa da UI `:139-144` / atteso `:148`; test 2 `:181`/`:185`; test 3 `:226`/`:227`. Riga senza tariffa: dovuto «0,00 €», tariffa «—». Commenti stantii `:135`, `:233`, `mobile-registries.spec.ts:519-520`. Test nuovi: (a) volo senza tariffa resta a 0 anche dopo aver impostato la tariffa; (b) ex istruttore: sezione + delta del KPI + Paga 1 000 → 200 → 800; (c) modifica in place secondo Q-16.5-a. `flight-no-charge.spec.ts:154-173` diventa il guardiano di R-19-d sugli snapshot.
- **AC 2 / 3 / 13 / 14 (numeri)**: le cifre di `airmanager_load` (12 871 / 3 211, 248/490/+220, 22 / 8 103,88 €) non valgono più. **D-R4**: la sessione principale rigenera `airmanager_load` (`npm run seed:load`, guardia `LOAD_SEED_TARGET_DB`) come gemello per questa story e per l'Epic 17, e lo cancella a fine Epic 17; il «prima» si misura col `seed-load.ts` di HEAD prima della modifica (worktree di HEAD).
- **AD-8**: via la riga del `delta`; etichette già rinominate dalla 19.12b («Compenso orario medio», «Compensi da liquidare»); il `sub` è già ICU plural, la nuova clausola `subInactive` pure.
- **AD-11**: migrazione con timestamp **dopo `20261103101004`**; backfill `COALESCE(ip."payoutRateCents", 0)` su **tutti** i voli con istruttore (JOIN su `InstructorProfile`, senza `IS NOT NULL` sulla tariffa).
- **§3.4**: «non esiste un test automatico di parità» è OBSOLETE (`src/i18n/messages.test.ts`); chiavi da 8 a 7 (esce `kpi.owedUnknown`). §3.6, §4.4, §4.5(b): OBSOLETE (DB di carico e sonde spariti, da riscrivere). §4.6: discriminanze **solo su copia isolata con sha256**. Unit: U5 → `updateFlight`, U6 → `deleteFlight`, U10 → 0, U14 senza `status`, U2/U11/U16 a R-16-k. §5: trappola 4 cambia esito (istruttore senza tariffa = dovuto 0, fuori dal pannello per «dovuto ≤ 0»), trappola 9 da rileggere con R-16-i. §6: «liquidare un non più attivo» è **in scope**; «ri-prezzare via `correctFlight`» e «`status: 'REGISTERED'`» OBSOLETE.

**Decisioni tecniche della sessione principale (2026-11-03)**: **D-R1** restringere `owed*Cents` / `mtdGrossCents` a `number` (con R-16-k il `null` è codice morto; il tipo trova ogni ramo «—»). **D-R2** `bookings.service.ts:598` usa `centsForMinutes` (il suo doc-comment dice già «the formula of the flight charge»). **D-R3** codice `INSTRUCTOR_NOTHING_OWED` (409) per «dovuto ≤ 0». **D-R4** v. sopra.

**Righe spostate (HEAD)**: `flights.service.ts` (1493 righe) — `ResolvedFlightInput` `:313-332`, `findActiveInstructor` `:341-352` (aggiungere `payoutRateCents`), `resolveFlightInput` `:472` (istruttore `:603-624`, tariffe `:626-646`, `resolved` `:648-662`, unica chiamata a `buildFlightWrite` `:665`), `FlightWrite` `:819-844`, `registerFlightCore` `:920` (`flight.create` `:933`), `updateFlight` select dell'originale `:1208-1221` / identità `:1226-1236` / `flight.update` `:1282`, doc del modulo `:69-84`, `:94-100`; `FLIGHT_SELECT` `:186-212`; own-access `:1325`. `instructor-compensation.service.ts` — tipo `:27-38`, `listActiveInstructors` `:97`, `sumMinutesByProfile` `:121`, `sumPayoutsByProfile` `:147`, `computeGross`/`computeOwed` `:165-175`, `computeSummaryRows` `:177`, `getCompensationSummary` `:211`, `getOwnCompensationOverview` `:324` (`mtdGrossCents` `:345`), `resolveActiveInstructorRow` `:360`, `resolveActiveInstructorProfileId` `:437`, `recordPayout` `:466`, `setPayoutRate` `:531`. `schema.prisma` — `InstructorProfile` `:122-155`, `InstructorPayout` `:154-193`, `Flight` `:877-979` (colonne istruttore `:936-941`, indice `:977`). UI — `instructors/page.tsx` KPI `:55-61`, `items` `:67-74`, `sub` `:82`, riga KPI `:85-90`; `instructors-console.tsx` `InstructorRow` `:40-47`, `cols` `:117`, desktop `:145-184`, mobile `:190-227`, `PaySlideOver` `:254-261`/`:463` (precompilazione `:470`), «Compensi da liquidare» `:264-274` (filtro `:266`)/`:576`, `InstructorSheet` `:329` (fa fetch del dettaglio, 404 per un non più attivo); `instructor-editor.tsx` «Totale dovuto» in sola lettura `:194-198`; `airops.css` `.instructors-mobile` `:2468`, `:2486-2489`. Consumatori — `billing/page.tsx:92`, `:192-199`; `billing-console.tsx:62`, `:1152`; `stats.service.ts:175-177`, `:197-199`, `:244-250`; `dashboard/page.tsx:851-872`; `my-compensation/page.tsx:114-120`; `exports.service.ts:481-502`; `schemas/instructor-compensation.ts:20-42`, `:121-133`. Test — `flights.service.test.ts` `INSTRUCTOR_PROFILE_ROW` `:221-226` (senza `payoutRateCents`, trappola n. 1), inline `:762`, `:775`, `ORIGINAL_FLIGHT_ROW` `:259-269` (aggiungere tariffa e id istruttore), describe `deleteFlight` `:1422`, `updateFlight` `:1536`; `instructor-compensation.service.test.ts` `:198`, `:314` (null → 0), `:327`, `:339`, `:361`, `:486` (409 → R-16-i), `:557` (resta); `exports.service.test.ts:449-452`; `stats.service.test.ts:147`, `:162`.

**e2e**: persone run-unique (`createInstructorPerson` lo è); registrare un volo con `force: true` (requisiti e saldo, 19.9/R-19-g); `FLIGHT_OVERLAP` non forzabile (orari distinti sullo stesso velivolo); `NO_INSTRUCTOR_RATE` → `seedInstructorRate` con `PAST_DATE`; disattivazione `/people/{id}/profiles/deactivate` o PATCH composito, archiviazione `/people/{id}/archive`; mai Escape su un popup di combobox. Verifica UI dal subagent sulla Fedora: fallback playwright-core (niente MCP garantito).

**Stima**: ~22-28 file, ~+1000/−300, ~24 AC (≈ metà della 19.7a). Nessuno split. Dev **Opus**.

### §R-PO — Ratifiche PO del 2026-11-03 (AskUserQuestion, prima del dispatch; tutte sulla raccomandazione)

- **Q-16.5-a — tariffa in modifica in place** = **A**: istruttore invariato → si tiene la tariffa congelata sull'originale (anche se 0) e l'importo si ricalcola con `centsForMinutes` sui minuti nuovi; istruttore cambiato → tariffa attuale del nuovo istruttore, oppure 0 se non ne ha; nessun istruttore → `null`/`null`. **Sostituisce il ripiego scritto in R-16-j** («se l'originale non ha tariffa usa quella vigente»): con R-16-k uno 0 esplicito e «nessuna tariffa» sono indistinguibili. Speculare a Q-19.3-b (categoria conservata).
- **Q-16.5-b — pannello «Compensi da liquidare»** = **A**: include gli ex istruttori con dovuto > 0 (unione delle due platee), con l'etichetta «Non più attivo».
- **Q-16.5-c — dettaglio di un ex istruttore** = **A**: il 404 di `resolveActiveInstructorRow` (`:360-380`, test `:435`) resta; la riga offre solo **Paga**; su mobile la riga non è tappabile e ha un bottone Paga ≥ 44 px. Contratto API invariato.
- **Domande del dev (Dev Agent Record), ratificate dal PO il 2026-11-03 dopo il dev**: **D-b** = sì, sulla card degli ex istruttori «Paga» compare solo con dovuto > 0 (dovuto ≤ 0: cifra visibile, niente Paga); **D-c** = sì, «non più attivo» = persona archiviata OPPURE profilo disattivato (un archiviato col profilo ancora attivo è pagabile solo con dovuto > 0); **pagamenti concorrenti** = basta dichiararlo (nessun tetto all'importo, nessun lock sul controllo del dovuto: due Paga simultanei possono lasciare un dovuto negativo, visibile nella card; nessun denaro perso).

Status: **done** — 2026-11-04 (Review Record in coda; implementata il 2026-11-03 commit `caeb973`, fix `c635b34`, Dev Agent Record in coda); ready-for-dev dal 2026-09-10, **riallineata e ratificata il 2026-11-03 (§R, §R-PO)**. **Modello dev: Opus 5 xhigh** (la story tocca UI: una sezione NUOVA sulla pagina Compensi con le sue due facce desktop/mobile, un qualificatore sul KPI, un `hint` nel form della tariffa, una colonna nell'export e 8 stringhe i18n in due locale — v. §1 AD-8 e §3.4).

> ⚠️ **Baseline e ordine di lavoro (misurato il 2026-09-10)**: il frontmatter dichiara `9272129` (`docs(sprint-status): 16.3 ready-for-dev`) e **tutti** i `file:riga` di questo file sono misurati **su quel HEAD**. La 16.1 è **committata** (`1a57609`); le story **16.2, 16.3 e 16.4 hanno il file pronto ma NON sono implementate**, e **due di loro toccano gli stessi file di questa**:
> - **16.2** riscrive `flights.service.ts` in 6 punti (guardia di sovrapposizione dentro la transazione, helper del contaore, bordo inferiore della durata a `:754`) ⇒ **ogni riga di `flights.service.ts` citata qui slitta**;
> - **16.3** aggiunge lock e guardie in `bookings.service.ts` e `errors.ts` (nessuna sovrapposizione con questa story), **16.4** tocca la scansione dei documenti (idem).
> ⇒ **Prima di scrivere una riga**: `git log --oneline -5`, poi **rileggere e correggere in questo file ogni riga citata** (prassi che ha pagato in tutti gli epic 15 e AOG). Le righe di `instructor-compensation.service.ts`, `page.tsx`, `instructors-console.tsx`, `exports.service.ts`, `stats.service.ts`, `prisma/schema.prisma` non sono toccate da nessuna delle tre story parcheggiate: quelle sono affidabili.
>
> **Da leggere PRIMA di implementare**: `_bmad-output/planning-artifacts/audit-2026-09-10/ledger-audit.md` §**MAJOR-1**, §**MAJOR-2**, §**MINOR-1**, e la sezione «Invarianti» (I2, I4, **I5**, I7, I8, I12, I13) più **VC-8** (la storicizzazione delle tariffe corretta, da NON toccare); `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 16.5», §«Architettura e vincoli», ratifica **R-16-d**. Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`; per la parte UI `design-taste-frontend` e `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`).
>
> 🧹 **DB di lavoro**: questa story **non richiede** un reset per gli unit (tutto mockato), ma la migrazione va provata su un DB con dati e i run e2e vanno su DB fresco. Il DB di **carico** `airmanager_load` (usato per tutte le misure di §3.6) **non va rigenerato**: la migrazione lo aggiorna in-place, ed è il solo posto dove i numeri di questa story sono verificabili su volumi reali.

---

## Story

As **il tesoriere dell'aviosuperficie**,

I want che il compenso maturato da ogni volo sia **congelato al momento del volo** e che il dovuto resti **visibile finché non è pagato**,

so that cambiare la tariffa payout non riscriva il passato (MAJOR-1), archiviare un istruttore non nasconda i soldi che gli si devono (MAJOR-2), e l'arrotondamento del compenso sia **lo stesso** dell'addebito (MINOR-1).

### Il perché: il commento dello schema promette una domanda che il lettore fa comunque

`InstructorProfile.payoutRateCents` è una colonna mutabile, e il doc-comment (`schema.prisma:129-138`) motiva la scelta così:

> «Deliberately a single mutable column, NOT historicized like `InstructorRate` … the payout ledger (`InstructorPayout` below) already carries its own dated rows, so there is **no "what was the rate on date D" question** to answer for this field the way AD-4 answers it for `InstructorRate`.»

Quella domanda **la fa `computeOwed`**, e la fa su **tutte le ore di sempre**: `instructor-compensation.service.ts:167-176` calcola `round(totalMinutes/60 × payoutRateCents) − paid`, con `totalMinutes` non delimitato (`sumMinutesByProfile(ids, null)`, `:122-139`) e `paid` = somma di **tutti** i payout (`:148-163`). `setPayoutRate` (`:532-543`) è un `instructorProfile.update` secco: **una riga aggiornata riscrive il dovuto di ogni ora già liquidata**, in entrambi i versi — e verso il basso inventa un dovuto **negativo**, per cui lo schema dichiara che non esiste rimedio (`schema.prisma:174-177`: *«there is no reversal concept for this MVP ledger»*).

Il gemello di questo lettore, sulla stessa area, dichiara la regola **opposta** e la motiva: `accounts.service.ts:730-735` — *«ARCHIVED people are deliberately NOT filtered out … **archiving must never hide money owed**»*. Due liste di denaro su schermate adiacenti, politiche opposte, e solo una delle due argomentata.

### Fatti misurati che vincolano il design

Tutte le misure sul **DB di carico** `airmanager_load` (60 487 voli, 401 profili istruttore) e con le sonde di §4.4. Query in §3.6.

| Fatto | Misura | Conseguenza |
|---|---|---|
| MAJOR-1 è riproducibile in unit | sonda §4.4: 100 h pagate a 20,00 €/h → dovuto **0**; `setPayoutRate(25,00)` → dovuto **+500,00 €**; `setPayoutRate(18,00)` → **−200,00 €** | la discriminanza esiste già scritta ed **eseguita**: il dev la porta in `instructor-compensation.service.test.ts` con l'aspettativa rovesciata |
| MAJOR-2 non è latente sul carico | **27** profili istruttore inattivi (persona archiviata **e** profilo disattivato: le due flag coincidono su tutti e 27), **22** con dovuto ≠ 0, per **8 103,88 €** invisibili da qualunque superficie | la sezione «non più attivi» ha subito 22 righe da mostrare: l'AC 4 è verificabile sul carico, non solo su una fixture |
| L'arrotondamento **per volo** non coincide con quello **sull'aggregato** | 319 istruttori con tariffa: **248** cambiano dovuto, scarto **±1..9 c**, |Σ| **490 c**, netto **+220 c** (TS esatto; **489/+219 c** con l'aritmetica `numeric` di SQL — la differenza di 1 c *è* l'errore float della formula vecchia) | il «deve essere zero» del piano è **falso**, e va dichiarato con la cifra: l'AC 2 si misura, non si assume (v. AD-3) |
| La formula scelta è riproducibile **identica** in SQL | `Math.round((rate*minutes)/60)` vs `round((rate::numeric*minutes)/60)`: su **11 700 300** coppie checksum **601 639 468 750** e checksum pesato **4 832 281 482 578 978 300**, uguali; sulle **12 871** righe reali da backfillare somma **53 157 673** e pesata **38 510 736 413**, uguali | il backfill può stare **nella migrazione**, in SQL, senza uno script TS: la prova è in §4.5 |
| 81 istruttori hanno voli SCHOOL e **nessuna** tariffa payout | 2 399 voli; **0** di loro ha payout registrati | dopo il backfill quei voli restano **senza snapshot**: il dovuto è **ignoto**, non zero — è la ragione per cui `owed*Cents` **resta nullable** (AD-5) |
| Un istruttore può stare su un volo **non** SCHOOL | **3 848** voli con istruttore e `flightType <> 'SCHOOL'`; **0** voli SCHOOL senza istruttore; **0** voli SCHOOL con `instructorAmountCents` nullo | lo snapshot si scrive come il suo gemello di addebito (**ogni** volo con istruttore), e il filtro `flightType: 'SCHOOL'` resta **solo** nel lettore: una regola, un posto (AD-4) |
| Il KPI di pagina cambia di una cifra misurabile | «Totale dovuto» oggi **113 214,17 €** (soli attivi, arrotondamento sull'aggregato) → dopo **121 320,03 €**: **+8 103,88 €** di MAJOR-2 e **+1,98 €** di arrotondamento | il Dev Agent Record ha un numero prima/dopo da citare, non un'impressione |
| Il budget di query non cambia | oggi 6 `groupBy` (3 minuti + 3 payout); dopo 6 (3 sui voli con `_sum` **e** `_count`, 3 sui payout) — idioma **provato** sul carico (§4.5) | nessun costo nuovo: `_count: { _all: true, <colonna>: true }` viaggia nella stessa query del `_sum` |
| Tre fixture e2e su sei **dipendono** dalla retroattività | `instructor-compensation.spec.ts:131` vs `:144`, `:174` vs `:176`, `:217` vs `:218`: il volo è registrato **prima** che la tariffa esista | la suite oggi **certifica** il difetto: le tre fixture vanno riordinate (§3.5), ed è la prova più forte che MAJOR-1 non era un caso limite |
| L'export e i tre lettori derivati **riscorrono il servizio** | `exports.service.ts:472`, `stats.service.ts:181`, `billing/page.tsx:192`, `dashboard/page.tsx:897` | la parità è per costruzione (VC-7), ma **tre** superfici cambiano contenuto senza che nessuno le abbia toccate: vanno decise, non scoperte in review (AD-9) |

---

## §0 — Requisiti FISSI (contratto)

Gli AC di contratto sono quelli del piano (`docs/superpowers/plans/2026-09-10-epics-16-18-audit.md`, §«Story 16.5»), qui numerati per essere citabili:

| # | Requisito di contratto |
|---|---|
| **P1** | Un volo SCHOOL registrato porta `instructorPayoutCents` **e la tariffa payout applicata**, calcolati con la tariffa vigente e la **STESSA** funzione di arrotondamento dell'addebito; correzione e storno lo ricalcolano/stornano come gli altri importi del volo. |
| **P2** | I voli esistenti sono **backfillati** con la tariffa payout attuale del loro istruttore, e il record **dichiara** quante righe e per quali istruttori il dovuto cambia rispetto a oggi. |
| **P3** | `computeOwed` somma **gli snapshot** dei voli REGISTERED non stornati **meno** i payout: cambiare `payoutRateCents` oggi **non muove** il dovuto dei voli passati. |
| **P4** | Un istruttore disattivato o archiviato con dovuto ≠ 0 **compare** in una sezione «non più attivi, con dovuto» e il KPI **«Totale dovuto» lo include** — la regola «archiving must never hide money owed» vale anche qui. |
| **P5** | Delle **due** formule di arrotondamento censite dall'audit (19 769 coppie in disaccordo) **ne resta una**, usata da addebito, payout ed export. |

**Ratifica applicabile — R-16-d (vincolante)**: *«la tariffa payout dell'istruttore si **congela sul volo** (`instructorPayoutCents` snapshot alla registrazione, come già `aircraftRateCentsPerHour`); il dovuto = somma degli snapshot dei voli REGISTERED non stornati − payout; cambiare la tariffa vale per i **voli futuri**; **backfill** dei voli esistenti con la tariffa attuale, dichiarato»*.
⇒ La **storicizzazione** di `payoutRateCents` (la prima opzione dell'audit, `@@unique([instructorProfileId, validFrom])` come `InstructorRate`) è **esclusa**: non si crea nessuna tabella nuova, non si tocca `instructor-rates.service.ts`, e `payoutRateCents` resta **una colonna mutabile** — solo, da questa story, non è più la fonte del passato. Nessuna ratifica PO nuova è necessaria; le due decisioni che il PO potrebbe voler rivedere sono in §7 e **non bloccano**.

**Invarianti che questa story deve lasciare intatte:**

| # | Invariante | Qui significa |
|---|---|---|
| **I5** (AD-4) | Il volo **congela** tariffa e importi; una modifica del listino non riscrive la storia | le due colonne nuove sono **esattamente** questo, per la terza tariffa del dominio; si scrivono **una volta**, alla `flight.create`, e **nessun** percorso le aggiorna mai (zero `flight.update` che le tocchi) |
| **I2** (AD-3) | Ledger append-only | la migrazione **non** scrive né corregge un solo `AccountMovement`/`CashMovement`/`InstructorPayout`: aggiunge due colonne a `Flight` e le riempie |
| **I4** (AD-2) | Centesimi interi | le due colonne sono `Int?`; il backfill produce interi (`round(...)::int`), provato uguale al TS su 12 871 righe |
| **I7** | Lo storno è la negazione del valore **memorizzato**, mai un ricalcolo | lo storno del compenso **non è un'operazione**: il volo passa a `CANCELLED` e **esce** dall'insieme sommato con lo stesso snapshot con cui c'era entrato (AD-6) |
| **I13** | Solo ADMIN tocca i soldi | nessun permesso nuovo: `finance.manage` per la lettura, `payouts.manage` per tariffa e payout, invariati |
| **VC-8** | Le tariffe storicizzate (`AircraftRate`, `InstructorRate`) sono corrette | **non si toccano**: `getEffectiveRate`/`getEffectiveInstructorRate` restano identiche, e il compenso payout non entra nell'addebito al pilota |
| **AD-1 (progetto)** | Una regola di dominio vive in **una** funzione | l'arrotondamento diventa **una** funzione con 3 call-site; il filtro `flightType: 'SCHOOL'` resta in **un** posto (il lettore) |

---

## §1 — Decisioni architetturali

**AD-1 — Due colonne su `Flight`, `Int?`, mai NOT NULL.**

```prisma
  instructorRateCentsPerHour Int?
  instructorAmountCents      Int?          // (esistenti, invariati)

  /// Snapshot (AD-4/R-16-d) della tariffa PAYOUT in forza sull'istruttore al
  /// momento della registrazione …
  instructorPayoutRateCents  Int?
  /// Snapshot del compenso che QUESTO volo matura per il suo istruttore …
  instructorPayoutCents      Int?
```

`Int?` e non `Int NOT NULL DEFAULT 0`, per tre ragioni misurate:
1. **Un volo senza istruttore non matura nulla**: 44 405 voli su 60 487 non hanno `instructorProfileId`. `0` significherebbe «zero euro dovuti», che è un'affermazione; `NULL` significa «non applicabile», che è la verità. È esattamente la scelta già fatta per il gemello `instructorAmountCents Int?` (`schema.prisma:1040-1044`).
2. **81 istruttori hanno voli e nessuna tariffa payout** (2 399 voli): per loro il compenso maturato è **ignoto**, non zero. Un `DEFAULT 0` trasformerebbe «non lo sappiamo» in «non gli dobbiamo niente» — la stessa classe di difetto che l'audit segnala sul `?? 0` del KPI.
3. **NOT NULL renderebbe la migrazione impossibile senza un valore inventato** per quei 3 211 voli con istruttore ma senza tariffa.

**AD-2 — Quando lo snapshot si scrive: come il suo gemello di addebito, non come il filtro del lettore.**
Regola **unica**: le due colonne sono valorizzate ⟺ il volo ha un `instructorProfileId` **e** quel profilo ha `payoutRateCents !== null` al momento della registrazione. **Non** si aggiunge la condizione `flightType === 'SCHOOL'` al writer, benché solo i voli SCHOOL siano sommati dal lettore. Perché: il filtro SCHOOL è una regola del **compenso**, e vive già in `sumMinutesByProfile` (`:127`); duplicarla nel writer la metterebbe in **due** posti, e la prima divergenza fra i due sarebbe invisibile. Conseguenza dichiarata: **3 848** voli non-SCHOOL con istruttore porteranno uno snapshot che **nessun lettore somma**. Il doc-comment della colonna nomina il lettore e il suo filtro, così la colonna non può essere letta per quello che non è; il DTO non la espone (AD-7).

**AD-3 — Il calcolo si sposta da «una volta sull'aggregato» a «una volta per volo», e la differenza è misurata, non zero.**
Il piano dice *«deve essere zero al momento della migrazione: stessa tariffa, stesso arrotondamento»*. La prima metà è vera (stessa tariffa), la seconda **no**: oggi l'arrotondamento cade **una volta**, sulla somma di tutti i minuti (`round(Σminuti/60 × tariffa)`); dopo cade **una volta per volo** (`Σ round(tariffa × minuti_volo/60)`). Le due cose differiscono per la granularità, e sul carico la differenza è:

| Misura (319 istruttori con tariffa, 9 641 voli SCHOOL REGISTERED) | Valore |
|---|---|
| istruttori il cui dovuto si muove | **248** su 319 |
| scarto massimo su un istruttore | **9 centesimi** |
| somma degli scarti in valore assoluto | **490 centesimi** (4,90 €) |
| scarto netto | **+220 centesimi** (+2,20 €) |

⇒ **AC 2 si riscrive come una misura**, non come uno zero: la story dichiara le righe backfillate, gli istruttori il cui dovuto si muove e di quanto. La direzione è quella giusta: il **per-volo** è la regola che l'addebito applica già (`aircraftAmountCents`, `instructorAmountCents` sono arrotondati per volo e **scritti nel ledger**), quindi il compenso smette di essere l'unico numero del dominio arrotondato su un aggregato. Il prezzo è ≤ 1 centesimo per volo, dichiarato.

**AD-4 — La formula sopravvissuta, e il modo in cui la seconda sparisce.**
MINOR-1 non si chiude «scegliendo» una delle due formule: si chiude perché **la seconda non ha più un chiamante**.

```
tenuta   flights.service.ts:884, :987 → Math.round((rate * minutes) / 60)
eliminata instructor-compensation.service.ts:169 → Math.round((minutes / 60) * rate)
```

La tenuta è quella **provata** half-up da un test (`flights.service.test.ts:893`, 333 c/h × 30′ → 167) e algebricamente esatta: `rate * minutes` è un intero < 2^53 sempre (tariffa max 2 147 483 647 c per schema, minuti ≤ 1440 per guardia; nel dominio reale ≤ 5,8·10⁷), quindi il quoziente è il double più vicino al razionale esatto e `Math.round` è half-up davvero. La eliminata perde il mezzo centesimo per eccesso: `(69/60) * 1510 === 1736.4999999999998` mentre il valore esatto è `1736.5` (sonda §4.4, terzo test).

Dopo la story `computeGrossCents` e `computeOwed` **non esistono più**: il lordo È la somma degli snapshot, il netto È lordo − payout. Il censimento post-fix di `src/` deve trovare **zero** siti che dividono minuti per 60 per ottenere denaro fuori da `centsForMinutes`.
Casa della funzione: **`src/lib/money.ts`** (dove vive già `formatCents`, nessuna catena `@/lib/env`, quindi sicura in unit senza `.env`):

```ts
/** L'UNICA conversione ore→denaro del dominio (MINOR-1) … */
export function centsForMinutes(rateCentsPerHour: number, minutes: number): number {
  return Math.round((rateCentsPerHour * minutes) / 60);
}
```

3 call-site: `flights.service.ts:884` (compenso addebitato all'allievo), `:987` (componente velivolo), e il payout snapshot nuovo. `prisma/seed-load.ts` ne ha 4 copie inline (`:659`, `:661`, `:732`, `:734`): **non si toccano** in questa story se non per aggiungere le due colonne nuove (§3.3) — un seed non è un percorso di dominio, e riscriverne le formule non è riconducibile alla richiesta (karpathy §3). Va **segnalato** nel Dev Agent Record.

**AD-5 — `owed*Cents` resta `number | null`, ma il `null` cambia significato — e la ragione è misurata.**

| | oggi | dopo |
|---|---|---|
| `owed = null` quando | `payoutRateCents === null` (proprietà dell'ISTRUTTORE, oggi) | esiste **almeno un volo** nella finestra con `instructorPayoutCents IS NULL` (proprietà della **storia**) |

Al momento della migrazione i due insiemi **coincidono**: il backfill usa la tariffa attuale su tutti i voli, quindi uno snapshot è nullo ⟺ l'istruttore non ha tariffa. Misura: **81** istruttori con dovuto ignoto prima, **81** dopo. Nessuna regressione di display su nessuna delle cinque superfici.
Il caso **nuovo** (parzialmente prezzato) nasce solo così: volo registrato senza tariffa → tariffa impostata → altri voli. Allora la finestra contiene snapshot noti **e** ignoti, e il dovuto è **ignoto** («—»), non una somma parziale spacciata per totale. Due conseguenze da dichiarare, non da scoprire:
- «Ciclo pagamenti» filtra `(owedTotalCents ?? 0) > 0` (`instructors-console.tsx:262`) ⇒ un istruttore parzialmente prezzato **non compare** in quella lista. È **lo stesso** comportamento di oggi per un istruttore senza tariffa (asserito da `instructor-compensation.spec.ts:226`), quindi non è una regressione — ma è un modo in cui del denaro può restare fuori da una lista, e va scritto (§5, §7 domanda PO).
- La via d'uscita per l'admin **esiste già**: `correctFlight` su quei voli li ri-snapshotta alla tariffa corrente (è la stessa via d'uscita che AD-4 dà per una tariffa velivolo sbagliata). Va nel doc-comment.
Il **secondo** effetto del `null` che l'audit segnala (`?? 0` nel KPI: «si legge come una cifra completa quando è incompleta») si chiude con AD-8, non nascondendolo.

**AD-6 — Storno e correzione: nessuna aritmetica nuova.**
- **`cancelFlight`**: **zero modifiche**. Il lettore filtra `status: { not: 'CANCELLED' }` (`:128`), quindi il volo stornato **esce** dall'insieme sommato portandosi via **esattamente** lo snapshot con cui era entrato. Il dovuto scende della stessa cifra, senza un calcolo — che è lo spirito di **I7** («la negazione del valore memorizzato, mai un ricalcolo») applicato per sottrazione di insieme invece che per riga.
- **`correctFlight`**: il volo originale va `CANCELLED` (esce) e il volo nuovo passa per `registerFlightCore` con il **proprio** snapshot, calcolato da `resolveFlightInput` sulla tariffa payout **corrente**. Conseguenza dichiarata e inevitabile: **correggere oggi un volo del 2020 ne ri-prezza il compenso alla tariffa di oggi** — perché la tariffa payout, per ratifica R-16-d, non ha storia. Non è un difetto di questa story: è il costo della metà economica della ratifica, ed è **coerente** con il contratto già scritto di `correctFlight` (*«a correction IS a new registration, re-validated from scratch»*, doc-comment `:1370-1378`). Il lato addebito NON si comporta così solo perché le sue tabelle sono storicizzate. Va nel doc-comment di `correctFlight` e in §7.

**AD-7 — Le due colonne NON entrano nel DTO del volo.**
`FLIGHT_SELECT` (`:185-218`), `FlightBreakdown` (`:114-123`), `FlightListItem`, gli schemi Zod di `src/lib/schemas/flights.ts` e il registry OpenAPI dei voli **non si toccano**. Motivo: nessun AC chiede di mostrare il compenso payout su un volo, la pagina Registro voli non ha una colonna per farlo, e il compenso payout è un dato **del club verso l'istruttore** che oggi vive solo su Compensi (`finance.manage`) — esporlo nel DTO dei voli lo renderebbe leggibile da `listFlights`, che ha anche un ramo own-access (`authorizeFlightsQuery`, `:1565`). Zero contratto API nuovo sui voli, zero `registry.ts` sui voli. Dichiarato in §6.

**AD-8 — La pagina Compensi: due liste, quattro KPI ognuno con la sua platea dichiarata.**
`getCompensationSummary` restituisce **l'unione** di due platee, con un discriminante sulla riga:

```ts
export type InstructorCompensationSummaryItem = {
  …
  /** `false` quando la persona è archiviata O il profilo istruttore è disattivato … */
  isActive: boolean;
};
```

La pagina (`instructors/page.tsx:49-54`) si divide così — **ogni** KPI dichiara la sua platea, perché mescolarle sarebbe la stessa ambiguità che l'audit contesta:

| KPI / testo | Platea dopo | Perché |
|---|---|---|
| `kpi.active` «Istruttori attivi» | **solo attivi** | l'etichetta dice *attivi*: contarci dentro chi non lo è più sarebbe una bugia sulla parola stessa |
| `kpi.hours` «Ore totali volate» | **attivi + non più attivi mostrati** | sono ore che l'aviosuperficie ha erogato; escluderle renderebbe le ore incoerenti col dovuto che le genera |
| `kpi.owed` «Totale dovuto» | **attivi + non più attivi mostrati** | **P4**, ed è la ragione della story |
| `kpi.owed` → `delta` (slot esistente di `KPI`) | conteggio dei dovuti **ignoti** | chiude il secondo rilievo di MAJOR-2: la cifra dice quanti istruttori non sono nel totale |
| `kpi.avgRate` «Tariffa media payout» | **solo attivi con tariffa** | è la tariffa che il club **paga oggi**; la tariffa di chi è andato via non è una tariffa in vigore |
| `sub` di pagina | `{active} attivi · {owed} da liquidare` **+** clausola nuova se ci sono non-più-attivi | additivo: la stringa esistente non cambia forma (nessun parametro ICU nuovo) |

La sezione nuova è una **seconda `card` in sola lettura**, sotto il roster, resa **solo** se ha righe. Riusa `.students`/`.student-row` e — punto importante — le **stesse due classi** che la pagina già possiede per lo scambio desktop/mobile: `instructors-desktop-body` e `instructors-mobile` (`airops.css:2500`, `:2518-2521`). ⇒ **zero CSS nuovo**, e lo scambio a 640px funziona per costruzione. Nessuna azione sulle righe (niente «Modifica», niente «Paga», niente click sul nome): il dettaglio risponde 404 su un profilo disattivato (`:371-373`) e `recordPayout` risponde 409 (`:438-442`) — offrire un bottone che non può funzionare sarebbe peggio che non offrirlo. Il **perché** e la **via d'uscita** stanno nell'hint della sezione, non in un `title` invisibile (§7, domanda PO 1).

**AD-9 — Le tre superfici che cambiano contenuto senza essere toccate: decise qui.**
`getCompensationSummary` ha quattro consumatori oltre alla sua pagina. Con una platea più larga:

| Consumatore | `file:riga` | Decisione |
|---|---|---|
| Export xlsx Compensi | `exports.service.ts:472-486` | **include** i non-più-attivi (riscorre il servizio, VC-7) **+ una colonna «Stato»**: ciò che si stampa deve coincidere con ciò che si vede (lezione MAJOR-5), e una riga senza stato su carta è indistinguibile |
| Statistiche `/dashboard/reports` | `stats.service.ts:181`, `:208-209`, `:262-269` | **nessuna modifica**: `instructorGroups` include **già** i voli degli ex istruttori (nasce da `flight.groupBy`, non dal roster) e mostrava `owedCents: null` per loro; ora la mappa risolve e il numero **compare**. È un miglioramento gratuito e coerente — va **dichiarato e asserito** con un unit, non lasciato al caso |
| Widget «Compensi istruttori» su `/dashboard/billing` | `billing/page.tsx:192-198`, `billing-console.tsx:1143-1157` | **filtra `isActive`** (una `.filter` in `page.tsx`). Il widget è **month-to-date**: un ex istruttore ha 0 minuti nel mese e `owedMtd` 0, quindi comparirebbe come una riga «0:00 · — / 0,00 €» — che **suggerisce** che non gli si deve niente. Il dovuto all-time vive su Compensi, che è la superficie che P4 nomina |
| Landing Panoramica istruttore | `dashboard/page.tsx:897`, `:915-917` | **nessuna modifica**: passa per `getOwnCompensationSummary` → `listActiveInstructors(personId)`, che resta la platea **attiva**. Un istruttore disattivato non ha una landing da leggere (`getOwnInstructorProfileId` risolve solo profili attivi) |

**AD-10 — Il lettore: due platee, UNA matematica, stesso budget di query.**
`listActiveInstructors` resta **byte-identica** (la usa anche `getOwnCompensationSummary`, che non deve cambiare comportamento). Si aggiunge **una** funzione gemella, e `computeSummaryRows` gira **una volta** sull'unione:

```ts
/** Ogni istruttore NON più attivo (persona archiviata O profilo disattivato) — la platea che P4 aggiunge. */
async function listInactiveInstructors(): Promise<InstructorRow[]> {
  const rows = await prisma.person.findMany({
    where: {
      instructorProfile: { isNot: null },
      OR: [{ archivedAt: { not: null } }, { instructorProfile: { deactivatedAt: { not: null } } }],
    },
    select: { id: true, firstName: true, lastName: true, instructorProfile: { select: { id: true, payoutRateCents: true } } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  …
}
```

(`isNot: null` è tipizzato: `InstructorProfileNullableScalarRelationFilter`, `src/generated/prisma/models/InstructorProfile.ts:391-394`.)
Poi: `computeSummaryRows([...active, ...inactive])` → si filtra **dopo** il calcolo (`!isActive && owedTotalCents !== 0`), perché «dovuto ≠ 0» è una proprietà **calcolata**. Costo sul carico: la lista `in` dei `groupBy` passa da 374 a 401 id — **+27**, una query in più (il `person.findMany` gemello), zero query per riga.
E la sostituzione del cuore:

```ts
// prima: 3 x sumMinutesByProfile + 3 x sumPayoutsByProfile, poi computeOwed(minuti, tariffa, pagato)
// dopo:  3 x sumSchoolFlightsByProfile + 3 x sumPayoutsByProfile, poi owed = accrued - paid (o null)
async function sumSchoolFlightsByProfile(ids: string[], bounds: VariantBounds) {
  const rows = await prisma.flight.groupBy({
    by: ['instructorProfileId'],
    where: { instructorProfileId: { in: ids }, flightType: 'SCHOOL', status: { not: 'CANCELLED' }, ...(bounds ? { flightDate: { gte: bounds.from, lte: bounds.to } } : {}) },
    _sum: { minutes: true, instructorPayoutCents: true },
    _count: { _all: true, instructorPayoutCents: true },
  });
  // per profilo: { minutes, accruedCents, unpricedFlights: _count._all - _count.instructorPayoutCents }
}
```

Il `where` **non cambia di una clausola**: stesso `flightType`, stesso `status`, stessi bound. `_count: { _all: true, instructorPayoutCents: true }` viaggia nella **stessa** query del `_sum` — idioma **provato** sul carico su `instructorAmountCents` (§4.5): `{"_sum":{"minutes":3551,"instructorAmountCents":182821},"_count":{"_all":40,"instructorAmountCents":40},…}`. `owed = unpricedFlights > 0 ? null : accruedCents - paidCents`.

**AD-11 — La migrazione: SQL a mano, backfill dentro, nessuno script.**
Idioma della casa (`20260722190000_add_expiry_type_kind`, `20260726090000_billing1_payment_method_payout_twin`): `npx prisma migrate dev --create-only`, poi si scrive il file. Nome: `20260910<HHMMSS>_flight_instructor_payout_snapshot`.

```sql
-- AlterTable
ALTER TABLE "Flight" ADD COLUMN     "instructorPayoutRateCents" INTEGER,
ADD COLUMN     "instructorPayoutCents" INTEGER;

-- Backfill (R-16-d): ogni volo con un istruttore la cui tariffa payout è
-- impostata OGGI riceve quella tariffa e il compenso arrotondato con la
-- STESSA regola di `centsForMinutes` — `round((rate * minutes) / 60)`.
-- L'uguaglianza fra questo `round(numeric)` e il `Math.round` del TS è
-- PROVATA su 11 700 300 coppie sintetiche e sulle 12 871 righe reali del DB
-- di carico (Dev Agent Record §…). I voli il cui istruttore NON ha tariffa
-- restano NULL: il compenso maturato è ignoto, non zero.
UPDATE "Flight" f
SET "instructorPayoutRateCents" = ip."payoutRateCents",
    "instructorPayoutCents" = (round((ip."payoutRateCents"::numeric * f.minutes) / 60))::int
FROM "InstructorProfile" ip
WHERE f."instructorProfileId" = ip.id
  AND ip."payoutRateCents" IS NOT NULL;
```

Nessun indice nuovo: il lettore raggruppa per `instructorProfileId`, che ha già `@@index([instructorProfileId])` (`schema.prisma:1085`), e sommare una colonna in più non cambia il piano. Gli indici sono lavoro dell'epic 17.

---

## §2 — Acceptance Criteria

### Lo snapshot sul volo

1. **Given** la migrazione **When** gira su un DB con dati **Then** `Flight` ha `instructorPayoutRateCents Int?` e `instructorPayoutCents Int?`, **entrambi con doc-comment** che nomina R-16-d, il lettore e il suo filtro `flightType: 'SCHOOL'`; e il doc-comment di `InstructorProfile.payoutRateCents` (`schema.prisma:129-138`) **non afferma più** che «there is no "what was the rate on date D" question»: dichiara che la domanda esiste, che la risposta è lo snapshot sul volo, e che la colonna vale **dai prossimi voli**.
2. **Given** il backfill **When** è finito **Then** ogni volo con istruttore e tariffa payout impostata porta `instructorPayoutRateCents` = la tariffa attuale e `instructorPayoutCents` = `round(tariffa × minuti / 60)`; i voli senza istruttore **o** con istruttore senza tariffa restano a `NULL` su **entrambe** le colonne (mai una sola delle due). Verifica su `airmanager_load`: **12 871** righe valorizzate, **3 211** con istruttore e senza tariffa lasciate a `NULL`, **0** righe con una colonna valorizzata e l'altra no.
3. **Given** il dovuto per istruttore prima e dopo la migrazione **When** il Dev Agent Record chiude **Then** riporta la misura: **248** istruttori su 319 cambiano dovuto, scarto max **9 c**, |Σ| **490 c**, netto **+220 c** — e **dichiara** che lo zero atteso dal piano non è raggiungibile perché l'arrotondamento passa dall'aggregato al singolo volo (AD-3). Nessun istruttore cambia di più di 1 centesimo **per volo**.
4. **Given** un volo con istruttore la cui tariffa payout è `3000` **When** lo registro per 90′ **Then** `flight.create` riceve `instructorPayoutRateCents: 3000` e `instructorPayoutCents: 4500`, calcolati con `centsForMinutes` — la **stessa** funzione che ha prodotto `instructorAmountCents` e `aircraftAmountCents` nella stessa chiamata.
5. **Given** un volo con istruttore **senza** tariffa payout, **oppure** senza istruttore **Then** entrambe le colonne sono `null`; `flight.create` le riceve esplicitamente `null` (mai `undefined`: una `data` con `undefined` lascia la colonna al default e nasconde l'intenzione).
6. **Given** un volo `SCHOOL` registrato **When** lo **storno** **Then** **nessuna** colonna del volo è riscritta e il dovuto dell'istruttore **scende esattamente dello snapshot di quel volo** — verificato leggendo il dovuto prima e dopo, non ricalcolandolo (AD-6).
7. **Given** un volo del passato con snapshot `4500` e una tariffa payout **oggi** diversa **When** lo **correggo** **Then** il volo originale esce dall'insieme sommato e il volo nuovo porta il **proprio** snapshot alla tariffa **corrente**; il doc-comment di `correctFlight` **dichiara** che correggere un volo vecchio ne ri-prezza il compenso, e perché (AD-6).

### Il lettore: il passato non si riscrive più

8. **Given** `getCompensationSummary` **When** calcola **Then** `owed*Cents = Σ instructorPayoutCents (voli SCHOOL non CANCELLED nella finestra) − Σ payout (per `periodEnd` nella finestra)`; `computeGrossCents` e `computeOwed` **non esistono più**, e `sumMinutesByProfile` è diventata la funzione che restituisce minuti **e** maturato **e** conteggio dei non prezzati in **una** `groupBy` per variante (6 query totali, come oggi).
9. **Given** 100 h già liquidate a 20,00 €/h (dovuto 0) **When** `setPayoutRate` porta la tariffa a 25,00 €/h **Then** il dovuto resta **0**: nessuna riga di `Flight` è stata toccata, quindi nessun euro del passato si muove. **È la discriminanza di MAJOR-1** (§4.4, oggi VERDE = difetto; deve diventare verde con l'aspettativa rovesciata).
10. **Given** un volo registrato **quando la tariffa payout non c'era** e una tariffa impostata **dopo** **Then** il dovuto di quell'istruttore è **`null`** («—»), non una somma parziale: la finestra contiene uno snapshot ignoto (AD-5). **E** il doc-comment nomina la via d'uscita (correggere il volo).
11. **Given** un istruttore senza tariffa e **senza voli** **Then** il dovuto è `0` (nulla è maturato, nulla è dovuto) — cambio di display **dichiarato** rispetto a oggi («—»), che riguarda **1** dei 401 profili del DB di carico.
12. **Given** `payoutRateCents` **When** viene modificato via il form dell'editor **Then** il campo porta un `hint` (slot esistente di `Field`, `field.tsx:35`) che dice che la tariffa vale **dai prossimi voli** — in **entrambi** i locale. È l'unica frase che rende visibile all'utente il cuore della story.

### Chi non c'è più non sparisce

13. **Given** un istruttore con persona archiviata **o** profilo disattivato e dovuto ≠ 0 **When** apro `/dashboard/instructors` **Then** compare in una sezione «Non più attivi, con dovuto» **sotto** il roster, con nome, ore totali e dovuto; la sezione **non è resa** quando è vuota. Sul DB di carico: **22** righe, **8 103,88 €**.
14. **Given** quella sezione **When** misuro il KPI **Then** «Totale dovuto» **include** quelle righe (carico: da 113 214,17 € a 121 320,03 €) e «Istruttori attivi» **no**; «Ore totali volate» le include; «Tariffa media payout» **no** (AD-8, tabella).
15. **Given** istruttori con dovuto **ignoto** **When** apro la pagina **Then** il KPI «Totale dovuto» porta nel suo `delta` il loro **conteggio** (carico: 81) — la cifra non si legge più come completa quando non lo è (secondo rilievo di MAJOR-2).
16. **Given** la sezione nuova **When** cerco azioni **Then** non ce ne sono: nessun «Modifica», nessun «Paga», nessun click sul nome, e «Ciclo pagamenti», `PaySlideOver`, `InstructorEditor`, `InstructorProfile` ricevono **solo** le righe attive (`items`) — invariati al byte.
17. **Given** i testid della sezione **Then** sono `inactive-instructor-row-{personId}` (desktop) e `mobile-inactive-instructor-row-{personId}` (mobile): **nessuno** dei due matcha `[data-testid^="mobile-instructor-row-"]`, che `e2e/mobile-a11y-sweep.spec.ts:283` usa con `.first()` per aprire l'editor (§5.5). Verifica obbligatoria: `grep -rn 'data-testid\^=' e2e/`.

### Una sola formula

18. **Given** `src/` dopo la story **When** censisco le conversioni ore→denaro **Then** ce n'è **una**: `money.ts#centsForMinutes`, con 3 call-site in `flights.service.ts`; `grep -rn "/ 60" src/server src/app --include=*.ts --include=*.tsx` non trova nessun altro sito che produca centesimi (le occorrenze di `time.ts`, `booking-schedule.ts`, `bookings.service.ts:330-331`, `reports-console.tsx:71` sono ore/minuti, non denaro).
19. **Given** 69′ a 15,10 €/h **When** registro il volo **Then** addebito istruttore e snapshot payout valgono **entrambi 1737** (half-up sull'esatto 1736,5) — il caso che oggi diverge (`1737` vs `1736`, sonda §4.4 terzo test). Un unit lo fissa **come uguaglianza fra i due numeri**, non come due letterali.

### Superfici, parità e non-regressione

20. **Given** l'export xlsx Compensi **When** lo scarico **Then** contiene le righe non-più-attive e una **quinta colonna «Stato»** (`Attivo`/`Non più attivo`, entrambi i locale); le colonne 1-4 restano al loro posto e con lo stesso formato numerico.
21. **Given** `/dashboard/reports` nel periodo corrente **When** un ex istruttore ha volato nel periodo **Then** la sua riga mostra il dovuto invece di «—» (conseguenza dichiarata di AD-9, con il suo unit in `stats.service.test.ts`); **Given** `/dashboard/billing` **Then** il widget Compensi resta **solo attivi** (AD-9).
22. **Given** l'OpenAPI **When** rigenero **Then** `instructorCompensationSummaryItemSchema` porta `isActive`, e le **due** descrizioni che oggi dichiarano il contrario sono corrette: `registry.ts:2032` («all ACTIVE instructors», «`payoutRateCents: null` -> `owed*Cents: null`») e `:2064` (stessa affermazione sul PUT rate). Nessun test copre le descrizioni (lezione 15.9): vanno cambiate a mano.
23. **Given** `prisma/seed-load.ts` **When** rigenero il DB di carico **Then** i suoi `flight.createMany` popolano le due colonne nuove (`:688-689` e `:759-760`, dalla mappa delle tariffe payout già disponibile in `instructorProfileRows`, `:348`); **Given** `prisma/seed-demo.ts` **Then** **nessuna** modifica (passa per il vero `registerFlight`, e imposta la tariffa payout a `:368-371`, **prima** dei voli a `:440` — verificato).
24. **Given** le tre fixture e2e che oggi registrano il volo **prima** della tariffa (`instructor-compensation.spec.ts:131`/`:144`, `:174`/`:176`, `:217`/`:218`) **Then** sono riordinate (tariffa prima, volo dopo) **e** nasce un test nuovo che asserisce il caso opposto: un volo registrato senza tariffa resta senza compenso, e impostare la tariffa dopo **non** lo riscrive (AC 10).
25. **Given** `npm run gates` **Then** passa; **Given** la suite e2e completa via `scripts/e2e.sh` su DB fresco **Then** 0 failed, con gli skipped ambientali noti dichiarati.

---

## §3 — Dev Notes: blast radius (misurato su `9272129`)

### 3.1 File da modificare

| File | Righe | Cosa |
|---|---|---|
| `prisma/schema.prisma` | `129-138` (doc-comment `payoutRateCents`), `1040-1044` (dopo `instructorAmountCents`) | 2 colonne nuove + 2 doc-comment |
| `prisma/migrations/20260910…_flight_instructor_payout_snapshot/migration.sql` | **nuovo** | `ALTER TABLE` + backfill (AD-11) |
| `src/lib/money.ts` | fine file | `centsForMinutes` (AD-4) |
| `src/server/services/flights.service.ts` | `348-366` (`ResolvedFlightInput` +2 campi), `465-475` (`findActiveInstructor`: `payoutRateCents` nel select **e** nel ritorno), `884` (usa `centsForMinutes`), `898-902` (2 campi nel ritorno), `937-939` (`RegisterFlightCoreInput` +2), `987` (usa `centsForMinutes`), `1010-1013` (2 campi in `flight.create`), `1147-1149` + `1523-1525` (2 campi ai due call-site), doc-comment `:45-53`/`:556-566` e `:1368-1382` (AD-6) | il volo congela la terza tariffa |
| `src/server/services/instructor-compensation.service.ts` | `27-38` (+`isActive`), `97-119` (invariata), **nuova** `listInactiveInstructors`, `120-139` → `sumSchoolFlightsByProfile`, `166-176` (**via** entrambe le funzioni), `179-210` (`computeSummaryRows`), `213-218` (`getCompensationSummary`: unione + filtro), `264-277`/`325-357` (`mtdGrossCents` = maturato dagli snapshot), `361-381` (`resolveActiveInstructorRow`: `isActive: true`), doc-comment del modulo `:13-24` | il lettore somma snapshot |
| `src/lib/schemas/instructor-compensation.ts` | `22-42` (doc-comment + `isActive`) | DTO + OpenAPI |
| `src/lib/schemas/registry.ts` | `2032`, `2064` | 2 descrizioni che oggi mentono |
| `src/app/[locale]/dashboard/instructors/page.tsx` | `49-54` (KPI e platee), `62-69` (`items` = solo attivi), `76`, `81-84`, + prop nuova e ~10 label | AD-8 |
| `src/app/[locale]/dashboard/instructors/instructors-console.tsx` | `39-45` (`InstructorRow` +`isActive`), `48-56` (labels), `95-101` (prop nuova), dopo `:184` (sezione desktop) e dopo `:230` (faccia mobile) | la sezione nuova |
| `src/app/[locale]/dashboard/instructors/instructor-editor.tsx` | `57` (label `hint`), `423` (`Field hint=`) | AC 12 |
| `src/app/[locale]/dashboard/billing/page.tsx` | `192` | `.filter((row) => row.isActive)` (AD-9) |
| `src/server/services/exports.service.ts` | `480-485` | colonna «Stato» |
| `messages/it.json`, `messages/en.json` | `InstructorsPage` | 8 chiavi (v. 3.4) |
| `prisma/seed-load.ts` | `584-589` (tipo), `660-661`, `688-689`, `733-734`, `759-760`, `794-795` | 2 campi nei `createMany` |

**Nessun** file nuovo oltre alla migrazione. **Nessuna** nuova env var, **nessuno** script/hook/CI da toccare (`src/lib/env.ci-sync.test.ts` non è coinvolto: nessun contratto d'ambiente cambia).

### 3.2 Test unit: quali fixture si stringono

`flights.service.test.ts` (2 335 righe, prisma **interamente mockato**, `$transaction` stand-in a `:160-166`):
- **`INSTRUCTOR_PROFILE_ROW` (`:211-216`) non ha `payoutRateCents`**. Appena `findActiveInstructor` lo seleziona, la fixture restituisce `undefined` → lo snapshot diventerebbe `undefined`. **Va aggiunto** lì e nei 3 `instructorProfile` inline: `:803`, `:816`, `:1385`. **È la trappola numero uno lato voli.**
- Le asserzioni su `flight.create` usano **tutte** `expect.objectContaining` (verificato sui 27 siti `flightCreateMock`): aggiungere due campi non rompe nulla **e non asserisce nulla** ⇒ servono asserzioni **nuove**, esplicite, sui due campi (AC 4/5) — mai un `objectContaining` allargato che passerebbe anche con le colonne assenti.
- `CREATED_FLIGHT_ROW` (`:220-250`) è la riga **restituita** dal mock (forma di `FLIGHT_SELECT`): per AD-7 **non** cambia.
- `flights-expiry-boundary.integration.test.ts:23-35` mocka `flight: { create }` e persone: da rileggere per la stessa fixture-istruttore.

`instructor-compensation.service.test.ts` (576 righe):
- `flightGroupBy.mockResolvedValue([{ instructorProfileId, _sum: { minutes: 130 } }])` compare in ~10 test. Dopo il fix ogni fixture deve dichiarare **anche** `_sum.instructorPayoutCents` e `_count` — cioè **dire quanto è maturato**, invece di lasciarlo dedurre da minuti × tariffa. È un **irrigidimento**: il test smette di ricalcolare la regola che verifica.
- Il test *«a null payoutRateCents (no rate set yet) yields a null owedMtdCents, never a fabricated 0»* (`:186`, con `stubZeroAggregates()`) **cambia contratto**: con 0 voli il dovuto è **0** (AC 11). Va **riscritto**, non cancellato: il `null` ora nasce da un **volo** non prezzato (AC 10), e il nuovo test lo dice. Il suo commento deve spiegare il cambio, altrimenti in review sembra un test indebolito.
- `instructorPersonRow` (`:100-109`) e `resolveActiveInstructorRow`: aggiungere `isActive` alle attese `toEqual` (sono uguaglianze esatte: `:193`, e altre).

`stats.service.test.ts:184-199` e `exports.service.test.ts:382-403`: i mock di `getCompensationSummary` sono `as never` (nessun errore di tipo), ma le fixture vanno completate con `isActive` **e** l'export va asserito sulla quinta cella in **entrambe** le righe (AC 20), aggiungendo una terza riga non-più-attiva.

### 3.3 Il censimento delle formule (per AC 18)

`grep -rn "60)" src --include=*.ts --include=*.tsx | grep -i "cent\|rate\|amount"` → oggi **3** siti di denaro (`instructor-compensation.service.ts:169`, `flights.service.ts:884`, `:987`) e **4** copie nel seed di carico (`seed-load.ts:659`, `:661`, `:732`, `:734`). Dopo la story: **1** funzione, 3 call-site, e le 4 copie del seed **dichiarate** (AD-4). Nessun altro sito del repo converte minuti in centesimi — verificato.

### 3.4 UI: cosa esiste già e cosa si aggiunge

- **Zero CSS nuovo**: la sezione riusa `.card`/`.card-head`/`.card-title`/`.card-sub`, `.students`/`.student-row`, e le due classi di scambio `instructors-desktop-body`/`instructors-mobile` (`airops.css:2500`, `:2518-2521`), più la famiglia `.mobile-row*` per la faccia telefono. Le colonne: `cols` del roster è `'minmax(160px,1.8fr) 120px 110px 130px minmax(160px,1.2fr)'` (`instructors-console.tsx:112`) — la sezione ne usa **quattro** (nome, tariffa, ore, dovuto), senza la colonna azioni.
- **`KPI` ha già lo slot `delta`** (`kpi.tsx:36`, reso in `.kpi-delta`): è lì che va il conteggio dei dovuti ignoti (AC 15), con `trend=''` (neutro — non è né buono né cattivo, è un'incompletezza).
- **`Field` ha già `hint`** (`field.tsx:35`, `.fld-hint`, muted, **esclusivo** con `error`): è lì che va la frase «vale dai prossimi voli» (AC 12).
- **8 chiavi i18n nuove** in `InstructorsPage`, entrambi i locale: `subInactive`, `kpi.owedUnknown`, `inactiveSection.title`, `inactiveSection.hint`, `table.status`, `status.active`, `status.inactive`, `editor.payoutRate.hint`. Parità: `python3 -c "import json;a=json.load(open('messages/it.json'));b=json.load(open('messages/en.json'));…"` — 0 chiavi asimmetriche (non esiste un test automatico: è una verifica del dev, come nelle story precedenti).
- **Verifica UI interattiva** col Playwright MCP (o lo script `@playwright/test` throwaway se il MCP non è disponibile, v. `HANDOFF.md`): a **1280** e **375**, nei **due temi**, misurando (a) che la sezione non compare quando è vuota, (b) contrasto del testo del dovuto ≥ 4,5:1, (c) altezza riga ≥ 44px a 375px, (d) che il roster attivo sopra è **invariato al centesimo** (screenshot/misura pre-post).

### 3.5 e2e: le fixture che cambiano (censimento completo)

| # | `file:riga` | Cosa fa oggi | Correzione |
|---|---|---|---|
| 1 | `instructor-compensation.spec.ts:123-166` | volo a `:131`, tariffa via **UI** a `:139-145`, poi attende `30,00 €` a `:149` | la tariffa va impostata **prima** del volo (l'interazione UI col form resta: è l'unica copertura di `instructor-payout-rate-form`). L'asserzione «`—` prima della tariffa» a `:137` **resta valida** (la cella *Tariffa* dice «—»), ma il commento va corretto: la cella *Dovuto* dirà **0,00 €**, non «—», perché non ci sono ancora voli |
| 2 | `instructor-compensation.spec.ts:167-196` | volo a `:174`, tariffa via PUT a `:176`; attende `owedTotalCents === 7000` | spostare il PUT **sopra** `:174`. Il numero **non cambia**: 120′ × 6000/60 = 12 000 sia per volo sia sull'aggregato |
| 3 | `instructor-compensation.spec.ts:209-229` | volo a `:217`, tariffa via PUT a `:218`; attende la riga nel ciclo pagamenti | spostare il PUT **sopra** `:217`. La riga «Unrated» resta fuori dal ciclo (dovuto 0, nessun volo) e mostra «—» sulla tariffa: aggiungere l'asserzione **esplicita sulla cella della tariffa** invece del `toContainText('—')` di riga, che è ambiguo |
| 4 | **nuovo** in `instructor-compensation.spec.ts` | — | AC 10 + AC 13/14: (a) volo **senza** tariffa → dovuto «—», tariffa impostata dopo → **ancora** «—»; (b) un istruttore con tariffa, volo e payout parziale, **disattivato** via API → compare nella sezione «non più attivi» e il KPI lo include |

Fixture **verificate non collidenti** (perché il censimento sia completo): `my-compensation.spec.ts:277` imposta la tariffa **prima** del volo di `:280` ⇒ i due KPI attesi (`120,00 €` lordo, `90,00 €` netto) restano esatti; `my-compensation.spec.ts:247-261` non registra voli ⇒ `0,00 €`/`-200,00 €` invariati; `mobile-registries.spec.ts:496` imposta la tariffa **prima** del volo di `:513` ⇒ «dovuti» resta; `mobile-self-public.spec.ts:782` imposta la tariffa e non registra voli; `flights.spec.ts:202` è un commento. **Nessun altro spec** legge `owed*`.
**Stato globale**: nessuna di queste scrive `AppSettings` ⇒ **niente** project serializzato nuovo in `playwright.config.ts`.

### 3.6 Misure sul DB di carico (query eseguite oggi, sola lettura)

```sql
-- 1. platee e tariffe
SELECT count(*) FROM "InstructorProfile";                                   -- 401
SELECT count(*) FROM "InstructorProfile" WHERE "payoutRateCents" IS NOT NULL;-- 319
-- 2. voli
SELECT count(*) FROM "Flight";                                              -- 60 487
SELECT count(*) FROM "Flight" WHERE "instructorProfileId" IS NOT NULL;      -- 16 082
SELECT count(*) FROM "Flight" WHERE "instructorProfileId" IS NOT NULL AND "flightType" <> 'SCHOOL'; -- 3 848
SELECT count(*) FROM "Flight" WHERE "flightType" = 'SCHOOL' AND "instructorProfileId" IS NULL;      -- 0
-- 3. MAJOR-2, quantificato
--    27 profili inattivi (persona archiviata E profilo disattivato su tutti e 27),
--    22 con dovuto != 0, 810 388 c = 8 103,88 EUR
-- 4. l'arrotondamento per volo vs sull'aggregato: 248/319, |Σ| 490 c, max 9 c, netto +220 c
-- 5. il KPI di pagina: 11 321 417 c -> 12 132 003 c
```

| Misura | Valore |
|---|---|
| righe che il backfill valorizza | **12 871** |
| righe con istruttore lasciate a `NULL` (istruttore senza tariffa) | **3 211** |
| istruttori con dovuto **ignoto** dopo (= prima) | **81** |
| istruttori nella sezione «non più attivi» | **22** (su 27 inattivi) |
| «Totale dovuto» prima → dopo | **113 214,17 € → 121 320,03 €** |

---

## §4 — Piano di test

### 4.1 Unit — `flights.service.test.ts`

| # | Caso | Asserzione |
|---|---|---|
| U1 | volo con istruttore, tariffa payout 3000, 90′ | `flight.create` riceve `instructorPayoutRateCents: 3000`, `instructorPayoutCents: 4500` |
| U2 | volo con istruttore **senza** tariffa payout | entrambe `null`; `instructorAmountCents` (addebito) **resta** valorizzato — le due tariffe sono indipendenti |
| U3 | volo **senza** istruttore | entrambe `null` |
| U4 | 69′ a tariffa payout 1510 **e** tariffa addebito 1510 | `instructorPayoutCents === instructorAmountCents === 1737` — **uguaglianza fra i due**, non due letterali (AC 19) |
| U5 | `correctFlight` che cambia i minuti | il volo nuovo porta lo snapshot dei **nuovi** minuti alla tariffa **corrente**; nessun `flight.update` tocca le due colonne |
| U6 | `cancelFlight` | **nessuna** delle due colonne nella `data` dell'`update` (l'unica scrittura è status/cancelledAt/cancelReason) |
| U7 | `findActiveInstructor` | il `select` chiede `payoutRateCents` (asserzione sull'argomento passato a `person.findUnique`) |

### 4.2 Unit — `instructor-compensation.service.test.ts`

| # | Caso | Asserzione |
|---|---|---|
| U8 | 100 h con snapshot per 200 000 c, payout 200 000 c | `owedTotalCents === 0` |
| U9 | **la stessa** storia, `payoutRateCents` del profilo cambiata a 2500 | `owedTotalCents` **ancora 0** — MAJOR-1 chiuso (AC 9) |
| U10 | finestra con un volo `instructorPayoutCents: null` | `owedTotalCents === null`, e **non** la somma dei soli noti (AC 10) |
| U11 | istruttore senza tariffa e senza voli | `owedTotalCents === 0` (AC 11) |
| U12 | roster: 1 attivo + 1 archiviato con dovuto ≠ 0 + 1 archiviato con dovuto 0 | 2 righe, `isActive` `true`/`false`, il terzo **assente** (AC 13) |
| U13 | il `where` di `listInactiveInstructors` | `{ instructorProfile: { isNot: null }, OR: [{ archivedAt: { not: null } }, { instructorProfile: { deactivatedAt: { not: null } } }] }` |
| U14 | il `where` di `sumSchoolFlightsByProfile` | `flightType: 'SCHOOL'`, `status: { not: 'CANCELLED' }`, bound — **invariato** rispetto a oggi (nessuna clausola aggiunta o tolta) |
| U15 | budget di query | `flight.groupBy` chiamata **3** volte e `instructorPayout.groupBy` **3** volte per un roster di N (mai N+1) |
| U16 | `mtdGrossCents` di `getOwnCompensationOverview` | = Σ snapshot della finestra mtd, **non** `minuti × tariffa` |
| U17 | `getOwnCompensationSummary` | usa ancora la platea **attiva** (un profilo disattivato → `null`) — AD-9 |

### 4.3 Unit — contorno

| # | File | Caso |
|---|---|---|
| U18 | `money.test.ts` (**nuovo** o esistente) | `centsForMinutes(1510, 69) === 1737`; `centsForMinutes(333, 30) === 167`; `centsForMinutes(rate, 0) === 0`; il confronto con la formula ritirata su `(1510, 69)` **documenta** perché una sola resta |
| U19 | `stats.service.test.ts` | un ex istruttore nel periodo corrente ora ha `owedCents` valorizzato (AC 21) |
| U20 | `exports.service.test.ts` | 3 righe (attiva prezzata, attiva senza tariffa, non-più-attiva): colonne 1-4 invariate + quinta cella `Attivo`/`Non più attivo` |

### 4.4 Le sonde discriminanti, già scritte ed **eseguite** oggi (pre-fix)

`/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/story-16-5/major-1-2.test.ts` (throwaway, **fuori** dal repo: `vitest.config.ts` include solo `src/**`; eseguita con un config di scratch e `node_modules` simlinkato). Usa l'idioma di mock di `instructor-compensation.service.test.ts` e un `person.findMany` che **applica davvero** il `where` del servizio a un roster di 2 — così la sonda misura **il filtro**, non una fixture scelta a mano. Esito **verbatim** di oggi:

```
 RUN  v4.1.9 /home/admin/AirManager

 ✓ …/story-16-5/major-1-2.test.ts > ledger-audit MAJOR-1 (pre-fix) — the payout rate is applied RETROACTIVELY to hours already settled > 100 h paid in full at 20,00 EUR/h -> owed 0; the SAME history re-read after setPayoutRate(25,00) -> owed +500,00 EUR 61ms
 ✓ …/story-16-5/major-1-2.test.ts > ledger-audit MAJOR-2 (pre-fix) — the instructor who left is unreachable, and the KPI reads complete > the roster of 2 answers 1 row: 1 000,00 EUR owed to the archived/deactivated instructor is in NO summary, and the "Totale dovuto" KPI says 0,00 EUR 6ms
 ✓ …/story-16-5/major-1-2.test.ts > ledger-audit MAJOR-2 (pre-fix) — the instructor who left is unreachable, and the KPI reads complete > the roster query REALLY carries the two exclusions (the filter is the defect) 5ms
 ✓ …/story-16-5/major-1-2.test.ts > ledger-audit MINOR-1 (pre-fix) — two formulas, and the payout one loses the half cent > 69 min at 15,10 EUR/h: the flight charge rounds UP to 1737, the payout rounds DOWN to 1736 1ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

**Quattro test verdi = i tre difetti**: (1) il dovuto passa da 0 a +500,00 € e a −200,00 € senza che un volo o un payout si muovano; (2) 1 000,00 € dovuti a un istruttore archiviato **non sono in nessun summary** e il KPI di pagina — calcolato con la riga esatta di `instructors/page.tsx:51` — dice **0,00 €**; (3) lo stesso rate×minuti dà 1737 all'addebito e 1736 al compenso.
Il dev **porta i casi 1 e 2 dentro** `instructor-compensation.service.test.ts` con l'aspettativa **rovesciata** (U9, U12) e cita nel Dev Agent Record **entrambi** gli output: questo (verde = difetto) e quello post-fix (rosso sul pre-fix simulato).

### 4.5 Le due prove che la migrazione non muove denaro per sbaglio

**(a) SQL ≡ TypeScript sulla formula tenuta.** Su `rate ∈ [1000, 40000] × minutes ∈ [1, 300]` (11 700 300 coppie):

| | somma | somma pesata `× (rate·301 + minutes)` |
|---|---|---|
| `Math.round((rate*minutes)/60)` (Node) | 601 639 468 750 | 4 832 281 482 578 978 300 |
| `round((rate::numeric*minutes)/60)` (Postgres 16) | 601 639 468 750 | 4 832 281 482 578 978 300 |

Due somme indipendenti identiche su 11,7 M punti: l'uguaglianza non è un caso di compensazione.
**(b) SQL ≡ TypeScript sulle righe reali.** Sulle 12 871 coppie `(payoutRateCents, minutes)` che il backfill toccherà nel DB di carico: **12 871** righe, somma **53 157 673**, somma pesata **38 510 736 413** — identiche nei due motori. Comandi e script in `…/scratchpad/story-16-5/{delta.mjs,backfill-pairs.psv}`; il dev **rieseguirà (b)** dopo la migrazione confrontando `SUM("instructorPayoutCents")` col numero qui sopra.
**(c) l'idioma `_count` del lettore, provato sul DB reale** (`…/scratchpad/story-16-5/groupby.test.ts`, su `instructorAmountCents` che è già `Int?`):

```
[{"_sum":{"minutes":3551,"instructorAmountCents":182821},"_count":{"_all":40,"instructorAmountCents":40},"instructorProfileId":"00309384-…"}, …]
```

⇒ `_sum` e `_count` (con `_all` **e** il conteggio dei non-nulli) viaggiano in **una** query: il budget resta 6.

### 4.6 Tabella guardia → discriminanza (ognuna provata **ROSSA** sul pre-fix simulato, con ripristino `sha256`)

| Comportamento | Pre-fix da simulare | Rosso atteso |
|---|---|---|
| snapshot scritto alla registrazione | togliere i 2 campi dalla `data` di `flight.create` | U1, U4, E-nuovo (a) |
| snapshot `null` senza tariffa | scrivere `0` invece di `null` | U2, U10 |
| dovuto dagli snapshot | tornare a `round(minuti/60 × tariffa)` | U9, E-1 |
| dovuto ignoto ≠ 0 | sommare i soli noti (`?? 0` dentro il `_sum`) | U10, E-nuovo (a) |
| platea che include chi è andato via | rimettere il solo `listActiveInstructors` | U12, E-nuovo (b) |
| filtro «dovuto ≠ 0» | mostrare tutti gli inattivi | U12 |
| KPI attivi ≠ KPI dovuto | contare `summary.length` per gli attivi | E-nuovo (b) |
| una sola formula | rimettere `computeGrossCents` | U4, U18 |
| backfill | eseguire la migrazione senza l'`UPDATE` | prova (b) di §4.5: somma 0 invece di 53 157 673 |

### 4.7 Gate

`npm run gates` (mai i 4 comandi separati). Suite e2e **solo** via `scripts/e2e.sh start` + `scripts/e2e.sh status` (mai `playwright test` in foreground), su **DB fresco** e build di produzione, con `export JOBS_SECRET=<non-placeholder>` prima del run (`HANDOFF.md`). Per una serie di run mirati: build una volta + `E2E_REUSE_SERVER=1`. Se ripetendo run mirati un login inizia a fallire sempre: è il cap anti-brute-force (`LoginAttempt`), non la story. La migrazione va provata **due volte**: su un DB fresco (`prisma migrate deploy` da zero) e su `airmanager_load` (dati veri, 60 487 voli) — con il tempo misurato e riportato.

---

## §5 — Trappole note

1. **`INSTRUCTOR_PROFILE_ROW` senza `payoutRateCents`** (`flights.service.test.ts:211-216`, più i 3 inline a `:803`, `:816`, `:1385`): il mock restituisce `undefined`, Prisma lo tratta come «campo non fornito», la colonna resta `NULL` e **U1 fallisce con un messaggio che sembra un bug del codice**. È la trappola numero uno.
2. **`undefined` vs `null` nella `data` di `flight.create`**: `instructorPayoutCents: cond ? x : null`, **mai** `cond ? x : undefined`. Con `undefined` la colonna resta al default e il test `objectContaining` passa comunque.
3. **Il caso «tariffa impostata dopo il volo» è il cuore dell'AC 10 e la suite e2e oggi lo dà per buono in 3 test** (§3.5): chi riordina le fixture senza aggiungere il test nuovo cancella la prova che il difetto è chiuso.
4. **«Ciclo pagamenti» filtra `(owedTotalCents ?? 0) > 0`** (`instructors-console.tsx:262`): un dovuto `null` (ignoto) resta fuori da quella lista. Comportamento **identico a oggi** per un istruttore senza tariffa, ma va dichiarato — non è la sezione «non più attivi» che lo risolve.
5. **`[data-testid^="mobile-instructor-row-"]`** è usato da `e2e/mobile-a11y-sweep.spec.ts:283` con `.first()`: un testid della sezione nuova che inizi con quel prefisso farebbe aprire al test la riga **sbagliata** (che non ha né editor né dettaglio) — e il fallimento sarebbe in un altro spec, su un'altra pagina. Nomi obbligati: `inactive-instructor-row-{id}` e `mobile-inactive-instructor-row-{id}` (AC 17).
6. **`activeCount = summary.length`** (`page.tsx:49`): con la platea allargata quella riga fa mentire il KPI «Istruttori attivi» **e** il `sub` di pagina. Va cambiata **insieme** alla platea, non dopo.
7. **La faccia mobile va aggiunta anche alla sezione nuova**: `.instructors-mobile` è `display: none` **fuori** dalla media query (`airops.css:2500`) e `display: block` dentro; una sezione con la sola tabella desktop **sparisce** a 375px, e nessun test desktop lo vede.
8. **`Field`: `hint` ed `error` sono esclusivi** (`field.tsx:46-47`) — l'hint della tariffa scompare quando il campo è in errore. È il comportamento voluto, ma un test che cerchi l'hint dopo un input invalido fallirebbe.
9. **`resolveActiveInstructorRow` (`:361-381`) risponde 404 su un profilo disattivato** e `recordPayout` 409 (`:438-442`): la sezione nuova **non** deve avere click sul nome né bottoni. Se il dev li mette «per simmetria», la review trova un 404 in faccia all'utente.
10. **La tariffa payout è letta FUORI dalla transazione** (`resolveFlightInput`, come tutte le altre tariffe: *«Rate lookups BEFORE any transaction»*, `:868-869`) — ma a differenza di `AircraftRate`/`InstructorRate` **è mutabile**. Esiste quindi una finestra di millisecondi in cui `setPayoutRate` concorrente fa congelare la tariffa vecchia. **Non si prende nessun lock**: sarebbe un lock nuovo su una colonna che un admin cambia due volte l'anno, per una finestra che nessun utente può osservare. Va **dichiarato** nel doc-comment, non chiuso.
11. **`mtdGrossCents`** (`:264-277`, `:346`) è oggi `round(mtdMinutes/60 × tariffa)`: se resta così mentre `owed` passa agli snapshot, la pagina «I miei compensi» mostra un **lordo** e un **netto** calcolati con due regole diverse, e la loro differenza smette di essere il pagato. Deve diventare Σ snapshot della finestra (U16).
12. **Le descrizioni OpenAPI non sono coperte da test** (`expect.arrayContaining` nel registry test): le due affermazioni false di `registry.ts:2032`/`:2064` non fanno protestare nessun gate (lezione 15.9).
13. **`prisma/seed-load.ts` va aggiornato o il DB di carico nasce senza snapshot**: la migrazione backfilla le righe **esistenti**, ma il seed inserisce righe **nuove** con `createMany` (bypassa il servizio). Senza le due colonne nel builder, ogni misura dell'epic 17 sul dovuto sarebbe zero.
14. **Non toccare `payoutRateCents` come colonna** (niente storicizzazione, niente tabella nuova): R-16-d ha scelto lo snapshot. Un diff su `instructor-rates.service.ts` o una migrazione con un `@@unique([instructorProfileId, validFrom])` è scope creep.

---

## §6 — Fuori scope DICHIARATO

| Voce | Perché fuori | Dove va |
|---|---|---|
| **Storicizzare `payoutRateCents`** (`InstructorRate`-style, prima opzione dell'audit) | R-16-d ha ratificato lo snapshot sul volo; la seconda opzione «non richiede migrazione dei dati esistenti» ma non risponde alla domanda «quanto ha maturato **questo** volo» | ratificato: nessun TD |
| **Liquidare un istruttore non più attivo** (`recordPayout` risponde 409 su un profilo disattivato, `:438-442`) | non è in P4, che chiede **visibilità** e **KPI**; cambiare quel 409 è una decisione operativa (si può pagare chi non lavora più? con quale traccia?) con un suo test dedicato (`instructor-compensation.service.test.ts:551`) | **domanda PO** in §7 + TD se la risposta è sì |
| **Il dettaglio (slide-over) di un istruttore non più attivo** (`resolveActiveInstructorRow` → 404) | la sezione è in sola lettura per AD-8; aprire il dettaglio richiederebbe rilassare anche quel 404 | dichiarato; segue la decisione PO sopra |
| **Storno di un `InstructorPayout`** (`schema.prisma:174-177`: *«no reversal concept for this MVP ledger»*) | preesistente, e con lo snapshot il dovuto negativo per **ricalcolo** non nasce più (nasce solo se si paga davvero più del maturato) | dichiarato |
| **Ri-prezzare i voli già registrati senza tariffa** (gli 81 istruttori / 2 399 voli) | riscriverebbe uno snapshot, cioè I5; la via d'uscita esiste ed è `correctFlight` volo per volo | dichiarato nel doc-comment + §7 |
| **Esporre le due colonne nel DTO del volo / in OpenAPI dei voli** | AD-7: nessun AC lo chiede, e `listFlights` ha un ramo own-access | dichiarato |
| **Le 4 copie della formula in `prisma/seed-load.ts`** (`:659`, `:661`, `:732`, `:734`) | un seed non è un percorso di dominio; sostituirle non è riconducibile alla richiesta (karpathy §3) — si aggiungono solo le due colonne | segnalato nel Dev Agent Record |
| **Indici nuovi su `Flight`** | `@@index([instructorProfileId])` esiste (`schema.prisma:1085`); sommare una colonna non cambia il piano | epic **17** |
| **Il widget Compensi di `/dashboard/billing` che mostri il dovuto all-time** | è un riquadro **month-to-date** per progetto; cambiarne la semantica è un'altra story | dichiarato (AD-9) |
| **`sumMinutesByProfile` che passi da `status: { not: 'CANCELLED' }` a `status: 'REGISTERED'`** | equivalenti (l'enum ha 2 valori); cambiare la clausola è churn senza effetto | dichiarato |
| **Il doc-comment di `people.ts:148`** («`InstructorProfile` having no own field left») | preesistente, non riconducibile a questa richiesta | segnalato nel Dev Agent Record |

---

## §7 — Riferimenti e domande

- **AC di contratto**: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` → «Story 16.5», «Architettura e vincoli», ratifica **R-16-d**.
- **Findings**: `_bmad-output/planning-artifacts/audit-2026-09-10/ledger-audit.md` → **MAJOR-1** (`:52-80`), **MAJOR-2** (`:82-119`), **MINOR-1** (`:286-314`), invarianti **I2/I4/I5/I7/I12/I13** (`:29-48`), **VC-8** (tariffe storicizzate corrette, da non toccare), **VC-7** (gli export riscorrono il servizio), **VC-12** (nessun aggregato su pagina).
- **Idioma «una funzione di dominio, N call-site»**: `_bmad-output/implementation-artifacts/aog-1b-avviso-prenotazioni-email.md` (`computeAogImpact`, 2 call-site, mai due implementazioni).
- **Idioma migrazione a mano + backfill**: `prisma/migrations/20260722190000_add_expiry_type_kind/migration.sql`, `20260726090000_billing1_payment_method_payout_twin/migration.sql`.
- **Codice**: `instructor-compensation.service.ts` (modulo `:13-24`, `listActiveInstructors:97`, `sumMinutesByProfile:122`, `sumPayoutsByProfile:148`, `computeGrossCents:167`, `computeOwed:173`, `computeSummaryRows:179`, `getCompensationSummary:213`, `getOwnCompensationSummary:242`, `getOwnCompensationOverview:325`, `resolveActiveInstructorRow:361`, `getInstructorCompensationDetail:393`, `recordPayout:467`, `setPayoutRate:532`); `flights.service.ts` (`FLIGHT_SELECT:185`, `ResolvedFlightInput:348`, `findActiveInstructor:465`, `resolveFlightInput:598`, `:884`, `registerFlightCore:977`, `:987`, `registerFlight:1085`, `cancelFlight:1304`, `correctFlight:1411`); `schema.prisma` (`InstructorProfile:125-155`, `InstructorPayout:157-193`, `Flight:962-1090`); `accounts.service.ts:730-735` (la regola opposta, argomentata); `kpi.tsx:36` (`delta`); `field.tsx:35` (`hint`); `airops.css:2500`, `:2518-2521` (lo scambio desktop/mobile).
- **Sonde di questa story** (fuori dal repo, usa-e-getta): `…/scratchpad/story-16-5/major-1-2.test.ts` (le 3 discriminanze), `groupby.test.ts` (l'idioma `_count` sul DB reale), `delta.mjs` + `school-flights.psv` + `backfill-pairs.psv` (le prove SQL≡TS).

**Domande PO (nessuna blocca la story)**

1. **Si può liquidare un istruttore non più attivo?** Oggi no: `recordPayout` risponde 409 su un profilo disattivato, quindi la sezione nuova mostra 8 103,88 € (sul carico) **senza** una via d'uscita nell'app — l'admin deve riattivare il profilo, pagare e disattivarlo di nuovo. **Raccomandazione**: sì, permetterlo (è il pagamento di un lavoro passato, non un'operazione su una risorsa attiva), come story separata con il suo 409 → 200 e il suo test. Questa story si limita a **mostrare** il dovuto, come P4 chiede.
2. **I voli volati quando la tariffa payout non c'era vanno ri-prezzati?** Sono 2 399 voli di 81 istruttori sul carico. Oggi e dopo la migrazione il loro dovuto è **ignoto** («—»). **Raccomandazione**: no, non massivamente (riscriverebbe uno snapshot, cioè I5); la via d'uscita per-volo è `correctFlight`, ed è la stessa che il dominio offre per una tariffa velivolo sbagliata.
3. **Correggere un volo vecchio ne ri-prezza il compenso alla tariffa di oggi** (AD-6): è la conseguenza inevitabile di una tariffa senza storia. Se il PO la considera indesiderabile, l'unico rimedio è la prima opzione dell'audit (storicizzare `payoutRateCents`), che R-16-d ha escluso — quindi la si dichiara, non la si aggira.

## Addendum della sessione principale (2026-09-10, ratifiche PO prima del dispatch)

Le tre domande aperte della ricognizione sono state ratificate dal PO (AskUserQuestion, 2026-09-10) e PREVALGONO su quanto scritto sopra dove divergono:

- **R-16-i — payout a istruttori non più attivi**: `recordPayout` ACCETTA un istruttore disattivato/archiviato purché abbia dovuto residuo > 0 (il 409 odierno resta solo per dovuto ≤ 0); la card «non più attivi, con dovuto» porta l'azione **Paga** come il roster attivo. Unit + e2e sul caso «ex istruttore con 1 000 € dovuti → payout 200 € → dovuto 800 €».
- **R-16-j — correzione di un volo**: `correctFlight` **eredita** `instructorPayoutRateCents` dal volo originale (stesso volo, dati sistemati) e ricalcola `instructorPayoutCents` con la stessa formula sui minuti corretti; NON usa la tariffa di oggi. Se l'originale non ha tariffa (v. R-16-k) la correzione usa la tariffa vigente dell'istruttore, se esiste, altrimenti 0.
- **R-16-k — voli con istruttore SENZA alcuna tariffa payout**: il dovuto è **0, non null** (decisione PO contro la raccomandazione «null + contatore»): backfill a 0 e registrazione a 0 quando la tariffa manca; il contatore «N voli senza tariffa» in UI DECADE. Le due colonne restano nullable SOLO per i voli senza istruttore; per ogni volo con istruttore sono sempre valorizzate. Adeguare AC, migrazione e prove di parità di conseguenza; dichiarare nel Dev Agent Record quanti voli del DB di carico ricevono 0 (attesi 2 399).

---

## Dev Agent Record (2026-11-03, dev Opus 5 xhigh — un solo subagent)

**Commit**: `caeb973` `feat(16.5): …` (implementazione + test, pathspec). Questo record: commit `docs(16.5): Dev Agent Record …` (solo questo file). `sprint-status.yaml` e `HANDOFF.md` NON toccati (li aggiorna la sessione principale). Skill applicate: `bmad-dev-story`, `karpathy-guidelines`, `design-taste-frontend` (design read: «estensione di un pannello admin — fuori dallo scope landing della skill, §13 — per il tesoriere, nel linguaggio AirOps esistente: zero linguaggio visivo nuovo»), `ui-ux-pro-max` (checklist: target 44 px, gap ≥ 8 px, stato a testo e non solo a colore, gerarchia della lista secondaria, sezione assente quando vuota).

### File toccati (30 + 1 migrazione nuova; `git show --stat caeb973`)

| File | Cosa |
|---|---|
| `prisma/schema.prisma` | `Flight.instructorPayoutRateCents Int?` + `instructorPayoutCents Int?` con doc-comment (R-16-d/k, lettore e filtro SCHOOL, Q-16.5-a, R-19-d); doc di `InstructorProfile.payoutRateCents` riscritto (la domanda «tariffa al giorno D» esiste, risposta = snapshot, vale dai prossimi voli); doc `Flight.noCharge` e lista degli snapshot del modello |
| `prisma/migrations/20261103120000_flight_instructor_payout_snapshot/migration.sql` | **nuovo** — `ALTER TABLE` (DDL generato con `prisma migrate diff`) + backfill `COALESCE(ip."payoutRateCents", 0)` su TUTTI i voli con istruttore (AD-11 §R) |
| `src/lib/money.ts` (+ `money.test.ts`) | `centsForMinutes` — l'unica conversione ore→denaro |
| `src/server/services/flights.service.ts` | `findActiveInstructor` legge `payoutRateCents`; `OriginalFlightIdentity.instructorPayoutRateCents`; regola Q-16.5-a in `resolveFlightInput`; `buildFlightWrite` scrive i 2 campi (mai azzerati da `noCharge`); `updateFlight` legge la tariffa congelata dell'originale; `:646`/`:861` → `centsForMinutes`; doc del modulo, di `resolveFlightInput`, `buildFlightWrite`, `updateFlight` |
| `src/server/services/bookings.service.ts` | costo stimato → `centsForMinutes` (D-R2) |
| `src/server/services/instructor-compensation.service.ts` | `owed*` = Σ snapshot − payout (via `computeGrossCents`/`computeOwed`); `sumSchoolFlightsByProfile` (`_sum: { minutes, instructorPayoutCents }`, stesso `where`); `listInactiveInstructors`; `getCompensationSummary` = unione + filtro `isActive \|\| owedTotalCents !== 0`; `isActive` sulla riga; `mtdGrossCents` = Σ snapshot mtd; `resolvePayableInstructorProfileId` (R-16-i, 409 `INSTRUCTOR_NOTHING_OWED`); `owed*`/`mtdGrossCents` → `number` (D-R1) |
| `src/lib/schemas/instructor-compensation.ts`, `src/lib/schemas/registry.ts` | DTO: `owed*` non più nullable, `isActive`; 4 descrizioni OpenAPI (summary + description del GET, POST payout con `INSTRUCTOR_NOTHING_OWED`, PUT rate) |
| `src/server/services/exports.service.ts` | quinta colonna «Stato» (`Attivo`/`Non più attivo`) |
| `src/server/services/stats.service.ts` | solo doc-comment (AD-9: l'ex istruttore col dovuto ≠ 0 compare da sé) |
| `src/app/[locale]/dashboard/instructors/page.tsx` | KPI per platea (attivi / ore+dovuto su entrambe / media solo attivi con tariffa), `sub` + clausola `subInactive`, `inactiveItems` |
| `src/app/[locale]/dashboard/instructors/instructors-console.tsx` | card `InactiveInstructorsCard` (desktop + mobile), Paga sugli ex con dovuto > 0, «Compensi da liquidare» = unione con badge «Non più attivo», 409 mappato in `PaySlideOver`, «—» → importo |
| `src/app/[locale]/dashboard/instructors/instructor-editor.tsx`, `instructor-profile.tsx` | `hint` sul campo del compenso (AC 12); dovuto sempre un importo |
| `src/app/[locale]/dashboard/billing/page.tsx`, `billing-console.tsx` | widget solo attivi (AD-9); dovuto mese sempre un importo |
| `src/app/[locale]/dashboard/page.tsx`, `my-compensation/page.tsx` | landing istruttore e «I miei compensi»: dovuto/maturato sempre un importo |
| `src/styles/airops.css` | `.mobile-row-static` (3 dichiarazioni, dentro il blocco ≤ 640 px) — D-e; le due classi di scambio della card aggiunte alle liste esistenti — D-o |
| `messages/it.json`, `messages/en.json` | +8 chiavi (`subInactive`, `inactiveSection.title/hint`, `table.status`, `status.active/inactive`, `editor.payoutRate.hint`, `pay.nothingOwed`), −1 (`editor.payoutRate.noValue`, orfana) |
| `prisma/seed-load.ts` | i 2 campi nel `createMany` dei voli (`centsForMinutes`, tariffa `?? 0`) |
| Test unit | `flights.service.test.ts`, `instructor-compensation.service.test.ts`, `exports.service.test.ts`, `stats.service.test.ts`, `money.test.ts` |
| Test e2e | `instructor-compensation.spec.ts` (3 fixture riordinate + 3 test nuovi), `reports.spec.ts` (null → 0, «—» → «0,00 €»), `flight-no-charge.spec.ts` (commento: guardiano di R-19-d), `mobile-registries.spec.ts` (commento stantio + guardia della tab bar che conta le righe statiche, D-o) |

### AC per AC (con la lettura di §R/§R-PO)

| AC | Esito | Evidenza |
|---|---|---|
| 1 | ✅ | colonne + doc-comment in `schema.prisma` (Flight, `noCharge`, `payoutRateCents`) |
| 2 | ✅ misurato | backfill su `airmanager_load`: **15 697** righe valorizzate (12 513 con la tariffa, **3 184 a 0/0** — R-16-k; la cifra 2 399 del vecchio carico non vale più, D-R4), **0** con una sola colonna, **44 321** voli senza istruttore NULL/NULL |
| 3 | ✅ misurato | 319 istruttori con tariffa: **249** cambiano dovuto, scarto max **12 c**, \|Σ\| **479 c**, netto **+259 c**; mai più di 1 c per volo (peggiore 0,273 c/volo su 9 532 voli SCHOOL, 0 violazioni). Lo zero del piano non è raggiungibile: l'arrotondamento passa dall'aggregato al singolo volo (AD-3) |
| 4 | ✅ | U «freezes the payout rate … 3000 / 4500» (asserzioni esplicite, mai `objectContaining`) |
| 5 | ✅ (R-16-k) | istruttore senza tariffa → **0/0**; senza istruttore → `null`/`null` esplicito (`toHaveProperty(…, null)`) |
| 6 | ✅ | e2e «editing … deleting it lowers the owed by exactly its snapshot»: 4500 → 0 dopo `DELETE`, nessun codice nuovo in `deleteFlight`. **Conseguenza dichiarata**: cancellare un volo già liquidato porta il dovuto sotto zero |
| 7 | ✅ (Q-16.5-a) | 5 unit `updateFlight` (stesso istruttore tiene 2400 e 0; altro istruttore → sua tariffa / 0; nessun istruttore → null) + e2e 60→90′ = 4500 con la tariffa congelata (oggi 6000 darebbe 9000) |
| 8 | ✅ | `computeGrossCents`/`computeOwed` non esistono più; 3 + 3 `groupBy` (U15) |
| 9 | ✅ | U «100 h paid in full … owed stays 0 whatever the payout rate is TODAY» (tariffe 2000/2500/1800/null) + e2e (6000 dopo il volo: dovuto resta 3000) |
| 10 | ✅ (R-16-k) | e2e «a flight registered while the instructor had no payout rate stays at 0 …»: 0 → (tariffa) 0 → secondo volo 5000 (mai 10 000) |
| 11 | ✅ | dovuto 0 per ogni istruttore senza tariffa; «—» → «0,00 €» su roster, sheet, profilo, editor, I miei compensi, landing, widget Contabilità, Statistiche (periodo corrente) |
| 12 | ✅ | hint «Vale dai prossimi voli: …» (IT/EN), e2e lo legge; nessun «payout» in `it.json` (guardia `BANNED` verde) |
| 13 | ✅ | card «Non più attivi, con dovuto» sotto il roster, assente se vuota; carico: **22** righe, **8 390,36 €** |
| 14 | ✅ | KPI «Totale dovuto» include le righe; e2e: uguaglianza **nello stesso render** (KPI = Σ celle di roster + card; ore idem; «Istruttori attivi» = righe del roster) — nessun confronto fra due istanti (AC 14) |
| 15 | OBSOLETE (§R) | — |
| 16 | ✅ (R-16-i) | Paga sulla card (solo dovuto > 0, D-b); `PaySlideOver` riceve le righe; 409 `INSTRUCTOR_NOTHING_OWED` mappato («Questo istruttore non è più attivo e non ha compensi da liquidare.», verificato a mano); dettaglio 404 invariato (Q-16.5-c, unit + e2e) |
| 17 | ✅ | testid `inactive-instructor-row-{id}` / `mobile-inactive-instructor-row-{id}` / `inactive-instructor-pay-{id}[-mobile]`; `grep -rn 'data-testid\^=' e2e/` → nessuna collisione (`mobile-a11y-sweep.spec.ts:283` invariato) |
| 18 | ✅ | censimento `grep -rn "/ 60)" src/server src/app src/lib`: unica conversione in denaro `money.ts#centsForMinutes` (call-site: `flights.service.ts` ×3, `bookings.service.ts` ×2, `seed-load.ts` ×1); il resto è ore/minuti. Seed: v. D-m |
| 19 | ✅ | U «69 min at 15,10 €/h … the SAME number» (uguaglianza fra i due campi, poi 1737) |
| 20 | ✅ | unit export a 3 righe (attiva con tariffa, attiva senza → 0, non più attiva), IT + EN |
| 21 | ✅ | unit `stats.service.test.ts` (ex istruttore col dovuto → valorizzato; fuori dal summary → `null`); billing filtra `isActive` |
| 22 | ✅ | `isActive` nello schema; 4 descrizioni corrette a mano (nessun test le copre) |
| 23 | ✅ | `seed-load.ts` popola i 2 campi; `seed-demo.ts` invariato (tariffa `:370` prima dei voli `:444`) |
| 24 | ✅ | tre fixture riordinate (tariffa prima del volo; l'interazione UI col form resta); test nuovi (a) AC 10, (b) ex istruttore 1 000 → 200 → 800 → 0 + 409, (c) modifica Q-16.5-a + cancellazione |
| 25 | v. «Gate» ed «e2e» | |

### Prima/dopo su `airmanager_load` (rigenerato dalla sessione principale col `seed-load.ts` di HEAD, `LOAD_SEED_EXIT=0`)

Script di misura (sola lettura) `…/scratchpad/story-16-5/measure.mjs`: il «prima» applica la formula di HEAD verbatim (`Math.round((minuti/60)*tariffa) − pagato`, `null` senza tariffa), il «dopo» somma gli snapshot.

| Misura | Prima (HEAD) | Dopo (migrazione) |
|---|---|---|
| profili istruttore / con tariffa / non più attivi | 401 / 319 / 27 (archiviato ⟺ disattivato su tutti e 27) | invariato |
| istruttori con dovuto `null` | **82** (81 con minuti SCHOOL, 0 con payout) | **0** (R-16-k: tutti a 0) |
| voli / con istruttore / non-SCHOOL con istruttore / SCHOOL senza istruttore | 60 018 / 15 697 / 3 745 / 0 | invariato |
| «Totale dovuto» (KPI) | **110 752,97 €** (soli attivi) | **119 145,84 €** = +8 390,36 € (MAJOR-2: 22 ex istruttori, tutti positivi) +2,51 € (arrotondamento per volo sugli attivi) |
| «Ore totali volate» | 16621:38 | 17589:33 (+967:55 degli ex istruttori mostrati) |
| card «non più attivi» | invisibile (8 390,28 € con la formula vecchia) | 22 righe, 8 390,36 € |
| migrazione | — | `migrate deploy` 1,69 s wall, 0,59 s registrati in `_prisma_migrations` |

**Prova SQL ≡ TS sulle righe reali (§4.5 b, rieseguita)**: sulle 15 697 coppie `(COALESCE(tariffa,0), minuti)` `SUM("instructorPayoutCents")` = **51 759 840** e somma pesata `× (tariffa·301 + minuti)` = **44 006 076 143 785**, identiche fra Postgres (`round(numeric)`) e Node (`Math.round((r*m)/60)`).
La migrazione «da zero» non è stata eseguita su un DB nuovo (divieto di creare/cancellare DB): applicata incrementalmente su `airmanager` (e2e) e su `airmanager_load` — v. D-l.

### Discriminanze rosse sul pre-fix

**(1) Mutanti unit su copia isolata** (`…/scratchpad/story-16-5/iso`: `cp` di `src` + `messages` + config, `node_modules` in symlink; script `mutants.py`, ripristino con controllo sha256 dopo ogni mutante; baseline finale ripristinata 311/311 verdi):

| Mutante (pre-fix simulato) | Rossi |
|---|---|
| M1 snapshot non scritto alla registrazione | 11 (U AC 4, AC 5, R-16-k, AC 19, R-19-d, i 5 di Q-16.5-a, «writes every input … column») |
| M2 senza tariffa → `null` invece di 0 | 2 |
| M3 dovuto ricalcolato dalla tariffa di oggi (MAJOR-1) | 3 (U9, AD-3, U16 lordo mtd) |
| M4 summary = soli attivi (MAJOR-2) | 4 (U12, U13, U15, 1 000 → 800) |
| M5 nessun filtro «dovuto ≠ 0» | 1 (U12) |
| M6 la modifica prende la tariffa di oggi anche a istruttore invariato | 2 |
| M7 formula ritirata sull'addebito istruttore | 1 (AC 19) |
| M8 `centsForMinutes` con la formula ritirata | 3 |
| M9 `recordPayout` rifiuta l'ex istruttore (pre R-16-i) | 4 |
| M10 nessun controllo dovuto > 0 | 2 |
| M11 persona archiviata non contata come «non più attiva» | 1 |
| M12 `noCharge` azzera il compenso | 1 |
| M13 export senza «Stato» | 2 |

Nessun mutante equivalente fra questi; `bookings.service.ts` → `centsForMinutes` è **equivalente per costruzione** (stessa formula), dichiarato: nessun test può distinguerlo.

**(2) e2e sul codice di HEAD**: build di `c3b11a9` (`git archive` in scratchpad, `next build --webpack` con `ignoreBuildErrors` SOLO in quella copia — turbopack rifiuta il `node_modules` in symlink) servita su :3100 (`timeout 900`), con un config Playwright di scratch (PORT 3100), via `scripts/e2e.sh start --config …`: **6 rossi / 8 verdi**, esattamente gli attesi — fixture 1 e «unrated» (`"—"` invece di `0,00 €`), (a) AC 10 (dovuto ≠ 0 dopo la tariffa), (c) dopo il cambio tariffa 6000 ≠ 3000 (MAJOR-1), (b) riga `undefined` (MAJOR-2), `reports.spec.ts` (`owedCents: null`). Verdi su HEAD: idempotenza, header obbligatorio, RBAC, export.

**(3) Sonda MAJOR-1/2 della ricognizione (§4.4)**: portata nel file dei test con l'aspettativa rovesciata (U9 «100 h paid in full…», U12 «lists the active instructors, then those no longer active…»); il suo rosso sul pre-fix è M3/M4 sopra.

### Verifica UI interattiva (niente MCP: script `playwright` throwaway `…/scratchpad/story-16-5/ui-check.mjs`, fixture run-unique via API, build di produzione)

1280 e 375 px, temi chiaro e scuro (screenshot in `…/scratchpad/story-16-5/shots/`): card presente solo con righe; riga dell'ex istruttore con dovuto 187,50 € → Paga presente; ex istruttore pagato in eccesso (−120,00 €) → riga presente, **nessun** Paga; ex istruttore a dovuto 0 → assente. Contrasti (sRGB via canvas, i token sono oklch): dovuto 18,79 : 1 chiaro / 15,74 : 1 scuro a 1280; testi `--ink-3` (hint, note, sub mobile) 4,85 / 5,72; testo del Paga 7,85 / 9,30. Riga mobile: `<div>` (non trigger), 67 px; Paga mobile **44 px**; nessun overflow orizzontale a 375. «Compensi da liquidare»: riga dell'ex istruttore con badge «Non più attivo», precompilazione = dovuto. 409 provocato a mano (dovuto azzerato dietro la UI) → messaggio `pay.nothingOwed`. Hint dell'editor presente. EN: `sub` «… · N no longer active, still owed», titolo card «No longer active, still owed». Copia dell'hint della card accorciata dopo lo screenshot a 375 (4 righe → 2-3).

### Gate

`npm run gates` (finale, dopo l'ultima modifica, prima del commit): **PASS lint (38 s) · PASS typecheck (5 s) · PASS test (13 s) — 2238 passed (baseline 2211, +27) · PASS build (34 s)**. File di test che importano servizi «grossi» verificati anche con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run …` (verdi).

### e2e

- Mirato (build di questa story su :3000, `E2E_REUSE_SERVER=1`, `--no-deps`): `instructor-compensation` + `flight-no-charge` + `reports` + `my-compensation` → **25 passed, E2E_EXIT=0**.
- **HEAD come discriminante** (v. sopra): 6 rossi attesi / 8 verdi.
- **Suite completa** (`scripts/e2e.sh start`, `CI=1 E2E_REUSE_SERVER=1`, build turbopack di questa story su :3000, avviata 23:28, log `…/scratchpad/story-16-5/full-suite-1.log`): **534 passed, 19 failed, 2 flaky, 54 did not run** (la catena serializzata non parte se il main fallisce), 19,6 min, `E2E_EXIT=1`. Classificazione dei 19:
  - **2 regressioni MIE, corrette dopo il run** (D-o): `mobile-registries.spec.ts:503` (strict mode: `.instructors-desktop-body` trovava 2 nodi, la card riusava le classi di scambio del roster) e `:588` (`instructors@320 checked 0`: la pagina può finire con righe NON controlli della card). Correzione: classi proprie `inactive-instructors-desktop-body`/`inactive-instructors-mobile` + la guardia della tab bar conta anche `.mobile-row-static`.
  - **17 ambientali, nessuna sul codice della story**: tutte nascono da un `POST /api/v1/bookings` → 422 `BOOKING_OUTSIDE_WINDOW` (verificato con una sonda sul server: «Booking cannot be made more than 3650 day(s) in advance» per i fixture del 2099 e «must fall within the 00:00–23:59 operating window» per quelli «adesso + 1 h» alle 23:30). Causa: i MIEI run mirati precedenti con `reports.spec.ts --no-deps` hanno lasciato `PERMISSIVE_SCHEDULING` (`maxAdvanceDays: 3650`) — nella suite normale quel project gira DOPO il main — più l'ora (23:30). Tocchi della story su `bookings.service.ts`: solo `centsForMinutes` nel costo stimato, formula identica (mutante equivalente).
  - flaky: `socket hang up` / `ECONNRESET` (classe TD-19.10-g).
- **Run mirato di verifica della correzione** (build webpack dell'albero corrente in una copia di scratch su :3200 — il :3000 non era riavviabile, v. trappole —, config di scratch, `--no-deps`): `mobile-registries` + `instructor-compensation` + `mobile-a11y-sweep` + `person-save` + `home-dashboard` → **59 passed, 1 failed**: `home-dashboard.spec.ts:228` («domani» a mezzanotte meno dieci, classe date-rollover 23:40-01:00, nessun istruttore coinvolto). Log `…/scratchpad/story-16-5/targeted-3200.log`.
- **L'arbitro va rifatto dalla sessione principale su DB fresco, fuori dalla finestra 23:40-01:00**: questo record non ha un run completo verde da citare.

### Deviazioni

- **D-a** — chiave `editor.payoutRate.noValue` rimossa: resa orfana dal dovuto sempre numerico (karpathy §3). Saldo i18n +8 −1.
- **D-b** — sulla card «non più attivi» **Paga** compare solo con dovuto > 0: una riga a dovuto negativo (pagato più del maturato) non ha niente da pagare e il server risponderebbe 409; il 409 resta comunque mappato per la corsa.
- **D-c** — «non più attivo» in `recordPayout` = persona archiviata **o** profilo disattivato (la regola del summary). Prima una persona archiviata con profilo ancora attivo era pagabile senza condizioni; ora serve dovuto > 0. `setPayoutRate` invariato (solo profilo attivo). Il 409 «nessun profilo istruttore» resta `CONFLICT` (messaggio: «This person has no instructor profile.»).
- **D-d** — `computeSummaryRows` restituisce `{ item, mtdAccruedCents }`: il lordo mtd di «I miei compensi» è Σ snapshot della finestra senza una settima query e senza far trapelare campi nel DTO.
- **D-e** — AD-8 diceva «zero CSS nuovo»: con Paga sulla riga mobile (R-16-i/Q-16.5-c) serve una quarta traccia e il bottone da 44 px → `.mobile-row-static` (3 dichiarazioni nel blocco ≤ 640 px, nessun colore nuovo).
- **D-f** — `listActiveInstructors` non più byte-identica: aggiunge `isActive: true` alla riga (comportamento invariato).
- **D-g** — e2e `reports.spec.ts:230/248` aggiornato (`null` → `0`, «—» → «0,00 €»): fuori dal censimento di §R AC 24, conseguenza diretta di R-16-k/AC 11.
- **D-h** — U6 (`deleteFlight` non tocca le colonne) non scritto come unit: `deleteFlight` non ha un ramo `update` da asserire; l'effetto è coperto dall'e2e (AC 6).
- **D-l** — migrazione non provata «da zero» su un DB nuovo (divieto di creare/droppare DB): la prova da zero è il reset della sessione principale prima della review e la CI.
- **D-m** — `seed-load.ts`: le due copie della formula dell'addebito (`:636`, `:638`) e la terza del seed (`:1163`, importi dei payout generati con `Math.round((minuti/60)*tariffa)`) **non toccate** (un seed non è un percorso di dominio, AD-4); solo la colonna nuova usa `centsForMinutes`.
- **D-n** — e2e: nuovo selettore `[data-testid^="instructor-row-"]` (dentro `page.evaluate`, non strict mode) per l'uguaglianza KPI nello stesso render — un futuro `instructor-row-{id}-mobile` lo raddoppierebbe (stessa regola di CLAUDE.md).
- **D-o** — la card «non più attivi» NON riusa le classi di scambio del roster (`instructors-desktop-body`/`instructors-mobile`, come proponeva AD-8): `mobile-registries.spec.ts` le tratta come un nodo per pagina (strict mode). Classi proprie aggiunte alle due liste di selettori esistenti di `airops.css`; e la guardia «niente sotto la tab bar» di `mobile-registries.spec.ts:588` conta anche le righe `.mobile-row-static` (contenuto, non controlli: senza, la pagina che finisce con la card rende il controllo vacuo).

### Domande aperte per il PO (nessuna blocca)

1. D-b: nascondere Paga su un ex istruttore a dovuto negativo va bene?
2. D-c: una persona archiviata col profilo istruttore ancora attivo ora è pagabile solo con dovuto > 0 (prima sempre) — confermi?
3. Nessun tetto all'importo e nessun lock sul controllo (R-16-i): due pagamenti concorrenti possono passare entrambi e lasciare un dovuto negativo, visibile nella card — dichiarato.

### Per il reviewer (trappole trovate)

- **Server ancora vivo**: :3000 PID `2072930` (`next start` avviato da me per i run mirati; il classifier ha negato il suo arresto). **Va fermato prima di ogni suite `CI=1`** (un server in ascolto fa fallire il run) e, dopo l'ultimo `npm run gates`, serve una `.next` riscritta: non usarlo. I server di scratch :3100 (HEAD) e :3200 (albero corrente) si spengono da soli (`timeout`).
- **AppSettings globali inquinate**: `sched.*` = `PERMISSIVE_SCHEDULING` di `reports.spec.ts` (`maxAdvanceDays: 3650`) lasciato dai miei run `--no-deps` — rompe ogni fixture di prenotazione nel 2099. Lezione: un run mirato `--no-deps` di uno spec della catena serializzata cambia lo stato globale per i run successivi sullo stesso DB.
- **DB e2e sporco**: fixture delle mie verifiche UI (ex istruttori a dovuto negativo nella card) e dei run mirati — resettare prima della review (la sessione principale lo prevede).
- `airmanager_load` ha ora la migrazione applicata (D-R4: la sessione principale lo rigenera/cancella).
- Il filesystem root è al **99 %** (≈ 400 MB liberi) durante questa sessione.
- Trappola n. 1 della story confermata: `INSTRUCTOR_PROFILE_ROW` senza `payoutRateCents` → `undefined` → `?? 0` avrebbe nascosto il difetto (0 invece di 3000); la fixture ora la porta.
- `personFindMany` nei test del compenso: con due platee il mock a valore fisso restituisce la stessa persona due volte (attiva E non più attiva) — `stubRoster` applica davvero il `where` del servizio.

### Change Log

- 2026-11-03 — implementazione completa (snapshot del compenso sul volo, backfill, lettore sugli snapshot, ex istruttori visibili e pagabili, una sola formula), Status → `review`.

## Decisioni PO sulla review (2026-11-04, AskUserQuestion, prima del fix)

Report: `16-5-review-report.md` (SHIPPABLE-WITH-FIXES; arbitro del reviewer su DB fresco 609/609, `E2E_EXIT=0`).

- **I-1 / domanda 2 — due pagamenti contemporanei allo stesso ex istruttore** = **BLOCCARE** (ribalta la risposta «basta dichiararlo» della notte, data su una descrizione imprecisa della sessione principale: i due pagamenti passano entrambi e la cassa registra due uscite). Il controllo «dovuto > 0» di `recordPayout` va deciso **sotto lock** (lock della riga del profilo istruttore o advisory per profilo dentro la transazione del payout, dovuto ricalcolato sotto lock): il secondo pagamento concorrente → 409 `INSTRUCTOR_NOTHING_OWED`. Discriminanza: la sonda concorrente del reviewer (201/201 → dovuto −155 €) diventa 201/409.
- **F3 / domanda 1 — istruttore cambiato e poi rimesso** = si dichiara e basta (regola Q-16.5-a: la tariffa congelata vale solo se l'istruttore non cambia); scriverlo nel doc-comment di `updateFlight` e nel record.
- **F1 / domanda 3 — archiviato col profilo attivo** = come il disattivato: il dettaglio (`?personId=`) risponde **404**, coerente con Q-16.5-c e con la descrizione OpenAPI già scritta; idem `setPayoutRate` su un archiviato → 409 come sul disattivato (oggi 200, nota Info del reviewer). Unit accanto a «still 404s on a DEACTIVATED profile».
- **F2 / domanda 4 — «Paga» a 320 px** = sotto ~360 px «Paga» scende su una seconda riga sotto il nome; sopra resta accanto. Guardia e2e che misura `clientWidth` del nome a 320 e 375.

## Fix Record (2026-11-04, fix-subagent Opus 5.5, un solo agente)

**Commit**: `c635b34` `fix(16.5): …` (codice + test + CLAUDE.md, pathspec). Questo record: commit `docs(16.5): …` (solo questo file). `sprint-status.yaml` e `HANDOFF.md` NON toccati. Skill applicate: `karpathy-guidelines`, `design-taste-frontend` (design read: correzione responsive in un pannello admin con design system proprio, fuori dallo scope landing della skill, §13: nessun linguaggio visivo nuovo), `ui-ux-pro-max` (checklist: target 44 px, un solo target per riga, larghezza del nome, nessun token nuovo).

### Per finding

| Finding | Cosa è cambiato |
|---|---|
| **I-1** (PO: BLOCCARE) | `recordPayout`: `resolvePayee` (fuori dalla transazione) dice solo profilo e attivo/non attivo. Per un ex istruttore il controllo «dovuto > 0» è ora `assertStillOwedUnderLock(tx, …)`, prima istruzione della transazione del payout: `SELECT … FROM "InstructorProfile" … FOR NO KEY UPDATE` (stessa modalità di `lockBookingPeople`: non blocca il `FOR KEY SHARE` delle FK, né quella del payout né quella di un volo), poi le due somme lette **su `tx`** (`sumSchoolFlightsByProfile`/`sumPayoutsByProfile` hanno un parametro `db` con default `prisma`), in sequenza: nessuna lettura sul client globale dentro la callback (19.10 F2). Sotto READ COMMITTED il secondo pagamento attende il lock, rilegge e vede il primo → 409 `INSTRUCTOR_NOTHING_OWED`. Un istruttore attivo non prende lock (l'anticipo resta sempre ammesso). Replay con la stessa `Idempotency-Key` invariato (201 replayed, è il wrapper `apiRoute`). Conseguenza dichiarata: l'ordine degli errori cambia per un ex istruttore a dovuto ≤ 0 con la categoria «Compensi istruttori» mancante (oggi 500 di configurazione, prima 409): la categoria è letta prima della transazione |
| **F1** (PO) | `resolveActiveInstructorRow` legge `archivedAt`: archiviato → 404 come il disattivato (la regola `isActive` del summary). `resolveActiveInstructorProfileId` (usato da `setPayoutRate`) rifiuta anche `personArchived` → 409 (prima 200). Doc-comment e descrizioni OpenAPI di GET (`?personId=` «the summary's `isActive: true`»), PUT rate («or is archived») e POST payout (controllo sotto lock) allineati. Non toccato: il PATCH composito `/people/{id}` (`people.service.ts`, controllo `INSTRUCTOR_PROFILE_INACTIVE` sul solo profilo), fuori dalla decisione PO |
| **F2** (PO) | `airops.css`: blocco `@media (max-width: 360px)` dopo quello dei 640 px: `.mobile-row-static` torna a 3 tracce e «Paga» va in riga 2, colonna 2 (sotto il nome, `justify-self: start`; mai `2 / -1`, lezione `.mobile-row-flag`). Stesso target da 44 px, nessun token nuovo. Misure sulla build di produzione (riga con «1.000,00 € dovuti», nome «Bellandi Marco»): **320 → nome 75 px** (prima 5-22), 360 → 85 px, 361 → 46 px, 375 → 60 px (invariato rispetto a prima, è la fascia che il PO lascia «accanto»), riga 108 px sotto la soglia e 67 px sopra, nessun overflow orizzontale. Screenshot in `…/scratchpad/fix-16-5/shots/card-320-*.png`, `card-375-*.png` |
| **F3** (PO: dichiarare) | Doc-comment di `updateFlight`: la tariffa congelata vale solo finché la modifica lascia l'istruttore com'è; cambiarlo e poi rimetterlo riprezza il volo alla tariffa di **oggi** di quell'istruttore (come la categoria di prezzo, Q-19.3-b). Nessun codice |
| **F4** | e2e in `instructor-compensation.spec.ts`. (1) Widget Contabilità: l'ex istruttore col dovuto (nel summary) è assente da `billing-instructor-compensation-row`, con controllo di non vacuità (almeno una riga). (2) Media del compenso orario = media delle tariffe del roster attivo **nello stesso render** (la tariffa da 100,00 €/h dell'ex istruttore non ci entra). (3) `sub` = `N attivi · … da liquidare · M non più attivi con dovuto` con M = righe della card, stesso render. (4) Test nuovo «paid more than accrued»: ex istruttore a dovuto −50,00 € (anticipo da attivo, poi disattivato) elencato senza «Paga» (desktop e mobile) e assente da «Compensi da liquidare» (pannello verificato aperto). (5) 409 mappato: pannello Paga aperto a 320 px, gli 800,00 € pagati dietro la UI via API, submit → testo `pay.nothingOwed`. Tutto e2e: le regole sono una riga ciascuna in server component o client component, estrarle in `src/lib` solo per testarle sarebbe stato un refactor speculativo |
| **F5** | `editor.payoutRate.hint`: IT «Vale dai prossimi voli: quelli già registrati mantengono il compenso orario in vigore alla registrazione.», EN «…keep the hourly rate in force when they were registered.» (glossario: «compenso orario»; parità e `BANNED` verdi nel gate) |
| **F6** | CLAUDE.md, paragrafo dei testid mobile: registrati `[data-testid^="instructor-row-"]` e `[data-testid^="inactive-instructor-row-"]` (stesso commit del fix) |
| **I-4** | `PaySlideOver`: sul 409 `INSTRUCTOR_NOTHING_OWED` il pannello mostra il messaggio **e** chiama `onMutated()` (`router.refresh()`): la riga dietro il pannello sparisce o mostra il dovuto nuovo. Guardia: dopo il 409 `mobileRow` → 0 righe, pannello ancora aperto |
| I-2, I-3, I-5, I-6, I-7 | Restano note dichiarate (I-5 è assorbita da F1: `PUT rate` su un archiviato ora è 409) |

### Discriminanze (tutte su copie isolate, mai in place)

- **Corsa reale, in-process sul DB `airmanager`** (`…/scratchpad/fix-16-5/race.ts`, `tsx` sulla copia `iso`, fixture run-unique create via API: 10 ex istruttori a 60,00 € dovuti, due `recordPayout` dell'intero dovuto in `Promise.allSettled`): **service di HEAD `2d012ab` → 5/5 coppie 201/201, dovuto −60,00 €, 2 righe di payout**; **service corretto → 5/5 coppie 201/409 `INSTRUCTOR_NOTHING_OWED`, dovuto 0, 1 riga**. File della copia ripristinato e verificato con sha256.
- **Corsa reale via HTTP sulla build di produzione corretta** (`…/fix-16-5/probe.mjs`, stessa forma della sonda del reviewer): **8/8 coppie 201/409** (4 disattivati + 4 archiviati col profilo attivo), una riga di payout, dovuto 0. Replay della chiave vincente → 201 con `idempotency-replayed: true`. F1 via HTTP: archiviato col profilo attivo → dettaglio **404**, `PUT rate` **409**.
- **Mutanti unit** (`…/fix-16-5/mutants.py`, copia `iso`, ripristino con controllo sha256 dopo ognuno, sha256 dell'intera copia verificato alla fine), **5/5 rossi**: U1 senza lock (2 rossi: ordine sotto lock, corsa simulata); U2 somme sul client globale (1: ordine); U3 `recordPayout` di HEAD (4: ordine, corsa, dettaglio archiviato, tariffa archiviato); U4 dettaglio che accetta l'archiviato (1); U5 tariffa che accetta l'archiviato (1).
- **Mutanti e2e** (UNA build webpack della copia `mut` con 7 mutanti accesi a runtime da `MUT`, servita su :3100, config Playwright di scratch, `scripts/e2e.sh start … -g "no longer active"`): baseline `MUT=none` **2/2 verdi**; **7/7 rossi, ognuno sulla propria asserzione**: billing (filtro widget tolto) → `:359`; avg (media su tutte le righe) → `:395` (4455 atteso, 6228 ricevuto); sub (clausola tolta) → `:397`; canpay («Paga» anche a dovuto ≤ 0) → `:490` (test nuovo); map409 (messaggio generico) → `:455`; refresh (I-4 tolto) → `:458`; css (regola 360 px spenta) → `:440`, nome **16 px** a 320. Nel run `sub` c'è anche la flake nota del login (`:23`), una per test, ripresa al retry.

### Gate

`npm run gates` finale (dopo l'ultima modifica, prima del commit): **PASS lint (82 s) · PASS typecheck (9 s) · PASS test (13 s), 2242 passed (2238 + 4) · PASS build (39 s)**. `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/server/services/instructor-compensation.service.test.ts` → 48/48 (nessuna catena `@/lib/env` nuova).

### e2e mirato

Build di produzione dell'albero corretto su :3000 (`JOBS_SECRET` non placeholder, `E2E_REUSE_SERVER=1 CI=1 scripts/e2e.sh start --project=chromium …`; nessuno spec della catena serializzata, nessun `--no-deps` necessario): `instructor-compensation` + `mobile-registries` + `mobile-a11y-sweep` + `person-save` + `instructor-rates` + `people-management` + `person-profiles` → **87 passed, 1 flaky, 0 failed, `E2E_EXIT=0`** (2,9 min). La flaky è `person-profiles.spec.ts:86`: `toHaveURL(/dashboard$/)` scaduto sulla pagina di login (classe nota login-timeout), verde al retry, nessun codice toccato da questo fix. Log: `…/scratchpad/fix-16-5/targeted-3000.log`.

### Per l'arbitro (sessione principale)

- Server: :3000 e :3100 **liberi** (il mio `next start` su :3000 è fermato; i server di mutante su :3100 si chiudevano a ogni giro). Nessun run e2e in corso.
- Il DB `airmanager` contiene le fixture run-unique delle sonde (prefisso «Fix», tag `mw1wh698`, più «Bellandi Marco» della verifica visiva): ex istruttori a dovuto 0, −60,00 € (5 della corsa pre-fix) e +1 000,00 €. Compaiono nella card «non più attivi» e nel KPI: nessun test asserisce quei valori globali con uguaglianza fra istanti diversi (AC 14), ma un DB resettato prima dell'arbitro è più pulito.
- Nessuno spec della catena è stato eseguito: le AppSettings globali non sono state toccate.
- Fascia 361-375 px: con un dovuto a 4 cifre il nome resta a 46-60 px accanto a «Paga» (come prima del fix). È la soglia scelta dal PO («sopra resta accanto»); la guardia e2e a 375 richiede ≥ 48 px e misura circa 60-66 px.

## Review Record (sessione principale, 2026-11-04)

- **Review** (Opus, `16-5-review-report.md`): **SHIPPABLE-WITH-FIXES** — 2 medium (F1 dettaglio di un archiviato col profilo attivo 200/`isActive:true` contro il summary; F2 nome illeggibile a 320 px accanto a «Paga»), 4 low (F3 cambio istruttore e ritorno riprezza a oggi; F4 cinque regole UI senza test; F5 hint impreciso; F6 selettore `^=` non registrato), Info (I-1 pagamenti concorrenti 201/201 con doppia uscita di cassa; 409 senza refresh; altre note). Arbitro del reviewer su DB fresco: **609/609, `E2E_EXIT=0`** (i 17 «ambientali» del dev erano davvero il DB sporco).
- **Decisioni PO** (v. sezione precedente): I-1 bloccato sotto lock; F1 archiviato = disattivato; F2 «Paga» su seconda riga ≤ 360 px; F3 dichiarato.
- **Fix** (Opus): `c635b34` + `f23ca47` (Fix Record sopra) — I-1 `FOR NO KEY UPDATE` sul profilo + somme lette su `tx` (in-process HEAD 5/5 201/201 → fix 5/5 201/409; HTTP 8/8 201/409), F1 404/409, F2 `@media (max-width: 360px)` (nome 5-22 → 75 px a 320), F3 doc-comment, F4 e2e sulle cinque regole + test «overpaid», F5, F6 in CLAUDE.md, refresh sul 409; 5 mutanti unit + 7 mutanti e2e rossi su copie isolate; gate verdi (unit 2242).
- **Arbitro finale** (sessione principale, DB fresco, 10:30-10:53): **607 passed + 3 flaky = 610, `E2E_EXIT=0`**. Flaky classificati, nessuno nel perimetro della story: `instructor-rates.spec.ts:157` e `mobile-logbook.spec.ts:878` = `socket hang up` su una POST di fixture (classe ECONNRESET, TD-19.10-g); `my-compensation.spec.ts:213` = `toHaveURL` del login scaduto (classe login-timeout). Verdi al retry.
- **Conteggi**: e2e 606 → **610**, unit 2211 → **2242**.
- **TD aperti dalla story**: nessuno nuovo oltre a quelli dichiarati nel record (seed-load: ramo nuovo mai eseguito end-to-end; PATCH composito `/people/{id}` su un archiviato fuori decisione PO).

## Fix post-arbitro 16.6a (2026-11-04, subagent di debug Opus 5.5)

- **Sintomo**: arbitro finale della 16.6a (DB fresco, 13:18-13:36), P4 (`instructor-compensation.spec.ts:338`) rosso al primo tentativo e al retry #1 su `:459` (`instructor-pay-form` non trovato dopo il 409), verde al retry #2. Nell'arbitro 16.5 era passato al primo colpo.
- **Causa (prodotto, non test)**: `instructors/page.tsx` montava `InstructorsConsole` con `key={JSON.stringify({ count: items.length })}` (dalla 12.7, senza motivazione scritta). Ogni `router.refresh()` dopo il quale il numero di istruttori **attivi** era cambiato rimontava l'intera console e ne azzerava lo stato (`payTarget`, editor, scheda, pannelli): il pannello «Paga» si chiudeva insieme al messaggio del 409 che l'I-4 deve lasciar leggere. Trace del retry #1: sottotitolo della pagina «52 attivi» al caricamento, «53 attivi» nello snapshot subito dopo il refresh del 409 (un istruttore creato da un altro worker), form assente. La 16.6a non c'entra (`dea21d5` cambia solo la classe dei messaggi d'errore): l'arbitro 16.5 era verde per caso. Nel prodotto basta un altro amministratore che aggiunge, disattiva o archivia un istruttore mentre il pannello è aperto.
- **Fix** (`6c19915`): via la `key` (la pagina non ha stato URL, a differenza dei registri paginati; il pannello teneva già il suo snapshot della riga). e2e P4: un istruttore creato dietro la UI prima del submit, così il conteggio cambia sempre in quel refresh, e dopo il refresh si asserisce il **testo** del 409 ancora nel pannello.
- **Prove** (build di produzione su :3000, `E2E_REUSE_SERVER=1 scripts/e2e.sh start e2e/instructor-compensation.spec.ts --repeat-each=10 --project=chromium --retries=0`): pre-fix con lo spec originale **P4 3/10 rosso** su `:459` (97 passed); pre-fix con lo spec nuovo **P4 10/10 rosso** (`element(s) not found` dopo il refresh); post-fix **100/100 verde**. Regressione sui 7 spec che toccano `/dashboard/instructors` (compensi, tariffe, person-save, people-management, mobile-registries, mobile-a11y-sweep, person-profiles): **88/88, 0 flaky**. Gates verdi (unit 2252). Server fermati, :3000/:3100 liberi.

Status: **done**.
