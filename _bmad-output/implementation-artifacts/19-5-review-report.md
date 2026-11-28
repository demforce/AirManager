# Review adversarial — Story 19.5 «Form volo: due tipi, dropdown uniformi, bottone doppio comando/solista»

- **Reviewer**: `review-19-5` (Claude Opus 5.5, adversarial, unico layer adversarial) — 2026-11-02
- **Commit sotto review**: `b28e000` (feat) + `ca10919` (docs), baseline `a5fe9a6`
- **Contratto**: story file `19-5-form-volo-tipi-dropdown-toggle.md` (29 AC, §0.3 D-1..D-8, AD-1..AD-6), CR `sprint-change-proposal-2026-11-01.md` (punto PO 10, A5, A15, A18, A19), `CLAUDE.md`, `karpathy-guidelines`, metodo `bmad-code-review` (Blind Hunter + Edge Case Hunter + Acceptance Auditor, triage patch/decision/defer/dismiss)

## Verdetto

**FIXES-REQUIRED — non chiudibile così com'è.**

- **F1 (HIGH, bloccante)**: l'arbitro full-suite su DB fresco è **ROSSO** (`E2E_EXIT=1`). Il test e2e nuovo della story `typeahead-pickers.spec.ts:334` fallisce in modo deterministico (3/3 nell'arbitro + 1/1 isolato sullo stesso DB) e, siccome il project `chromium` fallisce, la catena serializzata (40 test) **non è girata**. Il prodotto è corretto (201, prenotazione creata): è il test che usa l'identità condivisa del pilota di seed.
- **F2 (MEDIUM)**: AC 14 violato sul percorso del lucchetto allievo: `isSolo` resta `true` dopo che il tipo torna a Turismo per un cambio di persona → POST `{TOURISM, isSolo:true}` → 422 `SOLO_REQUIRES_SCHOOL` senza alcun controllo visibile per rimediare; tornando a Scuola il bottone riappare **acceso**.
- **F3 (MEDIUM)**: Invio su un combobox già compilato e rifocalizzato sostituisce il valore con la prima opzione (o quella sotto il puntatore): comportamento TD-3 preesistente, ma la story lo estende a 6 campi che prima erano `<select>` nativi immuni (fra cui «Tipo di volo» e la persona della prenotazione staff).
- **F4 (MEDIUM, decisione)**: click su un combobox già focalizzato non riapre il popup (TD 19.5-a dichiarato, ma su 6 campi ex `<select>` è una regressione d'uso misurabile).

Tutto il resto del contratto è verificato corretto empiricamente (migrazione su gemello, API/OpenAPI, residui, SearchCombobox esteso, Escape, Toggle a11y con contrasti riprodotti al centesimo, form prenotazione, RBAC per ruolo, gates verdi, catena serializzata 40/40 rieseguita a parte).

---

## Arbitro (priorità zero)

**Pre-condizioni** (verificate prima del lancio): `ss -ltnp | grep :3000` vuoto; `scripts/e2e.sh status` = run precedente DONE (non RUNNING); DB `airmanager` fresco: `Flight` 0 righe, `LoginAttempt` 0, ultima migrazione applicata `20261102120000_flight_type_two_values`.

**Lancio**: `export JOBS_SECRET=local-e2e-secret-0123456789abcdef CI=1 && scripts/e2e.sh start` (full suite, build di produzione dentro il run). Pollato solo con `scripts/e2e.sh status`.

**Esito verbatim** (log completo conservato in `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/arbiter-full.log`):

```
  1 failed
    [chromium] › e2e/typeahead-pickers.spec.ts:334:7 › SearchCombobox in the booking forms: static mode, Escape, focus (story 19.5, AC 19/20/21) › a pilot books through the static velivolo combobox: focus on the first invalid field, the filtered option survives the debounce, 201, ZERO calls to the aircraft/people search APIs, the picker empty again after the success (AC 19/21)
  1 flaky
    [chromium] › e2e/flights.spec.ts:987:7 › Flight registry guards: no duplicate, no overlap (Story 16.2) › E3: two identical POSTs in parallel produce exactly one 201 and one 409 (never two 201)
  40 did not run
  490 passed (12.2m)
=== e2e end: 2026-11-02T05:01:28+01:00 ===
E2E_EXIT=1
```

**Conteggio**: 490 + 1 + 1 + 40 = **532** = delta dichiarato (525 → 532). Il totale torna; l'esito no.

### Diagnosi dei non-verdi

1. **`typeahead-pickers.spec.ts:334` — FAILED 3/3 (story 19.5, deterministico)** → F1 sotto. Errore identico ai tre tentativi:
   ```
   Error: expect(locator).toBeVisible() failed
   Locator: getByTestId('booking-form-success')
   Expected: visible
   Error: element(s) not found
     379 |     expect((await created).status()).toBe(201);
   > 380 |     await expect(page.getByTestId('booking-form-success')).toBeVisible();
   ```
   La POST era **201** (la riga 379 passa). Lo snapshot della pagina (`error-context.md` del tentativo 1) mostrava invece il banner di successo-con-avvisi:
   ```
   - status:
     - paragraph: "Prenotazione creata. Attenzione: i seguenti documenti risultano scaduti (non bloccanti):"
     - list:
       - listitem: Tipo dashboard 1793591584685-goy5rr
       - listitem: TipoSelf 1793591777635-4isl97
       - listitem: TipoAC10 1793591784663-rurfy8
   ```
   Riprova sul DB: il pilota di seed aveva accumulato scadenze **non bloccanti** create da altri spec, tutte con scadenza prima del giorno prenotato dal test (2031-03-12), e le tre prenotazioni dei tre tentativi sono state create davvero:
   ```
   $ psql … Expiry ⋈ ExpiryType ⋈ User WHERE email='pilot@airmanager.local'
   Tipo dashboard 1793591584685-goy5rr|f|2026-12-02|…     (expiry-dashboard.spec.ts:40)
   TipoSelf 1793591777635-4isl97|f|2026-11-27|…           (mobile-expiries-movements.spec.ts:399)
   TipoAC10 1793591784663-rurfy8|f|2026-12-17|…           (mobile-expiries-movements.spec.ts:541)
   $ psql … Booking WHERE pilota di seed AND startsAt::date = 2031-03-12
   PENDING|2031-03-12 08:00:00|I-TB1793592058755-PR
   PENDING|2031-03-12 08:00:00|I-TB1793592068638-5G
   PENDING|2031-03-12 08:00:00|I-TB1793592080384-DV
   ```
   Rieseguito **isolato** sullo stesso DB (server riusato, `--retries=0`, una sola esecuzione diagnostica, non un rilancio della suite): **failed** con la stessa riga 380 → deterministico appena quei due spec sono passati prima (in full suite girano prima per costruzione: `e…`, `m…` < `t…`). La serie del dev (16 spec) non includeva né `expiry-dashboard` né `mobile-expiries-movements`: per questo era verde lì.
2. **`flights.spec.ts:987` E3 — FLAKY** (✘ tentativo 1, ✘ retry #1, ✓ retry #2): `[422, 422]` invece di `[201, 409]` = classe nota **TD 16.2-g** (un `ExpiryType` globale bloccante creato da un altro spec durante la finestra fra `ensureValidSeedExpiries` e la POST). Correlazione SQL: i tre tipi globali bloccanti del describe 14.4 («Tipo voli …», oggi `isActive=false`) sono nati a 02:53:45 / :50 / :53 (UTC), e gli aerei `I-FL…` creati senza alcun volo (= le fixture dei tentativi E3 respinti) a 02:53:35 / :38 / :50 / :50 / :53 — stessa finestra. Codice voli non toccato dalla 19.5 oltre al tipo; nessuna relazione con la story.
3. **40 did not run**: la catena serializzata (`settings` → … → `aog-overview-count`) dipende dal project `chromium`, che fallisce per F1. **Verifica supplementare** (dopo l'arbitro, server di produzione riusato dalla stessa build, `E2E_REUSE_SERVER=1 … --project=settings … --project=aog-overview-count --no-deps --workers=1`): **`40 passed (1.9m)`, `E2E_EXIT=0`** (log: scratchpad `chain-40.log`). Quindi 490 + 40 = 530 test sono verdi; mancano il test di F1 (rosso) ed E3 (flaky noto).

Nessun fallimento delle classi «login a 5 s», «pagina 1 delle liste», «picker cappati a 100», «METAR skippati», lock TD-6 in questo run.

---

## Finding

### F1 — HIGH (patch, bloccante) — il test e2e nuovo usa l'identità condivisa del pilota di seed e fallisce in full suite

- **Dove**: `e2e/typeahead-pickers.spec.ts:334-384` (login come `PILOT_EMAIL` a `:342`, data fissa a `:375-376`, asserzione a `:380`).
- **Causa**: il test prenota come `pilot@airmanager.local` (identità condivisa, il commento a `:340-341` lo ammette) per il 2031-03-12; qualunque scadenza **non bloccante** che altri spec registrano a quella persona con data < 2031-03-12 trasforma l'esito in `booking-form-warning` (`new-booking-form.tsx:693`) invece di `booking-form-success` (`:683`). Il prodotto si comporta come da story 7.4.
- **Effetto**: arbitro `E2E_EXIT=1`, catena serializzata saltata; AC 19 (reset dopo il successo) e AC 21 (zero chiamate di ricerca — `expect(searchCalls)` a `:383` non viene mai raggiunta) restano **senza prova verde** nella suite.
- **Riproduzione**: arbitro sopra; isolato: `E2E_REUSE_SERVER=1 CI=1 scripts/e2e.sh start e2e/typeahead-pickers.spec.ts:334 --retries=0` su un DB dove `expiry-dashboard`/`mobile-expiries-movements` sono già passati.
- **Fix suggerito**: pilota run-unique con login, come la regola della story 16.3 già applicata in `bookings.spec.ts:450-456` («a run-unique pilot, never the seed one»), spostando nel file un helper tipo `createPilotWithLogin`; in alternativa minima, accettare entrambi gli esiti di successo (`page.locator('[data-testid="booking-form-success"], [data-testid="booking-form-warning"]')`), visto che il soggetto del test è il combobox statico + il 201, non il tipo di banner. Poi arbitro di nuovo su DB fresco (atteso 532 senza failed).

### F2 — MEDIUM (patch) — `isSolo` resta acceso quando il lucchetto allievo si scioglie: AC 14 violato, 422 senza controllo visibile

- **Dove**: `src/app/[locale]/dashboard/logbook/flight-editor.tsx:334` (stato `isSolo`), `:449` (`effectiveFlightType` derivato dal lucchetto), `:617` (payload `isSolo` grezzo), `:990-993` (l'unico reset di `isSolo` è nell'`onChange` del combobox tipo), `:1010-1022` (Toggle reso solo se `effectiveFlightType === 'SCHOOL'`).
- **Riproduzione** (probe `playwright-core`, admin, 1280; script `scratchpad/probe1.cjs`): nuova voce → «Pilota o allievo» = persona con solo profilo allievo (tipo bloccato su Scuola, bottone presente) → bottone ON → «Pilota o allievo» = persona con profilo pilota → il tipo torna «Turismo», il bottone sparisce, `isSolo` resta `true` → «Registra volo».
  ```
  [lock] type value/disabled: Scuola true
  [lock] switch aria-checked after click: true
  [lock] after switching to pilot: type value/disabled: Turismo false switch count: 0
  [lock] POSTED flightType/isSolo: TOURISM true
  [lock] server: 422 {"error":{"code":"SOLO_REQUIRES_SCHOOL","message":"isSolo is only valid on a SCHOOL flight."}}
  [lock] UI errors: ["Doppio comando/solista è valido solo per i voli scuola."]
  [lock] back to Scuola -> switch aria-checked: true
  ```
  Screenshot: `scratchpad/shots/lock-path-back-to-school.png` (Scuola con «Solista» acceso e l'errore del 422 sotto).
- **Perché conta**: AC 14 dice «passare da Scuola-solista a Turismo lo toglie **e** azzera `isSolo`… tornare a Scuola lo ripresenta spento»; qui né l'uno né l'altro. L'utente vede un errore su un controllo che non c'è; l'unica uscita è riselezionare «Turismo» nel combobox (che passa da `onChange` e azzera). Nessuna corruzione dati (il server respinge, e sul DB `SELECT … WHERE "flightType"='TOURISM' AND "isSolo"` = 0 righe). Preesistente con le radio (stessa macchina a stati), ma la story possiede AC 14 e il suo e2e esercita il bottone proprio sotto il lucchetto (`flights.spec.ts:565-571`) senza coprire lo scioglimento.
- **Fix suggerito**: azzerare `isSolo` ogni volta che `effectiveFlightType` lascia `SCHOOL`, non solo nell'`onChange` del combobox — col pattern «adjust state during render» già usato nel repo (`const [prevType, setPrevType] = useState(effectiveFlightType); if (effectiveFlightType !== prevType) { setPrevType(effectiveFlightType); if (effectiveFlightType !== 'SCHOOL') setIsSolo(false); }`), così vale anche quando il lucchetto cambia senza un cambio di persona. In più un e2e: lucchetto → ON → persona pilota → payload `isSolo:false` e ritorno a Scuola spento (discriminante: rosso sul codice attuale).

### F3 — MEDIUM (patch raccomandata) — Invio su un combobox già compilato e rifocalizzato sostituisce il valore

- **Dove**: `src/components/search-combobox.tsx:229` (`openWithOptions` imposta sempre `activeIndex = 0`), `:249-251` (`openBrowseMode` al focus), `:321-330` (Invio con popup aperto committa l'opzione attiva), `:456` (`onMouseEnter` sposta l'attiva sotto il puntatore fermo quando il popup si ridisegna).
- **Riproduzione** (`scratchpad/probe1.cjs`, `probe1b.cjs`):
  ```
  # form volo, solo tastiera, puntatore lontano
  [b] refocused: flight-type-select expanded: true active: flight-type-select-option-TOURISM value Scuola
  [b] after Enter value: Turismo switch count 0
  # form prenotazione staff: scelto l'ultimo velivolo, Shift+Tab di ritorno sul campo, Invio
  [booking] chose: I-WF1793591444566-QY -> I-WF1793591444566-QY
  [booking] after Enter: I-AMVYQAJ3Q0KH
  ```
  Il doc del componente (`search-combobox.tsx:103-105`: «a filled field still submits on Enter, same as a `<select>` did») è falso per costruzione: il focus apre SEMPRE il popup.
- **Perché conta qui**: preesistente sui tre picker del form volo dalla TD-3, ma la 19.5 porta il componente su **sei** campi che erano `<select>` nativi (dove Invio non cambia mai il valore): «Tipo di volo» (Scuola → Turismo in silenzio, bottone solista sparito e azzerato; i compensi istruttore contano solo `SCHOOL`, `instructor-compensation.service.ts:128`, `:400`) e la persona/velivolo/allievo delle prenotazioni (prenotazione intestata alla persona sbagliata). Il valore nuovo è visibile nel campo, quindi non del tutto silenzioso: per questo MEDIUM e non HIGH.
- **Fix suggerito** (una riga di logica, retro-compatibile): in modalità sfoglia l'opzione attiva iniziale è quella **già selezionata** (`initialOptions.findIndex((o) => o.id === value)`, fallback 0 solo se nulla è selezionato) → Invio ricommitta lo stesso valore. Cambia (in meglio) anche i 5 call site esistenti: decisione tecnica della sessione principale, non di dominio.

### F4 — MEDIUM (decisione: fix ora o TD 19.5-a) — click su un combobox già focalizzato non riapre il popup

- **Dove**: `src/components/search-combobox.tsx:283-287` (il popup si apre solo su `focus`), nessun handler di click/mousedown sull'input.
- **Riproduzione** (`scratchpad/probe1b.cjs`):
  ```
  [a] after 1st click expanded: true
  [a] selected: Scuola focused: flight-type-select expanded: false
  [a] click again on the focused field -> expanded: false listbox count 0
  ```
- **Perché conta**: su «Tipo di volo» (2 opzioni, ex `<select>`) e sui campi delle prenotazioni, chi ha appena scelto e vuole cambiare idea clicca/tocca di nuovo il campo e non succede nulla (deve uscire dal campo, digitare o premere ↓). Su telefono il campo resta focalizzato dopo la scelta, quindi il secondo tap è il caso normale. Il dev l'ha dichiarato in parte come TD 19.5-a; correlato: dopo un Tab il popup aperto copre i controlli sotto (nelle probe ha intercettato il click su «Prenota» e sul `Segmented` «Per un allievo» a 375 px).
- **Fix suggerito**: `onMouseDown`/`onClick` sull'input che, se focalizzato e chiuso, chiama `openBrowseMode()` (insieme a F3 l'attiva parte dal valore corrente). Altrimenti registrarlo esplicitamente come TD con questa misura.

### Low / dismiss (per completezza, nessuna azione richiesta alla story)

- **D1 (dismiss, preesistente)**: un non-admin che invia `flightType:'AERIAL_WORK'` a `POST /api/v1/flights` riceve 422 `VALIDATION_ERROR` invece di 403 (la validazione Zod precede l'autorizzazione del service: `[pilot] POST TOURISM 403 | POST AERIAL_WORK 422`). Ordine del handler preesistente, non introdotto qui.
- **D2 (dismiss, copy 19.12)**: «Nessuno» (prenotazione) vs «— Nessuno —» (form volo) per l'istruttore assente: etichette preesistenti, la revisione copy è della 19.12.
- **D3 (dismiss)**: `mobile-logbook.spec.ts` test nuovo dello switch a 375: `phone.close()` non in `finally` (contesto che resta aperto solo se il test fallisce). Igiene, nessun effetto sull'esito.

---

## Decisioni PO necessarie

**Nessuna di dominio.** F3 e F4 sono decisioni **tecniche** della sessione principale (cambiano un comportamento del componente condiviso anche per i 5 call site esistenti, in meglio); F1 e F2 sono patch senza ambiguità.

---

## Verificato corretto (con prova)

| Area | Prova |
|---|---|
| **Migrazione** (AC 1-2) | gemello `airmanager_rv195` (guardie: `migrate status` deve nominare il gemello, altrimenti abort): catena senza la 19.5 → `db seed` + `seed:demo` → 3 voli `REGISTERED` portati a `AERIAL_WORK` → `migrate deploy` col chain reale: `cmvyqj93c…|TOURISM`, `cmvyqj944…|TOURISM`, `cmvyqj94o…|TOURISM`; `enum_range` = `{TOURISM,SCHOOL}`; `SCHOOL|2 TOURISM|22`; 0 tipi `FlightType_old/_new` residui; `migrate diff --from-config-datasource --to-schema` = `-- This is an empty migration.`; ri-deploy = `No pending migrations to apply.`; gemello droppato. `git diff --stat a5fe9a6..ca10919 -- prisma/migrations` = solo la cartella nuova (nessuna migrazione storica toccata). `airmanager`: `{TOURISM,SCHOOL}`, 0 righe `TOURISM ∧ isSolo` |
| **Residui** (AC 8) | grep 1 = solo i test negativi (`flights.test.ts`, `registry.test.ts`, `flights.spec.ts:1515-1546`); grep 2 e 3 = 0 righe; nessun file fuori da test/docs/_bmad-output/migrations nomina il valore |
| **API/OpenAPI** (AC 3) | live: `GET /api/v1/flights?flightType=AERIAL_WORK`, `…&format=xlsx`, `/flights/pdf?…` → 422 `VALIDATION_ERROR`; `openapi.json` senza `AERIAL_WORK`, enum `["TOURISM","SCHOOL"]` / `["SCHOOL","TOURISM"]`; unit dei tre file toccati verdi anche con `env -u DATABASE_URL -u AUTH_SECRET` (60/60) |
| **Statistiche** (AC 5) | `GET /api/v1/stats?period=month` → `movementMix` `[{SCHOOL},{TOURISM}]`; card «Composizione movimenti» = 4 nodi `.flow-bar-*` (2 bande + 2 pallini), 0 `.flow-bar-muted` |
| **SearchCombobox** (AD-2/AD-3, AC 20-24) | modalità statica: admin/istruttore/pilota → **0** richieste a `/api/v1/aircraft|people` e 0 risposte 403, opzioni ancora presenti dopo 600-700 ms (205-209); opzione fuori servizio: testo «I-RV… — Rv magneto (fuori servizio)», `aria-disabled="true"`, click forzato → valore invariato e popup aperto, Invio → nessuna selezione e 0 `.fld-error` (form non inviato), uscendo dal campo → `""`, contrasto testo ≈ 4.6:1 (lab 47.8 su lab 97.7); Escape: form nuovo, form modifica e form volo → 1° Escape `listbox 0 / panel 1 / valore invariato`, 2° Escape `panel 0`; i 5 call site esistenti invariati (`git diff` vuoto su billing/expiries, picker del form volo toccati solo nel commento); fix fuori AD-2 dello scroll dell'input coerente col 14.1 F4 (lo scroll di un antenato chiude ancora: test 14.1 verde nell'arbitro) |
| **Toggle** (AC 12-15) | ARIA: `switch "Volo solista": Doppio comando` / `switch "Volo solista" [checked]: Solista` (nome stabile, stato fuori dal nome); Tab: Tipo di volo → switch → Partenza; Spazio e Invio commutano senza inviare (0 `.fld-error`); `:focus-visible`: dopo click del mouse `outline none`, da tastiera `2px solid`; contrasti (canvas → WCAG, transizioni assestate) **identici al record del dev**: chiaro OFF testo 17.79 / binario 4.59 / pomello 4.85, ON 11.13 / 11.13 / 12.94; scuro OFF 14.77 / 5.36 / 5.72, ON 9.74 / 9.74 / 13.42; anello 18.79 / 15.74; reduced-motion `0s / 0s`, altrimenti `background, border-color 0.16s` e pomello solo `transform`; 479×44 a 1280, 335×44 a 375, un solo nodo, `scrollWidth 375/375` |
| **Form volo** (AC 9-11, 16) | popup tipo `option "Turismo"`, `option "Scuola" [selected]`; «Pianifica volo» dalla Panoramica: `["Turismo","Scuola"]`, switch «Volo solista», nessuna chiave grezza; lucchetto 14.3 (Scuola, disabilitato, hint collegato) visto in probe; e2e 19.5 del form volo verdi nell'arbitro |
| **Form prenotazione** (AC 17-19, 22) | staff `["booking-person","booking-aircraft","booking-instructor"]`, pilota `["booking-aircraft"]`, istruttore «Per un allievo» `["booking-aircraft","booking-student"]`, 0 `select`; `getByLabel('Allievo', { exact: true })` → `booking-student`; invio a vuoto staff → 4 errori, focus su `booking-person`; modifica: scambio di prenotazione a pannello aperto → il combobox passa da `I-RMMVYQPQR4WM7` a `I-RMMVYQPQRSUAQ`; nessun overflow a 375 |
| **RBAC** | admin/istruttore/pilota/allievo: `POST /flights` valido → 404 (fixture fittizie)/403/403/403; nessuna chiamata di ricerca dai form; l'allievo non ha «Nuova prenotazione» (invariato) |
| **i18n** (AC 25) | 1679 = 1679 chiavi, diff dei percorsi vuoto; `selectPlaceholder` assente; `BookingsPage.form.picker` = `LogbookPage.picker` |
| **Documenti** (AC 27) | riga FR-14 nel change record del PRD; riga di `CLAUDE.md` su Escape vera (`stopPropagation` in `search-combobox.tsx:338`, secondo Escape chiude il pannello: misurato) |
| **Gates** (AC 28) | `npm run gates` → `PASS lint (21s)`, `PASS typecheck (2s)`, `PASS test (8s) — Tests 1843 passed (1843)`, `PASS build (30s)` |
| **Catena serializzata** | `40 passed (1.9m)`, `E2E_EXIT=0` (eseguita a parte, v. Arbitro §3) |

---

## Stato della macchina a fine review

- **`:3000` libero**: il mio server di produzione (launcher PID 546270, `next-server` PID 546287) è stato fermato per PID; nessun processo `next` residuo.
- **Nessun run e2e attivo.** ⚠️ **`scripts/e2e.sh status` NON mostra l'arbitro**: mostra l'ultimo run, cioè la mia **catena serializzata da 40 test (`E2E_EXIT=0`)**; `last-run.log.prev` è la mia esecuzione isolata di `:334` (`E2E_EXIT=1`). Il log dell'arbitro (`E2E_EXIT=1`) è conservato **solo** in `scratchpad/arbiter-full.log` (path assoluto sopra). Non leggere quell'`EXIT=0` come esito dell'arbitro.
- **DB `airmanager`**: popolato dall'arbitro + catena + fixture delle mie probe (persone `RvAllievo-*`, `RvPilota-*`, `AAARvMove-*`; velivoli `I-RV…` (uno fuori servizio «Rv magneto»), `I-RM…`; due prenotazioni PENDING del 2030-03-10; tre PENDING del pilota di seed del 2031-03-12 lasciate dal test di F1) → **va resettato prima del prossimo arbitro**.
- Gemello `airmanager_rv195` creato e **droppato**; `airmanager_load` **non toccato**; nessun `docker compose down/up`, nessuno `stash`, nessun `git add`.
- Working tree: **nessuna modifica mia** (resta solo la cancellazione preesistente dell'utente di `.claude/skills/design-taste-frontend/SKILL.md` e i suoi untracked). `.next` ricostruita da `npm run gates` sullo stesso HEAD `ca10919`.
- Script e prove nello scratchpad: `probe1.cjs`, `probe1b.cjs`, `probe2.cjs`, `probe2b.cjs`, `probe3.cjs`, `probe4.cjs`, `probe5.cjs`, `mig-test.sh`, screenshot in `shots/` (`lock-path-back-to-school.png`, `toggle-*-1280.png`, `flight-375-school-*.png`, `booking-oos-option-1280.png`, `booking-pilot-375.png`, `booking-instructor-student-375.png`, `move-booking-1280.png`, `panoramica-dispatch-1280.png`, `reports-mix-card.png`).
