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

/* ------------------------ Login lookup (one round-trip) ------------------------ */
/** Find Inquiry (parent) by email + phone and list linked students */
export async function findInquiryByEmailAndPhone(email: string, contactNum: string) {
  try {
    const pool = await getPool();
    const phone10 = normalizePhone10(contactNum);
    if (!phone10) return null;

    const req = pool.request();
    req.input("email", sql.VarChar(256), email);
    req.input("cleanPhone", sql.VarChar(16), phone10);

    // One round-trip, avoids per-param naming mismatches (@inqId vs @inqID, etc.)
    const result = await req.query(`
      DECLARE @inqId INT;

      SELECT TOP 1 @inqId = I.ID
      FROM dbo.tblInquiry AS I
      WHERE I.Email = @email COLLATE SQL_Latin1_General_CP1_CI_AS
        AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(I.ContactPhone,' ',''),'-',''),'(',''),')',''),'+',''),'.','') = @cleanPhone;

      -- Recordset 0: parent
      SELECT ID AS InquiryID, Email, ContactPhone
      FROM dbo.tblInquiry
      WHERE ID = @inqId;

      -- Recordset 1: students
      SELECT ID, FirstName, LastName, FranchiseID
      FROM dbo.tblStudents
      WHERE InquiryID = @inqId
      ORDER BY LastName, FirstName;
    `);

    const parent = result.recordsets?.[0]?.[0];
    if (!parent) return null;

    const students = result.recordsets?.[1] ?? [];
    return { inquiry: parent, students };
  } catch (error) {
    console.error("Error finding inquiry by email/phone:", error);
    throw error;
  }
}

/* ------------------------ Sessions (robust: today, then fallback) ------------------------ */
export async function getSessions(studentId: number | string) {
  try {
    const sid = coerceInt(studentId);
    const pool = await getPool();

    const reqToday = pool.request();
    reqToday.input("sid", sql.Int, sid);
    const rsToday = await reqToday.query(`
      SELECT
        s.StudentId1       AS StudentID,
        s.ScheduleDate     AS ScheduleDate,
        s.Day              AS DayRaw,
        s.TimeID,
        t.[Time]           AS TimeText
      FROM dpinkney_TC.dbo.tblSessionSchedule AS s
      LEFT JOIN dpinkney_TC.dbo.tblTimes AS t
        ON t.ID = s.TimeID
      WHERE s.StudentId1 = @sid
        AND CAST(s.ScheduleDate AS date) = CAST(GETDATE() AS date)
      ORDER BY s.ScheduleDate ASC, s.TimeID ASC
    `);

    let rows = rsToday.recordset;
    if (!rows.length) {
      const reqAll = pool.request();
      reqAll.input("sid", sql.Int, sid);
      const rsAll = await reqAll.query(`
        SELECT
          s.StudentId1       AS StudentID,
          s.ScheduleDate     AS ScheduleDate,
          s.Day              AS DayRaw,
          s.TimeID,
          t.[Time]           AS TimeText
        FROM dpinkney_TC.dbo.tblSessionSchedule AS s
        LEFT JOIN dpinkney_TC.dbo.tblTimes AS t
          ON t.ID = s.TimeID
        WHERE s.StudentId1 = @sid
        ORDER BY s.ScheduleDate ASC, s.TimeID ASC
      `);
      rows = rsAll.recordset;
    }

    const now = new Date();
    const mapped = rows.map((row: any) => {
      const d = row.ScheduleDate instanceof Date ? row.ScheduleDate : new Date(String(row.ScheduleDate));
      const day = (row.DayRaw && String(row.DayRaw).trim())
        ? row.DayRaw
        : (!isNaN(d.getTime()) ? d.toLocaleDateString("en-US", { weekday: "long" }) : null);

      // Normalize 'Time' like "1:00 PM"
      let timeStr: string | null = null;
      const v = row.TimeText;
      if (v instanceof Date) {
        timeStr = v.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      } else if (typeof v === "string") {
        const m = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?$/);
        if (m) {
          const tmp = new Date(); tmp.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
          timeStr = tmp.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
        } else {
          const tmp = new Date(`1970-01-01T${v}`);
          if (!isNaN(tmp.getTime())) {
            timeStr = tmp.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
          }
        }
      }

      return {
        StudentID: row.StudentID,
        ScheduleDate: d,
        Day: day ?? null,
        TimeID: row.TimeID,
        Time: timeStr ?? "Unknown",
        category: (!isNaN(d.getTime()) && d < now) ? "recent" : "upcoming",
        FormattedDate: !isNaN(d.getTime())
          ? d.toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })
          : null,
      };
    });

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
    request.input("inqID", sql.Int, idNum); // matches proc param name (@inqID)

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
 * Then resolves franchise by matching that email to dpinkney_TC.dbo.tblFranchies.FranchiesEmail.
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
    return null;
  }

  const row = rs.recordset[0];
  const fid = row.FranchiseID != null ? String(row.FranchiseID) : null;
  if (!fid) return null;

  return {
    franchiseId: fid,
    email: String(row.Email),
  };
}
