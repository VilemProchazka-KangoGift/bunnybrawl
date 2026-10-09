/* global window, document, innerWidth */
import { chromium } from '../../../node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));fs.mkdirSync(dir+'captures',{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1040,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4243/bunnybrawl/docs/mockups/lava-ripples/index.html');await page.waitForFunction(()=>window.__lavaStudy?.ready());
 async function scrub(t){await page.locator('#time').evaluate((e,t)=>{e.value=t;e.dispatchEvent(new Event('input'));},String(t));await page.waitForTimeout(70);}
 const hashes=()=>page.locator('canvas').evaluateAll(es=>es.map(e=>e.toDataURL()));
 await scrub(.2);if(new Set(await hashes()).size!==1)throw Error('Pre-entry frames differ');await scrub(.65);if(new Set(await hashes()).size!==12)throw Error('Need twelve distinct effects');await page.screenshot({path:dir+'captures/game-size.png',fullPage:true});
 await page.locator('#scale').selectOption('2');await page.screenshot({path:dir+'captures/detail.png',fullPage:true});await page.locator('#night').check();await page.screenshot({path:dir+'captures/night.png',fullPage:true});await page.locator('#night').uncheck();
 for(const name of await page.locator('#character option').allTextContents()){await page.locator('#character').selectOption(name);await scrub(.65);if(new Set(await hashes()).size!==12)throw Error('Variant missing for '+name);}
 await page.locator('#character').selectOption('Bunny');await page.locator('#shared').uncheck();await scrub(.65);if(new Set(await hashes()).size!==12)throw Error('Isolated ripples missing');await page.screenshot({path:dir+'captures/ripples-only.png',fullPage:true});
 await page.locator('#edge').selectOption('1');await page.locator('#left').check();await scrub(.65);if(new Set(await hashes()).size!==12)throw Error('Edge/left effects missing');await page.screenshot({path:dir+'captures/edge.png',fullPage:true});
 await scrub(1.2);if(new Set(await hashes()).size!==1)throw Error('Ripple survives expiry');await page.locator('#shared').check();await scrub(1.2);if(new Set(await hashes()).size!==1)throw Error('Shared smoke differs after expiry');
 const equal=await page.evaluate(async()=>{const {drawRipples}=await import('/bunnybrawl/src/engine/rendering/surfaceImpact.ts');for(const age of [0,.05,.15,.3,.59,.6,.9]){const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=b.width=160;a.height=b.height=90;const ca=a.getContext('2d'),cb=b.getContext('2d');ca.translate(80,45);cb.translate(80,45);window.__lavaStudy.baseline(ca,age);drawRipples(cb,{ripples:[{x:0,y:0,age,surface:'lava'}]});if(a.toDataURL()!==b.toDataURL())return false;}return true;});if(!equal)throw Error('Current differs from production');
 await page.locator('#scale').selectOption('1');await scrub(.65);await page.setViewportSize({width:360,height:1000});await page.screenshot({path:dir+'captures/mobile.png',fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: exact production baseline, twelve options, all 19 characters, shared/isolated, pre/post entry, edge/left/night/2x/mobile; no browser errors');
}finally{await browser.close();}
