// server/sqlServerStorage.ts
import { getPool, sql } from "./db";

/* ======================================================================== */
/* Generic TTL cache (in-memory, process-local)                              */
/* ======================================================================== */
class TTLCache<K, V> {
  private map = new Map<K, { value: V; expires: number }>();
  constructor(private ttlMs: number, private maxEntries = 500) {}
  get(key: K): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expires) {
      this.map.delete(key);
      return undefined;
    }
    // LRU refresh
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }
  set(key: K, value: V) {
    const entry = { value, expires: Date.now() + this.ttlMs };
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, entry);
    if (this.map.size > this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
    }
  }
  delete(key: K) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

/* ======================================================================== */
/* Helpers                                                                   */
/* ======================================================================== */

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

/* ======================================================================== */
/* Smart caches                                                              */
/* ======================================================================== */

// Cache for login lookups: key = `${emailLower}|${phone10}`
type LoginCacheValue = { inquiry: any; students: any[] };
const LOGIN_CACHE = new TTLCache<string, LoginCacheValue>(15 * 60 * 1000, 1000); // 15m

// Time label cache (TimeID -> "h:mm AM/PM"). tblTimes changes rarely.
const TIME_LABEL_CACHE = new TTLCache<number, string | null>(24 * 60 * 60 * 1000, 256); // 24h

/* ======================================================================== */
/* Python-style get_time: fetch HH:mm:ss and format to 'h:mm AM/PM'          */
/* ======================================================================== */
async function getTimeLabel(timeId: number): Promise<string | null> {
  const cached = TIME_LABEL_CACHE.get(timeId);
  if (cached !== undefined) return cached; // return cached (even null)

  const pool = await getPool();
  const req = pool.request();
  req.input("tid", sql.Int, timeId);

  const result = await req.query(`
    SELECT CONVERT(varchar(8), CAST([Time] AS time), 108) AS TimeHHMM
    FROM dpinkney_TC.dbo.tblTimes
    WHERE ID = @tid
  `);

  let formatted: string | null = null;
  if (result.recordset.length) {
    const hhmm = result.recordset[0].TimeHHMM as string; // "13:00:00"
    const m = hhmm.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const mins = parseInt(m[2], 10);
      const tmp = new Date();
      tmp.setHours(h, mins, 0, 0);
      formatted = tmp.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }); // "1:00 PM"
    } else {
      formatted = hhmm;
    }
  }

  TIME_LABEL_CACHE.set(timeId, formatted);
  return formatted;
}

/* Optional: manual login cache invalidation */
export function invalidateLoginCache(email: string, contactNum: string) {
  const phone10 = normalizePhone10(contactNum);
  if (!phone10) return;
  const key = `${String(email || "").trim().toLowerCase()}|${phone10}`;
  LOGIN_CACHE.delete(key);
}

