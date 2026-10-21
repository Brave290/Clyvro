import { Agent, fetch as undiciFetch } from "undici";
import { assertPublicUrl, defaultResolver, type Resolver } from "./ssrf";
import { SCAN_CONFIG } from "./config";
import { ScanError, type FetchOutcome, type ValidatedTarget } from "./types";
import { normalizeLocale } from "@/lib/locale";

/**
 * Safe fetching on top of the SSRF boundary.
 *
 * DNS rebinding defence: assertPublicUrl resolves and validates addresses,
 * then the transport connects to one of those exact addresses via a pinned
 * DNS lookup while TLS SNI / Host still use the real hostname. The name is
 * never re-resolved at connection time, so a hostile DNS server cannot
 * return a public address for validation and a private one for the socket.
 *
 * Redirects are followed manually and every hop re-enters assertPublicUrl.
 */

export interface RawResponse {
  status: number;
  header(name: string): string | null;
  /** Every response header (lower-cased names). Optional: fake transports in tests may omit it. */
  allHeaders?(): Record<string, string>;
  /** Decoded body chunks. Iterating may be abandoned early (byte cap). */
  body: AsyncIterable<Uint8Array> | null;
  cancelBody(): Promise<void>;
}

export type Transport = (
  target: ValidatedTarget,
  init: { signal: AbortSignal; headers: Record<string, string>; method: string; body?: string },
) => Promise<RawResponse>;

function pinnedLookup(ip: string) {
  const family = ip.includes(":") ? 6 : 4;
  return (
    _hostname: string,
    options: { all?: boolean } | undefined,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | { address: string; family: number }[],
      family?: number,
    ) => void,
  ) => {
    if (options?.all) callback(null, [{ address: ip, family }]);
    else callback(null, ip, family);
  };
}

export const undiciTransport: Transport = async (target, { signal, headers, method, body }) => {
  const pinnedIp = target.ips[0];
  const agent = new Agent({
    connections: 1,
    connect: target.isIpLiteral
      ? {}
      : { lookup: pinnedLookup(pinnedIp), servername: target.hostname },
  });
  try {
    const res = await undiciFetch(target.url, {
      method,
      body,
      redirect: "manual",
      dispatcher: agent,
      signal,
      headers,
    });
    const webBody = res.body as AsyncIterable<Uint8Array> | null;
    let closed = false;
    return {
      status: res.status,
      header: (name) => res.headers.get(name),
      allHeaders: () => {
        const out: Record<string, string> = {};
        res.headers.forEach((value, key) => { out[key.toLowerCase()] = value; });
        return out;
      },
      body: webBody,
      cancelBody: async () => {
        if (closed) return;
        closed = true;
        try {
          await (res.body as { cancel?: () => Promise<void> } | null)?.cancel?.();
        } catch { /* already closed */ }
        await agent.close().catch(() => undefined);
      },
    };
  } catch (err) {
    await agent.close().catch(() => undefined);
    throw err;
  }
};

