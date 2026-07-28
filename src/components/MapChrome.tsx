"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

// ===== МИНИКАРТА =====
// Вся карта целиком в углу плюс рамка текущего вида. Клик или перетаскивание
// внутри — камера прыгает в эту точку. Масштаб не трогаем, только положение.
const MINI = 150;

export function MiniMap() {
  const view = useZoneMapStore(s => s.view);
  const setView = useZoneMapStore(s => s.setView);
  const mapImageUrl = useZoneMapStore(s => s.mapImageUrl);
  const mapImageWidth = useZoneMapStore(s => s.mapImageWidth);
  const mapImageHeight = useZoneMapStore(s => s.mapImageHeight);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [open, setOpen] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);

  useEffect(() => {
    const upd = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    upd();
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, []);

  const jumpTo = useCallback((clientX: number, clientY: number) => {
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    const stageX = ((clientX - r.left) / MINI) * STAGE_SIZE;
    const stageY = ((clientY - r.top) / MINI) * STAGE_SIZE;
    const v = useZoneMapStore.getState().view;
    setView({
      tx: window.innerWidth / 2 - stageX * v.scale,
      ty: window.innerHeight / 2 - stageY * v.scale,
      scale: v.scale,
    });
  }, [setView]);

  if (!mapImageUrl || vp.w === 0) return null;

  const k = MINI / STAGE_SIZE; // сцена -> миникарта
  // Картинка растянута по ширине сцены; высота — по её пропорциям.
  const natW = mapImageWidth || 8000;
  const natH = mapImageHeight || 8000;
  const imgH = MINI * (natH / natW);

  // Прямоугольник текущего вида в координатах сцены, переведённый в миникарту.
  const rx = (-view.tx / view.scale) * k;
  const ry = (-view.ty / view.scale) * k;
  const rw = (vp.w / view.scale) * k;
  const rh = (vp.h / view.scale) * k;

  return (
    <div className={`mini-map ${open ? "" : "mini-collapsed"}`}>
      <button className="mini-toggle" onClick={() => setOpen(o => !o)}
        title={open ? "Свернуть миникарту" : "Развернуть миникарту"}>
        {open ? "–" : "▣"}
      </button>
      {open && (
        <div
          ref={boxRef}
          className="mini-box"
          style={{ width: MINI, height: MINI }}
          onPointerDown={e => {
            dragRef.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            jumpTo(e.clientX, e.clientY);
          }}
          onPointerMove={e => { if (dragRef.current) jumpTo(e.clientX, e.clientY); }}
          onPointerUp={e => {
            dragRef.current = false;
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          }}
        >
          <img src={mapImageUrl} alt="" draggable={false}
            style={{ position: "absolute", left: 0, top: 0, width: MINI, height: imgH, maxWidth: "none", maxHeight: "none", pointerEvents: "none" }} />
          <div className="mini-view" style={{
            left: Math.max(0, rx), top: Math.max(0, ry),
            width: Math.min(rw, MINI), height: Math.min(rh, MINI),
          }} />
        </div>
      )}
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
