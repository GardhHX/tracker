import { setTimeout as wait } from "node:timers/promises";
import { env } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { unseal } from "./lib/security.js";
import { createEmailSender, createSmtpTransport } from "./modules/email/mailer.js";
import { createEmailOutboxProcessor } from "./modules/email/outbox.js";
import { createPrismaEmailOutboxStore } from "./modules/email/outbox.prisma.js";
import { cleanupExpiredSecurityData } from "./lib/maintenance.js";
import { createPrismaM2Service } from "./modules/m2/service.prisma.js";

const controller = new AbortController();
if (env.nodeEnv === "production" && !env.smtpHost) {
  throw new Error("Production email worker requires SMTP_HOST; console sink is development-only.");
}
const transport = env.smtpHost
  ? createSmtpTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      user: env.smtpUser,
      pass: env.smtpPass,
    })
  : undefined;
const processor = createEmailOutboxProcessor(
  createPrismaEmailOutboxStore(prisma),
  createEmailSender({ appOrigin: env.appOrigin, from: env.smtpFrom, unseal, transport }),
  {
    batchSize: env.emailWorkerBatchSize,
    lockMs: env.emailWorkerLockMs,
    maxAttempts: env.emailWorkerMaxAttempts,
  },
);
const m2 = createPrismaM2Service(prisma);

async function run() {
  console.info(`[tracker-email-worker] started mode=${transport ? "smtp" : "console-sink"}`);
  let nextMaintenanceAt = 0;
  while (!controller.signal.aborted) {
    let count = 0;
    try {
      count = await processor.processBatch();
    } catch (error) {
      console.error("[tracker-email-worker] batch failed", error);
    }

    try {
      const reconciled = await m2.reconcileDueSessions();
      if (reconciled > 0) console.info(`[tracker-email-worker] reconciled_pomodoro_users=${reconciled}`);
    } catch (error) {
      console.error("[tracker-email-worker] Pomodoro reconciliation failed", error);
    }

    const current = Date.now();
    if (current >= nextMaintenanceAt) {
      try {
        const removed = await cleanupExpiredSecurityData(prisma, new Date(current));
        if (removed.idempotencyRecords > 0 || removed.rateLimitBuckets > 0) {
          console.info(
            `[tracker-email-worker] cleanup idempotency=${removed.idempotencyRecords} rate_limits=${removed.rateLimitBuckets}`,
          );
        }
      } catch (error) {
        console.error("[tracker-email-worker] cleanup failed", error);
      }
      nextMaintenanceAt = current + 60 * 60 * 1000;
    }

    if (count >= env.emailWorkerBatchSize) continue;

    try {
      await wait(env.emailWorkerPollMs, undefined, { signal: controller.signal });
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

try {
  await run();
} finally {
  transport?.close();
  await prisma.$disconnect();
  console.info("[tracker-email-worker] stopped");
}
