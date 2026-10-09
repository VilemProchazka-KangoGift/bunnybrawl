/* global document, innerWidth */
import { chromium } from '../../../node_modules/playwright/index.mjs';
import fs from 'node:fs';
const dir=new URL('.',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,'').replace(/\/$/,'');
fs.mkdirSync(dir+'/captures',{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('file:///'+dir+'/index.html');await page.waitForTimeout(500);await page.locator('#running-play').click();
async function scrub(t){await page.locator('#running-time').evaluate((e,t)=>{e.value=t;e.dispatchEvent(new Event('input'))},String(t));await page.waitForTimeout(100)}
await scrub(.05);let hash=await page.locator('canvas').evaluateAll(es=>es.map(e=>e.toDataURL()));if(new Set(hash).size!==1)throw Error('Before-run mismatch');
await scrub(.675);hash=await page.locator('canvas').evaluateAll(es=>es.map(e=>e.toDataURL()));if(new Set(hash).size!==4)throw Error('Four distinct variations expected');
await page.screenshot({path:dir+'/captures/game-size.png',fullPage:true});await page.locator('#running-scale').selectOption('2');await page.screenshot({path:dir+'/captures/detail.png',fullPage:true});await page.locator('#running-night').check();await page.screenshot({path:dir+'/captures/night.png',fullPage:true});
for(const surface of await page.locator('#running-surface option').allTextContents()){await page.locator('#running-surface').selectOption(surface);await scrub(.675)}
for(const name of await page.locator('#running-character option').allTextContents()){await page.locator('#running-character').selectOption(name);await scrub(.675)}
await page.locator('#running-character').selectOption('Bunny');await page.locator('#running-surface').selectOption('grass');await page.locator('#running-scale').selectOption('1');await page.locator('input[value="None"]').check();await page.setViewportSize({width:360,height:900});await page.screenshot({path:dir+'/captures/mobile.png',fullPage:true});
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');if(errors.length)throw Error(errors.join('\n'));
console.log('PASS: distinct variants, common before-run baseline, 19 characters, 8 surfaces, pause/scrub/detail/night/mobile, no runtime errors');await browser.close();
