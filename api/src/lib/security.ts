import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env.js";

const SESSION_COOKIE = "tracker_session";
const CSRF_COOKIE = "tracker_csrf";
const GOOGLE_OAUTH_COOKIE = "tracker_google_oauth";
const GOOGLE_OAUTH_COOKIE_PATH = "/api/v1/auth/google";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();
const secretKey = encoder.encode(env.authSecret);

export type SessionClaims = { userId: string; sid: string; sessionVersion: number; recentAuthAt: number };

export function randomToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function signCookie(value: string) {
  const signature = createHmac("sha256", env.authSecret).update(value).digest("base64url");
  return `${value}.${signature}`;
}

function readSignedCookie(value: string | undefined) {
  if (!value) return undefined;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return undefined;
  const raw = value.slice(0, separator);
  const expected = signCookie(raw).slice(raw.length + 1);
  const actual = value.slice(separator + 1);
  if (actual.length !== expected.length) return undefined;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected)) ? raw : undefined;
}

export function setCsrfCookie(res: { cookie: Function }) {
  const token = randomToken();
  res.cookie(CSRF_COOKIE, signCookie(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    maxAge: 60 * 60 * 1000,
    path: "/",
  });
  return token;
}

export function verifyCsrf(header: string | undefined, cookie: string | undefined) {
  if (!header) return false;
  const token = readSignedCookie(cookie);
  if (!token || token.length !== header.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(header));
}

export async function createSession(userId: string, sessionVersion: number) {
  const sid = randomUUID();
  const recentAuthAt = Math.floor(Date.now() / 1000);
  const value = await new SignJWT({ sid, session_version: sessionVersion, recent_auth_at: recentAuthAt })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer("tracker-api")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey);
  return { value, sid, recentAuthAt };
}

export async function readSession(value: string | undefined): Promise<SessionClaims | undefined> {
  if (!value) return undefined;
  try {
    const { payload } = await jwtVerify(value, secretKey, { issuer: "tracker-api" });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return undefined;
    if (typeof payload.session_version !== "number" || typeof payload.recent_auth_at !== "number") return undefined;
    return { userId: payload.sub, sid: payload.sid, sessionVersion: payload.session_version, recentAuthAt: payload.recent_auth_at };
  } catch {
    return undefined;
  }
}

export function setSessionCookie(res: { cookie: Function }, value: string) {
  res.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: { clearCookie: Function }) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: env.cookieSecure, path: "/" });
}

export function seal(value: unknown) {
  const iv = randomBytes(12);
  const key = createHash("sha256").update(env.authSecret).digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function unseal(value: string): unknown {
  try {
    const [ivValue, tagValue, ciphertextValue] = value.split(".");
    if (!ivValue || !tagValue || !ciphertextValue) return undefined;
    const key = createHash("sha256").update(env.authSecret).digest();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    return undefined;
  }
}

// OAuth transaction (state/nonce/PKCE verifier) is encrypted, signed, HttpOnly, and callback-scoped.
export function setGoogleOAuthCookie(res: { cookie: Function }, transaction: unknown) {
  res.cookie(GOOGLE_OAUTH_COOKIE, signCookie(seal(transaction)), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    maxAge: 10 * 60 * 1000,
    path: GOOGLE_OAUTH_COOKIE_PATH,
  });
}

export function readGoogleOAuthCookie(value: string | undefined): unknown {
  const raw = readSignedCookie(value);
  return raw ? unseal(raw) : undefined;
}

export function clearGoogleOAuthCookie(res: { clearCookie: Function }) {
  res.clearCookie(GOOGLE_OAUTH_COOKIE, { httpOnly: true, sameSite: "lax", secure: env.cookieSecure, path: GOOGLE_OAUTH_COOKIE_PATH });
}

export { CSRF_COOKIE, SESSION_COOKIE, GOOGLE_OAUTH_COOKIE };
