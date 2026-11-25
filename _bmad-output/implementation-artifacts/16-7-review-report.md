# Story 16.7 — Review Report (adversarial, Opus 5.5 `review-16-7`)

- **Data**: 2026-11-04 · **Commit in review**: `7b12916` (feat) + `bd98f55` (docs) su `dev`, base `227b053`
- **Skill**: `bmad-code-review` (metodo), `karpathy-guidelines`
- **Verdetto**: **SHIPPABLE-WITH-FIXES** — nessun High/Medium. Un **Low** di codice (race che riapre F8 in una finestra di millisecondi, riprodotto in modo deterministico; falsifica la premessa di AD-4) da chiudere con 2 righe o da registrare come TD per decisione PO, e due correzioni del Dev Agent Record (formula di AC 10, delta unit). F6 è completo su tutte le superfici, verificato per ruolo.
- **Scratchpad delle prove** (fuori repo): `/tmp/claude-1000/-home-admin-AirManager/45a65db7-6aab-42c2-90b8-6cdb4c6509a7/scratchpad/review-16-7/` (`*.cjs` = probe, `*.out` = output verbatim, `shots/` = screenshot)

## 1. Arbitro e gate

| Prova | Esito |
|---|---|
| **Arbitro** — suite completa, `scripts/e2e.sh start` (CI=1, build di produzione, `JOBS_SECRET` esportato) sul DB `airmanager` appena resettato dalla sessione principale | `state: DONE — E2E_EXIT=0` · **617 passed + 1 flaky = 618** (19.2 min). Flaky = `mobile-a11y-sweep.spec.ts:344` al retry #1, classe nota login-timeout (`toHaveURL /it/dashboard` → ricevuto `/it/login`, riga 32 del login helper), test non toccato dalla story. I due test nuovi (`session-identity.spec.ts:138`, `:182`) e i due modificati (`bookings.spec.ts:671`, `:1932`) verdi al primo tentativo. Log copiato: `scratchpad/review-16-7/arbiter-16-7.log` (sha256 `556248c274a5a51b…`), originale `/tmp/airmanager-e2e/last-run.log` |
| e2e prima → dopo | 616 → **618** (+2 = `session-identity.spec.ts`) — confermato |
| `npm run gates` (dopo l'arbitro) | `PASS lint (20s)` · `PASS typecheck (3s)` · `PASS test (9s) — Tests 2270 passed (2270)` · `PASS build (31s)` |
| Isolamento env | `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` sui 3 file di test toccati → **413/413** |
| Unit prima → dopo | **2261 → 2270 (+9)**, non 2262 → 2270 (+8) come da record — v. F3 |
| Discriminanze unit (copia isolata `git archive bd98f55`, `node_modules` in symlink, ripristino verificato sha256) | D2 (bump tolto) → **2 rossi** (unlink, relink) · D2b (bump sulla presenza) → **1 rosso** («re-sending the SAME personId») · D1 (`personId` non azzerato) → **4 rossi** (il test 14.5 invertito + i 3 nuovi). Identiche al §D del record. Log D4/D5 del dev riletti (`scratchpad/e2e-mutant-d4.log`: «Expected 0, Received 1» 3/3; `e2e-mutant-d5.log`: 2 failed con id ricevuti) |
| Perimetro | `git diff --stat 227b053..bd98f55` su `src/server/auth/`, `src/proxy.ts`, `prisma/`, `messages/`, `playwright.config.ts`, `.github/`, `.env.example`, `package.json` → **vuoto**. Nessun file PPR, nessun `pg_advisory` nuovo (solo `login-throttle.ts`, invariato): **F12/AC 11-14 NON implementati, come da §R**. `jwt-active-check.ts` intatto (AD-4). TD-16.7-e dichiarata (§I) |

Tutte le probe empiriche girano sulla build di produzione servita su **:3100** (`npm run start -- -p 3100 --keepAliveTimeout 75000`) DOPO l'arbitro; server fermato a fine lavoro (porte 3000/3100 libere, nessun `pg_sleep` residuo in `pg_stat_activity`).

## 2. Findings

### F1 — Low — Race (TOCTOU) in `updateUser`: un PATCH «no-op» concorrente riscrive il vecchio collegamento SENZA bump; una sessione aperta nella finestra conserva la persona sbagliata e sopravvive a ogni recheck. Falsifica la premessa di AD-4.

**Dove**: `src/server/services/users.service.ts:155` (lettura `existing`), `:188` (`personIdChanges` calcolato su quella lettura), `:192-199` (scrittura separata, nessun lock né condizione sul valore letto); `src/server/auth/jwt-active-check.ts:40` (select senza `personId`), `:47` (solo confronto di versione).

**Meccanismo**: la decisione «bump sì/no» è presa su una lettura fatta FUORI dalla scrittura. PATCH2 = `{ personId: A }` (un client che rimanda il collegamento corrente, il caso che AD-4 vuole proteggere) legge A → `personIdChanges = false`; nel frattempo PATCH1 = `{ personId: B }` committa `(B, v+1)`; l'utente fa login e riceve un JWT `(personId B, tokenVersion v+1)`; poi PATCH2 scrive `personId = A` **senza** bump. Stato finale DB `(A, v+1)`, sessione `(B, v+1)`: la versione combacia, il recheck la promuove, e la sessione agisce come B per sempre (cookie da 30 giorni; illimitato se rinnovato via `/api/auth/session`, v. F2). È esattamente il difetto F8, residuo in una finestra.

**Riproduzione deterministica** (`scratchpad/review-16-7/f8-race.cjs`, output `f8-race.out`): due sessioni psql tengono `SELECT … FROM "Person" WHERE id=… FOR UPDATE` su B (4 s) e su A (9 s), così i controlli FK delle due UPDATE si fermano e l'interleaving diventa riproducibile; i PATCH sono veri `PATCH /api/v1/users/{id}` come admin, login vero, recheck vero (cookie invecchiato di 16 min con `next-auth/jwt`, ricetta AD-5).

```
t+0.4s initial 1|<A>
t+4.8s PATCH1 committed: 2|<B>
t+5.0s PATCH1 relink->B done 200 2|<B>
t+5.5s user U logs in now; /me person = B
t+9.6s PATCH2 re-send A done 200 2|<A>
t+9.8s final DB 2|<A>
t+9.9s session claims: personId B tokenVersion 2
t+10.0s session aged 16 min (recheck runs): /me 200 me.person = A | GET /people/B 200 | GET /people/A 403
```

Dopo il recheck la sessione legge ancora la scheda di **B** (accesso «own», 200) e non quella di **A** (403), mentre `/me` (che risolve dal DB) mostra A.

**Probabilità reale**: bassa — servono due PATCH contraddittori sullo stesso utente quasi simultanei (due admin, o gestionale + futura app Flutter) E il login dell'utente nei pochi millisecondi fra le due scritture (senza i lock della prova la finestra è il tempo fra `findUnique` e `update` di PATCH2). Prima della 16.7 il difetto era SEMPRE aperto; la story è un miglioramento netto. Da qui il Low.

**Perché conta lo stesso — AD-4**: il record (§H5, AC 10b) e la story (AD-4) sostengono che `personId` nella select del recheck «sarebbe codice morto per l'unico scenario che la motiva», perché nessuna sessione con versione combaciante può avere un `personId` diverso dal DB. La prova sopra mostra lo stato raggiungibile: versione uguale, persona diversa. Un confronto nel recheck la chiuderebbe entro ≤ 15 min.

**Fix (uno dei due, il primo è il più economico)**:
1. `jwt-active-check.ts`: `select: { isActive: true, roles: true, tokenVersion: true, personId: true }` e `if (token.tokenVersion !== user.tokenVersion || token.personId !== user.personId) return null;` — **eviction**, non refresh (la variante «rinfresca `token.personId`» è esclusa da R-16-f). Zero query in più (stessa riga), chiude anche ogni futuro writer di `User.personId` che dimentichi il bump (oggi: nessuno a runtime; l'FK `ON DELETE SET NULL` di `User_personId_fkey` è l'unico writer implicito, senza percorso che cancelli `Person`). Unit gemello in `jwt-active-check.test.ts`.
2. In alternativa, rendere atomica la decisione in `updateUser`: scrittura condizionata al valore letto (`updateMany({ where: { id, personId: existing.personId }, … })` → 0 righe ⇒ 409/retry) o transazione con `SELECT … FOR UPDATE` sulla riga `User`.

Stessa classe dell'audit S-11 (guardia ultimo admin racy nella stessa funzione, fuori perimetro per §R fatto 7) — ma qui la conseguenza è proprio il difetto che la story chiude, ed è per questo che va deciso, non solo annotato.

### F2 — Info (correzione di record) — La formula di AC 10 / §N «fino a 30 giorni dall'ultimo uso (sessione scorrevole)» non descrive l'app: la navigazione NON rinnova il cookie

**Prova** (`scratchpad/review-16-7/sliding.cjs`, output `sliding.out`), utente `pilot@airmanager.local` sulla build di produzione:

```
/it/dashboard                    200 session Set-Cookie: none
/it/dashboard/bookings           200 session Set-Cookie: none
/api/v1/me                       200 session Set-Cookie: none
/api/v1/bookings?pageSize=5      200 session Set-Cookie: none
/it/dashboard/my-account         200 session Set-Cookie: none
/api/auth/session                200 session Set-Cookie:  Expires=Fri, 04 Dec 2026 17:08:15 GMT
```

`auth()` senza argomenti (pagine RSC e `apiRoute` via `getSessionActor`) scarta il `Set-Cookie` (`node_modules/next-auth/lib/index.js:45-48`), `src/proxy.ts` usa `getToken` e non riemette (TD-4); l'unico rinnovo è `GET /api/auth/session`, che la UI chiama solo dentro `signIn` di `next-auth/react` al login (nessun `SessionProvider`/`useSession` in `src/`). Quindi, prima della story, un utente ricollegato che usa l'app restava sulla persona precedente **fino a 30 giorni dal login**, non «finché usava l'app»; **senza limite** solo per un client che chiama apposta `/api/auth/session` (è il caso S-16 dell'audit, cookie rubato). La formula corretta da riportare in AC 10a, §I (TD 16.7-b) e §N punto 2: «fino a 30 giorni dal login per chi usa l'app (la navigazione non rinnova il cookie); senza limite per un client che rinnova il cookie su `/api/auth/session` → ora ≤ 15 min». Ne segue anche che §H7 chiama «stantio» il commento di `auth.config.ts:19-26` («absolute from sign-in»): per il percorso UI quel commento è esatto, è incompleto solo per `/api/auth/session`. Nessun cambio di codice richiesto (la story giustamente non tocca `auth.config.ts`).

