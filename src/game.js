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

const BALL_POOL_SIZE = 5;

// How much the oscillating power meter can shift the drag-chosen power at
// release. 0 = meter does nothing (drag controls all); 1 = meter swings the
// final power by ±0.5 of the full range. ±0.25 of range feels like a real
// "timing adjustment" without overpowering the drag aim.
const METER_ADJUST_SCALE = 0.5;
// The meter's "PERFECT" mark sits at the center of the bar — releasing
// there means no adjustment to the drag-aim.
const METER_PERFECT_NORM = 0.5;

export class Game {
  constructor(canvas, ctx, world3d) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.world3d = world3d;
    // States: title, playing, stageClear, gameOver, paused, nameEntry, leaderboard
    this.state = 'title';
    this.lastTime = 0;

    // Ball pool — a fresh ball is spawned as soon as the previous one hits
    // hardware or the floor, so the player never waits for a reset.
    this.balls = [];
    for (let i = 0; i < BALL_POOL_SIZE; i++) {
      this.balls.push(new Ball(world3d));
    }
    this.activeBallIdx = 0;
    this.balls[0].placeAtSpawn();
    for (let i = 1; i < this.balls.length; i++) this.balls[i].retire();

    this._installContactListener();

    this.hoop = new Hoop(world3d);
    this.lane = new Lane();
    this.hud = new HUD();
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.particles = new Particles();
    this.scoring = new Scoring();
    this.screens = new Screens();
    this.leaderboard = new Leaderboard();

    this.edgePulseTimer = 0;
    this.previousState = null; // for pause

    // Oscillating power meter — sweeps 0..1..0 sinusoidally during play. The
    // shot's power is whatever the meter reads at the moment of release, so
    // the player times their flick against the moving bar.
    this._meterPhase = 0;
    this._meterRateHz = 1.1;
    this.leaderboardReturnState = 'title'; // where to go back from leaderboard
    this.globalRank = null; // rank from last submission

