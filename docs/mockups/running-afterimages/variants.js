const sizes={Bunny:40,Fox:43,Frog:41,Bear:42,Owl:39,Cat:42,Wolf:44,Panda:42,Pig:40,Cow:44,Goat:43,Horse:46,Sheep:42,Monkey:43,Tiger:44,Rhino:44,Hedgehog:41,Chick:37,Axolotl:45};
const characterColors=__COLORS__;
const surfaceGround={grass:'#9FB875',stone:'#9A948A',wood:'#B3926C',snow:'#CDDDE6',sand:'#D2BF8D',ice:'#A7CADA',metal:'#929EA3',glass:'#B3D6D8'};
/*__BASELINE__*/
function variantTrail(elapsed,speed,interval=.055,decay=4){
 const images=[];let acc=0;
 for(let tick=1;tick<=Math.floor(elapsed*30+1e-7);tick++){
  if(speed>200){acc+=1/30;while(acc>=interval){acc-=interval;if(images.length<5)images.push({time:tick/30,alpha:1});}}
  for(let i=images.length-1;i>=0;i--){images[i].alpha-=decay/30;if(images[i].alpha<=0){images[i]=images[images.length-1];images.pop();}}
 }
 return images;
}
function hsl(hex){const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),max=Math.max(...c),min=Math.min(...c),d=max-min,l=(max+min)/2;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));h=max===c[0]?((c[1]-c[2])/d)%6:max===c[1]?(c[2]-c[0])/d+2:(c[0]-c[1])/d+4;h=(h*60+360)%360;}return [h,Math.round(s*100),Math.round(l*100)];}
function puff(ctx,x,y,r){ctx.save();ctx.translate(x,y);ctx.fillStyle='#FFF0DB';ctx.strokeStyle='#9B8165';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(-r,0);ctx.bezierCurveTo(-r*1.4,-r*.65,-r*.5,-r*1.2,-r*.15,-r*.7);ctx.bezierCurveTo(r*.2,-r*1.6,r,-r,r*.8,-r*.4);ctx.bezierCurveTo(r*1.4,-r*.1,r*.6,r*.25,-r,0);ctx.fill();ctx.stroke();ctx.restore();}
function sprite(ctx,atlas,size,pose,x=0){if(atlas.naturalWidth)ctx.drawImage(atlas,pose*96,0,96,96,x-size/2,-size,size,size);}
function drawTrailScene(ctx,atlas,name,time,index,surface,width,speed,left,invincible){
  const elapsed=Math.max(0,time-.1),size=sizes[name]||40;
  ctx.save();if(left)ctx.scale(-1,1);
  ctx.strokeStyle=surface==='grass'?'#789956':'#756951';ctx.lineWidth=.7;
  for(let i=-10;i<11;i++){const x=i*32-(elapsed*speed)%32;if(Math.abs(x)>width/2)continue;ctx.beginPath();ctx.moveTo(x,5);ctx.lineTo(x+5,5);ctx.stroke();}
  ctx.fillStyle='rgba(50,43,34,.18)';ctx.beginPath();ctx.ellipse(0,-1,14,2.5,0,0,Math.PI*2);ctx.fill();
  if(time>=.1){
    if(speed>200||invincible){
      const trail=!invincible&&index===1?variantTrail(elapsed,speed,.03,1/.15):index===2&&!invincible?variantTrail(elapsed,speed):currentTrail(elapsed,invincible?Math.max(201,speed):speed);
      const [h,s,l]=hsl(invincible?'#88BBFF':characterColors[name]);
      trail.forEach((image,i)=>{
        const shift=(i/Math.max(1,trail.length-1)-1)*18,age=elapsed-image.time;
        let alpha=image.alpha,rx=32*.38,ry=32*.38;
        if(!invincible){
          if(index===1)alpha*=.9;
          if(index===3){rx=17.6;ry=8.3;alpha*=.85;}
          if(index===4){const taper=.35+.65*image.alpha;rx*=taper;ry*=taper;alpha*=.9;}
        }
        ctx.fillStyle=`hsl(${Math.round((h+shift+360)%360)},${s}%,${l}%)`;
        ctx.globalAlpha=alpha;ctx.beginPath();ctx.ellipse(-speed*age,-32+32*.55,rx,ry,0,0,Math.PI*2);ctx.fill();
      });
    }
    // Identical selected heel puff shape, cadence, velocity and gravity in all panels.
    for(let step=Math.max(1,Math.floor(elapsed/.2)-1);step<=Math.floor(elapsed/.2);step++){const age=elapsed-step*.2;if(age>.3)continue;ctx.globalAlpha=1-age/.3;puff(ctx,-9.6+(-9-speed)*age,-1-4*age+40*age*age,2.8*(.7+age/.3*.6));}
  }
  ctx.globalAlpha=1; sprite(ctx,atlas,size,time<.1?0:1+Math.floor(elapsed/.12)%2);
  ctx.restore();
}
