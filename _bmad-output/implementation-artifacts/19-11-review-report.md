# Review adversarial — Story 19.11 «Estratto conto a periodo con saldo progressivo»

- Reviewer: `review-19-11` (Opus 5.5, unico layer adversarial), 2026-11-03, metodo `bmad-code-review` (Blind Hunter + Edge Case Hunter + Acceptance Auditor eseguiti in sequenza, nessun subagent) + `karpathy-guidelines`.
- Sotto review: `0556850` (feat) e `79b44c6` (docs), più `a13b73e` (solo story file). Baseline `53738a4`. Diff `53738a4..79b44c6`: 37 file, +2320/−511.
- Repo NON modificato (nessun edit, nessun `git add`/`stash`); questo report non è committato.

## Verdetto

**SHIPPABLE.** Nessun finding HIGH o MEDIUM. Il cuore della story è corretto e l'ho verificato empiricamente: SQL a una istruzione, saldo progressivo, saldo iniziale e finale, confini inclusivi, ordine, coerenza fra le pagine, badge, RBAC, export, indice e migrazione, seed demo. L'ho confrontato con un ricalcolo indipendente, anche con scritture concorrenti. Restano **6 finding LOW**:

- 2 patch UI facoltative (F1, F4);
- 1 pre-esistente da registrare come TD (F2);
- 1 commento stantio (F5);
- 1 copy da girare alla 19.12 o al PO (F6);
- 1 osservazione sul seed demo (F3).

Nessuno blocca la chiusura.

## Arbitro (priorità zero)

- Pre-condizioni: `ss -ltnp | grep :3000` vuoto, `scripts/e2e.sh status` = DONE (serie mirata del dev, 178 passed), nessuna connessione su `airmanager`.
- DB fresco, resettato da me alle 12:15 di Roma: `DROP DATABASE airmanager WITH (FORCE)`, poi `createdb`, `migrate deploy` (57 migrazioni, compresa `20261103101004_account_movement_statement_index`) e `db seed`, tutto nel container.
- Lancio: `export JOBS_SECRET=local-e2e-secret-0123456789abcdef CI=1 && scripts/e2e.sh start` (suite completa, build di produzione dentro il run). Fuori dalla fascia 23:40-01:00.
- Esito, verbatim da `scripts/e2e.sh status`:
  ```
  state: DONE — E2E_EXIT=0
  --- summary ---
    604 passed (22.4m)
  === e2e start: 2026-11-03T12:16:33+01:00 ===
  === e2e end: 2026-11-03T12:38:58+01:00 ===
  E2E_EXIT=0
  ```
- **604 passed, 0 failed, 0 flaky, 0 skipped.** Il delta dichiarato 598 → 604 torna. I 6 test nuovi di `e2e/account-statement-period.spec.ts` sono tutti verdi (3,4-6,5 s ciascuno), così come `mobile-self-public:513` riscritto (AC 20) e l'intera catena serializzata.
- Nessun flaky da diagnosticare e nessun ECONNRESET in questo run.
- Copia del log: `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/arbiter-19-11-full.log` (sha256 `9cd669c2c62da040f7bf0a9cb8aa5d96de7567c877f00fe54c9bf7833ea4c0d8`, 604 righe `✓`). L'originale è ancora `/tmp/airmanager-e2e/last-run.log`: dopo non ho lanciato altri run e2e.

## Gate rieseguiti (dopo l'arbitro, con `:3000` libero)

- `npm run gates` → `PASS lint (43s)`, `PASS typecheck (4s)`, `PASS test (17s) — Tests 2178 passed (2178)`, `PASS build (48s)`.
- Env eager (regola CLAUDE.md): `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` su `accounts.service`, `exports.service`, `statement-period`, `period-presets`, `schemas/accounts` e `schemas/registry`, in una shell senza `.env` → `6 passed (6) / 203 passed (203)`.
- i18n: 1 616 → 1 629 chiavi per file, parità it/en vuota. Grep di AC 32: 0 righe per `linkedBadgeText|adjustmentBadge.linked|currentBalance`; un solo `orderBy createdAt desc`, a `accounts.service.ts:164` (readOverview); `$transaction` solo a `:181`, `:232` e `:698`, nessuno dentro `listAccountMovements`.

## Finding

### F1 — LOW (patch facoltativa) — La griglia a due righe della fascia 641-900 svuota la colonna «Tipo» sotto ~760 px, e a 641 sfora di nuovo

