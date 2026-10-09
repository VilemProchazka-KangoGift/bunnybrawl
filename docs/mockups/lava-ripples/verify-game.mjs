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
  await page.waitForFunction(()=>window.__bunnyTest?.state()?.phase==='playing');
  let calls=0;const deadline=Date.now()+60000;
  while(Date.now()<deadline&&!calls){for(const worker of page.workers())calls+=await worker.evaluate(()=>globalThis.__lavaWaveCalls||0);if(!calls)await page.waitForTimeout(100);}
  if(!calls)throw Error('No selected splash drawn in worker');
  const active=await page.evaluate(()=>({worker:!!window.__engineWorkerProxy}));
  await page.screenshot({path:new URL('captures/game-'+(mode?'renderer-worker':'engine-worker')+'.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS live lava entry '+(mode?'simWorker=off':'default')+' '+JSON.stringify({...active,calls}));
  await page.close();
 }
}finally{await browser.close();}
