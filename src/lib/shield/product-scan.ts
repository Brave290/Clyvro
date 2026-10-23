/**
 * When Clyvro scans *itself* (Hack Protection / Pentest against
 * clyvro.vercel.app), Shield would otherwise treat our own probes as
 * attackers: honeypot 403s, then a ban that 403s the homepage and hides
 * the real CSP. The edge token is the same HMAC the middleware already
 * uses for /api/shield/* — it is never sent to a customer's site.
 */
import { INTERNAL_HEADER, internalToken } from "@/lib/shield/rules";

/** Browser-like UA that is not in the offensive-tool fingerprint list. */
export const PRODUCT_SCAN_UA = "Mozilla/5.0 (compatible; ClyvroSiteCheck/1.0; +https://clyvro.vercel.app)";

export function isOwnProductHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  return h === "clyvro.vercel.app" || h === "www.clyvro.vercel.app" || h === "localhost" || h === "127.0.0.1";
}

export async function ownProductScanHeaders(host: string): Promise<Record<string, string>> {
  if (!isOwnProductHost(host)) return {};
  const secret = process.env.AUTH_SECRET ?? "clyvro-dev-only-secret-change-me";
  return { [INTERNAL_HEADER]: await internalToken(secret) };
}
