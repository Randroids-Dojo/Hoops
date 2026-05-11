// Real 3D hoop — backboard, rim, net, post — with cannon-es physics bodies.
// Detects scoring by watching the ball's position cross the rim plane.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COURT, GROUP } from './world3d.js';

const RIM_SEGMENTS = 22; // sphere segments forming the rim's collision torus
const NET_STRANDS = 14;
const NET_RINGS = 6;
const NET_LENGTH = 0.42;

export class Hoop {
  constructor(world3d) {
    this.world3d = world3d;
    this.rimCenter = COURT.rim.clone();
    this.rimRadius = COURT.rimRadius;

    this.assembly = new THREE.Group();
    world3d.scene.add(this.assembly);

    this.moveSpeed = 0;
    this.moveAmplitude = 0;
    this.movePhase = 0;
    this.offsetX = 0;
    this.fireIntensity = 0;
    this._netRipple = 0;
    this._netTime = 0;

    this._buildVisuals();
    this._buildPhysics();
    this._reposition(0);
  }

  _buildVisuals() {
    // ── Backboard ─────────────────────────────────────────────────────
    const bb = COURT.backboardSize;
    const boardGroup = new THREE.Group();

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(bb.w, bb.h, bb.d),
      new THREE.MeshPhysicalMaterial({
        color: 0xf6f6f6,
        roughness: 0.12,
        metalness: 0.0,
        transmission: 0.45,
        thickness: 0.05,
        clearcoat: 0.4,
        ior: 1.45,
      }),
    );
    board.castShadow = true;
    board.receiveShadow = true;
    boardGroup.add(board);

