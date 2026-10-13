import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "pg", "razorpay"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    // Per-user responses must never be cached by browsers or shared proxies
    const noStore = [{ key: "Cache-Control", value: "private, no-store" }];
    return [
      { source: "/api/auth/me", headers: noStore },
      { source: "/api/orders/:path*", headers: noStore },
      { source: "/api/orders", headers: noStore },
      { source: "/api/wishlist/:path*", headers: noStore },
      { source: "/api/wishlist", headers: noStore },
      { source: "/api/payment/:path*", headers: noStore },
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: process.env.CORS_ORIGIN || "http://localhost:3030" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type,Authorization" },
          { key: "Access-Control-Allow-Credentials", value: "true" },
        ],
      },
    ];
  },
};

export default nextConfig;
