import { getPool, sql } from "./db";

export type AdminLoginBody = {
  username: string;
  password: string;
};

export type AdminAuthResult = {
  adminEmail: string;
  franchiseId: string;
};

/**
 * Supports new `username` and legacy `email` field for backward compatibility.
 */
export function parseAdminLoginBody(body: unknown): AdminLoginBody {
  const payload = (body ?? {}) as Record<string, unknown>;

  return {
    username: String(payload.username ?? payload.email ?? "").trim(),
    password: String(payload.password ?? ""),
  };
}

/**
 * Authenticates against tblUsers.UserName while preserving franchise mapping by email.
 */
export async function authenticateAdminByUsername(
  username: string,
  password: string
): Promise<AdminAuthResult | null> {
  const pool = await getPool();
  const q = pool.request();
  q.input("username", sql.VarChar(256), username);
  q.input("pwd", sql.VarChar(256), password); // NOTE: legacy plain-text

  const rs = await q.query(`
    SELECT TOP 1
      U.Email        AS AdminEmail,
      F.ID           AS FranchiseID
    FROM dbo.tblUsers AS U
    LEFT JOIN dpinkney_TC.dbo.tblFranchies AS F
      ON F.FranchiesEmail = U.Email
    WHERE U.UserName = @username COLLATE SQL_Latin1_General_CP1_CI_AS
      AND U.[Password] = @pwd
  `);

  if (!rs.recordset.length) return null;

  const row = rs.recordset[0];
  const adminEmail = String(row.AdminEmail || "").trim();
  const franchiseId = row.FranchiseID != null ? String(row.FranchiseID) : "";

  if (!franchiseId) return null;

  return { adminEmail, franchiseId };
}
