// Touch/mouse input handling

import { MIN_SWIPE_DISTANCE } from './utils.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.pointerDown = false;
    this.startX = 0;
    this.startY = 0;
    this.startTime = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.onThrow = null; // callback: (power, angle) => void
    this.onTap = null;   // callback: (x, y) => void
    this.enabled = true;

    this._bindEvents();
  }

  _bindEvents() {
    // Touch events
    this.canvas.addEventListener('touchstart', (e) => this._onStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this._onMove(e), { passive: false });
    this.canvas.addEventListener('touchend', (e) => this._onEnd(e), { passive: false });

    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this._onStart(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMove(e));
    this.canvas.addEventListener('mouseup', (e) => this._onEnd(e));
  }

  _getPos(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length > 0) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  _onStart(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const pos = this._getPos(e);
    this.pointerDown = true;
    this.startX = pos.x;
    this.startY = pos.y;
    this.currentX = pos.x;
    this.currentY = pos.y;
    this.startTime = performance.now();
  }

  _onMove(e) {
    if (!this.enabled || !this.pointerDown) return;
    e.preventDefault();
    const pos = this._getPos(e);
    this.currentX = pos.x;
    this.currentY = pos.y;
  }

  _onEnd(e) {
    if (!this.enabled || !this.pointerDown) return;
    e.preventDefault();
    this.pointerDown = false;

    const pos = this._getPos(e);
    const dx = pos.x - this.startX;
    const dy = pos.y - this.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const elapsed = (performance.now() - this.startTime) / 1000;

    // Check if it's a swipe upward (dy should be negative for upward)
    if (distance > MIN_SWIPE_DISTANCE && dy < -MIN_SWIPE_DISTANCE) {
      // Power from vertical speed, angle from horizontal offset
      const power = Math.abs(dy) / Math.max(elapsed, 0.01);
      const lateralAngle = dx / Math.max(Math.abs(dy), 1); // -1 to 1 roughly

      if (this.onThrow) {
        this.onThrow(power, lateralAngle);
      }
    } else if (distance < MIN_SWIPE_DISTANCE) {
      // It's a tap
      if (this.onTap) {
        this.onTap(pos.x, pos.y);
      }
    }
  }

  // Check if pointer is currently dragging (for visual feedback)
  isDragging() {
    return this.pointerDown;
  }

  getDragDelta() {
    if (!this.pointerDown) return { dx: 0, dy: 0 };
    return {
      dx: this.currentX - this.startX,
      dy: this.currentY - this.startY,
    };
  }
}
