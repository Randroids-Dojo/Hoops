import { describe, expect, it } from 'vitest';
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
} from '../src/arcadeModes';

describe('distance mode runner', () => {
  it('moves the hoop deeper and tracks progress on makes', () => {
    const run = createDistanceRun();

    expect(applyDistanceScore(run)).toBe('continue');
    expect(run.shots).toBe(1);
    expect(run.makes).toBe(1);
    expect(run.offsetZ).toBe(DISTANCE_MODE.scoreStepZ);
    expect(run.progress).toBeCloseTo(0.2);
  });

  it('moves the hoop closer and loses at the near threshold on misses', () => {
    const run = createDistanceRun();

    expect(applyDistanceMiss(run)).toBe('continue');
    expect(applyDistanceMiss(run)).toBe('continue');
    expect(applyDistanceMiss(run)).toBe('loss');
    expect(run.result).toBe('loss');
    expect(run.offsetZ).toBe(DISTANCE_MODE.loseOffsetZ);
    expect(run.progress).toBe(0);
  });

  it('wins at the far threshold and records elapsed milliseconds', () => {
    const run = createDistanceRun();
    run.elapsed = 12.345;

    let result: 'win' | 'continue' = 'continue';
    while (result !== 'win') result = applyDistanceScore(run);

    expect(run.result).toBe('win');
    expect(run.offsetZ).toBe(DISTANCE_MODE.winOffsetZ);
    expect(run.progress).toBe(1);
    expect(run.winTimeMs).toBe(12345);
  });

  it('clamps distance progress to the playable far span', () => {
    expect(distanceProgress(0.5)).toBe(0);
    expect(distanceProgress(-0.45)).toBeCloseTo(0.5);
    expect(distanceProgress(-2)).toBe(1);
  });
});

describe('endless mode runner', () => {
  it('tracks shots and makes separately', () => {
    const run = createEndlessRun();

    applyEndlessScore(run);
    applyEndlessMiss(run);

    expect(run.shots).toBe(2);
    expect(run.makes).toBe(1);
    expect(ENDLESS_MODE.startTime).toBe(18);
  });

  it('records elapsed time on finish', () => {
    const run = createEndlessRun();
    run.elapsed = 8.765;

    finishEndlessRun(run);

    expect(run.result).toBe('timeup');
    expect(run.elapsedMs).toBe(8765);
  });
});
