process.env.CLYVRO_DB_MEMORY = "1";

import { describe, expect, it } from "vitest";
import { SEND_ALL_MAIL_COOLDOWN_MS, enqueueNotification, flushAllPendingMail } from "@/lib/services/notifications";

describe("notification outbox send-all", () => {
  it("sends every pending row in one admin pass, then cools down", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const { notificationOutbox } = await import("@/lib/db/schema");

    for (let i = 0; i < 29; i++) {
      await db.insert(notificationOutbox).values({
        id: `mail-${i}`,
        kind: "scan_completed",
        dedupeKey: `scan-all:${i}`,
        toEmail: `user${i}@example.com`,
        subject: "Scan done",
        body: "Finished.",
        status: "pending",
      });
    }

    const sentTo: string[] = [];
    const t0 = new Date("2026-10-23T12:00:00.000Z");
    const first = await flushAllPendingMail({
      now: t0,
      sender: async (m) => { sentTo.push(m.to); return { sent: true } as const; },
    }, db);
    expect(first.sent).toBe(29);
    expect(first.pendingLeft).toBe(0);
    expect(sentTo).toHaveLength(29);

    await expect(flushAllPendingMail({
      now: t0,
      sender: async () => ({ sent: true } as const),
    }, db)).rejects.toThrow(/cooling down/);

    const later = await flushAllPendingMail({
      now: new Date(t0.getTime() + SEND_ALL_MAIL_COOLDOWN_MS),
      sender: async () => ({ sent: true } as const),
    }, db);
    expect(later.sent).toBe(0);
  });

  it("a newly queued event is handed to SMTP immediately (scans, payments, …)", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const created = await enqueueNotification({
      kind: "scan_completed",
      dedupeKey: "scan-now:1",
      toEmail: "scan@example.com",
      subject: "Scan done",
      body: "Finished.",
    }, db);
    expect(created).toBe(true);
    const { notificationOutbox } = await import("@/lib/db/schema");
    const [row] = await db.select().from(notificationOutbox);
    // No SMTP in tests — row stays pending instead of pretending it sent.
    expect(row.status).toBe("pending");
    expect(row.lastError).toMatch(/not configured/i);
  });
});
