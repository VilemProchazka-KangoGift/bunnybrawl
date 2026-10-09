/* global document, innerWidth */
import { chromium } from '../../../node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));fs.mkdirSync(new URL('captures/',import.meta.url),{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4235/bunnybrawl/docs/mockups/invincibility-trail/index.html');await page.waitForTimeout(500);
 async function scrub(t){await page.locator('#trail-time').evaluate((e,t)=>{e.value=t;e.dispatchEvent(new Event('input'));},String(t));await page.waitForTimeout(75);}
 const hashes=()=>page.locator('canvas').evaluateAll(es=>es.map(e=>e.toDataURL()));
 await scrub(.05);if(new Set(await hashes()).size!==1)throw Error('Before-protection mismatch');
 await scrub(.675);if(new Set(await hashes()).size!==4)throw Error('Expected four distinct cues');
 await page.screenshot({path:dir+'captures/game-size.png',fullPage:true});
 await page.locator('#trail-scale').selectOption('2');await page.screenshot({path:dir+'captures/detail.png',fullPage:true});
 await page.locator('#trail-night').check();await page.screenshot({path:dir+'captures/night.png',fullPage:true});
 for(const name of await page.locator('#trail-character option').allTextContents()){await page.locator('#trail-character').selectOption(name);await scrub(.675);if(new Set(await hashes()).size!==4)throw Error('Missing cue for '+name);}
 await page.locator('#trail-character').selectOption('Bunny');await page.locator('#trail-velocity').selectOption('0');
 await scrub(.15);const dim=(await hashes())[3];await scrub(.25);if((await hashes())[3]===dim)throw Error('Protection blink missing');
 await scrub(.675);if(new Set(await hashes()).size!==4)throw Error('Standing cues missing');await page.screenshot({path:dir+'captures/standing.png',fullPage:true});
 await scrub(2.1);if(new Set(await hashes()).size!==1)throw Error('Cue survives protection expiry');
 await page.locator('#trail-velocity').selectOption('280');await scrub(2.1);if(new Set(await hashes()).size!==1)throw Error('Ordinary speed cloud differs after protection');
 await page.locator('#trail-left').check();await scrub(.675);if(new Set(await hashes()).size!==4)throw Error('Left cues missing');
 for(const surface of await page.locator('#trail-surface option').allTextContents())await page.locator('#trail-surface').selectOption(surface);
 await page.locator('#trail-scale').selectOption('1');await page.setViewportSize({width:360,height:900});await page.screenshot({path:dir+'captures/mobile.png',fullPage:true});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: four variants, blink, before/after protection, 19 characters, stationary/running/left/night/2x/mobile, no browser errors');
}finally{await browser.close();}
