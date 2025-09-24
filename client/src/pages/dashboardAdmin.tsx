// src/pages/dashboardAdmin.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Policy = { hideBilling?: boolean };

export default function DashboardAdmin() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  // Get admin identity from the same key used by the guard/login
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["/api/admin/me"],
    // Do NOT throw on 401 here; if 401 happens, we'll bounce to login
    retry: false,
  });

  // Fetch flags
  const {
    data: flags,
    isLoading: flagsLoading,
    refetch: refetchFlags,
  } = useQuery({
    queryKey: ["/api/admin/flags"],
    retry: false,
    queryFn: async () => {
      const r = await fetch("/api/admin/flags", { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error("Failed to load flags");
      return r.json() as Promise<{ policy: Policy; admins: string[] }>;
    },
  });

  // Redirect if not admin
  useEffect(() => {
    if (!meLoading && !me) {
      navigate("/admin-login");
    }
  }, [meLoading, me, navigate]);

  const [policy, setPolicy] = useState<Policy>({ hideBilling: false });
  const [admins, setAdmins] = useState<string[]>([]);
  const [adminListText, setAdminListText] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync local state from flags
  useEffect(() => {
    if (flags) {
      setPolicy(flags.policy || { hideBilling: false });
      setAdmins(Array.isArray(flags.admins) ? flags.admins : []);
      setAdminListText((Array.isArray(flags.admins) ? flags.admins : []).join("\n"));
    }
  }, [flags]);

  // Mutations
  const updatePolicyMutation = useMutation({
    mutationFn: async (nextPolicy: Policy) => {
      const r = await fetch("/api/admin/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ policy: nextPolicy }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "Failed to update policy");
      return j as { policy: Policy; admins?: string[] };
    },
    onMutate: async (next) => {
      setSaving(true);
      // optimistic update
      setPolicy(next);
    },
    onSuccess: async () => {
      await refetchFlags();
    },
    onError: (e: any) => {
      alert(e?.message || "Update failed");
    },
    onSettled: () => setSaving(false),
  });

  const updateAdminsMutation = useMutation({
    mutationFn: async (list: string[]) => {
      const r = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ admins: list }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "Failed to update admins");
      return j as { admins: string[] };
    },
    onMutate: async (list) => {
      setSaving(true);
      setAdmins(list);
    },
    onSuccess: async () => {
      await refetchFlags();
      alert("Admin list updated.");
    },
    onError: (e: any) => {
      alert(e?.message || "Update failed");
    },
    onSettled: () => setSaving(false),
  });

  const toggleHideBilling = () => {
    updatePolicyMutation.mutate({ hideBilling: !policy.hideBilling });
  };

  const saveAdmins = () => {
    const list = adminListText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    updateAdminsMutation.mutate(list);
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    // Clear cached admin/me so guards don't think we're still logged in
    queryClient.removeQueries({ queryKey: ["/api/admin/me"] });
    navigate("/admin-login");
  };

  if (meLoading || flagsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tutoring-blue mx-auto mb-4"></div>
          <p className="text-text-light">Loading…</p>
        </div>
      </div>
    );
  }
  if (!me) return null; // redirect handled above

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
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5 className="m-0 text-white">Billing Visibility</h5>
            </div>
            <div className="card-body">
              <p className="text-muted">
                Toggle whether parents at this franchise can see detailed billing information.
              </p>
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="hideBillingSwitch"
                  checked={!!policy.hideBilling}
                  onChange={toggleHideBilling}
                  disabled={saving}
                />
                <label className="form-check-label" htmlFor="hideBillingSwitch">
                  {policy.hideBilling ? "Hidden (blurred with overlay)" : "Visible"}
                </label>
              </div>
              {saving && <div className="small text-muted mt-2">Saving…</div>}
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5 className="m-0 text-white">Admin Emails</h5>
            </div>
            <div className="card-body">
              <p className="text-muted">
                One email per line. Only these emails can log in as admin for this franchise.
              </p>
              <textarea
                className="form-control"
                rows={8}
                value={adminListText}
                onChange={(e) => setAdminListText(e.target.value)}
              />
              <button className="btn btn-primary mt-3" onClick={saveAdmins} disabled={saving}>
                Save Admin List
              </button>
              <div className="small text-muted mt-2">
                Current: {admins.length ? admins.join(", ") : "(none)"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
