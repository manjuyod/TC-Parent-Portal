import type { Express } from "express";
import { createServer, type Server } from "http";
import {
  findInquiryByEmailAndPhone,
  getHoursBalance,
  getSessions,
  searchStudent,
  submitScheduleChangeRequest,
} from "./sqlServerStorage";
import session from "express-session";

// --- Normalization helpers (keep here or move to server/utils/normalize.ts) ---
const normalizeUnicode = (s: string) => s.normalize("NFKC").trim();

const digitsOnly = (s: string) => s.replace(/\D+/g, "");

/** Normalize to US 10-digit phone, stripping a leading country code 1 if present */
const normalizePhoneUS = (raw: string): string | null => {
  const d = digitsOnly(normalizeUnicode(raw));
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  if (d.length === 10) return d;
  return null;
};

/** Normalize emails consistently */
const normalizeEmail = (raw: string): string =>
  normalizeUnicode(raw).toLowerCase();

declare module "express-session" {
  interface SessionData {
    parentId?: string;
    inquiryId?: number;
    email?: string;
    contactPhone?: string; // store normalized 10-digit string
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
        secure: false, // set true behind HTTPS/proxy in prod
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );

  // Auth guard
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session.parentId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  };

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const emailInput = String(req.body.email ?? "");
      const phoneInput = String(req.body.contactPhone ?? "");

      const email = normalizeEmail(emailInput);
      const phone10 = normalizePhoneUS(phoneInput);

      if (!email || !phone10) {
        return res.status(400).json({ message: "Invalid input" });
      }

      // IMPORTANT: findInquiryByEmailAndPhone should compare LOWER(Email) to @email
      // and compare the digits of ContactPhone to @phone10 (use TRANSLATE in SQL)
      const inquiryData = await findInquiryByEmailAndPhone(email, phone10);
      if (!inquiryData) {
        return res
          .status(401)
          .json({ message: "Invalid phone number. Please contact your tutoring center." });
      }

      const parentInfo = inquiryData.inquiry;
      const studentsInfo = inquiryData.students;

      // Store normalized values in session
      req.session.email = email;
      req.session.contactPhone = phone10; // normalized 10-digit
      req.session.inquiryId = parentInfo.InquiryID;
      req.session.parentId = String(parentInfo.InquiryID);
      req.session.studentIds = studentsInfo.map((s: any) => s.ID);

      res.json({
        success: true,
        parent: {
          id: parentInfo.InquiryID,
          name: parentInfo.Email || "Parent",
          contactPhone: parentInfo.ContactPhone, // original display (optional)
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
      if (err) {
        return res.status(500).json({ message: "Could not log out" });
      }
      res.json({ success: true });
    });
  });

  // Current user
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      // Use normalized values from session
      const contactPhone10 = req.session.contactPhone!;
      const email = req.session.email!;

      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone10);
      if (!inquiryData) {
        return res.status(404).json({ message: "Parent not found" });
      }

      const parentInfo = inquiryData.inquiry;
      const studentsInfo = inquiryData.students;

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

  // Dashboard
  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const inquiryId = req.session.inquiryId!;
      const contactPhone10 = req.session.contactPhone!;
      const email = req.session.email!;

      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone10);
      if (!inquiryData) {
        return res.status(404).json({ message: "Parent data not found" });
      }

      const studentsInfo = inquiryData.students;

      // Gather sessions (your getSessions already filters to current month)
      const allSessions: any[] = [];
      for (const student of studentsInfo) {
        const studentSessions = await getSessions(student.ID);
        studentSessions.forEach((session: any) => {
          session.studentName = `${student.FirstName} ${student.LastName}`;
          session.studentId = student.ID;
        });
        allSessions.push(...studentSessions);
      }

      const billingInfo = await getHoursBalance(inquiryId);
      const sessionsThisMonth = allSessions.length;

      res.json({
        students: studentsInfo.map((student: any) => {
          const studentSessions = allSessions.filter((s) => s.studentId === student.ID);
          const nextSession =
            studentSessions.length > 0
              ? `${studentSessions[0].Day} ${studentSessions[0].Time}`
              : "No sessions scheduled";

          return {
            id: student.ID,
            name: `${student.FirstName} ${student.LastName}`,
            grade: "N/A",
            subject: "N/A",
            status: "active",
            progress: 0,
            nextSession,
          };
        }),
        sessions: allSessions,
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

  // Schedule change request
  app.post("/api/schedule-change-request", requireAuth, async (req, res) => {
    try {
      const { studentId, currentSession, preferredDate, preferredTime, requestedChange, reason } =
        req.body;
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
