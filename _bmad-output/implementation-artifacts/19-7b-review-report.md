# Review adversarial — Story 19.7b «Registro Scadenze unificato»

- **Reviewer**: Opus 5.5 (`review-19-7b`), metodo `bmad-code-review` + `karpathy-guidelines`; 2026-11-02.
- **Commit sotto review**: `450a0f6` (feat) + `cb06ff2` (docs), baseline `f4c1e6a`. Diff `f4c1e6a..cb06ff2`: 25 file, +1793/−465.
- **Repo**: nessun file modificato dal reviewer (`git status` invariato rispetto all'inizio: solo l'untracked/`D` preesistenti di `.claude/skills/…`). Script e prove nello scratchpad.

## Verdetto

**SHIPPABLE.** Arbitro completo su DB fresco **verde: 553 passed + 2 flaky = 555, `E2E_EXIT=0`** (delta dichiarato 549 → 555 rispettato; i 2 flaky sono la classe METAR, provata, fuori dalla story). Nessun blocker, nessun major. Il cuore della story — la SQL del registro unificato — regge ogni sonda empirica che ho saputo costruire: **parità SQL ↔ TS della currency esatta** su una fixture casuale di 80 persone e 303 voli con 6 coppie (X, Y) e 5 istanti a cavallo dei cambi d'ora e della mezzanotte di Roma; paginazione stabile, ordinamento D-20, contatori = conteggio delle righe, finestre/stato/categoria = filtro in JS, escape di `%`/`_`/`\`, nessun doppione, guardia «nessun tipo MEDICAL attivo»; RBAC 403 per pilota/istruttore/allievo su lista, PDF e xlsx; prestazioni sul DB di carico sotto soglia.

Restano **2 finding LOW** (correggibili nel commit di chiusura) e **2 decisioni PO** (DP-1 è la più rilevante: la Panoramica viene «affamata» dalle righe derivate — conseguenza della ratifica Q-19.7-a = B, non un difetto di implementazione).

---

## Arbitro (priorità zero)

- **DB**: `airmanager` ricreato dalla sessione principale alle 10:44:29 CET (verificato: `pg_stat_file` della directory del DB; 4 utenti, 1 velivolo, 0 voli, 0 `LoginAttempt` al momento del lancio). `:3000` libera, `scripts/e2e.sh status` = DONE del run precedente.
- **Comando**: `export JOBS_SECRET=<non placeholder> CI=1 && scripts/e2e.sh start` (suite completa, build di produzione dentro il cronometro). Lanciato 10:45:29, fine 11:05:05.
- **Esito verbatim** (`scripts/e2e.sh status`):
  ```
  state: DONE — E2E_EXIT=0
  --- summary ---
    2 flaky
    553 passed (19.6m)
  ```
- **Copia del log**: `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/arbiter-19-7b-last-run.log` (riga 848 «2 flaky», 851 «553 passed»).
- **Spec della story nel run**: `expiries-registry.spec.ts` 6/6 al primo colpo (test 128-133); `expiry-dashboard.spec.ts` 7/7 (forbice AC 11 inclusa, test 140); `mobile-overview.spec.ts:416` verde (356); `expiry-rules-currency.spec.ts` verde (150-152).

### I 2 flaky — diagnosi: classe METAR (fetch esterno senza timeout), NON la 19.7b

| Flaky | Tentativi | Errore |
|---|---|---|
| `[settings] settings.spec.ts:127` (Club card, email malformata) | ✘ / ✘ retry 1 / ✓ retry 2 | `toHaveURL(/\/it\/dashboard$/)` — resta su `/it/login` per 5 s |
| `[mobile-metar] mobile-metar.spec.ts:61` | ✘ / ✓ retry 1 | stesso errore alla riga di login |

