// Real 3D basketball — Three.js mesh driven by cannon-es rigid body.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COURT, GROUP, makeBasketballTexture, makeBasketballBumpMap } from './world3d.js';
import { clamp } from './utils.js';

// Tunable launch mapping. Input.power arrives in screen-pixels/sec roughly in
// [300, 1800] after clamping. Map to a realistic launch speed in m/s.
const MIN_SPEED_MS = 6.5;
const MAX_SPEED_MS = 11.5;
const LAUNCH_PITCH = 55 * Math.PI / 180; // ~55° arc — classic free-throw angle

export class Ball {
  constructor(world3d) {
    this.world3d = world3d;
    this.streakLevel = 0;

    // ── Visual mesh ────────────────────────────────────────────────────
    const tex = makeBasketballTexture();
    const bump = makeBasketballBumpMap();
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
      linearDamping: 0.18,
      angularDamping: 0.25,
      collisionFilterGroup: GROUP.BALL,
      collisionFilterMask: GROUP.RIM | GROUP.BACKBOARD | GROUP.FLOOR | GROUP.WALL,
    });
    this.body.allowSleep = true;
    this.body.sleepSpeedLimit = 0.2;
    this.body.sleepTimeLimit = 0.6;
    world3d.physicsWorld.addBody(this.body);

    // ── State (mirrors original public API) ────────────────────────────
    this.active = false;   // in flight?
    this.scored = false;
    this.missed = false;
    this.rimHit = false;   // touched the rim/backboard
    this.visible = true;
    this.flightTime = 0;

    this.reset();
  }

  reset() {
    const p = COURT.ballSpawn;
    this.body.wakeUp();
    this.body.position.set(p.x, p.y, p.z);
    this.body.previousPosition.set(p.x, p.y, p.z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.quaternion.set(0, 0, 0, 1);
    this.body.sleep();
    this.body.collisionFilterMask = GROUP.RIM | GROUP.BACKBOARD | GROUP.FLOOR | GROUP.WALL;

    this.mesh.position.copy(p);
    this.mesh.quaternion.identity();
    this.glow.position.copy(p);
    this.trailPositions.length = 0;
    this._writeTrail();
    this.trailLine.visible = false;

    this.active = false;
    this.scored = false;
    this.missed = false;
    this.rimHit = false;
    this.visible = true;
    this.flightTime = 0;
    this.mesh.visible = true;
  }

  // power: drag pixels/sec (already clamped to [MIN_THROW_SPEED, MAX_THROW_SPEED])
  // lateralAngle: -1..1 horizontal aim
  throwBall(power, lateralAngle) {
    if (this.active) return;
    this.active = true;
    this.scored = false;
    this.missed = false;
    this.rimHit = false;
    this.flightTime = 0;

    // Map drag power → launch speed
    const t = clamp((power - 300) / 1500, 0, 1);
    const speed = MIN_SPEED_MS + (MAX_SPEED_MS - MIN_SPEED_MS) * t;

    // Aim vector toward hoop with horizontal jitter from lateralAngle
    const yaw = clamp(lateralAngle, -1, 1) * 0.18; // ~10° max sideways
    const dirX = Math.sin(yaw);
    const dirZ = -Math.cos(yaw);

    const horiz = speed * Math.cos(LAUNCH_PITCH);
    const vert = speed * Math.sin(LAUNCH_PITCH);

    this.body.wakeUp();
    this.body.velocity.set(dirX * horiz, vert, dirZ * horiz);

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
    }

    if (!this.active) return;

    this.flightTime += dt;

    // Trail
    if (this.streakLevel >= 1) {
      this.trailPositions.push(this.mesh.position.clone());
      if (this.trailPositions.length > 60) this.trailPositions.shift();
      this._writeTrail();
    }

    // Miss conditions: behind backboard, outside court, fell to floor & settled
    const pos = this.body.position;
    const speed = this.body.velocity.length();
    const settled = speed < 0.35 && pos.y < COURT.ballRadius + 0.1;

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
