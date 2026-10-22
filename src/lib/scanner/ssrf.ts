import net from "node:net";
import { promises as dns } from "node:dns";
import { SCAN_CONFIG } from "./config";
import { ScanError, type ValidatedTarget } from "./types";

/**
 * SSRF boundary — the foundational security control of the scanner.
 *
 * Every URL (initial submission, every redirect hop, every discovered
 * link/form destination) must pass through here before a socket is opened:
 *  1. Only http/https, no embedded credentials, default ports only.
 *  2. Non-public hostnames (localhost, *.local, *.internal, single-label) rejected.
 *  3. IP literals checked against blocked ranges (private, loopback,
 *     link-local incl. cloud-metadata 169.254.169.254, CGNAT, multicast,
 *     reserved/documentation ranges, IPv6 ULA/link-local and transition
 *     mechanisms that can embed a private IPv4 address).
 *  4. DNS names are resolved ONCE, every returned address is checked, and
 *     the caller connects to a validated address (IP pinning in fetcher.ts)
 *     so a rebinding DNS server cannot swap in a private address afterwards.
 */

export type Resolver = (
  hostname: string,
) => Promise<{ address: string; family: number }[]>;

export const METADATA_HOSTS = new Set([
  "169.254.169.254", "metadata.google.internal", "metadata.google",
  "instance-data", "metadata.azure.com",
]);
export const defaultResolver: Resolver = async (hostname) => {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => ({ address: r.address, family: r.family }));
};

async function resolveWithTimeout(hostname: string, resolver: Resolver): Promise<{ address: string; family: number }[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolver(hostname),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new ScanError("DNS_TIMEOUT", `DNS resolution for ${hostname} timed out. Try again later.`)),
          SCAN_CONFIG.dnsLookupTimeoutMs,
        );
      }),
    ]);
  } catch (err) {
    if (err instanceof ScanError) throw err;
    throw new ScanError("DNS_FAILED", `We couldn't resolve ${hostname}. Check the address and try again.`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Strict dotted-quad parse. Returns 4 bytes or null. */
export function parseIpv4(ip: string): number[] | null {
  if (!net.isIPv4(ip)) return null;
  return ip.split(".").map((p) => Number(p));
}

/** Parse any IPv6 form (incl. `::` compression and embedded IPv4 tail) to 16 bytes. */
export function parseIpv6(ip: string): number[] | null {
  if (!net.isIPv6(ip)) return null;
  let addr = ip.toLowerCase();

  // Embedded IPv4 tail, e.g. ::ffff:127.0.0.1 → replace with two hextets.
  const v4Tail = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Tail) {
    const b = v4Tail[1].split(".").map(Number);
    const hi = ((b[0] << 8) | b[1]).toString(16);
    const lo = ((b[2] << 8) | b[3]).toString(16);
    addr = addr.slice(0, addr.length - v4Tail[1].length) + hi + ":" + lo;
  }

  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && head.length !== 8) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  const parts = [...head, ...Array(missing).fill("0"), ...tail];
  if (parts.length !== 8) return null;

  const bytes: number[] = [];
  for (const part of parts) {
    const n = parseInt(part || "0", 16);
    if (Number.isNaN(n) || n < 0 || n > 0xffff) return null;
    bytes.push((n >> 8) & 0xff, n & 0xff);
  }
  return bytes;
}

function inCidr(bytes: number[], base: number[], prefixLen: number): boolean {
  const fullBytes = Math.floor(prefixLen / 8);
  for (let i = 0; i < fullBytes; i++) {
    if (bytes[i] !== base[i]) return false;
  }
  const remaining = prefixLen % 8;
  if (remaining === 0) return true;
  const mask = (0xff << (8 - remaining)) & 0xff;
  return (bytes[fullBytes] & mask) === (base[fullBytes] & mask);
}

/** Non-public IPv4 ranges: [base, prefixLength]. */
const BLOCKED_V4: [number[], number][] = [
  [[0, 0, 0, 0], 8], // "this host on this network"
  [[10, 0, 0, 0], 8], // private
  [[100, 64, 0, 0], 10], // CGNAT shared address space
  [[127, 0, 0, 0], 8], // loopback
  [[169, 254, 0, 0], 16], // link-local (incl. 169.254.169.254 cloud metadata)
  [[172, 16, 0, 0], 12], // private
  [[192, 0, 0, 0], 24], // IETF special registry
  [[192, 0, 2, 0], 24], // TEST-NET-1 (documentation)
  [[192, 88, 99, 0], 24], // deprecated 6to4 relay anycast
  [[192, 168, 0, 0], 16], // private
  [[198, 18, 0, 0], 15], // benchmarking
  [[198, 51, 100, 0], 24], // TEST-NET-2 (documentation)
  [[203, 0, 113, 0], 24], // TEST-NET-3 (documentation)
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4], // reserved (incl. 255.255.255.255 broadcast)
];

export function isBlockedIpv4(bytes: number[]): boolean {
  return BLOCKED_V4.some(([base, prefix]) => inCidr(bytes, base, prefix));
}