Prove, in ordine:
1. **Non è il lock TD-6**: `LoginAttempt` dopo il run — `admin@airmanager.local` 540 tentativi, **540 `succeeded = true`, 0 falliti**; l'unico fallimento del run è `nobody@airmanager.local` (1, test voluto). Il cap per identifier conta i fallimenti: non può essere scattato.
2. **Non è il POST di login lento**: trace del tentativo fallito (`test-results/settings-…-settings-retry1/trace.zip`, contesto 0): `POST /api/auth/callback/credentials` **200 in 59 ms** con `set-cookie` della sessione; i due `GET /it/dashboard?_rsc=…` rispondono **200 con gli header in 8 e 26 ms ma `receive: -1`, `size: -1`** — il corpo RSC della Panoramica non finisce mai di arrivare nei 5 s, quindi il router non committa la navigazione.
3. **Non è la query del registro**: la stessa SQL di `listAllExpiries` (vista della Panoramica, `window=60`, 60 righe) sul DB e2e allo stato di fine run (512 persone, 156 voli, 943 `Expiry`) in `BEGIN READ ONLY` + `EXPLAIN ANALYZE`: **Execution Time 8.9 ms**.
4. **È il METAR**: `dashboard/layout.tsx:94` fa `await getMetar(metarStation)`, e `metar.service.ts:111` chiama `fetch('https://aviationweather.gov/…')` **senza timeout**. Il test che precede `settings:127` nella stessa describe seriale (`settings.spec.ts:101`) salva un ICAO casuale `LI??`, che diventa la stazione METAR (fallback di `getMetarStation`, `app-settings.service.ts:312-318`) → cache fredda → fetch live al login successivo. `mobile-metar` scrive stazioni per costruzione. Misura dall'host, stesso endpoint: `LIRF` 0.28 s, **`LIQZ` (stazione inesistente) 16.13 s**, `LIXY` 0.28 s.

Conclusione: classe METAR nota, preesistente, nessuna relazione col diff. (Fuori scope, per la sessione principale: il fetch senza `AbortSignal.timeout` è la causa radice di questa classe — candidato TD.)

---

## Finding

### F1 — LOW — TD-19.9-a non toccato né annotato: il registro unificato è ora asimmetrico per le persone archiviate e i tipi disattivati

- **Dove**: `src/server/services/expiries.service.ts:443-446` (ramo documenti: `FROM "Expiry" e JOIN "ExpiryType" t` senza filtri) contro `:419-430` (`currencySubjects`/`members`: `p."archivedAt" IS NULL`). Story file: nessuna menzione di TD-19.9-a (`grep -n "TD-19.9-a" 19-7b-*.md` → 0).
- **Contesto**: la 16.4 (P2, ratifica **R-16-c** seconda metà, PO) chiedeva persone archiviate e tipi disattivati fuori da contatori e registro; superseded dalla CR, la 19.9 l'ha parcheggiata come **TD-19.9-a** con l'indicazione testuale «contatori e registro → **verificare se la 19.7b li filtra già**, altrimenti una story dedicata» (`19-9-avviso-deroga-voli.md:452`). La 19.7b riscrive esattamente quelle due funzioni, ma il record non verifica né aggiorna il TD.
- **Effetto misurato** (gemello `airmanager_rvw197b`, fixture casuale, poi eliminato): righe di persone archiviate nel registro = **10, tutte `DOCUMENT`, 0 `DERIVED`** → un archiviato non ha currency/quota/visita «Mancante» (corretto) ma i suoi documenti restano in lista e nei contatori («Scaduti» incluso); disattivando «Rating SEP» le sue **26** righe restano listate e contate, mentre il select dei tipi (solo attivi, `expiries/page.tsx:91`) non permette più di filtrarle. Sul DB di carico la 16.4 aveva misurato 708 `Expiry` di archiviati su 13 612.
- **Trappola se si decide di filtrare**: escludere i documenti di tipi **disattivati** interagisce con D-22/D-4. Una persona la cui sola visita è di un tipo MEDICAL disattivato e scaduta non avrebbe più né la riga documento né la «Mancante» (il ramo `medical:` richiede «nessuna `Expiry` MEDICAL» di qualsiasi tipo, `:458-459`), mentre il requisito D-4 per lei fallisce → il fallimento sparirebbe dal registro. Le persone archiviate invece si possono escludere senza effetti collaterali (`JOIN "Person" pd ON pd."id" = e."personId" WHERE pd."archivedAt" IS NULL`).
- **Fix suggerito**: decisione della sessione principale — (a) annotare nel record e in `sprint-status.yaml` che la 19.7b **non** filtra e TD-19.9-a resta aperto con casa da assegnare (minimo indispensabile, perché il TD rimandava qui); oppure (b) chiudere la metà «archiviati» qui (una riga nel ramo documenti, effetto anche sui contatori) e lasciare aperta solo quella dei tipi disattivati, che richiede la scelta di cui sopra.

