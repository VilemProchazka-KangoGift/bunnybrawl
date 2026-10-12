export function drawCurrentVariant(c,z,t,variant,top){
  const vertical=!!z.vy, y=top??z.y, length=vertical?z.y+z.height-y:z.width, span=vertical?z.width:z.height;
  const speed=vertical?170:80, sign=vertical?Math.sign(z.vy):Math.sign(z.vx);
  c.save();c.beginPath();c.rect(z.x,y,z.width,z.y+z.height-y);c.clip();
  c.translate(z.x,y);if(!vertical){c.translate(0,z.height);c.rotate(-Math.PI/2);}
  if(variant===1)for(let j=0;j<6;j++){
    const x=20+j*(span-40)/5,w=7+j%2*3;
    c.beginPath();for(let k=0;k<=length;k+=15)c.lineTo(x-w+Math.sin(k*.035-t*2+j)*7,k);
    for(let k=length;k>=0;k-=15)c.lineTo(x+w+Math.sin(k*.025-t*2+j)*9,k);c.closePath();
    const g=c.createLinearGradient(x-w,0,x+w,0);g.addColorStop(0,'rgba(37,98,130,.25)');g.addColorStop(.55,'rgba(191,236,228,.35)');g.addColorStop(1,'rgba(73,156,181,.2)');c.fillStyle=g;c.fill();
  }
  for(let i=0;i<24;i++){
    const yy=((t*speed*sign+i*37)%length+length)%length,x=15+(i*53%(span-30))+Math.sin(t+i)*4;
    c.beginPath();
    if(variant===2){c.moveTo(x-5,yy-12);c.bezierCurveTo(x-11,yy,x+4,yy+8,x+5,yy+17);c.bezierCurveTo(x+10,yy+1,x-1,yy-7,x-5,yy-12);}
    else{const r=variant===3?4+i%3*2:3+i%2;c.ellipse(x,yy,r,r*1.4,.2,0,Math.PI*2);}
    c.fillStyle=variant===2?'rgba(206,241,233,.48)':'rgba(120,207,214,.36)';c.fill();c.strokeStyle='rgba(207,244,234,.65)';c.lineWidth=1.2;c.stroke();
    c.beginPath();c.moveTo(x,yy+8);c.lineTo(x,yy+8-sign*13);c.strokeStyle='rgba(185,230,229,.3)';c.stroke();
  }c.restore();
}
