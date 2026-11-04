# Review adversarial — Story 16.6b (chiave di idempotenza stabile nel pannello quota; catene di rettifica classificate alla radice)

- **Reviewer**: subagent adversarial (Opus 5.5), 2026-11-04
- **Commit in review**: `6e76e20` (feat) + `91a70b0` (docs) su `dev`; base `304865f`
- **Perimetro**: §R (prevale) + §R-PO + Dev Agent Record. Q1 (modale quota) e Q5 (`reversalRootType`); verificato che le parti OBSOLETE NON siano state implementate.
- **Skill**: `bmad-code-review` (i tre layer Blind / Edge Case / Acceptance eseguiti in proprio: nessun tool di subagent disponibile; nessuna modifica al file della story, per mandato l'unica scrittura è questo report), `karpathy-guidelines`.

## Verdetto: **SHIPPABLE**

Zero difetti di produzione nel diff. Il fix fa ciò che §R chiede, e ogni sua guardia è discriminante (5 mutanti, tutti rossi). Restano:
- un rischio **dichiarato fuori scope** da §R, che ho riprodotto in modo deterministico dall'UI (F1, Medium, TD da registrare);
- note Low di igiene e documentazione;
- due domande al PO.

Nessuna patch obbligatoria per chiudere la story.

## Arbitro (prima azione e2e, DB `airmanager` appena resettato dalla sessione principale)

`JOBS_SECRET` non segnaposto, `scripts/e2e.sh start` (CI=1, build di produzione di HEAD `91a70b0` dentro il run, BUILD_ID 15:06:50, albero `src`/`messages` pulito):

```
Running 616 tests using 2 workers
  616 passed (21.1m)
=== e2e end: 2026-11-04T15:27:26+01:00 ===
E2E_EXIT=0
```

- **616/616, 0 flaky, 0 failed, exit 0** su DB fresco = 615 di baseline + 1 test nuovo. Il conteggio del dev (614 + 2 flaky = 616, su DB riusato) è confermato; i suoi 2 flaky (`my-compensation.spec.ts:303/:373`, alla riga di login) qui non si ripresentano.
- Il test nuovo: `✓ 302 [chromium] › e2e/membership-fee.spec.ts:296:7 … (7.3s)`. Quello del filtro aggiornato: `✓ 69 … billing.spec.ts:203:7 … (3.0s)`.
- **Log dell'arbitro**: `/tmp/claude-1000/-home-admin-AirManager/45a65db7-6aab-42c2-90b8-6cdb4c6509a7/scratchpad/arbiter-16-6b.log`.
- ⚠️ **Attenzione**: `/tmp/airmanager-e2e/last-run.log` NON è più l'arbitro. Contiene il mio mutante M2 (`E2E_EXIT=1`, rosso per costruzione), e `.prev` contiene il mutante M1. `scripts/e2e.sh status` oggi riporta quindi un rosso VOLUTO. L'esito dell'arbitro è quello sopra.
- Copia del run del dev (14:36, prima del commit): `…/scratchpad/dev-run-1436.log`.

## Gate

- `npm run gates`: `PASS lint (24s)`, `PASS typecheck (3s)`, `PASS test (9s) — Tests 2258 passed (2258)`, `PASS build (36s)`. **Unit 2252 → 2258 confermato.**
- `env -u DATABASE_URL -u AUTH_SECRET -u JOBS_SECRET npx vitest run` sui due file di test toccati: `145 passed`. Nessun import nuovo che trascini l'env eager.
- `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → `-- This is an empty migration.`
- `npx prisma migrate status` → `Database schema is up to date!` (59 migrazioni).

## Findings

### F1 — Medium — dopo un 409 `IDEMPOTENCY_IN_PROGRESS` il pannello invita a riprovare, e il ritentativo addebita due volte con la scadenza a +24 mesi mostrata come successo — **defer** (dichiarato fuori scope da §R; TD da registrare)

- **Dove**: `src/app/[locale]/dashboard/expiries/scadenze-console.tsx:937`. `regenerateIdempotencyKey()` gira dopo QUALUNQUE risposta, quindi anche dopo il 409 `IDEMPOTENCY_IN_PROGRESS` di `src/lib/api/handler.ts:262`. Poi `:971` mostra `genericError` («Impossibile addebitare la quota. Riprova.»).
- **Contesto**: il record è PENDING per tutta la durata del `handle` e diventa COMPLETED solo a `handler.ts:484`, dopo il commit del service. Un ritentativo che arriva in quella finestra prende il 409 e una chiave nuova; il ritentativo successivo è un addebito nuovo.
- **Repro deterministica** (`…/scratchpad/probe-q1.mjs`, scenario S4, build di HEAD su :3100):
  1. Il lock della riga `Account` è tenuto 4 s da `psql`, sotto il timeout di 5 s della transazione interattiva Prisma.
  2. Tentativo 1: `route.fetch()` lanciato e poi `route.abort('connectionreset')`. Il server lo tiene in attesa e poi lo committa.
  3. L'operatore preme «Addebita e rinnova» altre due volte entro circa 1 s.

  Output:
  ```
  "responses": [ {"key":"63692e6b-…","status":409,"code":"IDEMPOTENCY_IN_PROGRESS"},
                 {"key":"47d53650-…","status":200,"replayed":null} ],
  "firstServerStatus": 200,
  "errAfter409": "Impossibile addebitare la quota. Riprova.",
  "success": "Quota addebitata. Nuovo saldo: 930,00 € · valida fino al 04/11/2028.",
  "quotaRows": [-3500, -3500], "expiresAt": "2028-11-04"
  ```
- **Lettura**: è esattamente il «fuori scope dichiarato» di §R («il contratto dell'hook rigenera la chiave anche dopo un 409 IDEMPOTENCY_IN_PROGRESS … vale per tutti e 7 i form → TD»).
  - Probabilità **bassa** in condizioni normali: il record vive 12-30 ms (misurato su `IdempotencyRecord.createdAt/completedAt`).
  - Probabilità **reale** con il conto sotto contesa (una ricarica o un volo concorrente sullo stesso `Account`) o con un DB lento.
  - Esito silenzioso e doppio: il denaro esce due volte e il rinnovo va a +24 mesi.
  - Il testo «Riprova» spinge proprio verso il gesto sbagliato.
- **Raccomandazione**: registrare il TD (non è ancora in `sprint-status.yaml`, grep `16.6b` → solo la riga della story) come story dei 7 form. Due modifiche:
  - la chiave NON si rigenera su un 409 `IDEMPOTENCY_IN_PROGRESS`;
  - il messaggio diventa «operazione in corso, attendi qualche secondo».

  V. domanda PO 1.

### F2 — Low — TD-16.6b-a confermato (il test nuovo scrive un AppSettings globale nel project principale); oggi nessuna collisione misurabile — **defer** (TD da registrare)

- **Dove**: `e2e/membership-fee.spec.ts:298` (`PUT /settings/membership-fee` 3500). Non ripristina il valore: il ripristino lo fa il test successivo del file (`:362`, quota a 0), quindi solo in `mode: 'serial'` e solo se il test nuovo arriva in fondo.
- **Evidenza**: `grep -rn -E 'scadenze-membership-fee-button|settings/membership-fee|annualFeeCents' e2e/`. Nel project principale scrive solo `membership-fee.spec.ts` (gli altri scrittori, `settings`, `mobile-membership-fee` e `mobile-settings`, sono in catena). L'unico lettore nel project principale è `mobile-expiries-movements.spec.ts:339`, che asserisce `toBeVisible()` del bottone, non `toBeEnabled()`: il valore non lo tocca.
- Il valore della quota pilota solo il bottone e l'importo precompilato della pagina Scadenze (`app-settings.service.ts:353`, `expiries/page.tsx:96`). Non entra in nessun requisito di prenotazione o volo, quindi non ci sono 422 a cascata sulle create concorrenti.
- **Raccomandazione**: registrare TD-16.6b-a com'è. Non va bloccato.

### F3 — Low — il CHECK trasforma l'`ON DELETE SET NULL` della FK `reversalOfId` in un RESTRICT di fatto — **patch opzionale (solo documentazione)**

- **Dove**:
  - la FK `AccountMovement_reversalOfId_fkey`, `ON DELETE SET NULL` (`prisma/migrations/20260705190000_add_accounts_topups/migration.sql:87`); la relazione `prisma/schema.prisma:609` non dichiara `onDelete`, quindi il default Prisma è SetNull;
  - il CHECK nuovo (`prisma/migrations/20261104100000_account_movement_reversal_root_type/migration.sql`).
- **Repro** (`BEGIN … ROLLBACK` sulla tabella vera; residuo 0 verificato): `TOP_UP` + rettifica collegata, poi `DELETE` del `TOP_UP`:
  ```
  ERROR:  new row for relation "AccountMovement" violates check constraint "AccountMovement_reversalRootType_check"
  CONTEXT:  SQL statement "UPDATE ONLY "public"."AccountMovement" SET "reversalOfId" = NULL WHERE $1 OPERATOR(pg_catalog.=) "reversalOfId""
  ```
- **Raggiungibilità dall'app**: nessuna.
  - `deleteFlight` (`flights.service.ts:1204`) cancella solo un addebito SENZA rettifica collegata: `assertChargeNotAdjusted` a `:1160-1168` risponde prima con un 409.
  - `Account` → `AccountMovement` è RESTRICT.
  - Nessun altro writer fa `delete`/`deleteMany` su `AccountMovement` (grep).
- **Effetto reale**: una futura data-migration o una pulizia SQL che cancelli un genitore fallisce con 23514. Prima avrebbe staccato il figlio, lasciando un credito o debito orfano. È probabilmente il comportamento migliore, ma oggi non è scritto da nessuna parte.
- **Suggerimento (facoltativo)**: una frase nel doc-comment di `reversalRootType` (`schema.prisma`) o nel commento del CHECK. Per esempio: «con il CHECK, l'`ON DELETE SET NULL` della FK non può più scattare: cancellare un movimento che ha uno storno collegato fallisce».

### F4 — Low — l'asserzione sull'anno del test nuovo eredita il pattern fuso-del-runner-contro-Roma — **patch opzionale**

- **Dove**: `e2e/membership-fee.spec.ts:357`, `expect(fee?.expiresAt.slice(0, 4)).toBe(String(new Date().getFullYear() + 1))`. È copiato da `:286`, che è preesistente.
- **Effetto**: su un runner UTC, il 31/12 fra le 23:00 e le 24:00 UTC (già 1/1 a Roma) l'anno di pagamento è quello nuovo, e il test diventa rosso. Circa un'ora l'anno.
- La riga è **ridondante**: `:356` (`expiresAt === committed.expiresAt`) separa già +12 da +24 (S2 sotto mostra il +24 = `2028-11-04`). Toglierla non perde discriminanza.

### F5 — Low, PREESISTENTE — lo storno di un giroconto finisce nei Ricavi — **decision_needed** (domanda PO 2; non è un difetto della story)

- **Repro sull'app vera** (`…/scratchpad/probe-q5.mjs`, :3100): giroconto standalone +20,00 € (badge TRANSFER), poi la sua rettifica −20,00 € (`originalMovementId` = il giroconto, offerta dall'azione di riga perché è un `ADJUSTMENT` non rettificato):
  ```
  "rv G giroconto standalone:TRANSFER"
  "rv G1 storno del giroconto:REVENUE"
  "revenueDelta": 2700   // = 700 (addebito standalone, corretto) + 2000 (storno del giroconto: ricavo fantasma)
  ```
- **Identico a prima della story**: il vecchio ramo `amountCents < 0 → reversalOf?.type === 'TOP_UP' ? DEPOSIT : REVENUE` lo classificava già REVENUE. `reversalRootType` non può distinguerlo: la radice è un `ADJUSTMENT` sia per un giroconto (positivo) sia per un addebito o quota (negativo). La ratifica §R-PO copre solo le catene con radice `TOP_UP`.

### Note informative (nessuna azione richiesta)

- **N1** — Il dev l'ha dichiarato: con la migrazione applicata, un server di una build pre-16.6b che registra una rettifica collegata prende 500 (CHECK). Al deploy: `migrate deploy` e il nuovo server il più vicini possibile.
- **N2** — I TD non sono ancora in `sprint-status.yaml`: TD-16.6b-a (F2) e il 409 `IN_PROGRESS` (F1). Spetta alla sessione principale nel `docs(16.6b)` di chiusura.
- **N3** — La doppia etichetta «PERSONA / PERSONA» del modale (preesistente, segnalata dal dev) è confermata nello screenshot a 375. È fuori scope.

## Cosa ho verificato e regge (con evidenza)

### Q1 — modale quota

| Verifica | Esito |
|---|---|
| Ciclo di vita della chiave nel codice | `useIdempotencyKey()` a `:917`. `charge()` (`:931`) manda `[IDEMPOTENCY_KEY_HEADER]: idempotencyKey` e rigenera solo DOPO che `fetch` ha restituito una risposta (`:937`); un guasto di rete lancia prima di quella riga. `submit()` ha ora `try/catch` (`:955-963`) con `setSubmitting(false)` + `genericError`. `proceed()` passa dalla stessa `charge()`. Import di `randomIdempotencyKey` rimosso, nessun orfano. `IDEMPOTENCY_KEY_HEADER` arriva dal modulo client. Il modale è montato in modo condizionale (`{feeModalOpen ? <MembershipFeeModal …/> : null}`, `:702`): chiudere = smontare = chiave persa, come dichiarato. |
| L'e2e prova davvero il replay lato server? | Sì. Il tentativo 3 passa da `route.continue()` al server vero, e `Idempotency-Replayed: true` è un header che può mettere SOLO `beginIdempotentRequest` (`handler.ts:254`). `route.fetch()` riusa gli header della richiesta originale, quindi stessa chiave; il commit è asserito (`committed.status === 200`). Una sola riga di quota (`[-3500]`) e `expiresAt` uguale a quello del commit (+12, non +24). |
| Discriminanza e2e (mutanti miei, copia isolata `scratchpad/iso`, build di produzione servita su :3000, `E2E_REUSE_SERVER=1 scripts/e2e.sh start e2e/membership-fee.spec.ts -g "dropped connection"`) | **M1** — chiave rigenerata in un `finally`, cioè anche sul guasto di rete: **rosso** a `membership-fee.spec.ts:342`, `Expected: "true" Received: undefined` (nessun replay), su tutti i tentativi. **M2** — chiave mai rigenerata: **rosso** a `:346`, `expect(keys[1]).not.toBe(keys[0])`. Log: `scratchpad/e2e-mutant-M1.log`, `scratchpad/e2e-mutant-M2.log`. Il pre-fix vero è la D2 del dev. |
| S2 — rischio residuo dichiarato (chiusura e riapertura) | Riprodotto: `keys: ["99a1…", "(server 200)", "021b…"]`, secondo addebito `200` senza replay, `quotaRows: [-3500,-3500]`, `expiresAt: "2028-11-04"` (+24 mesi). Il ricaricamento della pagina dà lo stesso esito per costruzione: la chiave vive in `useState`, senza persistenza. |
| S3 — cambio pilota nella combobox dopo il guasto (la chiave sopravvive!) | Nessun replay sbagliato: il fingerprint include i `params` (`handler.ts:187`), quindi `422 IDEMPOTENCY_KEY_MISMATCH` → messaggio generico → chiave nuova → B addebitato una volta. `quotaRowsA: [-3500]`, `quotaRowsB: [-3500]`. |
| S5 — secondo chiamante, «Procedi comunque» (saldo 0 → 422 `REQUIREMENTS_NOT_MET`), guasto dopo il commit | `requirements-proceed-error` = «Impossibile completare l'operazione. Riprova.», bottone abilitato; il ritentativo riusa la stessa chiave (`917c…`) → `200`, `replayed: "true"`, una riga, `expiresAt 2027-11-04`. La chiave è cambiata dopo il 422 (`0530…` → `917c…`). |
| UI reale (1280×800 e 375×812) | `role="alert"` sotto l'importo, bottone abilitato (44 px a 375), `scrollWidth` = viewport. Screenshot: `scratchpad/shots/q1-error-{1280,375}.png`. |
| RBAC | `POST /people/{id}/membership-fee` come istruttore, pilota e allievo → 403 (story 14.9: solo ADMIN). |

### Q5 — `reversalRootType`

| Verifica | Esito |
|---|---|
| Backfill su gemello (mio, indipendente da quello del dev) | Schema usa-e-getta `rv166b_twin` dentro `BEGIN` e chiuso senza commit (schema residuo: 0). Copia `LIKE public."AccountMovement" INCLUDING ALL` con la colonna tolta, poi `migration.sql` del repo eseguito **verbatim**. Fixture: catena `TOP_UP` fino a profondità **6** (anche un negativo di negativo), radice `FLIGHT_CHARGE` legacy fino a profondità 3, radice quota, radice giroconto, `PACKAGE_PURCHASE`, standalone. Esito: `UPDATE 11`, **`mismatches 0 / total 17`**. Il CHECK rifiuta una riga collegata senza tipo radice (23514). `scratchpad/twin.sql`, `twin.out`. Cicli: irraggiungibili (nessun writer aggiorna `reversalOfId`; una riga nuova punta solo a righe esistenti). |
| Invariante sui dati scritti dall'app (dopo l'arbitro) | CTE ricorsiva di ricalcolo: `linked 12, root_ok 12, root_wrong 0`, tipi visti `ADJUSTMENT,TOP_UP`. |
| SQL generato da Prisma 7.8.0 (mio probe, `ACCOUNT_REVENUE_OR` VERO importato dal service, righe in una transazione sempre annullata, residuo 0) | Il predicato vero compila in `("reversalRootType" IS NULL OR "reversalRootType" <> CAST($10::text AS "AccountMovementType"))` → include la rettifica standalone a debito. `NOT: { reversalRootType: 'TOP_UP' }` compila in `(NOT "reversalRootType" = …)` → `ids: []`. `reversalRootType: { not: 'TOP_UP' }` compila in `"reversalRootType" <> …` → `ids: []`. Il filtro DEPOSIT prende il `TOP_UP` e i suoi 3 anelli. La trappola dei NULL esiste davvero ed è chiusa. `scratchpad/sqlprobe.out`. |
| Badge = filtro = aggregato, sull'app vera | Catena `TOP_UP ← A1(−10) ← A2(+10) ← A3(−10) ← A4(−5)`: tutti `DEPOSIT` nel badge; `bookType=DEPOSIT` → 5 righe (ricarica + 4 anelli); `REVENUE` → solo standalone e storno del giroconto; `TRANSFER` → il giroconto. `GET /api/v1/stats?period=month` `kpis.revenueCents` (= `getLedgerRevenueCents`, lo stesso di Panoramica e del riepilogo Contabilità) cresce esattamente di 2700 = 700 + 2000 (F5): la catena della ricarica contribuisce 0. |
| Writer | Un solo writer di `reversalOfId` (`accounts.service.ts:753`: `original.reversalRootType ?? original.type`, `create` a `:772`). Grep su `prisma/*.ts`, `e2e/`, `scripts/`: `seed-load.ts` scrive `reversalOfId: null`; l'`INSERT` grezzo di `e2e/db-fixtures.ts:69` non nomina la colonna; `seed.ts`/`seed-demo.ts` non scrivono movimenti collegati; `scripts/perf` solo bench. Nessuno può violare il CHECK. |
| Mutanti unit (copia isolata, ripristino verificato con `cmp` = identico a HEAD) | **U1** trappola dei NULL (`NOT_ROOTED_IN_TOP_UP = [{ reversalRootType: { not: 'TOP_UP' } }]`) → 2 rossi (forma letterale dei due `where`). **U2** radice solo sui positivi → 2 rossi (F3 e profondità 3-5). **U3** writer che ignora la radice ereditata (`= original.type`) → 2 rossi (`it.each` TOP_UP / FLIGHT_CHARGE). |
| Nessuna fuga nei DTO, OpenAPI invariato | `reversalRootType` assente nelle risposte di `POST /account/adjustments`, `GET /account/movements`, `GET /account`, `GET /transactions` e in `GET /api/v1/openapi.json`. `registry.ts` non toccato. |
| `accountBookType` / `SelectedAccountRow` | `Pick` aggiornato e tipato. L'unica divergenza badge/filtro (storno a importo zero con radice `TOP_UP`) è irraggiungibile: `recordAdjustmentSchema` rifiuta `amountCents: 0` (`src/lib/schemas/accounts.ts:231`). |
| RBAC | `GET /transactions?bookType=DEPOSIT` e `POST /account/adjustments` come istruttore, pilota e allievo → 403. |

### OBSOLETE non implementate

`git diff --stat 304865f 91a70b0` su `membership.service.ts`, `handler.ts`, `registry.ts`, `messages/`, `expiry-scope.ts`, `people/`, `flights.service.ts`, `expiries/page.tsx` → vuoto. `grep -rn -E 'membershipFeeDescription|MEMBERSHIP_FEE_ALREADY_CHARGED|alreadyCharged' src messages` → nessun risultato.

## Domande per il PO (in italiano semplice)

1. **Sulla domanda del dev (chiudere il pannello dopo un errore di rete e riaddebitare → la quota esce due volte).** Ho verificato che è vero: dopo un errore di rete, se chiudi il pannello, lo riapri e riaddebiti, la quota esce due volte e la scadenza mostrata è a due anni. Ho però trovato un secondo caso con lo stesso esito che NON richiede di chiudere nulla: se la rete cade mentre il server sta ancora lavorando e premi subito «Addebita e rinnova» di nuovo, il pannello risponde «Impossibile addebitare la quota. Riprova.»; se ripremi, la quota esce due volte, e il pannello dice «Quota addebitata … valida fino al 04/11/2028» senza alcun avviso. Succede di rado (il server di solito risponde in pochi centesimi di secondo), ma il messaggio dice proprio di riprovare. In entrambi i casi oggi il pannello dice «Impossibile addebitare la quota» anche quando la quota è stata addebitata davvero.
   **La mia proposta**: la story va bene così (prima OGNI ritentativo addebitava due volte; ora il ritentativo sul posto è sicuro). In più, una piccola story dedicata per tutti i 7 form che muovono denaro:
   - (a) quando il server dice «sto ancora lavorando», il pannello mostra «Operazione in corso, attendi qualche secondo» e il ritentativo resta sicuro;
   - (b) dopo un errore di rete, il messaggio dice «La connessione si è interrotta: la quota potrebbe essere già stata addebitata. Premi di nuovo il bottone per verificarlo, non verrà addebitata due volte».

   Ricordare il tentativo anche dopo la chiusura del pannello o il ricaricamento della pagina si può fare, ma costa di più. Lo terrei come seconda scelta, se (b) non bastasse. Vuoi la story con (a) e (b), con anche il ricordo dopo la chiusura, o lasciamo così e si corregge con uno storno?
2. **Lo storno di un giroconto finisce nei ricavi (preesistente, non introdotto da questa story).** Se registri per errore un giroconto di +20,00 € a un pilota e poi lo correggi con −20,00 €, il conto del pilota torna giusto, ma nelle Statistiche e nella Panoramica compaiono 20,00 € di ricavi che non ci sono. È lo stesso tipo di errore che questa story ha chiuso per le ricariche («la correzione segue il movimento da cui parte»). Vuoi che anche la correzione di un giroconto resti un giroconto (non un ricavo)? Se sì, è una story piccola a parte.

## Evidenze (scratchpad `/tmp/claude-1000/-home-admin-AirManager/45a65db7-6aab-42c2-90b8-6cdb4c6509a7/scratchpad/`)

`arbiter-16-6b.log`, `dev-run-1436.log`, `e2e-mutant-M1.log`, `e2e-mutant-M2.log`, `twin.sql`/`twin.out`, `sqlprobe.mts`/`sqlprobe.out`, `probe-q1.mjs`/`probe-q1.out`/`probe-q1-s4s5.out`, `probe-q5.mjs`/`probe-q5.out`, `shots/`, `iso/` (copia isolata con il mutante M2 ancora dentro, NON il repo).

## Igiene della review

- Nessun file del repo modificato; nessun commit (`git status` identico all'inizio: solo le due voci preesistenti).
- Nessun DB creato, cancellato o resettato: solo transazioni `BEGIN … ROLLBACK` e uno schema usa-e-getta dentro di esse, residui 0 verificati.
- Dati run-unique (`Rv …`) scritti su `airmanager` da probe e mutanti. La quota globale è stata riportata al valore trovato (`feeRestoredTo: 0`).
- Tutti i server avviati da me sono spenti; porte 3000/3100 libere.
