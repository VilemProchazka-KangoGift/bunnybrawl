// Lobby canvas rendering. Static scenery + live entities + UI overlays.

import type { Player, CharacterSlot } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_WIDTH } from './constants';
import { KEY_BINDINGS } from './input';
import { getCharacterEmoji, getCharacterDisplayName } from './characters';
import {
  drawTree, drawBush, drawFlower, drawMushroom, drawGrassTuft, drawCloud,
} from './themes/drawPrimitives';
import { drawPlayer } from './rendering/players';
import i18n from '../i18n';
import { updateAndDrawWildlife, drawDayNightCycle } from './canvasAnimations';
import type { SimpleWildlife } from './canvasAnimations';
import {
  READY_ZONE_X, GROUND_Y, WALL_X, WALL_Y, WALL_WIDTH, WALL_HEIGHT,
  LOBBY_DAY_CYCLE, LOBBY_THEME, FLOWER_COLORS, FLOWER_POSITIONS,
} from './lobbyConstants';

// Cached gradients (static coordinates, created once per canvas context)
let _cachedCtx: CanvasRenderingContext2D | null = null;
let _skyGrad: CanvasGradient | null = null;
let _groundGrad: CanvasGradient | null = null;
let _wallGrad: CanvasGradient | null = null;
let _zoneGrad: CanvasGradient | null = null;

function getLobbyGradients(ctx: CanvasRenderingContext2D) {
  if (_cachedCtx !== ctx) {
    _cachedCtx = ctx;
    _skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    _skyGrad.addColorStop(0, '#4A90D9');
    _skyGrad.addColorStop(0.6, '#87CEEB');
    _skyGrad.addColorStop(1, '#B0E0E6');
    _groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_HEIGHT);
    _groundGrad.addColorStop(0, '#4A7C3F');
    _groundGrad.addColorStop(0.3, '#3D6B35');
    _groundGrad.addColorStop(1, '#2D5025');
    _wallGrad = ctx.createLinearGradient(WALL_X, WALL_Y, WALL_X + WALL_WIDTH, WALL_Y + WALL_HEIGHT);
    _wallGrad.addColorStop(0, '#8B7355');
    _wallGrad.addColorStop(0.5, '#A0896B');
    _wallGrad.addColorStop(1, '#7A6548');
    _zoneGrad = ctx.createLinearGradient(READY_ZONE_X, 0, CANVAS_WIDTH, 0);
    _zoneGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    _zoneGrad.addColorStop(0.15, 'rgba(255, 215, 0, 0.05)');
    _zoneGrad.addColorStop(1, 'rgba(255, 215, 0, 0.12)');
  }
  return { sky: _skyGrad!, ground: _groundGrad!, wall: _wallGrad!, zone: _zoneGrad! };
}

