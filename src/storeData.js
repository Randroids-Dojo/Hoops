// Single source of truth for store contents and award rules.
// No DOM / Three deps — safe to import from anywhere.

// Vite serves `/public` at the URL root without bundling, so legendary
// image assets are referenced by absolute path. import.meta.env.BASE_URL
// handles deployments where the app is served from a subpath.
const ASSET_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
const miguelUrl = `${ASSET_BASE}skins/ball_miguel.png`.replace(/\/+/g, '/');
const jessicaUrl = `${ASSET_BASE}skins/ball_jessica.png`.replace(/\/+/g, '/');

export const RARITIES = {
  common:    { label: 'COMMON',    color: '#9aa3b0' },
  rare:      { label: 'RARE',      color: '#4dd2ff' },
  epic:      { label: 'EPIC',      color: '#c084fc' },
  legendary: { label: 'LEGENDARY', color: '#ffd34d' },
};

// Tickets are deliberately rare — there's no per-bucket payout, just
// swishes, streak milestones, stage clears, mode completions, and (big)
// high-score bonuses. A clean Classic run with no streaks earns ~0 tickets;
// stringing together a few swishes + a 5-streak earns ~50; setting a new
// all-time best pays ~1500. The cheapest skin (150) is roughly one
// stage-clearing run; the 5500 legendaries are saved for high-score days.
export const AWARDS = {
  firstDaily:           100,
  swish:                5,    // the only per-shot reward — swishes only
  streakHeatingUp:      10,   // streak 3+
  streakOnFire:         25,   // streak 5+
  streakBlazing:        75,   // streak 7+
  streakUnstoppable:    200,  // streak 10+
  stageClear:           50,
  distanceWin:          150,
  endlessTimeUp:        75,
  dailyHighScore:       250,  // beat your own best score from earlier today
  allTimeHighScore:     1500, // beat your local all-time best — the headline reward
};

