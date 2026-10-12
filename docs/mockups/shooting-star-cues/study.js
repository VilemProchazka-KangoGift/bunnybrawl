import {Renderer} from '../../../src/engine/renderer.ts';
import {preloadIllustratedBackdrop} from '../../../src/engine/arenas/illustratedBackdropAsset.ts';
import {registerBuiltinArenas,getArena,getTheme} from '../../../src/engine/arenas/index.ts';
import {registerBuiltinCharacters,getAllCharacterDefs} from '../../../src/engine/characters/index.ts';
import {registerPlayablePlushRoster} from '../../../src/engine/characters/plush/playableRoster.ts';
import {makePlayer,makeState} from '../../../src/engine/__tests__/testHelpers.ts';

import {drawCue,starAt} from './variants.js';
registerBuiltinArenas();registerBuiltinCharacters();await registerPlayablePlushRoster();
const $=id=>document.getElementById(id),arena=getArena('meadow'),originalTheme=getTheme(arena.id),theme=originalTheme;
await preloadIllustratedBackdrop(arena.id);
const defs=getAllCharacterDefs();const sceneArena=arena;
const surface=()=>Object.assign(document.createElement('canvas'),{width:1280,height:720});
const state=makeState({arena,countdown:0,dayPhase:0.5,players:[makePlayer({x:520,y:430}),makePlayer({id:'P2',character:{...defs.find(d=>d.name==='Fox'),slot:'P2'},x:750,y:540})]});
const panels=[...document.querySelectorAll('canvas')].map(canvas=>{canvas.width=1280;canvas.height=720;const bg=surface(),bgNight=surface(),fg=surface(),hud=surface();let nightOpacity=0;const renderer=new Renderer({bgCanvas:bg,bgNightCanvas:bgNight,fgCanvas:fg,hudCanvas:hud,theme,nightOpacityCallback:(kind,opacity)=>{if(kind==='bg')nightOpacity=opacity;}});renderer.renderBackground(arena);renderer.warmSpriteCache(['Bunny','Fox']);return {canvas,bg,bgNight,fg,hud,renderer,get nightOpacity(){return nightOpacity;}};});
let time=0,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,last=0;
function render(){
  state.timeElapsed=time;
  state.players.forEach((p,i)=>{p.y=(i?540:430)-Math.sin(time*1.5+i)*65;});
  panels.forEach((p,i)=>{const star=starAt(time);state.shootingStars=i===0&&star?[star]:[];p.renderer.renderFrame(state,sceneArena,[]);const c=p.canvas.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,1280,720);c.drawImage(p.bg,0,0,1280,720);
    c.globalAlpha=p.nightOpacity;c.drawImage(p.bgNight,0,0,1280,720);c.globalAlpha=1;c.drawImage(p.fg,0,0,1280,720);
    if(i!==0)drawCue(c,time,i);
    c.drawImage(panels[0].hud,0,0,1280,720);
  });$('time').value=time;$('clock').textContent=time.toFixed(2)+'s';
}
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play';};
$('replay').onclick=()=>{time=0;playing=true;$('play').textContent='Pause';render();};
$('time').oninput=()=>{playing=false;$('play').textContent='Play';time=Number($('time').value);render();};
$('view').onchange=()=>{document.querySelectorAll('.panels').forEach(p=>p.classList.toggle('focus',$('view').value!=='all'));document.querySelectorAll('section').forEach((s,i)=>s.hidden=$('view').value!=='all'&&Number($('view').value)!==i);};
$('status').textContent='Ready · production unchanged';window.__shootingStarStudy={render};
function tick(now){if(playing)time=(time+Math.min(.05,(now-last)/1000)*Number($('speed').value))%8;last=now;render();requestAnimationFrame(tick);}requestAnimationFrame(tick);
