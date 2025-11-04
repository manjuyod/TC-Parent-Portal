import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";

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

type SavingKey =
  | "hideBilling"
  | "hideHours"
  | "billingColumnVisibility.hideDate"
  | "billingColumnVisibility.hideStudent"
  | "billingColumnVisibility.hideEventType"
  | "billingColumnVisibility.hideAttendance"
  | "billingColumnVisibility.hideAdjustment";

const DEFAULT_COLS: Required<BillingColumnVisibility> = {
  hideDate: false,
  hideStudent: false,
  hideEventType: false,
  hideAttendance: false,
  hideAdjustment: false,
};

export default function DashboardAdmin() {
  const [, navigate] = useLocation();
  const [me, setMe] = useState<{ franchiseId: string | number; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState<Flags>({
    hideBilling: false,
    hideHours: false,
    billingColumnVisibility: { ...DEFAULT_COLS },
  });
  const [savingKey, setSavingKey] = useState<null | SavingKey>(null);

  // auth + flags
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/me");
        if (!r.ok) throw new Error("not admin");
        const j = await r.json();
        setMe(j);

        const f = await fetch("/api/admin/flags").then((x) => x.json());
        setFlags({
          hideBilling: !!f.hideBilling,
          hideHours: !!f.hideHours,
          billingColumnVisibility: { ...DEFAULT_COLS, ...(f.billingColumnVisibility ?? {}) },
        });
      } catch {
        navigate("/admin-login");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  // root toggles (hideBilling / hideHours)
  const toggleRoot = async (key: "hideBilling" | "hideHours") => {
    setSavingKey(key);
    try {
      const next = { ...flags, [key]: !flags[key] };
      const r = await fetch("/api/admin/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next[key] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "Failed to update flag");
      setFlags({
        hideBilling: !!j.hideBilling,
        hideHours: !!j.hideHours,
        billingColumnVisibility: { ...DEFAULT_COLS, ...(j.billingColumnVisibility ?? {}) },
      });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSavingKey(null);
    }
  };

  // nested toggles for billingColumnVisibility — send FULL object to backend
  const toggleColumn = async (
    colKey: "hideDate" | "hideStudent" | "hideEventType" | "hideAttendance" | "hideAdjustment"
  ) => {
    const sk: SavingKey = `billingColumnVisibility.${colKey}`;
    setSavingKey(sk);
    try {
      const currentCols = { ...DEFAULT_COLS, ...(flags.billingColumnVisibility ?? {}) };
      const nextCols = { ...currentCols, [colKey]: !currentCols[colKey] };

      const r = await fetch("/api/admin/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingColumnVisibility: nextCols }), // FULL object
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "Failed to update billing columns");

      setFlags({
        hideBilling: !!j.hideBilling,
        hideHours: !!j.hideHours,
        billingColumnVisibility: { ...DEFAULT_COLS, ...(j.billingColumnVisibility ?? {}) },
      });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSavingKey(null);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    navigate("/admin-login");
  };

  const cols = { ...DEFAULT_COLS, ...(flags.billingColumnVisibility ?? {}) };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tutoring-blue mx-auto mb-4"></div>
          <p className="text-text-light">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="m-0">Admin Dashboard</h2>
        <div className="text-end">
          <div className="small text-muted">
            {me?.email} • Franchise {me?.franchiseId}
          </div>
          <button className="btn btn-outline-primary btn-sm mt-2" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      <div className="row g-4">
        {/* Billing tab visibility */}
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5 className="m-0 text-white">Billing Tab Visibility</h5>
            </div>
            <div className="card-body">
              <p className="text-muted">
                Toggle whether parents at this franchise can see the <strong>Billing Information</strong> tab.
              </p>
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="hideBillingSwitch"
                  checked={!!flags.hideBilling}
                  onChange={() => toggleRoot("hideBilling")}
                  disabled={savingKey === "hideBilling"}
                />
                <label className="form-check-label" htmlFor="hideBillingSwitch">
                  {flags.hideBilling ? "Hidden (tab removed)" : "Visible"}
                </label>
              </div>
              {savingKey === "hideBilling" && <div className="small text-muted mt-2">Saving…</div>}
            </div>
          </div>
        </div>

        {/* Hours balance visibility */}
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5 className="m-0 text-white">Hours Balance Visibility</h5>
            </div>
            <div className="card-body">
              <p className="text-muted">
                Toggle whether parents at this franchise can see <strong>Hours Remaining</strong> — on the Home card and in Billing summary.
              </p>
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="hideHoursSwitch"
                  checked={!!flags.hideHours}
                  onChange={() => toggleRoot("hideHours")}
                  disabled={savingKey === "hideHours"}
                />
                <label className="form-check-label" htmlFor="hideHoursSwitch">
                  {flags.hideHours ? "Hidden (hours not shown)" : "Visible"}
                </label>
              </div>
              {savingKey === "hideHours" && <div className="small text-muted mt-2">Saving…</div>}
            </div>
          </div>
        </div>

        {/* Billing table columns */}
        <div className="col-12">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="m-0 text-white">Billing Table Columns</h5>
              <small className="text-light">Control which columns parents can see in Account Details</small>
            </div>
            <div className="card-body">
              <div className="row gy-3">
                <div className="col-sm-6 col-md-4 col-lg-3">
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="hideDateCol"
                      checked={!!cols.hideDate}
                      onChange={() => toggleColumn("hideDate")}
                      disabled={savingKey === "billingColumnVisibility.hideDate"}
                    />
                    <label className="form-check-label" htmlFor="hideDateCol">
                      Hide Date
                    </label>
                  </div>
                  {savingKey === "billingColumnVisibility.hideDate" && (
                    <div className="small text-muted mt-1">Saving…</div>
                  )}
                </div>

                <div className="col-sm-6 col-md-4 col-lg-3">
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="hideStudentCol"
                      checked={!!cols.hideStudent}
                      onChange={() => toggleColumn("hideStudent")}
                      disabled={savingKey === "billingColumnVisibility.hideStudent"}
                    />
                    <label className="form-check-label" htmlFor="hideStudentCol">
                      Hide Student
                    </label>
                  </div>
                  {savingKey === "billingColumnVisibility.hideStudent" && (
                    <div className="small text-muted mt-1">Saving…</div>
                  )}
                </div>

                <div className="col-sm-6 col-md-4 col-lg-3">
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="hideEventTypeCol"
                      checked={!!cols.hideEventType}
                      onChange={() => toggleColumn("hideEventType")}
                      disabled={savingKey === "billingColumnVisibility.hideEventType"}
                    />
                    <label className="form-check-label" htmlFor="hideEventTypeCol">
                      Hide Event Type
                    </label>
                  </div>
                  {savingKey === "billingColumnVisibility.hideEventType" && (
                    <div className="small text-muted mt-1">Saving…</div>
                  )}
                </div>

                <div className="col-sm-6 col-md-4 col-lg-3">
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="hideAttendanceCol"
                      checked={!!cols.hideAttendance}
                      onChange={() => toggleColumn("hideAttendance")}
                      disabled={savingKey === "billingColumnVisibility.hideAttendance"}
                    />
                    <label className="form-check-label" htmlFor="hideAttendanceCol">
                      Hide Attendance
                    </label>
                  </div>
                  {savingKey === "billingColumnVisibility.hideAttendance" && (
                    <div className="small text-muted mt-1">Saving…</div>
                  )}
                </div>

                <div className="col-sm-6 col-md-4 col-lg-3">
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="hideAdjustmentCol"
                      checked={!!cols.hideAdjustment}
                      onChange={() => toggleColumn("hideAdjustment")}
                      disabled={savingKey === "billingColumnVisibility.hideAdjustment"}
                    />
                    <label className="form-check-label" htmlFor="hideAdjustmentCol">
                      Hide Adjustment
                    </label>
                  </div>
                  {savingKey === "billingColumnVisibility.hideAdjustment" && (
                    <div className="small text-muted mt-1">Saving…</div>
                  )}
                </div>
              </div>

              <hr className="my-4" />
              <p className="text-muted small mb-0">
                Tip: If you hide <em>all</em> columns, parents will see a friendly notice instead of an empty table.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
