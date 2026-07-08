---
baseline_commit: 9fdfdf4
---

# Story TD-1: Bonifica dei finding aperti (tech-debt hardening cross-epic)

Status: ready-for-dev

## Story

As a gestore del progetto,
I want che tutti i finding deferiti dalle review degli epic 2–6 ancora aperti vengano chiusi in un unico pass uniforme,
so that il debito tecnico accumulato (race note, a11y, N+1, wording, flake e2e) non si trascini negli epic 7–10.

## Acceptance Criteria

1. **Given** due DELETE concorrenti sulla stessa risorsa, **When** il perdente della race incontra P2025, **Then** riceve **404** (mai 500) — uniformemente su `deleteCashCategory`, `deletePackageType`, `deleteExpiryType`, `deleteExpiry` (finding 3.4 / 4.3 M1 / 6.1 D1 + pattern identico in 6.2).
2. **Given** un titolare CON email il cui invio SMTP fallisce, **When** il digest staff viene composto, **Then** la riga porta un flag "invio fallito" DISTINTO dal flag "senza email" (6.3 M1); il flag "senza email" resta riservato a chi non ha email a sistema.
3. **Given** un run del dev server o degli unit test, **When** si esercitano le liste paginate, **Then** NESSUNA `DeprecationWarning` pg ("client already executing a query") viene emessa dai batch `$transaction([...])` (6.4 D1) — verificata empiricamente prima/dopo.
4. **Given** la pagina flotta con N velivoli in pagina, **When** viene calcolata la tariffa corrente per riga, **Then** il totale delle query tariffa è **1** (batched), a parità ESATTA di semantica AD-4 (`max(validFrom) <= oggi` per velivolo) (4.1 N+1).
5. **Given** un errore di submit in QUALSIASI form dell'app, **Then** è annunciato agli screen reader (`role="alert"`) (4.3 M2, app-wide); **And** nessuna `<label>` avvolge il proprio controllo — pattern sibling `htmlFor`/`id` ovunque, `CashRegister` incluso (lezione 5.4).
6. **Given** un movimento `PACKAGE_PURCHASE` (importo 0, pagamento esterno), **When** si tenta di linkarci una rettifica (`originalMovementId`), **Then** il service risponde 409 con messaggio chiaro e la UI non offre l'azione su quelle righe (4.4 D2); **And** il messaggio del guard di `reverseCashMovement` non parla più solo di "top-up" (deferral 4.4).
7. La scadenza pacchetto in `PackagesPanel` è mostrata **locale-aware** (non ISO grezzo) e il commento di `todayDateOnly` nel file è corretto (dice local ma il valore è costruito in local time davvero? verificare e allineare commento ↔ codice) (4.4 D3).
8. **Given** una vendita pacchetto riuscita, **Then** l'anteprima movimenti/saldo dell'`AccountPanel` sulla stessa scheda persona si aggiorna **senza reload** (4.4 D1).
9. **Given** una `Person` archiviata con `InstructorProfile` ancora attivo, **When** viene indicata come istruttore via API diretta, **Then** → 422 `INSTRUCTOR_NOT_FOUND` (stesso codice foldato, niente enumeration) (5.1 D1).
10. Il campo descrizione del form top-up ha `maxLength={500}` client-side allineato allo Zod server (3.1 NIT-1).
11. Lo storico rettifiche contaore mostra un "carica altri" quando esistono più righe delle 50 caricate (2.5 F2) — niente più troncamento silenzioso.
12. **Classe flaky e2e epic 5 indurita (priorità zero)**: `flights.spec.ts:210` verde con `--repeat-each=5` in isolamento su DB fresco; full suite su DB fresco senza fail della classe nota (flight form-refresh + people-management sotto carico) per almeno 2 run consecutivi, o evidenza empirica documentata del residuo con diagnosi. Le assert NON vengono indebolite: si induriscono attese e locator (osservabili run-unique, lezione 6.3 F1).

## Contesto e decisioni di design (vincolanti)

