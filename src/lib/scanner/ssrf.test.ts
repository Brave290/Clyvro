import { describe, it, expect } from "vitest";
import { assertPublicUrl, isBlockedIp, parseIpv6, type Resolver } from "./ssrf";
import { ScanError } from "./types";

const publicResolver: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];
const resolverWith =
  (map: Record<string, { address: string; family: number }[]>): Resolver =>
  async (host) => {
    const hit = map[host];
    if (!hit) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return hit;
  };

async function expectCode(url: string, code: string, resolver: Resolver = publicResolver) {
  await expect(assertPublicUrl(url, resolver)).rejects.toMatchObject({ code });
  await expect(assertPublicUrl(url, resolver)).rejects.toBeInstanceOf(ScanError);
}

describe("isBlockedIp — IPv4 ranges", () => {
  it.each([
    "127.0.0.1", "127.255.0.9", "10.0.0.5", "172.16.0.1", "172.31.255.255",
    "192.168.1.1", "169.254.169.254", "169.254.0.1", "0.0.0.0", "0.1.2.3",
    "100.64.0.1", "100.127.255.255", "192.0.2.10", "198.51.100.7", "203.0.113.9",
    "224.0.0.1", "240.0.0.1", "255.255.255.255", "198.18.0.23",
  ])("blocks %s", (ip) => expect(isBlockedIp(ip)).toBe(true));

  it.each(["93.184.216.34", "8.8.8.8", "1.1.1.1", "100.63.255.255", "100.128.0.1", "172.15.255.255", "172.32.0.1", "192.167.1.1", "169.253.0.1"])(
    "allows public %s",
    (ip) => expect(isBlockedIp(ip)).toBe(false),
  );
});

describe("isBlockedIp — IPv6 and transition mechanisms", () => {
  it.each([
    "::1", "::", "fe80::1", "febf::1234", "fd00::1", "fc12:3456::1", "ff02::1",
    "2001:db8::1", "2001:0000::1", // Teredo
    "2002:7f00:0001::1", // 6to4 (blocked wholesale)
    "::ffff:127.0.0.1", "::ffff:10.1.2.3", "::ffff:169.254.169.254",
    "64:ff9b::7f00:1", // NAT64 embedding 127.0.0.1
    "64:ff9b::a9fe:a9fe", // NAT64 embedding 169.254.169.254
    "100::1",
  ])("blocks %s", (ip) => expect(isBlockedIp(ip)).toBe(true));

  it.each(["2606:4700:4700::1111", "::ffff:8.8.8.8", "64:ff9b::808:808" /* NAT64→8.8.8.8 */])(
    "allows public %s",
    (ip) => expect(isBlockedIp(ip)).toBe(false),
  );

  it("parses compressed and embedded-v4 forms", () => {
    expect(parseIpv6("::ffff:127.0.0.1")).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 127, 0, 0, 1]);
    expect(parseIpv6("fe80::1")).toEqual([0xfe, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6("not-an-ip")).toBeNull();
  });
});

describe("assertPublicUrl — URL-level attacks", () => {
  it("rejects non-http(s) schemes", async () => {
    await expectCode("ftp://example.com/", "BLOCKED_PROTOCOL");
    await expectCode("file:///etc/passwd", "BLOCKED_PROTOCOL");
    await expectCode("gopher://example.com/", "BLOCKED_PROTOCOL");
  });
  it("rejects embedded credentials", async () => {
    await expectCode("http://user:pass@example.com/", "BLOCKED_CREDENTIALS");
  });
  it("rejects non-standard ports but allows explicit default ports", async () => {
    await expectCode("http://example.com:8080/", "BLOCKED_PORT");
    await expectCode("https://example.com:80/", "BLOCKED_PORT");
    await expect(assertPublicUrl("https://example.com:443/", publicResolver)).resolves.toMatchObject({ hostname: "example.com" });
  });
  it("rejects localhost and internal-style hostnames", async () => {
    for (const u of [
      "http://localhost/", "http://api.localhost/", "http://printer.local/",
      "http://metadata.google.internal/", "http://intranet/", "http://nas.lan/",
    ]) await expectCode(u, "BLOCKED_HOST");
  });
  it("catches numeric-IP obfuscations via URL normalization", async () => {
    for (const u of [
      "http://2130706433/",       // 127.0.0.1 as integer
      "http://0x7f000001/",       // hex
      "http://0177.0.0.1/",       // octal
      "http://127.1/",            // shortened
      "http://2852039166/",       // 169.254.169.254 as integer (cloud metadata)
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[0:0:0:0:0:ffff:7f00:1]/",
    ]) await expectCode(u, "BLOCKED_IP");
  });
  it("allows a public IPv6 literal", async () => {
    const t = await assertPublicUrl("http://[2606:4700:4700::1111]/", publicResolver);
    expect(t.isIpLiteral).toBe(true);
    expect(t.ips).toEqual(["2606:4700:4700::1111"]);
  });
  it("rejects garbage input", async () => {
    await expectCode("not a url", "INVALID_URL");
  });
});

describe("assertPublicUrl — DNS-based attacks", () => {
  it("rejects hosts resolving to private addresses (rebinding target)", async () => {
    const r = resolverWith({ "evil.example.com": [{ address: "10.0.0.8", family: 4 }] });
    await expectCode("http://evil.example.com/", "BLOCKED_IP", r);
  });
  it("rejects when ANY resolved address is private (mixed records)", async () => {
    const r = resolverWith({
      "sneaky.example.com": [
        { address: "93.184.216.34", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ],
    });
    await expectCode("http://sneaky.example.com/", "BLOCKED_IP", r);
  });
  it("rejects IPv6 private resolution", async () => {
    const r = resolverWith({ "v6.example.com": [{ address: "fd00::ec2", family: 6 }] });
    await expectCode("http://v6.example.com/", "BLOCKED_IP", r);
  });
  it("reports DNS failure distinctly", async () => {
    await expectCode("http://missing.example.com/", "DNS_FAILED", resolverWith({}));
    await expectCode("http://empty.example.com/", "DNS_FAILED", resolverWith({ "empty.example.com": [] }));
  });
  it("returns the validated address set for pinning", async () => {
    const t = await assertPublicUrl("https://example.com/path", publicResolver);
    expect(t.ips).toEqual(["93.184.216.34"]);
    expect(t.isIpLiteral).toBe(false);
  });
});
