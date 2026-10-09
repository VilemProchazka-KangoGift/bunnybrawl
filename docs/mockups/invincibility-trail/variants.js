const sizes={Bunny:40,Fox:43,Frog:41,Bear:42,Owl:39,Cat:42,Wolf:44,Panda:42,Pig:40,Cow:44,Goat:43,Horse:46,Sheep:42,Monkey:43,Tiger:44,Rhino:44,Hedgehog:41,Chick:37,Axolotl:45};
const characterColors=__COLORS__;
const surfaceGround={grass:'#9FB875',stone:'#9A948A',wood:'#B3926C',snow:'#CDDDE6',sand:'#D2BF8D',ice:'#A7CADA',metal:'#929EA3',glass:'#B3D6D8'};
function hsl(hex){const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),max=Math.max(...c),min=Math.min(...c),d=max-min,l=(max+min)/2;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));h=max===c[0]?((c[1]-c[2])/d)%6:max===c[1]?(c[2]-c[0])/d+2:(c[0]-c[1])/d+4;h=(h*60+360)%360;}return [h,Math.round(s*100),Math.round(l*100)];}
function sprite(ctx,atlas,size,pose,x=0){if(atlas.naturalWidth)ctx.drawImage(atlas,pose*96,0,96,96,x-size/2,-size,size,size);}

/*__BASELINE__*/
function drawTrailShape(ctx,x,y,index,spawnTime){
 const tilt=(Math.round(spawnTime*30)%2?1:-1);
 ctx.save();ctx.translate(x,y);ctx.scale(12.16,12.16);ctx.beginPath();
 if(index===6){
  ctx.moveTo(-1.2,-.15);ctx.bezierCurveTo(-1.1,-.8,-.25,-1.02,.25,-.82);
  ctx.bezierCurveTo(.7,-1.04,1.1,-.45,1.18,.1);ctx.bezierCurveTo(1.1,.77,.35,.64,-.1,.87);
  ctx.bezierCurveTo(-.62,.93,-1.35,.52,-1.2,-.15);
 }else if(index===7){
  ctx.rotate(tilt*.22);ctx.moveTo(-1,-.5);ctx.bezierCurveTo(-.85,-1.15,.12,-1.05,.8,-.55);
  ctx.bezierCurveTo(1.5,-.05,1.18,.96,.4,1);ctx.bezierCurveTo(-.3,1,-.48,.55,-.2,.12);
  ctx.bezierCurveTo(.06,-.32,-1.28,.35,-1,-.5);
 }else if(index===8){
  ctx.moveTo(-1.6,tilt*.2);ctx.bezierCurveTo(-.72,-.18,-.48,-.96,.28,-.87);
  ctx.bezierCurveTo(1.1,-.84,1.2,.18,.73,.65);ctx.bezierCurveTo(.18,1.12,-.55,.4,-1.6,tilt*.2);
 }else{
  ctx.moveTo(-1.28,.08);ctx.bezierCurveTo(-1.55,-.5,-.85,-.78,-.6,-.57);
  ctx.bezierCurveTo(-.57,-1.27,.23,-1.17,.36,-.77);ctx.bezierCurveTo(.89,-1.03,1.31,-.5,1.04,-.08);
  ctx.bezierCurveTo(1.52,.4,.83,.98,.42,.67);ctx.bezierCurveTo(.13,1.16,-.55,.94,-.64,.54);
  ctx.bezierCurveTo(-1.13,.79,-1.55,.41,-1.28,.08);
 }
 ctx.closePath();ctx.fill();ctx.restore();
}
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
