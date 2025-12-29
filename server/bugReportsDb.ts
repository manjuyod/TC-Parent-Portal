// server/bugReportsDb.ts
import { pgPool } from "./pg";

export async function createBugReport(input: {
  franchiseId?: string | number | null;
  userEmail?: string | null;
  userName?: string | null;
  message: string;
  userAgent?: string | null;
  pageUrl?: string | null;
}) {
  const {
    franchiseId,
    userEmail,
    userName,
    message,
    userAgent,
    pageUrl,
  } = input;

  const { rows } = await pgPool.query(
    `
    INSERT INTO bug_reports (
      franchise_id,
      user_email,
      user_name,
      message,
      user_agent,
      page_url
    )
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING id, created_at
    `,
    [
      franchiseId != null ? String(franchiseId) : null,
      userEmail ?? null,
      userName ?? null,
      message,
      userAgent ?? null,
      pageUrl ?? null,
    ]
  );

  return rows[0];
}
