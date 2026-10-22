import { afterEach, describe, expect, it } from "vitest";
import { mailConfigurationStatus } from "@/lib/mail";

const KEYS = ["SMTP_URL", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE", "EMAIL_FROM"] as const;
const before = new Map<string, string | undefined>();

function setEnv(values: Record<string, string | undefined>) {
  for (const key of KEYS) {
    if (!before.has(key)) before.set(key, process.env[key]);
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
}

afterEach(() => {
  for (const key of KEYS) {
    const value = before.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  before.clear();
});

describe("SMTP configuration diagnostics", () => {
  it("requires an app password when SMTP username authentication is selected", () => {
    setEnv({ SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_USER: "sender@example.test", SMTP_PASS: undefined });
    const status = mailConfigurationStatus();
    expect(status.configured).toBe(false);
    expect(status.missing).toContain("SMTP_PASS");
    expect(JSON.stringify(status)).not.toContain("sender@example.test");
  });

  it("permits a valid unauthenticated SMTP relay without claiming credentials exist", () => {
    setEnv({ SMTP_HOST: "relay.example.test", SMTP_PORT: "587", SMTP_USER: undefined, SMTP_PASS: undefined });
    expect(mailConfigurationStatus()).toMatchObject({
      configured: true, transport: "SMTP_HOST", authenticationConfigured: false,
    });
  });

  it("rejects malformed SMTP URLs without returning their contents", () => {
    setEnv({ SMTP_URL: "not-a-url-with-private-user-and-password", SMTP_HOST: undefined, SMTP_USER: undefined, SMTP_PASS: undefined });
    const status = mailConfigurationStatus();
    expect(status.configured).toBe(false);
    expect(status.missing[0]).toContain("SMTP_URL");
    expect(JSON.stringify(status)).not.toContain("private-user");
    expect(JSON.stringify(status)).not.toContain("password");
  });

  it("reports only readiness flags for valid SMTP URLs, never the userinfo", () => {
    setEnv({ SMTP_URL: "smtps://private-user:private-password@mail.example.test:465", SMTP_HOST: undefined, SMTP_USER: undefined, SMTP_PASS: undefined });
    const status = mailConfigurationStatus();
    expect(status).toMatchObject({ configured: true, transport: "SMTP_URL", authenticationConfigured: true });
    expect(JSON.stringify(status)).not.toContain("private-user");
    expect(JSON.stringify(status)).not.toContain("private-password");
  });
});
