// Cosmetic prototypes only; movement and collision rules stay unchanged.
function drawBumpFlash(ctx, age) {
  if (age < 0 || age >= .12) return;
  const t = age / .12;
  ctx.save(); ctx.translate(0, -20); ctx.globalAlpha = (1 - t) ** .7;
  ctx.fillStyle = '#FFF3D5'; ctx.strokeStyle = '#665344';
  ctx.lineWidth = .9; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const [i, point] of [[-7,-1],[-3,-3],[-2,-8],[1,-4],[5,-6],[4,-1],[8,2],[3,3],[1,7],[-2,3],[-6,5],[-4,1]].entries()) {
    if (i === 0) ctx.moveTo(...point); else ctx.lineTo(...point);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#F2B653';ctx.beginPath();ctx.moveTo(-3,0);
  ctx.lineTo(0,-3);ctx.lineTo(3,1);ctx.lineTo(-1,3);ctx.closePath();ctx.fill();
  for (const [x,y] of [[-10,-7],[9,8]]) {
    ctx.fillStyle = '#FFF3D5'; ctx.beginPath();ctx.moveTo(x,y);
    ctx.lineTo(x-1,y-3);ctx.lineTo(x+2,y-1);ctx.closePath();ctx.fill();ctx.stroke();
  }
  ctx.restore();
}
function drawBumpScene(ctx, atlas, time, variant, baseline) {
  const age = time - .4;
  const approach = age < 0 ? 74 - 61 * time / .4 : 13;
  const pulse = age < 0 ? 0 : Math.exp(-8 * age);
  const squash = 1 - pulse * (variant === 0 && !baseline ? .34 : .2);
  // Four-pixel outward kick with one small return; render displacement only.
  const recoil = !baseline && variant === 2 && age >= 0 && age < .18
    ? 4 * Math.sin(Math.PI * Math.min(1, age / .18)) : 0;
  for (const direction of [-1, 1]) {
    ctx.save();ctx.translate(direction * (approach + recoil), -20);
    ctx.scale(-direction * squash, 1 + (1-squash)*.4);
    ctx.rotate(variant === 2 && !baseline ? direction * recoil * .018 : 0);
    if (atlas.naturalWidth) {
      const pose = age < 0 ? 1 : 0;
      ctx.drawImage(atlas, pose*96, 0, 96, 96, -20,-20,40,40);
    }
    ctx.restore();
  }
  if (!baseline && variant === 1) drawBumpFlash(ctx, age);
}
