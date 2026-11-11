import type { Ctx2D, WeatherParticle } from '../types';

export function drawSoftSnowClump(c: Ctx2D, w: WeatherParticle): void {
  c.save();
  c.translate(w.x, w.y);
  c.rotate(w.rotation);
  const r = w.size;
  c.fillStyle='rgba(161,198,222,.8)';c.beginPath();c.ellipse(0,0,r,r*.8,0,0,Math.PI*2);c.fill();
  c.fillStyle='rgba(249,252,255,.9)';c.beginPath();
  c.ellipse(-r*.3,-r*.2,r*.59,r*.63,0,0,Math.PI*2);
  c.ellipse(r*.29,-r*.19,r*.55,r*.54,0,0,Math.PI*2);c.fill();
  c.restore();
}
