
function drawSoftAshWisp(c,w,scale=1) {
  c.save();
  c.translate(w.x, w.y);
  c.rotate(w.rotation);
  const r = w.size * scale;
  c.fillStyle='rgba(160,132,121,.43)';c.beginPath();c.ellipse(-r*.18,0,r*.76,r*.46,0,0,Math.PI*2);c.fill();
  c.fillStyle='rgba(191,164,150,.37)';c.beginPath();c.ellipse(r*.43,-r*.19,r*.57,r*.31,-.22,0,Math.PI*2);c.fill();
  c.restore();
}
const wrap=(v,m)=>((v%m)+m)%m;
export function weatherAt(t){
 return Array.from({length:15},(_,i)=>{
  const ash=i<9,vx=ash?(i*7)%17-8:(i*11)%21-10,vy=ash?5+(i*3)%11:10+(i*7)%16,rotSpeed=ash?.5+(i%4)*.5:1+i%3;
  return {type:ash?'ash':'leaf',x:wrap(97+i*173+vx*t,1280),y:wrap(77+i*97+vy*t,720),vx,vy,size:(ash?2:3)+i%3,rotation:i*.71+t*rotSpeed,rotSpeed,color:ash?'rgba(100,80,120,.4)':undefined};
 });
}
export function drawCue(c,weather,variant,theme){
 for(const w of weather){
  if(w.type==='ash'){drawSoftAshWisp(c,w,3);continue;}
  if(variant===0){theme.drawWeatherParticle(c,w);continue;}
  if(variant===3)continue;
  c.save();c.translate(w.x,w.y);c.rotate(w.rotation);const r=w.size;
  c.fillStyle=variant===1?'rgba(151,111,78,.78)':'rgba(171,102,73,.75)';
  c.beginPath();c.moveTo(-r,0);
  if(variant===1){
    c.quadraticCurveTo(-r*.9,-r*.64,-r*.43,-r*.34);c.quadraticCurveTo(-r*.29,-r*.87,r*.14,-r*.49);
    c.quadraticCurveTo(r*.58,-r*.78,r,0);c.quadraticCurveTo(r*.58,r*.76,r*.14,r*.49);
    c.quadraticCurveTo(-r*.29,r*.87,-r*.43,r*.34);c.quadraticCurveTo(-r*.9,r*.64,-r,0);
  }else{
    c.bezierCurveTo(-r*.3,-r*.87,r*.73,-r*.67,r,.03);
    c.quadraticCurveTo(r*.37,r*.62,-r,0);
  }
  c.closePath();c.fill();
  c.strokeStyle='rgba(224,173,118,.74)';c.lineWidth=r*.13;c.beginPath();c.moveTo(-r*.83,0);c.quadraticCurveTo(0,-r*.18,r*.79,0);c.stroke();c.restore();
 }
}