- **Questa story tocca SOLO finding già censiti**: niente refactor opportunistici fuori lista. Le deviazioni vanno dichiarate nel Dev Agent Record (le deviazioni dichiarate sono sane, il reviewer le giudica).
- **P2025 → 404 (AC 1)**: aggiungere in OGNI service interessato un predicato locale `isRecordNotFound(error)` (code `P2025`), stessa forma e convenzione dei predicati locali `isUniqueViolation`/`isForeignKeyViolation` già presenti per-service (NON creare un modulo condiviso: la convenzione del codebase è la copia locale documentata). Il catch mappa P2025 su `NotFoundError` con lo STESSO messaggio del pre-check 404 esistente. Attenzione a `deletePackageType`: la delete è dentro una `$transaction` interattiva (il P2025 emerge dalla transaction). `deleteExpiry` (expiries.service.ts:299) oggi non ha NESSUN try/catch: aggiungerlo (solo P2025→404; non esistono FK RESTRICT verso `Expiry`, le proposte sono CASCADE).
- **Digest tri-stato (AC 2)**: sostituire `ExpiryDigestItem.holderEmailed: boolean` (src/server/adapters/mail/templates.ts:31) con `holderStatus: 'EMAILED' | 'NO_EMAIL' | 'SEND_FAILED'` e popolarlo in `runExpiryAlertsJob` (src/server/services/expiry-alerts.service.ts:150-181: oggi `holderEmailed=false` copre due casi diversi). Template: il placeholder `{noEmailFlag}` di `Emails.expiryDigest.itemLine` diventa un flag generico (es. `{flag}`) valorizzato con `noEmailFlag` (invariato) O una nuova chiave `sendFailedFlag` (IT: " [invio email fallito — verificare l'indirizzo o riprovare]", EN: " [email delivery failed — check the address or retry]"), vuoto per EMAILED. i18n IT/EN simmetrica. Il contatore `holdersWithoutEmail` del risultato job continua a contare SOLO i senza-email (semantica invariata, ci sono unit sopra).
- **Batch `$transaction` (AC 3)**: convertire i siti batch `prisma.$transaction([a, b])` in `$transaction(async (tx) => { ... await sequenziali ... })`. Siti (grep `\$transaction(\[` in src, esclusi i test): people.service.ts:197, 382, 397; expiries.service.ts:425, 605; accounts.service.ts:146, 350; users.service.ts:68; cash.service.ts:432; flights.service.ts:1223; auth-tokens.service.ts:41; aircraft.service.ts:167, 437. Le query DEVONO restare nella STESSA transazione (coerenza items/total sotto scritture concorrenti — non degradare a `Promise.all` fuori transazione). PRIMA di toccare codice: riprodurre la warning (dev server o script mirato, `node --trace-deprecation` se serve) e allegare l'evidenza; DOPO: stessa riproduzione muta. Se la riproduzione dimostra che la warning NON origina da questi siti, fermarsi e documentare (non "fixare" alla cieca).
- **Batch effective-rate (AC 4)**: nuova `getEffectiveRates(actor, aircraftIds: string[], onDate: Date)` in `rates.service.ts` accanto a `getEffectiveRate` (che resta, ha altri consumer): `findMany({ where: { aircraftId: { in: ids }, validFrom: { lte: onDate } }, orderBy: [{ aircraftId: 'asc' }, { validFrom: 'desc' }], distinct: ['aircraftId'] })` → `Map<aircraftId, rate | null>`. SEMPRE query tipizzate su `@db.Date` (lezione 3.5 F1 — MAI raw SQL qui), stessa `authorize` di `getEffectiveRate`. Consumer: `src/app/[locale]/dashboard/aircraft/page.tsx:48-51` (oggi `Promise.all` di N chiamate — sostituire con UNA chiamata; aggiornare il commento 4.1 che motivava l'N+1). Unit test: parità di risultato con `getEffectiveRate` per-id su un dataset con più tariffe per velivolo, boundary `validFrom === onDate` incluso, velivolo senza tariffe → null nella Map, lista vuota → Map vuota.
- **A11y (AC 5)**: (a) `role="alert"` sull'elemento dell'errore di submit nei file dove manca (verificati: `finance/packages/packages-manager.tsx`, `finance/categories/categories-manager.tsx`, `finance/cash-register.tsx`, `expiries/types/types-manager.tsx`, `people/account-panel.tsx` (form top-up), `people/[id]/account/account-statement-table.tsx` (form rettifica), `people/profiles-panel.tsx` — auditarli: alcuni potrebbero avere solo load-error, che NON è submit-error; il pattern esistente è `role="alert"` per errori form e `role="status"` per successi, vedi `packages-panel.tsx`). (b) Smontare le `<label>` wrapper in `cash-register.tsx:248-284` (4 casi, è la barra filtri) → sibling `<label htmlFor>` + `id`, STESSO pattern della FilterBar di flights (5.4) e del resto dello stesso file (righe 428+ già corrette); fare un grep app-wide di altre label-wrapper residue e sistemarle. Layout/stili invariati (le classi flex/gap della label wrapper vanno spostate su un contenitore). Verificare che i locator e2e `getByLabel` esistenti restino verdi.
- **Guard rettifica su PACKAGE_PURCHASE (AC 6)**: in `recordAdjustment` (accounts.service.ts:494), quando `originalMovementId` è presente, aggiungere `type` alla select dell'original e, se `type === 'PACKAGE_PURCHASE'`, → `ConflictError('A package purchase is a zero-amount marker — correct the sale on the cash register instead.')`. NON toccare gli altri tipi (TOP_UP/ADJUSTMENT/FLIGHT_CHARGE restano linkabili: lo storno top-up è il flusso 3.3, il FLIGHT_CHARGE ha il proprio flusso 5.3 ma il link manuale resta legittimo per correzioni parziali). UI: `account-statement-table.tsx` nasconde l'azione per-riga "Rettifica questo movimento" sulle righe `PACKAGE_PURCHASE` (stesso meccanismo con cui la nasconde su `hasReversal`). Messaggio guard cassa: `cash.service.ts:372` → generalizzare (es. 'This movement is the automatic twin of an account movement — correct it via the account rettifica, not the cash register.'); la chiave i18n client `conflictError` (messages/*:425) già generica, verificare che non serva ritocco.
- **Data pacchetto locale-aware (AC 7)**: in `packages-panel.tsx:168` formattare `expiresAt` con il formatter di data già in uso nell'app per le date-only lato client (cercare il pattern usato da expiries/statement — riusarlo, NON inventarne uno); aggiornare l'assert e2e di `package-sale.spec.ts` che oggi cerca l'ISO grezzo. Comment fix su `todayDateOnly` (packages-panel.tsx:59): il commento dice "browser-local-time convention" — verificare cosa fa davvero la funzione e correggere il COMMENTO (4.4 D3 nota che l'implementazione usa UTC), o allinearla alla convenzione degli altri panel se davvero diverge (in tal caso dichiararlo).
- **Refresh AccountPanel post-vendita (AC 8)**: la scheda persona (`people/[id]/page.tsx`) monta `AccountPanel` (riga ~200) e `PackagesPanel` (riga ~241) come sezioni separate di un server component. Soluzione prescritta: un piccolo client provider `AccountRefreshProvider` (context con `version: number` + `bump()`) che AVVOLGE le due sezioni nel server component (i children restano server-rendered — un client component può ricevere children RSC); `PackagesPanel` chiama `bump()` nel suo `onSuccess` di vendita; `AccountPanel` aggiunge `version` alle dipendenze del suo effect di fetch. Il provider deve essere no-op quando i panel sono usati FUORI dalla scheda persona (es. `PackagesPanel` read-only sull'estratto conto, `AccountPanel` altrove): default context = `{ version: 0, bump: () => {} }`, NESSUN throw senza provider. Niente refactor del layout della pagina.
- **Istruttore archiviato (AC 9)**: in `flights.service.ts#resolveFlightInput` (righe ~462-471) aggiungere `archivedAt: true` alla select della person istruttore e trattare `archivedAt !== null` ESATTAMENTE come profilo mancante/disattivato → `ValidationError('Instructor has no active instructor profile.', undefined, 'INSTRUCTOR_NOT_FOUND')` (codice foldato, niente messaggio distinto — anti-enumeration, decisione 5.1). Unit test dedicato.
- **maxLength top-up (AC 10)**: `account-panel.tsx` textarea/input `topup-description` (~riga 331) → `maxLength={500}` (lo Zod server è `.max(500)`, schemas/accounts.ts:43). Controllare anche il campo `reason` della rettifica (`.max(500)`, schemas/accounts.ts:159) e allineare se manca.
- **"Carica altri" storico rettifiche (AC 11)**: `aircraft-manager.tsx:955` fetcha `?pageSize=50` fisso. Il service `listHourMeterAdjustments` è GIÀ paginato e ritorna `total`. UI: mantenere le prime 50, aggiungere un bottone "Carica altri" visibile quando `loaded < total` che fetcha la pagina successiva e APPENDE (stato locale). i18n IT/EN. Niente virtualizzazione, niente redesign.
- **e2e hardening (AC 12, priorità zero — farlo PRIMA degli altri task per non confondere le diagnosi)**: budget di diagnosi serio. Metodo: (0) `curl localhost:3000` DEVE fallire prima di ogni run (altrimenti `pkill -f "next dev"` — lezione dev-server-stale); (1) DB fresco (chiedere il reset alla sessione principale NON serve: il reset iniziale è già fatto; per i run successivi vedi Dev Notes); (2) riprodurre: `npx playwright test flights.spec.ts --repeat-each=5` in isolamento; (3) diagnosi con evidenza (trace/screenshot Playwright, non congetture): ipotesi note = race form-refresh post-submit (il submit fa refresh della lista/router e l'interazione successiva del test gareggia col re-render), ambiguità/staleness dei locator label-based, opzione del select non ancora presente al `selectOption`; (4) fix SOLO lato test: attese su osservabili run-unique (es. attendere `flight-result-panel`/riga con testo run-unique PRIMA della prossima interazione), locator scoped (`getByTestId('flight-form')` davanti ai `getByLabel` oggi page-wide in `flights.spec.ts` — il file già lo fa per 'Velivolo' ma NON per 'Pilota o allievo'/'Istruttore'/'Tipo di volo'), MAI `waitForTimeout` fissi, MAI assert indebolite. Stesso trattamento per `people-management.spec.ts` sotto carico (riprodurre con la full suite). Se dopo diagnosi documentata il fix richiede modifiche di PRODOTTO, fermarsi e dichiararlo in deviations (non farlo di nascosto).
- **FUORI SCOPE (ri-deferiti, motivazione)**: 3.1 O2 idempotency-key epic-wide (decisione architetturale, serve input utente/PRD); 5.4 D1 picker typeahead/paginato oltre `OPTIONS_PAGE_SIZE=100` (feature con story propria); DB-per-worker negli e2e (cambio infrastrutturale, non un fix); 4.3 F2 conflazione messaggi 409 (convenzione ACCETTATA, non un difetto); 2.5 F4/F5 (confermati intended in review).

## Tasks / Subtasks

- [ ] **T0 (AC 12, priorità zero)** — Hardening classe flaky e2e epic 5: riproduzione, diagnosi con evidenza, fix test-side (flights.spec + people-management.spec), verifica `--repeat-each=5` isolato + full suite su DB fresco.
- [ ] **T1 (AC 1)** — `isRecordNotFound` + catch P2025→404 nei 4 delete service + unit test per ciascuno (mock/violazione simulata: il pattern dei test esistenti per P2003 è la guida).
- [ ] **T2 (AC 2)** — Digest tri-stato `holderStatus` + chiave i18n `sendFailedFlag` IT/EN + unit test (send-fail → flag distinto; no-email → flag invariato; EMAILED → nessun flag).
- [ ] **T3 (AC 3)** — Riproduzione DeprecationWarning, conversione dei 13 siti batch→interactive, riproduzione post-fix muta, unit invariati.
- [ ] **T4 (AC 4)** — `getEffectiveRates` batched + consumer flotta + unit test di parità/boundary.
- [ ] **T5 (AC 5)** — Audit + `role="alert"` sui submit-error mancanti; label-wrap smontate (cash-register + eventuali residue); e2e/getByLabel verdi.
- [ ] **T6 (AC 6)** — Guard `PACKAGE_PURCHASE` in `recordAdjustment` + UI hide + messaggio `reverseCashMovement` generalizzato + unit test.
- [ ] **T7 (AC 7)** — Data pacchetto locale-aware + fix commento `todayDateOnly` + assert e2e aggiornata.
- [ ] **T8 (AC 8)** — `AccountRefreshProvider` + wiring PackagesPanel→AccountPanel + verifica interattiva (Playwright MCP: vendi pacchetto, l'anteprima movimenti mostra la riga senza reload).
- [ ] **T9 (AC 9)** — Guard istruttore archiviato + unit test.
- [ ] **T10 (AC 10)** — `maxLength` client su descrizione top-up (e reason rettifica se manca).
- [ ] **T11 (AC 11)** — "Carica altri" storico rettifiche contaore + i18n.
- [ ] **T12** — Gates finali: lint (0 errori oltre il warning benigno noto `data-table.tsx`), typecheck, unit TUTTI verdi, `env -u NODE_ENV npx next build`, e2e full suite su DB fresco (procedura Dev Notes), aggiornare questo file (Dev Agent Record completo, File List = diff reale) e `sprint-status.yaml` (td-1 → review).

## Dev Notes

- **Ordine consigliato**: T0 per primo (diagnosi flake su base pulita, prima che gli altri task tocchino UI/spec); poi T1–T11 in qualsiasi ordine; T5/T7/T8 toccano superfici e2e — ri-lanciare gli spec toccati in isolamento dopo ciascuno.
- **UI**: T5/T7/T8/T11 sono ritocchi a superfici ESISTENTI in stile consolidato (minimalist editoriale): NON servono le skill design per re-inventare nulla, ma la verifica interattiva con Playwright MCP sì (in particolare T8). Nessun nuovo componente visivo salvo il bottone "Carica altri" (stile identico ai bottoni secondari esistenti, es. cash-register riga 412).
- **Ambiente**: DB già migrato+seedato dalla sessione principale; Mailpit: `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025` (background). Il dev agent NON può resettare il DB (guard AI-consent): se un run e2e sporca il DB al punto da falsare i run successivi, documentare e chiedere il reset alla sessione principale nel report finale invece di iterare su DB sporco. PRIMA di ogni run e2e: `curl localhost:3000` deve FALLIRE. MAI `playwright install`. Build SEMPRE `env -u NODE_ENV npx next build`.
- **Commit**: UN SOLO commit di implementazione a fine story (`Story TD-1: ...`), la sessione principale ha già committato lo story file.
- **Messaggi server English-only** (convenzione: futuro client Flutter); UI bilingue IT/EN simmetrica (i test i18n contano le chiavi).
- Non toccare: schema Prisma (NESSUNA migrazione in questa story), RBAC, OpenAPI paths esistenti (nessun endpoint nuovo; `getEffectiveRates` è interno al server).

### References

- [Source: docs/handoffs/HANDOFF.md — lista deferred e lezioni operative]
- [Source: _bmad-output/implementation-artifacts/{2-5,3-1,3-4,4-1,4-3,4-4,5-1,5-4,6-1,6-2,6-3,6-4}-*.md#Review Record — testo integrale di ogni finding]
- [Source: src/server/services/errors.ts; pattern predicati P2002/P2003 locali per-service]
- [Source: lezione 3.5 F1 (query tipizzate su @db.Date), lezione 6.3 F1 (assert e2e solo su osservabili run-unique), lezione 6.4 M1 (query-object Link sostituisce l'intera query string)]

## Dev Agent Record

### Agent Model Used

_(da compilare dal dev agent)_

### Debug Log References

### Completion Notes List

### File List

## Review Record

_(da compilare dopo la review)_

## Change Log

- 2026-07-08: Story file created (Fable 5 main session) dai finding aperti censiti nel handoff di Epic 6, ready-for-dev.
