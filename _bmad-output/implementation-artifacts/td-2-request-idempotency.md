---
baseline_commit: 0d4e008
---

# Story TD-2: Idempotenza delle richieste sui POST monetari

Status: done

## Story

As a staff,
I want che un retry di rete di una registrazione monetaria non possa MAI registrarla due volte,
so that ricariche, rettifiche, vendite pacchetto, voli e movimenti cassa restino corretti anche su connessioni instabili (finding 3.1 O2, valutato epic-wide come promesso).

## Acceptance Criteria

1. **Given** due POST identici con lo stesso header `Idempotency-Key` (retry di rete), **When** il primo è andato a buon fine, **Then** il secondo NON riesegue la mutazione e riceve la STESSA risposta (stesso status, stesso body) con header `Idempotency-Replayed: true`.
2. **Given** due POST CONCORRENTI con lo stesso key, **Then** esattamente UNO esegue; l'altro riceve 409 `IDEMPOTENCY_IN_PROGRESS` (se il primo non ha ancora finito) o il replay (se ha finito). Provato con richieste parallele reali.
3. **Given** un POST senza header, **Then** comportamento invariato (il key è opt-in: i client esistenti e gli e2e attuali non si rompono).
4. **Given** un POST fallito con errore 4xx, **Then** il key torna riutilizzabile (il record viene rimosso): l'utente corregge e re-invia con lo stesso key senza restare bloccato.
5. Gli endpoint coperti sono TUTTI i POST monetari: top-up, rettifica, vendita pacchetto, registrazione volo, movimento cassa manuale. (Gli storni/correzioni restano protetti dai loro unique `reversalOfId` esistenti — documentare, non duplicare la protezione.)
6. Le form UI dei 5 endpoint inviano il key (`crypto.randomUUID()`), rigenerato a ogni risposta ricevuta dal server (successo O errore applicativo) e CONSERVATO quando la fetch fallisce a livello di rete — è esattamente il caso che protegge.
7. OpenAPI documenta l'header sui 5 endpoint; migrazione pulita su DB fresco; unit + e2e (replay, concorrenza, opt-out).

## Contesto e decisioni di design (vincolanti)

- **Nuovo modello Prisma `IdempotencyRecord`**: `id` cuid, `userId` (FK RESTRICT a `User`), `endpoint` String, `key` String, `responseStatus Int?`, `responseBody Json?`, `createdAt`, `completedAt DateTime?`; `@@unique([userId, endpoint, key])`. Il record è per-UTENTE: lo stesso key da utenti diversi non collide (niente cross-user replay/DoS). Migrazione hand-written col pattern consolidato (`migrate diff`, banner strippato). NESSUN job di cleanup in questa story (crescita lenta, tabella piccola — decisione documentata nel doc-comment del modello).
- **Integrazione nel layer API, NON nei service** (AD-5 resta intatto: i service non sanno nulla di HTTP): nuova opzione `idempotency?: { endpoint: string }` di `apiRoute` (`src/lib/api/handler.ts`). Quando presente E l'header `Idempotency-Key` c'è (validato: 1–200 char, altrimenti 422 envelope `VALIDATION_ERROR`):
  1. `create` del record con `responseStatus: null` (PENDING). Su P2002 → rileggere: se `responseStatus != null` → **replay** (`NextResponse.json(responseBody, { status: responseStatus, headers: { 'Idempotency-Replayed': 'true' } })`); se ancora PENDING → 409 envelope `IDEMPOTENCY_IN_PROGRESS` ('The same request is still being processed — retry in a moment.').
  2. Eseguire `handle` normalmente. Successo → update del record con status+body serializzato, POI risposta. Errore (DomainError O sconosciuto) → `delete` del record nel `catch`/prima del re-throw (i service sono transazionali: un errore = nessuna scrittura avvenuta, il key DEVE tornare libero — AC 4).
  3. `auth: 'public'` + `idempotency` insieme = errore di programmazione: lanciare in fase di costruzione della route (il record richiede `userId`).
