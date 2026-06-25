import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export type IdentityTokenPayload = {
  user_id: string;
  email: string;
  profile_id?: string;
  roles?: string[];
  permissions?: string[];
  is_admin?: boolean;
  profile_is_child?: boolean;
  parental_pin_configured?: boolean;
};

export function signIdentityToken(payload: IdentityTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"]
  };

  return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyIdentityToken(token: string): IdentityTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as IdentityTokenPayload;

    if (!decoded.user_id || !decoded.email) {
      return null;
    }

    const roles = Array.isArray(decoded.roles) ? decoded.roles.map(String) : [];
    const permissions = Array.isArray(decoded.permissions)
      ? decoded.permissions.map(String)
      : [];

    return {
      user_id: decoded.user_id,
      email: decoded.email,
      profile_id: decoded.profile_id || "",
      roles,
      permissions,
      is_admin: Boolean(decoded.is_admin || roles.includes("admin")),
      profile_is_child: Boolean(decoded.profile_is_child),
      parental_pin_configured: Boolean(decoded.parental_pin_configured)
    };
  } catch {
    return null;
  }
}
