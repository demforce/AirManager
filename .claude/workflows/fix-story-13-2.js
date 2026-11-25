export const meta = {
  name: 'fix-story-13-2',
  description: 'Fix-subagent (Sonnet 5 xhigh): findings review 13.2 (F1/F2) + decisione PO F3 (quota fuori dai chip)',
  phases: [{ title: 'Fix 13.2' }],
}
phase('Fix 13.2')
const REPORT_SCHEMA = {
  type: 'object',
  required: ['status', 'summary', 'commitShas', 'gates', 'fullSuite', 'notes'],
  properties: {
    status: { type: 'string', enum: ['done', 'blocked', 'partial'] },
    summary: { type: 'string' },
    commitShas: { type: 'array', items: { type: 'string' } },
    gates: { type: 'string' },
    fullSuite: { type: 'string', description: 'esito CI=1 npx playwright test su build prod DOPO i fix (numeri verbatim)' },
    notes: { type: 'array', items: { type: 'string' } },
  },
}
const report = await agent(`Sei il fix-subagent della story 13.2 di AirManager (repo /home/admin/AirManager, branch epic-13-ui-feedback, HEAD 2e46e14). Applichi i findings della review adversarial + 1 decisione PO ratificata. Leggi PRIMA: lo story file /home/admin/AirManager/_bmad-output/implementation-artifacts/13-2-piloti-ui-form-unico.md e .claude/skills/karpathy-guidelines/SKILL.md (vincolante: modifiche chirurgiche, ogni riga riconducibile al fix). Story UI: applica anche design-taste-frontend + ui-ux-pro-max per la coerenza AirOps.

DB già fresco (migrate+seed ora). Ambiente: Fedora locale, Postgres/Mailpit docker compose, MAI playwright install, MAI push, porta 3000 libera prima delle e2e (fuser -k 3000/tcp), e2e SOLO foreground, nessuna dipendenza nuova. RUNWAY: committa APPENA i gates passano; la full suite va DOPO il commit. Verifica interattiva: prova i tool mcp__playwright__* (server via Docker); se non raggiungibili dalla tua sessione, fallback = script @playwright/test throwaway in /tmp, cancellati prima del commit.

=== BATCH DI FIX (in quest'ordine) ===

[F1 minor] NewPersonForm (src/app/[locale]/dashboard/pilots/pilot-editor.tsx): una selezione rating/medical SOPRAVVIVE alla deselezione del profilo che la abilitava, resta in \`selections\` e viene inviata nell'array \`expiries\` al submit → il server risponde 422 SCOPE_MISMATCH (dati salvi, atomico) ma l'utente vede un errore generico SENZA il chip visibile per correggere. FIX: alla variazione dei flag profilo, POTA da \`selections\` ogni expiryTypeId non più presente in ratingChips∪medicalChips (oppure costruisci l'array \`expiries\` del submit SOLO dai chip attualmente visibili/selezionati). Così il client non spedisce mai una selezione che il suo stesso filtro d'ambito nasconderebbe — allineato ad assertScopeCompatible server-side. Verifica LIVE: seleziona Pilota+chip rating con data, deseleziona Pilota, submit → NESSUN errore, persona creata senza quell'expiry.

[F3 note → DECISIONE PO 2026-07-24: escludi la quota dai chip] La "Quota associativa" (kind=RATING scope=ALL) compare tra i chip Ratings di piloti E istruttori ed è editabile/eliminabile inline: è un'obbligazione finanziaria, NON un'abilitazione di volo. FIX: escludila dal catalogo chip SIA nel NewPersonForm SIA nel LiveExpiryEditor (src/components/dashboard/expiry-editor.tsx), riusando l'identificazione ESISTENTE del tipo quota = costante \`MEMBERSHIP_FEE_TYPE_NAME = 'Quota associativa'\` in src/server/services/membership.service.ts:8 (esportala se serve, o esponi un helper condiviso; NON inventare un nuovo match per nome — riusa quella costante, stessa robustezza della feature quota esistente). La quota resta gestita SOLO dalla card quota in Impostazioni + flusso di addebito (invariati). NON aggiungere migrazioni né un terzo \`kind\` (fuori scope). Se l'esclusione è più pulita lato API (filtro sul GET /api/v1/expiry-types usato dai chip), valuta ma resta chirurgico; altrimenti filtro client-side va bene. Attenzione: una quota GIÀ registrata su una persona deve continuare a essere VISIBILE nella pagina Scadenze (non toccare quella superficie) — l'esclusione riguarda SOLO i chip di aggiunta/gestione nell'editor persona/istruttore.

[F2 minor] Copertura e2e mancante (lezione 12.6 omissioni silenziose). Aggiungi e2e (in e2e/people-management.spec.ts o file adiacente, selettori scoped/exact, MAI hasText con date/H:MM) per i percorsi verificati funzionanti ma non protetti in CI: (a) 'modifica data' inline di un'expiry esistente (PATCH); (b) aggiunta di un Rating nell'editor ISTRUTTORE (AC5/gap N6); (c) blocco client 'data obbligatoria' su un chip selezionato senza data (submit bloccato, nessuna POST); (d) create multi-profilo (allievo+istruttore insieme). Dopo il fix F3, aggiungi anche un assert che la 'Quota associativa' NON compaia tra i chip Ratings (regressione-guard della decisione PO).

=== STORY FILE ===
Nel story file 13-2: (1) appendi "## Review Record (adversarial, Opus 4.8 xhigh — 2026-07-24)" con: verdetto shippable-with-fixes; priorità zero VERDE 236/236 e2e CI-mode build prod (8.3m, 0 flake) + vitest 1443 + tsc/eslint puliti; findings F1 (minor, selezione orfana → FIXATO potatura), F2 (minor, buchi e2e → AGGIUNTI test), F3 (nota → DECISIONE PO: quota esclusa dai chip, FIXATO); chiusura note dev N1 (atomicità CONFORME salvo F1), N2/N3 (→F2), N4 (regressioni CONFORME), N5 (chip unificati ACCETTATA). (2) Aggiungi in coda al Dev Agent Record una sottosezione "Fix post-review (2026-07-24)". (3) Status: resta 'review' (lo chiude la sessione principale).

Commit: fix(13.2): review F1-F3 (potatura selezioni orfane, quota fuori dai chip, e2e AC2/AC5) — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>. DOPO il commit: DB fresco (docker compose down -v && up -d && sleep 4 && set -a && . ./.env && set +a && npx prisma migrate deploy && npx prisma db seed), porta 3000 libera, FULL SUITE foreground CI=1 npx playwright test su build prod — numeri verbatim in fullSuite. Rossi → fixa (commit successivi) e ri-esegui.

Output finale = report strutturato (status/summary/commitShas/gates/fullSuite/notes). In notes: come hai identificato/escluso la quota, ogni deviazione, e i nuovi e2e aggiunti.`, { agentType: 'dev-story', effort: 'xhigh', label: 'fix:13.2', schema: REPORT_SCHEMA })
return report