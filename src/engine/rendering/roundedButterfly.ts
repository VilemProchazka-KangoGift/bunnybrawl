import type { Ctx2D, WildlifeEntity } from '../types';

export function drawRoundedButterfly(c: Ctx2D, w: WildlifeEntity, size = 1): void {
  c.save();c.translate(w.x,w.y);c.scale(size,size);
  const width=.52+.48*Math.abs(Math.sin(w.wingPhase));
  c.fillStyle=w.color;c.strokeStyle='#543b40';c.lineWidth=.65;
  for(const dir of [-1,1]){
   c.save();c.scale(dir*width,1);
   c.beginPath();c.moveTo(0,1);c.bezierCurveTo(1,-5,7,-7,7,-3);
   c.quadraticCurveTo(7,0,4,1);c.quadraticCurveTo(5,4,2,4);c.quadraticCurveTo(0,4,0,1);
   c.fill();c.stroke();
   c.restore();
  }
  c.fillStyle='#543b40';c.fillRect(-.55,-2,1.1,5);
  c.restore();
}
