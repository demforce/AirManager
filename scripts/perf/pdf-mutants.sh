#!/usr/bin/env bash
# Story 17.7: prove the structural tests reject three isolated layout regressions.
set -euo pipefail
cd "$(dirname "$0")/../.."
scratch="$(mktemp -d src/server/adapters/pdf-mutation.XXXXXX)"
trap 'rm -rf "$scratch"' EXIT
cp src/server/adapters/pdf/document.test.ts "$scratch/document.test.ts"

for mutant in footer header row; do
  cp src/server/adapters/pdf/document.ts "$scratch/document.ts"
  python - "$scratch/document.ts" "$mutant" <<'PY'
from pathlib import Path
import sys
path, mutant = Path(sys.argv[1]), sys.argv[2]
source = path.read_text()
edits = {
  'footer': ('pageLabel(index + 1, pages)', 'pageLabel(index + 1, 1)'),
  'header': ('continuationPage = true;\n    drawTableHeader();\n    // pdfkit', 'continuationPage = true;\n    // pdfkit'),
  'row': ('if (y + height > contentBottom) await addPage();', 'if (false) await addPage();'),
}
old, new = edits[mutant]
if source.count(old) != 1:
  raise SystemExit(f'{mutant}: mutation anchor changed')
path.write_text(source.replace(old, new))
PY
  echo "$mutant source SHA256: $(sha256sum "$scratch/document.ts" | cut -d' ' -f1)"
  log="${TMPDIR:-/tmp}/airmanager-17-7/mutant-$mutant.log"
  set +e
  npx vitest run "$scratch/document.test.ts" --reporter=dot >"$log" 2>&1
  code=$?
  set -e
  echo "$mutant vitest exit: $code"
  grep -E 'FAIL |AssertionError:|Test Files |Tests ' "$log" | head -10 || true
  if [ "$code" -eq 0 ]; then echo "Mutant survived: $mutant" >&2; exit 1; fi
done
