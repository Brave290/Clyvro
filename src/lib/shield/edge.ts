/**
 * Clyvro Shield — the part that runs inside the edge middleware.
 *
 * Everything here is in-memory and fail-open: the middleware must never
 * add a database round-trip to a page view, and a Shield hiccup must
 * never take the site down. State that has to be shared (mode, allowlist,
 * active bans) is pulled from `/api/shield/status` at most every 10 s per
 * edge isolate; the rest (rate counters, rule matching) is local.
 */
import { createThrottle, type Throttle } from "@/lib/throttle";
import {
  SHIELD_MODES, decide, hashIp, inspectRequest, INTERNAL_HEADER, internalToken, isCrossSiteWrite, limitFor, maskIp, requestIp, routeClass, shieldExempt, tokensEqual,
  type Inspection, type RouteClass, type RuleFamily, type ShieldMode,
} from "./rules";
import { TRUST_COOKIE, readCookie, verifyTrustToken } from "./trust";

export interface ShieldStatus {
  mode: ShieldMode;
  /** Hashed addresses that bypass Shield entirely (the founder's own IP, monitors). */
  allowed: Set<string>;
  /** Hashed addresses with an active ban. */
  banned: Set<string>;
  /** Trusted-browser token version; bumping it in Admin → Security revokes every token. */
  trustVersion: number;
  /** When this snapshot was fetched (0 = built-in default). */
  at: number;
}

export const STATUS_TTL_MS = 10_000;
const STATUS_RETRY_MS = 2_000;
const DEFAULT_STATUS: ShieldStatus = { mode: "monitor", allowed: new Set(), banned: new Set(), trustVersion: 1, at: 0 };

let statusCache: { fetchedAt: number; status: ShieldStatus } | null = null;
let statusInflight: Promise<ShieldStatus> | null = null;
let tokenCache: { secret: string; token: string } | null = null;

export function parseStatus(json: unknown, now: number): ShieldStatus {
  const raw = (json ?? {}) as { mode?: unknown; allowed?: unknown; banned?: unknown; trustVersion?: unknown };
  const mode = SHIELD_MODES.includes(raw.mode as ShieldMode) ? (raw.mode as ShieldMode) : "monitor";
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const trustVersion = typeof raw.trustVersion === "number" && Number.isFinite(raw.trustVersion) ? raw.trustVersion : 1;
  return { mode, allowed: new Set(strings(raw.allowed)), banned: new Set(strings(raw.banned)), trustVersion, at: now };
}

async function token(secret: string): Promise<string> {
  if (tokenCache?.secret === secret) return tokenCache.token;
  const t = await internalToken(secret);
  tokenCache = { secret, token: t };
  return t;
}

