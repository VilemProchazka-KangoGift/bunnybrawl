import {Renderer} from '../../../src/engine/renderer.ts';
import {preloadIllustratedBackdrop} from '../../../src/engine/arenas/illustratedBackdropAsset.ts';
import {registerBuiltinArenas,getArena,getTheme} from '../../../src/engine/arenas/index.ts';
import {registerBuiltinCharacters,getAllCharacterDefs} from '../../../src/engine/characters/index.ts';
import {registerPlayablePlushRoster} from '../../../src/engine/characters/plush/playableRoster.ts';
import {makePlayer,makeState} from '../../../src/engine/__tests__/testHelpers.ts';

import {drawCue} from './variants.js';
registerBuiltinArenas();registerBuiltinCharacters();await registerPlayablePlushRoster();
const $=id=>document.getElementById(id),arena=getArena('space_station'),theme=getTheme(arena.id);
await preloadIllustratedBackdrop(arena.id);
const defs=getAllCharacterDefs();const zone=arena.effectZones.find(z=>z.type==='zero_g'),sceneArena={...arena,effectZones:arena.effectZones.filter(z=>z.type!=='zero_g')};
const surface=()=>Object.assign(document.createElement('canvas'),{width:1280,height:720});
const state=makeState({arena,countdown:0,dayPhase:0,players:[makePlayer({x:520,y:430}),makePlayer({id:'P2',character:{...defs.find(d=>d.name==='Fox'),slot:'P2'},x:750,y:540})]});
const panels=[...document.querySelectorAll('canvas')].map(canvas=>{canvas.width=1280;canvas.height=720;const bg=surface(),fg=surface(),hud=surface(),renderer=new Renderer({bgCanvas:bg,fgCanvas:fg,hudCanvas:hud,theme});renderer.renderBackground(arena);renderer.warmSpriteCache(['Bunny','Fox']);return {canvas,bg,fg,hud,renderer};});
let time=0,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,last=0;
function render(){
  state.timeElapsed=time;
  state.players.forEach((p,i)=>{p.y=(i?540:430)-Math.sin(time*1.5+i)*65;});
  panels.forEach((p,i)=>{p.renderer.renderFrame(state,sceneArena,[]);const c=p.canvas.getContext('2d');c.clearRect(0,0,1280,720);c.drawImage(p.bg,0,0);
    drawCue(c,zone,time,i);
    c.drawImage(p.fg,0,0);c.drawImage(panels[0].hud,0,0);
  });$('time').value=time;$('clock').textContent=time.toFixed(2)+'s';
}
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play';};
$('replay').onclick=()=>{time=0;playing=true;$('play').textContent='Pause';render();};
$('time').oninput=()=>{playing=false;$('play').textContent='Play';time=Number($('time').value);render();};
$('view').onchange=()=>{document.querySelector('.panels').classList.toggle('focus',$('view').value!=='all');document.querySelectorAll('section').forEach((s,i)=>s.hidden=$('view').value!=='all'&&Number($('view').value)!==i);};
$('status').textContent='Ready · production unchanged';window.__zeroGStudy={render};
function tick(now){if(playing)time=(time+Math.min(.05,(now-last)/1000)*Number($('speed').value))%8;last=now;render();requestAnimationFrame(tick);}requestAnimationFrame(tick);
