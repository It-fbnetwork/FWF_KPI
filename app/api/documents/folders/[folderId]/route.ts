import { NextResponse } from "next/server";
import { deleteFolderRecord, updateFolderRecord } from "@/lib/server/data";
import { getSessionUserId } from "@/lib/server/session";

export async function PATCH(request: Request, { params }: { params: Promise<{ folderId: string }> }) {
  try {
    const sessionUserId = await getSessionUserId();
    const { folderId } = await params;
    const { name } = await request.json();
    const folder = await updateFolderRecord(sessionUserId, folderId, { name });
    if (!folder) {
      return NextResponse.json({ ok: false, message: "Folder not found or forbidden." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, folder });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update folder.";
    const status = message === "Unauthorized" ? 401 : 403;
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
