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
        { source: "/:page(terms|privacy|paid)", has: SEATSNIPE_HOST, destination: "/seatsnipe/:page" },
        // Referral links like getseatsnipe.com/KX7B2Q. Every 6-character path
        // lands here and the page 404s anything that isn't a code, so don't
        // give a SeatSnipe page a 6-letter name.
        { source: "/:code([0-9A-Za-z]{6})", has: SEATSNIPE_HOST, destination: "/seatsnipe/r/:code" },
      ],
    };
  },
};

export default nextConfig;
