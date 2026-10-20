import { NextRequest, NextResponse } from "next/server";
import { isDisplayCurrency } from "@/lib/currencies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const currency = request.nextUrl.searchParams.get("currency")?.toUpperCase() ?? "";
  if (!isDisplayCurrency(currency) || currency === "USD") {
    return NextResponse.json({ error: "Choose a supported display currency." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const response = await fetch(`https://api.frankfurter.dev/v2/rate/usd/${currency.toLowerCase()}`, {
      next: { revalidate: 86_400 },
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Rate provider returned ${response.status}`);
    const data = await response.json() as { date?: unknown; base?: unknown; quote?: unknown; rate?: unknown };
    if (data.base !== "USD" || data.quote !== currency || typeof data.rate !== "number" || !Number.isFinite(data.rate) || typeof data.date !== "string") {
      throw new Error("Rate provider returned an invalid response");
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ error: "A daily reference rate is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
