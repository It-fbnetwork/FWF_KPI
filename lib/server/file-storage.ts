import { pgQuery } from "@/lib/postgres";
import { GridFSBucket, MongoClient, ObjectId } from "mongodb";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type StoredFile = {
  fileId: string;
  filename: string;
  contentType: string;
  size: number;
};

export type StorageProvider = "r2" | "volume";

export type StorageRef = {
  provider: StorageProvider;
  bucket: string;
  path: string;
};

type LoadedFile = StoredFile & {
  buffer: Buffer;
};

export type StoredFileRecord = StoredFile & {
  storage: StorageRef | null;
  metadata: Record<string, unknown>;
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

export function getR2StorageConfig() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const endpoint =
    process.env.R2_ENDPOINT?.trim().replace(/\/+$/, "") ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { endpoint, accessKeyId, secretAccessKey, bucket };
}

function requireR2StorageConfig() {
  const config = getR2StorageConfig();
  if (!config) throw new Error("Cloudflare R2 chưa được cấu hình");
  return config;
}

function getStorageProvider(): StorageProvider {
  const provider = (process.env.FILE_STORAGE_DRIVER ?? process.env.STORAGE_PROVIDER ?? "r2").trim().toLowerCase();
  return provider === "volume" ? "volume" : "r2";
}

function getVolumeStorageRoot() {
  const configured =
    process.env.VOLUME_STORAGE_PATH?.trim() ||
    (process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim()
      ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH.trim(), "uploads")
      : "");
  return path.resolve(configured || path.join(process.cwd(), ".data", "uploads"));
}

function getVolumeStorageConfig() {
  return {
    bucket: process.env.VOLUME_STORAGE_BUCKET?.trim() || "railway-volume",
    root: getVolumeStorageRoot(),
  };
}

export function buildStorageObjectPath(fileId: string, filename: string) {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `documents/${yyyy}/${mm}/${fileId}-${safeName}`;
}

function resolveVolumeObjectPath(objectPath: string) {
  const root = getVolumeStorageRoot();
  const resolved = path.resolve(root, objectPath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Đường dẫn file volume không hợp lệ");
  }
  return resolved;
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hashHex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function encodeRfc3986(input: string) {
  return encodeURIComponent(input).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function toCanonicalQuery(params: URLSearchParams) {
  return [...params.entries()]
    .sort(([aKey, aValue], [bKey, bValue]) => {
      const keyCompare = encodeRfc3986(aKey).localeCompare(encodeRfc3986(bKey));
      if (keyCompare !== 0) return keyCompare;
      return encodeRfc3986(aValue).localeCompare(encodeRfc3986(bValue));
    })
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
}

function createR2PresignedUrl(input: {
  method: "GET" | "PUT" | "HEAD";
  bucket: string;
  objectPath: string;
  contentType?: string;
  expiresSeconds?: number;
  responseContentDisposition?: string;
  responseContentType?: string;
}) {
  const config = requireR2StorageConfig();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const host = new URL(config.endpoint).host;
  const encodedPath = `/${encodeRfc3986(input.bucket)}/${input.objectPath.split("/").map(encodeRfc3986).join("/")}`;
  const signedHeaders = input.contentType ? "content-type;host" : "host";
  const expires = String(Math.min(Math.max(input.expiresSeconds ?? 300, 60), 604800));
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": expires,
    "X-Amz-SignedHeaders": signedHeaders,
  });
  if (input.responseContentDisposition) {
    query.set("response-content-disposition", input.responseContentDisposition);
  }
  if (input.responseContentType) {
    query.set("response-content-type", input.responseContentType);
  }

  const canonicalHeaders = input.contentType
    ? `content-type:${input.contentType}\nhost:${host}\n`
    : `host:${host}\n`;
  const canonicalRequest = [
    input.method,
    encodedPath,
    toCanonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    hashHex(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), region), service), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  query.set("X-Amz-Signature", signature);
  return `${config.endpoint}${encodedPath}?${toCanonicalQuery(query)}`;
}

export async function createStorageUploadUrl(input: {
  fileId: string;
  filename: string;
  contentType: string;
}) {
  if (getStorageProvider() === "volume") {
    const config = getVolumeStorageConfig();
    const objectPath = buildStorageObjectPath(input.fileId, input.filename);
    return {
      provider: "volume" as const,
      bucket: config.bucket,
      objectPath,
      uploadUrl: `/api/documents/upload/volume/${encodeURIComponent(input.fileId)}`,
    };
  }

  const config = requireR2StorageConfig();
  const objectPath = buildStorageObjectPath(input.fileId, input.filename);
  return {
    provider: "r2" as const,
    bucket: config.bucket,
    objectPath,
    uploadUrl: createR2PresignedUrl({
      method: "PUT",
      bucket: config.bucket,
      objectPath,
      contentType: input.contentType,
    }),
  };
}

