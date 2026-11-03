# HANDOFF — AirManager (aggiornato: 2026-11-03 12:52 — **SESSIONE FERMATA DAL PO DOPO LA 19.11**: Epic 19 a metà, 19.1-19.11 DONE, prossime **19.12a** e **19.12b**; 77+ commit su `dev` NON pushati; PR #22 `dev` → `main` ancora APERTA)

Handoff precedente (storia di Epic 13-18, ciclo AOG, ricette ambiente estese): `docs/handoffs/HANDOFF-2026-11-03-1252.md`.

## Goal

- **Progetto**: AirManager, gestionale di aviosuperficie (v. `CLAUDE.md`).
- **Fase corrente**: **Epic 19 — Semplificazione e regole operative**, nato dalla change request del PO del 2026-11-01 (15 richieste). Fonte vincolante: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-01.md` (ratifiche R-19-a..p, assunzioni A1-A20, **Addendum in fondo** con tutte le ratifiche emerse dai file story). PRD (change record in coda a `prd.md`), `epics.md` (FR + Epic 19) e `ARCHITECTURE-SPINE.md` (AD-3 eccezione FLIGHT_CHARGE, AD-4 tariffe allievo/pilota) sono già aggiornati.
- **Dopo l'Epic 19**: riprendere le story dell'Epic 16 riperimetrate (16.5, 16.6a, 16.6b, 16.7, 16.8, 16.9), poi Epic 17, poi Epic 18. Le riperimetrazioni sono annotate riga per riga in `_bmad-output/implementation-artifacts/sprint-status.yaml`.

## Current Progress (fonte di verità: `sprint-status.yaml`)

| Story | Stato | Arbitro finale e2e (DB fresco, `CI=1`) |
|---|---|---|
| 16.3 (chiusa all'inizio di questa sessione) | done | 542 + 1 flaky |
| 19.1 via dominio PPR / voli in transito | done | 492/492 |
| 19.2 via codice fiscale, campi velivolo, contaore, note volo | done | 488 + 1 flaky |
| 19.3 tariffe allievo/pilota, editor velivolo a Salva unico | done | 504/504 |
| 19.4 editor pilota/istruttore a Salva unico | done | 525/525 |
| 19.5 tipi Turismo/Scuola, dropdown uniformi, Toggle solista | done | 534/534 |
| 19.6 volo senza addebito, cancellazione definitiva, modifica in place | done | 543/543 |
| 19.7a scadenze: licenza, mediche, quota MEMBERSHIP, currency | done | 548 + 1 flaky |
| 19.7b registro Scadenze unificato | done | 555/555 |
| 19.8 Impostazioni a Salva unico | done | 567/567 |
| 19.9 avviso con deroga admin — voli | done | 579 + 1 flaky |
| 19.10 avviso con deroga admin — prenotazioni | done | 597 + 1 flaky |
| 19.11 estratto conto a periodo con saldo progressivo | done | 604/604 (arbitro del reviewer) |
| **19.12a** glossario, parità it/en, plurali ICU, chiavi morte | **ready-for-dev** | — |
| **19.12b** passata dei testi in contesto (+ pagine 404, «Compenso istruttore») | **ready-for-dev** (dopo 19.12a) | — |

Ogni story ha story file + Dev Agent Record + Review Record + report di review committati in `_bmad-output/implementation-artifacts/19-*`. La suite e2e conta **604** test all'ultimo arbitro.

## Key Decisions (oltre a quelle nella CR e nell'Addendum)

- **Ribaltamenti del PO in corso d'opera** (registrati nei file story e nell'Addendum): righe «Mancante» del registro Scadenze **eliminate ovunque** (Q-19.7-b/c ribaltate in review 19.7b; i check bloccanti di voli/prenotazioni restano); currency = **X voli negli ultimi Y giorni** configurabili (non «N giorni dall'ultimo volo»); tariffe obbligatorie anche per il volo senza addebito (Q-19.6-a = B); sulle prenotazioni currency e quota valutate a OGGI (Q-19.10-a = B); in modifica volo il saldo si ricontrolla sempre (Q-19.9-b); niente prezzi sulle card (Q-19.3-a); allievo esclusivo con pilota E istruttore (Q-19.3-c).
- **Decisioni tecniche della sessione principale** su finding di review (motivate nei Review Record): saldo deciso sotto lock `Account` (19.9 F2), Q4 della 16.6b anticipata nella 19.6 (rettifica su `FLIGHT_CHARGE` → 422), il solista non conta per l'istruttore né ne richiede i documenti (19.7a F2, 19.9), approvazioni senza seconda connessione dentro la transazione (19.10 F2).
- **19.12b, decisioni PO del 2026-11-03**: menu «**Velivoli**» ed «**Estratto conto**» (contro la raccomandazione); currency «Valida/In scadenza/Scaduta»; «Amministratore»; pagine 404 localizzate minimali; «Compenso istruttore». In coda al file 19.12b c'è un'aggiunta (review 19.11 F6) sull'etichetta «Saldo iniziale al {from}».

## What Worked

- **Ciclo per story**: story file (writer Opus in sola lettura, anche 2-3 in parallelo) → UN dev subagent Opus (`dev-story`, `model: opus` esplicito) → reset DB dalla sessione principale → review `adversarial-reviewer` Opus che lancia per prima l'arbitro full-suite → fix-subagent Opus coi finding e le decisioni già prese → arbitro finale della sessione principale → `docs(N)` di chiusura con sprint-status + HANDOFF. Dev e reviewer serializzati (usano :3000 e il DB).
- **Domande al PO batchate** con AskUserQuestion appena i writer le sollevano; le decisioni tecniche le prende la sessione principale e le scrive nel prompt del fix.
- **Commit sempre con pathspec** (ora regola in `CLAUDE.md`).
- **Arbitro via `scripts/e2e.sh start` + attesa in background** con un loop `until grep E2E_EXIT…` (una sola notifica).

## What Didn't Work / trappole

- **I subagent NON possono resettare il DB** (il classifier lo nega): la sessione principale resetta prima di OGNI dispatch di dev/review/fix, e dopo i reviewer (che lasciano il DB sporco). Ricetta: `docker compose exec -T postgres psql -U airmanager -d postgres -Atc 'DROP DATABASE airmanager WITH (FORCE)' && docker compose exec -T postgres createdb -U airmanager airmanager && set -a && . ./.env && set +a && npx prisma migrate deploy && npx prisma db seed`. MAI `docker compose down -v`.
- **Fascia oraria**: alcuni e2e pre-esistenti falliscono fra le **23:40 e le 01:00 di Roma** (TD-19.10-a/b): non lanciare arbitri lì.
- **ECONNRESET** su richieste API negli e2e: classe infrastrutturale ricorrente (arbitri 19.9 e 19.10) → TD-19.10-g, correzione candidata `next start --keepAliveTimeout 75000`.
- **`getMetar` senza timeout** (TD-19.7b-e, alta priorità): una stazione inesistente blocca la Panoramica ~16 s; i test che salvano un ICAO usano solo stazioni note.
- I reviewer `adversarial-reviewer` a volte muoiono per limite di sessione: il loro arbitro (staccato con `setsid`) sopravvive; si riprendono con SendMessage.
- **Seconda sessione Claude parallela** dal 2026-11-02 17:20 (audit con DB `airmanager_audit` e cartella untracked `_bmad-output/planning-artifacts/audit-2026-11-02/`): il PO ha deciso che proseguisse questa e che l'altra non buildasse né usasse :3000. Nella nuova sessione verificare con `ps -o pid,lstart -C claude` se è ancora viva; non toccare quel DB né quella cartella (l'audit può essere una fonte per il backlog: chiedere al PO).
- **Demo per il PO**: il dev server su 0.0.0.0:3000 non era raggiungibile dall'host per firewalld (`sudo firewall-cmd --add-port=3000/tcp` lato utente). Per mostrargli l'app: DB demo (`npm run seed:demo` dopo `db seed`, ora di nuovo verde) e `npm run dev -- -H 0.0.0.0`, credenziali `admin@airmanager.local` + `SEED_ADMIN_PASSWORD` del `.env`; usare `localhost` o `192.168.56.115`, mai `127.0.0.1`.

## Next Steps (in ordine)

1. **Controlli di apertura**: `git log --oneline -5` (HEAD atteso: il commit di questo handoff), `git status`, `ps -o pid,lstart -C claude` (sessione audit ancora viva?), `ss -ltnp | grep :3000`, `scripts/e2e.sh status`. Chiedere al PO il **mandato di sessione per il reset del DB e2e** (il classifier lo richiede).
2. **19.12a** (`_bmad-output/implementation-artifacts/19-12a-glossario-parita-plurali.md`, 13 AC): reset DB → dev Opus → reset → review Opus → fix → arbitro → chiusura. Il lockfile si tocca SOLO con `npx -y npm@10` (parser ICU come devDependency alla versione già nel lockfile).
3. **19.12b** (`_bmad-output/implementation-artifacts/19-12b-passata-testi.md`, 25 AC): stesso ciclo. Trappole nel §5 del file (17 spec cercano l'email d'invito per `'invitato'`, regex di `aog-overview-count.spec.ts`, `list.actions.dismiss` usato come «Annulla», `Export.button` a doppio uso, apostrofo prima di graffa in ICU).
4. **Fine Epic 19** (regola di CLAUDE.md): retrospettiva opzionale; debiti tecnici da smistare (in particolare TD-19.7b-e METAR, TD-19.10-g ECONNRESET, TD-19.10-f tre mini-modal non accessibili, TD-19.11-a/b/c layout estratto conto 641-1150 px e focus, TD-19.9-a metà tipi disattivati nel registro); `/handoff`; **push di `dev`** (oggi ~80 commit locali non pushati: serve il mandato esplicito del PO, o `! git push` dell'utente); aggiornare la PR #22 o aprire la PR `dev` → `main` come deciderà il PO; poi fermarsi.
5. Dopo: 16.5, 16.6a, 16.6b, 16.7, 16.8 (**da riperimetrare**: cita il contaore eliminato), 16.9 → Epic 17 → Epic 18 (la **18.5** va riperimetrata: il lessico passa alla 19.12b).

## Suggested skills

- `karpathy-guidelines` — in ogni prompt di dev, fix e review (regola di progetto).
- `bmad-dev-story` / agent `dev-story` (con `model: opus` per ogni story con UI) e agent `adversarial-reviewer` (Opus, consegna su disco).
- `bmad-create-story` se serve riscrivere o riperimetrare una story (16.8, 18.5).
- `design-taste-frontend` + `ui-ux-pro-max` nei prompt delle story con UI (la 19.12b tocca pagine d'errore e copy).
- `bmad-retrospective` a fine Epic 19 (opzionale), poi `handoff`.
