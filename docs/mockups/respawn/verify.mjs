/* global window, document, innerWidth */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(new URL('../../../package.json',import.meta.url));
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1000,height:650},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.openai={setWidgetState:async state=>{window.__choice=state}}});
const out=new URL('./captures/',import.meta.url);fs.mkdirSync(out,{recursive:true});
try{
  await page.goto(new URL('./index.html',import.meta.url).href);
  if(await page.locator('canvas').count()!==4)throw Error('Expected four comparisons');
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.evaluate(()=>{const el=document.getElementById('respawn-time');el.value='.435';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForTimeout(100);
  await page.screenshot({path:fileURLToPath(new URL('game-size.png',out)),fullPage:true});
  await page.locator('#respawn-scale').selectOption('2');
  await page.screenshot({path:fileURLToPath(new URL('detail.png',out)),fullPage:true});
  await page.locator('#respawn-night').check();
  await page.screenshot({path:fileURLToPath(new URL('night.png',out)),fullPage:true});
  await page.screenshot({path:fileURLToPath(new URL('left-wall.png',out)),fullPage:true});
  await page.locator('input[value="Current response"]').check();
  if(await page.evaluate(()=>window.__choice.modelContent.respawn)!=='Current response')throw Error('Baseline selection not saved');
  await page.locator('input[value="Confetti pop"]').check();
  if(await page.evaluate(()=>window.__choice.modelContent.respawn)!=='Confetti pop')throw Error('Selection not saved');
  const hashes=new Set();
  for(const name of await page.locator('#respawn-character option').allTextContents()){
    await page.locator('#respawn-character').selectOption(name);
    await page.waitForTimeout(40);
    hashes.add(await page.locator('canvas').first().evaluate(c=>c.toDataURL()));
    if(await page.evaluate(()=>window.__choice.modelContent.respawn)!=='Confetti pop')throw Error('Character change lost choice');
    if(['Frog','Goat','Bear'].includes(name))await page.screenshot({path:fileURLToPath(new URL(name.toLowerCase()+'.png',out)),fullPage:true});
  }
  if(hashes.size!==19)throw Error('Expected 19 distinct rendered characters, got '+hashes.size);
  for(const [time,protectedState] of [[1,true],[1.9,false]]){
    await page.evaluate(time=>{const el=document.getElementById('respawn-time');el.value=String(time);el.dispatchEvent(new Event('input',{bubbles:true}));},time);
    if(await page.locator('canvas').first().getAttribute('data-protected')!==String(protectedState))throw Error('Protection timing mismatch');
    await page.screenshot({path:fileURLToPath(new URL(protectedState?'protected.png':'unprotected.png',out)),fullPage:true});
  }
  await page.evaluate(()=>{const el=document.getElementById('respawn-time');el.value='1.35';el.dispatchEvent(new Event('input',{bubbles:true}));});
  const settled=await page.locator('canvas').evaluateAll(cs=>cs.slice(1).map(c=>c.toDataURL()));
  if(new Set(settled).size!==1)throw Error('Alternatives must settle to the same original blink');
  await page.setViewportSize({width:360,height:900});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
  await page.screenshot({path:fileURLToPath(new URL('mobile.png',out)),fullPage:true});
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: 19 distinct characters preserving choice, four panels, pause/scrub, zoom, night, saved selection, 360px layout; no browser errors.');
}finally{await browser.close();}
