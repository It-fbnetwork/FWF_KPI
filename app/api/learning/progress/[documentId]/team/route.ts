import { NextResponse } from "next/server";
import { getAuthState, getTeamLearningStatusesForDocument, resetLearningProgressForPerson } from "@/lib/server/data";
import { publishAppEventToPersons } from "@/lib/server/realtime";
import { getSessionUserId } from "@/lib/server/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    const sessionUserId = await getSessionUserId();
    const rows = await getTeamLearningStatusesForDocument(sessionUserId, documentId);
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json(
      { ok: false, message: msg },
      { status: msg === "Unauthorized" ? 401 : 403 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    const sessionUserId = await getSessionUserId();
    const body = (await request.json()) as { personId?: string };
    const personId = body.personId?.trim() ?? "";
    if (!personId) {
      return NextResponse.json({ ok: false, message: "Thiếu personId." }, { status: 400 });
    }

    const resetResult = await resetLearningProgressForPerson(sessionUserId, { documentId, personId });
    const authState = await getAuthState(sessionUserId);
    void publishAppEventToPersons([personId], {
      type: "learning.updated",
      actorId: authState.user?.personId ?? "system",
      action: "updated",
      entityType: "learning_progress",
      entityId: documentId,
      entityLabel: `Tiến độ học "${resetResult.documentName}" của bạn đã được reset. Bạn cần học lại từ đầu.`,
      occurredAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      deletedProgress: resetResult.deletedProgress,
      resetQuizAttempt: resetResult.resetQuizAttempt,
      resetAt: resetResult.resetAt,
      personId,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json(
      { ok: false, message: msg },
      {
        status:
          msg === "Unauthorized"
            ? 401
            : msg === "Not found"
              ? 404
              : msg === "Thiếu personId."
                ? 400
                : 403,
      }
    );
  }
}
