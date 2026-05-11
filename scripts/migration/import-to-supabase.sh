#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Missing SUPABASE_DB_URL env"
  exit 1
fi

SQL_DIR="${1:-./database/supabase}"
DATA_DIR="${2:-./migration_export/sql}"

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$SQL_DIR/schema.sql"

copy_table() {
  local table="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    echo "Skip $table (file not found: $file)"
    return
  fi
  echo "Import $table from $file"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c "TRUNCATE TABLE $table RESTART IDENTITY CASCADE;"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c "\\copy $table FROM '$file' WITH (FORMAT csv, HEADER true)"
}

copy_table users "$DATA_DIR/users.csv"
copy_table people "$DATA_DIR/people.csv"
copy_table company_teams "$DATA_DIR/company_teams.csv"
copy_table workspace_teams "$DATA_DIR/workspace_teams.csv"
copy_table tasks "$DATA_DIR/tasks.csv"
copy_table document_folders "$DATA_DIR/document_folders.csv"
copy_table documents "$DATA_DIR/documents.csv"
copy_table learning_quizzes "$DATA_DIR/learning_quizzes.csv"
copy_table quiz_attempts "$DATA_DIR/quiz_attempts.csv"
copy_table learning_progress "$DATA_DIR/learning_progress.csv"
copy_table chat_threads "$DATA_DIR/chat_threads.csv"
copy_table chat_messages "$DATA_DIR/chat_messages.csv"
copy_table schedules "$DATA_DIR/schedules.csv"
copy_table tests "$DATA_DIR/tests.csv"
copy_table person_notifications "$DATA_DIR/person_notifications.csv"
copy_table pending_registrations "$DATA_DIR/pending_registrations.csv"
copy_table pending_login_otps "$DATA_DIR/pending_login_otps.csv"
copy_table role_approval_requests "$DATA_DIR/role_approval_requests.csv"
copy_table uploads_files "$DATA_DIR/uploads_files.csv"

echo "Import completed."