export function createStorageDownloadUrl(input: {
  storage: StorageRef;
  filename: string;
  contentType: string;
  expiresSeconds?: number;
}) {
  if (input.storage.provider !== "r2") {
    throw new Error("Railway Volume không hỗ trợ presigned download URL");
  }

  const safeAsciiName = input.filename
    .replace(/[^\x20-\x7E]+/g, "_")
    .replace(/["\\]/g, "_")
    .trim() || "file";
  const encodedUnicodeName = encodeURIComponent(input.filename)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
  return createR2PresignedUrl({
    method: "GET",
    bucket: input.storage.bucket,
    objectPath: input.storage.path,
    expiresSeconds: input.expiresSeconds ?? 300,
    responseContentType: input.contentType,
    responseContentDisposition: `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodedUnicodeName}`,
  });
}

export async function headStorageObject(storage: StorageRef) {
  if (storage.provider === "volume") {
    try {
      const fileStat = await stat(resolveVolumeObjectPath(storage.path));
      return {
        size: fileStat.size,
        contentType: null,
        etag: null,
      };
    } catch {
      return null;
    }
  }

  const headUrl = createR2PresignedUrl({
    method: "HEAD",
    bucket: storage.bucket,
    objectPath: storage.path,
    expiresSeconds: 300,
  });
  const response = await fetch(headUrl, { method: "HEAD", cache: "no-store" });
  if (!response.ok) return null;
  const sizeHeader = response.headers.get("content-length");
  return {
    size: sizeHeader ? Number(sizeHeader) : null,
    contentType: response.headers.get("content-type"),
    etag: response.headers.get("etag"),
  };
}

export async function verifyUploadedStorageObject(input: {
  storage: StorageRef;
  expectedSize?: number;
  expectedContentType?: string;
}) {
  const meta = await headStorageObject(input.storage);
  if (!meta) {
    throw new Error("Không tìm thấy file trên storage sau khi upload");
  }
  if (
    typeof input.expectedSize === "number" &&
    input.expectedSize >= 0 &&
    typeof meta.size === "number" &&
    meta.size !== input.expectedSize
  ) {
    throw new Error(`Kích thước file storage không khớp (${meta.size} != ${input.expectedSize})`);
  }
  const actualType = meta.contentType?.split(";")[0]?.trim().toLowerCase();
  const expectedType = input.expectedContentType?.split(";")[0]?.trim().toLowerCase();
  if (actualType && expectedType && actualType !== expectedType) {
    throw new Error(`Content-Type file storage không khớp (${actualType} != ${expectedType})`);
  }
  return meta;
}

export async function writeBufferToStorage(
  fileId: string,
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<StorageRef> {
  if (getStorageProvider() === "volume") {
    const config = getVolumeStorageConfig();
    const objectPath = buildStorageObjectPath(fileId, filename);
    const filePath = resolveVolumeObjectPath(objectPath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return {
      provider: "volume",
      bucket: config.bucket,
      path: objectPath,
    };
  }

  return uploadBufferToR2Storage(fileId, filename, buffer, contentType);
}

async function uploadBufferToR2Storage(
  fileId: string,
  filename: string,
  buffer: Buffer,
  contentType: string
) {
  const config = requireR2StorageConfig();
  const objectPath = buildStorageObjectPath(fileId, filename);
  const uploadUrl = createR2PresignedUrl({
    method: "PUT",
    bucket: config.bucket,
    objectPath,
    contentType,
  });
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": contentType,
    },
    body: buffer,
  });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    throw new Error(`R2 upload failed (${uploadResponse.status}): ${detail || uploadResponse.statusText}`);
  }

  const storage = {
    provider: "r2" as const,
    bucket: config.bucket,
    path: objectPath,
  };
  await verifyUploadedStorageObject({
    storage,
    expectedSize: buffer.length,
    expectedContentType: contentType,
  });
  return storage;
}

export async function saveStorageReference(
  input: StoredFile & {
    storage: StorageRef;
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

export async function downloadStorageBuffer(storage: StorageRef): Promise<Buffer | null> {
  if (storage.provider === "volume") {
    try {
      return await readFile(resolveVolumeObjectPath(storage.path));
    } catch {
      return null;
    }
  }

  const readUrl = createR2PresignedUrl({
    method: "GET",
    bucket: storage.bucket,
    objectPath: storage.path,
    expiresSeconds: 300,
  });
  const readResponse = await fetch(readUrl, { cache: "no-store" });
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
  const storageRef = await writeBufferToStorage(fileId, filename, buffer, contentType);
  const metadataWithStorage = {
    ...(metadata ?? {}),
    uploadedAt: new Date().toISOString(),
    storage: storageRef,
    dbBlobStored: false,
  };

  await pgQuery(
    `insert into uploads_blobs (id, filename, content_type, size, data, metadata)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [fileId, filename, contentType, buffer.length, Buffer.alloc(0), JSON.stringify(metadataWithStorage)]
  );
  return {
    fileId,
    filename,
    contentType,
    size: buffer.length,
  };
}

function parseStorageRef(metadata: Record<string, unknown> | null): StorageRef | null {
  const storage = (metadata && typeof metadata === "object"
    ? (metadata as { storage?: { provider?: string; bucket?: string; path?: string } })
    : null)?.storage;
  if ((storage?.provider === "r2" || storage?.provider === "volume") && storage.bucket && storage.path) {
    return {
      provider: storage.provider,
      bucket: storage.bucket,
      path: storage.path,
    };
  }
  return null;
}

export async function getFileRecordById(fileId: string): Promise<StoredFileRecord | null> {
  await ensurePgStorageTable();
  const result = await pgQuery<{
    id: string;
    filename: string;
    content_type: string;
    size: number;
    metadata: Record<string, unknown> | null;
  }>(
    `select id, filename, content_type, size, metadata
     from uploads_blobs
     where id = $1
     limit 1`,
    [fileId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    fileId: row.id,
    filename: row.filename,
    contentType: row.content_type,
    size: Number(row.size),
    storage: parseStorageRef(metadata),
    metadata,
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
  const storage = parseStorageRef(row.metadata);
  if (storage) {
    const storageBuffer = await downloadStorageBuffer(storage);
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
