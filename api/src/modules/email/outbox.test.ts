import assert from "node:assert/strict";
import test from "node:test";
import { createEmailOutboxProcessor, retryDelayMs, type ClaimedEmail, type EmailOutboxStore } from "./outbox.js";

function createStore(messages: ClaimedEmail[]) {
  const sent: string[] = [];
  const failures: { id: string; retryAt: Date; terminal: boolean }[] = [];
  const store: EmailOutboxStore = {
    async claim() { return messages; },
    async markSent({ id }) { sent.push(id); return true; },
    async markFailed(input) { failures.push(input); return true; },
  };
  return { store, sent, failures };
}

test("processor marks a delivered email as sent", async () => {
  const state = createStore([{ id: "one", recipient: "a@example.com", template: "verify-email", payloadCiphertext: "sealed", attempts: 1 }]);
  const delivered: string[] = [];
  const processor = createEmailOutboxProcessor(
    state.store,
    { async send(message) { delivered.push(message.id); } },
    { batchSize: 10, lockMs: 60_000, maxAttempts: 5, logger: { info() {}, error() {} } },
  );

  assert.equal(await processor.processBatch(), 1);
  assert.deepEqual(delivered, ["one"]);
  assert.deepEqual(state.sent, ["one"]);
  assert.deepEqual(state.failures, []);
});

test("processor schedules retry and eventually marks a poison email failed", async () => {
  const clock = new Date("2026-09-20T00:00:00.000Z");
  const retryState = createStore([{ id: "retry", recipient: "a@example.com", template: "verify-email", payloadCiphertext: "bad", attempts: 2 }]);
  const retryProcessor = createEmailOutboxProcessor(
    retryState.store,
    { async send() { throw new Error("SMTP unavailable"); } },
    { batchSize: 10, lockMs: 60_000, maxAttempts: 3, retryBaseMs: 1_000, now: () => clock, logger: { info() {}, error() {} } },
  );
  await retryProcessor.processBatch();
  assert.equal(retryState.failures[0]?.terminal, false);
  assert.equal(retryState.failures[0]?.retryAt.toISOString(), "2026-09-20T00:00:02.000Z");

  const failedState = createStore([{ id: "failed", recipient: "a@example.com", template: "verify-email", payloadCiphertext: "bad", attempts: 3 }]);
  const failedProcessor = createEmailOutboxProcessor(
    failedState.store,
    { async send() { throw new Error("bad payload"); } },
    { batchSize: 10, lockMs: 60_000, maxAttempts: 3, now: () => clock, logger: { info() {}, error() {} } },
  );
  await failedProcessor.processBatch();
  assert.equal(failedState.failures[0]?.terminal, true);
});

test("retry delay doubles and is capped", () => {
  assert.equal(retryDelayMs(1, 1_000, 10_000), 1_000);
  assert.equal(retryDelayMs(3, 1_000, 10_000), 4_000);
  assert.equal(retryDelayMs(8, 1_000, 10_000), 10_000);
});
