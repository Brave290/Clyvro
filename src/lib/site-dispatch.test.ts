process.env.CLYVRO_DB_MEMORY = "1";

import { describe, expect, it } from "vitest";
import { detectDispatchTrigger } from "@/lib/services/dispatch";
import { maintenanceAllows } from "@/lib/services/site-shared";
import { workBudgetForMode } from "@/lib/scan-modes";

describe("dispatcher trigger detection", () => {
  it("labels Vercel Cron, cron-job.org, and other external callers", () => {
    expect(detectDispatchTrigger(new Headers({ "user-agent": "vercel-cron/1.0" }))).toBe("vercel-cron");
    expect(detectDispatchTrigger(new Headers({ "x-vercel-cron": "1" }))).toBe("vercel-cron");
    expect(detectDispatchTrigger(new Headers({ "user-agent": "cron-job.org/1.0" }))).toBe("cron-job.org");
    expect(detectDispatchTrigger(new Headers({ "user-agent": "curl/8" }))).toBe("external");
  });
});

describe("maintenance gate allowlist", () => {
  it("keeps admin, API, auth and the maintenance page reachable", () => {
    for (const p of ["/maintenance", "/admin", "/admin/cron", "/api/cron/health", "/sign-in", "/auth/firebase", "/robots.txt", "/sitemap.xml"]) {
      expect(maintenanceAllows(p), p).toBe(true);
    }
    for (const p of ["/", "/pricing", "/app/scan", "/scan"]) {
      expect(maintenanceAllows(p), p).toBe(false);
    }
  });
});

describe("scan speed budgets", () => {
  it("gives deep scans a far bigger slice than normal scans", () => {
    expect(workBudgetForMode("deep")).toBeGreaterThan(workBudgetForMode("strict"));
    expect(workBudgetForMode("strict")).toBeGreaterThan(workBudgetForMode("normal"));
    expect(workBudgetForMode("deep")).toBe(80);
  });
});

describe("public tick cooldown claim", () => {
  it("lets exactly one caller through per cooldown window, then reopens", async () => {
    const { createDb } = await import("@/lib/db");
    const { claimPublicTick, PUBLIC_TICK_COOLDOWN_MS } = await import("@/lib/services/dispatch");
    const db = await createDb();
    const t0 = new Date("2026-10-21T10:00:00.000Z");

    const first = await claimPublicTick({ now: t0, db });
    expect(first.claimed).toBe(true);

    // Same instant from another "instance": the atomic claim must refuse it.
    const racing = await claimPublicTick({ now: t0, db });
    expect(racing.claimed).toBe(false);
    expect(racing.retryAfterMs).toBe(PUBLIC_TICK_COOLDOWN_MS);

    // Inside the window: still refused, with a shrinking retry hint.
    const later = await claimPublicTick({ now: new Date(t0.getTime() + 60_000), db });
    expect(later.claimed).toBe(false);
    expect(later.retryAfterMs).toBe(PUBLIC_TICK_COOLDOWN_MS - 60_000);

    // Window elapsed: the next caller wins again.
    const reopened = await claimPublicTick({ now: new Date(t0.getTime() + PUBLIC_TICK_COOLDOWN_MS), db });
    expect(reopened.claimed).toBe(true);
  });

  it("serialises truly concurrent claims to a single winner", async () => {
    const { createDb } = await import("@/lib/db");
    const { claimPublicTick } = await import("@/lib/services/dispatch");
    const db = await createDb();
    const now = new Date("2026-10-21T11:00:00.000Z");
    const results = await Promise.all(Array.from({ length: 8 }, () => claimPublicTick({ now, db })));
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
  });

  it("records a public-tick dispatcher run with the caller noted", async () => {
    const { createDb } = await import("@/lib/db");
    const { runDispatcherNow, listDispatchRuns } = await import("@/lib/services/dispatch");
    const db = await createDb();
    const { runId } = await runDispatcherNow("public-tick", db, { caller: "cron-job.org" });
    const runs = await listDispatchRuns(5, db);
    const row = runs.find((r) => r.id === runId);
    expect(row?.trigger).toBe("public-tick");
    expect(row?.status).toBe("completed");
    expect((row?.summary as { caller?: string })?.caller).toBe("cron-job.org");
  });
});

describe("in-memory throttle", () => {
  it("blocks a key once it exceeds the limit inside the window and recovers afterwards", async () => {
    const { createThrottle, clientAddress } = await import("@/lib/throttle");
    const throttle = createThrottle({ windowMs: 1_000, limit: 3 });
    const t = 1_000_000;
    expect(throttle.hit("a", t)).toBe(false);
    expect(throttle.hit("a", t + 1)).toBe(false);
    expect(throttle.hit("a", t + 2)).toBe(false);
    expect(throttle.hit("a", t + 3)).toBe(true);
    expect(throttle.hit("b", t + 3)).toBe(false); // other keys unaffected
    expect(throttle.hit("a", t + 1_001)).toBe(false); // window slid past the first hits
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientAddress(new Headers())).toBe("unknown");
  });

  it("never tracks more keys than maxKeys", async () => {
    const { createThrottle } = await import("@/lib/throttle");
    const throttle = createThrottle({ windowMs: 1_000, limit: 1, maxKeys: 10 });
    for (let i = 0; i < 50; i += 1) throttle.hit(`k${i}`, 5);
    expect(throttle.size()).toBeLessThanOrEqual(10);
  });
});
