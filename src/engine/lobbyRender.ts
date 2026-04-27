// Lobby HUD overlay. World rendering lives in the lobby arena pack;
// this module only paints the UI layer (ready zone, character labels,
// countdown, instructions) on the dedicated hud canvas via the standard
// Renderer's lobby-mode hook.

import type { Player, CharacterSlot } from './types';
import { CANVAS_WIDTH, PLAYER_WIDTH } from './constants';
import { KEY_BINDINGS } from './input';
import { getCharacterEmoji, getCharacterDisplayName } from './characters';
import i18n from '../i18n';
import { READY_ZONE_X, GROUND_Y } from './lobbyConstants';

// Cached zone gradient — kept stable across overlay frames since the readyzone
// rect doesn't move.
let _overlayCtx: CanvasRenderingContext2D | null = null;
let _overlayZoneGrad: CanvasGradient | null = null;

function getOverlayZoneGrad(ctx: CanvasRenderingContext2D): CanvasGradient {
  if (_overlayCtx !== ctx) {
    _overlayCtx = ctx;
    _overlayZoneGrad = ctx.createLinearGradient(READY_ZONE_X, 0, CANVAS_WIDTH, 0);
    _overlayZoneGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    _overlayZoneGrad.addColorStop(0.15, 'rgba(255, 215, 0, 0.05)');
    _overlayZoneGrad.addColorStop(1, 'rgba(255, 215, 0, 0.12)');
  }
  return _overlayZoneGrad!;
}

export interface LobbyOverlayState {
  players: Player[];
  bots: Player[];
  extras: Player[];
  countdown: number;
  countdownActive: boolean;
  isMobile: boolean;
  inZoneCount: number;
  humanInZoneCount: number;
  botInZoneCount: number;
}

/**
 * Draw the lobby's HUD-class overlays on top of the world rendering. Called
 * by the standard Renderer in lobbyMode after the iso platforms / players /
 * day-night layers have been painted. World drawing (sky, hills, ground,
 * wall, players) lives in the lobby arena pack — this function is purely
 * UI: ready zone, character labels, countdown, instructions.
 */
