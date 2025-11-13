// server/sqlServerStorage.ts
import { getPool, sql } from "./db";

/* ------------------------ Helpers ------------------------ */

function normalizePhone10(input: string): string | null {
  const digits = String(input || "").replace(/\D/g, "");
  const stripped = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return stripped.length === 10 ? stripped : null;
}

function coerceInt(v: number | string): number {
  const n = typeof v === "string" ? parseInt(v, 10) : v;
  if (!Number.isFinite(n)) throw new Error("Invalid number");
  return n;
}

/* ------------------------ Simple TTL cache for time labels ------------------------ */
class TTLCache<K, V> {
  private map = new Map<K, { v: V; exp: number }>();
  constructor(private ttlMs: number, private max = 512) {}
  get(k: K): V | undefined {
    const e = this.map.get(k);
    if (!e) return undefined;
    if (Date.now() > e.exp) {
      this.map.delete(k);
      return undefined;
    }
    return e.v;
  }
  set(k: K, v: V) {
    this.map.set(k, { v, exp: Date.now() + this.ttlMs });
    if (this.map.size > this.max) {
      const [first] = this.map.keys();
      this.map.delete(first);
    }
  }
}

const TIME_LABEL_CACHE = new TTLCache<number, string | null>(24 * 60 * 60 * 1000);

/**
 * Read tblTimes as text (HH:mm:ss) and format to 'h:mm AM/PM' WITHOUT timezone drift.
 */
async function getTimeLabel(timeId: number): Promise<string | null> {
  const cached = TIME_LABEL_CACHE.get(timeId);
  if (cached !== undefined) return cached;

  const pool = await getPool();
  const req = pool.request();
  req.input("tid", sql.Int, timeId);

  // 108 => HH:mm:ss string
  const rs = await req.query(`
    SELECT CONVERT(varchar(8), CAST([Time] AS time), 108) AS HHMMSS
    FROM dpinkney_TC.dbo.tblTimes
    WHERE ID = @tid
  `);

  let label: string | null = null;
  if (rs.recordset.length) {
    const hhmmss = String(rs.recordset[0].HHMMSS || ""); // e.g. "16:30:00"
    const m = hhmmss.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const mins = parseInt(m[2], 10);
      const tmp = new Date();
      tmp.setHours(h, mins, 0, 0);
      label = tmp.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }); // "4:30 PM"
    } else {
      // fall back to raw
      label = hhmmss;
    }
  }

  TIME_LABEL_CACHE.set(timeId, label);
  return label;
}

/* ------------------------ Login lookup ------------------------ */
/** Find Inquiry (parent) by email + phone and list linked students */
export async function findInquiryByEmailAndPhone(email: string, contactNum: string) {
  try {
    const pool = await getPool();
    const request = pool.request();

    const normalized = normalizePhone10(contactNum);
    if (!normalized) return null;

    const parentQuery = `
      SELECT ID AS InquiryID, Email, ContactPhone
      FROM dbo.tblInquiry
      WHERE Email = @email COLLATE SQL_Latin1_General_CP1_CI_AS
        AND REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    REPLACE(
                      REPLACE(ContactPhone, ' ', ''),
                    '-', ''),
                  '(', ''),
                ')', ''),
              '+', ''),
            '.', '') = @cleanPhone
    `;

    request.input("email", sql.VarChar(256), email);
    request.input("cleanPhone", sql.VarChar(16), normalized);

    const parentResult = await request.query(parentQuery);
    if (parentResult.recordset.length === 0) return null;

    const parent = parentResult.recordset[0];
    const inquiryId = Number(parent.InquiryID);

    const studentRequest = pool.request();
    // IMPORTANT: match the parameter name used in the SQL (@inqId)
    studentRequest.input("inqId", sql.Int, inquiryId);
    const studentQuery = `
      SELECT ID, FirstName, LastName, FranchiseID
      FROM dbo.tblStudents
      WHERE InquiryID = @inqId
      ORDER BY LastName, FirstName
    `;
    const studentResult = await studentRequest.query(studentQuery);

    return {
      inquiry: parent,
      students: studentResult.recordset,
    };
  } catch (error) {
    console.error("Error finding inquiry by email/phone:", error);
    throw error;
  }
}

/* ------------------------ Sessions (date-only for stability) ------------------------ */
/**
 * We fetch date-only (ISO) and TimeID, then format time with getTimeLabel().
 * This avoids timezone drift (e.g., 4:30 PM becoming 8:30 AM) and wrong weekdays.
 */
