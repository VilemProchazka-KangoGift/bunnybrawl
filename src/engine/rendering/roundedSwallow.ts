import type { Ctx2D, WildlifeEntity } from '../types';

export function drawRoundedSwallow(c: Ctx2D, w: WildlifeEntity, size = 1): void {
  c.save();c.translate(w.x,w.y);c.scale(size,size);
  const flap=Math.sin(w.wingPhase)*3;
  c.fillStyle=w.color;c.beginPath();c.moveTo(-2,1);
   c.quadraticCurveTo(-5,1+flap,-8,-3+flap);
   c.quadraticCurveTo(-3,-4+flap,0,-.7);
   c.quadraticCurveTo(3,-4+flap,8,-3+flap);
   c.quadraticCurveTo(6,1+flap,2,1);
  c.lineTo(0,3);c.closePath();c.fill();
  c.beginPath();c.ellipse(1,0,2.7,1.35,0,0,Math.PI*2);c.fill();c.restore();
}
