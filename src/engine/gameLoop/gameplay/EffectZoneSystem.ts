import type { MatchState, Arena, Player, PlayerSlot } from '../../types';
import type { GameplaySystem } from '../types';
import type { ArenaEntitySystem } from './ArenaEntitySystem';
import type { SfxCooldowns } from '../cosmetics/sfx';
import { applyEffectZones, updateZeroGSound } from './effectZones';

export class EffectZoneSystem implements GameplaySystem {
  private state: MatchState;
  private arena: Arena;
  private arenaEntitySystem: ArenaEntitySystem;
  private sfxCooldownsGetter: () => Map<PlayerSlot, SfxCooldowns>;
  private playSound: (name: string) => void;
  private stopSound: (name: string) => void;
  private zeroGSoundPlaying = false;

  constructor(
    state: MatchState,
    arena: Arena,
    arenaEntitySystem: ArenaEntitySystem,
    sfxCooldownsGetter: () => Map<PlayerSlot, SfxCooldowns>,
    playSound: (name: string) => void,
    stopSound: (name: string) => void,
  ) {
    this.state = state;
    this.arena = arena;
    this.arenaEntitySystem = arenaEntitySystem;
    this.sfxCooldownsGetter = sfxCooldownsGetter;
    this.playSound = playSound;
    this.stopSound = stopSound;
  }

  init(): void {}

  applyToPlayer(
    player: Player,
    justLanded: boolean,
    wasAirborne: boolean,
    prevVy: number,
    dt: number,
  ): void {
    if (!this.arena.effectZones) return;
    applyEffectZones(
      player,
      this.arena.effectZones,
      this.arenaEntitySystem.getGeyserIndexMap(),
      this.state.geyserStates,
      justLanded,
      wasAirborne,
      prevVy,
      this.sfxCooldownsGetter(),
      this.playSound,
      dt,
    );
  }

  fixedUpdate(_dt: number): void {
    this.zeroGSoundPlaying = updateZeroGSound(
      this.state.players,
      this.arenaEntitySystem.getCachedZeroGZones(),
      this.zeroGSoundPlaying,
      this.playSound,
      this.stopSound,
    );
  }

  cleanup(): void {}
}