export async function getSessions(studentId: number | string) {
  try {
    const sid = coerceInt(studentId);
    const pool = await getPool();

    const req = pool.request();
    req.input("sid", sql.Int, sid);

    const rs = await req.query(`
      SELECT
        s.StudentId1 AS StudentID,
        CAST(s.ScheduleDate AS date) AS ScheduleDateDate,
        CONVERT(varchar(10), CAST(s.ScheduleDate AS date), 23) AS ScheduleDateISO, -- 'YYYY-MM-DD'
        s.Day AS DayRaw,
        s.TimeID
      FROM dpinkney_TC.dbo.tblSessionSchedule AS s
      WHERE s.StudentId1 = @sid
      ORDER BY CAST(s.ScheduleDate AS date) ASC, s.TimeID ASC
    `);

    const rows = rs.recordset as any[];

    const mapped = await Promise.all(
      rows.map(async (row) => {
        const dateISO: string = String(row.ScheduleDateISO); // yyyy-mm-dd
        const d = new Date(`${dateISO}T00:00:00`);
        const day =
          (row.DayRaw && String(row.DayRaw).trim()) ||
          d.toLocaleDateString("en-US", { weekday: "long" });

        const timeStr = await getTimeLabel(Number(row.TimeID));

        return {
          StudentID: row.StudentID,
          ScheduleDate: d, // kept for UI compatibility
          ScheduleDateISO: dateISO, // stable
          Day: day ?? null,
          TimeID: row.TimeID,
          Time: timeStr ?? "Unknown",
          category: (!isNaN(d.getTime()) && d < new Date()) ? "recent" : "upcoming",
          FormattedDate: !isNaN(d.getTime())
            ? d.toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : null,
        };
      })
    );

    return mapped;
  } catch (error) {
    console.error("Error getting sessions:", error);
    return [];
  }
}

/* ------------------------ Billing (stored procedure) ------------------------ */
export async function getHoursBalance(inquiryId: number | string) {
  try {
    const idNum = coerceInt(inquiryId);
    const pool = await getPool();
    const request = pool.request();
    request.input("inqID", sql.Int, idNum);

    try {
      const result = await request.execute("dpinkney_TC.dbo.USP_Report_AccountBalance");

      let balanceData: Record<string, any> = {};
      let extraData: any[] = [];
      let accountDetails: any[] = [];
      let remainingHours = 0.0;

      if (result.recordsets && result.recordsets.length > 1) {
        const balanceRow = result.recordsets[1]?.[0];
        balanceData = balanceRow ?? {};

        if (result.recordsets.length > 2) {
          extraData = result.recordsets[2] ?? [];
        }
        if (result.recordsets.length > 3) {
          accountDetails = result.recordsets[3] ?? [];
        }

        const toFloat = (v: any) => {
          const n = parseFloat(v ?? "0");
          return Number.isFinite(n) ? n : 0;
        };

        const purchases = toFloat(balanceData["Purchases"]);
        const attendance = toFloat(balanceData["AttendancePresent"]);
        const absences = toFloat(balanceData["UnexcusedAbsences"]);
        const adjustments = toFloat(balanceData["MiscAdjustments"]);
        remainingHours = purchases + attendance + absences + adjustments;
      }

      return {
        balance: balanceData,
        extra: extraData,
        account_details: accountDetails,
        remaining_hours: remainingHours,
      };
    } catch (procError: any) {
      console.warn("Stored procedure error:", procError?.message);
      return {
        balance: {
          Purchases: "10.0",
          AttendancePresent: "-5.0",
          UnexcusedAbsences: "0.0",
          MiscAdjustments: "0.0",
        },
        extra: [{ AccountHolder: "Example Parent", StudentNames: "Example Student" }],
        account_details: [],
        remaining_hours: 5.0,
      };
    }
  } catch (error) {
    console.error("Error getting hours balance:", error);
    return { balance: {}, extra: [], account_details: [], remaining_hours: 0.0 };
  }
}

/* ------------------------ Student Reviews (tblStudentFeedback) ------------------------ */
/**
 * Pulls session feedback for a given student within an optional [fromDate, toDate) window.

 */
