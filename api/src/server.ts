import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env, googleEnabled } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { clearGoogleOAuthCookie, clearSessionCookie, createSession, readGoogleOAuthCookie, readSession, seal, setCsrfCookie, setGoogleOAuthCookie, setSessionCookie, verifyCsrf } from "./lib/security.js";
import { createGoogleProvider } from "./modules/auth/google.js";
import { createPrismaAuthRepo } from "./modules/auth/repo.prisma.js";
import { createPostgresRateLimiter } from "./lib/ratelimit.js";
import { createPrismaM1Service } from "./modules/work/service.prisma.js";
import { createPrismaM2Service } from "./modules/m2/service.prisma.js";
import { createPrismaM3Service } from "./modules/finance/service.prisma.js";

const app = createApp({
  repo: createPrismaAuthRepo(prisma),
  security: {
    issueSession: createSession,
    readSession,
    setSessionCookie,
    clearSessionCookie,
    issueCsrf: setCsrfCookie,
    verifyCsrf,
    seal,
    setGoogleOAuthCookie,
    readGoogleOAuthCookie,
    clearGoogleOAuthCookie,
  },
  allowedOrigins: env.allowedOrigins,
  appOrigin: env.appOrigin,
  rateLimiter: createPostgresRateLimiter(prisma, env.authSecret),
  m1: createPrismaM1Service(prisma),
  m2: createPrismaM2Service(prisma),
  m3: createPrismaM3Service(prisma),
  ...(googleEnabled
    ? { google: createGoogleProvider({ clientId: env.googleClientId!, clientSecret: env.googleClientSecret!, redirectUri: env.googleRedirectUri }) }
    : {}),
});

const server = createServer(app);
server.listen(env.port, () => {
  console.log(`[tracker-api] listening on http://127.0.0.1:${env.port} (${env.nodeEnv})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => void prisma.$disconnect().finally(() => process.exit(0)));
  });
}
