// Game state machine and main loop

import * as THREE from 'three';
import { COLORS, clamp, MIN_THROW_SPEED, MAX_THROW_SPEED } from './utils.js';
import { Ball, launchVector, MIN_SPEED_MS, MAX_SPEED_MS } from './ball.js';
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
import { settings } from './settings.js';
import { tickets } from './tickets.js';
import { STREAK } from './utils.js';
import * as skins from './skins.js';
import * as coinAnim from './coinAnim.js';
import {
  DISTANCE_MODE,
  ENDLESS_MODE,
  applyDistanceMiss,
  applyDistanceScore,
  applyEndlessMiss,
  applyEndlessScore,
  createDistanceRun,
  createEndlessRun,
  distanceProgress,
  finishEndlessRun,
} from './arcadeModes.ts';

const BALL_POOL_SIZE = 5;

// How much the oscillating power meter can shift the drag-chosen power at
// release. 0 = meter does nothing (drag controls all); 1 = meter swings the
// final power by ±0.5 of the full range. ±0.25 of range feels like a real
// "timing adjustment" without overpowering the drag aim.
const METER_ADJUST_SCALE = 0.5;
// The meter's "PERFECT" mark sits high on the bar — releasing there means
// no adjustment to the drag-aim. The launch formula references this same
// constant so moving the mark doesn't change the neutral-power behavior.
const METER_PERFECT_NORM = 0.7;
const GAME_MODE = {
  CLASSIC: 'classic',
  DISTANCE: 'distance',
  ENDLESS: 'endless',
};
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

    // Power meter — starts at the bottom (0) when the player begins a drag,
    // sweeps upward sinusoidally while the pointer is held, and freezes at
    // its current value the instant the player lets go. The shot's power
    // uses whatever value is showing at release.
    this._meterPhase = 0;
    this._meterRateHz = 1.1;
    this._wasDragging = false;
    this.leaderboardReturnState = 'title'; // where to go back from leaderboard
    this.globalRank = null; // rank from last submission
    this.gameMode = GAME_MODE.CLASSIC;
    this.distanceRun = null;
    this.endlessRun = null;
    this.submittingName = false;

    this._setupInput();
    this._setupKeyboard();
    this._setupNameEntryInput();
    this._createPauseButton();
    initFeedbackFab();

    // Apply equipped skins to the freshly built scene + ball pool so the
    // player sees their cosmetics immediately on first frame.
    skins.applyAllEquipped(this);

    // Image-loaded ball skins (Miguel / Jessica / Galaxy) finish loading
    // asynchronously. When they arrive, re-apply if any pool ball is using
    // that id, so the placeholder fallback gets replaced live.
    skins.onBallTextureChange((skinId) => {
      for (const b of this.balls) {
        if (b.skinId === skinId) {
          // Force a re-apply by clearing the cached id so applySkin runs again.
          b.skinId = null;
          b.applySkin(skinId);
        }
      }
    });

    // Subscribe to ticket awards so we can dispatch coin bursts and show a
    // small notification with the reason.
    tickets.subscribe((evt) => this._onTicketEvent(evt));
  }

  _onTicketEvent(evt) {
    if (evt.type !== 'award') return;
    // Project the 3D source position to screen pixels for the coin burst.
    let src;
    if (evt.sourcePos3D) {
      src = this.world3d.projectToScreen(evt.sourcePos3D);
    } else {
      src = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    }
    const dst = coinAnim.getCounterDst();
    coinAnim.spawnBurst(src.x, src.y, dst.x, dst.y, evt.amount, tickets.balance());

    // Inline ticket-earned label as a small notification — uses existing
    // HUD notification stack so it visually queues behind SWISH/streak text.
    if (this.hud && evt.amount > 0) {
      const label = evt.reason === 'firstDaily' ? '+100 DAILY BONUS' : `+${evt.amount} TICKETS`;
      this.hud.addNotification(label, 0.55);
    }
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
      else if (otherBody.userData?.isFloor) ball.touchedFloor = true;
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
        const adjust = (meterNorm - METER_PERFECT_NORM) * METER_ADJUST_SCALE;
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
        this._handlePausedTap(x, y);
      } else if (this.state === 'settings') {
        this._handleSettingsTap(x, y);
      } else if (this.state === 'nameEntry') {
        this._handleNameEntryTap(x, y);
      } else if (this.state === 'leaderboard') {
        this._handleLeaderboardTap(x, y);
      } else if (this.state === 'store') {
        this._handleStoreTap(x, y);
      }
    };

    this.input.onSwipe = (direction) => {
      if (this.state === 'leaderboard') {
        this._cycleLeaderboardMode(direction === 'right' ? 1 : -1);
      }
    };
  }

  _cycleLeaderboardMode(delta) {
    const order = [GAME_MODE.CLASSIC, GAME_MODE.DISTANCE, GAME_MODE.ENDLESS];
    const idx = order.indexOf(this.leaderboard.mode);
    const nextIdx = ((idx === -1 ? 0 : idx) + delta + order.length) % order.length;
    const nextMode = order[nextIdx];
    if (nextMode !== this.leaderboard.mode) {
      this.audio.playClick();
      this.leaderboard.fetchBoth(nextMode);
    }
  }

  _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.state === 'playing' || this.state === 'paused') {
          this.togglePause();
        } else if (this.state === 'settings') {
          this._exitSettings();
        } else if (this.state === 'leaderboard') {
          this._exitLeaderboard();
        } else if (this.state === 'store') {
          this._exitStore();
        } else if (this.state === 'nameEntry') {
          // Skip name entry
          this._skipNameEntry();
        }
      }
      if (e.key === 'm' || e.key === 'M') {
        this.audio.toggle();
      }
      if (e.key === 'l' || e.key === 'L') {
        if (this.state === 'title' || this.state === 'gameOver' || this.state === 'paused') {
          this._openLeaderboard();
        }
      }

      // Name entry keyboard controls. When the hidden mobile-keyboard input
      // is focused, its own beforeinput/input listeners handle character
      // keys — skip here so we don't double-process.
      if (this.state === 'nameEntry' && document.activeElement !== this.nameEntryInput) {
        this._handleNameEntryKey(e.key);
      }

      // Leaderboard tab switching
      if (this.state === 'leaderboard') {
        if (e.key === 'Tab') {
          e.preventDefault();
          this.screens.toggleLeaderboardTab();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this._cycleLeaderboardMode(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          this._cycleLeaderboardMode(1);
        }
      }
    });
  }

  // --- Title screen ---

  _handleTitleTap(x, y) {
    // Check leaderboard button
    const boardBtn = this.screens.getTitleLeaderboardRect(this.canvas);
    if (this.screens._hitTest(x, y, boardBtn)) {
      this._openLeaderboard(this.leaderboard.mode);
      return;
    }
    // Store button — opens the store catalog.
    const storeBtn = this.screens.getTitleStoreRect(this.canvas);
    if (this.screens._hitTest(x, y, storeBtn)) {
      this._openStore();
      return;
    }
    const modes = this.screens.getTitleModeRects(this.canvas);
    if (this.screens._hitTest(x, y, modes.endless)) {
      this.startGame(GAME_MODE.ENDLESS);
      return;
    }
    if (this.screens._hitTest(x, y, modes.distance)) {
      this.startGame(GAME_MODE.DISTANCE);
      return;
    }
    if (this.screens._hitTest(x, y, modes.classic)) {
      this.startGame(GAME_MODE.CLASSIC);
    }
  }

  _handleGameOverTap(x, y) {
    const restartBtn = this.screens.getRestartButtonRect(this.canvas);
    // startGame() already plays a click, so we don't double up here.
    if (this.screens._hitTest(x, y, restartBtn)) {
      this.startGame(this.gameMode);
      return;
    }
    const titleBtn = this.screens.getTitleLinkRect(this.canvas);
    if (this.screens._hitTest(x, y, titleBtn)) {
      this.returnToTitle();
    }
  }

  // --- Name entry ---

  // Hidden text input that mirrors the canvas-rendered initials. Focusing it
  // is what makes mobile browsers raise the on-screen keyboard; typing into
  // it is routed back into the canvas state via beforeinput/input events.
  _setupNameEntryInput() {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'nameEntryInput';
    input.autocomplete = 'off';
    input.autocapitalize = 'characters';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'High score initials');
    // font-size: 16px prevents iOS auto-zoom on focus. The element must be
    // in-viewport (not display:none) for iOS to actually open the keyboard.
    input.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;margin:0;font-size:16px;background:transparent;color:transparent;caret-color:transparent;pointer-events:none;';
    document.body.appendChild(input);
    this.nameEntryInput = input;

    const VALID = /[A-Z0-9 ]/;

    // Backspace + Enter don't change input.value (input.value stays empty
    // because the `input` handler below resets it after every keystroke),
    // so we catch those via beforeinput. Character keystrokes are processed
    // in the input handler so we never double-count them.
    input.addEventListener('beforeinput', (e) => {
      if (this.state !== 'nameEntry') return;
      if (e.inputType === 'deleteContentBackward') {
        e.preventDefault();
        this.screens.nameBackCursor();
        this.audio.playClick();
      } else if (e.inputType === 'insertLineBreak') {
        e.preventDefault();
        this._submitName();
      }
    });

    input.addEventListener('input', () => {
      if (this.state !== 'nameEntry') {
        input.value = '';
        return;
      }
      if (input.value.length > 0) {
        for (const ch of input.value) {
          const upper = ch.toUpperCase();
          if (VALID.test(upper)) {
            this.screens.nameSetChar(upper);
            this.audio.playClick();
          }
        }
        input.value = '';
      }
    });
  }

  _focusNameEntryInput() {
    if (!this.nameEntryInput) return;
    try {
      this.nameEntryInput.focus({ preventScroll: true });
    } catch {
      this.nameEntryInput.focus();
    }
  }

  _blurNameEntryInput() {
    if (!this.nameEntryInput) return;
    this.nameEntryInput.value = '';
    this.nameEntryInput.blur();
  }

  _handleNameEntryKey(key) {
    if (key === 'Enter') {
      this._submitName();
      return;
    }
    if (key === 'Backspace' || key === 'ArrowLeft') {
      this.screens.nameBackCursor();
      this.audio.playClick();
      return;
    }
    if (key === 'ArrowRight') {
      this.screens.nameAdvanceCursor();
      this.audio.playClick();
      return;
    }
    if (key && key.length === 1) {
      const upper = key.toUpperCase();
      if (/[A-Z0-9 ]/.test(upper)) {
        this.screens.nameSetChar(upper);
        this.audio.playClick();
      }
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

    // Check character slots - tap to select that slot and open the keyboard
    const charRects = this.screens.getNameEntryCharRects(this.canvas);
    for (let i = 0; i < 3; i++) {
      const r = charRects[i];
      if (this.screens._hitTest(x, y, r)) {
        this.screens.namePos = i;
        this.audio.playClick();
        this._focusNameEntryInput();
        return;
      }
    }
  }

  async _submitName() {
    if (this.submittingName) return;
    this.submittingName = true;
    this._blurNameEntryInput();
    try {
      const name = this.screens.getEnteredName();
      this.audio.playClick();
      this.leaderboard.saveName(name);

      const entry = this._leaderboardEntryForCurrentRun();
      const result = await this.leaderboard.submitScore(name, entry.score, entry.stage, entry.mode, entry.meta);

      if (result && result.rank) {
        this.globalRank = result.rank;
      }

      this.state = 'gameOver';
    } finally {
      this.submittingName = false;
    }
  }

  _leaderboardEntryForCurrentRun() {
    if (this.gameMode === GAME_MODE.DISTANCE && this.distanceRun?.result === 'win') {
      return {
        score: this.distanceRun.winTimeMs,
        stage: 1,
        mode: GAME_MODE.DISTANCE,
        meta: { makes: this.distanceRun.makes, shots: this.distanceRun.shots },
      };
    }
    if (this.gameMode === GAME_MODE.ENDLESS && this.endlessRun?.result === 'timeup') {
      return {
        score: this.endlessRun.makes,
        stage: 1,
        mode: GAME_MODE.ENDLESS,
        meta: {
          makes: this.endlessRun.makes,
          shots: this.endlessRun.shots,
          elapsedMs: this.endlessRun.elapsedMs,
        },
      };
    }
    return {
      score: this.scoring.totalScore,
      stage: this.scoring.stageNum,
      mode: GAME_MODE.CLASSIC,
      meta: {},
    };
  }

  _skipNameEntry() {
    this.audio.playClick();
    this._blurNameEntryInput();
    // Save locally but don't submit to global leaderboard
    this.state = 'gameOver';
  }

  // --- Leaderboard ---

  _openLeaderboard(mode = this.gameMode) {
    this.leaderboardReturnState = this.state;
    this.state = 'leaderboard';
    this.audio.playClick();
    this.leaderboard.fetchBoth(mode);
  }

  _exitLeaderboard() {
    this.audio.playClick();
    this.state = this.leaderboardReturnState || 'title';
  }

  // ── Store ──────────────────────────────────────────────────────────

  _openStore() {
    this.state = 'store';
    this.audio.playClick();
    // Reset any stale preview from a previous open.
    this.screens.store.clearPreviews();
  }

  _exitStore() {
    this.audio.playClick();
    // Drop any active preview and restore equipped skins on the scene.
    this.screens.store.clearPreviews();
    skins.applyAllEquipped(this);
    this.state = 'title';
  }

  _handleStoreTap(x, y) {
    const action = this.screens.store.hitTest(this.canvas, x, y, this.screens._hitTest);
    if (!action) return;

    if (action === 'back') {
      this._exitStore();
      return;
    }
    if (action === 'confirm-yes') {
      const cat = this.screens.store.activeCategory;
      const id = this.screens.store.confirmId;
      const ok = tickets.purchase(cat, id);
      this.audio.playClick();
      if (ok) {
        this.screens.store.cancelConfirm();
        // Equipping is implicit in purchase(); re-apply to the live scene.
        skins.applySkinByCategory(this, cat, id);
      }
      return;
    }
    if (action === 'confirm-no') {
      this.audio.playClick();
      this.screens.store.cancelConfirm();
      return;
    }
    if (action === 'buy') {
      this.audio.playClick();
      const cat = this.screens.store.activeCategory;
      const id = this.screens.store.previewId[cat];
      if (id) this.screens.store.startConfirm(id);
      return;
    }
    if (action.startsWith('tab:')) {
      this.audio.playClick();
      this.screens.store.setActiveCategory(action.slice(4));
      return;
    }
    if (action.startsWith('card:')) {
      const cat = this.screens.store.activeCategory;
      const id = action.slice(5);
      this.audio.playClick();
      // Tapping an owned skin a second time equips it; tapping an unowned
      // one sets preview (BUY appears at the bottom).
      if (tickets.isOwned(cat, id) && this.screens.store.previewId[cat] === id) {
        tickets.equip(cat, id);
        skins.applySkinByCategory(this, cat, id);
      } else {
        this.screens.store.setPreview(cat, id);
        skins.applySkinByCategory(this, cat, id);
      }
      return;
    }
  }

  // --- Pause menu ---

  _handlePausedTap(x, y) {
    const rects = this.screens.getPauseMenuRects(this.canvas);
    if (this.screens._hitTest(x, y, rects.resume)) {
      this.audio.playClick();
      this.togglePause();
      return;
    }
    if (this.screens._hitTest(x, y, rects.settings)) {
      this.audio.playClick();
      this.state = 'settings';
      return;
    }
    if (this.screens._hitTest(x, y, rects.leaderboard)) {
      this._openLeaderboard();
      return;
    }
    if (this.screens._hitTest(x, y, rects.restart)) {
      this.startGame(this.gameMode);
      return;
    }
    if (this.screens._hitTest(x, y, rects.quit)) {
      this._quitToTitle();
      return;
    }
  }

  _handleSettingsTap(x, y) {
    const rects = this.screens.getSettingsRects(this.canvas);
    if (this.screens._hitTest(x, y, rects.powerSide)) {
      this.audio.playClick();
      settings.togglePowerMeterSide();
      return;
    }
    if (this.screens._hitTest(x, y, rects.back)) {
      this._exitSettings();
      return;
    }
  }

  _exitSettings() {
    this.audio.playClick();
    this.state = 'paused';
  }

  _quitToTitle() {
    this.audio.playClick();
    hideFab();
    this._resetToTitle();
  }

  _handleLeaderboardTap(x, y) {
    // Back button
    const backBtn = this.screens.getLeaderboardBackButtonRect(this.canvas);
    if (this.screens._hitTest(x, y, backBtn)) {
      this._exitLeaderboard();
      return;
    }

    // Mode tab buttons
    const modeTabs = this.screens.getLeaderboardModeTabRects(this.canvas);
    for (const [mode, rect] of Object.entries(modeTabs)) {
      if (this.screens._hitTest(x, y, rect)) {
        if (this.leaderboard.mode !== mode) {
          this.audio.playClick();
          this.leaderboard.fetchBoth(mode);
        }
        return;
      }
    }

    // Time tab buttons
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

  startGame(mode = GAME_MODE.CLASSIC) {
    this.audio.init();
    this.audio.resume();
    this.audio.playClick();

    hideFab();
    // Reset any in-flight coins from a prior run so they don't fly into the
    // new game's counter.
    coinAnim.clear();
    // Re-apply equipped skins in case the player exited the Store with an
    // unbought preview still showing on the meshes.
    skins.applyAllEquipped(this);
    // Start the per-run awards log + bump lifetime games-played.
    tickets.beginRun();
    // Daily-bonus award (no-op if already claimed today).
    tickets.claimDailyBonusIfNew(this.hoop.getRimCenter());
    this.gameMode = mode;
    this.state = 'playing';
    this.previousState = null;
    this.scoring.reset();
    this.distanceRun = mode === GAME_MODE.DISTANCE ? createDistanceRun() : null;
    this.endlessRun = mode === GAME_MODE.ENDLESS ? createEndlessRun() : null;
    if (this.endlessRun) {
      this.scoring.timeRemaining = ENDLESS_MODE.startTime;
      this.scoring.bonusTimeActive = false;
    }
    this._resetBallPool();
    this.particles.clear();
    this.hud.notifications = [];
    this.globalRank = null;
    this.submittingName = false;

    this.hoop.setDepthOffset(this.distanceRun?.offsetZ || 0);
    this.hoop.setMovement(
      mode === GAME_MODE.CLASSIC ? this.scoring.stageData.hoopSpeed : 0,
      mode === GAME_MODE.CLASSIC ? this.scoring.stageData.hoopAmplitude : 0,
    );
    this.hoop.setFireIntensity(0);
  }

  _resetBallPool() {
    for (const b of this.balls) b.retire();
    this.activeBallIdx = 0;
    this.activeBall.placeAtSpawn();
  }

  returnToTitle() {
    this.audio.playClick();
    this._resetToTitle();
  }

  _resetToTitle() {
    this.state = 'title';
    this.previousState = null;
    this.gameMode = GAME_MODE.CLASSIC;
    this.distanceRun = null;
    this.endlessRun = null;
    this.globalRank = null;
    this.submittingName = false;
    this.hoop.setDepthOffset(0);
    this.hoop.setMovement(0, 0);
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

    if (this.state === 'title' || this.state === 'leaderboard' || this.state === 'nameEntry' || this.state === 'store') {
      this.lane.update(dt);
      this.hoop.update(dt, this.balls);
      return;
    }

    if (this.state === 'paused' || this.state === 'settings') return;

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

    // The meter only animates while the player is dragging. Starting a new
    // drag snaps it back to the bottom; releasing freezes it where it sits.
    const dragging = this.input.isDragging();
    if (dragging && !this._wasDragging) {
      this._meterPhase = 0;
    }
    if (dragging) {
      this._meterPhase += dt * 2 * Math.PI * this._meterRateHz;
    }
    this._wasDragging = dragging;

    // Fire particles on hoop when streak active
    const streakLevel = this.scoring.getStreakLevel();
    if (streakLevel >= 2) {
      this.hoop.setFireIntensity(streakLevel * 0.3);
      this.particles.emitFire(this.hoop.x, this.hoop.y, streakLevel * 0.3);
    } else {
      this.hoop.setFireIntensity(0);
    }

    let timerResult = { timeUp: false, bonusTimeJustStarted: false };
    if (this.gameMode === GAME_MODE.DISTANCE) {
      this.distanceRun.elapsed += dt;
    } else if (this.gameMode === GAME_MODE.ENDLESS) {
      this.endlessRun.elapsed += dt;
      this.scoring.timeRemaining = Math.max(0, this.scoring.timeRemaining - dt);
      this.scoring.bonusTimeActive = false;
      timerResult = { timeUp: this.scoring.timeRemaining <= 0, bonusTimeJustStarted: false };
    } else {
      timerResult = this.scoring.updateTimer(dt);
    }

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
      if (this.state !== 'playing') return;
    }

    // As soon as the active ball has hit something (or scored/missed),
    // promote the next ball in the pool so the player can shoot again.
    const active = this.activeBall;
    if (active.hasContacted || active.scored || active.missed) {
      this._promoteNextBall();
    }

    // Check stage complete before time-up (completing target trumps timer)
    if (this.gameMode === GAME_MODE.CLASSIC && this.scoring.isStageComplete() && this.state === 'playing') {
      this._onStageClear();
      return;
    }

    // Check time's up
    if (timerResult.timeUp && this.state === 'playing') {
      if (this.gameMode === GAME_MODE.ENDLESS) {
        this._onEndlessTimeUp();
        return;
      }
      this._onTimeUp();
    }
  }

  _onScore(isSwish, ball) {
    if (!ball.active) return;
    ball.active = false;
    ball.scored = true;
    ball.hasContacted = true;

    if (this.gameMode === GAME_MODE.DISTANCE) {
      this._onDistanceScore(isSwish);
      return;
    }
    if (this.gameMode === GAME_MODE.ENDLESS) {
      this._onEndlessScore(isSwish);
      return;
    }

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

    // Tickets — swish or regular make, plus any streak-milestone bonus.
    // Bonus time doubles base ticket awards just like it doubles points.
    this._awardShotTickets(isSwish, result);
  }

  // Centralized ticket-awarding for a single made shot. Called from all
  // three game modes so the earn rules don't drift.
  _awardShotTickets(isSwish, result) {
    const rim = this.hoop.getRimCenter();
    const mult = this.scoring.bonusTimeActive ? 2 : 1;
    if (isSwish) {
      tickets.award('swish', undefined, rim);
      if (mult > 1) tickets.award('swish', undefined, rim); // 2nd helping for bonus time
    } else {
      tickets.award('shotMake', undefined, rim);
      if (mult > 1) tickets.award('shotMake', undefined, rim);
    }
    if (result?.streakMilestone) {
      const level = this.scoring.streak;
      let reason = null;
      if (level === STREAK.UNSTOPPABLE) reason = 'streakUnstoppable';
      else if (level === STREAK.BLAZING) reason = 'streakBlazing';
      else if (level === STREAK.ON_FIRE) reason = 'streakOnFire';
      else if (level === STREAK.HEATING_UP) reason = 'streakHeatingUp';
      if (reason) tickets.award(reason, undefined, rim);
    }
  }

  _onDistanceScore(isSwish) {
    const result = this.scoring.scoreShot(isSwish);
    const run = this.distanceRun;
    const distanceResult = applyDistanceScore(run);

    this.hoop.triggerNetRipple();
    if (isSwish) this.audio.playSwish();
    this.audio.playScore();
    if (result.streakMilestone) this.audio.playStreakMilestone();
    for (const text of result.notifications) this.hud.addNotification(text);

    this.particles.emitScoreBurst(this.hoop.x, this.hoop.y);
    this._awardShotTickets(isSwish, result);

    if (distanceResult === 'win') {
      this._onDistanceWin();
    } else {
      this.hud.addNotification('FURTHER', 0.8);
      this.hoop.setDepthOffset(run.offsetZ);
    }
  }

  _onEndlessScore(isSwish) {
    const result = this.scoring.scoreEndlessShot(isSwish);
    const run = this.endlessRun;
    const baseBonus = isSwish ? ENDLESS_MODE.swishBonus : ENDLESS_MODE.scoreBonus;
    const timeBonus = baseBonus + result.streakTimeBonus;
    applyEndlessScore(run);
    this.scoring.timeRemaining += timeBonus;

    this.hoop.triggerNetRipple();
    if (isSwish) this.audio.playSwish();
    this.audio.playScore();
    if (result.streakMilestone) this.audio.playStreakMilestone();
    for (const text of result.notifications) this.hud.addNotification(text);
    this.hud.addNotification(`+${timeBonus}s`, 0.75);
    this.particles.emitScoreBurst(this.hoop.x, this.hoop.y);
    this._awardShotTickets(isSwish, result);
  }

  _onMiss(ball) {
    if (!ball.active || !ball.missed) return;
    ball.active = false;
    ball.hasContacted = true;
    this.scoring.missShot();
    this.audio.playMiss();

    if (this.gameMode === GAME_MODE.DISTANCE) {
      const run = this.distanceRun;
      const distanceResult = applyDistanceMiss(run);
      if (distanceResult === 'loss') {
        this._onDistanceLoss();
      } else {
        this.hud.addNotification('CLOSER', 0.8);
        this.hoop.setDepthOffset(run.offsetZ);
      }
    } else if (this.gameMode === GAME_MODE.ENDLESS) {
      applyEndlessMiss(this.endlessRun);
    }
  }

  _syncDistanceProgress() {
    const run = this.distanceRun;
    run.progress = distanceProgress(run.offsetZ);
  }

  _onDistanceWin() {
    const run = this.distanceRun;
    this.hoop.setDepthOffset(run.offsetZ);
    this.audio.playStageClear();
    this.particles.emitCelebration(this.canvas.width, this.canvas.height);
    tickets.award('distanceWin', undefined, this.hoop.getRimCenter());
    this._resetBallPool();
    this.state = 'nameEntry';
    this.screens.initNameEntry(this.leaderboard.playerName);
    this._focusNameEntryInput();
    this.globalRank = null;
    this.submittingName = false;
  }

  _onDistanceLoss() {
    this.distanceRun.result = 'loss';
    this.hoop.setDepthOffset(this.distanceRun.offsetZ);
    this.audio.playTimeUp();
    this.screens.startFlash();
    tickets.award('distanceLoss', undefined, this.hoop.getRimCenter());
    this._resetBallPool();
    this.state = 'gameOver';
  }

  _onEndlessTimeUp() {
    const run = this.endlessRun;
    finishEndlessRun(run);
    this.audio.playTimeUp();
    this.screens.startFlash();
    tickets.award('endlessTimeUp', undefined, this.hoop.getRimCenter());
    this._resetBallPool();
    this.state = 'nameEntry';
    this.screens.initNameEntry(this.leaderboard.playerName);
    this._focusNameEntryInput();
    this.globalRank = null;
    this.submittingName = false;
  }

  _onStageClear() {
    this.state = 'stageClear';
    this.screens.startStageClear();
    this.audio.playStageClear();
    this.particles.emitCelebration(this.canvas.width, this.canvas.height);
    tickets.award('stageClear', undefined, this.hoop.getRimCenter());
    this._resetBallPool();
  }

  _onTimeUp() {
    this.audio.playTimeUp();
    this.screens.startFlash();
    // A new high score has to be tested BEFORE we save it — saveHighScore()
    // appends the run unconditionally, so `isHighScore()` is only meaningful
    // when called first.
    const wasHighScore = this.scoring.isHighScore() && this.scoring.totalScore > 0;
    this.scoring.saveHighScore();
    tickets.award('classicTimeUp', undefined, this.hoop.getRimCenter());
    if (wasHighScore) tickets.award('highScoreBonus', undefined, this.hoop.getRimCenter());
    this._resetBallPool();

    // Go to name entry screen instead of directly to game over
    this.state = 'nameEntry';
    this.screens.initNameEntry(this.leaderboard.playerName);
    this._focusNameEntryInput();
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
      this.screens.renderTitle(ctx, canvas);
      return;
    }

    if (this.state === 'playing' || this.state === 'paused' || this.state === 'settings') {
      this.particles.render(ctx);
      if (this.gameMode === GAME_MODE.DISTANCE) {
        this._renderDistanceHud(ctx);
      } else if (this.gameMode === GAME_MODE.ENDLESS) {
        this._renderEndlessHud(ctx);
      } else {
        this.hud.render(ctx, canvas, this.scoring);
      }

      if (this.state === 'paused') {
        this.screens.renderPause(ctx, canvas);
      } else if (this.state === 'settings') {
        this.screens.renderSettings(ctx, canvas, settings);
      }

      // Power meter is always visible during play — the player times their
      // release against it, and the frozen value persists between shots.
      if (this.state === 'playing') {
        this._renderPowerMeter(ctx);
      }

      // While dragging: also show the live trajectory arc + landing reticle
      // for the current meter power and aim direction.
      if (this.state === 'playing' && this.input.isDragging() && !this.activeBall.active) {
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
      this.screens.renderNameEntry(
        ctx,
        canvas,
        this.scoring.totalScore,
        this.scoring.stageNum,
        this.distanceRun?.result === 'win' ? this.distanceRun : null,
        this.endlessRun?.result === 'timeup' ? this.endlessRun : null,
      );
      return;
    }

    if (this.state === 'gameOver') {
      this.particles.render(ctx);
      this.screens.renderGameOver(
        ctx,
        canvas,
        this.scoring,
        this.globalRank,
        this.gameMode === GAME_MODE.DISTANCE ? this.distanceRun : null,
        this.gameMode === GAME_MODE.ENDLESS ? this.endlessRun : null,
      );
      return;
    }

    if (this.state === 'leaderboard') {
      this.particles.render(ctx);
      this.screens.renderLeaderboard(ctx, canvas, this.leaderboard);
      return;
    }

    if (this.state === 'store') {
      // The live 3D scene continues to render in the background so the
      // currently-previewed skin is visible. No particles needed.
      this.screens.renderStore(ctx, canvas);
      return;
    }
  }

  _renderDistanceHud(ctx) {
    const { canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const padding = 20;
    const run = this.distanceRun;
    const elapsedMs = Math.round(run.elapsed * 1000);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px monospace';
    ctx.fillText('TIME', w / 2, padding + 14);
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 32px monospace';
    ctx.fillText(formatRunTime(elapsedMs), w / 2, padding + 48);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px monospace';
    ctx.fillText('MADE', w - padding, padding + 14);
    ctx.fillStyle = COLORS.scoreGreen;
    ctx.font = 'bold 28px monospace';
    ctx.fillText(`${run.makes}/${run.shots}`, w - padding, padding + 44);

    const meterW = Math.min(w * 0.58, 360);
    const meterH = 12;
    const meterX = w / 2 - meterW / 2;
    const meterY = h * 0.19;
    const centerX = meterX + meterW / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    this.screens._roundRect(ctx, meterX, meterY, meterW, meterH, 6);
    ctx.fill();
    if (run.progress > 0.5) {
      const fillW = meterW * (run.progress - 0.5);
      ctx.fillStyle = COLORS.scoreGreen;
      ctx.shadowColor = COLORS.scoreGreen;
      ctx.shadowBlur = 10;
      this.screens._roundRect(ctx, centerX, meterY, fillW, meterH, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (run.progress < 0.5) {
      const fillW = meterW * (0.5 - run.progress);
      ctx.fillStyle = COLORS.red;
      ctx.shadowColor = COLORS.red;
      ctx.shadowBlur = 10;
      this.screens._roundRect(ctx, centerX - fillW, meterY, fillW, meterH, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(centerX - 1, meterY - 3, 2, meterH + 6);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('LOSE', meterX, meterY + 28);
    ctx.textAlign = 'center';
    ctx.fillText('START', centerX, meterY + 28);
    ctx.textAlign = 'right';
    ctx.fillText('WIN', meterX + meterW, meterY + 28);
    ctx.restore();

    if (this.scoring.streak > 0) {
      ctx.save();
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.scoreGreen;
      ctx.font = 'bold 34px monospace';
      ctx.fillText(`${this.scoring.streak}`, w - padding, h * 0.45);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '12px monospace';
      ctx.fillText('STREAK', w - padding, h * 0.45 - 22);
      ctx.restore();
    }

    this.hud.renderTicketsOverlay(ctx, this.canvas);
    this.hud._renderNotifications(ctx, w, h);
  }

  _renderEndlessHud(ctx) {
    const { canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const padding = 20;
    const run = this.endlessRun;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px monospace';
    ctx.fillText('MODE', padding, padding + 14);
    ctx.fillStyle = COLORS.primary;
    ctx.font = 'bold 24px monospace';
    ctx.fillText('ENDLESS', padding, padding + 42);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px monospace';
    ctx.fillText('CLOCK', w / 2, padding + 14);
    const timeColor = this.scoring.timeRemaining <= 10 ? COLORS.red : COLORS.white;
    ctx.fillStyle = timeColor;
    ctx.font = 'bold 32px monospace';
    ctx.fillText(formatRunTime(Math.ceil(this.scoring.timeRemaining * 1000)), w / 2, padding + 48);

    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.font = '12px monospace';
    ctx.fillText(`SURVIVED ${formatRunTime(Math.round(run.elapsed * 1000))}`, w / 2, padding + 70);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0, 255, 65, 0.4)';
    ctx.font = '12px monospace';
    ctx.fillText('SCORE', w / 2, h * 0.12);
    ctx.fillStyle = COLORS.scoreGreen;
    ctx.shadowColor = COLORS.scoreGreen;
    ctx.shadowBlur = 10;
    ctx.font = 'bold 44px monospace';
    ctx.fillText(`${this.scoring.totalScore}`, w / 2, h * 0.16);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '14px monospace';
    ctx.fillText(`${run.makes}/${run.shots}`, w / 2, h * 0.19);
    ctx.restore();

    this.hud.renderTicketsOverlay(ctx, this.canvas);
    this.hud._renderNotifications(ctx, w, h);
  }

  // Drag-power fraction that produces the perfect rim shot at the current
  // hoop position. Used to scale the visual arc so a sweet drag distance
  // puts the on-screen reticle exactly on the rim.
  _perfectDragNorm() {
    const spawn = COURT.ballSpawn;
    const rim = this.hoop.getRimCenter();
    const R = Math.sqrt((spawn.x - rim.x) ** 2 + (spawn.z - rim.z) ** 2);
    const h = rim.y - spawn.y;
    const theta = 55 * Math.PI / 180;
    const denom = 2 * Math.cos(theta) ** 2 * (R * Math.tan(theta) - h);
    if (denom <= 0) return 0.5;
    const v0 = Math.sqrt((9.82 * R * R) / denom);
    return clamp((v0 - MIN_SPEED_MS) / (MAX_SPEED_MS - MIN_SPEED_MS), 0.05, 0.95);
  }

  // Predict the shot analytically for the player's *current drag*. The
  // arc + reticle grow with drag length and tilt with lateral motion, so
  // the player sees their aim take shape in real time. Meter timing is
  // applied separately at release — this preview assumes a perfect-meter
  // (neutral) release.
  _predictShot() {
    const norm = this.input.getDragPowerNorm();
    const power = MIN_THROW_SPEED + norm * (MAX_THROW_SPEED - MIN_THROW_SPEED);
    const lateralAngle = this.input.getLateralNorm();
    const v = launchVector(power, lateralAngle);

    const spawn = COURT.ballSpawn;
    const rim = this.hoop.getRimCenter();
    const rimX = rim.x;
    const rimY = rim.y;
    const rimZ = rim.z;
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
    const onLeft = settings.powerMeterSide === 'left';
    const barX = onLeft ? 26 : w - barW - 26;
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

    // PERFECT label tick — hangs off the meter's outer edge (away from the
    // screen edge it sits against), so the label is always readable.
    ctx.save();
    ctx.strokeStyle = COLORS.scoreGreen;
    ctx.fillStyle = COLORS.scoreGreen;
    ctx.lineWidth = 1.5;
    const sweetY = barY + barH - barH * sweet;
    ctx.beginPath();
    if (onLeft) {
      ctx.moveTo(barX + barW + 2, sweetY);
      ctx.lineTo(barX + barW + 14, sweetY);
    } else {
      ctx.moveTo(barX - 14, sweetY);
      ctx.lineTo(barX - 2, sweetY);
    }
    ctx.stroke();
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = onLeft ? 'left' : 'right';
    ctx.fillText('PERFECT', onLeft ? barX + barW + 16 : barX - 16, sweetY + 3);
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

  // Drag indicator — a screen-space arc whose endpoint tracks the drag.
  // Short drag → short arc near the ball. Long drag → arc reaches up to
  // the rim. The endpoint is scaled so a perfect-power drag plants the
  // reticle right on the rim, so the player learns drag distance by
  // sight: "make the reticle touch the rim, then time release on the
  // meter."
  _renderAimArc(ctx) {
    const delta = this.input.getDragDelta();
    if (delta.dy >= 0) return; // require upward drag to indicate intent

    const start = this.activeBall.getScreenPos();
    const pred = this._predictShot();
    const outcomeColors = { swish: COLORS.scoreGreen, rim: '#FFCC00', miss: '#FF4D4D' };
    const arcColor = outcomeColors[pred.outcome];

    // Scale drag delta so that the visual endpoint lines up with the rim
    // when the player has dragged a "perfect" power. Below that → endpoint
    // short of rim, above → endpoint past it. Direction follows the drag.
    const rimScreen = this.world3d.projectToScreen(this.hoop.getRimCenter());
    const ballToRim = Math.hypot(rimScreen.x - start.x, rimScreen.y - start.y);
    const perfectDragPx = Math.max(1, this._perfectDragNorm() * this.canvas.height * 0.55);
    const scale = ballToRim / perfectDragPx;

    const end = {
      x: start.x + delta.dx * scale,
      y: start.y + delta.dy * scale,
    };

    this._renderTrajectoryArc(ctx, start, end, arcColor, pred.outcome);
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

function formatRunTime(ms) {
  const totalMs = Math.max(0, Math.round(Number(ms) || 0));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const tenths = Math.floor((totalMs % 1000) / 100);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
}