export function drawLobbyOverlay(
  ctx: CanvasRenderingContext2D,
  state: LobbyOverlayState,
): void {
  // Read i18n once per frame — calling i18n.t / i18n.language inside loops
  // costs ~30 dictionary lookups per frame for ~25 entities + static labels.
  const lang = i18n.language;
  const goText = i18n.t('lobby_go');
  const swapText = i18n.t('lobby_title');
  const rulesText = `${i18n.t('rules_label')}  🦶 ${i18n.t('rules_stomp')}   🥕 ${i18n.t('rules_carrot')}`;
  const joinText = i18n.t('lobby_join');
  const skipText = i18n.t('countdown_skip');

  // ---- Ready zone ----
  ctx.fillStyle = getOverlayZoneGrad(ctx);
  ctx.fillRect(READY_ZONE_X, 55, CANVAS_WIDTH - READY_ZONE_X, GROUND_Y - 55);

  ctx.strokeStyle = 'rgba(76, 200, 80, 0.7)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(READY_ZONE_X, 55); ctx.lineTo(READY_ZONE_X, GROUND_Y); ctx.stroke();
  ctx.strokeStyle = 'rgba(76, 200, 80, 0.25)';
  ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(READY_ZONE_X, 55); ctx.lineTo(READY_ZONE_X, GROUND_Y); ctx.stroke();

  const goCx = (READY_ZONE_X + CANVAS_WIDTH) / 2;
  const goCy = GROUND_Y / 2 + 40;
  ctx.font = "bold 80px 'Nunito', sans-serif";
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 6;
  ctx.strokeText(goText, goCx, goCy);
  ctx.fillStyle = 'rgba(40, 140, 45, 0.85)';
  ctx.fillText(goText, goCx, goCy);

  // ---- Per-character labels (NPCs, bots, players) ----
  for (const npc of state.extras) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = "10px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(getCharacterDisplayName(npc.character.name, lang), npc.x + PLAYER_WIDTH / 2, npc.y - 5);
  }
  for (const bot of state.bots) {
    const tagX = bot.x + PLAYER_WIDTH / 2;
    const tagW = 36;
    ctx.fillStyle = 'rgba(80, 60, 120, 0.6)';
    ctx.beginPath();
    ctx.roundRect(tagX - tagW / 2, bot.y - 22, tagW, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#C8A0FF';
    ctx.font = "bold 10px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('BOT', tagX, bot.y - 10);
  }
  for (const p of state.players) {
    const tagX = p.x + PLAYER_WIDTH / 2;
    const tagW = 36;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect(tagX - tagW / 2, p.y - 22, tagW, 16, 4);
    ctx.fill();
    ctx.fillStyle = p.character.color;
    ctx.font = "bold 10px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(`${p.id}`, tagX, p.y - 10);
  }

  // ---- Top UI bar: per-slot character + key bindings ----
  const barH = 52;
  const maxSlotPx = 260;
  const slotCount = state.players.length;
  const barW = state.isMobile
    ? Math.min(slotCount * maxSlotPx + 40, CANVAS_WIDTH - 16)
    : CANVAS_WIDTH - 16;
  const barX = state.isMobile ? CANVAS_WIDTH - barW - 8 : 8;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.roundRect(barX, 6, barW, barH, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(barX + 1, 7, barW - 2, barH - 2, 9);
  ctx.stroke();

  const slotWidth = (barW - 40) / slotCount;
  for (let i = 0; i < slotCount; i++) {
    const player = state.players[i];
    const sx = barX + 20 + i * slotWidth + slotWidth / 2;
    const emojiX = sx - slotWidth * 0.38;
    const textX = emojiX + 22;

    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFF';
    ctx.fillText(getCharacterEmoji(player.character.name), emojiX, 32);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = player.character.color;
    ctx.textAlign = 'left';
    ctx.font = "bold 14px 'Nunito', sans-serif";
    ctx.fillText(`${player.id}: ${getCharacterDisplayName(player.character.name, lang)}`, textX, 26);

    if (!state.isMobile) {
      const bindings = KEY_BINDINGS[player.id as CharacterSlot];
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = "bold 13px 'Nunito', monospace";
      const fmtKey = (k: string) => k === 'ArrowLeft' ? '←' : k === 'ArrowRight' ? '→' : k === 'ArrowUp' ? '↑' : k === 'ArrowDown' ? '↓' : k;
      ctx.fillText(`${fmtKey(bindings.left)} ${fmtKey(bindings.right)} ${fmtKey(bindings.jump)} ${fmtKey(bindings.down)}`, textX, 42);
    }
  }

  // ---- Bottom-left: swap instruction ----
  ctx.font = "bold 16px 'Nunito', sans-serif";
  const swapW = ctx.measureText(swapText).width + 28;
  const blX = 14;
  const blY = GROUND_Y + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(blX, blY, swapW, 32, 8);
  ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(swapText, blX + 14, blY + 16);
  ctx.textBaseline = 'alphabetic';

  // ---- Rules hint ----
  ctx.font = "14px 'Nunito', sans-serif";
  ctx.textAlign = 'center';
  const rulesCx = (READY_ZONE_X + CANVAS_WIDTH) / 2;
  const rulesY = GROUND_Y / 2 + 80;
  ctx.globalAlpha = 0.7;
  const rulesW = ctx.measureText(rulesText).width + 24;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(rulesCx - rulesW / 2, rulesY - 12, rulesW, 24, 6);
  ctx.fill();
  ctx.fillStyle = '#DDD';
  ctx.textBaseline = 'middle';
  ctx.fillText(rulesText, rulesCx, rulesY);
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;

  // ---- Bottom-right: join instruction with arrow ----
  ctx.font = "bold 16px 'Nunito', sans-serif";
  const joinW = ctx.measureText(joinText).width + 50;
  const brX = CANVAS_WIDTH - joinW - 14;
  const brY = GROUND_Y + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(brX, brY, joinW, 32, 8);
  ctx.fill();
  ctx.fillStyle = '#7CFC00';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = "bold 20px 'Nunito', sans-serif";
  ctx.fillText('↑', brX + 10, brY + 16);
  ctx.font = "bold 16px 'Nunito', sans-serif";
  ctx.fillText(joinText, brX + 30, brY + 16);
  ctx.textBaseline = 'alphabetic';

  // ---- Countdown ----
  if (state.countdownActive && state.countdown > 0) {
    const secs = Math.ceil(state.countdown);
    const cx = (READY_ZONE_X + CANVAS_WIDTH) / 2;
    const cy = GROUND_Y / 2 + 115;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect(cx - 90, cy, 180, 48, 14);
    ctx.fill();
    ctx.fillStyle = '#FFD700';
    ctx.font = "bold 26px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('lobby_starting', { seconds: secs }), cx, cy + 31);
    ctx.font = "14px 'Nunito', sans-serif";
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#FFF';
    ctx.fillText(skipText, cx, cy + 62);
    ctx.globalAlpha = 1;
  }

  // ---- Player count in zone ----
  if (state.inZoneCount > 0) {
    const parts: string[] = [];
    if (state.humanInZoneCount > 0) parts.push(i18n.t('lobby_humans_ready', { count: state.humanInZoneCount }));
    if (state.botInZoneCount > 0) parts.push(i18n.t('lobby_bots_ready', { count: state.botInZoneCount }));
    const readyText = parts.join(' + ');
    ctx.font = "bold 16px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    const rw = ctx.measureText(readyText).width + 24;
    const rx = (READY_ZONE_X + CANVAS_WIDTH) / 2;
    const ry = GROUND_Y - 22;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(rx - rw / 2, ry, rw, 24, 6);
    ctx.fill();
    ctx.fillStyle = '#7CFC00';
    ctx.textBaseline = 'middle';
    ctx.fillText(readyText, rx, ry + 12);
    ctx.textBaseline = 'alphabetic';
  }
}
