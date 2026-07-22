import { NextResponse } from "next/server";
import { deleteTestRecord, updateTestRecord } from "@/lib/server/data";
import { getSessionUserId } from "@/lib/server/session";

function getErrorStatus(error: unknown) {
  if (!(error instanceof Error)) return 500;
  if (error.message === "Unauthorized") return 401;
  if (error.message === "Forbidden") return 403;
  return 500;
}

export async function PATCH(request: Request, context: { params: Promise<{ testId: string }> }) {
  try {
    const sessionUserId = await getSessionUserId();
    const { testId } = await context.params;
    const body = await request.json();
    const test = await updateTestRecord(sessionUserId, testId, body);
    return NextResponse.json({ ok: true, test });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to update test." },
      { status: getErrorStatus(error) }
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ testId: string }> }) {
  try {
    const sessionUserId = await getSessionUserId();
    const { testId } = await context.params;
    await deleteTestRecord(sessionUserId, testId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to delete test." },
      { status: getErrorStatus(error) }
    );
  }
}
