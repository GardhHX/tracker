export type ClaimedEmail = {
  id: string;
  recipient: string;
  template: string;
  payloadCiphertext: string | null;
  attempts: number;
};

export interface EmailOutboxStore {
  claim(input: { now: Date; limit: number; lockUntil: Date }): Promise<ClaimedEmail[]>;
  markSent(input: { id: string; attempts: number }): Promise<boolean>;
  markFailed(input: { id: string; attempts: number; retryAt: Date; terminal: boolean }): Promise<boolean>;
}

export interface EmailSender {
  send(message: ClaimedEmail): Promise<void>;
}

export type EmailWorkerLogger = {
  info(event: string, fields: { id: string; template: string; attempts: number }): void;
  error(event: string, fields: { id: string; template: string; attempts: number }): void;
};

export type EmailWorkerOptions = {
  batchSize: number;
  lockMs: number;
  maxAttempts: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  now?: () => Date;
  logger?: EmailWorkerLogger;
};

export function retryDelayMs(attempts: number, baseMs = 30_000, maxMs = 60 * 60 * 1_000) {
  return Math.min(baseMs * 2 ** Math.max(0, attempts - 1), maxMs);
}

export function createEmailOutboxProcessor(store: EmailOutboxStore, sender: EmailSender, options: EmailWorkerOptions) {
  const now = options.now ?? (() => new Date());
  const logger = options.logger;

  return {
    async processBatch() {
      const claimedAt = now();
      const messages = await store.claim({
        now: claimedAt,
        limit: options.batchSize,
        lockUntil: new Date(claimedAt.getTime() + options.lockMs),
      });

      for (const message of messages) {
        try {
          await sender.send(message);
          const stored = await store.markSent({ id: message.id, attempts: message.attempts });
          if (stored) {
            logger?.info("email_sent", { id: message.id, template: message.template, attempts: message.attempts });
          } else {
            logger?.error("email_lease_lost", { id: message.id, template: message.template, attempts: message.attempts });
          }
        } catch {
          const terminal = message.attempts >= options.maxAttempts;
          const retryAt = new Date(
            now().getTime() + retryDelayMs(message.attempts, options.retryBaseMs, options.retryMaxMs),
          );
          await store.markFailed({ id: message.id, attempts: message.attempts, retryAt, terminal });
          logger?.error(terminal ? "email_delivery_failed" : "email_delivery_retry", { id: message.id, template: message.template, attempts: message.attempts });
        }
      }

      return messages.length;
    },
  };
}
