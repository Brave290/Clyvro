import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiError, readJsonBody, UnauthorizedError } from "@/lib/api";
import {
  adminRetryJob, deleteUserAsAdmin, requireAdminUser, setAdminPlanOverride, setUserSuspended,
} from "@/lib/services/admin";
import { publishLegal, saveLegalDraft } from "@/lib/services/legal";
import { runDispatcherNow } from "@/lib/services/dispatch";
import { getMaintenance, setMaintenance } from "@/lib/services/site";
import { logAdmin } from "@/lib/services/admin";
import { getDb } from "@/lib/db";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";

/**
 * Admin mutations. Every action re-authorizes the caller as a platform
 * admin server-side, validates its payload, and writes an admin audit
 * log entry. Destructive actions require an explicit `confirm` flag.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError("Sign in required.");
    const actor = await requireAdminUser(session.user.id);
    const body = await readJsonBody(req, 65_536);
    const action = typeof body.action === "string" ? body.action : "";
    const str = (v: unknown) => (typeof v === "string" ? v : "");

    switch (action) {
      case "user.suspend":
        return NextResponse.json(await setUserSuspended(actor, str(body.userId), body.suspended === true));
      case "user.delete": {
        if (body.confirm !== true) throw new ScanError("VALIDATION", "Deletion requires explicit confirmation.");
        return NextResponse.json(await deleteUserAsAdmin(actor, str(body.userId)));
      }
      case "org.planOverride":
        return NextResponse.json(await setAdminPlanOverride(
          actor, str(body.organizationId),
          typeof body.planId === "string" ? body.planId : null,
          typeof body.note === "string" ? body.note : null,
        ));
      case "job.retry":
        return NextResponse.json(await adminRetryJob(actor, str(body.auditId)));
      case "cron.runNow": {
        const result = await runDispatcherNow("manual-admin");
        await logAdmin(await getDb(), actor, "cron.runNow", "dispatch", result.runId);
        return NextResponse.json(result);
      }
      case "maintenance.set": {
        const current = await getMaintenance(undefined, true);
        return NextResponse.json(await setMaintenance(actor, {
          enabled: body.enabled === true,
          message: typeof body.message === "string" && body.message.trim() ? body.message : current.message,
          eta: typeof body.eta === "string" && body.eta ? body.eta : null,
        }));
      }
      case "legal.saveDraft":
        return NextResponse.json(await saveLegalDraft(actor.email, {
          slug: str(body.slug), title: str(body.title), body: str(body.body),
        }));
      case "legal.publish": {
        if (body.confirm !== true) throw new ScanError("VALIDATION", "Publishing requires explicit confirmation.");
        return NextResponse.json(await publishLegal(actor.email, str(body.slug)));
      }
      default:
        throw new ScanError("VALIDATION", "Unknown admin action.");
    }
  } catch (err) {
    return apiError(err);
  }
}
