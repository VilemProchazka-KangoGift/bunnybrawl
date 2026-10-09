/* global window, document, innerWidth */
import { chromium } from '../../../node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));fs.mkdirSync(dir+'captures',{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1040,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4239/bunnybrawl/docs/mockups/ground-impact/index.html');await page.waitForFunction(()=>window.__groundStudy?.ready());
 async function scrub(t){await page.locator('#time').evaluate((e,t)=>{e.value=t;e.dispatchEvent(new Event('input'));},String(t));await page.waitForTimeout(60);}
 const hashes=()=>page.locator('canvas').evaluateAll(es=>es.map(e=>e.toDataURL()));
 await scrub(.2);if(new Set(await hashes()).size!==1)throw Error('Pre-impact mismatch');
 await scrub(.68);if(new Set(await hashes()).size!==4)throw Error('Expected four ground marks');await page.screenshot({path:dir+'captures/game-size.png',fullPage:true});
 await scrub(.47);await page.screenshot({path:dir+'captures/impact.png',fullPage:true});await scrub(.68);
 await page.locator('#scale').selectOption('2');await page.screenshot({path:dir+'captures/detail.png',fullPage:true});
 await page.locator('#night').check();await page.screenshot({path:dir+'captures/night.png',fullPage:true});await page.locator('#night').uncheck();
 for(const name of await page.locator('#character option').allTextContents()){await page.locator('#character').selectOption(name);await scrub(.68);if(new Set(await hashes()).size!==4)throw Error('Missing variant for '+name);}
 await page.locator('#character').selectOption('Bunny');
 for(const surface of await page.locator('#surface option').allTextContents())for(const impact of ['stomp','landing']){await page.locator('#surface').selectOption(surface);await page.locator('#impact').selectOption(impact);await scrub(.68);if(new Set(await hashes()).size!==4)throw Error('Missing '+surface+'/'+impact);}
 await page.locator('#surface').selectOption('ice');await page.locator('#impact').selectOption('stomp');await page.locator('#edge').selectOption('1');await page.locator('#left').check();await scrub(.68);if(new Set(await hashes()).size!==4)throw Error('Edge/left missing');await page.screenshot({path:dir+'captures/ice-edge.png',fullPage:true});
 await page.locator('#edge').selectOption('0');await page.locator('#surface').selectOption('grass');await page.locator('#left').uncheck();await page.locator('#shared').uncheck();await scrub(.48);await page.screenshot({path:dir+'captures/marks-only.png',fullPage:true});
 await scrub(1.1);let h=await hashes();if(h[2]!==h[3]||h[0]===h[3]||h[1]===h[3])throw Error('Dent must disappear while cracks remain');
 await scrub(5.5);if(new Set(await hashes()).size!==1)throw Error('Marks survive expiry');
 const baselineEqual=await page.evaluate(async()=>{const {drawSurfaceDecals}=await import('/bunnybrawl/src/engine/rendering/surfaceImpact.ts');for(const surface of ['grass','ice','glass'])for(const age of [0,.5,1.5,3,5])for(const edge of [false,true]){const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=b.width=100;a.height=b.height=80;const ca=a.getContext('2d'),cb=b.getContext('2d');ca.translate(50,40);cb.translate(50,40);const d={x:0,y:0,kind:surface==='grass'?'mini':'full',surface,age,life:surface==='grass'?5:surface==='ice'?3:2,seed:.371,color:'#D8F0FF',...(edge?{clipMinX:-56,clipMaxX:8}:{})};window.__groundStudy.baseline(ca,d);drawSurfaceDecals(cb,{surfaceDecals:[d]});if(a.toDataURL()!==b.toDataURL())return false;}return true;});if(!baselineEqual)throw Error('Frozen current differs from production');
 await page.locator('#scale').selectOption('1');await scrub(.68);await page.setViewportSize({width:360,height:1000});await page.screenshot({path:dir+'captures/mobile.png',fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: exact production baseline, four variants, before/after impact, 19 characters, eight surfaces, both impact types, edge/left/night/2x/mobile; no browser errors');
}finally{await browser.close();}
