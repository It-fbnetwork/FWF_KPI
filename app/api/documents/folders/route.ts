import { NextResponse } from "next/server";
import { createFolderRecord, getFoldersData } from "@/lib/server/data";
import { getSessionUserId } from "@/lib/server/session";

export async function GET() {
  const sessionUserId = await getSessionUserId();
  const folders = await getFoldersData(sessionUserId);
  return NextResponse.json({ folders });
}

export async function POST(request: Request) {
  try {
    const sessionUserId = await getSessionUserId();
    const { name, parentId } = await request.json();
    const folder = await createFolderRecord(sessionUserId, { name, parentId });
    return NextResponse.json({ ok: true, folder });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create folder.";
    const status = message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
