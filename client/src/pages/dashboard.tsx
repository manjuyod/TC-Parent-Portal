import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import logoPath from "@assets/logo_1755332058201.webp";
import billingIconPath from "@assets/tcBillingIcon_1755332058201.png";
import scheduleIconPath from "@assets/tcScheduleIcon_1755332058202.jpg";

export default function Dashboard() {
  const [selectedStudent, setSelectedStudent] = useState("");
  const [activeTab, setActiveTab] = useState("home");

  const { data: user } = useQuery({
    queryKey: ["/api/auth/me"],
  });

  const { data: dashboardData } = useQuery({
    queryKey: ["/api/dashboard"],
    enabled: !!user,
  });

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

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout error:", error);
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
                <img src={logoPath} alt="Tutoring Club Logo" className="header-logo" />
                <h1 className="header-title">Tutoring Club Parent Portal</h1>
              </div>
              <div className="text-end">
                <div className="text-dark mb-1">
                  <strong>Welcome, {user.parent.name}!</strong>
                </div>
                <div className="text-muted small mb-2">
                  Students: {students.map((s: any) => s.name).join(', ')}
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
              <a 
                className="nav-link" 
                href="#" 
                onClick={(e) => { e.preventDefault(); setActiveTab("home"); }}
              >
                Home
              </a>
            </li>
            <li className="nav-item" role="presentation">
              <a className="nav-link active" href="#" onClick={(e) => e.preventDefault()}>
                Schedule Updates
              </a>
            </li>
            <li className="nav-item" role="presentation">
              <a 
                className="nav-link" 
                href="#" 
                onClick={(e) => { e.preventDefault(); setActiveTab("billing"); }}
              >
                Billing Information
              </a>
            </li>
          </ul>

          {/* Schedule Content */}
          <h3 style={{ marginBottom: "30px" }}>Schedule Management</h3>

          {/* Current Schedule */}
          {sessions && sessions.length > 0 ? (
            <div className="card mb-4">
              <div className="card-header">
                <h5>Current Schedule ({sessions.length} sessions)</h5>
              </div>
              <div className="card-body">
                <div className="table-container">
                  <table className="table table-striped table-sm">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Day</th>
                        <th>Time</th>
                        <th>Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((session: any, index: number) => (
                        <tr key={index}>
                          <td>{session.studentName}</td>
                          <td>{session.Day || 'N/A'}</td>
                          <td>{session.Time || 'N/A'}</td>
                          <td>{session.FormattedDate || 'N/A'}</td>
                          <td>Active</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="alert alert-info">
              No scheduled sessions found for your students.
            </div>
          )}

          {/* Schedule Change Request Form */}
          <div className="card">
            <div className="card-header">
              <h5>Request Schedule Change</h5>
            </div>
            <div className="card-body">
              <form>
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label htmlFor="student_name" className="form-label">Student Name</label>
                    <select className="form-control" id="student_name" required>
                      <option value="">Select a student</option>
                      {students.map((student: any) => (
                        <option key={student.id} value={student.name}>{student.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6 mb-3">
                    <label htmlFor="current_session" className="form-label">Current Session</label>
                    <input type="text" className="form-control" id="current_session" 
                           placeholder="e.g., Monday 3:00 PM" required />
                  </div>
                </div>
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label htmlFor="preferred_date" className="form-label">New Schedule Start Date</label>
                    <input type="date" className="form-control" id="preferred_date" required />
                  </div>
                  <div className="col-md-6 mb-3">
                    <label htmlFor="preferred_time" className="form-label">New Schedule Start Time</label>
                    <input type="time" className="form-control" id="preferred_time" required />
                  </div>
                </div>
                <div className="mb-3">
                  <label htmlFor="requested_change" className="form-label">Requested Change</label>
                  <textarea className="form-control" id="requested_change" rows={3} 
                            placeholder="Describe what changes you would like to make" required></textarea>
                </div>
                <div className="mb-3">
                  <label htmlFor="reason" className="form-label">Reason for Change (Optional)</label>
                  <textarea className="form-control" id="reason" rows={3} 
                            placeholder="Please explain why you need this schedule change"></textarea>
                </div>
                <button type="submit" className="btn btn-success">Submit Schedule Change Request</button>
              </form>
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
                <img src={logoPath} alt="Tutoring Club Logo" className="header-logo" />
                <h1 className="header-title">Tutoring Club Parent Portal</h1>
              </div>
              <div className="text-end">
                <div className="text-dark mb-1">
                  <strong>Welcome, {user.parent.name}!</strong>
                </div>
                <div className="text-muted small mb-2">
                  Students: {students.map((s: any) => s.name).join(', ')}
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
              <a 
                className="nav-link" 
                href="#" 
                onClick={(e) => { e.preventDefault(); setActiveTab("home"); }}
              >
                Home
              </a>
            </li>
            <li className="nav-item" role="presentation">
              <a 
                className="nav-link" 
                href="#" 
                onClick={(e) => { e.preventDefault(); setActiveTab("schedule"); }}
              >
                Schedule Updates
              </a>
            </li>
            <li className="nav-item" role="presentation">
              <a className="nav-link active" href="#" onClick={(e) => e.preventDefault()}>
                Billing Information
              </a>
            </li>
          </ul>

          {/* Account Balance Report */}
          <div className="card mb-4">
            <div className="card-header">
              <h5>Account Balance Report</h5>
            </div>
            <div className="card-body">
              <div className="table-container">
                <table className="table table-striped table-sm">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Hours Remaining</th>
                      <th>Last Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student: any) => (
                      <tr key={student.id}>
                        <td>{student.name}</td>
                        <td>{billing?.remaining_hours?.toFixed(1) || '0.0'} hours</td>
                        <td>N/A</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
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
              <img src={logoPath} alt="Tutoring Club Logo" className="header-logo" />
              <h1 className="header-title">Tutoring Club Parent Portal</h1>
            </div>
            <div className="text-end">
              <div className="text-dark mb-1">
                <strong>Welcome, {user.parent.name}!</strong>
              </div>
              <div className="text-muted small mb-2">
                Students: {students.map((s: any) => s.name).join(', ')}
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
            <a 
              className="nav-link" 
              href="#" 
              onClick={(e) => { e.preventDefault(); setActiveTab("schedule"); }}
            >
              Schedule Updates
            </a>
          </li>
          <li className="nav-item" role="presentation">
            <a 
              className="nav-link" 
              href="#" 
              onClick={(e) => { e.preventDefault(); setActiveTab("billing"); }}
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
                  <p className="text-muted mb-2 small text-uppercase">Student Information</p>
                  <select 
                    className="form-control" 
                    value={selectedStudent}
                    onChange={(e) => setSelectedStudent(e.target.value)}
                    style={{ fontSize: "16px", fontWeight: 600, color: "var(--tutoring-blue)", background: "white", border: "2px solid #e0e0e0" }}
                  >
                    <option value="">Select a student</option>
                    {students.map((student: any) => (
                      <option key={student.id} value={student.name}>{student.name}</option>
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
                    {billing?.remaining_hours?.toFixed(1) || '0.0'} hours
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
                {sessions && sessions.length > 0 ? (
                  <div className="timeline-container" style={{ maxHeight: "300px", overflowY: "auto" }}>
                    {sessions.slice(0, 5).map((session: any, index: number) => (
                      <div key={index} className="timeline-item mb-3 pb-3" style={{ borderBottom: "1px solid #eee" }}>
                        <div className="d-flex">
                          <div className="timeline-marker me-3 mt-1">
                            <div style={{ width: "8px", height: "8px", background: "var(--tutoring-orange)", borderRadius: "50%" }}></div>
                          </div>
                          <div className="flex-grow-1">
                            <h6 className="mb-1" style={{ color: "var(--tutoring-blue)" }}>Session</h6>
                            <p className="mb-1 small">{session.FormattedDate || 'N/A'}</p>
                            <p className="mb-0 text-muted small">{session.Day || 'N/A'} • {session.Time || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="alert alert-info small">
                    No upcoming sessions scheduled.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Upcoming Sessions */}
          <div className="col-lg-4 mb-4">
            <div className="card">
              <div className="card-header">
                <h6><i className="fas fa-calendar-alt" style={{ marginRight: "8px" }}></i>Upcoming Sessions</h6>
              </div>
              <div className="card-body">
                <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                  {sessions && sessions.length > 0 ? (
                    sessions.slice(0, 4).map((session: any, index: number) => (
                      <div key={index} className="session-item mb-3 p-2" style={{ background: "rgba(74, 122, 166, 0.05)", borderRadius: "6px", borderLeft: "3px solid var(--tutoring-orange)" }}>
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <h6 className="mb-1" style={{ color: "var(--tutoring-blue)" }}>Session</h6>
                            <p className="mb-0 small text-muted">{session.FormattedDate || 'N/A'}</p>
                          </div>
                          <div className="text-end">
                            <span className="badge" style={{ background: "var(--tutoring-orange)", color: "white" }}>
                              {session.Day || 'N/A'}
                            </span>
                            <p className="mb-0 small text-muted">{session.Time || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="alert alert-info small">
                      No upcoming sessions found.
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
                <h6><i className="fas fa-bolt" style={{ marginRight: "8px" }}></i>Quick Actions</h6>
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
                    <img src={billingIconPath} alt="Billing Icon" style={{ width: "16px", height: "16px", marginRight: "8px" }} />
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