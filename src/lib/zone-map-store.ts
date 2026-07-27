import { create } from 'zustand';

// ===== TYPES =====

export interface ToastMessage {
  id: string;
  text: string;
  kind: 'error' | 'warning' | 'info' | 'success';
  createdAt: number;
}

export interface Marker {
  id: string;
  name: string;
  cat: string;
  xPct: number;
  yPct: number;
  note?: string;
  imageUrl?: string;
  preset?: boolean;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  builtin: boolean;
}

export interface ViewState {
  tx: number;
  ty: number;
  scale: number;
}

export interface MeasurePoint {
  xPct: number;
  yPct: number;
}

export interface MeasureState {
  active: boolean;
  points: MeasurePoint[];
  totalDistanceM: number;
  segmentDistancesM: number[];
}

export interface ZoneMapState {
  // Markers
  markers: Marker[];
  presetMarkers: Marker[];
  customCategories: Category[];

  // View
  view: ViewState;
  addMode: boolean;
  measureModeOn: boolean;
  measureState: MeasureState;
  gridVisible: boolean;
  fullscreenMode: boolean;

  // UI panels
  activePanel: 'none' | 'layers' | 'menu' | 'search';
  activeSheet: string | null;
  sheetMode: 'view' | 'edit' | 'new' | 'newLayer' | null;

  // Map image
  mapImageUrl: string | null;
  mapImageWidth: number;
  mapImageHeight: number;
  satelliteSrc: string | null;
  topoSrc: string | null;
  showingTopo: boolean;
  // Real-world size of the map in meters, for distance/ruler math — NOT the
  // same as mapImageWidth/Height (image pixels). Those only happen to match
  // meters if someone exported the satellite texture at exactly 1px=1m,
  // which most DayZ maps are NOT (a 15360x15360m world is commonly shipped
  // as a much smaller texture, e.g. 4096x4096). Using pixel size as a stand-
  // in for meters was the bug here — the ruler would silently report the
  // wrong distance by whatever that scale factor is.
  mapWorldSizeM: number;

  // Layers
  activeLayers: Record<string, boolean>;

  // Effects
  geigerValue: number;
  anomalyWarning: string | null;
  showSaveIndicator: boolean;

  // Search
  searchQuery: string;

  // Theme
  themeMode: 'dark' | 'light';

  // App mode — 'viewer' for public landing, 'admin' for management panel
  appMode: 'viewer' | 'admin';

  // Toasts — replaces silent .catch() blocks throughout the store.
  // The UI renders these as ephemeral notifications in the corner.
  toasts: ToastMessage[];

  // Actions
  setMarkers: (markers: Marker[]) => void;
  addMarker: (marker: Marker) => void;
  updateMarker: (id: string, updates: Partial<Marker>) => void;
  removeMarker: (id: string) => void;
  setCustomCategories: (cats: Category[]) => void;
  addCustomCategory: (cat: Category) => void;
  removeCustomCategory: (id: string) => void;
  clearAllMarkers: () => void;
  loadFromServer: () => Promise<void>;
  loadPresetMarkers: () => Promise<void>;
  setView: (view: ViewState) => void;
  setAddMode: (mode: boolean) => void;
  setMeasureModeOn: (on: boolean) => void;
  setMeasureState: (state: MeasureState) => void;
  addMeasurePoint: (point: MeasurePoint) => void;
  removeLastMeasurePoint: () => void;
  setGridVisible: (visible: boolean) => void;
  setFullscreenMode: (mode: boolean) => void;
  setActivePanel: (panel: 'none' | 'layers' | 'menu' | 'search') => void;
  setActiveSheet: (id: string | null) => void;
  setSheetMode: (mode: 'view' | 'edit' | 'new' | 'newLayer' | null) => void;
  setMapImageUrl: (url: string | null) => void;
  setMapImageSize: (w: number, h: number) => void;
  setShowingTopo: (showing: boolean) => void;
  setMapWorldSizeM: (m: number) => void;
  loadMapAssets: () => Promise<void>;
  toggleLayer: (catId: string) => void;
  setGeigerValue: (value: number) => void;
  setAnomalyWarning: (warning: string | null) => void;
  setShowSaveIndicator: (show: boolean) => void;
  setSearchQuery: (query: string) => void;
  setActiveLayersDirect: (layers: Record<string, boolean>) => void;
  setThemeMode: (mode: 'dark' | 'light') => void;
  setAppMode: (mode: 'viewer' | 'admin') => void;
  resetUI: () => void;

  // Toast actions
  pushToast: (text: string, kind?: ToastMessage['kind']) => void;
  dismissToast: (id: string) => void;
}

