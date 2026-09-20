import { randomUUID } from "node:crypto";
import type { AuthRepo, AuthTokenRow, AuthUser } from "./repo.js";

type Account = { userId: string; provider: string; providerAccountId: string };
type LinkIntent = { userId: string; sessionBindingHash: string; expiresAt: Date; usedAt: Date | null };

export function createInMemoryAuthRepo() {
  const users = new Map<string, AuthUser>();
  const tokens = new Map<string, AuthTokenRow>();
  const accounts = new Map<string, Account>();
  const linkIntents = new Map<string, LinkIntent>();
  const emails: { dedupeKey: string; recipient: string; template: string; payloadCiphertext?: string }[] = [];
  const accountKey = (provider: string, providerAccountId: string) => `${provider}:${providerAccountId}`;

  const repo: AuthRepo = {
    async findUserByEmail(email) {
      return [...users.values()].find((u) => u.email === email);
    },
    async findUserById(id) {
      return users.get(id);
    },
    async findUserByProvider(provider, providerAccountId) {
      const account = accounts.get(accountKey(provider, providerAccountId));
      return account ? users.get(account.userId) : undefined;
    },
    async createUserWithState({ name, email, passwordHash, emailVerifiedAt = null }) {
      const user: AuthUser = {
        id: randomUUID(),
        email,
        name,
        emailVerifiedAt,
        passwordHash,
        timezone: "Asia/Jakarta",
        sessionVersion: 1,
        version: 1,
        providers: [],
      };
      users.set(user.id, user);
      return user;
    },
    async invalidateTokens(userId, purpose) {
      for (const token of tokens.values()) {
        if (token.userId === userId && token.purpose === purpose && !token.usedAt) token.usedAt = new Date();
      }
    },
    async createAuthToken({ userId, purpose, tokenHash, expiresAt }) {
      const id = randomUUID();
      tokens.set(id, { id, userId, purpose, tokenHash, expiresAt, usedAt: null });
    },
    async findValidToken(tokenHash, purpose) {
      return [...tokens.values()].find(
        (t) => t.tokenHash === tokenHash && t.purpose === purpose && !t.usedAt && t.expiresAt.getTime() > Date.now(),
      );
    },
    async consumeToken(tokenId) {
      const token = tokens.get(tokenId);
      if (token) token.usedAt = new Date();
    },
    async verifyUserEmail(userId) {
      const user = users.get(userId);
      if (user) user.emailVerifiedAt = new Date();
    },
    async setUserPassword(userId, passwordHash, bumpSessionVersion) {
      const user = users.get(userId);
      if (!user) return;
      user.passwordHash = passwordHash;
      if (bumpSessionVersion) user.sessionVersion += 1;
    },
    async bumpSessionVersion(userId) {
      const user = users.get(userId);
      if (user) user.sessionVersion += 1;
    },
    async consumePasswordSetupToken(userId, tokenHash, passwordHash) {
      const token = await repo.findValidToken(tokenHash, "password_setup");
      const user = users.get(userId);
      if (!token || token.userId !== userId || !user?.emailVerifiedAt || user.passwordHash) return false;
      token.usedAt = new Date();
      user.passwordHash = passwordHash;
      user.sessionVersion += 1;
      return true;
    },
    async updateUserProfile(userId, version, patch) {
      const user = users.get(userId);
      if (!user || user.version !== version) return undefined;
      Object.assign(user, patch, { version: user.version + 1 });
      return user;
    },
    async createAuthAccount(input) {
      const key = accountKey(input.provider, input.providerAccountId);
      if (accounts.has(key)) throw new Error("Provider account already exists.");
      accounts.set(key, input);
      const user = users.get(input.userId);
      if (user && !user.providers.includes(input.provider)) user.providers.push(input.provider);
    },
    async createLinkIntent({ userId, intentHash, sessionBindingHash, expiresAt }) {
      linkIntents.set(intentHash, { userId, sessionBindingHash, expiresAt, usedAt: null });
    },
    async consumeGoogleLinkIntent({ userId, intentHash, sessionBindingHash, providerAccountId, email }) {
      const intent = linkIntents.get(intentHash);
      const user = users.get(userId);
      if (!intent || intent.usedAt || intent.expiresAt.getTime() <= Date.now() || intent.userId !== userId || intent.sessionBindingHash !== sessionBindingHash || user?.email !== email) return false;
      if (accounts.has(accountKey("google", providerAccountId))) return false;
      intent.usedAt = new Date();
      await repo.createAuthAccount({ userId, provider: "google", providerAccountId });
      return true;
    },
    async removeAuthAccount(userId, provider) {
      for (const [key, account] of accounts) {
        if (account.userId === userId && account.provider === provider) accounts.delete(key);
      }
      const user = users.get(userId);
      if (user) user.providers = user.providers.filter((value) => value !== provider);
    },
    async listProviders(userId) {
      return users.get(userId)?.providers ?? [];
    },
    async enqueueEmail(input) {
      emails.push(input);
    },
  };

  return { repo, users, tokens, accounts, emails };
}
