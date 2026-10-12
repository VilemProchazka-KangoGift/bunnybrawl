import {drawZeroGZone} from './original.js';
export function drawCue(c,z,t,variant,background){
  if(variant===0){drawZeroGZone(c,z,t);return;}
  const subtle=variant>=5,grid=variant===2||variant===5;
  c.save();c.beginPath();c.rect(z.x+3,z.y+3,z.width-6,z.height-6);c.clip();
  // Refract the backdrop only; characters and the exact frame remain readable.
  for(let y=3;y<z.height-3;y+=6){
    const phase=y/z.height*Math.PI*4-t*(subtle?.65:2);
    const shift=subtle?Math.sin(phase)*(grid?.75:1.2):variant===1?Math.sin(phase)*11:variant===2?Math.sin(phase*.6)*5:variant===3?Math.sin(phase)*7:Math.sin(phase*2)*14;
    c.drawImage(background,z.x-16,z.y+y,z.width+32,6,z.x-16+shift,z.y+y,z.width+32,6);
  }
  c.lineCap='round';
  if(variant===1){
    for(let i=0;i<7;i++){
      const y=z.y+((i*83-t*55)%z.height+z.height)%z.height;
      c.beginPath();for(let x=0;x<=z.width;x+=12){const yy=y+Math.sin(x/95+t*1.4+i)*22;x?c.lineTo(z.x+x,yy):c.moveTo(z.x+x,yy);}
      c.strokeStyle='rgba(70,198,255,.16)';c.lineWidth=12;c.stroke();c.strokeStyle='rgba(163,239,255,.65)';c.lineWidth=2;c.stroke();
    }
  }else if(grid){
    c.strokeStyle=subtle?'rgba(112,223,255,.13)':'rgba(112,223,255,.48)';c.lineWidth=subtle?1:1.6;
    const cols=subtle?6:10,rows=subtle?4:8,speed=subtle?.4:1.5;
    for(let i=0;i<=cols;i++){
      c.beginPath();for(let j=0;j<=20;j++){const x=z.x+i*z.width/cols+Math.sin(j*.4+t*speed)*(subtle?5:20),y=z.y+j*z.height/20;j?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();
    }
    for(let i=0;i<=rows;i++){
      c.beginPath();for(let j=0;j<=24;j++){const x=z.x+j*z.width/24,y=z.y+i*z.height/rows+Math.sin(j*.3-t*speed)*(subtle?4:16);j?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();
    }
  }else if(variant===3){
    for(let i=0;i<5;i++){
      const p=((t*.23+i/5)%1),r=40+p*460;
      c.globalAlpha=(1-p)*.75;c.strokeStyle='#a1efff';c.lineWidth=2.5;
      c.beginPath();c.ellipse(z.x+z.width/2,z.y+z.height/2,r,r*.56,Math.sin(t*.7)*.2,0,Math.PI*2);c.stroke();
      c.globalAlpha=(1-p)*.15;c.lineWidth=14;c.stroke();
    }
  }else{
    const count=subtle?4:9;
    for(let i=0;i<count;i++){
      const y=z.y+((i*z.height/count-t*(subtle?18:70))%z.height+z.height)%z.height;
      c.fillStyle=subtle?'rgba(58,154,231,.025)':'rgba(58,154,231,.12)';c.fillRect(z.x,y,z.width,subtle?8:15);
      const bend=subtle?7:28;
      c.strokeStyle=subtle?'rgba(138,238,255,.18)':'rgba(138,238,255,.72)';c.lineWidth=subtle?1:2;c.beginPath();c.moveTo(z.x,y);c.bezierCurveTo(z.x+z.width*.3,y+bend,z.x+z.width*.7,y-bend,z.x+z.width,y);c.stroke();
    }
  }
  c.restore();drawZeroGZone(c,z,t);
}
