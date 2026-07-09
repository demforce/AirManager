#!/usr/bin/env bash
# Reset the dev database to a clean seeded state: drop + create + migrate +
# seed. Used by the MAIN session before dev and review runs (process rule).
# Quiet: one result line; full log in /tmp/airmanager-reset-db.log
set -u
cd "$(dirname "$0")/.."
LOG=/tmp/airmanager-reset-db.log
: >"$LOG"

step() {
  local name="$1"
  shift
  if ! "$@" >>"$LOG" 2>&1; then
    echo "DB reset FAILED at $name — log: $LOG, tail:"
    tail -20 "$LOG"
    exit 1
  fi
}

step drop sudo -u postgres psql -c "DROP DATABASE IF EXISTS airmanager WITH (FORCE);"
step create sudo -u postgres createdb -O airmanager airmanager
step migrate npx prisma migrate deploy
step seed npx prisma db seed
echo "DB reset OK (drop + create + migrate + seed)."
