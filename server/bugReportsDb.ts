// server/bugReportsDb.ts
import { pgQuery } from "./pg";

export async function createBugReport(input: {
  franchiseId?: string | number | null;
  reporterEmail?: string | null;
  reporterName?: string | null;
  message: string;
  userAgent?: string | null;
  pagePath?: string | null;
  meta?: unknown | null;
}) {
  const {
    franchiseId,
    reporterEmail,
    reporterName,
    message,
    userAgent,
    pagePath,
    meta,
  } = input;

  const { rows } = await pgQuery<{
    id: number;
    created_at: string;
  }>(
    `
    INSERT INTO bug_reports (
      franchise_id,
      reporter_email,
      reporter_name,
      message,
      page_path,
      user_agent,
      meta
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING id, created_at
    `,
    [
      franchiseId != null ? Number(franchiseId) : null,
      reporterEmail ?? null,
      reporterName ?? null,
      message,
      pagePath ?? null,
      userAgent ?? null,
      meta ?? null,
    ]
  );

  return rows[0];
}
