import {fireflyPosition,FIREFLY_COUNT} from '../../../src/engine/rendering/effects.ts';
import {fastSin} from '../../../src/engine/fastMath.ts';
export function drawCue(c,t,variant,theme){
  if(variant===3)return;
  const p={x:0,y:0};
  c.save();
  for(let i=0;i<FIREFLY_COUNT;i++){
    fireflyPosition(i,t*1000,p);const pulse=(fastSin(t*2+i*1.1)*.3+.7)*.7;
    c.save();c.translate(p.x,p.y);c.globalAlpha=pulse*.2;
    if(variant===0){
      c.globalAlpha=pulse*.3;c.fillStyle='#AAFF44';c.beginPath();c.arc(0,0,6,0,Math.PI*2);c.fill();
      c.globalAlpha=pulse;c.fillStyle='#CCFF66';c.beginPath();c.arc(0,0,2,0,Math.PI*2);c.fill();c.restore();continue;
    }
    c.fillStyle=variant===1?'#b6e77d':'#ffdc80';c.beginPath();c.ellipse(0,0,8,7,0,0,Math.PI*2);c.fill();
    c.globalAlpha=pulse;
    if(variant===1){
      c.fillStyle='#e3e6ba';c.beginPath();c.ellipse(-3,-2,3,1.6,-.5,0,Math.PI*2);c.ellipse(3,-2,3,1.6,.5,0,Math.PI*2);c.fill();
      c.fillStyle='#3b4b35';c.beginPath();c.ellipse(0,-1,1.8,3.5,0,0,Math.PI*2);c.fill();
      c.fillStyle='#d7f78d';c.beginPath();c.ellipse(0,2,2.2,2.5,0,0,Math.PI*2);c.fill();
    }else{
      c.fillStyle='#463e34';c.beginPath();c.moveTo(-4,0);c.lineTo(-1,-3);c.lineTo(3,-2);c.lineTo(4,1);c.lineTo(0,4);c.closePath();c.fill();
      c.fillStyle='#ffe5a0';c.beginPath();c.moveTo(-2,0);c.lineTo(0,-2);c.lineTo(2,0);c.lineTo(0,2);c.closePath();c.fill();
    }c.restore();
  }c.restore();
}
