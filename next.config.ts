import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app"],
  // Scanner + database drivers run in the Node runtime; keep them out of the bundle.
  serverExternalPackages: ["undici", "pg", "@electric-sql/pglite"],
  // Drizzle migrations are read from disk at runtime (not imported), so
  // Next's file tracing can't see them — include them explicitly or the
  // migrator fails inside serverless functions (e.g. Vercel).
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  async redirects() {
    return [
      // Retired Phase 1 sample report — the real scanner replaces it.
      { source: "/example-report", destination: "/scan", permanent: true },
    ];
  },
};
export default nextConfig;
