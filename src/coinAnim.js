// Flying ticket sprites + counter count-up tween. Each award spawns a short
// burst of ticket sprites that arc from a source pixel to the ticket
// counter, then triggers a count-up tween on the displayed balance. Kept in
// its own module so HUD layout code stays focused on rendering.

import { getTicketIcon } from './ticketSprite.js';

const COIN_FLIGHT_MIN = 0.55;
const COIN_FLIGHT_MAX = 0.85;
const COUNT_UP_MS = 380;
const PULSE_MS = 220;
// Cap how many sprites we draw per burst. A 200-ticket UNSTOPPABLE award
// would otherwise crowd the screen with a swarm of identical tickets; the
// count-up tween still credits the full amount.
const MAX_VISIBLE_COINS = 8;
// Rendered size of each in-flight ticket sprite, in CSS pixels.
const FLY_TICKET_W = 30;
const FLY_TICKET_H = 16;

let coins = []; // active flying sprites
let displayedBalance = 0; // currently rendered balance (lerped)
let trueBalance = 0;      // target balance
let countUpFrom = 0;
let countUpStart = 0;
let pulseStart = -1;

// Initialize the displayed balance without animating.
export function setInitialBalance(n) {
  displayedBalance = n;
  trueBalance = n;
}

// Spawn `count` sprites from (sx, sy) → (dx, dy). The burst's `payout` is
// what the counter should tween *to* after all sprites arrive (passed via
// onArrive).
export function spawnBurst(sx, sy, dx, dy, count, payout) {
  const n = Math.max(1, Math.min(MAX_VISIBLE_COINS, count));
  const now = performance.now() / 1000;
  for (let i = 0; i < n; i++) {
    const duration = COIN_FLIGHT_MIN + Math.random() * (COIN_FLIGHT_MAX - COIN_FLIGHT_MIN);
    // Stagger so the burst doesn't fire as a single salvo.
    const stagger = (i / n) * 0.08;
    // Control point above the midpoint with a random horizontal nudge for
    // distinct arcs.
    const mx = (sx + dx) / 2 + (Math.random() - 0.5) * 80;
    const my = Math.min(sy, dy) - 60 - Math.random() * 40;
    coins.push({
      sx, sy, dx, dy,
      cx: mx, cy: my,
      start: now + stagger,
      duration,
      arrived: false,
      // ±1 rotations over the flight, alternating sign per sprite in the
      // burst so half wobble clockwise and half counter, keeping the swarm
      // organic.
      spin: (i % 2 === 0 ? 1 : -1) * (0.4 + Math.random() * 0.6),
    });
  }
  // The payout is committed to the counter as the LAST coin arrives — that
  // way the count-up tween corresponds to the visible burst landing.
  const lastArrive = Math.max(...coins.map((c) => c.start + c.duration));
  pendingPayouts.push({ arriveAt: lastArrive, payout });
}

const pendingPayouts = [];

export function update(dt) {
  const now = performance.now() / 1000;
  // Tick down coin lifetimes
  coins = coins.filter((c) => {
    const t = (now - c.start) / c.duration;
    if (t >= 1 && !c.arrived) {
      c.arrived = true;
      return false;
    }
    return t < 1;
  });

  // Apply pending payouts whose arrival time has passed
  for (let i = pendingPayouts.length - 1; i >= 0; i--) {
    if (now >= pendingPayouts[i].arriveAt) {
      _commitPayout(pendingPayouts[i].payout);
      pendingPayouts.splice(i, 1);
    }
  }
}

function _commitPayout(balanceAfter) {
  // Tween from current displayed to the new true balance.
  countUpFrom = displayedBalance;
  trueBalance = balanceAfter;
  countUpStart = performance.now();
  pulseStart = performance.now();
}

// Render flying tickets. Called from hud.js between particles and
// notifications. Each ticket spins slightly as it flies for that
// fluttering-paper feel; spin direction alternates per sprite so the
// burst doesn't look mechanical.
export function render(ctx) {
  if (coins.length === 0) return;
  const sprite = getTicketIcon('gold');
  const now = performance.now() / 1000;
  ctx.save();
  for (const c of coins) {
    const t = Math.max(0, Math.min(1, (now - c.start) / c.duration));
    const omt = 1 - t;
    const x = omt * omt * c.sx + 2 * omt * t * c.cx + t * t * c.dx;
    const y = omt * omt * c.sy + 2 * omt * t * c.cy + t * t * c.dy;
    const scale = 0.8 + 0.6 * Math.sin(t * Math.PI); // grow then shrink
    const w = FLY_TICKET_W * scale;
    const h = FLY_TICKET_H * scale;
    const spin = c.spin * t * Math.PI * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  ctx.restore();
}

// Get the value to render in the HUD counter — lerped from countUpFrom to
// trueBalance over COUNT_UP_MS.
export function getDisplayedBalance() {
  if (countUpStart === 0) return displayedBalance;
  const t = (performance.now() - countUpStart) / COUNT_UP_MS;
  if (t >= 1) {
    displayedBalance = trueBalance;
    countUpStart = 0;
    return displayedBalance;
  }
  const eased = 1 - (1 - t) * (1 - t); // ease-out quad
  displayedBalance = Math.round(countUpFrom + (trueBalance - countUpFrom) * eased);
  return displayedBalance;
}

// Pulse factor for the counter font during a count-up — used by HUD to bump
// the counter size briefly when tickets are earned. Returns 1.0 → 1.18 → 1.0.
export function getPulseFactor() {
  if (pulseStart < 0) return 1;
  const t = (performance.now() - pulseStart) / PULSE_MS;
  if (t >= 1) { pulseStart = -1; return 1; }
  return 1 + Math.sin(t * Math.PI) * 0.18;
}

// Counter center for coin landing target. HUD computes the actual rect each
// frame; this just stores the latest value so the tickets event handler can
// dispatch coins to a real destination.
let counterDst = { x: 0, y: 0 };
export function setCounterDst(x, y) { counterDst = { x, y }; }
export function getCounterDst() { return counterDst; }

// Reset state — used on game restart so coins don't bleed between sessions.
// Also pulls a fresh balance read so the counter never starts a new run
// displaying yesterday's spent total (e.g. if the player bought a skin
// between runs, the displayed balance and the real balance would otherwise
// disagree until the next award).
export function clear(currentBalance) {
  coins = [];
  pendingPayouts.length = 0;
  pulseStart = -1;
  countUpStart = 0;
  if (Number.isFinite(currentBalance)) {
    displayedBalance = currentBalance;
    trueBalance = currentBalance;
  }
}
