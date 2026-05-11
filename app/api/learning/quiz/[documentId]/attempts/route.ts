import { NextResponse } from "next/server";
import { getAuthState, getMyQuizAttempt, getTeamQuizAttempts, resetQuizAttemptForPerson } from "@/lib/server/data";
import { publishAppEventToPersons } from "@/lib/server/realtime";
import { getSessionUserId } from "@/lib/server/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    const sessionUserId = await getSessionUserId();
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");

    if (scope === "team") {
      const attempts = await getTeamQuizAttempts(sessionUserId, documentId);
      return NextResponse.json({ attempts });
    }

    const attempt = await getMyQuizAttempt(sessionUserId, documentId);
    return NextResponse.json({ attempt });
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

    const resetResult = await resetQuizAttemptForPerson(sessionUserId, { documentId, personId });
    const authState = await getAuthState(sessionUserId);
    void publishAppEventToPersons([personId], {
      type: "learning.updated",
      actorId: authState.user?.personId ?? "system",
      action: "updated",
      entityType: "quiz",
      entityId: documentId,
      entityLabel: `Kết quả bài kiểm tra "${resetResult.documentName}" của bạn đã được reset. Bạn có thể làm lại.`,
      occurredAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, deleted: resetResult.deleted });
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
