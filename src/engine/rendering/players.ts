import type { Player, PlayerState } from '../types';
import type { ThemeConfig } from '../themes/types';
import { FAT_SCALE, HITSTOP_DURATION, MAX_WALK_SPEED, PLAYER_WIDTH, PLAYER_HEIGHT } from '../constants';
import { hasCustomEyes, getSpriteRenderer, getCharacterPack, drawLegs } from '../characters';
import { drawHighlightSpot } from '../spriteShading';
import { getSlowDevice } from '../perfFlags';
import { hexToRGB } from '../fastMath';
import { getIdleAction, type IdleAction } from './idleActions';

// Sprite cache: key -> OffscreenCanvas with pre-drawn character sprite.
// Backing-store dims include the current render scale; cleared on scale change.
const spriteCache = new Map<number, OffscreenCanvas>();
let _spriteScale = 1;
const SPRITE_CACHE_CAP_BASE = 600;
let _spriteCacheCap = SPRITE_CACHE_CAP_BASE;

/** Below this fast-fall smear alpha, skip drawing. Used both as the visible
 *  threshold for the per-frame "is the smudge still on screen?" check and as
 *  the inner early-return in drawFastFallStreaks. */
const FASTFALL_ALPHA_EPSILON = 0.01;

// Pack-name → small int, populated lazily. 5-bit field allows 32 entries; pack
// registry caps below that (17 chars + fallbacks).
const _charNameToIndex = new Map<string, number>();
let _nextCharIndex = 0;
function charIndex(name: string): number {
  let idx = _charNameToIndex.get(name);
  if (idx === undefined) {
    idx = _nextCharIndex++;
    _charNameToIndex.set(name, idx);
  }
  return idx;
}

const _stateIndex: Record<PlayerState, number> = {
  idle: 0, run: 1, airborne: 2, splat: 3, respawning: 4,
};

// Pre-rendered shadow ellipse — replaces a per-player-per-frame ellipse path
// (5 players × 60+fps = thousands of ellipse calls). Per-call cost becomes
// `globalAlpha = a; drawImage(...)` — modulated alpha + scaled blit.
// Source bitmap is at logical 20×4 (the max ellipse extent at shadowScale=1);
// drawImage scales down smoothly for smaller shadowScale values.
let _shadowCache: OffscreenCanvas | null = null;
function getShadowCache(): OffscreenCanvas | null {
  if (_shadowCache) return _shadowCache;
  if (typeof OffscreenCanvas === 'undefined') return null;
  _shadowCache = new OffscreenCanvas(20, 4);
  const c = _shadowCache.getContext('2d')!;
  c.fillStyle = '#000000';
  c.beginPath();
  c.ellipse(10, 2, 10, 2, 0, 0, Math.PI * 2);
  c.fill();
  return _shadowCache;
}

// Burn fire-glow radial gradient. Player burnTimer triggers ~1.5s of per-frame
// radial-gradient ellipse fills. Bake once at full alpha; per-call modulates
// with globalAlpha = fireAlpha. ~50×48 pixel ellipse → previously ~2400 per-pixel
// gradient evaluations per burning player per frame.
const FIRE_CACHE_W = 64;
const FIRE_CACHE_H = 64;
let _fireCache: OffscreenCanvas | null = null;
function getFireCache(): OffscreenCanvas | null {
  if (_fireCache) return _fireCache;
  if (typeof OffscreenCanvas === 'undefined') return null;
  _fireCache = new OffscreenCanvas(FIRE_CACHE_W, FIRE_CACHE_H);
  const c = _fireCache.getContext('2d')!;
  const cx = FIRE_CACHE_W / 2, cy = FIRE_CACHE_H / 2;
  const grad = c.createRadialGradient(cx, cy, 0, cx, cy, FIRE_CACHE_W / 2);
  grad.addColorStop(0, 'rgba(255, 200, 0, 0.6)');
  grad.addColorStop(0.5, 'rgba(255, 100, 0, 0.4)');
  grad.addColorStop(1, 'rgba(255, 50, 0, 0)');
  c.fillStyle = grad;
  c.fillRect(0, 0, FIRE_CACHE_W, FIRE_CACHE_H);
  return _fireCache;
}

