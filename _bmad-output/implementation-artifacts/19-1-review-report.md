# Review adversarial — Story 19.1 «Rimozione del dominio PPR»

- **Reviewer**: Opus 5.5 (`claude-opus-5-5`), unico layer adversarial — 2026-11-01
- **Commit sotto review**: `08eb558` (feat) + `e5ce1b2` (docs), baseline `72e7e1b`. HEAD al momento della review = `3876e72`
  (solo docs 19.3/19.4: `git diff --stat e5ce1b2 3876e72 -- src e2e prisma messages scripts playwright.config.ts` → vuoto).
- **Metodo**: `bmad-code-review` (blind + edge-case + acceptance auditor eseguiti in sequenza da me: questo agent non può
  lanciare subagent) + `karpathy-guidelines`; prove empiriche su build di produzione, DB, gemelli e browser.

## Verdetto: **SHIPPABLE-WITH-FIXES**

1 minor (guardia e2e ri-ospitata che ha perso, in silenzio, la proprietà che il suo commento dichiara ancora) + 3 low
(di cui 1 da girare a TD, 1 di coerenza del story file, 1 preesistente da differire). Nessun major. La rimozione è completa,
chirurgica e verificata: arbitro 492/492, migrazione corretta anche sui casi limite, CSS senza una sola regola viva persa,
contratto `/api/v1/stats` e OpenAPI esatti, seed eseguibili, RBAC coerente su tutti e quattro i ruoli.

---

## Arbitro (priorità zero)

Precondizioni verificate prima del lancio: `ss -ltnp | grep :3000` vuoto, `scripts/e2e.sh status` = DONE del run precedente,
DB `airmanager` fresco (migrazioni fino a `20261101193941_remove_ppr_domain` applicate alle 20:56Z, 4 `User`, 0 `LoginAttempt`, 0 `Booking`).

```
$ export JOBS_SECRET=local-e2e-secret-0123456789abcdef CI=1 && scripts/e2e.sh start
STARTED (pid 203021) — log: /tmp/airmanager-e2e/last-run.log
...
$ scripts/e2e.sh status
state: DONE — E2E_EXIT=0
--- summary ---
  492 passed (16.4m)
Running 492 tests using 2 workers
```

- **492 passed, 0 failed, 0 flaky, 0 skipped**, `E2E_EXIT=0` (`grep -nE "flaky|skipped|retry #|✘"` sul log → solo la riga
  `Running 492 tests`). Delta dichiarato dal dev 543 → 492 **confermato**. I 3 test METAR non sono stati saltati
  (aviationweather.gov raggiungibile in questo run). Nessun flaky da diagnosticare.
- Copia del log: `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/arbiter-19-1.log`.
- Il server dell'arbitro si è fermato da solo a fine suite. Tutte le verifiche empiriche sono state fatte DOPO la sentinella.

## Gate (ripetuti dal reviewer, shell senza env)

