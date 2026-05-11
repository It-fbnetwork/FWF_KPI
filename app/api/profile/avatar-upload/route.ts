import { randomUUID } from "node:crypto";
import { getSessionUserId } from "@/lib/server/session";
import { saveFileBuffer } from "@/lib/server/file-storage";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const sessionUserId = await getSessionUserId();
    if (!sessionUserId) {
      return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, message: "Thiếu file ảnh." }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return Response.json(
        { ok: false, message: "Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc GIF." },
        { status: 400 }
      );
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      return Response.json(
        { ok: false, message: "Ảnh đại diện tối đa 5MB." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
    const safeName = `avatar_${Date.now()}_${randomUUID()}${extension}`;
    const stored = await saveFileBuffer(safeName, buffer, file.type, {
      originalName: file.name,
      category: "avatar",
    });
    const fileId = stored.fileId;
    return Response.json({ ok: true, fileId, url: `/api/files/${fileId}` });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "Upload thất bại." },
      { status: 500 }
    );
  }
}
