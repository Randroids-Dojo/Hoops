// Hoops — 3D arcade basketball
// Entry point

import { Game } from './game.js';
import { World3D } from './world3d.js';
import { initUpdateBanner } from './updateBanner.js';

const canvas3d = document.getElementById('gameCanvas3d');
const canvas = document.getElementById('gameCanvas');
if (!canvas3d || !canvas) {
  throw new Error('Hoops: missing required <canvas> element(s). Expected #gameCanvas3d and #gameCanvas.');
}
const ctx = canvas.getContext('2d');

function resize() {
  // While the mobile keyboard is open (the high-score initials input is
  // focused), Android shrinks window.innerHeight. Resizing the canvas to
  // that smaller height reflows everything we draw at fractional-y
  // coordinates, making the slots appear to jump as the keyboard
  // animates in. Skip those keyboard-induced height changes — width is
  // unaffected by the keyboard, so genuine rotation/resize still updates.
  const nameInput = document.getElementById('nameEntryInput');
  const keyboardOpen = nameInput && document.activeElement === nameInput;
  const widthChanged = canvas.width !== window.innerWidth;
  if (keyboardOpen && !widthChanged) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
resize();

const world3d = new World3D(canvas3d);
const game = new Game(canvas, ctx, world3d);
game.start();

initUpdateBanner();
