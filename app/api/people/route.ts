import { NextResponse } from "next/server";
import { createPersonRecord, getAllRealtimePersonIds, getAuthState, getDirectory } from "@/lib/server/data";
import { publishAppEventToPersons } from "@/lib/server/realtime";
import { getSessionUserId } from "@/lib/server/session";

function getMutationErrorStatus(error: unknown) {
  if (!(error instanceof Error)) return 400;
  if (error.message === "Unauthorized") return 401;
  if (error.message === "Forbidden") return 403;
  return 400;
}

export async function GET() {
  const payload = await getDirectory();
  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  try {
    const sessionUserId = await getSessionUserId();
    const body = await request.json();
    const person = await createPersonRecord(sessionUserId, body);
    const [authState, recipients] = await Promise.all([getAuthState(sessionUserId), getAllRealtimePersonIds()]);
    void publishAppEventToPersons(recipients, {
      type: "directory.updated",
      actorId: authState.user?.personId ?? person.id,
      action: "created",
      entityType: "person",
      entityLabel: person.name,
      entityId: person.id,
      targetPersonIds: [person.id],
      occurredAt: new Date().toISOString()
    });
    return NextResponse.json({ ok: true, person });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to create person." },
      { status: getMutationErrorStatus(error) }
    );
  }
}
