import {drawZeroGZone} from '../../../src/engine/rendering/hazards/zones.ts';
export function drawCue(c,z,t,variant){
  if(variant===0){drawZeroGZone(c,z,t);return;}
  // All alternatives mark the exact gameplay bounds, including the minimal option.
  c.save();c.strokeStyle='#65dfff';c.globalAlpha=.6;c.lineWidth=2;
  c.strokeRect(z.x+1,z.y+1,z.width-2,z.height-2);
  c.restore();
  if(variant===3)return;
  c.save();c.beginPath();c.rect(z.x,z.y,z.width,z.height);c.clip();
  if(variant===1){
    for(let i=0;i<30;i++){
      const cx=z.x+35+(i*137)%(z.width-70),cy=z.y+35+(i*83)%(z.height-70);
      const a=t*.65+i*2.4,x=cx+Math.cos(a)*24,y=cy+Math.sin(a)*17;
      c.save();c.translate(x,y);c.rotate(a*.6);c.globalAlpha=.55+.15*Math.sin(a);
      c.fillStyle=i%3?'#9debf1':'#fff1a9';c.strokeStyle='#467786';c.lineWidth=1.2;
      c.beginPath();c.moveTo(-5,0);c.lineTo(-1,-4);c.lineTo(5,-1);c.lineTo(2,4);c.closePath();c.fill();c.stroke();c.restore();
    }
  }else{
    for(let i=0;i<24;i++){
      const x=z.x+24+(i*113)%(z.width-48),y=z.y+((i*71-t*48)%z.height+z.height)%z.height;
      const g=c.createLinearGradient(0,y,0,y+55);g.addColorStop(0,'rgba(169,243,255,.5)');g.addColorStop(1,'rgba(169,243,255,0)');
      c.strokeStyle=g;c.lineWidth=2.5;c.lineCap='round';c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x-6,y+16,x+5,y+35,x,y+55);c.stroke();
    }
  }c.restore();
}
