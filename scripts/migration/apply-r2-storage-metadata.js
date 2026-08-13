#!/usr/bin/env node
const { createHash, createHmac } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const { Pool } = require("pg");

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} env`);
  }
  return value;
}

function encodeRfc3986(input) {
  return encodeURIComponent(input).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function toCanonicalQuery(params) {
  return [...params.entries()]
    .sort(([aKey, aValue], [bKey, bValue]) => {
      const keyCompare = encodeRfc3986(aKey).localeCompare(encodeRfc3986(bKey));
      if (keyCompare !== 0) return keyCompare;
      return encodeRfc3986(aValue).localeCompare(encodeRfc3986(bValue));
    })
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function hashHex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function createR2HeadUrl({ endpoint, accessKeyId, secretAccessKey, bucket, objectPath }) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const host = new URL(endpoint).host;
  const encodedPath = `/${encodeRfc3986(bucket)}/${objectPath.split("/").map(encodeRfc3986).join("/")}`;
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": "300",
    "X-Amz-SignedHeaders": "host",
  });
  const canonicalRequest = [
    "HEAD",
    encodedPath,
    toCanonicalQuery(query),
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    hashHex(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  query.set("X-Amz-Signature", signature);
  return `${endpoint}${encodedPath}?${toCanonicalQuery(query)}`;
}

async function ensureLogTable(pool) {
  await pool.query(`
    create table if not exists storage_migration_log (
      file_id text primary key,
      old_provider text,
      old_bucket text,
      old_path text,
      new_provider text not null default 'r2',
      new_bucket text not null,
      new_path text not null,
      size bigint,
      checksum text,
      status text not null,
      attempt_count integer not null default 0,
      error_message text,
      migrated_at timestamptz,
      verified_at timestamptz,
      updated_at timestamptz not null default now()
    );
  `);
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    throw new Error("Usage: node scripts/migration/apply-r2-storage-metadata.js <manifest.json>");
  }

  const databaseUrl = requireEnv("DATABASE_URL");
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const endpoint = (process.env.R2_ENDPOINT?.trim().replace(/\/+$/, "")) ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  if (!endpoint) throw new Error("Missing R2_ENDPOINT or R2_ACCOUNT_ID env");

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(manifest)) {
    throw new Error("Manifest must be a JSON array");
  }

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await ensureLogTable(pool);

  let updated = 0;
  let failed = 0;
  try {
    for (const item of manifest) {
      const fileId = String(item.file_id ?? item.fileId ?? "").trim();
      const newBucket = String(item.new_bucket ?? item.bucket ?? "").trim();
      const newPath = String(item.new_path ?? item.path ?? "").trim();
      const expectedSize = Number(item.size ?? -1);
      const checksum = item.checksum ? String(item.checksum) : null;
      if (!fileId || !newBucket || !newPath) {
        throw new Error(`Invalid manifest item: ${JSON.stringify(item)}`);
      }

      const client = await pool.connect();
      try {
        await client.query("begin");
        const rowResult = await client.query(
          `select metadata
           from uploads_blobs
           where id = $1
           for update`,
          [fileId]
        );
        const row = rowResult.rows[0];
        if (!row) {
          throw new Error(`Missing uploads_blobs row for ${fileId}`);
        }
        const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
        const oldStorage = metadata.storage && typeof metadata.storage === "object" ? metadata.storage : {};

        await client.query(
          `insert into storage_migration_log (
             file_id, old_provider, old_bucket, old_path, new_provider, new_bucket,
             new_path, size, checksum, status, attempt_count, updated_at
           )
           values ($1, $2, $3, $4, 'r2', $5, $6, $7, $8, 'pending', 1, now())
           on conflict (file_id) do update set
             attempt_count = storage_migration_log.attempt_count + 1,
             new_bucket = excluded.new_bucket,
             new_path = excluded.new_path,
             size = excluded.size,
             checksum = excluded.checksum,
             status = 'pending',
             error_message = null,
             updated_at = now()`,
          [
            fileId,
            oldStorage.provider ?? null,
            oldStorage.bucket ?? null,
            oldStorage.path ?? null,
            newBucket,
            newPath,
            Number.isFinite(expectedSize) && expectedSize >= 0 ? expectedSize : null,
            checksum,
          ]
        );

        const headUrl = createR2HeadUrl({
          endpoint,
          accessKeyId,
          secretAccessKey,
          bucket: newBucket,
          objectPath: newPath,
        });
        const headResponse = await fetch(headUrl, { method: "HEAD" });
        if (!headResponse.ok) {
          throw new Error(`R2 HEAD failed ${headResponse.status}`);
        }
        const actualSize = Number(headResponse.headers.get("content-length") ?? "-1");
        if (Number.isFinite(expectedSize) && expectedSize >= 0 && actualSize !== expectedSize) {
          throw new Error(`R2 size mismatch ${actualSize} != ${expectedSize}`);
        }

        const nextMetadata = {
          ...metadata,
          storage: {
            provider: "r2",
            bucket: newBucket,
            path: newPath,
          },
          dbBlobStored: false,
          storageMigratedAt: new Date().toISOString(),
        };
        await client.query(
          `update uploads_blobs
           set metadata = $2::jsonb,
               data = $3
           where id = $1`,
          [fileId, JSON.stringify(nextMetadata), Buffer.alloc(0)]
        );
        await client.query(
          `update storage_migration_log
           set status = 'metadata_updated',
               migrated_at = coalesce(migrated_at, now()),
               verified_at = now(),
               error_message = null,
               updated_at = now()
           where file_id = $1`,
          [fileId]
        );
        await client.query("commit");
        updated += 1;
      } catch (error) {
        await client.query("rollback").catch(() => {});
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        await pool.query(
          `insert into storage_migration_log (
             file_id, new_provider, new_bucket, new_path, size, checksum,
             status, attempt_count, error_message, updated_at
           )
           values ($1, 'r2', $2, $3, $4, $5, 'failed', 1, $6, now())
           on conflict (file_id) do update set
             status = 'failed',
             attempt_count = storage_migration_log.attempt_count + 1,
             error_message = excluded.error_message,
             updated_at = now()`,
          [
            fileId,
            newBucket,
            newPath,
            Number.isFinite(expectedSize) && expectedSize >= 0 ? expectedSize : null,
            checksum,
            message,
          ]
        );
        console.error(`[failed] ${fileId}: ${message}`);
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }

  console.log(`R2 metadata migration done. updated=${updated} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
