import { describe, expect, it } from 'vitest';
import { updateRimScoringSensor, type RimScoringSensorState } from '@randroids-dojo/vibekit';

const center = { x: 0, y: 3, z: 0 };
const rimRadius = 0.34;
const rimTubeRadius = 0.025;
const ballRadius = 0.12;

function state(): RimScoringSensorState {
  return { sensorEntered: false, rimHit: false, reportedRim: false };
}

function update(
  sensor: RimScoringSensorState,
  previousPosition: { x: number; y: number; z: number },
  position: { x: number; y: number; z: number },
  velocity = { x: 0, y: -1, z: 0 },
  rimContactAgeSec = 10,
) {
  return updateRimScoringSensor(sensor, {
    position,
    previousPosition,
    velocity,
    center,
    rimRadius,
    rimTubeRadius,
    ballRadius,
    rimContactAgeSec,
  });
}

describe('updateRimScoringSensor', () => {
  it('scores a clean descending make after entry then exit gates', () => {
    const sensor = state();

    expect(update(sensor, { x: 0, y: 3.2, z: 0 }, { x: 0, y: 3.02, z: 0 })).toBeNull();
    expect(sensor.sensorEntered).toBe(true);

    expect(update(sensor, { x: 0, y: 3.0, z: 0 }, { x: 0, y: 2.85, z: 0 })).toBe('swish');
    expect(sensor.sensorEntered).toBe(false);
  });

  it('downgrades swish to score when the rim was contacted recently', () => {
    const sensor = state();

    expect(update(sensor, { x: 0, y: 3.2, z: 0 }, { x: 0, y: 3.02, z: 0 })).toBeNull();
    expect(update(sensor, { x: 0, y: 3.0, z: 0 }, { x: 0, y: 2.85, z: 0 }, { x: 0, y: -1, z: 0 }, 0.1)).toBe('score');
  });

  it('does not score a ball that only comes up from below the rim', () => {
    const sensor = state();

    expect(update(sensor, { x: 0, y: 2.7, z: 0 }, { x: 0, y: 2.95, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull();
    expect(sensor.sensorEntered).toBe(false);

    expect(update(sensor, { x: 0, y: 2.95, z: 0 }, { x: 0, y: 2.85, z: 0 })).toBeNull();
  });

  it('resets an armed sensor when the ball leaves the cylinder below the rim', () => {
    const sensor = state();

    expect(update(sensor, { x: 0, y: 3.2, z: 0 }, { x: 0, y: 3.02, z: 0 })).toBeNull();
    expect(sensor.sensorEntered).toBe(true);

    expect(update(sensor, { x: 0, y: 3.0, z: 0 }, { x: 0.5, y: 2.95, z: 0 })).toBeNull();
    expect(sensor.sensorEntered).toBe(false);
  });

  it('reports a rim contact once without counting it as a make', () => {
    const sensor = state();

    expect(update(sensor, { x: 0.4, y: 3.2, z: 0 }, { x: 0.4, y: 3.1, z: 0 }, { x: 0, y: -1, z: 0 }, 0.1)).toBe('rim');
    expect(update(sensor, { x: 0.4, y: 3.1, z: 0 }, { x: 0.4, y: 3.0, z: 0 }, { x: 0, y: -1, z: 0 }, 0.1)).toBeNull();
  });

  it('keeps separate sensor state for simultaneous balls', () => {
    const a = state();
    const b = state();

    expect(update(a, { x: 0, y: 3.2, z: 0 }, { x: 0, y: 3.02, z: 0 })).toBeNull();
    expect(update(b, { x: 0.5, y: 3.2, z: 0 }, { x: 0.5, y: 3.02, z: 0 })).toBeNull();

    expect(a.sensorEntered).toBe(true);
    expect(b.sensorEntered).toBe(false);
    expect(update(a, { x: 0, y: 3.0, z: 0 }, { x: 0, y: 2.85, z: 0 })).toBe('swish');
    expect(update(b, { x: 0.5, y: 3.0, z: 0 }, { x: 0.5, y: 2.85, z: 0 })).toBeNull();
  });
});
