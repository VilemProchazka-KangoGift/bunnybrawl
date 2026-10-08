// Production Winter Lake renderer with only the distant backdrop overridden.
import '../../../src/i18n';
import { Renderer } from '../../../src/engine/renderer';
import { winterLake } from '../../../src/engine/arenas/packs/winterLake';
import { registerArena, toArena, toThemeConfig } from '../../../src/engine/arenas/registry';
import { registerBuiltinCharacters } from '../../../src/engine/characters';
import { getAllCharacters } from '../../../src/engine/characters/defaults';
import { registerPlayablePlushRoster } from '../../../src/engine/characters/plush/playableRoster';
import { createEmptyMatchState, createInitialPlayers } from '../../../src/engine/simulator/initialState';
import { drawBackdrop, skies, VARIANTS, type Variant } from './variants';
import { preloadIllustratedBackdrop, preloadWinterPlatformArt, getWinterPlatformArt } from '../../../src/engine/arenas/illustratedBackdropAsset';
import { drawPaintedWinterPlatform } from '../../../src/engine/arenas/packs/winterLakePaintedPlatforms';
import { drawPlatformStudyBack, drawPlatformStudyFront, isIllustratedStudy, PLATFORM_VARIANTS, type PlatformVariant } from '../winter-platforms/variants';
import { drawPaintedPlatformBack, drawPaintedPlatformFront, preloadPaintedPlatforms } from '../winter-platforms/painted';
import { drawWinterVectorPlatformBack, drawWinterVectorPlatformFront } from '../../../src/engine/arenas/packs/winterLakeVectorPlatforms';
import { drawTracedSvgBack, drawTracedSvgFront, preloadTracedBridge } from '../winter-platforms/tracedSvg';
import { drawPropStudyBack, drawPropStudyFront, PROP_VARIANTS, type PropVariant } from '../winter-props/variants';
import { drawIllustratedPropBack, drawIllustratedPropFront, ILLUSTRATED_PROP_VARIANTS, preloadPropAtlas, type IllustratedPropVariant } from '../winter-props/illustrated';

const query = new URLSearchParams(location.search);
const variant = query.get('variant') ?? 'current';
const time = query.get('time') ?? 'day';
const platformVariant = query.get('platform');
const propVariant = query.get('props');
if (!VARIANTS.includes(variant as Variant)) throw new Error(`Unknown background: ${variant}`);
if (time !== 'day' && time !== 'night') throw new Error(`Unknown time: ${time}`);
if (platformVariant && !PLATFORM_VARIANTS.includes(platformVariant as PlatformVariant)) throw new Error(`Unknown platform: ${platformVariant}`);
if (propVariant && propVariant !== 'current' && !PROP_VARIANTS.includes(propVariant as PropVariant)
  && !ILLUSTRATED_PROP_VARIANTS.includes(propVariant as IllustratedPropVariant)) throw new Error(`Unknown props: ${propVariant}`);

let seed = 7312;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

