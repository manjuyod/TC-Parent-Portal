// server/pg.ts
import pg from "pg";
import type { QueryResult, QueryResultRow } from "pg";

const { Pool } = pg;

// Neon requires SSL. Include ?sslmode=require in DATABASE_URL.
// Example:
// postgresql://USER:PASSWORD@HOST/DB?sslmode=require
export const pgPool = new Pool({
  connectionString: process.env.NEON_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Execute a SQL query against the configured Neon/Postgres connection pool and return the result.
 *
 * @param text - SQL query text (may include parameter placeholders)
 * @param params - Optional array of parameter values for the query
 * @returns The resulting `QueryResult<T>` containing rows typed as `T`
 * @throws Error if the `NEON_URL` environment variable is missing or empty
 */
export async function pgQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = []
): Promise<QueryResult<T>> {
  if (!process.env.NEON_URL?.trim()) {
    throw new Error("[pg] Missing env var: NEON_URL");
  }

  const client = await pgPool.connect();
  try {
    const res = await client.query<T>(text, params as unknown[]);
    return res;
  } finally {
    client.release();
  }
}
