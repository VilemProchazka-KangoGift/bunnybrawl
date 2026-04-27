// src/engine/gameLoop/gameplay/stomps.ts
import type { MatchState, MatchSettings, Arena, PlayerSlot } from '../../types';
import { SCREEN_SHAKE_DURATION, HITSTOP_DURATION } from '../../constants';
import { checkStomps, updateSplatTimers } from '../../stomp';
import { collidePlayersHorizontal, collidePlatforms } from '../../physics';
import type { SeededRNG } from '../../net/prng';

/**
 * Run stomp detection, process kills (stats, hitstop, damage flash, kill feed),
 * resolve player-player horizontal collisions, and update splat timers.
 *
 * `onStompHaptic` is called once per slot involved in a kill (attacker AND
 * victim). The browser adapter wires it to local-haptic dispatch; headless
 * runners pass undefined.
 */
export function processStompsAndCollisions(
  state: MatchState, arena: Arena, settings: MatchSettings,
  dt: number, resimulating: boolean, rng: SeededRNG | undefined,
  onStompHaptic?: (slot: PlayerSlot) => void,
): void {
  const { killFeedEntries } = checkStomps(state.players, arena.spawnPoints, state.timeElapsed, settings.mods);

  if (killFeedEntries.length > 0 && !resimulating) {
    state.screenShake = SCREEN_SHAKE_DURATION;
    state.hitstopZoom = HITSTOP_DURATION;
  }

  for (const entry of killFeedEntries) {
    const attacker = state.players.find(p => p.id === entry.attacker);
    if (attacker) {
      attacker.hitstopTimer = Math.max(attacker.hitstopTimer, HITSTOP_DURATION);
      onStompHaptic?.(attacker.id);
      attacker.killStreak += 1;
      const aps = state.stats.perPlayer.get(attacker.id);
      if (aps && attacker.killStreak > aps.bestStreak) aps.bestStreak = attacker.killStreak;
    }
    const victim = state.players.find(p => p.id === entry.victim);
    if (victim) {
      victim.hitstopTimer = Math.max(victim.hitstopTimer, HITSTOP_DURATION);
      onStompHaptic?.(victim.id);
      if (attacker) {
        victim.damageFlashSide = attacker.x < victim.x ? 'left' : 'right';
      } else {
        victim.damageFlashSide = null;
      }
      victim.damageFlashTimer = 0.3;
      victim.killStreak = 0;
    }
  }
  if (killFeedEntries.length > 0) {
    state.killFeed.push(...killFeedEntries);
    state.totalKills += killFeedEntries.length;
    const excess = state.killFeed.length - 10;
    if (excess > 0) {
      state.killFeed.copyWithin(0, excess);
      state.killFeed.length = 10;
    }
  }

  collidePlayersHorizontal(state.players);
  // Re-resolve platform collisions after player-player pushes
  // (prevents getting shoved inside solid blocks like the mausoleum)
  for (const player of state.players) {
    if (!player.active || player.state === 'splat' || player.state === 'respawning') continue;
    collidePlatforms(player, arena.platforms);
  }
  updateSplatTimers(state.players, arena.spawnPoints, dt, rng);
}
