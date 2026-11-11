import {drawSoftSnowClump} from '../../../src/engine/rendering/snowClumps.ts';
import {drawActionSnow} from '../../../src/engine/arenas/packs/winterActionArt.ts';
export function weatherAt(t){
  return Array.from({length:50},(_,i)=>{
    const vx=i%31-15,vy=30+i%51;
    return {type:'snow',x:((37+i*173+vx*t)%1280+1280)%1280,y:(29+i*97+vy*t)%720,vx,vy,size:2+i%4,rotation:i*.71+t*(i%3-1),rotSpeed:i%3-1};
  });
}
export function drawCue(c,weather,variant){
  if(variant===0){for(const w of weather)drawActionSnow(c,w,'ink-bell');return;}
  if(variant===3)return;
  for(const w of weather){
    if(variant===1){drawSoftSnowClump(c,w);continue;}
    c.save();c.translate(w.x,w.y);c.rotate(w.rotation);const r=w.size;
      c.lineCap='round';c.lineJoin='round';c.lineWidth=.75;
      c.strokeStyle='rgba(61,97,129,.76)';c.beginPath();
      for(let i=0;i<6;i++){
        const a=i*Math.PI/3, x=Math.cos(a),y=Math.sin(a);
        c.moveTo(0,0);c.lineTo(x*r,y*r);
        c.moveTo((x*.47-y*.24)*r,(y*.47+x*.24)*r);c.lineTo(x*r*.72,y*r*.72);
        c.lineTo((x*.47+y*.24)*r,(y*.47-x*.24)*r);
      }
      c.stroke();c.fillStyle='#eaf8ff';c.beginPath();c.arc(0,0,r*.32,0,Math.PI*2);c.fill();
    c.restore();
  }
}
