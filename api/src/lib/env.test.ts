import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

// dotenv never overrides existing process.env keys, so explicit child env wins over api/.env.
const probe = "import('./src/lib/env.js').then(m=>console.log('PROBE '+JSON.stringify({enabled:m.googleEnabled,redirectUri:m.env.googleRedirectUri}))).catch(e=>console.log('PROBE '+JSON.stringify({failed:String(e.message)})))";

function loadEnv(overrides: Record<string, string>) {
  const stdout = execFileSync(process.execPath, ["--import", "tsx", "-e", probe], {
    cwd: new URL("../..", import.meta.url).pathname.replace(/^\//, ""),
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/db", AUTH_SECRET: "x".repeat(32), ...overrides },
  });
  const line = stdout.split("\n").find((value) => value.startsWith("PROBE "))!;
  return JSON.parse(line.slice("PROBE ".length)) as { enabled?: boolean; redirectUri?: string; failed?: string };
}

test("google credentials without an explicit redirect URI default to the API callback on the API port", () => {
  const result = loadEnv({ GOOGLE_CLIENT_ID: "dummy-id", GOOGLE_CLIENT_SECRET: "dummy-secret", GOOGLE_REDIRECT_URI: "", PORT: "4999" });

  assert.equal(result.enabled, true);
  assert.equal(result.redirectUri, "http://127.0.0.1:4999/api/v1/auth/google/callback");
});

test("google credentials alone leave no google config when only the secret is missing", () => {
  const result = loadEnv({ GOOGLE_CLIENT_ID: "dummy-id", GOOGLE_CLIENT_SECRET: "", GOOGLE_REDIRECT_URI: "" });

  assert.match(result.failed ?? "", /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/);
});

test("with no google credentials google stays disabled and no redirect URI is required", () => {
  const result = loadEnv({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_REDIRECT_URI: "" });

  assert.equal(result.enabled, false);
  assert.equal(result.redirectUri, "http://127.0.0.1:4000/api/v1/auth/google/callback");
});
