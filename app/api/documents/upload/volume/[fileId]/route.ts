import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/server/session";
import { writeBufferToStorage } from "@/lib/server/file-storage";

export const maxDuration = 180;

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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    await getSessionUserId();
    const { fileId } = await params;
    const filename = request.headers.get("x-fwf-filename")?.trim() || fileId;
    const contentType = request.headers.get("content-type")?.trim() || inferMimeType(filename);
    const bytes = await request.arrayBuffer();
    const storage = await writeBufferToStorage(fileId, filename, Buffer.from(bytes), contentType);
    return NextResponse.json({
      ok: true,
      provider: storage.provider,
      bucket: storage.bucket,
      objectPath: storage.path,
      size: bytes.byteLength,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể upload file vào volume";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
