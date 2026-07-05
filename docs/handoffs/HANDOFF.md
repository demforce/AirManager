# HANDOFF — AirManager (aggiornato: Epic 1 done + Story 2.1 done)

## Goal

Costruire AirManager, il gestionale per un'aviosuperficie (piloti, velivoli, voli, PPR, finanze, scuola volo, tariffe, prenotazioni, scadenze, RBAC, export Excel/PDF) con il metodo BMAD v6: PRD → architettura → epics → stories → dev → review. Ruoli modello fissati dall'utente: **Fable (sessione principale) crea documenti/stories e orchestra; dev = subagent Sonnet (`model: "sonnet"`); review = subagent Opus (`model: "opus"`)**. Fase corrente: Fase 2, sviluppo story-by-story degli epic.

## Current Progress

- **Fase 0 e Fase 1 complete e pushate** su `claude/airfield-management-system-rh1y4r` (PR #2 aperta verso main: https://github.com/demforce/AirManager/pull/2).
  - PRD: `_bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md` (42 FR; domande aperte risolte con l'utente).
  - Architettura: `_bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md` (AD-1..AD-11 vincolanti).
  - Epics/stories: `_bmad-output/planning-artifacts/epics.md` (10 epics, 39 stories con AC). Tracking: `_bmad-output/implementation-artifacts/sprint-status.yaml`.
- **Epic 1 (Fondazione e accesso) DONE** — 5 stories, ciascuna con commit di implementazione + commit di fix review:
  - 1.1 scaffold Next 16.2/Prisma 7/next-intl 4/Tailwind 4; 1.2 login Auth.js v5 beta.31 (Credentials+JWT, Argon2id); 1.3 RBAC service-layer (rbac.ts, DomainError, /api/v1/me); 1.4 gestione utenti (MailSender→Mailpit, AuthToken monouso hashati, isActive recheck 15', pagine set/forgot-password); 1.5 wrapper apiRoute() + OpenAPI 3.1 su /api/v1/openapi.json + paginazione.
  - Gate correnti: lint/typecheck verdi, **135/135 unit**, build verde, **25/25 e2e Playwright**.
- Prossima story: **2.1 people-crud** (Epic 2 Anagrafiche). File story non ancora creato.

## What Worked

- Ciclo per story: Fable scrive lo story file (contesto ricco: vincoli AD, pattern esistenti, versioni verificate, cosa NON fare) → dev Sonnet con bmad-dev-story → commit → review Opus adversarial (ha SEMPRE trovato problemi reali: open redirect, timing attack, TOCTOU sul token monouso, last-admin lockout) → fix applicati da Fable → commit fix.
- Versioni SEMPRE verificate su npm (`npm view`), mai da memoria; doc ufficiali via WebFetch su raw.githubusercontent.com.
- Subagent interrotto (limite sessione): riprendibile con SendMessage sullo stesso agentId senza perdere contesto.
- Playwright: Chromium preinstallato (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`), MAI eseguire `playwright install`.

## What Didn't Work

- `mcp.context7.com` e in generale i siti doc: bloccati dalla network policy (solo npm/PyPI/proxy.golang.org/GitHub API). `curl` verso doc = fallisce; WebFetch lato server funziona solo su raw.githubusercontent.com.
- Docker Hub CDN bloccato: `docker compose up` non verificabile qui → si usa PostgreSQL 16 locale (`service postgresql start`) con credenziali identiche al compose. **Mailpit**: binari GitHub releases bloccati → compilato con `go install`, binario in `/root/go/bin/mailpit` (avviare con `--smtp 127.0.0.1:1025 --listen 127.0.0.1:8025` prima degli e2e).
- Il classificatore permessi Bash va giù a tratti ("claude-opus-4-8[1m] temporarily unavailable"): i comandi falliscono temporaneamente — riprovare più tardi, non è un errore del codice.
- npm rifiuta `create-next-app` in-place su directory con maiuscole (AirManager) → fatto in scratch dir e merged.

## Key Decisions (oltre a PRD/spine/CLAUDE.md)

- Un commit per story + un commit per i fix di review (regola utente).
- Next 16: UN SOLO file proxy (`src/proxy.ts`, ex middleware) — auth e next-intl composti lì.
- `@auth/prisma-adapter` omesso deliberatamente (Credentials+JWT non usa le tabelle OAuth).
- Schemi OpenAPI: importare `z` da `src/lib/schemas/zod-with-openapi.ts` (regola ESLint dedicata); component schemas col plain zod rompono il registry.
- Permessi rinviati: `ppr.manage` (epic 8, oggi la nav PPR usa `bookings.manage.any`), `school.manage.any` per staff (epic 9).
- Seed: `admin@airmanager.local` + `pilot@airmanager.local`, password da `SEED_ADMIN_PASSWORD`.

## Next Steps (in ordine)

1. **Story 2.2 person-profiles**: Fable crea `_bmad-output/implementation-artifacts/2-2-person-profiles.md` (profili Pilota/Allievo/Istruttore 1-a-0/1 su Person, AD-11; dati specifici per profilo; passaggio allievo→pilota senza perdere storico — vedi Story 2.2 in epics.md), sprint-status → ready-for-dev, commit; poi dev Sonnet → commit → review Opus → fix → commit → done.
2. Stesso ciclo per 2.3 scheda persona, 2.4 velivoli, 2.5 stato/contaore; poi epic-2 done e avanti con Epic 3 (Finanze) secondo epics.md.
3. **Story 2.1 people-crud è DONE** (commit d8d2ded + fix opzionali): ha introdotto `src/components/data-table.tsx` (TanStack Table riusabile — riusarlo nelle prossime viste), gli endpoint `/api/v1/people*` documentati in OpenAPI e il pattern di archiviazione con `archivedAt`. NOTA AMBIENTE NUOVA: `prisma migrate dev` NON funziona in questo sandbox (rifiuta il non-interattivo) — usare `prisma migrate diff --script` + file migrazione scritto a mano + `prisma migrate deploy` (vedi Dev Agent Record 2.1).
4. Pendenze non bloccanti: Context7 (serve che l'utente sblocchi il dominio nella network policy), verifica `docker compose up` su macchina con Docker Hub, retrospettive epic opzionali, permessi rinviati (`ppr.manage` epic 8, `school.manage.any` epic 9).

Ambiente da ripristinare a inizio sessione: `service postgresql start`; Mailpit `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 &`; `.env` esiste già (non tracciato) — se il container è nuovo, ricrearlo da `.env.example` + `SEED_ADMIN_PASSWORD` qualsiasi e rieseguire `npx prisma migrate deploy && npx prisma db seed`.
