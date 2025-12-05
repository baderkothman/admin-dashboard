// src/app/api/users/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

/**
 * Runtime configuration
 * ---------------------
 * Force this route to run on the **Node.js runtime**.
 *
 * Why:
 * - The `mysql2` driver depends on Node.js core modules (net, tls, etc.)
 *   which are not available in the Edge runtime.
 * - Using the Node.js runtime ensures stable DB connectivity.
 */
export const runtime = "nodejs";

/**
 * RouteContext
 * ------------
 * Type of the second argument passed to route handlers in the
 * Next.js App Router for a dynamic segment `[id]`.
 *
 * In Next.js 15/16, `params` is a **Promise** that must be awaited
 * before you can safely read `params.id`. If you access `params.id`
 * synchronously, you get the runtime error:
 *
 *   "Route used `params.id`. `params` is a Promise and must be unwrapped
 *    with `await` or `React.use()` before accessing its properties."
 *
 * We model that here explicitly:
 *   - context.params is a Promise that resolves to `{ id: string }`.
 */
type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * UserRow
 * -------
 * Minimal shape of a row from the `users` table as used by this route.
 *
 * Fields:
 *   - id:              Primary key of the user in `users`.
 *   - username:        Unique username for display.
 *   - role:            "admin" | "user".
 *   - zone_center_lat: Latitude of the assigned geofence center (nullable).
 *   - zone_center_lng: Longitude of the assigned geofence center (nullable).
 *   - zone_radius_m:   Radius of the geofence in meters (nullable).
 *
 * Note:
 *   We ignore other user columns here (email, phone, etc.) because this
 *   endpoint only needs basic identity + zone configuration.
 */
interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  role: "admin" | "user";
  zone_center_lat: number | string | null;
  zone_center_lng: number | string | null;
  zone_radius_m: number | string | null;
}

