import type { Ctx2D, WeatherParticle } from '../types';

export function drawSoftAshWisp(c: Ctx2D, w: WeatherParticle, scale = 1): void {
  c.save();
  c.translate(w.x, w.y);
  c.rotate(w.rotation);
  const r = w.size * scale;
  c.fillStyle='rgba(160,132,121,.43)';c.beginPath();c.ellipse(-r*.18,0,r*.76,r*.46,0,0,Math.PI*2);c.fill();
  c.fillStyle='rgba(191,164,150,.37)';c.beginPath();c.ellipse(r*.43,-r*.19,r*.57,r*.31,-.22,0,Math.PI*2);c.fill();
  c.restore();
}
