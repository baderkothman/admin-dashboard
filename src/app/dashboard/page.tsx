"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { FaBell, FaEye, FaDownload, FaCircle } from "react-icons/fa";
import ThemeToggle from "@/components/ThemeToggle";

// Load the Leaflet-based modals only on the client
const UserMapModal = dynamic(() => import("@/components/UserMapModal"), {
  ssr: false,
});

const UserTrackModal = dynamic(() => import("@/components/UserTrackModal"), {
  ssr: false,
});

type User = {
  id: number;
  full_name?: string | null;
  username: string;
  phone?: string | null;
  email?: string | null;
  role: string;
  zone_center_lat: number | null;
  zone_center_lng: number | null;
  zone_radius_m: number | null;
  inside_zone: boolean | 0 | 1 | "0" | "1" | null;
  last_seen: string | null;
  last_latitude: number | null;
  last_longitude: number | null;
};

type Alert = {
  id: number;
  user_id: number;
  username?: string;
  alert_type: "enter" | "exit" | string;
  occurred_at: string;
  latitude?: number | null;
  longitude?: number | null;
};

const DashboardPage: React.FC = () => {
  const router = useRouter();

  // null = not yet loaded; [] = loaded but no users
  const [users, setUsers] = useState<User[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [selectedUserForZone, setSelectedUserForZone] = useState<User | null>(
    null
  );
  const [selectedUserForTrack, setSelectedUserForTrack] = useState<User | null>(
    null
  );

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);

  // ─────────────────────────────────────────────
  // Auth guard
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isAuthed = localStorage.getItem("adminAuth") === "true";
    if (!isAuthed) {
      router.replace("/");
    }
  }, [router]);

  // ─────────────────────────────────────────────
  // Load users (near real-time refresh)
  // ─────────────────────────────────────────────
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/users", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Failed to load users");
        }

        const data: User[] = await res.json();
        const nonAdmins = data.filter((u) => u.role !== "admin");

        setUsers((prev) => {
          if (prev === null) return nonAdmins;

          const prevStr = JSON.stringify(prev);
          const nextStr = JSON.stringify(nonAdmins);
          if (prevStr === nextStr) {
            return prev;
          }
          return nonAdmins;
        });

        setUsersError(null);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setUsersError(err.message);
        } else {
          setUsersError("Failed to load users");
        }
      }
    };

    void fetchUsers();

    const interval = setInterval(() => {
      void fetchUsers();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Keep tracking modal synced with latest users list
  useEffect(() => {
    if (!selectedUserForTrack || users === null) return;

    const updated = users.find((u) => u.id === selectedUserForTrack.id);
    if (!updated || updated === selectedUserForTrack) return;

    setSelectedUserForTrack(updated);
  }, [users, selectedUserForTrack]);

  // ─────────────────────────────────────────────
  // Load alerts (near real-time)
  // ─────────────────────────────────────────────
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await fetch("/api/alerts", { cache: "no-store" });
        if (!res.ok) return;

        const data = (await res.json()) as Alert[];

        if (typeof window !== "undefined") {
          const clearedUntilStr = localStorage.getItem("alerts-cleared-until");
          let filtered = data;

          if (clearedUntilStr) {
            const clearedUntil = new Date(clearedUntilStr);
            filtered = data.filter(
              (a) => new Date(a.occurred_at) > clearedUntil
            );
          }

          const sorted = filtered.sort(
            (a, b) =>
              new Date(b.occurred_at).getTime() -
              new Date(a.occurred_at).getTime()
          );
          setAlerts(sorted.slice(0, 15));
        } else {
          setAlerts(data);
        }
      } catch {
        // non-critical
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 3000);
    return () => clearInterval(interval);
  }, []);

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      // ignore
    }

    if (typeof window !== "undefined") {
      localStorage.removeItem("adminAuth");
      localStorage.removeItem("adminUsername");
    }

    router.replace("/");
  };

  const handleViewLogs = (userId: number) => {
    router.push(`/dashboard/logs?userId=${userId}`);
  };

  const handleDownloadUserLogs = (userId: number) => {
    if (typeof window !== "undefined") {
      window.location.href = `/api/alerts?userId=${userId}&format=csv`;
    }
  };

  const handleDownloadAllLogs = () => {
    if (typeof window !== "undefined") {
      window.location.href = `/api/alerts?format=csv`;
    }
  };

  const handleClearAlerts = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("alerts-cleared-until", new Date().toISOString());
    }
    setAlerts([]);
  };

  const hasZone = (u: User) =>
    u.zone_center_lat !== null &&
    u.zone_center_lng !== null &&
    u.zone_radius_m !== null;

  const isInsideZone = (u: User): boolean => {
    return (
      u.inside_zone === true || u.inside_zone === 1 || u.inside_zone === "1"
    );
  };

  const formatContact = (u: User) => {
    if (u.phone) return u.phone;
    if (u.email) return u.email;
    return "—";
  };

  const formatDateTime = (iso: string | null) => {
    if (!iso) return "Never";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Never";
    return d.toLocaleString();
  };

  // ─────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <header className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-slate-800 bg-slate-950/80 backdrop-blur flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">
            Admin Dashboard
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Manage users, geofence zones and live location tracking.
          </p>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          {/* Theme toggle */}
          <ThemeToggle />

          {/* Alerts bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setAlertsOpen((prev) => !prev)}
              className="btn-base btn-ghost !h-10 !w-10 !p-0 rounded-full border border-slate-700 bg-slate-900 hover:bg-slate-800"
            >
              <FaBell className="text-sm" aria-hidden="true" />
              {alerts.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500">
                  <span className="sr-only">Unread alerts</span>
                </span>
              )}
            </button>

            {alertsOpen && (
              <div className="absolute right-0 mt-3 w-80 rounded-2xl border border-slate-800 bg-slate-950 shadow-[var(--shadow-strong)] z-20">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Recent Alerts
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={handleClearAlerts}
                      className="text-[11px] text-slate-400 hover:text-slate-200"
                    >
                      Clear
                    </button>
                    <button
                      onClick={handleDownloadAllLogs}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300"
                    >
                      Download all
                    </button>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto py-1">
                  {alerts.length === 0 && (
                    <div className="px-4 py-6 text-xs text-slate-500 text-center">
                      No alerts after the last clear.
                    </div>
                  )}

                  {alerts.map((alert) => {
                    const isEnter = alert.alert_type === "enter";
                    return (
                      <div
                        key={alert.id}
                        className="flex items-start gap-2 px-4 py-2.5 hover:bg-slate-900/70 transition-colors"
                      >
                        <FaCircle
                          className={`mt-1 text-[8px] ${
                            isEnter ? "text-emerald-400" : "text-rose-400"
                          }`}
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-slate-100">
                              {isEnter ? "Entered zone" : "Left zone"}
                            </p>
                            <span className="text-[10px] text-slate-500">
                              {new Date(alert.occurred_at).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {alert.username ?? `User #${alert.user_id}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            className="btn-base btn-ghost rounded-full border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs sm:text-sm"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main content */}
      <section className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="card">
          {/* Card header */}
          <div className="px-4 sm:px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Users Overview</p>
              <p className="text-xs text-slate-500 mt-1">
                Full list of mobile users, their assigned zones and current
                status.
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="scroll-x hide-scrollbar">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-[11px] sm:text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 sm:px-6 py-3 text-left font-medium">
                      Full Name
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left font-medium">
                      Username
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left font-medium">
                      Contact
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left font-medium">
                      Assigned Zone
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-left font-medium">
                      Status
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-center font-medium">
                      Track
                    </th>
                    <th className="px-4 sm:px-6 py-3 text-center font-medium">
                      Logs
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800">
                  {/* Initial loading state only (users === null) */}
                  {users === null && !usersError && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 sm:px-6 py-10 text-center text-slate-500 text-sm"
                      >
                        Loading users…
                      </td>
                    </tr>
                  )}

                  {/* Error state */}
                  {usersError && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 sm:px-6 py-10 text-center text-rose-400 text-sm"
                      >
                        {usersError}
                      </td>
                    </tr>
                  )}

                  {/* Loaded, but no users */}
                  {users !== null && !usersError && users.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 sm:px-6 py-10 text-center text-slate-500 text-sm"
                      >
                        No users yet. Once mobile users sign in, they will
                        appear here.
                      </td>
                    </tr>
                  )}

                  {/* Normal data rows */}
                  {users !== null &&
                    !usersError &&
                    users.length > 0 &&
                    users.map((user) => {
                      const inside = isInsideZone(user);
                      const zoneAssigned = hasZone(user);

                      return (
                        <tr
                          key={user.id}
                          className="hover:bg-slate-900/70 transition-colors"
                        >
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-slate-100 align-top">
                            <div className="text-sm">
                              {user.full_name || "—"}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              Last seen: {formatDateTime(user.last_seen)}
                            </div>
                          </td>

                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-slate-100">
                            {user.username}
                          </td>

                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-slate-200">
                            {formatContact(user)}
                          </td>

                          {/* Assigned Zone */}
                          <td className="px-4 sm:px-6 py-4">
                            <button
                              type="button"
                              onClick={() => setSelectedUserForZone(user)}
                              className="btn-base bg-emerald-600 hover:bg-emerald-500 text-[11px] sm:text-xs font-semibold"
                            >
                              View / Update
                            </button>
                            {!zoneAssigned && (
                              <div className="mt-1 text-[11px] text-slate-500">
                                No zone assigned yet
                              </div>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 sm:px-6 py-4">
                            {zoneAssigned ? (
                              <div className="text-xs font-semibold">
                                <span
                                  className={
                                    inside
                                      ? "text-emerald-400"
                                      : "text-slate-500"
                                  }
                                >
                                  Inside
                                </span>
                                <span className="mx-0.5 text-slate-600">/</span>
                                <span
                                  className={
                                    !inside ? "text-rose-400" : "text-slate-500"
                                  }
                                >
                                  Outside
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500 italic">
                                No zone
                              </span>
                            )}
                          </td>

                          {/* Track button */}
                          <td className="px-4 sm:px-6 py-4 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedUserForTrack(user)}
                              className="btn-base bg-red-700 hover:bg-red-600 text-[11px] sm:text-xs font-semibold"
                            >
                              Track
                            </button>
                          </td>

                          {/* Logs buttons */}
                          <td className="px-4 sm:px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleViewLogs(user.id)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#a28f00] text-slate-900 text-base font-semibold hover:bg-[#c3aa03] transition-colors"
                                title="View logs"
                              >
                                <FaEye />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDownloadUserLogs(user.id)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#a28f00] text-slate-900 text-base font-semibold hover:bg-[#c3aa03] transition-colors"
                                title="Download CSV"
                              >
                                <FaDownload />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Zone modal */}
      {selectedUserForZone && (
        <UserMapModal
          user={selectedUserForZone}
          onClose={() => setSelectedUserForZone(null)}
          onSave={(updated) => {
            const updatedUser = updated as unknown as User;

            if (updatedUser && typeof updatedUser.id === "number") {
              setUsers((prev) =>
                prev
                  ? prev.map((u) => (u.id === updatedUser.id ? updatedUser : u))
                  : prev
              );
            }

            setSelectedUserForZone(null);
          }}
        />
      )}

      {/* Track modal */}
      {selectedUserForTrack && (
        <UserTrackModal
          user={selectedUserForTrack}
          onClose={() => setSelectedUserForTrack(null)}
        />
      )}
    </main>
  );
};

export default DashboardPage;
