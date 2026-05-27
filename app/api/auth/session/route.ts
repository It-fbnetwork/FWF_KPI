import { NextResponse } from "next/server";
import { getAuthState } from "@/lib/server/data";
import { getSessionUserId } from "@/lib/server/session";
import { authCorsPreflight, withAuthCors } from "@/lib/server/auth-cors";

export async function OPTIONS(request: Request) {
  return authCorsPreflight(request);
}

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  const { searchParams } = new URL(request.url);
  const includeUsers = searchParams.get("includeUsers") === "true";
  const payload = await getAuthState(userId);
  return withAuthCors(request, NextResponse.json({
    user: payload.user ? { ...payload.user, password: "" } : null,
    users: includeUsers ? payload.users.map((user) => ({ ...user, password: "" })) : []
  }));
}
