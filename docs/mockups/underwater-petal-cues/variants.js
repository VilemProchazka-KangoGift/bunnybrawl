const wrap=(v,m)=>((v%m)+m)%m;
export function weatherAt(t){
 return Array.from({length:30},(_,i)=>{
  const bubble=i<24,vx=bubble?(i*7)%11-5:(i*7)%17-8,vy=bubble?-20-(i*9)%31:5+(i*7)%11,rotSpeed=bubble?(i%5)*.125:.5+(i%4)*.5;
  return {type:bubble?'bubble':'petal',x:wrap(97+i*173+vx*t,1280),y:wrap(77+i*97+vy*t,720),vx,vy,size:2+i%(bubble?5:3),rotation:i*.71+t*rotSpeed,rotSpeed};
 });
}
export function drawCue(c,weather,variant,theme){
 for(const w of weather){
  if(w.type!=='petal'||variant===0){theme.drawWeatherParticle(c,w);continue;}
  if(variant===3)continue;
  c.save();c.translate(w.x,w.y);c.rotate(w.rotation);const r=w.size;
  if(variant===1){
   c.fillStyle='rgba(240,151,174,.76)';c.beginPath();c.moveTo(-r*.87,r*.45);
   c.quadraticCurveTo(-r*1.12,-r*.42,-r*.49,-r*.49);c.quadraticCurveTo(-r*.14,-r*.95,r*.22,-r*.56);
   c.quadraticCurveTo(r*.91,-r*.65,r*.83,r*.17);c.quadraticCurveTo(r*.12,r*.28,-r*.87,r*.45);c.fill();
   c.strokeStyle='rgba(255,216,212,.8)';c.lineWidth=r*.15;c.beginPath();
   for(const k of [-.58,-.05,.49]){c.moveTo(-r*.61,r*.32);c.quadraticCurveTo(r*(k-.18),0,r*k,-r*.42);}c.stroke();
  }else{
   c.fillStyle='rgba(177,153,224,.76)';c.beginPath();c.moveTo(-r,0);
   c.bezierCurveTo(-r*.51,-r*.95,r*.38,r*.1,r,-r*.39);c.bezierCurveTo(r*.63,r*.77,-r*.31,r*.12,-r,0);c.fill();
   c.strokeStyle='rgba(235,220,255,.82)';c.lineWidth=r*.16;c.lineCap='round';c.beginPath();c.moveTo(-r*.62,-r*.11);c.quadraticCurveTo(0,-r*.26,r*.62,-r*.09);c.stroke();
  }
  c.restore();
 }
}
