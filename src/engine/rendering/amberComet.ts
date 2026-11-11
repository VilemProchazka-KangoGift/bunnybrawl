import type { Ctx2D, WeatherParticle } from '../types';

export function drawAmberComet(c: Ctx2D, w: WeatherParticle): void {
  c.save();c.translate(w.x,w.y);c.rotate(Math.atan2(w.vy,w.vx));
  const r=w.size,tail=r*3.6;
  const g=c.createLinearGradient(-tail,0,0,0);
  g.addColorStop(0,'transparent');g.addColorStop(1,'#ffaf54');
  c.fillStyle=g;c.beginPath();c.moveTo(-tail,0);
  c.quadraticCurveTo(-r,-r*.6,0,-r*.48);
  c.lineTo(0,r*.48);c.quadraticCurveTo(-r,r*.6,-tail,0);c.fill();
  c.fillStyle='#fff0af';c.beginPath();c.arc(0,0,r*.62,0,Math.PI*2);c.fill();c.restore();
}
