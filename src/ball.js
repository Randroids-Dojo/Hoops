// Ball physics and rendering

import { COLORS, GRAVITY, BALL_RADIUS_BASE, clamp, lerp, perspectiveScale } from './utils.js';

export class Ball {
  constructor(canvas) {
    this.canvas = canvas;
    this.reset();
    this.rotation = 0;
    this.rotationSpeed = 0;
    this.streakLevel = 0; // 0=none, 1=heating, 2=fire, 3=blazing, 4=unstoppable
  }

  reset() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.x = w / 2;
    this.y = h * 0.82;
    this.z = 0; // depth: 0 = at player, 1 = at hoop
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.active = false;   // is ball in flight?
    this.scored = false;
    this.missed = false;
    this.rimHit = false;
    this.visible = true;
    this.rotation = 0;
    this.rotationSpeed = 0;
    this.trail = [];
  }

  throwBall(power, lateralAngle) {
    if (this.active) return;
    this.active = true;

    // Vertical velocity (upward is negative)
    this.vy = -clamp(power, 600, 1800);
    // Horizontal based on lateral aim
    this.vx = lateralAngle * 300;
    // Depth velocity - ball travels toward hoop
    this.vz = clamp(power * 0.001, 0.8, 2.0);

    this.rotationSpeed = (Math.random() - 0.5) * 15 + power * 0.005;
  }

  update(dt) {
    if (!this.active) return;

    // Apply gravity
    this.vy += GRAVITY * dt;

    // Update position
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;

    // Rotation
    this.rotation += this.rotationSpeed * dt;

    // Trail for fire effect
    if (this.streakLevel >= 1) {
      this.trail.push({ x: this.x, y: this.y, z: this.z, life: 1 });
      if (this.trail.length > 15) this.trail.shift();
    }

    // Update trail
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt * 4;
      if (this.trail[i].life <= 0) {
        this.trail.splice(i, 1);
      }
    }

    // Check if ball went off screen
    if (this.y > this.canvas.height + 100 || this.z > 3) {
      if (!this.scored) {
        this.missed = true;
      }
    }
  }

  getRadius() {
    // Ball gets smaller as it goes further (perspective)
    const scale = 1 - this.z * 0.35;
    return BALL_RADIUS_BASE * Math.max(scale, 0.2);
  }

  getScreenPos() {
    // Perspective: as z increases, ball moves toward vanishing point
    const vpX = this.canvas.width / 2;
    const vpY = this.canvas.height * 0.18;
    const t = clamp(this.z, 0, 2) / 2;

    const screenX = lerp(this.x, vpX, t * 0.6);
    const screenY = lerp(this.y, vpY, t * 0.3) + this.y * (1 - t) * 0;

    return { x: screenX, y: lerp(this.y, vpY + 50, t * 0.5) };
  }

  render(ctx) {
    if (!this.visible) return;

    const pos = this.active ? this.getScreenPos() : { x: this.x, y: this.y };
    const radius = this.getRadius();

    // Draw fire trail
    if (this.streakLevel >= 1 && this.active) {
      this._drawTrail(ctx, radius);
    }

    // Draw shadow
    if (this.active) {
      ctx.fillStyle = COLORS.shadow;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + radius + 5, radius * 0.7, radius * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(this.rotation);

    // Ball glow for streaks
    if (this.streakLevel >= 1) {
      const glowColors = ['#FF8C00', '#FF4500', '#FF2200', '#FF00FF'];
      const glowColor = glowColors[Math.min(this.streakLevel - 1, 3)];
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 15 + this.streakLevel * 5;
    }

    // Basketball body
    const ballGrad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, radius * 0.1, 0, 0, radius);
    ballGrad.addColorStop(0, '#F5942A');
    ballGrad.addColorStop(0.7, COLORS.basketball);
    ballGrad.addColorStop(1, COLORS.basketballDark);
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Seam lines
    ctx.strokeStyle = COLORS.seamBlack;
    ctx.lineWidth = 1.5;

    // Horizontal seam
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * 0.15, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Vertical seam
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.15, radius, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Curved side seams
    ctx.beginPath();
    ctx.ellipse(-radius * 0.45, 0, radius * 0.15, radius * 0.7, -0.2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(radius * 0.45, 0, radius * 0.15, radius * 0.7, 0.2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  _drawTrail(ctx, radius) {
    for (const point of this.trail) {
      const t = clamp(point.z, 0, 2) / 2;
      const vpX = this.canvas.width / 2;
      const vpY = this.canvas.height * 0.18;
      const sx = lerp(point.x, vpX, t * 0.6);
      const sy = lerp(point.y, vpY + 50, t * 0.5);
      const r = radius * point.life * 0.6;

      if (r <= 0) continue;

      const alpha = point.life * 0.5;
      if (this.streakLevel >= 4) {
        // Rainbow trail for unstoppable
        const hue = (Date.now() * 0.5 + point.life * 200) % 360;
        ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${alpha})`;
      } else {
        ctx.fillStyle = `rgba(255, ${Math.floor(100 + point.life * 100)}, 0, ${alpha})`;
      }
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
