import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),

  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",

  jwtSecret: process.env.JWT_SECRET || "change_me_in_real_env",
  cookieName: process.env.COOKIE_NAME || "access_token",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  cookieSameSite: (process.env.COOKIE_SAME_SITE || "lax") as "lax" | "strict" | "none",

  identityGrpcUrl: process.env.IDENTITY_GRPC_URL || "localhost:50051"
};