export function drawLobby(
  ctx: CanvasRenderingContext2D,
  players: Player[],
  bots: Player[],
  extras: Player[],
  countdown: number,
  countdownActive: boolean,
  dt: number,
  wildlife: SimpleWildlife[] | null,
  isMobile: boolean,
  inZoneCount: number,
  humanInZoneCount: number,
  botInZoneCount: number,
): void {
  const grads = getLobbyGradients(ctx);
  ctx.fillStyle = grads.sky;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // ---- Distant forest treeline ----
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#3A6A3A';
  ctx.beginPath();
  ctx.moveTo(-10, GROUND_Y + 10);
  const treeline = [
    0, -70, 40, -50, 80, -75, 120, -45, 160, -65, 200, -55,
    250, -80, 300, -50, 350, -70, 400, -45, 450, -60, 500, -75,
    550, -50, 600, -80, 650, -55, 700, -65, 750, -50, 800, -70,
    850, -55, 900, -75, 950, -45, 1000, -65, 1050, -55, 1100, -80,
    1150, -50, 1200, -70, 1250, -55, 1300, -65,
  ];
  for (let i = 0; i < treeline.length; i += 2) {
    ctx.lineTo(treeline[i], GROUND_Y + treeline[i + 1]);
  }
  ctx.lineTo(1300, GROUND_Y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ---- Clouds (animated, using drawCloud) ----
  const frameTime = performance.now();
  const now = frameTime / 1000;
  const cloudDefs = [
    { speed: 8, offset: 0, y: 80, size: 70 },
    { speed: 5, offset: 400, y: 50, size: 85 },
    { speed: 11, offset: 800, y: 110, size: 55 },
    { speed: 7, offset: 200, y: 35, size: 65 },
  ];
  for (const c of cloudDefs) {
    const cx = (now * c.speed + c.offset) % (CANVAS_WIDTH + 300) - 150;
    drawCloud(ctx, cx, c.y, c.size);
  }

  // ---- Background hills ----
  const hillDefs: [number, number, number, number][] = [[0, 300, 120, 620], [250, 400, 100, 630], [600, 350, 130, 620], [900, 400, 100, 635]];
  for (const [hx, hw, hh, hby] of hillDefs) {
    ctx.fillStyle = '#5C9E4C';
    ctx.beginPath();
    ctx.moveTo(hx, hby);
    ctx.quadraticCurveTo(hx + hw / 2, hby - hh, hx + hw, hby);
    ctx.lineTo(hx + hw, GROUND_Y + 10);
    ctx.lineTo(hx, GROUND_Y + 10);
    ctx.closePath();
    ctx.fill();
  }

  // ---- Ground ----
  ctx.fillStyle = grads.ground;
  ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
  ctx.fillStyle = '#6BBF59';
  ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, 4);
  ctx.strokeStyle = '#5DAF4A';
  ctx.lineWidth = 2;
  for (let x = 5; x < CANVAS_WIDTH; x += 15) {
    const h = 6 + (x * 7 % 5);
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(x - 2, GROUND_Y - h);
    ctx.stroke();
  }

  // ---- Background trees ----
  drawTree(ctx, 50, GROUND_Y, 55);
  drawTree(ctx, 380, GROUND_Y, 45);
  drawTree(ctx, 650, GROUND_Y, 50);

  // ---- Background bushes ----
  drawBush(ctx, 150, GROUND_Y, 28);
  drawBush(ctx, 300, GROUND_Y, 22);
  drawBush(ctx, 500, GROUND_Y, 25);

  // ---- Flowers ----
  for (const fx of FLOWER_POSITIONS) {
    drawFlower(ctx, fx, GROUND_Y, FLOWER_COLORS[Math.floor(fx * 0.01) % FLOWER_COLORS.length]);
  }

  // ---- Mushrooms ----
  drawMushroom(ctx, 220, GROUND_Y);
  drawMushroom(ctx, 560, GROUND_Y);

  // ---- Grass tufts ----
  for (let gx = 30; gx < WALL_X; gx += 90 + (gx * 3 % 30)) {
    drawGrassTuft(ctx, gx, GROUND_Y);
  }

  // ---- Wildlife (butterflies & birds) ----
  if (wildlife) {
    updateAndDrawWildlife(ctx, wildlife, dt, GROUND_Y);
  }

  // ---- Wall obstacle ----
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(WALL_X + 4, WALL_Y + 4, WALL_WIDTH, WALL_HEIGHT);
  ctx.fillStyle = grads.wall;
  ctx.fillRect(WALL_X, WALL_Y, WALL_WIDTH, WALL_HEIGHT);
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  for (let row = 0; row < WALL_HEIGHT; row += 14) {
    ctx.beginPath(); ctx.moveTo(WALL_X, WALL_Y + row); ctx.lineTo(WALL_X + WALL_WIDTH, WALL_Y + row); ctx.stroke();
    if ((row / 14) % 2 === 0) {
      ctx.beginPath(); ctx.moveTo(WALL_X + WALL_WIDTH * 0.5, WALL_Y + row); ctx.lineTo(WALL_X + WALL_WIDTH * 0.5, WALL_Y + row + 14); ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(WALL_X, WALL_Y, WALL_WIDTH, 2);
  ctx.fillStyle = '#5DAF4A';
  ctx.beginPath();
  ctx.ellipse(WALL_X + WALL_WIDTH / 2, WALL_Y - 1, WALL_WIDTH / 2 + 4, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4A9A3A';
  ctx.lineWidth = 1.5;
  for (let gx = WALL_X + 3; gx < WALL_X + WALL_WIDTH; gx += 5) {
    ctx.beginPath(); ctx.moveTo(gx, WALL_Y - 2); ctx.lineTo(gx - 1, WALL_Y - 7 - (gx * 3 % 4)); ctx.stroke();
  }

  // ---- Ready zone ----
  ctx.fillStyle = grads.zone;
  ctx.fillRect(READY_ZONE_X, 55, CANVAS_WIDTH - READY_ZONE_X, GROUND_Y - 55);

  ctx.strokeStyle = 'rgba(76, 200, 80, 0.7)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(READY_ZONE_X, 55); ctx.lineTo(READY_ZONE_X, GROUND_Y); ctx.stroke();
  ctx.strokeStyle = 'rgba(76, 200, 80, 0.25)';
  ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(READY_ZONE_X, 55); ctx.lineTo(READY_ZONE_X, GROUND_Y); ctx.stroke();

  const goText = i18n.t('lobby_go');
  const goCx = (READY_ZONE_X + CANVAS_WIDTH) / 2;
  const goCy = GROUND_Y / 2 + 40;
  ctx.font = "bold 80px 'Nunito', sans-serif";
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 6;
  ctx.strokeText(goText, goCx, goCy);
  ctx.fillStyle = 'rgba(40, 140, 45, 0.85)';
  ctx.fillText(goText, goCx, goCy);

  // ---- NPCs (behind players) ----
  for (const npc of extras) {
    drawPlayer(ctx, npc, false, LOBBY_THEME, frameTime);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = "10px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(getCharacterDisplayName(npc.character.name, i18n.language), npc.x + PLAYER_WIDTH / 2, npc.y - 5);
  }

  // ---- Bots ----
  for (const bot of bots) {
    drawPlayer(ctx, bot, false, LOBBY_THEME, frameTime);
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

  // ---- Players ----
  for (const p of players) {
    drawPlayer(ctx, p, false, LOBBY_THEME, frameTime);
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

  // ---- UI bar at top ----
  const barH = 52;
  const maxSlotPx = 260;
  const slotCount = players.length;
  const barW = isMobile
    ? Math.min(slotCount * maxSlotPx + 40, CANVAS_WIDTH - 16)
    : CANVAS_WIDTH - 16;
  const barX = isMobile ? CANVAS_WIDTH - barW - 8 : 8;
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
    const player = players[i];
    const sx = barX + 20 + i * slotWidth + slotWidth / 2;
    const emojiX = sx - slotWidth * 0.38;
    const textX = emojiX + 22;

    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getCharacterEmoji(player.character.name), emojiX, 32);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = player.character.color;
    ctx.textAlign = 'left';
    ctx.font = "bold 14px 'Nunito', sans-serif";
    ctx.fillText(`${player.id}: ${getCharacterDisplayName(player.character.name, i18n.language)}`, textX, 26);

    if (!isMobile) {
      const bindings = KEY_BINDINGS[player.id as CharacterSlot];
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = "bold 13px 'Nunito', monospace";
      const fmtKey = (k: string) => k === 'ArrowLeft' ? '←' : k === 'ArrowRight' ? '→' : k === 'ArrowUp' ? '↑' : k === 'ArrowDown' ? '↓' : k;
      ctx.fillText(`${fmtKey(bindings.left)} ${fmtKey(bindings.right)} ${fmtKey(bindings.jump)} ${fmtKey(bindings.down)}`, textX, 42);
    }
  }

  // ---- Bottom-left: swap instruction ----
  const swapText = i18n.t('lobby_title');
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
  const rulesText = `${i18n.t('rules_label')}  🦶 ${i18n.t('rules_stomp')}   🥕 ${i18n.t('rules_carrot')}`;
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
  const joinText = i18n.t('lobby_join');
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
  if (countdownActive && countdown > 0) {
    const secs = Math.ceil(countdown);
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
    ctx.fillText(i18n.t('countdown_skip'), cx, cy + 62);
    ctx.globalAlpha = 1;
  }

  // ---- Player count in zone ----
  if (inZoneCount > 0) {
    const parts: string[] = [];
    if (humanInZoneCount > 0) parts.push(i18n.t('lobby_humans_ready', { count: humanInZoneCount }));
    if (botInZoneCount > 0) parts.push(i18n.t('lobby_bots_ready', { count: botInZoneCount }));
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

  // ---- Day/night cycle ----
  drawDayNightCycle(ctx, performance.now() / 1000, LOBBY_DAY_CYCLE);
}
