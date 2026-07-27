---
baseline_commit: 2d0167a
---

# Story Billing-2: La pagina — tre riquadri, registro entrate/uscite, secchiello, card tesoreria

Status: done (review Opus 5 shippable-with-fixes → fix F1-F11 `0b8059e`+`917c3b0`, full suite 270/270 x2, 0 flaky — 2026-07-27)

## Story

As a gestore dell'aviosuperficie,
I want una pagina Contabilità con risultato economico, liquidità e acconti piloti in tre riquadri distinti e un registro a colonne entrate/uscite,
so that non devo più decifrare una colonna firmata che mescola ricavi, costi e debiti verso i piloti.

**Riferimenti vincolanti**: design approvato `docs/superpowers/specs/2026-07-26-billing-rework-design.md` (§5 la pagina, §6 cosa NON cambia, §8 rischi). I numeri arrivano da `getBillingSummary` (Billing-1): questa story è presentazione + le rifiniture di contorno elencate sotto.

**Ratifiche PO (AskUserQuestion 2026-07-26, durante Billing-1)**:
1. **D1**: `getBillingKpis` è sopravvissuto a Billing-1 solo come wrapper per la pagina attuale — QUESTA story lo CANCELLA (export, usi, test) sostituendo il KPI-row con i tre riquadri su `getBillingSummary`.
2. **D5**: Billing-1 ha registrato solo `PUT /api/v1/settings/treasury`. Se la card Impostazioni legge i valori correnti via API serve il `GET` (registrato in OpenAPI + testato); se legge via server component, il GET non serve — scelta al dev, motivata.
3. Terminologia (spec §1): gli acconti sono un **debito verso i piloti** (acconti da clienti, passivo) — le label UI devono dirlo senza connotarlo come negativo.

## Acceptance Criteria

