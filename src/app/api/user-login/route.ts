// src/app/api/user-login/route.ts

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
 * Minimal shape of user row for login.
 */
interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: "admin" | "user";
  zone_center_lat: number | null;
  zone_center_lng: number | null;
  zone_radius_m: number | null;
  created_at: Date;
}

/**
 * Simple in-memory rate limiting
 */
type AttemptInfo = { count: number; lastAttempt: number };

const loginAttempts = new Map<string, AttemptInfo>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const info = loginAttempts.get(key);

  if (!info) {
    loginAttempts.set(key, { count: 1, lastAttempt: now });
    return false;
  }

  if (now - info.lastAttempt > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, lastAttempt: now });
    return false;
  }

  info.count += 1;
  info.lastAttempt = now;
  loginAttempts.set(key, info);

  return info.count > MAX_ATTEMPTS;
}

/**
 * POST /api/user-login
 * --------------------
 * Login for normal users (role = 'user'), used by Flutter app.
 */
export async function POST(req: NextRequest) {
  try {
    const { username, password } = (await req.json()) as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: "Missing credentials" },
        { status: 400 }
      );
    }

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (trimmedUsername.length < 3 || trimmedPassword.length < 4) {
      return NextResponse.json(
        { success: false, message: "Invalid username or password" },
        { status: 400 }
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rateKey = `user:${ip}:${trimmedUsername}`;

    if (isRateLimited(rateKey)) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }

    const db = getDB();

    const result = await db.query<UserRow>(
      `
        SELECT
          id,
          username,
          password_hash,
          role,
          zone_center_lat,
          zone_center_lng,
          zone_radius_m,
          created_at
        FROM users
        WHERE username = $1 AND role = 'user'
        LIMIT 1
      `,
      [trimmedUsername]
    );

    if ((result.rowCount ?? 0) === 0) {
      return NextResponse.json(
        { success: false, message: "Invalid username or password" },
        { status: 401 }
      );
    }

    const user = result.rows[0];

    // Password verification + migration to bcrypt
    let passwordMatches = false;

    if (user.password_hash === trimmedPassword) {
      // Legacy plain-text
      passwordMatches = true;

      const newHash = await bcrypt.hash(trimmedPassword, 12);
      await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        newHash,
        user.id,
      ]);
    } else {
      // Bcrypt
      passwordMatches = await bcrypt.compare(
        trimmedPassword,
        user.password_hash
      );
    }

    if (!passwordMatches) {
      return NextResponse.json(
        { success: false, message: "Invalid username or password" },
        { status: 401 }
      );
    }

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
    console.error("POST /api/user-login error:", err);

    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
