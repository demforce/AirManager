---
baseline_commit: 7e327b7498a3d03ae65155ac3b6734894adab3a3
---

# Story 12.7: Istruttori — compensi, payout ledger, ciclo pagamenti

Status: done

## Story

As a admin dell'aviosuperficie,
I want la pagina Istruttori nel design AirOps con i compensi reali — tariffa payout per istruttore, dovuto calcolato dai voli SCHOOL, registrazione pagamenti e "Ciclo pagamenti" —
so that i compensi istruttori siano gestiti end-to-end nel gestionale (oggi non esistono affatto) e le pagine Contabilità/Statistiche (12.9/12.10) possano consumarne l'API.

**Riferimenti vincolanti**: spec §3 (riga Istruttori) + D8 (compensi) + §5.2 + D11/D13; piano Task 7 (schema Prisma VERBATIM alle righe 207-223 del piano); prototipo `docs/design-reference/airops/src/People.jsx` (InstructorsView L122-174, InstructorEditor L176-213), `InstructorProfile.jsx`.

## Ratifiche utente (2026-07-15 — decise via AskUserQuestion PRIMA del dispatch)

1. **RBAC compensi → RATIFICATO (opzione default)**: nuovo permesso **`payouts.manage` (SOLO ADMIN)** per registrare payout **E** configurare la tariffa payout (simmetrico a `InstructorRate`, admin-only). Lettura del riepilogo **e** export con `finance.manage` (staff+admin). Lo staff NON vede il bottone "Paga" né il campo tariffa payout (e i POST/PUT relativi → 403).
2. **Export istruttori → RATIFICATO (COSTRUIRE ORA)**: l'utente ha scelto di BUILDARE l'export in questa story (non ometterlo). Nuovo endpoint export xlsx del riepilogo compensi con `finance.manage` (read) + `ExportMenu` wired via `buildExportHref` — v. AC 3 e AC 4 aggiornati; rimosso da "Fuori scope".

## Acceptance Criteria

