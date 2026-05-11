import { pgQuery } from "@/lib/postgres";
import { GridFSBucket, MongoClient, ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";

type StoredFile = {
  fileId: string;
  filename: string;
  contentType: string;
  size: number;
};

export type SupabaseStorageRef = {
  provider: "supabase-storage";
  bucket: string;
  path: string;
};

type LoadedFile = StoredFile & {
  buffer: Buffer;
};

declare global {
  // eslint-disable-next-line no-var
  var __fwfLegacyMongoFileClient__: Promise<MongoClient> | undefined;
}

async function ensurePgStorageTable() {
  await pgQuery(`
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

export function getSupabaseStorageConfig() {
  const baseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "documents";
  if (!baseUrl || !serviceRoleKey) return null;
  return { baseUrl, serviceRoleKey, bucket };
}

export function buildSupabaseStorageObjectPath(fileId: string, filename: string) {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${new Date().getUTCFullYear()}/${new Date().getUTCMonth() + 1}/${fileId}-${safeName}`;
}

async function uploadBufferToSupabaseStorage(
  fileId: string,
  filename: string,
  buffer: Buffer,
  contentType: string
) {
  const config = getSupabaseStorageConfig();
  if (!config) return null;

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = `${new Date().getUTCFullYear()}/${new Date().getUTCMonth() + 1}/${fileId}-${safeName}`;
  const objectPathEncoded = objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const uploadUrl = `${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${objectPathEncoded}`;
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
      "x-upsert": "true",
      "content-type": contentType,
    },
    body: buffer,
  });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    throw new Error(`Supabase Storage upload failed (${uploadResponse.status}): ${detail || uploadResponse.statusText}`);
  }

  return {
    provider: "supabase-storage" as const,
    bucket: config.bucket,
    path: objectPath,
  };
}

export async function saveSupabaseStorageReference(
  input: StoredFile & {
    storage: SupabaseStorageRef;
    metadata?: Record<string, unknown>;
  }
) {
  await ensurePgStorageTable();
  const mergedMetadata = {
    ...(input.metadata ?? {}),
    uploadedAt: new Date().toISOString(),
    storage: input.storage,
    dbBlobStored: false,
  };
  await pgQuery(
    `insert into uploads_blobs (id, filename, content_type, size, data, metadata)
     values ($1, $2, $3, $4, $5, $6::jsonb)
     on conflict (id) do update set
       filename = excluded.filename,
       content_type = excluded.content_type,
       size = excluded.size,
       data = excluded.data,
       metadata = excluded.metadata`,
    [input.fileId, input.filename, input.contentType, input.size, Buffer.alloc(0), JSON.stringify(mergedMetadata)]
  );
}

async function downloadBufferFromSupabaseStorage(bucket: string, objectPath: string): Promise<Buffer | null> {
  const config = getSupabaseStorageConfig();
  if (!config) return null;
  const objectPathEncoded = objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const readUrl = `${config.baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPathEncoded}`;
  const readResponse = await fetch(readUrl, {
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
    },
    cache: "no-store",
  });
  if (!readResponse.ok) return null;
  const bytes = await readResponse.arrayBuffer();
  return Buffer.from(bytes);
}

