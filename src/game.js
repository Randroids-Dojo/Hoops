// Game state machine and main loop

import { COLORS, clamp, MIN_THROW_SPEED, MAX_THROW_SPEED } from './utils.js';
import { Ball } from './ball.js';
import { Hoop } from './hoop.js';
import { Lane } from './lane.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { Scoring } from './scoring.js';
import { Screens } from './screens.js';

export class Game {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.state = 'title'; // title, playing, stageClear, gameOver, paused
    this.lastTime = 0;

    // Initialize subsystems
    this.ball = new Ball(canvas);
    this.hoop = new Hoop(canvas);
    this.lane = new Lane();
    this.hud = new HUD();
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.particles = new Particles();
    this.scoring = new Scoring();
    this.screens = new Screens();

    this.ballResetTimer = 0;
    this.previousState = null; // for pause

    this._setupInput();
    this._setupKeyboard();
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
        this.startGame();
      } else if (this.state === 'gameOver') {
        this.returnToTitle();
      } else if (this.state === 'paused') {
        this.togglePause();
      }
    };
  }

  _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.state === 'playing' || this.state === 'paused') {
          this.togglePause();
        }
      }
      if (e.key === 'm' || e.key === 'M') {
        this.audio.toggle();
      }
    });
  }

  startGame() {
    this.audio.init();
    this.audio.resume();
    this.audio.playClick();

    this.state = 'playing';
    this.scoring.reset();
    this.ball.reset();
    this.particles.clear();
    this.hud.notifications = [];

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

  togglePause() {
    if (this.state === 'playing') {
      this.previousState = 'playing';
      this.state = 'paused';
      this.input.enabled = true;
    } else if (this.state === 'paused') {
      this.state = this.previousState || 'playing';
    }
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

    if (this.state === 'title') {
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

    // Bonus time edge particles
    if (this.scoring.bonusTimeActive) {
      this.particles.emitEdgePulse(this.canvas.width, this.canvas.height);
    }

    // Check ball collision with hoop
    if (this.ball.active) {
      const collision = this.hoop.checkCollision(this.ball);

      if (collision === 'swish' || collision === 'score') {
        this._onScore(collision === 'swish');
      } else if (collision === 'rim') {
        this.audio.playRimHit();
      }

      // Ball missed (went off screen or too far)
      if (this.ball.missed) {
        this._onMiss();
      }
    }

    // Reset ball after it's done
    if ((this.ball.scored || this.ball.missed) && !this.ball.active) {
      // Ball is already being reset via timer
    }
    if (this.ball.scored || this.ball.missed) {
      this.ballResetTimer += dt;
      if (this.ballResetTimer > 0.6) {
        this.ball.reset();
        this.ball.streakLevel = this.scoring.getStreakLevel();
        this.ballResetTimer = 0;
      }
    }

    // Check time's up
    if (timerResult.timeUp) {
      this._onTimeUp();
    }

    // Check stage complete
    if (this.scoring.isStageComplete() && this.state === 'playing') {
      this._onStageClear();
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
    this.state = 'gameOver';
    this.audio.playTimeUp();
    this.screens.startFlash();
    this.scoring.saveHighScore();
    this.ball.reset();
  }

  _updateStageClear(dt) {
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

    // Clear
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Always render lane and hoop as background
    this.lane.render(ctx, canvas);
    this.hoop.render(ctx);

    if (this.state === 'title') {
      this.particles.render(ctx);
      this.screens.renderTitle(ctx, canvas, this.scoring.getBestScore());
      return;
    }

    if (this.state === 'playing' || this.state === 'paused') {
      this.ball.render(ctx);
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

    if (this.state === 'gameOver') {
      this.particles.render(ctx);
      this.screens.renderGameOver(ctx, canvas, this.scoring);
      return;
    }
  }

  _renderDragIndicator(ctx) {
    const delta = this.input.getDragDelta();
    if (delta.dy >= 0) return; // only show for upward drags

    const startX = this.ball.x;
    const startY = this.ball.y;

    // Arrow showing throw direction
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + delta.dx * 0.3, startY + delta.dy * 0.3);
    ctx.stroke();
    ctx.setLineDash([]);

    // Power indicator
    const power = Math.abs(delta.dy) / this.canvas.height;
    const barWidth = 4;
    const barHeight = 60;
    const barX = this.ball.x + 40;
    const barY = this.ball.y - barHeight;

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const fillHeight = barHeight * Math.min(power * 2, 1);
    ctx.fillStyle = power > 0.4 ? COLORS.secondary : COLORS.primary;
    ctx.fillRect(barX, barY + barHeight - fillHeight, barWidth, fillHeight);
  }
}
