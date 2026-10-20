import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { normalizeLocale } from "@/lib/locale";
import { DEVICE_HEADER } from "@/lib/device";
import { SCAN_CONFIG } from "@/lib/scanner/config";
import { normalizeScanInput, runScanSlice, type ScanSliceResult } from "@/lib/scanner/scan";
import { assertPublicUrl } from "@/lib/scanner/ssrf";
import { ScanError } from "@/lib/scanner/types";
import { signScanCheckpoint, verifyScanCheckpointToken } from "@/lib/scanner/resume-token";
import { tryConsumePublicScan } from "@/lib/services/abuse";
import { recordPublicScan } from "@/lib/services/public-scans";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SCANS_PER_WINDOW = 5;
const MAX_CONTINUATIONS_PER_WINDOW = 90;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUEST_BYTES = 4_000_000;
const hits = new Map<string, number[]>();
const continuationHits = new Map<string, number[]>();
const DEVELOPMENT_RESUME_SECRET = randomBytes(32).toString("base64url");

function requestSecret(): string | null {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : DEVELOPMENT_RESUME_SECRET;
}

function rateLimited(bucket: Map<string, number[]>, ip: string, limit: number): boolean {
  const now = Date.now();
  const recent = (bucket.get(ip) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= limit) {
    bucket.set(ip, recent);
    return true;
  }
  recent.push(now);
  bucket.set(ip, recent);
  if (bucket.size > 1_000) {
    for (const [key, times] of bucket) {
      if (!times.some((time) => now - time < WINDOW_MS)) bucket.delete(key);
    }
  }
  return false;
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

async function sliceResponse(slice: ScanSliceResult, secret: string) {
  if (slice.done) {
    if (!slice.report) throw new ScanError("CHECKPOINT_INVALID", "The scanner completed without a report.");
    // Persist the finished check so the homepage totals are real.
    // Idempotent (deterministic scan key) and never throws — losing a
    // stats write must never fail the visitor's report.
    if (slice.report.status === "completed" || slice.report.status === "partial") {
      await recordPublicScan(slice.report);
    }
    return NextResponse.json(slice.report, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
  if (!slice.checkpoint || !slice.checkpointJson) {
    throw new ScanError("CHECKPOINT_INVALID", "The scanner did not return resumable progress.");
  }
  const coverage = slice.checkpoint.crawl.coverage;
  return NextResponse.json({
    status: "processing",
    resumeToken: signScanCheckpoint(slice.checkpointJson, secret),
    progress: {
      pagesFetched: coverage.pagesFetched,
      pagesParsed: coverage.pagesParsed,
      linksChecked: coverage.linksChecked,
      linksUnchecked: coverage.linksUnchecked,
      maxPages: coverage.maxPages,
    },
  }, { status: 202, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const secret = requestSecret();
  if (!secret) {
    return errorResponse("SCAN_RESUME_UNAVAILABLE", "The scanner is not configured for safe resumable checks. Please try again later.", 503);
  }

  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return errorResponse("BAD_REQUEST", "Couldn't read the request.", 400);
  }
  if (Buffer.byteLength(bodyText, "utf8") > MAX_REQUEST_BYTES) {
    return errorResponse("BAD_REQUEST", "Request too large.", 400);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return errorResponse("BAD_REQUEST", "Send a JSON request with a website address or a resume token.", 400);
  }

  const ip = clientIp(req);
  if (typeof body.resumeToken === "string") {
    if (body.url !== undefined) return errorResponse("BAD_REQUEST", "A continuation request must contain only its resume token.", 400);
    if (rateLimited(continuationHits, ip, MAX_CONTINUATIONS_PER_WINDOW)) {
      return errorResponse("RATE_LIMITED", "This scan is making too many requests. Wait a few minutes, then resume.", 429);
    }
    try {
      const checkpoint = verifyScanCheckpointToken(body.resumeToken, secret);
      const slice = await runScanSlice(undefined, { checkpoint, workBudget: SCAN_CONFIG.sliceWorkBudget });
      return await sliceResponse(slice, secret);
    } catch (err) {
      if (err instanceof ScanError) return errorResponse(err.code, err.message, 400);
      return errorResponse("INTERNAL", "Something went wrong while continuing the scan. Try resuming again.", 500);
    }
  }

  const url = body.url;
  if (typeof url !== "string" || url.trim() === "") {
    return errorResponse("INVALID_URL", "Enter a website address to scan.", 400);
  }

  // Reject invalid/private targets before consuming the one free scan. The scan
  // slice revalidates the target and every redirect independently.
  try {
    await assertPublicUrl(normalizeScanInput(url));
  } catch (err) {
    if (err instanceof ScanError) return errorResponse(err.code, err.message, 400);
    return errorResponse("INTERNAL", "We couldn't validate that address. Please try again.", 500);
  }

  if (rateLimited(hits, ip, MAX_SCANS_PER_WINDOW)) {
    return errorResponse("RATE_LIMITED", "You're scanning quite fast. Please wait a few minutes and try again.", 429);
  }

  // Admission and quota are charged once for the initial request only. Resume
  // tokens are HMAC-signed and time-limited; they cannot forge new scan targets.
  const hasFreeScan = await tryConsumePublicScan(ip, req.headers.get(DEVICE_HEADER));
  if (!hasFreeScan) {
    return errorResponse("FREE_SCAN_USED", "You've used your free scan. Create a free account to run more scans, save your reports, and track fixes over time.", 403);
  }

  try {
    const locale = normalizeLocale(body.locale);
    const slice = await runScanSlice(url, { locale, workBudget: SCAN_CONFIG.sliceWorkBudget });
    return await sliceResponse(slice, secret);
  } catch (err) {
    if (err instanceof ScanError) return errorResponse(err.code, err.message, 400);
    return errorResponse("INTERNAL", "Something went wrong while scanning. Please try again.", 500);
  }
}
