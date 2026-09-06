import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Short links a visitor is likely to try by hand, each pointed at a route
    // that EXISTS. A redirect into a 404 is worse than no redirect at all: it
    // turns a guess into a dead end and looks like a broken deploy.
    return [
      { source: "/profile", destination: "/leaderboard", permanent: true },
      { source: "/new", destination: "/register", permanent: true },
      { source: "/stats", destination: "/analytics", permanent: true },
      { source: "/watchers", destination: "/leaderboard", permanent: true },
      { source: "/challenges", destination: "/patrol", permanent: true },
    ];
  },
};

export default nextConfig;
