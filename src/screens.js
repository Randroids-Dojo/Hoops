// Title, game over, stage clear, name entry, and leaderboard screens

import { COLORS } from './utils.js';
import { tickets } from './tickets.js';
import { StoreScreen } from './storeScreen.js';

// Pause menu button order (top-to-bottom) and their labels. Keep these in
// sync — both render and hit-test iterate PAUSE_MENU_KEYS.
const PAUSE_MENU_KEYS = ['resume', 'settings', 'leaderboard', 'restart', 'quit'];
const PAUSE_MENU_LABELS = {
  resume: 'RESUME',
  settings: 'SETTINGS',
  leaderboard: 'LEADERBOARD',
  restart: 'RESTART',
  quit: 'QUIT',
};

export class Screens {
  constructor() {
    this.titleBouncePhase = 0;
    this.stageClearTimer = 0;
    this.stageClearDuration = 3;
    this.flashAlpha = 0;

    // Name entry state
    this.nameChars = ['A', 'A', 'A'];
    this.namePos = 0; // cursor position 0-2
    this.nameConfirmed = false;

    // Leaderboard state
    this.leaderboardTab = 'alltime'; // 'alltime' or 'daily'
    this.leaderboardScrollY = 0;

    // Store
    this.store = new StoreScreen();
  }

  update(dt) {
    this.titleBouncePhase += dt * 3;
    if (this.flashAlpha > 0) {
      this.flashAlpha -= dt * 3;
      if (this.flashAlpha < 0) this.flashAlpha = 0;
    }
    this.store.update(dt);
  }

  updateStageClear(dt) {
    this.stageClearTimer += dt;
    return this.stageClearTimer >= this.stageClearDuration;
  }

  startStageClear() {
    this.stageClearTimer = 0;
    this.flashAlpha = 1;
  }

  startFlash() {
    this.flashAlpha = 1;
  }

  // --- Name entry helpers ---

  initNameEntry(existingName) {
    this.nameConfirmed = false;
    this.namePos = 0;
    if (existingName && existingName.length > 0) {
      const upper = existingName.toUpperCase();
      this.nameChars = [
        upper[0] || 'A',
        upper[1] || 'A',
        upper[2] || 'A',
      ];
    } else {
      this.nameChars = ['A', 'A', 'A'];
    }
  }

  nameAdvanceCursor() {
    if (this.namePos < 2) {
      this.namePos++;
    } else {
      this.nameConfirmed = true;
    }
  }

  nameBackCursor() {
    if (this.namePos > 0) {
      this.namePos--;
    }
  }

