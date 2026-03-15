// Title, game over, and stage clear screens

import { COLORS } from './utils.js';

export class Screens {
  constructor() {
    this.titleBouncePhase = 0;
    this.stageClearTimer = 0;
    this.stageClearDuration = 3;
    this.flashAlpha = 0;
  }

  update(dt) {
    this.titleBouncePhase += dt * 3;
    if (this.flashAlpha > 0) {
      this.flashAlpha -= dt * 3;
      if (this.flashAlpha < 0) this.flashAlpha = 0;
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

  renderTitle(ctx, canvas, bestScore) {
    const w = canvas.width;
    const h = canvas.height;

    // Background is drawn by lane, just draw title elements on top

    // Neon glow HOOPS text
    const titleY = h * 0.35;
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
    const ballY = h * 0.55 + Math.abs(Math.sin(this.titleBouncePhase)) * 20;
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
    ctx.ellipse(w / 2, h * 0.55 + 30, 14, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tap to play prompt (pulsing)
    const promptAlpha = 0.5 + Math.sin(Date.now() * 0.004) * 0.5;
    ctx.globalAlpha = promptAlpha;
    ctx.fillStyle = COLORS.white;
    ctx.font = `bold ${Math.min(w * 0.04, 22)}px monospace`;

    const isMobile = 'ontouchstart' in window;
    ctx.fillText(isMobile ? 'TAP TO PLAY' : 'CLICK TO PLAY', w / 2, h * 0.72);
    ctx.globalAlpha = 1;

    // High score
    if (bestScore > 0) {
      ctx.fillStyle = COLORS.scoreGreen;
      ctx.shadowColor = COLORS.scoreGreen;
      ctx.shadowBlur = 8;
      ctx.font = '16px monospace';
      ctx.fillText(`BEST: ${bestScore}`, w / 2, h * 0.82);
      ctx.shadowBlur = 0;
    }

    // Sound toggle hint
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px monospace';
    ctx.fillText('Press M to toggle sound', w / 2, h * 0.92);

    ctx.restore();
  }

  renderGameOver(ctx, canvas, scoring) {
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
    ctx.fillText("TIME'S UP!", w / 2, h * 0.3);
    ctx.shadowBlur = 0;

    // Final score
    ctx.fillStyle = COLORS.white;
    ctx.font = '18px monospace';
    ctx.fillText('FINAL SCORE', w / 2, h * 0.42);

    ctx.fillStyle = COLORS.scoreGreen;
    ctx.shadowColor = COLORS.scoreGreen;
    ctx.shadowBlur = 15;
    ctx.font = `bold ${Math.min(w * 0.1, 64)}px monospace`;
    ctx.fillText(`${scoring.totalScore}`, w / 2, h * 0.5);
    ctx.shadowBlur = 0;

    // Stage reached
    ctx.fillStyle = COLORS.primary;
    ctx.font = '20px monospace';
    ctx.fillText(`Stage ${scoring.stageNum} reached`, w / 2, h * 0.58);

    // High score indicator
    if (scoring.isHighScore()) {
      const hsAlpha = 0.5 + Math.sin(Date.now() * 0.005) * 0.5;
      ctx.globalAlpha = hsAlpha;
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('NEW HIGH SCORE!', w / 2, h * 0.66);
      ctx.globalAlpha = 1;
    }

    // Restart prompt
    const promptAlpha = 0.5 + Math.sin(Date.now() * 0.004) * 0.5;
    ctx.globalAlpha = promptAlpha;
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 20px monospace';
    const isMobile = 'ontouchstart' in window;
    ctx.fillText(isMobile ? 'TAP TO RESTART' : 'CLICK TO RESTART', w / 2, h * 0.78);
    ctx.globalAlpha = 1;

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
}
