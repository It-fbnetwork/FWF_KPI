#!/usr/bin/env bash
set -euo pipefail

source_remote="${1:-}"
target_remote="${2:-}"
mode="${3:-}"

if [[ -z "$source_remote" || -z "$target_remote" ]]; then
  echo "Usage: $0 <source-remote:path> <target-remote:path> [--dry-run]" >&2
  exit 1
fi

args=(
  copy
  "$source_remote"
  "$target_remote"
  --progress
  --checksum
  --transfers=8
  --checkers=16
)

if [[ "$mode" == "--dry-run" ]]; then
  args+=(--dry-run)
fi

rclone "${args[@]}"

echo
echo "Source summary:"
rclone size "$source_remote"
echo
echo "Target summary:"
rclone size "$target_remote"
