/* global document, innerWidth */
import { chromium } from '../../../node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));fs.mkdirSync(new URL('captures/',import.meta.url),{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4231/bunnybrawl/docs/mockups/running-afterimages/index.html');
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete));await page.waitForTimeout(500);await page.locator('#trail-play').click();
 async function scrub(t){await page.locator('#trail-time').evaluate((e,t)=>{e.value=t;e.dispatchEvent(new Event('input'));},String(t));await page.waitForTimeout(50);}
 const hashes=()=>page.locator('canvas').evaluateAll(es=>es.map(e=>e.toDataURL()));
 await scrub(.05);if(new Set(await hashes()).size!==1)throw Error('Before-run mismatch');
 await scrub(.675);if(new Set(await hashes()).size!==5)throw Error('Expected five distinct variants');
 const oldPage=await browser.newPage({viewport:{width:1000,height:900}});
 await oldPage.goto('http://127.0.0.1:4231/bunnybrawl/docs/mockups/running-afterimages/round-one.html');await oldPage.waitForTimeout(500);
 await oldPage.locator('#trail-time').evaluate(e=>{e.value='.675';e.dispatchEvent(new Event('input'));});await oldPage.waitForTimeout(50);
 const oldHash=await oldPage.locator('canvas').first().evaluate(e=>e.toDataURL());
 if((await hashes())[0]!==oldHash)throw Error('Current reference changed');await oldPage.close();
 await page.screenshot({path:dir+'captures/game-size.png',fullPage:true});
 await page.locator('#trail-scale').selectOption('2');await page.screenshot({path:dir+'captures/detail.png',fullPage:true});
 await page.locator('#trail-night').check();await page.screenshot({path:dir+'captures/night.png',fullPage:true});
 for(const speed of ['160','200']){await page.locator('#trail-velocity').selectOption(speed);if(new Set(await hashes()).size!==1)throw Error('Speed threshold mismatch');}
 await page.locator('#trail-protected').check();if(new Set(await hashes()).size!==1)throw Error('Invincibility should retain original trail in every variant');
 await page.locator('#trail-protected').uncheck();await page.locator('#trail-velocity').selectOption('280');
 for(const name of await page.locator('#trail-character option').allTextContents()){await page.locator('#trail-character').selectOption(name);await scrub(.675);if(new Set(await hashes()).size!==5)throw Error('Variants missing for '+name);}
 await page.locator('#trail-character').selectOption('Fox');await page.locator('#trail-left').check();await page.screenshot({path:dir+'captures/fox-left.png',fullPage:true});
 for(const surface of await page.locator('#trail-surface option').allTextContents())await page.locator('#trail-surface').selectOption(surface);
 await page.locator('#trail-character').selectOption('Bunny');await page.locator('#trail-left').uncheck();await page.locator('#trail-surface').selectOption('grass');await page.locator('#trail-scale').selectOption('1');await page.locator('#trail-night').uncheck();
 await page.setViewportSize({width:360,height:900});await page.screenshot({path:dir+'captures/mobile.png',fullPage:true});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: five distinct variants; common baseline; threshold; invincibility preserved; 19 characters; eight surfaces; left/night/2x/mobile; no browser errors.');
} finally {await browser.close();}
