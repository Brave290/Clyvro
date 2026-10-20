import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app"],
  // Scanner runs in the Node runtime; keep undici out of the bundle.
  serverExternalPackages: ["undici"],
  async redirects() {
    return [
      // Retired Phase 1 sample report — the real scanner replaces it.
      { source: "/example-report", destination: "/scan", permanent: true },
    ];
  },
};
export default nextConfig;
