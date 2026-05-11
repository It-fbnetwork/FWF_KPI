#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "Missing MONGODB_URI env"
  exit 1
fi

DB_NAME="${MONGODB_DB:-fwf_kpi}"
OUT_DIR="${1:-./migration_export/raw}"
mkdir -p "$OUT_DIR"

collections=(
  users
  people
  company_teams
  workspace_teams
  tasks
  documents
  document_folders
  learning_quizzes
  quiz_attempts
  learning_progress
  chat_threads
  chat_messages
  schedules
  tests
  person_notifications
  pending_registrations
  pending_login_otps
  role_approval_requests
  uploads.files
  uploads.chunks
)

echo "Export MongoDB ($DB_NAME) -> $OUT_DIR"
for col in "${collections[@]}"; do
  file_name="${col//./_}.json"
  echo "  - $col -> $file_name"
  mongoexport \
    --uri="$MONGODB_URI" \
    --db="$DB_NAME" \
    --collection="$col" \
    --jsonArray \
    --out="$OUT_DIR/$file_name"
done

echo "Export done."
