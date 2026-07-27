'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  useZoneMapStore,
  BUILTIN_CATEGORIES,
  ICON_ORDER,
  iconSvg,
  buildCatIndex,
  allMarkers,
  PALETTE,
  STAGE_SIZE,
  CLUSTER_THRESHOLD,
  Marker,
  Category,
  MeasurePoint,
  MAP_SIZE_M,
  calcDistances,
} from '@/lib/zone-map-store';

// Viewer mode — simplified toolbar, no admin actions, marker click shows info only
type AppMode = 'viewer' | 'admin';

// Blur button after click — prevents stuck focus highlight on mobile
function blurBtn(e: React.MouseEvent | React.TouchEvent) {
  const btn = e.currentTarget as HTMLElement;
  btn.blur();
}

// ===== DETERMINISTIC RANDOM (no hydration mismatch) =====
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// ===== FORMAT DISTANCE IN METERS =====
function formatDist(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} км`;
  return `${m} м`;
}

// ===== INACTIVE ICON COLOR (actual hex, not CSS variable) =====
const INACTIVE_ICON_COLOR = '#666666';

// ===== DEAD INSIDE TITLE =====
function DeadInsideTitle({ text }: { text: string }) {
  return (
    <span className="dead-inside-title" data-text={text}>
      <span className="sr-only">{text}</span>
      <span className="title-dissolve title-vhs">{text}</span>
    </span>
  );
}

// ===== DEAD INSIDE SUBTITLE =====
function DeadSubtitle({ text }: { text: string }) {
  return (
    <span className="subtitle-dissolve dead-strikethrough">{text}</span>
  );
}

// ===== GEIGER COUNTER =====
function GeigerCounter() {
  const geigerValue = useZoneMapStore(s => s.geigerValue);
  const setGeigerValue = useZoneMapStore(s => s.setGeigerValue);
  const [tickKey, setTickKey] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const val = Math.floor(Math.random() * 120);
      setGeigerValue(val);
      if (val > 60) setTickKey(k => k + 1);
    }, 800);
    return () => clearInterval(interval);
  }, [setGeigerValue]);

  const pct = Math.min(geigerValue / 120, 1);
  const color = pct < 0.33 ? 'var(--toxic)' : pct < 0.66 ? 'var(--amber)' : 'var(--blood-bright)';

  return (
    <div className="geiger-container">
      <div className="geiger-bar">
        <div className="geiger-bar-fill" style={{ width: `${pct * 100}%`, background: color, height: '100%' }} />
      </div>
      <span key={tickKey} className={geigerValue > 60 ? 'geiger-tick-icon' : ''} style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-dim)' }}>
        ☢
      </span>
    </div>
  );
}

// ===== ANOMALY WARNING =====
function AnomalyWarning() {
  const warning = useZoneMapStore(s => s.anomalyWarning);
  if (!warning) return null;
  return (
    <div className="anomaly-warning-flash" style={{
      position: 'fixed', top: 40, left: '50%', transform: 'translateX(-50%)',
      fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--danger)',
      letterSpacing: '0.1em', zIndex: 300,
      background: 'rgba(139,0,0,0.08)', padding: '4px 12px', border: '1px solid var(--blood)',
    }}>
      ⚠ {warning}
    </div>
  );
}

// ===== DUST PARTICLES =====
function DustParticles() {
  return (
    <>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="dust-particle" style={{
          left: `${seededRandom(i * 3 + 1) * 100}%`,
          top: `${seededRandom(i * 3 + 2) * 100}%`,
          width: 2, height: 2,
          background: 'var(--pale-dim)',
          animationDuration: `${seededRandom(i * 3) * 15 + 10}s`,
          animationDelay: `${seededRandom(i * 3 + 3) * 8}s`,
        }} />
      ))}
    </>
  );
}

// ===== CRT NOISE =====
function CrtNoise() {
  return <div className="crt-noise" />;
}

// ===== SEARCH BAR — Desktop =====
function SearchBar() {
  const searchQuery = useZoneMapStore(s => s.searchQuery);
  const setSearchQuery = useZoneMapStore(s => s.setSearchQuery);
  return (
    <input
      className="s-input search-wide"
      placeholder="ПОИСК ЛОКАЦИИ..."
      value={searchQuery}
      onChange={e => setSearchQuery(e.target.value)}
    />
  );
}

// ===== MOBILE SEARCH BAR =====
function MobileSearchBar() {
  const searchQuery = useZoneMapStore(s => s.searchQuery);
  const setSearchQuery = useZoneMapStore(s => s.setSearchQuery);
  return (
    <input
      className="s-input search-compact"
      placeholder="ПОИСК..."
      value={searchQuery}
      onChange={e => setSearchQuery(e.target.value)}
    />
  );
}

// ===== LAYERS PANEL =====
function LayersPanel() {
  const appMode = useZoneMapStore(s => s.appMode);
  const activeLayers = useZoneMapStore(s => s.activeLayers);
  const toggleLayer = useZoneMapStore(s => s.toggleLayer);
  const setActivePanel = useZoneMapStore(s => s.setActivePanel);
  const customCategories = useZoneMapStore(s => s.customCategories);
  const removeCustomCategory = useZoneMapStore(s => s.removeCustomCategory);
  const markers = useZoneMapStore(s => s.markers);
  const allCats = useMemo(() => [...BUILTIN_CATEGORIES, ...customCategories], [customCategories]);

  const handleDeleteLayer = useCallback((e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    const inUse = markers.filter(m => m.cat === id).length;
    const msg = inUse > 0
      ? `Удалить слой «${name}»? Точки на нём (${inUse}) тоже будут удалены — у всех.`
      : `Удалить слой «${name}»?`;
    if (confirm(msg)) removeCustomCategory(id);
  }, [markers, removeCustomCategory]);

  return (
    <div className="panel-from-left pda-sweep map-panel map-panel-left">
      <div className="map-panel-header">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
          СЛОИ ▾
        </div>
      </div>
      <div className="stalker-scroll map-panel-body">
        {allCats.map(cat => {
          const active = activeLayers[cat.id] ?? true;
          const iconColor = active ? cat.color : INACTIVE_ICON_COLOR;
          const isBuiltin = BUILTIN_CATEGORIES.some(b => b.id === cat.id);
          return (
            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', cursor: 'pointer' }}
              onClick={() => toggleLayer(cat.id)}>
              <div style={{
                width: 10, height: 10, borderRadius: 2,
                border: `1px solid ${active ? cat.color : '#333'}`,
                background: active ? cat.color : '#181818',
                opacity: active ? 0.7 : 0.3,
              }} />
              <span dangerouslySetInnerHTML={{ __html: iconSvg(cat.icon, iconColor) }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, color: active ? 'var(--text-pale)' : 'var(--text-dim)',
                letterSpacing: '0.05em', textTransform: 'uppercase', flex: 1,
              }}>
                {cat.name}
              </span>
              {appMode === 'admin' && !isBuiltin && (
                <span onClick={(e) => handleDeleteLayer(e, cat.id, cat.name)}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', padding: '2px 4px' }}>
                  ✕
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="map-panel-footer">
        <button className="s-btn" style={{ width: '100%' }} onClick={() => setActivePanel('none')}>✕ ЗАКРЫТЬ</button>
      </div>
    </div>
  );
}

// ===== MENU PANEL =====
function MenuPanel() {
  const setActivePanel = useZoneMapStore(s => s.setActivePanel);
  const markers = useZoneMapStore(s => s.markers);
  const addMarker = useZoneMapStore(s => s.addMarker);
  const clearAllMarkers = useZoneMapStore(s => s.clearAllMarkers);
  const setMapImageUrl = useZoneMapStore(s => s.setMapImageUrl);
  const mapImageUrl = useZoneMapStore(s => s.mapImageUrl);
  const themeMode = useZoneMapStore(s => s.themeMode);
  const setThemeMode = useZoneMapStore(s => s.setThemeMode);
  const fullscreenMode = useZoneMapStore(s => s.fullscreenMode);
  const setFullscreenMode = useZoneMapStore(s => s.setFullscreenMode);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setMapImageUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [setMapImageUrl]);

  const handleExport = useCallback(() => {
    const data = { markers, mapImageUrl };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'lasthope-map-export.json'; a.click();
    URL.revokeObjectURL(url);
  }, [markers, mapImageUrl]);

  const handleImportClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          // Pushed one-by-one through addMarker so each import also lands
          // on the server, not just this one browser's local state.
          if (Array.isArray(json.markers)) json.markers.forEach((m: Marker) => addMarker(m));
          if (json.mapImageUrl) setMapImageUrl(json.mapImageUrl);
        } catch { /* ignore */ }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [addMarker, setMapImageUrl]);

  const handleDeleteAll = useCallback(() => {
    if (confirm('Удалить все маркеры? Это затронет ВСЕХ игроков.')) clearAllMarkers();
  }, [clearAllMarkers]);

  return (
    <div className="panel-from-right pda-sweep map-panel map-panel-right">
      <div className="map-panel-header">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
          МЕНЮ ▾
        </div>
      </div>
      <div className="stalker-scroll map-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />
        <button className="s-btn" style={{ width: '100%' }} onClick={() => fileInputRef.current?.click()}>
          ☠ <span className="btn-label">ЗАГРУЗИТЬ КАРТУ</span>
        </button>
        <button className="s-btn" style={{ width: '100%' }} onClick={handleExport}>
          ⬇ <span className="btn-label">ЭКСПОРТ JSON</span>
        </button>
        <button className="s-btn" style={{ width: '100%' }} onClick={handleImportClick}>
          ⬆ <span className="btn-label">ИМПОРТ JSON</span>
        </button>
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        <button className={`s-btn ${themeMode === 'light' ? 'amber-active' : 'active'}`} style={{ width: '100%' }} onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}>
          {themeMode === 'dark' ? '☀' : '◑'} <span className="btn-label">{themeMode === 'dark' ? 'СВЕТЛЫЙ' : 'ТЁМНЫЙ'} РЕЖИМ</span>
        </button>
        <button className={`s-btn ${fullscreenMode ? 'active' : ''}`} style={{ width: '100%' }} onClick={() => setFullscreenMode(!fullscreenMode)}>
          ↗ <span className="btn-label">ФУЛСКРИН</span>
        </button>
        <button className="s-btn danger" style={{ width: '100%' }} onClick={handleDeleteAll}>
          ✕ <span className="btn-label">УДАЛИТЬ ВСЕ</span>
        </button>
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>РАЗРАБОТКА</div>
          <a className="credit-link" href="https://t.me/corbinuwu" target="_blank" rel="noopener noreferrer">TG: @corbinuwu</a>
          <a className="credit-link" href="https://github.com/Sadbe" target="_blank" rel="noopener noreferrer">GITHUB: Sadbe</a>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)', marginTop: 4, letterSpacing: '0.08em' }}>
            LAST HOPE — STALKER RP DAYZ
          </div>
        </div>
      </div>
      <div className="map-panel-footer">
        <button className="s-btn" style={{ width: '100%' }} onClick={() => setActivePanel('none')}>✕ ЗАКРЫТЬ</button>
      </div>
    </div>
  );
}

// ===== NEW LAYER SHEET =====
function NewLayerSheet() {
  const addCustomCategory = useZoneMapStore(s => s.addCustomCategory);
  const setActiveSheet = useZoneMapStore(s => s.setActiveSheet);
  const setSheetMode = useZoneMapStore(s => s.setSheetMode);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [icon, setIcon] = useState(ICON_ORDER[0]);

  const handleSave = useCallback(() => {
    if (!name.trim()) return;
    addCustomCategory({ id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: name.trim(), color, icon, builtin: false });
    setActiveSheet(null); setSheetMode(null);
  }, [name, color, icon, addCustomCategory, setActiveSheet, setSheetMode]);

  return (
    <div className="sheet-slide-up new-layer-sheet">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 10 }}>НОВЫЙ СЛОЙ ▾</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input className="s-input" placeholder="НАЗВАНИЕ СЛОЯ" value={name} onChange={e => setName(e.target.value)} />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {PALETTE.slice(0, 12).map(c => (
            <div key={c} style={{ width: 18, height: 18, background: c, border: `1px solid ${color === c ? 'var(--text-bright)' : 'var(--border)'}`, cursor: 'pointer', borderRadius: 2 }}
              onClick={() => setColor(c)} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {ICON_ORDER.map(ic => (
            <div key={ic} style={{ padding: 2, border: `1px solid ${icon === ic ? 'var(--pale)' : 'var(--border)'}`, cursor: 'pointer', background: icon === ic ? 'var(--ash)' : 'var(--panel)' }}
              onClick={() => setIcon(ic)}>
              <span dangerouslySetInnerHTML={{ __html: iconSvg(ic, icon === ic ? color : INACTIVE_ICON_COLOR) }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="s-btn" onClick={handleSave}>✓ СОХРАНИТЬ</button>
          <button className="s-btn danger" onClick={() => { setActiveSheet(null); setSheetMode(null); }}>✕ ОТМЕНА</button>
        </div>
      </div>
    </div>
  );
}

// ===== VIEW MARKER SHEET =====
function ViewMarkerSheet({ marker, cat }: { marker: Marker; cat: Category }) {
  const appMode = useZoneMapStore(s => s.appMode);
  const setActiveSheet = useZoneMapStore(s => s.setActiveSheet);
  const setSheetMode = useZoneMapStore(s => s.setSheetMode);
  const removeMarker = useZoneMapStore(s => s.removeMarker);
  const setShowSaveIndicator = useZoneMapStore(s => s.setShowSaveIndicator);

  return (
    <div className="sheet-slide-up marker-sheet-container">
      {marker.imageUrl && (
        <div style={{ marginBottom: 10 }}>
          <img src={marker.imageUrl} alt={marker.name} style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 2, border: '1px solid var(--border)' }} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span dangerouslySetInnerHTML={{ __html: iconSvg(cat.icon, cat.color) }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-bright)', letterSpacing: '0.08em' }}>{marker.name}</span>
        <div style={{ width: 6, height: 6, background: cat.color, borderRadius: 3, opacity: 0.6 }} />
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 6 }}>
        {cat.name} · {marker.xPct.toFixed(1)}% · {marker.yPct.toFixed(1)}%
      </div>
      {marker.note && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--pale)', marginBottom: 8, lineHeight: 1.4 }}>{marker.note}</div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {appMode === 'admin' && (
          <>
            <button className="s-btn" onClick={() => setSheetMode('edit')}>✏ <span className="btn-label">РЕД.</span></button>
            <button className="s-btn danger" onClick={() => { removeMarker(marker.id); setActiveSheet(null); setSheetMode(null); setShowSaveIndicator(true); }}>✕ <span className="btn-label">УДАЛИТЬ</span></button>
          </>
        )}
        <button className="s-btn" onClick={() => { setActiveSheet(null); setSheetMode(null); }}>← <span className="btn-label">ЗАКРЫТЬ</span></button>
      </div>
    </div>
  );
}

// ===== EDIT MARKER SHEET =====
function EditMarkerSheet({ marker, cat }: { marker: Marker; cat: Category }) {
  const updateMarker = useZoneMapStore(s => s.updateMarker);
  const setActiveSheet = useZoneMapStore(s => s.setActiveSheet);
  const setSheetMode = useZoneMapStore(s => s.setSheetMode);
  const customCategories = useZoneMapStore(s => s.customCategories);
  const setShowSaveIndicator = useZoneMapStore(s => s.setShowSaveIndicator);
  const allCats = useMemo(() => [...BUILTIN_CATEGORIES, ...customCategories], [customCategories]);
  const [name, setName] = useState(marker.name);
  const [note, setNote] = useState(marker.note || '');
  const [selectedCat, setSelectedCat] = useState(marker.cat);
  const [imageUrl, setImageUrl] = useState(marker.imageUrl || '');
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setImageUrl(data.imageUrl);
      }
    } catch { /* offline */ }
    setUploading(false);
  }, []);

  const handleSave = useCallback(() => {
    updateMarker(marker.id, { name: name.trim(), note: note.trim(), cat: selectedCat, imageUrl: imageUrl.trim() || undefined });
    setActiveSheet(null); setSheetMode(null);
    setShowSaveIndicator(true);
  }, [name, note, selectedCat, imageUrl, marker.id, updateMarker, setActiveSheet, setSheetMode, setShowSaveIndicator]);

  return (
    <div className="sheet-slide-up marker-sheet-container">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 8 }}>РЕД. ТОЧКУ ▾</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {imageUrl && (
          <div style={{ position: 'relative' }}>
            <img src={imageUrl} alt="preview" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 2, border: '1px solid var(--border)' }} />
            <button style={{ position: 'absolute', top: 4, right: 4, background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 2, fontSize: 8, fontFamily: 'var(--font-mono)', padding: '2px 6px', cursor: 'pointer' }} onClick={() => setImageUrl('')}>✕</button>
          </div>
        )}
        <input className="s-input" placeholder="НАЗВАНИЕ" value={name} onChange={e => setName(e.target.value)} />
        <textarea className="s-input" placeholder="ЗАМЕТКА" value={note} onChange={e => setNote(e.target.value)} rows={3} style={{ resize: 'vertical', minHeight: 60 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>СКРИНШОТ / ИЗОБРАЖЕНИЕ</div>
          <input className="s-input" placeholder="URL ИЗОБРАЖЕНИЯ (https://...)" value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
          <label className="s-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', opacity: uploading ? 0.5 : 1 }}>
            {uploading ? '⏳ ЗАГРУЗКА...' : '📁 ЗАГРУЗИТЬ ФАЙЛ'}
            <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleFileUpload} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {allCats.map(c => {
            const isActive = selectedCat === c.id;
            const iconColor = isActive ? c.color : INACTIVE_ICON_COLOR;
            return (
              <div key={c.id} className={`cat-chip ${isActive ? 'active' : ''}`} style={{ borderColor: isActive ? c.color : undefined }}
                onClick={() => setSelectedCat(c.id)}>
                <span dangerouslySetInnerHTML={{ __html: iconSvg(c.icon, iconColor) }} />
                {c.name}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="s-btn" onClick={handleSave}>✓ СОХРАНИТЬ</button>
          <button className="s-btn danger" onClick={() => { setActiveSheet(null); setSheetMode(null); }}>✕ ОТМЕНА</button>
        </div>
      </div>
    </div>
  );
}

// ===== MARKER SHEET =====
function MarkerSheet() {
  const activeSheet = useZoneMapStore(s => s.activeSheet);
  const sheetMode = useZoneMapStore(s => s.sheetMode);
  const markers = useZoneMapStore(s => s.markers);
  const presetMarkers = useZoneMapStore(s => s.presetMarkers);
  const customCategories = useZoneMapStore(s => s.customCategories);
  const catIdx = useMemo(() => buildCatIndex(customCategories), [customCategories]);

  if (!activeSheet || !sheetMode) return null;
  if (sheetMode === 'newLayer') return <NewLayerSheet />;
  const all = allMarkers(presetMarkers, markers);
  const marker = all.find(m => m.id === activeSheet);
  if (!marker) return null;
  const cat = catIdx[marker.cat] || BUILTIN_CATEGORIES[BUILTIN_CATEGORIES.length - 1];
  if (sheetMode === 'edit') return <EditMarkerSheet key={marker.id} marker={marker} cat={cat} />;
  return <ViewMarkerSheet marker={marker} cat={cat} />;
}

// ===== MAP ENGINE =====
function MapEngine() {
  const view = useZoneMapStore(s => s.view);
  const setView = useZoneMapStore(s => s.setView);
  const mapImageUrl = useZoneMapStore(s => s.mapImageUrl);
  const addMode = useZoneMapStore(s => s.addMode);
  const appMode = useZoneMapStore(s => s.appMode);
  const setAddMode = useZoneMapStore(s => s.setAddMode);
  const measureModeOn = useZoneMapStore(s => s.measureModeOn);
  const setMeasureModeOn = useZoneMapStore(s => s.setMeasureModeOn);
  const measureState = useZoneMapStore(s => s.measureState);
  const gridVisible = useZoneMapStore(s => s.gridVisible);
  const activeLayers = useZoneMapStore(s => s.activeLayers);
  const addMarker = useZoneMapStore(s => s.addMarker);
  const addMeasurePoint = useZoneMapStore(s => s.addMeasurePoint);
  const setActiveSheet = useZoneMapStore(s => s.setActiveSheet);
  const setSheetMode = useZoneMapStore(s => s.setSheetMode);
  const setMapImageUrl = useZoneMapStore(s => s.setMapImageUrl);
  const setMapImageSize = useZoneMapStore(s => s.setMapImageSize);
  const markers = useZoneMapStore(s => s.markers);
  const presetMarkers = useZoneMapStore(s => s.presetMarkers);
  const customCategories = useZoneMapStore(s => s.customCategories);
  const searchQuery = useZoneMapStore(s => s.searchQuery);
  const setShowSaveIndicator = useZoneMapStore(s => s.setShowSaveIndicator);
  const mapImageWidth = useZoneMapStore(s => s.mapImageWidth);
  const mapImageHeight = useZoneMapStore(s => s.mapImageHeight);

  const [isDragging, setIsDragging] = useState(false);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef({ startX: 0, startY: 0, startTx: 0, startTy: 0, moved: false, active: false });
  const pinchRef = useRef({ initialDist: 0, initialScale: 1 });
  // Set for as long as 2+ fingers are on screen. Pointer events fire per
  // finger, so without this the single-finger pan logic in handlePointerMove
  // kept running alongside the native 2-finger pinch handler below and the
  // two fought over view.tx/ty — the view would jump/drift mid-pinch.
  const isPinchingRef = useRef(false);
  // Актуальные кластеры для хит-теста в handlePointerUp (см. комментарий
  // у присваивания ниже).
  const clusteredRef = useRef<Marker[]>([]);

  // ResizeObserver
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(() => setViewportSize({ w: vp.clientWidth, h: vp.clientHeight }));
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  // Fit map — compute scale first, then use it for tx/ty (fix stale scale bug)
  const fitToViewport = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    // Масштаб считаем от внутренней координатной сетки STAGE_SIZE — именно
    // в ней рисуются и картинка, и метки. Раньше здесь стоял naturalWidth
    // картинки, из-за чего карта 8000 px при STAGE_SIZE 20000 выходила
    // ровно в 2.5 раза крупнее экрана и не вписывалась.
    const newScale = Math.min(vp.clientWidth, vp.clientHeight) / STAGE_SIZE;
    setView({
      tx: (vp.clientWidth - STAGE_SIZE * newScale) / 2,
      ty: (vp.clientHeight - STAGE_SIZE * newScale) / 2,
      scale: newScale,
    });
  }, [setView]);

  useEffect(() => { if (mapImageUrl) setTimeout(fitToViewport, 150); }, [mapImageUrl, fitToViewport]);

  // Image load handler
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setMapImageSize(img.naturalWidth, img.naturalHeight);
  }, [setMapImageSize]);

  // Страховка от гонки с кэшем: loadMapAssets предзагружает картинку через
  // new Image(), поэтому настоящий <img> монтируется с уже готовым файлом —
  // и браузер может выстрелить load ДО того, как React повесит onLoad.
  // Тогда размер так и остаётся 0, элемент рисуется в фолбэке 20000px,
  // упирается в лимит слоя 8192 и схлопывается в полоску, попутно съедая
  // память. Проверяем complete вручную после монтирования и смены src.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setMapImageSize(img.naturalWidth, img.naturalHeight);
    }
  }, [mapImageUrl, setMapImageSize]);

  // Pinch zoom — use store.getState() for fresh values (fix stale closure bug)
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    // Свой ограничитель по кадрам: touchmove при щипке сыплется так же часто,
    // как pointermove, и без этого каждый кадр перерисовывал всю карту.
    let raf: number | null = null;
    let pending: { tx: number; ty: number; scale: number } | null = null;
    const flush = () => {
      raf = null;
      if (pending) useZoneMapStore.getState().setView(pending);
    };
    const push = (v: { tx: number; ty: number; scale: number }) => {
      pending = v;
      if (raf === null) raf = requestAnimationFrame(flush);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        isPinchingRef.current = true;
        dragRef.current.active = false; // kill any in-progress single-finger pan/tap
        const currentScale = useZoneMapStore.getState().view.scale;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = { initialDist: Math.sqrt(dx * dx + dy * dy), initialScale: currentScale };
        e.preventDefault();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) isPinchingRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const currentView = useZoneMapStore.getState().view;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Нижний предел зума считаем от вписанного масштаба, а не константой.
        // Вписанная карта живёт на scale ≈ 0.02–0.045 (viewport / 20000),
        // а жёсткий clamp 0.1 при первом же щипке ШВЫРЯЛ масштаб на 0.1 —
        // скачок в 2–5 раз, карта «прыгала» от любого касания.
        const fitScale = Math.min(vp.clientWidth, vp.clientHeight) / STAGE_SIZE;
        const minScale = fitScale * 0.5;
        const newScale = Math.max(minScale, Math.min(pinchRef.current.initialScale * (dist / pinchRef.current.initialDist), 10));
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = vp.getBoundingClientRect();
        const mx = cx - rect.left;
        const my = cy - rect.top;
        const newTx = mx - (mx - currentView.tx) * (newScale / currentView.scale);
        const newTy = my - (my - currentView.ty) * (newScale / currentView.scale);
        push({ tx: newTx, ty: newTy, scale: newScale });
      }
    };

    vp.addEventListener('touchstart', handleTouchStart, { passive: false });
    vp.addEventListener('touchmove', handleTouchMove, { passive: false });
    vp.addEventListener('touchend', handleTouchEnd, { passive: false });
    vp.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      vp.removeEventListener('touchstart', handleTouchStart);
      vp.removeEventListener('touchmove', handleTouchMove);
      vp.removeEventListener('touchend', handleTouchEnd);
      vp.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  // Wheel zoom — native event with passive:false (fix passive wheel bug)
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const currentView = useZoneMapStore.getState().view;
      const rect = vp.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      // Тот же динамический минимум, что и в пинче: от вписанного масштаба.
      // Раньше clamp 0.1 означал, что первый скролл «от себя» на вписанной
      // карте наоборот ПРИБЛИЖАЛ её скачком до scale 0.1.
      const fitScale = Math.min(vp.clientWidth, vp.clientHeight) / STAGE_SIZE;
      const minScale = fitScale * 0.5;
      const newScale = Math.max(minScale, Math.min(currentView.scale * factor, 10));
      const newTx = mx - (mx - currentView.tx) * (newScale / currentView.scale);
      const newTy = my - (my - currentView.ty) * (newScale / currentView.scale);
      useZoneMapStore.getState().setView({ tx: newTx, ty: newTy, scale: newScale });
    };
    vp.addEventListener('wheel', handler, { passive: false });
    return () => vp.removeEventListener('wheel', handler);
  }, []);

  // Pointer events — pan + click (fix: capture on viewport, check drag active)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isPinchingRef.current) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTx: view.tx, startTy: view.ty, moved: false, active: true };
    setIsDragging(true);
    viewportRef.current?.setPointerCapture(e.pointerId);
  }, [view.tx, view.ty]);

  // Палец генерирует до 120 событий в секунду, и каждое вызывало setView,
  // то есть полную перерисовку компонента со всеми метками. Копим последнее
  // положение и применяем один раз за кадр — картинка двигается так же
  // плавно, а работы в разы меньше.
  const rafRef = useRef<number | null>(null);
  const pendingViewRef = useRef<{ tx: number; ty: number; scale: number } | null>(null);
  const scheduleView = useCallback((v: { tx: number; ty: number; scale: number }) => {
    pendingViewRef.current = v;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (pendingViewRef.current) setView(pendingViewRef.current);
    });
  }, [setView]);
  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.active || isPinchingRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    // A phone's touch naturally wobbles several px even on a still tap —
    // 3px meant almost every tap got misread as a drag, so "place a point"
    // effectively only worked if you held very still (looked like it needed
    // a long-press). Matches the tolerance used elsewhere in this project.
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) dragRef.current.moved = true;
    if ((!addMode && !measureModeOn) || dragRef.current.moved) {
      scheduleView({ tx: dragRef.current.startTx + dx, ty: dragRef.current.startTy + dy, scale: view.scale });
    }
  }, [addMode, measureModeOn, view.scale, scheduleView]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    const wasActive = dragRef.current.active;
    dragRef.current.active = false;
    viewportRef.current?.releasePointerCapture(e.pointerId);
    if (isPinchingRef.current || !wasActive) return;
    if (!dragRef.current.moved) {
      const vp = viewportRef.current;
      if (!vp) return;
      const rect = vp.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const xPct = ((clickX - view.tx) / (STAGE_SIZE * view.scale)) * 100;
      const yPct = ((clickY - view.ty) / (STAGE_SIZE * view.scale)) * 100;

      if (addMode && appMode === 'admin') {
        const id = `m_${Date.now()}`;
        addMarker({ id, name: 'Новая точка', cat: 'custom', xPct, yPct });
        setActiveSheet(id); setSheetMode('edit'); setAddMode(false);
        setShowSaveIndicator(true);
      } else if (measureModeOn) {
        addMeasurePoint({ xPct, yPct });
      } else {
        // Сначала проверяем кластеры. Раньше клик по пузырю «37» находил
        // случайную сырую точку из-под него и открывал её карточку — теперь
        // вместо этого приближаем карту к центру кластера, он рассыпается.
        const cluster = clusteredRef.current.find(c => {
          if (!c.id.startsWith('cluster_')) return false;
          const cx = (c.xPct / 100) * STAGE_SIZE * view.scale + view.tx;
          const cy = (c.yPct / 100) * STAGE_SIZE * view.scale + view.ty;
          return Math.abs(clickX - cx) < 16 && Math.abs(clickY - cy) < 16;
        });
        if (cluster) {
          const newScale = Math.min(view.scale * 2.5, 10);
          // Держим точку кластера под курсором при зуме — та же формула,
          // что в колесе и пинче.
          const cx = (cluster.xPct / 100) * STAGE_SIZE * view.scale + view.tx;
          const cy = (cluster.yPct / 100) * STAGE_SIZE * view.scale + view.ty;
          setView({
            tx: cx - (cx - view.tx) * (newScale / view.scale),
            ty: cy - (cy - view.ty) * (newScale / view.scale),
            scale: newScale,
          });
          return;
        }
        const all = allMarkers(presetMarkers, markers);
        const clicked = all.find(m => {
          const mx = (m.xPct / 100) * STAGE_SIZE * view.scale + view.tx;
          const my = (m.yPct / 100) * STAGE_SIZE * view.scale + view.ty;
          return Math.abs(clickX - mx) < 14 && Math.abs(clickY - my) < 14;
        });
        if (clicked) { setActiveSheet(clicked.id); setSheetMode('view'); }
      }
    }
  }, [addMode, measureModeOn, view, markers, presetMarkers, addMarker, addMeasurePoint, setActiveSheet, setSheetMode, setAddMode, setShowSaveIndicator, setView]);

  // Drag & drop file upload
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => setMapImageUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, [setMapImageUrl]);

  // Render markers
  const catIdx = useMemo(() => buildCatIndex(customCategories), [customCategories]);
  const all = useMemo(() => allMarkers(presetMarkers, markers), [presetMarkers, markers]);

  const filteredMarkers = useMemo(() => {
    let result = all.filter(m => activeLayers[m.cat] ?? true);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => m.name.toLowerCase().includes(q) || m.cat.toLowerCase().includes(q));
    }
    return result;
  }, [all, activeLayers, searchQuery]);

  // Clustering
  const clustered = useMemo(() => {
    if (viewportSize.w === 0) return filteredMarkers;
    const clusters: Record<string, Marker[]> = {};
    const singles: Marker[] = [];
    for (const m of filteredMarkers) {
      // Квантуем ЭКРАННУЮ позицию метки в сетку по CLUSTER_THRESHOLD пикселей.
      // Прежняя формула умножала проценты на ширину окна и делила на размер
      // сцены — величина получалась не в пикселях, и группировка работала
      // как придётся: при одних зумах слипалось всё подряд, при других ничего.
      const sx = (m.xPct / 100) * STAGE_SIZE * view.scale + view.tx;
      const sy = (m.yPct / 100) * STAGE_SIZE * view.scale + view.ty;
      const cx = Math.round(sx / CLUSTER_THRESHOLD) * CLUSTER_THRESHOLD;
      const cy = Math.round(sy / CLUSTER_THRESHOLD) * CLUSTER_THRESHOLD;
      const key = `${cx}_${cy}`;
      if (!clusters[key]) clusters[key] = [];
      clusters[key].push(m);
    }
    for (const key of Object.keys(clusters)) {
      const group = clusters[key];
      if (group.length <= 5) singles.push(...group);
      else singles.push({ id: `cluster_${key}`, name: `${group.length}`, cat: group[0].cat, xPct: group.reduce((s, m) => s + m.xPct, 0) / group.length, yPct: group.reduce((s, m) => s + m.yPct, 0) / group.length, preset: false });
    }
    return singles;
  }, [filteredMarkers, viewportSize, view.scale]);

  // Обработчик клика объявлен выше по файлу, а clustered — здесь, поэтому
  // напрямую в замыкание его не взять (TDZ в массиве зависимостей). Ref
  // обновляется каждый рендер и читается только в момент клика.
  clusteredRef.current = clustered;

  // Отсекаем всё, что за пределами экрана. В spawns.json почти 8000 точек,
  // и держать их все в DOM (каждая — div со свечением и карточкой) телефон
  // не тянет: тормозит и панорамирование, и зум. Рисуем только видимое плюс
  // небольшой запас по краям, чтобы при сдвиге не было пустых полей.
  const visibleMarkers = useMemo(() => {
    if (viewportSize.w === 0) return clustered;
    const pad = 120;
    return clustered.filter(m => {
      const mx = (m.xPct / 100) * STAGE_SIZE * view.scale + view.tx;
      const my = (m.yPct / 100) * STAGE_SIZE * view.scale + view.ty;
      return mx > -pad && mx < viewportSize.w + pad && my > -pad && my < viewportSize.h + pad;
    });
  }, [clustered, view, viewportSize]);

  // Measure point screen coords
  const measureScreenPts = useMemo(() => {
    return measureState.points.map(p => ({
      x: (p.xPct / 100) * STAGE_SIZE * view.scale + view.tx,
      y: (p.yPct / 100) * STAGE_SIZE * view.scale + view.ty,
    }));
  }, [measureState.points, view]);

  const cursorStyle = addMode ? 'crosshair' : measureModeOn ? 'crosshair' : isDragging ? 'grabbing' : 'grab';

  return (
    <div ref={viewportRef}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: cursorStyle }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="rad-pulse-overlay" />
      <div className="blood-ghost" />

      {mapImageUrl && (() => {
        // Элемент держим в НАТУРАЛЬНОМ размере картинки (8000 px), а разницу
        // с внутренней сеткой STAGE_SIZE добираем через transform.
        // Ставить элементу width = STAGE_SIZE (20000 px) нельзя: у браузеров
        // предел на размер слоя обычно 8192 px, и всё, что больше, рисуется
        // огрызком — карта схлопывалась в полоску.
        // Пока размер не определён, фолбэк тоже держим ПОД лимитом 8192:
        // старый фолбэк STAGE_SIZE сам создавал ту же полоску, если onLoad
        // не успевал (см. страховку в useEffect выше).
        const natW = mapImageWidth || 8000;
        const natH = mapImageHeight || 8000;
        const k = (view.scale * STAGE_SIZE) / natW;
        return (
          <img ref={imgRef} src={mapImageUrl} alt="Map" onLoad={handleImageLoad}
            style={{
              position: 'absolute',
              left: 0, top: 0,
              width: natW,
              height: natH,
              // Tailwind preflight ставит всем img `max-width: 100%`, и это
              // РЕЖЕТ наш width: 8000px до ширины родителя — карта
              // схлопывалась в вертикальную полоску (max-width сильнее
              // width, инлайновость не спасает). Отключаем явно.
              maxWidth: 'none',
              maxHeight: 'none',
              // Движение и зум через transform: композитится видеокартой,
              // раскладку не трогает. Раньше на каждом кадре менялись
              // width/height, и браузер заново растрировал всю картинку.
              transform: `translate3d(${view.tx}px, ${view.ty}px, 0) scale(${k})`,
              transformOrigin: '0 0',
              pointerEvents: 'none',
            }} draggable={false} />
        );
      })()}

      {gridVisible && (
        // Сетка привязана к КАРТЕ, а не к экрану: раньше линии стояли на
        // процентах вьюпорта и при панораме/зуме карта ехала под неподвижной
        // решёткой — как будто смотришь через забор. Теперь линии считаются
        // из координат сцены и двигаются вместе с картой. Шаг — 5% мира
        // (~1 км при 20480 м); рисуем только линии, попавшие в экран.
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} className="grid-overlay-lines">
          {Array.from({ length: 21 }, (_, i) => {
            const sx = (i * 5 / 100) * STAGE_SIZE * view.scale + view.tx;
            if (sx < 0 || sx > viewportSize.w) return null;
            return <line key={`vg${i}`} x1={sx} y1={0} x2={sx} y2={viewportSize.h} stroke="var(--border)" strokeWidth="0.5" />;
          })}
          {Array.from({ length: 21 }, (_, i) => {
            const sy = (i * 5 / 100) * STAGE_SIZE * view.scale + view.ty;
            if (sy < 0 || sy > viewportSize.h) return null;
            return <line key={`hg${i}`} x1={0} y1={sy} x2={viewportSize.w} y2={sy} stroke="var(--border)" strokeWidth="0.5" />;
          })}
        </svg>
      )}

      {visibleMarkers.map(m => {
        const cat = catIdx[m.cat] || BUILTIN_CATEGORIES[BUILTIN_CATEGORIES.length - 1];
        const mx = (m.xPct / 100) * STAGE_SIZE * view.scale + view.tx;
        const my = (m.yPct / 100) * STAGE_SIZE * view.scale + view.ty;
        const isCluster = m.id.startsWith('cluster_');
        return (
          <div key={m.id} className="marker-glow marker-hover-wrap" style={{
            position: 'absolute', left: mx, top: my, transform: 'translate(-50%, -50%)',
            '--glow-color': cat.color, zIndex: 10,
          } as React.CSSProperties}>
            {isCluster ? (
              <div style={{ width: 28, height: 28, background: `${cat.color}33`, border: `1px solid ${cat.color}`, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, color: cat.color }}>
                {m.name}
              </div>
            ) : (
              <>
                <span className="marker-icon-only" dangerouslySetInnerHTML={{ __html: iconSvg(cat.icon, cat.color) }} />
                <div className="marker-hover-tip marker-tip-card" style={{
                  position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)',
                  zIndex: 20,
                }}>
                  {m.imageUrl && (
                    <div className="tip-image-wrap">
                      <img src={m.imageUrl} alt={m.name} className="tip-image" />
                    </div>
                  )}
                  <div className="tip-header">
                    <span className="tip-icon" dangerouslySetInnerHTML={{ __html: iconSvg(cat.icon, cat.color) }} />
                    <span className="tip-name">{m.name}</span>
                    <span className="tip-cat-dot" style={{ background: cat.color }} />
                  </div>
                  <div className="tip-cat">{cat.name}</div>
                  {m.note && <div className="tip-note">{m.note.slice(0, 80)}{m.note.length > 80 ? '...' : ''}</div>}
                  <div className="tip-coords">{m.xPct.toFixed(1)}% · {m.yPct.toFixed(1)}%</div>
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Measure path — multi-point polyline */}
      {measureScreenPts.length >= 1 && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 15 }}>
          {measureScreenPts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={4} className="measure-point" />
          ))}
          {measureScreenPts.length >= 2 && measureScreenPts.map((_, i) => {
            if (i === 0) return null;
            return (
              <line key={`ml${i}`}
                x1={measureScreenPts[i - 1].x} y1={measureScreenPts[i - 1].y}
                x2={measureScreenPts[i].x} y2={measureScreenPts[i].y}
                className="measure-line-path" />
            );
          })}
        </svg>
      )}

      {/* Segment distance labels */}
      {measureScreenPts.length >= 2 && measureState.segmentDistancesM.map((dist, i) => {
        const p1 = measureScreenPts[i];
        const p2 = measureScreenPts[i + 1];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        return (
          <div key={`dl${i}`} className="measure-dist-label" style={{ left: midX, top: midY, transform: 'translate(-50%, -50%)' }}>
            {formatDist(dist)}
          </div>
        );
      })}

      {!mapImageUrl && (
        <div className="empty-zone-msg" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ fontSize: 24, fontFamily: 'var(--font-display)', letterSpacing: '0.2em', color: 'var(--text-dim)' }}>ЗОНА НЕ ЗАГРУЖЕНА</div>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', maxWidth: 300, textAlign: 'center' }}>Загрузите карту через меню ☰ или перетащите файл изображения сюда</div>
        </div>
      )}
    </div>
  );
}

// ===== MEASURE HUD =====
function MeasureHud() {
  const measureModeOn = useZoneMapStore(s => s.measureModeOn);
  const measureState = useZoneMapStore(s => s.measureState);
  const removeLastMeasurePoint = useZoneMapStore(s => s.removeLastMeasurePoint);
  const setMeasureModeOn = useZoneMapStore(s => s.setMeasureModeOn);
  const setMeasureState = useZoneMapStore(s => s.setMeasureState);

  if (!measureModeOn) return null;

  const { points, totalDistanceM, segmentDistancesM } = measureState;

  return (
    <div className="measure-hud">
      <div className="measure-total">
        {points.length === 0 ? 'КЛИКНИТЕ ДЛЯ НАЧАЛА' :
         points.length === 1 ? 'КЛИКНИТЕ СЛЕДУЮЩУЮ ТОЧКУ' :
         `ИТОГО: ${formatDist(totalDistanceM)}`}
      </div>
      {segmentDistancesM.length > 0 && (
        <div className="measure-segments">
          {segmentDistancesM.map((d, i) => (
            <span key={i}>→ {formatDist(d)} {i < segmentDistancesM.length - 1 ? '· ' : ''}</span>
          ))}
        </div>
      )}
      <div className="measure-controls">
        <button className="s-btn" onClick={removeLastMeasurePoint} disabled={points.length === 0}>
          ← <span className="btn-label">НАЗАД</span>
        </button>
        <button className="s-btn" onClick={() => { setMeasureModeOn(false); setMeasureState({ active: false, points: [], totalDistanceM: 0, segmentDistancesM: [] }); }}>
          ✕ <span className="btn-label">ЗАКРЫТЬ</span>
        </button>
      </div>
    </div>
  );
}

// ===== TOOLBAR — Desktop =====
function ToolbarWide() {
  const appMode = useZoneMapStore(s => s.appMode);
  const addMode = useZoneMapStore(s => s.addMode);
  const setAddMode = useZoneMapStore(s => s.setAddMode);
  const measureModeOn = useZoneMapStore(s => s.measureModeOn);
  const setMeasureModeOn = useZoneMapStore(s => s.setMeasureModeOn);
  const setMeasureState = useZoneMapStore(s => s.setMeasureState);
  const gridVisible = useZoneMapStore(s => s.gridVisible);
  const setGridVisible = useZoneMapStore(s => s.setGridVisible);
  const fullscreenMode = useZoneMapStore(s => s.fullscreenMode);
  const setFullscreenMode = useZoneMapStore(s => s.setFullscreenMode);
  const activePanel = useZoneMapStore(s => s.activePanel);
  const setActivePanel = useZoneMapStore(s => s.setActivePanel);
  const themeMode = useZoneMapStore(s => s.themeMode);
  const setThemeMode = useZoneMapStore(s => s.setThemeMode);
  const topoSrc = useZoneMapStore(s => s.topoSrc);
  const satelliteSrc = useZoneMapStore(s => s.satelliteSrc);
  const showingTopo = useZoneMapStore(s => s.showingTopo);
  const setShowingTopo = useZoneMapStore(s => s.setShowingTopo);
  const setMapImageUrl = useZoneMapStore(s => s.setMapImageUrl);

  const toggleTopo = useCallback(() => {
    const next = !showingTopo;
    setShowingTopo(next);
    setMapImageUrl((next ? topoSrc : satelliteSrc) ?? null);
  }, [showingTopo, topoSrc, satelliteSrc, setShowingTopo, setMapImageUrl]);

  return (
    <div className="toolbar-wide">
      {appMode === 'admin' && (
        <button className={`s-btn ${addMode ? 'blood-active' : ''}`} onPointerUp={blurBtn} onClick={() => {
          if (addMode) { setAddMode(false); return; }
          setAddMode(true); setMeasureModeOn(false); setMeasureState({ active: false, points: [], totalDistanceM: 0, segmentDistancesM: [] });
        }}><svg viewBox="0 0 16 16" width="14" height="14" className="toolbar-svg-icon"><line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="2"/><line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2"/></svg> <span className="btn-label">ТОЧКА</span></button>
      )}
      <button className={`s-btn ${measureModeOn ? 'amber-active' : ''}`} onPointerUp={blurBtn} onClick={() => {
        if (measureModeOn) { setMeasureModeOn(false); setMeasureState({ active: false, points: [], totalDistanceM: 0, segmentDistancesM: [] }); return; }
        setMeasureModeOn(true); setAddMode(false);
      }}><svg viewBox="0 0 16 16" width="14" height="14" className="toolbar-svg-icon"><line x1="2" y1="14" x2="8" y2="2" stroke="currentColor" strokeWidth="1.5"/><line x1="8" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5"/><circle cx="8" cy="2" r="1.5" fill="currentColor"/><circle cx="2" cy="14" r="1" fill="currentColor"/><circle cx="14" cy="14" r="1" fill="currentColor"/></svg> <span className="btn-label">ЛИНЕЙКА</span></button>
      <button className={`s-btn ${gridVisible ? 'active' : ''}`} onPointerUp={blurBtn} onClick={() => setGridVisible(!gridVisible)}>
        <svg viewBox="0 0 16 16" width="14" height="14" className="toolbar-svg-icon"><line x1="0" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="0.8"/><line x1="0" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="0.8"/><line x1="0" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="0.8"/><line x1="4" y1="0" x2="4" y2="16" stroke="currentColor" strokeWidth="0.8"/><line x1="8" y1="0" x2="8" y2="16" stroke="currentColor" strokeWidth="0.8"/><line x1="12" y1="0" x2="12" y2="16" stroke="currentColor" strokeWidth="0.8"/></svg> <span className="btn-label">СЕТКА</span>
      </button>
      {topoSrc && (
        <button className={`s-btn ${showingTopo ? 'active' : ''}`} onPointerUp={blurBtn} onClick={toggleTopo} title="Спутник / Топография">
          <svg viewBox="0 0 16 16" width="14" height="14" className="toolbar-svg-icon"><path d="M1 10 L5 5 L8 8 L11 4 L15 10" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M1 13 L5 8 L8 11 L11 7 L15 13" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.5"/></svg>
          <span className="btn-label">{showingTopo ? 'ТОПО' : 'СПУТНИК'}</span>
        </button>
      )}
      <button className={`s-btn ${activePanel === 'layers' ? 'active' : ''}`} onPointerUp={blurBtn} onClick={() => setActivePanel(activePanel === 'layers' ? 'none' : 'layers')}>
        <svg viewBox="0 0 16 16" width="14" height="14" className="toolbar-svg-icon"><rect x="2" y="2" width="12" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1"/><rect x="2" y="6" width="12" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1"/><rect x="2" y="10" width="12" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1"/></svg> <span className="btn-label">СЛОИ</span>
      </button>
      {appMode === 'admin' && (
        <button className={`s-btn ${activePanel === 'menu' ? 'active' : ''}`} onPointerUp={blurBtn} onClick={() => setActivePanel(activePanel === 'menu' ? 'none' : 'menu')}>
          <svg viewBox="0 0 16 16" width="14" height="14" className="toolbar-svg-icon"><line x1="2" y1="3" x2="14" y2="3" stroke="currentColor" strokeWidth="1.5"/><line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5"/><line x1="2" y1="13" x2="14" y2="13" stroke="currentColor" strokeWidth="1.5"/></svg> <span className="btn-label">МЕНЮ</span>
        </button>
      )}
      <button className={`s-btn ${themeMode === 'light' ? 'amber-active' : ''}`} onPointerUp={blurBtn} onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}>
        <svg viewBox="0 0 16 16" width="14" height="14" className="toolbar-svg-icon">
          {themeMode === 'dark' ? (
            <>
              <circle cx="8" cy="8" r="3" fill="currentColor"/>
              <line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" strokeWidth="1"/>
              <line x1="8" y1="13" x2="8" y2="15" stroke="currentColor" strokeWidth="1"/>
              <line x1="1" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1"/>
              <line x1="13" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1"/>
              <line x1="3.5" y1="3.5" x2="5" y2="5" stroke="currentColor" strokeWidth="1"/>
              <line x1="11" y1="11" x2="12.5" y2="12.5" stroke="currentColor" strokeWidth="1"/>
              <line x1="3.5" y1="12.5" x2="5" y2="11" stroke="currentColor" strokeWidth="1"/>
              <line x1="11" y1="5" x2="12.5" y2="3.5" stroke="currentColor" strokeWidth="1"/>
            </>
          ) : (
            <path d="M8,3 A5,5 0 1,0 13,8 A5,5 0 0,1 8,3" fill="currentColor"/>
          )}
        </svg> <span className="btn-label">{themeMode === 'dark' ? 'СВЕТ' : 'ТЬМА'}</span>
      </button>
      <button className={`s-btn ${fullscreenMode ? 'active' : ''}`} onPointerUp={blurBtn} onClick={() => setFullscreenMode(!fullscreenMode)}>
        <svg viewBox="0 0 16 16" width="14" height="14" className="toolbar-svg-icon"><polyline points="2,6 2,2 6,2" fill="none" stroke="currentColor" strokeWidth="1.5"/><polyline points="10,2 14,2 14,6" fill="none" stroke="currentColor" strokeWidth="1.5"/><polyline points="14,10 14,14 10,14" fill="none" stroke="currentColor" strokeWidth="1.5"/><polyline points="6,14 2,14 2,10" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg> <span className="btn-label">ФУЛСКРИН</span>
      </button>
    </div>
  );
}

// ===== TOOLBAR — Mobile =====
function ToolbarCompact() {
  const appMode = useZoneMapStore(s => s.appMode);
  const addMode = useZoneMapStore(s => s.addMode);
  const setAddMode = useZoneMapStore(s => s.setAddMode);
  const measureModeOn = useZoneMapStore(s => s.measureModeOn);
  const setMeasureModeOn = useZoneMapStore(s => s.setMeasureModeOn);
  const setMeasureState = useZoneMapStore(s => s.setMeasureState);
  const gridVisible = useZoneMapStore(s => s.gridVisible);
  const setGridVisible = useZoneMapStore(s => s.setGridVisible);
  const activePanel = useZoneMapStore(s => s.activePanel);
  const setActivePanel = useZoneMapStore(s => s.setActivePanel);
  const topoSrc = useZoneMapStore(s => s.topoSrc);
  const satelliteSrc = useZoneMapStore(s => s.satelliteSrc);
  const showingTopo = useZoneMapStore(s => s.showingTopo);
  const setShowingTopo = useZoneMapStore(s => s.setShowingTopo);
  const setMapImageUrl = useZoneMapStore(s => s.setMapImageUrl);

  const toggleTopo = useCallback(() => {
    const next = !showingTopo;
    setShowingTopo(next);
    setMapImageUrl((next ? topoSrc : satelliteSrc) ?? null);
  }, [showingTopo, topoSrc, satelliteSrc, setShowingTopo, setMapImageUrl]);

  return (
    <div className="toolbar-compact">
      {appMode === 'admin' && (
        <button className={`s-btn mob-btn ${addMode ? 'blood-active' : ''}`} onPointerUp={blurBtn} onClick={() => {
          if (addMode) { setAddMode(false); return; }
          setAddMode(true); setMeasureModeOn(false); setMeasureState({ active: false, points: [], totalDistanceM: 0, segmentDistancesM: [] });
        }}>
          <svg viewBox="0 0 16 16" width="14" height="14" className="toolbar-svg-icon"><line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="2"/><line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2"/></svg>
          <span className="mob-txt">Точка</span>
        </button>
      )}
      <button className={`s-btn mob-btn ${measureModeOn ? 'amber-active' : ''}`} onPointerUp={blurBtn} onClick={() => {
        if (measureModeOn) { setMeasureModeOn(false); setMeasureState({ active: false, points: [], totalDistanceM: 0, segmentDistancesM: [] }); return; }
        setMeasureModeOn(true); setAddMode(false);
      }}>
        <svg viewBox="0 0 16 16" width="14" height="14" className="toolbar-svg-icon"><line x1="2" y1="14" x2="8" y2="2" stroke="currentColor" strokeWidth="1.5"/><line x1="8" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5"/><circle cx="8" cy="2" r="1.5" fill="currentColor"/><circle cx="2" cy="14" r="1" fill="currentColor"/><circle cx="14" cy="14" r="1" fill="currentColor"/></svg>
        <span className="mob-txt">Линейка</span>
      </button>
      <button className={`s-btn mob-btn ${gridVisible ? 'active' : ''}`} onPointerUp={blurBtn} onClick={() => setGridVisible(!gridVisible)}>
        <svg viewBox="0 0 16 16" width="14" height="14" className="toolbar-svg-icon"><line x1="0" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="0.8"/><line x1="0" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="0.8"/><line x1="0" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="0.8"/><line x1="4" y1="0" x2="4" y2="16" stroke="currentColor" strokeWidth="0.8"/><line x1="8" y1="0" x2="8" y2="16" stroke="currentColor" strokeWidth="0.8"/><line x1="12" y1="0" x2="12" y2="16" stroke="currentColor" strokeWidth="0.8"/></svg>
        <span className="mob-txt">Сетка</span>
      </button>
      {topoSrc && (
        <button className={`s-btn mob-btn ${showingTopo ? 'active' : ''}`} onPointerUp={blurBtn} onClick={toggleTopo}>
          <svg viewBox="0 0 16 16" width="14" height="14" className="toolbar-svg-icon"><path d="M1 10 L5 5 L8 8 L11 4 L15 10" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M1 13 L5 8 L8 11 L11 7 L15 13" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.5"/></svg>
          <span className="mob-txt">{showingTopo ? 'Топо' : 'Спутник'}</span>
        </button>
      )}
      <button className={`s-btn mob-btn ${activePanel === 'layers' ? 'active' : ''}`} onPointerUp={blurBtn} onClick={() => setActivePanel(activePanel === 'layers' ? 'none' : 'layers')}>
        <svg viewBox="0 0 16 16" width="14" height="14" className="toolbar-svg-icon"><rect x="2" y="2" width="12" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1"/><rect x="2" y="6" width="12" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1"/><rect x="2" y="10" width="12" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
        <span className="mob-txt">Слои</span>
      </button>
      {appMode === 'admin' && (
        <button className={`s-btn mob-btn ${activePanel === 'menu' ? 'active' : ''}`} onPointerUp={blurBtn} onClick={() => setActivePanel(activePanel === 'menu' ? 'none' : 'menu')}>
          <svg viewBox="0 0 16 16" width="14" height="14" className="toolbar-svg-icon"><line x1="2" y1="3" x2="14" y2="3" stroke="currentColor" strokeWidth="1.5"/><line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5"/><line x1="2" y1="13" x2="14" y2="13" stroke="currentColor" strokeWidth="1.5"/></svg>
          <span className="mob-txt">Меню</span>
        </button>
      )}
    </div>
  );
}

// ===== HEADER BAR =====
function HeaderBar() {
  const appMode = useZoneMapStore(s => s.appMode);
  return (
    <div className="header-bar">
      <div className="header-row">
        <div className="header-left">
          <DeadInsideTitle text="LAST HOPE" />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text)', letterSpacing: '0.1em', marginTop: -2 }}>
            <DeadSubtitle text="STALKER RP · DAYZ" />
          </div>
        </div>
        <div className="header-right">
          <ToolbarWide />
          {appMode === 'viewer' && (
            <a href="/admin" className="admin-link" style={{
              fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)',
              letterSpacing: '0.1em', textDecoration: 'none', padding: '4px 6px',
              border: '1px solid var(--border)', borderRadius: 2, marginLeft: 4,
              opacity: 0.5, transition: 'opacity 0.2s',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}>
              ☰ АДМИН
            </a>
          )}
        </div>
      </div>
      <div className="header-center">
        <SearchBar />
        <MobileSearchBar />
      </div>
    </div>
  );
}

// ===== SAVE INDICATOR (fix: clean up timeout) =====
function SaveIndicator() {
  const show = useZoneMapStore(s => s.showSaveIndicator);
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => useZoneMapStore.getState().setShowSaveIndicator(false), 1500);
    return () => clearTimeout(timer);
  }, [show]);
  if (!show) return null;
  return <div className="save-flash" style={{ position: 'fixed', bottom: 12, right: 12, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--pale)', letterSpacing: '0.1em', zIndex: 999 }}>√ СОХРАНЕНО</div>;
}

// ===== KEYBOARD SHORTCUTS (fix: toggle grid/fullscreen) =====
function KeyboardShortcuts() {
  const setAddMode = useZoneMapStore(s => s.setAddMode);
  const setGridVisible = useZoneMapStore(s => s.setGridVisible);
  const setFullscreenMode = useZoneMapStore(s => s.setFullscreenMode);
  const resetUI = useZoneMapStore(s => s.resetUI);
  const setMeasureModeOn = useZoneMapStore(s => s.setMeasureModeOn);
  const setMeasureState = useZoneMapStore(s => s.setMeasureState);
  const removeLastMeasurePoint = useZoneMapStore(s => s.removeLastMeasurePoint);
  const setThemeMode = useZoneMapStore(s => s.setThemeMode);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const store = useZoneMapStore.getState();
      switch (e.key.toUpperCase()) {
        case 'N': setAddMode(true); setMeasureModeOn(false); setMeasureState({ active: false, points: [], totalDistanceM: 0, segmentDistancesM: [] }); break;
        case 'M': setMeasureModeOn(true); setAddMode(false); break;
        case 'G': setGridVisible(!store.gridVisible); break;
        case 'F': setFullscreenMode(!store.fullscreenMode); break;
        case 'T': setThemeMode(store.themeMode === 'dark' ? 'light' : 'dark'); break;
        case 'ESCAPE': resetUI(); setMeasureModeOn(false); setMeasureState({ active: false, points: [], totalDistanceM: 0, segmentDistancesM: [] }); break;
        case 'BACKSPACE': removeLastMeasurePoint(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setAddMode, setGridVisible, setFullscreenMode, resetUI, setMeasureModeOn, setMeasureState, removeLastMeasurePoint, setThemeMode]);

  return null;
}

// ===== PERSISTENCE =====
// Markers and custom layers are shared, so they come from the server (see
// loadFromServer / the store actions that fetch() on every change) — NOT
// localStorage, which only ever lived in one person's browser and was the
// whole reason nobody else could see anyone else's points.
// What's still fine to keep local: theme, which layers you personally have
// toggled off, and the map image (too big to put in a DB row — see the
// assets/spawns.json convention discussed for shipping it as a static file
// instead of asking every player to re-upload it).
function usePersistence() {
  const mapImageUrl = useZoneMapStore(s => s.mapImageUrl);
  const setMapImageUrl = useZoneMapStore(s => s.setMapImageUrl);
  const activeLayers = useZoneMapStore(s => s.activeLayers);
  const setActiveLayersDirect = useZoneMapStore(s => s.setActiveLayersDirect);
  const themeMode = useZoneMapStore(s => s.themeMode);
  const setThemeMode = useZoneMapStore(s => s.setThemeMode);
  const loadFromServer = useZoneMapStore(s => s.loadFromServer);
  const loadPresetMarkers = useZoneMapStore(s => s.loadPresetMarkers);
  const loadMapAssets = useZoneMapStore(s => s.loadMapAssets);
  const initialized = useRef(false);

  useEffect(() => {
    loadFromServer();
    loadPresetMarkers();
    try {
      const stored = localStorage.getItem('lasthope-layers');
      if (stored) setActiveLayersDirect(JSON.parse(stored));
    } catch { /* ignore */ }
    try {
      const stored = localStorage.getItem('lasthope-theme');
      if (stored) setThemeMode(JSON.parse(stored));
    } catch { /* ignore */ }
    try {
      const stored = localStorage.getItem('lasthope-map-image');
      if (stored) setMapImageUrl(stored);
    } catch { /* ignore */ }
    // Runs after the localStorage restore above so a manually-uploaded
    // override (if any) already won't get clobbered — loadMapAssets only
    // fills mapImageUrl in when it's still empty.
    loadMapAssets();
    initialized.current = true;
  }, [loadFromServer, loadPresetMarkers, loadMapAssets, setMapImageUrl, setActiveLayersDirect, setThemeMode]);

  useEffect(() => {
    if (!initialized.current) return;
    try { localStorage.setItem('lasthope-layers', JSON.stringify(activeLayers)); } catch { /* ignore */ }
    try { localStorage.setItem('lasthope-theme', JSON.stringify(themeMode)); } catch { /* ignore */ }
    // mapImageUrl can be very large (data URL), save separately and accept failure
    if (mapImageUrl) {
      try { localStorage.setItem('lasthope-map-image', mapImageUrl); } catch { /* too large, silently skip */ }
    } else {
      try { localStorage.removeItem('lasthope-map-image'); } catch { /* ignore */ }
    }
  }, [mapImageUrl, activeLayers, themeMode]);
}

// ===== TOAST CONTAINER — replaces silent catch blocks =====
function ToastContainer() {
  const toasts = useZoneMapStore(s => s.toasts);
  const dismissToast = useZoneMapStore(s => s.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    // Auto-dismiss each toast after 4 seconds.
    const timers = toasts.map(t => setTimeout(() => dismissToast(t.id), 4000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  const colorMap = {
    error: 'var(--danger)',
    warning: 'var(--amber)',
    info: 'var(--toxic)',
    success: 'var(--toxic)',
  };

  return (
    <div style={{
      position: 'fixed', bottom: 40, right: 12, zIndex: 9998,
      display: 'flex', flexDirection: 'column', gap: 6,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} onClick={() => dismissToast(t.id)} style={{
          background: 'var(--panel)',
          border: `1px solid ${colorMap[t.kind]}`,
          borderLeft: `3px solid ${colorMap[t.kind]}`,
          padding: '8px 12px',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--text-bright)',
          letterSpacing: '0.05em',
          maxWidth: 280,
          cursor: 'pointer',
          pointerEvents: 'auto',
          animation: 'fadeInUp 0.2s ease-out',
        }}>
          <div style={{ color: colorMap[t.kind], fontSize: 7, letterSpacing: '0.15em', marginBottom: 2 }}>
            {t.kind.toUpperCase()}
          </div>
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ===== MAIN APP =====
export default function ZoneMapApp() {
  const activePanel = useZoneMapStore(s => s.activePanel);
  const appMode = useZoneMapStore(s => s.appMode);
  const fullscreenMode = useZoneMapStore(s => s.fullscreenMode);
  const setFullscreenMode = useZoneMapStore(s => s.setFullscreenMode);
  const themeMode = useZoneMapStore(s => s.themeMode);

  usePersistence();

  // Apply theme to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  // Fullscreen (fix: catch errors)
  useEffect(() => {
    if (fullscreenMode) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [fullscreenMode]);

  useEffect(() => {
    const handler = () => { if (!document.fullscreenElement) setFullscreenMode(false); };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [setFullscreenMode]);

  return (
    <div className="zone-app">
      <ToolbarCompact />
      <MapEngine />
      <HeaderBar />
      {activePanel === 'layers' && <LayersPanel />}
      {appMode === 'admin' && activePanel === 'menu' && <MenuPanel />}
      <MarkerSheet />
      <AnomalyWarning />
      <DustParticles />
      <CrtNoise />
      <SaveIndicator />
      <MeasureHud />
      <ToastContainer />
      <KeyboardShortcuts />
    </div>
  );
}
