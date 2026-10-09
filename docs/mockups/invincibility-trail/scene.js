function drawProtectionScene(ctx,atlas,name,time,index,surface,width,speed,left){
 const elapsed=Math.max(0,time-.1),remaining=Math.max(0,1.5-elapsed),protectedNow=time>=.1&&remaining>0,size=sizes[name]||40;
 ctx.save();if(left)ctx.scale(-1,1);
 ctx.strokeStyle=surface==='grass'?'#789956':'#756951';ctx.lineWidth=.7;
 for(let i=-10;i<11;i++){const x=i*32-(elapsed*speed)%32;if(Math.abs(x)>width/2)continue;ctx.beginPath();ctx.moveTo(x,5);ctx.lineTo(x+5,5);ctx.stroke();}
 ctx.fillStyle='rgba(50,43,34,.18)';ctx.beginPath();ctx.ellipse(0,-1,14,2.5,0,0,Math.PI*2);ctx.fill();
 if(time>=.1){
  const trail=currentTrail(elapsed,speed),[h,s,l]=hsl(protectedNow?'#88BBFF':characterColors[name]);
  if(!protectedNow||index<2)trail.forEach((image,i)=>{
   const shift=(i/Math.max(1,trail.length-1)-1)*18,x=-speed*(elapsed-image.time);
   ctx.fillStyle=`hsl(${Math.round((h+shift+360)%360)},${s}%,${l}%)`;ctx.globalAlpha=image.alpha;
   if(!protectedNow||index===1)drawTrailShape(ctx,x,-14.4,9,image.time);
   else{ctx.beginPath();ctx.ellipse(x,-14.4,12.16,12.16,0,0,Math.PI*2);ctx.fill();}
  });
  if(protectedNow&&index===2){
   const edge=Math.min(1,elapsed/.1,remaining/.1);
   for(let i=0;i<4;i++){
    const phase=(elapsed*3+i*.27)%1,alpha=Math.sin(phase*Math.PI)*edge,r=1.2+2*alpha;
    const x=i%2?-20:20,y=-10-Math.floor(i/2)*18-phase*4;
    ctx.globalAlpha=alpha*.9;ctx.fillStyle='#B7DEFF';ctx.strokeStyle='#6895C1';ctx.lineWidth=.6;
    ctx.beginPath();ctx.moveTo(x-r,y);ctx.lineTo(x,y-r*1.4);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r*1.4);ctx.closePath();ctx.fill();ctx.stroke();
   }
  }
 }
 ctx.globalAlpha=protectedNow&&Math.floor(remaining*10)%2===0?.5:1;
 sprite(ctx,atlas,size,time<.1||speed===0?0:1+Math.floor(elapsed/.12)%2);
 ctx.restore();
}
