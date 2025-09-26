// src/pages/dashboardAdmin.tsx
import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";

type FlagsResp = { franchiseId: string; hideBilling: boolean };

export default function DashboardAdmin() {
  const [, navigate] = useLocation();
  const [me, setMe] = useState<{ franchiseId: string | number; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [hideBilling, setHideBilling] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch("/api/admin/me", { credentials: "include" });
        if (!meRes.ok) throw new Error();
        const meJson = await meRes.json();
        setMe(meJson);

        const f = await fetch("/api/admin/flags", { credentials: "include" }).then(r => r.json()) as FlagsResp;
        setHideBilling(!!f.hideBilling);
      } catch {
        navigate("/admin-login");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const toggleHideBilling = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ hideBilling: !hideBilling })
      });
      const j = await r.json() as FlagsResp;
      if (!r.ok) throw new Error(j as any);
      setHideBilling(!!j.hideBilling);
      // Parents will see the Billing tab appear/disappear on their next refresh
      // (or immediately if you add WS/SSE again).
    } catch (e: any) {
      alert(e?.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
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

      <div className="card">
        <div className="card-header">
          <h5 className="m-0 text-white">Billing Tab Visibility</h5>
        </div>
        <div className="card-body">
          <p className="text-muted">
            Toggle whether parents at this franchise can see the <strong>Billing Information</strong> tab at all.
          </p>
          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              id="hideBillingSwitch"
              checked={hideBilling}
              onChange={toggleHideBilling}
              disabled={saving}
            />
            <label className="form-check-label" htmlFor="hideBillingSwitch">
              {hideBilling ? "Hidden (tab removed)" : "Visible (tab shown)"}
            </label>
          </div>
          {saving && <div className="small text-muted mt-2">Saving…</div>}
        </div>
      </div>
    </div>
  );
}
