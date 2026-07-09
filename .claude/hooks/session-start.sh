#!/bin/bash
# SessionStart hook: bootstraps the AirManager dev environment in a fresh
# Claude Code on the web container (deps, .env, PostgreSQL, migrations,
# Mailpit, git identity). Idempotent — safe to re-run manually:
#   AIRMANAGER_BOOTSTRAP_FORCE=1 bash .claude/hooks/session-start.sh
# Prints a short summary to context; full log in /tmp/airmanager-bootstrap.log
set -u

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ] && [ "${AIRMANAGER_BOOTSTRAP_FORCE:-}" != "1" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
LOG=/tmp/airmanager-bootstrap.log
: >"$LOG"
STATUS=()
fail() {
  echo "Bootstrap FAILED at $1 — full log: $LOG, tail:"
  tail -20 "$LOG"
  exit 0
}

# 1. Dependencies (npm install so the cached container state is reused;
#    postinstall runs `prisma generate`).
if [ ! -d node_modules ]; then
  npm install >>"$LOG" 2>&1 || fail deps
fi
STATUS+=("deps OK")

# 2. .env from the template, with a real AUTH_SECRET.
if [ ! -f .env ]; then
  sed "s/replace-with-a-random-32-byte-secret/$(openssl rand -hex 32)/" .env.example >.env || fail env
fi
STATUS+=(".env OK")

# 3. PostgreSQL 16 (system service in the container) + role/db.
if ! pg_isready -q -h localhost 2>>"$LOG"; then
  service postgresql start >>"$LOG" 2>&1 || fail postgres-start
  for _ in $(seq 1 30); do pg_isready -q -h localhost 2>>"$LOG" && break; sleep 1; done
fi
pg_isready -q -h localhost 2>>"$LOG" || fail postgres-ready
FRESH_DB=0
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='airmanager'" 2>>"$LOG" | grep -q 1; then
  sudo -u postgres psql -c "CREATE ROLE airmanager LOGIN PASSWORD 'airmanager' CREATEDB;" >>"$LOG" 2>&1 || fail postgres-role
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='airmanager'" 2>>"$LOG" | grep -q 1; then
  sudo -u postgres createdb -O airmanager airmanager >>"$LOG" 2>&1 || fail postgres-db
  FRESH_DB=1
fi
STATUS+=("postgres OK")

# 4. Prisma client + migrations; seed only when the DB was just created.
#    generate runs unconditionally: node_modules may predate a branch switch
#    that changed schema.prisma (stale client = undefined model delegates).
npx prisma generate >>"$LOG" 2>&1 || fail prisma-generate
npx prisma migrate deploy >>"$LOG" 2>&1 || fail migrations
if [ "$FRESH_DB" = 1 ]; then
  npx prisma db seed >>"$LOG" 2>&1 || fail seed
  STATUS+=("migrations+seed OK")
else
  STATUS+=("migrations OK")
fi

# 5. Mailpit (best-effort — never fails the bootstrap).
MAILPIT_BIN="$(command -v mailpit || true)"
[ -z "$MAILPIT_BIN" ] && [ -x /root/go/bin/mailpit ] && MAILPIT_BIN=/root/go/bin/mailpit
if [ -z "$MAILPIT_BIN" ] && command -v go >/dev/null 2>&1; then
  go install github.com/axllent/mailpit@latest >>"$LOG" 2>&1 && MAILPIT_BIN=/root/go/bin/mailpit
fi
if [ -n "$MAILPIT_BIN" ]; then
  if ! (exec 3<>/dev/tcp/127.0.0.1/1025) 2>/dev/null; then
    nohup "$MAILPIT_BIN" --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 >>"$LOG" 2>&1 &
  fi
  STATUS+=("mailpit OK")
else
  STATUS+=("mailpit MISSING (go install failed, see log)")
fi

# 6. CodeGraph index (best-effort trial — never fails the bootstrap).
#    Pinned version; the MCP server in .mcp.json runs `codegraph serve --mcp`.
if ! command -v codegraph >/dev/null 2>&1; then
  npm i -g @colbymchenry/codegraph@1.3.1 >>"$LOG" 2>&1 && codegraph telemetry off >>"$LOG" 2>&1
fi
if command -v codegraph >/dev/null 2>&1; then
  if codegraph sync >>"$LOG" 2>&1 || codegraph init >>"$LOG" 2>&1; then
    STATUS+=("codegraph OK")
  else
    STATUS+=("codegraph FAILED (non-blocking, see log)")
  fi
else
  STATUS+=("codegraph MISSING (install failed, non-blocking)")
fi

# 7. Git identity (subagent commits are amended + reset-author per process).
git config user.email >/dev/null 2>&1 || git config user.email noreply@anthropic.com
git config user.name >/dev/null 2>&1 || git config user.name Claude

SUMMARY=$(printf '%s, ' "${STATUS[@]}")
echo "Bootstrap: ${SUMMARY%, }."
echo "Leggere docs/handoffs/HANDOFF.md (stato sessione live) prima di iniziare."
