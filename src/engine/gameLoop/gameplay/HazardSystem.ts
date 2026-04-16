import type { MatchState, Arena, Platform } from '../../types';
import type { GameplaySystem } from '../types';
import { SPRING_SPAWN_INTERVAL, THORN_SPAWN_INTERVAL } from '../../constants';
import { spawnSpring, spawnThorn, updateHazardLifetimes } from './hazards';

const f = Math.fround;

export class HazardSystem implements GameplaySystem {
  private state: MatchState;
  private arena: Arena;
  private gameRandom: () => number;
  floatingPlatforms: Array<{ plat: Platform; idx: number }> = [];

  constructor(state: MatchState, arena: Arena, gameRandom: () => number) {
    this.state = state;
    this.arena = arena;
    this.gameRandom = gameRandom;
  }

  init(): void {
    const noSpawn = this.arena.noSpawnZones ?? [];
    this.floatingPlatforms = this.arena.platforms
      .map((p, i) => ({ plat: p, idx: i }))
      .filter(({ plat }) => {
        if (plat.y >= 650) return false; // ground platforms
        // Exclude platforms inside no-spawn zones (e.g. mausoleum)
        const cx = plat.x + plat.width / 2;
        const cy = plat.y + plat.height / 2;
        for (const z of noSpawn) {
          if (cx >= z.x && cx <= z.x + z.width && cy >= z.y && cy <= z.y + z.height) return false;
        }
        return true;
      });
  }

  fixedUpdate(dt: number): void {
    // Hazard spawn timers (fround prevents cross-arch zero-crossing divergence → RNG desync)
    this.state.springSpawnTimer = f(this.state.springSpawnTimer - dt);
    if (this.state.springSpawnTimer <= 0) {
      spawnSpring(this.state, this.floatingPlatforms, this.arena.platforms, this.arena.noSprings, this.gameRandom);
      this.state.springSpawnTimer = SPRING_SPAWN_INTERVAL;
    }
    this.state.thornSpawnTimer = f(this.state.thornSpawnTimer - dt);
    if (this.state.thornSpawnTimer <= 0) {
      spawnThorn(this.state, this.floatingPlatforms, this.gameRandom);
      this.state.thornSpawnTimer = THORN_SPAWN_INTERVAL;
    }

    updateHazardLifetimes(this.state, dt);
  }

  cleanup(): void {}
}
