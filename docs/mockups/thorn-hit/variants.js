// Scripted motion and source-matched current hazard parameters; no simulation replay.
function thornShard(ctx,x,y,size,angle,color){
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=color;ctx.strokeStyle='#665344';ctx.lineWidth=.65;
 ctx.beginPath();ctx.moveTo(-size*.25,size*.35);ctx.lineTo(size,-size*.1);ctx.lineTo(-size*.4,-size*.35);ctx.lineTo(-size*.2,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
}
function drawThornScene(ctx,atlas,briar,time,index){
 const age=time-.4,slow=5-Math.max(0,age);
 const x=age<0?-50+time*125:Math.min(22,age*32);
 const active=age>=0;
 ctx.save();
 // Only the current response shakes the whole scene, for 150 ms.
 if(active&&age<.15){ctx.translate(Math.sin(age*110)*2.5*(1-age/.15),Math.cos(age*95)*(1-age/.15));}
 if(index>0&&active&&age<.42)drawThornImpact(ctx,age,index);
 ctx.save();ctx.translate(x,-40);
 if(active)ctx.globalAlpha=index===0?.7+Math.sin(slow*8)*.15:.88+.12*Math.sin(slow*8);
 if(index===1&&active&&age<.4){const t=age/.4,p=Math.sin(Math.PI*Math.min(1,t*2))*(1-t);ctx.translate(-13*p,-8*p);ctx.translate(0,40);ctx.rotate(-.23*p);ctx.scale(1-.15*p,1+.19*p);ctx.translate(0,-40);}
 if(index===3&&active&&age<.38){const t=age/.38,w=Math.sin(t*Math.PI*4)*(1-t),p=Math.sin(Math.PI*t);ctx.translate(6*w,0);ctx.translate(0,40);ctx.rotate(.11*w);ctx.scale(1+.2*p,1-.22*p);ctx.translate(0,-40);}
 if(atlas.naturalWidth)ctx.drawImage(atlas,0,0,96,96,-20,0,40,40);
 if(active){ctx.fillStyle='rgba(255,0,0,'+(Math.abs(Math.sin(slow*8))*.3)+')';ctx.beginPath();ctx.ellipse(0,24,16,16,0,0,Math.PI*2);ctx.fill();}
 ctx.restore();
 if(index===0&&active){
  // Reproducible samples of the runtime blood/wood emissions and their gravity.
  for(let i=0;i<33;i++){
   const blood=i<18,wood=i>=18&&i<32,j=blood?i:i-18;
   const life=blood?.4+(j%6)/5*.5:wood?.3+(j%5)/4*.4:1;
   if(age>=life)continue;
   const a=blood?j*Math.PI*2/18:-Math.PI/2+((j%7)/6-.5)*Math.PI*1.1;
   const speed=blood?90+(j%7)/6*180:90+(j%6)/5*160;
   const vx=i===32?0:Math.cos(a)*speed,vy=i===32?30:Math.sin(a)*speed-(blood?80:0);
   const px=vx*age,py=(blood?-16:-6)+vy*age+150*age*age;
   ctx.save();ctx.globalAlpha=Math.max(0,1-age/life);thornShard(ctx,px,py,blood?2+(j%4):2,Math.atan2(vy+300*age,vx),blood||i===32?'#CC0000':j%2?'#3A2210':'#5C3A1E');ctx.restore();
  }
 }
 if(index>0&&active&&age<.48){
  const t=age/.48,count=index===2?26:14;
  for(let i=0;i<count;i++){
   const a=-Math.PI+.12+i*Math.PI*.94/(count-1),speed=55+(i%5)*23;
   const px=Math.cos(a)*speed*age,py=-8+Math.sin(a)*speed*age+80*age*age;
   ctx.save();ctx.globalAlpha=1-t*t;
   thornShard(ctx,px,py,5+(i%4),a+age*(i%2?3:-3),i%3===0?'#FFF0CB':i%3===1?'#C54B38':'#8B593C');ctx.restore();
  }
 }
 // The real briar artwork remains anchored on the floor and covers the feet.
 if(briar.naturalWidth)ctx.drawImage(briar,-15,-16,30,17);
 ctx.restore();
 if(active&&age<.18){ctx.save();ctx.globalAlpha=(1-age/.18)*.12;ctx.fillStyle='#FFF2E0';ctx.fillRect(-150,-110,300,134);ctx.restore();}
}

function drawThornImpact(ctx,age,index){
 const t=age/.42;
 ctx.save();ctx.translate(0,-19);
 const radius=(index===2?28:index===3?32:22)*(1+.35*t);
 ctx.globalAlpha=(1-t*t)*.95;ctx.strokeStyle='#664537';ctx.lineWidth=1.1;ctx.lineJoin='round';
 ctx.fillStyle=index===2?'#C8583D':'#FFF0CB';ctx.beginPath();
 for(let i=0;i<24;i++){const a=i*Math.PI/12,r=radius*(i%2?.45:.85+(i%5)*.065);const x=Math.cos(a)*r,y=Math.sin(a)*r*.88;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.closePath();ctx.fill();ctx.stroke();
 ctx.fillStyle=index===2?'#FFF0CB':'#CB5940';ctx.beginPath();
 for(let i=0;i<16;i++){const a=i*Math.PI/8,r=radius*(i%2?.24:.58);if(i===0)ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);else ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();
 // Uneven ink hatching keeps the burst from reading as a clean vector star.
 ctx.strokeStyle='#965F42';ctx.lineWidth=.7;
 for(let i=0;i<9;i++){const a=i*.72,r=radius*.7;ctx.beginPath();ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r*.88);ctx.lineTo(Math.cos(a+.025)*(r-5),Math.sin(a+.025)*(r-5)*.88);ctx.stroke()}

 ctx.restore();
}
