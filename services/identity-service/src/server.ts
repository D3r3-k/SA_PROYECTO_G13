import { pool } from "./db/pool";
import { startIdentityGrpcServer } from "./grpc/identity.server";
import { seedConfiguredAdmins } from "./repositories/user.repository";
import { env } from "./config/env";

async function bootstrap() {
  try {
    await pool.query("SELECT 1");
    console.log("Identity database connection OK");

    await seedConfiguredAdmins(env.adminEmails);
    if (env.adminEmails.length > 0) {
      console.log(`Identity RBAC admin seed evaluated for ${env.adminEmails.length} configured email(s)`);
    }

    startIdentityGrpcServer();
  } catch (error) {
    console.error("Identity Service failed to start:", error);
    process.exit(1);
  }
}

bootstrap();