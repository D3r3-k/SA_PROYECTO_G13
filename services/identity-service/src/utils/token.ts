import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export type IdentityTokenPayload = {
  user_id: string;
  email: string;
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

    return {
      user_id: decoded.user_id,
      email: decoded.email
    };
  } catch {
    return null;
  }
}