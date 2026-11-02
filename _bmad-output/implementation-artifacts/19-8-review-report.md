# Review adversarial — Story 19.8 «Impostazioni a Salva unico»

- **Reviewer**: `review-19-8` (Opus 5.5, unico layer adversarial), 2026-11-02, metodo `bmad-code-review` (Blind Hunter + Edge Case Hunter + Acceptance Auditor svolti in prima persona) + `karpathy-guidelines`.
- **Commit sotto review**: `72ad09e` (feat) + `4a60fac` (docs) su baseline `a598b26`. Diff: 41 file, +4735 / −2412.
- **Repo**: non modificato (nessun file tracciato toccato; `git status` identico all'inizio: l'unico ` D .claude/skills/design-taste-frontend/SKILL.md` era già lì). Script e output delle prove in `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/rvw198/`.

## Verdetto

**SHIPPABLE con fix.** Nessun finding alto. Il contratto centrale regge alla prova empirica: atomicità reale sul DB (anche con l'errore a metà lista), ordine `delete → update → create`, 422 a percorso puntato, 409 con `details.reason`/`details.item`, RBAC 403 senza scritture, password SMTP mai restituita e mai sovrascritta da vuota, route singole invariate (`reason` additivo), pagina pulita su DB fresco, un solo Salva, un solo PATCH, nessuna scrittura delle liste prima del Salva. L'arbitro è verde con il delta dichiarato.

Un finding **medio** (F1: le modifiche fatte mentre il Salva è in volo spariscono in silenzio, e la barra dice «Nessuna modifica») e cinque **bassi** (deadlock → 500 su update in ordine opposto, race P2025 → 500, rename a catena dipendente dall'ordine, 422 su campi senza slot d'errore, copy dei doppioni).

## Arbitro (priorità zero)

- Pre-condizioni: `ss -ltnp | grep :3000` vuoto, `scripts/e2e.sh status` = DONE (run mirato precedente del dev), DB `airmanager` FRESCO (creato 18:28:29 CET: 4 `User`, 0 `LoginAttempt`).
- Comando: `export JOBS_SECRET=local-e2e-secret-0123456789abcdef CI=1 && scripts/e2e.sh start` (suite completa, build di produzione dentro il cronometro).
- Esito verbatim (`scripts/e2e.sh status`):
  ```
  state: DONE — E2E_EXIT=0
  --- summary ---
    1 flaky
    563 passed (20.9m)
  === e2e start: 2026-11-02T18:29:01+01:00 ===
  === e2e end: 2026-11-02T18:49:55+01:00 ===
  ```
- **563 + 1 flaky = 564** = delta dichiarato 555 → 564. Catena: `settings` 16/16, `treasury-settings` 3/3, `mobile-settings` 12/12 al primo colpo; nel progetto `chromium` gli spec toccati dalla story verdi al primo colpo (`expiry-types` 6, `expiry-registration` 2, `pdf-exports` 9, `cash-register` 5, `membership-fee` 7, `api-v1` 8).
- **Copia del log**: `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/arbiter-19-8-full.log`.
- **Flaky diagnosticato** — `[chromium] e2e/flights.spec.ts:1027` «E5»: primo tentativo `Expected: 201 / Received: 422` a `flights.spec.ts:1037` (il PRIMO `POST /flights` di un pilota appena creato), retry verde. Attribuzione: **classe nota TD 16.2-g** (tipi di scadenza GLOBALI, attivi, `scope: 'ALL'`, `blocksBooking: true` creati da spec paralleli: un pilota nuovo senza quel documento viene bloccato con 422 `FLIGHT_BLOCKED_BY_EXPIRY`). Prove: nel log il test concorrente è il n. 199 `flights.spec.ts:789` («an instructor with a blocking expired document…», blocco 14.4 che crea esattamente un tipo di quel genere), terminato fra il ✘ 200 e il retry ✓ 201; `flights.spec.ts` non è toccato dalla 19.8 (`git log -- e2e/flights.spec.ts`: ultimo commit 19.7a); il test bloccante di `expiry-types.spec.ts` (story 7.4) esisteva identico prima della 19.8 ed era già finito (#153-158). Il body del 422 non è nel log (il test asserisce solo lo status): l'attribuzione è per concorrenza + classe documentata, non per codice d'errore letto.
- **Claim del dev su `api-v1`** («fallisce solo se la catena è già girata prima sullo stesso DB»): verificato. `api-v1` è nel progetto `chromium`, che è la radice della catena (`playwright.config.ts`: `settings` dipende da `chromium`); nell'arbitro è verde (8/8). La causa indicata (la finestra permissiva `maxAdvanceDays: 3650` ripristinata da `settings.spec` contro le prenotazioni del 2099) è PREESISTENTE: lo stesso `PERMISSIVE_SCHEDULING` è in `git show a598b26:e2e/settings.spec.ts:85-91`. Nessun impatto sulla suite reale.

## Finding

### F1 — MEDIO — Le modifiche fatte mentre il Salva è in volo vengono scartate in silenzio

- **Dove**: `src/app/[locale]/dashboard/settings/settings-console.tsx:193-212` — `setSaving(true)` non blocca nessun campo; al 200 `setBaseline(next); setDraft(next)` sostituisce l'INTERA bozza con lo snapshot della risposta.
- **Cosa**: tutto ciò che l'utente scrive, aggiunge o elimina dopo il click e prima della risposta sparisce; la barra torna «Nessuna modifica» e il Salva si disabilita, quindi l'utente crede che sia stato salvato. La deviazione D-d del record lo riduce a «un carattere digitato nei ~100 ms del volo»: in realtà vale per qualunque sezione e per le righe di lista, e la finestra è la latenza reale della PATCH (su telefono in rete mobile, centinaia di ms o più). La trappola 8 della story chiedeva una delle due cose — conservare la bozza cambiata in volo (è il motivo per cui esiste la mappa `index → rowKey`) o **bloccare la modifica durante il salvataggio** — non la terza (scartarla).
- **Riproduzione** (`rvw198/probe-ui.mjs`, blocco «D-d»; build di produzione su gemello): `page.route('**/api/v1/settings')` con 1,5 s di ritardo; cambiare il nome aviosuperficie → Salva; durante il volo scrivere `99.99` nella Quota e aggiungere un rating «Typed during save».
- **Evidenza**:
  ```
  after in-flight edits: fee = 81.50 summary = Nessuna modifica new rows = 0
  ```
- **Fix suggerito** (il più semplice, chirurgico): rendere inerte il contenuto del form mentre `saving` — p. es. le nove sezioni dentro un `<fieldset disabled={saving}>` con reset CSS (`border:0; padding:0; margin:0; min-width:0`), oppure l'attributo `inert` su un wrapper delle sezioni (la barra resta fuori). In alternativa, ribasare sulla nuova baseline solo i campi non toccati dopo il click (più codice). Test: e2e con la route ritardata che asserisce o i campi disabilitati durante il volo, o la modifica fatta in volo ancora presente e sporca dopo la risposta.

### F2 — BASSO — Due Salva concorrenti che aggiornano le stesse righe in ordine opposto: deadlock → 500

- **Dove**: `src/server/services/settings.service.ts:157` e `:162` (gli `update` di una lista sono applicati nell'ordine dell'array ricevuto, dentro UNA transazione); `src/server/services/expiry-types.service.ts:207` (`SELECT … FOR UPDATE` per riga) e l'`UPDATE` di `updateCashCategoryCore` (`cash.service.ts:157`). Comportamento NUOVO con la 19.8: prima ogni `PATCH /expiry-types/{id}` bloccava una riga sola nella sua transazione.
- **Riproduzione** (`rvw198/probe-race.mjs`, `probe-race2.mjs`): due `PATCH /api/v1/settings` in parallelo, uno con `update: [A, B]`, l'altro con `update: [B, A]`, 10 round.
- **Evidenza**:
  ```
  opposite-order rounds {"500:INTERNAL_ERROR":10,"200:ok":10}      (tipi di scadenza)
  cash opposite-order  {"200:ok":12,"500:INTERNAL_ERROR":8}       (categorie)
  types same-order     {"200:ok":20}                               (controllo: stesso ordine)
  server.log: Unhandled /api/v1 error … `prisma.$queryRaw()` … Code: `40P01`. Message: `deadlock detected`
  ```
  L'atomicità regge (la transazione perdente fa rollback, nulla di scritto a metà): il danno è un 500 non ritentabile al posto di un 409.
- **Raggiungibilità**: dalla UI quasi solo in teoria — l'array segue l'ordine per nome dello snapshot caricato (`expiry-types.service.ts:125`, `cash.service.ts:91`), quindi due pagine con lo stesso snapshot mandano lo stesso ordine; serve una pagina stantia dopo un rename e due Salva nello stesso istante. Per un client API (la futura app Flutter) è un ordine qualunque.
- **Fix suggerito**: applicare `delete` e `update` di ogni lista ordinati per `id` (ordine di lock deterministico), conservando l'indice originale per `details.item`; in più, o in alternativa, mappare `40P01` (e `P2034`) a 409 `CONFLICT` ritentabile. Unit sull'ordine di applicazione.

### F3 — BASSO — Race: `update` di una categoria eliminata in contemporanea → P2025 crudo → 500 (il contratto dice 409 `NOT_FOUND`)

- **Dove**: `src/server/services/cash.service.ts:144-178` — `updateCashCategoryCore` legge con `findUnique`, poi `tx.cashCategory.update`; il `catch` traduce solo la violazione di unicità, non `isRecordNotFound`.
- **Riproduzione** (`rvw198/probe-race.mjs`, «delete vs rename»): per 8 categorie, in parallelo `PATCH {cashCategories:{delete:[id]}}`, `PATCH {cashCategories:{update:[{id, name}]}}`, `PATCH {cashCategories:{delete:[id]}}`.
- **Evidenza**:
  ```
  delete/rename/delete {"200:ok":19,"500:INTERNAL_ERROR":5}
  server.log: Invalid `prisma.cashCategory.update()` invocation: … No record was found for an update.  (5 occorrenze)
  ```
  Nessuna scrittura a metà (P2025 non abortisce la transazione Postgres, ma l'errore propaga e fa rollback). La stessa finestra esisteva già sulla route singola di rename (preesistente lì); sul composito contraddice la regola documentata in OpenAPI («`update` of a vanished id = 409 `NOT_FOUND`»). I tipi di scadenza non hanno il problema (`FOR UPDATE`).
- **Fix suggerito**: nel `catch` di `updateCashCategoryCore`, `if (isRecordNotFound(error)) throw new NotFoundError('Cash category not found.');` (→ 409 `NOT_FOUND` con `item` nel composito, 404 sulla route singola come per l'id assente).
- Fuori scope ma osservato nella stessa prova: `POST /api/v1/expiries` su un tipo eliminato in contemporanea → `prisma.expiry.create()` P2003 → 500 (8/8) — preesistente, non della 19.8 (il lato composito ha risposto 200 ogni volta). Da TD se non già registrato.

### F4 — BASSO — Un rename «a catena» passa la validazione client e poi fallisce o riesce secondo l'ordine alfabetico delle righe

- **Dove**: server `settings.service.ts:157` (update nell'ordine dell'array); client `src/lib/settings-draft.ts:306` (array costruito nell'ordine della bozza = nome crescente) e `:464-471` (la validazione client controlla solo l'unicità dei nomi FINALI).
- **Riproduzione** (`rvw198/probe-api.mjs`, «ordering traps»): tipi A e B; rinominare A nel vecchio nome di B e B in un nome nuovo.
- **Evidenza**:
  ```
  chain A->B, B->C (A first) 409 {"code":"CONFLICT",…"reason":"NAME_TAKEN","item":{"list":"expiryTypes","op":"update","index":0,…}}
  chain B->C, A->B (B first) 200
  ```
  Dalla UI: l'utente fa due rename legittimi, la validazione client li accetta, e l'esito dipende da quale delle due righe viene prima per nome — se è A, compare «Esiste già un tipo con questo nome.» su A senza spiegazione. La description OpenAPI dichiara solo lo **scambio** di nomi come non supportato; la catena non è dichiarata.
- **Fix suggerito** (il più semplice): dichiararlo accanto allo scambio nella description di `registry.ts` e, nella validazione client, segnalare sulla riga che prende il nome SALVATO di un'altra riga rinominata nello stesso Salva un messaggio esplicito («salva in due passi»). Alternativa server: applicare per primi i rename che liberano un nome richiesto da un altro (ordinamento topologico; i cicli restano 409).

### F5 — BASSO — Un 422 su un campo senza slot d'errore lascia la barra che dice «correggi i campi evidenziati» senza nessun campo evidenziato

- **Dove**: `src/app/[locale]/dashboard/settings/smtp-card.tsx:133-145` (i `Field` di «Nome utente» e «Password» non ricevono `error`, gli input non hanno `maxLength`, mentre lo schema ha `user`/`pass` `max(255)`); `src/lib/settings-draft.ts:545` e `:590-591` (`smtp.user`/`smtp.pass` sono in `KNOWN_FIELD_PATHS`, quindi l'errore conta come «piazzato» e la barra mostra `checkFields`).
- **Riproduzione** (`rvw198/probe-ui2.mjs`, caso 3): scrivere 256 caratteri in «Nome utente» SMTP → Salva.
- **Evidenza**:
  ```
  smtp.user 256: 422 {"fieldErrors":{"smtp.user":["Too big: expected string to have <=255 characters"]}}
   | bar: Nulla è stato salvato: correggi i campi evidenziati. | highlighted: [] | focus: {"tag":"BODY","testid":null}
  ```
  Raggiungibile solo con input estremi, ma è la stessa famiglia di AC 11: l'utente non sa cosa correggere e il focus si perde.
- **Fix suggerito**: `maxLength={255}` su host/user/pass/from (taglia la causa) e `error={errors.user}` / `errors.pass` sui due `Field`; oppure, in `mapSaveError`, trattare come «non piazzato» (barra `generic`) un percorso che la pagina non rende.

### F6 — BASSO (copy) — Doppioni di nome con la lista sbagliata nel messaggio, o con un tipo invisibile

- **Dove**: `src/lib/settings-draft.ts:524-525` (un solo spazio di nomi per Ratings + Visite mediche, giusto) con la copy `SettingsPage.errors.duplicateName` = «Questo nome è già usato in questa lista.» (`messages/it.json`, EN «…in this list.»); `src/server/services/settings.service.ts:89` (lo snapshot esclude il tipo `MEMBERSHIP`, giusto) con la copy del 409 «Esiste già un tipo con questo nome.».
- **Evidenza** (`rvw198/probe-ui2.mjs`, casi 1-2):
  ```
  cross-list dup vs medical "RvwT2-…" -> [ 'Questo nome è già usato in questa lista.' ]   (il doppione è nell'ALTRA lista)
  hidden membership name "Quota associativa" 409 -> [ 'Esiste già un tipo con questo nome.' ] | visible rows with that name: 0
  ```
- **Fix suggerito**: copy che non dice «questa lista» (p. es. «Questo nome è già usato da un altro tipo di scadenza.») e, per il tipo di sistema, una menzione («…anche fra i tipi di sistema, come la Quota associativa»). Può confluire nella revisione copy della 19.12.

## Decisioni PO necessarie

Nessuna. F1 ha un fix tecnico già previsto dalla story stessa (trappola 8: «si blocca la modifica durante il salvataggio»); gli altri sono correzioni senza ambiguità di dominio.

## Verificato corretto (con prove)

Build di produzione dell'arbitro, servita su `:3001` contro il gemello `airmanager_rvw198` (createdb + migrate deploy + seed; eliminato a fine review). Output completi in `rvw198/*.out`.

- **Atomicità sul DB reale, anche a metà lista**: `PATCH` con `airfield`, `membershipFee`, `currency`, `treasury`, `cashCategories.create[0]` valido e `expiryTypes.create = [ok, NOME_ESISTENTE, ok]` → `409 NAME_TAKEN item {expiryTypes, create, index: 1}`; snapshot SQL di `AppSetting`, `ExpiryType`, `CashCategory` prima/dopo **identici** (`appsettings unchanged: true`, `types unchanged: true`, `cats unchanged: true`). `update = [rename ok, id inesistente, disattiva ok]` + METAR → `409 NOT_FOUND item {update, index: 1, id: "nope"}`, rename e METAR non scritti.
- **Ordine `delete → update → create`**: «elimina X e crea X» → 200; «rinomina A in X e crea A» → 200; rinomina su un nome esistente → 409 `NAME_TAKEN` con `item`; nome con spazi → trim, 409; maiuscole diverse → 200 (vincolo DB case-sensitive, come prima).
- **Shape 422 a percorso puntato**: `smtp.host` (SSRF), `club.contactEmail`, `scheduling.closeTime`, `scheduling.minSlotMinutes`, `expiryTypes.create.0.name`, `expiryTypes.create.1.kind` (`MEMBERSHIP` rifiutato), `expiryTypes.update.0` (solo id, anche con `kind` che viene scartato), `expiryTypes.update.0.name` (doppione fra create e update dopo trim), `cashCategories.delete.0` (id in update e delete), `cashCategories.create` (51 > 50), `validityMonths` 601, radice `''` per `{}`/`{foo}`/`[]`/`null`/JSON rotto. Body > 64 KB → 413 `PAYLOAD_TOO_LARGE` (il `bodySchema: z.unknown()` tiene il tetto).
- **Regole 19.7 attraverso il composito**: delete/disattivazione/rename del tipo quota → 409 `MEMBERSHIP_TYPE_LOCKED` con `item`; visita con `scope` o `blocksBooking: false` (create e update) → 422 `MEDICAL_TYPE_FIELDS` con `item`.
- **Categorie**: rename di «Ricariche» (anche con lo stesso nome) e delete → 409 `SYSTEM_CATEGORY`; disattivazione/riattivazione di una di sistema → 200 (come la route singola, `cash.service.ts` `deactivateCashCategory` non ha guardia di sistema); update di id assente → 409 `NOT_FOUND`; delete di id assente → 200 no-op.
- **Route singole invariate, `reason` additivo**: `PATCH /cash-categories/{Ricariche}` → 409 `CONFLICT` + `details.reason: SYSTEM_CATEGORY`; `POST /expiry-types` doppione → 409 `CONFLICT` + `NAME_TAKEN`; `DELETE` di id assente su entrambe → 404 come prima.
- **RBAC**: anonimo → 401; pilota, istruttore, allievo → 403 `FORBIDDEN` con un body valido che toccava quota, categorie e tipi: righe `AppSetting` identiche **anche in `updatedAt`**, nessuna categoria creata. Un body malformato da non-admin dà 422 prima del 403: è l'ordine di ogni route `apiRoute` del repo (shape nel wrapper, gate nel service), e nessuno dei due percorsi tocca il DB — coerente con AC 1 («403 prima di qualunque query»). `GET /settings/currency` da pilota → 200 (senza gate, come dichiarato), anonimo → 401; `PUT` da pilota → 403; `PUT` fuori limiti → 422.
- **Password SMTP**: con `pass` → 200, la risposta non la contiene (chiavi `host, port, security, user, from, hasPassword`), DB cifrato (nessun testo in chiaro); `pass: ''` e `pass` assente → valore cifrato in DB **identico**, `hasPassword: true`.
- **Concorrenza**: 8 create concorrenti dello stesso nome → esattamente 1×200 + 7×409 `NAME_TAKEN`, 1 riga in DB (categorie e tipi); quattro admin su blocchi diversi in parallelo → tutti 200, tutti i valori presenti (D-3 protegge); stesso blocco → ultimo che scrive vince, nessun errore; payload 50 create + 200 delete per lista: 200 in 344 ms (TD 19.8-c resta basso).
- **OpenAPI servito**: `patch /api/v1/settings` con 200/401/403/409/422(/500), `get`+`put /api/v1/settings/currency`; componenti `UpdateSettingsRequest` e `SettingsSnapshot` con 10 proprietà ciascuno.
- **UI 1280** (`probe-ui.mjs`, `fresh.mjs`, `probe-ui2.mjs`, `en.mjs`): su DB fresco (zero righe `AppSetting`) la pagina nasce «Nessuna modifica» col Salva disabilitato pur mostrando 07:00/21:00, 587, 1/90, 0.00; un Salva che tocca solo l'ICAO manda `{"club":…}` e crea solo `airfield.icao`/`airfield.contactEmail` (nessuna `sched.*`: trappola 3 evitata). Un solo `button[type=submit]` nel form (anche con il calendario della Tesoreria aperto); Invio su pagina pulita → 0 richieste; ICAO cambiato e riportato in minuscolo → di nuovo pulita; email di contatto sporca → «Invia email di prova» disabilitato con hint visibile; «Aggiungi» porta il focus sul nome; rating nuovo + visita disattivata + categoria eliminata → stati `new`/`changed`/`removed`, barra «Ratings, Visite mediche, Categorie di cassa», **0** scritture; doppione → errore sulla riga, focus sul nome, 0 richieste; host `127.0.0.1` → 422, `aria-invalid`, focus sull'host, ICAO della bozza conservato, DB invariato; riga eliminata da un altro admin dopo il caricamento → 409 `NOT_FOUND` con «Questa voce è stata eliminata da un altro utente…» sulla riga; due schede su blocchi diversi → entrambi salvati, body di una sola chiave ciascuno; digitazione subito dopo un Salva → sopravvive a `router.refresh()` (trappola 11); rete interrotta → «Non è stato possibile salvare. Riprova.», bozza intatta, Salva riattivabile; email `  Ops.Rvw@Example.COM ` normalizzata e pagina di nuovo pulita; EN e IT senza chiavi grezze né placeholder non interpolati, nessun errore in console.
- **UI 375**: col corpo scrollato in fondo la barra sta sopra la tab bar (bordo inferiore 599,8 px, tab bar da 693,1 px), `settings-save` alto 44 px e colpito dall'hit-test al centro, overflow orizzontale 0; sheet di una visita = `["VALIDITÀ","STATO"]` (nessun ambito né «Blocca»). Screenshot in `rvw198/shots/` (1280 pulita, liste in bozza, errore host, pannello scuro; 375 in cima, in fondo, sheet).
- **Gate e contratti di repo**: `npm run gates` rieseguito a fine review → `PASS lint (57s) / PASS typecheck (7s) / PASS test (20s) — Tests 2038 passed (2038) / PASS build (42s)`; i 9 file unit della story verdi senza env (`env -u DATABASE_URL -u AUTH_SECRET -u NODE_ENV npx vitest run …` → 364 passed); grep di AC 21 identici al record (1 sola fetch residua, `smtp/test-email`; 0 `SettingsForm`; 0 `Promise.all`; i testid ritirati solo nelle asserzioni di assenza); parità i18n vuota, `SettingsPage` 168 = 168; nessuno spec nuovo in catena; `pdf-exports`/`expiry-types`/`expiry-registration` (progetto parallelo) asseriscono il body a una sola chiave.

## Note minori (non finding)

- `{ "expiryTypes": {} }` o liste con array vuoti → 200 no-op, mentre la description OpenAPI dice «an empty body is a 422»: innocuo (un no-op), al più una frase.
- `settings.spec.ts:1-7` dice «Every key it writes is restored in afterAll», ma le chiavi `smtp.*` (from e password scritti da AC 9/16/17) restano: puntano comunque a Mailpit senza auth (`user: ''` → nessuna auth in `smtp-mail-sender.ts:31`), e il pattern è preesistente (12.11). Solo il commento è impreciso.

## Stato della macchina

- Arbitro: concluso, `E2E_EXIT=0`; lock libero; log originale in `/tmp/airmanager-e2e/last-run.log`, copia in scratchpad (sopra). Nessun altro run lanciato dopo.
- Server di verifica: `next start -p 3001` (PID 1091587, padri npm 1091567/1091574) fermato **per PID**; `:3000` e `:3001` liberi, nessun `next start` vivo.
- DB: gemello `airmanager_rvw198` creato ed **eliminato** (`DROP DATABASE … WITH (FORCE)`); `airmanager` lasciato come l'ha lasciato l'arbitro; `airmanager_load` e `airmanager_audit` mai toccati (elenco finale: `postgres, template1, template0, airmanager_audit, airmanager_load, airmanager`). Nessun `docker compose down/up`, nessun `git stash`/`git add`.
- `.next`: ricostruita da `npm run gates` (stesso commit `4a60fac`).
- Nessuna attività della sessione parallela osservata su `:3000` o sul runner e2e durante la review.
