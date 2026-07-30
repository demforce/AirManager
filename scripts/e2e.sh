#!/usr/bin/env bash
# Detached runner for the Playwright e2e suite — `start` / `status` / `stop`.
#
# Why this exists: a full CI=1 run on the production build takes longer than an
# agent's foreground command ceiling. An agent that runs it inline loses the
# result to a timeout, cannot tell a dead run from a slow one, and relaunches
# from scratch — paying another `next build` every time. Backgrounding it in
# the agent's own shell is no better: that job dies with the session.
#
# `start` detaches the run with setsid so it outlives every agent session, and
# takes a lock: a second `start` REPORTS the run in flight instead of spawning
# a duplicate (two suites on one DB and one port corrupt each other's fixtures).
# The last line of the log is always `E2E_EXIT=<code>` — the completion
# sentinel. `status` is the cheap poll; it is the ONLY way to learn how a run
# went. Never re-run the suite to find out.
#
# Usage:
#   scripts/e2e.sh start [playwright args...]   # e.g. start e2e/ppr-queue.spec.ts
#   scripts/e2e.sh status [tail-lines]
#   scripts/e2e.sh stop
#
# The previous run's log is kept as `<log>.prev` — `status` only ever reads the
# current one, so that copy is the only way back to a run you started over.
#
# Env:
#   E2E_REUSE_SERVER=1  reuse a server already listening on :3000 instead of
#                       rebuilding (see playwright.config.ts). Set it when you
#                       have already built and started the production server
#                       once for a series of runs.

set -u
cd "$(dirname "$0")/.."

LOG_DIR="${TMPDIR:-/tmp}/airmanager-e2e"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/last-run.log"
LOCK="$LOG_DIR/run.pid"
ARGS_FILE="$LOG_DIR/last-run.args"

running_pid() {
  [ -f "$LOCK" ] || return 1
  local pid
  pid="$(cat "$LOCK" 2>/dev/null)" || return 1
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  printf '%s' "$pid"
}

# Playwright's own summary lines, whichever the run produced.
summary_lines() {
  grep -aE '^[[:space:]]*[0-9]+ (passed|failed|flaky|skipped|did not run)' "$LOG" 2>/dev/null | tail -6
}

elapsed_of() {
  local pid="$1" secs
  secs="$(ps -o etimes= -p "$pid" 2>/dev/null | tr -d ' ')"
  [ -n "$secs" ] && printf '%dm%02ds' "$((secs / 60))" "$((secs % 60))" || printf '?'
}

cmd_start() {
  local pid
  if pid="$(running_pid)"; then
    echo "ALREADY RUNNING (pid $pid, $(elapsed_of "$pid") elapsed) — args: $(cat "$ARGS_FILE" 2>/dev/null)"
    echo "Do NOT start a second run. Poll with: scripts/e2e.sh status"
    cmd_status 15
    return 0
  fi

  printf '%s\n' "${*:-<full suite>}" >"$ARGS_FILE"
  # Keep the previous run's log instead of truncating over it. A targeted run
  # started right after an arbiter run used to destroy the only evidence of that
  # arbiter run (flagged in the 15.3 review, then re-triggered while closing the
  # story): the summary is unrecoverable, and `status` cannot re-read it.
  [ -s "$LOG" ] && mv -f "$LOG" "$LOG.prev"
  : >"$LOG"

  # setsid detaches the run from this shell's session and process group, so it
  # survives the agent (and the tool call) that started it.
  setsid nohup bash -c '
    exec >>"'"$LOG"'" 2>&1
    echo "=== e2e start: $(date -Is) ==="
    echo "=== args: '"${*:-<full suite>}"' ==="
    CI=1 npx playwright test '"$*"'
    code=$?
    echo "=== e2e end: $(date -Is) ==="
    echo "E2E_EXIT=$code"
  ' >/dev/null 2>&1 &

  echo "$!" >"$LOCK"
  echo "STARTED (pid $(cat "$LOCK")) — log: $LOG"
  echo "Poll with: scripts/e2e.sh status   (do NOT relaunch; the run outlives this session)"
}

cmd_status() {
  local tail_lines="${1:-25}" pid
  echo "log: $LOG"
  [ -f "$ARGS_FILE" ] && echo "args: $(cat "$ARGS_FILE")"

  if pid="$(running_pid)"; then
    echo "state: RUNNING (pid $pid, $(elapsed_of "$pid") elapsed)"
  elif grep -aq '^E2E_EXIT=' "$LOG" 2>/dev/null; then
    echo "state: DONE — $(grep -a '^E2E_EXIT=' "$LOG" | tail -1)"
  elif [ -s "$LOG" ]; then
    # No live pid and no sentinel: the run died without finishing (OOM, reboot,
    # a `stop`). This is a real outcome, not a reason to assume success.
    echo "state: DIED (no sentinel, no live process) — inspect the log before rerunning"
  else
    echo "state: NEVER RUN"
    return 0
  fi

  local summary
  summary="$(summary_lines)"
  [ -n "$summary" ] && { echo "--- summary ---"; echo "$summary"; }
  echo "--- last $tail_lines lines ---"
  tail -n "$tail_lines" "$LOG"
}

cmd_stop() {
  local pid
  if pid="$(running_pid)"; then
    # The suite spawns a webServer and browsers; kill the whole process group
    # setsid created, not just the shell.
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    echo "SIGTERM sent to process group $pid"
  else
    echo "nothing running"
  fi
  rm -f "$LOCK"
}

case "${1:-status}" in
  start) shift; cmd_start "$@" ;;
  status) shift; cmd_status "${1:-25}" ;;
  stop) cmd_stop ;;
  *) echo "usage: scripts/e2e.sh start [playwright args...] | status [tail-lines] | stop" >&2; exit 2 ;;
esac
