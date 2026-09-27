import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "embedded-postgres"],
  experimental: {
    // photo/video uploads go through a route handler locally; server actions stay small
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