/* ======================================================================== */
/* One-round-trip login lookup (parent + students + franchise email)         */
/*  - Auto-refresh cache if CenterEmail is missing in cached payload         */
/* ======================================================================== */
export async function findInquiryByEmailAndPhone(
  email: string,
  contactNum: string,
  forceFresh = false
) {
  try {
    const phone10 = normalizePhone10(contactNum);
    if (!phone10) return null;

    const emailKey = String(email || "").trim().toLowerCase();
    const cacheKey = `${emailKey}|${phone10}`;

    // Try cache (unless forceFresh)
    if (!forceFresh) {
      const cached = LOGIN_CACHE.get(cacheKey);
      if (cached) {
        const missingCenter = cached.students.some(
          (s: any) => s.CenterEmail == null || String(s.CenterEmail).trim() === ""
        );
        if (!missingCenter) {
          return cached;
        }
        // fall through to re-query if missing CenterEmail
      }
    }

    // Single DB round-trip:
    //   1) Resolve InquiryID
    //   2) Recordset 0: parent
    //   3) Recordset 1: students + FranchiseID + FranchiesEmail AS CenterEmail
    const pool = await getPool();
    const req = pool.request();
    req.input("email", sql.VarChar(256), email);
    req.input("cleanPhone", sql.VarChar(16), phone10);

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

      -- Recordset 1: students (with franchise email)
      SELECT
        s.ID,
        s.FirstName,
        s.LastName,
        s.FranchiseID,
        f.FranchiesEmail AS CenterEmail
      FROM dbo.tblstudents AS s
      LEFT JOIN dbo.tblFranchies AS f
        ON f.ID = s.FranchiseID
      WHERE s.InquiryID = @inqId
      ORDER BY s.LastName, s.FirstName;
    `);

    const parent = result.recordsets?.[0]?.[0];
    if (!parent) return null;

    const students = result.recordsets?.[1] ?? [];
    const value: LoginCacheValue = { inquiry: parent, students };

    // Cache and return
    LOGIN_CACHE.set(cacheKey, value);
    return value;
  } catch (error) {
    console.error("Error finding inquiry by email/phone (single round-trip):", error);
    throw error;
  }
}

/* ======================================================================== */
/* Sessions (today → fallback ALL)                                           */
/* (Formats Time via getTimeLabel() to avoid TZ drift.)                      */
/* ======================================================================== */
export async function getSessions(studentId: number | string) {
  try {
    const sid = coerceInt(studentId);
    const pool = await getPool();

    // 1) Today (per SQL Server time)
    const reqToday = pool.request();
    reqToday.input("sid", sql.Int, sid);
    const rsToday = await reqToday.query(`
      SELECT
        s.StudentId1       AS StudentID,
        s.ScheduleDate     AS ScheduleDate,
        s.Day              AS DayRaw,
        s.TimeID
      FROM dpinkney_TC.dbo.tblSessionSchedule AS s
      WHERE s.StudentId1 = @sid
        AND CAST(s.ScheduleDate AS date) = CAST(GETDATE() AS date)
      ORDER BY s.ScheduleDate ASC, s.TimeID ASC
    `);

    let rows = rsToday.recordset as any[];

    // 2) Fallback: ALL sessions
    if (!rows.length) {
      const reqAll = pool.request();
      reqAll.input("sid", sql.Int, sid);
      const rsAll = await reqAll.query(`
        SELECT
          s.StudentId1       AS StudentID,
          s.ScheduleDate     AS ScheduleDate,
          s.Day              AS DayRaw,
          s.TimeID
        FROM dpinkney_TC.dbo.tblSessionSchedule AS s
        WHERE s.StudentId1 = @sid
        ORDER BY s.ScheduleDate ASC, s.TimeID ASC
      `);
      rows = rsAll.recordset as any[];
    }

    const now = new Date();

    const mapped = await Promise.all(rows.map(async (row: any) => {
      const d = row.ScheduleDate instanceof Date ? row.ScheduleDate : new Date(String(row.ScheduleDate));
      const day = (row.DayRaw && String(row.DayRaw).trim())
        ? row.DayRaw
        : (!isNaN(d.getTime()) ? d.toLocaleDateString("en-US", { weekday: "long" }) : null);
      const timeStr = await getTimeLabel(Number(row.TimeID));

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
    }));

    return mapped;
  } catch (error) {
    console.error("Error getting sessions:", error);
    return [];
  }
}

/* ======================================================================== */
/* Billing (stored procedure)                                                */
/* ======================================================================== */
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

/* ======================================================================== */
/* High-level search (compat)                                                */
/* ======================================================================== */
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

/* ======================================================================== */
/* Schedule change (keep original stub)                                      */
/* ======================================================================== */
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

/* ======================================================================== */
/* Month-range Sessions (date-only, stable labels)                           */
/* ======================================================================== */

function monthRangeUTC(year: number, month1to12: number) {
  const m = Math.min(12, Math.max(1, month1to12));
  const start = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999)); // last day of month
  const toISODate = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD
  return { startISO: toISODate(start), endISO: toISODate(end) };
}

/**
 * Fetch ALL sessions for a student in (year, month).
 * Pure DATE filtering in SQL; formats Time via getTimeLabel() + cache.
 */
export async function getSessionsForMonth(studentId: number | string, year: number, month1to12: number) {
  const sid = coerceInt(studentId);
  const y = coerceInt(year);
  const m = coerceInt(month1to12);
  const { startISO, endISO } = monthRangeUTC(y, m);

  try {
    const pool = await getPool();
    const req = pool.request();
    req.input("sid", sql.Int, sid);
    req.input("d1", sql.Date, startISO);
    req.input("d2", sql.Date, endISO);

    const rs = await req.query(`
      SELECT
        s.StudentId1                       AS StudentID,
        CAST(s.ScheduleDate AS date)       AS ScheduleDateDate,
        CONVERT(varchar(10), CAST(s.ScheduleDate AS date), 23) AS ScheduleDateISO,
        s.Day                              AS DayRaw,
        s.TimeID
      FROM dpinkney_TC.dbo.tblSessionSchedule AS s
      WHERE s.StudentId1 = @sid
        AND CAST(s.ScheduleDate AS date) BETWEEN @d1 AND @d2
      ORDER BY CAST(s.ScheduleDate AS date) ASC, s.TimeID ASC
   `);

    const rows = rs.recordset as any[];
    const mapped = await Promise.all(rows.map(async (row: any) => {
      const dateISO = String(row.ScheduleDateISO);      // 'YYYY-MM-DD'
      const dateObj = new Date(`${dateISO}T00:00:00`);
      const day = (row.DayRaw && String(row.DayRaw).trim())
        ? row.DayRaw
        : dateObj.toLocaleDateString("en-US", { weekday: "long" });
      const timeLabel = await getTimeLabel(Number(row.TimeID));

      return {
        StudentID: row.StudentID,
        ScheduleDate: dateObj,        // keep for compat
        ScheduleDateISO: dateISO,     // stable, no TZ drift
        Day: day ?? null,
        TimeID: row.TimeID,
        Time: timeLabel ?? "Unknown",
      };
    }));

    return mapped;
  } catch (error) {
    console.error("Error getSessionsForMonth:", error);
    return [];
  }
}
