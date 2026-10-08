/* global window */
import {chromium} from 'playwright';
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1280,height:780}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 for(const mode of ['', '&simWorker=off']){
  await page.goto('http://127.0.0.1:4215/bunnybrawl/?arena=meadow&bots=2'+mode);
  await page.waitForFunction(()=>window.__bunnyTest?.state()?.phase==='playing'&&window.__bunnyTest.state().countdown===0);
  await page.locator('[data-testid=game-canvas]').screenshot({path:'docs/mockups/burn/captures/runtime-'+(mode?'main':'worker')+'.png'});
 }
 await page.goto('http://127.0.0.1:4215/bunnybrawl/docs/mockups/burn/playtest.html');
 await page.locator('#status').filter({hasText:'Live Ember cough'}).waitFor();
 const game=page.frames().find(f=>f.url().includes('?arena='));
 await page.locator('#reset').click();
 await game.waitForFunction(()=>window.__bunnyTest.gameLoop().particleSystem.getParticles().some(p=>p.shape==='burnCough'&&p.life>.4));
 await page.waitForTimeout(100);
 await page.screenshot({path:'docs/mockups/burn/captures/live-cough.png'});
 await page.waitForTimeout(700);
 const state=await game.evaluate(()=>({burn:window.__bunnyTest.state().players[0].burnTimer,count:window.__bunnyTest.gameLoop().particleSystem.getParticles().filter(p=>p.shape==='burnCough').length}));
 if(state.burn<=0||state.count!==0)throw Error('Hit must expire before burn ends: '+JSON.stringify(state));
 await page.screenshot({path:'docs/mockups/burn/captures/live-wisp.png'});
 await page.waitForTimeout(5000);
 if(await game.evaluate(()=>window.__bunnyTest.state().players[0].burnTimer)!==0)throw Error('Burn did not expire');
 await page.locator('#reset').click();await game.waitForFunction(()=>window.__bunnyTest.gameLoop().particleSystem.getParticles().some(p=>p.shape==='burnCough'));
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: both worker modes boot; real lava collision through renderer worker, two-chuff particle expiry, ongoing burn, recovery and replay.');
}finally{await browser.close();}
