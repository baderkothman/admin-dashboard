// src/app/dashboard/logs/page.tsx
"use client";

/**
 * LogsPage
 * --------
 * Read-only view that displays all ENTER / EXIT alerts for a single user.
 *
 * Routing:
 *   - Path:  /dashboard/logs
 *   - Query: ?userId=123
 *
 * Data flow:
 *   - Reads `userId` from the query string (Next.js `useSearchParams`).
 *   - Fetches alerts from `/api/alerts?userId=<id>`.
 *   - Renders a simple table of alerts with:
 *       - Event type  (Entered zone / Exited zone)
 *       - Timestamp   (formatted with `.toLocaleString()`)
 *       - Latitude / Longitude (fixed to 5 decimals when present)
 *
 * Navigation:
 *   - "Download CSV":
 *       - Calls `/api/alerts?userId=<id>&format=csv`
 *       - Opens the CSV file in a new tab (browser handles download).
 *
 *   - "Back to Dashboard":
 *       - If we know the `userId`, navigate to `/dashboard?userId=<id>`
 *         so the dashboard page can pre-select the same user again.
 *       - If we do NOT have a valid `userId`, fallback to `/dashboard`.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Alert
 * -----
 * Shape of a single alert item as returned from `/api/alerts`.
 *
 * Fields:
 *   - id:          Primary key of the alert.
 *   - user_id:     The user this alert belongs to.
 *   - username:    Helpful for showing which user the alert is for.
 *   - alert_type:  "exit" | "enter" (leaving or entering the zone).
 *   - occurred_at: ISO date-time string (server timestamp).
 *   - latitude:    Nullable latitude at the time of the alert.
 *   - longitude:   Nullable longitude at the time of the alert.
 */
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

  /**
   * Query param:
   *   - Raw `userId` string from the URL: /dashboard/logs?userId=123
   *   - We keep this as a string and only convert if needed.
   */
  const userIdParam = searchParams.get("userId");

  /**
   * Component state:
   *
   * - alerts:
   *     - List of alerts loaded from the API.
   *
   * - loading:
   *     - True while the initial fetch is in progress (or on refetch).
   *
   * - error:
   *     - User-friendly error message if the fetch fails.
   */
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /**
   * Effect: Load alerts when `userIdParam` changes.
   *
   * Logic:
   *   1. If there is no `userId` in the query string, do nothing.
   *   2. Fetch `/api/alerts?userId=<userIdParam>`.
   *   3. On success:
   *        - Store the array of alerts in state.
   *      On failure:
   *        - Log the error (for debugging) and show a generic message.
   *
   *   The `isCancelled` flag protects against setting state after
   *   the component has unmounted or the effect has re-run.
   */
  useEffect(() => {
    if (!userIdParam) return;

    let isCancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

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
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      isCancelled = true;
    };
  }, [userIdParam]);

  /**
   * Derived values from loaded alerts:
   *
   * - username:
   *     - If we have at least one alert, assume all belong to the same user.
   *       (That is guaranteed by the API when filtering by `userId`.)
   *
   * - userId:
   *     - Prefer the query param userId (string).
   *     - If missing for some reason, try to compute it from the first alert.
   *     - Can still be null if neither is available.
   */
  const username = alerts[0]?.username;
  const userId =
    userIdParam ?? (alerts[0]?.user_id ? String(alerts[0].user_id) : null);
  const userIdText = userId ?? "?";

  /**
   * Download CSV handler:
   *   - If we do not have a valid `userId`, do nothing.
   *   - Otherwise open `/api/alerts?userId=<id>&format=csv` in a new tab.
   *
   * Browser behavior:
   *   - Typically triggers a download dialog or directly saves the file,
   *     depending on the browser configuration.
   */
  function handleDownloadCsv() {
    if (!userId) return;
    const url = `/api/alerts?userId=${userId}&format=csv`;
    window.open(url, "_blank");
  }

  /**
   * Back navigation handler:
   *   - When we know the `userId`, we append it as a query param when
   *     navigating back to `/dashboard`, so:
   *        `/dashboard?userId=<id>`
   *     The dashboard page can read this and pre-select the same user again.
   *
   *   - If we do not have a `userId`, we navigate to `/dashboard` without
   *     any query params.
   */
  function handleBack() {
    if (userId) {
      router.push(`/dashboard?userId=${userId}`);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar: title, user info, and actions (Download CSV / Back) */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
        <div>
          <h1 className="text-xl font-semibold">User Logs</h1>
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
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-50"
          >
            Download CSV
          </button>
          <button
            onClick={handleBack}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
          >
            Back to Dashboard
          </button>
        </div>
      </header>

      {/* Main content: error state, loading state, or the logs table */}
      <main className="p-6 lg:p-8">
        {/* Error banner */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading ? (
          <p className="text-sm text-slate-400">Loading logs...</p>
        ) : alerts.length === 0 ? (
          // Empty state (no alerts for this user)
          <p className="text-sm text-slate-400">No logs for this user.</p>
        ) : (
          // Table of alerts
          <div className="bg-slate-900/80 rounded-3xl border border-slate-800 p-4 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="text-left py-2 pr-3 font-normal">Event</th>
                  <th className="text-left py-2 pr-3 font-normal">Time</th>
                  <th className="text-left py-2 pr-3 font-normal">Latitude</th>
                  <th className="text-left py-2 pr-3 font-normal">Longitude</th>
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
                        <span className={`${cls} font-semibold`}>{label}</span>
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
      </main>
    </div>
  );
}