1. **(Tre riquadri)** Il KPI-row attuale di `billing/page.tsx` (5 tile da `getBillingKpis`) è sostituito dai tre riquadri dello spec §5, alimentati da UNA chiamata a `getBillingSummary`: **Risultato <mese>** (ricavi, costi, utile/perdita), **Liquidità** (cassa, banca, "di cui acconti", disponibile, + secchiello non attribuiti quando ≠ 0), **Acconti piloti** (totale, esposizione, n. conti in rosso, link al dettaglio). `getBillingKpis` e i suoi test/usi CANCELLATI (ratifica 1). Il tile "Istruttori" attuale (owed MTD): ricollocato o rimosso coerentemente col design — decisione visiva del dev, motivata nel record.
2. **(Registro entrate/uscite)** La tabella movimenti della console perde la colonna firmata: due colonne **Entrate**/**Uscite** (il flip `-row.amountCents` di `toAccountRow` muore con lei — spec §1) + colonna **Tipo** (ricavo · costo · acconto · giroconto) derivata server-side, che è anche filtro. Le righe di acconto restano visibili, marcate "non incide sul risultato" (spec §5). Paginazione/ordinamento/export esistenti invariati (§6: le route export non cambiano).
3. **(Secchiello non attribuiti)** I movimenti con `paymentMethod IS NULL` sono raggiungibili dalla pagina (filtro dedicato o vista) e un admin può assegnare il metodo al singolo movimento storico: serve un endpoint di riclassificazione (`PATCH` sul movimento, solo `paymentMethod`, gated `finance.manage`, OpenAPI + test) — unico pezzo di backend nuovo di questa story. Il secchiello è VISIBILE finché non è vuoto (spec §8: mai nascosto).
4. **(Card tesoreria in Impostazioni)** Nuova card nel pattern delle esistenti (`club-card`, `smtp-card`): saldi di apertura cassa/banca (in euro, persistiti in cents) + data di apertura, su `getTreasurySettings`/`setTreasurySettings` di Billing-1 (ratifica 2 per il GET). Validazione client coerente con lo schema Zod.
5. **(AirOps + i18n)** Tutto nel design system AirOps (token, primitive `KPI`/`Badge`/`SlideOver`...), bilingue IT/EN (`messages/it.json` + `en.json`), dark theme verificato (lezione 13.9: contrasto misurato, non giudicato).
6. **(e2e)** Scenari e2e nuovi: tre riquadri con numeri veri da scenario seminato (ricarica + volo + payout → i tre blocchi mostrano i valori attesi), filtro tipo, riclassificazione di un movimento dal secchiello (il saldo cassa/banca si aggiorna), card tesoreria (set apertura → la Liquidità cambia). **ATTENZIONE**: lo spec che SCRIVE i saldi di apertura muta AppSettings GLOBALI → DEVE entrare nella catena di project serializzati di `playwright.config.ts` (`dependencies`, come `settings.spec.ts`/`booking-window.spec.ts`) con restore in `afterAll` — con `fullyParallel` uno spec "verde da solo" rompe le create concorrenti degli altri (lezione 12.11 F1). Full suite CI=1 verde.
7. **(Invarianti §6)** Estratto conto della scheda persona INTATTO (pilota-centrico); export e route esistenti INTATTI; nessun cambiamento a come nascono i movimenti.

## Contesto (puntatori — ricognizione 2026-07-26, da rifinire alla partenza)

- Pagina: `src/app/[locale]/dashboard/billing/page.tsx` (276 righe, server component — KPI-row a `:145-149`, `getBillingKpis` chiamato a `:87`); console/tabella: `billing-console.tsx` (735 righe); form: `transaction-editor.tsx` (ha già il Select metodo dal Billing-1).
- Flip di segno da rimuovere: `transactions.service.ts#toAccountRow` (`-row.amountCents`).
- Card Impostazioni: pattern in `src/app/[locale]/dashboard/settings/*-card.tsx` + `page.tsx` (322 righe).
- Servizio: `billing-summary.service.ts#getBillingSummary` (Billing-1) — shape `result`/`treasury`/`deposits`/`byCategory`.
- **Ambiente**: ciclo e regole macchina come `docs/handoffs/HANDOFF.md` (DB fresco al dispatch, gates, JOBS_SECRET export, e2e foreground su file, MAI push/playwright install). Story UI → skill `design-taste-frontend` + `ui-ux-pro-max`, verifica interattiva Playwright.
- Lezioni applicabili: 13.7/13.10 (geometria + hit-test negli e2e di clipping/popover), 13.9 (contrasto computazionale), "il gemello va misurato" (ogni esemplare di pattern toccato va enumerato).
- **Nota F6 (review Billing-1)**: nella pagina attuale `revenueByKind`/`chargesCount` di `getBillingKpis` restano Σ-positivi legacy (deliberato — annotato nel codice): dopo uno storno il pannello "per categoria" è incoerente col KPI. Questa story lo risolve alla radice cancellando `getBillingKpis` e ricostruendo il dettaglio su `getBillingSummary.byCategory`.

## Fuori scope dichiarato

- Riclassificazione di massa dei non attribuiti (si fa movimento per movimento; un bulk è YAGNI finché l'utente non lo chiede).
- Competenza al consumo per i pacchetti ore (feature ritirata in 12.13 — i marker storici restano come sono).
- Qualsiasi cambiamento al modello dati oltre al PATCH di riclassificazione (AC3).

## Dev Agent Record

**Sviluppatore**: Claude Sonnet 5 (dev subagent, xhigh) — 2026-07-27.

### Scelte chiave

1. **AC1** — `getBillingKpis` CANCELLATO per intero (export, chiamanti, test, `BillingKpisDto`/`billingKpisSchema`), insieme ai suoi soli helper morti (`fetchAllLedgerRows`/`sumNegativeAbs`/`countPositive`/`countNegative`/`revenueByKindOf`). I tre riquadri (`billing-panels.tsx`, server-rendered, niente `'use client'`) sostituiscono il `.kpi-row`, alimentati da UNA chiamata a `getBillingSummary`. Il tile "Istruttori" (owed MTD) è stato **rimosso, non ricollocato**: non entra nel modello a tre libri (il compenso istruttori è già dentro `result.costCents` via il gemello AC4 di Billing-1) e la card "Compensi istruttori" sotto il registro (invariata, `getCompensationSummary`) mostra già lo stesso dato per istruttore, con più dettaglio.
2. **AC2** — Il flip club-centrico di `toAccountRow` (`-row.amountCents`) è morto: `TransactionRowDto.amountCents` è ora la direzione RAW (positivo = valore ricevuto, negativo = valore dato) su ENTRAMBI i lati, identica alla convenzione che `CASH` aveva già. Le colonne Entrate/Uscite derivano banalmente dal segno (`> 0` / `< 0`). La colonna Tipo mostra la nuova classificazione a 4 valori (`bookType`: REVENUE/COST/DEPOSIT/TRANSFER = ricavo/costo/acconto/giroconto), calcolata SERVER-SIDE con le STESSE predicate (`ACCOUNT_REVENUE_OR`/`CASH_REVENUE_OR`/`CASH_COST_OR`, esportate da `transactions.service.ts`) che `billing-summary.service.ts` già usa per `result`/`deposits` — una sola definizione, mai due copie (lezione review Billing-1 F5/F6, chiusa alla radice). Le righe DEPOSIT/TRANSFER mostrano "non incide sul risultato" (estesa anche a TRANSFER per coerenza, non solo DEPOSIT come nel mock — entrambe sono davvero fuori da `result`). Il kind granulare (TOP_UP/FLIGHT_CHARGE/categoria cassa) è confluito nella cella Descrizione (`kind — description`), non perso.
3. **AC2 (filtro)** — Il vecchio select "Tipo" (due optgroup miste: 5 tipi conto + categorie cassa) è sostituito da DUE select separate e monouso: "Tipo" (`bookType`, i 4 valori) e "Categoria" (`categoryId`, sole categorie cassa). Il vecchio `movementType` resta nello schema/servizio (retrocompatibile per eventuali consumer API futuri, es. l'app Flutter) ma non ha più un controllo UI — non è un "sotto scopo", è una semplificazione deliberata coerente con l'intento del redesign (il dettaglio per categoria vive già nel pannello "Per categoria" sotto, non nel filtro del registro).
4. **AC2 (export)** — `exportTransactionsXlsx` (la stessa route `GET /api/v1/transactions?format=xlsx`, INVARIATA) ora rispecchia il nuovo modello: colonna Tipo = bookType tradotto, Descrizione = kind + eventuale testo libero, Importo → Entrate/Uscite separate. Necessario perché l'export riusa lo STESSO `TransactionRowDto`/`listTransactions` della console: lasciarlo con la vecchia colonna firmata (ormai con segno RAW invece che club-centrico) avrebbe mostrato dati silenziosamente diversi/fuorvianti rispetto a prima. La ROUTE e la sua esistenza restano intatte (AC7) — solo il contenuto delle colonne segue AC2.
5. **AC3** — `reclassifyCashMovement` (nuovo, in `cash.service.ts`) — `PATCH /api/v1/cash-movements/{id}`, `finance.manage`, accetta solo `paymentMethod`, e SOLO su un movimento CON `paymentMethod` attualmente `null` (409 altrimenti: non è un editing generico, è specificamente "assegna al secchiello"). Il secchiello si raggiunge dal link "Non attribuiti" nel riquadro Liquidità (visibile solo quando `unattributedCents !== 0`, spec §8) che naviga a `?unattributed=true`; una riga CASH con `method === null` mostra un `<select>` inline al posto del testo "—" in Metodo, con submit immediato (nessuna modale: un solo campo, azione a basso rischio). **Nessun writer live produce più un movimento non attribuito** dopo il fix F8/D2 di Billing-1 (sia `recordCashMovement` che `completePprRequest` richiedono ora `paymentMethod`) — l'UNICA via realistica per popolare il secchiello è lo storico pre-migrazione. Per questo `prisma/seed.ts` semina UN movimento manuale deliberatamente non attribuito, scritto DIRETTAMENTE via Prisma (bypassando il servizio, esattamente come apparirebbe un vero rigo pre-Billing-1), idempotente via marker di descrizione — necessario sia per la demo sia per rendere il flusso di riclassificazione testabile end-to-end (altrimenti l'AC6 "riclassificazione di un movimento dal secchiello" sarebbe irraggiungibile su un DB fresco).
6. **AC4** — `TreasuryCard` (pattern `ClubCard`/`SmtpCard`) legge `getTreasurySettings(actor)` in `settings/page.tsx` come SERVER COMPONENT (D5: nessuna route GET registrata — la card è l'UNICO consumer, un round-trip HTTP sarebbe superfluo); salva con `PUT /api/v1/settings/treasury` (già esistente da Billing-1).
7. **AC5** — Verifica interattiva con script `playwright-core` throwaway (MCP non raggiungibile): screenshot light/dark/mobile/tablet/EN, e CONTRASTO MISURATO (canvas round-trip → sRGB → WCAG, lezione 13.9) per ogni colore nuovo. Ha scoperto e chiuso DUE bug reali:
   - `formatCents(-0, ...)` produce "-0,00 €" (segno spurio) quando un chiamante nega un valore di dominio che è esattamente zero (`Costi`/`Esposizione` quando non c'è nulla) — fix in `money.ts` (normalizza `-0` a `0` prima di formattare), con test dedicato.
   - `--ok`/`--bad`/`--warn` USATI COME TESTO diretto (non come sfondo di un `.badge`) falliscono WCAG AA in tema chiaro (misurato: 2.73:1 / 3.96:1 / 2.04:1, tutti sotto 4.5:1) — sono tarati per un accento piccolo (dot, sfondo badge), non per testo di stat-row. Nuove classi `.stat-tone-ok/-bad/-warn` in `airops.css`, stessa tecnica già stabilita da `.badge.ok/.bad/.info` (literal oklch più scuro in chiaro, token raw in scuro) — valori scelti per misura (canvas), non a occhio.
   - Il tavolo movimenti resta scrollabile orizzontalmente DENTRO `.students` (pattern preesistente, `overflow-x:auto`) su mobile — 0px di overflow di pagina misurato, nessuna regressione.
8. **AC6** — Nuovi e2e in `billing.spec.ts` (bookType filter, colonne Entrate/Uscite con volo+ricarica reali, scenario a tre riquadri con delta esatti, secchiello+reclassify) più `e2e/treasury-settings.spec.ts` (nuovo file, in coda alla catena serializzata `playwright.config.ts`: `chromium → settings → booking-window → treasury-settings`, con `afterAll` che riporta i saldi di apertura a 0/0/`2000-01-01`). Debug non banale durante la verifica: `registerFlight` rigetta un `takeoffAt` futuro (`FLIGHT_DATE_IN_FUTURE`) — il primo giro del nuovo test "Entrate/Uscite" usava lo stesso schema data-futura-univoca di `uniqueDatePair()` (adatto a top-up/movimenti cassa, MAI a un volo reale): sostituito con un nuovo helper `uniquePastDateOnly()` (data univoca ma passata, comunque dopo il `validFrom` del noleggio aeromobile). Il test "tre riquadri" falliva inizialmente su un delta di segno opposto sul Costi: non un bug di prodotto, ma un errore nella MIA assert — il riquadro mostra `-result.costCents` (coerente col mock "Costi −2.310 €"), quindi un aumento di costo di 3000 fa muovere il valore VISUALIZZATO di −3000, non +3000 (net/banca, che usano il valore di dominio non negato, erano già corretti). Riprodotto isolando il test (`--workers=1`) per escludere una race fra worker prima di concludere che fosse un errore di segno nel test.

### Deviazioni dallo story file (motivate — da verificare in review)

- **D1 (AC2, filtro `movementType`/`categoryId` UI rimosso)**: l'AC non chiede esplicitamente di rimuovere il vecchio filtro combinato, solo di aggiungere la colonna/filtro Tipo. Ho scelto di sostituire l'unico select "misto" con due select monouso (Tipo=bookType, Categoria=categorie cassa) invece di aggiungerne un terzo — semplifica l'UI (niente più due optgroup nello stesso controllo) senza perdere capacità (il filtro per singola categoria resta, solo più esplicito). Segnalo per la review: se l'intento era mantenere ANCHE `movementType` come filtro UI separato, è una scelta di design da riconfermare, non un buco di copertura (resta disponibile via API/schema, solo senza controllo).
- **D2 (AC2, export xlsx aggiornato)**: l'AC7 dice "export ... intatti" — ho mantenuto la ROUTE e la sua esistenza identiche, ma il CONTENUTO delle colonne segue necessariamente AC2 (stesso `TransactionRowDto` da cui l'export legge). Motivato sopra (punto 4).
- **D3 (AC3, seed di un movimento storico non attribuito)**: nessun writer live può più produrre un movimento `paymentMethod IS NULL` (Billing-1 F8/D2 hanno chiuso l'ultimo gap). Ho aggiunto UNA riga seminata direttamente via Prisma in `prisma/seed.ts` (categoria "Altro", 5,00 €, `paymentMethod: null`, marcata come storica) per rendere il secchiello raggiungibile/testabile su un DB fresco — altrimenti l'intera AC3 (UI + reclassify) sarebbe irraggiungibile e non verificabile end-to-end. Idempotente (find-or-skip su una descrizione marker), nessun altro seed esistente tocca il registro cassa quindi rischio di collisione nullo.
- **D4 (AC1, tile "Istruttori" rimosso non ricollocato)**: motivato sopra (punto 1) — segnalo esplicitamente per la review, come richiesto dallo story file ("ricollocalo o rimuovilo con motivazione").
- **D5 (AC4, nessuna route GET treasury)**: server component read (`getTreasurySettings(actor)` diretto in `settings/page.tsx`), nessun round-trip HTTP — la card è l'unico consumer. Nessuna nuova route aggiunta rispetto a Billing-1.
- **D6 (fix incidentale, `prisma/schema.prisma`)**: il doc-comment di `CashMovement.paymentMethod` diceva ancora "completePprRequest ... accepts it optionally", stale dal fix F8/D2 di Billing-1 (ora mandatory). Corretto lo stesso commento che stavo leggendo per la scelta D3 — un solo blocco di commento, nessun cambiamento di schema/migrazione.
- **D7 (fix incidentale, `money.ts` — vedi punto 7 sopra)**: `formatCents(-0, ...)`. Bug reale scoperto dalla verifica interattiva richiesta dalla story stessa, non introdotto per scope creep: colpiva direttamente i nuovi riquadri Billing-2.

### Risultati gates (verbatim)

```
PASS  lint (33s)
PASS  typecheck (4s)
PASS  test (12s) — Tests  1519 passed (1519)
PASS  build (43s)
```

### Full suite finale (verbatim)

Build prod + DB fresco (`docker compose down -v && up -d`, `migrate deploy` + `prisma db seed`), `JOBS_SECRET` non-placeholder esportato, `CI=1 npx playwright test`:

```
Running 270 tests using 2 workers
...
  1 flaky
    [chromium] › e2e/billing.spec.ts:275:7 › ... the three riquadri (Risultato/Liquidità/Acconti) do NOT change when the table filters do ...
  269 passed (8.2m)
```
Exit code `0`. Il flaky è la classe nota "aggregato globale sotto `fullyParallel`" (stesso pattern già accettato in `reports.spec.ts`: un prelievo before/after su Cassa/Banca — ALL-TIME, non filtrato per fixture — può intercettare un movimento di UN'ALTRA suite concorrente nella stessa finestra): verde al retry, non inseguito, come da convenzione di progetto ("1 flaky/run con retry verde è fisiologico").

### File List

- `prisma/schema.prisma` (commento, D6), `prisma/seed.ts` (nuovo seed non attribuito, D3)
- `src/lib/money.ts` (+ `.test.ts`, fix D7)
- `src/lib/schemas/transactions.ts` (bookType, filtri, rimozione `billingKpisSchema`), `src/lib/schemas/cash.ts` (reclassify schema), `src/lib/schemas/registry.{ts,test.ts}` (PATCH cash-movements/{id})
- `src/server/services/transactions.service.ts` (+ `.test.ts`): rimosso flip/`getBillingKpis`, aggiunto bookType/predicate condivise/filtro `unattributed`
- `src/server/services/billing-summary.service.ts` (+ `.test.ts`): riuso `CASH_COST_OR`
- `src/server/services/cash.service.ts` (+ `.test.ts`): `reclassifyCashMovement`
- `src/server/services/exports.service.ts` (+ `.test.ts`): colonne xlsx aggiornate
- `src/server/services/stats.service.ts` (commento)
- `src/app/api/v1/cash-movements/[id]/route.ts` (nuovo, PATCH)
- `src/app/[locale]/dashboard/billing/{page.tsx,billing-console.tsx}` (riscrittura), `billing-panels.tsx` (nuovo)
- `src/app/[locale]/dashboard/settings/{page.tsx,treasury-card.tsx}` (nuovo)
- `src/styles/airops.css` (`.billing-panels`, `.stat-tone-*`)
- `messages/{it,en}.json` (BillingPage riscritto, SettingsPage.treasury nuovo)
- `e2e/{billing,cash-register,cash-report,movements}.spec.ts` (aggiornati), `e2e/treasury-settings.spec.ts` (nuovo)
- `playwright.config.ts` (catena serializzata + progetto `treasury-settings`)

## Review Record

**Reviewer**: Claude Opus 5 (subagent adversarial, xhigh) — 2026-07-27. **Verdetto: shippable with fixes.**

**Perimetro**: `git diff 2d0167a..HEAD` (commit `a30593e` story-in-dev, `5fed728` implementazione, `01be948` Dev Agent Record) — 33 file, +1721/−519. Riferimenti: AC 1-7 dello story file, spec `docs/superpowers/specs/2026-07-26-billing-rework-design.md` §5/§6/§8, Review Record di Billing-1 (ratifiche PO su F3/F6/D2), `karpathy-guidelines`.

### Metodologia (empirica, non solo lettura)

- **Full suite di arbitrato** su DB fresco (`docker compose down -v && up -d` + `migrate deploy` + `db seed`), build di produzione, `JOBS_SECRET` non-placeholder, `CI=1 npx playwright test` in foreground con output su file.
- **Gates** rieseguiti indipendentemente (`npm run gates`).
- **DB reale** ispezionato via `psql` (docker exec): distribuzione dei tipi di movimento, righe non attribuite, AppSetting treasury, effetti di ogni PATCH.
- **API reale** via script `playwright-core` throwaway (MCP non raggiungibile dai subagent): matrice RBAC a 5 utenze + anonimo sul nuovo PATCH e sul PUT tesoreria, casi 404/409/422/405, 6 PATCH concorrenti sulla stessa riga, combinazioni di filtri, export xlsx scaricato e riletto con ExcelJS.
- **Scenario contabile avverso** seminato via API (ricarica, volo, storno volo, rettifica collegata a una ricarica, giroconto standalone, addebito standalone, entrata cassa + storno, uscita cassa + storno, PPR contante, payout istruttore) e **cross-check indipendente riga↔aggregato**: ricomposizione di `revenueCents`/`costCents`/`netCents` dalla sola colonna Tipo di tutte le righe del mese, confrontata con i tre riquadri.
- **UI reale** (chiaro/scuro/mobile 390, IT): screenshot, geometria misurata, **contrasto misurato** con round-trip canvas→sRGB→WCAG (lezione 13.9), console pulita, flusso secchiello e card tesoreria guidati a mano.

### Esito suite (verbatim)

```
Running 270 tests using 2 workers
...
  1 flaky
    [chromium] › e2e/billing.spec.ts:275:7 › ... the three riquadri (Risultato/Liquidità/Acconti) do NOT change when the table filters do ...
  269 passed (8.3m)
PLAYWRIGHT EXIT=0
```
Il fallimento del primo tentativo, verbatim: `expect(received).toEqual(expected)` con `- "440,00 €" / + "490,00 €"` sul riquadro **Banca** (`e2e/billing.spec.ts:293`). Gates: `PASS lint (25s) · PASS typecheck (3s) · PASS test (9s) — 1519 passed · PASS build (41s)`.

**Nota dell'arbitro**: lo stesso test ha flakato nel run del dev e nel mio — 2 su 2, sullo stesso riquadro. Non è la classe "1 flaky/run fisiologico" (vedi F4).

### Findings

| # | Sev | Sintesi |
|---|---|---|
| F1 | major | Il link "Non attribuiti" è condizionato alla SOMMA (`unattributedCents !== 0`, `billing-panels.tsx:103`): con due righe non attribuite di segno opposto il secchiello diventa irraggiungibile dalla UI pur avendo 2 righe in DB (riprodotto). AC3/spec §8 dicono "visibile finché non è vuoto" — vuoto = zero righe. |
| F2 | major | Le nuove colonne Entrate/Uscite (`billing-console.tsx:561-566`) usano `var(--ok)`/`var(--bad)` come testo: **2,73:1** e **3,96:1** misurati in tema chiaro (soglia 4,5:1), mentre lo stesso commit crea `.stat-tone-*` in `airops.css:718-737` proprio perché quei token falliscono AA come testo. Scuro OK (9,3 / 6,61). |
| F3 | major | Una rettifica collegata a un TOP_UP è marcata "Ricavo" **e** sommata in Ricavi: correggere una ricarica di 100 € con −50 € genera **+50,00 € di ricavo** (misurato: 150071 → 155071, cassa invariata). Contraddice la regola PO ratificata in Billing-1 ("lo storno appartiene al libro del suo originale"): il libro dell'originale è ACCONTI. Predicato ereditato (`ACCOUNT_REVENUE_OR`, `transactions.service.ts:112-117`) ma reso visibile e contrattuale da AC2 (`accountBookType`, `:133-139`) — il fix va fatto sulle due definizioni insieme, previa ratifica PO. |
| F4 | major | `e2e/billing.spec.ts:275` asserisce l'uguaglianza byte-per-byte di 5 valori tra cui due aggregati **ALL-TIME globali** (cassa/banca) mentre altri worker creano top-up BANK_TRANSFER: flaky in 2 run su 2. Il paragone con `reports.spec.ts` non regge (là: assert delta, aggregato di mese, finestra breve, mai osservato flakare). Da serializzare o da indurire. |
| F5 | minor | La guardia `test.skip` del test secchiello (`e2e/billing.spec.ts:478-480`) si basa sulla presenza del link, non sulla riga seminata: con altre righe non attribuite in DB (lo stato normale di un'installazione reale) il test **fallisce** invece di saltare — riprodotto (`Expected: 1, Received: 0`). Fixture globale a uso singolo, senza restore. |
| F6 | minor | `billing-summary.service.test.ts:39` mocka `CASH_COST_OR` con una **copia letterale**: un cambio del predicato vero non farebbe fallire i test del servizio che dovrebbe condividerlo — stessa classe di Billing-1 F4. |
| F7 | minor | Entrate/Uscite mescolano due sistemi di riferimento (conto pilota per le righe ACCOUNT, denaro del club per le CASH): un "Ricavo" da volo cade in Uscite, un "Ricavo" da PPR in Entrate. **Fedele al mock approvato dello spec §5** → domanda di design da riportare al PO, non errore del dev. |
| F8 | nit | `billing-summary.service.ts:20` e `:148` citano ancora `getBillingKpis` al presente (cancellata da questa story). |
| F9 | nit | Tre bordi riga↔predicato disallineati ma oggi irraggiungibili (PACKAGE_PURCHASE, ADJUSTMENT a 0 con `reversalOfId`, CashMovement a 0): verificato in DB che non esiste nessuna riga di quei tipi. |
| F10 | nit | `unattributed=1`/`=yes` letti silenziosamente come `false` (`schemas/transactions.ts:117`), pur essendo pubblicato come booleano in OpenAPI. |
| F11 | nit | La vista `?unattributed=true` non dichiara il filtro attivo (sottotitolo ancora "storico completo", select su "Tutti/Tutte"). |

### Verdetti sulle deviazioni

- **D1** (filtro `movementType` senza controllo UI) — **conforme, e nel merito approvata**: parametro ancora valido via API (`movementType=TOP_UP` → 200/32 righe; `movementType`+`categoryId` → 422), due select monouso al posto dell'unico misto, nessuna capacità realmente persa (il dettaglio per tipo conto vive nel Registro voli / pannello Per categoria).
- **D2** (export xlsx aggiornato, route invariata) — **conforme e necessaria**: file vero scaricato in it/en e con `unattributed=true`, header `…|Entrate|Uscite|Stato`, content-type/filename invariati. AC7 rispettata nella sostanza.
- **D3** (riga non attribuita seminata) — **conforme, con riserva**: non altera conteggi altrui (suite verde su DB fresco), senza di essa AC3 sarebbe intestabile; ma è una fixture globale a uso singolo, senza restore, che sposta la Cassa di +5,00 € a metà suite (concausa di F4) e la cui guardia di re-run è rotta (F5).
- **D4** (tile "Istruttori" rimosso) — **conforme, motivazione solida**: il payout è già dentro `result.costCents` (misurato: −30,00 € su Costi e Banca), la card "Compensi istruttori" resta e mostra più dettaglio.
- **D5** (nessuna GET tesoreria) — **conforme**, consentita dallo story file: prefill da server component, PUT 200 con persistenza, RBAC admin-only verificata su 5 utenze, validazione client coerente con lo Zod.
- **D6** (doc-comment schema) — **conforme**, il testo corrisponde allo stato post Billing-1 F8/D2.
- **D7** (fix `formatCents(-0)`) — **conforme**, bug reale, fix minimo, test it/en, nessun "-0,00" renderizzato.

### Conclusione

Le fondamenta della pagina reggono: la classificazione a quattro libri è **davvero** coerente con gli aggregati (verificato ricomponendo revenue/cost/net dalle sole righe su 72 movimenti reali, incluso uno scenario avverso con storni su entrambi i lati: match esatto, filtri esatti), la RBAC del nuovo endpoint è corretta su tutte le utenze e sotto contesa, gli invarianti §6 (estratto conto pilota-centrico, route export, paginazione/ordinamento) sono intatti e misurati, i riquadri sono a norma di contrasto in entrambi i temi e la suite completa è verde. Restano quattro difetti major, tutti chirurgici: **F1** (una condizione da spostare da somma a conteggio + un campo nel summary), **F2** (due classi CSS già esistenti da applicare), **F4** (un test da serializzare o indurire) e **F3**, l'unico che richiede una **ratifica PO** prima del fix perché estende la regola di storno già ratificata in Billing-1 al caso "rettifica di una ricarica". F5-F6 sono robustezza dei test, F7 è una domanda di design da riportare al PO (l'implementazione è fedele al mock approvato), F8-F11 sono nit.

### Fix post-review (2026-07-27, fix-subagent Sonnet 5 xhigh — commit `0b8059e` + follow-up `917c3b0`)

**Ratifiche PO (AskUserQuestion, fine review)**: **F7 → PROSPETTIVA CLUB UNIFORME sul registro** (decisione che SUPERA il mock §5 dello spec, aggiornato nello stesso commit con nota di ratifica): addebito volo → Entrate (ricavo di competenza), ricarica → Entrate (acconto, non incide), storni/costi → Uscite. **F3** = applicazione diretta della ratifica Billing-1 "lo storno appartiene al libro del suo originale" — nessuna nuova decisione richiesta.

- **F7 fixed** — helper unico `ledgerClubAmountCents` (CASH invariato; ACCOUNT negato solo su bookType REVENUE, allineato alla negazione di `computeRevenueCents`; DEPOSIT/TRANSFER a segno raw come `computeDeposits`), usato da console E export xlsx. Spec §5 aggiornato. Un e2e che asseriva la colonna vecchia (con assert row-wide troppo lasche per accorgersene) aggiornato e reso discriminante su celle `.stat-tone-*` (follow-up `917c3b0` + seconda full suite di conferma). Fixture unit irreale corretta (FLIGHT_CHARGE positivo).
- **F3 fixed** — `ACCOUNT_REVENUE_OR` esclude le rettifiche di TOP_UP (clausola negativa) E, per coerenza riga-vs-aggregato, la clausola positiva (storno di una rettifica-di-ricarica, caso raggiungibile dalla UI: verificato). `accountBookType` riallineato branch-per-branch → DEPOSIT. Il caso nipote NEGATIVO documentato esplicitamente fuori scope nel doc-comment. Unit test: delta `revenueCents` = 0 sulla coppia ricarica+rettifica, esclusioni asserite sulla where.
- **F1 fixed** — `treasury.unattributedCount` (count nella stessa `Promise.all`); il link gated sul COUNT (>0), label "Non attribuiti (N)". Unit test col caso somma-zero/count-2 del reviewer.
- **F2 fixed** — celle Entrate/Uscite su classi `.stat-tone-*`; contrasto RIMISURATO su app reale: chiaro 10,06:1 / 9,30:1, scuro 8,73:1 / 6,20:1 — tutti sopra 4,5:1.
- **F4/F5/riserva D3 fixed (soluzione unica)** — nuovo `e2e/billing-global.spec.ts` (project serializzato `billing-global` in coda alla catena, dopo `treasury-settings`): dentro sia il test dei riquadri invarianti (uguaglianza byte-per-byte ora deterministica + assert positivo che il filtro HA cambiato la tabella) sia il test del secchiello (guardia riscritta sul marker della riga seminata via API; consumo della fixture senza restore documentato e accettato — posizione in coda = innocuo).
- **F6 fixed** — predicati REALI via `vi.importActual`, mockata solo `getLedgerRevenueCents` (verificato che non inciampa nella validazione eager di `@/lib/env`).
- **F8 fixed** — doc-comment stale sostituiti coi consumer veri.
- **F9 fixed** — i 3 bordi allineati (PACKAGE_PURCHASE → TRANSFER; ADJUSTMENT zero con reversalOfId → TRANSFER; CashMovement zero → TRANSFER) + unit test dei tre bordi (difensivo: oggi irraggiungibili).
- **F10 fixed** — `unattributed` accetta `'true'/'1'/'false'/'0'`/boolean, il resto passa a `z.boolean()` che 422a; test schema dedicato.
- **F11 fixed** — chip dismissibile "Non attribuiti ×" (Badge info, i18n IT/EN) nella barra filtri su `?unattributed=true`, verificato interattivamente.

**Gates post-fix**: PASS lint/typecheck/test/build — **1536 unit passed** (dev baseline: 1519). Eseguiti due volte, entrambi verdi.

**Full suite finale (eseguita dal fix-subagent DUE volte, DB fresco + build prod + JOBS_SECRET, foreground su file)**:

```
270 passed (9.6m)
```
Exit code `0`, **0 flaky** in entrambi i run — la classe di flaky del run dev (269+1) è ELIMINATA per costruzione, non per retry.

**Esito finale: tutti i findings chiusi. Story DONE.**
