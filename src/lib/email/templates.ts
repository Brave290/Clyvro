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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#F3F6FB;color:#111827;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}${PREHEADER_PADDING}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F3F6FB;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden"><tr><td style="background:#111827;padding:22px 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td><img src="${escapeHtml(baseUrl)}/clyvro-icon.png" width="30" height="30" alt="Clyvro" style="display:inline-block;vertical-align:middle;border-radius:9px;width:30px;height:30px" /><span style="display:inline-block;vertical-align:middle;margin-left:10px;color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-.3px">Clyvro</span></td><td align="right" style="color:#BFDBFE;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${escapeHtml(eyebrow)}</td></tr></table></td></tr><tr><td style="padding:32px 28px 28px"><h1 style="margin:0 0 16px;color:#111827;font-size:24px;line-height:1.3;letter-spacing:-.4px">${escapeHtml(title)}</h1>${content}${button}${noteText}</td></tr><tr><td style="border-top:1px solid #E2E8F0;padding:20px 28px 22px;color:#64748B;font-size:11px;line-height:18px">Clyvro · Website checks that speak plain English<br><a href="${escapeHtml(baseUrl)}" style="color:#2563EB;text-decoration:none">${escapeHtml(baseUrl.replace(/^https?:\/\//, ""))}</a><br>You’re receiving this transactional message because an action was taken in Clyvro.</td></tr></table><div style="max-width:560px;padding:14px 12px 0;color:#94A3B8;font-size:10px;line-height:16px;text-align:center">Please don’t reply with passwords, verification codes, or other sensitive information.</div></td></tr></table></body></html>`;
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

export function paymentReceiptEmail(input: {
  planName: string;
  amountFormatted: string;
  currency: string;
  txRef: string;
  paidAt: string;
  customerName?: string;
}): Omit<MailMessage, "to"> {
  const paid = Number.isFinite(Date.parse(input.paidAt))
    ? new Date(input.paidAt).toISOString().replace("T", " ").slice(0, 16) + " UTC"
    : input.paidAt;
  const subject = cleanHeader(`Receipt — ${input.planName} plan, ${input.amountFormatted}`);
  const text = [
    "Clyvro payment receipt",
    "",
    `Plan: ${input.planName}`,
    `Amount paid: ${input.amountFormatted} (${input.currency})`,
    `Reference: ${input.txRef}`,
    `Paid at: ${paid}`,
    input.customerName ? `Billed to: ${input.customerName}` : "",
    "",
    "This is your receipt. The plan is active for 30 days from the payment. No card details are stored by Clyvro.",
    `${siteUrl()}/app/billing`,
  ].filter(Boolean).join("\n");
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 0;color:#64748B;font-size:13px;width:40%">${escapeHtml(label)}</td><td style="padding:8px 0;color:#111827;font-size:14px;font-weight:700">${escapeHtml(value)}</td></tr>`;
  const content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${paragraph("Thanks — we received your payment. This email is your receipt.")}<tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:4px 16px">${row("Plan", input.planName)}${row("Amount", `${input.amountFormatted} · ${input.currency}`)}${row("Reference", input.txRef)}${row("Paid", paid)}${input.customerName ? row("Billed to", input.customerName) : ""}</table></td></tr>${paragraph("Your plan is active for 30 days. When it ends the workspace returns to Free unless you renew. Clyvro never stores your card number.")}</table>`;
  return {
    subject,
    text,
    html: brandedFrame({
      preheader: `Receipt for ${input.planName} — ${input.amountFormatted}.`,
      eyebrow: "Receipt",
      title: "Payment received",
      content,
      cta: { label: "View billing", url: `${siteUrl()}/app/billing` },
      note: "Keep this email for your records. It is not a tax invoice.",
    }),
  };
}

