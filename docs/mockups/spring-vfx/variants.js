// Design-study renderers. These are not yet installed in the match renderer.
function drawSpringVariant(ctx, variant, age) {
  const duration = variant === 0 ? 0.26 : variant === 1 ? 0.22 : 0.18;
  if (age < 0 || age >= duration) return;
  const t = age / duration, ink = '#665344', cream = '#FFF3D5';
  ctx.save();
  ctx.translate(0, -36);
  ctx.globalAlpha = (1 - t) ** .8;
  ctx.lineCap = 'round';ctx.lineJoin = 'round';
  if (variant === 0) {
    // An uneven drawn coil springs open once; no endlessly racing rings.
    const height = 24 + 24 * Math.min(1, t * 3);
    function coil() {
      ctx.beginPath();ctx.moveTo(-3, 0);
      ctx.bezierCurveTo(16, -height*.1, 13, -height*.29, -7, -height*.28);
      ctx.bezierCurveTo(-19, -height*.27, -13, -height*.49, 8, -height*.5);
      ctx.bezierCurveTo(18, -height*.52, 11, -height*.72, -6, -height*.72);
      ctx.bezierCurveTo(-12, -height*.75, -5, -height*.94, 3, -height);
    }
    ctx.strokeStyle=ink;ctx.lineWidth=4;coil();ctx.stroke();
    ctx.strokeStyle=cream;ctx.lineWidth=1.7;coil();ctx.stroke();
  } else if (variant === 1) {
    // One compact launch burst, three irregular lobes moving apart.
    for (let i=0;i<3;i++) {
      const side=i-1,x=side*(8+14*t),y=-4-(i===1?17:5)*t,r=(i===1?10:8)*(1+.18*t);
      ctx.fillStyle=cream;ctx.strokeStyle=ink;ctx.lineWidth=1.15;
      ctx.beginPath();ctx.moveTo(x-r,y);
      ctx.bezierCurveTo(x-r*1.3,y-r*.5,x-r*.6,y-r*1.15,x-r*.12,y-r*.75);
      ctx.bezierCurveTo(x+r*.2,y-r*1.3,x+r*1.1,y-r*.8,x+r*.83,y-r*.28);
      ctx.bezierCurveTo(x+r*1.3,y+r*.35,x-r*.35,y+r*.45,x-r,y);
      ctx.fill();ctx.stroke();
      ctx.strokeStyle='#C7A76D';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x-r*.6,y+r*.05);ctx.quadraticCurveTo(x-r*.1,y+r*.2,x+r*.35,y);ctx.stroke();
    }
  } else {
    // Thick, irregular comic accents kick out from the launch, then disappear.
    const spread=1+t*.35;
    ctx.strokeStyle=ink;ctx.fillStyle=cream;ctx.lineWidth=1.2;
    for(const side of [-1,1]) {
      const x=side*15*spread;
      ctx.beginPath();ctx.moveTo(x,-5);ctx.lineTo(x+side*6,-19);
      ctx.lineTo(x+side*10,-21);ctx.lineTo(x+side*5,-5);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+side*5,3);ctx.lineTo(x+side*17,-3);ctx.lineTo(x+side*18,0);ctx.lineTo(x+side*8,6);ctx.closePath();ctx.fill();ctx.stroke();
    }
    ctx.fillStyle='#F2B653';ctx.beginPath();ctx.moveTo(-4,-7);ctx.lineTo(0,-26);ctx.lineTo(3,-24);ctx.lineTo(4,-7);ctx.closePath();ctx.fill();ctx.stroke();
  }
  ctx.restore();
}
