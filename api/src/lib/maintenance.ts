import type { PrismaClient } from "../generated/prisma/client.js";

export function cleanupExpiredSecurityData(db: PrismaClient, current = new Date()) {
  return db.$transaction(async (tx) => {
    const idempotency = await tx.idempotencyRecord.deleteMany({
      where: { expires_at: { lt: current } },
    });
    const rateLimits = await tx.rateLimitBucket.deleteMany({
      where: { expires_at: { lt: current } },
    });
    return {
      idempotencyRecords: idempotency.count,
      rateLimitBuckets: rateLimits.count,
    };
  });
}
