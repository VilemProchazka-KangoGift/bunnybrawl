import type { MatchState, MatchPhase, MatchSettings, Arena, PlayerSlot, InputState } from '../types';
import type { SeededRNG } from '../net/prng';
import type { HazardHitResult } from '../gameLoop/gameplay/playerCollisions';

/**
 * Narrow surface for VFX emission used by gameplay systems and the simulator.
 * Gameplay code depends on this interface so it can be reused by headless
 * runners with a no-op emitter, or by the browser via ParticleSystem (which
 * implements it).
 *
 * Only includes calls actually made from gameplay code — keeps the coupling
 * tight. Add to this interface only when a gameplay system needs a new VFX
 * call.
 */
export interface ParticleEmitter {
  emitParticle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string): void;
  spawnCarrotVFX(x: number, y: number): void;
  applyHazardHitVFX(hit: HazardHitResult, playerId: PlayerSlot, state: MatchState, resimulating: boolean): void;
}

/**
 * Touch input adapter shape. Lives here (instead of importing TouchInputManager)
 * so the Simulator stays free of any DOM-touching module while still supporting
 * the local touch player override path.
 */
export interface TouchInputProvider {
  getInputForPlayer(airborne: boolean): InputState;
}

/**
 * Side-effect requests emitted by the Simulator. Adapters subscribe and decide
 * what to do — browser adapter plays sound, headless runner records or ignores.
 *
 * The Simulator MUST NOT import audio, renderer, or any browser API directly.
 * Anything observable from the outside flows through this bag.
 */
export interface SimulatorEvents {
  /** A sound effect should play. Browser adapter calls audio.play(name). */
  onSfxRequest?: (name: string) => void;

  /** A character-bound sound (e.g. animal noise) should play. */
  onAnimalSfxRequest?: (name: string) => void;

  /** Arena music should start. Browser adapter calls audio.playMusic(themeId). */
  onMusicStartRequest?: (themeId: string) => void;

  /** Arena music should stop. */
  onMusicStopRequest?: () => void;

  /** A specific looping sound should stop (used by match cleanup for ambient loops). */
  onSoundStopRequest?: (name: string) => void;

  /** All game sounds should stop (match end, arena swap). */
  onAllGameSoundsStopRequest?: () => void;

  /** Match phase changed. */
  onPhaseChange?: (phase: MatchPhase) => void;

  /** Match has ended — winner slot or null for draw / all-disconnected. */
  onMatchEnd?: (winner: PlayerSlot | null, state: MatchState) => void;

  /** Player just landed after being airborne. Browser adapter triggers haptics. */
  onPlayerLanding?: (slot: PlayerSlot, prevVy: number) => void;
}

export interface SimulatorOptions {
  arena: Arena;
  settings: MatchSettings;
  activePlayers: PlayerSlot[];
  /** Optional seeded PRNG. Without it, simulator falls back to Math.random (non-deterministic). */
  rng?: SeededRNG;
  /** Side-effect subscriptions. All callbacks are optional. */
  events?: SimulatorEvents;
  /** Particle/VFX emitter. Headless runners pass a no-op; browser passes ParticleSystem. */
  particleEmitter?: ParticleEmitter;
}
