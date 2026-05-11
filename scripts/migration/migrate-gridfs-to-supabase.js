#!/usr/bin/env node
/* eslint-disable no-console */
const { MongoClient, GridFSBucket, ObjectId } = require("mongodb");
const { Pool } = require("pg");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} env`);
  }
  return value;
}

function normalizeMongoValue(value) {
  if (Array.isArray(value)) return value.map(normalizeMongoValue);
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ObjectId) return value.toString();
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = normalizeMongoValue(v);
  return out;
}

async function ensureUploadsBlobsTable(pool) {
  await pool.query(`
    create table if not exists uploads_blobs (
      id text primary key,
      filename text not null,
      content_type text not null,
      size bigint not null,
      data bytea not null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
}

async function readGridFsFileBuffer(bucket, objectId) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    bucket
      .openDownloadStream(objectId)
      .on("data", (chunk) => chunks.push(chunk))
      .on("error", reject)
      .on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function migrate() {
  const mongoUri = requireEnv("MONGODB_URI");
  const mongoDbName = process.env.MONGODB_DB || "fwf_kpi";
  const supabaseDbUrl = requireEnv("SUPABASE_DB_URL");

  const mongo = new MongoClient(mongoUri);
  const pool = new Pool({ connectionString: supabaseDbUrl, ssl: { rejectUnauthorized: false } });

  try {
    await mongo.connect();
    const db = mongo.db(mongoDbName);
    const bucket = new GridFSBucket(db, { bucketName: "uploads" });
    await ensureUploadsBlobsTable(pool);

    const cursor = db.collection("uploads.files").find({});

    let total = 0;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for await (const fileDoc of cursor) {
      total += 1;
      const objectId = fileDoc._id;
      if (!(objectId instanceof ObjectId)) {
        skipped += 1;
        continue;
      }
      const fileId = objectId.toString();
      const metadata = normalizeMongoValue(fileDoc.metadata || {});
      const contentType = (metadata && metadata.contentType) || "application/octet-stream";
      const filename = String(fileDoc.filename || `file-${fileId}`);
      const createdAt = fileDoc.uploadDate instanceof Date ? fileDoc.uploadDate : new Date();
      const expectedSize = Number(fileDoc.length || 0);

      const buffer = await readGridFsFileBuffer(bucket, objectId);
      if (expectedSize > 0 && buffer.length !== expectedSize) {
        console.warn(`Size mismatch file=${fileId} gridfs=${expectedSize} downloaded=${buffer.length}`);
      }

      const exists = await pool.query("select 1 from uploads_blobs where id = $1 limit 1", [fileId]);
      await pool.query(
        `insert into uploads_blobs (id, filename, content_type, size, data, metadata, created_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7)
         on conflict (id) do update
         set filename = excluded.filename,
             content_type = excluded.content_type,
             size = excluded.size,
             data = excluded.data,
             metadata = excluded.metadata,
             created_at = excluded.created_at`,
        [fileId, filename, contentType, buffer.length, buffer, JSON.stringify(metadata), createdAt.toISOString()]
      );

      if (exists.rowCount > 0) updated += 1;
      else inserted += 1;
      if (total % 25 === 0) {
        console.log(`Progress: ${total} files (inserted=${inserted}, updated=${updated}, skipped=${skipped})`);
      }
    }

    const verifyCount = await pool.query("select count(*)::int as count from uploads_blobs");
    console.log("GridFS -> Supabase uploads_blobs done.");
    console.log(`Total scanned: ${total}`);
    console.log(`Inserted: ${inserted}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Supabase uploads_blobs total rows: ${verifyCount.rows[0]?.count ?? 0}`);
  } finally {
    await pool.end();
    await mongo.close();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
