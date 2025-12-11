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
        if (!res.ok) {
          throw new Error("Failed to load logs");
        }

        const data = (await res.json()) as Alert[];
        if (!isCancelled) {
          setAlerts(data);
        }
      } catch (e) {
        console.error(e);
        if (!isCancelled) {
          setError("Failed to load logs");
        }
      } finally {
        if (!isCancelled && showSpinner) {
          setLoading(false);
        }
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
    const url = `/api/alerts?userId=${userId}&format=csv`;
    window.open(url, "_blank");
  }

  function handleBack() {
    if (userId) {
      router.push(`/dashboard?userId=${userId}`);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-slate-800 bg-slate-950/80 backdrop-blur flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold">User Logs</h1>
          <p className="text-xs text-slate-400 mt-1">
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

        <div className="flex gap-2">
          <button
            onClick={handleDownloadCsv}
            disabled={!userId || alerts.length === 0}
            className="btn-base btn-ghost text-xs sm:text-sm disabled:opacity-50"
          >
            Download CSV
          </button>
          <button
            onClick={handleBack}
            className="btn-base btn-primary text-xs sm:text-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="p-4 sm:p-6 lg:p-8">
        <div className="card p-4 sm:p-6">
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-slate-400">Loading logs...</p>
          ) : alerts.length === 0 ? (
            <p className="text-sm text-slate-400">No logs for this user.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="text-left py-2 pr-3 font-normal">Event</th>
                    <th className="text-left py-2 pr-3 font-normal">Time</th>
                    <th className="text-left py-2 pr-3 font-normal">
                      Latitude
                    </th>
                    <th className="text-left py-2 pr-3 font-normal">
                      Longitude
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => {
                    const label =
                      a.alert_type === "exit" ? "Exited zone" : "Entered zone";
                    const cls =
                      a.alert_type === "exit"
                        ? "text-red-400"
                        : "text-emerald-400";

                    return (
                      <tr
                        key={a.id}
                        className="border-b border-slate-800/70 last:border-0"
                      >
                        <td className="py-2 pr-3">
                          <span className={`${cls} font-semibold`}>
                            {label}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-slate-300">
                          {new Date(a.occurred_at).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-slate-300">
                          {a.latitude != null ? a.latitude.toFixed(5) : "-"}
                        </td>
                        <td className="py-2 pr-3 text-slate-300">
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
