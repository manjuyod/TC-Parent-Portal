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
  getStudentReviews,
} from "./sqlServerStorage";
import { getPool, sql } from "./db";

/* ------------------------------------------------------------------ */
/* ESM-safe __dirname + stable data path                               */
/* ------------------------------------------------------------------ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDist = path.basename(__dirname) === "dist";
const SERVER_DIR = isDist ? path.join(__dirname, "..") : __dirname;

// Data directory shared for flags + bug reports
const FLAGS_DIR = path.join(SERVER_DIR, "data");
const FLAGS_FILE = path.join(FLAGS_DIR, "feature-flags.json");
const BUGS_FILE = path.join(FLAGS_DIR, "bug_reports.json");

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
/* Feature flags storage (wrapped structure)                           */
/* {
     "franchises": {
       "8": {
         "hideBilling": false,
         "hideHours": true,
         "billingColumnVisibility": {
           "hideDate": false,
           "hideStudent": false,
           "hideEventType": false,
           "hideAttendance": false,
           "hideAdjustment": false
         }
       }
     }
   }
*/
/* ------------------------------------------------------------------ */

type BillingColumnVisibility = {
  hideDate?: boolean;
  hideStudent?: boolean;
  hideEventType?: boolean;
  hideAttendance?: boolean;
  hideAdjustment?: boolean;
};

const DEFAULT_COLS: Required<BillingColumnVisibility> = {
  hideDate: false,
  hideStudent: false,
  hideEventType: false,
  hideAttendance: false,
  hideAdjustment: false,
};

type Flags = {
  hideBilling?: boolean;
  hideHours?: boolean;
  billingColumnVisibility?: BillingColumnVisibility;
};

type WrappedFlags = { franchises: Record<string, Flags> };

async function ensureFlagsFile() {
  await fs.mkdir(FLAGS_DIR, { recursive: true });
  try {
    await fs.access(FLAGS_FILE);
  } catch {
    const seed: WrappedFlags = { franchises: {} };
    await fs.writeFile(FLAGS_FILE, JSON.stringify(seed, null, 2), "utf-8");
  }
}

function normalizeFlags(f?: Flags): Required<Flags> {
  return {
    hideBilling: !!f?.hideBilling,
    hideHours: !!f?.hideHours,
    billingColumnVisibility: { ...DEFAULT_COLS, ...(f?.billingColumnVisibility ?? {}) },
  };
}

async function readFlags(): Promise<Record<string, Required<Flags>>> {
  await ensureFlagsFile();
  try {
    const raw = await fs.readFile(FLAGS_FILE, "utf-8");
    const json = JSON.parse(raw) as WrappedFlags;
    const out: Record<string, Required<Flags>> = {};
    for (const [fid, rec] of Object.entries(json.franchises || {})) {
      out[fid] = normalizeFlags(rec);
    }
    return out;
  } catch {
    return {};
  }
}

