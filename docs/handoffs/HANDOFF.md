# HANDOFF — AirManager (aggiornato: 2026-07-10 sera — **PIANO MVP COMPLETO** (epic 1–10) + retro Epic 9 + TD-5; documento FUSO da due sessioni parallele)

## Goal

Costruire AirManager, il gestionale per un'aviosuperficie (piloti, velivoli, voli, PPR, finanze, scuola volo, tariffe, prenotazioni, scadenze, RBAC, export Excel/PDF) con il metodo BMAD v6. **Il piano MVP è COMPLETO**: tutti i 10 epic + TD-1..5 sono done. Non esiste un "prossimo epic" pianificato — la prossima sessione parte dalle decisioni dell'utente (v. Next Steps).

**NOTA DI FUSIONE**: il 2026-07-10 hanno lavorato DUE sessioni in parallelo dalla stessa base (main post-PR #13): (a) Epic 10 (branch `claude/handoff-docs-tpn5f3`, PR #14, MERGED) e (b) retro Epic 9 + TD-5 (branch `claude/retrospective-td-pass-deferred-v9vw5a`, PR #15). Questo handoff fonde i due; il merge di main (con Epic 10) nel branch (b) è stato verificato con gates + full suite (esiti sotto).

## Ruoli modello e regole di processo (config utente 2026-07-07, confermata su epic 5–10 e TD-5)

- **Stories**: sessione principale **Fable 5 (xhigh)**, via `bmad-create-story` DOPO ricognizione Explore (lanciabile in parallelo ad altro lavoro).
- **Dev**: **UN SOLO subagent Sonnet 5 (xhigh)** per story via Workflow tool con output strutturato (status/summary/commitSha/gates/filesChanged/notesForReview/deviations).
- **Review**: subagent **Opus 4.8 (xhigh)** adversarial — unico layer adversarial, MAI abbassarlo (se temporaneamente indisponibile: riprovare, mai degradare); briefato coi notesForReview del dev e col mandato ESPLICITO di chiudere in prima persona i gap dichiarati; priorità zero: **full suite e2e su DB fresco, BUILD DI PRODUZIONE in modalità CI** (`CI=1 npx playwright test`). I fix li applica la sessione principale (il reviewer non ha Edit/Write).
- **Regola dalla retro Epic 9 (AI-2, anche in CLAUDE.md)**: un'assumption di DOMINIO si ratifica con l'utente (AskUserQuestion) PRIMA di implementare — mai spedirla "da confermare" (il rework 9.4 nasceva da lì).
- **Skill `karpathy-guidelines`** in ogni prompt di dev e review; **stories con UI**: dev DEVE usare `design-taste-frontend` + `ui-ux-pro-max` + verifica Playwright MCP. Note operative: `browser_resize` può mancare (mobile → markup review/e2e, dichiararlo); il credential guard può bloccare il login MCP interattivo dei subagent — workaround sanzionati: script Playwright throwaway che legge `process.env`, o la prova via e2e reale.
- **Regole utente**: ogni **epic ha la sua PR**; ogni **story i suoi commit**; a fine lavoro: `/handoff`, push, PR, **STOP**. **Lezione di QUESTA giornata: MAI due sessioni di sviluppo in parallelo dalla stessa base senza coordinamento** — il merge è costato conflitti su handoff/sprint-status e una ri-verifica completa (andata bene, ma il rischio semantico era reale: il TD-5 ha cambiato il formato money mentre l'Epic 10 scriveva e2e nuovi che asseriscono importi).
- **Identità git**: `git config user.email noreply@anthropic.com && git config user.name Claude`; dopo ogni commit di subagent `git commit --amend --no-edit --reset-author` PRIMA del push. Pushare SUBITO dopo ogni commit. MAI force-push di commit già pushati.

## Current Progress

- **Epic 1..10 DONE** (PR #2..#14, tutte MERGED) + TD-1..4 + harness. Dettagli negli handoff archiviati (`docs/handoffs/HANDOFF-*.md` — in particolare `HANDOFF-2026-07-10-0627.md` per il dettaglio completo dell'Epic 10: export xlsx sui 10 endpoint elenco, export PDF dei 4 report con branding da `/dashboard/settings`, dashboard per ruolo).
- **Branch `claude/retrospective-td-pass-deferred-v9vw5a` (PR #15, aperta)** — retro + TD-5 + merge di main:
  - **Retrospettiva Epic 9 DONE** (`epic-9-retro-2026-07-10.md`): prima retro formale; lezione principale = ratifica sincrona delle assumption (AI-2); action item in `sprint-status.yaml`.
  - **TD-5 deferred pass DONE** (review **clean-pass, zero mandatory**): (1) hydration money-format KILLED — `formatCents` pinna `useGrouping:'always'`: separatore migliaia SEMPRE presente in it (anche sotto 10.000, cambio VISIBILE deliberato), deterministico tra ICU Node/browser; (2) `/dashboard/school` degrada al default su `from>to`; (3) locale threadato nel diario (92-N2 chiuso); (4) registro PPR: "Azzera filtri" nascosto al load, reset → default APPROVED (F4 8.3 chiuso); (5) **updateBooking ricontrolla le scadenze** SOLO se cambia il giorno di volo (loophole 7.4 chiuso; helper `findBlockingExpiredDocuments` condiviso col create; niente `force` sull'update — deferral); (6) pg DeprecationWarning analizzata = query-overlap dentro il runtime Prisma→pg, **non-fixabile-a-call-site** (chiusa senza codice, doppia verifica dev+reviewer).
  - **Merge di origin/main (Epic 10) nel branch**: conflitti risolti (handoff, sprint-status — CLAUDE.md e tutto il codice auto-fusi); ri-verifica completa post-merge: v. gate sotto.
- **Gate post-merge (stato autoritativo del branch PR #15)**: v. ultima sezione di questo handoff PRIMA del push (gates + full suite CI-mode su DB fresco).
- Tracking: `sprint-status.yaml` — epic-1..10 done, td-1..5 done, epic-9-retrospective done; action_items: AI-1 done, AI-2/AI-3 open (valgono per ogni sessione futura), AI-4 v. sotto, AI-5 parzialmente assorbito dall'Epic 10 (v. Deferred).

## What Worked

- Il ciclo consolidato (Explore recon → story file → dev Sonnet via Workflow → review Opus chiudi-tu-i-gap → fix in sessione principale) ha retto anche su un TD-pass multi-item (6 fix chirurgici) e sull'intero Epic 10 (3 story) NELLO STESSO GIORNO, in sessioni separate.
- La clausola di story "se non fixabile al call-site, documentare SENZA cambi speculativi" (TD-5 AC 6): chiusura onesta a zero codice, confermata indipendentemente dal reviewer.
- Retro come input diretto del TD-pass: il triage È diventato il perimetro della story.
- 103-F1 (Epic 10) trovato SOLO dalla full suite del reviewer su prod build: la priorità zero paga fino all'ultima story.

## What Didn't Work

- **Due sessioni di sviluppo in parallelo dalla stessa base** (v. regole): funzionato per fortuna e ri-verifica, non per design. Coordinare sempre: o sequenziali, o su superfici disgiunte dichiarate.
- Selettori Playwright page-level con name substring: fragili (103-F1) — convenzione nav-scoped/`exact:true` ora in CLAUDE.md.
- `e2e/bookings.spec.ts` accumula righe Booking sulla fixture condivisa `FUTURE_DAY` (2031-03-10) se rieseguito ripetutamente sullo stesso DB (oltre `BOOKINGS_PAGE_SIZE=20` fallisce "Prossime prenotazioni" — meccanismo noto nel doc-comment di `soonestFutureSlot()`): resettare il DB, non inseguire.
- `ppr-register:206` resta il flake noto (~1 rosso ogni 2-3 run, retry-verde); `cash-report` ECONNRESET sotto load.

## Key Decisions (oltre a quelle nei story file)

- **Formato money (TD-5, cambio visibile)**: separatore migliaia SEMPRE presente in it anche sotto 10.000 € (`1.500,00 €`) — determinismo SSR/client. Ogni asserzione futura su stringhe money deve aspettarselo.
- **Ricontrollo scadenze su spostamento prenotazione**: SOLO al cambio del GIORNO di volo; niente `force` sull'update (cancella e ricrea, deferral).
- **Export (Epic 10)**: parità permessi export=vista via riuso diretto dei list service; cap 10k xlsx / 2k pdf → 422 `EXPORT_TOO_LARGE`; locale sempre query param esplicito su `/api/v1`.
- **Branding (Epic 10)**: `AppSetting` K/V (`airfield.name`, `airfield.logo` data-URL), pagina `/dashboard/settings` admin-only; lettura senza gate (serve ai PDF), scrittura admin.
- **Home per ruolo (Epic 10)**: widget sempre-visibili con empty state; istruttore vede anche il blocco personale; admin vede blocco istruttore degradato — **è l'estensione alla home del 93-N1, ratificata con e2e esplicito in 10.3**: la domanda AI-4 all'utente resta aperta solo come eventuale ripensamento estetico, il comportamento è ormai deliberato in due superfici.
- **Deferred aperti** (lista RICONCILIATA post-TD-5 + Epic 10):
  1. Nome aviosuperficie nel form PPR pubblico: la config ORA ESISTE (`airfield.name`, 10.2) — resta la micro-story di collegarla all'hero del form (residuo di AI-5).
  2. TOCTOU rate-limit PPR + trust `x-forwarded-for` (scelte infra al go-live).
  3. `closedByUserId` non nel DTO (additivo, quando Flutter).
  4. Description movimento PPR in inglese (solo su richiesta utente).
  5. Coda retry email NFR-7 (infra post-MVP).
  6. `force` su updateBooking (TD-5, su richiesta).
  7. 101-N1 e 102-N1 (Epic 10, accettati): 422 su locale/format invalidi nel ramo JSON; header colonne PDF non ripetuto sulle pagine 2+ (`fixed` sull'header row).
  8. 103-N1: audit dei selettori nav non-scoped negli e2e esistenti (convenzione ora in CLAUDE.md, il debito è il pregresso).
  9. Fixture design `FUTURE_DAY` in bookings.spec.ts (v. What Didn't Work).
  10. pg DeprecationWarning: non-fixabile-a-call-site (sparirà con upgrade pg/Prisma).
  - CHIUSI da TD-5 (non più deferred): hydration money-format, 92-N2, 93-N2, "Azzera filtri" PPR, ricontrollo scadenze updateBooking.

## Next Steps (in ordine)

1. **Merge della PR #15** (retro + TD-5 + merge main) — a valle della ri-verifica post-merge documentata sotto. È l'ultimo pezzo pendente: dopo, main = MVP completo + debito ripulito.
2. **STOP: piano MVP completo.** La prossima sessione parte SOLO da una decisione dell'utente. Candidati naturali: (a) retrospettiva finale di progetto / epic-10-retrospective (`optional` in sprint-status); (b) micro-TD sui deferred residui più concreti (nome aviosuperficie nel form PPR, header PDF multi-pagina, audit selettori 103-N1); (c) preparazione go-live (hosting, provider email reale, rate limiting infra — v. ARCHITECTURE-SPINE «Deferred»; qui si decidono anche TOCTOU/x-forwarded-for); (d) v2 dal PRD §6.2: app Flutter sulle API v1 (OpenAPI completo), pagamenti online, notifiche push, statistiche avanzate, carburante a magazzino.
3. A inizio prossima sessione: bootstrap via hook; baseline attesa post-merge PR #15: **195 e2e / 1211 unit / 29 migrazioni** su DB fresco (CI-mode/prod build).
4. Se si sviluppa: ciclo per story INVARIATO (v. sezione ruoli); applicare AI-2 (ratifica assumption) e AI-3 (convenzioni cross-cutting negli story file).

## Verifica post-merge (questa sessione, dopo il merge di main nel branch PR #15)

- **Un solo conflitto semantico** tra Epic 10 e TD-5, trovato dai gates e fixato (`7dcdd7b`): l'unit test 10.2 `exports.service.test.ts` pinnava `'1000,00 €'` (formato pre-TD-5) → `'1.000,00 €'`. Grep esaustivo sugli altri literal money in fascia: solo input/placeholder (parsing, non display) e regex già tolleranti — nessun altro cambio.
- **Gates sul tree fuso**: lint PASS, typecheck PASS, **1211/1211 unit** (1207 Epic 10 + 4 TD-5), build PASS.
- **Full suite e2e su DB fresco, BUILD DI PRODUZIONE in modalità CI**: **195/195 passed (3.5m, exit 0), zero flaky nel run** — 192 Epic 10 + 3 TD-5. Baseline confermata per le prossime sessioni: **195 e2e / 1211 unit / 29 migrazioni**.

Ambiente (fallback manuale se l'hook SessionStart non gira): `service postgresql start`; ruolo/db airmanager; `.env` da `.env.example` (AUTH_SECRET random, JOBS_SECRET); `npm install`; `npx prisma migrate deploy && npx prisma db seed` (**29 migrazioni**; se il seed fallisce su SEED_ADMIN_PASSWORD: `set -a && . ./.env && set +a`); Mailpit `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025` in background. Reset DB (SOLO sessione principale): `npm run db:reset` PRIMA di dev E review. Prima di ogni run e2e: `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`). Build SEMPRE via `npm run gates`. MAI `playwright install`. Utenti seed: admin@ / staff@ / pilot@ / instructor@ / student@airmanager.local (password = SEED_ADMIN_PASSWORD).
