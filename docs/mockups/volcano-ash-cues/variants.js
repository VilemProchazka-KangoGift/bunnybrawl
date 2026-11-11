
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
const wrap=(v,max)=>((v%max)+max)%max;
export function weatherAt(t){
  return Array.from({length:40},(_,i)=>{
    const ash=i>=28,hot=i>=24&&!ash;
    const vx=i%(hot?11:ash?31:21)-(hot?5:ash?15:10),vy=ash?10+i%21:-(hot?60:40)-i%41;
    return {type:ash?'ash':'ember',x:wrap(37+i*173+vx*t,1280),y:wrap(29+i*97+vy*t,720),vx,vy,size:ash?2+i%3:hot?3+i%4:2+i%4,rotation:i*.71+t*(ash?1+i%3:.5),rotSpeed:ash?1+i%3:.5,color:ash?'rgba(120,100,90,.5)':hot?'#FFAA00':'#FF6B00'};
  });
}
export function drawCue(c,weather,variant,theme){
  for(const w of weather){
    if(w.type==='ember'){drawDimCinder(c,w);continue;}
    if(variant===0){theme.drawWeatherParticle(c,w);continue;}
    if(variant===3)continue;
    c.save();c.translate(w.x,w.y);c.rotate(w.rotation);const r=w.size;
    if(variant===1){
      c.fillStyle='rgba(142,118,112,.72)';c.beginPath();c.moveTo(-r,-r*.13);c.lineTo(-r*.22,-r*.53);c.lineTo(r*.72,-r*.2);c.lineTo(r*.92,r*.17);c.lineTo(r*.13,r*.41);c.lineTo(-r*.48,r*.26);c.closePath();c.fill();
      c.strokeStyle='rgba(203,176,158,.5)';c.lineWidth=.45;c.beginPath();c.moveTo(-r*.65,0);c.lineTo(-r*.2,-r*.22);c.lineTo(r*.44,-r*.07);c.stroke();
    }else{
      c.fillStyle='rgba(160,132,121,.43)';c.beginPath();c.ellipse(-r*.18,0,r*.76,r*.46,0,0,Math.PI*2);c.fill();
      c.fillStyle='rgba(191,164,150,.37)';c.beginPath();c.ellipse(r*.43,-r*.19,r*.57,r*.31,-.22,0,Math.PI*2);c.fill();
    }c.restore();
  }
}
