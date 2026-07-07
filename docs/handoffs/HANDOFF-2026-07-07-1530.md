# HANDOFF — AirManager (aggiornato: Epic 4 DONE, pronti per Epic 5)

## Goal

Costruire AirManager, il gestionale per un'aviosuperficie (piloti, velivoli, voli, PPR, finanze, scuola volo, tariffe, prenotazioni, scadenze, RBAC, export Excel/PDF) con il metodo BMAD v6: PRD → architettura → epics → stories → dev → review. Fase corrente: Fase 2, sviluppo story-by-story degli epic.

## Ruoli modello e regole di processo (config approvata dall'utente 2026-07-07)

- **Stories**: sessione principale **Fable 5 (effort extra-high)**.
- **Dev**: **UN SOLO subagent Sonnet 5 (extra-high)** per story — NIENTE fan-out ultracode (provato su 4.3: il costo non ripaga; la story file prescrittiva + la review Opus coprono la verifica; deciso con l'utente).
- **Review**: subagent **Opus 4.8 (extra-high)** adversarial — l'unico layer adversarial, mai abbassarlo. I fix li applica la sessione principale.
- **Regole utente**: ogni **epic ha la sua PR**; ogni **story ha i suoi commit** (story file → implementazione → fix/record di review); a **epic finito**: `/handoff`, push, **STOP** — l'epic successivo parte in una NUOVA sessione.
- **Stories con UI**: il dev DEVE usare le skill `design-taste-frontend` E `ui-ux-pro-max` (skill di progetto in `.claude/skills/ui-ux-pro-max`, DB interrogabile: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`), mantenendo coerenza con lo stile minimalista editoriale esistente.
- **Playwright MCP** configurato in `.mcp.json` (server `playwright`, headless su `/opt/pw-browsers/chromium`): disponibile alle sessioni avviate DOPO questo commit per la verifica UI interattiva.

## Current Progress

- **Epic 1, 2, 3 DONE** e merged/aperti: PR #2 (merged), PR #3 (merged), **PR #4 (Epic 3, APERTA**, branch `claude/handoff-model-assignment-yyv1r1`, base main).
- **Epic 4 (Tariffe e pacchetti) DONE** — **PR #5** (branch `claude/epic-4-rates-packages`, **stacked su PR #4**; da retargetare su main quando #4 merge-a). Branch di sessione: `claude/epic-4-resume-pr-5-ambmfd` (identico, pushato anch'esso).
  - **4.1 tariffe velivolo** (`AircraftRate`, AD-4 max validFrom ≤ D, `settings.manage` write / `aircraft.manage` read) — review clean.
  - **4.2 tariffe istruttore** (`InstructorRate`, gemello di 4.1, read `people.read`; estratto `src/lib/date-only.ts`) — review clean.
  - **4.3 tipi pacchetto** (`PackageType` + join esplicita `PackageTypeAircraft`; listino mutabile con snapshot alla vendita; read `finance.manage` / write `settings.manage`; UI `/dashboard/finance/packages`; fix condiviso `apiRoute()` 204) — review Opus: **F1 fixato** (il check archiviato→409 su update ora vale solo per associazioni NUOVE; un velivolo archiviato DOPO l'associazione non blocca più l'edit); F2/M1/M2 deferred (vedi Review Record).
  - **4.4 vendita pacchetti** (`HourPackage` snapshot + `PACKAGE_PURCHASE` enum; vendita = UNA transazione: upsert Account + AccountMovement **amount 0** (pagamento ESTERNO, saldo invariato) + HourPackage + CashMovement +prezzo "Pacchetti"; residuo SEMPRE calcolato (`computeRemainingMinutes`), mai colonna; `expiresAt` = `addMonthsClampUtc` (clamp fine mese); `deletePackageType` pre-check venduti → 409; UI packages-panel su scheda persona + estratto conto) — review Opus: **clean pass**, D1/D2/D3 deferred (preview conto stale post-vendita; rettifica 3.3 puntabile a movimento 0; scadenza in ISO grezzo).
- **Gate correnti** (fine epic, DB reset + Mailpit): lint 0 errori (1 warning benigno noto `data-table.tsx`), typecheck pulito, **479/479 unit**, build verde, **83/83 e2e**.
- Tracking: `_bmad-output/implementation-artifacts/sprint-status.yaml` — epic-1/2/3/4 done. Story file con Review Record completi in `_bmad-output/implementation-artifacts/4-*.md`.

## What Worked

- **Config a singolo dev agent Sonnet 5 xhigh** (usata su 4.4): implementazione completa e pulita in un colpo, review Opus clean pass — a metà dei token e del wall-clock del workflow ultracode usato su 4.3. Confermata come standard.
- **Review Opus xhigh resta il layer che trova i bug veri**: F1 di 4.3 (tipo immodificabile se un velivolo associato viene archiviato dopo — confermato empiricamente con test DB-backed dal reviewer) era sfuggito a dev + 3 verificatori ultracode.
- Story file prescrittivi con "Contesto e decisioni chiave" in testa (pagamento esterno/amount 0, residuo calcolato, snapshot AD-4) → il dev non deve inventare semantica di dominio.
- Workflow tool per orchestrare dev/review in background con output strutturato (schema JSON) → risultati machine-readable per il Review Record.
- Ripresa di un dev agent morto a metà (API error): rilanciare il workflow con prompt "audit del lavoro parziale nel working tree, completa i gap" — ha funzionato perfettamente su 4.3.

## What Didn't Work

- **Ultracode fan-out sul dev** (4.3): 3 verificatori + fixer ≈ 500k token e +15 min per trovare 1 finding (respinto come convenzione) mentre il bug vero (F1) è passato — la review Opus l'ha preso. Da qui la config a singolo agent.
- Rete: `mcp.context7.com` e siti doc bloccati (solo npm/PyPI/GitHub raw); Docker Hub bloccato → PostgreSQL locale; Mailpit via `go install` → `/root/go/bin/mailpit`.
- **`&`/`nohup` in shell viene ucciso dall'harness**: processi long-running (Mailpit) SOLO con Bash `run_in_background: true`.
- `prisma migrate dev`/`reset` rifiutano il sandbox: migrazioni a mano via `migrate diff --from-config-datasource prisma/schema.prisma --to-schema prisma/schema.prisma --script` (togliere la riga banner!) + `migrate deploy`; reset DB con DROP/createdb/deploy/seed.
- e2e flaky noti: login timeout sotto carico parallelo (2 worker), ECONNRESET sporadici — SEMPRE re-run in isolamento su DB fresco prima di giudicare; DB sporco accumula record e rompe i test di paginazione.

## Key Decisions (oltre a PRD/spine/CLAUDE.md e story files)

- **Vendita pacchetto = pagamento ESTERNO al conto**: `AccountMovement PACKAGE_PURCHASE` ha `amountCents: 0` (riga informativa di estratto; il saldo NON cambia); il prezzo vive sullo snapshot `HourPackage.pricePaidCents` e sull'entrata cassa. Niente acquisto "da saldo" (fuori scope MVP).
- **Residuo ore = SEMPRE derivato** (`computeRemainingMinutes`, oggi = includedMinutes): epic 5 lo estenderà sottraendo il consumo (SUM), MAI una colonna contatore (AD-3).
- **Listino mutabile** (`PackageType`): edit sempre lecito perché la vendita fa snapshot (AD-4); delete solo se mai venduto (pre-check `_count` + backstop P2003→409, FK RESTRICT); disattivazione per ritirarlo dal picker.
- Check "velivolo archiviato" su update del tipo: vale SOLO per associazioni nuove (review 4.3 F1) — un archiviato già associato resta e non blocca gli edit.
- `expiresAt` con **clamp a fine mese** (`addMonthsClampUtc`: 31 gen +1m = 28/29 feb); `isExpired` = strettamente `expiresAt < oggi` UTC (il giorno di scadenza è valido).
- `apiRoute()` ora gestisce `successStatus: 204` con body davvero vuoto (spec Fetch); prima route 204 del codebase (DELETE package-types).
- Deferred documentati da riprendere prima o poi: D1/D2/D3 di 4.4, M1 (P2025→500 su doppio delete concorrente, uniforme coi catalog service), M2 (a11y `role="alert"` sugli errori form, pass app-wide), F2 (conflazione messaggi 409 per form).

## Next Steps (in ordine)

1. **NUOVA SESSIONE per Epic 5 (Voli e addebiti automatici)** — regola utente: questa sessione si ferma qui. Story 5.1 (registrazione volo con calcolo costo e addebito): Fable crea `5-1-flight-logging-charges.md` da epics.md. ATTENZIONE: qui il conto SI addebita davvero (FLIGHT_CHARGE negativo, snapshot tariffa AD-4 via `getEffectiveRate`/`getEffectiveInstructorRate` già pronti), il contaore avanza (via transazione, non via PATCH), e il consumo pacchetti è la story 5.2 (estendere `computeRemainingMinutes`).
2. Ciclo per story: story file (Fable xhigh) → dev (1 Sonnet 5 xhigh, skill UI obbligatorie se c'è UI) → review (Opus 4.8 xhigh) → fix in sessione → done. Un commit per passo.
3. PR: quando PR #4 (Epic 3) viene merge-ata, **retargetare PR #5 su main**; Epic 5 = nuova PR stacked su #5 (o su main se #5 è già merged).
4. Pendenze non bloccanti: deferred sopra; Context7 (dominio da sbloccare); retrospettive epic opzionali; DB di test dedicato per e2e.

Ambiente da ripristinare a inizio sessione (container nuovo): `service postgresql start`; se manca ruolo/DB: `sudo -u postgres psql -c "CREATE ROLE airmanager LOGIN PASSWORD 'airmanager' CREATEDB;" && sudo -u postgres createdb -O airmanager airmanager`; `.env` da `.env.example` (AUTH_SECRET random); `npm install`; `npx prisma migrate deploy && npx prisma db seed`; Mailpit: `go install github.com/axllent/mailpit@latest` poi `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025` con Bash **`run_in_background: true`**. MAI `playwright install`. Git identity: `git config user.email noreply@anthropic.com && git config user.name Claude`.
