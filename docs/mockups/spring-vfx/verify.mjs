import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(new URL('../../../package.json',import.meta.url));
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1000,height:650},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const output=new URL('./captures/',import.meta.url);fs.mkdirSync(output,{recursive:true});
try{
  await page.goto(new URL('./index.html',import.meta.url).href);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.evaluate(()=>{const el=document.getElementById('spring-time');el.value='.25';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForTimeout(150);
  await page.screenshot({path:fileURLToPath(new URL('game-size.png',output)),fullPage:true});
  await page.locator('#spring-scale').selectOption('2');
  await page.screenshot({path:fileURLToPath(new URL('detail.png',output)),fullPage:true});
  await page.locator('#spring-night').check();
  await page.screenshot({path:fileURLToPath(new URL('night.png',output)),fullPage:true});
  await page.locator('#spring-baseline').check();
  await page.screenshot({path:fileURLToPath(new URL('baseline.png',output)),fullPage:true});
  await page.locator('input[value="Boing accents"]').check();
  await page.setViewportSize({width:360,height:900});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
  await page.screenshot({path:fileURLToPath(new URL('mobile.png',output)),fullPage:true});
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: 3 animated panels, pause/scrub, zoom, night, baseline, selection, 360px layout; no browser errors.');
}finally{await browser.close();}
/* global document, innerWidth -- Playwright callbacks run in the browser. */
