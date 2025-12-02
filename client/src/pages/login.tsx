import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import logoPath from "@assets/logo_1755332058201.webp";

export default function Login() {
  const [email, setEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [, navigate] = useLocation();
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; contactPhone: string }) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: () => {
      navigate("/");
    },
    onError: (error: any) => {
      setError(
        error.message ||
          "Invalid credentials. Please contact your tutoring center."
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ email, contactPhone });
  };

  return (
    <div className="login-body">
      <div className="login-card">
        <div className="login-header">
          <img src={logoPath} alt="Tutoring Club Logo" className="login-logo" />
          <h1 className="login-title">Parent Portal Login</h1>
        </div>

        <div className="login-content">
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          <div className="info-text">
            Enter your email and phone number to access your student information
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label htmlFor="email" className="form-label">
                Email Address
              </label>
              <input
                type="email"
                className="form-control"
                id="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="mb-3">
              <label htmlFor="contact_number" className="form-label">
                Phone Number
              </label>
              <input
                type="tel"
                className="form-control"
                id="contact_number"
                placeholder="(555) 123-4567"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Logging in..." : "Login"}
            </button>
          </form>

          {/* Admin note ABOVE the button */}
          <div className="mt-3 text-center">
            <small className="text-muted">
              If you're an admin, please click the button below.
            </small>
          </div>

          {/* Admin Login button */}
          <div className="mt-2 text-center">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => navigate("/admin-login")}
            >
              Admin Login
            </button>
          </div>

          <div className="text-center mt-3">
            <small className="text-muted">

            </small>
          </div>
        </div>
      </div>
    </div>
  );
}
