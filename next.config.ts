import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Type errors block the build in production. Catch them at build time
    // rather than at runtime. (Previously `ignoreBuildErrors: true`.)
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
};

// ESLint errors also block the build. The `eslint` key was removed from
// the NextConfig type in Next.js 16 — use the `--max-warnings` flag in
// the lint script instead.
// eslint.config.mjs is the source of truth for lint rules.

export default nextConfig;
