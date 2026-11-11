export function weatherAt(t){
 const wrap=(x,m)=>((x%m)+m)%m;
 return Array.from({length:15},(_,i)=>{
  const ember=i<6,vx=ember?(i*7)%11-5:(i*7)%17-8,vy=ember?-5-(i*9)%11:-10-(i*9)%16,rotSpeed=(i%5)*(ember?.125:.25);
  return {type:ember?'ember':'spark',x:wrap(97+i*173+vx*t,1280),y:wrap(77+i*97+vy*t,720),vx,vy,size:1+i%(ember?2:3),rotation:i*.71+t*rotSpeed,rotSpeed,color:ember?'#FFAA00':'#00CCFF'};
 });
}
export function drawCue(c,weather,variant,theme){
 for(const w of weather){
  if(w.type==='spark'||variant===0){theme.drawWeatherParticle(c,w);continue;}
  if(variant===3)continue;
  c.save();c.translate(w.x,w.y);const r=w.size;
  if(variant===1){
   c.rotate(Math.atan2(w.vy,w.vx));c.fillStyle='rgba(245,161,67,.83)';
   c.beginPath();c.moveTo(-r*1.5,0);c.lineTo(r*.34,-r*.52);c.lineTo(r,.02);c.lineTo(r*.34,r*.52);c.closePath();c.fill();
   c.fillStyle='#fff0af';c.beginPath();c.arc(r*.34,0,r*.23,0,Math.PI*2);c.fill();
  }else{
   c.rotate(w.rotation*.55);c.strokeStyle='rgba(255,194,91,.8)';c.lineWidth=r*.39;c.lineCap='round';
   c.beginPath();c.moveTo(-r*.56,r*.37);c.lineTo(r*.03,-r*.57);c.moveTo(r*.41,r*.44);c.lineTo(r*.68,-r*.04);c.stroke();
  }
  c.restore();
 }
}