### F3 — Info (correzione di record) — Delta unit: 2261 → 2270 (+9), non 2262 → 2270 (+8)

`git archive 227b053` + `npx vitest run` → **2261** (84 file), che coincide con la baseline del lead. Diff per file (`npx vitest list`, base vs HEAD): `bookings.service.test.ts` 336 → 340, `users.service.test.ts` 15 → 18, `registry.test.ts` 54 → 55, **e `src/lib/env.ci-sync.test.ts` 12 → 13**. Il nono test è il caso parametrico «ci.yml provides AUTH_SECRET, read by the e2e specs» (`env.ci-sync.test.ts:56-58`), generato perché `e2e/session-identity.spec.ts:8` legge `process.env['AUTH_SECRET']`; è verde perché il job e2e lo fornisce (`.github/workflows/ci.yml:77`). La baseline 2262 del record è stata misurata in una copia che conteneva già il nuovo spec. Correggere §M (e il change log) in «2261 → 2270, +9 (bookings +4, users +3, registry +1, env.ci-sync +1 indotto dallo spec nuovo)».

## 3. Verifiche passate (evidenza empirica)

### F6 — matrice per ruolo su ogni percorso di lettura (`f6-matrix.cjs` → `f6-matrix.out`)

Fixture run-unique: velivolo `I-RV17938120`, giorno `2030-08-25`; prenotazione di un terzo creata dall'admin con `force: true` (`forcedAt` valorizzato: `2026-11-04T17:07:24.268Z`) + prenotazione propria di un pilota collegato. Per ogni attore: lista (pagina 1 tutti gli stati `pageSize=100`; `from=` il giorno; filtro velivolo), calendario del giorno, export xlsx (decompresso e cercato ogni id `Person` del DB), PDF (200), e l'**HTML con il payload RSC** di `/it/dashboard/bookings` (vista giorno, settimana, tutti gli stati) e `/it/dashboard`, cercando ogni id `Person` e `InstructorProfile` del DB diverso dal proprio.

