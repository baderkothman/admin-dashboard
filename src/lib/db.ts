// src/lib/db.ts

import { Pool } from "pg";

let pool: Pool | null = null;

/**
 * Returns a singleton PostgreSQL connection pool.
 */
export function getDB(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    // Optional: tiny debug log (without password)
    console.log("📡 Connecting to Postgres with:", {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      database: process.env.DB_NAME,
    });
  }

  return pool;
}
