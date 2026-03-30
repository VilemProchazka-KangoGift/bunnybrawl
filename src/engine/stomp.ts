import type { Player, SplatMark, KillFeedEntry, SpawnPoint, SplatShape } from './types';
import {
  STOMP_VY_THRESHOLD, STOMP_BOUNCE, SPLAT_DURATION,
  RESPAWN_DELAY, INVINCIBLE_DURATION,
} from './constants';
import { aabbOverlap } from './physics';

export function checkStomps(
  players: Player[],
  _spawnPoints: SpawnPoint[],
  timeElapsed: number,
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
        attacker.score += 1;

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
};

export function createSplatMark(victim: Player): SplatMark {
  const particles: Array<{ x: number; y: number; radius: number }> = [];
  const numParticles = 5 + Math.floor(Math.random() * 6);

  for (let i = 0; i < numParticles; i++) {
    particles.push({
      x: (Math.random() - 0.5) * 40,
      y: (Math.random() - 0.5) * 30,
      radius: 3 + Math.random() * 8,
    });
  }

  return {
    x: victim.x + victim.width / 2,
    y: victim.y + victim.height / 2,
    radius: 15 + Math.random() * 10,
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