// ===== BUILTIN CATEGORIES — STALKER RP DAYZ =====
export const BUILTIN_CATEGORIES: Category[] = [
  { id: 'anomaly',     name: 'Аномалия',          color: '#9DBF3F', icon: 'anomaly',   builtin: true },
  { id: 'anomaly_field', name: 'Аном. поле',      color: '#6a8028', icon: 'anomaly_field', builtin: true },
  { id: 'artifact',    name: 'Артефакт',          color: '#D4A017', icon: 'star',      builtin: true },
  { id: 'radiation',   name: 'Радиация',          color: '#C1352B', icon: 'radiation',   builtin: true },
  { id: 'faction',     name: 'Группировка',       color: '#4B5A34', icon: 'faction',     builtin: true },
  { id: 'poi',         name: 'Локация',           color: '#B08245', icon: 'poi',         builtin: true },
  { id: 'trader',      name: 'Трейдер',           color: '#D9A441', icon: 'trader',      builtin: true },
  { id: 'safe_zone',   name: 'Безопасная зона',   color: '#3FA7A0', icon: 'safe_zone',   builtin: true },
  { id: 'kos_zone',    name: 'KOS зона',          color: '#8B0000', icon: 'skull',       builtin: true },
  { id: 'mission',     name: 'Квест',             color: '#8E5CC2', icon: 'mission',     builtin: true },
  { id: 'stash',       name: 'Тайник',            color: '#7A8C3F', icon: 'stash',       builtin: true },
  { id: 'mutant',      name: 'Мутант',            color: '#6B3A2C', icon: 'mutant',      builtin: true },
  { id: 'emission',    name: 'Укрытие выброс',    color: '#4A6B8A', icon: 'emission',    builtin: true },
  { id: 'airdrop',     name: 'Аирдроп',           color: '#D97A2E', icon: 'airdrop',     builtin: true },
  { id: 'flag_point',  name: 'Точка захвата',     color: '#5A4A8C', icon: 'flag_point',  builtin: true },
  { id: 'lab',         name: 'X-Лаборатория',     color: '#3E6FB5', icon: 'lab',         builtin: true },
  { id: 'checkpoint',  name: 'Блокпост',          color: '#5c6b3c', icon: 'checkpoint',  builtin: true },
  { id: 'spawn',       name: 'Спавн',             color: '#C77B9A', icon: 'spawn',       builtin: true },
  { id: 'custom',      name: 'Заметка',           color: '#6E7378', icon: 'note',        builtin: true },
];

// ===== ICON SVG DEFINITIONS =====
export const ICON_ORDER = [
  'camp','anomaly','anomaly_field','loot','danger','radiation','vehicle','base','faction',
  'poi','trader','med','water','craft','star','house','safe_zone','person','spawn',
  'radio','weapon','skeleton','skull','mutant','fire','arrow','airdrop','flag','flag_point',
  'mission','stash','emission','lab','checkpoint','note'
];

