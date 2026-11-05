#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${APP_URL:-${NEXT_PUBLIC_APP_URL:-http://127.0.0.1:3000}}"
BASE_URL="${BASE_URL%/}"

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "Missing CRON_SECRET" >&2
  exit 1
fi

curl -fsS -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  "${BASE_URL}/api/cron/quiz-deadline-reminders"
