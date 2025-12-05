// src/app/api/alerts/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

/**
 * Use the Node.js runtime for this route.
 *
 * - Next.js supports multiple runtimes (e.g. Edge, Node.js).
 * - The `mysql2` driver depends on Node.js core modules (net, tls, etc.),
 *   which are NOT available on the Edge runtime.
 *
 * Declaring this ensures:
 *   - `getDB()` can create a MySQL connection.
 *   - All queries are executed correctly on the server.
 */
export const runtime = "nodejs";

/**
 * AlertRow
 * --------
 * Type that describes a single row returned from the `alerts` table,
 * with an extra `username` field joined from the `users` table.
 *
 * Extends `RowDataPacket` because that's what `mysql2` returns by default.
 */
interface AlertRow extends RowDataPacket {
  /** Primary key of the alert row. */
  id: number;

  /** Foreign key → ID of the user this alert belongs to. */
  user_id: number;

  /** Type of alert: user entered or exited their zone. */
  alert_type: "exit" | "enter";

  /** Timestamp when the alert occurred (server-side time). */
  occurred_at: Date;

  /**
   * Optional latitude at the time of the alert.
   * Can be `string` if MySQL column type is DECIMAL and mysql2 returns it as text.
   */
  latitude: number | string | null;

  /**
   * Optional longitude at the time of the alert.
   * Can be `string` if MySQL column type is DECIMAL and mysql2 returns it as text.
   */
  longitude: number | string | null;

  /**
   * The username of the user, joined from `users.username`.
   * Used by the dashboard to display which user triggered the alert.
   */
  username: string;
}

/**
 * GET /api/alerts
 * ---------------
 * Fetches alerts for the admin dashboard and logs page.
 *
 * Supported query parameters:
 *   - userId? : string
 *       If present, returns alerts only for that specific user.
 *
 *   - format? : "csv" | any other string | undefined
 *       - "csv"  → returns a CSV file (for download).
 *       - other  → returns JSON array of alerts (default).
 *
 * Behavior:
 *   - Joins `alerts` with `users` to attach `username`.
 *   - Excludes admin accounts: `WHERE u.role <> 'admin'`.
 *   - Orders alerts by `occurred_at` descending (most recent first).
 *   - JSON mode:
 *       - Limits to 200 alerts for performance in the UI.
 *   - CSV mode:
 *       - No LIMIT; returns all matching alerts.
 *
 * NOTE:
 *   - There is no server-side authentication in this file
 *     (auth was removed in your project).
 *   - The current security model relies on client-side checks
 *     (e.g. localStorage flags) in the dashboard.
 *   - For a production deployment, this endpoint should be protected.
 */
