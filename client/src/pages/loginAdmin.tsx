// src/pages/loginAdmin.tsx
import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import logoPath from "@assets/logo_1755332058201.webp";

export default function LoginAdmin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [, navigate] = useLocation();
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      // 1) Log in (sets cookie)
      const res = await apiRequest("POST", "/api/admin/login", data);

      // 2) Warm the session so cookie is immediately usable
      const meRes = await fetch("/api/admin/me", {
        credentials: "include",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!meRes.ok) {
        throw new Error("Login succeeded but session not established.");
      }
      const meJson = await meRes.json();

      // Prime the React Query cache so the guard/dashboard won't refetch
      queryClient.setQueryData(["/api/admin/me"], meJson);

      return res.json();
    },
    onSuccess: () => {
      // Hard redirect avoids any SPA state edge cases
      if (typeof window !== "undefined") {
        window.location.replace("/admin");
      } else {
        navigate("/admin");
      }
    },
    onError: (err: any) => {
      setError(err?.message || "Invalid credentials.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="login-body">
      <div className="login-card">
        <div className="login-header">
          <img src={logoPath} alt="Tutoring Club Logo" className="login-logo" />
          <h1 className="login-title">Admin Portal Login</h1>
        </div>

        <div className="login-content">
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="info-text">
            Sign in with your franchise admin email and password.
          </div>

          <form onSubmit={handleSubmit} autoComplete="on">
            <div className="mb-3">
              <label htmlFor="admin_email" className="form-label">Admin Email</label>
              <input
                type="email"
                className="form-control"
                id="admin_email"
                placeholder="owner@yourcenter.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                disabled={loginMutation.isPending}
              />
            </div>

            <div className="mb-3">
              <label htmlFor="admin_password" className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                id="admin_password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={loginMutation.isPending}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="text-center mt-3">
            <small className="text-muted">
              If you’re a parent, please{" "}
              <a
                href="/login"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/login");
                }}
              >
                use the Parent Login
              </a>
              .
            </small>
          </div>
        </div>
      </div>
    </div>
  );
}
