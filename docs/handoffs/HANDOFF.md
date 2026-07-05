# HANDOFF — AirManager (aggiornato: Epic 2 DONE, pronti per Epic 3)

## Goal

Costruire AirManager, il gestionale per un'aviosuperficie (piloti, velivoli, voli, PPR, finanze, scuola volo, tariffe, prenotazioni, scadenze, RBAC, export Excel/PDF) con il metodo BMAD v6: PRD → architettura → epics → stories → dev → review. Ruoli modello fissati dall'utente: **Fable (sessione principale) crea documenti/stories e orchestra; dev = subagent Sonnet (`model: "sonnet"`); review = subagent Opus (`model: "opus"`)**. Fase corrente: Fase 2, sviluppo story-by-story degli epic.

## Current Progress

- **Epic 1 (Fondazione e accesso) DONE** e merged in main (PR #2). Dettagli nei singoli story file.
- **Epic 2 (Anagrafiche) DONE** sul branch **`claude/handoff-docs-6jz8ou`** (branch di sessione corrente; il vecchio `claude/airfield-management-system-rh1y4r` è merged e chiuso — CLAUDE.md va aggiornato se si cambia branch di nuovo):
  - 2.1 people CRUD+archiving (era già done); 2.2 profili Pilota/Allievo/Istruttore (soft-deactivation `deactivatedAt`, transizione allievo→pilota, `PUT/POST /api/v1/people/[id]/profiles/[type]`); 2.3 scheda persona (`/dashboard/people/[id]`, own-access `self.read`+`personId` nel service, profiles-panel readOnly, 5 segnaposto per epic 3-7); 2.4 CRUD velivoli (`Aircraft`, `/dashboard/aircraft`, marche normalizzate uppercase, contaore in minuti AD-2); 2.5 stato operativo + rettifiche contaore (`AircraftStatus` enum, `HourMeterAdjustment` append-only con FOR UPDATE lock, contaore modificabile SOLO via rettifica — rimosso dal PATCH).
  - Ogni story: commit di implementazione + commit di fix review; Review Record nel story file.
  - Gate correnti: lint verde (1 warning benigno documentato su `data-table.tsx`, React Compiler + TanStack), typecheck verde, **224/224 unit**, build verde, **49/49 e2e**.
- Tracking: `_bmad-output/implementation-artifacts/sprint-status.yaml` (epic-2: done). Prossimo: **Epic 3 Finanze — story 3.1 accounts-topups** (story file NON ancora creato).

## What Worked

- Ciclo per story invariato e solido: Fable scrive story file ricco (vincoli AD, pattern esistenti, review-lessons precedenti, cosa NON fare) → dev Sonnet bmad-dev-story → commit → review Opus adversarial → fix di Fable → commit fix. Le review Opus continuano a trovare problemi veri: stale-form senza `key` remount (2.4 F1), TOCTOU su deactivate (2.2 F1), audit trail con previousMinutes stale sotto concorrenza → `SELECT ... FOR UPDATE` via `$queryRaw` (2.5 F1, mandatory).
- **Lezioni review diventate pattern** (citarle negli story file nuovi): guardie atomiche `updateMany` per transizioni di stato; `key={id}` sui form di edit; `setValueAs` ''→null sui campi opzionali; cap INT max sui numeri e `.max(500)` sulle stringhe libere; ownership check PRIMA della query (no enumeration 403/404).
- Subagent interrotto (limite sessione): riprendibile con SendMessage sullo stesso agentId senza perdere contesto — confermato di nuovo (dev 2.2).
- Classificatore permessi giù ("claude-opus-4-8[1m] temporarily unavailable"): blocca spawn subagent e persino send_later; le operazioni read-only funzionano. Soluzione: tool Monitor con `sleep N && echo retry` come timer di ritentativo — funziona.

## What Didn't Work

- Rete: `mcp.context7.com` e siti doc bloccati (solo npm/PyPI/GitHub raw); Docker Hub bloccato → PostgreSQL 16 locale (`service postgresql start`); Mailpit compilato con `go install` → `/root/go/bin/mailpit` (container nuovo: ricompilare, ~1 min).
- `prisma migrate dev` E `prisma migrate reset` rifiutano il sandbox non-interattivo: migrazioni con `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → file a mano → `migrate deploy` → `generate`; reset DB con `sudo -u postgres psql -c 'DROP DATABASE airmanager;' && createdb -O airmanager airmanager && migrate deploy && db seed`.
- **e2e flaky su DB sporco**: i run accumulano Person/Aircraft e i test 2.1 che guardano la prima pagina falliscono (il record nuovo finisce a pagina 2). SEMPRE resettare il DB prima di giudicare un run completo. Da sistemare prima o poi (cleanup per-test o DB di test dedicato).

## Key Decisions (oltre a PRD/spine/CLAUDE.md e story files)

- Un commit per story + un commit per i fix di review (regola utente). Nessun riferimento AI nei messaggi di commit.
- Contaore: `hourMeterMinutes` cambia SOLO via `POST /api/v1/aircraft/[id]/hour-meter-adjustments` (audit: chi/quando/prima/dopo/motivo); tolto dal PATCH generico (2.5).
- Fuori servizio ≠ archiviato: OUT_OF_SERVICE resta in elenco (flotta attiva non prenotabile, flag pronto per Epic 7); archiviato = fuori flotta.
- Profili persona: 1-a-0/1 su Person (AD-11), soft-deactivation, mai delete; `Account` futuro apparterrà a Person, mai al profilo.
- Own-access: `self.read` + confronto `actor.personId` nel service (mai in `authorize()`), check PRIMA della query.
- Permessi rinviati: `ppr.manage` (epic 8), `school.manage.any` staff (epic 9); non esiste `aircraft.read` (piloti vedranno la flotta con l'epic 7).
- Seed: `admin@airmanager.local` + `pilot@airmanager.local` (con Person + PilotProfile attivo) + velivolo `I-ABCD`.

## Next Steps (in ordine)

1. **Story 3.1 accounts-topups** (Epic 3 Finanze): Fable crea `_bmad-output/implementation-artifacts/3-1-accounts-topups.md` da epics.md. ATTENZIONE ai vincoli cardine: AD-2 (centesimi interi, `src/lib/money.ts` esiste già), AD-3 (ledger `AccountMovement` append-only con storno `reversalOfId`, saldo = SUM, MAI campo saldo), AD-11 (`Account` appartiene a `Person`). Poi ciclo solito: sprint-status ready-for-dev → dev Sonnet → review Opus → fix → done.
2. Stories 3.2-3.5 (estratto conto, rettifiche+alert saldo negativo, cassa aviosuperficie, report finanziario) stesso ciclo; poi epic-3 done → Epic 4 (Tariffe e pacchetti).
3. Pendenze non bloccanti: Context7 (utente deve sbloccare dominio), verifica `docker compose up` fuori sandbox, retrospettive epic opzionali, flakiness e2e su DB sporco (vedi sopra), F2 review 2.5 (storico rettifiche cappato a 50 senza load-more).

Ambiente da ripristinare a inizio sessione (container nuovo): `service postgresql start`; se manca il ruolo/DB: `sudo -u postgres psql -c "CREATE ROLE airmanager LOGIN PASSWORD 'airmanager' CREATEDB;" && sudo -u postgres createdb -O airmanager airmanager`; `.env` da `.env.example` (AUTH_SECRET random); `npm install`; `npx prisma migrate deploy && npx prisma db seed`; Mailpit: `go install github.com/axllent/mailpit@latest` poi `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 &`. MAI `playwright install` (Chromium in `/opt/pw-browsers`).
