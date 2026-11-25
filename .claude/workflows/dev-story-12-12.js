export const meta = {
  name: 'dev-story-12-12',
  description: 'UN dev subagent (dev-story, Sonnet 5 xhigh) implementa la story 12.12: Panoramica reale + landing per ruolo',
  phases: [{ title: 'Dev', detail: 'implementazione story 12.12', model: 'sonnet' }],
}

phase('Dev')

const REPORT_SCHEMA = {
  type: 'object',
  required: ['status', 'summary', 'commits', 'gates', 'filesChanged', 'notesForReview', 'deviations'],
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    summary: { type: 'string', description: 'Cosa e stato implementato, per AC' },
    commits: { type: 'array', items: { type: 'string' }, description: 'SHA + message di ogni commit fatto' },
    gates: { type: 'string', description: 'Esito ultimo npm run gates (verbatim della riga finale)' },
    e2e: { type: 'string', description: 'Esito delle run e2e locali (quali spec, quanti pass/fail, retries)' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    notesForReview: { type: 'string', description: 'Per il reviewer adversarial: punti deboli noti, cosa verificare con priorita, scelte discutibili' },
    deviations: { type: 'array', items: { type: 'string' }, description: 'OGNI deviazione dagli AC o deliverable omesso — MAI tacere nulla' },
  },
  additionalProperties: false,
}

const prompt = [
  'Sei il dev agent della story 12.12 di AirManager. Implementa ESATTAMENTE questa story, tutta e sola.',
  '',
  '== CONTRATTO ==',
  'Story file (contratto vincolante, leggilo per primo e per intero): _bmad-output/implementation-artifacts/12-12-panoramica-landing-ruoli.md',
  'Le "Ratifiche utente" nel file sono decisioni PO definitive (in particolare: KPI Voli oggi = REGISTERED oggi + APPROVED-non-FLOWN; KPI compensi istruttore via reader own-scoped nuovo; CTA "Nuovo volo" istruttore DROPPATA — resta solo "Le mie ore"). CLAUDE.md del repo vale tutto (leggi le convenzioni e2e: sono state appena estese).',
  '',
  '== SKILL OBBLIGATORIE ==',
  '1) Leggi e applica .claude/skills/karpathy-guidelines/SKILL.md (semplicita, modifiche chirurgiche, assumption esplicite, criteri verificabili).',
  '2) Story con UI: usa le skill design-taste-frontend e ui-ux-pro-max (interrogabile: python3 .claude/skills/ui-ux-pro-max/scripts/search.py "query"). Riferimento visivo VINCOLANTE = prototipo AirOps (docs/design-reference/airops/), NON minimalist-ui. Coerenza con le pagine AirOps gia portate.',
  '',
  '== TOCCHI CROSS-STORY DICHIARATI (gli unici ammessi) ==',
  '- Estrazione FleetCard widget da fleet-console.tsx (12.5): fleet-console CONSUMA il widget estratto, la pagina fleet resta identica e i suoi e2e verdi.',
  '- Estrazione della data-prep Schedule/BookingsTable da bookings/page.tsx (12.3) in helper condiviso server-side: la pagina Pianificazione resta identica e i suoi e2e verdi.',
  '- ScadenzeWidget riusa tier/label/logica della 12.11 (expiries): NESSUNA seconda implementazione delle soglie.',
  '- Home legacy: il rewrite ELIMINA i consumi di packages.service/school.service dalla pagina (i service restano — li rimuove la 12.13).',
  '',
  '== AMBIENTE (macchina locale Fedora — regole tassative) ==',
  '- DB GIA fresco (36 migrazioni + seed appena applicati). Postgres/Mailpit via docker compose gia su (5432/1025/8025). Env: set -a && . ./.env && set +a',
  '- Prima di ogni run e2e: curl localhost:3000 deve FALLIRE; libera con fuser -k 3000/tcp.',
  '- e2e locali SEMPRE con --retries=2 (flake noto: primo login su dev server freddo).',
  '- ATTENZIONE playwright.config: esiste una CATENA di project (chromium -> settings -> booking-window) per gli spec che scrivono AppSettings globali. I tuoi spec NUOVI (home-dashboard) NON scrivono settings globali -> restano nel project chromium, NON toccare la catena. Run locale di un singolo file: aggiungi --no-deps se serve evitare i project dipendenza.',
  '- Selettori: scoped/exact (lezione 103-F1), MAI hasText su date/valori (11.2), e OCCHIO ai nomi delle fixture (una persona "Finestra" ha rotto getByLabel Fine — lezione 12.11 F2): niente nomi che siano substring di label del form.',
  '- Playwright MCP ROTTO qui: verifica UI interattiva con script @playwright/test throwaway in /tmp (MAI playwright install; browser in ~/.cache/ms-playwright). Cancella gli script prima del commit.',
  '- Gates: SOLO npm run gates (MAI i 4 comandi verbosi separati). Lockfile (non dovrebbe servire): SOLO npx -y npm@10.',
  '- NESSUNA env var nuova, NESSUNA migrazione DB.',
  '- Utenti seed: admin@/staff@/pilot@/instructor@/student@airmanager.local (password in SEED_ADMIN_PASSWORD di .env — MAI copiarla in documenti o codice).',
  '',
  '== ANTI-RUNWAY (obbligatorio) ==',
  '1) COMMITTA l implementazione APPENA npm run gates passa, PRIMA della verifica e2e completa. Fix successivi = commit successivi.',
  '2) OGNI run e2e in FOREGROUND: MAI background, MAI Monitor.',
  '3) Non lasciare processi orfani (fuser -k 3000/tcp a fine lavoro).',
  '',
  '== COMMIT ==',
  '- Staging ESPLICITO dei soli file della story (MAI git add -A: churn untracked deliberata nel repo — .agents/, .claude/skills/*, .github/hooks e skills, skills-lock.json, .claude/workflows/ — NON committarla).',
  '- Commit implementazione: feat(12.12): panoramica reale + landing per ruolo. Eventuali fix: fix(12.12): ...',
  '- Nel commit dell impl includi lo story file aggiornato: Dev Agent Record (Completion Notes, File List, Change Log) compilato e Status: review.',
  '- Ogni commit termina con: Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>',
  '- MAI push.',
  '',
  '== VERIFICA MINIMA PRIMA DEL REPORT ==',
  '- npm run gates verde (unit inclusi).',
  '- Spec e2e toccati/nuovi verdi in locale con --retries=2 (la full suite CI=1 su build prod la fara il reviewer). Gli spec delle pagine toccate cross-story (bookings, fleet) DEVONO restare verdi.',
  '- Verifica UI interattiva delle 3 facce (console admin/staff, landing pilota E allievo, landing istruttore) in ENTRAMBI i temi.',
  '',
  '== REPORT FINALE ==',
  'Compila lo StructuredOutput. Nelle deviations elenca OGNI omissione o scostamento dagli AC (mai tacere nulla). In notesForReview dai al reviewer Opus i punti da attaccare.',
].join('\n')

const report = await agent(prompt, {
  agentType: 'dev-story',
  model: 'sonnet',
  effort: 'xhigh',
  label: 'dev:12.12',
  schema: REPORT_SCHEMA,
})

return report