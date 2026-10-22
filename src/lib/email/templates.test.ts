import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  invitationEmail,
  notificationEmail,
  passwordResetEmail,
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
