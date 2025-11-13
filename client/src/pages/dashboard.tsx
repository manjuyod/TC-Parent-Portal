import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import logoPath from "@assets/logo_1755332058201.webp";
import billingIconPath from "@assets/tcBillingIcon_1755332058201.png";
import scheduleIconPath from "@assets/tcScheduleIcon_1755332058202.jpg";

type Tab = "home" | "schedule" | "billing";

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

/* Safer JSON fetch (catches accidental HTML from SPA fallbacks) */
async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  const text = await r.text();

  const head = text.trim().slice(0, 20).toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html")) {
    throw new Error(`Got HTML instead of JSON from ${url}. Check API path/server.`);
  }
  if (!r.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.message || `GET ${url} failed (${r.status})`);
    } catch {
      throw new Error(text || `GET ${url} failed (${r.status})`);
    }
  }
  return JSON.parse(text) as T;
}

export default function Dashboard() {
  const [selectedStudent, setSelectedStudent] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("home");

  // --- Schedule-change form state ---
  const [reqStudentId, setReqStudentId] = useState<number | null>(null);
  const [reqStudent, setReqStudent] = useState("");
  const [reqCurrent, setReqCurrent] = useState("");
  const [reqDate, setReqDate] = useState("");
  const [reqTime, setReqTime] = useState("");
  const [reqChange, setReqChange] = useState("");
  const [reqReason, setReqReason] = useState("");

  const { data: user } = useQuery({ queryKey: ["/api/auth/me"] });
  const { data: dashboardData } = useQuery({ queryKey: ["/api/dashboard"], enabled: !!user });

  const hideBilling = !!dashboardData?.uiPolicy?.hideBilling;
  const hideHours = !!dashboardData?.uiPolicy?.hideHours;

  const cols: Required<BillingColumnVisibility> = {
    ...DEFAULT_COLS,
    ...(dashboardData?.uiPolicy?.billingColumnVisibility ?? {}),
  };

  // If someone somehow lands on 'billing' while hidden, bounce to home
  useEffect(() => {
    if (activeTab === "billing" && hideBilling) setActiveTab("home");
  }, [activeTab, hideBilling]);

  // ===== Helpers =====
  const parseDateOnly = (isoOrAny: string | Date | null | undefined): Date | null => {
    if (!isoOrAny) return null;
    if (typeof isoOrAny === "string") {
      const d = new Date(isoOrAny);
      if (!isNaN(d.getTime())) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }
      const iso = isoOrAny.length >= 10 ? isoOrAny.slice(0, 10) : isoOrAny;
      const d2 = new Date(`${iso}T00:00:00`);
      return isNaN(d2.getTime()) ? null : d2;
    }
    if (isoOrAny instanceof Date) {
      return new Date(isoOrAny.getFullYear(), isoOrAny.getMonth(), isoOrAny.getDate());
    }
    const d3 = new Date(String(isoOrAny));
    return isNaN(d3.getTime()) ? null : new Date(d3.getFullYear(), d3.getMonth(), d3.getDate());
  };

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const formatMonthDayYear = (d: Date | null) =>
    d && !isNaN(d.getTime())
      ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : "N/A";

  const students: any[] = dashboardData?.students ?? [];
  const sessions: any[] = dashboardData?.sessions ?? [];
  const billing = dashboardData?.billing;

  const parseSessionDate = (s: any): Date | null => {
    const iso: string | undefined = s?.ScheduleDateISO;
    if (iso) return parseDateOnly(iso);
    return parseDateOnly(s?.ScheduleDate);
  };

  const sessionSortKey = (s: any): number => {
    const d = parseSessionDate(s)?.getTime() ?? 0;
    const tid = Number.isFinite(Number(s?.TimeID)) ? Number(s.TimeID) : 0;
    return d * 1000 + tid;
  };

  const sessionsForSelected: any[] = useMemo(() => {
    if (!selectedStudent || !sessions.length) return [];
    return sessions.filter((s: any) => s.studentName === selectedStudent);
  }, [selectedStudent, sessions]);

  const recentSessions = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    return sessionsForSelected
      .filter((s) => {
        const d = parseSessionDate(s);
        return d !== null && d < today && d >= thirtyDaysAgo;
      })
      .sort((a, b) => sessionSortKey(b) - sessionSortKey(a))
      .slice(0, 5);
  }, [sessionsForSelected]);

  const upcomingSessions = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return sessionsForSelected
      .filter((s) => {
        const d = parseSessionDate(s);
        return d !== null && d >= today;
      })
      .sort((a, b) => sessionSortKey(a) - sessionSortKey(b))
      .slice(0, 4);
  }, [sessionsForSelected]);

  const upcomingAllForSelected = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return sessionsForSelected
      .filter((s) => {
        const d = parseSessionDate(s);
        return d !== null && d >= today;
      })
      .sort((a, b) => sessionSortKey(a) - sessionSortKey(b));
  }, [sessionsForSelected]);

  // ================== BILLING rows: 30 most current sessions (except today) ==================
  const billingRows: any[] = billing?.account_details ?? [];

  const getRowDate = (row: any): Date | null => {
    const raw =
      row?.Date ??
      row?.TransactionDate ??
      row?.PostedDate ??
      row?.FormattedDate ??
      null;
    return parseDateOnly(raw);
  };

  const isSessionRow = (row: any) => {
    const att = String(row?.Attendance ?? "").trim();
    const evt = String(row?.EventType ?? "").toLowerCase();
    return !!att || evt.includes("attendance");
  };

  const current30SessionRows = useMemo(() => {
    const today = new Date();
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    return (billingRows || [])
      .filter(isSessionRow)
      .filter((r) => {
        const d = getRowDate(r);
        return d !== null && !sameDay(d, todayDateOnly);
      })
      .sort((a, b) => {
        const da = getRowDate(a)?.getTime() ?? 0;
        const db = getRowDate(b)?.getTime() ?? 0;
        if (db !== da) return db - da; // newest first
        const aa = Number(a.Adjustment ?? 0);
        const ab = Number(b.Adjustment ?? 0);
        return Math.abs(ab) - Math.abs(aa);
      })
      .slice(0, 30);
  }, [billingRows]);

  // ------------------- Reviews fetch (Today + This Week) -------------------
  type ReviewRow = {
    SessionID: number;
    SessionDateISO: string;
    CoveredMaterialsScore: number | null;
    CoveredMaterialsText: string | null;
    StudentAttitudeText: string | null;
    OtherFeedback: string | null;
  };
  type WeeklyReviewsResp = { rows: ReviewRow[]; total: number; fromDate: string; toDate: string };

  const selectedStudentId: number | null = useMemo(() => {
    if (!selectedStudent) return null;
    const s = students.find((x: any) => x.name === selectedStudent);
    return s ? Number(s.id) : null;
  }, [selectedStudent, students]);

  const {
    data: weeklyReviews,
    isLoading: reviewsLoading,
    error: reviewsError,
  } = useQuery<WeeklyReviewsResp>({
    queryKey: ["/api/students", selectedStudentId, "reviews", "week"],
    enabled: selectedStudentId != null,
    queryFn: () =>
      getJSON<WeeklyReviewsResp>(`/api/students/${selectedStudentId}/reviews/week`),
  });

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  function buildEmailParts() {
    const subject = `Schedule Change Request — ${reqStudent || "Student"}`.replace(/\s+/g, " ").trim();

    const prettyDate = reqDate
      ? new Date(reqDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
      : "(not provided)";
    const prettyTime = reqTime || "(not provided)";

    const body = [
      `Parent Portal Schedule Change Request`,
      ``,
      `Student: ${reqStudent || "(not selected)"}`,
      `Current session: ${reqCurrent || "(not provided)"}`,
      `Requested new start: ${prettyDate} at ${prettyTime}`,
      ``,
      `Requested change:`,
      `${reqChange || "(no details)"}`,
      ``,
      `Reason:`,
      `${reqReason || "(none)"}`,
      ``,
      `— Sent from Tutoring Club Parent Portal`,
    ].join("\n");

    return {
      subjectEnc: encodeURIComponent(subject),
      bodyEnc: encodeURIComponent(body),
    };
  }

  async function resolveCenterEmail(): Promise<string> {
    if (reqStudentId != null) {
      const s = students.find((x: any) => x.id === reqStudentId);
      if (s?.centerEmail) return String(s.centerEmail);
      try {
        const r = await fetch(`/api/center-email?studentId=${reqStudentId}`);
        if (r.ok) {
          const d = await r.json();
          if (d?.centerEmail) return d.centerEmail;
        }
      } catch {}
    }
    return "center@example.com";
  }

  function openGmailCompose(to: string) {
    const { subjectEnc, bodyEnc } = buildEmailParts();
    const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${subjectEnc}&body=${bodyEnc}`;
    const w = window.open(gmail, "_blank", "noopener,noreferrer");
    if (!w) {
      const outlook = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${subjectEnc}&body=${bodyEnc}`;
      const w2 = window.open(outlook, "_blank", "noopener,noreferrer");
      if (!w2) {
        const mailto = `mailto:${encodeURIComponent(to)}?subject=${subjectEnc}&body=${bodyEnc}`;
        window.location.href = mailto;
      }
    }
  }

  function openMailto(to: string) {
    const { subjectEnc, bodyEnc } = buildEmailParts();
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${subjectEnc}&body=${bodyEnc}`;
    window.location.href = mailto;
  }

  async function handleScheduleSubmit() {
    if (reqStudentId == null) {
      alert("Please select a student.");
      return;
    }
    const to = await resolveCenterEmail();
    const isMobile = /android|iphone|ipad|ipod|windows phone/i.test(navigator.userAgent);
    if (isMobile) openMailto(to);
    else openGmailCompose(to);
  }

  /* -------- Quick Actions inline (under Logout) -------- */
  function QuickActionsInline() {
    return (
      <div className="mt-2 d-flex gap-2 flex-wrap justify-content-end">
        <button className="btn btn-sm btn-primary" onClick={() => setActiveTab("schedule")}>
          <i className="fas fa-calendar-edit me-2"></i>
          Request Schedule Change
        </button>
        {!hideBilling && (
          <button className="btn btn-sm btn-outline-primary" onClick={() => setActiveTab("billing")}>
            <img
              src={billingIconPath}
              alt="Billing Icon"
              style={{ width: "14px", height: "14px", marginRight: "6px" }}
            />
            View Billing Details
          </button>
        )}
      </div>
    );
  }

  if (!user || !dashboardData) {
    return (
      <div className="min-h-screen bg-gray-50 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary mb-4" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  /* ===================== SCHEDULE TAB ===================== */
  if (activeTab === "schedule") {
    return (
      <div>
        {/* Header */}
        <div className="header-section">
          <div className="container">
            <div className="d-flex justify-content-between align-items-center">
              <div className="header-brand">
                <img src={logoPath} alt="Tutoring Club Logo" className="header-logo" />
                <h1 className="header-title">Tutoring Club Parent Portal</h1>
              </div>
              <div className="text-end">
                <div className="text-dark mb-1">
                  <strong>Welcome, {user.parent.name}!</strong>
                </div>
                <div className="text-muted small mb-2">
                  Students: {students.map((s: any) => s.name).join(", ")}
                </div>
                <button onClick={handleLogout} className="btn btn-outline-primary btn-sm">
                  Logout
                </button>
                <QuickActionsInline />
              </div>
            </div>
          </div>
        </div>

        <div className="container mt-4">
          {/* Tabs */}
          <ul className="nav nav-tabs" role="tablist">
            <li className="nav-item" role="presentation">
              <a className="nav-link" href="#" onClick={(e) => { e.preventDefault(); setActiveTab("home"); }}>
                Home
              </a>
            </li>
            <li className="nav-item" role="presentation">
              <a className="nav-link active" href="#" onClick={(e) => e.preventDefault()}>
                Schedule Updates
              </a>
            </li>
            {!hideBilling && (
              <li className="nav-item" role="presentation">
                <a className="nav-link" href="#" onClick={(e) => { e.preventDefault(); setActiveTab("billing"); }}>
                  Billing Information
                </a>
              </li>
            )}
          </ul>

          <h3 style={{ marginBottom: "30px" }}>Schedule Management</h3>

          {/* Upcoming full table */}
          {selectedStudent && upcomingAllForSelected.length > 0 ? (
            <div className="card mb-4">
              <div className="card-header">
                <h5 style={{ color: "white", margin: 0 }}>
                  Upcoming Schedule for {selectedStudent} ({upcomingAllForSelected.length})
                </h5>
              </div>
              <div className="card-body">
                <div className="table-container">
                  <table className="table table-striped table-sm">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Time</th>
                        <th>Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingAllForSelected.map((session: any, index: number) => {
                        const d = parseSessionDate(session);
                        return (
                          <tr key={index}>
                            <td>{session.Day || "N/A"}</td>
                            <td>{session.Time || "N/A"}</td>
                            <td>{formatMonthDayYear(d)}</td>
                            <td>Active</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : selectedStudent ? (
            <div className="alert alert-info">No upcoming sessions for {selectedStudent}.</div>
          ) : (
            <div className="alert alert-info">Please select a student to view upcoming schedule.</div>
          )}

          {/* ======= Schedule Change Request Form (refined) ======= */}
          <div className="card">
            <div className="card-header d-flex align-items-center">
              <i className="fas fa-calendar-check me-2"></i>
              <h5 className="m-0">Request Schedule Change</h5>
            </div>

            <div className="card-body">
              <p className="text-muted mb-4">
                Use this form to request a new start date/time or describe a change to your student’s
                current session. We’ll email your center with the details.
              </p>

              <form onSubmit={(e) => e.preventDefault()} noValidate>
                {/* Row 1: Student + Current Session */}
                <div className="row g-3">
                  <div className="col-md-6">
                    <label htmlFor="student_name" className="form-label">
                      Student <span className="text-danger">*</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text">
                        <i className="fas fa-user-graduate" aria-hidden="true"></i>
                      </span>
                      <select
                        className="form-control"
                        id="student_name"
                        name="student_name"
                        autoComplete="name"
                        required
                        value={reqStudentId ?? ""}
                        onChange={(e) => {
                          const id = e.target.value ? Number(e.target.value) : null;
                          setReqStudentId(id);
                          const name = students.find((s: any) => s.id === id)?.name || "";
                          setReqStudent(name);
                        }}
                      >
                        <option value="">Select a student…</option>
                        {students.map((student: any) => (
                          <option key={student.id} value={student.id}>
                            {student.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-text">Choose the student this change applies to.</div>
                  </div>

                  <div className="col-md-6">
                    <label htmlFor="current_session" className="form-label">
                      Current Session <span className="text-danger">*</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text">
                        <i className="fas fa-clock" aria-hidden="true"></i>
                      </span>
                      <input
                        type="text"
                        className="form-control"
                        id="current_session"
                        name="current_session"
                        placeholder="e.g., Monday 3:00 PM"
                        autoComplete="off"
                        required
                        value={reqCurrent}
                        onChange={(e) => setReqCurrent(e.target.value)}
                      />
                    </div>
                    <div className="form-text">Tell us the student’s current day/time.</div>
                  </div>
                </div>

                <hr className="my-4" />

                {/* Row 2: Preferred Date + Time */}
                <div className="row g-3">
                  <div className="col-md-6">
                    <label htmlFor="preferred_date" className="form-label">
                      New Schedule Start Date <span className="text-danger">*</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text">
                        <i className="fas fa-calendar-day" aria-hidden="true"></i>
                      </span>
                      <input
                        type="date"
                        className="form-control"
                        id="preferred_date"
                        name="preferred_date"
                        autoComplete="off"
                        required
                        value={reqDate}
                        onChange={(e) => setReqDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <label htmlFor="preferred_time" className="form-label">
                      New Schedule Start Time <span className="text-danger">*</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text">
                        <i className="fas fa-hourglass-start" aria-hidden="true"></i>
                      </span>
                      <input
                        type="time"
                        className="form-control"
                        id="preferred_time"
                        name="preferred_time"
                        autoComplete="off"
                        required
                        value={reqTime}
                        onChange={(e) => setReqTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <hr className="my-4" />

                {/* Row 3: Requested Change + Reason */}
                <div className="row g-3">
                  <div className="col-md-7">
                    <label htmlFor="requested_change" className="form-label">
                      Requested Change <span className="text-danger">*</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text">
                        <i className="fas fa-pen" aria-hidden="true"></i>
                      </span>
                      <textarea
                        className="form-control"
                        id="requested_change"
                        name="requested_change"
                        rows={4}
                        placeholder="Describe the change you're requesting (e.g., move to Tue/Thu at 4:00 PM)…"
                        autoComplete="off"
                        required
                        value={reqChange}
                        onChange={(e) => setReqChange(e.target.value)}
                      />
                    </div>
                    <div className="form-text">Please include any specific days, times, or constraints.</div>
                  </div>

                  <div className="col-md-5">
                    <label htmlFor="reason" className="form-label">
                      Reason
                    </label>
                    <div className="input-group">
                      <span className="input-group-text">
                        <i className="fas fa-comment-dots" aria-hidden="true"></i>
                      </span>
                      <textarea
                        className="form-control"
                        id="reason"
                        name="reason"
                        rows={4}
                        placeholder="Briefly share the reason for this change…"
                        autoComplete="off"
                        value={reqReason}
                        onChange={(e) => setReqReason(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="d-flex flex-wrap gap-2 mt-4">
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={handleScheduleSubmit}
                  >
                    <i className="fas fa-paper-plane me-2"></i>
                    Submit Request
                  </button>

                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={() => {
                      setReqStudentId(null);
                      setReqStudent("");
                      setReqCurrent("");
                      setReqDate("");
                      setReqTime("");
                      setReqChange("");
                      setReqReason("");
                    }}
                  >
                    <i className="fas fa-rotate-left me-2"></i>
                    Clear
                  </button>
                </div>
              </form>
            </div>
          </div>
          {/* ======= /Schedule Change Request Form ======= */}
        </div>
      </div>
    );
  }

  /* ===================== BILLING TAB (visible only when allowed) ===================== */
  if (activeTab === "billing" && !hideBilling) {
    return (
      <div>
        {/* Header */}
        <div className="header-section">
          <div className="container">
            <div className="d-flex justify-content-between align-items-center">
              <div className="header-brand">
                <img src={logoPath} alt="Tutoring Club Logo" className="header-logo" />
                <h1 className="header-title">Tutoring Club Parent Portal</h1>
              </div>
              <div className="text-end">
                <div className="text-dark mb-1">
                  <strong>Welcome, {user.parent.name}!</strong>
                </div>
                <div className="text-muted small mb-2">
                  Students: {students.map((s: any) => s.name).join(", ")}
                </div>
                <button onClick={handleLogout} className="btn btn-outline-primary btn-sm">
                  Logout
                </button>
                <QuickActionsInline />
              </div>
            </div>
          </div>
        </div>

        <div className="container mt-4">
          {/* Tabs */}
          <ul className="nav nav-tabs" role="tablist">
            <li className="nav-item" role="presentation">
              <a className="nav-link" href="#" onClick={(e) => { e.preventDefault(); setActiveTab("home"); }}>
                Home
              </a>
            </li>
            <li className="nav-item" role="presentation">
              <a className="nav-link" href="#" onClick={(e) => { e.preventDefault(); setActiveTab("schedule"); }}>
                Schedule Updates
              </a>
            </li>
            {!hideBilling && (
              <li className="nav-item" role="presentation">
                <a className="nav-link active" href="#" onClick={(e) => e.preventDefault()}>
                  Billing Information
                </a>
              </li>
            )}
          </ul>

          {/* Summary (hours remaining) */}
          <div className="card mb-4">
            <div className="card-header">
              <h5 style={{ color: "white", margin: 0 }}>Account Balance Summary</h5>
            </div>
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div>
                  <div className="text-muted small mb-1">Hours Remaining</div>
                  <div className="h4 mb-0" style={{ color: "var(--tutoring-blue)" }}>
                    {hideHours
                      ? "Restricted"
                      : (typeof billing?.remaining_hours === "number"
                          ? billing.remaining_hours.toFixed(1)
                          : "0.0") + " hours"}
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-muted small mb-1">Students</div>
                  <div className="fw-semibold">
                    {students.map((s: any) => s.name).join(", ")}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Account Details: 30 MOST CURRENT SESSIONS (EXCEPT TODAY) */}
          <div className="card mb-4">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 style={{ color: "white", margin: 0 }}>Account Details</h5>
              <small className="text-light">30 most current sessions (excluding today)</small>
            </div>
            <div className="card-body">
              <div className="table-container">
                <table className="table table-striped table-sm">
                  <thead>
                    <tr>
                      {!cols.hideDate && <th style={{ width: 130 }}>Date</th>}
                      {!cols.hideStudent && <th>Student</th>}
                      {!cols.hideEventType && <th>Event Type</th>}
                      {!cols.hideAttendance && <th>Attendance</th>}
                      {!cols.hideAdjustment && (
                        <th className="text-end" style={{ width: 110 }}>Adjustment</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {current30SessionRows.length ? (
                      current30SessionRows.map((detail: any, index: number) => {
                        const d = getRowDate(detail);
                        const dateLabel = formatMonthDayYear(d);

                        const adjNum = Number(detail.Adjustment ?? 0);
                        const adjClass =
                          Number.isFinite(adjNum) && adjNum !== 0
                            ? adjNum > 0
                              ? "text-success"
                              : "text-danger"
                            : "";

                        return (
                          <tr key={index}>
                            {!cols.hideDate && <td>{dateLabel}</td>}
                            {!cols.hideStudent && <td>{detail.Student || "N/A"}</td>}
                            {!cols.hideEventType && <td>{detail.EventType || "N/A"}</td>}
                            {!cols.hideAttendance && <td>{detail.Attendance || "N/A"}</td>}
                            {!cols.hideAdjustment && (
                              <td className={`text-end ${adjClass}`}>
                                {Number.isFinite(adjNum)
                                  ? `${adjNum > 0 ? "+" : ""}${adjNum.toFixed(2)}`
                                  : String(detail.Adjustment ?? 0)}
                              </td>
                            )}
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center text-muted">
                          No session records available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* If all columns are hidden, show a friendly message */}
                {cols.hideDate &&
                  cols.hideStudent &&
                  cols.hideEventType &&
                  cols.hideAttendance &&
                  cols.hideAdjustment && (
                    <div className="alert alert-info mt-3">
                      Columns are hidden by your center. If you feel this is a mistake, please contact the center.
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ===================== HOME ===================== */
  return (
    <div>
      {/* Header */}
      <div className="header-section">
        <div className="container">
          <div className="d-flex justify-content-between align-items-center">
            <div className="header-brand">
              <img src={logoPath} alt="Tutoring Club Logo" className="header-logo" />
              <h1 className="header-title">Tutoring Club Parent Portal</h1>
            </div>
            <div className="text-end">
              <div className="text-dark mb-1">
                <strong>Welcome, {user.parent.name}!</strong>
              </div>
              <div className="text-muted small mb-2">
                Students: {students.map((s: any) => s.name).join(", ")}
              </div>
              <button onClick={handleLogout} className="btn btn-outline-primary btn-sm">Logout</button>
              <QuickActionsInline />
            </div>
          </div>
        </div>
      </div>

      <div className="container mt-4">
        {/* Tabs */}
        <ul className="nav nav-tabs" role="tablist">
          <li className="nav-item" role="presentation">
            <a className="nav-link active" href="#" onClick={(e) => e.preventDefault()}>
              Home
            </a>
          </li>
          <li className="nav-item" role="presentation">
            <a className="nav-link" href="#" onClick={(e) => { e.preventDefault(); setActiveTab("schedule"); }}>
              Schedule Updates
            </a>
          </li>
          {!hideBilling && (
            <li className="nav-item" role="presentation">
              <a className="nav-link" href="#" onClick={(e) => { e.preventDefault(); setActiveTab("billing"); }}>
                Billing Information
              </a>
            </li>
          )}
        </ul>

        {/* === Instructor Reviews (Today + This Week) === */}
        <div className="mb-4">
          <div className="card">
            <div className="card-header">
              <h5 className="m-0">
                <i className="fas fa-comments me-2" aria-hidden="true"></i>
                Here is what our tutors are saying about {selectedStudent}
              </h5>
            </div>
            <div className="card-body">
              {!selectedStudent ? (
                <div className="alert alert-info">Select a student to view reviews.</div>
              ) : reviewsLoading ? (
                <div className="text-muted">Loading reviews…</div>
              ) : reviewsError ? (
                <div className="alert alert-danger">
                  {(reviewsError as any)?.message || "Failed to load reviews"}
                </div>
              ) : (weeklyReviews?.rows?.length ?? 0) === 0 ? (
                <div className="alert alert-secondary">No reviews for today or this week.</div>
              ) : (
                <div style={{ maxHeight: 420, overflowY: "auto" }}>
                  {(() => {
                    const rows = weeklyReviews!.rows;
                    const todayISO = new Date().toISOString().slice(0, 10);

                    const todayRows = rows.filter(r => r.SessionDateISO === todayISO);
                    const weekRows  = rows.filter(r => r.SessionDateISO !== todayISO);

                    const formatDate = (iso: string) => {
                      const d = new Date(iso + "T00:00:00");
                      return d.toLocaleDateString("en-US", {
                        year: "numeric", month: "long", day: "numeric"
                      });
                    };

                    const Item = ({ r }: { r: ReviewRow }) => (
                      <div className="mb-3 pb-3" style={{ borderBottom: "1px solid #eee" }}>
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <div className="fw-semibold" style={{ color: "var(--tutoring-blue)" }}>
                              {formatDate(r.SessionDateISO)}
                            </div>
      
                          </div>
                          {r.CoveredMaterialsScore != null && (
                            <span className="badge bg-primary">Materials: {r.CoveredMaterialsScore}</span>
                          )}
                        </div>

                        {r.CoveredMaterialsText && (
                          <div className="mt-2">
                            <div className="small text-uppercase text-muted">Covered Materials</div>
                            <div>{r.CoveredMaterialsText}</div>
                          </div>
                        )}

                        {r.StudentAttitudeText && (
                          <div className="mt-2">
                            <div className="small text-uppercase text-muted">Student Attitude</div>
                            <div>{r.StudentAttitudeText}</div>
                          </div>
                        )}

                        {r.OtherFeedback && (
                          <div className="mt-2">
                            <div className="small text-uppercase text-muted">Other Feedback</div>
                            <div>{r.OtherFeedback}</div>
                          </div>
                        )}
                      </div>
                    );

                    return (
                      <>
                        {todayRows.length > 0 && (
                          <>
                            <div className="mb-2">
                              <span className="badge bg-warning text-dark">Today</span>
                            </div>
                            {todayRows.map((r, i) => <Item key={`t-${i}`} r={r} />)}
                          </>
                        )}

                        {weekRows.length > 0 && (
                          <>
                            {todayRows.length > 0 && <div className="mt-2 mb-2 small text-muted">Earlier this week</div>}
                            {weekRows.map((r, i) => <Item key={`w-${i}`} r={r} />)}
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="row mb-4">
          {/* Left: Student selector */}
          <div className="col-md-6 mb-3">
            <div className="card">
              <div className="card-body d-flex justify-content-between align-items-start">
                <div className="flex-grow-1">
                  <p className="text-muted mb-2 small text-uppercase">Student Information</p>
                  <select
                    className="form-control"
                    value={selectedStudent}
                    onChange={(e) => setSelectedStudent(e.target.value)}
                    style={{
                      fontSize: "16px",
                      fontWeight: 600,
                      color: "var(--tutoring-blue)",
                      background: "white",
                      border: "2px solid #e0e0e0",
                    }}
                  >
                    <option value="">Select a student</option>
                    {students.map((student: any) => (
                      <option key={student.id} value={student.name}>
                        {student.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-muted small mb-0 mt-1">Choose student to view details</p>
                </div>
                <div className="text-end">
                  <i className="fas fa-user" style={{ color: "var(--tutoring-orange)", fontSize: "24px" }}></i>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Account Balance (Quick Actions now live in header) */}
          <div className="col-md-6 mb-3">
            {!hideHours && (
              <div
                className="card"
                style={{ cursor: "pointer", transition: "transform 0.2s ease" }}
                onClick={() => setActiveTab("billing")}
              >
                <div className="card-body d-flex justify-content-between align-items-start">
                  <div>
                    <p className="text-muted mb-1 small text-uppercase">Account Balance</p>
                    <h4 className="mb-1" style={{ color: "var(--tutoring-blue)" }}>
                      {typeof billing?.remaining_hours === "number"
                        ? billing.remaining_hours.toFixed(1)
                        : "0.0"}{" "}
                      hours
                    </h4>
                    <p className="text-muted small mb-0">Hours remaining</p>
                  </div>
                  <div className="text-end">
                    <i className="fas fa-hourglass" style={{ color: "var(--tutoring-orange)", fontSize: "24px" }}></i>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Dashboard Grid (Recent + Upcoming) */}
        <div className="row">
          {/* Recent Sessions (last 30 days) */}
          <div className="col-lg-6 mb-4">
            <div className="card">
              <div className="card-header">
                <h6>
                  <img src={scheduleIconPath} alt="Schedule Icon" style={{ width: "20px", height: "20px", marginRight: "8px" }} />
                  Recent Sessions (Last 30 Days)
                </h6>
              </div>
              <div className="card-body">
                {selectedStudent && recentSessions.length > 0 ? (
                  <div className="timeline-container" style={{ maxHeight: "300px", overflowY: "auto" }}>
                    {recentSessions.map((session: any, index: number) => {
                      const d = parseSessionDate(session);
                      return (
                        <div key={index} className="timeline-item mb-3 pb-3" style={{ borderBottom: "1px solid #eee" }}>
                          <div className="d-flex">
                            <div className="timeline-marker me-3 mt-1">
                              <div style={{ width: "8px", height: "8px", background: "var(--tutoring-orange)", borderRadius: "50%" }}></div>
                            </div>
                            <div className="flex-grow-1">
                              <h6 className="mb-1" style={{ color: "var(--tutoring-blue)" }}>Session</h6>
                              <p className="mb-1 small">{formatMonthDayYear(d)}</p>
                              <p className="mb-0 text-muted small">
                                {(session?.Day || "N/A")} • {(session?.Time || "N/A")}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : selectedStudent ? (
                  <div className="alert alert-info small">No recent sessions found for {selectedStudent}.</div>
                ) : (
                  <div className="alert alert-info small">Select a student to view recent sessions.</div>
                )}
              </div>
            </div>
          </div>

          {/* Upcoming Sessions (cap 4) */}
          <div className="col-lg-6 mb-4">
            <div className="card">
              <div className="card-header">
                <h6>
                  <i className="fas fa-calendar-alt" style={{ marginRight: "8px" }}></i>
                  Upcoming Sessions
                </h6>
              </div>
              <div className="card-body">
                <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                  {selectedStudent && upcomingSessions.length > 0 ? (
                    upcomingSessions.map((session: any, index: number) => {
                      const d = parseSessionDate(session);
                      return (
                        <div
                          key={index}
                          className="session-item mb-3 p-2"
                          style={{
                            background: "rgba(74, 122, 166, 0.05)",
                            borderRadius: "6px",
                            borderLeft: "3px solid var(--tutoring-orange)",
                          }}
                        >
                          <div className="d-flex justify-content-between align-items-start">
                            <div>
                              <h6 className="mb-1" style={{ color: "var(--tutoring-blue)" }}>Session</h6>
                              <p className="mb-0 small text-muted">{formatMonthDayYear(d)}</p>
                            </div>
                            <div className="text-end">
                              <span className="badge" style={{ background: "var(--tutoring-orange)", color: "white" }}>
                                {session?.Day || "N/A"}
                              </span>
                              <p className="mb-0 small text-muted">{session?.Time || "N/A"}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : selectedStudent ? (
                    <div className="alert alert-info small">No upcoming sessions found for {selectedStudent}.</div>
                  ) : (
                    <div className="alert alert-info small">Select a student to view upcoming sessions.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>      
      </div>
    </div>
  );
}
