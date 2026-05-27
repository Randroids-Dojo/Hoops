// Bridge between the catalog (storeData.js) and the live 3D scene. Owns the
// per-skin texture cache so swapping skins is O(1) after the first build.
// Image-backed skins kick off an async load on first request; the procedural
// fallback is returned immediately so the player never sees a blank ball.

import { getSkin, CATEGORIES } from './storeData.js';
import {
  makeBallTextures,
  loadBallImageTexture,
  makeCourtTexture,
} from './skinTextures.js';
import { tickets } from './tickets.js';

// skinId → { map, bumpMap }
const BALL_CACHE = new Map();
// skinId → CanvasTexture (one per court skin id)
const COURT_CACHE = new Map();
// skinIds currently waiting on their image fetch — prevents duplicate
// loads, but cleared on failure so a subsequent equip can retry.
const BALL_LOAD_INFLIGHT = new Set();

// Returns the cached pair for `skinId`, building it if needed. For image
// skins, returns the fallback immediately and kicks off an async load — when
// the image arrives, the cache is updated and any registered listeners are
// notified so the Ball can re-apply.
export function getBallTextures(skinId) {
  if (BALL_CACHE.has(skinId)) return BALL_CACHE.get(skinId);
  const skin = getSkin('ball', skinId);
  if (!skin) {
    // Unknown id — synthesize default to avoid throwing. Logged so a typo
    // in the catalog or a stale equipped id from a corrupted save is
    // surfaced rather than silently replaced.
    console.warn(`[skins] Unknown ball skin id '${skinId}'; falling back to default.`);
    const fallback = makeBallTextures(getSkin('ball', 'default').params);
    BALL_CACHE.set(skinId, fallback);
    return fallback;
  }

  if (skin.kind === 'procedural') {
    const tex = makeBallTextures(skin.params);
    BALL_CACHE.set(skinId, tex);
    return tex;
  }

  // Image skin: stash the procedural fallback under the id and kick off the
  // real load. When the load completes, swap the cache entry and notify.
  const fallbackParams = skin.fallback?.params || getSkin('ball', 'default').params;
  const placeholder = makeBallTextures(fallbackParams);
  BALL_CACHE.set(skinId, placeholder);

  if (!BALL_LOAD_INFLIGHT.has(skinId)) {
    BALL_LOAD_INFLIGHT.add(skinId);
    loadBallImageTexture(skin.image).then((loaded) => {
      BALL_CACHE.set(skinId, loaded);
      BALL_LOAD_INFLIGHT.delete(skinId);
      _emitBallTextureChange(skinId);
    }).catch((err) => {
      console.warn(`[skins] Failed to load ball image '${skinId}' from ${skin.image}; using procedural fallback.`, err);
      // Clear the inflight marker so a future getBallTextures() call (e.g.
      // re-equipping the skin) retries the fetch. Without this a single
      // transient network failure permanently denies the player their
      // legendary skin.
      BALL_LOAD_INFLIGHT.delete(skinId);
    });
  }

  return placeholder;
}

// Cached procedural court texture. world3d.applyCourtSkin pulls through this
// so repeated previews of the same skin don't re-rasterize the 256×256
// canvas. The texture's wrap/repeat are stamped here so callers don't have
// to remember to re-apply them on each swap.
export function getCourtTexture(skinId) {
  if (COURT_CACHE.has(skinId)) return COURT_CACHE.get(skinId);
  const skin = getSkin('court', skinId);
  if (!skin) {
    console.warn(`[skins] Unknown court skin id '${skinId}'; falling back to default.`);
    return getCourtTexture('default');
  }
  const tex = makeCourtTexture(skin.params);
  COURT_CACHE.set(skinId, tex);
  return tex;
}

const ballTextureListeners = new Set();
export function onBallTextureChange(fn) {
  ballTextureListeners.add(fn);
  return () => ballTextureListeners.delete(fn);
}
function _emitBallTextureChange(skinId) {
  for (const fn of ballTextureListeners) fn(skinId);
}

// Apply the currently-equipped (or previewed) skin in every category to the
// live scene. Called once at game start, again on every preview change, and
// once on preview-clear (to restore the last-equipped state).
export function applyAllEquipped(game) {
  applyBallSkin(game, tickets.equipped('ball'));
  applyBackboardSkin(game, tickets.equipped('backboard'));
  applyCourtSkin(game, tickets.equipped('court'));
}

export function applyBallSkin(game, skinId) {
  for (const ball of game.balls) ball.applySkin(skinId);
}

export function applyBackboardSkin(game, skinId) {
  game.hoop.applyBackboardSkin(skinId);
}

