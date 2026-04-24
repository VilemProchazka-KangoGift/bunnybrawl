// Lobby bot + NPC AI — pure input generators.

import type { InputState, Player } from './types';
import { CANVAS_WIDTH, PLAYER_WIDTH } from './constants';
import { READY_ZONE_X, WALL_X, WALL_WIDTH, BOT_PAUSE_CHANCE } from './lobbyConstants';

export function botLobbyInput(bot: Player): InputState {
  const slotIdx = parseInt(bot.id[1]) - 1;
  const pauseChance = BOT_PAUSE_CHANCE[slotIdx % BOT_PAUSE_CHANCE.length];

  const zoneWidth = CANVAS_WIDTH - READY_ZONE_X - 20;
  const botTargetX = READY_ZONE_X + 30 + (slotIdx / 5) * zoneWidth;

  // Past the zone entrance: fine-tune to target x
  if (bot.x + PLAYER_WIDTH > READY_ZONE_X + 20) {
    const dxToTarget = botTargetX - bot.x;
    if (Math.abs(dxToTarget) > 30) {
      return { left: dxToTarget < 0, right: dxToTarget > 0, jump: false, down: false };
    }
    return { left: false, right: false, jump: false, down: false };
  }

  if (Math.random() < pauseChance) {
    return { left: false, right: false, jump: false, down: false };
  }

  let jump = false;
  const onGround = bot.state !== 'airborne';
  if (onGround && bot.x + PLAYER_WIDTH > WALL_X - 60 && bot.x < WALL_X + WALL_WIDTH + 20) {
    jump = true;
  }
  if (onGround && Math.abs(bot.x - (WALL_X - PLAYER_WIDTH)) < 4) {
    jump = true;
  }

  return { left: false, right: true, jump, down: false };
}

const AVOID_RADIUS_X = 50;
const AVOID_RADIUS_Y = PLAYER_WIDTH * 1.2;
// Deadzone on the summed repulsion so NPCs at a local spacing equilibrium stop
// instead of oscillating between neighbors on opposite sides.
const REPULSION_DEADZONE = 0.15;

export function wanderInput(npc: Player, npcs: Player[]): InputState {
  const npcCx = npc.x + PLAYER_WIDTH / 2;
  let repulsion = 0;
  for (const o of npcs) {
    if (o === npc) continue;
    if (o.splatTimer > 0) continue;
    const dy = Math.abs(o.y - npc.y);
    if (dy > AVOID_RADIUS_Y) continue;
    const dx = (o.x + PLAYER_WIDTH / 2) - npcCx;
    const abs = Math.abs(dx);
    if (abs >= AVOID_RADIUS_X) continue;
    const strength = 1 - abs / AVOID_RADIUS_X;
    if (dx > 0) repulsion -= strength;
    else if (dx < 0) repulsion += strength;
  }
  if (repulsion > REPULSION_DEADZONE) return { left: false, right: true, jump: false, down: false };
  if (repulsion < -REPULSION_DEADZONE) return { left: true, right: false, jump: false, down: false };

  const left = Math.random() < 0.005;
  const right = Math.random() < 0.005;
  const jump = Math.random() < 0.003;
  const down = !jump && Math.random() < 0.003;
  return { left: left && !right, right: right && !left, jump, down };
}
