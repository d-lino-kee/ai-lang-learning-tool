import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '3306', 10),
  database: process.env.DB_NAME ?? 'lingua_blob',
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
  // Keep-alive to prevent stale connections
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

export { pool };

export async function testConnection(): Promise<boolean> {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
  return true;
}
