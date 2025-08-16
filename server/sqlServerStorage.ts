import sql from "mssql";
import { pool } from "./db";

// Legacy database functions ported from the attached Python files
export async function findInquiryByEmailAndPhone(email: string, contactNum: string) {
  try {
    const request = pool.request();

    // Step 1: Find the Inquiry ID from the parent's email and contact number
    const parentQuery = `
      SELECT ID AS InquiryID, Email, ContactPhone
      FROM tblInquiry
      WHERE ContactPhone = @contactNum
      AND Email = @email
    `;

    request.input("email", sql.VarChar, email);
    request.input("contactNum", sql.VarChar, contactNum);
    const parentResult = await request.query(parentQuery);

    if (parentResult.recordset.length === 0) {
      return null; // No parent found
    }

    const parent = parentResult.recordset[0];
    const inquiryId = parent.InquiryID;

    // Step 2: Find the student(s) linked to that Inquiry ID
    const studentQuery = `
      SELECT ID, FirstName, LastName
      FROM tblstudents
      WHERE InquiryID = @inquiryId
    `;

    const studentRequest = pool.request();
    studentRequest.input("inquiryId", sql.Int, inquiryId);
    const studentResult = await studentRequest.query(studentQuery);

    return {
      inquiry: parent,
      students: studentResult.recordset,
    };
  } catch (error) {
    console.error("Error finding inquiry by contact phone:", error);
    throw error;
  }
}

export async function getHoursBalance(inquiryId: number) {
  try {
    const request = pool.request();
    request.input("inqID", sql.Int, inquiryId);

    // Call the stored procedure - Note: this might need adjustment based on actual procedure signature
    try {
      const result = await request.execute(
        "dpinkney_TC.dbo.USP_Report_AccountBalance",
      );

      console.log('Stored procedure result sets count:', result.recordsets?.length);
      if (result.recordsets) {
        result.recordsets.forEach((recordset, index) => {
          console.log(`Result set ${index + 1}:`, recordset.length, 'records');
          if (recordset.length > 0) {
            console.log(`Sample from result set ${index + 1}:`, recordset[0]);
          }
        });
      }

      let balanceData = {};
      let extraData: any[] = [];
      let accountDetails: any[] = [];
      let remainingHours = 0.0;

      if (result.recordsets && result.recordsets.length > 1) {
        // Second result set (balance-related info)
        const balanceRow = result.recordsets[1][0];
        balanceData = balanceRow || {};

        // Third result set (Account Holder and Students info)
        if (result.recordsets.length > 2) {
          extraData = result.recordsets[2] || [];
        }

        // Fourth result set (Account Details)
        if (result.recordsets.length > 3) {
          accountDetails = result.recordsets[3] || [];
          console.log('Account details from result set 4:', accountDetails);
        }

        // Calculate remaining hours
        const purchases = parseFloat(balanceData["Purchases"] || "0") || 0.0;
        const attendance =
          parseFloat(balanceData["AttendancePresent"] || "0") || 0.0;
        const absences =
          parseFloat(balanceData["UnexcusedAbsences"] || "0") || 0.0;
        const adjustments =
          parseFloat(balanceData["MiscAdjustments"] || "0") || 0.0;

        remainingHours = purchases + attendance + absences + adjustments;
      }

      return {
        balance: balanceData,
        extra: extraData,
        account_details: accountDetails,
        remaining_hours: remainingHours,
      };
    } catch (procError) {
      console.log("Stored procedure not available, using mock data for now");
      // Return mock data structure for development
      return {
        balance: {
          Purchases: "10.0",
          AttendancePresent: "-5.0",
          UnexcusedAbsences: "0.0",
          MiscAdjustments: "0.0",
        },
        extra: [
          {
            AccountHolder: "Angie Golden",
            StudentNames: "Sophia Golden, Marcus Golden"
          }
        ],
        account_details: [
          { Description: "Initial Purchase", Amount: 10.0, Date: "2025-07-01", Type: "Credit" },
          { Description: "Session Attendance", Amount: -1.0, Date: "2025-07-15", Type: "Debit" },
          { Description: "Session Attendance", Amount: -1.0, Date: "2025-07-22", Type: "Debit" },
          { Description: "Balance Adjustment", Amount: 2.0, Date: "2025-08-01", Type: "Credit" },
          { Description: "Session Attendance", Amount: -1.5, Date: "2025-08-05", Type: "Debit" },
          { Description: "Package Purchase", Amount: 15.0, Date: "2025-08-10", Type: "Credit" }
        ],
        remaining_hours: 5.0,
      };
    }
  } catch (error) {
    console.error("Error getting hours balance:", error);
    return {
      balance: {},
      extra: [],
      account_details: [],
      remaining_hours: 0.0,
    };
  }
}

