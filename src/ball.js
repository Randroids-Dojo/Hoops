// Real 3D basketball — Three.js mesh driven by cannon-es rigid body.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COURT, GROUP, makeBasketballTexture, makeBasketballBumpMap } from './world3d.js';
import { clamp, MIN_THROW_SPEED, MAX_THROW_SPEED } from './utils.js';

// Tunable launch mapping. The shot's power (already clamped to the
// [MIN_THROW_SPEED, MAX_THROW_SPEED] range by the game) is mapped to a
// realistic basketball release speed in m/s.
export const MIN_SPEED_MS = 6.5;
export const MAX_SPEED_MS = 11.5;
const LAUNCH_PITCH = 55 * Math.PI / 180; // ~55° arc — classic free-throw angle
const POWER_RANGE = MAX_THROW_SPEED - MIN_THROW_SPEED;
// Maximum horizontal yaw at full lateral aim (~28°). Wide enough that an
// aggressive sideways swipe can clearly miss the rim left or right.
const MAX_YAW_RAD = 0.5;

// Power-fraction in [0,1] for a given power value in [MIN_THROW_SPEED, MAX_THROW_SPEED].
function powerFrac(power) {
  return clamp((power - MIN_THROW_SPEED) / POWER_RANGE, 0, 1);
}

// Shared by ball.throwBall() and the predictive-arc preview so they always
// compute the same launch vector from the same drag input.
export function launchVector(power, lateralAngle) {
  const t = powerFrac(power);
  const speed = MIN_SPEED_MS + (MAX_SPEED_MS - MIN_SPEED_MS) * t;
  const yaw = clamp(lateralAngle, -1, 1) * MAX_YAW_RAD;
  const horiz = speed * Math.cos(LAUNCH_PITCH);
  const vert = speed * Math.sin(LAUNCH_PITCH);
  return {
    vx: Math.sin(yaw) * horiz,
    vy: vert,
    vz: -Math.cos(yaw) * horiz,
    speed,
  };
}

// Procedural textures are identical across the pool — generate once and
// share them so every Ball doesn't burn its own canvas/GPU memory.
let SHARED_BALL_TEX = null;
let SHARED_BALL_BUMP = null;
function getSharedBallTextures() {
  if (!SHARED_BALL_TEX) SHARED_BALL_TEX = makeBasketballTexture();
  if (!SHARED_BALL_BUMP) SHARED_BALL_BUMP = makeBasketballBumpMap();
  return { tex: SHARED_BALL_TEX, bump: SHARED_BALL_BUMP };
}

export class Ball {
  constructor(world3d) {
    this.world3d = world3d;
    this.streakLevel = 0;

    // ── Visual mesh ────────────────────────────────────────────────────
    const { tex, bump } = getSharedBallTextures();
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: bump,
      bumpScale: 0.012,
      roughness: 0.78,
      metalness: 0.05,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(COURT.ballRadius, 48, 32), mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    world3d.scene.add(this.mesh);

    // Glow halo for streaks (additive sphere just outside the ball)
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(COURT.ballRadius * 1.4, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xff6b00, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    world3d.scene.add(this.glow);

    // Trail (line segments behind ball during streaks)
    this.trailPositions = [];
    this.trailLine = new THREE.Line(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3)),
      new THREE.LineBasicMaterial({ color: 0xff6b00, transparent: true, opacity: 0.7 }),
    );
    this.trailLine.frustumCulled = false;
    this.trailLine.visible = false;
    world3d.scene.add(this.trailLine);

    // ── Physics body ───────────────────────────────────────────────────
    this.body = new CANNON.Body({
      mass: COURT.ballMass,
      shape: new CANNON.Sphere(COURT.ballRadius),
      material: world3d.materials.ball,
      // No air drag — the analytical predictor uses pure gravity, so the
      // physics must too or the meter will lie. Floor friction settles the
      // ball after misses.
      linearDamping: 0.0,
      angularDamping: 0.05,
      collisionFilterGroup: GROUP.BALL,
      collisionFilterMask: GROUP.RIM | GROUP.BACKBOARD | GROUP.FLOOR | GROUP.WALL,
    });
    this.body.allowSleep = true;
    this.body.sleepSpeedLimit = 0.2;
    this.body.sleepTimeLimit = 0.6;
    this.body.userData = { isBall: true, ball: this };
    world3d.physicsWorld.addBody(this.body);

    // ── State (mirrors original public API) ────────────────────────────
    this.active = false;   // in flight?
    this.scored = false;
    this.missed = false;
    this.rimHit = false;   // touched the rim/backboard
    this.visible = true;
    this.flightTime = 0;
    this.hasContacted = false;            // has touched anything since throw
    this.settleTimer = 0;                 // time spent settled
    this.lastRimContactTime = -10;        // for swish detection — rim only
    this.lastBackboardContactTime = -10;  // tracked separately so banks
                                          // don't mark rimHit
    this.sensorEntered = false;           // armed by hoop's above-rim scoring gate
    this.reportedRim = false;

