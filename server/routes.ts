// server/routes.ts
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";

import {
  findInquiryByEmailAndPhone,
  getHoursBalance,
  getSessions,
  submitScheduleChangeRequest,
  getStudentReviews,
  getMasterScheduleByStudentId, // ✅ NEW
} from "./sqlServerStorage";

import { getPool, sql } from "./db"; // MSSQL connection (for tutoring club data)
import { pgQuery } from "./pg"; // Neon/Postgres query helper (for flags + bug reports)

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
/* Feature flags types                                                 */
/* ------------------------------------------------------------------ */
type BillingColumnVisibility = {
  hideDate?: boolean;
  hideStudent?: boolean;
  hideEventType?: boolean;
  hideAttendance?: boolean;
  hideAdjustment?: boolean;
};

type Flags = {
  hideBilling?: boolean;
  hideHours?: boolean;
  billingColumnVisibility?: BillingColumnVisibility;
};

const DEFAULT_COLS: Required<BillingColumnVisibility> = {
  hideDate: false,
  hideStudent: false,
  hideEventType: false,
  hideAttendance: false,
  hideAdjustment: false,
};

function normalizeFlags(f?: Flags): Required<Flags> {
  return {
    hideBilling: !!f?.hideBilling,
    hideHours: !!f?.hideHours,
    billingColumnVisibility: { ...DEFAULT_COLS, ...(f?.billingColumnVisibility ?? {}) },
  };
}

/** All policy_key values we store in franchise_policies */
const POLICY_KEYS = {
  hideBilling: "hideBilling",
  hideHours: "hideHours",
  hideDate: "hideDate",
  hideStudent: "hideStudent",
  hideEventType: "hideEventType",
  hideAttendance: "hideAttendance",
  hideAdjustment: "hideAdjustment",
} as const;

type PolicyKey = (typeof POLICY_KEYS)[keyof typeof POLICY_KEYS];

/**
 * Reads flags for one or more franchise IDs and returns:
 * { "6": { hideBilling, hideHours, billingColumnVisibility: {...} }, ... }
 */
async function getFlagsMap(franchiseIds: number[]): Promise<Record<string, Required<Flags>>> {
  if (!franchiseIds.length) return {};

  const { rows } = await pgQuery<{
    franchise_id: number;
    policy_key: string;
    policy_value: boolean;
  }>(
    `
      SELECT franchise_id, policy_key, policy_value
      FROM franchise_policies
      WHERE franchise_id = ANY($1::int[])
    `,
    [franchiseIds]
  );

  const out: Record<string, Required<Flags>> = {};
  for (const fid of franchiseIds) out[String(fid)] = normalizeFlags({});

  for (const r of rows) {
    const fid = String(r.franchise_id);
    const cur = out[fid] ?? normalizeFlags({});

    switch (r.policy_key) {
      case POLICY_KEYS.hideBilling:
        cur.hideBilling = !!r.policy_value;
        break;
      case POLICY_KEYS.hideHours:
        cur.hideHours = !!r.policy_value;
        break;

      case POLICY_KEYS.hideDate:
        cur.billingColumnVisibility.hideDate = !!r.policy_value;
        break;
      case POLICY_KEYS.hideStudent:
        cur.billingColumnVisibility.hideStudent = !!r.policy_value;
        break;
      case POLICY_KEYS.hideEventType:
        cur.billingColumnVisibility.hideEventType = !!r.policy_value;
        break;
      case POLICY_KEYS.hideAttendance:
        cur.billingColumnVisibility.hideAttendance = !!r.policy_value;
        break;
      case POLICY_KEYS.hideAdjustment:
        cur.billingColumnVisibility.hideAdjustment = !!r.policy_value;
        break;
    }

    out[fid] = cur;
  }

  return out;
}

/**
 * Upserts only the keys included in the patch.
 * Writes real booleans into policy_value.
 */
