import { NextResponse } from "next/server";
import { apiError, clientIp, readJsonBody } from "@/lib/api";
import { guardJsonBody } from "@/lib/shield/body";
import { joinWaitlist } from "@/lib/services/waitlist";
import { flushNotificationOutbox } from "@/lib/services/notifications";
import { mailConfigured } from "@/lib/mail";

export const runtime = "nodejs";

/** Public waitlist signup: stored in the database and emailed via the outbox. */
export async function POST(req: Request) {
  try {
    const body = await readJsonBody(req, 4_096);
    await guardJsonBody(body, {
      route: "/api/waitlist",
      ip: clientIp(req),
      country: req.headers.get("x-vercel-ip-country"),
      userAgent: req.headers.get("user-agent"),
    });
    const result = await joinWaitlist({
      email: typeof body.email === "string" ? body.email : "",
      role: typeof body.role === "string" ? body.role : null,
      source: typeof body.source === "string" ? body.source : "homepage",
    });
    // Best-effort immediate delivery; the dispatcher also flushes the outbox.
    await flushNotificationOutbox({ limit: 5 }).catch(() => undefined);
    return NextResponse.json({
      ok: true,
      alreadyJoined: result.alreadyJoined,
      emailDelivery: mailConfigured() ? "confirmation-queued" : "stored-mail-not-configured",
    });
  } catch (err) {
    return apiError(err);
  }
}
