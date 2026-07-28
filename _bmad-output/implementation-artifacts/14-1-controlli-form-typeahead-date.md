---
baseline_commit: 03213e9
---

# Story 14.1: Controlli form — typeahead che copre l'input, doppia icona date, tasto "Oggi"

Status: review (branch `dev`, epic 14) — implementazione in `4ac9d3b`

## Story

As a utente che compila i form dell'app,
I want che il typeahead suggerisca SOTTO il campo senza coprirlo, che gli input data abbiano UNA sola icona (il picker custom) e che la navigazione data sia essenziale (frecce+data+calendario, senza "Oggi"),
so that vedo sempre cosa sto scrivendo e i controlli sono coerenti e puliti.

**Riferimenti vincolanti**: piano epic 14 `docs/superpowers/plans/2026-07-28-epic-14-demo-feedback.md` (item 1, 6, 7). Story UI: skill `design-taste-frontend` + `ui-ux-pro-max`, coerenza AirOps.

## Acceptance Criteria

1. **(SearchCombobox non copre l'input)** Il dropdown dei suggerimenti di `src/components/search-combobox.tsx` (usato nel form volo `logbook/flight-editor.tsx:30` per velivolo/pilota/istruttore — segnalazione utente: "appena clicko appare la lista SOPRA il campo e non vedo cosa scrivo") si apre di DEFAULT sotto il campo; si ribalta sopra SOLO quando sotto non c'è spazio E sopra ce n'è (pattern flip di `CalendarPopover`, TD-7 review F1) — e quando si ribalta NON deve sovrapporsi al campo (bordo inferiore del popover = bordo superiore del campo). Enumerare TUTTI i siti d'uso di `SearchCombobox` (lezione "il gemello va misurato") e verificarli.
2. **(Una sola icona sugli input data/ora)** Ogni input data/ora/datetime mostra SOLO il trigger del picker custom: l'indicator nativo del browser va nascosto OVUNQUE. Oggi `airops.css:1566` lo nasconde solo per `.date-input input` — enumerare TUTTE le istanze: `DateInput` (`date-input.tsx:119`, `<input type="date">`), `DateTimeInput` (`datetime-input.tsx`), e i 4 `type="time"` nativi residui (TD-7 F7: `settings/scheduling-card.tsx:81,:84`, `logbook/flight-editor.tsx:522,:529`) — per i time: nascondere l'indicator nativo (il picker custom orario esiste già in `CalendarPopover` esteso? se NO, per i 4 time basta l'indicator nascosto con inserimento da tastiera, scelta da motivare nel record). Verifica su Chromium reale (screenshot) che l'icona sia UNA per campo.
3. **(Via il tasto "Oggi")** Il bottone "Oggi" sparisce dai picker data di dashboard (`dashboard/page.tsx`, label `today`) e pianificazione (`bookings/schedule.tsx:54` `todayHref`, `:64` label `today`): restano frecce prev/next, data corrente e apertura calendario. Rimuovere anche le label i18n orfane (it/en) se non più usate.
4. **(Test)** Full suite CI=1 verde. Se esistono e2e che usano il tasto "Oggi" o asseriscono il posizionamento del combobox: aggiornarli ai valori corretti (mai indeboliti). Per il flip del combobox: guardia di GEOMETRIA discriminante (rect popover vs rect input, lezione 13.7 — click Playwright non basta).

## Contesto (puntatori — ricognizione 2026-07-28)

- `SearchCombobox`: `src/components/search-combobox.tsx` (componente condiviso); consumer noto: `logbook/flight-editor.tsx` (3 picker: aircraft `:123`, people `:132`, defaults `:217`); altri consumer da enumerare (grep import).
- Flip verticale di riferimento: `CalendarPopover`/`useFixedPopover` (TD-7, review F1 — `bf39082`).
- Input nativi: `src/components/ui/date-input.tsx:119`; `src/components/ui/datetime-input.tsx`; time nativi in `scheduling-card.tsx:81/:84` e `flight-editor.tsx:522/:529`. CSS attuale: `src/styles/airops.css:1566`.
- "Oggi": `bookings/schedule.tsx` (`todayHref`/`today`), `dashboard/page.tsx` (stesso pattern — verificare), label i18n `today` (`messages/it.json:1510,2347`).
- **Ambiente**: regole macchina/ciclo come `docs/handoffs/HANDOFF.md` (DB fresco al dispatch, gates prima dei commit, `export JOBS_SECRET` per CI=1, e2e foreground su file, MAI push/playwright install; MCP Playwright non raggiungibile dai subagent → script playwright-core throwaway, Chromium `~/.cache/ms-playwright/chromium-1228`). Commit su `dev`: `feat(14.1): controlli form — typeahead sotto il campo, icona unica sui picker data, via il tasto Oggi` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Validazione per-campo dei form (story 14.2).
- Qualsiasi cambiamento di dominio (voli scuola, guard-rail: story 14.3/14.4).

## Dev Agent Record

**Commit implementazione**: `4ac9d3b` (branch `dev`).

### AC1 — SearchCombobox non copre l'input

Enumerati TUTTI i siti d'uso reali (`grep import SearchCombobox`): 3 file lo importano e lo renderizzano davvero (`billing-console.tsx` NON è tra questi — cita il nome solo in un commento, review F7) —
- `logbook/flight-editor.tsx` — 3 picker (aircraft, person, instructor), dentro un `SlideOver`.
- `expiries/scadenze-console.tsx` — 1 picker (pilota), dentro il `mini-modal` "Addebita quota associativa".
- `billing/transaction-editor.tsx` — 1 picker (pilota), dentro un `SlideOver`.
- `billing/billing-console.tsx` importa il tipo `SearchComboboxOption` in un commento storico ma NON renderizza il componente (il filtro pilota lì è testo libero, story 13.5) — nessun consumer reale.

Causa del bug (misurata, non solo dichiarata): `.combo-listbox` era `position: absolute` dentro `.fld{display:flex;flex-direction:column}` senza `top`/`bottom` — per lo spec Flexbox, la "static position" di un figlio absolutely-positioned in un flex container column usa `justify-content` (default `flex-start`) come se fosse l'UNICO figlio, quindi finiva ancorato in cima al box (sopra l'input), non "dopo" l'input. Verificato con uno script Playwright throwaway: `listboxRect.top` (105.8px) < `inputRect.top` (123.0px), overlap confermato.

Fix: stesso meccanismo di `CalendarPopover`/`useFixedPopover` (TD-7) — `position: fixed`, portato su `document.body`, misurato da un `wrapperRef` sul div `.fld`. La logica di geometria (spazio sotto/sopra, soglia di flip, clamp del `maxHeight`) è stata ESTRATTA da `useFixedPopover#toggle` nella funzione pura `computeFixedPopoverAnchor` (`fixed-popover.ts`) e riusata da entrambi — stesso principio di dedup già applicato da TD-7 review F6 per `CAL_POPOVER_WIDTH`/`clampPopoverLeft`, invece di duplicare la math in una seconda copia. `useFixedPopover` stesso è invariato byte-per-byte nel comportamento (stessa formula, solo factored out).

Verificato su Chromium reale (script Playwright throwaway, non committato) per tutti e 3 i consumer: default sotto il campo, nessun overlap; flip sopra forzato con un viewport basso (380px) sul picker "Istruttore" di flight-editor — bordo inferiore del popover ≤ bordo superiore del campo (nessuna sovrapposizione), z-index (`POPOVER_PORTAL_Z_INDEX`, riusato da fixed-popover.ts) sopra sia lo `SlideOver` che il `mini-modal`.

### AC2 — Una sola icona sugli input data/ora

Enumerate TUTTE le istanze:
- `DateInput` (`date-input.tsx`, `type="date"`) — già copriva `.date-input input` (icona nativa nascosta, trigger custom presente): 1 icona. Nessuna modifica necessaria al componente.
- `DateTimeInput` (`datetime-input.tsx`, `type="datetime-local"`) — stesso wrapper `.date-input`, quindi GIÀ coperto dalla regola esistente (la premessa della story che fosse scoperto era da verificare: non lo era, condivide la classe con `DateInput`): 1 icona. Nessuna modifica necessaria al componente.
- 4 `type="time"` nativi residui SENZA picker custom: `settings/scheduling-card.tsx:81,84` (aeromobili disponibili dalle/fino alle) e `logbook/flight-editor.tsx:522,529` (ora decollo/atterraggio). Questi usano la classe generica `.input` (condivisa con text/number/…), non `.date-input` — la regola CSS scoped non li copriva.

Fix: la regola CSS è stata resa GLOBALE per tipo (`input[type="date"|"time"|"datetime-local"]::-webkit-calendar-picker-indicator{display:none}`) invece che scoped a `.date-input input` — copre `DateInput`/`DateTimeInput` come prima (ridondante ma innocuo) E i 4 time nativi, che ora mostrano ZERO icone (nessun trigger fittizio) con inserimento SOLO da tastiera. Scelta esplicitamente autorizzata dalla story ("per i time senza picker custom: indicator nascosto + inserimento tastiera va bene") — costruire un time-picker custom per 4 campi era fuori scopo (nessun requisito, nessun'altra story lo chiede) e avrebbe introdotto un componente nuovo per un guadagno marginale (i 4 campi sono orari di apertura/decollo, tipicamente digitati, non selezionati da calendario).

Verificato con screenshot reali (Chromium): "Data volo" (DateInput) 1 icona; "Inizio"/"Fine" prenotazione (DateTimeInput) 1 icona ciascuno; "Ora decollo"/"Ora atterraggio" e "Aeromobili disponibili dalle/fino alle" 0 icone (solo testo `--:--` / valore digitato).

### AC3 — Via il tasto "Oggi"

Rimosso il link "Oggi" (classe `today-btn`, testid `calendar-today`) dalla toolbar di `bookings/schedule.tsx` — componente CONDIVISO da `/dashboard/bookings` (pagina standalone) e dall'Overview embedded in `/dashboard` (stesso componente `<Schedule>`), quindi un solo punto di modifica copre entrambi i punti citati nella story. Restano frecce prev/next, data corrente (`card-sub`) e il bottone di apertura calendario (`date-pick-btn`).

Rimossi anche, perché diventati orfani DALLA mia modifica: il campo `todayHref` dal tipo `CalendarNav` e i suoi 2 produttori (`dashboard/page.tsx`, `bookings/page.tsx`), la classe CSS `.today-btn` (unico consumer).

**Nessuna label i18n è stata rimossa**: `BookingsPage.calendar.toolbar.today` (`it.json:1510`/`en.json:1510`) resta referenziata da `labels.today` per il `todayLabel` del footer INTERNO di `CalendarPopover` (il bottone "Oggi" dentro il popover aperto, che salta al mese odierno — un affordance DIVERSA da quella rimossa, fuori scopo della story: la story chiede di rimuovere solo il link della toolbar accanto a frecce/data, non il "Oggi" del footer del calendario aperto, coperto e testato separatamente da `bookings.spec.ts` "story 13.7 review F1"). La condizione "se non più usata" dell'AC3 non si è quindi verificata.

### AC4 — Test

- `e2e/typeahead-pickers.spec.ts`: 2 nuovi test con guardia di GEOMETRIA discriminante (rect popover vs rect input via `page.evaluate`, non un semplice click) — "opens BELOW the field by default" e "flips ABOVE... without ever overlapping it" (viewport 1280×380 per forzare il flip sul picker istruttore).
- `e2e/bookings.spec.ts`: rimosso `'calendar-today'` dall'array di testid della verifica crosstalk-href (linea ~1237) — quel testid non esiste più.
- Gates (`npm run gates`): PASS lint (28s), PASS typecheck (7s), PASS test (13s, 1541/1541), PASS build (55s).
- Full suite CI=1 (DB fresco, prod build, `JOBS_SECRET` esportata): 271 passed, 1 flaky (retry verde) — il flaky è `settings.spec.ts` "Scheduling card round-trip", stesso pattern di timeout login-sotto-contesa già documentato in HANDOFF/CLAUDE.md, non riconducibile a questa story (fallisce al login, prima di toccare qualunque area modificata). Exit code 0.

### Note per la review

- La causa del bug AC1 (static position di un abspos in un flex container) è stata isolata empiricamente (script Playwright throwaway, non committato) misurando i rect prima/dopo, non solo dedotta — coerente con la lezione "il gemello va misurato, non dichiarato".
- `computeFixedPopoverAnchor` è un puro refactor/estrazione: `useFixedPopover` produce lo STESSO output per gli stessi input di prima (nessun consumer esistente — `CalendarPopover`/`date-input`/`datetime-input`/`schedule.tsx`) cambia comportamento.
- Rischio residuo minimo: i 4 time nativi restano privi di QUALSIASI icona (non solo "una"): è la lettura più semplice e meno invasiva della frase "il trigger del picker custom" dell'AC2 quando un picker custom non esiste — esplicitamente sanzionata dalla story stessa, non una mia estensione.

## Review Record

_(compilato dopo la review adversarial)_
