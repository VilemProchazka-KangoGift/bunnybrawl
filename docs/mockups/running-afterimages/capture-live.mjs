/* global window */
import { chromium } from '../../../node_modules/playwright/index.mjs';
const dir=new URL('.',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,'').replace(/\/$/,'');
const browser=await chromium.launch({headless:true});
for(const mode of ['', '&simWorker=off']){
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4231/bunnybrawl/?arena=meadow&bots=0'+mode,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__bunnyTest?.state()?.countdown===0,undefined,{timeout:30000});
 await page.waitForTimeout(2000);
 if(mode)await page.evaluate(()=>{const p=window.__bunnyTest.state().players.find(p=>p.id==='P1');Object.assign(p,{x:510,y:280-p.height,vx:0,vy:0,state:'idle',invincibleTimer:0});});
 await page.keyboard.down('d');await page.waitForTimeout(450);
 if(mode){const puffs=await page.evaluate(()=>window.__bunnyTest.gameLoop().particleSystem._particles.filter(p=>p.shape==='heelCloud').map(p=>({shape:p.shape,size:p.size,life:p.life})));if(puffs.length)throw Error('Running heel particles should be removed');console.log(JSON.stringify(puffs));}
 await page.screenshot({path:dir+'/captures/live-'+(mode?'renderer-worker':'sim-worker')+'.png'});
 await page.keyboard.up('d');await page.waitForTimeout(400);
 if(errors.length)throw Error(errors.join('\n'));
 await page.close();
}
await browser.close();console.log('PASS: live movement captures in both worker modes; no browser errors');