export async function GET(req: NextRequest) {
  try {
    // Extract query string parameters from the requested URL.
    const { searchParams } = req.nextUrl;

    // Optional "userId" filter: only alerts for a specific user.
    const userIdParam = searchParams.get("userId");

    // Optional "format" parameter: if "csv", we return CSV; otherwise JSON.
    const format = searchParams.get("format");

    // Parameters to bind into the SQL query (for WHERE clauses).
    const params: (number | string)[] = [];

    // Acquire a MySQL connection from our helper.
    const db = getDB();

    // Base SQL:
    //   - Select all columns from alerts (a.*).
    //   - Join with users table to get the username.
    //   - Exclude admin users so that their alerts never appear in the dashboard.
    let sql = `
      SELECT a.*, u.username
      FROM alerts a
      JOIN users u ON u.id = a.user_id
      WHERE u.role <> 'admin'
    `;

    // If "userId" query param is present and valid, restrict to that user.
    if (userIdParam) {
      const userId = Number(userIdParam);
      if (!Number.isNaN(userId)) {
        sql += " AND a.user_id = ?";
        params.push(userId);
      }
    }

    // Always order results from newest to oldest.
    sql += " ORDER BY a.occurred_at DESC";

    // Limit the number of rows in JSON mode for dashboard performance.
    // CSV export is meant to be "full history", so we do NOT limit there.
    if (format !== "csv") {
      sql += " LIMIT 200";
    }

    // Execute the query with the accumulated parameters.
    const [rows] = await db.query<AlertRow[]>(sql, params);

    // ─────────────────────────────────────────────
    // CSV MODE
    // ─────────────────────────────────────────────
    if (format === "csv") {
      // Define the CSV header row (column names).
      const header =
        "id,user_id,username,alert_type,occurred_at,latitude,longitude\n";

      // Convert each row into a CSV line.
      const body = rows
        .map((r) => {
          // If lat/lng are present, cast to number; otherwise output empty string.
          const lat = r.latitude !== null ? Number(r.latitude) : "";
          const lng = r.longitude !== null ? Number(r.longitude) : "";

          // Convert the Date object to an ISO-8601 string.
          const dateStr = r.occurred_at.toISOString();

          // Escape any double quotes in username to keep CSV valid.
          const username = (r.username ?? "").replace(/"/g, '""');

          // For CSV safety, we wrap username in quotes.
          return `${r.id},${r.user_id},"${username}",${r.alert_type},${dateStr},${lat},${lng}`;
        })
        .join("\n");

      // Combine header and body into a full CSV payload.
      const csv = header + body;

      // Return CSV response with appropriate headers for file download.
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="user-alerts.csv"',
        },
      });
    }

    // ─────────────────────────────────────────────
    // JSON MODE
    // ─────────────────────────────────────────────
    // Map each row into a clean JSON object with normalized types,
    // especially making sure latitude/longitude are either number or null.
    const json = rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      username: r.username,
      alert_type: r.alert_type,
      occurred_at: r.occurred_at, // remain as Date; Next.js will serialize it to ISO string
      latitude: r.latitude !== null ? Number(r.latitude) : null,
      longitude: r.longitude !== null ? Number(r.longitude) : null,
    }));

    // Send the alerts as a JSON array.
    return NextResponse.json(json);
  } catch (err) {
    // Log the error on the server for debugging.
    console.error("GET /api/alerts error:", err);

    // Return a generic 500 response to the client.
    return NextResponse.json(
      { message: "Error fetching alerts" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/alerts
 * ----------------
 * Creates a new alert row.
 *
 * This endpoint is intended to be called by the **Flutter mobile app**
 * whenever a user enters or exits their configured geofence zone.
 *
 * Expected JSON body:
 *   {
 *     "userId": number,           // required: user ID in the database
 *     "alertType": "exit"|"enter",// required: type of event
 *     "latitude": number,         // optional: latitude at the time of event
 *     "longitude": number         // optional: longitude at the time of event
 *   }
 *
 * Behavior:
 *   - Validates `userId` (must be present and truthy).
 *   - Validates `alertType` against the allowed values ("exit" | "enter").
 *   - Inserts a new row in the `alerts` table.
 *   - Returns:
 *       { success: true, id: <insertId> } on success.
 *
 * Security:
 *   - No authentication is enforced here (for simplicity in your current setup).
 *   - If you later deploy this publicly, consider an API key or JWT-based auth.
 */
export async function POST(req: NextRequest) {
  try {
    // Parse JSON request body and destructure the four expected fields.
    const { userId, alertType, latitude, longitude } = (await req.json()) as {
      userId?: number;
      alertType?: "exit" | "enter";
      latitude?: number;
      longitude?: number;
    };

    // Validate that `userId` and `alertType` are present and non-falsy.
    // If either is missing, respond with 400 (Bad Request).
    if (!userId || !alertType) {
      return NextResponse.json(
        { message: "Missing userId or alertType" },
        { status: 400 }
      );
    }

    // Whitelist of allowed alert types.
    // Any value other than "exit" or "enter" is rejected.
    if (alertType !== "exit" && alertType !== "enter") {
      return NextResponse.json(
        { message: "Invalid alert type" },
        { status: 400 }
      );
    }

    // Get a DB connection.
    const db = getDB();

    // Insert the new alert into the database.
    // Latitude/longitude can be null if not provided.
    const [result] = await db.query<ResultSetHeader>(
      `
        INSERT INTO alerts (user_id, alert_type, latitude, longitude)
        VALUES (?, ?, ?, ?)
      `,
      [userId, alertType, latitude ?? null, longitude ?? null]
    );

    // Return success response with the id of the inserted row.
    return NextResponse.json({ success: true, id: result.insertId });
  } catch (err) {
    // Log the error on the server for troubleshooting.
    console.error("POST /api/alerts error:", err);

    // Return a generic 500 response to the client.
    return NextResponse.json(
      { message: "Error creating alert" },
      { status: 500 }
    );
  }
}
