import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  invitationEmail,
  notificationEmail,
  passwordResetEmail,
  paymentAbandonedEmail,
  paymentReceiptEmail,
  planExpiredEmail,
  planExpiringEmail,
  securityIncidentEmailHtml,
  smtpTestEmail,
} from "@/lib/email/templates";

describe("Clyvro branded transactional email templates", () => {
  it("escapes HTML metacharacters", () => {
    expect(escapeHtml(`<img src=x onerror="x"> & 'ok'`)).toBe("&lt;img src=x onerror=&quot;x&quot;&gt; &amp; &#39;ok&#39;");
  });

  it("renders a branded invitation with a validated link and useful text fallback", () => {
    const message = invitationEmail({
      organizationName: `<Studio & Co>`, invitedBy: "A. Owner", role: "viewer", link: "https://clyvro.vercel.app/invite/abc123",
    });
    expect(message.subject).toBe("You’re invited to <Studio & Co>");
    expect(message.subject).not.toContain("Clyvro");
    expect(message.text).toContain("https://clyvro.vercel.app/invite/abc123");
    expect(message.text.split("\n")[0]).not.toContain("Clyvro");
    expect(message.html).toContain("Clyvro");
    expect(message.html).toContain("&lt;Studio &amp; Co&gt;");
    expect(message.html).toContain("Accept your invitation to join the workspace.");
    expect(message.html).toContain("&zwnj;&nbsp;".repeat(40));
    expect(message.html).not.toContain("Join &lt;Studio &amp; Co&gt; on Clyvro.");
    expect(message.html).not.toContain("You’ve been invited to collaborate in a Clyvro workspace.");
    expect(message.html).not.toContain("<Studio & Co>");
    expect(message.html).toContain("Accept invitation");
  });

  it("rejects non-HTTP(S) action links instead of putting them in email markup", () => {
    expect(() => invitationEmail({ organizationName: "Workspace", invitedBy: "Owner", role: "member", link: "javascript:alert(1)" }))
      .toThrow("must use HTTP(S)");
    expect(() => passwordResetEmail("not-an-absolute-url")).toThrow("must be absolute URLs");
  });

  it("brands notification and test messages without rendering supplied HTML", () => {
    const notification = notificationEmail({ subject: "Update", body: "Hello <script>alert(1)</script>", kind: "waitlist_confirmation" });
    expect(notification.html).toContain("Waitlist confirmation");
    expect(notification.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(notification.html).not.toContain("<script>");
    expect(smtpTestEmail(new Date("2026-01-01T00:00:00.000Z")).html).toContain("Email delivery is working");
  });

  it("renders a payment receipt without leaking markup", () => {
    const mail = paymentReceiptEmail({
      planName: "Pro <script>", amountFormatted: "₦75,000", currency: "NGN",
      txRef: "clyvro_abc", paidAt: "2026-10-22T12:00:00.000Z", customerName: "Ada <x>",
    });
    expect(mail.subject).toContain("Pro <script>");
    expect(mail.html).toContain("Receipt");
    expect(mail.html).toContain("clyvro_abc");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).not.toContain("<script>");
    expect(mail.text).toContain("₦75,000");
  });

  it("renders an abandoned-checkout follow-up with a billing link", () => {
    const mail = paymentAbandonedEmail({ planName: "Pro", amountFormatted: "₦75,000" });
    expect(mail.subject).toMatch(/not charged/i);
    expect(mail.html).toContain("Return to billing");
    expect(mail.text).toContain("/app/billing");
  });

  it("renders plan expiry reminders without leaking markup", () => {
    const soon = planExpiringEmail({ planName: "Pro <x>", expiresAt: "2026-10-29T12:00:00.000Z", window: "7d" });
    expect(soon.subject).toContain("7 days");
    expect(soon.html).toContain("&lt;x&gt;");
    expect(soon.html).not.toContain("<x>");
    expect(soon.html).toContain("Renew on billing");
    const ended = planExpiredEmail({ planName: "Pro", expiresAt: "2026-10-22T12:00:00.000Z" });
    expect(ended.subject).toMatch(/ended/i);
    expect(ended.text).toContain("Free");
  });

  it("keeps Shield incident details escaped in the shared brand", () => {
    const html = securityIncidentEmailHtml({
      severity: "high", attackType: "<script>probe</script>", time: "now", evidence: "<img src=x>", confidence: 91,
      isConfirmed: false, actionsTaken: ["blocked <script>"], nextSteps: ["review"], eventIds: ["evt-1"],
      dashboardUrl: "https://clyvro.vercel.app/admin/security", status: "contained",
    });
    expect(html).toContain("Clyvro");
    expect(html).toContain("&lt;script&gt;probe&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x>");
  });
});
