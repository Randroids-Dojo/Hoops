import { clamp } from '@randroids-dojo/vibekit';

export const DISTANCE_MODE = {
  scoreStepZ: -0.18,
  missStepZ: 0.14,
  winOffsetZ: -0.9,
  loseOffsetZ: 0.42,
};

export const ENDLESS_MODE = {
  startTime: 18,
  scoreBonus: 4,
  swishBonus: 6,
};

export interface DistanceRun {
  elapsed: number;
  winTimeMs: number;
  offsetZ: number;
  shots: number;
  makes: number;
  result: 'win' | 'loss' | null;
  progress: number;
}

export interface EndlessRun {
  elapsed: number;
  elapsedMs: number;
  shots: number;
  makes: number;
  result: 'timeup' | null;
}

export function createDistanceRun(): DistanceRun {
  return {
    elapsed: 0,
    winTimeMs: 0,
    offsetZ: 0,
    shots: 0,
    makes: 0,
    result: null,
    progress: 0,
  };
}

export function createEndlessRun(): EndlessRun {
  return {
    elapsed: 0,
    elapsedMs: 0,
    shots: 0,
    makes: 0,
    result: null,
  };
}

export function distanceProgress(offsetZ: number): number {
  return clamp(Math.abs(Math.min(0, offsetZ)) / Math.abs(DISTANCE_MODE.winOffsetZ), 0, 1);
}

export function applyDistanceScore(run: DistanceRun): 'win' | 'continue' {
  run.shots++;
  run.makes++;
  run.offsetZ = Math.max(DISTANCE_MODE.winOffsetZ, run.offsetZ + DISTANCE_MODE.scoreStepZ);
  run.progress = distanceProgress(run.offsetZ);
  if (run.offsetZ <= DISTANCE_MODE.winOffsetZ) {
    run.result = 'win';
    run.progress = 1;
    run.winTimeMs = Math.round(run.elapsed * 1000);
    return 'win';
  }
  return 'continue';
}

export function applyDistanceMiss(run: DistanceRun): 'loss' | 'continue' {
  run.shots++;
  run.offsetZ = Math.min(DISTANCE_MODE.loseOffsetZ, run.offsetZ + DISTANCE_MODE.missStepZ);
  run.progress = distanceProgress(run.offsetZ);
  if (run.offsetZ >= DISTANCE_MODE.loseOffsetZ) {
    run.result = 'loss';
    return 'loss';
  }
  return 'continue';
}

export function applyEndlessScore(run: EndlessRun): void {
  run.shots++;
  run.makes++;
}

export function applyEndlessMiss(run: EndlessRun): void {
  run.shots++;
}

export function finishEndlessRun(run: EndlessRun): void {
  run.result = 'timeup';
  run.elapsedMs = Math.round(run.elapsed * 1000);
}
