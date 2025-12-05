// src/app/api/users/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import bcrypt from "bcrypt";

/**
 * Runtime configuration
 * ---------------------
 * Force this route to run on the **Node.js runtime**.
 *
 * Why this matters:
 * - The `mysql2` driver and `bcrypt` both depend on Node.js core modules
 *   (e.g. `crypto`, `net`, `tls`, etc.) which are **not** available in
 *   the Edge runtime.
 * - Using `nodejs` ensures DB access and password hashing work correctly.
 */
export const runtime = "nodejs";

/**
 * UserRow
 * -------
 * Shape of a row returned by the query that joins `users` with `user_locations`.
 *
 * Fields coming from `users`:
 *   - id:               Primary key in the `users` table.
 *   - username:         Unique username used by admin dashboard and app.
 *   - password_hash:    Hashed password (bcrypt) or legacy value.
 *   - role:             "admin" | "user".
 *   - zone_center_lat:  Latitude of the assigned geofence (nullable).
 *   - zone_center_lng:  Longitude of the assigned geofence (nullable).
 *   - zone_radius_m:    Radius of the assigned geofence in meters (nullable).
 *   - created_at:       Timestamp when the user row was created.
 *
 * Fields coming from `user_locations` (aliased in the SELECT):
 *   - last_latitude:    Latest known latitude (from user_locations.latitude).
 *   - last_longitude:   Latest known longitude (from user_locations.longitude).
 *   - inside_zone:      Latest zone state (1 = inside, 0 = outside, null = unknown).
 *   - last_seen:        Timestamp of the last location update (user_locations.updated_at).
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

  last_latitude: number | string | null;
  last_longitude: number | string | null;
  inside_zone: number | null; // 1 / 0 / null
  last_seen: Date | null;
}

/**
 * MysqlError
 * ----------
 * Narrowed type for MySQL errors, exposing the `code` property.
 *
 * Example:
 *   - "ER_DUP_ENTRY" for duplicate key (e.g. username or email already exists).
 */
type MysqlError = Error & { code?: string };

/* ============================================================================
 * GET /api/users
 * ============================================================================
 */

/**
 * GET /api/users
 * --------------
 * Purpose:
 *   Used by the **admin dashboard** to fetch the list of **non-admin** users
 *   together with their latest geolocation + zone status.
 *
 * Security model:
 *   - There is **no server-side authentication** in this route now
 *     (because `auth.ts` and middleware were removed).
 *   - Access is protected by:
 *       - UI logic (localStorage-based "adminAuth" flag),
 *       - and whatever network-level restrictions you put around this app.
 *   - If you ever deploy this externally, you should add proper auth again.
 *
 * Behavior:
 *   - Reads from:
 *       - `users` table
 *       - LEFT JOIN `user_locations` table for latest location info.
 *   - Filters out admin accounts:
 *       - `WHERE u.role <> 'admin'`
 *   - Sorts the list by `created_at` (newest users first).
 *
 * JSON response shape (example):
 *   [
 *     {
 *       "id": 1,
 *       "username": "john",
 *       "role": "user",
 *       "zone_center_lat": 34.1234 | null,
 *       "zone_center_lng": 35.5678 | null,
 *       "zone_radius_m": 150 | null,
 *       "created_at": "2025-01-01T10:00:00.000Z",
 *       "last_latitude": 34.1234 | null,
 *       "last_longitude": 35.5678 | null,
 *       "inside_zone": 1 | 0 | null,
 *       "last_seen": "2025-01-01T11:00:00.000Z" | null
 *     },
 *     ...
 *   ]
 */
export async function GET() {
  try {
    const db = getDB();

    // -----------------------------------------------------------------
    // Query:
    //   - Select all columns from `users` (u.*)
    //   - Join `user_locations` to get latest known position & zone state
    //   - Keep only non-admin users
    //   - Order by creation time (newest first)
    // -----------------------------------------------------------------
    const [rows] = await db.query<UserRow[]>(
      `
        SELECT 
          u.*,
          l.latitude  AS last_latitude,
          l.longitude AS last_longitude,
          l.inside_zone,
          l.updated_at AS last_seen
        FROM users u
        LEFT JOIN user_locations l ON l.user_id = u.id
        WHERE u.role <> 'admin'
        ORDER BY u.created_at DESC
      `
    );

    // -----------------------------------------------------------------
    // Normalize fields:
    //   - Convert numeric-like fields to real numbers or null
    //   - Return a clean JSON object that the dashboard can use directly
    // -----------------------------------------------------------------
    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        username: r.username,
        role: r.role,
        zone_center_lat:
          r.zone_center_lat !== null ? Number(r.zone_center_lat) : null,
        zone_center_lng:
          r.zone_center_lng !== null ? Number(r.zone_center_lng) : null,
        zone_radius_m:
          r.zone_radius_m !== null ? Number(r.zone_radius_m) : null,
        created_at: r.created_at,

        last_latitude:
          r.last_latitude !== null ? Number(r.last_latitude) : null,
        last_longitude:
          r.last_longitude !== null ? Number(r.last_longitude) : null,
        inside_zone: r.inside_zone,
        last_seen: r.last_seen,
      }))
    );
  } catch (err) {
    // Any unexpected error (DB failure, etc.) is logged for debugging
    console.error("GET /api/users error:", err);

    return NextResponse.json(
      { message: "Error fetching users" },
      { status: 500 }
    );
  }
}

