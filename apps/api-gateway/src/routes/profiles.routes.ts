import { Router } from "express";

export const profileRoutes = Router();

profileRoutes.post("/", async (_req, res) => {
  res.status(501).json({
    message: "Create profile endpoint pending IdentityService gRPC integration"
  });
});

profileRoutes.get("/", async (_req, res) => {
  res.status(501).json({
    message: "List profiles endpoint pending IdentityService gRPC integration"
  });
});

profileRoutes.post("/:profileId/select", async (req, res) => {
  res.status(501).json({
    message: "Select profile endpoint pending IdentityService gRPC integration",
    profile_id: req.params.profileId
  });
});