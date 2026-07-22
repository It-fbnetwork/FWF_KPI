import { NextResponse } from "next/server";
import { submitTestRecord } from "@/lib/server/data";
import { getSessionUserId } from "@/lib/server/session";

function getErrorStatus(error: unknown) {
  if (!(error instanceof Error)) return 500;
  if (error.message === "Unauthorized") return 401;
  if (error.message === "Forbidden") return 403;
  return 500;
}

export async function POST(request: Request, context: { params: Promise<{ testId: string }> }) {
  try {
    const sessionUserId = await getSessionUserId();
    const { testId } = await context.params;
    const body = await request.json();
    const submission = await submitTestRecord(sessionUserId, testId, body);
    return NextResponse.json({ ok: true, submission });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to submit test." },
      { status: getErrorStatus(error) }
    );
  }
}
