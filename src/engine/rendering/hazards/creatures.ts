import type { ThemeConfig, ScatterFlockSpecies } from '../../themes/types';
import type { Ctx2D } from '../../types';
import { fastSin } from '../../fastMath';

// Ghost glow: cached gradient OBJECT was reused across frames, but the per-frame
// fillRect over a (3s)×(3s) area still did per-pixel radial evaluation
// (~40k pixels/frame in haunted_graveyard with 4-5 ghosts). Bake the gradient
// into a 2D OffscreenCanvas; per-call becomes drawImage. Keyed by
// `${size}_${glowColor}` so distinct ghost configs share entries — the Map
// needs explicit clearing on theme/arena change (vs. WeakMap for object keys).
const cachedGhostGlowImages = new Map<string, OffscreenCanvas | HTMLCanvasElement>();

export function clearCreatureCaches(): void {
  cachedGhostGlowImages.clear();
}

export function drawGhost(
  ctx: CanvasRenderingContext2D,
  ghost: { x: number; y: number; size: number; alpha: number; wobblePhase: number },
  theme: ThemeConfig,
  time: number,
): void {
  // Custom ghost renderer (e.g. wasps)
  if (theme.drawCustomGhost) {
    theme.drawCustomGhost(ctx, ghost.x, ghost.y + fastSin(ghost.wobblePhase + time * 2) * 3, ghost.size, ghost.alpha, time);
    return;
  }
  ctx.save();
  const wobble = fastSin(ghost.wobblePhase + time * 2) * 3;
  ctx.translate(ghost.x, ghost.y + wobble);
  ctx.globalAlpha = ghost.alpha * (0.5 + fastSin(time * 1.5) * 0.15);

  const gc = theme.ghostConfig;
  const color = gc?.color || '#AABBDD';
  const glowColor = gc?.glowColor || '#6688BB';
  const s = ghost.size;

  // Ghost glow — gradient baked to a 2D OffscreenCanvas at half-resolution
  // (radial gradient is smooth, nearest-neighbor upscale is invisible). Drawn
  // via drawImage instead of fillRect with the gradient → no per-pixel eval.
  const gKey = `${s}_${glowColor}`;
  let glowImage = cachedGhostGlowImages.get(gKey);
  if (!glowImage) {
    const haloW = Math.ceil(s * 3);
    const useOffscreen = typeof OffscreenCanvas !== 'undefined';
    const bakeW = Math.max(2, Math.ceil(haloW / 2));
    glowImage = useOffscreen
      ? new OffscreenCanvas(bakeW, bakeW)
      : (() => { const c = document.createElement('canvas'); c.width = bakeW; c.height = bakeW; return c; })();
    const gctx = glowImage.getContext('2d')! as Ctx2D;
    const half = bakeW / 2;
    const radial = gctx.createRadialGradient(half, half, half * (0.2 / 1.5), half, half, half);
    radial.addColorStop(0, glowColor + '33');
    radial.addColorStop(1, glowColor + '00');
    gctx.fillStyle = radial;
    gctx.fillRect(0, 0, bakeW, bakeW);
    cachedGhostGlowImages.set(gKey, glowImage);
  }
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(glowImage, -s * 1.5, -s * 1.5, s * 3, s * 3);
  ctx.imageSmoothingEnabled = prevSmooth;

  // Ghost body (rounded top, wavy bottom)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, -s * 0.2, s * 0.5, Math.PI, 0);
  ctx.lineTo(s * 0.5, s * 0.3);
  // Wavy bottom
  const waves = 4;
  for (let w = 0; w < waves; w++) {
    const wx = s * 0.5 - (w + 1) * (s / waves);
    const wy = s * 0.3 + fastSin(time * 3 + w * 1.5) * s * 0.08;
    const cx = wx + s / (waves * 2);
    ctx.quadraticCurveTo(cx, wy + s * 0.12, wx, wy);
  }
  ctx.closePath();
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.ellipse(-s * 0.15, -s * 0.2, s * 0.08, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(s * 0.15, -s * 0.2, s * 0.08, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mouth
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.02, s * 0.1, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawPigeonFlock(
  ctx: CanvasRenderingContext2D,
  flock: { x: number; y: number; active: boolean; scatterParticles: Array<{ x: number; y: number; vx: number; vy: number; life: number }> },
  time: number,
  lead = 0,
): void {
  ctx.save();
  if (flock.active) {
    // Draw sitting pigeons (3 birds)
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 3; i++) {
      const px = flock.x - 10 + i * 10;
      const py = flock.y - 4;
      // Body
      ctx.fillStyle = '#7A7A8A';
      ctx.beginPath();
      ctx.ellipse(px, py, 5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Head
      ctx.beginPath();
      ctx.arc(px + 4, py - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Beak
      ctx.fillStyle = '#CCAA44';
      ctx.beginPath();
      ctx.moveTo(px + 6, py - 3);
      ctx.lineTo(px + 8, py - 2.5);
      ctx.lineTo(px + 6, py - 2);
      ctx.fill();
      // Head bob
      if (Math.sin(time * 4 + i * 2) > 0.7) {
        ctx.fillStyle = '#7A7A8A';
        ctx.beginPath();
        ctx.arc(px + 4, py - 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Scatter particles (flying birds) — extrapolate position by lead for 60fps motion
  for (const sp of flock.scatterParticles) {
    const x = sp.x + sp.vx * lead;
    const y = sp.y + sp.vy * lead;
    ctx.globalAlpha = Math.min(1, sp.life) * 0.6;
    ctx.fillStyle = '#6A6A7A';
    // Body
    ctx.beginPath();
    ctx.ellipse(x, y, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wings (flapping)
    const wing = Math.sin(sp.life * 30) * 6;
    ctx.beginPath();
    ctx.moveTo(x - 3, y);
    ctx.lineTo(x - 8, y + wing);
    ctx.lineTo(x - 2, y);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 3, y);
    ctx.lineTo(x + 8, y + wing);
    ctx.lineTo(x + 2, y);
    ctx.fill();
  }
  ctx.restore();
}

const BIRD_PALETTE: readonly string[] = ['#3a4a8a', '#a85a3a', '#5a8a3a'];
const BAT_COLOR = '#2c1f3c';
const CROW_COLOR = '#0e0a14';
const BAT_EYE_COLOR = '#ff9244';
const BIRD_BEAK_COLOR = '#ff8a3a';
const CROW_BEAK_COLOR = '#5a3a1c';

const BIRD_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: -14, dy: -3 },
  { dx: -6,  dy: -7 },
  { dx: 6,   dy: -2 },
  { dx: 16,  dy: -5 },
];

const CROW_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: -12, dy: -4 },
  { dx: 2,   dy: -6 },
  { dx: 14,  dy: -3 },
];

const BAT_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: -14, dy: 0 },
  { dx: 0,   dy: 3 },
  { dx: 14,  dy: 1 },
];

const PERCHED_FLOCK_DRAWERS: Record<ScatterFlockSpecies, (ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number) => void> = {
  bat: (ctx, cx, cy, time) => {
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 3; i++) {
      const o = BAT_OFFSETS[i];
      const bx = cx + o.dx;
      const by = cy + o.dy;
      const sway = fastSin(time * 1.2 + i);
      ctx.fillStyle = BAT_COLOR;
      ctx.beginPath();
      ctx.ellipse(bx + sway, by + 4, 3, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx - 3 + sway, by + 2);
      ctx.quadraticCurveTo(bx + sway, by + 6, bx + 3 + sway, by + 2);
      ctx.fill();
      ctx.fillStyle = BAT_EYE_COLOR;
      ctx.fillRect(bx - 1 + sway, by + 5, 2, 1);
    }
    ctx.globalAlpha = 1;
  },
  crow: (ctx, cx, cy, time) => {
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 3; i++) {
      const o = CROW_OFFSETS[i];
      const px = cx + o.dx;
      const py = cy + o.dy;
      ctx.fillStyle = CROW_COLOR;
      ctx.beginPath();
      ctx.ellipse(px, py, 5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px + 4, py - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = CROW_BEAK_COLOR;
      ctx.beginPath();
      ctx.moveTo(px + 6, py - 3);
      ctx.lineTo(px + 9, py - 2.5);
      ctx.lineTo(px + 6, py - 2);
      ctx.fill();
      if (fastSin(time * 3 + i * 2) > 0.6) {
        ctx.fillStyle = CROW_COLOR;
        ctx.beginPath();
        ctx.arc(px + 4, py - 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },
  bird: (ctx, cx, cy, time) => {
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 4; i++) {
      const offset = BIRD_OFFSETS[i];
      const px = cx + offset.dx;
      const py = cy + offset.dy;
      const color = BIRD_PALETTE[i % BIRD_PALETTE.length];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(px, py, 3.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px + 2.5, py - 2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = BIRD_BEAK_COLOR;
      ctx.fillRect(px + 4, py - 2, 1, 1);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(px - 3, py);
      ctx.lineTo(px - 5, py - 1);
      ctx.lineTo(px - 5, py + 1);
      ctx.fill();
      if (fastSin(time * 5 + i * 1.7) > 0.85) {
        ctx.fillStyle = '#000';
        ctx.fillRect(px + 2.5, py - 2, 0.5, 0.5);
      }
    }
    ctx.globalAlpha = 1;
  },
};

interface FlyingSpeciesCfg { palette: readonly string[]; bodyW: number; bodyH: number; wingSpan: number; flapFreq: number; flapAmp: number; }
const FLYING_CFG: Record<ScatterFlockSpecies, FlyingSpeciesCfg> = {
  bat:  { palette: [BAT_COLOR],  bodyW: 0,   bodyH: 0,   wingSpan: 5, flapFreq: 32, flapAmp: 4 },
  crow: { palette: [CROW_COLOR], bodyW: 4,   bodyH: 3,   wingSpan: 9, flapFreq: 24, flapAmp: 5 },
  bird: { palette: BIRD_PALETTE, bodyW: 3,   bodyH: 2.5, wingSpan: 6, flapFreq: 28, flapAmp: 4 },
};

/** Pick a body color from a species palette. Called once per particle at emit. */
export function pickScatterColor(species: ScatterFlockSpecies, rand: number): string {
  const palette = FLYING_CFG[species].palette;
  return palette[Math.floor(rand * palette.length) % palette.length];
}

type ScatterParticle = { x: number; y: number; vx: number; vy: number; life: number; phase: number; color: string };

export function drawScatterFlock(
  ctx: CanvasRenderingContext2D,
  flock: {
    species: ScatterFlockSpecies;
    x: number; y: number;
    active: boolean;
    scatterParticles: ScatterParticle[];
  },
  time: number,
  lead = 0,
): void {
  if (!flock.active && flock.scatterParticles.length === 0) return;
  ctx.save();
  if (flock.active) PERCHED_FLOCK_DRAWERS[flock.species](ctx, flock.x, flock.y, time);
  for (const sp of flock.scatterParticles) drawFlyingScatter(ctx, flock.species, sp, lead);
  ctx.restore();
}

function drawFlyingScatter(ctx: CanvasRenderingContext2D, species: ScatterFlockSpecies, sp: ScatterParticle, lead = 0): void {
  const cfg = FLYING_CFG[species];
  // Position extrapolated by lead seconds for 60fps motion vs 30Hz update rate
  const x = sp.x + sp.vx * lead;
  const y = sp.y + sp.vy * lead;
  const flap = fastSin(sp.life * cfg.flapFreq + sp.phase) * cfg.flapAmp;
  ctx.globalAlpha = Math.min(1, sp.life) * 0.85;
  ctx.fillStyle = sp.color;
  if (species === 'bat') {
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.quadraticCurveTo(x - 2, y - flap, x, y);
    ctx.quadraticCurveTo(x + 2, y - flap, x + 5, y);
    ctx.lineTo(x + 4, y + 1.5);
    ctx.lineTo(x, y + 0.5);
    ctx.lineTo(x - 4, y + 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  const dir = sp.vx >= 0 ? 1 : -1;
  const innerW = species === 'crow' ? 3 : 2;
  const bodyW = cfg.bodyW;
  const bodyH = cfg.bodyH;
  const headX = x + dir * (bodyW + 0.5);
  const headY = y - bodyH * 0.4;
  const headR = species === 'crow' ? 2.2 : 1.7;
  ctx.beginPath();
  ctx.ellipse(x, y, bodyW, bodyH, 0, 0, Math.PI * 2);
  ctx.moveTo(x - innerW, y);
  ctx.lineTo(x - cfg.wingSpan, y + flap);
  ctx.lineTo(x - (innerW - 1), y);
  ctx.moveTo(x + innerW, y);
  ctx.lineTo(x + cfg.wingSpan, y + flap);
  ctx.lineTo(x + (innerW - 1), y);
  ctx.moveTo(headX + headR, headY);
  ctx.arc(headX, headY, headR, 0, Math.PI * 2);
  ctx.moveTo(x - dir * bodyW, y);
  ctx.lineTo(x - dir * (bodyW + 3), y - 1);
  ctx.lineTo(x - dir * (bodyW + 3), y + 1);
  ctx.fill();
  if (species === 'crow') {
    ctx.fillStyle = CROW_BEAK_COLOR;
    ctx.beginPath();
    ctx.moveTo(x + dir * (bodyW + 2), y - bodyH * 0.3);
    ctx.lineTo(x + dir * (bodyW + 5), y - bodyH * 0.2);
    ctx.lineTo(x + dir * (bodyW + 2), y - bodyH * 0.1);
    ctx.fill();
  } else {
    ctx.fillStyle = BIRD_BEAK_COLOR;
    ctx.fillRect(x + dir * (bodyW + 1.5), headY, dir * 1.5, 1);
  }
  ctx.globalAlpha = 1;
}
