import {Renderer} from '../../../src/engine/renderer.ts';
import {preloadIllustratedBackdrop} from '../../../src/engine/arenas/illustratedBackdropAsset.ts';
import {registerBuiltinArenas,getArena,getTheme} from '../../../src/engine/arenas/index.ts';
import {registerBuiltinCharacters,getAllCharacterDefs} from '../../../src/engine/characters/index.ts';
import {registerPlayablePlushRoster} from '../../../src/engine/characters/plush/playableRoster.ts';
import {makePlayer,makeState} from '../../../src/engine/__tests__/testHelpers.ts';

import {drawCue,weatherAt} from './variants.js';
registerBuiltinArenas();registerBuiltinCharacters();await registerPlayablePlushRoster();
const $=id=>document.getElementById(id),arena=getArena('meadow'),originalTheme=getTheme(arena.id),theme=originalTheme;
await preloadIllustratedBackdrop(arena.id);
const defs=getAllCharacterDefs();const sceneArena=arena;
const surface=()=>Object.assign(document.createElement('canvas'),{width:1280,height:720});
const state=makeState({arena,countdown:0,dayPhase:0,players:[makePlayer({x:520,y:430}),makePlayer({id:'P2',character:{...defs.find(d=>d.name==='Fox'),slot:'P2'},x:750,y:540})]});
const panels=[...document.querySelectorAll('.scene')].map((canvas,index)=>{canvas.width=1280;canvas.height=720;const bg=surface(),bgNight=surface(),fg=surface(),hud=surface();let nightOpacity=0;const renderer=new Renderer({bgCanvas:bg,bgNightCanvas:bgNight,fgCanvas:fg,hudCanvas:hud,theme:{...theme,drawWeatherParticle:(c,w)=>drawCue(c,[w],index,originalTheme)},nightOpacityCallback:(kind,opacity)=>{if(kind==='bg')nightOpacity=opacity;}});renderer.renderBackground(arena);renderer.warmSpriteCache(['Bunny','Fox']);return {canvas,bg,bgNight,fg,hud,renderer,get nightOpacity(){return nightOpacity;}};});
const details=[...document.querySelectorAll('.detail')];
let time=0,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,last=0;
function render(){
  state.timeElapsed=time;state.dayPhase=Number($('lighting').value);
  state.weather=weatherAt(time);
  state.players.forEach((p,i)=>{p.y=(i?540:430)-Math.sin(time*1.5+i)*65;});
  panels.forEach((p,i)=>{p.renderer.renderFrame(state,sceneArena,[]);const c=p.canvas.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,1280,720);c.drawImage(p.bg,0,0,1280,720);
    c.globalAlpha=p.nightOpacity;c.drawImage(p.bgNight,0,0,1280,720);c.globalAlpha=1;c.drawImage(p.fg,0,0,1280,720);

    c.drawImage(panels[0].hud,0,0,1280,720);
    const detail=details[i].getContext('2d');detail.setTransform(1,0,0,1,0,0);detail.clearRect(0,0,320,56);
    details[i].style.background=state.dayPhase?'#384e68':'#dae9ef';
    detail.fillStyle=state.dayPhase?'#f4f5f8':'#332b25';detail.font='12px system-ui';
    detail.fillText(i===3?'No petals · leaves still drift':'8× detail',8,16);
    if(i!==3)for(let j=0;j<3;j++){
      detail.setTransform(8,0,0,8,111+j*76,29);
      drawCue(detail,[{type:'petal',x:0,y:0,vx:0,vy:0,size:3,rotation:time*.9+j*.8,rotSpeed:0}],i,originalTheme);
    }
  });$('time').value=time;$('clock').textContent=time.toFixed(2)+'s';
}
$('lighting').onchange=render;
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play';};
$('replay').onclick=()=>{time=0;playing=true;$('play').textContent='Pause';render();};
$('time').oninput=()=>{playing=false;$('play').textContent='Play';time=Number($('time').value);render();};
$('view').onchange=()=>{document.querySelectorAll('.panels').forEach(p=>p.classList.toggle('focus',$('view').value!=='all'));document.querySelectorAll('section').forEach((s,i)=>s.hidden=$('view').value!=='all'&&Number($('view').value)!==i);};
$('status').textContent='Ready · production unchanged';window.__petalStudy={render};
function tick(now){if(playing)time=(time+Math.min(.05,(now-last)/1000)*Number($('speed').value))%8;last=now;render();requestAnimationFrame(tick);}requestAnimationFrame(tick);
