// src/components/UserTrackModal.tsx
"use client";

/**
 * UserTrackModal
 * --------------
 * Read-only modal for tracking a user's **latest known location** on a map.
 */

import { MapContainer, TileLayer, Circle, Marker } from "react-leaflet";
import L, { LatLngExpression } from "leaflet";

interface User {
  id: number;
  username: string;
  zone_center_lat: number | string | null;
  zone_center_lng: number | string | null;
  zone_radius_m: number | string | null;
  last_latitude: number | string | null;
  last_longitude: number | string | null;
}

interface Props {
  user: User;
  onClose: () => void;
}

/* ------------------------------------------------------------------
 * Leaflet marker icon setup
 * ------------------------------------------------------------------ */

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

export default function UserTrackModal({ user, onClose }: Props) {
  const hasLast = user.last_latitude != null && user.last_longitude != null;

  const hasZone =
    user.zone_center_lat != null &&
    user.zone_center_lng != null &&
    user.zone_radius_m != null;

  const center: [number, number] = hasLast
    ? [Number(user.last_latitude), Number(user.last_longitude)]
    : hasZone
    ? [Number(user.zone_center_lat), Number(user.zone_center_lng)]
    : [34.4367, 35.8362];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      {/* Modal surface uses card → same tokens as dashboard cards */}
      <div className="card w-full max-w-5xl h-[80vh] p-4 md:p-6 mx-3 md:mx-0 flex flex-col border border-slate-700">
        {/* Header: title + close button */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-lg font-semibold">
              Track{" "}
              <span className="text-emerald-400 font-semibold">
                @{user.username}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Showing last reported position from the mobile app.
            </p>
          </div>

          <button
            onClick={onClose}
            className="btn-base btn-ghost text-xs sm:text-sm"
          >
            Close
          </button>
        </div>

        {/* Map container – fills the remaining height */}
        <div className="flex-1 rounded-2xl overflow-hidden border border-slate-700 mt-3">
          <MapContainer
            center={center as LatLngExpression}
            zoom={15}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />

            {hasZone && (
              <Circle
                center={
                  [
                    Number(user.zone_center_lat),
                    Number(user.zone_center_lng),
                  ] as LatLngExpression
                }
                radius={Number(user.zone_radius_m)}
              />
            )}

            {hasLast && (
              <Marker
                position={
                  [
                    Number(user.last_latitude),
                    Number(user.last_longitude),
                  ] as LatLngExpression
                }
              />
            )}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
