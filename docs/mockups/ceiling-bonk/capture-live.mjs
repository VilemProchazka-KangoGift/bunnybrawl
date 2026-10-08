import {chromium} from 'playwright';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1280,height:780}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 for(const mode of ['', '&simWorker=off']){
  await page.goto('http://127.0.0.1:4209/bunnybrawl/?arena=meadow&bots=2'+mode);
  await page.waitForFunction(()=>window.__bunnyTest?.state()?.phase==='playing'&&window.__bunnyTest.state().countdown===0);
  await page.locator('[data-testid=game-canvas]').screenshot({path:'docs/mockups/ceiling-bonk/captures/mode'+(mode?'main':'worker')+'.png'});
  console.log('PASS: rendering and gameplay in '+(mode||'default simulation worker'));
 }
 await page.goto('http://127.0.0.1:4209/bunnybrawl/docs/mockups/ceiling-bonk/playtest.html');
 await page.locator('#status').filter({hasText:'Live ceiling bonk'}).waitFor();
 const game=page.frames().find(f=>f.url().includes('?arena='));
 await game.locator('[data-testid=game-canvas]').click();
 await game.evaluate(()=>{let rising=false;function sample(){const p=window.__bunnyTest.state().players.find(p=>p.id==='P1');if(p.vy<-10)rising=true;if(rising&&p.vy>=0&&p.y<520){window.__bonk=true;return}requestAnimationFrame(sample)}sample()});
 await page.keyboard.down('w');
 await game.waitForFunction(()=>window.__bonk===true,{},{timeout:10000});
 await page.screenshot({path:'docs/mockups/ceiling-bonk/captures/live-squash.png'});
 await page.keyboard.up('w');
 await page.waitForTimeout(400);
 await game.waitForFunction(()=>window.__bunnyTest.state().players.find(p=>p.id==='P1').vy>=0);
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: actual keyboard ceiling contact renders squash and settles; no browser errors');
}finally{await browser.close()}
