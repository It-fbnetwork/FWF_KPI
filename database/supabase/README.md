# Supabase Migration Runbook (FWF_KPI)

Runbook này giúp chuyển toàn bộ dữ liệu từ MongoDB sang Supabase Postgres theo quy trình an toàn.

## 1) Chuẩn bị

Yêu cầu local:
- `mongosh` + `mongoexport`
- `psql`
- `node >= 18`

Biến môi trường:

```bash
export MONGODB_URI='mongodb+srv://...'
export MONGODB_DB='fwf_kpi'
export SUPABASE_DB_URL='postgresql://postgres:...@db.xxx.supabase.co:5432/postgres?sslmode=require'
```

## 2) Export dữ liệu từ Mongo

```bash
./scripts/migration/mongo-export.sh ./migration_export/raw
```

Output: `./migration_export/raw/*.json`

## 3) Transform sang CSV cho Postgres

```bash
node ./scripts/migration/transform-for-supabase.js ./migration_export/raw ./migration_export/sql
```

Output:
- `./migration_export/sql/*.csv`
- `./migration_export/sql/manifest.json`

## 4) Tạo schema + import vào Supabase

```bash
./scripts/migration/import-to-supabase.sh ./database/supabase ./migration_export/sql
```

Script sẽ:
- apply `schema.sql`
- `TRUNCATE` từng bảng
- `\copy` dữ liệu từ CSV

## 5) Verify đối soát số lượng

```bash
./scripts/migration/verify-migration.sh ./migration_export/sql
```

Mỗi bảng sẽ có `expected` (từ manifest transform) và `actual` (từ Postgres).

## 6) GridFS files (quan trọng)

`transform/import` chỉ migrate metadata `uploads.files` vào `uploads_files`.

Để migrate dữ liệu nhị phân file (nội dung thật), chạy thêm bước Phase B:

```bash
node ./scripts/migration/migrate-gridfs-to-supabase.js
# hoặc:
# npm run migrate:gridfs:to:supabase
```

Script sẽ:
1. đọc file từ Mongo GridFS (`uploads.files` + `uploads.chunks`)
2. ghi vào bảng Postgres `uploads_blobs` (id giữ nguyên theo GridFS ObjectId string)
3. `upsert` để có thể chạy lại an toàn

Vì URL tài liệu đang dùng dạng `/api/files/<fileId>`, giữ nguyên `fileId` giúp app hoạt động ngay sau cutover mà không cần đổi link tài liệu cũ.

## 7) Cutover production (khuyến nghị)

1. Freeze ghi MongoDB ngắn hạn.
2. Chạy lại export + transform + import + verify lần cuối (delta).
3. Chuyển app sang DB mới bằng env.
4. Smoke test theo role: admin/trainer/store_manager/store_lead/store_technician.
5. Giữ rollback plan về MongoDB trong 7-14 ngày.

### Supabase-only mode (khuyến nghị sau cutover)

Sau khi đã verify đầy đủ, có thể bật chế độ chỉ dùng Supabase:

```bash
DATA_PROVIDER=supabase-only
SUPABASE_DB_URL=postgresql://...
```

Khi bật mode này, mọi call còn sót tới MongoDB sẽ fail-fast với lỗi rõ ràng để bạn dọn nốt dependency Mongo an toàn.

## 8) Lưu ý mapping

- `id` trong Postgres giữ nguyên Mongo `_id` để không gãy quan hệ.
- Trường phức tạp (`tags`, `learning_plan`, `questions`, `working_hours`, ...) lưu `jsonb`.
- Mỗi bảng có `raw_json` để đảm bảo không mất dữ liệu gốc khi cần đối soát.
- Với Phase B, bảng `uploads_blobs` lưu binary bằng `bytea` để API `/api/files/[fileId]` có thể phục vụ file trực tiếp từ Supabase/Postgres.
