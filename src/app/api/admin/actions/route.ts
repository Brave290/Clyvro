import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiError, readJsonBody, UnauthorizedError } from "@/lib/api";
import {
  adminRetryJob, deleteUserAsAdmin, requireAdminUser, setAdminPlanOverride, setUserSuspended, transferProjectAsAdmin,
} from "@/lib/services/admin";
import { publishLegal, saveLegalDraft } from "@/lib/services/legal";
import {
  createChangelogEntry, deleteChangelogEntry, setChangelogStatus, updateChangelogEntry,
} from "@/lib/services/changelog";
import { runDispatcherNow } from "@/lib/services/dispatch";
import { getMaintenance, setMaintenance } from "@/lib/services/site";
import { allowIp, banIp, revokeTrustedBrowsers, setShieldMode, unallowIp, unban, type ShieldMode } from "@/lib/services/shield";
import { requestIp } from "@/lib/shield/rules";
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
      case "project.transfer": {
        if (body.confirm !== true) throw new ScanError("VALIDATION", "Project transfer requires explicit confirmation.");
        return NextResponse.json(await transferProjectAsAdmin(actor, str(body.projectId), str(body.email)));
      }
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
      case "shield.setMode":
        return NextResponse.json({ ok: true, settings: await setShieldMode(actor, str(body.mode) as ShieldMode) });
      case "shield.allow": {
        const ip = body.current === true ? requestIp(req.headers) : str(body.ip).trim();
        if (!ip || ip === "unknown") throw new ScanError("VALIDATION", "Could not determine an address to allowlist.");
        return NextResponse.json({ ok: true, settings: await allowIp(actor, ip, str(body.note)) });
      }
      case "shield.unallow":
        return NextResponse.json({ ok: true, settings: await unallowIp(actor, str(body.hash)) });
      case "shield.ban": {
        const ip = str(body.ip).trim();
        const hash = str(body.hash).trim();
        if (!ip && !hash) throw new ScanError("VALIDATION", "Enter the IP address to ban.");
        const minutes = Number(body.minutes);
        if (!Number.isFinite(minutes) || minutes <= 0) throw new ScanError("VALIDATION", "Enter how many minutes the ban should last.");
        try {
          return NextResponse.json({ ok: true, ban: await banIp(actor, ip ? { ip } : { hash, label: str(body.label) }, minutes, str(body.reason)) });
        } catch (err) {
          throw new ScanError("VALIDATION", err instanceof Error ? err.message : "Could not ban that address.");
        }
      }
      case "shield.unban":
        return NextResponse.json(await unban(actor, str(body.key)));
      case "shield.revokeTrust": {
        if (body.confirm !== true) throw new ScanError("VALIDATION", "Revoking trusted browsers requires explicit confirmation.");
        return NextResponse.json({ ok: true, settings: await revokeTrustedBrowsers(actor) });
      }
      case "legal.saveDraft":
        return NextResponse.json(await saveLegalDraft(actor.email, {
          slug: str(body.slug), title: str(body.title), body: str(body.body),
        }));
      case "changelog.create":
        return NextResponse.json(await createChangelogEntry(actor.email, {
          title: str(body.title), body: str(body.body), tag: str(body.tag),
          version: typeof body.version === "string" ? body.version : null,
        }));
      case "changelog.update":
        return NextResponse.json(await updateChangelogEntry(actor.email, {
          id: str(body.id), title: str(body.title), body: str(body.body), tag: str(body.tag),
          version: typeof body.version === "string" ? body.version : null,
        }));
      case "changelog.setStatus":
        return NextResponse.json(await setChangelogStatus(actor.email, str(body.id), body.publish === true));
      case "changelog.delete": {
        if (body.confirm !== true) throw new ScanError("VALIDATION", "Deletion requires explicit confirmation.");
        return NextResponse.json(await deleteChangelogEntry(actor.email, str(body.id)));
      }
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
