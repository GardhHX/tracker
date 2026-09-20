import "dotenv/config";
import { parseCorsOrigins } from "./validation.js";

function required(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function positiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

const port = Number(process.env.PORT ?? 4000);
const nodeEnv = process.env.NODE_ENV ?? "development";
const appOrigin = process.env.APP_ORIGIN ?? "http://127.0.0.1:5173";
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || undefined;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || undefined;
const explicitGoogleRedirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || undefined;
if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
  throw new Error("Google OAuth requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together.");
}
if (googleClientId && nodeEnv === "production" && !explicitGoogleRedirectUri) {
  throw new Error("Production Google OAuth requires GOOGLE_REDIRECT_URI.");
}
const googleRedirectUri = explicitGoogleRedirectUri ?? `http://127.0.0.1:${port}/api/v1/auth/google/callback`;
const smtpHost = process.env.SMTP_HOST?.trim() || undefined;
const smtpUser = process.env.SMTP_USER?.trim() || undefined;
const smtpPass = process.env.SMTP_PASS?.trim() || undefined;
if (Boolean(smtpUser) !== Boolean(smtpPass)) {
  throw new Error("SMTP requires SMTP_USER and SMTP_PASS together.");
}

export const env = {
  port,
  nodeEnv,
  databaseUrl: required("DATABASE_URL"),
  authSecret: required("AUTH_SECRET"),
  cookieSecure: process.env.COOKIE_SECURE === "true",
  allowedOrigins: parseCorsOrigins(process.env.ALLOWED_ORIGINS),
  appOrigin,
  googleClientId,
  googleClientSecret,
  googleRedirectUri,
  smtpHost,
  smtpPort: positiveInteger("SMTP_PORT", 587),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser,
  smtpPass,
  smtpFrom: process.env.SMTP_FROM?.trim() || "Tracker <no-reply@tracker.local>",
  emailWorkerPollMs: positiveInteger("EMAIL_WORKER_POLL_MS", 5_000),
  emailWorkerBatchSize: positiveInteger("EMAIL_WORKER_BATCH_SIZE", 10),
  emailWorkerLockMs: positiveInteger("EMAIL_WORKER_LOCK_MS", 60_000),
  emailWorkerMaxAttempts: positiveInteger("EMAIL_WORKER_MAX_ATTEMPTS", 5),
};

export const googleEnabled = Boolean(googleClientId && googleClientSecret);
