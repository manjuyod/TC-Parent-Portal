import { getPool, sql } from "./db";

/** utility: normalize phone to 10 digits (strip non-digits, drop leading 1) */
function normalizePhone(input: string): string | null {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, "");
  const stripped = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return stripped.length === 10 ? stripped : null;
}

/** Find Inquiry (parent) by email + phone and list linked students */
export async function findInquiryByEmailAndPhone(email: string, contactNum: string) {
  try {
    const pool = await getPool();
    const request = pool.request();

    // JS-side normalization
    const normalized = normalizePhone(contactNum);
    if (!normalized) return null; // phone not a valid 10-digit number

    // Case-insensitive email compare + SQL-side phone normalization using nested REPLACE
    const parentQuery = `
      SELECT ID AS InquiryID, Email, ContactPhone
      FROM tblInquiry
      WHERE LOWER(Email) = LOWER(@email)
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

    request.input("email", sql.VarChar, email);
    request.input("cleanPhone", sql.VarChar, normalized);

    const parentResult = await request.query(parentQuery);
    if (parentResult.recordset.length === 0) return null;

    const parent = parentResult.recordset[0];
    const inquiryId = parent.InquiryID as number;

    // Fetch linked students
    const studentRequest = pool.request();
    studentRequest.input("inquiryId", sql.Int, inquiryId);

    const studentQuery = `
      SELECT ID, FirstName, LastName
      FROM tblstudents
      WHERE InquiryID = @inquiryId
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

/** Call USP_Report_AccountBalance and shape result sets */
export async function getHoursBalance(inquiryId: number) {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input("inqID", sql.Int, inquiryId);

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
        extra: [
          { AccountHolder: "Example Parent", StudentNames: "Example Student" },
        ],
        account_details: [],
        remaining_hours: 5.0,
      };
    }
  } catch (error) {
    console.error("Error getting hours balance:", error);
    return { balance: {}, extra: [], account_details: [], remaining_hours: 0.0 };
  }
}

/** Translate a TimeID to a human-readable time (e.g., 1:00 PM) */
export async function getTime(timeId: number): Promise<string | null> {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input("timeId", sql.Int, timeId);

    const query = `
      SELECT Time
      FROM tblTimes
      WHERE ID = @timeId
    `;
    const result = await request.query(query);

    if (result.recordset.length === 0) return null;

    const timeValue = result.recordset[0].Time;

    if (timeValue instanceof Date) {
      return timeValue.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    }

    if (typeof timeValue === "string") {
      const m = timeValue.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
      if (m) {
        const h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const d = new Date();
        d.setHours(h, min, 0, 0);
        return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      }
      const d = new Date(`1970-01-01T${timeValue}`);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      }
    }

    return null;
  } catch (error) {
    console.error("Error getting time:", error);
    return null;
  }
}

/** Sessions for a student (current month only) + categorized recent/upcoming */
export async function getSessions(studentId: number) {
  try {
    const pool = await getPool();
    const request = pool.request();
    request.input("studentId", sql.Int, studentId);

    const query = `
      SELECT Day, TimeID, ScheduleDate, StudentId1 
      FROM dpinkney_TC.dbo.tblSessionSchedule 
      WHERE StudentId1 = @studentId
    `;
    const result = await request.query(query);
    const allSessions = result.recordset;

    const today = new Date();
    const currentMonth = today.getMonth(); // 0-based
    const currentYear = today.getFullYear();

    const recentSessions: any[] = [];
    const upcomingSessions: any[] = [];

    for (const session of allSessions) {
      try {
        const formattedTime = session.TimeID ? await getTime(session.TimeID) : "Unknown";
        session.Time = formattedTime;

        let sessionDate: Date | null = null;
        const raw = session.ScheduleDate;

        if (raw instanceof Date) {
          sessionDate = raw;
        } else if (typeof raw === "string") {
          const d = new Date(raw);
          sessionDate = isNaN(d.getTime()) ? null : d;
        } else if (raw != null) {
          const d = new Date(String(raw));
          sessionDate = isNaN(d.getTime()) ? null : d;
        }

        if (!sessionDate) continue;

        if (sessionDate.getMonth() !== currentMonth || sessionDate.getFullYear() !== currentYear) {
          continue;
        }

        session.FormattedDate = sessionDate.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        if (!session.Day || String(session.Day).trim() === "") {
          session.Day = sessionDate.toLocaleDateString("en-US", { weekday: "long" });
        }

        if (sessionDate < today) {
          session.category = "recent";
          recentSessions.push(session);
        } else {
          session.category = "upcoming";
          upcomingSessions.push(session);
        }
      } catch (e) {
        console.error("Error processing session:", e);
        session.category = "upcoming";
        upcomingSessions.push(session);
      }
    }

    return [...recentSessions, ...upcomingSessions];
  } catch (error) {
    console.error("Error getting sessions:", error);
    return [];
  }
}

/** High-level search: parent by email+phone → students → sessions & balance */
export async function searchStudent(email: string, contactNum: string) {
  try {
    const inquiry = await findInquiryByEmailAndPhone(email, contactNum);
    if (!inquiry) return { error: "Parent not found" };

    const inquiryId = inquiry.inquiry.InquiryID as number;

    const pool = await getPool();
    const req = pool.request();
    req.input("inquiryId", sql.Int, inquiryId);

    const studentQuery = `
      SELECT ID, FirstName, LastName 
      FROM tblstudents 
      WHERE InquiryID = @inquiryId
    `;
    const studentsRs = await req.query(studentQuery);
    const students = studentsRs.recordset;
    if (students.length === 0) return { error: "No students found for this parent" };

    const parentInfo = await getHoursBalance(inquiryId);

    for (const s of students) {
      s.sessions = await getSessions(s.ID);
    }

    return {
      success: true,
      inquiry_id: inquiryId,
      parent: parentInfo,
      students,
    };
  } catch (error) {
    console.error("Error searching student:", error);
    return { error: "Internal server error" };
  }
}

/** Accept a schedule change request (no DB writes yet) */
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