    this.reset();
  }

  // Place this ball at the spawn point, ready to throw.
  reset() { this.placeAtSpawn(); }

  placeAtSpawn() {
    const p = COURT.ballSpawn;
    this.body.wakeUp();
    this.body.position.set(p.x, p.y, p.z);
    this.body.previousPosition.set(p.x, p.y, p.z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.quaternion.set(0, 0, 0, 1);
    this.body.sleep();
    // The ball at spawn shouldn't be jostled by other in-flight balls — turn
    // off its collision mask until it's thrown.
    this.body.collisionFilterMask = 0;

    this.mesh.position.copy(p);
    this.mesh.quaternion.identity();
    this.glow.position.copy(p);
    this.trailPositions.length = 0;
    this._writeTrail();
    this.trailLine.visible = false;
    this.glow.material.opacity = 0;

    this.active = false;
    this.scored = false;
    this.missed = false;
    this.rimHit = false;
    this.visible = true;
    this.flightTime = 0;
    this.hasContacted = false;
    this.settleTimer = 0;
    this.sensorEntered = false;
    this.reportedRim = false;
    this.lastRimContactTime = -10;
    this.lastBackboardContactTime = -10;
    this.mesh.visible = true;
  }

  // Take this ball out of play — hide and disable physics interactions so it
  // can sit unused in the pool until it's the next active ball.
  retire() {
    this.active = false;
    this.visible = false;
    this.mesh.visible = false;
    this.glow.material.opacity = 0;
    this.trailLine.visible = false;
    // Park the body far below and disable collisions so it doesn't interact.
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.position.set(0, -50, 0);
    this.body.sleep();
    this.body.collisionFilterMask = 0;
  }

  // power: launch power in [MIN_THROW_SPEED, MAX_THROW_SPEED]
  // lateralAngle: -1..1 horizontal aim
  throwBall(power, lateralAngle) {
    if (this.active) return;
    this.active = true;
    this.scored = false;
    this.missed = false;
    this.rimHit = false;
    this.flightTime = 0;
    this.hasContacted = false;
    this.settleTimer = 0;
    this.sensorEntered = false;
    this.reportedRim = false;
    this.lastRimContactTime = -10;       // make sure a recycled ball doesn't
    this.lastBackboardContactTime = -10; // inherit a stale contact stamp

    const v = launchVector(power, lateralAngle);
    const t = powerFrac(power);
    const yaw = clamp(lateralAngle, -1, 1) * MAX_YAW_RAD;

    this.body.wakeUp();
    this.body.collisionFilterMask = GROUP.RIM | GROUP.BACKBOARD | GROUP.FLOOR | GROUP.WALL;
    this.body.velocity.set(v.vx, v.vy, v.vz);

    // Backspin — torque around the X axis (rotated by yaw)
    const spin = 14 + t * 8;
    this.body.angularVelocity.set(Math.cos(yaw) * -spin, 0, Math.sin(yaw) * -spin);

    if (this.streakLevel >= 1) {
      this.trailLine.visible = true;
      this._setGlow(this.streakLevel);
    }
  }

  update(dt) {
    // Sync mesh from physics
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
    this.glow.position.copy(this.body.position);
    this.mesh.visible = this.visible;
    if (!this.visible) {
      this.glow.material.opacity = 0;
      this.trailLine.visible = false;
      return;
    }

    // Settle tracking runs for any visible ball so retired-eligible balls
    // can be detected even after scoring or being marked missed.
    const pos = this.body.position;
    const speed = this.body.velocity.length();
    const settled = speed < 0.35 && pos.y < COURT.ballRadius + 0.1;
    if (settled) this.settleTimer += dt;
    else this.settleTimer = 0;

    if (!this.active) return;

    this.flightTime += dt;

    // Trail
    if (this.streakLevel >= 1) {
      this.trailPositions.push(this.mesh.position.clone());
      if (this.trailPositions.length > 60) this.trailPositions.shift();
      this._writeTrail();
    }

    // Miss conditions: behind backboard, outside court, fell to floor & settled
    if (
      pos.z < COURT.rim.z - 1.5 ||
      Math.abs(pos.x) > 9 ||
      pos.y < -1 ||
      this.flightTime > 6 ||
      (this.flightTime > 1.5 && settled && !this.scored)
    ) {
      if (!this.scored) this.missed = true;
    }
  }

  // Ball has been at rest for > 1s and is past its first contact.
  isSettled() {
    return this.settleTimer > 1.0 && this.hasContacted;
  }

  setStreakLevel(level) {
    this.streakLevel = level;
    if (level >= 1 && this.active) {
      this.trailLine.visible = true;
      this._setGlow(level);
    } else {
      this.trailLine.visible = false;
      this.glow.material.opacity = 0;
    }
  }

  hide() {
    this.mesh.visible = false;
    this.glow.material.opacity = 0;
    this.trailLine.visible = false;
  }

  _writeTrail() {
    const arr = this.trailLine.geometry.attributes.position.array;
    const n = Math.min(this.trailPositions.length, arr.length / 3);
    for (let i = 0; i < arr.length; i++) arr[i] = 0;
    for (let i = 0; i < n; i++) {
      const p = this.trailPositions[this.trailPositions.length - n + i];
      arr[i * 3 + 0] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    }
    this.trailLine.geometry.attributes.position.needsUpdate = true;
    this.trailLine.geometry.setDrawRange(0, n);
  }

  _setGlow(level) {
    const colors = [0xff8c00, 0xff4500, 0xff2200, 0xff00ff];
    const c = colors[Math.min(level - 1, 3)];
    this.glow.material.color.setHex(c);
    this.glow.material.opacity = 0.18 + level * 0.06;
  }

  // — Helpers used by drag indicator overlay (project ball to screen) —
  getScreenPos() {
    return this.world3d.projectToScreen(this.mesh.position);
  }
}
