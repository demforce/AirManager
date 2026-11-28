---
baseline_commit: 47d0d33
---

# Story 14.3: Regole voli scuola — l'allievo vola SOLO scuola, e il PIC è esplicito

Status: done (review Opus 5 shippable-with-fixes — 1 major di CORRUZIONE DATI + vicolo cieco, fix `0a8c8f1` + 2 ratifiche PO, arbitro 299/299 — 2026-07-29)

## Story

As a gestore della scuola volo,
I want che un allievo possa registrare SOLO voli scuola (sempre con un istruttore) e che il registro dica chiaramente CHI era il pilota responsabile,
so that il libretto rispecchia la realtà addestrativa e nessuno registra per errore un turismo a nome di un allievo.

**Riferimenti vincolanti**: piano epic 14 (item 2), **ratifica R1**: (1) un ALLIEVO vola SOLO `SCHOOL`; (2) OGNI volo scuola richiede un istruttore, anche il SOLISTA; (3) fatturazione solista INVARIATA (story 9.4: addebita e compensa l'istruttore come il doppio comando). **PIC** (domanda utente in ratifica): derivato da `isSolo` — doppio comando ⇒ PIC istruttore, solista ⇒ PIC allievo — da rendere ESPLICITO in UI/registro, senza campi nuovi.

**Ricognizione preliminare (2026-07-29) — la premessa del piano è PARZIALMENTE GIÀ SODDISFATTA**: il vincolo R1(2) esiste già (`flights.service.ts:419-420`, `SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR`, applicato anche al solista perché il check non guarda `isSolo`), e R1(3) è la semantica 9.4 in vigore. Manca R1(1) e manca il PIC esplicito. Il dev VERIFICHI questa ricognizione prima di implementare e la corregga se sbagliata (precedente: le premesse di 14.6/14.8 erano inesatte, i dev l'hanno provato e documentato).

## Acceptance Criteria

1. **(Allievo ⇒ solo SCHOOL)** Registrare un volo `TOURISM` o `AERIAL_WORK` per una persona con profilo ALLIEVO attivo e SENZA profilo pilota attivo è rifiutato con un errore di dominio dedicato (es. 422 `STUDENT_FLIGHT_MUST_BE_SCHOOL`), lato servizio (`resolveFlightInput`) — non solo in UI. Chi ha ENTRAMBI i profili attivi (allievo che ha preso la licenza) NON è vincolato: decide il tipo volo come un pilota. Regola espressa sul PROFILO ATTIVO, mai sul ruolo (lezione 14.6).
2. **(UI coerente)** Nel form volo (`logbook/flight-editor.tsx`), selezionato un allievo, il campo Tipo volo offre/forza SCHOOL con messaggio chiaro (nessun vicolo cieco: mai lasciar scegliere un'opzione che il server rifiuterà — lezione 14.6 F2), e l'istruttore resta obbligatorio (vincolo già esistente).
3. **(PIC esplicito)** Il registro voli e il dettaglio del volo mostrano CHI è il PIC: doppio comando ⇒ l'istruttore, solista ⇒ l'allievo. Presentazione (badge/colonna/label i18n IT-EN) coerente AirOps; nessun campo nuovo nel modello — è derivato da `isSolo`. Enumerare TUTTE le superfici che mostrano un volo scuola (registro, dettaglio, export xlsx/PDF, scheda persona se applicabile) e decidere per ognuna se il PIC ci va, motivando.
4. **(Invarianti)** Fatturazione e compensi INVARIATI (9.4: il solista addebita e compensa l'istruttore come il doppio — Billing-1 AC4 crea il gemello di cassa del payout). Nessun cambio a `isSolo`, `SOLO_REQUIRES_SCHOOL`, `SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR`. I voli storici restano leggibili e non vengono riclassificati.
5. **(Test)** Unit: allievo+TOURISM → 422 col codice nuovo; allievo+SCHOOL+istruttore → OK; doppio profilo → TOURISM ammesso; solista senza istruttore → resta 422 col codice esistente. e2e: il form non lascia scegliere un tipo che verrà rifiutato; un volo scuola doppio mostra il PIC istruttore e un solista il PIC allievo nel registro. Full suite CI=1 verde; unit test in shell PULITA (`env -u DATABASE_URL -u AUTH_SECRET`, lezione 14.7 F1).

## Contesto (puntatori — ricognizione 2026-07-29)

- Servizio: `src/server/services/flights.service.ts` — `resolveFlightInput` (`:419` requisito istruttore, `:426` `SOLO_REQUIRES_SCHOOL`, `:433` istruttore ≠ pilota), eleggibilità persona (`:354-371`: pilotProfile/studentProfile attivi), `PERSON_ARCHIVED`/`AIRCRAFT_ARCHIVED`.
- Schemi: `src/lib/schemas/flights.ts` (`flightTypeSchema` `:9`, `isSolo` `:92`/`:136`).
- UI: `src/app/[locale]/dashboard/logbook/flight-editor.tsx` (picker pilota/istruttore via `SearchCombobox` con `profile: 'pilot-or-student' | 'instructor'`), registro `logbook-console.tsx`.
- Export: `exports.service.ts` (xlsx/PDF logbook) — superficie da valutare per il PIC (AC3).
- **Ambiente**: ciclo e regole macchina come `docs/handoffs/HANDOFF.md`; reset DB in questa sandbox via docker compose (`scripts/reset-db.sh` NON funziona). Story con UI → `design-taste-frontend` + `ui-ux-pro-max`. e2e: spec singoli a `--workers=1`, helper di lookup riga (mai pagina 1 su DB sporco), gate vero = full suite CI=1 prod. Commit su `dev`: `feat(14.3): regole voli scuola — allievo solo SCHOOL, PIC esplicito` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato

- Guard-rail su visita medica/scadenze e alert saldo negativo (story 14.4).
- Qualsiasi cambiamento ai calcoli di addebito/compenso.
- Riclassificazione dei voli storici.

## Dev Agent Record

### Gate finale

- `npm run gates`: `PASS lint (32-37s)` · `PASS typecheck (5s)` · `PASS test (14-15s) — Tests 1581 passed (1581)` · `PASS build (40-53s)`.
- Unit nuovi/toccati in shell pulita (`env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/server/services/flights.service.test.ts`): **117/117 verdi** (nessuna validazione eager di `@/lib/env` trascinata, lezione 14.7 F1 — questo file non importa nulla di nuovo).
- Full suite e2e (DB fresco, build prod `env -u NODE_ENV npx next build`, `JOBS_SECRET` non-placeholder, `CI=1 npx playwright test` in background con `nohup`/`disown`, atteso con un monitor sul PID reale — non su un grep testuale, che dava un falso positivo su un titolo di test contenente la parola "failed"): **298 passed (10.6m)**, exit 0, **zero failed, zero flaky**. Include il nuovo test AC2 (`flights.spec.ts:532`) e il test PIC dual/solo preesistente (`flights.spec.ts:462`), entrambi verdi; `my-account.spec.ts` verde col fix fixture.

### Verifica della ricognizione preliminare (2026-07-29)

**Confermata E CORRETTA in un punto ulteriore.** La ricognizione del 2026-07-29 diceva "manca R1(1) [allievo-solo-SCHOOL] e manca il PIC esplicito" — la prima metà è esatta, la seconda è **sbagliata**: il PIC esplicito (AC3) era **già interamente implementato**, non solo nel registro:

- **Registro** (`logbook-console.tsx:435`): `flightPicPerson(flight)` popola una colonna dedicata `data-testid="flight-pic-cell"` (story 11.2/12.8, già testata in `e2e/flights.spec.ts:462-530` per dual E solo).
- **Export xlsx** (`exports.service.ts:251-260`, story 11.3 AC4): colonna `list.table.pic` con la STESSA `flightPicPerson`.
- **Export PDF** (`exports.service.ts:656-664`, story 11.3 AC4): stessa colonna, stesso helper.
- **Scheda persona** ("Ultimi voli", `people/[id]/page.tsx:416-434`): NON mostra il PIC — ma non mostra nemmeno `flightType`/istruttore, è un widget compatto (tratta/data/durata/stato) con link "Vedi tutti" verso il registro completo. Deciso: **nessun PIC qui** (fuori scope aggiungere dettaglio a un widget deliberatamente minimale; il deep-link porta al registro che lo mostra già).

Il vincolo istruttore-obbligatorio-anche-sul-solista (R1/2) era anch'esso già in vigore (`SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR`, non guarda `isSolo`) — confermato con un test dedicato NUOVO (mancava una copertura esplicita per il caso solista) invece che dare per buona la ricognizione.

**Conclusione**: il lavoro REALE di questa story si è ridotto a AC1 (server) + AC2 (UI) + i test dell'AC5. AC3/AC4 erano già soddisfatti: nessuna riga toccata lì, solo verificati (unit esistenti + e2e esistenti + lettura codice).

### AC1 — allievo (solo profilo allievo attivo) ⇒ solo SCHOOL

`resolveFlightInput` (`flights.service.ts`): sostituito il booleano unico `hasActivePilotOrStudent` con `hasActivePilot`/`hasActiveStudent` separati; nuovo controllo subito dopo (prima di qualunque altra validazione di dominio):

```ts
if (hasActiveStudent && !hasActivePilot && input.flightType !== 'SCHOOL') {
  throw new ValidationError(..., 'STUDENT_FLIGHT_MUST_BE_SCHOOL');
}
```

Condiviso da `registerFlight`/`correctFlight` (stessa funzione, invariato lo schema di riuso già esistente per gli altri codici). Chi ha ENTRAMBI i profili attivi non è toccato (`!hasActivePilot` nella guardia). Nessun cambio a `SOLO_REQUIRES_SCHOOL`/`SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR`/`isSolo` (AC4).

### AC2 — form: mai un vicolo cieco

`flight-editor.tsx`: il picker "Pilota o allievo" ora porta con sé i flag di profilo attivo (`profiles: {pilot, student}`) sia dal primo elenco server-rendered (`personOptions`) sia dalla ricerca live (`searchPilotStudent`, che aggiorna una mappa `personId -> profiles` mano a mano che l'operatore digita). Alla selezione di una persona SOLO-allievo (`isStudentOnly`): il campo Tipo volo viene **forzato** a SCHOOL (`setValue` + stato locale) e **disabilitato**, con un messaggio (`Field.hint`, nuovo prop neutro sul primitivo condiviso, stesso slot di `error`) — mai lasciata un'opzione che il server rifiuterebbe. Il blocco si ri-deriva ad OGNI render dal `personId` corrente (non un flag "one-shot"), quindi selezionare poi un pilota semplice sblocca di nuovo il campo. Stessa `FlightEditor` è riusata identica da `dashboard/page.tsx` (CTA "Pianifica volo") — un solo punto di modifica copre entrambe le superfici.

**Limite noto, documentato**: il prefill di "Correggi volo" arriva dalla `FlightListItemDto` del volo, che non porta i flag di profilo della persona — se quella persona non è tra le prime ≤100 opzioni caricate dal server, il blocco non scatta finché l'operatore non la ri-seleziona esplicitamente. Non è un vicolo cieco: il servizio resta l'autorità (rifiuta comunque con `STUDENT_FLIGHT_MUST_BE_SCHOOL`, mappato a un banner d'errore leggibile) — è solo un hint proattivo più stretto in quel caso limite.

### AC5 — test

- **Unit** (`flights.service.test.ts`): sostituito il vecchio test "accetta allievo+TOURISM" (contraddiceva la nuova regola) con 3 nuovi + 1 di copertura invariante: allievo-solo+TOURISM → 422 `STUDENT_FLIGHT_MUST_BE_SCHOOL`; allievo-solo+SCHOOL+istruttore → OK; doppio profilo+TOURISM → OK; SOLO SCHOOL senza istruttore → 422 `SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR` (invariante AC4, non c'era un test dedicato a questo esatto caso). 117/117 verdi, anche in shell pulita (`env -u DATABASE_URL -u AUTH_SECRET`).
- **e2e** (`flights.spec.ts`): nuovo test — persona solo-allievo selezionata nel form ⇒ Tipo volo forzato/disabilitato su SCHOOL con messaggio visibile, e la submission (con istruttore) va a buon fine (niente vicolo cieco). PIC dual/solo era già coperto da un test esistente (11.2/12.8), non duplicato.
- **Fix di un test esistente rotto dalla nuova regola** (`my-account.spec.ts`): "un allievo vede le proprie transazioni" registrava un volo TOURISM per una persona SOLO-allievo — ora attiva ANCHE un profilo pilota per quella fixture (doppio profilo ⇒ non vincolato), zero altre modifiche (stesso saldo atteso, stesse asserzioni di self-access). Auditati tutti gli altri e2e che toccano `/api/v1/flights` con una persona-allievo: nessun altro caso a rischio (gli altri usano sempre SCHOOL per l'allievo o un pilota per il TOURISM).

### File List

- `src/server/services/flights.service.ts` — nuova regola AC1 + doc-comment.
- `src/server/services/flights.service.test.ts` — test AC1/AC4 aggiornati/aggiunti.
- `src/components/ui/field.tsx` — nuovo prop `hint` (neutro, stesso slot di `error`).
- `src/styles/airops.css` — `.fld-hint`.
- `src/app/[locale]/dashboard/logbook/flight-editor.tsx` — forzatura/blocco Tipo volo (AC2).
- `src/app/[locale]/dashboard/logbook/logbook-console.tsx` — tipo `PilotStudentOption` per `personOptions`.
- `src/app/[locale]/dashboard/logbook/page.tsx` — `personOptions` porta `profiles`; nuove label.
- `src/app/[locale]/dashboard/dispatch-flight-button.tsx` — tipo `PilotStudentOption`.
- `src/app/[locale]/dashboard/page.tsx` — `dispatchPersonOptions` porta `profiles`; nuove label (CTA "Pianifica volo" riusa lo stesso `FlightEditor`).
- `messages/it.json`, `messages/en.json` — `LogbookPage.editor.fields.studentOnlyHint` + `LogbookPage.editor.errors.STUDENT_FLIGHT_MUST_BE_SCHOOL` (IT/EN).
- `e2e/flights.spec.ts` — nuovo test AC2.
- `e2e/my-account.spec.ts` — fix fixture (doppio profilo) per il test allievo.

## Review Record

Reviewer adversarial (Opus 5 xhigh), 2026-07-29 — perimetro `git diff 4575bc9..HEAD` (`764c8a2` feat, `2fe7dae` docs).

### Gate arbitro (rieseguito dal reviewer, non fidandosi del Dev Agent Record)

- **Full suite e2e su DB fresco** (`docker compose down -v && up`, `prisma migrate deploy && db seed`, build prod `env -u NODE_ENV`, `JOBS_SECRET` non-placeholder, `CI=1 npx playwright test` in background atteso sul PID): **298 passed (9.1m), 0 failed, 0 flaky** — coincide col claim del dev. Verdi anche i due test della story (`flights.spec.ts:532` AC 2, `flights.spec.ts:462` PIC dual/solo) e `my-account.spec.ts:226` con la fixture corretta.
- `npm run gates`: PASS lint (17s) · PASS typecheck (3s) · PASS test (6s) — 1581 passed · PASS build (27s).
- Unit in shell pulita (`env -u DATABASE_URL -u AUTH_SECRET`): 121 passed (`flights.service.test.ts` + `flight-pic.test.ts`).

### Verifiche empiriche (API reale + psql + UI reale)

- **AC 1 (servizio)**: `POST /api/v1/flights` e `POST /api/v1/flights/{id}/correct` — allievo-solo + TURISMO/LAVORO AEREO → 422 `STUDENT_FLIGHT_MUST_BE_SCHOOL` (admin **e** staff); doppio profilo + TURISMO → 201; SCHOOL solista senza istruttore → 422 `SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR`; archiviato → `PERSON_ARCHIVED`; profilo disattivato → `PERSON_NOT_PILOT_OR_STUDENT`; allievo con pilota disattivato → vincolato (e `profiles` del DTO coerente). RBAC: istruttore/pilota/allievo → 403.
- **AC 3 / D1**: PIC verificato sulle superfici VIVE — registro (`flight-pic-cell`), xlsx aperto con exceljs, PDF decodificato dai content stream: dual → istruttore, solista → allievo su tutte e tre. Ricognizione del dev confermata.
- **AC 4**: dual e solista **identici** (12000 aircraft + 4000 istruttore → addebito -16000 in entrambi); compenso maturato su entrambi; payout 8000 → CashMovement -8000 «Compensi istruttori».
- **AC 2**: forzatura/lock e sblocco verificati in entrambe le direzioni, in IT e EN, su registro e CTA dashboard; contrasto `.fld-hint` misurato 4.85:1 (light) / 5.72:1 (dark) @12px.

### Findings

| # | Sev | Titolo |
|---|-----|--------|
| F1 | major | «Correggi volo» riscrive silenziosamente il Tipo volo di un volo storico non-SCHOOL e, alla conferma, lo riclassifica e lo **ri-addebita** (evidenza psql: -10000 → storno +10000 → -14000) |
| F2 | major | Vicolo cieco reale: con la persona fuori dalle prime 100 opzioni, dopo una ricerca il select si **blocca su TOURISM** — 422 ad ogni submit e campo non modificabile |
| F3 | minor | Un volo storico non-SCHOOL di una persona diventata solo-allievo non è più correggibile in alcun modo (422 anche senza cambiare tipo) — decisione di dominio da ratificare |
| F4 | minor | `Field.hint` non è collegato al controllo via `aria-describedby` (il campo disabilitato non ha spiegazione per gli AT), a differenza dello slot `error` (fix F8 della 14.2) |
| F5 | nit | Nuovo e2e AC 2: `page.getByText(...)` page-level invece che scoped al form (classe lezione 103-F1) |

F1 e F2 hanno la **stessa causa radice**: il lock (`disabled={personIsStudentOnly}`, `flight-editor.tsx:621`) è ri-derivato ad ogni render, mentre la forzatura del valore avviene solo in `handlePersonChange` (`:315`) e nel valore iniziale (`:267`/`:298`). Invariante da imporre nel fix: **`disabled ⇒ value === 'SCHOOL'`**, e in modalità `correct` mai riscrivere il tipo del record senza dirlo.

### Verdetto deviazioni

D1 confermata (verificata empiricamente) · D2 accettata (nessuna asserzione indebolita, audit regge) · D3 accettata con F4 · D4 accettata · **D5 respinta come descritta** (non è un hint più stretto: è F2 + F1).

**Verdetto: shippable-with-fixes** — la regola di dominio e gli invarianti economici sono solidi e verificati; il layer UI della correzione va sistemato (F1/F2) prima di chiudere la story, e F3 va ratificato con l'utente.

### Fix post-review (2026-07-29, fix-subagent + sessione principale — commit `0a8c8f1`)

**Ratifiche PO (AskUserQuestion 2026-07-29)**:
- **R-14.3-a**: la correzione di un volo storico è SEMPRE ammessa purché NON se ne cambi il tipo (note/orari/contaore restano correggibili). Il divieto AC1 vale per REGISTRARE o PORTARE un volo a un tipo non-scuola.
- **R-14.3-b** (chiarimento di dominio dell'utente): "la licenza è a VITA, nessun pilota dovrebbe perdere il profilo pilota; un pilota deve poter essere abilitato a un volo SCUOLA (riprese per la currency, rinnovo SEP)". Il secondo punto era GIÀ soddisfatto (il vincolo scatta solo per chi ha il SOLO profilo allievo) — ora coperto da un test dedicato e nominato.

- **F1 fixed (major, CORRUZIONE DATI)** — `initialFlightType` è SEMPRE `defaults.flightType`: la UI non riscrive mai il tipo di un volo registrato. In correzione il select non è MAI disabilitato; se la persona è oggi solo-allievo e il volo non è scuola, un messaggio nomina il tipo a file e le conseguenze, e decide l'operatore. (Pre-fix, riprodotto dal reviewer: correggere le NOTE stornava il volo e lo ri-addebitava come scuola, conto da −100,00 a −140,00 €.)
- **F2 fixed (major, vicolo cieco)** — lock e forzatura derivano da UN solo valore (`isLocked` → `effectiveFlightType`, usato sia per il campo sia per il payload): l'invariante `disabled ⇒ value === 'SCHOOL'` vale **per costruzione**, lo stato che causava il vicolo cieco non è più rappresentabile. Nota: il `useEffect` inizialmente previsto è stato RESPINTO dalla regola di lint del progetto (set-state in effetto) — la derivazione pura è risultata più semplice e più forte.
- **F3 fixed (ratifica R-14.3-a)** — `resolveFlightInput` accetta l'`originalFlightType` e salta la guardia quando il tipo richiesto è identico a quello a file; `correctFlight` lo passa, `registerFlight` no. Unit: correzione a tipo invariato → OK; correzione che porta a TOURISM per allievo-senza-brevetto → 422; registrazione nuova non-scuola per allievo → 422.
- **R-14.3-b coperta** — unit dedicato: pilota + SCHOOL + istruttore → OK (currency/rinnovo SEP).
- **F4 fixed** — `Field.hint` collegato via `aria-describedby` come lo slot `error` (un select disabilitato è fuori dal tab order: senza questo, chi usa AT non ha spiegazione).
- **F5 fixed** — selettore e2e scopato al form invece che page-level (classe 103-F1).

**Diagnosi in tre strati del test rosso (sessione principale)** — il nuovo e2e F1/F2 falliva in modo deterministico (3/3 tentativi):
1. **Il test si sabotava**: premeva `Escape` per chiudere il popup del typeahead, ma il listener globale di `SlideOver` (`slide-over.tsx:29-31`) chiude l'INTERO pannello; le asserzioni successive correvano contro l'animazione di chiusura. Provato dallo snapshot Playwright al fallimento (mostrava la pagina registro, non il form). Fix: niente `Escape`, con commento che spiega perché.
2. **Falso allarme d'ambiente**: rimossa quella causa, falliva al login 2 volte di fila. Query al DB invece di attribuirlo alla flake nota: **118 tentativi admin in 15 minuti** → lock anti-brute-force della TD-6 scattato per i run ripetuti sullo stesso DB. Non un difetto: artefatto del metodo di verifica.
3. **Il bug vero, sotto gli altri due**: con DB pulito il messaggio compariva come CHIAVE i18n grezza (`LogbookPage.editor.fields.studentOnlyCorrectionHint`) — il testo contiene un segnaposto riempito lato client, quindi serve `t.raw`: con `t()` la formattazione ICU fallisce e next-intl restituisce il percorso della chiave. **È la lezione già scritta in HANDOFF dal fix post-Epic-13**, non applicata dal dev e invisibile a lint/typecheck/unit.

**Gates post-fix**: PASS lint/typecheck/test/build — 1584 unit (+ shell pulita 120/120 su flights.service).

**Full suite finale (arbitro = sessione principale, DB fresco, build prod)**:

```
299 passed (8.6m)
```
Exit code `0`, zero flaky.

**Esito finale: tutti i findings chiusi. Story DONE.**
