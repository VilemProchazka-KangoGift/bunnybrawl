import type { Player } from '../types';
import type { ThemeConfig } from '../themes/types';
import { FAT_SCALE, HITSTOP_DURATION } from '../constants';
import { hasCustomEyes, getSpriteRenderer, getCharacterPack, drawLegs } from '../characters';
import { drawHighlightSpot } from '../spriteShading';

// Sprite cache: key -> OffscreenCanvas with pre-drawn character sprite
const spriteCache = new Map<string, OffscreenCanvas>();

export function clearSpriteCache(): void {
  spriteCache.clear();
}

export function drawPlayer(ctx: CanvasRenderingContext2D, player: Player, nearCarrot: boolean, theme: ThemeConfig, frameTime: number): void {
  const { width, height, character, state, facing, invincibleTimer, animFrame, fastFalling, fatTimer, slowTimer } = player;
  // Apply visual correction offset from rollback smoothing
  const x = player.x + player.renderOffsetX;
  const y = player.y + player.renderOffsetY;

  const cx = x + width / 2;
  const cy = y + height;

  // Character shadow -- projected onto ground/platform below, shrinks with height
  if (state !== 'splat' && state !== 'respawning') {
    // Find the nearest platform surface below the player's feet
    let shadowY = 660; // default: ground
    // Check against a simple ground level -- the renderer doesn't have arena access here,
    // so use the player's feet position when grounded, or project to 660 (ground) when airborne
    if (state === 'idle' || state === 'run') {
      shadowY = cy; // on ground -- shadow at feet
    } else {
      shadowY = Math.min(cy + 200, 660); // project downward, cap at ground
    }
    const heightAboveShadow = Math.max(0, shadowY - cy);
    const shadowScale = Math.max(0.3, 1 - heightAboveShadow / 200);
    const shadowAlpha = 0.2 * shadowScale;
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, shadowY, 10 * shadowScale, 2 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Kill streak flame aura (d) -- drawn behind character sprite
  if (player.killStreak >= 3) {
    const now = frameTime / 1000;
    for (let i = 0; i < 4; i++) {
      const angle = now * 3 + i * 1.5;
      const flameX = cx + Math.sin(angle) * 8;
      const flameY = y + height * 0.3 + Math.cos(angle * 1.3) * 4;
      const flameR = 8 + Math.sin(angle * 2) * 3;
      const colors = ['rgba(255, 100, 0, 0.3)', 'rgba(255, 60, 0, 0.25)', 'rgba(255, 200, 0, 0.2)', 'rgba(255, 0, 0, 0.2)'];
      ctx.fillStyle = colors[i];
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

  if (state === 'splat') {
    drawSplatCharacter(ctx, x, y, width, height, character.color, character.darkColor);
  } else {
    drawCharacterSprite(ctx, x, y, width, height, character, state, animFrame, fastFalling, player.idleAnimTimer, player.squashScale, theme);
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

  // Fire glow overlay when burning from lava
  if (player.burnTimer > 0) {
    const fireAlpha = Math.min(0.4, player.burnTimer * 0.5) * (0.6 + Math.sin(player.burnTimer * 12) * 0.4);
    const grad = ctx.createRadialGradient(cx, y + height * 0.4, 0, cx, y + height * 0.4, width * 0.7);
    grad.addColorStop(0, `rgba(255, 200, 0, ${fireAlpha * 0.6})`);
    grad.addColorStop(0.5, `rgba(255, 100, 0, ${fireAlpha * 0.4})`);
    grad.addColorStop(1, `rgba(255, 50, 0, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, y + height * 0.4, width * 0.7, height * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
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
  state: string, animFrame: number, fastFalling: boolean,
  idleAnimTimer?: number, squashScale = 1,
  theme?: ThemeConfig,
): void {
  const idleKey = (state === 'idle' && idleAnimTimer !== undefined && idleAnimTimer > 0 && idleAnimTimer < 0.5)
    ? Math.floor(idleAnimTimer * 10)
    : -1;
  const sqKey = Math.round(squashScale * 10);
  const cacheKey = `${char.name}_${state}_${animFrame}_${fastFalling ? 1 : 0}_${idleKey}_${sqKey}`;

  let cached = spriteCache.get(cacheKey);
  if (cached) {
    // LRU: delete+re-insert moves entry to end of Map iteration order
    spriteCache.delete(cacheKey);
    spriteCache.set(cacheKey, cached);
    ctx.drawImage(cached, x - 10, y - 10);
    return;
  }

  // Cache miss: render to offscreen canvas with padding for ears/tails/legs
  const pad = 10;
  const cw = Math.ceil(w) + pad * 2;
  const ch = Math.ceil(h) + pad * 2;
  cached = new OffscreenCanvas(cw, ch);
  const sctx = cached.getContext('2d')! as unknown as CanvasRenderingContext2D;
  // Translate so the existing draw code (which uses absolute x,y) draws into the padded offscreen canvas
  sctx.translate(-x + pad, -y + pad);

  _drawCharacterSpriteImpl(sctx, x, y, w, h, char, state, animFrame, fastFalling, idleAnimTimer, squashScale, theme);

  if (spriteCache.size > 600) {
    const first = spriteCache.keys().next().value;
    if (first !== undefined) spriteCache.delete(first);
  }
  spriteCache.set(cacheKey, cached);
  ctx.drawImage(cached, x - pad, y - pad);
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
  idleAnimTimer?: number, squashScale = 1,
  theme?: ThemeConfig,
): void {
  const cx = x + w / 2;
  const isAirborne = state === 'airborne';
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

  // Idle animation -- apply transform based on character pack's idleTransform setting
  const idleT = idleAnimTimer ?? -1;
  const isIdleAnim = idleT >= 0 && idleT < 0.5;
  if (isIdleAnim && state !== 'run' && state !== 'airborne') {
    const t = idleT / 0.5;
    const pulse = Math.sin(t * Math.PI);
    const pack = getCharacterPack(char.name);
    const idleType = pack?.idleTransform ?? 'headBob';
    if (idleType === 'headTilt') {
      ctx.translate(cx, yOff + h * 0.5);
      ctx.rotate(pulse * 0.12);
      ctx.translate(-cx, -(yOff + h * 0.5));
    } else if (idleType === 'headFlip') {
      const flipScale = 1 - pulse * 0.15;
      ctx.translate(cx, yOff + h * 0.5);
      ctx.scale(flipScale, 1);
      ctx.translate(-cx, -(yOff + h * 0.5));
    } else if (idleType === 'headBob') {
      ctx.translate(0, -pulse * 2);
    }
    // 'none' -- no transform
  }

  const colors = { color: char.color, darkColor: char.darkColor, lightColor: char.lightColor };
  drawCharacterCore(ctx, cx, yOff, w, h, char.name, state, animFrame, squashScale, colors, isIdleAnim, idleT);

  // Motion lines for airborne
  if (isAirborne && !fastFalling) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 3, yOff + h + 2);
    ctx.lineTo(cx - 3, yOff + h + 8);
    ctx.moveTo(cx + 3, yOff + h + 2);
    ctx.lineTo(cx + 3, yOff + h + 8);
    ctx.stroke();
  }

  // Fast-fall speed lines (g) -- enhanced: more lines, longer, brighter
  if (fastFalling) {
    ctx.strokeStyle = 'rgba(255,255,220,0.8)';
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 5, yOff - 2);
      ctx.lineTo(cx + i * 5, yOff - 20);
      ctx.stroke();
    }
  }

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
