// Hoop rendering and collision detection

import { COLORS, RIM_RADIUS, RIM_BOUNCE_DAMPING, dist } from './utils.js';

export class Hoop {
  constructor(canvas) {
    this.canvas = canvas;
    this.baseX = canvas.width / 2;
    this.baseY = canvas.height * 0.28;
    this.x = this.baseX;
    this.y = this.baseY;
    this.rimRadius = RIM_RADIUS;
    this.moveSpeed = 0;
    this.moveAmplitude = 0;
    this.movePhase = 0;
    this.netPoints = [];
    this.netSwayTime = 0;
    this.netRipple = 0;
    this.fireIntensity = 0;
    this._initNet();
  }

  _initNet() {
    // Net is a series of points forming a simple mesh
    this.netPoints = [];
    const segments = 8;
    const depth = 5;
    for (let row = 0; row < depth; row++) {
      const rowPoints = [];
      for (let col = 0; col <= segments; col++) {
        const angle = (col / segments) * Math.PI;
        const r = this.rimRadius * (1 - row * 0.08);
        rowPoints.push({
          baseX: Math.cos(angle) * r,
          baseY: row * 8,
          offsetX: 0,
          offsetY: 0,
        });
      }
      this.netPoints.push(rowPoints);
    }
  }

  setMovement(speed, amplitude) {
    this.moveSpeed = speed;
    this.moveAmplitude = amplitude;
  }

  setFireIntensity(intensity) {
    this.fireIntensity = intensity;
  }

  update(dt) {
    this.baseX = this.canvas.width / 2;
    this.baseY = this.canvas.height * 0.28;

    // Hoop movement
    if (this.moveSpeed > 0) {
      this.movePhase += this.moveSpeed * dt;
      this.x = this.baseX + Math.sin(this.movePhase) * this.moveAmplitude;
    } else {
      this.x = this.baseX;
    }
    this.y = this.baseY;

    // Net sway physics
    this.netSwayTime += dt;
    if (this.netRipple > 0) {
      this.netRipple -= dt * 3;
      if (this.netRipple < 0) this.netRipple = 0;
    }

    // Update net points for sway
    for (let row = 0; row < this.netPoints.length; row++) {
      for (let col = 0; col < this.netPoints[row].length; col++) {
        const swayAmount = row * 0.5;
        const rippleOffset = this.netRipple * Math.sin(this.netSwayTime * 15 + col) * row * 2;
        this.netPoints[row][col].offsetX = Math.sin(this.netSwayTime * 2 + col * 0.5) * swayAmount + rippleOffset;
        this.netPoints[row][col].offsetY = Math.sin(this.netSwayTime * 3 + row) * swayAmount * 0.3;
      }
    }
  }

  triggerNetRipple() {
    this.netRipple = 1;
    this.netSwayTime = 0;
  }

  // Check collision with ball, returns: 'score', 'swish', 'rim', or null
  checkCollision(ball) {
    if (!ball.active || ball.scored || ball.missed) return null;

    const ballPos = ball.getScreenPos();
    const ballRadius = ball.getRadius();

    // Ball needs to be in the right depth range
    if (ball.z < 0.6 || ball.z > 1.5) return null;

    // Check if ball passes through the hoop (scoring zone)
    const distToCenter = dist(ballPos.x, ballPos.y, this.x, this.y);
    const scoringThreshold = this.rimRadius * 0.7;
    const rimWidth = 6;

    if (distToCenter < scoringThreshold && ball.vy > 0) {
      // Ball is going through the hoop downward
      const rimDist = Math.abs(distToCenter - this.rimRadius);
      if (rimDist > rimWidth * 2) {
        return 'swish';
      }
      return 'score';
    }

    // Check rim collision
    const rimDist = Math.abs(distToCenter - this.rimRadius);
    if (rimDist < rimWidth + ballRadius * 0.3 && !ball.rimHit) {
      // Bounce off rim
      const angle = Math.atan2(ballPos.y - this.y, ballPos.x - this.x);
      ball.vx = Math.cos(angle) * Math.abs(ball.vy) * RIM_BOUNCE_DAMPING;
      ball.vy = -Math.abs(ball.vy) * RIM_BOUNCE_DAMPING * (0.5 + Math.random() * 0.3);
      ball.rimHit = true;

      // After rim hit, check if ball might still go in
      // Give it a chance based on angle
      if (distToCenter < this.rimRadius && ball.vy > -100) {
        return 'rim_score_pending';
      }
      return 'rim';
    }

    // After rim hit, check if ball now goes through
    if (ball.rimHit && distToCenter < scoringThreshold && ball.vy > 0 && ball.z > 0.8) {
      return 'score';
    }

    return null;
  }

