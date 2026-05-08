// Per-player SFX cooldowns. Lives at the engine top level (not under
// gameLoop/) so both the Simulator (Node-pure) and cosmetic systems can share
// the type without pulling browser-side audio modules into the import graph.
//
// Three independent named cooldowns per player. Each is a generic
// `Cooldowns<PlayerSlot>` from `cooldowns.ts`:
//   - `land`     — landing thump + waterfall splash share this slot
//   - `headbonk` — ceiling bonk
//   - `crouch`   — crouch start
//
// Decay convention (preserved from the legacy struct): the OWNING system
// (PlayerTransitionSystem) ticks each cooldown ONCE per frame in its
// per-player decay loop. All consume sites use `isReady(slot)` (read-only
// check, no decay) followed by `set(slot, T)` to schedule the next round.

import { Cooldowns } from './cooldowns';
import type { PlayerSlot } from './types';

export class PlayerSfxCooldowns {
  readonly land = new Cooldowns<PlayerSlot>();
  readonly headbonk = new Cooldowns<PlayerSlot>();
  readonly crouch = new Cooldowns<PlayerSlot>();

  /** Decay all three cooldowns for one slot by `dt`. Returns nothing — the
   *  consume sites use `isReady(slot)` to check readiness. Call this once
   *  per frame per player from the central decay site. */
  decay(slot: PlayerSlot, dt: number): void {
    this.land.tick(slot, dt);
    this.headbonk.tick(slot, dt);
    this.crouch.tick(slot, dt);
  }

  /** Reset all three cooldowns (full clear). */
  clear(): void {
    this.land.clear();
    this.headbonk.clear();
    this.crouch.clear();
  }
}
