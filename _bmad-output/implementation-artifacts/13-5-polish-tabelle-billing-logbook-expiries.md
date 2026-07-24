---
baseline_commit: f62151d
---

# Story 13.5: Polish tabelle — billing + logbook + expiries (filtri free-text, export dropdown, rinomine, colonne)

Status: ready-for-dev

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

_(compilato dal dev subagent)_

## Review Record

_(compilato dopo la review adversarial)_
