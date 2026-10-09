function drawLavaSurface(ctx,width,edge){
 const max=edge?8:width;ctx.fillStyle='#CB5D36';ctx.fillRect(-width,0,width+max,40);ctx.fillStyle='#EFA455';ctx.fillRect(-width,0,width+max,4);
 ctx.strokeStyle='#713E36';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(-width,0);for(let x=-width;x<max;x+=12)ctx.lineTo(Math.min(max,x+12),Math.sin(x*.17)*1.5);ctx.stroke();
 ctx.strokeStyle='#F3B96A';ctx.lineWidth=1;for(let x=-width;x<max-12;x+=37){ctx.beginPath();ctx.moveTo(x,13);ctx.quadraticCurveTo(x+8,10,x+17,13);ctx.stroke();}
 if(edge){ctx.fillStyle='#6F5A52';ctx.strokeStyle='#433C3C';ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(25,-4);ctx.lineTo(width,-4);ctx.lineTo(width,40);ctx.lineTo(8,40);ctx.closePath();ctx.fill();ctx.stroke();}
}
function drawBrokenRipples(ctx,age){
 const t=age/.6;if(t<0||t>=1)return;ctx.save();ctx.lineCap='round';
 for(let k=0;k<3;k++){const u=t-k*.18;if(u<=0||u>=1)continue;const r=60*u;ctx.globalAlpha=(1-u)*(1-t);ctx.beginPath();
  for(let segment=0;segment<5;segment++){const start=segment*Math.PI*2/5+.09;for(let j=0;j<=7;j++){const a=start+j*.115,v=1+.045*Math.sin(a*7+k),x=Math.cos(a)*r*v,y=Math.sin(a)*r*.4*v;if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}}
  ctx.strokeStyle='#74452E';ctx.lineWidth=2.2;ctx.stroke();ctx.strokeStyle='#FFD083';ctx.lineWidth=.8;ctx.stroke();
 }ctx.restore();
}
function drawLavaSplash(ctx,age){
 const t=age/.6;if(t<0||t>=1)return;const pop=Math.sin(Math.min(1,t*2.5)*Math.PI/2),fade=(1-t)**1.1;
 ctx.save();ctx.globalAlpha=fade;ctx.fillStyle='#F4AE55';ctx.strokeStyle='#74452E';ctx.lineWidth=1.1;
 ctx.beginPath();ctx.moveTo(-18,2);ctx.lineTo(-17-3*pop,-8*pop);ctx.quadraticCurveTo(-12,-3,-8,-2);ctx.lineTo(-4,-12*pop);ctx.quadraticCurveTo(0,-4,4,-2);ctx.lineTo(10,-10*pop);ctx.quadraticCurveTo(13,-3,19,1);ctx.quadraticCurveTo(0,5,-18,2);ctx.closePath();ctx.fill();ctx.stroke();
 for(let i=0;i<3;i++){const x=(i-1)*(12+20*t),y=-4-(10+i*3)*Math.sin(Math.min(1,t*1.5)*Math.PI);const r=2.4*(1-t*.6);ctx.beginPath();ctx.moveTo(x,y-r*1.6);ctx.quadraticCurveTo(x+r*1.4,y+r,x,y+r);ctx.quadraticCurveTo(x-r*1.4,y+r,x,y-r*1.6);ctx.closePath();ctx.fill();ctx.stroke();}
 ctx.restore();
}
function drawScene(ctx,atlas,name,time,index,shared,left){
 const age=time-.4,dir=left?-1:1,x=age>0?dir*Math.min(44,age*28):0,y=age<0?-Math.pow(-age/.4,1.4)*65:age<.5?-18*Math.sin(age/.5*Math.PI):0;
 if(age>=0){if(index===0)drawRipples(ctx,{ripples:[{x:0,y:0,age,surface:'lava'}]});else if(index===1)drawBrokenRipples(ctx,age);else if(index===2)drawLavaSplash(ctx,age);}
 if(shared&&age>=0){ctx.save();drawBurnWisps(ctx,x,y-16,.8,5-age);ctx.restore();}
 ctx.save();ctx.translate(x,y);ctx.scale(dir,1);const pose=age<0?3:age<.18?7:1+Math.floor(age/.12)%2,size=sizes[name];if(atlas.naturalWidth)ctx.drawImage(atlas,(pose%4)*96,Math.floor(pose/4)*96,96,96,-size/2,-size,size,size);ctx.restore();
 if(shared&&age>=0&&age<.59)drawBurnCough(ctx,{x:0,y:0,size:.8,maxLife:.59,life:.59-age});
}
