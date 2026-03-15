// Game state machine and main loop

import { COLORS, clamp, MIN_THROW_SPEED, MAX_THROW_SPEED } from './utils.js';
import { Ball } from './ball.js';
import { Hoop } from './hoop.js';
import { Lane } from './lane.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Particles } from './particles.js';
import { Scoring } from './scoring.js';
import { Screens } from './screens.js';
import { Leaderboard } from './leaderboard.js';

export class Game {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    // States: title, playing, stageClear, gameOver, paused, nameEntry, leaderboard
    this.state = 'title';
    this.lastTime = 0;

    // Initialize subsystems
    this.ball = new Ball(canvas);
    this.hoop = new Hoop(canvas);
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

  togglePause() {
    if (this.state === 'playing') {
      this.previousState = 'playing';
      this.state = 'paused';
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
