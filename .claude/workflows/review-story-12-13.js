export const meta = {
  name: 'review-story-12-13',
  description: 'Review adversarial (Opus 4.8 xhigh) della story 12.13 — sweep di rimozione finale: CI=1 full suite, audit completezza rimozioni, gate istruttore post-rbac, OpenAPI',
  phases: [{ title: 'Review', detail: 'adversarial-reviewer Opus 4.8', model: 'opus' }],
}

phase('Review')

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'ciRun', 'gates', 'findings', 'acAudit', 'devNotesClosed'],
  properties: {
    verdict: { type: 'string', enum: ['shippable', 'shippable-with-fixes', 'not-shippable'] },
    ciRun: { type: 'string', description: 'Esito full suite CI=1 su build prod (X/Y pass, fail elencati)' },
    gates: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'severity', 'title', 'evidence', 'recommendation'],
        properties: {
          id: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'note', 'po-decision'] },
          title: { type: 'string' },
          evidence: { type: 'string', description: 'Evidenza EMPIRICA (comando/output/file:riga)' },
          file: { type: 'string' },
          recommendation: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    acAudit: { type: 'string', description: 'Per ogni AC 1-8: fatto? testato? evidenza' },
    devNotesClosed: { type: 'string', description: 'Esito verifica dei 5 punti notesForReview del dev + audit endpoint + deviations' },
  },
  additionalProperties: false,
}

