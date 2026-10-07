import type { Player, MatchState, Ctx2D } from '../types';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, SCORE_ANIM_DURATION, MATCH_COUNTDOWN,
  COMBO_POPUP_DURATION, COMBO_POPUP_RISE_PX, GOAL_PULSE_DURATION,
} from '../constants';
import { UI_THEME } from '../../uiTheme';
import { drawUiPortrait, getPortraitRevision } from './uiPortrait';
import { getCharacterDisplayName } from '../characters';

/** Module-scope language for HUD character-name lookups. Set by Renderer
 *  at construction (and on language-change forwarded from main). The HUD
 *  doesn't import the React-coupled `src/i18n.ts` directly so the worker
 *  bundle doesn't pull in `react-i18next`. */
let _hudLanguage = 'en';
export function setHudLanguage(lang: string): void { _hudLanguage = lang; invalidateHudCache(); }

/** Pre-render every font-size + family combination drawHUD uses, so the
 *  first in-match HUD draw doesn't JIT a 30+ms font-shaping pass.
 *  Mirrors the `warmSpriteCache` pattern. Called from `matchLoading` for
 *  both main-thread and worker-hosted Renderers (HUD lives in either). */
export function warmHudFonts(ctx: Ctx2D): void {
  const fonts: string[] = [
    'bold 12px "Nunito", sans-serif',
    '900 27px "Nunito", sans-serif',
    '900 25px "Nunito", sans-serif',
    '28px sans-serif',
    'bold 12px "Press Start 2P", monospace',
    'bold 16px "Press Start 2P", monospace',
    'bold 14px "Press Start 2P", monospace',
    'bold 18px "Press Start 2P", monospace',
    'bold 7px monospace',
    'bold 14px monospace',
    COMBO_POPUP_FONT,
    'bold 80px "Nunito", sans-serif',
  ];
  const probeText = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:+×';
  ctx.save();
  // Off-screen probe — paint at (-9999, -9999) so the warm-up paints don't
  // smear on top of any real drawing. The font shaping engine still
  // exercises every glyph at every size, which is what we want.
  ctx.fillStyle = '#000';
  for (const f of fonts) {
    ctx.font = f;
    ctx.fillText(probeText, -9999, -9999);
    ctx.measureText(probeText);
  }
  ctx.restore();
}

// Used by OnlineModal as input maxLength too.
export const PLAYER_NAME_MAX_LENGTH = 12;
const PLAYER_NAME_MAX_LENGTH_COMPACT = 4;

// Warm yellow overlay blended with #FFF score digit during goal pulse.


// ×N popup tier colors (yellow → orange → pink).
const COMBO_COLORS: Record<number, string> = { 2: '#FFD63A', 3: '#FF9322' };
const COMBO_COLOR_HIGH = '#FF4FB8';
const COMBO_POPUP_FONT = 'bold 28px "Press Start 2P", monospace';

// HUD cache state (module-level)
let hudCache: OffscreenCanvas | null = null;
let hudCacheCtx: OffscreenCanvasRenderingContext2D | null = null;
let hudLastTimer = -1;
let portraitRevision = -1;
let hudLastPlayerCount = -1;
let _hudScale = 1;
const _hudPlayerScores: Record<string, number> = {};
const _hudPlayerActive: Record<string, boolean> = {};
// Shared between drawHUDImpl and drawScoreAnimations
let _hudActivePlayers: Player[] = [];
let _hudStartX = 0;
let _hudScoreWidth = 0;

export function invalidateHudCache(): void {
  hudLastPlayerCount = -1;
}

/** Set HUD render scale. Drops the cache if the scale changed so the next draw rebuilds at the new pixel dims. */
export function setHudScale(scale: number): void {
  if (scale === _hudScale) return;
  _hudScale = scale;
  hudCache = null;
  hudCacheCtx = null;
  hudLastPlayerCount = -1;
}

export function resetHudState(): void {
  hudCache = null;
  hudCacheCtx = null;
  hudLastTimer = -1;
  hudLastPlayerCount = -1;
  _hudActivePlayers = [];
  for (const k in _hudPlayerScores) delete _hudPlayerScores[k];
  for (const k in _hudPlayerActive) delete _hudPlayerActive[k];
}

/** Displayed match time excludes the pre-match countdown. */
function matchTimeSec(state: MatchState): number {
  return Math.max(0, state.timeElapsed - MATCH_COUNTDOWN);
}

