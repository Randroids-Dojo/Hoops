// HUD overlay - score, time, stage, streak, notifications

import { COLORS, BONUS_TIME_THRESHOLD } from './utils.js';
import { tickets } from './tickets.js';
import * as coinAnim from './coinAnim.js';

export class HUD {
  constructor() {
    this.notifications = []; // { text, timer, maxTimer }
    coinAnim.setInitialBalance(tickets.balance());
  }

  addNotification(text, duration = 0.8) {
    this.notifications.push({ text, timer: duration, maxTimer: duration });
  }

  update(dt) {
    for (let i = this.notifications.length - 1; i >= 0; i--) {
      this.notifications[i].timer -= dt;
      if (this.notifications[i].timer <= 0) {
        this.notifications.splice(i, 1);
      }
    }
    coinAnim.update(dt);
  }

  // The persistent ticket counter rect — used by the coin animation as the
  // destination for flying sprites. Anchored under STAGE in the top-right.
  getTicketCounterRect(canvas) {
    const padding = 20;
    const w = 110;
    const h = 26;
    return { x: canvas.width - padding - w, y: padding + 60, w, h };
  }

  _drawTicketCounter(ctx, canvas) {
    const rect = this.getTicketCounterRect(canvas);
    coinAnim.setCounterDst(rect.x + rect.w / 2, rect.y + rect.h / 2);

    const balance = coinAnim.getDisplayedBalance();
    const pulse = coinAnim.getPulseFactor();

    ctx.save();
    // Pill background
    ctx.fillStyle = 'rgba(255,211,77,0.12)';
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 1.2;
    this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
    ctx.fill();
    ctx.stroke();

    // Coin glyph
    const coinR = 9;
    const coinCX = rect.x + 6 + coinR;
    const coinCY = rect.y + rect.h / 2;
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(coinCX, coinCY, coinR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a5300';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Numeric balance with pulse-scale
    ctx.translate(rect.x + rect.w - 10, rect.y + rect.h / 2 + 5);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#fff6c0';
    ctx.textAlign = 'right';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`${balance}`, 0, 0);
    ctx.restore();
  }

  // Render the persistent ticket counter and any in-flight coin sprites.
  // Safe to call from any in-game HUD (Classic/Distance/Endless).
  renderTicketsOverlay(ctx, canvas) {
    this._drawTicketCounter(ctx, canvas);
    coinAnim.render(ctx);
  }

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

  render(ctx, canvas, scoring) {
    const w = canvas.width;
    const h = canvas.height;
    const padding = 20;

    // TARGET (top-left)
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px monospace';
    ctx.fillText('TARGET', padding, padding + 14);
    ctx.fillStyle = COLORS.primary;
    ctx.font = 'bold 28px monospace';
    ctx.fillText(`${scoring.stageData.target} PTS`, padding, padding + 44);

    // STAGE (top-right)
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px monospace';
    ctx.fillText('STAGE', w - padding, padding + 14);
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 28px monospace';
    ctx.fillText(`${scoring.stageNum}`, w - padding, padding + 44);

    // TIME (top-center)
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px monospace';
    ctx.fillText('TIME', w / 2, padding + 14);

    const timeColor = scoring.timeRemaining <= BONUS_TIME_THRESHOLD ? COLORS.red : COLORS.white;
    ctx.fillStyle = timeColor;
    ctx.font = 'bold 32px monospace';
    const totalSecs = Math.ceil(scoring.timeRemaining);
    const minutes = Math.floor(totalSecs / 60);
    const seconds = totalSecs % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    ctx.fillText(timeStr, w / 2, padding + 48);

    // Bonus time indicator
    if (scoring.bonusTimeActive) {
      ctx.fillStyle = COLORS.red;
      ctx.font = 'bold 16px monospace';
      ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.01) * 0.5;
      ctx.fillText('BONUS TIME! PTS x2', w / 2, padding + 70);
      ctx.globalAlpha = 1;

      // Edge pulse
      this._drawEdgePulse(ctx, w, h);
    }

