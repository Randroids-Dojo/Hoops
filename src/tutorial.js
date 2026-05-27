// First-run interactive tutorial overlay.
//
// Walks a brand-new player through the two-step shot mechanic:
//   1. Drag from the ball up toward the hoop until the aim arc turns green.
//   2. Release when the power meter hits the PERFECT band.
//
// The overlay appears the very first time the player plays in any mode.
// Once a single throw has been released — perfect or not — the tutorial
// marks itself complete and never shows again in any mode.
//
// Tutorial-mode tweaks made so the lesson is learnable on shot #1:
// - Slows the power meter sweep, giving real time to time PERFECT.
// - Doesn't snap or assist the aim; the player learns the real feel.

import { readStorage, writeStorage } from '@randroids-dojo/vibekit';
import { z } from 'zod';
import { COLORS } from './utils.js';
import { settings } from './settings.js';

const STORAGE_KEY = 'hoops-tutorial-v1';
const Schema = z.object({ completed: z.boolean().optional() });

// Phases the overlay cycles through. AIM → RELEASE on first drag-start,
// RELEASE → AIM if the player cancels a drag without throwing, and
// onThrow() ends the tutorial regardless of phase.
const PHASE = {
  AIM: 'aim',
  RELEASE: 'release',
  DONE: 'done',
};

// Meter sweep rate while the tutorial is on. Default is 1.1 Hz (< 1s per
// sweep), which is brutal for shot #1. Half-speed gives the player a
// comfortable target without misrepresenting the timing challenge.
const TUTORIAL_METER_HZ = 0.45;

// Must match METER_PERFECT_NORM in game.js — the y-fraction of the meter
// where PERFECT sits (counted from the bottom of the bar).
const PERFECT_NORM = 0.7;

// Meter geometry constants — must match _renderPowerMeter in game.js so
// the tutorial highlight overlays the real meter exactly.
const METER_BAR_W = 22;
const METER_MARGIN = 26;
const METER_MAX_H = 360;
const METER_H_FRAC = 0.5;

export class Tutorial {
  constructor() {
    this.completed = Tutorial.isCompleted();
    this.active = false;
    this.phase = PHASE.DONE;
    this.elapsed = 0;
    this._wasDragging = false;
  }

  static isCompleted() {
    const saved = readStorage(STORAGE_KEY, Schema);
    return !!saved?.completed;
  }

  // Called at the start of every game. No-op once the tutorial has been
  // completed in any prior session.
  begin() {
    if (this.completed) return;
    this.active = true;
    this.phase = PHASE.AIM;
    this.elapsed = 0;
    this._wasDragging = false;
  }

  // Called by the game's throw callback. One released throw ends the
  // tutorial regardless of where the meter was at release — the player
  // has performed the full drag-aim-and-release rep, which is the lesson.
  onThrow() {
    if (!this.active) return;
    this._markCompleted();
  }

  _markCompleted() {
    this.completed = true;
    this.active = false;
    this.phase = PHASE.DONE;
    writeStorage(STORAGE_KEY, { completed: true });
  }

  // Returns the meter Hz the game should use this frame. Slow during the
  // tutorial, default rate otherwise.
  meterRateHz(defaultHz) {
    return this.active ? TUTORIAL_METER_HZ : defaultHz;
  }

  update(dt, game) {
    if (!this.active) return;
    this.elapsed += dt;
    const dragging = game.input.isDragging();
    if (this.phase === PHASE.AIM && dragging) {
      this.phase = PHASE.RELEASE;
    } else if (this.phase === PHASE.RELEASE && !dragging && this._wasDragging) {
      // Drag ended without a throw (cancelled / downward swipe / tap). Step
      // back to the aim instructions so the next attempt re-sees them.
      // onThrow() handles the success path elsewhere.
      this.phase = PHASE.AIM;
    }
    this._wasDragging = dragging;
  }

  render(ctx, canvas, game) {
    if (!this.active) return;
    const pulse = (Math.sin(this.elapsed * 3.2) + 1) / 2;

    if (this.phase === PHASE.AIM) {
      this._renderAimPhase(ctx, canvas, game, pulse);
    } else if (this.phase === PHASE.RELEASE) {
      this._renderReleasePhase(ctx, canvas, game, pulse);
    }
  }

  _meterRect(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const barH = Math.min(h * METER_H_FRAC, METER_MAX_H);
    const onLeft = settings.powerMeterSide === 'left';
    const barX = onLeft ? METER_MARGIN : w - METER_BAR_W - METER_MARGIN;
    const barY = (h - barH) / 2;
    const sweetY = barY + barH - barH * PERFECT_NORM;
    return { barX, barY, barW: METER_BAR_W, barH, sweetY, onLeft };
  }

  _renderAimPhase(ctx, canvas, game, pulse) {
    const ball = game.activeBall.getScreenPos();
    const rim = game.world3d.projectToScreen(game.hoop.getRimCenter());

    // Big rainbow-style arrow from the ball up to the rim, dashed so it
    // reads as a guide rather than the live aim arc.
    this._drawGuideArc(ctx, ball, rim, pulse);

    // Pulsing ring on the ball so the eye snaps to the start point.
    this._drawPulseRing(ctx, ball.x, ball.y, 28, 16, pulse, COLORS.primary);

    // Target ring on the rim — the destination, also pulsing.
    this._drawPulseRing(ctx, rim.x, rim.y, 30, 18, pulse, COLORS.scoreGreen);

    this._drawBanner(
      ctx,
      canvas,
      'TUTORIAL — STEP 1 / 2',
      'Swipe from the ball toward the hoop',
      'Aim until the line turns GREEN at the rim',
    );
  }

