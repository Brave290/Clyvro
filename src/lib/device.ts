/**
 * Coarse, privacy-conscious device signal used ONLY to protect the free
 * scan / free account from casual repeat abuse (e.g. clearing cookies
 * for endless free scans). It is a short hash of stable browser
 * attributes — no canvas fingerprinting, no cross-site tracking, and
 * the server stores only a further hash of it combined with the IP.
 */
export function deviceSignal(): string {
  if (typeof window === "undefined") return "";
  try {
    const parts = [
      navigator.userAgent,
      navigator.language,
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
      `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
      String(navigator.hardwareConcurrency ?? ""),
      navigator.platform ?? "",
    ].join("|");
    // FNV-1a — tiny stable hash; this is an abuse signal, not an identity.
    let h = 0x811c9dc5;
    for (let i = 0; i < parts.length; i++) {
      h ^= parts.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  } catch {
    return "";
  }
}

/** Header name the client sends the signal on. */
export const DEVICE_HEADER = "x-clyvro-device";
