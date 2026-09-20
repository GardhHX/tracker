export type AuthUser = {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  timezone: string;
  sessionVersion: number;
  version: number;
  providers: string[];
};

export type AuthTokenRow = {
  id: string;
  userId: string;
  purpose: "email_verify" | "password_reset" | "password_setup";
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export type GoogleIdentity = {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

export interface AuthRepo {
  findUserByEmail(email: string): Promise<AuthUser | undefined>;
  findUserById(id: string): Promise<AuthUser | undefined>;
  findUserByProvider(provider: string, providerAccountId: string): Promise<AuthUser | undefined>;
  createUserWithState(input: { name: string; email: string; passwordHash: string | null; emailVerifiedAt?: Date | null }): Promise<AuthUser>;
  invalidateTokens(userId: string, purpose: AuthTokenRow["purpose"]): Promise<void>;
  createAuthToken(input: { userId: string; purpose: AuthTokenRow["purpose"]; tokenHash: string; expiresAt: Date }): Promise<void>;
  findValidToken(tokenHash: string, purpose: AuthTokenRow["purpose"]): Promise<AuthTokenRow | undefined>;
  consumeToken(tokenId: string): Promise<void>;
  verifyUserEmail(userId: string): Promise<void>;
  setUserPassword(userId: string, passwordHash: string, bumpSessionVersion: boolean): Promise<void>;
  bumpSessionVersion(userId: string): Promise<void>;
  consumePasswordSetupToken(userId: string, tokenHash: string, passwordHash: string): Promise<boolean>;
  updateUserProfile(userId: string, version: number, patch: { name?: string; timezone?: string }): Promise<AuthUser | undefined>;
  createAuthAccount(input: { userId: string; provider: string; providerAccountId: string }): Promise<void>;
  createLinkIntent(input: { userId: string; intentHash: string; sessionBindingHash: string; expiresAt: Date }): Promise<void>;
  consumeGoogleLinkIntent(input: { userId: string; intentHash: string; sessionBindingHash: string; providerAccountId: string; email: string }): Promise<boolean>;
  removeAuthAccount(userId: string, provider: string): Promise<void>;
  listProviders(userId: string): Promise<string[]>;
  enqueueEmail(input: { dedupeKey: string; recipient: string; template: string; payloadCiphertext?: string }): Promise<void>;
}
