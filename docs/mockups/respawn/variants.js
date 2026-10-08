// Scripted spawn and protection window; actual assets, no simulator/audio replay.
function spawnStar(ctx,x,y,r,turn=0){ctx.save();ctx.translate(x,y);ctx.rotate(turn);ctx.fillStyle='#FFF0CB';ctx.strokeStyle='#665344';ctx.lineWidth=.8;ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,rad=i%2?r*.28:r;if(i===0)ctx.moveTo(Math.cos(a)*rad,Math.sin(a)*rad);else ctx.lineTo(Math.cos(a)*rad,Math.sin(a)*rad)}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
function spawnCloud(ctx,x,y,r){ctx.fillStyle='#FFF0DC';ctx.strokeStyle='#776049';ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(x-r,y+2);ctx.bezierCurveTo(x-r*1.3,y-r*.4,x-r*.5,y-r*.65,x-r*.35,y-r*.45);ctx.bezierCurveTo(x-r*.15,y-r,x+r*.45,y-r*.85,x+r*.52,y-r*.4);ctx.bezierCurveTo(x+r*1.3,y-r*.48,x+r*1.2,y+r*.3,x+r*.65,y+r*.32);ctx.bezierCurveTo(x+r*.1,y+r*.55,x-r*.8,y+r*.4,x-r,y+2);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#D2B995';ctx.beginPath();ctx.moveTo(x-r*.5,y);ctx.quadraticCurveTo(x,y-r*.35,x+r*.35,y-r*.1);ctx.stroke();}
function drawRespawnScene(ctx,atlas,time,index){
 const age=time-.25;if(age<0)return;
 const protection=age<1.5,x=age<.7?0:Math.min(47,(age-.7)*30);
 // Current warm light: source sin-bell duration 2.5 s, radius up to 320, intensity .15.
 if(index===0&&age<2.5){const e=Math.sin(age/2.5*Math.PI),r=320*(.6+.4*e);ctx.save();ctx.globalCompositeOperation='lighter';const g=ctx.createRadialGradient(0,-16,0,0,-16,r);g.addColorStop(0,'rgba(255,248,220,'+(.15*e)+')');g.addColorStop(.5,'rgba(255,248,220,'+(.15*e*.35)+')');g.addColorStop(1,'rgba(255,248,220,0)');ctx.fillStyle=g;ctx.fillRect(-r,-16-r,2*r,2*r);ctx.restore();}
 if(index===0&&age<.8){for(let i=0;i<12;i++){const life=.5+(i%4)*.1;if(age>=life)continue;const a=i*Math.PI/6,s=40+(i%5)*15;ctx.save();ctx.globalAlpha=(1-age/life)*.7;ctx.fillStyle=i%2?'#FF8C00':'#FFD700';ctx.beginPath();ctx.arc(Math.cos(a)*s*age,-16+Math.sin(a)*s*age+40*age*age,(2+i%3)*(1-age/life),0,Math.PI*2);ctx.fill();ctx.restore()}}
 if(index===2&&age<.4){const t=age/.4,r=34*(1+.35*t);ctx.save();ctx.globalAlpha=1-t*t;ctx.fillStyle='#FFF0CB';ctx.strokeStyle='#665344';ctx.lineWidth=1;ctx.beginPath();for(let i=0;i<20;i++){const a=i*Math.PI/10,rad=r*(i%2?.48:.9+(i%3)*.08);if(i===0)ctx.moveTo(Math.cos(a)*rad,-20+Math.sin(a)*rad);else ctx.lineTo(Math.cos(a)*rad,-20+Math.sin(a)*rad)}ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#D0DE9D';ctx.beginPath();ctx.ellipse(0,-20,14,16,0,0,Math.PI*2);ctx.fill();ctx.restore();}
 if(index===3&&age<.55){for(let i=0;i<2;i++){const t=(age-i*.08)/.47;if(t<0||t>1)continue;ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle=i?'#8A9F65':'#FFF0CB';ctx.lineWidth=i?1:2;ctx.beginPath();ctx.ellipse(0,1,13+35*t,3+7*t,0,0,Math.PI*2);ctx.stroke();ctx.restore()}}
 ctx.save();ctx.translate(x,-40);
 if(protection&&Math.floor((1.5-age)*10)%2===0)ctx.globalAlpha=.5;
 if(index>0&&age<.2){const t=age/.2;ctx.translate(0,40);ctx.scale(1+.15*(1-t),.7+.3*t);ctx.translate(0,-40);}
 if(atlas.naturalWidth)ctx.drawImage(atlas,0,0,96,96,-20,0,40,40);
 ctx.restore();
 if(index===1&&age<.55){const t=age/.55;ctx.save();ctx.globalAlpha=1-t*t;spawnCloud(ctx,-15-30*t,-8+4*t,21+4*t);spawnCloud(ctx,14+32*t,-9+5*t,24+3*t);spawnCloud(ctx,-1,-17+11*t,20*(1-t));ctx.restore();}
 if(index>0&&age<.85)spawnCelebration(ctx,age,index);

}

function spawnCelebration(ctx,age,index){
 const count=index===1?8:index===2?28:24;
 const colors=['#FFF0CB','#E8AE59','#A6BC78','#CA91A4','#91BABC'];
 for(let i=0;i<count;i++){
  const delay=index===3?(i%3)*.035:0,t=age-delay;if(t<0)continue;
  const life=.55+(i%4)*.09;if(t>=life)continue;
  const sign=i%2?-1:1,vx=sign*(index===1?18+(i%4)*12:25+(i%7)*18),vy=index===1?-95-(i%3)*18:-95-(i%5)*23;
  const x=(index===3?sign*15:0)+vx*t,y=-12+vy*t+180*t*t;
  ctx.save();ctx.translate(x,y);ctx.rotate(i*.7+t*sign*5);
  if(index===1){ctx.globalAlpha=t<life*.55?.95:(life-t)/(life*.45)*.95;ctx.fillStyle=i%2?'#E4A24B':'#FFD478';ctx.beginPath();ctx.ellipse(0,0,2.2,3.2,0,0,Math.PI*2);ctx.fill();ctx.restore();continue;}
  ctx.globalAlpha=t<life*.65?1:(life-t)/(life*.35);
  if(i%4===0){spawnStar(ctx,0,0,4+(i%3),0)}
  else{ctx.fillStyle=colors[i%colors.length];ctx.strokeStyle='#776049';ctx.lineWidth=.65;ctx.beginPath();
   if(i%4===1){ctx.moveTo(-3,-4);ctx.lineTo(4,-2);ctx.lineTo(3,3);ctx.lineTo(-2,4)}
   else if(i%4===2){ctx.moveTo(-2,-5);ctx.quadraticCurveTo(4,-2,0,1);ctx.quadraticCurveTo(-3,3,2,5);ctx.lineTo(4,4);ctx.quadraticCurveTo(-1,1,2,-1);ctx.quadraticCurveTo(5,-4,0,-5)}
   else{ctx.moveTo(0,-4);ctx.lineTo(4,0);ctx.lineTo(0,4);ctx.lineTo(-3,0)}
   ctx.closePath();ctx.fill();ctx.stroke();
  }
  ctx.restore();
 }
}
