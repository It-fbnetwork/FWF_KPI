import { NextResponse } from "next/server";
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { authCorsPreflight, withAuthCors } from "@/lib/server/auth-cors";

export async function OPTIONS(request: Request) {
  return authCorsPreflight(request);
}

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", getSessionCookieOptions({ expires: new Date(0) }));
  return withAuthCors(request, response);
}
