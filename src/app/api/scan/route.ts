import { NextRequest, NextResponse } from "next/server";
import { runScan, normalizeScanInput } from "@/lib/scanner/scan";
import { assertPublicUrl } from "@/lib/scanner/ssrf";
import { ScanError } from "@/lib/scanner/types";
import { tryConsumePublicScan } from "@/lib/services/abuse";
import { DEVICE_HEADER } from "@/lib/device";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/scan — run one bounded, synchronous Phase 2 scan.
 * Body: { "url": "https://example.com" }
 *
 * 200 → ScanReport (including "failed" reports for unreachable targets)
 * 400 → URL invalid/blocked by the SSRF policy { error: { code, message } }
 * 429 → per-IP prototype rate limit
 *
 * The scan is strictly bounded (see SCAN_CONFIG) so it fits one request;
 * Phase 3 moves execution to a background worker producing the same JSON.
 */

const MAX_SCANS_PER_WINDOW = 5;
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_SCANS_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  // Opportunistic cleanup so the map can't grow unboundedly.
  if (hits.size > 1000) {
    for (const [key, list] of hits) {
      if (!list.some((t) => now - t < WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Couldn't read the request." } }, { status: 400 });
  }
  if (bodyText.length > 4096) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Request too large." } }, { status: 400 });
  }

  let url: unknown;
  try {
    url = (JSON.parse(bodyText) as { url?: unknown })?.url;
  } catch {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Send JSON like { \"url\": \"https://example.com\" }." } }, { status: 400 });
  }
  if (typeof url !== "string" || url.trim() === "") {
    return NextResponse.json({ error: { code: "INVALID_URL", message: "Enter a website address to scan." } }, { status: 400 });
  }

  // Only accepted scans consume quota: validation failures (bad URL, SSRF
  // policy blocks, DNS errors) are rejected here first, quota-free.
  // runScan re-validates everything itself — this pre-check must never be
  // the only line of defence.
  try {
    await assertPublicUrl(normalizeScanInput(url));
  } catch (err) {
    if (err instanceof ScanError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    throw err;
  }

  if (rateLimited(clientIp(req))) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "You're scanning quite fast. Please wait a few minutes and try again." } },
      { status: 429 },
    );
  }

  // One free public scan per visitor; after that a free account is the
  // way to keep scanning (enforced server-side — see services/abuse.ts).
  const hasFreeScan = await tryConsumePublicScan(clientIp(req), req.headers.get(DEVICE_HEADER));
  if (!hasFreeScan) {
    return NextResponse.json(
      {
        error: {
          code: "FREE_SCAN_USED",
          message: "You've used your free scan. Create a free account to run more scans, save your reports, and track fixes over time.",
        },
      },
      { status: 403 },
    );
  }

  try {
    const report = await runScan(url);
    return NextResponse.json(report, { status: 200 });
  } catch (err) {
    if (err instanceof ScanError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Something went wrong while scanning. Please try again." } },
      { status: 500 },
    );
  }
}
