// Scripted contact studies: no physical bounce, hitstop or collision change.
function smallBonkStar(ctx,x,y,r,rotation){
 ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.fillStyle='#FFF3D5';ctx.strokeStyle='#665344';ctx.lineWidth=.9;ctx.lineJoin='round';ctx.beginPath();
 for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,rad=i%2?r*.43:r*(i===4?1.12:1);if(i===0)ctx.moveTo(Math.cos(a)*rad,Math.sin(a)*rad);else ctx.lineTo(Math.cos(a)*rad,Math.sin(a)*rad)}ctx.closePath();ctx.fill();ctx.stroke();
 ctx.fillStyle='#F2B653';ctx.beginPath();ctx.moveTo(-2,0);ctx.lineTo(0,-3);ctx.lineTo(2,1);ctx.lineTo(-1,2);ctx.closePath();ctx.fill();ctx.restore();
}
function drawCeilingScene(ctx,atlas,time,index){
 const age=time-.4;
 // At contact the authored ears meet the underside. All variants use this path.
 const feet=age<0?-44*Math.sin(time/.4*Math.PI/2):-44+Math.min(44,age*age*260);
 const top=feet-40;
 if(atlas.naturalWidth){
  ctx.save();ctx.translate(0,top);
  // Begin 50 ms sooner, as the rising silhouette reaches the ceiling.
  const squashAge=time-.35;
  if(index===1&&squashAge>=0&&squashAge<.28){
   // Ease into contact over 60 ms, then release smoothly over 220 ms.
   const t=squashAge<.06?squashAge/.06:1-(squashAge-.06)/.22;
   const pulse=t*t*(3-2*t);ctx.scale(1+pulse*.06,1-pulse*.12);
  }
  if(index===3&&age>=0&&age<.24){
   // Isolate the cached upper silhouette instead of inventing new bunny art.
   const split=35,cut=split/96*40,wobble=Math.sin(age/.24*Math.PI*4)*(1-age/.24)*.28;
   ctx.drawImage(atlas,0,split,96,96-split,-20,cut,40,40-cut);
   ctx.transform(1,0,wobble,1,-wobble*cut,0);
   ctx.drawImage(atlas,0,0,96,split,-20,0,40,cut);
  }else ctx.drawImage(atlas,0,0,96,96,-20,0,40,40);
  ctx.restore();
 }
 if(index===2&&age>=0&&age<.2){
  const t=age/.2;ctx.save();ctx.globalAlpha=1-t;
  smallBonkStar(ctx,-23-t*8,-72+t*6,5,-.25-t);
  smallBonkStar(ctx,23+t*7,-72+t*7,6,.2+t);
  smallBonkStar(ctx,8+t*5,-65+t*12,4,-t*2);
  ctx.restore();
 }
 // Draw the illustrated ceiling after the character so its cap occludes ears.
 ctx.fillStyle='#AD7953';ctx.strokeStyle='#665344';ctx.lineWidth=1.2;
 ctx.beginPath();ctx.moveTo(-70,-98);ctx.lineTo(70,-98);ctx.lineTo(70,-80);ctx.lineTo(-70,-80);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.strokeStyle='#7A533B';ctx.lineWidth=.8;
 for(let x=-55;x<70;x+=28){ctx.beginPath();ctx.moveTo(x,-95);ctx.quadraticCurveTo(x+7,-91,x-3,-84);ctx.stroke()}
 ctx.fillStyle='#A6BC78';ctx.beginPath();ctx.moveTo(-73,-101);ctx.lineTo(-37,-104);ctx.lineTo(4,-102);ctx.lineTo(40,-104);ctx.lineTo(73,-101);ctx.lineTo(73,-96);ctx.lineTo(-73,-96);ctx.closePath();ctx.fill();ctx.stroke();
}
