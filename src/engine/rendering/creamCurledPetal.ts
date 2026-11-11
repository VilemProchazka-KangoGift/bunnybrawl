import type { Ctx2D, WeatherParticle } from '../types';

export function drawCreamCurledPetal(c: Ctx2D, w: WeatherParticle): void {
  c.save();c.translate(w.x,w.y);c.rotate(w.rotation);const r=w.size;
  c.fillStyle='rgba(251,226,180,.83)';c.beginPath();c.moveTo(-r,0);
  c.bezierCurveTo(-r*.4,-r*.85,r*.57,-r*.67,r,.08);c.quadraticCurveTo(r*.22,r*.73,-r,0);c.fill();
  c.fillStyle='rgba(195,130,106,.66)';c.beginPath();c.moveTo(-r*.66,0);c.quadraticCurveTo(r*.25,-r*.12,r,.08);c.quadraticCurveTo(r*.22,r*.73,-r*.66,0);c.fill();
  c.restore();
}
