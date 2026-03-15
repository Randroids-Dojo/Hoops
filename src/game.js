// Game state machine and main loop

export class Game {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.state = 'title'; // title, playing, stageClear, gameOver
    this.lastTime = 0;
  }

  start() {
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  loop(timestamp) {
    const dt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    // TODO: Update game logic based on state
  }

  render() {
    const { ctx, canvas } = this;
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // TODO: Render based on state
    // Placeholder title
    ctx.fillStyle = '#00E5FF';
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HOOPS', canvas.width / 2, canvas.height / 2 - 20);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '20px monospace';
    ctx.fillText('Arcade Basketball Shooter', canvas.width / 2, canvas.height / 2 + 30);
    ctx.fillText('Coming Soon', canvas.width / 2, canvas.height / 2 + 70);
  }
}
