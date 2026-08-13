# FWF_KPI Railway PostgreSQL + Cloudflare R2 Runbook v2

Mục tiêu production: FWF_KPI dùng Railway PostgreSQL + Cloudflare R2, không còn runtime dependency Supabase.

## Runtime Environment

Server-side only:

```bash
DATABASE_URL='postgresql://...'
DB_POOL_MAX=10
DATA_PROVIDER=railway

R2_ACCOUNT_ID='...'
R2_BUCKET='fwf-kpi-prod'
R2_ACCESS_KEY_ID='...'
R2_SECRET_ACCESS_KEY='...'
R2_ENDPOINT='https://<account_id>.r2.cloudflarestorage.com'

SESSION_SECRET='<32+ bytes random>'
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
```

Production runtime must not include `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or `SUPABASE_STORAGE_BUCKET`.

## Database Migration

Staging first:

```bash
SUPABASE_DB_URL='postgresql://...' \
RAILWAY_DATABASE_URL='postgresql://...' \
./scripts/migration/dump-restore-postgres.sh ./tmp/fwf_kpi.dump
```

After restore:

```bash
RAILWAY_DATABASE_URL='postgresql://...' \
./scripts/migration/verify-postgres-cutover.sh
```

After cutover, app code reads `DATABASE_URL` only.

## Storage Object Copy

Use an S3-compatible tool such as `rclone` to copy the source bucket to R2. The source Supabase credentials are migration-only and must not be configured in production runtime.

Dry run:

```bash
./scripts/migration/copy-storage-to-r2.sh supabase-fwf:FWF_KPI r2-fwf:fwf-kpi-prod --dry-run
```

Copy:

```bash
./scripts/migration/copy-storage-to-r2.sh supabase-fwf:FWF_KPI r2-fwf:fwf-kpi-prod
```

## Storage Metadata Migration

Create a JSON manifest array:

```json
[
  {
    "file_id": "f_...",
    "new_bucket": "fwf-kpi-prod",
    "new_path": "documents/2026/08/f_...-file.pdf",
    "size": 123456,
    "checksum": "optional"
  }
]
```

Apply metadata after objects are copied:

```bash
DATABASE_URL='postgresql://...' \
R2_ACCOUNT_ID='...' \
R2_BUCKET='fwf-kpi-prod' \
R2_ACCESS_KEY_ID='...' \
R2_SECRET_ACCESS_KEY='...' \
node ./scripts/migration/apply-r2-storage-metadata.js ./tmp/r2-storage-manifest.json
```

The script creates and updates `storage_migration_log`, verifies each R2 object with `HEAD`, then updates `uploads_blobs.metadata.storage.provider` to `"r2"`.

## File Serving

`/api/files/[fileId]` authenticates and authorizes in the app, then redirects to a short-lived R2 signed GET URL. The backend no longer buffers large files/videos.

## Zero-Supabase Gate

Pass all checks before pausing/deleting the FWF_KPI Supabase project:

- `DATABASE_URL` points to Railway and app has no `SUPABASE_DB_URL` fallback.
- Production runtime has no `SUPABASE_*` variables.
- `uploads_blobs_not_r2` returns `0`.
- Browser network and production logs show no request to `*.supabase.co`.
- Restore drill has passed using a fresh Railway DB and R2 test location.
- Critical flows pass: OTP, dashboard, task/KPI, learning/test, document upload/download, video seek.

Legacy scripts/docs that mention Supabase are cleanup items if they are not part of runtime/build/deploy.