### F2 — LOW — `{days}` non pluralizzato nel dettaglio della currency: «negli ultimi 1 giorni» / «in the last 1 days»

- **Dove**: `messages/it.json:1451`, `messages/en.json:1451` (`ExpiriesPage.registry.currency.detail`): il plurale ICU copre `count` ma non `days`.
- **Riproduzione** (gemello demo, build di produzione su :3001, poi eliminato): `AppSetting currency.windowDays = '1'` (valore ammesso: `CURRENCY_LIMITS.windowDays.min = 1`, `src/lib/currency.ts`; la 19.8 lo renderà impostabile da UI) → colonna «Certificato» con `category=CURRENCY`: IT `"0 voli negli ultimi 1 giorni"`, EN `"0 flights in the last 1 days"`.
- **Fix suggerito**: `… negli {days, plural, one {ultimi # giorno… }}` — es. IT `{days, plural, one {nell'ultimo giorno} other {negli ultimi # giorni}}`, EN `{days, plural, one {in the last day} other {in the last # days}}`; nessun impatto sugli e2e (usano Y = 90).

---

## Decisioni PO necessarie

### DP-1 — (impatto MEDIUM) La Panoramica viene riempita dalle righe derivate: saldi negativi e documenti in scadenza spariscono dal primo schermo

Conforme alla story (D-17, D-19, D-20, AD-4: «Mancante» = rango «scaduto», peso −1) e alla ratifica Q-19.7-a = B, quindi **non è un difetto di implementazione**; ma l'effetto concreto non mi risulta scritto da nessuna parte, e su due punti va oltre i documenti considerati da D-20:

1. **Feed «Avvisi» mobile (tetto 5)** — ordine ratificato R-15.3-e: scaduto (rango 0) → saldo negativo (rango 1, `overview-alerts.ts:120`) → ≤ 7 g. Con la 19.7b il rango 0 contiene anche ogni currency scaduta o mai acquisita, ogni quota mai pagata e ogni visita mancante. **Misura sul gemello demo** (`seed` + `seed:demo`, stessa funzione `buildOverviewAlerts` sugli stessi dati):
   - 19.7b: `Marchetti·Rating SEP·-63 | Greco·Rating SEP·-33 | Colombo·Visita medica classe 2·-10 | Romano·Inglese ICAO·-2 | Volante·Currency·Mancante` (+17);
   - stessi dati, sole righe documento (forma pre-19.7b): `… | Romano·Inglese ICAO·-2 | **BALANCE −94,25 €**` (+6).
   L'unico saldo negativo del demo **esce dal feed**; confermato dalla pagina reale a 375 px: «Avvisi … Volante Piero · Currency · Mancante · +17 altri».
2. **Widget Scadenze desktop (6 righe, finestre 7/30/60)** — una «Mancante» entra in ogni finestra (`scadenze-widget.tsx:72`): sul demo le tre finestre mostrano **le stesse 6 righe** (4 documenti scaduti + 2 currency «Mancante»), e «Esposito · Visita classe 2 · 12 g» / «Rinaldi · Visita classe 1 · 20 g», visibili prima nella finestra 30 g, non compaiono più.
3. **Su un club con soci inattivi la testa è fatta di currency vecchie**: sul DB di carico (sola lettura) le **prime 10 righe** della vista predefinita sono tutte `CURRENCY` scadute da **456 a 795 giorni** (piloti che non volano più); 1 919 currency scadute + 1 109 quote «Mancante» + 296 visite «Mancante» si sommano ai 5 159 documenti scaduti. La Panoramica mostrerebbe «Rossi · Currency · 795g fa» prima di «Bianchi · Visita medica · scaduta ieri».

