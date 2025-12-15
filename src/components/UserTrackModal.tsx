"use client";

/**
 * UserTrackModal (LIVE)
 * - Polls /api/users every 3s to get the latest last_latitude/last_longitude
 * - Updates marker position
 * - Auto-follows the user on the map (can be disabled)
 */

import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Circle, Marker, useMap } from "react-leaflet";
import L, { LatLngExpression } from "leaflet";

type User = {
  id: number;
  username: string;
  zone_center_lat: number | string | null;
  zone_center_lng: number | string | null;
  zone_radius_m: number | string | null;
  last_latitude: number | string | null;
  last_longitude: number | string | null;
};

interface Props {
  user: User;
  onClose: () => void;
}

/* Leaflet marker icon setup */
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

function toNum(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function MapAutoFollow({
  position,
  enabled,
}: {
  position: LatLngExpression | null;
  enabled: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;
    if (!position) return;

    // Smooth follow without being too “jumpy”
    map.setView(position, map.getZoom(), { animate: true });
  }, [position, enabled, map]);

  return null;
}

export default function UserTrackModal({ user, onClose }: Props) {
  const [live, setLive] = useState<User>(user);
  const [follow, setFollow] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Poll latest user data
  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch("/api/users", { cache: "no-store" });
        if (!res.ok) return;

        const all = (await res.json()) as User[];
        const found = all.find((u) => u.id === user.id);
        if (!found) return;

        if (!alive) return;
        setLive(found);
        setLastUpdated(new Date());
      } catch {
        // ignore
      }
    };

    void load();
    const id = window.setInterval(() => void load(), 3000);

    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [user.id]);

  const hasLast =
    toNum(live.last_latitude) != null && toNum(live.last_longitude) != null;

  const hasZone =
    toNum(live.zone_center_lat) != null &&
    toNum(live.zone_center_lng) != null &&
    toNum(live.zone_radius_m) != null;

  const lastPos = useMemo<LatLngExpression | null>(() => {
    if (!hasLast) return null;
    return [toNum(live.last_latitude)!, toNum(live.last_longitude)!];
  }, [hasLast, live.last_latitude, live.last_longitude]);

  const zoneCenter = useMemo<LatLngExpression | null>(() => {
    if (!hasZone) return null;
    return [toNum(live.zone_center_lat)!, toNum(live.zone_center_lng)!];
  }, [hasZone, live.zone_center_lat, live.zone_center_lng]);

  const zoneRadius = hasZone ? Number(toNum(live.zone_radius_m)!) : 0;

  const initialCenter: LatLngExpression =
    lastPos ?? zoneCenter ?? ([34.4367, 35.8362] as LatLngExpression);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-3">
      <div className="card w-full max-w-5xl h-[80vh] p-4 md:p-6 flex flex-col border border-[hsl(var(--border))]">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h3 className="text-lg font-semibold">
              Track{" "}
              <span className="font-semibold text-[hsl(var(--primary))]">
                @{live.username}
              </span>
            </h3>

            <p className="text-xs mt-1 text-[hsl(var(--muted-foreground))]">
              {hasLast
                ? "Live location updates every 3 seconds."
                : "No last location yet — showing zone center (if assigned)."}
            </p>

            {lastUpdated && (
              <p className="text-[11px] mt-1 text-[hsl(var(--muted-foreground))]">
                Last update: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFollow((p) => !p)}
              className="btn-base btn-ghost text-xs sm:text-sm"
            >
              {follow ? "Following" : "Not following"}
            </button>

            <button
              onClick={onClose}
              className="btn-base btn-ghost text-xs sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 rounded-2xl overflow-hidden border border-[hsl(var(--border))] mt-3">
          <MapContainer
            center={initialCenter}
            zoom={15}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />

            <MapAutoFollow position={lastPos ?? zoneCenter} enabled={follow} />

            {hasZone && zoneCenter && (
              <Circle center={zoneCenter} radius={zoneRadius} />
            )}

            {hasLast && lastPos && <Marker position={lastPos} />}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
