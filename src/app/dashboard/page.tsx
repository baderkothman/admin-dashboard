"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  FaBell,
  FaEye,
  FaDownload,
  FaCircle,
  FaSort,
  FaSortUp,
  FaSortDown,
} from "react-icons/fa";
import ThemeToggle from "@/components/ThemeToggle";

// Leaflet-based modals (client-only)
const UserMapModal = dynamic(() => import("@/components/UserMapModal"), {
  ssr: false,
});
const UserTrackModal = dynamic(() => import("@/components/UserTrackModal"), {
  ssr: false,
});

/* ─────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────── */

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
  created_at?: string | null;
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

type SortKey = "full_name" | "username" | "contact" | "zone" | "status";
type SortDirection = "asc" | "desc";

/* ─────────────────────────────────────────────
 * Persist table state (sort + page)
 * ───────────────────────────────────────────── */

const DASH_TABLE_STATE_KEY = "geofence:dashboardTableState:v1";

type DashboardTableState = {
  sortKey: SortKey;
  sortDirection: SortDirection;
  currentPage: number;
};

const VALID_SORT_KEYS: SortKey[] = [
  "full_name",
  "username",
  "contact",
  "zone",
  "status",
];

function readDashboardTableState(): DashboardTableState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(DASH_TABLE_STATE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<DashboardTableState>;

    const sortKey: SortKey = VALID_SORT_KEYS.includes(parsed.sortKey as SortKey)
      ? (parsed.sortKey as SortKey)
      : "full_name";

    const sortDirection: SortDirection =
      parsed.sortDirection === "asc" || parsed.sortDirection === "desc"
        ? parsed.sortDirection
        : "asc";

    const currentPage =
      typeof parsed.currentPage === "number" && parsed.currentPage >= 1
        ? Math.floor(parsed.currentPage)
        : 1;

    return { sortKey, sortDirection, currentPage };
  } catch {
    return null;
  }
}

function writeDashboardTableState(state: DashboardTableState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DASH_TABLE_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function clearDashboardTableState() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DASH_TABLE_STATE_KEY);
  } catch {
    // ignore
  }
}

/* ─────────────────────────────────────────────
 * Pure helpers
 * ───────────────────────────────────────────── */

function hasZone(u: User): boolean {
  return (
    u.zone_center_lat !== null &&
    u.zone_center_lng !== null &&
    u.zone_radius_m !== null
  );
}

function isInsideZone(u: User): boolean {
  return u.inside_zone === true || u.inside_zone === 1 || u.inside_zone === "1";
}

function formatContact(u: User): string {
  if (u.phone) return u.phone;
  if (u.email) return u.email;
  return "—";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString();
}

/* ─────────────────────────────────────────────
 * Sortable header component
 * ───────────────────────────────────────────── */

interface SortableHeaderProps {
  label: string;
  column: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  align?: "left" | "center";
}

function SortableHeader({
  label,
  column,
  activeKey,
  direction,
  onSort,
  align = "left",
}: SortableHeaderProps) {
  const isActive = activeKey === column;

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`group inline-flex items-center gap-1 text-[11px] sm:text-xs font-medium uppercase tracking-wide ${
        align === "center" ? "justify-center w-full" : ""
      }`}
    >
      <span>{label}</span>
      <span className="text-[10px] text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]">
        {isActive ? (
          direction === "asc" ? (
            <FaSortUp />
          ) : (
            <FaSortDown />
          )
        ) : (
          <FaSort className="opacity-60" />
        )}
      </span>
    </button>
  );
}

/* ─────────────────────────────────────────────
 * Main dashboard component
 * ───────────────────────────────────────────── */

const PAGE_SIZE = 15;

