import { status } from "@grpc/grpc-js";
import { v4 as uuidv4 } from "uuid";

import {
  comparePassword,
  hashPassword
} from "../utils/password";

import {
  signIdentityToken,
  verifyIdentityToken
} from "../utils/token";

import {
  ensureAdminRoleForEmail,
  findUserByEmail,
  findUserById,
  getUserAuthorization,
  listAuditLogs,
  registerUser,
  updateLastLogin,
  updatePasswordHash
} from "../repositories/user.repository";

import { publishNotificationEvent } from "../events/notification.publisher";
import { env } from "../config/env";
import { logAudit } from "../auditLogger";

import {
  createProfile,
  deleteProfileByUserAndProfileId,
  findProfileByUserAndProfileId,
  findProfilePinByUserAndProfileId,
  findProfilesByUserId,
  ProfileRecord,
  updateProfileByUserAndProfileId
} from "../repositories/profile.repository";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeText(value: string): string {
  return value.trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

function isValidParentalPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

function toProfileResponse(profile: ProfileRecord, message = "Profile found") {
  return {
    success: true,
    message,
    profile_id: profile.profile_id,
    user_id: profile.user_id,
    name: profile.name,
    avatar_url: profile.avatar_url || "",
    is_child: Boolean(profile.is_child),
    parental_pin_configured: Boolean(profile.parental_pin_configured)
  };
}

function emptyAuthResponse(message: string) {
  return {
    success: false,
    message,
    user_id: "",
    token: "",
    roles: [],
    permissions: [],
    is_admin: false,
    profile_is_child: false,
    parental_pin_configured: false
  };
}

function emptyProfileResponse(message: string) {
  return {
    success: false,
    message,
    profile_id: "",
    user_id: "",
    name: "",
    avatar_url: "",
    is_child: false,
    parental_pin_configured: false
  };
}

function emptyUserResponse(message: string) {
  return {
    success: false,
    message,
    user_id: "",
    email: "",
    full_name: "",
    roles: [],
    permissions: [],
    is_admin: false
  };
}

function emptySelectProfileResponse(message: string) {
  return {
    success: false,
    message,
    profile_id: "",
    user_id: "",
    name: "",
    avatar_url: "",
    token: "",
    roles: [],
    permissions: [],
    is_admin: false,
    profile_is_child: false,
    parental_pin_configured: false
  };
}

function handleUnexpectedError(
  callback: any,
  error: unknown,
  fallbackMessage: string
) {
  console.error(fallbackMessage, error);

  return callback({
    code: status.INTERNAL,
    message: fallbackMessage
  });
}

export const identityService = {
  RegisterUser: async (call: any, callback: any) => {
    try {
      const email = normalizeEmail(call.request.email || "");
      const password = call.request.password || "";
      const fullName = normalizeText(call.request.full_name || "");

      if (!email || !password || !fullName) {
        return callback(
          null,
          emptyAuthResponse("email, password and full_name are required")
        );
      }

      if (!isValidEmail(email)) {
        return callback(null, emptyAuthResponse("Invalid email format"));
      }

      if (!isValidPassword(password)) {
        return callback(
          null,
          emptyAuthResponse("Password must have at least 8 characters")
        );
      }

      const existingUser = await findUserByEmail(email);

      if (existingUser) {
        return callback(null, emptyAuthResponse("Email already registered"));
      }

      const userId = uuidv4();
      const passwordHash = await hashPassword(password);

      await registerUser({
        id: userId,
        email,
        passwordHash,
        fullName
      });

      await ensureAdminRoleForEmail(userId, email, env.adminEmails);
      const authz = await getUserAuthorization(userId);

      logAudit("register_user", userId, { email, full_name: fullName });

      try {
        await publishNotificationEvent({
          type: "registration",
          user_id: userId,
          email,
          subject: "Confirmación de registro en Quetxal TV",
          body: "Tu cuenta ya quedó activa. Ya puedes iniciar sesión y empezar a explorar el catálogo.",
          metadata: {
            user_id: userId,
            full_name: fullName,
            cta_text: "Iniciar sesión"
          }
        });
      } catch (notificationError) {
        console.warn("Registration notification failed", notificationError);
      }

      const token = signIdentityToken({
        user_id: userId,
        email,
        roles: authz.roles,
        permissions: authz.permissions,
        is_admin: authz.isAdmin
      });

      return callback(null, {
        success: true,
        message: "User registered successfully",
        user_id: userId,
        token,
        roles: authz.roles,
        permissions: authz.permissions,
        is_admin: authz.isAdmin
      });
    } catch (error: any) {
      if (error?.code === "23505") {
        return callback(null, emptyAuthResponse("Email already registered"));
      }

      return handleUnexpectedError(
        callback,
        error,
        "Failed to register user"
      );
    }
  },

  Login: async (call: any, callback: any) => {
    try {
      const email = normalizeEmail(call.request.email || "");
      const password = call.request.password || "";

      if (!email || !password) {
        return callback(
          null,
          emptyAuthResponse("email and password are required")
        );
      }

      const user = await findUserByEmail(email);

      if (!user) {
        return callback(null, emptyAuthResponse("Invalid credentials"));
      }

      const passwordMatches = await comparePassword(
        password,
        user.password_hash
      );

      if (!passwordMatches) {
        return callback(null, emptyAuthResponse("Invalid credentials"));
      }

      const authz = await getUserAuthorization(user.id);

      await updateLastLogin(user.id);
      
      logAudit("login", user.id, { email });

      const token = signIdentityToken({
        user_id: user.id,
        email: user.email,
        roles: authz.roles,
        permissions: authz.permissions,
        is_admin: authz.isAdmin
      });

      return callback(null, {
        success: true,
        message: "Login successful",
        user_id: user.id,
        token,
        roles: authz.roles,
        permissions: authz.permissions,
        is_admin: authz.isAdmin
      });
    } catch (error) {
      return handleUnexpectedError(callback, error, "Failed to login");
    }
  },

  GetUserById: async (call: any, callback: any) => {
    try {
      const userId = normalizeText(call.request.user_id || "");

      if (!userId) {
        return callback(null, emptyUserResponse("user_id is required"));
      }

      const user = await findUserById(userId);

      if (!user) {
        return callback(null, emptyUserResponse("User not found"));
      }

      const authz = await getUserAuthorization(user.id);

      return callback(null, {
        success: true,
        message: "User found",
        user_id: user.id,
        email: user.email,
        full_name: user.full_name,
        roles: authz.roles,
        permissions: authz.permissions,
        is_admin: authz.isAdmin
      });
    } catch (error) {
      return handleUnexpectedError(callback, error, "Failed to get user by id");
    }
  },

  ValidateToken: async (call: any, callback: any) => {
    const token = call.request.token || "";

    if (!token) {
      return callback(null, {
        valid: false,
        user_id: "",
        email: "",
        profile_id: "",
        roles: [],
        permissions: [],
        is_admin: false,
        profile_is_child: false,
        parental_pin_configured: false
      });
    }

    const payload = verifyIdentityToken(token);

    if (!payload) {
      return callback(null, {
        valid: false,
        user_id: "",
        email: "",
        profile_id: "",
        roles: [],
        permissions: [],
        is_admin: false,
        profile_is_child: false,
        parental_pin_configured: false
      });
    }

    return callback(null, {
      valid: true,
      user_id: payload.user_id,
      email: payload.email,
      profile_id: payload.profile_id || "",
      roles: payload.roles || [],
      permissions: payload.permissions || [],
      is_admin: Boolean(payload.is_admin),
      profile_is_child: Boolean(payload.profile_is_child),
      parental_pin_configured: Boolean(payload.parental_pin_configured)
    });
  },

  CreateProfile: async (call: any, callback: any) => {
    try {
      const userId = normalizeText(call.request.user_id || "");
      const name = normalizeText(call.request.name || "");
      const avatarUrl = normalizeText(call.request.avatar_url || "");
      const isChild = Boolean(call.request.is_child);
      const parentalPin = normalizeText(call.request.parental_pin || "");

      if (!userId || !name) {
        return callback(
          null,
          emptyProfileResponse("user_id and name are required")
        );
      }

      const user = await findUserById(userId);

      if (!user) {
        return callback(null, emptyProfileResponse("User not found"));
      }

      if (isChild && !isValidParentalPin(parentalPin)) {
        return callback(
          null,
          emptyProfileResponse("Child profiles require a 4 digit parental PIN")
        );
      }

      const profileId = uuidv4();
      const parentalPinHash = isChild ? await hashPassword(parentalPin) : null;

      await createProfile({
        id: profileId,
        userId,
        name,
        avatarUrl,
        isChild,
        parentalPinHash
      });

      return callback(null, {
        success: true,
        message: "Profile created successfully",
        profile_id: profileId,
        user_id: userId,
        name,
        avatar_url: avatarUrl,
        is_child: isChild,
        parental_pin_configured: Boolean(parentalPinHash)
      });
    } catch (error: any) {
      if (
        error?.message?.includes("more than 5 profiles") ||
        error?.message?.includes("User cannot have more than 5 profiles")
      ) {
        return callback(
          null,
          emptyProfileResponse("User cannot have more than 5 profiles")
        );
      }

      return handleUnexpectedError(
        callback,
        error,
        "Failed to create profile"
      );
    }
  },

  ListProfiles: async (call: any, callback: any) => {
    try {
      const userId = normalizeText(call.request.user_id || "");

      if (!userId) {
        return callback(null, {
          profiles: []
        });
      }

      const profiles = await findProfilesByUserId(userId);

      return callback(null, {
        profiles: profiles.map((profile) =>
          toProfileResponse(profile, "Profile loaded")
        )
      });
    } catch (error) {
      return handleUnexpectedError(
        callback,
        error,
        "Failed to list profiles"
      );
    }
  },

  SelectProfile: async (call: any, callback: any) => {
    try {
      const userId = normalizeText(call.request.user_id || "");
      const profileId = normalizeText(call.request.profile_id || "");

      if (!userId || !profileId) {
        return callback(
          null,
          emptySelectProfileResponse("user_id and profile_id are required")
        );
      }

      const user = await findUserById(userId);

      if (!user) {
        return callback(null, emptySelectProfileResponse("User not found"));
      }

      const profile = await findProfileByUserAndProfileId({
        userId,
        profileId
      });

      if (!profile) {
        return callback(
          null,
          emptySelectProfileResponse("Profile not found for this user")
        );
      }

      const authz = await getUserAuthorization(user.id);
      const token = signIdentityToken({
        user_id: user.id,
        email: user.email,
        profile_id: profile.profile_id,
        profile_is_child: Boolean(profile.is_child),
        parental_pin_configured: Boolean(profile.parental_pin_configured),
        roles: authz.roles,
        permissions: authz.permissions,
        is_admin: authz.isAdmin
      });

      return callback(null, {
        ...toProfileResponse(profile, "Profile selected"),
        token,
        roles: authz.roles,
        permissions: authz.permissions,
        is_admin: authz.isAdmin,
        profile_is_child: Boolean(profile.is_child),
        parental_pin_configured: Boolean(profile.parental_pin_configured)
      });
    } catch (error) {
      return handleUnexpectedError(
        callback,
        error,
        "Failed to select profile"
      );
    }
  },

  UpdateProfile: async (call: any, callback: any) => {
    try {
      const userId = normalizeText(call.request.user_id || "");
      const profileId = normalizeText(call.request.profile_id || "");
      const name = normalizeText(call.request.name || "");
      const avatarUrl = normalizeText(call.request.avatar_url || "");
      const isChild = Boolean(call.request.is_child);
      const parentalPin = normalizeText(call.request.parental_pin || "");

      if (!userId || !profileId || !name) {
        return callback(
          null,
          emptyProfileResponse("user_id, profile_id and name are required")
        );
      }

      const currentProfile = await findProfileByUserAndProfileId({ userId, profileId });

      if (!currentProfile) {
        return callback(
          null,
          emptyProfileResponse("Profile not found for this user")
        );
      }

      if (isChild && parentalPin && !isValidParentalPin(parentalPin)) {
        return callback(
          null,
          emptyProfileResponse("Parental PIN must contain exactly 4 digits")
        );
      }

      if (isChild && !parentalPin && !currentProfile.parental_pin_configured) {
        return callback(
          null,
          emptyProfileResponse("Child profiles require a configured 4 digit parental PIN")
        );
      }

      const parentalPinHash = isChild && parentalPin ? await hashPassword(parentalPin) : null;

      const profile = await updateProfileByUserAndProfileId({
        userId,
        profileId,
        name,
        avatarUrl,
        isChild,
        parentalPinHash,
        replaceParentalPin: Boolean(parentalPinHash)
      });

      if (!profile) {
        return callback(
          null,
          emptyProfileResponse("Profile not found for this user")
        );
      }

      return callback(null, toProfileResponse(profile, "Profile updated"));
    } catch (error) {
      return handleUnexpectedError(
        callback,
        error,
        "Failed to update profile"
      );
    }
  },

  DeleteProfile: async (call: any, callback: any) => {
    try {
      const userId = normalizeText(call.request.user_id || "");
      const profileId = normalizeText(call.request.profile_id || "");

      if (!userId || !profileId) {
        return callback(null, {
          success: false,
          message: "user_id and profile_id are required"
        });
      }

      const response = await deleteProfileByUserAndProfileId({
        userId,
        profileId
      });

      return callback(null, response);
    } catch (error) {
      return handleUnexpectedError(
        callback,
        error,
        "Failed to delete profile"
      );
    }
  },

  VerifyParentalPin: async (call: any, callback: any) => {
    try {
      const userId = normalizeText(call.request.user_id || "");
      const profileId = normalizeText(call.request.profile_id || "");
      const pin = normalizeText(call.request.pin || "");

      if (!userId || !profileId || !pin) {
        return callback(null, {
          success: false,
          message: "user_id, profile_id and pin are required"
        });
      }

      if (!isValidParentalPin(pin)) {
        return callback(null, {
          success: false,
          message: "Parental PIN must contain exactly 4 digits"
        });
      }

      const profile = await findProfilePinByUserAndProfileId({ userId, profileId });

      if (!profile || !profile.is_child || !profile.parental_pin_hash) {
        return callback(null, {
          success: false,
          message: "Parental PIN is not configured for this profile"
        });
      }

      const valid = await comparePassword(pin, profile.parental_pin_hash);

      return callback(null, {
        success: valid,
        message: valid ? "PIN parental verificado" : "PIN parental no válido"
      });
    } catch (error) {
      return handleUnexpectedError(
        callback,
        error,
        "Failed to verify parental PIN"
      );
    }
  },

  UpdateCredentials: async (call: any, callback: any) => {
    try {
      const userId = normalizeText(call.request.user_id || "");
      const currentPassword = call.request.current_password || "";
      const newPassword = call.request.new_password || "";

      if (!userId || !currentPassword || !newPassword) {
        return callback(null, {
          success: false,
          message: "user_id, current_password and new_password are required"
        });
      }

      if (!isValidPassword(newPassword)) {
        return callback(null, {
          success: false,
          message: "New password must have at least 8 characters"
        });
      }

      if (currentPassword === newPassword) {
        return callback(null, {
          success: false,
          message: "New password must be different from current password"
        });
      }

      const user = await findUserById(userId);

      if (!user) {
        return callback(null, {
          success: false,
          message: "User not found"
        });
      }

      const passwordMatches = await comparePassword(
        currentPassword,
        user.password_hash
      );

      if (!passwordMatches) {
        return callback(null, {
          success: false,
          message: "Current password is incorrect"
        });
      }

      const newPasswordHash = await hashPassword(newPassword);

      await updatePasswordHash({
        userId,
        passwordHash: newPasswordHash
      });

      logAudit("update_credentials", userId, { success: true });

      return callback(null, {
        success: true,
        message: "Credentials updated successfully"
      });
    } catch (error) {
      return handleUnexpectedError(
        callback,
        error,
        "Failed to update credentials"
      );
    }
  },

  ListAuditLogs: async (call: any, callback: any) => {
    try {
      const rows = await listAuditLogs({
        tableName: normalizeText(call.request.table_name || ""),
        actorUserId: normalizeText(call.request.actor_user_id || ""),
        action: normalizeText(call.request.action || ""),
        from: normalizeText(call.request.from || ""),
        to: normalizeText(call.request.to || ""),
        limit: Number(call.request.limit || 100),
        offset: Number(call.request.offset || 0)
      });

      return callback(null, {
        success: true,
        message: `identity audit logs listed: ${rows.length}`,
        items: rows
      });
    } catch (error) {
      return handleUnexpectedError(callback, error, "Failed to list identity audit logs");
    }
  }

};
