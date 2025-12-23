/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { DataTable, type DataTablePageEvent } from "primereact/datatable";
import { Column } from "primereact/column";
import { Paginator } from "primereact/paginator";

import { FaBell, FaCircle, FaDownload, FaEye } from "react-icons/fa";

const ThemeToggle = dynamic(() => import("@/components/ThemeToggle"), {
  ssr: false,
});

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
  created_at?: string | null;
};

type Alert = {
  id: number;
  user_id: number;
  username?: string;
  alert_type: "enter" | "exit" | string;
  occurred_at: string;
};

type Row = User & {
  fullNameSort: string;
  contactSort: string;
  zoneAssignedSort: number;
  statusSort: number;
};

type ZoneFilter = "all" | "assigned" | "none";
type StatusFilter = "all" | "outside" | "inside";

const TABLE_STATE_KEY = "geofence:datatable:v4";

type TableState = {
  first: number;
  rows: number;
  globalFilter: string;
  zoneFilter: ZoneFilter;
  statusFilter: StatusFilter;
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);

    setMatches(mql.matches);

    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }

    // Safari fallback
    mql.addListener(onChange);
    return () => {
      mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

function hasZone(u: User): boolean {
  return (
    u.zone_center_lat != null &&
    u.zone_center_lng != null &&
    u.zone_radius_m != null
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

function readTableState(): TableState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TABLE_STATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<TableState>;

    const z: ZoneFilter =
      s.zoneFilter === "assigned" || s.zoneFilter === "none"
        ? s.zoneFilter
        : "all";

    const st: StatusFilter =
      s.statusFilter === "inside" || s.statusFilter === "outside"
        ? s.statusFilter
        : "all";

    return {
      first: typeof s.first === "number" ? Math.max(0, s.first) : 0,
      rows: typeof s.rows === "number" ? Math.max(10, s.rows) : 10,
      globalFilter: typeof s.globalFilter === "string" ? s.globalFilter : "",
      zoneFilter: z,
      statusFilter: st,
    };
  } catch {
    return null;
  }
}

function writeTableState(next: TableState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TABLE_STATE_KEY, JSON.stringify(next));
  } catch {}
}

