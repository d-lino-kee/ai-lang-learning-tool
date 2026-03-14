// ═══════════════════════════════════════════════════════════════════
//  Device-Based Authentication
//  No email, no password — users are identified by device fingerprint.
//  Issues JWTs on first visit and refreshes silently.
// ═══════════════════════════════════════════════════════════════════

import jwt from "jsonwebtoken";
import { findByDeviceId, createUser } from "../dal/users.js";
import type { DeviceAuthResponse, JWTPayload } from "../types/api.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

/**
 * Authenticate a device. Creates a new user if the device is unknown.
 * Returns a JWT token and user info.
 */
export async function authenticateDevice(
  deviceId: string
): Promise<DeviceAuthResponse> {
  if (!deviceId || deviceId.length < 8) {
    throw new Error("Invalid device ID: must be at least 8 characters");
  }

  // Look up existing user
  let user = await findByDeviceId(deviceId);
  const isNewUser = !user;

  // Create user if first visit
  if (!user) {
    user = await createUser(deviceId);
  }

  // Generate JWT
  const payload: Omit<JWTPayload, "iat" | "exp"> = {
    userId: user.id,
    deviceId: user.deviceId,
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  return {
    token,
    userId: user.id,
    isNewUser,
  };
}

/**
 * Verify and decode a JWT token.
 * Returns the payload or null if invalid/expired.
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Refresh a token if it's valid but nearing expiry (< 7 days left).
 * Returns new token or null if no refresh needed.
 */
export function refreshIfNeeded(token: string): string | null {
  const payload = verifyToken(token);
  if (!payload) return null;

  const now = Math.floor(Date.now() / 1000);
  const sevenDays = 7 * 24 * 60 * 60;

  if (payload.exp - now < sevenDays) {
    return jwt.sign(
      { userId: payload.userId, deviceId: payload.deviceId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  return null;
}
