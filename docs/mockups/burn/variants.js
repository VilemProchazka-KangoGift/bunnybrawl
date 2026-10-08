// Scripted cosmetic comparison with authored character assets. No physics changes.
function ember(ctx,x,y,r,a=0){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle='#F28B39';ctx.strokeStyle='#74452E';ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(r*.7,-r*.15);ctx.lineTo(r*.4,r*.7);ctx.lineTo(-r*.55,r*.4);ctx.lineTo(-r*.8,-r*.2);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#FFDD87';ctx.beginPath();ctx.moveTo(0,-r*.65);ctx.lineTo(r*.35,0);ctx.lineTo(-r*.3,r*.15);ctx.closePath();ctx.fill();ctx.restore();}
function smoke(ctx,x,y,r,alpha){ctx.save();ctx.globalAlpha*=alpha;ctx.fillStyle='#B0A08A';ctx.strokeStyle='#756557';ctx.lineWidth=.85;ctx.beginPath();ctx.moveTo(x-r,y+2);ctx.bezierCurveTo(x-r*1.3,y-r*.5,x-r*.6,y-r*.8,x-r*.3,y-r*.5);ctx.bezierCurveTo(x,y-r*1.2,x+r*.6,y-r*.8,x+r*.55,y-r*.3);ctx.bezierCurveTo(x+r*1.3,y-r*.1,x+r,y+r*.5,x+r*.3,y+r*.45);ctx.bezierCurveTo(x-r*.4,y+r*.65,x-r,y+r*.5,x-r,y+2);ctx.fill();ctx.stroke();ctx.strokeStyle='#D1C1AA';ctx.beginPath();ctx.moveTo(x-r*.5,y);ctx.quadraticCurveTo(x-r*.2,y-r*.4,x+r*.2,y-r*.2);ctx.stroke();ctx.restore();}
function drawBurnScene(ctx,atlas,time,index){
 const age=time-.25,burn=Math.max(0,5-age),active=age>=0&&burn>0;
 const travel=age>0?Math.min(44,age*28):0;
 // Common upward knockback is schematic; additional motion is pose-only.
 const knock=age>=0&&age<.5?-18*Math.sin(age/.5*Math.PI):0;
 const reaction=index===3&&active&&age<.65?Math.sin(age/.65*Math.PI):0;
 ctx.fillStyle='#744A3A';ctx.beginPath();ctx.ellipse(-23,2,30,5,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#DF7941';ctx.beginPath();ctx.ellipse(-23,0,28,4,0,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#FFD38A';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-44,-1);ctx.quadraticCurveTo(-30,-5,-17,-1);ctx.quadraticCurveTo(-5,2,2,-1);ctx.stroke();
 ctx.save();ctx.translate(travel,knock);
 if(index===1&&active&&age<.48){const t=age/.48;ctx.save();ctx.globalAlpha=1-t*t;ctx.fillStyle='#FFE4A7';ctx.strokeStyle='#875033';ctx.lineWidth=1;ctx.beginPath();for(let i=0;i<18;i++){const a=i*Math.PI/9,r=(i%2?16:30+(i%3)*4)*(1+.25*t);if(i===0)ctx.moveTo(Math.cos(a)*r,-18+Math.sin(a)*r);else ctx.lineTo(Math.cos(a)*r,-18+Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
 ctx.save();ctx.translate(0,-40-10*reaction);if(reaction){ctx.translate(0,40);ctx.rotate(-.13*reaction);ctx.scale(1-.12*reaction,1+.18*reaction);ctx.translate(0,-40);}
 if(atlas.naturalWidth)ctx.drawImage(atlas,0,0,96,96,-20,0,40,40);ctx.restore();
 if(active){const alpha=Math.min(.4,burn*.5)*(.6+Math.sin(burn*12)*.4);const g=ctx.createRadialGradient(0,-24,0,0,-24,28);g.addColorStop(0,'rgba(255,200,0,'+(alpha*.6)+')');g.addColorStop(.5,'rgba(255,100,0,'+(alpha*.4)+')');g.addColorStop(1,'rgba(255,50,0,0)');ctx.fillStyle=g;ctx.fillRect(-28,-52,56,56);}
 if(index===1&&active){for(let i=0;i<15;i++){const t=age,life=.45+(i%4)*.06;if(t>=life)continue;const a=i*Math.PI*2/15;ctx.save();ctx.globalAlpha=t<.16?1:(life-t)/(life-.16);ember(ctx,Math.cos(a)*(10+95*t),-18+Math.sin(a)*(10+95*t)+70*t*t,4+i%3,i*.7+t*7);ctx.restore();}for(let i=0;i<3;i++){const t=(age+i*.24)%.85;ctx.save();ctx.globalAlpha=Math.min(1,burn)*.7*(1-t/.85);ember(ctx,(i-1)*11+Math.sin(t*4+i)*4,-5-t*50,2.5,i+t*2);ctx.restore();}}
 if(index===2&&active){if(age<.7){for(let i=0;i<4;i++){const t=age/.7;smoke(ctx,(i-1.5)*(12+20*t),-8-28*t-(i%2)*7,12+9*t,1-t*t);}}for(let i=0;i<2;i++){const t=(age+i*.48)%1.1;smoke(ctx,(i?1:-1)*(10+4*t),-14-31*t,5+6*t,Math.min(1,burn)*.45*(1-t/1.1));}if(age<.5)for(let i=0;i<7;i++){ctx.save();ctx.globalAlpha=1-age/.5;ember(ctx,(i-3)*(5+20*age),-12-60*age+80*age*age,2.8,i);ctx.restore();}}
 if(index===3&&active){for(let i=0;i<2;i++){const t=(age+i*.28)%.65;ctx.save();ctx.globalAlpha=Math.min(1,burn)*(1-t/.65);ember(ctx,i?11:-11,-3-20*t,3,i?-1:1);ctx.restore();}if(age<.55){const t=age/.55;ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle='#FFF0C3';ctx.lineWidth=2;for(const sign of [-1,1]){ctx.beginPath();ctx.moveTo(sign*23,-28);ctx.lineTo(sign*(30+10*t),-34);ctx.moveTo(sign*18,-45);ctx.lineTo(sign*(22+8*t),-53);ctx.stroke();}ctx.restore();}}
 if(index>=4&&active)drawScorchVariant(ctx,age,burn,index);
 ctx.restore();
}

function drawScorchVariant(ctx,age,burn,index){
 const fade=Math.min(1,burn);
 if(index===4){ // A dense asymmetric bloom breaks apart into soot crumbs.
  if(age<.62){const t=age/.62;for(let i=0;i<5;i++){
   ctx.save();ctx.rotate((i-2)*.08);smoke(ctx,(i-2)*(8+17*t),-14-26*t-(i%2)*11,15+7*t,1-t*t);ctx.restore();
  }for(let i=0;i<9;i++){const a=i*2.4;ctx.save();ctx.globalAlpha=1-t;ctx.fillStyle='#69584C';ctx.translate(Math.cos(a)*(17+45*t),-18+Math.sin(a)*22-22*t);ctx.rotate(a+t*3);ctx.fillRect(-1.5,-2,3,4);ctx.restore();}}
  for(let i=0;i<2;i++){const t=(age+i*.6)%1.25;smoke(ctx,Math.sin(t*5+i)*7,-24-22*t,4+5*t,fade*.38*(1-t/1.25));}
 }
 if(index===5){ // Two foot-level jets; their opening puffs keep the face clear.
  for(const sign of [-1,1]){
   if(age<.55){const t=age/.55;smoke(ctx,sign*(17+27*t),-5-20*t,13+4*t,1-t*t);ember(ctx,sign*(15+45*t),-6-40*t,3,sign*t*5);}
   for(let i=0;i<3;i++){const t=(age+i*.24)%.9;smoke(ctx,sign*(13+7*t),-4-40*t,4+7*t,fade*.62*(1-t/.9));}
  }
 }
 if(index===6){ // A curling ribbon of distinct scalloped puffs.
  if(age<.72){for(let i=0;i<6;i++){const t=age-i*.035;if(t<0)continue;const u=t/.72;smoke(ctx,Math.sin(i*.85+u*2)*19,-8-i*7-26*u,8+9*u,1-u);}}
  for(let i=0;i<4;i++){const t=(age+i*.23)%1.3;smoke(ctx,Math.sin(t*5)*12,-10-35*t,3.5+5*t,fade*.55*(1-t/1.3));}
 }
 if(index===7){ // Two short chuffs with hot centers, then occasional wisps.
  for(let beat=0;beat<2;beat++){const t=age-beat*.15;if(t<0||t>.44)continue;const u=t/.44;
   for(const sign of [-1,1]){ctx.save();ctx.translate(sign*(12+24*u),-12-15*u);smoke(ctx,0,0,14+4*u,1-u*u);ctx.globalAlpha=1-u;ember(ctx,sign*3,-2,5-u*2,sign*u*3);ctx.restore();}
   for(let i=0;i<4;i++){ctx.save();ctx.globalAlpha=1-u;ember(ctx,(i-1.5)*(8+20*u),-17-30*u,3,i+u*3);ctx.restore();}
  }
  const t=age%1.4;smoke(ctx,7*Math.sin(t*3),-19-28*t,4+5*t,fade*.4*(1-t/1.4));
 }
}
