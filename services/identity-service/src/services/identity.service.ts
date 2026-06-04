import jwt from "jsonwebtoken";
import { status } from "@grpc/grpc-js";
import { env } from "../config/env";

export const identityService = {
  RegisterUser: async (_call: any, callback: any) => {
    callback(null, {
      success: false,
      message: "RegisterUser pending implementation",
      user_id: "",
      token: ""
    });
  },

  Login: async (_call: any, callback: any) => {
    callback(null, {
      success: false,
      message: "Login pending implementation",
      user_id: "",
      token: ""
    });
  },

  ValidateToken: async (call: any, callback: any) => {
    try {
      const { token } = call.request;

      if (!token) {
        return callback(null, {
          valid: false,
          user_id: "",
          email: ""
        });
      }

      const payload = jwt.verify(token, env.jwtSecret) as {
        user_id: string;
        email?: string;
      };

      return callback(null, {
        valid: true,
        user_id: payload.user_id,
        email: payload.email || ""
      });
    } catch {
      return callback(null, {
        valid: false,
        user_id: "",
        email: ""
      });
    }
  },

  CreateProfile: async (_call: any, callback: any) => {
    callback(null, {
      success: false,
      message: "CreateProfile pending implementation",
      profile_id: "",
      user_id: "",
      name: "",
      avatar_url: ""
    });
  },

  ListProfiles: async (_call: any, callback: any) => {
    callback(null, {
      profiles: []
    });
  },

  SelectProfile: async (_call: any, callback: any) => {
    callback(null, {
      success: false,
      message: "SelectProfile pending implementation",
      profile_id: "",
      user_id: "",
      name: "",
      avatar_url: ""
    });
  },

  UpdateCredentials: async (_call: any, callback: any) => {
    callback(null, {
      success: false,
      message: "UpdateCredentials pending implementation"
    });
  }
};