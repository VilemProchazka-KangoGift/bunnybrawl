/* global window, document, innerWidth */
import { chromium } from '../../../node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));fs.mkdirSync(dir+'captures',{recursive:true});
const source=execFileSync('git', ['show', '43671a41:src/engine/rendering/players.ts'], {encoding:'utf8'}).replace(/\r\n/g,'\n');
const tint=source.split('// Red tint pulse overlay when hit by thorns (non-lava)')[1].split('    ctx.fill();')[0]+'    ctx.fill();';
const expected='function drawCurrentTint(ctx,player){const {x,y,width,height,slowTimer}=player;const cx=x+width/2;'+tint+'\n}\n';
if(fs.readFileSync(dir+'baseline-tint.ts.txt','utf8')!==expected)throw Error('Frozen current tint drifted');
const opacity=source.split('  // Thorn slow tint\n')[1].split('  // Red pulse overlay')[0];
if(fs.readFileSync(dir+'baseline-opacity.ts.txt','utf8')!=='function drawCurrentOpacity(ctx,slowTimer){\n'+opacity+'}\n')throw Error('Frozen opacity drifted');
const burn=source.split('  if (player.burnTimer > 0) {')[1].split('  } else if (drawRedPulse)')[0];
if(fs.readFileSync(dir+'baseline-burn.ts.txt','utf8')!=='function drawBurnContext(ctx,player){const {x,y,width,height}=player;const cx=x+width/2;'+burn+'}\n')throw Error('Frozen burn context drifted');
if(fs.readFileSync(dir+'baseline-wisps.ts.txt','utf8')!==fs.readFileSync(new URL('../../../src/engine/rendering/burnEffects.ts',import.meta.url),'utf8').replace(/\r\n/g,'\n'))throw Error('Frozen wisps drifted');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1040,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4253/bunnybrawl/docs/mockups/thorn-slow-tint/index.html',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__slowStudy?.ready());
 async function scrub(t){await page.locator('#time').evaluate((e,t)=>{e.value=t;e.dispatchEvent(new Event('input'));},String(t));await page.waitForTimeout(70);}
 const hashes=()=>page.locator('canvas').evaluateAll(es=>es.map(e=>e.toDataURL()));
 await scrub(.2);if(new Set(await hashes()).size!==1)throw Error('Pre-cue frames differ');
 await scrub(.65);if(new Set(await hashes()).size!==8)throw Error('Need eight distinct options');await page.screenshot({path:dir+'captures/game-size.png',fullPage:true});
 await page.locator('#scale').selectOption('2');await page.screenshot({path:dir+'captures/detail.png',fullPage:true});await scrub(.392);if(new Set(await hashes()).size!==8)throw Error('Peak pulse variants missing');await page.locator('.panels').nth(1).screenshot({path:dir+'captures/combined-detail.png'});await scrub(.65);await page.locator('#night').check();await page.screenshot({path:dir+'captures/night.png',fullPage:true});await page.locator('#night').uncheck();
 for(const name of await page.locator('#character option').allTextContents()){await page.locator('#character').selectOption(name);for(const pose of ['idle','run','jump']){await page.locator('#mode').selectOption(pose);await scrub(.65);const frames=await hashes();if(new Set(frames).size!==8)throw Error('Variant/baseline mismatch for '+name+' '+pose);}}await page.locator('#mode').selectOption('idle');for(const name of ['Horse','Frog','Owl','Cat']){await page.locator('#character').selectOption(name);await scrub(.65);await page.screenshot({path:dir+'captures/'+name.toLowerCase()+'.png',fullPage:true});}
 await page.locator('#character').selectOption('Bunny');await page.locator('#mode').selectOption('run');await scrub(.65);if(new Set(await hashes()).size!==8)throw Error('Run pose missing variants');await page.screenshot({path:dir+'captures/run-pose.png',fullPage:true});await page.locator('#mode').selectOption('idle');await page.locator('#shared').uncheck();await scrub(.65);if(new Set(await hashes()).size!==8)throw Error('Tint disappears without opacity pulse');await page.screenshot({path:dir+'captures/isolated.png',fullPage:true});
 await page.locator('#shared').check();await page.locator('#left').check();await scrub(.95);if(new Set(await hashes()).size!==8)throw Error('Left-facing overlay missing');await page.screenshot({path:dir+'captures/left.png',fullPage:true});
 await scrub(5.7);if(new Set(await hashes()).size!==1)throw Error('Overlay survives cue expiry');await page.locator('#shared').check();if(new Set(await hashes()).size!==1)throw Error('Shared cue survives expiry');
 await page.locator('#burn').check();await scrub(.65);if(new Set(await hashes()).size!==1)throw Error('Thorn tint survives burn suppression');await page.screenshot({path:dir+'captures/burn-overlap.png',fullPage:true});await page.locator('#burn').uncheck();await page.locator('#mode').selectOption('jump');await scrub(.65);if(new Set(await hashes()).size!==8)throw Error('Jump variants missing');await page.screenshot({path:dir+'captures/jump-pose.png',fullPage:true});await page.locator('#scale').selectOption('1');await scrub(.65);await page.setViewportSize({width:360,height:1000});await page.screenshot({path:dir+'captures/mobile.png',fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: frozen current tint, eight distinct options, all 19 characters, opacity on/off, pre/post cue, idle/run/jump, burn suppression, left/night/native/2x/mobile; no browser errors');
}finally{await browser.close();}