// All skins share the same shape: id, name, rarity, price, kind, params/image.
// Procedural skins are rendered live from `params` by skinTextures.js; image
// skins load a PNG from /public/skins/ and fall back to `fallback.params` if
// the asset can't load.
export const CATALOG = {
  ball: [
    { id: 'default', name: 'Classic',  rarity: 'common', price: 0,
      kind: 'procedural',
      params: { base: '#d76318', mid: '#e3741f', shadow: '#bf551a', seam: '#1a0c04', pebbleLight: '#ffc8a0', pebbleDark: '#5a2808' } },

    { id: 'blackout', name: 'Blackout', rarity: 'common', price: 150,
      kind: 'procedural',
      params: { base: '#1a1a1a', mid: '#2a2a2a', shadow: '#0a0a0a', seam: '#ff2a2a', pebbleLight: '#3a3a3a', pebbleDark: '#000000' } },

    { id: 'lava', name: 'Lava', rarity: 'rare', price: 300,
      kind: 'procedural',
      params: { base: '#ff3300', mid: '#ff6a00', shadow: '#a00800', seam: '#1a0000', pebbleLight: '#ffd06a', pebbleDark: '#440000' } },

    { id: 'ice', name: 'Ice', rarity: 'rare', price: 600,
      kind: 'procedural',
      params: { base: '#7ad7ff', mid: '#aae6ff', shadow: '#3a8fc0', seam: '#082238', pebbleLight: '#ffffff', pebbleDark: '#205070' } },

    { id: 'neon', name: 'Neon', rarity: 'epic', price: 1200,
      kind: 'procedural',
      params: { base: '#00ffe0', mid: '#00e5ff', shadow: '#005a5a', seam: '#ff00d4', pebbleLight: '#ffffff', pebbleDark: '#003a3a' } },

    { id: 'gold', name: 'Gold', rarity: 'epic', price: 2400,
      kind: 'procedural',
      params: { base: '#ffce3a', mid: '#ffd86a', shadow: '#b07f10', seam: '#3a2a00', pebbleLight: '#fff6c0', pebbleDark: '#7a5300' } },

    { id: 'miguel', name: 'Miguel', rarity: 'legendary', price: 5500,
      kind: 'image', image: miguelUrl,
      // Used if the asset fails to load. Deep cool tone with a hot seam so
      // it still reads as a real "skin" rather than a default fallback.
      fallback: { params: { base: '#0a1a3a', mid: '#1a3a6a', shadow: '#000a1a', seam: '#ffd34d', pebbleLight: '#80a0ff', pebbleDark: '#000a1a' } } },

    { id: 'jessica', name: 'Jessica', rarity: 'legendary', price: 5500,
      kind: 'image', image: jessicaUrl,
      fallback: { params: { base: '#3a0a2a', mid: '#6a1a5a', shadow: '#1a000a', seam: '#ffd34d', pebbleLight: '#ff80c0', pebbleDark: '#1a000a' } } },
  ],

  backboard: [
    { id: 'default', name: 'Classic Glass', rarity: 'common', price: 0,
      kind: 'procedural',
      params: { color: 0xf6f6f6, transmission: 0.45, clearcoat: 0.4, roughness: 0.12, frame: 0x111111, square: 0xff2233 } },

    { id: 'midnight', name: 'Midnight', rarity: 'common', price: 150,
      kind: 'procedural',
      params: { color: 0x0a0e1a, transmission: 0.1, clearcoat: 0.6, roughness: 0.15, frame: 0x00e5ff, square: 0x00e5ff } },

    { id: 'amber', name: 'Amber', rarity: 'rare', price: 600,
      kind: 'procedural',
      params: { color: 0xff8c00, transmission: 0.55, clearcoat: 0.5, roughness: 0.18, frame: 0x3a1a00, square: 0xffd34d } },

    { id: 'holo', name: 'Holo Mint', rarity: 'epic', price: 1200,
      kind: 'procedural',
      params: { color: 0x40ffaa, transmission: 0.7, clearcoat: 0.8, roughness: 0.05, frame: 0x003a2a, square: 0xff00d4 } },

    { id: 'gold_board', name: 'Gold Glass', rarity: 'epic', price: 2400,
      kind: 'procedural',
      params: { color: 0xffce3a, transmission: 0.55, clearcoat: 0.6, roughness: 0.12, frame: 0x3a2a00, square: 0xff2233 } },

    { id: 'neon_board', name: 'Neon Pulse', rarity: 'legendary', price: 5500,
      kind: 'procedural',
      params: { color: 0xff00d4, transmission: 0.65, clearcoat: 0.7, roughness: 0.08, frame: 0x00ffe0, square: 0x00ffe0 } },
  ],

  court: [
    { id: 'default', name: 'Hardwood', rarity: 'common', price: 0,
      kind: 'procedural',
      params: { plankBase: '#a06a2c', plankShade: '#7a4a18', accent: '#3a1f08', line: '#eeeeee', metalness: 0.05, roughness: 0.55 } },

    { id: 'concrete', name: 'Concrete', rarity: 'common', price: 150,
      kind: 'procedural',
      params: { plankBase: '#3a3a3a', plankShade: '#2a2a2a', accent: '#1a1a1a', line: '#ffd34d', metalness: 0.1, roughness: 0.85 } },

    { id: 'streetcourt', name: 'Street Court', rarity: 'rare', price: 600,
      kind: 'procedural',
      params: { plankBase: '#3a5a2a', plankShade: '#2a4a1a', accent: '#1a3a0a', line: '#ffffff', metalness: 0.05, roughness: 0.75 } },

    { id: 'glow', name: 'Glow Floor', rarity: 'epic', price: 1200,
      kind: 'procedural',
      params: { plankBase: '#0a1a3a', plankShade: '#0a2a5a', accent: '#001a3a', line: '#00ffe0', metalness: 0.4, roughness: 0.25 } },

    { id: 'sunset', name: 'Sunset', rarity: 'epic', price: 2400,
      kind: 'procedural',
      params: { plankBase: '#ff6a3a', plankShade: '#ff8a3a', accent: '#7a2a00', line: '#fff6c0', metalness: 0.1, roughness: 0.45 } },

    { id: 'arcade', name: 'Arcade Grid', rarity: 'legendary', price: 5500,
      kind: 'procedural',
      params: { plankBase: '#1a0a3a', plankShade: '#3a0a5a', accent: '#ff00d4', line: '#00ffe0', metalness: 0.6, roughness: 0.2, grid: true } },
  ],
};

export function getSkin(category, id) {
  const list = CATALOG[category];
  if (!list) return null;
  return list.find((s) => s.id === id) || null;
}

export function defaultEquipped() {
  return { ball: 'default', backboard: 'default', court: 'default' };
}

export function defaultOwned() {
  return { ball: ['default'], backboard: ['default'], court: ['default'] };
}

export const CATEGORIES = ['ball', 'backboard', 'court'];
