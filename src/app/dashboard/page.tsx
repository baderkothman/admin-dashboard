// src/app/dashboard/page.tsx
"use client";

/**
 * DashboardPage
 * -------------
 * Main admin dashboard for the geofencing system.
 *
 * Responsibilities:
 *  - Client-side "auth" using localStorage("adminAuth") === "true".
 *  - Fetch and display non-admin users with search + pagination.
 *  - Show global alerts in a bell dropdown (and allow "clear" + "refresh").
 *  - Let the admin:
 *      • Assign / update a geofence zone on a map (UserMapModal).
 *      • Live-track a user on a map (UserTrackModal).
 *      • Open a per-user logs page.
 *
 * Extra behavior:
 *  - Alerts persistence:
 *      • When "Clear" is clicked in the alerts dropdown:
 *          - Store a timestamp in localStorage("alerts-cleared-until").
 *          - Immediately clear the alerts from state.
 *      • When alerts are fetched from /api/alerts:
 *          - Only keep alerts that happened AFTER the stored timestamp.
 *
 *  - Returning from logs:
 *      • Logs page redirects back to `/dashboard?userId=<id>`.
 *      • Dashboard reads that `userId` from the query string.
 *      • The matching user is auto-selected in the users list.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

/**
 * Lazy-loaded modals:
 *
 * - UserMapModal:
 *     Used to assign / edit a geofence zone for a specific user.
 *     Requires access to `window` (Leaflet map), so SSR is disabled.
 *
 * - UserTrackModal:
 *     Used to show live tracking of a single user on a map.
 */
const UserMapModal = dynamic(() => import("@/components/UserMapModal"), {
  ssr: false,
});
const UserTrackModal = dynamic(() => import("@/components/UserTrackModal"), {
  ssr: false,
});

/** LocalStorage key used to persist the "clear alerts" timestamp. */
const ALERTS_CLEAR_KEY = "alerts-cleared-until";

/**
 * User
 * ----
 * Shape of a user row as returned by /api/users.
 *
 * Includes:
 *   - Identity & role (id, username, role).
 *   - Zone assignment (zone_center_* + zone_radius_m).
 *   - Creation time.
 *   - Last known location + zone status (from user_locations join).
 */
interface User {
  id: number;
  username: string;
  role: "admin" | "user";
  zone_center_lat: number | string | null;
  zone_center_lng: number | string | null;
  zone_radius_m: number | string | null;
  created_at: string;

  last_latitude: number | string | null;
  last_longitude: number | string | null;
  inside_zone: number | null;
  last_seen: string | null;
}

/**
 * Alert
 * -----
 * Shape of an alert row as returned by /api/alerts.
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

/**
 * UserAvatarIcon
 * --------------
 * Neutral SVG avatar used in the users list and the user detail panel.
 * (No emojis, only vector.)
 */
function UserAvatarIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="fill-slate-300"
    >
      {/* Head */}
      <circle cx="12" cy="8" r="4" />
      {/* Shoulders / torso */}
      <path d="M4 19c0-3.2 2.7-5.5 8-5.5s8 2.3 8 5.5v1H4z" />
    </svg>
  );
}

/**
 * BellIcon
 * --------
 * Simple SVG bell for the global alerts button.
 */
function BellIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="fill-slate-300"
    >
      {/* Bell body */}
      <path d="M12 2a6 6 0 0 0-6 6v3.1L4.3 13.7A1 1 0 0 0 5 15h14a1 1 0 0 0 .7-1.7L18 11.1V8a6 6 0 0 0-6-6z" />
      {/* Bell clapper */}
      <path d="M10 18a2 2 0 0 0 4 0h-4z" />
    </svg>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * If we returned from /dashboard/logs?userId=XX,
   * we read that query param to pre-select this user.
   */
  const userIdFromQuery = searchParams.get("userId");
  const initialSelectedUserId =
    userIdFromQuery && !Number.isNaN(Number(userIdFromQuery))
      ? Number(userIdFromQuery)
      : null;

  // -------------------------
  // Core data (users & alerts)
  // -------------------------
  const [users, setUsers] = useState<User[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // -------------------------
  // UI state
  // -------------------------
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState("");
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);
  const [search, setSearch] = useState("");

  /**
   * isAuthorized:
   *   - Controls whether we render the dashboard and start polling data.
   *   - Derived from localStorage("adminAuth") in a client-side effect.
   */
  const [isAuthorized, setIsAuthorized] = useState(false);

  /**
   * Selection & modal state:
   *   - selectedUserId: user currently displayed in the right panel.
   *   - mapUserId: user whose zone is being edited on the map (modal).
   *   - trackedUserId: user being live-tracked on the map (modal).
   */
  const [selectedUserId, setSelectedUserId] = useState<number | null>(
    initialSelectedUserId
  );
  const [mapUserId, setMapUserId] = useState<number | null>(null);
  const [trackedUserId, setTrackedUserId] = useState<number | null>(null);

  /**
   * Pagination state:
   *   - currentPage: current page of the filtered users list.
   *   - pageSize: how many users to show per page.
   */
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // -------------------------------------------------
  // 1) Client-side auth (localStorage("adminAuth") === "true")
  // -------------------------------------------------
  useEffect(() => {
    // Read simple auth flag from localStorage.
    const authFlag =
      typeof window !== "undefined"
        ? window.localStorage.getItem("adminAuth")
        : null;

    // If not present or not "true", redirect to login page.
    if (authFlag !== "true") {
      router.replace("/");
      return;
    }

    // Otherwise allow the dashboard to render and start data fetching.
    setIsAuthorized(true);
  }, [router]);

  // -------------------------------------------------
  // 2) Data fetching helpers (users + alerts)
  // -------------------------------------------------

  /**
   * fetchUsers
   * ----------
   * Fetch the list of non-admin users from /api/users.
   *
   * - showSpinner:
   *     - When true, we show the "Loading users..." message.
   *     - When false, we silently refresh the list in the background.
   */
  const fetchUsers = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setLoadingUsers(true);
      try {
        const res = await fetch("/api/users");
        if (!res.ok) throw new Error("Failed to load users");

        const data = (await res.json()) as User[];
        setUsers(data);

        // On first load: auto-select a user if none is selected yet
        if (data.length > 0 && selectedUserId === null) {
          setSelectedUserId(data[0].id);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load users");
      } finally {
        if (showSpinner) setLoadingUsers(false);
      }
    },
    [selectedUserId]
  );

  /**
   * fetchAlerts
   * -----------
   * Fetch the global alerts list from /api/alerts.
   *
   * Behavior:
   *   - Loads alerts from the backend.
   *   - Reads "alerts-cleared-until" timestamp from localStorage (if any).
   *   - Filters out any alerts that occurred BEFORE that timestamp.
   *   - Updates the `alerts` state with the filtered list.
   */
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      if (!res.ok) return;

      const data = (await res.json()) as Alert[];

      let filtered = data;

      if (typeof window !== "undefined") {
        const cutoffIso = window.localStorage.getItem(ALERTS_CLEAR_KEY);

        if (cutoffIso) {
          const cutoffDate = new Date(cutoffIso);

          if (!Number.isNaN(cutoffDate.getTime())) {
            filtered = data.filter((a) => {
              const t = new Date(a.occurred_at);
              if (Number.isNaN(t.getTime())) {
                // If parsing fails, keep the alert instead of hiding it.
                return true;
              }
              return t > cutoffDate;
            });
          }
        }
      }

      setAlerts(filtered);
    } catch (err) {
      console.error(err);
      // We intentionally do not show a visible error for alerts fetch;
      // the dashboard still works without the dropdown.
    }
  }, []);

  // -------------------------------------------------
  // 3) Initial fetch + polling (only when authorized)
  // -------------------------------------------------
  useEffect(() => {
    // Do nothing until we confirmed the admin is authorized.
    if (!isAuthorized) return;

    // Initial load of users + alerts.
    fetchUsers(true);
    fetchAlerts();

    // Poll every 5 seconds to keep dashboard updated.
    const interval = setInterval(() => {
      fetchUsers(false);
      fetchAlerts();
    }, 5000);

    return () => clearInterval(interval);
  }, [isAuthorized, fetchUsers, fetchAlerts]);

  /**
   * Whenever the search term changes, restart from page 1,
   * so the user sees the first page of filtered results.
   */
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // -------------------------------------------------
  // 4) Derived state (selected user, filtered users, pagination, etc.)
  // -------------------------------------------------

  /** Currently selected user object (or null if none). */
  const selectedUser = useMemo(
    () =>
      selectedUserId == null
        ? null
        : users.find((u) => u.id === selectedUserId) ?? null,
    [selectedUserId, users]
  );

  /** User being live-tracked (if any). */
  const trackedUser = useMemo(
    () =>
      trackedUserId == null
        ? null
        : users.find((u) => u.id === trackedUserId) ?? null,
    [trackedUserId, users]
  );

  /** User whose zone is being edited on the map (if any). */
  const mapUser = useMemo(
    () =>
      mapUserId == null ? null : users.find((u) => u.id === mapUserId) ?? null,
    [mapUserId, users]
  );

  /**
   * filteredUsers:
   *   - Applies a simple case-insensitive search by username.
   *   - If search is empty, returns the full list.
   */
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.username.toLowerCase().includes(q));
  }, [users, search]);

  /**
   * totalPages:
   *   - Number of pages based on filtered users count and page size.
   *   - Minimum is 1 even if there are no users (for UI simplicity).
   */
  const totalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / pageSize || 1)
  );

  /**
   * Ensure currentPage is always within [1, totalPages].
   * If filtering reduces total pages, we clamp down.
   */
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  /**
   * pagedUsers:
   *   - Slice of `filteredUsers` that belongs to the current page.
   */
  const pagedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage]);

  /**
   * Helper booleans for the selected user.
   */

  /** True when the selected user has a full zone assigned (center + radius). */
  const selectedUserHasZone =
    selectedUser &&
    selectedUser.zone_center_lat != null &&
    selectedUser.zone_center_lng != null &&
    selectedUser.zone_radius_m != null;

  /** True when the selected user has a last known location. */
  const selectedUserHasLocation =
    selectedUser &&
    selectedUser.last_latitude != null &&
    selectedUser.last_longitude != null;

  /**
   * selectedUserInside:
   *   - null      → zone status unknown (no inside_zone info yet).
   *   - true      → user is inside their zone.
   *   - false     → user is outside their zone.
   */
  const selectedUserInside =
    selectedUserHasLocation && selectedUser?.inside_zone != null
      ? selectedUser.inside_zone === 1
      : null;

  // -------------------------------------------------
  // 5) Actions (save zone, open logs, logout, clear alerts, etc.)
  // -------------------------------------------------

  /**
   * saveZone
   * --------
   * Called by UserMapModal when the admin saves a new/updated zone.
   *
   * - Sends a PUT request to /api/users/:id with:
   *     - zone_center_lat
   *     - zone_center_lng
   *     - zone_radius_m
   * - On success:
   *     - Close the map modal.
   *     - Refresh users list to reflect updated zone.
   */
  async function saveZone(
    userId: number,
    lat: number,
    lng: number,
    radius: number
  ) {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zone_center_lat: lat,
          zone_center_lng: lng,
          zone_radius_m: radius,
        }),
      });

      if (!res.ok) {
        let message = "Failed to save zone";

        // Try to read an error message from the response body.
        try {
          const data = (await res.json()) as { message?: string };
          console.error("Save zone failed:", data);
          if (data?.message) message = data.message;
        } catch (parseErr) {
          console.error("Save zone failed, non-JSON response", parseErr);
        }

        alert(message);
        return;
      }

      // Close modal and refresh user list silently.
      setMapUserId(null);
      fetchUsers(false);
    } catch (err) {
      console.error(err);
      alert("Failed to save zone");
    }
  }

  /**
   * handleDownloadAllLogsCsv
   * ------------------------
   * Triggers a CSV download containing ALL alerts in the system.
   *
   * Implementation:
   *   - Opens `/api/alerts?format=csv` in a new tab.
   *   - Browser handles download behavior.
   */
  function handleDownloadAllLogsCsv() {
    const url = "/api/alerts?format=csv";
    window.open(url, "_blank");
  }

  /**
   * handleOpenUserLogs
   * ------------------
   * Navigates to the logs page for a specific user:
   *   - `/dashboard/logs?userId=<id>`
   *
   * The Logs page will in turn allow returning to the dashboard with the
   * same `userId` pre-selected.
   */
  function handleOpenUserLogs(userId: number) {
    router.push(`/dashboard/logs?userId=${userId}`);
  }

  /**
   * logout
   * ------
   * Simple logout:
   *   - Remove the "adminAuth" flag from localStorage.
   *   - Navigate back to the login page (`/`).
   */
  function logout() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("adminAuth");
    }
    router.push("/");
  }

  /**
   * handleClearAlerts
   * -----------------
   * Persistently clears the visible alerts:
   *
   *   1. Stores the current time (ISO string) in localStorage("alerts-cleared-until").
   *   2. Immediately empties the `alerts` state so UI updates instantly.
   *
   * On the next `fetchAlerts` call, any older alerts are ignored.
   */
  function handleClearAlerts() {
    if (typeof window !== "undefined") {
      const nowIso = new Date().toISOString();
      window.localStorage.setItem(ALERTS_CLEAR_KEY, nowIso);
    }
    setAlerts([]);
  }

  // -------------------------------------------------
  // 6) Render
  // -------------------------------------------------
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar: title, global alerts, download logs, logout */}
      <header className="relative flex items-center justify-between px-8 py-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <h1 className="text-xl font-semibold tracking-tight">
          Admin Dashboard
        </h1>

        <div className="flex items-center gap-4">
          {/* Global alerts bell with dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                // Toggle dropdown visibility and refresh alerts immediately.
                setShowAlertsDropdown((prev) => !prev);
                fetchAlerts();
              }}
              className="relative rounded-full border border-slate-700 w-9 h-9 flex items-center justify-center hover:bg-slate-800"
              aria-label="Alerts"
            >
              <BellIcon size={18} />
              {alerts.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-[10px] font-semibold rounded-full px-1.5 py-0.5 text-white">
                  {alerts.length}
                </span>
              )}
            </button>

            {/* Alerts dropdown panel */}
            {showAlertsDropdown && (
              <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-50">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
                  <span className="text-sm font-medium">Recent Alerts</span>
                  <div className="flex gap-2">
                    <button
                      onClick={handleClearAlerts}
                      className="text-[11px] px-2 py-1 rounded border border-slate-600 hover:bg-slate-800"
                    >
                      Clear
                    </button>
                    <button
                      onClick={fetchAlerts}
                      className="text-[11px] px-2 py-1 rounded border border-slate-600 hover:bg-slate-800"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {alerts.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-slate-400">No alerts.</p>
                ) : (
                  <ul className="divide-y divide-slate-800 text-xs">
                    {alerts.slice(0, 30).map((a) => (
                      <li key={a.id} className="px-3 py-2">
                        <div className="flex justify-between">
                          <span className="font-medium">{a.username}</span>
                          <span
                            className={
                              a.alert_type === "exit"
                                ? "text-red-400"
                                : "text-emerald-400"
                            }
                          >
                            {a.alert_type.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(a.occurred_at).toLocaleString()}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Download ALL logs across users as CSV */}
          <button
            type="button"
            onClick={handleDownloadAllLogsCsv}
            className="rounded-xl border border-slate-700 px-4 py-1.5 text-sm hover:bg-slate-800"
          >
            Download All Logs
          </button>

          {/* Logout button */}
          <button
            onClick={logout}
            className="rounded-xl border border-slate-700 px-4 py-1.5 text-sm hover:bg-slate-800"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main two-column layout */}
      <main className="p-6 lg:p-8">
        {/* Top-level error banner (for users loading) */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)] gap-6">
          {/* LEFT COLUMN: Users list with search + pagination */}
          <section className="bg-slate-900/80 rounded-3xl border border-slate-800 px-6 py-5 flex flex-col min-h-[480px]">
            <h2 className="text-lg font-semibold mb-4">Users</h2>

            {/* Search input */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search"
                className="w-full rounded-2xl bg-slate-950/60 border border-slate-700 px-4 py-2 text-sm outline-none focus:border-blue-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Loading / empty / list states */}
            {loadingUsers ? (
              <p className="text-sm text-slate-400">Loading users...</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-sm text-slate-400">
                No users found. Create some users in the system first.
              </p>
            ) : (
              <div className="mt-2 flex flex-col flex-1">
                {/* Users list */}
                <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                  {pagedUsers.map((u) => {
                    const hasZone =
                      u.zone_center_lat != null &&
                      u.zone_center_lng != null &&
                      u.zone_radius_m != null;

                    const isSelected = selectedUserId === u.id;

                    return (
                      <div
                        key={u.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedUserId(u.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedUserId(u.id);
                          }
                        }}
                        className={`w-full text-left rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                          isSelected
                            ? "border-blue-500 bg-slate-800/80"
                            : "border-slate-700 bg-slate-900/60 hover:bg-slate-800/60"
                        }`}
                      >
                        {/* Left: avatar + basic info */}
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800">
                            <UserAvatarIcon size={20} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {u.username}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Assigned Zone:{" "}
                              {hasZone
                                ? `${Number(u.zone_radius_m)} m`
                                : "Not assigned"}
                            </span>
                          </div>
                        </div>

                        {/* Right: small status pill */}
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs rounded-full border border-slate-600 px-3 py-1">
                            View Status
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination controls */}
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className={`px-3 py-1 rounded-lg border ${
                        currentPage === 1
                          ? "border-slate-700 text-slate-600 cursor-not-allowed"
                          : "border-slate-600 hover:bg-slate-800"
                      }`}
                    >
                      Previous
                    </button>
                    <button
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage === totalPages}
                      className={`px-3 py-1 rounded-lg border ${
                        currentPage === totalPages
                          ? "border-slate-700 text-slate-600 cursor-not-allowed"
                          : "border-slate-600 hover:bg-slate-800"
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* RIGHT COLUMN: Selected user detailed status + actions */}
          <section className="bg-slate-900/80 rounded-3xl border border-slate-800 px-6 py-5 flex flex-col min-h-[480px]">
            <h2 className="text-lg font-semibold mb-4">User Status</h2>

            {selectedUser ? (
              <>
                {/* Avatar + username / ID */}
                <div className="flex flex-col items-center mb-5">
                  <div className="h-24 w-24 rounded-full bg-slate-800 flex items-center justify-center mb-3">
                    <UserAvatarIcon size={44} />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold">
                      {selectedUser.username}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      User ID: #{selectedUser.id}
                    </p>
                  </div>
                </div>

                {/* Detail fields (name, contact, zone, last status) */}
                <div className="space-y-2 mb-6 text-sm">
                  <div>
                    <span className="font-semibold">Name</span>
                    <p className="text-slate-300 text-sm">
                      {selectedUser.username}
                    </p>
                  </div>

                  <div>
                    <span className="font-semibold">Contact Number</span>
                    <p className="text-slate-400 text-sm">Not set in system</p>
                  </div>

                  <div>
                    <span className="font-semibold">Assigned Zone</span>
                    <p className="text-slate-300 text-sm">
                      {selectedUserHasZone
                        ? `Center: (${Number(
                            selectedUser.zone_center_lat
                          ).toFixed(4)}, ${Number(
                            selectedUser.zone_center_lng
                          ).toFixed(4)}) • Radius: ${Number(
                            selectedUser.zone_radius_m
                          )} m`
                        : "No zone assigned"}
                    </p>
                  </div>

                  <div>
                    <span className="font-semibold">Last Status</span>
                    <p className="text-slate-300 text-sm">
                      {selectedUserHasLocation ? (
                        <>
                          {selectedUserInside == null ? (
                            "Location reported, zone status unknown"
                          ) : selectedUserInside ? (
                            <span className="text-emerald-400">
                              Inside zone
                            </span>
                          ) : (
                            <span className="text-red-400">Outside zone</span>
                          )}{" "}
                          •{" "}
                          {selectedUser.last_seen
                            ? new Date(
                                selectedUser.last_seen
                              ).toLocaleTimeString()
                            : "-"}
                        </>
                      ) : (
                        "No location data yet"
                      )}
                    </p>
                  </div>
                </div>

                {/* Action buttons: Assign Zone / Track / Logs */}
                <div className="space-y-3 mb-2">
                  <button
                    type="button"
                    onClick={() =>
                      selectedUser && setMapUserId(selectedUser.id)
                    }
                    className="w-full rounded-full bg-emerald-600 hover:bg-emerald-500 py-2.5 text-sm font-semibold"
                  >
                    Assign Zone
                  </button>

                  <button
                    type="button"
                    disabled={!selectedUserHasLocation}
                    onClick={() =>
                      selectedUser && setTrackedUserId(selectedUser.id)
                    }
                    className={`w-full rounded-full py-2.5 text-sm font-semibold ${
                      selectedUserHasLocation
                        ? "bg-red-600 hover:bg-red-500"
                        : "bg-red-900 text-slate-500 cursor-not-allowed"
                    }`}
                  >
                    Track
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenUserLogs(selectedUser.id)}
                    className="w-full rounded-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 py-2.5 text-sm font-semibold"
                  >
                    Logs
                  </button>
                </div>
              </>
            ) : (
              // When no user is selected yet
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                Select a user on the left to view status.
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Map modal: create/update a zone for a user */}
      {mapUser && (
        <UserMapModal
          user={mapUser}
          onClose={() => setMapUserId(null)}
          onSave={saveZone}
        />
      )}

      {/* Track modal: live tracking for a user */}
      {trackedUser && (
        <UserTrackModal
          user={trackedUser}
          onClose={() => setTrackedUserId(null)}
        />
      )}
    </div>
  );
}
