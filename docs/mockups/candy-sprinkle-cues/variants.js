const wrap=(v,max)=>((v%max)+max)%max;
const colors=['#e95580','#8a68d3','#35a995','#f1ab36','#4f92de'];
export function weatherAt(t){
 return Array.from({length:25},(_,i)=>{
   const sprinkle=i<18,vx=sprinkle?i%21-10:i%17-8,vy=sprinkle?15+i%21:10+i%11,rotSpeed=sprinkle?2+i%4:1+i%3;
   return {type:sprinkle?'sprinkle':'petal',x:wrap(37+i*173+vx*t,1280),y:wrap(29+i*97+vy*t,720),vx,vy,size:(sprinkle?2:3)+i%3,rotation:i*.71+t*rotSpeed,rotSpeed};
 });
}
export function drawCue(c,weather,variant,theme){
 for(const w of weather){
   if(w.type!=='sprinkle'||variant===0){theme.drawWeatherParticle(c,w);continue;}
   if(variant===3)continue;
   c.save();c.translate(w.x,w.y);c.rotate(w.rotation);const r=w.size;
   c.fillStyle=colors[Math.floor(Math.abs(w.x)*.1)%colors.length];
   if(variant===1){
     c.beginPath();c.roundRect(-r,-r*.45,r*2,r*.9,r*.4);c.fill();
     c.strokeStyle='rgba(73,33,77,.45)';c.lineWidth=r*.15;c.stroke();
     c.strokeStyle='rgba(255,250,240,.8)';c.lineWidth=r*.18;c.lineCap='round';
     c.beginPath();c.moveTo(-r*.58,-r*.18);c.lineTo(r*.48,-r*.18);c.stroke();
   }else{
     c.beginPath();c.arc(0,0,r*.68,0,Math.PI*2);c.fill();
     c.strokeStyle='rgba(73,33,77,.43)';c.lineWidth=r*.13;c.stroke();
     c.fillStyle='rgba(255,248,235,.85)';c.beginPath();c.ellipse(-r*.2,-r*.25,r*.28,r*.18,-.4,0,Math.PI*2);c.fill();
   }
   c.restore();
 }
}
