const wrap=(v,m)=>((v%m)+m)%m;
export function weatherAt(t){
 return Array.from({length:30},(_,i)=>{
  const bubble=i<24,vx=bubble?(i*7)%11-5:(i*7)%17-8,vy=bubble?-20-(i*9)%31:5+(i*7)%11,rotSpeed=bubble?(i%5)*.125:.5+(i%4)*.5;
  return {type:bubble?'bubble':'petal',x:wrap(97+i*173+vx*t,1280),y:wrap(77+i*97+vy*t,720),vx,vy,size:2+i%(bubble?5:3),rotation:i*.71+t*rotSpeed,rotSpeed};
 });
}
export function drawCue(c,weather,variant,theme){
 for(const w of weather){
  if(w.type!=='bubble'||variant===0){theme.drawWeatherParticle(c,w);continue;}
  if(variant===3)continue;
  c.save();c.translate(w.x,w.y);const r=w.size;
  if(variant===1){
   c.fillStyle='rgba(115,206,230,.22)';c.strokeStyle='rgba(55,132,169,.8)';c.lineWidth=r*.22;
   c.beginPath();c.ellipse(0,0,r*.87,r,0,0,Math.PI*2);c.fill();c.stroke();
   c.strokeStyle='rgba(224,253,255,.88)';c.lineWidth=r*.18;c.lineCap='round';
   c.beginPath();c.arc(0,0,r*.66,Math.PI*1.05,Math.PI*1.5);c.stroke();
  }else{
   const g=c.createRadialGradient(-r*.35,-r*.39,0,0,0,r);
   g.addColorStop(0,'rgba(229,255,251,.73)');g.addColorStop(.55,'rgba(158,229,231,.28)');g.addColorStop(1,'rgba(122,213,229,.08)');
   c.fillStyle=g;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();
   c.strokeStyle='rgba(203,246,244,.64)';c.lineWidth=r*.14;c.stroke();
  }
  c.restore();
 }
}
