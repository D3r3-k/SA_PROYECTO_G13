// TEMPORAL: credenciales de admin hardcodeadas. Ver CLAUDE.md sección Admin Panel.
import { Request, Response, NextFunction } from "express";

const ADMIN_KEY = process.env.ADMIN_KEY ?? "Admin1234#";

export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-admin-key"];
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ success: false, message: "Admin access required" });
  }
  next();
}
