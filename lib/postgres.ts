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
  return url.toString();
}

const connectionString = normalizeConnectionString(process.env.SUPABASE_DB_URL);

let pool: Pool | null = null;

function getPool() {
  if (!connectionString) {
    throw new Error("Missing SUPABASE_DB_URL environment variable.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
    });
  }

  return pool;
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
