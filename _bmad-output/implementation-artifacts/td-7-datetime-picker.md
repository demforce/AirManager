---
baseline_commit: 6afc0de
---

# Story TD-7: Picker custom su TUTTI i form — `CalendarPopover` esteso con l'ora

Status: review

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

### Implementazione

- **`CalendarPopover` esteso (additivo)** — `src/components/ui/calendar-popover.tsx`: nuovo prop opzionale `time?: CalendarPopoverTimeProps` (`value`/`onChange`/`onConfirm`/`confirmDisabled`/`invalid`/`label`/`confirmLabel`/`invalidLabel`). Quando presente, sotto `.cal-grid` compare un campo `HH:MM` (`<input type="text">`, NON `type="time"`: niente step nativo, ogni minuto digitabile — ratifica 2) via le classi `.fld`/`.fld-label`/`.fld-ctrl`/`.input` già usate da OGNI altro campo dell'app (zero classi nuove per il campo ora), e in `.cal-foot` un bottone `.btn.primary` di conferma accanto a "Oggi". Invio con Enter nel campo ora è intercettato (`preventDefault`) per non sottomettere il form ospitante. Quando `time` è omesso (i 3 consumer esistenti: `date-input.tsx`, i 2 popover di `schedule.tsx`), il render è IDENTICO a prima — verificato leggendo il diff: zero righe toccate nel ramo senza `time`. Aggiunto anche `export const CAL_POPOVER_WIDTH = 280` (letto sia da `date-input.tsx`/`datetime-input.tsx` che, come letterale duplicato invariato, da `schedule.tsx` — file non toccato).
- **`DateTimeInput` (nuovo)** — `src/components/ui/datetime-input.tsx`, gemello di `DateInput`: stessa firma trasparente (`register()` spread, `native value setter` + eventi `input`/`change`), bozza locale `{cursor, selectedDay, time}` — un click su un giorno o "Oggi" aggiorna SOLO `selectedDay` (mai una scrittura, mai una chiusura); la conferma è l'UNICO percorso che compone `YYYY-MM-DDTHH:MM` e scrive nell'input, ed è disabilitata finché `selectedDay` è `null` O il testo ora non passa `isValidTimeText` (ratifiche 2/3).
- **`datetime-value.ts` (nuovo, puro, testato)** — `isValidTimeText` (regex `HH:MM` stretta, 2 cifre obbligatorie), `parseDatetimeLocal`, `composeDatetimeLocal`. 12 unit test in `datetime-value.test.ts`.
- **Sweep dei 10 consumer (AC4)** — tutti convertiti, `step={300}` rimosso ovunque:
  - `bookings/new-booking-form.tsx`: `startsAt`/`endsAt` → `DateTimeInput`.
  - `bookings/edit-booking-form.tsx`: `startsAt`/`endsAt` → `DateTimeInput`.
  - `ppr/ppr-form.tsx` (form pubblico): `eta`/`etd` → `DateTimeInput` (dentro il markup raw `<label className="fld">`, non il componente `Field`).
  - `components/ppr/manual-ppr-form.tsx`: `eta`/`etd` → `DateTimeInput`.
  - `billing/transaction-editor.tsx`: 2× `type="date"` → `DateInput` (uno dei due `disabled`, invariato).
- **Grep finale (verbatim, post-sweep)**: `grep -rn 'type="date"\|type="datetime-local"\|step={300}' src --include="*.tsx" --include="*.ts" | grep -v "/components/ui/" | grep -v "\.test\."` → 5 righe, TUTTE commenti doc (`/** ... */`) che nominano il tipo nativo per spiegare una convenzione (`edit-booking-form.tsx:70`, `new-booking-form.tsx:123`, `instructor-rates-panel.tsx:80`, `instructors-console.tsx:251`, `lib/schemas/people.ts:130`) — **zero input nativi residui** fuori da `src/components/ui/`.

### Trappola clipping (AC5a) — scoperta NON prevista dal solo AC, poi risolta

Verificando i 5 contesti con un browser reale (Playwright/`playwright-core` headless, script throwaway mai committato) ho misurato — PRIMA di qualunque fix — che il popover `position:absolute` di `DateInput`/`DateTimeInput` era realmente ritagliato in **3 dei 5 contesti**: `manual-ppr-form` (SlideOver, `.so-body{overflow:auto}`, bottom del popover 85px oltre il bordo), il filtro **pre-esistente** di `billing-console.tsx` (`.card{overflow:hidden}`, popover ritagliato di ~260px) e il form pubblico `/ppr` (`.card{overflow:hidden}`, ~167px oltre). `new-booking-form`/`transaction-editor` erano borderline-ok solo perché il campo capitava in alto nel form.

