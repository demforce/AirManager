# HANDOFF — AirManager (aggiornato: Epic 3 DONE, pronti per Epic 4)

## Goal

Costruire AirManager, il gestionale per un'aviosuperficie (piloti, velivoli, voli, PPR, finanze, scuola volo, tariffe, prenotazioni, scadenze, RBAC, export Excel/PDF) con il metodo BMAD v6: PRD → architettura → epics → stories → dev → review. Fase corrente: Fase 2, sviluppo story-by-story degli epic.

## Ruoli modello (CAMBIATI il 2026-07-07)

**Nuovo assetto** (richiesto dall'utente, sostituisce il precedente Fable+subagent):

- **Sessione principale = Opus 4.8**: crea documenti/stories **e fa la code review direttamente in-session** (niente più subagent di review).
- **Dev = subagent Sonnet 5** (`model: "sonnet"`), via skill `bmad-dev-story` su un file story ricco di contesto.

Ciclo per story: la sessione Opus scrive/verifica lo story file → spawn subagent Sonnet che sviluppa e committa l'implementazione (1 commit) → Opus fa review adversarial in-session → Opus applica i fix (1 commit "apply review fixes") → aggiorna story file (Review Record), sprint-status, push. Aggiornato in `CLAUDE.md` e nelle WORKFLOW NOTES di `sprint-status.yaml`.

## Current Progress

- **Epic 1 (Fondazione)** e **Epic 2 (Anagrafiche) DONE** e merged in main (PR #2, PR #3).
- **Epic 3 (Finanze) DONE** — tutte 3.1–3.5 done. Branch di sessione corrente: **`claude/handoff-model-assignment-yyv1r1`** (parte da main dopo il merge di PR #3). Storici merged: `claude/airfield-management-system-rh1y4r` (epic 1-2), `claude/handoff-docs-6jz8ou` (epic 3.1-3.4, PR #3).
  - 3.1 accounts+top-ups (ledger `AccountMovement` append-only, saldo = SUM, twin `CashMovement` "Ricariche"); 3.2 estratto conto paginato role-aware; 3.3 rettifiche motivate + alert saldo negativo (email, post-commit balance); 3.4 cassa aviosuperficie (categorie CRUD `settings.manage`, movimenti manuali `finance.manage`, storno `reversalOfId`, categorie di sistema protette); **3.5 report finanziario per periodo** (nuovo: `GET /api/v1/cash-report?from&to`, aggregazione read-only sul ledger cassa, pagina `/dashboard/finance/report` con preset mese/trimestre/anno + intervallo libero, card riepilogo + tabella per categoria, `src/lib/period-presets.ts` Europe/Rome).
  - Ogni story: commit implementazione (Sonnet) + commit fix review (Opus). Review Record nel story file.
- **Gate correnti (dopo review 3.5, DB reset + MailPit up)**: lint verde (1 warning benigno noto su `data-table.tsx`), typecheck verde, **363/363 unit**, build verde, **71/71 e2e**.
- Tracking: `_bmad-output/implementation-artifacts/sprint-status.yaml` — epic-1/2/3 done. Prossimo: **Epic 4 Tariffe e pacchetti — story 4.1 aircraft-rates** (story file NON ancora creato).

## Review 3.5 — cosa ha trovato Opus in-session

- **F1 (fixed)**: bug timezone latente nella query raw di `getCashReport`. I bound `from`/`to` erano legati come `Date` JS (`timestamptz`) ma `effectiveDate` è `date` Postgres → il confronto promuove alla timezone di **sessione**. Sotto `Etc/UTC` (il container) è corretto, ma sotto sessione non-UTC (es. Europe/Rome) il bound inferiore scarta i movimenti datati esattamente su `from`. Nessun test lo prendeva (unit mockano `$queryRaw`; e2e gira su container UTC). Fix: bind come TEXT + cast `::date` in SQL → confronto `date >= date` TZ-indipendente, come fa già il filtro tipizzato Prisma di `listCashMovements`. Verificato empiricamente su UTC e Europe/Rome.
- Il resto (invariante AC2 by construction, raw SQL vs groupBy, RSC che bypassa lo schema per URL invertito = inerte) rivisto e accettato.

## What Worked

- Il nuovo ciclo Opus-review-in-session funziona bene: la review resta adversarial e trova bug veri (F1 3.5 sopra è un difetto reale che nessun gate del container avrebbe mai mostrato — verificato con `psql` sotto `SET TIME ZONE 'Europe/Rome'`). Vantaggio vs subagent: la sessione principale ha già tutto il contesto del codebase caricato.
- Subagent Sonnet dev: story file ricco (pattern esistenti, vincoli AD, review-lessons precedenti, gate espliciti, cosa NON duplicare) → implementazione pulita e completa in un colpo, tutti i gate verdi tranne i 5 e2e MailPit (ambientali). Riprendibile con SendMessage sullo stesso agentId.
- **Lezioni review diventate pattern** (citarle negli story file nuovi): guardie atomiche `updateMany`; `key={id}` sui form di edit; `setValueAs` ''→null; cap INT max + `.max(500)` stringhe libere; ownership check PRIMA della query; **date `@db.Date` in raw SQL: sempre bind TEXT + `::date`, mai `Date` JS (bug timezone)**; totali sempre SUM/groupBy, mai contatori (AD-3).

## What Didn't Work

- Rete: `mcp.context7.com` e siti doc bloccati (solo npm/PyPI/GitHub raw); Docker Hub bloccato → PostgreSQL 16 locale (`service postgresql start`); Mailpit compilato con `go install` → `/root/go/bin/mailpit`.
- **Background shell `&`/`nohup` viene ucciso** in questo harness (exit 144): per processi long-running (Mailpit) usare il parametro `run_in_background: true` del tool Bash, NON `&` nella shell.
- `prisma migrate dev`/`reset` rifiutano il sandbox non-interattivo: usare `migrate deploy` + `generate`; reset DB con `sudo -u postgres psql -c 'DROP DATABASE airmanager;' && createdb -O airmanager airmanager && migrate deploy && db seed`.
- **e2e flaky su DB sporco**: SEMPRE resettare il DB prima di giudicare un run completo. I 5 test MailPit falliscono con `ECONNREFUSED` se Mailpit non gira (avviarlo prima dei gate e2e).

## Key Decisions (oltre a PRD/spine/CLAUDE.md e story files)

- Un commit per story (dev) + un commit per i fix di review (Opus). Nessun riferimento AI/modello nei messaggi di commit.
- Report finanziario: aggregazione read-only sul ledger cassa (nessun nuovo modello); totali sempre SUM in Postgres (AD-3); centesimi interi firmati (AD-2); preset periodo SOLO UI, il service riceve `from`/`to` espliciti.
- Cassa vs conti: `finance.manage` per operazioni giornaliere (movimenti, top-up, report), `settings.manage` per config categorie. Categorie "di sistema" (es. "Ricariche") protette da rename/delete/movimento manuale.
- Ledger append-only ovunque (AD-3): correzioni via storno/rettifica, mai update/delete.

## Next Steps (in ordine)

1. **Story 4.1 aircraft-rates** (Epic 4 Tariffe e pacchetti): la sessione Opus crea `_bmad-output/implementation-artifacts/4-1-aircraft-rates.md` da `_bmad-output/planning-artifacts/epics.md`. Attenzione AD-2 (centesimi interi, `src/lib/money.ts`). Poi ciclo solito: sprint-status ready-for-dev → dev Sonnet → review Opus in-session → fix → done.
2. Stories 4.2–4.4 (tariffe istruttore, tipi pacchetto, vendita pacchetto) stesso ciclo; poi epic-4 done → Epic 5 (Voli e addebiti).
3. Pendenze non bloccanti: Context7 (utente deve sbloccare dominio), retrospettive epic opzionali, cleanup e2e su DB sporco / DB di test dedicato, F2 review 2.5 (storico rettifiche cappato a 50 senza load-more).

Ambiente da ripristinare a inizio sessione (container nuovo): `service postgresql start`; se manca ruolo/DB: `sudo -u postgres psql -c "CREATE ROLE airmanager LOGIN PASSWORD 'airmanager' CREATEDB;" && sudo -u postgres createdb -O airmanager airmanager`; `.env` da `.env.example` (AUTH_SECRET random via `openssl rand -base64 32`); `npm install`; `npx prisma migrate deploy && npx prisma db seed`; Mailpit: `go install github.com/axllent/mailpit@latest` poi avviarlo con **Bash `run_in_background: true`** (`/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025`). MAI `playwright install` (Chromium in `/opt/pw-browsers`). Git identity: `git config user.email noreply@anthropic.com && git config user.name Claude`.
