// client/src/pages/dashboard.tsx
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import logoPath from "@assets/logo_1755332058201.webp";
import billingIconPath from "@assets/tcBillingIcon_1755332058201.png";
import scheduleIconPath from "@assets/tcScheduleIcon_1755332058202.jpg";

export default function Dashboard() {
  const [selectedStudent, setSelectedStudent] = useState(""); // used for Home/Schedule lists
  const [activeTab, setActiveTab] = useState<"home" | "schedule" | "billing">("home");

  // --- Schedule-change controlled state ---
  const [reqStudentId, setReqStudentId] = useState<number | null>(null);
  const [reqStudent, setReqStudent] = useState("");
  const [reqCurrent, setReqCurrent] = useState(""); // e.g., "Monday 3:00 PM"
  const [reqDate, setReqDate] = useState("");       // "YYYY-MM-DD"
  const [reqTime, setReqTime] = useState("");       // "HH:MM"
  const [reqChange, setReqChange] = useState("");
  const [reqReason, setReqReason] = useState("");

  const { data: user } = useQuery({ queryKey: ["/api/auth/me"] });
  const { data: dashboardData } = useQuery({ queryKey: ["/api/dashboard"], enabled: !!user });

  // Live hide/blur flag — seeded from server, then updated via WebSocket pushes
  const [hideBillingLive, setHideBillingLive] = useState<boolean>(!!dashboardData?.uiPolicy?.hideBilling);
  useEffect(() => {
    setHideBillingLive(!!dashboardData?.uiPolicy?.hideBilling);
  }, [dashboardData?.uiPolicy?.hideBilling]);

  // WebSocket connection for instant policy updates
  const wsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (!user) return;

    let stopped = false;
    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${proto}://${window.location.host}/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        // no-op; session cookie authenticates
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg?.type === "policy") {
            setHideBillingLive(!!msg.hideBilling);
          }
        } catch {}
      };
      ws.onclose = () => {
        wsRef.current = null;
        if (!stopped) {
          // quick retry
          setTimeout(connect, 1000);
        }
      };
      ws.onerror = () => {
        // let onclose handle retry
      };
    };

    connect();
    return () => {
      stopped = true;
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
    };
  }, [user]);

  // ---------------- Billing helpers (last 30 days) ----------------
  const billingRows: any[] = dashboardData?.billing?.account_details ?? [];

  const getRowDate = (row: any): Date | null => {
    const raw =
      row?.Date ??
      row?.TransactionDate ??
      row?.PostedDate ??
      row?.FormattedDate ??
      null;
    if (!raw) return null;
    const d = new Date(String(raw));
    return isNaN(d.getTime()) ? null : d;
  };

  const last30Rows = useMemo(() => {
    const rows = billingRows ?? [];
    if (!rows.length) return [];

    const now = new Date();
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return [...rows]
      .filter((r) => {
        const d = getRowDate(r);
        return d && d >= cutoff;
      })
      .sort((a, b) => {
        const da = getRowDate(a)?.getTime() ?? 0;
        const db = getRowDate(b)?.getTime() ?? 0;
        return db - da; // newest first
      });
  }, [billingRows]);

  // Early loading return AFTER hooks/top setup
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

  const { students, sessions, billing } = dashboardData;

  // Filter sessions based on selected student NAME (for lists)
  const filteredSessions =
    selectedStudent && sessions
      ? sessions.filter((session: any) => session.studentName === selectedStudent)
      : [];

  // Logout
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // ---------------- Email compose helpers ----------------
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
      `Reason (optional):`,
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
    window.location.href = mailto; // triggers OS chooser on Android/iOS
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

  /* ========================= SCHEDULE TAB ========================= */
  if (activeTab === "schedule") {
    return (
      <div>
        {/* Header Section */}
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
              </div>
            </div>
          </div>
        </div>

        <div className="container mt-4">
          {/* Navigation Tabs */}
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
            <li className="nav-item" role="presentation">
              <a className="nav-link" href="#" onClick={(e) => { e.preventDefault(); setActiveTab("billing"); }}>
                Account Balance
              </a>
            </li>
          </ul>

          {/* Schedule Content */}
          <h3 style={{ marginBottom: "30px" }}>Schedule Management</h3>

          {/* Current Schedule */}
          {selectedStudent && filteredSessions && filteredSessions.length > 0 ? (
            <div className="card mb-4">
              <div className="card-header">
                <h5 style={{ color: "white", margin: 0 }}>
                  Current Schedule for {selectedStudent} ({filteredSessions.length} sessions)
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
                      {filteredSessions.map((session: any, index: number) => (
                        <tr key={index}>
                          <td>{session.Day || "N/A"}</td>
                          <td>{session.Time || "N/A"}</td>
                          <td>{session.FormattedDate || "N/A"}</td>
                          <td>Active</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : selectedStudent ? (
            <div className="alert alert-info">No scheduled sessions found for {selectedStudent}.</div>
          ) : (
            <div className="alert alert-info">Please select a student to view their schedule.</div>
          )}

          {/* Schedule Change Request Form */}
          <div className="card">
            <div className="card-header">
              <h5>Request Schedule Change</h5>
            </div>
            <div className="card-body">
              <form onSubmit={(e) => e.preventDefault()}>
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label htmlFor="student_name" className="form-label">Student Name</label>
                    <select
                      className="form-control"
                      id="student_name"
                      required
                      value={reqStudentId ?? ""}
                      onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : null;
                        setReqStudentId(id);
                        const name = students.find((s: any) => s.id === id)?.name || "";
                        setReqStudent(name);
                      }}
                    >
                      <option value="">Select a student</option>
                      {students.map((student: any) => (
                        <option key={student.id} value={student.id}>
                          {student.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6 mb-3">
                    <label htmlFor="current_session" className="form-label">Current Session</label>
                    <input
                      type="text"
                      className="form-control"
                      id="current_session"
                      placeholder="e.g., Monday 3:00 PM"
                      required
                      value={reqCurrent}
                      onChange={(e) => setReqCurrent(e.target.value)}
                    />
                  </div>
                </div>

                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label htmlFor="preferred_date" className="form-label">New Schedule Start Date</label>
                    <input
                      type="date"
                      className="form-control"
                      id="preferred_date"
                      required
                      value={reqDate}
                      onChange={(e) => setReqDate(e.target.value)}
                    />
                  </div>
                  <div className="col-md-6 mb-3">
                    <label htmlFor="preferred_time" className="form-label">New Schedule Start Time</label>
                    <input
                      type="time"
                      className="form-control"
                      id="preferred_time"
                      required
                      value={reqTime}
                      onChange={(e) => setReqTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label htmlFor="requested_change" className="form-label">Requested Change</label>
                  <textarea
                    className="form-control"
                    id="requested_change"
                    rows={3}
                    placeholder="Describe what changes you would like to make"
                    required
                    value={reqChange}
                    onChange={(e) => setReqChange(e.target.value)}
                  />
                </div>

                <div className="mb-3">
                  <label htmlFor="reason" className="form-label">Reason for Change (Optional)</label>
                  <textarea
                    className="form-control"
                    id="reason"
                    rows={3}
                    placeholder="Please explain why you need this schedule change"
                    value={reqReason}
                    onChange={(e) => setReqReason(e.target.value)}
                  />
                </div>

                <button type="button" className="btn btn-success" onClick={handleScheduleSubmit}>
                  Submit Schedule Change Request
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ========================= BILLING TAB ========================= */
  if (activeTab === "billing") {
    const hideBilling = !!hideBillingLive; // live flag

    return (
      <div>
        {/* Header Section */}
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
              </div>
            </div>
          </div>
        </div>

        <div className="container mt-4">
          {/* Navigation Tabs */}
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
            <li className="nav-item" role="presentation">
              <a className="nav-link active" href="#" onClick={(e) => e.preventDefault()}>
                Billing Information
              </a>
            </li>
          </ul>

          {/* Entire billing content wrapped for blur/overlay */}
          <div className="position-relative">
            {/* Blurred content */}
            <div style={hideBilling ? { filter: "blur(6px)", pointerEvents: "none", userSelect: "none" } : undefined}>
              {/* Account Balance Report */}
              <div className="card mb-4">
                <div className="card-header">
                  <h5 style={{ color: "white", margin: 0 }}>Account Balance Report</h5>
                </div>
                <div className="card-body">
                  <div className="table-container">
                    <table className="table table-striped table-sm">
                      <thead>
                        <tr>
                          <th>Account Holder</th>
                          <th>Students</th>
                          <th>Hours Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billing?.extra && billing.extra.length > 0 ? (
                          billing.extra.map((account: any, index: number) => (
                            <tr key={index}>
                              <td>{account.AccountHolder || "N/A"}</td>
                              <td>{account.StudentNames || students.map((s: any) => s.name).join(", ")}</td>
                              <td>{typeof billing?.remaining_hours === "number" ? billing.remaining_hours.toFixed(1) : "0.0"} hours</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="text-center text-muted">No account information available</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Account Details - LAST 30 DAYS ONLY */}
              {last30Rows.length > 0 && (
                <div className="card mb-4">
                  <div className="card-header d-flex justify-content-between align-items-center">
                    <h5 style={{ color: "white", margin: 0 }}>Account Details (Last 30 Days)</h5>
                    {typeof billing?.remaining_hours === "number" && (
                      <small className="text-light">Remaining Hours: {billing.remaining_hours.toFixed(1)}</small>
                    )}
                  </div>

                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <small className="text-muted">
                        Showing {last30Rows.length} {last30Rows.length === 1 ? "record" : "records"}
                      </small>
                    </div>

                    <div className="table-container">
                      <table className="table table-striped table-sm">
                        <thead>
                          <tr>
                            <th style={{ width: 130 }}>Date</th>
                            <th>Student</th>
                            <th>Event Type</th>
                            <th>Attendance</th>
                            <th className="text-end" style={{ width: 110 }}>Adjustment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {last30Rows.map((detail: any, index: number) => {
                            const dt = getRowDate(detail);
                            const dateLabel =
                              dt && !isNaN(dt.getTime())
                                ? dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                                : detail.FormattedDate || "N/A";

                            const adjNum = Number(detail.Adjustment ?? 0);
                            const adjClass =
                              Number.isFinite(adjNum) && adjNum !== 0
                                ? adjNum > 0
                                  ? "text-success"
                                  : "text-danger"
                                : "";

                            return (
                              <tr key={index}>
                                <td>{dateLabel}</td>
                                <td>{detail.Student || "N/A"}</td>
                                <td>{detail.EventType || "N/A"}</td>
                                <td>{detail.Attendance || "N/A"}</td>
                                <td className={`text-end ${adjClass}`}>
                                  {Number.isFinite(adjNum)
                                    ? `${adjNum > 0 ? "+" : ""}${adjNum.toFixed(2)}`
                                    : String(detail.Adjustment ?? 0)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {last30Rows.length === 0 && (
                <div className="card mb-4">
                  <div className="card-body text-center text-muted">
                    No billing records in the last 30 days.
                  </div>
                </div>
              )}
            </div>

            {/* Overlay when hidden */}
            {hideBilling && (
              <div
                className="d-flex align-items-center justify-content-center text-center"
                style={{
                  position: "absolute",
                  inset: 0,
                  padding: "1rem",
                  background: "rgba(255,255,255,0.65)",
                  backdropFilter: "saturate(120%) blur(2px)",
                }}
              >
                <div className="card shadow-sm" style={{ maxWidth: 520 }}>
                  <div className="card-body">
                    <h5 className="mb-2">Billing information is restricted</h5>
                    <p className="mb-0 text-muted">Please contact your center for access.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ========================= HOME TAB (default) ========================= */
  return (
    <div>
      {/* Header Section */}
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
            </div>
          </div>
        </div>
      </div>

      <div className="container mt-4">
        {/* Navigation Tabs */}
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
          <li className="nav-item" role="presentation">
            <a className="nav-link" href="#" onClick={(e) => { e.preventDefault(); setActiveTab("billing"); }}>
              Billing Information
            </a>
          </li>
        </ul>

        {/* Stats Grid */}
        <div className="row mb-4">
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

          <div className="col-md-6 mb-3">
            <div
              className="card"
              style={{ cursor: "pointer", transition: "transform 0.2s ease" }}
              onClick={() => setActiveTab("billing")}
            >
              <div className="card-body d-flex justify-content-between align-items-start">
                <div>
                  <p className="text-muted mb-1 small text-uppercase">Account Balance</p>
                  <h4 className="mb-1" style={{ color: "var(--tutoring-blue)" }}>
                    {typeof billing?.remaining_hours === "number" ? billing.remaining_hours.toFixed(1) : "0.0"} hours
                  </h4>
                  <p className="text-muted small mb-0">Hours remaining - Click to view billing details</p>
                </div>
                <div className="text-end">
                  <i className="fas fa-hourglass" style={{ color: "var(--tutoring-orange)", fontSize: "24px" }}></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Dashboard Grid */}
        <div className="row">
          {/* Recent Sessions */}
          <div className="col-lg-4 mb-4">
            <div className="card">
              <div className="card-header">
                <h6>
                  <img src={scheduleIconPath} alt="Schedule Icon" style={{ width: "20px", height: "20px", marginRight: "8px" }} />
                  Recent Sessions
                </h6>
              </div>
              <div className="card-body">
                {selectedStudent && filteredSessions && filteredSessions.length > 0 ? (
                  <div className="timeline-container" style={{ maxHeight: "300px", overflowY: "auto" }}>
                    {filteredSessions
                      .filter((session: any) => session && session.category === "recent")
                      .slice(0, 5)
                      .map((session: any, index: number) => (
                        <div key={index} className="timeline-item mb-3 pb-3" style={{ borderBottom: "1px solid #eee" }}>
                          <div className="d-flex">
                            <div className="timeline-marker me-3 mt-1">
                              <div style={{ width: "8px", height: "8px", background: "var(--tutoring-orange)", borderRadius: "50%" }}></div>
                            </div>
                            <div className="flex-grow-1">
                              <h6 className="mb-1" style={{ color: "var(--tutoring-blue)" }}>Session</h6>
                              <p className="mb-1 small">{session?.FormattedDate || "N/A"}</p>
                              <p className="mb-0 text-muted small">
                                {session?.Day || "N/A"} • {session?.Time || "N/A"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : selectedStudent ? (
                  <div className="alert alert-info small">No recent sessions found for {selectedStudent}.</div>
                ) : (
                  <div className="alert alert-info small">Select a student to view recent sessions.</div>
                )}
              </div>
            </div>
          </div>

          {/* Upcoming Sessions */}
          <div className="col-lg-4 mb-4">
            <div className="card">
              <div className="card-header">
                <h6>
                  <i className="fas fa-calendar-alt" style={{ marginRight: "8px" }}></i>
                  Upcoming Sessions
                </h6>
              </div>
              <div className="card-body">
                <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                  {selectedStudent && filteredSessions && filteredSessions.length > 0 ? (
                    filteredSessions
                      .filter((session: any) => session && session.category === "upcoming")
                      .slice(0, 4)
                      .map((session: any, index: number) => (
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
                              <p className="mb-0 small text-muted">{session?.FormattedDate || "N/A"}</p>
                            </div>
                            <div className="text-end">
                              <span className="badge" style={{ background: "var(--tutoring-orange)", color: "white" }}>
                                {session?.Day || "N/A"}
                              </span>
                              <p className="mb-0 small text-muted">{session?.Time || "N/A"}</p>
                            </div>
                          </div>
                        </div>
                      ))
                  ) : selectedStudent ? (
                    <div className="alert alert-info small">No upcoming sessions found for {selectedStudent}.</div>
                  ) : (
                    <div className="alert alert-info small">Select a student to view upcoming sessions.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="col-lg-4 mb-4">
            <div className="card">
              <div className="card-header">
                <h6>
                  <i className="fas fa-bolt" style={{ marginRight: "8px" }}></i>
                  Quick Actions
                </h6>
              </div>
              <div className="card-body">
                <div className="d-grid gap-2">
                  <button className="btn btn-primary" onClick={() => setActiveTab("schedule")}>
                    <i className="fas fa-calendar-edit me-2"></i>
                    Request Schedule Change
                  </button>
                  <button className="btn btn-outline-primary" onClick={() => setActiveTab("billing")}>
                    <img
                      src={billingIconPath}
                      alt="Billing Icon"
                      style={{ width: "16px", height: "16px", marginRight: "8px" }}
                    />
                    View Billing Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>      
      </div>
    </div>
  );
}
