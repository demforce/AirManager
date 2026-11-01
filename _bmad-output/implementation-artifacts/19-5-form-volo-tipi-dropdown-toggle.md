---
baseline_commit: 3876e72
---

# Story 19.5: Form volo — due tipi, dropdown uniformi, bottone doppio comando/solista

Status: **ready-for-dev** — 2026-11-01. **Nessuna domanda PO aperta** (v. §0.3: otto scelte di interpretazione prese su delega, ognuna ricondotta a una ratifica chiusa o a un vincolo tecnico misurato). **Modello dev: Opus 5 xhigh (UI)** — la story scrive una primitiva AirOps nuova (`Toggle`), allarga una primitiva condivisa (`SearchCombobox`, 5 call site) e tocca tre form (volo, prenotazione nuova, modifica prenotazione) oltre a enum Prisma, migrazione, Zod/OpenAPI, statistiche, export, seed, i18n ed e2e. Review: **Opus 5 xhigh adversarial**, come sempre. Chiave sprint-status: `19-5-form-volo-tipi-dropdown-toggle`.

> ⚠️ **Baseline e ordine**: ogni `file:riga` di questo file è misurato su **`3876e72`** (HEAD al 2026-11-01: la 19.1 è già nel codice da `08eb558`; 19.2, 19.3 e 19.4 esistono solo come story file). Il dev della 19.5 parte **DOPO i commit di 19.2, 19.3 e 19.4**, che toccano **gli stessi file** in punti diversi:
> - **19.2** — `flight-editor.tsx` (via «Contaore iniziale/finale» e «Note»: campi `:1062-1070`, payload `:594-611`, `:626`, chiavi label `:58`, `:83-85`, `:89`; il test e2e F1/F2 di `flights.spec.ts:610-700` diventa «correzione solo-cicli»), `logbook-console.tsx` (righe dello sheet), `logbook/page.tsx` e `dashboard/page.tsx` (label del `FlightEditor`), `exports.service.ts` (colonna velivoli), `seed-load.ts`, `messages/*.json`, i commenti `segmented.tsx:24`/`new-booking-form.tsx:480`, e — attenzione — le righe dei selettori `^=` citate da `CLAUDE.md`.
> - **19.3** — `flights.service.ts` (prezzo per profilo), seed, **fixture e2e delle tariffe** (`validFrom ≥ oggi`: gli helper che creano tariffe/voli datati 2020 cambiano forma, D-7 della 19.3) e i **profili esclusivi** (Q-19.3-c: l'allievo esclude pilota e istruttore) → i due test che rendono «solo allievo» una persona che era pilota (`flights.spec.ts:610-650`, deattivazione a `:635`; `mobile-logbook.spec.ts:1016-1027`, a `:1025`) possono arrivare già riscritti.
> - **19.4** — editor pilota/istruttore: in comune solo `messages/*.json` ed e2e.
> - Il **fix cycle della 16.3** (agent `fix-16-3`), se atterra ancora, tocca `new-booking-form.tsx`/`edit-booking-form.tsx` e `bookings.spec.ts`.
>
> Effetto atteso: **solo slittamento di righe** e blocchi già semplificati. Prima di scrivere una riga: `git log --oneline -6`, rieseguire i **censimenti di §3** (sono comandi, non elenchi da fidarsi) e annotare nel record gli scostamenti.
>
> **Da leggere PRIMA di scrivere una riga**: `CLAUDE.md` (convenzioni e2e: `getByLabel` è substring e case-insensitive, `Escape` e i pannelli, testid `-mobile`/`mobile-`, suite solo via `scripts/e2e.sh`, unit test ed env eager); `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` §4.0, §4.2 riga 19.5, §4.5, §4.10 **A5**, **A15**, **A18**, **A19**; i precedenti `td-3-typeahead-pickers.md` (contratto del `SearchCombobox`), `14-2-validazione-form-per-campo.md` (errore per campo, `focusFirstInvalid`), `14-3-regole-voli-scuola.md` (lucchetto Scuola per l'allievo, review F1/F2/F4), `14-7-*` (perché lì `Segmented` e qui no), `aog-1-velivolo-fuori-servizio.md` + `aog-1a-campo-guardia-volo.md` (opzione fuori servizio: **disabilitata** nel form prenotazione, **selezionabile** nel form volo, R-AOG-d), `15-10-*` (focus trap che comprende i portali, Escape consumato dal `CalendarPopover`, opzioni 44px). Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`, `design-taste-frontend`, `ui-ux-pro-max` (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`).

### ❓ Domande PO aperte

**Nessuna.** La ricognizione non ha trovato assunzioni di dominio fuori dalla CR: la rimappatura `AERIAL_WORK → TOURISM` è nella CR approvata (§4.2), «Turismo con istruttore» è A5, l'estensione ai form prenotazione è A15, il componente unico è A18, il bottone solo su Scuola è A19. Le otto scelte di interpretazione (semantica on/off del bottone, sua posizione, modalità statica del combobox, opzione fuori servizio nelle prenotazioni, Escape, placeholder, filtri del registro, chevron) sono in §0.3: la sessione principale può riaprirle col PO prima del dispatch senza toccare il resto della story.

---

## Story

As **l'amministratore che registra i voli** (e chi prenota: amministratore, istruttore per i suoi allievi, pilota per sé),

I want che il volo abbia **due soli tipi, Turismo e Scuola**, che **velivolo, pilota, istruttore e tipo di volo** si scelgano tutti con **lo stesso menu a tendina** (anche nei form di prenotazione), e che la scelta **doppio comando / solista** sia **un grande bottone on/off** invece di due radio,

so that il form si legga e si usi in un solo modo (punto PO 10), il tipo «Lavoro aereo» — mai usato — sparisca da form, filtri, statistiche ed export, e il bottone solista sia la stessa primitiva che la 19.6 riuserà per «senza addebito».

### Il perché

Il PO, dopo l'uso con i dati demo: «i tipi di voli rimangono solo: turismo e scuola. uniformare la UI del dropdown per i campi: velivolo, pilota, istruttore e tipo di volo. la scelta doppio comando/solista la voglio con un bottonone on/off non con una checkbox». Oggi nel form volo tre campi su quattro sono un `SearchCombobox` (typeahead con popup AirOps) e il quarto, «Tipo di volo», è un `<select>` nativo; nei form prenotazione **tutti** i campi di scelta sono `<select>` nativi. Il terzo tipo `AERIAL_WORK` non porta **nessuna regola di dominio**: lo leggono solo etichette, filtri, la serie «Composizione movimenti» e l'export. Il doppio comando/solista è oggi un `fieldset` con due radio sotto la griglia.

### Fatti misurati che vincolano il design (su `3876e72`)

| Fatto | Misura | Conseguenza |
|---|---|---|
| `AERIAL_WORK` non ha regole | nessuna occorrenza in `flights.service.ts`/`school.service.ts`/`bookings.service.ts`; solo `stats.service.ts:241` (chiave della serie), `exports.service.ts:213` (tipo dell'etichetta), UI (`flight-editor.tsx:473`, `:1033`; `logbook-console.tsx:694`, `:754`, `:1126`; `logbook/page.tsx:39`; `reports-console.tsx:12`, `:30`; `reports/page.tsx:77`), Zod (`flights.ts:9`, `stats.ts:75`), `seed-load.ts:627-628` | la rimappatura su `TOURISM` non cambia addebiti né compensi: cambia solo come il volo è etichettato e contato |
| L'enum vive in **una** colonna | `schema.prisma:957` `Flight.flightType FlightType`, senza `@default`, nessun indice/vincolo sul valore | ricreare il tipo è sicuro; precedente diretto `20260729144406_remove_staff_role` (CREATE `_new` → ALTER COLUMN USING → RENAME → DROP) |
| Postgres non sa togliere un valore da un enum | idem precedente | la migrazione **deve** riscrivere le righe `AERIAL_WORK` PRIMA del cast, altrimenti `invalid input value for enum` su qualunque DB popolato (`airmanager_load` ne ha il ~12%: `seed-load.ts:627`) |
| Il filtro API è Zod | `listFlightsQuerySchema.flightType = flightTypeSchema.optional()` (`flights.ts:49`); errori di validazione → **422** `VALIDATION_ERROR` (`handler.ts:44-48`) | dopo la story `GET /flights?flightType=AERIAL_WORK` e `POST /flights` con quel tipo → 422; la pagina invece scarta il valore ignoto (`logbook/page.tsx:47-49` `sanitizeFlightType`) e mostra il registro non filtrato |
| `SearchCombobox`: 5 call site, contratto stretto | `flight-editor.tsx:966`, `:980`, `:994`; `transaction-editor.tsx:262`; `scadenze-console.tsx:853`. `fetchOptions` **obbligatorio** (`search-combobox.tsx:48`), nessun `hint`, nessuna opzione disabilitata (`:33-37`) | per il tipo (2 opzioni fisse, lucchetto + hint della 14.3) e per i form prenotazione servono **tre allargamenti opzionali**, nessun componente nuovo (AD-2) |
| Il tipo di volo oggi è un `Select` dentro un `Field` | `flight-editor.tsx:1005-1035`: `disabled={isLocked}`, `value={effectiveFlightType}`, `hint` lucchetto/correzione via `Field` (`field.tsx:27-35`, `aria-describedby` review F4 14.3) | il combobox deve portare lo **stesso** hint collegato ad AT, altrimenti un campo disabilitato perde la sua unica spiegazione programmatica |
| Escape dentro uno `SlideOver` | il combobox aperto fa solo `preventDefault` (`search-combobox.tsx:299-304`); `SlideOver` ascolta `keydown` su `window` e chiude tutto (`slide-over.tsx:53-56`); il `CalendarPopover` invece consuma il primo Escape (`fixed-popover.ts:218-224`, 15.10) | oggi Escape sul popup del combobox chiude il **pannello intero**; portato nei form prenotazione (che si azzerano alla chiusura, `new-booking-form.tsx:254-267`) sarebbe una regressione → AD-3 |
| Form prenotazione: 5 `<select>` nativi | nuova: persona (staff) `:430-442`, velivolo `:444-455` (opzioni fuori servizio `disabled`, AOG-1), istruttore (staff) `:457-468`, allievo (istruttore) `:514-526`; modifica: velivolo `edit-booking-form.tsx:214-225`. Tutti `register(...)` RHF + `superRefine` | serve un ponte RHF ↔ componente controllato: `Controller` (0 usi oggi nel repo, API ufficiale di RHF) — AD-5 |
| Liste delle prenotazioni e permessi | velivoli = **tutti** i non archiviati (`listBookableAircraft`, `bookings.service.ts:1462-1470`, nessun tetto); persone staff = prime **100** (`bookings/page.tsx:41`, `:168`); istruttori e allievi = tutti gli attivi. `GET /api/v1/aircraft` richiede `aircraft.manage` (`aircraft.service.ts:194`), `GET /api/v1/people` richiede `people.read` (`people.service.ts:186`): pilota e istruttore **non** li hanno | nei form prenotazione il combobox filtra **in locale** la lista già resa dal server (stesso insieme raggiungibile di oggi); una ricerca server darebbe 403 a pilota e istruttore → D-4 |
| Bug a11y preesistente che sparisce da solo | il `<label>` di `Field` avvolge il `<select>` e il nome accessibile ingloba il testo di **tutte** le opzioni (`bookings.spec.ts:588-595`; lezione 12.11 F2 «Finestra» in `CLAUDE.md`) | il `SearchCombobox` ha il `<label htmlFor>` fratello (`search-combobox.tsx:326-328`): `getByLabel('Allievo', { exact: true })` torna a funzionare |
| Blast radius e2e (misurato, non stimato) | `flight-type-select` **4** occorrenze in **2** spec (`flights.spec.ts:593`, `:653`; `mobile-logbook.spec.ts:75`, `:1036`), non ~16; `getByLabel('Tipo di volo').selectOption` 2 (`flights.spec.ts:294`, `flight-reversal.spec.ts:188`); form prenotazione **31 righe in 4 spec** (§3.6); tipo `AERIAL_WORK`/«Lavoro aereo» 15 righe in 5 spec + il selettore `.flow-bar-muted` di `mobile-reports.spec.ts:519`; **nessuno** spec pilota il doppio comando/solista da UI (0 occorrenze di `flight-solo-mode`) | il bottone nasce senza copertura e2e da adattare: va scritta |
| Nessun anello di focus globale | `airops.css`: 0 regole `:focus-visible`; `.input:focus{outline:none}` (`:1164`) | il `Toggle` definisce il suo indicatore di focus (AC 15) |
| `.flow-bar-muted` vive solo per `AERIAL_WORK` | `reports-console.tsx:30`, `airops.css:782`, selettore di `mobile-reports.spec.ts:519` (con `toBeGreaterThanOrEqual(6)` a `:520` = 3 bande + 3 pallini) | diventa orfana: si toglie; l'asserzione scende a 4 |
| i18n | **1 760** chiavi per file, parità it/en 0/0 (post-19.1). Questa story: **4 rimosse, 2 nuove, 2 testi cambiati** per file (§3.8) | parità da rimisurare a fine story |

---

## §0 — Requisiti fissi e ratifiche

### §0.1 Contratto (CR approvata, §4.2 riga 19.5 + §4.10)

| # | Requisito |
|---|---|
| **P1** | `FlightType` = `TOURISM`, `SCHOOL`. Migrazione forward che rimappa `AERIAL_WORK → TOURISM` e ricrea l'enum; via il terzo valore da Zod/OpenAPI, form, filtri e badge del registro voli, statistiche, export, seed, i18n, e2e. |
| **P2** | Nel form volo velivolo, pilota/allievo, istruttore e **tipo di volo** usano **lo stesso componente**, `SearchCombobox` (A18). |
| **P3** | Stessa uniformazione nei form **prenotazione nuova** e **modifica prenotazione** (A15): velivolo, persona, istruttore, allievo. |
| **P4** | Nuova primitiva AirOps **`Toggle`** (bottone on/off grande, `role="switch"`, `aria-checked`) in `src/components/ui/`, al posto delle due radio doppio comando/solista. |
| **P5** | Il bottone compare **solo** sui voli Scuola (A19), come oggi. |
| **P6** | Turismo con istruttore resta ammesso (A5): nessuna regola cambia, l'istruttore resta facoltativo su Turismo. |

### §0.2 Ratifiche vincolanti

| R | Decisione | Effetto qui |
|---|---|---|
| **R-19-a** | DB di test, migrazioni distruttive ammesse | la migrazione riscrive lo storico (`AERIAL_WORK` diventa `TOURISM`): la serie storica «Composizione movimenti» conta quei voli come Turismo — atteso |
| **A5** | Turismo con istruttore ammesso, conta come doppio comando per la currency | nessun cambio: l'unit `flights.service.test.ts:1160` resta verde |
| **A15 / A18** | Stesso componente dropdown in form volo e form prenotazione | AD-1, AD-5 |
| **A19** | Bottone solo su Scuola | AC 14 |
| **R-14.3-a** | Il tipo di un volo storico non si riscrive mai dalla UI | il combobox in correzione non è mai bloccato (AC 9) |
| **R-AOG-d** (AOG-1a) | Nel form **volo** il velivolo fuori servizio resta selezionabile (la deroga esiste) | invariato |
| **AOG-1** | Nel form **prenotazione** il velivolo fuori servizio è visibile col motivo e **non selezionabile** | D-5, AD-2(c) |
| **Decisione utente 2026-07-21** | I **filtri** del registro voli usano tutti lo stesso controllo nativo, niente typeahead (`logbook-console.tsx:344-347`) | i filtri restano `<select>`: perdono solo l'opzione (D-8) |
| **R-15.10-d** | Opzioni del typeahead ≥ 44px sotto i 640px (`airops.css:3585`) | vale anche per le opzioni disabilitate e per il tipo di volo |

**Ratifiche/AC storici SUPERATI da questa story** (da non «ripristinare»): story 9.4 (tre tipi, `AERIAL_WORK` = «lavoro aereo», `schema.prisma:871-879`), story 12.10 ratifica utente 1 limitatamente a «always all 3 keys» della `movementMix` (`stats.service.ts:236`), story 15.8b limitatamente al tono `.flow-bar-muted` della terza banda, story 14.3 AC 2 limitatamente al **controllo** (`Select` → combobox: il lucchetto, il valore forzato e l'hint restano identici), story 12.8 limitatamente alle due radio del doppio comando/solista.

### §0.3 Scelte prese su delega (nessuna è un'assunzione di dominio nuova)

| ID | Scelta | Riconducibile a | Alternativa scartata |
|---|---|---|---|
| **D-1** | Il bottone si chiama **«Volo solista»**: **on = solista**, off = doppio comando; predefinito **off** (oggi `isSolo` parte `false`, `flight-editor.tsx:346`). Dentro il bottone un testo visibile dice lo stato: «Doppio comando» / «Solista» | CR §4.5 e §4.2 riga 19.9: «volo Scuola con **«solista» attivo**» — la CR stessa chiama «attivo» il solista | on = doppio comando: contraddice la parola della CR e farebbe partire il bottone acceso su ogni volo Scuola |
| **D-2** | Il bottone è una cella **larga** della griglia **subito dopo «Tipo di volo»**, non più un `fieldset` sotto la griglia | prossimità: compare/sparisce accanto al campo che lo comanda; lo spostamento della griglia è innescato dall'utente (non è CLS) | lasciarlo in fondo: su mobile finisce sotto Partenza/Arrivo/Orari, lontano dalla scelta che lo fa apparire |
| **D-3** | Il tipo di volo è **lo stesso `SearchCombobox`** in **modalità statica**: `fetchOptions` diventa **opzionale**, e senza di esso il filtro client di `initialOptions` è il risultato definitivo (niente debounce, niente rete). Il campo resta digitabile come gli altri tre | A18 alla lettera; 6 call site nuovi con liste fisse (tipo + 5 nei form prenotazione) | (a) un finto `fetchOptions` asincrono in ogni call site: dopo 250 ms rimpiazza le opzioni con le stesse e riporta l'opzione attiva in cima (glitch se l'utente ha già usato le frecce); (b) una variante `readOnly`/`inputMode="none"`: un secondo comportamento per un campo solo, contro «lo stesso componente». Costo accettato: su telefono il focus apre la tastiera, come già sugli altri tre campi |
| **D-4** | Nei form prenotazione il combobox filtra **in locale** le liste rese dal server; il tetto di 100 persone del picker staff resta | stesso insieme raggiungibile del `<select>` di oggi; pilota e istruttore non possono chiamare le API di ricerca (tabella fatti) | ricerca server: 403 per pilota/istruttore, e il dominio «prenotabile» (pilota ∨ allievo ∨ istruttore) non ha un filtro API; la 19.10 ridefinisce comunque chi è prenotabile |
| **D-5** | Velivolo fuori servizio nei form prenotazione: opzione **visibile col motivo e non selezionabile**, tramite una proprietà opzionale `disabled` dell'opzione del combobox | parità con AOG-1 (`<option disabled>`, misurato a 1280 e 375) | escluderlo dalla lista (il pilota non saprebbe perché manca) o lasciarlo selezionabile (il 422 arriverebbe solo all'invio) |
| **D-6** | Il **primo Escape** sul popup aperto chiude **solo il popup**; il secondo (popup chiuso) chiude il pannello come oggi | stessa regola del `CalendarPopover` (15.10); senza, Escape su un menu aperto azzererebbe il form prenotazione, cosa che col popup nativo del `<select>` non succede (il dev lo **verifica sul baseline** prima del cambio e lo riporta nel record, §B) | lasciarlo com'è: regressione nei form prenotazione |
| **D-7** | Nei form prenotazione placeholder **«Cerca…»** e riga vuota **«Nessun risultato.»**, come nel form volo (chiavi nuove `BookingsPage.form.picker.*`); `selectPlaceholder` («Seleziona…») resta orfana e si toglie | coerenza col form volo (A15) | tenere «Seleziona…» in un campo digitabile: due lingue per lo stesso controllo |
| **D-8** | I **filtri** del registro voli (desktop e pannello mobile) restano `<select>` nativi; il `SearchCombobox` **non** guadagna una freccia/chevron | decisione utente 2026-07-21 sui filtri; il punto PO 10 parla dei campi del form | convertire i filtri: rovescia una decisione utente esplicita; aggiungere la chevron: cambia l'aspetto dei 5 call site esistenti senza richiesta |

> Se la sessione principale o il PO volessero diversamente su D-1..D-8, la modifica è locale (gli AC citati in ogni riga) e non tocca il resto della story.

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — UNA migrazione forward che riscrive e poi ricrea il tipo

`prisma/migrations/<timestamp>_flight_type_two_values/migration.sql`, timestamp **successivo** all'ultima migrazione presente al momento del dev (19.2/19.3 ne aggiungono). Forma (non lettera), sul precedente `20260729144406_remove_staff_role`:

```sql
-- Story 19.5 (CR PO 2026-11-01, punto 10 + §4.2): FlightType keeps only TOURISM and SCHOOL.
-- AERIAL_WORK carried no rule (charges, payouts and checks never read it): its flights become TOURISM.
-- Postgres cannot drop an enum value, so the type is recreated; the UPDATE must run BEFORE the cast.
BEGIN;
UPDATE "Flight" SET "flightType" = 'TOURISM' WHERE "flightType" = 'AERIAL_WORK';
CREATE TYPE "FlightType_new" AS ENUM ('TOURISM', 'SCHOOL');
ALTER TABLE "Flight" ALTER COLUMN "flightType" TYPE "FlightType_new" USING ("flightType"::text::"FlightType_new");
ALTER TYPE "FlightType" RENAME TO "FlightType_old";
ALTER TYPE "FlightType_new" RENAME TO "FlightType";
DROP TYPE "public"."FlightType_old";
COMMIT;
```

`isSolo` non va toccato: un `AERIAL_WORK` non poteva essere solista (`SOLO_REQUIRES_SCHOOL`, `flights.service.ts:814-815`). Verifica obbligatoria su un **DB gemello**, mai su `airmanager` con un arbitro vivo: (1) catena completa `migrate deploy` da zero verde; (2) **prova sui dati**: gemello migrato fino alla migrazione precedente + `npm run seed:demo`, poi `UPDATE "Flight" SET "flightType"='AERIAL_WORK' WHERE id IN (<2 voli, uno REGISTERED e uno CANCELLED se presente>)`, poi `migrate deploy` → quei due id sono `TOURISM`, `SELECT enum_range(NULL::"FlightType")` = `{TOURISM,SCHOOL}`; (3) `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --shadow-database-url <gemello> --script` = vuoto; (4) `npx prisma generate`. **`airmanager_load` NON si tocca** (epic 17): quando verrà migrato, l'`UPDATE` gestisce i suoi voli `AERIAL_WORK`.

### AD-2 — `SearchCombobox`: tre allargamenti opzionali, nessun call site esistente cambia

Tutti **opzionali** e retro-compatibili: i 5 call site di oggi non si toccano e si comportano identici (lo prova `typeahead-pickers.spec.ts` verde senza modifiche).

| | Prop | Contratto |
|---|---|---|
| (a) | `fetchOptions?` | **Modalità statica**: se assente, `runSearch` (`search-combobox.tsx:223-240`) si ferma dopo il filtro client di `initialOptions` — nessun `setTimeout`, nessuna rete. Il doc-comment di `initialOptions` (`:49-61`) e quello del componente (`:77-105`) dicono anche questo uso (liste complete e brevi, non solo «la prima pagina ≤100»). |
| (b) | `hint?: string` | **Stesso contratto di `Field.hint`** (`field.tsx:27-35`): `<span id={`${id}-hint`} className="fld-hint">` nello stesso slot dell'errore, `aria-describedby` sull'input che punta all'errore se c'è, altrimenti all'hint; un errore vince sempre. Nessun CSS nuovo (`.fld-hint` esiste, `airops.css:1219-1222`). |
| (c) | `SearchComboboxOption.disabled?: boolean` | La riga si rende `aria-disabled="true"` (resta navigabile con le frecce, come ammette il pattern WAI-ARIA, così uno screen reader legge il motivo nell'etichetta); **click** e **Enter** su di essa non selezionano: il valore resta quello di prima e il popup resta aperto; Enter con il popup aperto e l'opzione attiva disabilitata fa `preventDefault` (non invia il form). Stile: la regola esistente della riga vuota (`airops.css:1440` `.combo-option-empty{ cursor: default; color: var(--ink-3); }`) si estende col selettore `.combo-option[aria-disabled="true"]`, nessun colore nuovo; contrasto del testo misurato ≥ 4.5:1 nei due temi (è testo informativo: porta il motivo). |

In più, **AD-3** (Escape) tocca lo stesso file.

### AD-3 — Il primo Escape chiude solo il popup

Nel ramo `Escape && open` di `handleKeyDown` (`search-combobox.tsx:299-304`) si aggiunge `event.stopPropagation()`. Perché basta: nell'App Router React ascolta sul `document` (root di idratazione), e `SlideOver` ascolta in **bubble** su `window` (`slide-over.tsx:53-56`): fermare la propagazione al `document` impedisce che arrivi a `window`. Il listener del focus trap (`focus-trap.ts:169`, sul `document`, gestisce Tab) non è influenzato. **Non fidarsi del ragionamento**: lo prova l'e2e di AC 20 (rosso togliendo la riga, §4.3). Con il popup **chiuso** Escape resta del pannello (comportamento di oggi, regola globale R-15.10). `CLAUDE.md` riga 41 («e2e, `Escape` e i pannelli») va aggiornata **nello stesso commit**: anche il popup aperto di `SearchCombobox` consuma il primo Escape (dalla 19.5); la regola «mai Escape in un test per chiudere un picker» resta (a popup già chiuso chiuderebbe il pannello), con la premessa corretta.

### AD-4 — Primitiva `Toggle` (`src/components/ui/toggle.tsx`)

API (generica: la 19.6 la riuserà per «senza addebito», quindi nessun nome legato a doppio comando/solista):

```ts
export type ToggleProps = {
  /** Button id; also its `data-testid` and the base of the label id (`${id}-label`) — same contract as `SearchCombobox`'s `id`. */
  id: string;
  /** Visible field label AND the switch's accessible name (via `aria-labelledby`): stable across states. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible state text inside the button. */
  onText: string;
  offText: string;
};
```

Markup (forma): il componente possiede l'accoppiamento label ↔ controllo come il `SearchCombobox` (`search-combobox.tsx:42`: «this component owns that pairing so every call site gets it for free»):

```tsx
<div className="fld">
  <span id={`${id}-label`} className="fld-label">{label}</span>
  <button type="button" role="switch" id={id} data-testid={id} aria-checked={checked} aria-labelledby={`${id}-label`}
          className="toggle" onClick={() => onChange(!checked)}>
    <span className="toggle-track" aria-hidden="true"><span className="toggle-thumb" /></span>
    <span className="toggle-state">{checked ? onText : offText}</span>
  </button>
</div>
```

- `type="button"` **obbligatorio** (è dentro il `<form>` del volo: senza, un click o un Enter invierebbe il form).
- Nome accessibile = `label`, **identico nei due stati** (APG «switch»: l'etichetta non cambia con lo stato; lo stato lo dice `aria-checked`). Il testo di stato è visibile ma non entra nel nome (`aria-labelledby` sostituisce il contenuto nel calcolo del nome). WCAG 2.5.3 rispettato: il nome contiene il testo visibile della label.
- Tastiera: è un `<button>` nativo → Tab lo raggiunge, **Spazio** ed **Enter** lo commutano.
- Nessuna prop `disabled`/`wide` oggi (nessun consumer le usa: karpathy). La cella larga si ottiene come per il combobox: il call site avvolge in `<div className="fld wide">` (`flight-editor.tsx:979`).
- CSS in `airops.css` accanto a `.fld-hint` (`:1219-1222`), un blocco `.toggle*` con commento di story, **solo token esistenti**, nessuno stile inline, nessun `var(--…)` inline. Forma (non lettera, il dev misura e aggiusta):
  - `.toggle`: `display:flex; align-items:center; gap:12px; width:100%; min-height:44px` (a **tutte** le larghezze: «bottonone»), padding ~8px 12px, `font: inherit`, ~13.5px/500, `text-align:left`, `background: var(--panel-2)`, `border:1px solid var(--border)`, `border-radius: var(--radius-sm)`, `transition: background var(--t), border-color var(--t)`; `:hover` → `var(--bg-sunken)`.
  - Stato on `[aria-checked="true"]`: la stessa coppia di `.btn.on` (`airops.css:354`): `background: var(--accent-soft); border-color: var(--accent); color: var(--accent-ink); font-weight: 600`.
  - Binario ~36×20 raggio pieno: off `var(--ink-3)`, on `var(--accent-ink)`; pomello ~16px `var(--panel)`, `transform: translateX(...)` in on, `transition: transform var(--t)` (si anima **solo** `transform`).
  - `:focus-visible`: `outline: 2px solid var(--ink); outline-offset: 2px` (nessun focus ring globale esiste, tabella fatti).
  - `@media (prefers-reduced-motion: reduce)`: niente transizioni sul blocco.

### AD-5 — Form prenotazione: `Controller` di RHF, validazione invariata

I campi di scelta passano da `register('x')` a `<Controller name="x" control={control} render={({ field, fieldState }) => <SearchCombobox value={field.value} onChange={field.onChange} error={...} … />} />`. Lo schema `superRefine` (`new-booking-form.tsx:138-166`, `edit-booking-form.tsx:65-77`), i messaggi, il payload, `reset(DEFAULT_VALUES)` (`:255`, `:368`, `:417`) e `values: valuesFromBooking(booking)` (`edit-booking-form.tsx:131`) **non cambiano**: `Controller` li rispetta per costruzione. Il `SearchCombobox` riallinea l'etichetta quando il valore cambia dall'esterno (reset dopo il successo, cambio di prenotazione) col suo aggiustamento in render (`search-combobox.tsx:150-155`).

**Focus sul primo campo invalido**: il combobox non inoltra un `ref` all'input, quindi lo `shouldFocusError` di RHF salterebbe il velivolo e metterebbe il focus su «Inizio» (ordine sbagliato). Si usa il meccanismo già esistente della 14.2: `useForm({ …, shouldFocusError: false })` + `handleSubmit(onSubmit, () => setTimeout(() => focusFirstInvalid(formRef.current), 0))` (`src/lib/dom-focus.ts`, ordine DOM, legge `aria-invalid="true"`). Serve un `formRef` sui due `<form>`.

Id (sono anche i testid) — **distinti fra i due form**, montati insieme nella stessa pagina (`bookings-table.tsx:840`, `:853`): `booking-person`, `booking-aircraft`, `booking-instructor`, `booking-student` (nuova) e `move-booking-aircraft` (modifica, famiglia `move-booking-*`). Verificato: nessun testid esistente con questi nomi e nessun selettore `^=` che li intercetti (`grep -rn 'data-testid\^=' e2e/`). Label invariate: «Pilota o allievo», «Velivolo», «Istruttore (opzionale)», «Allievo».

Opzioni: persona/allievo `{ id, label: 'Cognome Nome' }` come oggi; velivolo `{ id, label, disabled: status === 'OUT_OF_SERVICE' }` con il suffisso di oggi; istruttore con la riga `{ id: '', label: labels.noInstructor }` in testa (come `flight-editor.tsx:523-526`), valore predefinito `''` → l'input mostra «Nessuno». Nessun `fetchOptions` (D-4). Il `Segmented` «Per me / Per un allievo» (`:495-512`) **resta** com'è: non è un menu.

### AD-6 — Form volo: il tipo esce da RHF e diventa un combobox statico

- `flightType` esce da `flightFormSchema`/`FlightFormValues` (`flight-editor.tsx:238-252`, `:258`, `:273`): non è mai stato inviato da RHF (il body usa `effectiveFlightType`, `:640`), resta stato semplice come i tre picker. Il valore iniziale si calcola dal target (`correctingFlight?.flightType ?? 'TOURISM'`); il blocco di commento `:330-342` resta vero (riscrivere solo «TOURISM/AERIAL_WORK» → «TOURISM» a `:333`). `isLocked`, `effectiveFlightType`, `showStudentOnlyCorrectionWarning` (`:451`, `:461`, `:469`) **identici**.
- Il campo (`:1005-1035`) diventa, dentro `<div className="fld">`:
  `SearchCombobox id="flight-type-select" label={labels.fields.flightType} value={effectiveFlightType} initialOptions={[{ id: 'TOURISM', label: private }, { id: 'SCHOOL', label: school }]} disabled={isLocked} hint={…stessa logica di :1007-1013…} emptyText={labels.picker.noResults}` con `onChange={(id) => { setSelectedFlightType(id as FlightTypeDto); if (id !== 'SCHOOL') setIsSolo(false); }}`.
  **Il testid `flight-type-select` non cambia** (`CLAUDE.md`: i testid dell'albero desktop non cambiano mai; 4 riferimenti e2e): il nome dice «select» ma è un combobox — si documenta in un commento di una riga.
- Il `fieldset` delle radio (`:1086-1100`) sparisce; al suo posto, **nella griglia subito dopo il campo tipo** (D-2): `{effectiveFlightType === 'SCHOOL' ? <div className="fld wide"><Toggle id="flight-solo-toggle" label={labels.fields.soloMode} checked={isSolo} onChange={setIsSolo} onText={labels.fields.soloModes.solo} offText={labels.fields.soloModes.dual} /></div> : null}`.
- Orfani creati e da togliere: import `Select` (`:26`), `flightTypeSchema` (`:34`) se resta senza uso, il ramo `AERIAL_WORK` di `flightTypeLabel` (`:471-475`), `other` dal tipo `FlightEditorLabels.flightTypes` (`:87`). Header del file (`:8`): «`FlightType` is TOURISM/SCHOOL + `isSolo`».
- Il form è **un solo albero** (desktop e pannello a tutto schermo ≤640px): i testid nuovi non prendono `-mobile`; `flight-solo-toggle` non è intercettato da nessun selettore `^=`.

---

## §2 — Acceptance Criteria

### Tipi di volo (P1)

1. **Schema e DB**: `enum FlightType { TOURISM SCHOOL }` (`schema.prisma:880-884`); doc-comment `:871-879` riscritto (due valori; istruttore ammesso su Turismo, A5) e quello di `Flight.isSolo` (`:958-965`) ancora vero. Sul DB migrato `SELECT enum_range(NULL::"FlightType")` = `{TOURISM,SCHOOL}`.
2. **Migrazione** (AD-1): una sola, forward; catena da zero verde; la **prova sui dati** riporta gli id rimappati da `AERIAL_WORK` a `TOURISM`; `migrate diff` vuoto; esiti verbatim nel record.
3. **API e contratto**: `flightTypeSchema` = `['TOURISM','SCHOOL']` (`flights.ts:9`, doc `:8`); `POST /api/v1/flights` e `POST /flights/{id}/correct` con `flightType: 'AERIAL_WORK'` → **422** `VALIDATION_ERROR`; `GET /api/v1/flights?flightType=AERIAL_WORK` → **422**, idem gli export xlsx/pdf dei voli con lo stesso parametro. L'OpenAPI servito (`GET /api/v1/openapi.json`) **non contiene** la stringa `AERIAL_WORK` (assert anche in `registry.test.ts` su `JSON.stringify(generateOpenApiDocument())`).
4. **Registro voli**: i filtri tipo, desktop (`logbook-console.tsx:688-695`) e pannello mobile (`:1115-1127`), hanno **tre** opzioni: «Tutti i tipi», «Turismo», «Scuola»; il badge tipo non ha più il ramo `warn` (`:754`); `FLIGHT_TYPES` = `['TOURISM','SCHOOL']` (`logbook/page.tsx:39`). Un URL a mano `?flightType=AERIAL_WORK` mostra il registro **non filtrato**, senza errori (scartato da `sanitizeFlightType`).
5. **Statistiche**: `movementMix` = esattamente `[{ key: 'SCHOOL' }, { key: 'TOURISM' }]` (`stats.service.ts:236-242`, commento «both keys»); `statsMovementMixKeySchema` = `['SCHOOL','TOURISM']` (`stats.ts:74-75`); la card «Composizione movimenti» mostra **due** bande e **due** pallini di legenda (`reports-console.tsx:12`, `:14-31` doc dei toni da tre a due, `reports/page.tsx:74-78`); `.flow-bar-muted` sparisce da `airops.css:782` e dal commento `:755-777` (la frase su `--ink-3`). `kpis.movements` resta la somma dei gruppi.
6. **Export**: xlsx e pdf del registro etichettano solo «Turismo»/«Scuola» (`exports.service.ts:212-219`, `:228`, `:573`).
7. **Seed**: `seed-load.ts:627-628` → `isSchool ? 'SCHOOL' : 'TOURISM'` (la riga `isAerialWork` sparisce: togliere un `chance()` sposta il flusso del PRNG `mulberry32` — il dataset resta deterministico versione per versione, cambia rispetto a quello di oggi come già con la 19.1; **non** eseguirlo, solo typecheck). `npx prisma db seed` e `npm run seed:demo` verdi su DB fresco (nessuno dei due usa `AERIAL_WORK` oggi: verificarlo).
8. **Nessun residuo** — tutti a **0 righe** (esclusi `src/generated/`, `prisma/migrations/`, `_bmad-output/`, `docs/`):
   - `grep -rnE "AERIAL_WORK|isAerialWork|Lavoro aereo|Aerial work|flow-bar-muted" src e2e messages scripts prisma/schema.prisma prisma/seed.ts prisma/seed-demo.ts prisma/seed-load.ts --exclude-dir=generated`
   - `grep -rn "flightTypes.other\|flightTypes\.other\|movementMix.keys.AERIAL" src e2e`
   - `grep -rn "name=\"flight-solo-mode\"\|type=\"radio\"" 'src/app/[locale]/dashboard/logbook/flight-editor.tsx'`

### Form volo — dropdown uniformi (P2)

9. **Tipo di volo è un combobox** (AD-6): `flight-type-select` è un `input[role="combobox"]` con label «Tipo di volo»; il popup ha **due** opzioni, «Turismo» e «Scuola»; il valore mostrato è l'etichetta (es. `toHaveValue('Scuola')`); predefinito «Turismo» su un volo nuovo; in correzione il valore è quello **registrato**. **Invarianti 14.3 conservati**: registrazione nuova per una persona solo-allievo → campo `disabled` con valore «Scuola» e hint «Allievo senza brevetto…» collegato (`aria-describedby` dell'input = id dell'hint); in correzione **mai** disabilitato, e con persona solo-allievo su un volo Turismo compare l'hint di correzione col tipo registrato (testo nuovo, §3.8). Tastiera: focus → popup in modalità sfoglia; ↓ ↑ Invio selezionano; nessuna richiesta di rete digitando nel campo tipo.
10. **Uniformità misurata**: dentro `[data-testid="flight-form"]` ci sono **4** `[role="combobox"]` (velivolo, pilota/allievo, istruttore, tipo) e **0** `select` e **0** `input[type="radio"]`, in nuova voce e in correzione, a 1280 e a 375; i quattro campi hanno la stessa struttura (`.fld` › `.fld-label` + `.input`) e lo stesso popup (`.combo-listbox`).
11. **Panoramica**: «Pianifica volo» (`dispatch-flight-button.tsx`, label duplicate in `dashboard/page.tsx:770-830`) apre lo stesso form con gli stessi testi (stessa label «Volo solista», stessi due tipi) — controllo di fumo a 1280 (le label sono costruite due volte: una chiave dimenticata si vedrebbe come percorso grezzo).

### Bottone doppio comando / solista (P4, P5)

12. **Primitiva** (AD-4): `src/components/ui/toggle.tsx` esporta `Toggle` con l'API di AD-4; nessun altro file la duplica; CSS in `airops.css` con commento di story, solo token esistenti, nessuno stile inline.
13. **Semantica**: nel form volo, su Scuola, `getByRole('switch', { name: 'Volo solista', exact: true })` esiste (testid `flight-solo-toggle`) con `aria-checked="false"` e testo visibile «Doppio comando»; un click → `aria-checked="true"` e testo «Solista»; il **nome accessibile è identico nei due stati**; il form **non** viene inviato dal click né dall'Enter sul bottone. Il valore inviato `isSolo` è uguale ad `aria-checked`.
14. **Solo su Scuola** (A19): su Turismo il bottone non è nel DOM; passare da Scuola-solista a Turismo lo toglie **e** azzera `isSolo` (invariato `:1027`); tornare a Scuola lo ripresenta spento. Con persona solo-allievo (tipo bloccato su Scuola) il bottone c'è e funziona. In correzione di un volo Scuola solista registrato il bottone parte **acceso**.
15. **Accessibilità** (verificata e riportata nel record): (a) Tab lo raggiunge **dopo** «Tipo di volo» e **prima** di «Partenza»; **Spazio** e **Invio** lo commutano; (b) indicatore di focus visibile **solo** da tastiera (`:focus-visible`), contrasto dell'anello ≥ 3:1 sul fondo adiacente nei due temi; (c) testo di stato ≥ 4.5:1 sul suo fondo, in on e off, in chiaro e scuro; binario e pomello ≥ 3:1 sui colori adiacenti (WCAG 1.4.11), in on e off, nei due temi; (d) altezza del bottone **≥ 44px a 375 e a 1280**, larghezza = intera cella, nessun overflow orizzontale a 375 (`scrollWidth ≤ innerWidth`); (e) con `prefers-reduced-motion: reduce` nessuna transizione (verificato con `emulateMedia`); (f) a 375 `flight-solo-toggle` ha **un solo** nodo (albero unico).
16. **Registrazione da UI**: un volo Scuola registrato col bottone acceso ha `isSolo: true` in `GET /api/v1/flights` e la cella PIC mostra l'**allievo** (`flightPicPerson`, `flight-pic.ts:26-29`); spento → `isSolo: false`, PIC = istruttore (asserzione esistente `flights.spec.ts:313`; il gemello via API del solista è `:539-558`).

### Form prenotazione (P3)

17. **Uniformità misurata**: in `[data-testid="new-booking-form"]` **0** `select` in tutte e tre le modalità — staff: 3 combobox (`booking-person`, `booking-aircraft`, `booking-instructor`); pilota: 1 (`booking-aircraft`); istruttore «Per un allievo»: 2 (`booking-aircraft`, `booking-student`); in `[data-testid="move-booking-form"]` 0 `select`, 1 combobox (`move-booking-aircraft`). Label invariate; payload `POST`/`PATCH` byte-identico a oggi per gli stessi valori scelti.
18. **Velivolo fuori servizio** (D-5): l'opzione mostra «MARCHE — motivo (fuori servizio)», ha `aria-disabled="true"`; cliccarla non cambia il valore (l'input, lasciato il campo, torna vuoto o al valore precedente); Invio su di essa non seleziona e non invia il form. Il 422 `AIRCRAFT_OUT_OF_SERVICE` e i suoi messaggi (anche con la data, AOG-1a) restano invariati per il velivolo messo fuori servizio **dopo** l'apertura del form.
19. **Validazione e focus** (AD-5): invio a vuoto → «Campo obbligatorio.» sotto ogni campo obbligatorio vuoto (`.fld-error`, `aria-invalid="true"`), focus sul **primo campo invalido in ordine DOM** (staff: `booking-person`; pilota: `booking-aircraft`); la scelta di un'opzione toglie l'errore di quel campo. Dopo il successo (`reset`) e alla chiusura i combobox del form nuovo sono vuoti (istruttore su «Nessuno»); la modifica si riallinea a un'altra prenotazione senza chiudere il pannello.
20. **Escape** (AD-3, D-6): nel form prenotazione nuova e nel form volo, con un popup aperto, il **primo Escape** chiude solo il popup (`.combo-listbox` 0, `.slideover.open` 1, valore invariato); il **secondo** chiude il pannello. Il dev riporta nel record il comportamento del `<select>` nativo aperto **sul baseline**, prima del cambio.
21. **Modalità statica senza rete** (D-3, D-4): un **pilota** apre «Nuova prenotazione», digita le marche nel velivolo, sceglie l'opzione e completa la prenotazione (201): durante tutto il flusso **0** richieste a `/api/v1/aircraft` e `/api/v1/people`, e l'opzione filtrata **non** sparisce dopo il debounce (prova funzionale: un `fetchOptions` di rete darebbe 403 → «Nessun risultato» dopo 250 ms).
22. **Nome accessibile pulito**: `form.getByLabel('Allievo', { exact: true })` risolve l'input dell'allievo (oggi impossibile, `bookings.spec.ts:588-595`); il commento e il locator `select[name="studentId"]` di quel test spariscono.

### `SearchCombobox` (AD-2, AD-3)

23. **Retro-compatibilità**: i 5 call site esistenti non cambiano una riga; `typeahead-pickers.spec.ts` (TD-3, 14.1) verde **senza modifiche** ai test esistenti.
24. **Contratto nuovo** coperto da e2e: (a) modalità statica (AC 21); (b) `hint` collegato (AC 9); (c) opzione disabilitata (AC 18); (d) Escape (AC 20). Le opzioni disabilitate rispettano i 44px sotto i 640px (R-15.10-d).

### i18n, contratti, gate

25. **i18n**: le 4 chiavi di §3.8 assenti da **entrambi** i file, le 2 nuove presenti in entrambi, i 2 testi cambiati; parità it/en **0/0** (`diff <(jq -r '[paths(scalars)|map(tostring)|join(".")]|.[]' messages/it.json | sort) <(jq -r '…' messages/en.json | sort)` vuoto) e conteggio chiavi nel record. `studentOnlyCorrectionHint` resta letto con `t.raw` (placeholder `{type}`).
26. **Unit**: `stats.service.test.ts:121-147` senza la riga `AERIAL_WORK` (movements 5, minuti 270, mix a due chiavi); nuovi: `flightTypeSchema` rifiuta `'AERIAL_WORK'`; `listFlightsQuerySchema` rifiuta `flightType=AERIAL_WORK`; `statsMovementMixKeySchema.options` = `['SCHOOL','TOURISM']`; `registry.test.ts` senza `AERIAL_WORK` nel documento. L'unit A5 `flights.service.test.ts:1160` (istruttore ammesso su Turismo) resta verde.
27. **Documenti**: una riga **FR-14** nel change record del PRD (`prds/prd-AirManager-2026-07-04/prd.md`, tabella «Change record — CR PO 2026-11-01»): «Tipo volo: Turismo o Scuola (Lavoro aereo eliminato); doppio comando/solista solo sui voli Scuola». `CLAUDE.md` riga 41 aggiornata (AD-3).
28. **Gate**: `npm run gates` verde (lint senza warning nuovi — `Controller` non è `watch()`, ma va verificato col linter del React Compiler —, typecheck, vitest, build); e2e mirati verdi via `scripts/e2e.sh start <spec…>` (§4.2); l'arbitro full-suite su DB fresco lo esegue la sessione principale.
29. **Verifica UI interattiva** (Playwright MCP, o script throwaway in `/tmp` con `playwright-core` dove l'MCP manca — v. `CLAUDE.md`/HANDOFF), screenshot a **1280** e **375** di: form volo nuovo (Turismo, senza bottone); Scuola con bottone spento e acceso — **in chiaro e in scuro**; bottone col focus da tastiera (chiaro e scuro); tipo bloccato per allievo (hint); popup «Tipo di volo» aperto; correzione di un volo Scuola solista; form prenotazione staff col popup velivolo aperto su un'opzione fuori servizio; form prenotazione pilota e istruttore «Per un allievo» (375); modifica prenotazione; «Composizione movimenti» a due bande; «Pianifica volo» dalla Panoramica (1280). Nessun overflow orizzontale, `.so-foot`/`.so-actions` invariati.

---

## §3 — Dev Notes: blast radius (misurato su `3876e72`; rieseguire i comandi dopo 19.2-19.4)

### 3.1 — Schema e migrazione
- `prisma/schema.prisma:871-884` (doc + enum), `:957` (colonna), `:958-965` (doc `isSolo`, deve restare vero).
- Migrazioni d'origine (storiche, immutabili): `20260707150000_add_flights`, `20260710120000_rename_flight_types_add_solo_flag` (`OTHER → AERIAL_WORK`). Precedente di forma: `20260729144406_remove_staff_role`.

### 3.2 — Server e contratti
- `src/lib/schemas/flights.ts:8-9`; `src/lib/schemas/stats.ts:74-75`.
- `src/server/services/stats.service.ts:235-242` (commento + `movementMix`).
- `src/server/services/exports.service.ts:212-219` (`flightTypeLabel` a due rami), `:228`, `:573`.
- `src/lib/schemas/registry.ts`: nessuna modifica manuale attesa (gli enum arrivano da Zod); `registry.test.ts` + asserzione di AC 3.

### 3.3 — UI: tipi di volo
| File | Righe | Cosa |
|---|---|---|
| `logbook/flight-editor.tsx` | `:8`, `:87`, `:333`, `:471-475`, `:1031-1033` | due tipi |
| `logbook/logbook-console.tsx` | `:100` (tipo label), `:219-223` (`flightTypeLabel`), `:692-694`, `:754`, `:1124-1126` | filtri e badge |
| `logbook/page.tsx` | `:39`, `:265`, `:349` | costanti e label |
| `dashboard/page.tsx` | `:807` | label del `FlightEditor` duplicate |
| `reports/page.tsx` | `:74-78` | label della serie |
| `reports/reports-console.tsx` | `:12`, `:14-31` | `MixKey`, toni |
| `src/styles/airops.css` | `:755-777` (commento), `:782` | via `.flow-bar-muted` |

### 3.4 — UI: dropdown, bottone, primitive
| File | Righe | Cosa |
|---|---|---|
| `src/components/search-combobox.tsx` | `:33-37` (opzione), `:39-68` (props), `:49-61`, `:77-105` (doc), `:223-240` (`runSearch`), `:242-249`, `:289-298` (Enter), `:299-304` (Escape), `:358-362` (slot errore/hint), `:402-421` (righe) | AD-2, AD-3 |
| `src/components/ui/toggle.tsx` | nuovo | AD-4 |
| `src/styles/airops.css` | dopo `:1219-1222` (`.toggle*`), `:1440` (selettore disabilitato) | AD-2(c), AD-4 |
| `logbook/flight-editor.tsx` | `:26`, `:34`, `:70-71` (label invariate), `:238-252`, `:254-284`, `:342-346`, `:1005-1035`, `:1086-1100` | AD-6 |
| `bookings/new-booking-form.tsx` | `:3-13` (import `Controller`, `useRef`, `SearchCombobox`, `focusFirstInvalid`; via `Select`), `:31-34` (label: `selectPlaceholder` → `picker`), `:181-203` (doc: «`Field`/`Input`/`Select`»), `:240-245`, `:428`, `:430-468`, `:514-526` | AD-5 |
| `bookings/edit-booking-form.tsx` | `:9`, `:15-21`, `:105-122` (doc), `:127-131`, `:212-225` | AD-5 |
| `bookings/booking-labels.ts` | `:104`, `:155` | `picker: { placeholder, noResults }` |

### 3.5 — Il resto del form volo non si tocca
Sezione «Forza registrazione» (`:1110-1166`) — è della 19.9; mappatura errori (`:665-777`); pannello di esito (`:879-951`); idempotenza. I tre picker esistenti (`:961-1004`) restano identici: cambia solo il loro vicino.

### 3.6 — Blast radius e2e (comandi: `grep -rn "AERIAL\|Lavoro aereo\|flow-bar-muted" e2e`; `grep -rn "flight-type-select\|Tipo di volo" e2e`; `grep -rn "selectOption\|select\[name=" e2e/bookings.spec.ts e2e/booking-window.spec.ts e2e/datetime-picker.spec.ts e2e/aircraft-out-of-service-until.spec.ts`)

**Tipi di volo** (15 righe in 5 spec + `mobile-reports`):
| Spec | Righe | Riformulazione |
|---|---|---|
| `flight-log.spec.ts` | `:161` (tipo), `:211` | `'TOURISM'` (il tipo del volo annullato è incidentale) |
| `flight-log.spec.ts` | `:319`, `:343-345`, `:357-358`, `:362` | il volo di personB diventa `TOURISM`; il passo combinato prova la **discriminanza** del filtro tipo: `selectOption('SCHOOL')` → `flight-row` **0**, poi `selectOption('TOURISM')` → 1 riga con «Turismo» (assert sul testo della cella, non `hasText` ambiguo); commenti allineati |
| `reports.spec.ts` | `:113`, `:148`, `:224-225` | via la riga del delta `AERIAL_WORK`; chiavi `['SCHOOL','TOURISM']` |
| `exports.spec.ts` | `:75` | tipo a due valori |
| `pdf-exports.spec.ts` | `:98` | idem |
| `mobile-logbook.spec.ts` | `:148` | idem |
| `mobile-reports.spec.ts` | `:517-520` | selettore senza `.flow-bar-muted`; `toBeGreaterThanOrEqual(4)` (2 bande + 2 pallini), commento «two» |

**Campo tipo del form volo** (6 righe, 3 spec): `flights.spec.ts:294` e `flight-reversal.spec.ts:188` → `selectFromCombobox(page.getByTestId('flight-form').getByLabel('Tipo di volo'), 'Scuola', 'Scuola')` (helper locale già presente in entrambi, `flights.spec.ts:31`, `flight-reversal.spec.ts:24`); `flights.spec.ts:594` `toHaveValue('Scuola')`, `:660`, `:682` `toHaveValue('Turismo')`; `mobile-logbook.spec.ts:1038` `'Turismo'`, `:1057` `'Scuola'`. `mobile-logbook.spec.ts:75` (`DESKTOP_SINGLETONS`) invariato: il testid resta e resta unico.

**Form prenotazione** (31 righe, 4 spec) — ogni `selectOption` sul velivolo/persona/allievo diventa una scelta sul combobox. Si **aggiunge** un `selectFromCombobox` esportato in `e2e/helpers.ts` (stesso corpo di `flights.spec.ts:31-39`: click, fill, opzione **scoped al listbox** con `exact: true`) per gli spec di questa lista che non ne hanno uno; le copie locali esistenti non si toccano (nessun refactor).
| Spec | Righe |
|---|---|
| `bookings.spec.ts` | `:460`, `:492`, `:499`, `:520-521`, `:546-553` (test dell'opzione disabilitata → AC 18: `aria-disabled` sull'opzione del listbox, click senza effetto), `:584`, `:588-596` (AC 22), `:625`, `:1143`, `:1161` (modifica), `:1216`, `:1222`, `:1461`, `:1492`, `:1527-1528`, `:1634`, `:2225-2226`, `:2233`, `:2258-2259` |
| `booking-window.spec.ts` | `:173`, `:177` (oggi per **valore** `pilot.personId` → per etichetta «Cognome Nome») |
| `datetime-picker.spec.ts` | `:135-136` |
| `aircraft-out-of-service-until.spec.ts` | `:290`, `:315`, `:326`, `:353` (oggi `select[name="aircraftId"]` per id, perché l'etichetta di un velivolo **già** fuori servizio porta il motivo: qui il velivolo è messo fuori servizio **dopo** l'apertura del form, quindi l'opzione resa ha le sole marche → `selectFromCombobox(form.getByLabel('Velivolo'), registration, registration)`; il commento `:281-283` va riscritto: «disabilitata» resta vero, «`<select>`» no) |

**Da rieseguire senza modifiche attese** (geometria/a11y dei pannelli): `mobile-planning.spec.ts:544-620`, `mobile-a11y-sweep.spec.ts:344-380`, `mobile-ink-targets.spec.ts:241-290`, `mobile-primitives.spec.ts`, `typeahead-pickers.spec.ts`, `home-dashboard.spec.ts`.

**Nuovi test** (dichiarare il delta all'arbitro):
- `flights.spec.ts` — volo Scuola **solista da UI** (AC 13, 14, 15a, 16): tipo «Scuola» dal combobox, `getByRole('switch', { name: 'Volo solista', exact: true })` spento con «Doppio comando», Tab dal campo tipo arriva al bottone, Spazio → acceso con «Solista», Turismo → bottone assente, di nuovo Scuola → spento, riacceso, registra → `isSolo: true` via API e PIC = allievo. Più la correzione di un Scuola solista creato via API (bottone acceso).
- `flights.spec.ts` o `api-v1.spec.ts` — `AERIAL_WORK` rifiutato (AC 3): `POST /flights` → 422, `GET /flights?flightType=AERIAL_WORK` → 422; pagina `/it/dashboard/logbook?flightType=AERIAL_WORK` → 200 e filtro tipo su «Tutti i tipi».
- `mobile-logbook.spec.ts` — a 375 (AC 15d/f): bottone ≥ 44px, dentro la viewport, un solo nodo, tap che commuta.
- `typeahead-pickers.spec.ts` (nuovo `describe` «story 19.5») — Escape nei due form (AC 20, unico punto in cui un test usa Escape su un picker: è il soggetto del test, come in 15.10); modalità statica del pilota (AC 21); focus sul primo invalido (AC 19).
- `bookings.spec.ts` — il test `:532` riscritto copre AC 18.

Nessuno spec nuovo muta AppSettings né asserisce aggregati globali: niente catena serializzata.

### 3.7 — Unit esistenti che cambiano
- `src/server/services/stats.service.test.ts:121-147` (AC 26).
- Nessun altro unit usa `AERIAL_WORK` (`grep -rn AERIAL src --include=*.test.ts` → solo quello). Nessun test di componente (`vitest` raccoglie solo `src/**/*.test.ts`): `Toggle` e `SearchCombobox` si verificano via e2e e verifica interattiva.
- **Env eager** (`CLAUDE.md`): nessun import nuovo verso mail/crypto; se un unit nuovo importa un service «grosso», mockare la catena e verificare con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`.

### 3.8 — Chiavi i18n (in **entrambi** `messages/it.json` e `messages/en.json`)
- **Rimosse (4)**: `FlightsPage.form.flightTypes.other` (`:1134`), `LogbookPage.flightTypes.other` (`:1278`), `ReportsPage.movementMix.keys.AERIAL_WORK` (`:2323`), `BookingsPage.form.selectPlaceholder` (`:1619`, orfana dopo AD-5: nessun altro consumer, verificato).
- **Nuove (2)**: `BookingsPage.form.picker.placeholder` («Cerca...» / «Search...»), `BookingsPage.form.picker.noResults` («Nessun risultato.» / «No matches.») — gli stessi testi di `LogbookPage.picker.*` (D-7).
- **Testo cambiato (2)**: `LogbookPage.editor.fields.soloMode` («Doppio comando o solista?» → **«Volo solista»** / «Dual or solo?» → **«Solo flight»**, D-1; `soloModes.dual`/`soloModes.solo` restano e diventano i testi di stato del bottone); `LogbookPage.editor.fields.studentOnlyCorrectionHint` (con due tipi l'unica modifica possibile è verso Scuola, la parentesi «tranne che verso Scuola» descrive opzioni che non esistono più) → «Questa persona ha oggi solo il profilo allievo. Il volo è registrato come {type}: puoi lasciarlo invariato o passarlo a Scuola.» / «This person currently has only a student profile. The flight is recorded as {type}: you can leave it unchanged or switch it to School.».
- Netto **−2** per file. Copy definitiva: **19.12** (glossario).
- ⚠️ `FlightsPage.form.soloMode`/`soloModes` (`:1136-1140`) sono **orfane preesistenti** (nessun consumer: `exports.service.ts` legge solo `form.flightTypes.*` e `list.table.*`): si segnalano nel record, non si cancellano (karpathy).

---

## §4 — Piano di test

### 4.1 — Unit
Come §3.7 + AC 26.

### 4.2 — e2e (project `chromium` `fullyParallel`, fixture run-unique; via `scripts/e2e.sh`)
Mirati prima della consegna: `flights`, `flight-reversal`, `flight-log`, `mobile-logbook`, `bookings`, `booking-window`, `datetime-picker`, `aircraft-out-of-service-until`, `typeahead-pickers`, `reports`, `mobile-reports`, `exports`, `pdf-exports`, `home-dashboard`, `mobile-planning`, `mobile-a11y-sweep`, `mobile-ink-targets`, `mobile-primitives` + `registry` via vitest. Una **serie** di run: build una volta (`env -u NODE_ENV npm run build && npm run start &`) e poi `E2E_REUSE_SERVER=1 scripts/e2e.sh start …` (`CLAUDE.md`); `scripts/e2e.sh status` è l'unico modo di leggere l'esito. Run ripetuti sullo stesso DB: occhio al lock anti-brute-force (TD-6, query in `CLAUDE.md`).

### 4.3 — Discriminanza (obbligatoria nel record, ogni prova con ripristino byte-identico e sha256 del file prima/dopo)
1. **Migrazione**: togliere l'`UPDATE` → `migrate deploy` sul gemello popolato fallisce con `invalid input value for enum "FlightType_new": "AERIAL_WORK"`; ripristino → verde.
2. **Escape** (AD-3): togliere `event.stopPropagation()` → l'e2e di AC 20 **rosso** (`.slideover.open` 0 dopo il primo Escape).
3. **Opzione disabilitata**: togliere il controllo `disabled` dal click → l'e2e di AC 18 **rosso** (l'input prende l'etichetta del velivolo fuori servizio).
4. **Toggle**: rendere `aria-checked` costante `false` → l'e2e di AC 13 **rosso**; togliere `aria-labelledby` → la ricerca per nome `Volo solista` **rossa**.
5. **Modalità statica**: passare al combobox velivolo della prenotazione un `fetchOptions` che chiama `/api/v1/aircraft` → l'e2e di AC 21 **rosso** (403 per il pilota, opzione sparita).

### 4.4 — Gate
`npm run gates` (mai i quattro comandi verbosi separati) + grep di AC 8 + parità i18n di AC 25 + e2e mirati. **Prima** di gates/build/e2e: `scripts/e2e.sh status` e `ss -ltnp | grep :3000` — mai una build sotto un arbitro vivo o sotto un reviewer che usa `:3000` (incidente AOG-1b, HANDOFF).

---

## §5 — Trappole note

1. **Il valore DOM di un combobox è l'etichetta**, non l'id: `toHaveValue('SCHOOL')` diventa `toHaveValue('Scuola')`. Gli id viaggiano solo nel payload.
2. **`getByLabel` è substring e case-insensitive** (`CLAUDE.md`): `'Allievo'` matcha anche «Pilota o allievo» → sempre `{ exact: true }` dove un'altra label contiene la parola; il popup del combobox non ha `aria-label` apposta (`search-combobox.tsx:368-375`), non aggiungerne.
3. **Mai `Escape` in un test per chiudere un picker**, salvo il test di AC 20 che lo ha come soggetto: si chiude il popup riempiendo il campo successivo.
4. **Due form montati insieme** nella pagina prenotazioni: id/testid distinti (`booking-aircraft` ≠ `move-booking-aircraft`), altrimenti strict mode e `htmlFor` duplicati.
5. **RHF**: `Controller` sì, `watch()` no (il React Compiler lo segnala, `new-booking-form.tsx:128-132`); `shouldFocusError: false` + `focusFirstInvalid`, altrimenti il focus salta il combobox (AD-5). Il ramo invalido di `handleSubmit` è il secondo argomento.
6. **`type="button"` sul `Toggle`**: dentro il `<form>` del volo un `<button>` senza tipo è un submit.
7. **Testid `flight-type-select`**: non rinominarlo (regola dei testid desktop); è l'`id` del combobox, quindi anche la base di `flight-type-select-listbox`.
8. **Migrazione**: `UPDATE` **prima** del cast e dentro la stessa transazione; gemello, mai `airmanager` con l'arbitro vivo; **mai** `docker compose down -v` (distrugge `airmanager_load`); `npx prisma generate` dopo lo schema (il tipo `FlightType` generato a due valori fa emergere in typecheck ogni confronto con `'AERIAL_WORK'` dimenticato: usarlo come censimento).
9. **`seed-load.ts`**: togliere `chance(0.15)` sposta il PRNG — atteso, documentarlo; non eseguirlo.
10. **Hydration** della pagina prenotazioni negli e2e: usare `gotoBookingsAndWaitForHydration` (`bookings.spec.ts:50-53`) dove già si usa; un combobox controllato non cambia la ragione di quell'attesa.
11. **Stack di righe che slittano**: 19.2 toglie ~40 righe da `flight-editor.tsx` e riscrive il test F1/F2; 19.3 cambia le fixture tariffe. Rifare i censimenti.
12. **`.flow-bar-*` e contrasto**: togliere `.flow-bar-muted` non deve toccare `.flow-bar-in/.flow-bar-accent` (condivise da `RankBars`, `reports-console.tsx:248-264`, e dal billing, `billing-console.tsx:1125`).

---

## §6 — Fuori scope DICHIARATO

- **Filtri del registro voli**: restano `<select>` nativi (decisione utente 2026-07-21, D-8); perdono solo «Lavoro aereo».
- **Altre checkbox dell'app** (profili nell'editor pilota, override della quota in Scadenze, `blocksBooking` dei ratings): non si toccano. La **19.6** aggiungerà il toggle «senza addebito» **riusando `Toggle`** (eventuali prop `disabled`/hint le aggiunge lei, se le servono); la 19.9 riscrive la sezione «Forza registrazione» e la 16.6b/19.9 l'override della quota.
- **Ricerca server nei picker delle prenotazioni** e il tetto di 100 persone del picker staff (D-4); chi è prenotabile e gli istruttori nelle auto-prenotazioni: **19.10** (R-19-l).
- Una chevron/freccia sul `SearchCombobox`; una variante non digitabile per liste brevi (D-3, D-8).
- Contatori iniziale/finale e note del volo: **19.2**. Prezzo per profilo: **19.3**. Volo senza addebito e cancellazione definitiva: **19.6**. Check con deroga: **19.9/19.10**.
- Revisione delle copy nuove: **19.12**. Migrare/ri-seminare `airmanager_load`: epic 17.
- Orfani preesistenti non creati da questa story (`FlightsPage.form.soloMode*`): si segnalano, non si cancellano.

---

## §7 — Riferimenti

- CR: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` (§4.0, §4.2 riga 19.5, §4.5, §4.10 A5/A15/A18/A19).
- PRD: `_bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md` (FR-14 `:172-173`; change record CR 2026-11-01 `:399-420` — riga FR-14 da aggiungere, AC 27).
- Epics: `_bmad-output/planning-artifacts/epics.md:917`.
- Precedenti: `td-3-typeahead-pickers.md`, `14-1-controlli-form-typeahead-date.md`, `14-2-validazione-form-per-campo.md`, `14-3-regole-voli-scuola.md`, `14-7-*`, `aog-1-velivolo-fuori-servizio.md`, `aog-1a-campo-guardia-volo.md`, `15-10-*`, `14-9-rimozione-ruolo-staff.md` (enum ricreato + catena su DB gemello), `19-2-via-codice-fiscale-campi-velivolo-contaore.md` (modello di sweep).
- `CLAUDE.md` (convenzioni e2e, gates, env eager, manutenzione del file); `docs/handoffs/HANDOFF.md` (ambiente, reset DB, arbitro).

---

## Tasks / Subtasks

- [ ] **T0 — Riallineamento** (AC tutti): `git log --oneline -6` (19.2, 19.3, 19.4 committate), `scripts/e2e.sh status`, `:3000` libero; rieseguire i comandi di §3.6 e i grep di AC 8; annotare gli scostamenti di riga. Verificare **sul baseline** il comportamento di Escape col `<select>` nativo aperto del form prenotazione (D-6) e riportarlo.
- [ ] **T1 — Schema e migrazione** (AC 1, 2): enum + doc-comment; migrazione AD-1; prova sui dati sul gemello; `migrate diff` vuoto; `npx prisma generate`.
- [ ] **T2 — Contratti e server** (AC 3, 5, 6): `flights.ts`, `stats.ts`, `stats.service.ts`, `exports.service.ts`; `registry.test.ts`.
- [ ] **T3 — `SearchCombobox`** (AC 20, 21, 23, 24): AD-2 (a)(b)(c), AD-3; doc-comment; CSS dell'opzione disabilitata.
- [ ] **T4 — `Toggle`** (AC 12, 15): `ui/toggle.tsx` + blocco `.toggle*` in `airops.css`; misure di contrasto e focus nei due temi.
- [ ] **T5 — Form volo** (AC 9, 10, 11, 13, 14, 16): AD-6; label in `logbook/page.tsx` e `dashboard/page.tsx` (via `other`).
- [ ] **T6 — Registro e statistiche** (AC 4, 5): `logbook-console.tsx`, `logbook/page.tsx`, `reports/*`, `.flow-bar-muted`.
- [ ] **T7 — Form prenotazione** (AC 17, 18, 19, 22): AD-5 su `new-booking-form.tsx`, `edit-booking-form.tsx`, `booking-labels.ts`.
- [ ] **T8 — i18n** (AC 25): §3.8 su entrambi i file; parità misurata.
- [ ] **T9 — Seed** (AC 7): `seed-load.ts` (solo typecheck); `db seed` + `seed:demo` su DB fresco.
- [ ] **T10 — Unit** (AC 26).
- [ ] **T11 — e2e** (AC 3, 4, 9, 13-22): §3.6 (riformulazioni + nuovi test); helper `selectFromCombobox` in `e2e/helpers.ts`.
- [ ] **T12 — Documenti** (AC 27): riga FR-14 nel PRD; `CLAUDE.md` riga 41 (AD-3); se le modifiche agli spec fanno slittare le righe `^=` citate in `CLAUDE.md`, aggiornarle nello stesso commit.
- [ ] **T13 — Verifica** (AC 8, 28, 29): grep a zero, OpenAPI servito, `npm run gates`, e2e mirati via `scripts/e2e.sh`, prove di discriminanza §4.3, screenshot 1280/375; Dev Agent Record compilato (righe effettive, conteggi test prima/dopo, delta e2e per l'arbitro).

---

## Dev Agent Record

### Agent Model Used

### §A — Riallineamento sul HEAD (T0) e comportamento Escape sul baseline

### §B — Riepilogo per AC con le prove

### §C — Migrazione: catena, prova sui dati, `migrate diff`

### §D — Discriminanza (§4.3) con sha256

### §E — Grep di AC 8 e parità i18n (verbatim)

### §F — Delta test (unit ed e2e, prima/dopo)

### §G — Deviazioni motivate

### §H — Verifica UI (screenshot, misure di contrasto e di geometria)

### §I — Gate ed esiti verbatim

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created (story writer, 2026-11-01, ricognizione su `3876e72`).

### File List
