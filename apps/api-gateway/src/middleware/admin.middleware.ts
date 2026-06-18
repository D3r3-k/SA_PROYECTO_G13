import { Response, NextFunction } from "express";
import { AuthenticatedRequest, authMiddleware } from "./auth.middleware";

export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    if (user.is_admin || user.roles.includes("admin") || user.permissions.includes(permission)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Permission required: ${permission}`
    });
  };
}

export const adminMiddleware = [authMiddleware, requirePermission("catalog:admin")];
export const auditMiddleware = [authMiddleware, requirePermission("audit:read")];
export const reportMiddleware = [authMiddleware, requirePermission("reports:export")];
