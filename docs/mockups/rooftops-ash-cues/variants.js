const wrap=(v,m)=>((v%m)+m)%m;
export function weatherAt(t){
 return Array.from({length:12},(_,i)=>{
  const ash=i<5,vx=ash?3+(i*7)%13:5+(i*11)%16,vy=ash?3+(i*3)%8:5+(i*7)%11,rotSpeed=ash?.5+(i%4)*.5:1+i%4;
  return {type:ash?'ash':'leaf',x:wrap(97+i*173+vx*t,1280),y:wrap(77+i*97+vy*t,720),vx,vy,size:(ash?2:3)+i%3,rotation:i*.71+t*rotSpeed,rotSpeed,color:ash?'rgba(200,190,180,.4)':undefined};
 });
}
export function drawCue(c,weather,variant,theme){
 for(const w of weather){
  if(w.type!=='ash'){theme.drawWeatherParticle(c,w);continue;}
  if(variant===0){c.fillStyle=w.color||'rgba(200,190,180,.4)';c.beginPath();c.arc(w.x,w.y,w.size*.5,0,Math.PI*2);c.fill();continue;}
  if(variant===3)continue;
  c.save();c.translate(w.x,w.y);c.rotate(w.rotation);const r=w.size;
  if(variant===1){
   c.fillStyle='rgba(160,132,121,.43)';c.beginPath();c.ellipse(-r*.18,0,r*.76,r*.46,0,0,Math.PI*2);c.fill();
   c.fillStyle='rgba(191,164,150,.37)';c.beginPath();c.ellipse(r*.43,-r*.19,r*.57,r*.31,-.22,0,Math.PI*2);c.fill();
  }else{
   c.fillStyle='rgba(159,165,174,.7)';c.beginPath();c.moveTo(-r,-r*.11);c.lineTo(-r*.24,-r*.56);c.lineTo(r*.52,-r*.36);c.lineTo(r*.87,r*.18);c.lineTo(r*.2,r*.42);c.lineTo(-r*.63,r*.27);c.closePath();c.fill();
   c.strokeStyle='rgba(228,222,215,.66)';c.lineWidth=r*.13;c.beginPath();c.moveTo(-r*.55,-r*.14);c.lineTo(-r*.16,-r*.33);c.lineTo(r*.37,-r*.18);c.stroke();
  }
  c.restore();
 }
}
