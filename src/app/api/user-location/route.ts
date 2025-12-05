// src/app/api/user-location/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

/**
 * Runtime configuration
 * ---------------------
 * Force this API route to use the **Node.js runtime**.
 *
 * Why:
 * - The `mysql2` driver depends on Node.js core modules (net, tls, etc.)
 *   that are not available in the Edge runtime.
 * - Keeping all DB-backed routes on the same runtime avoids subtle bugs.
 */
export const runtime = "nodejs";

/**
 * RoleRow
 * -------
 * Minimal shape for querying a user's role.
 *
 * We only select the `role` column from the `users` table:
 *   - "admin" → admin users (not tracked by this endpoint)
 *   - "user"  → normal tracked users
 */
interface RoleRow extends RowDataPacket {
  role: "admin" | "user";
}

/**
 * LocationRow
 * -----------
 * Minimal shape for querying the last known `inside_zone` state
 * from the `user_locations` table.
 *
 * - inside_zone:
 *     - 1   → user was inside their assigned zone on last update
 *     - 0   → user was outside their assigned zone on last update
 *     - NULL → no known zone status yet (first time, or no zone assigned)
 */
interface LocationRow extends RowDataPacket {
  inside_zone: number | null;
}

/**
 * POST /api/user-location
 * -----------------------
 * Endpoint used by the **Flutter mobile app** to report the user's
 * current position and zone status.
 *
 * Expected JSON request body:
 *   {
 *     "userId": number,            // required - ID of the user in `users` table
 *     "latitude": number,          // required - current latitude
 *     "longitude": number,         // required - current longitude
 *     "insideZone": boolean|null   // optional:
 *                                  //   true  => user is inside their zone
 *                                  //   false => user is outside their zone
 *                                  //   null/undefined => no zone / no info
 *   }
 *
 * High-level behavior:
 *   1. Validate required fields (`userId`, `latitude`, `longitude`).
 *   2. Check the user's role:
 *        - If the user does not exist → 404.
 *        - If the user is an admin → do not track, but respond { success: true }.
 *   3. Upsert the latest location into `user_locations`:
 *        - `user_id`, `latitude`, `longitude`, `inside_zone`.
 *        - If row exists → update it.
 *        - If row doesn't exist → insert it.
 *   4. If `insideZone` is provided and the inside/outside state changed
 *      compared to the previous value (`inside_zone`), automatically create
 *      a new row in the `alerts` table:
 *        - `alert_type = "enter"` if we moved from outside → inside.
 *        - `alert_type = "exit"`  if we moved from inside → outside.
 *        - Save the current latitude / longitude with the alert.
 *
 * This route is intentionally **unauthenticated** in this project:
 * - The mobile app can call it directly.
 * - If you deploy publicly, you should add proper authentication
 *   (e.g. per-device tokens, per-user keys, or JWT).
 */
export async function POST(req: NextRequest) {
  try {
    // Parse and type-narrow the JSON body into a small, explicit shape.
    const { userId, latitude, longitude, insideZone } = (await req.json()) as {
      userId?: number;
      latitude?: number;
      longitude?: number;
      insideZone?: boolean | null;
    };

    // ----------------------------------------------------------
    // 1) Basic validation: userId, latitude, and longitude are required
    // ----------------------------------------------------------
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

    // ----------------------------------------------------------
    // 2) Read the user role and ignore admins
    // ----------------------------------------------------------
    const [roleRows] = await db.query<RoleRow[]>(
      "SELECT role FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    // If there's no row in `users`, the mobile app is sending an unknown userId.
    if (roleRows.length === 0) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const userRole = roleRows[0].role;

    // Admin users are never tracked by location:
    // - We don't write anything into `user_locations`.
    // - We don't generate alerts for them.
    if (userRole === "admin") {
      // We still return success so the client doesn't treat it as an error,
      // but mark it explicitly as `ignored: true` for debugging if needed.
      return NextResponse.json({ success: true, ignored: true });
    }

    // ----------------------------------------------------------
    // 3) Fetch previous inside_zone state (if any)
    // ----------------------------------------------------------
    const [locRows] = await db.query<LocationRow[]>(
      "SELECT inside_zone FROM user_locations WHERE user_id = ? LIMIT 1",
      [userId]
    );

    // `prevInside`:
    //   - 1   => previously inside
    //   - 0   => previously outside
    //   - null => no previous state (first time / unknown)
    const prevInside: number | null = locRows.length
      ? locRows[0].inside_zone
      : null;

    // `insideZone` can be:
    //   - true / false   => we have zone information from the client
    //   - null/undefined => we don't have a zone status right now
    const hasZoneInfo = insideZone !== null && insideZone !== undefined;

    // For DB storage, we map:
    //   insideZone === true  => 1
    //   insideZone === false => 0
    // Note: we only actually use this value when `hasZoneInfo` is true.
    const insideVal = insideZone === true ? 1 : 0;

    // ----------------------------------------------------------
    // 4) Upsert the latest location + inside_zone into user_locations
    // ----------------------------------------------------------
    //
    // Table expectation:
    //   - `user_locations` has a unique index/PK on `user_id`.
    //     Example schema:
    //       CREATE TABLE user_locations (
    //         user_id    INT UNSIGNED PRIMARY KEY,
    //         latitude   DOUBLE,
    //         longitude  DOUBLE,
    //         inside_zone TINYINT(1) NULL,
    //         updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    //                                 ON UPDATE CURRENT_TIMESTAMP
    //       );
    //
    // Behavior:
    //   - If there's no row for user_id → INSERT.
    //   - If a row already exists      → UPDATE that row with latest data.
    //
    await db.query<ResultSetHeader>(
      `
        INSERT INTO user_locations (user_id, latitude, longitude, inside_zone)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          latitude   = VALUES(latitude),
          longitude  = VALUES(longitude),
          inside_zone = VALUES(inside_zone),
          updated_at  = CURRENT_TIMESTAMP
      `,
      [
        userId,
        latitude,
        longitude,
        hasZoneInfo ? insideVal : null, // no zone info → we explicitly store NULL
      ]
    );

    // ----------------------------------------------------------
    // 5) Auto-create an alert if we detect a zone-transition
    // ----------------------------------------------------------
    //
    // Conditions for creating an alert:
    //   - We have zone information in this request (hasZoneInfo === true).
    //   - We have a previous inside_zone value (prevInside !== null).
    //   - The new state != previous state (i.e., outside → inside OR inside → outside).
    //
    // This avoids creating an alert for the very first location update,
    // where we don't yet know if the user "entered" or "exited" anything.
    //
    if (
      hasZoneInfo &&
      prevInside !== null &&
      prevInside !== insideVal // state changed → transition detected
    ) {
      // Map numeric state back to the business event:
      //   1 => "enter"  (now inside)
      //   0 => "exit"   (now outside)
      const alertType = insideVal === 1 ? "enter" : "exit";

      await db.query<ResultSetHeader>(
        `
          INSERT INTO alerts (user_id, alert_type, latitude, longitude)
          VALUES (?, ?, ?, ?)
        `,
        [userId, alertType, latitude, longitude]
      );
    }

    // ----------------------------------------------------------
    // 6) Response
    // ----------------------------------------------------------
    return NextResponse.json({ success: true });
  } catch (err) {
    // Any uncaught error in DB or parsing will end up here.
    console.error("POST /api/user-location error:", err);

    return NextResponse.json(
      { message: "Error updating location" },
      { status: 500 }
    );
  }
}