1. **(Schema additivo)** Migrazione hand-written `<ts>_instructor_payouts` additiva: `InstructorProfile.payoutRateCents Int?` + modello `InstructorPayout` ESATTAMENTE come da piano righe 207-223 (id/instructorProfileId/amountCents/periodStart/periodEnd date-only Roma/method PaymentMethod/notes/actorUserId/createdAt, `@@index([instructorProfileId, periodEnd])`) + back-relations: `payouts InstructorPayout[]` su InstructorProfile e `instructorPayouts InstructorPayout[]` (relazione named "InstructorPayoutActor") su User. Verifica empirica su DB fresco.
2. **(Service compensi — TDD)** NUOVO `src/server/services/instructor-compensation.service.ts` (+`.test.ts` PRIMA dell'implementazione): `getCompensationSummary(actor, query)` — per ogni istruttore ATTIVO: minutes = Σ `Flight.minutes` dei voli SCHOOL con `status: { not: 'CANCELLED' }` e quell'`instructorProfileId` (groupBy come il precedente `school.service.ts:846-855` — usarlo come MODELLO di query, NON importarlo: l'area school muore in 12.13), varianti **mtd/ytd/total** con giorni Roma (`todayDateOnlyInZone`/`zonedMidnightUtc`); `owed = round(minutes/60 × payoutRateCents) − Σ payout della variante`; `payoutRateCents` null → `owed: null`. **Attribuzione payout a una variante: per `periodEnd` nel range** (deterministica, coperta dall'index — decisione vincolante, unit test dedicato). `recordPayout(actor, input)`: amount>0, `periodStart ≤ periodEnd`, istruttore esistente e attivo. `setPayoutRate(actor, personId, payoutRateCents|null)`: int ≥ 0 o null, riusa il pattern `resolveInstructorProfile` (`instructor-rates.service.ts:75`). Unit test con fixture a cavallo di mese/anno (giorni Roma 22–24 UTC, lezione PR #17).
3. **(Schemi + API)** NUOVO `src/lib/schemas/instructor-compensation.ts` (riusare `paymentMethodSchema` da `accounts.ts:6`; registrare nel registry): `GET /api/v1/instructor-compensation` (riepilogo tutti gli istruttori; con `?personId=` restituisce il DETTAGLIO singolo: KPI + ultimi 5 voli come CFI + allievi recenti distinti derivati dai voli SCHOOL — serve il profilo slide-over, niente endpoint aggiuntivi), `POST /api/v1/instructor-payouts` (crea dati → **Idempotency-Key obbligatoria**, replay = un solo payout), `PUT /api/v1/instructor-compensation/[personId]/rate` (set tariffa — deviazione dichiarata dal piano, che prevede il campo editor ma non nomina la route). RBAC come ratificato (punto 1): `payouts.manage` (ADMIN) su POST payout + PUT rate; `finance.manage` su GET riepilogo/dettaglio. Template route: `people/[id]/instructor-rates/route.ts` (thin route, auth nel service). **Export (ratifica 2)**: `GET /api/v1/instructor-compensation` supporta la variante **xlsx** (stesso pattern `buildExportHref`/`exports.service.ts` delle altre pagine — aggiungere il builder in `exports.service.ts` e registrare l'export nel registry) del riepilogo compensi (istruttore/ratings/tariffa payout/ore totali/dovuto), gated `finance.manage` (read: staff+admin possono esportare).
4. **(Pagina Istruttori)** NUOVA `/dashboard/instructors` (route-registry `instructors` accesa, `airopsNative: true`) port di `InstructorsView`: page-head con sub "N attivi · X da liquidare", bottoni "Ciclo pagamenti" + "Aggiungi istruttore" (= attivazione profilo istruttore su persona esistente/nuova — riusa i flussi people/profili della 12.6, NON un create parallelo), KPI row (Istruttori attivi / Ore totali volate / Totale dovuto / Tariffa media payout — media sui SOLI istruttori con tariffa, "—" se nessuno), tabella: Nome+ratings / Tariffa payout ("—" se null) / Ore totali / Totale dovuto ("—" se null) / Azioni (Modifica, Paga). **"Registra" (shortcut registra volo) NASCOSTO finché la 12.8 non è merged; `ExportMenu` INCLUSO** (ratifica 2 — wired via `buildExportHref('/api/v1/instructor-compensation', { …filtri }, locale)`, visibile con `finance.manage`). Money TD-5 (`formatCents`), date `formatDateOnly` — MAI i formati ad-hoc del prototipo (D11).
5. **(Paga + Ciclo pagamenti)** "Paga" (solo chi ha il permesso ratificato): form payout in slide-over — importo prefillato col dovuto residuo (editabile), metodo (`CASH/BANK_TRANSFER/POS`), periodo (default: periodEnd = oggi Roma; periodStart = inizio del periodo scoperto, editabile), note → POST con Idempotency-Key → refresh. "Ciclo pagamenti" = slide-over con i SOLI istruttori a dovuto>0, riga per riga bottone "Paga" (batch manuale, un POST per riga). Dopo payout totale il dovuto torna 0 e l'istruttore esce dal ciclo.
6. **(Editor + tariffe allievo)** Editor slide-over port di `InstructorEditor` sul dominio REALE: dati persona (PATCH people, `people.manage`), ratings (PUT profiles/instructor esistente), **tariffa payout** (input-group €/h → PUT rate, visibile solo col permesso ratificato), ore/dovuto readonly. **NIENTE "Cadenza pagamenti"** (Mensile/Settimanale/Per volo del prototipo: non esiste nel dominio — D13, non si porta). **La sezione tariffe ALLIEVO (`InstructorRatesPanel`, storicizzata, API instructor-rates esistente, `settings.manage`) SI SPOSTA QUI** dalla scheda persona (la 12.6 l'ha lasciata lì per questa story): stessa API, stessa storicizzazione append-only, stesso 409 su validFrom duplicata; le DUE tariffe (addebitata all'allievo vs pagata all'istruttore) chiaramente etichettate e distinte nella UI. Rimuovere `InstructorRatesPanel` da `people/[id]` nello stesso commit.
7. **(Profilo slide-over)** Port di `InstructorProfile.jsx`: avatar iniziali, identità, ratings come Badge, KPI grid (Ore totali / Ore nel mese / Dovuto totale / Tariffa payout) dal dettaglio API; "Allievi recenti" e "Voli recenti come CFI" (ultimi 5) da voli REALI (fixture nel seed/e2e — dati mock del prototipo MAI). Footer: Chiudi / Modifica.
8. **(e2e)** `instructor-rates.spec.ts` ADATTATO: stessi 4 comportamentali (storicizzazione, 409 `validFrom` duplicata, RBAC 403 staff/pilot) sui NUOVI selettori della pagina instructors. NUOVO `instructor-compensation.spec.ts`: set tariffa → summary con dovuto calcolato da volo SCHOOL fixture (creato via API flights); payout → dovuto scala; replay idempotency → un solo payout; istruttore senza tariffa → "—" e assente dal ciclo pagamenti; ciclo pagamenti mostra solo dovuto>0; RBAC: staff vede il riepilogo ma NON Paga/campo tariffa (e POST payout / PUT rate → 403); **export**: il link ExportMenu risponde xlsx 200 per staff+admin (`finance.manage`). Selettori scoped/exact (regola 103-F1), MAI hasText con H:MM/date.
9. **(Gates)** `npm run gates` verde; spec toccati verdi in locale (--retries=2); verifica interattiva in entrambi i temi (pagina AirOps-native, shim assente).

## Contesto e decisioni di design (vincolanti — ricognizione 2026-07-15)

- **Compensi OGGI**: NON esistono (né schema né service né route). L'unico precedente ore-istruttore è `school.service.ts:822` `getInstructorHourSummaries` (groupBy `instructorProfileId`, SCHOOL, not CANCELLED, `_sum.minutes` — L846-855): modello di query, area in eliminazione.
- **Tariffa ALLIEVO ≠ tariffa PAYOUT** (D8): `InstructorRate` (schema.prisma:301-315, storicizzata, `settings.manage`, service `instructor-rates.service.ts`: create L115 / list L170 / effective L199, pattern `resolveInstructorProfile` L75) resta INVARIATA — è ciò che si addebita all'allievo. Il payout è il NUOVO campo/ledger.
- **Prisma**: `InstructorProfile` :121-140 (aggiungere payoutRateCents + relazione payouts); `Flight` :792+ (`instructorProfileId String?`, `minutes Int`, `flightDate @db.Date`, SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR in flights.service:507); `enum PaymentMethod` :459 (`CASH|BANK_TRANSFER|POS`); `FlightStatus` :738 (`REGISTERED|CANCELLED` — "not CANCELLED" ≡ REGISTERED con 2 stati).
- **RBAC** (`src/server/auth/rbac.ts`, catalogo :27-40): nessun permesso payout esiste; `finance.manage` = STAFF+ADMIN (:86); `settings.manage` = solo ADMIN. Il nuovo permesso (se ratificato) si aggiunge al catalogo + `ALL_PERMISSIONS` admin, MAI a staff/instructor.
- **Helper**: `formatCents` money.ts:22, `parseCents` :53 (TD-5); `todayDateOnlyInZone` zoned-time.ts:176, `zonedMidnightUtc` :96 (mtd/ytd Roma). Arrotondamento dovuto: `Math.round(minutes/60 × rateCents)` — dichiararlo nel service doc-comment e coprirlo in unit test.
- **UI**: primitive 12.1 (SlideOver/Field/Badge/KPI/Toast), meccanismo `airopsNative` 12.3; la pagina è `people.read`-gated per l'accesso base (come pilots 12.6) con le azioni compensi gated dal permesso ratificato. Dipendenza: DOPO la 12.6 (che elimina la lista people e crea pilots; scheda `people/[id]` resta viva).
- **Voce nav**: registry `instructors` (già presente con `enabled: false` dalla 12.1 — verificare nome esatto nel route-registry).
- **Seed**: Ines è l'unica istruttrice seed, SENZA voli — i test e2e creano voli SCHOOL via API (flights Epic 11) run-unique; niente modifiche al seed se non necessarie.
- **INSTRUCTOR self-view** (ore/dovuto propri, `InstructorView.jsx`): è la landing di ruolo della **12.12**, NON di questa story — ma il GET dettaglio (AC 3) va progettato senza precludere un futuro own-access (nessun lavoro extra ora).
- **Ambiente locale**: identico alle story precedenti (docker compose, DB fresco al dispatch, port 3000 libero, cold-start login flake → --retries=2, Mailpit localhost:8025, MAI playwright install).
- **Commit**: `feat(12.7): instructor compensation (payout rate, ledger, ciclo pagamenti)`. Niente push.

## Fuori scope dichiarato

- Landing di ruolo INSTRUCTOR e badge sidebar (12.12).
- Consumo dell'API compensi in Contabilità (12.9) e Statistiche/serie storiche (12.10) — questa story espone SOLO l'API.
- Shortcut "Registra volo" dalla riga istruttore (dipende dal form della 12.8 — bottone nascosto).
- ~~Export xlsx istruttori/compensi~~ → **ORA IN SCOPE** (ratifica 2, 2026-07-15): endpoint xlsx + ExportMenu inclusi in questa story (AC 3/4/8).
- Eliminazione dell'area school e di `getInstructorHourSummaries` (12.13).

## Dev Agent Record

**Status**: review

**Implementazione**: schema (`InstructorProfile.payoutRateCents` + `InstructorPayout`, migrazione `20260715180000_instructor_payouts`, verificata su DB fresco via `\d`), RBAC (`payouts.manage`, admin-only), service TDD (`instructor-compensation.service.ts` + 21 unit test, boundary Roma mtd/ytd/total, attribuzione payout per `periodEnd`), schemi Zod + registry OpenAPI, 3 route (GET riepilogo/dettaglio/export, POST payout con Idempotency-Key OBBLIGATORIA — controllo esplicito nella route dato che il meccanismo condiviso resta opt-in, PUT tariffa payout), pagina `/dashboard/instructors` (console + editor + profilo + slide-over Paga/Ciclo pagamenti/Aggiungi istruttore), `InstructorRatesPanel` spostato da `people/[id]` con restyling AirOps-nativo (era ancora in classi Tailwind legacy).

**Deviazioni dichiarate**:
1. Schema `InstructorPayout.periodStart/periodEnd`: aggiunto `@db.Date` (assente nello snippet grezzo del piano, che porta solo un commento inline non valido in sintassi Prisma) — necessario per la semantica "date-only Roma" richiesta dall'AC 1 stesso, stesso pattern di ogni altro campo data-only del dominio (`AircraftRate.validFrom` ecc.).
2. "Aggiungi istruttore" (AC 4): implementato come ricerca persona esistente (`GET /api/v1/people?q=`) + attivazione profilo istruttore (`PUT .../profiles/instructor`, stesso endpoint della 12.6) — nessun form di creazione persona parallelo, come richiesto.
3. "Ciclo pagamenti"/"Aggiungi istruttore" collocati nel card-head (non nel page-head come nel prototipo) per coerenza con `pilots-console.tsx`/`fleet-console.tsx`, dove ogni azione di riga vive nella card, non nel page-head.
4. `InstructorRatesPanel` (tariffa allievo): rimosso il toggle "Nuova tariffa" del componente originale — form sempre visibile quando l'attore ha il permesso, stesso pattern del gemello `fleet/aircraft-editor.tsx#RatesSection` (mai portato dal prototipo AirOps, che non lo mostra). "Corrente" ora derivato client-side dallo storico (`currentRateOf`), non più da una prop server-computed — stesso pattern del gemello.
5. Form "Paga": `periodStart` di default = inizio anno corrente (Roma) — l'API non espone un "ultimo periodo pagato", quindi non è calcolabile un "inizio del periodo scoperto" preciso; il campo resta editabile come da AC 5.

**Test**: 21 unit test nuovi (`instructor-compensation.service.test.ts`) + rbac.test.ts aggiornato; e2e `instructor-rates.spec.ts` adattato (4/4 verdi) + nuovo `instructor-compensation.spec.ts` (6/6 verdi) — 10/10 e2e verdi in locale con `--retries=2`. Verifica interattiva screenshot in entrambi i temi (istruttori list, editor, profilo) — nessuna anomalia visiva.

## Review Record

**Reviewer**: adversarial-reviewer (Opus 4.8, effort xhigh, via workflow). **Data**: 2026-07-15. Prima RBAC-change dell'epic (nuovo permesso `payouts.manage`) + superficie money/idempotency → review empirica intensiva.

### Arbiter (priority zero)

- **`CI=1 npx playwright test` su build prod → 220 passed, 0 failed** (exit 0; tutti i 6 `instructor-compensation.spec` + 4 `instructor-rates.spec` adattati verdi). Gates re-verificati: **1369 unit** (→ **1370** dopo il fix di review), tsc OK, eslint 0 errori, build OK.

### Verdetto

**Shippable.** Zero blocker, zero major. Nessun difetto di correttezza / RBAC / idempotency / money-math.

### Evidenza empirica (build prod live, non solo lettura codice)

- **Migrazione (AC 1)** psql: `InstructorProfile.payoutRateCents` int nullable; `InstructorPayout` (periodStart/periodEnd `date`, method PaymentMethod, actorUserId FK "InstructorPayoutActor", `@@index([instructorProfileId, periodEnd])`) — esatta.
- **RBAC `payouts.manage`** (prima permission-add dell'epic): aggiunto SOLO al type `Permission` + `ALL_PERMISSIONS` admin; staff/istruttore/pilota/allievo mai. Matrice live: admin POST payout 201 + PUT rate 200; **staff → 403 su entrambi, 200 su GET riepilogo + export xlsx** (`finance.manage`); altri ruoli 403 ovunque; UI nasconde Paga/Ciclo/campo-tariffa allo staff.
- **Idempotency obbligatoria** (route-level, senza toccare l'handler condiviso): key mancante → **422 `IDEMPOTENCY_KEY_REQUIRED`, 0 righe**; replay stessa key → 1 riga; **8 POST concorrenti stessa key → 8×201 ma 1 sola riga DB**; due key diverse → 2 righe. Semantica sana, nessun doppio-standard.
- **Owed math**: `owed = round(min/60×rate) − Σpayout` verificato (rate 6000, volo SCHOOL 90min → owed 9000; payout parziale scala; ciclo filtra owed>0). Boundary mtd/ytd/total su giorno Roma coperti dagli unit.
- **InstructorRatesPanel MOVE**: vecchio componente eliminato; `people/[id]` pulito da import/uso/wiring morto; `instructor-rates.service.ts` NON nel diff (invariato); pricing allievo intatto (`getEffectiveInstructorRate` ancora usato da `flights.service.ts:550`); parità storicizzazione/409 confermata dai 4/4 e2e.
- **Coupling guard**: `git diff -- flights.service.ts` **VUOTO** (12.8 possiede il flight-logging).

### Findings

- **MINOR-1 — FIXATO in `99103da`**: `exportInstructorCompensationXlsx` non aveva unit test sul contenuto colonne (e2e copriva solo lo status). Aggiunto test che asserisce name/ratings/ore + tariffa payout e dovuto come celle euro NUMERICHE, null quando l'istruttore non ha tariffa.
- **MINOR-2 — ACCETTATO**: nessun upper-bound su `periodEnd` del payout. Un `periodEnd` futuro conta nel `total` ma non in mtd/ytd — è la semantica corretta delle finestre su un ledger append-only e correggibile (UI default `periodEnd=oggi`); guard non richiesta dall'AC 5.

### Verdetti (close-your-notes)

Tutte le note del dev ACCETTATE: #2 idempotency SANO (provato a livello DB); #3 owed/total future-periodEnd accettabile (MINOR-2); #4 recentStudents dai 5 voli recenti (matcha AC 3/7 + prototipo); #5 = MINOR-1 (fixato); #6 rimozione toggle pannello tariffa allievo (gemello di `fleet` RatesSection, parità); #7 Ore/Dovuto readonly stale nell'editor aperto (documentato, riga corretta via refresh). Deviazioni #1-#5 tutte sane (`@db.Date` corretto, "Aggiungi istruttore" = search+attivazione, ecc.).

### Commit di review

- `99103da` — `fix(12.7)`: MINOR-1 (unit test contenuto export xlsx).
- questo commit — `docs(12.7)`: Review Record, status → done, sprint-status.
