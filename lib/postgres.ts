import { Pool, type QueryResultRow } from "pg";

function normalizeConnectionString(input?: string) {
  const raw = input?.trim();
  if (!raw) return raw;

  const uriMatch = raw.match(/postgres(?:ql)?:\/\/\S+/i);
  const base = uriMatch?.[0] ?? raw;

  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return base;
  }

  const sslMode = (url.searchParams.get("sslmode") ?? "").toLowerCase();
  if (!sslMode) {
    url.searchParams.set("sslmode", "require");
  }
  if (!url.searchParams.get("uselibpqcompat")) {
    url.searchParams.set("uselibpqcompat", "true");
  }
  const host = url.hostname.toLowerCase();
  if (host.includes("pooler.supabase.com") && url.port !== "6543") {
    url.port = "6543";
  }
  return url.toString();
}

const connectionString = normalizeConnectionString(process.env.SUPABASE_DB_URL);

declare global {
  // eslint-disable-next-line no-var
  var __fwfPgPool__: Pool | undefined;
  // eslint-disable-next-line no-var
  var __fwfPgPoolConnectionString__: string | undefined;
}

function getPool() {
  if (!connectionString) {
    throw new Error("Missing SUPABASE_DB_URL environment variable.");
  }

  if (!globalThis.__fwfPgPool__ || globalThis.__fwfPgPoolConnectionString__ !== connectionString) {
    globalThis.__fwfPgPool__ = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 3,
      min: 0,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true,
    });
    globalThis.__fwfPgPoolConnectionString__ = connectionString;
    globalThis.__fwfPgPool__.on("error", (error) => {
      console.error("[postgres] idle client error:", error.message);
    });
  }

  return globalThis.__fwfPgPool__;
}

export async function pgQuery<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

export async function pgOne<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  const result = await pgQuery<T>(text, values);
  return result.rows[0] ?? null;
}

export function shouldUseSupabasePhaseA() {
  return true;
}

export function isSupabaseOnlyMode() {
  return true;
}
