// server/routes.ts
import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import {
  findInquiryByEmailAndPhone,
  getHoursBalance,
  getSessions,
  submitScheduleChangeRequest,
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

  // Auth gate
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session.parentId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  };

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, contactPhone } = req.body;

      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) {
        return res
          .status(401)
          .json({ message: "Invalid phone number. Please contact your tutoring center." });
      }

      const parentInfo = inquiryData.inquiry;
      const studentsInfo = inquiryData.students || [];

      // Store session data
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

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Could not log out" });
      res.json({ success: true });
    });
  });

  // Me
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const contactPhone = req.session.contactPhone!;
      const email = req.session.email!;
      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) return res.status(404).json({ message: "Parent not found" });

      const parentInfo = inquiryData.inquiry;
      const studentsInfo = inquiryData.students || [];

      // Refresh session studentIds
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
          centerEmail: s.CenterEmail ?? null, // expose to client
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

  // Dashboard
  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const inquiryIdNum = Number(req.session.inquiryId);
      if (!Number.isFinite(inquiryIdNum)) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const contactPhone = req.session.contactPhone!;
      const email = req.session.email!;
      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) return res.status(404).json({ message: "Parent data not found" });

      const studentsInfo = inquiryData.students || [];

      // Sessions per student (attach studentId/studentName)
      const perStudent = await Promise.all(
        studentsInfo.map(async (student: any) => {
          const sid = Number(student.ID);
          try {
            const list = await getSessions(sid);
            return (list || []).map((session: any) => ({
              ...session,
              studentId: sid,
              studentName: `${student.FirstName} ${student.LastName}`,
            }));
          } catch (e) {
            console.error("Error getting sessions for student:", sid, e);
            return [];
          }
        })
      );

      const allSessions: any[] = ([] as any[]).concat(...perStudent).sort((a, b) => {
        const ad = new Date(a.ScheduleDate).getTime();
        const bd = new Date(b.ScheduleDate).getTime();
        if (ad !== bd) return ad - bd;
        return (a.TimeID ?? 0) - (b.TimeID ?? 0);
      });

      const sessionsOut = allSessions.map((s) => ({
        ...s,
        ScheduleDateISO:
          s.ScheduleDate instanceof Date
            ? s.ScheduleDate.toISOString()
            : new Date(String(s.ScheduleDate)).toISOString(),
      }));

      // Next upcoming per student
      const now = new Date();
      const byStudent = new Map<number, any[]>();
      for (const s of sessionsOut) {
        const k = Number(s.studentId);
        if (!byStudent.has(k)) byStudent.set(k, []);
        byStudent.get(k)!.push(s);
      }

      const students = studentsInfo.map((student: any) => {
        const sid = Number(student.ID);
        const list = byStudent.get(sid) || [];
        const nextUpcoming = list.find((s) => new Date(s.ScheduleDateISO) >= now);
        const nextSession = nextUpcoming
          ? `${nextUpcoming.Day ?? new Date(nextUpcoming.ScheduleDateISO).toLocaleDateString("en-US", { weekday: "long" })} ${nextUpcoming.Time ?? ""}`.trim() || "Scheduled"
          : "No sessions scheduled";

        return {
          id: sid,
          name: `${student.FirstName} ${student.LastName}`,
          centerEmail: student.CenterEmail ?? null, // expose to client
          grade: "N/A",
          subject: "N/A",
          status: "active",
          progress: 0,
          nextSession,
        };
      });

      const billingInfo = await getHoursBalance(inquiryIdNum);
      const sessionsThisMonth = sessionsOut.length;

      res.json({
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

  // Center email lookup with "freshen if missing" logic
  app.get("/api/center-email", requireAuth, async (req, res) => {
    const sid = Number(req.query.studentId);
    if (!Number.isFinite(sid)) {
      return res.status(400).json({ message: "Missing or invalid studentId" });
    }

    const allowed = (req.session.studentIds || []) as number[];
    if (!allowed.includes(sid)) {
      return res.status(403).json({ message: "Unauthorized access to student" });
    }

    try {
      const contactPhone = req.session.contactPhone!;
      const email = req.session.email!;

      // 1) Try from cached (or current) result
      let inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      let studentsInfo = inquiryData?.students || [];
      let row = studentsInfo.find((s: any) => Number(s.ID) === sid);
      let centerEmail =
        row?.CenterEmail ??
        process.env.CENTER_EMAIL ??
        process.env.TC_CENTER_EMAIL ??
        null;

      // 2) If missing, force a fresh DB read once
      if (!row?.CenterEmail) {
        inquiryData = await findInquiryByEmailAndPhone(email, contactPhone, true /* forceFresh */);
        studentsInfo = inquiryData?.students || [];
        row = studentsInfo.find((s: any) => Number(s.ID) === sid);
        centerEmail =
          row?.CenterEmail ??
          process.env.CENTER_EMAIL ??
          process.env.TC_CENTER_EMAIL ??
          null;
      }

      res.json({ centerEmail, source: row?.CenterEmail ? "db" : (centerEmail ? "env" : "none") });
    } catch (e) {
      console.error("center-email lookup failed:", e);
      res.status(500).json({ message: "Lookup failed" });
    }
  });

  // Submit schedule change (kept as stub)
  app.post("/api/schedule-change-request", requireAuth, async (req, res) => {
    try {
      const { studentId, currentSession, preferredDate, preferredTime, requestedChange, reason } = req.body;
      const studentIds = req.session.studentIds || [];

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
