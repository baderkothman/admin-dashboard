// src/lib/db.ts

/**
 * Database Pool Helper
 * --------------------
 * Central place to create and reuse a single MySQL connection pool
 * for the entire Next.js app.
 *
 * Why a shared pool?
 * - Creating a new connection on every request is slow and wasteful.
 * - `mysql2/promise` provides a `Pool` abstraction that efficiently
 *   manages a set of connections for you (connection reuse, queueing, etc.).
 *
 * How it works:
 * - `pool` is kept in a module-level variable.
 * - The first call to `getDB()` creates the pool.
 * - All subsequent calls return the same pool instance.
 *
 * Configuration:
 * - All connection details are read from environment variables:
 *     - DB_HOST
 *     - DB_USER
 *     - DB_PASSWORD
 *     - DB_NAME
 *
 * Usage (example):
 *   import { getDB } from "@/lib/db";
 *
 *   const db = getDB();
 *   const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [id]);
 */

import mysql from "mysql2/promise";

/**
 * Module-level cache for the MySQL connection pool.
 *
 * - `null` initially (before the first call to `getDB()`).
 * - Once `createPool` is called, this will hold a live `mysql.Pool` instance.
 * - Keeping it here ensures all API routes and server code share the same pool.
 */
let pool: mysql.Pool | null = null;

/**
 * getDB
 * -----
 * Returns a **singleton** instance of the MySQL connection pool.
 *
 * - If the pool does not exist yet:
 *     - Creates a new pool using `mysql.createPool(...)`.
 * - If the pool already exists:
 *     - Returns the existing instance.
 *
 * This function should be the **only** way the rest of the codebase
 * accesses the database. That keeps configuration and pooling logic
 * in one place.
 */
export function getDB(): mysql.Pool {
  // If there is no pool yet, create it once.
  if (!pool) {
    pool = mysql.createPool({
      /**
       * Basic connection credentials.
       * These values are injected via environment variables
       * (configured in `.env.local`, hosting provider UI, etc.).
       */
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,

      /**
       * Pool behavior:
       *
       * - `waitForConnections: true`
       *     When all connections are busy, new callers will wait in a queue
       *     instead of immediately throwing an error.
       *
       * - `connectionLimit: 10`
       *     Maximum number of active connections in the pool at once.
       *     You can tune this number depending on server resources
       *     and expected load.
       *
       * - `queueLimit: 0`
       *     Maximum number of queued connection requests.
       *     `0` means "no limit" (queue can grow as needed).
       */
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  // Return the shared pool instance (created above or reused).
  return pool;
}
