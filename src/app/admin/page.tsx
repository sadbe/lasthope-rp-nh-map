import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import AdminMapClient from './AdminMapClient';

/**
 * Server Component — checks session server-side before rendering the admin UI.
 *
 * Replaces the previous client-side AdminGate that hardcoded `zone2026` in
 * the JS bundle (R1 fix). Now the password lives only as a bcrypt hash in
 * the AdminUser table, verification happens via NextAuth Credentials
 * provider, and unauthenticated requests never reach the client component
 * that holds the admin actions.
 *
 * Also: middleware.ts redirects /admin/* to /login before this page even
 * runs — this server-side check is defense-in-depth.
 */
export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login?callbackUrl=/admin');
  }

  const role = (session.user as { role?: string }).role ?? 'viewer';
  if (role !== 'admin' && role !== 'editor') {
    redirect('/login?callbackUrl=/admin&error=1');
  }

  // All checks passed — render the interactive map in admin mode.
  return <AdminMapClient />;
}
