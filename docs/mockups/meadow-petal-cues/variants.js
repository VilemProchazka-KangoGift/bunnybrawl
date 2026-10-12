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
    if(w.type!=='petal'||variant===0){drawWeather(c,[w],theme);continue;}
    if(variant===3)continue;
    c.save();c.translate(w.x,w.y);c.rotate(w.rotation);c.globalAlpha=variant===1?.45:.5;
    const r=w.size;c.fillStyle='#e9a8b8';c.strokeStyle='#995b73';c.lineWidth=.55;
    c.beginPath();c.moveTo(-r,0);
    c.bezierCurveTo(-r*.7,-r*.75,r*.45,-r*.9,r,0);
    c.bezierCurveTo(r*.5,r*.7,-r*.7,r*.4,-r,0);c.fill();
    if(variant===2)c.stroke();
    c.fillStyle='#f9d6db';c.beginPath();c.moveTo(-r*.8,0);
    c.quadraticCurveTo(-r*.1,-r*.65,r*.7,-r*.1);c.quadraticCurveTo(0,-r*.05,-r*.8,0);c.fill();
    c.fillStyle='#c9829c';c.beginPath();c.moveTo(-r*.3,r*.1);c.quadraticCurveTo(r*.45,-r*.1,r,0);c.quadraticCurveTo(r*.25,r*.55,-r*.3,r*.1);c.fill();
    c.restore();
  }
}
