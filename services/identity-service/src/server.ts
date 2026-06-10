import { pool } from "./db/pool";
import { startIdentityGrpcServer } from "./grpc/identity.server";

async function bootstrap() {
  try {
    await pool.query("SELECT 1");
    console.log("Identity database connection OK");

    startIdentityGrpcServer();
  } catch (error) {
    console.error("Identity Service failed to start:", error);
    process.exit(1);
  }
}

bootstrap();