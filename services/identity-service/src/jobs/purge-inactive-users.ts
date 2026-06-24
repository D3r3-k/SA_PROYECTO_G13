import dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";
import { env } from "../config/env";

const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  ssl: env.db.ssl ? { rejectUnauthorized: false } : false
});

async function run(): Promise<void> {
  const thresholdInterval = `${env.inactiveThresholdDays} days`;

  console.log(`[CronJob] purge-inactive-users starting`);
  console.log(`[CronJob] threshold: ${thresholdInterval}`);

  try {
    await pool.query("SELECT 1");
    console.log(`[CronJob] database connection OK`);

    const result = await pool.query<{ fn_purge_inactive_users: number }>(
      `SELECT fn_purge_inactive_users($1::text)`,
      [thresholdInterval]
    );

    const purged = result.rows[0].fn_purge_inactive_users;
    console.log(`[CronJob] purge completed — ${purged} inactive user(s) soft-deleted`);
  } catch (error) {
    console.error("[CronJob] fatal error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
