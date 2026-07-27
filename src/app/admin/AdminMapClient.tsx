'use client';

import { useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { useZoneMapStore } from '@/lib/zone-map-store';
import ZoneMapApp from '@/components/ZoneMapApp';

/**
 * Admin-mode map client — wraps ZoneMapApp with admin mode set and
 * adds a "Sign out" button to the header.
 *
 * Authentication is verified server-side in the parent Server Component.
 * This client just sets the Zustand `appMode` to 'admin' and renders
 * the shared map UI — which respects that mode by showing extra toolbar
 * buttons and the menu panel.
 */
export default function AdminMapClient() {
  const setAppMode = useZoneMapStore((s) => s.setAppMode);

  useEffect(() => {
    setAppMode('admin');
  }, [setAppMode]);

  return (
    <>
      <ZoneMapApp />
      <SignOutButton />
    </>
  );
}

function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        zIndex: 9999,
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: 'var(--text-dim)',
        letterSpacing: '0.1em',
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        padding: '6px 10px',
        cursor: 'pointer',
        opacity: 0.7,
        transition: 'opacity 0.2s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
    >
      ⏏ ВЫЙТИ
    </button>
  );
}
