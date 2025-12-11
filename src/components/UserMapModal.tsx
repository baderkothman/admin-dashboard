// src/components/UserMapModal.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  Marker,
  useMapEvents,
} from "react-leaflet";
import L, {
  LatLng,
  LatLngExpression,
  Map as LeafletMap,
  LeafletMouseEvent,
} from "leaflet";

interface User {
  id: number;
  username: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  zone_center_lat: number | null;
  zone_center_lng: number | null;
  zone_radius_m: number | null;
}

interface UserMapModalProps {
  user: User;
  onClose: () => void;
  onSave: (updated: User) => void;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

/* ------------------------------------------------------------------
 * Leaflet default icon
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

/**
 * Handle map click → give lat/lng back to parent.
 */
function MapClickHandler({
  onClick,
}: {
  onClick: (latLng: LatLng) => void;
}): null {
  useMapEvents({
    click(e: LeafletMouseEvent) {
      onClick(e.latlng);
    },
  });
  return null;
}

const DEFAULT_CENTER: [number, number] = [34.4367, 35.8362]; // Tripoli-ish

export default function UserMapModal({
  user,
  onClose,
  onSave,
}: UserMapModalProps) {
  const [centerLat, setCenterLat] = useState<number | null>(
    user.zone_center_lat
  );
  const [centerLng, setCenterLng] = useState<number | null>(
    user.zone_center_lng
  );
  const [radius, setRadius] = useState<number>(user.zone_radius_m ?? 300);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const mapRef = useRef<LeafletMap | null>(null);

  const initialCenter: LatLngExpression =
    centerLat != null && centerLng != null
      ? [centerLat, centerLng]
      : DEFAULT_CENTER;

  const handleMapClick = (latLng: LatLng) => {
    setCenterLat(latLng.lat);
    setCenterLng(latLng.lng);
  };

  // Keep map centered when centerLat/centerLng changes
  useEffect(() => {
    if (centerLat == null || centerLng == null) return;
    const map = mapRef.current;
    if (!map) return;
    map.setView([centerLat, centerLng], map.getZoom() || 15);
  }, [centerLat, centerLng]);

  // ─────────────────────────────────────────────
  // Search with Nominatim
  // ─────────────────────────────────────────────
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        q
      )}&limit=5`;

      const res = await fetch(url, {
        headers: { "Accept-Language": "en" },
      });

      if (!res.ok) {
        throw new Error("Search failed");
      }

      const data = (await res.json()) as SearchResult[];
      setSearchResults(data);

      if (data.length === 0) {
        setSearchError("No locations found.");
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      setSearchError("Could not search location.");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    const latNum = Number(result.lat);
    const lonNum = Number(result.lon);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return;

    setCenterLat(latNum);
    setCenterLng(lonNum);
    setSearchResults([]);

    const map = mapRef.current;
    if (map) {
      map.setView([latNum, lonNum], 16);
    }
  };

  // ─────────────────────────────────────────────
  // Save / Clear handlers
  // ─────────────────────────────────────────────
  const handleSave = async () => {
    setSaveError(null);

    if (centerLat == null || centerLng == null) {
      setSaveError("Please click on the map or choose a place from search.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        zone_center_lat: centerLat,
        zone_center_lng: centerLng,
        zone_radius_m: radius,
      };

      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Save zone error:", res.status, text);
        throw new Error("Failed to save zone");
      }

      const updatedUser: User = {
        ...user,
        zone_center_lat: centerLat,
        zone_center_lng: centerLng,
        zone_radius_m: radius,
      };

      onSave(updatedUser);
    } catch (err) {
      console.error(err);
      setSaveError("Save zone failed");
    } finally {
      setSaving(false);
    }
  };

  const handleClearZone = async () => {
    setSaveError(null);
    setSaving(true);

    try {
      const body = {
        zone_center_lat: null,
        zone_center_lng: null,
        zone_radius_m: null,
      };

      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Clear zone error:", res.status, text);
        throw new Error("Failed to clear zone");
      }

      const updatedUser: User = {
        ...user,
        zone_center_lat: null,
        zone_center_lng: null,
        zone_radius_m: null,
      };

      setCenterLat(null);
      setCenterLng(null);
      onSave(updatedUser);
    } catch (err) {
      console.error(err);
      setSaveError("Clear zone failed");
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────
  // UI (aligned with design system)
  // ─────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      {/* Modal surface uses card → shared tokens / shadows */}
      <div className="card w-full max-w-6xl h-[80vh] mx-3 md:mx-0 flex flex-col border border-slate-800">
        {/* Top bar */}
        <div className="flex items-center justify-end px-4 py-3 border-b border-slate-800">
          <button
            onClick={onClose}
            className="btn-base btn-ghost !h-9 !w-9 !p-0 rounded-full"
          >
            ✕
          </button>
        </div>

        {/* Main grid: map + search (right on desktop), controls (left) */}
        <div className="flex-1 px-4 md:px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 md:gap-6 h-full">
            {/* MAP + SEARCH – first on mobile, right on desktop */}
            <div className="order-1 md:order-2 flex flex-col h-full">
              {/* Search bar */}
              <form
                onSubmit={handleSearch}
                className="mb-3 flex items-center gap-2"
              >
                <div className="flex-1 input-shell">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for the city…"
                    className="bg-transparent outline-none text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="btn-base btn-primary text-xs whitespace-nowrap"
                >
                  {searchLoading ? "Searching…" : "Search"}
                </button>
              </form>

              {searchError && (
                <p className="mb-2 text-[11px] text-rose-400">{searchError}</p>
              )}

              {searchResults.length > 0 && (
                <div className="mb-3 max-h-32 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 text-xs">
                  {searchResults.map((r) => (
                    <button
                      key={`${r.lat}-${r.lon}-${r.display_name}`}
                      type="button"
                      onClick={() => handleSelectResult(r)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-900 transition-colors"
                    >
                      {r.display_name}
                    </button>
                  ))}
                </div>
              )}

              {/* Map container */}
              <div className="flex-1 rounded-2xl border border-slate-800 overflow-hidden">
                <div className="h-64 md:h-full">
                  <MapContainer
                    center={initialCenter}
                    zoom={14}
                    scrollWheelZoom
                    style={{ height: "100%", width: "100%" }}
                    ref={mapRef}
                  >
                    <TileLayer
                      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution="&copy; OpenStreetMap contributors"
                    />

                    {centerLat != null && centerLng != null && (
                      <>
                        <Circle
                          center={[centerLat, centerLng] as LatLngExpression}
                          radius={radius}
                        />
                        <Marker
                          position={[centerLat, centerLng] as LatLngExpression}
                        />
                      </>
                    )}

                    <MapClickHandler onClick={handleMapClick} />
                  </MapContainer>
                </div>
              </div>
            </div>

            {/* CONTROLS – second on mobile, left on desktop */}
            <div className="order-2 md:order-1 flex flex-col justify-between mt-4 md:mt-0">
              <div className="space-y-6">
                {/* Title */}
                <div>
                  <h2 className="text-lg font-semibold">
                    Assign Zone for{" "}
                    <span className="text-emerald-400">@{user.username}</span>
                  </h2>
                  {user.full_name && (
                    <p className="text-xs text-slate-400 mt-1">
                      {user.full_name}
                    </p>
                  )}
                </div>

                {/* Lat / Lng display */}
                <div className="space-y-1 text-sm">
                  <p className="text-slate-200">Latitude</p>
                  <p className="text-xs font-mono text-emerald-400">
                    {centerLat != null ? centerLat.toFixed(6) : "—"}
                  </p>

                  <p className="mt-3 text-slate-200">Longitude</p>
                  <p className="text-xs font-mono text-emerald-400">
                    {centerLng != null ? centerLng.toFixed(6) : "—"}
                  </p>
                </div>

                {/* Radius slider */}
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">Radius</p>
                  <input
                    type="range"
                    min={50}
                    max={2000}
                    step={10}
                    value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                  <p className="mt-1 text-xs text-slate-300">{radius} meters</p>
                </div>
              </div>

              {/* Save / Clear buttons & error */}
              <div className="mt-6 space-y-2">
                {saveError && (
                  <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-700 rounded-lg px-3 py-2">
                    {saveError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-base w-full bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save Zone"}
                </button>

                <button
                  type="button"
                  onClick={handleClearZone}
                  disabled={saving}
                  className="btn-base w-full bg-red-700 hover:bg-red-600 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Clear Zone
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