const DashboardPage: React.FC = () => {
  const router = useRouter();

  // Data
  const [users, setUsers] = useState<User[] | null>(null); // null = loading
  const [usersError, setUsersError] = useState<string | null>(null);

  const [selectedUserForZone, setSelectedUserForZone] = useState<User | null>(
    null
  );
  const [selectedUserForTrack, setSelectedUserForTrack] = useState<User | null>(
    null
  );

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);

  // Ref for bell + popup (for click-outside)
  const alertsRef = useRef<HTMLDivElement | null>(null);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("full_name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // IMPORTANT: skip the very first persist effect to avoid overwriting saved state with defaults
  const skipFirstPersistRef = useRef(true);

  /* ─────────────────────────────────────────────
   * Restore table state on mount
   * ───────────────────────────────────────────── */
  useEffect(() => {
    const saved = readDashboardTableState();
    if (!saved) return;

    // Only set if different (avoids extra renders)
    setSortKey((prev) => (prev === saved.sortKey ? prev : saved.sortKey));
    setSortDirection((prev) =>
      prev === saved.sortDirection ? prev : saved.sortDirection
    );
    setCurrentPage((prev) =>
      prev === saved.currentPage ? prev : saved.currentPage
    );
  }, []);

  /* ─────────────────────────────────────────────
   * Persist table state whenever it changes
   * ───────────────────────────────────────────── */
  useEffect(() => {
    if (skipFirstPersistRef.current) {
      skipFirstPersistRef.current = false;
      return;
    }
    writeDashboardTableState({ sortKey, sortDirection, currentPage });
  }, [sortKey, sortDirection, currentPage]);

  /* ─────────────────────────────────────────────
   * Auth guard
   * ───────────────────────────────────────────── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isAuthed = localStorage.getItem("adminAuth") === "true";
    if (!isAuthed) router.replace("/");
  }, [router]);

  /* ─────────────────────────────────────────────
   * Load users (polling)
   * ───────────────────────────────────────────── */
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/users", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load users");

        const data: User[] = await res.json();
        const nonAdmins = data.filter((u) => u.role !== "admin");

        setUsers((prev) => {
          if (prev === null) return nonAdmins;
          const prevStr = JSON.stringify(prev);
          const nextStr = JSON.stringify(nonAdmins);
          if (prevStr === nextStr) return prev;
          return nonAdmins;
        });

        setUsersError(null);
      } catch (err: unknown) {
        if (err instanceof Error) setUsersError(err.message);
        else setUsersError("Failed to load users");
      }
    };

    void fetchUsers();
    const interval = setInterval(() => void fetchUsers(), 3000);
    return () => clearInterval(interval);
  }, []);

  // Keep tracking modal user in sync with updated list
  useEffect(() => {
    if (!selectedUserForTrack || users === null) return;
    const updated = users.find((u) => u.id === selectedUserForTrack.id);
    if (!updated || updated === selectedUserForTrack) return;
    setSelectedUserForTrack(updated);
  }, [users, selectedUserForTrack]);

  /* ─────────────────────────────────────────────
   * Load alerts
   * ───────────────────────────────────────────── */
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

  /* ─────────────────────────────────────────────
   * Close alerts on click outside + Escape
   * ───────────────────────────────────────────── */
  useEffect(() => {
    if (!alertsOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (!alertsRef.current) return;
      const target = event.target as Node | null;
      if (target && !alertsRef.current.contains(target)) {
        setAlertsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAlertsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [alertsOpen]);

  /* ─────────────────────────────────────────────
   * Sorting + pagination derived data
   * ───────────────────────────────────────────── */

  const sortedUsers = useMemo(() => {
    if (!users) return null;

    const list = [...users];

    list.sort((a, b) => {
      let result = 0;

      switch (sortKey) {
        case "full_name": {
          const nameA = (a.full_name || a.username || "").toLowerCase();
          const nameB = (b.full_name || b.username || "").toLowerCase();
          result = nameA.localeCompare(nameB);
          break;
        }

        case "username": {
          const ua = (a.username || "").toLowerCase();
          const ub = (b.username || "").toLowerCase();
          result = ua.localeCompare(ub);
          break;
        }

        case "contact": {
          const contactA = formatContact(a).toLowerCase();
          const contactB = formatContact(b).toLowerCase();
          result = contactA.localeCompare(contactB);
          break;
        }

        case "zone": {
          const za = hasZone(a) ? 1 : 0;
          const zb = hasZone(b) ? 1 : 0;
          result = za - zb;
          break;
        }

        case "status": {
          const sa = isInsideZone(a) ? 1 : 0;
          const sb = isInsideZone(b) ? 1 : 0;
          result = sa - sb;
          break;
        }

        default:
          result = 0;
      }

      if (result === 0) {
        const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
        result = createdA - createdB;
      }

      return sortDirection === "asc" ? result : -result;
    });

    return list;
  }, [users, sortKey, sortDirection]);

  // Keep current page in range when list changes
  useEffect(() => {
    if (!sortedUsers) return;
    const total = sortedUsers.length;
    const maxPage = total === 0 ? 1 : Math.ceil(total / PAGE_SIZE);
    setCurrentPage((prev) => Math.min(prev, maxPage));
  }, [sortedUsers]);

  const totalUsers = sortedUsers?.length ?? 0;
  const totalPages = totalUsers === 0 ? 1 : Math.ceil(totalUsers / PAGE_SIZE);

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalUsers);

  const pageUsers =
    sortedUsers && totalUsers > 0
      ? sortedUsers.slice(startIndex, endIndex)
      : [];

  /* ─────────────────────────────────────────────
   * Handlers
   * ───────────────────────────────────────────── */

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

    // Optional: clear saved table state on logout
    clearDashboardTableState();

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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  /* ─────────────────────────────────────────────
   * UI
   * ───────────────────────────────────────────── */

  return (
    <main className="min-h-screen bg-[var(--surface-root)] text-[hsl(var(--foreground))] flex flex-col">
      {/* Top bar */}
      <header
        className="
          dashboard-topbar
          sticky top-0 z-30
          px-4 sm:px-6 lg:px-8
          py-3 sm:py-4
          border-b
          flex flex-col gap-3
          sm:flex-row sm:items-center sm:justify-between
        "
      >
        <div>
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">
            Admin Dashboard
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[hsl(var(--muted-foreground))]">
            Manage users, geofence zones and live location tracking.
          </p>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <ThemeToggle />

          {/* Alerts bell + popup */}
          <div className="relative" ref={alertsRef}>
            <button
              type="button"
              onClick={() => setAlertsOpen((prev) => !prev)}
              className="btn-base btn-ghost !h-10 !w-10 !p-0 rounded-full relative"
              aria-expanded={alertsOpen}
              aria-label="Toggle alerts"
            >
              <FaBell className="text-sm" aria-hidden="true" />
              {alerts.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[hsl(var(--success))]">
                  <span className="sr-only">Unread alerts</span>
                </span>
              )}
            </button>

            {alertsOpen && (
              <div className="absolute right-0 mt-3 w-80 card !rounded-2xl shadow-[var(--shadow-elevated)] z-20">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))]">
                  <span className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    Recent Alerts
                  </span>
                  <div className="flex gap-3">
                    <button
                      onClick={handleClearAlerts}
                      className="text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    >
                      Clear
                    </button>
                    <button
                      onClick={handleDownloadAllLogs}
                      className="text-[11px] text-[hsl(var(--primary))] hover:text-[hsl(var(--primary)/0.9)]"
                    >
                      Download all
                    </button>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto py-1">
                  {alerts.length === 0 && (
                    <div className="px-4 py-6 text-xs text-[hsl(var(--muted-foreground))] text-center">
                      No alerts after the last clear.
                    </div>
                  )}

                  {alerts.map((alert) => {
                    const isEnter = alert.alert_type === "enter";
                    return (
                      <div
                        key={alert.id}
                        className="flex items-start gap-2 px-4 py-2.5 hover:bg-[hsl(var(--muted))] transition-colors"
                      >
                        <FaCircle
                          className={`mt-1 text-[8px] ${
                            isEnter
                              ? "text-[hsl(var(--success))]"
                              : "text-[hsl(var(--danger))]"
                          }`}
                        />

                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium">
                              {isEnter ? "Entered zone" : "Left zone"}
                            </p>
                            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                              {new Date(alert.occurred_at).toLocaleTimeString()}
                            </span>
                          </div>

                          <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">
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

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="btn-base btn-ghost rounded-full text-xs sm:text-sm"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main content */}
      <section className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="card">
          {/* Card header */}
          <div className="px-4 sm:px-6 py-3 border-b border-[hsl(var(--border))] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Users Overview</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Full list of mobile users, their assigned zones and current
                status.
              </p>
            </div>
          </div>

          {/* Table wrapper */}
          <div className="scroll-x hide-scrollbar">
            <div className="overflow-x-auto max-h-[calc(100vh-260px)]">
              <table className="dashboard-table min-w-full table-fixed text-sm">
                <thead className="dashboard-thead sticky top-0 z-10 border-b border-[hsl(var(--border))]">
                  <tr>
                    <th className="px-4 sm:px-6 py-2.5 text-left font-medium w-[220px]">
                      <SortableHeader
                        label="Full Name"
                        column="full_name"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onSort={handleSort}
                      />
                    </th>

                    <th className="px-4 sm:px-6 py-2.5 text-left font-medium w-[160px]">
                      <SortableHeader
                        label="Username"
                        column="username"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onSort={handleSort}
                      />
                    </th>

                    <th className="px-4 sm:px-6 py-2.5 text-left font-medium w-[200px]">
                      <SortableHeader
                        label="Contact"
                        column="contact"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onSort={handleSort}
                      />
                    </th>

                    <th className="px-4 sm:px-6 py-2.5 text-left font-medium w-[170px]">
                      <SortableHeader
                        label="Assigned Zone"
                        column="zone"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onSort={handleSort}
                      />
                    </th>

                    <th className="px-4 sm:px-6 py-2.5 text-left font-medium w-[150px]">
                      <SortableHeader
                        label="Status"
                        column="status"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onSort={handleSort}
                      />
                    </th>

                    <th className="px-4 sm:px-6 py-2.5 text-center font-medium w-[110px]">
                      Track
                    </th>

                    <th className="px-4 sm:px-6 py-2.5 text-center font-medium w-[110px]">
                      Logs
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {/* Loading */}
                  {users === null && !usersError && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 sm:px-6 py-8 text-center text-[hsl(var(--muted-foreground))] text-sm"
                      >
                        Loading users…
                      </td>
                    </tr>
                  )}

                  {/* Error */}
                  {usersError && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 sm:px-6 py-8 text-center text-[hsl(var(--danger))] text-sm"
                      >
                        {usersError}
                      </td>
                    </tr>
                  )}

                  {/* No users */}
                  {users !== null && !usersError && users.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 sm:px-6 py-8 text-center text-[hsl(var(--muted-foreground))] text-sm"
                      >
                        No users yet. Once mobile users sign in, they will
                        appear here.
                      </td>
                    </tr>
                  )}

                  {/* Data rows */}
                  {users !== null &&
                    !usersError &&
                    users.length > 0 &&
                    pageUsers.map((user) => {
                      const inside = isInsideZone(user);
                      const zoneAssigned = hasZone(user);

                      return (
                        <tr key={user.id} className="transition-colors">
                          {/* Full Name */}
                          <td className="px-4 sm:px-6 py-2.5 whitespace-nowrap align-top w-[220px]">
                            <div className="text-sm truncate">
                              {user.full_name || "—"}
                            </div>
                            <div className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))] truncate">
                              Last seen: {formatDateTime(user.last_seen)}
                            </div>
                          </td>

                          {/* Username */}
                          <td className="px-4 sm:px-6 py-2.5 whitespace-nowrap w-[160px] truncate">
                            {user.username}
                          </td>

                          {/* Contact */}
                          <td className="px-4 sm:px-6 py-2.5 whitespace-nowrap w-[200px] truncate text-[hsl(var(--muted-foreground))]">
                            {formatContact(user)}
                          </td>

                          {/* Assigned Zone */}
                          <td className="px-4 sm:px-6 py-2.5 w-[170px]">
                            <button
                              type="button"
                              onClick={() => setSelectedUserForZone(user)}
                              className="btn-base bg-emerald-500 hover:bg-emerald-400 text-[11px] sm:text-xs font-semibold text-white w-full"
                            >
                              View / Update
                            </button>
                            {!zoneAssigned && (
                              <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                                No zone assigned yet
                              </div>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 sm:px-6 py-2.5 w-[150px]">
                            {zoneAssigned ? (
                              <div className="text-xs font-semibold">
                                <span
                                  className={
                                    inside
                                      ? "text-[hsl(var(--success))]"
                                      : "text-[hsl(var(--muted-foreground))]"
                                  }
                                >
                                  Inside
                                </span>
                                <span className="mx-0.5 text-[hsl(var(--muted-foreground))]">
                                  /
                                </span>
                                <span
                                  className={
                                    !inside
                                      ? "text-[hsl(var(--danger))]"
                                      : "text-[hsl(var(--muted-foreground))]"
                                  }
                                >
                                  Outside
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-[hsl(var(--muted-foreground))] italic">
                                No zone
                              </span>
                            )}
                          </td>

                          {/* Track */}
                          <td className="px-4 sm:px-6 py-2.5 text-center w-[110px]">
                            <button
                              type="button"
                              onClick={() => setSelectedUserForTrack(user)}
                              className="btn-base bg-rose-500 hover:bg-rose-400 text-[11px] sm:text-xs font-semibold text-white w-full"
                            >
                              Track
                            </button>
                          </td>

                          {/* Logs */}
                          <td className="px-4 sm:px-6 py-2.5 text-center w-[110px]">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleViewLogs(user.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 hover:bg-amber-400 text-base font-semibold transition-colors"
                                title="View logs"
                              >
                                <FaEye />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDownloadUserLogs(user.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 hover:bg-amber-400 text-base font-semibold transition-colors"
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

          {/* Pagination footer */}
          {sortedUsers && sortedUsers.length > 0 && (
            <div className="px-4 sm:px-6 py-3 border-t border-[hsl(var(--border))] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[hsl(var(--muted-foreground))]">
              <span>
                Showing{" "}
                <span className="font-semibold text-[hsl(var(--foreground))]">
                  {totalUsers === 0 ? 0 : startIndex + 1}–{endIndex}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-[hsl(var(--foreground))]">
                  {totalUsers}
                </span>{" "}
                users
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="btn-base btn-ghost text-[11px] px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>

                <span>
                  Page{" "}
                  <span className="font-semibold text-[hsl(var(--foreground))]">
                    {currentPage}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-[hsl(var(--foreground))]">
                    {totalPages}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="btn-base btn-ghost text-[11px] px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
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
