/* global window, document, innerWidth */
import { chromium } from '../../../node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));fs.mkdirSync(dir+'captures',{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1040,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4245/bunnybrawl/docs/mockups/dizzy-stars/index.html',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__dizzyStudy?.ready());
 async function scrub(t){await page.locator('#time').evaluate((e,t)=>{e.value=t;e.dispatchEvent(new Event('input'));},String(t));await page.waitForTimeout(70);}
 const hashes=()=>page.locator('canvas').evaluateAll(es=>es.map(e=>e.toDataURL()));
 await scrub(.2);if(new Set(await hashes()).size!==1)throw Error('Pre-protection frames differ');
 await scrub(.65);if(new Set(await hashes()).size!==4)throw Error('Need four distinct options');await page.screenshot({path:dir+'captures/game-size.png',fullPage:true});
 await page.locator('#scale').selectOption('2');await page.screenshot({path:dir+'captures/detail.png',fullPage:true});await page.locator('#night').check();await page.screenshot({path:dir+'captures/night.png',fullPage:true});await page.locator('#night').uncheck();
 for(const name of await page.locator('#character option').allTextContents()){await page.locator('#character').selectOption(name);await scrub(.65);if(new Set(await hashes()).size!==4)throw Error('Variant missing for '+name);}
 await page.locator('#character').selectOption('Bunny');await page.locator('#shared').uncheck();await scrub(.65);if(new Set(await hashes()).size!==4)throw Error('Isolated overlay missing');await page.screenshot({path:dir+'captures/isolated.png',fullPage:true});
 await page.locator('#left').check();await scrub(.95);if(new Set(await hashes()).size!==4)throw Error('Left-facing overlay missing');await page.screenshot({path:dir+'captures/left.png',fullPage:true});
 await scrub(2.1);if(new Set(await hashes()).size!==1)throw Error('Overlay survives protection expiry');await page.locator('#shared').check();if(new Set(await hashes()).size!==1)throw Error('Shared protection survives expiry');
 const equal=await page.evaluate(async()=>{const {drawExpression}=await import('/bunnybrawl/src/engine/rendering/players.ts');for(const now of [0,.1,.4,.65,1,1.75,2.1]){const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=b.width=120;a.height=b.height=90;const ca=a.getContext('2d'),cb=b.getContext('2d');ca.translate(60,65);cb.translate(60,65);window.__dizzyStudy.baseline(ca,now);drawExpression(cb,{x:-16,y:-32,width:32,height:32,state:'idle',expression:'dizzy'},now*1000);if(a.toDataURL()!==b.toDataURL())return false;}return true;});if(!equal)throw Error('Frozen current differs from production');
 await page.locator('#scale').selectOption('1');await scrub(.65);await page.setViewportSize({width:360,height:1000});await page.screenshot({path:dir+'captures/mobile.png',fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: exact current stars, four options, all 19 characters, shared/isolated, pre/post protection, left/night/native/2x/mobile; no browser errors');
}finally{await browser.close();}