    // Border frame
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(bb.w + 0.04, bb.h + 0.04, bb.d * 0.8),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 }),
    );
    frame.position.z = -bb.d * 0.1;
    boardGroup.add(frame);

    // Shooter's square
    const sqW = bb.w * 0.32;
    const sqH = bb.h * 0.34;
    const squarePts = [
      new THREE.Vector3(-sqW / 2, -sqH / 2, bb.d / 2 + 0.001),
      new THREE.Vector3( sqW / 2, -sqH / 2, bb.d / 2 + 0.001),
      new THREE.Vector3( sqW / 2,  sqH / 2, bb.d / 2 + 0.001),
      new THREE.Vector3(-sqW / 2,  sqH / 2, bb.d / 2 + 0.001),
      new THREE.Vector3(-sqW / 2, -sqH / 2, bb.d / 2 + 0.001),
    ];
    const square = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(squarePts),
      new THREE.LineBasicMaterial({ color: 0xff2233 }),
    );
    square.position.y = -bb.h * 0.06;
    boardGroup.add(square);

    boardGroup.position.set(this.rimCenter.x, this.rimCenter.y + 0.32, this.rimCenter.z - COURT.backboardOffset);
    this.assembly.add(boardGroup);
    this.boardGroup = boardGroup;

    // ── Rim (torus) ──────────────────────────────────────────────────
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(this.rimRadius, COURT.rimTube, 16, 36),
      new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.35, metalness: 0.7, emissive: 0x331100, emissiveIntensity: 0.2 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(this.rimCenter);
    rim.castShadow = true;
    this.assembly.add(rim);
    this.rim = rim;

    // Connector arm rim → backboard
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.04, COURT.backboardOffset),
      new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.4, metalness: 0.6 }),
    );
    arm.position.set(this.rimCenter.x, this.rimCenter.y + 0.02, this.rimCenter.z - COURT.backboardOffset / 2);
    this.assembly.add(arm);
    this.armMesh = arm;

    // Fire ring (additive torus that pulses for streak)
    this.fireRing = new THREE.Mesh(
      new THREE.TorusGeometry(this.rimRadius * 1.15, 0.025, 12, 36),
      new THREE.MeshBasicMaterial({ color: 0xff6b00, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.fireRing.rotation.x = Math.PI / 2;
    this.fireRing.position.copy(this.rimCenter);
    this.assembly.add(this.fireRing);

    // ── Stanchion / pole behind backboard ───────────────────────────
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.6, metalness: 0.4 });
    const armBack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.7), poleMat);
    armBack.position.set(this.rimCenter.x, this.rimCenter.y + 0.4, this.rimCenter.z - COURT.backboardOffset - 0.4);
    this.assembly.add(armBack);

    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, this.rimCenter.y + 0.4, 0.22), poleMat);
    pole.position.set(this.rimCenter.x, (this.rimCenter.y + 0.4) / 2, this.rimCenter.z - COURT.backboardOffset - 0.7);
    pole.castShadow = true;
    this.assembly.add(pole);

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.9), poleMat);
    base.position.set(this.rimCenter.x, 0.04, this.rimCenter.z - COURT.backboardOffset - 0.7);
    this.assembly.add(base);

    // ── Net ──────────────────────────────────────────────────────────
    this._buildNet();
  }

  _buildNet() {
    const positions = [];
    const indices = [];
    const idx = (s, r) => s * (NET_RINGS + 1) + r;

    for (let s = 0; s < NET_STRANDS; s++) {
      const a = (s / NET_STRANDS) * Math.PI * 2;
      for (let r = 0; r <= NET_RINGS; r++) {
        const t = r / NET_RINGS;
        const radius = this.rimRadius * (1 - t * 0.55);
        const x = Math.cos(a) * radius;
        const y = -t * NET_LENGTH;
        const z = Math.sin(a) * radius;
        positions.push(x, y, z);
      }
    }
    for (let s = 0; s < NET_STRANDS; s++) {
      const sNext = (s + 1) % NET_STRANDS;
      for (let r = 0; r < NET_RINGS; r++) {
        // vertical strand
        indices.push(idx(s, r), idx(s, r + 1));
        // diagonal cross to next strand
        indices.push(idx(s, r), idx(sNext, r + 1));
        if (r > 0) {
          // horizontal ring
          indices.push(idx(s, r), idx(sNext, r));
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setIndex(indices);

    // Save base positions for sway animation
    this._netBase = new Float32Array(positions);

    const net = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
    );
    net.position.copy(this.rimCenter);
    this.assembly.add(net);
    this.net = net;
  }

  _buildPhysics() {
    // Rim modeled as ring of small spheres (cannon has no torus). Sphere radii
    // match the visual tube radius so the rim feels like a thin metal ring,
    // not a bumpy bracelet that catches the ball.
    this.rimBodies = [];
    for (let i = 0; i < RIM_SEGMENTS; i++) {
      const a = (i / RIM_SEGMENTS) * Math.PI * 2;
      const body = new CANNON.Body({
        type: CANNON.Body.KINEMATIC,
        shape: new CANNON.Sphere(COURT.rimTube),
        material: this.world3d.materials.rim,
        collisionFilterGroup: GROUP.RIM,
        collisionFilterMask: GROUP.BALL,
      });
      body.userData = { isRim: true };
      body.position.set(
        this.rimCenter.x + Math.cos(a) * this.rimRadius,
        this.rimCenter.y,
        this.rimCenter.z + Math.sin(a) * this.rimRadius,
      );
      this.world3d.physicsWorld.addBody(body);
      this.rimBodies.push({ body, angle: a });
    }

    // Backboard
    const bb = COURT.backboardSize;
    this.backboardBody = new CANNON.Body({
      type: CANNON.Body.KINEMATIC,
      shape: new CANNON.Box(new CANNON.Vec3(bb.w / 2, bb.h / 2, bb.d / 2)),
      material: this.world3d.materials.backboard,
      collisionFilterGroup: GROUP.BACKBOARD,
      collisionFilterMask: GROUP.BALL,
    });
    this.backboardBody.userData = { isBackboard: true };
    this.backboardBody.position.set(
      this.rimCenter.x,
      this.rimCenter.y + 0.32,
      this.rimCenter.z - COURT.backboardOffset,
    );
    this.world3d.physicsWorld.addBody(this.backboardBody);
  }

  _reposition(offsetX) {
    this.offsetX = offsetX;
    const cx = this.rimCenter.x + offsetX;

    // Visuals
    this.assembly.position.x = offsetX;

    // Physics — kinematic bodies need direct position updates
    for (const { body, angle } of this.rimBodies) {
      body.position.set(
        cx + Math.cos(angle) * this.rimRadius,
        this.rimCenter.y,
        this.rimCenter.z + Math.sin(angle) * this.rimRadius,
      );
    }
    this.backboardBody.position.set(
      cx,
      this.rimCenter.y + 0.32,
      this.rimCenter.z - COURT.backboardOffset,
    );
  }

  setMovement(speed, amplitude) {
    // Original units were "phase rad/s" and "pixels". Map amplitude px → meters.
    this.moveSpeed = speed;
    this.moveAmplitude = amplitude * 0.02; // 80px ≈ 1.6m sway
  }

  setFireIntensity(intensity) {
    this.fireIntensity = intensity;
  }

  triggerNetRipple() {
    this._netRipple = 1;
    this._netTime = 0;
  }

  // Property accessors used by HUD/particles for screen positioning.
  get x() {
    const p = this.world3d.projectToScreen(new THREE.Vector3(this.rimCenter.x + this.offsetX, this.rimCenter.y, this.rimCenter.z));
    return p.x;
  }
  get y() {
    const p = this.world3d.projectToScreen(new THREE.Vector3(this.rimCenter.x + this.offsetX, this.rimCenter.y, this.rimCenter.z));
    return p.y;
  }

  update(dt) {
    // Hoop oscillation
    if (this.moveSpeed > 0) {
      this.movePhase += this.moveSpeed * dt;
      this._reposition(Math.sin(this.movePhase) * this.moveAmplitude);
    } else if (this.offsetX !== 0) {
      this._reposition(0);
    }

    // Net animation
    this._netTime += dt;
    if (this._netRipple > 0) this._netRipple = Math.max(0, this._netRipple - dt * 1.6);
    this._animateNet(dt);

    // Fire ring pulse for streaks
    if (this.fireIntensity > 0) {
      const pulse = 0.45 + Math.sin(performance.now() * 0.012) * 0.2;
      this.fireRing.material.opacity = clamp01(this.fireIntensity * pulse);
      const colors = [0xff8c00, 0xff4500, 0xff2200, 0xff00ff];
      this.fireRing.material.color.setHex(colors[Math.min(Math.floor(this.fireIntensity * 3), 3)]);
      this.fireRing.scale.setScalar(1 + Math.sin(performance.now() * 0.01) * 0.05);
    } else {
      this.fireRing.material.opacity = 0;
    }
  }

  _animateNet(dt) {
    const arr = this.net.geometry.attributes.position.array;
    const base = this._netBase;
    const ripple = this._netRipple;
    const t = this._netTime;
    for (let s = 0; s < NET_STRANDS; s++) {
      for (let r = 0; r <= NET_RINGS; r++) {
        const i = (s * (NET_RINGS + 1) + r) * 3;
        const sway = (r / NET_RINGS) * 0.012;
        const wobble = sway * Math.sin(t * 2.4 + s * 0.6);
        const drop = ripple * (r / NET_RINGS) * 0.07 * Math.sin(t * 14 + s);
        arr[i + 0] = base[i + 0] + Math.sin(t * 1.7 + s) * sway * 0.6 + wobble * Math.cos(s);
        arr[i + 1] = base[i + 1] - drop * 0.4;
        arr[i + 2] = base[i + 2] + Math.cos(t * 1.5 + s) * sway * 0.6 + wobble * Math.sin(s);
      }
    }
    this.net.geometry.attributes.position.needsUpdate = true;
  }

  // Score detection: returns 'swish' | 'score' | 'rim' | null.
  // Called every frame from Game for each active ball. Per-ball sensor state
  // lives on the ball so multiple balls can be tracked independently.
  checkCollision(ball) {
    if (!ball.active || ball.scored || ball.missed) return null;

    const cx = this.rimCenter.x + this.offsetX;
    const cy = this.rimCenter.y;
    const cz = this.rimCenter.z;

    const p = ball.body.position;
    const dx = p.x - cx;
    const dz = p.z - cz;
    const horiz = Math.sqrt(dx * dx + dz * dz);

    if ((performance.now() / 1000 - ball.lastRimContactTime) < 0.25) {
      ball.rimHit = true;
    }

    const inCylinder = horiz < this.rimRadius * 0.95;
    const above = p.y > cy + COURT.ballRadius * 0.5;
    const below = p.y < cy - COURT.ballRadius * 0.4;
    const descending = ball.body.velocity.y < 0;

    if (inCylinder && above && descending) {
      ball.sensorEntered = true;
    }

    let result = null;
    if (ball.sensorEntered && inCylinder && below) {
      result = ball.rimHit ? 'score' : 'swish';
      ball.sensorEntered = false;
      this.triggerNetRipple();
    } else if (ball.sensorEntered && !inCylinder && p.y < cy) {
      ball.sensorEntered = false;
    }

    if (result) return result;

    if (ball.rimHit && !ball.reportedRim) {
      ball.reportedRim = true;
      return 'rim';
    }
    if (!ball.rimHit) ball.reportedRim = false;

    return null;
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
