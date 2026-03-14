// ═══════════════════════════════════════════════════════════════════
//  Unit Tests — Device Authentication
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DAL before importing auth
vi.mock("../src/dal/users.js", () => ({
  findByDeviceId: vi.fn(),
  createUser: vi.fn(),
}));

import { authenticateDevice, verifyToken, refreshIfNeeded } from "../src/auth/device.js";
import { findByDeviceId, createUser } from "../src/dal/users.js";

const mockUser = {
  id: 1,
  deviceId: "abc12345def67890",
  displayName: null,
  nativeLanguage: "en",
  targetLanguage: "fr",
  speechRate: 0.85,
  createdAt: new Date(),
  lastActiveAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authenticateDevice", () => {
  it("returns existing user and isNewUser=false", async () => {
    vi.mocked(findByDeviceId).mockResolvedValue(mockUser);

    const result = await authenticateDevice("abc12345def67890");

    expect(result.userId).toBe(1);
    expect(result.isNewUser).toBe(false);
    expect(result.token).toBeTruthy();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("creates new user and returns isNewUser=true", async () => {
    vi.mocked(findByDeviceId).mockResolvedValue(null);
    vi.mocked(createUser).mockResolvedValue(mockUser);

    const result = await authenticateDevice("newdevice12345678");

    expect(result.isNewUser).toBe(true);
    expect(result.userId).toBe(1);
    expect(createUser).toHaveBeenCalledWith("newdevice12345678");
  });

  it("rejects short device IDs", async () => {
    await expect(authenticateDevice("short")).rejects.toThrow(
      "Invalid device ID"
    );
  });

  it("rejects empty device IDs", async () => {
    await expect(authenticateDevice("")).rejects.toThrow(
      "Invalid device ID"
    );
  });
});

describe("verifyToken", () => {
  it("returns payload for valid token", async () => {
    vi.mocked(findByDeviceId).mockResolvedValue(mockUser);
    const { token } = await authenticateDevice("abc12345def67890");

    const payload = verifyToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe(1);
    expect(payload!.deviceId).toBe("abc12345def67890");
  });

  it("returns null for invalid token", () => {
    expect(verifyToken("garbage.token.here")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(verifyToken("")).toBeNull();
  });
});

describe("refreshIfNeeded", () => {
  it("returns null for token with plenty of time left", async () => {
    vi.mocked(findByDeviceId).mockResolvedValue(mockUser);
    const { token } = await authenticateDevice("abc12345def67890");

    // Fresh token (30 day expiry) should not need refresh
    expect(refreshIfNeeded(token)).toBeNull();
  });

  it("returns null for invalid token", () => {
    expect(refreshIfNeeded("bad.token")).toBeNull();
  });
});
