// ═══════════════════════════════════════════════════════════════════
//  Auth Middleware
//  Verifies JWT from Authorization header or cookie.
//  Attaches userId to the request object.
//  Auto-refreshes tokens nearing expiry.
// ═══════════════════════════════════════════════════════════════════

import { Request, Response, NextFunction } from "express";
import { verifyToken, refreshIfNeeded } from "../auth/device.js";
import { touchLastActive } from "../dal/users.js";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      deviceId?: string;
    }
  }
}

/**
 * Require authentication. Returns 401 if no valid token.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      error: "AUTH_REQUIRED",
      message: "No authentication token provided",
      audioHint: "something_wrong",
    });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      error: "AUTH_INVALID",
      message: "Token is invalid or expired",
      audioHint: "something_wrong",
    });
  }

  // Attach user info to request
  req.userId = payload.userId;
  req.deviceId = payload.deviceId;

  // Auto-refresh token if nearing expiry
  const newToken = refreshIfNeeded(token);
  if (newToken) {
    res.setHeader("X-Refreshed-Token", newToken);
  }

  // Touch last_active (non-blocking)
  touchLastActive(payload.userId).catch(() => {});

  next();
}

/**
 * Optional authentication. Attaches userId if token present, but doesn't block.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.userId = payload.userId;
      req.deviceId = payload.deviceId;
      touchLastActive(payload.userId).catch(() => {});
    }
  }
  next();
}

/**
 * Extract token from Authorization header or cookie.
 */
function extractToken(req: Request): string | null {
  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Fall back to cookie
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.match(/lb_token=([^;]+)/);
    if (match) return match[1];
  }

  return null;
}
