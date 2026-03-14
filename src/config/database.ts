// ═══════════════════════════════════════════════════════════════════
//  MySQL Connection Pool
//  Shared across all DAL modules. Handles retries and health checks.
// ═══════════════════════════════════════════════════════════════════

import mysql, { Pool, PoolConnection } from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const config = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "linguablob",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "linguablob",
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_MAX || "10", 10),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  charset: "utf8mb4",
  timezone: "+00:00",
};

export const pool: Pool = mysql.createPool(config);

/**
 * Health check — returns true if the DB is reachable.
 * Used by Docker health checks and the /health endpoint.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.ping();
      return true;
    } finally {
      conn.release();
    }
  } catch {
    return false;
  }
}

/**
 * Get a connection with automatic retry (up to 3 attempts).
 * Useful during startup when MySQL may still be booting.
 */
export async function getConnectionWithRetry(
  maxRetries = 3,
  delayMs = 2000
): Promise<PoolConnection> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await pool.getConnection();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.warn(
        `DB connection attempt ${attempt}/${maxRetries} failed, retrying in ${delayMs}ms...`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Unreachable");
}

/**
 * Run a function inside a transaction.
 * Automatically commits on success, rolls back on error.
 */
export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Graceful shutdown — close all pool connections.
 */
export async function closePool(): Promise<void> {
  await pool.end();
}
