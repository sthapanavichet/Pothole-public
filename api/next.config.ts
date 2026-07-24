import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Ensure the region GeoJSON is bundled with the routes that read it at runtime.
  outputFileTracingIncludes: {
    "/api/reports": ["./data/**"],
    "/api/reports/backfill-locations": ["./data/**"],
  },
};

export default nextConfig;
