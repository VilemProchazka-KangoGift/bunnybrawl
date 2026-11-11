
function drawAmberComet(c,w) {
  c.save();c.translate(w.x,w.y);c.rotate(Math.atan2(w.vy,w.vx));
  const r=w.size,tail=r*3.6;
  const g=c.createLinearGradient(-tail,0,0,0);
  g.addColorStop(0,'transparent');g.addColorStop(1,'#ffaf54');
  c.fillStyle=g;c.beginPath();c.moveTo(-tail,0);
  c.quadraticCurveTo(-r,-r*.6,0,-r*.48);
  c.lineTo(0,r*.48);c.quadraticCurveTo(-r,r*.6,-tail,0);c.fill();
  c.fillStyle='#fff0af';c.beginPath();c.arc(0,0,r*.62,0,Math.PI*2);c.fill();c.restore();
}
export function weatherAt(t){
 const wrap=(x,m)=>((x%m)+m)%m;
 return Array.from({length:15},(_,i)=>{
  const ember=i<6,vx=ember?(i*7)%11-5:(i*7)%17-8,vy=ember?-5-(i*9)%11:-10-(i*9)%16,rotSpeed=(i%5)*(ember?.125:.25);
  return {type:ember?'ember':'spark',x:wrap(97+i*173+vx*t,1280),y:wrap(77+i*97+vy*t,720),vx,vy,size:1+i%(ember?2:3),rotation:i*.71+t*rotSpeed,rotSpeed,color:ember?'#FFAA00':'#00CCFF'};
 });
}

export function drawCue(c,weather,variant,theme){
 for(const w of weather){
  if(w.type==='ember'){drawAmberComet(c,w);continue;}
  if(variant===0){theme.drawWeatherParticle(c,w);continue;}
  if(variant===3)continue;
  c.save();c.translate(w.x,w.y);c.rotate(Math.atan2(w.vy,w.vx));const r=w.size;
  if(variant===1){
   c.strokeStyle='#5edbff';c.lineWidth=r*.43;c.lineJoin='round';c.lineCap='round';
   c.beginPath();c.moveTo(-r*1.24,r*.41);c.lineTo(-r*.23,-r*.37);c.lineTo(-r*.12,r*.25);c.lineTo(r*.91,-r*.29);c.stroke();
   c.fillStyle='#e8fcff';c.beginPath();c.arc(r*.91,-r*.29,r*.24,0,Math.PI*2);c.fill();
  }else{
   c.fillStyle='rgba(81,201,246,.36)';c.beginPath();c.ellipse(-r*.46,0,r*1.42,r*.66,0,0,Math.PI*2);c.fill();
   c.strokeStyle='rgba(182,239,255,.83)';c.lineWidth=r*.4;c.lineCap='round';
   c.beginPath();c.moveTo(-r*1.16,r*.24);c.quadraticCurveTo(-r*.22,-r*.53,r*.61,-r*.15);c.stroke();
  }
  c.restore();
 }
}