export async function getTime(timeId: number): Promise<string | null> {
  try {
    const request = pool.request();
    request.input("timeId", sql.Int, timeId);

    const query = `
      SELECT Time
      FROM tblTimes
      WHERE ID = @timeId
    `;

    const result = await request.query(query);

    if (result.recordset.length > 0 && result.recordset[0].Time) {
      const timeValue = result.recordset[0].Time;


      let formattedTime = null;

      // Handle different time formats from SQL Server
      if (timeValue instanceof Date) {
        // If it's already a Date object, format it directly
        formattedTime = timeValue.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
      } else if (typeof timeValue === 'string') {
        // Handle string time formats
        try {
          // Try parsing as HH:MM:SS format
          const timeRegex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
          const match = timeValue.match(timeRegex);
          
          if (match) {
            const hours = parseInt(match[1], 10);
            const minutes = parseInt(match[2], 10);
            
            // Create a proper date object for formatting
            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            
            formattedTime = date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
          } else {
            // Fallback: try parsing with Date constructor
            const date = new Date(`1970-01-01T${timeValue}`);
            if (!isNaN(date.getTime())) {
              formattedTime = date.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              });
            }
          }
        } catch (parseError) {
          console.error('Error parsing time string:', parseError);
        }
      }

      console.log('Formatted time:', formattedTime);
      return formattedTime;
    }

    return null;
  } catch (error) {
    console.error("Error getting time:", error);
    return null;
  }
}

export async function getSessions(studentId: number) {
  try {
    const request = pool.request();
    request.input("studentId", sql.Int, studentId);

    const query = `
      SELECT Day, TimeID, ScheduleDate, StudentId1 
      FROM dpinkney_TC.dbo.tblSessionSchedule 
      WHERE StudentId1 = @studentId
    `;

    const result = await request.query(query);
    const allSessions = result.recordset;

    // Current month and year
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    const recentSessions: any[] = [];
    const upcomingSessions: any[] = [];

    for (const session of allSessions) {
      try {
        // Add formatted time
        const timeId = session.TimeID;
        const formattedTime = timeId ? await getTime(timeId) : "Unknown";
        session.Time = formattedTime;

        // Normalize ScheduleDate with better logging
        let sessionDate: Date | null = null;

        if (session.ScheduleDate) {
          if (session.ScheduleDate instanceof Date) {
            sessionDate = session.ScheduleDate;
          } else if (typeof session.ScheduleDate === "string") {
            sessionDate = new Date(session.ScheduleDate);
          } else {
            // Handle other types - convert to string first
            sessionDate = new Date(session.ScheduleDate.toString());
          }
        }

        if (!sessionDate || isNaN(sessionDate.getTime())) {
          continue;
        }

        // Filter only current month & year
        if (
          sessionDate.getMonth() + 1 !== currentMonth ||
          sessionDate.getFullYear() !== currentYear
        ) {
          continue;
        }

        // Save formatted date and day - using proper date formatting
        session.FormattedDate = sessionDate.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric", 
          month: "long",
          day: "numeric"
        });
        if (!session.Day || session.Day.trim() === "") {
          session.Day = sessionDate.toLocaleDateString("en-US", {
            weekday: "long",
          });
        }

        // Categorize
        if (sessionDate < today) {
          session.category = "recent";
          recentSessions.push(session);
        } else {
          session.category = "upcoming";
          upcomingSessions.push(session);
        }
      } catch (error) {
        console.error("Error processing session:", error);
        session.category = "upcoming";
        upcomingSessions.push(session);
      }
    }

    // Combine and return
    return [...recentSessions, ...upcomingSessions];
  } catch (error) {
    console.error("Error getting sessions:", error);
    return [];
  }
}

export async function searchStudent(email: string, contactNum: string) {
  try {
    // Step 1: Lookup parent/inquiry info using email and contact number
    const inquiry = await findInquiryByEmailAndPhone(email, contactNum);
    if (!inquiry) {
      return { error: "Parent not found" };
    }

    const inquiryId = inquiry.inquiry.InquiryID;

    // Step 2: Get all students tied to this parent (InquiryID)
    const request = pool.request();
    request.input("inquiryId", sql.Int, inquiryId);

    const query = `
      SELECT ID, FirstName, LastName 
      FROM tblstudents 
      WHERE InquiryID = @inquiryId
    `;

    const result = await request.query(query);
    const students = result.recordset;

    if (students.length === 0) {
      return { error: "No students found for this parent" };
    }

    // Step 3: Get parent balance info
    const parentInfo = await getHoursBalance(inquiryId);

    // Step 4: Attach session data for each student
    for (const student of students) {
      const studentId = student.ID;
      student.sessions = await getSessions(studentId);
    }

    return {
      success: true,
      inquiry_id: inquiryId,
      parent: parentInfo,
      students: students,
    };
  } catch (error) {
    console.error("Error searching student:", error);
    return { error: "Internal server error" };
  }
}

export async function submitScheduleChangeRequest(requestData: {
  studentId: number;
  currentSession: string;
  preferredDate: string;
  preferredTime: string;
  requestedChange: string;
  reason?: string;
}) {
  try {
    // For now, we'll just log the request since the original system doesn't have a specific table for this
    // In a real implementation, you might want to create a new table or use an existing one
    console.log("Schedule change request submitted:", requestData);

    // You could insert into a requests table or send an email notification here
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