| Attore | Righe mascherate con `personId` | Righe mascherate con `forcedAt` | Id di terzi in lista/calendario | Id di terzi in xlsx | Id di terzi nell'HTML/RSC (4 pagine) |
|---|---|---|---|---|---|
| pilot (seed) | 0 | 0 | 0 | 0 | 0 |
| student (seed) | 0 | 0 | 0 | 0 | 0 |
| pilot collegato (riga propria `forcedAt` presente: `unmaskedForced=1`) | 0 | 0 | 0 | 0 | 0 |
| pilot **senza persona** | 0 | 0 | 0 | 0 | 0 |
| student **senza persona** | 0 | 0 | 0 | 0 | 0 |
| PILOT+STUDENT senza persona | 0 | 0 | 0 | 0 | 0 |
| admin / instructor (seed) / instructor senza persona | nessuna riga mascherata (`masked=0`), `personId`/`forcedAt` presenti (es. `foreignIds=60`, `unmaskedForced=65`) — staff invariato | | | | |

Altri percorsi (`f6-single.cjs`, `f6-conflict.cjs`): `?personId=<terzo>` → 403 per pilota collegato, pilota senza persona e allievo (il 403 di `listBookings` resta in piedi, AC 15); `PATCH`/`cancel` su prenotazione altrui → 403 «Actor may only modify or cancel their own bookings.»; `transition` → 403 `bookings.manage.any`; 409 di sovrapposizione velivolo → corpo senza `details` né id. **OpenAPI** (`GET /api/v1/openapi.json`, 3.1.0): `Booking.personId {"type":["string","null"]}` e ancora in `required` (campo sempre presente, eventualmente null — semantica corretta), `forcedAt {"type":["string","null"],"format":"date-time"}`.