export function applyCourtSkin(game, skinId) {
  game.world3d.applyCourtSkin(skinId);
}

// Dispatch a single-category apply by name — used by store preview handling.
export function applySkinByCategory(game, category, skinId) {
  if (category === 'ball') applyBallSkin(game, skinId);
  else if (category === 'backboard') applyBackboardSkin(game, skinId);
  else if (category === 'court') applyCourtSkin(game, skinId);
}

// ── Store thumbnail rendering ────────────────────────────────────────────
// Draw a tiny preview of a skin into the 2D canvas context inside `rect`.
// Each category gets a tailored look — a sphere for balls, a rectangle for
// backboards, a plank stripe for courts. Cheap; called every frame.

export function drawSkinThumbnail(ctx, rect, category, skinId) {
  const skin = getSkin(category, skinId);
  if (!skin) return;
  if (category === 'ball') return _drawBallThumb(ctx, rect, skin);
  if (category === 'backboard') return _drawBackboardThumb(ctx, rect, skin);
  if (category === 'court') return _drawCourtThumb(ctx, rect, skin);
}

function _drawBallThumb(ctx, rect, skin) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const r = Math.min(rect.w, rect.h) / 2 - 6;

  ctx.save();
  if (skin.kind === 'image') {
    // For image balls (Miguel/Jessica/Galaxy), try to draw the loaded image
    // clipped to a circle. Falls back to the procedural look-alike below.
    const img = _getImageThumb(skin.image);
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      // Cover-fit the square into the circle.
      const size = r * 2;
      ctx.drawImage(img, cx - r, cy - r, size, size);
      ctx.restore();

      // Seam overlay so it still reads as a ball.
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      return;
    }
    // Image not loaded yet — fall through to procedural draw using fallback params.
    const params = skin.fallback?.params || skin.params;
    _drawProceduralBallCircle(ctx, cx, cy, r, params);
  } else {
    _drawProceduralBallCircle(ctx, cx, cy, r, skin.params);
  }
  ctx.restore();
}

function _drawProceduralBallCircle(ctx, cx, cy, r, params) {
  const grd = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
  grd.addColorStop(0, params.mid || params.base);
  grd.addColorStop(1, params.shadow || params.base);
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Seam cross
  ctx.strokeStyle = params.seam;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
  // Outer edge
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
}

function _drawBackboardThumb(ctx, rect, skin) {
  const p = skin.params;
  const x = rect.x + 8;
  const y = rect.y + 8;
  const w = rect.w - 16;
  const h = rect.h - 16;
  ctx.save();
  // Frame
  ctx.fillStyle = _hex(p.frame);
  ctx.fillRect(x, y, w, h);
  // Glass
  ctx.fillStyle = _hex(p.color);
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  ctx.globalAlpha = 1;
  // Shooter's square
  ctx.strokeStyle = _hex(p.square);
  ctx.lineWidth = 2;
  const sqW = w * 0.4;
  const sqH = h * 0.35;
  ctx.strokeRect(x + (w - sqW) / 2, y + (h - sqH) / 2, sqW, sqH);
  ctx.restore();
}

function _drawCourtThumb(ctx, rect, skin) {
  const p = skin.params;
  const x = rect.x + 8;
  const y = rect.y + 8;
  const w = rect.w - 16;
  const h = rect.h - 16;
  ctx.save();
  ctx.fillStyle = p.plankBase;
  ctx.fillRect(x, y, w, h);
  if (p.grid) {
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 1;
    for (let gx = x; gx <= x + w; gx += 12) {
      ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke();
    }
    for (let gy = y; gy <= y + h; gy += 12) {
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke();
    }
  } else {
    for (let py = y; py < y + h; py += 12) {
      ctx.fillStyle = p.plankShade;
      ctx.fillRect(x, py, w, 1);
    }
  }
  // Painted line (arc) for color identity
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h + 4, w * 0.6, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.restore();
}

// HTMLImageElements for store-thumbnail rendering. Three.js loads its own
// textures; the 2D thumb needs a regular DOM image cached separately.
const THUMB_IMG_CACHE = new Map();
function _getImageThumb(url) {
  if (THUMB_IMG_CACHE.has(url)) return THUMB_IMG_CACHE.get(url);
  const img = new Image();
  img.src = url;
  THUMB_IMG_CACHE.set(url, img);
  return img;
}

function _hex(n) {
  if (typeof n === 'string') return n;
  return `#${n.toString(16).padStart(6, '0')}`;
}

// Export categories list for store UI iteration.
export { CATEGORIES };
