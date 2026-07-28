---
baseline_commit: 44c8fda
---

# Story 14.2: Validazione form per-campo — bordo rosso e messaggio sul campo, non in fondo

Status: ready-for-dev (branch `dev`, epic 14)

## Story

As a utente che compila un form,
I want vedere A COLPO D'OCCHIO quale campo manca o è invalido (bordo rosso + messaggio accanto al campo),
so that non devo indovinare da una stringa generica in fondo al form quale campo sistemare.

**Riferimenti vincolanti**: piano epic 14 (item 5). Story UI: `design-taste-frontend` + `ui-ux-pro-max`, AirOps.

## Acceptance Criteria

1. **(Primitiva Field con stato errore)** `src/components/ui/field.tsx` supporta `error?: string`: il controllo prende bordo/anello rosso (token `--bad`, classe dedicata in `airops.css` + `aria-invalid="true"`) e il messaggio appare INLINE sotto il campo. Contrasto MISURATO in chiaro E scuro (lezione 13.9, ≥ 4.5:1 sul testo, ≥ 3:1 sul bordo).
2. **(Required al submit)** Al submit con campi obbligatori vuoti: OGNI campo mancante viene marcato col suo errore ("Campo obbligatorio."), il focus va al PRIMO campo invalido, e la stringa globale in fondo sparisce o resta solo come riepilogo. L'errore del singolo campo si pulisce quando l'utente lo corregge.
3. **(422 server mappati sui campi)** Le risposte 422 dell'API portano `details.fieldErrors` (Zod): dove la chiave corrisponde a un campo del form, l'errore va SUL campo; ciò che non è mappabile resta nel messaggio globale. Nessun cambiamento alle regole di validazione (solo presentazione).
4. **(Sweep completo)** Il pattern si applica a TUTTI i form dell'app — enumerazione OBBLIGATORIA nel Dev Agent Record (lezione "il gemello va misurato"): SlideOver editor (pilot-editor, flight-editor, transaction-editor, editor velivolo, prenotazioni, completamento PPR, expiries...), card Impostazioni (club, scheduling, smtp, treasury, ratings/medical), form pubblico PPR, login/set-password. Le chiavi i18n "requiredField"/"required" generiche restano (riusate per-campo), quelle diventate orfane rimosse.
5. **(Test)** e2e: per un form rappresentativo per gruppo (uno SlideOver, una card Impostazioni, il form pubblico PPR) assert su `aria-invalid` + messaggio inline sul campo giusto (mai solo la stringa globale). Full suite CI=1 verde; e2e esistenti che asserivano la stringa globale aggiornati ai valori corretti (mai indeboliti).

## Contesto (puntatori — ricognizione 2026-07-28)

- Primitiva: `src/components/ui/field.tsx` (Field/Input/Select/InputGroup — oggi NESSUNO stato errore); CSS: `src/styles/airops.css` (`.fld`, `.input`).
- Pattern attuale: stringa generica ("Campo obbligatorio.", `messages/it.json:233,269,333,416,469...`) mostrata come feedback globale in fondo al form.
- Formato 422 API: envelope `error.details.formErrors/fieldErrors` (Zod flatten — v. `b31a07d` per un esempio reale di `fieldErrors.contactEmail`).
- **Ambiente**: ciclo e regole macchina come `docs/handoffs/HANDOFF.md`. Commit su `dev`: `feat(14.2): validazione form per-campo — bordo rosso e messaggio sul campo` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Nuove regole di validazione o cambi di schema (solo presentazione degli errori esistenti).
- Il toast d'errore generico della club card multi-endpoint (5 PUT, un messaggio — nota della sessione 2026-07-28: eventualmente diventa parlante qui SE il costo è marginale, altrimenti resta com'è).

## Dev Agent Record

### AC1 — Primitiva `Field` con stato errore

- `src/components/ui/field.tsx`: `Field` accetta `error?: string`. Struttura: `<div className="fld">` (grid item) → `<label className="fld-label-group">` (SOLO testo etichetta + controllo, associazione implicita) → `<span className="fld-error" role="alert">` come FRATELLO, fuori dalla label.
  - **Perché non dentro la `<label>`**: un `<label>` che avvolge testo+controllo calcola l'accessible name dal proprio intero contenuto testuale. Un primo tentativo metteva il messaggio DENTRO la label ("Nome" → "Nome Campo obbligatorio.") — rotto da `e2e/ppr-public.spec.ts` (il nuovo test AC1/2, v. sotto): `getByLabel('Nome', {exact:true})` non trovava più nulla. Fix: la label avvolge SOLO label+controllo (`.fld-label-group`, stessa `display:flex;flex-direction:column;gap:6px` di `.fld`), l'errore vive fuori, dentro il div esterno.
  - `src/components/search-combobox.tsx`: stesso contratto (`error?: string`) — SICURO fin da subito perché già usa `<label htmlFor={id}>` esplicita (non wrapping): l'accessible name viene SOLO dal testo della label, i fratelli non contano.
