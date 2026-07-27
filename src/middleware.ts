import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Middleware — protects /admin/* paths.
 *
 * `withAuth` reads the NextAuth session JWT from the request cookie
 * (no DB hit needed) and redirects unauthenticated users to /login
 * with a `callbackUrl` so they return after sign-in.
 *
 * Public paths (no auth required): /, /login, /api/auth/*, /api/markers
 * GET (read), /api/categories GET, /data/*.
 *
 * Фото точек лежат в Vercel Blob и отдаются напрямую с его CDN,
 * через это приложение не проходят — правило для /api/uploads/ убрано
 * вместе с самим роутом.
 *
 * Mutating API routes (/api/markers POST/PATCH/DELETE, /api/categories POST,
 * /api/categories/[id] DELETE, /api/upload POST) are protected at the
 * route-handler level via requireAdmin() in src/lib/auth.ts — that's a
 * defense-in-depth: middleware blocks navigation to /admin/*, route guard
 * blocks direct curl calls to the mutating endpoints.
 */
export default withAuth({
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized: ({ token, req }) => {
      // Allow access if user has a valid JWT token with a role.
      // `token` is null for unauthenticated requests → redirect to /login.
      const isAdmin = !!token && (token.role === "admin" || token.role === "editor");
      if (isAdmin) return true;

      // Allow read-only /api/markers GET — that's public data shared with
      // all players. The route handler itself still runs, this just avoids
      // the middleware redirecting legitimate reads.
      const isPublicRead =
        req.nextUrl.pathname.startsWith("/api/markers") && req.method === "GET" ||
        req.nextUrl.pathname.startsWith("/api/categories") && req.method === "GET" ||
        req.nextUrl.pathname.startsWith("/api/auth/") ||
        req.nextUrl.pathname.startsWith("/data/");

      if (isPublicRead) return true;

      // For mutating API endpoints called without session token, return 401
      // JSON instead of HTML redirect — friendlier for API clients.
      if (req.nextUrl.pathname.startsWith("/api/") && !isAdmin) {
        return false;
      }

      return false;
    },
  },
});

export const config = {
  // Run middleware on /admin/* and on all mutating /api/* paths.
  // Public reads (/api/markers GET, /api/categories GET) are filtered
  // by the `authorized` callback above.
  matcher: [
    "/admin/:path*",
    "/api/markers",
    "/api/markers/:path*",
    "/api/categories",
    "/api/categories/:path*",
    "/api/upload",
  ],
};