  render(ctx) {
    // Draw backboard
    this._drawBackboard(ctx);

    // Draw fire on rim if active
    if (this.fireIntensity > 0) {
      this._drawFire(ctx);
    }

    // Draw rim
    this._drawRim(ctx);

    // Draw net
    this._drawNet(ctx);
  }

  _drawBackboard(ctx) {
    const bbWidth = this.rimRadius * 3.5;
    const bbHeight = this.rimRadius * 2.5;
    const bbX = this.x - bbWidth / 2;
    const bbY = this.y - bbHeight * 0.9;

    // Backboard
    ctx.fillStyle = COLORS.backboard;
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.fillRect(bbX, bbY, bbWidth, bbHeight);
    ctx.strokeRect(bbX, bbY, bbWidth, bbHeight);

    // Inner square on backboard
    const innerW = bbWidth * 0.45;
    const innerH = bbHeight * 0.5;
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.x - innerW / 2, bbY + bbHeight * 0.15, innerW, innerH);
  }

  _drawRim(ctx) {
    // Rim - orange metallic
    ctx.strokeStyle = COLORS.rimOrange;
    ctx.lineWidth = 5;
    ctx.shadowColor = COLORS.rimOrange;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, this.rimRadius, this.rimRadius * 0.25, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Rim connector to backboard
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x, this.y - 10);
    ctx.stroke();
  }

  _drawNet(ctx) {
    ctx.strokeStyle = COLORS.netWhite;
    ctx.lineWidth = 1;

    for (let row = 0; row < this.netPoints.length - 1; row++) {
      const currentRow = this.netPoints[row];
      const nextRow = this.netPoints[row + 1];

      for (let col = 0; col < currentRow.length - 1; col++) {
        const p1 = currentRow[col];
        const p2 = currentRow[col + 1];
        const p3 = nextRow[col];

        // Vertical threads
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(this.x + p1.baseX + p1.offsetX, this.y + p1.baseY + p1.offsetY + 5);
        ctx.lineTo(this.x + p3.baseX + p3.offsetX, this.y + p3.baseY + p3.offsetY + 5);
        ctx.stroke();

        // Horizontal threads
        if (row > 0) {
          ctx.beginPath();
          ctx.moveTo(this.x + p1.baseX + p1.offsetX, this.y + p1.baseY + p1.offsetY + 5);
          ctx.lineTo(this.x + p2.baseX + p2.offsetX, this.y + p2.baseY + p2.offsetY + 5);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawFire(ctx) {
    const flameCount = Math.floor(8 + this.fireIntensity * 8);
    const time = Date.now() * 0.005;

    for (let i = 0; i < flameCount; i++) {
      const angle = (i / flameCount) * Math.PI * 2;
      const fx = this.x + Math.cos(angle) * this.rimRadius;
      const fy = this.y + Math.sin(angle) * this.rimRadius * 0.25;
      const flameHeight = (15 + Math.sin(time + i * 2) * 10) * this.fireIntensity;
      const flameWidth = 4 + Math.random() * 4;

      const grad = ctx.createLinearGradient(fx, fy, fx, fy - flameHeight);
      grad.addColorStop(0, `rgba(255, 100, 0, ${0.6 * this.fireIntensity})`);
      grad.addColorStop(0.5, `rgba(255, 200, 0, ${0.4 * this.fireIntensity})`);
      grad.addColorStop(1, `rgba(255, 255, 200, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(fx - flameWidth / 2, fy);
      ctx.quadraticCurveTo(fx + Math.sin(time + i) * 3, fy - flameHeight / 2, fx, fy - flameHeight);
      ctx.quadraticCurveTo(fx + Math.sin(time + i + 1) * 3, fy - flameHeight / 2, fx + flameWidth / 2, fy);
      ctx.fill();
    }
  }
}
