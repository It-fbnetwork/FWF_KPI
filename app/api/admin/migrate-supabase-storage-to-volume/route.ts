import { NextResponse } from "next/server";
import { Pool } from "pg";
import { saveStorageReference, writeBufferToStorage } from "@/lib/server/file-storage";

export const maxDuration = 300;

type SupabaseBlobRow = {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  data: Buffer | null;
  metadata: Record<string, unknown> | null;
};

type StorageMetadata = {
  provider?: string;
  bucket?: string;
  path?: string;
};

function normalizeSupabaseDbUrl(value: string) {
  const url = new URL(value);
  url.searchParams.delete("uselibpqcompat");
  url.searchParams.delete("sslmode");
  return url.toString();
}

function getMigrationToken(request: Request) {
  const expected = process.env.MIGRATION_ADMIN_TOKEN?.trim();
  if (!expected) return null;
  const actual = request.headers.get("x-migration-token")?.trim();
  return actual && actual === expected ? actual : null;
}

function getSupabaseStorageRef(metadata: Record<string, unknown> | null) {
  const storage = (metadata && typeof metadata === "object"
    ? (metadata as { storage?: StorageMetadata }).storage
    : null);
  if (storage?.provider === "supabase-storage" && storage.bucket && storage.path) {
    return {
      bucket: storage.bucket,
      path: storage.path,
    };
  }
  return null;
}

async function downloadSupabaseStorageObject(input: {
  supabaseUrl: string;
  serviceRoleKey: string;
  bucket: string;
  objectPath: string;
}) {
  const baseUrl = input.supabaseUrl.replace(/\/+$/, "");
  const objectPath = input.objectPath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const readUrl = `${baseUrl}/storage/v1/object/${encodeURIComponent(input.bucket)}/${objectPath}`;
  const response = await fetch(readUrl, {
    cache: "no-store",
    headers: {
      authorization: `Bearer ${input.serviceRoleKey}`,
      apikey: input.serviceRoleKey,
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase Storage download failed (${response.status}): ${detail || response.statusText}`);
  }
  const bytes = await response.arrayBuffer();
  return Buffer.from(bytes);
}

export async function POST(request: Request) {
  try {
    if (!getMigrationToken(request)) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const supabaseDbUrl = process.env.SUPABASE_DB_URL?.trim();
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseDbUrl) {
      return NextResponse.json({ ok: false, message: "Missing SUPABASE_DB_URL" }, { status: 400 });
    }
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { ok: false, message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      fileIds?: string[];
      limit?: number;
    };
    const fileIds = Array.isArray(body.fileIds)
      ? body.fileIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    const limit = Number.isFinite(Number(body.limit)) ? Math.max(1, Math.min(Number(body.limit), 20)) : 20;

    const sourcePool = new Pool({
      connectionString: normalizeSupabaseDbUrl(supabaseDbUrl),
      ssl: { rejectUnauthorized: false },
    });

    try {
      const listResult = fileIds.length > 0
        ? await sourcePool.query<{ id: string }>(
            "select id from public.uploads_blobs where id = any($1::text[]) order by created_at asc",
            [fileIds]
          )
        : await sourcePool.query<{ id: string }>(
            `select id
             from public.uploads_blobs
             where metadata->'storage'->>'provider' = 'supabase-storage'
             order by created_at asc
             limit $1`,
            [limit]
          );

      const migrated: Array<{ id: string; filename: string; size: number; objectPath: string }> = [];
      const failed: Array<{ id: string; message: string }> = [];

      for (const item of listResult.rows) {
        try {
          const blobResult = await sourcePool.query<SupabaseBlobRow>(
            `select id, filename, content_type, size, data, metadata
             from public.uploads_blobs
             where id = $1
             limit 1`,
            [item.id]
          );
          const row = blobResult.rows[0];
          if (!row) {
            failed.push({ id: item.id, message: "Missing uploads_blobs row in Supabase" });
            continue;
          }

          const legacyStorage = getSupabaseStorageRef(row.metadata);
          const buffer = row.data && row.data.length > 0
            ? row.data
            : legacyStorage
              ? await downloadSupabaseStorageObject({
                  supabaseUrl,
                  serviceRoleKey,
                  bucket: legacyStorage.bucket,
                  objectPath: legacyStorage.path,
                })
              : null;
          if (!buffer || buffer.length === 0) {
            failed.push({ id: row.id, message: "Missing blob data and Supabase Storage reference" });
            continue;
          }

          const storage = await writeBufferToStorage(row.id, row.filename, buffer, row.content_type);
          await saveStorageReference({
            fileId: row.id,
            filename: row.filename,
            contentType: row.content_type,
            size: Number(row.size || buffer.length),
            storage,
            metadata: {
              ...(row.metadata ?? {}),
              migratedFrom: legacyStorage ? "supabase.storage" : "supabase.uploads_blobs",
              legacyStorage,
            },
          });

          migrated.push({
            id: row.id,
            filename: row.filename,
            size: Number(row.size || buffer.length),
            objectPath: storage.path,
          });
        } catch (error) {
          failed.push({
            id: item.id,
            message: error instanceof Error ? error.message : "Unknown migration error",
          });
        }
      }

      return NextResponse.json({
        ok: failed.length === 0,
        scanned: listResult.rowCount,
        migrated,
        failed,
      });
    } finally {
      await sourcePool.end();
    }
  } catch (error) {
    console.error("[migration:supabase-storage-to-volume] failed", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unknown migration error",
        name: error instanceof Error ? error.name : "Error",
        code: typeof error === "object" && error && "code" in error ? String(error.code) : undefined,
      },
      { status: 500 }
    );
  }
}
