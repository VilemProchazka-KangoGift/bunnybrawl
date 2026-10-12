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
  if(variant>=8){
    const count=variant===11?4:variant===8?5:7;
    for(let j=0;j<count;j++){
      const x=j*w/(count-1),wide=w/count*.7;
      c.save();c.beginPath();
      for(let k=0;k<=h;k+=12)c.lineTo(x-wide+Math.sin(k*.011-t*1.8+j)*18,k);
      for(let k=h;k>=0;k-=12)c.lineTo(x+wide+Math.sin(k*.014-t*1.5+j+1)*22,k);
      c.closePath();c.clip();
      const g=c.createLinearGradient(x-wide,0,x+wide,0);
      g.addColorStop(0,'rgba(14,69,116,.38)');g.addColorStop(.3,'rgba(61,150,187,.12)');g.addColorStop(.65,'rgba(217,243,235,.48)');g.addColorStop(1,'rgba(30,108,151,.3)');c.fillStyle=g;c.fillRect(x-wide-25,0,wide*2+50,h);c.restore();
    }
    if(variant!==11)for(let j=0;j<12;j++){
      const yy=((t*(variant===10?240:180)+j*71)%(h+110))-90;
      const x=variant===8?-10:(j*67%w)-35,ww=variant===8?w+20:90+j%3*35;
      c.beginPath();c.moveTo(x,yy);
      c.bezierCurveTo(x+ww*.25,yy-28,x+ww*.55,yy+44,x+ww,yy-7);
      c.lineTo(x+ww,yy+25);c.bezierCurveTo(x+ww*.5,yy+75,x+ww*.2,yy+4,x,yy+38);c.closePath();
      c.fillStyle=variant===10&&j%2?'rgba(20,84,130,.3)':'rgba(217,244,235,.28)';c.fill();
      if(variant===9){c.beginPath();c.moveTo(x,yy);c.bezierCurveTo(x+ww*.25,yy-28,x+ww*.55,yy+44,x+ww,yy-7);c.strokeStyle='rgba(240,252,243,.48)';c.lineWidth=3;c.stroke();}
    }
    if(variant===11){const g=c.createLinearGradient(0,0,w,0);g.addColorStop(0,'rgba(18,78,129,.2)');g.addColorStop(.5,'rgba(197,233,229,.2)');g.addColorStop(1,'rgba(18,78,129,.25)');c.fillStyle=g;c.fillRect(0,0,w,h);}
  }else if(variant>=4){
    // Broad connected folds: light crests against cool recessed channels.
    for(let j=0;j<6;j++){
      const x=j*w/5,wide=variant===6?48:34;
      c.save();c.beginPath();
      for(let k=0;k<=h;k+=10)c.lineTo(x-wide+Math.sin(k*.013-t*1.6+j)*14,k);
      for(let k=h;k>=0;k-=10)c.lineTo(x+wide+Math.sin(k*.018-t*1.4+j)*18,k);
      c.closePath();c.clip();
      const fold=c.createLinearGradient(x-wide,0,x+wide,0);
      fold.addColorStop(0,'rgba(13,61,105,.45)');
      fold.addColorStop(.28,'rgba(45,126,166,.16)');
      fold.addColorStop(.58,variant===5?'rgba(233,250,242,.55)':'rgba(184,232,233,.4)');
      fold.addColorStop(.76,'rgba(113,195,212,.22)');fold.addColorStop(1,'rgba(20,83,128,.4)');
      c.fillStyle=fold;c.fillRect(x-wide-25,0,wide*2+50,h);c.restore();
    }
    const depth=c.createLinearGradient(0,0,0,h);
    depth.addColorStop(0,'rgba(221,245,237,.28)');depth.addColorStop(.3,'rgba(28,95,143,.06)');depth.addColorStop(.7,'rgba(11,66,118,.22)');depth.addColorStop(1,'rgba(199,240,230,.35)');
    c.fillStyle=depth;c.fillRect(-8,0,w+16,h);
    if(variant===5||variant===6)for(let j=0;j<9;j++){
      const yy=((t*190+j*87)%(h+110))-90;
      c.beginPath();c.moveTo(-8,yy);
      c.bezierCurveTo(w*.25,yy-35,w*.55,yy+55,w+8,yy-10);
      c.lineTo(w+8,yy+20);c.bezierCurveTo(w*.6,yy+80,w*.3,yy-5,-8,yy+45);c.closePath();
      c.fillStyle=variant===6?'rgba(17,77,126,.23)':'rgba(225,247,239,.18)';c.fill();
    }
    if(variant===7){
      const veil=c.createLinearGradient(0,0,w,0);veil.addColorStop(0,'rgba(13,69,119,.25)');veil.addColorStop(.5,'rgba(220,245,235,.23)');veil.addColorStop(1,'rgba(13,69,119,.25)');c.fillStyle=veil;c.fillRect(0,0,w,h);
    }
  }else if(variant===1){
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
