"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import {
  DataTable,
  type DataTablePageEvent,
  type DataTableSortEvent,
} from "primereact/datatable";
import { Column } from "primereact/column";
import { InputText } from "primereact/inputtext";

import { FaBell, FaCircle, FaDownload, FaEye } from "react-icons/fa";

// ThemeToggle must be client-only to avoid hydration mismatch
const ThemeToggle = dynamic(() => import("@/components/ThemeToggle"), {
  ssr: false,
});

// Leaflet modals are client-only
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

const TABLE_STATE_KEY = "geofence:datatable:v3";

type TableState = {
  first: number;
  rows: number;
  sortField: string;
  sortOrder: 1 | -1;
  globalFilter: string;
};

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
    return {
      first: typeof s.first === "number" ? Math.max(0, s.first) : 0,
      rows: typeof s.rows === "number" ? Math.max(10, s.rows) : 10,
      sortField: typeof s.sortField === "string" ? s.sortField : "fullNameSort",
      sortOrder: s.sortOrder === -1 ? -1 : 1,
      globalFilter: typeof s.globalFilter === "string" ? s.globalFilter : "",
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

export default function DashboardPage() {
  const router = useRouter();

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

  // DataTable state
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(10);
  const [sortField, setSortField] = useState<string>("fullNameSort");
  const [sortOrder, setSortOrder] = useState<1 | -1>(1);
  const [globalFilter, setGlobalFilter] = useState("");

  // Restore table state
  useEffect(() => {
    const saved = readTableState();
    if (!saved) return;
    setFirst(saved.first);
    setRows(saved.rows);
    setSortField(saved.sortField);
    setSortOrder(saved.sortOrder);
    setGlobalFilter(saved.globalFilter);
  }, []);

  // Persist table state
  useEffect(() => {
    writeTableState({ first, rows, sortField, sortOrder, globalFilter });
  }, [first, rows, sortField, sortOrder, globalFilter]);

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
    <div className="px-4 sm:px-6 py-4 border-b border-[hsl(var(--border))] flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold">Users Overview</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
          Full list of mobile users, their assigned zones and current status.
        </p>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-[hsl(var(--muted-foreground))] hidden sm:inline">
          Search
        </span>
        <InputText
          value={globalFilter}
          onChange={(e) => {
            setGlobalFilter(e.target.value);
            setFirst(0);
          }}
          placeholder="Name / username / contact"
        />
      </div>
    </div>
  );

  // ✅ No fixed widths. Everything truncates safely inside fixed table layout.
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

  const zoneBody = (u: Row) => {
    const assigned = hasZone(u);
    return (
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => setSelectedUserForZone(u)}
          className="btn-base bg-emerald-500 hover:bg-emerald-400 text-[11px] sm:text-xs font-semibold text-white w-full"
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
        <span className="text-xs text-[hsl(var(--muted-foreground))] italic">
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

  const trackBody = (u: Row) => {
    const assigned = hasZone(u);
    return (
      <button
        type="button"
        onClick={() => setSelectedUserForTrack(u)}
        disabled={!assigned}
        className="btn-base bg-rose-500 hover:bg-rose-400 text-[11px] sm:text-xs font-semibold text-white w-full"
        title={!assigned ? "Assign a zone first" : "Track user"}
      >
        Track
      </button>
    );
  };

  const logsBody = (u: Row) => {
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

      {/* Table card */}
      <section className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="card">
          {usersError && (
            <div className="px-4 sm:px-6 py-3 border-b border-[hsl(var(--border))] text-sm text-[hsl(var(--danger))]">
              {usersError}
            </div>
          )}

          <DataTable
            value={rowsData}
            dataKey="id"
            className="dashboard-datatable"
            header={headerTemplate}
            globalFilter={globalFilter}
            globalFilterFields={["fullNameSort", "username", "contactSort"]}
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
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={(e: DataTableSortEvent) => {
              setSortField((e.sortField as string) || "fullNameSort");
              setSortOrder((e.sortOrder as 1 | -1) || 1);
              setFirst(0);
            }}
            // ✅ Prevent “horizontal scroll”: stack layout on small screens instead of scrolling
            responsiveLayout="stack"
            breakpoint="900px"
            emptyMessage={users === null ? "Loading users…" : "No users yet."}
          >
            {/* Percent widths = always fit container (no x-scroll) */}
            <Column
              header="Full Name"
              field="fullNameSort"
              sortable
              body={fullNameBody}
              style={{ width: "23%" }}
            />
            <Column
              header="Username"
              field="username"
              sortable
              body={usernameBody}
              style={{ width: "14%" }}
            />
            <Column
              header="Contact"
              field="contactSort"
              sortable
              body={contactBody}
              style={{ width: "18%" }}
            />
            <Column
              header="Assigned Zone"
              field="zoneAssignedSort"
              sortable
              body={zoneBody}
              style={{ width: "19%" }}
            />
            <Column
              header="Status"
              field="statusSort"
              sortable
              body={statusBody}
              style={{ width: "10%" }}
            />
            <Column header="Track" body={trackBody} style={{ width: "8%" }} />
            <Column header="Logs" body={logsBody} style={{ width: "8%" }} />
          </DataTable>
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