export interface FetchOptions {
  /** Scanner defaults to GET. POST exists for customer cron pings (redirects are NOT followed for POST). */
  method?: "GET" | "POST";
  body?: string;
  contentType?: string;
  userAgent?: string;
  accept?: string;
  headersOnly?: boolean;
  /** Read bodies whose content-type isn't HTML (used for robots.txt). Default: bodies of non-HTML responses are not downloaded at all. */
  allowNonHtmlBody?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
  resolver?: Resolver;
  /** Return every response header (cookie values redacted) — customer cron jobs show the full response. */
  captureAllHeaders?: boolean;
  transport?: Transport;
  locale?: string;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

/**
 * Fetch a public URL with full SSRF validation on the URL and every
 * redirect hop, a hard timeout, and a decoded-body byte cap (bodies over
 * the cap are truncated and flagged, never buffered unboundedly).
 */
export async function fetchPublic(start: URL, opts: FetchOptions = {}): Promise<FetchOutcome> {
  const resolver = opts.resolver ?? defaultResolver;
  const transport = opts.transport ?? undiciTransport;
  const timeoutMs = opts.timeoutMs ?? SCAN_CONFIG.requestTimeoutMs;
  const maxRedirects = opts.maxRedirects ?? SCAN_CONFIG.maxRedirects;
  const maxBytes = opts.maxBytes ?? SCAN_CONFIG.maxBytesPerPage;

  let current = start;
  const redirectChain: string[] = [];
  const startedAt = Date.now();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const target = await assertPublicUrl(current, resolver);

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal;

    const method = opts.method ?? "GET";
    let raw: RawResponse;
    try {
      raw = await transport(target, {
        signal,
        method,
        body: opts.body,
        headers: {
          "user-agent": opts.userAgent ?? SCAN_CONFIG.userAgent,
          accept: opts.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "accept-language": normalizeLocale(opts.locale),
          ...(opts.body ? { "content-type": opts.contentType ?? "application/json" } : {}),
        },
      });
    } catch (err) {
      if (opts.signal?.aborted) throw new ScanError("DEADLINE", "The scan ran out of time.");
      if (isAbortError(err)) {
        throw new ScanError("TIMEOUT", `The site didn't respond within ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      throw new ScanError("FETCH_FAILED", "We couldn't connect to that website. It may be down or blocking automated requests.");
    }

    const location = raw.header("location");
    // POST pings report the first response as-is; re-posting bodies across
    // redirects is neither expected nor safe for a cron ping.
    if (method === "GET" && REDIRECT_STATUSES.has(raw.status) && location) {
      await raw.cancelBody();
      if (hop === maxRedirects) {
        throw new ScanError("REDIRECT_LIMIT", `The site redirected more than ${maxRedirects} times.`);
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new ScanError("FETCH_FAILED", "The site sent an invalid redirect.");
      }
      redirectChain.push(next.href);
      current = next; // next loop iteration re-validates protocol, host and DNS
      continue;
    }

    const contentType = raw.header("content-type");
    const isHtml = !!contentType && /text\/html|application\/xhtml\+xml/i.test(contentType);

    let bodyText: string | null = null;
    let bytes = 0;
    let truncated = false;
    const shouldReadBody = !opts.headersOnly && (isHtml || opts.allowNonHtmlBody);
    if (shouldReadBody && raw.body) {
      const chunks: Uint8Array[] = [];
      try {
        for await (const chunk of raw.body) {
          bytes += chunk.byteLength;
          if (bytes > maxBytes) {
            truncated = true;
            await raw.cancelBody();
            break;
          }
          chunks.push(chunk);
        }
      } catch (err) {
        if (isAbortError(err)) throw new ScanError("TIMEOUT", "The page took too long to download.");
        throw new ScanError("FETCH_FAILED", "The connection broke while downloading the page.");
      }
      const charset = contentType?.match(/charset=([a-zA-Z0-9._-]+)/i)?.[1];
      let decoder: TextDecoder;
      try {
        decoder = new TextDecoder(charset ?? "utf-8");
      } catch {
        decoder = new TextDecoder("utf-8");
      }
      const merged = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.byteLength;
      }
      bodyText = decoder.decode(merged);
    }
    // Allowlisted headers for readiness/security checks (never persisted in checkpoints).
    const headers: Record<string, string> = {};
    for (const name of ["server", "x-powered-by", "strict-transport-security", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "cache-control", "via", "cf-ray", "x-vercel-id", "x-served-by", "last-modified", "x-robots-tag", "cross-origin-opener-policy", "cross-origin-resource-policy", "x-nf-request-id", "x-netlify-id", "x-fly-request-id", "x-railway-request-id", "x-railway-edge", "x-azure-ref", "x-amz-cf-id", "x-amz-apigw-id", "x-cache", "x-render-id"]) {
      const v = raw.header(name);
      if (v) headers[name] = v.slice(0, 500);
    }
    // Cookie SAFETY summary only: names + flags, never values. The raw
    // Set-Cookie header is deliberately never captured (session secrets
    // must not leak into reports or checkpoints) — Hack Protection only
    // needs to know whether Secure/HttpOnly/SameSite are set.
    const cookieFlags: { name: string; secure: boolean; httpOnly: boolean; sameSite: string | null }[] = [];
    const rawCookies = raw.header("set-cookie");
    if (rawCookies) {
      for (const part of rawCookies.split(/,\s*(?=[^;,=]+?=)/)) {
        const [pair, ...attrs] = part.split(";");
        const name = (pair.split("=")[0] ?? "").trim();
        if (!name) continue;
        const flags = attrs.map((a) => a.trim().toLowerCase());
        cookieFlags.push({
          name,
          secure: flags.includes("secure"),
          httpOnly: flags.includes("httponly"),
          sameSite: flags.find((f) => f.startsWith("samesite="))?.split("=")[1] ?? null,
        });
      }
    }
    // Always release the connection/agent, whether the body was read or not.
    await raw.cancelBody().catch(() => undefined);

    let allHeaders: Record<string, string> | undefined;
    if (opts.captureAllHeaders) {
      allHeaders = {};
      const everything = raw.allHeaders?.() ?? headers;
      for (const [name, value] of Object.entries(everything)) {
        // Cookie values are secrets by definition; keep the attributes, drop the value.
        allHeaders[name] = name === "set-cookie"
          ? value.replace(/(^|,\s*)([^=;,\s]+)=([^;,]*)/g, "$1$2=[redacted]").slice(0, 1000)
          : value.slice(0, 1000);
      }
    }
    return {
      requestedUrl: start.href,
      finalUrl: current.href,
      status: raw.status,
      contentType,
      isHtml,
      bodyText,
      bytes,
      truncated,
      durationMs: Date.now() - startedAt,
      redirectChain,
      headers,
      ...(allHeaders ? { allHeaders } : {}),
      ...(cookieFlags.length ? { cookieFlags } : {}),
    };
  }

  // Unreachable — the loop either returns or throws — but fail closed.
  throw new ScanError("REDIRECT_LIMIT", `The site redirected more than ${maxRedirects} times.`);
}
