---
baseline_commit: 44c8fda
---

# Story 14.2: Validazione form per-campo — bordo rosso e messaggio sul campo, non in fondo

Status: done (review Opus 5 shippable-with-fixes — fix in due giri `ba90239` + `9097d18`, arbitro 276+1 flaky login-class exit 0 — 2026-07-28)

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

Review adversarial (Opus 5 xhigh, 2026-07-28). Perimetro `git diff 4dfe4a2..HEAD` (`cc6ad26` feat + `45706f3` record), 37 file sorgente + 3 e2e + messages.

**Verdetto: shippable-with-fixes** — 4 major, 3 minor, 1 nit. Il nucleo della story (primitiva `Field` con stato errore, contrasto, fix accessible-name, focus-first-invalid, AC3 sulle 3 card Impostazioni) è solido e verificato empiricamente; le lacune sono di COMPLETEZZA dello sweep (AC2/AC3/AC4), non di correttezza di quanto implementato.

### Priorità zero — full suite arbitro

DB fresco (`docker compose down -v` + migrate + seed), build prod, `JOBS_SECRET` non-placeholder, `CI=1 npx playwright test` foreground su file:

```
Running 277 tests using 2 workers
  277 passed (9.9m)
E2E EXIT=0
```

Zero fallimenti, **zero flaky, zero retry**. Catena serializzata completa (settings 6/6 incluso il nuovo test 14.2 sul 422 `contactEmail`, booking-window 3/3, treasury-settings 3/3, billing-global 2/2). I 3 e2e nuovi verdi. Falso allarme auto-diagnosticato e NON imputabile alla story: un mio `npm run build` standalone è fallito su `/it/dashboard/ppr` perché il mio script esportava `NODE_ENV=development` dal `.env` — la regola di repo (`env -u NODE_ENV npm run build`, applicata dal webServer CI=1) rende il build verde.

### Findings

