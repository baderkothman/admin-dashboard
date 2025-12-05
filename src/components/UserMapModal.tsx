// src/components/UserMapModal.tsx
"use client";

/**
 * UserMapModal
 * ------------
 * Admin-facing modal used to **assign or edit a geofence zone** for a user.
 *
 * Responsibilities:
 * - Render a Leaflet map centered on the user's current zone (or a default city).
 * - Allow the admin to:
 *     - Search for a location using OpenStreetMap Nominatim (client-side fetch).
 *     - Click on the map to move the zone center.
 *     - Adjust the zone radius with a slider (in meters).
 * - When the admin clicks "Save Zone", call:
 *     onSave(user.id, centerLat, centerLng, radius)
 *
 * Props:
 *   - user:
 *       {
 *         id: number;
 *         username: string;
 *         zone_center_lat: number | string | null;
 *         zone_center_lng: number | string | null;
 *         zone_radius_m: number | string | null;
 *       }
 *   - onClose: () => void
 *       Close the modal without saving changes.
 *   - onSave: (userId: number, lat: number, lng: number, radius: number) => void
 *       Persist the new zone in the backend (usually via /api/users/[id] PUT).
 *
 * NOTE:
 * - This component is marked `"use client"` because:
 *     - It uses React state/hooks.
 *     - It interacts with the Leaflet map via react-leaflet.
 */

import { useState } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  Marker,
  useMapEvents,
} from "react-leaflet";
import L, { LatLngExpression, LeafletMouseEvent } from "leaflet";

/**
 * Shape of the user passed into this modal.
 * We only include the fields needed to draw/edit the geofence.
 */
interface User {
  id: number;
  username: string;
  zone_center_lat: number | string | null;
  zone_center_lng: number | string | null;
  zone_radius_m: number | string | null;
}

/**
 * Component props.
 */
interface Props {
  user: User;
  onClose: () => void;
  onSave: (userId: number, lat: number, lng: number, radius: number) => void;
}

/**
 * Internal representation of a search result returned from Nominatim.
 */
interface SearchResult {
  displayName: string;
  lat: number;
  lon: number;
}

/* ------------------------------------------------------------------
 * Leaflet marker icon setup
 * ------------------------------------------------------------------
 * In many bundler setups (including Next.js), the default Leaflet marker
 * icons are not picked up automatically from the package assets.
 *
 * To keep things simple and predictable, we configure a custom default
 * marker icon using the official CDN URLs from unpkg.
 */

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// Apply our default icon to all markers by default
L.Marker.prototype.options.icon = defaultIcon;

/**
 * ClickHandler
 * ------------
 * Invisible helper component used inside <MapContainer>.
 *
 * - It registers a click listener on the map using `useMapEvents`.
 * - When the admin clicks anywhere on the map, it calls `setCenter(lat, lng)`.
 *
 * This is what allows "click to move the zone center" behavior.
 */
