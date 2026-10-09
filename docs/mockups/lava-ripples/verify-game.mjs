/* global window */
import { chromium } from '../../../node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true});
try {
 for(const mode of ['', '&simWorker=off']){
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('worker',async worker=>{try{await worker.evaluate(()=>{
   const proto=globalThis.OffscreenCanvasRenderingContext2D?.prototype;if(!proto)return;
   const original=proto.bezierCurveTo;globalThis.__lavaWaveCalls=0;
   proto.bezierCurveTo=function(...args){if(args[0]===-37&&args[2]===-24&&args[4]===-18)globalThis.__lavaWaveCalls++;return original.apply(this,args);};
  });}catch{/* Worker may close during navigation. */}});
  await page.goto('http://127.0.0.1:4243/bunnybrawl/?arena=volcano&bots=5'+mode);
  await page.waitForFunction(()=>window.__bunnyTest?.state()?.phase==='playing'&&window.__bunnyTest.state().countdown===0);
  if(mode)await page.evaluate(()=>{const p=window.__bunnyTest.state().players.find(p=>p.id==='P1');Object.assign(p,{x:320,y:640,vx:0,vy:600,state:'airborne',active:true,hitstopTimer:0,invincibleTimer:0});});
  if(mode)await page.waitForFunction(()=>window.__bunnyTest.state().ripples.some(r=>r.surface==='lava'&&r.age<.4),undefined,{timeout:10000});
  let calls=0;const deadline=Date.now()+(mode?100:60000);
  while(Date.now()<deadline&&!calls){for(const worker of page.workers())calls+=await worker.evaluate(()=>globalThis.__lavaWaveCalls||0);if(!calls)await page.waitForTimeout(100);}
  if(!mode&&!calls)throw Error('No selected splash drawn in worker '+JSON.stringify(await page.evaluate(()=>({phase:window.__bunnyTest.state().phase,p:window.__bunnyTest.state().players[0],slow:window.__bunnyTest.autoSlowFlipped(),ripples:window.__bunnyTest.state().ripples}))));
  const active=await page.evaluate(()=>({worker:!!window.__engineWorkerProxy}));
  await page.screenshot({path:new URL('captures/game-'+(mode?'renderer-worker':'engine-worker')+'.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS live lava entry '+(mode?'simWorker=off':'default')+' '+JSON.stringify({...active,calls}));
  await page.close();
 }
}finally{await browser.close();}
