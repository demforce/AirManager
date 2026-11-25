export const meta = {
  name: 'story-12-2-dev',
  description: 'Dev subagent implements story 12.2 (booking approval workflow backend)',
  phases: [{ title: 'Dev' }],
}
phase('Dev')
const report = await agent(`You are the BMAD dev agent for AirManager (repo: /home/admin/AirManager, branch epic-12-airops-ui — work HERE, no worktree).

Implement EXACTLY ONE story: read the story file
  _bmad-output/implementation-artifacts/12-2-booking-approval-workflow.md
and follow it to the letter. It is self-contained: acceptance criteria, a ratified RBAC decision (students do NOT create bookings — RBAC unchanged), exact file/line recon of the bookings service, migration precedents to copy, email pattern, test conventions, and environment facts for this LOCAL machine.

Process requirements:
- FIRST load these skills via the Skill tool and apply them: 'bmad-dev-story' (on the story file) and 'karpathy-guidelines' (surgical changes, explicit assumptions). This is a BACKEND-only story: no UI work, no design skills needed; the legacy bookings UI must keep working identically.
- TDD: write the transition-matrix unit tests BEFORE the service change (conventions of bookings.service.test.ts: vi.mock prisma, mockTransaction, actor fixtures).
- The migration is HAND-WRITTEN (ALTER TYPE RENAME VALUE + ADD VALUE — copy the doc-comment style of 20260710120000_rename_flight_types_add_solo_flag). Verify it empirically on the FRESH DB (already migrated+seeded for you): if PG16 rejects using a just-added enum value in the same transactional file (e.g. SET DEFAULT 'PENDING'), split into two documented migration files — test, don't assume.
- Reference material: docs/superpowers/specs/2026-07-14-airops-ui-replacement-design.md (D7, §5.1), docs/superpowers/plans/2026-07-14-epic-12-airops-ui.md (Task 2).
- Port 3000 must be free before e2e (fuser -k 3000/tcp). Run locally: e2e/bookings.spec.ts and e2e/api-v1.spec.ts (with your new API-level workflow block; Mailpit API at http://localhost:8025 for the deny-email assert). Known local flake: the FIRST login POST on a cold dev server fails once (pre-existing cold-compile class) — use --retries=2.
- 'npm run gates' MUST pass before the implementation commit. Commit exactly one implementation commit: "feat(12.2): booking approval workflow (PENDING/APPROVED/DENIED/FLOWN/NO_SHOW)" (git identity already configured; do NOT push).
- Fill in the story file's "Dev Agent Record" section and include it in the commit.

Your structured report fields:
- status: done | blocked
- summary: what was built, 5-10 sentences
- commitSha: implementation commit sha (empty if blocked)
- gates: pass/fail per gate + e2e specs run and results
- filesChanged: created/modified/deleted paths
- notesForReview: doubts, shortcuts, anything the adversarial reviewer should attack
- deviations: deviations from the story file with reasons`, {
  label: 'dev:12.2',
  agentType: 'dev-story',
  effort: 'xhigh',
  schema: {
    type: 'object',
    required: ['status', 'summary', 'commitSha', 'gates', 'filesChanged', 'notesForReview', 'deviations'],
    properties: {
      status: { type: 'string', enum: ['done', 'blocked'] },
      summary: { type: 'string' },
      commitSha: { type: 'string' },
      gates: { type: 'string' },
      filesChanged: { type: 'array', items: { type: 'string' } },
      notesForReview: { type: 'string' },
      deviations: { type: 'string' },
    },
  },
})
return report