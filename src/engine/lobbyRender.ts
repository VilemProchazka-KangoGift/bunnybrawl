import type { Ctx2D } from './types';
// Lobby HUD overlay. World rendering lives in the lobby arena pack;
// this module only paints the UI layer (ready zone, character labels,
// countdown, instructions) on the dedicated hud canvas via the standard
// Renderer's lobby-mode hook.

import type { Player, CharacterSlot } from './types';
import { CANVAS_WIDTH } from './constants';
import { KEY_BINDINGS } from './input';
import { UI_THEME } from '../uiTheme';
import { drawUiPortrait } from './rendering/uiPortrait';
import { getCharacterDisplayName } from './characters';
import i18n from '../i18n';
import { READY_ZONE_X, GROUND_Y, WALL_X, WALL_WIDTH, WALL_Y } from './lobbyConstants';

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
  const swapText = i18n.t('lobby_title');
  const rulesText = `${i18n.t('rules_label')}  🦶 ${i18n.t('rules_stomp')}   🥕 ${i18n.t('rules_carrot')}`;
  const skipText = i18n.t('countdown_skip');

  const goCx = (READY_ZONE_X + CANVAS_WIDTH) / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // A paper pennant, not a clickable button. Everything points DOWN to a bounded spot.
  ctx.fillStyle = UI_THEME.paper; ctx.strokeStyle = UI_THEME.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(goCx - 150, 249); ctx.lineTo(goCx + 150, 247);
  ctx.lineTo(goCx + 141, 273); ctx.lineTo(goCx + 150, 301);
  ctx.lineTo(goCx - 150, 303); ctx.lineTo(goCx - 141, 276); ctx.closePath(); ctx.fill(); ctx.stroke();
  fitLabel(ctx, i18n.t('lobby_gather'), goCx, 276, 262, 31);
  lobbyCard(ctx, goCx - 151, 320, 302, 84, UI_THEME.paper);
  wrapLabel(ctx, i18n.t('lobby_stay'), goCx, 340, 275, 17, 20);
  wrapLabel(ctx, i18n.t('lobby_need_two'), goCx, 372, 275, 14, 18);
  const readyParts = [i18n.t('lobby_humans_ready', { count: state.humanInZoneCount })];
  if (state.botInZoneCount) readyParts.push(i18n.t('lobby_bots_ready', { count: state.botInZoneCount }));
  lobbyCard(ctx, goCx - 108, 418, 216, 32, state.inZoneCount >= 2 ? UI_THEME.leaf : UI_THEME.paper);
  fitLabel(ctx, readyParts.join(' + '), goCx, 434, 194, 16);
  if (!state.countdownActive) {
    ctx.strokeStyle = UI_THEME.ink; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(goCx, 465); ctx.lineTo(goCx, 492); ctx.moveTo(goCx - 12, 482); ctx.lineTo(goCx, 494); ctx.lineTo(goCx + 12, 482); ctx.stroke();
  }
  // Mark the entire actual ready zone; preserve both its left and right boundaries.
  ctx.fillStyle = UI_THEME.action; ctx.strokeStyle = UI_THEME.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(READY_ZONE_X + 3, GROUND_Y - 4, CANVAS_WIDTH - READY_ZONE_X - 32, 20, 8); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.setLineDash([6, 7]); ctx.strokeStyle = UI_THEME.paper; ctx.lineWidth = 3;
  for (const x of [READY_ZONE_X + 4, CANVAS_WIDTH - 29]) { ctx.beginPath(); ctx.moveTo(x, GROUND_Y - 69); ctx.lineTo(x, GROUND_Y - 8); ctx.stroke(); } ctx.restore();
  // Jump tutorial: compact key cue and an arc crossing the physical log.
  const logCx = WALL_X + WALL_WIDTH / 2;
  lobbyCard(ctx, logCx - 126, WALL_Y - 88, 252, 40, UI_THEME.paper);
  fitLabel(ctx, i18n.t('lobby_jump_log'), logCx, WALL_Y - 68, 228, 18);
  ctx.save(); ctx.setLineDash([5, 6]); ctx.strokeStyle = UI_THEME.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(WALL_X - 22, WALL_Y + 8);
  ctx.quadraticCurveTo(logCx, WALL_Y - 71, WALL_X + WALL_WIDTH + 22, WALL_Y + 8); ctx.stroke(); ctx.restore();
  ctx.fillStyle = UI_THEME.ink; ctx.beginPath(); ctx.moveTo(WALL_X + WALL_WIDTH + 22, WALL_Y + 8); ctx.lineTo(WALL_X + WALL_WIDTH + 10, WALL_Y + 3); ctx.lineTo(WALL_X + WALL_WIDTH + 24, WALL_Y - 5); ctx.closePath(); ctx.fill();
  ctx.textBaseline = 'alphabetic';

  // ---- Per-character labels (bots, players) ----
  for (const bot of state.bots) {
    const tagX = bot.x + bot.width / 2;
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
    const tagX = p.x + p.width / 2;
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
  // Ground instructions use the same paper, ink and hard shadow as menus.
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  lobbyCard(ctx, 26, GROUND_Y + 28, 574, 57, UI_THEME.paper);
  ctx.fillStyle = UI_THEME.action; ctx.beginPath(); ctx.arc(56, GROUND_Y + 56, 17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = UI_THEME.ink; ctx.textAlign = 'center'; ctx.font = "900 24px 'Nunito', sans-serif"; ctx.fillText('↓', 56, GROUND_Y + 56);
  ctx.textAlign = 'left'; fitLabel(ctx, swapText, 86, GROUND_Y + 57, 489, 20);
  lobbyCard(ctx, 626, GROUND_Y + 28, 628, 57, UI_THEME.paper);
  ctx.textAlign = 'center'; fitLabel(ctx, rulesText, 940, GROUND_Y + 57, 596, 18);
  if (state.countdownActive && state.countdown > 0) {
    lobbyCard(ctx, goCx - 143, 418, 286, 38, UI_THEME.action);
    fitLabel(ctx, i18n.t('lobby_starting', { seconds: Math.ceil(state.countdown) }), goCx, 437, 264, 20);
    ctx.fillStyle = UI_THEME.ink; ctx.font = "800 14px 'Nunito', sans-serif"; ctx.fillText(skipText, goCx, 475);
  }
  ctx.textBaseline = 'alphabetic';
}

function lobbyCard(ctx: Ctx2D, x: number, y: number, w: number, h: number, fill: string): void {
  ctx.fillStyle = UI_THEME.ink; ctx.beginPath(); ctx.roundRect(x, y + 5, w, h, 14); ctx.fill();
  ctx.fillStyle = fill; ctx.strokeStyle = UI_THEME.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill(); ctx.stroke();
}
function fitLabel(ctx: Ctx2D, text: string, x: number, y: number, width: number, size: number): void {
  ctx.fillStyle = UI_THEME.ink; ctx.font = '900 ' + size + 'px Nunito, sans-serif';
  const measured = ctx.measureText(text).width;
  if (measured > width) ctx.font = '900 ' + Math.max(12, size * width / measured) + 'px Nunito, sans-serif';
  ctx.fillText(text, x, y, width);
}

function wrapLabel(ctx: Ctx2D, text: string, x: number, y: number, width: number, size: number, lineHeight: number): void {
  ctx.fillStyle = UI_THEME.ink;
  let lines: string[] = [];
  for (let fontSize = size; fontSize >= 12; fontSize--) {
    ctx.font = '800 ' + fontSize + 'px Nunito, sans-serif';
    lines = []; let line = '';
    for (const word of text.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
    if (lines.length <= 2) break;
  }
  lines.forEach((value, i) => ctx.fillText(value, x, y + i * lineHeight, width));
}
