"use client";

import { useEffect, useState } from "react";
import { useZoneMapStore, STAGE_SIZE } from "@/lib/zone-map-store";

// Зум относительно ЦЕНТРА экрана — та же формула, что в колесе и пинче,
// только опорная точка не курсор, а середина вьюпорта.
function useZoomTo() {
  const view = useZoneMapStore(s => s.view);
  const setView = useZoneMapStore(s => s.setView);
  return (newScale: number) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    setView({
      tx: cx - (cx - view.tx) * (newScale / view.scale),
      ty: cy - (cy - view.ty) * (newScale / view.scale),
      scale: newScale,
    });
  };
}

export function ZoomRail() {
  const view = useZoneMapStore(s => s.view);
  const zoomTo = useZoomTo();
  // Next рендерит клиентские компоненты и на сервере, где window нет.
  // Поэтому ползунок появляется только после монтирования в браузере.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  // Минимум — вписанная карта, как в жестах. Шкала логарифмическая:
  // иначе весь полезный диапазон сжимается в первые проценты ползунка.
  const fit = Math.min(window.innerWidth, window.innerHeight) / STAGE_SIZE;
  const min = fit * 0.5;
  const max = 10;
  const toPct = (sc: number) => (Math.log(sc / min) / Math.log(max / min)) * 100;
  const fromPct = (p: number) => min * Math.pow(max / min, p / 100);

  const pct = Math.max(0, Math.min(100, toPct(view.scale)));

  return (
    <div className="zoom-rail">
      <button onClick={() => zoomTo(Math.min(view.scale * 1.4, max))} title="Приблизить">+</button>
      <input
        type="range" min={0} max={100} step={0.5} value={pct}
        onChange={e => zoomTo(fromPct(Number(e.target.value)))}
      />
      <button onClick={() => zoomTo(Math.max(view.scale / 1.4, min))} title="Отдалить">−</button>
      <div className="zoom-val">×{view.scale >= 1 ? view.scale.toFixed(1) : view.scale.toFixed(2)}</div>
    </div>
  );
}

// Футер: правь тексты и ссылки прямо здесь.
export function SiteFooter() {
  return (
    <div className="site-footer">
      <div>LAST HOPE · STALKER RP · DAYZ — интерактивная карта Зоны</div>
      <div className="foot-right">
        <span>Разработка: sadbe</span>
        <a href="https://discord.gg/ВАШ_ИНВАЙТ" target="_blank" rel="noreferrer">DISCORD</a>
        <a href="https://t.me/ВАШ_КОНТАКТ" target="_blank" rel="noreferrer">TELEGRAM</a>
        <a href="https://github.com/sadbe/lasthope-rp-nh-map" target="_blank" rel="noreferrer">GITHUB</a>
      </div>
    </div>
  );
}
