const dust={grass:'#A8C878',stone:'#C0B898',wood:'#C8AA80',snow:'#F8FAFF',sand:'#E8D8A0',ice:'#D8F0FF',metal:'#FFE8B0',glass:'#FFFFFF'};
function drawMark(ctx,index,d){
 if(index===0){drawSurfaceDecals(ctx,{surfaceDecals:[d]});return;}
 if(index===3)return;
 const life=index===2?.55:d.life;if(d.age>=life)return;
 ctx.save();const radius=d.kind==='full'?32:21;if(!applyDecalClip(ctx,d,radius,radius)){ctx.restore();return;}
 const fade=index===2?Math.pow(1-d.age/life,.8):1-d.age/life;ctx.globalAlpha=fade;ctx.lineJoin='round';ctx.lineCap='round';
 if(index===1){
  const scale=d.kind==='full'?1:.62;ctx.scale(scale,scale);ctx.strokeStyle='#574C42';ctx.lineWidth=2.4;
  const arms=[[-27,-2,-14,-4,-6,-1],[-20,7,-12,3,-4,3],[1,-8,5,-5,0,-1],[23,-7,13,-3,6,-3],[26,5,16,2,7,3],[7,10,8,5,3,3]];
  ctx.beginPath();for(const a of arms){ctx.moveTo(a[4],a[5]);ctx.lineTo(a[2],a[3]);ctx.lineTo(a[0],a[1]);}ctx.stroke();
  ctx.strokeStyle=d.color;ctx.lineWidth=.85;ctx.stroke();
  ctx.fillStyle='#574C42';for(const [x,y] of [[-11,5],[15,-4],[-3,-3]]){ctx.beginPath();ctx.moveTo(x-2,y);ctx.lineTo(x+1,y-1);ctx.lineTo(x+3,y+1);ctx.lineTo(x,y+2);ctx.closePath();ctx.fill();}
 }else if(index>=4){
  const scale=d.kind==='full'?1:.7;ctx.scale(scale,scale);ctx.fillStyle='#574C42';ctx.strokeStyle=d.color;ctx.lineWidth=.75;
  if(index===4){ // Wide split: two thick zigzags rather than a radial star.
   for(const side of [-1,1]){ctx.save();ctx.scale(side,1);ctx.beginPath();ctx.moveTo(0,-1);ctx.lineTo(8,-3);ctx.lineTo(13,-1);ctx.lineTo(21,-4);ctx.lineTo(30,-2);ctx.lineTo(21,-1);ctx.lineTo(14,2);ctx.lineTo(8,0);ctx.lineTo(0,2);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
   ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(-12,6);ctx.lineTo(-17,7);ctx.lineTo(-11,3);ctx.closePath();ctx.fill();
  }else if(index===5){ // Three broad tapered fissures with jagged edges.
   for(const [side,y] of [[-1,-1],[1,-3],[1,6]]){ctx.save();ctx.scale(side,1);ctx.beginPath();ctx.moveTo(-2,0);ctx.lineTo(7,y-2);ctx.lineTo(12,y);ctx.lineTo(19,y-2);ctx.lineTo(27,y);ctx.lineTo(17,y+1);ctx.lineTo(11,y+4);ctx.lineTo(6,y+2);ctx.lineTo(0,3);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
  }else if(index===6){ // Connected broken plates surrounding the contact.
   for(const points of [[[-22,-1],[-11,-5],[-3,-3],[-6,1],[-16,3]],[[0,-3],[10,-6],[24,-2],[16,2],[5,1]],[[-15,5],[-4,2],[2,4],[0,8],[-10,9]],[[5,4],[17,3],[25,6],[15,9],[7,7]]]){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();ctx.stroke();}
  }else if(index>=8){
   const paths=index===8?
    [[[0,0],[-9,-2],[-19,-1],[-30,-4]],[[-9,-2],[-15,-6],[-25,-7]],[[0,0],[11,2],[22,0],[30,2]],[[11,2],[18,7],[28,9]],[[0,0],[-4,5],[-16,9]]]:index===9?
    [[[0,1],[-8,-2],[-17,-1],[-29,-4]],[[-8,-2],[-12,-6],[-21,-8]],[[-17,-1],[-22,3],[-30,4]],[[0,1],[9,2],[18,-1],[29,0]],[[9,2],[13,6],[23,8]],[[18,-1],[22,-5],[28,-6]],[[0,1],[-2,5],[-10,9]],[[-2,5],[5,8],[12,9]]]:
    [[[-28,0],[-17,-2],[-8,1],[0,0],[10,3],[19,0],[30,2]],[[-8,1],[-12,5],[-22,8]],[[10,3],[14,7],[25,9]],[[-17,-2],[-21,-6],[-29,-7]],[[19,0],[23,-4],[29,-5]]];
   for(const points of paths){ctx.strokeStyle='#574C42';ctx.lineWidth=index===9?1.6:index===10?3.4:2.5;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.strokeStyle=d.color;ctx.lineWidth=index===9?.45:.8;ctx.stroke();}
   if(index===10){ctx.fillStyle='#574C42';ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(-1,-2);ctx.lineTo(9,1);ctx.lineTo(2,4);ctx.closePath();ctx.fill();}
  }else{ // Sparse forked cracks with broad ink at their roots.
   const paths=[[[0,1],[-8,-2],[-15,-1],[-27,-4]],[[0,1],[8,3],[16,0],[28,2]],[[0,1],[-3,5],[-12,9]],[[8,3],[13,7],[23,8]]];
   for(const points of paths){ctx.strokeStyle='#574C42';ctx.lineWidth=2.7;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.strokeStyle=d.color;ctx.lineWidth=.7;ctx.stroke();}
   ctx.fillStyle='#574C42';ctx.beginPath();ctx.moveTo(-5,0);ctx.lineTo(0,-2);ctx.lineTo(7,1);ctx.lineTo(0,4);ctx.closePath();ctx.fill();
  }
 }else{
  const pulse=Math.min(1,d.age/.045),r=12+3*pulse;ctx.fillStyle='rgba(65,50,36,.28)';ctx.beginPath();ctx.ellipse(0,1,r,3.4,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#675544';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(-r,-1);ctx.bezierCurveTo(-8,4,-2,4,0,3);ctx.bezierCurveTo(5,5,10,2,r,-1);ctx.stroke();
  ctx.strokeStyle=d.color;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-10,-2);ctx.quadraticCurveTo(-3,-4,8,-2);ctx.stroke();
 }
 ctx.restore();
}
function atlasPose(ctx,atlas,size,pose,x,y){if(!atlas.naturalWidth)return;ctx.drawImage(atlas,(pose%4)*96,Math.floor(pose/4)*96,96,96,x-size/2,y-size,size,size);}
function drawScene(ctx,atlas,name,time,index,surface,impact,shared,left,edge){
 const age=time-.4,full=surface==='ice'||surface==='glass',life=full?(surface==='ice'?3:2):5;
 const d={kind:full?'full':'mini',x:0,y:0,age,life,seed:.371,color:dust[surface],surface,...(edge?{clipMinX:-56,clipMaxX:8}:{})};
 if(age>=0)drawMark(ctx,index,d);
 const dir=left?-1:1,x=age>.3?dir*Math.min(78,(age-.3)*140):0,y=age<0?-Math.pow(-age/.4,1.4)*85:0,size=sizes[name];
 ctx.save();ctx.globalAlpha=.15;ctx.fillStyle='#352C24';ctx.beginPath();ctx.ellipse(x,-1,13,2.5,0,0,Math.PI*2);ctx.fill();ctx.restore();
 if(shared&&age>=0){ctx.save();
  if(impact==='stomp'&&age<.16)drawImpactCrown(ctx,{x:0,y:-2,vx:0,vy:0,maxLife:.16,life:.16-age,size:17,color:'#FFE3A0'});
  if(impact==='landing')for(const side of [-1,1])for(const [life,size,offset,speed,y] of [[.38,11,10,65,-2],[.32,5,20,70,-1]])if(age<life)drawMovementPuff(ctx,{x:side*(offset+speed*age*1.25),y,vx:0,vy:0,maxLife:life,life:life-age,size:size*1.25,color:'#FFF3D5',shape:'landingCloud'});
  ctx.restore();}
 ctx.save();ctx.translate(x,y);ctx.scale(dir,1);const pose=age<0?(impact==='stomp'?5:3):age<.16?6:age>.3?1+Math.floor((age-.3)/.12)%2:0;atlasPose(ctx,atlas,size,pose,0,0);ctx.restore();
}
