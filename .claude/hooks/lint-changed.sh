#!/bin/bash
# PostToolUse hook (Edit|Write): lints the just-edited src/ TypeScript file
# and feeds errors straight back to the agent (exit 2). Silent on success.
set -u
cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
[ -x node_modules/.bin/eslint ] || exit 0

FILE=$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).tool_input?.file_path||"")}catch{}})')
case "$FILE" in
  "$PWD"/src/*.ts | "$PWD"/src/*.tsx | src/*.ts | src/*.tsx) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0

if OUT=$(node_modules/.bin/eslint --cache --cache-location /tmp/airmanager-eslint-cache --no-warn-ignored "$FILE" 2>&1); then
  exit 0
fi
echo "$OUT" >&2
exit 2
