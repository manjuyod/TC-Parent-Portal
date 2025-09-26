// server/routes.ts
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

import {
  findInquiryByEmailAndPhone,
  getHoursBalance,
  getSessions,
  submitScheduleChangeRequest,
} from "./sqlServerStorage";
import { getPool, sql } from "./db";

/* ------------------------------------------------------------------ */
/* ESM-safe __dirname + stable data path (works in dev and dist)      */
/* ------------------------------------------------------------------ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDist = path.basename(__dirname) === "dist";
const SERVER_DIR = isDist ? path.join(__dirname, "..") : __dirname;

const FLAGS_DIR = path.join(SERVER_DIR, "data");
const FLAGS_FILE = path.join(FLAGS_DIR, "feature-flags.json");

/* ------------------------------------------------------------------ */
/* Session typing                                                     */
/* ------------------------------------------------------------------ */
declare module "express-session" {
  interface SessionData {
    // parent session
    parentId?: string;
    inquiryId?: number;
    email?: string;
    contactPhone?: string;
    studentIds?: number[];

    // admin session
    adminEmail?: string;
    adminFranchiseId?: string; // normalized string id
  }
}

/* ------------------------------------------------------------------ */
/* Feature flag storage helpers                                       */
/* JSON shape:
   {
     "franchises": {
       "6": { "hideBilling": true },
       "8": { "hideBilling": false }
     }
   }
*/
/* ------------------------------------------------------------------ */

type FranchiseFlagsRecord = Record<string, { hideBilling?: boolean }>;

async function ensureFlagsFile() {
  await fs.mkdir(FLAGS_DIR, { recursive: true });
  try {
    await fs.access(FLAGS_FILE);
  } catch {
    const seed = { franchises: {} as FranchiseFlagsRecord };
    await fs.writeFile(FLAGS_FILE, JSON.stringify(seed, null, 2), "utf-8");
  }
}

async function readFlags(): Promise<FranchiseFlagsRecord> {
  await ensureFlagsFile();
  try {
    const raw = await fs.readFile(FLAGS_FILE, "utf-8");
    const json = JSON.parse(raw);
    if (json && typeof json === "object" && json.franchises && typeof json.franchises === "object") {
      return json.franchises as FranchiseFlagsRecord;
    }
  } catch {
    // ignore corrupt file; fall through to empty
  }
  return {};
}

async function writeFlags(franchiseId: string, patch: { hideBilling?: boolean }) {
  await ensureFlagsFile();
  let root: { franchises: FranchiseFlagsRecord } = { franchises: {} };
  try {
    const raw = await fs.readFile(FLAGS_FILE, "utf-8");
    const json = JSON.parse(raw);
    if (json && typeof json === "object") {
      root = { franchises: (json.franchises ?? {}) as FranchiseFlagsRecord };
    }
  } catch {
    // start fresh
  }
  const cur = root.franchises[franchiseId] || {};
  root.franchises[franchiseId] = {
    ...cur,
    ...(patch.hideBilling !== undefined ? { hideBilling: !!patch.hideBilling } : {}),
  };
  await fs.writeFile(FLAGS_FILE, JSON.stringify(root, null, 2), "utf-8");
}

/* ------------------------------------------------------------------ */
/* Middleware                                                          */
/* ------------------------------------------------------------------ */

function requireParentAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.parentId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.adminEmail || !req.session.adminFranchiseId) {
    return res.status(401).json({ message: "Admin authentication required" });
  }
  next();
}

