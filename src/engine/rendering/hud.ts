import type { Player, MatchState } from '../types';
import { isBotSlot } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, SCORE_ANIM_DURATION } from '../constants';
import { getCharacterEmoji, getCharacterDisplayName } from '../characters';
import i18n from '../../i18n';

// HUD cache state (module-level)
let hudCache: OffscreenCanvas | null = null;
let hudCacheCtx: OffscreenCanvasRenderingContext2D | null = null;
let hudLastTimer = -1;
let hudLastPlayerCount = -1;
const _hudPlayerScores: Record<string, number> = {};
const _hudPlayerActive: Record<string, boolean> = {};
// Shared between drawHUDImpl and drawScoreAnimations
let _hudActivePlayers: Player[] = [];
let _hudStartX = 0;
let _hudScoreWidth = 0;

export function invalidateHudCache(): void {
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

/** Check whether the HUD cache needs rebuild. No side effects. */
export function isHudDirty(state: MatchState): boolean {
  const timerSec = Math.floor(state.timeElapsed);
  if (timerSec !== hudLastTimer || !hudCache) return true;
  let activeCount = 0;
  for (const p of state.players) {
    if (p.active) activeCount++;
    if (p.score !== (_hudPlayerScores?.[p.id as string] ?? -1)) return true;
    if (p.active !== (_hudPlayerActive?.[p.id as string] ?? false)) return true;
  }
  if (activeCount !== hudLastPlayerCount) return true;
  return false;
}

export function drawHUD(ctx: CanvasRenderingContext2D, state: MatchState, frameTime: number, playerNames: Record<string, string> | null, timeLimit = 0, precomputedDirty?: boolean): void {
  const needsRedraw = precomputedDirty !== undefined ? precomputedDirty : isHudDirty(state);

  if (needsRedraw) {
    if (!hudCache) {
      hudCache = new OffscreenCanvas(CANVAS_WIDTH, 90);
      hudCacheCtx = hudCache.getContext('2d')!;
    }
    const hctx = hudCacheCtx!;
    hctx.clearRect(0, 0, CANVAS_WIDTH, 90);

    // Draw HUD content to cache
    _drawHUDImpl(hctx as unknown as CanvasRenderingContext2D, state, frameTime, playerNames, timeLimit);

    hudLastTimer = Math.floor(state.timeElapsed);
    let ac = 0;
    for (const p of state.players) {
      _hudPlayerScores[p.id as string] = p.score;
      _hudPlayerActive[p.id as string] = p.active;
      if (p.active) ac++;
    }
    hudLastPlayerCount = ac;
  }

  // Blit cached HUD
  ctx.drawImage(hudCache!, 0, 0);

  // Score animations are drawn on main ctx (they're transient)
  if (state.scoreAnimations && state.scoreAnimations.length > 0) {
    _drawScoreAnimations(ctx, state);
  }
}

function _drawHUDImpl(ctx: CanvasRenderingContext2D, state: MatchState, frameTime: number, playerNames: Record<string, string> | null, timeLimit = 0): void {
  const activePlayers = state.players.filter(p => p.active);
  const scoreWidth = Math.min(160, Math.floor((CANVAS_WIDTH - 40) / activePlayers.length));
  const compact = scoreWidth < 130;
  const totalWidth = activePlayers.length * scoreWidth;
  const startX = (CANVAS_WIDTH - totalWidth) / 2;

  // Store for _drawScoreAnimations
  _hudActivePlayers = activePlayers;
  _hudStartX = startX;
  _hudScoreWidth = scoreWidth;

  for (let i = 0; i < activePlayers.length; i++) {
    const player = activePlayers[i];
    const px = startX + i * scoreWidth;
    const isBot = isBotSlot(player.id);

    ctx.fillStyle = isBot ? 'rgba(40, 20, 60, 0.55)' : 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.roundRect(px, 10, scoreWidth - 10, 40, 8);
    ctx.fill();

    // Character emoji
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getCharacterEmoji(player.character.name), px + 20, 30);
    ctx.textBaseline = 'alphabetic';

    const customName = playerNames?.[player.id];
    const translatedName = customName || getCharacterDisplayName(player.character.name, i18n.language);
    const displayName = compact ? translatedName.slice(0, 4) : translatedName;
    ctx.fillStyle = player.character.color;
    ctx.font = `bold ${compact ? 12 : 16}px "Press Start 2P", monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(displayName, px + 38, 28);
    ctx.fillStyle = '#FFF';
    ctx.font = `bold ${compact ? 14 : 18}px "Press Start 2P", monospace`;
    ctx.fillText(`${player.score}`, px + 38, 45);

    // Small bot indicator
    if (isBot) {
      ctx.fillStyle = 'rgba(180, 140, 255, 0.7)';
      ctx.font = 'bold 7px monospace';
      ctx.fillText('BOT', px + 4, 18);
    }
  }

  if (state.timeElapsed >= 0) {
    const minutes = Math.floor(state.timeElapsed / 60);
    const seconds = Math.floor(state.timeElapsed % 60);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.roundRect(CANVAS_WIDTH / 2 - 40, 55, 80, 30, 6);
    ctx.fill();

    // Timer red pulse when < 30 seconds remaining
    const remaining = timeLimit > 0 ? timeLimit - state.timeElapsed : Infinity;
    if (remaining < 30 && remaining > 0) {
      const pulse = 1 + Math.sin(frameTime / 200) * 0.1;
      ctx.save();
      ctx.translate(CANVAS_WIDTH / 2, 75);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#FF4444';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${minutes}:${seconds.toString().padStart(2, '0')}`, 0, 0);
      ctx.restore();
    } else {
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${minutes}:${seconds.toString().padStart(2, '0')}`, CANVAS_WIDTH / 2, 75);
    }
  }
}

function _drawScoreAnimations(ctx: CanvasRenderingContext2D, state: MatchState): void {
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

export function drawConnectionQuality(ctx: CanvasRenderingContext2D, rtt: number, jitter: number, canvasWidth: number): void {
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

export function drawCountdown(ctx: CanvasRenderingContext2D, countdown: number): void {
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
