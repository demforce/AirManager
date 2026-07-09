#!/bin/bash
# SessionStart hook: deterministic CLAUDE.md drift check. Verifies the
# mechanically-checkable claims in CLAUDE.md against the repo and, when stale,
# injects a warning into context so the session fixes the file immediately.
# No LLM, no network — pure filesystem checks. Testable on any file:
#   bash .claude/hooks/claude-md-drift.sh <path-to-md>
set -u
cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
MD="${1:-CLAUDE.md}"
[ -f "$MD" ] || exit 0
DRIFT=()

# 1. Framework version claims vs package.json (the "Next.js 15" failure mode).
if [ -f package.json ]; then
  NEXT_ACTUAL=$(node -p "String(require('./package.json').dependencies?.next ?? '').replace(/^[^0-9]*/, '').split('.')[0]" 2>/dev/null)
  NEXT_CLAIMED=$(grep -oE 'Next\.js [0-9]+' "$MD" | head -1 | grep -oE '[0-9]+')
  if [ -n "${NEXT_ACTUAL:-}" ] && [ -n "${NEXT_CLAIMED:-}" ] && [ "$NEXT_ACTUAL" != "$NEXT_CLAIMED" ]; then
    DRIFT+=("dice 'Next.js $NEXT_CLAIMED' ma package.json ha next $NEXT_ACTUAL")
  fi
fi

# 2. Backtick-quoted repo paths must exist (known prefixes only, to avoid
#    false positives on GitHub slugs like `prisma/docs`).
while IFS= read -r p; do
  [ -e "$p" ] || DRIFT+=("path citato inesistente: $p")
done < <(grep -oE '`[^` ]+`' "$MD" | tr -d '`' |
  grep -E '^(\.claude/|\.github/|\.mcp\.json|docs/|scripts/|_bmad|src/|e2e/|messages/)' | sort -u)

# 3. Every `npm run <script>` mentioned must exist in package.json.
while IFS= read -r s; do
  node -e "process.exit(require('./package.json').scripts?.['$s'] ? 0 : 1)" 2>/dev/null ||
    DRIFT+=("npm script citato inesistente: $s")
done < <(grep -oE 'npm run [a-zA-Z0-9:_-]+' "$MD" | awk '{print $3}' | sort -u)

# 4. Session branch names are forbidden here — they live in HANDOFF.md.
if grep -qE '`claude/[a-z0-9._-]+`' "$MD"; then
  DRIFT+=("contiene nomi di branch claude/* — lo stato branch/PR vive SOLO in docs/handoffs/HANDOFF.md")
fi

if [ "${#DRIFT[@]}" -gt 0 ]; then
  echo "ATTENZIONE — CLAUDE.md è stale (${#DRIFT[@]} problemi rilevati dal drift-check):"
  for d in "${DRIFT[@]}"; do echo "- $d"; done
  echo "Correggere CLAUDE.md in questa sessione (mantenendolo snello) e includere il fix nel prossimo commit."
fi
exit 0
