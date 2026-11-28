# Review report — story 19.12b «Passata completa dei testi italiani in contesto»

- **Reviewer**: `review-19-12b` (Opus 5.5, adversarial; skill `bmad-code-review` eseguita in-process: Blind Hunter, Edge Case Hunter e Acceptance Auditor svolti dal reviewer stesso, niente subagent disponibili; `karpathy-guidelines` applicata), 2026-11-03.
- **Sotto review**: `66fd139` (feat) + `170229b` (docs), baseline `6525be2` (71 file).
- **Verdetto: SHIPPABLE con fix**: 2 medium, 5 low, 3 info. Nessun blocker. L'arbitro è verde e la proprietà MAJOR-2 regge in ogni layout misurato.

## 1. Arbitro (AC 24): esito verbatim

DB `airmanager` resettato dalla sessione principale alle 19:59 (migrate + seed), `:3000` libera. Comando: `export JOBS_SECRET=review-19-12b-secret-not-placeholder && CI=1 scripts/e2e.sh start`, avviato alle 19:59:35 e letto solo con `scripts/e2e.sh status`.

```
Running 606 tests using 2 workers
...
  606 passed (25.5m)
=== e2e end: 2026-11-03T20:25:03+01:00 ===
E2E_EXIT=0
```

- 606 test = 604 + 2 di `e2e/error-pages.spec.ts` (`:40` e `:48`, entrambi ✓); 0 failed, 0 flaky, nessun retry.
- MAJOR-2: `aog-impact-email.spec.ts:397` e `:475` ✓.
- Log del server dell'arbitro: `grep -cE "MISSING_MESSAGE|IntlError|FORMATTING_ERROR|INVALID_KEY|ENVIRONMENT_FALLBACK"` dà **0**.

## 2. Gate (AC 23)

