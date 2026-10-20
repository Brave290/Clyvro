import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // Don't advertise the framework in a response header.
  poweredByHeader: false,
  allowedDevOrigins: ["*.e2b.app"],
  // Scanner + database drivers run in the Node runtime; keep them out of the bundle.
  serverExternalPackages: ["undici", "pg", "@electric-sql/pglite"],
  // Drizzle migrations are read from disk at runtime (not imported), so
  // Next's file tracing can't see them — include them explicitly or the
  // migrator fails inside serverless functions (e.g. Vercel).
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  async headers() {
    // Baseline security headers on every response. The CSP stays
    // compatible with the inline theme-init script and Next.js runtime
    // assets while blocking framing, MIME sniffing and plugin content.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: csp },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()" },
        ],
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