- Dove: `src/styles/airops.css:3806-3810`, cioè il blocco `@media (min-width: 641px) and (max-width: 900px)` con `grid-template-columns: 88px minmax(0, 1fr) 100px 100px 164px`.
- Causa: nella prima riga «Tipo» è l'unica traccia elastica, accanto a 88 + 100 + 100 + 164 px fissi. La griglia vale 483 px a 641 e 542 px a 700, quindi Tipo resta con 0-14 px. La faccia self (5 tracce, `account-section.tsx:348`) a 641 lascia 0 px alla descrizione; prima della story erano ~31.
- Riproduzione: scheda persona di un pilota con ≥ 21 movimenti, faccia admin, periodo predefinito. Script `scratchpad/ui-grid.mjs` (playwright-core su chromium-1228). Per ogni larghezza misura `.account-desktop-body` scrollWidth − clientWidth e la larghezza delle celle d'intestazione. Output verbatim:
  ```
  641 {"gridOverflow":27,...,"cells":"Data:88 | Tipo:0 | Descrizione:98 | Importo:100 | Saldo:100 | Registrato da:210 | Azioni:164!OUT"}
  700 {"gridOverflow":0,...,"cells":"Data:88 | Tipo:14 | Descrizione:112 | ..."}
  768 {"gridOverflow":0,...,"cells":"Data:88 | Tipo:82 | Descrizione:180 | ..."}
  800 {"gridOverflow":0,...,"cells":"Data:88 | Tipo:114 | Descrizione:212 | ..."}
  self (my-account) 641 {"gridOverflow":0,"desc":0,...}
  ```
  Screenshot `scratchpad/rev1911/admin-700.png`: la cella Tipo mostra «Re», il badge rettifica «R», l'intestazione «TI».
- Impatto: a 641-~720 px l'admin non legge il tipo del movimento né il badge rettifica; a 641 il bottone «Rettifica questo movimento» esce dal bordo di 27 px. AC 27 chiede la misura a 800 e 1280, e lì passa: la story è conforme alla lettera. Ma il commento CSS e D-a presentano il layout come la soluzione per *tutta* la fascia, e non lo è. Le larghezze 641-720 sono finestre affiancate, non dispositivi comuni (iPad in verticale, 768-834, dà 82-148 px a Tipo).
- Fix suggerito: sotto ~760 px portare anche le azioni sulla seconda riga, con `"date type amount balance" "desc desc actor actions"` sulle tracce `88px minmax(0,1fr) 100px 100px` (Tipo ≈ 129 px a 641). In alternativa dare a Tipo un `minmax(96px, 1fr)` e una sotto-fascia `max-width: 760px` per le azioni. Per la faccia self basta ridurre la traccia del tipo nella stessa fascia. Verifica: lo stesso script a 641/700/768 con Tipo ≥ 90 e gridOverflow ≤ 1.

### F2 — LOW (pre-esistente, da registrare come TD) — Faccia admin a 901-~1150 px: descrizione a 0 px e colonna «Azioni» fuori dal bordo

