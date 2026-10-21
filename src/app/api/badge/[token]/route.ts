import { NextRequest } from "next/server";
import { detailToScanReport, getSharedAudit } from "@/lib/services/audits";

export const runtime = "nodejs";

/**
 * Embeddable "Scanned by Clyvro" score badge (SVG) for a shared
 * report link. Website owners paste one <img> tag; the badge always
 * reflects the latest state of that shared report and stops working
 * the moment the link is revoked or expires (same lookup as the
 * shared page — no separate oracle). Unknown tokens get a neutral
 * badge, never an error that leaks which tokens exist.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function badgeSvg(score: number | null): string {
  const value = score === null ? "—" : `${score}`;
  const color = score === null ? "#64748b" : score >= 80 ? "#16a34a" : score >= 55 ? "#d97706" : "#dc2626";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="196" height="28" role="img" aria-label="Scanned by Clyvro${score === null ? "" : ` — score ${score} of 100`}">
  <rect width="196" height="28" rx="6" fill="#0b1020"/>
  <rect x="118" width="78" height="28" rx="6" fill="${color}"/>
  <rect x="118" width="8" height="28" fill="${color}"/>
  <text x="10" y="18" font-family="Verdana, Geneva, sans-serif" font-size="10" fill="#e2e8f0">Scanned by Clyvro</text>
  <text x="157" y="18" text-anchor="middle" font-family="Verdana, Geneva, sans-serif" font-size="11" font-weight="bold" fill="#ffffff">${esc(value)}${score === null ? "" : " / 100"}</text>
</svg>`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let score: number | null = null;
  try {
    const detail = await getSharedAudit(token);
    if (detail) score = detailToScanReport(detail).score;
  } catch { /* neutral badge */ }
  return new Response(badgeSvg(score), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // Short cache: the badge tracks the report but shouldn't hammer the DB.
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
