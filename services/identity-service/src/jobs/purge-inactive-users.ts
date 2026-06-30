import dotenv from "dotenv";
dotenv.config();

import { env } from "../config/env";
import {
  listInactiveUsers,
  purgeInactiveUsers,
  restoreLoadTestUser
} from "../repositories/user.repository";
import { hashPassword } from "../utils/password";

type LoadTestAccount = {
  email: string;
  password: string;
};

function parseLocustUsersCsv(csvText: string): LoadTestAccount[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return [];
  }

  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  const emailIndex = headers.indexOf("email");
  const passwordIndex = headers.indexOf("password");

  if (emailIndex < 0) {
    return [];
  }

  return lines.slice(1).map((line) => {
    const columns = line.split(",").map((value) => value.trim());
    return {
      email: (columns[emailIndex] || "").toLowerCase(),
      password: passwordIndex >= 0 ? columns[passwordIndex] || "" : ""
    };
  }).filter((account) => Boolean(account.email));
}

async function restoreProtectedLoadTestUsers(accounts: LoadTestAccount[]): Promise<void> {
  if (accounts.length === 0) {
    return;
  }

  console.log(`[CronJob] usuarios protegidos Locust: ${accounts.map((account) => account.email).join(", ")}`);

  for (const account of accounts) {
    const passwordHash = account.password ? await hashPassword(account.password) : undefined;
    const restored = await restoreLoadTestUser({
      email: account.email,
      passwordHash
    });

    if (restored) {
      console.log(`[CronJob] usuario protegido habilitado: ${account.email}`);
    } else {
      console.warn(`[CronJob] usuario protegido no existe en identity_db: ${account.email}`);
    }
  }
}

async function run(): Promise<void> {
  const threshold = env.inactiveThresholdInterval;
  const startedAt = Date.now();
  const protectedAccounts = parseLocustUsersCsv(env.locustUsersCsv);
  const excludedEmails = protectedAccounts.map((account) => account.email);

  console.log(`[CronJob] purge-inactive-users iniciando`);
  console.log(`[CronJob] threshold de inactividad: ${threshold}`);
  console.log(`[CronJob] timestamp: ${new Date().toISOString()}`);

  try {
    await restoreProtectedLoadTestUsers(protectedAccounts);

    const inactiveUsers = await listInactiveUsers(threshold, excludedEmails);

    if (inactiveUsers.length === 0) {
      console.log(`[CronJob] no se encontraron usuarios inactivos`);
    } else {
      console.log(`[CronJob] usuarios inactivos encontrados: ${inactiveUsers.length}`);
      for (const user of inactiveUsers) {
        const lastLogin = user.last_login_at
          ? new Date(user.last_login_at).toISOString()
          : "nunca";
        console.log(`[CronJob]   -> id=${user.id} email=${user.email} last_login_at=${lastLogin}`);
      }
    }

    const purged = await purgeInactiveUsers(threshold, excludedEmails);
    const elapsed = Date.now() - startedAt;

    console.log(`[CronJob] purge completado - ${purged} usuario(s) eliminado(s) logicamente`);
    console.log(`[CronJob] duracion: ${elapsed}ms`);
    process.exit(0);
  } catch (error) {
    console.error("[CronJob] error fatal:", error);
    process.exit(1);
  }
}

run();
