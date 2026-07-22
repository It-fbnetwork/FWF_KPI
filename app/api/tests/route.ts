import { NextResponse } from "next/server";
import { createTestRecord, getMyTestSubmissionsData, getTestsData } from "@/lib/server/data";
import { getSessionUserId } from "@/lib/server/session";

function getErrorStatus(error: unknown) {
  if (!(error instanceof Error)) return 500;
  if (error.message === "Unauthorized") return 401;
  if (error.message === "Forbidden") return 403;
  return 500;
}

export async function GET() {
  try {
    const sessionUserId = await getSessionUserId();
    const [tests, submissions] = await Promise.all([
      getTestsData(sessionUserId),
      getMyTestSubmissionsData(sessionUserId),
    ]);
    return NextResponse.json({ tests, submissions });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to fetch tests." },
      { status: getErrorStatus(error) }
    );
  }
}

export async function POST(request: Request) {
  try {
    const sessionUserId = await getSessionUserId();
    const body = await request.json();
    const test = await createTestRecord(sessionUserId, body);
    return NextResponse.json({ ok: true, test });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to create test." },
      { status: getErrorStatus(error) }
    );
  }
}