### `isOwnRow` (desktop + sheet mobile, `ui-isownrow.cjs` → `ui-isownrow.out`, screenshot in `shots/`)

```
pilot(no person)          desktop: page1 move=0 cancel=0; righe «Occupato» del velivolo sonda: move=0 cancel=0 (x2)
pilot(no person)          mobile 390: sheet move=0 cancel=0 (x2)
pilot+student(no person)  desktop: move=0 cancel=0 (x2) · mobile: sheet move=0 cancel=0 (x2)
pilot(linked)             desktop: «Occupato» move=0 cancel=0 · riga propria move=1 cancel=1
pilot(linked)             mobile: «Occupato» sheet move=0 cancel=0 · card propria sheet move=1 cancel=1
```

STUDENT non ha `bookings.manage.own` (`rbac.ts:106`) ⇒ `canManageOwn` falso, la trappola `null === null` riguardava solo PILOT (anche multi-ruolo). INSTRUCTOR (con o senza persona) ha `bookings.read.names` ⇒ righe mai mascherate, `personId` mai null, clausola ininfluente (logica identica a prima per `ownPersonId` non nullo). Il server resta l'autorità: il pilota senza persona riceve 403 su PATCH/cancel altrui.

### F8 — bump, eviction, residuo (`f8-bump.cjs` → `f8-bump.out`, `f8-ui-evict.cjs` → `f8-ui-evict.out`)

`tokenVersion|personId` letti col psql dopo ogni PATCH reale:

```
roles / locale / isActive / tutti e tre insieme      1 -> 1   (nessun bump)
personId A (stesso) / personId A + roles             1 -> 1
personId B (relink)                                  1 -> 2
personId B di nuovo                                  2 -> 2
personId null (unlink)                               2 -> 3
personId null di nuovo                               3 -> 3
personId C (da null)                                 3 -> 4
isActive false / true                                4 -> 4
personId <già collegato ad altri> -> HTTP 409        4 -> 4   (rollback: nessun bump)
```

