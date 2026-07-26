---
baseline_commit: 6afc0de
---

# Story TD-7: Picker custom su TUTTI i form — `CalendarPopover` esteso con l'ora

Status: ready-for-dev

## Story

As a utente che compila un form dell'app,
I want che ogni campo data (e data+ora) usi il picker custom AirOps invece del calendario nativo del browser,
so that l'esperienza sia coerente ovunque e indipendente dal browser.

**Riferimenti vincolanti**: richiesta utente 2026-07-26 ("revisiona tutti i form: ogni input di data deve avere il picker custom già definito") + ratifiche sotto. Precedente: decisione utente 2026-07-21 che ha introdotto `DateInput`+`CalendarPopover` al posto del picker nativo per le date pure.

**Ratifiche PO (AskUserQuestion 2026-07-26)**:
1. **Strada scelta**: ESTENDERE `CalendarPopover` con la selezione oraria (NON un campo ora separato affiancato al picker).
2. **Controllo ora**: **campo digitabile** (tipo `09:30`), con **TUTTI i minuti disponibili** — cade il vincolo ai 5 minuti degli attuali `step={300}` (verificato: nessuna regola server di allineamento; `minSlotMinutes` è un vincolo di DURATA, non di allineamento).
3. **Nessun default**: l'ora è **obbligatoria**. Scegliere un giorno non inventa un orario.

## Acceptance Criteria

