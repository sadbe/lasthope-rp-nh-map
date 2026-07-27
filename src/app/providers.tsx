'use client';

import { SessionProvider } from 'next-auth/react';

/**
 * Client-side providers wrapper.
 *
 * SessionProvider must wrap the app so `useSession()` and `signIn()` work
 * on the client. Without it, calling signIn('credentials', ...) returns
 * "No SessionProvider found".
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