/* ============================================================================
 * POST /api/users
 * ============================================================================
 */

/**
 * POST /api/users
 * ---------------
 * Purpose:
 *   Used by the **admin dashboard** "Create user" form to create
 *   **non-admin** users (role is forced to `"user"`).
 *
 * Request body (JSON):
 *   {
 *     "first_name": string,  // required
 *     "last_name": string,   // required
 *     "username": string,    // required, must be unique
 *     "email": string,       // required, must be unique
 *     "password": string     // required, will be hashed with bcrypt
 *   }
 *
 * Validation:
 *   - All fields must be present.
 *   - Minimal length checks:
 *       - first_name: >= 2 characters
 *       - last_name:  >= 2 characters
 *       - username:   >= 3 characters
 *       - password:   >= 4 characters
 *
 * Behavior:
 *   - Normalizes input:
 *       - trims whitespace on all string fields
 *       - lowercases the email address
 *   - Hashes the password using `bcrypt.hash(..., 12)`.
 *   - Inserts the user as `role = 'user'` (dashboard cannot create admins).
 *
 * On success (201-like behavior, but we use 200 OK):
 *   {
 *     "id": number,
 *     "first_name": string,
 *     "last_name": string,
 *     "username": string,
 *     "email": string,
 *     "role": "user"
 *   }
 *
 * On error:
 *   - Missing or invalid fields → 400 with a descriptive message.
 *   - Duplicate username or email:
 *       - MySQL error code "ER_DUP_ENTRY" is mapped to:
 *         { "message": "Username or email already exists" } (status 500).
 *   - Other DB errors:
 *       - { "message": "Error creating user" } (status 500).
 */
export async function POST(req: NextRequest) {
  try {
    // --------------------------------------------------------------
    // 1) Parse and destructure request body
    // --------------------------------------------------------------
    const { first_name, last_name, username, email, password } =
      (await req.json()) as {
        first_name?: string;
        last_name?: string;
        username?: string;
        email?: string;
        password?: string;
      };

    // --------------------------------------------------------------
    // 2) Basic presence validation
    // --------------------------------------------------------------
    if (!first_name || !last_name || !username || !email || !password) {
      return NextResponse.json(
        {
          message:
            "First name, last name, username, email and password are required",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------------------
    // 3) Normalize and sanity-check values
    // --------------------------------------------------------------
    const trimmedFirst = first_name.trim();
    const trimmedLast = last_name.trim();
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    // Minimal length checks to avoid obviously bad input
    if (
      trimmedFirst.length < 2 ||
      trimmedLast.length < 2 ||
      trimmedUsername.length < 3 ||
      trimmedPassword.length < 4
    ) {
      return NextResponse.json(
        { message: "Please provide valid user details" },
        { status: 400 }
      );
    }

    // --------------------------------------------------------------
    // 4) Hash password (bcrypt, 12 rounds)
    // --------------------------------------------------------------
    //
    // - 12 is a good balance between security and performance for
    //   a small project or internal tool.
    //
    const passwordHash = await bcrypt.hash(trimmedPassword, 12);

    // --------------------------------------------------------------
    // 5) Insert the new user as role = 'user'
    // --------------------------------------------------------------
    const db = getDB();
    const [result] = await db.query<ResultSetHeader>(
      `
        INSERT INTO users 
          (first_name, last_name, username, email, password_hash, role)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        trimmedFirst,
        trimmedLast,
        trimmedUsername,
        trimmedEmail,
        passwordHash,
        "user", // dashboard-created users are **always** non-admin
      ]
    );

    // --------------------------------------------------------------
    // 6) Return created user info (without password_hash)
    // --------------------------------------------------------------
    return NextResponse.json({
      id: result.insertId,
      first_name: trimmedFirst,
      last_name: trimmedLast,
      username: trimmedUsername,
      email: trimmedEmail,
      role: "user",
    });
  } catch (err: unknown) {
    console.error("POST /api/users error:", err);

    const code = (err as MysqlError).code;

    // Specific handling for unique constraints (username/email)
    const message =
      code === "ER_DUP_ENTRY"
        ? "Username or email already exists"
        : "Error creating user";

    return NextResponse.json({ message }, { status: 500 });
  }
}