/** Premium “pill” select that matches your inputs */
function PillSelect(props: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const selected = props.options.find((o) => o.value === props.value);
  const selectedLabel = selected?.label ?? props.options[0]?.label ?? "Select";

  React.useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (rootRef.current && t && !rootRef.current.contains(t)) setOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        aria-label={props.ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((p) => !p)}
        className="
          w-full
          min-w-[210px] sm:min-w-[240px]
          rounded-full
          bg-[hsl(var(--surface-soft-hsl)/0.75)]
          border border-[hsl(var(--border))]
          px-4 py-2.5
          text-sm text-[hsl(var(--foreground))]
          shadow-[var(--shadow-soft)]
          outline-none
          transition
          hover:border-[hsl(var(--border)/0.8)]
          focus:border-[hsl(var(--ring))]
          focus:ring-4 focus:ring-[hsl(var(--ring)/0.25)]
          flex items-center justify-between gap-3
        "
      >
        <span className="truncate">{selectedLabel}</span>

        <svg
          className={`h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform ${
            open ? "rotate-180" : ""
          }`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={props.ariaLabel}
          className="
      absolute left-0 right-0 mt-2 z-50
      rounded-2xl
      bg-[var(--surface)]
      border border-[hsl(var(--border))]
      shadow-[var(--shadow-elevated)]
      p-1
    "
        >
          {props.options.map((o) => {
            const active = o.value === props.value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  props.onChange(o.value);
                  setOpen(false);
                }}
                className={`
            w-full text-left px-3 py-2 rounded-xl text-sm
            transition
            ${
              active
                ? "bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--foreground))] border border-[hsl(var(--primary)/0.35)]"
                : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
            }
          `}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function statusRank(u: User): number {
  // Required order: no zone -> outside -> inside
  if (!hasZone(u)) return 0;
  return isInsideZone(u) ? 2 : 1;
}

export default function DashboardPage() {
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 980px)");

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
  const alertsRef = useRef<HTMLDivElement | null>(null);

  // Table state
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(10);

  // Filters
  const [globalFilter, setGlobalFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Restore state
  useEffect(() => {
    const saved = readTableState();
    if (!saved) return;
    setFirst(saved.first);
    setRows(saved.rows);
    setGlobalFilter(saved.globalFilter);
    setZoneFilter(saved.zoneFilter);
    setStatusFilter(saved.statusFilter);
  }, []);

  // Persist state
  useEffect(() => {
    writeTableState({ first, rows, globalFilter, zoneFilter, statusFilter });
  }, [first, rows, globalFilter, zoneFilter, statusFilter]);

  // Auth guard
  useEffect(() => {
    const isAuthed = localStorage.getItem("adminAuth") === "true";
    if (!isAuthed) router.replace("/");
  }, [router]);

  // Load users (polling)
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/users", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load users");

        const data: User[] = await res.json();
        const nonAdmins = data.filter((u) => u.role !== "admin");
        setUsers(nonAdmins);
        setUsersError(null);
      } catch (e: unknown) {
        setUsersError(e instanceof Error ? e.message : "Failed to load users");
      }
    };

    void fetchUsers();
    const interval = setInterval(() => void fetchUsers(), 3000);
    return () => clearInterval(interval);
  }, []);

  // Load alerts (polling)
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await fetch("/api/alerts", { cache: "no-store" });
        if (!res.ok) return;

        const data = (await res.json()) as Alert[];

        const clearedUntilStr = localStorage.getItem("alerts-cleared-until");
        let filtered = data;

        if (clearedUntilStr) {
          const clearedUntil = new Date(clearedUntilStr);
          filtered = data.filter((a) => new Date(a.occurred_at) > clearedUntil);
        }

        filtered.sort(
          (a, b) =>
            new Date(b.occurred_at).getTime() -
            new Date(a.occurred_at).getTime()
        );

        setAlerts(filtered.slice(0, 15));
      } catch {}
    };

    void fetchAlerts();
    const interval = setInterval(fetchAlerts, 3000);
    return () => clearInterval(interval);
  }, []);

  // Close alerts on outside click + ESC
  useEffect(() => {
    if (!alertsOpen) return;

    const onOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (alertsRef.current && target && !alertsRef.current.contains(target)) {
        setAlertsOpen(false);
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAlertsOpen(false);
    };

    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [alertsOpen]);

  const rowsData: Row[] = useMemo(() => {
    if (!users) return [];
    return users.map((u) => ({
      ...u,
      fullNameSort: (u.full_name || u.username || "").toLowerCase(),
      contactSort: formatContact(u).toLowerCase(),
      zoneAssignedSort: hasZone(u) ? 1 : 0,
      statusSort: isInsideZone(u) ? 1 : 0,
    }));
  }, [users]);

  // ✅ Filters + required ordering: no zone -> outside -> inside
  const filteredSortedRows: Row[] = useMemo(() => {
    const q = globalFilter.trim().toLowerCase();
    let list = rowsData;

    // Search filter
    if (q) {
      list = list.filter((r) => {
        return (
          r.fullNameSort.includes(q) ||
          r.username.toLowerCase().includes(q) ||
          r.contactSort.includes(q)
        );
      });
    }

    // Zone filter
    if (zoneFilter === "assigned") {
      list = list.filter((r) => hasZone(r));
    } else if (zoneFilter === "none") {
      list = list.filter((r) => !hasZone(r));
    }

    // Status filter (only meaningful if zone assigned)
    if (statusFilter === "inside") {
      list = list.filter((r) => hasZone(r) && isInsideZone(r));
    } else if (statusFilter === "outside") {
      list = list.filter((r) => hasZone(r) && !isInsideZone(r));
    }

    // Stable ordering
    return [...list].sort((a, b) => {
      const ra = statusRank(a);
      const rb = statusRank(b);
      if (ra !== rb) return ra - rb;
      return a.fullNameSort.localeCompare(b.fullNameSort);
    });
  }, [rowsData, globalFilter, zoneFilter, statusFilter]);

  const mobilePageRows = useMemo(() => {
    return filteredSortedRows.slice(first, first + rows);
  }, [filteredSortedRows, first, rows]);

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {}

    localStorage.removeItem("adminAuth");
    localStorage.removeItem("adminUsername");
    router.replace("/");
  };

  const handleViewLogs = (userId: number) =>
    router.push(`/dashboard/logs?userId=${userId}`);

  const handleDownloadUserLogs = (userId: number) => {
    window.location.href = `/api/alerts?userId=${userId}&format=csv`;
  };

  const handleDownloadAllLogs = () => {
    window.location.href = `/api/alerts?format=csv`;
  };

  const handleClearAlerts = () => {
    localStorage.setItem("alerts-cleared-until", new Date().toISOString());
    setAlerts([]);
  };

  const headerTemplate = (
    <div className="px-4 sm:px-6 py-4 border-b border-[hsl(var(--border))]">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Users Overview</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            Full list of mobile users, their assigned zones and current status.
          </p>
        </div>

        {/* Controls: keep responsive like the old small-screen design */}
        <div className="w-full md:w-auto flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex-1 sm:min-w-[18rem]">
            <input
              value={globalFilter}
              onChange={(e) => {
                setGlobalFilter(e.target.value);
                setFirst(0);
              }}
              placeholder="Name / username / contact"
              className="
                w-full
                rounded-full
                bg-[hsl(var(--surface-soft-hsl)/0.75)]
                border border-[hsl(var(--border))]
                px-4 py-2.5
                text-sm text-[hsl(var(--foreground))]
                placeholder:text-[hsl(var(--muted-foreground))]
                shadow-[var(--shadow-soft)]
                outline-none
                focus:border-[hsl(var(--ring))]
                focus:ring-4 focus:ring-[hsl(var(--ring)/0.25)]
              "
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
            <PillSelect
              ariaLabel="Zone filter"
              value={zoneFilter}
              onChange={(v) => {
                setZoneFilter(v as ZoneFilter);
                setFirst(0);
              }}
              options={[
                { value: "all", label: "Zone: All" },
                { value: "none", label: "Zone: No zone" },
                { value: "assigned", label: "Zone: Assigned" },
              ]}
            />

            <PillSelect
              ariaLabel="Status filter"
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v as StatusFilter);
                setFirst(0);
              }}
              options={[
                { value: "all", label: "Status: All" },
                { value: "outside", label: "Status: Outside" },
                { value: "inside", label: "Status: Inside" },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );

  // Desktop table bodies
  const fullNameBody = (u: Row) => (
    <div className="min-w-0">
      <div className="text-sm font-semibold truncate">
        {u.full_name || u.username || "—"}
      </div>
      <div className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))] truncate">
        Last seen: {formatDateTime(u.last_seen)}
      </div>
    </div>
  );

  const usernameBody = (u: Row) => (
    <div className="min-w-0 truncate">{u.username}</div>
  );

  const contactBody = (u: Row) => (
    <div className="min-w-0 text-[hsl(var(--muted-foreground))] truncate">
      {formatContact(u)}
    </div>
  );

  const zoneBodyDesktop = (u: Row) => {
    const assigned = hasZone(u);
    return (
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => setSelectedUserForZone(u)}
          className="btn-base bg-emerald-500 hover:bg-emerald-400 text-[11px] sm:text-xs font-semibold text-white whitespace-nowrap"
        >
          View / Update
        </button>

        {!assigned && (
          <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))] truncate">
            No zone assigned yet
          </div>
        )}
      </div>
    );
  };

  const statusBody = (u: Row) => {
    const assigned = hasZone(u);
    const inside = isInsideZone(u);

    if (!assigned) {
      return (
        <span className="text-xs text-[hsl(var(--muted-foreground))] italic whitespace-nowrap">
          No zone
        </span>
      );
    }

    return (
      <div className="text-xs font-semibold whitespace-nowrap">
        <span
          className={
            inside
              ? "text-[hsl(var(--success))]"
              : "text-[hsl(var(--muted-foreground))]"
          }
        >
          Inside
        </span>
        <span className="mx-1 text-[hsl(var(--muted-foreground))]">/</span>
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
    );
  };

  const trackBodyDesktop = (u: Row) => {
    const assigned = hasZone(u);
    return (
      <button
        type="button"
        onClick={() => setSelectedUserForTrack(u)}
        disabled={!assigned}
        className="btn-base bg-rose-500 hover:bg-rose-400 text-[11px] sm:text-xs font-semibold text-white whitespace-nowrap"
        title={!assigned ? "Assign a zone first" : "Track user"}
      >
        Track
      </button>
    );
  };

  const logsBodyDesktop = (u: Row) => {
    const assigned = hasZone(u);
    return (
      <div className="flex items-center justify-center gap-2 whitespace-nowrap">
        <button
          type="button"
          onClick={() => handleViewLogs(u.id)}
          disabled={!assigned}
          className="action-icon-btn inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 hover:bg-amber-400 text-base font-semibold transition-colors"
          title={!assigned ? "Assign a zone first" : "View logs"}
        >
          <FaEye />
        </button>

        <button
          type="button"
          onClick={() => handleDownloadUserLogs(u.id)}
          disabled={!assigned}
          className="action-icon-btn inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 hover:bg-amber-400 text-base font-semibold transition-colors"
          title={!assigned ? "Assign a zone first" : "Download CSV"}
        >
          <FaDownload />
        </button>
      </div>
    );
  };

  // Mobile card view
  const MobileList = (
    <div>
      {usersError && (
        <div className="px-4 sm:px-6 py-3 border-b border-[hsl(var(--border))] text-sm text-[hsl(var(--danger))]">
          {usersError}
        </div>
      )}

      {headerTemplate}

      {users === null && (
        <div className="px-4 sm:px-6 py-6 text-sm text-[hsl(var(--muted-foreground))]">
          Loading users…
        </div>
      )}

      {users !== null && filteredSortedRows.length === 0 && (
        <div className="px-4 sm:px-6 py-6 text-sm text-[hsl(var(--muted-foreground))]">
          No users yet.
        </div>
      )}

      <div>
        {mobilePageRows.map((u) => {
          const assigned = hasZone(u);
          const inside = isInsideZone(u);

          return (
            <div
              key={u.id}
              className="px-4 sm:px-6 py-4 border-t border-[hsl(var(--border))]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">
                    {u.full_name || u.username || "—"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))] truncate">
                    Last seen: {formatDateTime(u.last_seen)}
                  </div>
                </div>

                <div className="shrink-0 text-xs font-semibold whitespace-nowrap">
                  {!assigned ? (
                    <span className="text-[hsl(var(--muted-foreground))] italic">
                      No zone
                    </span>
                  ) : inside ? (
                    <span className="text-[hsl(var(--success))]">Inside</span>
                  ) : (
                    <span className="text-[hsl(var(--danger))]">Outside</span>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="text-[hsl(var(--muted-foreground))]">
                  <span className="font-semibold text-[hsl(var(--foreground))]">
                    Username:
                  </span>{" "}
                  {u.username}
                </div>
                <div className="text-[hsl(var(--muted-foreground))]">
                  <span className="font-semibold text-[hsl(var(--foreground))]">
                    Contact:
                  </span>{" "}
                  {formatContact(u)}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedUserForZone(u)}
                  className="btn-base bg-emerald-500 hover:bg-emerald-400 text-[11px] sm:text-xs font-semibold text-white w-full whitespace-nowrap"
                >
                  View / Update Zone
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedUserForTrack(u)}
                  disabled={!assigned}
                  className="btn-base bg-rose-500 hover:bg-rose-400 text-[11px] sm:text-xs font-semibold text-white w-full whitespace-nowrap"
                  title={!assigned ? "Assign a zone first" : "Track user"}
                >
                  Track
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleViewLogs(u.id)}
                  disabled={!assigned}
                  className="action-icon-btn inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 hover:bg-amber-400 text-base font-semibold transition-colors"
                  title={!assigned ? "Assign a zone first" : "View logs"}
                >
                  <FaEye />
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadUserLogs(u.id)}
                  disabled={!assigned}
                  className="action-icon-btn inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 hover:bg-amber-400 text-base font-semibold transition-colors"
                  title={!assigned ? "Assign a zone first" : "Download CSV"}
                >
                  <FaDownload />
                </button>

                {!assigned && (
                  <span className="ml-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                    Assign a zone to enable tracking/logs.
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* paginator */}
      {users !== null && filteredSortedRows.length > 0 && (
        <Paginator
          className="dashboard-paginator"
          template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
          first={first}
          rows={rows}
          totalRecords={filteredSortedRows.length}
          rowsPerPageOptions={[10, 15, 25, 50]}
          onPageChange={(e) => {
            setFirst(e.first);
            setRows(e.rows);
          }}
        />
      )}
    </div>
  );

  return (
    <main className="min-h-screen bg-[var(--surface-root)] text-[hsl(var(--foreground))] flex flex-col">
      {/* Top bar */}
      <header className="dashboard-topbar sticky top-0 z-30 px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

            {/* Alerts */}
            <div className="relative" ref={alertsRef}>
              <button
                type="button"
                onClick={() => setAlertsOpen((p) => !p)}
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

                    {alerts.map((a) => {
                      const isEnter = a.alert_type === "enter";
                      return (
                        <div
                          key={a.id}
                          className="flex items-start gap-2 px-4 py-2.5 hover:bg-[hsl(var(--muted))] transition-colors"
                        >
                          <FaCircle
                            className={`mt-1 text-[8px] ${
                              isEnter
                                ? "text-[hsl(var(--success))]"
                                : "text-[hsl(var(--danger))]"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium">
                                {isEnter ? "Entered zone" : "Left zone"}
                              </p>
                              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                                {new Date(a.occurred_at).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))] truncate">
                              {a.username ?? `User #${a.user_id}`}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="btn-base btn-ghost rounded-full text-xs sm:text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <section className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="card">
          {/* MOBILE */}
          {isMobile ? (
            MobileList
          ) : (
            <>
              {usersError && (
                <div className="px-4 sm:px-6 py-3 border-b border-[hsl(var(--border))] text-sm text-[hsl(var(--danger))]">
                  {usersError}
                </div>
              )}

              <DataTable
                value={filteredSortedRows} // ✅ filtered + ordered list
                dataKey="id"
                className="dashboard-datatable"
                header={headerTemplate}
                stripedRows
                paginator
                paginatorClassName="dashboard-paginator"
                paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
                first={first}
                rows={rows}
                rowsPerPageOptions={[10, 15, 25, 50]}
                onPage={(e: DataTablePageEvent) => {
                  setFirst(e.first);
                  setRows(e.rows);
                }}
                emptyMessage={
                  users === null ? "Loading users…" : "No users yet."
                }
              >
                <Column
                  header="Full Name"
                  body={fullNameBody}
                  style={{ width: "22rem" }}
                />
                <Column
                  header="Username"
                  body={usernameBody}
                  style={{ width: "10rem" }}
                />
                <Column
                  header="Contact"
                  body={contactBody}
                  style={{ width: "14rem" }}
                />
                <Column
                  header="Assigned Zone"
                  body={zoneBodyDesktop}
                  style={{ width: "14rem" }}
                />
                <Column
                  header="Status"
                  body={statusBody}
                  style={{ width: "10rem" }}
                />
                <Column
                  header="Track"
                  body={trackBodyDesktop}
                  style={{ width: "9rem" }}
                />
                <Column
                  header="Logs"
                  body={logsBodyDesktop}
                  style={{ width: "10rem" }}
                />
              </DataTable>
            </>
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
}
