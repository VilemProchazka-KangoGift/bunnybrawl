import type { Player, SplatMark, KillFeedEntry, SpawnPoint, SplatShape, GibType, GameMods } from './types';
import {
  STOMP_VY_THRESHOLD, STOMP_BOUNCE, SPLAT_DURATION,
  RESPAWN_DELAY, INVINCIBLE_DURATION,
} from './constants';
import { aabbOverlap } from './physics';

export function checkStomps(
  players: Player[],
  _spawnPoints: SpawnPoint[],
  timeElapsed: number,
  mods?: GameMods,
): { splatMarks: SplatMark[]; killFeedEntries: KillFeedEntry[] } {
  const splatMarks: SplatMark[] = [];
  const killFeedEntries: KillFeedEntry[] = [];

  for (const attacker of players) {
    if (!attacker.active || attacker.state === 'splat' || attacker.state === 'respawning') continue;

    for (const victim of players) {
      if (victim === attacker) continue;
      if (!victim.active || victim.state === 'splat' || victim.state === 'respawning') continue;
      if (victim.invincibleTimer > 0) continue;

      if (isStomping(attacker, victim)) {
        // Stomp!
        victim.state = 'splat';
        victim.splatTimer = SPLAT_DURATION;
        victim.vx = 0;
        victim.vy = 0;

        attacker.vy = STOMP_BOUNCE;
        attacker.state = 'airborne';
        if (!mods?.carrotChase) attacker.score += 2;

        splatMarks.push(createSplatMark(victim));
        killFeedEntries.push({
          attacker: attacker.id,
          victim: victim.id,
          timestamp: timeElapsed,
        });
      }
    }
  }

  return { splatMarks, killFeedEntries };
}

export function isStomping(attacker: Player, victim: Player): boolean {
  // Attacker must be moving downward
  if (attacker.vy < STOMP_VY_THRESHOLD) return false;

  // Check bounding box overlap
  if (!aabbOverlap(
    attacker.x, attacker.y, attacker.width, attacker.height,
    victim.x, victim.y, victim.width, victim.height
  )) return false;

  // Attacker's bottom edge must be near victim's top edge
  const attackerBottom = attacker.y + attacker.height;
  const victimTop = victim.y;
  const overlap = attackerBottom - victimTop;

  // The stomp zone: attacker's feet are within top portion of victim
  return overlap > 0 && overlap < victim.height * 0.5;
}

const CHARACTER_SPLAT_SHAPES: Record<string, SplatShape> = {
  Bunny: 'paw',
  Fox: 'star',
  Frog: 'splat',
  Bear: 'circle',
  Owl: 'ring',
  Cat: 'paw',
  Wolf: 'star',
  Panda: 'circle',
  Pig: 'circle',
  Cow: 'splat',
  Goat: 'star',
  Horse: 'circle',
  Sheep: 'paw',
  Monkey: 'star',
  Tiger: 'paw',
  Rhino: 'circle',
  Hedgehog: 'star',
};

export interface GibDef {
  gibType: GibType;
  width: number;
  height: number;
}

