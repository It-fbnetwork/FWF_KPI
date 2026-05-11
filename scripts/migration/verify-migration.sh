#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Missing SUPABASE_DB_URL env"
  exit 1
fi

DATA_DIR="${1:-./migration_export/sql}"
MANIFEST="$DATA_DIR/manifest.json"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Manifest not found: $MANIFEST"
  exit 1
fi

node -e '
const fs = require("fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
for (const s of manifest.summaries) {
  process.stdout.write(`${s.table}|${s.output}\n`);
}
' "$MANIFEST" | while IFS='|' read -r table expected; do
  actual=$(psql "$SUPABASE_DB_URL" -t -A -c "SELECT count(*) FROM $table;")
  if [[ "$actual" == "$expected" ]]; then
    echo "OK   $table expected=$expected actual=$actual"
  else
    echo "FAIL $table expected=$expected actual=$actual"
  fi
done
