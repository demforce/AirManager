# HANDOFF — AirManager (aggiornato: 2026-11-25 — 16.9 done, prossima 16.10)

Handoff precedenti: `docs/handoffs/HANDOFF-2026-11-03-2300.md` (chiusura Epic 19, push e PR #22), `HANDOFF-2026-11-03-2230.md`, `HANDOFF-2026-11-03-1252.md`.

## Goal

- **Mandato del PO (2026-11-03 22:35)**: «usando bmad chiudiamo tutte le epic incomplete» → Epic **16 → 17 → 18 di fila** in questa sessione. A ogni fine epic: handoff committato, **push di `dev`** e aggiornamento della **PR #22** (il merge resta al PO), poi si prosegue (la regola «fermarsi a fine epic» di `CLAUDE.md` è sospesa solo per questo mandato). **Reset del DB e2e autorizzato** per tutta la sessione. Story scritte dalla sessione principale (Opus 5.5).
- **Fonte di verità**: `_bmad-output/implementation-artifacts/sprint-status.yaml`.

## Current Progress

- **16.9 done** (`d45d308`): prefill dei form, calendario Scadenze e avvisi a Roma; etichette di Contabilità/Statistiche su Roma; Capodanno provato con browser in UTC. Gate verdi, **2282 unit** e **621 passed + 1 flaky, 0 failed, exit 0**.

- **16.8 done** (`2266077`): conteggio in anteprima e in transazione, email acquisita in Mailpit, prenotazioni approvate visibili per i velivoli archiviati su desktop e mobile. Gate verdi, **2278 unit**, **621 browser distinti** (567 nel progetto principale, 54 nella catena seriale; due DB di prova). Fix di selettore nella fixture cassa `b29ab38` per eseguire la catena anche senza la reclassifica della fixture mobile.

- **16.7 done**: fix review F1 in `ff43e17` (disconnessione al recheck se la persona non coincide), correzioni del record F2/F3 nella story. Gate verdi, **2272 unit** e **618/618 e2e**, exit 0, su dati sintetici. Nessun push di questa ripresa, merge o deploy.

- **Tutte le story degli Epic 16-18 sono pronte e ratificate**:
  - Epic 16: 16.5-16.9 riallineate su HEAD (sezione **§R** in testa a ogni file, PREVALE sul resto) + ratifiche **§R-PO**; 16.8 riperimetrata (via contaore e tariffe già chiuse dalla 19.3).
  - Epic 17: file 17.2-17.8 creati il 2026-11-03 (ricognizione su `e951960`) + **§PO** (21 raccomandazioni accettate in un giro).
  - Epic 18: file 18.1-18.7 creati il 2026-11-04 (su `1f6ab3e`) + **§PO** (24 raccomandazioni); **split a/b dentro il file** per 18.2, 18.3, 18.5, 18.7.
  - Epic 15 corretto a `done` (era rimasto `in-progress`).
- **16.5 done** (`caeb973` feat, `be11075` record, `2d012ab` decisioni PO sulla review, `c635b34` fix, `f23ca47` Fix Record): compenso istruttore congelato sul volo, ex istruttori visibili e pagabili, pagamenti concorrenti bloccati sotto lock. Arbitro finale 607 + 3 flaky = **610**, exit 0. **Conteggi**: e2e **610**, unit **2242**.
- **16.6a done** (`a6be2da`, `76c7eba`, `d543c1a`, `dea21d5`, `7a9ec4e`, `c5c1efa`, `dcad37e`, `c47ec70`): data valuta futura rifiutata (422 `EFFECTIVE_DATE_IN_FUTURE`), errori dei pannelli leggibili (`.fld-error`, ≥ 4,5:1), «Cassa per categoria» e «Ricavi maturati» ovunque, **keep-alive 75 s del server e2e** (TD-19.10-g chiuso: 0 ECONNRESET da allora). Durante la chiusura trovato e corretto un bug di prodotto della 16.5 (`6c19915`: remount della console Istruttori che chiudeva il pannello «Paga»). Arbitro finale **615/615**, exit 0. **Conteggi**: e2e **615**, unit **2252**.
- **16.6b done** (`6e76e20`, `91a70b0`, `c453b22`, `25ef34d`, `470d4ca`): chiave di idempotenza stabile nel pannello quota; catene di rettifica classificate dal **libro della radice** (`reversalRootBook`, enum DEPOSIT/REVENUE/TRANSFER) — la correzione di un giroconto resta giroconto (decisione PO). Arbitro finale 614 + 2 flaky = **616**, exit 0. **Conteggi**: e2e **616**, unit **2261**. Nuova story **16.10** (doppi addebiti dopo un guasto di rete nei 7 form con `Idempotency-Key`) in coda all'Epic 16, file da creare dopo la 16.9.
- **Prossima**: 16.10 → fine Epic 16 (handoff, push, PR #22) → Epic 17 nell'ordine dei file (17.2 → 17.3 → 17.4 → 17.5 → 17.6 → 17.7 → 17.8, dipendenze nello Status di ogni file) → Epic 18.

## Key Decisions di oggi

- Le ratifiche al PO si fanno **in linguaggio semplice** (cosa vede a schermo prima/dopo): una domanda scritta dal punto di vista del codice è stata respinta come «ai slop» (memoria `feedback-plain-ratification-questions`). Le scelte tecniche o vincolate da un precedente le decide la sessione principale e le riporta.
- 16.5, review: il PO ha **ribaltato** «pagamenti concorrenti: basta dichiararlo» in «bloccare» dopo che la sessione principale ha corretto la propria descrizione («nessun soldo va perso» era impreciso: la cassa pagava due volte).

## What Worked

- Ricognizioni in sola lettura **in parallelo** (un subagent per story, report ≤ 200-250 righe) → la sessione principale scrive §R/§PO nel file story. Le domande al PO raccolte in un solo giro per epic.
- Ciclo per story: reset DB → UN dev (Opus per UI) → reset → review Opus (arbitro per primo) → decisioni PO → fix → reset → **arbitro finale della sessione principale** (`CI=1 scripts/e2e.sh start` con `JOBS_SECRET` esportato, poll in background fino a `E2E_EXIT=`) → `docs(N)` con Review Record + sprint-status + questo file.

## What Didn't Work / trappole

- **Mai mandare un SendMessage a un subagent mentre gira un arbitro**: il messaggio lo risveglia e lui può lanciare `npm run gates`, che ricostruisce `.next` sotto il server dell'arbitro (successo nella 16.6a: arbitro scartato). Se serve, scrivere esplicitamente «niente build/gate/e2e».
- **Salvare subito il log di ogni arbitro** (`cp /tmp/airmanager-e2e/last-run.log` nello scratchpad): ogni `scripts/e2e.sh start` successivo (anche di un subagent) ruota `last-run.log` in `.prev` e due run bastano a perderlo.
- **Login-timeout** (`toHaveURL(/dashboard$/)` scaduto a 5 s dopo il submit del login) resta l'unica classe di flaky ricorrente dopo il keep-alive: 2 nell'arbitro della 16.6b. Candidato TD se cresce.
- Un flaky su un test della story precedente non si archivia come «classe nota» senza leggerne il messaggio: nella 16.6a era un bug di prodotto della 16.5.

- **Fascia 23:40-01:00 di Roma**: il reviewer ha programmato l'arbitro alle 01:06; la macchina poi è rimasta ferma fino alle 09:39 e il reviewer non si è risvegliato da solo → riprenderlo con SendMessage quando il run è finito.
- **Disco di sistema al 99%** (2026-11-03 23:55): liberati 3,8 GB cancellando `.next/dev` (cache di `next dev`, non in uso). Controllare `df -h /` prima delle build.
- Il **Workflow tool** va usato solo con opt-in esplicito dell'utente: lanciato per errore per le ricognizioni dell'Epic 17, fermato e sostituito da Agent normali.
- Un run `--no-deps` di uno spec della **catena serializzata** lascia AppSettings globali sporchi (`maxAdvanceDays: 3650` → 17 fallimenti `BOOKING_OUTSIDE_WINDOW` nella suite del dev 16.5). Arbitri sempre su DB fresco.
- Un dev che avvia `next start` su :3000 può non riuscire a fermarlo (classifier): la sessione principale chiede al PO e lo ferma prima dell'arbitro.
- **ECONNRESET** (TD-19.10-g): CHIUSO con `7a9ec4e` (`--keepAliveTimeout 75000` nel `webServer.command`; la ricetta di `CLAUDE.md` per il server riusato porta lo stesso flag).
- `scripts/e2e.sh status` mostra l'ULTIMO run: dopo i run di mutanti dei subagent può dire `E2E_EXIT=1` per costruzione.
- Restano valide le trappole degli handoff precedenti (subagent senza reset DB, `getMetar` senza timeout TD-19.7b-e, ricetta di reset sotto).
- Ricetta di reset: `docker compose exec -T postgres psql -U airmanager -d postgres -Atc 'DROP DATABASE airmanager WITH (FORCE)' && docker compose exec -T postgres createdb -U airmanager airmanager && set -a && . ./.env && set +a && npx prisma migrate deploy && npx prisma db seed` (controllare prima `ss -ltnp | grep :3000`).

## Stato dell'ambiente lasciato

- **DB**: `airmanager` (e2e, post-arbitro) e **`airmanager_load`** (DB di carico rigenerato il 2026-11-03 con `seed:load`, migrazione della 16.5 applicata) — gemello per le misure dell'Epic 17, **da cancellare a fine Epic 17**.
- Porte 3000/3100 libere. Nessun subagent attivo.
- File untracked/modificati non nostri, da non committare: `.agents/`, `.claude/skills/*` (compresa la cancellazione di `.claude/skills/design-taste-frontend/SKILL.md`), `.claude/workflows/`, `.github/hooks/`, `.github/skills/`, `skills-lock.json`, `q.txt`, `_bmad-output/planning-artifacts/audit-2026-11-02/`.
- `dev` è avanti rispetto a origin dei commit di questo ciclo: push a fine Epic 16 (mandato PO).

## Next Steps

1. 16.10 (story file da creare con `bmad-create-story`) con lo stesso ciclo (reset → dev → reset → review → decisioni PO → fix → reset → arbitro della sessione principale → `docs(N)`).
3. Fine Epic 16: `/handoff`, push di `dev`, aggiornare titolo/descrizione della PR #22.
4. Epic 17, poi Epic 18 (ordine e dipendenze nello Status di ogni file story).

## Suggested skills

`karpathy-guidelines` in ogni prompt; agent `dev-story` con `model: opus` per le story con UI (+ `design-taste-frontend`, `ui-ux-pro-max`), `sonnet` per il backend puro (17.5); `adversarial-reviewer`; `handoff` a fine epic.
