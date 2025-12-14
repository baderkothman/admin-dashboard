import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";

/**
 * Runtime configuration
 * ---------------------
 * Force this API route to use the **Node.js runtime**.
 */
export const runtime = "nodejs";

/**
 * Minimal shapes for DB rows
 */
interface RoleRow {
  role: "admin" | "user";
}

interface LocationRow {
  inside_zone: boolean | null;
}

/**
 * POST /api/user-location
 * -----------------------
 * Endpoint used by the **Flutter mobile app** to report the user's
 * current position and zone status.
 *
 * Request JSON:
 *   {
 *     "userId": number,
 *     "latitude": number,
 *     "longitude": number,
 *     "insideZone": boolean | null
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, latitude, longitude, insideZone } = (await req.json()) as {
      userId?: number;
      latitude?: number;
      longitude?: number;
      insideZone?: boolean | null;
    };

    if (
      !userId || // 0, NaN, undefined → invalid
      typeof latitude !== "number" ||
      typeof longitude !== "number"
    ) {
      return NextResponse.json(
        { message: "Missing userId or coordinates" },
        { status: 400 }
      );
    }

    const db = getDB();

    const roleResult = await db.query<RoleRow>(
      "SELECT role FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );

    if ((roleResult.rowCount ?? 0) === 0) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const userRole = roleResult.rows[0].role;

    if (userRole === "admin") {
      return NextResponse.json({ success: true, ignored: true });
    }

    const locResult = await db.query<LocationRow>(
      "SELECT inside_zone FROM user_locations WHERE user_id = $1 LIMIT 1",
      [userId]
    );

    const hasLocationRow =
      (locResult.rowCount ?? 0) > 0 && locResult.rows.length > 0;

    const prevInside: boolean | null = hasLocationRow
      ? locResult.rows[0].inside_zone
      : null;

    const hasZoneInfo = insideZone !== null && insideZone !== undefined;
    const insideVal = insideZone === true; // boolean

    await db.query(
      `
        INSERT INTO user_locations (user_id, latitude, longitude, inside_zone, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (user_id) DO UPDATE
          SET latitude   = EXCLUDED.latitude,
              longitude  = EXCLUDED.longitude,
              inside_zone = EXCLUDED.inside_zone,
              updated_at  = NOW()
      `,
      [
        userId,
        latitude,
        longitude,
        hasZoneInfo ? insideVal : null, // null when no zone info
      ]
    );

    if (
      hasZoneInfo &&
      prevInside !== null &&
      prevInside !== insideVal // state changed
    ) {
      const alertType = insideVal ? "enter" : "exit";

      await db.query(
        `
          INSERT INTO alerts (user_id, alert_type, latitude, longitude, occurred_at)
          VALUES ($1, $2, $3, $4, NOW())
        `,
        [userId, alertType, latitude, longitude]
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/user-location error:", err);

    return NextResponse.json(
      { message: "Error updating location" },
      { status: 500 }
    );
  }
}
