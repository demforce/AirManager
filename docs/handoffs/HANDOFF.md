# HANDOFF — AirManager (aggiornato: 2026-11-03 22:30 — **EPIC 19 CHIUSO**: 19.1-19.12b done; sessione FERMA a fine epic, come prevede `CLAUDE.md`; ~88 commit su `dev` NON pushati; PR #22 `dev` → `main` ancora APERTA)

Handoff precedenti: `docs/handoffs/HANDOFF-2026-11-03-2230.md` (ciclo 19.12a/19.12b di oggi) e `HANDOFF-2026-11-03-1252.md` (Epic 13-18, ciclo AOG, 19.1-19.11, ricette d'ambiente estese).

## Goal

- **Progetto**: AirManager, gestionale di aviosuperficie (v. `CLAUDE.md`).
- **Appena chiuso**: **Epic 19 — Semplificazione e regole operative**, change request del PO del 2026-11-01. Fonte: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md`, con ratifiche R-19-*, assunzioni A1-A20 e l'Addendum in coda. Ogni story ha in `_bmad-output/implementation-artifacts/19-*` lo story file, il Dev Agent Record, il Review Record e il report di review.
- **Prossima fase**: push e PR verso `main` (serve il mandato del PO), poi le story residue dell'Epic 16, poi Epic 17 ed Epic 18.

## Current Progress (fonte di verità: `_bmad-output/implementation-artifacts/sprint-status.yaml`)

- `epic-19: done`. La 19.12a e la 19.12b sono state chiuse in questa sessione:
  - **19.12a** (`abb0dd3` feat, `096da9b` fix, `6525be2` chiusura): glossario `docs/i18n/glossario-it.md`, test `src/i18n/messages.test.ts` (parità chiavi e argomenti col parser ICU 3.5.12, guardia `t.raw`, trappola dell'apostrofo), 30 chiavi portate al plurale ICU, 194 chiavi morte rimosse (1 629 → 1 430 per file). Arbitro finale 604/604.
  - **19.12b** (`66fd139` feat, `285590e` fix, `c298e41` chiusura): passata completa dei testi, guardia `BANNED` sulle varianti vietate, export a pattern unico, pagine 404/500 localizzate, riga di conferma fuori servizio ridisegnata (frase intera, decisione PO), 18.5 riperimetrata. Arbitro finale **605 + 1 flaky (ECONNRESET), exit 0**.
- **Conteggi**: e2e **606**, unit **2211**.
- **`epic-19-retrospective: optional`**: non è stata fatta.

## Key Decisions di oggi (il dettaglio è nei Review Record e nelle code dei file story)

- **19.12a F2 → PO**: frase intera «Mettere fuori servizio il velivolo? …» con la riga di conferma ridisegnata. Fatto nella 19.12b, mantenendo la guardia del doppio clic (MAJOR-2 / decisione PO 6).
- **19.12b, domande del dev → PO**:
  - sezione Piloti invariata («Piloti», «Aggiungi pilota»);
  - saluto «Ciao, {name}» per tutti i ruoli;
  - nel digest scadenze una chiave dedicata, «scadenza superata da N giorni», mentre l'avviso al titolare resta «è scaduta da»;
  - `Export.pdfTooLarge` «… o scarica l'Excel».
- **Decisioni tecniche della sessione principale**:
  - `PilotsPage.sub` conta persone, quindi dice «persone»/«sospese»;
  - U+00A0 in «{aog} fuori servizio» nelle chiavi `AircraftPage.sub` e `DashboardPage.fleetCard.summary`;
  - nella 19.12b, L3 (scroll del Registro voli a 641-1100 px) diventa **TD-19.12b-a dentro la 18.5**.

## What Worked

- Il ciclo per story di `CLAUDE.md` / dell'handoff precedente: reset DB dalla sessione principale → UN dev Opus → reset → review Opus, che lancia per primo l'arbitro → fix Opus con le decisioni già prese → arbitro finale → `docs(N)` di chiusura.
- Domande al PO **batchate** e lanciate mentre la review girava già, per non tenerla ferma; le decisioni vanno in coda al file della story PRIMA del fix.
- Note «trappole» del reviewer girate al fix con SendMessage: per esempio il `toHaveCount(0)` sul saluto, che con «Ciao» sarebbe diventato falso.
- Mutanti e discriminanze **su una copia isolata**: cp di `src` + `messages` + config, `node_modules` in symlink. Reviewer e fix l'hanno fatto senza incidenti; ora è una regola in `CLAUDE.md`.

## What Didn't Work / trappole

- **Interruzione dei subagent a metà dei mutanti** (14:25): lo stop di tutti i subagent ha lasciato un mutante («dell'{name}») in `it.json`. Un dev ripreso con SendMessage **non sa** di essere stato interrotto: va avvisato e deve verificare gli sha256.
- **Messaggi tardivi dei teammate**: arrivano anche ore dopo e ripetono report già gestiti. Prima di agire, confronta il timestamp con lo stato del repo.
- **DB `airmanager` sporco fra le serie**: la catena serializzata lascia settings permissivi (`maxAdvanceDays` 3650 → `api-v1` rosso). Dopo due suite intere sullo stesso DB il picker persone, che carica solo i primi 100 nomi, e la pagina 1 delle prenotazioni fanno fallire spec sani. Ogni arbitro va su DB fresco.
- **ECONNRESET** (TD-19.10-g): si è rivisto nell'arbitro finale su una POST di fixture, con un flaky verde al retry. La correzione candidata resta `next start --keepAliveTimeout 75000`.
- Restano valide le trappole dell'handoff precedente:
  - i subagent NON possono resettare il DB;
  - fascia 23:40-01:00 di Roma da evitare per gli arbitri;
  - `getMetar` senza timeout (TD-19.7b-e);
  - i reviewer possono morire per limite di sessione;
  - demo per il PO via `npm run seed:demo` + `npm run dev -- -H 0.0.0.0`, su `localhost` o `192.168.56.115`.
- Ricetta di reset: `docker compose exec -T postgres psql -U airmanager -d postgres -Atc 'DROP DATABASE airmanager WITH (FORCE)' && docker compose exec -T postgres createdb -U airmanager airmanager && set -a && . ./.env && set +a && npx prisma migrate deploy && npx prisma db seed`.

## Stato dell'ambiente lasciato

- La sessione Claude parallela dell'audit è **chiusa**. La sua cartella `_bmad-output/planning-artifacts/audit-2026-11-02/` è untracked e potrebbe servire come fonte per il backlog: chiedere al PO se tenerla o committarla.
- **DB gemelli rimasti**: `airmanager_audit`, `airmanager_load` (19.11), `airmanager_1912b` (dati demo), `airmanager_1912b_e2e`, `_e2e2`, `_e2e3`. Si cancellano solo con l'ok del PO.
- **File untracked/modificati non nostri**, da non committare: `.agents/`, `.claude/skills/*` (compresa la cancellazione di `.claude/skills/design-taste-frontend/SKILL.md`), `.claude/workflows/`, `.github/hooks/`, `.github/skills/`, `skills-lock.json`, `q.txt`.

## Next Steps (in ordine)

1. **Controlli di apertura**: `git log --oneline -5`, `git status`, `ps -o pid,lstart -C claude`, `ss -ltnp | grep :3000`, `scripts/e2e.sh status`. Chiedere al PO il mandato di sessione per il reset del DB e2e, perché il classifier lo richiede.
2. **Push di `dev` e PR verso `main`**: serve il mandato esplicito del PO in-turn, oppure `! git push` dall'utente. La PR #22 `dev` → `main` è già aperta e si aggiorna col push; chiedere al PO se tenerla o aprirne una nuova con il riassunto dell'Epic 19.
3. **Retrospettiva Epic 19** (opzionale, `bmad-retrospective`) e **smistamento dei TD** dell'epic. In particolare:
   - TD-19.7b-e METAR senza timeout (alta priorità);
   - TD-19.10-g ECONNRESET;
   - TD-19.10-f tre mini-modal non accessibili;
   - TD-19.11-a/b/c layout dell'estratto conto e focus;
   - TD-19.9-a tipi disattivati nel registro;
   - TD-19.10-a/b fascia oraria.

   Sono censiti nei Review Record dei file `19-*`.
4. **Epic 16 residuo**: 16.5, 16.6a, 16.6b, 16.7, **16.8 da riperimetrare** (cita il contaore eliminato dalla 19.2), 16.9. Le riperimetrazioni sono annotate riga per riga in `sprint-status.yaml`.
5. **Epic 17**, poi **Epic 18**. La 18.5 è già riperimetrata (sprint-status e `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md`); in più contiene TD-19.12b-a e la tab bar EN.

## Suggested skills

- `karpathy-guidelines`: in ogni prompt di dev, fix e review (regola di progetto).
- `bmad-dev-story` / agent `dev-story` con `model: opus` per ogni story con UI; agent `adversarial-reviewer` (Opus, consegna il report su disco).
- `bmad-create-story` per riperimetrare la 16.8 e per le story di Epic 16-18 ancora senza file.
- `bmad-retrospective` per la retrospettiva opzionale dell'Epic 19.
- `design-taste-frontend` + `ui-ux-pro-max` nei prompt delle story con UI.
- `commit-commands:commit-push-pr` o `gh` per push e PR, solo con il mandato del PO.
- `handoff` a fine epic.
