#!/usr/bin/env bash
# Quiet quality gates for agent sessions: buffers each gate's output and
# prints a single PASS line per gate, or the log tail on failure.
# Full logs are kept under /tmp/airmanager-gates/ for inspection.
set -u
cd "$(dirname "$0")/.."
LOG_DIR="${TMPDIR:-/tmp}/airmanager-gates"
mkdir -p "$LOG_DIR"
FAIL=0

run() {
  local name="$1"; shift
  local log="$LOG_DIR/$name.log"
  local start=$SECONDS
  if "$@" >"$log" 2>&1; then
    local extra
    extra="$(grep -Eo 'Tests[[:space:]]+[0-9]+ passed[^[:cntrl:]]*' "$log" | tail -1)"
    echo "PASS  $name ($((SECONDS - start))s)${extra:+ — $extra}"
  else
    echo "FAIL  $name ($((SECONDS - start))s) — last 100 lines (full log: $log):"
    tail -100 "$log"
    FAIL=1
  fi
}

run lint      npm run -s lint
run typecheck npm run -s typecheck
run test      npm run -s test:quiet
# NODE_ENV from .env breaks `next build` in this repo — always unset it (see HANDOFF).
run build     env -u NODE_ENV npx next build
exit $FAIL
