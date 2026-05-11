// Game state machine and main loop

import * as THREE from 'three';
import { COLORS, clamp, MIN_THROW_SPEED, MAX_THROW_SPEED } from './utils.js';
import { Ball, launchVector } from './ball.js';
import { Hoop } from './hoop.js';
import { Lane } from './lane.js';
import { COURT } from './world3d.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Particles } from './particles.js';
import { Scoring } from './scoring.js';
import { Screens } from './screens.js';
import { Leaderboard } from './leaderboard.js';
import { initFeedbackFab, show as showFab, hide as hideFab } from './feedbackFab.js';

export class Game {
  constructor(canvas, ctx, world3d) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.world3d = world3d;
    // States: title, playing, stageClear, gameOver, paused, nameEntry, leaderboard
    this.state = 'title';
    this.lastTime = 0;

    // Initialize subsystems
    this.ball = new Ball(world3d);
    this.hoop = new Hoop(world3d);
    this.lane = new Lane();
    this.hud = new HUD();
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.particles = new Particles();
    this.scoring = new Scoring();
    this.screens = new Screens();
    this.leaderboard = new Leaderboard();

    this.ballResetTimer = 0;
    this.edgePulseTimer = 0;
    this.previousState = null; // for pause
    this.leaderboardReturnState = 'title'; // where to go back from leaderboard
    this.globalRank = null; // rank from last submission