Eviction: sessione S1 (persona C, v4), relink C → A; S1 **non** invecchiata → `/me` 200 con `person = A` mentre `GET /people/C` 200 e `/people/A` 403 (grazia ≤ 15 min dichiarata, TD 16.7-b, identità incoerente a schermo nella finestra — già nota); S1 invecchiata di 16 min → `/me` **401 `UNAUTHENTICATED`**, `/people/C` 401; pagine `/it/dashboard`, `/it/dashboard/bookings`, `/it/dashboard/people/{id}` → **307 → `/it/login`**; `/api/v1/people/{id}/account/movements` 401. Raffica di 12 relink identici concorrenti → tutti 200, versione 5 → 8, stato finale coerente (sovra-eviction innocua); 12 PATCH misti → coerente. AD-4 regge su tutto tranne l'interleaving di F1.

### `e2e/session-identity.spec.ts`

Utenti, persone, velivolo e prenotazione run-unique; nessun AppSettings scritto, nessun aggregato globale ⇒ fuori dalla catena serializzata, corretto. Login reali solo su identifier run-unique + l'admin (i login riusciti non consumano il cap TD-6). `encode`/`decode` da `next-auth/jwt` con `salt` = nome del cookie; il controllo decisivo (stesso invecchiamento, utente non ricollegato → 200) c'è, quindi il 401 è attribuito al mismatch di versione e non all'età del token. `AUTH_SECRET` disponibile al runner anche in CI (job e2e, `ci.yml:77`). Rischio di accumulo del walk a pagine (`findApprovedBookingRow`, max 50 pagine × 20): sul DB post-arbitro le APPROVED fra ora-48h e il 2029 sono **33** ⇒ ~2 pagine per run, nessun rischio pratico.

### Testo del codice

Commenti e doc-comment nuovi verificati contro il comportamento: «single-booking responses never masked» (vero: create/PATCH/cancel di righe proprie o staff, transition solo `bookings.manage.any`); «cosmetic, not an authorization hole» (vero, 403 misurato); «`isOwn` reads the unmasked row» (vero, `Booking.personId` NOT NULL). L'unica affermazione falsa è nel record (AD-4/§H5, v. F1). Modifiche chirurgiche: 23 righe di produzione fra `users.service.ts` e `bookings-table.tsx`, 2 di logica in `bookings.service.ts`, resto doc/OpenAPI.

## 4. Domande per il PO (in parole semplici)

1. **Caso limite sul cambio di persona (F1)**. Oggi, quando un amministratore collega un utente a un'altra persona, quell'utente viene disconnesso entro un quarto d'ora. C'è un'unica eccezione: se nello **stesso istante** arrivano due modifiche allo stesso utente — una che lo collega alla nuova persona e una che rimanda il collegamento vecchio (per esempio due amministratori, o il gestionale e la futura app) — e l'utente **accede proprio in quei millesimi di secondo**, resta dentro come la persona sbagliata e non viene più disconnesso. Nella pratica è quasi impossibile che succeda, ma la chiusura costa due righe. **Preferisci chiuderlo subito in questa story, o registrarlo come debito tecnico?** (Raccomandazione del reviewer: chiuderlo subito, opzione 1 di F1.)

Nessun'altra decisione richiesta: F2 e F3 sono correzioni del record.

## 5. Riepilogo per la sessione principale

- Fix di codice: F1 (Low) secondo la risposta del PO; se si chiude con l'opzione 1, AD-4 va riscritta nel record (la `select` allargata non è codice morto: chiude l'interleaving di F1) e serve un unit gemello in `jwt-active-check.test.ts` con discriminanza.
- Correzioni di record (nel `docs(16.7)` di chiusura): AC 10a / §I TD 16.7-b / §N punto 2 con la formula di F2; §H7 sul commento di `auth.config.ts`; §M delta unit 2261 → 2270 (+9) di F3.
- Nessun nuovo arbitro necessario per le sole correzioni di record; se entra il fix F1, rigirare gates + suite (`scripts/e2e.sh`), come da ciclo.
