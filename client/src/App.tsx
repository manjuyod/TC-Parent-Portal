// src/App.tsx
import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient, getQueryFn } from "@/lib/queryClient";
import React from "react";

import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import DashboardAdmin from "@/pages/dashboardAdmin";
import LoginAdmin from "@/pages/loginAdmin";

/** Parent gate */
function AuthCheck({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { data: user, isLoading } = useQuery({ queryKey: ["/api/auth/me"], retry: false });

  React.useEffect(() => {
    if (isLoading) return;
    if (!user && location !== "/login") navigate("/login");
    else if (user && location === "/login") navigate("/");
  }, [user, isLoading, location, navigate]);

  if (isLoading) return null;
  if (!user && location !== "/login") return null;
  if (user && location === "/login") return null;
  return <>{children}</>;
}

/** Admin gate (returns null on 401 instead of throwing) */
function AdminAuthCheck({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { data: admin, isLoading } = useQuery({
    queryKey: ["/api/admin/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  React.useEffect(() => {
    if (isLoading) return;
    if (!admin && location !== "/admin-login") navigate("/admin-login");
    else if (admin && location === "/admin-login") navigate("/admin");
  }, [admin, isLoading, location, navigate]);

  if (isLoading) return null;
  // Do not block /admin once authenticated
  if (!admin && location !== "/admin-login") return null;
  if (admin && location === "/admin-login") return null;

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/login" component={Login} />
      <Route path="/admin-login" component={LoginAdmin} />

      {/* Admin-only */}
      <Route path="/admin">
        <AdminAuthCheck>
          <DashboardAdmin />
        </AdminAuthCheck>
      </Route>

      {/* Parent-only */}
      <Route path="/">
        <AuthCheck>
          <Dashboard />
        </AuthCheck>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
    </QueryClientProvider>
  );
}
