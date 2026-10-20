import nodemailer, { type Transporter } from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type MailResult = { sent: true } | { sent: false; reason: "not-configured" | "send-failed" };
export type MailSender = (message: MailMessage) => Promise<MailResult>;

/**
 * Transactional email (password resets today). Sending activates with
 * SMTP credentials in the environment — any provider works (Resend,
 * Postmark, SES, Gmail SMTP, …):
 *   SMTP_URL   e.g. smtp://user:pass@host:587  (wins when present)
 *   — or —  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE=1
 *   EMAIL_FROM e.g. "Clyvro <no-reply@your-domain>"
 * Without these, `mailConfigured()` is false and the UI says so honestly
 * instead of pretending mail was sent. (Neon itself is the database;
 * Neon's managed-auth email only serves Neon Auth users, so it cannot
 * send for this app's Auth.js accounts — SMTP is the integration point.)
 */
export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_URL?.trim() || process.env.SMTP_HOST?.trim());
}

let cachedTransport: Transporter | null = null;
function transport(): Transporter {
  if (cachedTransport) return cachedTransport;
  const url = process.env.SMTP_URL?.trim();
  cachedTransport = url
    ? nodemailer.createTransport(url)
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "1" || process.env.SMTP_PORT === "465",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
          : undefined,
      });
  return cachedTransport;
}

/** Never throws. Callers must not claim mail was sent when it wasn't. */
export const sendMail: MailSender = async (message) => {
  if (!mailConfigured()) return { sent: false, reason: "not-configured" };
  try {
    await transport().sendMail({
      from: process.env.EMAIL_FROM?.trim() || "Clyvro <no-reply@clyvro.app>",
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { sent: true };
  } catch {
    return { sent: false, reason: "send-failed" };
  }
};