  _renderReleasePhase(ctx, canvas, game, pulse) {
    const meter = this._meterRect(canvas);

    // Pulsing ring around the PERFECT mark on the live power meter so the
    // player's eye is dragged from the ball's drag arc up to the timing
    // target without losing visual continuity.
    const ringX = meter.barX + meter.barW / 2;
    const ringY = meter.sweetY;
    this._drawPulseRing(ctx, ringX, ringY, 26, 18, pulse, COLORS.scoreGreen);

    // Arrow pointing horizontally from the play area into the meter so the
    // player notices the highlight even on a phone where peripheral vision
    // is narrow. Direction depends on whether the meter is on the left or
    // right side of the screen.
    this._drawMeterArrow(ctx, canvas, meter, pulse);

    this._drawBanner(
      ctx,
      canvas,
      'TUTORIAL — STEP 2 / 2',
      'Release when the meter hits PERFECT',
      'The green band is your timing window — center is best',
    );
  }

  // Top-center info panel. Three lines: small label, big instruction,
  // smaller subtitle. Sits below the top HUD so it doesn't obscure
  // TARGET / TIME / STAGE. Instruction font auto-shrinks if a string would
  // overflow on narrow viewports.
  _drawBanner(ctx, canvas, label, instruction, subtitle) {
    const w = canvas.width;
    const sidePad = 16;
    const horizPad = 14;
    const maxPanelW = w - sidePad * 2;
    const labelFont = 'bold 11px monospace';
    const subtitleFont = '12px monospace';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Pick the largest instruction font that fits within the available
    // panel width. Monospace + measureText keeps this exact across fonts.
    let instructionSize = 18;
    for (; instructionSize >= 12; instructionSize--) {
      ctx.font = `bold ${instructionSize}px monospace`;
      if (ctx.measureText(instruction).width <= maxPanelW - horizPad * 2) break;
    }
    const instructionFont = `bold ${instructionSize}px monospace`;

    ctx.font = instructionFont;
    const instrW = ctx.measureText(instruction).width;
    ctx.font = subtitleFont;
    const subW = ctx.measureText(subtitle).width;
    const panelW = Math.min(maxPanelW, Math.max(instrW, subW) + horizPad * 2);
    const panelH = 76;
    const panelX = (w - panelW) / 2;
    const panelY = 110;

    ctx.fillStyle = 'rgba(10, 14, 26, 0.88)';
    ctx.strokeStyle = COLORS.primary;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = COLORS.primary;
    ctx.shadowBlur = 18;
    this._roundRect(ctx, panelX, panelY, panelW, panelH, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();

    const cx = panelX + panelW / 2;
    ctx.fillStyle = COLORS.primary;
    ctx.font = labelFont;
    ctx.fillText(label, cx, panelY + 10);

    ctx.fillStyle = COLORS.white;
    ctx.font = instructionFont;
    ctx.fillText(instruction, cx, panelY + 26);

    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = subtitleFont;
    ctx.fillText(subtitle, cx, panelY + 52);
    ctx.restore();
  }

  // Pulsing concentric ring used to draw the eye to a hotspot. baseR is the
  // tight ring's radius; outer pulses out by up to maxExtra px.
  _drawPulseRing(ctx, x, y, baseR, maxExtra, pulse, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, baseR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.45 * (1 - pulse);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, baseR + maxExtra * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Dashed rainbow guide from the ball up to the rim. Curves through a
  // control point lifted above and beside the chord so it doesn't overlap
  // a head-on shot line. Animates a marching-ant dash offset for motion.
  _drawGuideArc(ctx, start, end, pulse) {
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);
    const lift = Math.min(dist * 0.35, 220);
    const perpX = -dy / Math.max(dist, 1);
    const sideBulge = Math.min(dist * 0.16, 60);
    const cx = mx + perpX * sideBulge;
    const cy = my - lift;

    ctx.save();
    ctx.strokeStyle = COLORS.primary;
    ctx.shadowColor = COLORS.primary;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.setLineDash([10, 10]);
    ctx.lineDashOffset = -pulse * 20;
    ctx.globalAlpha = 0.5 + 0.4 * pulse;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(cx, cy, end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  // Short horizontal arrow tucked alongside the meter, pointing at the
  // PERFECT highlight. Drawn on the play-area side of the meter so it
  // never sits outside the visible canvas.
  _drawMeterArrow(ctx, canvas, meter, pulse) {
    const baseY = meter.sweetY;
    const tipX = meter.onLeft ? meter.barX + meter.barW + 6 : meter.barX - 6;
    const tailX = meter.onLeft ? tipX + 60 + pulse * 8 : tipX - 60 - pulse * 8;
    const dir = meter.onLeft ? -1 : 1;

    ctx.save();
    ctx.strokeStyle = COLORS.scoreGreen;
    ctx.fillStyle = COLORS.scoreGreen;
    ctx.shadowColor = COLORS.scoreGreen;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.65 + 0.3 * pulse;
    ctx.beginPath();
    ctx.moveTo(tailX, baseY);
    ctx.lineTo(tipX, baseY);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(tipX, baseY);
    ctx.lineTo(tipX + dir * 8, baseY - 6);
    ctx.lineTo(tipX + dir * 8, baseY + 6);
    ctx.closePath();
    ctx.fill();

    // "RELEASE!" label trailing the arrow's tail.
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.font = 'bold 12px monospace';
    ctx.textBaseline = 'middle';
    if (meter.onLeft) {
      ctx.textAlign = 'left';
      ctx.fillText('RELEASE!', tailX + 6, baseY);
    } else {
      ctx.textAlign = 'right';
      ctx.fillText('RELEASE!', tailX - 6, baseY);
    }
    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}