function ClickHandler({
  setCenter,
}: {
  setCenter: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e: LeafletMouseEvent) {
      setCenter(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * UserMapModal component
 * ----------------------
 * Main UI for editing a user's geofence zone.
 */
export default function UserMapModal({ user, onClose, onSave }: Props) {
  /**
   * Compute the initial map center:
   * - If the user already has a zone, we use the saved center.
   * - Otherwise, we fall back to a default location (Tripoli-ish coordinates).
   */
  const initialCenter: [number, number] = [
    user.zone_center_lat != null ? Number(user.zone_center_lat) : 34.4367,
    user.zone_center_lng != null ? Number(user.zone_center_lng) : 35.8362,
  ];

  /**
   * Local editable state for:
   * - center: [lat, lng] of the geofence center.
   * - radius: radius of the geofence in meters.
   *
   * These values are only committed to the backend when the admin clicks
   * the "Save Zone" button at the bottom.
   */
  const [center, setCenter] = useState<[number, number]>(initialCenter);
  const [radius, setRadius] = useState<number>(
    user.zone_radius_m != null ? Number(user.zone_radius_m) : 200
  );

  /**
   * Geocoding / search UI state:
   * - searchQuery: text typed into the search input.
   * - searchResults: parsed results from the Nominatim API.
   * - searchLoading: true while the search request is in flight.
   * - searchError: error message shown when something goes wrong.
   */
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  /**
   * handleSearch
   * ------------
   * Called when the search form is submitted.
   *
   * Steps:
   *   1. Validate the query (ignore empty).
   *   2. Call the OpenStreetMap Nominatim API with `format=json`.
   *   3. Convert the response into a list of `SearchResult` objects.
   *   4. Store up to 8 of them in local state.
   *   5. If we have at least one result:
   *        - Move the map center to the first result.
   *      Otherwise:
   *        - Show a "No results" message.
   *
   * NOTE:
   * - This runs purely on the client (inside the browser).
   * - Nominatim usage policies apply if this is used in production.
   */
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    const q = searchQuery.trim();
    if (!q) return;

    setSearchLoading(true);
    setSearchError("");
    setSearchResults([]);

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        q
      )}`;

      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!res.ok) throw new Error("Geocoding failed");

      interface NominatimResponseItem {
        display_name: string;
        lat: string;
        lon: string;
      }

      const data = (await res.json()) as NominatimResponseItem[];

      const results: SearchResult[] = data.slice(0, 8).map((item) => ({
        displayName: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
      }));

      if (results.length === 0) {
        setSearchError("No results found for that query.");
      } else {
        setSearchResults(results);

        // Optionally center the map on the first result immediately
        const first = results[0];
        setCenter([first.lat, first.lon]);
      }
    } catch (err) {
      console.error(err);
      setSearchError("Failed to search location.");
    } finally {
      setSearchLoading(false);
    }
  }

  /**
   * handleSelectResult
   * ------------------
   * When the admin clicks one of the search results in the list,
   * we simply move the map center to that result's coordinates.
   */
  function handleSelectResult(result: SearchResult) {
    setCenter([result.lat, result.lon]);
  }

  /**
   * handleSave
   * ----------
   * Invoked when the admin clicks the "Save Zone" button.
   *
   * - Delegates persistence to the parent via `onSave`.
   * - Passes:
   *     - user.id (so the parent knows which user to update),
   *     - current center latitude,
   *     - current center longitude,
   *     - current radius in meters.
   *
   * The parent component (e.g. DashboardPage) is responsible for
   * calling the `/api/users/[id]` endpoint and refreshing user data.
   */
  function handleSave() {
    onSave(user.id, center[0], center[1], radius);
  }

  /* ------------------------------------------------------------------
   * Render
   * ------------------------------------------------------------------ */
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl p-4 md:p-6">
        {/* Modal header: title + close button */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">
            Assign zone for{" "}
            <span className="text-blue-400">{user.username}</span>
          </h3>
          <button
            onClick={onClose}
            className="text-sm px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700"
          >
            Close
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-2">
          Search for a place or click on the map to set the center. Adjust the
          radius slider below.
        </p>

        {/* Search form (query + button) */}
        <form
          onSubmit={handleSearch}
          className="flex flex-col md:flex-row gap-2 mb-2"
        >
          <input
            type="text"
            placeholder="Search location (city, street, place...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={searchLoading}
            className="md:w-auto w-full rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium px-4 py-2 disabled:opacity-60"
          >
            {searchLoading ? "Searching..." : "Search"}
          </button>
        </form>

        {/* Search error (if any) */}
        {searchError && (
          <p className="text-xs text-red-400 mb-2">{searchError}</p>
        )}

        {/* Search results list (click to move map center) */}
        {searchResults.length > 0 && (
          <div className="mb-3 max-h-28 overflow-y-auto text-xs space-y-1">
            {searchResults.map((r, idx) => (
              <button
                key={`${r.lat}-${r.lon}-${idx}`}
                type="button"
                onClick={() => handleSelectResult(r)}
                className="w-full text-left rounded-lg bg-slate-800/80 hover:bg-slate-700/80 px-2 py-1"
              >
                {r.displayName}
              </button>
            ))}
          </div>
        )}

        {/* Map area (Leaflet) */}
        <div className="h-72 md:h-80 mb-4 rounded-xl overflow-hidden border border-slate-700">
          <MapContainer
            center={center as LatLngExpression}
            zoom={14}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              // Single-domain tile URL to avoid dev warnings in Next.js
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            {/* Listen to map clicks to update center */}
            <ClickHandler setCenter={(lat, lng) => setCenter([lat, lng])} />

            {/* Marker at the zone center */}
            <Marker position={center as LatLngExpression} />

            {/* Circle representing the zone radius in meters */}
            <Circle center={center as LatLngExpression} radius={radius} />
          </MapContainer>
        </div>

        {/* Radius controls + current coordinates + save button */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Radius slider */}
          <div className="flex-1">
            <label className="block text-xs text-slate-300 mb-1">
              Radius (meters): {radius}
            </label>
            <input
              type="range"
              min={50}
              max={1000}
              step={10}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Current center coordinates summary */}
          <div className="text-xs text-slate-400">
            <div>
              Lat:{" "}
              <span className="text-slate-200">{center[0].toFixed(5)}</span>
            </div>
            <div>
              Lng:{" "}
              <span className="text-slate-200">{center[1].toFixed(5)}</span>
            </div>
          </div>

          {/* Save button → delegates to parent via onSave */}
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium"
          >
            Save Zone
          </button>
        </div>
      </div>
    </div>
  );
}
