import {drawDimCinder} from '../../../src/engine/rendering/dimCinder.ts';
function drawOriginalGlow(ctx,w){
      // Embers are circles — rotation has no visual effect, so skip the
      // save/translate/rotate/restore canvas-state dance and draw directly
      // at world coords. The arc primitive accepts a center, so this is
      // exactly equivalent visually.
      const x = w.x, y = w.y, s = w.size;
      const color = w.color || '#FF6B00';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFCC00';
      ctx.beginPath();
      ctx.arc(x, y, s * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, s * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
}
const wrap=(v,max)=>((v%max)+max)%max;
export function weatherAt(t){
  return Array.from({length:40},(_,i)=>{
    const ash=i>=28,hot=i>=24&&!ash;
    const vx=i%(hot?11:ash?31:21)-(hot?5:ash?15:10),vy=ash?10+i%21:-(hot?60:40)-i%41;
    return {type:ash?'ash':'ember',x:wrap(37+i*173+vx*t,1280),y:wrap(29+i*97+vy*t,720),vx,vy,size:ash?2+i%3:hot?3+i%4:2+i%4,rotation:i*.71+t*(ash?1+i%3:.5),rotSpeed:ash?1+i%3:.5,color:ash?'rgba(120,100,90,.5)':hot?'#FFAA00':'#FF6B00'};
  });
}
export function drawCue(c,weather,variant,theme){
  for(const w of weather){
    if(w.type!=='ember'){theme.drawWeatherParticle(c,w);continue;}
    if(variant===0){drawOriginalGlow(c,w);continue;}
    if(variant===2){drawDimCinder(c,w);continue;}
    if(variant===3)continue;
    c.save();c.translate(w.x,w.y);const r=w.size;
    if(variant===1){
      c.rotate(Math.atan2(w.vy,w.vx));
      c.fillStyle='rgba(245,82,35,.75)';
      c.beginPath();c.moveTo(-r*2.2,0);c.quadraticCurveTo(0,-r*.9,r*.7,-r*.45);c.quadraticCurveTo(r*1.5,0,r*.7,r*.45);c.quadraticCurveTo(0,r*.9,-r*2.2,0);c.fill();
      c.fillStyle='#ffe09a';c.beginPath();c.ellipse(r*.38,0,r*.56,r*.29,0,0,Math.PI*2);c.fill();
    }else if(variant>=4){
      c.rotate(w.rotation);c.scale(r,r);
      if(variant===4){
        c.fillStyle='rgba(91,55,53,.86)';c.beginPath();c.moveTo(-.86,-.27);c.lineTo(-.18,-.69);c.lineTo(.61,-.46);c.lineTo(.78,.17);c.lineTo(.25,.64);c.lineTo(-.63,.46);c.closePath();c.fill();
        c.strokeStyle='rgba(239,131,76,.82)';c.lineWidth=.18;c.beginPath();c.moveTo(-.49,-.24);c.lineTo(-.14,.03);c.lineTo(.05,-.19);c.lineTo(.45,.24);c.stroke();
      }else if(variant===5){
        c.fillStyle='rgba(116,62,53,.8)';c.beginPath();c.moveTo(-1.13,.33);c.lineTo(.05,-.61);c.lineTo(.98,-.14);c.lineTo(.39,.45);c.closePath();c.fill();
        c.strokeStyle='rgba(255,159,103,.78)';c.lineWidth=.16;c.beginPath();c.moveTo(-.68,.03);c.lineTo(.05,-.61);c.lineTo(.69,-.29);c.stroke();
      }else{
        c.fillStyle='rgba(127,71,60,.72)';c.beginPath();c.ellipse(-.14,0,.68,.49,.25,0,Math.PI*2);c.fill();
        c.fillStyle='rgba(233,142,91,.76)';c.beginPath();c.arc(-.23,-.13,.2,0,Math.PI*2);c.fill();
        c.fillStyle='rgba(178,101,76,.65)';c.beginPath();c.arc(.65,-.24,.18,0,Math.PI*2);c.moveTo(.61,.38);c.arc(.49,.38,.12,0,Math.PI*2);c.fill();
      }
    }
    c.restore();
  }
}
