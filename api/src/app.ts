import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { meDto } from "./lib/dto.js";
import { asyncRoute, error, requestId } from "./lib/http.js";
import { createInMemoryRateLimiter, type RateLimiter } from "./lib/ratelimit.js";
import { loginSchema, normalizeEmail, registerSchema, resetPasswordSchema, tokenSchema, emailSchema, updateProfileSchema, passwordSetupConfirmSchema } from "./lib/validation.js";
import type { AuthRepo, AuthUser } from "./modules/auth/repo.js";
import { AuthError, ConflictError, createAuthService, ValidationError } from "./modules/auth/service.js";
import type { GoogleOAuthTransaction, GoogleProvider } from "./modules/auth/google.js";

const SESSION_COOKIE = "tracker_session";
const REAUTH_WINDOW_SECONDS = 10 * 60;

type SessionClaims = { userId: string; sid: string; sessionVersion: number; recentAuthAt: number };

type Security = {
  issueSession(userId: string, sessionVersion: number): Promise<{ value: string; sid: string; recentAuthAt: number }>;
  readSession(value: string | undefined): Promise<SessionClaims | undefined>;
  setSessionCookie(res: { cookie: Function }, value: string): void;
  clearSessionCookie(res: { clearCookie: Function }): void;
  issueCsrf(res: { cookie: Function }): string;
  verifyCsrf(header: string | undefined, cookie: string | undefined): boolean;
  seal(value: unknown): string;
  setGoogleOAuthCookie?: (res: { cookie: Function }, transaction: GoogleOAuthTransaction & { flow: "login" | "link"; intentToken?: string }) => void;
  readGoogleOAuthCookie?: (value: string | undefined) => unknown;
  clearGoogleOAuthCookie?: (res: { clearCookie: Function }) => void;
};

export type AppDeps = {
  repo: AuthRepo;
  security: Security;
  allowedOrigins: string[];
  rateLimiter?: RateLimiter;
  google?: GoogleProvider;
  appOrigin?: string;
};

type RequestWithUser = Request & { user?: AuthUser };

