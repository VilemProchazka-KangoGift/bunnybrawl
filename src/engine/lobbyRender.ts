import type { Ctx2D } from './types';
// Lobby HUD overlay. World rendering lives in the lobby arena pack;
// this module only paints the UI layer (ready zone, character labels,
// countdown, instructions) on the dedicated hud canvas via the standard
// Renderer's lobby-mode hook.

import type { Player, CharacterSlot } from './types';
import { CANVAS_WIDTH, PLAYER_WIDTH } from './constants';
import { KEY_BINDINGS } from './input';
import { UI_THEME } from '../uiTheme';
import { drawUiPortrait } from './rendering/uiPortrait';
import { getCharacterDisplayName } from './characters';
import i18n from '../i18n';
import { READY_ZONE_X, GROUND_Y } from './lobbyConstants';

// Cached zone gradient — kept stable across overlay frames since the readyzone
// rect doesn't move.
let _overlayCtx: Ctx2D | null = null;
let _overlayZoneGrad: CanvasGradient | null = null;

function getOverlayZoneGrad(ctx: Ctx2D): CanvasGradient {
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
  ctx: Ctx2D,
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

  // ---- Per-character labels (bots, players) ----
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

  // ---- Top player tickets. World art and start-zone drawing stay unchanged. ----
  const slotCount = state.players.length;
  const slotWidth = Math.min(242, (CANVAS_WIDTH - 100) / Math.max(1, slotCount));
  const barX = state.isMobile ? CANVAS_WIDTH - slotWidth * slotCount - 18 : 80;
  for (let i = 0; i < slotCount; i++) {
    const player = state.players[i];
    const x = barX + i * slotWidth;
    ctx.save(); ctx.translate(x, 0);
    ctx.fillStyle = UI_THEME.ink; ctx.beginPath(); ctx.roundRect(0, 33, slotWidth - 16, 79, 14); ctx.fill();
    ctx.fillStyle = player.character.lightColor; ctx.strokeStyle = UI_THEME.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(0, 28, slotWidth - 16, 79, 14); ctx.fill(); ctx.stroke();
    drawUiPortrait(ctx, player.character.name, -3, 0, 90);
    ctx.fillStyle = UI_THEME.ink; ctx.textAlign = 'left'; ctx.font = "bold 16px 'Nunito', sans-serif";
    ctx.fillText(`${player.id} · ${getCharacterDisplayName(player.character.name, lang)}`, 94, 52, slotWidth - 115);
    if (!state.isMobile) {
      const bindings = KEY_BINDINGS[player.id as CharacterSlot];
      const fmt = (key: string) => key.replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('ArrowUp', '↑').replace('ArrowDown', '↓');
      const keys = [bindings.left, bindings.right, bindings.jump, bindings.down];
      const keyX = (slotWidth - 16 - 132) / 2;
      ctx.fillStyle = UI_THEME.paper; ctx.beginPath(); ctx.roundRect(10, 72, slotWidth - 36, 28, 7); ctx.fill();
      keys.forEach((key, j) => { ctx.strokeStyle = UI_THEME.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(keyX + j * 34, 76, 27, 20, 4); ctx.stroke(); ctx.fillStyle = UI_THEME.ink; ctx.textAlign = 'center'; ctx.font = "bold 12px 'Nunito', sans-serif"; ctx.fillText(fmt(key), keyX + j * 34 + 13.5, 90); });
    }
    ctx.restore();
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
