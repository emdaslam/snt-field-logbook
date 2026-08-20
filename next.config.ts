import type { NextConfig } from "next";

/**
 * MOBILE_EXPORT=1 produces a fully static bundle in `out/`, which Capacitor
 * packages into the APK. The app then runs entirely from the device with no
 * server and no network access of any kind.
 */
const isMobileExport = process.env.MOBILE_EXPORT === "1";

const nextConfig: NextConfig = {
  allowedDevOrigins: [".monkeycode-ai.live"],
  ...(isMobileExport
    ? {
        output: "export",
        distDir: ".next-mobile",
        images: { unoptimized: true },
        // Capacitor serves files from disk, so emit directory-style URLs
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
