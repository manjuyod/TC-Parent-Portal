import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateAdminByUsernameMock = vi.hoisted(() => vi.fn());

vi.mock("../adminAuth", async () => {
  const actual = await vi.importActual<typeof import("../adminAuth")>("../adminAuth");
  return {
    ...actual,
    authenticateAdminByUsername: authenticateAdminByUsernameMock,
  };
});

import { registerRoutes } from "../routes";

async function makeAgent() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
  return request.agent(app);
}

describe("POST /api/admin/login", () => {
  beforeEach(() => {
    authenticateAdminByUsernameMock.mockReset();
  });

  it("accepts username payload", async () => {
    authenticateAdminByUsernameMock.mockResolvedValue({
      adminEmail: "admin@center.com",
      franchiseId: "6",
    });

    const agent = await makeAgent();
    const res = await agent.post("/api/admin/login").send({ username: "manager1", password: "pw123" });

    expect(res.status).toBe(200);
    expect(authenticateAdminByUsernameMock).toHaveBeenCalledWith("manager1", "pw123");
    expect(res.body).toEqual({
      success: true,
      franchiseId: "6",
      email: "admin@center.com",
    });
  });

  it("accepts legacy email payload as username fallback", async () => {
    authenticateAdminByUsernameMock.mockResolvedValue({
      adminEmail: "admin@center.com",
      franchiseId: "6",
    });

    const agent = await makeAgent();
    const res = await agent
      .post("/api/admin/login")
      .send({ email: "legacy-admin@example.com", password: "pw123" });

    expect(res.status).toBe(200);
    expect(authenticateAdminByUsernameMock).toHaveBeenCalledWith("legacy-admin@example.com", "pw123");
  });

  it("returns 400 for missing credentials", async () => {
    const agent = await makeAgent();
    const res = await agent.post("/api/admin/login").send({ password: "pw123" });

    expect(res.status).toBe(400);
    expect(res.body?.message).toContain("username");
    expect(authenticateAdminByUsernameMock).not.toHaveBeenCalled();
  });

  it("returns 401 for invalid credentials", async () => {
    authenticateAdminByUsernameMock.mockResolvedValue(null);

    const agent = await makeAgent();
    const res = await agent.post("/api/admin/login").send({ username: "manager1", password: "bad-pass" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Invalid credentials" });
  });

  it("sets admin session so protected route passes", async () => {
    authenticateAdminByUsernameMock.mockResolvedValue({
      adminEmail: "admin@center.com",
      franchiseId: "42",
    });

    const agent = await makeAgent();
    await agent.post("/api/admin/login").send({ username: "manager1", password: "pw123" }).expect(200);

    const meRes = await agent.get("/api/admin/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body).toEqual({
      email: "admin@center.com",
      franchiseId: "42",
    });
  });
});