    // SCORE (displayed on/near backboard - green digital)
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.scoreGreen;
    ctx.shadowColor = COLORS.scoreGreen;
    ctx.shadowBlur = 10;
    ctx.font = 'bold 48px monospace';
    ctx.fillText(`${scoring.stageScore}`, w / 2, h * 0.16);
    ctx.shadowBlur = 0;

    // Score label
    ctx.fillStyle = 'rgba(0, 255, 65, 0.4)';
    ctx.font = '12px monospace';
    ctx.fillText('SCORE', w / 2, h * 0.12);

    // Total score (smaller, below stage score)
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '14px monospace';
    ctx.fillText(`TOTAL: ${scoring.totalScore}`, w / 2, h * 0.19);

    // STREAK (right side)
    if (scoring.streak > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = this._getStreakColor(scoring.getStreakLevel());
      ctx.font = 'bold 36px monospace';
      ctx.fillText(`${scoring.streak}`, w - padding, h * 0.45);

      const streakLabel = scoring.getStreakLabel();
      if (streakLabel) {
        ctx.font = 'bold 14px monospace';
        ctx.fillText(streakLabel, w - padding, h * 0.45 + 22);
      }

      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '12px monospace';
      ctx.fillText('STREAK', w - padding, h * 0.45 - 22);
    }

    // Persistent ticket counter + flying coins
    this.renderTicketsOverlay(ctx, canvas);

    // Notifications (center screen, pop-up text)
    this._renderNotifications(ctx, w, h);
  }

  _getStreakColor(level) {
    if (level >= 4) return '#FF00FF';
    if (level >= 3) return '#FF2200';
    if (level >= 2) return '#FF4500';
    if (level >= 1) return '#FF8C00';
    return COLORS.white;
  }

  _renderNotifications(ctx, w, h) {
    for (let i = 0; i < this.notifications.length; i++) {
      const notif = this.notifications[i];
      const progress = 1 - notif.timer / notif.maxTimer;

      // Scale in, then fade out
      let scale, alpha;
      if (progress < 0.2) {
        scale = 0.5 + (progress / 0.2) * 0.5;
        alpha = 1;
      } else {
        scale = 1;
        alpha = 1 - ((progress - 0.2) / 0.8);
      }

      const y = h * 0.4 + i * 50;
      ctx.save();
      ctx.translate(w / 2, y);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 4;
      ctx.font = 'bold 36px monospace';
      ctx.strokeText(notif.text, 0, 0);
      ctx.fillText(notif.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  _drawEdgePulse(ctx, w, h) {
    const pulse = Math.sin(Date.now() * 0.008) * 0.3 + 0.3;
    const size = 15;

    // Top edge
    const grad1 = ctx.createLinearGradient(0, 0, 0, size);
    grad1.addColorStop(0, `rgba(255, 50, 50, ${pulse})`);
    grad1.addColorStop(1, 'rgba(255, 50, 50, 0)');
    ctx.fillStyle = grad1;
    ctx.fillRect(0, 0, w, size);

    // Bottom edge
    const grad2 = ctx.createLinearGradient(0, h - size, 0, h);
    grad2.addColorStop(0, 'rgba(255, 50, 50, 0)');
    grad2.addColorStop(1, `rgba(255, 50, 50, ${pulse})`);
    ctx.fillStyle = grad2;
    ctx.fillRect(0, h - size, w, size);

    // Left edge
    const grad3 = ctx.createLinearGradient(0, 0, size, 0);
    grad3.addColorStop(0, `rgba(255, 50, 50, ${pulse})`);
    grad3.addColorStop(1, 'rgba(255, 50, 50, 0)');
    ctx.fillStyle = grad3;
    ctx.fillRect(0, 0, size, h);

    // Right edge
    const grad4 = ctx.createLinearGradient(w - size, 0, w, 0);
    grad4.addColorStop(0, 'rgba(255, 50, 50, 0)');
    grad4.addColorStop(1, `rgba(255, 50, 50, ${pulse})`);
    ctx.fillStyle = grad4;
    ctx.fillRect(w - size, 0, size, h);
  }
}
