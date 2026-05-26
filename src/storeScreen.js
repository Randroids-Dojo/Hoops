// Store screen — tab-driven catalog browser with live preview. Rendered into
// the 2D HUD canvas on top of the live 3D scene so preview swaps are
// immediately visible. Composed into Screens via screens.js.

import { COLORS } from './utils.js';
import { CATALOG, RARITIES, CATEGORIES, getSkin } from './storeData.js';
import { tickets } from './tickets.js';
import { drawSkinThumbnail } from './skins.js';

const TAB_LABELS = { ball: 'BALLS', backboard: 'BACKBOARDS', court: 'COURTS' };
const GRID_COLS = 2;
const GRID_ROWS = 4;

export class StoreScreen {
  constructor() {
    this.activeCategory = 'ball';
    this.previewId = { ball: null, backboard: null, court: null };
    this.confirmTimer = 0; // seconds remaining in the BUY-confirm sub-state
    this.confirmId = null;
  }

  setActiveCategory(cat) {
    if (!CATEGORIES.includes(cat)) return;
    this.activeCategory = cat;
    this.cancelConfirm();
  }

  setPreview(cat, id) {
    this.previewId[cat] = id;
  }

  // Returns the id that should currently appear in the scene for `cat` —
  // the preview if one is set, otherwise the equipped id.
  effectiveId(cat) {
    return this.previewId[cat] || tickets.equipped(cat);
  }

  clearPreviews() {
    this.previewId = { ball: null, backboard: null, court: null };
    this.cancelConfirm();
  }

  startConfirm(id) {
    this.confirmId = id;
    this.confirmTimer = 2.0;
  }

  cancelConfirm() {
    this.confirmId = null;
    this.confirmTimer = 0;
  }

  update(dt) {
    if (this.confirmTimer > 0) {
      this.confirmTimer -= dt;
      if (this.confirmTimer <= 0) this.cancelConfirm();
    }
  }

  // ── Hit-test rects ─────────────────────────────────────────────────

  getBackRect(canvas) {
    return { x: 10, y: 10, w: Math.min(canvas.width * 0.2, 80), h: 36 };
  }

  getBalanceRect(canvas) {
    const w = Math.min(canvas.width * 0.32, 140);
    return { x: canvas.width - w - 10, y: 10, w, h: 36 };
  }

  getTabRects(canvas) {
    const w = canvas.width;
    const tabW = Math.min(w * 0.28, 130);
    const tabH = 36;
    const gap = 8;
    const totalW = tabW * 3 + gap * 2;
    const startX = w / 2 - totalW / 2;
    const y = 58;
    return {
      ball:      { x: startX,                       y, w: tabW, h: tabH },
      backboard: { x: startX + (tabW + gap),        y, w: tabW, h: tabH },
      court:     { x: startX + (tabW + gap) * 2,    y, w: tabW, h: tabH },
    };
  }

