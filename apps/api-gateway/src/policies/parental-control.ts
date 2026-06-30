import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { callIdentityMethod } from "../grpc/identity.client";

export type ParentalPolicyResult = {
  blocked: boolean;
  reason: string;
  pinRequired: boolean;
  rating: "ALL" | "PG_13" | "R";
};

type VerifyParentalPinResponse = {
  success: boolean;
  message: string;
};

export type ParentalSubject = {
  user_id: string;
  profile_id: string;
  profile_is_child: boolean;
};

function asString(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[0] || "");
  }
  return String(value || "");
}

export function normalizeMaturityRating(value: string | undefined): "ALL" | "PG_13" | "R" {
  const normalized = String(value || "ALL").trim().toUpperCase().replace("-", "_");
  if (["PG13", "PG_13"].includes(normalized)) return "PG_13";
  if (normalized === "R") return "R";
  return "ALL";
}

export function parentalPinFromRequest(req: AuthenticatedRequest): string {
  const header = asString(req.headers["x-parental-pin"]);
  const query = asString(req.query.parental_pin);
  const body = req.body as Record<string, unknown> | undefined;
  return (header || query || asString(body?.parental_pin)).trim();
}

export async function evaluateParentalControlForSubject(params: {
  subject: ParentalSubject;
  maturityRating: string | undefined;
  pin?: string;
}): Promise<ParentalPolicyResult> {
  const rating = normalizeMaturityRating(params.maturityRating);

  if (!params.subject.profile_is_child || rating === "ALL") {
    return { blocked: false, reason: "", pinRequired: false, rating };
  }

  const pin = String(params.pin || "").trim();

  if (!pin) {
    return {
      blocked: true,
      reason: `El contenido con clasificación ${rating} requiere el PIN parental para los perfiles infantiles`,
      pinRequired: true,
      rating
    };
  }

  const response = await callIdentityMethod<
    { user_id: string; profile_id: string; pin: string },
    VerifyParentalPinResponse
  >("VerifyParentalPin", {
    user_id: params.subject.user_id,
    profile_id: params.subject.profile_id,
    pin
  });

  if (!response.success) {
    return {
      blocked: true,
      reason: response.message || "PIN parental no válido",
      pinRequired: true,
      rating
    };
  }

  return { blocked: false, reason: "", pinRequired: false, rating };
}

export async function evaluateParentalControl(
  req: AuthenticatedRequest,
  maturityRating: string | undefined
): Promise<ParentalPolicyResult> {
  return evaluateParentalControlForSubject({
    subject: {
      user_id: req.user?.user_id || "",
      profile_id: req.user?.profile_id || "",
      profile_is_child: Boolean(req.user?.profile_is_child)
    },
    maturityRating,
    pin: parentalPinFromRequest(req)
  });
}
