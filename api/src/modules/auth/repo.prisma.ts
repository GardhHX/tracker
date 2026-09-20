import type { PrismaClient } from "../../generated/prisma/client.js";
import type { AuthRepo, AuthTokenRow, AuthUser } from "./repo.js";

type Db = PrismaClient;

type DbUserRow = {
  id: string;
  email: string;
  name: string;
  email_verified_at: Date | null;
  password_hash: string | null;
  timezone: string;
  session_version: number;
  version: number;
};

function toUser(user: DbUserRow, providers: string[] = []): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerifiedAt: user.email_verified_at,
    passwordHash: user.password_hash,
    timezone: user.timezone,
    sessionVersion: user.session_version,
    version: user.version,
    providers,
  };
}

function toToken(token: {
  id: string;
  user_id: string;
  purpose: AuthTokenRow["purpose"];
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
}): AuthTokenRow {
  return {
    id: token.id,
    userId: token.user_id,
    purpose: token.purpose,
    tokenHash: token.token_hash,
    expiresAt: token.expires_at,
    usedAt: token.used_at,
  };
}

export function createPrismaAuthRepo(db: Db): AuthRepo {
  async function providersFor(userId: string) {
    const rows = await db.authAccount.findMany({ where: { user_id: userId }, select: { provider: true } });
    return rows.map((row) => row.provider);
  }

  return {
    async findUserByEmail(email) {
      const user = await db.user.findUnique({ where: { email } });
      return user ? toUser(user, await providersFor(user.id)) : undefined;
    },
    async findUserById(id) {
      const user = await db.user.findUnique({ where: { id } });
      return user ? toUser(user, await providersFor(user.id)) : undefined;
    },
    async findUserByProvider(provider, providerAccountId) {
      const account = await db.authAccount.findUnique({
        where: { provider_provider_account_id: { provider, provider_account_id: providerAccountId } },
        include: { user: true },
      });
      if (!account) return undefined;
      return toUser(account.user, await providersFor(account.user_id));
    },
    async createUserWithState({ name, email, passwordHash, emailVerifiedAt = null }) {
      const created = await db.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { name, email, password_hash: passwordHash, email_verified_at: emailVerifiedAt } });
        await tx.pomodoroState.create({ data: { user_id: user.id } });
        return user;
      });
      return toUser(created, []);
    },
    async invalidateTokens(userId, purpose) {
      await db.authToken.updateMany({ where: { user_id: userId, purpose, used_at: null }, data: { used_at: new Date() } });
    },
    async createAuthToken({ userId, purpose, tokenHash, expiresAt }) {
      await db.authToken.create({ data: { user_id: userId, purpose, token_hash: tokenHash, expires_at: expiresAt } });
    },
    async findValidToken(tokenHash, purpose) {
      const token = await db.authToken.findFirst({
        where: { token_hash: tokenHash, purpose, used_at: null, expires_at: { gt: new Date() } },
      });
      return token ? toToken(token) : undefined;
    },
    async consumeToken(tokenId) {
      await db.authToken.updateMany({ where: { id: tokenId, used_at: null }, data: { used_at: new Date() } });
    },
    async verifyUserEmail(userId) {
      await db.user.update({ where: { id: userId }, data: { email_verified_at: new Date() } });
    },
    async setUserPassword(userId, passwordHash, bumpSessionVersion) {
      await db.user.update({
        where: { id: userId },
        data: { password_hash: passwordHash, ...(bumpSessionVersion ? { session_version: { increment: 1 } } : {}) },
      });
    },
    async bumpSessionVersion(userId) {
      await db.user.update({ where: { id: userId }, data: { session_version: { increment: 1 } } });
    },
    async consumePasswordSetupToken(userId, tokenHash, passwordHash) {
      return db.$transaction(async (tx) => {
        const token = await tx.authToken.findFirst({
          where: { user_id: userId, purpose: "password_setup", token_hash: tokenHash, used_at: null, expires_at: { gt: new Date() } },
        });
        if (!token) return false;
        const updated = await tx.user.updateMany({
          where: { id: userId, password_hash: null, email_verified_at: { not: null } },
          data: { password_hash: passwordHash, session_version: { increment: 1 } },
        });
        if (updated.count !== 1) return false;
        await tx.authToken.update({ where: { id: token.id }, data: { used_at: new Date() } });
        return true;
      });
    },
    async updateUserProfile(userId, version, patch) {
      const result = await db.user.updateManyAndReturn({
        where: { id: userId, version },
        data: { ...patch, version: { increment: 1 } },
      });
      return result[0] ? toUser(result[0], await providersFor(userId)) : undefined;
    },
    async createAuthAccount({ userId, provider, providerAccountId }) {
      await db.authAccount.create({ data: { user_id: userId, provider, provider_account_id: providerAccountId } });
    },
    async createLinkIntent({ userId, intentHash, sessionBindingHash, expiresAt }) {
      await db.authLinkIntent.create({
        data: { user_id: userId, intent_hash: intentHash, session_binding_hash: sessionBindingHash, expires_at: expiresAt },
      });
    },
    async consumeGoogleLinkIntent({ userId, intentHash, sessionBindingHash, providerAccountId, email }) {
      return db.$transaction(async (tx) => {
        const intent = await tx.authLinkIntent.findFirst({
          where: { intent_hash: intentHash, user_id: userId, session_binding_hash: sessionBindingHash, used_at: null, expires_at: { gt: new Date() } },
          include: { user: true },
        });
        if (!intent || intent.user.email !== email) return false;
        const existing = await tx.authAccount.findUnique({ where: { provider_provider_account_id: { provider: "google", provider_account_id: providerAccountId } } });
        if (existing) return false;
        await tx.authLinkIntent.update({ where: { id: intent.id }, data: { used_at: new Date() } });
        await tx.authAccount.create({ data: { user_id: userId, provider: "google", provider_account_id: providerAccountId } });
        return true;
      });
    },
    async removeAuthAccount(userId, provider) {
      await db.authAccount.deleteMany({ where: { user_id: userId, provider } });
    },
    async listProviders(userId) {
      return providersFor(userId);
    },
    async enqueueEmail({ dedupeKey, recipient, template, payloadCiphertext }) {
      await db.emailOutbox.create({
        data: { dedupe_key: dedupeKey, recipient, template, payload_ciphertext: payloadCiphertext, next_attempt_at: new Date() },
      });
    },
  };
}