export async function saveFileBuffer(
  filename: string,
  buffer: Buffer,
  contentType: string,
  metadata?: Record<string, unknown>
): Promise<StoredFile> {
  await ensurePgStorageTable();
  const fileId = `f_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const mergedMetadata = {
    ...(metadata ?? {}),
    uploadedAt: new Date().toISOString(),
  } as Record<string, unknown>;

  let storageRef: { provider: "supabase-storage"; bucket: string; path: string } | null = null;
  try {
    storageRef = await uploadBufferToSupabaseStorage(fileId, filename, buffer, contentType);
  } catch (error) {
    // Soft fallback to Postgres bytea if Storage is not configured/available.
    console.error("Supabase storage upload failed, fallback to DB blob:", error);
  }

  // Keep DB fallback for small files; skip duplicate blob for large files to speed up upload.
  const fallbackMaxBytes = Number(process.env.UPLOAD_DB_FALLBACK_MAX_BYTES ?? `${5 * 1024 * 1024}`);
  const shouldStoreDbBlob = !storageRef || buffer.length <= fallbackMaxBytes;
  const storedBuffer = shouldStoreDbBlob ? buffer : Buffer.alloc(0);
  const metadataWithStorage = storageRef
    ? { ...mergedMetadata, storage: storageRef, dbBlobStored: shouldStoreDbBlob }
    : mergedMetadata;

  await pgQuery(
    `insert into uploads_blobs (id, filename, content_type, size, data, metadata)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [fileId, filename, contentType, buffer.length, storedBuffer, JSON.stringify(metadataWithStorage)]
  );
  return {
    fileId,
    filename,
    contentType,
    size: buffer.length,
  };
}

export async function getFileById(fileId: string): Promise<LoadedFile | null> {
  await ensurePgStorageTable();
  const result = await pgQuery<{
    id: string;
    filename: string;
    content_type: string;
    size: number;
    data: Buffer;
    metadata: Record<string, unknown> | null;
  }>(
    `select id, filename, content_type, size, data, metadata
     from uploads_blobs
     where id = $1
     limit 1`,
    [fileId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const storageMeta = (row.metadata && typeof row.metadata === "object"
    ? (row.metadata as { storage?: { provider?: string; bucket?: string; path?: string } })
    : null)?.storage;
  if (storageMeta?.provider === "supabase-storage" && storageMeta.bucket && storageMeta.path) {
    const storageBuffer = await downloadBufferFromSupabaseStorage(storageMeta.bucket, storageMeta.path);
    if (storageBuffer) {
      return {
        fileId: row.id,
        filename: row.filename,
        contentType: row.content_type,
        size: Number(row.size),
        buffer: storageBuffer,
      };
    }
  }
  if (!row.data || row.data.length === 0) {
    return null;
  }

  return {
    fileId: row.id,
    filename: row.filename,
    contentType: row.content_type,
    size: Number(row.size),
    buffer: row.data,
  };
}

async function getLegacyMongoFileById(fileId: string): Promise<LoadedFile | null> {
  const mongoUri = process.env.MONGODB_URI ?? process.env.MONGO_URI;
  const mongoDbName = process.env.MONGODB_DB ?? "fwf_kpi";
  if (!mongoUri || !ObjectId.isValid(fileId)) return null;

  if (!global.__fwfLegacyMongoFileClient__) {
    global.__fwfLegacyMongoFileClient__ = new MongoClient(mongoUri).connect();
  }

  const client = await global.__fwfLegacyMongoFileClient__;
  const db = client.db(mongoDbName);
  const filesCollection = db.collection<{
    _id: ObjectId;
    filename: string;
    length: number;
    contentType?: string;
    metadata?: { contentType?: string };
  }>("uploads.files");

  const fileMeta = await filesCollection.findOne({ _id: new ObjectId(fileId) });
  if (!fileMeta) return null;

  const bucket = new GridFSBucket(db, { bucketName: "uploads" });
  const stream = bucket.openDownloadStream(fileMeta._id);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });

  return {
    fileId: fileMeta._id.toHexString(),
    filename: fileMeta.filename,
    contentType: fileMeta.contentType ?? fileMeta.metadata?.contentType ?? "application/octet-stream",
    size: Number(fileMeta.length ?? 0),
    buffer: Buffer.concat(chunks),
  };
}

export async function getFileByApiUrl(url?: string): Promise<LoadedFile | null> {
  if (!url) return null;
  const fileId = url.match(/\/api\/files\/([^/?#]+)/)?.[1];
  if (!fileId) return null;
  return getFileByIdWithFallback(fileId);
}

export async function getFileByIdWithFallback(fileId: string): Promise<LoadedFile | null> {
  const file = await getFileById(fileId);
  if (file) return file;
  return getLegacyMongoFileById(fileId);
}