1. **(`CalendarPopover` esteso — additivo)** Il componente guadagna una modalità data+ora OPZIONALE: quando il consumer la attiva, il popover mostra sotto la griglia un campo ora digitabile (`HH:MM`, tutti i minuti) e un'azione di conferma. Quando NON è attiva, il comportamento resta **identico a oggi** (i consumer esistenti — `date-input.tsx` e i due popover di `schedule.tsx` — non cambiano di una riga né di un pixel). Il `style`/`ref` override introdotto dalla 13.7-F1 resta funzionante.
2. **(Semantica di conferma — ratifica 3)** In modalità data+ora il popover tiene una BOZZA locale (giorno + ora) e scrive il valore nell'input **solo quando entrambi sono valorizzati**, tramite l'azione di conferma; l'azione è disabilitata finché l'ora è vuota/invalida. Cliccare un giorno con ora vuota NON scrive un valore parziale né inventa `00:00`. Riaprendo il popover su un campo già valorizzato, bozza = valore corrente.
3. **(Wrapper `DateTimeInput`)** Nuovo wrapper gemello di `DateInput` su `<input type="datetime-local">`, con lo STESSO contratto: wrapper TRASPARENTE (ogni prop cade sull'input reale, incluso lo spread di `register()` di react-hook-form), scrittura via native value setter + eventi `input`/`change` (così RHF e stato controllato la vedono come digitazione), picker UA nascosto, bottone calendario come unica affordance, `inline` per le toolbar. Formato del valore: `YYYY-MM-DDTHH:MM` (quello che i form già usano oggi).
4. **(Sweep dei consumer — 10 punti, l'inventario è questo)** `datetime-local` → `DateTimeInput`: `bookings/new-booking-form.tsx` (2: startsAt/endsAt), `bookings/edit-booking-form.tsx` (2), `ppr/ppr-form.tsx` (2: eta/etd — form PUBBLICO), `components/ppr/manual-ppr-form.tsx` (2). Date pure `type="date"` → `DateInput`: `billing/transaction-editor.tsx` (2, di cui uno `disabled`). Rimuovere gli `step={300}` (ratifica 2). Nessun altro input data resta nativo: **ri-verificare con un grep finale** (`type="date"`/`type="datetime-local"` fuori dai componenti ui) e riportarlo nel Dev Agent Record.
5. **(Trappole note — verificare esplicitamente, sono già costate 2 review)** (a) **Clipping**: il popover di `DateInput` è `position:absolute` e le `.card`/`.slideover-panel` hanno `overflow:hidden` — è ESATTAMENTE la classe di bug delle review 13.7-F1 e 13.11: nei nuovi punti d'uso (SlideOver nuova prenotazione, editor PPR, card Contabilità, form pubblico `/ppr`) il popover NON deve essere ritagliato e i suoi controlli devono essere **hit-testabili** (`elementFromPoint`), non solo presenti nel DOM. Se serve, riusare il meccanismo `position:fixed` + clamp già in `schedule.tsx` (`useFixedPopover`/`clampPopoverLeft`) invece di reinventarlo. (b) **Mobile 375px**: la 13.10-F3 aveva trovato il campo ETD di `/ppr` tagliato di 60px; dopo questa story quel campo cambia — verificare a 375 che campo e popover stiano nel viewport.
6. **(Design system)** Stile del blocco ora dentro `airops.css` con i token esistenti (nessun colore/spaziatura fuori sistema); coerenza con `.cal-popover`/`.cal-foot` attuali. Skill obbligatorie: `karpathy-guidelines` + `design-taste-frontend` + `ui-ux-pro-max`.
7. **(i18n)** Nuove chiavi in `ui.datePicker` (o namespace adiacente) SPECULARI IT/EN: etichetta ora, azione di conferma, eventuale messaggio di ora invalida. Nessun testo hardcoded nei componenti.
8. **(Test)** Unit sulle funzioni pure nuove (parse/format `HH:MM`, composizione `YYYY-MM-DDTHH:MM`, validazione). e2e: creazione prenotazione REALE dal picker (non `fill()` sull'input: click sul bottone calendario → giorno → ora → conferma → submit → 201) su almeno 1 form autenticato + il form PUBBLICO `/ppr`; assert che il valore scritto nell'input sia quello atteso; regression: i form esistenti che usano `fill()` diretto sull'input devono continuare a passare (il wrapper è trasparente). Selettori scoped/exact, mai `hasText` con date/H:MM. La FULL SUITE CI=1 su build prod è l'arbitro.

## Contesto (puntatori — ricognizione 2026-07-26)

- `src/components/ui/calendar-popover.tsx` (widget puro, props `cursor/selected/onPick/onToday` + `style`/`ref` della 13.7), `src/components/ui/date-input.tsx` (wrapper trasparente, `setInputDate` scrive via prototype setter — è il pattern da replicare), `src/components/ui/calendar-grid.ts` (griglia, unit-testata).
- CSS: `.cal-popover`, `.cal-head`, `.cal-grid`, `.cal-cell`, `.cal-foot`, `.date-input`, `.date-input-btn` in `src/styles/airops.css`.
- Consumer datetime elencati in AC4; `schedule.tsx` usa `CalendarPopover` in modalità solo-data e NON va toccato (se non per la verifica di non-regressione).
- **Ambiente**: ciclo e regole macchina come da `docs/handoffs/HANDOFF.md` (DB fresco al dispatch, gates prima del commit, `export JOBS_SECRET=<non-placeholder>` per la suite CI=1, e2e foreground su FILE, MAI push, MAI `playwright install`, NON toccare `package.json`, `git add` file-by-file, churn untracked intoccabile). Nota dev-server: se una modifica a `messages/*.json` non compare, il log del server dice il vero motivo — leggerlo PRIMA di incolpare la cache (lezione 2026-07-26: era un `FORMATTING_ERROR` ICU, non la cache; per i placeholder `{count}`-like riempiti lato client si usa `t.raw`). Commit: `feat(td-7): picker custom su tutti i form — CalendarPopover con ora + DateTimeInput` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Cambiare la semantica dei form (validazioni, campi, flussi): questa story cambia SOLO come si inserisce una data/ora.
- Il picker della `schedule.tsx` (già custom) e i filtri data già convertiti nelle story 13.5/13.6.
- Timezone: i form continuano a lavorare in ora locale del browser, esattamente come oggi (`toDatetimeLocalValue` e affini restano la convenzione).

## Dev Agent Record

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
