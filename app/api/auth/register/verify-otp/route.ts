import { NextResponse } from "next/server";
import { getAdminRealtimePersonIds, verifyRegistrationOtp } from "@/lib/server/data";
import { publishAppEventToPersons } from "@/lib/server/realtime";
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { authCorsPreflight, withAuthCors } from "@/lib/server/auth-cors";

export async function OPTIONS(request: Request) {
  return authCorsPreflight(request);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await verifyRegistrationOtp(body.email ?? "", body.otp ?? "");

    if (!result.ok) {
      return withAuthCors(request, NextResponse.json(result, { status: 400 }));
    }

    if (!result.user) {
      if (result.requiresApproval) {
        const adminRecipients = await getAdminRealtimePersonIds();
        void publishAppEventToPersons(adminRecipients, {
          type: "approval.updated",
          actorId: "system",
          action: "requested",
          entityType: "approval",
          occurredAt: new Date().toISOString()
        });
      }

      return withAuthCors(request, NextResponse.json(result));
    }

    const response = NextResponse.json({ ok: true, user: { ...result.user, password: "" } });
    response.cookies.set(SESSION_COOKIE_NAME, result.user.id, getSessionCookieOptions());
    return withAuthCors(request, response);
  } catch (error) {
    return withAuthCors(request, NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Xác minh OTP thất bại." },
      { status: 500 }
    ));
  }
}
