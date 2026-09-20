import argon2 from "argon2";
import { normalizeEmail } from "../../lib/validation.js";
import { hashToken, randomToken } from "../../lib/tokens.js";
import type { AuthRepo, AuthTokenRow, AuthUser, GoogleIdentity } from "./repo.js";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

export type SessionIssuer = (userId: string, sessionVersion: number) => Promise<{ value: string; sid: string; recentAuthAt: number }>;

export function createAuthService(repo: AuthRepo, deps: { issueSession: SessionIssuer; seal: (value: unknown) => string }) {
  async function issueEmailToken(user: AuthUser, purpose: AuthTokenRow["purpose"], template: string) {
    await repo.invalidateTokens(user.id, purpose);
    const token = randomToken();
    await repo.createAuthToken({
      userId: user.id,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + (purpose === "password_reset" ? RESET_TTL_MS : VERIFY_TTL_MS)),
    });
    await repo.enqueueEmail({
      dedupeKey: `${purpose}:${user.id}:${token.slice(0, 8)}`,
      recipient: user.email,
      template,
      payloadCiphertext: deps.seal({ token, purpose }),
    });
  }

  async function register(input: { name: string; email: string; password: string }) {
    const email = normalizeEmail(input.email);
    const existing = await repo.findUserByEmail(email);
    if (!existing) {
      const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
      const user = await repo.createUserWithState({ name: input.name.trim(), email, passwordHash });
      await issueEmailToken(user, "email_verify", "verify-email");
    }
    // Same response whether the email is new or taken, so registration can't be used to enumerate accounts.
    return { accepted: true } as const;
  }

  async function verifyEmail(rawToken: string) {
    const token = await repo.findValidToken(hashToken(rawToken), "email_verify");
    if (!token) throw new ValidationError("Verification link is invalid or expired.");
    await repo.consumeToken(token.id);
    await repo.verifyUserEmail(token.userId);
    return { accepted: true } as const;
  }

  async function resendVerification(rawEmail: string) {
    const user = await repo.findUserByEmail(normalizeEmail(rawEmail));
    if (user && !user.emailVerifiedAt) await issueEmailToken(user, "email_verify", "verify-email");
    return { accepted: true } as const;
  }

  async function forgotPassword(rawEmail: string) {
    const user = await repo.findUserByEmail(normalizeEmail(rawEmail));
    if (user) await issueEmailToken(user, "password_reset", user.passwordHash ? "reset-password" : "google-only-instructions");
    return { accepted: true } as const;
  }

  async function resetPassword(rawToken: string, password: string) {
    const token = await repo.findValidToken(hashToken(rawToken), "password_reset");
    if (!token) throw new ValidationError("Reset link is invalid or expired.");
    await repo.consumeToken(token.id);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await repo.setUserPassword(token.userId, passwordHash, true);
    return { accepted: true } as const;
  }

  async function login(input: { email: string; password: string }) {
    const user = await repo.findUserByEmail(normalizeEmail(input.email));
    const ok = user?.passwordHash ? await argon2.verify(user.passwordHash, input.password) : false;
    if (!user || !ok) throw new AuthError("Invalid email or password.");
    const session = await deps.issueSession(user.id, user.sessionVersion);
    return { user, session };
  }

  async function logoutAll(userId: string) {
    await repo.bumpSessionVersion(userId);
    return { accepted: true } as const;
  }

  async function updateProfile(userId: string, input: { version: number; name?: string; timezone?: string }) {
    const updated = await repo.updateUserProfile(userId, input.version, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    });
    if (!updated) throw new ConflictError("VERSION_CONFLICT: profile was changed by another request.");
    return updated;
  }

  async function requestPasswordSetup(userId: string) {
    const user = await repo.findUserById(userId);
    if (!user || !user.emailVerifiedAt || user.passwordHash) throw new ValidationError("Password setup is only for verified Google-only accounts.");
    await issueEmailToken(user, "password_setup", "password-setup");
    return { accepted: true } as const;
  }

  async function confirmPasswordSetup(userId: string, rawToken: string, password: string) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const ok = await repo.consumePasswordSetupToken(userId, hashToken(rawToken), passwordHash);
    if (!ok) throw new ValidationError("Setup link is invalid, expired, or already used.");
    return { accepted: true } as const;
  }

  async function loginWithGoogle(identity: GoogleIdentity) {
    if (!identity.emailVerified) throw new ValidationError("Google account email must be verified.");
    const email = normalizeEmail(identity.email);
    const linked = await repo.findUserByProvider("google", identity.subject);
    if (linked) {
      const session = await deps.issueSession(linked.id, linked.sessionVersion);
      return { user: linked, session };
    }

    const existing = await repo.findUserByEmail(email);
    if (existing) {
      // Never auto-link by email: the owner must sign in with the existing method and link from Settings.
      throw new ConflictError("LINK_REQUIRED: this email already has an account. Log in with your existing method and link Google from Settings.");
    }

    const user = await repo.createUserWithState({
      name: identity.name.trim() || email.split("@")[0]!,
      email,
      passwordHash: null,
      emailVerifiedAt: new Date(),
    });
    await repo.createAuthAccount({ userId: user.id, provider: "google", providerAccountId: identity.subject });
    const session = await deps.issueSession(user.id, user.sessionVersion);
    return { user: { ...user, providers: ["google"] }, session };
  }

  async function createGoogleLinkIntent(userId: string, sid: string) {
    const user = await repo.findUserById(userId);
    if (!user?.emailVerifiedAt) throw new ValidationError("Verify your email before linking Google.");
    const intentToken = randomToken();
    await repo.createLinkIntent({
      userId,
      intentHash: hashToken(intentToken),
      sessionBindingHash: hashToken(sid),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    return { intentToken };
  }

  async function completeGoogleLink(input: { userId: string; sid: string; intentToken: string; identity: GoogleIdentity }) {
    if (!input.identity.emailVerified) throw new ValidationError("Google account email must be verified.");
    const user = await repo.findUserById(input.userId);
    if (!user?.emailVerifiedAt) throw new ValidationError("Verify your email before linking Google.");
    if (normalizeEmail(input.identity.email) !== user.email) throw new ConflictError("Google email must match the account email.");
    const linked = await repo.consumeGoogleLinkIntent({
      userId: input.userId,
      intentHash: hashToken(input.intentToken),
      sessionBindingHash: hashToken(input.sid),
      providerAccountId: input.identity.subject,
      email: user.email,
    });
    if (!linked) throw new ValidationError("Google link intent is invalid or expired.");
    return { accepted: true } as const;
  }

  async function unlinkGoogle(userId: string) {
    const user = await repo.findUserById(userId);
    if (!user?.passwordHash) throw new ValidationError("Set a password before unlinking Google.");
    if (!(await repo.listProviders(userId)).includes("google")) return { accepted: true } as const;
    await repo.removeAuthAccount(userId, "google");
    return { accepted: true } as const;
  }

  return {
    register,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    login,
    logoutAll,
    updateProfile,
    requestPasswordSetup,
    confirmPasswordSetup,
    loginWithGoogle,
    createGoogleLinkIntent,
    completeGoogleLink,
    unlinkGoogle,
  };
}

export class ValidationError extends Error {}
export class AuthError extends Error {}
export class ConflictError extends Error {}
