// Soft currency + ownership persistence. Single source of truth for the
// player's ticket balance, owned skins, and equipped skins. Persisted via
// VibeKit's readStorage/writeStorage with a Zod schema so corrupted saves
// fall back to defaults cleanly.

import { readStorage, writeStorage } from '@randroids-dojo/vibekit';
import { z } from 'zod';
import { AWARDS, defaultEquipped, defaultOwned, CATEGORIES, getSkin } from './storeData.js';

const STORAGE_KEY = 'hoops-store-v1';

const DailyBestSchema = z.object({
  date: z.string(),
  score: z.number().int().nonnegative(),
});

const StoreSchema = z.object({
  v: z.literal(1),
  tickets: z.number().int().nonnegative(),
  owned: z.object({
    ball: z.array(z.string()),
    backboard: z.array(z.string()),
    court: z.array(z.string()),
  }),
  equipped: z.object({
    ball: z.string(),
    backboard: z.string(),
    court: z.string(),
  }),
  dailyBonusDate: z.string().nullable(),
  // Per-mode top score earned today; reset when the local date rolls over.
  // First run of a day records-without-awarding; subsequent same-day runs
  // pay `dailyHighScore` only when they exceed the recorded value. Marked
  // optional so saves written by an earlier version of the app still parse.
  dailyBests: z.object({
    classic: DailyBestSchema.nullable(),
    endless: DailyBestSchema.nullable(),
  }).optional(),
  lifetime: z.object({
    gamesPlayed: z.number().int().nonnegative(),
    ticketsEarned: z.number().int().nonnegative(),
    ticketsSpent: z.number().int().nonnegative(),
  }),
});

function freshState() {
  return {
    v: 1,
    tickets: 0,
    owned: defaultOwned(),
    equipped: defaultEquipped(),
    dailyBonusDate: null,
    dailyBests: { classic: null, endless: null },
    lifetime: { gamesPlayed: 0, ticketsEarned: 0, ticketsSpent: 0 },
  };
}

const state = freshState();
const listeners = new Set();
let runAwards = []; // per-run breakdown for the game-over screen

function load() {
  const parsed = readStorage(STORAGE_KEY, StoreSchema);
  if (parsed) {
    Object.assign(state, parsed);
  }
  // dailyBests was added after the v1 schema shipped — backfill if the save
  // predates it. We still call this "v1" because nothing else changed and
  // optional fields keep older saves valid.
  if (!state.dailyBests) {
    state.dailyBests = { classic: null, endless: null };
  }
  // Defensive: if equipped skin isn't in owned (e.g. catalog was edited and
  // a previously-owned id was removed), fall back to 'default' for that
  // category so the renderer never points at a missing asset.
  for (const cat of CATEGORIES) {
    if (!state.owned[cat].includes(state.equipped[cat])) {
      state.equipped[cat] = 'default';
    }
    if (!state.owned[cat].includes('default')) {
      state.owned[cat].unshift('default');
    }
  }
}

function save() {
  writeStorage(STORAGE_KEY, state);
}

function emit(event) {
  for (const fn of listeners) fn(event);
}

load();

// TEMP: testing-only grant. Hands out 50,000 tickets once per device so we
// can exercise the store catalog at all rarity tiers without grinding.
// Keyed off a localStorage marker (not state.lifetime) so the grant is
// idempotent across reloads and survives a store-schema reset. Remove
// this block (and the marker key) before shipping the ticket economy.
const TEST_GRANT_KEY = 'hoops-test-grant-50k';
const TEST_GRANT_AMOUNT = 50_000;
try {
  if (typeof localStorage !== 'undefined' && !localStorage.getItem(TEST_GRANT_KEY)) {
    state.tickets += TEST_GRANT_AMOUNT;
    state.lifetime.ticketsEarned += TEST_GRANT_AMOUNT;
    save();
    localStorage.setItem(TEST_GRANT_KEY, '1');
  }
} catch {
  // localStorage unavailable (private mode, SSR, etc.) — skip; players in
  // that mode just won't see the test grant.
}

function todayLocal() {
  // en-CA gives yyyy-mm-dd in local TZ — same format as ISO date but anchored
  // to the player's clock, so "first game today" doesn't reset at UTC midnight.
  return new Date().toLocaleDateString('en-CA');
}

