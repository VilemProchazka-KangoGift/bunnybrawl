import {drawWeather} from '../../../src/engine/rendering/particles.ts';
export function weatherAt(t){
 return Array.from({length:35},(_,i)=>{
  const leaf=i<25,vx=leaf?(i*11)%31-15:(i*11)%21-10,vy=leaf?15+(i*7)%26:10+(i*7)%16,rotSpeed=leaf?1+i%4:2+i%4;
  return {type:leaf?'leaf':'petal',x:((97+i*173+vx*t)%1280+1280)%1280,y:(77+i*97+vy*t)%720,vx,vy,size:leaf?3+i%5:2+i%3,rotation:i*.71+t*rotSpeed,rotSpeed};
 });
}

function drawNotchedPetal(c,w,lead=0) {
  c.save();
  c.translate(w.x + w.vx * lead, w.y + w.vy * lead);
  c.rotate(w.rotation + w.rotSpeed * lead);
  const r = w.size;
  // A broad blossom petal: two rounded lobes taper into a single base.
  c.globalAlpha*=.72;c.fillStyle='#f5afc7';
  c.beginPath();c.moveTo(-r,0);
  c.bezierCurveTo(-r*.25,-r*.95,r*.95,-r*.98,r*.9,-r*.35);
  c.quadraticCurveTo(r*.82,-r*.09,r*.58,0);
  c.quadraticCurveTo(r*1.25,r*.63,r*.49,r*.68);
  c.quadraticCurveTo(-r*.12,r*.63,-r,0);c.fill();
  c.strokeStyle='#ffebee';c.lineWidth=.55;
  c.beginPath();c.moveTo(-r*.68,0);c.quadraticCurveTo(0,-r*.29,r*.52,-r*.46);c.stroke();
  c.restore();
}

export function drawCue(c,weather,variant,theme){
 for(const w of weather){
  if(w.type!=='petal'||variant===0){drawWeather(c,[w],theme);continue;}
  if(variant===3)continue;
  if(variant===1){drawNotchedPetal(c,w);continue;}
  c.save();c.translate(w.x,w.y);c.rotate(w.rotation);const r=w.size;
  c.fillStyle='rgba(251,226,180,.83)';c.beginPath();c.moveTo(-r,0);
  c.bezierCurveTo(-r*.4,-r*.85,r*.57,-r*.67,r,.08);c.quadraticCurveTo(r*.22,r*.73,-r,0);c.fill();
  c.fillStyle='rgba(195,130,106,.66)';c.beginPath();c.moveTo(-r*.66,0);c.quadraticCurveTo(r*.25,-r*.12,r,.08);c.quadraticCurveTo(r*.22,r*.73,-r*.66,0);c.fill();
  c.restore();
 }
}
