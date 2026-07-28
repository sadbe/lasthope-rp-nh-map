'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { ZoomRail, SiteFooter, MiniMap } from '@/components/MapChrome';
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
  const markers = useZoneMapStore(s => s.markers);
  const presetMarkers = useZoneMapStore(s => s.presetMarkers);
  const setActiveSheet = useZoneMapStore(s => s.setActiveSheet);
  const setSheetMode = useZoneMapStore(s => s.setSheetMode);
  const [open, setOpen] = useState(false);

  // Раньше поиск только гасил лишние метки на карте — то есть работал, если
  // ты уже смотришь в нужное место. Список результатов превращает его в
  // навигацию: видно, что нашлось, и можно прыгнуть на точку.
  const hits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Marker[] = [];
    for (const m of [...markers, ...presetMarkers]) {
      if (m.name.toLowerCase().includes(q)) out.push(m);
      if (out.length >= 10) break;
    }
    return out;
  }, [searchQuery, markers, presetMarkers]);

  const flyTo = useCallback((m: Marker) => {
    const st = useZoneMapStore.getState();
    const scale = Math.max(st.view.scale, 2.5);
    st.setView({
      tx: window.innerWidth / 2 - (m.xPct / 100) * STAGE_SIZE * scale,
      ty: window.innerHeight / 2 - (m.yPct / 100) * STAGE_SIZE * scale,
      scale,
    });
    setActiveSheet(m.id);
    setSheetMode('view');
    setOpen(false);
  }, [setActiveSheet, setSheetMode]);

  return (
    <div className="search-box">
      <input
        className="s-input search-wide"
        placeholder="ПОИСК ЛОКАЦИИ..."
        value={searchQuery}
        onChange={e => { setSearchQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        // Закрываем не сразу: иначе blur успевает снять список раньше, чем
        // по нему проходит клик.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (e.key === 'Enter' && hits[0]) flyTo(hits[0]);
          if (e.key === 'Escape') { setSearchQuery(''); setOpen(false); }
        }}
      />
      {searchQuery && (
        <button className="search-clear" onMouseDown={e => e.preventDefault()}
          onClick={() => setSearchQuery('')} title="Очистить">✕</button>
      )}
      {open && hits.length > 0 && (
        <div className="search-drop stalker-scroll">
          {hits.map(m => (
            <div key={m.id} className="search-hit" onMouseDown={e => e.preventDefault()}
              onClick={() => flyTo(m)}>
              <span className="search-hit-name">{m.name}</span>
              <span className="search-hit-coords">
                {m.x !== undefined && m.z !== undefined ? `X ${m.x} Z ${m.z}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
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

// ===== ГРУППЫ СЛОЁВ =====
// 42 тумблера подряд не читаются: чтобы выключить всех зомби, приходилось
// щёлкать девять раз, разыскивая их взглядом среди животных и лута.
// Раскладываем по смыслу. Порядок важен: «ЗОМБИ: ПОЛИЦИЯ» должно попасть в
// зомби, а не в транспорт, поэтому зомби проверяются первыми.
type LayerGroup = { id: string; name: string; cats: Category[] };

const LAYER_GROUP_DEFS: { id: string; name: string; re: RegExp }[] = [
  { id: 'zombie',  name: 'ЗОМБИ',          re: /зомби|мутант/i },
  { id: 'animals', name: 'ЖИВОТНЫЕ',       re: /медвед|волк|кабан|олен|косул|коров|овц|коз|свинь|кур|зай|живот|рыб/i },
  { id: 'vehicle', name: 'ТРАНСПОРТ',      re: /легков|грузов|машин|транспорт|вертол|авто|техник/i },
  { id: 'loot',    name: 'ВАНИЛЬНЫЙ ЛУТ',  re: /офис|промзон|охот|ферм|побереж|город|деревн|лут|медиц|воен|полиц|склад|школ|больниц|заправ|дом/i },
  { id: 'zones',   name: 'ЗОНЫ И ТОЧКИ',   re: /зон|спавн|подземель|костр|доск|ёлк|елк|аномал|базa|база|лагер/i },
];

function layerGroupOf(cat: Category, isPreset: boolean): string {
  // Всё, что не пришло из файлов миссии, — свои слои: их ставили руками и
  // ищут отдельно от вываленных из mapgroupproto тысяч точек.
  if (!isPreset) return 'mine';
  for (const g of LAYER_GROUP_DEFS) if (g.re.test(cat.name)) return g.id;
  return 'other';
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
  const presetVisible = useZoneMapStore(s => s.presetVisible);
  const setPresetVisible = useZoneMapStore(s => s.setPresetVisible);
  const markerScale = useZoneMapStore(s => s.markerScale);
  const setMarkerScale = useZoneMapStore(s => s.setMarkerScale);
  const presetCategories = useZoneMapStore(s => s.presetCategories);
  const allCats = useMemo(() => {
    const seen = new Set<string>();
    const out: Category[] = [];
    for (const c of [...BUILTIN_CATEGORIES, ...presetCategories, ...customCategories]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
    return out;
  }, [presetCategories, customCategories]);
  const presetIds = useMemo(() => new Set(presetCategories.map(c => c.id)), [presetCategories]);
  const setActiveLayersDirect = useZoneMapStore(s => s.setActiveLayersDirect);
  // Свои слои открыты, остальные свёрнуты: панель должна помещаться на
  // экран целиком, иначе группировка ничего не даёт.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(
    () => ({ zombie: true, animals: true, vehicle: true, loot: true, zones: true, other: true })
  );
  const toggleGroup = useCallback(
    (id: string) => setCollapsedGroups(prev => ({ ...prev, [id]: !prev[id] })), []);
  const presetMarkers = useZoneMapStore(s => s.presetMarkers);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of presetMarkers) c[m.cat] = (c[m.cat] || 0) + 1;
    for (const m of markers) c[m.cat] = (c[m.cat] || 0) + 1;
    return c;
  }, [presetMarkers, markers]);

  const layerGroups = useMemo(() => {
    const order = ['mine', ...LAYER_GROUP_DEFS.map(g => g.id), 'other'];
    const names: Record<string, string> = { mine: 'СВОИ СЛОИ', other: 'ПРОЧЕЕ' };
    for (const g of LAYER_GROUP_DEFS) names[g.id] = g.name;
    const bucket: Record<string, Category[]> = {};
    for (const c of allCats) {
      const gid = layerGroupOf(c, presetIds.has(c.id));
      (bucket[gid] = bucket[gid] || []).push(c);
    }
    return order
      .filter(id => bucket[id] && bucket[id].length > 0)
      .map(id => ({ id, name: names[id], cats: bucket[id] } as LayerGroup));
  }, [allCats, presetIds]);

  // Один клик вместо девяти: гасим или зажигаем всю группу разом.
  const setGroupActive = useCallback((g: LayerGroup, next: boolean) => {
    const patch: Record<string, boolean> = { ...activeLayers };
    for (const c of g.cats) patch[c.id] = next;
    setActiveLayersDirect(patch);
  }, [activeLayers, setActiveLayersDirect]);

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
        <div className="panel-title" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
          СЛОИ ▾
        </div>
      </div>
      <div className="stalker-scroll map-panel-body">
        <div className="layer-tools">
          {/* Главный тумблер панели: гасит всё, что вытащено из файлов
              миссии, оставляя только расставленное руками. Оформлен
              кнопкой, а не строкой списка — иначе его не замечают. */}
          <button className={`preset-switch ${presetVisible ? 'on' : 'off'}`}
            onClick={() => setPresetVisible(!presetVisible)}>
            <span className="preset-switch-label">МЕТКИ ИЗ МИССИИ</span>
            <span className="preset-switch-state">{presetVisible ? 'ВКЛ' : 'ВЫКЛ'}</span>
          </button>
          <div className="layer-tool-row" style={{ cursor: 'default' }}>
            <span style={{ flex: 1 }}>РАЗМЕР ×{markerScale.toFixed(1)}</span>
          </div>
          <input type="range" min={0.5} max={3} step={0.1} value={markerScale}
            onChange={e => setMarkerScale(Number(e.target.value))}
            className="layer-size-range" />
        </div>
        {layerGroups.map(g => {
          const open = !collapsedGroups[g.id];
          const on = g.cats.filter(c => activeLayers[c.id] ?? true).length;
          return (
          <div key={g.id} className="layer-group">
            <div className="layer-group-head" onClick={() => toggleGroup(g.id)}>
              <span className="layer-group-caret">{open ? '▾' : '▸'}</span>
              <span className="layer-group-name">{g.name}</span>
              <span className="layer-group-count">{on}/{g.cats.length}</span>
              <span className="layer-group-all"
                onClick={e => { e.stopPropagation(); setGroupActive(g, on < g.cats.length); }}
                title="Включить или выключить всю группу">
                {on === 0 ? '○' : on === g.cats.length ? '●' : '◐'}
              </span>
            </div>
            {open && g.cats.map(cat => {
          const active = activeLayers[cat.id] ?? true;
          const iconColor = active ? cat.color : INACTIVE_ICON_COLOR;
          const isBuiltin = BUILTIN_CATEGORIES.some(b => b.id === cat.id);
          return (
            <div key={cat.id} className="layer-row" onClick={() => toggleLayer(cat.id)}>
              <div className="layer-dot" style={{
                border: `1px solid ${active ? cat.color : '#333'}`,
                background: active ? cat.color : '#181818',
                opacity: active ? 0.7 : 0.3,
              }} />
              <span dangerouslySetInnerHTML={{ __html: iconSvg(cat.icon, iconColor) }} />
              <span className="layer-name" style={{ color: active ? 'var(--text-pale)' : 'var(--text-dim)' }}>
                {cat.name}
              </span>
              {/* Сколько меток в слое: без этого невозможно понять, почему
                  один тумблер меняет всё, а другой ничего. */}
              <span className="layer-count">{counts[cat.id] || 0}</span>
              {appMode === 'admin' && !isBuiltin && !presetIds.has(cat.id) && (
                <span onClick={(e) => handleDeleteLayer(e, cat.id, cat.name)}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', padding: '2px 4px' }}>
                  ✕
                </span>
              )}
            </div>
          );
            })}
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
        {/* Кнопка «ЗАГРУЗИТЬ КАРТУ» убрана: карта фиксированная, серверная. */}
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
  // Категории из spawns.json живут отдельным полем стора: сервер
  // перезаписывает customCategories целиком и раньше стирал их.
  const presetCategories = useZoneMapStore(s => s.presetCategories);
  const catIdx = useMemo(
    () => buildCatIndex([...presetCategories, ...customCategories]),
    [presetCategories, customCategories]
  );

  if (!activeSheet || !sheetMode) return null;
  if (sheetMode === 'newLayer') return <NewLayerSheet />;
  const all = allMarkers(presetMarkers, markers);
  const marker = all.find(m => m.id === activeSheet);
  if (!marker) return null;
  const cat = catIdx[marker.cat] || BUILTIN_CATEGORIES[BUILTIN_CATEGORIES.length - 1];
  if (sheetMode === 'edit') return <EditMarkerSheet key={marker.id} marker={marker} cat={cat} />;
  return <ViewMarkerSheet marker={marker} cat={cat} />;
}

// ===== MARKER LAYER =====
// Метки живут в координатах СЦЕНЫ и не зависят ни от сдвига, ни от масштаба:
// и то и другое делает transform родителя. Поэтому React перерисовывает
// список только когда реально сменился набор видимых меток, а не на каждый
// кадр панорамы или щипка. Иконки не должны расти вместе с картой, поэтому
// каждая метка гасит масштаб родителя через переменную --inv.
const MarkersLayer = React.memo(function MarkersLayer(
  { markers, catIdx, worldM }: { markers: Marker[]; catIdx: Record<string, Category>; worldM: number }
) {
  return (
    <>
      {markers.map(m => {
        const cat = catIdx[m.cat] || BUILTIN_CATEGORIES[BUILTIN_CATEGORIES.length - 1];
        const mx = (m.xPct / 100) * STAGE_SIZE;
        const my = (m.yPct / 100) * STAGE_SIZE;
        const isCluster = m.id.startsWith('cluster_');
        // 24 px за десяток меток, потолок 44 — иначе пузырь на пол-экрана.
        const clusterSize = isCluster
          ? Math.min(44, 22 + Math.round(Math.log10(Math.max(10, Number(m.name) || 10)) * 9))
          : 0;
        // Радиус задан в метрах мира, а рисуем в координатах сцены — круг
        // обязан жить в масштабе карты, иначе зона в 300 м на разных зумах
        // накрывала бы разные куски местности.
        const rStage = m.radiusM ? (m.radiusM / worldM) * STAGE_SIZE : 0;
        return (
          <React.Fragment key={m.id}>
          {rStage > 0 && (
            <div className="zone-ring" style={{
              position: 'absolute', left: mx - rStage, top: my - rStage,
              width: rStage * 2, height: rStage * 2, borderRadius: '50%',
              border: `calc(1px * var(--hair, 1)) solid ${cat.color}`,
              background: `${cat.color}14`, pointerEvents: 'none',
            }} />
          )}
          <div className="marker-glow marker-hover-wrap" style={{
            position: 'absolute', left: mx, top: my,
            transform: 'translate(-50%, -50%) scale(var(--inv, 1))',
            '--glow-color': cat.color,
          } as React.CSSProperties}>
            {isCluster ? (
              // Размер по количеству, заливка плотная, цифра тёмная:
              // прозрачный кружок с тонкой рамкой на пёстрой карте
              // не читался вообще.
              <div style={{
                width: clusterSize, height: clusterSize, borderRadius: clusterSize,
                background: cat.color, border: '1px solid rgba(0,0,0,0.65)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontWeight: 700,
                fontSize: clusterSize <= 26 ? 10 : 11, color: '#0d0f0d',
              }}>
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
                  <div className="tip-coords">
                    {m.x !== undefined && m.z !== undefined
                      ? `X ${m.x} · Z ${m.z}`
                      : `${m.xPct.toFixed(1)}% · ${m.yPct.toFixed(1)}%`}
                    {m.radiusM ? ` · r ${m.radiusM} м` : ''}
                  </div>
                </div>
              </>
            )}
          </div>
          </React.Fragment>
        );
      })}
    </>
  );
});

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
  const mapWorldSizeM = useZoneMapStore(s => s.mapWorldSizeM);
  const activeLayers = useZoneMapStore(s => s.activeLayers);
  const addMarker = useZoneMapStore(s => s.addMarker);
  const addMeasurePoint = useZoneMapStore(s => s.addMeasurePoint);
  const setActiveSheet = useZoneMapStore(s => s.setActiveSheet);
  const setSheetMode = useZoneMapStore(s => s.setSheetMode);
  const setMapImageUrl = useZoneMapStore(s => s.setMapImageUrl);
  const setMapImageSize = useZoneMapStore(s => s.setMapImageSize);
  const markers = useZoneMapStore(s => s.markers);
  const presetMarkers = useZoneMapStore(s => s.presetMarkers);
  const presetVisible = useZoneMapStore(s => s.presetVisible);
  const markerScale = useZoneMapStore(s => s.markerScale);
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
  // То же самое для одиночных меток: хит-тест обязан видеть ровно то, что
  // нарисовано, а список считается ниже по файлу.
  const hitRef = useRef<Marker[]>([]);

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
        // Проверяли по ПОЛНОМУ набору точек, не глядя на тумблер миссии,
        // выключенные слои и поиск. Поэтому клик по пустой карте открывал
        // карточку метки, которой на экране нет. Плюс find брал первую
        // попавшуюся в квадрате — теперь берём ближайшую.
        let best: Marker | null = null;
        let bestD = 14 * 14;
        for (const m of hitRef.current) {
          const mx = (m.xPct / 100) * STAGE_SIZE * view.scale + view.tx;
          const my = (m.yPct / 100) * STAGE_SIZE * view.scale + view.ty;
          const d = (clickX - mx) * (clickX - mx) + (clickY - my) * (clickY - my);
          if (d < bestD) { bestD = d; best = m; }
        }
        if (best) { setActiveSheet(best.id); setSheetMode('view'); }
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
  // Категории из spawns.json живут отдельным полем стора: сервер
  // перезаписывает customCategories целиком и раньше стирал их.
  const presetCategories = useZoneMapStore(s => s.presetCategories);
  const catIdx = useMemo(
    () => buildCatIndex([...presetCategories, ...customCategories]),
    [presetCategories, customCategories]
  );
  // Найденное в файлах миссии и поставленное руками — два независимых
  // набора. Тумблер гасит первый, второй виден всегда.
  const all = useMemo(
    () => (presetVisible ? allMarkers(presetMarkers, markers) : markers),
    [presetMarkers, markers, presetVisible]
  );

  const filteredMarkers = useMemo(() => {
    let result = all.filter(m => activeLayers[m.cat] ?? true);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => m.name.toLowerCase().includes(q) || m.cat.toLowerCase().includes(q));
    }
    return result;
  }, [all, activeLayers, searchQuery]);

  // Зум меняет scale непрерывно, и на каждом кадре щипка заново считались
  // кластеры (проход по тысячам точек) и список видимого. Квантуем масштаб
  // по ступеням ×1.1: пересчёт происходит несколько раз за жест, а не 60
  // раз в секунду. На глаз разницы нет — 10% по размеру ячейки кластера.
  const scaleStep = useMemo(
    () => Math.pow(1.1, Math.round(Math.log(view.scale) / Math.log(1.1))),
    [view.scale]
  );

  // Clustering
  const clustered = useMemo(() => {
    if (viewportSize.w === 0) return filteredMarkers;
    const clusters: Record<string, Marker[]> = {};
    const singles: Marker[] = [];
    // Ячейка в координатах СЦЕНЫ: CLUSTER_THRESHOLD пикселей экрана,
    // пересчитанные обратно в сцену. Раньше квантовалась экранная позиция,
    // то есть результат зависел от tx/ty — а они в зависимостях useMemo не
    // стояли, и при панораме группировка «залипала» в старом положении.
    const cell = CLUSTER_THRESHOLD / scaleStep;
    for (const m of filteredMarkers) {
      // Зоны с радиусом не схлопываем: пузырёк «12» вместо круга в 300 м —
      // это потеря смысла, а не экономия.
      if (m.radiusM) { singles.push(m); continue; }
      const sx = (m.xPct / 100) * STAGE_SIZE;
      const sy = (m.yPct / 100) * STAGE_SIZE;
      const cx = Math.round(sx / cell);
      const cy = Math.round(sy / cell);
      const key = `${cx}_${cy}`;
      if (!clusters[key]) clusters[key] = [];
      clusters[key].push(m);
    }
    for (const key of Object.keys(clusters)) {
      const group = clusters[key];
      if (group.length <= 5) { singles.push(...group); continue; }
      // Цвет пузырька — по САМОЙ ЧАСТОЙ категории в группе. Раньше
      // брался cat первой попавшейся метки, поэтому кластеры красились
      // как повезёт и карта выглядела одинаково серой.
      const freq: Record<string, number> = {};
      for (const m of group) freq[m.cat] = (freq[m.cat] || 0) + 1;
      const domCat = Object.keys(freq).reduce((a, b) => (freq[b] > freq[a] ? b : a));
      singles.push({
        id: `cluster_${key}`,
        name: `${group.length}`,
        cat: domCat,
        xPct: group.reduce((s, m) => s + m.xPct, 0) / group.length,
        yPct: group.reduce((s, m) => s + m.yPct, 0) / group.length,
        preset: false,
      });
    }
    return singles;
  }, [filteredMarkers, viewportSize, scaleStep]);

  // Обработчик клика объявлен выше по файлу, а clustered — здесь, поэтому
  // напрямую в замыкание его не взять (TDZ в массиве зависимостей). Ref
  // обновляется каждый рендер и читается только в момент клика.
  clusteredRef.current = clustered;
  hitRef.current = filteredMarkers;

  // Отсекаем всё, что за пределами экрана. В spawns.json почти 8000 точек,
  // и держать их все в DOM (каждая — div со свечением и карточкой) телефон
  // не тянет: тормозит и панорамирование, и зум. Рисуем только видимое плюс
  // небольшой запас по краям, чтобы при сдвиге не было пустых полей.
  // Куллинг квантован по сетке: пересчёт списка на каждый кадр заставлял
  // React перерисовывать все маркеры 60 раз в секунду.
  const CULL_STEP = 300;
  const qx = Math.round(view.tx / CULL_STEP) * CULL_STEP;
  const qy = Math.round(view.ty / CULL_STEP) * CULL_STEP;
  const visibleMarkers = useMemo(() => {
    if (viewportSize.w === 0) return clustered;
    // Запас с избытком: и на шаг квантования сдвига, и на то, что scaleStep
    // отличается от настоящего масштаба максимум на 10%. Иначе метки
    // «выщёлкивались» бы у краёв во время щипка.
    const pad = CULL_STEP + 200 + Math.max(viewportSize.w, viewportSize.h) * 0.1;
    const x0 = (-qx - pad) / scaleStep;
    const x1 = (viewportSize.w - qx + pad) / scaleStep;
    const y0 = (-qy - pad) / scaleStep;
    const y1 = (viewportSize.h - qy + pad) / scaleStep;
    return clustered.filter(m => {
      const sx = (m.xPct / 100) * STAGE_SIZE;
      const sy = (m.yPct / 100) * STAGE_SIZE;
      return sx > x0 && sx < x1 && sy > y0 && sy < y1;
    });
  }, [clustered, qx, qy, scaleStep, viewportSize]);

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
            return <line key={`vg${i}`} x1={sx} y1={0} x2={sx} y2={viewportSize.h} stroke="var(--pale)" strokeWidth="1" />;
          })}
          {Array.from({ length: 21 }, (_, i) => {
            const sy = (i * 5 / 100) * STAGE_SIZE * view.scale + view.ty;
            if (sy < 0 || sy > viewportSize.h) return null;
            return <line key={`hg${i}`} x1={0} y1={sy} x2={viewportSize.w} y2={sy} stroke="var(--pale)" strokeWidth="1" />;
          })}
        </svg>
      )}

      {/* Подписи сетки в километрах, прижаты к краям экрана, чтобы были
          видны при любом положении карты. Шаг сетки — 5% мира. */}
      {gridVisible && Array.from({ length: 21 }, (_, i) => {
        // Подписываем в игровых координатах, а не в километрах: игроки
        // называют позиции именно так, как их показывает игра. По
        // вертикали ось Z растёт снизу вверх — отсюда вычитание.
        const gridX = Math.round((i * 5 / 100) * mapWorldSizeM);
        const gridZ = Math.round(mapWorldSizeM - (i * 5 / 100) * mapWorldSizeM);
        const sx = (i * 5 / 100) * STAGE_SIZE * view.scale + view.tx;
        const sy = (i * 5 / 100) * STAGE_SIZE * view.scale + view.ty;
        return (
          <span key={`gl${i}`}>
            {sx > 14 && sx < viewportSize.w && (
              <span className="grid-label" style={{ left: sx + 3, top: 2 }}>{gridX}</span>
            )}
            {sy > 14 && sy < viewportSize.h && (
              <span className="grid-label" style={{ left: 3, top: sy + 2 }}>{gridZ}</span>
            )}
          </span>
        );
      })}

      {/* Весь слой меток едет и масштабируется ОДНОЙ строкой transform.
          Раньше при зуме у каждой метки пересчитывались left/top, то есть
          браузер заново раскладывал сотни элементов на каждый кадр щипка —
          отсюда рывки. Теперь меняется только этот transform, а --inv
          гасит масштаб внутри меток, чтобы иконки не разбухали. */}
      <div style={{
        position: 'absolute', left: 0, top: 0, width: 0, height: 0,
        transform: `translate3d(${view.tx}px, ${view.ty}px, 0) scale(${view.scale})`,
        transformOrigin: '0 0',
        willChange: 'transform',
        zIndex: 10,
        // --inv гасит масштаб карты внутри меток и заодно множит на
        // выбранный пользователем размер; --hair держит рамки зон толщиной
        // ровно в один экранный пиксель на любом зуме.
        '--inv': markerScale / view.scale,
        '--hair': 1 / view.scale,
      } as React.CSSProperties}>
        <MarkersLayer markers={visibleMarkers} catIdx={catIdx} worldM={mapWorldSizeM} />
      </div>

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

      {/* Плашка «ЗОНА НЕ ЗАГРУЖЕНА» убрана: карта грузится с сервера сама,
          и просить пользователя её загрузить бессмысленно. */}
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
  const headerRef = useRef<HTMLDivElement>(null);
  // Панели позиционируются от нижнего края шапки, а она меняет высоту при
  // переносе строк. Пишем реальную высоту в CSS-переменную вместо того,
  // чтобы угадывать константу.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="header-bar" ref={headerRef}>
      <div className="header-row">
        <div className="header-left">
          <DeadInsideTitle text="LAST HOPE" />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', letterSpacing: '0.1em', marginTop: 0 }}>
            <DeadSubtitle text="STALKER RP · DAYZ" />
          </div>
        </div>
        <div className="header-center header-center-inline">
          <SearchBar />
          <MobileSearchBar />
        </div>
        <div className="header-right">
          <ToolbarWide />
          {appMode === 'viewer' && (
            <a href="/admin" className="admin-link" style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)',
              letterSpacing: '0.1em', textDecoration: 'none', padding: '6px 9px',
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
      <ZoomRail />
      <MiniMap />
      <SiteFooter />
    </div>
  );
}

// ===== ВОССТАНОВЛЕНИЕ НАСТРОЕК UI =====
// Читаем localStorage только после монтирования: на сервере его нет, а
// чтение прямо в сторе ломало бы гидрацию несовпадением разметки.
function UiPrefsLoader() {
  const restoreUiPrefs = useZoneMapStore(s => s.restoreUiPrefs);
  useEffect(() => { restoreUiPrefs(); }, [restoreUiPrefs]);
  return null;
}

// ===== КООРДИНАТЫ ПОД КУРСОРОМ =====
// Пишем прямо в DOM, минуя состояние React: курсор шлёт до 120 событий в
// секунду, и перерисовывать на каждое дерево с тысячами меток нельзя.
function CoordHud() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const frozenRef = useRef(false);
  const lastRef = useRef({ x: 0, z: 0 });
  const activePanel = useZoneMapStore(s => s.activePanel);

  useEffect(() => { frozenRef.current = frozen; }, [frozen]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // Зафиксированные координаты не перетираем: смысл фиксации в том,
      // чтобы увести курсор и всё равно видеть точку.
      if (frozenRef.current) return;
      const st = useZoneMapStore.getState();
      const { tx, ty, scale } = st.view;
      const w = st.mapWorldSizeM;
      const x = Math.round(((e.clientX - tx) / (STAGE_SIZE * scale)) * w);
      const z = Math.round(w - ((e.clientY - ty) / (STAGE_SIZE * scale)) * w);
      lastRef.current = { x, z };
      const el = boxRef.current;
      if (el) el.textContent = `X ${x}  Z ${z}`;
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const copy = useCallback(() => {
    const { x, z } = lastRef.current;
    const text = `${x} ${z}`;
    setFrozen(f => !f);
    // Было `navigator.clipboard?.writeText(...).then(...)`: если буфера в
    // браузере нет, выражение возвращает undefined, .then падает — и клик
    // не делал вообще ничего. Отсюда «фиксация по клику не работает».
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1200); };
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { /* буфер недоступен — фиксация всё равно сработала */ }
      done();
    };
    const cb = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (cb && typeof cb.writeText === 'function') {
      cb.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
  }, []);

  return (
    // Табло висело поверх открытой панели слоёв (z-index 246 против 100) и
    // накрывало её нижние строки — отодвигаем на ширину панели.
    <div className={`coord-hud${activePanel === 'layers' ? ' coord-hud-shift' : ''}${frozen ? ' frozen' : ''}`}
      onClick={copy} title="Клик — зафиксировать и скопировать координаты">
      <span ref={boxRef}>X —  Z —</span>
      <span className="coord-hud-hint">
        {copied ? 'СКОПИРОВАНО' : frozen ? 'ЗАФИКСИРОВАНО · КЛИК = СНЯТЬ' : 'КЛИК = ФИКС + КОПИЯ'}
      </span>
    </div>
  );
}

// ===== ССЫЛКА НА ТОЧКУ =====
// Позиция и зум живут в адресе страницы, поэтому карту можно кинуть ссылкой
// «смотри сюда». Пишем в hash с задержкой, чтобы не дёргать историю на
// каждом кадре панорамы.
function ViewPermalink() {
  useEffect(() => {
    const m = /x=(-?\d+(?:\.\d+)?)&z=(-?\d+(?:\.\d+)?)&s=(\d+(?:\.\d+)?)/.exec(window.location.hash);
    // Карта после загрузки картинки сама вписывается в экран (fitToViewport
    // через 150 мс), поэтому позицию из ссылки ставим ПОСЛЕ этого — иначе её
    // тут же затрёт вписыванием.
    const restore = setTimeout(() => {
      if (!m) return;
      const st = useZoneMapStore.getState();
      const w = st.mapWorldSizeM;
      const scale = Number(m[3]);
      const stageX = (Number(m[1]) / w) * STAGE_SIZE;
      const stageY = ((w - Number(m[2])) / w) * STAGE_SIZE;
      st.setView({
        tx: window.innerWidth / 2 - stageX * scale,
        ty: window.innerHeight / 2 - stageY * scale,
        scale,
      });
    }, 600);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useZoneMapStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const s2 = useZoneMapStore.getState();
        const { tx, ty, scale } = s2.view;
        const w = s2.mapWorldSizeM;
        const cx = Math.round((((window.innerWidth / 2) - tx) / (STAGE_SIZE * scale)) * w);
        const cz = Math.round(w - (((window.innerHeight / 2) - ty) / (STAGE_SIZE * scale)) * w);
        const hash = `#x=${cx}&z=${cz}&s=${scale.toFixed(4)}`;
        if (window.location.hash !== hash) {
          window.history.replaceState(null, '', hash);
        }
      }, 500);
    });
    return () => { clearTimeout(restore); if (timer) clearTimeout(timer); unsub(); };
  }, []);
  return null;
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
      <UiPrefsLoader />
      <CoordHud />
      <ViewPermalink />
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
