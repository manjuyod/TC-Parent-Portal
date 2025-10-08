import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";

type Flags = { hideBilling?: boolean; hideHours?: boolean };

export default function DashboardAdmin() {
  const [, navigate] = useLocation();
  const [me, setMe] = useState<{ franchiseId: string | number; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState<Flags>({ hideBilling: false, hideHours: false });
  const [savingKey, setSavingKey] = useState<null | "hideBilling" | "hideHours">(null);

  // auth + flags
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/me");
        if (!r.ok) throw new Error("not admin");
        const j = await r.json();
        setMe(j);

        const f = await fetch("/api/admin/flags").then((x) => x.json());
        setFlags({ hideBilling: !!f.hideBilling, hideHours: !!f.hideHours });
      } catch {
        navigate("/admin-login");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const toggle = async (key: "hideBilling" | "hideHours") => {
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
      setFlags({ hideBilling: !!j.hideBilling, hideHours: !!j.hideHours });
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
                Toggle whether parents at this franchise can see the <strong>Billing</strong> tab.
              </p>
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="hideBillingSwitch"
                  checked={!!flags.hideBilling}
                  onChange={() => toggle("hideBilling")}
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
                Toggle whether parents at this franchise can see <strong>Hours Remaining</strong>
                —on the Home card and in Billing summary.
              </p>
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="hideHoursSwitch"
                  checked={!!flags.hideHours}
                  onChange={() => toggle("hideHours")}
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
      </div>
    </div>
  );
}
