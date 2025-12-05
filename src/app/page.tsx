// src/app/page.tsx
"use client";

/**
 * LoginPage
 * ---------
 * Route: "/"
 *
 * Purpose:
 * - Provides a minimal admin login form for the geofence dashboard.
 * - Authenticates against the backend via POST /api/login.
 * - On success:
 *     - Stores a simple auth flag in localStorage.
 *     - Redirects the admin to the main dashboard (or a `from` URL if provided).
 *
 * Security model (for this project):
 * - There is no server-side session or JWT in this version.
 * - The dashboard is "guarded" on the client by checking:
 *     localStorage.getItem("adminAuth") === "true"
 *   inside pages such as /dashboard and /dashboard/logs.
 * - /api/login is responsible for checking credentials against the database.
 *
 * This is intentionally lightweight for an internal/admin-only tool.
 * For a public deployment, you would typically:
 *   - Add HTTP-only session cookies or JWTs,
 *   - Protect API routes server-side,
 *   - And avoid relying only on localStorage for authorization.
 */

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * If the user was redirected here from a protected route,
   * that route can pass a `from` query parameter.
   *
   * Example:
   *   /?from=/dashboard
   *
   * If it exists, we redirect back there after a successful login.
   * Otherwise, we default to "/dashboard".
   */
  const from = searchParams.get("from") || "/dashboard";

  // Controlled input state for the login form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Toggles password visibility ("Show" / "Hide")
  const [showPassword, setShowPassword] = useState(false);

  // UI feedback state
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /**
   * handleSubmit
   * ------------
   * - Prevents default form submission.
   * - Sends credentials to /api/login.
   * - Interprets the response and updates UI state accordingly.
   *
   * Expected API response shape:
   *   { success: true }                      → login OK
   *   { success: false, message: string }    → login failed
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Reset any previous error and show loading state
    setError("");
    setLoading(true);

    try {
      // Call the login API with username + password as JSON
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      // We attempt to parse JSON, but stay resilient if the response is not JSON
      let data: { success?: boolean; message?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // If parsing fails, `data` stays as the empty object above
      }

      // Either the HTTP status is not OK or the backend signaled failure
      if (!res.ok || !data.success) {
        setError(data.message || "Login failed");
      } else {
        /**
         * Store the lightweight "auth" flag in localStorage.
         * Other pages (like /dashboard) read this flag to decide
         * whether the user is allowed to stay on the page.
         */
        window.localStorage.setItem("adminAuth", "true");

        // Optional: store the admin username (for header / greeting, etc.)
        window.localStorage.setItem("adminUsername", username);

        // Redirect to the original destination or the dashboard
        router.push(from || "/dashboard");
      }
    } catch (err) {
      // Network errors or unexpected runtime issues end up here
      console.error(err);
      setError("Something went wrong");
    } finally {
      // Always clear the loading state at the end
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      {/* Card container for the login form */}
      <div className="w-full max-w-md bg-slate-900/80 p-8 rounded-2xl shadow-xl border border-slate-700">
        <h1 className="text-2xl font-semibold mb-6 text-center">
          Admin Dashboard
        </h1>

        {/* `autoComplete="off"` reduces browsers trying to auto-fill random fields */}
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          {/* Username field */}
          <div>
            <label className="block text-sm mb-1">Username</label>
            <input
              className="w-full rounded-lg bg-slate-950/60 text-foreground px-3 py-2 outline-none border border-slate-700 focus:border-accent"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          {/* Password field with show/hide toggle */}
          <div>
            <label className="block text-sm mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="w-full rounded-lg bg-slate-950/60 text-foreground px-3 py-2 pr-16 outline-none border border-slate-700 focus:border-accent"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute inset-y-0 right-3 text-xs text-foreground/70 hover:text-foreground"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* Error message (if any) */}
          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-700 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-accent hover:bg-accent/90 text-white font-medium py-2 mt-2 disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
