"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Alert {
  id: number;
  user_id: number;
  username: string;
  alert_type: "exit" | "enter";
  occurred_at: string;
  latitude: number | null;
  longitude: number | null;
}

export default function LogsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const userIdParam = searchParams.get("userId");

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userIdParam) return;

    let isCancelled = false;

    async function load(showSpinner: boolean) {
      try {
        if (showSpinner) {
          setLoading(true);
          setError("");
        }

        const res = await fetch(`/api/alerts?userId=${userIdParam}`);
        if (!res.ok) throw new Error("Failed to load logs");

        const data = (await res.json()) as Alert[];
        if (!isCancelled) setAlerts(data);
      } catch (e) {
        console.error(e);
        if (!isCancelled) setError("Failed to load logs");
      } finally {
        if (!isCancelled && showSpinner) setLoading(false);
      }
    }

    load(true);

    const intervalId = window.setInterval(() => {
      load(false);
    }, 5000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [userIdParam]);

  const username = alerts[0]?.username;
  const userId =
    userIdParam ?? (alerts[0]?.user_id ? String(alerts[0].user_id) : null);
  const userIdText = userId ?? "?";

  function handleDownloadCsv() {
    if (!userId) return;
    window.open(`/api/alerts?userId=${userId}&format=csv`, "_blank");
  }

  function handleBack() {
    if (userId) router.push(`/dashboard?userId=${userId}`);
    else router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[var(--surface-root)] text-[hsl(var(--foreground))]">
      {/* Top bar */}
      <header className="dashboard-topbar px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold">User Logs</h1>
            <p className="text-xs mt-1 text-[hsl(var(--muted-foreground))]">
              User:{" "}
              {username ? (
                <>
                  <span className="font-medium">{username}</span> (ID #
                  {userIdText})
                </>
              ) : (
                <>ID #{userIdText}</>
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleDownloadCsv}
              disabled={!userId || alerts.length === 0}
              className="btn-base btn-ghost text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Download CSV
            </button>

            <button
              onClick={handleBack}
              className="
                btn-base text-xs sm:text-sm
                bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
                shadow-[var(--shadow-soft)]
                hover:bg-[hsl(var(--primary)/0.92)]
                border border-transparent
              "
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="p-4 sm:p-6 lg:p-8">
        <div className="card p-4 sm:p-6">
          {error && (
            <div
              className="
                mb-4 rounded-2xl border px-4 py-2 text-sm
                border-[hsl(var(--danger)/0.35)]
                bg-[hsl(var(--danger)/0.12)]
                text-[hsl(var(--danger))]
              "
            >
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Loading logs...
            </p>
          ) : alerts.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              No logs for this user.
            </p>
          ) : (
            <div className="scroll-x hide-scrollbar">
              <table className="dashboard-table text-xs">
                <thead className="dashboard-thead">
                  <tr>
                    <th className="text-left py-2 pr-3">Event</th>
                    <th className="text-left py-2 pr-3">Time</th>
                    <th className="text-left py-2 pr-3">Latitude</th>
                    <th className="text-left py-2 pr-3">Longitude</th>
                  </tr>
                </thead>

                <tbody>
                  {alerts.map((a) => {
                    const label =
                      a.alert_type === "exit" ? "Exited zone" : "Entered zone";

                    // Use theme tokens instead of slate/red/emerald classes
                    const badgeStyle =
                      a.alert_type === "exit"
                        ? "text-[hsl(var(--danger))]"
                        : "text-[hsl(var(--success))]";

                    return (
                      <tr key={a.id}>
                        <td className="py-3 pr-3">
                          <span className={`${badgeStyle} font-semibold`}>
                            {label}
                          </span>
                        </td>

                        <td className="py-3 pr-3 text-[hsl(var(--foreground))]">
                          {new Date(a.occurred_at).toLocaleString()}
                        </td>

                        <td className="py-3 pr-3 text-[hsl(var(--foreground))]">
                          {a.latitude != null ? a.latitude.toFixed(5) : "-"}
                        </td>

                        <td className="py-3 pr-3 text-[hsl(var(--foreground))]">
                          {a.longitude != null ? a.longitude.toFixed(5) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
