---
baseline_commit: f62151d
---

# Story 13.5: Polish tabelle — billing + logbook + expiries (filtri free-text, export dropdown, rinomine, colonne)

Status: review

# Story

As a admin/staff dell'aviosuperficie,
I want che le tabelle billing/logbook/expiries abbiano filtri pilota a testo libero coerenti con Piloti, export a dropdown unico, e le rinomine/pulizie richieste,
so that le pagine dati siano coerenti e leggibili come il resto dell'app.

**Riferimenti vincolanti**: piano `docs/superpowers/plans/2026-07-22-epic-13-ui-feedback.md` (Task 5). Riferimento filtro free-text = quello di Piloti (`pilots-console.tsx`, input `.search` con debounce → `q` server-side).

**Ratifica PO (AskUserQuestion 2026-07-25)**: il feedback "billing statement da cancellare da UI E backend" → **rimuovere SOLO il dialog di billing** ("Estratti conto"); l'endpoint `/api/v1/people/[id]/account/pdf` RESTA perché lo usa la sezione estratto conto della scheda persona (13.3). Il picker pilota+periodo (from/to) di billing sparisce — i dati filtrati sono già coperti dall'export della tabella billing + l'export nella scheda persona.

## Acceptance Criteria — BILLING

1. **(Filtro pilota free-text)** Il filtro pilota di billing (`SearchCombobox`, `billing-console.tsx:430-441`, `searchPersonFilter`) diventa un input free-text con debounce come Piloti (`pilots-console.tsx:240-250` + server `q`). Coerenza visiva/comportamentale col filtro Piloti.
2. **(Stringa id sotto il nome)** Sotto il nome del pilota nelle righe billing compare `row.id` (`billing-console.tsx:481-483`, `.student-sub mono`) — RIMOSSA: mostrare solo nome e cognome.
3. **(Colonna "Tipo" larghezza)** La colonna Tipo (3ª in `COLS` `billing-console.tsx:134`, `108px` fissa) tronca "Storno addebito volo"/"flight charge reversal" via `.student-row > * { overflow:hidden }` (`airops.css:857`) → allargare la colonna (o gestire il wrap) così i tipi lunghi si leggono.
4. **(Rimozione dialog Estratti conto)** Il bottone "Estratti conto" (`billing-console.tsx:448-450`, `billing-statements-button`) + `StatementDialog` (`statement-dialog.tsx`, render L645, stato `statementsOpen`, label `statements`/`statementsDialog`) RIMOSSI da billing (UI + i18n orfane). **L'endpoint `/api/v1/people/[id]/account/pdf` NON si tocca** (lo usa la scheda persona 13.3 — ratifica). L'`ExportMenu` della tabella billing (cash-report + export tabella) resta invariato. Verificare che nessun altro consumer usi `StatementDialog`/le sue label.

## Acceptance Criteria — LOGBOOK