/**
 * GET /api/users/[id]
 * -------------------
 * Purpose:
 *   Used by the **Flutter mobile app** to refresh the assigned geofence zone
 *   for a specific user.
 *
 * Security model:
 *   - There is **no server-side authentication** here, by design.
 *   - The mobile client can call this endpoint directly with a user id.
 *   - If you deploy to a public environment, you should protect this route
 *     (for example by requiring an API key or a signed token).
 *
 * Request:
 *   - Path parameter:
 *       /api/users/:id
 *       where `:id` is a positive integer user id.
 *
 * Response (200 OK example):
 *   {
 *     "id": 3,
 *     "username": "john",
 *     "role": "user",
 *     "zone_center_lat": 34.1234 | null,
 *     "zone_center_lng": 35.5678 | null,
 *     "zone_radius_m": 150 | null
 *   }
 *
 * Error responses:
 *   - 400: { message: "Invalid user id" }
 *   - 404: { message: "User not found" }
 *   - 500: { message: "Error fetching user" }
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    // --------------------------------------------------------------
    // 1) Read and validate the dynamic `id` parameter
    // --------------------------------------------------------------
    //
    // In Next.js 15/16, `context.params` is a Promise, so we must:
    //   - await it
    //   - then extract `id`
    //
    const { id: idStr } = await context.params;
    const id = Number(idStr);

    // Valid user ids must be a finite positive integer
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ message: "Invalid user id" }, { status: 400 });
    }

    // --------------------------------------------------------------
    // 2) Query the database for this user (basic + zone fields)
    // --------------------------------------------------------------
    const db = getDB();
    const [rows] = await db.query<UserRow[]>(
      `
        SELECT
          id,
          username,
          role,
          zone_center_lat,
          zone_center_lng,
          zone_radius_m
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [id]
    );

    // No row found → user does not exist
    if (rows.length === 0) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const u = rows[0];

    // --------------------------------------------------------------
    // 3) Normalize numeric fields and return a clean JSON payload
    // --------------------------------------------------------------
    //
    // We cast numeric-like values to real numbers, or `null` if absent,
    // so the Flutter app does not have to deal with strings.
    //
    return NextResponse.json({
      id: u.id,
      username: u.username,
      role: u.role,
      zone_center_lat:
        u.zone_center_lat !== null ? Number(u.zone_center_lat) : null,
      zone_center_lng:
        u.zone_center_lng !== null ? Number(u.zone_center_lng) : null,
      zone_radius_m: u.zone_radius_m !== null ? Number(u.zone_radius_m) : null,
    });
  } catch (err) {
    // Any unexpected error (DB connectivity, etc.) ends up here.
    console.error("GET /api/users/[id] error:", err);
    return NextResponse.json(
      { message: "Error fetching user" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/[id]
 * -------------------
 * Purpose:
 *   Used by the **admin dashboard** to update ONLY the geofence zone
 *   for a given user.
 *
 * It does not modify:
 *   - username
 *   - password
 *   - role
 *   - contact info
 *
 * Request:
 *   - Path parameter:
 *       /api/users/:id
 *
 *   - JSON body (all fields optional, but at least one must be present):
 *       {
 *         "zone_center_lat"?: number | null,
 *         "zone_center_lng"?: number | null,
 *         "zone_radius_m"?: number | null
 *       }
 *
 * Behavior:
 *   - Validates the `id` path param.
 *   - Reads the JSON body and builds a dynamic UPDATE statement that only
 *     touches the fields that are present in the body.
 *   - If the body does not include any of the zone fields:
 *       → returns 400 with "Nothing to update".
 *
 * Notes:
 *   - There is currently **no server-side auth** on this route.
 *   - It assumes the dashboard is used in a safe/internal environment.
 *   - For a public deployment, you should protect this route properly.
 */
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    // --------------------------------------------------------------
    // 1) Parse request body (may contain any subset of zone fields)
    // --------------------------------------------------------------
    const body = (await req.json()) as {
      zone_center_lat?: number | null;
      zone_center_lng?: number | null;
      zone_radius_m?: number | null;
    };

    // --------------------------------------------------------------
    // 2) Read and validate the dynamic `id` parameter
    // --------------------------------------------------------------
    const { id: idStr } = await context.params;
    const id = Number(idStr);

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ message: "Invalid user id" }, { status: 400 });
    }

    // --------------------------------------------------------------
    // 3) Build a partial UPDATE statement based on provided fields
    // --------------------------------------------------------------
    //
    // We only update the columns that are explicitly present in `body`.
    // For each field:
    //   - If it is `undefined` → ignore it (do not touch the column).
    //   - If it is `null` or a number → include it as `= ?`.
    //
    const fields: string[] = [];
    const values: Array<number | null> = [];

    if (body.zone_center_lat !== undefined) {
      fields.push("zone_center_lat = ?");
      values.push(body.zone_center_lat);
    }

    if (body.zone_center_lng !== undefined) {
      fields.push("zone_center_lng = ?");
      values.push(body.zone_center_lng);
    }

    if (body.zone_radius_m !== undefined) {
      fields.push("zone_radius_m = ?");
      values.push(body.zone_radius_m);
    }

    // If nothing was provided in the body, we cannot perform a meaningful update.
    if (fields.length === 0) {
      return NextResponse.json(
        { message: "Nothing to update" },
        { status: 400 }
      );
    }

    // Append the user id as the last parameter for the WHERE clause.
    values.push(id);

    // --------------------------------------------------------------
    // 4) Execute the UPDATE in the database
    // --------------------------------------------------------------
    const db = getDB();
    await db.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    // --------------------------------------------------------------
    // 5) Return success response
    // --------------------------------------------------------------
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT /api/users/[id] error:", err);
    return NextResponse.json(
      { message: "Error updating user" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/[id]
 * ----------------------
 * Purpose:
 *   Used by the **admin dashboard** to permanently remove a user.
 *
 * Behavior:
 *   - Validates the `id` path parameter.
 *   - Issues `DELETE FROM users WHERE id = ?`.
 *   - Returns `{ success: true }` on success.
 *
 * Important notes:
 *   - There is currently **no server-side authorization** on this route.
 *   - You should only expose it in a trusted/local environment.
 *   - For a real production system, you should:
 *       - Protect this route (auth + authorization checks).
 *       - Potentially perform soft-deletes instead of hard-deletes
 *         (e.g. mark users as `deleted_at` instead of removing them).
 */
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    // --------------------------------------------------------------
    // 1) Read and validate the dynamic `id` parameter
    // --------------------------------------------------------------
    const { id: idStr } = await context.params;
    const id = Number(idStr);

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ message: "Invalid user id" }, { status: 400 });
    }

    // --------------------------------------------------------------
    // 2) Delete the user row from the database
    // --------------------------------------------------------------
    const db = getDB();
    await db.query("DELETE FROM users WHERE id = ?", [id]);

    // --------------------------------------------------------------
    // 3) Respond with success
    // --------------------------------------------------------------
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/users/[id] error:", err);
    return NextResponse.json(
      { message: "Error deleting user" },
      { status: 500 }
    );
  }
}