- `src/styles/airops.css`: bordo rosso via **attribute selector** `.input[aria-invalid="true"]` (+ `.input-group:has(> .input[aria-invalid="true"])`) — funziona su OGNI campo che già setta `aria-invalid` (quasi tutti, react-hook-form `errors.field` o booleano locale), zero markup aggiuntivo. Messaggio via `.fld-error` (12px, colore letterale scuro in chiaro — stesso "letterale più scuro in chiaro, token grezzo in scuro" di `.stat-tone-bad`/`.badge.bad`).
  - **Contrasto misurato** (canvas/oklch→sRGB→WCAG, Python, lezione 13.9): bordo `--bad` vs `--panel`/`--panel-2`/`--bg` → 3.75-3.97:1 chiaro, 6.24-7.15:1 scuro (floor non-text 3:1, sempre sopra). Testo `.fld-error` (`oklch(0.4 0.17 25)` chiaro / `var(--bad)` scuro) → 9.82:1 chiaro (valore già misurato e documentato per `.stat-tone-bad`), 6.24-7.15:1 scuro (floor 4.5:1, sempre sopra). Il `--bad` GREZZO come testo era 3.75-3.97:1 in chiaro (sotto floor) — per questo NON riusato per `.fld-error`.

### AC2 — Required al submit

- Form react-hook-form: il focus sul primo campo invalido è **gratuito** (`shouldFocusError`, default RHF) — verificato via e2e (v. sotto) e interattivamente.
- Form a stato piano (SearchCombobox, checkbox/chip condizionali): pattern `submitAttempted` — UN flag booleano invece di un booleano per campo; ogni `*Error` è DERIVATO da `submitAttempted && <condizione del campo>`, così la correzione pulisce l'errore ISTANTANEAMENTE (nessun wiring separato di "clear on change"). Usato SOLO in `pilot-editor.tsx#NewPersonForm` (licenza pilota, corso allievo, email/ruoli accesso, data-per-chip ratings/medical) — **correzione review F5**: `flight-editor.tsx`/`transaction-editor.tsx` NON usano questo pattern, ma un booleano per campo (`aircraftError`/`personError`/`reasonError`/...) con clear-on-change manuale nel proprio `onChange` — scelta legittima, diversa dal flag unico. Dove serve un `focusFirstInvalid` esplicito (`src/lib/dom-focus.ts`, query `[aria-invalid="true"]` differita con `setTimeout(...,0)` per lasciare committare il render).
- `pilot-editor.tsx`, story 13.2's `NewExpiryChipGroup`: la data mancante ora è marcata PER RIGA selezionata (`missingDateIds: Set<string>`), non più un unico messaggio sotto ENTRAMBI i gruppi chip.

### AC3 — 422 server mappati sui campi

- `src/lib/api-field-errors.ts` (NEW, + test): `parseApiError(response)` legge UNA VOLTA `error.details.fieldErrors` (Zod `flattenError`, AD-8) e restituisce `{code, fieldErrors: Set<string>}`. Il messaggio grezzo del server non è MAI mostrato (resta per i log) — i chiamanti riusano la LORO stringa tradotta già esistente per quel campo.
- Esempio REALE citato dal contesto: **club-card.tsx**, `contactEmail` malformato (non vuoto) → 422 `fieldErrors.contactEmail` → nuova label `invalidEmail` sul campo Email di contatto (e2e dedicato, v. sotto).
- Altri 2 casi REALMENTE raggiungibili (nessun controllo client pre-esistente): **scheduling-card.tsx** (`closeTime <= openTime`, refine server-side) → nuova label `invalidRange`; **smtp-card.tsx** (host privato/loopback, refine CWE-918) → nuova label `invalidHost`.
- **treasury-card.tsx**: split AC2 (cash/bank/date singolarmente marcati) — AC3 non applicato (i controlli client pre-esistenti già bloccano prima della fetch, un 422 fieldErrors non è raggiungibile in pratica).
- SlideOver RHF (`pilot-editor.tsx`, `aircraft-editor.tsx`, `flight-editor.tsx`): `setError(field, {message: labels...})` per i campi noti presenti in `fieldErrors` — DIFENSIVO/per coerenza dello sweep più che per un gap reale (lo schema client MIRRORA quasi sempre lo schema server su questi form, quindi il 422 fieldErrors è raro in pratica). Deviazione dichiarata: NON implementato per `transaction-editor.tsx`/booking forms/PPR forms (schema discriminato/superRefine più complesso da mappare 1:1, ROI basso dato che i controlli client già coprono il caso comune) — vedi "Deviazioni".

