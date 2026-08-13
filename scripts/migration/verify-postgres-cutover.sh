#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${RAILWAY_DATABASE_URL:-}" ]]; then
  echo "Missing RAILWAY_DATABASE_URL env" >&2
  exit 1
fi

tables=(
  users
  people
  company_teams
  workspace_teams
  tasks
  schedules
  documents
  document_folders
  uploads_files
  uploads_blobs
  tests
  learning_quizzes
  quiz_attempts
  learning_progress
  chat_threads
  chat_messages
  person_notifications
  pending_login_otps
  pending_registrations
  role_approval_requests
)

for table in "${tables[@]}"; do
  count="$(psql "$RAILWAY_DATABASE_URL" -t -A -c "select count(*) from ${table};")"
  printf "%-28s %s\n" "$table" "$count"
done

psql "$RAILWAY_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
select 'uploads_blobs_without_storage_or_data' as check_name, count(*) as count
from uploads_blobs
where coalesce(octet_length(data), 0) = 0
  and not (metadata ? 'storage');

select 'uploads_blobs_not_external_storage' as check_name, count(*) as count
from uploads_blobs
where metadata ? 'storage'
  and metadata #>> '{storage,provider}' not in ('r2', 'volume');

select 'documents_missing_url' as check_name, count(*) as count
from documents
where coalesce(url, '') = '';
SQL
