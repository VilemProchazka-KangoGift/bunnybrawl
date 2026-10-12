export function drawCurrentVariant(c,z,t,variant,top){
  if(z.vy){drawWaterfall(c,z,t,variant,top);return;}
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

function drawWaterfall(c,z,t,variant,top){
  const y=top??z.y,h=z.y+z.height-y,w=z.width;
  c.save();c.translate(z.x,y);
  c.beginPath();c.moveTo(0,0);
  for(let k=0;k<=h;k+=12)c.lineTo(Math.sin(k*.025-t*2)*5,k);
  c.lineTo(w,h);
  for(let k=h;k>=0;k-=12)c.lineTo(w+Math.sin(k*.03-t*2+2)*5,k);
  c.closePath();c.clip();
  // One connected, full-width water curtain in every alternative.
  const g=c.createLinearGradient(0,0,w,0);
  g.addColorStop(0,'rgba(39,115,153,.65)');g.addColorStop(.25,'rgba(103,182,209,.62)');
  g.addColorStop(.6,'rgba(159,216,225,.7)');g.addColorStop(1,'rgba(50,130,172,.65)');
  c.fillStyle=g;c.fillRect(-8,0,w+16,h);
  if(variant===1){
    for(let j=0;j<7;j++){
      const x=20+j*(w-40)/6;
      c.beginPath();c.moveTo(x-16,0);
      for(let k=0;k<=h;k+=18)c.lineTo(x-16+Math.sin(k*.025-t*3+j)*11,k);
      for(let k=h;k>=0;k-=18)c.lineTo(x+23+Math.sin(k*.02-t*3+j)*13,k);
      c.closePath();c.fillStyle=j%2?'rgba(220,246,236,.2)':'rgba(23,94,135,.18)';c.fill();
    }
  }else if(variant===2){
    for(let j=0;j<10;j++){
      const yy=((t*210+j*83)%(h+100))-80;
      c.beginPath();c.moveTo(-10,yy);
      for(let x=0;x<=w+10;x+=15)c.lineTo(x,yy+Math.sin(x*.04+j)*17);
      for(let x=w+10;x>=-10;x-=15)c.lineTo(x,yy+40+Math.sin(x*.035+j+1)*22);
      c.closePath();c.fillStyle=j%2?'rgba(211,242,234,.22)':'rgba(36,111,152,.23)';c.fill();
    }
  }else{
    for(let j=0;j<24;j++){
      const x=10+(j*47%(w-20)),yy=((t*260+j*39)%(h+95))-90,len=25+j%4*17;
      c.beginPath();c.moveTo(x,yy);c.bezierCurveTo(x-9,yy+len*.3,x+8,yy+len*.65,x+3,yy+len);
      c.lineTo(x+10,yy+len-8);c.bezierCurveTo(x+13,yy+len*.5,x+1,yy+len*.2,x+6,yy);c.closePath();
      c.fillStyle='rgba(230,249,239,.4)';c.fill();
    }
  }
  c.restore();
  // Irregular connected froth at the foot, rather than bubble trails.
  c.save();c.translate(z.x,y+h);c.beginPath();c.moveTo(-6,4);
  for(let x=-6;x<=w+6;x+=6)c.lineTo(x,-10-Math.abs(Math.sin(x*.055+t*5))*14-Math.sin(x*.13+t*3)*5);
  c.lineTo(w+6,7);c.closePath();c.fillStyle='rgba(218,245,236,.65)';c.fill();c.restore();
}
