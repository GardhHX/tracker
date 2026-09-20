import { setTimeout as wait } from "node:timers/promises";
import { env } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { unseal } from "./lib/security.js";
import { createEmailSender, createSmtpTransport } from "./modules/email/mailer.js";
import { createEmailOutboxProcessor } from "./modules/email/outbox.js";
import { createPrismaEmailOutboxStore } from "./modules/email/outbox.prisma.js";

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

async function run() {
  console.info(`[tracker-email-worker] started mode=${transport ? "smtp" : "console-sink"}`);
  while (!controller.signal.aborted) {
    try {
      const count = await processor.processBatch();
      if (count >= env.emailWorkerBatchSize) continue;
    } catch (error) {
      console.error("[tracker-email-worker] batch failed", error);
    }

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
