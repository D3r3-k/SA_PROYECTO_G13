import { Router } from "express";

import { callIdentityMethod } from "../grpc/identity.client";

export const internalRoutes = Router();

internalRoutes.get("/users/:userId", async (req, res) => {
  try {
    const userId = req.params.userId?.trim();

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "user_id is required"
      });
    }

    const response = await callIdentityMethod<
      {
        user_id: string;
      },
      {
        success: boolean;
        message: string;
        user_id: string;
        email: string;
        full_name: string;
      }
    >("GetUserById", {
      user_id: userId
    });

    if (!response.success) {
      const status = response.message.toLowerCase().includes("not found")
        ? 404
        : 400;

      return res.status(status).json(response);
    }

    return res.json(response);
  } catch (error) {
    console.error("Internal user lookup failed", error);

    return res.status(503).json({
      success: false,
      message: "Identity Service unavailable"
    });
  }
});