export function iconSvg(id: string, color: string): string {
  const fill = color || '#9dbf3f';
  const icons: Record<string, string> = {
    // === CORE MAP MARKERS ===
    camp:     `<svg viewBox="0 0 24 24" width="16" height="16"><polygon points="12,3 21,20 3,20" fill="none" stroke="${fill}" stroke-width="2"/><line x1="12" y1="20" x2="12" y2="12" stroke="${fill}" stroke-width="1.5"/></svg>`,
    anomaly:  `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="8" fill="none" stroke="${fill}" stroke-width="1.5"/><circle cx="12" cy="12" r="4" fill="${fill}" opacity="0.3"/><circle cx="12" cy="12" r="2" fill="${fill}"/></svg>`,
    anomaly_field: `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" fill="none" stroke="${fill}" stroke-width="1" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="7" fill="none" stroke="${fill}" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="${fill}" opacity="0.4"/><line x1="8" y1="8" x2="16" y2="16" stroke="${fill}" stroke-width="0.8" opacity="0.5"/><line x1="16" y1="8" x2="8" y2="16" stroke="${fill}" stroke-width="0.8" opacity="0.5"/></svg>`,
    loot:     `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="4" y="8" width="16" height="12" rx="1" fill="none" stroke="${fill}" stroke-width="1.5"/><rect x="6" y="4" width="12" height="6" rx="1" fill="none" stroke="${fill}" stroke-width="1.5"/><circle cx="12" cy="15" r="2" fill="${fill}"/></svg>`,
    danger:   `<svg viewBox="0 0 24 24" width="16" height="16"><polygon points="12,2 22,22 2,22" fill="none" stroke="${fill}" stroke-width="2"/><line x1="12" y1="10" x2="12" y2="16" stroke="${fill}" stroke-width="2"/><circle cx="12" cy="19" r="1" fill="${fill}"/></svg>`,
    radiation: `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="3" fill="${fill}" opacity="0.6"/><path d="M12,3 L14,9 A6,6 0 0,1 12,12 Z" fill="${fill}" opacity="0.4"/><path d="M3,12 L9,14 A6,6 0 0,1 12,12 Z" fill="${fill}" opacity="0.4"/><path d="M21,12 L14,9 A6,6 0 0,1 12,12 Z" fill="${fill}" opacity="0.4"/><circle cx="12" cy="12" r="6" fill="none" stroke="${fill}" stroke-width="1" opacity="0.6"/></svg>`,
    vehicle:  `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="2" y="8" width="20" height="10" rx="2" fill="none" stroke="${fill}" stroke-width="1.5"/><polygon points="6,8 8,3 16,3 18,8" fill="none" stroke="${fill}" stroke-width="1.5"/><circle cx="7" cy="18" r="2" fill="${fill}"/><circle cx="17" cy="18" r="2" fill="${fill}"/></svg>`,
    base:     `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="10" width="18" height="10" rx="1" fill="none" stroke="${fill}" stroke-width="1.5"/><rect x="5" y="5" width="14" height="7" fill="none" stroke="${fill}" stroke-width="1.5"/><line x1="12" y1="5" x2="12" y2="2" stroke="${fill}" stroke-width="1.5"/></svg>`,
    faction:  `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12,3 L4,8 L4,16 L12,22 L20,16 L20,8 Z" fill="none" stroke="${fill}" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="${fill}" opacity="0.4"/><line x1="4" y1="8" x2="20" y2="8" stroke="${fill}" stroke-width="0.8" opacity="0.5"/><line x1="12" y1="3" x2="12" y2="22" stroke="${fill}" stroke-width="0.8" opacity="0.5"/></svg>`,
    poi:      `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12,2 C8,2 5,5 5,9 C5,14 12,22 12,22 C12,22 19,14 19,9 C19,5 16,2 12,2" fill="none" stroke="${fill}" stroke-width="1.5"/><circle cx="12" cy="9" r="3" fill="none" stroke="${fill}" stroke-width="1"/></svg>`,
    trader:   `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="6" width="18" height="14" rx="1" fill="none" stroke="${fill}" stroke-width="1.5"/><line x1="3" y1="11" x2="21" y2="11" stroke="${fill}" stroke-width="1"/><line x1="12" y1="6" x2="12" y2="11" stroke="${fill}" stroke-width="1"/><circle cx="7" cy="16" r="1.5" fill="${fill}"/><circle cx="17" cy="16" r="1.5" fill="${fill}"/><path d="M9,13 L11,16 L13,13" fill="none" stroke="${fill}" stroke-width="1"/></svg>`,
    med:      `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="4" y="4" width="16" height="16" rx="1" fill="none" stroke="${fill}" stroke-width="1.5"/><line x1="12" y1="6" x2="12" y2="18" stroke="${fill}" stroke-width="2"/><line x1="6" y1="12" x2="18" y2="12" stroke="${fill}" stroke-width="2"/></svg>`,
    water:    `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12,2 C12,2 4,12 4,16 C4,20 8,22 12,22 C16,22 20,20 20,16 C20,12 12,2 12,2" fill="none" stroke="${fill}" stroke-width="1.5"/></svg>`,
    craft:    `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="3" fill="${fill}"/><circle cx="12" cy="12" r="8" fill="none" stroke="${fill}" stroke-width="1.5" stroke-dasharray="4 2"/></svg>`,
    star:     `<svg viewBox="0 0 24 24" width="16" height="16"><polygon points="12,2 15,9 22,9 17,14 19,22 12,17 5,22 7,14 2,9 9,9" fill="${fill}"/></svg>`,
    house:    `<svg viewBox="0 0 24 24" width="16" height="16"><polygon points="12,3 22,12 20,12 20,22 4,22 4,12 2,12" fill="none" stroke="${fill}" stroke-width="1.5"/></svg>`,
    safe_zone: `<svg viewBox="0 0 24 24" width="16" height="16"><polygon points="12,3 22,12 20,12 20,22 4,22 4,12 2,12" fill="none" stroke="${fill}" stroke-width="1.5"/><rect x="9" y="13" width="6" height="6" fill="none" stroke="${fill}" stroke-width="1"/><line x1="9" y1="16" x2="15" y2="16" stroke="${fill}" stroke-width="1"/><line x1="12" y1="13" x2="12" y2="19" stroke="${fill}" stroke-width="1"/></svg>`,
    person:   `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="5" r="3" fill="${fill}"/><line x1="12" y1="8" x2="12" y2="18" stroke="${fill}" stroke-width="1.5"/><line x1="8" y1="12" x2="16" y2="12" stroke="${fill}" stroke-width="1.5"/><line x1="12" y1="18" x2="8" y2="22" stroke="${fill}" stroke-width="1.5"/><line x1="12" y1="18" x2="16" y2="22" stroke="${fill}" stroke-width="1.5"/></svg>`,
    spawn:    `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="5" r="3" fill="${fill}"/><line x1="12" y1="8" x2="12" y2="18" stroke="${fill}" stroke-width="1.5"/><line x1="8" y1="12" x2="16" y2="12" stroke="${fill}" stroke-width="1.5"/><line x1="12" y1="18" x2="8" y2="22" stroke="${fill}" stroke-width="1.5"/><line x1="12" y1="18" x2="16" y2="22" stroke="${fill}" stroke-width="1.5"/><path d="M6,4 L8,6" stroke="${fill}" stroke-width="1"/><path d="M18,4 L16,6" stroke="${fill}" stroke-width="1"/><circle cx="4" cy="4" r="1" fill="${fill}" opacity="0.4"/><circle cx="20" cy="4" r="1" fill="${fill}" opacity="0.4"/></svg>`,
    radio:    `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="4" y="12" width="16" height="8" rx="1" fill="none" stroke="${fill}" stroke-width="1.5"/><line x1="12" y1="12" x2="12" y2="4" stroke="${fill}" stroke-width="1.5"/><circle cx="12" cy="16" r="2" fill="${fill}"/></svg>`,
    weapon:   `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="4" y="10" width="12" height="4" rx="1" fill="none" stroke="${fill}" stroke-width="1.5"/><rect x="16" y="8" width="4" height="8" rx="1" fill="none" stroke="${fill}" stroke-width="1.5"/></svg>`,
    skeleton: `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="6" r="4" fill="none" stroke="${fill}" stroke-width="1.5"/><line x1="12" y1="10" x2="12" y2="22" stroke="${fill}" stroke-width="1.5"/><line x1="8" y1="14" x2="16" y2="14" stroke="${fill}" stroke-width="1.5"/><line x1="12" y1="22" x2="8" y2="24" stroke="${fill}" stroke-width="1"/><line x1="12" y1="22" x2="16" y2="24" stroke="${fill}" stroke-width="1"/></svg>`,
    skull:    `<svg viewBox="0 0 24 24" width="16" height="16"><ellipse cx="12" cy="9" rx="7" ry="8" fill="none" stroke="${fill}" stroke-width="1.5"/><circle cx="9" cy="7" r="2" fill="${fill}"/><circle cx="15" cy="7" r="2" fill="${fill}"/><path d="M10,13 L12,15 L14,13" fill="none" stroke="${fill}" stroke-width="1.5"/><line x1="8" y1="18" x2="8" y2="22" stroke="${fill}" stroke-width="1"/><line x1="12" y1="18" x2="12" y2="22" stroke="${fill}" stroke-width="1"/><line x1="16" y1="18" x2="16" y2="22" stroke="${fill}" stroke-width="1"/></svg>`,
    mutant:   `<svg viewBox="0 0 24 24" width="16" height="16"><ellipse cx="12" cy="8" rx="6" ry="5" fill="none" stroke="${fill}" stroke-width="1.5"/><circle cx="9" cy="7" r="1.5" fill="${fill}" opacity="0.7"/><circle cx="15" cy="7" r="1.5" fill="${fill}" opacity="0.7"/><path d="M10,10 Q12,13 14,10" fill="none" stroke="${fill}" stroke-width="1"/><line x1="6" y1="8" x2="3" y2="6" stroke="${fill}" stroke-width="1"/><line x1="18" y1="8" x2="21" y2="6" stroke="${fill}" stroke-width="1"/><line x1="12" y1="13" x2="12" y2="20" stroke="${fill}" stroke-width="1.5"/><path d="M12,20 L8,22" stroke="${fill}" stroke-width="1"/><path d="M12,20 L16,22" stroke="${fill}" stroke-width="1"/></svg>`,
    fire:     `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12,22 C8,22 4,18 4,14 C4,8 12,2 12,2 C12,2 20,8 20,14 C20,18 16,22 12,22" fill="${fill}" opacity="0.5"/><path d="M12,22 C10,22 8,20 8,16 C8,12 12,8 12,8 C12,8 16,12 16,16 C16,20 14,22 12,22" fill="${fill}"/></svg>`,
    arrow:    `<svg viewBox="0 0 24 24" width="16" height="16"><polygon points="12,2 22,12 12,10 2,12" fill="${fill}"/></svg>`,
    airdrop:  `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="5" y="10" width="14" height="8" rx="2" fill="none" stroke="${fill}" stroke-width="1.5"/><line x1="12" y1="4" x2="12" y2="10" stroke="${fill}" stroke-width="1.5"/><polygon points="9,4 12,2 15,4" fill="${fill}"/><line x1="8" y1="14" x2="16" y2="14" stroke="${fill}" stroke-width="0.8" opacity="0.5"/><line x1="8" y1="16" x2="16" y2="16" stroke="${fill}" stroke-width="0.8" opacity="0.5"/></svg>`,
    flag:     `<svg viewBox="0 0 24 24" width="16" height="16"><line x1="6" y1="22" x2="6" y2="4" stroke="${fill}" stroke-width="1.5"/><polygon points="6,4 18,8 6,12" fill="${fill}"/></svg>`,
    flag_point: `<svg viewBox="0 0 24 24" width="16" height="16"><line x1="6" y1="22" x2="6" y2="4" stroke="${fill}" stroke-width="1.5"/><polygon points="6,4 18,8 6,12" fill="${fill}"/><circle cx="6" cy="4" r="2" fill="${fill}" opacity="0.4"/><line x1="6" y1="22" x2="10" y2="20" stroke="${fill}" stroke-width="1"/></svg>`,
    mission:  `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9" fill="none" stroke="${fill}" stroke-width="1" opacity="0.5"/><circle cx="12" cy="12" r="6" fill="none" stroke="${fill}" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="${fill}"/><line x1="12" y1="2" x2="12" y2="5" stroke="${fill}" stroke-width="1.5"/><line x1="12" y1="19" x2="12" y2="22" stroke="${fill}" stroke-width="1.5"/><line x1="2" y1="12" x2="5" y2="12" stroke="${fill}" stroke-width="1.5"/><line x1="19" y1="12" x2="22" y2="12" stroke="${fill}" stroke-width="1.5"/></svg>`,
    stash:    `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="6" width="18" height="14" rx="1" fill="none" stroke="${fill}" stroke-width="1.5" stroke-dasharray="2 1"/><path d="M8,10 L12,14 L16,10" fill="none" stroke="${fill}" stroke-width="1.5"/><line x1="12" y1="6" x2="12" y2="14" stroke="${fill}" stroke-width="1"/><rect x="7" y="15" width="10" height="3" rx="0.5" fill="${fill}" opacity="0.3"/></svg>`,
    emission: `<svg viewBox="0 0 24 24" width="16" height="16"><polygon points="12,3 22,12 20,12 20,22 4,22 4,12 2,12" fill="none" stroke="${fill}" stroke-width="1.5"/><circle cx="12" cy="16" r="4" fill="none" stroke="${fill}" stroke-width="1"/><path d="M10,16 L11,14 L13,18 L14,16" stroke="${fill}" stroke-width="1" fill="none"/><line x1="12" y1="3" x2="12" y2="1" stroke="${fill}" stroke-width="1" stroke-dasharray="1 1"/></svg>`,
    lab:      `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M9,4 L9,10 L4,20 L20,20 L15,10 L15,4" fill="none" stroke="${fill}" stroke-width="1.5"/><line x1="9" y1="4" x2="15" y2="4" stroke="${fill}" stroke-width="1.5"/><circle cx="12" cy="16" r="2" fill="${fill}" opacity="0.5"/><path d="M10,13 Q11,11 12,13 Q13,11 14,13" fill="none" stroke="${fill}" stroke-width="0.8" opacity="0.6"/></svg>`,
    checkpoint: `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="8" width="18" height="12" rx="1" fill="none" stroke="${fill}" stroke-width="1.5"/><line x1="12" y1="8" x2="12" y2="4" stroke="${fill}" stroke-width="1.5"/><line x1="8" y1="4" x2="16" y2="4" stroke="${fill}" stroke-width="1.5"/><circle cx="8" cy="14" r="1.5" fill="${fill}"/><circle cx="16" cy="14" r="1.5" fill="${fill}"/><line x1="9" y1="14" x2="15" y2="14" stroke="${fill}" stroke-width="0.8" opacity="0.5"/></svg>`,
    note:     `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="4" y="2" width="16" height="20" rx="1" fill="none" stroke="${fill}" stroke-width="1.5"/><line x1="8" y1="7" x2="16" y2="7" stroke="${fill}" stroke-width="1"/><line x1="8" y1="11" x2="16" y2="11" stroke="${fill}" stroke-width="1"/><line x1="8" y1="15" x2="13" y2="15" stroke="${fill}" stroke-width="1"/><path d="M14,15 L16,17" fill="none" stroke="${fill}" stroke-width="1"/><circle cx="17" cy="18" r="1.5" fill="${fill}" opacity="0.4"/></svg>`,
  };
  return icons[id] || icons.star;
}

