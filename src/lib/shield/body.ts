/**
 * Clyvro Shield — request-body scoring.
 *
 * Shield's edge rules only ever see the request line, because reading a body
 * in middleware would break streaming uploads and cost every request a full
 * buffer. But the exploit that matters most for a public form is usually
 * *inside* the JSON: a name field carrying `<script>`, an organisation name
 * carrying `1 UNION SELECT`, a reset token followed by a shell chain.
 *
 * So the route that already reads the body scores it, with the same signature
 * set and the same weights as the request line:
 *
 *   - `inspectBody()` is pure and cheap: it walks the JSON, skips opaque
 *     fields (passwords, keys, tokens — scoring those only creates false
 *     positives), and treats URL-bearing fields leniently, because Clyvro's
 *     whole job is handling other people's (sometimes vulnerable) URLs.
 *   - `guardJsonBody()` is the Node side: it records the event and, in
 *     Enforce / Under-attack mode, refuses the request with a generic 403.
 *     Monitor mode only records — the same "watch, then enforce" contract the
 *     edge rules follow, so a false positive can never block a real sign-up
 *     before the founder has seen it in Admin → Security.
 *
 * Nothing here throws for an ordinary payload, and nothing here logs the body:
 * only the matched rule names, the score and the field path are stored.
 */
import { BLOCK_SCORE, hashIp, maskIp, scoreText, type Match } from "./rules";
import { escalate, getShieldSettings, recordEvent } from "@/lib/services/shield";
import { ScanError } from "@/lib/scanner/types";

export interface BodyInspection {
  verdict: "allow" | "suspicious" | "block";
  /** Highest single-field score (weak hints in different fields never add up). */
  score: number;
  matches: Match[];
  /** JSON path of the worst field, e.g. `form.name` — never the value. */
  field: string | null;
}

/** Fields that are opaque by design: a password must be allowed to look like anything. */
const OPAQUE_FIELDS = new Set([
  "password", "newpassword", "currentpassword", "confirmpassword", "passwordconfirm",
  "oldpassword", "key", "otp", "code", "token", "resumetoken", "bridgetoken",
  "secret", "apikey", "api_key", "signature", "hash",
]);

/** Fields that legitimately carry other people's URLs: capped like the edge's `url` query key. */
const URL_FIELDS = new Set([
  "url", "target", "site", "siteurl", "domain", "callbackurl", "redirect", "redirect_uri", "returnto", "next",
]);

/**
 * Free prose. A message may quote a payload the sender is reporting, so a
 * single signature is only ever *suspicious* here; two independent ones still
 * add up to a block.
 */
const PROSE_FIELDS = new Set(["notes", "description", "message", "body", "comment", "subject", "title", "q", "query", "search"]);

const MAX_FIELDS = 80;
const MAX_FIELD_CHARS = 2_000;
const MAX_TOTAL_CHARS = 12_000;
const MAX_DEPTH = 6;

/** Signature weight cap for a field: undefined = full weight (an ordinary field). */
function weightCap(key: string): number | undefined {
  if (URL_FIELDS.has(key) || key.endsWith("url") || key.endsWith("uri")) return 1;
  if (PROSE_FIELDS.has(key)) return 2;
  return undefined;
}

/**
 * Scores every string in a JSON payload. Verdict thresholds match the request
 * line: a strong signature (score ≥ BLOCK_SCORE) in an ordinary field blocks;
 * anything weaker, or anything at all in a lenient field, is only suspicious.
 */
export function inspectBody(body: unknown): BodyInspection {
  const matches: Match[] = [];
  let worst = 0;
  let field: string | null = null;
  let fields = 0;
  let budget = MAX_TOTAL_CHARS;

  const visit = (value: unknown, path: string, key: string, depth: number): void => {
    if (fields >= MAX_FIELDS || budget <= 0 || depth > MAX_DEPTH) return;
    if (typeof value === "string") {
      if (OPAQUE_FIELDS.has(key)) return;
      fields += 1;
      const text = value.slice(0, Math.min(MAX_FIELD_CHARS, budget));
      budget -= text.length;
      if (!text) return;
      const found = scoreText(text, "body", weightCap(key));
      if (found.matches.length === 0) return;
      matches.push(...found.matches);
      if (found.score > worst) {
        worst = found.score;
        field = path;
      }
      return;
    }
    if (Array.isArray(value)) {
      value.slice(0, 20).forEach((item, index) => visit(item, `${path}[${index}]`, key, depth + 1));
      return;
    }
    if (value && typeof value === "object") {
      for (const [childKey, child] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
        visit(child, path ? `${path}.${childKey}` : childKey, childKey.toLowerCase(), depth + 1);
      }
    }
  };

  visit(body, "", "", 0);

  const verdict = worst >= BLOCK_SCORE ? "block" : matches.length > 0 ? "suspicious" : "allow";
  return { verdict, score: worst, matches, field };
}

export interface BodyGuardContext {
  /** Route label stored with the event, e.g. `/api/auth/register`. */
  route: string;
  /** Best-effort client address (see `clientIp` in @/lib/api). */
  ip: string;
  country?: string | null;
  userAgent?: string | null;
  method?: string;
}

function shieldSecret(): string {
  return process.env.AUTH_SECRET ?? "clyvro-dev-only-secret-change-me";
}

/**
 * Records a body finding and, in Enforce / Under-attack mode, refuses the
 * request. Resolves when the payload is acceptable (including in Monitor
 * mode, where the event is only recorded) and throws a generic 403 when it
 * is not — the caller's `catch (err) { return apiError(err) }` already maps it.
 */
export async function guardJsonBody(
  body: unknown,
  ctx: BodyGuardContext,
  options: { enforce?: boolean } = {},
): Promise<BodyInspection> {
  const inspection = inspectBody(body);
  if (inspection.verdict === "allow") return inspection;

  const secret = shieldSecret();
  const ipHash = await hashIp(ctx.ip, secret);
  const ipMasked = maskIp(ctx.ip);
  const mode = (await getShieldSettings().catch(() => null))?.mode ?? "monitor";
  // Endpoints that must answer identically whether or not anything is wrong
  // (password reset requests, anti-enumeration paths) pass enforce:false and
  // are only ever recorded.
  const enforced = options.enforce !== false && inspection.verdict === "block" && mode !== "monitor";

  const rule = inspection.matches[0] ? `body:${inspection.matches[0].family}` : "body:suspicious";
  await recordEvent({
    ipHash,
    ipMasked,
    country: ctx.country ?? null,
    method: (ctx.method ?? "POST").toUpperCase(),
    path: `${ctx.route}${inspection.field ? `#${inspection.field}` : ""}`,
    userAgent: ctx.userAgent ?? null,
    verdict: enforced ? "blocked" : inspection.verdict === "block" ? "monitored" : "suspicious",
    rule,
    matches: inspection.matches.slice(0, 12),
    score: inspection.score,
    mode,
  });

  if (enforced) {
    await escalate(ipHash, ipMasked, rule);
    throw new ScanError("FORBIDDEN", "That request was refused by Clyvro Shield. If you believe this is a mistake, contact support.");
  }
  return inspection;
}
