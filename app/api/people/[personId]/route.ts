import { NextResponse } from "next/server";
import { deletePersonRecord, getAllRealtimePersonIds, getAuthState, updatePersonRecord } from "@/lib/server/data";
import { publishAppEventToPersons } from "@/lib/server/realtime";
import { getSessionUserId } from "@/lib/server/session";

type RouteContext = {
  params: Promise<{ personId: string }>;
};

function getMutationErrorStatus(error: unknown) {
  if (!(error instanceof Error)) return 400;
  if (error.message === "Unauthorized") return 401;
  if (error.message === "Forbidden") return 403;
  return 400;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const sessionUserId = await getSessionUserId();
    const body = await request.json();
    const { personId } = await context.params;
    const person = await updatePersonRecord(sessionUserId, personId, body);

    if (!person) {
      return NextResponse.json({ ok: false, message: "Person not found." }, { status: 404 });
    }

    const [authState, recipients] = await Promise.all([getAuthState(sessionUserId), getAllRealtimePersonIds()]);
    void publishAppEventToPersons(recipients, {
      type: "directory.updated",
      actorId: authState.user?.personId ?? person.id,
      action: "updated",
      entityType: "person",
      entityLabel: person.name,
      entityId: person.id,
      targetPersonIds: [person.id],
      occurredAt: new Date().toISOString()
    });

    return NextResponse.json({ ok: true, person });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to update person." },
      { status: getMutationErrorStatus(error) }
    );
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const sessionUserId = await getSessionUserId();
    const { personId } = await context.params;
    const deleted = await deletePersonRecord(sessionUserId, personId);

    if (!deleted) {
      return NextResponse.json({ ok: false, message: "Person not found." }, { status: 404 });
    }

    const [authState, recipients] = await Promise.all([getAuthState(sessionUserId), getAllRealtimePersonIds()]);
    void publishAppEventToPersons(recipients, {
      type: "directory.updated",
      actorId: authState.user?.personId ?? personId,
      action: "deleted",
      entityType: "person",
      entityId: personId,
      targetPersonIds: [personId],
      occurredAt: new Date().toISOString()
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to delete person." },
      { status: getMutationErrorStatus(error) }
    );
  }
}
