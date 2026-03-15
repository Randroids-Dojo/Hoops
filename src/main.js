// Hoops - Arcade Basketball Shooter
// Entry point

import { Game } from './game.js';
import { initUpdateBanner } from './updateBanner.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
resize();

const game = new Game(canvas, ctx);
game.start();

initUpdateBanner();
