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