/* ------------------------------------------------------------------ */
/* Center email resolver                                               */
/* ------------------------------------------------------------------ */
async function resolveCenterEmailForStudent(studentId: number): Promise<string | null> {
  const pool = await getPool();
  const q = pool.request();
  q.input("sid", sql.Int, studentId);

  // NOTE: table name is dpinkney_TC.dbo.tblFranchies with column FranchiesEmail (as provided)
  const rs = await q.query(`
    SELECT TOP 1 F.FranchiesEmail AS CenterEmail
    FROM dbo.tblstudents S
    JOIN dpinkney_TC.dbo.tblFranchies F ON F.ID = S.FranchiseID
    WHERE S.ID = @sid
  `);

  if (rs.recordset.length) {
    const email: string | null = rs.recordset[0].CenterEmail ?? null;
    return email && String(email).trim() ? String(email).trim() : null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Route registration                                                  */
/* ------------------------------------------------------------------ */
export async function registerRoutes(app: Express): Promise<Server> {
  // Sessions
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "tutoring-club-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // set to true behind HTTPS
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );

  /* ============================ Parent Auth ============================ */

  // Parent login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, contactPhone } = req.body || {};
      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) {
        return res
          .status(401)
          .json({ message: "Invalid phone number. Please contact your tutoring center." });
      }

      const parentInfo = inquiryData.inquiry;
      const studentsInfo = inquiryData.students || [];

      // Save session
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

  // Parent logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Could not log out" });
      res.json({ success: true });
    });
  });

  // Current parent
  app.get("/api/auth/me", requireParentAuth, async (req, res) => {
    try {
      const contactPhone = req.session.contactPhone!;
      const email = req.session.email!;
      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) return res.status(404).json({ message: "Parent not found" });

      const parentInfo = inquiryData.inquiry;
      const studentsInfo = inquiryData.students || [];

      // refresh ids
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
          // Optional: expose franchise id to client if needed elsewhere
          franchiseId: s.FranchiseID ?? null,
        })),
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /* ============================ Parent Dashboard ============================ */

  app.get("/api/dashboard", requireParentAuth, async (req, res) => {
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

      // ---- Read feature flags and compute hideBilling for this parent ----
      let hideBillingForParent = false;
      try {
        const flags = await readFlags(); // { [fid]: { hideBilling } }
        const franchiseIds = Array.from(
          new Set(
            (studentsInfo || [])
              .map((s: any) => s?.FranchiseID)
              .filter((v: any) => v !== null && v !== undefined)
              .map((v: any) => String(v))
          )
        );
        hideBillingForParent = franchiseIds.some((fid) => !!flags[fid]?.hideBilling);
      } catch (e) {
        console.warn("[dashboard] readFlags failed, default visible:", e);
      }

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

      // Flatten & sort
      const allSessions: any[] = ([] as any[]).concat(...perStudent).sort((a, b) => {
        const ad = new Date(a.ScheduleDate).getTime();
        const bd = new Date(b.ScheduleDate).getTime();
        if (ad !== bd) return ad - bd;
        return (a.TimeID ?? 0) - (b.TimeID ?? 0);
      });

      // Normalize to ISO
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
          ? `${
              nextUpcoming.Day ??
              new Date(nextUpcoming.ScheduleDateISO).toLocaleDateString("en-US", {
                weekday: "long",
              })
            } ${nextUpcoming.Time ?? ""}`.trim() || "Scheduled"
          : "No sessions scheduled";

        return {
          id: sid,
          name: `${student.FirstName} ${student.LastName}`,
          grade: "N/A",
          subject: "N/A",
          status: "active",
          progress: 0,
          nextSession,
          franchiseId: student.FranchiseID ?? null,
        };
      });

      // Billing (keep summary & remaining_hours; drop details when hidden)
      const billingInfo = await getHoursBalance(inquiryIdNum);

      const billingOut = billingInfo
        ? {
            currentBalance: "0.00",
            monthlyRate: "320.00",
            nextPaymentDate: "N/A",
            paymentMethod: "N/A",
            sessionsThisMonth: sessionsOut.length,
            balance: billingInfo.balance ?? {},
            extra: billingInfo.extra ?? [],
            remaining_hours: billingInfo.remaining_hours ?? 0,
            account_details: hideBillingForParent ? [] : (billingInfo.account_details ?? []),
          }
        : null;

      res.json({
        students,
        sessions: sessionsOut,
        billing: billingOut,
        transactions: [],
        uiPolicy: { hideBilling: hideBillingForParent },
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /* ============================ Schedule change (keep stub) ============================ */

  app.post("/api/schedule-change-request", requireParentAuth, async (req, res) => {
    try {
      const { studentId, currentSession, preferredDate, preferredTime, requestedChange, reason } =
        req.body || {};
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

  /* ============================ Center email (compose helper) ============================ */

  app.get("/api/center-email", requireParentAuth, async (req, res) => {
    try {
      const sid = Number(req.query.studentId);
      if (!Number.isFinite(sid)) return res.status(400).json({ message: "studentId required" });
      const email = await resolveCenterEmailForStudent(sid);
      res.json({ centerEmail: email || null });
    } catch (e: any) {
      console.error("center-email error:", e);
      res.status(500).json({ message: "Failed to resolve center email" });
    }
  });

  /* ============================ Admin Auth ============================ */

  // Admin login (email + password from dbo.tblUsers; map to franchise via dpinkney_TC.dbo.tblFranchies.FranchiesEmail)
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ message: "email and password are required" });
      }

      const pool = await getPool();
      const q = pool.request();
      q.input("email", sql.VarChar(256), String(email).trim());
      q.input("pwd", sql.VarChar(256), String(password)); // NOTE: legacy plain-text

      const rs = await q.query(`
        SELECT TOP 1
          U.Email        AS AdminEmail,
          F.ID           AS FranchiseID
        FROM dbo.tblUsers AS U
        LEFT JOIN dpinkney_TC.dbo.tblFranchies AS F
          ON F.FranchiesEmail = U.Email
        WHERE U.Email = @email COLLATE SQL_Latin1_General_CP1_CI_AS
          AND U.[Password] = @pwd
      `);

      if (!rs.recordset.length) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const row = rs.recordset[0];
      const adminEmail = String(row.AdminEmail || "").trim();
      const franchiseId = row.FranchiseID != null ? String(row.FranchiseID) : "";

      if (!franchiseId) {
        return res.status(401).json({ message: "No franchise mapping for this admin email" });
      }

      req.session.adminEmail = adminEmail;
      req.session.adminFranchiseId = franchiseId;

      res.json({ success: true, franchiseId, email: adminEmail });
    } catch (e: any) {
      console.error("admin/login error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/logout", (req, res) => {
    delete req.session.adminEmail;
    delete req.session.adminFranchiseId;
    res.json({ success: true });
  });

  app.get("/api/admin/me", requireAdminAuth, async (req, res) => {
    res.json({
      email: req.session.adminEmail!,
      franchiseId: req.session.adminFranchiseId!,
    });
  });

  /* ============================ Admin Flags API ============================ */

  app.get("/api/admin/flags", requireAdminAuth, async (req, res) => {
    try {
      const fid = String(req.session.adminFranchiseId!);
      const all = await readFlags();
      const rec = all[fid] || { hideBilling: false };
      res.json({ franchiseId: fid, hideBilling: !!rec.hideBilling });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Failed to read flags" });
    }
  });

  // Accepts { hideBilling: boolean } or { policy: { hideBilling: boolean } } (back-compat)
  app.post("/api/admin/flags", requireAdminAuth, async (req, res) => {
    try {
      const fid = String(req.session.adminFranchiseId!);
      const hideBilling =
        req.body?.hideBilling ??
        req.body?.policy?.hideBilling;
      if (hideBilling === undefined) {
        return res.status(400).json({ message: "hideBilling is required" });
      }
      await writeFlags(fid, { hideBilling: !!hideBilling });
      const all = await readFlags();
      const rec = all[fid] || { hideBilling: false };
      res.json({ franchiseId: fid, hideBilling: !!rec.hideBilling });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Failed to update flags" });
    }
  });

  /* ------------------------------------------------------------------ */
  /* Return HTTP server                                                  */
  /* ------------------------------------------------------------------ */
  const httpServer = createServer(app);
  return httpServer;
}
