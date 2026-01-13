// server/pg.ts
import { Pool } from "pg";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`[pg] Missing env var: ${name}`);
  return v;
}

// Neon requires SSL. Include ?sslmode=require in DATABASE_URL.
// Example:
// postgresql://USER:PASSWORD@HOST/DB?sslmode=require
const pgPool = new Pool({
  connectionString: requireEnv("NEON_URL"),
  ssl: { rejectUnauthorized: false },
});

export async function pgQuery<T = any>(text: string, params: any[] = []) {
  const client = await pgPool.connect();
  try {
    const res = await client.query<T>(text, params);
    return res;
  } finally {
    client.release();
  }
}
