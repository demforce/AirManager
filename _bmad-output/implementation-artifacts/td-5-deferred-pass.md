---
baseline_commit: cd2db85
---

# Story TD-5: Tech-debt pass sui deferred (post-retro Epic 9)

Status: ready-for-dev

## Story

As a manutentore del progetto,
I want chiudere i deferred accumulati che sono fixabili chirurgicamente (triage nella retro Epic 9, `epic-9-retro-2026-07-10.md`),
so that l'Epic 10 parta su superfici pulite (in particolare quelle money, che gli export insistono) e il debito residuo sia solo quello motivato.

Sei fix indipendenti e chirurgici, NESSUNA migrazione, NESSUN cambio di dominio. Ogni item ha il suo perimetro: non allargare (karpathy: modifiche riconducibili alla richiesta, riga per riga).

## Acceptance Criteria

1. **(Hydration money-format — 94-OBS1/9.3)** **Given** la pagina `/dashboard/flights` (o qualunque superficie client che mostra importi) su build di produzione, **When** la pagina idrata, **Then** NESSUN hydration warning/error di money-format in console (era: server `1.900,00 €` vs client `1900,00 €`); il formato è IDENTICO e deterministico tra SSR e client per gli importi 1.000,00–9.999,99 € in locale it (la fascia in cui la regola CLDR `minimumGroupingDigits` diverge tra ICU di Node e del browser); tutti i test (unit `money.test.ts` + eventuali literal e2e su stringhe money) aggiornati coerentemente al comportamento pinnato.
2. **(93-N2)** **Given** `/dashboard/school?from=X&to=Y` con `from > to` (solo da URL manuale: la UI dei filtri non lo produce), **Then** la pagina degrada al periodo di default `currentMonthRange()` (stesso comportamento di un param malformato — MAI tabelle vuote silenziose su range invertito, MAI 500); il comportamento con range valido è invariato byte-per-byte.
3. **(92-N2)** **Given** il diario di addestramento (`training-notes-journal.tsx`) in locale EN, **Then** le date sono formattate col locale dell'utente (oggi: default `'it'` hardcoded nelle 3 chiamate `formatDateOnly`); in locale IT nessuna differenza visibile (regressione zero).
4. **(F4 8.3)** **Given** il registro PPR appena aperto (nessun param URL), **Then** "Azzera filtri" NON è visibile (oggi compare perché il default di pagina `APPROVED` è considerato "filtro attivo"); **When** l'utente imposta un filtro qualunque (stato ≠ APPROVED, incluso "Tutti", o un periodo) e poi clicca "Azzera filtri", **Then** torna al default di pagina (stato **Approvati**, periodo vuoto, URL pulito senza param) e il bottone scompare. "Tutti" resta selezionabile come valore del filtro stato.
5. **(7.4 loophole)** **Given** una prenotazione ACTIVE di una persona con un documento bloccante (`blocksBooking=true`) che scade il giorno D, **When** qualcuno la sposta (update) a un giorno di volo > D, **Then** riceve 422 `EXPIRED_DOCUMENTS` con lo STESSO shape del create (`details.documents = [{typeName, expiresAt}]`, messaggio col typeName) — il ricontrollo usa la STESSA semantica del create (ancorato al giorno del volo in `APP_TIMEZONE`, non a "oggi"); **When** l'update NON cambia il giorno di volo (stesso date-only di `startsAt` in APP_TIMEZONE: cambio orario, velivolo o note), **Then** NESSUN ricontrollo (una prenotazione creata con `force` resta editabile nello stesso giorno); documenti non bloccanti non bloccano (come nel create). Niente `force` sull'update (deferral dichiarato sotto). Unit test con le convenzioni della suite create-expiry esistente.
6. **(pg.Pool DeprecationWarning)** **Given** l'avvio dell'app (dev o prod) o del seed, **Then** la DeprecationWarning legata al Pool pg/adapter Prisma non è più emessa — fix atteso al call-site del costruttore adapter (forma `{ connectionString }` raccomandata dai doc-comment del client generato) in ENTRAMBI i punti (`src/server/db/prisma.ts`, `prisma/seed.ts`); PRIMA di fixare, riprodurre e CATTURARE il testo esatto della warning (`node --trace-deprecation` o log avvio) e ricontrollarlo sparito dopo. Se la riproduzione dimostra che la warning origina altrove (dentro node_modules, non influenzabile dal call-site), documentarlo nel Dev Agent Record e lasciare l'item come non-fixabile-a-call-site SENZA cambi di codice speculativi.
7. Gates verdi (`npm run gates`); e2e mirati sulle superfici toccate (flights, school, ppr-register, bookings) verdi; nessuna migrazione; nessun cambio OpenAPI SALVO nulla (l'AC 5 non tocca lo schema di input).

## Contesto e decisioni di design (vincolanti — ricognizione 2026-07-10)

### AC 1 — Hydration money-format

- **Root cause (ricognizione)**: `src/lib/money.ts:16` `formatCents(cents, locale)` usa `Intl.NumberFormat('it-IT', {style:'currency',currency:'EUR'})`; la regola CLDR `minimumGroupingDigits=2` per l'italiano (separatore migliaia soppresso sotto 10.000) è applicata da UNA sola delle due ICU (Node SSR vs browser) → mismatch di idratazione sugli importi 1.000–9.999. Il locale threading è CORRETTO ovunque (3 pattern coesistenti: prop `moneyLocale`, `useLocale()`, prop `locale` — NON toccarli).
- **Fix nell'HELPER, mai nei ~30 call-site**: pinnare il grouping in modo deterministico, es. `useGrouping: 'always'` (ES2023, supportato da Node e browser evergreen) nelle opzioni di `Intl.NumberFormat` in `formatCents` — così `1900_00` → `1.900,00 €` OVUNQUE e `150000` → `1.500,00 €` (il comportamento it sotto 10.000 CAMBIA deliberatamente: separatore sempre presente — è il prezzo della determinismo, ed è il formato convenzionale italiano). Verificare il typing TS di `useGrouping` (string union in lib ES2023; se la lib del progetto espone solo boolean, adeguare il tipo localmente in modo pulito, non `as any` sparsi).
- Il doc-comment di `money.ts:10-15` (che oggi DOCUMENTA la soppressione CLDR) va riscritto; `money.test.ts` asserisce il comportamento vecchio → aggiornare le asserzioni. Grep per literal money nelle e2e/unit che assumano l'assenza del separatore (es. `1500,00`) e aggiornarli.
- **Verifica empirica OBBLIGATORIA**: build di produzione + navigazione reale su `/dashboard/flights` con un importo in fascia 1.000–9.999 € a registro, console browser SENZA hydration warning (Playwright MCP `browser_console_messages`). Il warning era intermittente: dare l'esito osservato, non "dovrebbe".
- `formatSignedCents` (`money.ts:36`) delega a `formatCents` → eredita il fix, verificarlo nei test.

### AC 2 — from<=to pagina school

- `src/app/[locale]/dashboard/school/page.tsx:26-31` (`DATE_ONLY_PATTERN`, `sanitizeDateParam`) e `:71-73` (default `currentMonthRange()`): aggiungere DOPO la sanitize di forma il confronto lessicografico `from > to` (le date-only `YYYY-MM-DD` si confrontano come stringhe) → in tal caso usare ENTRAMBI i default (`defaultRange.from`/`defaultRange.to`), come se i param fossero malformati. Poche righe, nessun redirect, nessun errore UI.
- **Fuori scope dichiarato**: `finance/report/page.tsx` e `ppr/register/page.tsx` condividono lo stesso pattern senza check — NON toccarle (mai flaggate; il deferred 93-N2 è solo school). Se il reviewer ritiene la coerenza necessaria, sarà un finding suo.

### AC 3 — Locale nel diario

- `src/app/[locale]/dashboard/school/training-notes-journal.tsx`: 3 chiamate `formatDateOnly` senza locale (righe **192, 419, 459**). Pattern idiomatico ESISTENTE per client component: `useLocale()` di next-intl (come `people/account-panel.tsx:4,93`): `const locale = useLocale() === 'en' ? 'en' : 'it'` e threading nelle 3 chiamate. `formatDateOnly(dateOnly, locale)` ha già la firma giusta (`src/lib/time.ts:88`). `formatMinutes` non prende locale (h:mm neutro) — invariato.
- Attenzione: il file esporta più componenti (`NewTrainingNoteForm`, `TrainingNoteRow` con `EditNoteForm` interno) — l'hook va in OGNI componente che formatta, o nel punto minimo comune. Nessun cambio alle pagine server (già threadano il locale correttamente).

### AC 4 — Registro PPR "Azzera filtri"

- File: `src/app/[locale]/dashboard/ppr/register/ppr-register.tsx`. Tre punti da tenere COERENTI (+ il quarto in page.tsx):
  - `:140` `hasActiveFilter = filters.status !== 'ALL' || ...` → il confronto stato diventa `!== 'APPROVED'` (il default di pagina, dichiarato in `page.tsx:78` e doc-comment `:50-62`): al load (APPROVED, periodo vuoto) il bottone sparisce; con "Tutti" selezionato il bottone COMPARE (è un filtro scelto dall'utente).
  - `:133-138` `handleResetFilters` → `navigate({ status: 'APPROVED', from: '', to: '' })`; la logica URL esistente (`:122` omette `status` quando `=== 'APPROVED'`) produce già l'URL pulito. Aggiornare il commento inline `:134-137` (oggi motiva il reset a 'ALL').
  - `page.tsx:94-98` (`filterQuery`) non cambia (già omette APPROVED).
- Il testid `ppr-register-filter-reset` resta; verificare che nessun e2e ppr-register asserisca il vecchio comportamento (grep sul testid) e aggiornare se serve.

### AC 5 — Ricontrollo scadenze su updateBooking

- File: `src/server/services/bookings.service.ts`. Il create fa il check a `:335-367` (query expiry `:341-344`, filtro sul giorno del volo `:345-347` con `flightDateOnly = dateOnlyInZone(startsAt, APP_TIMEZONE)` `:340`, blocco `:354-367` → `ValidationError(..., {documents}, 'EXPIRED_DOCUMENTS')`). `updateBooking` (`:627+`) oggi NON lo riesegue — dichiarato nel doc-comment `:591-599` ("A future story could close this...": questa).
- **Design vincolante**:
  - **Estrarre il blocco expiry del create in un helper privato** (es. `assertNoBlockingExpiredDocuments(personId, startsAt)` — nome a scelta del dev, stessa semantica IDENTICA: query, filtro date-only sul giorno del volo, partizione blocking/warnings, errore) e chiamarlo da ENTRAMBI i path. Il create deve restare byte-identico nel comportamento osservabile (inclusi `warnings` non bloccanti e il ramo `force` `:354-359`, che resta SOLO nel create).
  - **In updateBooking**: eseguire il check DOPO le validazioni esistenti su date/own-access e PRIMA della sezione aircraft/overlap/transazione, SOLO SE il giorno di volo cambia: `dateOnlyInZone(nextStartsAt, APP_TIMEZONE) !== dateOnlyInZone(existing.startsAt, APP_TIMEZONE)`. Motivo (vincolante): una prenotazione creata con `force` su documenti scaduti deve restare editabile nello stesso giorno (cambio orario/velivolo/note) — il loophole da chiudere è SOLO lo spostamento di giorno. Il `personId` si legge da `existing` (verificare che `EDITABLE_BOOKING_SELECT` lo includa — serve già all'own-access; se manca, aggiungerlo al select).
  - **NIENTE `force` sull'update** (deferral dichiarato): `updateBookingSchema` resta invariato (`aircraftId/startsAt/endsAt/notes`); lo staff che deve spostare deliberatamente oltre una scadenza cancella e ricrea con force (flusso 7.4 esistente). Nessun cambio OpenAPI.
  - **UI**: verificare come il form di edit prenotazione mostra oggi un 422 del service (pattern error-code → messaggio i18n). Se il code `EXPIRED_DOCUMENTS` ha già un messaggio i18n dal create, riusarlo; se il form di edit non lo mappa, aggiungere SOLO la chiave/mapping mancante (nessun redesign del form).
- **Test**: unit nella suite update con le convenzioni della suite create-expiry esistente (`bookings.service.test.ts:961+`: helper `expiredBlockingLicenseRow()`, costanti boundary, assert su `code`/`message`/`details` e `transactionMock` non chiamato): giorno cambiato + doc bloccante scaduto → 422; giorno cambiato + doc scade DOPO il nuovo giorno → ok; SOLO orario cambiato (stesso giorno) + doc scaduto → ok (no ricontrollo); doc warning non bloccante → ok. e2e: estendere `bookings.spec.ts` con un caso di spostamento bloccato SE il costo è contenuto (helper fixture expiry esistenti); altrimenti dichiarare la copertura unit-only.

### AC 6 — pg DeprecationWarning

- Call-site: `src/server/db/prisma.ts:18` e `prisma/seed.ts:9` — entrambi `new PrismaPg(<stringa connessione>)`. La forma raccomandata dai doc-comment del client generato (`src/generated/prisma/client.ts:32`) è `new PrismaPg({ connectionString: ... })`. Versioni: `@prisma/adapter-pg@7.8.0`, `pg@8.22.0`.
- **Metodo (vincolante)**: PRIMA riprodurre (avviare app/seed con `NODE_OPTIONS=--trace-deprecation` o equivalente e catturare il testo esatto + stack della warning nel Debug Log); POI applicare il fix ai DUE call-site; POI riverificare sparita. Se lo stack mostra che la warning NON dipende dal call-site (es. interna all'adapter o a pg stesso), NON cambiare codice "a caso": documentare l'esito e chiudere l'item come non-fixabile-a-call-site.
- `e2e/school.spec.ts:3` usa `pg.Client` diretto: sorgente diversa, NON toccare.

### Fuori scope (dichiarato)

- 93-N1 (hiding card "Le mie ore scuola" per admin senza profilo): decisione di prodotto, in attesa dell'utente (AI-4 della retro).
- Nome/claim aviosuperficie form PPR pubblico → story 10.2 (AI-5); TOCTOU rate-limit PPR; `closedByUserId` nel DTO; description movimento PPR in inglese; coda retry email NFR-7 — tutti deferred motivati (v. retro).
- Coerenza `from<=to` su finance/report e ppr/register (v. AC 2).
- `force` su updateBooking (v. AC 5).

## Tasks / Subtasks

- [ ] **T1 (AC 1)** — Fix `formatCents` (grouping deterministico) + doc-comment + `money.test.ts` + grep literal money in unit/e2e; verifica empirica hydration su prod build (console pulita, Playwright MCP).
- [ ] **T2 (AC 2)** — Guardia `from > to` → default range in `school/page.tsx`.
- [ ] **T3 (AC 3)** — `useLocale()` nel journal, threading nelle 3 `formatDateOnly`.
- [ ] **T4 (AC 4)** — `hasActiveFilter`/reset/commento in `ppr-register.tsx`; check e2e col testid.
- [ ] **T5 (AC 5)** — Helper expiry condiviso; ricontrollo su cambio giorno in `updateBooking`; verifica select `personId`; verifica messaggio UI edit; unit (4 casi) + eventuale e2e.
- [ ] **T6 (AC 6)** — Riproduzione warning (testo+stack nel Debug Log) → fix `{ connectionString }` nei 2 call-site → riverifica; oppure esito documentato non-fixabile.
- [ ] **T7 (AC 7)** — `npm run gates`; e2e mirati (flights + school + ppr-register + bookings); story file (Dev Agent Record) + sprint-status.yaml (td-5 → review).

## Dev Notes

- Leggere e seguire `karpathy-guidelines` (`.claude/skills/karpathy-guidelines/SKILL.md`): 6 fix INDIPENDENTI e chirurgici — se uno si rivela più grosso del previsto, fermarlo e dichiararlo (deviations), non gonfiarlo.
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); Mailpit attivo; prima di ogni run e2e `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp` se serve); build SEMPRE `env -u NODE_ENV` (o `npm run gates`); MAI `playwright install`.
- Baseline: **164 e2e / 1159 unit / 29 migrazioni** (gates verdi verificati su questo baseline_commit). Flake noti: `ppr-register` ~1 rosso ogni 2-3 run anche isolato; contention login sotto carico — criterio consolidato: fuori dal diff + verde in isolamento = non-regressione; la full suite autoritativa la fa il reviewer su prod build.
- UN commit di implementazione (`Story TD-5: ...`). Codice/commenti/identificatori in inglese; stringhe UI (se ne servono di nuove, es. i18n AC 5) IT/EN simmetriche.
- Le superfici AC 1 e AC 5 sono money-adjacent/booking-critical: zero rami monetari o di dominio toccati oltre il perimetro dichiarato; le suite flights/bookings esistenti sono il canarino.
- AC 1 cambia stringhe visibili (separatore migliaia sotto 10.000 in it): aspettarsi asserzioni da aggiornare — aggiornarle è parte del fix, NON un smell (ma ogni literal cambiato deve essere money-format, niente altro).

### References

- [Source: _bmad-output/implementation-artifacts/epic-9-retro-2026-07-10.md — triage e motivazioni]
- [Source: src/lib/money.ts:10-36; src/lib/money.test.ts; flights-manager.tsx call-site 415-840]
- [Source: src/app/[locale]/dashboard/school/page.tsx:26-31,71-73,88-97; src/lib/period-presets.ts:43-64]
- [Source: training-notes-journal.tsx:8,192,419,459; src/lib/time.ts:88-97; people/account-panel.tsx:4,93 — pattern useLocale]
- [Source: ppr/register/ppr-register.tsx:120-140,216-225; ppr/register/page.tsx:50-62,78,93-98]
- [Source: bookings.service.ts:220,335-367,558,580-714; bookings.service.test.ts:961-1136 — suite create-expiry]
- [Source: src/server/db/prisma.ts:12-26; prisma/seed.ts:5-9; src/generated/prisma/client.ts:32 — forma raccomandata]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Review Record

## Change Log

- 2026-07-10: Story file created (Fable 5 main session) — TD-pass sui deferred triati dalla retrospettiva Epic 9 (AI-1). Ricognizione Explore completata su tutte e 6 le superfici.
