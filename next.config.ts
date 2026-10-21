import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // Don't advertise the framework in a response header.
  poweredByHeader: false,
  allowedDevOrigins: ["*.e2b.app"],
  // Scanner + database drivers run in the Node runtime; keep them out of the bundle.
  serverExternalPackages: ["undici", "pg", "@electric-sql/pglite", "playwright-core", "@sparticuz/chromium"],
  // Drizzle migrations are read from disk at runtime (not imported), so
  // Next's file tracing can't see them — include them explicitly or the
  // migrator fails inside serverless functions (e.g. Vercel).
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  async headers() {
    // Baseline security headers on every response. The CSP is NOT set
    // here: it carries a per-request nonce, so the middleware owns it
    // (src/lib/csp.ts). Everything else is static and lives here.
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()" },
          // Isolates our window from cross-origin openers while still letting
          // the Google sign-in popup talk back (same-origin would break it).
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        ],
      },
      {
        // Private areas and the emergency door must never be indexed or cached by shared caches.
        source: "/(admin|app|emergency)(.*)",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      { source: "/api/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      {
        source: "/(sign-in|sign-up|forgot-password|reset-password)",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
  async redirects() {
    return [
      // Retired Phase 1 sample report — the real scanner replaces it.
      { source: "/example-report", destination: "/scan", permanent: true },
    ];
  },
};
export default nextConfig;
