
function drawDimCinder(c,w) {
  c.save();c.translate(w.x,w.y);const r=w.size;
  c.rotate(w.rotation);
  c.fillStyle='rgba(153,63,48,.68)';
  c.beginPath();
  c.moveTo(-r*.82,-r*.15);
  c.lineTo(-r*.15,-r*.63);
  c.lineTo(r*.74,-r*.3);
  c.lineTo(r*.58,r*.36);
  c.lineTo(-r*.36,r*.55);
  c.closePath();
  c.fill();
  
      c.fillStyle='rgba(255,153,86,.78)';
  c.beginPath();
  c.ellipse(-r*.02,-r*.14,r*.33,r*.19,0,0,Math.PI*2);
  c.fill();
  c.restore();
}

export function weatherAt(t){
 const wrap=(x,m)=>((x%m)+m)%m;
 return Array.from({length:15},(_,i)=>{
  const vx=(i*7)%11-5,vy=-15-(i*9)%21,rotSpeed=(i%5)*.25;
  return {type:'ember',x:wrap(97+i*173+vx*t,1280),y:wrap(77+i*97+vy*t,720),vx,vy,size:1+i%3,rotation:i*.71+t*rotSpeed,rotSpeed,color:'#FF8844'};
 });
}
export function drawCue(c,weather,variant,theme){
 for(const w of weather){
  if(variant===0){theme.drawWeatherParticle(c,w);continue;}
  if(variant===2){drawDimCinder(c,w);continue;}
  if(variant===3)continue;
  c.save();c.translate(w.x,w.y);c.rotate(w.rotation);const r=w.size;
  c.fillStyle='rgba(231,121,64,.77)';c.beginPath();c.moveTo(-r*.62,r*.47);
  c.quadraticCurveTo(-r*.92,-r*.24,r*.3,-r);c.quadraticCurveTo(r*.25,-r*.19,r*.67,r*.05);
  c.quadraticCurveTo(r*.67,r*.65,-r*.62,r*.47);c.fill();
  c.strokeStyle='rgba(255,211,140,.82)';c.lineWidth=r*.23;c.lineCap='round';
  c.beginPath();c.moveTo(-r*.25,r*.28);c.lineTo(r*.08,-r*.34);c.stroke();c.restore();
 }
}