    this._setupInput();
    this._setupKeyboard();
    this._createPauseButton();
    initFeedbackFab();
  }

  _setupInput() {
    this.input.onThrow = (power, lateralAngle) => {
      if (this.state === 'playing' && !this.ball.active) {
        const clampedPower = clamp(power, MIN_THROW_SPEED, MAX_THROW_SPEED);
        this.ball.throwBall(clampedPower, lateralAngle);
        this.ball.streakLevel = this.scoring.getStreakLevel();
        this.audio.playThrow();
      }
    };

    this.input.onTap = (x, y) => {
      if (this.state === 'title') {
        this._handleTitleTap(x, y);
      } else if (this.state === 'gameOver') {
        this.returnToTitle();
      } else if (this.state === 'paused') {
        this.togglePause();
      } else if (this.state === 'nameEntry') {
        this._handleNameEntryTap(x, y);
      } else if (this.state === 'leaderboard') {
        this._handleLeaderboardTap(x, y);
      }
    };
  }

  _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.state === 'playing' || this.state === 'paused') {
          this.togglePause();
        } else if (this.state === 'leaderboard') {
          this._exitLeaderboard();
        } else if (this.state === 'nameEntry') {
          // Skip name entry
          this._skipNameEntry();
        }
      }
      if (e.key === 'm' || e.key === 'M') {
        this.audio.toggle();
      }
      if (e.key === 'l' || e.key === 'L') {
        if (this.state === 'title' || this.state === 'gameOver') {
          this._openLeaderboard();
        }
      }

      // Name entry keyboard controls
      if (this.state === 'nameEntry') {
        this._handleNameEntryKey(e.key);
      }

      // Leaderboard tab switching
      if (this.state === 'leaderboard') {
        if (e.key === 'Tab') {
          e.preventDefault();
          this.screens.toggleLeaderboardTab();
        }
      }
    });
  }

  // --- Title screen ---

  _handleTitleTap(x, y) {
    // Check leaderboard button
    const btn = this.screens.getLeaderboardButtonRect(this.canvas);
    if (this.screens._hitTest(x, y, btn)) {
      this._openLeaderboard();
      return;
    }
    // Otherwise start game
    this.startGame();
  }

  // --- Name entry ---

  _handleNameEntryKey(key) {
    if (key === 'ArrowUp') {
      this.screens.nameScrollUp();
      this.audio.playClick();
    } else if (key === 'ArrowDown') {
      this.screens.nameScrollDown();
      this.audio.playClick();
    } else if (key === 'ArrowRight') {
      this.screens.nameAdvanceCursor();
      this.audio.playClick();
    } else if (key === 'ArrowLeft') {
      this.screens.nameBackCursor();
      this.audio.playClick();
    } else if (key === 'Enter') {
      this._submitName();
    } else if (key === 'Backspace') {
      this.screens.nameBackCursor();
      this.audio.playClick();
    }
  }

  _handleNameEntryTap(x, y) {
    // Check confirm button
    const confirmRect = this.screens.getNameEntryConfirmRect(this.canvas);
    if (this.screens._hitTest(x, y, confirmRect)) {
      this._submitName();
      return;
    }

    // Check skip button
    const skipRect = this.screens.getNameEntrySkipRect(this.canvas);
    if (this.screens._hitTest(x, y, skipRect)) {
      this._skipNameEntry();
      return;
    }

    // Check character slots
    const charRects = this.screens.getNameEntryCharRects(this.canvas);
    for (let i = 0; i < 3; i++) {
      const r = charRects[i];
      // Check up arrow area (above the slot)
      if (x >= r.x && x <= r.x + r.w && y >= r.y - 30 && y < r.y) {
        this.screens.namePos = i;
        this.screens.nameScrollUp();
        this.audio.playClick();
        return;
      }
      // Check down arrow area (below the slot)
      if (x >= r.x && x <= r.x + r.w && y > r.y + r.h && y <= r.y + r.h + 30) {
        this.screens.namePos = i;
        this.screens.nameScrollDown();
        this.audio.playClick();
        return;
      }
      // Check the slot itself - select it
      if (this.screens._hitTest(x, y, r)) {
        if (this.screens.namePos === i) {
          // Already selected - advance
          this.screens.nameAdvanceCursor();
        } else {
          this.screens.namePos = i;
        }
        this.audio.playClick();
        return;
      }
    }
  }

  async _submitName() {
    const name = this.screens.getEnteredName();
    this.audio.playClick();
    this.leaderboard.saveName(name);

    // Submit to global leaderboard
    const result = await this.leaderboard.submitScore(
      name,
      this.scoring.totalScore,
      this.scoring.stageNum,
    );

    if (result && result.rank) {
      this.globalRank = result.rank;
    }

    this.state = 'gameOver';
  }

  _skipNameEntry() {
    this.audio.playClick();
    // Save locally but don't submit to global leaderboard
    this.state = 'gameOver';
  }

  // --- Leaderboard ---

  _openLeaderboard() {
    this.leaderboardReturnState = this.state;
    this.state = 'leaderboard';
    this.audio.playClick();
    this.leaderboard.fetchBoth();
  }

  _exitLeaderboard() {
    this.audio.playClick();
    this.state = this.leaderboardReturnState || 'title';
  }

  _handleLeaderboardTap(x, y) {
    // Back button
    const backBtn = this.screens.getLeaderboardBackButtonRect(this.canvas);
    if (this.screens._hitTest(x, y, backBtn)) {
      this._exitLeaderboard();
      return;
    }

    // Tab buttons
    const tabs = this.screens.getLeaderboardTabRects(this.canvas);
    if (this.screens._hitTest(x, y, tabs.alltime)) {
      this.screens.leaderboardTab = 'alltime';
      this.audio.playClick();
      return;
    }
    if (this.screens._hitTest(x, y, tabs.daily)) {
      this.screens.leaderboardTab = 'daily';
      this.audio.playClick();
      return;
    }
  }

  // --- Core game flow ---

  startGame() {
    this.audio.init();
    this.audio.resume();
    this.audio.playClick();

    this.state = 'playing';
    this.scoring.reset();
    this.ball.reset();
    this.particles.clear();
    this.hud.notifications = [];
    this.globalRank = null;

    // Set hoop movement for stage 1
    this.hoop.setMovement(this.scoring.stageData.hoopSpeed, this.scoring.stageData.hoopAmplitude);
    this.hoop.setFireIntensity(0);
  }

  returnToTitle() {
    this.audio.playClick();
    this.state = 'title';
    this.ball.reset();
    this.particles.clear();
  }

  _createPauseButton() {
    this.pauseBtn = document.createElement('button');
    this.pauseBtn.id = 'pause-btn';
    this.pauseBtn.textContent = 'PAUSE';
    this.pauseBtn.style.display = 'none';
    this.pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePause();
    });
    document.body.appendChild(this.pauseBtn);
  }

  _updatePauseButton() {
    if (!this.pauseBtn) return;
    const showBtn = this.state === 'playing';
    this.pauseBtn.style.display = showBtn ? 'block' : 'none';
  }

  togglePause() {
    if (this.state === 'playing') {
      this.previousState = 'playing';
      this.state = 'paused';
      showFab();
    } else if (this.state === 'paused') {
      this.state = this.previousState || 'playing';
      hideFab();
    }
    this._updatePauseButton();
  }

  start() {
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05); // cap dt
    this.lastTime = timestamp;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    this.screens.update(dt);
    this.hud.update(dt);
    this.particles.update(dt);

    if (this.state === 'title' || this.state === 'leaderboard' || this.state === 'nameEntry') {
      this.lane.update(dt);
      this.hoop.update(dt);
      return;
    }

    if (this.state === 'paused') return;

    if (this.state === 'playing') {
      this._updatePlaying(dt);
    } else if (this.state === 'stageClear') {
      this._updateStageClear(dt);
    }
  }

  _updatePlaying(dt) {
    this.world3d.step(dt);
    this.lane.update(dt);
    this.hoop.update(dt);
    this.ball.update(dt);

    // Fire particles on hoop when streak active
    const streakLevel = this.scoring.getStreakLevel();
    if (streakLevel >= 2) {
      this.hoop.setFireIntensity(streakLevel * 0.3);
      this.particles.emitFire(this.hoop.x, this.hoop.y, streakLevel * 0.3);
    } else {
      this.hoop.setFireIntensity(0);
    }

    // Update timer
    const timerResult = this.scoring.updateTimer(dt);

    if (timerResult.bonusTimeJustStarted) {
      this.audio.playBonusTime();
      this.hud.addNotification('BONUS TIME!', 1.2);
    }

    // Bonus time edge particles (throttled to ~10/sec)
    if (this.scoring.bonusTimeActive) {
      this.edgePulseTimer += dt;
      if (this.edgePulseTimer >= 0.1) {
        this.particles.emitEdgePulse(this.canvas.width, this.canvas.height);
        this.edgePulseTimer = 0;
      }
    } else {
      this.edgePulseTimer = 0;
    }

    // Check ball collision with hoop
    if (this.ball.active) {
      const collision = this.hoop.checkCollision(this.ball);

      if (collision === 'swish' || collision === 'score') {
        this._onScore(collision === 'swish');
      } else if (collision === 'rim' || collision === 'rim_score_pending') {
        this.audio.playRimHit();
      }

      // Ball missed (went off screen or too far)
      if (this.ball.missed) {
        this._onMiss();
      }
    }

    // Reset ball after it's done
    if (this.ball.scored || this.ball.missed) {
      this.ballResetTimer += dt;
      if (this.ballResetTimer > 0.6) {
        this.ball.reset();
        this.ball.streakLevel = this.scoring.getStreakLevel();
        this.hoop.resetForShot();
        this.ballResetTimer = 0;
      }
    }

    // Check stage complete before time-up (completing target trumps timer)
    if (this.scoring.isStageComplete() && this.state === 'playing') {
      this._onStageClear();
      return;
    }

    // Check time's up
    if (timerResult.timeUp && this.state === 'playing') {
      this._onTimeUp();
    }
  }

  _onScore(isSwish) {
    this.ball.scored = true;
    this.ball.active = false;
    this.ball.visible = false;
    this.ballResetTimer = 0;

    const result = this.scoring.scoreShot(isSwish);
    this.hoop.triggerNetRipple();

    // Audio
    if (isSwish) {
      this.audio.playSwish();
    }
    this.audio.playScore();

    if (result.streakMilestone) {
      this.audio.playStreakMilestone();
    }

    // Notifications
    for (const text of result.notifications) {
      this.hud.addNotification(text);
    }

    // Points popup
    this.hud.addNotification(`+${result.points}`, 0.6);

    // Particles
    this.particles.emitScoreBurst(this.hoop.x, this.hoop.y);
  }

  _onMiss() {
    if (this.ball.missed && this.ball.active) {
      this.ball.active = false;
      this.ballResetTimer = 0;
      this.scoring.missShot();
      this.audio.playMiss();
    }
  }

  _onStageClear() {
    this.state = 'stageClear';
    this.screens.startStageClear();
    this.audio.playStageClear();
    this.particles.emitCelebration(this.canvas.width, this.canvas.height);
    this.ball.reset();
  }

  _onTimeUp() {
    this.audio.playTimeUp();
    this.screens.startFlash();
    this.scoring.saveHighScore();
    this.ball.reset();

    // Go to name entry screen instead of directly to game over
    this.state = 'nameEntry';
    this.screens.initNameEntry(this.leaderboard.playerName);
    this.globalRank = null;
  }

  _updateStageClear(dt) {
    this.world3d.step(dt);
    this.lane.update(dt);
    this.hoop.update(dt);

    const done = this.screens.updateStageClear(dt);
    if (done) {
      this.scoring.advanceStage();
      this.hoop.setMovement(this.scoring.stageData.hoopSpeed, this.scoring.stageData.hoopAmplitude);
      this.ball.reset();
      this.state = 'playing';
    }
  }

  render() {
    const { ctx, canvas } = this;

    // Update pause button visibility
    this._updatePauseButton();

    // 3D scene draws to its own canvas; here we render the 2D HUD overlay.
    this.world3d.render();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (this.state === 'title') {
      this.particles.render(ctx);
      this.screens.renderTitle(ctx, canvas, this.scoring.getBestScore());
      return;
    }

    if (this.state === 'playing' || this.state === 'paused') {
      this.particles.render(ctx);
      this.hud.render(ctx, canvas, this.scoring);

      if (this.state === 'paused') {
        this.screens.renderPause(ctx, canvas);
      }

      // Draw drag indicator
      if (this.input.isDragging() && !this.ball.active) {
        this._renderDragIndicator(ctx);
      }
      return;
    }

    if (this.state === 'stageClear') {
      this.particles.render(ctx);
      this.hud.render(ctx, canvas, this.scoring);
      this.screens.renderStageClear(ctx, canvas, this.scoring);
      return;
    }

    if (this.state === 'nameEntry') {
      this.particles.render(ctx);
      this.screens.renderNameEntry(ctx, canvas, this.scoring.totalScore, this.scoring.stageNum);
      return;
    }

    if (this.state === 'gameOver') {
      this.particles.render(ctx);
      this.screens.renderGameOver(ctx, canvas, this.scoring, this.globalRank);
      return;
    }

    if (this.state === 'leaderboard') {
      this.particles.render(ctx);
      this.screens.renderLeaderboard(ctx, canvas, this.leaderboard);
      return;
    }
  }

  // Solve for the launch speed that puts the ball in the rim at a 55° arc, then
  // convert to a [0..1] power-meter fraction. Tracks moving hoops live.
  _perfectShotNorm() {
    const spawn = COURT.ballSpawn;
    const rimX = COURT.rim.x + (this.hoop.offsetX || 0);
    const R = Math.sqrt((spawn.x - rimX) ** 2 + (spawn.z - COURT.rim.z) ** 2);
    const h = COURT.rim.y - spawn.y;
    const theta = 55 * Math.PI / 180;
    const denom = 2 * Math.cos(theta) ** 2 * (R * Math.tan(theta) - h);
    if (denom <= 0) return 0.5;
    const v0 = Math.sqrt((9.82 * R * R) / denom);
    // Same mapping as launchVector: speed ∈ [6.5, 11.5] m/s → power norm ∈ [0, 1]
    return clamp((v0 - 6.5) / 5, 0.05, 0.95);
  }

  // Predict the shot analytically (exact ballistic solution) and emit sample
  // points along the visible rising portion of the arc.
  _predictShot(delta) {
    const ref = this.canvas.height * 0.55;
    const norm = Math.min(Math.abs(delta.dy) / ref, 1);
    const power = 300 + norm * 1500;
    const lateralAngle = delta.dx / Math.max(Math.abs(delta.dy), 1);
    const v = launchVector(power, lateralAngle);

    const spawn = COURT.ballSpawn;
    const rimX = COURT.rim.x + (this.hoop.offsetX || 0);
    const rimY = COURT.rim.y;
    const rimZ = COURT.rim.z;
    const rimR = COURT.rimRadius;
    const g = 9.82;

    // Analytical outcome: find when the ball would re-cross the rim plane on
    // descent. y(t) = y0 + vy·t − ½·g·t² = rimY  ⇒ two roots; take the larger.
    let outcome = 'miss';
    const disc = v.vy * v.vy - 2 * g * (rimY - spawn.y);
    if (disc > 0) {
      const tCross = (v.vy + Math.sqrt(disc)) / g;
      const xAt = spawn.x + v.vx * tCross;
      const zAt = spawn.z + v.vz * tCross;
      const horizErr = Math.hypot(xAt - rimX, zAt - rimZ);
      // Clean-pass clearance: rim_R − ball_R − tube_R − safety. Anything
      // tighter than that and the ball clears without touching the rim.
      const swishMax = rimR - COURT.ballRadius - COURT.rimTube - 0.015;
      if (horizErr < swishMax) outcome = 'swish';
      else if (horizErr < rimR * 0.95) outcome = 'rim';
    }

    // Visible arc samples — analytical, up to 70% of time-to-apex.
    const apexT = Math.max(0, v.vy / g);
    const visEnd = apexT * 0.7;
    const N = 20;
    const samples = [];
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * visEnd;
      samples.push(new THREE.Vector3(
        spawn.x + v.vx * t,
        spawn.y + v.vy * t - 0.5 * g * t * t,
        spawn.z + v.vz * t,
      ));
    }
    return { samples, outcome, norm };
  }

  _renderDragIndicator(ctx) {
    const delta = this.input.getDragDelta();
    if (delta.dy >= 0) return; // only show for upward drags

    const screen = this.ball.getScreenPos();
    const startX = screen.x;
    const startY = screen.y;

    const pred = this._predictShot(delta);
    const power = pred.norm;
    const outcomeColors = { swish: COLORS.scoreGreen, rim: '#FFCC00', miss: '#FF4D4D' };
    const arcColor = outcomeColors[pred.outcome];

    // ── Predictive arc — short, fades before apex ──────────────────────
    this._renderArcPreview(ctx, pred, arcColor);

    // ── Aim arrow — long, thick, with arrowhead. Tinted by outcome. ────
    const tipX = startX + delta.dx * 0.9;
    const tipY = startY + delta.dy * 0.9;

    ctx.save();
    ctx.shadowColor = arcColor;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = arcColor;
    ctx.fillStyle = arcColor;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    const ang = Math.atan2(tipY - startY, tipX - startX);
    const headLen = 26;
    const headWide = Math.PI / 7;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - Math.cos(ang - headWide) * headLen, tipY - Math.sin(ang - headWide) * headLen);
    ctx.lineTo(tipX - Math.cos(ang + headWide) * headLen, tipY - Math.sin(ang + headWide) * headLen);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ── Power meter with sweet-spot zone ───────────────────────────────
    const w = this.canvas.width;
    const h = this.canvas.height;
    const barH = Math.min(h * 0.5, 360);
    const barW = 22;
    const barX = w - barW - 26;
    const barY = (h - barH) / 2;

    // Track
    ctx.save();
    ctx.fillStyle = 'rgba(10, 14, 26, 0.7)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    this.screens._roundRect(ctx, barX, barY, barW, barH, 6);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Sweet-spot zone — green band at the perfect-shot fraction
    const sweet = this._perfectShotNorm();
    const sweetBand = 0.06; // ±6% tolerance
    const zoneTop = barY + barH - barH * Math.min(1, sweet + sweetBand);
    const zoneH = barH * (2 * sweetBand);
    ctx.save();
    ctx.fillStyle = 'rgba(0, 255, 65, 0.35)';
    ctx.strokeStyle = COLORS.scoreGreen;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = COLORS.scoreGreen;
    ctx.shadowBlur = 10;
    ctx.fillRect(barX + 2, zoneTop, barW - 4, zoneH);
    ctx.strokeRect(barX + 2, zoneTop, barW - 4, zoneH);
    ctx.restore();

    // Sweet-spot tick label
    ctx.save();
    ctx.strokeStyle = COLORS.scoreGreen;
    ctx.fillStyle = COLORS.scoreGreen;
    ctx.lineWidth = 1.5;
    const sweetY = barY + barH - barH * sweet;
    ctx.beginPath();
    ctx.moveTo(barX - 14, sweetY);
    ctx.lineTo(barX - 2, sweetY);
    ctx.stroke();
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('PERFECT', barX - 16, sweetY + 3);
    ctx.restore();

    // Live power fill
    const fillH = barH * power;
    ctx.save();
    const grad = ctx.createLinearGradient(0, barY + barH, 0, barY);
    grad.addColorStop(0, COLORS.primary);
    grad.addColorStop(0.55, '#ffd34d');
    grad.addColorStop(1, COLORS.secondary);
    ctx.fillStyle = grad;
    ctx.shadowColor = arcColor;
    ctx.shadowBlur = 16;
    this.screens._roundRect(ctx, barX + 2, barY + barH - fillH + 2, barW - 4, Math.max(0, fillH - 4), 4);
    ctx.fill();
    ctx.restore();

    // Power readout & label
    ctx.save();
    ctx.fillStyle = arcColor;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('POWER', barX + barW / 2, barY - 12);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`${Math.round(power * 100)}%`, barX + barW / 2, barY + barH + 22);
    ctx.restore();
  }

  _renderArcPreview(ctx, pred, color) {
    const { samples } = pred;
    if (samples.length < 4) return;

    const projected = samples.map((s) => this.world3d.projectToScreen(s));
    if (projected.length < 2) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

    // Draw as a series of fading dashed segments
    for (let i = 1; i < projected.length; i++) {
      const t = i / (projected.length - 1);
      const alpha = (1 - t) * 0.85;
      if (alpha <= 0.05) continue;
      ctx.strokeStyle = withAlpha(color, alpha);
      ctx.beginPath();
      ctx.moveTo(projected[i - 1].x, projected[i - 1].y);
      ctx.lineTo(projected[i].x, projected[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Convert a hex color (#RRGGBB / #RGB) to rgba() with the given alpha.
function withAlpha(hex, a) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