    this._setupInput();
    this._setupKeyboard();
    this._createPauseButton();
    initFeedbackFab();
  }

  get activeBall() {
    return this.balls[this.activeBallIdx];
  }

  // Current power meter value in [0..1], sinusoidal sweep.
  _currentMeterPower() {
    return (1 - Math.cos(this._meterPhase)) / 2;
  }

  // Tag-along listener: every ball-vs-hardware/floor contact stamps the ball
  // so the game loop can promote the next ball without waiting for a timer.
  // Rim and backboard contacts are stamped separately — banks shouldn't be
  // promoted from 'swish' to 'score' by a board touch, and bare-rim grazes
  // shouldn't be muted by a backboard timestamp.
  _installContactListener() {
    this.world3d.physicsWorld.addEventListener('beginContact', (e) => {
      const a = e.bodyA, b = e.bodyB;
      const ballBody = a.userData?.isBall ? a : (b.userData?.isBall ? b : null);
      const otherBody = ballBody === a ? b : a;
      if (!ballBody || !otherBody) return;
      const ball = ballBody.userData.ball;
      if (!ball || !ball.active) return;
      ball.hasContacted = true;
      const now = performance.now() / 1000;
      if (otherBody.userData?.isRim) ball.lastRimContactTime = now;
      else if (otherBody.userData?.isBackboard) ball.lastBackboardContactTime = now;
    });
  }

  _promoteNextBall() {
    // Round-robin to the next ball in the pool. First pass: prefer a fully
    // retired/hidden slot so we don't teleport an in-flight ball back to
    // spawn mid-bounce. Second pass: any inactive slot (visible-but-settled
    // is fine, the user will see it just sit). Last resort: force-recycle
    // the oldest live ball.
    const n = this.balls.length;
    const streak = this.scoring.getStreakLevel();
    for (let i = 1; i <= n; i++) {
      const idx = (this.activeBallIdx + i) % n;
      const b = this.balls[idx];
      if (!b.visible) {
        this.activeBallIdx = idx;
        b.placeAtSpawn();
        b.setStreakLevel(streak);
        return;
      }
    }
    for (let i = 1; i <= n; i++) {
      const idx = (this.activeBallIdx + i) % n;
      const b = this.balls[idx];
      if (!b.active) {
        this.activeBallIdx = idx;
        b.placeAtSpawn();
        b.setStreakLevel(streak);
        return;
      }
    }
    const idx = (this.activeBallIdx + 1) % n;
    this.balls[idx].retire();
    this.balls[idx].placeAtSpawn();
    this.balls[idx].setStreakLevel(streak);
    this.activeBallIdx = idx;
  }

  _setupInput() {
    this.input.onThrow = (dragPowerNorm, lateralAngle) => {
      if (this.state === 'playing' && !this.activeBall.active) {
        // Two interacting skills:
        //   - drag length sets the *intended* power (size of the arc)
        //   - meter timing nudges the actual delivered power up or down
        // Meter centered (~0.5) = perfect timing = no adjustment. Top of
        // the meter over-delivers (sends the ball further), bottom under-
        // delivers. Over-aim + early release can compensate, and vice
        // versa — two dimensions the player feels out.
        const meterNorm = this._currentMeterPower();
        const adjust = (meterNorm - 0.5) * METER_ADJUST_SCALE;
        const finalNorm = clamp(dragPowerNorm + adjust, 0, 1);
        const launchPower = MIN_THROW_SPEED + finalNorm * (MAX_THROW_SPEED - MIN_THROW_SPEED);
        this.activeBall.setStreakLevel(this.scoring.getStreakLevel());
        this.activeBall.throwBall(launchPower, lateralAngle);
        this.audio.playThrow();
      }
    };

    this.input.onTap = (x, y) => {
      if (this.state === 'title') {
        this._handleTitleTap(x, y);
      } else if (this.state === 'gameOver') {
        this._handleGameOverTap(x, y);
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

  _handleGameOverTap(x, y) {
    const restartBtn = this.screens.getRestartButtonRect(this.canvas);
    // startGame() already plays a click, so we don't double up here.
    if (this.screens._hitTest(x, y, restartBtn)) {
      this.startGame();
      return;
    }
    const titleBtn = this.screens.getTitleLinkRect(this.canvas);
    if (this.screens._hitTest(x, y, titleBtn)) {
      this.returnToTitle();
    }
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
    this._resetBallPool();
    this.particles.clear();
    this.hud.notifications = [];
    this.globalRank = null;

    // Set hoop movement for stage 1
    this.hoop.setMovement(this.scoring.stageData.hoopSpeed, this.scoring.stageData.hoopAmplitude);
    this.hoop.setFireIntensity(0);
  }

  _resetBallPool() {
    for (const b of this.balls) b.retire();
    this.activeBallIdx = 0;
    this.activeBall.placeAtSpawn();
  }

  returnToTitle() {
    this.audio.playClick();
    this.state = 'title';
    this._resetBallPool();
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
      this.hoop.update(dt, this.balls);
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
    // Hoop.update() moves its kinematic rim/backboard bodies via
    // _reposition(); it must run before the physics step so collisions
    // resolve against the current frame's pose (matters on moving stages).
    this.lane.update(dt);
    this.hoop.update(dt, this.balls);
    this.world3d.step(dt);
    for (const b of this.balls) b.update(dt);

    // Advance the oscillating power meter so it sweeps 0→1→0 sinusoidally.
    this._meterPhase += dt * 2 * Math.PI * this._meterRateHz;

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

    // Scoring + miss detection across every in-flight ball
    for (const ball of this.balls) {
      // Retire settled balls (post-contact, at rest) so the pool can recycle.
      if (ball.isSettled() && ball !== this.activeBall) {
        ball.retire();
        continue;
      }
      if (!ball.active) continue;

      const collision = this.hoop.checkCollision(ball);
      if (collision === 'swish' || collision === 'score') {
        this._onScore(collision === 'swish', ball);
      } else if (collision === 'rim') {
        this.audio.playRimHit();
      }
      if (ball.missed) this._onMiss(ball);
    }

    // As soon as the active ball has hit something (or scored/missed),
    // promote the next ball in the pool so the player can shoot again.
    const active = this.activeBall;
    if (active.hasContacted || active.scored || active.missed) {
      this._promoteNextBall();
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

  _onScore(isSwish, ball) {
    if (!ball.active) return;
    ball.active = false;
    ball.scored = true;
    ball.hasContacted = true;

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

  _onMiss(ball) {
    if (!ball.active || !ball.missed) return;
    ball.active = false;
    ball.hasContacted = true;
    this.scoring.missShot();
    this.audio.playMiss();
  }

  _onStageClear() {
    this.state = 'stageClear';
    this.screens.startStageClear();
    this.audio.playStageClear();
    this.particles.emitCelebration(this.canvas.width, this.canvas.height);
    this._resetBallPool();
  }

  _onTimeUp() {
    this.audio.playTimeUp();
    this.screens.startFlash();
    this.scoring.saveHighScore();
    this._resetBallPool();

    // Go to name entry screen instead of directly to game over
    this.state = 'nameEntry';
    this.screens.initNameEntry(this.leaderboard.playerName);
    this.globalRank = null;
  }

  _updateStageClear(dt) {
    // Same ordering rule as _updatePlaying: kinematic hoop bodies update
    // before the physics step.
    this.lane.update(dt);
    this.hoop.update(dt, this.balls);
    this.world3d.step(dt);

    const done = this.screens.updateStageClear(dt);
    if (done) {
      this.scoring.advanceStage();
      this.hoop.setMovement(this.scoring.stageData.hoopSpeed, this.scoring.stageData.hoopAmplitude);
      this._resetBallPool();
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

      // Power meter is always visible during play — the player times their
      // release against it.
      if (this.state === 'playing' && !this.activeBall.active) {
        this._renderPowerMeter(ctx);
      }

      // While dragging: also show the live trajectory arc + landing reticle
      // for the current meter power and aim direction.
      if (this.input.isDragging() && !this.activeBall.active) {
        this._renderAimArc(ctx);
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

  // Predict the shot analytically for the player's *current drag*. The
  // arc + reticle grow with drag length and tilt with lateral motion, so
  // the player sees their aim take shape in real time. Meter timing is
  // applied separately at release — this preview assumes a perfect-meter
  // (neutral) release.
  _predictShot(delta) {
    const norm = this.input.getDragPowerNorm();
    const power = MIN_THROW_SPEED + norm * (MAX_THROW_SPEED - MIN_THROW_SPEED);
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
    let landing = null;
    const disc = v.vy * v.vy - 2 * g * (rimY - spawn.y);
    if (disc > 0) {
      const tCross = (v.vy + Math.sqrt(disc)) / g;
      const xAt = spawn.x + v.vx * tCross;
      const zAt = spawn.z + v.vz * tCross;
      landing = new THREE.Vector3(xAt, rimY, zAt);
      const horizErr = Math.hypot(xAt - rimX, zAt - rimZ);
      // Clean-pass clearance: rim_R − ball_R − tube_R − safety. Anything
      // tighter than that and the ball clears without touching the rim.
      const swishMax = rimR - COURT.ballRadius - COURT.rimTube - 0.015;
      if (horizErr < swishMax) outcome = 'swish';
      else if (horizErr < rimR * 0.95) outcome = 'rim';
    }
    if (!landing) {
      // No valid trajectory — synthesize a fallback landing point ahead of
      // the ball so the drag indicator still has something to draw at.
      landing = new THREE.Vector3(spawn.x, rimY, rimZ);
    }

    return { landing, outcome, norm };
  }

  // Live, always-on power meter. The sweep ticks across the bar regardless
  // of whether the player is currently dragging. PERFECT sits at the
  // center (0.5) — releasing there means the meter doesn't adjust the
  // drag-chosen power. Above center over-delivers; below under-delivers.
  _renderPowerMeter(ctx) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const power = this._currentMeterPower();
    const sweet = METER_PERFECT_NORM;
    const sweetBand = 0.06;
    const inSweet = Math.abs(power - sweet) < sweetBand;
    const trackColor = inSweet ? COLORS.scoreGreen : COLORS.primary;

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

    // Sweet-spot zone
    const zoneTop = barY + barH - barH * Math.min(1, sweet + sweetBand);
    const zoneH = barH * (2 * sweetBand);
    ctx.save();
    ctx.fillStyle = 'rgba(0, 255, 65, 0.32)';
    ctx.strokeStyle = COLORS.scoreGreen;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = COLORS.scoreGreen;
    ctx.shadowBlur = inSweet ? 16 : 10;
    ctx.fillRect(barX + 2, zoneTop, barW - 4, zoneH);
    ctx.strokeRect(barX + 2, zoneTop, barW - 4, zoneH);
    ctx.restore();

    // PERFECT label tick
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

    // Live oscillating fill
    const fillH = barH * power;
    ctx.save();
    const grad = ctx.createLinearGradient(0, barY + barH, 0, barY);
    grad.addColorStop(0, COLORS.primary);
    grad.addColorStop(0.55, '#ffd34d');
    grad.addColorStop(1, COLORS.secondary);
    ctx.fillStyle = grad;
    ctx.shadowColor = trackColor;
    ctx.shadowBlur = 18;
    this.screens._roundRect(ctx, barX + 2, barY + barH - fillH + 2, barW - 4, Math.max(0, fillH - 4), 4);
    ctx.fill();
    ctx.restore();

    // Moving indicator line at the current power level — makes the sweep
    // motion easy to read at a glance.
    ctx.save();
    const indY = barY + barH - fillH;
    ctx.strokeStyle = trackColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = trackColor;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(barX - 4, indY);
    ctx.lineTo(barX + barW + 4, indY);
    ctx.stroke();
    ctx.restore();

    // Label
    ctx.save();
    ctx.fillStyle = trackColor;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('POWER', barX + barW / 2, barY - 12);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`${Math.round(power * 100)}%`, barX + barW / 2, barY + barH + 22);
    ctx.restore();
  }

  // Drag indicator — only the trajectory arc + landing reticle. Power comes
  // from the live oscillating meter; the drag direction controls lateral
  // aim only.
  _renderAimArc(ctx) {
    const delta = this.input.getDragDelta();
    if (delta.dy >= 0) return; // require upward drag to indicate intent

    const start = this.activeBall.getScreenPos();
    const pred = this._predictShot(delta);
    const outcomeColors = { swish: COLORS.scoreGreen, rim: '#FFCC00', miss: '#FF4D4D' };
    const arcColor = outcomeColors[pred.outcome];

    const landing = this.world3d.projectToScreen(pred.landing);
    this._renderTrajectoryArc(ctx, start, landing, arcColor, pred.outcome);
  }

  _renderTrajectoryArc(ctx, start, landing, color, outcome) {
    // Quadratic Bezier with the control point lifted above and to the side
    // of the chord. A pure vertical lift would project to a straight line
    // for centered aim, so we always offset horizontally as well so the
    // arc has a clearly visible "rainbow" bend.
    const mx = (start.x + landing.x) / 2;
    const my = (start.y + landing.y) / 2;
    const dx = landing.x - start.x;
    const dy = landing.y - start.y;
    const dist = Math.hypot(dx, dy);
    const arcLift = Math.min(dist * 0.34, 240);
    // Side-bulge direction: perpendicular to the chord, pointing right of
    // the player's forward direction. For a near-vertical chord, this is
    // essentially +X (right). For a sideways chord, it stays "above" it.
    const perpX = -dy / Math.max(dist, 1);
    const sideBulge = Math.min(dist * 0.18, 70);
    const cx = mx + perpX * sideBulge;
    const cy = my - arcLift;

    // Build a path of small segments along the curve so we can fade the
    // alpha along its length — gives the trajectory a clearer launch end
    // and softer landing.
    const N = 28;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const omt = 1 - t;
      pts.push({
        x: omt * omt * start.x + 2 * omt * t * cx + t * t * landing.x,
        y: omt * omt * start.y + 2 * omt * t * cy + t * t * landing.y,
      });
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;

    for (let i = 1; i < pts.length; i++) {
      const t = i / N;
      const alpha = 0.35 + 0.55 * (1 - t);  // brighter near the ball
      ctx.strokeStyle = withAlpha(color, alpha);
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }

    // Landing reticle — small ring + dot at the predicted landing point.
    const reticleR = outcome === 'swish' ? 18 : 14;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.fillStyle = withAlpha(color, 0.25);
    ctx.beginPath();
    ctx.arc(landing.x, landing.y, reticleR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(landing.x, landing.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Crosshair tick marks for the reticle so it reads as a target.
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(landing.x - reticleR - 4, landing.y);
    ctx.lineTo(landing.x - reticleR + 2, landing.y);
    ctx.moveTo(landing.x + reticleR - 2, landing.y);
    ctx.lineTo(landing.x + reticleR + 4, landing.y);
    ctx.moveTo(landing.x, landing.y - reticleR - 4);
    ctx.lineTo(landing.x, landing.y - reticleR + 2);
    ctx.moveTo(landing.x, landing.y + reticleR - 2);
    ctx.lineTo(landing.x, landing.y + reticleR + 4);
    ctx.stroke();

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
