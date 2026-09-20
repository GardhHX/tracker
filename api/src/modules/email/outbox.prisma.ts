import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type { ClaimedEmail, EmailOutboxStore } from "./outbox.js";

type ClaimedRow = {
  id: string;
  recipient: string;
  template: string;
  payload_ciphertext: string | null;
  attempts: number;
};

export function createPrismaEmailOutboxStore(db: PrismaClient): EmailOutboxStore {
  return {
    async claim({ now, limit, lockUntil }) {
      const rows = await db.$transaction((tx) =>
        tx.$queryRaw<ClaimedRow[]>(Prisma.sql`
          WITH candidates AS (
            SELECT id
            FROM email_outbox
            WHERE
              (status = 'pending' AND next_attempt_at <= ${now})
              OR (status = 'sending' AND locked_until <= ${now})
            ORDER BY next_attempt_at ASC, created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT ${limit}
          )
          UPDATE email_outbox AS outbox
          SET
            status = 'sending',
            attempts = outbox.attempts + 1,
            locked_until = ${lockUntil},
            updated_at = ${now}
          FROM candidates
          WHERE outbox.id = candidates.id
          RETURNING outbox.id, outbox.recipient, outbox.template, outbox.payload_ciphertext, outbox.attempts
        `),
      );

      return rows.map<ClaimedEmail>((row) => ({
        id: row.id,
        recipient: row.recipient,
        template: row.template,
        payloadCiphertext: row.payload_ciphertext,
        attempts: row.attempts,
      }));
    },
    async markSent({ id, attempts }) {
      const result = await db.emailOutbox.updateMany({
        where: { id, status: "sending", attempts },
        data: { status: "sent", locked_until: null, payload_ciphertext: null },
      });
      return result.count === 1;
    },
    async markFailed({ id, attempts, retryAt, terminal }) {
      const result = await db.emailOutbox.updateMany({
        where: { id, status: "sending", attempts },
        data: terminal
          ? { status: "failed", locked_until: null, payload_ciphertext: null }
          : { status: "pending", locked_until: null, next_attempt_at: retryAt },
      });
      return result.count === 1;
    },
  };
}
