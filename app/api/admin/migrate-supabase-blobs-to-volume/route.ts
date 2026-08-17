import { NextResponse } from "next/server";
import { Pool } from "pg";
import { saveStorageReference, writeBufferToStorage } from "@/lib/server/file-storage";

export const maxDuration = 300;

function normalizeSupabaseDbUrl(value: string) {
  const url = new URL(value);
  url.searchParams.delete("uselibpqcompat");
  if (!url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "require");
  return url.toString();
}

function getMigrationToken(request: Request) {
  const expected = process.env.MIGRATION_ADMIN_TOKEN?.trim();
  if (!expected) return null;
  const actual = request.headers.get("x-migration-token")?.trim();
  return actual && actual === expected ? actual : null;
}

export async function POST(request: Request) {
  if (!getMigrationToken(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const supabaseDbUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!supabaseDbUrl) {
    return NextResponse.json({ ok: false, message: "Missing SUPABASE_DB_URL" }, { status: 400 });
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
           order by created_at asc
           limit $1`,
          [limit]
        );

    const migrated: Array<{ id: string; filename: string; size: number; objectPath: string }> = [];
    const failed: Array<{ id: string; message: string }> = [];

    for (const item of listResult.rows) {
      try {
        const blobResult = await sourcePool.query<{
          id: string;
          filename: string;
          content_type: string;
          size: number;
          data: Buffer | null;
          metadata: Record<string, unknown> | null;
        }>(
          `select id, filename, content_type, size, data, metadata
           from public.uploads_blobs
           where id = $1
           limit 1`,
          [item.id]
        );
        const row = blobResult.rows[0];
        if (!row?.data || row.data.length === 0) {
          failed.push({ id: item.id, message: "Missing blob data in Supabase" });
          continue;
        }

        const storage = await writeBufferToStorage(row.id, row.filename, row.data, row.content_type);
        await saveStorageReference({
          fileId: row.id,
          filename: row.filename,
          contentType: row.content_type,
          size: Number(row.size || row.data.length),
          storage,
          metadata: {
            ...(row.metadata ?? {}),
            migratedFrom: "supabase.uploads_blobs",
          },
        });

        migrated.push({
          id: row.id,
          filename: row.filename,
          size: Number(row.size || row.data.length),
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
}
