/* global document, window */
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({ viewport:{width:1000,height:430},deviceScaleFactor:1 });
await page.goto('http://localhost:5186/bunnybrawl/');
await page.evaluate(async () => {
  const { drawBriar } = await import('/bunnybrawl/src/engine/rendering/thornArt.ts');
  document.body.innerHTML='<canvas id="study" width="1000" height="430"></canvas>';
  document.body.style='margin:0;background:#f6f0da;';
  const canvas=document.querySelector('canvas'); const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f6f0da';ctx.fillRect(0,0,1000,430);
  ctx.fillStyle='#344532';ctx.font='24px sans-serif';ctx.fillText('Leafy Dark Briar — faithful production revision',28,38);
  for (const [x,y,scale] of [[35,318,16],[555,264,8],[879,214,1]]) {
    ctx.fillStyle='#a8b76b';ctx.fillRect(x-5,y+1,28*scale+10,5);
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);drawBriar(ctx);ctx.restore();
    ctx.fillStyle='#344532';ctx.font='16px sans-serif';ctx.fillText(`${scale}× renderer`,x,y+38);
  }
  window.__art = drawBriar;
});
await page.locator('#study').screenshot({path:'docs/mockups/thorn-briar/production-revision-study.png'});
for (const scale of [1,8]) {
  const data=await page.evaluate(scale=>{
    const c=document.createElement('canvas');c.width=30*scale;c.height=17*scale;
    const ctx=c.getContext('2d');ctx.scale(scale,scale);ctx.translate(1,16);window.__art(ctx);
    return c.toDataURL().split(',')[1];
  },scale);
  await writeFile(`docs/mockups/thorn-briar/production-revision-${scale}x.png`,Buffer.from(data,'base64'));
}
await browser.close();
