// Particle system for fire, celebrations, and effects

import { randomRange } from './utils.js';

class Particle {
  constructor(x, y, vx, vy, life, color, size) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.size = size;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 200 * dt; // gravity on particles
    this.life -= dt;
  }

  get alpha() {
    return Math.max(0, this.life / this.maxLife);
  }

  get dead() {
    return this.life <= 0;
  }
}

export class Particles {
  constructor() {
    this.particles = [];
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(dt);
      if (this.particles[i].dead) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Emit fire particles at a position
  emitFire(x, y, intensity) {
    const count = Math.floor(2 + intensity * 3);
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(
        x + randomRange(-10, 10),
        y,
        randomRange(-30, 30),
        randomRange(-150, -50),
        randomRange(0.3, 0.8),
        `hsl(${randomRange(15, 45)}, 100%, ${randomRange(50, 80)}%)`,
        randomRange(2, 5)
      ));
    }
  }

  // Score celebration burst
  emitScoreBurst(x, y) {
    const count = 20;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = randomRange(100, 250);
      this.particles.push(new Particle(
        x, y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 50,
        randomRange(0.5, 1.2),
        `hsl(${randomRange(30, 60)}, 100%, 60%)`,
        randomRange(2, 5)
      ));
    }
  }

  // Stage clear celebration - big burst
  emitCelebration(canvasWidth, canvasHeight) {
    const colors = ['#00E5FF', '#FF6B00', '#00FF41', '#FFD700', '#FF3366'];
    for (let burst = 0; burst < 5; burst++) {
      const bx = randomRange(canvasWidth * 0.2, canvasWidth * 0.8);
      const by = randomRange(canvasHeight * 0.2, canvasHeight * 0.5);
      for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = randomRange(80, 350);
        this.particles.push(new Particle(
          bx, by,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          randomRange(0.8, 2.0),
          colors[Math.floor(Math.random() * colors.length)],
          randomRange(2, 6)
        ));
      }
    }
  }

  // Urgency pulse particles for bonus time
  emitEdgePulse(canvasWidth, canvasHeight) {
    // Emit along edges
    for (let i = 0; i < 4; i++) {
      const side = Math.floor(Math.random() * 4);
      let px, py;
      if (side === 0) { px = randomRange(0, canvasWidth); py = 0; }
      else if (side === 1) { px = canvasWidth; py = randomRange(0, canvasHeight); }
      else if (side === 2) { px = randomRange(0, canvasWidth); py = canvasHeight; }
      else { px = 0; py = randomRange(0, canvasHeight); }

      this.particles.push(new Particle(
        px, py,
        randomRange(-20, 20),
        randomRange(-20, 20),
        randomRange(0.3, 0.6),
        'rgba(255, 50, 50, 0.6)',
        randomRange(3, 8)
      ));
    }
  }

  clear() {
    this.particles = [];
  }
}
