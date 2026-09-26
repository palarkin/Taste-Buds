import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tells the browser to upload photos/videos straight to Vercel Blob when a Blob store is connected.
  env: { NEXT_PUBLIC_UPLOADS: process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local" },
  serverExternalPackages: ["pg", "embedded-postgres"],
  experimental: {
    // photo/video uploads go through a route handler locally; server actions stay small
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
