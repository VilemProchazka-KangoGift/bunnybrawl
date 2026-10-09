/* global window */
import { chromium } from '../../../node_modules/playwright/index.mjs';
const dir=new URL('.',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,'').replace(/\/$/,'');
const browser=await chromium.launch({headless:true});
try {
 for(const mode of ['', '&simWorker=off']) {
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4235/bunnybrawl/?arena=meadow&bots=4'+mode,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__bunnyTest?.state()?.countdown===0,undefined,{timeout:30000});
  await page.waitForFunction(()=>window.__bunnyTest.state().players.some(p=>p.active && p.state!=='respawning' && p.invincibleTimer>.5 && p.invincibleTimer<.85),undefined,{timeout:60000,polling:50});
  console.log(JSON.stringify(await page.evaluate(()=>window.__bunnyTest.state().players.filter(p=>p.invincibleTimer>0).map(p=>({id:p.id,timer:p.invincibleTimer,x:p.x,y:p.y})))));
  await page.screenshot({path:dir+'/captures/live-'+(mode?'renderer-worker':'sim-worker')+'.png'});
  if(errors.length)throw Error(errors.join('\n'));
  await page.close();
 }
} finally {await browser.close();}
console.log('PASS: natural respawn protection captured in both worker modes; no browser errors');
