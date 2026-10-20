import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app"],
  // Scanner runs in the Node runtime; keep undici out of the bundle.
  serverExternalPackages: ["undici"],
};
export default nextConfig;
