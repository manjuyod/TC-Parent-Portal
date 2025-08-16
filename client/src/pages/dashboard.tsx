import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import logoPath from "@assets/logo_1755332058201.webp";
import billingIconPath from "@assets/tcBillingIcon_1755332058201.png";
import scheduleIconPath from "@assets/tcScheduleIcon_1755332058202.jpg";
import EmailButton from "../components/EmailButton";

export default function Dashboard() {
  const [selectedStudent, setSelectedStudent] = useState("");
  const [activeTab, setActiveTab] = useState("home");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [scheduleForm, setScheduleForm] = useState({
    studentId: "",
    currentSession: "",
    preferredDate: "",
    preferredTime: "",
    requestedChange: "",
    reason: "",
    additionalNotes: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [franchiseEmail, setFranchiseEmail] = useState("");

  const { data: user } = useQuery({
    queryKey: ["/api/auth/me"],
  });

  // Load students immediately (lightweight)
  const { data: studentsData } = useQuery({
    queryKey: ["/api/students"],
    enabled: !!user,
  });

  // Load sessions only when needed (on schedule tab or student selection)
  const { data: sessionsData } = useQuery({
    queryKey: ["/api/sessions", selectedStudent],
    enabled: !!user && ((activeTab === "home" && !!selectedStudent) || activeTab === "schedule"),
  });

  // Load billing only when billing tab is active (heaviest query - last priority)
  const { data: billingData } = useQuery({
    queryKey: ["/api/billing"],
    enabled: !!user && activeTab === "billing",
  });

  // Extract typed data with fallbacks
  const students = (studentsData as any)?.students || [];
  const sessions = (sessionsData as any)?.sessions || [];
  const billing = (billingData as any)?.billing || null;

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary mb-4" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">Loading your account...</p>
        </div>
      </div>
    );
  }

  // Show students loading state if students haven't loaded yet
  if (!studentsData) {
    return (
      <div className="min-h-screen bg-gray-50 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary mb-4" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">Loading student information...</p>
        </div>
      </div>
    );
  }

  const user_data = (user as any)?.parent;

  // Filter sessions based on selected student
  const filteredSessions =
    selectedStudent && sessions
      ? sessions.filter(
          (session: any) => session.studentName === selectedStudent,
        )
      : [];

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // Pagination functions
  const getCurrentPageItems = () => {
    if (!billing?.account_details) return [];
    if (itemsPerPage >= billing.account_details.length) return billing.account_details;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return billing.account_details.slice(startIndex, endIndex);
  };

  const totalPages = billing?.account_details ? Math.ceil(billing.account_details.length / itemsPerPage) : 1;

  // Fetch franchise email when student is selected
  const fetchFranchiseEmail = async (studentId: string) => {
    if (!studentId) return;
    
    try {
      const response = await fetch("/api/get-franchise-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ studentId: studentId }),
      });

      const result = await response.json();
      if (response.ok) {
        setFranchiseEmail(result.franchiseEmail || "");
      }
    } catch (error) {
      console.error("Error fetching franchise email:", error);
    }
  };

  if (activeTab === "schedule") {
    return (
      <div>
        {/* Header Section */}
        <div className="header-section">
          <div className="container">
            <div className="d-flex justify-content-between align-items-center">
              <div className="header-brand">
                <img
                  src={logoPath}
                  alt="Tutoring Club Logo"
                  className="header-logo"
                />
                <h1 className="header-title">Tutoring Club Parent Portal</h1>
              </div>
              <div className="text-end">
                <div className="text-dark mb-1">
                  <strong>Welcome, {user.parent.name}!</strong>
                </div>
                <div className="text-muted small mb-2">
                  Students: {students.map((s: any) => s.name).join(", ")}
                </div>
                <button
                  onClick={handleLogout}
                  className="btn btn-outline-primary btn-sm"
                >
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
              <a
                className="nav-link"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab("home");
                }}
              >
                Home
              </a>
            </li>
            <li className="nav-item" role="presentation">
              <a
                className="nav-link active"
                href="#"
                onClick={(e) => e.preventDefault()}
              >
                Schedule Updates
              </a>
            </li>
            <li className="nav-item" role="presentation">
              <a
                className="nav-link"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab("billing");
                }}
              >
                Account Balance
              </a>
            </li>
          </ul>

          {/* Schedule Content */}
          <h3 style={{ marginBottom: "30px" }}>Schedule Management</h3>

          {/* Current Schedule */}
          {filteredSessions && filteredSessions.length > 0 ? (
            <div className="card mb-4">
              <div className="card-header">
                <h5 style={{ color: "white", margin: 0 }}>
                  Current Schedule for {selectedStudent} (
                  {filteredSessions.length} sessions)
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
            <div className="alert alert-info">
              No scheduled sessions found for {selectedStudent}.
            </div>
          ) : (
            <div className="alert alert-info">
              Please select a student to view their schedule.
            </div>
          )}

          {/* Schedule Change Request Form */}
          <div className="card">
            <div className="card-header">
              <h5>Request Schedule Change</h5>
            </div>
            <div className="card-body">
              {submitMessage && (
                <div className={`alert ${submitMessage.includes('Error') ? 'alert-danger' : 'alert-success'} mb-3`}>
                  {submitMessage}
                </div>
              )}
              
              <div className="schedule-form">{/* Schedule Change Form */}
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label htmlFor="student_name" className="form-label">
                      Student Name
                    </label>
                    <select 
                      className="form-control" 
                      id="student_name" 
                      value={scheduleForm.studentId}
                      onChange={(e) => {
                        setScheduleForm({...scheduleForm, studentId: e.target.value});
                        if (e.target.value) {
                          fetchFranchiseEmail(e.target.value);
                        }
                      }}
                      required
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
                    <label htmlFor="current_session" className="form-label">
                      Current Session
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="current_session"
                      placeholder="e.g., Monday 3:00 PM"
                      value={scheduleForm.currentSession}
                      onChange={(e) => setScheduleForm({...scheduleForm, currentSession: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label htmlFor="preferred_date" className="form-label">
                      New Schedule Start Date
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      id="preferred_date"
                      value={scheduleForm.preferredDate}
                      onChange={(e) => setScheduleForm({...scheduleForm, preferredDate: e.target.value})}
                      required
                    />
                  </div>
                  <div className="col-md-6 mb-3">
                    <label htmlFor="preferred_time" className="form-label">
                      New Schedule Start Time
                    </label>
                    <input
                      type="time"
                      className="form-control"
                      id="preferred_time"
                      value={scheduleForm.preferredTime}
                      onChange={(e) => setScheduleForm({...scheduleForm, preferredTime: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label htmlFor="requested_change" className="form-label">
                    Requested Change
                  </label>
                  <textarea
                    className="form-control"
                    id="requested_change"
                    rows={3}
                    placeholder="Describe what changes you would like to make"
                    value={scheduleForm.requestedChange}
                    onChange={(e) => setScheduleForm({...scheduleForm, requestedChange: e.target.value})}
                    required
                  ></textarea>
                </div>
                <div className="mb-3">
                  <label htmlFor="reason" className="form-label">
                    Reason for Change (Optional)
                  </label>
                  <textarea
                    className="form-control"
                    id="reason"
                    rows={3}
                    placeholder="Please explain why you need this schedule change"
                    value={scheduleForm.reason}
                    onChange={(e) => setScheduleForm({...scheduleForm, reason: e.target.value})}
                  ></textarea>
                </div>
                <div className="mb-3">
                  <label htmlFor="additional_notes" className="form-label">
                    Additional Notes (Optional)
                  </label>
                  <textarea
                    className="form-control"
                    id="additional_notes"
                    rows={2}
                    placeholder="Any additional information you'd like to share"
                    value={scheduleForm.additionalNotes}
                    onChange={(e) => setScheduleForm({...scheduleForm, additionalNotes: e.target.value})}
                  ></textarea>
                </div>
                {scheduleForm.studentId && scheduleForm.currentSession && scheduleForm.requestedChange && (
                  <EmailButton
                    to={franchiseEmail || "franchise@example.com"}
                    studentName={students.find((s: any) => s.id.toString() === scheduleForm.studentId)?.name || 'Unknown Student'}
                    details={{
                      current: scheduleForm.currentSession,
                      requested: scheduleForm.requestedChange,
                      reason: scheduleForm.reason,
                      effectiveDate: scheduleForm.preferredDate,
                      notes: scheduleForm.additionalNotes
                    }}
                    prefer="gmail"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "billing") {
    return (
      <div>
        {/* Header Section */}
        <div className="header-section">
          <div className="container">
            <div className="d-flex justify-content-between align-items-center">
              <div className="header-brand">
                <img
                  src={logoPath}
                  alt="Tutoring Club Logo"
                  className="header-logo"
                />
                <h1 className="header-title">Tutoring Club Parent Portal</h1>
              </div>
              <div className="text-end">
                <div className="text-dark mb-1">
                  <strong>Welcome, {user.parent.name}!</strong>
                </div>
                <div className="text-muted small mb-2">
                  Students: {students.map((s: any) => s.name).join(", ")}
                </div>
                <button
                  onClick={handleLogout}
                  className="btn btn-outline-primary btn-sm"
                >
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
              <a
                className="nav-link"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab("home");
                }}
              >
                Home
              </a>
            </li>
            <li className="nav-item" role="presentation">
              <a
                className="nav-link"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab("schedule");
                }}
              >
                Schedule Updates
              </a>
            </li>
            <li className="nav-item" role="presentation">
              <a
                className="nav-link active"
                href="#"
                onClick={(e) => e.preventDefault()}
              >
                Billing Information
              </a>
            </li>
          </ul>

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
                          <td>{billing?.remaining_hours?.toFixed(1) || "0.0"} hours</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="text-center text-muted">
                          No account information available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Account Details */}
          {billing?.account_details && billing.account_details.length > 0 && (
            <div className="card mb-4">
              <div className="card-header">
                <h5 style={{ color: "white", margin: 0 }}>Account Details</h5>
              </div>
              <div className="card-body">
                <div className="table-container">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                      <label className="form-label me-2">Show:</label>
                      <select 
                        className="form-select form-select-sm d-inline-block w-auto"
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                      >
                        <option value={50}>50 items</option>
                        <option value={100}>100 items</option>
                        <option value={200}>200 items</option>
                        <option value={billing.account_details.length}>All items</option>
                      </select>
                    </div>
                    <div className="text-muted small">
                      Showing {Math.min((currentPage - 1) * itemsPerPage + 1, billing.account_details.length)} - {Math.min(currentPage * itemsPerPage, billing.account_details.length)} of {billing.account_details.length} records
                    </div>
                  </div>
                  
                  <table className="table table-striped table-sm">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Student</th>
                        <th>Event Type</th>
                        <th>Adjustment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getCurrentPageItems().map((detail: any, index: number) => (
                        <tr key={index}>
                          <td>{detail.FormattedDate || "N/A"}</td>
                          <td>{detail.Student || "N/A"}</td>
                          <td>{detail.EventType || "N/A"}</td>
                          <td>
                            <span className={detail.Adjustment > 0 ? "text-success" : detail.Adjustment < 0 ? "text-danger" : ""}>
                              {detail.Adjustment > 0 ? "+" : ""}{detail.Adjustment || 0}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <nav aria-label="Account details pagination" className="mt-3">
                      <ul className="pagination pagination-sm justify-content-center">
                        <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                          <button 
                            className="page-link" 
                            onClick={() => setCurrentPage(currentPage - 1)}
                            disabled={currentPage === 1}
                          >
                            Previous
                          </button>
                        </li>
                        
                        {/* Page numbers */}
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                          if (pageNum <= totalPages) {
                            return (
                              <li key={pageNum} className={`page-item ${currentPage === pageNum ? 'active' : ''}`}>
                                <button 
                                  className="page-link" 
                                  onClick={() => setCurrentPage(pageNum)}
                                >
                                  {pageNum}
                                </button>
                              </li>
                            );
                          }
                          return null;
                        })}
                        
                        <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                          <button 
                            className="page-link" 
                            onClick={() => setCurrentPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                          >
                            Next
                          </button>
                        </li>
                      </ul>
                    </nav>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default Home Tab
  return (
    <div>
      {/* Header Section */}
      <div className="header-section">
        <div className="container">
          <div className="d-flex justify-content-between align-items-center">
            <div className="header-brand">
              <img
                src={logoPath}
                alt="Tutoring Club Logo"
                className="header-logo"
              />
              <h1 className="header-title">Tutoring Club Parent Portal</h1>
            </div>
            <div className="text-end">
              <div className="text-dark mb-1">
                <strong>Welcome, {user.parent.name}!</strong>
              </div>
              <div className="text-muted small mb-2">
                Students: {students.map((s: any) => s.name).join(", ")}
              </div>
              <button
                onClick={handleLogout}
                className="btn btn-outline-primary btn-sm"
              >
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
            <a
              className="nav-link active"
              href="#"
              onClick={(e) => e.preventDefault()}
            >
              Home
            </a>
          </li>
          <li className="nav-item" role="presentation">
            <a
              className="nav-link"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab("schedule");
              }}
            >
              Schedule Updates
            </a>
          </li>
          <li className="nav-item" role="presentation">
            <a
              className="nav-link"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab("billing");
              }}
            >
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
                  <p className="text-muted mb-2 small text-uppercase">
                    Student Information
                  </p>
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
                  <p className="text-muted small mb-0 mt-1">
                    Choose student to view details
                  </p>
                </div>
                <div className="text-end">
                  <i
                    className="fas fa-user"
                    style={{
                      color: "var(--tutoring-orange)",
                      fontSize: "24px",
                    }}
                  ></i>
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
                  <p className="text-muted mb-1 small text-uppercase">
                    Account Balance
                  </p>
                  <h4
                    className="mb-1"
                    style={{ color: "var(--tutoring-blue)" }}
                  >
                    {billing?.remaining_hours?.toFixed(1) || "0.0"} hours
                  </h4>
                  <p className="text-muted small mb-0">
                    Hours remaining - Click to view billing details
                  </p>
                </div>
                <div className="text-end">
                  <i
                    className="fas fa-hourglass"
                    style={{
                      color: "var(--tutoring-orange)",
                      fontSize: "24px",
                    }}
                  ></i>
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
                  <img
                    src={scheduleIconPath}
                    alt="Schedule Icon"
                    style={{
                      width: "20px",
                      height: "20px",
                      marginRight: "8px",
                    }}
                  />
                  Recent Sessions
                </h6>
              </div>
              <div className="card-body">
                {selectedStudent &&
                filteredSessions &&
                filteredSessions.length > 0 ? (
                  <div
                    className="timeline-container"
                    style={{ maxHeight: "300px", overflowY: "auto" }}
                  >
                    {filteredSessions
                      .slice(0, 5)
                      .map((session: any, index: number) => (
                        <div
                          key={index}
                          className="timeline-item mb-3 pb-3"
                          style={{ borderBottom: "1px solid #eee" }}
                        >
                          <div className="d-flex">
                            <div className="timeline-marker me-3 mt-1">
                              <div
                                style={{
                                  width: "8px",
                                  height: "8px",
                                  background: "var(--tutoring-orange)",
                                  borderRadius: "50%",
                                }}
                              ></div>
                            </div>
                            <div className="flex-grow-1">
                              <h6
                                className="mb-1"
                                style={{ color: "var(--tutoring-blue)" }}
                              >
                                Session
                              </h6>
                              <p className="mb-1 small">
                                {session?.FormattedDate || "N/A"}
                              </p>
                              <p className="mb-0 text-muted small">
                                {session?.Day || "N/A"} •{" "}
                                {session?.Time || "N/A"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : selectedStudent ? (
                  <div className="alert alert-info small">
                    No recent sessions found for {selectedStudent}.
                  </div>
                ) : (
                  <div className="alert alert-info small">
                    Select a student to view recent sessions.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Upcoming Sessions */}
          <div className="col-lg-4 mb-4">
            <div className="card">
              <div className="card-header">
                <h6>
                  <i
                    className="fas fa-calendar-alt"
                    style={{ marginRight: "8px" }}
                  ></i>
                  Upcoming Sessions
                </h6>
              </div>
              <div className="card-body">
                <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                  {selectedStudent &&
                  filteredSessions &&
                  filteredSessions.length > 0 ? (
                    filteredSessions
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
                              <h6
                                className="mb-1"
                                style={{ color: "var(--tutoring-blue)" }}
                              >
                                Session
                              </h6>
                              <p className="mb-0 small text-muted">
                                {session?.FormattedDate || "N/A"}
                              </p>
                            </div>
                            <div className="text-end">
                              <span
                                className="badge"
                                style={{
                                  background: "var(--tutoring-orange)",
                                  color: "white",
                                }}
                              >
                                {session?.Day || "N/A"}
                              </span>
                              <p className="mb-0 small text-muted">
                                {session?.Time || "N/A"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                  ) : selectedStudent ? (
                    <div className="alert alert-info small">
                      No upcoming sessions found for {selectedStudent}.
                    </div>
                  ) : (
                    <div className="alert alert-info small">
                      Select a student to view upcoming sessions.
                    </div>
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
                  <button
                    className="btn btn-primary"
                    onClick={() => setActiveTab("schedule")}
                  >
                    <i className="fas fa-calendar-edit me-2"></i>
                    Request Schedule Change
                  </button>
                  <button
                    className="btn btn-outline-primary"
                    onClick={() => setActiveTab("billing")}
                  >
                    <img
                      src={billingIconPath}
                      alt="Billing Icon"
                      style={{
                        width: "16px",
                        height: "16px",
                        marginRight: "8px",
                      }}
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
