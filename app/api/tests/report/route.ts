import { NextResponse } from "next/server";
import { getTestReport } from "@/lib/server/data";
import { getSessionUserId } from "@/lib/server/session";

export async function GET() {
  try {
    const sessionUserId = await getSessionUserId();
    const rows = await getTestReport(sessionUserId);
    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json(
      { ok: false, message },
      { status: message === "Unauthorized" ? 401 : 403 }
    );
  }
}