Opzioni (da scegliere col PO; nessuna è di questa story senza ratifica): accettare; Panoramica (widget + Avvisi) sui soli documenti, registro invariato; derivate in un rango sotto i saldi negativi; righe currency scadute da oltre N giorni fuori dalla Panoramica.

### DP-2 — TD 19.7b-a (tetti degli export) — confermato

Il dev l'ha già dichiarato; misura mia sul DB di carico: totale della vista predefinita 11 141 (> 10 000 xlsx, > 2 000 PDF) → `EXPORT_TOO_LARGE` in entrambi finché non si restringe un filtro (prima: 5 692, xlsx passava). Realistico solo per club molto grandi; resta una decisione PO (alzare il tetto xlsx o esportare i soli documenti nella vista predefinita).

---

## Verificato corretto (con prove)

- **Parità SQL ↔ TS della currency (D-15, F2 della 19.7a)** — script `scratchpad/rvw/parity.ts` sul gemello: 80 persone (profili pilota/allievo/istruttore casuali, 5 % archiviate, 10 % profili disattivati), 303 voli (134 in doppio, **37 solisti**, 15 futuri, doppioni nello stesso giorno, **10 righe legacy con istruttore = pilota** inserite di proposito per provare l'equivalenza `UNION ALL … <>` ⇔ `UNION` di D-b). Per (X, Y) ∈ {(1,90), (2,30), (3,60), (2,1), (1,1), (4,200)}: insieme dei soggetti del registro = insieme di `listCurrencyByPerson` (diff 0), e per ogni riga `expiresAt`, `daysUntil`, `current`, `lastFlightDate`, `flightsInWindow` = `getCurrencyStatus`/`computeCurrency` → **PARITY OK, 0 mismatch**.
- **Cambi d'ora e mezzanotte di Roma (D-21)** — `parity-dst.ts` con `Date` finto: 2026-03-28T23:30Z (Roma 29/03, giorno del passaggio all'ora legale), 2026-03-29T01:30Z, 2026-10-24T22:30Z (Roma 25/10, ritorno all'ora solare), 2026-10-25T00:30Z, 01:30Z, con X/Y (1,90) e (2,30): oggi di Roma corretto e **0 mismatch** SQL/TS; `daysUntil` calcolato sull'oggi di Roma (es. 2026-08-01 → −85 al 25/10).
- **Coerenza del registro** — `consistency.ts` sul gemello (279 righe, 171 documenti casuali): id unici (279/279); paginazione a 7 righe concatenata = pagina unica da 5000 (stabile, tie-break per `id`); ordine = `COALESCE(expiresAt, ieri)` in tutta la lista; **contatori `getExpiryTierCounts` = tally delle righe** (163/12/26/26); `window` 7/30/60/expired = filtro JS identico (stessi id, stesso ordine); `status` ok/expiring/expired/missing = righe con quello stato; `category` ×4 = conteggio JS; `personQuery` `%`, `_`, `\` → 0, `PRB%` → 0, `prb` → 271 (case-insensitive); **D-22**: 0 persone con «visita Mancante» + documento medico, 0 doppie quote, 0 doppie currency; tutti i tipi MEDICAL disattivati → righe MEDICAL 103 → 85 (−18 «Mancante»), `missing` 65 → 47, quote e currency invariate.
- **Contatori sul demo (AC 2)**: 14/0/5/2 = record del dev; sottotitolo «21 da gestire» = somma (screenshot).
- **RBAC** (build di produzione su :3001 contro il gemello demo, login reale): admin `GET /api/v1/expiries` 200, `/pdf` 200, `?format=xlsx` 200; **pilot, instructor, student: 403 / 403 / 403**. `PATCH` e `DELETE` di `currency:<id>`, `membership:<id>`, `medical:<id>` → **404**. `category=currency`/`FOO` → 422; `window=all` → 422 (è l'assenza del filtro, come documentato); `status=missing` → 10 righe tutte `missing`; `page=999` → `items: []`, `total: 40` (conteggio di ripiego di D-a corretto).
- **Prestazioni (AC 14)** — `airmanager_load`, `BEGIN READ ONLY` (verificato `current_database() = airmanager_load`, `transaction_read_only = on`), solo `EXPLAIN (ANALYZE, BUFFERS)` di `SELECT`, adattamento letterale `"kind" = 'MEMBERSHIP'` → `"name" = 'Quota associativa'` come il dev. Macchina scarica, 4 giri: (a) vista predefinita pagina 1 + totale **166-231 ms**; (b) `window=all` 136-181 ms; (c) contatori 127-172 ms; (d) `category=CURRENCY` 97-147 ms; (e) ricerca `ros` 125-186 ms. **Tutte ≤ 300 ms** (le misure durante l'arbitro, 436-965 ms, erano contaminate da load average 8 su 4 CPU e sono scartate).
- **Gate**: `npm run gates` → lint, typecheck, **test 1966/1966**, build: PASS. `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` sui 6 file toccati → 256/256.
- **UI** (playwright-core su Chromium 1228, build di produzione, gemello demo): registro 1280 chiaro e scuro (documenti scaduti, 10 «Mancante» con tinta/inchiostro del tier 0, poi in scadenza; paginazione 1/2), viste Currency/Quota/Visite mediche, EN («0 flights in the last 90 days», «Missing», «26 d»), nessun overflow orizzontale; 375 px card («Currency» / «Visita medica» / «Quota associativa» + «Mancante»), sheet di una «Mancante» (sovrariga «CURRENCY · 0 VOLI NEGLI ULTIMI 90 GIORNI», Scadenza/Giorni/Ambito/Note «—»), pannello Filtri con Categoria e Tipo; widget desktop e Avvisi mobile (v. DP-1). Screenshot in `scratchpad/rvw/shots/`.
- **Codice**: SQL solo via `Prisma.sql`/`Prisma.join`/`Prisma.empty`, ogni input legato; date come stringhe `::date`; `COUNT` castati `::int`; enum `::text`; `COUNT(*) OVER ()` calcolato prima di `LIMIT`; nessun consumatore di produzione usa gli id derivati per azioni (unici lettori dell'API in `src`: pagina, export, Panoramica); il job promemoria legge ancora solo `Expiry` (A8); tipo MEMBERSHIP unico per costruzione (19.7a: sistema, 409 su PATCH/DELETE, `kind` non scrivibile) → `membership:<id>` non può duplicarsi; nessun e2e nuovo confronta aggregati globali per uguaglianza (forbice di AC 11 discriminante: un filtro che trapelasse nei KPI darebbe 0 contro due limiti > 0); testid nuovi senza collisioni con selettori `^=`; `ensureValidSeedExpiries` filtra `source === 'DOCUMENT'` ed è l'unico lettore e2e dell'API.

## Non-finding (annotati per completezza)

- `Quota associativa · Quota associativa` (badge di categoria e certificato uguali, anche nella sovrariga dello sheet) è dalla 19.7a, non da qui.
- «+N altre» del widget è un pavimento quando la scansione da 60 è piena — comportamento preesistente (il feed lo dichiara, il widget no); la 19.7b lo rende solo più frequente sui DB grandi.
- `metar.service.ts:111` senza timeout — causa radice dei 2 flaky, preesistente, fuori scope (v. Arbitro).

## Stato della macchina a fine review

- `:3000` e `:3001` libere; il server di verifica (`next start -p 3001`, PID 841945 + `npm exec` 841932) **fermato per PID**.
- `scripts/e2e.sh status` = **DONE — `E2E_EXIT=0`** (l'arbitro di questa review; log copiato nello scratchpad).
- DB: `airmanager` = stato di fine arbitro (non resettato); `airmanager_load` **solo letto** in `BEGIN READ ONLY … ROLLBACK`; gemelli `airmanager_rvw197b` e `airmanager_rvw197b_demo` **eliminati** (`pg_database` = solo `airmanager`, `airmanager_load`).
- `.next` = build di `npm run gates` sul contenuto di `cb06ff2`.
- Repo: nessuna modifica, nessun `git add`/`stash`/commit. Questo report **non** è committato.
