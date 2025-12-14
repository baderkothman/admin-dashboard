import { NextResponse } from "next/server";

/**
 * Runtime configuration
 * ---------------------
 * Force this route to run on the Node.js runtime.
 *
 * Why:
 * - We keep it consistent with the rest of the API layer (`alerts`, `login`, `users`, etc.)
 * - If we later add any Node-specific logic here (e.g. DB calls, session cleanup),
 *   it will already be running in the correct environment.
 */
export const runtime = "nodejs";

/**
 * POST /api/logout
 * ----------------
 * Very small endpoint that represents "logging out" from the API perspective.
 *
 * Current project behavior:
 * - There is **no server-side session** anymore (no cookies, no tokens stored
 *   on the server), so there is nothing to invalidate here.
 * - The frontend login flow is purely client-side:
 *      - On successful login, the client sets:
 *          `localStorage.setItem("adminAuth", "true")`
 *      - On logout, the client should:
 *          `localStorage.removeItem("adminAuth")`
 *        and redirect back to the login page ("/").
 *
 * Why keep this endpoint if it does "nothing"?
 * - It centralizes the logout action into a single HTTP call:
 *      `await fetch("/api/logout", { method: "POST" })`
 * - If in the future you reintroduce **real auth** (sessions, JWT blacklist,
 *   cookie cleanup, audit logging, etc.), you can implement that logic here
 *   without changing the frontend API surface.
 *
 * Response:
 * - On success: `{ success: true }` with HTTP status 200.
 * - On unhandled error: `{ success: false, message: "Server error" }`
 *   with HTTP status 500.
 */
export async function POST() {
  try {
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/logout error:", err);

    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
