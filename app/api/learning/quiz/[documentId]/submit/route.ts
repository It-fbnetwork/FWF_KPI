import { NextResponse } from "next/server";
import { getAuthState, getDocumentRealtimeAudience, submitQuizAttempt } from "@/lib/server/data";
import { publishAppEventToPersons } from "@/lib/server/realtime";
import { getSessionUserId } from "@/lib/server/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    const sessionUserId = await getSessionUserId();
    const body = (await request.json()) as {
      answers: number[];
      textAnswers?: string[];
      startedAt: string;
    };
    const result = await submitQuizAttempt(
      sessionUserId,
      documentId,
      body.answers,
      body.startedAt,
      body.textAnswers ?? []
    );
    const [authState, audience] = await Promise.all([getAuthState(sessionUserId), getDocumentRealtimeAudience(documentId)]);
    void publishAppEventToPersons(audience.personIds, {
      type: "learning.updated",
      actorId: authState.user?.personId ?? result.personId,
      action: "updated",
      entityType: "learning_progress",
      entityLabel: audience.documentName,
      entityId: result.id,
      occurredAt: new Date().toISOString()
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json(
      { ok: false, message: msg },
      { status: msg === "Unauthorized" ? 401 : 400 }
    );
  }
}