registerArena(winterLake);
registerBuiltinCharacters();
await registerPlayablePlushRoster();
const arena = toArena(winterLake);
const theme = toThemeConfig(winterLake);
await preloadIllustratedBackdrop('winter_lake');
if (propVariant && propVariant !== 'current') {
  if (ILLUSTRATED_PROP_VARIANTS.includes(propVariant as IllustratedPropVariant)) {
    await preloadPropAtlas();
    theme.drawBackgroundNature = (ctx, currentArena) => drawIllustratedPropBack(ctx, currentArena, propVariant as IllustratedPropVariant);
    theme.drawForegroundNature = (ctx, currentArena) => drawIllustratedPropFront(ctx, currentArena, propVariant as IllustratedPropVariant);
  } else {
    theme.drawBackgroundNature = (ctx, currentArena) => drawPropStudyBack(ctx, currentArena, propVariant as PropVariant);
    theme.drawForegroundNature = (ctx, currentArena) => drawPropStudyFront(ctx, currentArena, propVariant as PropVariant);
  }
}
if (platformVariant) {
  // The study's `current` background is the approved Pearl plate. Without a
  // platform query, older background comparisons retain their old baseline.
  if (platformVariant === 'painted-scalable') await preloadWinterPlatformArt();
  if (platformVariant === 'painted-sprite') await preloadPaintedPlatforms();
  if (platformVariant === 'vector-trace') await preloadTracedBridge();
  const originalBack = theme.drawPlatform;
  const originalFront = theme.drawPlatformOverlay;
  theme.drawPlatform = (ctx, platform, isGround) => {
    if (platformVariant === 'vector-replica') {
      drawWinterVectorPlatformBack(ctx, platform, isGround);
      return;
    }
    if (platformVariant === 'vector-trace') {
      drawTracedSvgBack(ctx, platform, isGround);
      return;
    }
    if (platformVariant === 'painted-scalable') {
      drawPaintedWinterPlatform(ctx, platform, isGround, false, getWinterPlatformArt());
      return;
    }
    if (platformVariant === 'painted-sprite') {
      drawPaintedPlatformBack(ctx, platform, isGround);
      return;
    }
    if (!isIllustratedStudy(platformVariant as PlatformVariant) || platform.style === 'iceCube') {
      originalBack(ctx, platform, isGround);
    }
    drawPlatformStudyBack(ctx, platform, platformVariant as PlatformVariant, isGround);
  };
  theme.drawPlatformOverlay = (ctx, platform, isGround) => {
    if (platformVariant === 'vector-replica') {
      drawWinterVectorPlatformFront(ctx, platform, isGround);
      return;
    }
    if (platformVariant === 'vector-trace') {
      drawTracedSvgFront(ctx, platform, isGround);
      return;
    }
    if (platformVariant === 'painted-scalable') {
      drawPaintedWinterPlatform(ctx, platform, isGround, true, getWinterPlatformArt());
      return;
    }
    if (platformVariant === 'painted-sprite') {
      drawPaintedPlatformFront(ctx, platform, isGround);
      return;
    }
    if (!isIllustratedStudy(platformVariant as PlatformVariant)) originalFront?.(ctx, platform, isGround);
    drawPlatformStudyFront(ctx, platform, platformVariant as PlatformVariant, isGround);
  };
}
if (variant !== 'current') {
  const selected = variant as Exclude<Variant, 'current'>;
  theme.sky = { gradient: skies[selected] };
  theme.hills = [];
  const paintedPlates = {
    'polar-silver-painted': ['./silver-banks-painted-backdrop.png', .63],
    'polar-silver-pearl-painted': ['./silver-banks-pearl-painted-plate.png', .75],
    'polar-silver-wind-painted': ['./silver-banks-wind-painted-plate.png', .63],
  } as const;
  if (selected in paintedPlates) {
    const [path, alpha] = paintedPlates[selected as keyof typeof paintedPlates];
    const backdrop = new Image();
    backdrop.src = new URL(path, import.meta.url).href;
    await backdrop.decode();
    theme.drawFarBackground = ctx => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(backdrop, 0, 0, 1280, 720);
      ctx.restore();
    };
  } else {
    theme.drawFarBackground = drawBackdrop[selected];
  }
}

function canvas(id: string): HTMLCanvasElement {
  const el = document.getElementById(id) as HTMLCanvasElement;
  el.width = 1280;
  el.height = 720;
  return el;
}

const renderer = new Renderer({
  bgCanvas: canvas('bg'), bgNightCanvas: canvas('night'), fgCanvas: canvas('fg'),
  fgNightTint: document.querySelector('.tint') as HTMLDivElement,
  lightCanvas: canvas('light'), hudCanvas: canvas('hud'), theme,
});
const state = createEmptyMatchState();
state.phase = 'playing';
state.timeElapsed = 18;
state.dayPhase = time === 'night' ? .5 : 0;
state.players = createInitialPlayers(['P1', 'P2', 'P3', 'P4', 'P5'], arena, false, Math.random);
const byName = new Map(getAllCharacters().map(character => [character.name, character]));
const placements = [
  ['Bunny', 85, 540], ['Frog', 180, 625], ['Fox', 620, 325],
  ['Wolf', 900, 625], ['Panda', 1150, 390],
] as const;
state.players.forEach((player, i) => {
  const [name, x, y] = placements[i];
  const character = byName.get(name);
  if (!character) throw new Error(`Missing ${name}`);
  player.character = character;
  player.x = x;
  player.y = y;
  player.score = 0;
  player.facing = i % 2 ? 'left' : 'right';
});
if (query.has('cover')) {
  // Player coordinates are their left edge; center each silhouette in its bush.
  state.players[0].x = 332;
  state.players[0].y = 625;
  state.players[3].x = 942;
  state.players[3].y = 625;
}
renderer.warmSpriteCache(state.players.map(player => player.character.name));
renderer.renderBackground(arena);
renderer.renderFrame(state, arena, []);
document.documentElement.dataset.ready = 'true';
