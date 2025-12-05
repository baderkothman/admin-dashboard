// src/app/api/user-login/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import type { RowDataPacket } from "mysql2";
import bcrypt from "bcrypt";

/**
 * Runtime configuration
 * ---------------------
 * Force this route to run on the **Node.js runtime**.
 *
 * Why:
 * - The `mysql2` driver relies on Node.js core modules (net, tls, etc.),
 *   which are not available in the Edge runtime.
 * - `bcrypt` also expects a full Node.js environment.
 */
export const runtime = "nodejs";

/**
 * UserRow
 * -------
 * Minimal shape of a row from the `users` table used by this endpoint.
 *
 * Fields:
 *   - id:              Primary key of the user.
 *   - username:        Unique username used to log in.
 *   - password_hash:   Either:
 *                        - legacy plain-text password, OR
 *                        - a bcrypt hash (starts with "$2a$"/"$2b$"/"$2y$").
 *   - role:            "admin" or "user".
 *                      This endpoint only allows "user".
 *   - zone_center_lat: Assigned geofence center latitude (nullable).
 *   - zone_center_lng: Assigned geofence center longitude (nullable).
 *   - zone_radius_m:   Assigned geofence radius in meters (nullable).
 *   - created_at:      When the user row was created.
 *
 * We intentionally ignore other columns (email, phone, etc.) here.
 */
interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  password_hash: string;
  role: "admin" | "user";
  zone_center_lat: number | string | null;
  zone_center_lng: number | string | null;
  zone_radius_m: number | string | null;
  created_at: Date;
}

/**
 * Simple in-memory rate limiting
 * ------------------------------
 * We use a per-process Map to track login attempts.
 * The key is a combination of IP address + username.
 *
 * This is sufficient for:
 *   - Local development.
 *   - Small internal deployments.
 *
 * It is NOT suitable for:
 *   - Multi-instance / horizontally scaled deployments.
 *   - Long-term distributed rate limiting.
 */
type AttemptInfo = { count: number; lastAttempt: number };

/**
 * loginAttempts
 * -------------
 * Map from `rateKey` → number of attempts in the current window.
 *
 * rateKey format:
 *   "user:<ip>:<username>"
 */
const loginAttempts = new Map<string, AttemptInfo>();

/**
 * MAX_ATTEMPTS
 * ------------
 * Maximum allowed attempts for a single rateKey within WINDOW_MS.
 */
const MAX_ATTEMPTS = 10;

/**
 * WINDOW_MS
 * ---------
 * Time window for rate limiting (in milliseconds).
 * Here: 10 minutes.
 */
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * isRateLimited
 * -------------
 * Checks and updates the rate limit state for a given key.
 *
 * Parameters:
 *   - key: a string that uniquely identifies a "bucket" of attempts
 *          (here we use IP+username).
 *
 * Behavior:
 *   - If there is no previous entry for `key`:
 *       → create an entry with count=1 and return `false`.
 *   - If the last attempt was older than WINDOW_MS:
 *       → reset count to 1 and return `false`.
 *   - Otherwise:
 *       → increment count and return `true` if count exceeds MAX_ATTEMPTS.
 */
function isRateLimited(key: string) {
  const now = Date.now();
  const info = loginAttempts.get(key);

  // First ever attempt for this key
  if (!info) {
    loginAttempts.set(key, { count: 1, lastAttempt: now });
    return false;
  }

  // Existing entry, but the time window has expired → reset
  if (now - info.lastAttempt > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, lastAttempt: now });
    return false;
  }

  // Still inside the time window → increment and check threshold
  info.count += 1;
  info.lastAttempt = now;
  loginAttempts.set(key, info);

  return info.count > MAX_ATTEMPTS;
}

