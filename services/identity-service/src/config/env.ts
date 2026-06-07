import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",

  grpcHost: process.env.IDENTITY_GRPC_HOST || "0.0.0.0",
  grpcPort: Number(process.env.IDENTITY_GRPC_PORT || 50051),

  jwtSecret: process.env.JWT_SECRET || "change_me_in_real_env",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  notificationServiceUrl:
    process.env.NOTIFICATION_SERVICE_URL || "http://notification-service:8000",

  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "identity_db",
    user: process.env.DB_USER || "identity_user",
    password: process.env.DB_PASSWORD || "identity_password"
  }
};