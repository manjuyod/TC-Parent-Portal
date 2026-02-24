import { beforeEach, describe, expect, it, vi } from "vitest";

const inputMock = vi.hoisted(() => vi.fn());
const queryMock = vi.hoisted(() => vi.fn());
const requestMock = vi.hoisted(() => vi.fn(() => ({ input: inputMock, query: queryMock })));
const getPoolMock = vi.hoisted(() => vi.fn(async () => ({ request: requestMock })));
const varCharMock = vi.hoisted(() => vi.fn((size: number) => `VarChar(${size})`));

vi.mock("../db", () => ({
  getPool: getPoolMock,
  sql: { VarChar: varCharMock },
}));

import { authenticateAdminByUsername, parseAdminLoginBody } from "../adminAuth";

describe("parseAdminLoginBody", () => {
  it("prefers username when provided", () => {
    expect(parseAdminLoginBody({ username: "manager1", password: "pw" })).toEqual({
      username: "manager1",
      password: "pw",
    });
  });

  it("falls back to legacy email key", () => {
    expect(parseAdminLoginBody({ email: "legacy@example.com", password: "pw" })).toEqual({
      username: "legacy@example.com",
      password: "pw",
    });
  });

  it("normalizes empty payload", () => {
    expect(parseAdminLoginBody(null)).toEqual({
      username: "",
      password: "",
    });
  });
});

describe("authenticateAdminByUsername", () => {
  beforeEach(() => {
    inputMock.mockReset();
    queryMock.mockReset();
    requestMock.mockClear();
    getPoolMock.mockClear();
    varCharMock.mockReset();
    varCharMock.mockImplementation((size: number) => `VarChar(${size})`);
  });

  it("binds username parameter and returns normalized success result", async () => {
    queryMock.mockResolvedValue({
      recordset: [{ AdminEmail: "admin@center.com", FranchiseID: 12 }],
    });

    const result = await authenticateAdminByUsername("manager1", "pw123");

    expect(getPoolMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(inputMock).toHaveBeenNthCalledWith(1, "username", "VarChar(256)", "manager1");
    expect(inputMock).toHaveBeenNthCalledWith(2, "pwd", "VarChar(256)", "pw123");
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sqlText = String(queryMock.mock.calls[0][0] || "");
    expect(sqlText).toContain("U.UserName = @username");
    expect(sqlText).toContain("ON F.FranchiesEmail = U.Email");
    expect(result).toEqual({ adminEmail: "admin@center.com", franchiseId: "12" });
  });

  it("returns null when credentials do not match", async () => {
    queryMock.mockResolvedValue({ recordset: [] });
    await expect(authenticateAdminByUsername("bad-user", "bad-pass")).resolves.toBeNull();
  });

  it("returns null when no franchise mapping exists", async () => {
    queryMock.mockResolvedValue({
      recordset: [{ AdminEmail: "admin@center.com", FranchiseID: null }],
    });
    await expect(authenticateAdminByUsername("manager1", "pw123")).resolves.toBeNull();
  });
});