export function isBlockedIpv6(bytes: number[]): boolean {
  const zeros = (n: number) => bytes.slice(0, n).every((b) => b === 0);

  if (zeros(16)) return true; // :: unspecified
  if (zeros(15) && bytes[15] === 1) return true; // ::1 loopback

  // IPv4-mapped ::ffff:a.b.c.d and deprecated IPv4-compatible ::a.b.c.d
  if (zeros(10) && bytes[10] === 0xff && bytes[11] === 0xff) return isBlockedIpv4(bytes.slice(12));
  if (zeros(12)) return isBlockedIpv4(bytes.slice(12));

  // NAT64 well-known prefix 64:ff9b::/96 embeds an IPv4 address in the tail.
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && bytes.slice(4, 12).every((b) => b === 0)) {
    return isBlockedIpv4(bytes.slice(12));
  }

  if (inCidr(bytes, [0x00, 0x64, 0xff, 0x9b, 0x00, 0x01], 48)) return true; // NAT64 local-use
  if (inCidr(bytes, [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 64)) return true; // 100::/64 discard-only
  if (inCidr(bytes, [0x20, 0x01, 0x00, 0x00], 32)) return true; // Teredo (embeds IPv4)
  if (inCidr(bytes, [0x20, 0x01, 0x0d, 0xb8], 32)) return true; // documentation
  if (inCidr(bytes, [0x20, 0x02], 16)) return true; // 6to4 (embeds IPv4 relay) — blocked wholesale, documented limitation
  if (inCidr(bytes, [0xfc, 0x00], 7)) return true; // unique-local fc00::/7
  if (inCidr(bytes, [0xfe, 0x80], 10)) return true; // link-local fe80::/10
  if (inCidr(bytes, [0xff, 0x00], 8)) return true; // multicast
  return false;
}

/** True when the address must never be connected to by the scanner. */
export function isBlockedIp(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4) return isBlockedIpv4(v4);
  const v6 = parseIpv6(ip);
  if (v6) return isBlockedIpv6(v6);
  return true; // unparseable → treat as blocked (fail closed)
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home", ".lan", ".corp"];

/**
 * Validate a candidate URL for public scanning. Throws ScanError with a
 * user-safe message when blocked. Does NOT open any connection itself;
 * DNS resolution (Resolver) is queries-only.
 */
export async function assertPublicUrl(
  raw: string | URL,
  resolver: Resolver = defaultResolver,
): Promise<ValidatedTarget> {
  let url: URL;
  try {
    url = typeof raw === "string" ? new URL(raw) : new URL(raw.href);
  } catch {
    throw new ScanError("INVALID_URL", "That doesn't look like a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ScanError("BLOCKED_PROTOCOL", "Only http:// and https:// URLs can be scanned.");
  }
  if (url.username || url.password) {
    throw new ScanError("BLOCKED_CREDENTIALS", "URLs with embedded credentials can't be scanned.");
  }
  const port = url.port;
  if (port !== "") {
    const expected = url.protocol === "https:" ? "443" : "80";
    if (port !== expected) {
      throw new ScanError("BLOCKED_PORT", "Only the standard web ports (80 and 443) can be scanned.");
    }
  }

  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1") // Node keeps brackets on IPv6 literals — strip for IP checks
    .replace(/\.$/, "");
  if (!hostname) throw new ScanError("INVALID_URL", "That URL has no host name.");

  // IP literal host — WHATWG URL parsing already normalizes numeric tricks
  // (e.g. 2130706433, 0x7f000001, 0177.0.0.1) to dotted-quad form, which
  // the range checks then catch. Verified by tests.
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new ScanError(
        "BLOCKED_IP",
        "That address is a private, loopback, or otherwise non-public IP. Clyvro only scans public websites.",
      );
    }
    return { url, hostname, ips: [hostname], isIpLiteral: true };
  }

  if (
    hostname === "localhost" ||
    BLOCKED_HOST_SUFFIXES.some((s) => hostname.endsWith(s)) ||
    !hostname.includes(".")
  ) {
    throw new ScanError(
      "BLOCKED_HOST",
      "That host name isn't a public website address. Clyvro only scans public websites.",
    );
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await resolveWithTimeout(hostname, resolver);
  } catch (err) {
    if (err instanceof ScanError) throw err;
    throw new ScanError("DNS_FAILED", `We couldn't resolve ${hostname}. Check the address and try again.`);
  }
  if (!addresses.length) {
    throw new ScanError("DNS_FAILED", `We couldn't resolve ${hostname}. Check the address and try again.`);
  }
  // Fail closed: if ANY resolved address is non-public, refuse the host.
  if (addresses.some((a) => isBlockedIp(a.address))) {
    throw new ScanError(
      "BLOCKED_IP",
      `${hostname} resolves to a private or internal network address, so it can't be scanned.`,
    );
  }
  return { url, hostname, ips: addresses.map((a) => a.address), isIpLiteral: false };
}
