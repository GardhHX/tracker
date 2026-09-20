import assert from "node:assert/strict";
import test from "node:test";
import { createEmailSender, renderEmail } from "./mailer.js";

test("email templates create links on the configured application origin", () => {
  const verify = renderEmail("verify-email", { token: "a token", purpose: "email_verify" }, "https://tracker.example");
  const reset = renderEmail("reset-password", { token: "reset", purpose: "password_reset" }, "https://tracker.example");

  assert.match(verify.text, /https:\/\/tracker\.example\/verify-email\?token=a\+token/);
  assert.match(reset.text, /https:\/\/tracker\.example\/reset-password\?token=reset/);
});

test("console sink receives decrypted email content without SMTP", async () => {
  const output: string[] = [];
  const sender = createEmailSender({
    appOrigin: "http://127.0.0.1:5173",
    from: "Tracker <no-reply@tracker.local>",
    unseal: () => ({ token: "token-1", purpose: "email_verify" }),
    sink: { info(value: unknown) { output.push(String(value)); } },
  });

  await sender.send({ id: "one", recipient: "ada@example.com", template: "verify-email", payloadCiphertext: "sealed", attempts: 1 });
  assert.equal(output.length, 1);
  assert.match(output[0]!, /ada@example\.com/);
  assert.match(output[0]!, /verify-email\?token=token-1/);
});

test("unknown templates are rejected", () => {
  assert.throws(
    () => renderEmail("unknown", { token: "token", purpose: "email_verify" }, "https://tracker.example"),
    /Unsupported email template/,
  );
});

test("template purpose mismatches are rejected", () => {
  assert.throws(
    () => renderEmail("verify-email", { token: "token", purpose: "password_reset" }, "https://tracker.example"),
    /do not match/,
  );
});