export const tickets = {
  // — Read —
  balance() { return state.tickets; },
  owned(cat) { return state.owned[cat].slice(); },
  equipped(cat) { return state.equipped[cat]; },
  isOwned(cat, id) { return state.owned[cat].includes(id); },
  isEquipped(cat, id) { return state.equipped[cat] === id; },
  getRunAwards() { return runAwards.slice(); },
  getRunTotal() { return runAwards.reduce((s, a) => s + a.amount, 0); },
  lifetime() { return { ...state.lifetime }; },

  // — Subscriptions —
  // Returns an unsubscribe function. Events: { type, reason, amount, sourcePos3D }
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  // — Lifecycle —
  // Called when a new game starts. Clears the per-run breakdown and bumps the
  // lifetime games-played counter. Daily bonus is awarded separately via
  // claimDailyBonusIfNew() so the caller can attach a source position.
  beginRun() {
    runAwards = [];
    state.lifetime.gamesPlayed += 1;
    save();
  },

  // Award the daily bonus iff today is a new day. Returns the amount awarded
  // (0 if already claimed). The caller passes a sourcePos3D for the coin
  // animation; if omitted the HUD will pick a screen-center fallback.
  claimDailyBonusIfNew(sourcePos3D = null) {
    const today = todayLocal();
    if (state.dailyBonusDate === today) return 0;
    state.dailyBonusDate = today;
    save();
    this.award('firstDaily', undefined, sourcePos3D);
    return AWARDS.firstDaily;
  },

  // Check whether `score` beats the player's previous same-day best for
  // `mode` and, if so, award `dailyHighScore` and update the record. The
  // first run of a day records the score silently — players only earn the
  // bonus by *improving* on something they did earlier in the day, which
  // keeps the reward feeling earned. Returns true iff the award fired.
  // `mode` is 'classic' or 'endless' (Distance has its own win bonus).
  checkDailyBest(mode, score, sourcePos3D = null) {
    if (!Number.isFinite(score) || score <= 0) return false;
    if (mode !== 'classic' && mode !== 'endless') return false;
    const today = todayLocal();
    const prev = state.dailyBests[mode];
    if (!prev || prev.date !== today) {
      // First run today — record but don't award. The bar to clear for the
      // dailyHighScore reward is "improve on your own same-day best".
      state.dailyBests[mode] = { date: today, score };
      save();
      return false;
    }
    if (score > prev.score) {
      state.dailyBests[mode] = { date: today, score };
      save();
      this.award('dailyHighScore', undefined, sourcePos3D);
      return true;
    }
    return false;
  },

  // Award the all-time-high bonus iff `score` strictly exceeds `prevBest`.
  // The caller must capture prevBest BEFORE persisting the new score — once
  // saveHighScore() runs, scoring.getBestScore() reflects the new value and
  // the comparison would always be false.
  checkAllTimeBest(score, prevBest, sourcePos3D = null) {
    if (!Number.isFinite(score) || score <= 0) return false;
    if (score <= prevBest) return false;
    this.award('allTimeHighScore', undefined, sourcePos3D);
    return true;
  },

  // — Earning —
  // award(reason, amount?, sourcePos3D?) — `amount` defaults to AWARDS[reason].
  // Persists immediately so balance never disagrees with what the player saw.
  award(reason, amount, sourcePos3D = null) {
    const value = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : (AWARDS[reason] || 0);
    if (value <= 0) return 0;
    state.tickets += value;
    state.lifetime.ticketsEarned += value;
    runAwards.push({ reason, amount: value });
    save();
    emit({ type: 'award', reason, amount: value, sourcePos3D });
    return value;
  },

  // — Spending —
  // Atomic purchase: validates price + balance, deducts, adds to owned,
  // auto-equips. Returns true on success, false if insufficient funds /
  // unknown id / already owned. Idempotent on rapid double-tap.
  purchase(cat, id) {
    const skin = getSkin(cat, id);
    if (!skin) return false;
    if (state.owned[cat].includes(id)) {
      // Already owned — treat as a no-op equip so the UI still feels responsive.
      return this.equip(cat, id);
    }
    if (state.tickets < skin.price) return false;
    state.tickets -= skin.price;
    state.lifetime.ticketsSpent += skin.price;
    state.owned[cat].push(id);
    state.equipped[cat] = id;
    save();
    emit({ type: 'purchase', cat, id, price: skin.price });
    emit({ type: 'equip', cat, id });
    return true;
  },

  equip(cat, id) {
    if (!state.owned[cat].includes(id)) return false;
    if (state.equipped[cat] === id) return true;
    state.equipped[cat] = id;
    save();
    emit({ type: 'equip', cat, id });
    return true;
  },

  // Debug / test helper. Not exposed via the UI.
  __reset() {
    Object.assign(state, freshState());
    runAwards = [];
    save();
    emit({ type: 'reset' });
  },
};
