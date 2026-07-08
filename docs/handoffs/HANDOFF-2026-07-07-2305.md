# HANDOFF — AirManager (aggiornato: Epic 5 DONE, pronti per Epic 6)

## Goal

Costruire AirManager, il gestionale per un'aviosuperficie (piloti, velivoli, voli, PPR, finanze, scuola volo, tariffe, prenotazioni, scadenze, RBAC, export Excel/PDF) con il metodo BMAD v6: PRD → architettura → epics → stories → dev → review. Fase corrente: Fase 2, sviluppo story-by-story degli epic.

## Ruoli modello e regole di processo (config approvata dall'utente 2026-07-07, confermata su tutto l'epic 5)

- **Stories**: sessione principale **Fable 5 (effort extra-high)**.
- **Dev**: **UN SOLO subagent Sonnet 5 (extra-high)** per story, lanciato via Workflow tool con output strutturato (schema JSON) — NIENTE fan-out ultracode.
- **Review**: subagent **Opus 4.8 (extra-high)** adversarial — l'unico layer adversarial, mai abbassarlo; briefarlo con i "notesForReview" del dev e chiedere verifiche EMPIRICHE (riproduzioni DB-backed, race di concorrenza, assert email via Mailpit API). I fix li applica la sessione principale.
- **Regole utente**: ogni **epic ha la sua PR**; ogni **story ha i suoi commit** (story file → implementazione → review record/fix); a **epic finito**: `/handoff`, push, **STOP** — l'epic successivo parte in una NUOVA sessione.
- **Stories con UI**: il dev DEVE usare le skill `design-taste-frontend` E `ui-ux-pro-max` (`.claude/skills/ui-ux-pro-max`, DB: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`), stile minimalista editoriale esistente, verifica interattiva con Playwright MCP prima degli e2e.

## Current Progress

- **Epic 1, 2, 3, 4 DONE e MERGED** (PR #2, #3, #4, #5 tutte merged su main).
- **Epic 5 (Voli e addebiti automatici) DONE** — **PR #6** aperta (branch `claude/epic-5-voli-addebiti-69g70m`, base main; il titolo/body PR sono stati aggiornati a fine epic — la PR era stata auto-creata al primo push col titolo della prima commit).
  - **5.1 registrazione volo** (`Flight` con snapshot AD-4 completo; UN movimento `FLIGHT_CHARGE` negativo per volo via `AccountMovement.flightId`; contaore `+= minutes` in-tx sotto FOR UPDATE, mai SET; 10 codici 422 specifici — `ValidationError` ora accetta un code custom stabile; alert banda saldo (3.3) esteso agli addebiti volo via export degli helper; pagina `/dashboard/flights`) — review clean pass; D1 deferred (istruttore con Person archiviata ma profilo attivo accettato via API diretta).
  - **5.2 consumo pacchetti** (`PackageConsumption` per-volo AD-6, unique `(flightId, hourPackageId)`; allocazione FIFO `effectiveDate asc` DENTRO la tx DOPO il lock Account — punto di serializzazione PROVATO contro il sovra-consumo; pro-rata sull'eccedenza; istruttore mai coperto; residuo = `includedMinutes − SUM` via `computeRemainingMinutes({includedMinutes, consumedMinutes})`; movimento a 0 mai omesso, fix `-0` con `0 - x`) — review clean pass, ZERO findings.
  - **5.3 storno/correzione** (`FLIGHT_CHARGE_REVERSAL` +importo ORIGINALE collegato via `reversalOfId`; ripristino minuti pacchetto = filtro `flight.status != CANCELLED` sulle SUM, righe mai toccate; contaore giù con clamp a 0; `correctFlight` = storno + ri-registrazione in UNA tx via refactor `registerFlightCore`; lock deterministici `IN...ORDER BY id FOR UPDATE` Aircraft→Account, no deadlock provato su correzioni incrociate; `Flight.correctionOfId @unique` + `cancelledAt`/`cancelReason`) — review: M1 minor FIXATO (409 fuorviante quando una rettifica manuale 3.3 ha già occupato lo slot `reversalOfId`: ora messaggio dedicato + backstop status-agnostic), D1 refuso doc corretto.
  - **5.4 registro con filtri e permessi** (`listFlights` own-access: pilota = propri voli, istruttore = propri + voli dove insegna via scope `OR` FORZATO in AND coi filtri; staff = tutto con 6 filtri combinabili + paginazione; 403 su `personId` altrui PRIMA di ogni query; `actorEmail` condizionale su `people.read`; nav "Voli" per tutti i ruoli `['flights.manage','self.read']`; vista read-only "I miei voli") — review audit access-control: clean sul codice della story (14 attacchi empirici respinti); D1 deferred pre-esistente (cap 100 sui picker staff, `OPTIONS_PAGE_SIZE` in `flights/page.tsx`).
- **Gate di fine epic** (DB fresco + Mailpit): lint 0 errori (warning benigno noto `data-table.tsx`), typecheck pulito, **589/589 unit**, build verde (ATTENZIONE: `env -u NODE_ENV npx next build` — un NODE_ENV=development trapelato rompe il prerender e ha prodotto un falso allarme in una review), **e2e 96 test: 91 verdi in run parallelo, 5 fail della classe flaky documentata** (vedi sotto), ogni spec verde in isolamento su DB fresco, set di fail RUOTANTE tra i run.
- Tracking: `_bmad-output/implementation-artifacts/sprint-status.yaml` — epic-1..5 done. Story file con Review Record completi in `5-*.md`.

## What Worked

- Il ciclo consolidato story file prescrittivo (Fable) → 1 dev Sonnet xhigh → review Opus xhigh con brief mirato sui "notesForReview" del dev → fix in sessione. Su 4 story: 2 clean pass totali, 1 zero-findings, 1 minor; nessun must-fix su tutto l'epic.
- **Review Opus con verifica empirica**: race reali riprodotte su DB (doppio annullo, sovra-consumo, correzioni incrociate per deadlock), importo storno provato leggere lo snapshot (tariffa cambiata a posteriori), alert contati via Mailpit API. Chiedere esplicitamente le riproduzioni DB-backed nel prompt di review paga.
- Passare al reviewer i "notesForReview"/"deviations" del dev (output strutturato del Workflow) concentra l'attacco sui punti giusti.
- Il dev 5.4 ha trovato e fixato un bug a11y reale (label che wrappa la select → accessible name inquinato dalle option) durante la verifica Playwright MCP — la verifica interattiva pre-e2e continua a ripagare.
- Mailpit installato via `go install github.com/axllent/mailpit@latest` (il classifier di permessi prima l'ha negato, poi accettato motivando che è la dipendenza dev dichiarata in `docker-compose.yml`; binari GitHub releases NON scaricabili: rete scoped al solo repo).

## What Didn't Work

- **e2e suite completa sotto carico parallelo: classe flaky NOTA e ora CARATTERIZZATA** — 2 cause radice individuate:
  1. **Race form-refresh** (flights.spec, package-consumption.spec, flight-reversal.spec): dopo una registrazione riuscita il refresh della lista/pagina resetta la select del velivolo mentre il test sta già compilando il volo successivo → il form submitta col velivolo seed senza tariffa → alert `NO_AIRCRAFT_RATE`, `flight-result-panel` mai apparso. Impatto solo test (un umano non ricompila in 50ms). Fix futuro: test più difensivi (attendere il refresh) o form che preserva lo stato.
  2. **Cap 100 dei picker** (5.4 D1): su DB sporco il dropdown persona/velivolo tronca e il test non trova l'entità appena creata (flights.spec:210 provato dal reviewer).
  Procedura valida: giudicare SOLO su DB fresco + re-run in isolamento; il set di fail ruota tra i run, ogni spec passa da sola. Follow-up consigliato: DB di test dedicato per worker.
- Il reviewer 5.3 ha fallito `next build` per NODE_ENV trapelato dal proprio `source .env` — falso allarme già visto in 5.2: SEMPRE `env -u NODE_ENV npx next build`.
- Un agent (review 5.3) ha lasciato il repo in **detached HEAD**: il commit di fix della sessione è finito fuori branch (risolto con `git checkout <branch> && git merge --ff-only <sha>`). Verificare `git status` prima di committare dopo un subagent.
- La PR del branch viene AUTO-CREATA al primo push col titolo della prima commit — a fine epic va aggiornata (title/body), non ricreata (422 "already exists").

## Key Decisions (oltre a PRD/spine/CLAUDE.md e story files)

- **`FLIGHT_CHARGE` = UN movimento negativo per volo**; scomposizione (minuti, tariffe, importi, minuti da pacchetto) = snapshot su `Flight` + righe `PackageConsumption`; il totale NON è mai una colonna.
- **422 con codice specifico** per gli stati invalidi della registrazione volo (AC epica; diverge consapevolmente dal 409 di `sellPackage` per persona archiviata — documentato nel service): `ValidationError(message, details?, code?)`.
- **Contaore**: avanza/indietreggia SOLO via transazione volo (`+=`/clamp-0) o `adjustHourMeter`; i due si serializzano sullo stesso lock FOR UPDATE. `hourMeterStart/End` sul volo sono osservazioni.
- **Idoneità pacchetto**: persona + tipo-include-velivolo + `expiresAt >= flightDate` (giorno di scadenza valido, confronto vs data VOLO) + `effectiveDate <= flightDate`; FIFO su `effectiveDate asc, createdAt asc, id asc`; il lock Account è il serializzatore del consumo.
- **Ripristino storno = filtro stato, mai scritture sui consumi**: `flight: { status: { not: 'CANCELLED' } }` in OGNI groupBy di consumo.
- **Storno**: `effectiveDate` = oggi (non retrodatato); importo = originale negato (mai ricalcolo); annullare è sempre lecito (anche entità archiviate), correggere ri-valida tutto sui dati nuovi; slot `reversalOfId` già preso da rettifica manuale → 409 con messaggio dedicato (il volo resta non annullabile via API: i conti sono già stati sistemati a mano).
- **Registro**: own-scope `OR [{personId}, {instructorProfile: {personId}}]` forzato in AND; `self.read` senza personId → pagina vuota (non 403); filtro `personId` altrui → 403; annullati visibili al titolare.
- Deferred da riprendere prima o poi: D1 5.1 (istruttore archiviato via API), D1 5.4 (cap 100 picker → typeahead), stabilizzazione e2e (DB per worker, race form-refresh), CashRegister ha lo stesso bug a11y label-wrap (flagged, non fixato — fuori scope 5.4), più i deferred storici di epic 3/4 (M1/M2/F2 di 4.3, D1/D2/D3 di 4.4).

## Next Steps (in ordine)

1. **NUOVA SESSIONE per Epic 6 (Scadenze e alert)** — regola utente: questa sessione si ferma qui. Story 6.1 (tipi di scadenza standard e personalizzati): Fable crea `6-1-expiry-types.md` da epics.md. Nota dominio: seed con tipi standard (visita medica classe 1/2/LAPL, licenza, rating SEP, inglese ICAO) ciascuno con ambito; tipi in uso non eliminabili (solo disattivabili — pattern `CashCategory`/`PackageType`). 6.3 introdurrà `SentAlert` (unique scadenza+soglia, AD-9) e il job `POST /api/v1/jobs/expiry-alerts` con bearer `JOBS_SECRET`.
2. Ciclo per story: story file (Fable xhigh) → dev (1 Sonnet 5 xhigh via Workflow, skill UI obbligatorie se c'è UI) → review (Opus 4.8 xhigh adversarial con brief sui notesForReview e richiesta di verifiche empiriche) → fix in sessione → done. Un commit per passo.
3. PR: quando PR #6 (Epic 5) viene merge-ata, Epic 6 = nuova PR su main (o stacked su #6 se non ancora merged). Ricordare: la PR si auto-crea al primo push → aggiornarla a fine epic.
4. Pendenze non bloccanti: deferred sopra; retrospettive epic opzionali; Context7 (dominio ancora bloccato).

Ambiente da ripristinare a inizio sessione (container nuovo): `service postgresql start`; se manca ruolo/DB: `sudo -u postgres psql -c "CREATE ROLE airmanager LOGIN PASSWORD 'airmanager' CREATEDB;" && sudo -u postgres createdb -O airmanager airmanager`; `.env` da `.env.example` (AUTH_SECRET random); `npm install`; `npx prisma migrate deploy && npx prisma db seed` (16 migrazioni); Mailpit: `go install github.com/axllent/mailpit@latest` (motivare: dipendenza dichiarata in docker-compose.yml; GitHub releases bloccato) poi `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025` con Bash **`run_in_background: true`**. Build SEMPRE `env -u NODE_ENV npx next build`. Reset DB: `sudo -u postgres psql -c 'DROP DATABASE airmanager WITH (FORCE);'` + createdb + deploy + seed. MAI `playwright install`. Git identity: `git config user.email noreply@anthropic.com && git config user.name Claude`.
