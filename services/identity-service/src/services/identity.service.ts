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
  findUserByEmail,
  findUserById,
  registerUser,
  updatePasswordHash
} from "../repositories/user.repository";

import {
  createProfile,
  findProfileByUserAndProfileId,
  findProfilesByUserId,
  ProfileRecord
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

function toProfileResponse(profile: ProfileRecord, message = "Profile found") {
  return {
    success: true,
    message,
    profile_id: profile.profile_id,
    user_id: profile.user_id,
    name: profile.name,
    avatar_url: profile.avatar_url || ""
  };
}

function emptyAuthResponse(message: string) {
  return {
    success: false,
    message,
    user_id: "",
    token: ""
  };
}

function emptyProfileResponse(message: string) {
  return {
    success: false,
    message,
    profile_id: "",
    user_id: "",
    name: "",
    avatar_url: ""
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
    token: ""
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

      const token = signIdentityToken({
        user_id: userId,
        email
      });

      return callback(null, {
        success: true,
        message: "User registered successfully",
        user_id: userId,
        token
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

      const token = signIdentityToken({
        user_id: user.id,
        email: user.email
      });

      return callback(null, {
        success: true,
        message: "Login successful",
        user_id: user.id,
        token
      });
    } catch (error) {
      return handleUnexpectedError(callback, error, "Failed to login");
    }
  },

  ValidateToken: async (call: any, callback: any) => {
    const token = call.request.token || "";

    if (!token) {
      return callback(null, {
        valid: false,
        user_id: "",
        email: ""
      });
    }

    const payload = verifyIdentityToken(token);

    if (!payload) {
      return callback(null, {
        valid: false,
        user_id: "",
        email: ""
      });
    }

    return callback(null, {
      valid: true,
      user_id: payload.user_id,
      email: payload.email,
      profile_id: payload.profile_id || ""
    });
  },

  CreateProfile: async (call: any, callback: any) => {
    try {
      const userId = normalizeText(call.request.user_id || "");
      const name = normalizeText(call.request.name || "");
      const avatarUrl = normalizeText(call.request.avatar_url || "");

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

      const profileId = uuidv4();

      await createProfile({
        id: profileId,
        userId,
        name,
        avatarUrl
      });

      return callback(null, {
        success: true,
        message: "Profile created successfully",
        profile_id: profileId,
        user_id: userId,
        name,
        avatar_url: avatarUrl
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

      const token = signIdentityToken({
        user_id: user.id,
        email: user.email,
        profile_id: profile.profile_id
      });

      return callback(null, {
        ...toProfileResponse(profile, "Profile selected"),
        token
      });
    } catch (error) {
      return handleUnexpectedError(
        callback,
        error,
        "Failed to select profile"
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
  }
};