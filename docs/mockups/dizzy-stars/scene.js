function drawPlatform(ctx,width){ctx.fillStyle='#789553';ctx.fillRect(-width,0,width*2,7);ctx.fillStyle='#8D7562';ctx.fillRect(-width,7,width*2,33);ctx.strokeStyle='#4B5240';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-width,1);ctx.lineTo(width,1);ctx.stroke();}
function comicStar(ctx,x,y,r,rotation){
 ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.fillStyle='#F3CB56';ctx.strokeStyle='#765D32';ctx.lineWidth=.9;ctx.lineJoin='round';
 ctx.beginPath();ctx.moveTo(0,-r*1.2);ctx.lineTo(r*.32,-r*.32);ctx.lineTo(r*1.07,-r*.1);ctx.lineTo(r*.36,r*.26);ctx.lineTo(r*.1,r);ctx.lineTo(-r*.24,r*.34);ctx.lineTo(-r,r*.14);ctx.lineTo(-r*.35,-r*.27);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.fillStyle='#FFF1A3';ctx.beginPath();ctx.moveTo(-r*.13,-r*.62);ctx.lineTo(r*.09,-r*.23);ctx.lineTo(-r*.36,-r*.03);ctx.closePath();ctx.fill();ctx.restore();
}
function drawComicDizzy(ctx,now,swoosh){
 if(swoosh){ctx.save();ctx.strokeStyle='#947940';ctx.lineWidth=1.1;ctx.lineCap='round';ctx.globalAlpha*=.65;for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(0,-36,14,5,0,now*2+i*2.1,now*2+i*2.1+1.15);ctx.stroke();}ctx.restore();}
 for(let i=0;i<3;i++){const a=now*3+i*Math.PI*2/3;comicStar(ctx,Math.cos(a)*12,-36+Math.sin(a)*5,4.3+i*.25,a*.3);}
}
function drawScene(ctx,atlas,name,time,index,shared,left){
 const age=time-.3,remaining=age>=0&&age<1.5?1.5-age:0;
 const player={x:-16,y:-32,width:32,height:32,state:'idle',expression:'dizzy',invincibleTimer:remaining,facing:left?'left':'right'};
 ctx.save();if(shared&&remaining>0&&Math.floor(remaining*10)%2===0)ctx.globalAlpha=.5;
 ctx.save();ctx.scale(left?-1:1,1);const size=sizes[name];if(atlas.naturalWidth)ctx.drawImage(atlas,0,0,96,96,-size/2,-size,size,size);ctx.restore();
 if(remaining>0){if(index===0)drawExpression(ctx,player,time*1000);else if(index===1)drawComicDizzy(ctx,time,false);else if(index===2)drawComicDizzy(ctx,time,true);}
 ctx.restore();if(shared&&remaining>0){ctx.save();drawShieldSparks(ctx,player);ctx.restore();}
}
