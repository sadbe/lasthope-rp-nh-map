import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// NextAuth catch-all route handler — exposes:
//   POST /api/auth/callback/credentials   (login)
//   POST /api/auth/signout                (logout)
//   GET  /api/auth/session                (read current session, JSON)
//   GET  /api/auth/csrf                   (CSRF token for forms)
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
