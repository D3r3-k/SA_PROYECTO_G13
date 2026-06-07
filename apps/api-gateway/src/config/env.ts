import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

function requiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;

  if (isProduction && !process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),

  frontendUrl: requiredEnv("FRONTEND_URL", "http://localhost:5173"),

  jwtSecret: requiredEnv("JWT_SECRET", "change_me_in_real_env"),
  cookieName: process.env.COOKIE_NAME || "access_token",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  cookieSameSite: (process.env.COOKIE_SAME_SITE || "lax") as
    | "lax"
    | "strict"
    | "none",

  identityGrpcUrl: requiredEnv("IDENTITY_GRPC_URL", "identity-service:50051"),
  fxGrpcUrl: requiredEnv("FX_GRPC_URL", "fx-service:50052"),
  subscriptionGrpcUrl: requiredEnv(
    "SUBSCRIPTION_GRPC_URL",
    "subscription-service:50053"
  ),
  notificationGrpcUrl: requiredEnv(
    "NOTIFICATION_GRPC_URL",
    "notification-service:50054"
  )
};