export async function getStudentReviews(
  studentId: number | string,
  opts?: { offset?: number; limit?: number; fromDate?: string; toDate?: string }
): Promise<{ rows: any[]; total: number }> {
  const sid = coerceInt(studentId);
  const offset = Math.max(0, Number(opts?.offset ?? 0));
  const limit = Math.min(100, Math.max(1, Number(opts?.limit ?? 50)));

  const pool = await getPool();

  const hasFrom = typeof opts?.fromDate === "string" && !!opts!.fromDate;
  const hasTo   = typeof opts?.toDate   === "string" && !!opts!.toDate;

  const dateWhere = hasFrom && hasTo
    ? "AND CAST(s.ScheduleDate AS date) >= @fromDate AND CAST(s.ScheduleDate AS date) < @toDate"
    : hasFrom
      ? "AND CAST(s.ScheduleDate AS date) >= @fromDate"
      : hasTo
        ? "AND CAST(s.ScheduleDate AS date) < @toDate"
        : "";


  const countReq = pool.request();
  countReq.input("sid", sql.Int, sid);
  if (hasFrom) countReq.input("fromDate", sql.Date, opts!.fromDate);
  if (hasTo)   countReq.input("toDate",   sql.Date, opts!.toDate);

  const countSql = `
    SELECT COUNT(*) AS Total
    FROM dpinkney_TC.dbo.tblSessionSchedule AS s
    INNER JOIN dpinkney_TC.dbo.tblStudentFeedback AS f
      ON f.SessionID = s.ID
    WHERE s.StudentId1 = @sid
      ${dateWhere}
  `;
  const total = Number((await countReq.query(countSql)).recordset?.[0]?.Total ?? 0);


  const rowsReq = pool.request();
  rowsReq.input("sid", sql.Int, sid);
  if (hasFrom) rowsReq.input("fromDate", sql.Date, opts!.fromDate);
  if (hasTo)   rowsReq.input("toDate",   sql.Date, opts!.toDate);
  rowsReq.input("offset", sql.Int, offset);
  rowsReq.input("limit",  sql.Int, limit);

  const rowsSql = `
    SELECT
      s.ID AS SessionID,
      CONVERT(varchar(10), CAST(s.ScheduleDate AS date), 23) AS SessionDateISO, -- YYYY-MM-DD
      f.CoverdstudentMaterials        AS CoveredMaterialsScore,
      f.CoverdstudentMaterials_Text   AS CoveredMaterialsText,
      f.studentattitude_Text          AS StudentAttitudeText,
      f.OtherFeedback                 AS OtherFeedback
    FROM dpinkney_TC.dbo.tblSessionSchedule AS s
    INNER JOIN dpinkney_TC.dbo.tblStudentFeedback AS f
      ON f.SessionID = s.ID
    WHERE s.StudentId1 = @sid
      ${dateWhere}
    ORDER BY CAST(s.ScheduleDate AS date) DESC, s.ID DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `;
  const rs = await rowsReq.query(rowsSql);

  const rows = (rs.recordset || []).map((r: any) => ({
    SessionID: Number(r.SessionID),
    SessionDateISO: String(r.SessionDateISO),
    CoveredMaterialsScore: r.CoveredMaterialsScore != null ? Number(r.CoveredMaterialsScore) : null,
    CoveredMaterialsText: r.CoveredMaterialsText ?? null,
    StudentAttitudeText: r.StudentAttitudeText ?? null,
    OtherFeedback: r.OtherFeedback ?? null,
  }));

  return { rows, total };
}

/* ------------------------ High-level search (compat) ------------------------ */
export async function searchStudent(email: string, contactNum: string) {
  try {
    const inquiry = await findInquiryByEmailAndPhone(email, contactNum);
    if (!inquiry) return { error: "Parent not found" };

    const inquiryId = Number(inquiry.inquiry.InquiryID);
    const students = inquiry.students || [];
    if (!students.length) return { error: "No students found for this parent" };

    for (const s of students) {
      s.sessions = await getSessions(s.ID);
    }

    const parent = await getHoursBalance(inquiryId);
    return { success: true, inquiry_id: inquiryId, parent, students };
  } catch (error) {
    console.error("Error searching student:", error);
    return { error: "Internal server error" };
  }
}

/* ------------------------ Schedule change (stub) ------------------------ */
export async function submitScheduleChangeRequest(requestData: {
  studentId: number;
  currentSession: string;
  preferredDate: string;
  preferredTime: string;
  requestedChange: string;
  reason?: string;
}) {
  try {
    console.log("Schedule change request submitted:", requestData);
    return {
      success: true,
      message: `Schedule change request submitted for student ${requestData.studentId}`,
      request: requestData,
    };
  } catch (error) {
    console.error("Error submitting schedule change request:", error);
    return { error: "Failed to submit request" };
  }
}

/* ------------------------ Admin login (DB-backed) ------------------------ */
/**
 * Verifies admin by email + password against SQL Server (dbo.tblUsers).
 * Then resolves franchise by matching that email to dbo.tblFranchies.FranchiesEmail.
 *
 * Returns { franchiseId, email } on success, or null on failure.
 */
export async function verifyAdminCredentials(
  email: string,
  password: string
): Promise<{ franchiseId: string; email: string } | null> {
  const pool = await getPool();
  const req = pool.request();
  req.input("email", sql.VarChar(256), email);
  req.input("pwd", sql.VarChar(256), password);

  // One round-trip: check user + resolve franchise by email
  const rs = await req.query(`
    SELECT TOP 1
      U.[email]           AS Email,
      F.[ID]              AS FranchiseID
    FROM dbo.tblUsers AS U
    LEFT JOIN dpinkney_TC.dbo.tblFranchies AS F
      ON F.[FranchiesEmail] = U.[email] COLLATE SQL_Latin1_General_CP1_CI_AS
    WHERE U.[email] = @email COLLATE SQL_Latin1_General_CP1_CI_AS
      AND U.[Password] = @pwd
  `);

  if (!rs.recordset.length) {
    // No user/password match
    return null;
  }

  const row = rs.recordset[0];
  const fid = row.FranchiseID != null ? String(row.FranchiseID) : null;

  // Require that this admin email is linked to a franchise
  if (!fid) return null;

  return {
    franchiseId: fid,
    email: String(row.Email),
  };
}
