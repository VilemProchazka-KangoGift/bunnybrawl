import {drawShootingStars} from '../../../src/engine/rendering/effects.ts';
export function starAt(t){
  const age=t%1.6;
  if(age>=.4)return null;
  const event=Math.floor(t/1.6),vx=400,vy=75;
  return {x:200+(event%3)*160+vx*age,y:95+(event%2)*60+vy*age,vx,vy,life:.4-age,tailLen:40};
}
export function drawCue(c,t,variant){
  const star=starAt(t);
  if(!star||variant===3)return;
  const {vx,vy}=star;
  if(variant===0){drawDayNightCycle(c,.5,{shootingStars:[star]},noFireflies,t*1000);return;}
  c.save();c.translate(star.x,star.y);c.rotate(Math.atan2(vy,vx));
  const alpha=Math.min(1,star.life*2);c.globalAlpha=alpha;
  if(variant===1){
    c.fillStyle='rgba(162,220,255,.4)';c.beginPath();c.moveTo(-40,0);c.quadraticCurveTo(-17,-8,1,-4);c.lineTo(5,0);c.lineTo(1,4);c.quadraticCurveTo(-17,7,-40,0);c.fill();
    c.fillStyle='#526e93';c.beginPath();c.moveTo(-4,-2);c.lineTo(0,-5);c.lineTo(5,-2);c.lineTo(6,2);c.lineTo(1,5);c.lineTo(-3,3);c.closePath();c.fill();
    c.fillStyle='#e1f5ff';c.beginPath();c.moveTo(-2,0);c.lineTo(1,-3);c.lineTo(4,0);c.lineTo(1,3);c.closePath();c.fill();
  }else{
    c.strokeStyle='rgba(182,218,246,.25)';c.lineWidth=1;c.beginPath();c.moveTo(0,0);c.lineTo(-40,0);c.stroke();
    for(let i=0;i<5;i++){
      const x=-i*8,r=3.5-i*.55;c.globalAlpha=alpha*(1-i*.18);c.fillStyle='#e8efff';
      c.beginPath();c.moveTo(x-r,0);c.quadraticCurveTo(x, -r*.25,x,-r);c.quadraticCurveTo(x+r*.25,0,x+r,0);c.quadraticCurveTo(x,r*.25,x,r);c.quadraticCurveTo(x-r*.25,0,x-r,0);c.fill();
    }
  }c.restore();
}
