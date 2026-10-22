import nodemailer, { type Transporter } from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type MailResult = { sent: true } | { sent: false; reason: "not-configured" | "send-failed" };
export type MailSender = (message: MailMessage) => Promise<MailResult>;

export interface MailConfigurationStatus {
  configured: boolean;
  transport: "SMTP_URL" | "SMTP_HOST" | "none";
  missing: string[];
  fromConfigured: boolean;
  authenticationConfigured: boolean;
}

/**
 * Branded transactional email (password resets, team invitations, waitlist,
 * security, billing, scan and domain notifications). Sending activates with
 * SMTP credentials in the environment — any provider works (Resend,
 * Postmark, SES, Gmail SMTP, …):
 *   SMTP_URL   e.g. smtp://user:pass@host:587  (wins when present)
 *   — or —  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE=1
 *   EMAIL_FROM e.g. "Clyvro <no-reply@your-domain>"
 * Without these, `mailConfigured()` is false and the UI says so honestly
 * instead of pretending mail was sent. (The database is Neon Postgres;
 * Google sign-in runs on Firebase, which does not send this app's
 * transactional mail — SMTP is the integration point.)
 */
export function mailConfigurationStatus(): MailConfigurationStatus {
  const smtpUrl = process.env.SMTP_URL?.trim();
  const smtpHost = process.env.SMTP_HOST?.trim();
  const missing: string[] = [];
  let transport: MailConfigurationStatus["transport"] = "none";
  let validTransport = false;
  let authenticationConfigured = false;

  if (smtpUrl) {
    transport = "SMTP_URL";
    try {
      const parsed = new URL(smtpUrl);
      validTransport = (parsed.protocol === "smtp:" || parsed.protocol === "smtps:") && Boolean(parsed.hostname);
      const hasUsername = Boolean(parsed.username);
      const hasPassword = Boolean(parsed.password);
      authenticationConfigured = hasUsername && hasPassword;
      if (!validTransport) missing.push("SMTP_URL (use smtp:// or smtps://)");
      if (hasUsername && !hasPassword) missing.push("SMTP_URL password");
    } catch {
      missing.push("SMTP_URL (use a valid smtp:// or smtps:// URL)");
    }
  } else if (smtpHost) {
    transport = "SMTP_HOST";
    const port = Number(process.env.SMTP_PORT ?? 587);
    validTransport = Number.isInteger(port) && port > 0 && port <= 65_535;
    authenticationConfigured = Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
    if (!validTransport) missing.push("SMTP_PORT (valid port number)");
    if (process.env.SMTP_USER?.trim() && !process.env.SMTP_PASS?.trim()) missing.push("SMTP_PASS");
  } else {
    missing.push("SMTP_URL or SMTP_HOST");
  }

  return {
    configured: validTransport && missing.length === 0,
    transport,
    missing,
    fromConfigured: Boolean(process.env.EMAIL_FROM?.trim()),
    authenticationConfigured,
  };
}

export function mailConfigured(): boolean {
  return mailConfigurationStatus().configured;
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
        connectionTimeout: 8_000,
        greetingTimeout: 8_000,
        socketTimeout: 12_000,
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
  } catch (error) {
    const err = error as { code?: unknown; responseCode?: unknown; command?: unknown };
    // Do not log recipients, message bodies, SMTP URLs, credentials, or the
    // provider's raw response. These codes are enough to diagnose transport issues.
    console.error("[mail] delivery failed", {
      code: typeof err.code === "string" ? err.code.slice(0, 80) : undefined,
      responseCode: typeof err.responseCode === "number" ? err.responseCode : undefined,
      command: typeof err.command === "string" ? err.command.slice(0, 40) : undefined,
    });
    return { sent: false, reason: "send-failed" };
  }
};