Ho quindi generalizzato il meccanismo `position:fixed` + clamp già in `schedule.tsx` (`useFixedPopover`/`clampPopoverLeft`), estratto in un nuovo modulo condiviso `src/components/ui/fixed-popover.ts` — **`schedule.tsx` NON è stato toccato** (vincolo esplicito): la sua copia locale resta bit-identica, verificata via i suoi stessi e2e di regressione (13.7-F1/13.10, tutti verdi). Applicando SOLO questo alle nuove card/SlideOver è emerso un secondo problema NON coperto da `schedule.tsx` (che non vive in nessuno SlideOver): `.slideover-panel{transform:translateX(...)}` (sempre attivo mentre aperto, per la transizione) **rende quell'elemento il containing block per i discendenti `position:fixed`** — un popover fixed lasciato in-place dentro un SlideOver NON raggiunge affatto le coordinate di viewport reali e resta soggetto al clip di `.so-body`. Fix: popover + scrim renderizzati via `createPortal` a `document.body` (in ENTRAMBI `date-input.tsx` e `datetime-input.tsx`, uniformemente — non solo nei contesti SlideOver, per un unico meccanismo non condizionale). Diventando fratelli di `.slideover{z-index:50}`/`.mini-modal{z-index:60}` invece che discendenti, servono z-index propri: `POPOVER_PORTAL_SCRIM_Z_INDEX=65`/`POPOVER_PORTAL_Z_INDEX=66` (sotto il toast, 200).

**Decisione esplicita** (assunzione dichiarata): l'AC1 "date-input.tsx non cambia di un pixel" è stata interpretata come vincolo sul rendering di `CalendarPopover` in modalità sola-data quando NON clippato (verificato: coordinate calcolate dal rect del wrapper `.date-input`, stesse della vecchia centratura CSS) — non come divieto di correggere il bug di clipping che l'AC5 stessa chiede di verificare, anche nel consumer PRE-ESISTENTE `billing-console.tsx` (non incluso nei 10 punti dello sweep AC4, ma esplicitamente nominato "card Contabilità" in AC5a). Il fix è quindi applicato UNIVERSALMENTE a `DateInput`/`DateTimeInput`, non solo ai 10 nuovi punti d'uso.

### Esiti clipping/hit-test per contesto (misurati, browser reale, dopo il fix)

| Contesto | `clipAncestor` | `confirmHit` | `todayHit` | `dayCellHit` | `timeInputHit` | Note |
|---|---|---|---|---|---|---|
| SlideOver "Nuova prenotazione" — `startsAt`/`endsAt` | null | true | true | true | true | — |
| SlideOver "Modifica prenotazione" — `endsAt` | null | true | true | true | true | — |
| SlideOver "PPR manuale" — `eta`/`etd` (vicino al fondo form) | null | true | true | true | true | popover scrollabile internamente (`maxHeight`+`overflow-y:auto`) — footer raggiunto scrollando SOLO il box del popover |
| Form pubblico `/ppr` (`.card`) — `eta` (desktop) e `etd` (375px mobile) | null | true | true | true | true | 375px: field box entro 375px (nessun taglio -60px come 13.10-F3), popover entro viewport, `documentElement.scrollWidth <= clientWidth` |
| `billing-console.tsx` card filtro (pre-esistente, DATE-ONLY) | null | n/a (niente `time`) | true | true | n/a | confermato ANCHE il fix per il consumer non convertito in questa story |
| `transaction-editor.tsx` SlideOver (DATE-ONLY, nuovo consumer) | null | n/a | true | true | n/a | — |

Round-trip reale verificato (click bottone calendario → mese +2 → click giorno "15" → digitato "09:15" → conferma): valore scritto `<anno>-<mese>-15T09:15` esatto. Ratifica 3 verificata: click giorno con ora vuota → conferma disabilitata, input resta `""` (nessun `00:00` inventato, nessuna scrittura parziale).

### Test

