// Math helpers and constants

// Colors
export const COLORS = {
  background: '#0A0A0A',
  primary: '#00E5FF',      // Cyan/electric blue
  secondary: '#FF6B00',    // Hot orange
  scoreGreen: '#00FF41',   // Neon green
  white: '#FFFFFF',
  red: '#FF3333',
  rimOrange: '#FF8C00',
  basketball: '#E87621',
  basketballDark: '#CC5500',
  seamBlack: '#333333',
  netWhite: '#DDDDDD',
  backboard: '#222222',
  shadow: 'rgba(0,0,0,0.4)',
};

// Game constants
export const STAGE_DEFS = [
  { target: 20, time: 30, hoopSpeed: 0,    hoopAmplitude: 0,   label: 'Stage 1' },
  { target: 35, time: 30, hoopSpeed: 0.8,  hoopAmplitude: 40,  label: 'Stage 2' },
  { target: 50, time: 28, hoopSpeed: 1.2,  hoopAmplitude: 60,  label: 'Stage 3' },
  { target: 70, time: 25, hoopSpeed: 1.8,  hoopAmplitude: 70,  label: 'Stage 4' },
  { target: 90, time: 25, hoopSpeed: 2.5,  hoopAmplitude: 80,  label: 'Stage 5' },
];

// For stages 6+
export function getStageData(stageNum) {
  if (stageNum <= 5) return STAGE_DEFS[stageNum - 1];
  const stage = stageNum <= 10 ? stageNum : 10;
  return {
    target: 90 + (stageNum - 5) * 25,
    time: stageNum >= 10 ? 20 : 22,
    hoopSpeed: 2.5 + (stage - 5) * 0.5,
    hoopAmplitude: 80 + (stage - 5) * 10,
    label: `Stage ${stageNum}`,
  };
}

// Streak thresholds
export const STREAK = {
  HEATING_UP: 3,
  ON_FIRE: 5,
  BLAZING: 7,
  UNSTOPPABLE: 10,
};

export const BONUS_TIME_THRESHOLD = 10; // seconds

// Physics
export const GRAVITY = 1200; // pixels/s^2 (scaled for canvas)
export const MIN_THROW_SPEED = 300;
export const MAX_THROW_SPEED = 1800;
export const MIN_SWIPE_DISTANCE = 30;
export const BALL_RADIUS_BASE = 28;
export const RIM_RADIUS = 32;
export const RIM_BOUNCE_DAMPING = 0.45;

// Helpers
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}
