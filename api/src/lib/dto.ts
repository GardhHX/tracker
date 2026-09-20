import type { AuthUser } from "../modules/auth/repo.js";

export function meDto(user: AuthUser) {
  const base = {
    id: user.id,
    email: user.email,
    name: user.name,
    email_verified_at: user.emailVerifiedAt?.toISOString() ?? null,
    version: user.version,
  };
  return user.emailVerifiedAt
    ? { ...base, timezone: user.timezone, has_password: Boolean(user.passwordHash), providers: user.providers }
    : base;
}

export function accepted() {
  return { accepted: true } as const;
}
