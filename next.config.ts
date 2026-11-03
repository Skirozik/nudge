import type { NextConfig } from "next";

// getseatsnipe.com is served by this same app. Its pages live under
// src/app/seatsnipe, and these rewrites map the domain's clean paths onto them.
// They run beforeFiles, or "/" would serve Nudge's home page. The .localhost
// host is for trying the site locally at http://getseatsnipe.localhost:3000.
const SEATSNIPE_HOST = [{ type: "host" as const, value: "(?:www\\.)?getseatsnipe\\.(?:com|localhost)" }];

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: SEATSNIPE_HOST, destination: "/seatsnipe" },
        { source: "/:page(terms|privacy)", has: SEATSNIPE_HOST, destination: "/seatsnipe/:page" },
      ],
    };
  },
};

export default nextConfig;
