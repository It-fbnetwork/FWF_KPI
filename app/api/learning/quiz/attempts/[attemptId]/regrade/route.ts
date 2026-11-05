import { NextResponse } from "next/server";
import { regradeQuizEssayAttempt } from "@/lib/server/data";
import { getSessionUserId } from "@/lib/server/session";

type Params = { params: Promise<{ attemptId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { attemptId } = await params;
    const sessionUserId = await getSessionUserId();
    const body = (await request.json()) as {
      questionIndex: number;
      score: number;
      feedback?: string;
    };
    const result = await regradeQuizEssayAttempt(
      sessionUserId,
      attemptId,
      Number(body.questionIndex),
      Number(body.score),
      body.feedback ?? ""
    );
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json(
      { ok: false, message: msg },
      { status: msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 400 }
    );
  }
}
