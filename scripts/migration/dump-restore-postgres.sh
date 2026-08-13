#!/usr/bin/env bash
set -euo pipefail

dump_file="${1:-./tmp/fwf_kpi.dump}"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Missing SUPABASE_DB_URL env" >&2
  exit 1
fi

if [[ -z "${RAILWAY_DATABASE_URL:-}" ]]; then
  echo "Missing RAILWAY_DATABASE_URL env" >&2
  exit 1
fi

mkdir -p "$(dirname "$dump_file")"

"${PG_DUMP_BIN:-pg_dump}" "$SUPABASE_DB_URL" \
  --format=custom \
  --schema=public \
  --exclude-table-data=public.uploads_blobs \
  --no-owner \
  --no-acl \
  --file="$dump_file"

"${PG_RESTORE_BIN:-pg_restore}" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --schema=public \
  --exit-on-error \
  --dbname="$RAILWAY_DATABASE_URL" \
  "$dump_file"
