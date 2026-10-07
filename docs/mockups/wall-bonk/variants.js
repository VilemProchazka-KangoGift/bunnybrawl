// Design studies only. Both graphics accompany the existing .75 body squash.
function drawBonkVariant(ctx, variant, x, y, age) {
  const duration=variant===0?.14:.16;
  if(variant===2||age<0||age>=duration)return;
  const t=age/duration;
  ctx.save();ctx.translate(x,y);ctx.globalAlpha=(1-t)**.8;
  ctx.strokeStyle='#665344';ctx.fillStyle='#FFF3D5';ctx.lineWidth=1.1;
  ctx.lineJoin='round';
  if(variant===0){
    const angles=[-2.2,Math.PI,2.12],lengths=[13,10,15];
    for(let i=0;i<3;i++){
      const a=angles[i],start=5+t*3,end=lengths[i]+t*3;
      const ux=Math.cos(a),uy=Math.sin(a),nx=-uy,ny=ux;
      ctx.beginPath();ctx.moveTo(ux*start+nx,uy*start+ny);
      ctx.lineTo(ux*end+nx*.5,uy*end+ny*.5);
      ctx.lineTo(ux*(end+1)-nx*.8,uy*(end+1)-ny*.8);
      ctx.lineTo(ux*(start+1)-nx*1.5,uy*(start+1)-ny*1.5);
      ctx.closePath();ctx.fill();ctx.stroke();
    }
  }else{
    const r=9*(1+.12*t);
    ctx.beginPath();ctx.moveTo(-r*.94,-r*.1);
    ctx.lineTo(-r*.35,-r*.42);ctx.lineTo(-r*.31,-r*1.05);
    ctx.lineTo(r*.13,-r*.48);ctx.lineTo(r*.8,-r*.73);
    ctx.lineTo(r*.49,-r*.04);ctx.lineTo(r*.98,r*.38);
    ctx.lineTo(r*.28,r*.46);ctx.lineTo(r*.02,r*.96);
    ctx.lineTo(-r*.24,r*.39);ctx.lineTo(-r*.84,r*.57);
    ctx.lineTo(-r*.54,r*.07);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#F2B653';ctx.beginPath();ctx.moveTo(-4,0);
    ctx.lineTo(-1,-4);ctx.lineTo(2,-1);ctx.lineTo(5,1);ctx.lineTo(0,4);ctx.closePath();ctx.fill();
    ctx.fillStyle='#FFF3D5';
    ctx.beginPath();ctx.moveTo(-12-t*3,-10);ctx.lineTo(-14-t*3,-15);
    ctx.lineTo(-10-t*3,-13);ctx.closePath();ctx.fill();ctx.stroke();
  }
  ctx.restore();
}

function drawStudyWall(ctx,width,night){
  const ink='#665344';
  ctx.fillStyle=night?'#627958':'#9FB875';ctx.fillRect(-width,0,width*2,24);
  ctx.strokeStyle=ink;ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(-width,0);ctx.lineTo(width,0);ctx.stroke();
  // Small illustrated platform face; geometry is fixed across every option.
  ctx.fillStyle=night?'#745641':'#AD7953';ctx.beginPath();ctx.moveTo(40,-80);
  ctx.lineTo(width,-80);ctx.lineTo(width,0);ctx.lineTo(40,0);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle=night?'#88704D':'#CDA367';ctx.beginPath();ctx.moveTo(36,-84);
  ctx.lineTo(width,-84);ctx.lineTo(width,-73);ctx.lineTo(36,-73);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.strokeStyle=night?'#57483A':'#7A533B';ctx.lineWidth=.8;
  for(let i=0;i<4;i++){
    const x=48+i*17;ctx.beginPath();ctx.moveTo(x,-65);
    ctx.bezierCurveTo(x+5,-51,x-4,-27,x+2,-8);ctx.stroke();
  }
  ctx.fillStyle=night?'#6C805A':'#A6BC78';ctx.beginPath();ctx.moveTo(36,-84);
  ctx.lineTo(47,-89);ctx.lineTo(70,-87);ctx.lineTo(90,-89);ctx.lineTo(width,-87);
  ctx.lineTo(width,-80);ctx.lineTo(37,-79);ctx.closePath();ctx.fill();ctx.stroke();
}
