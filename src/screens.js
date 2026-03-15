// Title, game over, stage clear, name entry, and leaderboard screens

import { COLORS } from './utils.js';

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
    this.nameScrollCooldown = 0;

    // Leaderboard state
    this.leaderboardTab = 'alltime'; // 'alltime' or 'daily'
    this.leaderboardScrollY = 0;
  }

  update(dt) {
    this.titleBouncePhase += dt * 3;
    if (this.flashAlpha > 0) {
      this.flashAlpha -= dt * 3;
      if (this.flashAlpha < 0) this.flashAlpha = 0;
    }
    if (this.nameScrollCooldown > 0) {
      this.nameScrollCooldown -= dt;
    }
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

  nameScrollUp() {
    if (this.nameScrollCooldown > 0) return;
    const c = this.nameChars[this.namePos];
    const code = c.charCodeAt(0);
    // Cycle A-Z, 0-9, space
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
    const idx = chars.indexOf(c);
    this.nameChars[this.namePos] = chars[(idx + 1) % chars.length];
    this.nameScrollCooldown = 0.12;
  }

  nameScrollDown() {
    if (this.nameScrollCooldown > 0) return;
    const c = this.nameChars[this.namePos];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
    const idx = chars.indexOf(c);
    this.nameChars[this.namePos] = chars[(idx - 1 + chars.length) % chars.length];
    this.nameScrollCooldown = 0.12;
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

  getEnteredName() {
    return this.nameChars.join('').trim() || 'AAA';
  }

  // --- Leaderboard helpers ---

  toggleLeaderboardTab() {
    this.leaderboardTab = this.leaderboardTab === 'alltime' ? 'daily' : 'alltime';
    this.leaderboardScrollY = 0;
  }

  // --- Hit test helpers for button regions ---

  getLeaderboardButtonRect(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const btnW = Math.min(w * 0.5, 200);
    const btnH = 36;
    return {
      x: w / 2 - btnW / 2,
      y: h * 0.86 - btnH / 2,
      w: btnW,
      h: btnH,
    };
  }

  getLeaderboardBackButtonRect(canvas) {
    const w = canvas.width;
    return { x: 10, y: 10, w: Math.min(w * 0.2, 80), h: 36 };
  }

  getLeaderboardTabRects(canvas) {
    const w = canvas.width;
    const tabW = Math.min(w * 0.3, 120);
    const tabH = 32;
    const y = 60;
    return {
      alltime: { x: w / 2 - tabW - 4, y, w: tabW, h: tabH },
      daily: { x: w / 2 + 4, y, w: tabW, h: tabH },
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

  // --- Render methods ---

  renderTitle(ctx, canvas, bestScore) {
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

    // Bouncing ball icon
    const ballY = h * 0.48 + Math.abs(Math.sin(this.titleBouncePhase)) * 20;
    ctx.fillStyle = COLORS.basketball;
    ctx.beginPath();
    ctx.arc(w / 2, ballY, 18, 0, Math.PI * 2);
    ctx.fill();

    // Ball seams
    ctx.strokeStyle = COLORS.seamBlack;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(w / 2, ballY, 18, 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(w / 2, ballY, 3, 18, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Ball shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.48 + 30, 14, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tap to play prompt (pulsing)
    const promptAlpha = 0.5 + Math.sin(Date.now() * 0.004) * 0.5;
    ctx.globalAlpha = promptAlpha;
    ctx.fillStyle = COLORS.white;
    ctx.font = `bold ${Math.min(w * 0.04, 22)}px monospace`;

    const isMobile = 'ontouchstart' in window;
    ctx.fillText(isMobile ? 'TAP TO PLAY' : 'CLICK TO PLAY', w / 2, h * 0.65);
    ctx.globalAlpha = 1;

    // High score
    if (bestScore > 0) {
      ctx.fillStyle = COLORS.scoreGreen;
      ctx.shadowColor = COLORS.scoreGreen;
      ctx.shadowBlur = 8;
      ctx.font = '16px monospace';
      ctx.fillText(`BEST: ${bestScore}`, w / 2, h * 0.75);
      ctx.shadowBlur = 0;
    }

    // Leaderboard button
    const btn = this.getLeaderboardButtonRect(canvas);
    ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
    ctx.strokeStyle = COLORS.primary;
    ctx.lineWidth = 2;
    this._roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COLORS.primary;
    ctx.font = 'bold 16px monospace';
    ctx.fillText('LEADERBOARD', w / 2, btn.y + btn.h / 2 + 5);

    // Sound toggle hint
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px monospace';
    ctx.fillText('Press M to toggle sound', w / 2, h * 0.95);

    ctx.restore();
  }

  renderGameOver(ctx, canvas, scoring, globalRank) {
    const w = canvas.width;
    const h = canvas.height;

    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.textAlign = 'center';

    // TIME'S UP
    ctx.fillStyle = COLORS.red;
    ctx.shadowColor = COLORS.red;
    ctx.shadowBlur = 20;
    ctx.font = `bold ${Math.min(w * 0.12, 72)}px monospace`;
    ctx.fillText("TIME'S UP!", w / 2, h * 0.25);
    ctx.shadowBlur = 0;

    // Final score
    ctx.fillStyle = COLORS.white;
    ctx.font = '18px monospace';
    ctx.fillText('FINAL SCORE', w / 2, h * 0.37);

    ctx.fillStyle = COLORS.scoreGreen;
    ctx.shadowColor = COLORS.scoreGreen;
    ctx.shadowBlur = 15;
    ctx.font = `bold ${Math.min(w * 0.1, 64)}px monospace`;
    ctx.fillText(`${scoring.totalScore}`, w / 2, h * 0.45);
    ctx.shadowBlur = 0;

    // Stage reached
    ctx.fillStyle = COLORS.primary;
    ctx.font = '20px monospace';
    ctx.fillText(`Stage ${scoring.stageNum} reached`, w / 2, h * 0.53);

    // High score indicator
    if (scoring.isHighScore()) {
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

    // Restart prompt
    const promptAlpha = 0.5 + Math.sin(Date.now() * 0.004) * 0.5;
    ctx.globalAlpha = promptAlpha;
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 20px monospace';
    const isMobile = 'ontouchstart' in window;
    ctx.fillText(isMobile ? 'TAP TO RESTART' : 'CLICK TO RESTART', w / 2, h * 0.78);
    ctx.globalAlpha = 1;

    // View leaderboard hint
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '14px monospace';
    ctx.fillText('Press L to view leaderboard', w / 2, h * 0.88);

    ctx.restore();
  }

  renderNameEntry(ctx, canvas, score, stage) {
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

    // Score display
    ctx.fillStyle = COLORS.scoreGreen;
    ctx.font = 'bold 28px monospace';
    ctx.fillText(`SCORE: ${score}`, w / 2, h * 0.33);
    ctx.fillStyle = COLORS.primary;
    ctx.font = '16px monospace';
    ctx.fillText(`Stage ${stage}`, w / 2, h * 0.38);

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

      // Up arrow
      if (isActive) {
        ctx.fillStyle = COLORS.primary;
        ctx.font = '18px monospace';
        ctx.fillText('\u25B2', r.x + r.w / 2, r.y - 8);
        ctx.fillText('\u25BC', r.x + r.w / 2, r.y + r.h + 22);
      }

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

    // Controls hint
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '12px monospace';
    const isMobile = 'ontouchstart' in window;
    if (isMobile) {
      ctx.fillText('Tap arrows to change \u2022 Tap letter to advance', w / 2, h * 0.79);
    } else {
      ctx.fillText('\u2191\u2193 change letter \u2022 \u2192 next \u2022 ENTER submit', w / 2, h * 0.79);
    }

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
    ctx.font = `bold ${Math.min(w * 0.08, 40)}px monospace`;
    ctx.fillText('LEADERBOARD', w / 2, 42);
    ctx.shadowBlur = 0;

    // Back button
    const backBtn = this.getLeaderboardBackButtonRect(canvas);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.primary;
    ctx.font = 'bold 16px monospace';
    ctx.fillText('\u2190 BACK', backBtn.x + 8, backBtn.y + backBtn.h / 2 + 5);

    // Tabs
    ctx.textAlign = 'center';
    const tabs = this.getLeaderboardTabRects(canvas);

    for (const [key, rect] of Object.entries(tabs)) {
      const isActive = this.leaderboardTab === key;
      ctx.fillStyle = isActive ? 'rgba(0, 229, 255, 0.25)' : 'rgba(255,255,255,0.05)';
      ctx.strokeStyle = isActive ? COLORS.primary : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = isActive ? 2 : 1;
      this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isActive ? COLORS.primary : 'rgba(255,255,255,0.5)';
      ctx.font = `bold 14px monospace`;
      ctx.fillText(key === 'alltime' ? 'ALL TIME' : 'TODAY', rect.x + rect.w / 2, rect.y + rect.h / 2 + 5);
    }

    // Entries
    const entries = this.leaderboardTab === 'daily'
      ? (leaderboard.dailyEntries || [])
      : (leaderboard.allTimeEntries || []);

    const startY = 110;
    const rowH = 32;
    const maxVisible = Math.floor((h - startY - 40) / rowH);

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

      ctx.textAlign = 'center';
      ctx.fillText('#', colRank, startY);
      ctx.textAlign = 'left';
      ctx.fillText('NAME', colName - 30, startY);
      ctx.textAlign = 'right';
      ctx.fillText('SCORE', colScore + 20, startY);
      ctx.fillText('STG', colStage + 10, startY);

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

        // Score
        ctx.textAlign = 'right';
        ctx.fillStyle = COLORS.scoreGreen;
        ctx.font = rank <= 3 ? 'bold 15px monospace' : '14px monospace';
        ctx.fillText(`${entry.score}`, colScore + 20, y);

        // Stage
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '13px monospace';
        ctx.fillText(`${entry.stage || '-'}`, colStage + 10, y);
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

  renderPause(ctx, canvas) {
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.primary;
    ctx.font = `bold ${Math.min(w * 0.1, 60)}px monospace`;
    ctx.fillText('PAUSED', w / 2, h * 0.45);

    ctx.fillStyle = COLORS.white;
    ctx.font = '18px monospace';
    ctx.fillText('Press ESC or tap to resume', w / 2, h * 0.55);
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
