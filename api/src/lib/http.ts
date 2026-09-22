import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logInfo } from "./observability.js";

export function error(res: Response, status: number, code: string, message: string, fields: Record<string, string> = {}) {
  return res.status(status).json({ error: { code, message, fields, request_id: res.locals.requestId } });
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  const value = req.get("x-request-id") || randomUUID();
  res.locals.requestId = value;
  res.setHeader("X-Request-Id", value);
  next();
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  res.once("finish", () => {
    logInfo("http_request", {
      request_id: res.locals.requestId,
      method: req.method,
      status: res.statusCode,
      duration_ms: Date.now() - startedAt,
    });
  });
  next();
}

export function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req, res, next)).catch(next);
}
