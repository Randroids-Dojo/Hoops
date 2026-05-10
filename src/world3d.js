// 3D scene + physics world setup
// Owns Three.js renderer/scene/camera and the cannon-es physics world.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export const COURT = {
  rim: new THREE.Vector3(0, 3.05, -3),     // rim center (regulation 10ft)
  rimRadius: 0.225,                         // 18in regulation
  rimTube: 0.012,
  backboardSize: { w: 1.83, h: 1.07, d: 0.04 },
  backboardOffset: 0.15 + 0.225,            // rim front to backboard face
  ballRadius: 0.121,                        // size 7 basketball
  ballMass: 0.62,
  cameraPos: new THREE.Vector3(0, 2.0, 4.6),
  cameraLookAt: new THREE.Vector3(0, 3.05, -3),
  ballSpawn: new THREE.Vector3(0, 1.55, 3.0),
  floorY: 0,
};

// Collision groups (bitmask)
export const GROUP = {
  BALL: 1,
  RIM: 2,
  BACKBOARD: 4,
  FLOOR: 8,
  WALL: 16,
};

export class World3D {
  constructor(canvas) {
    this.canvas = canvas;

    // ── Renderer ────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // ── Scene & Camera ──────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x05060a, 12, 30);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.copy(COURT.cameraPos);
    this.camera.lookAt(COURT.cameraLookAt);

    // ── Lighting ────────────────────────────────────────────────────────
    this.scene.add(new THREE.AmbientLight(0x6680b0, 0.55));

    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2.5, 8, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 25;
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x00e5ff, 0.45);
    rim.position.set(-4, 5, -6);
    this.scene.add(rim);

    // Spotlight on hoop for drama
    const spot = new THREE.SpotLight(0xff8c33, 1.6, 14, Math.PI / 5, 0.4, 1);
    spot.position.set(0, 7.5, COURT.rim.z);
    spot.target.position.copy(COURT.rim);
    this.scene.add(spot);
    this.scene.add(spot.target);

    // ── Court / Arena ───────────────────────────────────────────────────
    this._buildCourt();

    // ── Physics World ───────────────────────────────────────────────────
    this.physicsWorld = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    this.physicsWorld.broadphase = new CANNON.SAPBroadphase(this.physicsWorld);
    this.physicsWorld.allowSleep = true;
    this.physicsWorld.defaultContactMaterial.contactEquationStiffness = 1e7;
    this.physicsWorld.defaultContactMaterial.contactEquationRelaxation = 4;

    // Materials
    this.materials = {
      ball: new CANNON.Material('ball'),
      rim: new CANNON.Material('rim'),
      backboard: new CANNON.Material('backboard'),
      floor: new CANNON.Material('floor'),
    };

    // Contact behaviors
    this.physicsWorld.addContactMaterial(new CANNON.ContactMaterial(
      this.materials.ball, this.materials.rim,
      { restitution: 0.55, friction: 0.4 },
    ));
    this.physicsWorld.addContactMaterial(new CANNON.ContactMaterial(
      this.materials.ball, this.materials.backboard,
      { restitution: 0.55, friction: 0.3 },
    ));
    this.physicsWorld.addContactMaterial(new CANNON.ContactMaterial(
      this.materials.ball, this.materials.floor,
      { restitution: 0.78, friction: 0.6 },
    ));

    this._buildFloorBody();

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  _buildCourt() {
    // Court floor — hardwood
    const floorTex = makeWoodTexture();
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(6, 12);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.55,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 30), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = COURT.floorY;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Painted lines on floor — three-point arc + key
    this._addCourtLines();

