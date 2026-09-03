import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Short links people are likely to try by hand, pointed at the real routes
    // rather than at a 404.
    return [
      { source: "/market", destination: "/markets", permanent: true },
      { source: "/new", destination: "/create", permanent: true },
      { source: "/profile", destination: "/leaderboard", permanent: true },
    ];
  },
};

export default nextConfig;
