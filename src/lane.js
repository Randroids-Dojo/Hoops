// Lane/environment rendering - first-person perspective

import { COLORS, lerp } from './utils.js';

export class Lane {
  constructor() {
    this.spotlightPhase = 0;
  }

  update(dt) {
    this.spotlightPhase += dt * 0.5;
  }

  render(ctx, canvas) {
    const w = canvas.width;
    const h = canvas.height;

    // Vanishing point
    const vpX = w / 2;
    const vpY = h * 0.18;

    // Lane boundaries at bottom
    const laneWidthBottom = w * 0.7;
    const laneLeftBottom = (w - laneWidthBottom) / 2;
    const laneRightBottom = laneLeftBottom + laneWidthBottom;

    // Lane boundaries at vanishing point (narrower)
    const laneWidthTop = w * 0.12;
    const laneLeftTop = vpX - laneWidthTop / 2;
    const laneRightTop = vpX + laneWidthTop / 2;

    // Lane floor start/end Y
    const floorTopY = vpY + h * 0.05;
    const floorBottomY = h * 0.95;

    // Draw dark arena background with subtle spotlights
    this._drawBackground(ctx, w, h, vpX, vpY);

    // Draw lane floor
    this._drawFloor(ctx, vpX, floorTopY, floorBottomY, laneLeftBottom, laneRightBottom, laneLeftTop, laneRightTop, w);

    // Draw side rails
    this._drawRails(ctx, floorTopY, floorBottomY, laneLeftBottom, laneRightBottom, laneLeftTop, laneRightTop);
  }

  _drawBackground(ctx, w, h, vpX, vpY) {
    // Dark arena gradient
    const grad = ctx.createRadialGradient(vpX, vpY, 10, vpX, vpY, h);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(0.5, '#0f0f1a');
    grad.addColorStop(1, '#0A0A0A');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle spotlight effects
    const spotCount = 3;
    for (let i = 0; i < spotCount; i++) {
      const angle = this.spotlightPhase + (i * Math.PI * 2) / spotCount;
      const sx = vpX + Math.cos(angle) * w * 0.3;
      const sy = vpY * 0.5 + Math.sin(angle * 0.7) * 20;
      const spotGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.3);
      spotGrad.addColorStop(0, 'rgba(100, 100, 180, 0.03)');
      spotGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = spotGrad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  _drawFloor(ctx, vpX, topY, bottomY, leftBottom, rightBottom, leftTop, rightTop, w) {
    // Floor shape (trapezoid)
    ctx.beginPath();
    ctx.moveTo(leftTop, topY);
    ctx.lineTo(rightTop, topY);
    ctx.lineTo(rightBottom, bottomY);
    ctx.lineTo(leftBottom, bottomY);
    ctx.closePath();

    // Floor gradient (hardwood look)
    const floorGrad = ctx.createLinearGradient(0, topY, 0, bottomY);
    floorGrad.addColorStop(0, '#4a3510');
    floorGrad.addColorStop(0.3, '#5a4218');
    floorGrad.addColorStop(0.7, '#6b4f10');
    floorGrad.addColorStop(1, '#8B6914');
    ctx.fillStyle = floorGrad;
    ctx.fill();

    // Horizontal depth lines on floor
    const lineCount = 20;
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < lineCount; i++) {
      // Non-linear spacing for perspective
      const t = Math.pow(i / lineCount, 1.5);
      const y = lerp(topY, bottomY, t);
      const left = lerp(leftTop, leftBottom, t);
      const right = lerp(rightTop, rightBottom, t);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }

    // Center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vpX, topY);
    ctx.lineTo(vpX, bottomY);
    ctx.stroke();
  }

  _drawRails(ctx, topY, bottomY, leftBottom, rightBottom, leftTop, rightTop) {
    // Left rail - cyan LED strip
    ctx.strokeStyle = COLORS.railCyan;
    ctx.lineWidth = 3;
    ctx.shadowColor = COLORS.railCyan;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(leftTop, topY);
    ctx.lineTo(leftBottom, bottomY);
    ctx.stroke();

    // Right rail - cyan LED strip
    ctx.beginPath();
    ctx.moveTo(rightTop, topY);
    ctx.lineTo(rightBottom, bottomY);
    ctx.stroke();

    // Orange accent on rail edges
    ctx.strokeStyle = COLORS.railOrange;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = COLORS.railOrange;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(leftTop - 3, topY);
    ctx.lineTo(leftBottom - 5, bottomY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rightTop + 3, topY);
    ctx.lineTo(rightBottom + 5, bottomY);
    ctx.stroke();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Wire mesh hint on sides
    ctx.strokeStyle = 'rgba(100, 100, 120, 0.1)';
    ctx.lineWidth = 0.5;
    const meshLines = 12;
    for (let i = 0; i < meshLines; i++) {
      const t = i / meshLines;
      const y = lerp(topY, bottomY, t);
      const lx = lerp(leftTop, leftBottom, t);
      const rx = lerp(rightTop, rightBottom, t);

      // Left mesh
      ctx.beginPath();
      ctx.moveTo(lx - 20, y);
      ctx.lineTo(lx, y);
      ctx.stroke();

      // Right mesh
      ctx.beginPath();
      ctx.moveTo(rx, y);
      ctx.lineTo(rx + 20, y);
      ctx.stroke();
    }
  }

  // Get lane X boundaries at a given Y position (for ball constraints)
  getLaneBounds(y, canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const vpX = w / 2;
    const vpY = h * 0.18;

    const laneWidthBottom = w * 0.7;
    const laneLeftBottom = (w - laneWidthBottom) / 2;
    const laneRightBottom = laneLeftBottom + laneWidthBottom;
    const laneWidthTop = w * 0.12;
    const laneLeftTop = vpX - laneWidthTop / 2;
    const laneRightTop = vpX + laneWidthTop / 2;

    const floorTopY = vpY + h * 0.05;
    const floorBottomY = h * 0.95;

    const t = Math.max(0, Math.min(1, (y - floorTopY) / (floorBottomY - floorTopY)));
    return {
      left: lerp(laneLeftTop, laneLeftBottom, t),
      right: lerp(laneRightTop, laneRightBottom, t),
    };
  }
}
