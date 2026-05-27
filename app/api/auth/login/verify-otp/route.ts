import { NextResponse } from "next/server";
import { verifyLoginOtp } from "@/lib/server/data";
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { authCorsPreflight, withAuthCors } from "@/lib/server/auth-cors";

export async function OPTIONS(request: Request) {
  return authCorsPreflight(request);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await verifyLoginOtp(body.email ?? "", body.otp ?? "");

    if (!result.ok || !result.user) {
      return withAuthCors(request, NextResponse.json(result, { status: 400 }));
    }

    const response = NextResponse.json({ ok: true, user: { ...result.user, password: "" } });
    response.cookies.set(SESSION_COOKIE_NAME, result.user.id, getSessionCookieOptions());
    return withAuthCors(request, response);
  } catch (error) {
    return withAuthCors(request, NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Xác minh OTP đăng nhập thất bại." },
      { status: 500 }
    ));
  }
}