export async function loadStatus(origin: string, secret: string, now = Date.now()): Promise<ShieldStatus> {
  if (statusCache && now - statusCache.fetchedAt < STATUS_TTL_MS) return statusCache.status;
  if (statusInflight) return statusInflight;
  statusInflight = (async () => {
    try {
      const res = await fetch(`${origin}/api/shield/status`, {
        headers: { "x-clyvro-shield": await token(secret) },
        cache: "no-store",
        signal: AbortSignal.timeout(1_200),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const status = parseStatus(await res.json(), now);
      statusCache = { fetchedAt: now, status };
      return status;
    } catch {
      // Fail open: keep the last good snapshot (or defaults) and retry soon.
      const status = statusCache?.status ?? DEFAULT_STATUS;
      statusCache = { fetchedAt: now - STATUS_TTL_MS + STATUS_RETRY_MS, status };
      return status;
    } finally {
      statusInflight = null;
    }
  })();
  return statusInflight;
}

/** Tests and the admin "refresh" action can drop the snapshot. */
export function resetShieldEdgeState() {
  statusCache = null;
  statusInflight = null;
  throttles.clear();
}

const throttles = new Map<string, Throttle>();
function throttleFor(cls: RouteClass, mode: ShieldMode): Throttle {
  const key = `${cls}:${mode}`;
  let t = throttles.get(key);
  if (!t) {
    const spec = limitFor(cls, mode);
    t = createThrottle({ windowMs: spec.windowMs, limit: spec.limit, maxKeys: 20_000 });
    throttles.set(key, t);
  }
  return t;
}

export type DecisionReason = "banned" | "rate-limit" | "trusted" | RuleFamily | "suspicious";

export interface Decision {
  action: "allow" | "block" | "log";
  reason: DecisionReason;
  mode: ShieldMode;
  ipHash: string;
  ipMasked: string;
  country: string | null;
  method: string;
  /** Path plus query, truncated for storage. */
  path: string;
  userAgent: string | null;
  inspection: Inspection | null;
  retryAfterSeconds: number | null;
  /** Monitor mode: this request would have been blocked in Enforce. */
  wouldBlock: boolean;
}

export interface EdgeRequestLike {
  method: string;
  headers: Headers;
  nextUrl: { pathname: string; search: string; origin: string; host?: string };
}

/**
 * Evaluates one request. Returns null when the path is exempt. Never throws.
 * `statusOverride` lets tests skip the network.
 */
export async function evaluateRequest(req: EdgeRequestLike, secret: string, statusOverride?: ShieldStatus): Promise<Decision | null> {
  const { pathname, search, origin } = req.nextUrl;
  if (shieldExempt(pathname)) return null;
  try {
    const ip = requestIp(req.headers);
    const ipHash = await hashIp(ip, secret);
    const status = statusOverride ?? (await loadStatus(origin, secret));
    const base = {
      mode: status.mode,
      ipHash,
      ipMasked: maskIp(ip),
      country: req.headers.get("x-vercel-ip-country"),
      method: req.method.toUpperCase(),
      path: `${pathname}${search}`.slice(0, 400),
      userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      retryAfterSeconds: null,
      wouldBlock: false,
    };

    // Cross-site forgery is refused first — before any trust or allowlist —
    // because the victim of a CSRF attack is precisely a trusted browser.
    // Compare against the Host the browser actually sent (nextUrl.host can be
    // the server's bind address, e.g. 0.0.0.0, when Next is started with -H).
    const host = req.headers.get("host") ?? req.headers.get("x-forwarded-host") ?? req.nextUrl.host ?? "";
    if (host && isCrossSiteWrite(base.method, pathname, req.headers, host)) {
      return { ...base, action: "block", reason: "csrf", inspection: null, wouldBlock: true };
    }

    // Trusted administrator browser (HMAC cookie) → bypass everything else, on any network.
    const trusted = await verifyTrustToken(readCookie(req.headers.get("cookie"), TRUST_COOKIE), secret, status.trustVersion);
    if (trusted) return { ...base, action: "allow", reason: "trusted", inspection: null };
    // Product self-scan (Pentest / Hack Protection of clyvro.vercel.app) carries
    // the edge token so honeypot probes do not ban our own serverless IP.
    const scanToken = req.headers.get(INTERNAL_HEADER);
    if (scanToken && tokensEqual(scanToken, await token(secret))) {
      return { ...base, action: "allow", reason: "trusted", inspection: null };
    }
    if (status.allowed.has(ipHash)) return { ...base, action: "allow", reason: "suspicious", inspection: null };
    if (status.banned.has(ipHash)) return { ...base, action: "block", reason: "banned", inspection: null };

    const cls = routeClass(base.method, pathname);
    if (throttleFor(cls, status.mode).hit(ipHash)) {
      const spec = limitFor(cls, status.mode);
      return { ...base, action: "block", reason: "rate-limit", inspection: null, retryAfterSeconds: Math.ceil(spec.windowMs / 1000) };
    }

    const inspection = inspectRequest({ method: base.method, pathname, search, userAgent: base.userAgent });
    const action = decide(inspection, status.mode);
    if (action === "allow") return { ...base, action: "allow", reason: "suspicious", inspection };
    const reason: DecisionReason = inspection.primary ?? "suspicious";
    return { ...base, action, reason, inspection, wouldBlock: inspection.verdict === "block" };
  } catch {
    return null;
  }
}

/** Headers the middleware attaches when it rewrites a blocked request to /api/shield/blocked. */
export const SHIELD_HEADERS = {
  reason: "x-shield-reason",
  mode: "x-shield-mode",
  ipHash: "x-shield-ip-hash",
  ipMasked: "x-shield-ip-masked",
  country: "x-shield-country",
  method: "x-shield-method",
  path: "x-shield-path",
  userAgent: "x-shield-ua",
  score: "x-shield-score",
  matches: "x-shield-matches",
  retryAfter: "x-shield-retry-after",
} as const;

export function decisionHeaders(d: Decision): Record<string, string> {
  const h: Record<string, string> = {
    [SHIELD_HEADERS.reason]: d.reason,
    [SHIELD_HEADERS.mode]: d.mode,
    [SHIELD_HEADERS.ipHash]: d.ipHash,
    [SHIELD_HEADERS.ipMasked]: d.ipMasked,
    [SHIELD_HEADERS.method]: d.method,
    [SHIELD_HEADERS.path]: encodeURIComponent(d.path),
    [SHIELD_HEADERS.score]: String(d.inspection?.score ?? 0),
    [SHIELD_HEADERS.matches]: encodeURIComponent(JSON.stringify((d.inspection?.matches ?? []).slice(0, 12))),
  };
  if (d.country) h[SHIELD_HEADERS.country] = d.country;
  if (d.userAgent) h[SHIELD_HEADERS.userAgent] = encodeURIComponent(d.userAgent);
  if (d.retryAfterSeconds) h[SHIELD_HEADERS.retryAfter] = String(d.retryAfterSeconds);
  return h;
}

/** Body of the fire-and-forget monitor report. */
export function reportBody(d: Decision) {
  return {
    reason: d.reason,
    mode: d.mode,
    ipHash: d.ipHash,
    ipMasked: d.ipMasked,
    country: d.country,
    method: d.method,
    path: d.path,
    userAgent: d.userAgent,
    score: d.inspection?.score ?? 0,
    matches: (d.inspection?.matches ?? []).slice(0, 12),
    wouldBlock: d.wouldBlock,
  };
}

export { token as shieldInternalToken };
