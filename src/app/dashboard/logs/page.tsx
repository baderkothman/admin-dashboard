/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { InputText } from "primereact/inputtext";

type Alert = {
  id: number;
  user_id: number;
  username: string;
  alert_type: "exit" | "enter";
  occurred_at: string;
  latitude: number | null;
  longitude: number | null;
};

export default function LogsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const userIdParam = searchParams.get("userId");

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [globalFilter, setGlobalFilter] = useState("");

  useEffect(() => {
    if (!userIdParam) return;

    let cancelled = false;

    async function load(showSpinner: boolean) {
      try {
        if (showSpinner) {
          setLoading(true);
          setError("");
        }

        const res = await fetch(`/api/alerts?userId=${userIdParam}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to load logs");

        const data = (await res.json()) as Alert[];
        if (!cancelled) setAlerts(data);
      } catch {
        if (!cancelled) setError("Failed to load logs");
      } finally {
        if (!cancelled && showSpinner) setLoading(false);
      }
    }

    load(true);
    const id = window.setInterval(() => load(false), 5000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [userIdParam]);

  const username = alerts[0]?.username;
  const userIdText = userIdParam ?? "?";

  const rows = useMemo(() => {
    return alerts.map((a) => ({
      ...a,
      eventSort: a.alert_type,
      timeSort: new Date(a.occurred_at).getTime(),
    }));
  }, [alerts]);

  function handleDownloadCsv() {
    if (!userIdParam) return;
    window.open(`/api/alerts?userId=${userIdParam}&format=csv`, "_blank");
  }

  function handleBack() {
    router.push("/dashboard");
  }

  const header = (
    <div className="px-4 sm:px-6 py-4 border-b border-[hsl(var(--border))] flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold">User Logs</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
          User:{" "}
          {username ? (
            <>
              <span className="font-semibold">{username}</span> (ID #
              {userIdText})
            </>
          ) : (
            <>ID #{userIdText}</>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <InputText
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search logs..."
        />
        <button
          onClick={handleDownloadCsv}
          disabled={!userIdParam || alerts.length === 0}
          className="btn-base btn-ghost text-xs sm:text-sm"
        >
          Download CSV
        </button>
        <button
          onClick={handleBack}
          className="btn-base text-xs sm:text-sm bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary)/0.92)]"
        >
          Back
        </button>
      </div>
    </div>
  );

  const eventBody = (a: any) => {
    const isExit = a.alert_type === "exit";
    return (
      <span
        className={
          isExit
            ? "text-[hsl(var(--danger))] font-semibold"
            : "text-[hsl(var(--success))] font-semibold"
        }
      >
        {isExit ? "Exited zone" : "Entered zone"}
      </span>
    );
  };

  const timeBody = (a: any) => new Date(a.occurred_at).toLocaleString();
  const latBody = (a: any) =>
    a.latitude != null ? Number(a.latitude).toFixed(5) : "—";
  const lngBody = (a: any) =>
    a.longitude != null ? Number(a.longitude).toFixed(5) : "—";

  return (
    <main className="min-h-screen bg-[var(--surface-root)] text-[hsl(var(--foreground))]">
      <header className="dashboard-topbar sticky top-0 z-30 px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b">
        <h1 className="text-lg sm:text-xl font-semibold">Logs</h1>
      </header>

      <section className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="card">
          {error && (
            <div className="px-4 sm:px-6 py-3 border-b border-[hsl(var(--border))] text-sm text-[hsl(var(--danger))]">
              {error}
            </div>
          )}

          <DataTable
            value={rows}
            dataKey="id"
            className="dashboard-datatable"
            header={header}
            globalFilter={globalFilter}
            globalFilterFields={["alert_type", "occurred_at", "username"]}
            paginator
            paginatorClassName="dashboard-paginator"
            paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
            rows={10}
            rowsPerPageOptions={[10, 25, 50]}
            emptyMessage={
              loading ? "Loading logs..." : "No logs for this user."
            }
          >
            <Column
              header="Event"
              field="eventSort"
              body={eventBody}
              sortable
            />
            <Column header="Time" field="timeSort" body={timeBody} sortable />
            <Column header="Latitude" field="latitude" body={latBody} />
            <Column header="Longitude" field="longitude" body={lngBody} />
          </DataTable>
        </div>
      </section>
    </main>
  );
}