// ===== HELPER: Build catById index =====
export function buildCatIndex(cats: Category[]): Record<string, Category> {
  const idx: Record<string, Category> = {};
  [...BUILTIN_CATEGORIES, ...cats].forEach(c => { idx[c.id] = c; });
  return idx;
}

// ===== HELPER: All markers (preset + user) =====
export function allMarkers(preset: Marker[], user: Marker[]): Marker[] {
  return [...preset, ...user];
}

// ===== HELPER: Calculate distances in meters =====
// Chernarus DayZ map is ~15000m x 15000m
export const MAP_SIZE_M = 15000;

export function calcDistances(points: MeasurePoint[], mapW: number, mapH: number): {
  totalDistanceM: number;
  segmentDistancesM: number[];
} {
  if (points.length < 2) return { totalDistanceM: 0, segmentDistancesM: [] };

  const segments: number[] = [];
  let total = 0;

  for (let i = 1; i < points.length; i++) {
    // xPct/yPct — проценты (0-100), делим на 100. Без этого линейка врала в 100 раз.
    const dx = ((points[i].xPct - points[i - 1].xPct) / 100) * mapW;
    const dy = ((points[i].yPct - points[i - 1].yPct) / 100) * mapH;
    const dist = Math.sqrt(dx * dx + dy * dy);
    segments.push(dist);
    total += dist;
  }

  return { totalDistanceM: Math.round(total), segmentDistancesM: segments.map(s => Math.round(s)) };
}