- Dove: le tracce di `account-section.tsx:348` fuori dalla media query 641-900. Sopra 900 torna la sidebar piena e il contenitore si restringe.
- Prova: stesso script, faccia admin.
  ```
  901  {"gridOverflow":233,"desc":0,...,"Registrato da:150!OUT | Azioni:164!OUT"}
  1024 {"gridOverflow":110,"desc":0,...,"Azioni:164!OUT"}
  1100 {"gridOverflow":34,"desc":0,...}
  1180 {"gridOverflow":0,"desc":28,...}
  1280 {"gridOverflow":0,"desc":128,...}
  ```
  Screenshot `scratchpad/rev1911/admin-1024.png`: nessuna intestazione «Descrizione», bottone «Rettifica (» tagliato, raggiungibile solo scorrendo in orizzontale dentro la card (`.students{overflow-x:auto}`).
- **Pre-esistente**. Ho emulato le tracce di `53738a4` (`104px 150px 1fr 120px 170px 170px`, gap 14 px, senza la cella Saldo) sulla stessa pagina (`scratchpad/ui-baseline-emul.mjs`):
  ```
  emulated pre-story 901 {"gridOverflow":227,"desc":0}
  emulated pre-story 1024 {"gridOverflow":104,"desc":0}
  emulated pre-story 1100 {"gridOverflow":28,"desc":0}
  emulated pre-story 1180 {"gridOverflow":0,"desc":34}
  emulated pre-story 1280 {"gridOverflow":0,"desc":134}
  ```
  La story la peggiora di soli 6 px pur aggiungendo una colonna. Non è una regressione, ma il bug c'è a 1024, una larghezza da portatile comune, e il layout a due righe della story lo risolverebbe con una riga.
- Fix suggerito (facoltativo, oppure TD): estendere la media query di F1 a `max-width: ~1180px`. Il layout a due righe richiede ~528 px e la griglia ne ha 575 a 901.

### F3 — LOW (osservazione, nessuna azione richiesta) — D-c: la deroga del seed demo lascia due prenotazioni timbrate `forcedAt`

- Verifica: su un DB gemello fresco (`am_1911_demo`) ho eseguito `migrate deploy`, `db seed` e `npm run seed:demo` → exit 0, «Seed: 6 bookings ready (3 approved, 2 pending, 1 denied)… Demo seed complete».
- Stato delle prenotazioni:
  ```
  APPROVED|f|De Santis | APPROVED|t|Romano | APPROVED|t|Greco | DENIED|f|Marchetti | PENDING|f|Esposito | PENDING|f|Marchetti
  ```
- La deroga timbra **due** prenotazioni admin (Romano **e** Greco), non solo quella di Francesca Romano citata in D-c. Le due auto-prenotazioni dei piloti nascono `PENDING` senza deroga, come approvato dal team lead. Il timbro `Booking.forcedAt` non compare in nessuna UI (`grep forcedAt src/app` → solo `logbook/page.tsx:160`, che riguarda i voli), quindi il PO non vede differenze.
- Lo segnalo solo perché il record descrive una sola rottura. Se in futuro un badge «Deroga» comparirà nelle prenotazioni, la demo ne mostrerà due.

### F4 — LOW (a11y, patch facoltativa) — Dopo «Applica» valido e dopo «Ultimi 12 mesi» il focus finisce su `<body>`

- Dove: `account-section.tsx:438`. La `key={\`${period.from}:${period.to}\`}` voluta da AD-5 rimonta `PeriodForm` a ogni periodo applicato, e il bottone che aveva il focus sparisce. Lo stesso accade a «Ultimi 12 mesi» (`:801`), che con il periodo predefinito non viene più renderizzato.
- Prova (`scratchpad/ui-focus.mjs`, da tastiera):
  ```
  after valid Applica (keyboard Enter): activeElement = BODY
  next Tab lands on: INPUT#account-period-from
  after Ultimi 12 mesi (keyboard): activeElement = BODY
  after pagination Successivo (keyboard): activeElement = A#account-statement-page-next   ← confronto: la paginazione lo conserva
  after invalid Applica: activeElement = BUTTON#account-period-apply                     ← il caso di AC 28 è corretto
  ```
- Impatto: Chrome conserva il punto di partenza della navigazione sequenziale, quindi il Tab successivo torna su «Dal». Un lettore di schermo però non annuncia nulla del nuovo periodo e resta sul documento. AC 28 chiede il focus nel form solo nel caso d'errore, e lì è rispettato.
- Fix suggerito: dopo la navigazione riportare il focus su «Applica» del form rimontato. Per esempio un `autoFocus` condizionato a un flag `submitted` passato via `sessionStorage`/ref, oppure niente `key` e un `useEffect([from, to])` che riallinea `draft`.

### F5 — LOW (doc, AC 33) — Commento riscritto che cita un dialog che non esiste più

- `src/server/services/exports.service.ts:560-561`: «Both bounds present (the two statement pages and the billing "Estratti conto" dialog always send both)».
- Il dialog «Estratti conto» di Contabilità è stato rimosso dalla Billing-2 (`5fed728`); `grep -rn "Estratti" src/app` → 0. La 19.11 ha riscritto questa frase aggiungendo «the two statement pages and» e ha lasciato il riferimento stantio.
- Fix: togliere «and the billing "Estratti conto" dialog».

### F6 — LOW (copy, decisione-needed → 19.12 / PO) — «Saldo iniziale al {from}» e «Saldo finale al {to}» usano la stessa preposizione con inclusività opposta

- `messages/it.json:768` («Saldo iniziale al {date}») e la chiave gemella `closingAt`. Il saldo iniziale **esclude** i movimenti del giorno `from` (`effectiveDate < from`); il saldo finale **include** quelli del giorno `to`.
- Sullo schermo (screenshot `rev1911/my-account-375-p2.png`), per lo stesso 03/11/2025 si leggono «Saldo iniziale al 03/11/2025 — 10,00 €» e, nella riga sopra, «Ricarica 03/11/2025 … Saldo 30,00 €». Nel linguaggio bancario «saldo al gg/mm» è di norma il saldo a fine giornata, quindi la prima etichetta si può leggere come 30,00 €.
- Il numero è corretto (AC 5, verificato sotto); è ambigua l'etichetta. La copy definitiva è della 19.12 (glossario A20).
- Opzioni da proporre:
  - (a) «Saldo iniziale (prima del {from})»;
  - (b) «Saldo al {from − 1}»;
  - (c) tenere com'è e definirla nel glossario.

## Decisioni PO necessarie

- **F6**: formulazione dell'etichetta del saldo iniziale. Va girata alla 19.12, che possiede la copy, non è bloccante.
- **F2**: TD da registrare, oppure fix con una riga insieme a F1. È una scelta della sessione principale, non serve il PO.

## Verificato corretto (con prova empirica)

1. **Saldo progressivo, saldi del periodo, ordine e paginazione**, contro un ricalcolo indipendente.
   - Setup: script `tsx` (`scratchpad/probe.ts`) che chiama il vero `listAccountMovements` su un DB gemello fresco `am_1911_rev`, con 14 movimenti costruiti apposta:
     - tre movimenti nello stesso giorno con l'ordine degli id **inverso** a quello di `createdAt`;
     - due movimenti con `createdAt` **identico**;
     - un movimento retrodatato (data valuta 2026-02-01, inserito il 2026-10-30);
     - una catena di rettifiche di rettifiche (adjB → adjA → z02);
     - una rettifica di un movimento precedente al periodo;
     - movimenti sul giorno `from−1`, su `from`, su `to` e su `to+1` (futuro);
     - un movimento nel giorno del cambio d'ora (2026-03-29).
   - Verifica: 7 periodi (storico completo, 12 mesi, un giorno solo, il giorno DST, solo `to`, solo `from`, periodo vuoto) × pageSize 1/2/3/20, percorrendo tutte le pagine più una oltre la fine. Confrontati id, ordine, `balanceAfterCents`, `reversalOfEffectiveDate`, `hasReversal`, `createdAt`, `total`, opening e closing. Risultato: `period/pages checks done, failures = 0`.
   - Altri esiti: senza periodo, `closing = 99083 = overview.balanceCents`. Il `createdAt` del `$queryRaw` coincide col valore del DB (`2026-01-01T10:00:00.000Z` per il letterale `2026-01-01 10:00:00.000`), quindi nessuno spostamento di fuso sul `timestamp(3)`.
2. **Una istruzione, una fotografia** (D-4). Race di 8 s (`scratchpad/race.ts`): un writer inserisce in continuo blocchi da 3 movimenti, un reader legge la pagina 1 da 5000 del periodo e controlla `items.length === total`, `items[0].balanceAfterCents === closing` e `closing − opening === Σ items`. Risultato: `{ reads: 126, bad: 0, inserted: 1986 }` (righe ripulite).
3. **RBAC per ruolo**, HTTP reale (`next start` sul gemello), sullo statement del pilota, per JSON, PDF e XLSX:
   - admin: 200 con `actorEmail`;
   - pilota sul proprio conto: 200 **senza** `actorEmail`;
   - istruttore: 403 `FORBIDDEN` «Actor may only read their own account.»;
   - allievo: 403, idem;
   - anonimo: 401 `UNAUTHENTICATED`.

   Allievo e istruttore sul proprio conto inesistente → 200 con forma vuota: `from`/`to` riportati, saldi 0.
4. **Validazione**:
   - `from > to` → 422 `VALIDATION_ERROR` con `fieldErrors.to: ["from must not be after to"]`, su movements e su pdf;
   - `2026-02-30`, `2026-13-01`, `2026-1-1` e i vuoti → 422;
   - `page=999` col periodo → 200 con `items: []` e lo stesso riepilogo;
   - `page=9007199254740991` → 200 vuoto, nessun 500;
   - `0001-01-01..9999-12-31` → 200;
   - PDF con solo `from` o solo `to` → 200.
5. **XLSX uguale allo schermo**: per 4 periodi (12 mesi, 3 settimane, solo `to`, nessuno) il file scaricato e il JSON percorso su tutte le pagine coincidono riga per riga (data, importo, saldo). La riga «Saldo iniziale» è in coda solo se c'è `from`, con Importo `null`. Intestazione `Data, Tipo, Descrizione, Importo, Saldo, Registrato da` → `identical=true` ×4.
6. **Tetto PDF**: con 2 001 movimenti nel periodo, a 1280 e a 800 il menu mostra `export-menu-pdf-unavailable` col testo leggibile «PDF non disponibile: il periodo ha più di 2000 movimenti…», nessun link PDF, XLS ancora link (screenshot `rev1911/cap-800.png`). Il 422 `EXPORT_TOO_LARGE` del server resta (e2e verde). Pagina e server usano lo stesso comparatore `total > cap` (`exports.service.ts:72-75`).
7. **Indice e migrazione** (gemello fresco):
   - `\d "AccountMovement"` → `AccountMovement_accountId_effectiveDate_createdAt_id_idx btree ("accountId","effectiveDate","createdAt",id)`, `_accountId_idx` assente;
   - `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code` → `-- This is an empty migration.`;
   - `migrate status` → «Database schema is up to date!»;
   - FK `reversalOfId` `ON DELETE SET NULL`, quindi D-9 regge: se `reversalOfId` è valorizzato l'originale esiste;
   - `EXPLAIN` sul gemello: la somma del saldo iniziale usa l'indice nuovo (`Index Cond: accountId = … AND effectiveDate < '2010-01-01'::date`), 4,9 ms. Il seq scan del periodo dipende solo dalla tabella minuscola; i numeri a 113 970 righe restano quelli del dev.
8. **OpenAPI servito** (`/api/v1/openapi.json` dell'app reale):
   - parametri di movements `id, page, pageSize, format, locale, from, to`; di pdf `id, locale, from, to`;
   - `AccountStatement` con `from, to, openingBalanceCents, closingBalanceCents` obbligatori;
   - voce con `balanceAfterCents` e `reversalOfEffectiveDate`;
   - summary «List a person's account statement for a period (paginated, by value date, with the running balance)»;
   - «CURRENT balance» assente.
9. **UI**:
   - a 375 su «Il mio conto», pagina 2: 7 card, card «Saldo iniziale 03/11/2025 10,00 €» in fondo, overflow 0;
   - sheet: `DATA | DESCRIZIONE | IMPORTO | SALDO` con il saldo dopo l'importo;
   - ordine nello stesso giorno = inserimento inverso, il retrodatato al suo giorno di valuta, la coppia a `createdAt` identico coerente fra pagina 1 e pagina 2 (tie b −15,70 €, tie a −15,90 €);
   - errore di periodo annunciato (`role=alert`) con il focus su «Applica»;
   - faccia self a 700-1280 senza sforamenti.
10. **Seed** (D-16/D-c): `db seed` e `seed:demo` verdi su DB fresco; saldo iniziale di Marco De Santis nel periodo predefinito = 25 000 cent (SQL sul gemello demo), quindi diverso da 0,00 €.
11. **Accettazione**: AC 1-36 coperti dagli e2e verdi dell'arbitro e dalle prove sopra. Le uniche eccezioni sono le note LOW F1/F2 sulle larghezze fuori dalle due misurate da AC 27.

## Stato della macchina a fine review

- `:3000` libero. Il mio `next start` (PID 1658482, sul gemello) è stato fermato per PID e non resta nessun processo `next`.
- `.next` = build di `npm run gates` su HEAD `a13b73e`, stesso codice dell'arbitro.
- DB:
  - gemelli `am_1911_rev` e `am_1911_demo` creati ed **eliminati**;
  - `pg_database` = `airmanager`, `airmanager_audit`, `airmanager_load`, `postgres`, template;
  - `airmanager` = DB dell'arbitro, resettato da me prima del run e lasciato con le fixture del run;
  - `airmanager_audit` e `airmanager_load` mai toccati.
- e2e: `scripts/e2e.sh status` = DONE `E2E_EXIT=0` (l'arbitro), nessun run in corso.
- Repo: nessuna modifica mia. `git status` mostra solo lo stato pre-esistente all'avvio (`D .claude/skills/design-taste-frontend/SKILL.md` e i non tracciati) più questo report, non tracciato e non committato.
- Scratchpad `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/`: copia del log dell'arbitro, script (`probe.ts`, `race.ts`, `api-probe.mjs`, `xlsx-check.mjs`, `ui-grid.mjs`, `ui-baseline-emul.mjs`, `ui-focus.mjs`, `ui-375.mjs`, `ui-cap.mjs`, `fixture.sql`) e screenshot in `rev1911/`.
