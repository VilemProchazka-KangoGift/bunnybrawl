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
function drawSplashVariant(ctx,age,variant){
 const t=age/.6;if(t<0||t>=1)return;
 const lift=Math.sin(Math.PI*Math.min(1,t*1.6)),spread=1+t*.7;
 ctx.save();ctx.globalAlpha=Math.min(1,t*22)*(1-t)**.8;ctx.fillStyle='#F4AE55';ctx.strokeStyle='#74452E';ctx.lineWidth=1.2;ctx.lineJoin='round';
 const fill=()=>{ctx.closePath();ctx.fill();ctx.stroke();};
 if(variant===0||variant===4){ // Thick rolling lobes, low and wide.
  ctx.beginPath();ctx.moveTo(-26,2);ctx.bezierCurveTo(-29,-5,-22,-18*lift,-16,-7*lift);ctx.bezierCurveTo(-12,-2,-11,-23*lift,-5,-19*lift);ctx.bezierCurveTo(1,-22*lift,1,-4,7,-7*lift);ctx.bezierCurveTo(12,-19*lift,22,-13*lift,25,2);ctx.quadraticCurveTo(0,7,-26,2);fill();
 }else if(variant===1){ // Two curved forks sweep outward.
  for(const d of [-1,1]){ctx.save();ctx.scale(d,1);ctx.beginPath();ctx.moveTo(0,3);ctx.bezierCurveTo(10,-3,12,-23*lift,26*spread,-20*lift);ctx.quadraticCurveTo(19*spread,-12*lift,18,-3);ctx.quadraticCurveTo(25,-12*lift,33*spread,-9*lift);ctx.quadraticCurveTo(25,3,0,3);fill();ctx.restore();}
 }else if(variant===2){ // Thin upward fan with uneven pointed fingers.
  ctx.beginPath();ctx.moveTo(-23,2);ctx.lineTo(-28*spread,-13*lift);ctx.quadraticCurveTo(-15,-4,-17,-1);ctx.lineTo(-12*spread,-27*lift);ctx.quadraticCurveTo(-5,-6,-3,-1);ctx.lineTo(3,-31*lift);ctx.quadraticCurveTo(9,-7,10,-2);ctx.lineTo(22*spread,-21*lift);ctx.quadraticCurveTo(19,-3,24,2);ctx.quadraticCurveTo(0,6,-23,2);fill();
 }else if(variant===5){ // Broad, low rolling wave with spreading droplets.
  ctx.beginPath();ctx.moveTo(-34*spread,2);ctx.bezierCurveTo(-37,-9*lift,-24,-16*lift,-18,-7*lift);ctx.bezierCurveTo(-10,-17*lift,-5,-15*lift,0,-5*lift);ctx.bezierCurveTo(9,-18*lift,19,-17*lift,23,-7*lift);ctx.bezierCurveTo(27,-10*lift,34,-7*lift,35*spread,2);ctx.quadraticCurveTo(0,7,-34*spread,2);fill();
 }else if(variant===6){ // Rounded curling wings with a hollow center.
  for(const d of [-1,1]){ctx.save();ctx.scale(d,1);ctx.beginPath();ctx.moveTo(0,3);ctx.bezierCurveTo(8,-2,9,-25*lift,24,-24*lift);ctx.bezierCurveTo(34,-24*lift,32,-10*lift,23,-12*lift);ctx.bezierCurveTo(19,-14*lift,22,-19*lift,25,-17*lift);ctx.bezierCurveTo(17,-18*lift,18,-1,31,2);ctx.quadraticCurveTo(16,6,0,3);fill();ctx.restore();}
 }else if(variant===7){ // Uneven rounded crown, taller central lobe.
  ctx.beginPath();ctx.moveTo(-25,2);ctx.bezierCurveTo(-31,-11*lift,-26,-23*lift,-20,-19*lift);ctx.bezierCurveTo(-14,-15*lift,-17,-3,-10,-7*lift);ctx.bezierCurveTo(-8,-12*lift,-12,-35*lift,-3,-32*lift);ctx.bezierCurveTo(7,-30*lift,2,-9*lift,10,-5*lift);ctx.bezierCurveTo(15,-25*lift,26,-24*lift,24,-12*lift);ctx.quadraticCurveTo(21,-3,28,2);ctx.quadraticCurveTo(0,8,-25,2);fill();
 }else{ // Mostly detached molten drops, tiny surface lip.
  ctx.beginPath();ctx.ellipse(0,1,19*(1-t*.3),2.5,0,0,Math.PI*2);fill();
 }
 const count=variant===3||variant>=4?7:variant===2?5:3;
 for(let i=0;i<count;i++){const q=(i-(count-1)/2)/Math.max(1,(count-1)/2),x=q*(10+(variant===5?42:variant===6?36:27)*t),y=-(10+(1-Math.abs(q))*20)*Math.sin(Math.PI*Math.min(1,t*1.45));const r=(variant===3||variant>=4?3.4:2.1)*(1-t*.55);ctx.save();ctx.translate(x,y);ctx.rotate(q*.6);ctx.beginPath();ctx.moveTo(0,-r*1.7);ctx.bezierCurveTo(r*1.5,-r*.2,r*1.3,r,0,r);ctx.bezierCurveTo(-r*1.3,r,-r*1.5,-r*.2,0,-r*1.7);fill();ctx.fillStyle='#FFD589';ctx.beginPath();ctx.ellipse(-r*.25,-r*.15,r*.22,r*.48,0,0,Math.PI*2);ctx.fill();ctx.restore();}
 ctx.restore();
}
function drawScene(ctx,atlas,name,time,index,shared,left){
 const age=time-.4,dir=left?-1:1,x=age>0?dir*Math.min(44,age*28):0,y=age<0?-Math.pow(-age/.4,1.4)*65:age<.5?-18*Math.sin(age/.5*Math.PI):0;
 if(age>=0){if(index===0)drawRipples(ctx,{ripples:[{x:0,y:0,age,surface:'lava'}]});else if(index===1)drawBrokenRipples(ctx,age);else if(index===2)drawLavaSplash(ctx,age);else if(index>=4)drawSplashVariant(ctx,age,index-4);}
 if(shared&&age>=0){ctx.save();drawBurnWisps(ctx,x,y-16,.8,5-age);ctx.restore();}
 ctx.save();ctx.translate(x,y);ctx.scale(dir,1);const pose=age<0?3:age<.18?7:1+Math.floor(age/.12)%2,size=sizes[name];if(atlas.naturalWidth)ctx.drawImage(atlas,(pose%4)*96,Math.floor(pose/4)*96,96,96,-size/2,-size,size,size);ctx.restore();
 if(shared&&age>=0&&age<.59)drawBurnCough(ctx,{x:0,y:0,size:.8,maxLife:.59,life:.59-age});
}
