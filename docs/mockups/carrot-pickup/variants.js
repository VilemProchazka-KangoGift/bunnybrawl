// Cosmetic prototypes. The real pickup still controls growth and scoring.
function carrotShape(ctx,x,y,size=1){
 ctx.save();ctx.translate(x,y);ctx.scale(size,size);ctx.strokeStyle='#665344';ctx.lineWidth=.9;
 ctx.fillStyle='#EE9851';ctx.beginPath();ctx.moveTo(-4,-6);ctx.quadraticCurveTo(1,-8,5,-5);ctx.lineTo(0,9);ctx.quadraticCurveTo(-3,3,-4,-6);ctx.fill();ctx.stroke();
 ctx.strokeStyle='#9E633E';ctx.beginPath();ctx.moveTo(-3,-2);ctx.lineTo(0,-1);ctx.moveTo(1,3);ctx.lineTo(3,2);ctx.stroke();
 ctx.strokeStyle='#577849';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-6);ctx.quadraticCurveTo(-7,-13,-5,-15);ctx.moveTo(0,-6);ctx.quadraticCurveTo(2,-16,4,-15);ctx.moveTo(0,-6);ctx.quadraticCurveTo(7,-12,8,-11);ctx.stroke();ctx.restore();
}
function chip(ctx,x,y,angle,size){
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#EE9851';ctx.strokeStyle='#665344';ctx.lineWidth=.8;
 ctx.beginPath();ctx.moveTo(-size,-size*.6);ctx.lineTo(size*.6,-size);ctx.lineTo(size,size*.45);ctx.lineTo(-size*.35,size*.7);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.strokeStyle='#F9C984';ctx.beginPath();ctx.moveTo(-size*.5,-size*.3);ctx.lineTo(size*.25,-size*.5);ctx.stroke();ctx.restore();
}
function leaf(ctx,x,y,angle,size){
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#91B675';ctx.strokeStyle='#526B45';ctx.lineWidth=.8;
 ctx.beginPath();ctx.moveTo(-size,0);ctx.bezierCurveTo(-size*.1,-size*.8,size*.65,-size*.65,size,0);ctx.bezierCurveTo(size*.2,size*.7,-size*.6,size*.55,-size,0);ctx.fill();ctx.stroke();
 ctx.beginPath();ctx.moveTo(-size,0);ctx.quadraticCurveTo(0,-size*.15,size,0);ctx.stroke();ctx.restore();
}
function drawPickupVariant(ctx,index,age){
 const duration=index===0?.34:index===1?.4:.24;
 if(age<0||age>=duration)return;
 const t=age/duration;ctx.save();ctx.translate(0,-20);ctx.globalAlpha=t<.38?1:Math.pow((1-t)/.62,.75);
 const blast=1-Math.pow(1-t,3);
 // Uneven cream accents make the first contact readable at game scale.
 ctx.strokeStyle='#665344';ctx.fillStyle='#FFF3D5';ctx.lineWidth=1.2;
 for(let i=0;i<6;i++){const a=-2.98+i*1.5*.57,r=22+blast*19,len=8+(i%3)*3;const ux=Math.cos(a),uy=Math.sin(a),nx=-uy,ny=ux;ctx.beginPath();ctx.moveTo(ux*r+nx*2,uy*r+ny*2);ctx.lineTo(ux*(r+len),uy*(r+len));ctx.lineTo(ux*(r+len-2)-nx*2,uy*(r+len-2)-ny*2);ctx.lineTo(ux*r-nx*2,uy*r-ny*2);ctx.closePath();ctx.fill();ctx.stroke();}
 if(index===0){
   for(let i=0;i<8;i++){const a=-Math.PI*.93+i*.37;const r=14+blast*32;chip(ctx,Math.cos(a)*r,Math.sin(a)*r+t*t*18,a+t*2,5+(i%3)*1.2);}
   leaf(ctx,12+blast*30,-12-blast*20,t*3,9);
 }else if(index===1){
   for(let i=0;i<5;i++){const a=-2.6+i*.55,r=16+blast*(32+i*3);leaf(ctx,Math.cos(a)*r,Math.sin(a)*r+t*t*20,a+t*(i%2?-2:2),5+i);}
   chip(ctx,6+blast*17,3-blast*15,t*3,5);
 }else{
   ctx.fillStyle='#FFF3D5';ctx.strokeStyle='#665344';ctx.lineWidth=1.4;ctx.lineJoin='round';
   ctx.beginPath();const radii=[29,15,33,17,26,15,34,17,28,14,25,16];
   for(let i=0;i<radii.length;i++){const a=i*Math.PI/6,r=radii[i]*(1+Math.sin(t*Math.PI)*.15);const x=Math.cos(a)*r,y=Math.sin(a)*r;if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.closePath();ctx.fill();ctx.stroke();
   chip(ctx,-12-blast*14,-8-blast*12,.3+t*2,7);leaf(ctx,14+blast*17,-12-blast*13,-.6-t,8);
   for(const [x,y] of [[-39,-22],[37,-26],[35,18],[-35,14]]){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+6,y-2);ctx.lineTo(x+2,y+4);ctx.closePath();ctx.fillStyle='#FFF3D5';ctx.fill();ctx.stroke();}
 }
 ctx.restore();
}
function drawPickupScene(ctx,atlas,time,index){
 const age=time-.4,center=age<0?-60+60*time/.4:age<.12?0:Math.min(40,(age-.12)*80);
 if(age<0)carrotShape(ctx,0,-20,.85);
 if(index>0)drawPickupVariant(ctx,index-1,age);
 ctx.save();ctx.translate(center,-20);
 const grow=age<0?1:1+.3*Math.min(1,age/.12);ctx.scale(grow,grow);
 if(atlas.naturalWidth)ctx.drawImage(atlas,age<0?96:0,0,96,96,-20,-20,40,40);
 ctx.restore();if(index===0)drawCurrentPickup(ctx,age);
}
