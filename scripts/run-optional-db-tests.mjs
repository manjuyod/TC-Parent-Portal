import { spawn } from "node:child_process";

const enabled = process.env.RUN_DB_INTEGRATION === "1";

if (!enabled) {
  console.log("[test:db:optional] Skipping DB integration tests. Set RUN_DB_INTEGRATION=1 to enable.");
  process.exit(0);
}

const requiredVars = ["ADMIN_TEST_USERNAME", "ADMIN_TEST_PASSWORD"];
const missing = requiredVars.filter((name) => !process.env[name] || !process.env[name].trim());

if (missing.length > 0) {
  console.log(
    `[test:db:optional] Skipping DB integration tests. Missing env vars: ${missing.join(", ")}.`
  );
  process.exit(0);
}

const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(npxCmd, ["vitest", "run", "server/tests/admin-login.db.test.ts"], {
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  console.error("[test:db:optional] Failed to start vitest:", err);
  process.exit(1);
});
