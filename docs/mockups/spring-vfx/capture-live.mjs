import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(new URL('../../../package.json',import.meta.url));
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true});
const errors=[];
const page=await browser.newPage({viewport:{width:1280,height:780},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));
const out=new URL('./captures/',import.meta.url);fs.mkdirSync(out,{recursive:true});
try{
  await page.goto('http://127.0.0.1:4201/bunnybrawl/docs/mockups/spring-vfx/playtest.html');
  const game=page.frames().find(f=>f.url().includes('?arena='));
  if(!game)throw Error('Missing game iframe');
  await game.waitForFunction(()=>window.__bunnyTest?.state()?.countdown===0);
  await page.locator('#status').filter({hasText:'Live spring collision'}).waitFor();
  for(const night of [false,true]){
    await game.evaluate(night=>{window.__bunnyTest.state().dayPhase=night?.5:0},night);
    await page.locator('#reset').click();
    const launch=await game.evaluate(async()=>{
      const shim=window.__bunnyTest;
      for(let i=0;i<120;i++){
        const p=shim.state().players.find(p=>p.id==='P1');
        if(p.springTrailTimer>.26&&p.springTrailTimer<.32){shim.gameLoop().pause();return {vy:p.vy,x:p.springLaunchX,y:p.springLaunchY,timer:p.springTrailTimer};}
        await new Promise(r=>requestAnimationFrame(r));
      }
      throw Error('No real spring collision');
    });
    if(launch.vy>=0||launch.x!==806||launch.y!==660)throw Error('Wrong spring launch');
    await page.waitForTimeout(70);
    await page.screenshot({path:fileURLToPath(new URL(night?'live-night.png':'live-day.png',out)),clip:{x:715,y:400,width:230,height:300}});
    await game.evaluate(()=>window.__bunnyTest.gameLoop().resume());
    console.log('Real spring collision',JSON.stringify(launch));
  }
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: actual main-simulation collision, renderer-worker day/night captures; no browser errors.');
}finally{await browser.close();}
