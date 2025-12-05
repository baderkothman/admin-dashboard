// src/app/api/login/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import type { RowDataPacket } from "mysql2";
import bcrypt from "bcrypt";

/**
 * Runtime configuration
 * ---------------------
 * Tell Next.js to run this route on the Node.js runtime.
 *
 * Why:
 * - The `mysql2` driver depends on Node.js core modules (e.g. net, tls).
 * - `bcrypt` is also implemented for Node.js, not the Edge runtime.
 *
 * Without this, using mysql2 + bcrypt would fail when deployed
 * to an environment that defaults to the Edge runtime.
 */
export const runtime = "nodejs";

/**
 * AdminRow
 * --------
 * Type representing the shape of an admin row as returned by MySQL.
 *
 * Only the fields we actively use are typed here:
 * - `id`            → user primary key
 * - `username`      → admin username used to log in
 * - `password_hash` → stored password (bcrypt hash OR legacy plain text)
 * - `role`          → "admin" | "user" (only "admin" allowed to log in here)
 */
interface AdminRow extends RowDataPacket {
  id: number;
  username: string;
  password_hash: string;
  role: "admin" | "user";
}

/**
 * POST /api/login
 * ---------------
 * Authenticates an admin user.
 *
 * This endpoint is used exclusively by the admin dashboard login page:
 *   - Frontend: `src/app/page.tsx`
 *
 * Request body (JSON):
 *   {
 *     "username": string,
 *     "password": string
 *   }
 *
 * Workflow:
 *   1. Parse and validate `username` and `password`.
 *   2. Look up the user in the `users` table where:
 *        - `username = ?`
 *        - `role = 'admin'`
 *   3. Compare the provided password against the stored value:
 *        - If the stored value looks like a bcrypt hash:
 *            → use `bcrypt.compare(...)`
 *        - Otherwise:
 *            → treat it as legacy plain-text
 *            → compare directly
 *            → if it matches, migrate to bcrypt by hashing and updating
 *              the `password_hash` column.
 *   4. If credentials are valid:
 *        - Respond with `{ success: true }`
 *        - No cookies or server-side sessions are set.
 *   5. If invalid:
 *        - Respond with `{ success: false, message: "..." }` and a 4xx status.
 *
 * Security model (current project state):
 *   - This route does NOT set any session/cookie.
 *   - The client, on success, sets `localStorage.adminAuth = "true"`.
 *   - Access to `/dashboard` is guarded only on the client side.
 *   - For real production use, you should replace this with
 *     a proper authentication/session mechanism.
 */
export async function POST(req: NextRequest) {
  try {
    /**
     * Parse the JSON body sent by the client.
     * We allow `username` and `password` to be optional at the type level,
     * then validate them explicitly below.
     */
    const { username, password } = (await req.json()) as {
      username?: string;
      password?: string;
    };

    // Ensure both fields are present.
    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: "Missing credentials" },
        { status: 400 }
      );
    }

    // Trim whitespace from both ends to avoid accidental leading/trailing spaces.
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    /**
     * Simple length sanity check.
     *
     * - `username.length < 3` : likely not a valid admin user.
     * - `password.length < 4` : too short to be considered safe or real.
     *
     * We return a generic "Invalid username or password" so we don't leak
     * which field was incorrect.
     */
    if (trimmedUsername.length < 3 || trimmedPassword.length < 4) {
      return NextResponse.json(
        { success: false, message: "Invalid username or password" },
        { status: 400 }
      );
    }

    // Acquire a MySQL connection from our shared DB utility.
    const db = getDB();

    /**
     * Fetch the admin row.
     *
     * - We only allow login for records where `role = 'admin'`.
     * - We limit to a single row.
     *
     * SQL:
     *   SELECT * FROM users
     *   WHERE username = ? AND role = 'admin'
     *   LIMIT 1
     */
    const [rows] = await db.query<AdminRow[]>(
      "SELECT * FROM users WHERE username = ? AND role = 'admin' LIMIT 1",
      [trimmedUsername]
    );

    // If no matching admin user is found, return a generic error.
    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Invalid username or password" },
        { status: 401 }
      );
    }

    // The admin record retrieved from the database.
    const admin = rows[0];

    // The stored value in `password_hash` can be:
    //   - a bcrypt hash (new style)
    //   - a plain-text password (legacy style)
    const stored = admin.password_hash || "";

    // Will be set to true if the credentials are valid.
    let ok = false;

    /**
     * Heuristic to detect if the stored value is a bcrypt hash.
     *
     * Bcrypt hashes typically start with:
     *   - "$2a$"
     *   - "$2b$"
     *   - "$2y$"
     *
     * If it doesn't match any of these prefixes,
     * we treat it as a legacy plain-text password.
     */
    const looksHashed =
      stored.startsWith("$2a$") ||
      stored.startsWith("$2b$") ||
      stored.startsWith("$2y$");

    if (!looksHashed) {
      /**
       * LEGACY PATH:
       * ------------
       * The database contains a plain-text password in `password_hash`.
       * We compare the provided password directly.
       *
       * If it matches:
       *   - Consider the login successful.
       *   - Immediately migrate the password to a bcrypt hash
       *     to improve security for future logins.
       */
      if (stored === trimmedPassword) {
        ok = true;

        try {
          // Generate a bcrypt hash with 12 salt rounds.
          const newHash = await bcrypt.hash(trimmedPassword, 12);

          // Update the existing user row with the secure hash.
          await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [
            newHash,
            admin.id,
          ]);

          // Server-side log (useful to know migration happened).
          console.log(
            "Migrated admin password to bcrypt for user id",
            admin.id
          );
        } catch (mErr) {
          // Migration failure should NOT block the login,
          // but we log it for debugging.
          console.error("Failed to migrate admin password hash", mErr);
        }
      } else {
        // Plain-text value didn't match the provided password.
        ok = false;
      }
    } else {
      /**
       * NORMAL PATH:
       * ------------
       * The stored value appears to be a bcrypt hash.
       * We verify the provided password using `bcrypt.compare`.
       */
      ok = await bcrypt.compare(trimmedPassword, stored);
    }

    // If the password was not verified successfully, return 401.
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Invalid username or password" },
        { status: 401 }
      );
    }

    /**
     * Success:
     * --------
     * We do NOT set cookies or sessions here.
     *
     * The client code will:
     *   - Store an "auth" flag in localStorage (e.g. adminAuth = "true").
     *   - Use that flag to protect `/dashboard` and other admin routes
     *     entirely on the client side.
     *
     * In a more advanced setup, this is where you would:
     *   - Create a server-side session.
     *   - Or issue a signed JWT.
     *   - Or set an HttpOnly cookie, etc.
     */
    return NextResponse.json({ success: true });
  } catch (err) {
    // Log the error details for debugging.
    console.error("POST /api/login error:", err);

    // Respond with a generic 500 error to the client.
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
