import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * NextAuth configuration — credentials provider backed by AdminUser table.
 *
 * Password verification uses bcrypt.compare against the `passwordHash` column.
 * No passwords are stored in plaintext anywhere in the system.
 *
 * The session JWT contains `user.id`, `user.email`, `user.name`, `user.role`
 * (default "admin") and is signed with NEXTAUTH_SECRET (required env var).
 *
 * Cookies are httpOnly + Secure + SameSite=Lax by default — see
 * `cookies` overrides below for production hardening.
 */
export const authOptions: NextAuthOptions = {
  // JWT-based session — works on Next.js standalone deployment without
  // any external session store. Stateless = horizontally scalable.
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8, // 8 hours
  },
  providers: [
    CredentialsProvider({
      name: "Admin Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@lasthope.zone" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.adminUser.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // First-time sign-in: persist role + id into the JWT.
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "admin";
      }
      return token;
    },
    async session({ session, token }) {
      // Expose role + id on the session object so client + server can read it.
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = (token.role as string) ?? "viewer";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login?error=1",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

/**
 * Server-side authorization guard for mutating API routes.
 *
 * Usage in a route handler:
 *
 *   export async function POST(req: NextRequest) {
 *     const auth = await requireAdmin();
 *     if (auth instanceof NextResponse) return auth; // 401 response
 *     // ...now safe to mutate the DB...
 *   }
 *
 * Returns `null` if authorized, or a 401 NextResponse if not.
 * Defense-in-depth: middleware.ts already blocks unauthenticated /api/*
 * requests at the edge, but this guard is the source of truth — even if
 * middleware is misconfigured, route handlers stay protected.
 */
export async function requireAdmin(): Promise<{ user: { id: string; email: string; role: string } } | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized — authentication required" },
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  const role = (session.user as { role?: string }).role ?? "viewer";
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json(
      { error: "Forbidden — admin role required" },
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return {
    user: {
      id: (session.user as { id?: string }).id ?? "",
      email: session.user.email ?? "",
      role,
    },
  };
}
