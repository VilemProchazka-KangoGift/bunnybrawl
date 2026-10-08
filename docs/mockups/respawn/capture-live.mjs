/* global window */
import {chromium} from 'playwright';
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1280,height:780}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 for(const mode of ['', '&simWorker=off']){
  await page.goto('http://127.0.0.1:4213/bunnybrawl/?arena=meadow&bots=2'+mode);
  await page.waitForFunction(()=>window.__bunnyTest?.state()?.phase==='playing'&&window.__bunnyTest.state().countdown===0);
  await page.locator('[data-testid=game-canvas]').screenshot({path:'docs/mockups/respawn/captures/runtime-'+(mode?'main':'worker')+'.png'});
 }
 await page.goto('http://127.0.0.1:4213/bunnybrawl/docs/mockups/respawn/playtest.html');
 await page.locator('#status').filter({hasText:'Live Cloud entrance'}).waitFor();
 const game=page.frames().find(f=>f.url().includes('?arena='));
 await game.waitForFunction(()=>window.__bunnyTest.gameLoop().particleSystem.getParticles().some(p=>p.shape==='respawnCloud'));
 await page.waitForTimeout(140);
 await page.screenshot({path:'docs/mockups/respawn/captures/live-cloud.png'});
 await page.locator('#reset').click();
 await game.waitForFunction(()=>window.__bunnyTest.gameLoop().particleSystem.getParticles().some(p=>p.shape==='respawnCloud'&&p.life>.7));
 await game.locator('[data-testid=game-canvas]').click();await page.keyboard.down('d');
 await page.waitForTimeout(180);await page.keyboard.up('d');
 const state=await game.evaluate(()=>{const p=window.__bunnyTest.state().players.find(p=>p.id==='P1'),cloud=window.__bunnyTest.gameLoop().particleSystem.getParticles().find(p=>p.shape==='respawnCloud');return {x:p.x,timer:p.invincibleTimer,cloudX:cloud?.x}});
 if(state.cloudX!==756||state.x<=740||state.timer<=0)throw Error('Cloud anchoring or protection failed: '+JSON.stringify(state));
 await page.waitForTimeout(1500);
 if(await game.evaluate(()=>window.__bunnyTest.state().players.find(p=>p.id==='P1').invincibleTimer)!==0)throw Error('Protection did not end');
 await page.locator('#reset').click();
 await game.waitForFunction(()=>window.__bunnyTest.gameLoop().particleSystem.getParticles().some(p=>p.shape==='respawnCloud'));
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: both worker modes, real respawn entry, stationary cloud while moving, protection expiry and replay; no page errors');
}finally{await browser.close()}