  // Grid rect for each card in the active category. Returns an array
  // [{ id, rect }] in catalog order, sized to fit the canvas.
  getItemRects(canvas, category) {
    const list = CATALOG[category] || [];
    const w = canvas.width;
    const h = canvas.height;
    const top = 110;
    const bottom = h - 70;
    const sideMargin = 20;
    const gapX = 12;
    const gapY = 12;
    const cardW = (w - sideMargin * 2 - gapX * (GRID_COLS - 1)) / GRID_COLS;
    const cardH = Math.min(150, (bottom - top - gapY * (GRID_ROWS - 1)) / GRID_ROWS);
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = sideMargin + col * (cardW + gapX);
      const y = top + row * (cardH + gapY);
      out.push({ id: list[i].id, rect: { x, y, w: cardW, h: cardH } });
    }
    return out;
  }

  // BUY/CONFIRM bar at the bottom. Returns up to two rects depending on state.
  getBuyRect(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const btnW = Math.min(w * 0.6, 280);
    return { x: w / 2 - btnW / 2, y: h - 56, w: btnW, h: 44 };
  }

  getConfirmRects(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const totalW = Math.min(w * 0.7, 320);
    const btnW = (totalW - 12) / 2;
    const startX = w / 2 - totalW / 2;
    return {
      yes: { x: startX,             y: h - 56, w: btnW, h: 44 },
      no:  { x: startX + btnW + 12, y: h - 56, w: btnW, h: 44 },
    };
  }

  // ── Hit-test dispatch ──────────────────────────────────────────────

  // Returns one of: 'back', 'tab:<cat>', 'card:<id>', 'buy', 'confirm-yes',
  // 'confirm-no', null. Game maps this to actions.
  hitTest(canvas, x, y, hitTest) {
    if (hitTest(x, y, this.getBackRect(canvas))) return 'back';

    // Confirm sub-state takes priority so a stale BUY rect doesn't swallow
    // the YES/NO tap.
    if (this.confirmTimer > 0) {
      const cr = this.getConfirmRects(canvas);
      if (hitTest(x, y, cr.yes)) return 'confirm-yes';
      if (hitTest(x, y, cr.no)) return 'confirm-no';
    }

    const tabs = this.getTabRects(canvas);
    for (const cat of CATEGORIES) {
      if (hitTest(x, y, tabs[cat])) return `tab:${cat}`;
    }

    const items = this.getItemRects(canvas, this.activeCategory);
    for (const it of items) {
      if (hitTest(x, y, it.rect)) return `card:${it.id}`;
    }

    if (this.confirmTimer === 0 && this._currentBuyActive()) {
      if (hitTest(x, y, this.getBuyRect(canvas))) return 'buy';
    }

    return null;
  }

  // The BUY button only appears for a previewed, unowned, affordable skin.
  _currentBuyActive() {
    const cat = this.activeCategory;
    const id = this.previewId[cat];
    if (!id) return false;
    if (tickets.isOwned(cat, id)) return false;
    const skin = getSkin(cat, id);
    if (!skin) return false;
    return tickets.balance() >= skin.price;
  }

  // ── Render ─────────────────────────────────────────────────────────

  render(ctx, canvas, screens) {
    const w = canvas.width;
    const h = canvas.height;

    // Translucent backdrop so the live 3D scene still shows through.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    ctx.fillRect(0, 0, w, h);

    // Header — BACK · TITLE · TICKETS
    this._renderHeader(ctx, canvas, screens);

    // Tabs
    this._renderTabs(ctx, canvas, screens);

    // Grid
    this._renderGrid(ctx, canvas, screens);

    // Bottom action bar
    if (this.confirmTimer > 0) {
      this._renderConfirm(ctx, canvas, screens);
    } else if (this._currentBuyActive()) {
      this._renderBuy(ctx, canvas, screens);
    } else {
      this._renderHint(ctx, canvas);
    }
  }

  _renderHeader(ctx, canvas, screens) {
    const w = canvas.width;
    ctx.save();

    // BACK
    const back = this.getBackRect(canvas);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.primary;
    ctx.font = 'bold 16px monospace';
    ctx.fillText('← BACK', back.x + 8, back.y + back.h / 2 + 5);

    // Title
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.primary;
    ctx.shadowColor = COLORS.primary;
    ctx.shadowBlur = 12;
    ctx.font = 'bold 26px monospace';
    ctx.fillText('STORE', w / 2, 38);
    ctx.shadowBlur = 0;

    // Balance pill
    const bal = this.getBalanceRect(canvas);
    ctx.fillStyle = 'rgba(255,211,77,0.12)';
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 1.5;
    screens._roundRect(ctx, bal.x, bal.y, bal.w, bal.h, bal.h / 2);
    ctx.fill();
    ctx.stroke();

    // Coin glyph
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(bal.x + 16, bal.y + bal.h / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a5300';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#fff6c0';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${tickets.balance()}`, bal.x + bal.w - 10, bal.y + bal.h / 2 + 6);

    ctx.restore();
  }

  _renderTabs(ctx, canvas, screens) {
    const tabs = this.getTabRects(canvas);
    ctx.save();
    ctx.textAlign = 'center';
    for (const cat of CATEGORIES) {
      const rect = tabs[cat];
      const active = this.activeCategory === cat;
      if (active) {
        ctx.fillStyle = COLORS.primary;
        ctx.strokeStyle = COLORS.primary;
        ctx.lineWidth = 2;
        ctx.shadowColor = COLORS.primary;
        ctx.shadowBlur = 12;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.shadowBlur = 0;
      }
      screens._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = active ? '#000' : 'rgba(255,255,255,0.65)';
      ctx.font = `bold ${active ? 14 : 13}px monospace`;
      ctx.fillText(TAB_LABELS[cat], rect.x + rect.w / 2, rect.y + rect.h / 2 + 5);
    }
    ctx.restore();
  }

  _renderGrid(ctx, canvas, screens) {
    const items = this.getItemRects(canvas, this.activeCategory);
    for (const it of items) {
      const skin = getSkin(this.activeCategory, it.id);
      if (!skin) continue;
      this._renderCard(ctx, it.rect, skin, screens);
    }
  }

  _renderCard(ctx, rect, skin, screens) {
    const cat = this.activeCategory;
    const owned = tickets.isOwned(cat, skin.id);
    const equipped = tickets.isEquipped(cat, skin.id);
    const previewed = this.previewId[cat] === skin.id;
    const rarity = RARITIES[skin.rarity];

    ctx.save();
    // Card background
    let bg = 'rgba(255,255,255,0.04)';
    let border = 'rgba(255,255,255,0.18)';
    let glow = 0;
    if (previewed) { border = COLORS.primary; glow = 14; }
    if (equipped) { border = COLORS.scoreGreen; bg = 'rgba(0,255,65,0.08)'; glow = 10; }
    ctx.fillStyle = bg;
    ctx.strokeStyle = border;
    ctx.lineWidth = previewed || equipped ? 2 : 1;
    if (glow > 0) {
      ctx.shadowColor = border;
      ctx.shadowBlur = glow;
    }
    screens._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Thumbnail panel (upper ~55% of card)
    const thumbRect = {
      x: rect.x + 8, y: rect.y + 8,
      w: rect.w - 16, h: Math.min(rect.h * 0.55, 78),
    };
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    screens._roundRect(ctx, thumbRect.x, thumbRect.y, thumbRect.w, thumbRect.h, 6);
    ctx.fill();
    drawSkinThumbnail(ctx, thumbRect, cat, skin.id);

    // Rarity tag
    ctx.fillStyle = rarity.color;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(rarity.label, rect.x + 10, thumbRect.y + thumbRect.h + 14);

    // Name
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(skin.name.toUpperCase(), rect.x + 10, thumbRect.y + thumbRect.h + 32);

    // CTA / state at card bottom
    const ctaY = rect.y + rect.h - 14;
    if (equipped) {
      ctx.fillStyle = COLORS.scoreGreen;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('EQUIPPED', rect.x + rect.w - 10, ctaY);
    } else if (owned) {
      ctx.fillStyle = COLORS.primary;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('TAP TO EQUIP', rect.x + rect.w - 10, ctaY);
    } else {
      // Coin + price
      const px = rect.x + rect.w - 10;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff6c0';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`${skin.price}`, px, ctaY);
      // Coin glyph just left of the number
      const numW = ctx.measureText(`${skin.price}`).width;
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.arc(px - numW - 10, ctaY - 4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7a5300';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  _renderBuy(ctx, canvas, screens) {
    const cat = this.activeCategory;
    const id = this.previewId[cat];
    const skin = getSkin(cat, id);
    if (!skin) return;
    const r = this.getBuyRect(canvas);
    const pulse = 0.85 + Math.sin(Date.now() * 0.005) * 0.15;
    ctx.save();
    ctx.fillStyle = `rgba(255,211,77,${0.16 * pulse})`;
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ffd34d';
    ctx.shadowBlur = 14 * pulse;
    screens._roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff6c0';
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`BUY  ◉ ${skin.price}`, r.x + r.w / 2, r.y + r.h / 2 + 7);
    ctx.restore();
  }

  _renderConfirm(ctx, canvas, screens) {
    const cat = this.activeCategory;
    const skin = getSkin(cat, this.confirmId);
    if (!skin) return;
    const { yes, no } = this.getConfirmRects(canvas);
    ctx.save();
    ctx.textAlign = 'center';

    // Caption above buttons
    ctx.fillStyle = '#fff6c0';
    ctx.font = '13px monospace';
    ctx.fillText(`Spend ${skin.price} tickets on ${skin.name}?`, canvas.width / 2, yes.y - 8);

    // YES
    ctx.fillStyle = 'rgba(0,255,65,0.18)';
    ctx.strokeStyle = COLORS.scoreGreen;
    ctx.lineWidth = 2;
    screens._roundRect(ctx, yes.x, yes.y, yes.w, yes.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.scoreGreen;
    ctx.font = 'bold 18px monospace';
    ctx.fillText('YES', yes.x + yes.w / 2, yes.y + yes.h / 2 + 7);

    // NO
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    screens._roundRect(ctx, no.x, no.y, no.w, no.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('NO', no.x + no.w / 2, no.y + no.h / 2 + 7);

    ctx.restore();
  }

  _renderHint(ctx, canvas) {
    const cat = this.activeCategory;
    const previewing = this.previewId[cat];
    if (!previewing) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '12px monospace';
      ctx.fillText('Tap a skin to preview', canvas.width / 2, canvas.height - 28);
      ctx.restore();
      return;
    }
    // Previewing an owned skin → hint says tap card to equip; already
    // equipped → just say so quietly.
    if (tickets.isOwned(cat, previewing) && !tickets.isEquipped(cat, previewing)) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '12px monospace';
      ctx.fillText('Tap card again to equip', canvas.width / 2, canvas.height - 28);
      ctx.restore();
    }
  }
}
