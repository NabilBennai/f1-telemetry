import mysql from "mysql2/promise";

export function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "f1",
    password: process.env.DB_PASSWORD || "f1",
    database: process.env.DB_NAME || "f1_telemetry",
    waitForConnections: true,
    connectionLimit: 10,
  });
}