- Unit: `src/components/ui/datetime-value.test.ts` (12 casi: validità `HH:MM` su tutto il range 24h/60min inclusi i minuti "non arrotondati" tipo `:07`, formati malformati, round-trip parse/compose).
- e2e nuovi: `e2e/datetime-picker.spec.ts` (5 test) — creazione prenotazione REALE guidando SOLO il picker (bottone calendario → mese → giorno → ora → conferma → submit → 201, mai `fill()`), stesso flusso sul form pubblico `/ppr`, ratifica 3 (conferma disabilitata / nessuna scrittura), guard di regressione clipping (posizione `fixed` + portato su `document.body`, hit-test reale) e un pass mobile 375px sul form pubblico. Selettori: `span.date-input:has(input[name="..."])` per isolare il wrapper del campo, giorno selezionato con regex ancorata (`^15$`), mai `hasText` su stringhe data/ora.
- Regressione (esistenti, `fill()` diretto sull'input): `bookings.spec.ts` (35 test), `ppr-public.spec.ts` (6), `ppr-queue.spec.ts` (6) rieseguiti — vedi nota sotto sull'ambiente dev.

### Nota sull'ambiente dev durante la verifica (non un difetto del codice)

Due run consecutivi della suite sopra CONTRO IL DEV SERVER (non la build prod) hanno mostrato fallimenti — TUTTI con la stessa identica firma: `expect(page).toHaveURL(/\/it\/dashboard$/)` timeout, pagina rimasta su `/it/login` dopo un login altrimenti corretto. Investigato PRIMA di scartarlo come flake (regola esplicita: mai attribuire fail a flake senza prova):
1. Query diretta su `LoginAttempt`: **zero** righe `succeeded:false` per `admin@airmanager.local` nella finestra — il login-throttle (`TD-6`) NON è la causa (era la mia prima ipotesi, smentita dai dati).
2. Ogni `POST /api/auth/callback/credentials` nel log del dev server ha risposto 200 — nessun errore server-side.
3. I 3 test falliti nel primo run, ri-eseguiti in isolamento (server non più sotto il carico dei miei script di verifica manuale), sono passati puliti.
4. Un secondo run completo, più tardi, ha fallito ANCORA DI PIÙ (24 vs 15) — degrado progressivo coerente con un `next dev`/Turbopack sotto ore di uso pesante (le mie stesse verifiche manuali ripetute), non con un bug deterministico introdotto da questa story.
5. `e2e/movements.spec.ts` documenta GIÀ questa classe di flake ("stesso tempo di tolleranza del flake di login documentato... sotto il carico di cold-compile/concurrent-worker") — non è nuovo, è una caratteristica nota di questo ambiente dev-mode.

Conclusione: nessuna delle mie modifiche tocca `auth`/login; la causa è degrado del server di sviluppo sotto il carico generato dalle mie stesse verifiche manuali estese, non un difetto di TD-7. **Riprodotto pulito e verificato definitivamente sulla build di produzione CI=1** (vedi report finale del dev agent per i numeri verbatim).

### Assunzioni esplicite

1. **AC1 "non cambia di un pixel"** interpretato come vincolo sul rendering ADDITIVO di `CalendarPopover` (mode sola-data invariato), non come divieto di fixare il clipping che l'AC5 stessa richiede di verificare — vedi sezione clipping sopra.
2. **z-index del portale** (65/66): scelti per superare `.slideover`(50)/`.mini-modal`(60) restando sotto il toast (200); nessun altro elemento dell'app usa valori in quella fascia (verificato via grep su `airops.css`).
3. **`schedule.tsx` non toccato**: `useFixedPopover`/`clampPopoverLeft`/`CAL_POPOVER_WIDTH` duplicati (non importati) in `fixed-popover.ts`/`calendar-popover.tsx` — stesso algoritmo, non condiviso letteralmente, per rispettare il vincolo "non va toccato" del Dev Notes.
4. **Formato ora**: `HH:MM` 2 cifre obbligatorie (niente `9:30` senza zero iniziale) — coerente con l'esempio "09:30" della story; nessuna auto-formattazione/auto-inserimento dei due punti (fuori scope, non richiesto).
5. **`monthsForward=2` negli e2e**: giorno sempre nel futuro indipendentemente dalla data corrente, senza dover gestire edge-case di fine mese.

### File List

- `src/components/ui/calendar-popover.tsx` (esteso, additivo)
- `src/components/ui/date-input.tsx` (riscritto: fixed-popover + portal, contratto trasparente invariato)
- `src/components/ui/datetime-input.tsx` (nuovo)
- `src/components/ui/datetime-value.ts` (nuovo)
- `src/components/ui/datetime-value.test.ts` (nuovo)
- `src/components/ui/fixed-popover.ts` (nuovo)
- `src/styles/airops.css` (`.cal-foot{gap:8px}` additivo; commento aggiornato)
- `src/app/[locale]/dashboard/bookings/new-booking-form.tsx`
- `src/app/[locale]/dashboard/bookings/edit-booking-form.tsx`
- `src/app/[locale]/ppr/ppr-form.tsx`
- `src/components/ppr/manual-ppr-form.tsx`
- `src/app/[locale]/dashboard/billing/transaction-editor.tsx`
- `messages/it.json` / `messages/en.json` (`ui.datePicker.time`/`confirm`/`invalidTime`)
- `e2e/datetime-picker.spec.ts` (nuovo)

### Change Log

- feat(td-7): `CalendarPopover` esteso con modalità data+ora (additiva); nuovo `DateTimeInput`; sweep dei 10 consumer nativi → componenti custom; fix clipping (portal + fixed-popover) esteso a `DateInput`/`DateTimeInput` incluso il consumer pre-esistente di `billing-console.tsx`.

## Review Record

_(compilato dopo la review adversarial)_