/** Check whether the HUD cache needs rebuild. No side effects. */
export function isHudDirty(state: MatchState): boolean {
  const timerSec = Math.floor(matchTimeSec(state));
  if (getPortraitRevision() !== portraitRevision || timerSec !== hudLastTimer || !hudCache) return true;
  // Active goal pulse animates the score pill — redraw every frame until it expires.
  if (state.goalPulseTimers.size > 0) return true;
  let activeCount = 0;
  for (const p of state.players) {
    if (p.active) activeCount++;
    if (p.score !== (_hudPlayerScores?.[p.id as string] ?? -1)) return true;
    if (p.active !== (_hudPlayerActive?.[p.id as string] ?? false)) return true;
  }
  if (activeCount !== hudLastPlayerCount) return true;
  return false;
}

export function drawHUD(ctx: Ctx2D, state: MatchState, frameTime: number, playerNames: Record<string, string> | null, timeLimit = 0, precomputedDirty?: boolean): void {
  const needsRedraw = precomputedDirty !== undefined ? precomputedDirty : isHudDirty(state);

  if (needsRedraw) {
    if (!hudCache) {
      const s = _hudScale;
      hudCache = new OffscreenCanvas(Math.max(1, Math.ceil(CANVAS_WIDTH * s)), Math.max(1, Math.ceil(90 * s)));
      hudCacheCtx = hudCache.getContext('2d')!;
      hudCacheCtx.scale(s, s);
    }
    const hctx = hudCacheCtx!;
    hctx.clearRect(0, 0, CANVAS_WIDTH, 90);

    // Draw HUD content to cache
    _drawHUDImpl(hctx, state, frameTime, playerNames, timeLimit);

    portraitRevision = getPortraitRevision();
    hudLastTimer = Math.floor(matchTimeSec(state));
    let ac = 0;
    for (const p of state.players) {
      _hudPlayerScores[p.id as string] = p.score;
      _hudPlayerActive[p.id as string] = p.active;
      if (p.active) ac++;
    }
    hudLastPlayerCount = ac;
  }

  // Blit cached HUD — explicit logical dest size since the bitmap is at scaled px dims.
  ctx.drawImage(hudCache!, 0, 0, CANVAS_WIDTH, 90);

  // Score animations are drawn on main ctx (they're transient)
  if (state.scoreAnimations && state.scoreAnimations.length > 0) {
    _drawScoreAnimations(ctx, state);
  }
}

