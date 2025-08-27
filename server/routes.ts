import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import {
  findInquiryByEmailAndPhone,
  getHoursBalance,
  getSessions, // kept for compatibility (unused by dashboard now)
  submitScheduleChangeRequest,
  getSessionsForMonth, // NEW: month-aware fetch
} from "./sqlServerStorage";

declare module "express-session" {
  interface SessionData {
    parentId?: string;
    inquiryId?: number;
    email?: string;
    contactPhone?: string;
    studentIds?: number[];
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Session middleware
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "tutoring-club-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    })
  );

  // Authentication middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session.parentId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  };

  // Login endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, contactPhone } = req.body;

      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) {
        return res
          .status(401)
          .json({
            message:
              "Invalid phone number. Please contact your tutoring center.",
          });
      }

      const parentInfo = inquiryData.inquiry;
      const studentsInfo = inquiryData.students || [];

      // Store session data (ensure numeric IDs)
      req.session.email = email;
      req.session.contactPhone = contactPhone;
      req.session.inquiryId = Number(parentInfo.InquiryID);
      req.session.parentId = String(parentInfo.InquiryID);
      req.session.studentIds = studentsInfo.map((s: any) => Number(s.ID));

      res.json({
        success: true,
        parent: {
          id: parentInfo.InquiryID,
          name: parentInfo.Email || "Parent",
          contactPhone: parentInfo.ContactPhone,
        },
        studentsCount: studentsInfo.length,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(400).json({ message: "Invalid input" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Could not log out" });
      }
      res.json({ success: true });
    });
  });

  // Get current user
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const contactPhone = req.session.contactPhone!;
      const email = req.session.email!;

      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) {
        return res.status(404).json({ message: "Parent not found" });
      }

      const parentInfo = inquiryData.inquiry;
      const studentsInfo = inquiryData.students || [];

      // keep session studentIds fresh
      req.session.studentIds = studentsInfo.map((s: any) => Number(s.ID));

      res.json({
        parent: {
          id: parentInfo.InquiryID,
          name: parentInfo.Email || "Parent",
          contactPhone: parentInfo.ContactPhone,
        },
        students: studentsInfo.map((s: any) => ({
          id: s.ID,
          name: `${s.FirstName} ${s.LastName}`,
          grade: "N/A",
          subject: "N/A",
          status: "active",
          progress: 0,
        })),
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * NEW: Get dashboard data (month-aware; attach studentId/studentName; stable categorization)
   * Query params (optional): ?year=2025&month=8  (month is 1-12)
   */
  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const inquiryIdNum = Number(req.session.inquiryId);
      if (!Number.isFinite(inquiryIdNum)) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const contactPhone = req.session.contactPhone!;
      const email = req.session.email!;

      // Optional query params with defaults to "now"
      const now = new Date();
      const qYear = Number(req.query.year ?? now.getFullYear());
      const qMonth = Number(req.query.month ?? (now.getMonth() + 1)); // 1-12

      // Get parent + students
      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) {
        return res.status(404).json({ message: "Parent data not found" });
      }
      const studentsInfo = inquiryData.students || [];

      // Fetch sessions for the requested month per student (parallel)
      const perStudent = await Promise.all(
        studentsInfo.map(async (student: any) => {
          const sid = Number(student.ID);
          try {
            const list = await getSessionsForMonth(sid, qYear, qMonth);
            return (list || []).map((session: any) => ({
              ...session,
              studentId: sid, // attach for UI
              studentName: `${student.FirstName} ${student.LastName}`, // attach for UI
            }));
          } catch (e) {
            console.error("Error getting sessions for student:", sid, e);
            return [];
          }
        })
      );

      // Flatten and sort (by date-only then time)
      const allSessions: any[] = ([] as any[]).concat(...perStudent).sort((a, b) => {
        if (a.ScheduleDateISO !== b.ScheduleDateISO) {
          return a.ScheduleDateISO < b.ScheduleDateISO ? -1 : 1;
        }
        return (a.TimeID ?? 0) - (b.TimeID ?? 0);
      });

      // Categorize using date-only (avoid time zone drift)
      const todayISO = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
      const sessionsOut = allSessions.map((s) => ({
        ...s,
        category: s.ScheduleDateISO < todayISO ? "recent" : "upcoming",
        FormattedDate: new Date(`${s.ScheduleDateISO}T00:00:00`).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      }));

      // Next upcoming per student (using date-only compare)
      const byStudent = new Map<number, any[]>();
      for (const s of sessionsOut) {
        const k = Number(s.studentId);
        if (!byStudent.has(k)) byStudent.set(k, []);
        byStudent.get(k)!.push(s);
      }

      const students = studentsInfo.map((student: any) => {
        const sid = Number(student.ID);
        const list = byStudent.get(sid) || [];
        const nextUpcoming = list.find((s) => s.category === "upcoming");
        const nextSession = nextUpcoming
          ? `${nextUpcoming.Day ?? new Date(`${nextUpcoming.ScheduleDateISO}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" })} ${nextUpcoming.Time ?? ""}`.trim() || "Scheduled"
          : "No sessions scheduled";

        return {
          id: sid,
          name: `${student.FirstName} ${student.LastName}`,
          grade: "N/A",
          subject: "N/A",
          status: "active",
          progress: 0,
          nextSession,
        };
      });

      // Billing information (unchanged)
      const billingInfo = await getHoursBalance(inquiryIdNum);
      const sessionsThisMonth = sessionsOut.length;

      res.json({
        window: { year: qYear, month: qMonth },
        students,
        sessions: sessionsOut,
        billing: billingInfo
          ? {
              currentBalance: "0.00",
              monthlyRate: "320.00",
              nextPaymentDate: "N/A",
              paymentMethod: "N/A",
              sessionsThisMonth,
              ...billingInfo,
            }
          : null,
        transactions: [],
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Submit schedule change request (kept original)
  app.post("/api/schedule-change-request", requireAuth, async (req, res) => {
    try {
      const {
        studentId,
        currentSession,
        preferredDate,
        preferredTime,
        requestedChange,
        reason,
      } = req.body;
      const studentIds = req.session.studentIds || [];

      // Verify the student belongs to the authenticated parent
      if (!studentIds.includes(parseInt(studentId))) {
        return res.status(403).json({ message: "Unauthorized access to student" });
      }

      const result = await submitScheduleChangeRequest({
        studentId: parseInt(studentId),
        currentSession,
        preferredDate,
        preferredTime,
        requestedChange,
        reason,
      });

      if ((result as any).error) {
        return res.status(400).json({ message: (result as any).error });
      }

      res.json(result);
    } catch (error) {
      console.error("Schedule change request error:", error);
      res.status(400).json({ message: "Invalid request data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