export function createApp(deps: AppDeps): Express {
  const app = express();
  const auth = createAuthService(deps.repo, { issueSession: deps.security.issueSession, seal: deps.security.seal });
  const rateLimiter = deps.rateLimiter ?? createInMemoryRateLimiter();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cookieParser());
  app.use(requestId);
  app.use(express.json({ limit: "32kb" }));
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (origin && !deps.allowedOrigins.includes(origin)) return error(res, 403, "CSRF_INVALID", "Request origin is not allowed.");
    next();
  });
  app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.path === "/api/v1/auth/csrf") return next();
    if (!deps.security.verifyCsrf(req.get("x-csrf-token"), req.cookies?.tracker_csrf)) {
      return error(res, 403, "CSRF_INVALID", "CSRF validation failed.");
    }
    next();
  });

  const requireUser = asyncRoute(async (req, res, next) => {
    const claims = await deps.security.readSession(req.cookies?.[SESSION_COOKIE]);
    if (!claims) return error(res, 401, "UNAUTHENTICATED", "Authentication is required.");
    const user = await deps.repo.findUserById(claims.userId);
    if (!user || user.sessionVersion !== claims.sessionVersion) return error(res, 401, "UNAUTHENTICATED", "Authentication is required.");
    (req as RequestWithUser).user = user;
    (req as RequestWithUser & { claims?: typeof claims }).claims = claims;
    next();
  });

  const requireRecentAuth = (req: Request, res: Response, next: NextFunction) => {
    const claims = (req as RequestWithUser & { claims?: { recentAuthAt: number } }).claims;
    if (!claims || Math.floor(Date.now() / 1000) - claims.recentAuthAt > REAUTH_WINDOW_SECONDS) {
      return error(res, 403, "REAUTH_REQUIRED", "Log in again to continue.");
    }
    next();
  };

  const body = (schema: { safeParse(value: unknown): { success: true; data: any } | { success: false; error: unknown } }) =>
    (req: Request, res: Response, next: NextFunction) => {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return error(res, 422, "VALIDATION_ERROR", "Request validation failed.");
      req.body = parsed.data;
      next();
    };

  app.get("/api/v1/auth/csrf", (req, res) => {
    const token = deps.security.issueCsrf(res);
    res.json({ data: { token } });
  });

  app.post("/api/v1/auth/register", body(registerSchema), asyncRoute(async (req, res) => {
    const result = await auth.register(req.body);
    res.status(202).json({ data: result });
  }));

  app.post("/api/v1/auth/login", body(loginSchema), asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const rate = await rateLimiter.check(`login:${req.socket.remoteAddress ?? "unknown"}:${email}`, 10, 15 * 60 * 1000);
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds));
      return error(res, 429, "RATE_LIMITED", "Too many login attempts. Try again later.");
    }
    const result = await auth.login({ ...req.body, email });
    deps.security.setSessionCookie(res, result.session.value);
    res.json({ data: meDto(result.user) });
  }));

  app.post("/api/v1/auth/verify-email", body(tokenSchema), asyncRoute(async (req, res) => {
    res.json({ data: await auth.verifyEmail(req.body.token) });
  }));

  app.post("/api/v1/auth/resend-verification", body(emailSchema), asyncRoute(async (req, res) => {
    res.status(202).json({ data: await auth.resendVerification(req.body.email) });
  }));

  app.post("/api/v1/auth/forgot-password", body(emailSchema), asyncRoute(async (req, res) => {
    res.status(202).json({ data: await auth.forgotPassword(req.body.email) });
  }));

  app.post("/api/v1/auth/reset-password", body(resetPasswordSchema), asyncRoute(async (req, res) => {
    res.json({ data: await auth.resetPassword(req.body.token, req.body.password) });
  }));

  app.get("/api/v1/me", requireUser, (req, res) => {
    res.json({ data: meDto((req as RequestWithUser).user!) });
  });

  app.patch("/api/v1/me", requireUser, body(updateProfileSchema), asyncRoute(async (req, res) => {
    const user = (req as RequestWithUser).user!;
    if (!user.emailVerifiedAt) return error(res, 403, "EMAIL_UNVERIFIED", "Verify your email to access settings.");
    res.json({ data: meDto(await auth.updateProfile(user.id, req.body)) });
  }));

  app.post("/api/v1/auth/logout-all", requireUser, asyncRoute(async (req, res) => {
    await auth.logoutAll((req as RequestWithUser).user!.id);
    deps.security.clearSessionCookie(res);
    res.json({ data: { accepted: true } });
  }));

  app.post("/api/v1/auth/password-setup/request", requireUser, requireRecentAuth, asyncRoute(async (req, res) => {
    const user = (req as RequestWithUser).user!;
    if (!user.emailVerifiedAt) return error(res, 403, "EMAIL_UNVERIFIED", "Verify your email to access settings.");
    res.status(202).json({ data: await auth.requestPasswordSetup(user.id) });
  }));

  app.post("/api/v1/auth/password-setup/confirm", requireUser, body(passwordSetupConfirmSchema), asyncRoute(async (req, res) => {
    const user = (req as RequestWithUser).user!;
    if (!user.emailVerifiedAt) return error(res, 403, "EMAIL_UNVERIFIED", "Verify your email to access settings.");
    const result = await auth.confirmPasswordSetup(user.id, req.body.token, req.body.password);
    deps.security.clearSessionCookie(res);
    res.json({ data: result });
  }));

  if (deps.google) {
    const google = deps.google;
    const frontendOrigin = deps.appOrigin?.replace(/\/+$/, "");
    const successRedirect = frontendOrigin ? `${frontendOrigin}/dashboard` : "/dashboard";
    const failureRedirect = (code: string) => frontendOrigin ? `${frontendOrigin}/login?error=${code}` : `/login?error=${code}`;

    app.get("/api/v1/auth/google/start", asyncRoute(async (_req, res) => {
      const transaction = await google.start();
      deps.security.setGoogleOAuthCookie!(res, { flow: "login", ...transaction });
      res.redirect(302, transaction.authorizationUrl);
    }));

    app.get("/api/v1/auth/google/callback", asyncRoute(async (req, res) => {
      const state = typeof req.query.state === "string" ? req.query.state : undefined;
      const code = typeof req.query.code === "string" ? req.query.code : undefined;
      const transaction = deps.security.readGoogleOAuthCookie?.(req.cookies?.tracker_google_oauth) as
        | (GoogleOAuthTransaction & { flow: "login" | "link"; intentToken?: string })
        | undefined;
      // Single use: the transaction dies before anything else can consume it.
      deps.security.clearGoogleOAuthCookie?.(res);
      if (!code || !state || !transaction || transaction.state !== state) return res.redirect(302, failureRedirect("oauth_failed"));

      let identity;
      try {
        // The token exchange must replay the exact registered redirect URI, not an attacker-controllable Host header.
        const callbackUrl = new URL(google.callbackUri);
        callbackUrl.search = new URL(req.originalUrl, "http://localhost").search;
        identity = await google.complete({ callbackUrl: callbackUrl.href, state: transaction.state, nonce: transaction.nonce, codeVerifier: transaction.codeVerifier });
      } catch {
        return res.redirect(302, failureRedirect("oauth_failed"));
      }

      try {
        if (transaction.flow === "link") {
          const claims = await deps.security.readSession(req.cookies?.[SESSION_COOKIE]);
          if (!claims || !transaction.intentToken) return res.redirect(302, failureRedirect("link_required"));
          // The session must still be live: a revoked/rotated session can't finish a link started before it.
          const user = await deps.repo.findUserById(claims.userId);
          if (!user || user.sessionVersion !== claims.sessionVersion) return res.redirect(302, failureRedirect("link_required"));
          await auth.completeGoogleLink({ userId: claims.userId, sid: claims.sid, intentToken: transaction.intentToken, identity });
        } else {
          const result = await auth.loginWithGoogle(identity);
          deps.security.setSessionCookie(res, result.session.value);
        }
      } catch (err) {
        if (err instanceof ConflictError && err.message.startsWith("LINK_REQUIRED")) return res.redirect(302, failureRedirect("link_required"));
        return res.redirect(302, failureRedirect("oauth_failed"));
      }
      return res.redirect(302, successRedirect);
    }));

    app.post("/api/v1/auth/link/google", requireUser, requireRecentAuth, asyncRoute(async (req, res) => {
      const user = (req as RequestWithUser).user!;
      if (!user.emailVerifiedAt) return error(res, 403, "EMAIL_UNVERIFIED", "Verify your email to access settings.");
      const claims = (req as RequestWithUser & { claims: SessionClaims }).claims;
      const { intentToken } = await auth.createGoogleLinkIntent(user.id, claims.sid);
      const transaction = await google.start();
      deps.security.setGoogleOAuthCookie!(res, { flow: "link", intentToken, ...transaction });
      res.json({ data: { redirect_url: transaction.authorizationUrl } });
    }));

    app.delete("/api/v1/auth/link/google", requireUser, requireRecentAuth, asyncRoute(async (req, res) => {
      const user = (req as RequestWithUser).user!;
      if (!user.emailVerifiedAt) return error(res, 403, "EMAIL_UNVERIFIED", "Verify your email to access settings.");
      await auth.unlinkGoogle(user.id);
      res.status(204).end();
    }));
  }

  app.use((_req, res) => error(res, 404, "NOT_FOUND", "Resource not found."));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError) return error(res, 400, "INVALID_JSON", "Request body is not valid JSON.");
    if (err instanceof AuthError) return error(res, 401, "UNAUTHENTICATED", err.message);
    if (err instanceof ValidationError) return error(res, 422, "VALIDATION_ERROR", err.message);
    if (err instanceof ConflictError) return error(res, 409, "VERSION_CONFLICT", err.message);
    console.error("[tracker-api] unhandled error", err);
    return error(res, 500, "INTERNAL_ERROR", "An internal error occurred.");
  });

  return app;
}