    // Back wall behind the hoop
    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 8),
      new THREE.MeshStandardMaterial({ color: 0x0c0e16, roughness: 0.95 }),
    );
    backWall.position.set(0, 4, -10);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    // Side walls (far behind for atmosphere)
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x10131e, roughness: 0.9 });
    const left = new THREE.Mesh(new THREE.PlaneGeometry(30, 8), sideMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-9, 4, -2);
    this.scene.add(left);
    const right = left.clone();
    right.rotation.y = -Math.PI / 2;
    right.position.set(9, 4, -2);
    this.scene.add(right);

    // Stanchion + arm + backboard frame are added by Hoop3D
  }

  _addCourtLines() {
    const lineMat = new THREE.LineBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.7 });

    // Three-point arc (radius 6.75m from hoop center, projected on floor)
    const arcPts = [];
    const arcR = 6.75;
    const cx = COURT.rim.x;
    const cz = COURT.rim.z;
    for (let a = -Math.PI * 0.78; a <= Math.PI * 0.78; a += 0.05) {
      arcPts.push(new THREE.Vector3(cx + Math.sin(a) * arcR, 0.01, cz + Math.cos(a) * arcR));
    }
    const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), lineMat);
    this.scene.add(arc);

    // Free throw lane (the key)
    const keyW = 4.9, keyD = 5.8;
    const keyPts = [
      new THREE.Vector3(cx - keyW / 2, 0.01, cz),
      new THREE.Vector3(cx - keyW / 2, 0.01, cz + keyD),
      new THREE.Vector3(cx + keyW / 2, 0.01, cz + keyD),
      new THREE.Vector3(cx + keyW / 2, 0.01, cz),
    ];
    const keyLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(keyPts), lineMat);
    this.scene.add(keyLine);

    // Free throw circle
    const ftCirc = [];
    for (let a = 0; a <= Math.PI * 2; a += 0.1) {
      ftCirc.push(new THREE.Vector3(cx + Math.cos(a) * 1.8, 0.01, cz + keyD + Math.sin(a) * 1.8));
    }
    const ft = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ftCirc), lineMat);
    this.scene.add(ft);
  }

  _buildFloorBody() {
    const floorBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: this.materials.floor,
      collisionFilterGroup: GROUP.FLOOR,
      collisionFilterMask: GROUP.BALL,
    });
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.physicsWorld.addBody(floorBody);
  }

  step(dt) {
    this.physicsWorld.step(1 / 60, dt, 3);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  handleResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  // Project a 3D world position to 2D screen pixels (for HUD overlay).
  projectToScreen(vec3) {
    const v = vec3.clone().project(this.camera);
    const w = window.innerWidth;
    const h = window.innerHeight;
    return {
      x: (v.x * 0.5 + 0.5) * w,
      y: (-v.y * 0.5 + 0.5) * h,
      visible: v.z > -1 && v.z < 1,
    };
  }
}

// ── Procedural textures ──────────────────────────────────────────────────

export function makeBasketballTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');

  // Base orange leather with subtle gradient
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, '#d76318');
  grd.addColorStop(0.5, '#e3741f');
  grd.addColorStop(1, '#bf551a');
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);

  // Pebble grain (lots of tiny dots)
  for (let i = 0; i < 18000; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    const r = Math.random() * 1.4 + 0.3;
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '90,40,10' : '255,200,160'},${Math.random() * 0.18})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // Seam lines — black, thick. The classic 8-panel pattern uses 1 horizontal seam
  // (equator) plus 4 vertical seams forming great circles. On a UV-mapped sphere,
  // vertical seams appear as straight lines at u = 0, 0.25, 0.5, 0.75.
  g.strokeStyle = '#1a0c04';
  g.lineWidth = 6;
  g.lineCap = 'round';

  // Horizontal equator
  g.beginPath();
  g.moveTo(0, c.height / 2);
  g.lineTo(c.width, c.height / 2);
  g.stroke();

  // Vertical seams (curve toward poles)
  for (let i = 0; i < 4; i++) {
    const x = (i + 0.5) * (c.width / 4);
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, c.height);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function makeBasketballBumpMap() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#888';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 15000; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    const r = Math.random() * 1.2 + 0.4;
    g.fillStyle = Math.random() < 0.5 ? '#bbb' : '#555';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // seams as deep black
  g.strokeStyle = '#000';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, c.height / 2); g.lineTo(c.width, c.height / 2);
  g.stroke();
  for (let i = 0; i < 4; i++) {
    const x = (i + 0.5) * (c.width / 4);
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');

  // base
  g.fillStyle = '#a06a2c';
  g.fillRect(0, 0, c.width, c.height);

  // plank stripes
  for (let y = 0; y < c.height; y += 32) {
    const shade = 130 + Math.floor(Math.random() * 35);
    g.fillStyle = `rgb(${shade + 35}, ${shade - 5}, ${shade - 60})`;
    g.fillRect(0, y, c.width, 30);
    g.fillStyle = 'rgba(40, 22, 8, 0.6)';
    g.fillRect(0, y + 30, c.width, 2);
  }

  // grain noise
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = `rgba(60, 30, 12, ${Math.random() * 0.18})`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, Math.random() * 60, 1);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
