import type { Ctx2D, WeatherParticle } from '../types';

export function drawDimCinder(c: Ctx2D, w: WeatherParticle): void {
  c.save();c.translate(w.x,w.y);const r=w.size;
  c.rotate(w.rotation);
  c.fillStyle='rgba(153,63,48,.68)';
  c.beginPath();
  c.moveTo(-r*.82,-r*.15);
  c.lineTo(-r*.15,-r*.63);
  c.lineTo(r*.74,-r*.3);
  c.lineTo(r*.58,r*.36);
  c.lineTo(-r*.36,r*.55);
  c.closePath();
  c.fill();
  
      c.fillStyle='rgba(255,153,86,.78)';
  c.beginPath();
  c.ellipse(-r*.02,-r*.14,r*.33,r*.19,0,0,Math.PI*2);
  c.fill();
  c.restore();
}