async function writeFlags(franchiseId: string, patch: Partial<Flags>) {
  await ensureFlagsFile();
  let wrapped: WrappedFlags = { franchises: {} };
  try {
    const raw = await fs.readFile(FLAGS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as WrappedFlags;
    if (parsed && typeof parsed === "object" && typeof parsed.franchises === "object") {
      wrapped = parsed;
    }
  } catch {
    wrapped = { franchises: {} };
  }

  const cur = normalizeFlags(wrapped.franchises[franchiseId] || {});
  const next: Required<Flags> = {
    hideBilling: typeof patch.hideBilling === "boolean" ? patch.hideBilling : cur.hideBilling,
    hideHours: typeof patch.hideHours === "boolean" ? patch.hideHours : cur.hideHours,
    billingColumnVisibility: { ...cur.billingColumnVisibility },
  };

  if (patch.billingColumnVisibility && typeof patch.billingColumnVisibility === "object") {
    next.billingColumnVisibility = {
      ...cur.billingColumnVisibility,
      ...patch.billingColumnVisibility,
    };
  }

  wrapped.franchises[franchiseId] = next;
  await fs.writeFile(FLAGS_FILE, JSON.stringify(wrapped, null, 2), "utf-8");
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

  // NOTE: table name is dpinkney_TC.dbo.tblFranchies with column FranchiesEmail
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
  // Sessions (same-origin; if you change to cross-origin, add body parsers and CORS accordingly)
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

  // Current parent  ✅ required by your parent dashboard
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

      // ---- Read feature flags and compute policy for this parent ----
      let hideBillingForParent = false;
      let hideHoursForParent = false;
      let aggCols: Required<BillingColumnVisibility> = { ...DEFAULT_COLS };

      try {
        const flags = await readFlags(); // { [fid]: { hideBilling, hideHours, billingColumnVisibility } }
        const franchiseIds = Array.from(
          new Set(
            (studentsInfo || [])
              .map((s: any) => s?.FranchiseID)
              .filter((v: any) => v !== null && v !== undefined)
              .map((v: any) => String(v))
          )
        );

        hideBillingForParent = franchiseIds.some((fid) => !!flags[fid]?.hideBilling);
        hideHoursForParent = franchiseIds.some((fid) => !!flags[fid]?.hideHours);

        for (const fid of franchiseIds) {
          const rec = flags[fid];
          const cols = rec?.billingColumnVisibility ?? DEFAULT_COLS;
          aggCols = {
            hideDate: !!(aggCols.hideDate || cols.hideDate),
            hideStudent: !!(aggCols.hideStudent || cols.hideStudent),
            hideEventType: !!(aggCols.hideEventType || cols.hideEventType),
            hideAttendance: !!(aggCols.hideAttendance || cols.hideAttendance),
            hideAdjustment: !!(aggCols.hideAdjustment || cols.hideAdjustment),
          };
        }
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

      // Normalize to ISO for client date-only rendering (tolerate invalid dates)
      const sessionsOut = allSessions
        .map((s) => {
          let iso: string | null = null;
          if (s?.ScheduleDate instanceof Date) {
            iso = !isNaN(s.ScheduleDate.getTime()) ? s.ScheduleDate.toISOString() : null;
          } else {
            const d = new Date(String(s?.ScheduleDate));
            iso = !isNaN(d.getTime()) ? d.toISOString() : null;
          }
          return { ...s, ScheduleDateISO: iso };
        })
        .filter((s) => s.ScheduleDateISO !== null);

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

      // Billing
      const billingInfo = await getHoursBalance(inquiryIdNum);

      // If hours are hidden, zero out remaining_hours so the client can’t accidentally show it
      if (billingInfo && hideHoursForParent) {
        (billingInfo as any).remaining_hours = null;
      }

      res.json({
        students,
        sessions: sessionsOut,
        billing: billingInfo
          ? {
              currentBalance: "0.00",
              monthlyRate: "320.00",
              nextPaymentDate: "N/A",
              paymentMethod: "N/A",
              ...billingInfo,
            }
          : null,
        transactions: [],
        uiPolicy: {
          hideBilling: hideBillingForParent,
          hideHours: hideHoursForParent,
          billingColumnVisibility: aggCols,
        },
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

  /* ============================ Weekly Student Reviews ============================ */
  // GET /api/students/:studentId/reviews/week
  app.get("/api/students/:studentId/reviews/week", requireParentAuth, async (req, res) => {
    try {
      const sid = Number(req.params.studentId);
      if (!Number.isFinite(sid)) {
        return res.status(400).json({ message: "Invalid studentId" });
      }

      const allowedIds = (req.session.studentIds || []).map(Number);
      if (!allowedIds.includes(sid)) {
        return res.status(403).json({ message: "Unauthorized access to student" });
      }

      const today = new Date();
      const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      // Monday-of-this-week (assuming Monday as first day of week)
      const weekday = todayDateOnly.getDay(); // 0=Sun,1=Mon,...
      const diffToMonday = (weekday + 6) % 7; // days since Monday
      const monday = new Date(todayDateOnly);
      monday.setDate(todayDateOnly.getDate() - diffToMonday);

      const fromDate = monday.toISOString().slice(0, 10); // yyyy-mm-dd
      const tomorrow = new Date(todayDateOnly);
      tomorrow.setDate(todayDateOnly.getDate() + 1);
      const toDate = tomorrow.toISOString().slice(0, 10);

      const { rows, total } = await getStudentReviews(sid, {
        fromDate,
        toDate,
        offset: 0,
        limit: 50,
      });

      res.json({ rows, total, fromDate, toDate });
    } catch (e: any) {
      console.error("reviews/week error:", e);
      res.status(500).json({ message: "Failed to load reviews" });
    }
  });

  /* ============================ Bug Reports ============================ */
  // POST /api/bugs/report
  app.post("/api/bugs/report", requireParentAuth, async (req, res) => {
    try {
      const { message, page } = req.body || {};
      const userEmail = req.session.email || null;
      const inquiryId = req.session.inquiryId || null;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ message: "Bug message is required." });
      }

      await fs.mkdir(path.dirname(BUGS_FILE), { recursive: true });

      let existing: any[] = [];
      try {
        const raw = await fs.readFile(BUGS_FILE, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) existing = parsed;
      } catch (err: any) {
        if (err.code !== "ENOENT") {
          console.warn("bug_reports.json read/parse error:", err.message);
        }
        existing = [];
      }

      const newReport = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        message,
        page: page || null,
        user: {
          email: userEmail,
          inquiryId,
        },
        userAgent: req.get("user-agent") || null,
        ip: (req.headers["x-forwarded-for"] as string) || req.ip || null,
      };

      existing.push(newReport);

      await fs.writeFile(BUGS_FILE, JSON.stringify(existing, null, 2), "utf8");

      console.log("✅ Bug report written to:", BUGS_FILE);

      res.json({ success: true });
    } catch (err: any) {
      console.error("❌ Error writing bug report:", err);
      res.status(500).json({ message: "Failed to save bug report.", error: err?.message });
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
      const rec = all[fid] || normalizeFlags({});
      res.json({
        franchiseId: fid,
        hideBilling: rec.hideBilling,
        hideHours: rec.hideHours,
        billingColumnVisibility: rec.billingColumnVisibility,
      });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Failed to read flags" });
    }
  });

  // Accepts any subset of { hideBilling, hideHours, billingColumnVisibility }
  app.post("/api/admin/flags", requireAdminAuth, async (req, res) => {
    try {
      const fid = String(req.session.adminFranchiseId!);
      const patch: Partial<Flags> = {};

      // direct booleans
      if (typeof req.body?.hideBilling === "boolean") patch.hideBilling = !!req.body.hideBilling;
      if (typeof req.body?.hideHours === "boolean") patch.hideHours = !!req.body.hideHours;

      // nested object (full or partial)
      if (req.body?.billingColumnVisibility && typeof req.body.billingColumnVisibility === "object") {
        const bc = req.body.billingColumnVisibility as BillingColumnVisibility;
        const nextCols: BillingColumnVisibility = {};
        if (typeof bc.hideDate === "boolean") nextCols.hideDate = bc.hideDate;
        if (typeof bc.hideStudent === "boolean") nextCols.hideStudent = bc.hideStudent;
        if (typeof bc.hideEventType === "boolean") nextCols.hideEventType = bc.hideEventType;
        if (typeof bc.hideAttendance === "boolean") nextCols.hideAttendance = bc.hideAttendance;
        if (typeof bc.hideAdjustment === "boolean") nextCols.hideAdjustment = bc.hideAdjustment;
        patch.billingColumnVisibility = nextCols;
      }

      // also support { policy: { ... } } (back-compat)
      if (req.body?.policy && typeof req.body.policy === "object") {
        const p = req.body.policy;
        if (typeof p.hideBilling === "boolean") patch.hideBilling = !!p.hideBilling;
        if (typeof p.hideHours === "boolean") patch.hideHours = !!p.hideHours;
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ message: "No valid flags provided" });
      }

      await writeFlags(fid, patch);
      const all = await readFlags();
      const rec = all[fid] || normalizeFlags({});
      res.json({
        franchiseId: fid,
        hideBilling: rec.hideBilling,
        hideHours: rec.hideHours,
        billingColumnVisibility: rec.billingColumnVisibility,
      });
    } catch (e: any) {
      console.error("Failed to update flags:", e);
      res.status(500).json({ message: e?.message || "Failed to update flags" });
    }
  });

  /* ------------------------------------------------------------------ */
  /* Return HTTP server                                                  */
  /* ------------------------------------------------------------------ */
  const httpServer = createServer(app);
  return httpServer;
}