### AC4 — Sweep completo (enumerazione)

**SlideOver editor:**
1. `pilot-editor.tsx` — IdentitySection (edit), NewPersonForm (base RHF + pilota/allievo/accesso a stato piano + ratings/medical per-riga), PilotProfileForm, StudentProfileForm, AccessSection (crea utente)
2. `aircraft-editor.tsx` — IdentitySection (create/edit), AvailabilitySection (motivo fuori servizio), RatesSection, HourMeterSection
3. `flight-editor.tsx` — campi RHF + aircraft/person (SearchCombobox) + motivo correzione
4. `transaction-editor.tsx` — amount/person/reason/category (stato piano, split da un unico `formError`)
5. `new-booking-form.tsx` / `edit-booking-form.tsx` — migrazione dei paragrafi manuali già quasi corretti nel prop `error` di `Field`
6. `manual-ppr-form.tsx` (completamento manuale/registrazione arrivo PPR, riusato da console+movements) — 10 campi
7. `instructor-editor.tsx` — IdentitySection (AGGIUNTA ex-novo: zero feedback esisteva, nemmeno `aria-invalid`), PayoutRateForm
8. `instructor-rates-panel.tsx`, `instructors-console.tsx` (PaySlideOver), `pilots-console.tsx` (TopUpSlideOver), `account-section.tsx` (TopUpForm + AdjustmentForm)
9. `expiry-editor.tsx` (LiveExpiryEditor, add/edit — solo `aria-invalid` aggiunto, il messaggio era già inline)
10. `movements-table.tsx` (CompleteForm — "completamento PPR" con tassa/metodo)

**Card Impostazioni:** `club-card.tsx`, `scheduling-card.tsx`, `smtp-card.tsx`, `treasury-card.tsx`, `cash-categories-card.tsx`, `ratings-card.tsx` (migrazione dal pattern manuale pre-esistente)

**Form pubblico PPR:** `ppr-form.tsx`

**Pagine auth:** `login-form.tsx`, `set-password-form.tsx` (migrazione, messaggi già esistenti), `forgot-password-form.tsx`

**Contrasto-only (messaggio già inline/per-campo, solo swap di classe per il fix di contrasto AC1, nessun cambio di struttura/comportamento):** `billing-console.tsx` (rettifica/storno), `logbook-console.tsx` (annulla volo), `calendar-popover.tsx` (ora nel picker) — questi 3 usano già `<label htmlFor>` esplicita, MAI il bug di accessible-name.

**Chiavi i18n nuove** (AC4: riuso del generico dove possibile, nuove SOLO dove il gap era reale): `SettingsPage.club.invalidEmail`, `SettingsPage.scheduling.invalidRange`, `SettingsPage.smtp.invalidHost`, `InstructorsPage.editor.identity.requiredField`, `auth.login.requiredField`, `auth.forgotPassword.requiredField` (it+en).

**Orfani PRE-ESISTENTI osservati ma NON toccati** (non causati da questa story, fuori dal suo mandato chirurgico): `ExpiriesPanel.form.requiredField` (la tabella scadenze in `people/[id]` è sola-lettura, nessun form lì), `InstructorsPage.addInstructor.requiredField` (il bottone submit non esiste finché non è selezionata una persona — nessuno stato "vuoto" possibile), `aircraft-editor`'s `errors.invalidDate`/instructor-rates-panel's `invalidDate` (nessun percorso di validazione li produce in nessuno dei due gemelli).

### AC5 — Test

- **e2e nuovi** (uno per gruppo, come richiesto): `e2e/aircraft-management.spec.ts` (SlideOver — submit vuoto marca OGNI campo, focus sul primo, la correzione pulisce SOLO quel campo), `e2e/settings.spec.ts` (card Impostazioni — club contactEmail malformato, 422 mappato sul campo, dimostra AC3), `e2e/ppr-public.spec.ts` (form pubblico — submit vuoto, nessuna chiamata di rete, `aria-invalid`+messaggio per campo).
- **Lezione della prima iterazione**: il test PPR pubblico ha scoperto il bug di accessible-name descritto sopra (`getByLabel('Nome')` smetteva di trovare l'elemento) — la discriminanza era ESATTAMENTE quella attesa da un test e2e reale (non un mock), non un artefatto del test stesso.
- e2e pre-esistenti verificati (grep mirato + full suite): NESSUNO asseriva la stringa globale in un modo che questa story rompe — i pattern `formError`/`genericError`/`conflictError` restano intatti (mai usati per required-field). `e2e/people-management.spec.ts` (riga con `'La data di scadenza è obbligatoria.'`) resta verde: il messaggio è ancora renderizzato, solo ora per-riga invece che come paragrafo generico.
- Full suite CI=1: v. report finale.

## Review Record

_(compilato dopo la review adversarial)_