5. **(Rinomine azioni)** In `logbook-console.tsx` (registro voli): "Correggi"→"Modifica" (EN "Correct"→"Edit"), "Storna"→"Annulla" (EN "Reverse"→"Cancel") — solo le LABEL i18n IT+EN delle azioni, nessun cambio di semantica backend (l'azione resta storno/correzione).
6. **(Export dropdown unico)** I due bottoni export separati (`logbook-console.tsx:386-388` PDF, `:389-391` Excel, due `<a class="btn">`) diventano UN `ExportMenu` con dropdown (pattern già usato da fleet/pilots/billing — xlsx+pdf, riuso `exportHref`/`pdfExportHref` esistenti).
7. **(Filtro pilota free-text)** Il filtro pilota del logbook (oggi `<select>` nativo di tutte le persone, `logbook-console.tsx:340-355`, `personSelectOptions`) diventa input free-text con debounce come Piloti.
8. **(Font suggerimenti)** Gli input pilota/aeromobile del form "Nuova voce" (`flight-editor.tsx`, `SearchCombobox`) mostrano i suggerimenti con il font sbagliato: la lista `<ul>/<li>` di `search-combobox.tsx:275-313` è stilizzata SOLO con utility Tailwind e non imposta `font-family` → **convertire il dropdown a airops.css** (classi/token del design system, `--font-sans`) così i suggerimenti ereditano il font dell'app. NB: `search-combobox` resta il componente (non si rimuove — è la 13.11 a valutare le dipendenze); qui si ritematizza SOLO il suo dropdown.

## Acceptance Criteria — EXPIRIES

9. **(Filtro pilota free-text)** Il filtro pilota di expiries (`SearchCombobox`, `scadenze-console.tsx:215`, `searchPersonFilter`) diventa input free-text con debounce come Piloti (gli altri filtri — finestra segmented, tipo select — restano).
10. **(Verifica invio email promemoria)** Il bottone "Invia promemoria" (`scadenze-console.tsx`, `sendReminders` → `POST /api/v1/expiry-alerts/trigger` → `runExpiryAlertsJob`) manda email REALI (verificato in ricognizione: holder + digest staff via SMTP, idempotente via SentAlert). Questa story lo PROVA end-to-end vs Mailpit (nessun fix atteso salvo regressioni) e lascia evidenza nel Dev Agent Record.

## Acceptance Criteria — comuni

11. **(e2e + skill UI)** e2e: filtri free-text billing/logbook/expiries filtrano davvero; export dropdown logbook (2 href corretti); rinomine visibili; assenza dialog Estratti conto in billing; assenza stringa id sotto nome; colonna Tipo non troncata; promemoria expiries → email in Mailpit. e2e esistenti che usano i vecchi filtri/select/dialog aggiornate. Selettori scoped/exact, MAI hasText con date/H:MM. Skill: karpathy-guidelines + design-taste-frontend + ui-ux-pro-max; coerenza AirOps. Verifica interattiva: prova PRIMA i tool `mcp__playwright__*` (Docker; se non raggiungibili dalla sessione subagent → script `@playwright/test` throwaway in /tmp, cancellati prima del commit).

## Contesto (puntatori — ricognizione 2026-07-24/25)

- Filtro free-text di riferimento: `pilots-console.tsx:240-250` (input `.search` debounced) + server `q` (`people.service.ts:195-202`).
- Billing: `billing-console.tsx` (filtro combobox :430, id sotto nome :481-483, COLS :134, bottone statement :448, StatementDialog render :645); `statement-dialog.tsx` usa `/account/pdf?from&to` — endpoint CONDIVISO con `people/[id]/page.tsx:262` (scheda persona, 13.3) → NON rimuovere l'endpoint.
- Logbook: `logbook-console.tsx` (export 2 bottoni :386-391, filtro select :340-355); `flight-editor.tsx` (SearchCombobox pilota/aereo); `search-combobox.tsx:275-313` (dropdown Tailwind-only, no font-family).
- Expiries: `scadenze-console.tsx` (filtro combobox :215, sendReminders); catena email `expiry-alerts.service.ts#runExpiryAlertsJob` (SMTP reale, Mailpit `http://localhost:8025/api/v1/messages`).
- **Ambiente**: identico alle story precedenti (DB fresco al dispatch, gates prima del commit, e2e foreground, commit appena i gates passano, MAI push, MAI playwright install, NON toccare package.json). Commit: `feat(13.5): polish tabelle billing/logbook/expiries (filtri free-text, export dropdown, rinomine)` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Ritiro stack legacy / rimozione `search-combobox` (13.11) — qui si ritematizza solo il suo dropdown (AC8).
- Filtro pilota della Pianificazione (13.7) e ogni altra pagina della punch-list.
- Qualunque cambiamento alla semantica backend di storno/correzione voli o al job promemoria (solo verifica).

## Dev Agent Record

### Implementation Plan

- **Filtri pilota free-text (AC1/AC7/AC9)**: `pilots-console.tsx`'s pattern (`.search`/`.bare-input` + `useDebouncedCallback` locale 400ms) portato IDENTICO in `billing-console.tsx`, `logbook-console.tsx`, `scadenze-console.tsx`. Nuovo filtro **`personQuery`** (server: substring case-insensitive su `person.firstName`/`lastName`) ADD-ONLY accanto al `personId` esistente, non lo sostituisce a livello API: schema (`listTransactionsQuerySchema`/`listFlightsQuerySchema`/`listAllExpiriesQuerySchema`) e service (`transactions.service.ts#buildAccountWhere/buildCashWhere`, `flights.service.ts#buildFlightsWhere`, `expiries.service.ts#listAllExpiries`) ricevono un `personQuery` opzionale AND-combinato — `personId` resta invariato e supportato. Motivo: **logbook ha un deep-link reale** (`people/[id]/page.tsx:401` "Vedi tutti" → `/dashboard/logbook?personId=X`, testato da `person-detail.spec.ts` e dalla paginazione in `flight-log.spec.ts`) che deve continuare a funzionare per ID esatto — `LogbookFilters.personId` resta quindi INTOCCATO nel tipo/`buildFilterQuery`/`navigate` (nessun controllo UI lo edita più, ma sopravvive a un cambio di filtro come già faceva), mentre il nuovo `personQuery` è un campo aggiuntivo pilotato dal nuovo input. Billing/expiries non hanno alcun deep-link `?personId=` noto (grep sull'intero repo) → il loro `BillingFilters`/`ScadenzeFilters` **sostituisce** `personId` con `personQuery` (nessun controllo UI lo settava comunque più). RBAC: `personQuery` non ha bisogno di guardia dedicata — per un attore non-staff (own-access logbook) l'`OR` di scope resta la base WHERE, `personQuery` può solo restringere, mai allargare.
- **AC2 (id sotto il nome)**: rimossa la riga `.student-sub mono {row.id}`; il wrapper `<div>` col solo `student-name` è stato appiattito (era un single-child superfluo dopo la rimozione).
- **AC3 (colonna Tipo)**: `COLS` billing, 3ª colonna `108px → 170px` (verificato via Playwright: "Flight charge reversal" EN, la label più lunga, occupa 151px in un contenitore di 170px — zero overflow).
- **AC4 (rimozione Estratti conto)**: bottone `billing-statements-button` + `StatementDialog` (intero componente `statement-dialog.tsx` cancellato) + label i18n orfane (`statements`, `statementsDialog.*`) rimossi da billing. **Verificato con grep sull'intero repo**: `StatementDialog`/`statement-dialog`/`statementsDialog`/`billing-statements-button` zero occorrenze residue. L'endpoint `/api/v1/people/[id]/account/pdf` è **byte-per-byte intoccato** (`git diff` vuoto sulla route) — resta usato da `people/[id]/page.tsx` (13.3) e coperto da `pdf-exports.spec.ts`/`person-detail.spec.ts` (mai toccati).
- **AC5 (rinomine)**: SOLO `LogbookPage.table.cancelAction`/`correctAction` (IT "Storna"→"Annulla", "Correggi"→"Modifica"; EN "Cancel" era già corretto, "Correct"→"Edit") — scope minimo deliberato: il modal/editor restano "Storna volo"/"Correggi volo" (la semantica backend/UX-copy del flusso non cambia, solo il testo dei due bottoni riga). NB trovata durante la ricognizione: esiste un secondo, OMONIMO paio di chiavi `FlightsPage.list.table.cancelAction/correctAction` (namespace della pagina legacy `/dashboard/flights`, ORA morta ma le sue stringhe restano vive SOLO come header colonne export xlsx in `exports.service.ts` — NON bottoni) — **non toccato**, fuori scope.
- **AC6 (export dropdown logbook)**: i due `<a class="btn">` (PDF/Excel) sostituiti da UN `<ExportMenu>` (stesso componente/pattern di fleet/pilots/billing), nuove chiavi `LogbookPage.exportMenu.{label,xlsLabel,pdfLabel}` (rimpiazzano le vecchie `exportLabel`/`exportPdfLabel`).
- **AC8 (font dropdown search-combobox)**: eseguita l'azione prescritta dalla story (dropdown `<ul>/<li>` da Tailwind-only ad airops.css) — nuove classi `.combo-listbox`/`.combo-option` (con `font-family:var(--font-ui)` ESPLICITO + token `--radius-xs`/`--shadow-md` del design system), `search-combobox.tsx` aggiorna SOLO le `className` delle righe 274-315, zero cambi di markup/comportamento/props. **Nota di trasparenza per il reviewer**: ho provato a riprodurre empiricamente il bug (root cause) PRIMA del fix con un test "clean-room" (le vecchie classi Tailwind ricreate via `document.createElement` su una pagina reale, senza toccare alcun file) — in QUESTO ambiente locale il `<body>` risolve GIÀ a Inter Tight (la regola `body{font-family:var(--font-ui)}` di airops.css batte la classe Tailwind `font-[family-name:var(--font-sans)]` di `[locale]/layout.tsx`, verosimilmente perché l'import di airops.css non passa per un `@layer` Tailwind mentre le utility sì — non ho isolato la meccanica esatta), quindi il dropdown ereditava GIÀ correttamente Inter Tight anche PRIMA del mio intervento: non sono riuscito a riprodurre visivamente il font "sbagliato" in questo ambiente. L'azione prescritta resta comunque corretta ingegneria (font esplicito e autosufficiente invece di dipendere da un'inheritance chain fragile fino al body, coerente con OGNI altro controllo AirOps) e non è un no-op: rende il comportamento deterministico invece che accidentale. Segnalo la circostanza (bug non riproducibile qui) perché il reviewer verifichi se era ambiente-specifico (browser/font system diverso) o se il recon originale si riferiva a un'altra causa.
- **AC10 (verifica promemoria)**: NON un fix — provato end-to-end con un browser reale (sessione admin autenticata), un titolare con email + scadenza a 7gg, click reale sul bottone "Invia promemoria": UI mostra "Promemoria inviati: 1 ai titolari, 2 allo staff.", Mailpit riceve realmente l'email al titolare (subject "Promemoria scadenza: …", corpo con la data di scadenza). Nessuna regressione: `expiry-alerts.spec.ts` (mai toccato) resta 4/4 verde.
- Pulizia i18n a cascata (solo chiavi diventate orfane DAL MIO cambiamento, non chiavi pre-esistenti): billing `filters.allPilots`/`picker.*`/`statements`/`statementsDialog.*` rimossi; logbook `filters.allPeople`/`exportLabel`/`exportPdfLabel` rimossi, `personFilterOptions`/`peopleResult` (query `listPeople` dedicata al vecchio `<select>`) rimossi da `logbook/page.tsx` (dead code diretto della mia rimozione); expiries `registry.filters.picker.*` rimossi (`allPilots` invece RESTA: ancora usato dal blank-entry di `personComboOptions`, tuttora consumato da `MembershipFeeModal`, NON toccato). Parità IT/EN verificata (JSON validato + build passa).

