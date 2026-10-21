import { NextRequest, NextResponse } from "next/server";
import { githubAppConfig, verifyWebhookSignature } from "@/lib/github-app";
import { handleGithubWebhook } from "@/lib/services/github-code-review";

export const runtime = "nodejs";

/**
 * GitHub App webhook receiver. Authenticated by GitHub's HMAC
 * signature (no user session — GitHub is the caller). Bookkeeping
 * only: installation removals + "new commits seen" markers. Pushes
 * never trigger a scan by themselves.
 */
export async function POST(req: NextRequest) {
  const config = githubAppConfig();
  if (!config) return NextResponse.json({ error: "not configured" }, { status: 404 });
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature(rawBody, signature, config.webhookSecret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  const event = req.headers.get("x-github-event") ?? "";
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  try {
    await handleGithubWebhook(event, payload);
  } catch {
    // Bookkeeping must never make GitHub retry-storm us; the state can
    // always be repaired by the next push or a manual scan.
    return NextResponse.json({ ok: true, noted: false });
  }
  return NextResponse.json({ ok: true });
}
