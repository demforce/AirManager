---
baseline_commit: 03213e9
---

# Story 14.1: Controlli form — typeahead che copre l'input, doppia icona date, tasto "Oggi"

Status: ready-for-dev (branch `dev`, epic 14)

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

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
