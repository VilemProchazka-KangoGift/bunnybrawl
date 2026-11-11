const SPRINKLE_COLORS = ['#FF69B4', '#FFD700', '#87CEEB', '#98FB98', '#DDA0DD', '#FF6347'];
function drawCurl(ctx,w){
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.rotation);
      const r = w.size;
      ctx.strokeStyle = SPRINKLE_COLORS[Math.floor(w.x * 0.1) % SPRINKLE_COLORS.length];
      ctx.lineWidth = r * 0.48;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.92, r * 0.23);
      ctx.bezierCurveTo(-r * 0.25, -r * 0.9, r * 0.25, r * 0.91, r * 0.92, -r * 0.23);
      ctx.stroke();
      ctx.restore();
}
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
   if(w.type==='sprinkle'){drawCurl(c,w);continue;}
   if(variant===0){theme.drawWeatherParticle(c,w);continue;}
   if(variant===3)continue;
   c.save();c.translate(w.x,w.y);c.rotate(w.rotation);const r=w.size;
   c.fillStyle=variant===1?'rgba(249,173,206,.78)':'rgba(237,126,176,.75)';
   c.beginPath();c.moveTo(-r,0);
   if(variant===1){
     c.bezierCurveTo(-r*.3,-r*.8,r*.86,-r*.84,r*.72,-r*.18);
     c.bezierCurveTo(r*1.18,r*.14,r*.57,r*.83,-r,0);
   }else{
     c.bezierCurveTo(-r*.55,-r*.7,r*.12,r*.29,r,-r*.29);
     c.bezierCurveTo(r*.53,r*.67,-r*.3,r*.21,-r,0);
   }
   c.closePath();c.fill();
   c.strokeStyle='rgba(255,242,232,.75)';c.lineWidth=r*.16;c.lineCap='round';
   c.beginPath();c.moveTo(-r*.6,0);c.quadraticCurveTo(0,-r*.21,r*.55,-r*.13);c.stroke();c.restore();
 }
}