- **Crash window documentata (stesso trade-off di AD-9)**: un crash del processo TRA il commit della mutazione e l'update del record lascia un PENDING orfano → i retry con quel key ricevono 409 per sempre. Accettato e documentato nel doc-comment: il client risolve inviando un nuovo key dopo verifica manuale; NESSUNA auto-scadenza dei PENDING (auto-scadenza = rischio di doppia esecuzione, peggio del blocco).
- **`responseBody` è il JSON già serializzabile che `handle` ritorna** — attenzione ai 204: nessuno dei 5 endpoint coperti risponde 204 (tutti ritornano un DTO), quindi il caso non esiste; mettere comunque un guard esplicito (se `successStatus === 204` e `idempotency` configurata → throw in costruzione, con commento).
- **Endpoint coperti e nomi `endpoint`** (stringhe stabili, usate nell'unique): `account-topup` (POST `/people/{id}/account/top-ups`), `account-adjustment` (POST `/people/{id}/account/adjustments`), `package-sale` (POST `/people/{id}/packages`), `flight-register` (POST `/flights`), `cash-movement` (POST `/cash-movements`). Verificare i path reali nelle route file (i nomi qui sono descrittivi). NON coprire: storni/correzioni/decide (già idempotenti via unique `reversalOfId`/guard esistenti — aggiungere una riga di doc-comment su ciascuno che lo dice), job route (bearer, fuori sessione), CRUD cataloghi (non monetari, unique naturali sui nomi).
- **Nota bene**: l'header attraversa `src/proxy.ts`? Verificare che il middleware non strippi header custom (non dovrebbe — è solo un gate). Niente entry in `PUBLIC_API_PATHS`.
- **UI (AC 6)**: nelle 5 form (top-up in `account-panel.tsx`, rettifica in `account-statement-table.tsx`, vendita in `packages-panel.tsx`, volo in `flights-manager.tsx`, cassa in `cash-register.tsx`): stato locale `idempotencyKey` inizializzato `crypto.randomUUID()`; la fetch di submit aggiunge l'header; al ritorno di QUALSIASI risposta HTTP (ok o errore applicativo) si rigenera; se la fetch LANCIA (network error) il key resta. Pattern identico nei 5 punti (nessuna astrazione nuova se non un piccolo hook condiviso `useIdempotencyKey()` in `src/lib/` client-side, se riduce la duplicazione — a giudizio del dev, dichiararlo).
- **OpenAPI**: header param opzionale riusabile (componente `IdempotencyKey` header) registrato sui 5 path; aggiornare il coverage test del registry se conta i componenti.
- **Test**: unit sul wrapper (replay con body identico, PENDING→409, errore-libera-il-key, senza header = pass-through, header su route senza config = ignorato); e2e su UN endpoint rappresentativo (top-up): stesso key sequenziale → un solo `AccountMovement` e risposta replay identica + header `Idempotency-Replayed`; due POST PARALLELI stesso key → esattamente un movimento (lezione 6.2: race provate con richieste parallele reali); key diversi → due movimenti. Osservabili run-unique (lezione 6.3 F1).

## Tasks / Subtasks

- [x] **T1 (AC 7)** — Modello `IdempotencyRecord` + migrazione hand-written + verifica su DB fresco.
- [x] **T2 (AC 1-4)** — Opzione `idempotency` in `apiRoute` + envelope `IDEMPOTENCY_IN_PROGRESS` + unit test completi del wrapper.
- [x] **T3 (AC 5)** — Config sui 5 endpoint + doc-comment sugli endpoint già naturalmente idempotenti + OpenAPI header + coverage.
- [x] **T4 (AC 6)** — Wiring UI nelle 5 form (+ eventuale hook condiviso, dichiarato).
- [x] **T5 (AC 1-2)** — e2e: replay sequenziale, race parallela, opt-out; su osservabili run-unique.
- [x] **T6** — Gates: lint/typecheck/unit/build/e2e su DB fresco; aggiornare story file (Dev Agent Record) e sprint-status.yaml (td-2 → review).

## Dev Notes

- Ambiente come TD-1 (Mailpit attivo, DB fresco fornito dalla sessione principale; il dev NON resetta il DB; `curl localhost:3000` deve fallire prima di ogni run e2e; build `env -u NODE_ENV npx next build`; MAI `playwright install`).
- UN commit di implementazione (`Story TD-2: ...`). Messaggi server English-only; niente stringhe UI nuove salvo eventuali errori form (IT/EN simmetrici).
- Il wrapper NON deve alterare di un byte il comportamento delle route senza header (AC 3): gli e2e esistenti sono il canarino.

### References

- [Source: _bmad-output/implementation-artifacts/3-1-accounts-topups.md#Review Record — O2]
- [Source: src/lib/api/handler.ts — apiRoute; src/lib/api/pagination.ts]
- [Source: docs/handoffs/HANDOFF.md — lezioni operative; AD-8 envelope; AD-9 trade-off crash-window]

## Dev Agent Record

### Agent Model Used

Sonnet 5 (single dev agent, xhigh)

### Debug Log References

- **Ambiente**: sessione iniziata con DB `airmanager` genuinamente fresco (2 `Person`, 19 migrazioni, confermato via `psql`), Postgres/Mailpit già up, porta 3000 libera. Nessun reset richiesto/eseguito.
- **T1 (migrazione)**: schema editato, `npx prisma format` + `npx prisma validate` puliti; `npx prisma migrate diff --from-config-datasource prisma/schema.prisma --to-schema prisma/schema.prisma --script` contro il DB live — diff minimale (solo `IdempotencyRecord`), nessuna riga banner da rimuovere in questa run. Salvata in `prisma/migrations/20260708110000_add_idempotency_records/migration.sql`, applicata con `migrate deploy` (20 migrazioni totali, catena pulita) + `prisma generate`. Verificato via `psql \d "IdempotencyRecord"`: PK, FK RESTRICT su `userId` (default Prisma, coerente col resto dello schema), unique `(userId, endpoint, key)`.
- **T2 (wrapper)**: l'integrazione vive TUTTA in `apiRoute` (`src/lib/api/handler.ts`) — il gate idempotenza gira DOPO la validazione Zod di query/body (non prima): una richiesta che fallisce la validazione non tocca mai la tabella idempotenza (il key resta pienamente riusabile), scelta più semplice del create-poi-libera per richieste mai destinate a raggiungere `handle`. `beginIdempotentRequest` fa `create` con `responseStatus: null`; su P2002 rilegge (`findUnique` sull'unique compound) — record completato → replay (`Idempotency-Replayed: true`); ancora PENDING (o, nella race rarissima, il record è sparito nel frattempo per una cleanup concorrente) → 409 `IDEMPOTENCY_IN_PROGRESS`, MAI un secondo `create` che rischierebbe doppia esecuzione. `handle` gira in un try/catch interno: successo → `update` (status+body+`completedAt`) POI risposta; errore → `delete` best-effort (`.catch(() => {})`, coerente col trade-off crash-window documentato) POI re-throw verso il catch esterno esistente (mappatura AD-8 invariata). Guardie di costruzione (throw sincrono in `apiRoute`, non a runtime): `auth: 'public'` + `idempotency` insieme; `successStatus: 204` + `idempotency` insieme (nessuna route lo usa oggi, guard per il futuro). `Prisma.JsonNull` usato esplicitamente per un eventuale `responseBody` nullo (Prisma rifiuta un `null` JS semplice su un campo Json nullable — nessuno dei 5 endpoint restituisce `null`/`undefined` oggi, ma il wrapper resta corretto). 13 unit test nuovi in `handler.test.ts` (18→31, verificato via stash-and-count del file pre-modifica): replay body-identico, PENDING→409, race-rarissima-record-sparito→409, errore-libera-il-key su `ConflictError`/`ValidationError`/errore sconosciuto, header assente=pass-through, header su route senza config=ignorato, 422 su header 1-200 fuori range, validazione-body-fallita=non tocca la tabella, guardie di costruzione.
- **T3 (endpoint + OpenAPI)**: `idempotency: { endpoint: '<nome>' }` aggiunto ai 5 POST (`account-topup`, `account-adjustment`, `package-sale`, `flight-register`, `cash-movement`); doc-comment aggiunto sui 3 endpoint già naturalmente idempotenti via `reversalOfId` (`flights/{id}/cancel`, `flights/{id}/correct`, `cash-movements/{id}/reverse`) che spiega perché NON sono coperti. Componente OpenAPI riusabile `IdempotencyKey` (header, via `registry.registerParameter`) registrato e referenziato (`headers: [idempotencyKeyHeader]`) sui 5 path; 409 aggiunto alle `errorResponses` di top-up e `POST /flights` (non lo avevano prima — ora possono rispondere `IDEMPOTENCY_IN_PROGRESS`). Nessun test di coverage-conteggio-componenti esisteva da aggiornare (verificato); aggiunti invece 9 test dedicati in `registry.test.ts` (componente registrato correttamente, riferimento presente sui 5 path, ASSENTE sui 3 endpoint già idempotenti).
- **T4 (UI)**: hook condiviso `useIdempotencyKey()` creato in `src/lib/use-idempotency-key.ts` (dichiarato, come da story: riduce la duplicazione identica nei 5 punti) — stato `idempotencyKey` inizializzato `crypto.randomUUID()`, `regenerateIdempotencyKey()` esposta. Pattern identico nei 5 form: `fetch` avvolta in try/catch, header inviato SOLO dentro il try; su eccezione di rete (fetch lanciato) il key NON viene rigenerato e si mostra l'errore generico esistente; su QUALSIASI risposta HTTP ricevuta (ok o errore applicativo) si chiama `regenerateIdempotencyKey()` PRIMA di ispezionare `response.ok`. **Deviazione dichiarata**: `flights-manager.tsx` — lo stesso form/`onSubmit` serve sia la registrazione (`POST /flights`, coperta) sia la correzione (`POST /flights/{id}/correct`, NON coperta, già idempotente via `reversalOfId`); l'header viene inviato/rigenerato SOLO nel branch `!isCorrecting` (un header extra sul path di correzione sarebbe stato comunque ignorato lato server, ma limitarlo esplicitamente rende il wiring autodocumentante invece di inviare un header muto).
- **T5 (e2e)**: nuovo `e2e/idempotency.spec.ts`, endpoint rappresentativo top-up come da story. 6 test, tutti su osservabili run-unique (persona/e-mail uniche `Date.now()+random`, MAI un conteggio globale — lezione 6.3 F1): (1) replay sequenziale stesso key → body identico + header `Idempotency-Replayed: true` + 1 solo `AccountMovement` (`total` da `GET .../account/movements` su una persona appena creata, quindi run-unique); (2) **race reale**: `Promise.all` di due POST paralleli stesso key (curl-equivalente via `page.request`, non ragionamento) → entrambe le risposte in `{200,409}`, MAI due esecuzioni (`total === 1` provato a DB); (3) key diversi → 2 movimenti; (4) senza header → comportamento invariato, 2 movimenti (canarino AC 3); (5) un 404 su un `personId` inesistente libera il key — il retry con LO STESSO key su una persona reale esegue (AC 4); (6) header >200 char → 422, `handle` mai chiamato (0 movimenti). Girato isolato (`--workers=1`): 6/6 verdi; ripetuto 3x solo il test di race (`--repeat-each=3`): 3/3 verdi, nessuna flakiness.
- **Diagnosi anomalia flights.spec.ts / flight-reversal.spec.ts nel gate finale (priorità del dev prima di dichiarare i numeri)**: il full-suite run (113 test, vedi Completion Notes) ha prodotto 2 fail, ENTRAMBI su `flights-manager.tsx` (`flights.spec.ts:165`, `flight-reversal.spec.ts:151`) — la superficie UI che questa story ha modificato (wiring dell'idempotency-key). Prima di dichiarare "non è una regressione" ho VERIFICATO empiricamente: `git stash` del SOLO `flights-manager.tsx` (tornando al codice pre-story), stesso DB (ormai non più fresco per via dei run e2e precedenti di questa stessa sessione), re-run mirato di `flights.spec.ts --grep "hourMeterStart"` (il test gemello, stessa classe) → **fallisce IDENTICO anche senza la mia modifica**. `git stash pop` per ripristinare. Root cause confermata: la classe flaky epic-5/TD-1 documentata in HANDOFF.md ("flight specs form-refresh race" + volume di test-data accumulato che fa scattare il picker-cap 5.4 D1, fuori scope) — NON un difetto introdotto da questa story. La causa non è nel mio codice: il mio unico cambio a `flights-manager.tsx` è dentro `onSubmit` (fetch avvolta in try/catch + header condizionale + una `regenerateIdempotencyKey()` extra), il fail osservato accade PRIMA della sottomissione (i `<select>` mostrano ancora i valori di default, non quelli scelti dal test) — sintomo del tutto indipendente dal path di submit.
- **T6 (gate finali)**: lint 0 errori (1 warning benigno noto, preesistente, `data-table.tsx`); `tsc --noEmit` pulito; **789/789 unit** (767 preesistenti da TD-1 + 22 nuovi: 13 in `handler.test.ts` + 9 in `registry.test.ts`, conteggio verificato con `git stash` mirato dei 4 file toccati e ri-run pre/post); `env -u NODE_ENV npx next build` verde (51 pagine, tutte le route API presenti, incluso il nuovo header nell'OpenAPI generato — verificato via `curl localhost:3000/api/v1/openapi.json` sul server di build). e2e: full suite **111/113 su DB NON fresco** (impossibile ottenerne uno nuovo — il dev agent non può resettare il DB, regola operativa nota; il DB era fresco a inizio sessione ed è stato "sporcato" dai miei stessi run e2e, inclusi quelli mirati alle 5 superfici toccate e il nuovo `idempotency.spec.ts`) — i 2 fail sono la classe flaky epic-5/TD-1 documentata, diagnosticata empiricamente sopra come NON regressiva. **Zero fail nuovi, zero fail sulle superfici delle 5 form toccate** (`accounts-topups.spec.ts` 6/6, `account-adjustments.spec.ts` 4/4, `package-sale.spec.ts` 2/2, `cash-register.spec.ts` 5/5, `flight-log.spec.ts` 4/4, `flights.spec.ts` 5/6 — l'unico fail è la classe flaky nota, `idempotency.spec.ts` 6/6). Server di dev fermato (`pkill -f "next dev"`, `curl localhost:3000` confermato fallito) a fine sessione.

### Completion Notes List

- **T1**: modello `IdempotencyRecord` con doc-comment esteso (per-utente, ciclo di vita PENDING→completato/cancellato, crash-window documentata, motivazione "nessun job di cleanup"); back-relation `User.idempotencyRecords`. Migrazione hand-written pulita su DB fresco, catena di 20 migrazioni verificata applicarsi senza drift.
- **T2**: opzione `idempotency` in `apiRoute`, envelope `IDEMPOTENCY_IN_PROGRESS`, guardie di costruzione, gate posizionato dopo la validazione Zod (scelta motivata nel Debug Log). Nessuna modifica al comportamento delle route senza header (AC 3) — verificato sia da unit sia dall'intera suite e2e preesistente (nessun fail nuovo).
- **T3**: 5 endpoint configurati; 3 doc-comment "già idempotente via reversalOfId, non duplicare" su cancel/correct/reverse; componente OpenAPI header riusabile, referenziato sui 5 path, 409 aggiunto dove mancava; 9 nuovi test sul registry.
- **T4**: hook `useIdempotencyKey()` condiviso (dichiarato); wiring identico nei 5 punti; deviazione dichiarata sul form voli (header solo sul branch di registrazione, non su quello di correzione).
- **T5**: `e2e/idempotency.spec.ts`, 6 test su endpoint rappresentativo (top-up) — replay sequenziale, race PARALLELA REALE, key diversi, opt-out, key liberato su 4xx, validazione header. Tutti su osservabili run-unique.
- **T6**: gate finali lint/typecheck/unit/build verdi; e2e full-suite 111/113 su DB non fresco (accumulato dai miei stessi run, non resettabile da questo agente), 2 fail = classe flaky epic-5/TD-1 nota, diagnosticata come non-regressiva con verifica empirica (stash-and-retest del file toccato). Story file e `sprint-status.yaml` aggiornati.

### File List

- `prisma/schema.prisma` (M — T1: modello `IdempotencyRecord` + back-relation `User.idempotencyRecords`)
- `prisma/migrations/20260708110000_add_idempotency_records/migration.sql` (A — T1)
- `src/lib/api/handler.ts` (M — T2: opzione `idempotency`, `beginIdempotentRequest`/`freeIdempotencyRecord`, guardie di costruzione, `IDEMPOTENCY_KEY_HEADER`)
- `src/lib/api/handler.test.ts` (M — T2: mock `@/server/db/prisma`, 13 nuovi test idempotenza)
- `src/app/api/v1/people/[id]/account/top-ups/route.ts` (M — T3: `idempotency: { endpoint: 'account-topup' }`)
- `src/app/api/v1/people/[id]/account/adjustments/route.ts` (M — T3: `idempotency: { endpoint: 'account-adjustment' }`)
- `src/app/api/v1/people/[id]/packages/route.ts` (M — T3: `idempotency: { endpoint: 'package-sale' }`)
- `src/app/api/v1/flights/route.ts` (M — T3: `idempotency: { endpoint: 'flight-register' }`)
- `src/app/api/v1/cash-movements/route.ts` (M — T3: `idempotency: { endpoint: 'cash-movement' }`)
- `src/app/api/v1/flights/[id]/cancel/route.ts` (M — T3: doc-comment "già idempotente via reversalOfId")
- `src/app/api/v1/flights/[id]/correct/route.ts` (M — T3: doc-comment "già idempotente via reversalOfId")
- `src/app/api/v1/cash-movements/[id]/reverse/route.ts` (M — T3: doc-comment "già idempotente via reversalOfId")
- `src/lib/schemas/registry.ts` (M — T3: componente header `IdempotencyKey`, referenziato sui 5 path, 409 aggiunto dove mancava)
- `src/lib/schemas/registry.test.ts` (M — T3: 9 nuovi test)
- `src/lib/use-idempotency-key.ts` (A — T4: hook condiviso `useIdempotencyKey`)
- `src/app/[locale]/dashboard/people/account-panel.tsx` (M — T4: wiring `TopUpForm`)
- `src/app/[locale]/dashboard/people/[id]/account/account-statement-table.tsx` (M — T4: wiring `AdjustmentForm`)
- `src/app/[locale]/dashboard/people/packages-panel.tsx` (M — T4: wiring `SellPackageForm`)
- `src/app/[locale]/dashboard/flights/flights-manager.tsx` (M — T4: wiring `RegisterFlightForm`, solo branch registrazione)
- `src/app/[locale]/dashboard/finance/cash-register.tsx` (M — T4: wiring `NewMovementForm`)
- `e2e/idempotency.spec.ts` (A — T5: 6 test sull'endpoint rappresentativo top-up)
- `src/app/api/v1/users/route.test.ts` (M — fix collaterale dichiarato: mock `@/server/db/prisma` aggiunto, necessario perché `handler.ts` ora importa il client Prisma reale a livello di modulo — senza mock il test integration esistente falliva all'import per `DATABASE_URL` mancante nel processo di unit test; nessun cambiamento di comportamento della route)
- `_bmad-output/implementation-artifacts/td-2-request-idempotency.md` (M — questo Dev Agent Record, checkbox T1-T6, Status → review)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (M — td-2 → review)

## Review Record

Reviewer: subagent **Opus 4.8 (extra-high)**, adversarial (superficie money-critical). **Verdict: clean pass — nessuna modifica al codice richiesta** (zero mandatory findings).

- **Priorità zero (a) — full suite su DB fresco (4 worker)**: 96/113 con 17 fail, TUTTI riclassificati non-regressione col criterio stabilito: 13 = flake da carico parallelo/cold-compile (12/12 verdi in isolamento, incluse le superfici toccate da TD-2 e il nuovo `idempotency.spec`); 4 = classe flaky epic-5 volume-driven (`flights:165/:219`, `flight-reversal:151`, `package-consumption:134`) — **esperimento decisivo del reviewer**: revert di `flights-manager.tsx` alla baseline sullo stesso DB → gli STESSI 4 fail identici senza il codice TD-2. Zero regressioni.
- **Priorità zero (b) — concorrenza con curl paralleli REALI** (indipendente dagli e2e): 5 iterazioni di doppio POST simultaneo stesso key → **sempre esattamente 1 `AccountMovement`** (conteggio psql), status in {200,409}, zero orphan PENDING.
- **Attacchi verificati vivi**: cross-user replay leak (secondo utente STAFF reale creato via invito+Mailpit: stesso key stesso endpoint → entrambi eseguono, 2 record con userId distinti, nessun leak — lo scoping per-utente regge); fedeltà replay (header `Idempotency-Replayed` SOLO sul replay); key liberato su 404 (zero righe orfane, retry stesso key esegue); PENDING orfano inserito a mano via psql → 409 senza ri-esecuzione né 500; header vuoto/201-char → 422 senza toccare handle né DB; header su route non coperta → ignorato; guard di costruzione (public/204) → throw a module load; migrazione = schema senza drift, FK RESTRICT, 20/20 pulite; OpenAPI header sui 5 path (e ASSENTE sui 3 già idempotenti) con min/max round-trip verificato su openapi.json live; File List = diff esatto (24 file); zero stringhe UI nuove, i18n invariata; copertura unit completa dei rami del wrapper.
- **D1 (deferral)** — il replay è deep-equal ma NON byte-identico: JSONB non preserva l'ordine delle chiavi (i valori sono lossless — cents interi, ISO string). Conforme all'AC ("stesso body" = uguaglianza semantica); da documentare solo se un futuro consumer facesse hash/ETag dei byte grezzi.
- **D2 (deferral)** — il path correzione volo ora ha il fetch in try/catch (a baseline un errore di rete propagava come unhandled rejection): micro-miglioramento benigno dichiarato nella deviazione del dev, non una regressione; l'header NON viene mai inviato sul path correzione (verificato nel diff).
- **D3 (deferral)** — il ramo difensivo `Prisma.JsonNull` (handle che ritorna null/undefined) non ha test né caller vivi: corretto per ispezione, da coprire se mai arriverà una route idempotente che risponde null.

### Final gates (review run, DB fresco)

lint 0 errori (warning benigno noto), typecheck pulito, **789/789 unit**, `env -u NODE_ENV npx next build` verde (51 pagine, header OpenAPI live), full suite 96/113 a 4 worker su DB fresco con TUTTI i 17 fail provati non-regressione (12/12 isolamento per le superfici TD-2; revert-alla-baseline riproduce i 4 residui). Working tree pulito post-review.

## Change Log

- 2026-07-08: Story file created (Fable 5 main session) — scioglie il deferral 3.1 O2 su decisione utente ("fix everything before epic 7").
- 2026-07-08: Implemented (Sonnet 5 single dev agent, xhigh) — T1-T6 completati. Modello `IdempotencyRecord` + migrazione hand-written (20 migrazioni, catena pulita); opzione `idempotency` in `apiRoute` (gate dopo la validazione Zod, guardie di costruzione, `Idempotency-Replayed`/`IDEMPOTENCY_IN_PROGRESS`); 5 endpoint configurati + 3 doc-comment sugli endpoint già idempotenti via `reversalOfId`; componente header OpenAPI riusabile sui 5 path; hook UI condiviso `useIdempotencyKey()` wired identicamente nei 5 form (deviazione dichiarata: nel form voli l'header è inviato solo sul branch di registrazione, non su quello di correzione); `e2e/idempotency.spec.ts` con race PARALLELA REALE provata (lezione 6.2). Gate: lint 0 errori, typecheck pulito, **789/789 unit** (+22 nuovi), build verde, e2e full-suite **111/113 su DB non fresco** (accumulato dai run di questa stessa sessione, non resettabile dal dev agent) — i 2 fail sono la classe flaky epic-5/TD-1 già documentata (`flights.spec.ts:165`, `flight-reversal.spec.ts:151`), diagnosticata come NON regressiva con verifica empirica (`git stash` del file toccato + re-test sullo stesso DB → fallisce identico anche senza la modifica di questa story). Zero fail sulle 5 superfici toccate. Status → review.
- 2026-07-08: Review Opus 4.8 xhigh — clean pass, zero mandatory; concorrenza/cross-user/orfani provati vivi con curl+psql; 17 fail e2e da carico tutti riclassificati non-regressione (revert-esperimento decisivo). D1 replay non byte-identico (JSONB), D2 try/catch correzione, D3 ramo JsonNull scoperto → deferred. Status → done.
