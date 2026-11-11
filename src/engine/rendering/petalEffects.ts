import type { Ctx2D, WeatherParticle } from '../types';

export function drawNotchedPetal(c: Ctx2D, w: WeatherParticle, lead = 0): void {
  c.save();
  c.translate(w.x + w.vx * lead, w.y + w.vy * lead);
  c.rotate(w.rotation + w.rotSpeed * lead);
  const r = w.size;
  // A broad blossom petal: two rounded lobes taper into a single base.
  c.globalAlpha*=.72;c.fillStyle='#f5afc7';
  c.beginPath();c.moveTo(-r,0);
  c.bezierCurveTo(-r*.25,-r*.95,r*.95,-r*.98,r*.9,-r*.35);
  c.quadraticCurveTo(r*.82,-r*.09,r*.58,0);
  c.quadraticCurveTo(r*1.25,r*.63,r*.49,r*.68);
  c.quadraticCurveTo(-r*.12,r*.63,-r,0);c.fill();
  c.strokeStyle='#ffebee';c.lineWidth=.55;
  c.beginPath();c.moveTo(-r*.68,0);c.quadraticCurveTo(0,-r*.29,r*.52,-r*.46);c.stroke();
  c.restore();
}