  nameSetChar(char) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
    if (!chars.includes(char)) return;
    this.nameChars[this.namePos] = char;
    if (this.namePos < 2) {
      this.namePos++;
    }
  }

  getEnteredName() {
    return this.nameChars.join('').trim() || 'AAA';
  }

  // --- Leaderboard helpers ---

  toggleLeaderboardTab() {
    this.leaderboardTab = this.leaderboardTab === 'alltime' ? 'daily' : 'alltime';
    this.leaderboardScrollY = 0;
  }

  // --- Hit test helpers for button regions ---

  // Secondary actions row (Leaderboards + Store) shown as smaller side-by-side
  // pills at the bottom of the title screen. Distinct from the prominent mode
  // buttons so they read as a separate group.
  getTitleSecondaryRects(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const totalW = Math.min(w * 0.78, 300);
    const gap = 10;
    const btnW = (totalW - gap) / 2;
    const btnH = 38;
    const startX = w / 2 - totalW / 2;
    const y = h * 0.86 - btnH / 2;
    return {
      leaderboard: { x: startX, y, w: btnW, h: btnH },
      store: { x: startX + btnW + gap, y, w: btnW, h: btnH },
    };
  }

  getTitleLeaderboardRect(canvas) {
    return this.getTitleSecondaryRects(canvas).leaderboard;
  }

  getTitleStoreRect(canvas) {
    return this.getTitleSecondaryRects(canvas).store;
  }

  // Label that introduces the grouped mode buttons. Returned as a rect so
  // layout math can reserve space for it above the stack.
  getTitleModesLabelRect(canvas) {
    const modes = this.getTitleModeRects(canvas);
    return {
      x: modes.classic.x,
      y: modes.classic.y - 32,
      w: modes.classic.w,
      h: 18,
    };
  }

  getTitleModeRects(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const btnW = Math.min(w * 0.72, 280);
    const btnH = 46;
    const gap = 10;
    const groupGap = 32;
    const stackH = btnH * 3 + gap * 2;
    const secondaryTop = this.getTitleSecondaryRects(canvas).leaderboard.y;
    const startY = Math.min(h * 0.52, secondaryTop - stackH - groupGap);
    return {
      classic: { x: w / 2 - btnW / 2, y: startY, w: btnW, h: btnH },
      distance: { x: w / 2 - btnW / 2, y: startY + btnH + gap, w: btnW, h: btnH },
      endless: { x: w / 2 - btnW / 2, y: startY + (btnH + gap) * 2, w: btnW, h: btnH },
    };
  }

  getLeaderboardBackButtonRect(canvas) {
    const w = canvas.width;
    return { x: 10, y: 10, w: Math.min(w * 0.2, 80), h: 36 };
  }

  getLeaderboardModeTabRects(canvas) {
    const w = canvas.width;
    const tabW = Math.min(w * 0.28, 120);
    const tabH = 38;
    const gap = 8;
    const totalW = tabW * 3 + gap * 2;
    const startX = w / 2 - totalW / 2;
    const y = 78;
    return {
      classic: { x: startX, y, w: tabW, h: tabH },
      distance: { x: startX + tabW + gap, y, w: tabW, h: tabH },
      endless: { x: startX + (tabW + gap) * 2, y, w: tabW, h: tabH },
    };
  }

  getLeaderboardTabRects(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const tabW = Math.min(w * 0.34, 140);
    const tabH = 30;
    const y = h - tabH - 16;
    return {
      alltime: { x: w / 2 - tabW, y, w: tabW, h: tabH },
      daily: { x: w / 2, y, w: tabW, h: tabH },
    };
  }

  getNameEntryConfirmRect(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const btnW = Math.min(w * 0.4, 160);
    const btnH = 40;
    return { x: w / 2 - btnW / 2, y: h * 0.72, w: btnW, h: btnH };
  }

  getNameEntryCharRects(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const charW = 50;
    const charH = 60;
    const startX = w / 2 - (charW * 3 + 20) / 2;
    const y = h * 0.48;
    return [
      { x: startX, y, w: charW, h: charH },
      { x: startX + charW + 10, y, w: charW, h: charH },
      { x: startX + charW * 2 + 20, y, w: charW, h: charH },
    ];
  }

  getNameEntrySkipRect(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    return { x: w / 2 - 60, y: h * 0.82, w: 120, h: 30 };
  }

  getRestartButtonRect(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const btnW = Math.min(w * 0.55, 220);
    const btnH = 48;
    // Make sure the title link below still fits inside the canvas — clamp
    // the restart Y up if the canvas is unusually short.
    const titleLinkH = 30;
    const gap = 10;
    const bottomPad = 12;
    const y = Math.min(h * 0.76, h - (btnH + gap + titleLinkH + bottomPad));
    return { x: w / 2 - btnW / 2, y, w: btnW, h: btnH };
  }

  getTitleLinkRect(canvas) {
    const w = canvas.width;
    const btnW = Math.min(w * 0.4, 160);
    const btnH = 30;
    // Anchor below the restart button so the two never overlap regardless
    // of canvas height.
    const restart = this.getRestartButtonRect(canvas);
    const gap = 10;
    const y = Math.min(restart.y + restart.h + gap, canvas.height - btnH - 12);
    return { x: w / 2 - btnW / 2, y, w: btnW, h: btnH };
  }

  // --- Render methods ---

  renderTitle(ctx, canvas) {
    const w = canvas.width;
    const h = canvas.height;

    const titleY = h * 0.3;
    ctx.save();
    ctx.textAlign = 'center';

    // Glow layers
    ctx.shadowColor = COLORS.primary;
    ctx.shadowBlur = 40;
    ctx.fillStyle = COLORS.primary;
    ctx.font = `bold ${Math.min(w * 0.15, 100)}px monospace`;
    ctx.fillText('HOOPS', w / 2, titleY);

    ctx.shadowBlur = 20;
    ctx.fillStyle = COLORS.white;
    ctx.fillText('HOOPS', w / 2, titleY);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.fillStyle = COLORS.secondary;
    ctx.font = `${Math.min(w * 0.035, 20)}px monospace`;
    ctx.fillText('ARCADE BASKETBALL', w / 2, titleY + 40);

    const modes = this.getTitleModeRects(canvas);
    const modesLabel = this.getTitleModesLabelRect(canvas);
    const pulse = 0.86 + Math.sin(Date.now() * 0.004) * 0.14;

    // Group label for the three game modes. Shadow knocks back the busy 3D
    // background so the text stays legible.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 8;
    ctx.font = 'bold 15px monospace';
    ctx.fillText('— GAME MODES —', modesLabel.x + modesLabel.w / 2, modesLabel.y + modesLabel.h);
    ctx.shadowBlur = 0;

    this._drawTitleModeButton(ctx, modes.classic, 'CLASSIC', 'Score attack', COLORS.scoreGreen, pulse);
    this._drawTitleModeButton(ctx, modes.distance, 'DISTANCE', 'Make it further', COLORS.primary, 1);
    this._drawTitleModeButton(ctx, modes.endless, 'ENDLESS', 'Shots add time', '#FFD700', 1);

    // Secondary actions row: Leaderboards + Store. Rendered as smaller, muted
    // ghost pills so they read as a distinct group from the mode buttons.
    const secondary = this.getTitleSecondaryRects(canvas);
    this._drawTitleSecondaryButton(ctx, secondary.leaderboard, 'LEADERBOARDS');
    this._drawTitleSecondaryButton(ctx, secondary.store, 'STORE');

    // Tickets pill anchored just above the STORE button so the player can
    // see at a glance what they can afford. Aligned to the STORE button's
    // right edge so it never overlaps the LEADERBOARDS button.
    this._drawTicketsPill(ctx, secondary.store);

    ctx.restore();
  }

  _drawTicketsPill(ctx, anchorRect) {
    const balance = tickets.balance();
    const text = `${balance}`;
    ctx.save();
    ctx.font = 'bold 12px monospace';
    const numW = ctx.measureText(text).width;
    const padX = 8;
    const coinR = 7;
    const w = numW + coinR * 2 + padX * 2 + 6;
    const h = 22;
    const x = anchorRect.x + anchorRect.w - w;
    const y = anchorRect.y - h - 4;

    ctx.fillStyle = 'rgba(255,211,77,0.16)';
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 1.2;
    this._roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.stroke();

    // Coin glyph
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(x + padX + coinR, y + h / 2, coinR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a5300';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#fff6c0';
    ctx.textAlign = 'left';
    ctx.fillText(text, x + padX + coinR * 2 + 4, y + h / 2 + 4);
    ctx.restore();
  }

  // ── Store screen (delegated) ──────────────────────────────────────
  renderStore(ctx, canvas) {
    this.store.render(ctx, canvas, this);
  }

  _drawTitleSecondaryButton(ctx, rect, label) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 4);
    ctx.restore();
  }

  _drawTitleModeButton(ctx, rect, title, subtitle, color, pulse) {
    ctx.save();
    ctx.fillStyle = `rgba(0, 229, 255, ${0.08 + 0.08 * pulse})`;
    if (color === COLORS.scoreGreen) ctx.fillStyle = `rgba(0, 255, 65, ${0.08 + 0.08 * pulse})`;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * pulse;
    this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = 'bold 17px monospace';
    ctx.fillText(title, rect.x + rect.w / 2, rect.y + 20);
    // Subtitle: bolder, brighter, with a shadow so it reads against the
    // transparent button fill on top of the 3D scene.
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 6;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(subtitle, rect.x + rect.w / 2, rect.y + 36);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  renderGameOver(ctx, canvas, scoring, globalRank, distanceRun = null, endlessRun = null) {
    const w = canvas.width;
    const h = canvas.height;

    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.textAlign = 'center';

    const isDistance = Boolean(distanceRun);
    const isEndless = Boolean(endlessRun);
    const wonDistance = isDistance && distanceRun.result === 'win';
    const title = isEndless ? "TIME'S UP!" : (isDistance ? (wonDistance ? 'YOU WIN!' : 'GAME OVER') : "TIME'S UP!");
    const titleColor = wonDistance ? COLORS.scoreGreen : COLORS.red;

    ctx.fillStyle = titleColor;
    ctx.shadowColor = titleColor;
    ctx.shadowBlur = 20;
    ctx.font = `bold ${Math.min(w * 0.12, 72)}px monospace`;
    ctx.fillText(title, w / 2, h * 0.25);
    ctx.shadowBlur = 0;

    if (isEndless) {
      ctx.fillStyle = COLORS.white;
      ctx.font = '18px monospace';
      ctx.fillText('FINAL SCORE', w / 2, h * 0.37);

      ctx.fillStyle = COLORS.scoreGreen;
      ctx.shadowColor = COLORS.scoreGreen;
      ctx.shadowBlur = 15;
      ctx.font = `bold ${Math.min(w * 0.1, 64)}px monospace`;
      ctx.fillText(`${scoring.totalScore}`, w / 2, h * 0.45);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '16px monospace';
      ctx.fillText(`${formatTime(endlessRun.elapsedMs)} • ${endlessRun.makes}/${endlessRun.shots} makes`, w / 2, h * 0.53);
    } else if (isDistance) {
      ctx.fillStyle = COLORS.white;
      ctx.font = '18px monospace';
      ctx.fillText(wonDistance ? 'FINISH TIME' : 'BEST DISTANCE', w / 2, h * 0.37);

      ctx.fillStyle = wonDistance ? COLORS.scoreGreen : COLORS.primary;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 15;
      ctx.font = `bold ${Math.min(w * 0.09, 54)}px monospace`;
      ctx.fillText(wonDistance ? formatTime(distanceRun.winTimeMs) : `${Math.round(distanceRun.progress * 100)}%`, w / 2, h * 0.45);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '16px monospace';
      ctx.fillText(`${distanceRun.makes}/${distanceRun.shots} makes`, w / 2, h * 0.53);
    } else {
      ctx.fillStyle = COLORS.white;
      ctx.font = '18px monospace';
      ctx.fillText('FINAL SCORE', w / 2, h * 0.37);

      ctx.fillStyle = COLORS.scoreGreen;
      ctx.shadowColor = COLORS.scoreGreen;
      ctx.shadowBlur = 15;
      ctx.font = `bold ${Math.min(w * 0.1, 64)}px monospace`;
      ctx.fillText(`${scoring.totalScore}`, w / 2, h * 0.45);
      ctx.shadowBlur = 0;

      ctx.fillStyle = COLORS.primary;
      ctx.font = '20px monospace';
      ctx.fillText(`Stage ${scoring.stageNum} reached`, w / 2, h * 0.53);
    }

    if (!isDistance && !isEndless && scoring.isHighScore()) {
      const hsAlpha = 0.5 + Math.sin(Date.now() * 0.005) * 0.5;
      ctx.globalAlpha = hsAlpha;
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('NEW HIGH SCORE!', w / 2, h * 0.60);
      ctx.globalAlpha = 1;
    }

    // Global rank
    if (globalRank) {
      ctx.fillStyle = COLORS.primary;
      ctx.font = 'bold 18px monospace';
      ctx.fillText(`GLOBAL RANK: #${globalRank}`, w / 2, h * 0.67);
    }

    // Tickets earned this run — collapsed by reason. Only render if the
    // player actually earned something so cleared/exited runs stay tidy.
    this._renderTicketsEarned(ctx, canvas);

    // RESTART button
    const btn = this.getRestartButtonRect(canvas);
    const pulse = 0.85 + Math.sin(Date.now() * 0.004) * 0.15;
    ctx.fillStyle = `rgba(0, 255, 65, ${0.18 * pulse})`;
    ctx.strokeStyle = COLORS.scoreGreen;
    ctx.lineWidth = 2;
    ctx.shadowColor = COLORS.scoreGreen;
    ctx.shadowBlur = 14 * pulse;
    this._roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = COLORS.scoreGreen;
    ctx.font = 'bold 22px monospace';
    ctx.fillText(isDistance && !wonDistance ? 'TRY AGAIN' : 'RESTART', w / 2, btn.y + btn.h / 2 + 8);

    // Back-to-title link
    const link = this.getTitleLinkRect(canvas);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '14px monospace';
    ctx.fillText('BACK TO TITLE', w / 2, link.y + link.h / 2 + 5);

    ctx.restore();
  }

  renderNameEntry(ctx, canvas, score, stage, distanceRun = null, endlessRun = null) {
    const w = canvas.width;
    const h = canvas.height;

    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.textAlign = 'center';

    // Title
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 15;
    ctx.font = `bold ${Math.min(w * 0.08, 42)}px monospace`;
    ctx.fillText('ENTER YOUR NAME', w / 2, h * 0.22);
    ctx.shadowBlur = 0;

    ctx.fillStyle = COLORS.scoreGreen;
    ctx.font = 'bold 28px monospace';
    if (endlessRun) {
      ctx.fillText(`SCORE: ${score}`, w / 2, h * 0.33);
      ctx.fillStyle = COLORS.primary;
      ctx.font = '16px monospace';
      ctx.fillText(`${formatTime(endlessRun.elapsedMs)} • ${endlessRun.makes}/${endlessRun.shots} makes`, w / 2, h * 0.38);
    } else if (distanceRun) {
      ctx.fillText(`TIME: ${formatTime(distanceRun.winTimeMs)}`, w / 2, h * 0.33);
      ctx.fillStyle = COLORS.primary;
      ctx.font = '16px monospace';
      ctx.fillText(`${distanceRun.makes}/${distanceRun.shots} makes`, w / 2, h * 0.38);
    } else {
      ctx.fillText(`SCORE: ${score}`, w / 2, h * 0.33);
      ctx.fillStyle = COLORS.primary;
      ctx.font = '16px monospace';
      ctx.fillText(`Stage ${stage}`, w / 2, h * 0.38);
    }

    // Character slots
    const charRects = this.getNameEntryCharRects(canvas);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';

    for (let i = 0; i < 3; i++) {
      const r = charRects[i];
      const isActive = i === this.namePos;

      // Slot background
      ctx.fillStyle = isActive ? 'rgba(0, 229, 255, 0.2)' : 'rgba(255,255,255,0.05)';
      ctx.strokeStyle = isActive ? COLORS.primary : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = isActive ? 3 : 1;
      this._roundRect(ctx, r.x, r.y, r.w, r.h, 8);
      ctx.fill();
      ctx.stroke();

      // Character
      ctx.fillStyle = isActive ? COLORS.white : 'rgba(255,255,255,0.7)';
      ctx.font = `bold 36px monospace`;
      ctx.fillText(this.nameChars[i], r.x + r.w / 2, r.y + r.h / 2 + 12);
    }

    // Confirm button
    const confirmRect = this.getNameEntryConfirmRect(canvas);
    ctx.fillStyle = 'rgba(0, 255, 65, 0.2)';
    ctx.strokeStyle = COLORS.scoreGreen;
    ctx.lineWidth = 2;
    this._roundRect(ctx, confirmRect.x, confirmRect.y, confirmRect.w, confirmRect.h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COLORS.scoreGreen;
    ctx.font = 'bold 18px monospace';
    ctx.fillText('SUBMIT', w / 2, confirmRect.y + confirmRect.h / 2 + 6);

    // Skip button
    const skipRect = this.getNameEntrySkipRect(canvas);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '14px monospace';
    ctx.fillText('SKIP', w / 2, skipRect.y + skipRect.h / 2 + 5);

    ctx.restore();
  }

  renderLeaderboard(ctx, canvas, leaderboard) {
    const w = canvas.width;
    const h = canvas.height;

    // Full dark background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.textAlign = 'center';

    // Title
    ctx.fillStyle = COLORS.primary;
    ctx.shadowColor = COLORS.primary;
    ctx.shadowBlur = 20;
    ctx.font = `bold ${Math.min(w * 0.07, 34)}px monospace`;
    ctx.fillText('LEADERBOARDS', w / 2, 48);
    ctx.shadowBlur = 0;

    // Back button
    const backBtn = this.getLeaderboardBackButtonRect(canvas);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.primary;
    ctx.font = 'bold 16px monospace';
    ctx.fillText('\u2190 BACK', backBtn.x + 8, backBtn.y + backBtn.h / 2 + 5);

    // Mode tabs (classic / distance / endless) — primary navigation,
    // filled-pill style with mode accent color when active.
    ctx.textAlign = 'center';
    const modeTabs = this.getLeaderboardModeTabRects(canvas);
    const modeLabels = { classic: 'CLASSIC', distance: 'DISTANCE', endless: 'ENDLESS' };
    const modeColors = { classic: COLORS.scoreGreen, distance: COLORS.primary, endless: '#FFD700' };
    for (const [key, rect] of Object.entries(modeTabs)) {
      const isActive = leaderboard.mode === key;
      const accent = modeColors[key];
      if (isActive) {
        ctx.fillStyle = accent;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 16;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        ctx.shadowBlur = 0;
      }
      this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = isActive ? '#000' : 'rgba(255,255,255,0.55)';
      ctx.font = `bold ${isActive ? 14 : 13}px monospace`;
      ctx.fillText(modeLabels[key], rect.x + rect.w / 2, rect.y + rect.h / 2 + 5);
    }

    // Time tabs (alltime / daily) — secondary filter at the bottom,
    // rendered as a connected segmented control to set them apart.
    const tabs = this.getLeaderboardTabRects(canvas);
    const tabKeys = ['alltime', 'daily'];
    const segLeft = tabs.alltime.x;
    const segTop = tabs.alltime.y;
    const segW = tabs.alltime.w + tabs.daily.w;
    const segH = tabs.alltime.h;

    // Outer container
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, segLeft, segTop, segW, segH, segH / 2);
    ctx.fill();
    ctx.stroke();

    for (const key of tabKeys) {
      const rect = tabs[key];
      const isActive = this.leaderboardTab === key;
      if (isActive) {
        ctx.save();
        // Clip to outer container so the pill fits the rounded shape
        this._roundRect(ctx, segLeft, segTop, segW, segH, segH / 2);
        ctx.clip();
        ctx.fillStyle = COLORS.primary;
        this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, segH / 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.fillStyle = isActive ? '#000' : 'rgba(255,255,255,0.55)';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(key === 'alltime' ? 'ALL TIME' : 'TODAY', rect.x + rect.w / 2, rect.y + rect.h / 2 + 5);
    }

    // Entries
    const entries = this.leaderboardTab === 'daily'
      ? (leaderboard.dailyEntries || [])
      : (leaderboard.allTimeEntries || []);

    const startY = 144;
    const rowH = 32;
    const bottomReserve = 90; // time tabs + swipe hint + padding
    const maxVisible = Math.floor((h - startY - bottomReserve) / rowH);

    if (leaderboard.loading) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '18px monospace';
      ctx.fillText('Loading...', w / 2, h * 0.5);
    } else if (leaderboard.error) {
      ctx.fillStyle = COLORS.red;
      ctx.font = '16px monospace';
      ctx.fillText(leaderboard.error, w / 2, h * 0.45);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '14px monospace';
      ctx.fillText('Check connection and try again', w / 2, h * 0.52);
    } else if (entries.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '18px monospace';
      ctx.fillText('No scores yet!', w / 2, h * 0.45);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '14px monospace';
      ctx.fillText('Be the first to set a score', w / 2, h * 0.52);
    } else {
      // Header row
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      const colRank = w * 0.12;
      const colName = w * 0.35;
      const colScore = w * 0.62;
      const colStage = w * 0.85;
      const isDistanceMode = leaderboard.mode === 'distance';
      const isEndlessMode = leaderboard.mode === 'endless';

      let primaryHeader = 'SCORE';
      let secondaryHeader = 'STG';
      if (isDistanceMode) {
        primaryHeader = 'TIME';
        secondaryHeader = 'MK';
      } else if (isEndlessMode) {
        primaryHeader = 'MK';
        secondaryHeader = 'AT';
      }

      ctx.textAlign = 'center';
      ctx.fillText('#', colRank, startY);
      ctx.textAlign = 'left';
      ctx.fillText('NAME', colName - 30, startY);
      ctx.textAlign = 'right';
      ctx.fillText(primaryHeader, colScore + 20, startY);
      ctx.fillText(secondaryHeader, colStage + 10, startY);

      // Divider
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w * 0.05, startY + 8);
      ctx.lineTo(w * 0.95, startY + 8);
      ctx.stroke();

      // Rows
      const visible = entries.slice(0, maxVisible);
      for (let i = 0; i < visible.length; i++) {
        const entry = visible[i];
        const y = startY + (i + 1) * rowH + 8;
        const rank = i + 1;

        // Highlight top 3
        let rowColor = 'rgba(255,255,255,0.7)';
        let rankColor = 'rgba(255,255,255,0.5)';
        if (rank === 1) {
          rowColor = '#FFD700';
          rankColor = '#FFD700';
        } else if (rank === 2) {
          rowColor = '#C0C0C0';
          rankColor = '#C0C0C0';
        } else if (rank === 3) {
          rowColor = '#CD7F32';
          rankColor = '#CD7F32';
        }

        // Subtle row background for top 3
        if (rank <= 3) {
          ctx.fillStyle = `rgba(255,255,255,0.03)`;
          ctx.fillRect(w * 0.05, y - rowH + 10, w * 0.9, rowH);
        }

        ctx.font = rank <= 3 ? 'bold 15px monospace' : '14px monospace';

        // Rank
        ctx.textAlign = 'center';
        ctx.fillStyle = rankColor;
        ctx.fillText(`${rank}`, colRank, y);

        // Name
        ctx.textAlign = 'left';
        ctx.fillStyle = rowColor;
        ctx.fillText(entry.name || '???', colName - 30, y);

        // Primary value (score / time / makes)
        ctx.textAlign = 'right';
        ctx.fillStyle = COLORS.scoreGreen;
        ctx.font = rank <= 3 ? 'bold 15px monospace' : '14px monospace';
        ctx.fillText(isDistanceMode ? formatTime(entry.score) : `${entry.score}`, colScore + 20, y);

        // Secondary value (stage / makes / attempts)
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '13px monospace';
        let secondaryValue;
        if (isDistanceMode) {
          secondaryValue = `${entry.meta?.makes ?? '-'}`;
        } else if (isEndlessMode) {
          secondaryValue = `${entry.meta?.shots ?? '-'}`;
        } else {
          secondaryValue = `${entry.stage || '-'}`;
        }
        ctx.fillText(secondaryValue, colStage + 10, y);
      }
    }

    ctx.restore();
  }

  renderStageClear(ctx, canvas, scoring) {
    const w = canvas.width;
    const h = canvas.height;

    // Flash effect
    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha * 0.5})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.save();
    ctx.textAlign = 'center';

    // STAGE CLEAR
    const scale = Math.min(1, this.stageClearTimer * 3);
    ctx.save();
    ctx.translate(w / 2, h * 0.35);
    ctx.scale(scale, scale);
    ctx.fillStyle = COLORS.scoreGreen;
    ctx.shadowColor = COLORS.scoreGreen;
    ctx.shadowBlur = 25;
    ctx.font = `bold ${Math.min(w * 0.1, 60)}px monospace`;
    ctx.fillText('STAGE CLEAR!', 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Stage score summary
    if (this.stageClearTimer > 0.5) {
      ctx.fillStyle = COLORS.white;
      ctx.font = '18px monospace';
      ctx.fillText(`Stage ${scoring.stageNum} Score: ${scoring.stageScore}`, w / 2, h * 0.48);
      ctx.fillText(`Total: ${scoring.totalScore}`, w / 2, h * 0.54);
    }

    // Next stage countdown
    if (this.stageClearTimer > 1) {
      const remaining = Math.ceil(this.stageClearDuration - this.stageClearTimer);
      ctx.fillStyle = COLORS.primary;
      ctx.font = '16px monospace';
      ctx.fillText(`Next stage in ${remaining}...`, w / 2, h * 0.64);
    }

    ctx.restore();
  }

  // --- Pause menu ---

  // Vertical stack of buttons centered on the screen. Order is preserved by
  // PAUSE_MENU_KEYS so render and hit-test agree.
  getPauseMenuRects(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const btnW = Math.min(w * 0.6, 260);
    const btnH = 44;
    const gap = 12;
    const totalH = btnH * PAUSE_MENU_KEYS.length + gap * (PAUSE_MENU_KEYS.length - 1);
    const startY = (h - totalH) / 2 + h * 0.04; // nudge below the "PAUSED" title
    const rects = {};
    for (let i = 0; i < PAUSE_MENU_KEYS.length; i++) {
      const key = PAUSE_MENU_KEYS[i];
      rects[key] = {
        x: w / 2 - btnW / 2,
        y: startY + i * (btnH + gap),
        w: btnW,
        h: btnH,
      };
    }
    return rects;
  }

  renderPause(ctx, canvas) {
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.primary;
    ctx.shadowColor = COLORS.primary;
    ctx.shadowBlur = 18;
    ctx.font = `bold ${Math.min(w * 0.1, 56)}px monospace`;
    const rects = this.getPauseMenuRects(canvas);
    const titleY = Math.max(h * 0.18, rects.resume.y - 36);
    ctx.fillText('PAUSED', w / 2, titleY);
    ctx.shadowBlur = 0;

    for (const key of PAUSE_MENU_KEYS) {
      const r = rects[key];
      const isQuit = key === 'quit';
      const borderColor = isQuit ? COLORS.red : COLORS.primary;
      const fillColor = isQuit ? 'rgba(230, 57, 70, 0.10)' : 'rgba(0, 229, 255, 0.12)';

      ctx.fillStyle = fillColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2;
      this._roundRect(ctx, r.x, r.y, r.w, r.h, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = borderColor;
      ctx.font = 'bold 16px monospace';
      ctx.fillText(PAUSE_MENU_LABELS[key], r.x + r.w / 2, r.y + r.h / 2 + 6);
    }

    ctx.restore();
  }

  // --- Settings screen ---

  getSettingsRects(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const btnW = Math.min(w * 0.6, 280);
    const btnH = 48;
    const backW = Math.min(w * 0.4, 160);
    const backH = 40;
    return {
      powerSide: { x: w / 2 - btnW / 2, y: h * 0.42, w: btnW, h: btnH },
      back: { x: w / 2 - backW / 2, y: h * 0.72, w: backW, h: backH },
    };
  }

  renderSettings(ctx, canvas, settings) {
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.textAlign = 'center';

    // Title
    ctx.fillStyle = COLORS.primary;
    ctx.shadowColor = COLORS.primary;
    ctx.shadowBlur = 18;
    ctx.font = `bold ${Math.min(w * 0.08, 44)}px monospace`;
    ctx.fillText('SETTINGS', w / 2, h * 0.22);
    ctx.shadowBlur = 0;

    const rects = this.getSettingsRects(canvas);

    // Section label
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '13px monospace';
    ctx.fillText('POWER METER SIDE', w / 2, rects.powerSide.y - 14);

    // Power meter side toggle — shows current value, tapping flips it.
    const side = settings.powerMeterSide === 'left' ? 'LEFT' : 'RIGHT';
    const r = rects.powerSide;
    ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
    ctx.strokeStyle = COLORS.primary;
    ctx.lineWidth = 2;
    this._roundRect(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 18px monospace';
    ctx.fillText(side, w / 2, r.y + r.h / 2 + 7);

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px monospace';
    ctx.fillText('TAP TO TOGGLE', w / 2, r.y + r.h + 16);

    // Back button
    const back = rects.back;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.strokeStyle = COLORS.primary;
    ctx.lineWidth = 2;
    this._roundRect(ctx, back.x, back.y, back.w, back.h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COLORS.primary;
    ctx.font = 'bold 15px monospace';
    ctx.fillText('BACK', w / 2, back.y + back.h / 2 + 5);

    ctx.restore();
  }

  _renderTicketsEarned(ctx, canvas) {
    const total = tickets.getRunTotal();
    if (total <= 0) return;
    const balance = tickets.balance();
    const w = canvas.width;
    const h = canvas.height;

    // Render as a compact pill below the global rank, above the restart
    // button. Keeps the existing layout intact while still telling the
    // player how much they earned this run.
    const text = `+${total} TICKETS`;
    const balText = `BALANCE  ◉ ${balance}`;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px monospace';
    const tw = ctx.measureText(text).width;
    const padX = 14;
    const pillW = tw + padX * 2;
    const pillH = 26;
    const pillY = h * 0.7;
    const pillX = w / 2 - pillW / 2;

    ctx.fillStyle = 'rgba(255,211,77,0.14)';
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#ffd34d';
    ctx.shadowBlur = 8;
    this._roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#fff6c0';
    ctx.fillText(text, w / 2, pillY + pillH / 2 + 6);

    // Balance line just below the pill so the player sees what they have to
    // spend in the Store.
    ctx.fillStyle = 'rgba(255,211,77,0.7)';
    ctx.font = '12px monospace';
    ctx.fillText(balText, w / 2, pillY + pillH + 14);
    ctx.restore();
  }

  // --- Helpers ---

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  _hitTest(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }
}

function formatTime(ms) {
  const totalMs = Math.max(0, Math.round(Number(ms) || 0));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const tenths = Math.floor((totalMs % 1000) / 100);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
}
