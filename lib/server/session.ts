import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "fwf-kpi-session";
type SameSiteValue = "lax" | "strict" | "none";

function getCookieSameSite(): SameSiteValue {
  const value = (process.env.AUTH_SESSION_SAMESITE ?? "lax").trim().toLowerCase();
  if (value === "none" || value === "strict") return value;
  return "lax";
}

export function getSessionCookieOptions(overrides?: { expires?: Date }) {
  const sameSite = getCookieSameSite();
  const secure = (process.env.AUTH_SESSION_SECURE ?? "").trim() === "true" || sameSite === "none";
  const domain = (process.env.AUTH_SESSION_DOMAIN ?? "").trim() || undefined;

  return {
    httpOnly: true,
    sameSite,
    secure,
    path: "/",
    domain,
    ...overrides
  } as const;
}

export async function getSessionUserId() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}
