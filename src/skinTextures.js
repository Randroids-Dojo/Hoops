// Parameterized procedural texture generators + async image loaders for
// skin assets. Callers pass per-skin params from the catalog; the default
// look is whatever the 'default' catalog entry specifies.

import * as THREE from 'three';

// ── Basketball ───────────────────────────────────────────────────────────

// `params` shape: { base, mid, shadow, seam, pebbleLight, pebbleDark }
export function makeBallTextures(params) {
  return { map: _makeBallMap(params), bumpMap: _makeBallBump() };
}

function _makeBallMap(params) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');

  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, params.base);
  grd.addColorStop(0.5, params.mid || params.base);
  grd.addColorStop(1, params.shadow || params.base);
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);

  // Pebble grain — alternates light/dark specks at low alpha for that
  // leather-pebble micro-texture.
  const light = params.pebbleLight || '#ffffff';
  const dark = params.pebbleDark || '#000000';
  for (let i = 0; i < 18000; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    const r = Math.random() * 1.4 + 0.3;
    g.fillStyle = Math.random() < 0.5
      ? `rgba(${_hexToRgb(dark)},${Math.random() * 0.18})`
      : `rgba(${_hexToRgb(light)},${Math.random() * 0.18})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // Classic 8-panel seam pattern: equator + 4 verticals on a UV-mapped sphere.
  g.strokeStyle = params.seam;
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, c.height / 2);
  g.lineTo(c.width, c.height / 2);
  g.stroke();
  for (let i = 0; i < 4; i++) {
    const x = (i + 0.5) * (c.width / 4);
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, c.height);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function _makeBallBump() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#888';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 15000; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    const r = Math.random() * 1.2 + 0.4;
    g.fillStyle = Math.random() < 0.5 ? '#bbb' : '#555';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#000';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, c.height / 2); g.lineTo(c.width, c.height / 2);
  g.stroke();
  for (let i = 0; i < 4; i++) {
    const x = (i + 0.5) * (c.width / 4);
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// Image-backed ball texture. Returns a promise that resolves to {map, bumpMap}.
// The bump map is always procedural so photo skins still feel like leather
// rather than a smooth decal. On image-load failure the caller should fall
// back to procedural via `fallback.params`.
export function loadBallImageTexture(url) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        // Three.js SphereGeometry maps geometry-u=0 to −X, u=0.25 to +Z (the
        // side that faces the camera at spawn). Portrait photos have their
        // subject centered at texture-u=0.5, which without an offset lands
        // on the +X side of the ball — out of view. Shift the texture so
        // the photo's center column samples at the +Z meridian, putting the
        // face front-and-center when the player draws back to shoot.
        tex.offset.x = 0.25;
        tex.needsUpdate = true;
        resolve({ map: tex, bumpMap: _makeBallBump() });
      },
      undefined,
      (err) => reject(err),
    );
  });
}

// ── Court floor ──────────────────────────────────────────────────────────

// params: { plankBase, plankShade, accent, line, metalness, roughness, grid? }
// Returns a single CanvasTexture suitable for floor.material.map. The caller
// also uses params.line to recolor the painted court lines.
export function makeCourtTexture(params) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');

  g.fillStyle = params.plankBase;
  g.fillRect(0, 0, c.width, c.height);

  if (params.grid) {
    // Special-case the "Arcade Grid" legendary: bright pink grid over a dark
    // plum base. Skips the wood-plank look entirely.
    g.strokeStyle = params.accent;
    g.lineWidth = 2;
    for (let x = 0; x <= c.width; x += 32) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke();
    }
    for (let y = 0; y <= c.height; y += 32) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke();
    }
    // A few brighter dots at grid intersections for extra arcade feel.
    g.fillStyle = params.line;
    for (let x = 0; x <= c.width; x += 32) {
      for (let y = 0; y <= c.height; y += 32) {
        g.fillRect(x - 1, y - 1, 3, 3);
      }
    }
  } else {
    // Wood-plank look. Stripe rows with slight per-plank tonal jitter so the
    // floor doesn't read as one flat tile when tiled across the court.
    for (let y = 0; y < c.height; y += 32) {
      const jitter = (Math.random() - 0.5) * 0.18;
      g.fillStyle = _mixColors(params.plankBase, params.plankShade, 0.5 + jitter);
      g.fillRect(0, y, c.width, 30);
      g.fillStyle = _alpha(params.accent, 0.6);
      g.fillRect(0, y + 30, c.width, 2);
    }
    // Long grain streaks for fake wood depth.
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = _alpha(params.accent, Math.random() * 0.18);
      g.fillRect(Math.random() * c.width, Math.random() * c.height, Math.random() * 60, 1);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ── Color helpers ────────────────────────────────────────────────────────

function _hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

function _alpha(hex, a) {
  return `rgba(${_hexToRgb(hex)},${a})`;
}

function _mixColors(a, b, t) {
  const ah = a.replace('#', '');
  const bh = b.replace('#', '');
  const ar = parseInt(ah.slice(0, 2), 16);
  const ag = parseInt(ah.slice(2, 4), 16);
  const ab = parseInt(ah.slice(4, 6), 16);
  const br = parseInt(bh.slice(0, 2), 16);
  const bg = parseInt(bh.slice(2, 4), 16);
  const bb = parseInt(bh.slice(4, 6), 16);
  const r = Math.round(ar * (1 - t) + br * t);
  const g = Math.round(ag * (1 - t) + bg * t);
  const bl = Math.round(ab * (1 - t) + bb * t);
  return `rgb(${r},${g},${bl})`;
}