`npm run gates` sulla HEAD `170229b`, dopo l'arbitro:
```
PASS  lint (41s)
PASS  typecheck (5s)
PASS  test (19s) — Tests  2211 passed (2211)
PASS  build (56s)
```
Senza env esportato: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/i18n/messages.test.ts src/lib/requirement-failures.test.ts src/server/adapters/mail/templates.test.ts` dà 3 file e 61 test passati.

## 3. Finding

### M1 (MEDIUM): la guardia AD-3 non prende le varianti vietate nella forma in cui compaiono in un'etichetta (maiuscola iniziale, plurale, femminile, NBSP)

- **Dove**: `src/i18n/messages.test.ts:214-239` (`BANNED`). Il fatto riportato in `CLAUDE.md:37` («vieta … le varianti vietate del glossario») e in `docs/i18n/glossario-it.md:3` è più ampio di quello che il test controlla davvero.
- **Problema**: le regex sono case-sensitive e fissano una sola forma della parola: `/payout/`, `/\bdashboard\b/`, `/\breset\b/`, `/\balert\b/`, `/\bsidebar\b/`, `/\bslot\b/`, `/top \d/`, `/Sei stato/`, `/Non current/`, `/Le mie transazioni/`, `/Il mio conto/`, `/^Admin$/`, `/\b[Ff]ermo\b/`. In un catalogo UI le etichette cominciano quasi sempre con la maiuscola («Tariffa Payout», «Reset filtri», «Top 10»), quindi la forma più probabile di una regressione è proprio quella che la guardia non vede. Restano fuori anche il plurale «fermi», il femminile «Sei stata» e lo spazio U+00A0, che il catalogo usa già di proposito dalla 19.12a F3. AD-3 dettava letteralmente quelle 23 regex, per cui è in parte un buco della specifica. Resta il fatto che la guardia è l'unica barriera automatica del glossario (punto PO 13), e il CLAUDE.md la descrive come completa.
- **Riproduzione** (copia isolata, mai nel working tree): 16 valori mutati in `messages/it.json` della copia, poi `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/i18n/messages.test.ts -t "forbidden variant"`. Diventano rossi **solo 2 su 16**:
  ```
  + "AircraftPage.newAircraft: \"Aggiungi aeromobile\" matches /[Aa]eromobil/ …"
  + "AircraftPage.empty: \"{count, plural, one {Nessun aeromobile} other {Nessun velivolo}}\" matches /[Aa]eromobil/ …"
  ```
  Il controllo e il ramo ICU vengono presi. **Passano invece**: «Torna alla Dashboard», «Invia link di Reset», «Tariffa Payout», «Top 10 · {period}», «Fermi», «Velivolo fermi», «Sei stata invitata ad AirManager», «Riepilogo Alert scadenze», «Il mio conto», «Le mie Transazioni», «Admin.», «… in Sidebar.», «Durata minima Slot», «Non Current».
- **Fix verificato** (copia isolata): flag `i` su ogni pattern, `\bferm[oaie]\b`, `\bsei[\s ]stat[oa]\b`, `\balerts?\b`, `\bslots?\b` e `[\s ]` al posto dello spazio nelle regex di più parole (`top`, `non current`, `le mie transazioni`, `il mio conto`), `^\s*admin\W*$`. Sul catalogo HEAD dà **0 falsi positivi** (33 passed) e sui 16 mutanti **16 righe rosse**. Ripristino della copia verificato con sha256: `it.json` `eaaed88e…`, `messages.test.ts` `e03bb80b…`, identici al repo. Se le varianti del glossario fuori da AD-3 (per esempio «Report finanziario», «Diario di volo», «In regola», «Esporta Excel», «Turismo/Privato») restano scoperte per scelta, allineare la frase di `CLAUDE.md:37` e del glossario a quello che il test controlla davvero.

### M2 (MEDIUM): agenda mobile della Pianificazione, il titolo di un velivolo fuori servizio va in ellissi accanto al nuovo badge «Fuori servizio» (AC 22), e lo sheet ripete «fuori servizio» tre volte

- **Dove**: `messages/it.json:1273` (`BookingsPage.schedule.aog` «AOG» → «Fuori servizio») insieme a `:1279` (`schedule.mobile.aogTitle` «{registration} fuori servizio»); `src/app/[locale]/dashboard/bookings/schedule.tsx:324` (titolo), `:800` (badge della riga), `:867` e `:876` (sotto-titolo e badge dello sheet).
- **Problema**: il badge della riga AOG è passato da «AOG» a «Fuori servizio», più largo, e toglie spazio al titolo, che dice già «I-B412 fuori servizio». A 375 il titolo diventa «I-B412 fuori ser…». A 320 resta «I-B…» e la marca, cioè il dato che identifica il velivolo, si perde. Con «AOG» il titolo stava su una riga. Nello sheet la testata legge «FUORI SERVIZIO | I-B412 fuori servizio | Fuori servizio». La riga B.1 dichiara come superficie letta «Pianificazione, calendario», ma il seed demo non ha velivoli fuori servizio: tutti e 4 sono `OPERATIONAL` dopo `seed:demo`, misurato sul gemello. L'agenda AOG non era quindi raggiungibile coi dati della matrice, e il record non dice di aver messo fuori servizio un velivolo.
- **Riproduzione**: gemello con seed e demo, build HEAD su :3100. `POST /api/v1/aircraft/{I-B412}/out-of-service {reason:"Revisione 100 ore"}`, poi `/it/dashboard/bookings` a 375 e `mobile-agenda-row` filtrata su I-B412. Script `scratchpad/r/agendaclip.cjs`, che sostituisce nel DOM il testo del badge con «AOG» e rimisura il titolo:
  ```
  320 now {"cw":46,"sw":115,"clipped":true}   oldWithAOG {"cw":114,"sw":115,"clipped":false}
  375 now {"cw":101,"sw":115,"clipped":true}  oldWithAOG {"cw":115,"sw":115,"clipped":false}
  390+     non tagliato in entrambi i casi
  sheet: FUORI SERVIZIO | I-B412 fuori servizio | Fuori servizio | VELIVOLO | I-B412 | MOTIVO | Revisione 100 ore | Chiudi
  ```
  Screenshot: `scratchpad/r/shots/aog-agenda-sheet-375.png`.
- **Fix suggerito** (una riga di JSON, nessun layout): `schedule.mobile.aogTitle` = «{registration}». Il badge dice già «Fuori servizio» e il sotto-titolo porta il motivo; nello sheet il kicker `labels.aog` diventa ridondante con il badge, e la scelta su quale tenere spetta a chi corregge. Va riletta in contesto a 320 e a 375.

### L1 (LOW): AC 20, manca la metà e2e

- **Dove**: AC 20 chiede «unit del service + una riga di Contabilità nell'e2e che già legge i compensi: `billing.spec.ts` o `instructor-compensation.spec.ts`». In `e2e/instructor-compensation.spec.ts` cambia solo l'etichetta (`:141`, «Compenso orario (€/h)»).
- **Evidenza**: `grep -rn "Compenso istruttore\|Instructor payout" e2e` non trova nulla. Il record (§C, §G) cita solo la unit (`instructor-compensation.service.test.ts:545`) e non dichiara l'omissione come deviazione. In compenso ho verificato a runtime che il movimento nuovo esiste: sul gemello `CashMovement.description` = `Compenso istruttore 2026-10-04 – 2026-11-02`, letto in Contabilità a 1280 e a 375.
- **Fix**: un `toContainText('Compenso istruttore ')` sulla riga di Contabilità del pagamento registrato in `instructor-compensation.spec.ts` (o `billing.spec.ts`), oppure la deviazione motivata nel record.

### L2 (LOW): `mobile-billing.spec.ts` AC 8, l'asserzione riscritta non ha più un tetto e non prende la regressione per cui era nata

- **Dove**: `e2e/mobile-billing.spec.ts:822-823`, dove `w = 180` è diventato `w ≥ 180` + `oneLine`.
- **Riproduzione** (`scratchpad/r/popover-mutant.cjs`, build HEAD a 1280, regressione simulata con CSS iniettato):
  ```
  (HEAD)                              billing w=206 rewritten=true original=false; fleet/logbook w=180 true/true
  .export-menu-panel{min-width:320px} billing/fleet/logbook w=320 → rewritten=TRUE  original=false
  width:640px                         billing/fleet/logbook w=640 → rewritten=TRUE  original=false
  ```
  Se cade la `min-width: 180px` di `.export-menu-panel`, torna la `min-width: 320px` di `.popover` (`airops.css:1487`). L'asserzione nuova resta verde con un popover largo 320 o 640 px, mentre il test si chiama «il popover di sempre a 1280».
- **Fix**: un tetto misurato, per esempio `w ≤ 240`, oppure `w` uguale a `max(180, voce più larga + 2×14 + 2)`. In alternativa, larghezza esatta per pagina: 180 su Velivoli e Registro voli, 206 su Contabilità.

### L3 (LOW): Registro voli, lo scroll orizzontale del documento a 641-1100 px (preesistente) cresce di 50 px

- **Dove**: `src/app/[locale]/dashboard/logbook/logbook-console.tsx:214` (colonna persona `minmax(150px…)` → `minmax(200px…)`, §H D-f).
- **Riproduzione** (`scratchpad/r/cols.cjs`: sullo stesso DOM si misura lo scroll del documento con la griglia attuale e con quella vecchia; stessi numeri da admin e da pilota):
  ```
  width  nowDoc oldDoc     (scrollWidth − clientWidth del documento)
  1280      0      0
  1100     99     49
  1024    175    125
   900    131     81
   768    263    213
   700    331    281
   641    390    340
  ```
  Il difetto c'era già prima (lo scroller interno `.logbook` non contiene la griglia), ma la story lo peggiora di 50 px a ogni larghezza tablet. Piloti (+18 px, solo nello scroller interno `.students`) e Prenotazioni (minimo invariato) non producono scroll del documento. La causa preesistente spetta alla 18.5; qui va segnalata come peggioramento misurato.

### L4 (LOW): Scadenze mobile, i giorni in coda alla sotto-riga ora tagliati dove prima stavano su una riga (AC 22)

- **Dove**: `messages/it.json:1174-1175` (`ExpiriesPage.registry.daysAgoSuffix` «g fa» → « gg fa», `daysSuffix` « g» → « gg»), concatenati in `.mobile-row-sub`.
- **Riproduzione** (`scratchpad/r/subline.cjs`, copy vecchia rimessa nel DOM sullo stesso nodo):
  ```
  375  «Inglese ICAO · 31/10/2026 · 3 gg fa»    cw 205 → nuovo TAGLIATO, vecchio («3g fa») intero
  390  «Quota associativa · 28/11/2026 · 25 gg» cw 219 → nuovo TAGLIATO, vecchio («25 g») intero
  ```
  La parte tagliata è proprio il numero di giorni. Le righe con un nome di tipo lungo («Visita medica classe 2 · …») erano già tagliate prima: il record §D le classifica come preesistenti, e lo sono. Queste due no. Gravità bassa: il badge di stato della riga resta visibile e la regola D-3 («7 gg») è del glossario. Una soluzione possibile è mettere i giorni in testa alla sotto-riga, come fa D-c per i chip dei Piloti.

### L5 (LOW): Panoramica, lo sheet della prenotazione chiama la persona «Pilota», mentre tabella, agenda ed export dicono «Persona» (D-5 applicata a metà)

- **Dove**: `messages/it.json:222` (`DashboardPage.mobile.detail.pilot` = «Pilota»), letto da `src/app/[locale]/dashboard/page.tsx:177` e `:196` per ogni prenotazione, anche di un allievo. La B.2 ha portato `BookingsPage.list.table.pilot` a «Persona» (tabella, agenda mobile, Excel e PDF), ma questa chiave no.
- **Evidenza** (`scratchpad/r/personlabel.cjs`, stessa prenotazione, admin a 375):
  ```
  Panoramica sheet: … | VELIVOLO | I-B412 | PILOTA | Chiara Esposito | …
  ```
  Export Excel «Prenotazioni»: intestazione `Velivolo | Persona | Istruttore | Inizio | Fine | Stato`.
- **Fix**: «Persona» (IT; per l'inglese decide AD-2).

### Info (non richiedono fix in questa story)

- **I1**: in §E il record riporta per il mutante (a) l'sha256 di `messages/it.json` `f5c4f5e7…` come «uguale al repo», ma il file committato è `eaaed88e…`. Il mutante è stato quindi eseguito su una versione precedente del catalogo. L'ho rieseguito sulla HEAD: rosso col mutante (v. M1), verde dopo il ripristino. Gli hash di `[...rest]/page.tsx` (`7de4aefc…`) e `aircraft-editor.tsx` (`75529001…`) coincidono invece con HEAD.
- **I2**: tab bar mobile del pilota e dell'allievo (M6). In IT migliora: a 360-414 «Estratto conto» sta su una riga, mentre «Le mie transazioni» ne occupava due. In EN, a 390-414, «Account statement» va su due righe dove «My transactions» ne occupava una. Non è tagliata, la parola è una decisione PO e la dimensione della tab bar è della 18.5: da annotare nella nota per la 18.5.
- **I3**: corsia del calendario desktop per un velivolo fuori servizio: pill della risorsa «● Fuori servizio» e testa del blocco «Fuori servizio» (`schedule.tsx:618`, `:637`) ripetono la stessa parola dove prima ripetevano «AOG». Nessun taglio. È solo un'osservazione per chi corregge M2.

## 4. Verifiche passate (evidenza)

Server: build di produzione della HEAD (quella dell'arbitro) su `:3100`, gemello `airmanager_r1912b` (migrate + seed + `seed:demo`), script `playwright-core` in `scratchpad/r/`.

1. **Copy contro glossario e decisioni PO**:
   - §3.1 rieseguito sulla HEAD: tutto a 0, salvo `slot 1`, che è il nome dell'argomento `{slot, plural}` (AC 4 ✓).
   - Scansione case-insensitive delle ~40 varianti del glossario sul catalogo IT: 0 occorrenze nel testo (i match restanti sono nomi di argomento, «voce/utente» in contesti ammessi, «aeroporto» di partenza/arrivo, «transazione» solo in Contabilità).
   - AC 17 `grep "[Ss]ei (stat|sicur|pront)[oa]"` = 0; AC 18 `CFI` nei tsx = 0; AC 21 `'invitato'` in e2e = 0.
   - Testo cablato fuori catalogo (letterali e JSX in `src/app`, `src/components`, template mail, adapter PDF): nessuna variante vietata in testo per l'utente.
   - Le tabelle §B confrontate per chiave con il diff reale di `it.json`: 236 chiavi cambiate, 236 righe, nessuna mancante e nessun «dopo» diverso.
2. **Lettura in contesto**: 130 pagine (admin 11, istruttore 5, pilota 5, allievo 5 × 1280/900/768/641/375). Varianti vietate a schermo: solo dati («Admin AirManager», «velivolo fermo tutto il giorno» del seed) e «Ratings» come nome di sezione (R5). Testi tagliati: v. M2 e L4. Gli altri sono preesistenti o dati: descrizioni dei movimenti in Contabilità, tratte del Registro voli, i chip D-c dei Piloti, che tagliano il nome del tipo lasciando visibile lo stato in testa, come voleva la deviazione.
3. **Email**: oggetto e corpo del fuori servizio letti in Mailpit («Velivolo fuori servizio: I-B412», «Fuori servizio: rientro da definire», virgolette «» nel promemoria via unit). L'oggetto dell'invito è provato da 20 spec (`'invito'`).
4. **Export** (`scratchpad/r/xlsx.cjs`, 15 download dai menu reali): ogni foglio prende il nome della voce del menu (Velivoli, Persone, Istruttori, Voli, Transazioni, Prenotazioni, Scadenze, Estratto conto); intestazioni «Velivolo», «Persona», «Compenso orario», «Totale dovuto», «Addebito»; i PDF partono con `%PDF-` (i titoli sono provati in `exports.service.test.ts`). «Aereo certificato» nell'Excel dei velivoli è il `type` libero del seed demo: dato, §6.
5. **Riga di conferma e MAJOR-2** (`scratchpad/r/confirm.cjs`, `dbl.cjs`, `detail2.cjs`):
   - Disposizione: domanda sopra, Conferma e Annulla sulla stessa riga sotto, Annulla dopo Conferma, nessun overflow. Vale per **=0, 1, N e «non disponibile»** a 1280/1024/900/768/700/641/640/414/375/320 (40 combinazioni, tutte vere).
   - Striscia sovrapposta al trigger: 13,63 px (1 riga, ≥641), −1,59 («non disponibile», 2 righe, ≥641), 22,78 (640), 7,56 (≤414), −7,66 (320, «non disponibile», 3 righe). Le misure del dev a 1280 e 375 coincidono.
   - **Proprietà**: doppio clic (mouse) e doppio tocco (touch) sul bordo sinistro, al centro e sulla striscia, a 1280/900/768/641/640/375/320: **0 POST su 36 gesti**, velivolo sempre `OPERATIONAL`.
   - **Discriminanza**, rifatta da me su una copia isolata con build mutante (guardia `event.detail` rimossa + catch-all rimosso), `TMPDIR` separato, `:3200`, DB `airmanager_r1912b_mut`. Risultato: `error-pages:40`, `:48` e `aog-impact-email:397`, `:475` **rossi** (`Expected: "Pagina non trovata" / Received: "404"`; `a double click at 821.73,784.09 must not reach the grounding endpoint`; `a double tap must not reach the grounding endpoint`). La metà `detail: 2` presa da sola, con la stessa sequenza del test: mutante `postsAtTestAssertion 1`, `OUT_OF_SERVICE`; HEAD `0`, `OPERATIONAL`. Quindi il test resta discriminante anche dove la striscia non c'è. Ripristino: `sha256sum -c` OK su entrambi i file, in copia e nel repo.
6. **Pagine d'errore e catch-all** (`scratchpad/r/errors.cjs`):
   - `/it/ppr`, `/en/ppr` e `/ppr` da anonimo: 404 nella lingua giusta, `<html lang>` it/en.
   - Da autenticato, `/it/una-pagina…`, `/en/a-page`, `/it/dashboard/nope`, `/it/dashboard/fleet/nope`, `/it|en/dashboard/people/does-not-exist`, `/xx/ppr`: 404 con la card AirOps.
   - Route vere 200: `/it/dashboard`, `/settings`, `/my-account`, `/people/{id}`. **`people/{id}/account` resta un 307 verso `people/{id}`** (non intercettato).
   - API: `GET /api/v1/health` 200, `POST` 405; `DELETE /api/v1/aircraft` 405 (admin) e 401 (anonimo); `/api/v1/people/does-not-exist` 404 JSON; `/api/v1/does-not-exist` 401 JSON da anonimo e 404 HTML da autenticato (il dev l'aveva già notato); `/api/auth/session`, `/favicon.ico` e `/api/v1/openapi.json` 200.
   - Errore di render (server `:3101` con DB inesistente, cookie di `:3100`): 500 con «Si è verificato un errore» / «Something went wrong», `lang` corretto, chiaro e scuro, «Riprova» funzionante, 0 overflow. Nell'HTML nessun nome di DB, nessun Prisma, nessuno stack: il dettaglio resta solo nel log del server.
7. **Deviazioni oltre §L**:
   - Popover Esporta (`scratchpad/r/export.cjs`, 88 aperture su 11 pagine × 8 larghezze): tutti dentro il viewport, una riga per voce (35 px desktop, 44 px sheet), larghezza da 180 a 206 px a 1280.
   - Conferma di annullamento della prenotazione: «Sì, annulla» e «No, mantienila» sulla stessa riga a 1280/900/641. «Segna come effettuata» (133 px) e «Segna come assente» (123 px) non tagliate.
   - Badge currency dei Piloti a 1280: non tagliato.
8. **e2e**:
   - I 28 locator `flight-form-submit` puntano a un solo nodo (la suite è verde). Nessun selettore `^=` su `flight-form` (`grep -rn 'data-testid\^=' e2e/`).
   - Testid nuovi (`out-of-service-question`, `flight-form-submit`, `error-page*`) unici e fuori dalle convenzioni `-mobile`/`mobile-`.
   - Nessuna asserzione sotto test indebolita a locatore, salvo L2. Le asserzioni `not.toContainText` rilette sono ancora significative (la `'CFI'` → `'Istruttore:'` di `mobile-logbook`).
9. **Inglese (AD-2)**: le uscite dall'elenco chiuso sono motivate. F6 della 19.11 chiede esplicitamente «IT ed EN»; `ExpiriesPage.dashboard.heading` e `CashReportPage.title` fanno coincidere il titolo del file con la voce del menu, già in inglese «Expiries (PDF)» / «Cash report (PDF)», cioè AD-6. Le uscite sono giustificate. Nota di stile, non un finding: «Balance at the start of 01/07/2026» suona meno naturale di «Opening balance on …».
10. **Parità e chiavi**: 1443 chiavi per lingua; il test di parità della 19.12a è verde; l'unica chiave rimossa (`Export.buttonPdf`) non ha più letture (`grep` = 0).

## 5. Pulizia

Server `:3100`, `:3101` e `:3200` fermati. Gemelli `airmanager_r1912b` e `airmanager_r1912b_mut` cancellati: in `pg_database` restano `airmanager`, `airmanager_1912b*` (del dev, non toccati), `airmanager_audit` e `airmanager_load`. La copia isolata dello scratchpad è ripristinata e verificata con sha256, e la sua `.next` è cancellata. Nessun file del repo è stato modificato. L'unico scritto è questo report.

## 6. Artefatti (scratchpad, non committati)

`/tmp/claude-1000/-home-admin-AirManager/af449493-cc12-476a-90ac-651351693579/scratchpad/r/`: `errors.cjs`, `confirm.cjs`, `dbl.cjs`, `detail2.cjs`, `export.cjs`, `popover-mutant.cjs`, `cols.cjs`, `layout.cjs` (+ `layout.json`), `subline.cjs`, `agendaclip.cjs`, `aogsheet.cjs`, `personlabel.cjs`, `tabbar*.cjs`, `xlsx.cjs`, `err500.cjs`, `leak.cjs`; screenshot in `r/shots/`. Log della serie mutante: `scratchpad/muttmp/airmanager-e2e/last-run.log`.

## 7. Note per il fix: le quattro decisioni PO del 2026-11-03 (aggiunta dopo la review, non sono finding)

Le ho ricavate leggendo il codice e i test della HEAD `170229b`. Indicano dove vive ogni testo e quali test lo asseriscono.

1. **Sezione Piloti: resta com'è.** Nessuna nota.
2. **Saluto «Ciao, {name}» per tutti i ruoli.**
   - Chiavi: `DashboardPage.instructorLanding.greeting` («Buongiorno, {name}» / EN «Good morning, {name}»), letta in `src/app/[locale]/dashboard/page.tsx:906`. La chiave del pilota e dell'allievo è già «Ciao, {name}» / «Hi, {name}» (`:1045`). L'admin non ha saluto: il suo H1 è «Panoramica operativa».
   - **Trappola e2e**: quattro asserzioni usano il saluto come discriminante del landing istruttore.
     - `e2e/home-dashboard.spec.ts:181` e `:209` e `e2e/mobile-overview.spec.ts:529` (`/^Buongiorno, /u`, positive) vanno riscritte su `/^Ciao, /u`. Per l'istruttore restano vere e non ambigue.
     - **`e2e/home-dashboard.spec.ts:224`** è un `toHaveCount(0)` dopo la disattivazione del profilo istruttore. Lasciato su `/^Buongiorno, /` resta verde per costruzione, ma smette di provare qualcosa (stessa classe dei `not.toContainText` di AD-7). Sostituirlo con `/^Ciao, /` può renderlo falso se quell'utente atterra su un landing che saluta. Il saluto non distingue più i landing: la riga va tolta, perché le ancore positive `kpi-payout-rate` e `instructor-landing-myday-empty` a `:222-223` bastano. In alternativa va sostituita con un testid del landing istruttore.
3. **Riga del digest «{tipo}: scadenza superata da N giorni».**
   - Testo attuale: la frase viene da `expiryDaysPhrase()` (`src/server/adapters/mail/templates.ts:135-145`, chiave `Emails.expiryDays.expiredDaysAgo` «è scaduta da {days, plural, …}»). La funzione è **condivisa per scelta** fra l'avviso al titolare e il digest dello staff: il doc-comment a `:113-133` dice «one catalogue entry, not two copies».
   - **Trappola**: non va cambiata la chiave condivisa. Nell'avviso al titolare il soggetto è «La tua scadenza «X» …» (`Emails.expiryAlert.body`) e «è scaduta da N giorni» lì è corretto. Serve una chiave dedicata nel namespace del digest, per esempio `Emails.expiryDigest.expiredDaysAgo` = «scadenza superata da {days, plural, one {# giorno} other {# giorni}}», con la parità EN e lo stesso argomento `days` plurale (il test di parità della 19.12a lo controlla). Va usata in `buildExpiryDigestEmail` (`:181-199`) solo quando `daysLeft < 0`, e il doc-comment condiviso va aggiornato. «scade oggi» e «scade tra N giorni» non accordano con il tipo e possono restare condivise.
   - Riga risultante con `itemLine`: «- Mario Rossi — Rating SEP: scadenza superata da 3 giorni (il 01/11/2026)».
   - **Test**: `src/server/adapters/mail/templates.test.ts:177` (digest, `toContain('è scaduta da 3 giorni')`) va cambiato. `:113` (avviso al titolare, stessa stringa) **deve restare com'è**: diventa la prova che i due template ora divergono. Nessun e2e legge il digest in Mailpit (`grep "Riepilogo avvisi" e2e` = 0), quindi la copertura resta unit.
4. **`Export.pdfTooLarge` «… o scarica l'Excel».**
   - **e2e da aggiornare**: `e2e/account-statement-period.spec.ts:563` asserisce la stringa intera: `"PDF non disponibile: il periodo ha più di 2000 movimenti. Restringi il periodo o usa l'export Excel."`.
   - Letta in `people/[id]/page.tsx:431` e `my-account/page.tsx:171`.
   - L'apostrofo di «l'Excel» non precede una graffa, quindi è sicuro in ICU.
   - Testo più corto di quello attuale: la nota ha `width: 260px` (`.export-menu-unavailable`) e il controllo di overflow a `:579` resta valido.
   - EN («… or use the Excel export.») cambia solo se la sessione principale lo mette nell'elenco di AD-2.
