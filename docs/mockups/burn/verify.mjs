/* global window, document, innerWidth */
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../../../package.json',import.meta.url));
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1000,height:650}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.openai={setWidgetState:async state=>{window.__choice=state}}});
const out=new URL('./captures/',import.meta.url);fs.mkdirSync(out,{recursive:true});
async function timing(value){await page.evaluate(value=>{const el=document.getElementById('burn-time');el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);await page.waitForTimeout(60);}
try{
 await page.goto(new URL('./index.html',import.meta.url).href);
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await timing(.435);
 if(await page.locator('canvas').count()!==8)throw Error('Missing variants');
 if(new Set(await page.locator('canvas').evaluateAll(cs=>cs.map(c=>c.toDataURL()))).size!==8)throw Error('Variants not distinct');
 await page.screenshot({path:fileURLToPath(new URL('game-size.png',out)),fullPage:true});
 await page.locator('#burn-scale').selectOption('2');
 await page.screenshot({path:fileURLToPath(new URL('detail.png',out)),fullPage:true});
 await page.locator('#burn-night').check();
 await page.screenshot({path:fileURLToPath(new URL('night.png',out)),fullPage:true});
 await page.locator('input[value="Ember burst"]').check();
 const hashes=new Set();
 for(const name of await page.locator('#burn-character option').allTextContents()){
  await page.locator('#burn-character').selectOption(name);await page.waitForTimeout(40);
  hashes.add(await page.locator('canvas').first().evaluate(c=>c.toDataURL()));
  if(await page.evaluate(()=>window.__choice.modelContent.burn)!=='Ember burst')throw Error('Lost choice');
 }
 if(hashes.size!==19)throw Error('Character rendering incomplete');
 for(const name of ['Scorch puff','Soot bloom','Twin chimney','Smoky spiral','Ember cough']){await page.locator('input[value='+JSON.stringify(name)+']').check();if(await page.evaluate(()=>window.__choice.modelContent.burn)!==name)throw Error('Scorch selection failed');}
 await timing(3);
 await page.screenshot({path:fileURLToPath(new URL('sustained.png',out)),fullPage:true});
 await timing(5.4);
 if(new Set(await page.locator('canvas').evaluateAll(cs=>cs.map(c=>c.toDataURL()))).size!==1)throw Error('Effects persist after recovery');
 await page.locator('#burn-character').selectOption('Bunny');await timing(.435);
 await page.setViewportSize({width:360,height:900});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Overflow');
 await page.screenshot({path:fileURLToPath(new URL('mobile.png',out)),fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: eight distinct variants, 19 characters, saved choice, pause/scrub, detail/night, sustained burn, complete recovery, 360px layout.');
}finally{await browser.close();}
