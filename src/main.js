// Hoops — 3D arcade basketball
// Entry point

import { Game } from './game.js';
import { World3D } from './world3d.js';
import { initUpdateBanner } from './updateBanner.js';

const canvas3d = document.getElementById('gameCanvas3d');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
resize();

const world3d = new World3D(canvas3d);
const game = new Game(canvas, ctx, world3d);
game.start();

initUpdateBanner();
