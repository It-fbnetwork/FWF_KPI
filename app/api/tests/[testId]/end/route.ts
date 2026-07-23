import { NextResponse } from "next/server";
import { endTestRecordByUser } from "@/lib/server/data";
import { getSessionUserId } from "@/lib/server/session";

function getErrorStatus(error: unknown) {
  if (!(error instanceof Error)) return 500;
  if (error.message === "Unauthorized") return 401;
  if (error.message === "Forbidden") return 403;
  if (error.message.includes("kết thúc")) return 409;
  return 500;
}

export async function POST(_request: Request, context: { params: Promise<{ testId: string }> }) {
  try {
    const sessionUserId = await getSessionUserId();
    const { testId } = await context.params;
    const session = await endTestRecordByUser(sessionUserId, testId);
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to end test." },
      { status: getErrorStatus(error) }
    );
  }
}
