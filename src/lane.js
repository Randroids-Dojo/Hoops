// The 3D arena/court is built inside World3D. This module is kept as a no-op
// to preserve the Game's update() / render() integration points.

export class Lane {
  update(_dt) {}
  render(_ctx, _canvas) {}
}