async function applyFlagsPatch(franchiseId: number, patch: Partial<Flags>): Promise<void> {
  const toUpsert: Array<{ key: PolicyKey; value: boolean }> = [];

  if (typeof patch.hideBilling === "boolean") {
    toUpsert.push({ key: POLICY_KEYS.hideBilling, value: !!patch.hideBilling });
  }
  if (typeof patch.hideHours === "boolean") {
    toUpsert.push({ key: POLICY_KEYS.hideHours, value: !!patch.hideHours });
  }

  if (patch.billingColumnVisibility && typeof patch.billingColumnVisibility === "object") {
    const raw = patch.billingColumnVisibility;

    if (typeof raw.hideDate === "boolean") toUpsert.push({ key: POLICY_KEYS.hideDate, value: !!raw.hideDate });
    if (typeof raw.hideStudent === "boolean") toUpsert.push({ key: POLICY_KEYS.hideStudent, value: !!raw.hideStudent });
    if (typeof raw.hideEventType === "boolean")
      toUpsert.push({ key: POLICY_KEYS.hideEventType, value: !!raw.hideEventType });
    if (typeof raw.hideAttendance === "boolean")
      toUpsert.push({ key: POLICY_KEYS.hideAttendance, value: !!raw.hideAttendance });
    if (typeof raw.hideAdjustment === "boolean")
      toUpsert.push({ key: POLICY_KEYS.hideAdjustment, value: !!raw.hideAdjustment });
  }

  if (!toUpsert.length) return;

  await pgQuery("BEGIN");
  try {
    for (const item of toUpsert) {
      await pgQuery(
        `
          INSERT INTO franchise_policies (franchise_id, policy_key, policy_value, updated_at)
          VALUES ($1::int, $2::text, $3::boolean, NOW())
          ON CONFLICT (franchise_id, policy_key)
          DO UPDATE SET
            policy_value = EXCLUDED.policy_value,
            updated_at = NOW()
        `,
        [franchiseId, item.key, item.value]
      );
    }
    await pgQuery("COMMIT");
  } catch (e) {
    await pgQuery("ROLLBACK");
    throw e;
  }
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
  // Sessions
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "tutoring-club-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // set true behind HTTPS
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );

  /* ============================ Parent Auth ============================ */

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, contactPhone } = req.body || {};
      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) {
        return res.status(401).json({
          message: "Invalid phone number. Please contact your tutoring center.",
        });
      }

      const parentInfo = inquiryData.inquiry;
      const studentsInfo = inquiryData.students || [];

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

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Could not log out" });
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", requireParentAuth, async (req, res) => {
    try {
      const contactPhone = req.session.contactPhone!;
      const email = req.session.email!;
      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      if (!inquiryData) return res.status(404).json({ message: "Parent not found" });

      const parentInfo = inquiryData.inquiry;
      const studentsInfo = inquiryData.students || [];

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

      // ---- Policy from Neon/Postgres ----
      let hideBillingForParent = false;
      let hideHoursForParent = false;
      let aggCols: Required<BillingColumnVisibility> = { ...DEFAULT_COLS };

      try {
        const franchiseIds = Array.from(
          new Set(
            (studentsInfo || [])
              .map((s: any) => s?.FranchiseID)
              .filter((v: any) => v !== null && v !== undefined)
              .map((v: any) => Number(v))
              .filter((n: any) => Number.isFinite(n))
          )
        );

        const map = await getFlagsMap(franchiseIds);

        hideBillingForParent = franchiseIds.some((fid) => !!map[String(fid)]?.hideBilling);
        hideHoursForParent = franchiseIds.some((fid) => !!map[String(fid)]?.hideHours);

        for (const fid of franchiseIds) {
          const rec = map[String(fid)] || normalizeFlags({});
          const cols = rec.billingColumnVisibility ?? DEFAULT_COLS;

          aggCols = {
            hideDate: !!(aggCols.hideDate || cols.hideDate),
            hideStudent: !!(aggCols.hideStudent || cols.hideStudent),
            hideEventType: !!(aggCols.hideEventType || cols.hideEventType),
            hideAttendance: !!(aggCols.hideAttendance || cols.hideAttendance),
            hideAdjustment: !!(aggCols.hideAdjustment || cols.hideAdjustment),
          };
        }
      } catch (e) {
        console.warn("[dashboard] flags query failed, default visible:", e);
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

      // Normalize to ISO for client
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
              new Date(nextUpcoming.ScheduleDateISO).toLocaleDateString("en-US", { weekday: "long" })
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

      const billingInfo = await getHoursBalance(inquiryIdNum);

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

  /* ============================ Master Schedule (NEW) ============================ */
  app.get("/api/students/:studentId/master-schedule", requireParentAuth, async (req, res) => {
    try {
      const sid = Number(req.params.studentId);
      if (!Number.isFinite(sid)) return res.status(400).json({ message: "Invalid studentId" });

      const allowedIds = (req.session.studentIds || []).map(Number);
      if (!allowedIds.includes(sid)) return res.status(403).json({ message: "Unauthorized access to student" });

      const rows = await getMasterScheduleByStudentId(sid);
      res.json({ rows });
    } catch (e: any) {
      console.error("master-schedule error:", e);
      res.status(500).json({ message: "Failed to load master schedule" });
    }
  });

  /* ============================ Schedule change ============================ */

  app.post("/api/schedule-change-request", requireParentAuth, async (req, res) => {
    try {
      const { studentId, currentSession, preferredDate, preferredTime, requestedChange, reason } = req.body || {};
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

  /* ============================ Center email helper ============================ */

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

  app.get("/api/students/:studentId/reviews/week", requireParentAuth, async (req, res) => {
    try {
      const sid = Number(req.params.studentId);
      if (!Number.isFinite(sid)) return res.status(400).json({ message: "Invalid studentId" });

      const allowedIds = (req.session.studentIds || []).map(Number);
      if (!allowedIds.includes(sid)) return res.status(403).json({ message: "Unauthorized access to student" });

      const today = new Date();
      const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      const weekday = todayDateOnly.getDay(); // 0=Sun,1=Mon,...
      const diffToMonday = (weekday + 6) % 7;
      const monday = new Date(todayDateOnly);
      monday.setDate(todayDateOnly.getDate() - diffToMonday);

      const fromDate = monday.toISOString().slice(0, 10);
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

  /* ============================ Bug Reports (Neon/Postgres) ============================ */
  // POST /api/bugs/report
  app.post("/api/bugs/report", requireParentAuth, async (req, res) => {
    try {
      const { message, page } = req.body || {};
      const userEmail = req.session.email || null;
      const inquiryId = req.session.inquiryId || null;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ message: "Bug message is required." });
      }

      // If you want to also capture franchise_id, grab it from any student in this session
      // (Optional)
      const contactPhone = req.session.contactPhone!;
      const email = req.session.email!;
      const inquiryData = await findInquiryByEmailAndPhone(email, contactPhone);
      const studentsInfo = inquiryData?.students || [];
      const firstFranchise = studentsInfo?.[0]?.FranchiseID;
      const franchiseId = Number.isFinite(Number(firstFranchise)) ? Number(firstFranchise) : null;

      // Adjust column names here to match YOUR bug_reports table schema
      await pgQuery(
        `
          INSERT INTO bug_reports
            (franchise_id, inquiry_id, user_email, page, message, user_agent, ip, created_at)
          VALUES
            ($1::int, $2::int, $3::text, $4::text, $5::text, $6::text, $7::text, NOW())
        `,
        [
          franchiseId,
          inquiryId ? Number(inquiryId) : null,
          userEmail,
          page || null,
          message,
          req.get("user-agent") || null,
          (req.headers["x-forwarded-for"] as string) || req.ip || null,
        ]
      );

      res.json({ success: true });
    } catch (err: any) {
      console.error("❌ Error saving bug report to Neon:", err);
      res.status(500).json({ message: "Failed to save bug report.", error: err?.message });
    }
  });

  /* ============================ Admin Auth ============================ */

  app.post("/api/admin/login", async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ message: "email and password are required" });

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

      if (!rs.recordset.length) return res.status(401).json({ message: "Invalid credentials" });

      const row = rs.recordset[0];
      const adminEmail = String(row.AdminEmail || "").trim();
      const franchiseId = row.FranchiseID != null ? String(row.FranchiseID) : "";

      if (!franchiseId) return res.status(401).json({ message: "No franchise mapping for this admin email" });

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

  /* ============================ Admin Flags API (Neon/Postgres) ============================ */

  app.get("/api/admin/flags", requireAdminAuth, async (req, res) => {
    try {
      const fid = Number(req.session.adminFranchiseId!);
      if (!Number.isFinite(fid)) return res.status(400).json({ message: "Invalid franchise id" });

      const map = await getFlagsMap([fid]);
      const rec = map[String(fid)] || normalizeFlags({});

      res.json({
        franchiseId: String(fid),
        hideBilling: rec.hideBilling,
        hideHours: rec.hideHours,
        billingColumnVisibility: rec.billingColumnVisibility,
      });
    } catch (e: any) {
      console.error("admin/flags GET error:", e);
      res.status(500).json({ message: e?.message || "Failed to read flags" });
    }
  });

  app.post("/api/admin/flags", requireAdminAuth, async (req, res) => {
    try {
      const fid = Number(req.session.adminFranchiseId!);
      if (!Number.isFinite(fid)) return res.status(400).json({ message: "Invalid franchise id" });

      const patch: Partial<Flags> = {};

      if (typeof req.body?.hideBilling === "boolean") patch.hideBilling = !!req.body.hideBilling;
      if (typeof req.body?.hideHours === "boolean") patch.hideHours = !!req.body.hideHours;

      if (req.body?.billingColumnVisibility && typeof req.body.billingColumnVisibility === "object") {
        const bc = req.body.billingColumnVisibility as BillingColumnVisibility;
        patch.billingColumnVisibility = {};
        if (typeof bc.hideDate === "boolean") patch.billingColumnVisibility.hideDate = bc.hideDate;
        if (typeof bc.hideStudent === "boolean") patch.billingColumnVisibility.hideStudent = bc.hideStudent;
        if (typeof bc.hideEventType === "boolean") patch.billingColumnVisibility.hideEventType = bc.hideEventType;
        if (typeof bc.hideAttendance === "boolean") patch.billingColumnVisibility.hideAttendance = bc.hideAttendance;
        if (typeof bc.hideAdjustment === "boolean") patch.billingColumnVisibility.hideAdjustment = bc.hideAdjustment;
      }

      // back-compat: { policy: { ... } }
      if (req.body?.policy && typeof req.body.policy === "object") {
        const p = req.body.policy;
        if (typeof p.hideBilling === "boolean") patch.hideBilling = !!p.hideBilling;
        if (typeof p.hideHours === "boolean") patch.hideHours = !!p.hideHours;
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ message: "No valid flags provided" });
      }

      await applyFlagsPatch(fid, patch);

      const map = await getFlagsMap([fid]);
      const rec = map[String(fid)] || normalizeFlags({});

      res.json({
        franchiseId: String(fid),
        hideBilling: rec.hideBilling,
        hideHours: rec.hideHours,
        billingColumnVisibility: rec.billingColumnVisibility,
      });
    } catch (e: any) {
      console.error("admin/flags POST error:", e);
      res.status(500).json({ message: e?.message || "Failed to update flags" });
    }
  });

  /* ------------------------------------------------------------------ */
  /* Return HTTP server                                                  */
  /* ------------------------------------------------------------------ */
  const httpServer = createServer(app);
  return httpServer;
}