export function paymentAbandonedEmail(input: {
  planName: string;
  amountFormatted: string;
  currency?: string;
}): Omit<MailMessage, "to"> {
  const subject = cleanHeader(`You left a ${input.planName} checkout — your card was not charged`);
  const text = [
    `You started a Clyvro checkout for the ${input.planName} plan (${input.amountFormatted}) but didn't finish.`,
    "",
    "No charge was made. If that was a mistake, you can pick up where you left off here:",
    `${siteUrl()}/app/billing`,
    "",
    "If Flutterwave showed “Invalid charge request”, the card or currency was refused by Flutterwave — try another card, or make sure the Flutterwave account accepts that currency.",
  ].join("\n");
  const content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${paragraph(`You started a checkout for the ${input.planName} plan (${input.amountFormatted}) but didn't finish.`)}${paragraph("No charge was made. If you still want the plan, open billing and try again — the card form opens on that page.")}${paragraph("If Flutterwave said “Invalid charge request”, it refused the card or currency. Try another card, or check that the Flutterwave account accepts that currency.")}</table>`;
  return {
    subject,
    text,
    html: brandedFrame({
      preheader: `No charge was made for ${input.planName}.`,
      eyebrow: "Checkout",
      title: "You left checkout",
      content,
      cta: { label: "Return to billing", url: `${siteUrl()}/app/billing` },
    }),
  };
}

export function planExpiringEmail(input: {
  planName: string;
  expiresAt: string;
  window: "7d" | "1d" | string;
}): Omit<MailMessage, "to"> {
  const when = Number.isFinite(Date.parse(input.expiresAt))
    ? new Date(input.expiresAt).toISOString().replace("T", " ").slice(0, 16) + " UTC"
    : input.expiresAt;
  const soon = input.window === "1d";
  const subject = cleanHeader(soon
    ? `Your ${input.planName} plan ends tomorrow`
    : `Your ${input.planName} plan ends in 7 days`);
  const text = [
    soon
      ? `Your Clyvro ${input.planName} plan ends tomorrow (${when}).`
      : `Your Clyvro ${input.planName} plan ends in 7 days (${when}).`,
    "",
    "If you renew before then, the extra month starts from the current end date — you don't lose leftover days.",
    "If you don't renew, the workspace returns to Free. Your scans and reports stay; paid limits pause until you upgrade again.",
    "",
    `${siteUrl()}/app/billing`,
  ].join("\n");
  const content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${paragraph(soon
    ? `Your ${input.planName} plan ends tomorrow (${when}).`
    : `Your ${input.planName} plan ends in 7 days (${when}).`)}${paragraph("Renew from Billing and the extra month starts from the current end date — you don't lose leftover days. If you don't renew, the workspace returns to Free. Scans and reports stay; paid limits pause until you upgrade again.")}</table>`;
  return {
    subject,
    text,
    html: brandedFrame({
      preheader: soon ? `${input.planName} ends tomorrow.` : `${input.planName} ends in 7 days.`,
      eyebrow: "Billing",
      title: soon ? "Your plan ends tomorrow" : "Your plan ends in 7 days",
      content,
      cta: { label: "Renew on billing", url: `${siteUrl()}/app/billing` },
    }),
  };
}

export function planExpiredEmail(input: {
  planName: string;
  expiresAt: string;
}): Omit<MailMessage, "to"> {
  const when = Number.isFinite(Date.parse(input.expiresAt))
    ? new Date(input.expiresAt).toISOString().replace("T", " ").slice(0, 16) + " UTC"
    : input.expiresAt;
  const subject = cleanHeader(`Your ${input.planName} plan has ended — the workspace is on Free`);
  const text = [
    `Your Clyvro ${input.planName} plan ended on ${when}.`,
    "",
    "The workspace is now on Free. Your scans and reports are still there. Paid limits (extra scans, scheduled re-checks, team seats) pause until you renew.",
    "",
    `${siteUrl()}/app/billing`,
  ].join("\n");
  const content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${paragraph(`Your ${input.planName} plan ended on ${when}.`)}${paragraph("The workspace is now on Free. Scans and reports stay. Paid limits pause until you renew.")}</table>`;
  return {
    subject,
    text,
    html: brandedFrame({
      preheader: `${input.planName} has ended. The workspace is on Free.`,
      eyebrow: "Billing",
      title: "Your plan has ended",
      content,
      cta: { label: "Renew on billing", url: `${siteUrl()}/app/billing` },
    }),
  };
}

export function parseBillingEmailBody(kind: string, body: string): Record<string, string> | null {
  if (kind !== "payment_receipt" && kind !== "payment_abandoned" && kind !== "plan_expiring" && kind !== "plan_expired") return null;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
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
    payment_receipt: "Receipt",
    payment_abandoned: "Checkout",
    payment_received: "Billing update",
    plan_expiring: "Billing",
    plan_expired: "Billing",
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