| # | Sev | Titolo |
|---|-----|--------|
| F1 | major | Campi nella lista `known` del 422 ma senza marker visibile → submit muto (e il banner globale ora sparisce anche dal path 422): `pilot-editor.tsx:252/306-314` (phone/address/fiscalCode), `instructor-editor.tsx:291-299` (gemello, senza nemmeno `aria-invalid`), `aircraft-editor.tsx:354-362/405/408/436` (seats/fuelType/notes). Provato: «Telefono» = spazi → nessun PATCH, nessun bordo, nessun messaggio, nessun banner, focus muto sul campo; «Posti» = 500 → idem. |
| F2 | major | **AC2 violato**: i required a stato piano vivono nella callback di successo di `handleSubmit`, quindi al PRIMO submit non vengono marcati se un campo RHF è invalido. `flight-editor.tsx:312-324` (il picker «Pilota o allievo» resta bianco al submit #1, si accende solo al #2) e `pilot-editor.tsx:528-541` (licenza pilota/data corso/email-ruoli accesso/date chip). |
| F3 | major | **AC4 incompleto**: 4 form mai toccati, tutti col vecchio banner in fondo, senza `aria-invalid`, in `var(--bad)` grezzo (3.96:1, sotto il floor 4.5:1 che la story stessa stabilisce): `settings-form.tsx` (nome aviosuperficie — DENTRO la Club card dichiarata fatta: 422 reale `fieldErrors.name` mostrato in **verde** `var(--ok)`), `ppr-console.tsx` (motivo rifiuto PPR — gemello esatto del modal annulla-volo sistemato in D4), `bookings-table.tsx` (motivo rifiuto prenotazione), `scadenze-console.tsx` (quota associativa: pilota mancante e importo invalido condividono la stessa stringa). |
| F4 | major | **D1 respinta per i 2 form PPR**: gli schemi client non hanno bound `.max()`, il server sì (`aircraftRegistration.max(20)`, ecc.). Marca di 24 caratteri → 422 `fieldErrors.aircraftRegistration` REALE su `/it/ppr` e sul PPR manuale → solo banner generico, campo `aria-invalid=false`. |
| F5 | minor | Dev Record inesatto: `submitAttempted` attribuito anche a flight-editor/transaction-editor, che usano invece un booleano per campo con clear-on-change manuale (`grep submitAttempted` → solo pilot-editor). |
| F6 | minor | Il nuovo `e2e/ppr-public.spec.ts` **non discrimina** la modifica della story: tutte e 4 le sue asserzioni erano già vere a `4dfe4a2` (baseline righe 263/265: `aria-invalid` + messaggio per campo già presenti). Guarda solo la regressione di accname. |
| F7 | minor | `treasury-card.tsx`: la stessa stringa compare 3 volte (2 per-campo + banner) e sotto «Data di apertura» recita «Inserisci importi validi…». |
| F8 | nit | `.fld-error` senza `aria-describedby`: l'AX name dice `[invalid]` ma non il perché quando si torna sul campo. |

### Giudizio sulle deviazioni dichiarate

- **D1 — RESPINTA per `ppr-form.tsx` e `manual-ppr-form.tsx`** (v. F4, 422 field-shaped riprodotto su entrambi con payload reale). **Accettata** per new/edit-booking-form (notes con `maxLength` nativo, id da select, refine `invalidRange` già mirrorata) e treasury-card: lì non sono riuscito a raggiungere un `fieldErrors`.
- **D2 — Confermata e verificata.** Audit AX su 14 campi con errore attivo in 3 form: nessun accessible name inquinato; restano solo 2 `<label className="fld">` wrapping in tutto l'albero, entrambi senza errore renderizzato dentro.
- **D3 — Inesatta nella documentazione** (comportamento corretto). V. F5.
- **D4 — Confermata.** Solo swap di classe, i 3 file usano già `<label htmlFor>`; contrasto del testo rimisurato 9.82:1 chiaro / 6.61:1 scuro.
- **D5 — Confermata e accurata.** Le 4 chiavi/prop citate sono orfane pre-esistenti; la story non ne crea di nuove e anzi ne **recupera** una (`PilotsPage.editor.medical.requiredDate`). Parità it/en: 1739 chiavi ciascuno, zero divergenze.

### Verifiche empiriche superate (nessun finding)

- **Contrasto rimisurato due volte** (Python su token + canvas sul DOM reale, chiaro e scuro): LIGHT bordo **3.96:1** / testo **9.82:1**; DARK bordo **6.61:1** / testo **6.61:1**; classe applicata `fld-error`, non lo stile ad hoc. Numeri del dev confermati.
- **Focus-first-invalid su form a stato piano con SearchCombobox primo invalido**: focus su `INPUT#transaction-person`, entrambi i campi marcati con messaggi distinti, la correzione pulisce solo il proprio.
- **`.input-group:has(...)`**: wrapper rosso, input interno `border-style: none` — specificità corretta anche contro `:focus-within`.
- **Layout**: `gridOverflow` vuoto, tutte le `.fld-error` dentro il pannello; il PPR pubblico con 10 errori attivi non spacca la griglia (la ristrutturazione elimina anzi un difetto pre-esistente: il `<p>` d'errore era un item di griglia autonomo).
- **i18n**: parità perfetta, zero orfane nuove, zero `FORMATTING_ERROR`/`MISSING_MESSAGE` su 15 route IT+EN.
- **Superficie RBAC**: intatta per costruzione — nessuna modifica a route API, service, schemi Zod o Prisma nel diff.

### Fix post-review (2026-07-28, due giri — fix-subagent Sonnet 5 xhigh `ba90239` + chirurgico sessione principale `9097d18`)

**Giro 1 (`ba90239`, F1-F8):**
- **F1 fixed** — ogni campo nella mappa 422 ha ora il suo `Field error`/aria-invalid (pilot-editor, instructor-editor — che non aveva NEMMENO la mappatura, aggiunta —, aircraft-editor); regola: `mapped=true` solo con marker effettivamente renderizzato. Extra scope dichiarato: stesso bug latente cablato anche in NewPersonForm (phone/address/fiscalCode). Probe post-fix: telefono di spazi / 500 posti → campo rosso, richiesta mai partita.
- **F2 fixed** — ramo `onInvalid` di `handleSubmit` su NewPersonForm e flight-editor (marking estratto in `markPlainRequiredFields`): TUTTI i required marcati al PRIMO submit, misto RHF+stato-piano.
- **F3 parziale nel giro 1** — sistemati settings-form (con separazione errore-rosso/successo-verde: il verde-anche-su-errore era un bug pre-esistente), ppr-console, bookings-table, PIÙ un quinto form auto-identificato (motivo "Forza prenotazione" di new-booking-form, stessa classe) — ma il QUARTO form del reviewer era un altro (v. giro 2).
- **F4 fixed** — i due form PPR: mapping 422→campo via parseApiError E bound `.max()` client allineati al server + maxLength; marche da 24 char → errore sul campo, POST mai partito.
- **F5/F6/F7/F8 fixed** — record corretto (submitAttempted solo in NewPersonForm); e2e PPR pubblico reso discriminante (classe `.fld-error` + color diverso dalla label — fallirebbe sul baseline); treasury con `invalidAmount`/`requiredDate` separati e niente banner duplicato; `aria-describedby` in Field (useId) e SearchCombobox.
- Full suite del giro: 277 passed, 0 flaky, exit 0.

**Giro 2 (`9097d18`, F3.4 — il quarto form vero, mancato dal giro 1):** modal **Quota associativa** (`expiries/scadenze-console.tsx`): pilota e importo avevano UNA stringa condivisa in fondo — ora stati derivati distinti (`submitAttempted` + valore corrente, clear automatico), `error` sul SearchCombobox del pilota, `aria-invalid`+`aria-describedby`+`.fld-error` sull'importo, banner solo per gli errori server (saldo insufficiente); chiavi i18n separate (`requiredPilot`, `invalidAmount` riscritta) it/en. Gates verdi; spec `membership-fee` 7/7 (primo run rosso al login: cold-compile next dev, classe nota).

**Full suite finale (arbitro = sessione principale, albero definitivo con entrambi i giri)**: DB fresco, build prod, `CI=1 npx playwright test` →

```
276 passed (9.4m), 1 flaky
```
Exit code `0`. Il flaky è il test NUOVO della club card ma fallito alla RIGA DI LOGIN dell'helper condiviso (toHaveURL /dashboard, 14 tentativi su /it/login) — classe documentata "login POST ~5s" che colpisce anche le build prod, retry verde; non attribuibile alla story.

**Esito finale: tutti i findings chiusi (F3 completato in due giri). Story DONE.**
