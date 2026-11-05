import { NextResponse } from "next/server";
import { processQuizDeadlineReminders } from "@/lib/server/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader === `Bearer ${cronSecret}`) return true;
  const headerSecret = request.headers.get("x-cron-secret") ?? "";
  return headerSecret === cronSecret;
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processQuizDeadlineReminders();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