### Completion Notes

- AC1/AC7/AC9: done — input free-text, stile/debounce IDENTICI a Piloti, verificati sia via Playwright interattivo (screenshot) sia via e2e (billing/logbook nuovi/riscritti, expiries nuovo test).
- AC2: done — nessuna label `.student-sub` residua nella riga billing (e2e dedicato).
- AC3: done — colonna Tipo verificata a 170px, "Flight charge reversal" (EN, la label più lunga) non tronca (e2e dedicato + verifica interattiva IT "Storno volo"/EN "Flight charge reversal").
- AC4: done — dialog rimosso, endpoint condiviso intoccato (diff vuoto), zero consumer residui (grep).
- AC5: done — solo le due label riga, verificate anche via e2e (`flight-reversal.spec.ts`, testo esatto "Annulla"/"Modifica" sui bottoni riga prima del click).
- AC6: done — un solo `ExportMenu`, verificato via e2e riscritti (`exports.spec.ts`/`pdf-exports.spec.ts`, pattern "apri il popover poi clicca la riga" già usato da `cash-report.spec.ts`).
- AC8: done — azione prescritta eseguita e verificata via computed style (`"Inter Tight", ui-sans-serif, system-ui, sans-serif` su listbox e `<li>`, identico a input/body); bug pre-fix NON riprodotto empiricamente in questo ambiente (vedi nota di trasparenza sopra nell'Implementation Plan).
- AC10: done — provato end-to-end contro Mailpit reale con un click reale sul bottone di produzione, evidenza sopra.
- AC11: e2e nuovi/aggiornati (vedi File List); selettori scoped/exact rispettati (nessun `hasText` con date/H:MM introdotto); skill applicate (`karpathy-guidelines`, `design-taste-frontend`, `ui-ux-pro-max`); coerenza AirOps assoluta (nessuna classe/nuovo colore fuori dai token esistenti).

### File List

- `src/app/[locale]/dashboard/billing/billing-console.tsx` (AC1/2/3/4: filtro free-text, id rimosso, colonna Tipo 170px, dialog+bottone Estratti conto rimossi)
- `src/app/[locale]/dashboard/billing/page.tsx` (AC1/4: `personQuery` wiring, label `statements`/`statementsDialog`/`picker` rimosse, `personSearchPlaceholder` aggiunta)
- `src/app/[locale]/dashboard/billing/statement-dialog.tsx` (AC4: **cancellato**)
- `src/app/[locale]/dashboard/logbook/logbook-console.tsx` (AC5/6/7: rinomine label, `ExportMenu`, filtro free-text `personQuery` accanto a `personId` invariato)
- `src/app/[locale]/dashboard/logbook/page.tsx` (AC6/7: `exportMenu` labels, `personQuery` wiring, `personFilterOptions`/query `listPeople` dedicata rimossi)
- `src/app/[locale]/dashboard/expiries/page.tsx` (AC9: `personQuery` wiring, `registry.filters.picker` rimosso)
- `src/app/[locale]/dashboard/expiries/scadenze-console.tsx` (AC9: filtro free-text, `personComboOptions`/`searchPersonFilter` conservati per `MembershipFeeModal`)
- `src/components/search-combobox.tsx` (AC8: dropdown ritematizzato ad airops.css)
- `src/styles/airops.css` (AC8: nuove classi `.combo-listbox`/`.combo-option`/`.combo-option-empty`/`.combo-meta`)
- `src/lib/schemas/transactions.ts`, `src/lib/schemas/flights.ts`, `src/lib/schemas/expiries.ts` (nuovo campo opzionale `personQuery` nelle 3 query schema)
- `src/server/services/transactions.service.ts`, `src/server/services/flights.service.ts`, `src/server/services/expiries.service.ts` (filtro `personQuery` AND-combinato nei where-builder)
- `messages/it.json`, `messages/en.json` (chiavi nuove/rimosse per billing/logbook/expiries — vedi Implementation Plan)
- `e2e/billing.spec.ts` (filtro riscritto free-text + 2 nuovi test AC2/AC3, test dialog Estratti conto rimosso, describe RBAC rinominato)
- `e2e/flight-log.spec.ts` (filtro persona riscritto free-text)
- `e2e/flight-reversal.spec.ts` (assert testo "Annulla"/"Modifica" sui bottoni riga, commento aggiornato)
- `e2e/exports.spec.ts`, `e2e/pdf-exports.spec.ts` (export flights via `ExportMenu` dropdown invece dei vecchi bottoni)
- `e2e/expiry-dashboard.spec.ts` (nuovo test filtro free-text AC9)

### Interactive verification (Playwright)

`mcp__playwright__*` NON raggiungibile da questa sessione (stesso errore Chromium già documentato nelle story precedenti) → fallback a script `@playwright/test` throwaway in `/tmp` (cancellati prima del commit — mai messi in staging), contro il dev server reale.

- Billing: screenshot IT/EN della riga "Storno volo"/"Flight charge reversal" — badge leggibile per intero, nessun troncamento; nessun bottone "Estratti conto"; filtro free-text con lo stesso markup (`.search`/`.bare-input`) di Piloti.
- Logbook: dropdown `ExportMenu` funzionante ("Voli (PDF)"/"Voli (Excel)"); form "Nuova voce" → suggerimenti pilota/aeromobile verificati via `getComputedStyle` = `"Inter Tight", ui-sans-serif, system-ui, sans-serif` (ora ESPLICITO invece che ereditato — vedi nota di trasparenza AC8 sopra: in questo ambiente il valore ereditato era già corretto anche prima).
- Expiries: filtro free-text presente e funzionante; **AC10 provato end-to-end**: creato un titolare con email reale + scadenza a 7gg, click sul bottone reale "Invia promemoria" (sessione admin) → UI "Promemoria inviati: 1 ai titolari, 2 allo staff." → Mailpit (`http://localhost:8025/api/v1/messages`) riceve l'email al titolare con subject "Promemoria scadenza: …" e corpo corretto.
- Nota per il reviewer (non un difetto introdotto da questa story): a viewport 1440px la card-head del logbook (molti filtri) va a capo su 2 righe e il popover `ExportMenu` (`right:0` relativo al proprio wrapper, invariato — stesso componente di fleet/pilots/billing) può sovrapporsi alla sidebar quando il bottone finisce all'inizio della riga andata a capo; a 1920px (e già oggi su fleet/pilots/billing, meno affollati) il popover è pulito. Verificato che il numero di controlli nella card-head è NETTO INFERIORE a prima (select persona 150px → input 190px, ma DUE bottoni export ~220px totali → UNO ExportMenu ~110px): la mia modifica riduce l'affollamento, non lo introduce. Responsive/mobile è esplicitamente la story 13.10 dell'epic — non toccato qui.
- e2e (foreground, dev server reale): gli spec toccati/aggiunti (`billing`, `logbook` via `flight-log`+`flight-reversal`, `exports`, `pdf-exports`, `expiry-dashboard`) passano tutti a `--workers=1`; `expiry-alerts.spec.ts`/`person-detail.spec.ts` (mai toccati, ma coprono rispettivamente AC10 by-proxy e il deep-link `personId` invariato) restano verdi. Osservata la STESSA classe di flakiness "cold-compile sotto `next dev`" già documentata in `playwright.config.ts` e nelle story precedenti su run a piena concorrenza/subito dopo un `rm -rf .next` (login-timeout sul primissimo test) — confermata non regressione: 0 righe `LoginAttempt` fallite nel DB nella finestra, e ogni test flaky passa da solo/a server caldo (verificato ripetutamente).
- `npm run gates`: PASS (lint/typecheck/test 1443 verdi/build) — rieseguito pulito dopo `rm -rf .next` come ultimo controllo.

### Change Log

- 2026-07-25: Story 13.5 implementata (filtri pilota free-text billing/logbook/expiries stile Piloti, id riga rimosso, colonna Tipo allargata, dialog Estratti conto rimosso da billing con endpoint condiviso intoccato, rinomine azioni logbook, export dropdown unico logbook, font dropdown search-combobox ritematizzato ad airops.css, promemoria expiries verificato end-to-end contro Mailpit). `npm run gates`: PASS. e2e: spec toccati/aggiunti verdi a `--workers=1` (flakiness da cold-compile `next dev` non imputabile a questa story, vedi Interactive verification).

## Review Record

_(compilato dopo la review adversarial)_
