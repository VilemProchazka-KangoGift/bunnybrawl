import {drawSoftAshWisp} from '../../../src/engine/rendering/softAshWisp.ts';
const wrap=(v,m)=>((v%m)+m)%m;
export function weatherAt(t){
 return Array.from({length:15},(_,i)=>{
  const ash=i<9,vx=ash?(i*7)%17-8:(i*11)%21-10,vy=ash?5+(i*3)%11:10+(i*7)%16,rotSpeed=ash?.5+(i%4)*.5:1+i%3;
  return {type:ash?'ash':'leaf',x:wrap(97+i*173+vx*t,1280),y:wrap(77+i*97+vy*t,720),vx,vy,size:(ash?2:3)+i%3,rotation:i*.71+t*rotSpeed,rotSpeed,color:ash?'rgba(100,80,120,.4)':undefined};
 });
}
export function drawCue(c,weather,variant,theme){
 for(const w of weather){
  if(w.type!=='ash'){theme.drawWeatherParticle(c,w);continue;}
  if(variant===0){c.fillStyle=w.color||'rgba(100,80,120,.4)';c.beginPath();c.ellipse(w.x,w.y,w.size,w.size*.5,w.rotation,0,Math.PI*2);c.fill();continue;}
  if(variant===4){drawSoftAshWisp(c,w);continue;}
  if(variant===3)continue;
  c.save();c.translate(w.x,w.y);c.rotate(w.rotation);const r=w.size;
  if(variant===1){
   c.fillStyle='rgba(158,136,177,.68)';c.beginPath();c.moveTo(-r,-r*.04);
   c.quadraticCurveTo(-r*.39,-r*.83,r*.87,-r*.28);c.lineTo(r*.29,r*.06);
   c.lineTo(r*.71,r*.32);c.quadraticCurveTo(-r*.32,r*.6,-r,-r*.04);c.fill();
   c.strokeStyle='rgba(207,184,223,.57)';c.lineWidth=r*.12;c.beginPath();c.moveTo(-r*.7,0);c.quadraticCurveTo(-r*.1,-r*.38,r*.42,-r*.24);c.stroke();
  }else if(variant===4||variant===5){
   // Volcano's selected silhouette, with a cooler palette in the second card.
   c.fillStyle=variant===4?'rgba(160,132,121,.43)':'rgba(158,140,181,.43)';
   c.beginPath();c.ellipse(-r*.18,0,r*.76,r*.46,0,0,Math.PI*2);c.fill();
   c.fillStyle=variant===4?'rgba(191,164,150,.37)':'rgba(198,181,218,.37)';
   c.beginPath();c.ellipse(r*.43,-r*.19,r*.57,r*.31,-.22,0,Math.PI*2);c.fill();
  }else{
   c.fillStyle='rgba(189,178,202,.57)';c.beginPath();c.ellipse(-r*.18,0,r*.49,r*.37,0,0,Math.PI*2);c.fill();
   c.fillStyle='rgba(214,202,225,.49)';c.beginPath();c.arc(r*.48,-r*.27,r*.22,0,Math.PI*2);c.moveTo(r*.73,r*.21);c.arc(r*.59,r*.21,r*.14,0,Math.PI*2);c.fill();
  }
  c.restore();
 }
}
