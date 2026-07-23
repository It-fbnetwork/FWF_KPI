import { NextResponse } from "next/server";
import { resetTestForPerson } from "@/lib/server/data";
import { getSessionUserId } from "@/lib/server/session";

function getErrorStatus(error: unknown) {
  if (!(error instanceof Error)) return 500;
  if (error.message === "Unauthorized") return 401;
  if (error.message === "Forbidden") return 403;
  if (error.message.includes("Không tìm thấy")) return 404;
  return 500;
}

export async function POST(request: Request, context: { params: Promise<{ testId: string }> }) {
  try {
    const sessionUserId = await getSessionUserId();
    const { testId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { personId?: string };
    const personId = body.personId?.trim();
    if (!personId) {
      return NextResponse.json(
        { ok: false, message: "Thiếu nhân viên cần reset." },
        { status: 400 }
      );
    }

    const result = await resetTestForPerson(sessionUserId, testId, personId);
    return NextResponse.json({ ok: true, ...result, personId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to reset test." },
      { status: getErrorStatus(error) }
    );
  }
}