// ===== PALETTE =====
export const PALETTE = [
  '#6E7378','#B08245','#4C8C3C','#6B3A2C','#4B5A34',
  '#8E5CC2','#D9A441','#3FA7A0','#D97A2E','#C1352B',
  '#3E6FB5','#9DBF3F','#5A4A8C','#2E7D6B','#B5451B',
  '#7A8C3F','#4A6B8A','#C77B9A','#8A8A8A','#5C6B3C'
];

// ===== STAGE SIZE =====
export const STAGE_SIZE = 20000;
export const CLUSTER_THRESHOLD = 120;

// ===== STORE =====
export const useZoneMapStore = create<ZoneMapState>((set, get) => ({
  markers: [],
  presetMarkers: [],
  customCategories: [],
  view: { tx: 0, ty: 0, scale: 1 },
  addMode: false,
  measureModeOn: false,
  measureState: { active: false, points: [], totalDistanceM: 0, segmentDistancesM: [] },
  gridVisible: false,
  fullscreenMode: false,
  activePanel: 'none',
  activeSheet: null,
  sheetMode: null,
  mapImageUrl: null,
  mapImageWidth: 0,
  mapImageHeight: 0,
  satelliteSrc: null,
  topoSrc: null,
  showingTopo: false,
  mapWorldSizeM: MAP_SIZE_M,
  activeLayers: {},
  geigerValue: 0,
  anomalyWarning: null,
  showSaveIndicator: false,
  searchQuery: '',
  themeMode: 'dark',
  appMode: 'viewer',
  toasts: [],

  setMarkers: (markers) => set({ markers }),
  addMarker: (marker) => {
    // Optimistic update — show the marker immediately.
    set(s => ({ markers: [...s.markers, marker] }));
    // Send to server. On failure, ROLL BACK the optimistic update and show
    // a toast so the user knows the marker wasn't saved. This replaces
    // the previous `.catch(() => {})` pattern that swallowed errors.
    fetch('/api/markers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(marker),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
      })
      .catch((err: Error) => {
        // Roll back optimistic update.
        set(s => ({ markers: s.markers.filter(m => m.id !== marker.id) }));
        get().pushToast(`Не удалось сохранить точку: ${err.message}`, 'error');
      });
  },
  updateMarker: (id, updates) => {
    // Save the previous state so we can roll back on failure.
    const prev = get().markers.find(m => m.id === id);
    set(s => ({ markers: s.markers.map(m => m.id === id ? { ...m, ...updates } : m) }));
    fetch(`/api/markers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
      })
      .catch((err: Error) => {
        // Roll back to previous state.
        if (prev) {
          set(s => ({ markers: s.markers.map(m => m.id === id ? prev : m) }));
        }
        get().pushToast(`Не удалось обновить точку: ${err.message}`, 'error');
      });
  },
  removeMarker: (id) => {
    // Save for rollback.
    const prev = get().markers.find(m => m.id === id);
    set(s => ({ markers: s.markers.filter(m => m.id !== id) }));
    fetch(`/api/markers/${id}`, { method: 'DELETE' })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
      })
      .catch((err: Error) => {
        // Restore the deleted marker.
        if (prev) {
          set(s => ({ markers: [...s.markers, prev] }));
        }
        get().pushToast(`Не удалось удалить точку: ${err.message}`, 'error');
      });
  },
  clearAllMarkers: () => {
    // Save all markers for potential rollback.
    const prev = get().markers;
    set({ markers: [] });
    fetch('/api/markers', { method: 'DELETE' })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
      })
      .catch((err: Error) => {
        // Restore markers on failure.
        set({ markers: prev });
        get().pushToast(`Не удалось очистить точки: ${err.message}`, 'error');
      });
  },
  setCustomCategories: (cats) => set({ customCategories: cats }),
  addCustomCategory: (cat) => {
    set(s => ({ customCategories: [...s.customCategories, cat] }));
    fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cat),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
      })
      .catch((err: Error) => {
        set(s => ({ customCategories: s.customCategories.filter(c => c.id !== cat.id) }));
        get().pushToast(`Не удалось создать слой: ${err.message}`, 'error');
      });
  },
  removeCustomCategory: (id) => {
    // Save for rollback.
    const prevCat = get().customCategories.find(c => c.id === id);
    const prevMarkers = get().markers.filter(m => m.cat === id);
    set(s => ({
      customCategories: s.customCategories.filter(c => c.id !== id),
      markers: s.markers.filter(m => m.cat !== id),
    }));
    fetch(`/api/categories/${id}`, { method: 'DELETE' })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
      })
      .catch((err: Error) => {
        if (prevCat) {
          set(s => ({
            customCategories: [...s.customCategories, prevCat],
            markers: [...s.markers, ...prevMarkers],
          }));
        }
        get().pushToast(`Не удалось удалить слой: ${err.message}`, 'error');
      });
  },
  // Pulls the shared state from the server. Call this once on mount instead
  // of reading markers/categories out of localStorage.
  loadFromServer: async () => {
    try {
      const [markersRes, catsRes] = await Promise.all([
        fetch('/api/markers'),
        fetch('/api/categories'),
      ]);
      if (markersRes.ok) set({ markers: await markersRes.json() });
      if (catsRes.ok) set({ customCategories: await catsRes.json() });
    } catch { /* offline / server not reachable — keep whatever's already in state */ }
  },
  // Mod-baked spawns/loot: a static file, not the database (it doesn't
  // change per-player and shouldn't be editable from the UI).
  loadPresetMarkers: async () => {
    // Ищем в обоих местах: в public/assets/ (куда кладутся остальные
    // ассеты карты) и в public/data/ — исторический путь. Раньше здесь был
    // только /data/, из-за чего файл, положенный в assets по инструкции,
    // просто не находился и метки не появлялись вообще.
    const paths = ['/assets/spawns.json', '/data/spawns.json'];
    let data: unknown = null;
    for (const p of paths) {
      try {
        const res = await fetch(p);
        if (res.ok) { data = await res.json(); break; }
      } catch { /* пробуем следующий путь */ }
    }
    if (!data) return;

    // Калибровочная поправка. Метки считаются из мировых координат мода,
    // а картинка карты может быть обрезана или смещена относительно мира —
    // тогда всё уезжает на одну и ту же величину. Подбирается на глаз:
    // правите два числа в map-meta.json, обновляете страницу, смотрите.
    //   offsetXPct — плюс двигает метки ВПРАВО
    //   offsetYPct — плюс двигает метки ВНИЗ
    // Значения в процентах ширины карты: 1% на карте 20480 м = ~205 метров.
    let offX = 0, offY = 0, scaleX = 1, scaleY = 1;
    try {
      const metaRes = await fetch('/assets/map-meta.json');
      if (metaRes.ok) {
        const meta = await metaRes.json();
        if (typeof meta.offsetXPct === 'number') offX = meta.offsetXPct;
        if (typeof meta.offsetYPct === 'number') offY = meta.offsetYPct;
        if (typeof meta.scaleX === 'number' && meta.scaleX > 0) scaleX = meta.scaleX;
        if (typeof meta.scaleY === 'number' && meta.scaleY > 0) scaleY = meta.scaleY;
      }
    } catch { /* поправки нет — работаем как есть */ }

    const payload = data as { markers?: Marker[]; categories?: Category[] };
    const list: Marker[] = Array.isArray(data) ? (data as Marker[]) : (payload.markers || []);
    const cats: Category[] = Array.isArray(data) ? [] : (payload.categories || []);
    if (cats.length) {
      set(s => ({
        customCategories: [
          ...s.customCategories,
          ...cats.filter(c => !s.customCategories.some(x => x.id === c.id)),
        ],
      }));
    }
    set({
      presetMarkers: list.map((m, i) => ({
        ...m,
        id: m.id || `preset_${i}`,
        preset: true,
        xPct: m.xPct * scaleX + offX,
        yPct: m.yPct * scaleY + offY,
      })),
    });
  },
  setView: (view) => set({ view }),
  setAddMode: (mode) => set({ addMode: mode }),
  setMeasureModeOn: (on) => set({ measureModeOn: on }),
  setMeasureState: (state) => set({ measureState: state }),
  addMeasurePoint: (point) => {
    const state = get();
    const newPoints = [...state.measureState.points, point];
    const { totalDistanceM, segmentDistancesM } = calcDistances(
      newPoints,
      state.mapWorldSizeM,
      state.mapWorldSizeM
    );
    set({ measureState: { active: true, points: newPoints, totalDistanceM, segmentDistancesM } });
  },
  removeLastMeasurePoint: () => {
    const state = get();
    const newPoints = state.measureState.points.slice(0, -1);
    const { totalDistanceM, segmentDistancesM } = calcDistances(
      newPoints,
      state.mapWorldSizeM,
      state.mapWorldSizeM
    );
    set({ measureState: { active: newPoints.length > 0, points: newPoints, totalDistanceM, segmentDistancesM } });
  },
  setGridVisible: (visible) => set({ gridVisible: visible }),
  setFullscreenMode: (mode) => set({ fullscreenMode: mode }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setActiveSheet: (id) => set({ activeSheet: id }),
  setSheetMode: (mode) => set({ sheetMode: mode }),
  setMapImageUrl: (url) => set({ mapImageUrl: url }),
  setMapImageSize: (w, h) => set({ mapImageWidth: w, mapImageHeight: h }),
  setShowingTopo: (showing) => set({ showingTopo: showing }),
  setMapWorldSizeM: (m) => set({ mapWorldSizeM: m }),

  // Looks for map images sitting in /public/assets/ on whatever server this
  // is hosted on — static files that ship with the deploy, not something
  // stored per-browser. Silently no-ops if nothing is there yet (falls back
  // to the manual "load image" button in the menu, same as before).
  loadMapAssets: async () => {
    const tryLoadImage = (paths: string[], i = 0): Promise<string | null> =>
      new Promise((resolve) => {
        if (i >= paths.length) { resolve(null); return; }
        const img = new Image();
        img.onload = () => resolve(paths[i]);
        img.onerror = () => tryLoadImage(paths, i + 1).then(resolve);
        img.src = paths[i];
      });

    const [sat, topo, meta] = await Promise.all([
      tryLoadImage(['/assets/map-satellite.jpg', '/assets/map-satellite.png']),
      tryLoadImage(['/assets/map-topo.jpg', '/assets/map-topo.png']),
      fetch('/assets/map-meta.json').then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);

    if (sat) {
      set(s => ({
        satelliteSrc: sat,
        // Only take over the displayed image if the player hasn't manually
        // uploaded their own override for this session.
        mapImageUrl: s.mapImageUrl ?? sat,
      }));
    }
    if (topo) set({ topoSrc: topo });
    if (meta && typeof meta.worldSizeM === 'number' && meta.worldSizeM > 0) {
      set({ mapWorldSizeM: meta.worldSizeM });
    }
  },
  toggleLayer: (catId) => set(s => ({
    activeLayers: { ...s.activeLayers, [catId]: !(s.activeLayers[catId] ?? true) }
  })),
  setGeigerValue: (value) => set({ geigerValue: value }),
  setAnomalyWarning: (warning) => set({ anomalyWarning: warning }),
  setShowSaveIndicator: (show) => set({ showSaveIndicator: show }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveLayersDirect: (layers) => set({ activeLayers: layers }),
  setThemeMode: (mode) => set({ themeMode: mode }),
  setAppMode: (mode) => set({ appMode: mode }),
  resetUI: () => set({
    activePanel: 'none',
    activeSheet: null,
    sheetMode: null,
    addMode: false,
  }),

  // ─── Toast actions ───────────────────────────────────────────────
  // pushToast creates a toast with a unique id; auto-dismiss after 4s
  // via the UI's ToastContainer component (not here — keeps the store
  // synchronous and pure).
  pushToast: (text, kind = 'info') => {
    const toast: ToastMessage = {
      id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text,
      kind,
      createdAt: Date.now(),
    };
    set(s => ({ toasts: [...s.toasts, toast] }));
  },
  dismissToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