// Fast-fall vertical streak. Linear gradient (player-color, fade top→bottom)
// over a lozenge-shape path. Variable lean per draw, but the gradient itself
// is just bottom-up alpha ramp. Bake one 1×N strip per player color; clip
// the lozenge path and drawImage stretched.
const FASTFALL_STRIP_H = 70;
const _fastfallStripCache = new Map<string, OffscreenCanvas>();
function getFastfallStrip(color: string): OffscreenCanvas | null {
  let cache = _fastfallStripCache.get(color);
  if (cache) return cache;
  if (typeof OffscreenCanvas === 'undefined') return null;
  const { r, g, b } = hexToRGB(color);
  cache = new OffscreenCanvas(1, FASTFALL_STRIP_H);
  const c = cache.getContext('2d')!;
  const grad = c.createLinearGradient(0, 0, 0, FASTFALL_STRIP_H);
  grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
  grad.addColorStop(0.4, `rgba(${r},${g},${b},0.32)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0.85)`);
  c.fillStyle = grad;
  c.fillRect(0, 0, 1, FASTFALL_STRIP_H);
  _fastfallStripCache.set(color, cache);
  return cache;
}


export function clearSpriteCache(): void {
  spriteCache.clear();
}

function darken(hex: string, factor: number): string {
  const { r, g, b } = hexToRGB(hex);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

// Outline color is derived from char.color, NOT pack.darkColor — darkColor is the
// body-shading base, and for high-contrast packs (tiger stripes, panda patches)
// it's a near-black spot color that reads as a heavy black outline. Darkening
// the body primary keeps the outline visibly tied to the character without
// dropping to spot-color black.
const OUTLINE_DARKEN = 0.8;

const OUTLINE_OFFSETS_4: ReadonlyArray<readonly [number, number]> = [[-1,0],[1,0],[0,-1],[0,1]];

const KILL_STREAK_FLAME_COLORS = [
  'rgba(255, 100, 0, 0.3)',
  'rgba(255, 60, 0, 0.25)',
  'rgba(255, 200, 0, 0.2)',
  'rgba(255, 0, 0, 0.2)',
] as const;

const AIR_LEAN_MAX_RAD = 0.14;     // ~8° at full air speed
const RUN_LEAN_MAX_RAD = 0.06;     // ~3.4° at full ground speed — subtler than the jump lean

/** Bake an outline into the cached sprite by stamping its silhouette at 4 offsets in
 *  the outline color, behind the original pixels. The silhouette is captured by
 *  cloning the sprite to a temp canvas then tinting it via `source-in`. */
function applyOutlineToCache(cached: OffscreenCanvas, color: string): void {
  const w = cached.width;
  const h = cached.height;
  if (w === 0 || h === 0) return;
  const sctx = cached.getContext('2d');
  if (!sctx) return;

  // Tinted silhouette via source-in.
  const temp = new OffscreenCanvas(w, h);
  const tctx = temp.getContext('2d');
  if (!tctx) return;
  tctx.drawImage(cached, 0, 0);
  tctx.globalCompositeOperation = 'source-in';
  tctx.fillStyle = color;
  tctx.fillRect(0, 0, w, h);

  sctx.save();
  // Drop the cache canvas's scale+translate transform from the original draw —
  // we want raw-pixel offsets here, not logical coords.
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalCompositeOperation = 'destination-over';
  // Outline width scales with sprite cache scale so it stays 1px in logical units.
  const px = _spriteScale;
  for (const [dx, dy] of OUTLINE_OFFSETS_4) {
    sctx.drawImage(temp, dx * px, dy * px);
  }
  sctx.restore();
}

/** Set the current render scale for new sprite cache entries. Clears the cache if the scale changed. */
export function setSpriteCacheScale(scale: number): void {
  if (scale === _spriteScale) return;
  _spriteScale = scale;
  _spriteCacheCap = Math.max(50, Math.round(SPRITE_CACHE_CAP_BASE / (scale * scale)));
  spriteCache.clear();
}

/** Pre-populate the sprite cache for the given character names by drawing a
 *  handful of common (state, animFrame) combinations into a throwaway canvas.
 *  First-render sprite-cache misses are the #1 source of first-frame hitches,
 *  so the loading phase does this work up front.
 *
 *  `theme` MUST match the theme used at match render time. Bubble-helmet arenas
 *  bake the glass dome into the cached bitmap; the cache key includes a helmet
 *  bit so cross-theme reuse is safe, but warming under the wrong theme still
 *  doubles the cache footprint. */
export function warmSpriteCacheForCharacters(names: string[], theme?: ThemeConfig): void {
  const states: PlayerState[] = ['idle', 'run', 'airborne'];
  const animFrames = [0, 2, 4];

  const cw = PLAYER_WIDTH + 20;
  const ch = PLAYER_HEIGHT + 20;
  const scratch = new OffscreenCanvas(cw, ch);
  const sctx = scratch.getContext('2d');
  if (!sctx) return;
  const ctx = sctx as unknown as CanvasRenderingContext2D;

  // idleAction = -1 short-circuits the idle-action overlay path in
  // drawCharacterSprite/blitWithIdleTransform, so the stub player is never read.
  const stubPlayer = {} as Player;
  for (const name of names) {
    const pack = getCharacterPack(name);
    if (!pack) continue;
    const char = { name, color: pack.color, darkColor: pack.darkColor, lightColor: pack.lightColor };
    for (const state of states) {
      for (const frame of animFrames) {
        drawCharacterSprite(ctx, 0, 0, PLAYER_WIDTH, PLAYER_HEIGHT, char, state, frame, false, -1, 0, 0, 1, theme, stubPlayer);
      }
    }
  }
}

export function drawPlayer(ctx: CanvasRenderingContext2D, player: Player, nearCarrot: boolean, theme: ThemeConfig, frameTime: number): void {
  const { width, height, character, state, facing, invincibleTimer, animFrame, fastFalling, fatTimer, slowTimer } = player;
  // Apply visual correction offset from rollback smoothing
  const x = player.x + player.renderOffsetX;
  const y = player.y + player.renderOffsetY;

  const cx = x + width / 2;
  const cy = y + height;

  // Character shadow — projected onto ground/platform below, shrinks with height
  if (state !== 'splat' && state !== 'respawning') {
    let shadowY = 660;
    if (state === 'idle' || state === 'run') {
      shadowY = cy;
    } else {
      shadowY = Math.min(cy + 200, 660);
    }
    const heightAboveShadow = Math.max(0, shadowY - cy);
    const shadowScale = Math.max(0.3, 1 - heightAboveShadow / 200);
    const shadowAlpha = 0.2 * shadowScale;
    // Skip when essentially invisible (high airborne with low scale).
    if (shadowAlpha >= 0.05) {
      const cache = getShadowCache();
      if (cache) {
        // Multiply against entry alpha so a globalAlpha set by a caller
        // (e.g. invincibility blink) still attenuates the shadow.
        const entryAlpha = ctx.globalAlpha;
        ctx.globalAlpha = entryAlpha * shadowAlpha;
        const w = 20 * shadowScale, h = 4 * shadowScale;
        ctx.drawImage(cache, cx - w / 2, shadowY - h / 2, w, h);
        ctx.globalAlpha = entryAlpha;
      } else {
        ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
        ctx.beginPath();
        ctx.ellipse(cx, shadowY, 10 * shadowScale, 2 * shadowScale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Kill streak flame aura (d) -- drawn behind character sprite
  if (player.killStreak >= 3 && !getSlowDevice()) {
    const now = frameTime / 1000;
    for (let i = 0; i < 4; i++) {
      const angle = now * 3 + i * 1.5;
      const flameX = cx + Math.sin(angle) * 8;
      const flameY = y + height * 0.3 + Math.cos(angle * 1.3) * 4;
      const flameR = 8 + Math.sin(angle * 2) * 3;
      ctx.fillStyle = KILL_STREAK_FLAME_COLORS[i];
      ctx.beginPath();
      ctx.arc(flameX, flameY, flameR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.save();

  if (invincibleTimer > 0 && Math.floor(invincibleTimer * 10) % 2 === 0) {
    ctx.globalAlpha = 0.5;
  }

  // Thorn slow tint
  if (slowTimer > 0) {
    ctx.globalAlpha = Math.max(ctx.globalAlpha ?? 1, 0) * (0.7 + Math.sin(slowTimer * 8) * 0.15);
  }

  // Red pulse overlay when slowed by thorns
  const drawRedPulse = slowTimer > 0;

  // Squash/stretch from landing/jumping (centered on feet)
  const squashScale = player.squashScale;
  const sideSquash = player.sideSquash;
  const hasSideSquash = sideSquash !== 1;
  if (squashScale !== 1 || hasSideSquash) {
    const ssX = (1 + (1 - squashScale) * 0.5) * (hasSideSquash ? sideSquash : 1);
    const ssY = squashScale * (hasSideSquash ? 1 + (1 - sideSquash) * 0.4 : 1); // taller when side-squashed
    ctx.translate(cx, cy);
    ctx.scale(ssX, ssY);
    ctx.translate(-cx, -cy);
  }

  // Fat scaling
  const isFat = fatTimer > 0;
  if (isFat) {
    ctx.translate(cx, cy);
    ctx.scale(FAT_SCALE, FAT_SCALE);
    ctx.translate(-cx, -cy);
  }

  if (facing === 'left') {
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-cx, 0);
  }

  // Body lean tracks vx continuously. Magnitude lerps RUN→AIR via `airLean`, so the
  // ground/air transition has no visible snap. Applied AFTER the facing flip, so the
  // sign is negated for facing-left to keep world-space tilt aligned with `vx`.
  const facingSign = facing === 'left' ? -1 : 1;
  const leanMaxRad = RUN_LEAN_MAX_RAD + (AIR_LEAN_MAX_RAD - RUN_LEAN_MAX_RAD) * player.airLean;
  const leanRad = Math.max(-1, Math.min(1, player.vx / MAX_WALK_SPEED)) * leanMaxRad * facingSign;

  if (state === 'splat') {
    drawSplatCharacter(ctx, x, y, width, height, character.color, character.darkColor);
  } else {
    const pivotY = cy - height / 2;
    ctx.save();
    ctx.translate(cx, pivotY);
    ctx.rotate(leanRad);
    ctx.translate(-cx, -pivotY);
    drawCharacterSprite(ctx, x, y, width, height, character, state, animFrame, fastFalling, player.idleAction, player.idleActionTimer, player.idleActionDuration, player.squashScale, theme, player);
    ctx.restore();
    // Motion / fast-fall lines drawn OUTSIDE the sprite cache so the outline pass doesn't stamp them.
    // "Actively" fast-falling means the boolean is set AND the player is moving
    // downward — covers stomp/spring/geyser/bouncy bounces, which leave fastFalling
    // true (down still held) but reverse vy. While fading (alpha>0 but not actively
    // diving), anchor at the position fast-fall stopped so the smudge dissolves in
    // place instead of riding the bounce upward. Captured here (60Hz) rather than
    // in cosmeticStep (~30Hz) to catch the transition without a one-frame lag.
    const fastFallAlpha = player.fastFallStreakAlpha;
    const activelyFastFalling = fastFalling && player.vy >= 0;
    if (activelyFastFalling) {
      player.fastFallAnchorX = NaN;
      player.fastFallAnchorY = NaN;
    } else if (fastFallAlpha > 0 && !Number.isFinite(player.fastFallAnchorX)) {
      player.fastFallAnchorX = cx;
      player.fastFallAnchorY = y;
    }
    if (state === 'airborne' && !activelyFastFalling && fastFallAlpha <= FASTFALL_ALPHA_EPSILON) {
      drawMotionLines(ctx, cx, y + height);
    } else if (activelyFastFalling || fastFallAlpha > FASTFALL_ALPHA_EPSILON) {
      const anchored = !activelyFastFalling && Number.isFinite(player.fastFallAnchorX);
      const smearCx = anchored ? player.fastFallAnchorX : cx;
      const smearY = anchored ? player.fastFallAnchorY : y;
      // Lean reads as motion blur — drop it once anchored so the smudge sits still.
      const smearVx = anchored ? 0 : player.vx;
      drawFastFallStreaks(ctx, smearCx, smearY, character.color, smearVx, fastFallAlpha);
    }
    drawExpression(ctx, player, frameTime);
  }

  // White flash on killed character during hitstop
  if (player.hitstopTimer > 0 && state === 'splat') {
    const flashAlpha = Math.min(0.85, player.hitstopTimer / HITSTOP_DURATION);
    ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, y + height - 4, width * 0.6, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Blush near carrot (c)
  if (nearCarrot && state !== 'splat') {
    ctx.fillStyle = 'rgba(255, 150, 180, 0.45)';
    ctx.beginPath();
    ctx.ellipse(cx - 8, y + height * 0.52, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 10, y + height * 0.52, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fire glow overlay when burning from lava. Bake-once + globalAlpha modulation
  // — see getFireCache. Original used createRadialGradient(...,radius=rx) inside
  // an ellipse(rx,ry) path; since the gradient fades to 0 at radius=rx and ry>rx,
  // the visible circular region is fully contained in the ellipse. Drawing the
  // baked cache to a square (2rx × 2rx) preserves the visual without an ellipse
  // clip path. Fallback for envs without OffscreenCanvas.
  if (player.burnTimer > 0) {
    const fireAlpha = Math.min(0.4, player.burnTimer * 0.5) * (0.6 + Math.sin(player.burnTimer * 12) * 0.4);
    const fireCache = getFireCache();
    const ellRx = width * 0.7;
    const ellCy = y + height * 0.4;
    if (fireCache) {
      ctx.globalAlpha = fireAlpha;
      ctx.drawImage(fireCache, cx - ellRx, ellCy - ellRx, ellRx * 2, ellRx * 2);
      ctx.globalAlpha = 1;
    } else {
      const ellRy = height * 0.6;
      const grad = ctx.createRadialGradient(cx, ellCy, 0, cx, ellCy, ellRx);
      grad.addColorStop(0, `rgba(255, 200, 0, ${fireAlpha * 0.6})`);
      grad.addColorStop(0.5, `rgba(255, 100, 0, ${fireAlpha * 0.4})`);
      grad.addColorStop(1, `rgba(255, 50, 0, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, ellCy, ellRx, ellRy, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (drawRedPulse) {
    // Red tint pulse overlay when hit by thorns (non-lava)
    const pulseAlpha = Math.abs(Math.sin(slowTimer * 8)) * 0.3;
    ctx.fillStyle = `rgba(255, 0, 0, ${pulseAlpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, y + height * 0.5, width * 0.5, height * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Damage direction indicator (l)
  if (player.damageFlashTimer > 0 && player.damageFlashSide) {
    const flashAlpha = Math.min(0.5, player.damageFlashTimer * 3);
    const flashX = player.damageFlashSide === 'left' ? x : x + width - 4;
    ctx.fillStyle = `rgba(255, 0, 0, ${flashAlpha})`;
    ctx.fillRect(flashX, y, 4, height);
  }

  ctx.restore();
}

function drawCharacterSprite(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  char: { name: string; color: string; darkColor: string; lightColor: string },
  state: PlayerState, animFrame: number, fastFalling: boolean,
  idleAction: number, idleActionTimer: number, idleActionDuration: number,
  squashScale: number,
  theme: ThemeConfig | undefined,
  player: Player,
): void {
  const sqKey = Math.round(squashScale * 10);
  // Helmet bit prevents bubble-helmet arenas (underwater, space_station) from
  // poisoning the cache: helmet is baked in at draw time, so a helmet-less
  // first render would otherwise be reused at the helmet variant.
  const helmetKey = theme?.bubbleHelmet ? 1 : 0;
  // Packed bitfield: char(5) | state(3) | animFrame(4) | fastFalling(1) | sqKey(5) | helmet(1)
  const cacheKey =
    (charIndex(char.name) & 0x1F) |
    (_stateIndex[state] << 5) |
    ((animFrame & 0xF) << 8) |
    ((fastFalling ? 1 : 0) << 12) |
    ((sqKey & 0x1F) << 13) |
    (helmetKey << 18);

  // Idle action ctx transform — applied to main ctx, OUTSIDE the cached bitmap, so the
  // animated transform doesn't get baked into the (1-bit-keyed) sprite cache entry.
  // Resolved lazily so non-idle players (the common case) skip allocation + save/restore.
  const idleAnimAction = (idleAction >= 0 && state !== 'run' && state !== 'airborne')
    ? getIdleAction(char.name, idleAction)
    : null;

  const pad = 10;
  const cw = Math.ceil(w) + pad * 2;
  const ch = Math.ceil(h) + pad * 2;

  let cached = spriteCache.get(cacheKey);
  if (cached) {
    // LRU: delete+re-insert moves entry to end of Map iteration order
    spriteCache.delete(cacheKey);
    spriteCache.set(cacheKey, cached);
    // Explicit logical dest size — cached bitmap is at scaled px dims; main ctx transform maps logical → pixel.
    blitWithIdleTransform(ctx, cached, x, y, w, h, pad, idleAnimAction, idleActionTimer, idleActionDuration, char, player);
    return;
  }

  // Backing store at scaled pixel dims so the bitmap stays sharp when blitted into a scaled main ctx.
  const s = _spriteScale;
  cached = new OffscreenCanvas(Math.max(1, Math.ceil(cw * s)), Math.max(1, Math.ceil(ch * s)));
  const sctx = cached.getContext('2d')! as unknown as CanvasRenderingContext2D;
  sctx.scale(s, s);
  sctx.translate(-x + pad, -y + pad);

  _drawCharacterSpriteImpl(sctx, x, y, w, h, char, state, animFrame, fastFalling, idleAction, idleActionTimer, idleActionDuration, squashScale, theme);

  applyOutlineToCache(cached, darken(char.color, OUTLINE_DARKEN));

  if (spriteCache.size > _spriteCacheCap) {
    const first = spriteCache.keys().next().value;
    if (first !== undefined) spriteCache.delete(first);
  }
  spriteCache.set(cacheKey, cached);
  blitWithIdleTransform(ctx, cached, x, y, w, h, pad, idleAnimAction, idleActionTimer, idleActionDuration, char, player);
}

/** Blit cached sprite, optionally with an idle-action ctx transform around it. */
function blitWithIdleTransform(
  ctx: CanvasRenderingContext2D,
  cached: OffscreenCanvas,
  x: number, y: number, w: number, h: number, pad: number,
  idleAnimAction: IdleAction | null,
  idleActionTimer: number, idleActionDuration: number,
  char: { color: string; darkColor: string; lightColor: string },
  player: Player,
): void {
  const dx = x - pad;
  const dy = y - pad;
  const dw = Math.ceil(w) + pad * 2;
  const dh = Math.ceil(h) + pad * 2;
  if (!idleAnimAction) {
    ctx.drawImage(cached, dx, dy, dw, dh);
    return;
  }
  const cx = x + w / 2;
  const idleT = idleActionDuration > 0 ? 1 - (idleActionTimer / idleActionDuration) : 0;
  const colors = { color: char.color, darkColor: char.darkColor, lightColor: char.lightColor };
  ctx.save();
  idleAnimAction.apply(ctx, cx, y, w, h, idleT, colors, player);
  ctx.drawImage(cached, dx, dy, dw, dh);
  if (idleAnimAction.applyAfter) {
    idleAnimAction.applyAfter(ctx, cx, y, w, h, idleT, colors, player);
  }
  ctx.restore();
}

/** Core character drawing: sprite + highlight + eyes + legs. Shared by match and lobby. */
export function drawCharacterCore(
  ctx: CanvasRenderingContext2D,
  cx: number, yOff: number, w: number, h: number,
  charName: string, state: string, animFrame: number,
  squashScale: number,
  colors: { color: string; darkColor: string; lightColor: string },
  isIdleAnim = false, idleT = -1,
): ReturnType<typeof getCharacterPack> {
  const spriteRenderer = getSpriteRenderer(charName);
  spriteRenderer(ctx, cx, yOff, w, h, state, animFrame, isIdleAnim, idleT >= 0 ? idleT : 0, colors);

  const pack = getCharacterPack(charName);
  if (pack && !pack.noHighlight) {
    drawHighlightSpot(ctx, pack.bodyEllipse(cx, yOff, w, h));
  }

  if (!hasCustomEyes(charName)) {
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx - 4, yOff + h * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 6, yOff + h * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.beginPath(); ctx.arc(cx - 3, yOff + h * 0.38, 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 7, yOff + h * 0.38, 1, 0, Math.PI * 2); ctx.fill();
  }

  drawLegs(ctx, cx, yOff, h, state, animFrame, squashScale, colors, pack?.legStyle);
  return pack;
}

function _drawCharacterSpriteImpl(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  char: { name: string; color: string; darkColor: string; lightColor: string },
  state: string, animFrame: number, fastFalling: boolean,
  idleAction: number, idleActionTimer: number, idleActionDuration: number,
  squashScale: number,
  theme: ThemeConfig | undefined,
): void {
  const cx = x + w / 2;
  const isRunning = state === 'run';
  const bounce = isRunning ? Math.sin(animFrame * Math.PI / 2) * 2 : 0;
  const yOff = y - bounce;

  // Squash/stretch for fast fall (part of cache key, so safe to bake in)
  const scaleX = fastFalling ? 0.85 : 1;
  const scaleY = fastFalling ? 1.15 : 1;

  ctx.save();
  if (fastFalling) {
    ctx.translate(cx, yOff + h / 2);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-cx, -(yOff + h / 2));
  }

  // Action transform is NOT applied here — it's applied to the main ctx in drawCharacterSprite,
  // outside the sprite cache. Otherwise the per-frame transform would be baked into the cached bitmap.
  const isIdleAnimFlag = idleAction >= 0;
  const idleT = idleActionDuration > 0 ? 1 - (idleActionTimer / idleActionDuration) : 0;
  const colors = { color: char.color, darkColor: char.darkColor, lightColor: char.lightColor };

  drawCharacterCore(ctx, cx, yOff, w, h, char.name, state, animFrame, squashScale, colors, isIdleAnimFlag, idleT);

  // Bubble helmet (enabled per-arena via bubbleHelmet flag)
  if (theme?.bubbleHelmet) {
    const hCx = cx + 1;
    const hCy = yOff + h * 0.38;
    const hRx = w * 0.52;
    const hRy = h * 0.42;
    // Glass dome
    ctx.beginPath();
    ctx.ellipse(hCx, hCy, hRx, hRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200, 230, 255, 0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 210, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Highlight reflection arc (upper-left)
    ctx.beginPath();
    ctx.ellipse(hCx - hRx * 0.25, hCy - hRy * 0.2, hRx * 0.5, hRy * 0.45, -0.4, -Math.PI * 0.6, Math.PI * 0.3);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Small specular dot
    ctx.beginPath();
    ctx.arc(hCx - hRx * 0.3, hCy - hRy * 0.35, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fill();
    // Collar ring at the base of the helmet
    ctx.beginPath();
    ctx.ellipse(hCx, hCy + hRy * 0.85, hRx * 0.7, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(180, 190, 200, 0.4)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(140, 150, 160, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  ctx.restore();
}

/** Two short white lines trailing below an airborne character. Drawn outside the
 *  sprite cache so the outline pass doesn't stamp them. */
function drawMotionLines(ctx: CanvasRenderingContext2D, cx: number, footY: number): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 3, footY + 2);
  ctx.lineTo(cx - 3, footY + 8);
  ctx.moveTo(cx + 3, footY + 2);
  ctx.lineTo(cx + 3, footY + 8);
  ctx.stroke();
}

/** Fast-fall vertical smudge. Player-colored streak with curved sides (so it reads
 *  as a smear instead of two parallel lines), narrowing to a point at the top
 *  with a lean opposite horizontal motion (trail-behind). `alpha` (0..1) drives
 *  fade-in on entry and fade-out on landing — caller ramps it via
 *  `fastFallStreakAlpha` so the effect doesn't pop or linger.
 *  Falls back to legacy flat lines when slow-device is on. Drawn outside the
 *  sprite cache so the outline pass doesn't stamp it. */
export function drawFastFallStreaks(
  ctx: CanvasRenderingContext2D, cx: number, headY: number,
  color: string, vx = 0, alpha = 1,
): void {
  if (alpha <= FASTFALL_ALPHA_EPSILON) return;
  if (getSlowDevice()) {
    ctx.strokeStyle = `rgba(255,255,220,${0.8 * alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(cx + i * 5, headY - 2);
      ctx.lineTo(cx + i * 5, headY - 20);
    }
    ctx.stroke();
    return;
  }
  const STREAK_H = FASTFALL_STRIP_H;
  const HALF_W = 17;            // half the bottom width — wider than the previous trapezoid for a smudgier read
  // Top of smear leans opposite of motion — trail-behind read.
  const lean = Math.max(-1, Math.min(1, vx / 200)) * 11;
  const topY = headY - STREAK_H;

  // Lozenge with a narrow leaned tip (top) and a rounded wider base — looks
  // like a paint smear rather than a flat trapezoid. Fill via per-color baked
  // strip + clipped drawImage: gradient evaluation happens once at bake time,
  // per-frame cost becomes a memcpy/blend.
  const strip = getFastfallStrip(color);
  if (strip) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - lean, topY);
    ctx.quadraticCurveTo(cx + HALF_W + lean * 0.4, headY - STREAK_H * 0.35, cx + HALF_W, headY);
    ctx.quadraticCurveTo(cx, headY + 6, cx - HALF_W, headY);
    ctx.quadraticCurveTo(cx - HALF_W - lean * 0.4, headY - STREAK_H * 0.35, cx - lean, topY);
    ctx.closePath();
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = alpha;
    ctx.drawImage(strip, cx - HALF_W - 6, topY, HALF_W * 2 + 12, STREAK_H);
    ctx.restore();
  } else {
    const { r, g, b } = hexToRGB(color);
    const grad = ctx.createLinearGradient(cx, topY, cx, headY);
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
    grad.addColorStop(0.4, `rgba(${r},${g},${b},${0.32 * alpha})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},${0.85 * alpha})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - lean, topY);
    ctx.quadraticCurveTo(cx + HALF_W + lean * 0.4, headY - STREAK_H * 0.35, cx + HALF_W, headY);
    ctx.quadraticCurveTo(cx, headY + 6, cx - HALF_W, headY);
    ctx.quadraticCurveTo(cx - HALF_W - lean * 0.4, headY - STREAK_H * 0.35, cx - lean, topY);
    ctx.closePath();
    ctx.fill();
  }

  // Inner motion wisps — visible streaks in the smudge body.
  ctx.strokeStyle = `rgba(255,255,255,${0.4 * alpha})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - 4 - lean * 0.5, topY + STREAK_H * 0.4);
  ctx.quadraticCurveTo(cx - 3, topY + STREAK_H * 0.75, cx - 2, headY - 3);
  ctx.moveTo(cx + 4 - lean * 0.5, topY + STREAK_H * 0.4);
  ctx.quadraticCurveTo(cx + 3, topY + STREAK_H * 0.75, cx + 2, headY - 3);
  ctx.stroke();
}

export function drawSplatCharacter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, darkColor: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h - 4, w * 0.6, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 2;
  const eyeY = y + h - 6;
  ctx.beginPath();
  ctx.moveTo(x + w / 2 - 8, eyeY - 2);
  ctx.lineTo(x + w / 2 - 4, eyeY + 2);
  ctx.moveTo(x + w / 2 - 4, eyeY - 2);
  ctx.lineTo(x + w / 2 - 8, eyeY + 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + w / 2 + 4, eyeY - 2);
  ctx.lineTo(x + w / 2 + 8, eyeY + 2);
  ctx.moveTo(x + w / 2 + 8, eyeY - 2);
  ctx.lineTo(x + w / 2 + 4, eyeY + 2);
  ctx.stroke();
}

export function drawExpression(ctx: CanvasRenderingContext2D, player: Player, frameTime: number): void {
  const expression = player.expression;
  if (!expression || expression === 'normal') return;

  const { x, y, width, height } = player;
  const cx = x + width / 2;
  const isRunning = player.state === 'run';
  const bounce = isRunning ? Math.sin(player.animFrame * Math.PI / 2) * 2 : 0;
  const yOff = y - bounce;

  if (expression === 'angry') {
    // Two red-tinted angled lines above eyes (angry eyebrows)
    ctx.strokeStyle = 'rgba(200, 40, 40, 0.8)';
    ctx.lineWidth = 2;
    // Left eyebrow -- angling inward-down
    ctx.beginPath();
    ctx.moveTo(cx - 8, yOff + height * 0.3);
    ctx.lineTo(cx - 2, yOff + height * 0.34);
    ctx.stroke();
    // Right eyebrow -- angling inward-down
    ctx.beginPath();
    ctx.moveTo(cx + 10, yOff + height * 0.3);
    ctx.lineTo(cx + 4, yOff + height * 0.34);
    ctx.stroke();
  } else if (expression === 'scared') {
    // Sweat drop on the side of the head
    ctx.fillStyle = 'rgba(100, 180, 255, 0.7)';
    ctx.beginPath();
    // Teardrop shape
    ctx.moveTo(cx + width * 0.35, yOff + height * 0.2);
    ctx.quadraticCurveTo(cx + width * 0.42, yOff + height * 0.3, cx + width * 0.35, yOff + height * 0.35);
    ctx.quadraticCurveTo(cx + width * 0.28, yOff + height * 0.3, cx + width * 0.35, yOff + height * 0.2);
    ctx.fill();
  } else if (expression === 'dizzy') {
    // 3 small yellow stars circling above the head
    const now = frameTime / 1000;
    ctx.fillStyle = '#FFD700';
    for (let i = 0; i < 3; i++) {
      const angle = now * 3 + (i * Math.PI * 2 / 3);
      const starX = cx + Math.cos(angle) * 12;
      const starY = yOff - 4 + Math.sin(angle) * 5;
      // Draw small 4-point star
      ctx.beginPath();
      for (let p = 0; p < 4; p++) {
        const sa = (p / 4) * Math.PI * 2 - Math.PI / 2;
        const saInner = sa + Math.PI / 4;
        ctx.lineTo(starX + Math.cos(sa) * 3, starY + Math.sin(sa) * 3);
        ctx.lineTo(starX + Math.cos(saInner) * 1.2, starY + Math.sin(saInner) * 1.2);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}
