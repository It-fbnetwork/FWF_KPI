import { NextResponse } from "next/server";
import { deleteFolderRecord, updateFolderRecord } from "@/lib/server/data";
import { getSessionUserId } from "@/lib/server/session";

export async function PATCH(request: Request, { params }: { params: Promise<{ folderId: string }> }) {
  try {
    const sessionUserId = await getSessionUserId();
    const { folderId } = await params;
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name : undefined;
    const parentId = body && Object.prototype.hasOwnProperty.call(body, "parentId")
      ? (body.parentId as string | null | undefined)
      : undefined;
    const folder = await updateFolderRecord(sessionUserId, folderId, { name, parentId });
    if (!folder) {
      return NextResponse.json({ ok: false, message: "Folder not found or forbidden." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, folder });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update folder.";
    const status =
      message === "Unauthorized"
        ? 401
        : message.includes("Database chưa cập nhật cột parent_id")
          ? 400
          : 403;
    return NextResponse.json({ ok: false, message }, { status });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ folderId: string }> }) {
  try {
    const sessionUserId = await getSessionUserId();
    const { folderId } = await params;
    const ok = await deleteFolderRecord(sessionUserId, folderId);
    return NextResponse.json({ ok });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete folder.";
    const status = message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
