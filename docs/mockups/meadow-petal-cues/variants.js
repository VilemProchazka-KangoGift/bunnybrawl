import {drawNotchedPetal} from '../../../src/engine/rendering/petalEffects.ts';
import {drawWeather} from '../../../src/engine/rendering/particles.ts';
export function weatherAt(t){
  return Array.from({length:30},(_,i)=>{
    const leaf=i<18,vx=leaf?10+i%21:-20+i%40,vy=leaf?15+i%21:10+i%16;
    return {type:leaf?'leaf':'petal',x:(37+i*173+vx*t)%1280,y:(29+i*97+vy*t)%720,
      vx,vy,size:leaf?3+i%4:2+i%3,rotation:i*.71+t*(leaf?1+i%3:2+i%4),rotSpeed:leaf?1+i%3:2+i%4};
  });
}
export function drawCue(c,weather,variant,theme){
  for(const w of weather){
    if(w.type!=='petal'){drawWeather(c,[w],theme);continue;}
    if(variant===0){c.save();c.fillStyle='rgba(255, 180, 200, 0.35)';c.beginPath();c.ellipse(w.x,w.y,w.size,w.size*.6,w.rotation,0,Math.PI*2);c.fill();c.restore();continue;}
    if(variant===1){drawNotchedPetal(c,w);continue;}
    if(variant===3)continue;
    c.save();c.translate(w.x,w.y);c.rotate(w.rotation);
    const r=w.size;
      // A narrow folded petal: pointed ends and a darker underside.
      c.globalAlpha=.75;c.fillStyle='#e68aa8';c.strokeStyle='#814963';c.lineWidth=.6;
      c.beginPath();c.moveTo(-r,0);c.quadraticCurveTo(-r*.13,-r*.74,r,0);
      c.quadraticCurveTo(r*.17,r*.54,-r,0);c.closePath();c.fill();c.stroke();
      c.fillStyle='#aa5978';c.beginPath();c.moveTo(-r,0);c.quadraticCurveTo(r*.19,r*.16,r,0);
      c.quadraticCurveTo(r*.17,r*.54,-r,0);c.fill();
    c.restore();
  }
}
