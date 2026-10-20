import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app"],
  // Scanner + database drivers run in the Node runtime; keep them out of the bundle.
  serverExternalPackages: ["undici", "pg", "@electric-sql/pglite"],
  async redirects() {
    return [
      // Retired Phase 1 sample report — the real scanner replaces it.
      { source: "/example-report", destination: "/scan", permanent: true },
    ];
  },
};
export default nextConfig;
