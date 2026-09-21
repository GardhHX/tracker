import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export class IdempotencyKeyError extends Error {
  readonly code = "VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "IdempotencyKeyError";
  }
}

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super("The idempotency key was already used with a different request.");
    this.name = "IdempotencyConflictError";
  }
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Idempotency payload numbers must be finite.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Idempotency payload must be valid JSON.");
}

export function hashIdempotencyPayload(payload: unknown) {
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}

export function validateIdempotencyKey(value: string | undefined) {
  if (!value || value.length < 8 || value.length > 128) {
    throw new IdempotencyKeyError("Idempotency-Key must contain 8 to 128 characters.");
  }
  return value;
}

export type IdempotencyInput = {
  userId: string;
  key: string;
  method: string;
  route: string;
  requestBody: unknown;
};

export type IdempotencyResult<T extends Prisma.InputJsonValue> = {
  status: number;
  body: T;
  replayed: boolean;
};

export function createIdempotencyExecutor(
  db: PrismaClient,
  options: { now?: () => Date; cleanupEvery?: number } = {},
) {
  const now = options.now ?? (() => new Date());
  const cleanupEvery = options.cleanupEvery ?? 100;
  let executions = 0;

  return async function execute<T extends Prisma.InputJsonValue>(
    input: IdempotencyInput,
    work: (tx: Prisma.TransactionClient) => Promise<{ status: number; body: T }>,
  ): Promise<IdempotencyResult<T>> {
    const key = validateIdempotencyKey(input.key);
    const method = input.method.toUpperCase();
    const requestHash = hashIdempotencyPayload(input.requestBody);

    executions += 1;
    if (cleanupEvery > 0 && executions % cleanupEvery === 0) {
      await db.idempotencyRecord.deleteMany({ where: { expires_at: { lt: now() } } });
    }

    return db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.userId}:${key}`}, 0))`;

      const current = now();
      const existing = await tx.idempotencyRecord.findUnique({
        where: { user_id_key: { user_id: input.userId, key } },
      });

      if (existing && existing.expires_at > current) {
        if (
          existing.method !== method ||
          existing.route !== input.route ||
          existing.request_hash !== requestHash
        ) {
          throw new IdempotencyConflictError();
        }
        return {
          status: existing.response_status,
          body: existing.response_json as T,
          replayed: true,
        };
      }

      if (existing) {
        await tx.idempotencyRecord.delete({ where: { id: existing.id } });
      }

      const response = await work(tx);
      if (response.status < 200 || response.status >= 300) {
        throw new Error("Only successful responses can be stored for idempotent replay.");
      }

      await tx.idempotencyRecord.create({
        data: {
          user_id: input.userId,
          key,
          method,
          route: input.route,
          request_hash: requestHash,
          response_status: response.status,
          response_json: response.body,
          expires_at: new Date(current.getTime() + IDEMPOTENCY_TTL_MS),
        },
      });

      return { ...response, replayed: false };
    });
  };
}
