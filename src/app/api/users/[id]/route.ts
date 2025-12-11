// src/app/api/users/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";

export const runtime = "nodejs";

interface UserRow {
  id: number;
  username: string;
  role: "admin" | "user";
  zone_center_lat: number | null;
  zone_center_lng: number | null;
  zone_radius_m: number | null;
}

type RouteParams = { params: Promise<{ id: string }> };

/* ─────────────────────────────────────────────
 * GET /api/users/[id]
 * ──────────────────────────────────────────── */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = Number(id);

    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ message: "Invalid user id" }, { status: 400 });
    }

    const db = getDB();
    const result = await db.query<UserRow>(
      `
        SELECT
          id,
          username,
          role,
          zone_center_lat,
          zone_center_lng,
          zone_radius_m
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );

    if (!result.rowCount || result.rowCount === 0) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const u = result.rows[0];

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
    console.error("GET /api/users/[id] error:", err);
    return NextResponse.json(
      { message: "Error fetching user" },
      { status: 500 }
    );
  }
}

/* ─────────────────────────────────────────────
 * PUT /api/users/[id]
 * ──────────────────────────────────────────── */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const body = (await req.json()) as {
      zone_center_lat?: number | null;
      zone_center_lng?: number | null;
      zone_radius_m?: number | null;
    };

    const { id } = await params;
    const userId = Number(id);

    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ message: "Invalid user id" }, { status: 400 });
    }

    const fields: string[] = [];
    const values: Array<number | null> = [];
    let idx = 1;

    if (body.zone_center_lat !== undefined) {
      fields.push(`zone_center_lat = $${idx++}`);
      values.push(body.zone_center_lat);
    }

    if (body.zone_center_lng !== undefined) {
      fields.push(`zone_center_lng = $${idx++}`);
      values.push(body.zone_center_lng);
    }

    if (body.zone_radius_m !== undefined) {
      fields.push(`zone_radius_m = $${idx++}`);
      values.push(body.zone_radius_m);
    }

    if (fields.length === 0) {
      return NextResponse.json(
        { message: "Nothing to update" },
        { status: 400 }
      );
    }

    values.push(userId);

    const db = getDB();
    await db.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx}`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT /api/users/[id] error:", err);
    return NextResponse.json(
      { message: "Error updating user" },
      { status: 500 }
    );
  }
}

/* ─────────────────────────────────────────────
 * DELETE /api/users/[id]
 * ──────────────────────────────────────────── */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = Number(id);

    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ message: "Invalid user id" }, { status: 400 });
    }

    const db = getDB();
    await db.query("DELETE FROM users WHERE id = $1", [userId]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/users/[id] error:", err);
    return NextResponse.json(
      { message: "Error deleting user" },
      { status: 500 }
    );
  }
}
