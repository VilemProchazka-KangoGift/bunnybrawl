export function weatherAt(t){
 return Array.from({length:7},(_,i)=>{
  const vx=5+(i*11)%16,vy=5+(i*7)%11,rotSpeed=1+i%4;
  return {type:'leaf',x:(97+i*173+vx*t)%1280,y:(77+i*97+vy*t)%720,vx,vy,size:3+i%3,rotation:i*.71+t*rotSpeed,rotSpeed};
 });
}
export function drawCue(c,weather,variant,theme){
 for(const w of weather){
  if(variant===0){c.save();c.translate(w.x,w.y);c.rotate(w.rotation);c.fillStyle="rgba(200,190,170,.35)";c.fillRect(-w.size,-w.size*.4,w.size*2,w.size*.8);c.restore();continue;}
  if(variant===3)continue;
  if(variant===4){theme.drawWeatherParticle(c,w);continue;}
  c.save();c.translate(w.x,w.y);c.rotate(w.rotation);const r=w.size;
  c.fillStyle=variant===1?'rgba(213,185,113,.72)':'rgba(179,126,66,.77)';
  c.beginPath();c.moveTo(-r,0);
  if(variant===1){
   c.lineTo(-r*.69,-r*.38);c.lineTo(-r*.36,-r*.33);c.lineTo(-r*.09,-r*.62);
   c.lineTo(r*.23,-r*.46);c.lineTo(r,0);c.quadraticCurveTo(r*.04,r*.88,-r,0);
  }else{
   c.bezierCurveTo(-r*.27,-r*.95,r*.58,-r*.5,r,.18);c.quadraticCurveTo(r*.33,r*.56,-r,0);
  }
  c.closePath();c.fill();
  c.strokeStyle='rgba(245,213,147,.78)';c.lineWidth=r*.13;c.beginPath();c.moveTo(-r*.78,0);c.quadraticCurveTo(0,-r*.12,r*.72,r*.05);c.stroke();c.restore();
 }
}
