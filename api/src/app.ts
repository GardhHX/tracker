import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { meDto } from "./lib/dto.js";
import { asyncRoute, error, requestId, requestLogger } from "./lib/http.js";
import { logError } from "./lib/observability.js";
import { createInMemoryRateLimiter, type RateLimiter } from "./lib/ratelimit.js";
import { IdempotencyConflictError, IdempotencyKeyError } from "./lib/idempotency.js";
import { loginSchema, normalizeEmail, registerSchema, resetPasswordSchema, tokenSchema, emailSchema, updateProfileSchema, passwordSetupConfirmSchema } from "./lib/validation.js";
import type { AuthRepo, AuthUser } from "./modules/auth/repo.js";
import { AuthError, ConflictError, createAuthService, ValidationError } from "./modules/auth/service.js";
import type { GoogleOAuthTransaction, GoogleProvider } from "./modules/auth/google.js";
import type { M1Service, ProjectStatus, TaskPriority, TaskStatus } from "./modules/work/types.js";
import { WorkError } from "./modules/work/types.js";
import { createProjectSchema, createTaskSchema, patchProjectSchema, patchTaskSchema, projectStatusSchema, taskStatusSchema, versionSchema } from "./modules/work/validation.js";
import type { M2Service, PomodoroPhase, PomodoroStatus, TimeboxStatus } from "./modules/m2/types.js";
import { createHabitSchema, dateParamSchema, habitScheduleSchema, patchHabitSchema, patchTimeboxSchema, pomodoroStartSchema, pomodoroVersionSchema, timeboxInputSchema } from "./modules/m2/validation.js";
import type { CategoryType, M3Service, TransactionStatus, TransactionType } from "./modules/finance/types.js";
import { FinanceError } from "./modules/finance/types.js";
import { createAccountSchema, createBudgetSchema, createCategorySchema, createTransactionSchema, financeVersionSchema, patchAccountSchema, patchBudgetSchema, patchCategorySchema, patchTransactionSchema } from "./modules/finance/validation.js";
import type { M4Service, RecurrenceStatus } from "./modules/m4/types.js";
import { M4Error } from "./modules/m4/types.js";
import { createFinanceRuleSchema, createTaskRuleSchema, m4VersionSchema, patchFinanceRuleSchema, patchTaskRuleSchema } from "./modules/m4/validation.js";
import type { M5Service } from "./modules/m5/types.js";
import { M5Error } from "./modules/m5/types.js";

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
  m1?: M1Service;
  m2?: M2Service;
  m3?: M3Service;
  m4?: M4Service;
  m5?: M5Service;
  readinessCheck?: () => Promise<void>;
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
  app.use(requestLogger);
  app.use(express.json({ limit: "32kb" }));
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (origin && !deps.allowedOrigins.includes(origin)) return error(res, 403, "CSRF_INVALID", "Request origin is not allowed.");
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, Idempotency-Key, If-Match");
      res.vary("Origin");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.get("/api/v1/healthz", (_req, res) => {
    res.json({ data: { status: "ok" } });
  });

  app.get("/api/v1/readyz", asyncRoute(async (_req, res) => {
    try {
      await deps.readinessCheck?.();
      res.json({ data: { status: "ready" } });
    } catch (cause) {
      logError("readiness_check_failed", cause, { request_id: res.locals.requestId });
      error(res, 503, "SERVICE_UNAVAILABLE", "The service is not ready.");
    }
  }));
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

  const enforceRateLimits = async (
    res: Response,
    limits: Array<{ key: string; limit: number; windowMs: number }>,
    message: string,
  ) => {
    for (const limit of limits) {
      const result = await rateLimiter.check(limit.key, limit.limit, limit.windowMs);
      if (!result.allowed) {
        res.setHeader("Retry-After", String(result.retryAfterSeconds));
        error(res, 429, "RATE_LIMITED", message);
        return false;
      }
    }
    return true;
  };

  const requireVerifiedBusiness = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as RequestWithUser).user;
    if (!user?.emailVerifiedAt) return error(res, 403, "EMAIL_UNVERIFIED", "Verify your email to use Tracker.");
    next();
  };

  const enforceBusinessRateLimit = asyncRoute(async (req, res, next) => {
    const user = (req as RequestWithUser).user!;
    if (!(await enforceRateLimits(res, [{ key: `business:${user.id}`, limit: 120, windowMs: 60 * 1000 }], "Too many requests. Try again shortly."))) return;
    next();
  });

  const enforceEmailSendRateLimit = (req: Request, res: Response, email: string) =>
    enforceRateLimits(
      res,
      [
        { key: `email-send:email:${normalizeEmail(email)}`, limit: 3, windowMs: 60 * 60 * 1000 },
        { key: `email-send:ip:${req.socket.remoteAddress ?? "unknown"}`, limit: 20, windowMs: 60 * 60 * 1000 },
      ],
      "Too many email requests. Try again later.",
    );

  app.get("/api/v1/auth/csrf", (req, res) => {
    const token = deps.security.issueCsrf(res);
    res.json({ data: { token } });
  });

  app.post("/api/v1/auth/register", body(registerSchema), asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (!(await enforceEmailSendRateLimit(req, res, email))) return;
    const result = await auth.register({ ...req.body, email });
    res.status(202).json({ data: result });
  }));

  app.post("/api/v1/auth/login", body(loginSchema), asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (!(await enforceRateLimits(
      res,
      [{ key: `login:${req.socket.remoteAddress ?? "unknown"}:${email}`, limit: 10, windowMs: 15 * 60 * 1000 }],
      "Too many login attempts. Try again later.",
    ))) return;
    const result = await auth.login({ ...req.body, email });
    deps.security.setSessionCookie(res, result.session.value);
    res.json({ data: meDto(result.user) });
  }));

  app.post("/api/v1/auth/verify-email", body(tokenSchema), asyncRoute(async (req, res) => {
    res.json({ data: await auth.verifyEmail(req.body.token) });
  }));

  app.post("/api/v1/auth/resend-verification", body(emailSchema), asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (!(await enforceEmailSendRateLimit(req, res, email))) return;
    res.status(202).json({ data: await auth.resendVerification(email) });
  }));

  app.post("/api/v1/auth/forgot-password", body(emailSchema), asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (!(await enforceEmailSendRateLimit(req, res, email))) return;
    res.status(202).json({ data: await auth.forgotPassword(email) });
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
    if (!(await enforceEmailSendRateLimit(req, res, user.email))) return;
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

  if (deps.m1) {
    const m1 = deps.m1;
    const userId = (req: Request) => (req as RequestWithUser).user!.id;
    const param = (req: Request, name: string) => {
      const value = req.params[name];
      if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new WorkError(404, "NOT_FOUND", "Resource not found.");
      return value;
    };
    const page = (req: Request) => {
      const value = req.query.page === undefined ? 1 : Number(req.query.page);
      const size = req.query.page_size === undefined ? 25 : Number(req.query.page_size);
      if (!Number.isInteger(value) || value < 1 || !Number.isInteger(size) || size < 1 || size > 100) throw new WorkError(422, "INVALID_QUERY", "page must be positive and page_size must be between 1 and 100.");
      return { page: value, pageSize: size };
    };
    const one = (req: Request, name: string) => {
      const value = req.query[name];
      if (value === undefined) return undefined;
      if (typeof value !== "string") throw new WorkError(422, "INVALID_QUERY", `${name} must appear once.`);
      return value;
    };
    const bool = (req: Request, name: string) => {
      const value = one(req, name);
      if (value === undefined) return undefined;
      if (value !== "true" && value !== "false") throw new WorkError(422, "INVALID_QUERY", `${name} must be true or false.`);
      return value === "true";
    };
    const validDate = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    const ifMatchVersion = (req: Request) => {
      const value = req.get("if-match")?.trim();
      const match = value?.match(/^(?:(?:W\/)?"([1-9]\d*)"|([1-9]\d*))$/);
      const version = match ? Number(match[1] ?? match[2]) : Number.NaN;
      if (!Number.isSafeInteger(version)) throw new WorkError(422, "INVALID_VERSION", "If-Match must contain a positive resource version.");
      return version;
    };
    const verified = [requireUser, requireVerifiedBusiness, enforceBusinessRateLimit];

    if (deps.m5) {
      const m5 = deps.m5;
      const reportInput = (req: Request) => ({ from: one(req, "from"), to: one(req, "to") });
      const sendExport = (res: Response, value: { filename: string; body: string }) => {
        res.setHeader("Content-Disposition", `attachment; filename=\"${value.filename}\"`);
        res.type("text/csv; charset=utf-8").send(value.body);
      };
      const reconcilePomodoro = async () => {
        if (deps.m2) await deps.m2.reconcileDueSessions();
      };
      const projectExportSection = (req: Request) => {
        const section = one(req, "section");
        if (section !== "tasks" && section !== "pomodoro") throw new M5Error(422, "INVALID_QUERY", "section must be tasks or pomodoro.");
        return section;
      };
      const financeExportSection = (req: Request) => {
        const section = one(req, "section");
        if (section !== "finance" && section !== "budgets") throw new M5Error(422, "INVALID_QUERY", "section must be finance or budgets.");
        return section;
      };

      app.get("/api/v1/tasks/reports/summary", ...verified, asyncRoute(async (req, res) => {
        res.json({ data: await m5.taskSummary(userId(req), reportInput(req)) });
      }));
      app.get("/api/v1/tasks/reports/export", ...verified, asyncRoute(async (req, res) => {
        sendExport(res, await m5.exportTasks(userId(req), reportInput(req)));
      }));
      app.get("/api/v1/projects/:id/reports/summary", ...verified, asyncRoute(async (req, res) => {
        await reconcilePomodoro();
        res.json({ data: await m5.projectSummary(userId(req), param(req, "id"), reportInput(req)) });
      }));
      app.get("/api/v1/projects/:id/reports/export", ...verified, asyncRoute(async (req, res) => {
        await reconcilePomodoro();
        sendExport(res, await m5.exportProject(userId(req), param(req, "id"), projectExportSection(req), reportInput(req)));
      }));
      app.get("/api/v1/habits/reports/summary", ...verified, asyncRoute(async (req, res) => {
        res.json({ data: await m5.habitSummary(userId(req), reportInput(req)) });
      }));
      app.get("/api/v1/habits/reports/export", ...verified, asyncRoute(async (req, res) => {
        sendExport(res, await m5.exportHabits(userId(req), reportInput(req)));
      }));
      app.get("/api/v1/pomodoro/reports/summary", ...verified, asyncRoute(async (req, res) => {
        await reconcilePomodoro();
        res.json({ data: await m5.pomodoroSummary(userId(req), reportInput(req)) });
      }));
      app.get("/api/v1/pomodoro/reports/export", ...verified, asyncRoute(async (req, res) => {
        await reconcilePomodoro();
        sendExport(res, await m5.exportPomodoro(userId(req), reportInput(req)));
      }));
      app.get("/api/v1/finance/reports/summary", ...verified, asyncRoute(async (req, res) => {
        res.json({ data: await m5.financeSummary(userId(req), reportInput(req)) });
      }));
      app.get("/api/v1/finance/reports/export", ...verified, asyncRoute(async (req, res) => {
        sendExport(res, await m5.exportFinance(userId(req), financeExportSection(req), reportInput(req)));
      }));
    }

    app.get("/api/v1/projects", ...verified, asyncRoute(async (req, res) => {
      const status = one(req, "status") ?? "active";
      if (!(["active", "completed", "archived", "all"] as string[]).includes(status)) throw new WorkError(422, "INVALID_QUERY", "Invalid project status filter.");
      res.json(await m1.listProjects(userId(req), { status: status as ProjectStatus | "all", ...page(req) }));
    }));
    app.post("/api/v1/projects", ...verified, body(createProjectSchema), asyncRoute(async (req, res) => {
      const result = await m1.createProject(userId(req), req.body, req.get("idempotency-key") ?? "");
      if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
      res.status(result.status).json({ data: result.data });
    }));
    app.get("/api/v1/projects/:id", ...verified, asyncRoute(async (req, res) => res.json({ data: await m1.getProject(userId(req), param(req, "id")) })));
    app.patch("/api/v1/projects/:id", ...verified, body(patchProjectSchema), asyncRoute(async (req, res) => res.json({ data: await m1.patchProject(userId(req), param(req, "id"), req.body) })));
    app.delete("/api/v1/projects/:id", ...verified, asyncRoute(async (req, res) => {
      await m1.setProjectStatus(userId(req), param(req, "id"), { version: ifMatchVersion(req), status: "archived" });
      res.status(204).end();
    }));
    app.post("/api/v1/projects/:id/status", ...verified, body(projectStatusSchema), asyncRoute(async (req, res) => res.json({ data: await m1.setProjectStatus(userId(req), param(req, "id"), req.body) })));

    app.get("/api/v1/tasks", ...verified, asyncRoute(async (req, res) => {
      const status = one(req, "status");
      const priority = one(req, "priority");
      const archivedRaw = one(req, "archived") ?? "false";
      const personal = bool(req, "personal");
      const overdue = bool(req, "overdue");
      const projectId = one(req, "project_id");
      const dueFrom = one(req, "due_from");
      const dueTo = one(req, "due_to");
      if (status && !(["todo", "in_progress", "done"] as string[]).includes(status)) throw new WorkError(422, "INVALID_QUERY", "Invalid task status filter.");
      if (priority && !(["low", "medium", "high"] as string[]).includes(priority)) throw new WorkError(422, "INVALID_QUERY", "Invalid task priority filter.");
      if (!(["true", "false", "all"] as string[]).includes(archivedRaw)) throw new WorkError(422, "INVALID_QUERY", "archived must be true, false, or all.");
      if (personal && projectId) throw new WorkError(422, "INVALID_QUERY", "personal and project_id cannot be combined.");
      if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) throw new WorkError(422, "INVALID_QUERY", "project_id must be a UUID.");
      if (overdue && status === "done") throw new WorkError(422, "INVALID_QUERY", "overdue cannot be combined with status=done.");
      if ((dueFrom && !dueTo) || (!dueFrom && dueTo)) throw new WorkError(422, "INVALID_QUERY", "due_from and due_to must be provided together.");
      if (dueFrom && dueTo && (dueFrom > dueTo || !validDate(dueFrom) || !validDate(dueTo))) throw new WorkError(422, "INVALID_QUERY", "Invalid due date range.");
      const archived = archivedRaw === "all" ? "all" : archivedRaw === "true";
      res.json(await m1.listTasks(userId(req), { status: status as TaskStatus | undefined, priority: priority as TaskPriority | undefined, projectId, personal, overdue, dueFrom, dueTo, archived, ...page(req) }));
    }));
    app.post("/api/v1/tasks", ...verified, body(createTaskSchema), asyncRoute(async (req, res) => {
      const result = await m1.createTask(userId(req), req.body, req.get("idempotency-key") ?? "");
      if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
      res.status(result.status).json({ data: result.data });
    }));
    if (deps.m4) {
      const m4 = deps.m4;
      const recurrenceStatus = (req: Request) => {
        const status = one(req, "status") ?? "active";
        if (!( ["active", "stopped", "expired", "all"] as string[]).includes(status)) throw new M4Error(422, "INVALID_QUERY", "Invalid recurrence status filter.");
        return status as RecurrenceStatus | "all";
      };
      const occurrenceRange = (req: Request) => {
        const from = one(req, "from");
        const to = one(req, "to");
        if ((from && !to) || (!from && to)) throw new M4Error(422, "INVALID_QUERY", "from and to must be a valid date pair.");
        const today = new Date().toISOString().slice(0, 10);
        const range = from && to ? { from, to } : { from: `${today.slice(0, 7)}-01`, to: today };
        if (!validDate(range.from) || !validDate(range.to) || range.from > range.to) throw new M4Error(422, "INVALID_QUERY", "from and to must be a valid date pair.");
        if ((new Date(`${range.to}T00:00:00.000Z`).getTime() - new Date(`${range.from}T00:00:00.000Z`).getTime()) / 86_400_000 >= 366) throw new M4Error(422, "RANGE_TOO_LARGE", "Date range cannot exceed 366 days.");
        return range;
      };
      const sendM4Idempotent = (res: Response, result: { status: number; replayed: boolean; data: unknown }) => {
        if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
        res.status(result.status).json({ data: result.data });
      };

      app.get("/api/v1/tasks/recurrences", ...verified, asyncRoute(async (req, res) => {
        const paging = page(req); res.json(await m4.listTaskRules(userId(req), recurrenceStatus(req), paging.page, paging.pageSize));
      }));
      app.post("/api/v1/tasks/recurrences", ...verified, body(createTaskRuleSchema), asyncRoute(async (req, res) => sendM4Idempotent(res, await m4.createTaskRule(userId(req), req.body, req.get("idempotency-key") ?? ""))));
      app.get("/api/v1/tasks/recurrences/:id/occurrences", ...verified, asyncRoute(async (req, res) => {
        const range = occurrenceRange(req); const paging = page(req);
        res.json(await m4.listTaskOccurrences(userId(req), param(req, "id"), range.from, range.to, paging.page, paging.pageSize));
      }));
      app.get("/api/v1/tasks/recurrences/:id/revisions", ...verified, asyncRoute(async (req, res) => {
        const paging = page(req); res.json(await m4.listTaskRuleRevisions(userId(req), param(req, "id"), paging.page, paging.pageSize));
      }));
      app.get("/api/v1/tasks/recurrences/:id", ...verified, asyncRoute(async (req, res) => res.json({ data: await m4.getTaskRule(userId(req), param(req, "id")) })));
      app.patch("/api/v1/tasks/recurrences/:id", ...verified, body(patchTaskRuleSchema), asyncRoute(async (req, res) => res.json({ data: await m4.patchTaskRule(userId(req), param(req, "id"), req.body) })));
      app.post("/api/v1/tasks/recurrences/:id/stop", ...verified, body(m4VersionSchema), asyncRoute(async (req, res) => res.json({ data: await m4.stopTaskRule(userId(req), param(req, "id"), req.body.version) })));
    }
    app.get("/api/v1/tasks/:id", ...verified, asyncRoute(async (req, res) => res.json({ data: await m1.getTask(userId(req), param(req, "id")) })));
    app.patch("/api/v1/tasks/:id", ...verified, body(patchTaskSchema), asyncRoute(async (req, res) => res.json({ data: await m1.patchTask(userId(req), param(req, "id"), req.body) })));
    app.delete("/api/v1/tasks/:id", ...verified, asyncRoute(async (req, res) => {
      await m1.setTaskArchived(userId(req), param(req, "id"), ifMatchVersion(req), true);
      res.status(204).end();
    }));
    app.post("/api/v1/tasks/:id/status", ...verified, body(taskStatusSchema), asyncRoute(async (req, res) => res.json({ data: await m1.setTaskStatus(userId(req), param(req, "id"), req.body) })));
    app.post("/api/v1/tasks/:id/archive", ...verified, body(versionSchema), asyncRoute(async (req, res) => res.json({ data: await m1.setTaskArchived(userId(req), param(req, "id"), req.body.version, true) })));
    app.post("/api/v1/tasks/:id/unarchive", ...verified, body(versionSchema), asyncRoute(async (req, res) => res.json({ data: await m1.setTaskArchived(userId(req), param(req, "id"), req.body.version, false) })));
    app.get("/api/v1/tasks/:id/events", ...verified, asyncRoute(async (req, res) => {
      const from = one(req, "from");
      const to = one(req, "to");
      if ((from && !to) || (!from && to) || (from && to && (from > to || !validDate(from) || !validDate(to)))) throw new WorkError(422, "INVALID_QUERY", "from and to must be a valid date pair.");
      res.json(await m1.listTaskEvents(userId(req), param(req, "id"), { from, to, ...page(req) }));
    }));
    if (deps.m4) {
      const m4 = deps.m4;
      app.get("/api/v1/tasks/:id/dependencies", ...verified, asyncRoute(async (req, res) => {
        const paging = page(req); res.json(await m4.listDependencies(userId(req), param(req, "id"), paging.page, paging.pageSize));
      }));
      app.put("/api/v1/tasks/:id/dependencies/:predecessor_id", ...verified, asyncRoute(async (req, res) => res.json({ data: await m4.setDependency(userId(req), param(req, "id"), param(req, "predecessor_id")) })));
      app.delete("/api/v1/tasks/:id/dependencies/:predecessor_id", ...verified, asyncRoute(async (req, res) => {
        await m4.deleteDependency(userId(req), param(req, "id"), param(req, "predecessor_id")); res.status(204).end();
      }));
    }

    if (deps.m2) {
      const m2 = deps.m2;
      const dateParam = (req: Request, name: string) => {
        const value = req.params[name];
        const parsed = dateParamSchema.safeParse(value);
        if (!parsed.success) throw new WorkError(404, "NOT_FOUND", "Resource not found.");
        return parsed.data;
      };
      const range = (req: Request) => {
        const from = one(req, "from");
        const to = one(req, "to");
        if ((from && !to) || (!from && to) || (from && to && (from > to || !validDate(from) || !validDate(to)))) throw new WorkError(422, "INVALID_QUERY", "from and to must be a valid date pair.");
        if (from && to && (new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) / 86_400_000 >= 366) throw new WorkError(422, "RANGE_TOO_LARGE", "Date range cannot exceed 366 days.");
        return { from, to };
      };
      const idempotent = <T extends { status: number; replayed?: boolean; data: unknown }>(res: Response, result: T) => {
        if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
        res.status(result.status).json({ data: result.data });
      };

      app.get("/api/v1/habits", ...verified, asyncRoute(async (req, res) => {
        const archivedRaw = one(req, "archived") ?? "false";
        if (!( ["true", "false", "all"] as string[]).includes(archivedRaw)) throw new WorkError(422, "INVALID_QUERY", "archived must be true, false, or all.");
        res.json(await m2.listHabits(userId(req), { archived: archivedRaw === "all" ? "all" : archivedRaw === "true", ...page(req) }));
      }));
      app.post("/api/v1/habits", ...verified, body(createHabitSchema), asyncRoute(async (req, res) => idempotent(res, await m2.createHabit(userId(req), req.body, req.get("idempotency-key") ?? ""))));
      app.get("/api/v1/habits/:id", ...verified, asyncRoute(async (req, res) => res.json({ data: await m2.getHabit(userId(req), param(req, "id")) })));
      app.patch("/api/v1/habits/:id", ...verified, body(patchHabitSchema), asyncRoute(async (req, res) => res.json({ data: await m2.patchHabit(userId(req), param(req, "id"), req.body) })));
      app.get("/api/v1/habits/:id/schedules", ...verified, asyncRoute(async (req, res) => res.json(await m2.listHabitSchedules(userId(req), param(req, "id")))));
      app.post("/api/v1/habits/:id/schedules", ...verified, body(habitScheduleSchema), asyncRoute(async (req, res) => idempotent(res, await m2.setHabitSchedule(userId(req), param(req, "id"), req.body, req.get("idempotency-key") ?? ""))));
      app.post("/api/v1/habits/:id/archive", ...verified, body(versionSchema), asyncRoute(async (req, res) => res.json({ data: await m2.archiveHabit(userId(req), param(req, "id"), req.body.version) })));
      app.get("/api/v1/habits/:id/check-ins", ...verified, asyncRoute(async (req, res) => res.json(await m2.listHabitCheckIns(userId(req), param(req, "id"), { ...range(req), ...page(req) }))));
      app.put("/api/v1/habits/:id/check-ins/:date", ...verified, asyncRoute(async (req, res) => res.json({ data: await m2.setHabitCheckIn(userId(req), param(req, "id"), dateParam(req, "date")) })));
      app.delete("/api/v1/habits/:id/check-ins/:date", ...verified, asyncRoute(async (req, res) => { await m2.deleteHabitCheckIn(userId(req), param(req, "id"), dateParam(req, "date")); res.status(204).end(); }));

      app.get("/api/v1/timebox", ...verified, asyncRoute(async (req, res) => {
        const status = one(req, "status") ?? "planned";
        const date = one(req, "date");
        if (!( ["planned", "cancelled", "all"] as string[]).includes(status)) throw new WorkError(422, "INVALID_QUERY", "Invalid timebox status.");
        if (date && !validDate(date)) throw new WorkError(422, "INVALID_QUERY", "Invalid date.");
        res.json(await m2.listTimebox(userId(req), { date, status: status as TimeboxStatus | "all", ...page(req) }));
      }));
      app.post("/api/v1/timebox", ...verified, body(timeboxInputSchema), asyncRoute(async (req, res) => idempotent(res, await m2.createTimebox(userId(req), req.body, req.get("idempotency-key") ?? ""))));
      app.get("/api/v1/timebox/:id", ...verified, asyncRoute(async (req, res) => res.json({ data: await m2.getTimebox(userId(req), param(req, "id")) })));
      app.patch("/api/v1/timebox/:id", ...verified, body(patchTimeboxSchema), asyncRoute(async (req, res) => res.json({ data: await m2.patchTimebox(userId(req), param(req, "id"), req.body) })));
      app.post("/api/v1/timebox/:id/cancel", ...verified, body(versionSchema), asyncRoute(async (req, res) => res.json({ data: await m2.cancelTimebox(userId(req), param(req, "id"), req.body.version) })));

      app.get("/api/v1/pomodoro/active", ...verified, asyncRoute(async (req, res) => { const result = await m2.getPomodoroActive(userId(req)); res.json({ data: result.data, meta: result.meta }); }));
      app.post("/api/v1/pomodoro/start", ...verified, body(pomodoroStartSchema), asyncRoute(async (req, res) => {
        const result = await m2.startPomodoro(userId(req), req.body, req.get("idempotency-key") ?? "");
        if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
        res.status(result.status ?? 201).json({ data: result.data, meta: result.meta });
      }));
      app.get("/api/v1/pomodoro/sessions", ...verified, asyncRoute(async (req, res) => {
        const phase = one(req, "phase"); const status = one(req, "status"); const taskId = one(req, "task_id"); const projectId = one(req, "project_id");
        if (phase && !( ["focus", "short_break", "long_break"] as string[]).includes(phase)) throw new WorkError(422, "INVALID_QUERY", "Invalid Pomodoro phase.");
        if (status && !( ["running", "paused", "completed", "cancelled"] as string[]).includes(status)) throw new WorkError(422, "INVALID_QUERY", "Invalid Pomodoro status.");
        res.json(await m2.listPomodoroSessions(userId(req), { ...range(req), phase: phase as PomodoroPhase | undefined, status: status as PomodoroStatus | undefined, taskId, projectId, ...page(req) }));
      }));
      app.get("/api/v1/pomodoro/sessions/:id", ...verified, asyncRoute(async (req, res) => { const result = await m2.getPomodoroSession(userId(req), param(req, "id")); res.json(result); }));
      app.post("/api/v1/pomodoro/sessions/:id/pause", ...verified, body(pomodoroVersionSchema), asyncRoute(async (req, res) => { const result = await m2.pausePomodoro(userId(req), param(req, "id"), req.body.version); res.json({ data: result.data, meta: result.meta }); }));
      app.post("/api/v1/pomodoro/sessions/:id/resume", ...verified, body(pomodoroVersionSchema), asyncRoute(async (req, res) => { const result = await m2.resumePomodoro(userId(req), param(req, "id"), req.body.version); res.json({ data: result.data, meta: result.meta }); }));
      app.post("/api/v1/pomodoro/sessions/:id/cancel", ...verified, body(pomodoroVersionSchema), asyncRoute(async (req, res) => { const result = await m2.cancelPomodoro(userId(req), param(req, "id"), req.body.version); res.json({ data: result.data, meta: result.meta }); }));
    }

    if (deps.m3) {
      const m3 = deps.m3;
      const financeRange = (req: Request) => {
        const from = one(req, "from"); const to = one(req, "to");
        if ((from && !to) || (!from && to) || (from && to && (from > to || !validDate(from) || !validDate(to)))) throw new FinanceError(422, "INVALID_QUERY", "from and to must be a valid date pair.");
        if (from && to && (new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) / 86_400_000 >= 366) throw new FinanceError(422, "RANGE_TOO_LARGE", "Date range cannot exceed 366 days.");
        return { from, to };
      };
      const archived = (req: Request) => {
        const value = one(req, "archived") ?? "false";
        if (!( ["true", "false", "all"] as string[]).includes(value)) throw new FinanceError(422, "INVALID_QUERY", "archived must be true, false, or all.");
        return value === "all" ? "all" as const : value === "true";
      };
      const sendIdempotent = (res: Response, result: { status: number; replayed: boolean; data: unknown }) => {
        if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
        res.status(result.status).json({ data: result.data });
      };

      app.get("/api/v1/finance/accounts", ...verified, asyncRoute(async (req, res) => res.json(await m3.listAccounts(userId(req), { archived: archived(req), ...page(req) }))));
      app.post("/api/v1/finance/accounts", ...verified, body(createAccountSchema), asyncRoute(async (req, res) => sendIdempotent(res, await m3.createAccount(userId(req), req.body, req.get("idempotency-key") ?? ""))));
      app.get("/api/v1/finance/accounts/:id", ...verified, asyncRoute(async (req, res) => res.json({ data: await m3.getAccount(userId(req), param(req, "id")) })));
      app.patch("/api/v1/finance/accounts/:id", ...verified, body(patchAccountSchema), asyncRoute(async (req, res) => res.json({ data: await m3.patchAccount(userId(req), param(req, "id"), req.body) })));
      app.post("/api/v1/finance/accounts/:id/archive", ...verified, body(financeVersionSchema), asyncRoute(async (req, res) => res.json({ data: await m3.archiveAccount(userId(req), param(req, "id"), req.body.version) })));
      app.get("/api/v1/finance/accounts/:id/balance-changes", ...verified, asyncRoute(async (req, res) => res.json(await m3.listBalanceChanges(userId(req), param(req, "id"), page(req)))));

      app.get("/api/v1/finance/categories", ...verified, asyncRoute(async (req, res) => {
        const type = one(req, "type");
        if (type && !( ["income", "expense"] as string[]).includes(type)) throw new FinanceError(422, "INVALID_QUERY", "Invalid category type.");
        res.json(await m3.listCategories(userId(req), { archived: archived(req), type: type as CategoryType | undefined, ...page(req) }));
      }));
      app.post("/api/v1/finance/categories", ...verified, body(createCategorySchema), asyncRoute(async (req, res) => sendIdempotent(res, await m3.createCategory(userId(req), req.body, req.get("idempotency-key") ?? ""))));
      app.get("/api/v1/finance/categories/:id", ...verified, asyncRoute(async (req, res) => res.json({ data: await m3.getCategory(userId(req), param(req, "id")) })));
      app.patch("/api/v1/finance/categories/:id", ...verified, body(patchCategorySchema), asyncRoute(async (req, res) => res.json({ data: await m3.patchCategory(userId(req), param(req, "id"), req.body) })));
      app.post("/api/v1/finance/categories/:id/archive", ...verified, body(financeVersionSchema), asyncRoute(async (req, res) => res.json({ data: await m3.archiveCategory(userId(req), param(req, "id"), req.body.version) })));

      app.get("/api/v1/finance/transactions", ...verified, asyncRoute(async (req, res) => {
        const type = one(req, "type"); const status = one(req, "status"); const accountId = one(req, "account_id"); const categoryId = one(req, "category_id");
        if (type && !( ["income", "expense", "transfer"] as string[]).includes(type)) throw new FinanceError(422, "INVALID_QUERY", "Invalid transaction type.");
        if (status && !( ["draft", "posted", "void"] as string[]).includes(status)) throw new FinanceError(422, "INVALID_QUERY", "Invalid transaction status.");
        res.json(await m3.listTransactions(userId(req), { ...financeRange(req), type: type as TransactionType | undefined, status: status as TransactionStatus | undefined, accountId, categoryId, ...page(req) }));
      }));
      app.post("/api/v1/finance/transactions", ...verified, body(createTransactionSchema), asyncRoute(async (req, res) => sendIdempotent(res, await m3.createTransaction(userId(req), req.body, req.get("idempotency-key") ?? ""))));
      app.get("/api/v1/finance/transactions/:id", ...verified, asyncRoute(async (req, res) => res.json({ data: await m3.getTransaction(userId(req), param(req, "id")) })));
      app.patch("/api/v1/finance/transactions/:id", ...verified, body(patchTransactionSchema), asyncRoute(async (req, res) => res.json({ data: await m3.patchTransaction(userId(req), param(req, "id"), req.body) })));
      app.post("/api/v1/finance/transactions/:id/post", ...verified, body(financeVersionSchema), asyncRoute(async (req, res) => sendIdempotent(res, await m3.postTransaction(userId(req), param(req, "id"), req.body.version, req.get("idempotency-key") ?? ""))));
      app.post("/api/v1/finance/transactions/:id/void", ...verified, body(financeVersionSchema), asyncRoute(async (req, res) => res.json({ data: await m3.voidTransaction(userId(req), param(req, "id"), req.body.version) })));
      app.get("/api/v1/finance/transactions/:id/revisions", ...verified, asyncRoute(async (req, res) => res.json(await m3.listRevisions(userId(req), param(req, "id"), page(req)))));

      app.get("/api/v1/finance/budgets", ...verified, asyncRoute(async (req, res) => {
        const month = one(req, "month");
        if (month && (!/^\d{4}-\d{2}-01$/.test(month) || !validDate(month))) throw new FinanceError(422, "INVALID_QUERY", "month must be the first day of a valid month.");
        res.json(await m3.listBudgets(userId(req), month, page(req)));
      }));
      app.post("/api/v1/finance/budgets", ...verified, body(createBudgetSchema), asyncRoute(async (req, res) => sendIdempotent(res, await m3.createBudget(userId(req), req.body, req.get("idempotency-key") ?? ""))));
      app.get("/api/v1/finance/budgets/:id", ...verified, asyncRoute(async (req, res) => res.json({ data: await m3.getBudget(userId(req), param(req, "id")) })));
      app.patch("/api/v1/finance/budgets/:id", ...verified, body(patchBudgetSchema), asyncRoute(async (req, res) => res.json({ data: await m3.patchBudget(userId(req), param(req, "id"), req.body) })));
      app.delete("/api/v1/finance/budgets/:id", ...verified, asyncRoute(async (req, res) => { await m3.deleteBudget(userId(req), param(req, "id"), ifMatchVersion(req)); res.status(204).end(); }));
    }

    if (deps.m4) {
      const m4 = deps.m4;
      const recurrenceStatus = (req: Request) => {
        const status = one(req, "status") ?? "active";
        if (!( ["active", "stopped", "expired", "all"] as string[]).includes(status)) throw new M4Error(422, "INVALID_QUERY", "Invalid recurrence status filter.");
        return status as RecurrenceStatus | "all";
      };
      const occurrenceRange = (req: Request) => {
        const from = one(req, "from"); const to = one(req, "to");
        if ((from && !to) || (!from && to)) throw new M4Error(422, "INVALID_QUERY", "from and to must be a valid date pair.");
        const today = new Date().toISOString().slice(0, 10);
        const range = from && to ? { from, to } : { from: `${today.slice(0, 7)}-01`, to: today };
        if (!validDate(range.from) || !validDate(range.to) || range.from > range.to) throw new M4Error(422, "INVALID_QUERY", "from and to must be a valid date pair.");
        if ((new Date(`${range.to}T00:00:00.000Z`).getTime() - new Date(`${range.from}T00:00:00.000Z`).getTime()) / 86_400_000 >= 366) throw new M4Error(422, "RANGE_TOO_LARGE", "Date range cannot exceed 366 days.");
        return range;
      };
      const sendM4Idempotent = (res: Response, result: { status: number; replayed: boolean; data: unknown }) => {
        if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
        res.status(result.status).json({ data: result.data });
      };
      app.get("/api/v1/finance/recurrences", ...verified, asyncRoute(async (req, res) => {
        const paging = page(req); res.json(await m4.listFinanceRules(userId(req), recurrenceStatus(req), paging.page, paging.pageSize));
      }));
      app.post("/api/v1/finance/recurrences", ...verified, body(createFinanceRuleSchema), asyncRoute(async (req, res) => sendM4Idempotent(res, await m4.createFinanceRule(userId(req), req.body, req.get("idempotency-key") ?? ""))));
      app.get("/api/v1/finance/recurrences/:id/occurrences", ...verified, asyncRoute(async (req, res) => {
        const range = occurrenceRange(req); const paging = page(req);
        res.json(await m4.listFinanceOccurrences(userId(req), param(req, "id"), range.from, range.to, paging.page, paging.pageSize));
      }));
      app.get("/api/v1/finance/recurrences/:id/revisions", ...verified, asyncRoute(async (req, res) => {
        const paging = page(req); res.json(await m4.listFinanceRuleRevisions(userId(req), param(req, "id"), paging.page, paging.pageSize));
      }));
      app.get("/api/v1/finance/recurrences/:id", ...verified, asyncRoute(async (req, res) => res.json({ data: await m4.getFinanceRule(userId(req), param(req, "id")) })));
      app.patch("/api/v1/finance/recurrences/:id", ...verified, body(patchFinanceRuleSchema), asyncRoute(async (req, res) => res.json({ data: await m4.patchFinanceRule(userId(req), param(req, "id"), req.body) })));
      app.post("/api/v1/finance/recurrences/:id/stop", ...verified, body(m4VersionSchema), asyncRoute(async (req, res) => res.json({ data: await m4.stopFinanceRule(userId(req), param(req, "id"), req.body.version) })));
    }
  }

  app.use((_req, res) => error(res, 404, "NOT_FOUND", "Resource not found."));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError) return error(res, 400, "INVALID_JSON", "Request body is not valid JSON.");
    if (err instanceof IdempotencyKeyError) return error(res, 422, err.code, err.message);
    if (err instanceof IdempotencyConflictError) return error(res, 409, err.code, err.message);
    if (err instanceof WorkError) return error(res, err.status, err.code, err.message, err.fields);
    if (err instanceof FinanceError) return error(res, err.status, err.code, err.message);
    if (err instanceof M4Error) return error(res, err.status, err.code, err.message);
    if (err instanceof M5Error) return error(res, err.status, err.code, err.message);
    if (err instanceof AuthError) return error(res, 401, "UNAUTHENTICATED", err.message);
    if (err instanceof ValidationError) return error(res, 422, "VALIDATION_ERROR", err.message);
    if (err instanceof ConflictError) return error(res, 409, "VERSION_CONFLICT", err.message);
    logError("unhandled_error", err, { request_id: res.locals.requestId });
    return error(res, 500, "INTERNAL_ERROR", "An internal error occurred.");
  });

  return app;
}
