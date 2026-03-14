// ═══════════════════════════════════════════════════════════════════
//  Auth Routes
//  POST /api/auth/device — register/login with device fingerprint
// ═══════════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { authenticateDevice } from "../auth/device.js";

export const authRouter = Router();

/**
 * POST /api/auth/device
 * Body: { deviceId: string }
 * Returns: { token, userId, isNewUser }
 */
authRouter.post("/device", async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.body;

    if (!deviceId || typeof deviceId !== "string") {
      return res.status(400).json({
        error: "MISSING_DEVICE_ID",
        message: "deviceId is required",
        audioHint: "something_wrong",
      });
    }

    const result = await authenticateDevice(deviceId);

    // Set httpOnly cookie as well (for WebSocket auth)
    res.cookie("lb_token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json(result);
  } catch (err: any) {
    console.error("Auth error:", err);
    res.status(500).json({
      error: "AUTH_FAILED",
      message: err.message,
      audioHint: "something_wrong",
    });
  }
});
