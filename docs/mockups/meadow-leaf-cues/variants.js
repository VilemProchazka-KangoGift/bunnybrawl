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
    if(w.type!=='leaf'){drawWeather(c,[w],theme);continue;}
    if(variant===0){
      c.save();c.fillStyle='rgba(90,160,60,.4)';c.beginPath();c.ellipse(w.x,w.y,w.size,w.size*.4,w.rotation,0,Math.PI*2);c.fill();
      const dx=w.size*.7*Math.cos(w.rotation),dy=w.size*.7*Math.sin(w.rotation);c.strokeStyle='rgba(60,120,40,.3)';c.lineWidth=.5;c.beginPath();c.moveTo(w.x-dx,w.y-dy);c.lineTo(w.x+dx,w.y+dy);c.stroke();c.restore();continue;
    }
    if(variant===3)continue;
    c.save();c.translate(w.x,w.y);c.rotate(w.rotation);c.globalAlpha=.55;
    const r=w.size;c.lineWidth=.65;c.strokeStyle='#486336';c.fillStyle='#89ab58';
    if(variant===1){
      c.beginPath();c.moveTo(-r,0);c.bezierCurveTo(-r*.2,-r*.75,r*.5,-r*.6,r,0);c.bezierCurveTo(r*.2,r*.7,-r*.6,r*.45,-r,0);c.fill();c.stroke();
      c.fillStyle='#b9cb79';c.beginPath();c.moveTo(-r*.8,0);c.quadraticCurveTo(0,-r*.65,r*.85,0);c.quadraticCurveTo(0,-r*.1,-r*.8,0);c.fill();
      c.beginPath();c.moveTo(-r*1.15,0);c.lineTo(r*.7,0);c.stroke();
    }else{
      c.beginPath();c.moveTo(-r,0);c.bezierCurveTo(-r*.3,-r*.9,r,-r*.65,r*.85,r*.15);c.quadraticCurveTo(r*.3,r*.65,-r*.1,r*.2);c.quadraticCurveTo(-r*.55,r*.65,-r,0);c.fill();c.stroke();
      c.strokeStyle='#c4d88c';c.beginPath();c.moveTo(-r*.65,-r*.1);c.quadraticCurveTo(r*.2,-r*.55,r*.65,0);c.stroke();
      c.fillStyle='#536e38';c.beginPath();c.moveTo(-r*.1,r*.2);c.quadraticCurveTo(r*.5,-r*.05,r*.85,r*.15);c.quadraticCurveTo(r*.3,r*.65,-r*.1,r*.2);c.fill();
    }c.restore();
  }
}
