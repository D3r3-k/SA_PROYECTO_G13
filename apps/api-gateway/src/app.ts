import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { env } from "./config/env";
import { healthRoutes } from "./routes/health.routes";
import { authRoutes } from "./routes/auth.routes";
import { profileRoutes } from "./routes/profiles.routes";

import { subscriptionRoutes } from "./routes/subscriptions.routes";
import { fxRoutes } from "./routes/fx.routes";
import { catalogRoutes } from "./routes/catalog.routes";
import { engagementRoutes } from "./routes/engagement.routes";

export const app = express();

app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true
  })
);

app.use(express.json());
app.use(cookieParser());

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/profiles", profileRoutes);

app.use("/api", subscriptionRoutes);
app.use("/api", fxRoutes);

app.use("/api", catalogRoutes);
app.use("/api", engagementRoutes);