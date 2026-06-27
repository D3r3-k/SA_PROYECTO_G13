import dotenv from "dotenv";
dotenv.config();

import { env } from "../config/env";
import { listInactiveUsers, purgeInactiveUsers } from "../repositories/user.repository";

async function run(): Promise<void> {
  const threshold = env.inactiveThresholdInterval;
  const startedAt = Date.now();

  console.log(`[CronJob] purge-inactive-users iniciando`);
  console.log(`[CronJob] threshold de inactividad: ${threshold}`);
  console.log(`[CronJob] timestamp: ${new Date().toISOString()}`);

  try {
    const inactiveUsers = await listInactiveUsers(threshold);

    if (inactiveUsers.length === 0) {
      console.log(`[CronJob] no se encontraron usuarios inactivos`);
    } else {
      console.log(`[CronJob] usuarios inactivos encontrados: ${inactiveUsers.length}`);
      for (const user of inactiveUsers) {
        const lastLogin = user.last_login_at
          ? new Date(user.last_login_at).toISOString()
          : "nunca";
        console.log(`[CronJob]   → id=${user.id} email=${user.email} last_login_at=${lastLogin}`);
      }
    }

    const purged = await purgeInactiveUsers(threshold);
    const elapsed = Date.now() - startedAt;

    console.log(`[CronJob] purge completado — ${purged} usuario(s) eliminado(s) lógicamente`);
    console.log(`[CronJob] duración: ${elapsed}ms`);
    process.exit(0);
  } catch (error) {
    console.error("[CronJob] error fatal:", error);
    process.exit(1);
  }
}

run();