export const CHARACTER_GIBS: Record<string, GibDef[]> = {
  Bunny:  [{ gibType: 'ear', width: 8, height: 20 }, { gibType: 'ear', width: 8, height: 20 }, { gibType: 'tail', width: 8, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
  Fox:    [{ gibType: 'ear', width: 10, height: 10 }, { gibType: 'ear', width: 10, height: 10 }, { gibType: 'tail', width: 16, height: 10 }, { gibType: 'snout', width: 8, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
  Frog:   [{ gibType: 'body', width: 12, height: 10 }, { gibType: 'body', width: 10, height: 10 }, { gibType: 'body', width: 11, height: 9 }],
  Bear:   [{ gibType: 'ear', width: 10, height: 10 }, { gibType: 'ear', width: 10, height: 10 }, { gibType: 'snout', width: 10, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
  Owl:    [{ gibType: 'wing', width: 12, height: 8 }, { gibType: 'wing', width: 12, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
  Cat:    [{ gibType: 'ear', width: 8, height: 10 }, { gibType: 'ear', width: 8, height: 10 }, { gibType: 'tail', width: 14, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
  Wolf:   [{ gibType: 'ear', width: 8, height: 12 }, { gibType: 'ear', width: 8, height: 12 }, { gibType: 'tail', width: 16, height: 10 }, { gibType: 'body', width: 14, height: 12 }],
  Panda:  [{ gibType: 'ear', width: 10, height: 10 }, { gibType: 'ear', width: 10, height: 10 }, { gibType: 'body', width: 14, height: 12 }, { gibType: 'body', width: 10, height: 10 }],
  Pig:    [{ gibType: 'ear', width: 8, height: 10 }, { gibType: 'ear', width: 8, height: 10 }, { gibType: 'snout', width: 8, height: 6 }, { gibType: 'tail', width: 10, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
  Cow:    [{ gibType: 'horn', width: 8, height: 12 }, { gibType: 'horn', width: 8, height: 12 }, { gibType: 'tail', width: 14, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
  Goat:   [{ gibType: 'horn', width: 8, height: 14 }, { gibType: 'horn', width: 8, height: 14 }, { gibType: 'beard', width: 8, height: 10 }, { gibType: 'body', width: 14, height: 12 }],
  Horse:  [{ gibType: 'ear', width: 8, height: 10 }, { gibType: 'ear', width: 8, height: 10 }, { gibType: 'mane', width: 12, height: 14 }, { gibType: 'body', width: 14, height: 12 }],
  Sheep:  [{ gibType: 'ear', width: 8, height: 8 }, { gibType: 'ear', width: 8, height: 8 }, { gibType: 'wool', width: 14, height: 12 }, { gibType: 'body', width: 14, height: 12 }],
  Monkey: [{ gibType: 'ear', width: 10, height: 10 }, { gibType: 'ear', width: 10, height: 10 }, { gibType: 'tail', width: 16, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
  Tiger:  [{ gibType: 'ear', width: 10, height: 10 }, { gibType: 'ear', width: 10, height: 10 }, { gibType: 'snout', width: 8, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
  Rhino:  [{ gibType: 'ear', width: 8, height: 8 }, { gibType: 'ear', width: 8, height: 8 }, { gibType: 'horn', width: 8, height: 14 }, { gibType: 'body', width: 14, height: 12 }],
  Hedgehog: [{ gibType: 'spine', width: 6, height: 10 }, { gibType: 'spine', width: 6, height: 10 }, { gibType: 'snout', width: 8, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
};

export function createSplatMark(victim: Player): SplatMark {
  const particles: Array<{ x: number; y: number; radius: number }> = [];
  const numParticles = 8 + Math.floor(Math.random() * 8);

  for (let i = 0; i < numParticles; i++) {
    particles.push({
      x: (Math.random() - 0.5) * 60,
      y: (Math.random() - 0.5) * 45,
      radius: 4 + Math.random() * 10,
    });
  }

  return {
    x: victim.x + victim.width / 2,
    y: victim.y + victim.height / 2,
    radius: 20 + Math.random() * 15,
    color: victim.character.color,
    shape: CHARACTER_SPLAT_SHAPES[victim.character.name] ?? 'circle',
    particles,
  };
}

export function updateSplatTimers(
  players: Player[],
  spawnPoints: SpawnPoint[],
  dt: number,
): void {
  for (const player of players) {
    if (!player.active) continue;

    if (player.state === 'splat') {
      player.splatTimer -= dt;
      if (player.splatTimer <= 0) {
        player.state = 'respawning';
        player.respawnTimer = RESPAWN_DELAY;
      }
    }

    if (player.state === 'respawning') {
      player.respawnTimer -= dt;
      if (player.respawnTimer <= 0) {
        respawnPlayer(player, spawnPoints, players);
      }
    }

    if (player.invincibleTimer > 0) {
      player.invincibleTimer -= dt;
    }
  }
}

export function respawnPlayer(player: Player, spawnPoints: SpawnPoint[], allPlayers?: Player[]): void {
  const spawn = pickSafeSpawn(player, spawnPoints, allPlayers);
  player.x = spawn.x - player.width / 2;
  player.y = spawn.y - player.height;
  player.vx = 0;
  player.vy = 0;
  player.state = 'idle';
  player.invincibleTimer = INVINCIBLE_DURATION;
  player.splatTimer = 0;
  player.respawnTimer = 0;
  player.fastFalling = false;
  player.fatTimer = 0;
  player.slowTimer = 0;
  player.burnTimer = 0;
  player.hitstopTimer = 0;
}

function pickSafeSpawn(player: Player, spawnPoints: SpawnPoint[], allPlayers?: Player[]): SpawnPoint {
  if (!allPlayers || allPlayers.length === 0) {
    return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
  }

  const others = allPlayers.filter(
    p => p !== player && p.active && p.state !== 'splat' && p.state !== 'respawning'
  );

  // Score each spawn point by distance to nearest player — pick the safest
  let bestSpawn = spawnPoints[0];
  let bestMinDist = -1;

  for (const sp of spawnPoints) {
    let minDist = Infinity;
    for (const other of others) {
      const dx = sp.x - (other.x + other.width / 2);
      const dy = sp.y - (other.y + other.height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) minDist = dist;
    }
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      bestSpawn = sp;
    }
  }

  return bestSpawn;
}