/**
 * POST /api/user-login
 * --------------------
 * Login endpoint for **normal users** (role = 'user'), used by the
 * Flutter mobile app.
 *
 * Request body (JSON):
 *   {
 *     "username": string,
 *     "password": string
 *   }
 *
 * Responsibilities:
 *   1. Validate presence and minimal length of username/password.
 *   2. Apply a simple in-memory rate limit by IP + username.
 *   3. Look up a user with `role = 'user'` and given username.
 *   4. Validate the password:
 *        - If `password_hash` is plain-text and matches → migrate to bcrypt.
 *        - Else treat `password_hash` as a bcrypt hash and use `bcrypt.compare`.
 *   5. On success, return a minimal `user` object:
 *        {
 *          id, username, role,
 *          zone_center_lat, zone_center_lng, zone_radius_m
 *        }
 *   6. On failure, return `{ success: false, message: "..." }` with
 *      an appropriate HTTP status code.
 *
 * Security notes:
 *   - This endpoint does NOT set cookies or server-side sessions.
 *   - The mobile app is expected to store any tokens/flags on its side.
 */
export async function POST(req: NextRequest) {
  try {
    // --------------------------------------------------------------
    // 1) Parse request body and validate presence of credentials
    // --------------------------------------------------------------
    const { username, password } = (await req.json()) as {
      username?: string;
      password?: string;
    };

    // Both username and password must exist
    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: "Missing credentials" },
        { status: 400 }
      );
    }

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    // Small sanity check to avoid useless DB lookups for obviously bad input
    if (trimmedUsername.length < 3 || trimmedPassword.length < 4) {
      return NextResponse.json(
        { success: false, message: "Invalid username or password" },
        { status: 400 }
      );
    }

    // --------------------------------------------------------------
    // 2) Rate limiting (IP + username)
    // --------------------------------------------------------------
    // We read the client IP from `x-forwarded-for` (typical behind a proxy),
    // falling back to "unknown" in local/simple setups.
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    // Prefix with "user:" just to separate from other possible rate buckets
    const rateKey = `user:${ip}:${trimmedUsername}`;

    if (isRateLimited(rateKey)) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }

    const db = getDB();

    // --------------------------------------------------------------
    // 3) Fetch user row (role must be 'user')
    // --------------------------------------------------------------
    const [rows] = await db.query<UserRow[]>(
      "SELECT * FROM users WHERE username = ? AND role = 'user' LIMIT 1",
      [trimmedUsername]
    );

    // No such 'user' role with that username → generic error (no username leak)
    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Invalid username or password" },
        { status: 401 }
      );
    }

    const user = rows[0];

    // --------------------------------------------------------------
    // 4) Password verification with migration to bcrypt
    // --------------------------------------------------------------
    //
    // We support two cases:
    //   A) Legacy plain-text password stored in `password_hash`:
    //        - If stored value === provided password:
    //            → treat as valid.
    //            → hash it with bcrypt and update the row (one-time migration).
    //   B) Normal case: `password_hash` already a bcrypt hash:
    //        → use `bcrypt.compare` to verify.
    //
    let passwordMatches = false;

    // Case A: legacy plain-text match → migrate to bcrypt
    if (user.password_hash === trimmedPassword) {
      passwordMatches = true;

      // Hash the password and update the DB in the background of the request.
      const newHash = await bcrypt.hash(trimmedPassword, 12);
      await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [
        newHash,
        user.id,
      ]);
    } else {
      // Case B: treat stored value as bcrypt hash and compare
      passwordMatches = await bcrypt.compare(
        trimmedPassword,
        user.password_hash
      );
    }

    // If the password did not match (in any path) → generic auth error
    if (!passwordMatches) {
      return NextResponse.json(
        { success: false, message: "Invalid username or password" },
        { status: 401 }
      );
    }

    // --------------------------------------------------------------
    // 5) Build response payload with minimal user info
    // --------------------------------------------------------------
    //
    // The Flutter app does not need the full DB row, only:
    //   - id, username, role
    //   - zone_center_lat / zone_center_lng / zone_radius_m
    //
    // We normalize numeric-like fields to actual numbers or null.
    //
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        zone_center_lat:
          user.zone_center_lat !== null ? Number(user.zone_center_lat) : null,
        zone_center_lng:
          user.zone_center_lng !== null ? Number(user.zone_center_lng) : null,
        zone_radius_m:
          user.zone_radius_m !== null ? Number(user.zone_radius_m) : null,
      },
    });
  } catch (err) {
    // Any unexpected error (DB issues, JSON parsing, etc.) lands here.
    console.error("POST /api/user-login error:", err);

    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
