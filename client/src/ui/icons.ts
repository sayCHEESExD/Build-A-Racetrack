
/**
 * THE ICONS: the supplied UI art (shop, inventory, trophy, rebirth, sound)
 * where it fits, and small inline SVGs for everything else - every track
 * piece drawn as the shape it builds.
 */

/** The supplied UI images (shipped from assets/ui). */
export const UI_IMAGES = {
  shop: '/ui/shop.png',
  upgrade: '/ui/Upgrades.png',
  map: '/ui/Map.png',
  inventory: '/ui/inventory.png',
  car: '/ui/car.png',
  gift: '/ui/gift.png',
  rebirth: '/ui/rebirth.png',
  build: '/ui/build.png',
  trophy: '/ui/trophy.png',
  home: '/ui/home.png',
  bills: '/ui/Bills.png',
  energy: '/ui/energy.png',
  sound: '/ui/Sound.png',
  daily: '/ui/Daily.png',
  leaderboard: '/ui/leaderboard.png',
  settings: '/ui/Settings.png',
  equipment: '/ui/equipment.png',
} as const;

export const img = (src: string, cls = 'rt-img'): string => `<img class="${cls}" src="${src}" alt="" draggable="false">`;

const svg = (body: string, view = '0 0 24 24'): string => `<svg viewBox="${view}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  coin: svg('<circle cx="12" cy="12" r="9" fill="#ffd23f" stroke="#b07a10" stroke-width="2"/><path d="M12 7v10M9.5 9.5h4a1.7 1.7 0 010 3.4h-3a1.7 1.7 0 000 3.4h4" stroke="#b07a10" stroke-width="2"/>'),
  trolley: svg('<rect x="3" y="7" width="18" height="8" rx="2" fill="#4fa3ff" stroke="#1d3a7a" stroke-width="2"/><path d="M6 7V5h5v2" stroke="#1d3a7a" stroke-width="2"/><circle cx="7.5" cy="17.5" r="2" fill="#2b2f45"/><circle cx="16.5" cy="17.5" r="2" fill="#2b2f45"/><path d="M2 21h20" stroke="#8d939c" stroke-width="2"/>'),
  upgrade: svg('<path d="M12 3l7 7h-4v8H9v-8H5z" fill="#58d36a" stroke="#1f6b2a" stroke-width="2"/><path d="M8 21h8" stroke="#1f6b2a" stroke-width="2.4"/>'),
  ride: svg('<path d="M2 18c4 0 5-10 10-10s6 10 10 10" stroke="#ff5a5a" stroke-width="3"/><path d="M2 21h20" stroke="#8d939c" stroke-width="2"/><rect x="9" y="4" width="6" height="4" rx="1" fill="#ffd23f" stroke="#8a5a12" stroke-width="1.5"/>'),
  home: svg('<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z" fill="#ffc93a" stroke="#8a5a12" stroke-width="2"/>'),
  build: svg('<path d="M14 4l6 6-3 3-6-6z" fill="#ffc93a" stroke="#8a5a12" stroke-width="2"/><path d="M11 7L3 15v6h6l8-8" stroke="#4fa3ff" stroke-width="2.4"/>'),
  friends: svg('<circle cx="8" cy="9" r="3.4" fill="#ffd23f" stroke="#8a5a12" stroke-width="1.8"/><circle cx="16.5" cy="9.5" r="2.8" fill="#4fa3ff" stroke="#1d3a7a" stroke-width="1.8"/><path d="M2.5 20c.6-4 3-6 5.5-6s4.9 2 5.5 6M13.5 19c.5-3 2-4.6 3.5-4.6S20 16 21 19" stroke="#ffffff" stroke-width="2"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z" fill="#ffffff" stroke="#2b2f45" stroke-width="2"/>'),
  mute: svg('<path d="M4 9h4l5-4v14l-5-4H4z" fill="#ffffff" stroke="#2b2f45" stroke-width="2"/><path d="M16 9l5 6M21 9l-5 6" stroke="#ff5a5a" stroke-width="2.4"/>'),
  sound: svg('<path d="M4 9h4l5-4v14l-5-4H4z" fill="#ffffff" stroke="#2b2f45" stroke-width="2"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="#ffffff" stroke-width="2"/>'),
  rotate: svg('<path d="M19 12a7 7 0 11-2.1-5" stroke="#ffffff" stroke-width="2.6"/><path d="M19 3v5h-5" stroke="#ffffff" stroke-width="2.6"/>'),
  up: svg('<path d="M12 4l7 8h-4v8H9v-8H5z" fill="#ffffff"/>'),
  down: svg('<path d="M12 20l7-8h-4V4H9v8H5z" fill="#ffffff"/>'),
  trash: svg('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" stroke="#ffffff" stroke-width="2.2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14" stroke="#ffffff" stroke-width="3"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke="#ffffff" stroke-width="3"/>'),
  lock: svg('<rect x="5" y="10" width="14" height="10" rx="2" fill="#9aa3b2" stroke="#2b2f45" stroke-width="2"/><path d="M8 10V7a4 4 0 018 0v3" stroke="#2b2f45" stroke-width="2"/>'),
  bolt: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="#ffd23f" stroke="#8a5a12" stroke-width="1.6"/>'),
  magnet: svg('<path d="M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4z" fill="#ff5a5a" stroke="#7a1f1f" stroke-width="1.6"/><path d="M6 4h4v3H6zM14 4h4v3h-4z" fill="#e6e9ef"/>'),
  pile: svg('<ellipse cx="12" cy="18" rx="8" ry="3" fill="#ffd23f" stroke="#b07a10" stroke-width="1.6"/><ellipse cx="12" cy="13.5" rx="6" ry="2.5" fill="#ffd23f" stroke="#b07a10" stroke-width="1.6"/><ellipse cx="12" cy="9" rx="4" ry="2" fill="#ffe680" stroke="#b07a10" stroke-width="1.6"/>'),
  track: svg('<path d="M4 20V4M20 20V4" stroke="#8d939c" stroke-width="2.4"/><path d="M4 7h16M4 12h16M4 17h16" stroke="#c58a52" stroke-width="2.4"/>'),
  gauge: svg('<path d="M4 17a8 8 0 1116 0" stroke="#ffffff" stroke-width="2.4"/><path d="M12 17l4-6" stroke="#ffd23f" stroke-width="2.6"/>'),
  exit: svg('<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" stroke="#ffffff" stroke-width="2.4"/>'),
  end: svg('<path d="M4 12h11M11 7l5 5-5 5" stroke="#ffffff" stroke-width="2.6"/><path d="M19 5v14" stroke="#ffd23f" stroke-width="2.6"/>'),
  clear: svg('<path d="M5 19h14M7 15l6-10 4 2-6 10z" stroke="#ffffff" stroke-width="2.2"/>'),
};

const rail = (d: string, color: string): string =>
  svg(`<path d="${d}" stroke="#2b2f45" stroke-width="6"/><path d="${d}" stroke="${color}" stroke-width="3.2"/>`, '0 0 32 32');

/** Each piece drawn as what it builds (top-down for turns, side-on for climbs and specials). */
