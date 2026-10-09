const sizes={Bunny:40,Fox:43,Frog:41,Bear:42,Owl:39,Cat:42,Wolf:44,Panda:42,Pig:40,Cow:44,Goat:43,Horse:46,Sheep:42,Monkey:43,Tiger:44,Rhino:44,Hedgehog:41,Chick:37,Axolotl:45};
const surfaceColors={grass:'#A8C878',stone:'#C0B898',wood:'#C8AA80',snow:'#F8FAFF',sand:'#E8D8A0',ice:'#D8F0FF',metal:'#FFE8B0',glass:'#FFFFFF'};
const surfaceGround={grass:'#9FB875',stone:'#9A948A',wood:'#B3926C',snow:'#CDDDE6',sand:'#D2BF8D',ice:'#A7CADA',metal:'#929EA3',glass:'#B3D6D8'};
function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function puff(ctx,x,y,r){ctx.save();ctx.translate(x,y);ctx.fillStyle='#FFF0DB';ctx.strokeStyle='#9B8165';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(-r,0);ctx.bezierCurveTo(-r*1.4,-r*.65,-r*.5,-r*1.2,-r*.15,-r*.7);ctx.bezierCurveTo(r*.2,-r*1.6,r,-r,r*.8,-r*.4);ctx.bezierCurveTo(r*1.4,-r*.1,r*.6,r*.25,-r,0);ctx.fill();ctx.stroke();ctx.restore()}
function drawRunningScene(ctx,atlas,name,time,index,surface,width){
  const elapsed=Math.max(0,time-.1),speed=280,size=sizes[name]||40;
  ctx.strokeStyle=surface==='grass'?'#789956':'#756951';ctx.lineWidth=.7;
  for(let i=-10;i<11;i++){const x=i*32-(elapsed*speed)%32;if(Math.abs(x)>width/2)continue;ctx.beginPath();ctx.moveTo(x,5);ctx.lineTo(x+5,5);ctx.stroke()}
  ctx.fillStyle='rgba(50,43,34,.18)';ctx.beginPath();ctx.ellipse(0,-1,14,2.5,0,0,Math.PI*2);ctx.fill();
  if(time>=.1&&index!==3){const interval=index===1?.2:index===2?.14:.1;
    for(let step=1;step<=Math.floor(elapsed/interval);step++){const age=elapsed-step*interval,rand=random(step*119+87),count=index===2?3:1;
      for(let i=0;i<count;i++){
        let life=.28,size=2.4,vx=-50,vy=-10-rand()*25;
        if(index===0&&(surface==='metal'||surface==='glass')){life*=.7;size=.8+rand()*.6;vx=-70;vy=-30-rand()*30}
        if(index===0&&surface==='ice'){life*=.6;size=.6;vx=-24;vy=-8-rand()*12;if(rand()<.5)continue}
        if(index===1){life=.3;size=2.8;vx=-9;vy=-4}
        if(index===2){life=.26;size=1.3+rand()*.8;vx=-20-rand()*30;vy=-16-rand()*22}
        if(age>life)continue;const x=-9.6+(vx-speed)*age-i*1.4,y=-1+vy*age+40*age*age;
        ctx.globalAlpha=1-age/life;
        if(index===1)puff(ctx,x,y,size*(.7+age/life*.6));
        else if(index===2){ctx.save();ctx.translate(x,y);ctx.rotate(age*6+i);ctx.fillStyle=surfaceColors[surface];ctx.strokeStyle=surface==='snow'||surface==='ice'?'#7DA1AF':'#6B6243';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(-size,0);ctx.lineTo(0,-size*.7);ctx.lineTo(size,.2);ctx.lineTo(0,size*.5);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()}
        else{ctx.fillStyle=surfaceColors[surface];ctx.beginPath();ctx.arc(x,y,size*(1-age/life),0,Math.PI*2);ctx.fill()}
      }
    }
  }
  ctx.globalAlpha=1;const pose=time<.1?0:1+Math.floor(elapsed/.1)%2;
  if(atlas.naturalWidth)ctx.drawImage(atlas,pose*96,0,96,96,-size/2,-size,size,size);
}
