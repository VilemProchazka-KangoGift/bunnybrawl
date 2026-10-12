import {drawBouncyPlatformOverlay} from '../../../src/engine/rendering/hazards/zones.ts';
export function drawCue(c,p,t,variant,wobble){
  if(variant===0){drawBouncyPlatformOverlay(c,p,wobble,t);return;}
  c.save();const y=p.y-8,count=Math.max(2,Math.floor(p.width/55));
  if(variant===1){
    c.lineWidth=3;c.strokeStyle='#b64174';c.beginPath();c.moveTo(p.x,y);
    for(let x=0;x<=p.width;x+=8)c.lineTo(p.x+x,y+Math.sin(x*.075+t*2)*(1+wobble*4));c.stroke();
    c.strokeStyle='rgba(255,232,246,.8)';c.lineWidth=2;c.beginPath();c.moveTo(p.x,y+3);c.lineTo(p.x+p.width,y+3);c.stroke();
    c.fillStyle='rgba(244,107,169,.35)';c.fillRect(p.x,p.y+p.height-5,p.width,5);
  }else if(variant===2){
    c.fillStyle='rgba(120,35,100,.58)';
    for(let i=0;i<count;i++){
      const x=p.x+p.width*(i+.5)/count,cy=p.y+7;
      c.beginPath();c.moveTo(x-7,cy+3);c.lineTo(x,cy-4);c.lineTo(x+7,cy+3);c.lineTo(x+4,cy+6);c.lineTo(x,cy+2);c.lineTo(x-4,cy+6);c.closePath();c.fill();
    }
  }
  if(wobble>0){
    c.globalAlpha=wobble*.8;c.strokeStyle='#fff0b6';c.lineWidth=variant===3?3:2;
    const lift=(1-wobble)*18;
    for(let i=0;i<count;i++){
      const x=p.x+p.width*(i+.5)/count;c.beginPath();c.moveTo(x-5,y-lift-2);c.quadraticCurveTo(x,y-lift-7,x+5,y-lift-2);c.stroke();
      if(variant===3){c.beginPath();c.moveTo(x,y-3);c.lineTo(x,y-8-lift);c.stroke();}
    }
  }c.restore();
}
