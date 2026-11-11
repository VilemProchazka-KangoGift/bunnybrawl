import {drawWeather} from '../../../src/engine/rendering/particles.ts';
export function weatherAt(t){
  return Array.from({length:50},(_,i)=>{
    const vx=i%31-15,vy=30+i%51;
    return {type:'snow',x:((37+i*173+vx*t)%1280+1280)%1280,y:(29+i*97+vy*t)%720,vx,vy,size:2+i%4,rotation:i*.71+t*(i%3-1),rotSpeed:i%3-1};
  });
}
export function drawCue(c,weather,variant,theme){
  if(variant===0){drawWeather(c,weather,theme);return;}
  if(variant===3)return;
  for(const w of weather){
    c.save();c.translate(w.x,w.y);c.rotate(w.rotation);const r=w.size;
    if(variant===1){
      c.fillStyle='rgba(161,198,222,.8)';c.beginPath();c.ellipse(0,0,r,r*.8,0,0,Math.PI*2);c.fill();
      c.fillStyle='rgba(249,252,255,.9)';c.beginPath();
      c.ellipse(-r*.3,-r*.2,r*.59,r*.63,0,0,Math.PI*2);
      c.ellipse(r*.29,-r*.19,r*.55,r*.54,0,0,Math.PI*2);c.fill();
    }else{
      c.lineCap='round';c.lineJoin='round';c.lineWidth=.75;
      c.strokeStyle='rgba(61,97,129,.76)';c.beginPath();
      for(let i=0;i<6;i++){
        const a=i*Math.PI/3, x=Math.cos(a),y=Math.sin(a);
        c.moveTo(0,0);c.lineTo(x*r,y*r);
        c.moveTo((x*.47-y*.24)*r,(y*.47+x*.24)*r);c.lineTo(x*r*.72,y*r*.72);
        c.lineTo((x*.47+y*.24)*r,(y*.47-x*.24)*r);
      }
      c.stroke();c.fillStyle='#eaf8ff';c.beginPath();c.arc(0,0,r*.32,0,Math.PI*2);c.fill();
    }
    c.restore();
  }
}
