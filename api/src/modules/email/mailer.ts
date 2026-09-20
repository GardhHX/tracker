import nodemailer, { type Transporter } from "nodemailer";
import type { ClaimedEmail, EmailSender } from "./outbox.js";

type EmailPayload = {
  token: string;
  purpose: "email_verify" | "password_reset" | "password_setup";
};

type RenderedEmail = { subject: string; text: string; html: string };

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function tokenUrl(appOrigin: string, path: string, parameter: string, token: string) {
  const url = new URL(path, appOrigin);
  url.searchParams.set(parameter, token);
  return url.toString();
}

export function renderEmail(template: string, payload: EmailPayload, appOrigin: string): RenderedEmail {
  let subject: string;
  let intro: string;
  let action: string;
  let url: string;

  switch (template) {
    case "verify-email":
      if (payload.purpose !== "email_verify") throw new Error("Email template and purpose do not match.");
      subject = "Verify your Tracker email";
      intro = "Verify your email address to finish setting up your Tracker account.";
      action = "Verify email";
      url = tokenUrl(appOrigin, "/verify-email", "token", payload.token);
      break;
    case "reset-password":
      if (payload.purpose !== "password_reset") throw new Error("Email template and purpose do not match.");
      subject = "Reset your Tracker password";
      intro = "Use this link to choose a new Tracker password. The link expires in 30 minutes.";
      action = "Reset password";
      url = tokenUrl(appOrigin, "/reset-password", "token", payload.token);
      break;
    case "password-setup":
      if (payload.purpose !== "password_setup") throw new Error("Email template and purpose do not match.");
      subject = "Set your Tracker password";
      intro = "Use this link from your signed-in Tracker session to add a password to your account.";
      action = "Set password";
      url = tokenUrl(appOrigin, "/settings", "password_setup_token", payload.token);
      break;
    case "google-only-instructions":
      if (payload.purpose !== "password_reset") throw new Error("Email template and purpose do not match.");
      subject = "Sign in to your Tracker account with Google";
      intro = "This Tracker account uses Google sign-in and does not have a password to reset. Sign in with Google, then open Settings if you want to add a password.";
      action = "Open Tracker login";
      url = tokenUrl(appOrigin, "/login", "method", "google");
      break;
    default:
      throw new Error(`Unsupported email template: ${template}`);
  }

  const text = `${intro}\n\n${action}: ${url}\n\nIf you did not request this email, you can ignore it.`;
  const html = `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(action)}</a></p><p>If you did not request this email, you can ignore it.</p>`;
  return { subject, text, html };
}

function readPayload(message: ClaimedEmail, unseal: (value: string) => unknown): EmailPayload {
  if (!message.payloadCiphertext) throw new Error("Email payload is missing.");
  const value = unseal(message.payloadCiphertext);
  if (!value || typeof value !== "object") throw new Error("Email payload cannot be decrypted.");
  const payload = value as Partial<EmailPayload>;
  if (typeof payload.token !== "string" || !payload.token) throw new Error("Email token is missing.");
  if (!(["email_verify", "password_reset", "password_setup"] as const).includes(payload.purpose as EmailPayload["purpose"])) {
    throw new Error("Email purpose is invalid.");
  }
  return payload as EmailPayload;
}

export function createEmailSender(input: {
  appOrigin: string;
  from: string;
  unseal: (value: string) => unknown;
  transport?: Transporter;
  sink?: Pick<Console, "info">;
}): EmailSender {
  return {
    async send(message) {
      const email = renderEmail(message.template, readPayload(message, input.unseal), input.appOrigin);
      if (input.transport) {
        await input.transport.sendMail({
          from: input.from,
          to: message.recipient,
          messageId: `<tracker-outbox-${message.id}@tracker.local>`,
          ...email,
        });
        return;
      }
      (input.sink ?? console).info(
        `[tracker-email-sink] to=${message.recipient} subject=${email.subject}\n${email.text}`,
      );
    },
  };
}

export function createSmtpTransport(config: {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user && config.pass ? { auth: { user: config.user, pass: config.pass } } : {}),
  });
}
