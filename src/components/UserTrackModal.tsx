// src/components/UserTrackModal.tsx
"use client";

/**
 * UserTrackModal
 * --------------
 * Read-only modal for tracking a user's **latest known location** on a map.
 *
 * Typical flow:
 *   - Opens when an admin clicks **"Track"** for a specific user in the dashboard.
 *   - Uses the location data already stored in the database (no live polling here).
 *
 * Behavior:
 *   - If `last_latitude` & `last_longitude` are present:
 *       - Centers the map on that point.
 *       - Renders a marker at the latest position.
 *   - If the user also has a geofence zone:
 *       - Draws the zone circle using (zone_center_lat, zone_center_lng, zone_radius_m).
 *   - If there is **no last position**:
 *       - Centers the map on the zone center when available.
 *       - Otherwise uses a default fallback center (Tripoli-ish coordinates).
 *
 * Props:
 *   - user:
 *       {
 *         id: number;
 *         username: string;
 *         zone_center_lat: number | string | null;
 *         zone_center_lng: number | string | null;
 *         zone_radius_m: number | string | null;
 *         last_latitude: number | string | null;
 *         last_longitude: number | string | null;
 *       }
 *   - onClose: () => void
 *       Callback fired when the admin closes the modal.
 */

import { MapContainer, TileLayer, Circle, Marker } from "react-leaflet";
import L, { LatLngExpression } from "leaflet";

/**
 * Shape of the user object expected by this modal.
 * Only fields needed to display the map and zone are included.
 */
interface User {
  id: number;
  username: string;
  zone_center_lat: number | string | null;
  zone_center_lng: number | string | null;
  zone_radius_m: number | string | null;
  last_latitude: number | string | null;
  last_longitude: number | string | null;
}

/**
 * Component props.
 */
interface Props {
  user: User;
  onClose: () => void;
}

/* ------------------------------------------------------------------
 * Leaflet marker icon setup
 * ------------------------------------------------------------------
 * In many React/Next setups, Leaflet's default marker images are not
 * automatically resolved from the package assets. To avoid broken markers,
 * we explicitly configure a default icon pointing at the official CDN
 * image files from unpkg.
 */

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// Apply our default icon globally to all Marker instances
L.Marker.prototype.options.icon = defaultIcon;

/**
 * UserTrackModal component
 * ------------------------
 * Pure display component (no editing) that shows:
 *   - The user's last known position (if present).
 *   - The user's geofence zone (if present).
 */
export default function UserTrackModal({ user, onClose }: Props) {
  /**
   * Flags describing what data we have available for this user.
   */
  const hasLast = user.last_latitude != null && user.last_longitude != null;

  const hasZone =
    user.zone_center_lat != null &&
    user.zone_center_lng != null &&
    user.zone_radius_m != null;

  /**
   * Decide where to center the map:
   *   1. Prefer the last known location (most relevant for tracking).
   *   2. If unavailable, fall back to the zone center.
   *   3. If both are missing, use a fixed default (Tripoli-ish).
   */
  const center: [number, number] = hasLast
    ? [Number(user.last_latitude), Number(user.last_longitude)]
    : hasZone
    ? [Number(user.zone_center_lat), Number(user.zone_center_lng)]
    : [34.4367, 35.8362];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-4 md:p-6">
        {/* Header: title + close button */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">
            Track <span className="text-blue-400">{user.username}</span>
          </h3>
          <button
            onClick={onClose}
            className="text-sm px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700"
          >
            Close
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-2">
          Showing last reported position from the mobile app.
        </p>

        {/* Map container */}
        <div className="h-72 rounded-xl overflow-hidden border border-slate-700">
          <MapContainer
            center={center as LatLngExpression}
            zoom={15}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              // Single-domain OpenStreetMap tiles (keeps Next dev warnings quiet)
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />

            {/* Optional zone circle: visualizes the user's assigned geofence */}
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

            {/* Optional marker: latest known position from user_locations */}
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
