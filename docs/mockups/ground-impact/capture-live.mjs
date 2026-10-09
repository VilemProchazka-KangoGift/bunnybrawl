/* global window */
import { chromium } from '../../../node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));
const browser=await chromium.launch({headless:true});
try{
 for(const mode of ['', '&simWorker=off']){
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4239/bunnybrawl/?arena=meadow&bots=4'+mode,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__bunnyTest?.state()?.countdown===0,undefined,{timeout:30000});
  if(mode){
   await page.evaluate(()=>{const p=window.__bunnyTest.state().players.find(p=>p.id==='P1');Object.assign(p,{x:520,y:120,vx:0,vy:700,state:'airborne',fastFalling:true,invincibleTimer:0});});
   await page.waitForTimeout(700);
   const count=await page.evaluate(()=>window.__bunnyTest.state().surfaceDecals.length);
   if(!count)throw Error('Main simulation did not create a ground mark');
   console.log('Main simulation ground marks: '+count);
  }else await page.waitForTimeout(5000);
  await page.screenshot({path:dir+'captures/live-'+(mode?'renderer-worker':'sim-worker')+'.png'});
  if(errors.length)throw Error(errors.join('\n'));
  await page.close();
 }
}finally{await browser.close();}
console.log('PASS: live ground-impact captures in both worker modes; no browser errors');
