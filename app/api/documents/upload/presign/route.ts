import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSessionUserId } from "@/lib/server/session";
import { buildSupabaseStorageObjectPath, getSupabaseStorageConfig } from "@/lib/server/file-storage";

function inferMimeType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/octet-stream";
}

export async function POST(request: Request) {
  try {
    await getSessionUserId();
    const body = (await request.json()) as {
      filename?: string;
      contentType?: string;
      size?: number;
    };

    const filename = (body.filename ?? "").trim();
    if (!filename) {
      return NextResponse.json({ ok: false, message: "Thiếu tên file" }, { status: 400 });
    }

    const config = getSupabaseStorageConfig();
    if (!config) {
      return NextResponse.json({ ok: false, message: "Supabase Storage chưa được cấu hình" }, { status: 500 });
    }

    const fileId = `f_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const objectPath = buildSupabaseStorageObjectPath(fileId, filename);
    const objectPathEncoded = objectPath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    const signUrl = `${config.baseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(config.bucket)}/${objectPathEncoded}`;
    const signResponse = await fetch(signUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ upsert: true }),
    });

    if (!signResponse.ok) {
      const detail = await signResponse.text().catch(() => "");
      return NextResponse.json(
        { ok: false, message: `Không thể tạo URL upload (${signResponse.status}): ${detail || signResponse.statusText}` },
        { status: 500 }
      );
    }

    const signedPayload = (await signResponse.json()) as {
      token?: string;
      signedURL?: string;
      path?: string;
    };

    let uploadUrl = signedPayload.signedURL ?? "";
    if (!uploadUrl) {
      const token = signedPayload.token;
      if (!token) {
        return NextResponse.json({ ok: false, message: "Phản hồi signed URL không hợp lệ" }, { status: 500 });
      }
      uploadUrl = `${config.baseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(config.bucket)}/${objectPathEncoded}?token=${encodeURIComponent(token)}`;
    } else if (uploadUrl.startsWith("/")) {
      uploadUrl = `${config.baseUrl}${uploadUrl}`;
    }

    return NextResponse.json({
      ok: true,
      fileId,
      objectPath,
      bucket: config.bucket,
      uploadUrl,
      contentType: body.contentType || inferMimeType(filename),
      size: Number(body.size ?? 0),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể chuẩn bị upload";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
