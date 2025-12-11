// src/app/api/alerts/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";

/**
 * Use the Node.js runtime for this route.
 */
export const runtime = "nodejs";

/**
 * AlertRow
 * --------
 * Shape of an alert row joined with users.
 */
interface AlertRow {
  id: number;
  user_id: number;
  alert_type: "exit" | "enter";
  occurred_at: Date;
  latitude: number | string | null;
  longitude: number | string | null;
  username: string;
}

/**
 * GET /api/alerts
 * ---------------
 * Fetch alerts (optionally filtered by userId, optionally CSV).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;

    const userIdParam = searchParams.get("userId");
    const format = searchParams.get("format");

    const db = getDB();

    const params: Array<number> = [];
    let paramIndex = 1;

    let sql = `
      SELECT 
        a.id,
        a.user_id,
        a.alert_type,
        a.occurred_at,
        a.latitude,
        a.longitude,
        u.username
      FROM alerts a
      JOIN users u ON u.id = a.user_id
      WHERE u.role <> 'admin'
    `;

    if (userIdParam) {
      const userId = Number(userIdParam);
      if (!Number.isNaN(userId)) {
        sql += ` AND a.user_id = $${paramIndex++}`;
        params.push(userId);
      }
    }

    sql += " ORDER BY a.occurred_at DESC";

    if (format !== "csv") {
      sql += " LIMIT 200";
    }

    const result = await db.query<AlertRow>(sql, params);
    const rows = result.rows;

    // ─────────────────────────────────────────────
    // CSV MODE
    // ─────────────────────────────────────────────
    if (format === "csv") {
      const header =
        "id,user_id,username,alert_type,occurred_at,latitude,longitude\n";

      const body = rows
        .map((r: AlertRow) => {
          const lat = r.latitude !== null ? Number(r.latitude) : "";
          const lng = r.longitude !== null ? Number(r.longitude) : "";
          const dateStr = r.occurred_at.toISOString();
          const username = (r.username ?? "").replace(/\"/g, '""');

          return `${r.id},${r.user_id},"${username}",${r.alert_type},${dateStr},${lat},${lng}`;
        })
        .join("\n");

      const csv = header + body;

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
    const json = rows.map((r: AlertRow) => ({
      id: r.id,
      user_id: r.user_id,
      username: r.username,
      alert_type: r.alert_type,
      occurred_at: r.occurred_at,
      latitude: r.latitude !== null ? Number(r.latitude) : null,
      longitude: r.longitude !== null ? Number(r.longitude) : null,
    }));

    return NextResponse.json(json);
  } catch (err) {
    console.error("GET /api/alerts error:", err);

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
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, alertType, latitude, longitude } = (await req.json()) as {
      userId?: number;
      alertType?: "exit" | "enter";
      latitude?: number;
      longitude?: number;
    };

    if (!userId || !alertType) {
      return NextResponse.json(
        { message: "Missing userId or alertType" },
        { status: 400 }
      );
    }

    if (alertType !== "exit" && alertType !== "enter") {
      return NextResponse.json(
        { message: "Invalid alert type" },
        { status: 400 }
      );
    }

    const db = getDB();

    const result = await db.query<{ id: number }>(
      `
        INSERT INTO alerts (user_id, alert_type, latitude, longitude, occurred_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id
      `,
      [userId, alertType, latitude ?? null, longitude ?? null]
    );

    const newId = result.rows[0]?.id;

    return NextResponse.json({ success: true, id: newId });
  } catch (err) {
    console.error("POST /api/alerts error:", err);

    return NextResponse.json(
      { message: "Error creating alert" },
      { status: 500 }
    );
  }
}
