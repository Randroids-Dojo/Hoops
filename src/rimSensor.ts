export type RimSensorResult = 'swish' | 'score' | 'rim' | null;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface RimSensorState {
  sensorEntered: boolean;
  rimHit: boolean;
  reportedRim: boolean;
}

export interface RimSensorParams {
  position: Vec3Like;
  previousPosition: Vec3Like;
  velocity: Vec3Like;
  center: Vec3Like;
  rimRadius: number;
  rimTubeRadius: number;
  ballRadius: number;
  rimContactAgeSec: number;
  rimContactWindowSec?: number;
}

const DEFAULT_RIM_CONTACT_WINDOW_SEC = 0.25;

export function updateRimScoringSensor(
  state: RimSensorState,
  params: RimSensorParams,
): RimSensorResult {
  const {
    position: p,
    previousPosition: prev,
    velocity,
    center,
    rimRadius,
    rimTubeRadius,
    ballRadius,
    rimContactAgeSec,
    rimContactWindowSec = DEFAULT_RIM_CONTACT_WINDOW_SEC,
  } = params;

  if (rimContactAgeSec < rimContactWindowSec) {
    state.rimHit = true;
  }

  const dx = p.x - center.x;
  const dz = p.z - center.z;
  const horiz = Math.hypot(dx, dz);
  const scoreRadius = rimRadius - rimTubeRadius - ballRadius * 0.35;
  const inCylinder = horiz < scoreRadius;
  const descending = velocity.y < 0;

  const crossedGateInCylinder = (gateY: number, radius = scoreRadius) => {
    if (!descending || prev.y < gateY || p.y > gateY || prev.y === p.y) return false;
    const t = (gateY - prev.y) / (p.y - prev.y);
    const crossX = prev.x + (p.x - prev.x) * t;
    const crossZ = prev.z + (p.z - prev.z) * t;
    return Math.hypot(crossX - center.x, crossZ - center.z) < radius;
  };

  const entryGateY = center.y + ballRadius * 0.35;
  const exitGateY = center.y - ballRadius * 0.9;
  const inAboveRimShaft = inCylinder && p.y >= center.y && descending;
  const crossedEntryGate = crossedGateInCylinder(entryGateY);
  const crossedExitGate = crossedGateInCylinder(exitGateY);

  if (crossedEntryGate || inAboveRimShaft) {
    state.sensorEntered = true;
  }

  if (state.sensorEntered && crossedExitGate) {
    const result = state.rimHit ? 'score' : 'swish';
    state.sensorEntered = false;
    return result;
  }

  if (state.sensorEntered && ((!inCylinder && p.y < center.y) || !descending)) {
    state.sensorEntered = false;
  }

  if (state.rimHit && !state.reportedRim) {
    state.reportedRim = true;
    return 'rim';
  }
  if (!state.rimHit) state.reportedRim = false;

  return null;
}
