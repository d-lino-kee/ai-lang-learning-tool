// ═══════════════════════════════════════════════════════════════════
//  Integration Tests — API Routes
//  Tests the full HTTP flow: auth → create session → data endpoints.
//  Requires a running MySQL test database (use docker compose).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { pool, closePool } from "../../src/config/database.js";
import { authRouter } from "../../src/routes/auth.js";
import { dataRouter } from "../../src/routes/data.js";

// Build a test app
const app = express();
app.use(express.json());
app.use("/api/auth", authRouter);
app.use("/api/data", dataRouter);

const TEST_DEVICE_ID = `test-device-${Date.now()}`;
let authToken: string;
let userId: number;

beforeAll(async () => {
  // Ensure test DB tables exist
  // In CI, migrations run before tests
});

afterAll(async () => {
  // Clean up test data
  try {
    await pool.execute("DELETE FROM users WHERE device_id LIKE 'test-device-%'");
  } catch {
    // Table might not exist in some test envs
  }
  await closePool();
});

describe("POST /api/auth/device", () => {
  it("creates a new user on first visit", async () => {
    const res = await request(app)
      .post("/api/auth/device")
      .send({ deviceId: TEST_DEVICE_ID });

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.userId).toBeGreaterThan(0);

    authToken = res.body.token;
    userId = res.body.userId;
  });

  it("returns existing user on second visit", async () => {
    const res = await request(app)
      .post("/api/auth/device")
      .send({ deviceId: TEST_DEVICE_ID });

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(false);
    expect(res.body.userId).toBe(userId);
  });

  it("rejects missing device ID", async () => {
    const res = await request(app).post("/api/auth/device").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("MISSING_DEVICE_ID");
  });
});

describe("GET /api/data/me (authenticated)", () => {
  it("returns 401 without token", async () => {
    const res = await request(app).get("/api/data/me");
    expect(res.status).toBe(401);
  });

  it("returns user info with valid token", async () => {
    const res = await request(app)
      .get("/api/data/me")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(userId);
    expect(res.body.user.targetLanguage).toBe("fr");
    expect(res.body.summary).toBeDefined();
  });
});

describe("PATCH /api/data/me (preferences)", () => {
  it("updates target language", async () => {
    const res = await request(app)
      .patch("/api/data/me")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ targetLanguage: "es" });

    expect(res.status).toBe(200);
    expect(res.body.targetLanguage).toBe("es");
  });

  it("updates speech rate", async () => {
    const res = await request(app)
      .patch("/api/data/me")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ speechRate: 0.7 });

    expect(res.status).toBe(200);
  });
});

describe("Sessions lifecycle", () => {
  let sessionId: number;

  it("POST /api/data/sessions — creates a session", async () => {
    const res = await request(app)
      .post("/api/data/sessions")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ scenarioId: null });

    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBeGreaterThan(0);
    sessionId = res.body.sessionId;
  });

  it("GET /api/data/sessions — lists sessions", async () => {
    const res = await request(app)
      .get("/api/data/sessions")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("PATCH /api/data/sessions/:id/end — ends a session", async () => {
    const res = await request(app)
      .patch(`/api/data/sessions/${sessionId}/end`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("GET /api/data/scenarios", () => {
  it("returns scenarios with progress", async () => {
    const res = await request(app)
      .get("/api/data/scenarios")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Should have scenarios if seed has run
  });
});
