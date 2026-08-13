import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSessionUserId } from "@/lib/server/session";
import { createStorageUploadUrl } from "@/lib/server/file-storage";

function inferMimeType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
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

    const fileId = `f_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const contentType = body.contentType || inferMimeType(filename);
    const upload = await createStorageUploadUrl({ fileId, filename, contentType });

    return NextResponse.json({
      ok: true,
      fileId,
      provider: upload.provider,
      objectPath: upload.objectPath,
      bucket: upload.bucket,
      uploadUrl: upload.uploadUrl,
      contentType,
      size: Number(body.size ?? 0),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể chuẩn bị upload";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
