import '../../../src/i18n';
import { Renderer } from '../../../src/engine/renderer';
import { registerBuiltinArenas } from '../../../src/engine/arenas/builtin';
import { getArenaPackOrThrow, toArena, toThemeConfig } from '../../../src/engine/arenas/registry';
import { preloadIllustratedBackdrop } from '../../../src/engine/arenas/illustratedBackdropAsset';
import { registerBuiltinCharacters } from '../../../src/engine/characters';
import { getAllCharacters } from '../../../src/engine/characters/defaults';
import { registerPlayablePlushRoster } from '../../../src/engine/characters/plush/playableRoster';
import { createEmptyMatchState, createInitialPlayers } from '../../../src/engine/simulator/initialState';
import { drawStorybookPlatform, type PlatformMaterial } from '../../../src/engine/arenas/packs/castleStationPlatforms';

const query = new URLSearchParams(location.search);
registerBuiltinArenas(); registerBuiltinCharacters();
await registerPlayablePlushRoster();
const pack = getArenaPackOrThrow(query.get('arena') ?? 'treetops');
await preloadIllustratedBackdrop(pack.id);
const arena = toArena(pack), theme = toThemeConfig(pack);
const canvas = (id: string) => { const c = document.getElementById(id) as HTMLCanvasElement; c.width = 1280; c.height = 720; return c; };
const renderer = new Renderer({ bgCanvas:canvas('bg'), bgNightCanvas:canvas('night'), fgCanvas:canvas('fg'), fgNightTint:document.querySelector('.tint') as HTMLDivElement, lightCanvas:canvas('light'), hudCanvas:canvas('hud'), theme });
const state = createEmptyMatchState();
state.phase = 'playing'; state.timeElapsed = 18;
state.dayPhase = query.get('time') === 'night' ? .5 : query.get('time') === 'sunset' ? .25 : 0;
state.players = createInitialPlayers(['P1','P2','P3','P4','P5'], arena, false, () => .4);
const names = ['Bunny','Frog','Fox','Wolf','Panda'];
const characters = new Map(getAllCharacters().map(c => [c.name,c]));
state.players.forEach((p,i) => {
  p.character = characters.get(names[i])!;
  const platform = pack.platforms.filter(p => p.width >= 80)[i % pack.platforms.filter(p => p.width >= 80).length];
  p.x = platform.x + platform.width * .45; p.y = platform.y - 32;
  p.facing = i % 2 ? 'left' : 'right';
});
renderer.warmSpriteCache(names);
renderer.renderBackground(arena); renderer.renderFrame(state,arena,[]);
if (query.has('benchmark')) {
  // Isolate construction cost from animation, physics and cached compositing.
  const surface = document.createElement('canvas');
  surface.width = 1280; surface.height = 720;
  const context = surface.getContext('2d')!;
  const samples: number[] = [];
  for (let sample = 0; sample < 14; sample++) {
    const start = performance.now();
    for (let repeat = 0; repeat < 10; repeat++) {
      context.clearRect(0, 0, 1280, 720);
      for (const platform of pack.platforms) {
        const ground = platform.y >= 650;
        pack.drawPlatform(context, platform, ground);
        pack.drawPlatformOverlay?.(context, platform, ground);
      }
    }
    if (sample >= 2) samples.push((performance.now() - start) / 10);
  }
  samples.sort((a,b) => a-b);
  document.documentElement.dataset.drawMedianMs = String((samples[5] + samples[6]) / 2);
  document.documentElement.dataset.drawMaxMs = String(samples.at(-1));
}
if (query.has('sizes')) {
  // Separate geometry review; collision guides are never part of runtime art.
  const c = canvas('fg').getContext('2d')!;
  c.fillStyle = '#dce3e4'; c.fillRect(0,0,1280,720);
  const materials: PlatformMaterial[] = ['limestone','alloy'];
  materials.forEach((material,i) => {
    const y=40+i*60;
    c.fillStyle='#26343c';c.font='14px sans-serif';c.fillText(material,8,y+16);
    let x=110;
    for (const width of [40,65,120,240,400]) {
      drawStorybookPlatform(c,{x,y,width,height:24},material);
      c.strokeStyle='#e18129';c.lineWidth=1;c.beginPath();c.moveTo(x,y);c.lineTo(x+width,y);c.stroke();
      x+=width+16;
    }
    drawStorybookPlatform(c,{x:1080,y:y-8,width:65,height:55},material);
  });
}
document.documentElement.dataset.ready='true';