const prompt = [
  'Sei il reviewer ADVERSARIAL della story 12.13 di AirManager — ULTIMA story dell Epic 12, sweep di rimozione finale. Trova cio che non va, con evidenza empirica.',
  '',
  '== OGGETTO ==',
  'Story file (leggi TUTTO: Ratifiche 1-5, Dev Agent Record con l audit endpoint, Deviations, Change Log): _bmad-output/implementation-artifacts/12-13-rimozioni-cleanup-sweep.md',
  'Implementazione = commit 92b426b (feat) + d8bcfb5 (fix e2e). Diff completo: git diff 6c481fb..HEAD (ENORME: ~40 file cancellati). CLAUDE.md aggiornato dalla story stessa (AC6) — valuta ANCHE quello come deliverable. Applica .claude/skills/karpathy-guidelines/SKILL.md.',
  '',
  '== PRIORITY ZERO ==',
  'Full suite e2e CI-mode su BUILD DI PRODUZIONE, DB GIA fresco (36 migrazioni + seed appena applicati): fuser -k 3000/tcp; CI=1 npx playwright test. Attesi 230/230 (giu da 252 per gli spec eliminati — verifica che il calo sia SOLO spec cancellati, git diff sui file e2e, non test indeboliti/skippati). Fail = distingui con evidenza.',
  '',
  '== PUNTO CRITICO NUMERO UNO (aggiunto dalla sessione principale) ==',
  'La rbac perde `school.manage.own` (ratifica 1), MA la home 12.12 sceglieva la faccia ISTRUTTORE proprio con hasPermission(actor, school.manage.own) e l InstructorLanding/getOwnCompensationSummary ne dipendevano. Il dev ha toccato page.tsx: VERIFICA come ha rimappato il gate (con quale criterio ora un istruttore atterra sulla sua faccia? un ADMIN resta sulla console? un pilota NON deve vedere la faccia istruttore). Prova con login REALI dei 5 utenti seed: ogni ruolo deve atterrare sulla faccia giusta. Verifica anche che il permesso rimosso non sia referenziato da NESSUNA parte (grep school. in src/).',
  '',
  '== ALTRI PUNTI DA ATTACCARE (dai notesForReview del dev + miei) ==',
  '1. COMPLETEZZA delle rimozioni: grep in src/ e messages/ per riferimenti residui a school, packages, package-types, expiry-proposals, proposals, ppr/register, nav-items, LegacyBackdrop, airopsNative, expiries.propose.own — ogni hit residuo va spiegato o e un finding. Verifica anche gli import morti (il build passa, ma cerca stringhe/route/i18n orfane).',
  '2. Deviation dichiarata dal dev: rimozione INTERA del breakdown pacchetti dal wire contract (flightBreakdownSchema: packageCoveredMinutes/chargedMinutes/packageConsumptions) + UI — oltre la lettera della ratifica 4a ("ramo package-consumption in registerFlight"). Valuta se la lettura "campi diventati costanti morte" regge (il contratto API e versionato per una futura app Flutter: la rimozione di campi dal wire e breaking — ma non esistono consumer esterni OGGI). Giudica: ok o po-decision.',
  '3. Aritmetica di flight-reversal.spec.ts riscritto: verifica INDIPENDENTEMENTE i nuovi importi (60 min @150/h aeromobile + 60 min @40/h istruttore = 190,00; TOURISM 60 min no istruttore = 150,00; correzione a 30 min = 75,00; saldo finale -75,00) contro le tariffe REALI create dal test e il comportamento del service (leggi il test e il service, rifai i conti).',
  '4. AC3/F5: le 9 route nuove registrate nel registry OpenAPI (settings/{club,scheduling,smtp,smtp/test-email,metar-station,membership-fee}, metar, expiry-alerts/trigger, people/{id}/membership-fee) + registry.test.ts le IMPONE (non piu arrayContaining permissivo su quelle) + le route rimosse NON compaiono piu. Genera/ispeziona l OpenAPI reale (endpoint /api/v1/openapi.json su server avviato o via test) e verifica.',
  '5. AC4 audit endpoint: spot-check l audit del dev — in particolare: GET /users e GET /users/{id} rimossi (la pagina Piloti usa il service direttamente): prova che invito/sospensione/riattivazione da Piloti FUNZIONANO ancora (UI reale); cash-categories GET tenuto (type-picker billing) ma write-side ORFANO (nessuna UI) — conferma il gap e valuta la severita (nota per handoff vs po-decision).',
  '6. Punto 4 del dev: people/{id} e people/{id}/account senza LegacyBackdrop — VERIFICA VISIVA REALE in dark theme (login pilota, "La mia scheda" e "Il mio conto", screenshot entrambi i temi): card Tailwind chiare su sfondo scuro AirOps. Giudica tu la severita (comportamento atteso da AC2 ma UX potenzialmente rotta su pagine che il PO ha scelto di TENERE e che i piloti raggiungono dal landing).',
  '7. Flussi vivi INTERATTIVI: pilota → scheda (senza pannelli pacchetti/istruttori) e estratto conto (senza pacchetti); expiries own-face SENZA "Proponi aggiornamento"; billing intatto; movements intatto; ppr/register → 404 da autenticati; modulo pubblico /ppr intatto.',
  '8. rbac.test.ts e la matrice permessi: INSTRUCTOR/PILOT/STUDENT post-rimozione hanno esattamente i permessi attesi; nessun permesso fantasma.',
  '9. CLAUDE.md (AC6): riga stack/route-map/minimalist-ui aggiornate correttamente e VERE (verifica i fatti contro il codice); lancia .claude/hooks/claude-md-drift.sh e verifica che non segnali drift.',
  '10. i18n: it.json/en.json ancora SPECULARI (stesse chiavi) dopo la potatura; nessuna chiave usata rimossa per errore (il build lo avrebbe beccato solo per uso statico — grep t( dinamici).',
  '',
  '== AMBIENTE (macchina locale Fedora) ==',
  '- DB GIA fresco; docker compose up (Postgres 5432, Mailpit 1025/8025). Env: set -a && . ./.env && set +a',
  '- MAI playwright install. Verifiche UI: script @playwright/test throwaway in /tmp (MCP rotto), cancellali a fine. Screenshot ok.',
  '- Gates: SOLO npm run gates. e2e FOREGROUND; se Bash auto-backgrounda il full run per timeout, tee su file e attendi il file — mai rilanciare.',
  '- Catena project playwright: run singolo di settings/booking-window con --no-deps.',
  '- Utenti seed admin@/staff@/pilot@/instructor@/student@airmanager.local (password in SEED_ADMIN_PASSWORD di .env, mai copiarla).',
  '- Niente processi orfani a fine (fuser -k 3000/tcp).',
  '',
  '== COSA NON FARE ==',
  '- NON committare fix: riporta findings. NON toccare churn untracked (.agents/, .claude/skills/*, .github/hooks|skills, skills-lock.json, .claude/workflows/) ne lo stash git. NON riscrivere la story (Review Record lo fa la sessione principale).',
  '',
  '== REPORT ==',
  'StructuredOutput: verdict, ciRun, gates, findings per severita con evidenza EMPIRICA, acAudit AC-per-AC, devNotesClosed (5 punti del dev + spot-check audit endpoint + deviations). Un finding senza evidenza non esiste.',
].join('\n')

const review = await agent(prompt, {
  agentType: 'adversarial-reviewer',
  model: 'opus',
  effort: 'xhigh',
  label: 'review:12.13',
  schema: REVIEW_SCHEMA,
})

return review