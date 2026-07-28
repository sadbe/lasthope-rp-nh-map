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
  // Висела на bottom:12 left:12 с z-index 9999 — то есть ровно на табло
  // координат и поверх вообще всего, включая открытые панели. Поднимаем над
  // табло, уводим под панели по z-index и отодвигаем, когда открыты слои.
  const activePanel = useZoneMapStore((s) => s.activePanel);
  return (
    <button
      className={`admin-signout${activePanel === 'layers' ? ' admin-signout-shift' : ''}`}
      onClick={() => signOut({ callbackUrl: '/login' })}
    >
      ⏏ ВЫЙТИ
    </button>
  );
}
