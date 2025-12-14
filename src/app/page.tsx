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
    if (loading) return;

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
        // ignore
      }

      if (!res.ok || !data.success) {
        setError(data.message || "Login failed");
        return;
      }

      window.localStorage.setItem("adminAuth", "true");
      window.localStorage.setItem("adminUsername", username);
      router.push(from || "/dashboard");
    } catch (err) {
      console.error(err);
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-[var(--surface-root)] text-[hsl(var(--foreground))]">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))]">
            Geofence Admin
          </p>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Admin Dashboard
          </h1>

          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Sign in to manage zones, users and live alerts.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          {/* Username */}
          <div>
            <label
              htmlFor="username"
              className="block text-xs font-medium mb-1.5 text-[hsl(var(--foreground))]"
            >
              Username
            </label>

            <div
              className="
                flex items-center gap-2 rounded-full px-4 py-3
                border border-[hsl(var(--border))]
                bg-[hsl(var(--popover))]
                shadow-[var(--shadow-soft)]
                transition
                focus-within:border-[hsl(var(--ring))]
                focus-within:ring-4 focus-within:ring-[hsl(var(--ring)/0.25)]
              "
            >
              <input
                id="username"
                name="username"
                className="
                  w-full bg-transparent outline-none text-sm
                  placeholder:text-[hsl(var(--muted-foreground))]
                "
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="admin"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium mb-1.5 text-[hsl(var(--foreground))]"
            >
              Password
            </label>

            <div
              className="
                flex items-center gap-2 rounded-full px-4 py-3
                border border-[hsl(var(--border))]
                bg-[hsl(var(--popover))]
                shadow-[var(--shadow-soft)]
                transition
                focus-within:border-[hsl(var(--ring))]
                focus-within:ring-4 focus-within:ring-[hsl(var(--ring)/0.25)]
              "
            >
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                className="
                  w-full bg-transparent outline-none text-sm
                  placeholder:text-[hsl(var(--muted-foreground))]
                "
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />

              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="
                  shrink-0 btn-base btn-ghost
                  py-1 px-3 text-[11px]
                "
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p
              role="alert"
              className="
                text-sm rounded-2xl border px-3 py-2
                border-[hsl(var(--danger)/0.35)]
                bg-[hsl(var(--danger)/0.12)]
                text-[hsl(var(--danger))]
              "
            >
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="
              btn-base w-full mt-2 disabled:opacity-60 disabled:cursor-not-allowed
              bg-[hsl(var(--primary))]
              text-[hsl(var(--primary-foreground))]
              shadow-[var(--shadow-card)]
              hover:bg-[hsl(var(--primary)/0.92)]
            "
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
