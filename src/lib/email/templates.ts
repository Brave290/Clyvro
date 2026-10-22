import type { MailMessage } from "@/lib/mail";

const DEFAULT_SITE_URL = "https://clyvro.vercel.app";
const PREHEADER_PADDING = "&zwnj;&nbsp;".repeat(40);

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

function checkedUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("Email action links must be absolute URLs.");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    throw new TypeError("Email action links must use HTTP(S) and cannot include credentials.");
  }
  return url.toString();
}

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 200);
}

function siteUrl(): string {
  const candidate = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  try {
    return checkedUrl(candidate || DEFAULT_SITE_URL).replace(/\/$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}

interface FrameOptions {
  preheader: string;
  eyebrow: string;
  title: string;
  content: string;
  cta?: { label: string; url: string };
  note?: string;
}

function brandedFrame({ preheader, eyebrow, title, content, cta, note }: FrameOptions): string {
  const button = cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 8px"><tr><td><a href="${escapeHtml(checkedUrl(cta.url))}" style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:700;padding:13px 22px;border-radius:9px">${escapeHtml(cta.label)}</a></td></tr></table>`
    : "";
  const noteText = note
    ? `<p style="margin:14px 0 0;color:#5A6B84;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px">${escapeHtml(note)}</p>`
    : "";
  const baseUrl = siteUrl();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#F3F6FB;color:#111827;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}${PREHEADER_PADDING}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F3F6FB;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden"><tr><td style="background:#111827;padding:22px 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td><img src="${escapeHtml(baseUrl)}/clyvro-icon.png" width="30" height="30" alt="Clyvro" style="display:inline-block;vertical-align:middle;border-radius:9px;width:30px;height:30px" /><span style="display:inline-block;vertical-align:middle;margin-left:10px;color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-.3px">Clyvro</span></td><td align="right" style="color:#BFDBFE;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${escapeHtml(eyebrow)}</td></tr></table></td></tr><tr><td style="padding:32px 28px 28px"><h1 style="margin:0 0 16px;color:#111827;font-size:24px;line-height:1.3;letter-spacing:-.4px">${escapeHtml(title)}</h1>${content}${button}${noteText}</td></tr><tr><td style="border-top:1px solid #E2E8F0;padding:20px 28px 22px;color:#64748B;font-size:11px;line-height:18px">Clyvro · Evidence-first website monitoring<br><a href="${escapeHtml(baseUrl)}" style="color:#2563EB;text-decoration:none">${escapeHtml(baseUrl.replace(/^https?:\/\//, ""))}</a><br>You’re receiving this transactional message because an action was taken in Clyvro.</td></tr></table><div style="max-width:560px;padding:14px 12px 0;color:#94A3B8;font-size:10px;line-height:16px;text-align:center">Please don’t reply with passwords, verification codes, or other sensitive information.</div></td></tr></table></body></html>`;
}

function paragraph(text: string): string {
  return `<tr><td style="padding:0 0 16px;color:#475569;font-size:15px;line-height:24px">${escapeHtml(text)}</td></tr>`;
}

export function invitationEmail(input: {
  organizationName: string;
  invitedBy: string;
  role: string;
  link: string;
}): Omit<MailMessage, "to"> {
  const role = input.role.charAt(0).toUpperCase() + input.role.slice(1);
  const subject = cleanHeader(`You’re invited to ${input.organizationName}`);
  const safeLink = checkedUrl(input.link);
  const text = [
    `You’ve been invited to join ${input.organizationName}.`,
    `${input.invitedBy} invited you as a ${role}.`,
    "",
    "Accept the invitation using this link (it expires in 7 days and is for the invited email address only):",
    safeLink,
    "",
    "If you weren’t expecting this invitation, you can ignore this message.",
  ].join("\n");
  const content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${paragraph("You’ve been invited to collaborate in this workspace.")}${paragraph(`${input.invitedBy} invited you to join ${input.organizationName} as a ${role}. The invitation is valid for 7 days and can only be accepted by the invited email address.`)}</table>`;
  return {
    subject,
    text,
    html: brandedFrame({
      preheader: "Accept your invitation to join the workspace.",
      eyebrow: "Workspace invitation",
      title: `Join ${input.organizationName}`,
      content,
      cta: { label: "Accept invitation", url: safeLink },
      note: "If you weren’t expecting this invitation, you can ignore this message.",
    }),
  };
}

export function passwordResetEmail(link: string): Omit<MailMessage, "to"> {
  const safeLink = checkedUrl(link);
  const text = [
    "You asked to reset your Clyvro password.",
    "",
    "Choose a new password using this single-use link (valid for 1 hour):",
    safeLink,
    "",
    "If you didn’t ask for this, ignore this message. Your password will stay the same.",
  ].join("\n");
  const content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${paragraph("You asked to reset your Clyvro password. Use the button below to choose a new password.")}${paragraph("This single-use link expires in 1 hour. If you didn’t request a reset, ignore this message; your password will stay the same.")}</table>`;
  return {
    subject: "Reset your Clyvro password",
    text,
    html: brandedFrame({
      preheader: "Reset your Clyvro password using a one-time link.",
      eyebrow: "Account security",
      title: "Reset your password",
      content,
      cta: { label: "Choose a new password", url: safeLink },
      note: "For your protection, never forward or share this one-time link.",
    }),
  };
}

export function notificationEmail(input: { subject: string; body: string; kind: string }): Omit<MailMessage, "to"> {
  const lines = input.body.split(/\r?\n/);
  const content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${lines.map((line) => line
    ? `<tr><td style="padding:0 0 10px;color:#475569;font-size:14px;line-height:22px">${escapeHtml(line)}</td></tr>`
    : `<tr><td style="height:8px;font-size:1px;line-height:8px">&nbsp;</td></tr>`).join("")}</table>`;
  const labels: Record<string, string> = {
    waitlist_confirmation: "Waitlist confirmation",
    waitlist_signup: "Waitlist update",
    security_incident: "Security alert",
    "security-incident": "Security alert",
    billing: "Billing update",
    scan_complete: "Scan update",
  };
  return {
    subject: cleanHeader(input.subject),
    text: input.body,
    html: brandedFrame({
      preheader: input.body.replace(/\s+/g, " ").slice(0, 145),
      eyebrow: labels[input.kind] ?? "Workspace update",
      title: cleanHeader(input.subject),
      content,
      note: "This is an automated transactional email from Clyvro.",
    }),
  };
}

export function smtpTestEmail(sentAt: Date): Omit<MailMessage, "to"> {
  const time = sentAt.toISOString();
  const text = `Clyvro’s transactional email check was delivered successfully.\n\nVerified at: ${time}\n\nThis confirms that this deployment could hand a message to the configured SMTP provider. It does not guarantee delivery to every recipient or inbox placement.`;
  const content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${paragraph("Clyvro successfully handed a test message to the configured SMTP provider.")}${paragraph(`Check time: ${time}. This confirms provider acceptance for this message; it does not guarantee inbox placement or delivery to every recipient.`)}</table>`;
  return {
    subject: "Clyvro email delivery check",
    text,
    html: brandedFrame({
      preheader: "The Clyvro SMTP delivery check succeeded.",
      eyebrow: "Delivery check",
      title: "Email delivery is working",
      content,
      note: "This check was requested by a Clyvro administrator and sent only to their signed-in address.",
    }),
  };
}

export function securityIncidentEmailHtml(input: {
  severity: string; attackType: string; time: string; evidence: string; confidence: number;
  isConfirmed: boolean; actionsTaken: string[]; nextSteps: string[]; eventIds: string[];
  dashboardUrl: string; status: string;
}): string {
  const severity = cleanHeader(input.severity).toUpperCase();
  const details = [
    `${input.attackType} detected`,
    `Detected at ${input.time} · Status: ${input.status} · Confidence: ${input.confidence}% · ${input.isConfirmed ? "Confirmed" : "Suspected"}`,
    `Evidence: ${input.evidence}`,
    `Actions taken: ${input.actionsTaken.join("; ") || "None"}`,
    `Recommended next steps: ${input.nextSteps.join("; ") || "Review the security dashboard."}`,
    `Event IDs: ${input.eventIds.join(", ")}`,
    `Security dashboard: ${checkedUrl(input.dashboardUrl)}`,
  ].join("\n\n");
  return notificationEmail({ subject: `[Clyvro Shield] ${severity}: ${input.attackType}`, body: details, kind: "security-incident" }).html!;
}
