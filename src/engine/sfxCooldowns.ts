// Pure per-player SFX cooldown bookkeeping. Lives at the engine top level
// (not under gameLoop/) so both the Simulator (Node-pure) and cosmetic systems
// can share the type + helpers without pulling browser-side audio modules
// into the import graph.

import type { PlayerSlot } from './types';

/** Per-player SFX cooldown state. All values decay toward 0; sound plays when <= 0. */
export interface SfxCooldowns {
  land: number;
  headbonk: number;
  crouch: number;
}

export function getOrCreateCooldowns(
  map: Map<PlayerSlot, SfxCooldowns>,
  id: PlayerSlot,
): SfxCooldowns {
  let cd = map.get(id);
  if (!cd) {
    cd = { land: 0, headbonk: 0, crouch: 0 };
    map.set(id, cd);
  }
  return cd;
}

export function decaySfxCooldowns(
  sfxCooldowns: Map<PlayerSlot, SfxCooldowns>,
  playerId: PlayerSlot,
  dt: number,
): void {
  const cd = sfxCooldowns.get(playerId);
  if (!cd) return;
  if (cd.land > 0) cd.land -= dt;
  if (cd.headbonk > 0) cd.headbonk -= dt;
  if (cd.crouch > 0) cd.crouch -= dt;
}
