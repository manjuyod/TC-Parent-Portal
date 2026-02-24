import { describe, expect, it } from "vitest";
import { authenticateAdminByUsername } from "../adminAuth";

describe("admin login DB integration", () => {
  it("authenticates known admin username/password", async () => {
    const username = process.env.ADMIN_TEST_USERNAME;
    const password = process.env.ADMIN_TEST_PASSWORD;

    if (!username || !password) {
      throw new Error("Missing ADMIN_TEST_USERNAME or ADMIN_TEST_PASSWORD");
    }

    const result = await authenticateAdminByUsername(username, password);

    expect(result).not.toBeNull();
    expect(result?.adminEmail).toBeTruthy();
    expect(result?.franchiseId).toBeTruthy();
  });

  it("rejects invalid credentials", async () => {
    const result = await authenticateAdminByUsername(`invalid_${Date.now()}`, "definitely-wrong");
    expect(result).toBeNull();
  });
});
