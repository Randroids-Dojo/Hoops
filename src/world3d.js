// 3D scene + physics world setup
// Owns Three.js renderer/scene/camera and the cannon-es physics world.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeBallTextures } from './skinTextures.js';
import { getSkin } from './storeData.js';
import { getCourtTexture } from './skins.js';

export const COURT = {
  rim: new THREE.Vector3(0, 3.05, -3),     // rim center (regulation 10ft)
  rimRadius: 0.32,                          // oversized arcade-style for forgiveness
  rimTube: 0.012,
  backboardSize: { w: 1.83, h: 1.07, d: 0.04 },
  backboardOffset: 0.15 + 0.225,            // rim front to backboard face
  ballRadius: 0.155,                        // slightly oversized for visual presence
  ballMass: 0.62,
  cameraPos: new THREE.Vector3(0, 2.0, 4.6),
  cameraLookAt: new THREE.Vector3(0, 3.05, -3),
  ballSpawn: new THREE.Vector3(0, 1.6, 3.0),
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
    // Court floor — built with the default court skin. applyCourtSkin() can
    // swap the texture + material params later without rebuilding geometry.
    // Going through getCourtTexture (rather than makeCourtTexture directly)
    // seeds the per-skin texture cache with the default, so a later
    // applyCourtSkin('default') doesn't rasterize a new canvas just to land
    // back on the same look.
    const defaultSkin = getSkin('court', 'default');
    const floorTex = getCourtTexture('default');
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(6, 12);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: defaultSkin.params.roughness ?? 0.55,
      metalness: defaultSkin.params.metalness ?? 0.05,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 30), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = COURT.floorY;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.floor = floor;
    this.currentCourtSkinId = 'default';

    // Painted lines on floor — three-point arc + key (color comes from skin)
    this._addCourtLines(defaultSkin.params.line);

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

  _addCourtLines(lineColor = '#eeeeee') {
    // One shared material so applyCourtSkin can recolor every line in one
    // place. Stored on `this.lineMat` for later mutation.
    const lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(lineColor),
      transparent: true,
      opacity: 0.7,
    });
    this.lineMat = lineMat;

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

  // Swap the court floor texture + material params and recolor the painted
  // lines. Called by skins.js when the equipped court skin changes (live in
  // the store preview, or on game start). No geometry rebuild — only the
  // material and texture are replaced.
  applyCourtSkin(skinId) {
    const skin = getSkin('court', skinId);
    if (!skin || !this.floor) return;
    if (skinId === this.currentCourtSkinId) return;
    // Pull from the skins.js court cache so repeated previews don't re-paint
    // the 256×256 canvas. The cache owns the texture lifetime — we never
    // dispose maps swapped out by this call, since they may still be in the
    // cache and reachable by another preview tap.
    const tex = getCourtTexture(skinId);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 12);
    this.floor.material.map = tex;
    this.floor.material.roughness = skin.params.roughness ?? 0.55;
    this.floor.material.metalness = skin.params.metalness ?? 0.05;
    this.floor.material.needsUpdate = true;
    if (this.lineMat) this.lineMat.color.set(skin.params.line);
    this.currentCourtSkinId = skinId;
  }

  _buildFloorBody() {
    const floorBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: this.materials.floor,
      collisionFilterGroup: GROUP.FLOOR,
      collisionFilterMask: GROUP.BALL,
    });
    floorBody.userData = { isFloor: true };
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.physicsWorld.addBody(floorBody);
  }

  step(dt) {
    this.physicsWorld.step(1 / 60, dt, 3);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  // Read the canvas' own CSS-pixel size — keeps the 3D camera and the 2D
  // overlay projection consistent even if the canvas is inset, padded, or
  // CSS-scaled relative to the window.
  _canvasSize() {
    const c = this.renderer.domElement;
    return {
      w: c.clientWidth || window.innerWidth,
      h: c.clientHeight || window.innerHeight,
    };
  }

  handleResize() {
    const { w, h } = this._canvasSize();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  // Project a 3D world position to 2D screen pixels (for HUD overlay).
  projectToScreen(vec3) {
    const v = vec3.clone().project(this.camera);
    const { w, h } = this._canvasSize();
    return {
      x: (v.x * 0.5 + 0.5) * w,
      y: (-v.y * 0.5 + 0.5) * h,
      visible: v.z > -1 && v.z < 1,
    };
  }
}

// ── Procedural textures ──────────────────────────────────────────────────
// Generators moved into skinTextures.js so the catalog can drive them with
// per-skin params. The previously-exported helpers are kept as thin shims so
// any external consumer that imports them still works — internally, ball.js
// goes through skins.js now.

export function makeBasketballTexture() {
  const defaultSkin = getSkin('ball', 'default');
  return makeBallTextures(defaultSkin.params).map;
}

export function makeBasketballBumpMap() {
  const defaultSkin = getSkin('ball', 'default');
  return makeBallTextures(defaultSkin.params).bumpMap;
}
