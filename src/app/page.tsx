'use client';

import { useEffect, useState } from 'react';
import { useZoneMapStore } from '@/lib/zone-map-store';
import ZoneMapApp from '@/components/ZoneMapApp';

// ===== INTRO OVERLAY — fades away on first interaction =====
function IntroOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [fading, setFading] = useState(false);

  const dismiss = () => {
    setFading(true);
    setTimeout(onDismiss, 600);
  };

  return (
    <div
      className={`intro-overlay intro-dark-forced ${fading ? 'intro-fade-out' : ''}`}
      onClick={dismiss}
      onTouchEnd={dismiss}
    >
      <div className="intro-content">
        <div className="intro-title">
          <span className="intro-glitch" data-text="LAST HOPE">LAST HOPE</span>
        </div>
        <div className="intro-subtitle">STALKER RP · DAYZ · ЗОНА</div>
        <div className="intro-divider" />
        <div className="intro-desc">
          Интерактивная карта Зоны. Просмотр точек, замер расстояний, слои.
          Наведите на маркер — увидите подробности.
        </div>
        <div className="intro-hint">КЛИКНИТЕ, ЧТОБЫ ВОЙТИ</div>
        <div style={{ marginTop: 24, fontFamily: 'var(--font-mono)', fontSize: 8, color: '#888', letterSpacing: '0.1em', opacity: 0.4 }}>
          <a href="/admin" style={{ color: '#888', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>Админ-панель</a>
        </div>
        <div className="intro-corner intro-corner-tl" />
        <div className="intro-corner intro-corner-tr" />
        <div className="intro-corner intro-corner-bl" />
        <div className="intro-corner intro-corner-br" />
      </div>
    </div>
  );
}

export default function Home() {
  const setAppMode = useZoneMapStore(s => s.setAppMode);
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    setAppMode('viewer');
    // If user already visited, skip intro
    try {
      if (localStorage.getItem('lasthope-visited')) setShowIntro(false);
    } catch {}
  }, [setAppMode]);

  const dismissIntro = () => {
    setShowIntro(false);
    try { localStorage.setItem('lasthope-visited', '1'); } catch {}
  };

  return (
    <>
      <ZoneMapApp />
      {showIntro && <IntroOverlay onDismiss={dismissIntro} />}
    </>
  );
}
