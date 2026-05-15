// Real 3D hoop — backboard, rim, net, post — with cannon-es physics bodies.
// Detects scoring by watching the ball's position cross the rim plane.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COURT, GROUP } from './world3d.js';
import { updateRimScoringSensor } from './rimSensor.ts';

const RIM_SEGMENTS = 22; // sphere segments forming the rim's collision torus
const NET_STRANDS = 14;
const NET_RINGS = 6;
const NET_LENGTH = 0.55;     // hangs further below the rim for a clearer cone
const NET_BOTTOM_FACTOR = 0.5; // bottom radius / top radius (cone pinch)

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
    this.offsetZ = 0;
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
        const radius = this.rimRadius * (1 - t * (1 - NET_BOTTOM_FACTOR));
        const x = Math.cos(a) * radius;
        const y = -t * NET_LENGTH;
        const z = Math.sin(a) * radius;
        positions.push(x, y, z);
      }
    }

    // Minimal visible mesh — 14 vertical strands plus three horizontal hoops
    // (mid-net and the bottom). Diagonals are used by the cloth sim for
    // shear stability but are NOT drawn, so the cone reads cleanly on small
    // displays instead of blurring into a tangle of overlapping 1px lines.
    for (let s = 0; s < NET_STRANDS; s++) {
      const sNext = (s + 1) % NET_STRANDS;
      for (let r = 0; r < NET_RINGS; r++) {
        indices.push(idx(s, r), idx(s, r + 1));        // vertical strand
      }
      // Horizontal hoops at r=2, r=4, and the bottom (r=6) — three thin rings
      // visible against the dark backdrop.
      indices.push(idx(s, 2), idx(sNext, 2));
      indices.push(idx(s, 4), idx(sNext, 4));
      indices.push(idx(s, NET_RINGS), idx(sNext, NET_RINGS));
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setIndex(indices);

    // ── Cloth simulation data ───────────────────────────────────────
    // One Verlet particle per net vertex. The top ring (r=0) is pinned
    // to the rim; the rest is free and constrained to its neighbors.
    // We also keep the design positions so the cloth can softly return to
    // its hanging-cone pose whenever no ball is interacting with it.
    this._netParticles = [];
    this._netBase = new Float32Array(positions);
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      const r = Math.floor((i / 3) % (NET_RINGS + 1));
      this._netParticles.push({
        x, y, z, px: x, py: y, pz: z, pinned: r === 0,
      });
    }

    this._netConstraints = [];
    const addCon = (a, b) => {
      const pa = this._netParticles[a];
      const pb = this._netParticles[b];
      const len = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
      this._netConstraints.push({ a, b, len });
    };
    for (let s = 0; s < NET_STRANDS; s++) {
      const sNext = (s + 1) % NET_STRANDS;
      for (let r = 0; r < NET_RINGS; r++) {
        addCon(idx(s, r), idx(s, r + 1));               // vertical strand
        addCon(idx(s, r), idx(sNext, r + 1));           // diagonal
        addCon(idx(sNext, r), idx(s, r + 1));           // counter-diagonal
        if (r > 0) addCon(idx(s, r), idx(sNext, r));    // horizontal ring
      }
      addCon(idx(s, NET_RINGS), idx(sNext, NET_RINGS)); // bottom ring
    }

    const net = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
    );
    net.position.copy(this.rimCenter);
    this.assembly.add(net);
    this.net = net;

    // Pre-warm the cloth so the very first rendered frame already shows the
    // net at its hanging-cone equilibrium.
    for (let i = 0; i < 60; i++) this._simulateNet(1 / 60, null);
    for (const p of this._netParticles) {
      p.px = p.x; p.py = p.y; p.pz = p.z;
    }
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

  _reposition(offsetX = this.offsetX, offsetZ = this.offsetZ) {
    this.offsetX = offsetX;
    this.offsetZ = offsetZ;
    const cx = this.rimCenter.x + offsetX;
    const cz = this.rimCenter.z + offsetZ;

    // Visuals
    this.assembly.position.x = offsetX;
    this.assembly.position.z = offsetZ;

    // Physics — kinematic bodies need direct position updates
    for (const { body, angle } of this.rimBodies) {
      body.position.set(
        cx + Math.cos(angle) * this.rimRadius,
        this.rimCenter.y,
        cz + Math.sin(angle) * this.rimRadius,
      );
    }
    this.backboardBody.position.set(
      cx,
      this.rimCenter.y + 0.32,
      cz - COURT.backboardOffset,
    );
  }

  setDepthOffset(offsetZ) {
    this._reposition(this.offsetX, offsetZ);
  }

  getRimCenter() {
    return new THREE.Vector3(
      this.rimCenter.x + this.offsetX,
      this.rimCenter.y,
      this.rimCenter.z + this.offsetZ,
    );
  }

  setMovement(speed, amplitude) {
    // `amplitude` is in legacy 2D pixel units (from utils.STAGE_DEFS) — convert
    // to world meters here so the rest of the 3D code is unit-clean.
    this.moveSpeed = speed;            // rad/s
    this.moveAmplitude = amplitude * 0.02;
  }

  setFireIntensity(intensity) {
    this.fireIntensity = intensity;
  }

  triggerNetRipple() {
    this._netRipple = 1;
    this._netTime = 0;
  }

  // Project the rim center to screen space — cached helper used by particle
  // emitters that want a 2D rim position. The single getter avoids two
  // independent projections when the caller reads both x and y.
  getScreenPos() {
    return this.world3d.projectToScreen(
      this.getRimCenter(),
    );
  }

  get x() { return this.getScreenPos().x; }
  get y() { return this.getScreenPos().y; }

  update(dt, balls = null) {
    // Hoop oscillation
    if (this.moveSpeed > 0) {
      this.movePhase += this.moveSpeed * dt;
      this._reposition(Math.sin(this.movePhase) * this.moveAmplitude, this.offsetZ);
    } else if (this.offsetX !== 0) {
      this._reposition(0, this.offsetZ);
    }

    this._netTime += dt;
    if (this._netRipple > 0) this._netRipple = Math.max(0, this._netRipple - dt * 1.6);
    this._simulateNet(dt, balls);

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

  // Verlet cloth simulation. The top ring is pinned to the rim; the rest is
  // a free fabric that flexes when a ball pushes through. When no ball is
  // interacting, particles are pinned to their design positions (with a
  // little ambient sway) — this avoids the cloth ever drifting away from
  // its clean hanging-cone shape between throws.
  _simulateNet(dt, balls) {
    const damping = 0.85;
    const gravity = -3.5;
    const t = this._netTime;
    const ballR = COURT.ballRadius;
    const ringWidth = NET_RINGS + 1;

    // Re-pin top ring at the rim (matches any rim movement implicitly via
    // the parent assembly transform; coords here are net-local).
    for (let s = 0; s < NET_STRANDS; s++) {
      const a = (s / NET_STRANDS) * Math.PI * 2;
      const p = this._netParticles[s * ringWidth];
      p.x = Math.cos(a) * this.rimRadius;
      p.y = 0;
      p.z = Math.sin(a) * this.rimRadius;
      p.px = p.x; p.py = p.y; p.pz = p.z;
    }

    // Verlet integration for free particles.
    const gdt2 = gravity * dt * dt;
    for (let i = 0; i < this._netParticles.length; i++) {
      const p = this._netParticles[i];
      if (p.pinned) continue;
      const vx = (p.x - p.px) * damping;
      const vy = (p.y - p.py) * damping;
      const vz = (p.z - p.pz) * damping;
      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.x += vx;
      p.y += vy + gdt2;
      p.z += vz;
    }

    // Pre-compute which balls are close enough to interact with the net.
    const nearBalls = [];
    if (balls) {
      const cx = this.rimCenter.x + this.offsetX;
      const cy = this.rimCenter.y;
      const cz = this.rimCenter.z + this.offsetZ;
      for (const ball of balls) {
        if (!ball.visible) continue;
        const bp = ball.body.position;
        const dx = bp.x - cx, dy = bp.y - cy, dz = bp.z - cz;
        // Reach far enough to catch the bottom of the net plus a margin.
        if (dx * dx + dy * dy + dz * dz > 0.9 * 0.9) continue;
        nearBalls.push({ x: dx, y: dy, z: dz });
      }
    }

    // Track "active" frames — frames since the last ball interaction. While
    // a ball is near or just left, we run the full cloth sim. Once the cloth
    // has had time to recover, we pin particles to their design positions
    // so the net always reads as a clean hanging cone at rest.
    if (nearBalls.length > 0) this._activeFrames = 90;        // ~1.5s of physics
    else this._activeFrames = Math.max(0, (this._activeFrames || 0) - 1);

    if (this._activeFrames === 0) {
      // Resting net: snap to design positions plus a tiny ambient sway.
      const base = this._netBase;
      for (let i = 0; i < this._netParticles.length; i++) {
        const p = this._netParticles[i];
        if (p.pinned) {
          p.x = base[i * 3];
          p.y = base[i * 3 + 1];
          p.z = base[i * 3 + 2];
          p.px = p.x; p.py = p.y; p.pz = p.z;
          continue;
        }
        const s = Math.floor(i / ringWidth);
        const r = i % ringWidth;
        const sway = (r / NET_RINGS) * 0.006;
        p.x = base[i * 3]     + Math.sin(t * 1.7 + s) * sway;
        p.y = base[i * 3 + 1] + Math.cos(t * 1.5 + s) * sway * 0.2;
        p.z = base[i * 3 + 2] + Math.cos(t * 1.5 + s) * sway;
        p.px = p.x; p.py = p.y; p.pz = p.z;
      }
      // Push to geometry and exit early — no physics needed.
      const arr = this.net.geometry.attributes.position.array;
      for (let i = 0; i < this._netParticles.length; i++) {
        const p = this._netParticles[i];
        arr[i * 3 + 0] = p.x;
        arr[i * 3 + 1] = p.y;
        arr[i * 3 + 2] = p.z;
      }
      this.net.geometry.attributes.position.needsUpdate = true;
      return;
    }

    // Constraint relaxation + ball collision, several Gauss-Seidel passes.
    const iters = 6;
    for (let it = 0; it < iters; it++) {
      for (const c of this._netConstraints) {
        const pa = this._netParticles[c.a];
        const pb = this._netParticles[c.b];
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const dz = pb.z - pa.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 1e-6) continue;
        const diff = (dist - c.len) / dist * 0.5;
        const ox = dx * diff, oy = dy * diff, oz = dz * diff;
        if (!pa.pinned) { pa.x += ox; pa.y += oy; pa.z += oz; }
        if (!pb.pinned) { pb.x -= ox; pb.y -= oy; pb.z -= oz; }
      }

      for (const b of nearBalls) {
        const bR2 = ballR * ballR;
        for (let i = 0; i < this._netParticles.length; i++) {
          const p = this._netParticles[i];
          if (p.pinned) continue;
          const dx = p.x - b.x;
          const dy = p.y - b.y;
          const dz = p.z - b.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < bR2 && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            const k = (ballR - d) / d;
            p.x += dx * k;
            p.y += dy * k;
            p.z += dz * k;
          }
        }
      }
    }

    // Hard safety: the rim is a ceiling for the net. Without this, an unlucky
    // dt spike or a ball entering from below can flip the cloth above the rim,
    // and there's no force in the sim to pull it back down once it's there.
    // Leaving p.py intact preserves downward velocity for snappy recovery.
    for (let i = 0; i < this._netParticles.length; i++) {
      const p = this._netParticles[i];
      if (p.pinned) continue;
      if (p.y > 0) p.y = 0;
    }

    // While the cloth is "active" (recovering from a ball pass), pull it
    // softly toward the design pose so it settles smoothly back to rest.
    const recoveryStrength = nearBalls.length > 0 ? 0.04 : 0.18;
    const base = this._netBase;
    for (let i = 0; i < this._netParticles.length; i++) {
      const p = this._netParticles[i];
      if (p.pinned) continue;
      const bi = i * 3;
      p.x += (base[bi]     - p.x) * recoveryStrength;
      p.y += (base[bi + 1] - p.y) * recoveryStrength;
      p.z += (base[bi + 2] - p.z) * recoveryStrength;
    }

    // Score-burst ripple kept for visual punch.
    if (this._netRipple > 0) {
      const amp = this._netRipple * 0.06;
      for (let s = 0; s < NET_STRANDS; s++) {
        for (let r = 1; r <= NET_RINGS; r++) {
          const p = this._netParticles[s * ringWidth + r];
          const f = (r / NET_RINGS);
          p.y -= amp * f * Math.sin(this._netTime * 14 + s) * 0.4;
        }
      }
    }

    // Push particle positions back into the geometry buffer.
    const arr = this.net.geometry.attributes.position.array;
    for (let i = 0; i < this._netParticles.length; i++) {
      const p = this._netParticles[i];
      arr[i * 3 + 0] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
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
    const cz = this.rimCenter.z + this.offsetZ;

    const p = ball.body.position;
    const prev = ball.body.previousPosition || p;
    const result = updateRimScoringSensor(ball, {
      position: p,
      previousPosition: prev,
      velocity: ball.body.velocity,
      center: { x: cx, y: cy, z: cz },
      rimRadius: this.rimRadius,
      rimTubeRadius: COURT.rimTube,
      ballRadius: COURT.ballRadius,
      rimContactAgeSec: performance.now() / 1000 - ball.lastRimContactTime,
    });

    if (result === 'swish' || result === 'score') this.triggerNetRipple();

    return result;
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
