import { describe, it, expect } from "vitest";
import { nextRunAtFromFirst } from "@/lib/services/cron-jobs";

describe("nextRunAtFromFirst", () => {
  const now = new Date("2026-10-23T12:00:00.000Z");

  it("defaults to one interval from now", () => {
    expect(nextRunAtFromFirst(now, 60, null).toISOString()).toBe("2026-10-23T13:00:00.000Z");
  });

  it("honours a future clock time", () => {
    const first = new Date("2026-10-24T09:00:00.000Z");
    expect(nextRunAtFromFirst(now, 1440, first).toISOString()).toBe("2026-10-24T09:00:00.000Z");
  });

  it("rolls a past clock time forward by the interval", () => {
    const first = new Date("2026-10-23T09:00:00.000Z");
    expect(nextRunAtFromFirst(now, 1440, first).toISOString()).toBe("2026-10-24T09:00:00.000Z");
  });
});