```
$ env -u DATABASE_URL -u AUTH_SECRET npm run gates
PASS  lint (40s)
PASS  typecheck (4s)
PASS  test (16s) — Tests  1783 passed (1783)
PASS  build (54s)
```
Unit 1.923 → 1.783 confermato. Nessun file tracciato modificato dai gate (`git status --short | grep -v '^??'` → solo la
cancellazione di `.claude/skills/design-taste-frontend/SKILL.md`, già presente all'avvio della sessione, non mia).

---

## Finding

### F1 — MINOR — La guardia «SlideOver a tutto schermo» ri-ospitata sull'editor volo non apre più il picker dopo uno scroll reale del corpo, e il suo commento dice ancora il contrario

- **Dove**: `e2e/mobile-primitives.spec.ts:141-168` (commento `:144-153`, scroll condizionale `:155-161`, click `:169`).
- **Cosa**: sull'ospite vecchio (`ManualPprForm`, 12 campi) il trigger della data stava SOTTO lo scrollport a `scrollTop 0`
  (756.73 contro la fine del corpo a 743, misura scritta nel commento originale), quindi il test scorreva davvero `.so-body`
  e poi asseriva popover dentro il viewport e colpibile: è il percorso «hit-test dopo uno scroll REALE — la formulazione
  dell'AC-11 dell'epic» che il commento rivendica ancora alle `:151-153`. Sull'ospite nuovo l'unico `.date-input-btn` sta in
  cima al pannello: `overlap` è negativo, il ramo `if (overlap > 0)` non gira mai, il popover si apre con `scrollTop 0`.
  Il commento conserva anche una misura dell'ospite cancellato (`:150`, «measured: `scrollTop` 0 -> 314»).
  Viola AD-9 («le cifre di discriminanza scritte nei commenti vanno rimisurate sull'ospite nuovo e corrette, mai lasciate
  false») e l'invariante [d] (stesse asserzioni su un ospite con la stessa proprietà). Il record §G dichiara «proprietà
  dell'ospite asserite nel test stesso» ma questa non c'è, e non risulta che altri test coprano «popover aperto dentro uno
  `.so-body` già scorso» (`datetime-picker.spec.ts:75-84` dice esplicitamente che i form SlideOver brevi non ne hanno mai avuto bisogno).
- **Prova** (build di produzione dell'arbitro, `playwright-core` sul Chromium in cache, stesso percorso del test:
  `/it/dashboard` → `dispatch-flight-button`, 375×812, 600 ms dopo l'apertura):
  ```
  flight editor @375 {"bodyTop":83.77,"bodyBottom":743,"scrollH":1041,"clientH":659,
                      "trigTop":122.98,"trigBottom":166.98,"triggers":1}
  → overlap = 166.98 − 743 = −576 → nessuno scroll prima del click
  ```
  Il corpo scorre (1041 > 659: `anchored.scrollable` resta vero), ma il trigger è già visibile.
- **Fix suggerito**: rendere lo scroll incondizionato e ASSERITO, tenendo il trigger nello scrollport (scorrere sposta il
  campo solo verso l'alto): p.es. `body.scrollTop = Math.max(1, trigger.top − body.top − 8)` (≈ 31 px qui), poi
  `expect(await page.locator('.slideover.open .so-body').evaluate((el) => el.scrollTop)).toBeGreaterThan(0)` prima del
  `toPass` di raggiungibilità già presente; riscrivere il commento `:144-153` con le misure del nuovo ospite (via
  «scrollTop 0 -> 314» e «the 9th field of twelve»). Rilanciare lo spec ×5 (`--repeat-each=5 --retries=0`). In alternativa,
  se la sessione principale accetta la copertura ridotta, il commento va comunque riscritto per dire il vero.

### F2 — LOW — Fra 901 e 1200 px la riga KPI a 4 card lascia una card orfana su una seconda riga (Panoramica e Statistiche); il TD 19.1-d descrive solo il caso ≥ 1200

- **Dove**: `src/styles/airops.css:1495-1499` (`@media (max-width: 1200px){ .kpi-row{ grid-template-columns: repeat(3, 1fr) } }`),
  consumatori `src/app/[locale]/dashboard/page.tsx` (riga KPI) e `src/app/[locale]/dashboard/reports/page.tsx:136-147`.
- **Prova** (Panoramica admin, build di produzione):
  ```
  overview kpi grid @1100 {"cols":"262.656px 262.672px 262.656px","tops":[159,159,159,251]}
  overview kpi grid @1000 {"cols":"229.328px 229.328px 229.328px","tops":[159,159,159,251]}
  overview kpi grid @800  {"cols":"334px 334px","tops":[159,159,251,251]}
  ```
  Screenshot: `scratchpad/shots/rev-overview-it-1100.png` («Ricavi del mese» da sola sotto tre card). Prima della story
  erano 3+2. Stessa resa già oggi su Istruttori e Registro voli (4 KPI), e AD-6 vieta CSS nuovo: **nessun fix di codice
  in questa story**.
- **Fix suggerito**: estendere il testo del TD 19.1-d in `sprint-status.yaml` alla banda 901-1200 (3+1), così la story
  desktop dell'epic 18 la trova misurata.

### F3 — LOW — Story file: due righe contraddicono la ratifica B applicata

- **Dove**: `_bmad-output/implementation-artifacts/19-1-rimozione-dominio-ppr.md:29` («> **DECISIONE PO**: _(da registrare)_»,
  mentre `:17` dice ratificata B) e `:212` (AC 1, ultima frase: «Senza sessione (Q-19.1-a opzione **A**): `/it/ppr` → redirect
  a `/it/login?callbackUrl=%2Fit%2Fppr`»). L'implementazione segue correttamente B (sonda sotto: anonimo `/it/ppr` → 404) e
  il record §A lo spiega, ma l'AC di record resta scritto per l'opzione scartata.
- **Fix suggerito**: nel commit di chiusura, riga 29 → «RATIFICATA B (v. sopra)» e AC 1 riallineato a B («senza sessione:
  `/it/ppr` e `/en/ppr` → 404; `POST /api/v1/ppr-requests` → 401»).

### F4 — LOW (preesistente, da differire) — Il 404 è la pagina di default di Next, in inglese, anche su `/it/ppr`; le API rimosse rispondono HTML, non con l'envelope AD-8

- **Cosa**: la ratifica Q-19.1-a parla di «Pagina non trovata»; l'anonimo (e l'autenticato) su `/it/ppr` riceve status 404
  corretto ma la pagina di default di Next, in inglese e fuori dal design system. Le 9 route API rimosse rispondono 404
  `text/html`, non `{"error":{...}}`. **Non è causato dalla story**: l'app non ha `not-found.tsx` né un catch-all API, e
  qualunque path sconosciuto si comporta così (prova sotto). Nessuna azione richiesta per chiudere la 19.1.
- **Prova**:
  ```
  $ curl -s http://localhost:3000/it/ppr | grep -oE "<title>[^<]*</title>"
  <title>404: This page could not be found.</title>
  $ curl -s -o /dev/null -w "%{http_code} %{content_type}\n" -b jar-admin http://localhost:3000/api/v1/does-not-exist
  404 text/html; charset=utf-8
  ```
- **Suggerimento**: annotarlo come TD trasversale (pagina 404 localizzata AirOps + 404 JSON per `/api/v1/*`, utile alla
  futura app Flutter), candidato 19.12 o epic 18.

---

## Decisioni PO necessarie

Nessuna bloccante. F4 è una nota da girare al PO solo se vuole una pagina «Pagina non trovata» localizzata (preesistente).

---

## Verificato corretto (empirico)

1. **404 e RBAC per tutti i ruoli** (sonda `curl`, build di produzione, login reale via `/api/auth/callback/credentials`
   per admin/pilot/instructor/student): per OGNI ruolo `/it|en/dashboard/ppr`, `/it|en/dashboard/movements`, `/it|en/ppr`
   → **404**; `/ppr` → 307 su `/it/ppr`; `GET|POST /api/v1/ppr-requests`, `POST …/manual`, `GET …/pdf`,
   `POST …/x/approve`, `POST …/x/complete`, `GET|PUT /api/v1/settings/ppr-landing-fee`, `GET …/ppr-operating-instructions`
   → **404**. Anonimo: `/it/ppr` e `/en/ppr` → **404** (ratifica B), `/it|en/dashboard/{ppr,movements}` → 307 al login,
   `GET|POST /api/v1/ppr-requests` → **401** `UNAUTHENTICATED`. `/api/v1/stats`: admin 200, pilota/istruttore/allievo 403
   `finance.manage`. Output completo: `scratchpad/probe/out.txt`.
2. **Migrazione, prova indipendente su gemello** (`am_19_1_rev`, 47 migrazioni di baseline via psql, poi solo la nuova in
   transazione unica `-1`), con due casi limite in più rispetto al dev: un movimento di categoria NON PPR collegato a una
   richiesta (`pprRequestId` valorizzato) e uno storno cross-categoria (`reversalOfId` verso un movimento PPR):
   ```
   BEFORE cm|m_fee:-,m_fee_storno:m_fee,m_fuel1:-,m_fuel1_storno:m_fuel1,m_fuel_cross:m_ppr_manual2,m_fuel_linked:-,m_ppr_manual:-,m_ppr_manual2:-,m_top:-
          cat|Carburante,PPR,Ricariche   idem|booking-create,ppr-approve,ppr-cancel,ppr-complete,ppr-manual-create,ppr-reject
          set|membership.annualFeeCents,ppr.landingFeeCents,ppr.operatingInstructions.en,ppr.operatingInstructions.it
   DELETE 5 / DELETE 1 / DELETE 3 / DELETE 5 / ALTER TABLE / DROP INDEX / ALTER TABLE / DROP TABLE / DROP TABLE / DROP TYPE
   AFTER  cm|m_fuel1:-,m_fuel1_storno:m_fuel1,m_fuel_cross:-,m_top:-
          cat|Carburante,Ricariche   idem|booking-create   set|membership.annualFeeCents   users|2   tables|<null>|<null>|0
   ```
   Ordine dati→schema corretto (RESTRICT della categoria rispettato), storni PPR presi dal filtro di categoria, `SET NULL`
   sul cross-storno, movimenti/utenti non PPR intatti, idempotency e AppSetting ripuliti. Gemello eliminato.
   Sul DB `airmanager` dell'arbitro: `to_regclass` PprRequest/PprCounter NULL, `pg_type PprStatus` 0, colonna 0, indici e
   vincoli `%ppr%` 0, `AppSetting ppr.*` 0, nessuna categoria «PPR»; `npx prisma migrate diff --from-config-datasource
   --to-schema prisma/schema.prisma --script` → `-- This is an empty migration.`; `migrate status` → «Database schema is up to date!».
   `git diff --stat 72e7e1b..e5ce1b2 -- prisma/migrations` → solo la cartella nuova (21 righe).
3. **CSS chirurgico, diff semantico** (postcss, tupla contesto-@media + selettore → dichiarazioni, baseline vs HEAD):
   `removed (domain): 99`, `removed SUSPICIOUS: 0`, `changed decls: 0`, `added: 0`; graffe bilanciate in entrambe le
   versioni. Nessuna regola viva (Scadenze, «Le mie scadenze», `.bottom-sheet-*`, `.slideover-panel`, `.info-row*`,
   `.btn.big/.accent`, `.account-*`) ha perso un selettore o una dichiarazione. Nessuna classe CSS è diventata orfana per
   effetto della rimozione (scan parole `src/` baseline vs HEAD sulle 412 classi di `airops.css`). Le classi tolte non hanno
   consumer residui (`git grep` su `mobile-complete-step|mobile-row-model|mobile-row-transit|info-card|flow-bar-info` → 0).
4. **Residui**: i due grep di AC 15 sul commit `e5ce1b2` → A: 1 riga (l'eccezione ratificata `src/proxy.ts:13`), B: 0.
   Grep allargato (`visiting`, `honeypot`, `submitterIp`, `RateLimit`, `429`, `pprNumber`, `RATE_LIMITED`, `PPR_ALREADY`,
   `ETA_IN_PAST`, `TRANSIT`, `'doc'`) → solo falsi positivi legittimi (`aircraft.service.ts:37` «visiting/guest airframe»,
   `BOOKING_TRANSITION_INVALID`, ecc.). `Icon.doc` resta usata da `export-menu.tsx:51`. Nessun export TS diventato orfano
   (scan baseline vs HEAD: unico hit `generateMetadata` di `layout.tsx`, convenzione Next, falso positivo).
5. **OpenAPI servito** (`/api/v1/openapi.json`): 75 path, 86 schemi, grep A e B sul JSON → 0/0, tag senza `Ppr`, stati
   documentati `200,201,204,401,403,404,409,422,500` (niente 429); `Stats.kpis` = `revenueCents, flightMinutes, movements,
   fleetUtilization`, `Stats.series` = `months, revenueCents, flightMinutes`, `movementMix.key` enum `SCHOOL, TOURISM, AERIAL_WORK`.
6. **Contratto `/api/v1/stats` reale**: chiavi top-level `fleet, instructors, kpis, movementMix, series, topPilots`; kpis e
   series esatte come sopra; `period=year` → `movements 15`, somma del mix 15, `COUNT(*) Flight REGISTERED` dell'anno = 15.
7. **Cassa**: `/api/v1/cash-categories` → `isSystem` solo su «Ricariche» e «Compensi istruttori»; `/api/v1/transactions?book=CASH`
   → 50 righe, `reference` sempre `null` sulle righe `CASH` (forma del DTO invariata).
8. **UI** (playwright-core sul Chromium in cache — il Playwright MCP non è raggiungibile da questo subagent:
   «Chromium distribution 'chrome' is not found», fallback sanzionato da HANDOFF), build di produzione, DB post-arbitro:
   - Panoramica 1280 e 375: `.kpi-row` = `kpi-flights-today, kpi-fleet-available, kpi-bookings-pending, kpi-revenue`, 4 `.kpi-value`,
     0 nodi `[data-testid*="ppr"]`, sottotitolo «LIRC · 20 AOG»; EN «Flights today / Fleet available / Bookings pending /
     Revenue this month». Tab bar: `overview=Panoramica, schedule=Pianificazione, fleet=Aeromobili, pilots=Piloti, more=Altro`;
     sheet «Altro» = `instructors, scadenze, logbook, billing, reports, settings` (griglia 3×2, screenshot `rev-overview-it-375-more.png`);
     feed Avvisi senza voce PPR. Sidebar 1280: «Operazioni» = Panoramica, Pianificazione.
   - Statistiche 1280: KPI «Ricavi, Ore volate, Movimenti, Utilizzo flotta», 3 `.split`, SVG `[612.66, 287.34]`,
     card «Utilizzo flotta» figlia diretta di `.page`, larga 992 = larghezza utile; mix a 3 righe (screenshot `rev-reports-top.png`).
   - Impostazioni, card Club, IT/EN × 1280/375: griglia `468px 468px` con ICAO|Email, METAR|Quota (2×2 senza celle orfane),
     colonna unica a 375; `club.sub` e `smtp.sub` nuovi. Click su «Salva» → **esattamente 3 PUT** (`club`, `metar-station`,
     `membership-fee`), tutte 200, feedback «Impostazioni salvate.».
   - Overflow orizzontale **0** su Panoramica, Statistiche, Impostazioni a 320/375/390, IT ed EN. Console: **0 errori**
     (`console.error` + `pageerror`) su tutte le pagine visitate.
9. **Seed eseguibili su gemelli freschi**: `am_19_1_seed` → `prisma migrate deploy` + `prisma db seed` exit 0 +
   `npx tsx prisma/seed-demo.ts` exit 0 («24 flights registered», «6 bookings ready…»), categorie `Altro, Assicurazione,
   Carburante, Compensi istruttori, Manutenzione, Ricariche, Utenze`, `PprRequest` assente. `am_19_1_load` → base seed +
   `LOAD_SEED_TARGET_DB=am_19_1_load LOAD_SCALE=0.02 npx tsx prisma/seed-load.ts` exit 0 (Phase 1→9 rinumerate,
   581 `CashMovement` in 7 categorie, nessuna «PPR») — eseguito dal reviewer, il dev l'aveva dichiarato facoltativo. Gemelli eliminati.
10. **i18n**: 1.989 → 1.760 chiavi per file, parità it-only 0 / en-only 0; 229 chiavi tolte (`MovementsPage` 95,
    `PprQueuePage` 66, `PprPage` 45, `Emails` 7, `DashboardPage`/`ReportsPage`/`SettingsPage`/`shell` 4 ciascuno);
    3 copy cambiate (`overview.mobile.alerts.empty`, `club.sub`, `smtp.sub`), 0 chiavi aggiunte.
11. **e2e adattati**: gli spec misti conservano byte-identiche le asserzioni sulle superfici che restano (diff dei test AC 7 e
    AC 9 di `mobile-expiries-movements` baseline↔HEAD: tolte solo le righe movimenti/redirect); `playwright.config.ts`,
    `package.json`, `package-lock.json`, `.github`, `.env.example` invariati. Ri-ospitati: `datetime-picker` TD7-F1
    (precondizione «trigger a ~80 px dal fondo» asserita, click raw, flip/clamp misurato — trigger «Fine» a 296.8 px su
    1440×900 → viewport tagliato a ~377) e `mobile-a11y-sweep` (editor volo condiviso col Registro voli, grammatica distinta)
    sono equivalenti; l'unica perdita è F1.
12. **Docs/harness**: `CLAUDE.md:3` e route map, `README.md:3`, `load-testing.md`, `targets.json`/`targets-hot.json`
    (JSON validi, −6/−1), `scripts/e2e.sh:18`, `.design-sync` allineati.

Non applicabile: race/concorrenza — la story non introduce né modifica logica di overlap o idempotenza (toglie solo route e
le loro righe `IdempotencyRecord`, verificato al punto 2).

---

## Stato della macchina alla consegna

- **Server**: il mio `next start -p 3000` (launcher PID 227590, `next-server` PID 227607) è stato fermato per PID;
  `ss -ltnp | grep :3000` → vuoto. Nessun run e2e attivo (`scripts/e2e.sh status` → DONE, `E2E_EXIT=0`).
- **`.next`**: ricostruita da `npm run gates` del reviewer, sullo stesso codice di `e5ce1b2` (HEAD `3876e72`, solo docs in più).
- **DB `airmanager`**: **sporco** (post-arbitro + i miei login sui 4 ruoli e un «Salva» della card Club con i valori già a
  schermo, round-trip no-op). Va resettato prima del prossimo run che conta. Conteggi `LoginAttempt` ultimi 15 min al
  momento della sonda: admin 413, pilot 55 (TD-6: resettare prima di run mirati ripetuti).
- **Gemelli**: `am_19_1_rev`, `am_19_1_seed`, `am_19_1_load` creati ed eliminati; `pg_database` finale =
  `airmanager, airmanager_load, postgres, template0, template1`. `airmanager_load` mai toccato; nessun `docker compose down/up`.
- **Repo**: nessun file tracciato modificato dal reviewer. Script delle sonde e screenshot solo nello scratchpad
  (`/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/`: `probe/`, `ui.cjs`, `ui2.cjs`,
  `shots/`, `twin-fixtures.sql`, `orphans2.py`, `cssorph.py`, `arbiter-19-1.log`). Questo report non è committato.
