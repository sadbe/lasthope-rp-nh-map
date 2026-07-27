import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Type errors block the build in production. Catch them at build time
    // rather than at runtime. (Previously `ignoreBuildErrors: true`.)
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  // Allow the IM chat preview host to access Next.js dev resources
  // (e.g. /__nextjs_original-stack-frames). Without this, Next.js blocks
  // cross-origin requests from the preview domain by default.
  // The preview host format is: preview-<chat-id>.space-z.ai
  allowedDevOrigins: [
    "preview-chat-fb165804-b9ae-42b0-a8d5-17bfa18289d0.space-z.ai",
    "localhost:3000",
    "127.0.0.1:3000",
    ".space-z.ai",  // catch-all for any preview subdomain
  ],
};

// ESLint errors also block the build. The `eslint` key was removed from
// the NextConfig type in Next.js 16 — use the `--max-warnings` flag in
// the lint script instead.
// eslint.config.mjs is the source of truth for lint rules.

export default nextConfig;
