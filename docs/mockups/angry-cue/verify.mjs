/* global window, document, innerWidth */
import { chromium } from '../../../node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));fs.mkdirSync(dir+'captures',{recursive:true});
const source=fs.readFileSync(new URL('../../../src/engine/rendering/players.ts',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const expected='export function drawExpression'+source.split('export function drawExpression')[1];if(fs.readFileSync(dir+'baseline-expression.ts.txt','utf8')!==expected)throw Error('Current expression drifted');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1040,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4251/bunnybrawl/docs/mockups/angry-cue/index.html',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__angryStudy?.ready());
 async function scrub(t){await page.locator('#time').evaluate((e,t)=>{e.value=t;e.dispatchEvent(new Event('input'));},String(t));await page.waitForTimeout(70);}
 const hashes=()=>page.locator('canvas').evaluateAll(es=>es.map(e=>e.toDataURL()));
 await scrub(.2);if(new Set(await hashes()).size!==1)throw Error('Pre-cue frames differ');
 await scrub(.65);if(new Set(await hashes()).size!==3)throw Error('Need three distinct options: current and no overlay match');await page.screenshot({path:dir+'captures/game-size.png',fullPage:true});
 await page.locator('#scale').selectOption('2');await page.screenshot({path:dir+'captures/detail.png',fullPage:true});await page.locator('#night').check();await page.screenshot({path:dir+'captures/night.png',fullPage:true});await page.locator('#night').uncheck();
 for(const name of await page.locator('#character option').allTextContents()){await page.locator('#character').selectOption(name);for(const pose of ['idle','run','jump']){await page.locator('#mode').selectOption(pose);await scrub(.65);const frames=await hashes();if(new Set(frames).size!==3||frames[0]!==frames[3])throw Error('Variant/baseline mismatch for '+name+' '+pose);}}await page.locator('#mode').selectOption('idle');for(const name of ['Horse','Frog','Owl','Cat']){await page.locator('#character').selectOption(name);await scrub(.65);await page.screenshot({path:dir+'captures/'+name.toLowerCase()+'.png',fullPage:true});}
 await page.locator('#character').selectOption('Bunny');await page.locator('#mode').selectOption('run');await scrub(.65);if(new Set(await hashes()).size!==3)throw Error('Run pose missing variants');await page.screenshot({path:dir+'captures/run-pose.png',fullPage:true});await page.locator('#mode').selectOption('idle');await page.locator('#shared').uncheck();await scrub(.65);if(new Set(await hashes()).size!==1)throw Error('Disabled cue still visible');await page.screenshot({path:dir+'captures/isolated.png',fullPage:true});
 await page.locator('#shared').check();await page.locator('#left').check();await scrub(.95);if(new Set(await hashes()).size!==3)throw Error('Left-facing overlay missing');await page.screenshot({path:dir+'captures/left.png',fullPage:true});
 await scrub(2.7);if(new Set(await hashes()).size!==1)throw Error('Overlay survives cue expiry');await page.locator('#shared').check();if(new Set(await hashes()).size!==1)throw Error('Shared cue survives expiry');
 await page.locator('#mode').selectOption('jump');await scrub(.65);if(new Set(await hashes()).size!==3)throw Error('Jump variants missing');await page.screenshot({path:dir+'captures/jump-pose.png',fullPage:true});await page.locator('#scale').selectOption('1');await scrub(.65);await page.setViewportSize({width:360,height:1000});await page.screenshot({path:dir+'captures/mobile.png',fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: frozen current expression, four cards / three distinct options, all 19 characters, enabled/disabled, pre/post cue, idle/run/jump, left/night/native/2x/mobile; no browser errors');
}finally{await browser.close();}
