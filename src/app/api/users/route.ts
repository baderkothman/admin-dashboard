// src/app/api/users/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import bcrypt from "bcrypt";

/**
 * Runtime configuration
 */
export const runtime = "nodejs";

/**
 * UserRow
 * -------
 * Shape of rows from `users` joined with `user_locations`.
 */
interface UserRow {
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
  inside_zone: boolean | null; // boolean in Postgres
  last_seen: Date | null;
}

/* ============================================================================
 * GET /api/users
 * ============================================================================
 */
export async function GET() {
  try {
    const db = getDB();

    const result = await db.query<UserRow>(
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

    const rows = result.rows;

    return NextResponse.json(
      rows.map((r: UserRow) => ({
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

export async function POST(req: NextRequest) {
  try {
    const { first_name, last_name, username, email, password } =
      (await req.json()) as {
        first_name?: string;
        last_name?: string;
        username?: string;
        email?: string;
        password?: string;
      };

    if (!first_name || !last_name || !username || !email || !password) {
      return NextResponse.json(
        {
          message:
            "First name, last name, username, email and password are required",
        },
        { status: 400 }
      );
    }

    const trimmedFirst = first_name.trim();
    const trimmedLast = last_name.trim();
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

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

    const passwordHash = await bcrypt.hash(trimmedPassword, 12);

    const db = getDB();

    // PostgreSQL: use RETURNING to get new id
    const result = await db.query<{ id: number }>(
      `
        INSERT INTO users 
          (first_name, last_name, username, email, password_hash, role)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
      [
        trimmedFirst,
        trimmedLast,
        trimmedUsername,
        trimmedEmail,
        passwordHash,
        "user",
      ]
    );

    const newId = result.rows[0]?.id;

    return NextResponse.json({
      id: newId,
      first_name: trimmedFirst,
      last_name: trimmedLast,
      username: trimmedUsername,
      email: trimmedEmail,
      role: "user",
    });
  } catch (err: unknown) {
    console.error("POST /api/users error:", err);

    // Narrow error type to something with optional `code`
    const pgErr = err as { code?: string };

    // Postgres unique violation
    const message =
      pgErr.code === "23505"
        ? "Username or email already exists"
        : "Error creating user";

    return NextResponse.json({ message }, { status: 500 });
  }
}
