import { NextResponse } from "next/server";
import { createRegistrationOtp } from "@/lib/server/data";
import { authCorsPreflight, withAuthCors } from "@/lib/server/auth-cors";

export async function OPTIONS(request: Request) {
  return authCorsPreflight(request);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await createRegistrationOtp(body);
    return withAuthCors(request, NextResponse.json(result, { status: result.ok ? 200 : 400 }));
  } catch (error) {
    return withAuthCors(request, NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Gửi OTP thất bại." },
      { status: 500 }
    ));
  }
}