function _drawHUDImpl(ctx: Ctx2D, state: MatchState, _frameTime: number, playerNames: Record<string, string> | null, timeLimit = 0): void {
  // Reuse the persistent _hudActivePlayers array — Array.filter() allocates a
  // fresh array every call (every frame during goal-pulse animation), and
  // _drawScoreAnimations holds a reference to it across calls anyway.
  _hudActivePlayers.length = 0;
  for (const p of state.players) if (p.active) _hudActivePlayers.push(p);
  const activePlayers = _hudActivePlayers;
  const scoreWidth = Math.min(185, Math.floor((CANVAS_WIDTH - 165) / Math.max(1, activePlayers.length)));
  const compact = scoreWidth < 130;
  const startX = 18;
  _hudStartX = startX; _hudScoreWidth = scoreWidth;
  for (let i = 0; i < activePlayers.length; i++) {
    const player = activePlayers[i];
    const px = startX + i * scoreWidth;
    const pulseT = state.goalPulseTimers.get(player.id) ?? 0;
    const pulseEnvelope = pulseT > 0 ? Math.sin((1 - pulseT / GOAL_PULSE_DURATION) * Math.PI) : 0;
    ctx.save();
    ctx.translate(px + (scoreWidth - 10) / 2, 42);
    ctx.rotate((i % 2 ? 1 : -1) * .025);
    ctx.scale(1 + pulseEnvelope * .06, 1 + pulseEnvelope * .06);
    ctx.translate(-(scoreWidth - 10) / 2, -42);
    ctx.fillStyle = UI_THEME.ink; ctx.beginPath(); ctx.roundRect(0, 26, scoreWidth - 10, 46, 12); ctx.fill();
    ctx.fillStyle = player.character.lightColor; ctx.strokeStyle = UI_THEME.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(0, 21, scoreWidth - 10, 46, 12); ctx.fill(); ctx.stroke();
    const portraitSize = compact ? 45 : 78;
    drawUiPortrait(ctx, player.character.name, -5, 67 - portraitSize, portraitSize);
    const textX = compact ? 40 : 85;
    const customName = playerNames?.[player.id];
    const label = customName || getCharacterDisplayName(player.character.name, _hudLanguage);
    ctx.fillStyle = UI_THEME.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 12px "Nunito", sans-serif';
    ctx.fillText(`${player.id} · ${label.slice(0, compact ? PLAYER_NAME_MAX_LENGTH_COMPACT : PLAYER_NAME_MAX_LENGTH)}`, textX, 35, scoreWidth - textX - 18);
    ctx.font = '900 27px "Nunito", sans-serif'; ctx.fillText(String(player.score), textX, 59);
    ctx.restore();
  }
  if (state.timeElapsed >= 0) {
    const elapsed = matchTimeSec(state);
    const displayed = timeLimit > 0 ? Math.max(0, timeLimit - elapsed) : elapsed;
    const minutes = Math.floor(displayed / 60), seconds = Math.floor(displayed % 60);
    ctx.fillStyle = UI_THEME.ink; ctx.beginPath(); ctx.roundRect(CANVAS_WIDTH - 133, 18, 112, 53, 12); ctx.fill();
    ctx.fillStyle = UI_THEME.paper; ctx.strokeStyle = UI_THEME.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(CANVAS_WIDTH - 133, 13, 112, 53, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = timeLimit > 0 && displayed < 30 ? UI_THEME.danger : UI_THEME.ink;
    ctx.font = '900 25px "Nunito", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${minutes}:${seconds.toString().padStart(2, '0')}`, CANVAS_WIDTH - 77, 40);
  }
}
function _drawScoreAnimations(ctx: Ctx2D, state: MatchState): void {
  const activePlayers = _hudActivePlayers;
  const startX = _hudStartX;
  const scoreWidth = _hudScoreWidth;

  for (const anim of state.scoreAnimations!) {
    const progress = 1 - anim.timer / SCORE_ANIM_DURATION;
    const yOffset = -20 * progress;
    const scale = 1.4 - progress * 0.4; // starts large, settles
    const alpha = 1 - progress * progress;

    // Find the player's HUD position
    const pidx = activePlayers.findIndex(p => p.id === anim.playerId);
    if (pidx < 0) continue;
    const px = startX + pidx * scoreWidth;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px + scoreWidth / 2, 55 + yOffset);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 18px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+${anim.value}`, 0, 0);
    ctx.restore();
  }
}

/** Draw active combo popups (×N text) — post-player, pre-HUD layer.
 *  Rises COMBO_POPUP_RISE_PX over the first 60% of life, fades over the last 40%. */
export function drawComboPopups(ctx: Ctx2D, state: MatchState): void {
  if (state.comboPopups.length === 0) return;
  const RISE_FRACTION = 0.6;
  ctx.font = COMBO_POPUP_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#000';
  for (const popup of state.comboPopups) {
    const progress = 1 - popup.timer / COMBO_POPUP_DURATION;
    if (progress < 0 || progress > 1) continue;
    const riseT = Math.min(1, progress / RISE_FRACTION);
    const riseEase = 1 - (1 - riseT) * (1 - riseT) * (1 - riseT);
    const yOffset = -COMBO_POPUP_RISE_PX * riseEase;
    const fadeT = progress < RISE_FRACTION ? 0 : (progress - RISE_FRACTION) / (1 - RISE_FRACTION);
    const alpha = 1 - fadeT;
    const scale = 1.4 - riseEase * 0.4;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(popup.x, popup.y + yOffset);
    ctx.scale(scale, scale);
    const label = `×${popup.count}`;
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = COMBO_COLORS[popup.count] ?? COMBO_COLOR_HIGH;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

export function drawConnectionQuality(ctx: Ctx2D, rtt: number, jitter: number, canvasWidth: number): void {
  ctx.save();

  // Determine quality level
  let litBars: number;
  let color: string;
  if (rtt > 150 || jitter > 60) {
    litBars = 1;
    color = '#ff4444';
  } else if (rtt >= 80 || jitter >= 30) {
    litBars = 2;
    color = '#ffcc00';
  } else {
    litBars = 3;
    color = '#00ff88';
  }

  const baseX = canvasWidth - 40;
  const baseY = 12;
  const barWidth = 5;
  const gap = 2;
  const barHeights = [5, 9, 14];

  for (let i = 0; i < 3; i++) {
    const x = baseX + i * (barWidth + gap);
    const h = barHeights[i];
    const y = baseY + (14 - h); // align bottoms
    ctx.fillStyle = i < litBars ? color : 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y, barWidth, h);
  }

  ctx.restore();
}

export function drawCountdown(ctx: Ctx2D, countdown: number): void {
  const secs = Math.ceil(countdown);
  const frac = countdown - Math.floor(countdown);
  const text = secs > 0 ? `${secs}` : 'GO!';

  // Scale-up effect when number just ticked (fractional part near 1)
  const tickScale = frac > 0.8 ? 1 + (frac - 0.8) * 2.5 : 1;

  ctx.save();
  ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  ctx.scale(tickScale, tickScale);

  // Black stroke
  ctx.font = 'bold 80px "Nunito", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 6;
  ctx.strokeText(text, 0, 0);

  // White fill
  ctx.fillStyle = '#FFF';
  ctx.fillText(text, 0, 0);

  ctx.restore();
}
