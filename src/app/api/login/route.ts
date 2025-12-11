import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import bcrypt from "bcrypt";

export const runtime = "nodejs";

interface AdminRow {
  id: number;
  username: string;
  password_hash: string;
  role: "admin" | "user";
}

/**
 * POST /api/login
 * Admin dashboard login (role = 'admin').
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

    const db = getDB();

    // PostgreSQL: use $1 for placeholder, and result.rows
    const result = await db.query<AdminRow>(
      `
        SELECT id, username, password_hash, role
        FROM users
        WHERE username = $1 AND role = 'admin'
        LIMIT 1
      `,
      [trimmedUsername]
    );

    const rows = result.rows;

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Invalid username or password" },
        { status: 401 }
      );
    }

    const admin = rows[0];
    const stored = admin.password_hash || "";

    let ok = false;

    // Detect if stored password looks like a bcrypt hash
    const looksHashed =
      stored.startsWith("$2a$") ||
      stored.startsWith("$2b$") ||
      stored.startsWith("$2y$");

    if (!looksHashed) {
      // LEGACY: plain-text password in DB
      if (stored === trimmedPassword) {
        ok = true;

        // Migrate to bcrypt in the background
        try {
          const newHash = await bcrypt.hash(trimmedPassword, 12);
          await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
            newHash,
            admin.id,
          ]);
          console.log(
            "Migrated admin password to bcrypt for user id",
            admin.id
          );
        } catch (mErr) {
          console.error("Failed to migrate admin password hash", mErr);
        }
      }
    } else {
      // NORMAL: stored is bcrypt hash
      ok = await bcrypt.compare(trimmedPassword, stored);
    }

    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Success – no server-side sessions; frontend handles localStorage
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/login error:", err);

    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
