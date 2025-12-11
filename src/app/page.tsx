"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") || "/dashboard";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      let data: { success?: boolean; message?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // ignore JSON parse errors
      }

      if (!res.ok || !data.success) {
        setError(data.message || "Login failed");
      } else {
        window.localStorage.setItem("adminAuth", "true");
        window.localStorage.setItem("adminUsername", username);
        router.push(from || "/dashboard");
      }
    } catch (err) {
      console.error(err);
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Geofence Admin
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Admin Dashboard
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Sign in to manage zones, users and live alerts.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          {/* Username field */}
          <div>
            <label className="block text-xs font-medium mb-1.5">Username</label>
            <div className="input-shell">
              <input
                className="bg-transparent outline-none text-sm"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="admin"
              />
            </div>
          </div>

          {/* Password field with show/hide toggle */}
          <div>
            <label className="block text-xs font-medium mb-1.5">Password</label>
            <div className="input-shell">
              <input
                type={showPassword ? "text" : "password"}
                className="bg-transparent outline-none text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="text-[11px] text-slate-400 hover:text-slate-200"
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
            className="btn-base btn-primary w-full mt-2"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
